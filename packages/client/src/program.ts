import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { sha256 } from "@noble/hashes/sha2.js";
import { z } from "zod";

import type {
  NullifierAccountResolver,
  NullifierAccountResolverInput,
  PublicInputEncoder,
  PublicInputEncoderInput,
} from "@/circuit";
import { FIELD_SIZE, fieldDecimalToBytes, fieldHexToBytes } from "@/field";
import {
  addressSchema,
  fieldElementHexSchema,
  nonEmptyBytesSchema,
} from "@/schemas";
import { NATIVE_TOKEN_SENTINEL } from "@/utxo";

const NULLIFIER_0_SEED = textBytes("nullifier0");
const NULLIFIER_1_SEED = textBytes("nullifier1");
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const U32_MAX = (1n << 32n) - 1n;

const extDataHashInputSchema = z.strictObject({
  extData: z.strictObject({
    extAmount: z.bigint().min(I64_MIN).max(I64_MAX),
    fee: z.bigint().nonnegative().max(U64_MAX),
  }),
  recipient: addressSchema,
  feeRecipient: addressSchema,
  encryptedOutputs: z.tuple([nonEmptyBytesSchema, nonEmptyBytesSchema]),
  outputCommitments: z.tuple([fieldElementHexSchema, fieldElementHexSchema]),
});

export type NullifierAccountsInput = Pick<
  NullifierAccountResolverInput,
  "programAddress" | "inputNullifiers"
>;

export type PublicAmountInput = {
  extAmount: bigint;
  fee: bigint;
};

export function createNullifierAccounts(): NullifierAccountResolver {
  return {
    async resolveNullifierAccounts(input) {
      return await deriveNullifierAccounts(input);
    },
  };
}

export async function deriveNullifierAccounts(
  input: NullifierAccountsInput,
): Promise<[Address, Address, Address, Address]> {
  const programAddress = addressSchema.parse(input.programAddress);
  const [firstNullifier, secondNullifier] = z
    .tuple([fieldElementHexSchema, fieldElementHexSchema])
    .parse(input.inputNullifiers);

  const [nullifier0] = await getProgramDerivedAddress({
    programAddress,
    seeds: [NULLIFIER_0_SEED, fieldHexToBytes(firstNullifier)],
  });
  const [nullifier1] = await getProgramDerivedAddress({
    programAddress,
    seeds: [NULLIFIER_1_SEED, fieldHexToBytes(secondNullifier)],
  });
  const [nullifier2] = await getProgramDerivedAddress({
    programAddress,
    seeds: [NULLIFIER_0_SEED, fieldHexToBytes(secondNullifier)],
  });
  const [nullifier3] = await getProgramDerivedAddress({
    programAddress,
    seeds: [NULLIFIER_1_SEED, fieldHexToBytes(firstNullifier)],
  });

  return [nullifier0, nullifier1, nullifier2, nullifier3];
}

export function createPublicInputEncoder(): PublicInputEncoder {
  return {
    async encodePublicAmount(input) {
      return encodePublicAmount(input);
    },
    async hashExtData(input) {
      return hashExtData(input);
    },
  };
}

export function encodePublicAmount(input: PublicAmountInput): Uint8Array {
  const extAmount = validateI64(input.extAmount, "extAmount");
  const fee = validateU64(input.fee, "fee");

  if (extAmount === I64_MIN) {
    throw new Error("extAmount cannot be i64::MIN.");
  }

  if (extAmount >= 0n) {
    if (extAmount <= fee) {
      throw new Error("deposit amount must be greater than the fee.");
    }

    return fieldDecimalToBytes((extAmount - fee).toString());
  }

  return fieldDecimalToBytes(
    modField(-(abs(extAmount) + fee)).toString(),
  );
}

export function hashExtData(input: PublicInputEncoderInput): Uint8Array {
  const parsed = extDataHashInputSchema.parse(input);
  const serialized = concatBytes([
    addressBytes(parsed.recipient),
    encodeI64Le(parsed.extData.extAmount),
    encodeVec(parsed.encryptedOutputs[0]),
    encodeVec(parsed.encryptedOutputs[1]),
    encodeU64Le(parsed.extData.fee),
    addressBytes(parsed.feeRecipient),
    addressBytes(addressSchema.parse(NATIVE_TOKEN_SENTINEL)),
  ]);
  const hash = sha256(serialized);
  const hashField = leBytesToBigInt(hash) % FIELD_SIZE;

  return fieldDecimalToBytes(hashField.toString());
}

function validateI64(value: bigint, label: string): bigint {
  if (value < I64_MIN || value > I64_MAX) {
    throw new RangeError(`${label} must fit in a signed 64-bit integer.`);
  }

  return value;
}

function validateU64(value: bigint, label: string): bigint {
  if (value < 0n || value > U64_MAX) {
    throw new RangeError(`${label} must fit in an unsigned 64-bit integer.`);
  }

  return value;
}

function encodeI64Le(value: bigint): Uint8Array {
  validateI64(value, "i64");

  return encodeUnsignedLe(value < 0n ? (1n << 64n) + value : value, 8);
}

function encodeU64Le(value: bigint): Uint8Array {
  validateU64(value, "u64");

  return encodeUnsignedLe(value, 8);
}

function encodeU32Le(value: number): Uint8Array {
  return encodeUnsignedLe(BigInt(value), 4);
}

function encodeVec(bytes: ReadonlyUint8Array): Uint8Array {
  if (BigInt(bytes.byteLength) > U32_MAX) {
    throw new RangeError("byte vector is too large for Borsh serialization.");
  }

  return concatBytes([encodeU32Le(bytes.byteLength), bytes]);
}

function encodeUnsignedLe(value: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let remaining = value;

  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

function addressBytes(value: Address): ReadonlyUint8Array {
  return getAddressEncoder().encode(value);
}

function leBytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;

  for (let index = bytes.byteLength - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index] as number);
  }

  return value;
}

function modField(value: bigint): bigint {
  return ((value % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function concatBytes(chunks: readonly ReadonlyUint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.byteLength, 0),
  );
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
