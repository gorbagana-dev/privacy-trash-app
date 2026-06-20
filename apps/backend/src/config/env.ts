import "dotenv/config";

import { address, isAddress } from "@solana/kit";
import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveIntegerSchema = z.coerce.number().int().positive();
const indexerLimitSchema = z.coerce.number().int().min(1).max(1000);
const indexerProcessLimitSchema = z.coerce.number().int().min(1).max(100);
const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;
const addressStringSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value), {
    message: "Expected a valid Gorbagana address.",
  })
  .transform((value) => address(value));
const postgresUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Expected a postgres:// or postgresql:// URL.",
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: portSchema.default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: postgresUrlSchema,
  DATABASE_POOL_MAX: positiveIntegerSchema.default(10),
  DRIZZLE_LOG_QUERIES: booleanStringSchema.default(false),
  API_BODY_LIMIT_BYTES: positiveIntegerSchema.default(1_048_576),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .trim()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  GORBAGANA_RPC_URL: z.url().default("https://rpc.gorbagana.wtf"),
  PRIVACY_TRASH_PROGRAM_ADDRESS: addressStringSchema.default(
    address("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se"),
  ),
  EXPLORER_BASE_URL: z.url().default("https://explorer.gorbagana.wtf"),
  PRIVACY_TRASH_FEE_RECIPIENT: addressStringSchema.default(
    address("WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn"),
  ),
  PRIVACY_TRASH_ALT_ADDRESS: z.preprocess(
    emptyStringToUndefined,
    addressStringSchema.optional(),
  ),
  RELAYER_KEYPAIR_PATH: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional(),
  ),
  RELAYER_PRIVATE_KEY_BASE58: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional(),
  ),
  RELAYER_KEYPAIR_JSON: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional(),
  ),
  RELAYER_CONFIRMATION_TIMEOUT_MS: positiveIntegerSchema.default(60_000),
  RELAYER_CONFIRMATION_POLL_INTERVAL_MS: positiveIntegerSchema.default(1_000),
  RELAYER_MAX_SEND_RETRIES: positiveIntegerSchema.default(5),
  INDEXER_AUTO_RUN: booleanStringSchema.default(true),
  INDEXER_POLL_INTERVAL_MS: positiveIntegerSchema.default(5_000),
  INDEXER_DISCOVERY_LIMIT: indexerLimitSchema.default(100),
  INDEXER_PROCESSING_LIMIT: indexerProcessLimitSchema.default(20),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(values: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(values);
}
