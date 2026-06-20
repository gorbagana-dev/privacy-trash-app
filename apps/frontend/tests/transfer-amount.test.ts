import { describe, expect, it } from "vitest";

import {
  commonGorAmounts,
  formatCommonGorAmount,
} from "@/features/transfer/logic/amount-presets";
import {
  formatLamportsAsGor,
  parseGorAmountToLamports,
} from "@/features/transfer/schemas/transfer.schema";

describe("GOR amount conversion", () => {
  it("parses whole GOR amounts to lamports", () => {
    expect(parseGorAmountToLamports("1")).toBe(1_000_000_000n);
    expect(parseGorAmountToLamports("10")).toBe(10_000_000_000n);
  });

  it("parses fractional GOR amounts exactly", () => {
    expect(parseGorAmountToLamports("0.000000001")).toBe(1n);
    expect(parseGorAmountToLamports("10.25")).toBe(10_250_000_000n);
  });

  it("formats lamports back to trimmed GOR amounts", () => {
    expect(formatLamportsAsGor(1n)).toBe("0.000000001");
    expect(formatLamportsAsGor(10_250_000_000n)).toBe("10.25");
    expect(formatLamportsAsGor(10_000_000_000n)).toBe("10");
  });

  it("keeps common privacy denominations stable", () => {
    expect(commonGorAmounts).toEqual([
      "1000",
      "5000",
      "10000",
      "25000",
      "50000",
      "100000",
    ]);
    expect(commonGorAmounts.map(formatCommonGorAmount)).toEqual([
      "1,000",
      "5,000",
      "10,000",
      "25,000",
      "50,000",
      "100,000",
    ]);
  });
});
