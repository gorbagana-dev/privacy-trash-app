import { z } from "zod";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  addressSchema,
  nonEmptyBytesSchema,
} from "@/schemas";

export const NOTE_KEY_VERSION = 1;
export const NOTE_KEY_ALGORITHM = "keccak256(signature)";
export const NOTE_KEY_BYTES = 32;

export const noteKeySchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength === NOTE_KEY_BYTES,
  { message: `Expected a ${NOTE_KEY_BYTES}-byte note key.` },
);

const noteKeyDerivationInputSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  unlockSignature: nonEmptyBytesSchema,
});

export type NoteKey = z.infer<typeof noteKeySchema>;
export type NoteKeyDerivationInput = z.input<typeof noteKeyDerivationInputSchema>;

export type NoteKeyDeriver = {
  deriveNoteKey(input: NoteKeyDerivationInput): Promise<unknown>;
};

export function createSignatureNoteKeyDeriver(): NoteKeyDeriver {
  return {
    async deriveNoteKey(derivationInput) {
      const parsed = noteKeyDerivationInputSchema.parse(derivationInput);

      return noteKeySchema.parse(keccak_256(parsed.unlockSignature));
    },
  };
}

export async function deriveNoteKey(
  deriver: NoteKeyDeriver,
  input: NoteKeyDerivationInput,
): Promise<NoteKey> {
  return noteKeySchema.parse(await deriver.deriveNoteKey(input));
}
