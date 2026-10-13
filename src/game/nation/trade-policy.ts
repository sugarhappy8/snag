// Governments' trade measures as lookups for the trade network (economy/trade.ts TradeOverlay) and
// for the company screens (market-reach, market-regional, market-strategy, market-view), on top of
// the fixed customs data in business/market-trade.ts. Pure and cached by the policy record.
import { barriersInto, goodsShare, sharedBloc, tariffOn, type Barriers } from '../business/market-trade'
import { sectorOf } from '../economy/model'
import type { TradeOverlay } from '../economy/trade'
import type { GameState } from '../types'
import { TRADE_INPUT_IDS, type TradeInput } from './data'
import { policyState, type PolicyState } from './state'

interface Built {
  /** `${from}>${to}` → extra tariff by input ('all' included). */
  tariffs: Map<string, Partial<Record<TradeInput | 'all', number>>>
  restrictions: Map<string, number>
  bans: Map<string, Set<TradeInput>>
  deals: Set<string>
  touched: Set<string>
}

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function build(state: PolicyState, year: number): Built | null {
  const out: Built = { tariffs: new Map(), restrictions: new Map(), bans: new Map(), deals: new Set(), touched: new Set() }
  const addTariff = (from: string, to: string, input: TradeInput | 'all', add: number) => {
    const key = `${from}>${to}`, row = out.tariffs.get(key) ?? {}
    row[input] = (row[input] ?? 0) + add / 100
    out.tariffs.set(key, row)
    out.touched.add(from); out.touched.add(to)
  }
  let any = false
  for (const p of Object.values(state.countries)) {
    const c = p.country
    for (const rule of p.tariffs) {
      if (rule.partner === 'all') { addTariff('*', c, rule.input, rule.add); out.touched.add(c) } else addTariff(rule.partner, c, rule.input, rule.add)
      any = true
    }
    for (const r of p.retaliation) if (r.until >= year) { addTariff(c, r.from, r.input, r.add); any = true }
    for (const partner of Object.keys(p.deals)) { out.deals.add(pair(c, partner)); out.touched.add(c); out.touched.add(partner); any = true }
    for (const partner of Object.keys(p.sanctions)) {
      out.restrictions.set(pair(c, partner), Math.min(.8, (out.restrictions.get(pair(c, partner)) ?? 0) + .5))
      out.touched.add(c); out.touched.add(partner); any = true
    }
    for (const [input, since] of Object.entries(p.exportBans) as [TradeInput, number][]) {
      if (!since) continue
      const set = out.bans.get(c) ?? new Set<TradeInput>()
      set.add(input); out.bans.set(c, set); out.touched.add(c); any = true
    }
  }
  return any ? out : null
}

function overlayOf(b: Built): TradeOverlay {
  const extra = (from: string, to: string, input: string): number => {
    let t = 0
    for (const key of [`${from}>${to}`, `*>${to}`]) {
      const row = b.tariffs.get(key)
      if (!row) continue
      t += (row.all ?? 0) + (row[input as TradeInput] ?? 0)
    }
    return t
  }
  return {
    tariff: (from, to, input) => (from === to ? 0 : extra(from, to, input)),
    restriction: (from, to) => b.restrictions.get(pair(from, to)) ?? 0,
    exportBan: (from, input) => b.bans.get(from)?.has(input as TradeInput) ?? false,
    deal: (x, y) => b.deals.has(pair(x, y)),
    touches: (country) => b.touched.has(country),
  }
}

const cache = new WeakMap<object, Map<number, TradeOverlay | null>>()
/** The world's trade measures for a year, or null when no government has any. */
export function tradeOverlay(g: GameState, year = g.year): TradeOverlay | null {
  const state = policyState(g)
  if (!Object.keys(state.countries).length) return null
  let byYear = cache.get(state)
  if (!byYear) { byYear = new Map(); cache.set(state, byYear) }
  if (byYear.has(year)) return byYear.get(year)!
  const built = build(state, year)
  const result = built ? overlayOf(built) : null
  if (byYear.size > 8) byYear.clear()
  byYear.set(year, result)
  return result
}

/** The trade input an industry's goods belong to, for tariffs on its exports and imports. */
export function inputOfIndustry(industry: string): TradeInput {
  const s = sectorOf(industry)
  return (TRADE_INPUT_IDS as readonly string[]).includes(s) ? s as TradeInput : 'industry'
}

/** Tariff on an industry's goods from one country into another, customs plus governments' measures. */
export function tariffWith(g: GameState, from: string, to: string, year: number, industry: string): number {
  const base = tariffOn(from, to, year)
  const o = tradeOverlay(g, year)
  if (!o || from === to) return base
  if (o.deal(from, to) && !sharedBloc(from, to, year)) return Math.min(.9, o.tariff(from, to, inputOfIndustry(industry)))
  return Math.min(.9, base + o.tariff(from, to, inputOfIndustry(industry)))
}

/** Extra non-tariff barrier between two countries from sanctions (0-0.8). */
export function sanctionBarrier(g: GameState, from: string, to: string, year = g.year): number {
  return tradeOverlay(g, year)?.restriction(from, to) ?? 0
}

/** Barriers on an industry's goods from one country into another, governments' measures included. */
export function barriersWith(g: GameState, from: string, to: string, industry: string, year: number): Barriers {
  const base = barriersInto(from, to, industry, year)
  if (!tradeOverlay(g, year) || from === to) return base
  const tariff = tariffWith(g, from, to, year, industry)
  const other = Math.min(1, base.other + sanctionBarrier(g, from, to, year))
  const effective = tariff * goodsShare(industry)
  const score = effective * 3 + other
  return { tariff, effective, other, bloc: base.bloc, label: score < 0.18 ? 'open' : score < 0.4 ? 'moderate' : score < 0.7 ? 'restrictive' : 'closed' }
}
