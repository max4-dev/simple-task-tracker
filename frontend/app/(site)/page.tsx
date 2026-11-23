import type { Metadata } from "next";
import { HomePage } from "@/pages/home/ui/home-page";

export const metadata: Metadata = { title: "Компоненты" };

export default function Home() {
  return <HomePage />;
}
