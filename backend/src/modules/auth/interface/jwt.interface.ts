export interface IJWTPayload {
  id: string;
  tokenVersion: number;
  kind: 'access' | 'refresh';
}
export interface AuthenticatedUser {
  id: string;
  role: string;
  tokenVersion: number;
}
export function isJwtPayload(value: unknown): value is IJWTPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<IJWTPayload>;
  return (
    typeof payload.id === 'string' &&
    Number.isSafeInteger(payload.tokenVersion) &&
    payload.tokenVersion >= 0 &&
    (payload.kind === 'access' || payload.kind === 'refresh')
  );
}
