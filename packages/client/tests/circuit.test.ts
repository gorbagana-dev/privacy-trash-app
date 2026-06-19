import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_TOKEN_SENTINEL,
  addressSchema,
  createCircuitProver,
  decimalToFieldHex,
  fieldDecimalToBytes,
  fieldHexToBytes,
  quoteTransfer,
  type CircuitInput,
  type CircuitInputNote,
  type OutputBlinding,
  type OutputEncryptor,
  type PoseidonHasher,
  type ProofRunner,
  type PublicInputEncoder,
  type NullifierAccountResolver,
  type UtxoWitness,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const recipientAddress = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);
const nullifierAccount0 = addressSchema.parse(
  "48JDPc91uGGyic2roMgbfAU7svJeHN3WN5TJHPCHuKuS",
);
const nullifierAccount1 = addressSchema.parse(
  "2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz",
);
const nullifierAccount2 = addressSchema.parse(
  "62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6",
);
const nullifierAccount3 = addressSchema.parse(
  "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
);
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifier =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const secondCommitment =
  "218374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const secondNullifier =
  "b18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const dummyNullifier = decimalToFieldHex("666");
const merkleRoot = "123";

function createInput(
  overrides: Partial<CircuitInput> = {},
): CircuitInput {
  const quote = quoteTransfer({
    recipientLamports: 1_000_000n,
    privateBalanceLamports: 2_000_000n,
    withdrawalFeeBps: 25,
  });
  const inputNote = createInputNote();

  return {
    transfer: {
      programAddress,
      ownerAddress,
      recipient: recipientAddress,
      quote,
      unlockSignature: new Uint8Array([1, 2, 3]),
    },
    programAddress,
    ownerAddress,
    recipient: recipientAddress,
    merkleRoot,
    treeHeight: 26,
    nextIndex: 7,
    amounts: {
      recipientLamports: quote.recipientLamports,
      grossWithdrawalLamports: quote.grossWithdrawalLamports,
      withdrawalFeeLamports: quote.withdrawalFeeLamports,
      shieldLamports: quote.shieldLamports,
      privateBalanceLamports: quote.privateBalanceLamports,
      selectedInputLamports: 2_000_000n,
      changeLamports: 997_494n,
    },
    inputNotes: [inputNote],
    ...overrides,
  };
}

function createInputNote(
  overrides: Partial<CircuitInputNote> = {},
): CircuitInputNote {
  const witness = createWitness(overrides.witness);

  return {
    commitment,
    encryptedOutput: "010203",
    nullifier,
    amountLamports: 2_000_000n,
    witness,
    merkleProof: {
      commitment: BigInt(`0x${commitment}`).toString(),
      commitmentHex: commitment,
      found: true,
      outputIndex: "0",
      pathElements: Array.from({ length: 26 }, () => "0"),
      pathIndices: Array.from({ length: 26 }, () => 0),
    },
    ...overrides,
  };
}

function createWitness(
  overrides: Partial<UtxoWitness> = {},
): UtxoWitness {
  return {
    version: "v2",
    amountLamports: 2_000_000n,
    blinding: "9",
    index: 0,
    privateKey: "10",
    publicKey: "11",
    commitment: BigInt(`0x${commitment}`).toString(),
    nullifier: "12",
    nullifierHex: nullifier,
    mintAddress: NATIVE_TOKEN_SENTINEL,
    ...overrides,
  };
}

function createHasher(): PoseidonHasher {
  const outputs = ["111", "222", "333", "444", "555", "666"];

  return {
    poseidonHashString: vi.fn(() => {
      const output = outputs.shift();

      if (output === undefined) throw new Error("Unexpected hash call.");

      return output;
    }),
  };
}

function createRandomBytes(): Uint8Array {
  return new Uint8Array(31).fill(9);
}

function createOutputBlinding(): OutputBlinding {
  const blindings = ["77", "88"];

  return {
    createBlinding: vi.fn(async () => {
      const blinding = blindings.shift();

      if (blinding === undefined) throw new Error("Unexpected blinding call.");

      return blinding;
    }),
  };
}

function createOutputEncryptor(): OutputEncryptor {
  return {
    encryptOutput: vi.fn(async ({ kind }) =>
      kind === "change" ? bytes(64, 11) : bytes(64, 12),
    ),
  };
}

function createNullifierAccounts(): NullifierAccountResolver {
  return {
    resolveNullifierAccounts: vi.fn(async () => [
      nullifierAccount0,
      nullifierAccount1,
      nullifierAccount2,
      nullifierAccount3,
    ]),
  };
}

function createPublicInputEncoder(): PublicInputEncoder {
  return {
    encodePublicAmount: vi.fn(async () => bytes(32, 5)),
    hashExtData: vi.fn(async () => bytes(32, 6)),
  };
}

function createProofRunner(): ProofRunner {
  return {
    prove: vi.fn(async () => ({
      proofA: bytes(64, 1),
      proofB: bytes(128, 2),
      proofC: bytes(64, 3),
    })),
  };
}

describe("circuit", () => {
  it("assembles proof material from circuit input and adapters", async () => {
    const hasher = createHasher();
    const outputBlinding = createOutputBlinding();
    const outputEncryptor = createOutputEncryptor();
    const nullifierAccounts = createNullifierAccounts();
    const publicInputEncoder = createPublicInputEncoder();
    const proofRunner = createProofRunner();
    const prover = createCircuitProver({
      hasher,
      proofRunner,
      outputBlinding,
      outputEncryptor,
      nullifierAccounts,
      publicInputEncoder,
      feeRecipient,
      randomBytes: createRandomBytes,
    });
    const input = createInput();

    await expect(prover.prove(input)).resolves.toEqual({
      nullifiers: [
        nullifierAccount0,
        nullifierAccount1,
        nullifierAccount2,
        nullifierAccount3,
      ],
      proof: {
        proofA: bytes(64, 1),
        proofB: bytes(128, 2),
        proofC: bytes(64, 3),
        root: fieldDecimalToBytes(merkleRoot),
        publicAmount: bytes(32, 5),
        extDataHash: bytes(32, 6),
        inputNullifiers: [
          fieldHexToBytes(nullifier),
          fieldHexToBytes(dummyNullifier),
        ],
        outputCommitments: [
          fieldDecimalToBytes("111"),
          fieldDecimalToBytes("222"),
        ],
      },
      extData: {
        extAmount: -1_002_506n,
        fee: 2_506n,
      },
      encryptedOutput1: bytes(64, 11),
      encryptedOutput2: bytes(64, 12),
    });
    expect(hasher.poseidonHashString).toHaveBeenCalledWith([
      "997494",
      "11",
      "77",
      NATIVE_TOKEN_SENTINEL,
    ]);
    expect(hasher.poseidonHashString).toHaveBeenCalledWith([
      "0",
      "11",
      "88",
      NATIVE_TOKEN_SENTINEL,
    ]);
    expect(nullifierAccounts.resolveNullifierAccounts).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
      inputNullifiers: [nullifier, dummyNullifier],
      outputCommitments: [decimalToFieldHex("111"), decimalToFieldHex("222")],
    });
    expect(publicInputEncoder.encodePublicAmount).toHaveBeenCalledWith({
      extAmount: -1_002_506n,
      fee: 2_506n,
    });
    expect(publicInputEncoder.hashExtData).toHaveBeenCalledWith({
      extData: {
        extAmount: -1_002_506n,
        fee: 2_506n,
      },
      recipient: recipientAddress,
      feeRecipient,
      encryptedOutputs: [bytes(64, 11), bytes(64, 12)],
      outputCommitments: [decimalToFieldHex("111"), decimalToFieldHex("222")],
    });
    expect(proofRunner.prove).toHaveBeenCalledWith(
      expect.objectContaining({
        programAddress,
        ownerAddress,
        recipient: recipientAddress,
        feeRecipient,
        merkleRoot,
        treeHeight: 26,
        extData: {
          extAmount: -1_002_506n,
          fee: 2_506n,
        },
        outputs: [
          expect.objectContaining({
            kind: "change",
            amountLamports: 997_494n,
            blinding: "77",
            commitment: "111",
          }),
          expect.objectContaining({
            kind: "dummy",
            amountLamports: 0n,
            blinding: "88",
            commitment: "222",
          }),
        ],
      }),
    );
  });

  it("rejects shielded top-ups until that circuit path exists", async () => {
    const proofRunner = createProofRunner();
    const prover = createCircuitProver({
      hasher: createHasher(),
      proofRunner,
      outputBlinding: createOutputBlinding(),
      outputEncryptor: createOutputEncryptor(),
      nullifierAccounts: createNullifierAccounts(),
      publicInputEncoder: createPublicInputEncoder(),
      feeRecipient,
      randomBytes: createRandomBytes,
    });

    await expect(
      prover.prove(
        createInput({
          amounts: {
            ...createInput().amounts,
            shieldLamports: 1n,
          },
        }),
      ),
    ).rejects.toThrow("Shielded top-ups are not implemented");
    expect(proofRunner.prove).not.toHaveBeenCalled();
  });

  it("rejects inconsistent selected input amounts", async () => {
    const prover = createCircuitProver({
      hasher: createHasher(),
      proofRunner: createProofRunner(),
      outputBlinding: createOutputBlinding(),
      outputEncryptor: createOutputEncryptor(),
      nullifierAccounts: createNullifierAccounts(),
      publicInputEncoder: createPublicInputEncoder(),
      feeRecipient,
      randomBytes: createRandomBytes,
    });

    await expect(
      prover.prove(
        createInput({
          amounts: {
            ...createInput().amounts,
            selectedInputLamports: 1n,
          },
        }),
      ),
    ).rejects.toThrow("selected amount does not match input notes");
  });

  it("rejects selected notes with different private note keys", async () => {
    const prover = createCircuitProver({
      hasher: createHasher(),
      proofRunner: createProofRunner(),
      outputBlinding: createOutputBlinding(),
      outputEncryptor: createOutputEncryptor(),
      nullifierAccounts: createNullifierAccounts(),
      publicInputEncoder: createPublicInputEncoder(),
      feeRecipient,
      randomBytes: createRandomBytes,
    });
    const firstNote = createInputNote({
      amountLamports: 1_500_000n,
      witness: createWitness({
        amountLamports: 1_500_000n,
        publicKey: "11",
      }),
    });
    const secondNote = createInputNote({
      commitment: secondCommitment,
      nullifier: secondNullifier,
      amountLamports: 500_000n,
      witness: createWitness({
        amountLamports: 500_000n,
        publicKey: "99",
        commitment: BigInt(`0x${secondCommitment}`).toString(),
        nullifierHex: secondNullifier,
      }),
    });

    await expect(
      prover.prove(
        createInput({
          inputNotes: [firstNote, secondNote],
          amounts: {
            ...createInput().amounts,
            selectedInputLamports: 2_000_000n,
          },
        }),
      ),
    ).rejects.toThrow("same private note key");
  });
});

function bytes(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}
