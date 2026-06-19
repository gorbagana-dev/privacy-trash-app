import type {
  PreparedTransfer,
  TransferDraft,
} from "@/features/transfer/types/transfer.types";

export type TransferFlowStatus =
  | "editing"
  | "reviewing"
  | "preparing"
  | "prepared"
  | "signing"
  | "submitted"
  | "failed";

export type TransferFlowState =
  | {
      status: "editing";
      draft: null;
      error: null;
      preparedTransfer: null;
    }
  | {
      status: "reviewing" | "preparing" | "failed";
      draft: TransferDraft;
      error: string | null;
      preparedTransfer: null;
    }
  | {
      status: "prepared" | "signing" | "submitted";
      draft: TransferDraft;
      error: null;
      preparedTransfer: PreparedTransfer;
    };

export type TransferFlowAction =
  | {
      type: "review";
      draft: TransferDraft;
    }
  | {
      type: "cancel";
    }
  | {
      type: "prepare-started";
    }
  | {
      type: "prepare-succeeded";
      preparedTransfer: PreparedTransfer;
    }
  | {
      type: "prepare-failed";
      error: string;
    };

export const initialTransferFlowState: TransferFlowState = {
  status: "editing",
  draft: null,
  error: null,
  preparedTransfer: null,
};

export function transferFlowReducer(
  state: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  if (action.type === "cancel") {
    return initialTransferFlowState;
  }

  if (action.type === "review") {
    return {
      status: "reviewing",
      draft: action.draft,
      error: null,
      preparedTransfer: null,
    };
  }

  if (!state.draft) {
    return state;
  }

  if (action.type === "prepare-started") {
    return {
      status: "preparing",
      draft: state.draft,
      error: null,
      preparedTransfer: null,
    };
  }

  if (action.type === "prepare-succeeded") {
    return {
      status: "prepared",
      draft: state.draft,
      error: null,
      preparedTransfer: action.preparedTransfer,
    };
  }

  return {
    status: "failed",
    draft: state.draft,
    error: action.error,
    preparedTransfer: null,
  };
}
