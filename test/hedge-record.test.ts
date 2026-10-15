// The two saved hedge fund records and their readers: what a good record reads back as, and what every
// kind of damage becomes. Readers are pure, never throw and never hand back what they were given.
import { describe, expect, it } from 'vitest'
import { HEDGE_STRATEGIES, MACRO_CALLS } from '../src/game/business/fund-state'
import {
  HEDGE_STRATEGY_IDS,
  MACRO_CALL_IDS,
  MAX_HOLDERS,
  RUNNING_COST,
  companyHedgeField,
  readCompanyHedge,
  readHedge,
  unitPrice,
  unitsValue,
  type CompanyHedge,
  type HedgeFund,
} from '../src/game/business/hedge-record'
import { normalizeBiz, readBiz } from '../src/game/business/state'
import type { Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { bizOf } from '../src/game/business/state'
import { valuationOf } from '../src/game/business/economy'
import { getCountry } from '../src/game/world'
import { company, kin, rich } from './hedge-kit'

const good: HedgeFund = {
  v: 1,
  owner: 'family',
  countryId: 'us',
  founded: 2020,
  strategy: 'macro',
  call: 'bull',
  lev: 2,
  nav: 1_200_000,
  units: 1_000_000,
  mine: 800_000,
  cost: 700_000,
  holders: [{ id: 'p1', units: 200_000 }],
  lastYear: 2025,
  last: { year: 2025, gross: 0.08, net: 0.075, market: 0.1 },
  marks: [{ y: 2024, r: 0.05, m: 0.07 }, { y: 2025, r: 0.075, m: 0.1 }],
}

const goodCo: CompanyHedge = {
  v: 1,
  target: 2_000_000,
  strategy: 'macro',
  call: 'bear',
  lev: 2.5,
  total: -120_000,
  last: { year: 2025, work: 1_500_000, gross: -0.05, net: -0.055, market: -0.12, pnl: -82_500 },
}

function copy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** A fund record with fields replaced by anything at all, the way a damaged save would carry them. */
function damaged(patch: Record<string, unknown>): unknown {
  return { ...copy(good), ...patch }
}

function numbersIn(v: unknown, out: number[] = []): number[] {
  if (typeof v === 'number') out.push(v)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) numbersIn(x, out)
  return out
}

describe('the fund record', () => {
  it('reads a good fund record unchanged', () => {
    const input = copy(good)
    const out = readHedge(input)
    expect(out).toEqual(good)
    expect(out).not.toBe(input)
    expect(out!.holders).not.toBe(input.holders)
    expect(out!.holders[0]).not.toBe(input.holders[0])
    expect(out!.last).not.toBe(input.last)
    expect(out!.marks).not.toBe(input.marks)
    expect(out!.marks[0]).not.toBe(input.marks[0])
  })

  it('reads a personal fund with no holders and no year yet', () => {
    const fresh: HedgeFund = { ...copy(good), owner: 'person', holders: [], units: 1_000_000, mine: 1_000_000, nav: 1_000_000, cost: 1_000_000, lastYear: -1, last: null, marks: [], strategy: 'longShort', call: 'flat', lev: 1 }
    expect(readHedge(copy(fresh))).toEqual(fresh)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
    ['a string', 'x'],
    ['an array', []],
    ['an empty object', {}],
    ['another version', { v: 2, owner: 'person' }],
    ['an unknown owner', { v: 1, owner: 'company' }],
    ['no owner', { v: 1 }],
    ['a version that is text', { v: '1', owner: 'person' }],
    ['a list that holds a good record', [copy(good)]],
  ])('rejects what is not a fund: %s', (_name, raw) => {
    expect(readHedge(raw)).toBeNull()
  })

  it('cleans every field', () => {
    const out = readHedge(
      damaged({ strategy: 'moon', call: 7, lev: 9, nav: -5, units: NaN, mine: Infinity, cost: '1', holders: 'x', lastYear: 'y', last: 3, marks: 'z', founded: 'old', countryId: 7 }),
    )!
    expect(out).not.toBeNull()
    expect(out.strategy).toBe('longShort')
    expect(out.call).toBe('flat')
    expect(out.lev).toBe(3)
    expect(out.nav).toBe(0)
    expect(out.mine).toBe(0)
    expect(out.cost).toBe(0)
    expect(out.holders).toEqual([])
    expect(out.lastYear).toBe(-1)
    expect(out.last).toBeNull()
    expect(out.marks).toEqual([])
    expect(out.founded).toBe(1949)
    expect(out.countryId).toBe('us')
    expect(out.units).toBe(1)
    expect(numbersIn(out).every((n) => Number.isFinite(n))).toBe(true)
  })

  it('clamps and rounds the numbers into their ranges', () => {
    const out = readHedge(damaged({ founded: 3000, lev: 1.3, nav: 1e30, mine: -4, cost: 1e99, lastYear: 5000, units: 1e15 }))!
    expect(out.founded).toBe(2300)
    expect(out.lev).toBe(1.5)
    expect(out.nav).toBe(1e15)
    expect(out.mine).toBe(0)
    expect(out.cost).toBe(1e15)
    expect(out.lastYear).toBe(2300)
    expect(readHedge(damaged({ founded: 1500.6 }))!.founded).toBe(1949)
    expect(readHedge(damaged({ founded: 2020.4 }))!.founded).toBe(2020)
    expect(readHedge(damaged({ lev: 0 }))!.lev).toBe(1)
    expect(readHedge(damaged({ lev: -2 }))!.lev).toBe(1)
    expect(readHedge(damaged({ lev: 2.74 }))!.lev).toBe(2.5)
    expect(readHedge(damaged({ lev: 2.76 }))!.lev).toBe(3)
    expect(readHedge(damaged({ lastYear: -50 }))!.lastYear).toBe(-1)
    expect(readHedge(damaged({ lastYear: 2025.6 }))!.lastYear).toBe(2026)
  })

  it('keeps a country code of one to eight characters and nothing else', () => {
    expect(readHedge(damaged({ countryId: 'abcdefgh' }))!.countryId).toBe('abcdefgh')
    expect(readHedge(damaged({ countryId: 'g' }))!.countryId).toBe('g')
    expect(readHedge(damaged({ countryId: '' }))!.countryId).toBe('us')
    expect(readHedge(damaged({ countryId: 'abcdefghi' }))!.countryId).toBe('us')
    expect(readHedge(damaged({ countryId: null }))!.countryId).toBe('us')
  })

  it('reads the last year only when every part of it is usable', () => {
    expect(readHedge(damaged({ last: { year: 2025, gross: 50, net: -9, market: 3 } }))!.last).toEqual({ year: 2025, gross: 10, net: -1, market: 3 })
    for (const bad of [
      { year: 2025.5, gross: 0, net: 0, market: 0 },
      { year: 1799, gross: 0, net: 0, market: 0 },
      { year: 2301, gross: 0, net: 0, market: 0 },
      { year: 'x', gross: 0, net: 0, market: 0 },
      { year: 2025, gross: NaN, net: 0, market: 0 },
      { year: 2025, gross: 0, net: '1', market: 0 },
      { year: 2025, gross: 0, net: 0 },
      [],
      null,
    ]) {
      const out = readHedge(damaged({ last: bad }))!
      expect(out, JSON.stringify(bad)).not.toBeNull()
      expect(out.last, JSON.stringify(bad)).toBeNull()
    }
  })

  it('units never fall below what is held, so damage cannot raise a price', () => {
    const out = readHedge({ ...copy(good), nav: 1000, units: 10, mine: 8, holders: [{ id: 'a', units: 5 }] })!
    expect(out.units).toBe(13)
    expect(unitPrice(out)).toBe(1000 / 13)
    // With no usable units the pool's dollars stand in for them, so a price starts at 1.
    expect(readHedge(damaged({ units: -3, nav: 500, mine: 100, holders: [] }))!.units).toBe(500)
    expect(readHedge(damaged({ units: 0, nav: 0, mine: 0, holders: [] }))!.units).toBe(1)
  })

  it('stays finite when units are absurd', () => {
    const out = readHedge(damaged({ units: 1e300, holders: [{ id: 'a', units: 1e308 }, { id: 'b', units: 1e308 }, { id: 'c', units: 1.7e308 }] }))!
    expect(numbersIn(out).every((n) => Number.isFinite(n))).toBe(true)
    expect(Number.isFinite(unitPrice(out))).toBe(true)
    expect(Number.isFinite(unitsValue(out, out.mine))).toBe(true)
    expect(Number.isFinite(unitsValue(out, out.holders[0].units))).toBe(true)
    expect(out.units).toBeGreaterThanOrEqual(out.mine + out.holders.reduce((s, h) => s + h.units, 0))
  })

  it('stays finite when units are tiny, so a price cannot blow up', () => {
    const out = readHedge(damaged({ units: 1e-300, nav: 1e15, mine: 0, holders: [] }))!
    expect(out.units).toBeGreaterThan(0)
    expect(Number.isFinite(unitPrice(out))).toBe(true)
    expect(Number.isFinite(unitsValue(out, out.mine))).toBe(true)
  })

  describe('holders', () => {
    it('are merged, positive and capped', () => {
      const merged = readHedge(damaged({ holders: [{ id: 'a', units: 2 }, { id: 'b', units: 1 }, { id: 'a', units: 3 }] }))!
      expect(merged.holders).toEqual([{ id: 'a', units: 5 }, { id: 'b', units: 1 }])
      const dropped = readHedge(
        damaged({
          holders: [{ id: 'a', units: 0 }, { id: 'b', units: -3 }, { id: 'c', units: NaN }, { id: 'd', units: Infinity }, { id: 'f', units: '4' }, { id: 'e', units: 1 }],
        }),
      )!
      expect(dropped.holders).toEqual([{ id: 'e', units: 1 }])
      const many = readHedge(damaged({ holders: Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, units: 1 })) }))!
      expect(many.holders).toHaveLength(MAX_HOLDERS)
      expect(many.holders.map((h) => h.id)).toEqual(Array.from({ length: MAX_HOLDERS }, (_, i) => `h${i}`))
    })

    it('need a real id and a plain record', () => {
      const out = readHedge(
        damaged({
          holders: [{ id: '', units: 1 }, { id: 'x'.repeat(65), units: 1 }, { id: 7, units: 1 }, { units: 1 }, null, 5, 'a', [], { id: 'ok', units: 2 }, { id: 'y'.repeat(64), units: 3 }],
        }),
      )!
      expect(out.holders).toEqual([{ id: 'ok', units: 2 }, { id: 'y'.repeat(64), units: 3 }])
    })

    it('a person fund keeps none, and its units follow only what you hold', () => {
      const out = readHedge(damaged({ owner: 'person', holders: [{ id: 'a', units: 500 }], units: 10, mine: 4 }))!
      expect(out.holders).toEqual([])
      expect(out.units).toBe(10)
      expect(readHedge(damaged({ owner: 'person', holders: [{ id: 'a', units: 500 }], units: 1, mine: 4 }))!.units).toBe(4)
    })
  })

  describe('marks', () => {
    it('keep the last twelve', () => {
      const marks = Array.from({ length: 20 }, (_, i) => ({ y: 2000 + i, r: i / 100, m: -i / 100 }))
      const out = readHedge(damaged({ marks }))!
      expect(out.marks).toHaveLength(12)
      expect(out.marks.map((m) => m.y)).toEqual(Array.from({ length: 12 }, (_, i) => 2008 + i))
      expect(out.marks[11]).toEqual({ y: 2019, r: 0.19, m: -0.19 })
    })

    it('keep only plain entries with finite numbers', () => {
      const out = readHedge(damaged({ marks: [null, 3, 'x', [], { y: 1 }, { y: 'a', r: 0, m: 0 }, { y: 2001, r: NaN, m: 0 }, { y: 2002, r: 0.1, m: Infinity }, { y: 2003, r: 0.2, m: 0.3 }] }))!
      expect(out.marks).toEqual([{ y: 2003, r: 0.2, m: 0.3 }])
    })
  })

  it('never mutates its input', () => {
    const raw = deepFreeze(damaged({ strategy: 'moon', lev: 9, holders: [{ id: 'a', units: 2 }, { id: 'a', units: 3 }, { id: 'b', units: -1 }], marks: Array.from({ length: 15 }, (_, i) => ({ y: i, r: 0, m: 0 })), last: { year: 2025, gross: 50, net: 0, market: 0 } }))
    const before = JSON.stringify(raw)
    expect(() => readHedge(raw)).not.toThrow()
    expect(JSON.stringify(raw)).toBe(before)
    expect(readHedge(deepFreeze(copy(good)))).toEqual(good)
  })

  it('the strategy and call lists match the firm', () => {
    expect([...HEDGE_STRATEGY_IDS]).toEqual([...HEDGE_STRATEGIES])
    expect([...MACRO_CALL_IDS]).toEqual([...MACRO_CALLS])
  })

  it('has the running cost and holder cap the plan names', () => {
    expect(RUNNING_COST).toBe(0.005)
    expect(MAX_HOLDERS).toBe(24)
  })

  it('unit price is 1 with no units', () => {
    expect(unitPrice({ nav: 500, units: 0 })).toBe(1)
    expect(unitPrice({ nav: 500, units: -1 })).toBe(1)
    expect(unitPrice({ nav: 500, units: NaN })).toBe(1)
    expect(unitsValue({ nav: 500, units: 0 }, 7)).toBe(7)
    expect(unitPrice({ nav: 1000, units: 8 })).toBe(125)
    expect(unitsValue({ nav: 1_200_000, units: 1_000_000 }, 500_000)).toBe(600_000)
  })
})

describe('the company record', () => {
  it('reads a company record', () => {
    const input = copy(goodCo)
    const out = readCompanyHedge(input)
    expect(out).toEqual(goodCo)
    expect(out).not.toBe(input)
    expect(out!.last).not.toBe(input.last)
    const bare: CompanyHedge = { v: 1, target: 0, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }
    expect(readCompanyHedge(copy(bare))).toEqual(bare)
    expect('last' in readCompanyHedge(copy(bare))!).toBe(false)
  })

  it('cleans the target, the total and the terms', () => {
    const at = (patch: Record<string, unknown>) => readCompanyHedge({ ...copy(goodCo), ...patch })!
    expect(at({ target: -4 }).target).toBe(0)
    expect(at({ target: 1e30 }).target).toBe(1e15)
    expect(at({ target: 2.6 }).target).toBe(3)
    expect(at({ target: NaN }).target).toBe(0)
    expect(at({ target: '5' }).target).toBe(0)
    expect(at({ total: 1e30 }).total).toBe(1e15)
    expect(at({ total: -1e30 }).total).toBe(-1e15)
    expect(at({ total: -12.4 }).total).toBe(-12)
    expect(at({ total: Infinity }).total).toBe(0)
    expect(at({ strategy: 'moon', call: 7, lev: 'x' })).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1 })
    expect(at({ lev: 9 }).lev).toBe(3)
    expect(at({ lev: 0.2 }).lev).toBe(1)
    expect(at({ lev: 1.8 }).lev).toBe(2)
  })

  it('drops a last year with a bad year or bad numbers and keeps the record', () => {
    for (const bad of [
      { ...goodCo.last, year: 1799 },
      { ...goodCo.last, year: 2301 },
      { ...goodCo.last, year: 2025.5 },
      { ...goodCo.last, year: 'x' },
      { ...goodCo.last, work: NaN },
      { ...goodCo.last, gross: 'x' },
      { ...goodCo.last, net: Infinity },
      { ...goodCo.last, market: null },
      { ...goodCo.last, pnl: NaN },
      [],
      7,
    ]) {
      const out = readCompanyHedge({ ...copy(goodCo), last: bad })
      expect(out, JSON.stringify(bad)).not.toBeNull()
      expect(out!.target).toBe(goodCo.target)
      expect(out!.last, JSON.stringify(bad)).toBeUndefined()
      expect('last' in out!, JSON.stringify(bad)).toBe(false)
    }
  })

  it('clamps the numbers of a last year', () => {
    const out = readCompanyHedge({ ...copy(goodCo), last: { year: 2025, work: -5, gross: 40, net: -3, market: 11, pnl: 12.6 } })!
    expect(out.last).toEqual({ year: 2025, work: 0, gross: 10, net: -1, market: 10, pnl: 13 })
    const big = readCompanyHedge({ ...copy(goodCo), last: { year: 2025, work: 1e30, gross: 0, net: 0, market: 0, pnl: -1e30 } })!
    expect(big.last).toMatchObject({ work: 1e15, pnl: -1e15 })
  })

  it('cuts a reason to 80 characters and drops one that is not text', () => {
    const withWhy = (why: unknown) => readCompanyHedge({ ...copy(goodCo), last: { ...goodCo.last, why } })!.last!
    expect(withWhy('Its cash is at the floor.').why).toBe('Its cash is at the floor.')
    expect(withWhy('x'.repeat(100)).why).toBe('x'.repeat(80))
    expect('why' in withWhy(7)).toBe(false)
    expect('why' in withWhy(null)).toBe(false)
    expect('why' in readCompanyHedge(copy(goodCo))!.last!).toBe(false)
  })

  it.each([
    ['a number', 7],
    ['an array', []],
    ['another version', { v: 2 }],
    ['no version', {}],
    ['null', null],
    ['undefined', undefined],
    ['text', 'x'],
    ['a version that is text', { v: '1' }],
  ])('rejects what is not a company record: %s', (_name, raw) => {
    expect(readCompanyHedge(raw)).toBeNull()
  })

  it('never mutates its input', () => {
    const raw = deepFreeze({ ...copy(goodCo), target: -4, strategy: 'moon', last: { ...goodCo.last, why: 'x'.repeat(200) } })
    const before = JSON.stringify(raw)
    expect(() => readCompanyHedge(raw)).not.toThrow()
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('companyHedgeField is an empty object for junk and the record for a good one', () => {
    for (const junk of [null, undefined, 7, 'x', [], {}, { v: 2 }]) expect(companyHedgeField(junk)).toEqual({})
    expect(Object.keys(companyHedgeField('junk'))).toEqual([])
    expect(companyHedgeField(copy(goodCo))).toEqual({ hedge: goodCo })
  })
})

describe('saving it on a company', () => {
  const json = (v: unknown): Json => copy(v) as Json

  it('normalizeBiz keeps a good record and drops a bad one', () => {
    const g = rich()
    const { a } = company(g)
    const kept = normalizeBiz({ ...a.details, hedge: json(goodCo) }, 2026)
    expect(kept.hedge).toEqual(goodCo)
    expect(structuredClone(kept).hedge).toEqual(goodCo)
    expect(JSON.parse(JSON.stringify(kept)).hedge).toEqual(goodCo)
    const junk = normalizeBiz({ ...a.details, hedge: 'junk' }, 2026)
    expect('hedge' in junk).toBe(false)
    expect('hedge' in normalizeBiz({ ...a.details, hedge: [1, 2] }, 2026)).toBe(false)
    expect('hedge' in normalizeBiz({ ...a.details, hedge: { v: 2, target: 5 } }, 2026)).toBe(false)
    expect('hedge' in normalizeBiz({ ...a.details }, 2026)).toBe(false)
  })

  it('cleans a half-damaged record and touches nothing else', () => {
    const g = rich()
    const { a } = company(g)
    const plain = normalizeBiz({ ...a.details }, 2026)
    const out = normalizeBiz({ ...a.details, hedge: json({ ...goodCo, target: -4, strategy: 'moon', total: 'x' }) }, 2026)
    expect(out.hedge).toEqual({ v: 1, target: 0, strategy: 'longShort', call: 'bear', lev: 2.5, total: 0, last: goodCo.last })
    const { hedge: _hedge, ...rest } = out
    expect(rest).toEqual(plain)
  })

  it('reads through readBiz and survives a normalize of its own output', () => {
    const g = rich()
    const { a } = company(g)
    a.details.hedge = json(goodCo)
    expect(readBiz(g, a).hedge).toEqual(goodCo)
    const once = normalizeBiz(a.details, 2026)
    const twice = normalizeBiz(once as unknown as Record<string, Json>, 2026)
    expect(twice.hedge).toEqual(goodCo)
  })
})

describe('the test kit', () => {
  it('rich is an adult with money, a life id and a one-year log', () => {
    const g = rich(7, 'gb', 3_000_000, 2030)
    expect(g.character.age).toBe(45)
    expect(g.character.money).toBe(3_000_000)
    expect(g.character.countryId).toBe('gb')
    expect(g.character.city).toBe(getCountry('gb').cities[0])
    expect(g.lifeId).toBe('hedge-7')
    expect(g.year).toBe(2030)
    expect(g.log).toEqual([{ age: 45, year: 2030, entries: [] }])
    expect(rich().lifeId).toBe('hedge-61')
  })

  it('kin is a living relative with savings of their own', () => {
    const g = rich()
    const sis = kin(g)
    expect(g.people).toContain(sis)
    expect(sis).toMatchObject({ relation: 'sibling', age: 44, relationship: 70, money: 2_000_000, alive: true })
    expect(sis.data.countryId).toBe('us')
    const dad = kin(g, 'parent', 9_000, { age: 70, relationship: 35 })
    expect(dad).toMatchObject({ relation: 'parent', age: 70, relationship: 35, money: 9_000 })
    expect(dad.id).not.toBe(sis.id)
  })

  it('company is an owned software company with the cash asked for and a consistent value', () => {
    const g = rich()
    const { a, b } = company(g)
    expect(g.assets).toContain(a)
    expect(a.kind).toBe('business')
    expect(b.industry).toBe('software')
    expect(b.cash).toBe(5_000_000)
    expect(b.share).toBe(1)
    expect(b.history).toHaveLength(3)
    expect(b.history.every((y) => y.profit === 20e6)).toBe(true)
    expect(a.value).toBeGreaterThan(0)
    expect(b.valuation).toBe(valuationOf(b))
    const small = company(g, { cash: 1_000, name: 'Tiny Co', profit: 1e6 })
    expect(small.b.cash).toBe(1_000)
    expect(small.a.name).toBe('Tiny Co')
    expect(small.b.history.every((y) => y.profit === 1e6)).toBe(true)
    expect(bizOf(g, small.a)).toBe(small.b)
    const abroad = company(rich(5, 'gb'), { countryId: 'gb' })
    expect(abroad.b.countryId).toBe('gb')
  })
})
