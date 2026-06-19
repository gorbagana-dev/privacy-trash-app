import type { Address } from "@solana/kit";
import { z } from "zod";

import { BASIS_POINTS_DENOMINATOR } from "@/transfer";
import {
  addressSchema,
  basisPointsSchema,
  httpUrlSchema,
  isoTimestampSchema,
  lamportsSchema,
  nonEmptyBytesSchema,
  positiveLamportsSchema,
  safeIntegerSchema,
} from "@/schemas";
import {
  transactionSignatureSchema,
} from "@/transfer";

export const DEPOSIT_EXECUTION_VERSION = 1;

const payloadSchema = z.record(z.string(), z.unknown()).refine(
  (value) => Object.keys(value).length > 0,
  { message: "Prepared deposit payload must not be empty." },
);

const simulationLogsSchema = z.array(z.string()).default([]);

const successfulSimulationSchema = z.strictObject({
  ok: z.literal(true),
  logs: simulationLogsSchema,
  unitsConsumed: safeIntegerSchema.optional(),
});

const failedSimulationSchema = z.strictObject({
  ok: z.literal(false),
  logs: simulationLogsSchema,
  errorMessage: z.string().trim().min(1),
});

export const depositRequestSchema = z.strictObject({
  lamports: positiveLamportsSchema,
});

export const depositQuoteSchema = z
  .strictObject({
    depositLamports: positiveLamportsSchema,
    privateOutputLamports: positiveLamportsSchema,
    depositFeeLamports: lamportsSchema,
    depositFeeBps: basisPointsSchema,
  })
  .superRefine(validateDepositQuoteFields);

export const prepareDepositInputSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  quote: depositQuoteSchema,
  unlockSignature: nonEmptyBytesSchema,
});

export const preparedDepositSchema = z
  .strictObject({
    version: z.literal(DEPOSIT_EXECUTION_VERSION),
    programAddress: addressSchema,
    ownerAddress: addressSchema,
    recipient: addressSchema,
    quote: depositQuoteSchema,
    createdAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema.optional(),
    payload: payloadSchema,
  })
  .superRefine((value, context) => {
    if (
      value.expiresAt !== undefined &&
      Date.parse(value.expiresAt) <= Date.parse(value.createdAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Prepared deposit expiry must be after creation time.",
        path: ["expiresAt"],
      });
    }
  });

export const depositSimulationSchema = z.discriminatedUnion("ok", [
  successfulSimulationSchema,
  failedSimulationSchema,
]);

export const depositReceiptSchema = z.strictObject({
  signature: transactionSignatureSchema,
  sentAt: isoTimestampSchema,
  explorerUrl: httpUrlSchema.optional(),
  slot: safeIntegerSchema.optional(),
});

const depositQuoteInputSchema = depositRequestSchema.extend({
  depositFeeBps: basisPointsSchema,
});

export type DepositRequest = z.infer<typeof depositRequestSchema>;
export type DepositQuoteInput = z.input<typeof depositQuoteInputSchema>;
export type DepositQuote = z.infer<typeof depositQuoteSchema>;
export type PrepareDepositInput = z.infer<typeof prepareDepositInputSchema>;
export type PreparedDeposit = z.infer<typeof preparedDepositSchema>;
export type DepositSimulation = z.infer<typeof depositSimulationSchema>;
export type DepositReceipt = z.infer<typeof depositReceiptSchema>;

export type DepositExecutor = {
  prepareDeposit(input: PrepareDepositInput): Promise<unknown>;
  simulateDeposit(preparedDeposit: PreparedDeposit): Promise<unknown>;
  sendDeposit(preparedDeposit: PreparedDeposit): Promise<unknown>;
};

export type DepositProofProvider = {
  createDepositProofMaterial(input: PrepareDepositInput): Promise<unknown>;
};

export function quoteDeposit(input: DepositQuoteInput): DepositQuote {
  const parsed = depositQuoteInputSchema.parse(input);
  const depositFeeLamports =
    (parsed.lamports * BigInt(parsed.depositFeeBps)) /
    BASIS_POINTS_DENOMINATOR;

  if (depositFeeLamports >= parsed.lamports) {
    throw new RangeError("Deposit amount must be greater than the deposit fee.");
  }

  return depositQuoteSchema.parse({
    depositLamports: parsed.lamports,
    privateOutputLamports: parsed.lamports - depositFeeLamports,
    depositFeeLamports,
    depositFeeBps: parsed.depositFeeBps,
  });
}

export async function prepareDeposit(
  executor: DepositExecutor,
  input: PrepareDepositInput,
): Promise<PreparedDeposit> {
  const parsedInput = prepareDepositInputSchema.parse(input);

  return preparedDepositSchema.parse(await executor.prepareDeposit(parsedInput));
}

export async function simulateDeposit(
  executor: DepositExecutor,
  preparedDeposit: PreparedDeposit,
): Promise<DepositSimulation> {
  const parsedDeposit = preparedDepositSchema.parse(preparedDeposit);

  return depositSimulationSchema.parse(
    await executor.simulateDeposit(parsedDeposit),
  );
}

export async function sendDeposit(
  executor: DepositExecutor,
  preparedDeposit: PreparedDeposit,
): Promise<DepositReceipt> {
  const parsedDeposit = preparedDepositSchema.parse(preparedDeposit);

  return depositReceiptSchema.parse(await executor.sendDeposit(parsedDeposit));
}

export function validatePreparedDeposit(
  preparedDeposit: PreparedDeposit,
  expected: {
    programAddress: Address;
    ownerAddress: Address;
    quote: DepositQuote;
  },
): void {
  if (preparedDeposit.programAddress !== expected.programAddress) {
    throw new Error("Prepared deposit program address does not match.");
  }

  if (preparedDeposit.ownerAddress !== expected.ownerAddress) {
    throw new Error("Prepared deposit owner address does not match.");
  }

  if (preparedDeposit.recipient !== expected.ownerAddress) {
    throw new Error("Prepared deposit recipient does not match owner address.");
  }

  if (!depositQuotesEqual(preparedDeposit.quote, expected.quote)) {
    throw new Error("Prepared deposit quote does not match.");
  }
}

function validateDepositQuoteFields(
  value: z.infer<typeof depositQuoteSchema>,
  context: z.RefinementCtx,
): void {
  if (
    value.depositLamports - value.depositFeeLamports !==
    value.privateOutputLamports
  ) {
    context.addIssue({
      code: "custom",
      message: "Deposit amount minus fee must equal private output lamports.",
      path: ["privateOutputLamports"],
    });
  }

  const expectedFeeLamports =
    (value.depositLamports * BigInt(value.depositFeeBps)) /
    BASIS_POINTS_DENOMINATOR;

  if (value.depositFeeLamports !== expectedFeeLamports) {
    context.addIssue({
      code: "custom",
      message: "Deposit fee does not match depositFeeBps.",
      path: ["depositFeeLamports"],
    });
  }
}

function depositQuotesEqual(
  left: DepositQuote,
  right: DepositQuote,
): boolean {
  return (
    left.depositLamports === right.depositLamports &&
    left.privateOutputLamports === right.privateOutputLamports &&
    left.depositFeeLamports === right.depositFeeLamports &&
    left.depositFeeBps === right.depositFeeBps
  );
}
