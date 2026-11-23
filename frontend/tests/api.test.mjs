import assert from "node:assert/strict";
import test from "node:test";
import { AuthInterceptor } from "../src/shared/api/auth-transport.ts";
import { anonymousApiClient, authenticatedApiClient } from "../src/shared/api/index.ts";
import { BrowserSession } from "../src/shared/api/session.ts";

const TEST_API_ORIGIN = "https://api.example.test";
const REFRESH_TOKEN_PATH = "/auth/refresh-token";
const getRequestPath = request => new URL(request.url).pathname;

function setup(send) {
  const session = new BrowserSession(TEST_API_ORIGIN);
  return { api: new AuthInterceptor(TEST_API_ORIGIN, session, send).api, session };
}

test("concurrent unauthorized reads and writes share one refresh and replay their original payload", async () => {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  let refreshes = 0;
  const posts = [];
  let reads = 0;
  const { api, session } = setup(async request => {
    assert.equal(request.credentials, "include");
    assert.equal(request.redirect, "error");
    if (getRequestPath(request) === REFRESH_TOKEN_PATH) {
      assert.equal(request.method, "POST");
      refreshes++;
      await release.promise;
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST") posts.push([await request.json(), request.headers.get("x-request-id")]);
    else reads++;
    if (reads + posts.length === 2) started.resolve();
    return new Response(null, { status: session.current.rotation ? 200 : 401 });
  });
  const complete = Promise.all([
    api.get("auth/me"),
    api.post("tasks", { json: { title: "task" }, headers: { "x-request-id": "123" } }),
  ]);
  await started.promise;
  release.resolve();
  await complete;
  assert.equal(refreshes, 1);
  assert.equal(reads, 2);
  assert.deepEqual(posts, Array(2).fill([{ title: "task" }, "123"]));
});

for (const status of [401, 429, 503]) {
  test(`refresh ${status} reaches all waiting callers without replay`, async () => {
    let attempts = 0;
    let refreshes = 0;
    const { api, session } = setup(async request => {
      if (getRequestPath(request) !== REFRESH_TOKEN_PATH) {
        attempts++;
        return new Response(null, { status: 401 });
      }
      refreshes++;
      await new Promise(resolve => setImmediate(resolve));
      return Response.json({ error: "refresh" }, { status });
    });
    const responses = await Promise.all(Array.from({ length: 4 }, () => api.get("tasks", { throwHttpErrors: false })));
    for (const response of responses) {
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: "refresh" });
    }
    assert.equal(attempts, 4);
    assert.equal(refreshes, 1);
    assert.equal(session.current.identity, status === 401 ? 1 : 0);
  });
}

test("a second 401 ends recovery and a write returning 503 is never replayed", async () => {
  const calls = [];
  const { api } = setup(async request => {
    calls.push(getRequestPath(request));
    const status = getRequestPath(request) === REFRESH_TOKEN_PATH ? 204 : request.method === "POST" ? 503 : 401;
    return new Response(null, { status });
  });
  await assert.rejects(api.get("auth/me"), e => e.response.status === 401);
  await assert.rejects(api.post("tasks"), e => e.response.status === 503);
  assert.deepEqual(calls, ["/auth/me", REFRESH_TOKEN_PATH, "/auth/me", "/tasks"]);
});

test("cancelling one query leaves shared refresh and other queries intact", async () => {
  const controller = new AbortController();
  const refreshing = Promise.withResolvers();
  const release = Promise.withResolvers();
  const { api, session } = setup(async request => {
    if (getRequestPath(request) === REFRESH_TOKEN_PATH) {
      refreshing.resolve();
      await release.promise;
      assert.equal(request.signal.aborted, false);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: session.current.rotation ? 200 : 401 });
  });
  const cancelled = assert.rejects(api.get("tasks", { signal: controller.signal }), { name: "AbortError" });
  const other = api.get("auth/me");
  await refreshing.promise;
  controller.abort();
  release.resolve();
  await cancelled;
  assert.equal((await other).status, 200);
});

test("auth endpoints never recursively refresh; login and logout change the cache identity", async () => {
  for (const path of ["auth/login", "auth/register", "auth/refresh-token"]) {
    let calls = 0;
    const { api } = setup(async () => { calls++; return new Response(null, { status: 401 }); });
    await assert.rejects(api.post(path), e => e.response.status === 401);
    assert.equal(calls, 1);
  }
  const { api, session } = setup(async () => new Response(null, { status: 204 }));
  await api.post("auth/login");
  await api.post("auth/logout");
  assert.equal(session.current.identity, 2);
});

test("an in-flight request cannot replay under a newly logged-in user", async () => {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const { api } = setup(async request => {
    if (getRequestPath(request) === "/auth/login") return new Response(null, { status: 204 });
    assert.equal(getRequestPath(request), "/tasks");
    started.resolve();
    await release.promise;
    return new Response(null, { status: 401 });
  });
  const result = api.post("tasks", { throwHttpErrors: false });
  await started.promise;
  await api.post("auth/login");
  release.resolve();
  assert.equal((await result).status, 401);
});

test("the authenticated public client rejects requests outside a browser", async () => {
  await assert.rejects(authenticatedApiClient.get("auth/me"), /requires a browser/);
});

test("anonymous server requests omit credentials and reject credential forwarding and external origins", async () => {
  const api = anonymousApiClient;
  let calls = 0;
  const send = async request => {
    calls++;
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
    assert.equal(request.cache, "no-store");
    return new Response();
  };
  await api.get("health/live", { fetch: send });
  for (const options of [{ credentials: "include" }, { headers: { cookie: "x" } }, { headers: { authorization: "x" } }, { redirect: "follow" }]) {
    await assert.rejects(api.get("health/live", { ...options, fetch: send }), TypeError);
  }
  await assert.rejects(api.get("https://other.example.test", { fetch: send }), TypeError);
  assert.equal(calls, 1);
  const { api: browser } = setup(async () => assert.fail("unexpected fetch"));
  await assert.rejects(browser.get("https://other.example.test"), /configured origin/);
});

test("anonymousApiClient uses the browser origin in the browser and the internal origin on the server", async t => {
  const previous = { public: process.env.NEXT_PUBLIC_API_ORIGIN, internal: process.env.API_SERVER_ORIGIN };
  t.after(() => {
    for (const [key, value] of [["NEXT_PUBLIC_API_ORIGIN", previous.public], ["API_SERVER_ORIGIN", previous.internal]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.window;
  });
  process.env.NEXT_PUBLIC_API_ORIGIN = TEST_API_ORIGIN;
  process.env.API_SERVER_ORIGIN = "http://backend:3001";
  const urls = [];
  const send = async request => {
    assert.equal(request.credentials, "omit");
    urls.push(request.url);
    return new Response(null, { status: 204 });
  };
  await anonymousApiClient.get("health/live", { fetch: send });
  globalThis.window = { location: { origin: "https://app.example.test" } };
  await anonymousApiClient.get("health/live", { fetch: send });
  assert.deepEqual(urls, ["http://backend:3001/health/live", TEST_API_ORIGIN + "/health/live"]);
});

test("tabs share session changes in memory and only identity changes clear subscribers", async t => {
  const channels = [];
  class TabChannel extends BroadcastChannel {
    constructor(name) {
      super(name);
      channels.push(this);
    }
  }
  globalThis.window = { navigator: {}, BroadcastChannel: TabChannel };
  t.after(() => { for (const channel of channels) channel.close(); delete globalThis.window; });
  const first = new BrowserSession(TEST_API_ORIGIN);
  const second = new BrowserSession(TEST_API_ORIGIN);
  let changes = 0;
  const unsubscribe = second.subscribe(() => { changes++; });

  async function deliver(action) {
    const received = new Promise(resolve => channels[1].addEventListener("message", resolve, { once: true }));
    action();
    return (await received).data;
  }
  assert.equal(await deliver(() => first.rotate()), "rotation");
  assert.equal(second.current.rotation, 1);
  assert.equal(changes, 0);
  assert.equal(await deliver(() => first.changeIdentity()), "identity");
  assert.equal(second.current.identity, 1);
  assert.equal(changes, 1);
  unsubscribe();
  await deliver(() => first.changeIdentity());
  assert.equal(changes, 1);
});
