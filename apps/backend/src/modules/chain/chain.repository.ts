import { z } from "zod";

const rpcSignatureSchema = z.looseObject({
    signature: z.string().trim().min(1),
    slot: z.number().int().nonnegative(),
    blockTime: z.number().int().nullable().optional(),
    err: z.unknown().nullable().optional(),
    confirmationStatus: z.string().nullable().optional(),
  });

const rpcSuccessSchema = z.looseObject({
    result: z.array(rpcSignatureSchema),
  });

const loadedAddressesSchema = z
  .looseObject({
    writable: z.array(z.string()),
    readonly: z.array(z.string()),
  })
  .partial();

const transactionInstructionSchema = z.looseObject({
    programIdIndex: z.number().int().nonnegative(),
    accounts: z.array(z.number().int().nonnegative()),
    data: z.string(),
  });

const confirmedTransactionSchema = z.looseObject({
    slot: z.number().int().nonnegative(),
    blockTime: z.number().int().nullable().optional(),
    version: z.union([z.literal("legacy"), z.number()]).optional(),
    meta: z
      .looseObject({
        err: z.unknown().nullable().optional(),
        logMessages: z.array(z.string()).nullable().optional(),
        loadedAddresses: loadedAddressesSchema.optional(),
      })
      .nullable(),
    transaction: z
      .looseObject({
        message: z
          .looseObject({
            accountKeys: z.array(z.string()),
            instructions: z.array(transactionInstructionSchema),
          }),
      }),
  });

const rpcTransactionSuccessSchema = z.looseObject({
    result: confirmedTransactionSchema.nullable(),
  });

const rpcErrorSchema = z.looseObject({
    error: z
      .looseObject({
        code: z.number(),
        message: z.string(),
      }),
  });

export type ProgramSignature = {
  signature: string;
  slot: bigint;
  blockTime: Date | null;
  err: unknown | null;
  confirmationStatus: string | null;
};

export type ChainInstruction = z.infer<typeof transactionInstructionSchema>;

export type ChainTransaction = z.infer<typeof confirmedTransactionSchema>;

export type GetSignaturesForAddressInput = {
  address: string;
  limit: number;
  until?: string | undefined;
  before?: string | undefined;
};

export type ChainRepository = {
  getSignaturesForAddress(input: GetSignaturesForAddressInput): Promise<ProgramSignature[]>;
  getTransaction(signature: string): Promise<ChainTransaction | null>;
};

export type RpcFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type CreateChainRepositoryInput = {
  rpcUrl: string;
  fetch?: RpcFetch | undefined;
};

function parseRpcJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gorbagana RPC returned invalid JSON.");
  }
}

function mapSignature(value: z.infer<typeof rpcSignatureSchema>): ProgramSignature {
  return {
    signature: value.signature,
    slot: BigInt(value.slot),
    blockTime: value.blockTime == null ? null : new Date(value.blockTime * 1000),
    err: value.err ?? null,
    confirmationStatus: value.confirmationStatus ?? null,
  };
}

export function createChainRepository(input: CreateChainRepositoryInput): ChainRepository {
  const fetchRpc: RpcFetch = input.fetch ?? fetch;

  return {
    async getSignaturesForAddress(request) {
      const response = await fetchRpc(input.rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "privacy-trash-indexer",
          method: "getSignaturesForAddress",
          params: [
            request.address,
            {
              commitment: "confirmed",
              limit: request.limit,
              ...(request.until === undefined ? {} : { until: request.until }),
              ...(request.before === undefined ? {} : { before: request.before }),
            },
          ],
        }),
      });
      const json = parseRpcJson(await response.text());

      if (!response.ok) {
        throw new Error(`Gorbagana RPC request failed with HTTP ${response.status}.`);
      }

      const error = rpcErrorSchema.safeParse(json);
      if (error.success) {
        throw new Error(`Gorbagana RPC error ${error.data.error.code}: ${error.data.error.message}`);
      }

      const success = rpcSuccessSchema.safeParse(json);
      if (!success.success) {
        throw new Error("Gorbagana RPC returned an unexpected getSignaturesForAddress response.");
      }

      return success.data.result.map(mapSignature);
    },

    async getTransaction(signature) {
      const response = await fetchRpc(input.rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "privacy-trash-indexer",
          method: "getTransaction",
          params: [
            signature,
            {
              commitment: "finalized",
              encoding: "json",
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });
      const json = parseRpcJson(await response.text());

      if (!response.ok) {
        throw new Error(`Gorbagana RPC request failed with HTTP ${response.status}.`);
      }

      const error = rpcErrorSchema.safeParse(json);
      if (error.success) {
        throw new Error(`Gorbagana RPC error ${error.data.error.code}: ${error.data.error.message}`);
      }

      const success = rpcTransactionSuccessSchema.safeParse(json);
      if (!success.success) {
        throw new Error("Gorbagana RPC returned an unexpected getTransaction response.");
      }

      return success.data.result;
    },
  };
}
