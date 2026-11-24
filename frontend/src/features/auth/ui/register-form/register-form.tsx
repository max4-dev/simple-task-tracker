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
import { authQuery } from "../../api";
import { registerSchema, type RegisterValues } from "../../model";
import styles from "./register-form.module.css";
import type { RegisterFormProps } from "./register-form.props";

export function RegisterForm({ className, ...props }: RegisterFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const { register: field, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function submit(values: RegisterValues) {
    clearErrors("root");
    try {
      await authQuery.register(values);
      toast.add({ title: "Аккаунт создан", type: "success" });
      router.replace(ROUTES.HOME);
      router.refresh();
    } catch (error) {
      let message = "Не удалось создать аккаунт. Проверьте подключение и попробуйте ещё раз.";
      if (error instanceof HTTPError) {
        if (error.response.status === 409) message = "Эта почта уже используется.";
        else if (error.response.status === 429) message = "Слишком много попыток. Попробуйте чуть позже.";
        else message = "Сервис временно недоступен. Попробуйте ещё раз позже.";
      }
      setError("root", { message });
      toast.add({ title: "Не удалось создать аккаунт", description: message, type: "error" });
    }
  }

  return (
    <form {...props} className={cn(styles.form, className)} onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting}>
      <fieldset className={styles.fields} disabled={isSubmitting}>
        <div className={styles.field}>
          <Label htmlFor="register-name">Имя</Label>
          <Input id="register-name" type="text" autoComplete="name"
            placeholder="Как к вам обращаться" className={styles.input} aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "register-name-error" : undefined} {...field("name")} />
          {errors.name && <p id="register-name-error" className={styles.error} role="alert">{errors.name.message}</p>}
        </div>
        <div className={styles.field}>
          <Label htmlFor="register-email">Почта</Label>
          <Input id="register-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="you@company.com" className={styles.input} aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "register-email-error" : undefined} {...field("email")} />
          {errors.email && <p id="register-email-error" className={styles.error} role="alert">{errors.email.message}</p>}
        </div>
        <div className={styles.field}>
          <Label htmlFor="register-password">Пароль</Label>
          <div className={styles.password}>
            <Input id="register-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
              placeholder="Минимум 12 символов" className={styles.input} aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "register-password-error" : undefined} {...field("password")} />
            <button type="button" className={styles.reveal} onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
          {errors.password && <p id="register-password-error" className={styles.error} role="alert">{errors.password.message}</p>}
        </div>
        {errors.root && <p className={styles.notice} role="alert">{errors.root.message}</p>}
        <Button type="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? <><LoaderCircle className={styles.spinner} aria-hidden />Создаём…</> : <>Создать аккаунт<ArrowRight size={18} aria-hidden /></>}
        </Button>
      </fieldset>
    </form>
  );
}
