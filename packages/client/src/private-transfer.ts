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

type ProofRunnerConfig =
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

type NoteSelectorConfig =
  | {
      noteSelector: NoteSelector;
      ownedNotes?: never;
    }
  | {
      noteSelector?: undefined;
      ownedNotes: OwnedNoteStore;
    };

export type CreatePrivateTransferExecutorInput = ProofRunnerConfig &
  NoteSelectorConfig & {
    rpc: ChainRpc;
    signer: TransactionSigner;
    transactionExecutor: TransactionExecutor;
    notes: NoteStore;
    indexer: ProverIndexer;
    hasher: PoseidonHasher;
    programAddress: string;
    feeRecipient: string;
    ownerAddress?: string | undefined;
    feePayer?: string | undefined;
    explorerBaseUrl?: string | undefined;
    buildTransactInstruction?: BuildTransactInstruction | undefined;
    crypto?: Pick<Crypto, "subtle"> | undefined;
    randomBytes?: RandomBytes | undefined;
    now?: (() => Date) | undefined;
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
  const proofProvider = createProverProofProvider({
    notes: input.notes,
    indexer: input.indexer,
    noteSelector,
    circuitProver,
    hasher: input.hasher,
    programAddress,
    ownerAddress,
    now: input.now,
  });

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

function resolveProofRunner(input: ProofRunnerConfig): ProofRunner {
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

function resolveNoteSelector(input: NoteSelectorConfig): NoteSelector {
  if (input.noteSelector !== undefined) {
    return input.noteSelector;
  }

  return createNoteSelector({ ownedNotes: input.ownedNotes });
}
