import { API_ROUTES } from "@/shared/config";

export const authApi = {
  login: API_ROUTES.AUTH.LOGIN,
  register: API_ROUTES.AUTH.REGISTER,
  me: API_ROUTES.AUTH.ME,
  logout: API_ROUTES.AUTH.LOGOUT,
  refreshToken: API_ROUTES.AUTH.REFRESH_TOKEN,
} as const;
