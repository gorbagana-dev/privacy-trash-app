import type { Client } from "@gorbagana/privacy-trash-client";

import type {
  PreparedPrivateOperation,
  PrivateOperationReceipt,
} from "@/features/transfer/types/transfer.types";

export type ExecuteOperationOptions = {
  client: Pick<
    Client,
    "simulateDeposit" | "sendDeposit" | "simulateTransfer" | "sendTransfer"
  >;
};

function getSimulationError(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return "Transaction simulation failed.";
  }

  const candidate = input as {
    ok?: unknown;
    errorMessage?: unknown;
  };

  if (candidate.ok === true) {
    return null;
  }

  return typeof candidate.errorMessage === "string" && candidate.errorMessage
    ? candidate.errorMessage
    : "Transaction simulation failed.";
}

export async function executeOperation(
  preparedOperation: PreparedPrivateOperation,
  options: ExecuteOperationOptions,
): Promise<PrivateOperationReceipt> {
  if (preparedOperation.mode === "deposit") {
    const simulation = await options.client.simulateDeposit(
      preparedOperation.clientPreparedOperation,
    );
    const simulationError = getSimulationError(simulation);

    if (simulationError !== null) {
      throw new Error(`Private deposit simulation failed: ${simulationError}`);
    }

    return {
      mode: "deposit",
      ...(await options.client.sendDeposit(
        preparedOperation.clientPreparedOperation,
      )),
    };
  }

  const simulation = await options.client.simulateTransfer(
    preparedOperation.clientPreparedOperation,
  );
  const simulationError = getSimulationError(simulation);

  if (simulationError !== null) {
    throw new Error(`Private transfer simulation failed: ${simulationError}`);
  }

  return {
    mode: "transfer",
    ...(await options.client.sendTransfer(
      preparedOperation.clientPreparedOperation,
    )),
  };
}
