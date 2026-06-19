import { describe, expect, it, vi } from "vitest";

import {
  TRANSFER_EXECUTION_VERSION,
  calculateGrossWithdrawalLamports,
  calculateWithdrawalFeeLamports,
  createTransferApproval,
  prepareTransfer,
  preparedTransferSchema,
  quoteTransfer,
  sendTransfer,
  simulateTransfer,
  transferQuoteSchema,
  type PrepareTransferInput,
  type TransferExecutor,
} from "@/transfer";
import { addressSchema } from "@/schemas";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const recipientAddress = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);
const createdAt = "2026-06-18T00:00:00.000Z";
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";

describe("transfer", () => {
  it("quotes private transfer gross withdrawal and shield amount", () => {
    const quote = quoteTransfer({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 250_000n,
      withdrawalFeeBps: 25,
    });

    expect(quote).toEqual({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 250_000n,
      grossWithdrawalLamports: 1_002_506n,
      withdrawalFeeLamports: 2_506n,
      shieldLamports: 752_506n,
      withdrawalFeeBps: 25,
      withdrawRentFeeLamports: 0n,
    });
    expect(
      calculateWithdrawalFeeLamports({
        grossLamports: 1_002_506n,
        withdrawalFeeBps: 25,
      }),
    ).toBe(2_506n);
    expect(
      calculateGrossWithdrawalLamports({
        recipientLamports: 1_000_000n,
        withdrawalFeeBps: 25,
      }),
    ).toBe(1_002_506n);
  });

  it("rejects impossible or inconsistent quotes", () => {
    expect(() =>
      quoteTransfer({
        recipientLamports: 1n,
        privateBalanceLamports: 0n,
        withdrawalFeeBps: 10_000,
      }),
    ).toThrow("withdrawalFeeBps must be less than 10000");

    expect(() =>
      transferQuoteSchema.parse({
        recipientLamports: 10n,
        privateBalanceLamports: 0n,
        grossWithdrawalLamports: 11n,
        withdrawalFeeLamports: 0n,
        shieldLamports: 11n,
        withdrawalFeeBps: 0,
        withdrawRentFeeLamports: 0n,
      }),
    ).toThrow("Gross withdrawal minus fee must equal recipient lamports");
  });

  it("creates approval data for wallet review UI", () => {
    const quote = quoteTransfer({
      recipientLamports: 1n,
      privateBalanceLamports: 0n,
      withdrawalFeeBps: 0,
    });

    expect(
      createTransferApproval({
        quote,
        programAddress,
        signer: ownerAddress,
        recipient: recipientAddress,
        feeRecipient,
        createdAt: new Date(createdAt),
      }),
    ).toMatchObject({
      cluster: "Gorbagana",
      programAddress,
      signer: ownerAddress,
      recipient: recipientAddress,
      requiresSignature: true,
      simulationStatus: "not-simulated",
    });
  });

  it("validates executor prepare, simulate, and send boundaries", async () => {
    const quote = quoteTransfer({
      recipientLamports: 1n,
      privateBalanceLamports: 0n,
      withdrawalFeeBps: 0,
    });
    const input: PrepareTransferInput = {
      programAddress,
      ownerAddress,
      recipient: recipientAddress,
      quote,
      unlockSignature: new Uint8Array([1]),
    };
    const prepared = {
      version: TRANSFER_EXECUTION_VERSION,
      programAddress,
      ownerAddress,
      recipient: recipientAddress,
      quote,
      createdAt,
      payload: { id: "prepared" },
    };
    const executor: TransferExecutor = {
      prepareTransfer: vi.fn(async () => prepared),
      simulateTransfer: vi.fn(async () => ({ ok: true, logs: [] })),
      sendTransfer: vi.fn(async () => ({ signature, sentAt: createdAt })),
    };

    await expect(prepareTransfer(executor, input)).resolves.toEqual(prepared);
    await expect(
      simulateTransfer(executor, preparedTransferSchema.parse(prepared)),
    ).resolves.toEqual({ ok: true, logs: [] });
    await expect(
      sendTransfer(executor, preparedTransferSchema.parse(prepared)),
    ).resolves.toEqual({ signature, sentAt: createdAt });
  });
});
