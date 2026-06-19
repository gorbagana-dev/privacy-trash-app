import type { ReadonlyUint8Array } from "@solana/kit";
import { z } from "zod";

import { addressSchema } from "@/schemas";
import type { PrepareTransferInput } from "@/transfer";

const bytesSchema = z.custom<ReadonlyUint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength > 0,
  { message: "Expected non-empty bytes." },
);

const extAmountSchema = z.union([z.bigint(), z.number().int()]);
const feeAmountSchema = z.union([
  z.bigint().nonnegative(),
  z.number().int().nonnegative(),
]);

export const proofMaterialSchema = z.strictObject({
  nullifiers: z.tuple([
    addressSchema,
    addressSchema,
    addressSchema,
    addressSchema,
  ]),
  proof: z.strictObject({
    proofA: bytesSchema,
    proofB: bytesSchema,
    proofC: bytesSchema,
    root: bytesSchema,
    publicAmount: bytesSchema,
    extDataHash: bytesSchema,
    inputNullifiers: z.tuple([bytesSchema, bytesSchema]),
    outputCommitments: z.tuple([bytesSchema, bytesSchema]),
  }),
  extData: z.strictObject({
    extAmount: extAmountSchema,
    fee: feeAmountSchema,
  }),
  encryptedOutput1: bytesSchema,
  encryptedOutput2: bytesSchema,
});

export type ProofMaterial = z.infer<typeof proofMaterialSchema>;

export type ProofProvider = {
  createProofMaterial(input: PrepareTransferInput): Promise<unknown>;
};

export async function createProofMaterial(
  provider: ProofProvider,
  input: PrepareTransferInput,
): Promise<ProofMaterial> {
  return proofMaterialSchema.parse(await provider.createProofMaterial(input));
}
