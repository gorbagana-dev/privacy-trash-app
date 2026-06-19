import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const indexerSignatureStatus = pgEnum("indexer_signature_status", [
  "pending",
  "processing",
  "done",
  "failed_transient",
  "failed_terminal",
]);

export const indexerState = pgTable("indexer_state", {
  programId: text("program_id").primaryKey(),
  highWatermarkSignature: text("high_watermark_signature"),
  highWatermarkSlot: bigint("high_watermark_slot", { mode: "bigint" }),
  lowWatermarkSlot: bigint("low_watermark_slot", { mode: "bigint" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const indexerSignatures = pgTable(
  "indexer_signatures",
  {
    signature: text("signature").primaryKey(),
    programId: text("program_id").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }),
    status: indexerSignatureStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("indexer_signatures_program_slot_idx").on(table.programId, table.slot),
    index("indexer_signatures_status_slot_idx").on(table.status, table.slot),
  ],
);

export const poolOutputs = pgTable(
  "pool_outputs",
  {
    id: serial("id").primaryKey(),
    programId: text("program_id").notNull(),
    outputIndex: bigint("output_index", { mode: "bigint" }).notNull(),
    commitment: text("commitment").notNull(),
    encryptedOutput: text("encrypted_output").notNull(),
    txSignature: text("tx_signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    logIndex: integer("log_index").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pool_outputs_program_output_index_idx").on(table.programId, table.outputIndex),
    uniqueIndex("pool_outputs_tx_log_idx").on(table.txSignature, table.logIndex),
    index("pool_outputs_program_slot_idx").on(table.programId, table.slot),
  ],
);

export const poolObservedRoots = pgTable(
  "pool_observed_roots",
  {
    id: serial("id").primaryKey(),
    programId: text("program_id").notNull(),
    root: text("root").notNull(),
    source: text("source").notNull().default("proof"),
    txSignature: text("tx_signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pool_observed_roots_program_root_source_idx").on(
      table.programId,
      table.root,
      table.source,
    ),
    index("pool_observed_roots_program_slot_idx").on(table.programId, table.slot),
  ],
);

export const spentNullifiers = pgTable(
  "spent_nullifiers",
  {
    id: serial("id").primaryKey(),
    programId: text("program_id").notNull(),
    nullifier: text("nullifier").notNull(),
    nullifierIndex: integer("nullifier_index").notNull(),
    txSignature: text("tx_signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spent_nullifiers_program_nullifier_idx").on(table.programId, table.nullifier),
    index("spent_nullifiers_program_slot_idx").on(table.programId, table.slot),
  ],
);
