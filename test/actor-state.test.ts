import { beforeEach, describe, expect, it } from 'vitest'
import { actorJob } from '../src/game/special/actor'
import { BUDGETS, INDUSTRIES, TYPE_IDS, TYPE_OF } from '../src/game/special/actor-data'
import { actorStore, adoptLegacy } from '../src/game/special/actor-state'
import { hire, ownerKey } from '../src/game/special/common'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.actor.sim'
const LEGACY = 'special.actor'

/** Paths of every non-finite number in a value. */
function nonFinite(v: unknown, path = 'r'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (Array.isArray(v)) return v.flatMap((x, i) => nonFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}

/** Number of nodes (values, arrays and objects) in a value. */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + nodes(x), 0)
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n: number, x) => n + nodes(x), 0)
  return 1
}

/** Longest string in a value, keys included. */
function longest(v: unknown): number {
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.reduce((n: number, x) => Math.max(n, longest(x)), 0)
  if (v && typeof v === 'object') return Object.entries(v).reduce((n, [k, x]) => Math.max(n, k.length, longest(x)), 0)
  return 0
}

const big = (n: number): string => 'x'.repeat(n)
const json = (v: unknown): Json => v as Json

const credit = (i: number) => ({ title: `Film ${i}`, kind: i % 2 ? 'tv' : 'film', role: 'Supporting', genre: i % 2 ? 'Sitcom' : 'Horror', age: 24 + i, pay: 90_000 + i, quality: 60 + i, popularity: 50 + i, seasons: 1 + (i % 3), verdict: 'a modest success', residual: 1_000 + i })

/** A 1995 life with a legacy profile (reputation 62, 3 credits, 1 award, an agent, 1 dry year) and a project on the job. */
function legacyLife(): GameState {
  const g = makeTestGame(3, { age: 30 })
  g.year = 1995
  g.flags[LEGACY] = json({
    owner: ownerKey(g),
    reputation: 62,
    credits: [credit(0), credit(1), credit(2)],
    awards: ['Golden Reel Award for Best Actor - "Film 1" (age 25)'],
    nominations: 2,
    agent: { name: 'Mia Chen', firm: 'Starlight Talent', quality: 70, cut: 0.12 },
    dryYears: 1,
  })
  hire(g, {
    defId: 'actor',
    title: 'Lead Actor',
    company: 'Silverline Studios',
    salary: 400_000,
    data: { project: { title: 'The Last Echo', kind: 'film', genre: 'Drama', role: 'Lead', studio: 'Silverline Studios', pay: 400_000, budget: 'studio', developed: 20, buzz: 4, season: 1, costars: ['p1', 'p2'] } },
  })
  return g
}

const bigCredits = Array.from({ length: 500 }, (_, i) => ({
  id: `c${i}`,
  title: big(10_000),
  kind: 'tv',
  role: 'Lead',
  genre: big(500),
  type: 'drama',
  industry: 'hollywood',
  studio: big(10_000),
  year: 1990 + (i % 30),
  age: 30,
  pay: 1e300,
  quality: 1e9,
  popularity: NaN,
  gross: Infinity,
  backend: -5,
  seasons: 1e9,
  verdict: big(10_000),
  residual: 1e300,
  trust: 'yes',
}))
const bigPipeline = Array.from({ length: 9 }, (_, i) => ({
  id: `p${i}`,
  title: big(10_000),
  kind: 'film',
  genre: 'Action',
  type: 'nope',
  role: 'Lead',
  studio: big(10_000),
  studioId: big(500),
  industry: 'mars',
  budget: 'streaming',
  terms: { fee: 1e300, points: 99, exclusive: 'x' },
  stage: 'later',
  developed: 1e9,
  buzz: NaN,
  campaign: -1e9,
  season: 1e9,
  director: 0,
  costars: Array.from({ length: 50 }, () => big(10_000)),
  window: 'sideways',
  quality: Infinity,
  since: NaN,
  lastYear: 1e300,
}))

const JUNK: unknown[] = [
  null,
  [],
  'x',
  42,
  { rep: NaN, credits: 'bad', pipeline: 7, awards: 5, type: 'x', team: 'x', totals: [] },
  { v: 1, credits: [null, 3, 'x', {}, { id: '' }], pipeline: [null, [], { id: 5 }], awards: [1, null, {}], type: { action: NaN, comedy: 1e300, drama: -4, genre: 'x' }, team: { agent: 'x', manager: [], press: 5 }, totals: { gross: Infinity, net: NaN, cuts: -1, spent: 'x' } },
  {
    v: 1,
    owner: big(10_000),
    standing: 1e300,
    rep: 1e300,
    noms: -Infinity,
    dry: NaN,
    scandal: 1e9,
    layLow: 1e300,
    studioFrom: -5,
    credits: bigCredits,
    pipeline: bigPipeline,
    awards: Array.from({ length: 100 }, () => big(10_000)),
    type: { action: NaN, comedy: 1e300, drama: -4, genre: 'x', romance: Infinity },
    team: { agent: { name: big(10_000), firm: big(10_000), quality: 1e9, cut: 5, loyalty: NaN, personId: big(500), since: 1e300 }, manager: { cut: -3 }, press: { firm: big(10_000), quality: -4 } },
    totals: { gross: 1e300, net: Infinity, cuts: NaN, spent: -9 },
  },
]

describe('actor state', () => {
  let g: GameState
  beforeEach(() => {
    g = legacyLife()
  })

  it('migrates a legacy life in memory: view is byte-identical, first mut writes v1 once, the legacy flag is untouched [RF4]', () => {
    const before = JSON.stringify(g)
    const v = actorStore.view(g)
    expect(JSON.stringify(g)).toBe(before)
    expect([v.rep, v.credits.length, v.pipeline[0].stage, v.team.agent?.loyalty, v.migrated]).toEqual([62, 3, 'shoot', 60, false])
    expect(g.flags[FLAG]).toBeUndefined()
    const legacy = JSON.stringify(g.flags[LEGACY])
    actorStore.mut(g)
    actorStore.mut(g)
    expect((g.flags[FLAG] as unknown as { v: number }).v).toBe(1)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(actorStore.peek(g)?.pipeline).toHaveLength(1)
  })

  it('lifts the legacy profile and the job project field by field', () => {
    const v = actorStore.view(g)
    expect([v.noms, v.dry, v.awards.length, v.team.manager, v.team.press, v.scandal, v.layLow, v.studioFrom]).toEqual([2, 1, 1, null, null, 0, 0, 0])
    expect(v.team.agent).toMatchObject({ personId: '', name: 'Mia Chen', firm: 'Starlight Talent', quality: 70, cut: 0.12, since: 1995 })
    expect(v.credits.map((c) => [c.title, c.type, c.industry, c.year, c.gross, c.backend, c.trust])).toEqual([
      ['Film 0', 'genre', 'hollywood', 1989, 0, 0, false],
      ['Film 1', 'comedy', 'hollywood', 1990, 0, 0, false],
      ['Film 2', 'genre', 'hollywood', 1991, 0, 0, false],
    ])
    expect(v.credits[1]).toMatchObject({ kind: 'tv', role: 'Supporting', pay: 90_001, quality: 61, popularity: 51, seasons: 2, residual: 1_001 })
    expect(new Set(v.credits.map((c) => c.id)).size).toBe(3)
    expect(v.pipeline[0]).toMatchObject({
      title: 'The Last Echo',
      kind: 'film',
      genre: 'Drama',
      type: 'drama',
      role: 'Lead',
      studio: 'Silverline Studios',
      industry: 'hollywood',
      budget: 'studio',
      terms: { fee: 400_000, points: 0, exclusive: false },
      stage: 'shoot',
      developed: 20,
      buzz: 4,
      season: 1,
      director: 65,
      window: 'normal',
      costars: ['p1', 'p2'],
    })
    expect(v.pipeline[0].lastYear).toBeLessThan(g.year)
    expect(Object.values(v.type)).toEqual([0, 0, 0, 0, 0])
    expect(v.totals).toEqual({ gross: 0, net: 0, cuts: 0, spent: 0 })
  })

  it('starts a life with no legacy profile at rep 50, standing 20 and nothing else', () => {
    const fresh = makeTestGame(5, { age: 30 })
    const v = actorStore.view(fresh)
    expect([v.rep, v.standing, v.peak, v.migrated, v.credits, v.pipeline, v.awards, v.team]).toEqual([50, 20, 20, false, [], [], [], { agent: null, manager: null, press: null }])
    expect(Object.keys(v.type).sort()).toEqual([...TYPE_IDS].sort())
    expect(actorStore.has(fresh)).toBe(false)
  })

  it('adoptLegacy clears Job.data.project once and sets migrated', () => {
    const s = actorStore.mut(g)
    expect(actorJob(g)?.data.project).not.toBeNull()
    adoptLegacy(g, s)
    expect(actorJob(g)?.data.project).toBeNull()
    expect(s.migrated).toBe(true)
    expect(s.pipeline).toHaveLength(1)
    const once = JSON.stringify(g)
    adoptLegacy(g, s)
    expect(JSON.stringify(g)).toBe(once)
    expect(actorStore.view(g).migrated).toBe(true)
  })

  it('adoptLegacy re-reads the job project if the legacy hook moved it first', () => {
    const s = actorStore.mut(g)
    const live = actorJob(g)!.data.project as unknown as { season: number; pay: number }
    live.season = 3
    live.pay = 450_000
    adoptLegacy(g, s)
    expect(s.pipeline).toHaveLength(1)
    expect(s.pipeline[0]).toMatchObject({ season: 3, terms: { fee: 450_000 } })

    // the legacy hook finished the project: nothing may be settled twice
    const g2 = legacyLife()
    const s2 = actorStore.mut(g2)
    actorJob(g2)!.data.project = null
    adoptLegacy(g2, s2)
    expect(s2.pipeline).toEqual([])
  })

  it('leaves sim-made projects alone when it adopts', () => {
    const s = actorStore.mut(g)
    const mine = { ...s.pipeline[0], id: 'p9', title: 'Mine' }
    s.pipeline.push(mine)
    adoptLegacy(g, s)
    expect(s.pipeline.map((p) => p.title).sort()).toEqual(['Mine', 'The Last Echo'])
  })

  it('normalizes junk legacy and sim records with caps 64 / 40 / 4 and no NaN [RF1]', () => {
    for (const junk of JUNK) {
      const r = actorStore.read(junk, g)
      expect(nonFinite(r)).toEqual([])
      expect(r.credits.length).toBeLessThanOrEqual(64)
      expect(r.pipeline.length).toBeLessThanOrEqual(4)
      expect(r.awards.length).toBeLessThanOrEqual(40)
      expect(nodes(r)).toBeLessThan(6000)
      expect(JSON.stringify(r).length).toBeLessThan(64_000) // the worst case any junk can reach
      expect(longest(r)).toBeLessThanOrEqual(120)
      for (const t of TYPE_IDS) expect(r.type[t]).toBeGreaterThanOrEqual(0)
      for (const t of TYPE_IDS) expect(r.type[t]).toBeLessThanOrEqual(100)
      expect(r.rep).toBeGreaterThanOrEqual(0)
      expect(r.rep).toBeLessThanOrEqual(100)
      for (const p of r.pipeline) {
        expect(BUDGETS[p.budget].kind).toBe(p.kind)
        expect(p.costars.length).toBeLessThanOrEqual(8)
        expect(p.season).toBeLessThanOrEqual(9)
        expect(p.terms.points).toBeLessThanOrEqual(0.12)
        expect(p.director).toBeGreaterThanOrEqual(40)
        expect(p.director).toBeLessThanOrEqual(90)
        expect(INDUSTRIES[p.industry]).toBeDefined()
        expect(TYPE_IDS).toContain(p.type)
      }
      for (const rep of [r.team.agent, r.team.manager]) if (rep) expect([rep.cut >= 0.05 && rep.cut <= 0.2, rep.quality >= 20 && rep.quality <= 95, rep.loyalty >= 0 && rep.loyalty <= 100]).toEqual([true, true, true])
    }
    // a 500-credit record keeps the newest 64, and unique ids only
    const r = actorStore.read(JUNK[JUNK.length - 1], g)
    expect(r.credits).toHaveLength(64)
    expect(r.credits[63].id).toBe('c499')
    expect(r.pipeline).toHaveLength(4)
    expect(r.pipeline[3].id).toBe('p8')
  })

  it('keeps a fully stocked, realistic record under 6,000 nodes and 40 KB', () => {
    const day = (i: number) => ({ y: 1980 + i, income: 1_234_567 + i, spent: 98_765, rank: 7, of: 22, standing: 64, note: 'Two releases, one nomination. A clean year on set.' })
    const full = {
      v: 1,
      standing: 71,
      peak: 83,
      years: 40,
      rows: Array.from({ length: 12 }, (_, i) => day(i)),
      memory: Array.from({ length: 16 }, (_, i) => ({ id: `actor.us.1985.${i}`, name: 'Marguerite Okonkwo-Lindqvist', met: 12, won: 5, lost: 4, grudge: 30, last: 2020 })),
      cool: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`crisis.rivalFeud${i}`, 2024])),
      done: Array.from({ length: 24 }, (_, i) => `choice.contract.p${1000 + i}`),
      rep: 88,
      noms: 14,
      credits: Array.from({ length: 64 }, (_, i) => ({ id: `c${1000 + i}`, title: 'The Midnight Horizon 3', kind: 'film', role: 'Supporting', genre: 'Crime Drama', type: 'drama', industry: 'hollywood', studio: 'Silverline Studios', year: 1990 + (i % 30), age: 30, pay: 1_250_000, quality: 78, popularity: 66, gross: 412_000_000, backend: 3_300_000, seasons: 1, verdict: 'a box office success', residual: 41_000, trust: i % 2 === 0 })),
      pipeline: Array.from({ length: 4 }, (_, i) => ({ id: `p${2000 + i}`, title: 'Everybody Loves Alexandria', kind: 'tv', genre: 'Sitcom', type: 'comedy', role: 'Lead', studio: 'Channel Nine Network', studioId: 'channel-nine', industry: 'hollywood', budget: 'network', terms: { fee: 2_400_000, points: 0.02, exclusive: false }, stage: 'shoot', developed: 40, buzz: 30, campaign: 10, season: 4, director: 72, costars: Array.from({ length: 8 }, (_, k) => `p${30_000 + k}`), window: 'normal', quality: 0, since: 2020, lastYear: 2025 })),
      awards: Array.from({ length: 40 }, (_, i) => `Primetime Glow Award for Best Supporting Actress - "The Midnight Horizon ${i}" (age 27)`),
      team: { agent: { personId: 'p4012', name: 'Marguerite Okonkwo', firm: 'Apex Artists Agency', quality: 80, cut: 0.12, loyalty: 70, since: 1999 }, manager: { personId: 'p4013', name: 'Jon Bell', firm: 'Bluebird Management', quality: 70, cut: 0.14, loyalty: 60, since: 2004 }, press: { firm: 'Velvet Rope Press', quality: 60, since: 2010 } },
      totals: { gross: 9_876_543_210, net: 5_432_100_000, cuts: 654_321_000, spent: 123_456_000 },
    }
    const r = actorStore.read(full, g)
    expect([r.credits.length, r.pipeline.length, r.awards.length, r.rows.length, r.memory.length]).toEqual([64, 4, 40, 12, 16])
    expect(nodes(r)).toBeLessThan(6000)
    expect(JSON.stringify(r).length).toBeLessThan(40_000)
    expect(actorStore.read(r, g)).toEqual(r) // reading a record again changes nothing
  })

  it('survives garbage in the legacy profile and the job project without throwing [RF1]', () => {
    const junkLegacy: unknown[] = [
      { credits: 'bad', awards: 5, agent: 'x', reputation: NaN, nominations: 'many', dryYears: -3 },
      { credits: Array.from({ length: 500 }, (_, i) => credit(i)), awards: Array.from({ length: 100 }, (_, i) => `Award ${i}`), agent: { cut: 9, quality: 1e9 } },
      [],
      7,
    ]
    for (const raw of junkLegacy) {
      const h = legacyLife()
      h.flags[LEGACY] = json(raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, owner: ownerKey(h) } : raw)
      const r = actorStore.view(h)
      expect(nonFinite(r)).toEqual([])
      expect(r.credits.length).toBeLessThanOrEqual(64)
      expect(r.awards.length).toBeLessThanOrEqual(40)
      expect(r.rep).toBeGreaterThanOrEqual(0)
    }
    for (const project of [null, [], 'x', 7, { title: big(10_000), kind: 'tv', budget: 'blockbuster', pay: NaN, season: 1e9, costars: 'x', role: 5 }, { costars: Array.from({ length: 50 }, (_, i) => `p${i}`) }]) {
      const h = legacyLife()
      actorJob(h)!.data.project = json(project)
      const r = actorStore.view(h)
      expect(nonFinite(r)).toEqual([])
      expect(r.pipeline.length).toBeLessThanOrEqual(1)
      for (const p of r.pipeline) {
        expect(BUDGETS[p.budget].kind).toBe(p.kind)
        expect(p.costars.length).toBeLessThanOrEqual(8)
        expect(p.season).toBeLessThanOrEqual(9)
        expect(p.title.length).toBeLessThanOrEqual(60)
      }
      expect(() => actorStore.mut(h)).not.toThrow()
    }
  })

  it('reads another owner as fresh and keeps the old owner key working [RF2]', () => {
    const h = makeTestGame(9, { age: 30 })
    h.year = 1995
    h.flags[FLAG] = json({ owner: 'someone-else', v: 1, rep: 99, standing: 77 })
    expect(actorStore.has(h)).toBe(false)
    expect(actorStore.peek(h)).toBeNull()
    expect([actorStore.view(h).rep, actorStore.view(h).standing]).toEqual([50, 20])
    // the name-based key of releases through v1.9.1 still matches after a rename
    const c = h.character
    h.flags[FLAG] = json({ owner: `${c.id}:${c.firstName}:${c.lastName}:${h.year - c.age}`, v: 1, rep: 80, standing: 41 })
    c.lastName = 'Renamed'
    expect(actorStore.has(h)).toBe(true)
    expect([actorStore.view(h).rep, actorStore.view(h).standing]).toEqual([80, 41])
    // an heir (a new character) starts empty, and so does one who inherits the old character's flag
    const heir = structuredClone(h)
    heir.character.id = 'heir'
    heir.generation = 2
    expect(actorStore.has(heir)).toBe(false)
    expect(actorStore.view(heir).rep).toBe(50)
    expect(actorStore.view(heir).credits).toEqual([])
  })

  it('does not lift another life legacy profile into this one [RF2]', () => {
    const heir = structuredClone(g)
    heir.character.id = 'heir'
    heir.character.job = null
    heir.generation = 2
    const v = actorStore.view(heir)
    expect([v.rep, v.credits.length, v.pipeline.length, v.team.agent]).toEqual([50, 0, 0, null])
  })

  it('view never writes and survives a frozen state [RF5]', () => {
    const f = deepFreeze(structuredClone(g))
    expect(() => actorStore.view(f)).not.toThrow()
    expect(() => actorStore.peek(f)).not.toThrow()
    expect(JSON.stringify(f)).toBe(JSON.stringify(g))
    expect(actorStore.view(f).pipeline[0].title).toBe('The Last Echo')
  })

  it('maps every listed genre to one of the five types, signature genres included', () => {
    expect(Object.keys(TYPE_OF)).toHaveLength(22)
    expect(new Set(Object.values(TYPE_OF))).toEqual(new Set(TYPE_IDS))
    expect([TYPE_OF.Bollywood, TYPE_OF['K-Drama'], TYPE_OF['Nollywood Drama'], TYPE_OF['Martial Arts'], TYPE_OF.Telenovela, TYPE_OF.Thriller]).toEqual(['romance', 'romance', 'drama', 'action', 'romance', 'drama'])
    // a prototype name is not a genre
    expect(TYPE_OF.constructor).toBeUndefined()
    expect(TYPE_OF.__proto__).toBeUndefined()
  })
})
