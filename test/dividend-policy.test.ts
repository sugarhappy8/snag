import { describe, expect, it } from 'vitest'
import { DIVIDEND_KEEP, DIVIDEND_PCT, dividendField, readDividend, withPolicy, type DividendPolicy } from '../src/game/business/dividend-policy'
import { BIZ_VERSION, bizOf, normalizeBiz } from '../src/game/business/state'
import type { Asset, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const base = {
  industry: 'restaurant',
  countryId: 'us',
  city: 'Chicago',
  outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }],
}

function saved(extra: Record<string, unknown>) {
  return normalizeBiz({ ...base, ...extra } as unknown as Record<string, Json>, 2026)
}

describe('the yearly dividend rule', () => {
  it('keeps a valid rule and rounds it', () => {
    expect(readDividend({ mode: 'cash', pct: 0.333, keep: 2.6 })).toEqual({ mode: 'cash', pct: 0.33, keep: 3 })
  })

  it.each([null, undefined, 7, 'profit', [], {}, { mode: 'weird' }, { mode: 7 }, { pct: 0.5 }])('reads a damaged rule as no rule: %j', (raw) => {
    expect(readDividend(raw)).toBeNull()
  })

  it('fills a bad number with its default', () => {
    expect(readDividend({ mode: 'profit', pct: 'x', keep: null })).toEqual({ mode: 'profit', pct: 0.3, keep: 3 })
    expect(readDividend({ mode: 'profit', pct: Number.NaN, keep: 2 })?.pct).toBe(0.3)
    expect(readDividend({ mode: 'profit', pct: Number.POSITIVE_INFINITY, keep: 2 })?.pct).toBe(1)
    expect(readDividend({ mode: 'profit', pct: 0.5, keep: Number.NaN })?.keep).toBe(3)
  })

  it('clamps the share and the months', () => {
    expect([7, -1, 0.001].map((pct) => readDividend({ mode: 'cash', pct, keep: 3 })?.pct)).toEqual([1, 0.05, 0.05])
    expect([99, -3].map((keep) => readDividend({ mode: 'cash', pct: 0.5, keep })?.keep)).toEqual([24, 0])
  })

  it('keeps a good last payment and drops a bad one', () => {
    const rule = { mode: 'cash', pct: 0.5, keep: 3 }
    const good = { year: 2026, paid: 1000, mine: 600, perShare: 0.0123456789 }
    expect(readDividend({ ...rule, last: good })).toEqual({ ...rule, last: { year: 2026, paid: 1000, mine: 600, perShare: 0.012346 } })
    const bad: unknown[] = [
      { ...good, year: 2026.5 },
      { ...good, year: 1700 },
      { ...good, paid: -1 },
      { ...good, paid: Number.NaN },
      { ...good, mine: 1002 },
      { ...good, perShare: Number.POSITIVE_INFINITY },
      'x',
    ]
    for (const last of bad) expect(readDividend({ ...rule, last }), JSON.stringify(last)).toEqual(rule)
  })

  it('drops unknown keys', () => {
    const p = readDividend({ mode: 'cash', pct: 0.5, keep: 3, extra: 1 })
    expect(p).toEqual({ mode: 'cash', pct: 0.5, keep: 3 })
    expect(p).not.toHaveProperty('extra')
  })

  it('does not change its input', () => {
    const raw = deepFreeze({ mode: 'cash', pct: 0.5, keep: 3, last: { year: 2026, paid: 1, mine: 1, perShare: 0 } })
    expect(() => readDividend(raw)).not.toThrow()
    expect(raw).toEqual({ mode: 'cash', pct: 0.5, keep: 3, last: { year: 2026, paid: 1, mine: 1, perShare: 0 } })
  })

  it('exports the bounds the menu uses', () => {
    expect(DIVIDEND_PCT).toEqual({ min: 0.05, max: 1, step: 0.05, start: 0.3 })
    expect(DIVIDEND_KEEP).toEqual({ min: 0, max: 24, start: 3 })
  })

  it('withPolicy starts from the defaults and stays in bounds', () => {
    expect(withPolicy(null, {})).toEqual({ mode: 'profit', pct: 0.3, keep: 3 })
    expect(withPolicy(null, { mode: 'cash', pct: 9, keep: -4 })).toEqual({ mode: 'cash', pct: 1, keep: 0 })
    const rule: DividendPolicy = { mode: 'cash', pct: 0.4, keep: 2, last: { year: 2025, paid: 10, mine: 6, perShare: 0 } }
    const next = withPolicy(rule, { keep: 6 })
    expect(next).toEqual({ mode: 'cash', pct: 0.4, keep: 6, last: { year: 2025, paid: 10, mine: 6, perShare: 0 } })
    expect(next).not.toBe(rule)
    expect(rule.keep).toBe(2)
    expect(withPolicy(null, { pct: Number.NaN }).pct).toBe(0.3)
  })

  it('withPolicy does not copy a last payment from nowhere', () => {
    expect(withPolicy(null, { keep: 5 })).not.toHaveProperty('last')
    expect(withPolicy(deepFreeze({ mode: 'profit', pct: 0.3, keep: 3 } as DividendPolicy), { pct: 0.5 })).toEqual({ mode: 'profit', pct: 0.5, keep: 3 })
  })

  it('dividendField is the one line normalizeBiz spreads', () => {
    expect(dividendField({ mode: 'cash', pct: 0.5, keep: 3 })).toEqual({ dividend: { mode: 'cash', pct: 0.5, keep: 3 } })
    expect(dividendField('x')).toEqual({})
    expect(dividendField(undefined)).toEqual({})
  })

  it('the saved company keeps it, and an old one has none', () => {
    const rule = { mode: 'profit', pct: 0.4, keep: 6 }
    const kept = saved({ dividend: rule })
    expect(kept.dividend).toEqual(rule)

    const again = normalizeBiz(JSON.parse(JSON.stringify(kept)) as Record<string, Json>, 2026)
    expect(again.dividend).toEqual(kept.dividend)

    expect('dividend' in saved({})).toBe(false)
    for (const dividend of ['x', 7, { mode: 'nope' }]) expect('dividend' in saved({ dividend }), JSON.stringify(dividend)).toBe(false)
  })

  it('keeps the last payment through a save', () => {
    const rule = { mode: 'cash', pct: 0.5, keep: 3, last: { year: 2026, paid: 5e6, mine: 3e6, perShare: 0.05 } }
    const kept = saved({ dividend: rule })
    expect(kept.dividend).toEqual(rule)
    expect(normalizeBiz(JSON.parse(JSON.stringify(kept)) as Record<string, Json>, 2026).dividend).toEqual(rule)
  })

  it('a version 1 record that holds a rule keeps it through bizOf', () => {
    const g = makeTestGame()
    const details = saved({ dividend: { mode: 'cash', pct: 0.25, keep: 12 } }) as unknown as Record<string, Json>
    details.v = 1
    const biz = bizOf(g, { details } as unknown as Asset)
    expect(biz.v).toBe(BIZ_VERSION)
    expect(biz.dividend).toEqual({ mode: 'cash', pct: 0.25, keep: 12 })
  })

  it('a version 1 record with a damaged rule loses it through bizOf', () => {
    const g = makeTestGame()
    const details = saved({}) as unknown as Record<string, Json>
    details.v = 1
    details.dividend = { mode: 'weird' }
    const biz = bizOf(g, { details } as unknown as Asset)
    expect('dividend' in biz).toBe(false)
  })
})
