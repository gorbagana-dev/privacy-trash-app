import type { IndexerStatus } from "@gorbagana/privacy-trash-client/browser";
import type { PreparedTransfer as ClientPreparedTransfer } from "@gorbagana/privacy-trash-client";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";

import { prepareTransfer } from "@/features/transfer/logic/prepare-transfer";
import type { TransferDraft } from "@/features/transfer/types/transfer.types";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";
import {
  initialTransferFlowState,
  transferFlowReducer,
} from "@/features/transfer/logic/transfer-flow.reducer";

const draft: TransferDraft = {
  mode: "transfer",
  amount: "1",
  amountLamports: 1_000_000_000n,
  recipient: "GefVj3p67jPoEaEYcYz16gaa3Z2bHGfKsomrpScPxiWN",
  signer: "WWcYj6MG8n3rCp1EDvKXaBVUpPcQL7Ny9HoagafBMxn",
};
const programAddress = "GGNZHntmkQJvnApZESoUZ8PSmWT9n4jnUDsFrST866se";

const poolStatus: IndexerStatus = {
  outputCount: 4,
  spentNullifierCount: 4,
  observedRootCount: 2,
  latestOutputIndex: "3",
  latestSlot: "66920165",
};

const indexer = {
  getStatus: async () => poolStatus,
};

const privacyIdentity: PrivacyIdentity = {
  cacheKey: "privacy-trash:privacy-identity:v1:Gorbagana:program:wallet",
  fromCache: false,
  message: "Privacy Trash",
  programAddress,
  signatureBase64: "signature",
  walletAddress: draft.signer,
};

const getPrivacyIdentity = async () => privacyIdentity;
const scanPrivateNotes = async () => ({
  balanceLamports: 2_000_000_000n,
  fetchedOutputCount: 4,
  hasMore: false,
  nextOutputOffset: 4,
  ownedNoteCount: 1,
  privateBalanceLamports: 2_000_000_000n,
  totalOutputCount: 4,
  unspentNoteCount: 1,
});
const clientPreparedOperation: ClientPreparedTransfer = {
  version: 1,
  programAddress: address(programAddress),
  ownerAddress: address(draft.signer),
  recipient: address(draft.recipient),
  quote: {
    recipientLamports: 1_000_000_000n,
    privateBalanceLamports: 2_000_000_000n,
    grossWithdrawalLamports: 1_009_533_366n,
    withdrawalFeeLamports: 9_533_366n,
    shieldLamports: 0n,
    withdrawalFeeBps: 35,
    withdrawRentFeeLamports: 6_000_000n,
  },
  createdAt: "2026-06-19T00:00:00.000Z",
  payload: { kind: "test" },
};
const client = {
  unlock: async () => ({
    walletAddress: address(draft.signer),
    message: privacyIdentity.message,
    signature: new Uint8Array([1]),
  }),
  prepareTransfer: async () => clientPreparedOperation,
};

describe("transfer flow reducer", () => {
  it("moves from editing to reviewing", () => {
    const state = transferFlowReducer(initialTransferFlowState, {
      type: "review",
      draft,
    });

    expect(state.status).toBe("reviewing");
    expect(state.draft).toBe(draft);
    expect(state.preparedOperation).toBeNull();
    expect(state.receipt).toBeNull();
  });

  it("moves from reviewing to prepared", async () => {
    const reviewingState = transferFlowReducer(initialTransferFlowState, {
      type: "review",
      draft,
    });
    const preparingState = transferFlowReducer(reviewingState, {
      type: "prepare-started",
    });
    const preparedTransfer = await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });
    const preparedState = transferFlowReducer(preparingState, {
      type: "prepare-succeeded",
      preparedOperation: preparedTransfer,
    });

    expect(preparingState.status).toBe("preparing");
    expect(preparedState.status).toBe("prepared");
    expect(preparedState.preparedOperation).toBe(preparedTransfer);
  });

  it("moves from prepared to submitted", async () => {
    const reviewingState = transferFlowReducer(initialTransferFlowState, {
      type: "review",
      draft,
    });
    const preparedTransfer = await prepareTransfer(draft, {
      client,
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });
    const preparedState = transferFlowReducer(reviewingState, {
      type: "prepare-succeeded",
      preparedOperation: preparedTransfer,
    });
    const signingState = transferFlowReducer(preparedState, {
      type: "execute-started",
    });
    const receipt = {
      mode: "transfer" as const,
      signature:
        "4ap58hFAEEzFrPFgdxUaaTmJA7iMzSdcLXFTuA6JHbH6KX5gQ3MFu2WqUC2p61wmDhgjNLk6v4Ge3QoX8Api6Tua",
      sentAt: "2026-06-19T00:00:00.000Z",
    };
    const submittedState = transferFlowReducer(signingState, {
      type: "execute-succeeded",
      receipt,
    });

    expect(signingState.status).toBe("signing");
    expect(submittedState.status).toBe("submitted");
    expect(submittedState.receipt).toBe(receipt);
    expect(submittedState.preparedOperation).toBe(preparedTransfer);
  });

  it("returns to editing when cancelled", () => {
    const reviewingState = transferFlowReducer(initialTransferFlowState, {
      type: "review",
      draft,
    });
    const cancelledState = transferFlowReducer(reviewingState, {
      type: "cancel",
    });

    expect(cancelledState).toBe(initialTransferFlowState);
  });
});
