import type { ErrorHandler, NotFoundHandler } from "hono";

import { errorResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";

export type ErrorCode = "bad_request" | "not_found" | "internal_error" | "service_unavailable";

export class AppError extends Error {
  readonly status: 400 | 404 | 500 | 503;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(input: {
    status: 400 | 404 | 500 | 503;
    code: ErrorCode;
    message: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "AppError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

export function createErrorHandler(deps: Dependencies): ErrorHandler {
  return (error, ctx) => {
    if (error instanceof AppError) {
      return errorResponse(ctx, error.status, error.code, error.message, error.details);
    }

    deps.logger.error({ error }, "Unhandled API error");
    return errorResponse(ctx, 500, "internal_error", "Internal server error.");
  };
}

export const notFoundHandler: NotFoundHandler = (ctx) =>
  errorResponse(ctx, 404, "not_found", "Route not found.");
