// Competitive moves on the Market & Competition screen and in events: buying out a rival (if the
// regulators let you), a price offensive, raiding a rival's talent and lobbying the competition
// authority. Each has an honest dollar value for the Business talent's purple hint, computed from
// the same numbers the move uses (no RNG in quotes or hints).
import { seeded } from '../assets'
import { addHidden, count, formatMoney, log, notice, useYearAction } from '../core'
import type { Asset, GameState } from '../types'
import { placeName } from './market-places'
import { marketKey } from './competition-core'
import { effectiveRegime, marketDef, mergerLimit } from './competition-data'
import { familyId } from './competition-roster'
import { groupById, groupIdOf } from './conglomerate-state'
import { edgeValue, marketOfBiz, marketViewOf, saveMarket, shareText, type MarketView, type RivalView } from './competition'
import { techOf, techPlan, techView } from './deeptech-core'
import { isDeepTech } from './deeptech-state'
import { bizWorth, fxValue, localEcon, maxProduction, planFor, refreshValue, valuationOf } from './economy'
import { industryDef } from './industries'
import { totalOutlets, type BizState } from './state'
import { cap, clampN, money, promisePrice, round2 } from './util'

/**
 * A cost that scales with the size of the company and the local price level: `usBase` for a
 * one-location US company, or `revShare` of last year's sales for a big one.
 */
export function scaledCost(b: BizState, usBase: number, revShare: number): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const size = Math.sqrt(Math.max(1, totalOutlets(b)))
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(Math.max(usBase * e.level * size, revenue * revShare))
}

/** Capacity one more outlet (site) adds, in units a year (0 when outlets don't sell anything yet). */
function capacityPerOutlet(g: GameState, b: BizState): number {
  const n = Math.max(1, totalOutlets(b))
  if (b.industry === 'gameStudio') return 0
  if (isDeepTech(b)) return Math.max(0, techPlan(g, b, techView(b), g.year, { calm: true }).capacity / n)
  return Math.max(0, planFor(g, b, g.year, { calm: true }).capacity / n)
}

// ---------------------------------------------------------------------------
// Acquisitions

export interface AcquisitionQuote {
  rival: RivalView
  /** Price for the whole rival (dollars). */
  price: number
  /** Locations (sites) that come with it, opened in the home city. */
  outlets: number
  /** The player's share plus the rival's. */
  combined: number
  /** Why the deal can't go ahead (null: it can): the buyer is too new or too small, or regulators object. */
  block: string | null
  /** The part of `block` that is about the buyer's own size or track record, not the regulators. */
  reach: string | null
  /** Expected value to the owner (Business talent): profits gained, kit kept, minus the price. */
  value: number
}

/** What buying out a rival costs and brings (pure). Null for rivals that can't be bought. */
export function acquisitionQuote(g: GameState, b: BizState, rivalId: string): AcquisitionQuote | null {
  if (rivalId.startsWith('npc:') || rivalId.startsWith('owned:')) return null // Real companies use their own ownership/negotiation paths.
  const v = marketViewOf(g, b)
  const r = v.rivals.find((x) => x.id === rivalId)
  if (!r || r.legacy || !(r.share > 0)) return null
  const def = industryDef(b.industry)
  const d = marketDef(b.industry)
  const home = localEcon(b.industry, b.countryId, b.city)
  const priceRef = d.scope === 'world' ? def.price : home.goingPrice
  const rivalRevenue = r.share * v.size
  const rivalUnits = priceRef > 0 ? rivalRevenue / priceRef : 0
  const per = capacityPerOutlet(g, b)
  const outlets = per > 0 ? Math.round(clampN((rivalUnits * 0.7) / per, 0, 300)) : 0
  const capital = outlets * home.capital
  const price = Math.round(Math.max(rivalRevenue * Math.max(0.5, 0.15 * def.multiple) * 1.25, capital * 1.1, scaledCost(b, 50_000, 0)))
  const combined = Math.min(1, v.share + r.share)
  const regime = effectiveRegime(b.countryId, g.year, d.scope === 'world')
  const reach = takeoverReach(b, v, r, rivalRevenue, groupRevenue(g, b))
  const block = reach ?? (regime.strict >= 0.25 && combined >= mergerLimit(regime) ? `${cap(regime.name)} would block it: together you'd hold ${shareText(combined)} of the market.` : null)
  const s = b.last
  const margin = s && s.revenue > 0 ? clampN(s.net / s.revenue, -0.5, 0.6) : 0
  const value = rivalRevenue * 0.7 * Math.max(0, margin) * Math.min(def.multiple, 12) * 0.6 + capital * 0.5 - price
  return { rival: r, price, outlets, combined, block, reach, value: Number.isFinite(value) ? value : -price }
}

/** A buyer may be at most this many times smaller than its target (by sales). */
export const TAKEOVER_SIZE_RATIO = 3

/**
 * Nobody backs a takeover by a company that has never booked a year, or one far smaller than its
 * target: a one-café start-up can't swallow an eight-café chain in its first months. A division
 * of a group is measured with the whole group behind it.
 */
function takeoverReach(b: BizState, v: MarketView, r: RivalView, rivalRevenue: number, group: number): string | null {
  if (!v.booked || !b.last) return `Book your first full year before buying a rival: nobody backs a takeover by a company with no track record.`
  const own = Math.max(0, group, b.last.revenue, ...b.history.slice(-3).map((h) => h.revenue))
  if (rivalRevenue > own * TAKEOVER_SIZE_RATIO) return `${r.name} is more than ${TAKEOVER_SIZE_RATIO} times your size. Grow first, or buy a smaller rival.`
  return null
}

/** Last year's sales of the whole group a division belongs to (0 for a standalone company). */
function groupRevenue(g: GameState, b: BizState): number {
  const id = groupIdOf(b)
  const grp = id ? groupById(g, id) : null
  return grp ? grp.members.reduce((t, m) => t + Math.max(0, m.b.last?.revenue ?? 0), 0) : 0
}

/** Buy out a rival: its customers (most of them) and its locations become yours. */
export function acquireRival(g: GameState, a: Asset, b: BizState, rivalId: string): boolean {
  const q = acquisitionQuote(g, b, rivalId)
  if (!q) return false
  if (q.reach) {
    notice(g, 'Not Yet', q.reach, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (q.block) {
    notice(g, 'Deal Blocked', `${q.block} Your lawyers suggest finding a smaller target.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (b.cash < q.price) {
    notice(g, 'Not Enough Company Cash', `Buying ${q.rival.name} costs ${formatMoney(q.price)}. ${a.name} has ${formatMoney(Math.max(0, b.cash))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return false
  }
  const st = marketOfBiz(b)
  b.cash -= q.price
  if (q.outlets > 0) {
    const existing = b.outlets.find((o) => o.countryId === b.countryId && o.city === b.city)
    if (existing) existing.count += q.outlets
    else b.outlets.push({ countryId: b.countryId, city: b.city, count: q.outlets, opened: g.year })
    b.production = Math.min(maxProduction(g, b), Math.round(b.production * (1 + q.outlets / Math.max(1, totalOutlets(b) - q.outlets))))
  }
  st.gone = [...st.gone, q.rival.id].slice(-60)
  st.acquired = [...st.acquired, g.year].slice(-20)
  st.lastMove = g.year
  st.base = clampN(st.base + q.rival.share * 0.7, 0, 0.98)
  st.share = clampN(st.share + q.rival.share * 0.7, 0, 0.98)
  st.rivals = st.rivals.filter(([id]) => id !== q.rival.id)
  st.rank = 1 + st.rivals.filter(([, s]) => s > st.share).length
  saveMarket(b, st)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  count(g, 'acquisitions')
  log(g, `${a.name} bought out its rival ${q.rival.name} for ${money(q.price)}.`, 'good')
  notice(
    g,
    'Rival Acquired!',
    `${a.name} bought ${q.rival.name} (${placeName(q.rival.hq)}, est. ${q.rival.founded}) for ${formatMoney(q.price)}. Most of its customers stay with you${q.outlets > 0 ? `, and its ${q.outlets} ${q.outlets === 1 ? industryDef(b.industry).site : industryDef(b.industry).sitePlural} now fly your flag` : ''}. Your share of the market is now about ${shareText(st.share)}.`,
    { emoji: '\u{1F91D}', tone: 'good' },
  )
  return true
}

// ---------------------------------------------------------------------------
// Price offensive

/** The price cut and the extra pull a price offensive buys (this year and next). */
export const OFFENSIVE_CUT = 0.15
export const OFFENSIVE_EDGE = 1.12

/** Expected value of a price offensive (Business talent). */
export function offensiveValue(g: GameState, b: BizState): number {
  const w = bizWorth(g, b)
  return fxValue(g, b, w, { priceCut: OFFENSIVE_CUT }) + edgeValue(g, b, w, OFFENSIVE_EDGE, 2)
}

export function priceOffensive(g: GameState, a: Asset, b: BizState): void {
  if (!useYearAction(g, `biz.mkt.offense.${a.id}`, 1)) {
    notice(g, 'Not Again This Year', `${a.name} already slashed prices this year. Customers are starting to wonder what's wrong with the product.`, { emoji: '\u{23F3}' })
    return
  }
  const st = marketOfBiz(b)
  b.price = round2(Math.max(0.01, b.price * (1 - OFFENSIVE_CUT)))
  promisePrice(g, a.id, b.price)
  st.edge = clampN((st.edgeUntil >= g.year ? st.edge : 1) * OFFENSIVE_EDGE, 0.3, 3)
  st.edgeUntil = g.year + 1
  st.lastMove = g.year
  // The biggest rival may fight back (decided by the market, not by luck you can re-roll).
  const top = marketViewOf(g, b).rivals[0]
  const fights = !!top && seeded(`${familyId(g.lifeId)}|retaliate|${a.id}|${g.year}`).chance(0.4)
  if (fights && top) st.mods[top.id] = { mult: 1.1, until: g.year + 1 }
  saveMarket(b, st)
  log(g, `${a.name} slashed prices ${Math.round(OFFENSIVE_CUT * 100)}% to steal customers.`, 'neutral')
  notice(
    g,
    'Price Offensive',
    `${a.name} cut prices ${Math.round(OFFENSIVE_CUT * 100)}% and told the whole market about it. Expect customers to switch to you this year and next; you promised to hold the new price all year.${fights && top ? ` ${top.name} answered with discounts of its own, so it won't be a walkover.` : ''}`,
    { emoji: '\u{1F3F7}\u{FE0F}' },
  )
}

// ---------------------------------------------------------------------------
// Talent raid

export function raidCost(b: BizState): number {
  const def = industryDef(b.industry)
  return Math.round(Math.max(scaledCost(b, 40_000, 0.01), def.wage * 2.5 * localEcon(b.industry, b.countryId, b.city).labor))
}

/** Expected value of raiding the top rival's talent (Business talent). */
export function raidValue(g: GameState, b: BizState): number {
  const w = bizWorth(g, b)
  const top = marketViewOf(g, b).rivals[0]
  const relief = top ? 1 + top.share * 0.08 : 1
  return fxValue(g, b, w, { cash: -raidCost(b), quality: isDeepTech(b) ? 2 : 4 }) + edgeValue(g, b, w, relief, 2)
}

export function talentRaid(g: GameState, a: Asset, b: BizState): void {
  const top = marketViewOf(g, b).rivals[0]
  if (!top) return
  const cost = raidCost(b)
  if (b.cash < cost) {
    notice(g, 'Not Enough Company Cash', `Poaching a team costs about ${formatMoney(cost)} in signing bonuses. ${a.name} doesn't have it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  if (!useYearAction(g, `biz.mkt.raid.${a.id}`, 1)) {
    notice(g, 'Not Again This Year', `Your recruiters already approached ${top.name}'s people once this year. Give it a rest.`, { emoji: '\u{23F3}' })
    return
  }
  b.cash -= cost
  b.yearCosts += cost
  const st = marketOfBiz(b)
  st.mods[top.id] = { mult: Math.min(st.mods[top.id]?.mult ?? 1, 0.92), until: g.year + 1 }
  st.lastMove = g.year
  saveMarket(b, st)
  if (isDeepTech(b)) {
    const t = techOf(b)
    t.level = clampN(t.level + 3, 0, 100)
    b.quality = clampN(b.quality + 2, 0, 100)
  } else b.quality = clampN(b.quality + 4, 0, 100)
  log(g, `${a.name} poached a team from ${top.name}.`, 'neutral')
  notice(g, 'Talent Raid', `Signing bonuses worth ${formatMoney(cost)} lured a whole team away from ${top.name}. Your product just got better and theirs just got a lot of job postings.`, { emoji: '\u{1F3A3}', tone: 'good' })
}

// ---------------------------------------------------------------------------
// Lobbying the regulator

export function lobbyCost(b: BizState): number {
  return scaledCost(b, 60_000, 0.005)
}

/** Chance a lobbying push works (the more independent the regulator, the less it does). */
export function lobbyOdds(g: GameState, b: BizState): number {
  const r = effectiveRegime(b.countryId, g.year, marketDef(b.industry).scope === 'world')
  return clampN(0.25 + 0.6 * (1 - r.strict), 0.15, 0.85)
}

export function lobby(g: GameState, a: Asset, b: BizState): void {
  const cost = lobbyCost(b)
  if (b.cash < cost) {
    notice(g, 'Not Enough Company Cash', `A proper lobbying push costs about ${formatMoney(cost)}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  if (!useYearAction(g, `biz.mkt.lobby.${a.id}`, 1)) {
    notice(g, 'Not Again This Year', 'Your lobbyists have already bought every regulator lunch they could this year.', { emoji: '\u{23F3}' })
    return
  }
  b.cash -= cost
  b.yearCosts += cost
  addHidden(g, 'karma', -3)
  const st = marketOfBiz(b)
  const regime = effectiveRegime(b.countryId, g.year, marketDef(b.industry).scope === 'world')
  const works = seeded(`${familyId(g.lifeId)}|lobby|${a.id}|${g.year}|${marketKey(b)}`).chance(lobbyOdds(g, b))
  if (works) st.antitrust.lobbyUntil = g.year + 3
  else b.brand = clampN(b.brand - 3, 0, 100)
  saveMarket(b, st)
  log(g, works ? `${a.name}'s lobbyists softened up ${regime.name}.` : `${a.name}'s lobbying push backfired.`, works ? 'neutral' : 'bad')
  notice(
    g,
    works ? 'Friends in High Places' : 'Lobbying Backfired',
    works
      ? `For ${formatMoney(cost)} in fees, think-tank reports and very long lunches, ${regime.name} now sees ${a.name} as "a national champion". Antitrust trouble is less likely for the next few years.`
      : `The ${formatMoney(cost)} lobbying push made the news for all the wrong reasons. ${cap(regime.name)} is unmoved, and your brand took a hit.`,
    { emoji: works ? '\u{1F3DB}\u{FE0F}' : '\u{1F4F0}', tone: works ? 'neutral' : 'bad' },
  )
}
