import { describe, expect, it, vi } from "vitest";

import type { PoolRepository } from "@/modules/pool/pool.repository";
import { createPoolService } from "@/modules/pool/pool.service";

function createPoolRepository(): PoolRepository {
  return {
    insertOutputs: vi.fn(),
    insertObservedRoots: vi.fn(),
    insertSpentNullifiers: vi.fn(),
    listOutputs: vi.fn(async () => []),
    listOutputRange: vi.fn(async () => []),
    listOutputsForTree: vi.fn(async () => []),
    findOutputByEncryptedOutput: vi.fn(async () => null),
    findOutputsByCommitments: vi.fn(async () => []),
    listObservedRoots: vi.fn(async () => []),
    findSpentNullifier: vi.fn(async () => null),
    getStatus: vi.fn(async () => ({
      outputCount: 0,
      spentNullifierCount: 0,
      observedRootCount: 0,
      latestOutputIndex: null,
      latestSlot: null,
    })),
  };
}

function outputRow(outputIndex: bigint, encryptedOutput: string, commitment = "a".repeat(64)) {
  return {
    id: Number(outputIndex) + 1,
    programId: "program-1",
    outputIndex,
    commitment,
    encryptedOutput,
    txSignature: `signature-${outputIndex}`,
    instructionIndex: 1,
    logIndex: Number(outputIndex) + 8,
    slot: 66920165n,
    blockTime: new Date("2026-06-16T15:33:33.000Z"),
    createdAt: new Date("2026-06-18T00:00:00.000Z"),
  };
}

describe("createPoolService", () => {
  it("maps outputs into JSON-safe DTOs", async () => {
    const repository = createPoolRepository();
    repository.listOutputs = vi.fn(async () => [
      {
        id: 1,
        programId: "program-1",
        outputIndex: 2n,
        commitment: "a".repeat(64),
        encryptedOutput: "ZW5jcnlwdGVk",
        txSignature: "signature-1",
        instructionIndex: 1,
        logIndex: 8,
        slot: 66920165n,
        blockTime: new Date("2026-06-16T15:33:33.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
      },
    ]);
    const service = createPoolService({
      programId: "program-1",
      poolRepository: repository,
    });

    const result = await service.listOutputs({ limit: 1, afterIndex: 1n });

    expect(repository.listOutputs).toHaveBeenCalledWith({
      programId: "program-1",
      limit: 1,
      afterIndex: 1n,
    });
    expect(result).toEqual({
      outputs: [
        {
          outputIndex: "2",
          commitment: "a".repeat(64),
          encryptedOutput: "ZW5jcnlwdGVk",
          txSignature: "signature-1",
          instructionIndex: 1,
          logIndex: 8,
          slot: "66920165",
          blockTime: "2026-06-16T15:33:33.000Z",
        },
      ],
    });
  });

  it("returns encrypted output ranges with total and hasMore", async () => {
    const repository = createPoolRepository();
    repository.listOutputRange = vi.fn(async () => [
      outputRow(0n, "ZW5jcnlwdGVkLTE="),
      outputRow(1n, "ZW5jcnlwdGVkLTI="),
    ]);
    repository.getStatus = vi.fn(async () => ({
      outputCount: 4,
      spentNullifierCount: 0,
      observedRootCount: 0,
      latestOutputIndex: "3",
      latestSlot: "66920165",
    }));
    const service = createPoolService({
      programId: "program-1",
      poolRepository: repository,
    });

    const result = await service.getOutputRange({ start: 0n, end: 2n });

    expect(repository.listOutputRange).toHaveBeenCalledWith({
      programId: "program-1",
      start: 0n,
      end: 2n,
    });
    expect(result).toEqual({
      total: 4,
      hasMore: true,
      encryptedOutputs: ["ZW5jcnlwdGVkLTE=", "ZW5jcnlwdGVkLTI="],
    });
  });

  it("checks encrypted output existence", async () => {
    const repository = createPoolRepository();
    repository.findOutputByEncryptedOutput = vi.fn(async () =>
      outputRow(0n, "ZW5jcnlwdGVk"),
    );
    const service = createPoolService({
      programId: "program-1",
      poolRepository: repository,
    });

    const result = await service.checkEncryptedOutput("ZW5jcnlwdGVk");

    expect(repository.findOutputByEncryptedOutput).toHaveBeenCalledWith({
      programId: "program-1",
      encryptedOutput: "ZW5jcnlwdGVk",
    });
    expect(result).toEqual({
      exists: true,
    });
  });

  it("maps commitment lookups back to request order", async () => {
    const repository = createPoolRepository();
    repository.findOutputsByCommitments = vi.fn(async () => [
      outputRow(2n, "ZW5jcnlwdGVk", "b".repeat(64)),
    ]);
    const service = createPoolService({
      programId: "program-1",
      poolRepository: repository,
    });

    const result = await service.getOutputIndicesByCommitments(["a".repeat(64), "B".repeat(64)]);

    expect(repository.findOutputsByCommitments).toHaveBeenCalledWith({
      programId: "program-1",
      commitments: ["a".repeat(64), "b".repeat(64)],
    });
    expect(result).toEqual({
      indices: [-1, 2],
    });
  });

  it("maps unspent nullifiers without leaking table fields", async () => {
    const repository = createPoolRepository();
    const service = createPoolService({
      programId: "program-1",
      poolRepository: repository,
    });

    const result = await service.getNullifierStatus("a".repeat(64));

    expect(result).toEqual({
      spent: false,
      nullifier: "a".repeat(64),
      txSignature: null,
      instructionIndex: null,
      slot: null,
      spentAt: null,
    });
  });
});
