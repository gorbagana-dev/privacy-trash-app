import type { HasherWasmInput } from "@gorbagana/privacy-trash-client/browser";

import { env } from "@/config/env";

export function getHasherWasmInput(): HasherWasmInput {
  const basePath = env.hasherWasmBasePath.replace(/\/$/, "");

  return {
    sisd: `${basePath}/light_wasm_hasher_bg.wasm`,
    simd: `${basePath}/hasher_wasm_simd_bg.wasm`,
  };
}
