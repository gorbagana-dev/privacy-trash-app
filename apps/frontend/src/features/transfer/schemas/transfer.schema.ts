import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

export const GOR_DECIMALS = 9;
export const LAMPORTS_PER_GOR = 1_000_000_000n;

const GOR_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

const hasValidLamportPrecision = (value: string) => {
  const decimals = value.split(".")[1] ?? "";

  return decimals.length <= 9;
};

const isPositiveDecimal = (value: string) => Number(value) > 0;

const isValidPublicKey = (value: string) => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
};

const amountSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .regex(GOR_AMOUNT_PATTERN, "Use a plain decimal amount.")
  .refine(isPositiveDecimal, "Amount must be greater than 0.")
  .refine(hasValidLamportPrecision, "GOR supports up to 9 decimal places.");

const recipientSchema = z
  .string()
  .trim()
  .min(1, "Enter a recipient wallet.")
  .refine(isValidPublicKey, "Enter a valid wallet address.");

export function parseGorAmountToLamports(amount: string) {
  const parts = amount.trim().split(".");
  const wholeAmount = parts[0] ?? "0";
  const fractionalAmount = parts[1] ?? "";
  const paddedFractionalAmount = fractionalAmount.padEnd(GOR_DECIMALS, "0");

  return (
    BigInt(wholeAmount) * LAMPORTS_PER_GOR + BigInt(paddedFractionalAmount)
  );
}

export function formatLamportsAsGor(lamports: bigint) {
  const wholeAmount = lamports / LAMPORTS_PER_GOR;
  const fractionalAmount = (lamports % LAMPORTS_PER_GOR)
    .toString()
    .padStart(GOR_DECIMALS, "0")
    .replace(/0+$/, "");

  return fractionalAmount
    ? `${wholeAmount.toString()}.${fractionalAmount}`
    : wholeAmount.toString();
}

export const transferSchema = z
  .object({
    amount: amountSchema,
    recipient: recipientSchema,
  })
  .transform((transfer) => ({
    mode: "transfer" as const,
    ...transfer,
    amountLamports: parseGorAmountToLamports(transfer.amount),
  }));

export const depositSchema = z
  .object({
    amount: amountSchema,
  })
  .transform((deposit) => ({
    mode: "deposit" as const,
    ...deposit,
    amountLamports: parseGorAmountToLamports(deposit.amount),
  }));

export const operationSchema = z
  .object({
    mode: z.enum(["deposit", "transfer"]),
    amount: amountSchema,
    recipient: z.string().trim().optional(),
  })
  .superRefine((operation, context) => {
    if (operation.mode !== "transfer") {
      return;
    }

    const recipient = recipientSchema.safeParse(operation.recipient ?? "");

    if (recipient.success) {
      return;
    }

    for (const issue of recipient.error.issues) {
      context.addIssue({
        ...issue,
        path: ["recipient"],
      });
    }
  })
  .transform((operation) => {
    if (operation.mode === "deposit") {
      return {
        mode: "deposit" as const,
        amount: operation.amount,
        amountLamports: parseGorAmountToLamports(operation.amount),
      };
    }

    return {
      mode: "transfer" as const,
      amount: operation.amount,
      amountLamports: parseGorAmountToLamports(operation.amount),
      recipient: (operation.recipient ?? "").trim(),
    };
  });

export type TransferFormValues = z.input<typeof transferSchema>;
export type ValidTransfer = z.output<typeof transferSchema>;
export type DepositFormValues = z.input<typeof depositSchema>;
export type ValidDeposit = z.output<typeof depositSchema>;
export type OperationFormValues = z.input<typeof operationSchema>;
export type ValidOperation = z.output<typeof operationSchema>;

export const transferDefaults: TransferFormValues = {
  amount: "",
  recipient: "",
};

export const operationDefaults: OperationFormValues = {
  mode: "deposit",
  amount: "",
  recipient: "",
};
