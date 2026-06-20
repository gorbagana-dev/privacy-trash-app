import { readFile } from "node:fs/promises";

import { buildTransactInstruction } from "@gorbagana/privacy-trash-sdk";
import {
  appendTransactionMessageInstruction,
  assertIsTransactionWithinSizeLimit,
  compressTransactionMessageUsingAddressLookupTables,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  fetchAddressesForLookupTables,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Base64EncodedWireTransaction,
  type BlockhashLifetimeConstraint,
  type GetMultipleAccountsApi,
  type Rpc,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import bs58 from "bs58";
import { z } from "zod";

import type { RelayerTransferRequest } from "@/modules/relayer/relayer.schema";

const defaultComputeUnitLimit = 1_000_000;

const keypairBytesSchema = z.array(z.number().int().min(0).max(255)).length(64);
const keypairBytesLength = 64;
const privateKeyBytesLength = 32;

export type RelayerSimulation = {
  ok: boolean;
  logs: string[];
  unitsConsumed?: number | undefined;
  errorMessage?: string | undefined;
};

export type RelayerTransferReceipt = {
  signature: string;
  sentAt: string;
  explorerUrl: string;
  slot?: number | undefined;
};

export type RelayerService = {
  simulateTransfer(request: RelayerTransferRequest): Promise<RelayerSimulation>;
  submitTransfer(request: RelayerTransferRequest): Promise<RelayerTransferReceipt>;
};

export type CreateRelayerServiceInput = {
  rpcUrl: string;
  programAddress: Address;
  feeRecipient: Address;
  explorerBaseUrl: string;
  lookupTableAddress?: Address | undefined;
  keypairPath?: string | undefined;
  privateKeyBase58?: string | undefined;
  keypairJson?: string | undefined;
  confirmationTimeoutMs: number;
  confirmationPollIntervalMs: number;
  maxSendRetries: number;
  now?: (() => Date) | undefined;
  sleep?: ((milliseconds: number) => Promise<void>) | undefined;
};

export class RelayerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayerConfigurationError";
  }
}

export class RelayerSimulationError extends Error {
  readonly simulation: RelayerSimulation;

  constructor(simulation: RelayerSimulation) {
    super(simulation.errorMessage ?? "Relayer simulation failed.");
    this.name = "RelayerSimulationError";
    this.simulation = simulation;
  }
}

export function createRelayerService(input: CreateRelayerServiceInput): RelayerService {
  const rpc = createSolanaRpc(
    input.rpcUrl as Parameters<typeof createSolanaRpc>[0],
  );
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? defaultSleep;
  let signerPromise: Promise<TransactionSigner> | null = null;

  async function getSigner(): Promise<TransactionSigner> {
    signerPromise ??= loadRelayerSigner({
      keypairJson: input.keypairJson,
      keypairPath: input.keypairPath,
      privateKeyBase58: input.privateKeyBase58,
    });

    return signerPromise;
  }

  async function buildSignedTransaction(request: RelayerTransferRequest) {
    const signer = await getSigner();
    const { value: latestBlockhash } = await rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send();
    const transactionMessage = await buildTransactionMessage({
      rpc,
      signer,
      request,
      latestBlockhash,
      programAddress: input.programAddress,
      feeRecipient: input.feeRecipient,
      lookupTableAddress: input.lookupTableAddress,
    });
    const signedTransaction = await signTransactionMessageWithSigners(
      transactionMessage,
    );

    assertIsTransactionWithinSizeLimit(signedTransaction);

    return {
      encodedTransaction: getBase64EncodedWireTransaction(signedTransaction),
      latestBlockhash,
      signature: getSignatureFromTransaction(signedTransaction),
    };
  }

  async function simulateSignedTransaction(
    encodedTransaction: Base64EncodedWireTransaction,
  ): Promise<RelayerSimulation> {
    const response = await rpc
      .simulateTransaction(encodedTransaction, {
        commitment: "confirmed",
        encoding: "base64",
        sigVerify: true,
      })
      .send();

    return normalizeSimulation(response.value);
  }

  return {
    async simulateTransfer(request) {
      const transaction = await buildSignedTransaction(request);

      return simulateSignedTransaction(transaction.encodedTransaction);
    },
    async submitTransfer(request) {
      const transaction = await buildSignedTransaction(request);
      const simulation = await simulateSignedTransaction(
        transaction.encodedTransaction,
      );

      if (!simulation.ok) {
        throw new RelayerSimulationError(simulation);
      }

      const submittedSignature = await rpc
        .sendTransaction(transaction.encodedTransaction, {
          encoding: "base64",
          maxRetries: BigInt(input.maxSendRetries),
          preflightCommitment: "confirmed",
          skipPreflight: false,
        })
        .send();
      const slot = await waitForConfirmation({
        rpc,
        signature: submittedSignature,
        lastValidBlockHeight: transaction.latestBlockhash.lastValidBlockHeight,
        timeoutMs: input.confirmationTimeoutMs,
        pollIntervalMs: input.confirmationPollIntervalMs,
        sleep,
      });

      return {
        signature: submittedSignature,
        sentAt: now().toISOString(),
        explorerUrl: `${input.explorerBaseUrl}/tx/${submittedSignature}`,
        ...(slot === undefined ? {} : { slot }),
      };
    },
  };
}

async function buildTransactionMessage(input: {
  rpc: ReturnType<typeof createSolanaRpc>;
  signer: TransactionSigner;
  request: RelayerTransferRequest;
  latestBlockhash: BlockhashLifetimeConstraint;
  programAddress: Address;
  feeRecipient: Address;
  lookupTableAddress?: Address | undefined;
}) {
  const instruction = await buildTransactInstruction({
    signer: input.signer,
    recipient: input.request.recipient,
    feeRecipient: input.feeRecipient,
    nullifiers: input.request.nullifiers,
    proof: input.request.proof,
    extData: input.request.extData,
    encryptedOutput1: input.request.encryptedOutput1,
    encryptedOutput2: input.request.encryptedOutput2,
    programAddress: input.programAddress,
  });
  const transactionMessage = appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageComputeUnitLimit(
      defaultComputeUnitLimit,
      setTransactionMessageLifetimeUsingBlockhash(
        input.latestBlockhash,
        setTransactionMessageFeePayerSigner(
          input.signer,
          createTransactionMessage({ version: 0 }),
        ),
      ),
    ),
  );

  if (input.lookupTableAddress === undefined) {
    return transactionMessage;
  }

  const addressesByLookupTableAddress = await fetchAddressesForLookupTables(
    [input.lookupTableAddress],
    input.rpc as Rpc<GetMultipleAccountsApi>,
  );

  return compressTransactionMessageUsingAddressLookupTables(
    transactionMessage,
    addressesByLookupTableAddress,
  );
}

async function loadRelayerSigner(input: {
  keypairPath?: string | undefined;
  privateKeyBase58?: string | undefined;
  keypairJson?: string | undefined;
}): Promise<TransactionSigner> {
  const source = getRelayerKeySource(input);

  if (source.kind === "base58") {
    const keyBytes = readBase58KeyBytes(source.value);

    if (keyBytes.byteLength === keypairBytesLength) {
      return createKeyPairSignerFromBytes(keyBytes);
    }

    if (keyBytes.byteLength === privateKeyBytesLength) {
      return createKeyPairSignerFromPrivateKeyBytes(keyBytes);
    }

    throw new RelayerConfigurationError(
      "Relayer base58 private key must decode to 32 or 64 bytes.",
    );
  }

  const keypairJson = await readKeypairJson(source);
  const keypairBytes = parseKeypairBytes(keypairJson);

  return createKeyPairSignerFromBytes(keypairBytes);
}

type RelayerKeySource =
  | {
      kind: "path";
      value: string;
    }
  | {
      kind: "base58";
      value: string;
    }
  | {
      kind: "json";
      value: string;
    };

function getRelayerKeySource(input: {
  keypairPath?: string | undefined;
  privateKeyBase58?: string | undefined;
  keypairJson?: string | undefined;
}): RelayerKeySource {
  const sources: RelayerKeySource[] = [];

  if (input.keypairPath !== undefined) {
    sources.push({ kind: "path", value: input.keypairPath });
  }

  if (input.privateKeyBase58 !== undefined) {
    sources.push({ kind: "base58", value: input.privateKeyBase58 });
  }

  if (input.keypairJson !== undefined) {
    sources.push({ kind: "json", value: input.keypairJson });
  }

  if (sources.length === 0) {
    throw new RelayerConfigurationError("Relayer keypair is not configured.");
  }

  if (sources.length > 1) {
    throw new RelayerConfigurationError(
      "Set only one relayer key source.",
    );
  }

  return sources[0]!;
}

async function readKeypairJson(source: Exclude<RelayerKeySource, { kind: "base58" }>): Promise<unknown> {
  if (source.kind === "json") {
    try {
      return JSON.parse(source.value) as unknown;
    } catch {
      throw new RelayerConfigurationError("Relayer keypair JSON is invalid.");
    }
  }

  let rawKeypair: string;

  try {
    rawKeypair = await readFile(source.value, "utf8");
  } catch {
    throw new RelayerConfigurationError("Relayer keypair file cannot be read.");
  }

  try {
    return JSON.parse(rawKeypair) as unknown;
  } catch {
    throw new RelayerConfigurationError("Relayer keypair file is invalid JSON.");
  }
}

function parseKeypairBytes(keypairJson: unknown): Uint8Array {
  try {
    return Uint8Array.from(keypairBytesSchema.parse(keypairJson));
  } catch {
    throw new RelayerConfigurationError("Relayer keypair is invalid.");
  }
}

function readBase58KeyBytes(privateKeyBase58: string): Uint8Array {
  try {
    return bs58.decode(privateKeyBase58);
  } catch {
    throw new RelayerConfigurationError("Relayer base58 private key is invalid.");
  }
}

function normalizeSimulation(value: {
  err: unknown;
  logs: readonly string[] | null;
  unitsConsumed?: bigint | number | undefined;
}): RelayerSimulation {
  const logs = value.logs === null ? [] : [...value.logs];
  const unitsConsumed =
    value.unitsConsumed === undefined
      ? undefined
      : Number(value.unitsConsumed);

  if (value.err !== null && value.err !== undefined) {
    return {
      ok: false,
      logs,
      errorMessage:
        typeof value.err === "string" ? value.err : JSON.stringify(value.err),
      ...(Number.isSafeInteger(unitsConsumed) ? { unitsConsumed } : {}),
    };
  }

  return {
    ok: true,
    logs,
    ...(Number.isSafeInteger(unitsConsumed) ? { unitsConsumed } : {}),
  };
}

async function waitForConfirmation(input: {
  rpc: ReturnType<typeof createSolanaRpc>;
  signature: Signature;
  lastValidBlockHeight: bigint;
  timeoutMs: number;
  pollIntervalMs: number;
  sleep(milliseconds: number): Promise<void>;
}): Promise<number | undefined> {
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() < deadline) {
    const statuses = await input.rpc
      .getSignatureStatuses([input.signature], {
        searchTransactionHistory: true,
      })
      .send();
    const status = statuses.value[0];

    if (status?.err !== null && status?.err !== undefined) {
      throw new Error(
        `Relayed transaction failed: ${JSON.stringify(status.err)}.`,
      );
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return status.slot === undefined ? undefined : Number(status.slot);
    }

    const blockHeight = await input.rpc
      .getBlockHeight({ commitment: "confirmed" })
      .send();
    if (BigInt(blockHeight) > input.lastValidBlockHeight) {
      throw new Error("Relayed transaction expired before confirmation.");
    }

    await input.sleep(input.pollIntervalMs);
  }

  throw new Error("Timed out while confirming relayed transaction.");
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
