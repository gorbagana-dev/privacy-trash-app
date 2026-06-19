import {
  IndexerError,
  quoteDeposit,
  type Indexer,
  type MerkleState,
} from "@gorbagana/privacy-trash-client/browser";
import type { Client } from "@gorbagana/privacy-trash-client";

import { DEPOSIT_FEE_BASIS_POINTS } from "@/features/transfer/logic/fees";
import { privacyIndexer } from "@/features/transfer/logic/indexer";
import type {
  DepositDraft,
  PreparedDeposit,
} from "@/features/transfer/types/transfer.types";
import {
  PrivacyIdentityError,
  type PrivacyIdentity,
} from "@/features/wallet/logic/privacy-identity";

export type PrepareDepositOptions = {
  client?: Pick<Client, "unlock" | "prepareDeposit"> | undefined;
  getPrivacyIdentity?: (() => Promise<PrivacyIdentity>) | undefined;
  indexer?: Pick<Indexer, "getMerkleState"> | undefined;
  privacyIdentity?: PrivacyIdentity | undefined;
};

function normalizePreparationError(error: unknown): Error {
  if (error instanceof IndexerError) {
    return new Error("Privacy pool is unavailable. Try again in a moment.");
  }

  if (error instanceof PrivacyIdentityError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Deposit preparation was cancelled.");
  }

  if (error instanceof Error && error.message) {
    return error;
  }

  return new Error("Unable to prepare deposit.");
}

export async function prepareDeposit(
  draft: DepositDraft,
  options: PrepareDepositOptions = {},
): Promise<PreparedDeposit> {
  const indexer = options.indexer ?? privacyIndexer;

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

  let merkleState: MerkleState;
  try {
    merkleState = await indexer.getMerkleState();
  } catch (error) {
    throw normalizePreparationError(error);
  }

  const quote = quoteDeposit({
    lamports: draft.amountLamports,
    depositFeeBps: DEPOSIT_FEE_BASIS_POINTS,
  });
  const client = options.client;
  const clientPreparedOperation =
    client === undefined
      ? undefined
      : await prepareClientDeposit({
          client,
          lamports: draft.amountLamports,
        });

  if (clientPreparedOperation === undefined) {
    throw new Error("Private deposit client is unavailable.");
  }

  return {
    mode: "deposit",
    amount: draft.amount,
    clientPreparedOperation,
    depositAmountLamports: quote.depositLamports,
    depositFeeLamports: quote.depositFeeLamports,
    merkleState,
    privateOutputLamports: quote.privateOutputLamports,
    privacyIdentity,
    quote,
    signer: draft.signer,
  };
}

async function prepareClientDeposit(input: {
  client: Pick<Client, "unlock" | "prepareDeposit">;
  lamports: bigint;
}) {
  await input.client.unlock();

  return await input.client.prepareDeposit({ lamports: input.lamports });
}
