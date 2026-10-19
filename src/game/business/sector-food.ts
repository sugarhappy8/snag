// Food and Drink Service, state and math (restaurant, foodTruck, cafe, bakery): the yearly rule of
// the kitchen and the floor. A hygiene grade and a review rating are stocks that move toward a
// target; the peak squeeze, the menu, delivery and extended hours turn them into the generic channels
// (demand, cost) and a few costs. Pure: no g.rng, no state writes. The levers, events and copy are in
// sector-food-play.ts, which registers FOOD_MODEL and adds FOOD_NOTE_COPY to its copy table.
import type { Asset, GameState } from '../types'
import { nationalMarket } from './dynamics'
import { staffPower } from './economy'
import { bizHas } from './era'
import { franchiseUnits } from './franchise-state'
import { FOOD, type FoodRow } from './sector-data'
import { historyFactor, readYear, roleSkill, sectorHistoryLine, sectorText, seasonIndex, type CopyTable, type FxMode, type SectorCtx, type SectorFx } from './sector-kit'
import { blankRecord, type FoodState } from './sector-state'
import type { BizState } from './state'
import { clampN, pct } from './util'

/** The yearly grade line, written only when the grade moves (the play file adds this table to its own). */
export const FOOD_NOTE_COPY: CopyTable = {
  'food.grade.up.log': '${name} climbed to a ${grade} grade.',
  'food.grade.top.log': '${name} reached an A grade.',
  'food.grade.down.log': '${name} dropped to a ${grade} grade.',
}

const GRADE_A = 85
const GRADE_B = 65
/** Menu style: Lean, Balanced, Signature. */
const MENU_DEMAND = [.97, 1, 1.05] as const
const MENU_COST = [.93, 1, 1.07] as const
const MENU_TERM = [-.2, 0, .2] as const
const MENU_NAME = ['Lean', 'Balanced', 'Signature'] as const
/** Extended hours add this much seat-hours, so the squeeze reads the use over it. */
const HOURS_SEATS = 1.15
const HOURS_WAGES = .05
const MAX_LOST = .12
/** Delivery: the share of delivered sales that is new (the rest cannibalises sales you had), commission and fleet upkeep. */
const PLATFORM = { cannibal: .4, rate: .30, fixed: 0 } as const
const FLEET = { cannibal: .5, rate: .10, fixed: .015 } as const
const SHIELD = .8

export function foodRow(industry: string): FoodRow | null {
  return Object.prototype.hasOwnProperty.call(FOOD, industry) ? FOOD[industry as keyof typeof FOOD] : null
}

export function gradeOf(hygiene: number): 'A' | 'B' | 'C' {
  return hygiene >= GRADE_A ? 'A' : hygiene >= GRADE_B ? 'B' : 'C'
}

/** The share of demand lost because the busiest parts of the day have no seat left (0 to .12). */
export function squeeze(row: FoodRow, use: number): number {
  if (!Number.isFinite(use)) return 0
  let over = 0
  for (const d of row.dayparts) over += d.share * Math.max(0, (use * d.share) / d.seat - 1)
  return clampN(.5 * over, 0, MAX_LOST)
}

/** A kitchen audit: a floor by price level, else .4% of a normal year's sales. */
export function auditCost(_b: BizState, cx: SectorCtx): number {
  return Math.round(Math.max(1500 * cx.level, .004 * cx.base))
}

/** What a failed inspection costs: a floor by price level, else .8% of a normal year's sales. */
export function kitchenFine(_b: BizState, cx: SectorCtx): number {
  return Math.round(Math.max(2500 * cx.level, .008 * cx.base))
}

/** The neutral point at quality 50: grade B (71) and a 3.4 rating, menu Balanced, no delivery, standard hours. */
export function foodSeed(_g: GameState, _a: Asset, b: BizState, since: number): FoodState {
  const blank = blankRecord('food', since)
  if (blank.family !== 'food') throw new Error('blankRecord gave another family')
  return { ...blank, since, lastYear: since, hygiene: clampN(56 + .3 * b.quality, 0, 100), rating: clampN(2.4 + .02 * b.quality, 1, 5) }
}

/** What a delivery setting does this trade and era: null when it can't run (no app yet, no fleet). */
function outbound(g: GameState, b: BizState, row: FoodRow, channel: number): { share: number; cannibal: number; rate: number; fixed: number } | null {
  if (channel === 1 && row.platform > 0 && bizHas(g, b.countryId, 'smartphone')) return { share: row.platform, ...PLATFORM }
  if (channel === 2 && row.fleet > 0) return { share: row.fleet, ...FLEET }
  return null
}

function gradeNote(a: Asset, was: 'A' | 'B' | 'C', now: 'A' | 'B' | 'C'): SectorFx['note'] {
  if (was === now) return null
  const rank = { A: 2, B: 1, C: 0 }
  const up = rank[now] > rank[was]
  const key = up ? (now === 'A' ? 'food.grade.top.log' : 'food.grade.up.log') : 'food.grade.down.log'
  return { text: sectorText(FOOD_NOTE_COPY, key, { name: a.name, grade: now }), tone: up ? 'good' : 'bad' }
}

/**
 * One fiscal year of the kitchen and the floor. The stocks are read at the start of the year (the grade
 * and the rating factor) and the moved stocks are written to `next`. Every draw is a hash, and
 * 'expected' sets the season to its mean and never reads past g.year.
 */
export function foodFx(g: GameState, a: Asset, b: BizState, st: FoodState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx {
  const row = foodRow(b.industry)
  if (!row) return { demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, next: st, note: null }
  const year = readYear(g, fiscal, mode)
  const grade = gradeOf(st.hygiene)
  const extended = st.hours === 1
  const lost = squeeze(row, cx.use / (extended ? HOURS_SEATS : 1))

  // Delivery: new sales (the rest of the delivered share was yours already), commission, and the
  // pandemic shield, which returns part of the delivered share of the year's real demand loss.
  const out = outbound(g, b, row, st.channel)
  const fresh = out ? out.share * (1 - out.cannibal) : 0
  const shield = out ? out.share * Math.max(0, 1 - nationalMarket(g, b.industry, b.countryId, year).events.demand) * SHIELD : 0
  const wages = Math.max(0, b.last?.wages ?? .3 * cx.base)
  const costs = (out ? out.rate * out.share * cx.base * (1 + fresh) + out.fixed * cx.base : 0) + (extended ? HOURS_WAGES * wages : 0)

  const season = mode === 'book' ? 1 + row.amp * seasonIndex(g, a, fiscal, 'wx') : 1
  const ratingFactor = 1 + .06 * (st.rating - 3.4)
  const gradeFactor = grade === 'C' ? .92 : 1
  const demand = (1 - lost) * ratingFactor * gradeFactor * MENU_DEMAND[st.menu] * season * (1 + fresh + shield) * historyFactor(g, b, year)
  // Prep and plate waste: ops staff cut it.
  const cost = MENU_COST[st.menu] * (1 + .65 * row.waste * (.2 - .12 * staffPower(b, 'ops')))

  const hygieneTarget = 56 + .3 * b.quality + 22 * roleSkill(b, 'Food Safety Lead') + (st.audit === fiscal ? 12 : 0) - 3 * Math.sqrt(franchiseUnits(b)) - (b.morale < 35 ? 8 : 0)
  const hygiene = clampN(st.hygiene + .35 * (hygieneTarget - st.hygiene), 0, 100)
  const dear = Math.max(0, b.price / Math.max(.01, cx.going) - 1.1)
  const gradeTerm = grade === 'A' ? .3 : grade === 'C' ? -.3 : 0
  const ratingTarget = 2.4 + .02 * b.quality + gradeTerm + MENU_TERM[st.menu] - 1.5 * lost - 1.5 * dear
  const rating = clampN(st.rating + .4 * (ratingTarget - st.rating), 1, 5)

  return {
    demand, cost, capLoss: 0, open: 1, income: 0, costs, randIncome: 0, randCosts: 0,
    next: { ...st, hygiene, rating }, note: gradeNote(a, grade, gradeOf(hygiene)),
  }
}

/** The status lines of the desk (pure). null: no record yet, so the family has nothing to show. */
export function foodHeader(g: GameState, b: BizState, st: FoodState | null): string[] {
  if (!st) return []
  const lines = [`Grade ${gradeOf(st.hygiene)}, hygiene ${Math.round(st.hygiene)}. Rating ${st.rating.toFixed(1)}.`]
  const row = foodRow(b.industry)
  if (row) {
    // The first part of the day to fill: the one with the least seat-hours per unit of demand.
    const first = row.dayparts.reduce((best, d) => (d.seat / d.share < best.seat / best.share ? d : best))
    const above = (first.seat / first.share) * (st.hours === 1 ? HOURS_SEATS : 1)
    lines.push(`${first.name.charAt(0).toUpperCase()}${first.name.slice(1)} fills above ${pct(above)} use.`)
  }
  const delivery = st.channel === 1 ? 'on a platform' : st.channel === 2 ? 'by own fleet' : 'off'
  // One short fact a line: three short sentences in one line would read as a trailing fragment.
  lines.push(`Menu ${MENU_NAME[st.menu]}.`, `Delivery ${delivery}.`, `${st.hours === 1 ? 'Extended' : 'Standard'} hours.`)
  const history = sectorHistoryLine(g, b)
  if (history) lines.push(history)
  return lines
}
