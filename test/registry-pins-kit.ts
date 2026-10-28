// R4-S1 (D.1 a): the registry pins. R4's registry track lifts the rule for a person's key into one function, then adds sids, a Met
// shard and persona axes next to `createPerson`, `rosterAt` and the trait readers. None of those may move an answer unseen, so this
// kit records today's answers on the unmodified tree (test/fixtures/registry-pins.json) and the test compares every later tree to
// them. A pin is never re-recorded to make a change pass: a deliberate move takes RECORD_REASON and a row in moved-tests.md.
//
// Six groups, one row each, one row to a line in the file:
//   createPerson   14 option shapes x years 1925 and 2026 x countries us and ca: the person (canonical JSON), g.rng and g.nextId
//   sidKey         16 `data.sid` shapes, one person with no `data`, and four ids that are no name: the account of personPurse, the
//                  ref of personRef and (for the 16) the rows buildHoldings writes for a family holder
//   roster         rosterAt for 3 family seeds x the 4 kit specs x years 1990, 2026, 2060 x us and jp: id, name, born, gender, country
//   traits         the trait readers (temper, personaMult, driveOf, integrityFor, styleFor) over every pair and single of the 30
//                  words, and none, at entitlement 0 and 70, on plain Person objects (nothing is drawn)
//   npc            initializeNpc for 40 fixed persons: the whole life it stores, and g.rng after
//   ledgerKeys     the `person:` accounts of the ledger after one ageUp of a 2000 family life
//
// Floats are cut to 9 significant digits before they are compared or stored (canonicalJson), as test/golden-kit.ts does. The lives
// are tuples and string constants, never `seed: <digits>` (test/seed-pins.test.ts).
//
// Recording is for this task only, on the clean tree, under Node 22 (the CI version):
//   RECORD_REGISTRY_PINS=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/registry-pins.test.ts
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ageUp } from '../src/game/aging'
import { personPurse } from '../src/game/cash'
import { integrityFor, styleFor } from '../src/game/business/nepo-succession'
import { driveOf } from '../src/game/business/nepo-model'
import { personaMult, temper } from '../src/game/events/will-core'
import { peekLedger } from '../src/game/kernel/ledger'
import { createNewLife } from '../src/game/life'
import { initializeNpc } from '../src/game/npc-lives'
import { createPerson, TRAITS, type PersonOptions } from '../src/game/people'
import { ACTOR_SPEC } from '../src/game/special/actor-world'
import { ASTRO_SPEC } from '../src/game/special/astronaut-world'
import { rosterAt, type RivalSpec } from '../src/game/special/kit/rivals'
import { MODEL_SPEC } from '../src/game/special/model-core'
import { MUSIC_SPEC } from '../src/game/special/music-market'
import type { Asset, GameState, Json, Person } from '../src/game/types'
import { buildHoldings } from '../src/game/world/holdings'
import { personRef } from '../src/game/world/people'
import '../src/game/world/shards'
import { canonicalJson } from './golden-kit'
import { makeTestGame } from './helpers'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

export const PINS_FILE = 'test/fixtures/registry-pins.json'
export const RECORD_COMMAND = 'RECORD_REGISTRY_PINS=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/registry-pins.test.ts'

export const PIN_GROUPS = ['createPerson', 'sidKey', 'roster', 'traits', 'npc', 'ledgerKeys'] as const
export type PinGroup = (typeof PIN_GROUPS)[number]

/** One pinned answer: the id says what was asked, the value is what came back (any JSON). */
export type PinRow = readonly [id: string, value: unknown]

export interface Pins {
  v: 1
  node: string
  head: string
  groups: Record<PinGroup, PinRow[]>
}

// ---------------------------------------------------------------------------------------------------------------------
// A plain person: no draw, every field given

/** A Person with every field written, so a reader that draws nothing can be run on it. */
export function plainPerson(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    firstName: 'Pat',
    lastName: 'Doe',
    gender: 'female',
    age: 40,
    alive: true,
    relation: 'friend',
    relationship: 50,
    stats: { happiness: 50, health: 50, smarts: 50, looks: 50 },
    money: 0,
    occupation: 'Clerk',
    traits: [],
    yearsKnown: 0,
    livesWithPlayer: false,
    notes: [],
    data: {},
    ...over,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// createPerson

export interface CreateShape {
  name: string
  opts: PersonOptions
  /** Sets the state up before the call (the clash shapes name the player after the person the first draw would make). */
  prep?: (g: GameState, opts: PersonOptions) => void
}

/** Names the player after the person `createPerson` would make from the state as it is: the first roll clashes. */
function clashWithFirstRoll(g: GameState, opts: PersonOptions): void {
  const probe = structuredClone(g)
  const first = createPerson(probe, opts)
  g.character.firstName = first.firstName
  g.character.lastName = first.lastName
}

export const CREATE_SHAPES: readonly CreateShape[] = [
  { name: 'random', opts: { relation: 'friend', age: 30 } },
  { name: 'names-given', opts: { relation: 'friend', age: 30, firstName: 'Robin', lastName: 'Vale' } },
  { name: 'first-given', opts: { relation: 'coworker', age: 41, firstName: 'Robin' } },
  { name: 'last-given', opts: { relation: 'classmate', age: 52, lastName: 'Vale' } },
  { name: 'gender-given', opts: { relation: 'friend', age: 19, gender: 'female' } },
  {
    name: 'every-field',
    opts: {
      relation: 'sibling',
      age: 12,
      gender: 'male',
      firstName: 'Robin',
      lastName: 'Vale',
      countryId: 'jp',
      occupation: 'Student',
      relationship: 55,
      money: 1234,
      traits: ['kind', 'calm'],
      stats: { happiness: 70, health: 80, smarts: 60, looks: 50 },
      species: 'x',
      breed: 'y',
      contextId: 'school-1',
      livesWithPlayer: true,
      otherParentId: 'p1',
      biological: true,
      skinTone: 3,
      data: { note: 'given' },
    },
  },
  { name: 'pet', opts: { relation: 'pet', age: 3, species: 'Dog', breed: 'Lab' } },
  { name: 'clash', opts: { relation: 'friend', age: 30 }, prep: clashWithFirstRoll },
  { name: 'clash-last', opts: { relation: 'friend', age: 30, firstName: 'Robin' }, prep: clashWithFirstRoll },
  { name: 'skin-tone', opts: { relation: 'friend', age: 33, skinTone: 2 } },
  { name: 'data-bag', opts: { relation: 'friend', age: 33, data: { sid: 's77', k: 'v', n: 5 } } },
  { name: 'part-stats', opts: { relation: 'friend', age: 33, stats: { smarts: 99 }, traits: ['funny'] } },
  { name: 'newborn', opts: { relation: 'child', age: 0 } },
  { name: 'old-parent', opts: { relation: 'parent', age: 75 } },
]

export const CREATE_YEARS = [1925, 2026] as const
export const CREATE_COUNTRIES = ['us', 'ca'] as const

/** The state of one createPerson row. `ca` is lived in Montreal, so the name draws go through the Quebec check in `poolFor`. */
export function createState(index: number, year: number, country: string): GameState {
  const g = makeTestGame(11 + index, { age: 30, countryId: country, city: country === 'ca' ? 'Montreal' : 'Chicago' })
  g.year = year
  g.lifeId = 'pin-create'
  return g
}

function createPersonRows(): PinRow[] {
  const rows: PinRow[] = []
  CREATE_SHAPES.forEach((shape, i) => {
    for (const year of CREATE_YEARS) {
      for (const country of CREATE_COUNTRIES) {
        const g = createState(i, year, country)
        shape.prep?.(g, shape.opts)
        const person = createPerson(g, shape.opts)
        rows.push([`${shape.name}|${year}|${country}`, { person, rng: g.rng, nextId: g.nextId, people: g.people.length }])
      }
    }
  })
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// The key rule: data.sid

export interface SidShape {
  name: string
  /** Absent means the key `sid` is not in `data` at all. */
  sid?: unknown
}

export const SID_SHAPES: readonly SidShape[] = [
  { name: 's77', sid: 's77' },
  { name: 's9', sid: 's9' },
  { name: 's-42', sid: 's-42' },
  { name: 'empty', sid: '' },
  { name: 'space', sid: 'has space' },
  { name: 'proto', sid: '__proto__' },
  { name: 'constructor', sid: 'constructor' },
  { name: 'colon', sid: 'a:b' },
  { name: 'len52', sid: 'x'.repeat(52) },
  { name: 'len53', sid: 'x'.repeat(53) },
  { name: 'unicode', sid: 'ñandú-7' },
  { name: 'number', sid: 5 },
  { name: 'null', sid: null },
  { name: 'array', sid: [] },
  { name: 'object', sid: {} },
  { name: 'absent' },
]

/** Ids that are no account name at all: the key rule falls to pool:other for them. */
export const HOSTILE_IDS: readonly string[] = ['', 'has space', 'x'.repeat(53), 'ñandú']

/** The person of one sid shape: id p5, the shape in `data.sid` (or not there at all). */
export function sidPerson(shape: SidShape): Person {
  const p = plainPerson('p5')
  if ('sid' in shape) p.data.sid = shape.sid as Json
  return p
}

/** A person with no `data` at all, as a very old save can hold one. */
export function dataLessPerson(): Person {
  const p = plainPerson('p5')
  delete (p as { data?: unknown }).data
  return p
}

function business(): Asset {
  return {
    id: 'c1',
    kind: 'business',
    name: 'business c1',
    emoji: 'x',
    purchasePrice: 1000,
    value: 1000,
    condition: 80,
    purchasedAge: 30,
    upkeep: 0,
    details: { share: 0.5, familyShares: [{ id: 'p5', share: 0.2 }] },
  }
}

/** The rows buildHoldings writes when person p5 holds 0.2 of company c1: the holder's name (or OUTSIDE) is the one answer. */
function holdingsFor(p: Person): unknown {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  g.people.push(p)
  g.assets.push(business())
  return buildHoldings(g)
}

function sidKeyRows(): PinRow[] {
  const rows: PinRow[] = []
  for (const shape of SID_SHAPES) {
    const p = sidPerson(shape)
    rows.push([`sid|${shape.name}`, { purse: personPurse(p).acct, ref: personRef(p), holdings: holdingsFor(p) }])
  }
  const bare = dataLessPerson()
  rows.push(['sid|no-data', { purse: personPurse(bare).acct, ref: personRef(bare) }])
  for (const id of HOSTILE_IDS) {
    const p = plainPerson(id)
    rows.push([`id|${id}`, { purse: personPurse(p).acct, ref: personRef(p) }])
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// rosterAt

export const ROSTER_FAMILIES = ['pin-family-a', 'pin-family-b', 'pin-family-c'] as const
export const ROSTER_SPECS: readonly (readonly [name: string, spec: RivalSpec])[] = [
  ['actor', ACTOR_SPEC],
  ['astronaut', ASTRO_SPEC],
  ['model', MODEL_SPEC],
  ['music', MUSIC_SPEC],
]
export const ROSTER_YEARS = [1990, 2026, 2060] as const
export const ROSTER_COUNTRIES = ['us', 'jp'] as const

function rosterRows(): PinRow[] {
  const rows: PinRow[] = []
  for (const family of ROSTER_FAMILIES) {
    const g = makeTestGame(1)
    g.lifeId = family
    for (const [name, spec] of ROSTER_SPECS) {
      for (const year of ROSTER_YEARS) {
        for (const country of ROSTER_COUNTRIES) {
          const list = rosterAt(g, spec, year, country).map((r) => [r.id, r.name, r.born, r.gender, r.country])
          rows.push([`${family}|${name}|${year}|${country}`, list])
        }
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// The trait readers

export const ENTITLEMENTS = [0, 70] as const

/** None, every single, every pair of the 30 words, in word order. */
export function traitSets(): string[][] {
  const out: string[][] = [[]]
  for (const a of TRAITS) out.push([a])
  for (let i = 0; i < TRAITS.length; i++) for (let j = i + 1; j < TRAITS.length; j++) out.push([TRAITS[i]!, TRAITS[j]!])
  return out
}

function traitRows(): PinRow[] {
  const rows: PinRow[] = []
  for (const set of traitSets()) {
    for (const e of ENTITLEMENTS) {
      const p = plainPerson('p9', { traits: set, data: { entitlement: e } })
      const t = temper(p)
      rows.push([`${set.join('+') || 'none'}|e${e}`, [t.forgiving, t.petulant, personaMult(p), driveOf(p), integrityFor(p), styleFor(p)]])
    }
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// initializeNpc

const NPC_OCCUPATIONS = ['Student', 'Software Developer', 'Nurse', 'Mechanic', 'Lawyer', 'Banker', 'Teacher', 'University Student', 'Retired', 'Farmer']
const NPC_COUNTRIES = ['us', 'jp', 'br', 'ca']
const NPC_AGES = [19, 24, 31, 38, 47, 55, 63, 71]

/** Forty persons that differ in age, work, country, smarts and the two traits initializeNpc reads. */
export function npcPersons(): Person[] {
  const out: Person[] = []
  for (let i = 0; i < 40; i++) {
    const traits = [TRAITS[i % TRAITS.length]!]
    if (i % 5 === 0) traits.push('ambitious')
    if (i % 7 === 0) traits.push('lazy')
    out.push(
      plainPerson(`p${i + 1}`, {
        age: NPC_AGES[i % NPC_AGES.length]!,
        occupation: NPC_OCCUPATIONS[(i * 3) % NPC_OCCUPATIONS.length]!,
        traits,
        stats: { happiness: 50, health: 60, smarts: 20 + ((i * 17) % 80), looks: 50 },
        data: { countryId: NPC_COUNTRIES[i % NPC_COUNTRIES.length]! },
      }),
    )
  }
  return out
}

function npcRows(): PinRow[] {
  const g = makeTestGame(3)
  g.lifeId = 'pin-npc-g2'
  const rows: PinRow[] = []
  for (const p of npcPersons()) {
    const life = initializeNpc(g, p)
    rows.push([p.id, { life, rng: g.rng }])
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// The ledger's person accounts

/** The family life the ledger case plays: [seed, birth year]. A constant, not a search. */
export const FAMILY_LIFE = [11, 2000] as const

/** The life one ageUp later: a 2000 birth in the US, with its parents. */
export function ageFamilyLife(): GameState {
  const g = createNewLife({ seed: FAMILY_LIFE[0], year: FAMILY_LIFE[1], countryId: 'us' })
  ageUp(g)
  return g
}

/** The `person:` accounts of a game's ledger, sorted, and the ids a person account may be called (the player's and every Person's). */
export function personAccounts(g: GameState): { accounts: string[]; ids: string[] } {
  const accounts = Object.keys(peekLedger(g).a)
    .filter((k) => k.startsWith('person:'))
    .sort()
  const ids = [g.character.id, ...g.people.map((p) => p.id)].sort()
  return { accounts, ids }
}

function ledgerKeyRows(): PinRow[] {
  return [[`family-${FAMILY_LIFE[1]}`, personAccounts(ageFamilyLife())]]
}

// ---------------------------------------------------------------------------------------------------------------------
// The file

const MEASURE: Record<PinGroup, () => PinRow[]> = {
  createPerson: createPersonRows,
  sidKey: sidKeyRows,
  roster: rosterRows,
  traits: traitRows,
  npc: npcRows,
  ledgerKeys: ledgerKeyRows,
}

/** Today's answers for one group. Reads the code as it stands; draws only what the code under test draws. */
export function measure(group: PinGroup): PinRow[] {
  return MEASURE[group]()
}

let cached: Pins | null = null

/** The recorded file. Throws, naming the record command, when it is missing or is no registry pin file. */
export function readPins(): Pins {
  if (cached === null) {
    const path = join(ROOT, PINS_FILE)
    if (!existsSync(path)) throw new Error(`${PINS_FILE} is missing: ${RECORD_COMMAND}`)
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Pins
    if (raw.v !== 1) throw new Error(`${PINS_FILE}: unknown version ${String(raw.v)}`)
    cached = raw
  }
  return cached
}

/** The rows of one group as recorded. */
export function pinRows(group: PinGroup): PinRow[] {
  const rows = readPins().groups[group]
  if (!rows) throw new Error(`${PINS_FILE} has no group ${group}: ${RECORD_COMMAND}`)
  return rows
}

/** The value recorded for one row id of a group. */
export function pinned(group: PinGroup, id: string): unknown {
  const row = pinRows(group).find((r) => r[0] === id)
  if (!row) throw new Error(`${PINS_FILE} has no row ${group}/${id}: ${RECORD_COMMAND}`)
  return row[1]
}

/** The first place two texts part, with a few characters around it in each. */
function around(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 24)
  return `...${a.slice(from, i + 40)} -> ...${b.slice(from, i + 40)}`
}

/** What differs between the recorded rows of a group and `rows` (the group as measured now by default): one line for each moved, missing or new row. */
export function pinDiff(group: PinGroup, rows: readonly PinRow[] = measure(group)): string[] {
  const out: string[] = []
  const old = new Map(pinRows(group).map((r) => [r[0], canonicalJson(r[1])] as const))
  const now = new Map(rows.map((r) => [r[0], canonicalJson(r[1])] as const))
  for (const [id, text] of old) {
    if (!now.has(id)) out.push(`${group}/${id}: no longer asked`)
    else if (now.get(id) !== text) out.push(`${group}/${id}: ${around(text, now.get(id)!)}`)
  }
  for (const id of now.keys()) if (!old.has(id)) out.push(`${group}/${id}: new row, not recorded`)
  return out
}

/** The recorder. Refuses without RECORD_REGISTRY_PINS=1; writes the file, one row to a line, and names the node and the commit it ran on. */
export function recordPins(): void {
  if (process.env.RECORD_REGISTRY_PINS !== '1') throw new Error(`recordPins writes the pins only when asked: ${RECORD_COMMAND}`)
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const parts = PIN_GROUPS.map((group) => {
    const lines = measure(group).map(([id, value]) => JSON.stringify([id, JSON.parse(canonicalJson(value))]))
    return `${JSON.stringify(group)}: [\n${lines.join(',\n')}\n]`
  })
  const text = `{\n"v": 1,\n"node": ${JSON.stringify(process.version)},\n"head": ${JSON.stringify(head)},\n"groups": {\n${parts.join(',\n')}\n}\n}\n`
  writeFileSync(join(ROOT, PINS_FILE), text)
  cached = null
}
