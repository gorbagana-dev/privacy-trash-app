import { describe, expect, it, vi } from "vitest";

import {
  NOTE_BACKUP_VERSION,
  createNoteStore,
  syncNotes,
  type KeyValueStorage,
  type NoteSyncIndexer,
} from "@/index";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const ownerAddress = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";
const exportedAt = new Date("2026-06-18T00:00:00.000Z");

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

function createIndexer(input: {
  total: number;
  hasMore: boolean;
  encryptedOutputs?: string[] | undefined;
  outputs?: { outputIndex: number; encryptedOutput: string }[] | undefined;
}): NoteSyncIndexer {
  return {
    getOutputRange: vi.fn(async (range: { start: number | bigint | string }) => {
      const start = Number(range.start);
      const outputs =
        input.outputs ??
        (input.encryptedOutputs ?? []).map((encryptedOutput, index) => ({
          outputIndex: start + index,
          encryptedOutput,
        }));

      return {
        total: input.total,
        hasMore: input.hasMore,
        outputs,
      };
    }),
  };
}

describe("syncNotes", () => {
  it("syncs the first encrypted output range into note storage", async () => {
    const notes = createNoteStore(new TestStorage());
    const indexer = createIndexer({
      total: 3,
      hasMore: true,
      encryptedOutputs: ["AQID", "////"],
    });

    await expect(
      syncNotes({
        notes,
        indexer,
        programAddress,
        ownerAddress,
        batchSize: 2,
        now: () => exportedAt,
      }),
    ).resolves.toMatchObject({
      previousOffset: 0,
      nextOffset: 2,
      fetched: 2,
      total: 3,
      hasMore: true,
      backup: {
        encryptedOutputs: ["010203", "ffffff"],
        indexedOutputs: [
          {
            outputIndex: 0,
            encryptedOutput: "010203",
          },
          {
            outputIndex: 1,
            encryptedOutput: "ffffff",
          },
        ],
        fetchOffset: 2,
        historyIndexes: [0],
      },
    });
    expect(indexer.getOutputRange).toHaveBeenCalledWith({
      start: 0,
      end: 2,
    });
  });

  it("continues from the stored fetch offset and preserves existing notes", async () => {
    const notes = createNoteStore(new TestStorage());
    notes.importNotes({
      programAddress,
      ownerAddress,
      merge: false,
      backup: {
        version: NOTE_BACKUP_VERSION,
        programAddress,
        ownerAddress,
        exportedAt: exportedAt.toISOString(),
        indexedOutputs: [
          {
            outputIndex: 0,
            encryptedOutput: "010203",
          },
        ],
        fetchOffset: 2,
        historyIndexes: [0],
      },
    });
    const indexer = createIndexer({
      total: 3,
      hasMore: false,
      encryptedOutputs: ["BAU="],
    });

    await expect(
      syncNotes({
        notes,
        indexer,
        programAddress,
        ownerAddress,
        batchSize: 100,
        now: () => exportedAt,
      }),
    ).resolves.toMatchObject({
      previousOffset: 2,
      nextOffset: 3,
      fetched: 1,
      backup: {
        encryptedOutputs: ["010203", "0405"],
        indexedOutputs: [
          {
            outputIndex: 0,
            encryptedOutput: "010203",
          },
          {
            outputIndex: 2,
            encryptedOutput: "0405",
          },
        ],
        fetchOffset: 3,
        historyIndexes: [2, 0],
      },
    });
    expect(indexer.getOutputRange).toHaveBeenCalledWith({
      start: 2,
      end: 102,
    });
  });

  it("does not advance when no new outputs are available", async () => {
    const notes = createNoteStore(new TestStorage());
    const indexer = createIndexer({
      total: 0,
      hasMore: false,
      encryptedOutputs: [],
    });

    await expect(
      syncNotes({
        notes,
        indexer,
        programAddress,
        ownerAddress,
        now: () => exportedAt,
      }),
    ).resolves.toMatchObject({
      previousOffset: 0,
      nextOffset: 0,
      fetched: 0,
      backup: {
        encryptedOutputs: [],
        indexedOutputs: [],
        fetchOffset: 0,
        historyIndexes: [],
      },
    });
  });

  it("rejects invalid sync inputs before reading the indexer", async () => {
    const indexer = createIndexer({
      total: 0,
      hasMore: false,
      encryptedOutputs: [],
    });

    await expect(
      syncNotes({
        notes: createNoteStore(new TestStorage()),
        indexer,
        programAddress,
        ownerAddress,
        batchSize: 20_001,
      }),
    ).rejects.toThrow();
    expect(indexer.getOutputRange).not.toHaveBeenCalled();

    await expect(
      syncNotes({
        notes: createNoteStore(new TestStorage()),
        indexer,
        programAddress: "not-an-address",
        ownerAddress,
      }),
    ).rejects.toThrow("Expected a valid Gorbagana address");
  });

  it("rejects inconsistent indexer ranges without writing storage", async () => {
    const notes = createNoteStore(new TestStorage());
    notes.importNotes({
      programAddress,
      ownerAddress,
      merge: false,
      backup: {
        version: NOTE_BACKUP_VERSION,
        programAddress,
        ownerAddress,
        exportedAt: exportedAt.toISOString(),
        indexedOutputs: [
          {
            outputIndex: 0,
            encryptedOutput: "010203",
          },
        ],
        fetchOffset: 2,
        historyIndexes: [],
      },
    });
    const behindIndexer = createIndexer({
      total: 1,
      hasMore: false,
      encryptedOutputs: [],
    });

    await expect(
      syncNotes({
        notes,
        indexer: behindIndexer,
        programAddress,
        ownerAddress,
      }),
    ).rejects.toThrow("Indexer total is behind");

    const emptyMoreIndexer = createIndexer({
      total: 3,
      hasMore: true,
      encryptedOutputs: [],
    });

    await expect(
      syncNotes({
        notes: createNoteStore(new TestStorage()),
        indexer: emptyMoreIndexer,
        programAddress,
        ownerAddress,
      }),
    ).rejects.toThrow("Indexer returned no outputs");

    const nonContiguousIndexer = createIndexer({
      total: 2,
      hasMore: false,
      outputs: [
        {
          outputIndex: 1,
          encryptedOutput: "AQID",
        },
      ],
    });

    await expect(
      syncNotes({
        notes: createNoteStore(new TestStorage()),
        indexer: nonContiguousIndexer,
        programAddress,
        ownerAddress,
      }),
    ).rejects.toThrow("expected 0");
  });
});
