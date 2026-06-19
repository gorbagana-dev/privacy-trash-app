import { describe, expect, it } from "vitest";

import { loadEnv } from "@/config/env";

describe("loadEnv", () => {
  it("loads required database config and defaults public chain config", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/privacy_trash",
    });

    expect(env.DATABASE_URL).toBe("postgres://postgres:postgres@localhost:5432/privacy_trash");
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DRIZZLE_LOG_QUERIES).toBe(false);
    expect(env.GORBAGANA_RPC_URL).toBe("https://rpc.gorbagana.wtf");
    expect(env.PRIVACY_TRASH_PROGRAM_ADDRESS).toBe(
      "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
    );
  });

  it("rejects non-postgres database URLs", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "https://example.com/db",
      }),
    ).toThrow("Expected a postgres:// or postgresql:// URL.");
  });
});
