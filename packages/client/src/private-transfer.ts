import type { TransactionSigner } from "@solana/kit";

import {
  createChainExecutor,
  type BuildTransactInstruction,
  type ChainRpc,
  type TransactionExecutor,
} from "@/chain";
import {
  createCircuitProver,
  type ProofRunner,
  type RandomBytes,
} from "@/circuit";
import {
  createNoteSelector,
  type OwnedNoteStore,
} from "@/owned";
import {
  createOutputBlinding,
  createOutputEncryptor,
} from "@/output";
import {
  createProofRunner,
  type CreateProofRunnerInput,
  type Groth16FullProver,
} from "@/proof-runner";
import type { ProofProvider } from "@/proof";
import {
  createNullifierAccounts,
  createPublicInputEncoder,
} from "@/program";
import {
  createProverProofProvider,
  type NoteSelector,
  type ProverIndexer,
} from "@/prover";
import { addressSchema, httpUrlSchema } from "@/schemas";
import type { TransferExecutor } from "@/transfer";
import type { NoteStore } from "@/notes";
import type { PoseidonHasher } from "@/utxo";

export type PrivateTransferProofRunnerConfig =
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

export type PrivateTransferNoteSelectorConfig =
  | {
      noteSelector: NoteSelector;
      ownedNotes?: never;
    }
  | {
      noteSelector?: undefined;
      ownedNotes: OwnedNoteStore;
    };

export type CreatePrivateTransferProofProviderInput =
  PrivateTransferProofRunnerConfig &
    PrivateTransferNoteSelectorConfig & {
    notes: NoteStore;
    indexer: ProverIndexer;
    hasher: PoseidonHasher;
    programAddress: string;
    feeRecipient: string;
    ownerAddress: string;
    crypto?: Pick<Crypto, "subtle"> | undefined;
    randomBytes?: RandomBytes | undefined;
    now?: (() => Date) | undefined;
  };

export type CreatePrivateTransferExecutorInput =
  Omit<CreatePrivateTransferProofProviderInput, "ownerAddress"> & {
    rpc: ChainRpc;
    signer: TransactionSigner;
    transactionExecutor: TransactionExecutor;
    ownerAddress?: string | undefined;
    feePayer?: string | undefined;
    explorerBaseUrl?: string | undefined;
    buildTransactInstruction?: BuildTransactInstruction | undefined;
  };

export function createPrivateTransferExecutor(
  input: CreatePrivateTransferExecutorInput,
): TransferExecutor {
  const programAddress = addressSchema.parse(input.programAddress);
  const ownerAddress = addressSchema.parse(
    input.ownerAddress ?? input.signer.address,
  );
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const feePayer =
    input.feePayer === undefined
      ? undefined
      : addressSchema.parse(input.feePayer);
  const explorerBaseUrl =
    input.explorerBaseUrl === undefined
      ? undefined
      : httpUrlSchema.parse(input.explorerBaseUrl);
  const proofProvider = createPrivateTransferProofProvider(
    createProofProviderInput(input, {
      programAddress,
      ownerAddress,
      feeRecipient,
    }),
  );

  return createChainExecutor({
    rpc: input.rpc,
    signer: input.signer,
    feeRecipient,
    proofProvider,
    transactionExecutor: input.transactionExecutor,
    buildTransactInstruction: input.buildTransactInstruction,
    explorerBaseUrl,
    feePayer,
    now: input.now,
  });
}

function createProofProviderInput(
  input: CreatePrivateTransferExecutorInput,
  normalized: {
    programAddress: string;
    ownerAddress: string;
    feeRecipient: string;
  },
): CreatePrivateTransferProofProviderInput {
  const common = {
    notes: input.notes,
    indexer: input.indexer,
    hasher: input.hasher,
    programAddress: normalized.programAddress,
    ownerAddress: normalized.ownerAddress,
    feeRecipient: normalized.feeRecipient,
    crypto: input.crypto,
    randomBytes: input.randomBytes,
    now: input.now,
  };
  const noteSelector = input.noteSelector;
  const ownedNotes = input.ownedNotes;

  if (input.proofRunner !== undefined) {
    if (noteSelector !== undefined) {
      return {
        ...common,
        noteSelector,
        proofRunner: input.proofRunner,
      };
    }

    if (ownedNotes === undefined) {
      throw new Error("Owned note store is required for private transfers.");
    }

    return {
      ...common,
      ownedNotes,
      proofRunner: input.proofRunner,
    };
  }

  const { wasm, zkey } = input;
  if (wasm === undefined || zkey === undefined) {
    throw new Error("Circuit artifacts are required for private transfers.");
  }

  if (noteSelector !== undefined) {
    return {
      ...common,
      noteSelector,
      wasm,
      zkey,
      singleThread: input.singleThread,
      groth16: input.groth16,
    };
  }

  if (ownedNotes === undefined) {
    throw new Error("Owned note store is required for private transfers.");
  }

  return {
    ...common,
    ownedNotes,
    wasm,
    zkey,
    singleThread: input.singleThread,
    groth16: input.groth16,
  };
}

export function createPrivateTransferProofProvider(
  input: CreatePrivateTransferProofProviderInput,
): ProofProvider {
  const programAddress = addressSchema.parse(input.programAddress);
  const ownerAddress = addressSchema.parse(input.ownerAddress);
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const noteSelector = resolveNoteSelector(input);
  const proofRunner = resolveProofRunner(input);
  const circuitProver = createCircuitProver({
    hasher: input.hasher,
    proofRunner,
    outputBlinding: createOutputBlinding({
      randomBytes: input.randomBytes,
    }),
    outputEncryptor: createOutputEncryptor({
      crypto: input.crypto,
      randomBytes: input.randomBytes,
    }),
    nullifierAccounts: createNullifierAccounts(),
    publicInputEncoder: createPublicInputEncoder(),
    feeRecipient,
    randomBytes: input.randomBytes,
  });

  return createProverProofProvider({
    notes: input.notes,
    indexer: input.indexer,
    noteSelector,
    circuitProver,
    hasher: input.hasher,
    programAddress,
    ownerAddress,
    now: input.now,
  });
}

function resolveProofRunner(input: PrivateTransferProofRunnerConfig): ProofRunner {
  if (input.proofRunner !== undefined) {
    return input.proofRunner;
  }

  return createProofRunner({
    wasm: input.wasm,
    zkey: input.zkey,
    singleThread: input.singleThread,
    groth16: input.groth16,
  });
}

function resolveNoteSelector(input: PrivateTransferNoteSelectorConfig): NoteSelector {
  if (input.noteSelector !== undefined) {
    return input.noteSelector;
  }

  return createNoteSelector({ ownedNotes: input.ownedNotes });
}
