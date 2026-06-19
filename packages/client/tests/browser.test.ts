import {
  UTXO_ENCRYPTION_VERSION_V2,
  createSignatureNoteKeyDeriver,
  deriveNoteKey,
  scanPrivateNotes,
  type BrowserNoteIdentity,
  type KeyValueStorage,
  type PoseidonHasher,
  PrivateNoteScanError,
} from "@/browser";
import { describe, expect, it, vi } from "vitest";

const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";
const walletAddress = "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn";
const nativeMintSentinel = "11111111111111111111111111111112";
const firstNullifier =
  "00000000000000000000000000000000000000000000000000000000000003ec";
const secondNullifier =
  "00000000000000000000000000000000000000000000000000000000000007d4";

class TestStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createIdentity(signature: Uint8Array): BrowserNoteIdentity {
  return {
    programAddress,
    signatureBase64: base64FromBytes(signature),
    walletAddress,
  };
}

function createHasher(outputs: string[]): PoseidonHasher {
  return {
    poseidonHashString: vi.fn(() => {
      const output = outputs.shift();

      if (output === undefined) {
        throw new Error("Unexpected Poseidon hash call.");
      }

      return output;
    }),
  };
}

describe("browser private note scanning", () => {
  it("syncs encrypted outputs, decrypts owned notes, and excludes spent nullifiers", async () => {
    const signature = new Uint8Array([1, 2, 3, 4]);
    const noteKey = await deriveNoteKey(createSignatureNoteKeyDeriver(), {
      programAddress,
      ownerAddress: walletAddress,
      unlockSignature: signature,
    });
    const encryptedOutputs = [
      await encryptUtxoPayload({
        noteKey,
        payload: `100|9|7|${nativeMintSentinel}`,
      }),
      await encryptUtxoPayload({
        noteKey,
        payload: `50|10|8|${nativeMintSentinel}`,
      }),
    ];
    const indexer = {
      getOutputRange: vi.fn(
        async (input: { start: string | number | bigint; end: string | number | bigint }) => {
          const start = Number(input.start);
          const end = Number(input.end);
          const outputs = encryptedOutputs.slice(start, end);

          return {
            total: encryptedOutputs.length,
            hasMore: end < encryptedOutputs.length,
            encryptedOutputs: outputs,
          };
        },
      ),
      getNullifierStatus: vi.fn(async (input: { nullifier: string }) => ({
        spent: input.nullifier === secondNullifier,
        nullifier: input.nullifier,
        txSignature: null,
        instructionIndex: null,
        slot: null,
        spentAt: null,
      })),
    };

    await expect(
      scanPrivateNotes({
        identity: createIdentity(signature),
        indexer,
        programAddress,
        storage: new TestStorage(),
        syncBatchSize: 1,
        getHasher: async () =>
          createHasher([
            "1001",
            "1002",
            "1003",
            "1004",
            "2001",
            "2002",
            "2003",
            "2004",
          ]),
      }),
    ).resolves.toEqual({
      balanceLamports: 100n,
      fetchedOutputCount: 2,
      hasMore: false,
      nextOutputOffset: 2,
      ownedNoteCount: 2,
      privateBalanceLamports: 100n,
      totalOutputCount: 2,
      unspentNoteCount: 1,
    });

    expect(indexer.getOutputRange).toHaveBeenNthCalledWith(1, {
      start: 0,
      end: 1,
    });
    expect(indexer.getOutputRange).toHaveBeenNthCalledWith(2, {
      start: 1,
      end: 2,
    });
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: firstNullifier,
    });
    expect(indexer.getNullifierStatus).toHaveBeenCalledWith({
      nullifier: secondNullifier,
    });
    expect(JSON.stringify(indexer.getOutputRange.mock.calls)).not.toContain(
      base64FromBytes(signature),
    );
    expect(JSON.stringify(indexer.getNullifierStatus.mock.calls)).not.toContain(
      base64FromBytes(signature),
    );
  });

  it("fails if the identity belongs to another program", async () => {
    await expect(
      scanPrivateNotes({
        identity: {
          ...createIdentity(new Uint8Array([1])),
          programAddress: "11111111111111111111111111111111",
        },
        indexer: {
          getOutputRange: vi.fn(),
          getNullifierStatus: vi.fn(),
        },
        programAddress,
        storage: new TestStorage(),
        getHasher: async () => createHasher([]),
      }),
    ).rejects.toMatchObject({
      code: "wallet_changed",
      message: "Wallet changed. Reconnect the original wallet and try again.",
    } satisfies Partial<PrivateNoteScanError>);
  });
});

async function encryptUtxoPayload(input: {
  noteKey: Uint8Array;
  payload: string;
}): Promise<string> {
  const iv = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(input.noteKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      new TextEncoder().encode(input.payload),
    ),
  );
  const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.byteLength - 16);
  const authTag = encryptedWithTag.slice(encryptedWithTag.byteLength - 16);

  return base64FromBytes(
    concatBytes([
      UTXO_ENCRYPTION_VERSION_V2,
      iv,
      authTag,
      ciphertext,
    ]),
  );
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return globalThis.btoa(binary);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}
