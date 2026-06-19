import type {
  AccountMeta,
  Address,
  Instruction,
  InstructionWithAccounts,
  InstructionWithData,
  ReadonlyUint8Array,
} from "@solana/kit";

import { programAddress as defaultProgramAddress } from "@/constants";
import {
  parseInitializeInstruction,
  parseTransactInstruction,
} from "@/generated/instructions";
import {
  identifyZkcashInstruction,
  ZkcashInstruction,
} from "@/generated/programs";

export type NativeInstructionKind = "initialize" | "transact";

export type IdentifyInstructionConfig = {
  programAddress?: Address;
};

export type ParsableInstruction<
  TProgram extends string = string,
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
> = Instruction<TProgram> &
  InstructionWithAccounts<TAccountMetas> &
  InstructionWithData<ReadonlyUint8Array>;

export type IdentifiableInstruction<TProgram extends string = string> =
  Instruction<TProgram> & InstructionWithData<ReadonlyUint8Array>;

export type ParsedInitializeInstruction<
  TProgram extends string = string,
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
> = {
  kind: "initialize";
  programAddress: Address<TProgram>;
  accounts: {
    treeAccount: TAccountMetas[0];
    treeTokenAccount: TAccountMetas[1];
    globalConfig: TAccountMetas[2];
    authority: TAccountMetas[3];
    systemProgram: TAccountMetas[4];
  };
};

export type ParsedTransactInstruction<
  TProgram extends string = string,
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
> = {
  kind: "transact";
  programAddress: Address<TProgram>;
  accounts: {
    treeAccount: TAccountMetas[0];
    nullifier0: TAccountMetas[1];
    nullifier1: TAccountMetas[2];
    nullifier2: TAccountMetas[3];
    nullifier3: TAccountMetas[4];
    treeTokenAccount: TAccountMetas[5];
    globalConfig: TAccountMetas[6];
    recipient: TAccountMetas[7];
    feeRecipient: TAccountMetas[8];
    signer: TAccountMetas[9];
    systemProgram: TAccountMetas[10];
  };
  data: {
    proof: {
      proofA: ReadonlyUint8Array;
      proofB: ReadonlyUint8Array;
      proofC: ReadonlyUint8Array;
      root: ReadonlyUint8Array;
      publicAmount: ReadonlyUint8Array;
      extDataHash: ReadonlyUint8Array;
      inputNullifiers: ReadonlyUint8Array[];
      outputCommitments: ReadonlyUint8Array[];
    };
    extData: {
      extAmount: bigint;
      fee: bigint;
    };
    encryptedOutput1: ReadonlyUint8Array;
    encryptedOutput2: ReadonlyUint8Array;
  };
};

export type ParsedInstruction<
  TProgram extends string = string,
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
> =
  | ParsedInitializeInstruction<TProgram, TAccountMetas>
  | ParsedTransactInstruction<TProgram, TAccountMetas>;

export function identifyInstruction<TProgram extends string>(
  instruction: IdentifiableInstruction<TProgram>,
  config: IdentifyInstructionConfig = {},
): NativeInstructionKind | null {
  if (!isExpectedProgram(instruction, config)) {
    return null;
  }

  try {
    switch (identifyZkcashInstruction(instruction)) {
      case ZkcashInstruction.Initialize:
        return "initialize";
      case ZkcashInstruction.Transact:
        return "transact";
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function parseInstruction<
  TProgram extends string,
  TAccountMetas extends readonly AccountMeta[],
>(
  instruction: ParsableInstruction<TProgram, TAccountMetas>,
  config: IdentifyInstructionConfig = {},
): ParsedInstruction<TProgram, TAccountMetas> | null {
  const kind = identifyInstruction(instruction, config);

  if (kind === "initialize") {
    const parsed = parseInitializeInstruction(instruction);

    return {
      kind,
      programAddress: parsed.programAddress,
      accounts: parsed.accounts,
    };
  }

  if (kind === "transact") {
    const parsed = parseTransactInstruction(instruction);

    return {
      kind,
      programAddress: parsed.programAddress,
      accounts: {
        treeAccount: parsed.accounts.treeAccount,
        nullifier0: parsed.accounts.nullifier0,
        nullifier1: parsed.accounts.nullifier1,
        nullifier2: parsed.accounts.nullifier2,
        nullifier3: parsed.accounts.nullifier3,
        treeTokenAccount: parsed.accounts.treeTokenAccount,
        globalConfig: parsed.accounts.globalConfig,
        recipient: parsed.accounts.recipient,
        feeRecipient: parsed.accounts.feeRecipientAccount,
        signer: parsed.accounts.signer,
        systemProgram: parsed.accounts.systemProgram,
      },
      data: {
        proof: parsed.data.proof,
        extData: parsed.data.extDataMinified,
        encryptedOutput1: parsed.data.encryptedOutput1,
        encryptedOutput2: parsed.data.encryptedOutput2,
      },
    };
  }

  return null;
}

function isExpectedProgram(
  instruction: Instruction,
  config: IdentifyInstructionConfig,
): boolean {
  return instruction.programAddress === (config.programAddress ?? defaultProgramAddress);
}
