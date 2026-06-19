"use client";

import {
  createPrivateClient,
  type ChainRpc,
  type Client,
  type PoolFeeConfig,
  type PoseidonHasher,
  type TransactionRpc,
} from "@gorbagana/privacy-trash-client";
import {
  address,
  createSolanaRpc,
  type Address,
  type SignatureBytes,
  type Transaction,
  type TransactionSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/kit";
import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";

import { env } from "@/config/env";
import {
  BASE_WITHDRAWAL_FEE_LAMPORTS,
  DEPOSIT_FEE_BASIS_POINTS,
  PROTOCOL_FEE_BASIS_POINTS,
} from "@/features/transfer/logic/fees";
import { getHasherWasmInput } from "@/features/transfer/logic/hasher";
import {
  bytesFromBase64,
  encodePrivacyIdentityMessage,
  type PrivacyIdentity,
} from "@/features/wallet/logic/privacy-identity";

const FEE_ERROR_MARGIN_BASIS_POINTS = 500;
const storageProbeKey = "privacy-trash:private-client:probe";

export type WalletTransactionSignerInput = {
  address: string;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
};

export type PrivateClientWalletInput = {
  privacyIdentity: PrivacyIdentity;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
};

function createBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is unavailable.");
  }

  const storage = window.sessionStorage;
  storage.setItem(storageProbeKey, "1");
  storage.removeItem(storageProbeKey);

  return storage;
}

function normalizeSignature(signature: Uint8Array): SignatureBytes {
  if (signature.byteLength !== 64) {
    throw new Error("Wallet returned an invalid transaction signature.");
  }

  return signature as SignatureBytes;
}

function findRequiredSignature(input: {
  signedTransaction: VersionedTransaction;
  signerAddress: string;
}): SignatureBytes {
  const signerIndex = input.signedTransaction.message.staticAccountKeys.findIndex(
    (publicKey) => publicKey.toBase58() === input.signerAddress,
  );

  if (signerIndex < 0) {
    throw new Error("Wallet signer is not required by the prepared transaction.");
  }

  const signature = input.signedTransaction.signatures[signerIndex];
  if (!signature) {
    throw new Error("Wallet did not return a transaction signature.");
  }

  if (signature.every((byte) => byte === 0)) {
    throw new Error("Wallet returned an empty transaction signature.");
  }

  return normalizeSignature(signature);
}

export function createWalletTransactionSigner(
  input: WalletTransactionSignerInput,
): TransactionSigner {
  const signerAddress = address(input.address);

  return {
    address: signerAddress,
    async signTransactions(
      transactions: readonly (Transaction &
        TransactionWithinSizeLimit &
        TransactionWithLifetime)[],
    ) {
      return await Promise.all(
        transactions.map(async (transaction) => {
          const message = VersionedMessage.deserialize(
            new Uint8Array(transaction.messageBytes),
          );
          const signedTransaction = await input.signTransaction(
            new VersionedTransaction(message),
          );

          return {
            [signerAddress]: findRequiredSignature({
              signedTransaction,
              signerAddress: input.address,
            }),
          } satisfies Record<Address, SignatureBytes>;
        }),
      );
    },
  };
}

async function loadPoseidonHasher(): Promise<PoseidonHasher> {
  const { WasmFactory } = (await import("@lightprotocol/hasher.rs")) as {
    WasmFactory: {
      loadHasher(options?: {
        wasm?: ReturnType<typeof getHasherWasmInput> | undefined;
      }): Promise<PoseidonHasher>;
    };
  };

  return await WasmFactory.loadHasher({ wasm: getHasherWasmInput() });
}

function createFeeConfig(): PoolFeeConfig {
  return {
    depositFeeBps: DEPOSIT_FEE_BASIS_POINTS,
    withdrawalFeeBps: Number(PROTOCOL_FEE_BASIS_POINTS),
    feeErrorMarginBps: FEE_ERROR_MARGIN_BASIS_POINTS,
    withdrawRentFeeLamports: BASE_WITHDRAWAL_FEE_LAMPORTS,
  };
}

function getCircuitArtifactPath(fileName: string): string {
  const basePath = env.circuitBasePath.replace(/\/$/, "");

  return `${basePath}/${fileName}`;
}

function createCachedMessageSigner(identity: PrivacyIdentity) {
  const expectedMessage = encodePrivacyIdentityMessage(identity.message);
  const cachedSignature = bytesFromBase64(identity.signatureBase64);

  return async (message: Uint8Array) => {
    if (!bytesEqual(message, expectedMessage)) {
      throw new Error("Wallet unlock message changed. Refresh and try again.");
    }

    return cachedSignature;
  };
}

export async function createFrontendPrivateClient(
  input: PrivateClientWalletInput,
): Promise<Client> {
  const rpc = createSolanaRpc(
    env.gorbaganaRpcUrl as Parameters<typeof createSolanaRpc>[0],
  ) as ChainRpc & TransactionRpc;
  const signer = createWalletTransactionSigner({
    address: input.privacyIdentity.walletAddress,
    signTransaction: input.signTransaction,
  });

  return createPrivateClient({
    wallet: {
      address: input.privacyIdentity.walletAddress,
      signMessage: createCachedMessageSigner(input.privacyIdentity),
    },
    signer,
    storage: createBrowserStorage(),
    rpc,
    programAddress: env.privacyTrashProgramAddress,
    feeRecipient: env.privacyTrashFeeRecipient,
    lookupTableAddresses:
      env.privacyTrashAltAddress === undefined
        ? undefined
        : [env.privacyTrashAltAddress],
    indexerBaseUrl: env.privacyTrashApiUrl,
    explorerBaseUrl: env.explorerBaseUrl,
    hasher: await loadPoseidonHasher(),
    fees: createFeeConfig(),
    wasm: getCircuitArtifactPath("transaction2.wasm"),
    zkey: getCircuitArtifactPath("transaction2.zkey"),
  });
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}
