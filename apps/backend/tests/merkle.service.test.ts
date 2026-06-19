import { describe, expect, it } from "vitest";

import { createMerkleService } from "@/modules/merkle/merkle.service";
import type { PoseidonHasher } from "@/modules/merkle/merkle.tree";
import type { PoolOutputRow, PoolRepository } from "@/modules/pool/pool.repository";

const programId = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";

const hasher: PoseidonHasher = {
  poseidonHashString(values) {
    return values.reduce((state, value) => state * 131n + BigInt(value.toString()), 31n).toString();
  },
};

function outputRow(outputIndex: bigint, commitment: string): PoolOutputRow {
  return {
    id: Number(outputIndex) + 1,
    programId,
    outputIndex,
    commitment,
    encryptedOutput: "ZW5jcnlwdGVk",
    txSignature: `signature-${outputIndex}`,
    instructionIndex: 1,
    logIndex: Number(outputIndex) + 8,
    slot: 66920165n,
    blockTime: new Date("2026-06-16T15:33:33.000Z"),
    createdAt: new Date("2026-06-18T10:00:00.000Z"),
  };
}

function poolRepository(rows: PoolOutputRow[]): PoolRepository {
  return {
    listOutputsForTree: async () => rows,
  } as unknown as PoolRepository;
}

describe("MerkleService", () => {
  it("returns a prover-ready Merkle path for an indexed output", async () => {
    const service = createMerkleService({
      programId,
      poolRepository: poolRepository([
        outputRow(0n, `${"0".repeat(63)}1`),
        outputRow(1n, `${"0".repeat(63)}2`),
        outputRow(2n, `${"0".repeat(63)}a`),
      ]),
      getHasher: async () => hasher,
    });

    const result = await service.getPath(2n);

    expect(result).toMatchObject({
      treeHeight: 26,
      outputIndex: "2",
      nextIndex: 3,
      commitment: "10",
      commitmentHex: `${"0".repeat(63)}a`,
    });
    expect(result?.root).toMatch(/^\d+$/);
    expect(result?.pathElements).toHaveLength(26);
    expect(result?.pathIndices).toHaveLength(26);
  });

  it("returns null when the output index is not indexed", async () => {
    const service = createMerkleService({
      programId,
      poolRepository: poolRepository([outputRow(0n, `${"0".repeat(63)}1`)]),
      getHasher: async () => hasher,
    });

    await expect(service.getPath(1n)).resolves.toBeNull();
  });

  it("returns Merkle proofs for decimal and hex commitment lookups", async () => {
    const service = createMerkleService({
      programId,
      poolRepository: poolRepository([
        outputRow(0n, `${"0".repeat(63)}1`),
        outputRow(1n, `${"0".repeat(63)}2`),
      ]),
      getHasher: async () => hasher,
    });

    const result = await service.getProofByCommitments(["1", `${"0".repeat(63)}2`]);

    expect(result).toMatchObject({
      treeHeight: 26,
      nextIndex: 2,
      proofs: [
        {
          commitment: "1",
          commitmentHex: `${"0".repeat(63)}1`,
          found: true,
          outputIndex: "0",
        },
        {
          commitment: "2",
          commitmentHex: `${"0".repeat(63)}2`,
          found: true,
          outputIndex: "1",
        },
      ],
    });
    expect(result.root).toMatch(/^\d+$/);
    expect(result.proofs[0]?.pathElements).toHaveLength(26);
  });

  it("returns a marked zero proof for missing commitments", async () => {
    const service = createMerkleService({
      programId,
      poolRepository: poolRepository([outputRow(0n, `${"0".repeat(63)}1`)]),
      getHasher: async () => hasher,
    });

    const result = await service.getProofByCommitments(["10"]);

    expect(result.proofs).toEqual([
      {
        commitment: "10",
        commitmentHex: `${"0".repeat(63)}a`,
        found: false,
        outputIndex: null,
        pathElements: Array.from({ length: 26 }, () => "0"),
        pathIndices: Array.from({ length: 26 }, () => 0),
      },
    ]);
  });

  it("rejects non-contiguous indexed outputs", async () => {
    const service = createMerkleService({
      programId,
      poolRepository: poolRepository([
        outputRow(0n, `${"0".repeat(63)}1`),
        outputRow(2n, `${"0".repeat(63)}2`),
      ]),
      getHasher: async () => hasher,
    });

    await expect(service.getPath(1n)).rejects.toThrow(
      "Indexed pool outputs are not contiguous at output index 1.",
    );
  });
});
