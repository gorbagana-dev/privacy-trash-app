import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "@/api/errors";
import { successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";

const discoverQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const processQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function createIndexerRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.post("/discover", async (ctx) => {
    const query = discoverQuerySchema.safeParse({
      limit: ctx.req.query("limit"),
    });
    if (!query.success) {
      throw new AppError({
        status: 400,
        code: "bad_request",
        message: "Invalid indexer discovery request.",
        details: z.treeifyError(query.error),
      });
    }

    const result = await deps.indexerService.discoverSignatures(query.data);

    return successResponse(ctx, result);
  });

  app.post("/process", async (ctx) => {
    const query = processQuerySchema.safeParse({
      limit: ctx.req.query("limit"),
    });
    if (!query.success) {
      throw new AppError({
        status: 400,
        code: "bad_request",
        message: "Invalid indexer processing request.",
        details: z.treeifyError(query.error),
      });
    }

    const result = await deps.indexerService.processSignatures(query.data);

    return successResponse(ctx, result);
  });

  return app;
}
