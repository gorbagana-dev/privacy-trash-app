import type { Address, ProgramDerivedAddress } from "@solana/kit";

import {
  findGlobalConfigPda,
  findTreeAccountPda,
  findTreeTokenAccountPda,
} from "@/generated/pdas";

export type FindPoolAddressesConfig = {
  programAddress?: Address;
};

export type PoolAddresses = {
  treeAccount: ProgramDerivedAddress;
  treeTokenAccount: ProgramDerivedAddress;
  globalConfig: ProgramDerivedAddress;
};

export type PoolAddressValues = {
  treeAccount: Address;
  treeTokenAccount: Address;
  globalConfig: Address;
};

export async function findPoolAddresses(
  config: FindPoolAddressesConfig = {},
): Promise<PoolAddresses> {
  const [treeAccount, treeTokenAccount, globalConfig] = await Promise.all([
    findTreeAccountPda(config),
    findTreeTokenAccountPda(config),
    findGlobalConfigPda(config),
  ]);

  return {
    treeAccount,
    treeTokenAccount,
    globalConfig,
  };
}

export async function findPoolAddressValues(
  config: FindPoolAddressesConfig = {},
): Promise<PoolAddressValues> {
  const addresses = await findPoolAddresses(config);

  return {
    treeAccount: addresses.treeAccount[0],
    treeTokenAccount: addresses.treeTokenAccount[0],
    globalConfig: addresses.globalConfig[0],
  };
}
