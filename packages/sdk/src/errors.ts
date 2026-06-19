import {
  isProgramError,
  type Address,
  type SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  type SolanaError,
} from "@solana/kit";

import { programAddress } from "@/constants";

export const contractErrorCodes = {
  unauthorized: 0x1770,
  extDataHashMismatch: 0x1771,
  unknownRoot: 0x1772,
  invalidPublicAmountData: 0x1773,
  insufficientFundsForWithdrawal: 0x1774,
  insufficientFundsForFee: 0x1775,
  invalidProof: 0x1776,
  invalidFee: 0x1777,
  invalidExtAmount: 0x1778,
  publicAmountCalculationError: 0x1779,
  arithmeticOverflow: 0x177a,
  depositLimitExceeded: 0x177b,
  invalidFeeRate: 0x177c,
  invalidFeeRecipient: 0x177d,
  invalidFeeAmount: 0x177e,
  recipientMismatch: 0x177f,
  merkleTreeFull: 0x1780,
  invalidTokenAccount: 0x1781,
  invalidMintAddress: 0x1782,
  invalidTokenAccountMintAddress: 0x1783,
} as const;

export type ContractErrorKey = keyof typeof contractErrorCodes;

export type ContractErrorCode =
  (typeof contractErrorCodes)[ContractErrorKey];

export type ContractErrorName =
  (typeof contractErrorDetails)[ContractErrorCode]["name"];

export type ContractError = {
  code: ContractErrorCode;
  name: ContractErrorName;
  message: string;
};

export type TransactionMessageWithProgramAddresses = {
  instructions: Record<number, { programAddress: Address }>;
};

const contractErrorDetails = {
  [contractErrorCodes.unauthorized]: {
    name: "Unauthorized",
    message: "Not authorized to perform this action",
  },
  [contractErrorCodes.extDataHashMismatch]: {
    name: "ExtDataHashMismatch",
    message: "External data hash does not match the one in the proof",
  },
  [contractErrorCodes.unknownRoot]: {
    name: "UnknownRoot",
    message: "Root is not known in the tree",
  },
  [contractErrorCodes.invalidPublicAmountData]: {
    name: "InvalidPublicAmountData",
    message: "Public amount is invalid",
  },
  [contractErrorCodes.insufficientFundsForWithdrawal]: {
    name: "InsufficientFundsForWithdrawal",
    message: "Insufficient funds for withdrawal",
  },
  [contractErrorCodes.insufficientFundsForFee]: {
    name: "InsufficientFundsForFee",
    message: "Insufficient funds for fee",
  },
  [contractErrorCodes.invalidProof]: {
    name: "InvalidProof",
    message: "Proof is invalid",
  },
  [contractErrorCodes.invalidFee]: {
    name: "InvalidFee",
    message: "Invalid fee: fee must be less than MAX_ALLOWED_VAL (2^248).",
  },
  [contractErrorCodes.invalidExtAmount]: {
    name: "InvalidExtAmount",
    message:
      "Invalid ext amount: absolute ext_amount must be less than MAX_ALLOWED_VAL (2^248).",
  },
  [contractErrorCodes.publicAmountCalculationError]: {
    name: "PublicAmountCalculationError",
    message: "Public amount calculation resulted in an overflow/underflow.",
  },
  [contractErrorCodes.arithmeticOverflow]: {
    name: "ArithmeticOverflow",
    message: "Arithmetic overflow/underflow occurred",
  },
  [contractErrorCodes.depositLimitExceeded]: {
    name: "DepositLimitExceeded",
    message: "Deposit limit exceeded",
  },
  [contractErrorCodes.invalidFeeRate]: {
    name: "InvalidFeeRate",
    message: "Invalid fee rate: must be between 0 and 10000 basis points",
  },
  [contractErrorCodes.invalidFeeRecipient]: {
    name: "InvalidFeeRecipient",
    message: "Fee recipient does not match global configuration",
  },
  [contractErrorCodes.invalidFeeAmount]: {
    name: "InvalidFeeAmount",
    message:
      "Fee amount is below minimum required (must be at least (1 - fee_error_margin) * expected_fee)",
  },
  [contractErrorCodes.recipientMismatch]: {
    name: "RecipientMismatch",
    message: "Recipient account does not match the ExtData recipient",
  },
  [contractErrorCodes.merkleTreeFull]: {
    name: "MerkleTreeFull",
    message: "Merkle tree is full: cannot add more leaves",
  },
  [contractErrorCodes.invalidTokenAccount]: {
    name: "InvalidTokenAccount",
    message: "Invalid token account: account is not owned by the token program",
  },
  [contractErrorCodes.invalidMintAddress]: {
    name: "InvalidMintAddress",
    message: "Invalid mint address: mint address is not allowed",
  },
  [contractErrorCodes.invalidTokenAccountMintAddress]: {
    name: "InvalidTokenAccountMintAddress",
    message: "Invalid token account mint address",
  },
} as const satisfies Record<
  ContractErrorCode,
  { name: string; message: string }
>;

export const contractErrorMessages = Object.fromEntries(
  Object.entries(contractErrorDetails).map(([code, details]) => [
    Number(code),
    details.message,
  ]),
) as Record<ContractErrorCode, string>;

export function isKnownContractErrorCode(
  code: number,
): code is ContractErrorCode {
  return Object.hasOwn(contractErrorDetails, code);
}

export function getContractError(code: number): ContractError | null {
  if (!isKnownContractErrorCode(code)) {
    return null;
  }

  return {
    code,
    ...contractErrorDetails[code],
  };
}

export function getContractErrorMessage(code: number): string | null {
  return getContractError(code)?.message ?? null;
}

export function isContractError(
  error: unknown,
  transactionMessage: TransactionMessageWithProgramAddresses,
): error is ContractSolanaError<ContractErrorCode>;
export function isContractError<TCode extends ContractErrorCode>(
  error: unknown,
  transactionMessage: TransactionMessageWithProgramAddresses,
  code: TCode,
): error is ContractSolanaError<TCode>;
export function isContractError<TCode extends ContractErrorCode>(
  error: unknown,
  transactionMessage: TransactionMessageWithProgramAddresses,
  code?: TCode,
): error is ContractSolanaError<TCode | ContractErrorCode> {
  if (!isProgramError(error, transactionMessage, programAddress, code)) {
    return false;
  }

  return typeof code === "number" || isKnownContractErrorCode(error.context.code);
}

export function parseContractError(
  error: unknown,
  transactionMessage: TransactionMessageWithProgramAddresses,
): ContractError | null {
  if (!isProgramError(error, transactionMessage, programAddress)) {
    return null;
  }

  return getContractError(error.context.code);
}

type ContractSolanaError<TCode extends number> = SolanaError<
  typeof SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM
> &
  Readonly<{ context: Readonly<{ code: TCode }> }>;
