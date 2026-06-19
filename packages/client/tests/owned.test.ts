import { describe, expect, it, vi } from "vitest";

import {
  NOTE_BACKUP_VERSION,
  addressSchema,
  createOwnedNoteSource,
  createOwnedNoteStore,
  createNoteSelector,
  getOwnedNoteBalance,
  quoteTransfer,
  type NoteKeyDeriver,
  type NoteBackup,
  type NoteStore,
  type OwnedNote,
  type OwnedNoteDecryptor,
  type OwnedNoteIndexer,
  type OwnedNoteStore,
  type PrepareTransferInput,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const recipientAddress = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const commitmentA =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const commitmentB =
  "218374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const commitmentC =
  "318374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifierA =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifierB =
  "b18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifierC =
  "c18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";

function createBackup(encryptedOutputs = ["aa", "bb", "cc"]): NoteBackup {
  return {
    version: NOTE_BACKUP_VERSION,
    programAddress,
    ownerAddress,
    exportedAt: "2026-06-18T00:00:00.000Z",
    encryptedOutputs,
    indexedOutputs: encryptedOutputs.map((encryptedOutput, outputIndex) => ({
      outputIndex,
      encryptedOutput,
    })),
    fetchOffset: encryptedOutputs.length,
    historyIndexes: [],
  };
}

function createTransferInput(
  grossWithdrawalLamports: bigint,
): PrepareTransferInput {
  const quote = quoteTransfer({
    recipientLamports: grossWithdrawalLamports,
    privateBalanceLamports: grossWithdrawalLamports,
    withdrawalFeeBps: 0,
  });

  return {
    programAddress,
    ownerAddress,
    recipient: recipientAddress,
    quote,
    unlockSignature: new Uint8Array([1]),
  };
}

function createOwnedNote(input: {
  commitment: string;
  encryptedOutput: string;
  outputIndex?: number | undefined;
  nullifier?: string | undefined;
  amountLamports: bigint;
}): OwnedNote {
  return {
    ...input,
    outputIndex: input.outputIndex ?? getDefaultOutputIndex(input.encryptedOutput),
    nullifier: input.nullifier ?? input.commitment.replace(/^./, "f"),
    witness: {
      secret: input.commitment,
    },
  };
}

function getDefaultOutputIndex(encryptedOutput: string): number {
  return {
    aa: 0,
    bb: 1,
    cc: 2,
  }[encryptedOutput] ?? 0;
}

function createStore(notes: unknown): OwnedNoteStore {
  return {
    listOwnedNotes: vi.fn(async () => notes),
  };
}

function createNoteStore(backup: NoteBackup): NoteStore {
  return {
    exportNotes: vi.fn(() => backup),
    importNotes: vi.fn(() => backup),
    clearNotes: vi.fn(),
  };
}

function createKeyDeriver(noteKey = new Uint8Array(32).fill(9)): NoteKeyDeriver {
  return {
    deriveNoteKey: vi.fn(async () => noteKey),
  };
}

function createIndexer(spentNullifiers = new Set<string>()): OwnedNoteIndexer {
  return {
    getNullifierStatus: vi.fn(async ({ nullifier }) => ({
      spent: spentNullifiers.has(nullifier),
      nullifier,
      txSignature: null,
      instructionIndex: null,
      slot: null,
      spentAt: null,
    })),
  };
}

function createDecryptor(
  outputByEncryptedOutput: Record<string, unknown | null>,
): OwnedNoteDecryptor {
  return {
    decryptOwnedNote: vi.fn(async ({ encryptedOutput }) =>
      outputByEncryptedOutput[encryptedOutput] ?? null,
    ),
  };
}

describe("owned", () => {
  it("picks the largest single note that covers the transfer", async () => {
    const store = createStore([
      createOwnedNote({
        commitment: commitmentA,
        encryptedOutput: "aa",
        nullifier: nullifierA,
        amountLamports: 4n,
      }),
      createOwnedNote({
        commitment: commitmentB,
        encryptedOutput: "bb",
        nullifier: nullifierB,
        amountLamports: 10n,
      }),
      createOwnedNote({
        commitment: commitmentC,
        encryptedOutput: "cc",
        nullifier: nullifierC,
        amountLamports: 20n,
      }),
    ]);
    const selector = createNoteSelector({ ownedNotes: store });

    await expect(
      selector.selectNotes({
        transfer: createTransferInput(9n),
        backup: createBackup(),
      }),
    ).resolves.toEqual({
      inputNotes: [
        {
          commitment: commitmentC,
          encryptedOutput: "cc",
          outputIndex: 2,
          nullifier: nullifierC,
          amountLamports: 20n,
          witness: {
            secret: commitmentC,
          },
        },
      ],
    });
    expect(store.listOwnedNotes).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
    });
  });

  it("picks two largest notes when no single note is enough", async () => {
    const store = createStore([
      createOwnedNote({
        commitment: commitmentA,
        encryptedOutput: "aa",
        nullifier: nullifierA,
        amountLamports: 4n,
      }),
      createOwnedNote({
        commitment: commitmentB,
        encryptedOutput: "bb",
        nullifier: nullifierB,
        amountLamports: 8n,
      }),
      createOwnedNote({
        commitment: commitmentC,
        encryptedOutput: "cc",
        nullifier: nullifierC,
        amountLamports: 9n,
      }),
    ]);
    const selector = createNoteSelector({ ownedNotes: store });

    await expect(
      selector.selectNotes({
        transfer: createTransferInput(15n),
        backup: createBackup(),
      }),
    ).resolves.toEqual({
      inputNotes: [
        {
          commitment: commitmentC,
          encryptedOutput: "cc",
          outputIndex: 2,
          nullifier: nullifierC,
          amountLamports: 9n,
          witness: {
            secret: commitmentC,
          },
        },
        {
          commitment: commitmentB,
          encryptedOutput: "bb",
          outputIndex: 1,
          nullifier: nullifierB,
          amountLamports: 8n,
          witness: {
            secret: commitmentB,
          },
        },
      ],
    });
  });

  it("ignores owned notes outside the synced backup", async () => {
    const store = createStore([
      createOwnedNote({
        commitment: commitmentA,
        encryptedOutput: "aa",
        nullifier: nullifierA,
        amountLamports: 4n,
      }),
      createOwnedNote({
        commitment: commitmentB,
        encryptedOutput: "bb",
        nullifier: nullifierB,
        amountLamports: 10n,
      }),
    ]);
    const selector = createNoteSelector({ ownedNotes: store });

    await expect(
      selector.selectNotes({
        transfer: createTransferInput(9n),
        backup: createBackup(["aa"]),
      }),
    ).rejects.toThrow("Not enough owned private notes");
  });

  it("rejects insufficient owned notes", async () => {
    const selector = createNoteSelector({
      ownedNotes: createStore([
        createOwnedNote({
          commitment: commitmentA,
          encryptedOutput: "aa",
          nullifier: nullifierA,
          amountLamports: 4n,
        }),
      ]),
    });

    await expect(
      selector.selectNotes({
        transfer: createTransferInput(5n),
        backup: createBackup(),
      }),
    ).rejects.toThrow("Not enough owned private notes");
  });

  it("validates owned note data from the store", async () => {
    const selector = createNoteSelector({
      ownedNotes: createStore([
        {
          commitment: "not-a-commitment",
          encryptedOutput: "not-hex",
          nullifier: "not-a-nullifier",
          amountLamports: 0n,
          witness: {},
        },
      ]),
    });

    await expect(
      selector.selectNotes({
        transfer: createTransferInput(1n),
        backup: createBackup(),
      }),
    ).rejects.toThrow();
  });

  it("filters already-spent owned notes through the indexer", async () => {
    const source = createStore([
      createOwnedNote({
        commitment: commitmentA,
        encryptedOutput: "aa",
        nullifier: nullifierA,
        amountLamports: 4n,
      }),
      createOwnedNote({
        commitment: commitmentB,
        encryptedOutput: "bb",
        nullifier: nullifierB,
        amountLamports: 10n,
      }),
    ]);
    const indexer = createIndexer(new Set([nullifierB]));
    const store = createOwnedNoteStore({ source, indexer });

    await expect(
      store.listOwnedNotes({ programAddress, ownerAddress }),
    ).resolves.toEqual([
      expect.objectContaining({
        commitment: commitmentA,
        nullifier: nullifierA,
      }),
    ]);
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: nullifierA,
    });
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: nullifierB,
    });
  });

  it("rejects nullifier status responses for the wrong note", async () => {
    const source = createStore([
      createOwnedNote({
        commitment: commitmentA,
        encryptedOutput: "aa",
        nullifier: nullifierA,
        amountLamports: 4n,
      }),
    ]);
    const indexer: OwnedNoteIndexer = {
      getNullifierStatus: vi.fn(async () => ({
        spent: false,
        nullifier: nullifierB,
      })),
    };
    const store = createOwnedNoteStore({ source, indexer });

    await expect(
      store.listOwnedNotes({ programAddress, ownerAddress }),
    ).rejects.toThrow("wrong note");
  });

  it("sums owned-note balance", () => {
    expect(
      getOwnedNoteBalance([
        createOwnedNote({
          commitment: commitmentA,
          encryptedOutput: "aa",
          nullifier: nullifierA,
          amountLamports: 4n,
        }),
        createOwnedNote({
          commitment: commitmentB,
          encryptedOutput: "bb",
          nullifier: nullifierB,
          amountLamports: 10n,
        }),
      ]),
    ).toEqual({ lamports: 14n });
  });

  it("builds owned notes from synced encrypted outputs", async () => {
    const backup = createBackup(["aa", "bb"]);
    const notes = createNoteStore(backup);
    const keyDeriver = createKeyDeriver();
    const decryptor = createDecryptor({
      aa: {
        commitment: commitmentA,
        nullifier: nullifierA,
        amountLamports: 4n,
        witness: { secret: commitmentA },
      },
      bb: null,
    });
    const source = createOwnedNoteSource({
      notes,
      keyDeriver,
      decryptor,
      programAddress,
      ownerAddress,
      unlockSignature: new Uint8Array([1, 2, 3]),
      now: () => new Date("2026-06-18T00:00:00.000Z"),
    });

    await expect(
      source.listOwnedNotes({ programAddress, ownerAddress }),
    ).resolves.toEqual([
      {
        commitment: commitmentA,
        encryptedOutput: "aa",
        outputIndex: 0,
        nullifier: nullifierA,
        amountLamports: 4n,
        witness: { secret: commitmentA },
      },
    ]);
    expect(keyDeriver.deriveNoteKey).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      unlockSignature: new Uint8Array([1, 2, 3]),
    });
    expect(notes.exportNotes).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      exportedAt: new Date("2026-06-18T00:00:00.000Z"),
    });
    expect(decryptor.decryptOwnedNote).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      noteKey: new Uint8Array(32).fill(9),
      encryptedOutput: "aa",
      outputIndex: 0,
    });
    expect(decryptor.decryptOwnedNote).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      noteKey: new Uint8Array(32).fill(9),
      encryptedOutput: "bb",
      outputIndex: 1,
    });
  });

  it("rejects owned-note source requests outside the configured scope", async () => {
    const source = createOwnedNoteSource({
      notes: createNoteStore(createBackup(["aa"])),
      keyDeriver: createKeyDeriver(),
      decryptor: createDecryptor({}),
      programAddress,
      ownerAddress,
      unlockSignature: new Uint8Array([1]),
    });

    await expect(
      source.listOwnedNotes({
        programAddress,
        ownerAddress: recipientAddress,
      }),
    ).rejects.toThrow("owner address does not match");
  });

  it("validates decrypted owned-note payloads", async () => {
    const source = createOwnedNoteSource({
      notes: createNoteStore(createBackup(["aa"])),
      keyDeriver: createKeyDeriver(),
      decryptor: createDecryptor({
        aa: {
          commitment: commitmentA,
          nullifier: "not-a-nullifier",
          amountLamports: 0n,
          witness: {},
        },
      }),
      programAddress,
      ownerAddress,
      unlockSignature: new Uint8Array([1]),
    });

    await expect(
      source.listOwnedNotes({ programAddress, ownerAddress }),
    ).rejects.toThrow();
  });
});
