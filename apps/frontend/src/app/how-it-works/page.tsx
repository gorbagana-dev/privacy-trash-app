import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "How It Works | Privacy Trash",
  description: "How Privacy Trash private GOR transfers work and how to use them well.",
};

const steps = [
  {
    title: "Deposit",
    body: "Move GOR from your wallet into the shared privacy pool.",
  },
  {
    title: "Unlock",
    body: "Sign the Privacy Trash message so your browser can read your private notes.",
  },
  {
    title: "Prove",
    body: "Create a proof that you can spend private notes without revealing the original deposit.",
  },
  {
    title: "Receive",
    body: "The recipient gets GOR from the pool, not directly from your wallet.",
  },
] as const;

const tips = [
  {
    title: "Use a clean wallet",
    body: "Send to a fresh recipient wallet when privacy matters. Reused wallets make analysis easier.",
  },
  {
    title: "Let time pass",
    body: "Avoid depositing and transferring right away. A larger time gap gives the pool more cover.",
  },
  {
    title: "Avoid exact matches",
    body: "Do not transfer the exact amount you just deposited if you want stronger privacy.",
  },
  {
    title: "Prefer common amounts",
    body: "Round, common amounts blend better than strange, unique amounts.",
  },
  {
    title: "Separate activity",
    body: "Do not cluster every action in one short window from the same browser and wallet setup.",
  },
  {
    title: "Sign carefully",
    body: "Only approve the unlock message on the real Privacy Trash app.",
  },
] as const;

const privacyNotes = [
  "The recipient receives GOR from the pool instead of directly from your wallet.",
  "A clean recipient wallet gives observers less context.",
  "Round amounts and time gaps make matching harder.",
  "Only approve Privacy Trash wallet messages on the real app.",
] as const;

const states = [
  {
    title: "Review",
    body: "Check the recipient, amount, and fee before signing.",
  },
  {
    title: "Approve",
    body: "Your wallet asks you to approve the transfer.",
  },
  {
    title: "Receive",
    body: "The recipient gets GOR from the privacy pool.",
  },
  {
    title: "Refresh",
    body: "Your private balance updates for the next transfer.",
  },
] as const;

function SectionHeader({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-heading text-sm font-bold italic tracking-[0.14em] text-[#4dff91] uppercase">
        {kicker}
      </p>
      <h2 className="mt-3 font-heading text-4xl font-semibold italic leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">
        {title}
      </h2>
    </div>
  );
}

function InfoPanel({
  body,
  className,
  title,
}: {
  body: string;
  className?: string;
  title: string;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <h3 className="font-heading text-2xl font-bold italic tracking-[-0.04em] text-white">
        {title}
      </h3>
      <p className="mt-4 font-sans text-base font-medium leading-[1.45] text-zinc-500">
        {body}
      </p>
    </article>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-[100dvh] bg-[#030303] text-white">
      <section className="mx-auto flex min-h-[72dvh] w-full max-w-7xl flex-col justify-center px-6 py-20 sm:px-10 lg:px-12">
        <Link
          href="/"
          className="w-fit font-heading text-sm font-bold italic tracking-[0.14em] text-zinc-500 uppercase transition hover:text-white"
        >
          PrivacyTrash
        </Link>

        <div className="mt-20 grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div>
            <h1 className="font-heading text-[clamp(3.25rem,7vw,6.4rem)] font-semibold italic leading-[1.02] tracking-[-0.05em] text-white">
              Privacy is
              <br />
              a practice.
            </h1>
            <p className="mt-8 max-w-[610px] font-sans text-lg font-medium leading-[1.3] text-zinc-500 sm:text-xl">
              Privacy Trash breaks the direct wallet link. Your habits decide how
              strong that privacy feels in the real world.
            </p>
          </div>

          <div className="rounded-xl border border-[#4dff91]/20 bg-[#4dff91]/[0.08] p-5">
            <p className="font-heading text-3xl font-bold italic leading-[1.08] tracking-[-0.04em] text-[#4dff91]">
              The pool breaks the direct wallet link. Clean wallets, common
              amounts, and time gaps make it stronger.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-10 lg:px-12">
        <SectionHeader
          kicker="How it works"
          title="The chain sees the pool. It does not see your original deposit."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => (
            <InfoPanel key={step.title} title={step.title} body={step.body} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-10 lg:px-12">
        <SectionHeader
          kicker="Use it well"
          title="Better habits make better privacy."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-6">
          {tips.map((tip, index) => (
            <InfoPanel
              key={tip.title}
              title={tip.title}
              body={tip.body}
              className={cn(
                index === 0 || index === 3
                  ? "lg:col-span-3"
                  : "lg:col-span-2",
                index === 1 || index === 4
                  ? "bg-white/[0.055]"
                  : undefined,
              )}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-20 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:px-12">
        <SectionHeader
          kicker="Privacy hygiene"
          title="Make the private path harder to connect."
        />

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-5">
          <ul className="divide-y divide-white/[0.06]">
            {privacyNotes.map((note) => (
              <li
                key={note}
                className="py-4 font-sans text-base font-medium leading-[1.35] text-zinc-400 first:pt-0 last:pb-0"
              >
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-10 lg:px-12">
        <SectionHeader
          kicker="Transfer flow"
          title="Review, approve, receive."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {states.map((state) => (
            <InfoPanel key={state.title} title={state.title} body={state.body} />
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl font-sans text-base font-medium leading-[1.35] text-zinc-400">
            Ready to use it? Start with a small test amount, then use timing and
            amount habits that match your privacy needs.
          </p>
          <Link
            href="/#transfer"
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-[#4dff91] px-8 font-heading text-base font-bold italic text-black uppercase transition hover:bg-[#67ffa2] active:scale-[0.98]"
          >
            Start Transfer
          </Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-7xl px-6 pb-10 sm:px-10 lg:px-12">
        <p className="font-sans text-xs font-medium leading-[1.35] text-zinc-700">
          Based on the open-source{" "}
          <a
            href="https://github.com/Privacy-Cash/privacy-cash"
            target="_blank"
            rel="noreferrer"
            className="text-inherit underline decoration-zinc-700/60 underline-offset-2 transition hover:text-zinc-500"
          >
            Privacy Cash
          </a>{" "}
          protocol, adapted for private transfers on Gorbagana.
        </p>
      </footer>
    </main>
  );
}
