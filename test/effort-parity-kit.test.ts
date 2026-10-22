// R3-M0 (C.3): the parity oracle and its kit. test/fixtures/effort-parity.json holds what the research functions of v5.0.0 return
// over an input grid (seven systems), plus one scripted lifecycle per system, recorded on the unmodified code under Node 22 (the CI
// version). The migration tasks (R3-M2 to R3-M8) move each system onto the Effort engine and keep these numbers: the odds and
// the quality within 1 point, the years and the price exact, and the lifecycle (g.rng, the lines on sale, the levels) byte for byte.
//
// This file proves the kit itself (the grid vocabulary, the comparison, the recorder's guard) and then that today's code equals
// the file. On unmodified code it is green by construction. Recording is for the first task of the track only:
//
//   RECORD_EFFORT_PARITY=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/effort-parity-kit.test.ts
//
// Without the variable nothing is written, and a missing fixture is a failure that names this command. Never record to make a
// migration pass: a moved number is a change of balance, and moved-tests.md has a row for each one the owner agreed to.
//
// About 20 to 60 s on a free machine (it plays seven systems twice), so it is not in the fast tier.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  GRIDS,
  PARITY_DIGITS,
  PARITY_FILE,
  RECORD_COMMAND,
  SYSTEMS,
  TOL,
  compareParity,
  expectParity,
  gridHash,
  gridInputs,
  idOf,
  inputGrid,
  lifecycle,
  neutralAmbition,
  parseId,
  parityDiff,
  probe,
  readOracle,
  recordParity,
  roundSig,
  type Input,
  type Measure,
  type ParityRow,
  type SystemId,
} from './effort-parity-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TIMEOUT = 120_000
const RECORD = process.env.RECORD_EFFORT_PARITY === '1'

/** What the recorder computes, once for each system in this file (the second read is the determinism check). */
const memo = new Map<string, unknown>()
function once<T>(key: string, make: () => T): T {
  if (!memo.has(key)) memo.set(key, make())
  return memo.get(key) as T
}
const probed = (s: SystemId): ParityRow[] => once(`probe:${s}`, () => probe(s))
const lived = (s: SystemId) => once(`life:${s}`, () => lifecycle(s))

describe('the grid vocabulary', () => {
  it('inputGrid is the cartesian product, with the keys sorted and the first key varying slowest', () => {
    const grid = inputGrid({ skill: [20, 50], budget: [1, 2, 3] })
    expect(grid).toHaveLength(6)
    expect(grid.map((i) => Object.keys(i))).toEqual(Array(6).fill(['budget', 'skill']))
    expect(grid.map((i) => [i.budget, i.skill])).toEqual([
      [1, 20], [1, 50], [2, 20], [2, 50], [3, 20], [3, 50],
    ])
  })

  it('an id is the part and the sorted key=value pairs, and it parses back to the input', () => {
    const input: Input = { part: 'hired', skill: 20, trade: 'restaurant', owner: false, budget: 0.75 }
    const id = idOf(input)
    expect(id).toBe('hired|budget=0.75,owner=false,skill=20,trade=restaurant')
    expect(parseId(id)).toEqual(input)
    expect(parseId(idOf({ part: 'p' }))).toEqual({ part: 'p' })
  })

  it('roundSig keeps 9 significant digits of a float, an integer as it is, and a non-finite number untouched', () => {
    expect(PARITY_DIGITS).toBe(9)
    expect(roundSig(0.1234567891234)).toBe(0.123456789)
    expect(roundSig(1234.56789123456)).toBe(1234.56789)
    expect(roundSig(42)).toBe(42)
    expect(roundSig(0.1 + 0.2)).toBe(0.3)
    expect(Number.isNaN(roundSig(Number.NaN))).toBe(true)
    expect(roundSig(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('neutralAmbition sets willpower and discipline to 55 and touches nothing else', () => {
    const g = makeTestGame(1)
    const before = { ...g.character.hidden }
    neutralAmbition(g)
    expect(g.character.hidden).toEqual({ ...before, willpower: 55, discipline: 55 })
  })

  it('every system has a grid of unique, parseable ids', () => {
    expect(SYSTEMS).toEqual(['rd', 'heavy', 'ops', 'deeptech', 'aicaps', 'studio', 'workshop'])
    for (const s of SYSTEMS) {
      const ids = gridInputs(s).map(idOf)
      expect(ids.length, s).toBeGreaterThan(20)
      expect(new Set(ids).size, s).toBe(ids.length)
      for (const i of gridInputs(s)) expect(parseId(idOf(i)), idOf(i)).toEqual(i)
      expect(GRIDS[s].length, s).toBeGreaterThan(0)
    }
  })

  it('a grid hash moves when one axis loses a value', () => {
    const full = gridHash('ops')
    expect(full).toMatch(/^[0-9a-f]{8}$/)
    expect(gridHash('ops')).toBe(full)
    expect(gridHash('ops', gridInputs('ops').slice(1))).not.toBe(full)
  })
})

describe('the comparison', () => {
  const row = (over: Partial<ParityRow> = {}): ParityRow => ({ id: 'rd|a=1', input: { part: 'rd', a: 1 }, odds: 0.5, years: 2, quality: 60, cost: 10_000, ...over })

  it('equal rows have no difference', () => {
    expect(compareParity([row()], [row()])).toEqual([])
  })

  it('odds may move by 1 point and no more, quality by 1 point, the price by 1 dollar, and the years by nothing', () => {
    expect(compareParity([row()], [row({ odds: 0.5 + TOL.odds / 100 - 1e-9 })])).toEqual([])
    expect(compareParity([row()], [row({ odds: 0.5 + TOL.odds / 100 + 1e-4 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ quality: 60 + TOL.quality })])).toEqual([])
    expect(compareParity([row()], [row({ quality: 61.5 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ cost: 10_000 + TOL.usd })])).toEqual([])
    expect(compareParity([row()], [row({ cost: 10_002 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ years: 3 })])).toHaveLength(1)
    expect(compareParity([row()], [row({ years: 2.01 })])).toHaveLength(1)
  })

  it('a difference names the row, the field, and both values', () => {
    const [line] = compareParity([row()], [row({ odds: 0.62 })])
    expect(line).toContain('rd|a=1')
    expect(line).toContain('odds')
    expect(line).toContain('0.5')
    expect(line).toContain('0.62')
  })

  it('an extra number is judged by the unit in its name: .p odds, .q quality, .y years, .usd dollars, none exact', () => {
    const base = row({ extra: { 'm.p': 0.1, 'l.q': 30, 'h.y': 3, 'c.usd': 500, gain: 1.25 } })
    expect(compareParity([base], [row({ extra: { 'm.p': 0.1, 'l.q': 30.9, 'h.y': 3, 'c.usd': 500.9, gain: 1.25 } })])).toEqual([])
    expect(compareParity([base], [row({ extra: { 'm.p': 0.12, 'l.q': 30, 'h.y': 3, 'c.usd': 500, gain: 1.25 } })])).toHaveLength(1)
    expect(compareParity([base], [row({ extra: { 'm.p': 0.1, 'l.q': 30, 'h.y': 4, 'c.usd': 500, gain: 1.25 } })])).toHaveLength(1)
    expect(compareParity([base], [row({ extra: { 'm.p': 0.1, 'l.q': 30, 'h.y': 3, 'c.usd': 500, gain: 1.26 } })])).toHaveLength(1)
    expect(compareParity([base], [row({ extra: { 'm.p': 0.1, 'l.q': 30, 'h.y': 3, 'c.usd': 500 } })])).toHaveLength(1)
  })

  it('a missing row, a surplus row and a row with a missing field are differences', () => {
    expect(compareParity([row(), row({ id: 'rd|a=2' })], [row()])).toHaveLength(1)
    expect(compareParity([row()], [row(), row({ id: 'rd|a=2' })])).toHaveLength(1)
    expect(compareParity([row()], [row({ odds: undefined })])).toHaveLength(1)
    expect(compareParity([row({ odds: undefined })], [row()])).toHaveLength(1)
  })

  it('a slack lets one row sit above the oracle by that many odds points, never below it', () => {
    const slack = () => TOL.topCeoSlack
    expect(compareParity([row()], [row({ odds: 0.5 + TOL.topCeoSlack / 100 })], TOL, slack)).toEqual([])
    expect(compareParity([row()], [row({ odds: 0.5 + (TOL.topCeoSlack + 2) / 100 })], TOL, slack)).toHaveLength(1)
    expect(compareParity([row()], [row({ odds: 0.5 - (TOL.odds + 2) / 100 })], TOL, slack)).toHaveLength(1)
  })
})

describe('the recorder', () => {
  it.skipIf(RECORD)('refuses to write without RECORD_EFFORT_PARITY=1, and says what to run', () => {
    expect(() => recordParity()).toThrow(/RECORD_EFFORT_PARITY=1/)
  })

  it.runIf(RECORD)('records the oracle on this code', { timeout: 600_000 }, () => {
    recordParity()
    expect(existsSync(join(ROOT, PARITY_FILE))).toBe(true)
  })
})

describe('the oracle file', () => {
  it('exists, and a missing file names the command that records it', () => {
    if (!existsSync(join(ROOT, PARITY_FILE))) expect.fail(`${PARITY_FILE} is missing: ${RECORD_COMMAND}`)
  })

  it('names the Node and the commit it was recorded on, and holds the seven systems', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, PARITY_FILE), 'utf8')) as { v: number; node: string; head: string; digits: number; systems: Record<string, unknown> }
    expect(raw.v).toBe(1)
    expect(raw.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(raw.head).toMatch(/^[0-9a-f]{7,40}$/)
    expect(raw.digits).toBe(PARITY_DIGITS)
    expect(Object.keys(raw.systems)).toEqual([...SYSTEMS])
  })

  it.each(SYSTEMS)('%s: the grid cannot have shrunk, and every row has its numbers', (s) => {
    const o = readOracle(s)
    expect(o.gridHash).toBe(gridHash(s))
    expect(o.rows.map((r) => r.id)).toEqual(gridInputs(s).map(idOf))
    for (const r of o.rows) {
      expect(r.input, r.id).toEqual(parseId(r.id))
      const measures = [r.odds, r.years, r.quality, r.cost, ...Object.values(r.extra ?? {})].filter((v) => v !== undefined)
      expect(measures.length, r.id).toBeGreaterThan(0)
      for (const v of measures) expect(Number.isFinite(v), r.id).toBe(true)
      if (r.odds !== undefined) expect(r.odds >= 0 && r.odds <= 1, r.id).toBe(true)
    }
    expect(o.lifecycle.digest, s).toMatch(/^[0-9a-f]{8}$/)
  })

  it('holds 2,500 to 5,000 rows in all, and the grid sizes the plan names', () => {
    const size = (s: SystemId) => readOracle(s).rows.length
    const total = SYSTEMS.reduce((n, s) => n + size(s), 0)
    expect(total).toBeGreaterThanOrEqual(2_500)
    expect(total).toBeLessThanOrEqual(5_000)
    expect(size('workshop')).toBeGreaterThanOrEqual(1_080)
    expect(size('ops')).toBe(162)
    expect(size('heavy')).toBe(27)
  })

  it('never uses a pinned seed: the fixture has no seed field', () => {
    expect(readFileSync(join(ROOT, PARITY_FILE), 'utf8')).not.toMatch(/"seed"\s*:/)
  })
})

describe('today\'s code against the file', () => {
  it('expectParity takes a measure: the recorded numbers pass, and one moved row is reported by name', { timeout: TIMEOUT }, () => {
    expect(() => expectParity('ops', () => ({ odds: 0.9 }))).toThrow(/^ops: \d+ differences in 162 rows/)
    const rows = new Map(readOracle('workshop').rows.map((r) => [r.id, r]))
    const recorded: Measure = (_pt, i) => {
      const { id: _id, input: _input, ...numbers } = rows.get(idOf(i))!
      return numbers
    }
    expect(() => expectParity('workshop', recorded)).not.toThrow()
    const target = idOf(gridInputs('workshop')[0])
    const moved: Measure = (pt, i) => ({ ...recorded(pt, i), ...(idOf(i) === target ? { odds: 0.9 } : {}) })
    expect(() => expectParity('workshop', moved)).toThrow(new RegExp(`^workshop: 1 difference in 1224 rows\\n${target.replace(/\|/g, '\\|')}`))
  })

  it.each(SYSTEMS)('%s: the research functions return the recorded numbers (probe twice, the same rows)', { timeout: TIMEOUT }, (s) => {
    const a = probed(s)
    expect(a.length).toBeGreaterThan(20)
    expect(probe(s)).toEqual(a)
    expect(parityDiff(s, a)).toEqual([])
    expectParity(s)
  })

  it.each(SYSTEMS)('%s: the scripted lifecycle leaves g.rng and what it made as recorded (run twice, the same)', { timeout: TIMEOUT }, (s) => {
    const a = lived(s)
    expect(lifecycle(s)).toEqual(a)
    expect(a.digest).toBe(readOracle(s).lifecycle.digest)
    expect(a.facts).toEqual(readOracle(s).lifecycle.facts)
  })

  it('the lifecycles cover a win and a loss where the system has both', { timeout: TIMEOUT }, () => {
    for (const s of ['rd', 'deeptech', 'aicaps'] as const) {
      const f = lived(s).facts as { won: number; lost: number }
      expect(f.won, s).toBeGreaterThan(0)
      expect(f.lost, s).toBeGreaterThan(0)
    }
  })
})
