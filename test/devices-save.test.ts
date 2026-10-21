// Ecosystem companies: the two saved fields of the devices trade (`fabs`, `chips`) through the normalizer. An old or hostile
// save must never throw, never charge and never leave NaN in the economy, and other trades must load unchanged (RF1).
import { describe, expect, it } from 'vitest'
import { chipCostFactor, chipSource, chipTerms, readChips, readFabs, type ChipSupply } from '../src/game/business/devices-data'
import { BIZ_VERSION, bizOf, normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { SAVE_SCHEMA } from '../src/game/core'
import type { Json } from '../src/game/types'
import { adult, company } from './market-kit'

const SIS: ChipSupply = { year: 2026, from: 'a1', name: 'Acme Silicon', stage: 3, node: 5, yield: 0.8, cover: 0.6 }

const devices = (seed = 5, year = 2026) => {
  const g = adult(seed, year, 'us')
  const a = company(g, 'devices', { cash: 5e9 })
  return { g, a, b: bizOf(g, a) }
}

/** The stored details of a company with extra raw fields, as an old or hostile save would hold them. */
const raw = (b: BizState, extra: Record<string, unknown>): Record<string, Json> => ({ ...(structuredClone(b) as unknown as Record<string, Json>), ...(extra as Record<string, Json>) })

describe('readFabs', () => {
  it('keeps an integer 1 to 3 and nothing else', () => {
    const input = [undefined, null, 'x', NaN, Infinity, -1, 0, 1, 2, 3, 4, 2.5, 1e9, '2', [2], {}]
    expect(input.map((v) => readFabs(v as Json | undefined))).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0])
  })
})

describe('readChips', () => {
  it('keeps a good record unchanged', () => {
    expect(readChips({ ...SIS } as unknown as Json)).toEqual(SIS)
  })

  it('returns null for every bad field', () => {
    const bad: Record<string, unknown>[] = [
      { year: '2026' }, { year: NaN }, { year: 1e9 }, { year: 2026.5 },
      { stage: '3' }, { stage: NaN }, { stage: 1 }, { stage: 5 }, { stage: 3.5 },
      { node: '5' }, { node: NaN }, { node: 7 }, { node: -1 }, { node: 2.5 },
      { yield: '.8' }, { yield: NaN }, { yield: 0.2 }, { yield: 1 },
      { cover: '.6' }, { cover: NaN }, { cover: -0.1 }, { cover: 1.1 },
      { from: '' }, { from: 7 }, { name: '' }, { name: 7 },
    ]
    for (const o of bad) expect(readChips({ ...SIS, ...o } as unknown as Json), JSON.stringify(o)).toBeNull()
    expect(readChips([] as unknown as Json)).toBeNull()
    expect(readChips([SIS] as unknown as Json)).toBeNull()
    expect(readChips(null as unknown as Json)).toBeNull()
    expect(readChips(undefined)).toBeNull()
    expect(readChips('x' as Json)).toBeNull()
    expect(readChips(7 as Json)).toBeNull()
  })

  it('cuts long names and drops extra keys', () => {
    const r = readChips({ ...SIS, name: 'N'.repeat(100), extra: 1 } as unknown as Json)!
    expect(r.name).toHaveLength(60)
    expect(Object.keys(r).sort()).toEqual(['cover', 'from', 'name', 'node', 'stage', 'year', 'yield'])
  })
})

describe('normalizeBiz and the devices fields (RF1)', () => {
  it('drops hostile fabs and chips on a devices company', () => {
    const { g, b } = devices()
    const hostile: Record<string, unknown>[] = [
      { fabs: 'x', chips: { ...SIS, cover: NaN } },
      { fabs: NaN, chips: { ...SIS, stage: 9 } },
      { fabs: 9, chips: 7 },
      { fabs: -2, chips: 'sister' },
      { fabs: 1e12, chips: [SIS] },
      { fabs: [3], chips: { ...SIS, name: 7 } },
      { fabs: 2.5, chips: { ...SIS, year: 1e9 } },
    ]
    for (const o of hostile) {
      const n = normalizeBiz(raw(b, o), g.year)
      expect('fabs' in n, JSON.stringify(o)).toBe(false)
      expect('chips' in n, JSON.stringify(o)).toBe(false)
    }
  })

  it('keeps a valid pair through a JSON round trip', () => {
    const { g, b } = devices()
    const n = normalizeBiz(raw(b, { fabs: 2, chips: SIS }), g.year)
    expect(n.fabs).toBe(2)
    expect(n.chips).toEqual(SIS)
    const again = normalizeBiz(JSON.parse(JSON.stringify(n)) as Record<string, Json>, g.year)
    expect(again.fabs).toBe(2)
    expect(again.chips).toEqual(SIS)
  })

  it('keeps the valid half when only one field is damaged', () => {
    const { g, b } = devices()
    const n = normalizeBiz(raw(b, { fabs: 'x', chips: SIS }), g.year)
    expect('fabs' in n).toBe(false)
    expect(n.chips).toEqual(SIS)
    const m = normalizeBiz(raw(b, { fabs: 3, chips: { ...SIS, stage: 1 } }), g.year)
    expect(m.fabs).toBe(3)
    expect('chips' in m).toBe(false)
  })

  it('never keeps either field on another trade, which loads exactly as without them', () => {
    const g = adult(6, 2026, 'us')
    const a = company(g, 'restaurant', { cash: 1e7 })
    const b = bizOf(g, a)
    const plain = normalizeBiz(raw(b, {}), g.year)
    const loaded = normalizeBiz(raw(b, { fabs: 2, chips: SIS }), g.year)
    expect('fabs' in loaded).toBe(false)
    expect('chips' in loaded).toBe(false)
    expect(loaded).toEqual(plain)
  })

  it('a save without the fields has neither key', () => {
    const { g, b } = devices()
    const n = normalizeBiz(raw(b, {}), g.year)
    expect('fabs' in n).toBe(false)
    expect('chips' in n).toBe(false)
  })

  it('keeps the save schema and the business version', () => {
    expect(SAVE_SCHEMA).toBe(3)
    expect(BIZ_VERSION).toBe(2)
  })

  it('readBiz keeps both fields on a devices asset', () => {
    const { g, a, b } = devices()
    b.fabs = 2
    b.chips = { ...SIS }
    const r = readBiz(g, a)
    expect(r.fabs).toBe(2)
    expect(r.chips).toEqual(SIS)
  })

  it('a damaged value inside a current-version save never reaches the economy', () => {
    const { b } = devices()
    const hostile = [
      { fabs: 'x', chips: { ...SIS, cover: NaN } },
      { fabs: NaN },
      { fabs: 9 },
      { chips: 7 },
    ]
    for (const o of hostile) {
      const x = { ...b, ...o } as unknown as BizState
      expect(chipSource(x)).toEqual({ src: 'market', cut: 0, cover: 1 })
      expect(chipCostFactor(x)).toBe(1)
      expect(chipTerms(x, 2026).lift).toBe(0)
    }
  })
})
