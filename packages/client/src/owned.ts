import { z } from "zod";

import {
  deriveNoteKey,
  type NoteKey,
  type NoteKeyDeriver,
} from "@/encryption";
import {
  encryptedOutputSchema,
  type NoteScope,
  type NoteStore,
} from "@/notes";
import {
  addressSchema,
  fieldElementHexSchema,
  lamportsSchema,
  nonEmptyBytesSchema,
  positiveLamportsSchema,
  safeIntegerSchema,
} from "@/schemas";
import type { NoteSelector } from "@/prover";
import { prepareTransferInputSchema } from "@/transfer";

const commitmentSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value),
    "Expected a decimal field element or 32-byte hex commitment.",
  )
  .transform((value) => value.toLowerCase());

const ownedNoteSchema = z.strictObject({
  commitment: commitmentSchema,
  encryptedOutput: encryptedOutputSchema,
  outputIndex: safeIntegerSchema,
  nullifier: fieldElementHexSchema,
  amountLamports: positiveLamportsSchema,
  witness: z.unknown(),
});

const decryptedOwnedNoteSchema = z.strictObject({
  commitment: commitmentSchema,
  nullifier: fieldElementHexSchema,
  amountLamports: positiveLamportsSchema,
  witness: z.unknown(),
});

const noteScopeSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
});

const nullifierStatusSchema = z.object({
  spent: z.boolean(),
  nullifier: fieldElementHexSchema,
});

const ownedNoteBalanceSchema = z.strictObject({
  lamports: lamportsSchema,
});

export type OwnedNote = z.infer<typeof ownedNoteSchema>;
export type DecryptedOwnedNote = z.infer<typeof decryptedOwnedNoteSchema>;
export type OwnedNoteBalance = z.infer<typeof ownedNoteBalanceSchema>;

export type OwnedNoteStore = {
  listOwnedNotes(input: NoteScope): Promise<unknown>;
};

export type OwnedNoteIndexer = {
  getNullifierStatus(input: { nullifier: string }): Promise<unknown>;
};

export type CreateOwnedNoteStoreInput = {
  source: OwnedNoteStore;
  indexer: OwnedNoteIndexer;
};

export type DecryptOwnedNoteInput = NoteScope & {
  noteKey: NoteKey;
  encryptedOutput: string;
  outputIndex: number;
};

export type OwnedNoteDecryptor = {
  decryptOwnedNote(input: DecryptOwnedNoteInput): Promise<unknown | null>;
};

export type CreateOwnedNoteSourceInput = NoteScope & {
  notes: NoteStore;
  keyDeriver: NoteKeyDeriver;
  decryptor: OwnedNoteDecryptor;
  unlockSignature: Uint8Array;
  now?: (() => Date) | undefined;
};

export type CreateNoteSelectorInput = {
  ownedNotes: OwnedNoteStore;
};

export function createOwnedNoteStore(
  input: CreateOwnedNoteStoreInput,
): OwnedNoteStore {
  return {
    async listOwnedNotes(scopeInput) {
      const scope = noteScopeSchema.parse(scopeInput);
      const notes = z.array(ownedNoteSchema).parse(
        await input.source.listOwnedNotes(scope),
      );

      return filterUnspentNotes(input.indexer, notes);
    },
  };
}

export function createOwnedNoteSource(
  input: CreateOwnedNoteSourceInput,
): OwnedNoteStore {
  const scope = noteScopeSchema.parse({
    programAddress: input.programAddress,
    ownerAddress: input.ownerAddress,
  });
  const unlockSignature = nonEmptyBytesSchema.parse(input.unlockSignature);
  const now = input.now ?? (() => new Date());

  return {
    async listOwnedNotes(scopeInput) {
      const requestedScope = noteScopeSchema.parse(scopeInput);

      if (requestedScope.programAddress !== scope.programAddress) {
        throw new Error("Owned note source program address does not match.");
      }

      if (requestedScope.ownerAddress !== scope.ownerAddress) {
        throw new Error("Owned note source owner address does not match.");
      }

      const noteKey = await deriveNoteKey(input.keyDeriver, {
        programAddress: scope.programAddress,
        ownerAddress: scope.ownerAddress,
        unlockSignature,
      });
      const backup = input.notes.exportNotes({
        programAddress: scope.programAddress,
        ownerAddress: scope.ownerAddress,
        exportedAt: getValidDate(now()),
      });
      const ownedNotes: OwnedNote[] = [];

      for (const output of backup.indexedOutputs) {
        const decrypted = await input.decryptor.decryptOwnedNote({
          programAddress: scope.programAddress,
          ownerAddress: scope.ownerAddress,
          noteKey: copyBytes(noteKey),
          encryptedOutput: output.encryptedOutput,
          outputIndex: output.outputIndex,
        });

        if (decrypted === null) continue;

        const note = decryptedOwnedNoteSchema.parse(decrypted);
        ownedNotes.push(
          ownedNoteSchema.parse({
            ...note,
            encryptedOutput: output.encryptedOutput,
            outputIndex: output.outputIndex,
          }),
        );
      }

      return ownedNotes;
    },
  };
}

export function getOwnedNoteBalance(notesInput: unknown): OwnedNoteBalance {
  const notes = z.array(ownedNoteSchema).parse(notesInput);
  const lamports = notes.reduce(
    (sum, note) => sum + note.amountLamports,
    0n,
  );

  return ownedNoteBalanceSchema.parse({ lamports });
}

export function createNoteSelector(input: CreateNoteSelectorInput): NoteSelector {
  return {
    async selectNotes(selectionInput) {
      const transfer = prepareTransferInputSchema.parse(selectionInput.transfer);
      const scope = noteScopeSchema.parse({
        programAddress: transfer.programAddress,
        ownerAddress: transfer.ownerAddress,
      });
      const notes = z.array(ownedNoteSchema).parse(
        await input.ownedNotes.listOwnedNotes(scope),
      );
      const knownOutputIndexes = new Set(
        selectionInput.backup.indexedOutputs.map((output) => output.outputIndex),
      );
      const selected = pickNotes(
        notes.filter((note) => knownOutputIndexes.has(note.outputIndex)),
        transfer.quote.grossWithdrawalLamports,
      );

      if (selected.length === 0) {
        throw new Error("Not enough owned private notes for this transfer.");
      }

      return {
        inputNotes: selected.map((note) => ({
          commitment: note.commitment,
          encryptedOutput: note.encryptedOutput,
          outputIndex: note.outputIndex,
          nullifier: note.nullifier,
          amountLamports: note.amountLamports,
          witness: note.witness,
        })),
      };
    },
  };
}

function pickNotes(
  notes: readonly OwnedNote[],
  targetLamports: bigint,
): OwnedNote[] {
  const sorted = [...notes].sort(compareOwnedNotes);
  const selected: OwnedNote[] = [];
  let total = 0n;

  for (const note of sorted) {
    selected.push(note);
    total += note.amountLamports;

    if (total >= targetLamports) return selected;
    if (selected.length === 2) break;
  }

  return [];
}

function compareOwnedNotes(left: OwnedNote, right: OwnedNote): number {
  if (left.amountLamports > right.amountLamports) return -1;
  if (left.amountLamports < right.amountLamports) return 1;

  return left.commitment.localeCompare(right.commitment);
}

async function filterUnspentNotes(
  indexer: OwnedNoteIndexer,
  notes: readonly OwnedNote[],
): Promise<OwnedNote[]> {
  const statuses = await Promise.all(
    notes.map(async (note) => {
      const status = nullifierStatusSchema.parse(
        await indexer.getNullifierStatus({ nullifier: note.nullifier }),
      );

      if (status.nullifier !== note.nullifier) {
        throw new Error("Indexer returned a nullifier status for the wrong note.");
      }

      return status;
    }),
  );

  return notes.filter((_note, index) => !statuses[index]?.spent);
}

function getValidDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("now must return a valid Date.");
  }

  return value;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
