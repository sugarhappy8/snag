// The devices trade's real cast, breakthroughs, wave roles and workshop wiring. Names identify
// companies only: no arcs, no overrides, nothing negative.
import { describe, expect, it } from 'vitest'
import { DEVICE_ROWS } from '../src/game/business/market-data-devices'
import { FOOD_ROWS } from '../src/game/business/market-data-food'
import { HEAVY_ROWS } from '../src/game/business/market-data-heavy'
import { RETAIL_ROWS } from '../src/game/business/market-data-retail'
import { SERVICES_ROWS } from '../src/game/business/market-data-services'
import { TECH_ROWS } from '../src/game/business/market-data-tech'
import { knownPlace } from '../src/game/business/market-places'
import { activeRivals, rosterOf } from '../src/game/business/competition-roster'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { WAVE_KINDS } from '../src/game/business/tech-wave-data'
import { PRESENT_YEAR } from '../src/game/history/timeline'

const OTHER_SLUGS = new Set([...TECH_ROWS, ...HEAVY_ROWS, ...FOOD_ROWS, ...RETAIL_ROWS, ...SERVICES_ROWS].map((r) => r[1]))
const real = (year: number) => activeRivals(rosterOf('fam-dev', 'devices', 'world'), year).filter((r) => r.real).map((r) => r.name)

describe('devices rival cast', () => {
  it('has 24 rows, 19 alive in 2026 and 5 ended', () => {
    expect(DEVICE_ROWS).toHaveLength(24)
    for (const r of DEVICE_ROWS) expect(r[0]).toBe('devices')
    const slugs = DEVICE_ROWS.map((r) => r[1])
    expect(new Set(slugs).size).toBe(24)
    for (const s of slugs) expect(OTHER_SLUGS.has(s), s).toBe(false)
    for (const [, slug, , hq, founded, , , o = {}] of DEVICE_ROWS) {
      if (o.since !== undefined) expect(o.since, slug).toBeGreaterThanOrEqual(founded)
      expect(knownPlace(hq), slug).toBeTruthy()
      expect(o.a, slug).toBeUndefined()
      expect(o.q, slug).toBeUndefined()
      expect(o.t, slug).toBeUndefined()
    }
    const ended = DEVICE_ROWS.filter((r) => r[7]?.end !== undefined)
    expect(ended).toHaveLength(5)
    for (const r of ended) expect(r[7]!.end!, r[1]).toBeLessThan(PRESENT_YEAR)
    expect(Object.fromEntries(ended.map((r) => [r[2], r[7]!.fate]))).toEqual({ LG: 'closed', Nokia: 'acquired', IBM: 'acquired', Compaq: 'acquired', Palm: 'acquired' })
    expect(DEVICE_ROWS.filter((r) => r[7]?.end === undefined)).toHaveLength(19)
    const text = JSON.stringify(DEVICE_ROWS).toLowerCase()
    for (const w of ['scandal', 'fraud', 'lawsuit', 'recall', 'bankrupt', 'breach', 'cartel', 'tobacco', 'gambling']) expect(text.includes(w), w).toBe(false)
  })

  it('fields the right companies in the right years', () => {
    const y1985 = real(1985)
    for (const n of ['IBM', 'Apple', 'HP']) expect(y1985, n).toContain(n)
    for (const n of ['Samsung', 'Xiaomi']) expect(y1985, n).not.toContain(n)
    expect(real(2026).length).toBeGreaterThanOrEqual(12)
    expect(real(2005)).toContain('Nokia')
    expect(real(2015)).not.toContain('Nokia')
    expect(real(2022)).not.toContain('LG')
  })
})

describe('devices breakthroughs', () => {
  it('has five, one sentence each', () => {
    const list = breakthroughsFor('devices')
    expect(list.map((b) => [b.name, b.first])).toEqual([
      ['Pen-Input Pocket Computer', 1993], ['Pocket Music Player', 2001], ['Touch Slate Computer', 2010],
      ['Foldable Display Phone', 2019], ['Spatial Headset Computer', 2024],
    ])
    for (const b of list) {
      expect(b.note.length, b.name).toBeLessThan(120)
      expect(b.note.endsWith('.'), b.name).toBe(true)
      expect(b.note.slice(0, -1).includes('. '), b.name).toBe(false)
    }
  })
})

describe('devices wave roles', () => {
  it('joins the smartphone and home computer waves only, in one role', () => {
    expect(WAVE_KINDS.smartphone.core).toEqual(['software', 'devices'])
    expect(WAVE_KINDS.microcomputer.core).toEqual(['semiconductor', 'software', 'devices'])
    expect(WAVE_KINDS.mobilephone.core).not.toContain('devices')
    for (const d of Object.values(WAVE_KINDS)) {
      const roles = [d.core, d.supply, d.disrupted] as readonly (readonly string[])[]
      expect(roles.filter((r) => r.includes('devices')).length).toBeLessThanOrEqual(1)
    }
  })
})
