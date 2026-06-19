import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseClient = {
  db: Database;
  ping(): Promise<void>;
  close(): Promise<void>;
};

export type CreateDatabaseInput = {
  databaseUrl: string;
  poolMax: number;
  logQueries: boolean;
};

export function createDatabase(input: CreateDatabaseInput): DatabaseClient {
  const pool = new Pool({
    connectionString: input.databaseUrl,
    max: input.poolMax,
  });
  const db = drizzle(pool, {
    schema,
    logger: input.logQueries,
  });

  return {
    db,
    async ping() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
