// The year digest: what everyday life looked and cost like this year, so a 1962 life feels like
// 1962 and a 2008 one like 2008. Each year the log gets one line ("📅 1985: Live Aid on TV. Back to
// the Future makes the DeLorean a star. ..."), the culture line alone and at most 110 characters
// (docs/VOICE.md). The "This Year" menu shows the full card: culture, prices and technology.
//
// Data lives in three files (one owner each; see the era builders):
//   history/digest-prices.ts  PRICE_ITEMS: typical everyday prices as nominal US dollars in
//                             anchor years (interpolated), 1900 to PRESENT_YEAR
//   history/digest-early.ts   CULTURE_EARLY: one line of culture per year 1900-1979
//   history/digest-late.ts    CULTURE_LATE:  one line of culture per year 1980-PRESENT_YEAR
// Prices are written in NOMINAL US dollars of that year (a movie ticket in 1985: 3.55) and shown
// through formatMoney as engine dollars (nominal / priceLevel(year)), so the display currency and
// the "prices as they were" setting both work.
import { currentLogYear, formatCents, formatMoney, log } from '../core'
import type { GameState, MenuNode } from '../types'
import { CULTURE_EARLY } from './digest-early'
import { CULTURE_LATE } from './digest-late'
import { PRICE_ITEMS } from './digest-prices'
import { HISTORY_START, isHistorical, priceLevel } from './timeline'

export interface PriceItem {
  id: string
  /** 'a movie ticket', 'a loaf of bread', 'a gallon of gas', 'a month of rent' (lowercase, with article). */
  label: string
  /** First year anyone sold it (an item is skipped before this). */
  from: number
  /** Last year it was a normal thing to buy (omit while it still is). */
  to?: number
  /** [year, nominal US dollars], sorted by year; interpolated geometrically between anchors. */
  anchors: readonly [number, number][]
}

/** Nominal US dollars for an item in a year (null before it existed or after it faded). */
export function nominalPrice(item: PriceItem, year: number): number | null {
  if (year < item.from || (item.to !== undefined && year > item.to) || item.anchors.length === 0) return null
  const a = item.anchors
  if (year <= a[0][0]) return a[0][1]
  if (year >= a[a.length - 1][0]) return a[a.length - 1][1]
  for (let i = 1; i < a.length; i++) {
    const [y1, v1] = a[i]
    if (year <= y1) {
      const [y0, v0] = a[i - 1]
      const t = (year - y0) / (y1 - y0)
      return v0 > 0 && v1 > 0 ? v0 * Math.pow(v1 / v0, t) : v0 + (v1 - v0) * t
    }
  }
  return a[a.length - 1][1]
}

/** The culture line for a year ('' when none was written). */
export function cultureOf(year: number): string {
  return (year < 1980 ? CULTURE_EARLY[year] : CULTURE_LATE[year]) ?? ''
}

export interface DigestPrice {
  id: string
  label: string
  nominal: number
  /** Engine (constant present-day) dollars: pass to formatMoney. */
  engine: number
}

/** The everyday prices of a year, in the data file's order. */
export function pricesOf(year: number): DigestPrice[] {
  const out: DigestPrice[] = []
  for (const item of PRICE_ITEMS) {
    const nominal = nominalPrice(item, year)
    if (nominal === null) continue
    out.push({ id: item.id, label: item.label, nominal, engine: nominal / priceLevel(year) })
  }
  return out
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/** Everyday prices below $10 need cents; the general money formatter intentionally rounds. */
function digestMoney(n: number): string {
  const amount = cents(n)
  return Math.abs(amount) < 10 ? formatCents(amount) : formatMoney(amount)
}

/** "A movie ticket costs $3.55, a loaf of bread $0.50 and a gallon of gas $1.20." (rotates items by year). */
export function pricesLine(year: number, count = 3): string {
  const all = pricesOf(year)
  if (all.length === 0) return ''
  // A different handful each year: start at a spot that moves with the year, wrap around.
  const picked: DigestPrice[] = []
  for (let i = 0; i < Math.min(count, all.length); i++) picked.push(all[(year + i) % all.length])
  const parts = picked.map((p, i) => `${i === 0 ? p.label.charAt(0).toUpperCase() + p.label.slice(1) : p.label} ${i === 0 ? 'costs ' : ''}${digestMoney(p.engine)}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.` : `${parts[0]}.`
}

/** The log line for a year: the emoji, the year and the culture line, no prices ('' when no culture line is written). */
export function digestLine(year: number): string {
  const culture = cultureOf(year)
  return culture ? `\u{1F4C5} ${year}: ${culture}` : ''
}

/** Yearly hook (after 'history'): one digest line a year, for real history only. */
export function yearlyDigest(g: GameState): void {
  if (!g.character.alive || !isHistorical(g.year) || g.year < HISTORY_START) return
  const entries = currentLogYear(g).entries
  const id = `digest-${g.generation}-${g.year}`
  if (entries.some((e) => e.id === id)) return
  const text = digestLine(g.year)
  if (text) log(g, text, 'event')
}

/** "This Year" rows for a menu: culture, prices and a note on the era. [] when nothing is written. */
export function thisYearNodes(g: GameState): MenuNode[] {
  const year = g.year
  const nodes: MenuNode[] = []
  const culture = cultureOf(year)
  if (culture) nodes.push({ type: 'info', id: 'year.culture', emoji: '\u{1F3B6}', text: culture })
  const prices = pricesOf(year)
  if (prices.length) {
    nodes.push({ type: 'heading', id: 'year.pricesH', label: `What things cost in ${year}` })
    for (const p of prices) nodes.push({ type: 'info', id: `year.price.${p.id}`, emoji: '\u{1F3F7}\u{FE0F}', text: `${p.label.charAt(0).toUpperCase()}${p.label.slice(1)}: ${digestMoney(p.engine)}` })
  }
  return nodes
}
