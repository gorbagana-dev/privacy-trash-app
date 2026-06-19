import type { Address, TransactionSigner } from "@solana/kit";

import type { NoteSyncIndexer, NoteSyncResult } from "@/sync";
import type {
  BuildTransactInstruction,
  ChainRpc,
} from "@/chain";
import {
  createSignatureNoteKeyDeriver,
} from "@/encryption";
import {
  createIndexer,
  type IndexerFetch,
} from "@/indexer";
import {
  createNoteStore,
  type KeyValueStorage,
  type NoteBackup,
  type NoteStore,
} from "@/notes";
import {
  createOwnedNoteSource,
  createOwnedNoteStore,
  type OwnedNoteStore,
} from "@/owned";
import {
  createOwnedNotePoolReader,
  getPoolFeeConfig,
  getPrivateBalance,
  type PoolFeeConfig,
  type PoolFeeConfigReader,
  type PoolReader,
  type PrivateBalance,
} from "@/pool";
import {
  createPrivateTransferExecutor,
} from "@/private-transfer";
import type {
  CreateProofRunnerInput,
  Groth16FullProver,
} from "@/proof-runner";
import type { ProofRunner, RandomBytes } from "@/circuit";
import { addressSchema } from "@/schemas";
import { syncNotes as syncNotesWithIndexer } from "@/sync";
import {
  prepareTransfer as prepareWithExecutor,
  quoteTransfer,
  sendTransfer as sendWithExecutor,
  simulateTransfer as simulateWithExecutor,
  transferRequestSchema,
  validatePreparedTransfer,
  type PreparedTransfer,
  type TransferExecutor,
  type TransferQuote,
  type TransferReceipt,
  type TransferSimulation,
} from "@/transfer";
import {
  createTransactionExecutor,
  type CreateTransactionExecutorInput,
  type TransactionRpc,
} from "@/transaction-executor";
import {
  createUnlockMessage,
  encodeUnlockMessage,
  normalizeWalletAddress,
  signWalletMessage,
  validateWallet,
  type Wallet,
} from "@/wallet";
import {
  createUtxoDecryptor,
  type PoseidonHasher,
} from "@/utxo";

export type CreateClientInput = {
  wallet: Wallet;
  notes: NoteStore;
  pool: PoolReader;
  transfer: TransferExecutor;
  programAddress: string;
  indexer?: NoteSyncIndexer | undefined;
};

export type CreatePrivateClientInput = {
  wallet: Wallet;
  signer: TransactionSigner;
  storage: KeyValueStorage;
  rpc: ChainRpc & TransactionRpc;
  programAddress: string;
  feeRecipient: string;
  indexerBaseUrl: string;
  hasher: PoseidonHasher;
  fees: PoolFeeConfig | PoolFeeConfigReader;
  fetch?: IndexerFetch | undefined;
  indexerTimeoutMs?: number | undefined;
  explorerBaseUrl?: string | undefined;
  feePayer?: string | undefined;
  buildTransactInstruction?: BuildTransactInstruction | undefined;
  transaction?: PrivateClientTransactionOptions | undefined;
  crypto?: Pick<Crypto, "subtle"> | undefined;
  randomBytes?: RandomBytes | undefined;
  now?: (() => Date) | undefined;
} & PrivateClientProofConfig;

export type PrivateClientProofConfig =
  | {
      proofRunner: ProofRunner;
      wasm?: never;
      zkey?: never;
      singleThread?: never;
      groth16?: never;
    }
  | {
      proofRunner?: undefined;
      wasm: CreateProofRunnerInput["wasm"];
      zkey: CreateProofRunnerInput["zkey"];
      singleThread?: boolean | undefined;
      groth16?: Groth16FullProver | undefined;
    };

export type PrivateClientTransactionOptions = Omit<
  CreateTransactionExecutorInput,
  "rpc"
>;

export type UnlockResult = {
  walletAddress: Address;
  message: string;
  signature: Uint8Array;
};

export type Client = {
  getWalletAddress(): Address;
  getUnlockMessage(): string;
  unlock(): Promise<UnlockResult>;
  isUnlocked(): boolean;
  getPrivateBalance(): Promise<PrivateBalance>;
  quoteTransfer(input: QuoteTransferInput): Promise<QuotedTransfer>;
  prepareTransfer(input: QuoteTransferInput): Promise<PreparedTransfer>;
  simulateTransfer(preparedTransfer: PreparedTransfer): Promise<TransferSimulation>;
  sendTransfer(preparedTransfer: PreparedTransfer): Promise<TransferReceipt>;
  syncNotes(input?: ClientSyncNotesInput | undefined): Promise<NoteSyncResult>;
  exportNotes(input?: { exportedAt?: Date | undefined }): NoteBackup;
  importNotes(input: { backup: unknown; merge?: boolean | undefined }): NoteBackup;
  clearNotes(): void;
};

export type QuoteTransferInput = {
  recipient: string;
  recipientLamports: bigint;
};

export type QuotedTransfer = TransferQuote & {
  recipient: Address;
};

export type ClientSyncNotesInput = {
  batchSize?: number | undefined;
};

export function createClient(input: CreateClientInput): Client {
  const wallet = validateWallet(input.wallet);
  const walletAddress = normalizeWalletAddress(wallet);
  const programAddress = addressSchema.parse(input.programAddress);
  const { indexer, notes, pool, transfer } = input;
  let unlockSignature: Uint8Array | null = null;

  async function createQuote(
    quoteInput: QuoteTransferInput,
  ): Promise<QuotedTransfer> {
    const request = transferRequestSchema.parse(quoteInput);
    const [feeConfig, privateBalance] = await Promise.all([
      getPoolFeeConfig(pool),
      getPrivateBalance(pool),
    ]);
    const quote = quoteTransfer({
      recipientLamports: request.recipientLamports,
      privateBalanceLamports: privateBalance.lamports,
      withdrawalFeeBps: feeConfig.withdrawalFeeBps,
      withdrawRentFeeLamports: feeConfig.withdrawRentFeeLamports,
    });

    return {
      recipient: request.recipient,
      ...quote,
    };
  }

  return {
    getWalletAddress() {
      return walletAddress;
    },
    getUnlockMessage() {
      return createUnlockMessage({ programAddress });
    },
    async unlock() {
      const message = createUnlockMessage({ programAddress });
      const signature = await signWalletMessage(
        wallet,
        encodeUnlockMessage({ programAddress }),
      );

      unlockSignature = signature;

      return {
        walletAddress,
        message,
        signature,
      };
    },
    isUnlocked() {
      return unlockSignature !== null;
    },
    getPrivateBalance() {
      return getPrivateBalance(pool);
    },
    quoteTransfer(quoteInput) {
      return createQuote(quoteInput);
    },
    async prepareTransfer(prepareInput) {
      if (unlockSignature === null) {
        throw new Error("Unlock wallet before preparing private transfer.");
      }

      const quotedTransfer = await createQuote(prepareInput);
      const { recipient, ...quote } = quotedTransfer;
      const preparedTransfer = await prepareWithExecutor(transfer, {
        programAddress,
        ownerAddress: walletAddress,
        recipient,
        quote,
        unlockSignature,
      });

      validatePreparedTransfer(preparedTransfer, {
        programAddress,
        ownerAddress: walletAddress,
        recipient,
        quote,
      });

      return preparedTransfer;
    },
    simulateTransfer(preparedTransfer) {
      return simulateWithExecutor(transfer, preparedTransfer);
    },
    async sendTransfer(preparedTransfer) {
      const simulation = await simulateWithExecutor(transfer, preparedTransfer);

      if (!simulation.ok) {
        throw new Error(
          `Private transfer simulation failed: ${simulation.errorMessage}`,
        );
      }

      return sendWithExecutor(transfer, preparedTransfer);
    },
    async syncNotes(syncInput) {
      if (indexer === undefined) {
        throw new Error("Indexer is required to sync notes.");
      }

      return syncNotesWithIndexer({
        notes,
        indexer,
        programAddress,
        ownerAddress: walletAddress,
        batchSize: syncInput?.batchSize,
      });
    },
    exportNotes(exportInput) {
      return notes.exportNotes({
        programAddress,
        ownerAddress: walletAddress,
        exportedAt: exportInput?.exportedAt,
      });
    },
    importNotes(importInput) {
      return notes.importNotes({
        programAddress,
        ownerAddress: walletAddress,
        backup: importInput.backup,
        merge: importInput.merge,
      });
    },
    clearNotes() {
      notes.clearNotes({
        programAddress,
        ownerAddress: walletAddress,
      });
      unlockSignature = null;
    },
  };
}

export function createPrivateClient(input: CreatePrivateClientInput): Client {
  const wallet = validateWallet(input.wallet);
  const walletAddress = normalizeWalletAddress(wallet);
  const programAddress = addressSchema.parse(input.programAddress);
  const notes = createNoteStore(input.storage);
  const indexer = createIndexer({
    baseUrl: input.indexerBaseUrl,
    fetch: input.fetch,
    timeoutMs: input.indexerTimeoutMs,
  });
  const keyDeriver = createSignatureNoteKeyDeriver();
  const decryptor = createUtxoDecryptor({
    hasher: input.hasher,
    crypto: input.crypto,
  });
  let capturedUnlockSignature: Uint8Array | null = null;
  const source = createUnlockedOwnedNoteSource({
    notes,
    keyDeriver,
    decryptor,
    programAddress,
    ownerAddress: walletAddress,
    now: input.now,
    getUnlockSignature() {
      return capturedUnlockSignature;
    },
  });
  const ownedNotes = createOwnedNoteStore({
    source,
    indexer,
  });
  const pool = createOwnedNotePoolReader({
    ownedNotes,
    fees: input.fees,
    programAddress,
    ownerAddress: walletAddress,
  });
  const transactionExecutor = createTransactionExecutor({
    rpc: input.rpc,
    ...(input.transaction ?? {}),
  });
  const transferInput = {
    rpc: input.rpc,
    signer: input.signer,
    transactionExecutor,
    notes,
    indexer,
    ownedNotes,
    hasher: input.hasher,
    programAddress,
    ownerAddress: walletAddress,
    feeRecipient: input.feeRecipient,
    feePayer: input.feePayer,
    explorerBaseUrl: input.explorerBaseUrl,
    buildTransactInstruction: input.buildTransactInstruction,
    crypto: input.crypto,
    randomBytes: input.randomBytes,
    now: input.now,
  };
  const transfer =
    input.proofRunner === undefined
      ? createPrivateTransferExecutor({
          ...transferInput,
          wasm: input.wasm,
          zkey: input.zkey,
          singleThread: input.singleThread,
          groth16: input.groth16,
        })
      : createPrivateTransferExecutor({
          ...transferInput,
          proofRunner: input.proofRunner,
        });
  const client = createClient({
    wallet: {
      address: walletAddress,
      async signMessage(message) {
        const signature = await signWalletMessage(wallet, message);
        capturedUnlockSignature = signature;

        return signature;
      },
    },
    notes,
    pool,
    transfer,
    programAddress,
    indexer,
  });

  return {
    ...client,
    clearNotes() {
      capturedUnlockSignature = null;
      client.clearNotes();
    },
  };
}

function createUnlockedOwnedNoteSource(input: {
  notes: NoteStore;
  keyDeriver: ReturnType<typeof createSignatureNoteKeyDeriver>;
  decryptor: ReturnType<typeof createUtxoDecryptor>;
  programAddress: string;
  ownerAddress: string;
  now?: (() => Date) | undefined;
  getUnlockSignature(): Uint8Array | null;
}): OwnedNoteStore {
  return {
    async listOwnedNotes(scope) {
      const unlockSignature = input.getUnlockSignature();

      if (unlockSignature === null) {
        throw new Error("Unlock wallet before reading private notes.");
      }

      return createOwnedNoteSource({
        notes: input.notes,
        keyDeriver: input.keyDeriver,
        decryptor: input.decryptor,
        programAddress: input.programAddress,
        ownerAddress: input.ownerAddress,
        unlockSignature,
        now: input.now,
      }).listOwnedNotes(scope);
    },
  };
}
