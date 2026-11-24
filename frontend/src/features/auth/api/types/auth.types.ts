export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type Session = {
  user: SessionUser;
  authenticated: boolean;
  code?: "SESSION_UNAVAILABLE";
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

export type MeResponse = {
  user: {
    id: string;
  };
};

export type LogoutResponse = {
  message: string;
};
