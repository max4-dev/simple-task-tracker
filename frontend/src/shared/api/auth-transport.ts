import { API_ROUTES } from "../config/index.ts";
import ky, { type KyInstance } from "ky";
import { assertDestination } from "./transport.ts";
import type { BrowserSession, SessionStamp } from "./session.ts";

const SESSION_ENDPOINTS = new Set<string>([API_ROUTES.AUTH.LOGIN, API_ROUTES.AUTH.REGISTER, API_ROUTES.AUTH.REFRESH_TOKEN]);

export class AuthInterceptor {
  readonly api: KyInstance;
  private readonly origin: string;
  private readonly session: BrowserSession;
  private readonly send: typeof fetch;
  private readonly pending = new Map<SessionStamp, Promise<Response | undefined>>();

  constructor(origin: string, session: BrowserSession, send: typeof fetch) {
    this.origin = origin;
    this.session = session;
    this.send = send;
    this.api = ky.create({
      baseUrl: origin,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      retry: 0,
      timeout: 30_000,
      fetch: this.fetch,
    });
  }

  private readonly fetch = async (input: Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    assertDestination(request, this.origin);
    if (request.credentials !== "include" || request.headers.has("authorization")) {
      throw new TypeError("Authenticated requests require cookie credentials");
    }

    const stamp = this.session.current;
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (request.method === "POST" && SESSION_ENDPOINTS.has(path)) {
      return this.session.runExclusive(() => this.updateSession(request, path, stamp));
    }
    const endsSession = (request.method === "POST" && path === API_ROUTES.AUTH.LOGOUT) ||
      (request.method === "PUT" && path === API_ROUTES.USERS.PASSWORD);
    if (endsSession) {
      return this.session.runExclusive(async () => {
        const response = await this.sendProtected(request, stamp, () => this.refresh(stamp));
        if (response.ok) this.session.changeIdentity();
        return response;
      });
    }
    return this.sendProtected(request, stamp, () => this.getOrStartRefresh(stamp));
  };

  private async updateSession(request: Request, path: string, stamp: SessionStamp) {
    this.checkSession(request, stamp);
    const response = await this.send(request);
    if (path === API_ROUTES.AUTH.REFRESH_TOKEN) this.handleRefreshResponse(response);
    else if (response.ok) this.session.changeIdentity();
    return response;
  }

  private async sendProtected(request: Request, stamp: SessionStamp, recover: () => Promise<Response | undefined>) {
    this.checkSession(request, stamp);
    const replay = request.clone();
    try {
      let response = await this.send(request);
      if (response.status === 401 && this.session.current.identity === stamp.identity) {
        void response.body?.cancel();
        const failure = await recover();
        if (failure) return failure.clone();
        this.checkSession(request, stamp);
        response = await this.send(replay);
      }
      if (response.ok) this.checkSession(request, stamp);
      return response;
    } finally {
      if (!replay.bodyUsed) void replay.body?.cancel();
    }
  }

  private checkSession(request: Request, stamp: SessionStamp) {
    request.signal.throwIfAborted();
    if (this.session.current.identity !== stamp.identity) {
      throw new DOMException("Session changed", "AbortError");
    }
  }

  private getOrStartRefresh(stamp: SessionStamp) {
    const existing = this.pending.get(stamp);
    if (existing) return existing;
    const flight = this.session.runExclusive(() => this.refresh(stamp)).finally(() => this.pending.delete(stamp));
    this.pending.set(stamp, flight);
    return flight;
  }

  private async refresh(stamp: SessionStamp) {
    const current = this.session.current;
    if (current.identity !== stamp.identity) return new Response(null, { status: 401 });
    if (current.rotation !== stamp.rotation) return;
    const response = await this.send(new Request(new URL(API_ROUTES.AUTH.REFRESH_TOKEN, this.origin), {
      method: "POST",
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }));
    this.handleRefreshResponse(response);
    if (!response.ok) return response;
    void response.body?.cancel();
  }

  private handleRefreshResponse(response: Response) {
    if (response.ok) this.session.rotate();
    else if (response.status === 401) this.session.changeIdentity();
  }
}
