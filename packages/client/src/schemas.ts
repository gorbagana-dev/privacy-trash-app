import { address, isAddress } from "@solana/kit";
import { z } from "zod";

export const lamportsSchema = z.bigint().nonnegative();
export const positiveLamportsSchema = z.bigint().positive();
export const basisPointsSchema = z.number().int().min(0).max(10_000);
export const safeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const fieldElementHexSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase());

export const nonEmptyBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength > 0,
  { message: "Expected non-empty bytes." },
);

export const addressSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isAddress(value), {
    message: "Expected a valid Gorbagana address.",
  })
  .transform((value) => address(value));

export const httpUrlSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .transform((value) => new URL(value))
  .refine((value) => value.protocol === "http:" || value.protocol === "https:", {
    message: "Expected an HTTP or HTTPS URL.",
  })
  .transform((value) => value.href.replace(/\/$/, ""));

export const isoTimestampSchema = z.string().refine(
  (value) => {
    const parsed = Date.parse(value);

    return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
  },
  { message: "Expected a UTC ISO-8601 timestamp." },
);
