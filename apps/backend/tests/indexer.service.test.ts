import { describe, expect, it, vi } from "vitest";

import type { ChainRepository } from "@/modules/chain/chain.repository";
import type { IndexerRepository } from "@/modules/indexer/indexer.repository";
import { createIndexerService } from "@/modules/indexer/indexer.service";
import type { PoolRepository } from "@/modules/pool/pool.repository";

function createEmptyPoolRepository(): PoolRepository {
  return {
    insertOutputs: vi.fn(async () => 0),
    insertObservedRoots: vi.fn(async () => 0),
    insertSpentNullifiers: vi.fn(async () => 0),
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

describe("createIndexerService", () => {
  it("discovers new signatures and updates the high watermark", async () => {
    const chainRepository: ChainRepository = {
      getSignaturesForAddress: vi.fn(async () => [
        {
          signature: "newest-signature",
          slot: 20n,
          blockTime: new Date("2026-06-18T00:00:00.000Z"),
          err: null,
          confirmationStatus: "confirmed",
        },
        {
          signature: "older-signature",
          slot: 19n,
          blockTime: null,
          err: null,
          confirmationStatus: "confirmed",
        },
      ]),
      getTransaction: vi.fn(),
    };
    const indexerRepository: IndexerRepository = {
      findState: vi.fn(async () => ({
        programId: "program-1",
        highWatermarkSignature: "previous-signature",
        highWatermarkSlot: 18n,
        lowWatermarkSlot: null,
        updatedAt: new Date("2026-06-17T00:00:00.000Z"),
      })),
      insertSignatures: vi.fn(async () => 2),
      upsertState: vi.fn(async () => undefined),
      claimPendingSignatures: vi.fn(),
      markDone: vi.fn(),
      markFailedTransient: vi.fn(),
      markFailedTerminal: vi.fn(),
    };
    const service = createIndexerService({
      programId: "program-1",
      chainRepository,
      indexerRepository,
      poolRepository: createEmptyPoolRepository(),
      now: () => new Date("2026-06-18T01:00:00.000Z"),
    });

    const result = await service.discoverSignatures({ limit: 10 });

    expect(chainRepository.getSignaturesForAddress).toHaveBeenCalledWith({
      address: "program-1",
      limit: 10,
      until: "previous-signature",
    });
    expect(indexerRepository.insertSignatures).toHaveBeenCalledWith([
      {
        signature: "newest-signature",
        programId: "program-1",
        slot: 20n,
        blockTime: new Date("2026-06-18T00:00:00.000Z"),
      },
      {
        signature: "older-signature",
        programId: "program-1",
        slot: 19n,
        blockTime: null,
      },
    ]);
    expect(indexerRepository.upsertState).toHaveBeenCalledWith({
      programId: "program-1",
      highWatermarkSignature: "newest-signature",
      highWatermarkSlot: 20n,
      updatedAt: new Date("2026-06-18T01:00:00.000Z"),
    });
    expect(result).toEqual({
      programId: "program-1",
      discovered: 2,
      inserted: 2,
      highWatermarkSignature: "newest-signature",
      highWatermarkSlot: "20",
    });
  });

  it("keeps the existing watermark when there are no new signatures", async () => {
    const chainRepository: ChainRepository = {
      getSignaturesForAddress: vi.fn(async () => []),
      getTransaction: vi.fn(),
    };
    const indexerRepository: IndexerRepository = {
      findState: vi.fn(async () => ({
        programId: "program-1",
        highWatermarkSignature: "previous-signature",
        highWatermarkSlot: 18n,
        lowWatermarkSlot: null,
        updatedAt: new Date("2026-06-17T00:00:00.000Z"),
      })),
      insertSignatures: vi.fn(async () => 0),
      upsertState: vi.fn(async () => undefined),
      claimPendingSignatures: vi.fn(),
      markDone: vi.fn(),
      markFailedTransient: vi.fn(),
      markFailedTerminal: vi.fn(),
    };
    const service = createIndexerService({
      programId: "program-1",
      chainRepository,
      indexerRepository,
      poolRepository: createEmptyPoolRepository(),
    });

    const result = await service.discoverSignatures();

    expect(indexerRepository.upsertState).not.toHaveBeenCalled();
    expect(result).toEqual({
      programId: "program-1",
      discovered: 0,
      inserted: 0,
      highWatermarkSignature: "previous-signature",
      highWatermarkSlot: "18",
    });
  });

  it("processes claimed finalized transactions into pool tables", async () => {
    const chainRepository: ChainRepository = {
      getSignaturesForAddress: vi.fn(),
      getTransaction: vi.fn(async () => ({
        slot: 10,
        blockTime: 1_781_800_000,
        meta: {
          err: null,
          logMessages: [],
        },
        transaction: {
          message: {
            accountKeys: [],
            instructions: [],
          },
        },
      })),
    };
    const indexerRepository: IndexerRepository = {
      findState: vi.fn(),
      insertSignatures: vi.fn(),
      upsertState: vi.fn(),
      claimPendingSignatures: vi.fn(async () => [
        {
          signature: "signature-1",
          programId: "program-1",
          slot: 10n,
          blockTime: null,
          attempts: 1,
        },
      ]),
      markDone: vi.fn(async () => undefined),
      markFailedTransient: vi.fn(),
      markFailedTerminal: vi.fn(),
    };
    const poolRepository: PoolRepository = {
      insertOutputs: vi.fn(async () => 0),
      insertObservedRoots: vi.fn(async () => 0),
      insertSpentNullifiers: vi.fn(async () => 0),
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
    const service = createIndexerService({
      programId: "program-1",
      chainRepository,
      indexerRepository,
      poolRepository,
    });

    const result = await service.processSignatures({ limit: 1 });

    expect(indexerRepository.claimPendingSignatures).toHaveBeenCalledWith("program-1", 1);
    expect(chainRepository.getTransaction).toHaveBeenCalledWith("signature-1");
    expect(poolRepository.insertOutputs).toHaveBeenCalledWith([]);
    expect(poolRepository.insertObservedRoots).toHaveBeenCalledWith([]);
    expect(poolRepository.insertSpentNullifiers).toHaveBeenCalledWith([]);
    expect(indexerRepository.markDone).toHaveBeenCalledWith("signature-1");
    expect(result).toEqual({
      programId: "program-1",
      claimed: 1,
      processed: 1,
      skipped: 0,
      outputsInserted: 0,
      rootsInserted: 0,
      nullifiersInserted: 0,
      failedTransient: 0,
      failedTerminal: 0,
    });
  });
});
