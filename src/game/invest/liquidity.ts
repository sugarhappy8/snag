/** Exponential order-book depth. Splitting a sale has the same total proceeds and final price. */
export function saleImpact(amount: number, depth: number): { proceeds: number; end: number; discount: number } {
  if (!(amount > 0) || !(depth > 0) || !Number.isFinite(amount + depth)) return { proceeds: 0, end: 1, discount: 0 }
  const x = .6 * amount / depth
  const end = Math.exp(-Math.min(40, x))
  const average = -Math.expm1(-x) / x
  return { proceeds: amount * average, end, discount: 1 - average }
}

/** Inverse of integrating the same book upward, for a cash-denominated buy order. */
export function buyImpact(amount: number, depth: number): { value: number; end: number } {
  if (!(amount > 0) || !(depth > 0) || !Number.isFinite(amount + depth)) return { value: 0, end: 1 }
  const x = .6 * amount / depth
  return { value: amount * Math.log1p(x) / x, end: 1 + x }
}
