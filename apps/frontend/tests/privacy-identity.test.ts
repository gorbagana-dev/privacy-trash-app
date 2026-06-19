import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import {
  base64FromBytes,
  buildPrivacyIdentityMessage,
  encodePrivacyIdentityMessage,
  getOrCreatePrivacyIdentity,
  getPrivacyIdentityCacheKey,
  PrivacyIdentityError,
  type PrivacyIdentityCache,
} from "@/features/wallet/logic/privacy-identity";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const secondProgramAddress = "11111111111111111111111111111111";

function createMemoryCache(): PrivacyIdentityCache {
  const values = new Map<string, string>();

  return {
    delete(key) {
      values.delete(key);
    },
    get(key) {
      return values.get(key) ?? null;
    },
    set(key, value) {
      values.set(key, value);
    },
  };
}

function createSigningFixture() {
  const privateKey = Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const walletAddress = new PublicKey(ed25519.getPublicKey(privateKey)).toBase58();
  const signMessage = vi.fn(async (message: Uint8Array) =>
    ed25519.sign(message, privateKey),
  );

  return {
    signMessage,
    walletAddress,
  };
}

describe("privacy identity message", () => {
  it("builds a stable key-derivation message", () => {
    const { walletAddress } = createSigningFixture();

    expect(
      buildPrivacyIdentityMessage({
        programAddress,
        walletAddress,
      }),
    ).toBe(`Privacy Trash

Purpose: Unlock encrypted private GOR notes
Cluster: Gorbagana
Program: ${programAddress}
Version: 1

This signature is used only to derive your local note key.
It cannot move funds or approve transactions.`);
  });

  it("does not include timestamp or nonce fields", () => {
    const { walletAddress } = createSigningFixture();
    const message = buildPrivacyIdentityMessage({
      programAddress,
      walletAddress,
    });

    expect(message).not.toMatch(/timestamp|nonce|expires|issued at/i);
  });

  it("changes cache keys by wallet and program", () => {
    const { walletAddress } = createSigningFixture();
    const secondWalletAddress = new PublicKey(
      ed25519.getPublicKey(Uint8Array.from(Array.from({ length: 32 }, () => 9))),
    ).toBase58();

    expect(
      getPrivacyIdentityCacheKey({
        programAddress,
        walletAddress,
      }),
    ).not.toBe(
      getPrivacyIdentityCacheKey({
        programAddress: secondProgramAddress,
        walletAddress,
      }),
    );
    expect(
      getPrivacyIdentityCacheKey({
        programAddress,
        walletAddress,
      }),
    ).not.toBe(
      getPrivacyIdentityCacheKey({
        programAddress,
        walletAddress: secondWalletAddress,
      }),
    );
  });
});

describe("privacy identity signing", () => {
  it("signs once and reuses a verified session cache entry", async () => {
    const { signMessage, walletAddress } = createSigningFixture();
    const cache = createMemoryCache();

    const first = await getOrCreatePrivacyIdentity({
      cache,
      programAddress,
      signMessage,
      walletAddress,
    });
    const second = await getOrCreatePrivacyIdentity({
      cache,
      programAddress,
      signMessage,
      walletAddress,
    });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.signatureBase64).toBe(first.signatureBase64);
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  it("drops an invalid cached signature and signs again", async () => {
    const { signMessage, walletAddress } = createSigningFixture();
    const cache = createMemoryCache();
    const cacheKey = getPrivacyIdentityCacheKey({
      programAddress,
      walletAddress,
    });

    cache.set(cacheKey, base64FromBytes(new Uint8Array(64)));

    const identity = await getOrCreatePrivacyIdentity({
      cache,
      programAddress,
      signMessage,
      walletAddress,
    });

    expect(identity.fromCache).toBe(false);
    expect(cache.get(cacheKey)).toBe(identity.signatureBase64);
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  it("normalizes rejected signatures", async () => {
    const { walletAddress } = createSigningFixture();

    await expect(
      getOrCreatePrivacyIdentity({
        cache: createMemoryCache(),
        programAddress,
        signMessage: async () => {
          throw new Error("User rejected the request");
        },
        walletAddress,
      }),
    ).rejects.toMatchObject({
      code: "signature_rejected",
      message: "Signature request was rejected.",
    } satisfies Partial<PrivacyIdentityError>);
  });

  it("rejects signatures that do not verify for the wallet", async () => {
    const { walletAddress } = createSigningFixture();

    await expect(
      getOrCreatePrivacyIdentity({
        cache: createMemoryCache(),
        programAddress,
        signMessage: async () => encodePrivacyIdentityMessage("not a signature"),
        walletAddress,
      }),
    ).rejects.toMatchObject({
      code: "invalid_signature",
      message: "Wallet returned an invalid signature.",
    } satisfies Partial<PrivacyIdentityError>);
  });
});
