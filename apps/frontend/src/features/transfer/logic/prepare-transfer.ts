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
import type { Client } from "@gorbagana/privacy-trash-client";

import { ESTIMATED_NETWORK_FEE_LAMPORTS } from "@/features/transfer/logic/fees";
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
  client?: Pick<Client, "unlock" | "prepareTransfer"> | undefined;
  getPrivacyIdentity?: (() => Promise<PrivacyIdentity>) | undefined;
  indexer?: Pick<Indexer, "getStatus"> | undefined;
  privateNoteIndexer?: Pick<Indexer, "getOutputRange" | "getNullifierStatus"> | undefined;
  scanPrivateNotes?: ((input: ScanPrivateNotesInput) => Promise<PrivateNoteScan>) | undefined;
  privacyIdentity?: PrivacyIdentity | undefined;
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

async function scanTransferPrivateNotes(input: {
  identity: PrivacyIdentity;
  indexer: Pick<Indexer, "getOutputRange" | "getNullifierStatus">;
  scanNotes: (input: ScanPrivateNotesInput) => Promise<PrivateNoteScan>;
}): Promise<PrivateNoteScan> {
  const scanInput = {
    identity: toBrowserNoteIdentity(input.identity),
    hasherWasm: getHasherWasmInput(),
    indexer: input.indexer,
    programAddress: input.identity.programAddress,
  } satisfies ScanPrivateNotesInput;
  const firstScan = await input.scanNotes(scanInput).catch((error: unknown) => {
    throw normalizePreparationError(error);
  });

  if (firstScan.unspentNoteCount > 0 || firstScan.totalOutputCount === 0) {
    return firstScan;
  }

  return await input.scanNotes({
    ...scanInput,
    syncMode: "full",
  }).catch((error: unknown) => {
    throw normalizePreparationError(error);
  });
}

function createNoPrivateBalanceError(privateNotes: PrivateNoteScan): Error {
  if (privateNotes.ownedNoteCount > 0) {
    return new Error("All private notes for this wallet are already spent.");
  }

  return new Error(
    "No private balance found for this wallet. If you already deposited, reconnect the same wallet, approve the Privacy Trash unlock signature, and try again after the deposit is indexed.",
  );
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

  if (!options.getPrivacyIdentity && !options.privacyIdentity) {
    throw new Error("Privacy identity is unavailable.");
  }

  let privacyIdentity: PrivacyIdentity | undefined;
  try {
    privacyIdentity =
      options.privacyIdentity ?? (await options.getPrivacyIdentity?.());
  } catch (error) {
    throw normalizePreparationError(error);
  }

  if (privacyIdentity === undefined) {
    throw new Error("Privacy identity is unavailable.");
  }

  if (privacyIdentity.walletAddress !== draft.signer) {
    throw new Error("Wallet changed. Reconnect the original wallet and try again.");
  }

  const scanNotes = options.scanPrivateNotes ?? scanPrivateNotes;
  const privateNotes = await scanTransferPrivateNotes({
    identity: privacyIdentity,
    indexer: options.privateNoteIndexer ?? privacyIndexer,
    scanNotes,
  });

  if (privateNotes.unspentNoteCount === 0) {
    throw createNoPrivateBalanceError(privateNotes);
  }

  const client = options.client;
  const clientPreparedOperation =
    client === undefined
      ? undefined
      : await prepareClientTransfer({
          client,
          recipient: draft.recipient,
          recipientLamports: draft.amountLamports,
        });

  if (clientPreparedOperation === undefined) {
    throw new Error("Private transfer client is unavailable.");
  }

  const quote = clientPreparedOperation.quote;

  if (quote.privateBalanceLamports !== privateNotes.privateBalanceLamports) {
    throw new Error("Private balance changed while preparing the transfer.");
  }

  if (privateNotes.privateBalanceLamports < quote.grossWithdrawalLamports) {
    throw new Error("Private balance is too low for this amount and fees.");
  }

  return {
    mode: "transfer",
    baseWithdrawalFeeLamports: quote.withdrawRentFeeLamports,
    clientPreparedOperation,
    estimatedNetworkFeeLamports: ESTIMATED_NETWORK_FEE_LAMPORTS,
    estimatedTotalFeeLamports:
      quote.withdrawalFeeLamports + ESTIMATED_NETWORK_FEE_LAMPORTS,
    grossPrivateSpendLamports: quote.grossWithdrawalLamports,
    privateNotes,
    poolStatus,
    privacyIdentity,
    protocolFeeLamports:
      quote.withdrawalFeeLamports - quote.withdrawRentFeeLamports,
    recipient: draft.recipient,
    recipientAmountLamports: quote.recipientLamports,
    signer: draft.signer,
  };
}

async function prepareClientTransfer(input: {
  client: Pick<Client, "unlock" | "prepareTransfer">;
  recipient: string;
  recipientLamports: bigint;
}) {
  await input.client.unlock();

  return await input.client.prepareTransfer({
    recipient: input.recipient,
    recipientLamports: input.recipientLamports,
  });
}
