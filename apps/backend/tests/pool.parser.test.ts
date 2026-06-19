import bs58 from "bs58";
import { describe, expect, it } from "vitest";

import type { ChainTransaction } from "@/modules/chain/chain.repository";
import { parsePoolTransaction } from "@/modules/pool/pool.parser";

const transactDiscriminator = Uint8Array.from([217, 149, 130, 143, 221, 52, 252, 119]);
const commitmentEventDiscriminator = Uint8Array.from([
  13, 110, 215, 127, 244, 62, 234, 34,
]);
const programId = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";

function hexByte(byte: number): string {
  return Buffer.alloc(32, byte).toString("hex");
}

function createTransactData(): string {
  const bytes = Buffer.alloc(488);
  transactDiscriminator.forEach((byte, index) => {
    bytes[index] = byte;
  });
  Buffer.alloc(32, 1).copy(bytes, 264);
  Buffer.alloc(32, 2).copy(bytes, 360);
  Buffer.alloc(32, 3).copy(bytes, 392);

  return bs58.encode(bytes);
}

function createCommitmentLog(input: {
  outputIndex: bigint;
  commitmentByte: number;
  encryptedOutput: Buffer;
}): string {
  const bytes = Buffer.alloc(8 + 8 + 32 + 4 + input.encryptedOutput.length);
  commitmentEventDiscriminator.forEach((byte, index) => {
    bytes[index] = byte;
  });
  bytes.writeBigUInt64LE(input.outputIndex, 8);
  Buffer.alloc(32, input.commitmentByte).copy(bytes, 16);
  bytes.writeUInt32LE(input.encryptedOutput.length, 48);
  input.encryptedOutput.copy(bytes, 52);

  return `Program data: ${bytes.toString("base64")}`;
}

describe("parsePoolTransaction", () => {
  it("parses native transact roots, nullifiers, and commitment events", () => {
    const transaction: ChainTransaction = {
      slot: 123,
      blockTime: 1_781_800_000,
      meta: {
        err: null,
        logMessages: [
          `Program ${programId} invoke [1]`,
          "Program log: Instruction: Transact",
          createCommitmentLog({
            outputIndex: 2n,
            commitmentByte: 4,
            encryptedOutput: Buffer.from("encrypted-1"),
          }),
          `Program ${programId} success`,
        ],
      },
      transaction: {
        message: {
          accountKeys: ["payer", programId],
          instructions: [
            {
              programIdIndex: 1,
              accounts: [],
              data: createTransactData(),
            },
          ],
        },
      },
    };

    const parsed = parsePoolTransaction({
      programId,
      signature: "signature-1",
      transaction,
    });

    expect(parsed.outputs).toEqual([
      {
        programId,
        outputIndex: 2n,
        commitment: hexByte(4),
        encryptedOutput: Buffer.from("encrypted-1").toString("base64"),
        txSignature: "signature-1",
        instructionIndex: 0,
        logIndex: 2,
        slot: 123n,
        blockTime: new Date(1_781_800_000 * 1000),
      },
    ]);
    expect(parsed.observedRoots).toEqual([
      {
        programId,
        root: hexByte(1),
        source: "proof",
        txSignature: "signature-1",
        instructionIndex: 0,
        slot: 123n,
        observedAt: new Date(1_781_800_000 * 1000),
      },
    ]);
    expect(parsed.spentNullifiers).toEqual([
      {
        programId,
        nullifier: hexByte(2),
        nullifierIndex: 0,
        txSignature: "signature-1",
        instructionIndex: 0,
        slot: 123n,
        spentAt: new Date(1_781_800_000 * 1000),
      },
      {
        programId,
        nullifier: hexByte(3),
        nullifierIndex: 1,
        txSignature: "signature-1",
        instructionIndex: 0,
        slot: 123n,
        spentAt: new Date(1_781_800_000 * 1000),
      },
    ]);
  });
});
