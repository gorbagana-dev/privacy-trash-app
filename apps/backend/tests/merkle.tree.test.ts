import { describe, expect, it } from "vitest";

import {
  decimalFieldToHex,
  hexFieldToDecimal,
  MERKLE_TREE_HEIGHT,
  MerkleTree,
  normalizeFieldToHex,
  type PoseidonHasher,
} from "@/modules/merkle/merkle.tree";

const hasher: PoseidonHasher = {
  poseidonHashString(values) {
    return values.reduce((state, value) => state * 131n + BigInt(value.toString()), 17n).toString();
  },
};

function recomputeRoot(
  leaf: string,
  leafIndex: number,
  pathElements: readonly string[],
  proofHasher: PoseidonHasher,
): string {
  let current = leaf;
  let index = leafIndex;

  for (const sibling of pathElements) {
    current =
      index % 2 === 0
        ? proofHasher.poseidonHashString([current, sibling])
        : proofHasher.poseidonHashString([sibling, current]);
    index >>= 1;
  }

  return current;
}

describe("MerkleTree", () => {
  it("builds a proof path that recomputes the current root", () => {
    const leaves = ["1", "2", "3", "4"];
    const tree = new MerkleTree(MERKLE_TREE_HEIGHT, hasher, leaves);
    const proof = tree.path(2);

    expect(proof.pathElements).toHaveLength(MERKLE_TREE_HEIGHT);
    expect(proof.pathIndices).toHaveLength(MERKLE_TREE_HEIGHT);
    expect(proof.pathElements[0]).toBe("4");
    expect(proof.pathIndices[0]).toBe(0);
    expect(recomputeRoot(leaves[2] ?? "0", 2, proof.pathElements, hasher)).toBe(proof.root);
  });

  it("converts big-endian field bytes into decimal strings", () => {
    expect(hexFieldToDecimal(`${"0".repeat(63)}a`)).toBe("10");
  });

  it("normalizes decimal fields into 32-byte hex strings", () => {
    expect(decimalFieldToHex("10")).toBe(`${"0".repeat(63)}a`);
    expect(normalizeFieldToHex(`${"0".repeat(63)}A`)).toBe(`${"0".repeat(63)}a`);
  });

  it("rejects malformed field bytes", () => {
    expect(() => hexFieldToDecimal("abc")).toThrow("Expected a 32-byte hex field.");
  });
});
