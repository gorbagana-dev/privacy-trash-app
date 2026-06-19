import type {
  IndexerStatus,
  PrivateNoteScan,
} from "@gorbagana/privacy-trash-client/browser";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

export type TransferDraft = {
  amount: string;
  amountLamports: bigint;
  recipient: string;
  signer: string;
};

export type PreparedTransfer = {
  baseWithdrawalFeeLamports: bigint;
  estimatedNetworkFeeLamports: bigint;
  estimatedTotalFeeLamports: bigint;
  grossPrivateSpendLamports: bigint;
  privateNotes: PrivateNoteScan;
  poolStatus: IndexerStatus;
  privacyIdentity: PrivacyIdentity;
  protocolFeeLamports: bigint;
  recipientAmountLamports: bigint;
  recipient: string;
  signer: string;
};
