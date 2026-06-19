import { describe, expect, it, vi } from "vitest";

import {
  createIndexer,
  IndexerError,
  type IndexerFetch,
} from "@/indexer";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const commitment =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifier =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const encryptedOutput = "////";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createFetch(body: unknown, status = 200): IndexerFetch {
  return vi.fn(async () => jsonResponse(status, body));
}

function expectLastUrl(fetcher: IndexerFetch): URL {
  const calls = vi.mocked(fetcher).mock.calls;
  const [input] = calls[calls.length - 1] ?? [];

  expect(input).toBeInstanceOf(URL);

  return input as URL;
}

describe("indexer", () => {
  it("reads public config and pool status through validated envelopes", async () => {
    const fetcher = createFetch({
      success: true,
      data: {
        cluster: "gorbagana",
        programAddress,
        explorerBaseUrl: "https://explorer.gorbagana.wtf/",
        nativeSymbol: "GOR",
      },
    });
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test/",
      fetch: fetcher,
    });

    await expect(indexer.getConfig()).resolves.toEqual({
      cluster: "gorbagana",
      programAddress,
      explorerBaseUrl: "https://explorer.gorbagana.wtf",
      nativeSymbol: "GOR",
    });
    expect(expectLastUrl(fetcher).href).toBe(
      "https://api.privacytrash.test/v1/config",
    );

    vi.mocked(fetcher).mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          outputCount: 4,
          spentNullifierCount: 2,
          observedRootCount: 1,
          latestOutputIndex: "3",
          latestSlot: "66920165",
        },
      }),
    );

    await expect(indexer.getStatus()).resolves.toMatchObject({
      outputCount: 4,
      latestSlot: "66920165",
    });
    expect(expectLastUrl(fetcher).href).toBe(
      "https://api.privacytrash.test/v1/pool/status",
    );
  });

  it("builds client indexer read URLs with query parameters", async () => {
    const fetcher = createFetch({
      success: true,
      data: {
        total: 4,
        hasMore: false,
        encryptedOutputs: [encryptedOutput],
      },
    });
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    await expect(
      indexer.getOutputRange({ start: 0, end: 4n }),
    ).resolves.toEqual({
      total: 4,
      hasMore: false,
      encryptedOutputs: [encryptedOutput],
    });
    expect(expectLastUrl(fetcher).href).toBe(
      "https://api.privacytrash.test/v1/outputs/range?start=0&end=4",
    );

    vi.mocked(fetcher).mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          exists: true,
        },
      }),
    );

    await expect(indexer.checkOutput({ encryptedOutput })).resolves.toEqual({
      exists: true,
    });
    expect(expectLastUrl(fetcher).href).toBe(
      "https://api.privacytrash.test/v1/outputs/check?encryptedOutput=%2F%2F%2F%2F",
    );

    vi.mocked(fetcher).mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          indices: [0, -1],
        },
      }),
    );

    await expect(
      indexer.getOutputIndices({ commitments: [commitment, "10"] }),
    ).resolves.toEqual({
      indices: [0, -1],
    });
    expect(expectLastUrl(fetcher).href).toBe(
      `https://api.privacytrash.test/v1/outputs/indices?commitments=${commitment}%2C10`,
    );
  });

  it("reads Merkle proofs by commitment", async () => {
    const fetcher = createFetch({
      success: true,
      data: {
        treeHeight: 26,
        root: "123",
        nextIndex: 4,
        proofs: [
          {
            commitment: "10",
            commitmentHex: commitment,
            found: true,
            outputIndex: "0",
            pathElements: Array.from({ length: 26 }, () => "0"),
            pathIndices: Array.from({ length: 26 }, () => 0),
          },
        ],
      },
    });
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    await expect(
      indexer.getMerkleProof({ commitments: [commitment] }),
    ).resolves.toMatchObject({
      root: "123",
      proofs: [
        {
          found: true,
          outputIndex: "0",
        },
      ],
    });
  });

  it("reads nullifier status", async () => {
    const fetcher = createFetch({
      success: true,
      data: {
        spent: true,
        nullifier,
        txSignature:
          "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua",
        instructionIndex: 2,
        slot: "66920165",
        spentAt: "2026-06-18T00:00:00.000Z",
      },
    });
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    await expect(indexer.getNullifierStatus({ nullifier })).resolves.toEqual({
      spent: true,
      nullifier,
      txSignature:
        "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua",
      instructionIndex: 2,
      slot: "66920165",
      spentAt: "2026-06-18T00:00:00.000Z",
    });
    expect(expectLastUrl(fetcher).href).toBe(
      `https://api.privacytrash.test/v1/pool/nullifiers/${nullifier}`,
    );
  });

  it("throws typed errors for backend errors and invalid success payloads", async () => {
    const fetcher = createFetch(
      {
        success: false,
        error: {
          code: "bad_request",
          message: "Invalid output range request.",
          details: {
            start: "bad",
          },
        },
      },
      400,
    );
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    await expect(
      indexer.getOutputRange({ start: 0, end: 1 }),
    ).rejects.toMatchObject({
      name: "IndexerError",
      status: 400,
      code: "bad_request",
      message: "Invalid output range request.",
    });

    vi.mocked(fetcher).mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          indices: ["0"],
        },
      }),
    );

    await expect(
      indexer.getOutputIndices({ commitments: [commitment] }),
    ).rejects.toMatchObject({
      name: "IndexerError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("validates local input before calling fetch", async () => {
    const fetcher = createFetch({
      success: true,
      data: {
        exists: true,
      },
    });
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    expect(() =>
      createIndexer({
        baseUrl: "ftp://api.privacytrash.test",
        fetch: fetcher,
      }),
    ).toThrow();

    await expect(
      indexer.getOutputRange({ start: 0, end: maxRangeEnd() }),
    ).rejects.toThrow("Output range cannot exceed");
    await expect(
      indexer.getOutputIndices({ commitments: ["not-a-commitment"] }),
    ).rejects.toThrow("Expected a decimal field element");
    await expect(
      indexer.checkOutput({ encryptedOutput: "not base64" }),
    ).rejects.toThrow("Expected base64-encoded");
    await expect(
      indexer.getNullifierStatus({ nullifier: "not-a-nullifier" }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("wraps failed fetch calls", async () => {
    const error = new Error("network down");
    const fetcher = vi.fn(async () => {
      throw error;
    }) satisfies IndexerFetch;
    const indexer = createIndexer({
      baseUrl: "https://api.privacytrash.test",
      fetch: fetcher,
    });

    await expect(indexer.getConfig()).rejects.toBeInstanceOf(IndexerError);
    await expect(indexer.getConfig()).rejects.toMatchObject({
      code: "request_failed",
    });
  });
});

function maxRangeEnd(): number {
  return 20_001;
}
