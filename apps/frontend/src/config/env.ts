import { z } from "zod";

export const DEFAULT_GORBAGANA_RPC_URL = "https://rpc.gorbagana.wtf";
export const DEFAULT_PRIVACY_TRASH_API_URL = "http://localhost:3002";
export const DEFAULT_PRIVACY_TRASH_PROGRAM_ADDRESS =
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
export const DEFAULT_PRIVACY_TRASH_FEE_RECIPIENT =
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";
export const DEFAULT_HASHER_WASM_BASE_PATH =
  "/vendor/lightprotocol/hasher.rs/0.2.1";
export const DEFAULT_CIRCUIT_BASE_PATH = "/circuit2";
export const DEFAULT_EXPLORER_BASE_URL = "https://explorer.gorbagana.wtf";

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
  privacyTrashFeeRecipient: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(32).default(DEFAULT_PRIVACY_TRASH_FEE_RECIPIENT),
  ),
  hasherWasmBasePath: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).default(DEFAULT_HASHER_WASM_BASE_PATH),
  ),
  circuitBasePath: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).default(DEFAULT_CIRCUIT_BASE_PATH),
  ),
  explorerBaseUrl: z.preprocess(
    emptyStringToUndefined,
    z.url().default(DEFAULT_EXPLORER_BASE_URL),
  ),
  privacyTrashAltAddress: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(32).optional(),
  ),
  siteUrl: z.preprocess(emptyStringToUndefined, z.url().optional()),
});

export const env = envSchema.parse({
  gorbaganaRpcUrl: process.env["NEXT_PUBLIC_GORBAGANA_RPC_URL"],
  privacyTrashApiUrl: process.env["NEXT_PUBLIC_PRIVACY_TRASH_API_URL"],
  privacyTrashProgramAddress:
    process.env["NEXT_PUBLIC_PRIVACY_TRASH_PROGRAM_ADDRESS"],
  privacyTrashFeeRecipient:
    process.env["NEXT_PUBLIC_PRIVACY_TRASH_FEE_RECIPIENT"],
  hasherWasmBasePath: process.env["NEXT_PUBLIC_HASHER_WASM_BASE_PATH"],
  circuitBasePath: process.env["NEXT_PUBLIC_CIRCUIT_BASE_PATH"],
  explorerBaseUrl: process.env["NEXT_PUBLIC_EXPLORER_BASE_URL"],
  privacyTrashAltAddress: process.env["NEXT_PUBLIC_PRIVACY_TRASH_ALT_ADDRESS"],
  siteUrl: process.env["NEXT_PUBLIC_SITE_URL"],
});
