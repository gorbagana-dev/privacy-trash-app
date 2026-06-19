import type { TransactionSigner } from "@solana/kit";

import {
  createDepositChainExecutor,
  type BuildTransactInstruction,
  type ChainRpc,
  type TransactionExecutor,
} from "@/chain";
import {
  createDepositCircuitProver,
  type ProofRunner,
  type RandomBytes,
} from "@/circuit";
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
  createDepositProofProvider,
  type DepositProverIndexer,
} from "@/prover";
import { addressSchema, httpUrlSchema } from "@/schemas";
import type { DepositExecutor } from "@/deposit";
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

export type CreatePrivateDepositExecutorInput = ProofRunnerConfig & {
  rpc: ChainRpc;
  signer: TransactionSigner;
  transactionExecutor: TransactionExecutor;
  indexer: DepositProverIndexer;
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

export function createPrivateDepositExecutor(
  input: CreatePrivateDepositExecutorInput,
): DepositExecutor {
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
  const proofRunner = resolveProofRunner(input);
  const circuitProver = createDepositCircuitProver({
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
  const proofProvider = createDepositProofProvider({
    indexer: input.indexer,
    circuitProver,
    programAddress,
    ownerAddress,
  });

  return createDepositChainExecutor({
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
