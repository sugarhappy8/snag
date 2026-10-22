// Strategy beyond the four classic moves: entering a country (export, partner / joint venture,
// local subsidiary), regional brand campaigns, patent cross-licences (deep tech), diversifying
// supply chains, and defending the home market. Every move goes through the existing share model
// (market-reach.ts folds it into the company's pull) and has a real cost, a term, tariffs and red
// tape that eat into it, and diminishing returns. `quote*` is pure (no RNG, no state writes) and is
// what the menu, the scenario table and the Business talent's purple hints all read; `run*` is what
// the buttons do, using the same numbers.
import { firmCash } from '../cash'
import { count, formatMoney, log, notice, useYearAction } from '../core'
import { industryDemand, marketOf } from '../data/markets'
import type { Asset, GameState } from '../types'
import { marketCtxFor } from './economy'
import { marketDemand, marketKey, marketStateOf } from './competition-core'
import { industryEraBlock, marketDef, mergerLimit, effectiveRegime } from './competition-data'
import { marketOfBiz, marketViewOf, saveMarket, shareText, type MarketView } from './competition'
import { scaledCost } from './competition-moves'
import { emptyMarket, type EntryMode, type MarketState } from './competition-state'
import { techOf } from './deeptech-core'
import { isDeepTech } from './deeptech-state'
import { bizWorth, fxValue, localEcon, type Worth } from './economy'
import { eventChance } from './events'
import { CAMPAIGN_TERM, DEFEND_TERM, MODE_LABEL, MODE_TERM, SUPPLY_HIT, SUPPLY_SHIELDED, SUPPLY_TERM, demandWeights, reachOf } from './market-reach'
import { placeName } from './market-places'
import { barriersInto } from './market-trade'
import { barriersWith } from '../nation/trade-policy'
import { industryDef } from './industries'
import type { BizState } from './state'
import { cap, clampN, money } from './util'

/** Years of benefit a quote counts (later years are discounted: a dollar next year is worth less). */
const HORIZON = 10
const DISCOUNT = 0.92

/** Share of the extra profit each way of entering lets the company keep (distributor margins, a partner's cut, local overhead). */
export const MODE_KEEP: Record<EntryMode, number> = { export: 0.9, jv: 0.75, sub: 0.92 }

/** Years of the added revenue each way of entering costs at its best (a subsidiary is built, an export deal is signed). */
const ENTRY_PRIZE: Record<EntryMode, number> = { export: 0.25, jv: 0.6, sub: 1.2 }

/** A campaign costs this many years of the revenue it adds at its best (marketing returns about 2-4x). */
const CAMPAIGN_PRIZE = 0.5
/** Defending home: the same logic. */
const DEFEND_PRIZE = 0.6

const ENTRY_BASE: Record<EntryMode, [number, number]> = { export: [90_000, 0.012], jv: [300_000, 0.03], sub: [750_000, 0.07] }

export type StrategyMove =
  | { kind: 'enter'; country: string; mode: EntryMode }
  | { kind: 'campaign'; country: string }
  | { kind: 'defend' }
  | { kind: 'supply' }
  | { kind: 'license'; rivalId: string }

export interface MoveQuote {
  move: StrategyMove
  /** What it costs now (company cash). */
  cost: number
  /** Why it can't be done right now (null: it can). */
  block: string | null
  /** The multiplier on the company's pull, this year and the next few (1 = nothing). */
  path: number[]
  /** Extra share at the best year of the path, as a fraction of the market (0.01 = a point). */
  shareDelta: number
  /** Expected dollars to the owner over the term, net of the cost (Business talent). */
  value: number
  /** Years the benefit lasts (term). */
  years: number
}

// ---------------------------------------------------------------------------
// The honest value of a pull multiplier

/** Dollars a multiplier on the company's pull is worth in one year: demand it wins (capped by spare capacity) times the margin. */
function gainOf(g: GameState, b: BizState, w: Worth, mult: number): number {
  if (!(mult > 0) || Math.abs(mult - 1) < 1e-6) return 0
  const ctx = marketCtxFor(g, b, g.year)
  const st = marketStateOf(b)
  const s = st && st.year > 0 ? clampN(st.share, 0.0005, 0.98) : 0
  const q = s > 0 ? (s * ctx.F) / (ctx.w * (1 - s) * ctx.edge) : 0.2
  const bu = Math.max(1e-9, ctx.dRef * q)
  const now = marketDemand(ctx, bu).units
  const then = marketDemand(ctx, bu * mult).units
  const move = now > 0 ? then / now - 1 : mult - 1
  // More customers than the company can serve are wasted: only spare capacity turns into sales.
  const spare = 1 / clampN(w.util, 0.2, 1) - 1
  const realized = move > 0 ? Math.min(move, spare) : move
  const v = w.contrib * realized * 0.9
  return Number.isFinite(v) ? v : 0
}

/** Extra share (a fraction of the market) a multiplier on pull wins. */
export function shareGain(g: GameState, b: BizState, mult: number): number {
  const ctx = marketCtxFor(g, b, g.year)
  const st = marketStateOf(b)
  const s = st && st.year > 0 ? clampN(st.share, 0.0005, 0.98) : 0
  const q = s > 0 ? (s * ctx.F) / (ctx.w * (1 - s) * ctx.edge) : 0.2
  const bu = Math.max(1e-9, ctx.dRef * q)
  return marketDemand(ctx, bu * mult).share - marketDemand(ctx, bu).share
}

function copyState(b: BizState): MarketState {
  return marketOfBiz(b) ?? emptyMarket(marketKey(b))
}

/** The pull multipliers a changed market state gives against the current one, year by year. */
function pathOf(g: GameState, b: BizState, now: MarketState, then: MarketState): number[] {
  const out: number[] = []
  for (let k = 0; k < HORIZON; k++) {
    const y = g.year + k
    const r0 = reachOf(now, b.industry, y)
    out.push(r0 > 0 ? reachOf(then, b.industry, y) / r0 : 1)
  }
  return out
}

function valueOfPath(g: GameState, b: BizState, w: Worth, path: number[], keep: number): number {
  let v = 0
  path.forEach((m, k) => {
    v += gainOf(g, b, w, m) * Math.pow(DISCOUNT, k)
  })
  return v * keep
}

/**
 * A quote: the pull multipliers the move gives, what that is worth, and what it costs. A move is
 * priced at the larger of its fixed floor (lawyers, offices, agencies) and `k` times the yearly
 * revenue it adds at its best, so nobody buys a big slice of the world for a rounding error: the
 * prize sets the price.
 */
function quoteFor(g: GameState, b: BizState, w: Worth, move: StrategyMove, floor: number, k: number, pre: string | null, now: MarketState, then: MarketState, keep: number, years: number, extra = 0): MoveQuote {
  const path = pathOf(g, b, now, then)
  const peak = path.reduce((m, x) => Math.max(m, x), 1)
  const cost = Math.round(Math.max(floor, k * Math.max(0, w.revenue) * (peak - 1)))
  const block = pre ?? cashBlock(b, cost)
  return { move, cost, block, path, shareDelta: shareGain(g, b, peak), value: valueOfPath(g, b, w, path, keep) + extra - cost, years }
}

function cashBlock(b: BizState, cost: number): string | null {
  return b.cash < cost ? `The company has ${money(Math.max(0, b.cash))} in cash; this needs ${money(cost)}.` : null
}

function sizeFactor(industry: string, country: string): number {
  const w = demandWeights(industry).get(country) ?? 0
  return clampN(Math.sqrt(w / 0.03), 0.6, 2.4)
}

// ---------------------------------------------------------------------------
// Entering a country

export const ACTIVE_ENTRIES_MAX = 12

/** Why a company can't enter this country at all (null: it can). */
export function entryEligibility(b: BizState, v: MarketView, country: string): string | null {
  if (v.scope !== 'world') return 'Local trades are fought outlet by outlet: open locations abroad from Expansion instead.'
  if (country === b.countryId) return 'That is your home market.'
  if (industryDemand(country, b.industry) <= 0) return `${cap(b.industry === 'brewery' || b.industry === 'bar' ? 'alcohol' : 'this business')} is banned or impossible in ${placeName(country)}.`
  const block = industryEraBlock(b.industry, country, v.year)
  if (block) return block
  const bar = barriersInto(b.countryId, country, b.industry, v.year)
  if (bar.other >= 0.95) return `${placeName(country)} is closed to foreign companies in this business.`
  return null
}

export function entryCost(b: BizState, country: string, mode: EntryMode): number {
  const [usBase, rev] = ENTRY_BASE[mode]
  const base = scaledCost(b, usBase, rev)
  const tape = mode === 'sub' ? 1 + marketOf(country).startupDays / 150 : 1
  const level = mode === 'export' ? 1 : Math.sqrt(clampN(localEcon(b.industry, country, '').level, 0.5, 1.6))
  const local = mode === 'sub' ? localEcon(b.industry, country, '').capital * 0.5 : 0
  return Math.round(base * sizeFactor(b.industry, country) * tape * level + local)
}

export function quoteEnter(g: GameState, b: BizState, v: MarketView, country: string, mode: EntryMode, w: Worth = bizWorth(g, b)): MoveQuote | null {
  const move: StrategyMove = { kind: 'enter', country, mode }
  const floor = entryCost(b, country, mode)
  const bad = entryEligibility(b, v, country)
  if (bad) return { move, cost: floor, block: bad, path: [], shareDelta: 0, value: 0, years: MODE_TERM[mode] }
  const now = copyState(b)
  const active = now.entries.filter((e) => e.country === country && e.until >= g.year)
  const best = active.reduce<EntryMode | null>((m, e) => (m === null || MODE_TERM[e.mode] > MODE_TERM[m] ? e.mode : m), null)
  const cur = active[0]
  let block: string | null = null
  if (best && cur && MODE_TERM[best] >= MODE_TERM[mode] && cur.until > g.year + 1) block = `Already ${MODE_LABEL[best].toLowerCase()} in ${placeName(country)} through ${cur.until}.`
  if (!block && now.entries.filter((e) => e.until >= g.year).length >= ACTIVE_ENTRIES_MAX && !active.length) block = `Already active in ${ACTIVE_ENTRIES_MAX} countries: let one lapse first.`
  const then = copyState(b)
  then.entries = then.entries.filter((e) => e.country !== country)
  then.entries.push({ country, home: b.countryId, mode, year: g.year, until: g.year + MODE_TERM[mode] - 1 })
  return quoteFor(g, b, w, move, floor, ENTRY_PRIZE[mode], block, now, then, MODE_KEEP[mode], MODE_TERM[mode])
}

export interface EntryOption {
  country: string
  /** The best mode by expected value. */
  best: MoveQuote
  all: MoveQuote[]
}

/** Countries worth looking at, biggest demand first (world markets). */
export function entryCandidates(b: BizState, v: MarketView, limit = 40): string[] {
  if (v.scope !== 'world') return []
  const w = demandWeights(b.industry)
  return [...w.entries()]
    .filter(([c, x]) => x > 0.002 && entryEligibility(b, v, c) === null)
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([c]) => c)
}

export function entryOption(g: GameState, b: BizState, v: MarketView, country: string, w: Worth = bizWorth(g, b)): EntryOption | null {
  const all = (['export', 'jv', 'sub'] as EntryMode[]).map((m) => quoteEnter(g, b, v, country, m, w)).filter((x): x is MoveQuote => !!x)
  if (!all.length) return null
  const open = all.filter((q) => !q.block || q.block.includes('cash'))
  const best = [...(open.length ? open : all)].sort((x, y) => y.value - x.value)[0]
  return { country, best, all }
}

export function runEnter(g: GameState, a: Asset, b: BizState, country: string, mode: EntryMode): boolean {
  const v = marketViewOf(g, b)
  const q = quoteEnter(g, b, v, country, mode)
  if (!q) return false
  if (q.block) {
    notice(g, 'Cannot Enter Yet', q.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (!useYearAction(g, `biz.mkt.enter.${a.id}`, 2)) {
    notice(g, 'Not Again This Year', `${a.name} already opened two new fronts this year. Your teams need a breather.`, { emoji: '\u{23F3}' })
    return false
  }
  const st = marketOfBiz(b)
  firmCash(g, b, -q.cost, 'capex', a.id)
  b.yearCosts += q.cost
  st.entries = st.entries.filter((e) => e.country !== country)
  st.entries.push({ country, home: b.countryId, mode, year: g.year, until: g.year + MODE_TERM[mode] - 1 })
  st.entries = st.entries.filter((e) => e.until + 3 >= g.year).slice(-24)
  st.lastMove = g.year
  saveMarket(b, st)
  const bar = barriersWith(g, b.countryId, country, b.industry, g.year)
  log(g, `${a.name} entered ${placeName(country)} (${MODE_LABEL[mode].toLowerCase()}).`, 'good')
  notice(
    g,
    `Entering ${placeName(country)}`,
    `${a.name} set up ${MODE_LABEL[mode].toLowerCase()} in ${placeName(country)} for ${formatMoney(q.cost)}. Customers there take about three years to warm up${bar.effective > 0.02 ? `, and a ${Math.round(bar.tariff * 100)}% tariff on goods eats into it${mode === 'sub' ? ' (less so when you build locally)' : ''}` : ''}. The arrangement runs through ${g.year + MODE_TERM[mode] - 1}; renew it to keep the customers.`,
    { emoji: '\u{1F30D}', tone: 'good' },
  )
  return true
}

// ---------------------------------------------------------------------------
// Regional brand campaigns

export function campaignCost(b: BizState, country: string): number {
  return Math.round(scaledCost(b, 60_000, 0.01) * (marketDef(b.industry).scope === 'world' ? sizeFactor(b.industry, country) : 1))
}

export function quoteCampaign(g: GameState, b: BizState, v: MarketView, country: string, w: Worth = bizWorth(g, b)): MoveQuote | null {
  const move: StrategyMove = { kind: 'campaign', country }
  const floor = campaignCost(b, country)
  const now = copyState(b)
  const world = v.scope === 'world'
  let block: string | null = null
  if (!world && country !== b.countryId) block = 'A local trade only competes in its home country.'
  if (world) block = entryEligibility(b, v, country) && country !== b.countryId ? entryEligibility(b, v, country) : null
  const live = now.campaigns.find((c) => c.country === country && c.until >= g.year)
  if (!block && live && live.until > g.year) block = `A campaign in ${placeName(country)} is already running through ${live.until}.`
  const then = copyState(b)
  then.campaigns = [...then.campaigns.filter((c) => c.country !== country), { country, home: b.countryId, year: g.year, until: g.year + CAMPAIGN_TERM - 1 }]
  return quoteFor(g, b, w, move, floor, CAMPAIGN_PRIZE, block, now, then, 1, CAMPAIGN_TERM)
}

export function runCampaign(g: GameState, a: Asset, b: BizState, country: string): boolean {
  const v = marketViewOf(g, b)
  const q = quoteCampaign(g, b, v, country)
  if (!q) return false
  if (q.block) {
    notice(g, 'Cannot Run That Campaign', q.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (!useYearAction(g, `biz.mkt.campaign.${a.id}`, 2)) {
    notice(g, 'Not Again This Year', `${a.name}'s agencies are booked solid. Two campaigns a year is the limit.`, { emoji: '\u{23F3}' })
    return false
  }
  const st = marketOfBiz(b)
  firmCash(g, b, -q.cost, 'marketing', a.id)
  b.yearCosts += q.cost
  st.campaigns = [...st.campaigns.filter((c) => c.country !== country && c.until + 2 >= g.year), { country, home: b.countryId, year: g.year, until: g.year + CAMPAIGN_TERM - 1 }].slice(-12)
  st.lastMove = g.year
  b.brand = clampN(b.brand + 2, 0, 100)
  saveMarket(b, st)
  log(g, `${a.name} launched a brand campaign in ${placeName(country)}.`, 'neutral')
  notice(g, 'Brand Campaign', `${formatMoney(q.cost)} of billboards, partnerships and local influencers put ${a.name} in front of ${placeName(country)}'s customers for ${CAMPAIGN_TERM} years. It works best where you already sell; it fades without a renewal.`, { emoji: '\u{1F4E2}', tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// Defending the home market

export function defendCost(b: BizState): number {
  return scaledCost(b, 70_000, 0.02)
}

export function quoteDefend(g: GameState, b: BizState, w: Worth = bizWorth(g, b)): MoveQuote {
  const move: StrategyMove = { kind: 'defend' }
  const now = copyState(b)
  const block: string | null = now.defendUntil >= g.year ? `Your defences hold through ${now.defendUntil}.` : null
  const then = copyState(b)
  then.defendUntil = g.year + DEFEND_TERM - 1
  return quoteFor(g, b, w, move, defendCost(b), DEFEND_PRIZE, block, now, then, 1, DEFEND_TERM)
}

export function runDefend(g: GameState, a: Asset, b: BizState): boolean {
  const q = quoteDefend(g, b)
  if (q.block) {
    notice(g, 'Already Dug In', q.block, { emoji: '\u{1F6E1}\u{FE0F}' })
    return false
  }
  if (!useYearAction(g, `biz.mkt.defend.${a.id}`, 1)) return false
  const st = marketOfBiz(b)
  firmCash(g, b, -q.cost, 'marketing', a.id)
  b.yearCosts += q.cost
  st.defendUntil = g.year + DEFEND_TERM - 1
  st.lastMove = g.year
  saveMarket(b, st)
  log(g, `${a.name} dug in to defend its home market.`, 'neutral')
  notice(g, 'Defending the Home Market', `${formatMoney(q.cost)} on loyalty programs, key-account deals and price matching at home. Rivals will find ${a.name}'s customers stickier through ${g.year + DEFEND_TERM - 1}.`, { emoji: '\u{1F6E1}\u{FE0F}', tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// Diversifying supply chains

export function supplyCost(b: BizState): number {
  return scaledCost(b, 90_000, 0.015)
}

export function quoteSupply(g: GameState, b: BizState, w: Worth = bizWorth(g, b)): MoveQuote {
  const move: StrategyMove = { kind: 'supply' }
  const now = copyState(b)
  const block: string | null = now.supplyUntil >= g.year ? `Your suppliers are already diversified through ${now.supplyUntil}.` : null
  const then = copyState(b)
  then.supplyUntil = g.year + SUPPLY_TERM - 1
  // The insurance value: the chance of a disruption in a year, and how much less it costs a diversified company.
  const p = Math.min(0.2, eventChance(g, b, 'supplyShock'))
  let insured = 0
  for (let k = 0; k < SUPPLY_TERM; k++) insured += p * (gainOf(g, b, w, SUPPLY_SHIELDED) - gainOf(g, b, w, SUPPLY_HIT)) * Math.pow(DISCOUNT, k)
  return quoteFor(g, b, w, move, supplyCost(b), 0, block, now, then, 1, SUPPLY_TERM, insured)
}

export function runSupply(g: GameState, a: Asset, b: BizState): boolean {
  const q = quoteSupply(g, b)
  if (q.block) {
    notice(g, 'Already Diversified', q.block, { emoji: '\u{1F6A2}' })
    return false
  }
  if (!useYearAction(g, `biz.mkt.supply.${a.id}`, 1)) return false
  const st = marketOfBiz(b)
  firmCash(g, b, -q.cost, 'inputs', a.id)
  b.yearCosts += q.cost
  st.supplyUntil = g.year + SUPPLY_TERM - 1
  st.lastMove = g.year
  saveMarket(b, st)
  log(g, `${a.name} diversified its suppliers and shipping routes.`, 'neutral')
  notice(g, 'Supply Chains Diversified', `${formatMoney(q.cost)} bought second sources, a warehouse on another continent and contracts with a few more shipping lines. A disruption now costs ${a.name} far less, and tariffs on your exports bite about a third less, through ${g.year + SUPPLY_TERM - 1}.`, { emoji: '\u{1F6A2}', tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// Patent cross-licences (deep tech)

export const LICENSE_TERM = 6

export function licenseCost(b: BizState): number {
  return scaledCost(b, 150_000, 0.03)
}

/** What a cross-licence does for the player's technology. */
export const LICENSE_TECH = 3
export const LICENSE_QUALITY = 2
/** How much a cross-licence lifts the partner's pull. */
export const LICENSE_RIVAL_BOOST = 1.04

export function quoteLicense(g: GameState, b: BizState, v: MarketView, rivalId: string, w: Worth = bizWorth(g, b)): MoveQuote | null {
  const move: StrategyMove = { kind: 'license', rivalId }
  if (!isDeepTech(b)) return null
  const r = v.rivals.find((x) => x.id === rivalId)
  if (!r || r.legacy) return null
  const cost = licenseCost(b)
  const st = marketStateOf(b)
  let block: string | null = null
  const regime = effectiveRegime(b.countryId, g.year, true)
  const combined = v.share + r.share
  if (regime.strict >= 0.25 && combined >= mergerLimit(regime) * 0.85) block = `${cap(regime.name)} would call a cross-licence between you and ${r.name} collusion: together you'd hold ${shareText(combined)} of the market.`
  const live = st?.deals.find((d) => d.rivalId === rivalId && d.until >= g.year)
  if (!block && live) block = `You already share patents with ${r.name} through ${live.until}.`
  if (!block && (st?.deals.filter((d) => d.until >= g.year).length ?? 0) >= 3) block = 'Three cross-licences at a time is the most your lawyers can manage.'
  block = block ?? cashBlock(b, cost)
  // Better technology for you; a stronger partner for a few years (it gets your patents too).
  const el = clampN(industryDef(b.industry).elasticity, 0, 4)
  const qualityMult = 1 + (LICENSE_QUALITY + 1) * (0.005 + el * 0.004)
  const rivalMult = 1 / (1 + (LICENSE_RIVAL_BOOST - 1) * r.share * 6)
  const own = fxValue(g, b, w, { quality: LICENSE_QUALITY + 1 })
  const partner = gainOf(g, b, w, rivalMult) * 3
  return { move, cost, block, path: [qualityMult * rivalMult], shareDelta: shareGain(g, b, qualityMult * rivalMult), value: own + partner - cost, years: LICENSE_TERM }
}

export function runLicense(g: GameState, a: Asset, b: BizState, rivalId: string): boolean {
  const v = marketViewOf(g, b)
  const q = quoteLicense(g, b, v, rivalId)
  const r = v.rivals.find((x) => x.id === rivalId)
  if (!q || !r) return false
  if (q.block) {
    notice(g, 'No Cross-Licence', q.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (!useYearAction(g, `biz.mkt.license.${a.id}`, 1)) {
    notice(g, 'Not Again This Year', 'Your patent lawyers are still reading the last agreement.', { emoji: '\u{23F3}' })
    return false
  }
  const st = marketOfBiz(b)
  firmCash(g, b, -q.cost, 'royalty', a.id)
  b.yearCosts += q.cost
  const t = techOf(b)
  t.level = clampN(t.level + LICENSE_TECH, 0, 100)
  b.quality = clampN(b.quality + LICENSE_QUALITY, 0, 100)
  st.deals = [...st.deals.filter((d) => d.until >= g.year), { rivalId, year: g.year, until: g.year + LICENSE_TERM - 1 }].slice(-6)
  const cur = st.mods[rivalId]
  st.mods[rivalId] = { mult: clampN((cur && cur.until >= g.year ? cur.mult : 1) * LICENSE_RIVAL_BOOST, 0.1, 5), until: g.year + 2 }
  // Regulators read patent swaps between the biggest players as a sign of cosy competition.
  if (r.share >= 0.05) st.acquired = [...st.acquired, g.year].slice(-20)
  st.lastMove = g.year
  saveMarket(b, st)
  count(g, 'crossLicences')
  log(g, `${a.name} signed a patent cross-licence with ${r.name}.`, 'neutral')
  notice(g, 'Patent Cross-Licence', `${a.name} and ${r.name} agreed to use each other's patents for ${LICENSE_TERM} years. Lawyers on both sides were paid ${formatMoney(q.cost)} to make it airtight. Your technology level is up ${LICENSE_TECH} points and so is ${r.name}'s appetite.${r.share >= 0.05 ? ' Regulators keep a closer eye on friendly deals between market leaders.' : ''}`, { emoji: '\u{1F91D}', tone: 'good' })
  return true
}
