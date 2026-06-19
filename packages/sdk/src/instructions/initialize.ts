import type {
  AccountMeta,
  Address,
  Instruction,
  InstructionWithAccounts,
  InstructionWithData,
  ReadonlyUint8Array,
  TransactionSigner,
} from "@solana/kit";

import type { PoolAddressValues } from "@/addresses";
import { findPoolAddressValues } from "@/addresses";
import { programAddress as defaultProgramAddress } from "@/constants";
import { getInitializeInstructionAsync } from "@/generated/instructions";

export type BuildInitializeInstructionInput = {
  authority: TransactionSigner;
  programAddress?: Address;
  poolAddresses?: PoolAddressValues;
};

export type BuiltInitializeInstruction = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

export async function buildInitializeInstruction(
  input: BuildInitializeInstructionInput,
): Promise<BuiltInitializeInstruction> {
  const programAddress = input.programAddress ?? defaultProgramAddress;
  const poolAddresses =
    input.poolAddresses ?? (await findPoolAddressValues({ programAddress }));

  return await getInitializeInstructionAsync(
    {
      treeAccount: poolAddresses.treeAccount,
      treeTokenAccount: poolAddresses.treeTokenAccount,
      globalConfig: poolAddresses.globalConfig,
      authority: input.authority,
    },
    { programAddress },
  );
}
