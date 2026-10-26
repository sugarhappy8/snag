// R4-S10 (D.2 c): the readers move over at parity. One home for the trait tables, seeds keyed by personKey, and the axes of a person
// who was born from a sid. Every existing person reads exactly as before; nothing here may move a number of a life with no Met record.
//
// What the file proves, in the order of the plan:
//   1. parity     forty persons live five years through yearlyNpcLife and every year's digest equals the one recorded on the code
//                 before this task (RECORD_AXES_READERS=1 writes it; the S1 pins cover initializeNpc and the trait readers), and a
//                 life with no Met record never gains a `world`
//   2. seeds      the three seed strings of npc-lives.ts are keyed by personKey: a sid is the same person under any id, and a person
//                 with no sid keeps its id
//   3. the axis   a person with a Met record starts from the record's ambition axis (cut 5..98), the same after an heir switch and
//                 a reload; the record is written by hand with S4's writeMet (touchMet and materializePerson come later)
//   4. axesOfPerson  the Met axes for a sid-born person, else the trait axes with the life's ambition; total, pure, bounded
//
// No pinned seed: every life is makeTestGame's or adult()'s own.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { initializeNpc, yearlyNpcLife } from '../src/game/npc-lives'
import { axesOfPerson, npcLife, saveNpcLife } from '../src/game/npc-state'
import { createPerson } from '../src/game/people'
import { MAIN_CHARACTER } from '../src/game/talents'
import type { GameState, Person } from '../src/game/types'
import { assembleSave, encodeSave } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { personKey } from '../src/game/kernel/person-ref'
import { AXIS_IDS, axesFromTraits, type AxisTuple, type Axes } from '../src/game/world/axes'
import { readMet, writeMet, type MetRecord } from '../src/game/world/met'
import { makeSid } from '../src/game/world/sid'
import '../src/game/world/shards'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { canonicalJson, fnv } from './golden-kit'
import { makeTestGame } from './helpers'
import { adult } from './market-kit'
import { npcPersons, plainPerson } from './registry-pins-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PINS_FILE = 'test/fixtures/axes-readers-pins.json'
const RECORD_COMMAND = 'RECORD_AXES_READERS=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/axes-readers.test.ts'
const RECORD = process.env.RECORD_AXES_READERS === '1'
const NPC_LIFE_FILE = 'src/game/npc-lives.ts'

// ---------------------------------------------------------------------------------------------------------------------------
// The lived years: forty persons, five years, one digest for each
// ---------------------------------------------------------------------------------------------------------------------------

const YEARS = 5
/** Relations yearlyNpcLife visits (the IMPORTANT list of npc-lives.ts), in turn. */
const RELATIONS = ['friend', 'sibling', 'parent', 'spouse', 'bestFriend', 'partner', 'lover', 'grandparent'] as const

/**
 * The forty persons of the S1 pins, made to live: a relation the yearly step visits, money from nothing to millions, and the family
 * gift on every fifth (those are ambitious too, so the venture roll of npc-lives.ts runs for them). Ids are p1..p40, no sid, no Met.
 */
function livedWorld(): { g: GameState; people: Person[] } {
  const g = makeTestGame(31, { age: 45, money: 30_000_000 })
  g.lifeId = 'axes-readers-g2'
  const people = npcPersons()
  people.forEach((p, i) => {
    p.relation = RELATIONS[i % RELATIONS.length]!
    p.money = [0, 40_000, 2_500_000, 12_000_000][i % 4]!
    if (i % 5 === 0) {
      p.data.talent = MAIN_CHARACTER
      p.money = 20_000_000
    }
  })
  g.people = people
  return { g, people }
}

/** One short digest of a person as the yearly step leaves them. Floats are cut to nine digits by canonicalJson. */
const digestPerson = (p: Person): string => fnv(canonicalJson({ occupation: p.occupation, money: p.money, relationship: p.relationship, age: p.age, data: p.data }))

/** The digest of everything else the five years can touch: the counters, the assets, the flags, the log and the world. */
const digestWorld = (g: GameState): string =>
  fnv(canonicalJson({ rng: g.rng, nextId: g.nextId, assets: g.assets, flags: g.flags, counters: g.counters, yearActions: g.yearActions, log: g.log, world: g.world ?? null }))

type PinRow = readonly [id: string, digests: readonly string[]]

/** Forty person rows and one world row, five digests each (one a year). */
function liveRows(): PinRow[] {
  const { g, people } = livedWorld()
  const per = new Map<string, string[]>(people.map((p) => [p.id, []]))
  const world: string[] = []
  for (let y = 0; y < YEARS; y++) {
    g.year = 2026 + y
    for (const p of people) {
      if (y > 0) p.age += 1
      yearlyNpcLife(g, p)
      per.get(p.id)!.push(digestPerson(p))
    }
    world.push(digestWorld(g))
  }
  return [...people.map((p) => [p.id, per.get(p.id)!] as const), ['world', world] as const]
}

interface Pins {
  v: number
  node: string
  head: string
  rows: PinRow[]
}

function readPins(): Pins {
  const path = join(ROOT, PINS_FILE)
  if (!existsSync(path)) throw new Error(`${PINS_FILE} is missing: ${RECORD_COMMAND}`)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Pins
  if (raw.v !== 1) throw new Error(`${PINS_FILE}: unknown version ${String(raw.v)}`)
  return raw
}

/** One row to a line, so a diff names the person that moved. Writes only when RECORD_AXES_READERS=1. */
function recordPins(): void {
  if (!RECORD) throw new Error(`recordPins writes the pins only when asked: ${RECORD_COMMAND}`)
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const lines = liveRows().map((r) => JSON.stringify(r))
  writeFileSync(join(ROOT, PINS_FILE), `{\n"v": 1,\n"node": ${JSON.stringify(process.version)},\n"head": ${JSON.stringify(head)},\n"rows": [\n${lines.join(',\n')}\n]\n}\n`)
}

describe('the recorder', () => {
  it.skipIf(RECORD)('refuses to write without RECORD_AXES_READERS=1, and says what to run', () => {
    expect(() => recordPins()).toThrow(/RECORD_AXES_READERS=1/)
  })

  it.runIf(RECORD)('records the lived years on this code', { timeout: 300_000 }, () => {
    recordPins()
    expect(existsSync(join(ROOT, PINS_FILE))).toBe(true)
  })
})

describe('parity: a person with no Met record lives exactly as before', () => {
  it.skipIf(RECORD)('has a pin file that names its Node, its commit and its 41 rows of five digests', () => {
    const pins = readPins()
    expect(pins.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(pins.head).toMatch(/^[0-9a-f]{7,40}$/)
    expect(pins.rows).toHaveLength(41)
    for (const [id, digests] of pins.rows) {
      expect(typeof id).toBe('string')
      expect(digests, id).toHaveLength(YEARS)
    }
    expect(new Set(pins.rows.map((r) => r[0])).size).toBe(41)
  })

  it.skipIf(RECORD)('gives the recorded digest for every person and every year, and for the rest of the state', { timeout: 120_000 }, () => {
    const pins = readPins()
    const now = new Map(liveRows().map((r) => [r[0], r[1]] as const))
    const moved: string[] = []
    for (const [id, digests] of pins.rows) {
      const mine = now.get(id)
      if (!mine) moved.push(`${id}: no longer asked`)
      else digests.forEach((d, y) => d !== mine[y] && moved.push(`${id}: year ${y + 1} moved`))
    }
    for (const id of now.keys()) if (!pins.rows.some((r) => r[0] === id)) moved.push(`${id}: new row, not recorded`)
    if (moved.length > 0) throw new Error(`${moved.length} digest${moved.length === 1 ? '' : 's'} moved against ${PINS_FILE}\n${moved.slice(0, 12).join('\n')}`)
  })

  it.skipIf(RECORD)('makes no world and writes no Met shard for a life that has none', () => {
    const { g, people } = livedWorld()
    for (let y = 0; y < 3; y++) {
      g.year = 2026 + y
      for (const p of people) yearlyNpcLife(g, p)
    }
    // The books make a world (the ledger shard); the Met shard is not made by any reader or by the yearly step.
    expect(Object.keys(g.world ?? {})).not.toContain('met')
    expect(readMet(g)).toEqual({})
  })

  it.skipIf(RECORD)('keeps personKey equal to the id for every person of the forty', () => {
    for (const p of npcPersons()) expect(personKey(p)).toBe(p.id)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Seeds by personKey
// ---------------------------------------------------------------------------------------------------------------------------

const SID = makeSid({ kind: 'cls', place: 'us', cohort: 2004, ord: 12 })
const OTHER_SID = makeSid({ kind: 'frn', place: 'us', cohort: 1999, ord: 3 })

/** A friend of 31 with a sid, built by hand (no touchMet, no materializePerson: both arrive later in the track). */
function sidPerson(id: string, sid: string | null, over: Partial<Person> = {}): Person {
  return plainPerson(id, {
    relation: 'friend',
    age: 31,
    occupation: 'Clerk',
    traits: ['kind'],
    stats: { happiness: 50, health: 60, smarts: 55, looks: 50 },
    data: sid === null ? { countryId: 'us' } : { countryId: 'us', sid },
    ...over,
  })
}

function metRecord(a: AxisTuple, over: Partial<MetRecord> = {}): MetRecord {
  return { f: 'Ines', l: 'Okafor', g: 0, b: 1995, c: 'us', k: 0, a, y: 2026, s: 2026, w: 0, fl: 0, gr: 0, ob: 0, ...over }
}

/** Writes one record into the shard with S4's writer, keeping what is there. */
function meet(g: GameState, sid: string, a: AxisTuple, over: Partial<MetRecord> = {}): void {
  writeMet(g, { ...readMet(g), [sid]: metRecord(a, over) })
}

/** A fresh game that every pair of lives below starts from. */
const newGame = (seed = 9): GameState => {
  const g = makeTestGame(seed, { age: 45, money: 5_000_000 })
  g.lifeId = 'axes-seeds-g2'
  return g
}

describe('seeds are keyed by personKey', () => {
  it('draws the starting life of one sid the same under two ids', () => {
    const a = newGame()
    const b = newGame()
    const pa = sidPerson('p10', SID)
    const pb = sidPerson('p88', SID)
    a.people.push(pa)
    b.people.push(pb)
    expect(npcLifeText(initializeNpc(a, pa))).toBe(npcLifeText(initializeNpc(b, pb)))
  })

  it('draws the starting life of a person with no sid from the id, as it always did', () => {
    const a = newGame()
    const b = newGame()
    const pa = sidPerson('p10', null)
    const pb = sidPerson('p88', null)
    a.people.push(pa)
    b.people.push(pb)
    // Same people, two ids: the rolls differ (the ambition is a roll), so a person is still keyed by the id.
    expect(initializeNpc(a, pa).ambition).not.toBe(initializeNpc(b, pb).ambition)
  })

  it('makes a sid the key even where the id of another person is that sid', () => {
    const a = newGame()
    const b = newGame()
    const withSid = sidPerson('p10', SID)
    const byId = sidPerson(SID, null)
    a.people.push(withSid)
    b.people.push(byId)
    expect(npcLifeText(initializeNpc(a, withSid))).toBe(npcLifeText(initializeNpc(b, byId)))
  })

  it('runs the yearly decision and the venture roll from the key too', { timeout: 60_000 }, () => {
    const run = (id: string): string[] => {
      const g = newGame(14)
      const p = sidPerson(id, SID, { money: 20_000_000, age: 40, occupation: 'Engineer', traits: ['ambitious'] })
      p.data.talent = MAIN_CHARACTER
      g.people.push(p)
      const life = initializeNpc(g, p)
      life.ambition = 95
      life.skill = 80
      saveNpcLife(p, life)
      const out: string[] = []
      for (let y = 0; y < 14; y++) {
        g.year = 2026 + y
        p.age += 1
        yearlyNpcLife(g, p)
        const l = npcLife(p)!
        out.push(`${g.year}|${p.occupation}|${l.education}|${l.skill.toFixed(4)}|${l.income}|${l.history.length}|${p.data.npcCompany ? 'co' : '-'}|${Math.round(p.money)}`)
      }
      return out
    }
    // Four ids, one sid. A venture is a .4 roll a year, so any two ids can agree by luck; four agreeing is the key at work.
    const runs = ['p10', 'p31', 'p88', 'p4'].map(run)
    for (const r of runs.slice(1)) expect(r).toEqual(runs[0])
  })

  it('has no seeded() call in npc-lives.ts that is keyed by the raw id of the person', () => {
    const src = readFileSync(join(ROOT, NPC_LIFE_FILE), 'utf8')
    const calls = src.match(/seeded\(`[^`]*`\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(calls.filter((c) => c.includes('${p.id}'))).toEqual([])
    for (const tag of ['npc-life', 'npc-decision', 'npc-venture']) {
      const own = calls.filter((c) => c.includes(`${tag}|`))
      expect(own, tag).toHaveLength(1)
      expect(own[0], tag).toContain('${personKey(p)}')
    }
  })
})

/** A life as text, for a comparison that is the whole record. */
const npcLifeText = (l: ReturnType<typeof initializeNpc>): string => JSON.stringify(l)

// ---------------------------------------------------------------------------------------------------------------------------
// The axis of a person who was born from a sid
// ---------------------------------------------------------------------------------------------------------------------------

/** The five axes of the tuple, by name. */
const axesOfTuple = (a: AxisTuple): Axes => ({ ambition: a[0], honesty: a[1], empathy: a[2], risk: a[3], steadiness: a[4] })

/** Through the real codec: the head and the chunks of a save, assembled, migrated and loaded. */
function reload(g: GameState): GameState {
  const e = encodeSave(g)
  const r = assembleSave(JSON.parse(e.head) as Record<string, unknown>, new Map(e.chunks))
  if (r.kind !== 'ready') throw new Error(`assembleSave said ${JSON.stringify(r).slice(0, 300)}`)
  const m = migrateSave(r.game, { versions: r.versions })
  if (m.kind !== 'ready') throw new Error(`migrateSave said ${JSON.stringify(m).slice(0, 300)}`)
  expect(isLoadableGame(m.game)).toBe(true)
  return m.game
}

describe('a person with a Met record starts from the record\'s ambition', () => {
  it('takes the axis, cut to 5..98', () => {
    const expected: [number, number][] = [[0, 5], [3, 5], [5, 5], [40, 40], [50, 50], [77, 77], [98, 98], [100, 98]]
    for (const [axis, want] of expected) {
      const g = newGame()
      const p = sidPerson('p10', SID)
      g.people.push(p)
      meet(g, SID, [axis, 60, 60, 60, 60])
      expect(initializeNpc(g, p).ambition, `axis ${axis}`).toBe(want)
    }
  })

  it('does not add the trait bonus to an axis that already counts the words', () => {
    for (const traits of [['ambitious'], ['lazy'], ['ambitious', 'lazy'], []]) {
      const g = newGame()
      const p = sidPerson('p10', SID, { traits })
      g.people.push(p)
      meet(g, SID, [61, 50, 50, 50, 50])
      expect(initializeNpc(g, p).ambition, traits.join('+')).toBe(61)
    }
  })

  it('reads only its own record: another sid\'s record, a tombstone and a legacy id do not count', () => {
    const rolled = (setup: (g: GameState, p: Person) => void, sid: string | null): number => {
      const g = newGame()
      const p = sidPerson('p10', sid)
      g.people.push(p)
      setup(g, p)
      return initializeNpc(g, p).ambition
    }
    const plain = rolled(() => undefined, SID)
    expect(rolled((g) => meet(g, OTHER_SID, [99, 50, 50, 50, 50]), SID)).toBe(plain)
    expect(rolled((g) => writeMet(g, { [SID]: [2026, 0, 30, 1, 'Ines', 'Okafor', 3990] as unknown as MetRecord }), SID)).toBe(plain)
    // A person with no sid is keyed by the id, and no record is ever kept under a legacy id.
    const legacy = rolled(() => undefined, null)
    expect(rolled((g) => meet(g, OTHER_SID, [99, 50, 50, 50, 50]), null)).toBe(legacy)
    expect(rolled((g) => writeMet(g, { p10: [2026, 0, 30, 1, 'Ines', 'Okafor', 3990] as unknown as MetRecord }), null)).toBe(legacy)
  })

  it('keeps the axis for the life of the person: after an heir switch and after a reload', () => {
    const g = adult(21, 2030, 'us')
    g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    const friend = createPerson(g, { relation: 'friend', age: 33, occupation: 'Clerk', traits: ['lazy'], relationship: 60, money: 0, data: { sid: SID } })
    meet(g, SID, [83, 40, 55, 60, 45])
    const before = initializeNpc(g, friend)
    expect(before.ambition).toBe(83)
    // A record whose person is not in the family yet: it travels in g.world, and decides a life made after the switch.
    meet(g, OTHER_SID, [17, 40, 55, 60, 45], { f: 'Taro', l: 'Mbeki' })

    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    const kept = n.people.find((x) => x.id === friend.id)!
    expect(kept.data.sid).toBe(SID)
    expect(npcLife(kept)!.ambition).toBe(83)
    expect(axesOfPerson(n, kept).ambition).toBe(83)

    const again = reload(n)
    const reloaded = again.people.find((x) => x.id === friend.id)!
    expect(npcLife(reloaded)!.ambition).toBe(83)
    expect(axesOfPerson(again, reloaded).ambition).toBe(83)
    // The record decides a life that is made after the switch and the reload, too.
    const newcomer = sidPerson('p9000', OTHER_SID)
    again.people.push(newcomer)
    expect(initializeNpc(again, newcomer).ambition).toBe(17)
  })

  it('draws nothing from g.rng and leaves the shard as it was', () => {
    const g = newGame()
    const p = sidPerson('p10', SID)
    g.people.push(p)
    meet(g, SID, [70, 50, 50, 50, 50])
    const shard = readMet(g)
    const nextId = g.nextId
    trapRng(g)
    initializeNpc(g, p)
    expect(readMet(g)).toBe(shard)
    expect(g.nextId).toBe(nextId)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// axesOfPerson
// ---------------------------------------------------------------------------------------------------------------------------

describe('axesOfPerson', () => {
  it('gives a legacy person the trait axes with the ambition of their life', () => {
    for (const p of npcPersons()) {
      const g = newGame()
      g.people.push(p)
      const life = initializeNpc(g, p)
      expect(axesOfPerson(g, p), p.id).toEqual({ ...axesFromTraits(p.traits), ambition: life.ambition })
    }
  })

  it('gives a legacy person with no life the trait axes, ambition included (never 50 for want of a life)', () => {
    for (const traits of [[], ['ambitious'], ['lazy', 'shy'], ['honest', 'kind', 'calm']]) {
      const g = newGame()
      const p = sidPerson('p10', null, { traits })
      g.people.push(p)
      expect(npcLife(p)).toBeNull()
      expect(axesOfPerson(g, p)).toEqual(axesFromTraits(traits))
    }
    expect(axesOfPerson(newGame(), sidPerson('p10', null, { traits: ['ambitious'] })).ambition).toBeGreaterThan(50)
  })

  it('gives a sid-born person the axes of their record, whatever their words and their life say', () => {
    const g = newGame()
    const p = sidPerson('p10', SID, { traits: ['lazy', 'sneaky'] })
    g.people.push(p)
    initializeNpc(g, p)
    meet(g, SID, [91, 12, 77, 33, 64])
    expect(axesOfPerson(g, p)).toEqual({ ambition: 91, honesty: 12, empathy: 77, risk: 33, steadiness: 64 })
    expect(axesOfPerson(g, p)).toEqual(axesOfTuple([91, 12, 77, 33, 64]))
    expect(Object.keys(axesOfPerson(g, p))).toEqual([...AXIS_IDS])
  })

  it('falls back to the words for a sid with no record, a tombstone, a sid that is no name and a record under another key', () => {
    const cases: [string, (g: GameState) => void, string | null][] = [
      ['no record', () => undefined, SID],
      ['another sid\'s record', (g) => meet(g, OTHER_SID, [99, 1, 1, 1, 1]), SID],
      ['a tombstone', (g) => writeMet(g, { [SID]: [2026, 0, 30, 1, 'Ines', 'Okafor', 3990] as unknown as MetRecord }), SID],
      ['a sid that is no name', (g) => meet(g, OTHER_SID, [99, 1, 1, 1, 1]), 'not a name'],
    ]
    for (const [name, setup, sid] of cases) {
      const g = newGame()
      const p = sidPerson('p10', null, { traits: ['honest', 'ambitious'] })
      if (sid !== null) p.data.sid = sid
      g.people.push(p)
      setup(g)
      expect(axesOfPerson(g, p), name).toEqual(axesFromTraits(p.traits))
    }
  })

  it('is total: a person with hostile words, a hostile life or hostile data answers with numbers in 0..100', () => {
    const hostile: Partial<Person>[] = [
      { traits: 'ambitious' as unknown as string[] },
      { traits: [null, 7, {}, 'toString', 'constructor', '__proto__', 'ambitious'] as unknown as string[] },
      { traits: Array.from({ length: 5000 }, () => 'ambitious') },
      { data: { life: { v: 1, ambition: 1e9 } } },
      { data: { life: { v: 1, ambition: -1e9 } } },
      { data: { life: { v: 1, ambition: 'high' } } },
      { data: { life: { v: 1, ambition: Number.NaN } } },
      { data: { life: [1, 2, 3] } },
      { data: { sid: 12 } },
      { data: { sid: { toString: 'x' } } },
    ]
    for (const over of hostile) {
      const g = newGame()
      const p = sidPerson('p10', null, over)
      const a = axesOfPerson(g, p)
      for (const id of AXIS_IDS) {
        expect(Number.isFinite(a[id]), JSON.stringify(over).slice(0, 60)).toBe(true)
        expect(a[id]).toBeGreaterThanOrEqual(0)
        expect(a[id]).toBeLessThanOrEqual(100)
      }
    }
    // A life that says 1e9 is read as the top of its range, and one with no number as the middle (npc-state.ts:19).
    expect(axesOfPerson(newGame(), sidPerson('p10', null, { data: { life: { v: 1, ambition: 1e9 } } })).ambition).toBe(100)
    expect(axesOfPerson(newGame(), sidPerson('p10', null, { data: { life: { v: 1 } } })).ambition).toBe(50)
  })

  it('is pure: a frozen game and person, no draw, no world made, no life made', () => {
    const g = newGame()
    const withRecord = sidPerson('p10', SID)
    const without = sidPerson('p11', null, { traits: ['calm'] })
    g.people.push(withRecord, without)
    meet(g, SID, [44, 55, 66, 77, 88])
    trapRng(g)
    deepFreeze(g)
    expect(axesOfPerson(g, withRecord)).toEqual(axesOfTuple([44, 55, 66, 77, 88]))
    expect(axesOfPerson(g, without)).toEqual(axesFromTraits(['calm']))
    expect(npcLife(withRecord)).toBeNull()
    expect(npcLife(without)).toBeNull()
    const bare = deepFreeze(makeTestGame(2))
    expect(axesOfPerson(bare, plainPerson('p1', { traits: ['kind'] }))).toEqual(axesFromTraits(['kind']))
    expect(bare.world).toBeUndefined()
  })

  it('hands back a new object each time, so a caller cannot edit a record through it', () => {
    const g = newGame()
    const p = sidPerson('p10', SID)
    g.people.push(p)
    meet(g, SID, [44, 55, 66, 77, 88])
    const a = axesOfPerson(g, p)
    a.ambition = 0
    a.honesty = 0
    expect(axesOfPerson(g, p)).toEqual(axesOfTuple([44, 55, 66, 77, 88]))
    expect(readMet(g)[SID]).toMatchObject({ a: [44, 55, 66, 77, 88] })
  })

  it('answers 40,000 calls (100 times the cap of the Met shard) inside the range and without growth', () => {
    const g = newGame()
    const people = Array.from({ length: 400 }, (_, i) => sidPerson(`p${i + 1}`, null, { traits: ['ambitious', 'kind'] }))
    g.people.push(...people)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < 40_000; i++) {
      const a = axesOfPerson(g, people[i % people.length]!)
      for (const id of AXIS_IDS) {
        lo = Math.min(lo, a[id])
        hi = Math.max(hi, a[id])
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeLessThanOrEqual(100)
    expect(g.world).toBeUndefined()
    expect(canonicalJson(g.people.map((p) => p.data))).not.toContain('life')
  })
})
