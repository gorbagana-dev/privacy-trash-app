import { describe, expect, it, vi } from "vitest";

import {
  NOTE_BACKUP_VERSION,
  NATIVE_TOKEN_SENTINEL,
  addressSchema,
  createNoteStore,
  createProverProofProvider,
  quoteTransfer,
  type CircuitProver,
  type KeyValueStorage,
  type NoteSelector,
  type PoseidonHasher,
  type PrepareTransferInput,
  type ProverIndexer,
  type UtxoWitness,
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
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const commitmentDecimal = BigInt(`0x${commitment}`).toString();
const noteNullifier =
  "00000000000000000000000000000000000000000000000000000000000003ec";
const noteNullifierDecimal = BigInt(`0x${noteNullifier}`).toString();
const staleNoteNullifier =
  "00000000000000000000000000000000000000000000000000000000000003ed";
const nullifier = addressSchema.parse(
  "48JDPc91uGGyic2roMgbfAU7svJeHN3WN5TJHPCHuKuS",
);
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

function createTransferInput(
  overrides: Partial<PrepareTransferInput> = {},
): PrepareTransferInput {
  return {
    programAddress,
    ownerAddress,
    recipient: recipientAddress,
    quote: quoteTransfer({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 2_000_000n,
      withdrawalFeeBps: 25,
    }),
    unlockSignature: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

function createProofMaterial() {
  const bytes = new Uint8Array([1, 2, 3]);

  return {
    nullifiers: [nullifier, ownerAddress, recipientAddress, programAddress],
    proof: {
      proofA: bytes,
      proofB: bytes,
      proofC: bytes,
      root: bytes,
      publicAmount: bytes,
      extDataHash: bytes,
      inputNullifiers: [bytes, bytes],
      outputCommitments: [bytes, bytes],
    },
    extData: {
      extAmount: -1_000_000n,
      fee: 2_506n,
    },
    encryptedOutput1: bytes,
    encryptedOutput2: bytes,
  };
}

function createWitness(
  overrides: Partial<UtxoWitness> = {},
): UtxoWitness {
  return {
    version: "v2",
    amountLamports: 2_000_000n,
    blinding: "9",
    index: 0,
    privateKey: "11",
    publicKey: "12",
    commitment: commitmentDecimal,
    nullifier: "13",
    nullifierHex: noteNullifier,
    mintAddress: NATIVE_TOKEN_SENTINEL,
    ...overrides,
  };
}

function createNotes() {
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
      fetchOffset: 1,
      historyIndexes: [0],
    },
  });

  return notes;
}

function createNoteSelector(
  output: unknown = {
    inputNotes: [
      {
        commitment,
        encryptedOutput: "010203",
        outputIndex: 0,
        nullifier: noteNullifier,
        amountLamports: 2_000_000n,
        witness: createWitness(),
      },
    ],
  },
): NoteSelector {
  return {
    selectNotes: vi.fn(async () => output),
  };
}

function createIndexer(): ProverIndexer {
  return {
    getNullifierStatus: vi.fn(async ({ nullifier: inputNullifier }) => ({
      spent: false,
      nullifier: inputNullifier,
      txSignature: null,
      instructionIndex: null,
      slot: null,
      spentAt: null,
    })),
    getMerkleProof: vi.fn(async () => ({
      treeHeight: 26,
      root: "123",
      nextIndex: 1,
      proofs: [
        {
          commitment: BigInt(`0x${commitment}`).toString(10),
          commitmentHex: commitment,
          found: true,
          outputIndex: "0",
          pathElements: Array.from({ length: 26 }, () => "0"),
          pathIndices: Array.from({ length: 26 }, () => 0),
        },
      ],
    })),
  };
}

function createHasher(outputs = ["14", noteNullifierDecimal]): PoseidonHasher {
  const queue = [...outputs];

  return {
    poseidonHashString: vi.fn(() => {
      const output = queue.shift();

      if (output === undefined) throw new Error("Unexpected Poseidon hash call.");

      return output;
    }),
  };
}

function createMockCircuitProver(output: unknown = createProofMaterial()): CircuitProver {
  return {
    prove: vi.fn(async () => output),
  };
}

describe("prover", () => {
  it("creates a ProofProvider from local notes, indexer proofs, and a prover", async () => {
    const notes = createNotes();
    const indexer = createIndexer();
    const noteSelector = createNoteSelector();
    const circuitProver = createMockCircuitProver();
    const hasher = createHasher();
    const provider = createProverProofProvider({
      notes,
      indexer,
      noteSelector,
      circuitProver,
      hasher,
      programAddress,
      ownerAddress,
      now: () => exportedAt,
    });
    const transfer = createTransferInput();

    await expect(provider.createProofMaterial(transfer)).resolves.toEqual(
      createProofMaterial(),
    );
    expect(noteSelector.selectNotes).toHaveBeenCalledWith({
      transfer,
      backup: expect.objectContaining({
        encryptedOutputs: ["010203"],
        fetchOffset: 1,
      }),
    });
    expect(indexer.getMerkleProof).toHaveBeenCalledWith({
      commitments: [commitment],
    });
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: noteNullifier,
    });
    expect(circuitProver.prove).toHaveBeenCalledWith({
      transfer,
      programAddress,
      ownerAddress,
      recipient: recipientAddress,
      merkleRoot: "123",
      treeHeight: 26,
      nextIndex: 1,
      amounts: {
        recipientLamports: 1_000_000n,
        grossWithdrawalLamports: 1_002_506n,
        withdrawalFeeLamports: 2_506n,
        shieldLamports: 0n,
        privateBalanceLamports: 2_000_000n,
        selectedInputLamports: 2_000_000n,
        changeLamports: 997_494n,
      },
      inputNotes: [
        {
          commitment,
          encryptedOutput: "010203",
          outputIndex: 0,
          nullifier: noteNullifier,
          amountLamports: 2_000_000n,
          witness: createWitness({
            nullifier: noteNullifierDecimal,
          }),
          merkleProof: expect.objectContaining({
            commitmentHex: commitment,
            outputIndex: "0",
          }),
        },
      ],
    });
  });

  it("rederives selected note nullifiers from Merkle proof indexes", async () => {
    const notes = createNotes();
    const indexer = createIndexer();
    const noteSelector = createNoteSelector({
      inputNotes: [
        {
          commitment,
          encryptedOutput: "010203",
          outputIndex: 0,
          nullifier: staleNoteNullifier,
          amountLamports: 2_000_000n,
          witness: createWitness({
            index: 99,
            nullifier: "99",
            nullifierHex: staleNoteNullifier,
          }),
        },
      ],
    });
    const circuitProver = createMockCircuitProver();
    const hasher = createHasher();
    const provider = createProverProofProvider({
      notes,
      indexer,
      noteSelector,
      circuitProver,
      hasher,
      programAddress,
      ownerAddress,
      now: () => exportedAt,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).resolves.toEqual(createProofMaterial());
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(1, [
      "11",
      commitmentDecimal,
      "0",
    ]);
    expect(hasher.poseidonHashString).toHaveBeenNthCalledWith(2, [
      commitmentDecimal,
      "0",
      "14",
    ]);
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: noteNullifier,
    });
    expect(circuitProver.prove).toHaveBeenCalledWith(
      expect.objectContaining({
        inputNotes: [
          expect.objectContaining({
            nullifier: noteNullifier,
            witness: expect.objectContaining({
              index: 0,
              nullifier: noteNullifierDecimal,
              nullifierHex: noteNullifier,
            }),
          }),
        ],
      }),
    );
  });

  it("rejects transfers outside the prover scope", async () => {
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer: createIndexer(),
      noteSelector: createNoteSelector(),
      circuitProver: createMockCircuitProver(),
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(
        createTransferInput({
          ownerAddress: recipientAddress,
        }),
      ),
    ).rejects.toThrow("Transfer owner address does not match prover scope");
  });

  it("rejects selected notes that are not in the local backup", async () => {
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer: createIndexer(),
      noteSelector: createNoteSelector({
        inputNotes: [
          {
            commitment,
            encryptedOutput: "aabbcc",
            outputIndex: 0,
            nullifier: noteNullifier,
            amountLamports: 2_000_000n,
            witness: createWitness(),
          },
        ],
      }),
      circuitProver: createMockCircuitProver(),
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).rejects.toThrow("Selected note is not in the local note backup");
  });

  it("rejects selected notes whose witness does not match the note", async () => {
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer: createIndexer(),
      noteSelector: createNoteSelector({
        inputNotes: [
          {
            commitment,
            encryptedOutput: "010203",
            outputIndex: 0,
            nullifier: noteNullifier,
            amountLamports: 2_000_000n,
            witness: createWitness({
              commitment: "999",
            }),
          },
        ],
      }),
      circuitProver: createMockCircuitProver(),
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).rejects.toThrow("Selected note commitment does not match its witness");
  });

  it("rejects selected notes that became spent before circuit proof generation", async () => {
    const indexer: ProverIndexer = {
      getNullifierStatus: vi.fn(async ({ nullifier: inputNullifier }) => ({
        spent: true,
        nullifier: inputNullifier,
      })),
      getMerkleProof: vi.fn(async () => ({
        treeHeight: 26,
        root: "123",
        nextIndex: 1,
        proofs: [
          {
            commitment: BigInt(`0x${commitment}`).toString(10),
            commitmentHex: commitment,
            found: true,
            outputIndex: "0",
            pathElements: Array.from({ length: 26 }, () => "0"),
            pathIndices: Array.from({ length: 26 }, () => 0),
          },
        ],
      })),
    };
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer,
      noteSelector: createNoteSelector(),
      circuitProver: createMockCircuitProver(),
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).rejects.toThrow("Selected note has already been spent");
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: noteNullifier,
    });
  });

  it("rejects missing or mismatched Merkle proofs", async () => {
    const indexer: ProverIndexer = {
      getNullifierStatus: vi.fn(async ({ nullifier: inputNullifier }) => ({
        spent: false,
        nullifier: inputNullifier,
      })),
      getMerkleProof: vi.fn(async () => ({
        treeHeight: 26,
        root: "123",
        nextIndex: 1,
        proofs: [
          {
            commitment: "10",
            commitmentHex: "a".repeat(64),
            found: false,
            outputIndex: null,
            pathElements: Array.from({ length: 26 }, () => "0"),
            pathIndices: Array.from({ length: 26 }, () => 0),
          },
        ],
      })),
    };
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer,
      noteSelector: createNoteSelector(),
      circuitProver: createMockCircuitProver(),
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).rejects.toThrow("Indexer did not return a Merkle proof");
  });

  it("validates prover output before returning proof material", async () => {
    const circuitProver = createMockCircuitProver({
      ...createProofMaterial(),
      encryptedOutput1: new Uint8Array(),
    });
    const provider = createProverProofProvider({
      notes: createNotes(),
      indexer: createIndexer(),
      noteSelector: createNoteSelector(),
      circuitProver,
      hasher: createHasher(),
      programAddress,
      ownerAddress,
    });

    await expect(
      provider.createProofMaterial(createTransferInput()),
    ).rejects.toThrow("Expected non-empty bytes");
  });
});
