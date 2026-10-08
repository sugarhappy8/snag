// Trade between countries as the Market & Competition screen sees it: tariffs and other barriers
// from one country to another in a given year (customs unions and free-trade areas, the long
// fall of tariffs after the 1930s, a few well-known trade wars), how much of an industry's sales
// are physical goods a tariff can touch, and the exchange-rate exposure of selling abroad.
// Approximate by design (the screen labels every figure as such). Pure: no game state, no RNG.
import { currencyOf, exchangeRate } from '../data/currencies'
import { marketOf, type Industry } from '../data/markets'
import { PRESENT_YEAR } from '../history/timeline'
import { getCountry } from '../world'
import { inEu } from './deeptech-data'
import { clampN } from './util'

// ---------------------------------------------------------------------------
// Blocs

export type BlocId = 'eu' | 'efta' | 'usmca' | 'asean' | 'mercosur' | 'gcc' | 'eaeu' | 'cer'

export const BLOC_NAMES: Record<BlocId, string> = {
  eu: 'the European Union single market',
  efta: 'the EU–EFTA free-trade area',
  usmca: 'the North American free-trade area',
  asean: 'the ASEAN free-trade area',
  mercosur: 'Mercosur',
  gcc: 'the Gulf customs union',
  eaeu: 'the Eurasian customs union',
  cer: 'the Australia–New Zealand free-trade area',
}

/** Year each EU country joined the customs union (the first six formed it in 1958; internal tariffs ended in 1968). */
const EU_JOINED: Record<string, number> = {
  be: 1968, fr: 1968, de: 1968, it: 1968, nl: 1968, lu: 1968,
  gb: 1973, ie: 1973, dk: 1973, gr: 1981, es: 1986, pt: 1986, at: 1995, fi: 1995, se: 1995,
  cz: 2004, hu: 2004, pl: 2004, sk: 2004, ee: 2004, lt: 2004, si: 2004, ro: 2007, bg: 2007, hr: 2013,
}

const BLOCS: { id: BlocId; members: Record<string, number> }[] = [
  { id: 'efta', members: { ch: 1973, no: 1973, is: 1973 } },
  { id: 'usmca', members: { us: 1994, ca: 1994, mx: 1994 } },
  { id: 'asean', members: { id: 1993, my: 1993, ph: 1993, sg: 1993, th: 1993, vn: 1995 } },
  { id: 'mercosur', members: { ar: 1995, br: 1995, uy: 1995, py: 1995 } },
  { id: 'gcc', members: { sa: 2003, ae: 2003, qa: 2003, kw: 2003 } },
  { id: 'eaeu', members: { ru: 2010, kz: 2010, by: 2010 } },
  { id: 'cer', members: { au: 1983, nz: 1983 } },
]

/** The blocs a country belonged to in `year`. */
export function blocsOf(countryId: string, year: number): BlocId[] {
  const out: BlocId[] = []
  const joined = EU_JOINED[countryId]
  // The UK left the single market at the end of 2020 (a trade deal keeps goods tariff-free).
  if (joined !== undefined && year >= joined && !(countryId === 'gb' && year >= 2021)) out.push('eu')
  else if (inEu(countryId) && year >= 2004) out.push('eu')
  for (const b of BLOCS) {
    const y = b.members[countryId]
    if (y !== undefined && year >= y) out.push(b.id)
  }
  return out
}

/** The bloc two countries share in `year` (null when none; EFTA trades with the EU). */
export function sharedBloc(a: string, b: string, year: number): BlocId | null {
  const x = blocsOf(a, year)
  const y = blocsOf(b, year)
  for (const id of x) if (y.includes(id)) return id
  const euA = x.includes('eu') || (a === 'gb' && year >= 2021)
  const euB = y.includes('eu') || (b === 'gb' && year >= 2021)
  if ((euA && y.includes('efta')) || (euB && x.includes('efta'))) return 'efta'
  if (a === 'gb' && year >= 2021 && euB) return 'eu'
  if (b === 'gb' && year >= 2021 && euA) return 'eu'
  return null
}

// ---------------------------------------------------------------------------
// Tariffs

/** Rough average applied tariff on goods in the early 2020s (share of the price). */
const TARIFF_NOW: Record<string, number> = {
  us: 0.034, ca: 0.031, mx: 0.07, gb: 0.03, ch: 0.065, no: 0.03, jp: 0.04, cn: 0.075, in: 0.17, br: 0.112, ru: 0.06, kr: 0.134,
  au: 0.025, nz: 0.02, id: 0.081, tr: 0.105, za: 0.076, ng: 0.12, eg: 0.17, sa: 0.05, ae: 0.05, th: 0.11, vn: 0.095, my: 0.055,
  sg: 0, hk: 0, ph: 0.06, pk: 0.14, bd: 0.14, ar: 0.13, cl: 0.06, co: 0.07, pe: 0.023, il: 0.05, ke: 0.13, tw: 0.065,
}

const EU_TARIFF = 0.051

/** The long fall of tariffs: sky-high after the 1930s, halving every generation since the GATT. */
function tariffEra(year: number): number {
  const pts: [number, number][] = [[1900, 2.4], [1914, 2.4], [1930, 3.4], [1939, 3.2], [1950, 3], [1960, 2.4], [1970, 2], [1980, 1.7], [1990, 1.4], [1995, 1.15], [2005, 1.05], [2015, 1], [2026, 1]]
  if (year <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [y1, v1] = pts[i]
    if (year <= y1) {
      const [y0, v0] = pts[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / Math.max(1, y1 - y0)
    }
  }
  return 1
}

/**
 * How much of an industry's sales are physical goods crossing a border (a tariff touches them),
 * as opposed to services and software delivered over the wire.
 */
const GOODS: Partial<Record<Industry, number>> = {
  manufacturing: 1, semiconductor: 1, robotics: 1, electricVehicles: 1, biotech: 0.9, ecommerce: 0.85, energy: 0.7, farm: 0.9, fashion: 1,
  beauty: 1, gameStudio: 0.25, spaceTech: 0.3, quantum: 0.3, software: 0.12, aiLab: 0.05, cybersecurity: 0.08, marketing: 0.05,
  logistics: 0.3, hotel: 0, realEstate: 0, entertainment: 0.05, clinic: 0.1, construction: 0.3, brewery: 0.9, bakery: 0.5, grocery: 0.9,
}

export function goodsShare(industry: Industry | string): number {
  return GOODS[industry as Industry] ?? 0.3
}

/** The tariff on goods from `from` into `to` in `year` (0 inside a bloc or at home). */
export function tariffOn(from: string, to: string, year: number): number {
  if (from === to) return 0
  if (sharedBloc(from, to, year)) return 0
  let base = TARIFF_NOW[to]
  if (base === undefined) base = blocsOf(to, PRESENT_YEAR).includes('eu') ? EU_TARIFF : getCountry(to).wealth >= 0.6 ? 0.045 : 0.115
  if (blocsOf(to, year).includes('eu')) base = EU_TARIFF
  let t = base * tariffEra(year)
  // The US-China tariff round that began in 2018.
  if (year >= 2018 && ((from === 'us' && to === 'cn') || (from === 'cn' && to === 'us'))) t += 0.1
  return clampN(t, 0, 0.6)
}

// ---------------------------------------------------------------------------
// Other barriers, currency

export type BarrierLabel = 'open' | 'moderate' | 'restrictive' | 'closed'

export interface Barriers {
  /** Tariff on goods (share of the price). */
  tariff: number
  /** Tariff weighted by how much of the industry is physical goods. */
  effective: number
  /** 0 (open) - 1 (closed): permits, local-content rules, corruption, red tape. */
  other: number
  label: BarrierLabel
  bloc: BlocId | null
}

/** Non-tariff barriers into a country, from its ease of doing business and corruption. */
export function otherBarriers(to: string, year: number): number {
  const m = marketOf(to)
  let nt = 0.9 - m.easeOfBusiness / 100 + (m.corruption - 30) / 220
  // Closed economies of the past: planned economies and the license raj kept foreign firms out.
  if (year < 1991 && (to === 'ru' || to === 'cn' || to === 'ua' || to === 'cu')) nt = Math.max(nt, 0.95)
  if (year < 1991 && to === 'in') nt = Math.max(nt, 0.8)
  if (year < 1979 && to === 'cn') nt = 1
  return clampN(nt, 0, 1)
}

export function barriersInto(from: string, to: string, industry: Industry | string, year: number): Barriers {
  const tariff = tariffOn(from, to, year)
  const bloc = sharedBloc(from, to, year)
  const other = from === to || bloc ? Math.min(0.1, otherBarriers(to, year)) : otherBarriers(to, year)
  const effective = tariff * goodsShare(industry)
  const score = effective * 3 + other
  const label: BarrierLabel = score < 0.18 ? 'open' : score < 0.4 ? 'moderate' : score < 0.7 ? 'restrictive' : 'closed'
  return { tariff, effective, other, label, bloc }
}

export type FxLabel = 'none' | 'low' | 'moderate' | 'high'

export interface FxExposure {
  /** Yearly swing of the pair, from the last five years (0.08 = about 8% a year). */
  swing: number
  label: FxLabel
  /** Both countries use the same currency. */
  shared: boolean
  code: string
}

/** How much the exchange rate between two countries moved, a year at a time, over the last five years. */
export function fxExposure(home: string, to: string, year: number): FxExposure {
  const code = currencyOf(to, year).code
  if (home === to || currencyOf(home, year).code === code) return { swing: 0, label: 'none', shared: home !== to, code }
  const y = Math.min(year, PRESENT_YEAR)
  const rel = (yy: number) => Math.log(Math.max(1e-9, exchangeRate(to, yy)) / Math.max(1e-9, exchangeRate(home, yy)))
  const swing = Math.abs(rel(y) - rel(y - 5)) / 5 + 0.5 * Math.max(0, marketOf(to).inflation - marketOf(home).inflation)
  return { swing, label: swing < 0.02 ? 'low' : swing < 0.06 ? 'moderate' : 'high', shared: false, code }
}
