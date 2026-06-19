import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";

const readyStateRank: Record<WalletReadyState, number> = {
  [WalletReadyState.Installed]: 0,
  [WalletReadyState.Loadable]: 1,
  [WalletReadyState.NotDetected]: 2,
  [WalletReadyState.Unsupported]: 3,
};

export type WalletOption = {
  actionLabel: string;
  canConnect: boolean;
  disabled: boolean;
  icon: string;
  installUrl: string;
  isPending: boolean;
  label: string;
  name: WalletName;
  readyState: WalletReadyState;
  statusLabel: string;
};

type CreateWalletOptionsInput = {
  activeWalletName: WalletName | null;
  connecting: boolean;
  pendingWalletName: WalletName | null;
  wallets: readonly Wallet[];
};

export type ShouldStartWalletConnectionInput = {
  activeWalletName: WalletName | null;
  connected: boolean;
  connecting: boolean;
  pendingWalletName: WalletName | null;
};

function canConnectWallet(wallet: Wallet) {
  return (
    wallet.readyState === WalletReadyState.Installed ||
    wallet.readyState === WalletReadyState.Loadable
  );
}

function getReadyStateLabel(wallet: Wallet) {
  if (wallet.readyState === WalletReadyState.Installed) {
    return "Detected";
  }

  if (wallet.readyState === WalletReadyState.Loadable) {
    return "Available";
  }

  if (wallet.readyState === WalletReadyState.NotDetected) {
    return "Install";
  }

  return "Unsupported";
}

function sortWallets(left: Wallet, right: Wallet) {
  const readiness =
    readyStateRank[left.readyState] - readyStateRank[right.readyState];

  if (readiness !== 0) {
    return readiness;
  }

  return String(left.adapter.name).localeCompare(String(right.adapter.name));
}

export function createWalletOptions({
  activeWalletName,
  connecting,
  pendingWalletName,
  wallets,
}: CreateWalletOptionsInput): WalletOption[] {
  return [...wallets].sort(sortWallets).map((availableWallet) => {
    const isPending =
      pendingWalletName === availableWallet.adapter.name ||
      (activeWalletName === availableWallet.adapter.name && connecting);

    return {
      actionLabel:
        availableWallet.readyState === WalletReadyState.NotDetected
          ? "Install"
          : "Select",
      canConnect: canConnectWallet(availableWallet),
      disabled:
        availableWallet.readyState === WalletReadyState.Unsupported ||
        connecting,
      icon: availableWallet.adapter.icon,
      installUrl: availableWallet.adapter.url,
      isPending,
      label: String(availableWallet.adapter.name),
      name: availableWallet.adapter.name,
      readyState: availableWallet.readyState,
      statusLabel: isPending ? "Connecting" : getReadyStateLabel(availableWallet),
    };
  });
}

export function shouldStartWalletConnection({
  activeWalletName,
  connected,
  connecting,
  pendingWalletName,
}: ShouldStartWalletConnectionInput) {
  return (
    pendingWalletName !== null &&
    activeWalletName === pendingWalletName &&
    !connected &&
    !connecting
  );
}

export function normalizeWalletError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("reject")) {
    return "Request rejected.";
  }

  return error.message || fallback;
}
