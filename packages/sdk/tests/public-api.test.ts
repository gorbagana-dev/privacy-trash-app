import { describe, expect, it } from "vitest";

import {
  buildInitializeInstruction,
  buildTransactInstruction,
  contractErrorCodes,
  fetchPoolState,
  findPoolAddressValues,
  findPoolAddresses,
  getContractError,
  identifyInstruction,
  parseContractError,
  parseInstruction,
  programAddress,
} from "@gorbagana/privacy-trash-sdk";

describe("public package API", () => {
  it("exports the intended root SDK surface", () => {
    expect(programAddress).toBe("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se");
    expect(typeof findPoolAddresses).toBe("function");
    expect(typeof findPoolAddressValues).toBe("function");
    expect(typeof fetchPoolState).toBe("function");
    expect(typeof buildInitializeInstruction).toBe("function");
    expect(typeof buildTransactInstruction).toBe("function");
    expect(typeof identifyInstruction).toBe("function");
    expect(typeof parseInstruction).toBe("function");
    expect(typeof parseContractError).toBe("function");
    expect(contractErrorCodes.invalidProof).toBe(0x1776);
    expect(getContractError(contractErrorCodes.invalidProof)?.name).toBe(
      "InvalidProof",
    );
  });
});
