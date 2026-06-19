import {
  AccountRole,
  address,
  type AccountMeta,
  type Address,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { programAddress } from "@/constants";
import {
  buildTransactInstruction,
  identifyInstruction,
  parseInstruction,
} from "@/instructions";

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

describe("instruction parsing", () => {
  it("parses native GOR transact instructions through the public facade", async () => {
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
        extAmount: -10_000_000n,
        fee: 25_062_656n,
      },
      encryptedOutput1: bytes(64, 11),
      encryptedOutput2: bytes(64, 12),
    });

    expect(identifyInstruction(instruction)).toBe("transact");

    const parsed = parseInstruction(instruction);

    expect(parsed?.kind).toBe("transact");
    if (parsed?.kind !== "transact") {
      throw new Error("Expected transact instruction");
    }

    expect(parsed.programAddress).toBe(programAddress);
    expect(parsed.accounts.recipient.address).toBe(recipient);
    expect(parsed.accounts.feeRecipient.address).toBe(feeRecipient);
    expect(parsed.accounts.signer.address).toBe(signer.address);
    expect(parsed.data.extData).toEqual({
      extAmount: -10_000_000n,
      fee: 25_062_656n,
    });
    expect(Array.from(parsed.data.proof.root)).toEqual(
      Array.from(bytes(32, 4)),
    );
    expect(Array.from(parsed.data.encryptedOutput1)).toEqual(
      Array.from(bytes(64, 11)),
    );
    expect(Array.from(parsed.data.encryptedOutput2)).toEqual(
      Array.from(bytes(64, 12)),
    );
  });

  it("parses native GOR initialize instructions", () => {
    const instruction = {
      programAddress,
      data: new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]),
      accounts: [
        meta("62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6", AccountRole.WRITABLE),
        meta(
          "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
          AccountRole.WRITABLE,
        ),
        meta("2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz", AccountRole.WRITABLE),
        {
          address: signer.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer,
        },
        meta("11111111111111111111111111111111", AccountRole.READONLY),
      ],
    } as const;

    expect(identifyInstruction(instruction)).toBe("initialize");

    const parsed = parseInstruction(instruction);

    expect(parsed).toEqual({
      kind: "initialize",
      programAddress,
      accounts: {
        treeAccount: instruction.accounts[0],
        treeTokenAccount: instruction.accounts[1],
        globalConfig: instruction.accounts[2],
        authority: instruction.accounts[3],
        systemProgram: instruction.accounts[4],
      },
    });
  });

  it("returns null for unsupported internal program instructions", () => {
    const transactSplInstruction = {
      programAddress,
      data: new Uint8Array([154, 66, 244, 204, 78, 225, 163, 151]),
      accounts: [] as AccountMeta[],
    };

    expect(identifyInstruction(transactSplInstruction)).toBeNull();
    expect(parseInstruction(transactSplInstruction)).toBeNull();
  });

  it("returns null for instructions from other programs", async () => {
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

    const systemProgramInstruction = {
      ...instruction,
      programAddress: address("11111111111111111111111111111111"),
    };

    expect(identifyInstruction(systemProgramInstruction)).toBeNull();
    expect(parseInstruction(systemProgramInstruction)).toBeNull();
  });
});

function meta(accountAddress: Address | string, role: AccountRole): AccountMeta {
  return {
    address:
      typeof accountAddress === "string" ? address(accountAddress) : accountAddress,
    role,
  };
}

function bytes(length: number, value: number): ReadonlyUint8Array {
  return new Uint8Array(length).fill(value);
}
