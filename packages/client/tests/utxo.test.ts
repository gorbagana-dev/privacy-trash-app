import { describe, expect, it, vi } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  NATIVE_TOKEN_SENTINEL,
  UTXO_ENCRYPTION_VERSION_V2,
  addressSchema,
  createUtxoDecryptor,
  type PoseidonHasher,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const nullifierHex =
  "00000000000000000000000000000000000000000000000000000000000003ec";

describe("utxo", () => {
  it("decrypts native encrypted UTXOs into owned notes", async () => {
    const noteKey = keccak_256(new Uint8Array([1, 2, 3]));
    const encryptedOutput = await encryptUtxoPayload({
      noteKey,
      payload: `100|9|7|${NATIVE_TOKEN_SENTINEL}`,
    });
    const hasher = createSequencedHasher(["1001", "1002", "1003", "1004"]);
    const decryptor = createUtxoDecryptor({ hasher });

    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey,
        encryptedOutput,
      }),
    ).resolves.toEqual({
      commitment: "1002",
      nullifier: nullifierHex,
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
        nullifierHex,
        mintAddress: NATIVE_TOKEN_SENTINEL,
      },
    });
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(1, [
      expect.stringMatching(/^\d+$/),
    ]);
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(2, [
      "100",
      "1001",
      "9",
      NATIVE_TOKEN_SENTINEL,
    ]);
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(3, [
      expect.stringMatching(/^\d+$/),
      "1002",
      "7",
    ]);
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(4, [
      "1002",
      "7",
      "1003",
    ]);
  });

  it("returns null for encrypted outputs that do not belong to the note key", async () => {
    const noteKey = keccak_256(new Uint8Array([1, 2, 3]));
    const encryptedOutput = await encryptUtxoPayload({
      noteKey,
      payload: `100|9|7|${NATIVE_TOKEN_SENTINEL}`,
    });
    const decryptor = createUtxoDecryptor({
      hasher: createSequencedHasher(["1001", "1002", "1003", "1004"]),
    });

    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey: keccak_256(new Uint8Array([9, 9, 9])),
        encryptedOutput,
      }),
    ).resolves.toBeNull();
  });

  it("returns null for zero-value and non-native UTXOs", async () => {
    const noteKey = keccak_256(new Uint8Array([1, 2, 3]));
    const decryptor = createUtxoDecryptor({
      hasher: createSequencedHasher(["1001", "1002", "1003", "1004"]),
    });
    const zeroValueOutput = await encryptUtxoPayload({
      noteKey,
      payload: `0|9|7|${NATIVE_TOKEN_SENTINEL}`,
    });
    const splOutput = await encryptUtxoPayload({
      noteKey,
      payload: "100|9|7|So11111111111111111111111111111111111111112",
    });

    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey,
        encryptedOutput: zeroValueOutput,
      }),
    ).resolves.toBeNull();
    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey,
        encryptedOutput: splOutput,
      }),
    ).resolves.toBeNull();
  });

  it("rejects authenticated but malformed UTXO payloads", async () => {
    const noteKey = keccak_256(new Uint8Array([1, 2, 3]));
    const encryptedOutput = await encryptUtxoPayload({
      noteKey,
      payload: "not-a-utxo",
    });
    const decryptor = createUtxoDecryptor({
      hasher: createSequencedHasher(["1001", "1002", "1003", "1004"]),
    });

    await expect(
      decryptor.decryptOwnedNote({
        programAddress,
        ownerAddress,
        noteKey,
        encryptedOutput,
      }),
    ).rejects.toThrow("Invalid decrypted UTXO payload");
  });
});

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

async function encryptUtxoPayload(input: {
  noteKey: Uint8Array;
  payload: string;
}): Promise<string> {
  const iv = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(input.noteKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      new TextEncoder().encode(input.payload),
    ),
  );
  const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.byteLength - 16);
  const authTag = encryptedWithTag.slice(encryptedWithTag.byteLength - 16);

  return bytesToHex(
    concatBytes([
      UTXO_ENCRYPTION_VERSION_V2,
      iv,
      authTag,
      ciphertext,
    ]),
  );
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}
