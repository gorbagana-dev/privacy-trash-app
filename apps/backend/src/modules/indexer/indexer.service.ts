import type { ChainRepository, ProgramSignature } from "@/modules/chain/chain.repository";
import type { IndexerRepository, IndexerWorkItem } from "@/modules/indexer/indexer.repository";
import type { PoolRepository } from "@/modules/pool/pool.repository";
import { parsePoolTransaction } from "@/modules/pool/pool.parser";

const defaultDiscoveryLimit = 100;
const defaultProcessingLimit = 10;
const maxDiscoveryLimit = 1000;
const maxProcessingLimit = 100;
const maxProcessingAttempts = 5;

export type DiscoverSignaturesInput = {
  limit?: number | undefined;
};

export type DiscoverSignaturesResult = {
  programId: string;
  discovered: number;
  inserted: number;
  highWatermarkSignature: string | null;
  highWatermarkSlot: string | null;
};

export type ProcessSignaturesInput = {
  limit?: number | undefined;
};

export type ProcessSignaturesResult = {
  programId: string;
  claimed: number;
  processed: number;
  skipped: number;
  outputsInserted: number;
  rootsInserted: number;
  nullifiersInserted: number;
  failedTransient: number;
  failedTerminal: number;
};

export type IndexerService = {
  discoverSignatures(input?: DiscoverSignaturesInput): Promise<DiscoverSignaturesResult>;
  processSignatures(input?: ProcessSignaturesInput): Promise<ProcessSignaturesResult>;
};

export type CreateIndexerServiceInput = {
  programId: string;
  chainRepository: ChainRepository;
  indexerRepository: IndexerRepository;
  poolRepository: PoolRepository;
  now?: (() => Date) | undefined;
};

function resolveLimit(input: {
  limit: number | undefined;
  defaultLimit: number;
  maxLimit: number;
}): number {
  const { limit, defaultLimit, maxLimit } = input;
  if (limit === undefined) return defaultLimit;
  return Math.min(limit, maxLimit);
}

function newestSignature(signatures: readonly ProgramSignature[]): ProgramSignature | null {
  return signatures[0] ?? null;
}

export function createIndexerService(input: CreateIndexerServiceInput): IndexerService {
  const now = input.now ?? (() => new Date());

  async function markProcessingFailure(
    item: IndexerWorkItem,
    error: unknown,
    counts: Pick<ProcessSignaturesResult, "failedTerminal" | "failedTransient">,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    if (item.attempts >= maxProcessingAttempts) {
      await input.indexerRepository.markFailedTerminal(item.signature, message);
      counts.failedTerminal += 1;
      return;
    }

    await input.indexerRepository.markFailedTransient(item.signature, message);
    counts.failedTransient += 1;
  }

  return {
    async discoverSignatures(request = {}) {
      const state = await input.indexerRepository.findState(input.programId);
      const signatures = await input.chainRepository.getSignaturesForAddress({
        address: input.programId,
        limit: resolveLimit({
          limit: request.limit,
          defaultLimit: defaultDiscoveryLimit,
          maxLimit: maxDiscoveryLimit,
        }),
        until: state?.highWatermarkSignature ?? undefined,
      });
      const inserted = await input.indexerRepository.insertSignatures(
        signatures.map((signature) => ({
          signature: signature.signature,
          programId: input.programId,
          slot: signature.slot,
          blockTime: signature.blockTime,
        })),
      );
      const newest = newestSignature(signatures);

      if (newest) {
        await input.indexerRepository.upsertState({
          programId: input.programId,
          highWatermarkSignature: newest.signature,
          highWatermarkSlot: newest.slot,
          updatedAt: now(),
        });
      }

      return {
        programId: input.programId,
        discovered: signatures.length,
        inserted,
        highWatermarkSignature:
          newest?.signature ?? state?.highWatermarkSignature ?? null,
        highWatermarkSlot:
          newest?.slot.toString() ?? state?.highWatermarkSlot?.toString() ?? null,
      };
    },

    async processSignatures(request = {}) {
      const claimed = await input.indexerRepository.claimPendingSignatures(
        input.programId,
        resolveLimit({
          limit: request.limit,
          defaultLimit: defaultProcessingLimit,
          maxLimit: maxProcessingLimit,
        }),
      );
      const result: ProcessSignaturesResult = {
        programId: input.programId,
        claimed: claimed.length,
        processed: 0,
        skipped: 0,
        outputsInserted: 0,
        rootsInserted: 0,
        nullifiersInserted: 0,
        failedTransient: 0,
        failedTerminal: 0,
      };

      for (const item of claimed) {
        try {
          const transaction = await input.chainRepository.getTransaction(item.signature);

          if (!transaction) {
            throw new Error("Transaction was not found at finalized commitment.");
          }

          if (transaction.meta?.err != null) {
            await input.indexerRepository.markDone(item.signature);
            result.skipped += 1;
            continue;
          }

          const parsed = parsePoolTransaction({
            programId: input.programId,
            signature: item.signature,
            transaction,
            fallbackBlockTime: item.blockTime,
          });

          const [outputsInserted, rootsInserted, nullifiersInserted] = await Promise.all([
            input.poolRepository.insertOutputs(parsed.outputs),
            input.poolRepository.insertObservedRoots(parsed.observedRoots),
            input.poolRepository.insertSpentNullifiers(parsed.spentNullifiers),
          ]);

          await input.indexerRepository.markDone(item.signature);
          result.processed += 1;
          result.outputsInserted += outputsInserted;
          result.rootsInserted += rootsInserted;
          result.nullifiersInserted += nullifiersInserted;
        } catch (error) {
          await markProcessingFailure(item, error, result);
        }
      }

      return result;
    },
  };
}
