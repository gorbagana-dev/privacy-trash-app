import { isAddress } from "@solana/kit";
import { describe, expect, it } from "vitest";

import { programAddress } from "@/constants";

describe("programAddress", () => {
  it("points to the deployed Privacy Trash program", () => {
    expect(programAddress).toBe("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se");
    expect(isAddress(programAddress)).toBe(true);
  });
});

