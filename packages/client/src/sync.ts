import { z } from "zod";

import type { Indexer } from "@/indexer";
import {
  NOTE_BACKUP_VERSION,
  type NoteBackup,
  type NoteStore,
} from "@/notes";
import { addressSchema, safeIntegerSchema } from "@/schemas";

const defaultBatchSize = 1_000;
const maxBatchSize = 20_000;

const batchSizeSchema = safeIntegerSchema.min(1).max(maxBatchSize);

const syncNotesInputSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  batchSize: batchSizeSchema.default(defaultBatchSize),
});

export type NoteSyncIndexer = Pick<Indexer, "getOutputRange">;

export type SyncNotesInput = z.input<typeof syncNotesInputSchema> & {
  notes: NoteStore;
  indexer: NoteSyncIndexer;
  now?: (() => Date) | undefined;
};

export type NoteSyncResult = {
  previousOffset: number;
  nextOffset: number;
  fetched: number;
  total: number;
  hasMore: boolean;
  backup: NoteBackup;
};

export async function syncNotes(input: SyncNotesInput): Promise<NoteSyncResult> {
  const parsed = syncNotesInputSchema.parse({
    programAddress: input.programAddress,
    ownerAddress: input.ownerAddress,
    batchSize: input.batchSize,
  });
  const now = input.now ?? (() => new Date());
  const exportedAt = getValidDate(now());
  const current = input.notes.exportNotes({
    programAddress: parsed.programAddress,
    ownerAddress: parsed.ownerAddress,
    exportedAt,
  });
  const previousOffset = current.fetchOffset;
  const range = await input.indexer.getOutputRange({
    start: previousOffset,
    end: previousOffset + parsed.batchSize,
  });

  if (range.total < previousOffset) {
    throw new Error("Indexer total is behind the local note fetch offset.");
  }

  if (range.encryptedOutputs.length === 0 && range.hasMore) {
    throw new Error("Indexer returned no outputs while more outputs are available.");
  }

  const fetched = range.encryptedOutputs.length;
  const nextOffset = previousOffset + fetched;
  const backup = input.notes.importNotes({
    programAddress: parsed.programAddress,
    ownerAddress: parsed.ownerAddress,
    merge: false,
    backup: {
      version: NOTE_BACKUP_VERSION,
      programAddress: parsed.programAddress,
      ownerAddress: parsed.ownerAddress,
      exportedAt: exportedAt.toISOString(),
      encryptedOutputs: [
        ...current.encryptedOutputs,
        ...range.encryptedOutputs.map(base64ToHex),
      ],
      fetchOffset: nextOffset,
      historyIndexes:
        fetched > 0
          ? [previousOffset, ...current.historyIndexes]
          : current.historyIndexes,
    },
  });

  return {
    previousOffset,
    nextOffset,
    fetched,
    total: range.total,
    hasMore: range.hasMore,
    backup,
  };
}

function getValidDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("now must return a valid Date.");
  }

  return value;
}

function base64ToHex(value: string): string {
  const binary = globalThis.atob(value);
  let hex = "";

  for (let index = 0; index < binary.length; index += 1) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, "0");
  }

  return hex;
}
