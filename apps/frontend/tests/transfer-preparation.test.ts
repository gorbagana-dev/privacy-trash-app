import {
  IndexerError,
  type ScanPrivateNotesInput,
  type IndexerStatus,
} from "@gorbagana/privacy-trash-client/browser";
import type { PreparedTransfer as ClientPreparedTransfer } from "@gorbagana/privacy-trash-client";
import { address } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import { prepareTransfer } from "@/features/transfer/logic/prepare-transfer";
import type { TransferDraft } from "@/features/transfer/types/transfer.types";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

const draft: TransferDraft = {
  mode: "transfer",
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
const clientPreparedOperation: ClientPreparedTransfer = {
  version: 1,
  programAddress: address(programAddress),
  ownerAddress: address(draft.signer),
  recipient: address(draft.recipient),
  quote: {
    recipientLamports: 10_000_000_000n,
    privateBalanceLamports: 20_000_000_000n,
    grossWithdrawalLamports: 10_041_144_004n,
    withdrawalFeeLamports: 41_144_004n,
    shieldLamports: 0n,
    withdrawalFeeBps: 35,
    withdrawRentFeeLamports: 6_000_000n,
  },
  createdAt: "2026-06-19T00:00:00.000Z",
  payload: { kind: "test" },
};
const client = {
  unlock: async () => ({
    walletAddress: address(draft.signer),
    message: privacyIdentity.message,
    signature: new Uint8Array([1]),
  }),
  prepareTransfer: async () => clientPreparedOperation,
};

describe("transfer preparation", () => {
  it("calculates recipient amount, fees, gross private spend, and pool status", async () => {
    const prepared = await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });

    expect(prepared.recipientAmountLamports).toBe(10_000_000_000n);
    expect(prepared.mode).toBe("transfer");
    expect(prepared.clientPreparedOperation).toBe(clientPreparedOperation);
    expect(prepared.protocolFeeLamports).toBe(35_144_004n);
    expect(prepared.baseWithdrawalFeeLamports).toBe(6_000_000n);
    expect(prepared.estimatedNetworkFeeLamports).toBe(5_000n);
    expect(prepared.estimatedTotalFeeLamports).toBe(41_149_004n);
    expect(prepared.grossPrivateSpendLamports).toBe(10_041_144_004n);
    expect(prepared.privateNotes).toBe(privateNotes);
    expect(prepared.poolStatus).toBe(poolStatus);
    expect(prepared.privacyIdentity).toBe(privacyIdentity);
  });

  it("uses the client transfer quote for fee-on-gross withdrawal math", async () => {
    const fifteenGorDraft = {
      ...draft,
      amount: "15",
      amountLamports: 15_000_000_000n,
    };
    const fifteenGorPreparedOperation = {
      ...clientPreparedOperation,
      quote: {
        ...clientPreparedOperation.quote,
        recipientLamports: 15_000_000_000n,
        grossWithdrawalLamports: 15_058_705_469n,
        withdrawalFeeLamports: 58_705_469n,
      },
    } satisfies ClientPreparedTransfer;
    const transferClient = {
      unlock: client.unlock,
      prepareTransfer: vi.fn(async () => fifteenGorPreparedOperation),
    };

    const prepared = await prepareTransfer(fifteenGorDraft, {
      client: transferClient,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });

    expect(transferClient.prepareTransfer).toHaveBeenCalledWith({
      recipient: fifteenGorDraft.recipient,
      recipientLamports: 15_000_000_000n,
    });
    expect(prepared.clientPreparedOperation).toBe(fifteenGorPreparedOperation);
    expect(prepared.recipientAmountLamports).toBe(15_000_000_000n);
    expect(prepared.grossPrivateSpendLamports).toBe(15_058_705_469n);
    expect(prepared.protocolFeeLamports).toBe(52_705_469n);
    expect(prepared.baseWithdrawalFeeLamports).toBe(6_000_000n);
    expect(prepared.estimatedTotalFeeLamports).toBe(58_710_469n);
  });

  it("preserves signer and recipient", async () => {
    const prepared = await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });

    expect(prepared.signer).toBe(draft.signer);
    expect(prepared.recipient).toBe(draft.recipient);
  });

  it("passes only the client note identity contract to private note scanning", async () => {
    const scanPrivateNotesSpy = vi.fn(
      async (input: ScanPrivateNotesInput) => {
        void input;

        return privateNotes;
      },
    );

    await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes: scanPrivateNotesSpy,
    });

    expect(scanPrivateNotesSpy).toHaveBeenCalledOnce();
    expect(scanPrivateNotesSpy.mock.calls[0]?.[0].identity).toEqual({
      programAddress,
      signatureBase64: privacyIdentity.signatureBase64,
      walletAddress: privacyIdentity.walletAddress,
    });
    expect(scanPrivateNotesSpy.mock.calls[0]?.[0].syncMode).toBeUndefined();
  });

  it("runs a full note rescan when incremental scanning finds no spendable notes", async () => {
    const scanPrivateNotesSpy = vi
      .fn<(input: ScanPrivateNotesInput) => Promise<typeof privateNotes>>()
      .mockResolvedValueOnce({
        ...privateNotes,
        balanceLamports: 0n,
        ownedNoteCount: 0,
        privateBalanceLamports: 0n,
        unspentNoteCount: 0,
      })
      .mockResolvedValueOnce(privateNotes);

    const prepared = await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes: scanPrivateNotesSpy,
    });

    expect(prepared.privateNotes).toBe(privateNotes);
    expect(scanPrivateNotesSpy).toHaveBeenCalledTimes(2);
    expect(scanPrivateNotesSpy.mock.calls[0]?.[0].syncMode).toBeUndefined();
    expect(scanPrivateNotesSpy.mock.calls[1]?.[0].syncMode).toBe("full");
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
    ).rejects.toThrow("No private balance found for this wallet");
  });

  it("fails when all private notes are already spent", async () => {
    await expect(
      prepareTransfer(draft, {
        getPrivacyIdentity,
        indexer,
        scanPrivateNotes: async () => ({
          ...privateNotes,
          balanceLamports: 0n,
          privateBalanceLamports: 0n,
          unspentNoteCount: 0,
        }),
      }),
    ).rejects.toThrow("All private notes for this wallet are already spent.");
  });

  it("fails when scanned notes and the client quote disagree on private balance", async () => {
    await expect(
      prepareTransfer(draft, {
        client: {
          unlock: client.unlock,
          prepareTransfer: async () => ({
            ...clientPreparedOperation,
            quote: {
              ...clientPreparedOperation.quote,
              privateBalanceLamports: privateNotes.privateBalanceLamports - 1n,
            },
          }),
        },
        getPrivacyIdentity,
        indexer,
        scanPrivateNotes,
      }),
    ).rejects.toThrow("Private balance changed while preparing the transfer.");
  });

  it("fails when private balance cannot cover amount and fees", async () => {
    const lowBalanceNotes = {
      ...privateNotes,
      balanceLamports: 1_000_000_000n,
      privateBalanceLamports: 1_000_000_000n,
    };
    const lowBalancePreparedOperation = {
      ...clientPreparedOperation,
      quote: {
        ...clientPreparedOperation.quote,
        privateBalanceLamports: lowBalanceNotes.privateBalanceLamports,
      },
    };

    await expect(
      prepareTransfer(draft, {
        client: {
          unlock: client.unlock,
          prepareTransfer: async () => lowBalancePreparedOperation,
        },
        getPrivacyIdentity,
        indexer,
        scanPrivateNotes: async () => lowBalanceNotes,
      }),
    ).rejects.toThrow("Private balance is too low for this amount and fees.");
  });
});
