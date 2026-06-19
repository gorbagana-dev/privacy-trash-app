import { Hono } from "hono";

import { errorResponse, successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";

type CheckStatus = "ok" | "error";

type HealthCheck = {
  status: CheckStatus;
  latencyMs: number | null;
};

async function runCheck(check: () => Promise<unknown>): Promise<HealthCheck> {
  const startedAt = Date.now();

  try {
    await check();
    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "error",
      latencyMs: null,
    };
  }
}

export function createHealthRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.get("/health", async (ctx) => {
    const db = await runCheck(() => deps.database.ping());
    const status = db.status === "ok" ? "healthy" : "degraded";
    const data = {
      service: "privacy-trash-backend",
      status,
      checkedAt: new Date().toISOString(),
      checks: {
        db,
      },
    };

    if (status === "healthy") {
      return successResponse(ctx, data);
    }

    return errorResponse(ctx, 503, "service_unavailable", "Service is degraded.", data);
  });

  return app;
}
