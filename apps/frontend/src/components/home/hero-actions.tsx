"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

const primaryButtonClassName =
  "inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-[#4dff91] px-8 font-heading text-base font-bold italic text-black uppercase transition hover:bg-[#67ffa2] active:scale-[0.98]";

const secondaryButtonClassName =
  "inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-white px-8 font-heading text-base font-bold italic text-black uppercase transition hover:bg-zinc-200 active:scale-[0.98]";

export function HeroActions() {
  const focusTransferForm = () => {
    const target = document.getElementById("transfer");
    const amountInput = document.getElementById("transfer-amount");

    target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    amountInput?.focus({ preventScroll: true });
  };

  return (
    <div className="mt-14 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        className={primaryButtonClassName}
        onClick={focusTransferForm}
      >
        Start Transfer
      </button>
      <Link href="/how-it-works" className={cn(secondaryButtonClassName)}>
        How It Works
      </Link>
    </div>
  );
}
