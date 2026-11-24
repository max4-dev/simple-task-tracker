import type { ComponentPropsWithoutRef } from "react";

export type RegisterFormProps = Omit<ComponentPropsWithoutRef<"form">, "onSubmit" | "children">;
