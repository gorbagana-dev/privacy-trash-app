CREATE TYPE "public"."indexer_signature_status" AS ENUM('pending', 'processing', 'done', 'failed_transient', 'failed_terminal');--> statement-breakpoint
CREATE TABLE "indexer_signatures" (
	"signature" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"status" "indexer_signature_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"program_id" text PRIMARY KEY NOT NULL,
	"high_watermark_signature" text,
	"high_watermark_slot" bigint,
	"low_watermark_slot" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "indexer_signatures_program_slot_idx" ON "indexer_signatures" USING btree ("program_id","slot");--> statement-breakpoint
CREATE INDEX "indexer_signatures_status_slot_idx" ON "indexer_signatures" USING btree ("status","slot");