// R3-F3 (C.6 c): the `effort` wave source and the disclose port. A new source follows the rules of the others (one wave per origin, two
// non-rival waves a year, 64 stored, refused where a history row of the kind is live) and a future domain reaches it through the
// port `business.discloseResearch`. Nothing here uses the frontier shard yet (R3-F4 adds the push). No pinned seed: states come from
// `makeTestGame(n)` and `adult(n, year, country)` with positional arguments.
import { describe, expect, it, vi } from 'vitest'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { killCharacter } from '../src/game/death'
import { discloseResearch, type ResearchDisclosure } from '../src/game/business/contract'
import { hashOf } from '../src/game/business/product-market'
import { EFFORT_WAVE_MIN, MAX_WAVES, advanceTechWaves, announceResearch, announceWave, readTechWaves, roleOf, waveDraw, waveWorldFlags, type TechWave } from '../src/game/business/tech-waves'
import { kindOfField } from '../src/game/business/frontier-waves'
import { WAVE_KINDS, type WaveKind } from '../src/game/business/tech-wave-data'
import { economyState } from '../src/game/economy'
import { readMarketNews } from '../src/game/history/market-events'
import { HISTORY_WAVES } from '../src/game/history/tech-waves'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { adult, company, nextYear } from './market-kit'

const disclosure = (o: Partial<ResearchDisclosure> = {}): ResearchDisclosure => ({ field: 'fusion', name: 'Fusion power', size: 0.5, origin: 'lab#reactor', ...o })
const input = { kind: 'ai', source: 'deeptech', origin: 'biz1#frontier', name: 'Frontier AI', size: 0.6, market: 'world' } as const
const J = (v: unknown): Json => v as Json
const at = (seed: number, year: number): GameState => { const g = makeTestGame(seed); g.year = year; return g }
const calmOrigin = (g: GameState, kind: string, year: number): string => {
  for (let i = 0; ; i++) { const o = `calm${i}`; if (!waveDraw(g, `effort:${kind}:${year - 1}:${hashOf(o).toString(36)}`, year).stall) return o }
}
const FUTURE: readonly string[] = (() => { const used = new Set<string>(HISTORY_WAVES.map((w) => w.kind)); return (Object.keys(WAVE_KINDS) as WaveKind[]).filter((k) => !used.has(k)) })()

describe('the effort source is a real wave source', () => {
  it('announceWave stores an effort wave (cleanWave knows the source), once per id', () => {
    const g = at(3, 2031)
    const w = announceWave(g, { ...input, source: 'effort', origin: 'lab#reactor' })!
    expect(w).not.toBeNull()
    expect(w).toMatchObject({ source: 'effort', kind: 'ai', year: 2031, market: 'world', size: 0.6, delivery: 0, origin: 'lab#reactor' })
    expect(w.id).toBe(`effort:ai:2031:${hashOf('lab#reactor').toString(36)}`)
    expect(announceWave(g, { ...input, source: 'effort', origin: 'lab#reactor' })).toBe(readTechWaves(g)[0])
    expect(readTechWaves(g)).toHaveLength(1)
  })
  it('survives a JSON reload of the flags', () => {
    const g = at(3, 2031); announceResearch(g, disclosure({ origin: 'lab#a' }))
    const back = makeTestGame(3); back.year = 2031; back.flags = JSON.parse(JSON.stringify(g.flags)) as Record<string, Json>
    expect(readTechWaves(back)).toEqual(readTechWaves(g)); expect(readTechWaves(back)[0].source).toBe('effort')
  })
  it('a hostile stored source is still dropped', () => {
    const g = at(3, 2031); announceResearch(g, disclosure())
    const raw = (g.flags.techWaves as Json[])[0] as Record<string, Json>
    g.flags.techWaves = J([{ ...raw, source: 'effort2' }, { ...raw, id: 'x', source: 'constructor' }, { ...raw, id: 'y', source: 'effort' }])
    expect(readTechWaves(g).map((w) => w.id)).toEqual(['y'])
  })
  it('is carried to an heir through waveWorldFlags and continueAsChild', () => {
    const g = adult(11, 2030, 'us'); company(g, 'restaurant', { name: 'Handoff Diner' }); nextYear(g); g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    const w = announceResearch(g, disclosure({ origin: 'lab#heir' }))!
    expect(waveWorldFlags(g).techWaves).toHaveLength(1)
    killCharacter(g, 'Old Age'); g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    expect(readTechWaves(n)).toEqual(readTechWaves(g)); expect(readTechWaves(n)[0]).toMatchObject({ id: w.id, source: 'effort' })
    expect(JSON.parse(JSON.stringify(n.flags))).toEqual(n.flags)
  })
})

describe('the wave rules hold for the new source', () => {
  it('a third non-rival wave of a year is refused whatever the source, and a rival wave is not counted', () => {
    const sources = ['effort', 'deeptech', 'workshop', 'race', 'heavy'] as const
    for (const first of sources) for (const second of sources) for (const third of sources) {
      const g = at(3, 2031)
      expect(announceWave(g, { ...input, source: first, origin: 'o1' }), `${first} 1`).not.toBeNull()
      expect(announceWave(g, { ...input, source: second, origin: 'o2' }), `${second} 2`).not.toBeNull()
      expect(announceWave(g, { ...input, source: third, origin: 'o3' }), `${third} 3`).toBeNull()
      expect(announceWave(g, { ...input, source: 'rival', origin: 'o4' }), 'rival').not.toBeNull()
      expect(readTechWaves(g).filter((w) => w.source !== 'rival')).toHaveLength(2)
    }
  })
  it('two effort waves in one year fill the year; a different year is a fresh allowance', () => {
    const g = at(3, 2031)
    expect([announceResearch(g, disclosure({ origin: 'a' })), announceResearch(g, disclosure({ origin: 'b' }))].every(Boolean)).toBe(true)
    expect(announceResearch(g, disclosure({ origin: 'c' }))).toBeNull()
    g.year = 2032
    expect(announceResearch(g, disclosure({ origin: 'c' }))).not.toBeNull()
  })
  it('is refused where a history row of the kind is live (the effort wave is not exempt as a deep-tech one is)', () => {
    // 'ai' and the other future kinds have no history row, so the refusal is shown on a kind that has one, through announceWave.
    const g = at(3, 2010)
    expect(announceWave(g, { ...input, kind: 'cloud', source: 'effort', origin: 'x' })).toBeNull()
    expect(announceWave(g, { ...input, kind: 'cloud', source: 'deeptech', origin: 'x' })).not.toBeNull()
  })
  it('a flood of rival waves stops at 64, and an effort wave after it is refused', () => {
    const g = at(3, 2031)
    for (let i = 0; i < 90; i++) { g.year = 2031 + (i % 40); announceWave(g, { ...input, source: 'rival', origin: `r${i}` }) }
    expect(readTechWaves(g)).toHaveLength(MAX_WAVES)
    g.year = 2090
    expect(announceResearch(g, disclosure({ origin: 'late' }))).toBeNull()
    expect(readTechWaves(g)).toHaveLength(MAX_WAVES)
  })
})

describe('announceResearch', () => {
  it('maps the field to a kind and stores the wave with source effort', () => {
    const g = at(3, 2031)
    const w = announceResearch(g, disclosure({ field: 'ai.reasoning', name: 'Frontier reasoning', origin: 'lab#r', size: 0.4, home: 'us' }))!
    expect(w).toMatchObject({ source: 'effort', kind: 'ai', name: 'Frontier reasoning', origin: 'lab#r', size: 0.4, market: 'world', home: 'us', year: 2031 })
    const f = announceResearch(g, disclosure({ field: 'fusion', origin: 'lab#f', market: 'us' }))!
    expect(f).toMatchObject({ kind: 'fusion', market: 'us' })
  })
  it('refuses cloud, junk, __proto__ and a non-string field, with no throw and no write', () => {
    const g = at(3, 2031); const before = JSON.stringify(g)
    for (const field of ['cloud', 'smartphone', 'nope', '', '__proto__', 'constructor', 'ai.', 'ai.nope', 'AI', 'fusion ', 7 as never, null as never, undefined as never]) {
      expect(announceResearch(g, disclosure({ field })), String(field)).toBeNull()
    }
    expect(JSON.stringify(g)).toBe(before)
  })
  it('refuses a size under 0.2 and takes 0.2 exactly', () => {
    const g = at(3, 2031)
    expect(EFFORT_WAVE_MIN).toBe(0.2)
    for (const size of [0.19, 0.1, 0, -1, NaN, Infinity * 0, 'big' as never, null as never]) expect(announceResearch(g, disclosure({ size })), String(size)).toBeNull()
    expect(readTechWaves(g)).toEqual([])
    const w = announceResearch(g, disclosure({ size: 0.2 }))
    expect(w).not.toBeNull(); expect(w!.size).toBe(0.2)
  })
  it('survives hostile input without a throw', () => {
    const g = at(3, 2031)
    for (const d of [null, undefined, 7, 'x', [], {}] as unknown as ResearchDisclosure[]) expect(announceResearch(g, d)).toBeNull()
    expect(announceResearch(g, disclosure({ name: '' }))).toBeNull()
    expect(announceResearch(g, disclosure({ market: 'zz' }))).toBeNull()
    expect(announceResearch(g, disclosure({ origin: 7 as never }))).toBeNull()
    expect(announceResearch(g, disclosure({ origin: '' }))).toBeNull()
    expect(announceResearch(g, disclosure({ origin: '   ' }))).toBeNull()
    expect(readTechWaves(g)).toEqual([])
  })
  it('returns the stored wave on a repeat and writes nothing on a deep-frozen state', () => {
    const g = at(3, 2031); const w = announceResearch(g, disclosure())!
    const rng = g.rng, nextId = g.nextId; deepFreeze(g)
    expect(announceResearch(g, disclosure())).toBe(readTechWaves(g)[0]); expect(readTechWaves(g)[0].id).toBe(w.id)
    // A size under 0.2 makes no wave but still moves the frontier (R3-F4), so it cannot be written on a frozen state: it is shown on an open one below.
    for (const d of [disclosure({ field: 'cloud' }), disclosure({ field: '__proto__' })]) expect(announceResearch(g, d)).toBeNull()
    expect([g.rng, g.nextId]).toEqual([rng, nextId]); expect(readTechWaves(g)).toHaveLength(1)
    const open = at(3, 2031)
    expect(announceResearch(open, disclosure({ size: 0.19 }))).toBeNull(); expect(readTechWaves(open)).toEqual([]); expect(open.flags.techWaves).toBeUndefined()
  })
  it('draws nothing on the game random stream', () => {
    const g = at(3, 2031); const rng = g.rng, nextId = g.nextId
    announceResearch(g, disclosure()); announceResearch(g, disclosure({ origin: 'b' }))
    expect([g.rng, g.nextId]).toEqual([rng, nextId])
  })
  it('the 12 kinds of kindOfField are the future-facing kinds, and the 8 ai.* fields are the capability ids', () => {
    expect(FUTURE).toHaveLength(12)
    expect(FUTURE.map((k) => kindOfField(k))).toEqual([...FUTURE])
    expect(CAP_IDS.map((c) => kindOfField(`ai.${c}`))).toEqual(CAP_IDS.map(() => 'ai'))
    for (const k of Object.keys(WAVE_KINDS)) if (!FUTURE.includes(k)) expect(kindOfField(k), k).toBeNull()
    expect([kindOfField('fusion'), kindOfField('ai.science'), kindOfField('cloud'), kindOfField('junk')]).toEqual(['fusion', 'ai', null, null])
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'ai.constructor', 'ai.__proto__']) expect(kindOfField(bad), bad).toBeNull()
  })
})

describe('the news of an effort wave', () => {
  const ids = (g: GameState) => readMarketNews(g).filter((n) => n.id.startsWith('wave-')).map((n) => n.id)
  const notices = (g: GameState) => g.queue.filter((m) => m.kind === 'notice' && m.id.startsWith('wave-'))
  it('posts one market news item for a trade the player runs and none for a trade they do not', () => {
    const run = adult(5, 2033, 'us'); company(run, 'energy'); run.queue = []
    const w = announceResearch(run, disclosure({ origin: 'a' }))!
    expect(roleOf('fusion', 'energy')).not.toBeNull()
    expect(ids(run)).toEqual([`wave-${w.id}`]); expect(notices(run)).toEqual([])
    const idle = adult(5, 2033, 'us'); company(idle, 'restaurant'); idle.queue = []
    announceResearch(idle, disclosure({ origin: 'a' }))
    expect(ids(idle)).toEqual([]); expect(notices(idle)).toEqual([])
    const none = adult(5, 2033, 'us'); announceResearch(none, disclosure({ origin: 'a' }))
    expect(ids(none)).toEqual([])
  })
  it('queues one notice when the wave is by the player\'s own asset, and none twice', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'restaurant'); g.queue = []
    const w = announceResearch(g, disclosure({ origin: 'a', by: a.id }))!
    expect(ids(g)).toEqual([`wave-${w.id}`])
    expect(notices(g)).toHaveLength(1); expect(notices(g)[0]).toMatchObject({ kind: 'notice', id: `wave-${w.id}`, tone: 'good' })
    announceResearch(g, disclosure({ origin: 'a', by: a.id })); announceResearch(g, disclosure({ origin: 'a', by: a.id }))
    expect(notices(g)).toHaveLength(1); expect(ids(g)).toHaveLength(1)
  })
  it('queues no notice for a trade the player runs when the wave is not by their own asset', () => {
    const g = adult(5, 2033, 'us'); const a: Asset = company(g, 'energy'); g.queue = []
    announceResearch(g, disclosure({ origin: 'a', by: 'someone-else' }))
    expect(a.id).not.toBe('someone-else'); expect(ids(g)).toHaveLength(1); expect(notices(g)).toEqual([])
  })
  it('the notice text is plain and short', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'restaurant'); g.queue = []
    announceResearch(g, disclosure({ origin: 'a', by: a.id, name: 'Fusion power' }))
    const m = notices(g)[0] as { title: string; text: string }
    expect(m.title).toBe('Fusion power Wave'); expect(m.text.length).toBeLessThanOrEqual(140); expect(m.text).toMatch(/Fusion|fusion/)
    expect([0x2013, 0x2014].some((c) => (m.text + m.title).includes(String.fromCharCode(c)))).toBe(false)
  })
  it('a rival wave and a heavy wave are as before (rival posts news, heavy posts nothing)', () => {
    const g = adult(5, 2033, 'us'); company(g, 'energy'); g.queue = []
    announceWave(g, { ...input, kind: 'fusion', source: 'rival', origin: 'energy|world' }); announceWave(g, { ...input, kind: 'fusion', source: 'heavy', origin: 'heavy.energy|world#Fusion Pilot Plant' })
    expect(ids(g)).toHaveLength(1)
  })
})

describe('the yearly step', () => {
  it('moves an effort wave by the seeded draw (no deliveryTarget), the same on a clone, and feeds the economy', () => {
    const g = at(7, 2031); const o = calmOrigin(g, 'fusion', 2032)
    const w = announceResearch(g, disclosure({ origin: o, home: 'us' }))!
    g.year = 2032
    const twin = structuredClone(g); const d = waveDraw(g, w.id, 2032)
    advanceTechWaves(g); advanceTechWaves(twin)
    expect(JSON.stringify(g.flags)).toBe(JSON.stringify(twin.flags))
    const [s] = readTechWaves(g)
    expect(s.last).toBe(2032); expect(s.delivery).toBeCloseTo(d.stall ? 0 : 0.08 + 0.22 * d.u, 9)
    expect(s.delivery).toBeGreaterThan(0)
    const tokens = (economyState(g)?.receipts ?? []).filter((r) => r.includes('wave:'))
    expect(tokens).toHaveLength(1)
    advanceTechWaves(g); expect((economyState(g)?.receipts ?? []).filter((r) => r.includes('wave:'))).toHaveLength(1)
  })
  it('a second step in the same year writes nothing', () => {
    const g = at(7, 2031); announceResearch(g, disclosure()); g.year = 2032
    advanceTechWaves(g); const after = g.flags.techWaves; advanceTechWaves(g)
    expect(g.flags.techWaves).toBe(after)
  })
})

describe('the port business.discloseResearch', () => {
  it('is unbound on a stand-alone import and returns null', async () => {
    vi.resetModules()
    const mod = await import('../src/game/business/contract')
    expect(mod.discloseResearch.portName).toBe('business.discloseResearch')
    expect(mod.discloseResearch.bound).toBe(false)
    const g = at(3, 2031)
    expect(mod.discloseResearch(g, disclosure())).toBeNull(); expect(g.flags.techWaves).toBeUndefined()
  }, 120_000)
  it('is bound once the aging hub is loaded, and then announces the wave', async () => {
    vi.resetModules()
    await import('../src/game/aging')
    const { portStatus } = await import('../src/game/kernel/ports')
    expect(portStatus().find((p) => p.name === 'business.discloseResearch')).toEqual({ name: 'business.discloseResearch', bound: true })
    const mod = await import('../src/game/business/contract')
    const g = at(3, 2031)
    const w = mod.discloseResearch(g, disclosure({ origin: 'port' }))
    expect(w).toMatchObject({ source: 'effort', kind: 'fusion' }); expect(mod.discloseResearch(g, disclosure({ origin: 'port' }))).toEqual(w)
  }, 120_000)
  it('bound in this registry too: the port gives what announceResearch gives', () => {
    expect(discloseResearch.bound).toBe(true)
    const g = at(3, 2031); const h = at(3, 2031)
    expect(discloseResearch(g, disclosure({ field: 'ai.coding', origin: 'p' }))).toEqual(announceResearch(h, disclosure({ field: 'ai.coding', origin: 'p' })))
    expect(discloseResearch(g, disclosure({ field: 'cloud' }))).toBeNull()
  })
})

describe('the effort wave shape', () => {
  it('is a TechWave like any other (type check): the source union names effort', () => {
    const w: TechWave = { id: 'effort:fusion:2031:x', kind: 'fusion', name: 'Fusion power', source: 'effort', year: 2031, market: 'world', size: 0.5, hype: 0.65, delivery: 0, last: 2031 }
    expect(w.source).toBe('effort')
  })
})
