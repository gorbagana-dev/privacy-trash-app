import { describe, expect, it, vi } from "vitest";

import { createApp } from "@/api/app";
import { loadEnv } from "@/config/env";
import type { DatabaseClient } from "@/db/client";
import type { Dependencies } from "@/dependencies";
import type {
  DiscoverSignaturesResult,
  IndexerService,
  ProcessSignaturesResult,
} from "@/modules/indexer/indexer.service";
import type { MerkleService } from "@/modules/merkle/merkle.service";
import type { PoolService } from "@/modules/pool/pool.service";

function createTestDependencies(
  input: {
    ping?: () => Promise<void>;
    discoverSignatures?: () => Promise<DiscoverSignaturesResult>;
    processSignatures?: () => Promise<ProcessSignaturesResult>;
    merkleService?: MerkleService;
    poolService?: PoolService;
  } = {},
): Dependencies {
  const database = {
    db: {},
    ping: input.ping ?? (async () => undefined),
    close: async () => undefined,
  } as unknown as DatabaseClient;
  const indexerService: IndexerService = {
    discoverSignatures:
      input.discoverSignatures ??
      (async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        discovered: 1,
        inserted: 1,
        highWatermarkSignature: "signature-1",
        highWatermarkSlot: "123",
      })),
    processSignatures:
      input.processSignatures ??
      (async () => ({
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        claimed: 1,
        processed: 1,
        skipped: 0,
        outputsInserted: 2,
        rootsInserted: 1,
        nullifiersInserted: 2,
        failedTransient: 0,
        failedTerminal: 0,
      })),
  };

  return {
    env: loadEnv({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/privatetrash",
    }),
    logger: {
      error: vi.fn(),
      info: vi.fn(),
    } as unknown as Dependencies["logger"],
    database,
    indexerService,
    merkleService:
      input.merkleService ??
      ({
        getPath: async () => ({
          treeHeight: 26,
          outputIndex: "2",
          nextIndex: 4,
          root: "123",
          commitment: "10",
          commitmentHex: "a".repeat(64),
          pathElements: Array.from({ length: 26 }, () => "0"),
          pathIndices: Array.from({ length: 26 }, () => 0),
        }),
        getProofByCommitments: async () => ({
          treeHeight: 26,
          root: "123",
          nextIndex: 4,
          proofs: [],
        }),
        getState: async () => ({
          treeHeight: 26,
          root: "123",
          nextIndex: 4,
        }),
      } satisfies MerkleService),
    poolService:
      input.poolService ??
      ({
        getStatus: async () => ({
          outputCount: 4,
          spentNullifierCount: 4,
          observedRootCount: 2,
          latestOutputIndex: "3",
          latestSlot: "66920165",
        }),
        listOutputs: async () => ({
          outputs: [],
        }),
        getOutputRange: async () => ({
          total: 0,
          hasMore: false,
          outputs: [],
        }),
        checkEncryptedOutput: async () => ({
          exists: false,
        }),
        getOutputIndicesByCommitments: async () => ({
          indices: [],
        }),
        listRoots: async () => ({
          roots: [],
        }),
        getNullifierStatus: async (nullifier: string) => ({
          spent: false,
          nullifier,
          txSignature: null,
          instructionIndex: null,
          slot: null,
          spentAt: null,
        }),
      } satisfies PoolService),
    close: async () => undefined,
  };
}

describe("createApp", () => {
  it("returns public backend config", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/v1/config");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        cluster: "gorbagana",
        programAddress: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        explorerBaseUrl: "https://explorer.gorbagana.wtf",
        nativeSymbol: "GOR",
      },
    });
  });

  it("returns healthy when the database ping succeeds", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        status: "healthy",
        checks: {
          db: {
            status: "ok",
          },
        },
      },
    });
  });

  it("returns degraded when the database ping fails", async () => {
    const app = createApp(
      createTestDependencies({
        ping: async () => {
          throw new Error("database unavailable");
        },
      }),
    );
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "service_unavailable",
        details: {
          status: "degraded",
        },
      },
    });
  });

  it("runs manual signature discovery", async () => {
    const discoverSignatures = vi.fn(async () => ({
      programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
      discovered: 2,
      inserted: 1,
      highWatermarkSignature: "signature-2",
      highWatermarkSlot: "456",
    }));
    const app = createApp(createTestDependencies({ discoverSignatures }));
    const response = await app.request("/v1/indexer/discover?limit=2", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(discoverSignatures).toHaveBeenCalledWith({ limit: 2 });
    expect(body).toEqual({
      success: true,
      data: {
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        discovered: 2,
        inserted: 1,
        highWatermarkSignature: "signature-2",
        highWatermarkSlot: "456",
      },
    });
  });

  it("rejects invalid discovery limits", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/v1/indexer/discover?limit=0", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "bad_request",
      },
    });
  });

  it("runs manual signature processing", async () => {
    const processSignatures = vi.fn(async () => ({
      programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
      claimed: 2,
      processed: 2,
      skipped: 0,
      outputsInserted: 4,
      rootsInserted: 1,
      nullifiersInserted: 2,
      failedTransient: 0,
      failedTerminal: 0,
    }));
    const app = createApp(createTestDependencies({ processSignatures }));
    const response = await app.request("/v1/indexer/process?limit=2", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processSignatures).toHaveBeenCalledWith({ limit: 2 });
    expect(body).toEqual({
      success: true,
      data: {
        programId: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
        claimed: 2,
        processed: 2,
        skipped: 0,
        outputsInserted: 4,
        rootsInserted: 1,
        nullifiersInserted: 2,
        failedTransient: 0,
        failedTerminal: 0,
      },
    });
  });

  it("returns pool status", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/v1/pool/status");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        outputCount: 4,
        spentNullifierCount: 4,
        observedRootCount: 2,
        latestOutputIndex: "3",
        latestSlot: "66920165",
      },
    });
  });

  it("returns pool outputs with pagination input", async () => {
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(async () => ({
        outputs: [
          {
            outputIndex: "2",
            commitment: "a".repeat(64),
            encryptedOutput: "ZW5jcnlwdGVk",
            txSignature: "signature-1",
            instructionIndex: 1,
            logIndex: 8,
            slot: "66920165",
            blockTime: "2026-06-16T15:33:33.000Z",
          },
        ],
      })),
      getOutputRange: vi.fn(),
      checkEncryptedOutput: vi.fn(),
      getOutputIndicesByCommitments: vi.fn(),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request("/v1/pool/outputs?limit=1&afterIndex=1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.listOutputs).toHaveBeenCalledWith({
      limit: 1,
      afterIndex: 1n,
    });
    expect(body).toMatchObject({
      success: true,
      data: {
        outputs: [
          {
            outputIndex: "2",
            txSignature: "signature-1",
          },
        ],
      },
    });
  });

  it("returns encrypted output ranges for client scans", async () => {
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(),
      getOutputRange: vi.fn(async () => ({
        total: 4,
        hasMore: true,
        outputs: [
          {
            outputIndex: 0,
            encryptedOutput: "ZW5jcnlwdGVkLTE=",
          },
          {
            outputIndex: 1,
            encryptedOutput: "ZW5jcnlwdGVkLTI=",
          },
        ],
      })),
      checkEncryptedOutput: vi.fn(),
      getOutputIndicesByCommitments: vi.fn(),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request("/v1/outputs/range?start=0&end=2");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.getOutputRange).toHaveBeenCalledWith({
      start: 0n,
      end: 2n,
    });
    expect(body).toEqual({
      success: true,
      data: {
        total: 4,
        hasMore: true,
        outputs: [
          {
            outputIndex: 0,
            encryptedOutput: "ZW5jcnlwdGVkLTE=",
          },
          {
            outputIndex: 1,
            encryptedOutput: "ZW5jcnlwdGVkLTI=",
          },
        ],
      },
    });
  });

  it("checks whether an encrypted output is indexed", async () => {
    const encryptedOutput = "ZW5jcnlwdGVk";
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(),
      getOutputRange: vi.fn(),
      checkEncryptedOutput: vi.fn(async () => ({ exists: true })),
      getOutputIndicesByCommitments: vi.fn(),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request(`/v1/outputs/check/${encryptedOutput}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.checkEncryptedOutput).toHaveBeenCalledWith(encryptedOutput);
    expect(body).toEqual({
      success: true,
      data: {
        exists: true,
      },
    });
  });

  it("checks encrypted outputs through a query parameter", async () => {
    const encryptedOutput = "////";
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(),
      getOutputRange: vi.fn(),
      checkEncryptedOutput: vi.fn(async () => ({ exists: true })),
      getOutputIndicesByCommitments: vi.fn(),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request(
      `/v1/outputs/check?encryptedOutput=${encodeURIComponent(encryptedOutput)}`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.checkEncryptedOutput).toHaveBeenCalledWith(encryptedOutput);
    expect(body).toEqual({
      success: true,
      data: {
        exists: true,
      },
    });
  });

  it("returns output indices by commitments", async () => {
    const commitment = "a".repeat(64);
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(),
      getOutputRange: vi.fn(),
      checkEncryptedOutput: vi.fn(),
      getOutputIndicesByCommitments: vi.fn(async () => ({ indices: [2, -1] })),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request(`/v1/outputs/indices?commitments=${commitment},10`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.getOutputIndicesByCommitments).toHaveBeenCalledWith([commitment, "10"]);
    expect(body).toEqual({
      success: true,
      data: {
        indices: [2, -1],
      },
    });
  });

  it("returns Merkle proofs by commitments", async () => {
    const commitment = "a".repeat(64);
    const merkleService: MerkleService = {
      getPath: vi.fn(),
      getProofByCommitments: vi.fn(async () => ({
        treeHeight: 26,
        root: "123",
        nextIndex: 4,
        proofs: [
          {
            commitment: "10",
            commitmentHex: commitment,
            found: true,
            outputIndex: "2",
            pathElements: Array.from({ length: 26 }, () => "0"),
            pathIndices: Array.from({ length: 26 }, () => 0),
          },
        ],
      })),
      getState: vi.fn(),
    };
    const app = createApp(createTestDependencies({ merkleService }));
    const response = await app.request(`/v1/merkle/proof?commitments=${commitment}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(merkleService.getProofByCommitments).toHaveBeenCalledWith([commitment]);
    expect(body).toMatchObject({
      success: true,
      data: {
        root: "123",
        nextIndex: 4,
        proofs: [
          {
            found: true,
            outputIndex: "2",
          },
        ],
      },
    });
  });

  it("returns current Merkle state for deposit preparation", async () => {
    const merkleService: MerkleService = {
      getPath: vi.fn(),
      getProofByCommitments: vi.fn(),
      getState: vi.fn(async () => ({
        treeHeight: 26,
        root: "123",
        nextIndex: 4,
      })),
    };
    const app = createApp(createTestDependencies({ merkleService }));
    const response = await app.request("/v1/merkle/state");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(merkleService.getState).toHaveBeenCalledOnce();
    expect(body).toEqual({
      success: true,
      data: {
        treeHeight: 26,
        root: "123",
        nextIndex: 4,
      },
    });
  });

  it("returns nullifier spent status", async () => {
    const nullifier = "a".repeat(64);
    const poolService: PoolService = {
      getStatus: vi.fn(),
      listOutputs: vi.fn(),
      getOutputRange: vi.fn(),
      checkEncryptedOutput: vi.fn(),
      getOutputIndicesByCommitments: vi.fn(),
      listRoots: vi.fn(),
      getNullifierStatus: vi.fn(async () => ({
        spent: true,
        nullifier,
        txSignature: "signature-1",
        instructionIndex: 1,
        slot: "66920165",
        spentAt: "2026-06-16T15:33:33.000Z",
      })),
    };
    const app = createApp(createTestDependencies({ poolService }));
    const response = await app.request(`/v1/pool/nullifiers/${nullifier}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolService.getNullifierStatus).toHaveBeenCalledWith(nullifier);
    expect(body).toMatchObject({
      success: true,
      data: {
        spent: true,
        txSignature: "signature-1",
      },
    });
  });

  it("returns a Merkle path for an indexed output", async () => {
    const merkleService: MerkleService = {
      getPath: vi.fn(async () => ({
        treeHeight: 26,
        outputIndex: "2",
        nextIndex: 4,
        root: "123",
        commitment: "10",
        commitmentHex: "a".repeat(64),
        pathElements: Array.from({ length: 26 }, () => "0"),
        pathIndices: Array.from({ length: 26 }, () => 0),
      })),
      getProofByCommitments: vi.fn(),
      getState: vi.fn(),
    };
    const app = createApp(createTestDependencies({ merkleService }));
    const response = await app.request("/v1/pool/merkle-path/2");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(merkleService.getPath).toHaveBeenCalledWith(2n);
    expect(body).toMatchObject({
      success: true,
      data: {
        outputIndex: "2",
        root: "123",
      },
    });
  });

  it("returns 404 for missing Merkle path outputs", async () => {
    const merkleService: MerkleService = {
      getPath: vi.fn(async () => null),
      getProofByCommitments: vi.fn(),
      getState: vi.fn(),
    };
    const app = createApp(createTestDependencies({ merkleService }));
    const response = await app.request("/v1/pool/merkle-path/99");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "not_found",
      },
    });
  });

  it("rejects invalid Merkle path output indexes", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/v1/pool/merkle-path/not-an-index");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "bad_request",
      },
    });
  });

  it("rejects invalid nullifier values", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/v1/pool/nullifiers/not-a-nullifier");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "bad_request",
      },
    });
  });
});
