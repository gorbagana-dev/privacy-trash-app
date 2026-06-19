import { z } from "zod";

import { addressSchema, isoTimestampSchema, safeIntegerSchema } from "@/schemas";

export const NOTE_BACKUP_VERSION = 1;
export const MAX_HISTORY_INDEXES = 20;

export const encryptedOutputSchema = z
  .string()
  .trim()
  .min(2)
  .regex(/^(?:[0-9a-fA-F]{2})+$/, {
    message: "Encrypted output must be hex-encoded bytes.",
  })
  .transform((value) => value.toLowerCase());

export const indexedEncryptedOutputSchema = z.strictObject({
  outputIndex: safeIntegerSchema,
  encryptedOutput: encryptedOutputSchema,
});

const noteScopeSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
});

const noteBackupFieldsSchema = z.strictObject({
  version: z.literal(NOTE_BACKUP_VERSION),
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  exportedAt: isoTimestampSchema,
  encryptedOutputs: z.array(encryptedOutputSchema).optional(),
  indexedOutputs: z.array(indexedEncryptedOutputSchema).optional(),
  fetchOffset: safeIntegerSchema,
  historyIndexes: z.array(safeIntegerSchema),
}).refine(
  (value) => value.encryptedOutputs !== undefined || value.indexedOutputs !== undefined,
  "Note backup must include indexedOutputs or encryptedOutputs.",
);

export const noteBackupSchema =
  noteBackupFieldsSchema.transform(normalizeNoteBackup);

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type NoteScope = z.input<typeof noteScopeSchema>;
export type NoteBackupInput = z.input<typeof noteBackupSchema>;
export type NoteBackup = z.infer<typeof noteBackupSchema>;
export type IndexedEncryptedOutput = z.infer<typeof indexedEncryptedOutputSchema>;

export type ExportNotesInput = NoteScope & {
  storage: KeyValueStorage;
  exportedAt?: Date | undefined;
};

export type ImportNotesInput = NoteScope & {
  storage: KeyValueStorage;
  backup: unknown;
  merge?: boolean | undefined;
};

export type ClearNotesInput = NoteScope & {
  storage: KeyValueStorage;
};

export type NoteStore = {
  exportNotes(input: NoteScope & { exportedAt?: Date | undefined }): NoteBackup;
  importNotes(input: NoteScope & { backup: unknown; merge?: boolean | undefined }): NoteBackup;
  clearNotes(input: NoteScope): void;
};

export function createNoteBackup(input: unknown): NoteBackup {
  return noteBackupSchema.parse(input);
}

export function mergeNoteBackups(
  existingInput: unknown,
  incomingInput: unknown,
): NoteBackup {
  const existing = createNoteBackup(existingInput);
  const incoming = createNoteBackup(incomingInput);

  if (existing.programAddress !== incoming.programAddress) {
    throw new Error("Note backup program address does not match.");
  }

  if (existing.ownerAddress !== incoming.ownerAddress) {
    throw new Error("Note backup owner address does not match.");
  }

  return createNoteBackup({
    version: NOTE_BACKUP_VERSION,
    programAddress: existing.programAddress,
    ownerAddress: existing.ownerAddress,
    exportedAt: maxIsoTimestamp(existing.exportedAt, incoming.exportedAt),
    indexedOutputs: [
      ...existing.indexedOutputs,
      ...incoming.indexedOutputs,
    ],
    fetchOffset: Math.max(existing.fetchOffset, incoming.fetchOffset),
    historyIndexes: [...existing.historyIndexes, ...incoming.historyIndexes],
  });
}

export function createNoteKey(input: NoteScope): string {
  const scope = noteScopeSchema.parse(input);

  return `privacy-trash:notes:v${NOTE_BACKUP_VERSION}:${scope.programAddress}:${scope.ownerAddress}`;
}

export function exportNotes(input: ExportNotesInput): NoteBackup {
  const scope = parseNoteScope(input);
  const exportedAt = toIsoTimestamp(input.exportedAt ?? new Date());
  const raw = input.storage.getItem(createNoteKey(scope));

  if (!raw) {
    return createEmptyBackup(scope, exportedAt);
  }

  const stored = createNoteBackup(parseStoredJson(raw));
  validateBackupScope(stored, scope, "Stored note backup");

  return createNoteBackup({
    ...stored,
    exportedAt,
  });
}

export function importNotes(input: ImportNotesInput): NoteBackup {
  const scope = parseNoteScope(input);
  const incoming = createNoteBackup(input.backup);

  validateBackupScope(incoming, scope, "Imported note backup");

  const key = createNoteKey(scope);
  const rawExisting = input.storage.getItem(key);
  const shouldMerge = input.merge ?? true;
  const next =
    shouldMerge && rawExisting
      ? mergeWithStoredBackup(rawExisting, incoming, scope)
      : incoming;

  input.storage.setItem(key, JSON.stringify(next));

  return next;
}

export function clearNotes(input: ClearNotesInput): void {
  input.storage.removeItem(createNoteKey(parseNoteScope(input)));
}

export function createNoteStore(storage: KeyValueStorage): NoteStore {
  return {
    exportNotes(input) {
      return exportNotes({ storage, ...input });
    },
    importNotes(input) {
      return importNotes({ storage, ...input });
    },
    clearNotes(input) {
      clearNotes({ storage, ...input });
    },
  };
}

function normalizeNoteBackup(
  value: z.infer<typeof noteBackupFieldsSchema>,
): {
  version: typeof NOTE_BACKUP_VERSION;
  programAddress: string;
  ownerAddress: string;
  exportedAt: string;
  encryptedOutputs: string[];
  indexedOutputs: IndexedEncryptedOutput[];
  fetchOffset: number;
  historyIndexes: number[];
} {
  const indexedOutputs = normalizeIndexedOutputs(value);

  return {
    ...value,
    encryptedOutputs: indexedOutputs.map((output) => output.encryptedOutput),
    indexedOutputs,
    historyIndexes: unique(value.historyIndexes)
      .sort((left, right) => right - left)
      .slice(0, MAX_HISTORY_INDEXES),
  };
}

function parseNoteScope(input: NoteScope): z.infer<typeof noteScopeSchema> {
  return noteScopeSchema.parse({
    programAddress: input.programAddress,
    ownerAddress: input.ownerAddress,
  });
}

function mergeWithStoredBackup(
  rawExisting: string,
  incoming: NoteBackup,
  scope: z.infer<typeof noteScopeSchema>,
): NoteBackup {
  const existing = createNoteBackup(parseStoredJson(rawExisting));
  validateBackupScope(existing, scope, "Stored note backup");

  return mergeNoteBackups(existing, incoming);
}

function createEmptyBackup(
  scope: z.infer<typeof noteScopeSchema>,
  exportedAt: string,
): NoteBackup {
  return createNoteBackup({
    version: NOTE_BACKUP_VERSION,
    programAddress: scope.programAddress,
    ownerAddress: scope.ownerAddress,
    exportedAt,
    indexedOutputs: [],
    fetchOffset: 0,
    historyIndexes: [],
  });
}

function parseStoredJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Stored note backup must contain valid JSON.");
  }
}

function validateBackupScope(
  backup: NoteBackup,
  scope: z.infer<typeof noteScopeSchema>,
  label: string,
): void {
  if (backup.programAddress !== scope.programAddress) {
    throw new Error(`${label} program address does not match.`);
  }

  if (backup.ownerAddress !== scope.ownerAddress) {
    throw new Error(`${label} owner address does not match.`);
  }
}

function toIsoTimestamp(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("exportedAt must be a valid Date.");
  }

  return value.toISOString();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function maxIsoTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function normalizeIndexedOutputs(
  value: z.infer<typeof noteBackupFieldsSchema>,
): IndexedEncryptedOutput[] {
  const hasIndexedOutputs = value.indexedOutputs !== undefined;
  const rawOutputs =
    value.indexedOutputs ??
    value.encryptedOutputs?.map((encryptedOutput, outputIndex) => ({
      outputIndex,
      encryptedOutput,
    })) ??
    [];
  const byIndex = new Map<number, string>();
  const indexByEncryptedOutput = new Map<string, number>();

  for (const rawOutput of rawOutputs) {
    const output = indexedEncryptedOutputSchema.parse(rawOutput);
    const existing = byIndex.get(output.outputIndex);

    if (existing !== undefined && existing !== output.encryptedOutput) {
      throw new Error(
        `Note backup has conflicting encrypted outputs for output index ${output.outputIndex}.`,
      );
    }

    const existingIndex = indexByEncryptedOutput.get(output.encryptedOutput);

    if (existingIndex !== undefined && existingIndex !== output.outputIndex) {
      if (!hasIndexedOutputs) {
        continue;
      }

      throw new Error(
        `Note backup has duplicate encrypted output at indexes ${existingIndex} and ${output.outputIndex}.`,
      );
    }

    if (existingIndex !== undefined) {
      continue;
    }

    byIndex.set(output.outputIndex, output.encryptedOutput);
    indexByEncryptedOutput.set(output.encryptedOutput, output.outputIndex);
  }

  return [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([outputIndex, encryptedOutput]) => ({
      outputIndex,
      encryptedOutput,
    }));
}
