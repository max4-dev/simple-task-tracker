"use client";

import { AuthInterceptor } from "./auth-transport.ts";
import { BrowserSession } from "./session.ts";
import { CONFIG } from "../config/index.ts";

const origin = CONFIG.API_URL;
const browserSession = new BrowserSession(origin);
export const authenticatedApiClient = new AuthInterceptor(origin, browserSession, (request, init) => {
  if (typeof window === "undefined") throw new Error("Cookie authentication requires a browser");
  return fetch(request, init);
}).api;

export function subscribeToSessionChanges(listener: () => void) {
  return browserSession.subscribe(listener);
}
