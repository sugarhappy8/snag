import { describe, expect, it } from 'vitest'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { COUNTRIES } from '../src/game/world'
import { WAVE_KINDS, isWaveKind } from '../src/game/business/tech-wave-data'
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
