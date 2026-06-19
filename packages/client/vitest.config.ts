import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@gorbagana/privacy-trash-client": fileURLToPath(
        new URL("./src/index.ts", import.meta.url),
      ),
      "@gorbagana/privacy-trash-client/browser": fileURLToPath(
        new URL("./src/browser.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    exclude: ["node_modules/**", "dist/**"],
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
