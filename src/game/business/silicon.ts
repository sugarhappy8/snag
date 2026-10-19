// Silicon 2.0: what a chip company's prices do to its goodwill. Pure rules, no dice: goodwill grows only while
// the 2024-2027 squeeze lasts, in proportion to how far below the market the chips sell and how much of the
// demand was supplied, and fades toward neutral (50) the rest of the time. Goodwill acts on one thing, the brand
// (`brandStep`), which afterDeepTechYearImpl adds once a year. Every function takes the year it books; none reads g.year.
import { seeded } from '../assets'
import { log } from '../core'
import { shortageIntensity } from '../history/market-events'
import { outcomeTag } from '../timeMachine'
import type { Asset, GameState } from '../types'
import { marketOfBiz, marketViewOf, saveMarket, type RivalView } from './competition'
import { familyId } from './competition-roster'
import type { RivalMod } from './competition-state'
import { marketReference, planContribution, siliconOf, siliconView, techPlan, techView, type LaneRow, type TechPlan } from './deeptech-core'
import type { TechState } from './deeptech-state'
import { segOfTier } from './market-view'
import { CHIP_LANES, laneById, laneOpen } from './silicon-data'
import type { BizState, Statement } from './state'
import { announceWave, readTechWaves } from './tech-waves'
import { clampN, round2 } from './util'

/** Brand points a goodwill adds in a year: a dead zone of 3 points around 50, then a tenth of the gap, from -1.5 to 3. */
export function brandStep(goodwill: number): number {
  if (!Number.isFinite(goodwill)) return 0
  return clampN(Math.sign(goodwill - 50) * Math.max(0, Math.abs(goodwill - 50) - 3) / 10, -1.5, 3)
}

/** Where a year's price position pulls goodwill: a cheap price counts as far as it was supplied, a dear one counts in full. */
export function goodwillTarget(depth: number, served: number): number {
  return 50 + 100 * depth * (depth > 0 ? served : 1)
}

/** Goodwill after a year: pulled toward the target in a squeeze (`win` 1 is the tightest year), relaxed toward 50 otherwise; at most 8 points. */
export function goodwillStep(goodwill: number, depth: number, served: number, win: number): number {
  const delta = clampN(0.45 * win * (goodwillTarget(depth, served) - goodwill) + 0.12 * (1 - win) * (50 - goodwill), -8, 8)
  return clampN(goodwill + delta, 0, 100)
}

/**
 * The price position over the lanes the squeeze hits, weighted by lane weight times exposure. A price below cost
 * earns nothing extra: each lane counts at its own index or at the cost price against its reference, whichever is
 * higher (the margin guard, never under 0.3). `depth` is positive when cheaper than the market, -0.4 to 0.4.
 */
export function squeezeOf(rows: readonly LaneRow[], unitCost: number): { index: number; depth: number; weight: number } {
  let weight = 0
  let sum = 0
  for (const row of rows) {
    const lane = laneById(row.id)
    if (!lane || !(lane.shortage > 0)) continue
    const x = lane.weight * lane.shortage
    const floor = row.ref > 0 ? clampN(unitCost / row.ref, 0.3, 1) : 1
    weight += x
    sum += x * Math.max(row.index, floor)
  }
  const index = weight > 0 ? sum / weight : 1
  return { index, depth: clampN(1 - index, -0.4, 0.4), weight }
}

/**
 * Books a fiscal year's goodwill from the year's own plan and its booked sales. Stores nothing for another trade,
 * and nothing before the first squeeze year unless a silicon state already exists (a lane or a policy), so every
 * earlier year stays as it was. Behind `last.year`: a second call for the same year changes nothing.
 */
export function bookSilicon(b: Pick<BizState, 'industry' | 'countryId'>, t: TechState, year: number, plan: Pick<TechPlan, 'lanes' | 'unitCost'>, stmt: Pick<Statement, 'sold' | 'demand'>): void {
  if (b.industry !== 'semiconductor' || plan.lanes.length === 0) return
  const { index, depth, weight } = squeezeOf(plan.lanes, plan.unitCost)
  const win = shortageIntensity(b.countryId, year) * Math.min(1, weight / 0.25)
  if (!t.silicon && win <= 0) return
  const held = siliconView(t)
  if (held.last && held.last.year >= year) return
  const served = stmt.demand > 0 ? clampN(stmt.sold / stmt.demand, 0, 1) : 0
  // A lab that sold nothing has no price effect: the goodwill only relaxes.
  const goodwill = round2(stmt.sold > 0 ? goodwillStep(held.goodwill, depth, served, win) : goodwillStep(held.goodwill, 0, 0, 0))
  const s = siliconOf(t)
  s.goodwill = goodwill
  s.last = { year, index: round2(index), served: round2(served), depth: round2(depth), win: round2(win), step: round2(brandStep(goodwill)), perf: held.last?.perf ?? 0, quality: held.last?.quality ?? 0 }
}

/** The brand points of a booked year the brand line hasn't added yet (0 once it has, and with no booked year). */
export function pendingBrandStep(t: TechState): number {
  const s = siliconView(t)
  return s.last && s.applied < s.last.year ? brandStep(s.goodwill) : 0
}

/** How fast a chip company's chips are, 0 to 100: the tech level, the process node and the fab's yield. */
export function chipPerformance(t: Pick<TechState, 'level' | 'node' | 'yieldRate'>): number {
  return Math.round(clampN(0.5 * t.level + 5 * t.node + 20 * (t.yieldRate - 0.3) / 0.67, 0, 100))
}

/** The chance the biggest rival answers a deep cut: none under 5% depth, at most 45%, halved in the tightest squeeze (nobody needs to match). */
export function undercutChance(depth: number, win: number): number {
  return clampN(2.5 * (depth - 0.05), 0, 0.45) * (1 - 0.5 * win)
}

/** A rival's pull mod after one more round of discounts: x1.08 on a live mod (an expired one is ignored), 0.6 to 1.25, for two more years. */
export function stackMod(old: RivalMod | undefined, year: number): RivalMod {
  return { mult: clampN((old && old.until >= year ? old.mult : 1) * 1.08, 0.6, 1.25), until: year + 2 }
}

/**
 * What a booked year leaves behind, run once after `evolve` (`t.silicon.last.year` is the fiscal year, never g.year):
 * the chips' performance and the product quality of the year, and the biggest rival's answer to a deep cut that was
 * supplied in a squeeze year (a seeded chance, no dice). Behind `applied`: a second call changes nothing.
 */
export function afterYearSilicon(g: GameState, a: Asset, b: BizState, t: TechState): void {
  if (b.industry !== 'semiconductor' || !t.silicon?.last || t.silicon.applied >= t.silicon.last.year) return
  const s = siliconOf(t)
  const last = s.last
  if (!last) return
  const year = last.year
  last.perf = chipPerformance(t)
  last.quality = Math.round(b.quality)
  if (last.win > 0 && last.depth >= 0.08 && last.served >= 0.5) {
    const top = marketViewOf(g, b).rivals[0]
    if (top && seeded(`${familyId(g.lifeId)}${outcomeTag(g, year)}|undercut|${a.id}|${year}`).chance(undercutChance(last.depth, last.win))) {
      const st = marketOfBiz(b)
      st.mods[top.id] = stackMod(st.mods[top.id], year)
      saveMarket(b, st)
      log(g, `${top.name} cut prices to match ${a.name}.`)
    }
  }
  // A chip leap (the chips beat every rival) is news once, then again only after three years without the lead.
  if (leadsField(g, b, t)) {
    const gap = s.lead === 0 ? Infinity : year - s.lead
    if (gap <= 3) s.lead = year
    else if (!readTechWaves(g).some((w) => w.kind === 'chips' && !!w.origin?.startsWith(`${a.id}#`) && year - w.year < 3)) {
      // A refusal (the wave caps) leaves `lead` alone, so the next year tries again.
      const wave = announceWave(g, { kind: 'chips', source: 'deeptech', origin: `${a.id}#leap`, name: 'Record-speed chips', size: 0.35, market: 'world', home: b.countryId, by: a.id })
      if (wave) {
        s.lead = year
        log(g, `${a.name}'s chips are the fastest on the market.`, 'good')
      }
    }
  }
  s.applied = year
}

const TIER_PRICE = { budget: 0.85, mass: 1, premium: 1.12, luxury: 1.25 } as const

/**
 * What a rival charges against the market reference, as a price index: its tier (the price segment of a real
 * firm, else its quality), a few percent of seeded jitter that holds for a year, and 7% lower while it cuts.
 * A pure read that stores nothing and makes no claim about any real firm's list price.
 */
export function rivalPriceIndex(fam: string, r: Pick<RivalView, 'id' | 'seg' | 'quality'>, year: number, cut = false): number {
  const u = seeded(`${fam}|rprice|${r.id}|${year}`).next()
  return TIER_PRICE[segOfTier(r.seg, r.quality)] * (1 + 0.04 * (2 * u - 1)) * (cut ? 0.93 : 1)
}

// ---------------------------------------------------------------------------
// Launch reception: what a new chip line sells for, and whether the chips lead the field

export type LaunchId = 'undercut' | 'match' | 'keep'

/** The price index a launch choice cuts the squeeze lanes to (the market is 1). */
export const LAUNCH_TARGET = { undercut: 0.9, match: 1 } as const

/** Do the chips score strictly above every rival, in a field of at least two? Pure. */
export function leadsField(g: GameState, b: BizState, t: TechState): boolean {
  const rivals = marketViewOf(g, b).rivals
  if (rivals.length < 2) return false
  const mine = chipPerformance(t)
  return rivals.every((r) => mine > r.tech)
}

/**
 * The lane discounts a launch choice leaves, for the planning `year` and a headline `price` (the one on the company
 * by default; the Annual Report passes the one the player just set): the full map (zeros dropped), with each open
 * lane the squeeze hits (`shortage` above 0) cut to a price index of 0.90 for `undercut` or 1.00 for `match`, at
 * most 50%. A headline already at or under that price gets no new discount, and a lane that is already discounted
 * deeper keeps its discount. `keep` returns the current map. Pure.
 */
export function launchDiscounts(g: GameState, b: BizState, t: TechState, id: LaunchId, year: number, price: number = b.price): Record<string, number> {
  const lanes = { ...siliconView(t).lanes }
  if (id === 'keep') return lanes
  const target = LAUNCH_TARGET[id]
  for (const lane of CHIP_LANES) {
    if (lane.id === 'core' || !(lane.shortage > 0) || !laneOpen(lane, t, year)) continue
    const ref = marketReference(g, b, t, lane, year)
    const cut = price > 0 && ref > 0 ? round2(clampN(1 - (target * ref) / price, 0, 0.5)) : 0
    if (cut > (lanes[lane.id] ?? 0)) lanes[lane.id] = cut
  }
  return lanes
}

/**
 * The three launch choices in order, each with the lanes it leaves and the profit of the calm plan for `year` at a
 * headline `price` (the company's own by default) on a copy of the company's tech that carries them (what
 * `bestTechPlan` would count: no goodwill). Pure: nothing live is touched.
 */
export function launchOptions(g: GameState, b: BizState, t: TechState, year: number, price: number = b.price): { id: LaunchId; lanes: Record<string, number>; profit: number }[] {
  return (['undercut', 'match', 'keep'] as const).map((id) => {
    const lanes = launchDiscounts(g, b, t, id, year, price)
    const copy = techView(b)
    siliconOf(copy).lanes = lanes
    return { id, lanes, profit: planContribution(g, b, techPlan(g, b, copy, year, { calm: true, price }), year).profit }
  })
}
