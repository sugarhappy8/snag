// Utilities, Land and Fleets, state and math (energy, solar, water, telecom, dataCenter, farm,
// logistics): the yearly rule of the plant. Condition is a stock that wears down and is lifted by an
// overhaul; it sets the odds and the size of an outage. Weather, the spot and contract mix, the fuel
// hedge and weather cover turn it into the generic channels (capacity, unit cost) and a few money
// flows. Utilities write no demand multiplier. Pure: no g.rng, no state writes; outages, weather and
// spot prices are hashed draws, and 'expected' sets them to their mean and never reads past g.year.
// The levers, events and copy are in sector-util-play.ts, which registers UTIL_MODEL and adds
// UTIL_NOTE_COPY to its copy table.
import type { Asset, GameState } from '../types'
import { nationalMarket } from './dynamics'
import { SECTOR_ROLES, UTIL, type UtilRow } from './sector-data'
import { readYear, roleSkill, sectorText, seasonIndex, type CopyTable, type FxMode, type SectorCtx, type SectorFx } from './sector-kit'
import { blankRecord, type UtilState } from './sector-state'
import type { BizState } from './state'
import { clampN, pct, round2 } from './util'

/** The yearly condition lines, written for an outage and when the plant crosses the worn line (the play file adds this table to its own). */
export const UTIL_NOTE_COPY: CopyTable = {
  'util.outage.log': '${name} had an outage and lost ${loss} of its output.',
  'util.cond.low.log': '${name} is wearing out. Outage odds are rising.',
  'util.cond.ok.log': '${name} is back above condition 65.',
}

/** Below this condition the odds of an outage start to rise. */
const WORN_BELOW = 65
/** What an overhaul adds to the condition the year it is done, before that year's wear. */
const OVERHAUL_LIFT = 12
/** Condition points a skill-1 key role gives back each year. */
const ROLE_REPAIR = 4
/** A repair after an outage costs this share of an overhaul. */
const REPAIR_SHARE = .8
/** The service penalty of an outage for trades with an SLA, as a share of a normal year's sales. */
const SLA_PENALTY = .015
/** Weather cover and the fuel hedge's premium, as shares of a normal year's sales (the premium also scales with the hedge and the fuel share). */
const COVER_COST = .006
const HEDGE_PREMIUM = .025

export function utilRow(industry: string): UtilRow | null {
  return Object.prototype.hasOwnProperty.call(UTIL, industry) ? UTIL[industry as keyof typeof UTIL] : null
}

/** The chance of an outage in a year: odds start to rise below condition 65 and in a bad weather year, and a skilled key role halves them. */
export function outageP(condition: number, bad: number, roleSkillValue: number): number {
  const c = clampN(condition, 0, 100)
  const raw = clampN(.03 + Math.max(0, WORN_BELOW - c) / 180 + .05 * bad, .02, .45)
  return raw * (1 - .5 * clampN(roleSkillValue, 0, 1))
}

/** The share of the year's output an outage takes (.15 to .5, more as the plant runs down). */
export function outageSize(condition: number): number {
  return Math.min(.5, .15 + .35 * (1 - clampN(condition, 0, 100) / 100))
}

/** An overhaul: a share of a normal year's sales by trade, with a floor by price level. */
export function overhaulCost(_b: BizState, row: UtilRow, cx: SectorCtx): number {
  return Math.round(Math.max(row.overhaul * cx.base, 2000 * cx.level))
}

/** The contract shares a company can pick: steps of .25 from the regulated floor, then 1. */
export function contractOptions(floor: number): number[] {
  const out: number[] = []
  for (let k = 0; floor + k * .25 < 1 - 1e-9; k++) out.push(round2(floor + k * .25))
  out.push(1)
  return out
}

/** What the spot market pays or takes for a spot draw (-1 to 1), as a share of a normal year's sales: zero mean, zero when fully contracted. */
export function spotSettlement(row: UtilRow, st: UtilState, index: number): number {
  return (1 - st.contract) * row.vol * index
}

/** The contract share a trade starts at: its regulated floor, or what the spot share leaves. */
function seedContract(row: UtilRow): number {
  return Math.max(row.floor, 1 - row.spot)
}

/** The neutral point: a plant of 80 that ages 2 a year (at most 25), the trade's own mix, no hedge, no cover. */
export function utilSeed(_g: GameState, _a: Asset, b: BizState, since: number): UtilState {
  const blank = blankRecord('util', since)
  if (blank.family !== 'util') throw new Error('blankRecord gave another family')
  const row = utilRow(b.industry)
  const age = Number.isFinite(b.founded) ? since - b.founded : 0
  return { ...blank, since, lastYear: since, condition: clampN(80 - Math.min(25, 2 * age), 40, 95), contract: row ? seedContract(row) : blank.contract }
}

function bitCount(outages: number): number {
  let n = 0
  for (let x = outages & 7; x; x >>= 1) n += x & 1
  return n
}

function note(a: Asset, outage: number | null, was: number, now: number): SectorFx['note'] {
  if (outage !== null) return { text: sectorText(UTIL_NOTE_COPY, 'util.outage.log', { name: a.name, loss: pct(outage) }), tone: 'bad' }
  const wasWorn = was < WORN_BELOW
  const nowWorn = now < WORN_BELOW
  if (wasWorn === nowWorn) return null
  return nowWorn
    ? { text: sectorText(UTIL_NOTE_COPY, 'util.cond.low.log', { name: a.name }), tone: 'bad' }
    : { text: sectorText(UTIL_NOTE_COPY, 'util.cond.ok.log', { name: a.name }), tone: 'good' }
}

/**
 * One fiscal year of the plant. The condition is read at the start of the year, lifted when an
 * overhaul was paid for this year, and the worn stock is written to `next`. An outage is a hashed draw
 * in 'book' mode and its expectation (odds times size, odds times the repair and the penalty) in
 * 'expected'; weather and spot draws are 0 in 'expected'; the hedge reads the engine's own fuel costs
 * for the year being lived, never later.
 */
export function utilFx(g: GameState, a: Asset, b: BizState, st: UtilState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx {
  const row = utilRow(b.industry)
  if (!row) return { demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, next: st, note: null }
  const year = readYear(g, fiscal, mode)
  const booked = mode === 'book'
  const role = Object.prototype.hasOwnProperty.call(SECTOR_ROLES, b.industry) ? SECTOR_ROLES[b.industry] : null
  const skill = role ? roleSkill(b, role.title) : 0

  // Weather: one-sided, so its mean is the price of weather. Cover halves every hit.
  const idx = booked ? seasonIndex(g, a, fiscal, 'wx') : 0
  const bad = Math.max(0, -idx)
  const good = Math.max(0, idx)
  const hit = row.amp * bad * (1 - .5 * st.cover)
  const weatherLoss = row.hits === 'capacity' ? hit : 0
  const weatherCost = row.hits === 'capacity' ? 1 - .5 * row.amp * good : 1 + hit

  // Outage: an overhaul this year lifts the condition the odds and the size are read at.
  const cond = st.condition + (st.overhaul === fiscal ? OVERHAUL_LIFT : 0)
  const p = outageP(cond, bad, skill)
  const size = outageSize(cond)
  const struck = booked && (seasonIndex(g, a, fiscal, 'out') + 1) / 2 < p
  const outageLoss = booked ? (struck ? size : 0) : p * size
  const share = booked ? (struck ? 1 : 0) : p
  const sla = row.sla ? SLA_PENALTY * cx.base : 0
  const repair = REPAIR_SHARE * overhaulCost(b, row, cx)

  // Spot settlement is random money (zero mean); moving off the seed mix earns or pays a premium every year.
  const spot = row.vol > 0 && booked ? spotSettlement(row, st, seasonIndex(g, a, fiscal, 'spot')) * cx.base : 0
  const mixMove = (seedContract(row) - st.contract) * row.disc * cx.base

  // Hedge: it offsets the engine's fuel-driven cost swing and pays for being wrong in a glut.
  const hedged = row.fuel > 0 && st.hedge > 0
  const oil = hedged ? nationalMarket(g, b.industry, b.countryId, year).events.costs : 1
  const hedgeCost = hedged ? 1 - st.hedge * row.fuel * (oil - 1) : 1
  const premium = hedged ? HEDGE_PREMIUM * st.hedge * row.fuel * cx.base : 0

  const condition = clampN(cond - row.wear + ROLE_REPAIR * skill, 0, 100)
  return {
    demand: 1,
    cost: weatherCost * hedgeCost,
    capLoss: 1 - (1 - weatherLoss) * (1 - outageLoss),
    open: 1,
    income: Math.max(0, mixMove),
    costs: (st.cover === 1 ? COVER_COST * cx.base : 0) + premium + Math.max(0, -mixMove),
    randIncome: Math.max(0, spot),
    randCosts: share * (repair + sla) + Math.max(0, -spot),
    next: { ...st, condition, outages: ((st.outages << 1) | (struck ? 1 : 0)) & 7 },
    note: note(a, struck ? size : null, st.condition, condition),
  }
}

/** The status lines of the desk (pure). null: no record yet, so the family has nothing to show. */
export function utilHeader(_g: GameState, b: BizState, st: UtilState | null): string[] {
  if (!st) return []
  const row = utilRow(b.industry)
  const n = bitCount(st.outages)
  const lines = [`Condition ${Math.round(st.condition)}. ${n} ${n === 1 ? 'outage' : 'outages'} in 3 years.`]
  if (row) {
    lines.push(row.vol > 0 ? `Contract ${pct(st.contract)}, regulated ${pct(row.floor)}.` : `Regulated ${pct(row.floor)}.`)
    if (row.fuel > 0) lines.push(`Hedge ${pct(st.hedge)}.`)
  }
  lines.push(st.cover === 1 ? 'Weather cover on.' : 'Weather cover off.')
  return lines
}
