import type {
  PreparedPrivateOperation,
  PrivateOperationReceipt,
  PrivateOperationDraft,
} from "@/features/transfer/types/transfer.types";

export type TransferFlowStatus =
  | "editing"
  | "reviewing"
  | "preparing"
  | "prepared"
  | "signing"
  | "submitted"
  | "failed";

export type TransferFlowState = {
  status: TransferFlowStatus;
  draft: PrivateOperationDraft | null;
  error: string | null;
  preparedOperation: PreparedPrivateOperation | null;
  receipt: PrivateOperationReceipt | null;
};

export type TransferFlowAction =
  | {
      type: "review";
      draft: PrivateOperationDraft;
    }
  | {
      type: "cancel";
    }
  | {
      type: "prepare-started";
    }
  | {
      type: "prepare-succeeded";
      preparedOperation: PreparedPrivateOperation;
    }
  | {
      type: "prepare-failed";
      error: string;
    }
  | {
      type: "execute-started";
    }
  | {
      type: "execute-succeeded";
      receipt: PrivateOperationReceipt;
    }
  | {
      type: "execute-failed";
      error: string;
    };

export const initialTransferFlowState: TransferFlowState = {
  status: "editing",
  draft: null,
  error: null,
  preparedOperation: null,
  receipt: null,
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
      preparedOperation: null,
      receipt: null,
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
      preparedOperation: null,
      receipt: null,
    };
  }

  if (action.type === "prepare-succeeded") {
    return {
      status: "prepared",
      draft: state.draft,
      error: null,
      preparedOperation: action.preparedOperation,
      receipt: null,
    };
  }

  if (action.type === "execute-started") {
    if (!state.preparedOperation) {
      return state;
    }

    return {
      status: "signing",
      draft: state.draft,
      error: null,
      preparedOperation: state.preparedOperation,
      receipt: null,
    };
  }

  if (action.type === "execute-succeeded") {
    if (!state.preparedOperation) {
      return state;
    }

    return {
      status: "submitted",
      draft: state.draft,
      error: null,
      preparedOperation: state.preparedOperation,
      receipt: action.receipt,
    };
  }

  return {
    status: "failed",
    draft: state.draft,
    error: action.error,
    preparedOperation: state.preparedOperation,
    receipt: null,
  };
}
