import { describe, expect, it, vi } from "vitest";

import {
  addressSchema,
  createOwnedNotePoolReader,
  getPoolFeeConfig,
  getPrivateBalance,
  poolFeeConfigSchema,
  type OwnedNoteStore,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const ownerAddress = addressSchema.parse(
  "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
);
const commitmentA =
  "118374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const commitmentB =
  "218374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifierA =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const nullifierB =
  "b18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";

describe("pool", () => {
  it("validates pool fee config and private balance reads", async () => {
    const pool = {
      getFeeConfig: async () => ({
        depositFeeBps: 0,
        withdrawalFeeBps: 25,
        feeErrorMarginBps: 500,
      }),
      getPrivateBalance: async () => ({ lamports: 123n }),
    };

    await expect(getPoolFeeConfig(pool)).resolves.toEqual({
      depositFeeBps: 0,
      withdrawalFeeBps: 25,
      feeErrorMarginBps: 500,
      withdrawRentFeeLamports: 0n,
    });
    await expect(getPrivateBalance(pool)).resolves.toEqual({ lamports: 123n });
  });

  it("rejects invalid basis points", () => {
    expect(() =>
      poolFeeConfigSchema.parse({
        depositFeeBps: 0,
        withdrawalFeeBps: 10_001,
        feeErrorMarginBps: 500,
      }),
    ).toThrow();
  });

  it("reads private balance from owned notes", async () => {
    const ownedNotes: OwnedNoteStore = {
      listOwnedNotes: vi.fn(async () => [
        {
          commitment: commitmentA,
          encryptedOutput: "aa",
          outputIndex: 0,
          nullifier: nullifierA,
          amountLamports: 4n,
          witness: {},
        },
        {
          commitment: commitmentB,
          encryptedOutput: "bb",
          outputIndex: 1,
          nullifier: nullifierB,
          amountLamports: 10n,
          witness: {},
        },
      ]),
    };
    const pool = createOwnedNotePoolReader({
      ownedNotes,
      fees: {
        depositFeeBps: 0,
        withdrawalFeeBps: 25,
        feeErrorMarginBps: 500,
        withdrawRentFeeLamports: 2n,
      },
      programAddress,
      ownerAddress,
    });

    await expect(getPrivateBalance(pool)).resolves.toEqual({ lamports: 14n });
    await expect(getPoolFeeConfig(pool)).resolves.toEqual({
      depositFeeBps: 0,
      withdrawalFeeBps: 25,
      feeErrorMarginBps: 500,
      withdrawRentFeeLamports: 2n,
    });
    expect(ownedNotes.listOwnedNotes).toHaveBeenCalledWith({
      programAddress,
      ownerAddress,
    });
  });

  it("can read fee config from a fee reader", async () => {
    const fees = {
      getFeeConfig: vi.fn(async () => ({
        depositFeeBps: 0,
        withdrawalFeeBps: 35,
        feeErrorMarginBps: 500,
      })),
    };
    const pool = createOwnedNotePoolReader({
      ownedNotes: {
        listOwnedNotes: vi.fn(async () => []),
      },
      fees,
      programAddress,
      ownerAddress,
    });

    await expect(getPoolFeeConfig(pool)).resolves.toEqual({
      depositFeeBps: 0,
      withdrawalFeeBps: 35,
      feeErrorMarginBps: 500,
      withdrawRentFeeLamports: 0n,
    });
    expect(fees.getFeeConfig).toHaveBeenCalledOnce();
  });
});
