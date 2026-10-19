import { describe, expect, it } from 'vitest'
import { staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { seeded } from '../src/game/assets'
import { addHeavy } from '../src/game/business/heavy-rd'
import { hashOf } from '../src/game/business/product-market'
import { DEEPTECH_WAVES, WAVE_KINDS } from '../src/game/business/tech-wave-data'
import { MAX_WAVES, advanceTechWaves, announceWave, lowerLead, nextState, readTechBase, readTechWaves, rivalWave, waveDraw, waveFactors, waveFactorsFor, waveWorldFlags, type TechBase, type TechWave } from '../src/game/business/tech-waves'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { FACTOR_BOUNDS, marketEventFactors, readMarketNews } from '../src/game/history/market-events'
import { HISTORY_WAVES } from '../src/game/history/tech-waves'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'
import { adult, company } from './market-kit'

const flagsOnly = (flags: Record<string, Json>): Pick<GameState, 'flags'> => ({ flags })
const W = (o: Partial<TechWave> = {}): TechWave => ({ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const J = (v: unknown): Json => v as Json
const N = { demand: 1, costs: 1, value: 1 }
const near = (n: number) => expect.closeTo(n, 6)
const calm = (g: GameState, year: number) => { for (let i = 0; ; i++) if (!waveDraw(g, `c${i}`, year).stall) return `c${i}` }

describe('readTechWaves and readTechBase (hostile flags)', () => {
  const read = (v: Json | undefined) => readTechWaves(flagsOnly(v === undefined ? {} : { techWaves: v }))
  it('reads anything that is not a list as empty, drops damaged entries, and shares one frozen empty list', () => {
    for (const v of [7, 'x', true, null, { id: 'a' }, undefined, [] as Json]) expect(read(v)).toEqual([])
    const bad = [null, 4, 'a', [], { ...W(), kind: 'constructor' }, { ...W(), kind: '__proto__' }, { ...W(), market: 'zz' }, { ...W(), source: 'x' }, { ...W(), size: NaN }, { ...W(), delivery: Infinity }, { ...W(), id: '' }]
    expect(read(J([...bad, W()]))).toHaveLength(1); expect(read(undefined)).toBe(read(7)); expect(Object.isFrozen(read(undefined))).toBe(true)
  })
  it('clamps numbers, caps strings, keeps at most 64 with the first copy of an id winning, and scans a million entries fast', () => {
    const [w] = read(J([{ ...W(), year: 99999, size: 7, hype: -3, delivery: 2, last: 0, id: 'i'.repeat(500), name: 'n'.repeat(200), origin: 'o'.repeat(500) }]))
    expect([w.year, w.size, w.hype, w.delivery, w.last]).toEqual([2300, 1, 0, 1, 2300]); expect([w.id.length, w.name.length, w.origin!.length]).toEqual([100, 60, 64])
    expect(read(J(Array.from({ length: 100 }, (_, i) => ({ ...W(), id: `w${i}` }))))).toHaveLength(MAX_WAVES)
    expect(read(J([{ ...W(), size: 0.2 }, { ...W(), size: 0.9 }]))[0].size).toBe(0.2)
    const t = Date.now(); read(J(new Array(1_000_000).fill(W()))); expect(Date.now() - t).toBeLessThan(250)
  })
  it('validates a stored array once, re-validates a replaced or longer one, never writes or draws', () => {
    const g = makeTestGame(5); g.flags.techWaves = J([W()]); const a = readTechWaves(g), before = JSON.stringify(g), rng = g.rng
    expect(readTechWaves(g)).toBe(a); for (let i = 0; i < 100; i++) waveFactorsFor(g, 'aiLab', 'world', 2035)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
    g.flags.techWaves = J([...(g.flags.techWaves as Json[]), { ...W(), id: 'two' }]); expect(readTechWaves(g)).toHaveLength(2)
  })
  const base = (v: Json | undefined) => readTechBase(flagsOnly(v === undefined ? {} : { techBase: v }))
  it('reads junk as empty, keeps only real trade|market keys, clamps demand to 0.8-1.5 and costs to 0.8-1.0, keeps at most 64', () => {
    for (const v of [7, 'x', null, [], undefined]) expect(base(v as Json)).toEqual({})
    const ok = { demand: 1.2, costs: 0.9 }
    expect(Object.keys(base({ 'aiLab|world': ok, 'aiLab|zz': ok, 'nope|us': ok, 'constructor|us': ok, aiLab: ok, 'bakery|us': 5 }))).toEqual(['aiLab|world'])
    expect([base({ 'aiLab|world': { demand: 9, costs: 0 } })['aiLab|world'], base({ 'aiLab|world': { demand: 0, costs: 2 } })['aiLab|world']]).toEqual([{ demand: 1.5, costs: 0.8 }, { demand: 0.8, costs: 1 }])
    expect(Object.keys(base(Object.fromEntries(INDUSTRY_IDS.map((t) => [`${t}|world`, ok])))).length).toBeLessThanOrEqual(64)
  })
})

describe('announceWave', () => {
  const input = { kind: 'ai', source: 'deeptech', origin: 'biz1#frontier', name: 'Frontier AI', size: 0.6, market: 'world' } as const
  it('writes id, hype 0.3 + 0.7 size, delivery 0, last = year; a second call writes nothing and draws nothing; the array is replaced', () => {
    const g = makeTestGame(3); g.year = 2031; const rng = g.rng, nextId = g.nextId
    const w = announceWave(g, input)!, old = g.flags.techWaves
    expect(w.id).toBe(`deeptech:ai:2031:${hashOf('biz1#frontier').toString(36)}`); expect([w.hype, w.delivery, w.last]).toEqual([near(0.72), 0, 2031])
    expect(announceWave(g, input)).toBe(readTechWaves(g)[0]); expect(g.flags.techWaves).toBe(old); expect([g.rng, g.nextId]).toEqual([rng, nextId])
    announceWave(g, { ...input, origin: 'biz9#agents' }); expect(g.flags.techWaves).not.toBe(old); expect(old).toHaveLength(1)
  })
  it('sets skip (the record trade) for heavy waves only, lets year lead g.year, and picks a home', () => {
    const g = makeTestGame(3, { countryId: 'jp' }); g.year = 2031
    const h = announceWave(g, { ...input, source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', year: 2032 })!
    expect([h.skip, h.year, h.last, h.home]).toEqual(['software', 2032, 2032, 'jp']); expect(announceWave(g, { ...input, origin: 'biz2#agents' })!.skip).toBeUndefined()
    expect(announceWave(g, { ...input, kind: 'cloud', market: 'us', source: 'rival', origin: 'a' })!.home).toBe('us')
  })
  it('refuses an unknown kind, a third non-rival wave in a year, a 65th wave, and a covered history kind', () => {
    const g = makeTestGame(3); g.year = 2031
    expect(announceWave(g, { ...input, kind: 'nope' as never })).toBeNull()
    expect([announceWave(g, { ...input, origin: 'o1' }), announceWave(g, { ...input, origin: 'o2' })].every(Boolean)).toBe(true); expect(announceWave(g, { ...input, origin: 'o3' })).toBeNull()
    g.flags.techWaves = J(Array.from({ length: MAX_WAVES }, (_, i) => ({ ...W(), id: `w${i}`, year: 2000 + (i % 20) }))); expect(announceWave(g, { ...input, source: 'rival', origin: 'full' })).toBeNull()
    const old = makeTestGame(3); old.year = 1950
    expect(announceWave(old, { ...input, kind: 'television', source: 'workshop', origin: 'hist-picture-box' })).toBeNull(); expect(announceWave(old, { ...input, kind: 'television', source: 'rival', origin: 'x|world' })).not.toBeNull()
  })
})

describe('waveFactors', () => {
  const w = [W()] // kind ai, size .5, hype .8, delivery .6: r = .36, size x delivery = .3
  const f = (t: string, m = 'world', y = 2035, ws: readonly TechWave[] = w, b?: Readonly<Record<string, TechBase>>, world = false) => waveFactors(t, m, y, ws, b, world)
  it('core, supply and disrupted follow the spec formulas', () => {
    expect(f('aiLab')).toMatchObject({ demand: near(1.09), costs: near(0.97), value: near(1.126) }); expect(f('semiconductor')).toMatchObject({ demand: near(1.06), costs: 1, value: near(1.0612) })
    expect(f('software')).toMatchObject({ demand: near(0.925), costs: 1, value: near(0.922) }); expect(f('bakery')).toEqual(N)
  })
  it('reach: a world wave counts in full everywhere; a country wave abroad counts 0.35 + 0.4 x delivery; nothing counts before its year; skip drops only the origin trade\'s demand term', () => {
    const us = [W({ market: 'us' })], h = [W({ source: 'heavy', skip: 'aiLab' })]
    expect(f('aiLab', 'us', 2035, us).value).toBeCloseTo(1.126, 6); expect(f('aiLab', 'jp', 2035, w).value).toBeCloseTo(1.126, 6)
    expect(f('aiLab', 'jp', 2035, us).value).toBeCloseTo(1 + (0.35 + 0.4 * 0.6) * 0.126, 6); expect(f('aiLab', 'world', 2030)).toEqual(N); expect(f('aiLab', 'world', 2045)).toEqual(f('aiLab', 'world', 2035))
    expect(f('aiLab', 'world', 2035, h)).toMatchObject({ demand: 1, costs: near(0.97) }); expect(f('semiconductor', 'world', 2035, h).demand).toBeCloseTo(1.06, 6)
  })
  it('history: transistor core in 1957 is about +15.5% value and +9.7% demand; a world-scope read damps demand to a third', () => {
    expect(f('semiconductor', 'us', 1957, []).value).toBeCloseTo(1.155, 2); expect(f('semiconductor', 'us', 1957, []).demand).toBeCloseTo(1.097, 2)
    const us = f('software', 'us', 2011, []), wd = f('software', 'world', 2011, [], undefined, true)
    expect(wd.demand).toBeCloseTo(1 + (us.demand - 1) / 3, 6); expect(wd.value).toBeCloseTo(us.value, 6)
  })
  it('quiet years are neutral and every output stays in FACTOR_BOUNDS, alone and stacked with 30 waves or a market event', () => {
    for (const t of INDUSTRY_IDS) for (const y of [1965, 1970, 2003, 2031]) expect(f(t, 'us', y, [])).toEqual(N)
    const stack = Array.from({ length: 30 }, (_, i) => W({ id: `s${i}`, size: 1, hype: 1, delivery: 1 }))
    for (const t of INDUSTRY_IDS) for (const y of [1957, 1999, 2011, 2035]) for (const ws of [[], stack]) {
      const r = f(t, 'us', y, ws); for (const k of ['demand', 'costs', 'value'] as const) { expect(r[k]).toBeGreaterThanOrEqual(FACTOR_BOUNDS[k][0]); expect(r[k]).toBeLessThanOrEqual(FACTOR_BOUNDS[k][1]) }
    }
    expect(marketEventFactors('telecom', 'us', 1999).value * f('telecom', 'us', 1999, []).value).toBeLessThan(3)
  })
  it('techBase: a world settlement reaches every market, a country settlement its own only, and the two stack at home; waveFactorsFor shares one frozen neutral', () => {
    const b = { 'dataCenter|world': { demand: 1.2, costs: 0.9 } }, home = { 'dataCenter|us': { demand: 1.1, costs: 0.95 } }
    expect(f('dataCenter', 'world', 2035, [], b)).toEqual({ demand: 1.2, costs: 0.9, value: 1 }); expect(f('dataCenter', 'us', 2035, [], b)).toEqual({ demand: 1.2, costs: 0.9, value: 1 })
    expect(f('dataCenter', 'us', 2035, [], home)).toEqual({ demand: 1.1, costs: 0.95, value: 1 }); expect(f('dataCenter', 'jp', 2035, [], home)).toEqual(N); expect(f('dataCenter', 'world', 2035, [], home)).toEqual(N)
    expect(f('dataCenter', 'us', 2035, [], { ...b, ...home })).toMatchObject({ demand: near(1.32), costs: near(0.855) }); expect(f('dataCenter', 'jp', 2035, [], { ...b, ...home })).toEqual({ demand: 1.2, costs: 0.9, value: 1 })
    const g = makeTestGame(1), a = waveFactorsFor(g, 'aiLab', 'world', 2035); expect(a).toBe(waveFactorsFor(g, 'bakery', 'us', 2040)); expect(Object.isFrozen(a)).toBe(true)
  })
})

describe('nextState', () => {
  it('hype closes on delivery at 0.30 when delivery leads and 0.45 when it lags; a stall adds nothing and cools hype 15% (below 0.9 delivery)', () => {
    expect(nextState(W({ hype: 0.4, delivery: 0.4 }), 0.8, false, 2032).hype).toBeCloseTo(0.4 + 0.4 * 0.3, 6)
    expect(nextState(W({ hype: 0.9, delivery: 0.2 }), 0.2, false, 2032).hype).toBeCloseTo(0.9 - 0.7 * 0.45, 6)
    const s = nextState(W({ hype: 0.9, delivery: 0.2 }), 0.2, true, 2032); expect([s.hype, s.delivery]).toEqual([near((0.9 - 0.7 * 0.45) * 0.85), 0.2])
  })
  it('a stall year does not cool a wave that has delivered (0.9 or more): hype stays in the maturity band and the count goes on', () => {
    expect(nextState(W({ hype: 1, delivery: 1, mature: 2 }), 1, true, 2040)).toMatchObject({ hype: 1, delivery: 1, mature: 3, fate: 'live' })
    expect(nextState(W({ hype: 0.9, delivery: 0.9, mature: 4 }), 0.9, true, 2040)).toMatchObject({ hype: 0.9, mature: 5, fate: 'settle' })
    expect(nextState(W({ hype: 0.88, delivery: 0.85 }), 0.89, true, 2040).hype).toBeCloseTo((0.88 + 0.01 * 0.30) * 0.85, 6)   // just under 0.9 it still cools
  })
  it('the premium holds when delivery matches hype and unwinds when it lags', () => {
    const run = (s: TechWave) => { for (let i = 0; i < 4; i++) { const x = nextState(s, s.delivery, false, 2032 + i); s = { ...s, hype: x.hype, mature: x.mature } } return s }
    const v = (s: TechWave) => waveFactors('aiLab', 'world', 2040, [s]).value
    expect(v(run(W({ hype: 0.8, delivery: 0.8 })))).toBeCloseTo(v(W({ hype: 0.8, delivery: 0.8 })), 6); expect(v(run(W({ hype: 0.9, delivery: 0.2 })))).toBeLessThan(v(W({ hype: 0.9, delivery: 0.2 })))
  })
  it('mature counts years at delivery >= 0.9 within 0.05 of hype; 5 settle; delivery below 0.1 after 6 years drops', () => {
    expect(nextState(W({ hype: 1, delivery: 1, mature: 3 }), 1, false, 2040)).toMatchObject({ mature: 4, fate: 'live' }); expect(nextState(W({ hype: 1, delivery: 1, mature: 4 }), 1, false, 2040)).toMatchObject({ mature: 5, fate: 'settle' })
    expect(nextState(W({ hype: 0.5, delivery: 1, mature: 4 }), 1, false, 2040)).toMatchObject({ mature: 0, fate: 'live' })
    const low = W({ year: 2031, hype: 0.3, delivery: 0.05 }); expect([nextState(low, 0.05, false, 2037).fate, nextState(low, 0.05, false, 2036).fate]).toEqual(['drop', 'live'])
  })
})

describe('advanceTechWaves', () => {
  const game = (waves: TechWave[], year = 2032) => { const g = makeTestGame(7); g.year = year; g.flags.techWaves = J(waves); return g }
  it('writes nothing without waves; steps once a year behind the last marker, once after a gap, and not before the wave\'s own year', () => {
    const none = makeTestGame(7), nb = JSON.stringify(none); advanceTechWaves(none); expect(JSON.stringify(none)).toBe(nb)
    const g = game([W({ source: 'race', last: 2031 })]); advanceTechWaves(g); const once = g.flags.techWaves
    advanceTechWaves(g); expect(g.flags.techWaves).toBe(once); expect(readTechWaves(g)[0].last).toBe(2032)
    const gap = game([W({ source: 'race', last: 2028 })], 2035); advanceTechWaves(gap); expect(readTechWaves(gap)[0].last).toBe(2035)
    const early = game([W({ source: 'race', year: 2040, last: 2040 })]), eb = JSON.stringify(early.flags); advanceTechWaves(early); expect(JSON.stringify(early.flags)).toBe(eb)
    const fut = game([W({ source: 'race', last: 2300 })], 2035); advanceTechWaves(fut); expect(readTechWaves(fut)[0].last).toBe(2035)   // a hostile future `last` cannot freeze a wave
  })
  it('waveDraw takes u first, then the stall draw, from the family stream; heirs share it, other families do not; g.rng is untouched', () => {
    const s = seeded('fam|wave|w1|2031'), d = (id: string) => { const g = makeTestGame(1); g.lifeId = id; const r = g.rng; const x = waveDraw(g, 'w1', 2031); expect(g.rng).toBe(r); return x }
    expect(d('fam-g3')).toEqual({ u: s.next(), stall: s.next() < 0.25 }); expect(d('fam-g1')).toEqual(d('fam-g3')); expect(d('fam2-g1')).not.toEqual(d('fam-g1'))
  })
  it('the seeded path gains 0.08 + 0.22 u (or nothing on a stall), and is also the fallback when the company or the heavy record is gone', () => {
    const lost = [W({ source: 'race', delivery: 0.2 }), W({ source: 'deeptech', origin: 'gone#frontier', delivery: 0.2 }), W({ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', skip: 'software', delivery: 0.2 })]
    for (const w of lost) {
      const g = game([w]); const { u, stall } = waveDraw(g, w.id, 2032)
      expect(() => advanceTechWaves(g)).not.toThrow(); expect(readTechWaves(g)[0].delivery).toBeCloseTo(stall ? 0.2 : 0.28 + 0.22 * u, 6)
    }
  })
  it('a heavy wave moves toward the record\'s adoption, at most 0.25 a year', () => {
    const g = game([W({ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', skip: 'software', delivery: 0, hype: 0.5, year: 2025 })])
    addHeavy(g, 'software', 'world', { family: 'Autonomous Agent Platform', year: 2025, years: 4, quality: 80, cost: 1e6, by: 'biz1' }); advanceTechWaves(g); expect(readTechWaves(g)[0].delivery).toBeCloseTo(0.25, 6)
  })
  it('settles a mature wave into techBase at its own market, with the spec\'s full factors', () => {
    const probe = makeTestGame(7); probe.year = 2032
    const g = game([W({ id: calm(probe, 2032), source: 'race', delivery: 1, hype: 1, mature: 4 })]); advanceTechWaves(g)
    const b = readTechBase(g); expect(readTechWaves(g)).toEqual([]); expect([b['aiLab|world'].demand, b['aiLab|world'].costs]).toEqual([near(1.15), near(0.95)])
    expect(b['software|world'].demand).toBeCloseTo(0.875, 6); expect(Object.keys(b).every((k) => k.endsWith('|world'))).toBe(true)
  })
  it('a seeded wave of any source settles within 30 years of its announcement, stall years and all (no calm() id)', () => {
    const years: number[] = []
    for (const source of ['rival', 'race', 'workshop'] as const) for (let i = 0; i < 20; i++) {
      const g = game([W({ id: `${source}:ai:2032:s${i}`, source, year: 2032, last: 2031, hype: 0.65, delivery: 0 })], 2032); let n = 0
      for (; n < 60 && readTechWaves(g).length; n++) { g.year = 2032 + n; advanceTechWaves(g) }
      years.push(n)
    }
    expect(Math.max(...years)).toBeLessThanOrEqual(30)
  })
  it('a settled world wave still reaches a national-scope trade in every country (no cliff), while a country wave settles at home only', () => {
    const probe = makeTestGame(7); probe.year = 2032; const id = calm(probe, 2032)
    const g = game([W({ id, source: 'race', delivery: 1, hype: 1, mature: 4 })]), live = waveFactorsFor(g, 'dataCenter', 'us', 2032).demand   // supply of ai: 1 + 0.2 x 0.5 x 1
    advanceTechWaves(g); expect(readTechWaves(g)).toEqual([]); expect(live).toBeCloseTo(1.1, 6)
    for (const m of ['us', 'jp', 'world']) expect(waveFactorsFor(g, 'dataCenter', m, 2033).demand).toBeCloseTo(live, 6)
    expect(waveFactorsFor(g, 'semiconductor', 'world', 2033).demand).toBeCloseTo(1.1, 6)
    const h = game([W({ id, source: 'race', market: 'us', delivery: 1, hype: 1, mature: 4 })]); advanceTechWaves(h)
    expect([waveFactorsFor(h, 'dataCenter', 'us', 2033).demand, waveFactorsFor(h, 'dataCenter', 'jp', 2033).demand]).toEqual([near(1.1), 1])
  })
  it('folds only the wave\'s own factors, even in a year when a history wave is live', () => {
    const probe = makeTestGame(7); probe.year = 1982
    const g = game([W({ id: calm(probe, 1982), source: 'race', year: 1980, last: 1981, delivery: 1, hype: 1, mature: 4 })], 1982); advanceTechWaves(g)
    expect(readTechBase(g)['semiconductor|world'].demand).toBeCloseTo(1.1, 6)   // supply 1 + 0.2 x 0.5 x 1; the microcomputer row, where semiconductor is core, is not folded in
  })
})

describe('rivalWave and waveWorldFlags', () => {
  it('lowerLead lowercases a leading capital unless an acronym follows it', () => {
    expect(['Frontier AI', 'A new drug for cancer', 'AI agents', 'Air taxis', ''].map(lowerLead)).toEqual(['frontier AI', 'a new drug for cancer', 'AI agents', 'air taxis', ''])
  })
  it('rivalWave lands about once per 9 trade-years at any year, only for core trades of future-facing kinds, and draws landing, kind, size in that order', () => {
    let hits = 0, first = 0
    for (let y = 2027; y < 4027; y++) if (rivalWave('fam', 'aiLab', y)) { hits++; first ||= y }
    expect(hits).toBeGreaterThan((2000 / 9) * 0.7); expect(hits).toBeLessThan((2000 / 9) * 1.3)
    const s = seeded(`fam|tw-rival|aiLab|${first}`); s.next(); s.next(); expect(rivalWave('fam', 'aiLab', first)).toEqual({ kind: 'ai', size: near(0.2 + 0.4 * s.next()) })
    for (let y = 2027; y < 2100; y++) { expect(rivalWave('fam', 'bakery', y)).toBeNull(); expect(rivalWave('fam', 'dataCenter', y)).toBeNull() }
  })
  it('waveWorldFlags carries validated copies, omits empty parts and never adds market.news', () => {
    expect(waveWorldFlags(flagsOnly({}))).toEqual({})
    const out = waveWorldFlags(flagsOnly({ techWaves: J([null, 7, W()]), techBase: J({ 'aiLab|world': { demand: 9, costs: 1 } }), 'market.news': J([]) }))
    expect(Object.keys(out).sort()).toEqual(['techBase', 'techWaves']); expect(out.techWaves).toHaveLength(1); expect(out.techBase).toEqual({ 'aiLab|world': { demand: 1.5, costs: 1 } })
  })
})

/** The text with each value that was poured into it put back as a "${...}" hole (as test/heavy-voice.test.ts does). */
function template(text: string, values: readonly string[]): string {
  return [...values].sort((x, y) => y.length - x.length).reduce((t, v) => (v ? t.split(v).join('${...}') : t), text)
}

describe('voice', () => {
  const lines: [string, 'outcome' | 'text' | 'log' | 'title'][] = [
    ['Your lab landed ${...}. Investors expect a lot. Delivery decides the rest.', 'outcome'], ['A rival landed ${...}. Investors are watching. Delivery decides the rest.', 'outcome'],
    ['${...} Wave', 'title'], ['${...} launched to chase the ${...} wave.', 'log'], ['Frontier AI wave. Demand +9%, costs \u22123%, value +13%.', 'text'],
  ]
  const cap = (role: string) => (role === 'log' ? 90 : 120)
  it('every wave string passes unitFlags and its length cap', () => {
    for (const [t, role] of lines) { expect(unitFlags(t, role)).toEqual([]); if (role === 'log' || role === 'outcome') expect(staticLength(t)).toBeLessThanOrEqual(cap(role)) }
  })
  it('the wave news the game writes passes the same checks as the templates above', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'aiLab'); company(g, 'dataCenter')
    announceWave(g, { kind: 'ai', source: 'deeptech', origin: `${a.id}#frontier`, name: 'Frontier AI', size: 0.6, market: 'world', home: 'us' })
    announceWave(g, { kind: 'chips', source: 'rival', origin: 'semiconductor|world', name: 'Chip leap', size: 0.4, market: 'world', home: 'us' })
    const news = readMarketNews(g); expect(news).toHaveLength(2)
    for (const n of news) {
      const t = template(n.text, [n.title.replace(/ Wave$/, '').replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase())]); expect(unitFlags(t, 'outcome')).toEqual([]); expect(staticLength(t)).toBeLessThanOrEqual(120)
      expect(unitFlags(template(n.title, [n.title.replace(/ Wave$/, '')]), 'title')).toEqual([])
    }
  })
  it('no wave label, history name or deep-tech name holds an em-dash', () => {
    for (const s of [...Object.values(WAVE_KINDS).map((d) => d.label), ...HISTORY_WAVES.map((w) => w.name), ...Object.values(DEEPTECH_WAVES).map((w) => w.name)]) expect(s).not.toMatch(/\u2014|\u2013/)
  })
})
