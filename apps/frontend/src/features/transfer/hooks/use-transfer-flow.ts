"use client";

import { useCallback, useReducer } from "react";

import { prepareTransfer as prepareTransferDraft } from "@/features/transfer/logic/prepare-transfer";
import type { TransferDraft } from "@/features/transfer/types/transfer.types";
import {
  initialTransferFlowState,
  transferFlowReducer,
} from "@/features/transfer/logic/transfer-flow.reducer";
import { usePrivacyIdentity } from "@/features/wallet/hooks/use-privacy-identity";

export type {
  PreparedTransfer,
  TransferDraft,
} from "@/features/transfer/types/transfer.types";
export type { TransferFlowStatus } from "@/features/transfer/logic/transfer-flow.reducer";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to prepare transfer.";
}

export function useTransferFlow() {
  const [state, dispatch] = useReducer(
    transferFlowReducer,
    initialTransferFlowState,
  );
  const { getPrivacyIdentity } = usePrivacyIdentity();

  const reviewTransfer = useCallback((draft: TransferDraft) => {
    dispatch({ type: "review", draft });
  }, []);

  const cancelReview = useCallback(() => {
    dispatch({ type: "cancel" });
  }, []);

  const prepareTransfer = useCallback(async () => {
    if (!state.draft) {
      return;
    }

    const draft = state.draft;

    dispatch({ type: "prepare-started" });

    try {
      const preparedTransfer = await prepareTransferDraft(draft, {
        getPrivacyIdentity,
      });

      dispatch({
        type: "prepare-succeeded",
        preparedTransfer,
      });
    } catch (error) {
      dispatch({
        type: "prepare-failed",
        error: getErrorMessage(error),
      });
    }
  }, [getPrivacyIdentity, state.draft]);

  const failTransfer = useCallback((error: string) => {
    dispatch({ type: "prepare-failed", error });
  }, []);

  return {
    cancelReview,
    failTransfer,
    prepareTransfer,
    reviewTransfer,
    state,
  };
}
