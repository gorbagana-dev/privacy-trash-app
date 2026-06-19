"use client";

import { Button } from "@/components/ui/button";
import { WalletModal } from "@/features/wallet/components/wallet-modal";
import { useWalletConnection } from "@/features/wallet/hooks/use-wallet-connection";
import { cn } from "@/lib/utils";

type ConnectWalletButtonProps = {
  className?: string;
};

export function ConnectWalletButton({ className }: ConnectWalletButtonProps) {
  const walletConnection = useWalletConnection();

  if (walletConnection.isConnected) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        disabled={walletConnection.isConnecting}
        className={cn(
          "h-12 w-full rounded-xl bg-[#4dff91] px-8 font-heading text-base font-bold italic text-black uppercase hover:bg-[#67ffa2] active:scale-[0.98] disabled:bg-[#4dff91] disabled:opacity-50",
          className,
        )}
        onClick={walletConnection.openWalletModal}
      >
        {walletConnection.isConnecting ? "Connecting" : "Connect Wallet"}
      </Button>

      <WalletModal
        connectionError={walletConnection.connectionError}
        open={walletConnection.walletModalOpen}
        wallets={walletConnection.walletOptions}
        onOpenChange={walletConnection.setWalletModalOpen}
        onWalletSelect={walletConnection.selectWallet}
      />
    </>
  );
}
