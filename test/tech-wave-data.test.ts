import { describe, expect, it } from 'vitest'
import { programDef } from '../src/game/business/deeptech-data'
import type { DeepTechIndustry } from '../src/game/business/deeptech-state'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { heavyEligible } from '../src/game/business/heavy-rd'
import { DEEPTECH_WAVES, HEAVY_WAVES, WAVE_KINDS, WORKSHOP_WAVES, deepWaveFor, heavyWaveFor, isWaveKind, workshopWaveFor } from '../src/game/business/tech-wave-data'
import { DEEP_TECH_IDS, INDUSTRY_IDS } from '../src/game/data/markets'
import { COUNTRIES } from '../src/game/world'
import { ALL_IDEAS } from '../src/game/workshop/catalog'
import { HISTORY_WAVES, historyKindActive, historyWaveStates, waveAt } from '../src/game/history/tech-waves'

const TRADES: ReadonlySet<string> = new Set(INDUSTRY_IDS)
const KINDS = ['ai', 'chips', 'drug', 'space', 'ev', 'automation', 'quantum', 'security', 'fusion', 'neuro', 'drones', 'carbon',
  'transistor', 'television', 'microcomputer', 'mobilephone', 'smartphone', 'cloud', 'solarbattery', 'reusablerocket', 'evboom', 'mrna', 'glp1']
const EM_DASH = /\u2014|\u2013/

describe('WAVE_KINDS', () => {
  it('has the 23 kinds, real trades, one role per trade per kind, a core each, unique labels and emojis, own keys only', () => {
    expect(Object.keys(WAVE_KINDS).sort()).toEqual([...KINDS].sort())
    const defs = Object.values(WAVE_KINDS)
    for (const d of defs) {
      const all = [...d.core, ...d.supply, ...d.disrupted]
      expect(d.core.length).toBeGreaterThan(0); expect(new Set(all).size).toBe(all.length); expect(EM_DASH.test(d.label)).toBe(false)
      for (const t of all) expect(TRADES.has(t)).toBe(true)
    }
    expect(new Set(defs.map((d) => d.label)).size).toBe(23); expect(new Set(defs.map((d) => d.emoji)).size).toBe(23)
    for (const k of ['constructor', '__proto__', 'toString', '', 7]) expect(isWaveKind(k)).toBe(false)
    expect(isWaveKind('ai')).toBe(true)
  })
})

describe('HISTORY_WAVES', () => {
  it('has 11 well-formed rows', () => {
    expect(HISTORY_WAVES).toHaveLength(11)
    const ids = new Set(COUNTRIES.map((c) => c.id))
    for (const w of HISTORY_WAVES) {
      expect(w.id).toBe('hist:' + w.kind); expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThan(0); expect(w.size).toBeLessThanOrEqual(1)
      expect(w.home.every((c) => ids.has(c))).toBe(true); expect(EM_DASH.test(w.name + w.source)).toBe(false)
      const p = w.points, last = p[p.length - 1], prev = p[p.length - 2]
      expect(p[0][2]).toBeLessThanOrEqual(0.2); expect([last[1], last[2]]).toEqual([0, 0]); expect(prev[1]).toBeLessThanOrEqual(0.6); expect(prev[2]).toBeLessThanOrEqual(0.55)
      p.forEach((q, i) => { if (i) { expect(q[0]).toBeGreaterThan(p[i - 1][0]); if (q[0] - p[i - 1][0] === 1) for (const k of [1, 2]) expect(Math.abs(q[k] - p[i - 1][k])).toBeLessThanOrEqual(0.6) } })
    }
  })
  it('waveAt is null outside the years and zero on the closing year, the table is quiet in 1962-1974, 2001-2005 and 2025 on, and historyKindActive follows the rows', () => {
    const tv = HISTORY_WAVES.find((w) => w.kind === 'television')!
    expect([waveAt(tv, 1945), waveAt(tv, 1962), waveAt(tv, NaN)]).toEqual([null, null, null]); expect(waveAt(tv, 1961)).toEqual({ hype: 0, delivery: 0 })
    for (const y of [...Array.from({ length: 13 }, (_, i) => 1962 + i), ...Array.from({ length: 5 }, (_, i) => 2001 + i), ...Array.from({ length: 21 }, (_, i) => 2025 + i)]) expect(historyWaveStates('us', y)).toEqual([])
    expect([historyKindActive('television', 1950), historyKindActive('television', 1965), historyKindActive('ai', 2030)]).toEqual([true, false, false])
  })
  it('1950 has transistor and television; reach is home 1, the row\'s abroad value, or 0.35 + 0.4 x delivery; a world market sees all of it', () => {
    const s = (c: string, y: number, k: string) => historyWaveStates(c, y).find((x) => x.kind === k)!
    expect(historyWaveStates('us', 1950).map((x) => x.kind).sort()).toEqual(['television', 'transistor']); expect(s('us', 1950, 'television').name.length).toBeGreaterThan(0)
    expect([s('us', 1950, 'television').reach, s('br', 1950, 'television').reach]).toEqual([1, 0.25]); expect(s('br', 2012, 'cloud').reach).toBeCloseTo(0.35 + 0.4 * 0.65, 2)
    for (const x of historyWaveStates('world', 2011)) expect(x.reach).toBe(1)
  })
})

describe('the writer tables', () => {
  it('HEAVY_WAVES: 15-25 entries, each a real catalogue entry of a heavy-eligible trade, size 0.2-0.6, real kind', () => {
    const keys = Object.keys(HEAVY_WAVES); expect(keys.length).toBeGreaterThanOrEqual(15); expect(keys.length).toBeLessThanOrEqual(25)
    for (const k of keys) {
      const trade = k.slice(0, k.indexOf('|')), name = k.slice(k.indexOf('|') + 1), w = HEAVY_WAVES[k]
      expect(breakthroughsFor(trade).some((x) => x.name === name)).toBe(true); expect(heavyEligible({ industry: trade })).toBe(true)
      expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6); expect(EM_DASH.test(name)).toBe(false)
    }
    expect(heavyWaveFor('dataCenter', 'Liquid-Cooled GPU Hall')).toEqual({ kind: 'ai', size: 0.35 }); expect(heavyWaveFor('software', 'Autonomous Agent Platform')!.kind).toBe('ai')
    expect(heavyWaveFor('restaurant', 'Open Kitchen Theater')).toBeNull(); expect(heavyWaveFor('constructor', 'x')).toBeNull(); expect(heavyWaveFor('__proto__', 'x')).toBeNull()
  })
  it('DEEPTECH_WAVES: all 12 deep-tech trades, real program ids, no nextgen, size 0.2-0.6, short names', () => {
    expect([...new Set(Object.keys(DEEPTECH_WAVES).map((k) => k.split(':')[0]))].sort()).toEqual([...DEEP_TECH_IDS].sort())
    for (const [k, w] of Object.entries(DEEPTECH_WAVES)) {
      const [t, id] = k.split(':'); expect(programDef(t as DeepTechIndustry, id)).toBeDefined(); expect(id).not.toBe('nextgen')
      expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6); expect(w.name.length).toBeLessThanOrEqual(60); expect(EM_DASH.test(w.name)).toBe(false)
    }
    expect(deepWaveFor('fusion', 'netGain')).toMatchObject({ kind: 'fusion', size: 0.5, name: 'Fusion net energy gain' }); expect(deepWaveFor('quantum', 'qec')!.first).toBe(true); expect(deepWaveFor('electricVehicles', 'selfdrive')!.autonomy).toBe(3)
    expect(deepWaveFor('fusion', 'nextgen')).toBeNull(); expect(deepWaveFor('constructor', 'x')).toBeNull(); expect(deepWaveFor('__proto__', 'x')).toBeNull()
  })
  it('WORKSHOP_WAVES: real idea ids, nine of the thirteen future ideas mapped, four novelties silent, sizes 0.2-0.6', () => {
    const ids = new Set(ALL_IDEAS.map((i) => i.id)); for (const [id, w] of Object.entries(WORKSHOP_WAVES)) { expect(ids.has(id)).toBe(true); expect(isWaveKind(w.kind)).toBe(true) }
    const fut = ALL_IDEAS.filter((i) => i.future); expect(fut).toHaveLength(13); expect(fut.filter((i) => workshopWaveFor(i)).length).toBe(9)
    for (const id of ['fut-float-board', 'fut-air-umbrella', 'fut-free-chocolate', 'fut-clean-clothes']) expect(workshopWaveFor(ALL_IDEAS.find((i) => i.id === id)!)).toBeNull()
    for (const i of ALL_IDEAS) { const w = workshopWaveFor(i); if (w) { expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6) } }
  })
  it('workshopWaveFor: the id entry first (its own size or 0.1 + 0.1 d), then the category for a history idea only, never for a plain or future idea', () => {
    const idea = (id: string) => ALL_IDEAS.find((i) => i.id === id)!
    expect(workshopWaveFor(idea('hist-pocket-telephone'))).toEqual({ kind: 'mobilephone', size: 0.6 }); expect(workshopWaveFor(idea('hist-touch-slate'))).toEqual({ kind: 'smartphone', size: 0.3 })
    expect(workshopWaveFor(idea('fut-tooth-gel'))).toEqual({ kind: 'drug', size: 0.3 }); expect(workshopWaveFor(idea('fut-cold-cure'))).toEqual({ kind: 'drug', size: 0.4 })
    expect(workshopWaveFor(idea('hist-light-beam'))).toEqual({ kind: 'microcomputer', size: 0.6 }); expect(workshopWaveFor(idea('hist-bandage'))).toEqual({ kind: 'drug', size: 0.2 })
    expect(workshopWaveFor(idea('hist-color-cube'))).toBeNull()
    expect(workshopWaveFor({ id: 'idea-x', cat: 'computing', d: 5 })).toBeNull(); expect(workshopWaveFor({ id: 'constructor', cat: 'toy', d: 1, real: 1900 })).toBeNull()
  })
})
