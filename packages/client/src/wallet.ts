import type { Address } from "@solana/kit";
import { z } from "zod";

import { addressSchema } from "@/schemas";

export const UNLOCK_MESSAGE_VERSION = 1;
export const UNLOCK_MESSAGE_PURPOSE = "Unlock encrypted private GOR notes";

const messageBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength > 0,
  { message: "Wallet message must be non-empty bytes." },
);

const signatureBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array && value.byteLength > 0,
  { message: "Wallet signature must be non-empty bytes." },
);

export const unlockMessageInputSchema = z.strictObject({
  programAddress: addressSchema,
});

export type Wallet = {
  address: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export type UnlockMessageInput = z.input<typeof unlockMessageInputSchema>;

export function normalizeWalletAddress(input: string | { address: unknown }): Address {
  const value = typeof input === "string" ? input : input.address;

  return addressSchema.parse(value);
}

export function validateWallet(wallet: unknown): Wallet {
  if (typeof wallet !== "object" || wallet === null) {
    throw new Error("Wallet is required.");
  }

  const candidate = wallet as {
    address?: unknown;
    signMessage?: unknown;
  };

  if (!addressSchema.safeParse(candidate.address).success) {
    throw new Error("Wallet address must be a valid Gorbagana address.");
  }

  if (typeof candidate.signMessage !== "function") {
    throw new Error("Wallet must provide signMessage(message).");
  }

  return {
    address: addressSchema.parse(candidate.address),
    signMessage: candidate.signMessage as Wallet["signMessage"],
  };
}

export async function signWalletMessage(
  wallet: unknown,
  message: Uint8Array,
): Promise<Uint8Array> {
  const validWallet = validateWallet(wallet);
  const signature = await validWallet.signMessage(
    messageBytesSchema.parse(message),
  );

  return signatureBytesSchema.parse(signature);
}

export function createUnlockMessage(input: UnlockMessageInput): string {
  const { programAddress } = unlockMessageInputSchema.parse(input);

  return [
    "Privacy Trash",
    "",
    `Purpose: ${UNLOCK_MESSAGE_PURPOSE}`,
    "Cluster: Gorbagana",
    `Program: ${programAddress}`,
    `Version: ${UNLOCK_MESSAGE_VERSION}`,
    "",
    "This signature is used only to derive your local note key.",
    "It cannot move funds or approve transactions.",
  ].join("\n");
}

export function encodeUnlockMessage(input: UnlockMessageInput): Uint8Array {
  return new TextEncoder().encode(createUnlockMessage(input));
}
