// Band functions (R2-P8 wrote them in state.ts, R2-P9 moved them here): the threshold buckets a state-table row uses to say what
// counts as a change of state. A leaf with no imports, because the table's own rows (state-table.ts) need them and state.ts
// needs the table; text/state.ts re-exports both names, so import them from there.

/** A band function: the number of edges at or below the value (edges in ascending order). At most 99; NaN is 0. */
export function bandBy(...edges: number[]): (value: number) => number {
  return (value) => Math.min(99, edges.filter((e) => e <= value).length)
}

/**
 * A band function that steps each time the value is multiplied by `ratio`: 0 for a value of 0 or less (or NaN), else
 * 1 + floor(log(value) / log(ratio)), kept between 0 and 99. A ratio that is not above 1 reads as the default, 1.25.
 * A value below 1 reads as 0 as well. A row whose value hovers should take a wider ratio (1.25 to 2).
 */
export function logBand(ratio = 1.25): (value: number) => number {
  const r = ratio > 1 && Number.isFinite(ratio) ? ratio : 1.25
  const unit = Math.log(r)
  return (value) => {
    if (!(value > 0)) return 0
    let k = Math.floor(Math.log(value) / unit)
    if (k >= 98) return 99
    if (k < 0) return 0
    // Math.log is a hair off at an exact power (log(1000) / log(10) is 2.9999999999999996): settle k on the powers themselves.
    if (r ** (k + 1) <= value) k++
    else if (r ** k > value) k--
    return Math.min(99, Math.max(0, k + 1))
  }
}
