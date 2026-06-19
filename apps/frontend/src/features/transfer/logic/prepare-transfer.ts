import {
  IndexerError,
  PrivateNoteScanError,
  scanPrivateNotes,
  type BrowserNoteIdentity,
  type Indexer,
  type IndexerStatus,
  type PrivateNoteScan,
  type ScanPrivateNotesInput,
} from "@gorbagana/privacy-trash-client/browser";

import {
  BASE_WITHDRAWAL_FEE_LAMPORTS,
  ESTIMATED_NETWORK_FEE_LAMPORTS,
  calculateGrossPrivateSpendLamports,
  calculateProtocolFeeLamports,
} from "@/features/transfer/logic/fees";
import { getHasherWasmInput } from "@/features/transfer/logic/hasher";
import { privacyIndexer } from "@/features/transfer/logic/indexer";
import type {
  PreparedTransfer,
  TransferDraft,
} from "@/features/transfer/types/transfer.types";
import {
  PrivacyIdentityError,
  type PrivacyIdentity,
} from "@/features/wallet/logic/privacy-identity";

export type PrepareTransferOptions = {
  getPrivacyIdentity?: (() => Promise<PrivacyIdentity>) | undefined;
  indexer?: Pick<Indexer, "getStatus"> | undefined;
  privateNoteIndexer?: Pick<Indexer, "getOutputRange" | "getNullifierStatus"> | undefined;
  scanPrivateNotes?: ((input: ScanPrivateNotesInput) => Promise<PrivateNoteScan>) | undefined;
};

function toBrowserNoteIdentity(
  identity: PrivacyIdentity,
): BrowserNoteIdentity {
  return {
    programAddress: identity.programAddress,
    signatureBase64: identity.signatureBase64,
    walletAddress: identity.walletAddress,
  };
}

function normalizePreparationError(error: unknown): Error {
  if (error instanceof IndexerError) {
    return new Error("Privacy pool is unavailable. Try again in a moment.");
  }

  if (error instanceof PrivacyIdentityError) {
    return error;
  }

  if (error instanceof PrivateNoteScanError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Transfer preparation was cancelled.");
  }

  if (error instanceof Error && error.message) {
    return error;
  }

  return new Error("Unable to prepare transfer.");
}

export async function prepareTransfer(
  draft: TransferDraft,
  options: PrepareTransferOptions = {},
): Promise<PreparedTransfer> {
  const indexer = options.indexer ?? privacyIndexer;

  let poolStatus: IndexerStatus;
  try {
    poolStatus = await indexer.getStatus();
  } catch (error) {
    throw normalizePreparationError(error);
  }

  if (poolStatus.outputCount === 0) {
    throw new Error("Privacy pool has no indexed outputs yet.");
  }

  if (!options.getPrivacyIdentity) {
    throw new Error("Privacy identity is unavailable.");
  }

  let privacyIdentity: PrivacyIdentity;
  try {
    privacyIdentity = await options.getPrivacyIdentity();
  } catch (error) {
    throw normalizePreparationError(error);
  }

  if (privacyIdentity.walletAddress !== draft.signer) {
    throw new Error("Wallet changed. Reconnect the original wallet and try again.");
  }

  const protocolFeeLamports = calculateProtocolFeeLamports(
    draft.amountLamports,
  );
  const grossPrivateSpendLamports = calculateGrossPrivateSpendLamports(
    draft.amountLamports,
  );
  const scanNotes = options.scanPrivateNotes ?? scanPrivateNotes;
  const privateNotes = await scanNotes({
    identity: toBrowserNoteIdentity(privacyIdentity),
    hasherWasm: getHasherWasmInput(),
    indexer: options.privateNoteIndexer ?? privacyIndexer,
    programAddress: privacyIdentity.programAddress,
  }).catch((error: unknown) => {
    throw normalizePreparationError(error);
  });

  if (privateNotes.unspentNoteCount === 0) {
    throw new Error("No private balance found for this wallet.");
  }

  if (privateNotes.privateBalanceLamports < grossPrivateSpendLamports) {
    throw new Error("Private balance is too low for this amount and fees.");
  }

  return {
    baseWithdrawalFeeLamports: BASE_WITHDRAWAL_FEE_LAMPORTS,
    estimatedNetworkFeeLamports: ESTIMATED_NETWORK_FEE_LAMPORTS,
    estimatedTotalFeeLamports:
      protocolFeeLamports +
      BASE_WITHDRAWAL_FEE_LAMPORTS +
      ESTIMATED_NETWORK_FEE_LAMPORTS,
    grossPrivateSpendLamports,
    privateNotes,
    poolStatus,
    privacyIdentity,
    protocolFeeLamports,
    recipient: draft.recipient,
    recipientAmountLamports: draft.amountLamports,
    signer: draft.signer,
  };
}
