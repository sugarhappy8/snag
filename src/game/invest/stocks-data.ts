// Shared constructor for the registry of real listed companies (data/brands-stocks.ts merges the
// regional files stocks-*.ts). Every fact is public knowledge and approximate: `listed` is the
// first year the company's shares traded on its home exchange (the lineage's listing year; very
// old companies are listed from 1900, where the game's history begins), `ended` is the last
// year-end it had a quote before a real merger, takeover or documented bankruptcy. Nothing here
// is a prediction or an opinion: blurbs say what the company does.
import type { Brand } from '../data/brands'
import type { SizeClass } from './real'

export interface StockExtra {
  /** Last year-end it traded (real merger, takeover or documented bankruptcy). Never after 2025. */
  ended?: number
  /** The end was a documented bankruptcy (default: a merger or takeover). */
  bankrupt?: boolean
  /** What holders got at the end, as a change on the last quote, where the takeover is known to have been far from the usual premium (a rescue deal: negative). */
  payout?: number
  /** Names it traded under: [fromYear, name], oldest first; the last one is the current name. */
  aka?: [number, string][]
  /** Coarse excess return per year for an era: [fromYear, toYear, excess]. Only where the direction is well known. */
  arc?: [number, number, number][]
  /** Rough size class from a year on: [fromYear, class]. */
  size?: [number, SizeClass][]
  /** Dividend yield for a company whose payout is far from its sector's (growth companies pay little or nothing). */
  dy?: number
  /** Display label that replaces the sector's ('Railroad', 'Chemicals'). */
  label?: string
  /** A second stock with the same name (a relisted company) needs its own id suffix. */
  id?: string
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * One listed company. hq = the country whose exchange lists it (world.ts id), exchange = the venue's
 * code, sector = the engine's sector id (invest/engine.ts SECTORS), listed = first year of trading,
 * fame 1-10 = household-name prominence (orders the menus), blurb = what it does, neutrally.
 */
export function stock(hq: string, exchange: string, name: string, sector: string, listed: number, fame: number, blurb: string, x: StockExtra = {}): Brand {
  const data: Record<string, import('../types').Json> = { exchange }
  if (x.aka) data.aka = x.aka.map(([from, n]) => ({ from, name: n }))
  if (x.bankrupt) data.fate = 'bankrupt'
  if (x.payout !== undefined) data.payout = x.payout
  if (x.arc) data.arc = x.arc.map((a) => [...a])
  if (x.size) data.size = x.size.map((a) => [...a])
  if (x.label) data.label = x.label
  if (x.dy !== undefined) data.dy = x.dy
  const b: Brand = {
    id: `stock-${hq}-${x.id ?? slug(name)}`,
    name,
    category: 'stock',
    segment: sector,
    hq,
    founded: listed,
    countries: [hq],
    tier: fame >= 8 ? 'premium' : 'mass',
    fame,
    blurb,
    data,
  }
  if (x.ended !== undefined) b.ended = x.ended
  return b
}
