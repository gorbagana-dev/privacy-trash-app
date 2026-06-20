import type {
  Address,
  GetMultipleAccountsApi,
  Rpc,
  TransactionSigner,
} from "@solana/kit";

import type { NoteSyncIndexer, NoteSyncResult } from "@/sync";
import type {
  BuildTransactInstruction,
  ChainRpc,
} from "@/chain";
import {
  createSignatureNoteKeyDeriver,
} from "@/encryption";
import {
  prepareDeposit as prepareDepositWithExecutor,
  quoteDeposit,
  sendDeposit as sendDepositWithExecutor,
  simulateDeposit as simulateDepositWithExecutor,
  validatePreparedDeposit,
  depositRequestSchema,
  type DepositExecutor,
  type DepositQuote,
  type DepositReceipt,
  type DepositSimulation,
  type PreparedDeposit,
} from "@/deposit";
import {
  createIndexer,
  type IndexerFetch,
} from "@/indexer";
import {
  createAddressLookupTableCompressor,
} from "@/lookup-tables";
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
import {
  createRelayer,
} from "@/relayer";
import {
  createRelayerTransferExecutor,
} from "@/relayer-transfer";
import {
  createPrivateDepositExecutor,
} from "@/private-deposit";
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
  deposit?: DepositExecutor | undefined;
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
  relayerBaseUrl?: string | undefined;
  relayerTimeoutMs?: number | undefined;
  explorerBaseUrl?: string | undefined;
  feePayer?: string | undefined;
  computeUnitLimit?: number | undefined;
  lookupTableAddresses?: readonly string[] | undefined;
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
  quoteDeposit(input: QuoteDepositInput): Promise<QuotedDeposit>;
  prepareDeposit(input: QuoteDepositInput): Promise<PreparedDeposit>;
  simulateDeposit(preparedDeposit: PreparedDeposit): Promise<DepositSimulation>;
  sendDeposit(preparedDeposit: PreparedDeposit): Promise<DepositReceipt>;
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

export type QuoteDepositInput = {
  lamports: bigint;
};

export type QuotedDeposit = DepositQuote;

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
  const { deposit, indexer, notes, pool, transfer } = input;
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

  async function createDepositQuote(
    quoteInput: QuoteDepositInput,
  ): Promise<QuotedDeposit> {
    const request = depositRequestSchema.parse(quoteInput);
    const feeConfig = await getPoolFeeConfig(pool);

    return quoteDeposit({
      lamports: request.lamports,
      depositFeeBps: feeConfig.depositFeeBps,
    });
  }

  function getDepositExecutor(): DepositExecutor {
    if (deposit === undefined) {
      throw new Error("Deposit executor is required for private deposits.");
    }

    return deposit;
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
    quoteDeposit(quoteInput) {
      return createDepositQuote(quoteInput);
    },
    async prepareDeposit(prepareInput) {
      if (unlockSignature === null) {
        throw new Error("Unlock wallet before preparing private deposit.");
      }

      const quote = await createDepositQuote(prepareInput);
      const preparedDeposit = await prepareDepositWithExecutor(
        getDepositExecutor(),
        {
          programAddress,
          ownerAddress: walletAddress,
          quote,
          unlockSignature,
        },
      );

      validatePreparedDeposit(preparedDeposit, {
        programAddress,
        ownerAddress: walletAddress,
        quote,
      });

      return preparedDeposit;
    },
    simulateDeposit(preparedDeposit) {
      return simulateDepositWithExecutor(getDepositExecutor(), preparedDeposit);
    },
    async sendDeposit(preparedDeposit) {
      const simulation = await simulateDepositWithExecutor(
        getDepositExecutor(),
        preparedDeposit,
      );

      if (!simulation.ok) {
        throw new Error(
          `Private deposit simulation failed: ${simulation.errorMessage}`,
        );
      }

      return sendDepositWithExecutor(getDepositExecutor(), preparedDeposit);
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
    ...createPrivateClientTransactionOptions(input),
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
    computeUnitLimit: input.computeUnitLimit,
    explorerBaseUrl: input.explorerBaseUrl,
    buildTransactInstruction: input.buildTransactInstruction,
    crypto: input.crypto,
    randomBytes: input.randomBytes,
    now: input.now,
  };
  const transfer = createPrivateClientTransferExecutor(input, transferInput);
  const depositInput = {
    rpc: input.rpc,
    signer: input.signer,
    transactionExecutor,
    indexer,
    hasher: input.hasher,
    programAddress,
    ownerAddress: walletAddress,
    feeRecipient: input.feeRecipient,
    feePayer: input.feePayer,
    computeUnitLimit: input.computeUnitLimit,
    explorerBaseUrl: input.explorerBaseUrl,
    buildTransactInstruction: input.buildTransactInstruction,
    crypto: input.crypto,
    randomBytes: input.randomBytes,
    now: input.now,
  };
  const deposit =
    input.proofRunner === undefined
      ? createPrivateDepositExecutor({
          ...depositInput,
          wasm: input.wasm,
          zkey: input.zkey,
          singleThread: input.singleThread,
          groth16: input.groth16,
        })
      : createPrivateDepositExecutor({
          ...depositInput,
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
    deposit,
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

function createPrivateClientTransferExecutor(
  input: CreatePrivateClientInput,
  transferInput: PrivateClientTransferInput,
): TransferExecutor {
  const proofInput = {
    notes: transferInput.notes,
    indexer: transferInput.indexer,
    ownedNotes: transferInput.ownedNotes,
    hasher: transferInput.hasher,
    programAddress: transferInput.programAddress,
    ownerAddress: transferInput.ownerAddress,
    feeRecipient: transferInput.feeRecipient,
    crypto: transferInput.crypto,
    randomBytes: transferInput.randomBytes,
    now: transferInput.now,
  };

  if (input.relayerBaseUrl !== undefined) {
    const relayer = createRelayer({
      baseUrl: input.relayerBaseUrl,
      fetch: input.fetch,
      timeoutMs: input.relayerTimeoutMs ?? input.indexerTimeoutMs,
    });

    if (input.proofRunner === undefined) {
      return createRelayerTransferExecutor({
        ...proofInput,
        relayer,
        wasm: input.wasm,
        zkey: input.zkey,
        singleThread: input.singleThread,
        groth16: input.groth16,
      });
    }

    return createRelayerTransferExecutor({
      ...proofInput,
      relayer,
      proofRunner: input.proofRunner,
    });
  }

  const chainInput = {
    ...proofInput,
    rpc: transferInput.rpc,
    signer: transferInput.signer,
    transactionExecutor: transferInput.transactionExecutor,
    feePayer: transferInput.feePayer,
    computeUnitLimit: transferInput.computeUnitLimit,
    explorerBaseUrl: transferInput.explorerBaseUrl,
    buildTransactInstruction: transferInput.buildTransactInstruction,
  };

  if (input.proofRunner === undefined) {
    return createPrivateTransferExecutor({
      ...chainInput,
      wasm: input.wasm,
      zkey: input.zkey,
      singleThread: input.singleThread,
      groth16: input.groth16,
    });
  }

  return createPrivateTransferExecutor({
    ...chainInput,
    proofRunner: input.proofRunner,
  });
}

type PrivateClientTransferInput = {
  rpc: ChainRpc;
  signer: TransactionSigner;
  transactionExecutor: ReturnType<typeof createTransactionExecutor>;
  notes: NoteStore;
  indexer: ReturnType<typeof createIndexer>;
  ownedNotes: OwnedNoteStore;
  hasher: PoseidonHasher;
  programAddress: string;
  ownerAddress: string;
  feeRecipient: string;
  feePayer?: string | undefined;
  computeUnitLimit?: number | undefined;
  explorerBaseUrl?: string | undefined;
  buildTransactInstruction?: BuildTransactInstruction | undefined;
  crypto?: Pick<Crypto, "subtle"> | undefined;
  randomBytes?: RandomBytes | undefined;
  now?: (() => Date) | undefined;
};

function createPrivateClientTransactionOptions(
  input: CreatePrivateClientInput,
): PrivateClientTransactionOptions {
  const transactionOptions = input.transaction ?? {};

  if (
    transactionOptions.compressTransactionMessage !== undefined ||
    input.lookupTableAddresses === undefined ||
    input.lookupTableAddresses.length === 0
  ) {
    return transactionOptions;
  }

  return {
    ...transactionOptions,
    compressTransactionMessage: createAddressLookupTableCompressor({
      rpc: input.rpc as unknown as Rpc<GetMultipleAccountsApi>,
      lookupTableAddresses: input.lookupTableAddresses,
    }),
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
