"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { subscribeToSessionChanges } from "@/shared/api";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

export function QueryProvider({ children }: { children: ReactNode }) {
  const client = typeof window === "undefined" ? createClient() : (browserClient ??= createClient());
  useEffect(() => subscribeToSessionChanges(() => client.clear()), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
