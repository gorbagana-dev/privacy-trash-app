"use client";

import type { Adapter, WalletError } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import { env } from "@/config/env";

type WalletProviderProps = {
  children: ReactNode;
};

export function WalletProvider({ children }: WalletProviderProps) {
  const wallets = useMemo(() => [], []);

  const handleWalletError = useCallback(
    (error: WalletError, adapter?: Adapter) => {
      console.error("Wallet error", {
        adapter: adapter?.name,
        message: error.message,
        name: error.name,
      });
    },
    [],
  );

  return (
    <ConnectionProvider
      endpoint={env.gorbaganaRpcUrl}
      config={{ commitment: "confirmed" }}
    >
      <SolanaWalletProvider
        wallets={wallets}
        autoConnect={false}
        localStorageKey="privacy-trash-wallet"
        onError={handleWalletError}
      >
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
