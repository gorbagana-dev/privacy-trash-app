export const PROTOCOL_FEE_BASIS_POINTS = 35n;
export const BASIS_POINTS_DENOMINATOR = 10_000n;
export const BASE_WITHDRAWAL_FEE_LAMPORTS = 6_000_000n;
export const ESTIMATED_NETWORK_FEE_LAMPORTS = 5_000n;

function ceilDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

export function calculateProtocolFeeLamports(amountLamports: bigint) {
  return ceilDivide(
    amountLamports * PROTOCOL_FEE_BASIS_POINTS,
    BASIS_POINTS_DENOMINATOR,
  );
}

export function calculateGrossPrivateSpendLamports(amountLamports: bigint) {
  return (
    amountLamports +
    calculateProtocolFeeLamports(amountLamports) +
    BASE_WITHDRAWAL_FEE_LAMPORTS
  );
}
