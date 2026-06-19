"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatPrivateBalance,
  scanPrivateBalance,
} from "@/features/transfer/logic/private-balance";
import { useWalletConnection } from "@/features/wallet/hooks/use-wallet-connection";
import { usePrivacyIdentity } from "@/features/wallet/hooks/use-privacy-identity";

type PrivateBalanceState =
  | {
      status: "idle" | "loading" | "unavailable";
      lamports: null;
    }
  | {
      status: "ready";
      lamports: bigint;
    };

export type UsePrivateBalanceInput = {
  refreshKey?: string | null | undefined;
};

export function usePrivateBalance(input: UsePrivateBalanceInput = {}) {
  const walletConnection = useWalletConnection();
  const { canSignMessage, getPrivacyIdentity } = usePrivacyIdentity();
  const [state, setState] = useState<PrivateBalanceState>({
    lamports: null,
    status: "idle",
  });
  const walletAddress = walletConnection.publicKey?.toBase58() ?? null;
  const canLoadBalance = Boolean(
    walletConnection.isConnected && walletAddress && canSignMessage,
  );

  useEffect(() => {
    if (!canLoadBalance || !walletAddress) {
      return;
    }

    let cancelled = false;

    async function loadBalance() {
      setState({
        lamports: null,
        status: "loading",
      });

      try {
        const identity = await getPrivacyIdentity();
        if (identity.walletAddress !== walletAddress) {
          throw new Error("Wallet changed.");
        }

        const notes = await scanPrivateBalance({ identity });
        if (!cancelled) {
          setState({
            lamports: notes.privateBalanceLamports,
            status: "ready",
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            lamports: null,
            status: "unavailable",
          });
        }
      }
    }

    void loadBalance();

    return () => {
      cancelled = true;
    };
  }, [
    canSignMessage,
    canLoadBalance,
    getPrivacyIdentity,
    input.refreshKey,
    walletAddress,
  ]);

  const effectiveStatus =
    walletConnection.isConnected && !canLoadBalance
      ? "unavailable"
      : canLoadBalance
        ? state.status
        : "idle";

  const displayValue = useMemo(() => {
    if (effectiveStatus === "loading") {
      return "...";
    }

    if (effectiveStatus !== "ready" || state.status !== "ready") {
      return "--";
    }

    return `${formatPrivateBalance(state.lamports)} GOR`;
  }, [effectiveStatus, state]);

  return {
    displayValue,
    status: effectiveStatus,
  };
}
