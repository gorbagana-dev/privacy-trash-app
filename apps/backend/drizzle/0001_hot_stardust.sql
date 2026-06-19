CREATE TABLE "pool_observed_roots" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"root" text NOT NULL,
	"source" text DEFAULT 'proof' NOT NULL,
	"tx_signature" text NOT NULL,
	"instruction_index" integer NOT NULL,
	"slot" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_outputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"output_index" bigint NOT NULL,
	"commitment" text NOT NULL,
	"encrypted_output" text NOT NULL,
	"tx_signature" text NOT NULL,
	"instruction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spent_nullifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"nullifier" text NOT NULL,
	"nullifier_index" integer NOT NULL,
	"tx_signature" text NOT NULL,
	"instruction_index" integer NOT NULL,
	"slot" bigint NOT NULL,
	"spent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pool_observed_roots_program_root_source_idx" ON "pool_observed_roots" USING btree ("program_id","root","source");--> statement-breakpoint
CREATE INDEX "pool_observed_roots_program_slot_idx" ON "pool_observed_roots" USING btree ("program_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_outputs_program_output_index_idx" ON "pool_outputs" USING btree ("program_id","output_index");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_outputs_tx_log_idx" ON "pool_outputs" USING btree ("tx_signature","log_index");--> statement-breakpoint
CREATE INDEX "pool_outputs_program_slot_idx" ON "pool_outputs" USING btree ("program_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "spent_nullifiers_program_nullifier_idx" ON "spent_nullifiers" USING btree ("program_id","nullifier");--> statement-breakpoint
CREATE INDEX "spent_nullifiers_program_slot_idx" ON "spent_nullifiers" USING btree ("program_id","slot");