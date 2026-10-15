// The yearly dividend rule: one optional record on a company (BizState.dividend), its reader and its
// bounds. Imports nothing, because state.ts imports it. Pure: no rng, no clock, never throws, never
// changes what it is given. Read a stored rule through readDividend, never raw: bizOf does not
// re-normalize a current-version record, so a damaged value can sit in a v2 save.

export type DividendMode = 'profit' | 'cash'

/** The last payment the rule made: fiscal year, company payout, the player's part, dollars a listed share. */
export interface DividendLast { year: number; paid: number; mine: number; perShare: number }

export interface DividendPolicy {
  mode: DividendMode
  /** Share of the basis to pay, 0.05 to 1 in hundredths. */
  pct: number
  /** Months of running costs the company keeps, 0 to 24. */
  keep: number
  last?: DividendLast
}

export const DIVIDEND_PCT = { min: 0.05, max: 1, step: 0.05, start: 0.3 } as const
export const DIVIDEND_KEEP = { min: 0, max: 24, start: 3 } as const

function plain(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** A number in [lo, hi]; a number past either end (even Infinity) lands on that end. NaN is not a number here. */
function within(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? Math.max(lo, Math.min(hi, v)) : null
}

function pctOf(v: unknown, fallback: number = DIVIDEND_PCT.start): number {
  const n = within(v, DIVIDEND_PCT.min, DIVIDEND_PCT.max)
  return n === null ? fallback : Math.round(n * 100) / 100
}

function keepOf(v: unknown, fallback: number = DIVIDEND_KEEP.start): number {
  const n = within(v, DIVIDEND_KEEP.min, DIVIDEND_KEEP.max)
  return n === null ? fallback : Math.round(n) + 0
}

function lastOf(raw: unknown): DividendLast | null {
  const d = plain(raw)
  if (!d) return null
  const { year, paid, mine, perShare } = d
  if (!finite(year) || !Number.isInteger(year) || year < 1800 || year > 2300) return null
  if (!finite(paid) || paid < 0 || paid > 1e15) return null
  if (!finite(mine) || mine < 0 || mine > paid + 1) return null
  if (!finite(perShare) || perShare < 0 || perShare > 1e12) return null
  return { year, paid: Math.round(paid) + 0, mine: Math.round(mine) + 0, perShare: Math.round(perShare * 1e6) / 1e6 + 0 }
}

/**
 * A stored rule, checked: null unless it is a plain object whose mode is exactly 'profit' or 'cash'.
 * A bad share or months value takes its default, a good one is clamped and rounded, a bad `last` is
 * left out (the rule stays), and unknown keys are dropped. The result is a fresh object.
 */
export function readDividend(raw: unknown): DividendPolicy | null {
  const d = plain(raw)
  if (!d) return null
  const mode = d.mode
  if (mode !== 'profit' && mode !== 'cash') return null
  const last = lastOf(d.last)
  return { mode, pct: pctOf(d.pct), keep: keepOf(d.keep), ...(last ? { last } : {}) }
}

/** The whitelist line for normalizeBiz: `{ dividend }` for a usable rule, else nothing. */
export function dividendField(raw: unknown): { dividend?: DividendPolicy } {
  const dividend = readDividend(raw)
  return dividend ? { dividend } : {}
}

/**
 * A new rule from the current one (or the defaults) with a change applied through the same bounds.
 * A change that cannot be read leaves that part as it was. `last` only ever comes from `cur`.
 */
export function withPolicy(cur: DividendPolicy | null, patch: { mode?: DividendMode; pct?: number; keep?: number }): DividendPolicy {
  const mode: DividendMode = patch.mode === 'profit' || patch.mode === 'cash' ? patch.mode : cur?.mode ?? 'profit'
  const pct = pctOf(patch.pct, cur ? pctOf(cur.pct) : DIVIDEND_PCT.start)
  const keep = keepOf(patch.keep, cur ? keepOf(cur.keep) : DIVIDEND_KEEP.start)
  return { mode, pct, keep, ...(cur?.last ? { last: { ...cur.last } } : {}) }
}
