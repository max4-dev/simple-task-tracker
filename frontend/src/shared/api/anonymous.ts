import ky from "ky";
import { CONFIG } from "../config/index.ts";
import { assertDestination } from "./transport.ts";

function getAnonymousApiOrigin() {
  return typeof window === "undefined" ? CONFIG.SERVER_API_URL : CONFIG.API_URL;
}

const CREDENTIAL_HEADERS = ["cookie", "authorization", "proxy-authorization"];

export const anonymousApiClient = ky.create({
  credentials: "omit",
  redirect: "error",
  cache: "no-store",
  retry: 0,
  timeout: 15_000,
  hooks: {
    init: [(options) => { options.baseUrl = getAnonymousApiOrigin(); }],
    beforeRequest: [({ request }) => {
      assertDestination(request, getAnonymousApiOrigin());
      if (request.credentials !== "omit" || CREDENTIAL_HEADERS.some(header => request.headers.has(header))) {
        throw new TypeError("Anonymous requests cannot include credentials");
      }
    }],
  },
});
