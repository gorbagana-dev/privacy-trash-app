"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createWalletOptions,
  normalizeWalletError,
  shouldStartWalletConnection,
  type WalletOption,
} from "@/features/wallet/logic/wallet-options";

export function useWalletConnection() {
  const {
    connect,
    connected,
    connecting,
    disconnect,
    disconnecting,
    publicKey,
    select,
    wallet,
    wallets,
  } = useWallet();
  const [walletModalOpen, setWalletModalOpenState] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [pendingWalletName, setPendingWalletName] =
    useState<WalletName | null>(null);
  const connectionRequestInFlight = useRef(false);

  const setWalletModalOpen = useCallback((open: boolean) => {
    setWalletModalOpenState(open);

    if (open) {
      setConnectionError(null);
      return;
    }

    setPendingWalletName(null);
  }, []);

  const openWalletModal = useCallback(() => {
    setWalletModalOpen(true);
  }, [setWalletModalOpen]);

  const closeWalletModal = useCallback(() => {
    setWalletModalOpen(false);
  }, [setWalletModalOpen]);

  const walletOptions = useMemo<WalletOption[]>(
    () =>
      createWalletOptions({
        activeWalletName: wallet?.adapter.name ?? null,
        connecting,
        pendingWalletName,
        wallets,
      }),
    [connecting, pendingWalletName, wallet?.adapter.name, wallets],
  );

  const connectPendingWallet = useCallback(
    async () => {
      if (connectionRequestInFlight.current) {
        return;
      }

      connectionRequestInFlight.current = true;

      try {
        await connect();
        setConnectionError(null);
        setPendingWalletName(null);
        setWalletModalOpenState(false);
      } catch (error) {
        setConnectionError(normalizeWalletError(error, "Could not connect wallet."));
        setPendingWalletName(null);
      } finally {
        connectionRequestInFlight.current = false;
      }
    },
    [connect],
  );

  const selectWallet = useCallback(
    (selectedWallet: WalletOption) => {
      setConnectionError(null);

      if (selectedWallet.readyState === WalletReadyState.Unsupported) {
        setConnectionError("This wallet is not supported.");
        return;
      }

      if (selectedWallet.readyState === WalletReadyState.NotDetected) {
        window.open(selectedWallet.installUrl, "_blank", "noopener,noreferrer");
        return;
      }

      setPendingWalletName(selectedWallet.name);
      select(selectedWallet.name);

      if (
        shouldStartWalletConnection({
          activeWalletName: wallet?.adapter.name ?? null,
          connected,
          connecting,
          pendingWalletName: selectedWallet.name,
        })
      ) {
        void connectPendingWallet();
      }
    },
    [connectPendingWallet, connected, connecting, select, wallet?.adapter.name],
  );

  const disconnectWallet = useCallback(async () => {
    setDisconnectError(null);

    try {
      await disconnect();
    } catch (error) {
      setDisconnectError(
        normalizeWalletError(error, "Could not disconnect wallet."),
      );
    }
  }, [disconnect]);

  useEffect(() => {
    if (!walletModalOpen) {
      return;
    }

    if (
      !shouldStartWalletConnection({
        activeWalletName: wallet?.adapter.name ?? null,
        connected,
        connecting,
        pendingWalletName,
      })
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void connectPendingWallet();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    connectPendingWallet,
    connected,
    connecting,
    pendingWalletName,
    wallet,
    walletModalOpen,
  ]);

  return {
    closeWalletModal,
    connectionError,
    disconnectError,
    disconnectWallet,
    isConnected: connected,
    isConnecting: connecting,
    isDisconnecting: disconnecting,
    openWalletModal,
    publicKey,
    selectWallet,
    setWalletModalOpen,
    walletModalOpen,
    walletName: wallet?.adapter.name ?? null,
    walletOptions,
  };
}
