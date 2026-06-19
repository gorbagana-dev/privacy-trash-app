import {
  address,
  getBase64Decoder,
  lamports,
  type Address,
  type Lamports,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { fetchPoolState } from "@/accounts";
import { programAddress } from "@/constants";
import {
  getGlobalConfigEncoder,
  getMerkleTreeAccountEncoder,
  getTreeTokenAccountEncoder,
} from "@/generated/accounts";

type FetchPoolStateInput = Parameters<typeof fetchPoolState>[0];
type TestRpc = FetchPoolStateInput["rpc"];

type RpcCall = {
  address: Address;
  config: Record<string, unknown>;
};

type EncodedAccountFixture = {
  data: ReadonlyUint8Array;
  lamports: Lamports;
};

const authority = address("WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn");
const treeAccount = address("62Vz7FCpmK4M5VjvHUfNcnxE5UT5mNmwR4JAxj1QQJu6");
const treeTokenAccount = address(
  "CpqLo63qu3dKEVAvEBNdD5pqXRNdu9ZfkYX9Y3f3W2d5",
);
const globalConfig = address("2whjn3A2dAHDyLydFpsyqE4jsLEDWCkny1SCFrGEMoLz");

describe("fetchPoolState", () => {
  it("fetches and maps the native pool accounts", async () => {
    const root = bytes(32, 7);
    const vaultBalance = lamports(123_456_789n);
    const calls: RpcCall[] = [];
    const rpc = createRpc(
      {
        [globalConfig]: {
          data: getGlobalConfigEncoder().encode({
            authority,
            depositFeeRate: 25,
            withdrawalFeeRate: 30,
            feeErrorMargin: 2,
            bump: 253,
          }),
          lamports: lamports(1_000_000n),
        },
        [treeAccount]: {
          data: getMerkleTreeAccountEncoder().encode({
            authority,
            nextIndex: 42n,
            subtrees: repeatedBytes(26, 32, 1),
            root,
            rootHistory: repeatedBytes(100, 32, 2),
            rootIndex: 3n,
            maxDepositAmount: 10_000_000_000n,
            height: 26,
            rootHistorySize: 100,
            bump: 254,
            padding: bytes(5, 0),
          }),
          lamports: lamports(2_000_000n),
        },
        [treeTokenAccount]: {
          data: getTreeTokenAccountEncoder().encode({
            authority,
            bump: 252,
          }),
          lamports: vaultBalance,
        },
      },
      calls,
    );

    const state = await fetchPoolState({
      rpc,
      fetchConfig: { commitment: "confirmed" },
    });

    expect(state).toEqual({
      addresses: {
        treeAccount,
        treeTokenAccount,
        globalConfig,
      },
      authority,
      fees: {
        depositFeeRate: 25,
        withdrawalFeeRate: 30,
        feeErrorMargin: 2,
      },
      tree: {
        nextIndex: 42n,
        root,
        rootIndex: 3n,
        maxDepositAmount: 10_000_000_000n,
        height: 26,
        rootHistorySize: 100,
      },
      vault: {
        authority,
        balanceLamports: vaultBalance,
      },
      bumps: {
        globalConfig: 253,
        treeAccount: 254,
        treeTokenAccount: 252,
      },
    });
    expect(calls).toEqual([
      {
        address: globalConfig,
        config: { commitment: "confirmed", encoding: "base64" },
      },
      {
        address: treeAccount,
        config: { commitment: "confirmed", encoding: "base64" },
      },
      {
        address: treeTokenAccount,
        config: { commitment: "confirmed", encoding: "base64" },
      },
    ]);
  });
});

function createRpc(
  accounts: Record<string, EncodedAccountFixture>,
  calls: RpcCall[],
): TestRpc {
  return {
    getAccountInfo(accountAddress: Address, config: Record<string, unknown>) {
      calls.push({ address: accountAddress, config });
      const account = accounts[accountAddress];

      return {
        async send() {
          return {
            value: account
              ? {
                  data: [toBase64(account.data), "base64"] as const,
                  executable: false,
                  lamports: account.lamports,
                  owner: programAddress,
                  space: BigInt(account.data.length),
                }
              : null,
          };
        },
      };
    },
  } as TestRpc;
}

function toBase64(data: ReadonlyUint8Array): string {
  return getBase64Decoder().decode(data);
}

function repeatedBytes(
  count: number,
  length: number,
  value: number,
): ReadonlyUint8Array[] {
  return Array.from({ length: count }, () => bytes(length, value));
}

function bytes(length: number, value: number): ReadonlyUint8Array {
  return new Uint8Array(length).fill(value);
}
