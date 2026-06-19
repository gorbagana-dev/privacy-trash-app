import { and, asc, count, desc, eq, gt, inArray, gte, lt, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { poolObservedRoots, poolOutputs, spentNullifiers } from "@/db/schema";
import type {
  ParsedObservedRoot,
  ParsedPoolOutput,
  ParsedSpentNullifier,
} from "@/modules/pool/pool.parser";

export type PoolOutputRow = typeof poolOutputs.$inferSelect;
export type PoolObservedRootRow = typeof poolObservedRoots.$inferSelect;
export type SpentNullifierRow = typeof spentNullifiers.$inferSelect;

export type ListPoolOutputsInput = {
  programId: string;
  limit: number;
  afterIndex?: bigint | undefined;
};

export type ListOutputRangeInput = {
  programId: string;
  start: bigint;
  end: bigint;
};

export type ListPoolObservedRootsInput = {
  programId: string;
  limit: number;
};

export type FindOutputByEncryptedOutputInput = {
  programId: string;
  encryptedOutput: string;
};

export type FindOutputsByCommitmentsInput = {
  programId: string;
  commitments: string[];
};

export type FindSpentNullifierInput = {
  programId: string;
  nullifier: string;
};

export type PoolStatusRow = {
  outputCount: number;
  spentNullifierCount: number;
  observedRootCount: number;
  latestOutputIndex: string | null;
  latestSlot: string | null;
};

export type PoolRepository = {
  insertOutputs(rows: ParsedPoolOutput[]): Promise<number>;
  insertObservedRoots(rows: ParsedObservedRoot[]): Promise<number>;
  insertSpentNullifiers(rows: ParsedSpentNullifier[]): Promise<number>;
  listOutputs(input: ListPoolOutputsInput): Promise<PoolOutputRow[]>;
  listOutputRange(input: ListOutputRangeInput): Promise<PoolOutputRow[]>;
  listOutputsForTree(programId: string): Promise<PoolOutputRow[]>;
  findOutputByEncryptedOutput(input: FindOutputByEncryptedOutputInput): Promise<PoolOutputRow | null>;
  findOutputsByCommitments(input: FindOutputsByCommitmentsInput): Promise<PoolOutputRow[]>;
  listObservedRoots(input: ListPoolObservedRootsInput): Promise<PoolObservedRootRow[]>;
  findSpentNullifier(input: FindSpentNullifierInput): Promise<SpentNullifierRow | null>;
  getStatus(programId: string): Promise<PoolStatusRow>;
};

export function createPoolRepository(db: Database): PoolRepository {
  return {
    async insertOutputs(rows) {
      if (rows.length === 0) return 0;

      const inserted = await db
        .insert(poolOutputs)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: poolOutputs.id });

      return inserted.length;
    },

    async insertObservedRoots(rows) {
      if (rows.length === 0) return 0;

      const inserted = await db
        .insert(poolObservedRoots)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: poolObservedRoots.id });

      return inserted.length;
    },

    async insertSpentNullifiers(rows) {
      if (rows.length === 0) return 0;

      const inserted = await db
        .insert(spentNullifiers)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: spentNullifiers.id });

      return inserted.length;
    },

    async listOutputs(input) {
      const where =
        input.afterIndex === undefined
          ? eq(poolOutputs.programId, input.programId)
          : and(eq(poolOutputs.programId, input.programId), gt(poolOutputs.outputIndex, input.afterIndex));

      return await db
        .select()
        .from(poolOutputs)
        .where(where)
        .orderBy(asc(poolOutputs.outputIndex))
        .limit(input.limit);
    },

    async listOutputRange(input) {
      return await db
        .select()
        .from(poolOutputs)
        .where(
          and(
            eq(poolOutputs.programId, input.programId),
            gte(poolOutputs.outputIndex, input.start),
            lt(poolOutputs.outputIndex, input.end),
          ),
        )
        .orderBy(asc(poolOutputs.outputIndex));
    },

    async listOutputsForTree(programId) {
      return await db
        .select()
        .from(poolOutputs)
        .where(eq(poolOutputs.programId, programId))
        .orderBy(asc(poolOutputs.outputIndex));
    },

    async findOutputByEncryptedOutput(input) {
      const [row] = await db
        .select()
        .from(poolOutputs)
        .where(
          and(
            eq(poolOutputs.programId, input.programId),
            eq(poolOutputs.encryptedOutput, input.encryptedOutput),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async findOutputsByCommitments(input) {
      if (input.commitments.length === 0) return [];

      return await db
        .select()
        .from(poolOutputs)
        .where(
          and(
            eq(poolOutputs.programId, input.programId),
            inArray(poolOutputs.commitment, input.commitments),
          ),
        )
        .orderBy(asc(poolOutputs.outputIndex));
    },

    async listObservedRoots(input) {
      return await db
        .select()
        .from(poolObservedRoots)
        .where(eq(poolObservedRoots.programId, input.programId))
        .orderBy(desc(poolObservedRoots.slot), desc(poolObservedRoots.id))
        .limit(input.limit);
    },

    async findSpentNullifier(input) {
      const [row] = await db
        .select()
        .from(spentNullifiers)
        .where(
          and(
            eq(spentNullifiers.programId, input.programId),
            eq(spentNullifiers.nullifier, input.nullifier),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async getStatus(programId) {
      const [outputStats, nullifierStats, rootStats] = await Promise.all([
        db
          .select({
            outputCount: count(),
            latestOutputIndex: sql<string | null>`max(${poolOutputs.outputIndex})::text`,
            latestSlot: sql<string | null>`max(${poolOutputs.slot})::text`,
          })
          .from(poolOutputs)
          .where(eq(poolOutputs.programId, programId)),
        db
          .select({
            spentNullifierCount: count(),
          })
          .from(spentNullifiers)
          .where(eq(spentNullifiers.programId, programId)),
        db
          .select({
            observedRootCount: count(),
          })
          .from(poolObservedRoots)
          .where(eq(poolObservedRoots.programId, programId)),
      ]);

      return {
        outputCount: outputStats[0]?.outputCount ?? 0,
        spentNullifierCount: nullifierStats[0]?.spentNullifierCount ?? 0,
        observedRootCount: rootStats[0]?.observedRootCount ?? 0,
        latestOutputIndex: outputStats[0]?.latestOutputIndex ?? null,
        latestSlot: outputStats[0]?.latestSlot ?? null,
      };
    },
  };
}
