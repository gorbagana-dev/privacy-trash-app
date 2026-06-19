"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionButtonState = "idle" | "loading" | "success";

type ActionButtonProps = ComponentProps<typeof Button> & {
  loadingLabel?: ReactNode;
  state?: ActionButtonState;
  successLabel?: ReactNode;
};

export function ActionButton({
  children,
  className,
  disabled,
  loadingLabel,
  state = "idle",
  successLabel,
  ...props
}: ActionButtonProps) {
  const isLoading = state === "loading";
  const isSuccess = state === "success";
  const label = isLoading
    ? (loadingLabel ?? children)
    : isSuccess
      ? (successLabel ?? children)
      : children;

  return (
    <Button
      aria-busy={isLoading}
      data-state={state}
      disabled={disabled || isLoading}
      className={cn("gap-2 overflow-hidden", className)}
      {...props}
    >
      <span className="inline-flex min-w-0 items-center justify-center gap-2">
        {isLoading ? <SpinnerIcon /> : null}
        {isSuccess ? <CheckIcon /> : null}
        <span className="truncate">{label}</span>
      </span>
    </Button>
  );
}

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m6 12.5 3.5 3.5L18 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}
