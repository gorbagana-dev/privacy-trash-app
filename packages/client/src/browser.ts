import { z } from "zod";

export {
  createIndexer,
  IndexerError,
  type CreateIndexerInput,
  type Indexer,
  type IndexerFetch,
  type IndexerStatus,
  type MerkleState,
  type NullifierStatus,
  type OutputRange,
} from "@/indexer";
export {
  depositQuoteSchema,
  depositRequestSchema,
  quoteDeposit,
  type DepositQuote,
  type DepositQuoteInput,
  type DepositRequest,
} from "@/deposit";
export {
  createUnlockMessage,
  encodeUnlockMessage,
  UNLOCK_MESSAGE_PURPOSE,
  UNLOCK_MESSAGE_VERSION,
} from "@/wallet";
export {
  createSignatureNoteKeyDeriver,
  deriveNoteKey,
  noteKeySchema,
  NOTE_KEY_ALGORITHM,
  NOTE_KEY_BYTES,
  NOTE_KEY_VERSION,
  type NoteKey,
  type NoteKeyDerivationInput,
  type NoteKeyDeriver,
} from "@/encryption";
export {
  createNoteStore,
  type KeyValueStorage,
  type NoteBackup,
  type NoteScope,
  type NoteStore,
} from "@/notes";
import {
  createIndexer,
  IndexerError,
  type Indexer,
  type IndexerFetch,
} from "@/indexer";
import {
  createNoteStore,
  type KeyValueStorage,
  type NoteStore,
} from "@/notes";
import {
  createOwnedNoteSource,
  createOwnedNoteStore,
  getOwnedNoteBalance,
} from "@/owned";
import { safeIntegerSchema } from "@/schemas";
import { syncNotes, type NoteSyncResult } from "@/sync";
import { createSignatureNoteKeyDeriver } from "@/encryption";
import {
  createUtxoDecryptor,
  type PoseidonHasher,
} from "@/utxo";
export {
  createOwnedNoteSource,
  createOwnedNoteStore,
  getOwnedNoteBalance,
  type CreateOwnedNoteSourceInput,
  type CreateOwnedNoteStoreInput,
  type DecryptedOwnedNote,
  type DecryptOwnedNoteInput,
  type OwnedNote,
  type OwnedNoteBalance,
  type OwnedNoteDecryptor,
  type OwnedNoteIndexer,
  type OwnedNoteStore,
} from "@/owned";
export {
  syncNotes,
  type NoteSyncIndexer,
  type NoteSyncResult,
  type SyncNotesInput,
} from "@/sync";
export {
  createUtxoDecryptor,
  NATIVE_TOKEN_SENTINEL,
  UTXO_ENCRYPTION_VERSION_V2,
  type CreateUtxoDecryptorInput,
  type PoseidonHasher,
  type UtxoWitness,
} from "@/utxo";

const DEFAULT_SYNC_BATCH_SIZE = 1_000;

const base64Schema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0,
    "Expected padded base64-encoded bytes.",
  );

const noteIdentitySchema = z.strictObject({
  programAddress: z.string().trim().min(1),
  signatureBase64: base64Schema,
  walletAddress: z.string().trim().min(1),
});

const privateNoteScanSchema = z.strictObject({
  balanceLamports: z.bigint().nonnegative(),
  fetchedOutputCount: safeIntegerSchema,
  hasMore: z.boolean(),
  nextOutputOffset: safeIntegerSchema,
  ownedNoteCount: safeIntegerSchema,
  privateBalanceLamports: z.bigint().nonnegative(),
  totalOutputCount: safeIntegerSchema,
  unspentNoteCount: safeIntegerSchema,
});
const noteScanSyncModeSchema = z.enum(["incremental", "full"]);

export type BrowserNoteIdentity = z.infer<typeof noteIdentitySchema>;
export type NoteScanSyncMode = z.infer<typeof noteScanSyncModeSchema>;
export type PrivateNoteScan = z.infer<typeof privateNoteScanSchema>;
export type PrivateNoteStorageFactory = () => KeyValueStorage;
export type PoseidonHasherFactory = () => Promise<PoseidonHasher>;

export type HasherWasmInput = {
  sisd: RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
  simd: RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
};

export type ScanPrivateNotesInput = {
  fetch?: IndexerFetch | undefined;
  getHasher?: PoseidonHasherFactory | undefined;
  hasherWasm?: HasherWasmInput | undefined;
  identity: BrowserNoteIdentity;
  indexer?: Pick<Indexer, "getOutputRange" | "getNullifierStatus"> | undefined;
  indexerUrl?: string | undefined;
  programAddress?: string | undefined;
  storage?: KeyValueStorage | undefined;
  storageFactory?: PrivateNoteStorageFactory | undefined;
  syncBatchSize?: number | undefined;
  syncMode?: NoteScanSyncMode | undefined;
};

export class PrivateNoteScanError extends Error {
  readonly code:
    | "hasher_unavailable"
    | "indexer_unavailable"
    | "scan_failed"
    | "wallet_changed";

  constructor(
    code: PrivateNoteScanError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PrivateNoteScanError";
    this.code = code;
  }
}

export async function scanPrivateNotes(
  input: ScanPrivateNotesInput,
): Promise<PrivateNoteScan> {
  const identity = noteIdentitySchema.parse(input.identity);
  const programAddress = input.programAddress ?? identity.programAddress;
  const syncMode = noteScanSyncModeSchema
    .default("incremental")
    .parse(input.syncMode);

  if (identity.programAddress !== programAddress) {
    throw new PrivateNoteScanError(
      "wallet_changed",
      "Wallet changed. Reconnect the original wallet and try again.",
    );
  }

  const notes =
    input.storage === undefined
      ? createNoteStore((input.storageFactory ?? createBrowserNoteStorage)())
      : createNoteStore(input.storage);
  const syncNotesStore =
    syncMode === "full" ? createNoteStore(createMemoryStorage()) : notes;
  const indexer = getNoteIndexer(input);
  const unlockSignature = bytesFromBase64(identity.signatureBase64);
  const noteScope = {
    programAddress,
    ownerAddress: identity.walletAddress,
  };

  try {
    const [hasher, syncResult] = await Promise.all([
      loadPoseidonHasher({
        getHasher: input.getHasher,
        hasherWasm: input.hasherWasm,
      }),
      syncAllNotes({
        notes: syncNotesStore,
        indexer,
        ...noteScope,
        batchSize: input.syncBatchSize ?? DEFAULT_SYNC_BATCH_SIZE,
      }),
    ]);
    if (syncMode === "full") {
      notes.importNotes({
        ...noteScope,
        backup: syncResult.backup,
        merge: false,
      });
    }

    const source = createOwnedNoteSource({
      notes: syncNotesStore,
      keyDeriver: createSignatureNoteKeyDeriver(),
      decryptor: createUtxoDecryptor({ hasher }),
      ...noteScope,
      unlockSignature,
    });
    const ownedNotes = await source.listOwnedNotes(noteScope);
    const unspentNotes = await createOwnedNoteStore({
      source: {
        listOwnedNotes: async () => ownedNotes,
      },
      indexer,
    }).listOwnedNotes(noteScope);
    const ownedNoteList = z.array(z.unknown()).parse(ownedNotes);
    const unspentNoteList = z.array(z.unknown()).parse(unspentNotes);
    const balance = getOwnedNoteBalance(unspentNoteList);

    return privateNoteScanSchema.parse({
      balanceLamports: balance.lamports,
      fetchedOutputCount: syncResult.fetched,
      hasMore: syncResult.hasMore,
      nextOutputOffset: syncResult.nextOffset,
      ownedNoteCount: ownedNoteList.length,
      privateBalanceLamports: balance.lamports,
      totalOutputCount: syncResult.total,
      unspentNoteCount: unspentNoteList.length,
    });
  } catch (error) {
    if (error instanceof PrivateNoteScanError) {
      throw error;
    }

    if (error instanceof IndexerError) {
      throw new PrivateNoteScanError(
        "indexer_unavailable",
        "Private notes are unavailable. Try again in a moment.",
        { cause: error },
      );
    }

    if (
      error instanceof Error &&
      /hasher|wasm|web crypto|crypto/i.test(error.message)
    ) {
      throw new PrivateNoteScanError(
        "hasher_unavailable",
        "Private note decryption is unavailable in this browser.",
        { cause: error },
      );
    }

    throw new PrivateNoteScanError(
      "scan_failed",
      "Unable to read private notes.",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function getNoteIndexer(
  input: ScanPrivateNotesInput,
): Pick<Indexer, "getOutputRange" | "getNullifierStatus"> {
  if (input.indexer) return input.indexer;

  if (!input.indexerUrl) {
    throw new PrivateNoteScanError(
      "indexer_unavailable",
      "Private notes are unavailable. Try again in a moment.",
    );
  }

  return createIndexer({
    baseUrl: input.indexerUrl,
    fetch: input.fetch,
  });
}

async function syncAllNotes(
  input: Parameters<typeof syncNotes>[0],
): Promise<NoteSyncResult> {
  let result = await syncNotes(input);
  let fetchedOutputCount = result.fetched;

  while (result.hasMore) {
    result = await syncNotes(input);
    fetchedOutputCount += result.fetched;
  }

  return {
    ...result,
    fetched: fetchedOutputCount,
  };
}

async function loadPoseidonHasher(input: {
  getHasher?: PoseidonHasherFactory | undefined;
  hasherWasm?: HasherWasmInput | undefined;
}): Promise<PoseidonHasher> {
  if (input.getHasher) {
    return input.getHasher();
  }

  try {
    const { WasmFactory } = (await import("@lightprotocol/hasher.rs")) as {
      WasmFactory: {
        getInstance(): Promise<PoseidonHasher>;
        loadHasher(options?: {
          wasm?: HasherWasmInput | undefined;
        }): Promise<PoseidonHasher>;
      };
    };

    if (input.hasherWasm) {
      return await WasmFactory.loadHasher({ wasm: input.hasherWasm });
    }

    return await WasmFactory.getInstance();
  } catch (error) {
    throw new PrivateNoteScanError(
      "hasher_unavailable",
      "Private note decryption is unavailable in this browser.",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function createBrowserNoteStorage(): KeyValueStorage {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  try {
    const storage = window.sessionStorage;
    const probeKey = "privacy-trash:notes:probe";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);

    return storage;
  } catch {
    return createMemoryStorage();
  }
}

function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
