// R4-L4 (D.5 c, X2, X12, X14, X16, X22, X29, X42, X57, C14, C36, C38): kin records on stamped lives (src/game/kin.ts). Every NPC wedding and
// baby of a stamped life also exists as a Met record whose face never changes; the legacy fields (`married`, `spouseName`, `kids`) stay
// the authority and the record mirrors them (X22). Nothing here runs on a life the social stamp does not mark (X6).
//
// What the file proves, in the order of the plan:
//   1. KIN_IDENTITY, the frozen table of the face (X57): the pinned copy, the offsets, the 92 percent, the facet numbers.
//   2. The sid: kin.<country>.<year>.<ord>, one above the highest ord, null for a year, a country or an ord that is no sid (C38).
//   3. adoptSpouse and adoptChild: the record, the link, the edges, the fact; once; and no half link for every refusal.
//   4. The legacy path: the wedding and the baby of familyLifeCycle, through the real ageUp.
//   5. syncKin: the three other writers adopt, a divorce unlinks, a death widows once, the orphan sweep, the stamp kinY.
//   6. Facts: at most 8 a year. Caps: 40,000 adoptions over 400 anchors, a full Met, the 1,200-edge cap, the 160 records.
//   7. A clone, a reload, an heir and a fork give the same names. A stamped twin of a life with no kin line keeps g.rng and g.nextId.
//   8. The module (life.kin, life, 37), the group rows, the edge half of kinProblems, the cost of the step, the source rules.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import { KIN_EDGE, KIN_IDENTITY, KIN_ROLE, adoptChild, adoptSpouse, keyedSpouse, kinSid, syncKin, unlinkSpouse } from '../src/game/kin'
import { personEntity } from '../src/game/kernel/person-ref'
import { yearlyEntries } from '../src/game/kernel/registry'
import { continueAsChild } from '../src/game/life'
import { MODULES } from '../src/game/modules/index'
import { kinModule } from '../src/game/modules/kin-years'
import { loadGame, loadSnapshot, memorySnapshotBackend, saveGame, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { memorySaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { KIN_WIDOWED } from '../src/game/text/pools'
import type { GameState, Person } from '../src/game/types'
import { EDGE_CAPS, MET_CAPS } from '../src/game/world/caps'
import { putEdge } from '../src/game/world/edge-write'
import { edgeKey, edgeLocalBound, readEdge, type Edge } from '../src/game/world/edges'
import { readFacts } from '../src/game/world/facts'
import { worldProblems } from '../src/game/world/invariants'
import { KIN_CAPS, kinProblems, readKin } from '../src/game/world/kin'
import { ageTo } from '../src/game/world/life-path'
import { isTomb, metRecord, metTomb, readMet, type MetRecord } from '../src/game/world/met'
import { STAKE, sweepMet, tombstoneMet, touchMet } from '../src/game/world/met-ops'
import { socialOn } from '../src/game/world/social'
import { readWorld } from '../src/game/world/state'
import { deepFreeze, installStorageShim } from './fuzz-kit'
import { kinEdgesOf, kinGame, kinSidsOf, married, SPOUSE_NAMES, withLife } from './kin-kit'
import { makeTestGame } from './helpers'
import { machineFactor } from './perf-kit'
import { trapRng } from './effort-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame, socialLife } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const YEAR = 2026
// A fixed life as constants, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts): the cradle of the E7 tests.
const LIFE_SEED = 17
const BIRTH = 1990

const sibs = (g: GameState): Person[] => g.people.filter((p) => p.relation === 'sibling')
const json = (x: unknown): string => JSON.stringify(x)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
/** The content of a value whatever order its parts were first written in. */
const canonical = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b))) : v))
const rec = (g: GameState, sid: string | null): MetRecord => {
  expect(sid, 'a sid').not.toBeNull()
  const r = metRecord(g, sid!)
  expect(r, `a record for ${String(sid)}`).not.toBeNull()
  return r!
}
const ent = (p: Person): `person:${string}` => personEntity(p) as `person:${string}`
const key = (from: string, to: string): string => {
  const k = edgeKey(from as never, to as never)
  expect(k).not.toBeNull()
  return k!
}
const EDGE: Edge = { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026 }
/** The next year of a game: the calendar moves, then the kin step runs. */
function nextYear(g: GameState, years = 1): void {
  for (let i = 0; i < years; i++) {
    g.year += 1
    g.yearActions = {}
    syncKin(g)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. KIN_IDENTITY

describe('KIN_IDENTITY, the frozen table of the face of a kin record (X57)', () => {
  // The values the lead read: a changed one needs a RECORD_REASON, a row in moved-tests.md and the lead's OK.
  const PINNED = {
    spouseBornOffset: [-4, 4],
    minWedAge: 18,
    oppositeGender: 0.92,
    tag: 'soc.kin',
    facet: { spouseGender: 0, spouseOffset: 1 },
  }

  it('equals its pinned copy and is frozen all the way down', () => {
    expect(JSON.parse(json(KIN_IDENTITY))).toEqual(PINNED)
    expect(Object.isFrozen(KIN_IDENTITY)).toBe(true)
    expect(Object.isFrozen(KIN_IDENTITY.facet)).toBe(true)
    expect(Object.isFrozen(KIN_IDENTITY.spouseBornOffset)).toBe(true)
  })

  it('writes the stake bits of the Met store as numbers and the role weights of the plan (spouse 6, child 4)', () => {
    expect(KIN_ROLE.flag).toEqual({ spouse: STAKE.spouse, heir: STAKE.heir })
    expect(KIN_ROLE.weight).toEqual({ spouse: 6, child: 4 })
    expect(Object.isFrozen(KIN_ROLE)).toBe(true)
  })

  it('has unique facet numbers inside the facets the plan reserves (0 and 1 used, 2 to 15 reserved and unused)', () => {
    const used = Object.values(KIN_IDENTITY.facet)
    expect(new Set(used).size).toBe(used.length)
    for (const f of used) expect(f).toBeGreaterThanOrEqual(0)
    for (const f of used) expect(f).toBeLessThan(2)
  })

  it('keyed draws: the opposite gender 92 percent of 20,000 anchors, every offset from -4 to 4, no other', () => {
    let opposite = 0
    const seen = new Map<number, number>()
    for (let i = 0; i < 20_000; i++) {
      const d = keyedSpouse('family-seed', YEAR, `p${i}`)
      if (d.opposite) opposite++
      expect(Number.isInteger(d.offset)).toBe(true)
      expect(d.offset).toBeGreaterThanOrEqual(KIN_IDENTITY.spouseBornOffset[0])
      expect(d.offset).toBeLessThanOrEqual(KIN_IDENTITY.spouseBornOffset[1])
      seen.set(d.offset, (seen.get(d.offset) ?? 0) + 1)
    }
    const share = opposite / 20_000
    console.log(`KIN_IDENTITY draws (L4): opposite gender ${(share * 100).toFixed(2)} percent of 20,000, offsets ${[...seen.keys()].sort((a, b) => a - b).map((k) => `${k}:${seen.get(k)}`).join(' ')}`)
    expect(Math.abs(share - KIN_IDENTITY.oppositeGender)).toBeLessThan(0.01)
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4])
    for (const n of seen.values()) expect(n).toBeGreaterThan(20_000 / 9 / 2)
  })

  it('is a hash of the family, the year and the anchor: the same twice, another family or year or anchor another draw somewhere', () => {
    expect(keyedSpouse('a', YEAR, 'p1')).toEqual(keyedSpouse('a', YEAR, 'p1'))
    let differs = 0
    for (let i = 0; i < 200; i++) {
      const base = keyedSpouse('a', YEAR, `p${i}`)
      if (json(base) !== json(keyedSpouse('b', YEAR, `p${i}`))) differs++
      if (json(base) !== json(keyedSpouse('a', YEAR + 1, `p${i}`))) differs++
    }
    expect(differs).toBeGreaterThan(100)
  })

  it('the wedding age is 18 or more and the birth offset stays in -4..4 of the anchor, over anchors of 20 to 55 and 100 draws', () => {
    const g = socialGame(3)
    for (let i = 0; i < 100; i++) {
      const age = 20 + (i % 36)
      const a = cast(g, 60, 'sibling', { age, gender: i % 3 === 0 ? 'male' : 'female', firstName: 'Ann', lastName: 'Lee' })
      married(g, a, SPOUSE_NAMES[i % SPOUSE_NAMES.length])
      const sid = adoptSpouse(g, a)
      if (sid === null) continue
      const r = rec(g, sid)
      expect(YEAR - r.b, `spouse of ${age}`).toBeGreaterThanOrEqual(KIN_IDENTITY.minWedAge)
      const offset = r.b - (YEAR - age)
      expect(offset).toBeGreaterThanOrEqual(KIN_IDENTITY.spouseBornOffset[0])
      expect(offset).toBeLessThanOrEqual(KIN_IDENTITY.spouseBornOffset[1])
    }
    expect(kinSidsOf(g).length).toBeGreaterThan(50)
  })

  it('has its bullet in STREAMS.md (keyed values only: no generator, no table row) and no stream tag of its own', () => {
    const text = read('docs/STREAMS.md')
    expect(text).toContain('soc.kin')
    expect(text).toMatch(/soc\.kin[^\n]*(not a stream|no generator|streamUnit)/)
    const src = read('src/game/kin.ts')
    expect(src).not.toMatch(/\boutcomeStream\(/)
    expect(src).not.toMatch(/\bstream\(\s*g/)
    expect(src).toContain('streamKey(')
    expect(src).toContain('streamUnit(')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. The sid

describe('kinSid: kin.<country>.<year>.<ord> (X16, C38)', () => {
  it('starts at ord 0 and goes one above the highest ord of the prefix, tombstones included', () => {
    const g = socialGame(2)
    expect(kinSid(g, 'us', YEAR)).toBe('kin.us.2026.0')
    expect(touchMet(g, 'kin.us.2026.0', { fl: 2 }, 'us')).toBe(true)
    expect(touchMet(g, 'kin.us.2026.7', { fl: 4 }, 'us')).toBe(true)
    expect(kinSid(g, 'us', YEAR)).toBe('kin.us.2026.8')
    expect(kinSid(g, 'gb', YEAR)).toBe('kin.gb.2026.0')
    expect(kinSid(g, 'us', YEAR + 1)).toBe('kin.us.2027.0')
    // a tombstone keeps its ord taken
    expect(touchMet(g, 'kin.us.2026.9', { fl: 2 }, 'us')).toBe(true)
    expect(tombstoneMet(g, 'kin.us.2026.9', { fl: 2 })).toBe(true)
    expect(isTomb(readMet(g)['kin.us.2026.9'])).toBe(true)
    expect(kinSid(g, 'us', YEAR)).toBe('kin.us.2026.10')
  })

  it('is null for a year outside 1850..2400, a country that is no place, and an ord past 9999', () => {
    const g = socialGame(2)
    for (const y of [0, 1, 1849, 2401, 100_000, NaN, Infinity, -Infinity, 2026.5]) expect(kinSid(g, 'us', y), `year ${y}`).toBeNull()
    for (const c of ['', 'a b', 'a.b', 'a:b', 'abcdefghijklm', 'u\u0000s', '__proto__x_y_z_w', 'us/gb']) expect(kinSid(g, c, YEAR), `country ${c}`).toBeNull()
    for (const c of [5, null, undefined, {}, []]) expect(kinSid(g, c as never, YEAR)).toBeNull()
    expect(kinSid(g, 'us', 1850)).toBe('kin.us.1850.0')
    expect(kinSid(g, 'us', 2400)).toBe('kin.us.2400.0')
    expect(touchMet(g, 'kin.us.2026.9999', { fl: 2 }, 'us')).toBe(true)
    expect(kinSid(g, 'us', YEAR)).toBeNull()
  })

  it('reads the shard, writes nothing and draws nothing (a pure read on a frozen state)', () => {
    const g = socialGame(2)
    touchMet(g, 'kin.us.2026.3', { fl: 2 }, 'us')
    deepFreeze(trapRng(g))
    const before = json(g)
    expect(kinSid(g, 'us', YEAR)).toBe('kin.us.2026.4')
    expect(json(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. adoptSpouse and adoptChild

describe('adoptSpouse', () => {
  it('makes the record, the link, the two pair edges and the fact; the face is the legacy name and the gender the caller drew', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    a.data.spouseName = 'Juan Carlos de Cuba'
    const rngBefore = g.rng
    const nextBefore = g.nextId
    const sid = adoptSpouse(g, a, { gender: 'male' })
    expect(sid).toMatch(/^kin\.us\.2026\.0$/)
    const r = rec(g, sid)
    expect(`${r.f} ${r.l}`).toBe('Juan Carlos de Cuba')
    expect(r.f).toBe('Juan')
    expect(r.l).toBe('Carlos de Cuba')
    expect(r.g).toBe(1)
    expect(r.c).toBe('us')
    expect(r.k).toBe(0)
    expect(r.w).toBe(KIN_ROLE.weight.spouse)
    expect(r.w).toBe(6)
    expect(r.fl).toBe(2)
    expect(r.y).toBe(YEAR)
    expect(r.d).toBeUndefined()
    expect(readKin(a)).toEqual({ spouse: sid, kids: [], y: YEAR })
    // the pair edges, both ways, bound by their kind alone
    for (const k of [key(ent(a), `person:${sid}`), key(`person:${sid}`, ent(a))]) {
      const e = readWorld(g).edges![k as never] as Edge
      expect(e, k).toBeDefined()
      expect(e.k).toBe('pair')
      expect(edgeLocalBound(e)).toBe(true)
      expect(e.y).toBe(YEAR)
    }
    expect(Object.keys(KIN_EDGE)).toContain('pair')
    // no draw, no id; the legacy fields are what they were
    expect(g.rng).toBe(rngBefore)
    expect(g.nextId).toBe(nextBefore)
    expect(a.data.married).toBe(true)
    expect(a.data.spouseName).toBe('Juan Carlos de Cuba')
    expect(kinProblems(g)).toEqual([])
    expect(worldProblems(g, { live: false })).toEqual([])
  })

  it('keeps the legacy name for a name with one space and for three words, and the stored face reads back the same', () => {
    const g = kinGame(11, 3)
    const names: string[] = []
    for (const a of sibs(g)) {
      const sid = adoptSpouse(g, a, { gender: 'female' })
      const r = rec(g, sid)
      names.push(`${r.f} ${r.l}`)
    }
    expect(names).toEqual(sibs(g).map((a) => a.data.spouseName))
  })

  it('draws the gender from the keyed stream when the caller gives none, and the same twice for the same family', () => {
    const a = kinGame(11, 1)
    const b = kinGame(11, 1)
    const sa = adoptSpouse(a, sibs(a)[0]!)
    const sb = adoptSpouse(b, sibs(b)[0]!)
    expect(rec(a, sa).g).toBe(rec(b, sb).g)
    expect(rec(a, sa).b).toBe(rec(b, sb).b)
    const draw = keyedSpouse('test-life', YEAR, sibs(a)[0]!.id)
    const mine = sibs(a)[0]!.gender
    expect(rec(a, sa).g).toBe((draw.opposite ? mine !== 'male' : mine === 'male') ? 1 : 0)
  })

  it('adopt twice gives one sid and one record: the second call has a link and returns null', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const sid = adoptSpouse(g, a, { gender: 'female' })
    expect(sid).not.toBeNull()
    const before = json(g)
    expect(adoptSpouse(g, a, { gender: 'male' })).toBeNull()
    expect(json(g)).toBe(before)
    expect(kinSidsOf(g)).toEqual([sid])
    expect(kinEdgesOf(g)).toHaveLength(2)
  })

  it('adopts after a garbage link: a spouseSid that is no sid reads as none', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    a.data.spouseSid = 'not a sid'
    const sid = adoptSpouse(g, a, { gender: 'female' })
    expect(sid).not.toBeNull()
    expect(a.data.spouseSid).toBe(sid)
  })

  it('is null, and writes nothing, on an unstamped life', () => {
    const g = makeTestGame(11, { age: 40 })
    const a = cast(g, 60, 'sibling', { age: 30 })
    married(g, a, 'Ana Ruiz')
    const before = json(g)
    expect(socialOn(g)).toBe(false)
    expect(adoptSpouse(g, a, { gender: 'female' })).toBeNull()
    expect(json(g)).toBe(before)
    expect(g.world?.met).toBeUndefined()
    expect(Object.keys(g.world ?? {})).not.toContain('met')
  })

  it('is null for an anchor that is not married, is dead, or is the player\'s spouse, partner, fiance or a pet', () => {
    const g = kinGame(11, 0)
    const make = (relation: Person['relation'], over: Partial<Person['data']> & { dead?: boolean; unmarried?: boolean } = {}): Person => {
      const p = cast(g, 60, relation, { age: 33 })
      if (over.unmarried !== true) married(g, p, 'Ana Ruiz')
      if (over.dead === true) p.alive = false
      return p
    }
    for (const p of [make('sibling', { unmarried: true }), make('sibling', { dead: true }), make('spouse'), make('partner'), make('fiance'), make('pet')]) {
      const before = json(g)
      expect(adoptSpouse(g, p, { gender: 'female' }), p.relation).toBeNull()
      expect(json(g), p.relation).toBe(before)
    }
    expect(kinSidsOf(g)).toEqual([])
    expect(kinEdgesOf(g)).toEqual([])
    expect(g.world?.met).toBeUndefined()
  })

  it('refuses a hostile spouseName (empty, one word, 200 characters, a long first or last name, a control character, not text) and throws on none', () => {
    const g = kinGame(11, 0)
    const hostile: unknown[] = ['', 'A', ' ', 'A ', ' B', 'Ana  Ruiz', 'x'.repeat(200), `Ana ${'R'.repeat(33)}`, `${'A'.repeat(25)} Ruiz`, 'Ana\u0000 Ruiz', 'Ana Ru\niz', 42, null, undefined, {}, ['Ana Ruiz'], true]
    for (const name of hostile) {
      const a = cast(g, 60, 'sibling', { age: 33 })
      a.data.married = true
      a.data.spouseName = name as never
      const before = json(g)
      let sid: string | null = 'unset'
      expect(() => (sid = adoptSpouse(g, a, { gender: 'female' })), String(name).slice(0, 20)).not.toThrow()
      expect(sid, String(name).slice(0, 20)).toBeNull()
      expect(json(g), String(name).slice(0, 20)).toBe(before)
    }
    expect(kinSidsOf(g)).toEqual([])
    expect(g.world?.met).toBeUndefined()
  })

  it('refuses a hostile year (0, 1849, 2401, NaN, Infinity) and leaves no half link', () => {
    for (const year of [0, 1, 1849, 2401, NaN, Infinity, -1, 2026.5]) {
      const g = kinGame(11, 1)
      g.year = year
      const a = sibs(g)[0]!
      const before = json(g)
      expect(adoptSpouse(g, a, { gender: 'female' }), `year ${year}`).toBeNull()
      expect(json(g), `year ${year}`).toBe(before)
      expect(a.data.spouseSid).toBeUndefined()
    }
  })

  it('refuses a hostile country id (no place) and a hostile age, and falls back to the player\'s country when the anchor has none', () => {
    const g = kinGame(11, 0)
    const make = (over: Record<string, unknown>, age = 33): Person => {
      const a = cast(g, 60, 'sibling', { age })
      married(g, a, 'Ana Ruiz')
      for (const [k, v] of Object.entries(over)) a.data[k] = v as never
      return a
    }
    for (const c of ['', 'a b', 'abcdefghijklm', 'u:s', 'a.b']) {
      const a = make({ countryId: c })
      const before = json(g)
      expect(adoptSpouse(g, a, { gender: 'female' }), `country ${c}`).toBeNull()
      expect(json(g)).toBe(before)
    }
    for (const age of [NaN, Infinity, -5, 1e9]) {
      const a = make({})
      a.age = age
      const before = json(g)
      expect(adoptSpouse(g, a, { gender: 'female' }), `age ${age}`).toBeNull()
      expect(json(g)).toBe(before)
    }
    const plain = make({ countryId: 5 })
    const sid = adoptSpouse(g, plain, { gender: 'female' })
    expect(sid).toBe('kin.us.2026.0')
    const abroad = make({ countryId: 'gb' })
    expect(adoptSpouse(g, abroad, { gender: 'female' })).toBe('kin.gb.2026.0')
    expect(rec(g, 'kin.gb.2026.0').c).toBe('gb')
  })

  it('refuses when the Met is full of held records, with no half link', () => {
    const g = kinGame(11, 1)
    for (let i = 0; i < MET_CAPS.records; i++) expect(touchMet(g, `cls.us.2000.${i}`, { fl: 32 }, 'us')).toBe(true)
    const a = sibs(g)[0]!
    const before = json(g)
    expect(adoptSpouse(g, a, { gender: 'female' })).toBeNull()
    expect(adoptChild(g, a, { first: 'Sol', last: 'Lee', gender: 'female' })).toBeNull()
    expect(json(g)).toBe(before)
  })

  it('refuses when the edge map is full of bound edges, with no half link and no record left behind', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    for (let i = 0; i < EDGE_CAPS.edges; i++) expect(putEdge(g, key(`person:q${i}`, `person:q${i + 1}`), { ...EDGE, k: 'rival' })).toBe(true)
    expect(Object.keys(readWorld(g).edges!)).toHaveLength(EDGE_CAPS.edges)
    const before = json(g)
    expect(adoptSpouse(g, a, { gender: 'female' })).toBeNull()
    expect(json(g)).toBe(before)
    expect(kinSidsOf(g)).toEqual([])
  })

  it('survives the 1,200-edge cap: a full map of weak edges gives way, and later writes never evict the pair edges', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    for (let i = 0; i < EDGE_CAPS.edges; i++) putEdge(g, key(`person:w${i}`, `person:w${i + 1}`), { ...EDGE, f: 10 })
    expect(Object.keys(readWorld(g).edges!)).toHaveLength(EDGE_CAPS.edges)
    const sid = adoptSpouse(g, a, { gender: 'female' })
    expect(sid).not.toBeNull()
    for (let i = 0; i < 1500; i++) putEdge(g, key(`person:x${i}`, `person:x${i + 1}`), { ...EDGE, f: 90 })
    expect(Object.keys(readWorld(g).edges!)).toHaveLength(EDGE_CAPS.edges)
    expect(readEdge(g, ent(a), `person:${sid}` as never)?.k).toBe('pair')
    expect(readEdge(g, `person:${sid}` as never, ent(a))?.k).toBe('pair')
    expect(kinProblems(g)).toEqual([])
  })

  it('refuses the 161st kin record', () => {
    const g = kinGame(11, 0)
    const anchors: Person[] = []
    for (let i = 0; i < KIN_CAPS.records + 5; i++) {
      const a = cast(g, 60, 'sibling', { age: 33 })
      married(g, a, 'Ana Ruiz')
      anchors.push(a)
    }
    const sids = anchors.map((a) => adoptSpouse(g, a, { gender: 'female' }))
    expect(sids.filter((s) => s !== null)).toHaveLength(KIN_CAPS.records)
    expect(kinSidsOf(g)).toHaveLength(KIN_CAPS.records)
    expect(sids.slice(KIN_CAPS.records)).toEqual([null, null, null, null, null])
    expect(kinProblems(g)).toEqual([])
  })
})

describe('adoptChild', () => {
  const baby = { first: 'Sol', last: 'Ruiz', gender: 'female' as const }

  it('makes a record born this year with weight 4 and flag 4, a kin edge both ways, the link and the fact', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const rngBefore = g.rng
    const nextBefore = g.nextId
    const sid = adoptChild(g, a, baby)
    expect(sid).toBe('kin.us.2026.0')
    const r = rec(g, sid)
    expect([r.f, r.l, r.g, r.b, r.c, r.w, r.fl, r.y]).toEqual(['Sol', 'Ruiz', 0, YEAR, 'us', KIN_ROLE.weight.child, 4, YEAR])
    expect(KIN_ROLE.weight.child).toBe(4)
    expect(readKin(a)).toEqual({ spouse: null, kids: [sid], y: YEAR })
    for (const k of [key(ent(a), `person:${sid}`), key(`person:${sid}`, ent(a))]) {
      const e = readWorld(g).edges![k as never] as Edge
      expect(e.k, k).toBe('kin')
      expect(edgeLocalBound(e)).toBe(true)
    }
    expect(g.rng).toBe(rngBefore)
    expect(g.nextId).toBe(nextBefore)
    expect(kinProblems(g)).toEqual([])
    expect(worldProblems(g, { live: false })).toEqual([])
  })

  it('links at most 6 kids to one anchor and refuses the seventh with nothing written', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const sids: string[] = []
    for (let i = 0; i < KIN_CAPS.kids; i++) {
      const sid = adoptChild(g, a, { ...baby, first: `Kid${i}` })
      expect(sid).not.toBeNull()
      sids.push(sid!)
    }
    expect(readKin(a).kids).toEqual(sids)
    const before = json(g)
    expect(adoptChild(g, a, baby)).toBeNull()
    expect(json(g)).toBe(before)
  })

  it('works on a sibling and a friend of a stamped life, and not on a child, a stepchild, a spouse, a partner, a fiance or a pet', () => {
    const g = kinGame(11, 0)
    const ok = ['sibling', 'halfSibling', 'stepsibling', 'friend', 'grandchild', 'parent'] as const
    for (const relation of ok) {
      const p = cast(g, 60, relation, { age: 33 })
      married(g, p, 'Ana Ruiz')
      expect(adoptChild(g, p, baby), relation).not.toBeNull()
    }
    for (const relation of ['child', 'stepchild', 'spouse', 'partner', 'fiance', 'pet'] as const) {
      const p = cast(g, 60, relation, { age: 33 })
      married(g, p, 'Ana Ruiz')
      const after = json(g)
      expect(adoptChild(g, p, baby), relation).toBeNull()
      expect(json(g), relation).toBe(after)
    }
  })

  it('is null on an unstamped life, for a dead anchor, and for a hostile name, gender, year or country; it never throws', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const bad: [string, Parameters<typeof adoptChild>[2]][] = [
      ['empty first', { ...baby, first: '' }],
      ['long first', { ...baby, first: 'F'.repeat(25) }],
      ['long last', { ...baby, last: 'L'.repeat(33) }],
      ['empty last', { ...baby, last: '' }],
      ['control', { ...baby, first: 'So\u0000l' }],
      ['not text', { first: 5 as never, last: 'Ruiz', gender: 'female' }],
      ['gender', { ...baby, gender: 'other' as never }],
      ['no identity', undefined as never],
      ['null identity', null as never],
    ]
    for (const [label, id] of bad) {
      const before = json(g)
      let sid: string | null = 'unset'
      expect(() => (sid = adoptChild(g, a, id)), label).not.toThrow()
      expect(sid, label).toBeNull()
      expect(json(g), label).toBe(before)
    }
    const un = makeTestGame(11, { age: 40 })
    const b = cast(un, 60, 'sibling', { age: 30 })
    const beforeUn = json(un)
    expect(adoptChild(un, b, baby)).toBeNull()
    expect(json(un)).toBe(beforeUn)
    a.alive = false
    expect(adoptChild(g, a, baby)).toBeNull()
    a.alive = true
    g.year = 1849
    expect(adoptChild(g, a, baby)).toBeNull()
    g.year = YEAR
    a.data.countryId = 'x y'
    expect(adoptChild(g, a, baby)).toBeNull()
    expect(kinSidsOf(g)).toEqual([])
  })
})

describe('unlinkSpouse', () => {
  it('ends the link: spouseSid gone, flag 2 cleared, both pair edges removed; the record stays and the legacy fields are untouched', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const sid = adoptSpouse(g, a, { gender: 'female' })!
    expect(unlinkSpouse(g, a)).toBe(true)
    expect(a.data.spouseSid).toBeUndefined()
    expect(rec(g, sid).fl).toBe(0)
    expect(kinEdgesOf(g)).toEqual([])
    expect(a.data.married).toBe(true)
    expect(a.data.spouseName).toBe(SPOUSE_NAMES[0])
    expect(kinProblems(g)).toEqual([])
    expect(unlinkSpouse(g, a)).toBe(false)
  })

  it('clears the flag on a tombstone too, and does nothing on an unstamped life or an anchor with no link', () => {
    const g = kinGame(11, 1)
    const a = sibs(g)[0]!
    const sid = adoptSpouse(g, a, { gender: 'female' })!
    // the record becomes a tombstone (held only by its own stake): the link end clears the flag there too
    expect(tombstoneMet(g, sid, { fl: 2 })).toBe(true)
    expect(metRecord(g, sid)).toBeNull()
    expect(metTomb(g, sid)?.[3]).toBe(2)
    const un = makeTestGame(3, { age: 40 })
    const b = cast(un, 60, 'sibling', { age: 33 })
    expect(unlinkSpouse(un, b)).toBe(false)
    expect(unlinkSpouse(g, cast(g, 60, 'sibling', { age: 30 }))).toBe(false)
    expect(unlinkSpouse(g, a)).toBe(true)
    expect(metTomb(g, sid)?.[3]).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. The legacy path: familyLifeCycle through the real ageUp

describe('the wedding and the baby of familyLifeCycle (relationships.ts)', () => {
  /** A stamped game with one sibling who is 25: the year-by-year wedding and baby rolls of familyLifeCycle can happen. */
  function start(seed: number, stamped: boolean): GameState {
    const g = stamped ? socialGame(seed, { age: 40 }) : makeTestGame(seed, { age: 40 })
    cast(g, 60, 'sibling', { age: 25, gender: 'female', firstName: 'Mara', lastName: g.character.lastName })
    return g
  }
  it('on a stamped life a wedding makes the record with the legacy name and the legacy gender, and a baby of a sibling makes a kid record', () => {
    const seed = findSeed(
      (s) => {
        const g = start(s, true)
        let wed = false
        let baby = false
        for (let i = 0; i < 25 && g.character.alive; i++) {
          ageUp(g)
          g.queue = []
          const a = sibs(g)[0]
          if (a === undefined) return false
          if (a.data.married === true) wed = true
          if (wed && Number(a.data.kids ?? 0) > 0) {
            baby = true
            break
          }
        }
        return wed && baby
      },
      { label: 'a sibling who weds and has a baby within 25 years', tries: 120 },
    )
    const g = start(seed, true)
    let married = false
    for (let i = 0; i < 25 && g.character.alive; i++) {
      ageUp(g)
      g.queue = []
      const a = sibs(g)[0]!
      if (a.data.married === true && !married) {
        married = true
        const sid = readKin(a).spouse
        expect(sid, 'the wedding made a link').not.toBeNull()
        const r = rec(g, sid)
        expect(`${r.f} ${r.l}`).toBe(a.data.spouseName)
        expect(r.fl & 2).toBe(2)
        expect(r.b).toBeLessThanOrEqual(g.year - 18)
      }
      if (Number(a.data.kids ?? 0) > 0) break
    }
    const a = sibs(g)[0]!
    const links = readKin(a)
    expect(links.kids.length).toBeGreaterThan(0)
    const kid = rec(g, links.kids[0]!)
    expect(kid.b).toBeLessThanOrEqual(g.year)
    expect(kid.fl & 4).toBe(4)
    expect(kinProblems(g)).toEqual([])
    expect(worldProblems(g, { live: false }).filter((p) => /^(kin|met|edges)/.test(p))).toEqual([])
    // the legacy lines are there too: the player's log says it
    const lines = g.log.flatMap((y) => y.entries.map((e) => e.text))
    expect(lines.some((l) => /married/.test(l))).toBe(true)
    expect(lines.some((l) => /had a baby/.test(l))).toBe(true)
  }, 120_000)

  it('the unstamped twin of the same seed draws the same numbers and has no record, no edge and no shard', () => {
    const seed = findSeed(
      (s) => {
        const g = start(s, false)
        for (let i = 0; i < 25 && g.character.alive; i++) {
          ageUp(g)
          g.queue = []
          if (sibs(g)[0]?.data.married === true) return true
        }
        return false
      },
      { label: 'a sibling who weds within 25 years (unstamped)', tries: 120 },
    )
    const a = start(seed, false)
    const b = start(seed, true)
    const names = (g: GameState): string => json(sibs(g).map((p) => [p.data.married, p.data.spouseName, p.data.kids]))
    let recorded = 0
    for (let i = 0; i < 25 && a.character.alive && b.character.alive; i++) {
      ageUp(a)
      ageUp(b)
      a.queue = []
      b.queue = []
      expect(b.rng, `year ${i}`).toBe(a.rng)
      expect(names(b), `year ${i}`).toBe(names(a))
      recorded = Math.max(recorded, kinSidsOf(b).length)
    }
    expect(a.world?.met).toBeUndefined()
    expect(kinSidsOf(a)).toEqual([])
    expect(recorded, 'the stamped twin made a record for the wedding').toBeGreaterThan(0)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. syncKin

describe('syncKin: the yearly step', () => {
  it('adopts the anchors that the three other writers married (a married anchor with no link), with a keyed gender and the legacy name', () => {
    const g = kinGame(21, 3)
    const rngBefore = g.rng
    const nextBefore = g.nextId
    nextYear(g)
    expect(g.rng).toBe(rngBefore)
    expect(g.nextId).toBe(nextBefore)
    expect(kinSidsOf(g)).toHaveLength(3)
    for (const a of sibs(g)) {
      const sid = readKin(a).spouse
      const r = rec(g, sid)
      expect(`${r.f} ${r.l}`).toBe(a.data.spouseName)
      expect(readKin(a).y).toBe(g.year)
      expect(YEAR + 1 - r.b).toBeGreaterThanOrEqual(18)
    }
    expect(kinProblems(g)).toEqual([])
  })

  it('does nothing on an unstamped life and nothing to a person who is not married or has no link', () => {
    const un = makeTestGame(21, { age: 40 })
    const a = cast(un, 60, 'sibling', { age: 30 })
    married(un, a, 'Ana Ruiz')
    const before = json(un)
    un.year += 1
    syncKin(un)
    expect(json(un)).toBe(before.replace(`"year":${YEAR}`, `"year":${YEAR + 1}`))
    const g = socialGame(21, { age: 40 })
    cast(g, 60, 'sibling', { age: 30 })
    cast(g, 60, 'friend', { age: 30 })
    const calm = json(g)
    syncKin(g)
    expect(json(g)).toBe(calm)
  })

  it('is idempotent by the year: a second call in the same year, a clone and a replay change nothing', () => {
    const g = kinGame(21, 3)
    nextYear(g)
    const once = json(g)
    syncKin(g)
    syncKin(g)
    expect(json(g)).toBe(once)
    const clone = structuredClone(g)
    syncKin(clone)
    expect(json(clone)).toBe(once)
    nextYear(g, 3)
    const later = json(g)
    syncKin(g)
    expect(json(g)).toBe(later)
  })

  it('a divorce unlinks (the anchor is no longer married): flag 2 cleared, both edges gone, the record stays', () => {
    const g = kinGame(21, 1)
    nextYear(g)
    const a = sibs(g)[0]!
    const sid = readKin(a).spouse!
    expect(sid).toBeTruthy()
    a.data.married = false
    // caught the next year, not the same one: the stamp of this year holds
    syncKin(g)
    expect(readKin(a).spouse).toBe(sid)
    nextYear(g)
    expect(readKin(a).spouse).toBeNull()
    expect(rec(g, sid).fl).toBe(0)
    expect(kinEdgesOf(g)).toEqual([])
    expect(a.data.widowed).toBeUndefined()
    expect(a.data.spouseName).toBe(SPOUSE_NAMES[0])
    expect(kinProblems(g)).toEqual([])
    // a new marriage by a legacy writer adopts a new record
    married(g, a, 'Lena Fischer')
    nextYear(g)
    expect(readKin(a).spouse).not.toBe(sid)
    expect(readKin(a).spouse).not.toBeNull()
  })

  it('a death widows once: the death year in the record, married false, widowed true, a history line, the link ended, a fact', () => {
    const g = kinGame(21, 1)
    nextYear(g)
    const a = withLife(sibs(g)[0]!)
    a.age = 60
    const sid = readKin(a).spouse!
    expect(touchMet(g, sid, { d: g.year + 1 })).toBe(true)
    nextYear(g)
    expect(rec(g, sid).d).toBe(g.year)
    expect(a.data.married).toBe(false)
    expect(a.data.widowed).toBe(true)
    expect(readKin(a).spouse).toBeNull()
    expect(rec(g, sid).fl).toBe(0)
    expect(kinEdgesOf(g)).toEqual([])
    const history = (a.data.life as { history?: string[] } | undefined)?.history ?? []
    expect(history.some((h) => /widowed/.test(h)), 'a history line').toBe(true)
    expect(kinProblems(g)).toEqual([])
    // once: later years change nothing (no second line, no second history entry, the same death year)
    const widowLines = (): number => g.log.flatMap((y) => y.entries).filter((e) => e.text.includes('Ana')).length
    const lineCount = widowLines()
    expect(lineCount).toBe(1)
    nextYear(g, 3)
    expect(widowLines()).toBe(lineCount)
    expect(((a.data.life as { history?: string[] }).history ?? []).filter((h) => /widowed/.test(h))).toHaveLength(1)
    expect(rec(g, sid).d).toBe(g.year - 3)
    expect(a.data.widowed).toBe(true)
    expect(kinProblems(g)).toEqual([])
  })

  it('the natural death of a record falls in the year ageTo says, and the step finds it in that year', () => {
    const g = kinGame(21, 1)
    const a = sibs(g)[0]!
    a.age = 70
    const sid = adoptSpouse(g, a, { gender: 'female' })!
    const r = rec(g, sid)
    const base = { sid, born: r.b, health: 35 + r.a[4] / 2 }
    let died: number | null = null
    for (let y = YEAR + 1; y <= YEAR + 70 && died === null; y++) {
      const life = ageTo(g, base, y, { since: YEAR })
      if (!life.alive) died = life.died
    }
    expect(died, 'a record born near 1956 dies within 70 years').not.toBeNull()
    for (let y = YEAR + 1; y <= died!; y++) {
      nextYear(g)
      expect(a.data.widowed === true, `year ${y}`).toBe(y === died ? true : false)
      for (const k of kinSidsOf(g)) expect(metRecord(g, k)!.d === undefined || metRecord(g, k)!.d! <= g.year, 'no foresight').toBe(true)
    }
    expect(rec(g, sid).d).toBe(died)
    expect(a.data.married).toBe(false)
  })

  it('a widowing makes one log line when the anchor is close, none when the anchor is distant, and the line takes a uid and no draw', () => {
    const close = kinGame(21, 1)
    const far = kinGame(21, 1)
    for (const [g, rel] of [[close, 80], [far, 20]] as const) {
      nextYear(g)
      const a = sibs(g)[0]!
      a.age = 60
      a.relationship = rel
      expect(touchMet(g, readKin(a).spouse!, { d: g.year + 1 })).toBe(true)
    }
    const rng = [close.rng, far.rng]
    const ids = [close.nextId, far.nextId]
    nextYear(close)
    nextYear(far)
    expect(close.rng).toBe(rng[0])
    expect(far.rng).toBe(rng[1])
    expect(close.nextId).toBe(ids[0]! + 1)
    expect(far.nextId).toBe(ids[1])
    const lines = (g: GameState): string[] => g.log.flatMap((y) => y.entries).map((e) => e.text)
    const said = lines(close).filter((t) => t.includes(SPOUSE_NAMES[0]!.split(' ')[0]!))
    expect(said).toHaveLength(1)
    expect(said[0]!.length).toBeLessThanOrEqual(90)
    // the line is one of the pool, with the relative and the one who died filled in
    const first = sibs(close)[0]!.firstName
    expect(KIN_WIDOWED.map((l) => l.replace('{who}', `my sister ${first}`).replace('{spouse}', 'Ana'))).toContain(said[0])
    expect(lines(far).filter((t) => t.includes(SPOUSE_NAMES[0]!.split(' ')[0]!))).toEqual([])
    // the npc.news budget of the year (3) is respected
    expect(close.yearActions['npc.news']).toBe(1)
  })

  it('the budget of 3 npc.news lines a year holds: the fourth widowing is quiet', () => {
    const g = kinGame(21, 5)
    nextYear(g)
    for (const a of sibs(g)) {
      a.age = 60
      a.relationship = 90
      touchMet(g, readKin(a).spouse!, { d: g.year + 1 })
    }
    nextYear(g)
    expect(g.yearActions['npc.news']).toBe(3)
    expect(sibs(g).every((a) => a.data.widowed === true)).toBe(true)
    const said = g.log.flatMap((y) => y.entries).filter((e) => SPOUSE_NAMES.slice(0, 5).some((n) => e.text.includes(n.split(' ')[0]!)))
    expect(said).toHaveLength(3)
  })

  it('a child that dies is unlinked with its death year written, flag 4 cleared, its kin edges removed, and the anchor stays married', () => {
    const g = kinGame(21, 1)
    nextYear(g)
    const a = sibs(g)[0]!
    const first = adoptChild(g, a, { first: 'Sol', last: 'Ruiz', gender: 'female' })!
    const second = adoptChild(g, a, { first: 'Kai', last: 'Ruiz', gender: 'male' })!
    expect(touchMet(g, first, { d: g.year + 1 })).toBe(true)
    nextYear(g)
    expect(rec(g, first).d).toBe(g.year)
    expect(rec(g, first).fl).toBe(0)
    expect(readKin(a).kids).toEqual([second])
    expect(a.data.married).toBe(true)
    expect(kinEdgesOf(g).filter((e) => e.includes(first))).toEqual([])
    expect(kinEdgesOf(g).filter((e) => e.includes(second))).toHaveLength(2)
    expect(kinProblems(g)).toEqual([])
  })

  it('a link to nobody (the record is gone) is dropped quietly, and the anchor is adopted afresh the year after', () => {
    const g = kinGame(21, 1)
    nextYear(g)
    const a = sibs(g)[0]!
    const sid = readKin(a).spouse!
    // a hostile save: the record and the tombstone are gone
    const shard = { ...readMet(g) } as Record<string, unknown>
    delete shard[sid]
    ;(g.world as { met?: unknown }).met = shard
    nextYear(g)
    nextYear(g)
    expect(kinProblems(g)).toEqual([])
    const sid2 = readKin(a).spouse
    expect(sid2).not.toBeNull()
    expect(metRecord(g, sid2!)).not.toBeNull()
  })

  it('the orphan sweep clears the flags and the edges of an anchor that left the game, and of one dead 10 years or more; a recent death keeps them', () => {
    const g = kinGame(21, 3)
    nextYear(g)
    const [gone, old, recent] = sibs(g) as [Person, Person, Person]
    const kid = adoptChild(g, recent, { first: 'Sol', last: 'Ruiz', gender: 'female' })!
    const sids = { gone: readKin(gone).spouse!, old: readKin(old).spouse!, recent: readKin(recent).spouse! }
    g.people = g.people.filter((p) => p.id !== gone.id)
    old.alive = false
    old.data.diedYear = g.year - 9
    recent.alive = false
    recent.data.diedYear = g.year - 8
    expect(kinProblems(g).some((l) => l.includes(sids.gone)), 'the flag of a removed anchor is a fault until the sweep').toBe(true)
    nextYear(g)
    expect(rec(g, sids.gone).fl & 6).toBe(0)
    expect(rec(g, sids.old).fl & 6).toBe(0)
    expect(rec(g, sids.recent).fl & 6).toBe(2)
    expect(rec(g, kid).fl & 6).toBe(4)
    const edges = kinEdgesOf(g)
    expect(edges.filter((e) => e.includes(sids.gone) || e.includes(sids.old))).toEqual([])
    expect(edges.filter((e) => e.includes(sids.recent) || e.includes(kid))).toHaveLength(4)
    expect(kinProblems(g)).toEqual([])
    // a dead anchor (recent) is not stepped for deaths or divorces
    nextYear(g)
    expect(rec(g, sids.recent).fl & 6).toBe(0)
    expect(kinEdgesOf(g)).toEqual([])
    expect(kinProblems(g)).toEqual([])
  })

  it('keeps every linked record fresh so the Met sweep never tombstones a link, for 40 years, and the face stays the same', () => {
    const g = kinGame(21, 2)
    nextYear(g)
    const a = sibs(g)[0]!
    adoptChild(g, a, { first: 'Sol', last: 'Ruiz', gender: 'female' })
    const faceOf = (s: string): string => `${rec(g, s).f} ${rec(g, s).l} ${rec(g, s).b}`
    const before = new Map(kinSidsOf(g).map((s) => [s, faceOf(s)]))
    expect(before.size).toBe(3)
    let stood = 0
    for (let i = 0; i < 40; i++) {
      nextYear(g)
      sweepMet(g)
      for (const p of sibs(g)) {
        // a record may be unlinked by a death in 40 years; a link that stands is still a record, with the face it had
        for (const s of [readKin(p).spouse, ...readKin(p).kids]) {
          if (s === null) continue
          stood++
          expect(metRecord(g, s), `${s} in year ${i}`).not.toBeNull()
          expect(faceOf(s)).toBe(before.get(s))
        }
      }
      expect(kinProblems(g), `year ${i}`).toEqual([])
    }
    expect(stood).toBeGreaterThan(40)
  })

  it('does not touch the legacy fields (spouseName, kids) and draws nothing from g.rng for 30 years; married only turns false with widowed true', () => {
    const g = kinGame(21, 3)
    nextYear(g)
    const names = json(sibs(g).map((p) => [p.data.spouseName, p.data.kids]))
    for (const a of sibs(g)) a.relationship = 10
    const next = g.nextId
    trapRng(g)
    nextYear(g, 30)
    expect(json(sibs(g).map((p) => [p.data.spouseName, p.data.kids]))).toBe(names)
    for (const p of sibs(g)) expect(p.data.married === true || p.data.widowed === true, p.firstName).toBe(true)
    expect(g.nextId, 'distant anchors make no line').toBe(next)
    expect(kinProblems(g)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Facts and caps

describe('facts', () => {
  const rows = (g: GameState, year: number): string[] => readFacts(g).filter((f) => f.y === year && f.k.startsWith('life.')).map((f) => f.k)

  it('a wedding, a baby and a death emit life.wed, life.birth and life.death, with the anchor and the record', () => {
    const g = kinGame(5, 1)
    const a = sibs(g)[0]!
    const spouse = adoptSpouse(g, a, { gender: 'female' })!
    const kid = adoptChild(g, a, { first: 'Sol', last: 'Ruiz', gender: 'female' })!
    const wed = readFacts(g).find((f) => f.k === 'life.wed')
    const birth = readFacts(g).find((f) => f.k === 'life.birth')
    expect(wed).toMatchObject({ k: 'life.wed', y: YEAR, c: ent(a), a: spouse })
    expect(birth).toMatchObject({ k: 'life.birth', y: YEAR, c: ent(a), a: kid })
    expect(touchMet(g, spouse, { d: YEAR + 1 })).toBe(true)
    nextYear(g)
    const death = readFacts(g).find((f) => f.k === 'life.death')
    expect(death).toMatchObject({ k: 'life.death', y: YEAR + 1, c: ent(a), a: spouse })
    expect(g.yearActions['life.facts']).toBe(1)
  })

  it('at most 8 a year, whatever the year holds, and the counter is the shared one (g.yearActions life.facts)', () => {
    const g = kinGame(5, 0)
    for (let i = 0; i < 30; i++) {
      const a = cast(g, 60, 'sibling', { age: 33 })
      married(g, a, 'Ana Ruiz')
      adoptSpouse(g, a, { gender: 'female' })
      adoptChild(g, a, { first: 'Sol', last: 'Ruiz', gender: 'female' })
    }
    expect(kinSidsOf(g).length).toBe(60)
    expect(g.yearActions['life.facts']).toBe(8)
    expect(rows(g, YEAR)).toHaveLength(8)
    // the next year has its own 8
    g.year += 1
    g.yearActions = {}
    for (let i = 0; i < 10; i++) {
      const a = cast(g, 60, 'sibling', { age: 33 })
      adoptChild(g, a, { first: 'Kai', last: 'Ruiz', gender: 'male' })
    }
    expect(g.yearActions['life.facts']).toBe(8)
    expect(rows(g, YEAR + 1)).toHaveLength(8)
  })

  it('never throws and emits nothing when the bus has no module for the kind, and a shared counter set high by another task holds', () => {
    const g = kinGame(5, 1)
    g.yearActions['life.facts'] = 8
    const a = sibs(g)[0]!
    expect(adoptSpouse(g, a, { gender: 'female' })).not.toBeNull()
    expect(rows(g, YEAR)).toEqual([])
    expect(g.yearActions['life.facts']).toBe(8)
  })
})

describe('caps and bounds at 100 times', () => {
  it('40,000 adoptions over 400 anchors: 160 records, 1 spouse and 6 kids an anchor, edges inside their cap, no fault anywhere', () => {
    const g = kinGame(7, 0)
    const anchors: Person[] = []
    for (let i = 0; i < 400; i++) {
      const a = cast(g, 60, i % 4 === 0 ? 'friend' : 'sibling', { age: 25 + (i % 30), gender: i % 2 === 0 ? 'female' : 'male', firstName: `A${i}`, lastName: 'Lee' })
      married(g, a, SPOUSE_NAMES[i % SPOUSE_NAMES.length])
      anchors.push(a)
    }
    for (let i = 0; i < 40_000; i++) {
      const a = anchors[(i * 7) % 400]!
      if (i % 5 === 0) adoptSpouse(g, a, { gender: 'female' })
      else adoptChild(g, a, { first: `K${i % 90}`, last: 'Lee', gender: i % 2 === 0 ? 'male' : 'female' })
    }
    const sids = kinSidsOf(g)
    expect(sids.length).toBeLessThanOrEqual(KIN_CAPS.records)
    expect(sids.length).toBe(KIN_CAPS.records)
    expect(Object.keys(readWorld(g).edges!).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    expect(Object.keys(readWorld(g).edges!).length).toBe(KIN_CAPS.records * 2)
    let flagged = 0
    for (const s of sids) if ((rec(g, s).fl & 6) !== 0) flagged++
    expect(flagged).toBe(sids.length)
    for (const a of anchors) {
      const links = readKin(a)
      expect(links.kids.length).toBeLessThanOrEqual(KIN_CAPS.kids)
      expect(new Set(links.kids).size).toBe(links.kids.length)
    }
    expect(kinProblems(g)).toEqual([])
    expect(worldProblems(g, { live: false })).toEqual([])
    expect(Object.keys(readMet(g)).length).toBeLessThanOrEqual(MET_CAPS.records + MET_CAPS.tombs)
  }, 120_000)

  it('steps 400 anchors for 100 years inside the caps (the year step at 100 times the load)', () => {
    const g = kinGame(7, 0)
    for (let i = 0; i < 400; i++) {
      const a = cast(g, 60, 'sibling', { age: 25 + (i % 30), gender: i % 2 === 0 ? 'female' : 'male', firstName: `A${i}`, lastName: 'Lee' })
      married(g, a, SPOUSE_NAMES[i % SPOUSE_NAMES.length])
    }
    nextYear(g, 100)
    expect(kinSidsOf(g).length).toBeLessThanOrEqual(KIN_CAPS.records)
    expect(kinProblems(g)).toEqual([])
    expect(g.yearActions['life.facts'] ?? 0).toBeLessThanOrEqual(8)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. The same names, and the twin

describe('the same names after a clone, a reload, an heir and a fork', () => {
  /** A stamped new life with a few years behind it, two weddings and a baby on record (a real life, so the save store takes it whole). */
  function lived(): GameState {
    const g = socialLife({ seed: LIFE_SEED, year: BIRTH, countryId: 'us' })
    for (let i = 0; i < 2; i++) {
      const sib = withLife(cast(g, 60, 'sibling', { age: 30 + i, gender: i === 0 ? 'female' : 'male', firstName: i === 0 ? 'Mara' : 'Tomas', lastName: g.character.lastName }))
      married(g, sib, SPOUSE_NAMES[i]!)
    }
    nextYear(g)
    const mine = g.people.filter((p) => p.relation === 'sibling' && p.data.spouseName !== undefined)
    adoptChild(g, mine[0]!, { first: 'Sol', last: 'Ruiz', gender: 'female' })
    nextYear(g, 2)
    return g
  }
  const faces = (g: GameState): string => canonical(Object.fromEntries(kinSidsOf(g).map((s) => [s, [rec(g, s).f, rec(g, s).l, rec(g, s).g, rec(g, s).b, rec(g, s).c]])))
  const links = (g: GameState): string => canonical(g.people.filter((p) => p.data.spouseSid !== undefined || p.data.kidSids !== undefined).map((p) => [p.id, readKin(p)]))

  it('a clone and a replay see the same records, and play on the same', () => {
    const g = lived()
    const clone = structuredClone(g)
    expect(faces(clone)).toBe(faces(g))
    expect(faces(lived())).toBe(faces(g))
    expect(kinSidsOf(g).length).toBe(3)
    nextYear(g, 5)
    nextYear(clone, 5)
    expect(faces(clone)).toBe(faces(g))
    expect(canonical(readMet(clone))).toBe(canonical(readMet(g)))
    expect(links(clone)).toBe(links(g))
  })

  it('a game that was saved and loaded keeps the records, the links and the edges, and plays on the same', () => {
    const g = lived()
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()
      expect(back).not.toBeNull()
      expect(faces(back!)).toBe(faces(g))
      expect(links(back!)).toBe(links(g))
      expect(kinEdgesOf(back!)).toEqual(kinEdgesOf(g))
      expect(kinProblems(back!)).toEqual([])
      nextYear(back!, 3)
      nextYear(g, 3)
      expect(faces(back!)).toBe(faces(g))
      expect(links(back!)).toBe(links(g))
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)

  it('a snapshot of the Time Machine, restored and played on, has the same names', async () => {
    const g = lived()
    const snap = structuredClone(g)
    const backend = memorySnapshotBackend()
    setSnapshotBackend(backend)
    try {
      startTimeline(snap.lifeId, null)
      await snapshotWritesSettled()
      expect(await takeSnapshot(snap)).toBe(true)
      await snapshotWritesSettled()
      const restored = await loadSnapshot(snap.lifeId, snap.character.age)
      expect(restored).not.toBeNull()
      expect(faces(restored!)).toBe(faces(g))
      nextYear(restored!, 4)
      nextYear(g, 4)
      expect(faces(restored!)).toBe(faces(g))
    } finally {
      setSnapshotBackend(null)
    }
  }, 120_000)

  it('the hand-over to an heir keeps the relative who is a known contact, with the link, the record and the same face', () => {
    const g = socialGame(5, { age: 82, money: 2_000_000 })
    const kid = cast(g, 70, 'child', { age: 50, lastName: g.character.lastName })
    const sib = withLife(cast(g, 60, 'sibling', { age: 60, lastName: g.character.lastName, gender: 'female' }))
    married(g, sib, 'Ana Ruiz')
    const sid = adoptSpouse(g, sib, { gender: 'male' })!
    const before = faces(g)
    killCharacter(g, 'Heart Attack')
    g.queue = []
    const n = continueAsChild(g, kid.id)
    expect(n).not.toBe(g)
    expect(socialOn(n)).toBe(true)
    expect(faces(n)).toBe(before)
    expect(rec(n, sid).f).toBe('Ana')
    const kept = n.people.find((p) => p.id === sib.id)
    expect(kept, 'the sibling is a known contact of the heir').toBeDefined()
    expect(readKin(kept!).spouse).toBe(sid)
    expect(kinProblems(n)).toEqual([])
    expect(worldProblems(n, { live: false }).filter((p) => /^(kin|met)/.test(p))).toEqual([])
    nextYear(n, 3)
    expect(faces(n)).toBe(before)
    expect(kinProblems(n)).toEqual([])
  }, 120_000)
})

describe('a stamped twin of a life with no kin line', () => {
  /** A bare game with one sibling of 48 (the wedding roll closes at 55): a wedding is possible for 8 years only. */
  function twin(seed: number, stamped: boolean): GameState {
    const g = stamped ? socialGame(seed, { age: 30 }) : makeTestGame(seed, { age: 30 })
    cast(g, 60, 'sibling', { age: 48, gender: 'female', firstName: 'Mara', lastName: g.character.lastName })
    return g
  }
  const fields = (g: GameState): string => json(g.people.map((p) => [p.id, p.data.married, p.data.spouseName, p.data.kids]))

  it('keeps g.rng, g.nextId and every married, spouseName and kids field equal for 40 years', () => {
    const seed = findSeed(
      (s) => {
        const g = twin(s, false)
        for (let i = 0; i < 40 && g.character.alive; i++) {
          ageUp(g)
          g.queue = []
        }
        return g.people.every((p) => p.data.married !== true && p.data.kids === undefined)
      },
      { label: 'a bare life with no wedding and no baby in 40 years', tries: 120 },
    )
    const a = twin(seed, false)
    const b = twin(seed, true)
    for (let i = 0; i < 40 && a.character.alive && b.character.alive; i++) {
      ageUp(a)
      ageUp(b)
      a.queue = []
      b.queue = []
      expect(b.rng, `year ${i}`).toBe(a.rng)
      expect(b.nextId, `year ${i}`).toBe(a.nextId)
      expect(fields(b), `year ${i}`).toBe(fields(a))
    }
    expect(a.world?.met).toBeUndefined()
    expect(b.world?.met).toBeUndefined()
    expect(kinSidsOf(b)).toEqual([])
    // no key on any person of either twin
    for (const g of [a, b]) for (const p of g.people) for (const k of ['spouseSid', 'kidSids', 'kinY', 'widowed']) expect(Object.keys(p.data), `${p.id} ${k}`).not.toContain(k)
  }, 120_000)

  it('a widowing keeps g.rng equal and g.nextId one higher (the line takes a uid), for an anchor past the wedding and baby rolls', () => {
    const make = (stamped: boolean): GameState => {
      const g = stamped ? socialGame(9, { age: 70 }) : makeTestGame(9, { age: 70 })
      const a = cast(g, 80, 'sibling', { age: 62, gender: 'female', firstName: 'Mara', lastName: g.character.lastName })
      married(g, a, 'Ana Ruiz')
      return g
    }
    const plain = make(false)
    const stamped = make(true)
    syncKin(stamped)
    const sid = readKin(sibs(stamped)[0]!).spouse!
    expect(sid).toBeTruthy()
    expect(touchMet(stamped, sid, { d: YEAR + 1 })).toBe(true)
    expect(stamped.rng).toBe(plain.rng)
    ageUp(plain)
    ageUp(stamped)
    plain.queue = []
    stamped.queue = []
    expect(sibs(stamped)[0]!.data.widowed).toBe(true)
    expect(stamped.rng).toBe(plain.rng)
    expect(stamped.nextId).toBe(plain.nextId + 1)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 8. The module, the groups, the edge half of kinProblems, the cost, the source

describe('the module life.kin', () => {
  it('is the life phase at order 37 of the aging seam, layer 3, and declares the three facts', () => {
    expect(kinModule.id).toBe('life.kin')
    expect(kinModule.layer).toBe(3)
    expect(kinModule.yearly).toEqual([{ seam: 'aging', phase: 'life', order: 37, run: syncKin }])
    expect(kinModule.facts).toEqual(['life.wed', 'life.birth', 'life.death'])
    expect(kinModule.slices).toBeUndefined()
  })

  it('is registered in id order between knowledge.core and menus.core, and runs after effort.you (35) and before relationships (40)', () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids).toContain('life.kin')
    expect(ids.indexOf('life.kin')).toBeGreaterThan(ids.indexOf('knowledge.core'))
    expect(ids.indexOf('life.kin')).toBeLessThan(ids.indexOf('menus.core'))
    const order = yearlyEntries('aging').map((e) => e.id)
    expect(order.indexOf('life.kin')).toBeGreaterThan(order.indexOf('effort.you'))
    expect(order.indexOf('life.kin')).toBeLessThan(order.indexOf('yearly.relationships'))
    expect(order.indexOf('life.kin')).toBeGreaterThan(order.indexOf('yearly.household'))
  })

  it('a year of ageUp runs it: a married anchor of a stamped life gets a record', () => {
    const g = kinGame(41, 1)
    ageUp(g)
    g.queue = []
    expect(kinSidsOf(g).length).toBeGreaterThanOrEqual(1)
  })
})

describe('KIN_WIDOWED, the line a widowing makes for a close relative', () => {
  it('has lines that read as sentences: both slots in each, none starts with the lower case {who}, each ends with a full stop and is under 90 static characters', () => {
    expect(KIN_WIDOWED.length).toBeGreaterThanOrEqual(5)
    for (const line of KIN_WIDOWED) {
      expect(line, line).toContain('{who}')
      expect(line, line).toContain('{spouse}')
      expect(line.startsWith('{who}'), line).toBe(false)
      expect(line.endsWith('.'), line).toBe(true)
      expect(line.replace(/\{[a-z]+\}/g, '').length, line).toBeLessThanOrEqual(90)
    }
  })
})

describe('kinProblems names a link whose pair or kin edge is missing, in either direction, on a stamped life (invariant 10, the edge half)', () => {
  it('names the missing pair edge in each direction and the missing kin edge in each direction', () => {
    for (const [role, kind] of [['spouse', 'pair'], ['child', 'kin']] as const) {
      for (const dir of ['out', 'in'] as const) {
        const g = kinGame(51, 1)
        const a = sibs(g)[0]!
        const sid = role === 'spouse' ? adoptSpouse(g, a, { gender: 'female' })! : adoptChild(g, a, { first: 'Sol', last: 'Ruiz', gender: 'female' })!
        expect(kinProblems(g)).toEqual([])
        const k = dir === 'out' ? key(ent(a), `person:${sid}`) : key(`person:${sid}`, ent(a))
        expect(putEdge(g, k, null)).toBe(true)
        const problems = kinProblems(g)
        expect(problems.length, `${role} ${dir}`).toBe(1)
        expect(problems[0]).toContain(sid)
        expect(problems[0]).toContain(kind)
        expect(worldProblems(g, { live: false }).some((p) => p.startsWith('kin: ') && p.includes(sid))).toBe(true)
      }
    }
  })

  it('names an edge that is there but not marked as the kind, and names nothing on an unstamped life', () => {
    const g = kinGame(51, 1)
    const a = sibs(g)[0]!
    const sid = adoptSpouse(g, a, { gender: 'female' })!
    expect(putEdge(g, key(ent(a), `person:${sid}`), { k: undefined })).toBe(true)
    expect(kinProblems(g).length).toBe(1)
    const un = makeTestGame(5, { age: 40 })
    const b = cast(un, 60, 'sibling', { age: 30 })
    b.data.spouseSid = 'kin.us.2026.0'
    touchMet(un, 'kin.us.2026.0', { fl: 2 }, 'us')
    expect(socialOn(un)).toBe(false)
    expect(kinProblems(un)).toEqual([])
  })

  it('does not hold an anchor dead for 10 years to its edges', () => {
    const g = kinGame(51, 1)
    const a = sibs(g)[0]!
    const sid = adoptSpouse(g, a, { gender: 'female' })!
    expect(putEdge(g, key(ent(a), `person:${sid}`), null)).toBe(true)
    a.alive = false
    a.data.diedYear = YEAR - 12
    expect(kinProblems(g).filter((l) => l.includes('edge'))).toEqual([])
  })
})

describe('the cost of the step', () => {
  it('40 anchors for 50 years average under 5 ms a year (printed, asserted)', () => {
    const g = kinGame(61, 0)
    for (let i = 0; i < 40; i++) {
      const a = cast(g, 60, 'sibling', { age: 25 + (i % 25), gender: i % 2 === 0 ? 'female' : 'male', firstName: `A${i}`, lastName: 'Lee' })
      married(g, a, SPOUSE_NAMES[i % SPOUSE_NAMES.length])
    }
    nextYear(g)
    for (const a of sibs(g).slice(0, 12)) adoptChild(g, a, { first: 'Sol', last: 'Lee', gender: 'female' })
    const times: number[] = []
    for (let y = 0; y < 50; y++) {
      g.year += 1
      g.yearActions = {}
      const t = performance.now()
      syncKin(g)
      times.push(performance.now() - t)
    }
    const mean = times.reduce((s, x) => s + x, 0) / times.length
    const budget = 5 * machineFactor()
    console.log(`syncKin (L4): 40 anchors, 50 years: mean ${mean.toFixed(3)} ms, worst ${Math.max(...times).toFixed(3)} ms, budget ${budget.toFixed(2)} ms (5 ms x machine factor ${machineFactor().toFixed(2)})`)
    expect(mean).toBeLessThan(budget)
    expect(kinProblems(g)).toEqual([])
  }, 60_000)
})

describe('a real stamped life', () => {
  it('plays 45 years with no fault in the kin, met and edge shards, bounded records and edges, and its records line up with its links', () => {
    const g = socialLife({ seed: LIFE_SEED, year: BIRTH, countryId: 'us' })
    expect(socialOn(g)).toBe(true)
    for (let i = 0; i < 45 && g.character.alive; i++) {
      ageUp(g)
      g.queue = []
      const faults = worldProblems(g, { live: false }).filter((p) => /^(kin|met|edges)/.test(p))
      expect(faults, `year ${i}`).toEqual([])
      expect(kinSidsOf(g).length).toBeLessThanOrEqual(KIN_CAPS.records)
    }
    for (const sid of kinSidsOf(g)) {
      const linked = g.people.some((p) => readKin(p).spouse === sid || readKin(p).kids.includes(sid))
      const r = rec(g, sid)
      expect(linked || (r.fl & 6) === 0, `${sid} is linked or unflagged`).toBe(true)
    }
  }, 180_000)
})

describe('the source', () => {
  const files = ['src/game/kin.ts', 'src/game/modules/kin-years.ts', 'test/kin-kit.ts', 'docs/KIN.md']

  it('carries no long dash in any file of the task', () => {
    for (const f of files) expect(DASH.test(read(f)), f).toBe(false)
  })

  it('kin.ts imports neither relationships.ts nor life.ts nor npc-lives.ts (an import cycle with relationships.ts otherwise)', () => {
    const text = read('src/game/kin.ts')
    const specs = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!)
    for (const s of specs) {
      expect(s, 'kin.ts imports').not.toMatch(/(^|\/)(relationships|life|npc-lives|love)$/)
    }
  })

  it('kin.ts writes no sid as a property of a data literal and draws no luck from g.rng or the clock', () => {
    const text = read('src/game/kin.ts').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(text).not.toMatch(/\bdata:\s*\{[^}]*\bsid\b/)
    expect(text).not.toMatch(/\.sid\s*=[^=]/)
    expect(text).not.toMatch(/\b(rand|randInt|randFloat|chance|pick|weightedPick|shuffle|bell|uid)\(/)
    expect(text).not.toMatch(/Math\.random|Date\.now|new Date|\.rng\b/)
  })

  it('documents the writers in docs/KIN.md and the table in the hand-off form', () => {
    const doc = read('docs/KIN.md')
    for (const word of ['adoptSpouse', 'adoptChild', 'syncKin', 'KIN_IDENTITY', 'life.kin', 'unlinkSpouse']) expect(doc, word).toContain(word)
  })
})
