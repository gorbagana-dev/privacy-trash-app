import { BorshCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";

import type { ChainInstruction, ChainTransaction } from "@/modules/chain/chain.repository";
import { zkcashEventIdl } from "@/modules/pool/pool.idl";

const nativeTransactDiscriminator = Uint8Array.from([217, 149, 130, 143, 221, 52, 252, 119]);
const nativeOutputCount = 2;
const programDataPrefix = "Program data: ";
const eventCoder = new BorshCoder(zkcashEventIdl);

export type ParsedPoolOutput = {
  programId: string;
  outputIndex: bigint;
  commitment: string;
  encryptedOutput: string;
  txSignature: string;
  instructionIndex: number;
  logIndex: number;
  slot: bigint;
  blockTime: Date | null;
};

export type ParsedObservedRoot = {
  programId: string;
  root: string;
  source: "proof";
  txSignature: string;
  instructionIndex: number;
  slot: bigint;
  observedAt: Date;
};

export type ParsedSpentNullifier = {
  programId: string;
  nullifier: string;
  nullifierIndex: number;
  txSignature: string;
  instructionIndex: number;
  slot: bigint;
  spentAt: Date;
};

export type ParsedPoolTransaction = {
  outputs: ParsedPoolOutput[];
  observedRoots: ParsedObservedRoot[];
  spentNullifiers: ParsedSpentNullifier[];
};

export type ParsePoolTransactionInput = {
  programId: string;
  signature: string;
  transaction: ChainTransaction;
  fallbackBlockTime?: Date | null | undefined;
};

type ParsedTransactInstruction = {
  instructionIndex: number;
  root: string;
  inputNullifiers: string[];
};

type CommitmentEvent = {
  outputIndex: bigint;
  commitment: string;
  encryptedOutput: string;
  logIndex: number;
};

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBytes(length: number): Uint8Array {
    const end = this.offset + length;
    if (end > this.bytes.length) {
      throw new Error("Instruction data ended unexpectedly.");
    }

    const value = this.bytes.slice(this.offset, end);
    this.offset = end;
    return value;
  }

  skip(length: number): void {
    this.readBytes(length);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function bytesFromEventValue(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const byte of value) {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new Error(`${label} contains an invalid byte.`);
      }
    }

    return Uint8Array.from(value);
  }

  throw new Error(`${label} must be bytes.`);
}

function fixedBytesFromEventValue(value: unknown, length: number, label: string): Uint8Array {
  const bytes = bytesFromEventValue(value, label);
  if (bytes.length !== length) {
    throw new Error(`${label} must be ${length} bytes.`);
  }

  return bytes;
}

function u64FromEventValue(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    const decimal = (value as { toString(radix?: number): string }).toString(10);
    if (/^\d+$/.test(decimal)) {
      return BigInt(decimal);
    }
  }

  throw new Error(`${label} must be an unsigned 64-bit integer.`);
}

function getTransactionBlockTime(input: ParsePoolTransactionInput): Date | null {
  if (input.transaction.blockTime != null) {
    return new Date(input.transaction.blockTime * 1000);
  }

  return input.fallbackBlockTime ?? null;
}

function getAllAccountKeys(transaction: ChainTransaction): string[] {
  const loaded = transaction.meta?.loadedAddresses;

  return [
    ...transaction.transaction.message.accountKeys,
    ...(loaded?.writable ?? []),
    ...(loaded?.readonly ?? []),
  ];
}

function decodeInstructionData(data: string): Uint8Array | null {
  try {
    return bs58.decode(data);
  } catch {
    return null;
  }
}

function isNativeTransactInstruction(
  instruction: ChainInstruction,
  accountKeys: readonly string[],
  programId: string,
): boolean {
  if (accountKeys[instruction.programIdIndex] !== programId) return false;

  const data = decodeInstructionData(instruction.data);
  if (!data) return false;

  return bytesEqual(data.slice(0, nativeTransactDiscriminator.length), nativeTransactDiscriminator);
}

function parseNativeTransactInstruction(
  instruction: ChainInstruction,
  instructionIndex: number,
): ParsedTransactInstruction {
  const data = decodeInstructionData(instruction.data);
  if (!data) {
    throw new Error("Native transact instruction data is not valid base58.");
  }

  const reader = new ByteReader(data);
  const discriminator = reader.readBytes(8);
  if (!bytesEqual(discriminator, nativeTransactDiscriminator)) {
    throw new Error("Instruction is not a native transact instruction.");
  }

  reader.skip(64); // proof_a
  reader.skip(128); // proof_b
  reader.skip(64); // proof_c
  const root = toHex(reader.readBytes(32));
  reader.skip(32); // public_amount
  reader.skip(32); // ext_data_hash
  const inputNullifiers = [toHex(reader.readBytes(32)), toHex(reader.readBytes(32))];

  return {
    instructionIndex,
    root,
    inputNullifiers,
  };
}

function decodeCommitmentEvent(log: string, logIndex: number): CommitmentEvent | null {
  if (!log.startsWith(programDataPrefix)) return null;

  const event = eventCoder.events.decode(log.slice(programDataPrefix.length));
  if (!event || event.name !== "CommitmentData") return null;

  const eventData = event.data as Record<string, unknown>;
  const outputIndex = u64FromEventValue(eventData["index"], "CommitmentData.index");
  const commitment = toHex(
    fixedBytesFromEventValue(eventData["commitment"], 32, "CommitmentData.commitment"),
  );
  const encryptedOutput = toBase64(
    bytesFromEventValue(eventData["encrypted_output"], "CommitmentData.encrypted_output"),
  );

  return {
    outputIndex,
    commitment,
    encryptedOutput,
    logIndex,
  };
}

function getInvokedProgram(log: string): string | null {
  const match = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[\d+\]$/.exec(log);
  return match?.[1] ?? null;
}

function isProgramExitLog(log: string): boolean {
  return /^Program [1-9A-HJ-NP-Za-km-z]+ (success|failed: .+)$/.test(log);
}

function parseCommitmentEvents(
  logs: readonly string[] | null | undefined,
  programId: string,
): CommitmentEvent[] {
  if (!logs) return [];

  const programStack: string[] = [];
  const events: CommitmentEvent[] = [];

  for (const [logIndex, log] of logs.entries()) {
    const invokedProgram = getInvokedProgram(log);
    if (invokedProgram) {
      programStack.push(invokedProgram);
      continue;
    }

    if (programStack.at(-1) === programId) {
      const event = decodeCommitmentEvent(log, logIndex);
      if (event) events.push(event);
    }

    if (isProgramExitLog(log)) {
      programStack.pop();
    }
  }

  return events;
}

export function parsePoolTransaction(input: ParsePoolTransactionInput): ParsedPoolTransaction {
  const accountKeys = getAllAccountKeys(input.transaction);
  const slot = BigInt(input.transaction.slot);
  const blockTime = getTransactionBlockTime(input);
  const observedAt = blockTime ?? new Date(0);
  const nativeInstructions = input.transaction.transaction.message.instructions.flatMap(
    (instruction, instructionIndex) => {
      if (!isNativeTransactInstruction(instruction, accountKeys, input.programId)) return [];

      return [parseNativeTransactInstruction(instruction, instructionIndex)];
    },
  );
  const commitmentEvents = parseCommitmentEvents(input.transaction.meta?.logMessages, input.programId);

  const outputs = commitmentEvents.flatMap((event, eventIndex) => {
    const ownerInstruction =
      nativeInstructions[Math.floor(eventIndex / nativeOutputCount)] ?? nativeInstructions[0];
    if (!ownerInstruction) return [];

    return [
      {
        programId: input.programId,
        outputIndex: event.outputIndex,
        commitment: event.commitment,
        encryptedOutput: event.encryptedOutput,
        txSignature: input.signature,
        instructionIndex: ownerInstruction.instructionIndex,
        logIndex: event.logIndex,
        slot,
        blockTime,
      },
    ];
  });

  const observedRoots = nativeInstructions.map((instruction) => ({
    programId: input.programId,
    root: instruction.root,
    source: "proof" as const,
    txSignature: input.signature,
    instructionIndex: instruction.instructionIndex,
    slot,
    observedAt,
  }));

  const spentNullifiers = nativeInstructions.flatMap((instruction) =>
    instruction.inputNullifiers.map((nullifier, nullifierIndex) => ({
      programId: input.programId,
      nullifier,
      nullifierIndex,
      txSignature: input.signature,
      instructionIndex: instruction.instructionIndex,
      slot,
      spentAt: observedAt,
    })),
  );

  return {
    outputs,
    observedRoots,
    spentNullifiers,
  };
}
