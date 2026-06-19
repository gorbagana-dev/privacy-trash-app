import { describe, expect, it, vi } from "vitest";

import {
  createUnlockMessage,
  encodeUnlockMessage,
  normalizeWalletAddress,
  signWalletMessage,
  validateWallet,
  type Wallet,
} from "@/wallet";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const ownerAddress = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";

describe("wallet", () => {
  it("normalizes and validates wallet signing capability", () => {
    const wallet: Wallet = {
      address: ownerAddress,
      signMessage: vi.fn(async () => new Uint8Array([1])),
    };

    expect(normalizeWalletAddress({ address: ownerAddress })).toBe(ownerAddress);
    expect(validateWallet(wallet)).toMatchObject({ address: ownerAddress });
    expect(() => validateWallet(null)).toThrow("Wallet is required");
    expect(() => validateWallet({ address: ownerAddress })).toThrow(
      "Wallet must provide signMessage(message)",
    );
  });

  it("signs encoded unlock messages and validates signature bytes", async () => {
    const signature = new Uint8Array([9, 8, 7]);
    const wallet: Wallet = {
      address: ownerAddress,
      signMessage: vi.fn(async () => signature),
    };

    expect(createUnlockMessage({ programAddress })).toContain(
      `Program: ${programAddress}`,
    );
    await expect(
      signWalletMessage(wallet, encodeUnlockMessage({ programAddress })),
    ).resolves.toBe(signature);

    await expect(
      signWalletMessage(
        {
          address: ownerAddress,
          signMessage: vi.fn(async () => new Uint8Array()),
        },
        new Uint8Array([1]),
      ),
    ).rejects.toThrow("Wallet signature must be non-empty bytes");
  });
});
