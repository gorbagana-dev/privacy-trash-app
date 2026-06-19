"use client";

import { useEffect } from "react";

import type { WalletOption } from "@/features/wallet/logic/wallet-options";
import { cn } from "@/lib/utils";

type WalletModalProps = {
  connectionError: string | null;
  open: boolean;
  wallets: WalletOption[];
  onOpenChange: (open: boolean) => void;
  onWalletSelect: (wallet: WalletOption) => void;
};

export function WalletModal({
  connectionError,
  open,
  wallets,
  onOpenChange,
  onWalletSelect,
}: WalletModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close wallet selector"
        className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
        onClick={closeModal}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        className="relative z-10 w-full max-w-[420px] rounded-xl border border-white/[0.1] bg-[#050505] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="wallet-modal-title"
              className="font-heading text-2xl font-bold italic tracking-[-0.04em]"
            >
              Connect Wallet
            </h2>
            <p className="mt-2 font-sans text-sm leading-5 text-zinc-500">
              Choose the wallet you want to use with Privacy Trash.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close wallet selector"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] font-sans text-sm font-semibold text-zinc-400 transition hover:border-white/[0.16] hover:text-white"
            onClick={closeModal}
          >
            x
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {wallets.length > 0 ? (
            wallets.map((availableWallet) => (
                <button
                  key={availableWallet.name}
                  type="button"
                  disabled={availableWallet.disabled}
                  className={cn(
                    "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-left transition hover:border-[#4dff91]/45 hover:bg-[#4dff91]/[0.06] disabled:pointer-events-none disabled:opacity-45",
                    availableWallet.canConnect && "hover:text-white",
                  )}
                  onClick={() => onWalletSelect(availableWallet)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-black/40">
                    {/* Wallet adapters provide arbitrary icon URLs/data URIs that Next Image cannot safely optimize. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={availableWallet.icon}
                      alt=""
                      className="size-6"
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-sm font-semibold text-white">
                      {availableWallet.label}
                    </span>
                    <span className="mt-0.5 block font-sans text-xs font-medium text-zinc-500">
                      {availableWallet.statusLabel}
                    </span>
                  </span>

                  <span className="font-heading text-xs font-bold italic uppercase text-[#4dff91]">
                    {availableWallet.actionLabel}
                  </span>
                </button>
              ))
          ) : (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-4 py-5">
              <p className="font-sans text-sm font-medium text-zinc-400">
                No wallets were detected in this browser.
              </p>
            </div>
          )}
        </div>

        {connectionError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 font-sans text-sm font-medium text-red-300"
          >
            {connectionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
