import {
  groth16 as defaultGroth16,
  type CircuitSignals,
  type ZKArtifact,
} from "snarkjs";
import { z } from "zod";

import type {
  ProofRunner,
  ProofRunnerInput,
  ProofRunnerOutput,
} from "@/circuit";
import {
  bytesToHex,
  fieldDecimalToBytes,
  fieldElementDecimalSchema,
} from "@/field";
import { NATIVE_TOKEN_SENTINEL } from "@/utxo";

const publicSignalCount = 7;

const decimalScalarSchema = z
  .union([z.string(), z.number().int(), z.bigint()])
  .transform((value) => value.toString())
  .pipe(fieldElementDecimalSchema);

const groth16ProofSchema = z.object({
  pi_a: z.array(decimalScalarSchema).min(2),
  pi_b: z.array(z.array(decimalScalarSchema).min(2)).min(2),
  pi_c: z.array(decimalScalarSchema).min(2),
});

const fullProveResultSchema = z.object({
  proof: groth16ProofSchema,
  publicSignals: z.array(decimalScalarSchema).length(publicSignalCount),
});

export type Groth16FullProver = {
  fullProve(
    input: CircuitSignals,
    wasm: ZKArtifact,
    zkey: ZKArtifact,
    logger?: unknown,
    wtnsCalcOptions?: { singleThread?: boolean } | undefined,
    proverOptions?: { singleThread?: boolean } | undefined,
  ): Promise<unknown>;
};

export type CreateProofRunnerInput = {
  wasm: ZKArtifact;
  zkey: ZKArtifact;
  singleThread?: boolean | undefined;
  groth16?: Groth16FullProver | undefined;
};

export function createProofRunner(input: CreateProofRunnerInput): ProofRunner {
  const groth16 = input.groth16 ?? defaultGroth16;
  const useSingleThread = input.singleThread ?? shouldUseSingleThread();
  const singleThreadOptions = useSingleThread
    ? { singleThread: true }
    : undefined;

  return {
    async prove(proofInput) {
      const circuitInput = createSnarkInput(proofInput);
      const result = fullProveResultSchema.parse(
        await groth16.fullProve(
          circuitInput,
          input.wasm,
          input.zkey,
          undefined,
          singleThreadOptions,
          singleThreadOptions,
        ),
      );

      validatePublicSignals(result.publicSignals, proofInput);

      return formatProof(result.proof);
    },
  };
}

export function createSnarkInput(input: ProofRunnerInput): CircuitSignals {
  return {
    root: bytesToFieldDecimal(input.publicInputs.root),
    publicAmount: bytesToFieldDecimal(input.publicInputs.publicAmount),
    extDataHash: bytesToFieldDecimal(input.publicInputs.extDataHash),
    mintAddress: NATIVE_TOKEN_SENTINEL,
    inputNullifier: input.inputNotes.map((note) => note.nullifier),
    inAmount: input.inputNotes.map((note) => note.amountLamports.toString()),
    inPrivateKey: input.inputNotes.map((note) => note.privateKey),
    inBlinding: input.inputNotes.map((note) => note.blinding),
    inPathIndices: input.inputNotes.map((note) => note.pathIndex),
    inPathElements: input.inputNotes.map((note) => [...note.pathElements]),
    outputCommitment: input.outputs.map((output) => output.commitment),
    outAmount: input.outputs.map((output) => output.amountLamports.toString()),
    outPubkey: input.outputs.map((output) => output.publicKey),
    outBlinding: input.outputs.map((output) => output.blinding),
  };
}

export function formatProof(input: unknown): ProofRunnerOutput {
  const proof = groth16ProofSchema.parse(input);
  const proofAX = fieldDecimalToBytes(proof.pi_a[0] as string);
  const proofAY = fieldDecimalToBytes(proof.pi_a[1] as string);
  const proofBX = flattenG2ProofCoordinates([
    toLittleEndianFieldBytes(proof.pi_b[0]?.[0]),
    toLittleEndianFieldBytes(proof.pi_b[0]?.[1]),
  ]);
  const proofBY = flattenG2ProofCoordinates([
    toLittleEndianFieldBytes(proof.pi_b[1]?.[0]),
    toLittleEndianFieldBytes(proof.pi_b[1]?.[1]),
  ]);
  const proofCX = fieldDecimalToBytes(proof.pi_c[0] as string);
  const proofCY = fieldDecimalToBytes(proof.pi_c[1] as string);

  return {
    proofA: concatBytes([proofAX, proofAY]),
    proofB: concatBytes([proofBX, proofBY]),
    proofC: concatBytes([proofCX, proofCY]),
  };
}

function validatePublicSignals(
  publicSignals: readonly string[],
  input: ProofRunnerInput,
): void {
  const expected = getExpectedPublicSignalBytes(input);

  for (const [index, publicSignal] of publicSignals.entries()) {
    const actualBytes = fieldDecimalToBytes(publicSignal);
    const expectedBytes = expected[index];

    if (expectedBytes === undefined) {
      throw new Error("Proof runner returned too many public signals.");
    }

    if (!bytesEqual(actualBytes, expectedBytes)) {
      throw new Error(
        `Proof public signal ${index} does not match the prepared transaction input.`,
      );
    }
  }
}

function getExpectedPublicSignalBytes(
  input: ProofRunnerInput,
): readonly Uint8Array[] {
  return [
    input.publicInputs.root,
    input.publicInputs.publicAmount,
    input.publicInputs.extDataHash,
    input.publicInputs.inputNullifiers[0],
    input.publicInputs.inputNullifiers[1],
    input.publicInputs.outputCommitments[0],
    input.publicInputs.outputCommitments[1],
  ];
}

function bytesToFieldDecimal(bytes: Uint8Array): string {
  return BigInt(`0x${bytesToHex(bytes)}`).toString();
}

function toLittleEndianFieldBytes(input: unknown): Uint8Array {
  return new Uint8Array(fieldDecimalToBytes(decimalScalarSchema.parse(input))).reverse();
}

function flattenG2ProofCoordinates(
  values: readonly [Uint8Array, Uint8Array],
): Uint8Array {
  return new Uint8Array(concatBytes(values)).reverse();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.byteLength, 0),
  );
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function shouldUseSingleThread(): boolean {
  return hasRuntimeGlobal("Deno") || hasRuntimeGlobal("Bun");
}

function hasRuntimeGlobal(name: "Deno" | "Bun"): boolean {
  return Object.prototype.hasOwnProperty.call(globalThis, name);
}
