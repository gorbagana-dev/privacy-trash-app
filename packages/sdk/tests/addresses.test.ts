import { describe, expect, it } from "vitest";

import { findPoolAddresses, findPoolAddressValues } from "@/addresses";

describe("pool addresses", () => {
  it("derives the deployed native GOR pool PDAs", async () => {
    await expect(findPoolAddresses()).resolves.toEqual({
      treeAccount: ["62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6", 254],
      treeTokenAccount: [
        "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
        252,
      ],
      globalConfig: ["2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz", 253],
    });
  });

  it("returns address-only pool values for instruction builders", async () => {
    await expect(findPoolAddressValues()).resolves.toEqual({
      treeAccount: "62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6",
      treeTokenAccount: "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
      globalConfig: "2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz",
    });
  });
});

