// Small helpers shared by the business modules (numbers, JSON, text).
import { formatCents, formatMoney, shortMoney, showMoney } from '../core'
import { hasTalent, talentHint } from '../talents'
import type { ChoiceOption, GameState, Json } from '../types'

export function num(v: Json | undefined, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

export function str(v: Json | undefined, def = ''): string {
  return typeof v === 'string' ? v : def
}

export function rec(v: Json | undefined): Record<string, Json> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

/** Clamp to [lo, hi]; NaN becomes lo. */
export function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Finite, rounded dollars (never NaN). */
export function dollars(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Money for unit prices: $3.50 for small amounts, $1,200 for big ones. */
export function unitMoney(n: number): string {
  if (!Number.isFinite(n)) return formatMoney(0)
  return formatCents(n)
}

/**
 * $1.2M / $45K / $812: compact but exact enough for reports. The cut-off is in the currency the
 * player reads (¥7.5M, not ¥7,456,560).
 */
export function money(n: number): string {
  if (!Number.isFinite(n)) return formatMoney(0)
  return Math.abs(showMoney(n).amount) >= 100_000 ? shortMoney(n) : formatMoney(n)
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`
}

/** 'a 64%' / 'an 88%' / 'an 11%': a percentage with the article English wants in front of it. */
export function aPct(n: number): string {
  const p = pct(n)
  return `${/^8/.test(p) || /^1[18]%/.test(p) ? 'an' : 'a'} ${p}`
}

/** 1,234 / 12.3K / 4.5M for unit counts. */
export function units(n: number): string {
  const a = Math.abs(Math.round(n))
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e4) return `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
  return a.toLocaleString('en-US')
}

export function stars(n: number): string {
  const k = Math.max(1, Math.min(5, Math.round(n)))
  return '\u{2B50}'.repeat(k)
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`
}

export function toJson<T>(x: T): Json {
  return JSON.parse(JSON.stringify(x)) as Json
}

/** Typed view of a JSON object (mutations write through). */
export function asType<T>(v: Json | Record<string, Json>): T {
  return v as unknown as T
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Strip a typed name down to something safe and short. */
export function cleanName(s: string | undefined, fallback: string, max = 36): string {
  const t = (s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  return t || fallback
}

/**
 * The Business talent's purple hint on the choice that works out best by expected value (`ev`
 * in dollars; null = not a real option). Adds nothing without the talent or with fewer than two
 * scored options. `why` may give the hint a reason ('' or undefined for the default line).
 */
export function markBest<T extends ChoiceOption>(g: GameState, choices: T[], ev: (id: string) => number | null, why?: (id: string, margin: number) => string | undefined): T[] {
  if (!hasTalent(g, 'Business')) return choices
  const scored = choices.map((c) => ({ c, v: ev(c.id) })).filter((x): x is { c: T; v: number } => x.v !== null && Number.isFinite(x.v))
  if (scored.length < 2) return choices
  scored.sort((x, y) => y.v - x.v)
  const best = scored[0]
  const margin = best.v - scored[1].v
  const reason = why?.(best.c.id, margin)
  const text = reason || (margin >= 500 ? `Best move: about ${money(margin)} better than the next best option` : 'Best move, by a hair: the options are nearly even')
  best.c.hint = talentHint(g, 'Business', text)
  return choices
}

// ---------------------------------------------------------------------------
// Price promises: a price war or holding prices through a currency crash caps what the company
// may charge for the rest of the fiscal year (re-planning can't quietly undo it). Kept in g.flags
// as plain JSON and cleared when the year is booked.

const CAP_PREFIX = 'biz.priceCap.'

/** The most this company may charge this fiscal year (null: no promise). */
export function priceCapOf(g: GameState, assetId: string): number | null {
  const v = rec(g.flags[CAP_PREFIX + assetId])
  if (!v || num(v.year, -1) !== g.year) return null
  const p = num(v.price, 0)
  return p > 0 ? p : null
}

/** Promise to charge at most `price` until the year is booked (the lower promise wins). */
export function promisePrice(g: GameState, assetId: string, price: number): void {
  if (!Number.isFinite(price) || price <= 0) return
  const cur = priceCapOf(g, assetId)
  g.flags[CAP_PREFIX + assetId] = { year: g.year, price: round2(cur === null ? price : Math.min(cur, price)) }
}

/** Forget promises from years already booked. */
export function prunePricePromises(g: GameState): void {
  for (const k of Object.keys(g.flags)) {
    if (!k.startsWith(CAP_PREFIX)) continue
    const v = rec(g.flags[k])
    if (!v || num(v.year, -1) < g.year) delete g.flags[k]
  }
}
