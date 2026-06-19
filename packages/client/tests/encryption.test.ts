import { describe, expect, it } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  NOTE_KEY_BYTES,
  addressSchema,
  createSignatureNoteKeyDeriver,
  deriveNoteKey,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);

describe("encryption", () => {
  it("derives the Privacy Trash note key from keccak256(signature)", async () => {
    const deriver = createSignatureNoteKeyDeriver();
    const unlockSignature = new Uint8Array([1, 2, 3, 4]);
    const first = await deriveNoteKey(deriver, {
      programAddress,
      ownerAddress,
      unlockSignature,
    });
    const second = await deriveNoteKey(deriver, {
      programAddress,
      ownerAddress,
      unlockSignature,
    });
    const differentSignature = await deriveNoteKey(deriver, {
      programAddress,
      ownerAddress,
      unlockSignature: new Uint8Array([1, 2, 3, 5]),
    });

    expect(first).toBeInstanceOf(Uint8Array);
    expect(first).toHaveLength(NOTE_KEY_BYTES);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first)).toEqual(Array.from(keccak_256(unlockSignature)));
    expect(Array.from(first)).not.toEqual(Array.from(differentSignature));
  });

  it("validates note key derivation input and output", async () => {
    const deriver = createSignatureNoteKeyDeriver();

    await expect(
      deriveNoteKey(deriver, {
        programAddress,
        ownerAddress,
        unlockSignature: new Uint8Array(),
      }),
    ).rejects.toThrow("Expected non-empty bytes");

    await expect(
      deriveNoteKey(
        {
          deriveNoteKey: async () => new Uint8Array([1, 2, 3]),
        },
        {
          programAddress,
          ownerAddress,
          unlockSignature: new Uint8Array([1]),
        },
      ),
    ).rejects.toThrow("Expected a 32-byte note key");
  });
});
