import { BRANDING } from "@/shared/config";
import { QueryProvider, StylesProvider } from "@/app/providers";
import { Toaster, TooltipProvider } from "@/shared/ui";
import { cn } from "cn";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: BRANDING.NAME, template: `%s — ${BRANDING.NAME}` },
  applicationName: BRANDING.NAME,
  description: BRANDING.DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        <StylesProvider>
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </QueryProvider>
        </StylesProvider>
      </body>
    </html>
  );
}
