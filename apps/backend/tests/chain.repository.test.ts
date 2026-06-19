import { describe, expect, it } from "vitest";

import { createChainRepository, type RpcFetch } from "@/modules/chain/chain.repository";

describe("createChainRepository", () => {
  it("fetches program signatures through Gorbagana JSON-RPC", async () => {
    const fetchCalls: unknown[] = [];
    const fetchRpc: RpcFetch = async (_url, init) => {
      fetchCalls.push(init);

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jsonrpc: "2.0",
            result: [
              {
                signature: "signature-1",
                slot: 123,
                blockTime: 1_781_800_000,
                err: null,
                confirmationStatus: "confirmed",
              },
            ],
          }),
      };
    };
    const repository = createChainRepository({
      rpcUrl: "https://rpc.gorbagana.wtf",
      fetch: fetchRpc,
    });

    const signatures = await repository.getSignaturesForAddress({
      address: "program-1",
      limit: 25,
      until: "previous-signature",
    });

    expect(fetchCalls).toHaveLength(1);
    expect(JSON.parse((fetchCalls[0] as { body: string }).body)).toEqual({
      jsonrpc: "2.0",
      id: "privacy-trash-indexer",
      method: "getSignaturesForAddress",
      params: [
        "program-1",
        {
          commitment: "confirmed",
          limit: 25,
          until: "previous-signature",
        },
      ],
    });
    expect(signatures).toEqual([
      {
        signature: "signature-1",
        slot: 123n,
        blockTime: new Date(1_781_800_000 * 1000),
        err: null,
        confirmationStatus: "confirmed",
      },
    ]);
  });

  it("fetches finalized transaction details through Gorbagana JSON-RPC", async () => {
    const fetchCalls: unknown[] = [];
    const fetchRpc: RpcFetch = async (_url, init) => {
      fetchCalls.push(init);

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              slot: 123,
              blockTime: 1_781_800_000,
              version: 0,
              meta: {
                err: null,
                logMessages: [],
                loadedAddresses: {
                  writable: [],
                  readonly: [],
                },
              },
              transaction: {
                message: {
                  accountKeys: ["program-1"],
                  instructions: [],
                },
              },
            },
          }),
      };
    };
    const repository = createChainRepository({
      rpcUrl: "https://rpc.gorbagana.wtf",
      fetch: fetchRpc,
    });

    const transaction = await repository.getTransaction("signature-1");

    expect(fetchCalls).toHaveLength(1);
    expect(JSON.parse((fetchCalls[0] as { body: string }).body)).toEqual({
      jsonrpc: "2.0",
      id: "privacy-trash-indexer",
      method: "getTransaction",
      params: [
        "signature-1",
        {
          commitment: "finalized",
          encoding: "json",
          maxSupportedTransactionVersion: 0,
        },
      ],
    });
    expect(transaction?.slot).toBe(123);
  });
});
