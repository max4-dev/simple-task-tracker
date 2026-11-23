export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
} as const;

export const API_ROUTES = {
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    REFRESH_TOKEN: "/auth/refresh-token",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
  },
  USERS: {
    PASSWORD: "/users/password",
  },
} as const;
