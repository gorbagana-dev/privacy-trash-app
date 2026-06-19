import {
  AccountRole,
  address,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  buildInitializeInstruction,
  identifyInstruction,
  parseInstruction,
} from "@/instructions";

const authority: TransactionSigner = {
  address: address("WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn"),
  async signTransactions() {
    return [];
  },
};

describe("buildInitializeInstruction", () => {
  it("builds and parses the native GOR initialize instruction", async () => {
    const instruction = await buildInitializeInstruction({ authority });

    expect(instruction.programAddress).toBe(
      "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
    );
    expect(Array.from(instruction.data)).toEqual([
      175, 175, 109, 31, 13, 152, 155, 237,
    ]);
    expect(instruction.accounts.map(toComparableAccountMeta)).toEqual([
      {
        address: "62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6",
        role: AccountRole.WRITABLE,
      },
      {
        address: "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
        role: AccountRole.WRITABLE,
      },
      {
        address: "2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz",
        role: AccountRole.WRITABLE,
      },
      { address: authority.address, role: AccountRole.WRITABLE_SIGNER },
      {
        address: "11111111111111111111111111111111",
        role: AccountRole.READONLY,
      },
    ]);
    expect(instruction.accounts[3]).toMatchObject({ signer: authority });
    expect(identifyInstruction(instruction)).toBe("initialize");

    const parsed = parseInstruction(instruction);

    expect(parsed?.kind).toBe("initialize");
    if (parsed?.kind !== "initialize") {
      throw new Error("Expected initialize instruction");
    }

    expect(parsed.accounts.treeAccount.address).toBe(
      "62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6",
    );
    expect(parsed.accounts.treeTokenAccount.address).toBe(
      "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
    );
    expect(parsed.accounts.globalConfig.address).toBe(
      "2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz",
    );
    expect(parsed.accounts.authority.address).toBe(authority.address);
  });
});

function toComparableAccountMeta(account: {
  address: Address;
  role: AccountRole;
}) {
  return {
    address: account.address,
    role: account.role,
  };
}
