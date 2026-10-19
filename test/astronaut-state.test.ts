import { beforeEach, describe, expect, it } from 'vitest'
import { ERA, MISSION_IDS } from '../src/game/special/astronaut-data'
import { astroPoliticsEdge, astronautStore, readAstro } from '../src/game/special/astronaut-state'
import { hire, ownerKey } from '../src/game/special/common'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.astronaut.sim'
const LEGACY = 'special.astronaut'

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

/** A 1995 life with a legacy profile (5 missions, 2 spacewalks, 1 landing) and a Mission Specialist job at performance 70. */
function legacyLife(): GameState {
  const g = makeTestGame(3, { age: 40 })
  g.year = 1995
  g.flags[LEGACY] = json({
    owner: ownerKey(g),
    academyApps: 1,
    graduated: true,
    missions: 5,
    spacewalks: 2,
    moonLandings: 1,
    marsLandings: 0,
    articles: 1,
    research: 12,
    planets: [{ name: 'Kepler-12b', kind: 'gas giant', age: 38 }],
    firstWords: 'Hi Mom!',
  })
  hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'NASA', salary: 98_000, level: 2, performance: 70, data: { agency: 'oea', lastMissionAge: 39 } })
  return g
}

const bigFlights = Array.from({ length: 500 }, (_, i) => ({
  year: 1980 + (i % 40),
  type: 'mars',
  role: 'commander',
  days: 1e9,
  regimen: 'intense',
  result: 'abort',
  crew: Array.from({ length: 50 }, () => big(10_000)),
  bone: NaN,
  dose: Infinity,
}))
const bigInquiries = Array.from({ length: 99 }, (_, i) => ({
  id: `q${i}`,
  year: 1990 + (i % 30),
  cause: 'schedule',
  lost: Array.from({ length: 50 }, () => big(10_000)),
  involved: true,
  yearsOpen: 1e9,
  status: 'closed',
  stance: 'protect',
  coverup: true,
}))
const bigClasses = Array.from({ length: 99 }, (_, i) => ({ year: 1990 + i, agency: big(10_000), seats: 1e9, finalists: -5, rank: NaN, cut: 1e300, mates: Array.from({ length: 50 }, () => big(10_000)) }))

const JUNK: unknown[] = [
  null,
  [],
  'x',
  42,
  { bone: NaN, flights: 'bad', classes: 5, inquiries: 7, tally: [], skills: 'x', mark: 3, legacy: 'x', fund: 'x' },
  { v: 1, flights: [null, 3, 'x', {}, { year: 'x' }], classes: [null, [], { year: NaN }], inquiries: [{ id: '' }, { id: 5, year: 1 }], fund: [1, 'x', NaN, null], tally: { flights: NaN, blame: 1e9, firsts: [1, null, {}] } },
  {
    v: 1,
    owner: big(10_000),
    standing: 1e300,
    agency: big(10_000),
    stint: big(10_000),
    bone: NaN,
    muscle: -1e300,
    dose: 1e9,
    family: Infinity,
    mood: 1e300,
    safety: -50,
    lobby: 1e9,
    skills: { eva: NaN, pilot: 1e9, fit: -4, team: 'x' },
    fund: Array.from({ length: 50 }, () => 1e9),
    classes: bigClasses,
    flights: bigFlights,
    inquiries: bigInquiries,
    tally: { flights: 1e300, days: Infinity, evas: -1, commands: NaN, lunar: 1e9, mars: 1e9, own: 'x', concerns: 1e9, blame: 1e9, firsts: Array.from({ length: 50 }, () => big(10_000)) },
    mark: { groundedYear: 1e300, rush: 'yes' },
    legacy: { hall: 'yes', memoirs: Array.from({ length: 50 }, () => ({ year: 2000, advance: 1e300, last: NaN, paid: -5 })) },
  },
]

describe('astronaut state', () => {
  let g: GameState
  beforeEach(() => {
    g = legacyLife()
  })

  it('migrates the legacy profile and job data in memory: view is byte-identical, the first mut writes v1 once [RF4]', () => {
    const before = JSON.stringify(g)
    const v = astronautStore.view(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.flags[FLAG]).toBeUndefined()
    expect(astronautStore.has(g)).toBe(false)
    expect(v.tally).toEqual({ flights: 5, days: 0, evas: 2, commands: 0, lunar: 1, mars: 0, own: 0, concerns: 0, blame: 0, firsts: [] })
    expect([v.standing, v.peak, v.agency, v.years]).toEqual([70, 70, 'oea', 0])
    expect(v.skills).toEqual({ eva: 42, pilot: 42, fit: 42, team: 42 })
    expect([v.bone, v.muscle, v.dose, v.safety, v.family, v.lobby]).toEqual([100, 100, 0, 60, 0, 0])
    expect(v.mood).toBe(ERA.shuttle.moodTarget) // it starts at the year's target
    expect([v.classes, v.flights, v.inquiries, v.fund]).toEqual([[], [], [], []])
    expect(v.legacy).toEqual({ hall: false, memoirs: [] })

    const legacy = JSON.stringify(g.flags[LEGACY])
    const data = JSON.stringify(g.character.job?.data)
    astronautStore.mut(g)
    astronautStore.mut(g)
    expect((g.flags[FLAG] as unknown as { v: number }).v).toBe(1)
    expect(astronautStore.has(g)).toBe(true)
    expect(astronautStore.peek(g)?.tally.flights).toBe(5)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(JSON.stringify(g.character.job?.data)).toBe(data)
    // a re-read of the stored record is the same record
    const s = astronautStore.view(g)
    expect(astronautStore.read(s, g)).toEqual(s)
  })

  it('reads a damaged legacy profile without throwing [RF1]', () => {
    for (const raw of [
      { planets: 'bad', missions: NaN, spacewalks: 'x', moonLandings: -5, marsLandings: 1e300 },
      { planets: [1, null, {}], missions: Infinity, spacewalks: [], moonLandings: {}, marsLandings: null },
      { credits: 'bad', rejectedBy: 'bad', planets: 'bad' },
      [],
      7,
    ]) {
      const h = legacyLife()
      h.flags[LEGACY] = json(raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, owner: ownerKey(h) } : raw)
      const a = readAstro(h)
      expect(nonFinite(a)).toEqual([])
      for (const n of Object.values(a)) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(1e6)
      }
      const v = astronautStore.view(h)
      expect(nonFinite(v)).toEqual([])
      expect(v.tally.flights).toBeLessThanOrEqual(1e6)
      expect(() => astronautStore.mut(h)).not.toThrow()
    }
    // a profile of another life reads as zeros
    const other = legacyLife()
    other.flags[LEGACY] = json({ owner: 'someone-else', missions: 9, spacewalks: 9, moonLandings: 9, marsLandings: 9 })
    expect(readAstro(other)).toEqual({ missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0 })
    expect(readAstro(makeTestGame(1))).toEqual({ missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0 })
  })

  it('keeps junk sim records bounded: caps 6 / 12 / 4 and no NaN [RF1]', () => {
    for (const junk of JUNK) {
      const r = astronautStore.read(junk, g)
      expect(nonFinite(r)).toEqual([])
      expect(r.classes.length).toBeLessThanOrEqual(6)
      expect(r.flights.length).toBeLessThanOrEqual(12)
      expect(r.inquiries.length).toBeLessThanOrEqual(4)
      expect(r.fund.length).toBeLessThanOrEqual(6)
      expect(r.tally.firsts.length).toBeLessThanOrEqual(8)
      expect(r.legacy.memoirs.length).toBeLessThanOrEqual(3)
      expect(nodes(r)).toBeLessThan(3000)
      expect(JSON.stringify(r).length).toBeLessThan(40_000)
      expect(longest(r)).toBeLessThanOrEqual(90)
      expect(r.bone).toBeGreaterThanOrEqual(15)
      expect(r.bone).toBeLessThanOrEqual(100)
      expect(r.muscle).toBeGreaterThanOrEqual(15)
      expect(r.muscle).toBeLessThanOrEqual(100)
      expect(r.dose).toBeGreaterThanOrEqual(0)
      expect(r.dose).toBeLessThanOrEqual(100)
      expect(r.family).toBeGreaterThanOrEqual(0)
      expect(r.family).toBeLessThanOrEqual(100)
      expect(r.safety).toBeGreaterThanOrEqual(15)
      expect(r.safety).toBeLessThanOrEqual(95)
      expect(r.lobby).toBeGreaterThanOrEqual(-6)
      expect(r.lobby).toBeLessThanOrEqual(20)
      expect(r.mood).toBeGreaterThanOrEqual(0)
      expect(r.mood).toBeLessThanOrEqual(100)
      expect(r.tally.blame).toBeLessThanOrEqual(20)
      for (const k of Object.values(r.skills)) expect([k >= 0, k <= 100]).toEqual([true, true])
      for (const f of r.flights) {
        expect(MISSION_IDS).toContain(f.type)
        expect(f.days).toBeLessThanOrEqual(1000)
        expect(f.crew.length).toBeLessThanOrEqual(6)
      }
      for (const q of r.inquiries) expect([q.yearsOpen <= 9, q.lost.length <= 3]).toEqual([true, true])
      for (const c of r.classes) expect(c.mates.length).toBeLessThanOrEqual(6)
      expect(astronautStore.read(r, g)).toEqual(r) // reading a record again changes nothing
    }
    // a 500-flight record keeps the newest 12, a 99-inquiry record the newest 4
    const r = astronautStore.read(JUNK[JUNK.length - 1], g)
    expect(r.flights).toHaveLength(12)
    expect(r.inquiries.map((q) => q.id)).toEqual(['q95', 'q96', 'q97', 'q98'])
    expect(r.classes).toHaveLength(6)
    expect(r.classes[5].year).toBe(2088)
  })

  it('starts a life with no legacy profile at standing 40, the year mood and nothing else', () => {
    const fresh = makeTestGame(5, { age: 30 })
    fresh.year = 1965
    const v = astronautStore.view(fresh)
    expect([v.standing, v.peak, v.mood, v.safety, v.bone, v.muscle, v.dose, v.family, v.lobby]).toEqual([40, 40, ERA.race.moodTarget, 60, 100, 100, 0, 0, 0])
    expect([v.agency, v.stint, v.skills, v.fund, v.classes, v.flights, v.inquiries]).toEqual(['', '', { eva: 0, pilot: 0, fit: 0, team: 0 }, [], [], [], []])
    expect(v.mark).toEqual({ groundedYear: 0, rush: false })
    expect(astronautStore.has(fresh)).toBe(false)
    expect(astronautStore.key).toBe(FLAG.replace('special.', ''))
  })

  it('starts an heir clean: another owner reads fresh and the old owner key still matches [RF2]', () => {
    const h = makeTestGame(9, { age: 30 })
    h.year = 1995
    h.flags[FLAG] = json({ owner: 'someone-else', v: 1, standing: 77, tally: { flights: 9 } })
    expect(astronautStore.has(h)).toBe(false)
    expect(astronautStore.peek(h)).toBeNull()
    expect([astronautStore.view(h).standing, astronautStore.view(h).tally.flights]).toEqual([40, 0])
    // the name-based key of releases through v1.9.1 still matches after a rename
    const c = h.character
    h.flags[FLAG] = json({ owner: `${c.id}:${c.firstName}:${c.lastName}:${h.year - c.age}`, v: 1, standing: 61 })
    c.lastName = 'Renamed'
    expect(astronautStore.has(h)).toBe(true)
    expect(astronautStore.view(h).standing).toBe(61)
    // an heir (a new character) inherits no record, no tally and no legacy profile
    const heir = structuredClone(g)
    astronautStore.mut(heir)
    heir.character.id = 'heir'
    heir.character.job = null
    heir.generation = 2
    expect(astronautStore.has(heir)).toBe(false)
    const v = astronautStore.view(heir)
    expect([v.standing, v.tally.flights, v.tally.lunar, v.skills.eva, v.agency]).toEqual([40, 0, 0, 0, ''])
    expect(readAstro(heir)).toEqual({ missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0 })
  })

  it('astroPoliticsEdge matches the formula and reads the record only', () => {
    expect(astroPoliticsEdge(g)).toBe(0) // a legacy life with no sim record
    const set = (tally: object, flights: object[], hall: boolean, h: GameState = g): void => {
      const s = astronautStore.mut(h)
      Object.assign(s.tally, tally)
      s.flights = flights as typeof s.flights
      s.legacy.hall = hall
    }
    const tour = (days: number) => ({ year: 1990, type: 'station', role: 'specialist', days, regimen: 'standard', result: 'clean', crew: [], bone: 0, dose: 0 })
    // 3 flights, a landing, a 200-day tour, the hall and 1 blame: min(6, 2 + 2 + 1 + 1) - 3 = 3
    set({ flights: 3, lunar: 1, blame: 1 }, [tour(200)], true)
    expect(astroPoliticsEdge(g)).toBe(3)
    set({ flights: 3, lunar: 1, blame: 0 }, [tour(200)], true)
    expect(astroPoliticsEdge(g)).toBe(6)
    set({ flights: 3, lunar: 0, mars: 1, blame: 0 }, [tour(180)], false) // 180 is not over 180
    expect(astroPoliticsEdge(g)).toBe(4)
    set({ flights: 1, lunar: 0, mars: 0, blame: 0 }, [], false)
    expect(astroPoliticsEdge(g)).toBe(2)
    set({ flights: 0, lunar: 0, mars: 0, blame: 2 }, [], false)
    expect(astroPoliticsEdge(g)).toBe(-6)
    // another owner's record counts for nothing
    const h = structuredClone(g)
    h.character.id = 'heir'
    expect(astroPoliticsEdge(h)).toBe(0)
  })

  it('view never writes and survives a frozen state [RF5]', () => {
    const f = deepFreeze(structuredClone(g))
    expect(() => astronautStore.view(f)).not.toThrow()
    expect(() => astronautStore.peek(f)).not.toThrow()
    expect(() => readAstro(f)).not.toThrow()
    expect(() => astroPoliticsEdge(f)).not.toThrow()
    expect(JSON.stringify(f)).toBe(JSON.stringify(g))
    expect(astronautStore.view(f).tally.flights).toBe(5)
  })
})
