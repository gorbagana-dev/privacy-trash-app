import type {
  DepositQuote,
  IndexerStatus,
  MerkleState,
  PrivateNoteScan,
} from "@gorbagana/privacy-trash-client/browser";
import type {
  DepositReceipt,
  PreparedDeposit as ClientPreparedDeposit,
  PreparedTransfer as ClientPreparedTransfer,
  TransferReceipt,
} from "@gorbagana/privacy-trash-client";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

export type DepositDraft = {
  mode: "deposit";
  amount: string;
  amountLamports: bigint;
  signer: string;
};

export type TransferDraft = {
  mode: "transfer";
  amount: string;
  amountLamports: bigint;
  recipient: string;
  signer: string;
};

export type PrivateOperationDraft = DepositDraft | TransferDraft;

export type PreparedDeposit = {
  mode: "deposit";
  amount: string;
  clientPreparedOperation: ClientPreparedDeposit;
  depositAmountLamports: bigint;
  depositFeeLamports: bigint;
  merkleState: MerkleState;
  privateOutputLamports: bigint;
  privacyIdentity: PrivacyIdentity;
  quote: DepositQuote;
  signer: string;
};

export type PreparedTransfer = {
  mode: "transfer";
  baseWithdrawalFeeLamports: bigint;
  clientPreparedOperation: ClientPreparedTransfer;
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

export type PreparedPrivateOperation = PreparedDeposit | PreparedTransfer;

export type PrivateOperationReceipt =
  | ({
      mode: "deposit";
    } & DepositReceipt)
  | ({
      mode: "transfer";
    } & TransferReceipt);
