import { describe, expect, it, vi } from "vitest";

import {
  DEPOSIT_EXECUTION_VERSION,
  addressSchema,
  preparedDepositSchema,
  prepareDeposit,
  quoteDeposit,
  sendDeposit,
  simulateDeposit,
  validatePreparedDeposit,
  type DepositExecutor,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const createdAt = "2026-06-16T15:33:33.000Z";
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";

describe("deposit", () => {
  it("quotes native private deposits from configured fee bps", () => {
    expect(
      quoteDeposit({
        lamports: 1_000_000n,
        depositFeeBps: 25,
      }),
    ).toEqual({
      depositLamports: 1_000_000n,
      privateOutputLamports: 997_500n,
      depositFeeLamports: 2_500n,
      depositFeeBps: 25,
    });

    expect(
      quoteDeposit({
        lamports: 1_000_000n,
        depositFeeBps: 0,
      }),
    ).toEqual({
      depositLamports: 1_000_000n,
      privateOutputLamports: 1_000_000n,
      depositFeeLamports: 0n,
      depositFeeBps: 0,
    });
  });

  it("rejects deposits that would produce no private output", () => {
    expect(() =>
      quoteDeposit({
        lamports: 1n,
        depositFeeBps: 10_000,
      }),
    ).toThrow("Deposit amount must be greater than the deposit fee");
  });

  it("validates executor prepared deposits and transaction results", async () => {
    const quote = quoteDeposit({
      lamports: 1_000_000n,
      depositFeeBps: 0,
    });
    const executor: DepositExecutor = {
      prepareDeposit: vi.fn(async () => ({
        version: DEPOSIT_EXECUTION_VERSION,
        programAddress,
        ownerAddress,
        recipient: ownerAddress,
        quote,
        createdAt,
        payload: {
          kind: "test.deposit",
        },
      })),
      simulateDeposit: vi.fn(async () => ({
        ok: true,
        logs: ["Program log: Instruction: Transact"],
        unitsConsumed: 200_000,
      })),
      sendDeposit: vi.fn(async () => ({
        signature,
        sentAt: createdAt,
        slot: 66_920_165,
      })),
    };

    const prepared = await prepareDeposit(executor, {
      programAddress,
      ownerAddress,
      quote,
      unlockSignature: new Uint8Array([1, 2, 3]),
    });

    expect(prepared).toEqual(
      preparedDepositSchema.parse({
        version: DEPOSIT_EXECUTION_VERSION,
        programAddress,
        ownerAddress,
        recipient: ownerAddress,
        quote,
        createdAt,
        payload: {
          kind: "test.deposit",
        },
      }),
    );
    validatePreparedDeposit(prepared, {
      programAddress,
      ownerAddress,
      quote,
    });
    await expect(simulateDeposit(executor, prepared)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 200_000,
    });
    await expect(sendDeposit(executor, prepared)).resolves.toEqual({
      signature,
      sentAt: createdAt,
      slot: 66_920_165,
    });
  });

  it("rejects prepared deposits that do not match the requested scope", () => {
    const quote = quoteDeposit({
      lamports: 1_000_000n,
      depositFeeBps: 0,
    });
    const prepared = preparedDepositSchema.parse({
      version: DEPOSIT_EXECUTION_VERSION,
      programAddress,
      ownerAddress,
      recipient: programAddress,
      quote,
      createdAt,
      payload: {
        kind: "test.deposit",
      },
    });

    expect(() =>
      validatePreparedDeposit(prepared, {
        programAddress,
        ownerAddress,
        quote,
      }),
    ).toThrow("recipient does not match");
  });
});
