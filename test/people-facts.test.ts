// ci: fast
// R4-U3 (People UI and fog track, H.7): the `personFacts` builder. One pure function says what the player may read about one person:
// known rows (your own feeling, the job, how long you have known them), estimate rows (happiness, health, smarts, looks and cash, each a
// word or a range with its confidence chip), and unknown rows (a trait not seen yet, "Private" cash, "N more things you can't tell yet").
// No screen calls it yet: U4 draws the rows, U9 and U10 add their cards. Moves nothing.
//
//   null          Exact, the flag off, a pet and the dead keep the legacy layout (usesProfile of people-fog.ts is the one gate)
//   the rows      the ids start with their section (facts., traits., personality., notes.); connections, rep and memories draw nothing here
//   no number     no row carries a number of the truth: an estimate prints the words of readPerson, a personality stat is a word
//   hostile       NaN stats, 500 traits, a data stat of 1e9, a missing `data` and `traits` that is not an array give rows within the caps
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog; the flag is always named with withFlags.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shortMoney } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { DATA_STATS, PERSON_SECTIONS, personFacts, type FactRow, type PersonFacts } from '../src/game/hubs/people-facts'
import { learn } from '../src/game/knowledge/contract'
import { PEOPLE_CAPS, exposureOf, pplKey, readPerson, traitsShown } from '../src/game/people-fog'
import type { GameState, Person } from '../src/game/types'
import { deepFreeze, inFog, unitAt } from './knowledge-kit'
import { KIT_KEYS, LEVELS, buildKit, type Kit, type KitKey } from './people-ui-kit'

const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the profile exists. */
const profile = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const PET_AND_DEAD: readonly KitKey[] = ['pet', 'deadParent']
const LIVING = KIT_KEYS.filter((k) => !PET_AND_DEAD.includes(k))

const kits = new Map<number, Kit>()
/** The kit at one relationship level (built once; a case that changes a person clones the game first). */
function kitAt(level: number): Kit {
  let k = kits.get(level)
  if (!k) {
    k = buildKit(level)
    kits.set(level, k)
  }
  return k
}

const personIn = (g: GameState, id: string): Person => {
  const p = g.people.find((x) => x.id === id)
  if (!p) throw new Error(`no person ${id}`)
  return p
}

/** A clone of the kit's game with one person changed, and that person in the clone. */
function changed(level: number, key: KitKey, patch: (p: Person) => void): { g: GameState; p: Person } {
  const kit = kitAt(level)
  const g = structuredClone(kit.g)
  const p = personIn(g, kit.ids[key])
  patch(p)
  return { g, p }
}

const rowOf = (f: PersonFacts, id: string): FactRow | undefined => f.rows.find((r) => r.id === id)
const sectionOf = (r: FactRow): string => r.id.split('.')[0]!
const withPrefix = (f: PersonFacts, prefix: string): FactRow[] => f.rows.filter((r) => r.id.startsWith(`${prefix}.`))
const read = (g: GameState, p: Person): PersonFacts | null => profile(() => personFacts(g, p))

/** A person with every field given, so nothing is drawn. */
function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    firstName: 'Dana',
    lastName: 'Reed',
    gender: 'female',
    age: 31,
    alive: true,
    relation: 'friend',
    relationship: 50,
    stats: { happiness: 60, health: 70, smarts: 55, looks: 65 },
    money: 40_000,
    occupation: 'Nurse',
    traits: ['kind', 'proud', 'calm'],
    yearsKnown: 3,
    livesWithPlayer: false,
    notes: [],
    data: { countryId: 'us' },
    ...over,
  }
}

/** What every set of rows must hold, whoever the person is: the caps, the words and the counts. */
function sound(f: PersonFacts | null, label: string): PersonFacts {
  expect(f, label).not.toBeNull()
  const facts = f!
  expect(facts.rows.length, label).toBeLessThanOrEqual(32)
  expect(Number.isFinite(facts.exposure), label).toBe(true)
  expect(facts.exposure, label).toBeGreaterThanOrEqual(0)
  expect(facts.exposure, label).toBeLessThanOrEqual(1)
  expect(facts.unknown, label).toBe(facts.rows.filter((r) => r.state === 'unknown').length)
  expect(new Set(facts.rows.map((r) => r.id)).size, `${label}: ids are unique`).toBe(facts.rows.length)
  expect(withPrefix(facts, 'personality').filter((r) => r.state === 'estimate').length, label).toBeLessThanOrEqual(PEOPLE_CAPS.personality)
  expect(withPrefix(facts, 'traits').length, label).toBeLessThanOrEqual(3)
  expect(withPrefix(facts, 'notes').length, label).toBeLessThanOrEqual(6)
  for (const r of facts.rows) {
    const where = `${label}: ${r.id}`
    expect(PERSON_SECTIONS.includes(sectionOf(r) as (typeof PERSON_SECTIONS)[number]), where).toBe(true)
    expect(['connections', 'rep', 'memories'], where).not.toContain(sectionOf(r))
    for (const field of [r.label, r.text, r.how ?? '']) {
      expect(typeof field, where).toBe('string')
      expect(field, where).not.toMatch(/NaN|undefined|null|Infinity|\[object/)
      expect(field, where).not.toMatch(DASHES)
    }
    expect(r.label.trim(), where).not.toBe('')
    expect(r.text.trim(), where).not.toBe('')
    expect(r.text, where).not.toMatch(/^-+$/)
    expect(r.text.length, where).toBeLessThanOrEqual(90)
    expect((r.how ?? '').length, where).toBeLessThanOrEqual(120)
    expect(r.label.length, where).toBeLessThanOrEqual(40)
    expect(['known', 'estimate', 'unknown'], where).toContain(r.state)
    if (r.state === 'estimate') expect([0, 1, 2, 3], where).toContain(r.conf)
    else {
      expect(r.conf, where).toBeUndefined()
      expect(r.asOf, where).toBeUndefined()
    }
    if (r.bar !== undefined) {
      expect(Number.isFinite(r.bar), where).toBe(true)
      expect(r.bar, where).toBeGreaterThanOrEqual(0)
      expect(r.bar, where).toBeLessThanOrEqual(100)
    }
    if (r.state === 'unknown') expect(r.text, where).toMatch(/^(Not clear yet\.|Private\.|\d+ more things? you can't tell yet\.)$/)
  }
  return facts
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The sections and the copied stats

describe('the sections and the fifteen stats', () => {
  it('lists the seven sections in order, with rep reserved', () => {
    expect([...PERSON_SECTIONS]).toEqual(['facts', 'traits', 'personality', 'connections', 'rep', 'memories', 'notes'])
  })

  it('copies the 15 data stats of PersonSheet.tsx (a game file cannot import src/ui): the same keys, labels and emoji, in the same order', () => {
    const text = readFileSync(new URL('../src/ui/components/PersonSheet.tsx', import.meta.url), 'utf8')
    const block = /const DATA_STATS: \[string, string, string\]\[\] = \[([\s\S]*?)\n\]/.exec(text)
    expect(block, 'PersonSheet.tsx still holds the DATA_STATS list').not.toBeNull()
    const triples = [...block![1]!.matchAll(/\[\s*'([a-z]+)',\s*'([A-Za-z ]+)',\s*'([^']+)'\s*\]/g)].map((m) => [m[1], m[2], m[3]])
    expect(triples).toHaveLength(15)
    expect(DATA_STATS.map((t) => [...t])).toEqual(triples)
  })

  it('draws the rows in section order and draws nothing for connections, rep and memories', () => {
    for (const level of LEVELS) {
      const kit = kitAt(level)
      for (const key of LIVING) {
        const f = sound(read(kit.g, personIn(kit.g, kit.ids[key])), `${key} at ${level}`)
        const order = f.rows.map((r) => PERSON_SECTIONS.indexOf(sectionOf(r) as (typeof PERSON_SECTIONS)[number]))
        expect(order, `${key} at ${level}`).toEqual([...order].sort((a, b) => a - b))
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The fourteen persons of the U1 kit

describe('the fourteen persons of the U1 kit (Realistic, flag on)', () => {
  for (const level of LEVELS) {
    for (const key of LIVING) {
      it(`${key} at ${level}: stable, frozen-safe, and no true number in a fogged row`, () => {
        const kit = kitAt(level)
        const frozen = deepFreeze(structuredClone(kit.g))
        const p = personIn(frozen, kit.ids[key])
        const a = read(frozen, p)
        const b = read(frozen, p)
        expect(b).toEqual(a)
        expect(JSON.stringify(b)).toBe(JSON.stringify(a))
        const f = sound(a, `${key} at ${level}`)

        // A row that estimates a stat is the words of readPerson and nothing else.
        for (const stat of ['happiness', 'health', 'smarts', 'looks'] as const) {
          const e = profile(() => readPerson(frozen, p, stat, p.stats[stat]))!
          const row = rowOf(f, `facts.${stat}`)
          expect(row, stat).toMatchObject({ state: 'estimate', text: e.words, conf: e.conf })
          // The true value never shows as digits. A passive read prints the nearest 5 ('about 70', '55 to 75', '0 to 40'), so every number
          // in the row is a multiple of 5, and a true value that is not one cannot show. One that is can meet an end of the band by
          // chance (sibling happiness 55 reads '5 to 55'): that is no leak, and the equality with readPerson above is what proves it.
          const tokens = `${row!.text} ${row!.how ?? ''}`.match(/\d+/g) ?? []
          for (const token of tokens) expect(Number(token) % 5, `${key} ${stat}: ${row!.text}`).toBe(0)
          if (p.stats[stat] % 5 !== 0) expect(tokens, `${key} ${stat} shows ${p.stats[stat]}`).not.toContain(String(p.stats[stat]))
        }
        const cash = rowOf(f, 'facts.cash')
        if (cash && cash.state === 'estimate') expect(cash.text).not.toContain(shortMoney(p.money))
        for (const r of withPrefix(f, 'personality').filter((x) => x.state === 'estimate')) expect(r.text, r.id).not.toMatch(/\d/)
      })
    }
  }

  it('gives null for a pet and for the dead, at every level', () => {
    for (const level of LEVELS) {
      const kit = kitAt(level)
      for (const key of PET_AND_DEAD) expect(read(kit.g, personIn(kit.g, kit.ids[key])), `${key} at ${level}`).toBeNull()
    }
  })

  it('shows known, estimate and unknown rows across the kit', () => {
    const seen = new Set<string>()
    const kit = kitAt(50)
    for (const key of LIVING) for (const r of read(kit.g, personIn(kit.g, kit.ids[key]))!.rows) seen.add(r.state)
    expect([...seen].sort()).toEqual(['estimate', 'known', 'unknown'])
  })

  it('reads the same twice and leaves the life alone (JSON, g.rng and g.nextId unchanged)', () => {
    const { g, p } = changed(50, 'npcLife', () => undefined)
    const before = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    const next = g.nextId
    const a = read(g, p)
    const b = read(g, p)
    expect(b).toEqual(a)
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(g.rng)).toBe(rng)
    expect(g.nextId).toBe(next)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The known rows

describe('the known rows', () => {
  it('keeps the Relationship bar as your own feeling', () => {
    for (const level of LEVELS) {
      const kit = kitAt(level)
      const f = read(kit.g, personIn(kit.g, kit.ids.friend))!
      expect(rowOf(f, 'facts.relationship')).toMatchObject({ label: 'Relationship', state: 'known', bar: level, text: `${level}%` })
      expect(rowOf(f, 'facts.relationship')!.conf).toBeUndefined()
    }
  })

  it('names the job, how long you have known them, where you met, the other parent, and who lives with you', () => {
    const kit = kitAt(50)
    const of = (key: KitKey): PersonFacts => read(kit.g, personIn(kit.g, kit.ids[key]))!
    expect(rowOf(of('friend'), 'facts.occupation')).toMatchObject({ label: 'Occupation', text: 'Teacher', state: 'known' })
    expect(rowOf(of('friend'), 'facts.known')).toMatchObject({ label: 'Known for', text: '15 years', state: 'known' })
    expect(rowOf(of('friend'), 'facts.met')).toMatchObject({ label: 'Met', text: 'college', state: 'known' })
    expect(rowOf(of('parent'), 'facts.known')).toBeUndefined()
    expect(rowOf(of('sibling'), 'facts.known')).toBeUndefined()
    expect(rowOf(of('child'), 'facts.otherParent')).toMatchObject({ label: 'Mother', text: 'Maya Chen', state: 'known' })
    expect(rowOf(of('spouse'), 'facts.home')).toMatchObject({ label: 'Lives with you', state: 'known' })
    expect(rowOf(of('spouse'), 'facts.expecting')).toMatchObject({ label: 'Expecting', state: 'known' })
    expect(rowOf(of('friend'), 'facts.home')).toBeUndefined()
    expect(rowOf(of('friend'), 'facts.expecting')).toBeUndefined()
  })

  it('says 1 year for a year, leaves a job of None out, and has no cash row for a child under 16', () => {
    const one = changed(50, 'friend', (p) => {
      p.yearsKnown = 1
      p.occupation = 'None'
    })
    const f = read(one.g, one.p)!
    expect(rowOf(f, 'facts.known')!.text).toBe('1 year')
    expect(rowOf(f, 'facts.occupation')).toBeUndefined()
    const kid = changed(50, 'child', () => undefined)
    expect(rowOf(read(kid.g, kid.p)!, 'facts.cash')).toBeUndefined()
    expect(rowOf(read(one.g, one.p)!, 'facts.cash')).toBeDefined()
  })

  it('names an adoption', () => {
    const { g, p } = changed(50, 'child', (x) => {
      x.biological = false
    })
    expect(rowOf(read(g, p)!, 'facts.adopted')).toMatchObject({ label: 'Adopted', state: 'known' })
  })

  it('lists the last six notes, the newest last, and each at most 90 characters', () => {
    const { g, p } = changed(50, 'friend', (x) => {
      x.notes = Array.from({ length: 9 }, (_, i) => `Note ${i + 1}.`)
      x.notes.push('x'.repeat(300))
    })
    const rows = withPrefix(read(g, p)!, 'notes')
    expect(rows).toHaveLength(6)
    expect(rows.slice(0, 5).map((r) => r.text)).toEqual(['Note 5.', 'Note 6.', 'Note 7.', 'Note 8.', 'Note 9.'])
    expect(rows[5]!.text.length).toBeLessThanOrEqual(90)
    expect(rows.every((r) => r.state === 'known')).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Strangers, parents, and what more exposure reveals

describe('exposure decides what is read', () => {
  /** The dataStats person as a stranger: years 0, relationship 30, not living with you. */
  const stranger = (): { g: GameState; p: Person } =>
    changed(30, 'dataStats', (p) => {
      p.yearsKnown = 0
      p.relationship = 30
      p.livesWithPlayer = false
    })

  it('gives a stranger no trait and no cash, and at least three unknown rows', () => {
    const { g, p } = stranger()
    const f = sound(read(g, p), 'stranger')
    expect(withPrefix(f, 'traits').filter((r) => r.state === 'known')).toHaveLength(0)
    expect(rowOf(f, 'traits.more')).toMatchObject({ state: 'unknown', label: 'Traits', text: 'Not clear yet.', how: "You haven't spent enough time with them." })
    expect(rowOf(f, 'facts.cash')).toMatchObject({ state: 'unknown', label: 'Cash on hand', text: 'Private.', how: "You aren't close enough to know." })
    expect(rowOf(f, 'personality.more')).toMatchObject({ state: 'unknown', text: "9 more things you can't tell yet.", how: 'Time together shows more.' })
    expect(f.unknown).toBeGreaterThanOrEqual(3)
    expect(f.exposure).toBe(exposureOf(p))
    expect(f.exposure).toBeLessThan(0.3)
  })

  it('gives a parent living with you both traits and the cash', () => {
    const { g, p } = changed(90, 'parent', (x) => {
      x.livesWithPlayer = true
    })
    const f = sound(read(g, p), 'parent')
    expect(withPrefix(f, 'traits').map((r) => [r.state, r.text])).toEqual([
      ['known', 'kind'],
      ['known', 'proud'],
    ])
    expect(rowOf(f, 'traits.more')).toBeUndefined()
    expect(rowOf(f, 'facts.cash')!.state).toBe('estimate')
    expect(f.exposure).toBe(1)
  })

  it('names the first trait at exposure .30 and the second at .60, and one more row says the rest is unclear', () => {
    const words = (over: Partial<Person>): string[] =>
      withPrefix(read(structuredClone(kitAt(50).g), person({ traits: ['kind', 'proud', 'calm'], ...over }))!, 'traits')
        .filter((r) => r.state === 'known')
        .map((r) => r.text)
    expect(words({ yearsKnown: 0, relationship: 0 })).toEqual([])
    expect(words({ yearsKnown: 4, relationship: 40 })).toEqual(['kind'])
    expect(words({ yearsKnown: 8, relationship: 80 })).toEqual(['kind', 'proud'])
    const hidden = (over: Partial<Person>): FactRow | undefined => rowOf(read(structuredClone(kitAt(50).g), person(over))!, 'traits.more')
    expect(hidden({ yearsKnown: 4, relationship: 40 })).toMatchObject({ label: 'More traits', state: 'unknown' })
    expect(hidden({ traits: ['kind'], yearsKnown: 8, relationship: 80 })).toBeUndefined()
    expect(hidden({ traits: [], yearsKnown: 0, relationship: 0 })).toBeUndefined()
  })

  it('never reveals fewer traits with more years, more relationship or living together', () => {
    const g = kitAt(50).g
    const count = (over: Partial<Person>): number => withPrefix(read(g, person({ traits: ['kind', 'proud', 'calm'], ...over }))!, 'traits').filter((r) => r.state === 'known').length
    for (const lives of [false, true]) {
      for (let rel = 0; rel <= 100; rel += 10) {
        let last = -1
        for (let years = 0; years <= 20; years += 1) {
          const n = count({ yearsKnown: years, relationship: rel, livesWithPlayer: lives })
          expect(n, `years ${years} rel ${rel} lives ${lives}`).toBeGreaterThanOrEqual(last)
          last = n
        }
      }
      for (let years = 0; years <= 20; years += 5) {
        let last = -1
        for (let rel = 0; rel <= 100; rel += 5) {
          const n = count({ yearsKnown: years, relationship: rel, livesWithPlayer: lives })
          expect(n, `rel ${rel} years ${years} lives ${lives}`).toBeGreaterThanOrEqual(last)
          last = n
        }
      }
    }
    expect(count({ yearsKnown: 3, relationship: 40, livesWithPlayer: true })).toBeGreaterThanOrEqual(count({ yearsKnown: 3, relationship: 40, livesWithPlayer: false }))
    // The count is the one traitsShown gives.
    const p = person({ yearsKnown: 5, relationship: 55 })
    expect(count({ yearsKnown: 5, relationship: 55 })).toBe(traitsShown(p).shown.length)
  })

  it('shows cash as an estimate from relationship 35 or when you live together, and as Private below', () => {
    const g = kitAt(50).g
    const cash = (over: Partial<Person>): FactRow => rowOf(read(g, person({ id: 'q1', ...over }))!, 'facts.cash')!
    expect(cash({ relationship: 34, livesWithPlayer: false }).state).toBe('unknown')
    expect(cash({ relationship: 35, livesWithPlayer: false }).state).toBe('estimate')
    expect(cash({ relationship: 10, livesWithPlayer: true }).state).toBe('estimate')
    expect(cash({ relationship: 10, livesWithPlayer: false, age: 15 })).toBeUndefined()
  })

  it('opens the cash of a stranger once a read of it is stored, and the read is sharper', () => {
    const { g, p } = stranger()
    expect(rowOf(read(g, p)!, 'facts.cash')!.state).toBe('unknown')
    const key = pplKey(p, 'cash')!
    expect(profile(() => learn(g, key, { mid: p.money, sd: 0.05, src: 'investigator' }))).not.toBeNull()
    const row = rowOf(read(g, p)!, 'facts.cash')!
    expect(row.state).toBe('estimate')
    expect(row.conf).toBe(3)
    expect(read(g, p)!.unknown).toBe(2)
  })

  it('carries the age of an old stored read as asOf', () => {
    const { g, p } = stranger()
    const key = pplKey(p, 'cash')!
    profile(() => learn(g, key, { mid: p.money, sd: 0.05, src: 'investigator' }))
    g.year += 2
    const row = rowOf(read(g, p)!, 'facts.cash')!
    expect(row.state).toBe('estimate')
    expect(row.asOf).toBe(g.year - 2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The personality

describe('the personality words', () => {
  it('shows at most six of the 15 stats as words, in the order of fnv1a(personKey + stat), and counts the rest', () => {
    const { g, p } = changed(90, 'dataStats', () => undefined)
    const f = sound(read(g, p), 'dataStats')
    const rows = withPrefix(f, 'personality')
    expect(rows.filter((r) => r.state === 'estimate')).toHaveLength(6)
    expect(rows).toHaveLength(7)
    expect(rows[6]).toMatchObject({ id: 'personality.more', state: 'unknown', text: "9 more things you can't tell yet." })
    for (const r of rows.slice(0, 6)) {
      expect(r.text, r.id).toMatch(/^(very low|low|middling|high|very high)$/)
      expect([0, 1], r.id).toContain(r.conf)
      const stat = DATA_STATS.find(([key]) => `personality.${key}` === r.id)
      expect(stat, r.id).toBeDefined()
      expect(r.label).toBe(stat![1])
      expect(r.emoji).toBe(stat![2])
    }
    // The same six for the same person, whatever the relationship (the order is the person's, not the exposure's).
    const other = changed(10, 'dataStats', () => undefined)
    expect(withPrefix(read(other.g, other.p)!, 'personality').map((r) => r.id)).toEqual(rows.map((r) => r.id))
  })

  it('draws a row only for a number from 0 to 100, and has none for a person with no such stat', () => {
    const none = changed(50, 'parent', () => undefined)
    expect(withPrefix(read(none.g, none.p)!, 'personality')).toHaveLength(0)
    const one = changed(50, 'child', () => undefined)
    expect(withPrefix(read(one.g, one.p)!, 'personality').map((r) => [r.id, r.state])).toEqual([['personality.entitlement', 'estimate']])
    const bad = changed(50, 'dataStats', (p) => {
      p.data.kindness = 101
      p.data.loyalty = -1
      p.data.respect = 'high'
      p.data.toughness = NaN
    })
    const f = read(bad.g, bad.p)!
    for (const k of ['kindness', 'loyalty', 'respect', 'toughness']) expect(rowOf(f, `personality.${k}`), k).toBeUndefined()
    expect(rowOf(f, 'personality.more')!.text).toBe("5 more things you can't tell yet.")
  })

  it('reads a stat as a hashed word that is the same twice and carries no digit', () => {
    const { g, p } = changed(90, 'dataStats', () => undefined)
    const a = withPrefix(read(g, p)!, 'personality')
    const b = withPrefix(read(g, p)!, 'personality')
    expect(b).toEqual(a)
    for (const r of a.filter((x) => x.state === 'estimate')) expect(r.text).not.toMatch(/\d/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// null: the legacy layout

describe('null: the legacy layout keeps these', () => {
  it('is null in Exact, whatever the flag', () => {
    const kit = kitAt(50)
    for (const key of KIT_KEYS) {
      const p = personIn(kit.g, kit.ids[key])
      expect(withFlags(ON, () => personFacts(kit.g, p)), `${key} flag on`).toBeNull()
      expect(withFlags(OFF, () => personFacts(kit.g, p)), `${key} flag off`).toBeNull()
    }
  })

  it('is null in Realistic with the flag off', () => {
    const kit = kitAt(50)
    for (const key of KIT_KEYS) expect(withFlags(OFF, () => inFog(() => personFacts(kit.g, personIn(kit.g, kit.ids[key])))), key).toBeNull()
  })

  it('is null for a pet and for the dead, and non-null for everyone else, in Realistic with the flag on', () => {
    const kit = kitAt(50)
    for (const key of KIT_KEYS) {
      const f = read(kit.g, personIn(kit.g, kit.ids[key]))
      if (PET_AND_DEAD.includes(key)) expect(f, key).toBeNull()
      else expect(f, key).not.toBeNull()
    }
    expect(read(kitAt(50).g, person({ relation: 'pet', species: 'Dog' }))).toBeNull()
    expect(read(kitAt(50).g, person({ alive: false }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Hostile persons

describe('a hostile person gives rows within the caps', () => {
  const MANY = Array.from({ length: 500 }, (_, i) => `trait${i}`)
  const HOSTILE: ReadonlyArray<readonly [string, (p: Person) => void]> = [
    ['NaN stats', (p) => void (p.stats = { happiness: NaN, health: NaN, smarts: NaN, looks: NaN })],
    ['stats beyond the scale', (p) => void (p.stats = { happiness: 1e9, health: -1e9, smarts: Infinity, looks: -Infinity })],
    ['no stats', (p) => void delete (p as Partial<Person>).stats],
    ['500 traits', (p) => void (p.traits = MANY)],
    ['traits that is a string', (p) => void (p.traits = 'kind' as unknown as string[])],
    ['traits that is null', (p) => void (p.traits = null as unknown as string[])],
    ['traits of numbers and objects', (p) => void (p.traits = [1, {}, null, '', '  ', 'ok'] as unknown as string[])],
    ['a data stat of 1e9', (p) => void (p.data = { kindness: 1e9, loyalty: 1e300, respect: -1e9 })],
    ['a missing data', (p) => void delete (p as Partial<Person>).data],
    ['data that is null', (p) => void (p.data = null as unknown as Person['data'])],
    ['notes that is not an array', (p) => void (p.notes = 'a note' as unknown as string[])],
    ['notes of numbers', (p) => void (p.notes = [1, null, {}, 'ok'] as unknown as string[])],
    ['NaN money', (p) => void (p.money = NaN)],
    ['infinite money', (p) => void (p.money = Infinity)],
    ['negative money', (p) => void (p.money = -5)],
    ['money of 1e300', (p) => void (p.money = 1e300)],
    ['NaN relationship and years', (p) => void ((p.relationship = NaN), (p.yearsKnown = NaN))],
    ['relationship beyond the scale', (p) => void ((p.relationship = 1e9), (p.yearsKnown = 1e9))],
    ['NaN age', (p) => void (p.age = NaN)],
    ['an id with a space', (p) => void (p.id = 'p 1')],
    ['a 60 character id', (p) => void (p.id = 'p'.repeat(60))],
    ['a sid with a colon', (p) => void (p.data = { sid: 'a:b', kindness: 50 })],
    ['names that are not text', (p) => void ((p.firstName = undefined as unknown as string), (p.lastName = 7 as unknown as string))],
    ['an occupation that is not text', (p) => void (p.occupation = {} as unknown as string)],
    ['a 5,000 character occupation, name and note', (p) => void ((p.occupation = 'job '.repeat(1250)), (p.firstName = 'Name'.repeat(1250)), (p.notes = ['note '.repeat(1000)]))],
    ['an other parent that does not exist', (p) => void ((p.relation = 'child'), (p.otherParentId = 'nobody'))],
  ]

  for (const [label, hurt] of HOSTILE) {
    it(label, () => {
      const g = deepFreeze(structuredClone(kitAt(90).g))
      const p = person({ id: 'h1', data: { kindness: 50, loyalty: 60, respect: 70, toughness: 20, metAt: 'a very long place' } })
      hurt(p)
      const a = read(g, p)
      const f = sound(a, label)
      expect(read(g, p)).toEqual(a)
      expect(withPrefix(f, 'traits').length).toBeLessThanOrEqual(3)
      expect(withPrefix(f, 'personality').filter((r) => r.state === 'estimate').length).toBeLessThanOrEqual(PEOPLE_CAPS.personality)
    })
  }

  it('reads a person whose key the contract refuses as unknown, never as exact', () => {
    const g = kitAt(90).g
    for (const id of ['p 1', 'p'.repeat(60)]) {
      const f = sound(read(g, person({ id, relationship: 90, yearsKnown: 20 })), id)
      for (const stat of ['happiness', 'health', 'smarts', 'looks', 'cash']) expect(rowOf(f, `facts.${stat}`), `${id} ${stat}`).toMatchObject({ state: 'unknown', text: 'Not clear yet.' })
      expect(f.unknown).toBeGreaterThanOrEqual(5)
    }
  })

  it('holds the text caps for 1,000 generated persons', () => {
    const g = deepFreeze(structuredClone(kitAt(50).g))
    const em = String.fromCharCode(0x2014)
    const en = String.fromCharCode(0x2013)
    const chunk = `Some words with a dash ${em} and another ${en} and digits 1234 \n\t `
    const text = (n: number, tag: string, max: number): string => chunk.repeat(Math.floor(unitAt(tag, n) * max))
    const num = (n: number, tag: string): number => {
      const pool = [NaN, Infinity, -Infinity, -5, 0, 1, 50, 100, 101, 1e9, 1e300, -1e300]
      const u = unitAt(tag, n)
      return u < 0.4 ? pool[Math.floor(unitAt(`${tag}p`, n) * pool.length)]! : u * 130 - 10
    }
    const relations = ['parent', 'sibling', 'child', 'spouse', 'partner', 'friend', 'coworker', 'boss', 'ex', 'enemy', 'bestFriend', 'stepparent'] as const
    let estimates = 0
    for (let n = 0; n < 1000; n++) {
      const data: Record<string, number | string> = {}
      for (const [key] of DATA_STATS) if (unitAt('d', n * 31 + key.length) < 0.7) data[key] = num(n, `data${key}`)
      if (n % 3 === 0) data.metAt = text(n, 'met', 6)
      const p = person({
        id: n % 50 === 0 ? `bad id ${n}` : `g${n}`,
        firstName: text(n, 'fn', 4),
        lastName: n % 4 === 0 ? '' : text(n, 'ln', 4),
        relation: relations[n % relations.length]!,
        age: n % 7 === 0 ? 10 : 20 + (n % 60),
        gender: n % 2 === 0 ? 'male' : 'female',
        relationship: num(n, 'rel'),
        yearsKnown: num(n, 'yrs'),
        livesWithPlayer: n % 5 === 0,
        pregnant: n % 11 === 0,
        biological: n % 13 === 0 ? false : undefined,
        money: num(n, 'money'),
        occupation: text(n, 'job', 5),
        stats: { happiness: num(n, 'h'), health: num(n, 'he'), smarts: num(n, 'sm'), looks: num(n, 'lo') },
        traits: Array.from({ length: Math.floor(unitAt('tr', n) * 9) }, (_, i) => text(n * 13 + i, 'trait', 3)),
        notes: Array.from({ length: Math.floor(unitAt('nt', n) * 12) }, (_, i) => text(n * 17 + i, 'note', 8)),
        data: data as Person['data'],
      })
      const f = sound(read(g, p), `person ${n}`)
      estimates += f.rows.filter((r) => r.state === 'estimate').length
    }
    expect(estimates).toBeGreaterThan(1000)
  })

  it('stays inside the caps at 100 times: 1,500 data stats, 1,500 notes, money of 1e300', () => {
    const g = deepFreeze(structuredClone(kitAt(90).g))
    const data: Record<string, number> = {}
    for (let i = 0; i < 1500; i++) data[`extra${i}`] = i % 101
    for (const [key] of DATA_STATS) data[key] = 50
    const p = person({ data, notes: Array.from({ length: 1500 }, (_, i) => `Note ${i}.`), money: 1e300, traits: Array.from({ length: 1500 }, (_, i) => `t${i}`), relationship: 90, yearsKnown: 30 })
    const f = sound(read(g, p), 'x100')
    expect(withPrefix(f, 'personality').filter((r) => r.state === 'estimate')).toHaveLength(6)
    expect(withPrefix(f, 'personality').filter((r) => r.state === 'unknown')).toHaveLength(1)
    expect(rowOf(f, 'personality.more')!.text).toBe("9 more things you can't tell yet.")
    expect(withPrefix(f, 'notes')).toHaveLength(6)
    expect(withPrefix(f, 'traits').filter((r) => r.state === 'known')).toHaveLength(2)
    expect(rowOf(f, 'facts.cash')!.state).toBe('estimate')
    expect(rowOf(f, 'facts.cash')!.text.length).toBeLessThanOrEqual(90)
  })
})
