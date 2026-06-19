import type { IndexerStatus } from "@gorbagana/privacy-trash-client/browser";
import { describe, expect, it } from "vitest";

import { prepareTransfer } from "@/features/transfer/logic/prepare-transfer";
import type { TransferDraft } from "@/features/transfer/types/transfer.types";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";
import {
  initialTransferFlowState,
  transferFlowReducer,
} from "@/features/transfer/logic/transfer-flow.reducer";

const draft: TransferDraft = {
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

describe("transfer flow reducer", () => {
  it("moves from editing to reviewing", () => {
    const state = transferFlowReducer(initialTransferFlowState, {
      type: "review",
      draft,
    });

    expect(state.status).toBe("reviewing");
    expect(state.draft).toBe(draft);
    expect(state.preparedTransfer).toBeNull();
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
      getPrivacyIdentity,
      indexer,
      scanPrivateNotes,
    });
    const preparedState = transferFlowReducer(preparingState, {
      type: "prepare-succeeded",
      preparedTransfer,
    });

    expect(preparingState.status).toBe("preparing");
    expect(preparedState.status).toBe("prepared");
    expect(preparedState.preparedTransfer).toBe(preparedTransfer);
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
