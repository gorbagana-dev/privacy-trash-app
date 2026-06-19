import type { LightWasm } from "@lightprotocol/hasher.rs";

export const MERKLE_TREE_HEIGHT = 26;
export const MERKLE_ZERO = "0";

export type PoseidonHasher = Pick<LightWasm, "poseidonHashString">;

export type MerklePath = {
  root: string;
  pathElements: string[];
  pathIndices: number[];
};

export function hexFieldToDecimal(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Expected a 32-byte hex field.");
  }

  return BigInt(`0x${normalized}`).toString(10);
}

export function decimalFieldToHex(decimal: string): string {
  const normalized = decimal.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Expected an unsigned decimal field.");
  }

  const hex = BigInt(normalized).toString(16);
  if (hex.length > 64) {
    throw new Error("Decimal field does not fit in 32 bytes.");
  }

  return hex.padStart(64, "0");
}

export function normalizeFieldToHex(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) return normalized;

  return decimalFieldToHex(normalized);
}

export class MerkleTree {
  private readonly capacity: number;
  private readonly zeros: string[];
  private readonly layers: string[][];

  constructor(
    private readonly height: number,
    private readonly hasher: PoseidonHasher,
    leaves: string[],
  ) {
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error("Merkle tree height must be a positive integer.");
    }

    this.capacity = 2 ** height;
    if (leaves.length > this.capacity) {
      throw new Error("Merkle tree is full.");
    }

    this.zeros = [MERKLE_ZERO];
    for (let level = 1; level <= height; level += 1) {
      const previousZero = this.zeros[level - 1];
      if (previousZero === undefined) {
        throw new Error("Merkle zero initialization failed.");
      }

      this.zeros[level] = hasher.poseidonHashString([previousZero, previousZero]);
    }

    this.layers = [leaves.slice()];
    this.rebuild();
  }

  root(): string {
    const root = this.layers[this.height]?.[0];
    if (root !== undefined) return root;

    const emptyRoot = this.zeros[this.height];
    if (emptyRoot === undefined) {
      throw new Error("Merkle empty root is unavailable.");
    }

    return emptyRoot;
  }

  nextIndex(): number {
    return this.layers[0]?.length ?? 0;
  }

  path(index: number): MerklePath {
    const leafCount = this.nextIndex();
    if (!Number.isInteger(index) || index < 0 || index >= leafCount) {
      throw new Error(`Merkle leaf index ${index} is out of bounds.`);
    }

    let currentIndex = index;
    const pathElements: string[] = [];
    const pathIndices: number[] = [];

    for (let level = 0; level < this.height; level += 1) {
      const layer = this.layers[level];
      const zero = this.zeros[level];
      if (layer === undefined || zero === undefined) {
        throw new Error("Merkle tree layer is unavailable.");
      }

      pathIndices[level] = currentIndex % 2;
      pathElements[level] = layer[currentIndex ^ 1] ?? zero;
      currentIndex >>= 1;
    }

    return {
      root: this.root(),
      pathElements,
      pathIndices,
    };
  }

  private rebuild(): void {
    for (let level = 1; level <= this.height; level += 1) {
      const previousLayer = this.layers[level - 1];
      const zero = this.zeros[level - 1];
      if (previousLayer === undefined || zero === undefined) {
        throw new Error("Merkle tree rebuild failed.");
      }

      const layer: string[] = [];
      const parentCount = Math.ceil(previousLayer.length / 2);
      for (let index = 0; index < parentCount; index += 1) {
        const left = previousLayer[index * 2];
        if (left === undefined) {
          throw new Error("Merkle tree left node is unavailable.");
        }

        layer[index] = this.hasher.poseidonHashString([
          left,
          previousLayer[index * 2 + 1] ?? zero,
        ]);
      }

      this.layers[level] = layer;
    }
  }
}
