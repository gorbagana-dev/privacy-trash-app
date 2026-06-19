import { describe, expect, it, vi } from "vitest";

import { createIndexerWorker } from "@/modules/indexer/indexer.worker";
import type { IndexerService } from "@/modules/indexer/indexer.service";
import type { Logger } from "@/logging/logger";

function createLogger(): Logger {
  return {
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;
}

function createIndexerService(input: Partial<IndexerService> = {}): IndexerService {
  return {
    discoverSignatures:
      input.discoverSignatures ??
      vi.fn(async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        discovered: 0,
        inserted: 0,
        highWatermarkSignature: null,
        highWatermarkSlot: null,
      })),
    processSignatures:
      input.processSignatures ??
      vi.fn(async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        claimed: 0,
        processed: 0,
        skipped: 0,
        outputsInserted: 0,
        rootsInserted: 0,
        nullifiersInserted: 0,
        failedTransient: 0,
        failedTerminal: 0,
      })),
  };
}

describe("indexer worker", () => {
  it("discovers and processes program signatures in one tick", async () => {
    const logger = createLogger();
    const indexerService = createIndexerService({
      discoverSignatures: vi.fn(async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        discovered: 2,
        inserted: 2,
        highWatermarkSignature: "signature-2",
        highWatermarkSlot: "456",
      })),
      processSignatures: vi.fn(async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        claimed: 2,
        processed: 2,
        skipped: 0,
        outputsInserted: 4,
        rootsInserted: 1,
        nullifiersInserted: 4,
        failedTransient: 0,
        failedTerminal: 0,
      })),
    });
    const worker = createIndexerWorker({
      discoverLimit: 100,
      indexerService,
      logger,
      pollIntervalMs: 5_000,
      processLimit: 20,
    });

    await worker.runOnce();

    expect(indexerService.discoverSignatures).toHaveBeenCalledWith({ limit: 100 });
    expect(indexerService.processSignatures).toHaveBeenCalledWith({ limit: 20 });
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it("does not run overlapping ticks", async () => {
    let releaseDiscovery!: () => void;
    const discovery = new Promise<void>((resolve) => {
      releaseDiscovery = resolve;
    });
    const indexerService = createIndexerService({
      discoverSignatures: vi.fn(async () => {
        await discovery;

        return {
          programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
          discovered: 0,
          inserted: 0,
          highWatermarkSignature: null,
          highWatermarkSlot: null,
        };
      }),
    });
    const worker = createIndexerWorker({
      discoverLimit: 100,
      indexerService,
      logger: createLogger(),
      pollIntervalMs: 5_000,
      processLimit: 20,
    });
    const firstRun = worker.runOnce();
    const secondRun = worker.runOnce();

    releaseDiscovery();
    await Promise.all([firstRun, secondRun]);

    expect(indexerService.discoverSignatures).toHaveBeenCalledOnce();
  });

  it("logs tick failures without throwing", async () => {
    const logger = createLogger();
    const indexerService = createIndexerService({
      discoverSignatures: vi.fn(async () => {
        throw new Error("rpc unavailable");
      }),
    });
    const worker = createIndexerWorker({
      discoverLimit: 100,
      indexerService,
      logger,
      pollIntervalMs: 5_000,
      processLimit: 20,
    });

    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
