import { authenticatedApiClient } from "@/shared/api";
import { authApi } from "./auth.api";
import type {
  LoginPayload,
  LogoutResponse,
  MeResponse,
  RegisterPayload,
  Session,
} from "./types/auth.types";

export const authQuery = {
  login: (payload: LoginPayload) =>
    authenticatedApiClient.post(authApi.login, { json: payload }).json<Session>(),
  register: (payload: RegisterPayload) =>
    authenticatedApiClient.post(authApi.register, { json: payload }).json<Session>(),
  me: () =>
    authenticatedApiClient.get(authApi.me).json<MeResponse>(),
  logout: () =>
    authenticatedApiClient.post(authApi.logout).json<LogoutResponse>(),
  refreshToken: () =>
    authenticatedApiClient.post(authApi.refreshToken).json<Session>(),
};
