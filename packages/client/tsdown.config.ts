import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

export default defineConfig({
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
  clean: true,
  dts: true,
  deps: {
    neverBundle: [
      /^@lightprotocol\/hasher\.rs/,
      /^@solana\//,
      "@gorbagana/privacy-trash-sdk",
      "zod",
    ],
  },
  entry: ["src/index.ts", "src/browser.ts"],
  format: ["esm"],
  sourcemap: true,
});
