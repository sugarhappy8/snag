// The stored lab (BizState.lab): hostile values load clean and capped, an absent lab stays absent, a
// populated one survives a save and a reload, readLab caches by identity and never writes.
import { describe, expect, it } from 'vitest'
import { valuationOf } from '../src/game/business/economy'
import { OPS_PROGRAMS, opsProgram } from '../src/game/business/lab-data'
import { draftLab, labIncomeIn, labPayrollIn, labSplit, labValue, LAB_LIMITS, LAB_TRACKS, readLab, saveLab, type LabState } from '../src/game/business/lab-state'
import { bizOf, normalizeBiz, readBiz } from '../src/game/business/state'
import type { Json } from '../src/game/types'
import { deepFreeze, labGame, patchLab } from './lab-kit'

const NAME_100 = 'x'.repeat(100)

/** A lab that breaks every rule at once. */
function hostile(): Record<string, unknown> {
  return {
    v: 'x',
    levels: { cost: { v: 9, at: 2031 }, yield: { v: 'x', at: 'y' }, quality: { v: 0.5, at: 99999 } },
    runs: { cost: 400, yield: -3, quality: 'a' },
    done: { 'ops.cost.1': 2031, 'ops.cost.2': Number.NaN, 'ops.cost.3': 9999, nope: 2030, constructor: 2030 },
    programs: [
      { id: 'nope' },
      { id: 'ops.cost.1', started: 2031, years: 99, progress: 99, odds: 7, price: -5, grant: Number.NaN },
      { id: 'ops.cost.2', started: 2031, years: 2, progress: 0, odds: 0.5, price: 10, grant: 0 },
      { id: 'ops.yield.1', started: 'x', years: 1 },
      { id: 'ops.yield.2', started: 2030, years: 1.4, progress: -2, odds: Number.NaN, price: Infinity, grant: 5 },
      { id: 'ops.quality.3', started: 2030, years: 3, progress: 1, odds: 0.4, price: 5, grant: 1 },
      { id: 'ops.quality.1', started: 2030, years: 1, progress: 0, odds: 0.4, price: 5, grant: 1 },
      7,
      null,
      'x',
    ],
    team: [Number.NaN, 2031, 'a', 5000, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037],
    patents: [
      ...Array.from({ length: 1000 }, (_, i) => ({
        family: `Family ${i}`,
        filed: 2030,
        until: i % 3 === 0 ? 2030 : 2036,
        mode: i % 2 ? 'license' : 'hold',
        lic: i % 2 ? 2031 : 0,
        plan: i % 5 === 0 ? Number.NaN : 50_000,
        book: 30_000,
        earned: -4,
      })),
      { family: NAME_100, filed: 2030, until: 2036 },
      5,
      'x',
      null,
    ],
    filed: Array.from({ length: 100 }, (_, i) => `Name ${i}`),
    due: { grant: -5 },
    booked: 'x',
    stepped: 1e12,
    lastGrant: -4,
    ledger: [
      ...Array.from({ length: 50 }, (_, i) => ({ year: 2000 + i, credit: i % 2 ? Number.NaN : 10, grant: 0, royalty: 0, payroll: 0 })),
      { year: 2031, credit: -1, grant: 0, royalty: 0, payroll: 0 },
      { year: 2031, credit: 5, grant: 1, royalty: 2, payroll: 3 },
      { year: 'x' },
    ],
  }
}

/** Paths of every number that is not finite. */
function nonFinite(v: unknown, path = 'lab'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}

const inYears = (y: number) => y >= 1800 && y <= 2300
const markerOk = (y: number) => y === 0 || inYears(y)

/** Every rule of a read lab. */
function check(st: LabState): void {
  expect(st.v).toBe(1)
  expect(nonFinite(st)).toEqual([])
  expect(st.programs.length).toBeLessThanOrEqual(LAB_LIMITS.programs)
  const tracks = st.programs.map((p) => opsProgram(p.id)?.track)
  expect(tracks.every((t) => !!t)).toBe(true)
  expect(new Set(tracks).size).toBe(tracks.length)
  for (const p of st.programs) {
    expect(inYears(p.started)).toBe(true)
    expect(p.years).toBeGreaterThanOrEqual(1)
    expect(p.years).toBeLessThanOrEqual(4)
    expect(p.progress).toBeGreaterThanOrEqual(0)
    expect(p.progress).toBeLessThanOrEqual(p.years)
    expect(p.odds).toBeGreaterThan(0)
    expect(p.odds).toBeLessThan(1)
    expect(p.price).toBeGreaterThanOrEqual(0)
    expect(p.grant).toBeGreaterThanOrEqual(0)
  }
  expect(st.team.length).toBeLessThanOrEqual(LAB_LIMITS.team)
  expect(st.team.every(inYears)).toBe(true)
  expect(st.patents.length).toBeLessThanOrEqual(LAB_LIMITS.patents)
  for (const p of st.patents) {
    expect(p.family.length).toBeGreaterThan(0)
    expect(p.family.length).toBeLessThanOrEqual(LAB_LIMITS.family)
    expect(inYears(p.filed)).toBe(true)
    expect(inYears(p.until)).toBe(true)
    expect(p.until).toBeGreaterThan(p.filed)
    expect(p.mode === 'hold' || p.mode === 'license').toBe(true)
    expect(markerOk(p.lic)).toBe(true)
    expect(p.mode === 'license' ? p.lic > 0 : p.lic === 0).toBe(true)
    for (const m of [p.plan, p.book, p.earned]) expect(m).toBeGreaterThanOrEqual(0)
  }
  expect(st.filed.length).toBeLessThanOrEqual(LAB_LIMITS.filed)
  expect(new Set(st.filed).size).toBe(st.filed.length)
  expect(st.filed.every((f) => f.length > 0 && f.length <= LAB_LIMITS.family)).toBe(true)
  expect(st.ledger.length).toBeLessThanOrEqual(LAB_LIMITS.ledger)
  expect(new Set(st.ledger.map((r) => r.year)).size).toBe(st.ledger.length)
  for (const r of st.ledger) {
    expect(inYears(r.year)).toBe(true)
    for (const m of [r.credit, r.grant, r.royalty, r.payroll]) expect(m).toBeGreaterThanOrEqual(0)
  }
  for (const t of LAB_TRACKS) {
    expect(st.levels[t].v).toBeGreaterThanOrEqual(0)
    expect(st.levels[t].v).toBeLessThanOrEqual(0.95)
    expect(markerOk(st.levels[t].at)).toBe(true)
    expect(st.runs[t]).toBeGreaterThanOrEqual(0)
    expect(st.runs[t]).toBeLessThanOrEqual(LAB_LIMITS.runs)
  }
  const known = new Set(OPS_PROGRAMS.map((p) => p.id))
  for (const [id, y] of Object.entries(st.done)) {
    expect(known.has(id)).toBe(true)
    expect(inYears(y)).toBe(true)
  }
  expect(Object.keys(st.done).length).toBeLessThanOrEqual(LAB_LIMITS.done)
  expect(st.due.grant).toBeGreaterThanOrEqual(0)
  for (const y of [st.booked, st.stepped, st.lastGrant]) expect(markerOk(y)).toBe(true)
}

describe('the stored lab reads clean', () => {
  it('reads hostile lab values clean and capped [RF1]', () => {
    const empty = readLab({})
    for (const junk of [7, 'x', [], null, true, { levels: 'x', runs: 5, done: [], programs: 'x', team: {}, patents: 3, filed: 'x', due: 'x', ledger: 'x' }]) {
      const st = readLab({ lab: junk as unknown as Json })
      check(st)
      expect(st).toEqual(empty)
      expect(Object.isFrozen(st)).toBe(true)
    }
    const st = readLab({ lab: hostile() as unknown as Json })
    check(st)
    expect(st.levels.cost).toEqual({ v: 0.95, at: 2031 })
    expect(st.levels.yield).toEqual({ v: 0, at: 0 })
    expect(st.levels.quality).toEqual({ v: 0, at: 0 })
    expect(st.runs).toEqual({ cost: 12, yield: 0, quality: 0 })
    expect(st.done).toEqual({ 'ops.cost.1': 2031 })
    expect(st.programs.map((p) => p.id)).toEqual(['ops.cost.1', 'ops.yield.2', 'ops.quality.3'])
    expect(st.programs[0]).toMatchObject({ started: 2031, years: 4, progress: 4, odds: 0.98, price: 0, grant: 0 })
    expect(st.programs[1]).toMatchObject({ started: 2030, years: 1, progress: 0, odds: 0.5 })
    expect(st.team).toEqual([2030, 2031, 2031, 2032, 2033, 2034])
    expect(st.patents.map((p) => p.family)).toEqual(['Family 1', 'Family 2', 'Family 4', 'Family 5', 'Family 7', 'Family 8'])
    expect(st.patents[0]).toMatchObject({ mode: 'license', lic: 2031, plan: 50_000, book: 30_000, earned: 0 })
    expect(st.patents[1]).toMatchObject({ mode: 'hold', lic: 0 })
    expect(st.patents[3].plan).toBe(0)
    expect(st.filed).toHaveLength(40)
    expect(st.filed[39]).toBe('Name 99')
    expect(st.due.grant).toBe(0)
    expect([st.booked, st.stepped, st.lastGrant]).toEqual([0, 0, 0])
    expect(st.ledger.map((r) => r.year)).toEqual([2042, 2044, 2046, 2048])
  })

  it('drops a family of 100 characters and a patent that ends before it starts', () => {
    const st = readLab({ lab: { patents: [{ family: NAME_100, filed: 2030, until: 2036 }, { family: 'Ok', filed: 2030, until: 2030 }, { family: 'Fine', filed: 2030, until: 2035 }], filed: [NAME_100, 'Fine', 'Fine'] } as unknown as Json })
    expect(st.patents.map((p) => p.family)).toEqual(['Fine'])
    expect(st.filed).toEqual(['Fine'])
  })

  it('keeps the newest ledger row of a year and the last four years', () => {
    const rows = [2028, 2029, 2030, 2031, 2032].map((year) => ({ year, credit: 100 + year, grant: 0, royalty: 0, payroll: 0 }))
    rows.push({ year: 2031, credit: 7, grant: 1, royalty: 2, payroll: 3 })
    const st = readLab({ lab: { ledger: rows } as unknown as Json })
    expect(st.ledger.map((r) => r.year)).toEqual([2029, 2030, 2031, 2032])
    expect(st.ledger[2]).toEqual({ year: 2031, credit: 7, grant: 1, royalty: 2, payroll: 3 })
  })

  it('an absent lab stays absent through normalizeBiz, bizOf and readBiz [RF1]', () => {
    const { g, a, b } = labGame(1, 'restaurant')
    expect('lab' in b).toBe(false)
    expect('lab' in readBiz(g, a)).toBe(false)
    expect('lab' in bizOf(g, a)).toBe(false)
    const json = JSON.parse(JSON.stringify(a.details)) as Record<string, Json>
    expect('lab' in normalizeBiz(json, g.year)).toBe(false)
    for (const junk of [7, 'x', [], null, true]) expect('lab' in normalizeBiz({ ...json, lab: junk }, g.year), String(junk)).toBe(false)
    expect(normalizeBiz({ ...json, lab: {} }, g.year).lab).toEqual({})
    expect(readLab(normalizeBiz({ ...json, lab: hostile() as unknown as Json }, g.year))).toEqual(readLab({ lab: hostile() as unknown as Json }))
  })

  it('a lab round-trips through normalizeBiz and JSON unchanged', () => {
    const { g, a, b } = labGame(2, 'brewery')
    patchLab(b, (d) => {
      d.levels.cost = { v: 0.4, at: 2031 }
      d.levels.quality = { v: 0.2, at: 2030 }
      d.runs.cost = 2
      d.done['ops.cost.1'] = 2030
      d.programs.push({ id: 'ops.yield.1', started: 2031, years: 2, progress: 1, odds: 0.62, price: 57_000, grant: 4_000 })
      d.team = [2029, 2031]
      d.patents.push({ family: 'Amber Ale', filed: 2031, until: 2037, mode: 'hold', lic: 0, plan: 60_000, book: 36_000, earned: 0 })
      d.filed = ['Amber Ale']
      d.due.grant = 4_000
      d.booked = 2030
      d.stepped = 2030
      d.lastGrant = 2031
      d.ledger = [{ year: 2030, credit: 3_000, grant: 0, royalty: 0, payroll: 1_000 }]
    })
    const original = JSON.parse(JSON.stringify(readLab(b))) as LabState
    const reloaded = normalizeBiz(JSON.parse(JSON.stringify(a.details)) as Record<string, Json>, g.year)
    expect(readLab(reloaded)).toEqual(original)
    expect(JSON.parse(JSON.stringify(reloaded.lab))).toEqual(original)
  })

  it('saveLab stores a new object and readLab caches by identity', () => {
    const { b } = labGame(3, 'restaurant')
    patchLab(b, (d) => {
      d.team = [2030]
    })
    const first = b.lab
    const read = readLab(b)
    expect(readLab(b)).toBe(read)
    expect(Object.isFrozen(read)).toBe(true)
    expect(Object.isFrozen(read.team)).toBe(true)
    const d = draftLab(b)
    d.team.push(2031)
    expect(readLab(b).team).toEqual([2030])
    saveLab(b, d)
    expect(b.lab).not.toBe(first)
    expect(b.lab).not.toBe(d)
    expect(readLab(b)).not.toBe(read)
    expect(readLab(b).team).toEqual([2030, 2031])
    expect(readLab({ lab: first }).team).toEqual([2030])
    expect(readLab({ lab: first })).toBe(read)
    d.team.push(2032)
    expect(readLab(b).team).toEqual([2030, 2031])
  })

  it('reads a deep-frozen company without throwing [RF1]', () => {
    const { g, a, b } = labGame(4, 'restaurant')
    patchLab(b, (d) => {
      d.team = [2030]
      d.patents.push({ family: 'Fried Rice', filed: 2031, until: 2037, mode: 'hold', lic: 0, plan: 50_000, book: 30_000, earned: 0 })
      d.ledger = [{ year: 2031, credit: 1_000, grant: 500, royalty: 200, payroll: 300 }]
    })
    deepFreeze(a)
    expect(() => {
      readLab(b)
      readBiz(g, a)
      draftLab(b)
      labIncomeIn(b, 2031)
      labPayrollIn(b, 2031)
      labValue(b)
      labSplit(b, { year: 2031, otherIncome: 5_000 }, 0)
      valuationOf(b)
    }).not.toThrow()
  })
})

describe('the lab readers', () => {
  it('income, payroll and value read the ledger and the patent book', () => {
    const { b } = labGame(5, 'restaurant')
    expect([labIncomeIn(b, 2031), labPayrollIn(b, 2031), labValue(b)]).toEqual([0, 0, 0])
    patchLab(b, (d) => {
      d.ledger = [{ year: 2031, credit: 1_000, grant: 500, royalty: 200, payroll: 300 }]
      d.patents = [
        { family: 'A', filed: 2031, until: 2037, mode: 'hold', lic: 0, plan: 50_000, book: 30_000, earned: 0 },
        { family: 'B', filed: 2031, until: 2037, mode: 'hold', lic: 0, plan: 20_000, book: 12_000, earned: 0 },
      ]
    })
    expect(labIncomeIn(b, 2031)).toBe(1_700)
    expect(labIncomeIn(b, 2030)).toBe(0)
    expect(labPayrollIn(b, 2031)).toBe(300)
    expect(labValue(b)).toBe(42_000)
  })

  it("splits other income into the lab's lines and clips them to what is left", () => {
    const { b } = labGame(6, 'restaurant')
    patchLab(b, (d) => {
      d.ledger = [{ year: 2031, credit: 1_000, grant: 500, royalty: 200, payroll: 0 }]
    })
    expect(labSplit(b, { year: 2031, otherIncome: 5_000 }, 0)).toEqual({ grants: 1_500, royalty: 200 })
    expect(labSplit(b, { year: 2031, otherIncome: 5_000 }, 3_600)).toEqual({ grants: 1_400, royalty: 0 })
    expect(labSplit(b, { year: 2031, otherIncome: 1_550 }, 0)).toEqual({ grants: 1_500, royalty: 50 })
    expect(labSplit(b, { year: 2031, otherIncome: 100 }, 400)).toEqual({ grants: 0, royalty: 0 })
    expect(labSplit(b, { year: 2030, otherIncome: 5_000 }, 0)).toEqual({ grants: 0, royalty: 0 })
    expect(labSplit({}, { year: 2031, otherIncome: 5_000 }, 0)).toEqual({ grants: 0, royalty: 0 })
  })

  it('a patent on the books lifts the valuation by its book value', () => {
    const { b } = labGame(7, 'restaurant')
    const before = valuationOf(b)
    patchLab(b, (d) => {
      d.patents = [{ family: 'A', filed: 2031, until: 2037, mode: 'hold', lic: 0, plan: 50_000, book: 30_000, earned: 0 }]
    })
    expect(Math.abs(valuationOf(b) - before - 30_000)).toBeLessThanOrEqual(1)
  })
})
