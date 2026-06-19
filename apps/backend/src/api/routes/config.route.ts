import { Hono } from "hono";

import { successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";

export function createConfigRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.get("/config", (ctx) =>
    successResponse(ctx, {
      cluster: "gorbagana",
      programAddress: deps.env.PRIVACY_TRASH_PROGRAM_ADDRESS,
      explorerBaseUrl: deps.env.EXPLORER_BASE_URL,
      nativeSymbol: "GOR",
    }),
  );

  return app;
}
