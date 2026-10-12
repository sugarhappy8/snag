// Market share and competition for every company: the yearly booking of who sold what (the
// player, its named rivals and the long tail), newcomers drawn in by fat margins, the read-only
// views the Market & Competition screen, the company info rows and the profile summary use, antitrust
// risk, and the dollar values the Business talent's hints put on competitive moves. The demand
// model itself is competition-core.ts (pure, shared with planFor and techPlan).
import { seeded } from '../assets'
import type { BrandTier } from '../data/brands'
import { log } from '../core'
import { marketOf } from '../data/markets'
import type { Statement } from './state'
import type { Asset, GameState } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { dominanceFrom, freshMarketState, marketDemand, marketKey, marketStateOf, type MarketCtx, type MarketPick } from './competition-core'
import { effectiveRegime, marketDef, marketGrowth, OUTSIDE, regimeFor, tierFor, type Regime, type TierId } from './competition-data'
import { familyId, isRealName, pickHub, rawPull, rivalName, rosterOf, type RivalTier } from './competition-roster'
import { emptyMarket, type ExtraRival, type MarketState } from './competition-state'
import { localEcon, marketCtxFor, marketScale, type Worth } from './economy'
import { industryDef } from './industries'
import { entryStrength, presenceIn } from './market-reach'
import { regionalShares } from './market-regional'
import { readBiz, type BizState } from './state'
import { clampN, money as moneyShort, toJson } from './util'

// ---------------------------------------------------------------------------
// State access

/** The company's market state, normalized (a fresh one when it never booked a year). */
export function marketOfBiz(b: BizState): MarketState {
  return freshMarketState(b) ?? emptyMarket(marketKey(b))
}

/** Write a changed market state back (bumps the revision the planner caches on). */
export function saveMarket(b: BizState, st: MarketState): void {
  st.rev += 1
  b.market = toJson(st)
}

// ---------------------------------------------------------------------------
// The yearly booking

/**
 * Book `year` in the company's market: its share of units sold (customers it turned away for lack
 * of capacity went to rivals), the rivals' shares, the installed base network effects feed on,
 * history, and newcomers lured by fat margins. `pick` is the year's demand from the planner at the
 * price actually charged (planFor / techPlan `market`). Call after the year is simulated and
 * before evolve(). Idempotent per year.
 */
export function refreshMarket(g: GameState, a: Asset, b: BizState, year: number, stmt: Statement, pick: (MarketPick & { bu: number; capacity?: number }) | null): void {
  const prev = freshMarketState(b)
  if (prev && prev.year >= year) return
  const st = prev ?? emptyMarket(marketKey(b))
  const ctx = marketCtxFor(g, b, year)
  const def = industryDef(b.industry)
  const served = stmt.demand > 0 ? clampN(stmt.sold / stmt.demand, 0, 1) : 0
  const want = pick && Number.isFinite(pick.units) ? Math.max(0, pick.units) : 0
  const mine = want * served
  const spill = ctx.F / (ctx.F + OUTSIDE)
  const rivalsUnits = Math.max(0, ctx.pot * (pick ? pick.take * (1 - pick.share) : spill) + want * (1 - served) * spill)
  const total = mine + rivalsUnits
  const share = total > 0 ? clampN(mine / total, 0, 1) : 0
  const others = 1 - share

  const rivals: [string, number][] = ctx.rivals
    .map((r): [string, number] => [r.id, ctx.F > 0 ? (others * r.pull) / ctx.F : 0])
    .filter((x) => x[1] > 1e-7)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 40)
    .map(([id, s]) => [id, Math.round(s * 1e6) / 1e6])
  const rank = 1 + rivals.filter((r) => r[1] > share).length
  // Market size in dollars: what the player actually took (at its own prices) plus the rivals'
  // sales at the going price, both through this year's economy.
  const priceRef = ctx.def.scope === 'world' ? def.price : localEcon(b.industry, b.countryId, b.city).goingPrice
  const macro = Math.max(0.3, 1 + ((stmt.cycle || 1) - 1) * (0.5 + def.incomeSens))
  const myPrice = stmt.price > 0 ? stmt.price : priceRef
  const size = Math.max(0, mine * macro * myPrice + rivalsUnits * macro * priceRef)

  st.base = st.year === year - 1 ? 0.5 * st.base + 0.5 * share : share
  st.share = share
  st.rank = rank
  st.size = Number.isFinite(size) ? Math.round(size) : 0
  // Customers turned away because the company couldn't make enough (not a plan that was too small).
  st.unmet = want > 0 && stmt.demand > 0 ? clampN(pick && pick.capacity !== undefined ? (stmt.demand - pick.capacity) / stmt.demand : 1 - served, 0, 1) : 0
  st.rivals = rivals
  const lead = rivals.length ? rivals[0][1] : 0
  const hhi = Math.round(rivals.reduce((t, r) => t + (r[1] * 100) ** 2, share * share * 10_000))
  st.history = [...st.history.filter((h) => h.year < year), { year, share: Math.round(share * 1e6) / 1e6, rank, size: st.size, lead: Math.round(lead * 1e6) / 1e6, hhi }].slice(-20)
  if (st.edgeUntil <= year) {
    st.edge = 1
    st.edgeUntil = 0
  }
  for (const [id, m] of Object.entries(st.mods)) if (m.until <= year) delete st.mods[id]
  st.year = year
  lureNewcomer(g, a, b, st, stmt, year)
  saveMarket(b, st)
}

/** Fat margins draw new money in: a newcomer founded to take a slice (deterministic per company and year). */
function lureNewcomer(g: GameState, a: Asset, b: BizState, st: MarketState, stmt: Statement, year: number): void {
  if (!(stmt.revenue > 0) || stmt.net <= 0 || st.share < 0.002) return
  const margin = stmt.net / stmt.revenue
  const p = clampN((margin - 0.2) * 1.5, 0, 0.35) * (st.share >= 0.9 ? 0.5 : 1)
  if (p <= 0) return
  const fam = familyId(g.lifeId)
  const s = seeded(`${fam}|lure|${a.id}|${year}`)
  if (!s.chance(p)) return
  const d = marketDef(b.industry)
  const hq = d.scope === 'world' ? pickHub(s, d, 'world') : b.countryId
  const taken = new Set(rosterOf(fam, b.industry, st.key).rivals.map((r) => r.name).concat(st.extra.map((x) => x.name)))
  let name = ''
  for (let i = 0; i < 8 && (!name || taken.has(name) || isRealName(name)); i++) name = rivalName(s, b.industry, d, hq)
  if (taken.has(name) || isRealName(name)) return
  const x: ExtraRival = { id: `x${year}${s.int(10, 99)}`, name, hq, founded: year + 1, pot: (0.6 + 2 * s.next()) * (1 + 2 * st.share), ramp: s.int(3, 5), origin: 'entrant' }
  st.extra = [...st.extra.filter((e) => e.founded > year - 40), x].slice(-12)
  log(g, `${name} launched to grab a slice of ${a.name}'s ${d.noun} profits.`, 'neutral')
}

// ---------------------------------------------------------------------------
// Read-only views (menus, info rows, the profile summary)

export interface RivalView {
  id: string
  name: string
  hq: string
  founded: number
  share: number
  quality: number
  tech: number
  /** Growing (1), steady (0) or fading (-1). */
  trend: number
  legacy: boolean
  extra?: ExtraRival['origin']
  /** A real company (otherwise a fictional local challenger or a newcomer). */
  real: boolean
  /** Size class this year. */
  tier: RivalTier
  /** Price segment of a real company's offer. */
  seg?: BrandTier
}

export interface AntitrustView {
  regime: Regime
  /** Chance of a case in a year at this share. */
  p: number
  label: 'none' | 'low' | 'moderate' | 'high' | 'severe'
  /** Buy-outs in the last eight years (regulators watch the pattern). */
  acquisitions: number
  /** Countries where the company's local dominance adds to the risk. */
  regional: { country: string; share: number; p: number }[]
}

export interface MarketView {
  scope: 'world' | 'national'
  noun: string
  /** 'the world' / 'the United States'. */
  place: string
  /** Year the numbers are for. */
  year: number
  booked: boolean
  /** Market size in dollars a year. */
  size: number
  /** Yearly growth of the market over the last five years. */
  growth: number
  share: number
  rank: number
  tier: TierId
  unmet: number
  base: number
  dominance: number
  rivals: RivalView[]
  /** Share held by the long tail of small competitors. */
  fringe: number
  /** The player's share of the whole world's market for this industry. */
  worldShare: number
  /** For world markets: the home country's slice of it and the company's estimated share there. */
  home: { name: string; size: number; share: number } | null
  antitrust: AntitrustView
  history: { year: number; share: number; lead?: number; hhi?: number; rank: number; size: number }[]
}

/** 'the world', 'Japan', 'the United States' (a market key or a country id, as it reads mid-sentence). */
export function placeOf(key: string): string {
  if (key === 'world') return 'the world'
  const c = getCountry(key)
  return /^(United |Czech Republic|Dominican Republic|DR Congo|Netherlands|Philippines|Bahamas)/.test(c.name) ? `the ${c.name}` : c.name
}

const worldLocalCache = new Map<string, number>()

/** The whole world's yearly market for a local trade (sum over every country), in dollars. */
export function worldLocalSize(industry: BizState['industry']): number {
  const hit = worldLocalCache.get(industry)
  if (hit !== undefined) return hit
  let total = 0
  for (const c of COUNTRIES) {
    const { dRef, fieldP } = marketScale(industry, c.id)
    const e = localEcon(industry, c.id, '')
    if (e.demandMult <= 0) continue
    total += dRef * (1 + fieldP) * e.goingPrice
  }
  worldLocalCache.set(industry, total)
  return total
}

const GDP_CACHE: { total: number } = { total: 0 }

function gdpOf(countryId: string): number {
  const m = marketOf(countryId)
  return Math.max(0, m.gdpPerCapita) * Math.max(0, m.populationM)
}

/** A country's slice of world spending (GDP share). */
function gdpShare(countryId: string): number {
  if (!GDP_CACHE.total) GDP_CACHE.total = Math.max(1, COUNTRIES.reduce((t, c) => t + gdpOf(c.id), 0))
  return clampN(gdpOf(countryId) / GDP_CACHE.total, 0, 1)
}

/** "Japan's", "the United States'". */
export function possessive(place: string): string {
  return /s$/.test(place) ? `${place}'` : `${place}'s`
}

/** Buy-outs within the last eight years (the pattern regulators look at). */
export function recentAcquisitions(st: Pick<MarketState, 'acquired'> | null, year: number): number {
  return st ? st.acquired.filter((y) => y >= year - 8 && y <= year).length : 0
}

/** Antitrust exposure at a share (no RNG). `rivals` lets it add the countries where the company dominates locally. */
export function antitrustOf(b: BizState, share: number, year: number, priceRatio = 1, rivals?: readonly RivalView[]): AntitrustView {
  const world = marketDef(b.industry).scope === 'world'
  const regime = effectiveRegime(b.countryId, year, world)
  const st = marketStateOf(b)
  const lobbied = !!st && st.antitrust.lobbyUntil >= year
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const acquisitions = recentAcquisitions(st, year)
  let p = antitrustChance(regime, share, priceRatio, lobbied, revenue, acquisitions)
  const regional: AntitrustView['regional'] = []
  if (world && st && rivals && st.entries.some((e) => entryStrength(e, b.industry, year, st.supplyUntil) > 0.15)) {
    const named = rivals.reduce((t, r) => t + r.share, 0)
    const reg = regionalShares({
      industry: b.industry,
      year,
      home: b.countryId,
      meShare: share,
      mePresence: (c) => presenceIn(st, b.industry, c, b.countryId, year),
      rivals: rivals.map((r) => ({ id: r.id, hq: r.hq, share: r.share, legacy: r.legacy })),
      fringe: Math.max(0, 1 - share - named),
    })
    for (const e of st.entries) {
      if (regional.some((x) => x.country === e.country) || entryStrength(e, b.industry, year, st.supplyUntil) <= 0.15) continue
      const local = reg.me.get(e.country) ?? 0
      const w = reg.weights.get(e.country) ?? 0
      // A foreign regulator looks at the slice of your sales that country accounts for.
      const pc = antitrustChance(regimeFor(e.country, year), local, priceRatio, lobbied, revenue * Math.min(1, w * 8), acquisitions) * 0.6
      if (pc > 0) regional.push({ country: e.country, share: local, p: pc })
    }
    for (const r of regional) p = 1 - (1 - p) * (1 - r.p)
  }
  p = clampN(p, 0, 0.5)
  const label = p <= 0 ? 'none' : p < 0.03 ? 'low' : p < 0.07 ? 'moderate' : p < 0.14 ? 'high' : 'severe'
  return { regime, p, label, acquisitions, regional }
}

/**
 * Yearly chance that regulators open a case against a company with this share and yearly sales:
 * nothing below about 35% of a market (30% after a string of buy-outs); small fry in tiny markets
 * barely register; abusive prices, a strict regulator and a habit of buying rivals make it
 * likelier, a lobbied one less.
 */
export function antitrustChance(regime: Regime, share: number, priceRatio: number, lobbied: boolean, revenue: number, acquisitions = 0): number {
  const floor = acquisitions >= 2 ? 0.3 : 0.35
  if (share < floor) return 0
  const gouge = priceRatio > 1.6 ? 1.5 : 1
  // Regulators chase big fish: barely anything under $10M of sales, full attention past ~$3B.
  const scale = clampN((Math.log10(Math.max(1, revenue)) - 7) / 2.5, 0.02, 1)
  const serial = 1 + 0.18 * Math.min(5, acquisitions)
  return clampN(regime.strict * (0.03 + 0.2 * dominanceFrom(share)) * gouge * scale * serial * (lobbied ? 0.4 : 1), 0, 0.4)
}

/**
 * Alcohol makers are adult brands: a minor who has inherited a brewery sees "Brewer A", not the
 * labels. Every real name shown on the market screens goes through here.
 */
export function adultBrandName(g: GameState, b: BizState, name: string, real: boolean, index: number): string {
  const adultTrade = b.industry === 'brewery' || b.industry === 'bar'
  const hidden = adultTrade && real && g.character.age < getCountry(g.character.countryId).drinkingAge
  if (!hidden) return name
  // A, B ... Z, AA, AB ...: every hidden name stays unique however long the field.
  let tag = ''
  for (let n = Math.max(0, index); ; n = Math.floor(n / 26) - 1) {
    tag = String.fromCharCode(65 + (n % 26)) + tag
    if (n < 26) break
  }
  return `${b.industry === 'bar' ? 'Bar' : 'Brewer'} ${tag}`
}

function rivalLookup(g: GameState, b: BizState, st: MarketState | null, year: number): Map<string, RivalView> {
  const ctx = marketCtxFor(g, b, year)
  const d = marketDef(b.industry)
  const fam = familyId(g.lifeId)
  const roster = rosterOf(fam, b.industry, marketKey(b))
  const out = new Map<string, RivalView>()
  for (const r of ctx.rivals) {
    const ros = roster.byId.get(r.id)
    let trend = 0
    if (ros) {
      const now = rawPull(d, ros, year)
      const next = rawPull(d, ros, year + 2)
      trend = next > now * 1.05 ? 1 : next < now * 0.9 ? -1 : 0
    } else if (r.extra) trend = year - r.founded < 4 ? 1 : 0
    const mod = st?.mods[r.id]
    if (mod && mod.until >= year && mod.mult < 1) trend = -1
    out.set(r.id, { id: r.id, name: adultBrandName(g, b, r.name, r.real, out.size), hq: r.hq, founded: r.founded, share: 0, quality: r.quality, tech: r.tech, trend, legacy: r.legacy, real: r.real, tier: r.tier, ...(r.seg ? { seg: r.seg } : {}), ...(r.extra ? { extra: r.extra } : {}) })
  }
  return out
}

/** Everything the Market & Competition screen shows (pure). */
export function marketView(g: GameState, a: Asset): MarketView {
  const b = readBiz(g, a)
  return marketViewOf(g, b)
}

export function marketViewOf(g: GameState, b: BizState): MarketView {
  const d = marketDef(b.industry)
  const def = industryDef(b.industry)
  const st = marketStateOf(b)
  const booked = !!st && st.year > 0
  const year = booked && st ? st.year : g.year
  const lookup = rivalLookup(g, b, st, year)
  let share = 0
  let size = 0
  let rivals: RivalView[] = []
  let ctx: MarketCtx | null = null
  if (booked && st) {
    share = st.share
    size = st.size
    rivals = st.rivals.map(([id, s]) => {
      const r = lookup.get(id)
      return r ? { ...r, share: s } : null
    }).filter((x): x is RivalView => !!x)
  } else {
    ctx = marketCtxFor(g, b, year)
    const priceRef = d.scope === 'world' ? def.price : localEcon(b.industry, b.countryId, b.city).goingPrice
    size = ctx.pot * (ctx.F / (ctx.F + OUTSIDE)) * priceRef
    rivals = ctx.rivals.map((r) => ({ ...(lookup.get(r.id) as RivalView), share: ctx && ctx.F > 0 ? r.pull / ctx.F : 0 })).filter((r) => r.share > 1e-7)
  }
  rivals.sort((x, y) => y.share - x.share)
  const named = rivals.reduce((t, r) => t + r.share, 0)
  const fringe = Math.max(0, 1 - share - named)
  const rank = 1 + rivals.filter((r) => r.share > share).length
  const tier = booked ? tierFor(share, rank) : 'startup'
  const base = st?.base ?? 0
  // World share: the same thing for world markets; for local trades, sales against every country's market.
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const worldShare = d.scope === 'world' ? share : clampN(revenue / Math.max(1, worldLocalSize(b.industry)), 0, 1)
  let home: MarketView['home'] = null
  if (d.scope === 'world') {
    // Home advantage: locals (and local rivals) do better at home than abroad.
    const hq = b.countryId
    const wMe = share * 2
    const wRivals = rivals.reduce((t, r) => t + r.share * (r.hq === hq ? 2 : 1), 0)
    const wTail = fringe * 1.5
    const tot = wMe + wRivals + wTail
    home = { name: getCountry(hq).name, size: size * gdpShare(hq), share: tot > 0 ? wMe / tot : 0 }
  }
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  const priceRatio = going > 0 && b.price > 0 ? b.price / going : 1
  return {
    scope: d.scope,
    noun: d.noun,
    place: placeOf(marketKey(b)),
    year,
    booked,
    size: Number.isFinite(size) ? Math.max(0, size) : 0,
    growth: marketGrowth(b.industry, year),
    share,
    rank,
    tier,
    unmet: st?.unmet ?? 0,
    base,
    dominance: dominanceFrom(base),
    rivals,
    fringe,
    worldShare,
    home,
    antitrust: antitrustOf(b, Math.max(share, base), g.year, priceRatio, rivals),
    history: (st?.history ?? []).map((h) => ({ year: h.year, share: h.share, rank: h.rank, size: h.size, ...(h.lead !== undefined ? { lead: h.lead } : {}), ...(h.hhi !== undefined ? { hhi: h.hhi } : {}) })),
  }
}

/** '7.2%', '0.35%', '<0.01%'. */
export function shareText(s: number): string {
  if (!(s > 0)) return '0%'
  if (s < 0.0001) return '<0.01%'
  if (s < 0.01) return `${(s * 100).toFixed(2)}%`
  if (s < 0.1) return `${(s * 100).toFixed(1)}%`
  return `${Math.round(s * 100)}%`
}

const TIER_WORDS: Record<TierId, string> = { startup: 'startup', niche: 'niche player', contender: 'contender', leader: 'market leader', dominant: 'dominant', monopoly: 'near-monopoly' }

/** "the world" / "Japan's" before a market noun. */
export function marketOwner(place: string): string {
  return place === 'the world' ? 'the world' : possessive(place)
}

/** One short line for the company screen: '7.2% of the world AI market · #3 · contender'. */
export function shareLine(g: GameState, b: BizState): string {
  const v = marketViewOf(g, b)
  const where = marketOwner(v.place)
  // Banks and investment firms earn fees and spreads on a balance sheet instead of selling units,
  // so their field has no sales size or share to report: never "about $0 a year" or "no sales
  // yet" (they book revenue from their first year).
  if (!(v.size > 0)) return `Competing in ${where} ${v.noun} market with ${v.rivals.length} named rivals${v.scope === 'world' ? '' : ' and countless small ones'}`
  if (!v.booked) return `New to ${where} ${v.noun} market (about ${moneyShort(v.size)} a year): ${v.rivals.length} named rivals${v.scope === 'world' ? '' : ' and countless small ones'}`
  if (!(v.share > 0)) return `No sales yet in ${where} ${v.noun} market (about ${moneyShort(v.size)} a year) · ${v.rivals.length} named rivals`
  if (v.scope === 'national' && v.share < 0.005) return `${shareText(v.share)} of ${where} ${v.noun} market · one of thousands of competitors · world share ${shareText(v.worldShare)}`
  return `${shareText(v.share)} of ${where} ${v.noun} market · #${v.rank} · ${TIER_WORDS[v.tier]}`
}

/** A clause for businessSummary: 'holds 7% of the world AI market (#3, contender; biggest rival X with 31%)'. */
export function shareSummary(g: GameState, b: BizState): string {
  const v = marketViewOf(g, b)
  if (!v.booked) return ''
  const where = marketOwner(v.place)
  const top = v.rivals[0]
  const rival = top && top.share > v.share ? `; biggest rival ${top.name} with ${shareText(top.share)}` : top ? `; nearest rival ${top.name} with ${shareText(top.share)}` : ''
  return `holds ${shareText(v.share)} of ${where} ${v.noun} market (#${v.rank}, ${TIER_WORDS[v.tier]}${rival})`
}

// ---------------------------------------------------------------------------
// The Business talent: what competitive changes are worth

/**
 * Dollars a multiplier `mult` on the company's pull for `years` years is worth: the demand it
 * moves (a dominant company has little left to win, a small one wins it all) times the margin.
 */
export function edgeValue(g: GameState, b: BizState, w: Worth, mult: number, years: number): number {
  if (!(mult > 0) || mult === 1 || years <= 0) return 0
  const ctx = marketCtxFor(g, b, g.year)
  // The bottom-up demand that gives the company its current share (a newcomer: a small player).
  const st = marketStateOf(b)
  const s = st && st.year > 0 ? clampN(st.share, 0.0005, 0.98) : 0
  const q = s > 0 ? (s * ctx.F) / (ctx.w * (1 - s) * ctx.edge) : 0.2
  const bu = Math.max(1e-9, ctx.dRef * q)
  const now = marketDemand(ctx, bu).units
  const then = marketDemand(ctx, bu * mult).units
  const move = now > 0 ? then / now - 1 : mult - 1
  const v = w.contrib * move * years * 0.9
  return Number.isFinite(v) ? v : 0
}

// ---------------------------------------------------------------------------
// Game studios sell games, not a price-and-production plan: competition scales their copies.

/**
 * What the market does to a studio's sales this year (0.25 - 3): ~1 in today's crowded market,
 * less in a tiny early market or a crash (1983), more for a studio that owns its market.
 */
export function studioMarketFactor(g: GameState, b: BizState, year: number): number {
  const ctx = marketCtxFor(g, b, year)
  const recent = b.history.slice(-2)
  const avg = recent.length ? recent.reduce((t, r) => t + Math.max(0, r.units), 0) / recent.length : 0
  const bu = Math.max(ctx.dRef * 0.03, avg)
  return clampN(marketDemand(ctx, bu).factor, 0.25, 3)
}

/** The studio's year in market terms (for the yearly booking): its copies before competition. */
export function studioPick(g: GameState, b: BizState, year: number, sold: number): (MarketPick & { bu: number }) | null {
  if (!(sold > 0)) return null
  const f = studioMarketFactor(g, b, year)
  const bu = sold / Math.max(0.05, f)
  return { ...marketDemand(marketCtxFor(g, b, year), bu), bu }
}

