import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import { createErrorHandler, notFoundHandler } from "@/api/errors";
import { createClientRoutes } from "@/api/routes/client.route";
import { createConfigRoutes } from "@/api/routes/config.route";
import { createHealthRoutes } from "@/api/routes/health.route";
import { createIndexerRoutes } from "@/api/routes/indexer.route";
import { createPoolRoutes } from "@/api/routes/pool.route";
import { createRelayerRoutes } from "@/api/routes/relayer.route";
import type { Dependencies } from "@/dependencies";

const corsExposeHeaders = ["X-Request-Id"];

function createCorsMiddleware(allowedOrigins: readonly string[]) {
  return cors({
    origin: (origin) => {
      if (allowedOrigins.includes("*")) return origin;
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: corsExposeHeaders,
    maxAge: 600,
  });
}

export function createApp(deps: Dependencies): Hono {
  const app = new Hono();

  app.onError(createErrorHandler(deps));

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", createCorsMiddleware(deps.env.CORS_ALLOWED_ORIGINS));
  app.use("*", timeout(30_000));
  app.use(
    "*",
    bodyLimit({
      maxSize: deps.env.API_BODY_LIMIT_BYTES,
    }),
  );

  app.route("/", createHealthRoutes(deps));
  app.route("/v1", createClientRoutes(deps));
  app.route("/v1", createConfigRoutes(deps));
  app.route("/v1/indexer", createIndexerRoutes(deps));
  app.route("/v1/pool", createPoolRoutes(deps));
  app.route("/v1/relayer", createRelayerRoutes(deps));

  app.notFound(notFoundHandler);

  return app;
}
