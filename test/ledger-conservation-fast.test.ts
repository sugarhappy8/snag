// ci: fast
// R2-L5 (A.K1 d): the fast tier of the conservation probe. The sliced tier (test/ledger-conservation.test.ts) plays 40 lives of
// 100 years; this file proves the judge on synthetic rows, the kit's own measuring (drift, the reason set, the largest yearly
// mint), the wiring of the books into the fuzzer's invariants, and plays three real lives of 100 years with heirs.
//
// What each real life must show: no fuzz failure (the fuzzer now runs the ledger check after every step), at most 3,000 bookings
// a year, no yearly mint over its cap (the lending mint at most a quarter of it), and no `heal`. The drift of the player's cash is
// printed, not asserted: every site that still writes cash by hand shows up in it until the migration batches land.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { addMoney } from '../src/game/core'
import { bookMint } from '../src/game/kernel/ledger'
import { MINTS } from '../src/game/kernel/reasons'
import type { GameState } from '../src/game/types'
import '../src/game/world/shards'
import { FailureLog, fuzzLife, ledgerStatsOf, newLedgerWatch, watchLedger, type LedgerStats, DEFAULT_OPTIONS } from './fuzz-kit'
import { makeTestGame } from './helpers'
import {
  BOOKINGS_PER_YEAR,
  driftReport,
  FLOORS,
  judge,
  LEDGER_SEEDS,
  PROBE_ACTIONS,
  PROBE_HEIRS,
  PROBE_YEARS,
  runLedgerLife,
  type LedgerLifeRow,
} from './ledger-probe'
import { ROOT } from './scan-kit'

// The fuzzer's invariants call ledgerProblems(g) from this module; the wiring test below swaps what it answers.
let planted: ((g: GameState) => string[]) | null = null
vi.mock('../src/game/kernel/ledger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/kernel/ledger')>()
  return { ...real, ledgerProblems: (g: GameState) => (planted ? planted(g) : real.ledgerProblems(g)) }
})

const REASONS_24 = ['benefit', 'claim', 'dividend', 'fine', 'health', 'inflation', 'leisure', 'living', 'loan.interest', 'loan.principal', 'loan.repay', 'pension', 'premium', 'property.buy', 'property.sell', 'purchase', 'rent', 'sales', 'tax.income', 'tax.property', 'trade.buy', 'trade.sell', 'tuition', 'wage']

/** A row that passes `judge` on its own. */
function row(seed: number, over: Partial<LedgerLifeRow> = {}, ledger: Partial<LedgerStats> = {}): LedgerLifeRow {
  return {
    seed,
    years: 100,
    generations: 2,
    ms: 1000,
    failures: [],
    ledger: {
      sum: 3_000_000,
      mint: { lending: 4_000_000 },
      burn: { inflation: 1_000_000 },
      accounts: 60,
      flowRows: 90,
      bookings: 1_500,
      maxYearMint: { lending: 900_000 },
      reasons: REASONS_24.slice(seed % 12, (seed % 12) + 12),
      drift: 0,
      firstDrift: null,
      ...ledger,
    },
    ...over,
  }
}

/** 40 rows that pass `judge` merged. */
function goodSet(): LedgerLifeRow[] {
  return LEDGER_SEEDS.map((s) => row(s))
}

describe('the probe knobs', () => {
  it('plays 40 seeds for 100 years with two heirs, and the one knob the lead may lower is a small number', () => {
    expect(LEDGER_SEEDS).toHaveLength(40)
    expect(LEDGER_SEEDS[0]).toBe(101)
    expect(LEDGER_SEEDS[39]).toBe(140)
    expect(new Set(LEDGER_SEEDS).size).toBe(40)
    expect(PROBE_YEARS).toBe(100)
    expect(PROBE_HEIRS).toBe(2)
    expect(PROBE_ACTIONS).toBeGreaterThanOrEqual(1)
    expect(PROBE_ACTIONS).toBeLessThanOrEqual(2)
    expect(BOOKINGS_PER_YEAR).toBe(3_000)
  })
})

describe('judge on synthetic rows', () => {
  it('passes a good row and a good set', () => {
    expect(judge([row(101)])).toEqual([])
    expect(judge(goodSet(), { merged: true })).toEqual([])
  })

  it('names a row with a fuzz failure, with its seed', () => {
    const out = judge([row(107, { failures: ['[invariant] seed 107: ledger: heal 5: the books had to be repaired'] })])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('107')
    expect(out[0]).toContain('the books had to be repaired')
  })

  it('names a row that books more than 3,000 times a year', () => {
    expect(judge([row(101, {}, { bookings: 300_000 })])).toEqual([])
    const out = judge([row(101, {}, { bookings: 300_001 })])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('101')
    expect(out[0]).toMatch(/booking/)
    // A life that never aged is held to one year, not exempt.
    expect(judge([row(102, { years: 0 }, { bookings: 3_001 })])).toHaveLength(1)
    expect(judge([row(102, { years: 0 }, { bookings: 3_000 })])).toEqual([])
  })

  it('names a yearly mint over its cap, and a lending mint over a quarter of it', () => {
    const cap = MINTS.lending.cap
    expect(judge([row(101, {}, { maxYearMint: { lending: cap / 4 } })])).toEqual([])
    const quarter = judge([row(101, {}, { maxYearMint: { lending: cap / 4 + 1 } })])
    expect(quarter).toHaveLength(1)
    expect(quarter[0]).toMatch(/lending/)
    const over = judge([row(101, {}, { maxYearMint: { immigrants: MINTS.immigrants.cap + 1 } })])
    expect(over).toHaveLength(1)
    expect(over[0]).toMatch(/immigrants/)
    // printing has a cap of 0: any mint is over it.
    expect(judge([row(101, {}, { maxYearMint: { printing: 1 } })])).toHaveLength(1)
    // a mint that is not declared at all is a problem too, heal aside (that has its own message).
    expect(judge([row(101, {}, { maxYearMint: { counterfeit: 5 } })])).toHaveLength(1)
  })

  it('names a row whose books had to be healed', () => {
    for (const ledger of [{ mint: { lending: 10, heal: 5 } }, { burn: { inflation: 10, heal: 1 } }]) {
      const out = judge([row(101, {}, ledger)])
      expect(out.length).toBeGreaterThan(0)
      expect(out.join('\n')).toMatch(/heal/)
    }
    expect(judge([row(101, {}, { mint: { lending: 10, heal: 0 } })])).toEqual([])
  })

  it('holds a merged set to 40 rows, 34 whole lives, enough bookings, enough reasons, a lending mint and an inflation burn', () => {
    const must = (rows: LedgerLifeRow[], re: RegExp): void => {
      const out = judge(rows, { merged: true })
      expect(out.length, `no problem for ${re}`).toBeGreaterThan(0)
      expect(out.join('\n')).toMatch(re)
    }
    expect(FLOORS).toMatchObject({ lives: 40, whole: 34, wholeYears: 90 })
    must(goodSet().slice(0, 39), /40/)
    // 34 whole lives pass, 33 do not.
    const rows34 = goodSet().map((r, i) => (i < 6 ? { ...r, years: 60 } : r))
    expect(judge(rows34, { merged: true })).toEqual([])
    must(goodSet().map((r, i) => (i < 7 ? { ...r, years: 60 } : r)), /90 years/)
    // Bookings: exactly the floor passes, one fewer does not.
    const each = FLOORS.bookings / FLOORS.lives
    expect(Number.isInteger(each)).toBe(true)
    const small = goodSet().map((r) => row(r.seed, {}, { bookings: each }))
    expect(judge(small, { merged: true })).toEqual([])
    must(small.map((r, i) => (i === 0 ? row(r.seed, {}, { bookings: each - 1 }) : r)), /bookings/)
    // Reasons: the union must reach the floor.
    must(goodSet().map((r) => row(r.seed, {}, { reasons: REASONS_24.slice(0, FLOORS.reasons - 1) })), /reasons/)
    expect(judge(goodSet().map((r) => row(r.seed, {}, { reasons: REASONS_24.slice(0, FLOORS.reasons) })), { merged: true })).toEqual([])
    must(goodSet().map((r) => row(r.seed, {}, { mint: { immigrants: 10 } })), /lending/)
    must(goodSet().map((r) => row(r.seed, {}, { burn: { writeoff: 10 } })), /inflation/)
    // Per-row problems still show in a merged set.
    const rows = goodSet()
    rows[3] = row(rows[3].seed, { failures: ['boom'] })
    expect(judge(rows, { merged: true }).join('\n')).toContain('boom')
  })

  it('keeps the floors no higher than the plan asked for', () => {
    // 40,000 bookings and 20 reasons are the plan's targets, and the floors (see FLOORS): the migrated engine measured 53,456 and 54.
    expect(FLOORS.bookings).toBeLessThanOrEqual(40_000)
    expect(FLOORS.reasons).toBeLessThanOrEqual(20)
    expect(FLOORS.bookings).toBeGreaterThan(0)
    expect(FLOORS.reasons).toBeGreaterThan(0)
  })

  it('holds the floors at the plan\'s targets, not under them: a probe whose migrated sites stopped booking must fail', () => {
    expect(FLOORS.bookings).toBeGreaterThanOrEqual(40_000)
    expect(FLOORS.reasons).toBeGreaterThanOrEqual(20)
    // A set at the 6,000 bookings and 4 reasons the probe was first written with is not enough any more.
    const thin = goodSet().map((r) => row(r.seed, {}, { bookings: 150, reasons: REASONS_24.slice(0, 4) }))
    const out = judge(thin, { merged: true }).join('\n')
    expect(out).toMatch(/bookings in all/)
    expect(out).toMatch(/different reasons/)
  })

  it('does not hold a part of the set to the totals', () => {
    expect(judge(goodSet().slice(0, 2))).toEqual([])
    expect(judge([])).toEqual([])
  })

  it('reports drift with the largest life and the total, and asserts nothing about it', () => {
    const rows = [row(101, {}, { drift: 0 }), row(102, {}, { drift: 1_250, firstDrift: { year: 1990, age: 34, delta: 1_000 } }), row(103, {}, { drift: 250 })]
    const text = driftReport(rows)
    expect(text).toContain('1,500')
    expect(text).toContain('102')
    expect(text).toContain('1990')
    expect(judge(rows)).toEqual([])
    expect(driftReport([row(101)])).toMatch(/no drift/)
  })
})

describe('the kit measures the books of a life', () => {
  it('sees an unbooked write as drift and a booked one as none', () => {
    const g = makeTestGame(1, { money: 1_000, age: 30 })
    const w = newLedgerWatch()
    watchLedger(w, g, 'start')
    addMoney(g, 500, 'wage')
    g.year += 1
    g.character.age += 1
    watchLedger(w, g, 'year')
    expect(ledgerStatsOf(w, g).drift).toBe(0)
    expect(ledgerStatsOf(w, g).firstDrift).toBeNull()
    g.character.money += 700 // a raw write: nothing books it
    g.year += 1
    g.character.age += 1
    watchLedger(w, g, 'year')
    const s = ledgerStatsOf(w, g)
    expect(s.drift).toBe(700)
    expect(s.firstDrift).toEqual({ year: g.year, age: 32, delta: 700 })
    // A later one does not move firstDrift, and a write down counts as much as one up (the total is absolute).
    g.character.money -= 300
    g.year += 1
    watchLedger(w, g, 'year')
    expect(ledgerStatsOf(w, g).drift).toBe(1_000)
    expect(ledgerStatsOf(w, g).firstDrift?.delta).toBe(700)
  })

  it('ignores a gap under a dollar, which the wrappers close at the next call', () => {
    const g = makeTestGame(1, { money: 1_000.4, age: 30 })
    const w = newLedgerWatch()
    watchLedger(w, g, 'start')
    g.year += 1
    watchLedger(w, g, 'year')
    addMoney(g, 0, 'purchase') // rounds the cash to 1,000 and books the 0.4
    g.year += 1
    watchLedger(w, g, 'year')
    expect(ledgerStatsOf(w, g).drift).toBe(0)
  })

  it('does not count the opening balance of an heir, whose account is another one', () => {
    const g = makeTestGame(1, { money: 1_000, age: 70 })
    const w = newLedgerWatch()
    watchLedger(w, g, 'start')
    g.character.id = 'heir-1'
    g.character.money = 250_000 // what continueAsChild hands over: not a flow of the new account
    watchLedger(w, g, 'heir')
    addMoney(g, 50, 'wage')
    g.year += 1
    watchLedger(w, g, 'year')
    expect(ledgerStatsOf(w, g).drift).toBe(0)
    g.character.money += 9 // but a raw write after the hand-over is
    g.year += 1
    watchLedger(w, g, 'year')
    expect(ledgerStatsOf(w, g).drift).toBe(9)
  })

  it('keeps the largest single-year mint, the reasons that had a flow, and the end totals', () => {
    const g = makeTestGame(1, { money: 0, age: 30 })
    const w = newLedgerWatch()
    watchLedger(w, g, 'start')
    for (const [mint, spendNow] of [[1_000_000, 100], [2_000_000, 200], [500_000, 300]]) {
      addMoney(g, mint, 'loan.principal')
      addMoney(g, spendNow, 'wage')
      addMoney(g, -50, 'tax.income')
      g.year += 1
      watchLedger(w, g, 'year')
    }
    bookMint(g, 'revaluation', 'pool:other', 7, 'inflation')
    const s = ledgerStatsOf(w, g)
    expect(s.maxYearMint).toEqual({ lending: 2_000_000 })
    expect(s.reasons).toEqual(['loan.principal', 'tax.income', 'wage'])
    expect(s.mint.lending).toBe(3_500_000)
    expect(s.mint.revaluation).toBe(7)
    expect(s.accounts).toBeGreaterThan(2)
    expect(s.bookings).toBe(9 + 1)
    expect(s.sum).toBe(3_500_000 + 7 + 0)
    expect(s.drift).toBe(0)
  })
})

describe('the books are part of the fuzzer', () => {
  it('fails a life whenever the ledger check reports a problem, naming it', async () => {
    planted = () => ['planted: the books are off']
    try {
      const log = new FailureLog()
      await fuzzLife(LEDGER_SEEDS[0], log, { ...DEFAULT_OPTIONS, maxYears: 0, timeMachine: false })
      const hit = log.list().find((f) => f.first.kind === 'invariant' && f.first.message.includes('ledger: planted: the books are off'))
      expect(hit, 'a ledger problem becomes an invariant failure').toBeDefined()
    } finally {
      planted = null
    }
  })

  it('books the rich boost, so that it is not drift', () => {
    const src = readFileSync(join(ROOT, 'test', 'fuzz-kit.ts'), 'utf8')
    expect(src).toMatch(/addMoney\(g, richAmount, 'prize'\)/)
    expect(src).not.toMatch(/money \+= richAmount/)
  })
})

describe('three real lives of 100 years with heirs', () => {
  for (const seed of LEDGER_SEEDS.slice(0, 3)) {
    it(`plays seed ${seed} to the end with the books balanced`, async () => {
      const r = await runLedgerLife(seed, { actionsPerYear: 1 })
      console.info(`ledger probe fast: seed ${seed} ${r.years} years, ${r.generations} generations, ${r.ledger.bookings} bookings, ${r.ledger.reasons.length} reasons, ${(r.ms / 1000).toFixed(1)} s\n${driftReport([r])}`)
      expect(r.years).toBeGreaterThan(0)
      expect(r.ledger.bookings).toBeGreaterThan(0)
      expect(r.ledger.reasons.length).toBeGreaterThan(0)
      expect(judge([r])).toEqual([])
    }, 300_000)
  }
})
