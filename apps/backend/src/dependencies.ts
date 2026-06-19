import { loadEnv, type Env } from "@/config/env";
import { createDatabase, type DatabaseClient } from "@/db/client";
import { createLogger, type Logger } from "@/logging/logger";
import { createChainRepository } from "@/modules/chain/chain.repository";
import { createIndexerRepository } from "@/modules/indexer/indexer.repository";
import { createIndexerService, type IndexerService } from "@/modules/indexer/indexer.service";
import { createMerkleService, type MerkleService } from "@/modules/merkle/merkle.service";
import { createPoolRepository } from "@/modules/pool/pool.repository";
import { createPoolService, type PoolService } from "@/modules/pool/pool.service";

export type Dependencies = {
  env: Env;
  logger: Logger;
  database: DatabaseClient;
  indexerService: IndexerService;
  merkleService: MerkleService;
  poolService: PoolService;
  close(): Promise<void>;
};

export type CreateDependenciesOptions = {
  logger?: Logger;
  database?: DatabaseClient;
  indexerService?: IndexerService;
  merkleService?: MerkleService;
  poolService?: PoolService;
};

export function createDependencies(
  values: Record<string, string | undefined> = process.env,
  options: CreateDependenciesOptions = {},
): Dependencies {
  const env = loadEnv(values);
  const logger = options.logger ?? createLogger(env);
  const database =
    options.database ??
    createDatabase({
      databaseUrl: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      logQueries: env.DRIZZLE_LOG_QUERIES,
    });
  const chainRepository = createChainRepository({
    rpcUrl: env.GORBAGANA_RPC_URL,
  });
  const indexerRepository = createIndexerRepository(database.db);
  const poolRepository = createPoolRepository(database.db);
  const poolService =
    options.poolService ??
    createPoolService({
      programId: env.PRIVACY_TRASH_PROGRAM_ADDRESS,
      poolRepository,
    });
  const merkleService =
    options.merkleService ??
    createMerkleService({
      programId: env.PRIVACY_TRASH_PROGRAM_ADDRESS,
      poolRepository,
    });
  const indexerService =
    options.indexerService ??
    createIndexerService({
      programId: env.PRIVACY_TRASH_PROGRAM_ADDRESS,
      chainRepository,
      indexerRepository,
      poolRepository,
    });

  return {
    env,
    logger,
    database,
    indexerService,
    merkleService,
    poolService,
    async close() {
      if (!options.database) {
        await database.close();
      }
    },
  };
}
