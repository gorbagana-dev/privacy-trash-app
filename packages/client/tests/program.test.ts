import { describe, expect, it } from "vitest";

import {
  addressSchema,
  bytesToHex,
  createNullifierAccounts,
  createPublicInputEncoder,
  deriveNullifierAccounts,
  encodePublicAmount,
  hashExtData,
} from "@/index";

const programAddress = addressSchema.parse(
  "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
);
const recipient = addressSchema.parse(
  "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
);
const feeRecipient = addressSchema.parse(
  "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
);
const nullifier =
  "a18374f434fb827b5a877b197ebec62ab828a4828619a5c4144cc069db260d19";
const zeroNullifier = "0".repeat(64);

describe("program", () => {
  it("derives the four transact nullifier PDAs from the Anchor seeds", async () => {
    await expect(
      deriveNullifierAccounts({
        programAddress,
        inputNullifiers: [nullifier, zeroNullifier],
      }),
    ).resolves.toEqual([
      "3Ykp2B1JoG2w2DkSrPrsNhFtDZU3wwycbGAokaCWDBra",
      "EXiYK2eGQR2AJJWrbJrUYPHjvntzMiBXt7EKiP96tShB",
      "ARMRaBSSR8NDgnw5HqEMazF4XsofpGu386CWSSssrJwW",
      "5Rf6UHv2RCBJrCHpjAgntFrDXaZsFHASQ6jGYFC5sKhC",
    ]);
  });

  it("creates a nullifier resolver for the circuit prover", async () => {
    const nullifierAccounts = createNullifierAccounts();

    await expect(
      nullifierAccounts.resolveNullifierAccounts({
        programAddress,
        ownerAddress: feeRecipient,
        inputNullifiers: [nullifier, zeroNullifier],
        outputCommitments: [zeroNullifier, zeroNullifier],
      }),
    ).resolves.toEqual([
      "3Ykp2B1JoG2w2DkSrPrsNhFtDZU3wwycbGAokaCWDBra",
      "EXiYK2eGQR2AJJWrbJrUYPHjvntzMiBXt7EKiP96tShB",
      "ARMRaBSSR8NDgnw5HqEMazF4XsofpGu386CWSSssrJwW",
      "5Rf6UHv2RCBJrCHpjAgntFrDXaZsFHASQ6jGYFC5sKhC",
    ]);
  });

  it("encodes withdrawal public amount as a canonical BN254 field element", () => {
    expect(
      bytesToHex(
        encodePublicAmount({
          extAmount: -1_002_506n,
          fee: 2_506n,
        }),
      ),
    ).toBe(
      "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593eff0aa2d",
    );
  });

  it("encodes deposit public amount as ext amount minus fee", () => {
    expect(
      bytesToHex(
        encodePublicAmount({
          extAmount: 1_000_000n,
          fee: 2_500n,
        }),
      ),
    ).toBe(
      "00000000000000000000000000000000000000000000000000000000000f387c",
    );
  });

  it("rejects deposit amounts that cannot cover the fee", () => {
    expect(() =>
      encodePublicAmount({
        extAmount: 10n,
        fee: 10n,
      }),
    ).toThrow("deposit amount must be greater than the fee");
  });

  it("hashes ext data with the Anchor/Borsh layout expected by transact", () => {
    expect(
      bytesToHex(
        hashExtData({
          extData: {
            extAmount: -1_002_506n,
            fee: 2_506n,
          },
          recipient,
          feeRecipient,
          encryptedOutputs: [
            new Uint8Array([1, 2, 3]),
            new Uint8Array([4, 5]),
          ],
          outputCommitments: [zeroNullifier, zeroNullifier],
        }),
      ),
    ).toBe(
      "0696bb2fa1e9a98903e9f23f202b7506a75d29e4ca8d7fdf2456a6f0b272b100",
    );
  });

  it("creates a public input encoder for the circuit prover", async () => {
    const encoder = createPublicInputEncoder();

    await expect(
      encoder.encodePublicAmount({
        extAmount: -1_002_506n,
        fee: 2_506n,
      }),
    ).resolves.toEqual(
      encodePublicAmount({
        extAmount: -1_002_506n,
        fee: 2_506n,
      }),
    );
  });
});
