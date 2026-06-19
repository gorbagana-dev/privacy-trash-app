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
import { getTransactInstructionAsync } from "@/generated/instructions";

export type NullifierAddresses = readonly [
  Address,
  Address,
  Address,
  Address,
];

export type TransactProof = {
  proofA: ReadonlyUint8Array;
  proofB: ReadonlyUint8Array;
  proofC: ReadonlyUint8Array;
  root: ReadonlyUint8Array;
  publicAmount: ReadonlyUint8Array;
  extDataHash: ReadonlyUint8Array;
  inputNullifiers: readonly [ReadonlyUint8Array, ReadonlyUint8Array];
  outputCommitments: readonly [ReadonlyUint8Array, ReadonlyUint8Array];
};

export type TransactExtData = {
  extAmount: number | bigint;
  fee: number | bigint;
};

export type BuildTransactInstructionInput = {
  signer: TransactionSigner;
  recipient: Address;
  feeRecipient: Address;
  nullifiers: NullifierAddresses;
  proof: TransactProof;
  extData: TransactExtData;
  encryptedOutput1: ReadonlyUint8Array;
  encryptedOutput2: ReadonlyUint8Array;
  programAddress?: Address;
  poolAddresses?: PoolAddressValues;
};

export type BuiltTransactInstruction = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

export async function buildTransactInstruction(
  input: BuildTransactInstructionInput,
): Promise<BuiltTransactInstruction> {
  const programAddress = input.programAddress ?? defaultProgramAddress;
  const poolAddresses =
    input.poolAddresses ?? (await findPoolAddressValues({ programAddress }));

  return await getTransactInstructionAsync(
    {
      treeAccount: poolAddresses.treeAccount,
      treeTokenAccount: poolAddresses.treeTokenAccount,
      globalConfig: poolAddresses.globalConfig,
      nullifier0: input.nullifiers[0],
      nullifier1: input.nullifiers[1],
      nullifier2: input.nullifiers[2],
      nullifier3: input.nullifiers[3],
      recipient: input.recipient,
      feeRecipientAccount: input.feeRecipient,
      signer: input.signer,
      proof: {
        ...input.proof,
        inputNullifiers: [...input.proof.inputNullifiers],
        outputCommitments: [...input.proof.outputCommitments],
      },
      extDataMinified: input.extData,
      encryptedOutput1: input.encryptedOutput1,
      encryptedOutput2: input.encryptedOutput2,
    },
    { programAddress },
  );
}
