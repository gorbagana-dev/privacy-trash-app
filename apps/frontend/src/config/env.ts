import { z } from "zod";

export const DEFAULT_GORBAGANA_RPC_URL = "https://rpc.gorbagana.wtf";
export const DEFAULT_PRIVACY_TRASH_API_URL = "http://localhost:3002";
export const DEFAULT_PRIVACY_TRASH_PROGRAM_ADDRESS =
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
export const DEFAULT_HASHER_WASM_BASE_PATH =
  "/vendor/lightprotocol/hasher.rs/0.2.1";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const envSchema = z.object({
  gorbaganaRpcUrl: z.preprocess(
    emptyStringToUndefined,
    z.url().default(DEFAULT_GORBAGANA_RPC_URL),
  ),
  privacyTrashApiUrl: z.preprocess(
    emptyStringToUndefined,
    z.url().default(DEFAULT_PRIVACY_TRASH_API_URL),
  ),
  privacyTrashProgramAddress: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(32).default(DEFAULT_PRIVACY_TRASH_PROGRAM_ADDRESS),
  ),
  hasherWasmBasePath: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).default(DEFAULT_HASHER_WASM_BASE_PATH),
  ),
  siteUrl: z.preprocess(emptyStringToUndefined, z.url().optional()),
});

export const env = envSchema.parse({
  gorbaganaRpcUrl: process.env["NEXT_PUBLIC_GORBAGANA_RPC_URL"],
  privacyTrashApiUrl: process.env["NEXT_PUBLIC_PRIVACY_TRASH_API_URL"],
  privacyTrashProgramAddress:
    process.env["NEXT_PUBLIC_PRIVACY_TRASH_PROGRAM_ADDRESS"],
  hasherWasmBasePath: process.env["NEXT_PUBLIC_HASHER_WASM_BASE_PATH"],
  siteUrl: process.env["NEXT_PUBLIC_SITE_URL"],
});
