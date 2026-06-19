import { z } from "zod";

import {
  createSignatureNoteKeyDeriver,
  deriveNoteKey,
  type NoteKeyDeriver,
} from "@/encryption";
import {
  bytesToHex,
  fieldElementDecimalSchema,
} from "@/field";
import type {
  OutputBlinding,
  OutputBlindingInput,
  OutputEncryptor,
  OutputEncryptorInput,
  RandomBytes,
} from "@/circuit";
import { addressSchema, nonEmptyBytesSchema } from "@/schemas";
import {
  NATIVE_TOKEN_SENTINEL,
  UTXO_ENCRYPTION_VERSION_V2,
} from "@/utxo";

const aesGcmIvBytes = 12;
const aesGcmTagBytes = 16;
const outputPayloadSchema = z.strictObject({
  amountLamports: z.bigint().nonnegative(),
  blinding: fieldElementDecimalSchema,
  index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  mintAddress: z.literal(NATIVE_TOKEN_SENTINEL),
});

export type CreateOutputBlindingInput = {
  randomBytes?: RandomBytes | undefined;
};

export type CreateOutputEncryptorInput = {
  noteKeyDeriver?: NoteKeyDeriver | undefined;
  crypto?: Pick<Crypto, "subtle"> | undefined;
  randomBytes?: RandomBytes | undefined;
};

export type OutputPayload = z.infer<typeof outputPayloadSchema>;

export function createOutputBlinding(
  input: CreateOutputBlindingInput = {},
): OutputBlinding {
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;

  return {
    async createBlinding(_input: OutputBlindingInput) {
      return createRandomFieldElement(randomBytes);
    },
  };
}

export function createOutputEncryptor(
  input: CreateOutputEncryptorInput = {},
): OutputEncryptor {
  const noteKeyDeriver = input.noteKeyDeriver ?? createSignatureNoteKeyDeriver();
  const cryptoProvider = input.crypto;
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;

  return {
    async encryptOutput(outputInput) {
      const output = parseOutputEncryptorInput(outputInput);
      const noteKey = await deriveNoteKey(noteKeyDeriver, {
        programAddress: output.programAddress,
        ownerAddress: output.ownerAddress,
        unlockSignature: output.unlockSignature,
      });

      return encryptOutputPayload({
        crypto: cryptoProvider,
        noteKey,
        payload: {
          amountLamports: output.amountLamports,
          blinding: output.blinding,
          index: output.index,
          mintAddress: output.mintAddress,
        },
        iv: randomBytes(aesGcmIvBytes),
      });
    },
  };
}

export async function encryptOutputPayload(input: {
  crypto?: Pick<Crypto, "subtle"> | undefined;
  noteKey: Uint8Array;
  payload: OutputPayload;
  iv: Uint8Array;
}): Promise<Uint8Array> {
  const subtle = input.crypto?.subtle ?? globalThis.crypto?.subtle;

  if (subtle === undefined) {
    throw new Error("Web Crypto is required to encrypt Privacy Trash notes.");
  }

  const noteKey = nonEmptyBytesSchema.parse(input.noteKey);
  const payload = outputPayloadSchema.parse(input.payload);
  const iv = fixedBytes(input.iv, aesGcmIvBytes, "AES-GCM IV");
  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(noteKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedWithTag = new Uint8Array(
    await subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
      },
      key,
      new TextEncoder().encode(serializeOutputPayload(payload)),
    ),
  );
  const ciphertext = encryptedWithTag.slice(
    0,
    encryptedWithTag.byteLength - aesGcmTagBytes,
  );
  const authTag = encryptedWithTag.slice(
    encryptedWithTag.byteLength - aesGcmTagBytes,
  );

  return concatBytes([
    UTXO_ENCRYPTION_VERSION_V2,
    iv,
    authTag,
    ciphertext,
  ]);
}

export function serializeOutputPayload(input: OutputPayload): string {
  const payload = outputPayloadSchema.parse(input);

  return [
    payload.amountLamports.toString(),
    payload.blinding,
    payload.index.toString(),
    payload.mintAddress,
  ].join("|");
}

export function createRandomFieldElement(randomBytes: RandomBytes): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const value = bytesToBigInt(randomBytes(31));

    if (value > 0n) {
      return fieldElementDecimalSchema.parse(value.toString());
    }
  }

  throw new Error("Failed to generate a nonzero field element.");
}

export function cryptoRandomBytes(length: number): Uint8Array {
  if (globalThis.crypto === undefined) {
    throw new Error("crypto.getRandomValues is not available in this runtime.");
  }

  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);

  return bytes;
}

export function encryptedOutputBytesToHex(bytes: Uint8Array): string {
  return bytesToHex(nonEmptyBytesSchema.parse(bytes));
}

function parseOutputEncryptorInput(input: OutputEncryptorInput): OutputEncryptorInput {
  return {
    ...input,
    programAddress: addressSchema.parse(input.programAddress),
    ownerAddress: addressSchema.parse(input.ownerAddress),
    unlockSignature: nonEmptyBytesSchema.parse(input.unlockSignature),
    amountLamports: z.bigint().nonnegative().parse(input.amountLamports),
    blinding: fieldElementDecimalSchema.parse(input.blinding),
    index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(input.index),
    mintAddress: z.literal(NATIVE_TOKEN_SENTINEL).parse(input.mintAddress),
    commitment: fieldElementDecimalSchema.parse(input.commitment),
    publicKey: fieldElementDecimalSchema.parse(input.publicKey),
  };
}

function fixedBytes(input: Uint8Array, length: number, label: string): Uint8Array {
  if (!(input instanceof Uint8Array) || input.byteLength !== length) {
    throw new Error(`${label} must be ${length} bytes.`);
  }

  return new Uint8Array(input);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.byteLength, 0),
  );
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  return value;
}
