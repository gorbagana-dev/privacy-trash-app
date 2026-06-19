import {
  address,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SolanaError,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { programAddress } from "@/constants";
import {
  contractErrorCodes,
  getContractError,
  getContractErrorMessage,
  isContractError,
  isKnownContractErrorCode,
  parseContractError,
} from "@/errors";

describe("contract errors", () => {
  it("maps known program error codes to stable SDK details", () => {
    expect(contractErrorCodes.invalidProof).toBe(0x1776);
    expect(isKnownContractErrorCode(contractErrorCodes.invalidProof)).toBe(true);
    expect(getContractError(contractErrorCodes.invalidProof)).toEqual({
      code: contractErrorCodes.invalidProof,
      name: "InvalidProof",
      message: "Proof is invalid",
    });
    expect(getContractErrorMessage(contractErrorCodes.unknownRoot)).toBe(
      "Root is not known in the tree",
    );
  });

  it("returns null for unknown program error codes", () => {
    expect(isKnownContractErrorCode(999_999)).toBe(false);
    expect(getContractError(999_999)).toBeNull();
    expect(getContractErrorMessage(999_999)).toBeNull();
  });

  it("parses Solana custom errors that came from this program", () => {
    const error = new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, {
      code: contractErrorCodes.invalidFeeRecipient,
      index: 1,
    });
    const transactionMessage = {
      instructions: {
        1: { programAddress },
      },
    };

    expect(isContractError(error, transactionMessage)).toBe(true);
    expect(
      isContractError(
        error,
        transactionMessage,
        contractErrorCodes.invalidFeeRecipient,
      ),
    ).toBe(true);
    expect(
      isContractError(error, transactionMessage, contractErrorCodes.invalidProof),
    ).toBe(false);
    expect(parseContractError(error, transactionMessage)).toEqual({
      code: contractErrorCodes.invalidFeeRecipient,
      name: "InvalidFeeRecipient",
      message: "Fee recipient does not match global configuration",
    });
  });

  it("ignores custom errors from other programs", () => {
    const error = new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, {
      code: contractErrorCodes.invalidProof,
      index: 0,
    });
    const transactionMessage = {
      instructions: {
        0: { programAddress: address("11111111111111111111111111111111") },
      },
    };

    expect(isContractError(error, transactionMessage)).toBe(false);
    expect(parseContractError(error, transactionMessage)).toBeNull();
  });
});
