import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "@/api/errors";
import { successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";

const maxOutputRange = 20_000;
const maxCommitmentIndexLookups = 100;
const maxProofCommitments = 2;

const base64Schema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;

    try {
      return Buffer.from(value, "base64").toString("base64") === value;
    } catch {
      return false;
    }
  }, "Expected base64-encoded bytes.");

const commitmentFieldSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value),
    "Expected a decimal field element or 32-byte hex commitment.",
  );

const rangeQuerySchema = z
  .object({
    start: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    end: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .refine((value) => value.end >= value.start, {
    message: "end must be greater than or equal to start.",
    path: ["end"],
  })
  .refine((value) => value.end - value.start <= maxOutputRange, {
    message: `Output range cannot exceed ${maxOutputRange}.`,
    path: ["end"],
  })
  .transform((value) => ({
    start: BigInt(value.start),
    end: BigInt(value.end),
  }));

const commitmentsQuerySchema = z.object({
  commitments: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(commitmentFieldSchema).min(1).max(maxCommitmentIndexLookups)),
});

const proofQuerySchema = z.object({
  commitments: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(commitmentFieldSchema).min(1).max(maxProofCommitments)),
});

function badRequest(message: string, details: unknown): AppError {
  return new AppError({
    status: 400,
    code: "bad_request",
    message,
    details,
  });
}

function parseEncryptedOutput(input: unknown): string {
  const encryptedOutput = base64Schema.safeParse(input);
  if (!encryptedOutput.success) {
    throw badRequest("Invalid encrypted output.", z.treeifyError(encryptedOutput.error));
  }

  return encryptedOutput.data;
}

export function createClientRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.get("/outputs/range", async (ctx) => {
    const query = rangeQuerySchema.safeParse({
      start: ctx.req.query("start"),
      end: ctx.req.query("end"),
    });
    if (!query.success) {
      throw badRequest("Invalid output range request.", z.treeifyError(query.error));
    }

    return successResponse(ctx, await deps.poolService.getOutputRange(query.data));
  });

  app.get("/outputs/check", async (ctx) => {
    const encryptedOutput = parseEncryptedOutput(ctx.req.query("encryptedOutput"));

    return successResponse(ctx, await deps.poolService.checkEncryptedOutput(encryptedOutput));
  });

  app.get("/outputs/check/:encryptedOutput", async (ctx) => {
    const encryptedOutput = parseEncryptedOutput(ctx.req.param("encryptedOutput"));

    return successResponse(ctx, await deps.poolService.checkEncryptedOutput(encryptedOutput));
  });

  app.get("/outputs/indices", async (ctx) => {
    const query = commitmentsQuerySchema.safeParse({
      commitments: ctx.req.query("commitments"),
    });
    if (!query.success) {
      throw badRequest("Invalid output index request.", z.treeifyError(query.error));
    }

    return successResponse(
      ctx,
      await deps.poolService.getOutputIndicesByCommitments(query.data.commitments),
    );
  });

  app.get("/merkle/proof", async (ctx) => {
    const query = proofQuerySchema.safeParse({
      commitments: ctx.req.query("commitments"),
    });
    if (!query.success) {
      throw badRequest("Invalid Merkle proof request.", z.treeifyError(query.error));
    }

    return successResponse(ctx, await deps.merkleService.getProofByCommitments(query.data.commitments));
  });

  app.get("/merkle/state", async (ctx) => {
    return successResponse(ctx, await deps.merkleService.getState());
  });

  return app;
}
