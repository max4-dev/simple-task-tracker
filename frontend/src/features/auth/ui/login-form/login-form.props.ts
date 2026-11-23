import type { ComponentPropsWithoutRef } from "react";

export type LoginFormProps = Omit<ComponentPropsWithoutRef<"form">, "onSubmit" | "children">;
