// A market scorecard: where one number stands among everyone else's. Pure, no imports, nothing here knows about labs.
// Callers pass their own figure (`mine`), everyone else's (`field`) and, for a trend, the same figure a year earlier on the same scale.

export interface ScoreRow {
  id: string
  label: string
  unit: string
  /** Your figure; a non-finite one reads as 0. */
  mine: number
  /** The mean of everyone else (0 when there is nobody else). */
  market: number
  /** The best on the board, yours included, so "best" and "rank 1" never disagree. */
  best: number
  /** 1 plus the number of others strictly above you; ties share the better rank. */
  rank: number
  /** Everyone else plus you. */
  of: number
  trend: -1 | 0 | 1
}

/** `field` is everyone else. Non-finite entries are dropped; the array is never mutated. */
export function scoreRow(id: string, label: string, unit: string, mine: number, field: readonly number[], prior?: number): ScoreRow {
  const me = Number.isFinite(mine) ? mine : 0
  const others = field.filter((n) => Number.isFinite(n))
  const market = others.length ? others.reduce((s, n) => s + n, 0) / others.length : 0
  let best = me
  let above = 0
  for (const n of others) {
    if (n > best) best = n
    if (n > me) above++
  }
  const p = typeof prior === 'number' && Number.isFinite(prior) ? prior : 0
  const trend = me > p + 0.5 ? 1 : me < p - 0.5 ? -1 : 0
  return { id, label, unit, mine: me, market, best, rank: 1 + above, of: others.length + 1, trend }
}

/** One plain line, "Coding 71. Market 64, best 78, rank 3 of 9."; `fmt` defaults to rounding. */
export function scoreText(row: ScoreRow, fmt: (n: number) => string = (n) => String(Math.round(n))): string {
  if (row.of <= 1) return `${row.label} ${fmt(row.mine)}. The market has no figures.`
  return `${row.label} ${fmt(row.mine)}. Market ${fmt(row.market)}, best ${fmt(row.best)}, rank ${row.rank} of ${row.of}.`
}
