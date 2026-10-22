// R3-F4 (C.6 d): every wave and every rival landing pushes the frontier. A wave that announceWave STORES (a new one: a repeat is the stored wave
// and pushes nothing) moves the field of its kind, with no edit to any wave writer; a landing of landRivalWaves pushes a rival row; and
// research disclosed through announceResearch moves its field even when it makes no wave (size under 0.2, or the wave refused).
//
// What this file pins: one `you` row per wave with the lead and the spill of the F1 formula (size x 2 years x a luck of 0.8 to 1.2, and
// round(5 x (1 + 5 size)) tenths of a point at the patent default); a repeat, a history kind, a year up to 2026 and an unknown field push
// nothing and leave g.world undefined; `a.field` narrows the push to an AI capability (spill only); the real writers (deep tech, heavy,
// race) push without an edit; a landing pushes a `rival` row and the seeded landing draw is untouched; the third non-rival wave of a year
// is refused and pushes nothing; announceResearch pushes exactly once per disclosure (a wave makes the push through the hook, no wave
// pushes by itself); the pushes are pure functions of the life, the year and the origin (a Time Machine fork re-rolls the year after it);
// and none of it draws on g.rng. No pinned seed: states come from `makeTestGame(n)` and the positional kits.
import { describe, expect, it } from 'vitest'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { becomeCeo } from '../src/game/business/career'
import { marketKey } from '../src/game/business/competition-core'
import { familyId } from '../src/game/business/competition-roster'
import { techOf } from '../src/game/business/deeptech-core'
import { programDef } from '../src/game/business/deeptech-data'
import { startProgram } from '../src/game/business/deeptech-rd'
import { simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { readTech, timesDone } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { kindOfField, pushFromWave } from '../src/game/business/frontier-waves'
import { advanceHeavy, readHeavy } from '../src/game/business/heavy-rd'
import { bizOf, type RdProject } from '../src/game/business/state'
import { WAVE_KINDS, type WaveKind } from '../src/game/business/tech-wave-data'
import { announceResearch, announceWave, landRivalWaves, readTechWaves, rivalWave, type WaveInput } from '../src/game/business/tech-waves'
import type { Industry } from '../src/game/data/markets'
import { HISTORY_WAVES } from '../src/game/history/tech-waves'
import { outcomeTag } from '../src/game/timeMachine'
import type { Asset, GameState } from '../src/game/types'
import { COUNTRIES, getCountry } from '../src/game/world'
import { ALL_IDEAS } from '../src/game/workshop/catalog'
import { license } from '../src/game/workshop/launch'
import { raceYear } from '../src/game/workshop/market'
import { gainLuck, originKey, readFrontier, frontierLead, frontierRows, frontierSpill, type FrontierRow } from '../src/game/world/frontier'
import { FIELDS, FIELD_IDS, fieldOfKind, type FieldId } from '../src/game/world/frontier-fields'
import { worldProblems } from '../src/game/world/invariants'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { adult, company, nextYear } from './market-kit'
import { give, idea, inventor } from './workshop-fixtures'

const at = (seed: number, year: number): GameState => { const g = makeTestGame(seed); g.year = year; return g }
const wave = (o: Partial<WaveInput> = {}): WaveInput => ({ kind: 'fusion', source: 'deeptech', origin: 'lab#reactor', name: 'Fusion power', size: 0.5, market: 'world', ...o })
const SOURCES = ['deeptech', 'heavy', 'workshop', 'race', 'effort'] as const
const FUTURE: readonly WaveKind[] = (() => { const used = new Set<string>(HISTORY_WAVES.map((w) => w.kind)); return (Object.keys(WAVE_KINDS) as WaveKind[]).filter((k) => !used.has(k)) })()

/** What the F1 formula gives for one disclosure: centi-years of lead and tenths of a point of spill (patent, the default). */
const lead = (g: GameState, field: FieldId, o: string, year: number, size: number, base = 200): number => Math.round(base * size * (0.8 + 0.4 * gainLuck(g, field, o, year)))
const spill = (size: number): number => Math.round(10 * (1 + 5 * size) * 0.5)
const problems = (g: GameState): string[] => worldProblems(g).filter((p) => p.startsWith('frontier'))
const rowsOf = (g: GameState): { field: FieldId; row: FrontierRow }[] => FIELD_IDS.flatMap((field) => frontierRows(g, field).map((row) => ({ field, row })))

describe('a wave a writer stores pushes the frontier', () => {
  it('each source of a future kind in 2030 adds one you row to the field of its kind, with the lead and the spill of the formula', () => {
    for (const source of SOURCES) {
      const g = at(3, 2030)
      const w = announceWave(g, wave({ source }))!
      expect(w, source).not.toBeNull()
      const o = originKey(w.id)
      expect(frontierRows(g, 'fusion'), source).toEqual([{ y: 2030, w: 'you', m: 'world', d: lead(g, 'fusion', o, 2030, 0.5), o }])
      const d = frontierRows(g, 'fusion')[0].d
      expect(d, source).toBeGreaterThanOrEqual(80); expect(d, source).toBeLessThanOrEqual(120)
      expect(frontierLead(g, 'fusion'), source).toBeCloseTo(d / 100, 9)
      expect(readFrontier(g).f.fusion!.pub, source).toBe(spill(0.5))
      expect(frontierSpill(g, 'fusion'), source).toBe(2)
      expect(rowsOf(g), source).toHaveLength(1)
      expect(problems(g), source).toEqual([])
    }
  })
  it('the row is keyed by the wave id, and the market is the wave market', () => {
    const g = at(3, 2031)
    const w = announceWave(g, wave({ kind: 'chips', market: 'us', origin: 'fab#leap', size: 0.35 }))!
    expect(frontierRows(g, 'chips')).toEqual([{ y: 2031, w: 'you', m: 'us', d: lead(g, 'chips', originKey(w.id), 2031, 0.35), o: originKey(w.id) }])
    expect(readFrontier(g).f.chips!.pub).toBe(spill(0.35))
  })
  it('every future kind pushes the field of the same name', () => {
    expect(FUTURE).toHaveLength(12)
    for (const kind of FUTURE) {
      const g = at(3, 2032)
      announceWave(g, wave({ kind, origin: `o-${kind}`, name: WAVE_KINDS[kind].label }))
      expect(rowsOf(g).map((r) => r.field), kind).toEqual([kind])
      expect(fieldOfKind(kind), kind).toBe(kind)
    }
  })
  it('every country is a market a row accepts', () => {
    expect(COUNTRIES.length).toBeGreaterThan(10)
    for (const c of COUNTRIES) {
      const g = at(3, 2030)
      announceWave(g, wave({ market: c.id, home: c.id }))
      expect(frontierRows(g, 'fusion').map((r) => r.m), c.id).toEqual([c.id])
    }
  })
  it('a repeat adds nothing: the stored wave comes back and the shard is the same object', () => {
    const g = at(3, 2030)
    const w = announceWave(g, wave())!
    const shard = readFrontier(g), json = JSON.stringify(g.world)
    expect(announceWave(g, wave())).toBe(readTechWaves(g)[0]); expect(announceWave(g, wave())!.id).toBe(w.id)
    expect(readFrontier(g)).toBe(shard); expect(JSON.stringify(g.world)).toBe(json); expect(rowsOf(g)).toHaveLength(1)
  })
  it('a repeat on a deep-frozen state writes nothing and does not throw', () => {
    const g = at(3, 2030); announceWave(g, wave()); deepFreeze(g)
    expect(() => announceWave(g, wave())).not.toThrow()
    expect(rowsOf(g)).toHaveLength(1)
  })
  it('a history kind, a year up to 2026 and an unknown field push nothing, and leave g.world undefined', () => {
    const smartphone = at(3, 2030)
    expect(announceWave(smartphone, wave({ kind: 'smartphone' }))).not.toBeNull(); expect(smartphone.world).toBeUndefined()
    const cloud = at(3, 2010)
    expect(announceWave(cloud, wave({ kind: 'cloud' }))).not.toBeNull(); expect(cloud.world).toBeUndefined()
    for (const year of [2026, 2025, 2000]) {
      const g = at(3, 2030)
      expect(announceWave(g, wave({ year })), String(year)).not.toBeNull(); expect(g.world, String(year)).toBeUndefined()
      const now = at(3, year)
      expect(announceWave(now, wave()), `g.year ${year}`).not.toBeNull(); expect(now.world, `g.year ${year}`).toBeUndefined()
    }
    const junk = at(3, 2030)
    expect(announceWave(junk, wave({ field: 'nope' as FieldId }))).not.toBeNull(); expect(junk.world).toBeUndefined()
    for (const field of ['constructor', '__proto__', '', 'ai.', 7 as never, null as never]) {
      const g = at(3, 2030); announceWave(g, wave({ field: field as FieldId })); expect(g.world, String(field)).toBeUndefined()
    }
  })
  it('a wave dated after the present (a heavy launch year) pushes at the present, and one dated 2027 in 2026 pushes nothing', () => {
    const g = at(3, 2030)
    const w = announceWave(g, wave({ source: 'heavy', year: 2031 }))!
    expect(w.year).toBe(2031)
    expect(frontierRows(g, 'fusion').map((r) => r.y)).toEqual([2030])
    const old = at(3, 2026)
    expect(announceWave(old, wave({ source: 'heavy', year: 2027 }))).not.toBeNull(); expect(old.world).toBeUndefined()
  })
  it('a year dated in the past after 2026 pushes in that year', () => {
    const g = at(3, 2040)
    announceWave(g, wave({ year: 2035 }))
    expect(frontierRows(g, 'fusion').map((r) => r.y)).toEqual([2035])
  })
  it('a.field narrows the push to an AI capability: spill only, no lead, and the ai field itself gets nothing', () => {
    const g = at(3, 2030)
    announceWave(g, wave({ kind: 'ai', field: 'ai.reasoning', origin: 'lab#r', name: 'Frontier reasoning', size: 0.4 }))
    expect(rowsOf(g).map((r) => r.field)).toEqual(['ai.reasoning'])
    expect(readFrontier(g).f.ai).toBeUndefined()
    expect(frontierRows(g, 'ai.reasoning')[0]).toMatchObject({ y: 2030, w: 'you', m: 'world', d: 0 })
    expect(frontierLead(g, 'ai.reasoning')).toBe(0); expect(frontierLead(g, 'ai')).toBe(0)
    expect(readFrontier(g)['f']['ai.reasoning']!.pub).toBe(spill(0.4))
    expect(frontierSpill(g, 'ai.reasoning')).toBe(Math.round(spill(0.4) / 10))
    expect(problems(g)).toEqual([])
  })
  it('without a.field a kind ai wave pushes the ai field and gains a lead', () => {
    const g = at(3, 2030)
    announceWave(g, wave({ kind: 'ai', origin: 'lab#m1', name: 'Frontier AI', size: 0.4 }))
    expect(rowsOf(g).map((r) => r.field)).toEqual(['ai']); expect(frontierLead(g, 'ai')).toBeGreaterThan(0)
  })
  it('a field that does not belong to the kind of the wave pushes nothing', () => {
    const g = at(3, 2030)
    announceWave(g, wave({ kind: 'fusion', field: 'ai.reasoning' })); announceWave(g, wave({ kind: 'ai', origin: 'x', field: 'fusion' }))
    expect(g.world).toBeUndefined(); expect(readTechWaves(g)).toHaveLength(2)
  })
  it('the wave rules still hold: a third non-rival wave of a year is refused and pushes nothing, a rival wave is not counted', () => {
    const g = at(3, 2030)
    expect(announceWave(g, wave({ kind: 'fusion', origin: 'a' }))).not.toBeNull(); expect(announceWave(g, wave({ kind: 'chips', origin: 'b' }))).not.toBeNull()
    expect(announceWave(g, wave({ kind: 'quantum', origin: 'c' }))).toBeNull()
    expect(rowsOf(g).map((r) => r.field).sort()).toEqual(['chips', 'fusion'])
    expect(announceWave(g, wave({ kind: 'space', source: 'rival', origin: 'd' }))).not.toBeNull()
    expect(rowsOf(g).map((r) => `${r.field}:${r.row.w}`).sort()).toEqual(['chips:you', 'fusion:you', 'space:rival'])
    g.year = 2031
    expect(announceWave(g, wave({ kind: 'quantum', origin: 'c' }))).not.toBeNull(); expect(frontierRows(g, 'quantum').map((r) => r.y)).toEqual([2031])
  })
  it('a rival wave pushes a rival row with the base of 1.5 years', () => {
    const g = at(3, 2030)
    const w = announceWave(g, wave({ kind: 'ai', source: 'rival', origin: 'aiLab|world', name: 'Frontier AI', size: 0.4 }))!
    expect(frontierRows(g, 'ai')).toEqual([{ y: 2030, w: 'rival', m: 'world', d: lead(g, 'ai', originKey(w.id), 2030, 0.4, 150), o: originKey(w.id) }])
  })
  it('a refused wave (the 65th) pushes nothing', () => {
    const g = at(3, 2031)
    for (let i = 0; i < 70; i++) { g.year = 2031 + (i % 40); announceWave(g, wave({ kind: 'ai', source: 'rival', origin: `r${i}`, name: 'Frontier AI' })) }
    expect(readTechWaves(g)).toHaveLength(64)
    const before = JSON.stringify(g.world); g.year = 2090
    expect(announceWave(g, wave({ kind: 'drug', origin: 'late' }))).toBeNull(); expect(JSON.stringify(g.world)).toBe(before)
  })
  it('draws nothing on the game random stream and writes the shard in g.world, never in g.flags', () => {
    const g = at(3, 2030); const rng = g.rng, nextId = g.nextId
    announceWave(g, wave()); announceWave(g, wave({ kind: 'chips', origin: 'b' }))
    expect([g.rng, g.nextId]).toEqual([rng, nextId])
    expect(Object.keys(g.flags).filter((k) => /frontier/i.test(k))).toEqual([]); expect(JSON.stringify(g.flags)).not.toContain('frontier'); expect(g.world && 'frontier' in g.world).toBe(true)
  })
  it('a Time Machine fork re-rolls the luck of the year after it and keeps a finished one', () => {
    const plain = at(3, 2031), forked = at(3, 2031)
    forked.flags.timelineForks = [{ year: 2030, salt: 'abc' }]
    const origins = Array.from({ length: 8 }, (_, i) => `o${i}`)
    const leads = (g: GameState, year: number): number[] => origins.map((origin) => { const x = structuredClone(g); x.year = year; announceWave(x, wave({ origin, year })); return frontierRows(x, 'fusion')[0].d })
    expect(leads(forked, 2029)).toEqual(leads(plain, 2029))
    expect(leads(forked, 2031)).not.toEqual(leads(plain, 2031))
    expect(leads(structuredClone(plain), 2031)).toEqual(leads(plain, 2031))
  })
})

describe('the real writers push without an edit', () => {
  it('a deep-tech breakthrough (the fusion net energy gain of a lab) adds a you row to fusion', () => {
    const { g, a } = fusionYear()
    const [w] = readTechWaves(g)
    expect(w).toMatchObject({ source: 'deeptech', kind: 'fusion', origin: `${a.id}#netGain` })
    expect(frontierRows(g, 'fusion')).toEqual([{ y: 2030, w: 'you', m: 'world', d: lead(g, 'fusion', originKey(w.id), 2030, w.size), o: originKey(w.id) }])
    expect(problems(g)).toEqual([])
  })
  it('a pioneer heavy launch (dated the year after it, as the record is) pushes the ai field at the present', () => {
    const { g, rec } = heavyLaunch('software', 'Autonomous Agent Platform', 2030)
    const [w] = readTechWaves(g)
    expect(w).toMatchObject({ source: 'heavy', kind: 'ai', year: rec.year }); expect(rec.year).toBeGreaterThan(g.year)
    expect(frontierRows(g, 'ai').map((r) => ({ y: r.y, w: r.w, o: r.o }))).toEqual([{ y: g.year, w: 'you', o: originKey(w.id) }])
  })
  it('a Workshop race win (a future idea beaten) pushes the field of its kind in the year it was beaten', () => {
    const def = ALL_IDEAS.find((i) => i.id === 'fut-cold-cure')!
    const g = inventor({ genius: true, year: 2010 })
    g.year = raceYear(g, def)! - 1
    give(g, def.id, 80); license(g, idea(def.id))
    const [w] = readTechWaves(g)
    expect(w).toMatchObject({ source: 'race', kind: 'drug' })
    expect(frontierRows(g, 'drug')).toEqual([{ y: g.year, w: 'you', m: 'world', d: lead(g, 'drug', originKey(w.id), g.year, w.size), o: originKey(w.id) }])
  })
  it('a history idea (a workshop wave of a history kind) pushes nothing', () => {
    const g = inventor({ genius: true, year: 1963, age: 40 })
    give(g, 'hist-pocket-telephone', 85); license(g, idea('hist-pocket-telephone'))
    expect(readTechWaves(g)[0]).toMatchObject({ source: 'workshop', kind: 'mobilephone' }); expect(g.world).toBeUndefined()
  })
})

describe('rival landings push the frontier', () => {
  const lab = (year: number): GameState => {
    const g = makeTestGame(9, { age: 40, money: 1e9, countryId: 'us' }); g.year = year
    g.assets.push(createBusinessAsset(g, 'Lab', newBiz(g, 'aiLab', 'us', getCountry('us').cities[0], { cash: 1e8, founded: 2020 }), 1e8))
    return g
  }
  const fam = (g: GameState, y: number): string => `${familyId(g.lifeId)}${outcomeTag(g, y)}`
  const landing = (g: GameState): number => { let y = g.year; while (!rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y; return y }
  it('a landing year adds one rival row to ai with the market of the wave, and a repeat adds nothing', () => {
    const g = lab(2027), y = landing(g)
    landRivalWaves(g)
    const [w] = readTechWaves(g)
    expect(w).toMatchObject({ source: 'rival', kind: 'ai', year: y })
    expect(w.market).toBe(marketKey(bizOf(g, g.assets[0] as Asset)))
    expect(frontierRows(g, 'ai')).toEqual([{ y, w: 'rival', m: w.market, d: lead(g, 'ai', originKey(w.id), y, w.size, 150), o: originKey(w.id) }])
    const json = JSON.stringify(g.world); landRivalWaves(g)
    expect(JSON.stringify(g.world)).toBe(json); expect(rowsOf(g)).toHaveLength(1)
  })
  it('a miss year, 2026 and a life with no company push nothing', () => {
    const g = lab(2027); let y = 2027; while (rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y
    landRivalWaves(g); expect(g.world).toBeUndefined()
    const old = lab(2020); for (let h = 1990; h <= 2026; h++) { old.year = h; landRivalWaves(old) } expect(old.world).toBeUndefined()
    const none = makeTestGame(9); for (let h = 2027; h < 2060; h++) { none.year = h; landRivalWaves(none) } expect(none.world).toBeUndefined()
  })
  it('the landing draw is untouched: rivalWave gives the same tuples as before for 60 years, four trades', () => {
    const out: string[] = []
    for (const trade of ['aiLab', 'semiconductor', 'fusion', 'biotech']) {
      for (let y = 2027; y < 2087; y++) { const r = rivalWave('fam-pin', trade, y); if (r) out.push(`${trade}:${y}:${r.kind}:${r.size.toFixed(6)}`) }
    }
    expect(out).toEqual([
      'aiLab:2028:ai:0.362118', 'aiLab:2035:ai:0.450665', 'aiLab:2037:ai:0.350855', 'aiLab:2038:ai:0.230347', 'aiLab:2056:ai:0.475886', 'aiLab:2061:ai:0.512354', 'aiLab:2063:ai:0.472992', 'aiLab:2075:ai:0.588376',
      'semiconductor:2029:chips:0.456283', 'semiconductor:2031:chips:0.456188', 'semiconductor:2035:chips:0.498266', 'semiconductor:2043:chips:0.314138', 'semiconductor:2079:chips:0.319890', 'semiconductor:2081:chips:0.363963',
      'fusion:2027:fusion:0.346446', 'fusion:2033:fusion:0.331545', 'fusion:2039:fusion:0.342742', 'fusion:2041:fusion:0.567775', 'fusion:2048:fusion:0.489852', 'fusion:2080:fusion:0.552026',
      'biotech:2037:drug:0.562867', 'biotech:2051:drug:0.309429', 'biotech:2074:drug:0.285157', 'biotech:2075:drug:0.526666', 'biotech:2076:drug:0.513668',
    ])
  })
  it('sixty years of landings keep the shard sound and the same seed gives the same shard; g.rng is untouched', () => {
    const run = (): { g: GameState; rng: number } => { const g = lab(2027), rng = g.rng; for (let y = 2027; y < 2090; y++) { g.year = y; landRivalWaves(g) } return { g, rng } }
    const { g, rng } = run()
    expect(JSON.stringify(g.world)).toBe(JSON.stringify(run().g.world))
    expect(g.rng).toBe(rng)
    expect(frontierRows(g, 'ai').length).toBeGreaterThan(0); expect(frontierRows(g, 'ai').every((r) => r.w === 'rival')).toBe(true)
    expect(problems(g)).toEqual([]); expect(frontierLead(g, 'ai')).toBeLessThanOrEqual(12)
  })
})

describe('announceResearch pushes once per disclosure', () => {
  const dis = (o: Partial<Parameters<typeof announceResearch>[1]> = {}) => ({ field: 'fusion', name: 'Fusion power', size: 0.5, origin: 'lab#reactor', ...o })
  it('size 0.1 makes no wave and pushes once; a repeat pushes nothing', () => {
    const g = at(3, 2031)
    expect(announceResearch(g, dis({ size: 0.1 }))).toBeNull(); expect(readTechWaves(g)).toEqual([])
    const o = originKey('effort:lab#reactor')
    expect(frontierRows(g, 'fusion')).toEqual([{ y: 2031, w: 'you', m: 'world', d: lead(g, 'fusion', o, 2031, 0.1), o }])
    expect(readFrontier(g).f.fusion!.pub).toBe(spill(0.1))
    const json = JSON.stringify(g.world)
    expect(announceResearch(g, dis({ size: 0.1 }))).toBeNull(); expect(JSON.stringify(g.world)).toBe(json)
  })
  it('size 0.5 makes a wave and pushes once, through the wave, never twice', () => {
    const g = at(3, 2031)
    const w = announceResearch(g, dis())!
    expect(w).toMatchObject({ source: 'effort', kind: 'fusion' })
    expect(frontierRows(g, 'fusion')).toEqual([{ y: 2031, w: 'you', m: 'world', d: lead(g, 'fusion', originKey(w.id), 2031, 0.5), o: originKey(w.id) }])
    expect(readFrontier(g).f.fusion!.pub).toBe(spill(0.5))
    const json = JSON.stringify(g.world)
    expect(announceResearch(g, dis())).toBe(readTechWaves(g)[0]); expect(JSON.stringify(g.world)).toBe(json)
  })
  it('the edge: 0.2 makes a wave, 0.19 does not, and each pushes once', () => {
    const a = at(3, 2031), b = at(3, 2031)
    expect(announceResearch(a, dis({ size: 0.2 }))).not.toBeNull(); expect(announceResearch(b, dis({ size: 0.19 }))).toBeNull()
    expect(rowsOf(a)).toHaveLength(1); expect(rowsOf(b)).toHaveLength(1); expect(readTechWaves(a)).toHaveLength(1); expect(readTechWaves(b)).toHaveLength(0)
  })
  it('a refused wave (the third of a year) still pushes once, and a repeat pushes nothing', () => {
    const g = at(3, 2031)
    announceResearch(g, dis({ origin: 'a' })); announceResearch(g, dis({ origin: 'b' }))
    expect(rowsOf(g)).toHaveLength(2)
    expect(announceResearch(g, dis({ origin: 'c' }))).toBeNull(); expect(readTechWaves(g)).toHaveLength(2)
    expect(rowsOf(g)).toHaveLength(3)
    expect(frontierRows(g, 'fusion').some((r) => r.o === originKey('effort:c'))).toBe(true)
    const json = JSON.stringify(g.world)
    expect(announceResearch(g, dis({ origin: 'c' }))).toBeNull(); expect(JSON.stringify(g.world)).toBe(json)
  })
  it('a field of an AI capability makes a wave of kind ai and pushes that capability, not ai', () => {
    const g = at(3, 2031)
    const w = announceResearch(g, dis({ field: 'ai.reasoning', name: 'Frontier reasoning', origin: 'lab#r', size: 0.4 }))!
    expect(w.kind).toBe('ai')
    expect(rowsOf(g)).toEqual([{ field: 'ai.reasoning', row: { y: 2031, w: 'you', m: 'world', d: 0, o: originKey(w.id) } }])
    const small = at(3, 2031)
    expect(announceResearch(small, dis({ field: 'ai.coding', origin: 'lab#c', size: 0.1 }))).toBeNull()
    expect(rowsOf(small).map((r) => r.field)).toEqual(['ai.coding'])
  })
  it('research in 2026 or earlier is history: no wave, no push, no world', () => {
    for (const year of [2026, 2020, 1990]) {
      const g = at(3, year)
      expect(announceResearch(g, dis({ size: 0.1 })), String(year)).toBeNull(); expect(g.world, String(year)).toBeUndefined()
      expect(announceResearch(g, dis({ size: 0.6, origin: 'big' }))?.year ?? year, String(year)).toBe(year); expect(g.world, String(year)).toBeUndefined()
    }
  })
  it('the market of the disclosure is the market of the row', () => {
    const g = at(3, 2031)
    announceResearch(g, dis({ size: 0.1, market: 'us', origin: 'm' }))
    expect(frontierRows(g, 'fusion')[0].m).toBe('us')
  })
  it('an origin too long for a row is hashed, and two long origins stay two rows', () => {
    const g = at(3, 2031), long = (c: string): string => `lab#${c.repeat(90)}`
    announceResearch(g, dis({ size: 0.1, origin: long('a') })); announceResearch(g, dis({ size: 0.1, origin: long('b') }))
    expect(frontierRows(g, 'fusion')).toHaveLength(2)
  })
  it('a damaged disclosure pushes nothing and leaves g.world undefined', () => {
    const g = at(3, 2031); const before = JSON.stringify(g)
    for (const field of ['cloud', 'smartphone', 'nope', '', '__proto__', 'constructor', 'ai.', 'ai.nope', 'AI', 'fusion ', 7, null, undefined]) {
      expect(announceResearch(g, dis({ field: field as never })), String(field)).toBeNull()
    }
    for (const size of [0, -1, NaN, Infinity, 'big', null]) expect(announceResearch(g, dis({ size: size as never })), String(size)).toBeNull()
    for (const d of [null, undefined, 7, 'x', [], {}] as never[]) expect(announceResearch(g, d)).toBeNull()
    for (const patch of [{ name: '' }, { name: 7 }, { market: 'zz' }, { market: 7 }, { origin: 7 }, { origin: '' }, { origin: '   ' }]) expect(announceResearch(g, dis({ size: 0.1, ...patch } as never)), JSON.stringify(patch)).toBeNull()
    expect(JSON.stringify(g)).toBe(before); expect(g.world).toBeUndefined()
  })
  it('draws nothing on the game random stream', () => {
    const g = at(3, 2031); const rng = g.rng, nextId = g.nextId
    announceResearch(g, dis()); announceResearch(g, dis({ origin: 'b', size: 0.1 }))
    expect([g.rng, g.nextId]).toEqual([rng, nextId])
  })
  it('the 20 fields of FIELDS and kindOfField agree: each field pushes through its own disclosure', () => {
    expect(FIELD_IDS).toHaveLength(20)
    for (const field of FIELD_IDS) {
      const kind = kindOfField(field)
      expect(kind, field).not.toBeNull()
      expect(fieldOfKind(kind!), field).toBe(FIELDS[field].parent ?? field)
      const g = at(3, 2031)
      announceResearch(g, dis({ field, origin: `o-${field}`, size: 0.1 }))
      expect(rowsOf(g).map((r) => r.field), field).toEqual([field])
    }
    expect(CAP_IDS.map((c) => kindOfField(`ai.${c}`))).toEqual(CAP_IDS.map(() => 'ai'))
  })
})

describe('pushFromWave', () => {
  it('pushes a stored wave once and reports the writer\'s answer', () => {
    const g = at(3, 2030)
    const w = announceWave(g, wave())!
    const again = pushFromWave(g, w)
    expect(again).toEqual({ applied: false, why: 'repeat' })
  })
  it('is null for a history kind or an unknown field, and refuses a history year without a write', () => {
    const g = at(3, 2030)
    const w = announceWave(g, wave({ kind: 'smartphone' }))!
    expect(pushFromWave(g, w)).toBeNull(); expect(pushFromWave(g, w, 'nope')).toBeNull(); expect(pushFromWave(g, w, '__proto__')).toBeNull()
    const old = { ...announceWave(at(3, 2030), wave())!, year: 2026 }
    expect(pushFromWave(g, old)).toEqual({ applied: false, why: 'history' }); expect(g.world).toBeUndefined()
  })
  it('takes a field only when it belongs to the kind of the wave', () => {
    const g = at(3, 2030)
    const w = { ...announceWave(at(3, 2030), wave({ kind: 'ai', origin: 'z' }))!, id: 'deeptech:ai:2030:zz' }
    expect(pushFromWave(g, w, 'fusion')).toBeNull(); expect(g.world).toBeUndefined()
    expect(pushFromWave(g, w, 'ai.vision')).toMatchObject({ applied: true, lead: 0 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Fixtures of test/tech-waves-writers.test.ts, copied: a lab with one finished program, and a pioneer heavy launch.
// ---------------------------------------------------------------------------------------------------------------------------

function lab(industry: Industry, patch: Record<string, unknown>): { g: GameState; a: Asset } {
  const g = makeTestGame(30, { age: 35, money: 1e9, countryId: 'us' })
  g.queue = []; g.year = 2030
  const city = getCountry('us').cities[0]
  const b0 = newBiz(g, industry, 'us', city, { cash: 5e9 })
  b0.outlets = [{ countryId: 'us', city, count: 1, opened: 2025 }]
  const t = readTech(undefined)
  Object.assign(t, { level: 80, venture: 0 }, patch)
  b0.tech = JSON.parse(JSON.stringify(t)) as never
  const a = createBusinessAsset(g, 'Lab Co', b0, 0)
  g.assets.push(a); becomeCeo(g, a, b0)
  return { g, a }
}

/** One lab year with the fusion net-gain program finished, over seeds until it works. */
function fusionYear(): { g: GameState; a: Asset } {
  const def = programDef('fusion', 'netGain')!
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a } = lab('fusion', { stage: 1, level: 80, done: ['magnets', 'shot'] })
    const b = bizOf(g, a), t = techOf(b)
    const p = startProgram(g, b, t, def, 3)
    if (!p) throw new Error('netGain cannot start')
    const before = timesDone(t, 'netGain')
    p.progress = p.years; g.rng = seed
    simulateDeepTechYearImpl(g, a, b, g.year, 0)
    if (timesDone(techOf(b), 'netGain') > before) return { g, a }
  }
  throw new Error('netGain did not work in 80 seeds')
}

function heavyLaunch(trade: Industry, name: string, year: number): { g: GameState; rec: { year: number } } {
  for (let seed = 1; seed <= 80; seed++) {
    const g = adult(seed, year, 'us'), a = company(g, trade, { cash: 80_000_000 })
    nextYear(g); g.queue = []
    const b = bizOf(g, a)
    const p: RdProject = { id: 'rd-w', name, budget: 2e6, years: 4, progress: 4, odds: 0.98, boost: 0, quality: 80, family: name, kind: 'breakthrough', heavy: true, cost: 2e6, started: g.year - 4 }
    if (!advanceHeavy(g, a, b, p, g.year).won) continue
    return { g, rec: readHeavy(g, trade, marketKey(b)).find((r) => r.family === name)! }
  }
  throw new Error(`no launch of ${name} won in 80 seeds`)
}
