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

const noteScopeSchema = z.strictObject({
  programAddress: addressSchema,
  ownerAddress: addressSchema,
});

const noteBackupFieldsSchema = z.strictObject({
  version: z.literal(NOTE_BACKUP_VERSION),
  programAddress: addressSchema,
  ownerAddress: addressSchema,
  exportedAt: isoTimestampSchema,
  encryptedOutputs: z.array(encryptedOutputSchema),
  fetchOffset: safeIntegerSchema,
  historyIndexes: z.array(safeIntegerSchema),
});

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
    encryptedOutputs: [
      ...existing.encryptedOutputs,
      ...incoming.encryptedOutputs,
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
): z.infer<typeof noteBackupFieldsSchema> {
  return {
    ...value,
    encryptedOutputs: unique(value.encryptedOutputs),
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
    encryptedOutputs: [],
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
