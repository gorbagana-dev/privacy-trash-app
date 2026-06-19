import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  deps: {
    neverBundle: [/^@solana\//],
  },
  entry: ["src/index.ts"],
  format: ["esm"],
});
