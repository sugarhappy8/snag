// The sector layer over a whole life of a company, through the real yearly flow (spec 6 and 7). Every
// family plays its trades twelve years from 2024, once with the Operations Desk on and once switched off
// (`inert`: the company books as v3.0.0), and with nobody touching a lever the profit with the desk must stay
// close to the profit without it: the layer is mean-preserving, so it may move a year but not the company
// (an unattended plant decays by design, so the utility band is wider). Nothing may turn into NaN, and the
// layer alone must never drain the company's cash. A second arm hands eight trades to a hired CEO of skill
// 90, who works the desk through the same applyLever. No rule is mocked. Both arms also read the layer's
// own books (the ledger rows and the money it booked) so a lever that makes money out of nothing shows
// up as booked flows, which the pooled profit cannot see through the seed noise.
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
import { FAMILY_TRADES, readSector, type FamilyId } from '../src/game/business/sector-state'
import { bizOf, readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { GameState } from '../src/game/types'
import { deskGame, inert, managedDesk, playYear } from './sector-kit'
import { readSlice, seedSlice } from './shard-kit'

// In CI each shard runs some of the four tests below (SLICE=i/n); each test pools its own seeds, so it stays whole
// (test/shard-kit.ts). In the merge step no test is left, and one empty test keeps the file from counting as empty.
const slice = readSlice()
const mine = seedSlice(['food', 'care', 'util', 'hired'], 'sector:tests', slice)
const families = (['food', 'care', 'util'] as FamilyId[]).filter((family) => mine.includes(family))

/** Care has the thinnest margins, so it needs the most seeds (see above); food and utilities settle with five. */
const SEEDS: Readonly<Record<FamilyId, readonly number[]>> = { food: [1, 2, 3, 4, 5], care: [1, 2, 3, 4, 5, 6, 7, 8], util: [1, 2, 3, 4, 5] }
const YEARS = 12
/** The profit with the desk over the profit without it, pooled over the seeds, as a band per family. */
const BAND: Readonly<Record<FamilyId, readonly [number, number]>> = { food: [.90, 1.10], care: [.90, 1.10], util: [.70, 1.05] }
/** The layer alone may cost at most this share of the control's twelve-year revenue in final cash. */
const SPIRAL = .25
/** An owner who never touches a lever collects nothing from the layer: its booked money over its revenue stays at or below this (a plant that wears down books costs, never gains). */
const OWNER_FLOWS = .005
/**
 * The most the layer may book as money net of its costs with a hired CEO working the desk, as a share of the
 * company's revenue. Levers can cost a company (plans, payer discounts, a worn plant's repairs) but none may
 * make money out of nothing. Measured over six seeds and ten years the booked flows are -6.7% to +.3% of
 * revenue; a contract mix that paid its spot premium for free booked +3.7% for a data center, +2.7% for
 * logistics and +1.7% for solar, which the pooled profit ratio (1.17, 1.23 and .97 then) could not see.
 */
const FREE_MONEY = .015
const TIMEOUT = 300_000

interface Run {
  profit: number
  revenue: number
  cash: number
  /** The years the layer wrote a ledger row for (the record keeps the last four, so they are counted as they come). */
  rows: number
  /** The money the layer booked as income and as costs over the run. */
  income: number
  costs: number
  /** The lever changes its desk diary shows (the owner's or the CEO's: '<year>: <lever> now <setting>.' or '... done for <cost>.'). */
  changes: number
}

/** Every number reachable from a value is finite (the path in the message names the first one that is not). */
function finite(x: unknown, path = 'state'): void {
  if (typeof x === 'number') expect(Number.isFinite(x), path).toBe(true)
  else if (Array.isArray(x)) x.forEach((v, i) => finite(v, `${path}[${i}]`))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finite(v, `${path}.${k}`)
}

const sum = (xs: readonly number[]): number => xs.reduce((total, x) => total + x, 0)

/** What the layer wrote while the years pass: its ledger rows and booked money (the ledger keeps four rows, so each year's new one is read as it lands). */
interface Books {
  rows: number
  income: number
  costs: number
  changes: number
}

/** Play `years` fiscal years and read the layer's own books after each. An inert company has no record, so its books stay empty. */
function play(g: GameState, id: string, years: number): Books {
  const seen = new Set<number>()
  const lines = new Set<string>()
  const books: Books = { rows: 0, income: 0, costs: 0, changes: 0 }
  for (let y = 0; y < years; y++) {
    playYear(g)
    const a = g.assets.find((x) => x.id === id)
    const st = a ? readSector(bizOf(g, a)) : null
    if (!st) continue
    for (const row of st.ledger) {
      if (seen.has(row.year)) continue
      seen.add(row.year)
      books.rows++
      books.income += row.income
      books.costs += row.costs
    }
    for (const line of st.diary) {
      if (/^\d+: .+ (?:now .+|done for .+)\.$/.test(line) && !lines.has(line)) {
        lines.add(line)
        books.changes++
      }
    }
  }
  return books
}

function tally(g: GameState, id: string, label: string, books: Books): Run {
  const a = g.assets.find((x) => x.id === id)
  if (!a) throw new Error(`${label}: the company is gone`)
  const b = readBiz(g, a)
  finite(b, label)
  finite(g.character.money, `${label} money`)
  return {
    profit: sum(b.history.map((r) => r.profit)),
    revenue: sum(b.history.map((r) => r.revenue)),
    cash: b.cash,
    ...books,
  }
}

/** Arm A: an owner-run company that never touches a lever. */
function owner(trade: Industry, seed: number, layer: boolean): Run {
  const { g, a, b } = deskGame(trade, { seed })
  if (!layer) inert(b)
  const books = play(g, a.id, YEARS)
  return tally(g, a.id, `${trade} seed ${seed} ${layer ? 'desk' : 'classic'}`, books)
}

if (families.length > 0) describe('sector story: an owner who never touches a lever', () => {
  for (const family of families) {
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
          // The layer is alive: it wrote a ledger row for every fiscal year after the observation year, and none for the classic run.
          if (x.rows !== YEARS - 1) bad.push(`${trade} seed ${seed}: the layer wrote ${x.rows} ledger rows, not ${YEARS - 1}`)
          if (y.rows !== 0) bad.push(`${trade} seed ${seed}: the classic run wrote ${y.rows} ledger rows`)
          // Nobody touched a lever.
          if (x.changes !== 0) bad.push(`${trade} seed ${seed}: ${x.changes} lever changes with nobody at the desk`)
        }
        const control = sum(off.map((r) => r.profit))
        expect(control, `${trade}: the classic run makes a profit`).toBeGreaterThan(0)
        const ratio = sum(on.map((r) => r.profit)) / control
        if (ratio < low || ratio > high) bad.push(`${trade}: profit with the desk over without it is ${ratio.toFixed(3)}, outside ${low} to ${high}`)
        const flows = (sum(on.map((r) => r.income)) - sum(on.map((r) => r.costs))) / sum(on.map((r) => r.revenue))
        if (flows > OWNER_FLOWS) bad.push(`${trade}: the layer booked ${(flows * 100).toFixed(2)}% of revenue to an owner who never touched a lever, above ${OWNER_FLOWS * 100}%`)
      }
      expect(bad).toEqual([])
    }, TIMEOUT)
  }
})

// Arm B. The CEO's own growth decides the scale of a hired-CEO company (a restaurant chain ends at 10 or at
// 100 sites depending on the stream), so the board's capex limit is 0 on both runs: the sites stay put and
// the comparison is the CEO's pricing and the desk's free levers. Ten seeds of the first three trades
// measured the pooled profit ratio at .92 to .97 for the restaurant, 1.15 to 1.22 for the clinic (a hired CEO
// sets a payer mix there while seats are idle, which is the lever doing its job) and 1.02 to 1.07 for the
// energy company. Seeds move that ratio by 20% either way, so the pooled profit only guards against a CEO
// that wrecks the company; what polices a lever that makes money out of nothing is the layer's own books,
// read per trade: the money it booked net of its costs over the company's revenue (FREE_MONEY). Utilities
// are in because their contract mix, hedge and cover are the levers that book money directly (a solar
// farm, a data center and a fleet before the contract mix was priced), care and food because their levers
// move demand.
const HIRED_TRADES = ['restaurant', 'gym', 'clinic', 'energy', 'solar', 'dataCenter', 'farm', 'logistics'] as const
const HIRED_SEEDS = [1, 2, 3, 4, 5, 6] as const
const HIRED_YEARS = 10
const HIRED_BAND = [.85, 1.30] as const

/** Arm B: a hired CEO of skill 90 runs a company that cannot grow (and, with the desk on, works its levers). */
function hired(trade: Industry, seed: number, layer: boolean): Run {
  const { g, a, b } = managedDesk(trade, 90, { seed })
  boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }
  if (!layer) inert(b)
  const books = play(g, a.id, HIRED_YEARS)
  expect(bizOf(g, a).ceo, `${trade} seed ${seed}`).toBe('manager')
  return tally(g, a.id, `${trade} seed ${seed} CEO ${layer ? 'desk' : 'classic'}`, books)
}

if (mine.includes('hired')) describe('sector story: a hired CEO of skill 90', () => {
  it('works the desk without wrecking the company or making money out of nothing', () => {
    const bad: string[] = []
    const changes: Partial<Record<FamilyId, number>> = {}
    for (const trade of HIRED_TRADES) {
      const on = HIRED_SEEDS.map((seed) => hired(trade, seed, true))
      const off = HIRED_SEEDS.map((seed) => hired(trade, seed, false))
      for (const [i, r] of on.entries()) {
        if (r.cash < 0) bad.push(`${trade} seed ${HIRED_SEEDS[i]}: cash ${Math.round(r.cash)} is below zero`)
        if (r.rows !== HIRED_YEARS - 1) bad.push(`${trade} seed ${HIRED_SEEDS[i]}: the layer wrote ${r.rows} ledger rows, not ${HIRED_YEARS - 1}`)
        if (off[i].rows !== 0) bad.push(`${trade} seed ${HIRED_SEEDS[i]}: the classic run wrote ${off[i].rows} ledger rows`)
      }
      const family = (Object.keys(FAMILY_TRADES) as FamilyId[]).find((f) => (FAMILY_TRADES[f] as readonly string[]).includes(trade))
      if (family) changes[family] = (changes[family] ?? 0) + sum(on.map((r) => r.changes))
      const control = sum(off.map((r) => r.profit))
      expect(control, `${trade}: the classic run makes a profit`).toBeGreaterThan(0)
      const ratio = sum(on.map((r) => r.profit)) / control
      if (ratio < HIRED_BAND[0] || ratio > HIRED_BAND[1]) bad.push(`${trade}: profit with the desk over without it is ${ratio.toFixed(3)}, outside ${HIRED_BAND[0]} to ${HIRED_BAND[1]}`)
      const flows = (sum(on.map((r) => r.income)) - sum(on.map((r) => r.costs))) / sum(on.map((r) => r.revenue))
      if (flows > FREE_MONEY) bad.push(`${trade}: the layer booked ${(flows * 100).toFixed(2)}% of revenue net of its costs, above ${FREE_MONEY * 100}%`)
    }
    // The CEO really worked a desk of every family (otherwise the checks above prove nothing).
    for (const family of ['food', 'care', 'util'] as const) {
      if (!(changes[family] && changes[family] > 0)) bad.push(`${family}: the hired CEO changed no lever in any run`)
    }
    expect(bad).toEqual([])
  }, TIMEOUT)
})

if (mine.length === 0 && slice.mode !== 'full') it('has no share in this slice', () => {})
