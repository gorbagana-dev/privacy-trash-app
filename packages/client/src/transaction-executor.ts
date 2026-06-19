import {
  compileTransaction,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  signTransactionMessageWithSigners,
  type Base64EncodedWireTransaction,
  type Commitment,
  type Signature,
  type Transaction,
  type TransactionMessageWithSigners,
  type TransactionWithLifetime,
} from "@solana/kit";
import { z } from "zod";

import {
  getChainPayload,
  type ChainTransactionMessage,
  type TransactionExecutor,
} from "@/chain";
import {
  transactionSignatureSchema,
  transferSimulationSchema,
  type TransferSimulation,
} from "@/transfer";

const defaultCommitment = "confirmed";
const defaultConfirmationTimeoutMs = 60_000;
const defaultConfirmationPollIntervalMs = 1_000;

const commitmentSchema = z.enum(["processed", "confirmed", "finalized"]);
const positiveMsSchema = z.number().int().positive().max(120_000);
const maxRetriesSchema = z.bigint().nonnegative().max(100n);

const simulationRpcValueSchema = z
  .object({
    err: z.unknown().nullable(),
    logs: z.array(z.string()).nullable(),
    unitsConsumed: z.union([z.number(), z.bigint()]).optional(),
  })
  .passthrough();

const signatureStatusSchema = z
  .object({
    confirmationStatus: commitmentSchema.nullable(),
    err: z.unknown().nullable(),
    slot: z.union([z.number(), z.bigint()]),
  })
  .passthrough();

const signatureStatusesSchema = z.array(signatureStatusSchema.nullable()).min(1);

export type TransactionExecutorCommitment = z.infer<typeof commitmentSchema>;

export type TransactionRpc = {
  simulateTransaction(
    transaction: Base64EncodedWireTransaction,
    config: {
      commitment: Commitment;
      encoding: "base64";
      replaceRecentBlockhash: false;
      sigVerify: false;
    },
  ): RpcSend<unknown>;
  sendTransaction(
    transaction: Base64EncodedWireTransaction,
    config: {
      encoding: "base64";
      preflightCommitment: Commitment;
      skipPreflight: boolean;
      maxRetries?: bigint | undefined;
    },
  ): RpcSend<unknown>;
  getSignatureStatuses(
    signatures: readonly Signature[],
    config?: {
      searchTransactionHistory?: boolean | undefined;
    },
  ): RpcSend<unknown>;
  getBlockHeight(config?: { commitment?: Commitment | undefined }): RpcSend<unknown>;
};

export type RpcSend<T> = {
  send(): Promise<T>;
};

export type RuntimeTransaction = Transaction & TransactionWithLifetime;

export type CompileTransactionMessage = (
  transactionMessage: ChainTransactionMessage,
) => RuntimeTransaction;

export type SignTransactionMessage = (
  transactionMessage: ChainTransactionMessage,
) => Promise<RuntimeTransaction>;

export type EncodeTransaction = (
  transaction: Transaction,
) => Base64EncodedWireTransaction;

export type GetTransactionSignature = (transaction: Transaction) => Signature;

export type Sleep = (milliseconds: number) => Promise<void>;

export type CreateTransactionExecutorInput = {
  rpc: TransactionRpc;
  commitment?: TransactionExecutorCommitment | undefined;
  preflightCommitment?: TransactionExecutorCommitment | undefined;
  skipPreflight?: boolean | undefined;
  maxRetries?: bigint | undefined;
  confirmationTimeoutMs?: number | undefined;
  confirmationPollIntervalMs?: number | undefined;
  searchTransactionHistory?: boolean | undefined;
  compileTransactionMessage?: CompileTransactionMessage | undefined;
  signTransactionMessage?: SignTransactionMessage | undefined;
  encodeTransaction?: EncodeTransaction | undefined;
  getTransactionSignature?: GetTransactionSignature | undefined;
  sleep?: Sleep | undefined;
};

export class TransactionExecutorError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(input: {
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "TransactionExecutorError";
    this.code = input.code;
    this.details = input.details;
  }
}

export function createTransactionExecutor(
  input: CreateTransactionExecutorInput,
): TransactionExecutor {
  const commitment = commitmentSchema.parse(input.commitment ?? defaultCommitment);
  const preflightCommitment = commitmentSchema.parse(
    input.preflightCommitment ?? commitment,
  );
  const skipPreflight = input.skipPreflight ?? false;
  const maxRetries =
    input.maxRetries === undefined
      ? undefined
      : maxRetriesSchema.parse(input.maxRetries);
  const confirmationTimeoutMs = positiveMsSchema.parse(
    input.confirmationTimeoutMs ?? defaultConfirmationTimeoutMs,
  );
  const confirmationPollIntervalMs = positiveMsSchema.parse(
    input.confirmationPollIntervalMs ?? defaultConfirmationPollIntervalMs,
  );
  const compileMessage =
    input.compileTransactionMessage ?? defaultCompileTransactionMessage;
  const signMessage = input.signTransactionMessage ?? defaultSignTransactionMessage;
  const encodeTransaction =
    input.encodeTransaction ?? getBase64EncodedWireTransaction;
  const getSignature = input.getTransactionSignature ?? getSignatureFromTransaction;
  const sleep = input.sleep ?? delay;

  return {
    async simulateTransaction(executionInput) {
      const payload = getChainPayload(executionInput.preparedTransfer);
      const transaction = compileMessage(payload.transactionMessage);
      const encodedTransaction = encodeTransaction(transaction);
      const response = await input.rpc
        .simulateTransaction(encodedTransaction, {
          commitment,
          encoding: "base64",
          replaceRecentBlockhash: false,
          sigVerify: false,
        })
        .send();

      return normalizeSimulation(response);
    },
    async sendTransaction(executionInput) {
      const payload = getChainPayload(executionInput.preparedTransfer);
      const transaction = await signMessage(payload.transactionMessage);
      const encodedTransaction = encodeTransaction(transaction);
      const localSignature = transactionSignatureSchema.parse(
        getSignature(transaction),
      ) as Signature;
      const sentSignature = transactionSignatureSchema.parse(
        await input.rpc
          .sendTransaction(encodedTransaction, {
            encoding: "base64",
            preflightCommitment,
            skipPreflight,
            ...(maxRetries === undefined ? {} : { maxRetries }),
          })
          .send(),
      ) as Signature;

      if (sentSignature !== localSignature) {
        throw new TransactionExecutorError({
          code: "signature_mismatch",
          message: "RPC returned a different transaction signature than the signed transaction.",
          details: {
            localSignature,
            sentSignature,
          },
        });
      }

      const confirmation = await confirmSignature({
        rpc: input.rpc,
        signature: sentSignature,
        commitment,
        lastValidBlockHeight:
          payload.transactionMessage.lifetimeConstraint.lastValidBlockHeight,
        timeoutMs: confirmationTimeoutMs,
        pollIntervalMs: confirmationPollIntervalMs,
        searchTransactionHistory: input.searchTransactionHistory,
        sleep,
      });

      return {
        signature: sentSignature,
        ...(confirmation.slot === undefined ? {} : { slot: confirmation.slot }),
      };
    },
  };
}

function defaultCompileTransactionMessage(
  transactionMessage: ChainTransactionMessage,
): RuntimeTransaction {
  return compileTransaction(transactionMessage);
}

async function defaultSignTransactionMessage(
  transactionMessage: ChainTransactionMessage,
): Promise<RuntimeTransaction> {
  return await signTransactionMessageWithSigners(
    transactionMessage as ChainTransactionMessage & TransactionMessageWithSigners,
  );
}

function normalizeSimulation(input: unknown): TransferSimulation {
  const value = simulationRpcValueSchema.parse(getRpcValue(input));
  const logs = value.logs ?? [];

  if (value.err !== null) {
    return transferSimulationSchema.parse({
      ok: false,
      logs,
      errorMessage: stringifyRpcError(value.err),
    });
  }

  return transferSimulationSchema.parse({
    ok: true,
    logs,
    ...normalizeUnitsConsumed(value.unitsConsumed),
  });
}

async function confirmSignature(input: {
  rpc: Pick<TransactionRpc, "getSignatureStatuses" | "getBlockHeight">;
  signature: Signature;
  commitment: TransactionExecutorCommitment;
  lastValidBlockHeight: bigint;
  timeoutMs: number;
  pollIntervalMs: number;
  searchTransactionHistory: boolean | undefined;
  sleep: Sleep;
}): Promise<{ slot?: number | undefined }> {
  const startedAt = Date.now();

  while (true) {
    const status = await getSignatureStatus(input);

    if (status !== null) {
      if (status.err !== null) {
        throw new TransactionExecutorError({
          code: "transaction_failed",
          message: "Transaction failed on-chain.",
          details: status.err,
        });
      }

      if (commitmentReached(status.confirmationStatus, input.commitment)) {
        return { slot: toOptionalSafeNumber(status.slot, "confirmation slot") };
      }
    }

    const blockHeight = await getBlockHeight(input.rpc, input.commitment);

    if (blockHeight > input.lastValidBlockHeight) {
      throw new TransactionExecutorError({
        code: "blockhash_expired",
        message: "Transaction blockhash expired before confirmation.",
        details: {
          blockHeight: blockHeight.toString(),
          lastValidBlockHeight: input.lastValidBlockHeight.toString(),
        },
      });
    }

    if (Date.now() - startedAt >= input.timeoutMs) {
      throw new TransactionExecutorError({
        code: "confirmation_timeout",
        message: "Timed out waiting for transaction confirmation.",
        details: {
          timeoutMs: input.timeoutMs,
        },
      });
    }

    await input.sleep(input.pollIntervalMs);
  }
}

async function getSignatureStatus(input: {
  rpc: Pick<TransactionRpc, "getSignatureStatuses">;
  signature: Signature;
  searchTransactionHistory: boolean | undefined;
}) {
  const response = await input.rpc
    .getSignatureStatuses([input.signature], {
      ...(input.searchTransactionHistory === undefined
        ? {}
        : { searchTransactionHistory: input.searchTransactionHistory }),
    })
    .send();
  const statuses = signatureStatusesSchema.parse(getRpcValue(response));

  return statuses[0] ?? null;
}

async function getBlockHeight(
  rpc: Pick<TransactionRpc, "getBlockHeight">,
  commitment: TransactionExecutorCommitment,
): Promise<bigint> {
  const value = await rpc.getBlockHeight({ commitment }).send();

  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }

  throw new TransactionExecutorError({
    code: "invalid_block_height",
    message: "RPC returned an invalid block height.",
    details: value,
  });
}

function getRpcValue(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const candidate = input as { value?: unknown };

  return candidate.value ?? input;
}

function normalizeUnitsConsumed(
  unitsConsumed: number | bigint | undefined,
): { unitsConsumed?: number } {
  if (unitsConsumed === undefined) return {};

  return { unitsConsumed: toOptionalSafeNumber(unitsConsumed, "units consumed") };
}

function toOptionalSafeNumber(
  value: number | bigint,
  label: string,
): number {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return value;
  } else if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  throw new TransactionExecutorError({
    code: "unsafe_number",
    message: `RPC returned an unsafe ${label}.`,
    details: value,
  });
}

function stringifyRpcError(error: unknown): string {
  if (typeof error === "string") return error;

  try {
    return (
      JSON.stringify(error, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ) ?? String(error)
    );
  } catch {
    return String(error);
  }
}

function commitmentReached(
  actual: TransactionExecutorCommitment | null,
  expected: TransactionExecutorCommitment,
): boolean {
  if (actual === null) return false;

  return commitmentRank(actual) >= commitmentRank(expected);
}

function commitmentRank(commitment: TransactionExecutorCommitment): number {
  switch (commitment) {
    case "processed":
      return 0;
    case "confirmed":
      return 1;
    case "finalized":
      return 2;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
