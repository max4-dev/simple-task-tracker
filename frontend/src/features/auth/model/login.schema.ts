import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase()
    .min(1, "Введите почту")
    .max(254, "Почта слишком длинная")
    .email("Введите корректный адрес почты"),
  password: z.string()
    .min(1, "Введите пароль")
    .max(128, "Пароль должен содержать не больше 128 символов"),
});

export type LoginValues = z.infer<typeof loginSchema>;
