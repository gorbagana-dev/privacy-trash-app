import { keccak_256 } from "@noble/hashes/sha3.js";
import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_TOKEN_SENTINEL,
  UTXO_ENCRYPTION_VERSION_V2,
  addressSchema,
  bytesToHex,
  createOutputBlinding,
  createOutputEncryptor,
  createRandomFieldElement,
  createUtxoDecryptor,
  encryptedOutputBytesToHex,
  serializeOutputPayload,
  type PoseidonHasher,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const unlockSignature = new Uint8Array([1, 2, 3, 4]);
const fixedIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe("output", () => {
  it("creates random scalar-field blindings", async () => {
    const blinding = createOutputBlinding({
      randomBytes: () => new Uint8Array(31).fill(7),
    });

    await expect(
      blinding.createBlinding({
        kind: "change",
        outputIndex: 1,
        transfer: createTransfer(),
      }),
    ).resolves.toMatch(/^\d+$/);
  });

  it("retries random field generation when zero bytes are returned", () => {
    const randomBytes = vi
      .fn()
      .mockReturnValueOnce(new Uint8Array(31))
      .mockReturnValueOnce(new Uint8Array(31).fill(1));

    expect(createRandomFieldElement(randomBytes)).toMatch(/^\d+$/);
    expect(randomBytes).toHaveBeenCalledTimes(2);
  });

  it("serializes output payloads in the decryptor-compatible format", () => {
    expect(
      serializeOutputPayload({
        amountLamports: 100n,
        blinding: "9",
        index: 7,
        mintAddress: NATIVE_TOKEN_SENTINEL,
      }),
    ).toBe(`100|9|7|${NATIVE_TOKEN_SENTINEL}`);
  });

  it("encrypts outputs that roundtrip through the UTXO decryptor", async () => {
    const encryptor = createOutputEncryptor({
      randomBytes: () => fixedIv,
    });
    const encryptedOutput = parseBytes(
      await encryptor.encryptOutput({
        kind: "change",
        amountLamports: 100n,
        blinding: "9",
        index: 7,
        publicKey: "1001",
        mintAddress: NATIVE_TOKEN_SENTINEL,
        commitment: "1002",
        programAddress,
        ownerAddress,
        unlockSignature,
      }),
    );
    const decryptor = createUtxoDecryptor({
      hasher: createSequencedHasher(["1001", "1002", "1003", "1004"]),
    });

    expect(bytesToHex(encryptedOutput.slice(0, 8))).toBe(
      bytesToHex(UTXO_ENCRYPTION_VERSION_V2),
    );
    expect(bytesToHex(encryptedOutput.slice(8, 20))).toBe(bytesToHex(fixedIv));
    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey: keccak_256(unlockSignature),
        encryptedOutput: encryptedOutputBytesToHex(encryptedOutput),
      }),
    ).resolves.toEqual({
      commitment: "1002",
      nullifier:
        "00000000000000000000000000000000000000000000000000000000000003ec",
      amountLamports: 100n,
      witness: {
        version: "v2",
        amountLamports: 100n,
        blinding: "9",
        index: 7,
        privateKey: expect.stringMatching(/^\d+$/),
        publicKey: "1001",
        commitment: "1002",
        nullifier: "1004",
        nullifierHex:
          "00000000000000000000000000000000000000000000000000000000000003ec",
        mintAddress: NATIVE_TOKEN_SENTINEL,
      },
    });
  });

  it("does not decrypt with a different unlock signature", async () => {
    const encryptor = createOutputEncryptor({
      randomBytes: () => fixedIv,
    });
    const encryptedOutput = parseBytes(
      await encryptor.encryptOutput({
        kind: "change",
        amountLamports: 100n,
        blinding: "9",
        index: 7,
        publicKey: "1001",
        mintAddress: NATIVE_TOKEN_SENTINEL,
        commitment: "1002",
        programAddress,
        ownerAddress,
        unlockSignature,
      }),
    );
    const decryptor = createUtxoDecryptor({
      hasher: createSequencedHasher(["1001", "1002", "1003", "1004"]),
    });

    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey: keccak_256(new Uint8Array([9, 9, 9])),
        encryptedOutput: encryptedOutputBytesToHex(encryptedOutput),
      }),
    ).resolves.toBeNull();
  });
});

function createTransfer() {
  return {
    programAddress,
    ownerAddress,
    recipient: ownerAddress,
    quote: {
      recipientLamports: 90n,
      privateBalanceLamports: 100n,
      grossWithdrawalLamports: 90n,
      withdrawalFeeLamports: 0n,
      shieldLamports: 0n,
      withdrawalFeeBps: 0,
      withdrawRentFeeLamports: 0n,
    },
    unlockSignature,
  };
}

function createSequencedHasher(outputs: string[]): PoseidonHasher {
  return {
    poseidonHashString: vi.fn(() => {
      const output = outputs.shift();

      if (output === undefined) {
        throw new Error("Unexpected Poseidon hash call.");
      }

      return output;
    }),
  };
}

function parseBytes(input: unknown): Uint8Array {
  if (!(input instanceof Uint8Array)) {
    throw new Error("Expected bytes.");
  }

  return input;
}
