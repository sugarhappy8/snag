// Pure annual national conditions and durable company strategy. No menu RNG.
// (Company research and patents moved to the Inventor's Workshop: src/game/workshop/.)
import { seeded } from '../assets'
import { industryConditions } from '../economy'
import { notice } from '../core'
import type { GameState, Json } from '../types'
import type { BizState } from './state'
import { clampN, num, rec, str } from './util'

export const STRATEGIES = [
  { id: 'value', label: 'Value range', brief: 'Win price-sensitive customers; thinner margins', demand: .16, cost: .07, term: 3 },
  { id: 'premium', label: 'Premium positioning', brief: 'Win quality-focused customers at a higher input cost', demand: -.04, cost: .04, term: 3 },
  { id: 'loyalty', label: 'Customer loyalty', brief: 'Retain customers through slow years', demand: .10, cost: .02, term: 4 },
  { id: 'distribution', label: 'Distribution partnership', brief: 'Reach more customers; partners take a margin', demand: .18, cost: .09, term: 3 },
  { id: 'local', label: 'Local sourcing', brief: 'Lower input costs; smaller selection', demand: -.03, cost: -.09, term: 3 },
  { id: 'training', label: 'Workforce training', brief: 'More reliable operations and capacity', demand: .04, cost: -.04, term: 4 },
  { id: 'service', label: 'After-sales support', brief: 'Reputation and repeat demand at a service cost', demand: .12, cost: .04, term: 3 },
  { id: 'resilience', label: 'Recession reserve plan', brief: 'Trade peak growth for protection in downturns', demand: -.02, cost: -.03, term: 4 },
  { id: 'localize', label: 'Local product adaptation', brief: 'Match changing national tastes', demand: .13, cost: .04, term: 3 },
  { id: 'efficiency', label: 'Process redesign', brief: 'Reduce waste and improve throughput', demand: 0, cost: -.08, term: 4 },
] as const

export interface Expansion {
  strategies: { id: string; country: string; started: number; expires: number }[]
  studies: { country: string; year: number }[]
  lastYear: number
}

function uniqueLast<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (let i = values.length - 1; i >= 0; i--) {
    const k = key(values[i])
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(values[i])
  }
  return out.reverse()
}

function calendar(v: Json | undefined, fallback = 0): number {
  return Math.round(num(v, fallback))
}

export function expansionOf(b: BizState): Expansion {
  const d = rec(b.expansion)
  const rows = (v: Json | undefined) => Array.isArray(v) ? v.map(rec).filter((x): x is Record<string, Json> => !!x) : []
  const strategies = uniqueLast(
    rows(d?.strategies)
      .filter(x => STRATEGIES.some(s => s.id === x.id) && typeof x.country === 'string' && !!x.country)
      .map(x => ({ id: str(x.id), country: str(x.country), started: calendar(x.started), expires: calendar(x.expires) }))
      .filter(x => x.expires > x.started)
      .slice(-1200),
    x => `${x.country}:${x.id}`,
  )
  const studies = uniqueLast(
    rows(d?.studies).filter(x => typeof x.country === 'string' && !!x.country).map(x => ({ country: str(x.country), year: calendar(x.year) })).slice(-100),
    x => x.country,
  )
  return { strategies, studies, lastYear: calendar(d?.lastYear, -1) }
}

/** Old saves may still hold company research/patents here until the Workshop migrates them: keep them. */
export function saveExpansion(b: BizState, x: Expansion): void { b.expansion = { ...(rec(b.expansion) ?? {}), ...x } as unknown as Json }

const nationalCache = new Map<string, { baseDemand: number; costs: number; taste: string; growth: number }>()
export function nationalMarket(g: GameState, industry: string, country: string, year = g.year) {
  const family = g.lifeId.replace(/-g\d+$/, '')
  const key = `${family}|${country}|${industry}|${year}`
  let base = nationalCache.get(key)
  if (!base) {
    const roll = (key: string, y: number) => seeded(`${family}|national|${country}|${industry}|${key}|${y}`).next()
    const wave = .65 * roll('demand', year) + .35 * roll('demand', year - 1)
    const taste = roll('taste', Math.floor(year / 3))
    base = { baseDemand: .82 + wave * .36, costs: .9 + .2 * roll('cost', year), taste: taste < .34 ? 'value' : taste < .67 ? 'quality' : 'service', growth: (wave - .5) * .18 }
    if (nationalCache.size > 8192) nationalCache.clear()
    nationalCache.set(key, base)
  }
  const confidence = clampN(num(rec(g.flags['business.confidence'])?.[`${country}:${industry}`], 1), .65, 1.1)
  const sector = industryConditions(g, industry, country, year)
  // Preferences still differ by nation; economic demand and input costs share world state.
  const demand = (1 + (base.baseDemand - 1) * .25) * confidence * sector.demand * (1.08 - sector.competition * .145)
  return { demand, costs: sector.costs * (1 + (base.costs - 1) * .2), confidence, taste: base.taste, growth: (sector.demand - 1) * .3,
    label: demand < .94 ? 'Demand weakening' : demand > 1.06 ? 'Demand expanding' : 'Demand stable' }
}

/** A 90/95-rated CEO has a material edge, regardless of industry. Bounded, never a profit guarantee. */
export function executiveEdge(skill: number): number { return skill >= 85 ? .65 + .85 * clampN((skill - 85) / 15, 0, 1) : Math.pow(clampN((skill - 75) / 25, 0, 1), 1.5) }

export function businessEffects(g: GameState, b: BizState, country: string, year: number) {
  if (!b.expansion) return { demand: 1, cost: 1, capacity: 1 }
  const x = expansionOf(b)
  const national = nationalMarket(g, b.industry, country, year)
  let demand = 1, cost = 1, capacity = 1
  for (const p of x.strategies.filter(p => p.country === country && p.started <= year && p.expires > year)) {
    const s = STRATEGIES.find(s => s.id === p.id)!
    demand += s.demand
    cost += s.cost
    if (p.id === 'value' && national.taste === 'value') demand += .08
    if (p.id === 'premium') demand += national.taste === 'quality' ? .22 : .08
    if (p.id === 'service' && national.taste === 'service') demand += .08
    if (p.id === 'training' || p.id === 'efficiency') capacity += .08
    if (p.id === 'resilience' && national.demand < 1) demand += (1 - national.demand) * .7
  }
  return { demand: clampN(demand, .7, 1.65), cost: clampN(cost, .65, 1.5), capacity: Math.min(1.4, capacity) }
}

/** Real operating failures of the player's large company affect confidence in its national sector. */
export function recordCompanyShock(g: GameState, b: BizState, previousRevenue: number, revenue: number, assetId = ''): void {
  if (!(previousRevenue >= 20_000_000) || revenue >= previousRevenue * .65) return
  const guard = `business.confidenceHit.${assetId}`
  if (assetId && g.flags[guard] === g.year) return
  if (assetId) g.flags[guard] = g.year
  const raw = rec(g.flags['business.confidence']) ?? {}
  const key = `${b.countryId}:${b.industry}`
  const hit = Math.min(.16, .03 * Math.log10(1 + previousRevenue / 20_000_000))
  g.flags['business.confidence'] = { ...raw, [key]: Math.max(.65, num(raw[key], 1) - hit) }
  notice(g, 'Sector Confidence Fell', 'A sharp revenue decline at one of your large companies has shaken confidence in its home market. Demand across that national sector is lower; confidence gradually recovers. Check National Strategy for current conditions.', { emoji: '📉', tone: 'bad' })
}

/** Confidence heals gradually; one recovery pass for the whole economy, not per company. */
export function recoverConfidence(g: GameState): void {
  if (num(g.flags['business.confidenceYear'], -1) >= g.year) return
  g.flags['business.confidenceYear'] = g.year
  const raw = rec(g.flags['business.confidence']) ?? {}
  g.flags['business.confidence'] = Object.fromEntries(Object.entries(raw).map(([key, v]) => [key, Math.min(1, num(v, 1) + .025)]))
}
