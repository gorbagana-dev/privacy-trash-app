import type { Address } from "@solana/kit";
import { z } from "zod";

import {
  addressSchema,
  basisPointsSchema,
  httpUrlSchema,
  isoTimestampSchema,
  lamportsSchema,
  positiveLamportsSchema,
  safeIntegerSchema,
} from "@/schemas";

export const BASIS_POINTS_DENOMINATOR = 10_000n;
export const TRANSFER_EXECUTION_VERSION = 1;

const nonEmptyBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength > 0,
  { message: "Signature bytes must be non-empty." },
);

const payloadSchema = z.record(z.string(), z.unknown()).refine(
  (value) => Object.keys(value).length > 0,
  { message: "Prepared transfer payload must not be empty." },
);

export const transferRequestSchema = z.strictObject({
  recipient: addressSchema,
  recipientLamports: positiveLamportsSchema,
  referrer: addressSchema.optional(),
});

export const transferQuoteSchema = z
  .strictObject({
    recipientLamports: positiveLamportsSchema,
    privateBalanceLamports: lamportsSchema,
    grossWithdrawalLamports: positiveLamportsSchema,
    withdrawalFeeLamports: lamportsSchema,
    shieldLamports: lamportsSchema,
    withdrawalFeeBps: basisPointsSchema,
    withdrawRentFeeLamports: lamportsSchema,
  })
  .superRefine(validateTransferQuoteFields);

export const transferApprovalSchema = transferQuoteSchema.extend({
  cluster: z.literal("Gorbagana"),
  programAddress: addressSchema,
  signer: addressSchema,
  recipient: addressSchema,
  feeRecipient: addressSchema,
  createdAt: isoTimestampSchema,
  simulationStatus: z.enum(["not-simulated", "simulated"]),
  requiresSignature: z.literal(true),
});

export const transactionSignatureSchema = z
  .string()
  .trim()
  .min(32)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, {
    message: "Expected a base58 transaction signature.",
  });

export const prepareTransferInputSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  recipient: addressSchema,
  quote: transferQuoteSchema,
  unlockSignature: nonEmptyBytesSchema,
});

export const preparedTransferSchema = z
  .strictObject({
    version: z.literal(TRANSFER_EXECUTION_VERSION),
    programAddress: addressSchema,
    ownerAddress: addressSchema,
    recipient: addressSchema,
    quote: transferQuoteSchema,
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
        message: "Prepared transfer expiry must be after creation time.",
        path: ["expiresAt"],
      });
    }
  });

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

export const transferSimulationSchema = z.discriminatedUnion("ok", [
  successfulSimulationSchema,
  failedSimulationSchema,
]);

export const transferReceiptSchema = z.strictObject({
  signature: transactionSignatureSchema,
  sentAt: isoTimestampSchema,
  explorerUrl: httpUrlSchema.optional(),
  slot: safeIntegerSchema.optional(),
});

const withdrawalFeeInputSchema = z.strictObject({
  grossLamports: positiveLamportsSchema,
  withdrawalFeeBps: basisPointsSchema,
  withdrawRentFeeLamports: lamportsSchema.default(0n),
});

const grossWithdrawalInputSchema = z.strictObject({
  recipientLamports: positiveLamportsSchema,
  withdrawalFeeBps: basisPointsSchema,
  withdrawRentFeeLamports: lamportsSchema.default(0n),
});

const transferQuoteInputSchema = grossWithdrawalInputSchema.extend({
  privateBalanceLamports: lamportsSchema,
});

export type TransferRequest = z.infer<typeof transferRequestSchema>;
export type WithdrawalFeeInput = z.input<typeof withdrawalFeeInputSchema>;
export type GrossWithdrawalInput = z.input<typeof grossWithdrawalInputSchema>;
export type TransferQuoteInput = z.input<typeof transferQuoteInputSchema>;
export type TransferQuote = z.infer<typeof transferQuoteSchema>;
export type TransferApproval = z.infer<typeof transferApprovalSchema>;
export type CreateTransferApprovalInput = {
  quote: TransferQuote;
  programAddress: string;
  signer: string;
  recipient: string;
  feeRecipient: string;
  createdAt?: Date;
  simulationStatus?: TransferApproval["simulationStatus"];
};
export type PrepareTransferInput = z.infer<typeof prepareTransferInputSchema>;
export type PreparedTransfer = z.infer<typeof preparedTransferSchema>;
export type TransferSimulation = z.infer<typeof transferSimulationSchema>;
export type TransferReceipt = z.infer<typeof transferReceiptSchema>;

export type TransferExecutor = {
  prepareTransfer(input: PrepareTransferInput): Promise<unknown>;
  simulateTransfer(preparedTransfer: PreparedTransfer): Promise<unknown>;
  sendTransfer(preparedTransfer: PreparedTransfer): Promise<unknown>;
};

export function calculateWithdrawalFeeLamports(
  input: WithdrawalFeeInput,
): bigint {
  const { grossLamports, withdrawalFeeBps, withdrawRentFeeLamports } =
    withdrawalFeeInputSchema.parse(input);

  return (
    (grossLamports * BigInt(withdrawalFeeBps)) / BASIS_POINTS_DENOMINATOR +
    withdrawRentFeeLamports
  );
}

export function calculateGrossWithdrawalLamports(
  input: GrossWithdrawalInput,
): bigint {
  const parsed = grossWithdrawalInputSchema.parse(input);

  if (parsed.withdrawalFeeBps >= Number(BASIS_POINTS_DENOMINATOR)) {
    throw new RangeError(
      "withdrawalFeeBps must be less than 10000 to produce recipient output.",
    );
  }

  let low = parsed.recipientLamports;
  let high = parsed.recipientLamports + parsed.withdrawRentFeeLamports + 1n;

  while (recipientOutputLamports(high, parsed) < parsed.recipientLamports) {
    high *= 2n;
  }

  while (low < high) {
    const midpoint = (low + high) / 2n;

    if (recipientOutputLamports(midpoint, parsed) >= parsed.recipientLamports) {
      high = midpoint;
    } else {
      low = midpoint + 1n;
    }
  }

  return low;
}

export function quoteTransfer(input: TransferQuoteInput): TransferQuote {
  const parsed = transferQuoteInputSchema.parse(input);
  const grossWithdrawalLamports = calculateGrossWithdrawalLamports({
    recipientLamports: parsed.recipientLamports,
    withdrawalFeeBps: parsed.withdrawalFeeBps,
    withdrawRentFeeLamports: parsed.withdrawRentFeeLamports,
  });
  const withdrawalFeeLamports = calculateWithdrawalFeeLamports({
    grossLamports: grossWithdrawalLamports,
    withdrawalFeeBps: parsed.withdrawalFeeBps,
    withdrawRentFeeLamports: parsed.withdrawRentFeeLamports,
  });
  const shieldLamports =
    grossWithdrawalLamports > parsed.privateBalanceLamports
      ? grossWithdrawalLamports - parsed.privateBalanceLamports
      : 0n;

  return transferQuoteSchema.parse({
    recipientLamports: parsed.recipientLamports,
    privateBalanceLamports: parsed.privateBalanceLamports,
    grossWithdrawalLamports,
    withdrawalFeeLamports,
    shieldLamports,
    withdrawalFeeBps: parsed.withdrawalFeeBps,
    withdrawRentFeeLamports: parsed.withdrawRentFeeLamports,
  });
}

export function createTransferApproval(
  input: CreateTransferApprovalInput,
): TransferApproval {
  const createdAt = input.createdAt ?? new Date();

  if (Number.isNaN(createdAt.getTime())) {
    throw new RangeError("createdAt must be a valid Date.");
  }

  return transferApprovalSchema.parse({
    ...input.quote,
    cluster: "Gorbagana",
    programAddress: input.programAddress,
    signer: input.signer,
    recipient: input.recipient,
    feeRecipient: input.feeRecipient,
    createdAt: createdAt.toISOString(),
    simulationStatus: input.simulationStatus ?? "not-simulated",
    requiresSignature: true,
  });
}

export async function prepareTransfer(
  executor: TransferExecutor,
  input: PrepareTransferInput,
): Promise<PreparedTransfer> {
  const parsedInput = prepareTransferInputSchema.parse(input);

  return preparedTransferSchema.parse(
    await executor.prepareTransfer(parsedInput),
  );
}

export async function simulateTransfer(
  executor: TransferExecutor,
  preparedTransfer: PreparedTransfer,
): Promise<TransferSimulation> {
  const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);

  return transferSimulationSchema.parse(
    await executor.simulateTransfer(parsedTransfer),
  );
}

export async function sendTransfer(
  executor: TransferExecutor,
  preparedTransfer: PreparedTransfer,
): Promise<TransferReceipt> {
  const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);

  return transferReceiptSchema.parse(await executor.sendTransfer(parsedTransfer));
}

export function validatePreparedTransfer(
  preparedTransfer: PreparedTransfer,
  expected: {
    programAddress: Address;
    ownerAddress: Address;
    recipient: Address;
    quote: TransferQuote;
  },
): void {
  if (preparedTransfer.programAddress !== expected.programAddress) {
    throw new Error("Prepared transfer program address does not match.");
  }

  if (preparedTransfer.ownerAddress !== expected.ownerAddress) {
    throw new Error("Prepared transfer owner address does not match.");
  }

  if (preparedTransfer.recipient !== expected.recipient) {
    throw new Error("Prepared transfer recipient does not match.");
  }

  if (!transferQuotesEqual(preparedTransfer.quote, expected.quote)) {
    throw new Error("Prepared transfer quote does not match.");
  }
}

function recipientOutputLamports(
  grossLamports: bigint,
  input: {
    withdrawalFeeBps: number;
    withdrawRentFeeLamports: bigint;
  },
): bigint {
  return (
    grossLamports -
    calculateWithdrawalFeeLamports({
      grossLamports,
      withdrawalFeeBps: input.withdrawalFeeBps,
      withdrawRentFeeLamports: input.withdrawRentFeeLamports,
    })
  );
}

function validateTransferQuoteFields(
  value: z.infer<typeof transferQuoteSchema>,
  context: z.RefinementCtx,
): void {
  if (
    value.grossWithdrawalLamports - value.withdrawalFeeLamports !==
    value.recipientLamports
  ) {
    context.addIssue({
      code: "custom",
      message: "Gross withdrawal minus fee must equal recipient lamports.",
      path: ["grossWithdrawalLamports"],
    });
  }

  const expectedShieldLamports =
    value.grossWithdrawalLamports > value.privateBalanceLamports
      ? value.grossWithdrawalLamports - value.privateBalanceLamports
      : 0n;

  if (value.shieldLamports !== expectedShieldLamports) {
    context.addIssue({
      code: "custom",
      message: "Shield lamports must cover the private balance shortfall.",
      path: ["shieldLamports"],
    });
  }
}

function transferQuotesEqual(left: TransferQuote, right: TransferQuote): boolean {
  return (
    left.recipientLamports === right.recipientLamports &&
    left.privateBalanceLamports === right.privateBalanceLamports &&
    left.grossWithdrawalLamports === right.grossWithdrawalLamports &&
    left.withdrawalFeeLamports === right.withdrawalFeeLamports &&
    left.shieldLamports === right.shieldLamports &&
    left.withdrawalFeeBps === right.withdrawalFeeBps &&
    left.withdrawRentFeeLamports === right.withdrawRentFeeLamports
  );
}
