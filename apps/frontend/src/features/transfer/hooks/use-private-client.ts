"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback } from "react";

import { createFrontendPrivateClient } from "@/features/transfer/logic/private-client";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

export function usePrivateClient() {
  const { connected, publicKey, signTransaction } = useWallet();

  const createClient = useCallback(
    async (privacyIdentity: PrivacyIdentity) => {
      if (!connected || !publicKey) {
        throw new Error("Connect your wallet first.");
      }

      const walletAddress = publicKey.toBase58();
      if (walletAddress !== privacyIdentity.walletAddress) {
        throw new Error("Wallet changed. Reconnect the original wallet and try again.");
      }

      if (!signTransaction) {
        throw new Error("This wallet cannot sign transactions.");
      }

      return await createFrontendPrivateClient({
        privacyIdentity,
        signTransaction,
      });
    },
    [connected, publicKey, signTransaction],
  );

  return { createClient };
}
