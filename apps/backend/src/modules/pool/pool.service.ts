import type {
  PoolObservedRootRow,
  PoolOutputRow,
  PoolRepository,
  SpentNullifierRow,
} from "@/modules/pool/pool.repository";

const defaultListLimit = 100;
const maxListLimit = 500;

export type ListPoolOutputsInput = {
  limit?: number | undefined;
  afterIndex?: bigint | undefined;
};

export type ListPoolRootsInput = {
  limit?: number | undefined;
};

export type PoolOutputDto = {
  outputIndex: string;
  commitment: string;
  encryptedOutput: string;
  txSignature: string;
  instructionIndex: number;
  logIndex: number;
  slot: string;
  blockTime: string | null;
};

export type PoolRootDto = {
  root: string;
  source: string;
  txSignature: string;
  instructionIndex: number;
  slot: string;
  observedAt: string;
};

export type PoolNullifierStatusDto = {
  spent: boolean;
  nullifier: string;
  txSignature: string | null;
  instructionIndex: number | null;
  slot: string | null;
  spentAt: string | null;
};

export type PoolStatusDto = {
  outputCount: number;
  spentNullifierCount: number;
  observedRootCount: number;
  latestOutputIndex: string | null;
  latestSlot: string | null;
};

export type OutputRangeDto = {
  total: number;
  hasMore: boolean;
  encryptedOutputs: string[];
};

export type OutputCheckDto = {
  exists: boolean;
};

export type OutputIndicesDto = {
  indices: number[];
};

export type PoolService = {
  getStatus(): Promise<PoolStatusDto>;
  listOutputs(input?: ListPoolOutputsInput): Promise<{ outputs: PoolOutputDto[] }>;
  getOutputRange(input: { start: bigint; end: bigint }): Promise<OutputRangeDto>;
  checkEncryptedOutput(encryptedOutput: string): Promise<OutputCheckDto>;
  getOutputIndicesByCommitments(commitments: string[]): Promise<OutputIndicesDto>;
  listRoots(input?: ListPoolRootsInput): Promise<{ roots: PoolRootDto[] }>;
  getNullifierStatus(nullifier: string): Promise<PoolNullifierStatusDto>;
};

export type CreatePoolServiceInput = {
  programId: string;
  poolRepository: PoolRepository;
};

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return defaultListLimit;
  return Math.min(limit, maxListLimit);
}

function mapOutput(row: PoolOutputRow): PoolOutputDto {
  return {
    outputIndex: row.outputIndex.toString(),
    commitment: row.commitment,
    encryptedOutput: row.encryptedOutput,
    txSignature: row.txSignature,
    instructionIndex: row.instructionIndex,
    logIndex: row.logIndex,
    slot: row.slot.toString(),
    blockTime: row.blockTime?.toISOString() ?? null,
  };
}

function mapRoot(row: PoolObservedRootRow): PoolRootDto {
  return {
    root: row.root,
    source: row.source,
    txSignature: row.txSignature,
    instructionIndex: row.instructionIndex,
    slot: row.slot.toString(),
    observedAt: row.observedAt.toISOString(),
  };
}

function mapNullifier(nullifier: string, row: SpentNullifierRow | null): PoolNullifierStatusDto {
  if (!row) {
    return {
      spent: false,
      nullifier,
      txSignature: null,
      instructionIndex: null,
      slot: null,
      spentAt: null,
    };
  }

  return {
    spent: true,
    nullifier: row.nullifier,
    txSignature: row.txSignature,
    instructionIndex: row.instructionIndex,
    slot: row.slot.toString(),
    spentAt: row.spentAt.toISOString(),
  };
}

function outputIndexToNumber(index: bigint): number {
  const value = Number(index);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Output index ${index.toString()} is too large for a JSON number.`);
  }

  return value;
}

export function createPoolService(input: CreatePoolServiceInput): PoolService {
  return {
    async getStatus() {
      return await input.poolRepository.getStatus(input.programId);
    },

    async listOutputs(request = {}) {
      const rows = await input.poolRepository.listOutputs({
        programId: input.programId,
        limit: resolveLimit(request.limit),
        afterIndex: request.afterIndex,
      });

      return {
        outputs: rows.map(mapOutput),
      };
    },

    async getOutputRange(request) {
      const [rows, status] = await Promise.all([
        input.poolRepository.listOutputRange({
          programId: input.programId,
          start: request.start,
          end: request.end,
        }),
        input.poolRepository.getStatus(input.programId),
      ]);
      const total = status.outputCount;

      return {
        total,
        hasMore: request.end < BigInt(total),
        encryptedOutputs: rows.map((row) => row.encryptedOutput),
      };
    },

    async checkEncryptedOutput(encryptedOutput) {
      const row = await input.poolRepository.findOutputByEncryptedOutput({
        programId: input.programId,
        encryptedOutput,
      });

      return {
        exists: row !== null,
      };
    },

    async getOutputIndicesByCommitments(commitments) {
      const normalizedCommitments = commitments.map((commitment) => commitment.toLowerCase());
      const rows = await input.poolRepository.findOutputsByCommitments({
        programId: input.programId,
        commitments: normalizedCommitments,
      });
      const byCommitment = new Map(rows.map((row) => [row.commitment, outputIndexToNumber(row.outputIndex)]));

      return {
        indices: normalizedCommitments.map((commitment) => byCommitment.get(commitment) ?? -1),
      };
    },

    async listRoots(request = {}) {
      const rows = await input.poolRepository.listObservedRoots({
        programId: input.programId,
        limit: resolveLimit(request.limit),
      });

      return {
        roots: rows.map(mapRoot),
      };
    },

    async getNullifierStatus(nullifier) {
      const row = await input.poolRepository.findSpentNullifier({
        programId: input.programId,
        nullifier,
      });

      return mapNullifier(nullifier, row);
    },
  };
}
