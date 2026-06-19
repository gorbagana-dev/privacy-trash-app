import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "@/api/errors";
import { successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";
import { MERKLE_TREE_HEIGHT } from "@/modules/merkle/merkle.tree";

const listOutputsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  afterIndex: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value))
    .optional(),
});

const listRootsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const nullifierSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase());

const outputIndexSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!/^\d+$/.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Expected an unsigned decimal output index.",
      });
      return z.NEVER;
    }

    const outputIndex = BigInt(value);
    if (outputIndex >= BigInt(2 ** MERKLE_TREE_HEIGHT)) {
      context.addIssue({
        code: "custom",
        message: "Output index exceeds tree capacity.",
      });
      return z.NEVER;
    }

    return outputIndex;
  });

function badRequest(message: string, details: unknown): AppError {
  return new AppError({
    status: 400,
    code: "bad_request",
    message,
    details,
  });
}

export function createPoolRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.get("/status", async (ctx) => {
    const result = await deps.poolService.getStatus();

    return successResponse(ctx, result);
  });

  app.get("/outputs", async (ctx) => {
    const query = listOutputsQuerySchema.safeParse({
      limit: ctx.req.query("limit"),
      afterIndex: ctx.req.query("afterIndex"),
    });
    if (!query.success) {
      throw badRequest("Invalid pool outputs request.", z.treeifyError(query.error));
    }

    const result = await deps.poolService.listOutputs(query.data);

    return successResponse(ctx, result);
  });

  app.get("/roots", async (ctx) => {
    const query = listRootsQuerySchema.safeParse({
      limit: ctx.req.query("limit"),
    });
    if (!query.success) {
      throw badRequest("Invalid pool roots request.", z.treeifyError(query.error));
    }

    const result = await deps.poolService.listRoots(query.data);

    return successResponse(ctx, result);
  });

  app.get("/merkle-path/:outputIndex", async (ctx) => {
    const outputIndex = outputIndexSchema.safeParse(ctx.req.param("outputIndex"));
    if (!outputIndex.success) {
      throw badRequest("Invalid output index.", z.treeifyError(outputIndex.error));
    }

    const result = await deps.merkleService.getPath(outputIndex.data);
    if (!result) {
      throw new AppError({
        status: 404,
        code: "not_found",
        message: "Output index was not found in the indexed pool tree.",
      });
    }

    return successResponse(ctx, result);
  });

  app.get("/nullifiers/:nullifier", async (ctx) => {
    const nullifier = nullifierSchema.safeParse(ctx.req.param("nullifier"));
    if (!nullifier.success) {
      throw badRequest("Invalid nullifier.", z.treeifyError(nullifier.error));
    }

    const result = await deps.poolService.getNullifierStatus(nullifier.data);

    return successResponse(ctx, result);
  });

  return app;
}
