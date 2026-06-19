import { describe, expect, it } from "vitest";

import { formatPrivateBalance } from "@/features/transfer/logic/private-balance";

describe("formatPrivateBalance", () => {
  it("formats zero with two decimals", () => {
    expect(formatPrivateBalance(0n)).toBe("0.00");
  });

  it("formats whole GOR with two decimals", () => {
    expect(formatPrivateBalance(31_000_000_000n)).toBe("31.00");
  });

  it("formats fractional GOR to two decimals", () => {
    expect(formatPrivateBalance(31_924_736_579n)).toBe("31.92");
  });

  it("keeps tiny nonzero balances visible", () => {
    expect(formatPrivateBalance(1n)).toBe("<0.01");
  });
});
