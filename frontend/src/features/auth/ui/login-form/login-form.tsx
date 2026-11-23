"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HTTPError } from "ky";
import { cn } from "cn";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ROUTES } from "@/shared/config";
import { Button, Input, Label, toast } from "@/shared/ui";
import { login } from "../../api/login";
import { loginSchema, type LoginValues } from "../../model/login.schema";
import styles from "./login-form.module.css";
import type { LoginFormProps } from "./login-form.props";

export function LoginForm({ className, ...props }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function submit(values: LoginValues) {
    clearErrors("root");
    try {
      await login(values);
      toast.add({ title: "Вы вошли в аккаунт", type: "success" });
      router.replace(ROUTES.HOME);
      router.refresh();
    } catch (error) {
      let message = "Не удалось войти. Проверьте подключение и попробуйте ещё раз.";
      if (error instanceof HTTPError) {
        if ([400, 401].includes(error.response.status)) message = "Неверная почта или пароль.";
        else if (error.response.status === 429) message = "Слишком много попыток. Попробуйте войти чуть позже.";
        else message = "Сервис временно недоступен. Попробуйте ещё раз позже.";
      }
      setError("root", { message });
      toast.add({ title: "Не удалось войти", description: message, type: "error" });
    }
  }

  return (
    <form {...props} className={cn(styles.form, className)} onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting}>
      <fieldset className={styles.fields} disabled={isSubmitting}>
        <div className={styles.field}>
          <Label htmlFor="login-email">Почта</Label>
          <Input id="login-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="you@company.com" className={styles.input} aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "login-email-error" : undefined} {...register("email")} />
          {errors.email && <p id="login-email-error" className={styles.error} role="alert">{errors.email.message}</p>}
        </div>
        <div className={styles.field}>
          <Label htmlFor="login-password">Пароль</Label>
          <div className={styles.password}>
            <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
              placeholder="Введите пароль" className={styles.input} aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "login-password-error" : undefined} {...register("password")} />
            <button type="button" className={styles.reveal} onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
          {errors.password && <p id="login-password-error" className={styles.error} role="alert">{errors.password.message}</p>}
        </div>
        {errors.root && <p className={styles.notice} role="alert">{errors.root.message}</p>}
        <Button type="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? <><LoaderCircle className={styles.spinner} aria-hidden />Входим…</> : <>Войти<ArrowRight size={18} aria-hidden /></>}
        </Button>
      </fieldset>
    </form>
  );
}
