import {
  blockhash,
  getTransactionMessageComputeUnitLimit,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import {
  CHAIN_DEPOSIT_PAYLOAD_KIND,
  CHAIN_TRANSFER_PAYLOAD_KIND,
  DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
  createDepositChainExecutor,
  createChainExecutor,
  getDepositChainPayload,
  getChainPayload,
  type BuildTransactInstruction,
  type ChainRpc,
  type TransactionExecutor,
} from "@/chain";
import { type ProofMaterial, type ProofProvider } from "@/proof";
import {
  prepareDeposit,
  quoteDeposit,
  type DepositProofProvider,
  type PrepareDepositInput,
} from "@/deposit";
import {
  prepareTransfer,
  quoteTransfer,
  type PrepareTransferInput,
} from "@/transfer";
import { addressSchema } from "@/schemas";

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
const nullifier = addressSchema.parse(
  "48JDPc91uGGyic2roMgbfAU7svJeHN3WN5TJHPCHuKuS",
);
const latestBlockhash = {
  blockhash: blockhash("ABmPH5KDXX99u6woqFS5vfBGSNyKG42SzpvBMWWqAy48"),
  lastValidBlockHeight: 123n,
};
const createdAt = new Date("2026-06-18T00:00:00.000Z");
const sentAt = new Date("2026-06-18T00:01:00.000Z");
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua";

function createPrepareInput(): PrepareTransferInput {
  return {
    programAddress,
    ownerAddress,
    recipient: recipientAddress,
    quote: quoteTransfer({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 250_000n,
      withdrawalFeeBps: 25,
    }),
    unlockSignature: new Uint8Array([1]),
  };
}

function createDepositInput(): PrepareDepositInput {
  return {
    programAddress,
    ownerAddress,
    quote: quoteDeposit({
      lamports: 1_000_000n,
      depositFeeBps: 0,
    }),
    unlockSignature: new Uint8Array([1]),
  };
}

function createSigner(): TransactionSigner {
  return {
    address: ownerAddress,
    signTransactions: async () => [],
  };
}

function createProof(): ProofMaterial {
  const bytes = new Uint8Array([1, 2, 3]);

  return {
    nullifiers: [nullifier, ownerAddress, recipientAddress, feeRecipient],
    proof: {
      proofA: bytes,
      proofB: bytes,
      proofC: bytes,
      root: bytes,
      publicAmount: bytes,
      extDataHash: bytes,
      inputNullifiers: [bytes, bytes],
      outputCommitments: [bytes, bytes],
    },
    extData: {
      extAmount: -1_000_000n,
      fee: 2_506n,
    },
    encryptedOutput1: bytes,
    encryptedOutput2: bytes,
  };
}

function createRpc(): ChainRpc {
  return {
    getLatestBlockhash: () => ({
      send: vi.fn(async () => ({ value: latestBlockhash })),
    }),
  };
}

function createProofProvider(proof: unknown = createProof()): ProofProvider {
  return {
    createProofMaterial: vi.fn(async () => proof),
  };
}

function createDepositProofProvider(
  proof: unknown = {
    ...createProof(),
    extData: {
      extAmount: 1_000_000n,
      fee: 0n,
    },
  },
): DepositProofProvider {
  return {
    createDepositProofMaterial: vi.fn(async () => proof),
  };
}

function createTransactionExecutor(
  overrides: Partial<TransactionExecutor> = {},
): TransactionExecutor {
  return {
    simulateTransaction: vi.fn(async () => ({
      value: {
        err: null,
        logs: ["Program log: Instruction: Transact"],
        unitsConsumed: 257_332,
      },
    })),
    sendTransaction: vi.fn(async () => signature),
    ...overrides,
  };
}

function createInstruction(): Instruction {
  return {
    programAddress,
    accounts: [],
    data: new Uint8Array([9, 9, 9]),
  };
}

describe("chain", () => {
  it("prepares a chain transfer with a typed chain payload", async () => {
    const signer = createSigner();
    const proofProvider = createProofProvider();
    const transactionExecutor = createTransactionExecutor();
    const instruction = createInstruction();
    const buildTransactInstruction = vi.fn(async () => instruction) satisfies
      BuildTransactInstruction;
    const executor = createChainExecutor({
      rpc: createRpc(),
      signer,
      feeRecipient,
      proofProvider,
      transactionExecutor,
      buildTransactInstruction,
      now: () => createdAt,
    });

    const prepared = await prepareTransfer(executor, createPrepareInput());

    expect(prepared.payload).toMatchObject({
      kind: CHAIN_TRANSFER_PAYLOAD_KIND,
    });
    expect(proofProvider.createProofMaterial).toHaveBeenCalledWith(
      createPrepareInput(),
    );
    expect(buildTransactInstruction).toHaveBeenCalledWith({
      signer,
      recipient: recipientAddress,
      feeRecipient,
      material: createProof(),
      programAddress,
    });

    const payload = getChainPayload(prepared);

    expect(getTransactionMessageComputeUnitLimit(payload.transactionMessage)).toBe(
      DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
    );
    expect(payload.transactionMessage.instructions).toHaveLength(2);
    expect(payload.transactionMessage.instructions[1]).toBe(instruction);
    expect(payload.transactionMessage.lifetimeConstraint).toEqual(latestBlockhash);
    expect(payload.transactionMessage.feePayer.address).toBe(ownerAddress);
  });

  it("prepares a chain deposit with a typed chain payload", async () => {
    const signer = createSigner();
    const proofProvider = createDepositProofProvider();
    const transactionExecutor = createTransactionExecutor();
    const instruction = createInstruction();
    const buildTransactInstruction = vi.fn(async () => instruction) satisfies
      BuildTransactInstruction;
    const executor = createDepositChainExecutor({
      rpc: createRpc(),
      signer,
      feeRecipient,
      proofProvider,
      transactionExecutor,
      buildTransactInstruction,
      now: () => createdAt,
    });

    const prepared = await prepareDeposit(executor, createDepositInput());

    expect(prepared.payload).toMatchObject({
      kind: CHAIN_DEPOSIT_PAYLOAD_KIND,
    });
    expect(prepared.recipient).toBe(ownerAddress);
    expect(proofProvider.createDepositProofMaterial).toHaveBeenCalledWith(
      createDepositInput(),
    );
    expect(buildTransactInstruction).toHaveBeenCalledWith({
      signer,
      recipient: ownerAddress,
      feeRecipient,
      material: {
        ...createProof(),
        extData: {
          extAmount: 1_000_000n,
          fee: 0n,
        },
      },
      programAddress,
    });

    const payload = getDepositChainPayload(prepared);

    expect(getTransactionMessageComputeUnitLimit(payload.transactionMessage)).toBe(
      DEFAULT_TRANSACT_COMPUTE_UNIT_LIMIT,
    );
    expect(payload.transactionMessage.instructions).toHaveLength(2);
    expect(payload.transactionMessage.instructions[1]).toBe(instruction);
    expect(payload.transactionMessage.lifetimeConstraint).toEqual(latestBlockhash);
    expect(payload.transactionMessage.feePayer.address).toBe(ownerAddress);
  });

  it("normalizes simulation and send results", async () => {
    const transactionExecutor = createTransactionExecutor();
    const executor = createChainExecutor({
      rpc: createRpc(),
      signer: createSigner(),
      feeRecipient,
      proofProvider: createProofProvider(),
      transactionExecutor,
      buildTransactInstruction: vi.fn(async () => createInstruction()),
      explorerBaseUrl: "https://explorer.gorbagana.wtf",
      now: () => sentAt,
    });
    const prepared = await prepareTransfer(executor, createPrepareInput());

    await expect(executor.simulateTransfer(prepared)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 257_332,
    });
    await expect(executor.sendTransfer(prepared)).resolves.toEqual({
      signature,
      sentAt: sentAt.toISOString(),
      explorerUrl: `https://explorer.gorbagana.wtf/tx/${signature}`,
    });
    expect(transactionExecutor.simulateTransaction).toHaveBeenCalledWith({
      preparedOperation: prepared,
      transactionMessage: getChainPayload(prepared).transactionMessage,
    });
  });

  it("rejects invalid proof material and wrong signer", async () => {
    const buildTransactInstruction = vi.fn(async () => createInstruction());
    const executor = createChainExecutor({
      rpc: createRpc(),
      signer: createSigner(),
      feeRecipient,
      proofProvider: createProofProvider({
        ...createProof(),
        encryptedOutput1: new Uint8Array(),
      }),
      transactionExecutor: createTransactionExecutor(),
      buildTransactInstruction,
    });

    await expect(executor.prepareTransfer(createPrepareInput())).rejects.toThrow(
      "Expected non-empty bytes",
    );
    expect(buildTransactInstruction).not.toHaveBeenCalled();

    const wrongSignerExecutor = createChainExecutor({
      rpc: createRpc(),
      signer: { ...createSigner(), address: feeRecipient },
      feeRecipient,
      proofProvider: createProofProvider(),
      transactionExecutor: createTransactionExecutor(),
      buildTransactInstruction,
    });

    await expect(
      wrongSignerExecutor.prepareTransfer(createPrepareInput()),
    ).rejects.toThrow("Chain signer address must match transfer owner");
  });
});
