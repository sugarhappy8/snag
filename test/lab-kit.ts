// Helpers shared by the R&D 3.0 tests (lab-*.test.ts): a grown-up with a company that has played one
// year, a way to edit the stored lab the way the engine does (draft, then save), and a check that a
// piece of code drew nothing from the game's random stream.
import { marketKey } from '../src/game/business/competition-core'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { addHeavy } from '../src/game/business/heavy-rd'
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
 * A breakthrough this company launched last year, as Heavy R&D would have left it: the market's record
 * (four years of development, quality 80, a fixed 2,000,000 cost, this company the pioneer) and the
 * matching line on sale. Returns its family. The first giant rival follows at `rec.year + 4`, which is
 * `g.year + 3`, so the family is novel (no rival sells one) now.
 */
export function launchBreakthrough(g: GameState, a: Asset, b: BizState, index = 0): string {
  const family = breakthroughsFor(b.industry)[index].name
  addHeavy(g, b.industry, marketKey(b), { family, year: g.year - 1, years: 4, quality: 80, cost: 2_000_000, by: a.id })
  b.products.push({ name: family, launched: g.year - 1, boost: 0, quality: 80, family, kind: 'breakthrough' })
  return family
}

export { deepFreeze } from './fuzz-kit'
