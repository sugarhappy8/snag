// R4-U8 (People UI and fog track): the People cockpit tiles and the person badge. Behind `peopleProfile` the Relationships tab opens on four
// tiles built from facts the player already has (Closest, Drifting, Owed to you, Estranged), and a person row can read Estranged or Owes
// you besides Drifting (`personBadge`). The tiles and badges do not read the mode, only the flag, so the Exact oracle of R4-U1 builds its
// cockpit rows inside `withFlags({ peopleProfile: false }, ...)` and stays byte for byte what v5.2.0 printed.
//
// What this file proves: flag off is the U1 model and badges; flag on gives known facts only (a person's hidden numbers can be scrambled
// and the model does not move), at most four tiles in a fixed order, ties broken by id, a tile with nothing to say absent, short text,
// `open` ids that resolve to a living person, Needs You rows for Estranged and Owes you, a ceiling at 100 times the input, hostile
// persons that never throw, and frozen, pure reads.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { resetFlags, withFlags } from '../src/game/flags'
import { cockpitOf, type CockpitModel, type CockpitTile } from '../src/game/hubs/cockpit'
import { BADGE_MAX_CHARS, needsYou } from '../src/game/hubs/needs'
import { DRIFT_BELOW, DRIFT_RELATIONS, peopleMenu, personBadge, personGroup, personGroupId, personIdOf } from '../src/game/hubs/people'
import { createPerson } from '../src/game/people'
import type { GameState, Person, RelationKind } from '../src/game/types'
import { CockpitBody } from '../src/ui/nav/CockpitBody'
import { deepFreeze } from './knowledge-kit'
import { frozen, navState, type NavStateName } from './nav-kit'
import { FIXTURE_FILE, KIT_KEYS, LEVELS, LIVING_KEYS, adultGame, buildGroup, buildKit, diffRows, estrange, groupOf, lend, type Recorded } from './people-ui-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const BAD = /NaN|undefined|Infinity|\[object/
const TONES = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'good', 'bad', 'muted'])
const IDS = ['closest', 'drifting', 'owed', 'estranged']
const TIMEOUT = 120_000

afterEach(() => {
  resetFlags()
})

const on = <T>(fn: () => T): T => withFlags({ peopleProfile: true }, fn)
const off = <T>(fn: () => T): T => withFlags({ peopleProfile: false }, fn)

function relModel(g: GameState): CockpitModel {
  return cockpitOf('relationships', g)
}
const tileOf = (m: CockpitModel, id: string): CockpitTile | undefined => m.tiles.find((t) => t.id === id)
const person = (g: GameState, id: string): Person => {
  const p = g.people.find((x) => x.id === id)
  if (!p) throw new Error(`no person ${id}`)
  return p
}

/** A person with every field given (no hidden number is the default of anything). */
function add(g: GameState, relation: RelationKind, relationship: number, name: string, extra: Partial<Person> = {}): Person {
  const p = createPerson(g, {
    relation,
    relationship,
    age: 41,
    gender: 'female',
    firstName: name,
    lastName: 'Test',
    occupation: 'Nurse',
    money: 5_000,
    traits: ['kind'],
    stats: { happiness: 61, health: 62, smarts: 63, looks: 64 },
  })
  Object.assign(p, extra)
  return p
}

/** The player lent them money: the tie the "owes you" row reads. */
function owe(g: GameState, p: Person, amount: number): void {
  lend(g, p, amount)
}

/** `n` living persons made by copying one template, so 5,000 of them cost almost nothing. `shape` gets the index and the player's id. */
function crowd(n: number, shape: (i: number, by: string) => Partial<Person> = () => ({})): GameState {
  const g = adultGame()
  const template = add(g, 'friend', 50, 'Template')
  g.people = []
  for (let i = 0; i < n; i++) g.people.push({ ...structuredClone(template), id: `c${i}`, firstName: `Crowd${i}`, ...shape(i, g.character.id) })
  return g
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Flag off is the U1 model and badges

describe('1. flag off is the recorded Exact model', () => {
  const recorded = (): Recorded => {
    if (!existsSync(join(ROOT, FIXTURE_FILE))) throw new Error(`${FIXTURE_FILE} is missing`)
    return JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as Recorded
  }
  const cockpitRows = (): Recorded['rows'] => recorded().rows.filter(([k]) => groupOf(k) === 'cockpit')

  it('the cockpit, badge and Needs You rows of the oracle are what the code builds with the flag off', { timeout: TIMEOUT }, () => {
    const want = cockpitRows()
    expect(want).toHaveLength(12)
    expect(diffRows(want, off(() => buildGroup('cockpit')))).toEqual([])
  })

  it('with the flag on those rows move, so the oracle needs its wrapper: the tiles and the two new words reach it', { timeout: TIMEOUT }, () => {
    const moved = diffRows(cockpitRows(), on(() => buildGroup('cockpit')))
    const keys = moved.join('\n')
    expect(keys).toContain('cockpit/household')
    expect(keys).toContain('cockpit/drifting')
    expect(keys).toContain('badge/drifting')
    expect(keys).toContain('needs/drifting')
    expect(keys).not.toContain('cockpit/alone')
  })

  it('the model with the flag off has no tile, whoever is in the household, and the same summary the flag on prints', () => {
    for (const level of LEVELS) {
      const { g } = buildKit(level)
      const a = off(() => relModel(g))
      expect(a.tiles, `level ${level}`).toEqual([])
      expect(a.chart).toBeNull()
      expect(a.cards).toEqual([])
      expect(on(() => relModel(g)).summary).toBe(a.summary)
    }
  })

  it('a person badge with the flag off is the Drifting rule alone, even for a person who is cut off or in debt', () => {
    const { g, ids } = buildKit(20)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 9_000)
    off(() => {
      expect(personBadge(g, person(g, ids.child))).toBe('Drifting')
      expect(personBadge(g, person(g, ids.sibling))).toBeNull()
      expect(personBadge(g, person(g, ids.parent))).toBe('Drifting')
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. personBadge

describe('2. personBadge', () => {
  it('reads Estranged, then Owes you, then Drifting', () => {
    const g = adultGame()
    const p = add(g, 'child', 10, 'Mia')
    on(() => {
      expect(personBadge(g, p)).toBe('Drifting')
      owe(g, p, 400)
      expect(personBadge(g, p)).toBe('Owes you')
      estrange(g, p)
      expect(personBadge(g, p)).toBe('Estranged')
    })
  })

  it('shows Estranged and Owes you on a close person too, and nothing on a close person with no tie', () => {
    const g = adultGame()
    const a = add(g, 'friend', 90, 'Ana')
    const b = add(g, 'friend', 90, 'Bea')
    const c = add(g, 'friend', 90, 'Cleo')
    estrange(g, a)
    owe(g, b, 1)
    on(() => {
      expect(personBadge(g, a)).toBe('Estranged')
      expect(personBadge(g, b)).toBe('Owes you')
      expect(personBadge(g, c)).toBeNull()
    })
  })

  it('keeps the Drifting rule as it was: six relations, under 25, alive', () => {
    expect([...DRIFT_RELATIONS].sort()).toEqual(['bestFriend', 'child', 'fiance', 'parent', 'partner', 'spouse'])
    expect(DRIFT_BELOW).toBe(25)
    const g = adultGame()
    on(() => {
      for (const rel of DRIFT_RELATIONS) {
        const p = add(g, rel, 24, `D${rel}`)
        expect(personBadge(g, p), rel).toBe('Drifting')
        p.relationship = 25
        expect(personBadge(g, p), rel).toBeNull()
      }
      const friend = add(g, 'friend', 3, 'Low')
      expect(personBadge(g, friend)).toBeNull()
    })
  })

  it('gives nothing for a missing person, the dead and a pet, whatever the ties say', () => {
    const g = adultGame()
    const dead = add(g, 'parent', 5, 'Gone')
    estrange(g, dead)
    owe(g, dead, 500)
    dead.alive = false
    const pet = add(g, 'pet', 5, 'Rex')
    pet.data.w = { by: g.character.id, owes: 300 }
    pet.data.wl = { by: g.character.id, estr: true }
    on(() => {
      expect(personBadge(g, undefined)).toBeNull()
      expect(personBadge(g, dead)).toBeNull()
      expect(personBadge(g, pet)).toBeNull()
    })
  })

  it('every word fits a badge (12 characters), and the group badge is the same word', () => {
    const g = adultGame()
    const p = add(g, 'child', 10, 'Mia')
    on(() => {
      for (const setup of [() => undefined, () => owe(g, p, 100), () => estrange(g, p)]) {
        setup()
        const word = personBadge(g, p)
        expect(word).not.toBeNull()
        expect(word!.length).toBeLessThanOrEqual(BADGE_MAX_CHARS)
        expect(personGroup(p).badge?.(g)).toBe(word)
      }
    })
  })

  it('for the persons of the U1 kit the flag-on badge equals the flag-off one, except for an estranged or owing person', () => {
    for (const level of LEVELS) {
      const { g, ids } = buildKit(level)
      estrange(g, person(g, ids.child))
      owe(g, person(g, ids.sibling), 12_000)
      for (const key of KIT_KEYS) {
        const p = person(g, ids[key])
        const before = off(() => personBadge(g, p))
        const after = on(() => personBadge(g, p))
        if (key === 'child') expect(after, `${key} ${level}`).toBe('Estranged')
        else if (key === 'sibling') expect(after, `${key} ${level}`).toBe('Owes you')
        else expect(after, `${key} ${level}`).toBe(before)
      }
    }
    for (const level of LEVELS) {
      const { g, ids } = buildKit(level)
      for (const key of KIT_KEYS) expect(on(() => personBadge(g, person(g, ids[key]))), `${key} ${level}`).toBe(off(() => personBadge(g, person(g, ids[key]))))
    }
  })

  it('for the persons of the nav-cockpit states the flag-on badge equals the flag-off one', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as NavStateName[]) {
      const g = frozen(name)
      expect(g.people.length, name).toBeGreaterThan(0)
      for (const p of g.people) expect(on(() => personBadge(g, p)), `${name} ${p.id}`).toBe(off(() => personBadge(g, p)))
    }
  })

  it('Needs You lists Estranged and Owes you rows with the flag on, in data order, and only Drifting ones with it off', () => {
    const { g, ids } = buildKit(90)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 12_000)
    person(g, ids.parent).relationship = 10
    const rows = () => needsYou(peopleMenu.children(g), g).map((r) => `${r.node.id}=${r.badge}`)
    expect(on(rows)).toEqual([`${personGroupId(ids.parent)}=Drifting`, `${personGroupId(ids.sibling)}=Owes you`, `${personGroupId(ids.child)}=Estranged`])
    expect(off(rows)).toEqual([`${personGroupId(ids.parent)}=Drifting`])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The tiles

describe('3. the tiles', () => {
  it('Relationships has four tiles in a fixed order: Closest, Drifting, Owed to you, Estranged', () => {
    const { g, ids } = buildKit(20)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 12_000)
    person(g, ids.friend).relationship = 88
    const m = on(() => relModel(g))
    expect(m.tiles.map((t) => t.id)).toEqual(IDS)
    expect(m.tiles.map((t) => t.label)).toEqual(['Closest', 'Drifting', 'Owed to you', 'Estranged'])
    const closest = tileOf(m, 'closest')!
    expect(closest.value).toBe('Theo Walsh')
    expect(closest.note).toBe('Friend')
    expect(closest.meter).toBe(88)
    expect(closest.open).toEqual([personGroupId(ids.friend)])
  })

  it('Drifting counts the persons the badge rule flags and opens the lowest', () => {
    const { g, ids } = buildKit(60)
    person(g, ids.parent).relationship = 20
    person(g, ids.spouse).relationship = 4
    person(g, ids.partner).relationship = 24
    person(g, ids.friend).relationship = 1
    const t = tileOf(on(() => relModel(g)), 'drifting')!
    expect(t.value).toBe('3 people')
    expect(t.note).toContain('Maya Chen')
    expect(t.open).toEqual([personGroupId(ids.spouse)])
    person(g, ids.parent).relationship = 60
    person(g, ids.partner).relationship = 60
    const one = tileOf(on(() => relModel(g)), 'drifting')!
    expect(one.value).toBe('1 person')
    expect(one.open).toEqual([personGroupId(ids.spouse)])
  })

  it('Owed to you adds what the living owe, in the money of the life; Estranged counts those who cut you off', () => {
    const { g, ids } = buildKit(60)
    owe(g, person(g, ids.sibling), 12_000)
    owe(g, person(g, ids.friend), 3_000)
    owe(g, person(g, ids.deadParent), 99_000)
    estrange(g, person(g, ids.child))
    estrange(g, person(g, ids.ex))
    estrange(g, person(g, ids.deadParent))
    const m = on(() => relModel(g))
    const owed = tileOf(m, 'owed')!
    expect(owed.value).toBe('$15K')
    expect(owed.note).toBe('2 people')
    expect(owed.open).toBeUndefined()
    const cut = tileOf(m, 'estranged')!
    expect(cut.value).toBe('2 people')
    expect(cut.open).toBeUndefined()
  })

  it('a tile with nothing to say is absent: no debt, no estrangement, nobody drifting leaves Closest alone', () => {
    const { g } = buildKit(70)
    const m = on(() => relModel(g))
    expect(m.tiles.map((t) => t.id)).toEqual(['closest'])
  })

  it('nobody alive gives no tile and the summary that was there', () => {
    const g = adultGame()
    expect(on(() => relModel(g)).tiles).toEqual([])
    expect(on(() => relModel(g)).summary).toBe("You're on your own.")
    const dead = add(g, 'parent', 80, 'Gone')
    dead.alive = false
    add(g, 'pet', 90, 'Rex')
    const m = on(() => relModel(g))
    expect(m.tiles).toEqual([])
    expect(m.summary).toBe("You're on your own.")
  })

  it('a pet is never the closest, and a dead person is never counted', () => {
    const g = adultGame()
    add(g, 'pet', 100, 'Rex')
    const gone = add(g, 'child', 99, 'Gone')
    gone.alive = false
    owe(g, gone, 1_000)
    const friend = add(g, 'friend', 30, 'Fay')
    const m = on(() => relModel(g))
    expect(m.tiles.map((t) => t.id)).toEqual(['closest'])
    expect(tileOf(m, 'closest')!.open).toEqual([personGroupId(friend.id)])
  })

  it('ties go to the lower id, whatever the order of the list', () => {
    const g = adultGame()
    const a = add(g, 'friend', 70, 'Ann')
    const b = add(g, 'friend', 70, 'Bob')
    const c = add(g, 'friend', 70, 'Cat')
    const d1 = add(g, 'parent', 5, 'Dee')
    const d2 = add(g, 'child', 5, 'Eli')
    const want = on(() => relModel(g))
    const lowest = [a.id, b.id, c.id].sort()[0]!
    expect(tileOf(want, 'closest')!.open).toEqual([personGroupId(lowest)])
    expect(tileOf(want, 'drifting')!.open).toEqual([personGroupId([d1.id, d2.id].sort()[0]!)])
    for (const order of [[...g.people].reverse(), [g.people[2]!, g.people[4]!, g.people[0]!, g.people[3]!, g.people[1]!]]) {
      const shuffled = { ...g, people: order }
      expect(JSON.stringify(on(() => relModel(shuffled)))).toBe(JSON.stringify(want))
    }
  })

  it('every tile is short, clean and well formed, and every open id is a living person of the list', () => {
    const states: GameState[] = []
    for (const level of LEVELS) {
      const { g, ids } = buildKit(level)
      estrange(g, person(g, ids.child))
      owe(g, person(g, ids.sibling), 12_000)
      states.push(g)
    }
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as NavStateName[]) states.push(navState(name))
    for (const g of states) {
      const m = on(() => relModel(g))
      expect(m.tiles.length).toBeLessThanOrEqual(4)
      expect(new Set(m.tiles.map((t) => t.id)).size).toBe(m.tiles.length)
      expect(m.tiles.map((t) => t.id)).toEqual(IDS.filter((id) => m.tiles.some((t) => t.id === id)))
      expect(m.tab).toBe('relationships')
      expect(m.chart).toBeNull()
      expect(m.cards).toEqual([])
      expect(JSON.stringify(m)).not.toMatch(BAD)
      expect(JSON.stringify(m)).not.toMatch(LONG_DASH)
      for (const t of m.tiles) {
        for (const text of [t.label, t.value, t.note ?? '']) {
          expect(text.length, `${t.id}: ${text}`).toBeLessThanOrEqual(40)
          expect(text).not.toContain('\n')
        }
        expect(t.value, t.id).not.toBe('')
        expect(TONES.has(t.tone), t.tone).toBe(true)
        if (t.meter !== undefined) {
          expect(Number.isInteger(t.meter)).toBe(true)
          expect(t.meter).toBeGreaterThanOrEqual(0)
          expect(t.meter).toBeLessThanOrEqual(100)
        }
        if (t.open !== undefined) {
          expect(t.open).toHaveLength(1)
          const id = personIdOf(t.open[0]!)
          expect(id, t.id).not.toBeNull()
          expect(g.people.some((p) => p.id === id && p.alive && p.relation !== 'pet'), `${t.id} opens ${id}`).toBe(true)
        }
      }
    }
  })

  it('Activities stays thin whatever the People flag says, and the other tabs are not touched by it', () => {
    for (const name of ['kid', 'adult', 'ceo', 'elder'] as NavStateName[]) {
      const g = frozen(name)
      expect(on(() => cockpitOf('activities', g)).tiles, name).toEqual([])
      for (const tab of ['occupation', 'assets', 'activities'] as const) expect(JSON.stringify(on(() => cockpitOf(tab, g))), `${name} ${tab}`).toBe(JSON.stringify(off(() => cockpitOf(tab, g))))
    }
  })

  it('the summary line stays as it was', () => {
    const g = navState('adult')
    const living = g.people.filter((p) => p.alive && p.relation !== 'pet').length
    const m = on(() => relModel(g))
    expect(m.summary).toBe(`${living} ${living === 1 ? 'person' : 'people'} in your life.`)
    expect(m.summary).toBe(off(() => relModel(g)).summary)
  })

  it('draws the tile in the cockpit body: the words, and a button for the two with a screen', () => {
    const { g, ids } = buildKit(20)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 12_000)
    const m = on(() => relModel(g))
    const html = renderToStaticMarkup(createElement(CockpitBody, { model: m, jump: [], onOpen: () => {} }))
    for (const word of ['Closest', 'Drifting', 'Owed to you', 'Estranged']) expect(html).toContain(word)
    expect(html.match(/<button/g)?.length ?? 0).toBe(m.tiles.filter((t) => t.open !== undefined).length)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Known facts only

describe('4. known facts only', () => {
  /** Every number and word about a person that the player does not see on the list: scrambled. */
  function scramble(g: GameState): GameState {
    const out = structuredClone(g)
    let n = 0
    for (const p of out.people) {
      n += 1
      p.stats = { happiness: (n * 7) % 100, health: (n * 13) % 100, smarts: (n * 17) % 100, looks: (n * 19) % 100 }
      p.money = n * 1_234_567
      p.traits = ['proud', 'jealous', 'greedy']
      p.occupation = 'Spy'
      p.pregnant = n % 2 === 0
      p.notes = ['a secret']
      p.contextId = `ctx${n}`
      const keep: Record<string, unknown> = {}
      if (p.data.w !== undefined) keep.w = p.data.w
      if (p.data.wl !== undefined) keep.wl = p.data.wl
      p.data = { ...Object.fromEntries(Object.entries(keep)), generosity: 99, craziness: 98, life: { v: 1, skill: 77.7, ambition: 11.1 }, talents: ['MainCharacter'], entitlement: 97 } as Person['data']
    }
    return out
  }

  it('the model does not move when every hidden stat, trait, cash figure and data stat of every person changes', () => {
    for (const level of LEVELS) {
      const { g, ids } = buildKit(level)
      estrange(g, person(g, ids.child))
      owe(g, person(g, ids.sibling), 12_000)
      expect(JSON.stringify(on(() => relModel(scramble(g))))).toBe(JSON.stringify(on(() => relModel(g))))
    }
  })

  it('the badge of a person does not move with them either', () => {
    const { g, ids } = buildKit(20)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 12_000)
    const s = scramble(g)
    for (const key of KIT_KEYS) expect(on(() => personBadge(s, person(s, ids[key]))), key).toBe(on(() => personBadge(g, person(g, ids[key]))))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. Bounds, hostile persons, purity

describe('5. bounds, hostile persons and purity', () => {
  it('5,000 people give four tiles in one pass', { timeout: TIMEOUT }, () => {
    const g = crowd(5_000, (i, by) => {
      const data: Person['data'] = {}
      if (i % 50 === 0) data.w = { by, owes: 100 + i }
      if (i % 70 === 0) data.wl = { by, estr: true }
      return { relationship: i % 101, relation: i % 3 === 0 ? 'parent' : 'friend', data }
    })
    const t0 = performance.now()
    const m = on(() => relModel(g))
    const ms = performance.now() - t0
    expect(m.tiles.map((t) => t.id)).toEqual(IDS)
    expect(ms).toBeLessThan(1_500)
    const closest = tileOf(m, 'closest')!
    expect(closest.meter).toBe(100)
    expect(personIdOf(closest.open![0]!)).toBe('c100')
    expect(tileOf(m, 'drifting')!.open).toEqual([personGroupId('c0')])
    expect(JSON.stringify(m).length).toBeLessThan(2_000)
    const rows = on(() => needsYou(peopleMenu.children(g), g))
    expect(rows.length).toBeLessThanOrEqual(6)
  })

  it('the owed figure has a ceiling: 5,000 people who each owe 1e300 read as a finite, short amount', () => {
    const g = crowd(5_000)
    for (const p of g.people) p.data.w = { by: g.character.id, owes: 1e300 }
    const m = on(() => relModel(g))
    const owed = tileOf(m, 'owed')!
    expect(owed.value.length).toBeLessThanOrEqual(40)
    expect(owed.value).not.toMatch(BAD)
    expect(owed.note).toBe('5000 people')
    const big = crowd(500)
    for (const p of big.people) p.data.w = { by: big.character.id, owes: 1e300 }
    expect(tileOf(on(() => relModel(big)), 'owed')!.value).toBe(owed.value)
  })

  it('hostile persons never throw: a NaN relationship, no data.w, no data, junk entries, an id that is not a string', () => {
    const g = adultGame()
    const ok = add(g, 'friend', 55, 'Fine')
    const nan = add(g, 'parent', 50, 'Nan')
    nan.relationship = Number.NaN
    const inf = add(g, 'child', 50, 'Inf')
    inf.relationship = Number.POSITIVE_INFINITY
    const neg = add(g, 'spouse', 50, 'Neg')
    neg.relationship = -40
    const noData = add(g, 'sibling', 10, 'NoData')
    delete (noData as unknown as Record<string, unknown>).data
    const badW = add(g, 'child', 20, 'BadW')
    badW.data.w = { by: g.character.id, owes: 'a lot' }
    const badWl = add(g, 'partner', 20, 'BadWl')
    badWl.data.wl = 'estranged'
    const noId = add(g, 'friend', 99, 'NoId')
    ;(noId as unknown as Record<string, unknown>).id = 7
    ;(g.people as unknown[]).push(null, undefined, 'x', 3, {})
    expect(() => on(() => relModel(g))).not.toThrow()
    const m = on(() => relModel(g))
    expect(JSON.stringify(m)).not.toMatch(BAD)
    expect(m.tiles.length).toBeLessThanOrEqual(4)
    expect(tileOf(m, 'closest')!.open).toEqual([personGroupId(ok.id)])
    for (const p of [ok, nan, inf, neg, badW, badWl, noData, noId]) expect(() => on(() => personBadge(g, p)), p.firstName).not.toThrow()
    expect(on(() => personBadge(g, nan))).toBeNull()
    expect(on(() => personBadge(g, neg))).toBe('Drifting')
    expect(on(() => personBadge(g, badW))).toBe('Drifting')
    expect(on(() => personBadge(g, badWl))).toBe('Drifting')
    expect(on(() => personBadge(g, noData))).toBeNull()
  })

  it('a life with no people list gives the empty model and not a throw', () => {
    const g = adultGame()
    ;(g as unknown as Record<string, unknown>).people = undefined
    const m = on(() => relModel(g))
    expect(m.tiles).toEqual([])
    expect(m.tab).toBe('relationships')
  })

  it('is frozen and pure: twice on a deep-frozen copy gives one text, the state is untouched, and nothing draws', () => {
    const { g, ids } = buildKit(20)
    estrange(g, person(g, ids.child))
    owe(g, person(g, ids.sibling), 12_000)
    const copy = deepFreeze(structuredClone(g))
    const before = JSON.stringify(copy)
    const rng = copy.rng
    const run = (): string =>
      on(() => JSON.stringify([relModel(copy), copy.people.map((p) => personBadge(copy, p)), needsYou(peopleMenu.children(copy), copy).map((r) => [r.node.id, r.badge])]))
    const a = run()
    const b = run()
    expect(a).toBe(b)
    expect(a).toContain('Estranged')
    expect(JSON.stringify(copy)).toBe(before)
    expect(copy.rng).toBe(rng)
  })

  it('LIVING_KEYS of the kit are the persons the tiles scan: the closest of a level-90 household is a living, non-pet person', () => {
    const { g, ids } = buildKit(90)
    const open = tileOf(on(() => relModel(g)), 'closest')!.open![0]!
    const id = personIdOf(open)!
    expect(LIVING_KEYS.map((k) => ids[k])).toContain(id)
    expect(id).toBe(ids[LIVING_KEYS[0]!])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. The doc

describe('6. docs/NAVIGATION.md', () => {
  const raw = readFileSync(join(ROOT, 'docs/NAVIGATION.md'), 'utf8')
  /** The doc as one line of words, so a sentence that wraps still matches. */
  const doc = raw.replace(/\s+/g, ' ')

  it('names the four tiles, the flag that gates them and the two new badge words', () => {
    for (const word of ['Closest', 'Drifting', 'Owed to you', 'Estranged', 'Owes you', 'peopleProfile']) expect(doc, word).toContain(word)
    expect(doc).not.toContain('Relationships and Activities stay thin')
    expect(doc).toContain('Activities stays thin')
  })

  it('keeps the words nav-release requires, and holds no long dash', () => {
    for (const word of ['navRegroup', 'navPalette', 'cockpits', 'regroupForDisplay', 'hub.', 'registerBadge', 'KEYWORDS', 'anotherlife.ui.v1', 'src/ui/nav/lazy.tsx', 'PALETTE_ZONE']) {
      expect(doc, word).toContain(word)
    }
    expect(raw.split('\n').length).toBeGreaterThan(80)
    expect(LONG_DASH.test(raw)).toBe(false)
  })
})
