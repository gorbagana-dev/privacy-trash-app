import { describe, expect, it, vi } from "vitest";

import {
  executeOperation,
  type ExecuteOperationOptions,
} from "@/features/transfer/logic/execute-operation";
import type { PreparedPrivateOperation } from "@/features/transfer/types/transfer.types";
import type {
  PreparedDeposit as ClientPreparedDeposit,
  PreparedTransfer as ClientPreparedTransfer,
} from "@gorbagana/privacy-trash-client";
import { address } from "@solana/kit";

const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";
const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const signer = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";
const recipient = "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN";
const createdAt = "2026-06-19T00:00:00.000Z";

const clientPreparedDeposit: ClientPreparedDeposit = {
  version: 1,
  programAddress: address(programAddress),
  ownerAddress: address(signer),
  recipient: address(signer),
  quote: {
    depositLamports: 1_000_000_000n,
    depositFeeBps: 0,
    depositFeeLamports: 0n,
    privateOutputLamports: 1_000_000_000n,
  },
  createdAt,
  payload: { kind: "deposit" },
};

const clientPreparedTransfer: ClientPreparedTransfer = {
  version: 1,
  programAddress: address(programAddress),
  ownerAddress: address(signer),
  recipient: address(recipient),
  quote: {
    recipientLamports: 1_000_000_000n,
    privateBalanceLamports: 2_000_000_000n,
    grossWithdrawalLamports: 1_009_533_366n,
    withdrawalFeeLamports: 9_533_366n,
    shieldLamports: 0n,
    withdrawalFeeBps: 35,
    withdrawRentFeeLamports: 6_000_000n,
  },
  createdAt,
  payload: { kind: "transfer" },
};

const preparedDeposit = {
  mode: "deposit",
  amount: "1",
  clientPreparedOperation: clientPreparedDeposit,
  depositAmountLamports: 1_000_000_000n,
  depositFeeLamports: 0n,
  merkleState: {
    treeHeight: 26,
    root: "123",
    nextIndex: 1,
  },
  privateOutputLamports: 1_000_000_000n,
  privacyIdentity: {
    cacheKey: "key",
    fromCache: true,
    message: "Privacy Trash",
    programAddress,
    signatureBase64: "AQ==",
    walletAddress: signer,
  },
  quote: clientPreparedDeposit.quote,
  signer,
} satisfies PreparedPrivateOperation;

const preparedTransfer = {
  mode: "transfer",
  baseWithdrawalFeeLamports: 6_000_000n,
  clientPreparedOperation: clientPreparedTransfer,
  estimatedNetworkFeeLamports: 5_000n,
  estimatedTotalFeeLamports: 9_538_366n,
  grossPrivateSpendLamports: 1_009_533_366n,
  privateNotes: {
    balanceLamports: 2_000_000_000n,
    fetchedOutputCount: 2,
    hasMore: false,
    nextOutputOffset: 2,
    ownedNoteCount: 1,
    privateBalanceLamports: 2_000_000_000n,
    totalOutputCount: 2,
    unspentNoteCount: 1,
  },
  poolStatus: {
    outputCount: 2,
    spentNullifierCount: 0,
    observedRootCount: 1,
    latestOutputIndex: "1",
    latestSlot: "1",
  },
  privacyIdentity: preparedDeposit.privacyIdentity,
  protocolFeeLamports: 3_533_366n,
  recipientAmountLamports: 1_000_000_000n,
  recipient,
  signer: preparedDeposit.signer,
} satisfies PreparedPrivateOperation;

describe("executeOperation", () => {
  it("simulates a deposit before sending it", async () => {
    const client: ExecuteOperationOptions["client"] = {
      simulateDeposit: vi.fn(async () => ({ ok: true as const, logs: [] })),
      sendDeposit: vi.fn(async () => ({
        signature,
        sentAt: "2026-06-19T00:00:00.000Z",
      })),
      simulateTransfer: vi.fn(),
      sendTransfer: vi.fn(),
    };

    const receipt = await executeOperation(preparedDeposit, { client });

    expect(client.simulateDeposit).toHaveBeenCalledWith(
      preparedDeposit.clientPreparedOperation,
    );
    expect(client.sendDeposit).toHaveBeenCalledWith(
      preparedDeposit.clientPreparedOperation,
    );
    expect(receipt).toMatchObject({
      mode: "deposit",
      signature,
    });
  });

  it("does not send a transfer when simulation fails", async () => {
    const client: ExecuteOperationOptions["client"] = {
      simulateDeposit: vi.fn(),
      sendDeposit: vi.fn(),
      simulateTransfer: vi.fn(async () => ({
        ok: false as const,
        logs: [],
        errorMessage: "insufficient private balance",
      })),
      sendTransfer: vi.fn(),
    };

    await expect(
      executeOperation(preparedTransfer, { client }),
    ).rejects.toThrow(
      "Private transfer simulation failed: insufficient private balance",
    );
    expect(client.sendTransfer).not.toHaveBeenCalled();
  });
});
