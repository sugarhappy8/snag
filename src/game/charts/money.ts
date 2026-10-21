// Money labels and text fitting for chart builders (R1 charts, D.2). Pure: they read the life and the display
// setting and write nothing. Values stay in internal dollars (the engine keeps constant PRESENT_YEAR dollars, see
// history/timeline.ts), so no series is ever deflated here; only the label changes with the player's display setting.
import { currentMoneyContext, moneyContextOf, moneyDisplay, shortMoney, withMoneyContext } from '../core'
import { PRESENT_YEAR } from '../history/timeline'
import type { GameState } from '../types'
import { CHART_LIMITS, SPEC_LIMITS, type ChartSpec } from './spec'

/**
 * The year whose prices the money labels of one chart use. With "prices as they were" on, labels are in the prices of
 * the year being lived; otherwise they are in today's money. A multi-year chart carries this as `basis`.
 */
export function priceBasisYear(g: GameState): number {
  return moneyDisplay().nominal ? g.year : PRESENT_YEAR
}

/**
 * The price year the money on screen is read in right now: the year of the life on screen with "prices as they were" on,
 * today's money otherwise (with no life on screen money is plain dollars, so today's). The axes and the table of a chart
 * are formatted live, so this is the year they are in, whatever the chart was built with.
 */
export function liveBasisYear(): number {
  const ctx = currentMoneyContext()
  return moneyDisplay().nominal && ctx !== null && Number.isFinite(ctx.year) ? Math.round(ctx.year) : PRESENT_YEAR
}

/**
 * A chart that has waited (the Annual Report sits in the modal queue, and the queue is saved) with the chip of the prices
 * on screen now. Its `basis` was fixed when it was built, but the player can change the money display before it opens,
 * and the axes and the table follow the live display; the chip must name the same prices. A spec with no basis (a
 * single-year chart) comes back as it is, and so does one whose basis is already right.
 */
export function withLiveBasis<T extends ChartSpec>(spec: T): T {
  if (spec.basis === undefined) return spec
  const basis = liveBasisYear()
  return basis === spec.basis ? spec : { ...spec, basis }
}

/** The chip the frame shows next to a multi-year money chart. */
export function priceChip(basis: number): string {
  return `prices of ${basis}`
}

/**
 * Compact money for this life ($310K, $2.1M, a yen figure for a Japanese life). Built under the life's own money
 * context, so it reads the same whichever life the UI has bound, and the binding is put back afterwards.
 */
export function moneyLabel(g: GameState, n: number): string {
  return withMoneyContext(moneyContextOf(g), () => shortMoney(n))
}

/** 'up $310K', 'down $2.1M' or 'unchanged' (a move that rounds to nothing, or a value that is not a number). */
export function deltaLabel(g: GameState, n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return 'unchanged'
  return `${n > 0 ? 'up' : 'down'} ${moneyLabel(g, Math.abs(n))}`
}

/** 0.35 -> '35%', 0.1234 with one digit -> '12.3%', 0.0004 -> '<0.1%'. A small share never reads 0%. */
export function pctLabel(frac: number, digits = 0): string {
  if (!Number.isFinite(frac)) return '0%'
  const p = frac * 100
  if (p > 0 && p < 0.1) return '<0.1%'
  if (p < 0 && p > -0.1) return '0%'
  const d = Math.min(2, Math.max(0, Math.floor(Number.isFinite(digits) ? digits : 0)))
  let t = p.toFixed(d)
  if (Number(t) === 0) t = p === 0 ? '0' : p.toFixed(1)
  return `${t}%`
}

/** A whole, finite number a spec can carry: rounded, not-a-number and infinity become 0, magnitude at most 1e15. */
export function whole(n: number): number {
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n)
  return Math.max(-SPEC_LIMITS.magnitude, Math.min(SPEC_LIMITS.magnitude, r)) + 0
}

/**
 * Text that fits `max` characters (a summary is at most CHART_LIMITS.text). Whole sentences are kept while they fit;
 * if not even one fits, the cut is at a word. A trailing comma or colon is dropped and no ellipsis is added. One word
 * longer than `max` is cut at `max`, since there is nowhere else to cut.
 */
export function fit(text: string, max: number = CHART_LIMITS.text): string {
  if (max < 1) return ''
  if (text.length <= max) return text
  // The last sentence end (a . ! or ? followed by a space) that still fits.
  let end = -1
  for (let i = 0; i < max; i++) {
    const c = text.charAt(i)
    if ((c === '.' || c === '!' || c === '?') && /\s/.test(text.charAt(i + 1))) end = i + 1
  }
  if (end > 0) return text.slice(0, end)
  // Otherwise the last word that fits.
  let cut = /\s/.test(text.charAt(max)) ? max : -1
  for (let i = max - 1; cut < 0 && i > 0; i--) if (/\s/.test(text.charAt(i))) cut = i
  if (cut < 1) return text.slice(0, max)
  const out = text.slice(0, cut).replace(/[\s,;:-]+$/, '')
  return out.length > 0 ? out : text.slice(0, max)
}
