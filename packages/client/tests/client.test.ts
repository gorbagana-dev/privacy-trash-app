import { describe, expect, it, vi } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  blockhash,
  type Base64EncodedWireTransaction,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";

import {
  CHAIN_TRANSFER_PAYLOAD_KIND,
  NATIVE_TOKEN_SENTINEL,
  UTXO_ENCRYPTION_VERSION_V2,
  TRANSFER_EXECUTION_VERSION,
  addressSchema,
  createClient,
  createNoteStore,
  createOwnedNotePoolReader,
  createPrivateClient,
  decimalToFieldHex,
  encodeUnlockMessage,
  type BuildTransactInstruction,
  type ChainRpc,
  type KeyValueStorage,
  type IndexerFetch,
  type NoteSyncIndexer,
  type NoteStore,
  type OwnedNoteStore,
  type PoseidonHasher,
  type PoolReader,
  type PrepareTransferInput,
  type PreparedTransfer,
  type ProofRunner,
  type RuntimeTransaction,
  type TransactionRpc,
  type TransferExecutor,
  type Wallet,
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
const latestBlockhash = {
  blockhash: blockhash("ABmPH5KDXX99u6woqFS5vfBGSNyKG42SzpvBMWWqAy48"),
  lastValidBlockHeight: 123n,
};
const createdAt = "2026-06-18T00:00:00.000Z";
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";
const encodedTransaction = "AQIDBA==" as Base64EncodedWireTransaction;
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifier =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";

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

function createWallet(signatureBytes = new Uint8Array([7, 8, 9])): Wallet {
  return {
    address: ownerAddress,
    signMessage: vi.fn(async () => signatureBytes),
  };
}

function createSigner(): TransactionSigner {
  return {
    address: ownerAddress,
    signTransactions: async () => [],
  };
}

function createPool(input: {
  feeConfig?: unknown;
  balance?: unknown;
} = {}): PoolReader {
  return {
    getFeeConfig: vi.fn(async () =>
      input.feeConfig ?? {
        depositFeeBps: 0,
        withdrawalFeeBps: 25,
        feeErrorMarginBps: 500,
        withdrawRentFeeLamports: 0n,
      },
    ),
    getPrivateBalance: vi.fn(async () => input.balance ?? { lamports: 250_000n }),
  };
}

function createPreparedTransfer(input: PrepareTransferInput): PreparedTransfer {
  return {
    version: TRANSFER_EXECUTION_VERSION,
    programAddress: input.programAddress,
    ownerAddress: input.ownerAddress,
    recipient: input.recipient,
    quote: input.quote,
    createdAt,
    payload: { id: "prepared" },
  };
}

function createTransferExecutor(
  overrides: Partial<TransferExecutor> = {},
): TransferExecutor {
  return {
    prepareTransfer: vi.fn(async (input: PrepareTransferInput) =>
      createPreparedTransfer(input),
    ),
    simulateTransfer: vi.fn(async () => ({ ok: true, logs: [] })),
    sendTransfer: vi.fn(async () => ({ signature, sentAt: createdAt })),
    ...overrides,
  };
}

function createIndexer(): NoteSyncIndexer {
  return {
    getOutputRange: vi.fn(async () => ({
      total: 1,
      hasMore: false,
      encryptedOutputs: ["AQID"],
    })),
  };
}

function createSequencedHasher(outputs: string[]): PoseidonHasher {
  return {
    poseidonHashString: vi.fn(() => {
      const output = outputs.shift();

      if (output === undefined) {
        throw new Error("Unexpected Poseidon hash call.");
      }

      return output;
    }),
  };
}

function createIndexerFetch(): IndexerFetch {
  return vi.fn(async (input) => {
    const url = input instanceof URL ? input : new URL(input.toString());

    if (url.pathname.startsWith("/v1/pool/nullifiers/")) {
      const nullifierValue = url.pathname.split("/").at(-1);

      return jsonResponse({
        spent: false,
        nullifier: nullifierValue,
        txSignature: null,
        instructionIndex: null,
        slot: null,
        spentAt: null,
      });
    }

    if (url.pathname === "/v1/merkle/proof") {
      const requestedCommitment = url.searchParams.get("commitments") ?? "1002";

      return jsonResponse({
        treeHeight: 26,
        root: "123",
        nextIndex: 8,
        proofs: [
          {
            commitment: requestedCommitment,
            commitmentHex: decimalToFieldHex(requestedCommitment),
            found: true,
            outputIndex: "7",
            pathElements: Array.from({ length: 26 }, () => "0"),
            pathIndices: Array.from({ length: 26 }, () => 0),
          },
        ],
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "not_found",
          message: `Unhandled test URL: ${url.toString()}`,
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function createRpc(input: {
  statusResponses?: unknown[];
} = {}): ChainRpc & TransactionRpc {
  const statusResponses = [...(input.statusResponses ?? [])];

  return {
    getLatestBlockhash: vi.fn(() => ({
      send: vi.fn(async () => ({ value: latestBlockhash })),
    })),
    simulateTransaction: vi.fn(() => ({
      send: vi.fn(async () => ({
        value: {
          err: null,
          logs: ["Program log: Instruction: Transact"],
          unitsConsumed: 257_332n,
        },
      })),
    })),
    sendTransaction: vi.fn(() => ({
      send: vi.fn(async () => signature),
    })),
    getSignatureStatuses: vi.fn(() => ({
      send: vi.fn(async () =>
        statusResponses.shift() ?? {
          value: [
            {
              confirmationStatus: "confirmed",
              err: null,
              slot: 55n,
            },
          ],
        },
      ),
    })),
    getBlockHeight: vi.fn(() => ({
      send: vi.fn(async () => 100n),
    })),
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

function createBuildTransactInstruction(): BuildTransactInstruction {
  return vi.fn(async () => ({
    programAddress,
    accounts: [],
    data: new Uint8Array([9, 9, 9]),
  } satisfies Instruction));
}

function createRuntimeTransaction(): RuntimeTransaction {
  return {
    messageBytes: new Uint8Array([
      1,
      2,
      3,
    ]) as unknown as RuntimeTransaction["messageBytes"],
    signatures: {},
    lifetimeConstraint: latestBlockhash,
  };
}

function createClientForTest(input: {
  wallet?: Wallet;
  notes?: NoteStore;
  pool?: PoolReader;
  transfer?: TransferExecutor;
  indexer?: NoteSyncIndexer;
} = {}) {
  return createClient({
    wallet: input.wallet ?? createWallet(),
    notes: input.notes ?? createNoteStore(new TestStorage()),
    pool: input.pool ?? createPool(),
    transfer: input.transfer ?? createTransferExecutor(),
    programAddress,
    indexer: input.indexer,
  });
}

describe("client", () => {
  it("validates construction and exposes unlock state", async () => {
    const wallet = createWallet(new Uint8Array([1, 2, 3]));
    const client = createClientForTest({ wallet });

    expect(client.getWalletAddress()).toBe(ownerAddress);
    expect(client.getUnlockMessage()).toContain(`Program: ${programAddress}`);
    expect(client.isUnlocked()).toBe(false);

    await expect(client.unlock()).resolves.toEqual({
      walletAddress: ownerAddress,
      message: client.getUnlockMessage(),
      signature: new Uint8Array([1, 2, 3]),
    });
    expect(wallet.signMessage).toHaveBeenCalledWith(
      encodeUnlockMessage({ programAddress }),
    );
    expect(client.isUnlocked()).toBe(true);

    expect(() =>
      createClient({
        wallet: { address: "not-an-address", signMessage: vi.fn() },
        notes: createNoteStore(new TestStorage()),
        pool: createPool(),
        transfer: createTransferExecutor(),
        programAddress,
      }),
    ).toThrow("Wallet address must be a valid Gorbagana address");
  });

  it("quotes transfers without signing or preparing transactions", async () => {
    const wallet = createWallet();
    const pool = createPool();
    const transfer = createTransferExecutor();
    const client = createClientForTest({ wallet, pool, transfer });

    await expect(
      client.quoteTransfer({
        recipient: recipientAddress,
        recipientLamports: 1_000_000n,
      }),
    ).resolves.toEqual({
      recipient: recipientAddress,
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 250_000n,
      grossWithdrawalLamports: 1_002_506n,
      withdrawalFeeLamports: 2_506n,
      shieldLamports: 752_506n,
      withdrawalFeeBps: 25,
      withdrawRentFeeLamports: 0n,
    });
    expect(wallet.signMessage).not.toHaveBeenCalled();
    expect(transfer.prepareTransfer).not.toHaveBeenCalled();
  });

  it("quotes transfers from decrypted owned-note balance", async () => {
    const ownedNotes: OwnedNoteStore = {
      listOwnedNotes: vi.fn(async () => [
        {
          commitment,
          encryptedOutput: "aa",
          nullifier,
          amountLamports: 2_000_000n,
          witness: {},
        },
      ]),
    };
    const pool = createOwnedNotePoolReader({
      ownedNotes,
      fees: {
        depositFeeBps: 0,
        withdrawalFeeBps: 25,
        feeErrorMarginBps: 500,
        withdrawRentFeeLamports: 0n,
      },
      programAddress,
      ownerAddress,
    });
    const client = createClientForTest({ pool });

    await expect(
      client.quoteTransfer({
        recipient: recipientAddress,
        recipientLamports: 1_000_000n,
      }),
    ).resolves.toMatchObject({
      recipient: recipientAddress,
      privateBalanceLamports: 2_000_000n,
      shieldLamports: 0n,
    });
    expect(ownedNotes.listOwnedNotes).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
    });
  });

  it("creates the real private balance stack from app inputs", async () => {
    const unlockSignature = new Uint8Array([1, 2, 3, 4]);
    const encryptedOutput = await encryptUtxoPayload({
      noteKey: keccak_256(unlockSignature),
      payload: `2|9|7|${NATIVE_TOKEN_SENTINEL}`,
    });
    const storage = new TestStorage();
    const wallet = createWallet(unlockSignature);
    const fetcher = createIndexerFetch();
    const client = createPrivateClient({
      wallet,
      signer: createSigner(),
      storage,
      rpc: createRpc(),
      programAddress,
      feeRecipient,
      indexerBaseUrl: "https://api.privacytrash.test",
      hasher: createSequencedHasher([
        "1001",
        "1002",
        "1003",
        "1004",
        "1001",
        "1002",
        "1003",
        "1004",
      ]),
      fees: {
        depositFeeBps: 0,
        withdrawalFeeBps: 0,
        feeErrorMarginBps: 500,
        withdrawRentFeeLamports: 0n,
      },
      proofRunner: createProofRunner(),
      buildTransactInstruction: createBuildTransactInstruction(),
      fetch: fetcher,
    });

    client.importNotes({
      merge: false,
      backup: {
        version: 1,
        programAddress,
        ownerAddress,
        exportedAt: "2026-06-18T00:00:00.000Z",
        encryptedOutputs: [encryptedOutput],
        fetchOffset: 1,
        historyIndexes: [0],
      },
    });

    await expect(client.getPrivateBalance()).rejects.toThrow(
      "Unlock wallet before reading private notes",
    );

    await client.unlock();

    await expect(client.getPrivateBalance()).resolves.toEqual({
      lamports: 2n,
    });
    await expect(
      client.quoteTransfer({
        recipient: recipientAddress,
        recipientLamports: 1n,
      }),
    ).resolves.toMatchObject({
      privateBalanceLamports: 2n,
      shieldLamports: 0n,
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "https://api.privacytrash.test/v1/pool/nullifiers/00000000000000000000000000000000000000000000000000000000000003ec",
      ),
      expect.objectContaining({
        method: "GET",
      }),
    );

    client.clearNotes();

    await expect(client.getPrivateBalance()).rejects.toThrow(
      "Unlock wallet before reading private notes",
    );
  });

  it("composes the private transfer stack from app inputs", async () => {
    const unlockSignature = new Uint8Array([1, 2, 3, 4]);
    const encryptedOutput = await encryptUtxoPayload({
      noteKey: keccak_256(unlockSignature),
      payload: `2|9|7|${NATIVE_TOKEN_SENTINEL}`,
    });
    const storage = new TestStorage();
    const fetcher = createIndexerFetch();
    const rpc = createRpc();
    const proofRunner = createProofRunner();
    const buildTransactInstruction = createBuildTransactInstruction();
    const compileTransactionMessage = vi.fn(() => createRuntimeTransaction());
    const signTransactionMessage = vi.fn(async () => createRuntimeTransaction());
    const encodeTransaction = vi.fn(() => encodedTransaction);
    const getTransactionSignature = vi.fn(() => signature as Signature);
    const sleep = vi.fn(async () => {});
    const client = createPrivateClient({
      wallet: createWallet(unlockSignature),
      signer: createSigner(),
      storage,
      rpc,
      programAddress,
      feeRecipient,
      indexerBaseUrl: "https://api.privacytrash.test",
      explorerBaseUrl: "https://explorer.gorbagana.wtf",
      hasher: createSequencedHasher([
        "1001",
        "1002",
        "1003",
        "1004",
        "1001",
        "1002",
        "1003",
        "1004",
        "2001",
        "2002",
        "2003",
        "2004",
        "2005",
        "2006",
        "1001",
        "1002",
        "1003",
        "1004",
        "2007",
        "2008",
        "2009",
        "2010",
        "2011",
        "2012",
      ]),
      fees: {
        depositFeeBps: 0,
        withdrawalFeeBps: 0,
        feeErrorMarginBps: 500,
        withdrawRentFeeLamports: 0n,
      },
      proofRunner,
      buildTransactInstruction,
      fetch: fetcher,
      transaction: {
        compileTransactionMessage,
        signTransactionMessage,
        encodeTransaction,
        getTransactionSignature,
        sleep,
        confirmationPollIntervalMs: 1,
      },
      now: () => new Date(createdAt),
    });

    client.importNotes({
      merge: false,
      backup: {
        version: 1,
        programAddress,
        ownerAddress,
        exportedAt: createdAt,
        encryptedOutputs: [encryptedOutput],
        fetchOffset: 1,
        historyIndexes: [0],
      },
    });
    await client.unlock();

    const prepared = await client.prepareTransfer({
      recipient: recipientAddress,
      recipientLamports: 1n,
    });

    expect(prepared.payload).toMatchObject({
      kind: CHAIN_TRANSFER_PAYLOAD_KIND,
    });
    expect(rpc.getLatestBlockhash).toHaveBeenCalled();
    expect(proofRunner.prove).toHaveBeenCalledWith(
      expect.objectContaining({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
        feeRecipient,
        extData: {
          extAmount: -1n,
          fee: 0n,
        },
      }),
    );
    expect(buildTransactInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        signer: expect.objectContaining({ address: ownerAddress }),
        recipient: recipientAddress,
        feeRecipient,
        programAddress,
      }),
    );

    await expect(client.simulateTransfer(prepared)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 257_332,
    });

    await expect(client.sendTransfer(prepared)).resolves.toEqual({
      signature,
      sentAt: createdAt,
      slot: 55,
      explorerUrl: `https://explorer.gorbagana.wtf/tx/${signature}`,
    });
    expect(compileTransactionMessage).toHaveBeenCalled();
    expect(signTransactionMessage).toHaveBeenCalled();
    expect(rpc.sendTransaction).toHaveBeenCalledWith(encodedTransaction, {
      encoding: "base64",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
  });

  it("requires unlock before preparing and validates prepared output", async () => {
    const transfer = createTransferExecutor();
    const client = createClientForTest({ transfer });

    await expect(
      client.prepareTransfer({
        recipient: recipientAddress,
        recipientLamports: 1n,
      }),
    ).rejects.toThrow("Unlock wallet before preparing private transfer");

    await client.unlock();

    await expect(
      client.prepareTransfer({
        recipient: recipientAddress,
        recipientLamports: 1_000_000n,
      }),
    ).resolves.toMatchObject({
      recipient: recipientAddress,
      quote: {
        recipientLamports: 1_000_000n,
        grossWithdrawalLamports: 1_002_506n,
      },
    });
    expect(transfer.prepareTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
      }),
    );
  });

  it("does not send when simulation fails", async () => {
    const transfer = createTransferExecutor({
      simulateTransfer: vi.fn(async () => ({
        ok: false,
        logs: [],
        errorMessage: "account state changed",
      })),
    });
    const client = createClientForTest({ transfer });
    await client.unlock();
    const prepared = await client.prepareTransfer({
      recipient: recipientAddress,
      recipientLamports: 1n,
    });

    await expect(client.sendTransfer(prepared)).rejects.toThrow(
      "Private transfer simulation failed: account state changed",
    );
    expect(transfer.sendTransfer).not.toHaveBeenCalled();
  });

  it("delegates note import, export, and clear through NoteStore", () => {
    const storage = new TestStorage();
    const client = createClientForTest({
      notes: createNoteStore(storage),
    });
    const backup = {
      version: 1,
      programAddress,
      ownerAddress,
      exportedAt: "2026-06-18T00:00:00.000Z",
      encryptedOutputs: ["AABB"],
      fetchOffset: 1,
      historyIndexes: [2],
    };

    expect(client.importNotes({ backup, merge: false })).toMatchObject({
      encryptedOutputs: ["aabb"],
    });
    expect(
      client.exportNotes({
        exportedAt: new Date("2026-06-19T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ownerAddress,
      programAddress,
      encryptedOutputs: ["aabb"],
    });

    client.clearNotes();
    expect(storage.values.size).toBe(0);
    expect(client.isUnlocked()).toBe(false);
  });

  it("syncs notes through the optional indexer without requiring unlock", async () => {
    const indexer = createIndexer();
    const storage = new TestStorage();
    const client = createClientForTest({
      notes: createNoteStore(storage),
      indexer,
    });

    await expect(client.syncNotes({ batchSize: 25 })).resolves.toMatchObject({
      previousOffset: 0,
      nextOffset: 1,
      fetched: 1,
      backup: {
        programAddress,
        ownerAddress,
        encryptedOutputs: ["010203"],
        fetchOffset: 1,
      },
    });
    expect(indexer.getOutputRange).toHaveBeenCalledWith({
      start: 0,
      end: 25,
    });
    expect(client.isUnlocked()).toBe(false);
  });

  it("requires an indexer before syncing notes", async () => {
    const client = createClientForTest();

    await expect(client.syncNotes()).rejects.toThrow(
      "Indexer is required to sync notes",
    );
  });
});

async function encryptUtxoPayload(input: {
  noteKey: Uint8Array;
  payload: string;
}): Promise<string> {
  const iv = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(input.noteKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      new TextEncoder().encode(input.payload),
    ),
  );
  const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.byteLength - 16);
  const authTag = encryptedWithTag.slice(encryptedWithTag.byteLength - 16);

  return bytesToHex(
    concatBytes([
      UTXO_ENCRYPTION_VERSION_V2,
      iv,
      authTag,
      ciphertext,
    ]),
  );
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytes(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}
