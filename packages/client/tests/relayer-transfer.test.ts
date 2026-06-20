import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_TOKEN_SENTINEL,
  RELAYER_TRANSFER_PAYLOAD_KIND,
  addressSchema,
  createRelayerTransferExecutor,
  getRelayerTransferPayload,
  quoteTransfer,
  preparedTransferSchema,
  serializeProofMaterial,
  type NoteBackup,
  type NoteSelector,
  type NoteStore,
  type PoseidonHasher,
  type ProofMaterial,
  type ProofRunner,
  type ProverIndexer,
  type RandomBytes,
  type Relayer,
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
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);
const createdAt = new Date("2026-06-18T00:00:00.000Z");
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";
const encryptedOutput = "010203";
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifier =
  "00000000000000000000000000000000000000000000000000000000000003ec";

describe("relayer transfer", () => {
  it("serializes proof material as JSON-safe relayer data", () => {
    expect(serializeProofMaterial(createProof())).toMatchObject({
      extData: {
        extAmount: "-1000000",
        fee: "2506",
      },
      proof: {
        proofA: expect.any(String),
        proofB: expect.any(String),
      },
    });
  });

  it("prepares, simulates, and submits through the relayer", async () => {
    const relayer = createRelayer();
    const executor = createRelayerTransferExecutor({
      relayer,
      notes: createNoteStore(),
      indexer: createIndexer(),
      hasher: createHasher(),
      noteSelector: createNoteSelector(),
      proofRunner: createProofRunner(),
      programAddress,
      ownerAddress,
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
    const payload = getRelayerTransferPayload(prepared);

    expect(payload.kind).toBe(RELAYER_TRANSFER_PAYLOAD_KIND);
    expect(payload.request).toMatchObject({
      programAddress,
      recipient: recipientAddress,
      feeRecipient,
    });
    expect(JSON.stringify(payload.request)).not.toContain(ownerAddress);
    await expect(executor.simulateTransfer(prepared)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 247_349,
    });
    await expect(executor.sendTransfer(prepared)).resolves.toEqual({
      signature,
      sentAt: "2026-06-19T19:33:33.000Z",
      explorerUrl: `https://explorer.gorbagana.wtf/tx/${signature}`,
    });
    expect(relayer.simulateTransfer).toHaveBeenCalledWith(payload.request);
    expect(relayer.submitTransfer).toHaveBeenCalledWith(payload.request);
  });
});

function createRelayer(): Relayer {
  return {
    simulateTransfer: vi.fn(async () => ({
      ok: true as const,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 247_349,
    })),
    submitTransfer: vi.fn(async () => ({
      signature,
      sentAt: "2026-06-19T19:33:33.000Z",
      explorerUrl: `https://explorer.gorbagana.wtf/tx/${signature}`,
    })),
  };
}

function createProof(): ProofMaterial {
  const bytes = new Uint8Array([1, 2, 3]);

  return {
    nullifiers: [feeRecipient, ownerAddress, recipientAddress, feeRecipient],
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
