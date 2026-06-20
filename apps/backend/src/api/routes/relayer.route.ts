import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "@/api/errors";
import { successResponse } from "@/api/responses";
import type { Dependencies } from "@/dependencies";
import {
  RelayerConfigurationError,
  RelayerSimulationError,
} from "@/modules/relayer/relayer.service";
import {
  relayerTransferRequestSchema,
  validateRelayerTransferPolicy,
} from "@/modules/relayer/relayer.schema";

function badRequest(message: string, details?: unknown): AppError {
  return new AppError({
    status: 400,
    code: "bad_request",
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function serviceUnavailable(message: string): AppError {
  return new AppError({
    status: 503,
    code: "service_unavailable",
    message,
  });
}

export function createRelayerRoutes(deps: Dependencies): Hono {
  const app = new Hono();

  app.post("/transfers/simulate", async (ctx) => {
    const request = await readTransferRequest(ctx.req.json());
    const simulation = await callRelayer(() =>
      deps.relayerService.simulateTransfer(request),
    );

    return successResponse(ctx, simulation);
  });

  app.post("/transfers", async (ctx) => {
    const request = await readTransferRequest(ctx.req.json());
    const receipt = await callRelayer(() =>
      deps.relayerService.submitTransfer(request),
    );

    return successResponse(ctx, receipt, 201);
  });

  async function readTransferRequest(bodyPromise: Promise<unknown>) {
    let body: unknown;

    try {
      body = await bodyPromise;
    } catch (error) {
      throw badRequest("Request body must be valid JSON.", error);
    }

    const parsed = relayerTransferRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        "Invalid relayer transfer request.",
        z.treeifyError(parsed.error),
      );
    }

    if (
      !validateRelayerTransferPolicy(parsed.data, {
        programAddress: deps.env.PRIVACY_TRASH_PROGRAM_ADDRESS,
        feeRecipient: deps.env.PRIVACY_TRASH_FEE_RECIPIENT,
      })
    ) {
      throw badRequest("Relayer policy does not accept this transfer request.");
    }

    return parsed.data;
  }

  return app;
}

async function callRelayer<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RelayerConfigurationError) {
      throw serviceUnavailable(error.message);
    }

    if (error instanceof RelayerSimulationError) {
      throw badRequest("Relayer simulation failed.", error.simulation);
    }

    throw error;
  }
}
