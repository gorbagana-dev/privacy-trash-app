import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";

export const PRIVACY_IDENTITY_VERSION = 1;
export const PRIVACY_IDENTITY_NETWORK = "Gorbagana";
const cachePrefix = "privacy-trash:privacy-identity";
const cacheProbeKey = `${cachePrefix}:probe`;

export type PrivacyIdentity = {
  cacheKey: string;
  fromCache: boolean;
  message: string;
  programAddress: string;
  signatureBase64: string;
  walletAddress: string;
};

export type PrivacyIdentityCache = {
  delete(key: string): void;
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type PrivacyIdentitySigner = (
  message: Uint8Array,
) => Promise<Uint8Array>;

export type GetOrCreatePrivacyIdentityInput = {
  cache?: PrivacyIdentityCache | null | undefined;
  programAddress: string;
  signMessage: PrivacyIdentitySigner;
  walletAddress: string;
};

export type PrivacyIdentityErrorCode =
  | "invalid_signature"
  | "message_signing_unsupported"
  | "signature_rejected"
  | "wallet_not_connected";

export class PrivacyIdentityError extends Error {
  readonly code: PrivacyIdentityErrorCode;

  constructor(code: PrivacyIdentityErrorCode, message: string) {
    super(message);
    this.name = "PrivacyIdentityError";
    this.code = code;
  }
}

export function buildPrivacyIdentityMessage(input: {
  programAddress: string;
  walletAddress: string;
}) {
  return [
    "Privacy Trash",
    "",
    "Sign this message to unlock your private GOR notes.",
    "",
    "This signature is used only to derive your local Privacy Trash encryption key.",
    "It does not authorize a transaction, transfer funds, or give access to your wallet.",
    "Only sign this message on a Privacy Trash site you trust.",
    "",
    `Network: ${PRIVACY_IDENTITY_NETWORK}`,
    `Program: ${input.programAddress}`,
    `Wallet: ${input.walletAddress}`,
    `Version: ${PRIVACY_IDENTITY_VERSION}`,
  ].join("\n");
}

export function encodePrivacyIdentityMessage(message: string): Uint8Array {
  return new TextEncoder().encode(message);
}

export function getPrivacyIdentityCacheKey(input: {
  programAddress: string;
  walletAddress: string;
}) {
  return [
    cachePrefix,
    `v${PRIVACY_IDENTITY_VERSION}`,
    PRIVACY_IDENTITY_NETWORK,
    input.programAddress,
    input.walletAddress,
  ].join(":");
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function verifyPrivacyIdentitySignature(input: {
  message: string;
  signatureBase64: string;
  walletAddress: string;
}) {
  try {
    return ed25519.verify(
      bytesFromBase64(input.signatureBase64),
      encodePrivacyIdentityMessage(input.message),
      new PublicKey(input.walletAddress).toBytes(),
    );
  } catch {
    return false;
  }
}

function normalizeSignature(signature: unknown): Uint8Array {
  if (signature instanceof Uint8Array) {
    return signature;
  }

  if (
    typeof signature === "object" &&
    signature !== null &&
    "signature" in signature &&
    signature.signature instanceof Uint8Array
  ) {
    return signature.signature;
  }

  throw new PrivacyIdentityError(
    "invalid_signature",
    "Wallet returned an invalid signature.",
  );
}

function isRejectedSignature(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("reject") ||
    message.includes("denied") ||
    message.includes("cancel")
  );
}

function createIdentity(input: {
  cacheKey: string;
  fromCache: boolean;
  message: string;
  programAddress: string;
  signatureBase64: string;
  walletAddress: string;
}): PrivacyIdentity {
  return input;
}

function readCachedSignature(input: {
  cache: PrivacyIdentityCache | null | undefined;
  cacheKey: string;
  message: string;
  programAddress: string;
  walletAddress: string;
}): PrivacyIdentity | null {
  const signatureBase64 = input.cache?.get(input.cacheKey);
  if (!signatureBase64) {
    return null;
  }

  if (
    verifyPrivacyIdentitySignature({
      message: input.message,
      signatureBase64,
      walletAddress: input.walletAddress,
    })
  ) {
    return createIdentity({
      cacheKey: input.cacheKey,
      fromCache: true,
      message: input.message,
      programAddress: input.programAddress,
      signatureBase64,
      walletAddress: input.walletAddress,
    });
  }

  input.cache?.delete(input.cacheKey);

  return null;
}

export async function getOrCreatePrivacyIdentity({
  cache,
  programAddress,
  signMessage,
  walletAddress,
}: GetOrCreatePrivacyIdentityInput): Promise<PrivacyIdentity> {
  const message = buildPrivacyIdentityMessage({
    programAddress,
    walletAddress,
  });
  const cacheKey = getPrivacyIdentityCacheKey({
    programAddress,
    walletAddress,
  });
  const cached = readCachedSignature({
    cache,
    cacheKey,
    message,
    programAddress,
    walletAddress,
  });

  if (cached) {
    return cached;
  }

  let signature: Uint8Array;
  try {
    signature = normalizeSignature(
      await signMessage(encodePrivacyIdentityMessage(message)),
    );
  } catch (error) {
    if (error instanceof PrivacyIdentityError) {
      throw error;
    }

    if (isRejectedSignature(error)) {
      throw new PrivacyIdentityError(
        "signature_rejected",
        "Signature request was rejected.",
      );
    }

    throw error;
  }

  const signatureBase64 = base64FromBytes(signature);

  if (
    !verifyPrivacyIdentitySignature({
      message,
      signatureBase64,
      walletAddress,
    })
  ) {
    throw new PrivacyIdentityError(
      "invalid_signature",
      "Wallet returned an invalid signature.",
    );
  }

  cache?.set(cacheKey, signatureBase64);

  return createIdentity({
    cacheKey,
    fromCache: false,
    message,
    programAddress,
    signatureBase64,
    walletAddress,
  });
}

export function createSessionPrivacyIdentityCache(): PrivacyIdentityCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.sessionStorage;
    storage.setItem(cacheProbeKey, "1");
    storage.removeItem(cacheProbeKey);

    return {
      delete(key) {
        storage.removeItem(key);
      },
      get(key) {
        return storage.getItem(key);
      },
      set(key, value) {
        storage.setItem(key, value);
      },
    };
  } catch {
    return null;
  }
}
