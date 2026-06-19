import { describe, expect, it } from "vitest";

import { formatAmount, parseAmount } from "@/amount";

describe("amount", () => {
  it("parses and formats native amounts without floats", () => {
    expect(parseAmount("1")).toBe(1_000_000_000n);
    expect(parseAmount("0.000000001")).toBe(1n);
    expect(formatAmount(1_250_000_000n)).toBe("1.25");
  });

  it("rejects invalid precision and negative formatting", () => {
    expect(() => parseAmount("0.0000000001")).toThrow(
      "Expected a native amount",
    );
    expect(() => formatAmount(-1n)).toThrow("lamports must be non-negative");
  });
});
