import { address, isAddress, type Address } from "@solana/kit";
import { z } from "zod";

const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function addressValueSchema(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => isAddress(value), {
      message: `Expected a valid ${label} address.`,
    })
    .transform((value) => address(value));
}

function bytesSchema(input: {
  label: string;
  exactLength?: number | undefined;
  maxLength?: number | undefined;
}) {
  return z
    .string()
    .trim()
    .min(1)
    .regex(base64Pattern, {
      message: `${input.label} must be padded base64 bytes.`,
    })
    .transform((value, context) => {
      const bytes = Uint8Array.from(Buffer.from(value, "base64"));

      if (input.exactLength !== undefined && bytes.byteLength !== input.exactLength) {
        context.addIssue({
          code: "custom",
          message: `${input.label} must be ${input.exactLength} bytes.`,
        });
        return z.NEVER;
      }

      if (input.maxLength !== undefined && bytes.byteLength > input.maxLength) {
        context.addIssue({
          code: "custom",
          message: `${input.label} is too large.`,
        });
        return z.NEVER;
      }

      return bytes;
    });
}

const signedDecimalSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/)
  .transform((value) => BigInt(value));

const unsignedDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform((value) => BigInt(value));

export const relayerTransferRequestSchema = z.strictObject({
  programAddress: addressValueSchema("program"),
  recipient: addressValueSchema("recipient"),
  feeRecipient: addressValueSchema("fee recipient"),
  nullifiers: z.tuple([
    addressValueSchema("nullifier"),
    addressValueSchema("nullifier"),
    addressValueSchema("nullifier"),
    addressValueSchema("nullifier"),
  ]),
  proof: z.strictObject({
    proofA: bytesSchema({ label: "proofA", exactLength: 64 }),
    proofB: bytesSchema({ label: "proofB", exactLength: 128 }),
    proofC: bytesSchema({ label: "proofC", exactLength: 64 }),
    root: bytesSchema({ label: "root", exactLength: 32 }),
    publicAmount: bytesSchema({ label: "publicAmount", exactLength: 32 }),
    extDataHash: bytesSchema({ label: "extDataHash", exactLength: 32 }),
    inputNullifiers: z.tuple([
      bytesSchema({ label: "inputNullifier0", exactLength: 32 }),
      bytesSchema({ label: "inputNullifier1", exactLength: 32 }),
    ]),
    outputCommitments: z.tuple([
      bytesSchema({ label: "outputCommitment0", exactLength: 32 }),
      bytesSchema({ label: "outputCommitment1", exactLength: 32 }),
    ]),
  }),
  extData: z.strictObject({
    extAmount: signedDecimalSchema,
    fee: unsignedDecimalSchema,
  }),
  encryptedOutput1: bytesSchema({
    label: "encryptedOutput1",
    maxLength: 1_024,
  }),
  encryptedOutput2: bytesSchema({
    label: "encryptedOutput2",
    maxLength: 1_024,
  }),
});

export type RelayerTransferRequest = z.infer<
  typeof relayerTransferRequestSchema
>;

export type RelayerTransferPolicy = {
  programAddress: Address;
  feeRecipient: Address;
};

export function validateRelayerTransferPolicy(
  request: RelayerTransferRequest,
  policy: RelayerTransferPolicy,
): boolean {
  return (
    request.programAddress === policy.programAddress &&
    request.feeRecipient === policy.feeRecipient
  );
}
