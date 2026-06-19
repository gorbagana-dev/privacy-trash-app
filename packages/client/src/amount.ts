export const NATIVE_DECIMALS = 9;
export const LAMPORTS_PER_NATIVE = 1_000_000_000n;

const NATIVE_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{0,9})?$/;

export function parseAmount(input: string): bigint {
  const value = input.trim();

  if (!NATIVE_AMOUNT_PATTERN.test(value)) {
    throw new Error("Expected a native amount with up to 9 decimal places.");
  }

  const [whole = "0", fractional = ""] = value.split(".");
  const wholeLamports = BigInt(whole) * LAMPORTS_PER_NATIVE;
  const fractionalLamports = BigInt(fractional.padEnd(NATIVE_DECIMALS, "0"));

  return wholeLamports + fractionalLamports;
}

export function formatAmount(lamports: bigint): string {
  if (lamports < 0n) {
    throw new RangeError("lamports must be non-negative.");
  }

  const whole = lamports / LAMPORTS_PER_NATIVE;
  const fractional = lamports % LAMPORTS_PER_NATIVE;

  if (fractional === 0n) {
    return whole.toString();
  }

  return `${whole}.${fractional
    .toString()
    .padStart(NATIVE_DECIMALS, "0")
    .replace(/0+$/, "")}`;
}
