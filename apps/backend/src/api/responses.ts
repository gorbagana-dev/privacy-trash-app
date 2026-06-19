import type { Context } from "hono";

export type ErrorStatus = 400 | 404 | 500 | 503;
export type SuccessStatus = 200 | 201;

export function successResponse<TData>(
  ctx: Context,
  data: TData,
  status: SuccessStatus = 200,
) {
  return ctx.json({ success: true, data }, status);
}

export function errorResponse(
  ctx: Context,
  status: ErrorStatus,
  code: string,
  message: string,
  details?: unknown,
) {
  return ctx.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}
