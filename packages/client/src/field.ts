import { z } from "zod";

import { fieldElementHexSchema } from "@/schemas";

export const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

export const fieldElementDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) < FIELD_SIZE, {
    message: "Expected a scalar field element.",
  });

export function fieldDecimalToBytes(value: string): Uint8Array {
  const field = fieldElementDecimalSchema.parse(value);

  return hexToBytes(BigInt(field).toString(16).padStart(64, "0"));
}

export function fieldHexToBytes(value: string): Uint8Array {
  return hexToBytes(fieldElementHexSchema.parse(value));
}

export function decimalToFieldHex(value: string): string {
  return BigInt(fieldElementDecimalSchema.parse(value))
    .toString(16)
    .padStart(64, "0");
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}
