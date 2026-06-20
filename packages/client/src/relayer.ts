import type { ReadonlyUint8Array } from "@solana/kit";
import { z } from "zod";

import { proofMaterialSchema, type ProofMaterial } from "@/proof";
import {
  addressSchema,
  httpUrlSchema,
} from "@/schemas";
import {
  transferReceiptSchema,
  transferSimulationSchema,
  type TransferReceipt,
  type TransferSimulation,
} from "@/transfer";

const defaultTimeoutMs = 60_000;
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const timeoutMsSchema = z.number().int().positive().max(180_000);
const base64BytesSchema = z
  .string()
  .trim()
  .min(1)
  .regex(base64Pattern, {
    message: "Expected padded base64 bytes.",
  });
const decimalStringSchema = z.string().trim().regex(/^-?\d+$/);
const unsignedDecimalStringSchema = z.string().trim().regex(/^\d+$/);

const errorEnvelopeSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    details: z.unknown().optional(),
  }),
});

const successEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.unknown(),
});

export const relayerProofMaterialSchema = z.strictObject({
  nullifiers: z.tuple([
    addressSchema,
    addressSchema,
    addressSchema,
    addressSchema,
  ]),
  proof: z.strictObject({
    proofA: base64BytesSchema,
    proofB: base64BytesSchema,
    proofC: base64BytesSchema,
    root: base64BytesSchema,
    publicAmount: base64BytesSchema,
    extDataHash: base64BytesSchema,
    inputNullifiers: z.tuple([base64BytesSchema, base64BytesSchema]),
    outputCommitments: z.tuple([base64BytesSchema, base64BytesSchema]),
  }),
  extData: z.strictObject({
    extAmount: decimalStringSchema,
    fee: unsignedDecimalStringSchema,
  }),
  encryptedOutput1: base64BytesSchema,
  encryptedOutput2: base64BytesSchema,
});

export const relayerTransferRequestSchema = relayerProofMaterialSchema.extend({
  programAddress: addressSchema,
  recipient: addressSchema,
  feeRecipient: addressSchema,
});

export type RelayerProofMaterial = z.infer<typeof relayerProofMaterialSchema>;
export type RelayerTransferRequest = z.infer<
  typeof relayerTransferRequestSchema
>;

export type RelayerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CreateRelayerInput = {
  baseUrl: string;
  fetch?: RelayerFetch | undefined;
  timeoutMs?: number | undefined;
};

export type Relayer = {
  simulateTransfer(request: RelayerTransferRequest): Promise<TransferSimulation>;
  submitTransfer(request: RelayerTransferRequest): Promise<TransferReceipt>;
};

export class RelayerError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details: unknown;

  constructor(input: {
    message: string;
    status?: number | null | undefined;
    code?: string | undefined;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "RelayerError";
    this.status = input.status ?? null;
    this.code = input.code ?? "relayer_error";
    this.details = input.details;
  }
}

export function createRelayer(input: CreateRelayerInput): Relayer {
  const baseUrl = httpUrlSchema.parse(input.baseUrl);
  const fetcher = input.fetch ?? globalThis.fetch;
  const timeoutMs = timeoutMsSchema.parse(input.timeoutMs ?? defaultTimeoutMs);

  if (fetcher === undefined) {
    throw new RelayerError({
      code: "fetch_unavailable",
      message: "fetch is not available in this runtime.",
    });
  }

  return {
    async simulateTransfer(request) {
      return post({
        baseUrl,
        fetcher,
        path: "/v1/relayer/transfers/simulate",
        body: relayerTransferRequestSchema.parse(request),
        responseSchema: transferSimulationSchema,
        timeoutMs,
      });
    },
    async submitTransfer(request) {
      return post({
        baseUrl,
        fetcher,
        path: "/v1/relayer/transfers",
        body: relayerTransferRequestSchema.parse(request),
        responseSchema: transferReceiptSchema,
        timeoutMs,
      });
    },
  };
}

export function createRelayerTransferRequest(input: {
  programAddress: string;
  recipient: string;
  feeRecipient: string;
  material: ProofMaterial;
}): RelayerTransferRequest {
  return relayerTransferRequestSchema.parse({
    programAddress: input.programAddress,
    recipient: input.recipient,
    feeRecipient: input.feeRecipient,
    ...serializeProofMaterial(input.material),
  });
}

export function serializeProofMaterial(
  input: ProofMaterial,
): RelayerProofMaterial {
  const material = proofMaterialSchema.parse(input);

  return relayerProofMaterialSchema.parse({
    nullifiers: material.nullifiers,
    proof: {
      proofA: bytesToBase64(material.proof.proofA),
      proofB: bytesToBase64(material.proof.proofB),
      proofC: bytesToBase64(material.proof.proofC),
      root: bytesToBase64(material.proof.root),
      publicAmount: bytesToBase64(material.proof.publicAmount),
      extDataHash: bytesToBase64(material.proof.extDataHash),
      inputNullifiers: [
        bytesToBase64(material.proof.inputNullifiers[0]),
        bytesToBase64(material.proof.inputNullifiers[1]),
      ],
      outputCommitments: [
        bytesToBase64(material.proof.outputCommitments[0]),
        bytesToBase64(material.proof.outputCommitments[1]),
      ],
    },
    extData: {
      extAmount: material.extData.extAmount.toString(),
      fee: material.extData.fee.toString(),
    },
    encryptedOutput1: bytesToBase64(material.encryptedOutput1),
    encryptedOutput2: bytesToBase64(material.encryptedOutput2),
  });
}

function bytesToBase64(bytes: ReadonlyUint8Array): string {
  if (typeof globalThis.btoa !== "function") {
    throw new RelayerError({
      code: "base64_unavailable",
      message: "Base64 encoding is not available in this runtime.",
    });
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return globalThis.btoa(binary);
}

async function post<TSchema extends z.ZodType>(input: {
  baseUrl: string;
  fetcher: RelayerFetch;
  path: string;
  body: RelayerTransferRequest;
  responseSchema: TSchema;
  timeoutMs: number;
}): Promise<z.infer<TSchema>> {
  let response: Response;

  try {
    response = await input.fetcher(new URL(`${input.baseUrl}${input.path}`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(input.body),
      signal: createTimeoutSignal(input.timeoutMs),
    });
  } catch (error) {
    throw new RelayerError({
      code: "request_failed",
      message: "Relayer request failed.",
      details: error,
    });
  }

  const body = await readJson(response);

  if (!response.ok) {
    const errorEnvelope = errorEnvelopeSchema.safeParse(body);

    if (errorEnvelope.success) {
      throw new RelayerError({
        status: response.status,
        code: errorEnvelope.data.error.code,
        message: errorEnvelope.data.error.message,
        details: errorEnvelope.data.error.details,
      });
    }

    throw new RelayerError({
      status: response.status,
      code: "http_error",
      message: `Relayer request failed with HTTP ${response.status}.`,
      details: body,
    });
  }

  const envelope = successEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    throw new RelayerError({
      status: response.status,
      code: "invalid_response",
      message: "Relayer returned an invalid response.",
      details: z.treeifyError(envelope.error),
    });
  }

  const data = input.responseSchema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new RelayerError({
      status: response.status,
      code: "invalid_response",
      message: "Relayer returned an invalid response.",
      details: z.treeifyError(data.error),
    });
  }

  return data.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new RelayerError({
      status: response.status,
      code: "invalid_json",
      message: "Relayer returned invalid JSON.",
      details: error,
    });
  }
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  globalThis.setTimeout(() => controller.abort(), timeoutMs);

  return controller.signal;
}
