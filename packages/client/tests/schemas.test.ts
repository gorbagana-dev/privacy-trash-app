import { describe, expect, it } from "vitest";

import { addressSchema, httpUrlSchema } from "@/schemas";

const recipient = "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN";

describe("schemas", () => {
  it("parses Gorbagana addresses", () => {
    expect(addressSchema.parse(` ${recipient} `)).toBe(recipient);
  });

  it("rejects invalid addresses", () => {
    expect(() => addressSchema.parse("not-an-address")).toThrow();
  });

  it("normalizes HTTP URLs", () => {
    expect(httpUrlSchema.parse("https://rpc.gorbagana.wtf/")).toBe(
      "https://rpc.gorbagana.wtf",
    );
  });

  it("rejects non-HTTP URLs", () => {
    expect(() => httpUrlSchema.parse("ftp://rpc.gorbagana.wtf")).toThrow();
  });
});
