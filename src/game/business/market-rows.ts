// The compact row format of the real-rival data (market-data-*.ts) and the builder that turns rows
// into registry brands (data/brands-rivals.ts RIVAL_BRANDS). One row is ONE company in ONE
// industry: a company that competes in several industries gets one row for each, with its own
// slug (`amazon`, `amazon-cloud`), entry year, strength and arc.
//
// Facts in the rows are approximate and well known (founding year, home country, a rough tier);
// the relative pull (`pot`) is a rough guess at how big the company is next to the others in the
// same market (1 = a solid reference competitor, a giant is 6-14). Nothing negative about a real
// brand is ever written here: strength simply rises and falls along an arc.
import type { Brand, BrandTier } from '../data/brands'
import { EXPANSION_INDUSTRY_IDS, type Industry } from '../data/markets'
import type { Json } from '../types'

/** Industries fought over one country at a time (the rest are world markets). */
export const NATIONAL_INDUSTRIES: readonly Industry[] = [
  ...EXPANSION_INDUSTRY_IDS,
  'foodTruck', 'restaurant', 'cafe', 'bakery', 'bar', 'brewery', 'grocery', 'fashion', 'beauty', 'salon', 'gym',
  'autoShop', 'construction', 'realEstate', 'marketing', 'clinic', 'hotel', 'logistics', 'farm', 'entertainment',
]

export interface RowOpts {
  /** Year it began competing in THIS industry when later than the company's founding. */
  since?: number
  /** Last year it traded (real history only; never after 2025). */
  end?: number
  /** Years to reach full strength after it enters (default by size). */
  ramp?: number
  /** National markets: where else it trades and since when, 'ca:1967 jp:1971'. */
  s?: string
  /** Pull multiplier by country, 'in:0.5 jp:1.4'. */
  w?: string
  /** National markets: the last year it traded in a country, 'ru:2021'. */
  x?: string
  /** Strength arc: [year, multiplier] control points (rises and falls). */
  a?: [number, number][]
  /** A state-backed incumbent that fades as the market opens up. */
  leg?: boolean
  /** How it ended: 'acquired' | 'merged' | 'closed' | 'bankrupt'. */
  fate?: 'acquired' | 'merged' | 'closed' | 'bankrupt'
  /** Quality / tech overrides (0-100). */
  q?: number
  t?: number
}

export type RivalRow = [ind: Industry, slug: string, name: string, hq: string, founded: number, tier: BrandTier, pot: number, opts?: RowOpts]

/** Parse 'ca:1967 jp:1971' into a record (bad tokens are ignored; the data test catches them). */
export function pairs(s: string | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!s) return out
  for (const tok of s.split(/\s+/)) {
    const [k, v] = tok.split(':')
    const n = Number(v)
    if (k && Number.isFinite(n)) out[k] = n
  }
  return out
}

const NATIONAL = new Set<string>(NATIONAL_INDUSTRIES)

/** The industry of a rival brand (null for other brands). */
export function rivalIndustry(b: Brand): string | null {
  return b.category.startsWith('rival.') ? b.category.slice(6) : null
}

export function rowsToBrands(rows: readonly RivalRow[]): Brand[] {
  return rows.map(([ind, slug, name, hq, founded, tier, pot, o = {}]): Brand => {
    const s = pairs(o.s)
    const national = NATIONAL.has(ind)
    const data: Record<string, Json> = { ind, pot }
    if (o.since !== undefined) data.since = o.since
    if (o.ramp !== undefined) data.ramp = o.ramp
    if (o.a) data.a = o.a
    if (o.leg) data.leg = true
    if (o.w) data.w = pairs(o.w)
    if (o.x) data.x = pairs(o.x)
    if (o.fate) data.fate = o.fate
    if (o.q !== undefined) data.q = o.q
    if (o.t !== undefined) data.t = o.t
    return {
      id: `rv-${slug}`,
      name,
      category: `rival.${ind}`,
      hq,
      founded,
      ...(national ? { countries: [hq, ...Object.keys(s).filter((k) => k !== hq)] } : {}),
      ...(Object.keys(s).length ? { sold: s } : {}),
      ...(o.end !== undefined ? { ended: o.end } : {}),
      tier,
      fame: Math.max(1, Math.min(10, Math.round(2 + pot * 0.7))),
      data,
    }
  })
}
