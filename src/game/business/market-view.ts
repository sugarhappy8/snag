// Read-only numbers behind the Market & Competition screen: concentration, the leaderboard,
// segments, regions and countries, history and rival profiles. Everything here is pure (no RNG
// from the game, no state writes) and derived from the same market model as the share itself, so
// the screen, the planner and the yearly books tell the same story. Figures are approximate and
// the screen says so.
import { seeded } from '../assets'
import type { BrandTier } from '../data/brands'
import { industryDemand, type Industry } from '../data/markets'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { marketKey, marketStateOf } from './competition-core'
import { effectiveRegime, marketDef, mergerLimit, regimeFor, type Regime } from './competition-data'
import { adultBrandName, antitrustChance, type MarketView, type RivalView } from './competition'
import { arcMult, familyId, futureDrift, maturity, rosterOf, type Rival, type RivalTier } from './competition-roster'
import { localEcon } from './economy'
import { presenceIn } from './market-reach'
import { continentOf, regionalShares, type Regional } from './market-regional'
import { fxExposure, type Barriers, type FxExposure } from './market-trade'
import { barriersWith } from '../nation/trade-policy'
import { placeName } from './market-places'
import { totalOutlets, type BizState } from './state'
import { clampN } from './util'

// ---------------------------------------------------------------------------
// Text bars

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** A sparkline of a series, scaled to its own maximum. */
export function spark(values: readonly number[]): string {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)))
  if (!(max > 0)) return values.map(() => BLOCKS[0]).join('')
  return values.map((v) => (v > 0 ? BLOCKS[Math.max(0, Math.min(7, Math.round((v / max) * 7)))] : BLOCKS[0])).join('')
}

/** A horizontal bar `width` cells wide for `share` against `max`. */
export function bar(share: number, max: number, width = 10): string {
  if (!(share > 0) || !(max > 0)) return '░'.repeat(width)
  const n = Math.max(1, Math.min(width, Math.round((share / max) * width)))
  return '▓'.repeat(n) + '░'.repeat(width - n)
}

export function trendArrow(t: number): string {
  return t > 0 ? '↗' : t < 0 ? '↘' : '→'
}

// ---------------------------------------------------------------------------
// Concentration

export type ConcentrationLabel = 'fragmented' | 'competitive' | 'moderately concentrated' | 'highly concentrated' | 'near-monopoly'

export interface Concentration {
  /** Herfindahl-Hirschman index of the named players (0-10,000; the long tail counts as thousands of tiny firms). */
  hhi: number
  label: ConcentrationLabel
  /** 10,000 / HHI: how many equal-sized firms would give the same concentration. */
  equivalentFirms: number
  /** Combined share of the three biggest players (you included). */
  top3: number
}

export function concentrationOf(v: MarketView): Concentration {
  const shares = [...v.rivals.map((r) => r.share), v.share].filter((s) => s > 0).sort((a, b) => b - a)
  const hhi = Math.round(shares.reduce((t, s) => t + (s * 100) ** 2, 0))
  const label: ConcentrationLabel = hhi < 1000 ? 'fragmented' : hhi < 1500 ? 'competitive' : hhi < 2500 ? 'moderately concentrated' : hhi < 4000 ? 'highly concentrated' : 'near-monopoly'
  return { hhi, label, equivalentFirms: hhi > 0 ? 10_000 / hhi : 0, top3: shares.slice(0, 3).reduce((t, s) => t + s, 0) }
}

// ---------------------------------------------------------------------------
// Leaderboard

export interface LeaderRow {
  id: string
  name: string
  hq: string
  share: number
  trend: number
  tier: RivalTier
  seg?: BrandTier
  real: boolean
  me: boolean
  legacy: boolean
  rank: number
}

/** The top `n` players by share, with the player's own company slotted in at its rank. */
export function leaderboard(v: MarketView, b: BizState, myName: string, n = 10): LeaderRow[] {
  const rows: LeaderRow[] = v.rivals.map((r) => ({ id: r.id, name: r.name, hq: r.hq, share: r.share, trend: r.trend, tier: r.tier, ...(r.seg ? { seg: r.seg } : {}), real: r.real, me: false, legacy: r.legacy, rank: 0 }))
  const h = v.history
  const prior = h.length >= 2 ? h[h.length - 2].share : v.share
  rows.push({ id: 'me', name: myName, hq: b.countryId, share: v.share, trend: v.share > prior * 1.1 ? 1 : v.share < prior * 0.9 ? -1 : 0, tier: v.share >= 0.1 ? 'giant' : v.share >= 0.03 ? 'major' : v.share >= 0.005 ? 'mid' : 'small', real: false, me: true, legacy: false, rank: 0 })
  rows.sort((a, b2) => b2.share - a.share)
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  const top = rows.slice(0, n)
  // The player always shows, even outside the top.
  const me = rows.find((r) => r.me)
  if (me && !top.includes(me) && v.booked) top.push(me)
  return top
}

// ---------------------------------------------------------------------------
// Segments

export type SegmentId = 'budget' | 'mass' | 'premium' | 'luxury'

export const SEGMENT_ORDER: SegmentId[] = ['budget', 'mass', 'premium', 'luxury']

const SEGMENT_NAMES: Partial<Record<Industry, [string, string, string, string]>> = {
  restaurant: ['Fast food', 'Casual dining', 'Upscale dining', 'Fine dining'],
  cafe: ['Grab-and-go', 'Coffee chains', 'Specialty coffee', 'Destination cafés'],
  hotel: ['Budget hotels', 'Midscale', 'Upscale', 'Luxury'],
  fashion: ['Fast fashion', 'High street', 'Premium labels', 'Designer'],
  beauty: ['Drugstore', 'Mass beauty', 'Prestige', 'Luxury beauty'],
  grocery: ['Discount', 'Supermarkets', 'Premium grocers', 'Gourmet'],
  clinic: ['Basic care', 'Private clinics', 'Premium hospitals', 'Elite care'],
  electricVehicles: ['Entry', 'Mainstream', 'Premium', 'Luxury'],
  gym: ['Low-cost gyms', 'Mainstream clubs', 'Premium clubs', 'Elite clubs'],
  realEstate: ['Affordable', 'Mainstream', 'Premium', 'Luxury'],
  marketing: ['Performance & digital', 'Full-service agencies', 'Global networks', 'Boutique creative'],
  software: ['Consumer & SMB', 'Business tools', 'Enterprise', 'Mission-critical'],
  semiconductor: ['Commodity', 'Mainstream', 'Leading edge', 'Cutting edge'],
  aiLab: ['Open & small models', 'Mainstream models', 'Frontier-ish', 'Frontier'],
}

export function segmentNames(industry: string): [string, string, string, string] {
  return SEGMENT_NAMES[industry as Industry] ?? ['Budget', 'Mass market', 'Premium', 'Luxury']
}

export function segOfTier(t: BrandTier | undefined, quality: number): SegmentId {
  if (t === 'budget') return 'budget'
  if (t === 'mass') return 'mass'
  if (t === 'premium') return 'premium'
  if (t === 'luxury' || t === 'ultra') return 'luxury'
  return quality < 46 ? 'budget' : quality < 62 ? 'mass' : quality < 80 ? 'premium' : 'luxury'
}

/** The segment a company's own price and quality put it in. */
export function mySegment(b: BizState): SegmentId {
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  const ratio = going > 0 && b.price > 0 ? b.price / going : 1
  const score = (ratio - 1) * 1.2 + (b.quality - 55) / 60
  return score < -0.28 ? 'budget' : score < 0.28 ? 'mass' : score < 0.85 ? 'premium' : 'luxury'
}

/** How the market's money splits across the segments in a place (richer places spend more at the top). */
export function segmentWeights(countryId: string | null): Record<SegmentId, number> {
  const wealth = countryId ? clampN(getCountry(countryId).wealth ?? 1, 0.1, 1.6) : 0.9
  const top = clampN(0.06 + 0.1 * wealth, 0.04, 0.26)
  const lux = top * 0.3
  const prem = top - lux
  const budget = clampN(0.5 - 0.22 * wealth, 0.18, 0.5)
  return { budget, mass: 1 - budget - prem - lux, premium: prem, luxury: lux }
}

const ADJACENT: Record<SegmentId, Partial<Record<SegmentId, number>>> = {
  budget: { budget: 0.78, mass: 0.22 },
  mass: { budget: 0.18, mass: 0.64, premium: 0.18 },
  premium: { mass: 0.2, premium: 0.62, luxury: 0.18 },
  luxury: { premium: 0.3, luxury: 0.7 },
}

export interface SegmentRow {
  id: SegmentId
  label: string
  /** Share of the market's money (0-1). */
  weight: number
  /** Dollars a year (approximate). */
  size: number
  /** Your share inside the segment. */
  me: number
  /** The leader of the segment (null when nobody else plays). */
  leader: { name: string; share: number; real: boolean } | null
  /** Players in the segment, you included. */
  players: number
  /** Your rank inside it (0 = absent). */
  rank: number
  mine: boolean
  /** The other named players' local shares in the segment (0-1), biggest first. */
  others?: number[]
}

export function segmentsOf(b: BizState, v: MarketView): SegmentRow[] {
  const names = segmentNames(b.industry)
  const wt = segmentWeights(v.scope === 'national' ? b.countryId : null)
  const mine = mySegment(b)
  const players: { name: string; real: boolean; me: boolean; dist: Record<SegmentId, number>; share: number }[] = v.rivals.map((r) => ({
    name: r.name,
    real: r.real,
    me: false,
    share: r.share,
    dist: spread(segOfTier(r.seg, r.quality)),
  }))
  players.push({ name: 'you', real: false, me: true, share: v.share, dist: spread(mine) })
  return SEGMENT_ORDER.map((id, i): SegmentRow => {
    const inSeg = players.map((p) => ({ p, s: p.share * (p.dist[id] ?? 0) })).filter((x) => x.s > 1e-9)
    const total = inSeg.reduce((t, x) => t + x.s, 0)
    // The tail holds the same slice of every segment; named players split the rest.
    const named = Math.max(0, 1 - v.fringe)
    const local = (s: number) => (total > 0 ? (s / total) * named : 0)
    const sorted = [...inSeg].sort((x, y) => y.s - x.s)
    const lead = sorted.find((x) => !x.p.me)
    const myRow = sorted.findIndex((x) => x.p.me)
    return {
      id,
      label: names[i],
      weight: wt[id],
      size: v.size * wt[id],
      me: local(inSeg.find((x) => x.p.me)?.s ?? 0),
      leader: lead ? { name: lead.p.name, share: local(lead.s), real: lead.p.real } : null,
      players: inSeg.length,
      rank: myRow >= 0 ? myRow + 1 : 0,
      mine: id === mine,
      others: sorted.filter((x) => !x.p.me).map((x) => local(x.s)),
    }
  })
}

function spread(seg: SegmentId): Record<SegmentId, number> {
  const out: Record<SegmentId, number> = { budget: 0, mass: 0, premium: 0, luxury: 0 }
  for (const [k, w] of Object.entries(ADJACENT[seg])) out[k as SegmentId] = w ?? 0
  return out
}

// ---------------------------------------------------------------------------
// Regions and countries

export interface CountryRow {
  id: string
  name: string
  continent: string
  /** Slice of the industry's world demand. */
  weight: number
  /** Approximate demand there, dollars a year. */
  demand: number
  /** The player's share there. */
  me: number
  /** Presence of the player there (0-1.3). */
  presence: number
  leader: { name: string; share: number; hq: string; real: boolean } | null
}

export interface RegionRow {
  name: string
  weight: number
  demand: number
  me: number
  leader: { name: string; share: number } | null
  countries: CountryRow[]
}

const regionalCache = new Map<string, Regional>()

/** The country split of a world market for this company this year (cached; pure). */
export function regionalOf(g: GameState, b: BizState, v: MarketView): Regional {
  const st = marketStateOf(b)
  const key = `${g.lifeId}|${b.industry}|${b.countryId}|${v.year}|${v.share.toFixed(5)}|${v.rivals.map((r) => `${r.id}:${r.share.toFixed(4)}`).join(',')}|${st ? `${st.rev}` : '-'}|${b.outlets.map((o) => `${o.countryId}${o.count}`).join('')}`
  const hit = regionalCache.get(key)
  if (hit) return hit
  const abroad = new Map<string, number>()
  for (const o of b.outlets) abroad.set(o.countryId, (abroad.get(o.countryId) ?? 0) + o.count)
  const out = regionalShares({
    industry: b.industry,
    year: v.year,
    home: b.countryId,
    meShare: v.share,
    mePresence: (c) => {
      const n = abroad.get(c) ?? 0
      const outlets = n > 0 ? Math.min(1, 0.35 + 0.15 * Math.log2(1 + n)) : 0
      const entered = st ? presenceIn(st, b.industry, c, b.countryId, v.year) : c === b.countryId ? 1 : 0
      return c === b.countryId ? Math.max(1, entered) : Math.max(outlets, entered)
    },
    rivals: v.rivals.map((r) => ({ id: r.id, hq: r.hq, share: r.share, legacy: r.legacy })),
    fringe: v.fringe,
  })
  regionalCache.set(key, out)
  if (regionalCache.size > 24) {
    const first = regionalCache.keys().next().value
    if (first !== undefined) regionalCache.delete(first)
  }
  return out
}

function countryRow(b: BizState, v: MarketView, reg: Regional, id: string): CountryRow {
  const weight = reg.weights.get(id) ?? 0
  let lead: CountryRow['leader'] = null
  for (const r of v.rivals) {
    const s = reg.rivals.get(r.id)?.get(id) ?? 0
    if (!lead || s > lead.share) lead = { name: r.name, share: s, hq: r.hq, real: r.real }
  }
  const st = marketStateOf(b)
  return {
    id,
    name: placeName(id),
    continent: continentOf(id),
    weight,
    demand: v.size * weight,
    me: reg.me.get(id) ?? 0,
    presence: st ? presenceIn(st, b.industry, id, b.countryId, v.year) : id === b.countryId ? 1 : 0,
    leader: lead && lead.share > 0 ? lead : null,
  }
}

/** World markets: the continents, biggest first, each with its countries. */
export function regionsOf(g: GameState, b: BizState, v: MarketView): RegionRow[] {
  if (v.scope !== 'world') return []
  const reg = regionalOf(g, b, v)
  const byContinent = new Map<string, CountryRow[]>()
  for (const id of reg.weights.keys()) {
    if ((reg.weights.get(id) ?? 0) <= 0) continue
    const row = countryRow(b, v, reg, id)
    const list = byContinent.get(row.continent)
    if (list) list.push(row)
    else byContinent.set(row.continent, [row])
  }
  const out: RegionRow[] = []
  for (const [name, countries] of byContinent) {
    countries.sort((x, y) => y.weight - x.weight)
    const weight = countries.reduce((t, c) => t + c.weight, 0)
    const me = weight > 0 ? countries.reduce((t, c) => t + c.weight * c.me, 0) / weight : 0
    // Leader of the region: the rival with the biggest weighted share across its countries.
    let lead: RegionRow['leader'] = null
    for (const r of v.rivals) {
      const m = reg.rivals.get(r.id)
      if (!m) continue
      const s = weight > 0 ? countries.reduce((t, c) => t + c.weight * (m.get(c.id) ?? 0), 0) / weight : 0
      if (!lead || s > lead.share) lead = { name: r.name, share: s }
    }
    out.push({ name, weight, demand: v.size * weight, me, leader: lead && lead.share > 0 ? lead : null, countries })
  }
  return out.sort((x, y) => y.weight - x.weight)
}

export interface CountryDetail {
  row: CountryRow
  barriers: Barriers
  fx: FxExposure
  regime: Regime
  /** Combined share above which this country's regulator would block a merger. */
  mergerLimit: number
  /** Chance a case opens at the player's local share in a year (0 below the regulator's floor). */
  caseChance: number
  /** Local rivals (headquartered there), biggest first. */
  champions: { name: string; share: number; real: boolean }[]
  /** Demand for the industry there compared with a typical market. */
  appetite: number
  /** Years since the player entered (0 = not entered). */
  entered: { mode: string; year: number } | null
}

export function countryDetail(g: GameState, b: BizState, v: MarketView, id: string): CountryDetail | null {
  if (v.scope !== 'world') return null
  const reg = regionalOf(g, b, v)
  if (!reg.weights.has(id)) return null
  const row = countryRow(b, v, reg, id)
  const regime = regimeFor(id, v.year)
  const champions: CountryDetail['champions'] = []
  for (const r of v.rivals) {
    if (r.hq !== id) continue
    champions.push({ name: r.name, share: reg.rivals.get(r.id)?.get(id) ?? 0, real: r.real })
  }
  champions.sort((x, y) => y.share - x.share)
  const st = marketStateOf(b)
  const e = st?.entries.find((x) => x.country === id && x.until + 2 >= v.year)
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return {
    row,
    barriers: barriersWith(g, b.countryId, id, b.industry, v.year),
    fx: fxExposure(b.countryId, id, v.year),
    regime,
    mergerLimit: mergerLimit(regime),
    caseChance: antitrustChance(regime, row.me, 1, false, revenue * Math.min(1, row.weight * 8)),
    champions: champions.slice(0, 3),
    appetite: industryDemand(id, b.industry),
    entered: e ? { mode: e.mode, year: e.year } : null,
  }
}

// ---------------------------------------------------------------------------
// National markets: the same trade in the countries where the company has outlets or could expand

export interface LocalField {
  id: string
  name: string
  /** Market size there, dollars a year. */
  demand: number
  outlets: number
  top: { name: string; hq: string; share: number; real: boolean }[]
  fringe: number
  regime: Regime
  appetite: number
}

/** The top players of a local trade in another country (the market without you), and the country's rules. */
export function localField(g: GameState, b: BizState, v: MarketView, countryId: string): LocalField {
  const fam = familyId(g.lifeId)
  const d = marketDef(b.industry)
  const roster = rosterOf(fam, b.industry, countryId)
  const year = v.year
  const pulls = roster.rivals
    .filter((r) => year >= (r.from ?? r.founded) && year < r.exit)
    .map((r) => ({ r, p: r.pot * maturity(r, year) * arcMult(r.arc, year) * futureDrift(r, year) }))
  const total = pulls.reduce((t, x) => t + x.p, 0)
  const named = 1 - d.fringe
  const top = pulls
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p)
    .slice(0, 5)
    .map((x, i) => ({ name: adultBrandName(g, b, x.r.name, x.r.real === true, i), hq: x.r.hq, share: total > 0 ? (named * x.p) / total : 0, real: x.r.real === true }))
  const e = localEcon(b.industry, countryId, '')
  const demand = Math.max(0, e.baseDemand * e.goingPrice) * Math.max(1, e.saturation) * 0.5
  return {
    id: countryId,
    name: placeName(countryId),
    demand,
    outlets: b.outlets.filter((o) => o.countryId === countryId).reduce((t, o) => t + o.count, 0),
    top,
    fringe: d.fringe,
    regime: effectiveRegime(countryId, year, false),
    appetite: industryDemand(countryId, b.industry),
  }
}

// ---------------------------------------------------------------------------
// History

export interface HistoryRow {
  years: number[]
  me: number[]
  lead: (number | null)[]
  size: number[]
  hhi: (number | null)[]
}

export function historyOf(v: MarketView, n = 12): HistoryRow {
  const h = v.history.slice(-n)
  return { years: h.map((x) => x.year), me: h.map((x) => x.share), lead: h.map((x) => (x.lead !== undefined ? x.lead : null)), size: h.map((x) => x.size), hhi: h.map((x) => (x.hhi !== undefined ? x.hhi : null)) }
}

// ---------------------------------------------------------------------------
// Rival profiles

export interface RivalProfile {
  rival: RivalView
  roster: Rival | null
  /** Years the company has existed (real founding year). */
  age: number
  /** 'budget' ... 'luxury', or null for companies without a known segment. */
  segment: SegmentId
  strengths: { quality: number; tech: number; priceEdge: 'cheaper' | 'similar' | 'pricier' }
  /** What it has been doing in your game (neutral: product launches, store openings, expansions, price moves). */
  recent: string[]
  /** What it is likely to do next. */
  next: string
  /** Where it trades (national markets: countries; world markets: its home and neighbours). */
  places: string[]
}

const MOVES = [
  'opened a wave of new flagship locations',
  'launched a refreshed product line',
  'ran a heavy promotional season',
  'signed a distribution partnership',
  'opened a new regional hub',
  'refreshed its brand with a big campaign',
  'trimmed prices on its entry range',
  'expanded its premium range',
]

export function profileOf(g: GameState, b: BizState, v: MarketView, rivalId: string): RivalProfile | null {
  const r = v.rivals.find((x) => x.id === rivalId)
  if (!r) return null
  const fam = familyId(g.lifeId)
  const roster = rosterOf(fam, b.industry, marketKey(b)).byId.get(rivalId) ?? null
  const segment = segOfTier(r.seg, r.quality)
  const mine = mySegment(b)
  const idx = (s: SegmentId) => SEGMENT_ORDER.indexOf(s)
  const priceEdge = idx(segment) < idx(mine) ? 'cheaper' : idx(segment) > idx(mine) ? 'pricier' : 'similar'
  const year = v.year
  const recent: string[] = []
  const from = roster ? (roster.from ?? roster.founded) : r.founded
  if (from >= year - 3 && from > 1900) recent.push(from === year ? 'Entered this market this year' : `Entered this market in ${from}`)
  if (r.trend > 0) recent.push('Gaining ground: its pull is growing')
  if (r.trend < 0) recent.push('Losing ground: its pull is shrinking')
  const st = marketStateOf(b)
  const mod = st?.mods[rivalId]
  if (mod && mod.until >= year && mod.mult < 1) recent.push('Knocked back by your latest move')
  if (mod && mod.until >= year && mod.mult > 1) recent.push('Hitting back harder after your latest move')
  const s = seeded(`${fam}|moves|${rivalId}|${year}`)
  const pool = [...MOVES]
  for (let i = 0; i < 2 && pool.length; i++) {
    const k = s.int(0, pool.length - 1)
    // Story beats for the game world, not a record of what the real company did: real names say so.
    recent.push(`In ${year - i} it ${pool[k]}${r.real ? ' (simulated)' : ''}`)
    pool.splice(k, 1)
  }
  // What it does next is read off its position, never rolled: the same story twice, a different one next year.
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(seeded(`${fam}|next|${rivalId}|${year}`).next() * xs.length)]
  const cheaper = priceEdge === 'cheaper'
  let next: string
  if (r.legacy) next = 'It is steered by state contracts and budgets more than by the market'
  else if (r.tier === 'giant' && v.share > r.share * 0.5) next = 'A giant watching a challenger: expect promotions and a price answer if you keep gaining'
  else if (r.trend > 0 && r.quality >= b.quality) next = pick(['Likely to keep taking share with a better product: expect new launches', 'Likely to widen its lead on quality: expect a refreshed range'])
  else if (r.trend > 0) next = pick(['Likely to expand into more locations and markets', 'Likely to open more outlets and push harder on promotions'])
  else if (r.trend < 0) next = pick(['Likely to cut prices to hold on to its customers', 'Likely to sharpen its focus on its strongest markets'])
  else if (cheaper) next = pick(['Likely to keep undercutting with promotions on its entry range', 'Likely to defend its low prices and add volume'])
  else if (priceEdge === 'pricier') next = pick(['Likely to push further upmarket with a premium launch', 'Likely to defend its premium customers with loyalty perks'])
  else next = pick(['Likely to hold its position and defend its customers', 'Likely to tweak its range and wait for you to move', 'Likely to open a few new locations and keep its prices'])
  let places: string[]
  if (roster?.places?.length) places = roster.places.slice(0, 8).map(placeName)
  else if (v.scope === 'world') {
    // Where it sells most: the countries where its modeled share beats the rest.
    const reg = regionalOf(g, b, v)
    const m = reg.rivals.get(rivalId)
    const top = m ? [...m.entries()].map(([c, share]) => ({ c, score: share * (reg.weights.get(c) ?? 0) })).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => placeName(x.c)) : []
    places = top.length ? top : [placeName(r.hq)]
  } else places = [placeName(r.hq)]
  return { rival: r, roster, age: Math.max(0, year - r.founded), segment, strengths: { quality: r.quality, tech: r.tech, priceEdge }, recent, next, places }
}

/** For tests and menus: the biggest outlets abroad. */
export function outletsAbroad(b: BizState): number {
  return totalOutlets(b) - b.outlets.filter((o) => o.countryId === b.countryId).reduce((t, o) => t + o.count, 0)
}

