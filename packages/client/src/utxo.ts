import { keccak_256 } from "@noble/hashes/sha3.js";
import { z } from "zod";

import { noteKeySchema } from "@/encryption";
import {
  FIELD_SIZE,
  bytesToHex,
  decimalToFieldHex,
  fieldElementDecimalSchema,
} from "@/field";
import { encryptedOutputSchema } from "@/notes";
import { fieldElementHexSchema, positiveLamportsSchema } from "@/schemas";
import type { DecryptedOwnedNote, OwnedNoteDecryptor } from "@/owned";

export const NATIVE_TOKEN_SENTINEL = "11111111111111111111111111111112";
export const UTXO_ENCRYPTION_VERSION_V2 = Uint8Array.from([
  0, 0, 0, 0, 0, 0, 0, 2,
]);

const safeOutputIndexSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const rawDecryptedPayloadSchema = z.strictObject({
  amountLamports: z.bigint().nonnegative(),
  blinding: fieldElementDecimalSchema,
  index: safeOutputIndexSchema,
  mintAddress: z.string().trim().min(1),
});

const decryptedPayloadSchema = rawDecryptedPayloadSchema.extend({
  mintAddress: z.literal(NATIVE_TOKEN_SENTINEL),
});

export type PoseidonHasher = {
  poseidonHashString(values: readonly string[]): string;
};

export const utxoWitnessSchema = z.strictObject({
  version: z.literal("v2"),
  amountLamports: positiveLamportsSchema,
  blinding: fieldElementDecimalSchema,
  index: safeOutputIndexSchema,
  privateKey: fieldElementDecimalSchema,
  publicKey: fieldElementDecimalSchema,
  commitment: fieldElementDecimalSchema,
  nullifier: fieldElementDecimalSchema,
  nullifierHex: fieldElementHexSchema,
  mintAddress: z.literal(NATIVE_TOKEN_SENTINEL),
});

export type UtxoWitness = z.infer<typeof utxoWitnessSchema>;

export type CreateUtxoDecryptorInput = {
  hasher: PoseidonHasher;
  crypto?: Pick<Crypto, "subtle"> | undefined;
};

export function createUtxoDecryptor(
  input: CreateUtxoDecryptorInput,
): OwnedNoteDecryptor {
  return {
    async decryptOwnedNote(decryptInput) {
      const encryptedOutput = encryptedOutputSchema.parse(
        decryptInput.encryptedOutput,
      );
      const noteKey = noteKeySchema.parse(decryptInput.noteKey);
      const encryptedBytes = hexToBytes(encryptedOutput);

      if (!startsWithBytes(encryptedBytes, UTXO_ENCRYPTION_VERSION_V2)) {
        return null;
      }

      const decrypted = await decryptV2({
        crypto: input.crypto,
        noteKey,
        encryptedBytes,
      });

      if (decrypted === null) return null;

      const rawPayload = parseDecryptedPayload(new TextDecoder().decode(decrypted));

      if (
        rawPayload.amountLamports === 0n ||
        rawPayload.mintAddress !== NATIVE_TOKEN_SENTINEL
      ) {
        return null;
      }

      return createDecryptedOwnedNote({
        hasher: input.hasher,
        payload: decryptedPayloadSchema.parse(rawPayload),
        noteKey,
      });
    },
  };
}

async function decryptV2(input: {
  crypto: Pick<Crypto, "subtle"> | undefined;
  noteKey: Uint8Array;
  encryptedBytes: Uint8Array;
}): Promise<Uint8Array | null> {
  const subtle = input.crypto?.subtle ?? globalThis.crypto?.subtle;

  if (subtle === undefined) {
    throw new Error("Web Crypto is required to decrypt Privacy Trash notes.");
  }

  const iv = input.encryptedBytes.slice(8, 20);
  const authTag = input.encryptedBytes.slice(20, 36);
  const ciphertext = input.encryptedBytes.slice(36);

  if (iv.byteLength !== 12 || authTag.byteLength !== 16 || ciphertext.byteLength === 0) {
    return null;
  }

  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(input.noteKey),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  try {
    const decrypted = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
      },
      key,
      toArrayBuffer(concatBytes([ciphertext, authTag])),
    );

    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
}

function createDecryptedOwnedNote(input: {
  hasher: PoseidonHasher;
  payload: z.infer<typeof decryptedPayloadSchema>;
  noteKey: Uint8Array;
}): DecryptedOwnedNote {
  const privateKey = fieldFromBytes(keccak_256(input.noteKey));
  const publicKey = input.hasher.poseidonHashString([privateKey]);
  const commitment = input.hasher.poseidonHashString([
    input.payload.amountLamports.toString(),
    publicKey,
    input.payload.blinding,
    input.payload.mintAddress,
  ]);
  const signature = input.hasher.poseidonHashString([
    privateKey,
    commitment,
    input.payload.index.toString(),
  ]);
  const nullifier = input.hasher.poseidonHashString([
    commitment,
    input.payload.index.toString(),
    signature,
  ]);
  const nullifierHex = decimalToFieldHex(nullifier);
  const witness = utxoWitnessSchema.parse({
    version: "v2",
    amountLamports: input.payload.amountLamports,
    blinding: input.payload.blinding,
    index: input.payload.index,
    privateKey,
    publicKey,
    commitment,
    nullifier,
    nullifierHex,
    mintAddress: input.payload.mintAddress,
  });

  return {
    commitment,
    nullifier: nullifierHex,
    amountLamports: input.payload.amountLamports,
    witness,
  };
}

function parseDecryptedPayload(value: string): z.infer<typeof rawDecryptedPayloadSchema> {
  const parts = value.split("|");

  if (parts.length !== 4) {
    throw new Error("Invalid decrypted UTXO payload.");
  }

  const [amount, blinding, index, mintAddress] = parts;

  if (
    amount === undefined ||
    blinding === undefined ||
    index === undefined ||
    mintAddress === undefined
  ) {
    throw new Error("Invalid decrypted UTXO payload.");
  }

  return rawDecryptedPayloadSchema.parse({
    amountLamports: parseDecimalBigInt(amount, "UTXO amount"),
    blinding,
    index: Number(index),
    mintAddress,
  });
}

function parseDecimalBigInt(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer.`);
  }

  return BigInt(value);
}

function fieldFromBytes(bytes: Uint8Array): string {
  return (BigInt(`0x${bytesToHex(bytes)}`) % FIELD_SIZE).toString();
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function startsWithBytes(value: Uint8Array, prefix: Uint8Array): boolean {
  if (value.byteLength < prefix.byteLength) return false;

  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (value[index] !== prefix[index]) return false;
  }

  return true;
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}
