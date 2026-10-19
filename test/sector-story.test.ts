// The sector layer over a whole life of a company, through the real yearly flow (spec 6 and 7). Every
// family plays its trades twelve years from 2024, once with the Operations Desk on and once switched off
// (`inert`: the company books as v3.0.0), and with nobody touching a lever the profit with the desk must stay
// close to the profit without it: the layer is mean-preserving, so it may move a year but not the company
// (an unattended plant decays by design, so the utility band is wider). Nothing may turn into NaN, and the
// layer alone must never drain the company's cash. A second arm hands three trades to a hired CEO of skill
// 90, who works the desk through the same applyLever. No rule is mocked.
//
// Why the profits are pooled over the seeds. The desk moves the random stream (its event roll draws from
// g.rng), so from the second year the same seed plays a different life with it and without it: one seed of
// a thin-margin company swings its twelve-year profit by 20% to 40% either way, and the same seed is lucky
// or unlucky in every trade at once. The median of three seeds therefore measures the seeds, not the desk
// (the clinic's came out at .84 over three seeds and .86 pooled over five, with nothing wrong in the desk).
// So the profit is summed over the seeds first and the two sums are compared: over eight seeds every food
// and care trade came out at .97 to 1.06 and every utility at .87 to 1.03, inside the plan's bands.
import { describe, expect, it } from 'vitest'
import { boardOf } from '../src/game/business/board-state'
import { FAMILY_TRADES, type FamilyId } from '../src/game/business/sector-state'
import { bizOf, readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { GameState } from '../src/game/types'
import { deskGame, inert, managedDesk, playYear } from './sector-kit'

/** Care has the thinnest margins, so it needs the most seeds (see above); food and utilities settle with five. */
const SEEDS: Readonly<Record<FamilyId, readonly number[]>> = { food: [1, 2, 3, 4, 5], care: [1, 2, 3, 4, 5, 6, 7, 8], util: [1, 2, 3, 4, 5] }
const YEARS = 12
/** The profit with the desk over the profit without it, pooled over the seeds, as a band per family. */
const BAND: Readonly<Record<FamilyId, readonly [number, number]>> = { food: [.90, 1.10], care: [.90, 1.10], util: [.70, 1.05] }
/** The layer alone may cost at most this share of the control's twelve-year revenue in final cash. */
const SPIRAL = .25
const TIMEOUT = 300_000

interface Run {
  profit: number
  revenue: number
  cash: number
}

/** Every number reachable from a value is finite (the path in the message names the first one that is not). */
function finite(x: unknown, path = 'state'): void {
  if (typeof x === 'number') expect(Number.isFinite(x), path).toBe(true)
  else if (Array.isArray(x)) x.forEach((v, i) => finite(v, `${path}[${i}]`))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finite(v, `${path}.${k}`)
}

const sum = (xs: readonly number[]): number => xs.reduce((total, x) => total + x, 0)

function tally(g: GameState, id: string, label: string): Run {
  const a = g.assets.find((x) => x.id === id)
  if (!a) throw new Error(`${label}: the company is gone`)
  const b = readBiz(g, a)
  finite(b, label)
  finite(g.character.money, `${label} money`)
  return {
    profit: sum(b.history.map((r) => r.profit)),
    revenue: sum(b.history.map((r) => r.revenue)),
    cash: b.cash,
  }
}

/** Arm A: an owner-run company that never touches a lever. */
function owner(trade: Industry, seed: number, layer: boolean): Run {
  const { g, a, b } = deskGame(trade, { seed })
  if (!layer) inert(b)
  for (let y = 0; y < YEARS; y++) playYear(g)
  return tally(g, a.id, `${trade} seed ${seed} ${layer ? 'desk' : 'classic'}`)
}

describe('sector story: an owner who never touches a lever', () => {
  for (const family of ['food', 'care', 'util'] as FamilyId[]) {
    it(`${family}: the desk keeps profit near the classic run and drains no cash`, () => {
      const [low, high] = BAND[family]
      const bad: string[] = []
      for (const trade of FAMILY_TRADES[family] as readonly Industry[]) {
        const on: Run[] = []
        const off: Run[] = []
        for (const seed of SEEDS[family]) {
          const x = owner(trade, seed, true)
          const y = owner(trade, seed, false)
          on.push(x)
          off.push(y)
          if (y.cash - x.cash > SPIRAL * y.revenue) bad.push(`${trade} seed ${seed}: cash ${Math.round(x.cash)} against ${Math.round(y.cash)}, revenue ${Math.round(y.revenue)}`)
        }
        const control = sum(off.map((r) => r.profit))
        expect(control, `${trade}: the classic run makes a profit`).toBeGreaterThan(0)
        const ratio = sum(on.map((r) => r.profit)) / control
        if (ratio < low || ratio > high) bad.push(`${trade}: profit with the desk over without it is ${ratio.toFixed(3)}, outside ${low} to ${high}`)
      }
      expect(bad).toEqual([])
    }, TIMEOUT)
  }
})

// Arm B. The CEO's own growth decides the scale of a hired-CEO company (a restaurant chain ends at 10 or at
// 100 sites depending on the stream), so the board's capex limit is 0 on both runs: the sites stay put and
// the comparison is the CEO's pricing and the desk's free levers. Ten seeds of the three trades measured
// the pooled ratio at .92 to .97 for the restaurant, 1.15 to 1.22 for the clinic (a hired CEO sets a payer
// mix there while seats are idle, which is the lever doing its job) and 1.02 to 1.07 for the energy company.
const HIRED_SEEDS = [1, 2, 3, 4, 5, 6] as const
const HIRED_YEARS = 10
const HIRED_BAND = [.85, 1.30] as const

/** Arm B: a hired CEO of skill 90 runs a company that cannot grow (and, with the desk on, works its levers). */
function hired(trade: Industry, seed: number, layer: boolean): Run {
  const { g, a, b } = managedDesk(trade, 90, { seed })
  boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }
  if (!layer) inert(b)
  for (let y = 0; y < HIRED_YEARS; y++) playYear(g)
  expect(bizOf(g, a).ceo, `${trade} seed ${seed}`).toBe('manager')
  return tally(g, a.id, `${trade} seed ${seed} CEO ${layer ? 'desk' : 'classic'}`)
}

describe('sector story: a hired CEO of skill 90', () => {
  it('works the desk without wrecking the company or making a windfall of it', () => {
    const bad: string[] = []
    for (const trade of ['restaurant', 'clinic', 'energy'] as const) {
      const on = HIRED_SEEDS.map((seed) => hired(trade, seed, true))
      const off = HIRED_SEEDS.map((seed) => hired(trade, seed, false))
      for (const [i, r] of on.entries()) {
        if (r.cash < 0) bad.push(`${trade} seed ${HIRED_SEEDS[i]}: cash ${Math.round(r.cash)} is below zero`)
      }
      const control = sum(off.map((r) => r.profit))
      expect(control, `${trade}: the classic run makes a profit`).toBeGreaterThan(0)
      const ratio = sum(on.map((r) => r.profit)) / control
      if (ratio < HIRED_BAND[0] || ratio > HIRED_BAND[1]) bad.push(`${trade}: profit with the desk over without it is ${ratio.toFixed(3)}, outside ${HIRED_BAND[0]} to ${HIRED_BAND[1]}`)
    }
    expect(bad).toEqual([])
  }, TIMEOUT)
})
