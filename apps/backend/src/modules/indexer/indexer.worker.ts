import type { Logger } from "@/logging/logger";
import type { IndexerService } from "@/modules/indexer/indexer.service";

export type IndexerWorker = {
  runOnce(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
};

export type CreateIndexerWorkerInput = {
  discoverLimit: number;
  indexerService: IndexerService;
  logger: Logger;
  pollIntervalMs: number;
  processLimit: number;
};

export function createIndexerWorker(input: CreateIndexerWorkerInput): IndexerWorker {
  let activeRun: Promise<void> | null = null;
  let interval: NodeJS.Timeout | null = null;
  let stopped = false;

  async function runOnce(): Promise<void> {
    if (activeRun) {
      return activeRun;
    }

    activeRun = (async () => {
      try {
        const discovered = await input.indexerService.discoverSignatures({
          limit: input.discoverLimit,
        });
        const processed = await input.indexerService.processSignatures({
          limit: input.processLimit,
        });

        if (
          discovered.inserted > 0 ||
          processed.outputsInserted > 0 ||
          processed.nullifiersInserted > 0 ||
          processed.failedTerminal > 0 ||
          processed.failedTransient > 0
        ) {
          input.logger.info(
            {
              discovered,
              processed,
            },
            "Privacy Trash indexer processed program activity",
          );
        }
      } catch (error) {
        input.logger.error(
          {
            err: error,
          },
          "Privacy Trash indexer tick failed",
        );
      }
    })().finally(() => {
      activeRun = null;
    });

    return activeRun;
  }

  return {
    runOnce,
    start() {
      if (interval || stopped) {
        return;
      }

      void runOnce();
      interval = setInterval(() => {
        void runOnce();
      }, input.pollIntervalMs);
      interval.unref();
    },
    async stop() {
      stopped = true;

      if (interval) {
        clearInterval(interval);
        interval = null;
      }

      await activeRun;
    },
  };
}
