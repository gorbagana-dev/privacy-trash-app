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
    amount: z
      .string()
      .trim()
      .min(1, "Enter an amount.")
      .regex(GOR_AMOUNT_PATTERN, "Use a plain decimal amount.")
      .refine(isPositiveDecimal, "Amount must be greater than 0.")
      .refine(hasValidLamportPrecision, "GOR supports up to 9 decimal places."),
    recipient: z
      .string()
      .trim()
      .min(1, "Enter a recipient wallet.")
      .refine(isValidPublicKey, "Enter a valid wallet address."),
  })
  .transform((transfer) => ({
    ...transfer,
    amountLamports: parseGorAmountToLamports(transfer.amount),
  }));

export type TransferFormValues = z.input<typeof transferSchema>;
export type ValidTransfer = z.output<typeof transferSchema>;

export const transferDefaults: TransferFormValues = {
  amount: "",
  recipient: "",
};
