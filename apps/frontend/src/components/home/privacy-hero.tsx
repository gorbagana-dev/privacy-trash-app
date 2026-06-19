import { Button } from "@/components/ui/button";
import { TransferForm } from "@/features/transfer/components/transfer-form";

export function PrivacyHero() {
  return (
    <main className="min-h-[100dvh] bg-[#030303] text-white">
      <section className="mx-auto grid min-h-[100dvh] w-full max-w-7xl items-center gap-12 px-6 py-8 sm:px-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:px-12">
        <div className="max-w-[660px]">
          <h1 className="font-heading text-[clamp(3rem,5.35vw,4rem)] font-semibold italic leading-[1] tracking-[-0.04em] text-white">
            Send privately.
            <br />
            Any wallet.
            <br />
            <span className="text-[#4dff91]">No link.</span>
          </h1>

          <p className="mt-8 max-w-[620px] font-sans text-lg font-medium leading-[1.22] text-zinc-500 sm:text-xl">
            Deposit from one wallet, withdraw to another, and break the public
            link between sender and recipient.
          </p>

          <div className="mt-14 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              className="h-12 rounded-xl bg-[#4dff91] px-8 font-heading text-base font-bold italic text-black uppercase hover:bg-[#67ffa2] active:scale-[0.98]"
            >
              Start Transfer
            </Button>
            <Button
              type="button"
              className="h-12 rounded-xl bg-white px-8 font-heading text-base font-bold italic text-black uppercase hover:bg-zinc-200 active:scale-[0.98]"
            >
              How It Works
            </Button>
          </div>
        </div>

        <TransferForm />
      </section>
    </main>
  );
}
