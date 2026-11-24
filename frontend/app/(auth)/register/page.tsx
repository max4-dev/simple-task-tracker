import type { Metadata } from "next";
import { RegisterPage } from "@/pages/auth";

export const metadata: Metadata = {
  title: "Регистрация",
};

export default function Register() {
  return <RegisterPage />;
}
