import { z } from "zod";

import {
  getOwnedNoteBalance,
  type OwnedNoteStore,
} from "@/owned";
import { basisPointsSchema, lamportsSchema } from "@/schemas";

export const poolFeeConfigSchema = z.strictObject({
  depositFeeBps: basisPointsSchema,
  withdrawalFeeBps: basisPointsSchema,
  feeErrorMarginBps: basisPointsSchema,
  withdrawRentFeeLamports: lamportsSchema.default(0n),
});

export const privateBalanceSchema = z.strictObject({
  lamports: lamportsSchema,
});

export type PoolFeeConfig = z.infer<typeof poolFeeConfigSchema>;
export type PrivateBalance = z.infer<typeof privateBalanceSchema>;

export type PoolFeeConfigReader = {
  getFeeConfig(): Promise<unknown>;
};

export type PoolReader = {
  getFeeConfig(): Promise<unknown>;
  getPrivateBalance(): Promise<unknown>;
};

export type CreateOwnedNotePoolReaderInput = {
  ownedNotes: OwnedNoteStore;
  fees: PoolFeeConfig | PoolFeeConfigReader;
  programAddress: string;
  ownerAddress: string;
};

export async function getPoolFeeConfig(
  pool: PoolReader,
): Promise<PoolFeeConfig> {
  return poolFeeConfigSchema.parse(await pool.getFeeConfig());
}

export async function getPrivateBalance(
  pool: PoolReader,
): Promise<PrivateBalance> {
  return privateBalanceSchema.parse(await pool.getPrivateBalance());
}

export function createOwnedNotePoolReader(
  input: CreateOwnedNotePoolReaderInput,
): PoolReader {
  const feeConfigReader = isPoolFeeConfigReader(input.fees) ? input.fees : null;
  const feeConfig =
    feeConfigReader === null ? poolFeeConfigSchema.parse(input.fees) : null;

  return {
    async getFeeConfig() {
      if (feeConfig !== null) return feeConfig;

      return getPoolFeeConfigFromReader(feeConfigReader);
    },
    async getPrivateBalance() {
      const ownedNotes = await input.ownedNotes.listOwnedNotes({
        programAddress: input.programAddress,
        ownerAddress: input.ownerAddress,
      });

      return getOwnedNoteBalance(ownedNotes);
    },
  };
}

async function getPoolFeeConfigFromReader(
  reader: PoolFeeConfigReader | null,
): Promise<PoolFeeConfig> {
  if (reader === null) {
    throw new Error("Pool fee config reader is missing.");
  }

  return poolFeeConfigSchema.parse(await reader.getFeeConfig());
}

function isPoolFeeConfigReader(
  value: PoolFeeConfig | PoolFeeConfigReader,
): value is PoolFeeConfigReader {
  return typeof (value as PoolFeeConfigReader).getFeeConfig === "function";
}
