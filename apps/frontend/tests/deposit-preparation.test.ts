import {
  IndexerError,
  type MerkleState,
} from "@gorbagana/privacy-trash-client/browser";
import type { PreparedDeposit as ClientPreparedDeposit } from "@gorbagana/privacy-trash-client";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";

import { prepareDeposit } from "@/features/transfer/logic/prepare-deposit";
import type { DepositDraft } from "@/features/transfer/types/transfer.types";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const signer = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";

const draft: DepositDraft = {
  mode: "deposit",
  amount: "10",
  amountLamports: 10_000_000_000n,
  signer,
};

const merkleState: MerkleState = {
  treeHeight: 26,
  root: "123",
  nextIndex: 4,
};

const indexer = {
  getMerkleState: async () => merkleState,
};

const privacyIdentity: PrivacyIdentity = {
  cacheKey: "privacy-trash:privacy-identity:v1:Gorbagana:program:wallet",
  fromCache: false,
  message: "Privacy Trash",
  programAddress,
  signatureBase64: "signature",
  walletAddress: signer,
};

const getPrivacyIdentity = async () => privacyIdentity;
const clientPreparedOperation: ClientPreparedDeposit = {
  version: 1,
  programAddress: address(programAddress),
  ownerAddress: address(signer),
  recipient: address(signer),
  quote: {
    depositLamports: 10_000_000_000n,
    depositFeeBps: 0,
    depositFeeLamports: 0n,
    privateOutputLamports: 10_000_000_000n,
  },
  createdAt: "2026-06-19T00:00:00.000Z",
  payload: { kind: "test" },
};
const client = {
  unlock: async () => ({
    walletAddress: address(signer),
    message: privacyIdentity.message,
    signature: new Uint8Array([1]),
  }),
  prepareDeposit: async () => clientPreparedOperation,
};

describe("deposit preparation", () => {
  it("quotes deposit output and reads current Merkle state", async () => {
    const prepared = await prepareDeposit(draft, {
      client,
      getPrivacyIdentity,
      indexer,
    });

    expect(prepared).toMatchObject({
      mode: "deposit",
      amount: "10",
      clientPreparedOperation,
      depositAmountLamports: 10_000_000_000n,
      depositFeeLamports: 0n,
      merkleState,
      privateOutputLamports: 10_000_000_000n,
      privacyIdentity,
      signer,
    });
    expect(prepared.quote).toEqual({
      depositLamports: 10_000_000_000n,
      depositFeeBps: 0,
      depositFeeLamports: 0n,
      privateOutputLamports: 10_000_000_000n,
    });
  });

  it("fails cleanly when the backend Merkle state API fails", async () => {
    const failingIndexer = {
      getMerkleState: async () => {
        throw new IndexerError({
          code: "http_error",
          message: "Indexer request failed with HTTP 500.",
          status: 500,
        });
      },
    };

    await expect(
      prepareDeposit(draft, {
        client,
        getPrivacyIdentity,
        indexer: failingIndexer,
      }),
    ).rejects.toThrow("Privacy pool is unavailable. Try again in a moment.");
  });

  it("fails if the wallet changes during preparation", async () => {
    await expect(
      prepareDeposit(draft, {
        client,
        getPrivacyIdentity: async () => ({
          ...privacyIdentity,
          walletAddress: "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
        }),
        indexer,
      }),
    ).rejects.toThrow("Wallet changed. Reconnect the original wallet and try again.");
  });
});
