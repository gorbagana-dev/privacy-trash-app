import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";

import {
  createRelayerService,
  RelayerConfigurationError,
} from "@/modules/relayer/relayer.service";
import { relayerTransferRequestSchema } from "@/modules/relayer/relayer.schema";

function base64Bytes(length: number, value: number): string {
  return Buffer.from(new Uint8Array(length).fill(value)).toString("base64");
}

function createTransferRequest() {
  return relayerTransferRequestSchema.parse({
    programAddress: "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se",
    recipient: "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
    feeRecipient: "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
    nullifiers: [
      "BXK4w4ZNi5jbm8n5iS22z6d1eLyyAqNu3bm1KBoegVyL",
      "48JDPc91uGGyic2roMgbfAU7svJeHN3WN5TJHPCHuKuS",
      "6dx35etGjd7hh5BHKjf1sAxZPbnFZAfqLEKr5D8VoyWf",
      "gSEh8xDJBB2ifRJWNwdcJShDpbFDjhRpeag62iNT3fX",
    ],
    proof: {
      proofA: base64Bytes(64, 1),
      proofB: base64Bytes(128, 2),
      proofC: base64Bytes(64, 3),
      root: base64Bytes(32, 4),
      publicAmount: base64Bytes(32, 5),
      extDataHash: base64Bytes(32, 6),
      inputNullifiers: [base64Bytes(32, 7), base64Bytes(32, 8)],
      outputCommitments: [base64Bytes(32, 9), base64Bytes(32, 10)],
    },
    extData: {
      extAmount: "-1000000",
      fee: "2500",
    },
    encryptedOutput1: base64Bytes(96, 11),
    encryptedOutput2: base64Bytes(96, 12),
  });
}

function createService(input: {
  keypairPath?: string | undefined;
  privateKeyBase58?: string | undefined;
  keypairJson?: string | undefined;
} = {}) {
  return createRelayerService({
    rpcUrl: "http://localhost:8899",
    programAddress: address("GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se"),
    feeRecipient: address("WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn"),
    explorerBaseUrl: "https://explorer.gorbagana.wtf",
    keypairPath: input.keypairPath,
    privateKeyBase58: input.privateKeyBase58,
    keypairJson: input.keypairJson,
    confirmationTimeoutMs: 60_000,
    confirmationPollIntervalMs: 1_000,
    maxSendRetries: 5,
  });
}

describe("relayer service", () => {
  it("rejects missing keypair configuration before calling RPC", async () => {
    await expect(
      createService().simulateTransfer(createTransferRequest()),
    ).rejects.toThrow(RelayerConfigurationError);
  });

  it("rejects invalid keypair JSON before calling RPC", async () => {
    await expect(
      createService({ keypairJson: "not-json" }).simulateTransfer(
        createTransferRequest(),
      ),
    ).rejects.toThrow(RelayerConfigurationError);
  });

  it("rejects invalid base58 private keys before calling RPC", async () => {
    await expect(
      createService({ privateKeyBase58: "not base58" }).simulateTransfer(
        createTransferRequest(),
      ),
    ).rejects.toThrow(RelayerConfigurationError);
  });

  it("rejects ambiguous relayer key configuration before calling RPC", async () => {
    await expect(
      createService({
        keypairPath: ".keys/relayer-keypair.json",
        keypairJson: "[]",
      }).simulateTransfer(createTransferRequest()),
    ).rejects.toThrow(RelayerConfigurationError);
  });
});
