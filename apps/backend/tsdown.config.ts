import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

export default defineConfig({
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
  clean: true,
  deps: {
    neverBundle: [
      /^@hono\//,
      /^@solana\//,
      /^drizzle-orm/,
      "@gorbagana/privacy-trash-sdk",
      "dotenv",
      "hono",
      "pg",
      "pino",
      "zod",
    ],
  },
  entry: ["src/index.ts"],
  format: ["esm"],
  sourcemap: true,
});
