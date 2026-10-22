// The sector layer's yearly hook, the clamped effect dispatch and the money booking. It never
// replaces the engine: it only writes the generic channels (demandShock, costShock, capacityLoss,
// openFraction) and books money through b.cash together with b.yearIncome or b.yearCosts, which
// bookYear in economy.ts already counts once. It never calls g.rng: draws are hashes (sector-kit.ts).
import { firmCash } from '../cash'
import { log } from '../core'
import { isIndustryLegal } from '../data/markets'
import type { Asset, GameState } from '../types'
import { fxValue, type Worth } from './economy'
import { baseRevenue, modelOf, readYear, sectorCtx, type FxMode, type SectorCtx, type SectorFx } from './sector-kit'
import { addDiary, clampRecord, familyOf, readSector, saveSector, sectorSlot, type SectorRow, type SectorState } from './sector-state'
import type { BizState } from './state'
import { clampN } from './util'
import './sector-families'

/** What one year of the layer may write. A hostile or buggy model cannot exceed these. */
export const SECTOR_BOUNDS: { demand: readonly [number, number]; cost: readonly [number, number]; capLoss: number; open: number; random: number } = {
  demand: [.80, 1.35], cost: [.90, 1.12], capLoss: .35, open: .8, random: .12,
}

function whole(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0
}

/** Income of the company: cash and the year's other income, once (bookYear adds the pair back to cash). Returns the dollars booked. */
export function bookIncome(g: GameState, b: BizState, x: number, firm?: string): number {
  const n = whole(x)
  firmCash(g, b, n, 'sales', firm)
  b.yearIncome += n
  return n
}

/** A cost of the company: cash and the year's other costs, once. Returns the dollars booked. */
export function bookCost(g: GameState, b: BizState, x: number, firm?: string): number {
  const n = whole(x)
  firmCash(g, b, -n, 'inputs', firm)
  b.yearCosts += n
  return n
}

/** Build and save the record of a company from its own numbers. Null: no family, a foreign slot or no model. */
export function seedSector(g: GameState, a: Asset, b: BizState, since: number): SectorState | null {
  const family = familyOf(b.industry)
  const model = family ? modelOf(family) : null
  if (!family || !model || sectorSlot(b) === 'foreign') return null
  saveSector(b, { ...model.seed(g, a, b, since), since, lastYear: since })
  return readSector(b)
}

function neutral(st: SectorState): SectorFx {
  return { demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, next: st, note: null }
}

function finite(x: number, def: number): number {
  return Number.isFinite(x) ? x : def
}

/** The family's year, pure, with every effect inside SECTOR_BOUNDS and the next record inside its table ranges. */
export function sectorEffects(g: GameState, a: Asset, b: BizState, st: SectorState, fiscal: number, mode: FxMode, cx?: SectorCtx): SectorFx {
  const model = modelOf(st.family)
  if (!model) return neutral(clampRecord(st))
  const ctx = cx ?? sectorCtx(g, b, readYear(g, fiscal, mode))
  const raw = model.effects(g, a, b, st, fiscal, mode, ctx)
  const randomCap = SECTOR_BOUNDS.random * (cx ? baseRevenue(g, b) : ctx.base)
  const cap = Number.isFinite(randomCap) ? Math.max(0, randomCap) : 0
  return {
    demand: clampN(finite(raw.demand, 1), SECTOR_BOUNDS.demand[0], SECTOR_BOUNDS.demand[1]),
    cost: clampN(finite(raw.cost, 1), SECTOR_BOUNDS.cost[0], SECTOR_BOUNDS.cost[1]),
    capLoss: clampN(finite(raw.capLoss, 0), 0, SECTOR_BOUNDS.capLoss),
    open: clampN(finite(raw.open, 1), SECTOR_BOUNDS.open, 1),
    income: Math.max(0, finite(raw.income, 0)),
    costs: Math.max(0, finite(raw.costs, 0)),
    randIncome: clampN(finite(raw.randIncome, 0), 0, cap),
    randCosts: clampN(finite(raw.randCosts, 0), 0, cap),
    next: clampRecord(raw.next),
    note: raw.note ? { text: raw.note.text, tone: raw.note.tone } : null,
  }
}

/**
 * What a year of this effect is worth to the owner, capacity-aware: the contribution of the demand
 * that capacity can serve, the cost shift on the cost of goods, the money, and the capacity lost.
 */
export function sectorValue(g: GameState, b: BizState, w: Worth, fx: SectorFx): number {
  const served = Math.min(fx.demand, 1 / w.util)
  const lost = fxValue(g, { ...b, capacityLoss: 0 }, w, { capacityTo: fx.capLoss })
  const v = w.contrib * (served - 1) - (fx.cost - 1) * w.cogs + fx.income - fx.costs + fx.randIncome - fx.randCosts + lost
  return Number.isFinite(v) ? v : 0
}

/**
 * The yearly hook (yearlyBusinessImpl, right after prepareVenueYear). The first fiscal year after a
 * record appears only measures: the record is saved and nothing else is written, so that year books
 * exactly as v3.0.0 did. From then on the family's year moves the generic channels and books money.
 */
export function prepareSectorYear(g: GameState, a: Asset, b: BizState, fiscal: number): void {
  const family = familyOf(b.industry)
  if (!family || !g.character.alive || !isIndustryLegal(b.countryId, b.industry, g)) return
  const model = modelOf(family)
  if (!model || sectorSlot(b) === 'foreign') return
  const st = readSector(b)
  if (!st) {
    seedSector(g, a, b, fiscal)
    return
  }
  if (st.lastYear >= fiscal) return
  // Idempotence: the year is marked before anything is written.
  st.lastYear = fiscal
  saveSector(b, st)

  const fx = sectorEffects(g, a, b, st, fiscal, 'book')
  b.demandShock = clampN(b.demandShock * fx.demand, .3, 2)
  b.costShock *= fx.cost
  b.capacityLoss = 1 - (1 - b.capacityLoss) * (1 - fx.capLoss)
  b.openFraction = Math.min(b.openFraction, fx.open)
  const income = bookIncome(g, b, fx.income, a.id) + bookIncome(g, b, fx.randIncome, a.id)
  const costs = bookCost(g, b, fx.costs, a.id) + bookCost(g, b, fx.randCosts, a.id)

  const row: SectorRow = { year: fiscal, income, costs, demand: fx.demand, cost: fx.cost, capLoss: fx.capLoss }
  const next: SectorState = clampRecord({ ...fx.next, since: st.since, lastYear: fiscal, lastEvent: st.lastEvent, pending: st.pending, ledger: [...st.ledger, row], diary: st.diary })
  if (fx.note) {
    const text = fx.note.text.slice(0, 90)
    log(g, text, fx.note.tone)
    addDiary(next, `${fiscal}: ${text}`)
  }
  saveSector(b, next)
}
