"use client";

import type { ReactNode } from "react";

import { WalletProvider } from "@/providers/wallet-provider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return <WalletProvider>{children}</WalletProvider>;
}
