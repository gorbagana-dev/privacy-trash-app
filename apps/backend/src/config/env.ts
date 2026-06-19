import "dotenv/config";

import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveIntegerSchema = z.coerce.number().int().positive();
const booleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
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
  DRIZZLE_LOG_QUERIES: booleanStringSchema,
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
  PRIVACY_TRASH_PROGRAM_ADDRESS: z
    .string()
    .trim()
    .min(32)
    .default("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se"),
  EXPLORER_BASE_URL: z.url().default("https://explorer.gorbagana.wtf"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(values: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(values);
}
