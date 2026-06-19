"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ReviewTransferModal } from "@/features/transfer/components/review-transfer-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTransferFlow } from "@/features/transfer/hooks/use-transfer-flow";
import { ConnectWalletButton } from "@/features/wallet/components/connect-wallet-button";
import { WalletSummary } from "@/features/wallet/components/wallet-summary";
import { useWalletConnection } from "@/features/wallet/hooks/use-wallet-connection";
import {
  transferDefaults,
  transferSchema,
  type TransferFormValues,
  type ValidTransfer,
} from "@/features/transfer/schemas/transfer.schema";

export function TransferForm() {
  const transferFlow = useTransferFlow();
  const walletConnection = useWalletConnection();

  const form = useForm<TransferFormValues, undefined, ValidTransfer>({
    defaultValues: transferDefaults,
    mode: "onChange",
    resolver: zodResolver(transferSchema),
  });

  const {
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
  } = form;

  const onSubmit = handleSubmit((transfer) => {
    if (!walletConnection.isConnected || !walletConnection.publicKey) {
      return;
    }

    transferFlow.reviewTransfer({
      amount: transfer.amount,
      amountLamports: transfer.amountLamports,
      recipient: transfer.recipient,
      signer: walletConnection.publicKey.toBase58(),
    });
  });

  return (
    <>
      <form
        aria-label="Private GOR transfer"
        className="w-full max-w-[420px] justify-self-center rounded-xl border border-white/[0.1] bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:justify-self-end"
        onSubmit={onSubmit}
      >
        <FieldGroup className="gap-5">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel
              htmlFor="transfer-amount"
              className="font-sans text-sm font-medium text-zinc-400"
            >
              Amount
            </FieldLabel>
            <div className="relative">
              <Input
                id="transfer-amount"
                inputMode="decimal"
                placeholder="0.00"
                className="h-14 rounded-lg border-white/[0.1] bg-black/25 pr-16 pl-4 font-sans text-lg font-semibold text-white placeholder:text-zinc-700 focus-visible:border-[#4dff91]/70 focus-visible:ring-[#4dff91]/15"
                aria-invalid={Boolean(errors.amount)}
                {...register("amount")}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-heading text-sm font-bold italic text-[#4dff91]">
                GOR
              </span>
            </div>
            <FieldError
              className="font-sans text-sm text-red-400"
              errors={[errors.amount]}
            />
          </Field>

          <Field data-invalid={Boolean(errors.recipient)}>
            <FieldLabel
              htmlFor="transfer-recipient"
              className="font-sans text-sm font-medium text-zinc-400"
            >
              Recipient
            </FieldLabel>
            <Input
              id="transfer-recipient"
              placeholder="Wallet address"
              className="h-14 rounded-lg border-white/[0.1] bg-black/25 px-4 font-sans text-base font-medium text-white placeholder:text-zinc-700 focus-visible:border-[#4dff91]/70 focus-visible:ring-[#4dff91]/15"
              aria-invalid={Boolean(errors.recipient)}
              {...register("recipient")}
            />
            <FieldError
              className="font-sans text-sm text-red-400"
              errors={[errors.recipient]}
            />
          </Field>

          <WalletSummary />

          {walletConnection.isConnected ? (
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="h-12 w-full rounded-xl bg-[#4dff91] px-8 font-heading text-base font-bold italic text-black uppercase hover:bg-[#67ffa2] active:scale-[0.98] disabled:bg-[#4dff91] disabled:opacity-40"
            >
              Review Transfer
            </Button>
          ) : (
            <ConnectWalletButton />
          )}
        </FieldGroup>
      </form>

      <ReviewTransferModal
        draft={transferFlow.state.draft}
        error={transferFlow.state.error}
        status={transferFlow.state.status}
        onCancel={transferFlow.cancelReview}
        onContinue={transferFlow.prepareTransfer}
        preparedTransfer={transferFlow.state.preparedTransfer}
      />
    </>
  );
}
