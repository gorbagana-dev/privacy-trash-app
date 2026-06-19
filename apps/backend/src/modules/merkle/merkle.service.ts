import { WasmFactory } from "@lightprotocol/hasher.rs";

import type { PoolOutputRow, PoolRepository } from "@/modules/pool/pool.repository";
import {
  hexFieldToDecimal,
  MERKLE_TREE_HEIGHT,
  MerkleTree,
  normalizeFieldToHex,
  type PoseidonHasher,
} from "@/modules/merkle/merkle.tree";

export type MerklePathDto = {
  treeHeight: number;
  outputIndex: string;
  nextIndex: number;
  root: string;
  commitment: string;
  commitmentHex: string;
  pathElements: string[];
  pathIndices: number[];
};

export type CommitmentMerkleProofDto = {
  commitment: string;
  commitmentHex: string;
  found: boolean;
  outputIndex: string | null;
  pathElements: string[];
  pathIndices: number[];
};

export type MerkleProofDto = {
  treeHeight: number;
  root: string;
  nextIndex: number;
  proofs: CommitmentMerkleProofDto[];
};

export type MerkleStateDto = {
  treeHeight: number;
  root: string;
  nextIndex: number;
};

export type MerkleService = {
  getPath(outputIndex: bigint): Promise<MerklePathDto | null>;
  getProofByCommitments(commitments: string[]): Promise<MerkleProofDto>;
  getState(): Promise<MerkleStateDto>;
};

export type CreateMerkleServiceInput = {
  programId: string;
  poolRepository: PoolRepository;
  getHasher?: (() => Promise<PoseidonHasher>) | undefined;
};

const maxTreeLeaves = 2 ** MERKLE_TREE_HEIGHT;

function outputIndexToNumber(outputIndex: bigint): number {
  if (outputIndex < 0n || outputIndex >= BigInt(maxTreeLeaves)) {
    throw new Error(`Merkle output index must be between 0 and ${maxTreeLeaves - 1}.`);
  }

  return Number(outputIndex);
}

function ensureContiguousOutputs(rows: readonly PoolOutputRow[]): void {
  for (const [index, row] of rows.entries()) {
    if (row.outputIndex !== BigInt(index)) {
      throw new Error(
        `Indexed pool outputs are not contiguous at output index ${index}.`,
      );
    }
  }
}

function zeroProof(commitmentHex: string): CommitmentMerkleProofDto {
  return {
    commitment: hexFieldToDecimal(commitmentHex),
    commitmentHex,
    found: false,
    outputIndex: null,
    pathElements: Array.from({ length: MERKLE_TREE_HEIGHT }, () => "0"),
    pathIndices: Array.from({ length: MERKLE_TREE_HEIGHT }, () => 0),
  };
}

export function createMerkleService(input: CreateMerkleServiceInput): MerkleService {
  const getHasher = input.getHasher ?? (() => WasmFactory.getInstance());

  async function buildTree(): Promise<MerkleTree> {
    const rows = await input.poolRepository.listOutputsForTree(input.programId);
    ensureContiguousOutputs(rows);

    const hasher = await getHasher();
    const commitments = rows.map((row) => hexFieldToDecimal(row.commitment));

    return new MerkleTree(MERKLE_TREE_HEIGHT, hasher, commitments);
  }

  return {
    async getState() {
      const tree = await buildTree();

      return {
        treeHeight: MERKLE_TREE_HEIGHT,
        root: tree.root(),
        nextIndex: tree.nextIndex(),
      };
    },

    async getPath(outputIndex) {
      const requestedIndex = outputIndexToNumber(outputIndex);
      const rows = await input.poolRepository.listOutputsForTree(input.programId);

      if (requestedIndex >= rows.length) return null;
      ensureContiguousOutputs(rows);

      const hasher = await getHasher();
      const commitments = rows.map((row) => hexFieldToDecimal(row.commitment));
      const tree = new MerkleTree(MERKLE_TREE_HEIGHT, hasher, commitments);
      const path = tree.path(requestedIndex);
      const row = rows[requestedIndex];
      if (row === undefined) return null;

      return {
        treeHeight: MERKLE_TREE_HEIGHT,
        outputIndex: row.outputIndex.toString(),
        nextIndex: tree.nextIndex(),
        root: path.root,
        commitment: commitments[requestedIndex] ?? hexFieldToDecimal(row.commitment),
        commitmentHex: row.commitment,
        pathElements: path.pathElements,
        pathIndices: path.pathIndices,
      };
    },

    async getProofByCommitments(commitments) {
      const requestedCommitments = commitments.map(normalizeFieldToHex);
      const rows = await input.poolRepository.listOutputsForTree(input.programId);
      ensureContiguousOutputs(rows);

      const hasher = await getHasher();
      const treeCommitments = rows.map((row) => hexFieldToDecimal(row.commitment));
      const tree = new MerkleTree(MERKLE_TREE_HEIGHT, hasher, treeCommitments);
      const rowByCommitment = new Map(rows.map((row) => [row.commitment, row]));

      return {
        treeHeight: MERKLE_TREE_HEIGHT,
        root: tree.root(),
        nextIndex: tree.nextIndex(),
        proofs: requestedCommitments.map((commitmentHex) => {
          const row = rowByCommitment.get(commitmentHex);
          if (!row) return zeroProof(commitmentHex);

          const outputIndex = outputIndexToNumber(row.outputIndex);
          const path = tree.path(outputIndex);

          return {
            commitment: hexFieldToDecimal(commitmentHex),
            commitmentHex,
            found: true,
            outputIndex: row.outputIndex.toString(),
            pathElements: path.pathElements,
            pathIndices: path.pathIndices,
          };
        }),
      };
    },
  };
}
