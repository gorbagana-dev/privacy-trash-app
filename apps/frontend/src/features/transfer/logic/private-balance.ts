import {
  scanPrivateNotes,
  type BrowserNoteIdentity,
  type Indexer,
  type PrivateNoteScan,
  type ScanPrivateNotesInput,
} from "@gorbagana/privacy-trash-client/browser";

import { getHasherWasmInput } from "@/features/transfer/logic/hasher";
import { privacyIndexer } from "@/features/transfer/logic/indexer";
import { LAMPORTS_PER_GOR } from "@/features/transfer/schemas/transfer.schema";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

export type ScanPrivateBalanceInput = {
  identity: PrivacyIdentity;
  indexer?: Pick<Indexer, "getOutputRange" | "getNullifierStatus"> | undefined;
  scanNotes?: ((input: ScanPrivateNotesInput) => Promise<PrivateNoteScan>) | undefined;
};

function toBrowserNoteIdentity(identity: PrivacyIdentity): BrowserNoteIdentity {
  return {
    programAddress: identity.programAddress,
    signatureBase64: identity.signatureBase64,
    walletAddress: identity.walletAddress,
  };
}

export async function scanPrivateBalance({
  identity,
  indexer = privacyIndexer,
  scanNotes = scanPrivateNotes,
}: ScanPrivateBalanceInput): Promise<PrivateNoteScan> {
  const scanInput = {
    identity: toBrowserNoteIdentity(identity),
    hasherWasm: getHasherWasmInput(),
    indexer,
    programAddress: identity.programAddress,
  } satisfies ScanPrivateNotesInput;
  const firstScan = await scanNotes(scanInput);

  if (firstScan.unspentNoteCount > 0 || firstScan.totalOutputCount === 0) {
    return firstScan;
  }

  return await scanNotes({
    ...scanInput,
    syncMode: "full",
  });
}

export function formatPrivateBalance(lamports: bigint): string {
  if (lamports === 0n) {
    return "0.00";
  }

  const cents = (lamports * 100n) / LAMPORTS_PER_GOR;
  if (cents === 0n) {
    return "<0.01";
  }

  const whole = cents / 100n;
  const fractional = (cents % 100n).toString().padStart(2, "0");

  return `${whole.toString()}.${fractional}`;
}
