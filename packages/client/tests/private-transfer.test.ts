import {
  blockhash,
  getTransactionMessageComputeUnitLimit,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import {
  CHAIN_TRANSFER_PAYLOAD_KIND,
  DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
  NATIVE_TOKEN_SENTINEL,
  addressSchema,
  createPrivateTransferExecutor,
  preparedTransferSchema,
  quoteTransfer,
  type BuildTransactInstruction,
  type ChainRpc,
  type NoteBackup,
  type NoteSelector,
  type NoteStore,
  type PoseidonHasher,
  type ProofRunner,
  type ProverIndexer,
  type RandomBytes,
  type TransactionExecutor,
  type UtxoWitness,
} from "@/index";
import { getChainPayload } from "@/chain";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const recipientAddress = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);
const latestBlockhash = {
  blockhash: blockhash("ABmPH5KDXX99u6woqFS5vfBGSNyKG42SzpvBMWWqAy48"),
  lastValidBlockHeight: 123n,
};
const createdAt = new Date("2026-06-18T00:00:00.000Z");
const encryptedOutput = "010203";
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifier =
  "00000000000000000000000000000000000000000000000000000000000003ec";

describe("private transfer", () => {
  it("composes notes, proving, instruction building, and chain preparation", async () => {
    const signer = createSigner();
    const rpc = createRpc();
    const notes = createNoteStore();
    const indexer = createIndexer();
    const noteSelector = createNoteSelector();
    const proofRunner = createProofRunner();
    const transactionExecutor = createTransactionExecutor();
    const buildTransactInstruction = vi.fn(async () => createInstruction()) satisfies
      BuildTransactInstruction;
    const executor = createPrivateTransferExecutor({
      rpc,
      signer,
      transactionExecutor,
      notes,
      indexer,
      hasher: createHasher(),
      noteSelector,
      proofRunner,
      buildTransactInstruction,
      programAddress,
      feeRecipient,
      randomBytes: createRandomBytes(),
      now: () => createdAt,
    });
    const quote = quoteTransfer({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 2_000_000n,
      withdrawalFeeBps: 25,
    });

    const prepared = preparedTransferSchema.parse(
      await executor.prepareTransfer({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
        quote,
        unlockSignature: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(prepared).toMatchObject({
      programAddress,
      ownerAddress,
      recipient: recipientAddress,
      createdAt: createdAt.toISOString(),
      payload: {
        kind: CHAIN_TRANSFER_PAYLOAD_KIND,
      },
    });
    expect(notes.exportNotes).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      exportedAt: createdAt,
    });
    expect(noteSelector.selectNotes).toHaveBeenCalledWith({
      transfer: expect.objectContaining({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
      }),
      backup: createBackup(),
    });
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({ nullifier });
    expect(indexer.getMerkleProof).toHaveBeenCalledWith({
      commitments: [commitment],
    });
    expect(proofRunner.prove).toHaveBeenCalledWith(
      expect.objectContaining({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
        feeRecipient,
        treeHeight: 26,
        extData: {
          extAmount: -1_000_000n,
          fee: 2_506n,
        },
      }),
    );
    expect(buildTransactInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        signer,
        recipient: recipientAddress,
        feeRecipient,
        programAddress,
        material: expect.objectContaining({
          nullifiers: expect.arrayContaining([
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String),
          ]),
          encryptedOutput1: expect.any(Uint8Array),
          encryptedOutput2: expect.any(Uint8Array),
        }),
      }),
    );

    const payload = getChainPayload(prepared);

    expect(payload.transactionMessage.version).toBe(0);
    expect(getTransactionMessageComputeUnitLimit(payload.transactionMessage)).toBe(
      DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
    );
    expect(payload.transactionMessage.instructions).toHaveLength(2);
    expect(payload.transactionMessage.instructions[1]).toEqual(
      createInstruction(),
    );
    expect(payload.transactionMessage.lifetimeConstraint).toEqual(
      latestBlockhash,
    );
    expect(payload.transactionMessage.feePayer.address).toBe(ownerAddress);
    expect(transactionExecutor.simulateTransaction).not.toHaveBeenCalled();
    expect(transactionExecutor.sendTransaction).not.toHaveBeenCalled();
  });

  it("delegates simulation to the transaction executor", async () => {
    const transactionExecutor = createTransactionExecutor();
    const executor = createPrivateTransferExecutor({
      rpc: createRpc(),
      signer: createSigner(),
      transactionExecutor,
      notes: createNoteStore(),
      indexer: createIndexer(),
      hasher: createHasher(),
      noteSelector: createNoteSelector(),
      proofRunner: createProofRunner(),
      buildTransactInstruction: vi.fn(async () => createInstruction()),
      programAddress,
      feeRecipient,
      randomBytes: createRandomBytes(),
      now: () => createdAt,
    });
    const prepared = preparedTransferSchema.parse(
      await executor.prepareTransfer({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
        quote: quoteTransfer({
          recipientLamports: 1_000_000n,
          privateBalanceLamports: 2_000_000n,
          withdrawalFeeBps: 25,
        }),
        unlockSignature: new Uint8Array([1, 2, 3]),
      }),
    );

    await expect(executor.simulateTransfer(prepared)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 257_332,
    });
    expect(transactionExecutor.simulateTransaction).toHaveBeenCalledWith({
      preparedOperation: prepared,
      transactionMessage: getChainPayload(prepared).transactionMessage,
    });
  });
});

function createSigner(): TransactionSigner {
  return {
    address: ownerAddress,
    signTransactions: async () => [],
  };
}

function createRpc(): ChainRpc {
  return {
    getLatestBlockhash: () => ({
      send: vi.fn(async () => ({ value: latestBlockhash })),
    }),
  };
}

function createNoteStore(): NoteStore {
  return {
    exportNotes: vi.fn(() => createBackup()),
    importNotes: vi.fn(),
    clearNotes: vi.fn(),
  };
}

function createBackup(): NoteBackup {
  return {
    version: 1,
    programAddress,
    ownerAddress,
    exportedAt: createdAt.toISOString(),
    encryptedOutputs: [encryptedOutput],
    indexedOutputs: [
      {
        outputIndex: 0,
        encryptedOutput,
      },
    ],
    fetchOffset: 0,
    historyIndexes: [],
  };
}

function createNoteSelector(): NoteSelector {
  return {
    selectNotes: vi.fn(async () => ({
      inputNotes: [
        {
          commitment,
          encryptedOutput,
          outputIndex: 0,
          nullifier,
          amountLamports: 2_000_000n,
          witness: createWitness(),
        },
      ],
    })),
  };
}

function createWitness(): UtxoWitness {
  return {
    version: "v2",
    amountLamports: 2_000_000n,
    blinding: "9",
    index: 0,
    privateKey: "10",
    publicKey: "11",
    commitment: BigInt(`0x${commitment}`).toString(),
    nullifier: "12",
    nullifierHex: nullifier,
    mintAddress: NATIVE_TOKEN_SENTINEL,
  };
}

function createIndexer(): ProverIndexer {
  return {
    getNullifierStatus: vi.fn(async ({ nullifier: inputNullifier }) => ({
      spent: false,
      nullifier: inputNullifier,
    })),
    getMerkleProof: vi.fn(async () => ({
      treeHeight: 26,
      root: "123",
      nextIndex: 7,
      proofs: [
        {
          commitment: BigInt(`0x${commitment}`).toString(),
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

function createHasher(): PoseidonHasher {
  const outputs = ["1003", "1004", "111", "222", "333", "444", "555", "666"];

  return {
    poseidonHashString: vi.fn(() => {
      const output = outputs.shift();

      if (output === undefined) throw new Error("Unexpected hash call.");

      return output;
    }),
  };
}

function createProofRunner(): ProofRunner {
  return {
    prove: vi.fn(async () => ({
      proofA: bytes(64, 1),
      proofB: bytes(128, 2),
      proofC: bytes(64, 3),
    })),
  };
}

function createTransactionExecutor(): TransactionExecutor {
  return {
    simulateTransaction: vi.fn(async () => ({
      value: {
        err: null,
        logs: ["Program log: Instruction: Transact"],
        unitsConsumed: 257_332,
      },
    })),
    sendTransaction: vi.fn(async () => {
      throw new Error("send should not be called by these tests");
    }),
  };
}

function createInstruction(): Instruction {
  return {
    programAddress,
    accounts: [],
    data: new Uint8Array([9, 9, 9]),
  };
}

function createRandomBytes(): RandomBytes {
  let value = 1;

  return (length) => {
    const bytes = new Uint8Array(length).fill(value);
    value += 1;

    return bytes;
  };
}

function bytes(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}
