// Helpers shared by the R&D 3.0 tests (lab-*.test.ts): a grown-up with a company that has played one
// year, a way to edit the stored lab the way the engine does (draft, then save), and a check that a
// piece of code drew nothing from the game's random stream.
import { marketKey } from '../src/game/business/competition-core'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { addHeavy, heavyCost, heavyYears } from '../src/game/business/heavy-rd'
import { draftLab, saveLab, type LabState } from '../src/game/business/lab-state'
import { bizOf, type BizState } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState } from '../src/game/types'
import { adult, company, nextYear } from './market-kit'

/**
 * A company in its second year: `adult(seed, year ?? 2030, country ?? 'us')`, a company with plenty of
 * cash, one real year played, popups cleared. `g.year` is one past `opts.year` when it returns.
 */
export function labGame(seed: number, industry: Industry, opts: { year?: number; country?: string; cash?: number; outlets?: number } = {}): { g: GameState; a: Asset; b: BizState } {
  const g = adult(seed, opts.year ?? 2030, opts.country ?? 'us')
  const a = company(g, industry, { cash: opts.cash ?? 80_000_000, ...(opts.outlets ? { outlets: opts.outlets } : {}) })
  nextYear(g)
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}

/** Edit a company's stored lab the way the engine does: take a draft, change it, save it as a new object. */
export function patchLab(b: BizState, edit: (d: LabState) => void): void {
  const d = draftLab(b)
  edit(d)
  saveLab(b, d)
}

/** True when `f` leaves the game's random stream where it was. */
export function noDraw(g: GameState, f: () => void): boolean {
  const before = g.rng
  f()
  return g.rng === before
}

/**
 * A trade and a country where a patent on a real breakthrough is worth something at its launch. A mid-tech
 * breakthrough in this trade takes 4 years to develop (heavyYears) and the country's courts give a mid-tech
 * patent 6 years (patentLaw): filed at the launch it outlasts the earliest year a rival can follow (heavyLead)
 * by 2, so it holds back the first rival whichever way the rivals' extra year falls. Brewery, the usual test
 * trade, develops in 5 years and 'us' or 'ca' give 5: there a patent filed at launch ends when the first rival
 * may arrive and is worth nothing then.
 */
export const PATENT_TRADE: Industry = 'water'
export const PATENT_COUNTRY = 'au'

/**
 * A breakthrough this company launches this year, as Heavy R&D leaves it (heavy-rd.ts advanceHeavy): the
 * market's record is filed under the launch year itself (the first year the line is on sale), with the
 * trade's own development years (`heavyYears`, 4 to 6) and the price the company paid (`heavyCost`), this
 * company the pioneer, and the matching line on sale. test/lab-kit.test.ts holds it to a real launch.
 * Returns its family. The first giant rival can follow `heavyYears` after the launch (`heavyLead`), so the
 * family is novel (no rival sells one) now.
 */
export function launchBreakthrough(g: GameState, a: Asset, b: BizState, index = 0): string {
  const family = breakthroughsFor(b.industry)[index].name
  const cost = heavyCost(g, b)
  if (cost === null) throw new Error(`no classic idea to price a breakthrough on for ${b.industry}`)
  addHeavy(g, b.industry, marketKey(b), { family, year: g.year, years: heavyYears(b), quality: 80, cost, by: a.id })
  b.products.push({ name: family, launched: g.year, boost: 0, quality: 80, family, kind: 'breakthrough' })
  return family
}

export { deepFreeze } from './fuzz-kit'
