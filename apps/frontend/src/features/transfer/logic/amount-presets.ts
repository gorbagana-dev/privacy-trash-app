export const commonGorAmounts = [
  "1000",
  "5000",
  "10000",
  "25000",
  "50000",
  "100000",
] as const;

const amountFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatCommonGorAmount(amount: string) {
  return amountFormatter.format(Number(amount));
}
