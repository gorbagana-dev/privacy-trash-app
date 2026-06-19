"use client";

import { useCallback, useReducer, useRef } from "react";
import type { Client } from "@gorbagana/privacy-trash-client";

import { executeOperation as executePreparedOperation } from "@/features/transfer/logic/execute-operation";
import { prepareDeposit as prepareDepositDraft } from "@/features/transfer/logic/prepare-deposit";
import { prepareTransfer as prepareTransferDraft } from "@/features/transfer/logic/prepare-transfer";
import type { PrivateOperationDraft } from "@/features/transfer/types/transfer.types";
import {
  initialTransferFlowState,
  transferFlowReducer,
} from "@/features/transfer/logic/transfer-flow.reducer";
import { usePrivateClient } from "@/features/transfer/hooks/use-private-client";
import { usePrivacyIdentity } from "@/features/wallet/hooks/use-privacy-identity";
import type { PrivacyIdentity } from "@/features/wallet/logic/privacy-identity";

export type {
  DepositDraft,
  PreparedDeposit,
  PreparedPrivateOperation,
  PreparedTransfer,
  PrivateOperationReceipt,
  PrivateOperationDraft,
  TransferDraft,
} from "@/features/transfer/types/transfer.types";
export type { TransferFlowStatus } from "@/features/transfer/logic/transfer-flow.reducer";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to prepare private operation.";
}

export function useTransferFlow() {
  const [state, dispatch] = useReducer(
    transferFlowReducer,
    initialTransferFlowState,
  );
  const { getPrivacyIdentity } = usePrivacyIdentity();
  const { createClient } = usePrivateClient();
  const clientRef = useRef<{
    walletAddress: string;
    client: Client;
  } | null>(null);

  const getClientForIdentity = useCallback(
    async (privacyIdentity: PrivacyIdentity) => {
      if (clientRef.current?.walletAddress === privacyIdentity.walletAddress) {
        return clientRef.current.client;
      }

      const client = await createClient(privacyIdentity);
      clientRef.current = {
        walletAddress: privacyIdentity.walletAddress,
        client,
      };

      return client;
    },
    [createClient],
  );

  const reviewOperation = useCallback((draft: PrivateOperationDraft) => {
    dispatch({ type: "review", draft });
  }, []);

  const cancelReview = useCallback(() => {
    dispatch({ type: "cancel" });
  }, []);

  const prepareOperation = useCallback(async () => {
    if (!state.draft) {
      return;
    }

    const draft = state.draft;

    dispatch({ type: "prepare-started" });

    try {
      const privacyIdentity = await getPrivacyIdentity();
      const client = await getClientForIdentity(privacyIdentity);
      const preparedOperation =
        draft.mode === "deposit"
          ? await prepareDepositDraft(draft, {
              client,
              privacyIdentity,
            })
          : await prepareTransferDraft(draft, {
              client,
              privacyIdentity,
            });

      dispatch({
        type: "prepare-succeeded",
        preparedOperation,
      });
    } catch (error) {
      dispatch({
        type: "prepare-failed",
        error: getErrorMessage(error),
      });
    }
  }, [getClientForIdentity, getPrivacyIdentity, state.draft]);

  const executeOperation = useCallback(async () => {
    if (!state.preparedOperation) {
      return;
    }

    dispatch({ type: "execute-started" });

    try {
      const client = await getClientForIdentity(
        state.preparedOperation.privacyIdentity,
      );
      const receipt = await executePreparedOperation(state.preparedOperation, {
        client,
      });

      dispatch({
        type: "execute-succeeded",
        receipt,
      });
    } catch (error) {
      dispatch({
        type: "execute-failed",
        error: getErrorMessage(error),
      });
    }
  }, [getClientForIdentity, state.preparedOperation]);

  const failTransfer = useCallback((error: string) => {
    dispatch({ type: "prepare-failed", error });
  }, []);

  return {
    cancelReview,
    executeOperation,
    failTransfer,
    prepareOperation,
    prepareTransfer: prepareOperation,
    reviewOperation,
    reviewTransfer: reviewOperation,
    state,
  };
}
