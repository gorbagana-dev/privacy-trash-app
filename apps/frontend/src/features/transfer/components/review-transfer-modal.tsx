"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import type {
  PreparedPrivateOperation,
  PrivateOperationReceipt,
  PrivateOperationDraft,
  TransferFlowStatus,
} from "@/features/transfer/hooks/use-transfer-flow";
import { formatAddress } from "@/lib/address";
import { formatLamportsAsGor } from "@/features/transfer/schemas/transfer.schema";

type ReviewTransferModalProps = {
  draft: PrivateOperationDraft | null;
  error: string | null;
  onCancel: () => void;
  onExecute: () => Promise<void>;
  onPrepare: () => Promise<void>;
  preparedOperation: PreparedPrivateOperation | null;
  receipt: PrivateOperationReceipt | null;
  status: TransferFlowStatus;
};

function ReviewRow({
  children,
  label,
  value,
  valueTitle,
}: {
  children?: ReactNode;
  label: string;
  value?: string;
  valueTitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <dt className="font-sans text-sm font-medium text-zinc-500">{label}</dt>
      <dd
        title={valueTitle ?? value}
        className="max-w-[210px] text-right font-sans text-sm font-semibold break-words text-white"
      >
        {children ?? value}
      </dd>
    </div>
  );
}

function SignatureValue({ signature }: { signature: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1_500);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copySignature = async () => {
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <span title={signature}>{formatAddress(signature)}</span>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 font-sans text-[11px] font-semibold text-zinc-300 uppercase transition hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-white"
        onClick={() => void copySignature()}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ExplorerLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-sans text-sm font-semibold text-[#4dff91] underline-offset-4 transition hover:text-[#67ffa2] hover:underline"
    >
      Open transaction
    </a>
  );
}

export function ReviewTransferModal({
  draft,
  error,
  onCancel,
  onExecute,
  onPrepare,
  preparedOperation,
  receipt,
  status,
}: ReviewTransferModalProps) {
  const isOpen =
    status === "reviewing" ||
    status === "preparing" ||
    status === "prepared" ||
    status === "signing" ||
    status === "submitted" ||
    status === "failed";
  const isPreparing = status === "preparing";
  const isSigning = status === "signing";
  const isSubmitted = status === "submitted";
  const isBusy = isPreparing || isSigning;
  const isPrepared = status === "prepared";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, isOpen, onCancel]);

  if (!isOpen || !draft) {
    return null;
  }

  const operationLabel = draft.mode === "deposit" ? "Deposit" : "Transfer";
  const isPreparedOperation = preparedOperation?.mode === draft.mode;
  const isExecutable = isPreparedOperation && !isSubmitted;
  const primaryAction = isExecutable ? onExecute : onPrepare;
  const title = isSubmitted
    ? `${operationLabel} Complete`
    : `Review ${operationLabel}`;
  const primaryLabel = (() => {
    if (isPreparing) return "Preparing";
    if (isSigning) return "Signing";
    if (isExecutable) return `Sign ${operationLabel}`;

    return `Prepare ${operationLabel}`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close transfer review"
        disabled={isBusy}
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
            Private {operationLabel}
          </p>
          <h2
            id="review-transfer-title"
            className="mt-2 font-heading text-3xl font-bold italic tracking-[-0.04em]"
          >
            {title}
          </h2>
        </div>

        <dl className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.035] px-4">
          <ReviewRow
            label={draft.mode === "deposit" ? "Private deposit" : "Recipient receives"}
            value={`${draft.amount} GOR`}
          />
          {draft.mode === "transfer" ? (
            <ReviewRow
              label="Recipient"
              value={formatAddress(draft.recipient)}
              valueTitle={draft.recipient}
            />
          ) : null}
          <ReviewRow
            label="Wallet"
            value={formatAddress(draft.signer)}
            valueTitle={draft.signer}
          />
          <ReviewRow label="Network" value="Gorbagana" />
          {isPreparedOperation && preparedOperation.mode === "deposit" ? (
            <>
              <ReviewRow
                label="Private output"
                value={`${formatLamportsAsGor(
                  preparedOperation.privateOutputLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Deposit fee"
                value={`${formatLamportsAsGor(
                  preparedOperation.depositFeeLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Tree index"
                value={preparedOperation.merkleState.nextIndex.toString()}
              />
            </>
          ) : null}
          {isPreparedOperation && preparedOperation.mode === "transfer" ? (
            <>
              <ReviewRow
                label="Indexed outputs"
                value={preparedOperation.poolStatus.outputCount.toString()}
              />
              <ReviewRow
                label="Private balance"
                value={`${formatLamportsAsGor(
                  preparedOperation.privateNotes.privateBalanceLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Private notes"
                value={preparedOperation.privateNotes.unspentNoteCount.toString()}
              />
              <ReviewRow
                label="Private spend"
                value={`${formatLamportsAsGor(
                  preparedOperation.grossPrivateSpendLamports,
                )} GOR`}
              />
              <ReviewRow
                label="Fees"
                value={`${formatLamportsAsGor(
                  preparedOperation.estimatedTotalFeeLamports,
                )} GOR`}
              />
            </>
          ) : null}
          {receipt ? (
            <>
              <ReviewRow label="Signature" valueTitle={receipt.signature}>
                <SignatureValue signature={receipt.signature} />
              </ReviewRow>
              {receipt.slot ? (
                <ReviewRow label="Slot" value={receipt.slot.toString()} />
              ) : null}
              {receipt.explorerUrl ? (
                <ReviewRow label="Explorer" valueTitle={receipt.explorerUrl}>
                  <ExplorerLink href={receipt.explorerUrl} />
                </ReviewRow>
              ) : null}
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
            disabled={isBusy}
            className="h-12 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 font-heading text-sm font-bold italic text-white uppercase hover:border-white/[0.2] hover:bg-white/[0.08] active:scale-[0.98]"
            onClick={onCancel}
          >
            {isSubmitted ? `New ${operationLabel}` : "Cancel"}
          </Button>
          {isSubmitted && receipt?.explorerUrl ? (
            <a
              href={receipt.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-[#4dff91] px-5 font-heading text-sm font-bold italic text-black uppercase transition hover:bg-[#67ffa2] active:scale-[0.98]"
            >
              Open Transaction
            </a>
          ) : (
            <ActionButton
              type="button"
              disabled={isBusy || isSubmitted}
              state={
                isBusy ? "loading" : isSubmitted ? "success" : "idle"
              }
              loadingLabel={isPreparing ? "Preparing" : "Signing"}
              successLabel="Complete"
              className="h-12 rounded-xl bg-[#4dff91] px-5 font-heading text-sm font-bold italic text-black uppercase hover:bg-[#67ffa2] active:scale-[0.98] disabled:bg-[#4dff91] disabled:opacity-50"
              onClick={() => void primaryAction()}
            >
              {isSubmitted
                ? "Complete"
                : isPrepared && !isExecutable
                  ? "Prepared"
                  : primaryLabel}
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
