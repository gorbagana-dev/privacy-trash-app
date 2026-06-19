import type { Address, ReadonlyUint8Array } from "@solana/kit";
import { z } from "zod";

import {
  decimalToFieldHex,
  fieldDecimalToBytes,
  fieldElementDecimalSchema,
  fieldHexToBytes,
} from "@/field";
import {
  createRandomFieldElement,
  cryptoRandomBytes,
} from "@/output";
import { proofMaterialSchema, type ProofMaterial } from "@/proof";
import type {
  CircuitInput,
  CircuitInputNote,
  CircuitProver,
} from "@/prover";
import { addressSchema, nonEmptyBytesSchema } from "@/schemas";
import { NATIVE_TOKEN_SENTINEL, type PoseidonHasher } from "@/utxo";

const circuitExtDataSchema = z.strictObject({
  extAmount: z.bigint(),
  fee: z.bigint().nonnegative(),
});

const circuitOutputKindSchema = z.enum(["change", "dummy"]);

const circuitOutputSchema = z.strictObject({
  kind: circuitOutputKindSchema,
  amountLamports: z.bigint().nonnegative(),
  blinding: fieldElementDecimalSchema,
  index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  publicKey: fieldElementDecimalSchema,
  mintAddress: z.literal(NATIVE_TOKEN_SENTINEL),
  commitment: fieldElementDecimalSchema,
});

const circuitPublicInputsSchema = z.strictObject({
  root: fixedBytesSchema(32, "root"),
  publicAmount: fixedBytesSchema(32, "publicAmount"),
  extDataHash: fixedBytesSchema(32, "extDataHash"),
  inputNullifiers: z.tuple([
    fixedBytesSchema(32, "inputNullifier0"),
    fixedBytesSchema(32, "inputNullifier1"),
  ]),
  outputCommitments: z.tuple([
    fixedBytesSchema(32, "outputCommitment0"),
    fixedBytesSchema(32, "outputCommitment1"),
  ]),
});

const proofRunnerOutputSchema = z.strictObject({
  proofA: fixedBytesSchema(64, "proofA"),
  proofB: fixedBytesSchema(128, "proofB"),
  proofC: fixedBytesSchema(64, "proofC"),
});

export type CircuitExtData = z.infer<typeof circuitExtDataSchema>;
export type CircuitOutputKind = z.infer<typeof circuitOutputKindSchema>;
export type CircuitOutput = z.infer<typeof circuitOutputSchema>;
export type CircuitPublicInputs = z.infer<typeof circuitPublicInputsSchema>;
export type ProofRunnerOutput = z.infer<typeof proofRunnerOutputSchema>;

export type PaddedInputNotes = readonly [
  CircuitInputNote,
  CircuitInputNote | null,
];

export type CircuitInputSlot = {
  amountLamports: bigint;
  privateKey: string;
  blinding: string;
  nullifier: string;
  nullifierHex: string;
  pathIndex: number;
  pathElements: readonly string[];
};

export type ProofRunnerInput = {
  transfer: CircuitInput["transfer"];
  programAddress: string;
  ownerAddress: string;
  recipient: string;
  feeRecipient: Address;
  merkleRoot: string;
  treeHeight: number;
  inputNotes: readonly [CircuitInputSlot, CircuitInputSlot];
  outputs: readonly [CircuitOutput, CircuitOutput];
  extData: CircuitExtData;
  publicInputs: CircuitPublicInputs;
};

export type ProofRunner = {
  prove(input: ProofRunnerInput): Promise<unknown>;
};

export type OutputBlindingInput = {
  kind: CircuitOutputKind;
  outputIndex: number;
  transfer: CircuitInput["transfer"];
};

export type OutputBlinding = {
  createBlinding(input: OutputBlindingInput): Promise<unknown>;
};

export type OutputEncryptorInput = CircuitOutput & {
  programAddress: string;
  ownerAddress: string;
  unlockSignature: Uint8Array;
};

export type OutputEncryptor = {
  encryptOutput(input: OutputEncryptorInput): Promise<unknown>;
};

export type NullifierAccountResolverInput = {
  programAddress: string;
  ownerAddress: string;
  inputNullifiers: readonly [string, string];
  outputCommitments: readonly [string, string];
};

export type NullifierAccountResolver = {
  resolveNullifierAccounts(
    input: NullifierAccountResolverInput,
  ): Promise<unknown>;
};

export type PublicInputEncoderInput = {
  extData: CircuitExtData;
  recipient: string;
  feeRecipient: Address;
  encryptedOutputs: readonly [ReadonlyUint8Array, ReadonlyUint8Array];
  outputCommitments: readonly [string, string];
};

export type PublicInputEncoder = {
  encodePublicAmount(input: CircuitExtData): Promise<unknown>;
  hashExtData(input: PublicInputEncoderInput): Promise<unknown>;
};

export type RandomBytes = (length: number) => Uint8Array;

export type CreateCircuitProverInput = {
  hasher: PoseidonHasher;
  proofRunner: ProofRunner;
  outputBlinding: OutputBlinding;
  outputEncryptor: OutputEncryptor;
  nullifierAccounts: NullifierAccountResolver;
  publicInputEncoder: PublicInputEncoder;
  feeRecipient: string;
  randomBytes?: RandomBytes | undefined;
};

export function createCircuitProver(
  input: CreateCircuitProverInput,
): CircuitProver {
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;

  return {
    async prove(circuitInput) {
      validateCircuitAmounts(circuitInput);
      validateInputNotes(circuitInput.inputNotes);

      if (circuitInput.amounts.shieldLamports > 0n) {
        throw new Error("Shielded top-ups are not implemented in the circuit prover.");
      }

      const paddedInputNotes = padInputNotes(circuitInput.inputNotes);
      const outputs = await createOutputs({
        circuitInput,
        hasher: input.hasher,
        outputBlinding: input.outputBlinding,
      });
      const encryptedOutputs = await encryptOutputs({
        circuitInput,
        outputs,
        outputEncryptor: input.outputEncryptor,
      });
      const inputNotes = createCircuitInputSlots({
        circuitInput,
        hasher: input.hasher,
        randomBytes,
      });
      const extData = circuitExtDataSchema.parse({
        extAmount: -circuitInput.amounts.grossWithdrawalLamports,
        fee: circuitInput.amounts.withdrawalFeeLamports,
      });
      const outputCommitments = outputs.map((output) =>
        decimalToFieldHex(output.commitment),
      ) as [string, string];
      const inputNullifiers = inputNotes.map((note) => note.nullifierHex) as [
        string,
        string,
      ];
      const nullifiers = parseNullifierAccounts(
        await input.nullifierAccounts.resolveNullifierAccounts({
          programAddress: circuitInput.programAddress,
          ownerAddress: circuitInput.ownerAddress,
          inputNullifiers,
          outputCommitments,
        }),
      );
      const publicInputs = circuitPublicInputsSchema.parse({
        root: fieldDecimalToBytes(circuitInput.merkleRoot),
        publicAmount: parseFixedBytes(
          await input.publicInputEncoder.encodePublicAmount(extData),
          32,
          "publicAmount",
        ),
        extDataHash: parseFixedBytes(
          await input.publicInputEncoder.hashExtData({
            extData,
            recipient: circuitInput.recipient,
            feeRecipient,
            encryptedOutputs,
            outputCommitments,
          }),
          32,
          "extDataHash",
        ),
        inputNullifiers: inputNullifiers.map(fieldHexToBytes),
        outputCommitments: outputs.map((output) =>
          fieldDecimalToBytes(output.commitment),
        ),
      });
      const proof = proofRunnerOutputSchema.parse(
        await input.proofRunner.prove({
          transfer: circuitInput.transfer,
          programAddress: circuitInput.programAddress,
          ownerAddress: circuitInput.ownerAddress,
          recipient: circuitInput.recipient,
          feeRecipient,
          merkleRoot: circuitInput.merkleRoot,
          treeHeight: circuitInput.treeHeight,
          inputNotes,
          outputs,
          extData,
          publicInputs,
        }),
      );

      return proofMaterialSchema.parse({
        nullifiers,
        proof: {
          ...proof,
          root: publicInputs.root,
          publicAmount: publicInputs.publicAmount,
          extDataHash: publicInputs.extDataHash,
          inputNullifiers: publicInputs.inputNullifiers,
          outputCommitments: publicInputs.outputCommitments,
        },
        extData,
        encryptedOutput1: encryptedOutputs[0],
        encryptedOutput2: encryptedOutputs[1],
      }) satisfies ProofMaterial;
    },
  };
}

function validateInputNotes(inputNotes: readonly CircuitInputNote[]): void {
  for (const note of inputNotes) {
    if (!commitmentMatchesWitness(note.commitment, note.witness.commitment)) {
      throw new Error("Circuit input note commitment does not match its witness.");
    }

    if (note.nullifier !== note.witness.nullifierHex) {
      throw new Error("Circuit input note nullifier does not match its witness.");
    }

    if (note.amountLamports !== note.witness.amountLamports) {
      throw new Error("Circuit input note amount does not match its witness.");
    }
  }
}

function validateCircuitAmounts(input: CircuitInput): void {
  const selectedInputLamports = input.inputNotes.reduce(
    (sum, note) => sum + note.amountLamports,
    0n,
  );

  if (selectedInputLamports !== input.amounts.selectedInputLamports) {
    throw new Error("Circuit input selected amount does not match input notes.");
  }

  if (selectedInputLamports < input.amounts.grossWithdrawalLamports) {
    throw new Error("Circuit input notes do not cover the gross withdrawal.");
  }

  if (
    input.amounts.changeLamports !==
    selectedInputLamports - input.amounts.grossWithdrawalLamports
  ) {
    throw new Error("Circuit input change amount is inconsistent.");
  }
}

function commitmentMatchesWitness(
  commitment: string,
  witnessCommitment: string,
): boolean {
  if (commitment === witnessCommitment) return true;
  if (/^[0-9a-f]{64}$/.test(commitment)) {
    return BigInt(`0x${commitment}`).toString() === witnessCommitment;
  }

  return false;
}

function fixedBytesSchema(size: number, label: string): z.ZodType<Uint8Array> {
  return z.custom<Uint8Array>(
    (value) => value instanceof Uint8Array && value.byteLength === size,
    { message: `${label} must be ${size} bytes.` },
  );
}

function parseFixedBytes(
  input: unknown,
  size: number,
  label: string,
): Uint8Array {
  return new Uint8Array(fixedBytesSchema(size, label).parse(input));
}

function parseEncryptedOutput(input: unknown): Uint8Array {
  return new Uint8Array(nonEmptyBytesSchema.parse(input));
}

function padInputNotes(
  inputNotes: readonly CircuitInputNote[],
): PaddedInputNotes {
  if (inputNotes.length < 1 || inputNotes.length > 2) {
    throw new Error("Circuit prover expects one or two input notes.");
  }

  return [inputNotes[0] as CircuitInputNote, inputNotes[1] ?? null];
}

async function createOutputs(input: {
  circuitInput: CircuitInput;
  hasher: PoseidonHasher;
  outputBlinding: OutputBlinding;
}): Promise<[CircuitOutput, CircuitOutput]> {
  const publicKey = getOutputPublicKey(input.circuitInput.inputNotes);
  const outputInputs = [
    {
      kind: "change" as const,
      amountLamports: input.circuitInput.amounts.changeLamports,
      index: input.circuitInput.nextIndex,
    },
    {
      kind: "dummy" as const,
      amountLamports: 0n,
      index: input.circuitInput.nextIndex + 1,
    },
  ];
  const outputs = await Promise.all(
    outputInputs.map(async (outputInput) => {
      const blinding = fieldElementDecimalSchema.parse(
        await input.outputBlinding.createBlinding({
          kind: outputInput.kind,
          outputIndex: outputInput.index,
          transfer: input.circuitInput.transfer,
        }),
      );
      const commitment = fieldElementDecimalSchema.parse(
        input.hasher.poseidonHashString([
          outputInput.amountLamports.toString(),
          publicKey,
          blinding,
          NATIVE_TOKEN_SENTINEL,
        ]),
      );

      return circuitOutputSchema.parse({
        ...outputInput,
        blinding,
        publicKey,
        mintAddress: NATIVE_TOKEN_SENTINEL,
        commitment,
      });
    }),
  );

  return [outputs[0] as CircuitOutput, outputs[1] as CircuitOutput];
}

async function encryptOutputs(input: {
  circuitInput: CircuitInput;
  outputs: readonly [CircuitOutput, CircuitOutput];
  outputEncryptor: OutputEncryptor;
}): Promise<[Uint8Array, Uint8Array]> {
  const encrypted = await Promise.all(
    input.outputs.map((output) =>
      input.outputEncryptor.encryptOutput({
        ...output,
        programAddress: input.circuitInput.programAddress,
        ownerAddress: input.circuitInput.ownerAddress,
        unlockSignature: input.circuitInput.transfer.unlockSignature,
      }),
    ),
  );

  return [
    parseEncryptedOutput(encrypted[0]),
    parseEncryptedOutput(encrypted[1]),
  ];
}

function getOutputPublicKey(notes: readonly CircuitInputNote[]): string {
  const publicKey = fieldElementDecimalSchema.parse(notes[0]?.witness.publicKey);

  for (const note of notes) {
    if (note.witness.publicKey !== publicKey) {
      throw new Error("Selected input notes must use the same private note key.");
    }
  }

  return publicKey;
}

function parseNullifierAccounts(input: unknown): [Address, Address, Address, Address] {
  return z
    .tuple([addressSchema, addressSchema, addressSchema, addressSchema])
    .parse(input);
}

function createCircuitInputSlots(input: {
  circuitInput: CircuitInput;
  hasher: PoseidonHasher;
  randomBytes: RandomBytes;
}): [CircuitInputSlot, CircuitInputSlot] {
  const firstNote = input.circuitInput.inputNotes[0];

  if (firstNote === undefined) {
    throw new Error("Circuit prover expects at least one input note.");
  }

  return [
    createInputSlot(firstNote, input.circuitInput.treeHeight),
    input.circuitInput.inputNotes[1] === undefined
      ? createDummyInputSlot(input)
      : createInputSlot(
          input.circuitInput.inputNotes[1],
          input.circuitInput.treeHeight,
        ),
  ];
}

function createInputSlot(
  note: CircuitInputNote,
  treeHeight: number,
): CircuitInputSlot {
  const outputIndex = note.merkleProof.outputIndex;

  if (outputIndex === null) {
    throw new Error("Input note Merkle proof is missing its output index.");
  }

  if (note.merkleProof.pathElements.length !== treeHeight) {
    throw new Error("Input note Merkle proof height does not match the tree.");
  }

  return {
    amountLamports: note.amountLamports,
    privateKey: fieldElementDecimalSchema.parse(note.witness.privateKey),
    blinding: fieldElementDecimalSchema.parse(note.witness.blinding),
    nullifier: fieldElementDecimalSchema.parse(note.witness.nullifier),
    nullifierHex: note.nullifier,
    pathIndex: z.coerce.number().int().nonnegative().parse(outputIndex),
    pathElements: note.merkleProof.pathElements,
  };
}

function createDummyInputSlot(input: {
  circuitInput: CircuitInput;
  hasher: PoseidonHasher;
  randomBytes: RandomBytes;
}): CircuitInputSlot {
  const privateKey = createRandomFieldElement(input.randomBytes);
  const blinding = createRandomFieldElement(input.randomBytes);
  const publicKey = fieldElementDecimalSchema.parse(
    input.hasher.poseidonHashString([privateKey]),
  );
  const commitment = fieldElementDecimalSchema.parse(
    input.hasher.poseidonHashString([
      "0",
      publicKey,
      blinding,
      NATIVE_TOKEN_SENTINEL,
    ]),
  );
  const signature = fieldElementDecimalSchema.parse(
    input.hasher.poseidonHashString([privateKey, commitment, "0"]),
  );
  const nullifier = fieldElementDecimalSchema.parse(
    input.hasher.poseidonHashString([commitment, "0", signature]),
  );

  return {
    amountLamports: 0n,
    privateKey,
    blinding,
    nullifier,
    nullifierHex: decimalToFieldHex(nullifier),
    pathIndex: 0,
    pathElements: Array.from({ length: input.circuitInput.treeHeight }, () => "0"),
  };
}
