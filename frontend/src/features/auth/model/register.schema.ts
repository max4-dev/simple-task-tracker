import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim()
    .min(1, "Введите имя")
    .max(100, "Имя должно содержать не больше 100 символов"),
  email: z.string().trim().toLowerCase()
    .min(1, "Введите почту")
    .max(254, "Почта слишком длинная")
    .email("Введите корректный адрес почты"),
  password: z.string()
    .min(12, "Пароль должен содержать не меньше 12 символов")
    .max(128, "Пароль должен содержать не больше 128 символов"),
});

export type RegisterValues = z.infer<typeof registerSchema>;
