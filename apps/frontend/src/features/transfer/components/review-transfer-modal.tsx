"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import type {
  PreparedTransfer,
  TransferDraft,
  TransferFlowStatus,
} from "@/features/transfer/hooks/use-transfer-flow";
import { formatAddress } from "@/lib/address";
import { formatLamportsAsGor } from "@/features/transfer/schemas/transfer.schema";

type ReviewTransferModalProps = {
  draft: TransferDraft | null;
  error: string | null;
  onCancel: () => void;
  onContinue: () => Promise<void>;
  preparedTransfer: PreparedTransfer | null;
  status: TransferFlowStatus;
};

function ReviewRow({
  label,
  value,
  valueTitle,
}: {
  label: string;
  value: string;
  valueTitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <dt className="font-sans text-sm font-medium text-zinc-500">{label}</dt>
      <dd
        title={valueTitle ?? value}
        className="max-w-[210px] text-right font-sans text-sm font-semibold break-words text-white"
      >
        {value}
      </dd>
    </div>
  );
}

export function ReviewTransferModal({
  draft,
  error,
  onCancel,
  onContinue,
  preparedTransfer,
  status,
}: ReviewTransferModalProps) {
  const isOpen =
    status === "reviewing" ||
    status === "preparing" ||
    status === "prepared" ||
    status === "failed";
  const isPreparing = status === "preparing";
  const isPrepared = status === "prepared";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPreparing) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPreparing, onCancel]);

  if (!isOpen || !draft) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close transfer review"
        disabled={isPreparing}
        className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm disabled:pointer-events-none"
        onClick={onCancel}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-transfer-title"
        className="relative z-10 w-full max-w-[430px] rounded-xl border border-white/[0.1] bg-[#050505] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
      >
        <div>
          <p className="font-heading text-xs font-bold italic tracking-[0.14em] text-[#4dff91] uppercase">
            Private Transfer
          </p>
          <h2
            id="review-transfer-title"
            className="mt-2 font-heading text-3xl font-bold italic tracking-[-0.04em]"
          >
            Review Transfer
          </h2>
        </div>

        <dl className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.035] px-4">
          <ReviewRow label="Recipient receives" value={`${draft.amount} GOR`} />
          <ReviewRow
            label="Recipient"
            value={formatAddress(draft.recipient)}
            valueTitle={draft.recipient}
          />
          <ReviewRow
            label="Wallet"
            value={formatAddress(draft.signer)}
            valueTitle={draft.signer}
          />
          <ReviewRow label="Network" value="Gorbagana" />
          {preparedTransfer ? (
            <>
              <ReviewRow
                label="Indexed outputs"
                value={preparedTransfer.poolStatus.outputCount.toString()}
              />
              <ReviewRow
                label="Private balance"
                value={`${formatLamportsAsGor(
                  preparedTransfer.privateNotes.privateBalanceLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Private notes"
                value={preparedTransfer.privateNotes.unspentNoteCount.toString()}
              />
              <ReviewRow
                label="Private spend"
                value={`${formatLamportsAsGor(
                  preparedTransfer.grossPrivateSpendLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Fees"
                value={`${formatLamportsAsGor(
                  preparedTransfer.estimatedTotalFeeLamports,
                )} GOR`}
              />
            </>
          ) : null}
        </dl>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 font-sans text-sm font-medium text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            type="button"
            disabled={isPreparing}
            className="h-12 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 font-heading text-sm font-bold italic text-white uppercase hover:border-white/[0.2] hover:bg-white/[0.08] active:scale-[0.98]"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPreparing || isPrepared}
            className="h-12 rounded-xl bg-[#4dff91] px-5 font-heading text-sm font-bold italic text-black uppercase hover:bg-[#67ffa2] active:scale-[0.98] disabled:bg-[#4dff91] disabled:opacity-50"
            onClick={() => void onContinue()}
          >
            {isPreparing
              ? "Preparing"
              : isPrepared
                ? "Sign Transfer"
                : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
