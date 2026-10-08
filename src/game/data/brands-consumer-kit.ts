// Shared builder for the consumer brand files (brands-consumer-*.ts): a compact row format with
// country groups, so a chain's footprint reads "us:1955 jp:1971 EUW:1985" instead of a 100-entry
// table. Rules for the data are in data/brands.ts.
import type { Brand, BrandTier } from './brands'
import type { Json } from '../types'

export const REGIONS: Record<string, string[]> = {
  NA: ['us', 'ca'],
  CARIB: ['aw', 'bs', 'bz', 'cu', 'do', 'ht', 'jm', 'pr'],
  CENAM: ['cr', 'sv', 'gt', 'ni', 'pa', 'mx'],
  SAM: ['ar', 'bo', 'br', 'cl', 'co', 'ec', 'gy', 'py', 'pe', 'uy', 've'],
  EUW: ['ad', 'at', 'be', 'dk', 'fi', 'fr', 'de', 'gr', 'ie', 'it', 'mc', 'nl', 'no', 'pt', 'es', 'se', 'ch', 'gb'],
  EUE: ['hr', 'cz', 'ee', 'hu', 'pl', 'ro', 'rs', 'sk', 'ru', 'ua', 'ge'],
  MENA: ['dz', 'eg', 'il', 'iq', 'ir', 'jo', 'kw', 'lb', 'ma', 'qa', 'sa', 'sy', 'tn', 'tr', 'ae'],
  GULF: ['ae', 'kw', 'qa', 'sa'],
  SSA: ['ao', 'cd', 'dj', 'et', 'ke', 'ng', 'ug', 'za', 'zw'],
  EASIA: ['cn', 'hk', 'jp', 'kr', 'mn', 'tw'],
  SEASIA: ['id', 'my', 'ph', 'sg', 'th', 'vn'],
  SASIA: ['af', 'bd', 'in', 'np', 'pk', 'kz'],
  OCE: ['au', 'nz', 'pg', 'ws'],
}
REGIONS.LATAM = [...REGIONS.CARIB, ...REGIONS.CENAM, ...REGIONS.SAM]
REGIONS.EU = [...REGIONS.EUW, ...REGIONS.EUE]
REGIONS.ASIA = [...REGIONS.EASIA, ...REGIONS.SEASIA, ...REGIONS.SASIA]
REGIONS.ALL = [...REGIONS.NA, ...REGIONS.LATAM, ...REGIONS.EU, ...REGIONS.MENA, ...REGIONS.SSA, ...REGIONS.ASIA, ...REGIONS.OCE]

/** A product line of a brand: [name, first year, last year (0 = still sold), countries/regions it was sold in (empty = everywhere the brand trades)]. */
export type Line = [name: string, from: number, until?: number, where?: string]

export interface RowOpts {
  /** Finer grouping inside the category. */
  seg?: string
  /** Footprint: 'us:1955 jp:1971 EUW:1985' (country or group, optional first year). Omit = trades everywhere from `founded`. */
  where?: string
  /** Only trades in its home country (plus any `where` extras). */
  home?: boolean
  /** Last year it traded (real history only). */
  ended?: number
  /** Known product lines, for naming the model of the year. */
  lines?: Line[]
  /** Extra plain-JSON data (e.g. `kind` of coffee shop). */
  data?: Record<string, Json>
}

/** Expand a footprint string into `countries` and `sold`. Explicit countries beat groups. */
export function footprint(where: string | undefined, hq: string | undefined, founded: number): Pick<Brand, 'countries' | 'sold'> {
  if (!where) return {}
  const sold: Record<string, number> = {}
  const explicit: Record<string, number> = {}
  const grouped: Record<string, number> = {}
  const removed = new Set<string>()
  for (const tok of where.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('-')) {
      // '-ru' / '-EASIA': not sold there at all.
      const k = tok.slice(1)
      for (const c of REGIONS[k] ?? [k]) removed.add(c)
      continue
    }
    const [k, y] = tok.split(':')
    const year = y ? Number(y) : founded
    const members = REGIONS[k]
    if (members) for (const c of members) grouped[c] = Math.min(grouped[c] ?? 9999, year)
    else explicit[k] = year
  }
  for (const [c, y] of Object.entries(grouped)) sold[c] = y
  for (const [c, y] of Object.entries(explicit)) sold[c] = y
  if (hq && sold[hq] === undefined && !removed.has(hq)) sold[hq] = founded
  for (const c of removed) delete sold[c]
  const countries = Object.keys(sold)
  const out: Record<string, number> = {}
  for (const c of countries) if (sold[c] > founded) out[c] = sold[c]
  return { countries, ...(Object.keys(out).length ? { sold: out } : {}) }
}

/** One brand row. */
export function C(id: string, name: string, category: string, founded: number, hq: string | undefined, tier: BrandTier, fame: number, blurb: string, o: RowOpts = {}): Brand {
  const data: Record<string, Json> = { ...(o.data ?? {}) }
  if (o.lines) data.lines = o.lines as unknown as Json
  return {
    id,
    name,
    category,
    ...(o.seg ? { segment: o.seg } : {}),
    ...(hq ? { hq } : {}),
    founded,
    ...footprint(o.where ?? (o.home ? hq : undefined), hq, founded),
    ...(o.ended !== undefined ? { ended: o.ended } : {}),
    tier,
    fame,
    blurb,
    ...(Object.keys(data).length ? { data } : {}),
  }
}
