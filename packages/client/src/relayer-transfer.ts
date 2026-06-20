import { z } from "zod";

import { createProofMaterial } from "@/proof";
import {
  createPrivateTransferProofProvider,
  type CreatePrivateTransferProofProviderInput,
} from "@/private-transfer";
import {
  createRelayerTransferRequest,
  relayerTransferRequestSchema,
  type Relayer,
} from "@/relayer";
import { addressSchema } from "@/schemas";
import {
  preparedTransferSchema,
  prepareTransferInputSchema,
  TRANSFER_EXECUTION_VERSION,
  type PreparedTransfer,
  type TransferExecutor,
} from "@/transfer";

export const RELAYER_TRANSFER_PAYLOAD_KIND =
  "privacy-trash.relayer-transfer";

const relayerTransferPayloadSchema = z.strictObject({
  kind: z.literal(RELAYER_TRANSFER_PAYLOAD_KIND),
  request: relayerTransferRequestSchema,
});

export type RelayerTransferPayload = z.infer<
  typeof relayerTransferPayloadSchema
>;

export type CreateRelayerTransferExecutorInput =
  CreatePrivateTransferProofProviderInput & {
    relayer: Relayer;
  };

export function createRelayerTransferExecutor(
  input: CreateRelayerTransferExecutorInput,
): TransferExecutor {
  const programAddress = addressSchema.parse(input.programAddress);
  const feeRecipient = addressSchema.parse(input.feeRecipient);
  const proofProvider = createPrivateTransferProofProvider(input);
  const now = input.now ?? (() => new Date());

  return {
    async prepareTransfer(prepareInput) {
      const request = prepareTransferInputSchema.parse(prepareInput);
      const material = await createProofMaterial(proofProvider, request);
      const payload = relayerTransferPayloadSchema.parse({
        kind: RELAYER_TRANSFER_PAYLOAD_KIND,
        request: createRelayerTransferRequest({
          programAddress,
          recipient: request.recipient,
          feeRecipient,
          material,
        }),
      });

      return preparedTransferSchema.parse({
        version: TRANSFER_EXECUTION_VERSION,
        programAddress: request.programAddress,
        ownerAddress: request.ownerAddress,
        recipient: request.recipient,
        quote: request.quote,
        createdAt: now().toISOString(),
        payload,
      });
    },
    async simulateTransfer(preparedTransfer) {
      const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);
      const payload = getRelayerTransferPayload(parsedTransfer);

      return input.relayer.simulateTransfer(payload.request);
    },
    async sendTransfer(preparedTransfer) {
      const parsedTransfer = preparedTransferSchema.parse(preparedTransfer);
      const payload = getRelayerTransferPayload(parsedTransfer);

      return input.relayer.submitTransfer(payload.request);
    },
  };
}

export function getRelayerTransferPayload(
  preparedTransfer: PreparedTransfer,
): RelayerTransferPayload {
  const payloadResult = relayerTransferPayloadSchema.safeParse(
    preparedTransfer.payload,
  );

  if (!payloadResult.success) {
    throw new Error(
      "Prepared transfer was not created by the relayer executor.",
    );
  }

  return payloadResult.data;
}
