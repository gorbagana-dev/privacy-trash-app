"use client";

import { useWalletConnection } from "@/features/wallet/hooks/use-wallet-connection";
import { formatAddress } from "@/lib/address";

export function WalletSummary() {
  const walletConnection = useWalletConnection();

  if (!walletConnection.isConnected || !walletConnection.publicKey) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-xs font-medium text-zinc-500">Wallet</p>
          <p className="mt-1 truncate font-sans text-sm font-semibold text-white">
            {walletConnection.walletName ?? "Connected"} /{" "}
            {formatAddress(walletConnection.publicKey.toBase58())}
          </p>
        </div>

        <button
          type="button"
          disabled={walletConnection.isDisconnecting}
          className="shrink-0 cursor-pointer rounded-lg border border-white/[0.1] px-3 py-2 font-heading text-xs font-bold italic text-zinc-300 uppercase transition hover:border-red-300/35 hover:bg-red-300/[0.08] hover:text-red-200 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => void walletConnection.disconnectWallet()}
        >
          {walletConnection.isDisconnecting ? "Disconnecting" : "Disconnect"}
        </button>
      </div>

      {walletConnection.disconnectError ? (
        <p
          role="alert"
          className="mt-3 font-sans text-sm font-medium text-red-300"
        >
          {walletConnection.disconnectError}
        </p>
      ) : null}
    </div>
  );
}
