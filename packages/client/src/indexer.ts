import { z } from "zod";

import {
  addressSchema,
  fieldElementHexSchema,
  httpUrlSchema,
  isoTimestampSchema,
  safeIntegerSchema,
} from "@/schemas";

const defaultTimeoutMs = 10_000;
const maxOutputRange = 20_000;
const maxCommitmentIndexLookups = 100;
const maxProofCommitments = 2;

const timeoutMsSchema = z.number().int().positive().max(120_000);

const queryIndexSchema = z
  .union([safeIntegerSchema, z.bigint().nonnegative()])
  .transform((value) => value.toString());

const outputRangeInputSchema = z
  .strictObject({
    start: queryIndexSchema,
    end: queryIndexSchema,
  })
  .refine((value) => BigInt(value.end) >= BigInt(value.start), {
    message: "end must be greater than or equal to start.",
    path: ["end"],
  })
  .refine(
    (value) => BigInt(value.end) - BigInt(value.start) <= BigInt(maxOutputRange),
    {
      message: `Output range cannot exceed ${maxOutputRange}.`,
      path: ["end"],
    },
  );

const encryptedOutputSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, {
    message: "Expected base64-encoded encrypted output bytes.",
  })
  .refine((value) => value.length % 4 === 0, {
    message: "Expected padded base64-encoded encrypted output bytes.",
  });

const commitmentSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value),
    "Expected a decimal field element or 32-byte hex commitment.",
  )
  .transform((value) => value.toLowerCase());

const outputIndicesInputSchema = z.strictObject({
  commitments: z.array(commitmentSchema).min(1).max(maxCommitmentIndexLookups),
});

const merkleProofInputSchema = z.strictObject({
  commitments: z.array(commitmentSchema).min(1).max(maxProofCommitments),
});

const nullifierStatusInputSchema = z.strictObject({
  nullifier: fieldElementHexSchema,
});

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

const configSchema = z.strictObject({
  cluster: z.literal("gorbagana"),
  programAddress: addressSchema,
  explorerBaseUrl: httpUrlSchema,
  nativeSymbol: z.literal("GOR"),
});

const statusSchema = z.strictObject({
  outputCount: safeIntegerSchema,
  spentNullifierCount: safeIntegerSchema,
  observedRootCount: safeIntegerSchema,
  latestOutputIndex: z.string().regex(/^\d+$/).nullable(),
  latestSlot: z.string().regex(/^\d+$/).nullable(),
});

const outputRangeSchema = z.strictObject({
  total: safeIntegerSchema,
  hasMore: z.boolean(),
  outputs: z.array(
    z.strictObject({
      outputIndex: safeIntegerSchema,
      encryptedOutput: encryptedOutputSchema,
    }),
  ),
});

const outputCheckSchema = z.strictObject({
  exists: z.boolean(),
});

const outputIndicesSchema = z.strictObject({
  indices: z.array(z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER)),
});

const merkleProofEntrySchema = z.strictObject({
  commitment: z.string().regex(/^\d+$/),
  commitmentHex: z.string().regex(/^[0-9a-f]{64}$/),
  found: z.boolean(),
  outputIndex: z.string().regex(/^\d+$/).nullable(),
  pathElements: z.array(z.string().regex(/^\d+$/)),
  pathIndices: z.array(z.number().int().min(0).max(1)),
});

const merkleProofSchema = z.strictObject({
  treeHeight: safeIntegerSchema,
  root: z.string().regex(/^\d+$/),
  nextIndex: safeIntegerSchema,
  proofs: z.array(merkleProofEntrySchema),
});

const merkleStateSchema = z.strictObject({
  treeHeight: safeIntegerSchema,
  root: z.string().regex(/^\d+$/),
  nextIndex: safeIntegerSchema,
});

const nullifierStatusSchema = z.strictObject({
  spent: z.boolean(),
  nullifier: fieldElementHexSchema,
  txSignature: z.string().trim().min(1).nullable(),
  instructionIndex: safeIntegerSchema.nullable(),
  slot: z.string().regex(/^\d+$/).nullable(),
  spentAt: isoTimestampSchema.nullable(),
});

export type IndexerConfig = z.infer<typeof configSchema>;
export type IndexerStatus = z.infer<typeof statusSchema>;
export type OutputRange = z.infer<typeof outputRangeSchema>;
export type OutputCheck = z.infer<typeof outputCheckSchema>;
export type OutputIndices = z.infer<typeof outputIndicesSchema>;
export type MerkleProof = z.infer<typeof merkleProofSchema>;
export type MerkleState = z.infer<typeof merkleStateSchema>;
export type NullifierStatus = z.infer<typeof nullifierStatusSchema>;

export type OutputRangeInput = z.input<typeof outputRangeInputSchema>;
export type OutputCheckInput = {
  encryptedOutput: string;
};
export type OutputIndicesInput = z.input<typeof outputIndicesInputSchema>;
export type MerkleProofInput = z.input<typeof merkleProofInputSchema>;
export type NullifierStatusInput = z.input<typeof nullifierStatusInputSchema>;

export type IndexerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CreateIndexerInput = {
  baseUrl: string;
  fetch?: IndexerFetch | undefined;
  timeoutMs?: number | undefined;
};

export type Indexer = {
  getConfig(): Promise<IndexerConfig>;
  getStatus(): Promise<IndexerStatus>;
  getOutputRange(input: OutputRangeInput): Promise<OutputRange>;
  checkOutput(input: OutputCheckInput): Promise<OutputCheck>;
  getOutputIndices(input: OutputIndicesInput): Promise<OutputIndices>;
  getMerkleProof(input: MerkleProofInput): Promise<MerkleProof>;
  getMerkleState(): Promise<MerkleState>;
  getNullifierStatus(input: NullifierStatusInput): Promise<NullifierStatus>;
};

export class IndexerError extends Error {
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
    this.name = "IndexerError";
    this.status = input.status ?? null;
    this.code = input.code ?? "indexer_error";
    this.details = input.details;
  }
}

export function createIndexer(input: CreateIndexerInput): Indexer {
  const baseUrl = httpUrlSchema.parse(input.baseUrl);
  const fetcher = input.fetch ?? globalThis.fetch;
  const timeoutMs = timeoutMsSchema.parse(input.timeoutMs ?? defaultTimeoutMs);

  if (fetcher === undefined) {
    throw new IndexerError({
      code: "fetch_unavailable",
      message: "fetch is not available in this runtime.",
    });
  }

  async function get<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    query?: Record<string, string>,
  ): Promise<z.infer<TSchema>> {
    const url = new URL(`${baseUrl}${path}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    return request(fetcher, url, schema, timeoutMs);
  }

  return {
    async getConfig() {
      return get("/v1/config", configSchema);
    },
    async getStatus() {
      return get("/v1/pool/status", statusSchema);
    },
    async getOutputRange(inputRange) {
      const range = outputRangeInputSchema.parse(inputRange);

      return get("/v1/outputs/range", outputRangeSchema, range);
    },
    async checkOutput(inputCheck) {
      const encryptedOutput = encryptedOutputSchema.parse(
        inputCheck.encryptedOutput,
      );

      return get("/v1/outputs/check", outputCheckSchema, { encryptedOutput });
    },
    async getOutputIndices(inputIndices) {
      const { commitments } = outputIndicesInputSchema.parse(inputIndices);

      return get("/v1/outputs/indices", outputIndicesSchema, {
        commitments: commitments.join(","),
      });
    },
    async getMerkleProof(inputProof) {
      const { commitments } = merkleProofInputSchema.parse(inputProof);

      return get("/v1/merkle/proof", merkleProofSchema, {
        commitments: commitments.join(","),
      });
    },
    async getMerkleState() {
      return get("/v1/merkle/state", merkleStateSchema);
    },
    async getNullifierStatus(inputNullifier) {
      const { nullifier } = nullifierStatusInputSchema.parse(inputNullifier);

      return get(`/v1/pool/nullifiers/${nullifier}`, nullifierStatusSchema);
    },
  };
}

async function request<TSchema extends z.ZodType>(
  fetcher: IndexerFetch,
  url: URL,
  schema: TSchema,
  timeoutMs: number,
): Promise<z.infer<TSchema>> {
  let response: Response;

  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: createTimeoutSignal(timeoutMs),
    });
  } catch (error) {
    throw new IndexerError({
      code: "request_failed",
      message: "Indexer request failed.",
      details: error,
    });
  }

  const body = await readJson(response);

  if (!response.ok) {
    const errorEnvelope = errorEnvelopeSchema.safeParse(body);

    if (errorEnvelope.success) {
      throw new IndexerError({
        status: response.status,
        code: errorEnvelope.data.error.code,
        message: errorEnvelope.data.error.message,
        details: errorEnvelope.data.error.details,
      });
    }

    throw new IndexerError({
      status: response.status,
      code: "http_error",
      message: `Indexer request failed with HTTP ${response.status}.`,
      details: body,
    });
  }

  const envelope = successEnvelopeSchema.safeParse(body);

  if (!envelope.success) {
    throw new IndexerError({
      status: response.status,
      code: "invalid_response",
      message: "Indexer returned an invalid response.",
      details: z.treeifyError(envelope.error),
    });
  }

  const data = schema.safeParse(envelope.data.data);

  if (!data.success) {
    throw new IndexerError({
      status: response.status,
      code: "invalid_response",
      message: "Indexer returned an invalid response.",
      details: z.treeifyError(data.error),
    });
  }

  return data.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new IndexerError({
      status: response.status,
      code: "invalid_json",
      message: "Indexer returned invalid JSON.",
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
