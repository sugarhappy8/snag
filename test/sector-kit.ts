// Helpers shared by the sector tests: a grown-up with a company, a year that passes with every popup
// answered, a stub family model, and a hired-CEO company. Tests that call stubModel use only stubbed
// families (vitest isolates module state per file, so the real models are untouched elsewhere).
import { askingSalary, becomeCeo, stepDown } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { blankRecord, type FoodState } from '../src/game/business/sector-state'
import { registerFamily, type CopyTable, type LeverDef, type SectorEvent, type SectorFx } from '../src/game/business/sector-kit'
import { bizOf, type BizState, type Manager } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { Asset, ChoiceModal, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adult, company, drain } from './market-kit'

/** A grown-up with a company (quality 70 from company(); tests that need quality 50 set b.quality). */
export function deskGame(trade: Industry, opts: { seed?: number; year?: number; cash?: number; talent?: boolean; countryId?: string } = {}): { g: GameState; a: Asset; b: BizState } {
  const g = adult(opts.seed ?? 1, opts.year ?? 2024, opts.countryId ?? 'us')
  if (opts.talent === false) g.character.talents = []
  const a = company(g, trade, { cash: opts.cash ?? 20_000_000 })
  return { g, a, b: bizOf(g, a) }
}

/** One fiscal year: the calendar moves on and the business hook runs. Returns the choice popups it queued, then answers every popup. */
export function playYear(g: GameState): ChoiceModal[] {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyBusinessImpl(g)
  const popups = g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
  drain(g)
  return popups
}

/** The layer is off for this company: a newer-version record that is never read or overwritten, so it books as v3.0.0. */
export function inert(b: BizState): void {
  b.sector = { v: 2 }
}

export function jail(g: GameState): void {
  g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
}

/** Register a stub 'food' family: neutral effects (or `fx`) whose next record is the old one with hygiene plus 1. */
export function stubModel(opts: { fx?: Partial<SectorFx>; levers?: readonly LeverDef[]; events?: readonly SectorEvent[]; copy?: CopyTable } = {}): void {
  registerFamily({
    family: 'food',
    copy: opts.copy ?? {},
    seed: (_g, _a, _b, since) => blankRecord('food', since),
    effects: (_g, _a, _b, st) => {
      const next = st.family === 'food' ? ({ ...st, hygiene: st.hygiene + 1 } as FoodState) : st
      return { demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, note: null, ...opts.fx, next: opts.fx?.next ?? next }
    },
    header: () => ['stub'],
    levers: opts.levers ?? [],
    events: opts.events ?? [],
  })
}

/** Deep Object.freeze, for tests that prove a function is pure. */
export function frozen<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x)
    for (const v of Object.values(x as Record<string, unknown>)) frozen(v)
  }
  return x
}

function hire(b: BizState, skill: number, year: number): Manager {
  return { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: year, style: 'steady', integrity: 100 }
}

/** A six-site company that has just been handed to a hired CEO of this skill (a copy of managed() in test/ceo.test.ts). */
export function managedDesk(trade: Industry, skill: number, opts: { seed?: number; cash?: number } = {}): { g: GameState; a: Asset; b: BizState } {
  const countryId = 'us'
  const g = createNewLife({ seed: opts.seed ?? 1, year: 1990, countryId })
  g.queue = []
  const c = g.character
  c.age = 36
  g.year = 2026
  c.money = 1_000_000
  c.talent = null
  c.talents = []
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, trade, countryId, city, { cash: opts.cash ?? 1_500_000, founded: 2020, outlets: [{ countryId, city, count: 6, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  stepDown(g, a, b, hire(b, skill, g.year))
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}
