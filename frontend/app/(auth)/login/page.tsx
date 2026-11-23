import type { Metadata } from "next";
import { LoginPage } from "@/pages/auth";

export const metadata: Metadata = {
  title: "Вход",
};

export default function Login() {
  return <LoginPage />;
}
