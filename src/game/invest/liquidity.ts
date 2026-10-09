/** Exponential order-book depth. Splitting a sale has the same total proceeds and final price. */
export function saleImpact(amount: number, depth: number): { proceeds: number; end: number; discount: number } {
  if (!(amount > 0) || !(depth > 0) || !Number.isFinite(amount) || !Number.isFinite(depth)) return { proceeds: 0, end: 1, discount: 0 }
  const x = .6 * amount / depth
  if (!Number.isFinite(x)) {
    // At the limit, the integrated book pays depth / .6 even though the direct ratio
    // overflows. Returning that limit keeps a malformed or astronomical order finite.
    const proceeds = Math.min(amount, depth / .6)
    return { proceeds, end: Math.exp(-40), discount: Math.max(0, 1 - proceeds / amount) }
  }
  if (x <= Number.EPSILON) return { proceeds: amount, end: 1, discount: 0 }
  const end = Math.exp(-Math.min(40, x))
  const average = -Math.expm1(-x) / x
  const proceeds = amount * average
  return { proceeds: Number.isFinite(proceeds) ? Math.max(0, Math.min(amount, proceeds)) : 0, end, discount: Math.max(0, Math.min(1, 1 - average)) }
}

/** Inverse of integrating the same book upward, for a cash-denominated buy order. */
export function buyImpact(amount: number, depth: number): { value: number; end: number } {
  if (!(amount > 0) || !(depth > 0) || !Number.isFinite(amount) || !Number.isFinite(depth)) return { value: 0, end: 1 }
  const x = .6 * amount / depth
  if (!Number.isFinite(x)) {
    const logX = Math.log(amount) + Math.log(.6) - Math.log(depth)
    const value = depth / .6 * logX
    return { value: Number.isFinite(value) ? Math.max(0, Math.min(amount, value)) : 0, end: 1e12 }
  }
  if (x <= Number.EPSILON) return { value: amount, end: 1 }
  const value = amount * Math.log1p(x) / x
  return { value: Number.isFinite(value) ? Math.max(0, Math.min(amount, value)) : 0, end: Math.min(1e12, 1 + x) }
}
