import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import { describe, expect, it } from "vitest";

import {
  createWalletOptions,
  normalizeWalletError,
  shouldStartWalletConnection,
} from "@/features/wallet/logic/wallet-options";

function wallet(name: string, readyState: WalletReadyState): Wallet {
  return {
    adapter: {
      icon: `https://wallet.example/${name}.svg`,
      name: name as WalletName,
      url: `https://wallet.example/${name}`,
    },
    readyState,
  } as Wallet;
}

describe("wallet options", () => {
  it("sorts wallets by readiness and name", () => {
    const options = createWalletOptions({
      activeWalletName: null,
      connecting: false,
      pendingWalletName: null,
      wallets: [
        wallet("Zulu", WalletReadyState.Unsupported),
        wallet("Phantom", WalletReadyState.Installed),
        wallet("Backpack", WalletReadyState.Installed),
        wallet("Solflare", WalletReadyState.Loadable),
        wallet("Glow", WalletReadyState.NotDetected),
      ],
    });

    expect(options.map((option) => option.label)).toEqual([
      "Backpack",
      "Phantom",
      "Solflare",
      "Glow",
      "Zulu",
    ]);
  });

  it("maps readiness to user-facing actions and statuses", () => {
    const options = createWalletOptions({
      activeWalletName: null,
      connecting: false,
      pendingWalletName: null,
      wallets: [
        wallet("Detected", WalletReadyState.Installed),
        wallet("Available", WalletReadyState.Loadable),
        wallet("Missing", WalletReadyState.NotDetected),
        wallet("Unsupported", WalletReadyState.Unsupported),
      ],
    });

    expect(options).toMatchObject([
      {
        actionLabel: "Select",
        canConnect: true,
        disabled: false,
        statusLabel: "Detected",
      },
      {
        actionLabel: "Select",
        canConnect: true,
        disabled: false,
        statusLabel: "Available",
      },
      {
        actionLabel: "Install",
        canConnect: false,
        disabled: false,
        statusLabel: "Install",
      },
      {
        actionLabel: "Select",
        canConnect: false,
        disabled: true,
        statusLabel: "Unsupported",
      },
    ]);
  });

  it("marks the selected wallet as pending while connecting", () => {
    const options = createWalletOptions({
      activeWalletName: null,
      connecting: true,
      pendingWalletName: "Phantom" as WalletName,
      wallets: [
        wallet("Phantom", WalletReadyState.Installed),
        wallet("Backpack", WalletReadyState.Installed),
      ],
    });

    expect(options).toMatchObject([
      { disabled: true, isPending: false, statusLabel: "Detected" },
      { disabled: true, isPending: true, statusLabel: "Connecting" },
    ]);
  });
});

describe("wallet errors", () => {
  it("uses a short rejected-request message", () => {
    expect(normalizeWalletError(new Error("User rejected request"), "Fallback"))
      .toBe("Request rejected.");
  });

  it("keeps useful adapter errors", () => {
    expect(normalizeWalletError(new Error("Wallet is locked"), "Fallback")).toBe(
      "Wallet is locked",
    );
  });

  it("falls back for unknown errors", () => {
    expect(normalizeWalletError("nope", "Fallback")).toBe("Fallback");
  });
});

describe("wallet connection trigger", () => {
  it("starts only when the selected wallet is active and idle", () => {
    expect(
      shouldStartWalletConnection({
        activeWalletName: "Phantom" as WalletName,
        connected: false,
        connecting: false,
        pendingWalletName: "Phantom" as WalletName,
      }),
    ).toBe(true);

    expect(
      shouldStartWalletConnection({
        activeWalletName: "Backpack" as WalletName,
        connected: false,
        connecting: false,
        pendingWalletName: "Phantom" as WalletName,
      }),
    ).toBe(false);
    expect(
      shouldStartWalletConnection({
        activeWalletName: "Phantom" as WalletName,
        connected: true,
        connecting: false,
        pendingWalletName: "Phantom" as WalletName,
      }),
    ).toBe(false);
    expect(
      shouldStartWalletConnection({
        activeWalletName: "Phantom" as WalletName,
        connected: false,
        connecting: true,
        pendingWalletName: "Phantom" as WalletName,
      }),
    ).toBe(false);
  });
});
