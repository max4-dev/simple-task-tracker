export function assertDestination(request: Request, origin: string) {
  if (new URL(request.url).origin !== origin || request.redirect !== "error") {
    throw new TypeError("API requests must stay on the configured origin");
  }
}
