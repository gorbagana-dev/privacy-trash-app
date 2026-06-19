import {
  appendTransactionMessageInstruction,
  blockhash,
  createTransactionMessage as createKitTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Base64EncodedWireTransaction,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import {
  CHAIN_TRANSFER_PAYLOAD_KIND,
  TRANSFER_EXECUTION_VERSION,
  TransactionExecutorError,
  addressSchema,
  createTransactionExecutor,
  preparedTransferSchema,
  quoteTransfer,
  type ChainTransactionMessage,
  type PreparedTransfer,
  type RuntimeTransaction,
  type TransactionRpc,
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
const latestBlockhash = {
  blockhash: blockhash("ABmPH5KDXX99u6woqFS5vfBGSNyKG42SzpvBMWWqAy48"),
  lastValidBlockHeight: 123n,
};
const createdAt = "2026-06-18T00:00:00.000Z";
const encodedTransaction = "AQIDBA==" as Base64EncodedWireTransaction;
const signature =
  "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua" as Signature;

describe("transaction executor", () => {
  it("simulates an unsigned transaction without requesting a signature", async () => {
    const rpc = createRpc({
      simulationResponse: {
        value: {
          err: null,
          logs: ["Program log: Instruction: Transact"],
          unitsConsumed: 257_332n,
        },
      },
    });
    const compileTransactionMessage = vi.fn(() => createRuntimeTransaction());
    const signTransactionMessage = vi.fn(async () => createRuntimeTransaction());
    const encodeTransaction = vi.fn(() => encodedTransaction);
    const executor = createTransactionExecutor({
      rpc,
      compileTransactionMessage,
      signTransactionMessage,
      encodeTransaction,
    });
    const executionInput = createExecutionInput();

    await expect(executor.simulateTransaction(executionInput)).resolves.toEqual({
      ok: true,
      logs: ["Program log: Instruction: Transact"],
      unitsConsumed: 257_332,
    });
    expect(compileTransactionMessage).toHaveBeenCalledWith(
      executionInput.transactionMessage,
    );
    expect(signTransactionMessage).not.toHaveBeenCalled();
    expect(encodeTransaction).toHaveBeenCalledWith(createRuntimeTransaction());
    expect(rpc.simulateTransaction).toHaveBeenCalledWith(encodedTransaction, {
      commitment: "confirmed",
      encoding: "base64",
      replaceRecentBlockhash: false,
      sigVerify: false,
    });
  });

  it("signs, sends, and waits for confirmation", async () => {
    const rpc = createRpc({
      statusResponses: [
        { value: [null] },
        {
          value: [
            {
              confirmationStatus: "confirmed",
              err: null,
              slot: 55n,
            },
          ],
        },
      ],
    });
    const signedTransaction = createRuntimeTransaction();
    const signTransactionMessage = vi.fn(async () => signedTransaction);
    const encodeTransaction = vi.fn(() => encodedTransaction);
    const sleep = vi.fn(async () => {});
    const executor = createTransactionExecutor({
      rpc,
      signTransactionMessage,
      encodeTransaction,
      getTransactionSignature: vi.fn(() => signature),
      sleep,
      confirmationPollIntervalMs: 1,
    });
    const executionInput = createExecutionInput();

    await expect(executor.sendTransaction(executionInput)).resolves.toEqual({
      signature,
      slot: 55,
    });
    expect(signTransactionMessage).toHaveBeenCalledWith(
      executionInput.transactionMessage,
    );
    expect(rpc.sendTransaction).toHaveBeenCalledWith(encodedTransaction, {
      encoding: "base64",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
    expect(rpc.getSignatureStatuses).toHaveBeenCalledTimes(2);
    expect(rpc.getBlockHeight).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1);
  });

  it("normalizes simulation failures", async () => {
    const rpc = createRpc({
      simulationResponse: {
        value: {
          err: { InstructionError: [0, "Custom"] },
          logs: ["Program log: failed"],
        },
      },
    });
    const executor = createTransactionExecutor({
      rpc,
      compileTransactionMessage: vi.fn(() => createRuntimeTransaction()),
      encodeTransaction: vi.fn(() => encodedTransaction),
    });

    await expect(
      executor.simulateTransaction(createExecutionInput()),
    ).resolves.toEqual({
      ok: false,
      logs: ["Program log: failed"],
      errorMessage: "{\"InstructionError\":[0,\"Custom\"]}",
    });
  });

  it("rejects failed on-chain transaction status", async () => {
    const rpc = createRpc({
      statusResponses: [
        {
          value: [
            {
              confirmationStatus: "confirmed",
              err: { InstructionError: [0, "Custom"] },
              slot: 55n,
            },
          ],
        },
      ],
    });
    const executor = createTransactionExecutor({
      rpc,
      signTransactionMessage: vi.fn(async () => createRuntimeTransaction()),
      encodeTransaction: vi.fn(() => encodedTransaction),
      getTransactionSignature: vi.fn(() => signature),
    });

    await expect(
      executor.sendTransaction(createExecutionInput()),
    ).rejects.toMatchObject({
      code: "transaction_failed",
    } satisfies Partial<TransactionExecutorError>);
  });

  it("rejects confirmation after the blockhash expires", async () => {
    const rpc = createRpc({
      blockHeightResponse: 124n,
      statusResponses: [{ value: [null] }],
    });
    const executor = createTransactionExecutor({
      rpc,
      signTransactionMessage: vi.fn(async () => createRuntimeTransaction()),
      encodeTransaction: vi.fn(() => encodedTransaction),
      getTransactionSignature: vi.fn(() => signature),
    });

    await expect(
      executor.sendTransaction(createExecutionInput()),
    ).rejects.toMatchObject({
      code: "blockhash_expired",
    } satisfies Partial<TransactionExecutorError>);
  });
});

function createExecutionInput() {
  const transactionMessage = createTransactionMessage();
  const preparedTransfer = createPreparedTransfer(transactionMessage);

  return {
    preparedTransfer,
    transactionMessage,
  };
}

function createPreparedTransfer(
  transactionMessage: ChainTransactionMessage,
): PreparedTransfer {
  return preparedTransferSchema.parse({
    version: TRANSFER_EXECUTION_VERSION,
    programAddress,
    ownerAddress,
    recipient: recipientAddress,
    quote: quoteTransfer({
      recipientLamports: 1_000_000n,
      privateBalanceLamports: 2_000_000n,
      withdrawalFeeBps: 25,
    }),
    createdAt,
    payload: {
      kind: CHAIN_TRANSFER_PAYLOAD_KIND,
      transactionMessage,
    },
  });
}

function createTransactionMessage(): ChainTransactionMessage {
  const instruction: Instruction = {
    programAddress,
    accounts: [],
    data: new Uint8Array([1, 2, 3]),
  };

  return appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayer(
        ownerAddress,
        createKitTransactionMessage({ version: 0 }),
      ),
    ),
  ) as ChainTransactionMessage;
}

function createRuntimeTransaction(): RuntimeTransaction {
  return {
    messageBytes: new Uint8Array([
      1,
      2,
      3,
    ]) as unknown as RuntimeTransaction["messageBytes"],
    signatures: {},
    lifetimeConstraint: latestBlockhash,
  };
}

function createRpc(input: {
  simulationResponse?: unknown;
  sendResponse?: unknown;
  statusResponses?: unknown[];
  blockHeightResponse?: unknown;
} = {}): TransactionRpc {
  const statusResponses = [...(input.statusResponses ?? [])];

  return {
    simulateTransaction: vi.fn(() => ({
      send: vi.fn(async () => input.simulationResponse ?? {
        value: {
          err: null,
          logs: [],
        },
      }),
    })),
    sendTransaction: vi.fn(() => ({
      send: vi.fn(async () => input.sendResponse ?? signature),
    })),
    getSignatureStatuses: vi.fn(() => ({
      send: vi.fn(async () => statusResponses.shift() ?? { value: [null] }),
    })),
    getBlockHeight: vi.fn(() => ({
      send: vi.fn(async () => input.blockHeightResponse ?? 100n),
    })),
  };
}
