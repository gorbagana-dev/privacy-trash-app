import {
  AccountRole,
  address,
  type Address,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { buildTransactInstruction } from "@/instructions";

const signer: TransactionSigner = {
  address: address("WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn"),
  async signTransactions() {
    return [];
  },
};

const recipient = address("GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN");
const feeRecipient = address("HnLeEGs8Jk53m9BZBUHa7oAKJWa1QQFBdZVVu4G1ZPkh");
const nullifiers = [
  address("BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL"),
  address("48JDPc91uGGyic2roMgbfAU7svJeHN3WN5TJHPCHuKuS"),
  address("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se"),
  address("2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz"),
] as const;

describe("buildTransactInstruction", () => {
  it("builds the native GOR transact instruction with derived pool accounts", async () => {
    const instruction = await buildTransactInstruction({
      signer,
      recipient,
      feeRecipient,
      nullifiers,
      proof: {
        proofA: bytes(64, 1),
        proofB: bytes(128, 2),
        proofC: bytes(64, 3),
        root: bytes(32, 4),
        publicAmount: bytes(32, 5),
        extDataHash: bytes(32, 6),
        inputNullifiers: [bytes(32, 7), bytes(32, 8)],
        outputCommitments: [bytes(32, 9), bytes(32, 10)],
      },
      extData: {
        extAmount: 0n,
        fee: 0n,
      },
      encryptedOutput1: bytes(64, 11),
      encryptedOutput2: bytes(64, 12),
    });

    expect(instruction.programAddress).toBe(
      "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
    );
    expect(Array.from(instruction.data.slice(0, 8))).toEqual([
      217, 149, 130, 143, 221, 52, 252, 119,
    ]);
    expect(instruction.accounts.map(toComparableAccountMeta)).toEqual([
      {
        address: "62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6",
        role: AccountRole.WRITABLE,
      },
      { address: nullifiers[0], role: AccountRole.WRITABLE },
      { address: nullifiers[1], role: AccountRole.WRITABLE },
      { address: nullifiers[2], role: AccountRole.READONLY },
      { address: nullifiers[3], role: AccountRole.READONLY },
      {
        address: "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
        role: AccountRole.WRITABLE,
      },
      {
        address: "2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz",
        role: AccountRole.READONLY,
      },
      { address: recipient, role: AccountRole.WRITABLE },
      { address: feeRecipient, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER },
      {
        address: "11111111111111111111111111111111",
        role: AccountRole.READONLY,
      },
    ]);
    expect(instruction.accounts[9]).toMatchObject({ signer });
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

function bytes(length: number, value: number): ReadonlyUint8Array {
  return new Uint8Array(length).fill(value);
}
