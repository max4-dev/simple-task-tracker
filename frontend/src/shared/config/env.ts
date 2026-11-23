const LOCAL_API_URL = "http://localhost:3001";

export type EnvConfig = {
  readonly IS_PRODUCTION: boolean;
  readonly API_URL: string;
  readonly SERVER_API_URL: string;
};

function validateApiUrl(value: string | undefined) {
  if (!value) throw new Error("Set API_SERVER_ORIGIN or NEXT_PUBLIC_API_ORIGIN for the API");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.href !== `${url.origin}/`) {
    throw new Error("Configure the API with an HTTP(S) origin without credentials, path or query");
  }
  return url.origin;
}

// Getters preserve runtime server configuration and the browser's current origin.
export const CONFIG: EnvConfig = {
  get IS_PRODUCTION() {
    return process.env.NODE_ENV === "production";
  },
  get API_URL() {
    const fallback = typeof window !== "undefined" && CONFIG.IS_PRODUCTION
      ? window.location.origin
      : LOCAL_API_URL;
    return validateApiUrl(process.env.NEXT_PUBLIC_API_ORIGIN || fallback);
  },
  get SERVER_API_URL() {
    const fallback = CONFIG.IS_PRODUCTION ? undefined : LOCAL_API_URL;
    return validateApiUrl(process.env.API_SERVER_ORIGIN || process.env.NEXT_PUBLIC_API_ORIGIN || fallback);
  },
};
