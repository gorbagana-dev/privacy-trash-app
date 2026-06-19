import type {
  Address,
  FetchAccountConfig,
  Lamports,
  ReadonlyUint8Array,
  fetchEncodedAccount,
} from "@solana/kit";

import type { FindPoolAddressesConfig, PoolAddressValues } from "@/addresses";
import { findPoolAddressValues } from "@/addresses";
import {
  fetchGlobalConfig,
  fetchMerkleTreeAccount,
  fetchTreeTokenAccount,
} from "@/generated/accounts";

export type AccountFetchRpc = Parameters<typeof fetchEncodedAccount>[0];

export type FetchPoolStateConfig = FindPoolAddressesConfig & {
  rpc: AccountFetchRpc;
  fetchConfig?: FetchAccountConfig;
};

export type PoolState = {
  addresses: PoolAddressValues;
  authority: Address;
  fees: {
    depositFeeRate: number;
    withdrawalFeeRate: number;
    feeErrorMargin: number;
  };
  tree: {
    nextIndex: bigint;
    root: ReadonlyUint8Array;
    rootIndex: bigint;
    maxDepositAmount: bigint;
    height: number;
    rootHistorySize: number;
  };
  vault: {
    authority: Address;
    balanceLamports: Lamports;
  };
  bumps: {
    globalConfig: number;
    treeAccount: number;
    treeTokenAccount: number;
  };
};

export async function fetchPoolState(
  config: FetchPoolStateConfig,
): Promise<PoolState> {
  const { rpc, fetchConfig } = config;
  const addressConfig = getAddressConfig(config);
  const addresses = await findPoolAddressValues(addressConfig);

  const [globalConfig, treeAccount, treeTokenAccount] = await Promise.all([
    fetchGlobalConfig(rpc, addresses.globalConfig, fetchConfig),
    fetchMerkleTreeAccount(rpc, addresses.treeAccount, fetchConfig),
    fetchTreeTokenAccount(rpc, addresses.treeTokenAccount, fetchConfig),
  ]);

  return {
    addresses,
    authority: globalConfig.data.authority,
    fees: {
      depositFeeRate: globalConfig.data.depositFeeRate,
      withdrawalFeeRate: globalConfig.data.withdrawalFeeRate,
      feeErrorMargin: globalConfig.data.feeErrorMargin,
    },
    tree: {
      nextIndex: treeAccount.data.nextIndex,
      root: treeAccount.data.root,
      rootIndex: treeAccount.data.rootIndex,
      maxDepositAmount: treeAccount.data.maxDepositAmount,
      height: treeAccount.data.height,
      rootHistorySize: treeAccount.data.rootHistorySize,
    },
    vault: {
      authority: treeTokenAccount.data.authority,
      balanceLamports: treeTokenAccount.lamports,
    },
    bumps: {
      globalConfig: globalConfig.data.bump,
      treeAccount: treeAccount.data.bump,
      treeTokenAccount: treeTokenAccount.data.bump,
    },
  };
}

function getAddressConfig(config: FindPoolAddressesConfig): FindPoolAddressesConfig {
  return config.programAddress ? { programAddress: config.programAddress } : {};
}
