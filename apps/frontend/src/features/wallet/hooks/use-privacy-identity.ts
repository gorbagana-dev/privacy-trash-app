"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useMemo } from "react";

import { env } from "@/config/env";
import {
  createSessionPrivacyIdentityCache,
  getOrCreatePrivacyIdentity,
  PrivacyIdentityError,
} from "@/features/wallet/logic/privacy-identity";

export function usePrivacyIdentity() {
  const { connected, publicKey, signMessage } = useWallet();
  const cache = useMemo(() => createSessionPrivacyIdentityCache(), []);

  const getPrivacyIdentity = useCallback(async () => {
    if (!connected || !publicKey) {
      throw new PrivacyIdentityError(
        "wallet_not_connected",
        "Connect your wallet first.",
      );
    }

    if (!signMessage) {
      throw new PrivacyIdentityError(
        "message_signing_unsupported",
        "This wallet cannot sign messages.",
      );
    }

    return await getOrCreatePrivacyIdentity({
      cache,
      programAddress: env.privacyTrashProgramAddress,
      signMessage,
      walletAddress: publicKey.toBase58(),
    });
  }, [cache, connected, publicKey, signMessage]);

  return {
    canSignMessage: Boolean(signMessage),
    getPrivacyIdentity,
  };
}
