import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  isTransactionSigner,
  setTransactionMessageFeePayer,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type BlockhashLifetimeConstraint,
  type Instruction,
  type TransactionMessage,
  type TransactionMessageWithBlockhashLifetime,
  type TransactionMessageWithFeePayer,
  type TransactionSigner,
} from "@solana/kit";
import { buildTransactInstruction as buildSdkTransactInstruction } from "@gorbagana/privacy-trash-sdk";
import { z } from "zod";

import {
  createProofMaterial,
  proofMaterialSchema,
  type ProofMaterial,
  type ProofProvider,
} from "@/proof";
import {
  DEPOSIT_EXECUTION_VERSION,
  depositReceiptSchema,
  depositSimulationSchema,
  preparedDepositSchema,
  prepareDepositInputSchema,
  type DepositExecutor,
  type DepositProofProvider,
  type PreparedDeposit,
} from "@/deposit";
import { addressSchema, httpUrlSchema, isoTimestampSchema } from "@/schemas";
import {
  TRANSFER_EXECUTION_VERSION,
  preparedTransferSchema,
  prepareTransferInputSchema,
  transferReceiptSchema,
  transferSimulationSchema,
  type PreparedTransfer,
  type PrepareTransferInput,
  type TransferExecutor,
  type TransferReceipt,
  type TransferSimulation,
} from "@/transfer";

export const CHAIN_TRANSFER_PAYLOAD_KIND = "privacy-trash.chain-transfer";
export const CHAIN_DEPOSIT_PAYLOAD_KIND = "privacy-trash.chain-deposit";
export const DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT = 1_000_000;

export type ChainTransactionMessage = TransactionMessage &
  TransactionMessageWithFeePayer &
  TransactionMessageWithBlockhashLifetime &
  Extract<TransactionMessage, { version: 0 }>;

export type ChainPayload = {
  kind: typeof CHAIN_TRANSFER_PAYLOAD_KIND;
  transactionMessage: ChainTransactionMessage;
};

export type ChainDepositPayload = {
  kind: typeof CHAIN_DEPOSIT_PAYLOAD_KIND;
  transactionMessage: ChainTransactionMessage;
};

const blockhashLifetimeSchema = z
  .strictObject({
    blockhash: z.string().trim().min(1),
    lastValidBlockHeight: z.bigint(),
  })
  .transform((value) => value as BlockhashLifetimeConstraint);
const computeUnitLimitSchema = z.number().int().positive().max(1_400_000);

const chainTransactionMessageSchema = z
  .looseObject({
    version: z.literal(0),
    feePayer: z.unknown(),
    lifetimeConstraint: blockhashLifetimeSchema,
    instructions: z.array(z.unknown()).min(1),
  })
  .transform((value) => value as ChainTransactionMessage);

const chainPayloadSchema = z.strictObject({
  kind: z.literal(CHAIN_TRANSFER_PAYLOAD_KIND),
  transactionMessage: chainTransactionMessageSchema,
});

const chainDepositPayloadSchema = z.strictObject({
  kind: z.literal(CHAIN_DEPOSIT_PAYLOAD_KIND),
  transactionMessage: chainTransactionMessageSchema,
});

export type ChainRpc = {
  getLatestBlockhash(): {
    send(): Promise<{ value: BlockhashLifetimeConstraint }>;
  };
};

export type PreparedChainOperation = {
  payload: unknown;
};

export type TransactionExecutionInput = {
  preparedOperation: PreparedChainOperation;
  transactionMessage: ChainTransactionMessage;
};

export type TransactionExecutor = {
  simulateTransaction(input: TransactionExecutionInput): Promise<unknown>;
  sendTransaction(input: TransactionExecutionInput): Promise<unknown>;
};

export type BuildTransactInstructionInput = {
  signer: TransactionSigner;
  recipient: Address;
  feeRecipient: Address;
  material: ProofMaterial;
  programAddress: Address;
};

export type BuildTransactInstruction = (
  input: BuildTransactInstructionInput,
) => Promise<Instruction>;

export type CreateChainExecutorInput = {
  rpc: ChainRpc;
  signer: TransactionSigner;
  feeRecipient: string;
  proofProvider: ProofProvider;
  transactionExecutor: TransactionExecutor;
  buildTransactInstruction?: BuildTransactInstruction | undefined;
  computeUnitLimit?: number | undefined;
  explorerBaseUrl?: string | undefined;
  feePayer?: string | undefined;
  now?: (() => Date) | undefined;
};

export type CreateDepositChainExecutorInput = {
  rpc: ChainRpc;
  signer: TransactionSigner;
  feeRecipient: string;
  proofProvider: DepositProofProvider;
  transactionExecutor: TransactionExecutor;
  buildTransactInstruction?: BuildTransactInstruction | undefined;
  computeUnitLimit?: number | undefined;
  explorerBaseUrl?: string | undefined;
  feePayer?: string | undefined;
  now?: (() => Date) | undefined;
};

export function createChainExecutor(
  input: CreateChainExecutorInput,
): TransferExecutor {
  if (!isTransactionSigner(input.signer)) {
    throw new Error("Chain signer must sign transactions.");
  }

  const signer = input.signer;
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const feePayer = addressSchema.parse(input.feePayer ?? signer.address);
  const explorerBaseUrl =
    input.explorerBaseUrl === undefined
      ? undefined
      : httpUrlSchema.parse(input.explorerBaseUrl);
  const buildTransactInstruction =
    input.buildTransactInstruction ?? buildDefaultTransactInstruction;
  const computeUnitLimit = computeUnitLimitSchema.parse(
    input.computeUnitLimit ?? DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
  );
  const now = input.now ?? (() => new Date());

  return {
    async prepareTransfer(prepareInput) {
      const request = prepareTransferInputSchema.parse(prepareInput);

      if (signer.address !== request.ownerAddress) {
        throw new Error("Chain signer address must match transfer owner.");
      }

      const [latestBlockhash, material] = await Promise.all([
        fetchLatestBlockhash(input.rpc),
        createProofMaterial(input.proofProvider, request),
      ]);
      const instruction = await buildTransactInstruction({
        signer,
        recipient: request.recipient,
        feeRecipient,
        material,
        programAddress: request.programAddress,
      });
      const transactionMessage = appendTransactionMessageInstruction(
        instruction,
        createBaseTransactionMessage({
          feePayer,
          latestBlockhash,
          computeUnitLimit,
        }),
      );
      const payload = chainPayloadSchema.parse({
        kind: CHAIN_TRANSFER_PAYLOAD_KIND,
        transactionMessage,
      });

      return preparedTransferSchema.parse({
        version: TRANSFER_EXECUTION_VERSION,
        programAddress: request.programAddress,
        ownerAddress: request.ownerAddress,
        recipient: request.recipient,
        quote: request.quote,
        createdAt: now().toISOString(),
        payload,
      });
    },
    async simulateTransfer(preparedTransfer) {
      const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);
      const payload = getChainPayload(parsedTransfer);
      const rawSimulation =
        await input.transactionExecutor.simulateTransaction({
          preparedOperation: parsedTransfer,
          transactionMessage: payload.transactionMessage,
        });

      return normalizeSimulation(rawSimulation);
    },
    async sendTransfer(preparedTransfer) {
      const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);
      const payload = getChainPayload(parsedTransfer);
      const rawReceipt = await input.transactionExecutor.sendTransaction({
        preparedOperation: parsedTransfer,
        transactionMessage: payload.transactionMessage,
      });

      return normalizeReceipt({
        explorerBaseUrl,
        rawReceipt,
        sentAt: now().toISOString(),
      });
    },
  };
}

export function createDepositChainExecutor(
  input: CreateDepositChainExecutorInput,
): DepositExecutor {
  if (!isTransactionSigner(input.signer)) {
    throw new Error("Chain signer must sign transactions.");
  }

  const signer = input.signer;
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const feePayer = addressSchema.parse(input.feePayer ?? signer.address);
  const explorerBaseUrl =
    input.explorerBaseUrl === undefined
      ? undefined
      : httpUrlSchema.parse(input.explorerBaseUrl);
  const buildTransactInstruction =
    input.buildTransactInstruction ?? buildDefaultTransactInstruction;
  const computeUnitLimit = computeUnitLimitSchema.parse(
    input.computeUnitLimit ?? DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
  );
  const now = input.now ?? (() => new Date());

  return {
    async prepareDeposit(prepareInput) {
      const request = prepareDepositInputSchema.parse(prepareInput);

      if (signer.address !== request.ownerAddress) {
        throw new Error("Chain signer address must match deposit owner.");
      }

      const [latestBlockhash, material] = await Promise.all([
        fetchLatestBlockhash(input.rpc),
        proofMaterialSchema.parse(
          await input.proofProvider.createDepositProofMaterial(request),
        ),
      ]);
      const instruction = await buildTransactInstruction({
        signer,
        recipient: request.ownerAddress,
        feeRecipient,
        material,
        programAddress: request.programAddress,
      });
      const transactionMessage = appendTransactionMessageInstruction(
        instruction,
        createBaseTransactionMessage({
          feePayer,
          latestBlockhash,
          computeUnitLimit,
        }),
      );
      const payload = chainDepositPayloadSchema.parse({
        kind: CHAIN_DEPOSIT_PAYLOAD_KIND,
        transactionMessage,
      });

      return preparedDepositSchema.parse({
        version: DEPOSIT_EXECUTION_VERSION,
        programAddress: request.programAddress,
        ownerAddress: request.ownerAddress,
        recipient: request.ownerAddress,
        quote: request.quote,
        createdAt: now().toISOString(),
        payload,
      });
    },
    async simulateDeposit(preparedDeposit) {
      const parsedDeposit = preparedDepositSchema.parse(preparedDeposit);
      const payload = getDepositChainPayload(parsedDeposit);
      const rawSimulation =
        await input.transactionExecutor.simulateTransaction({
          preparedOperation: parsedDeposit,
          transactionMessage: payload.transactionMessage,
        });

      return depositSimulationSchema.parse(normalizeSimulation(rawSimulation));
    },
    async sendDeposit(preparedDeposit) {
      const parsedDeposit = preparedDepositSchema.parse(preparedDeposit);
      const payload = getDepositChainPayload(parsedDeposit);
      const rawReceipt = await input.transactionExecutor.sendTransaction({
        preparedOperation: parsedDeposit,
        transactionMessage: payload.transactionMessage,
      });

      return depositReceiptSchema.parse(
        normalizeReceipt({
          explorerBaseUrl,
          rawReceipt,
          sentAt: now().toISOString(),
        }),
      );
    },
  };
}

export function getChainPayload(preparedTransfer: PreparedTransfer): ChainPayload {
  const payloadResult = chainPayloadSchema.safeParse(
    preparedTransfer.payload,
  );

  if (!payloadResult.success) {
    throw new Error("Prepared transfer was not created by the chain executor.");
  }

  return payloadResult.data;
}

export function getDepositChainPayload(
  preparedDeposit: PreparedDeposit,
): ChainDepositPayload {
  const payloadResult = chainDepositPayloadSchema.safeParse(
    preparedDeposit.payload,
  );

  if (!payloadResult.success) {
    throw new Error("Prepared deposit was not created by the chain executor.");
  }

  return payloadResult.data;
}

async function buildDefaultTransactInstruction(
  input: BuildTransactInstructionInput,
): Promise<Instruction> {
  return await buildSdkTransactInstruction({
    signer: input.signer,
    recipient: input.recipient,
    feeRecipient: input.feeRecipient,
    nullifiers: input.material.nullifiers,
    proof: input.material.proof,
    extData: input.material.extData,
    encryptedOutput1: input.material.encryptedOutput1,
    encryptedOutput2: input.material.encryptedOutput2,
    programAddress: input.programAddress,
  });
}

async function fetchLatestBlockhash(
  rpc: ChainRpc,
): Promise<BlockhashLifetimeConstraint> {
  const response = await rpc.getLatestBlockhash().send();

  if (!isBlockhashLifetimeConstraint(response.value)) {
    throw new Error("RPC returned an invalid latest blockhash.");
  }

  return response.value;
}

function createBaseTransactionMessage(input: {
  feePayer: Address;
  latestBlockhash: BlockhashLifetimeConstraint;
  computeUnitLimit: number;
}): ChainTransactionMessage {
  return setTransactionMessageComputeUnitLimit(
    input.computeUnitLimit,
    setTransactionMessageLifetimeUsingBlockhash(
      input.latestBlockhash,
      setTransactionMessageFeePayer(
        input.feePayer,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  ) as ChainTransactionMessage;
}

function normalizeSimulation(input: unknown): TransferSimulation {
  const parsed = transferSimulationSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  const rpcValue = getRpcValue(input);

  if (rpcValue !== null) {
    const logs = getLogs(rpcValue);
    const unitsConsumed = getUnitsConsumed(rpcValue);
    const error = getRpcSimulationError(rpcValue);

    if (error !== null) {
      return transferSimulationSchema.parse({
        ok: false,
        logs,
        errorMessage: error,
      });
    }

    return transferSimulationSchema.parse({
      ok: true,
      logs,
      ...(unitsConsumed === undefined ? {} : { unitsConsumed }),
    });
  }

  throw new Error("Transaction executor returned an invalid transfer simulation.");
}

function normalizeReceipt(input: {
  explorerBaseUrl: string | undefined;
  rawReceipt: unknown;
  sentAt: string;
}): TransferReceipt {
  const parsed = transferReceiptSchema.safeParse(input.rawReceipt);

  if (parsed.success) {
    return parsed.data;
  }

  if (typeof input.rawReceipt === "string") {
    return transferReceiptSchema.parse({
      signature: input.rawReceipt,
      sentAt: input.sentAt,
      ...getExplorerUrlFields(input.explorerBaseUrl, input.rawReceipt),
    });
  }

  if (typeof input.rawReceipt === "object" && input.rawReceipt !== null) {
    const value = input.rawReceipt as {
      signature?: unknown;
      slot?: unknown;
      sentAt?: unknown;
      explorerUrl?: unknown;
    };

    if (typeof value.signature === "string") {
      return transferReceiptSchema.parse({
        signature: value.signature,
        sentAt:
          typeof value.sentAt === "string" &&
          isoTimestampSchema.safeParse(value.sentAt).success
            ? value.sentAt
            : input.sentAt,
        ...(typeof value.explorerUrl === "string"
          ? { explorerUrl: value.explorerUrl }
          : getExplorerUrlFields(input.explorerBaseUrl, value.signature)),
        ...(typeof value.slot === "number" ? { slot: value.slot } : {}),
      });
    }
  }

  throw new Error("Transaction executor returned an invalid transfer receipt.");
}

function getExplorerUrlFields(
  explorerBaseUrl: string | undefined,
  signature: string,
): { explorerUrl?: string } {
  return explorerBaseUrl === undefined
    ? {}
    : { explorerUrl: `${explorerBaseUrl}/tx/${signature}` };
}

function getRpcValue(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as { value?: unknown };
  const value = candidate.value ?? input;

  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getRpcSimulationError(value: Record<string, unknown>): string | null {
  const error = value["err"];

  if (error === null || error === undefined) {
    return null;
  }

  return typeof error === "string" ? error : JSON.stringify(error);
}

function getLogs(value: Record<string, unknown>): string[] {
  const logs = value["logs"];

  return Array.isArray(logs) &&
    logs.every((entry) => typeof entry === "string")
    ? logs
    : [];
}

function getUnitsConsumed(
  value: Record<string, unknown>,
): number | undefined {
  const unitsConsumed = value["unitsConsumed"];

  return typeof unitsConsumed === "number"
    ? unitsConsumed
    : undefined;
}

function isBlockhashLifetimeConstraint(
  value: unknown,
): value is BlockhashLifetimeConstraint {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    blockhash?: unknown;
    lastValidBlockHeight?: unknown;
  };

  return (
    typeof candidate.blockhash === "string" &&
    candidate.blockhash.length > 0 &&
    typeof candidate.lastValidBlockHeight === "bigint"
  );
}
