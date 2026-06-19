import {
  IndexerError,
  type IndexerStatus,
} from "@gorbagana/privacy-trash-client/browser";
import { describe, expect, it } from "vitest";

import { prepareTransfer } from "@/features/transfer/logic/prepare-transfer";
import type { TransferDraft } from "@/features/transfer/types/transfer.types";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

const draft: TransferDraft = {
  amount: "10",
  amountLamports: 10_000_000_000n,
  recipient: "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
  signer: "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
};
const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";

const poolStatus: IndexerStatus = {
  outputCount: 4,
  spentNullifierCount: 4,
  observedRootCount: 2,
  latestOutputIndex: "3",
  latestSlot: "66920165",
};

const indexer = {
  getStatus: async () => poolStatus,
};

const privacyIdentity: PrivacyIdentity = {
  cacheKey: "privacy-trash:privacy-identity:v1:Gorbagana:program:wallet",
  fromCache: false,
  message: "Privacy Trash",
  programAddress,
  signatureBase64: "signature",
  walletAddress: draft.signer,
};

const getPrivacyIdentity = async () => privacyIdentity;
const privateNotes = {
  balanceLamports: 20_000_000_000n,
  fetchedOutputCount: 4,
  hasMore: false,
  nextOutputOffset: 4,
  ownedNoteCount: 2,
  privateBalanceLamports: 20_000_000_000n,
  totalOutputCount: 4,
  unspentNoteCount: 2,
};
const scanPrivateNotes = async () => privateNotes;

describe("transfer preparation", () => {
  it("calculates recipient amount, fees, gross private spend, and pool status", async () => {
    const prepared = await prepareTransfer(draft, {
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });

    expect(prepared.recipientAmountLamports).toBe(10_000_000_000n);
    expect(prepared.protocolFeeLamports).toBe(35_000_000n);
    expect(prepared.baseWithdrawalFeeLamports).toBe(6_000_000n);
    expect(prepared.estimatedNetworkFeeLamports).toBe(5_000n);
    expect(prepared.estimatedTotalFeeLamports).toBe(41_005_000n);
    expect(prepared.grossPrivateSpendLamports).toBe(10_041_000_000n);
    expect(prepared.privateNotes).toBe(privateNotes);
    expect(prepared.poolStatus).toBe(poolStatus);
    expect(prepared.privacyIdentity).toBe(privacyIdentity);
  });

  it("preserves signer and recipient", async () => {
    const prepared = await prepareTransfer(draft, {
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });

    expect(prepared.signer).toBe(draft.signer);
    expect(prepared.recipient).toBe(draft.recipient);
  });

  it("fails cleanly when the backend pool API fails", async () => {
    const failingIndexer = {
      getStatus: async () => {
        throw new IndexerError({
          code: "http_error",
          message: "Indexer request failed with HTTP 500.",
          status: 500,
        });
      },
    };

    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity,
        indexer: failingIndexer,
        scanPrivateNotes,
      }),
    ).rejects.toThrow(
      "Privacy pool is unavailable. Try again in a moment.",
    );
  });

  it("fails when the indexed pool is empty", async () => {
    const emptyIndexer = {
      getStatus: async () => ({
        ...poolStatus,
        outputCount: 0,
        latestOutputIndex: null,
        latestSlot: null,
      }),
    };

    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity,
        indexer: emptyIndexer,
        scanPrivateNotes,
      }),
    ).rejects.toThrow(
      "Privacy pool has no indexed outputs yet.",
    );
  });

  it("fails if the wallet changes during preparation", async () => {
    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity: async () => ({
          ...privacyIdentity,
          walletAddress: "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
        }),
        indexer,
        scanPrivateNotes,
      }),
    ).rejects.toThrow(
      "Wallet changed. Reconnect the original wallet and try again.",
    );
  });

  it("fails when no private notes are available", async () => {
    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity,
        indexer,
        scanPrivateNotes: async () => ({
          ...privateNotes,
          balanceLamports: 0n,
          ownedNoteCount: 0,
          privateBalanceLamports: 0n,
          unspentNoteCount: 0,
        }),
      }),
    ).rejects.toThrow("No private balance found for this wallet.");
  });

  it("fails when private balance cannot cover amount and fees", async () => {
    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity,
        indexer,
        scanPrivateNotes: async () => ({
          ...privateNotes,
          balanceLamports: 1_000_000_000n,
          privateBalanceLamports: 1_000_000_000n,
        }),
      }),
    ).rejects.toThrow("Private balance is too low for this amount and fees.");
  });
});
