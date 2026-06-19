import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { indexerSignatures, indexerState } from "@/db/schema";

export type IndexerState = {
  programId: string;
  highWatermarkSignature: string | null;
  highWatermarkSlot: bigint | null;
  lowWatermarkSlot: bigint | null;
  updatedAt: Date;
};

export type InsertIndexerSignature = {
  signature: string;
  programId: string;
  slot: bigint;
  blockTime: Date | null;
};

export type IndexerWorkItem = {
  signature: string;
  programId: string;
  slot: bigint;
  blockTime: Date | null;
  attempts: number;
};

export type UpsertIndexerStateInput = {
  programId: string;
  highWatermarkSignature: string;
  highWatermarkSlot: bigint;
  updatedAt: Date;
};

export type IndexerRepository = {
  findState(programId: string): Promise<IndexerState | null>;
  insertSignatures(rows: InsertIndexerSignature[]): Promise<number>;
  upsertState(input: UpsertIndexerStateInput): Promise<void>;
  claimPendingSignatures(programId: string, limit: number): Promise<IndexerWorkItem[]>;
  markDone(signature: string): Promise<void>;
  markFailedTransient(signature: string, error: string): Promise<void>;
  markFailedTerminal(signature: string, error: string): Promise<void>;
};

type RawIndexerWorkItem = {
  signature: string;
  programId: string;
  slot: bigint | string;
  blockTime: Date | string | null;
  attempts: number;
};

type QueryResultRows<T> = {
  rows: T[];
};

function getQueryRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as QueryResultRows<T>).rows)
  ) {
    return (result as QueryResultRows<T>).rows;
  }

  return [];
}

function mapWorkItem(row: RawIndexerWorkItem): IndexerWorkItem {
  return {
    signature: row.signature,
    programId: row.programId,
    slot: typeof row.slot === "bigint" ? row.slot : BigInt(row.slot),
    blockTime: row.blockTime == null ? null : new Date(row.blockTime),
    attempts: row.attempts,
  };
}

export function createIndexerRepository(db: Database): IndexerRepository {
  return {
    async findState(programId) {
      const [row] = await db
        .select()
        .from(indexerState)
        .where(eq(indexerState.programId, programId))
        .limit(1);

      return row ?? null;
    },

    async insertSignatures(rows) {
      if (rows.length === 0) return 0;

      const inserted = await db
        .insert(indexerSignatures)
        .values(rows)
        .onConflictDoNothing()
        .returning({ signature: indexerSignatures.signature });

      return inserted.length;
    },

    async upsertState(input) {
      await db
        .insert(indexerState)
        .values(input)
        .onConflictDoUpdate({
          target: indexerState.programId,
          set: {
            highWatermarkSignature: input.highWatermarkSignature,
            highWatermarkSlot: input.highWatermarkSlot,
            updatedAt: input.updatedAt,
          },
        });
    },

    async claimPendingSignatures(programId, limit) {
      const rows = await db.execute(sql`
        WITH next_batch AS (
          SELECT signature
          FROM ${indexerSignatures}
          WHERE ${indexerSignatures.programId} = ${programId}
            AND ${indexerSignatures.status} IN ('pending', 'failed_transient')
          ORDER BY ${indexerSignatures.slot} ASC, ${indexerSignatures.signature} ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ${indexerSignatures}
        SET status = 'processing',
            attempts = ${indexerSignatures.attempts} + 1,
            last_error = NULL
        FROM next_batch
        WHERE ${indexerSignatures.signature} = next_batch.signature
        RETURNING
          ${indexerSignatures.signature} AS signature,
          ${indexerSignatures.programId} AS "programId",
          ${indexerSignatures.slot} AS slot,
          ${indexerSignatures.blockTime} AS "blockTime",
          ${indexerSignatures.attempts} AS attempts
      `);

      return getQueryRows<RawIndexerWorkItem>(rows).map(mapWorkItem);
    },

    async markDone(signature) {
      await db
        .update(indexerSignatures)
        .set({
          status: "done",
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(indexerSignatures.signature, signature));
    },

    async markFailedTransient(signature, error) {
      await db
        .update(indexerSignatures)
        .set({
          status: "failed_transient",
          lastError: error,
        })
        .where(eq(indexerSignatures.signature, signature));
    },

    async markFailedTerminal(signature, error) {
      await db
        .update(indexerSignatures)
        .set({
          status: "failed_terminal",
          processedAt: new Date(),
          lastError: error,
        })
        .where(eq(indexerSignatures.signature, signature));
    },
  };
}
