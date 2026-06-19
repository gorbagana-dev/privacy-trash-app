import { describe, expect, it } from "vitest";

import {
  NOTE_BACKUP_VERSION,
  clearNotes,
  createNoteBackup,
  createNoteKey,
  createNoteStore,
  exportNotes,
  importNotes,
  type KeyValueStorage,
} from "@/notes";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const ownerAddress = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";

class TestStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createBackup() {
  return {
    version: NOTE_BACKUP_VERSION,
    programAddress,
    ownerAddress,
    exportedAt: "2026-06-18T00:00:00.000Z",
    encryptedOutputs: ["AABB", "aabb", "CC"],
    fetchOffset: 1,
    historyIndexes: [2, 1, 2],
  };
}

describe("notes", () => {
  it("normalizes note backups", () => {
    expect(createNoteBackup(createBackup())).toMatchObject({
      encryptedOutputs: ["aabb", "cc"],
      indexedOutputs: [
        {
          outputIndex: 0,
          encryptedOutput: "aabb",
        },
        {
          outputIndex: 2,
          encryptedOutput: "cc",
        },
      ],
      historyIndexes: [2, 1],
    });
  });

  it("prefers indexed encrypted outputs when present", () => {
    expect(
      createNoteBackup({
        ...createBackup(),
        encryptedOutputs: ["FFFF"],
        indexedOutputs: [
          {
            outputIndex: 7,
            encryptedOutput: "AABB",
          },
        ],
      }),
    ).toMatchObject({
      encryptedOutputs: ["aabb"],
      indexedOutputs: [
        {
          outputIndex: 7,
          encryptedOutput: "aabb",
        },
      ],
    });
  });

  it("rejects duplicate encrypted outputs with different indexes", () => {
    expect(() =>
      createNoteBackup({
        ...createBackup(),
        indexedOutputs: [
          {
            outputIndex: 4,
            encryptedOutput: "AABB",
          },
          {
            outputIndex: 8,
            encryptedOutput: "AABB",
          },
        ],
      }),
    ).toThrow("duplicate encrypted output");
  });

  it("imports, exports, and clears notes in scoped storage", () => {
    const storage = new TestStorage();
    const imported = importNotes({
      storage,
      programAddress,
      ownerAddress,
      backup: createBackup(),
      merge: false,
    });

    expect(JSON.parse(storage.getItem(createNoteKey({ programAddress, ownerAddress })) ?? "{}")).toEqual(imported);
    expect(
      exportNotes({
        storage,
        programAddress,
        ownerAddress,
        exportedAt: new Date("2026-06-19T00:00:00.000Z"),
      }),
    ).toMatchObject({
      exportedAt: "2026-06-19T00:00:00.000Z",
      encryptedOutputs: ["aabb", "cc"],
    });

    clearNotes({ storage, programAddress, ownerAddress });
    expect(storage.values.size).toBe(0);
  });

  it("wraps storage as a NoteStore", () => {
    const store = createNoteStore(new TestStorage());

    expect(
      store.exportNotes({
        programAddress,
        ownerAddress,
        exportedAt: new Date("2026-06-20T00:00:00.000Z"),
      }),
    ).toMatchObject({
      encryptedOutputs: [],
      fetchOffset: 0,
      historyIndexes: [],
    });
  });
});
