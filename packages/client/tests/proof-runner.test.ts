import { describe, expect, it, vi } from "vitest";

import {
  addressSchema,
  bytesToHex,
  createProofRunner,
  createSnarkInput,
  fieldDecimalToBytes,
  formatProof,
  quoteTransfer,
  type Groth16FullProver,
  type ProofRunnerInput,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const recipient = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);

describe("proof runner", () => {
  it("builds the snark input expected by the transaction circuit", () => {
    expect(createSnarkInput(createRunnerInput())).toEqual({
      root: "1",
      publicAmount: "2",
      extDataHash: "3",
      mintAddress: "11111111111111111111111111111112",
      inputNullifier: ["4", "5"],
      inAmount: ["100", "0"],
      inPrivateKey: ["11", "12"],
      inBlinding: ["21", "22"],
      inPathIndices: [1, 0],
      inPathElements: [
        ["31", "32"],
        ["0", "0"],
      ],
      outputCommitment: ["6", "7"],
      outAmount: ["90", "0"],
      outPubkey: ["41", "41"],
      outBlinding: ["51", "52"],
    });
  });

  it("formats Groth16 proof coordinates for the Anchor verifier", () => {
    const proof = formatProof({
      pi_a: ["1", "2", "1"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
        ["1", "0"],
      ],
      pi_c: ["7", "8", "1"],
      protocol: "groth16",
      curve: "bn128",
    });

    expect(bytesToHex(proof.proofA)).toBe(fieldHex("1") + fieldHex("2"));
    expect(bytesToHex(proof.proofB)).toBe(
      fieldHex("4") + fieldHex("3") + fieldHex("6") + fieldHex("5"),
    );
    expect(bytesToHex(proof.proofC)).toBe(fieldHex("7") + fieldHex("8"));
  });

  it("runs snarkjs fullProve and returns formatted proof bytes", async () => {
    const groth16 = createGroth16({ publicSignals: ["1", "2", "3", "4", "5", "6", "7"] });
    const runner = createProofRunner({
      wasm: "/circuit/transaction2.wasm",
      zkey: "/circuit/transaction2.zkey",
      singleThread: true,
      groth16,
    });

    await expect(runner.prove(createRunnerInput())).resolves.toEqual({
      proofA: concatBytes([fieldDecimalToBytes("1"), fieldDecimalToBytes("2")]),
      proofB: concatBytes([
        fieldDecimalToBytes("4"),
        fieldDecimalToBytes("3"),
        fieldDecimalToBytes("6"),
        fieldDecimalToBytes("5"),
      ]),
      proofC: concatBytes([fieldDecimalToBytes("7"), fieldDecimalToBytes("8")]),
    });
    expect(groth16.fullProve).toHaveBeenCalledWith(
      createSnarkInput(createRunnerInput()),
      "/circuit/transaction2.wasm",
      "/circuit/transaction2.zkey",
      undefined,
      { singleThread: true },
      { singleThread: true },
    );
  });

  it("rejects proofs whose public signals do not match prepared inputs", async () => {
    const runner = createProofRunner({
      wasm: "/circuit/transaction2.wasm",
      zkey: "/circuit/transaction2.zkey",
      groth16: createGroth16({
        publicSignals: ["1", "2", "3", "4", "5", "6", "8"],
      }),
    });

    await expect(runner.prove(createRunnerInput())).rejects.toThrow(
      "Proof public signal 6 does not match",
    );
  });
});

function createGroth16(input: {
  publicSignals: string[];
}): Groth16FullProver {
  return {
    fullProve: vi.fn(async () => ({
      proof: {
        pi_a: ["1", "2", "1"],
        pi_b: [
          ["3", "4"],
          ["5", "6"],
          ["1", "0"],
        ],
        pi_c: ["7", "8", "1"],
        protocol: "groth16",
        curve: "bn128",
      },
      publicSignals: input.publicSignals,
    })),
  };
}

function createRunnerInput(): ProofRunnerInput {
  const quote = quoteTransfer({
    recipientLamports: 90n,
    privateBalanceLamports: 100n,
    withdrawalFeeBps: 0,
  });

  return {
    transfer: {
      programAddress,
      ownerAddress,
      recipient,
      quote,
      unlockSignature: new Uint8Array([1]),
    },
    programAddress,
    ownerAddress,
    recipient,
    feeRecipient,
    merkleRoot: "1",
    treeHeight: 2,
    inputNotes: [
      {
        amountLamports: 100n,
        privateKey: "11",
        blinding: "21",
        nullifier: "4",
        nullifierHex: fieldHex("4"),
        pathIndex: 1,
        pathElements: ["31", "32"],
      },
      {
        amountLamports: 0n,
        privateKey: "12",
        blinding: "22",
        nullifier: "5",
        nullifierHex: fieldHex("5"),
        pathIndex: 0,
        pathElements: ["0", "0"],
      },
    ],
    outputs: [
      {
        kind: "change",
        amountLamports: 90n,
        blinding: "51",
        index: 8,
        publicKey: "41",
        mintAddress: "11111111111111111111111111111112",
        commitment: "6",
      },
      {
        kind: "dummy",
        amountLamports: 0n,
        blinding: "52",
        index: 9,
        publicKey: "41",
        mintAddress: "11111111111111111111111111111112",
        commitment: "7",
      },
    ],
    extData: {
      extAmount: -90n,
      fee: 0n,
    },
    publicInputs: {
      root: fieldDecimalToBytes("1"),
      publicAmount: fieldDecimalToBytes("2"),
      extDataHash: fieldDecimalToBytes("3"),
      inputNullifiers: [fieldDecimalToBytes("4"), fieldDecimalToBytes("5")],
      outputCommitments: [fieldDecimalToBytes("6"), fieldDecimalToBytes("7")],
    },
  };
}

function fieldHex(value: string): string {
  return bytesToHex(fieldDecimalToBytes(value));
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
