// ci: fast
// R4-S6 (D.1 e): the name registry (src/game/world/met-names.ts). "One name is not two people", decided once, at promotion, and stored:
// resolveName(g, lat) takes the first of the eight names nameDraw gives (k = 0..7) that nobody holds, else k = 8, the latent first
// name with the latent last name, a hyphen and a second last name walked from a seeded start. takenNames(g) is who holds what: the
// player, every Person of g.people, every Met record and tombstone, and the brand names a first and a last name of the pools can spell.
//
// What the file proves, in the order of the plan: the order a family is promoted in changes only the names inside a collision (400
// slots in the smallest pool and in a pool of 30 first names, ten orders each), a dead relative's name is taken, a brand pair is
// never given, the copied brand list equals what allBrands() and the pools say today (a brand added later fails it until the copy is
// updated), the module imports neither data/brands nor data/locales, a read on a deep-frozen state leaves g.rng, g.nextId and g.world
// as they were, the same call twice is equal, and 40,000 resolves (100 times the cap) finish. No pinned seed: families are strings.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { hashKey, worldSeed } from '../src/game/kernel/streams'
import type { GameState, Person } from '../src/game/types'
import { COUNTRIES, namePoolOf } from '../src/game/world'
import { AXIS_IDS } from '../src/game/world/axes'
import { latent, latentUnit, nameDraw, type LatentPerson } from '../src/game/world/latent'
import { MET_LIMITS, normalizeMet, packGb, readMet, writeMet, type MetRecord, type MetShard } from '../src/game/world/met'
import { BRAND_PAIRS, HYPHEN_K, HYPHEN_UNIT, nameFree, nameKey, resolveName, takenNames } from '../src/game/world/met-names'
import '../src/game/world/shards'
import type { Slot } from '../src/game/world/sid'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/met-names.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

// ---------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------

/** The key of a name, written out here on purpose: the oracle must not share code with the module. */
const keyOf = (first: string, last: string): string => `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`

/** A test life with the player named and nobody else. */
function game(lifeId = 'names-family'): GameState {
  const g = makeTestGame(1, { firstName: 'Quill', lastName: 'Harborough' })
  g.lifeId = lifeId
  return g
}

function person(over: Partial<Person> & Pick<Person, 'firstName' | 'lastName'>): Person {
  return {
    id: `p${Math.abs(hashKey(over.firstName + over.lastName)) % 100_000}`,
    gender: 'male',
    age: 40,
    alive: true,
    relation: 'friend',
    relationship: 50,
    stats: { happiness: 50, health: 50, smarts: 50, looks: 50 },
    money: 0,
    occupation: 'Unemployed',
    traits: [],
    yearsKnown: 1,
    livesWithPlayer: false,
    notes: [],
    data: {},
    ...over,
  }
}

/** A classmate slot of one family: the same kind and cohort, so the pool, and the year filter on first names, are as tight as they get. */
const slotOf = (place: string, ord: number): Slot => ({ kind: 'cls', place, cohort: 2004, ord })

/** The Met record of a promoted person, with the name the registry gave. */
function recordOf(lat: LatentPerson, name: { first: string; last: string; k: number }, year = 2004): MetRecord {
  const a = AXIS_IDS.map((id) => lat.axes[id]) as unknown as MetRecord['a']
  return { f: name.first, l: name.last, g: lat.gender === 'male' ? 1 : 0, b: lat.born, c: lat.country, k: name.k, a, y: year, s: year, w: 0, fl: 0, gr: 0, ob: 0 }
}

/** Promotes a slot by hand (S7's touchMet does not exist yet): latent, resolveName, then the one writer. */
function promote(g: GameState, slot: Slot): { sid: string; first: string; last: string; k: number } {
  const lat = latent(worldSeed(g), slot)
  const name = resolveName(g, lat)
  writeMet(g, { ...readMet(g), [lat.sid]: recordOf(lat, name) })
  return { sid: lat.sid, ...name }
}

/** 0..n-1 in an order a label sets: sorted by a hash of the label and the index. Seeded, no generator, no g.rng. */
function orderOf(label: string, n: number): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => hashKey(`${label}|${a}`) - hashKey(`${label}|${b}`) || a - b)
}

interface Run {
  g: GameState
  /** by ord */
  names: Map<number, { sid: string; first: string; last: string; k: number }>
}

/** Promotes `count` slots of `place` in `order`, checking each answer against an oracle that shares no code with the module. */
function promoteAll(place: string, order: readonly number[]): Run {
  const g = game()
  const seed = worldSeed(g)
  const held = new Set<string>([keyOf(g.character.firstName, g.character.lastName), ...BRAND_PAIRS.map(([f, l]) => keyOf(f, l))])
  const names: Run['names'] = new Map()
  for (const ord of order) {
    const slot = slotOf(place, ord)
    const lat = latent(seed, slot)
    const mine = promote(g, slot)
    // the answer is the first free name of k = 0..7, else the hyphenated one, and it is free
    const wanted = [0, 1, 2, 3, 4, 5, 6, 7].findIndex((k) => {
      const n = k === 0 ? { first: lat.first, last: lat.last } : nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
      return !held.has(keyOf(n.first, n.last))
    })
    expect(mine.k, `${lat.sid} first free k`).toBe(wanted === -1 ? 8 : wanted)
    if (wanted === -1) {
      expect(mine.first).toBe(lat.first)
      expect(mine.last.startsWith(`${lat.last}-`), `${lat.sid} hyphenated`).toBe(true)
    }
    expect(held.has(keyOf(mine.first, mine.last)), `${lat.sid} ${mine.first} ${mine.last} free`).toBe(false)
    held.add(keyOf(mine.first, mine.last))
    names.set(ord, mine)
  }
  return { g, names }
}

const COUNT = 400

// ---------------------------------------------------------------------------------------------------------------------------
// nameKey, takenNames, nameFree
// ---------------------------------------------------------------------------------------------------------------------------

describe('nameKey', () => {
  it('lower-cases and trims first and last and joins them with a bar', () => {
    expect(nameKey('Ada', 'Lovelace')).toBe('ada|lovelace')
    expect(nameKey('  ADA ', '\tLoveLace\n')).toBe('ada|lovelace')
  })

  it('makes two spellings of one name equal and two names differ', () => {
    expect(nameKey('Jose', 'Garcia')).toBe(nameKey(' jose', 'GARCIA '))
    expect(nameKey('Ada', 'Lovelace')).not.toBe(nameKey('Lovelace', 'Ada'))
    expect(nameKey('Van', 'Damme')).not.toBe(nameKey('Van Damme', ''))
  })
})

describe('takenNames and nameFree', () => {
  it('holds the player and the brand pairs and nothing else in a life with nobody else', () => {
    const g = game()
    const taken = takenNames(g)
    expect([...taken].sort()).toEqual([keyOf('Quill', 'Harborough'), ...BRAND_PAIRS.map(([f, l]) => keyOf(f, l))].sort())
  })

  it('holds every Person of g.people, alive or dead, kin or not, and a pet', () => {
    const g = game()
    g.people.push(
      person({ firstName: 'Living', lastName: 'Friend' }),
      person({ firstName: 'Gone', lastName: 'Father', relation: 'parent', alive: false }),
      person({ firstName: 'Rex', lastName: 'Harborough', relation: 'pet', species: 'Dog' }),
    )
    const taken = takenNames(g)
    for (const key of ['living|friend', 'gone|father', 'rex|harborough']) expect(taken.has(key), key).toBe(true)
    expect(nameFree(g, 'GONE', ' father ')).toBe(false)
    expect(nameFree(g, 'Gone', 'Mother')).toBe(true)
  })

  it('holds every Met record and tombstone', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('us', 0))
    const shard: MetShard = {
      [lat.sid]: recordOf(lat, { first: 'Marisol', last: 'Quenby', k: 0 }),
      'p77': [2040, 0, 30, 1, 'Tomas', 'Vennerberg', packGb(1950, 1)] as unknown as MetShard[string],
    }
    writeMet(g, shard)
    const taken = takenNames(g)
    expect(taken.has('marisol|quenby')).toBe(true)
    expect(taken.has('tomas|vennerberg')).toBe(true)
    expect(nameFree(g, 'Marisol', 'Quenby')).toBe(false)
    expect(nameFree(g, 'Tomas', 'Vennerberg')).toBe(false)
  })

  it('holds the brand pairs, so nameFree refuses each of the seven', () => {
    const g = game()
    for (const [first, last] of BRAND_PAIRS) {
      expect(takenNames(g).has(keyOf(first, last)), `${first} ${last}`).toBe(true)
      expect(nameFree(g, first, last), `${first} ${last}`).toBe(false)
    }
  })

  it('is nameFree negated, and hands back a fresh set a caller may add to', () => {
    const g = game()
    const a = takenNames(g)
    a.add('invented|name')
    expect(takenNames(g).has('invented|name')).toBe(false)
    expect(nameFree(g, 'Invented', 'Name')).toBe(true)
    expect(nameFree(g, 'Quill', 'Harborough')).toBe(false)
  })

  it('skips a Person whose name is no text and a null entry, and never throws', () => {
    const g = game()
    const hostile = [null, undefined, { firstName: 5, lastName: 'X' }, { firstName: 'Y' }, { firstName: 'Ok', lastName: 'Name' }] as unknown as Person[]
    g.people.push(...hostile)
    expect(() => takenNames(g)).not.toThrow()
    expect(takenNames(g).has('ok|name')).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The copied brand list
// ---------------------------------------------------------------------------------------------------------------------------

describe('the copied brand list', () => {
  const pools = [...new Set(COUNTRIES.map((c) => namePoolOf(c.id)))]
  const firstsOf = (p: ReturnType<typeof namePoolOf>): string[] => [...p.male, ...p.female]

  /** Every brand that splits into a first name of the given pools and a last name of the given pools, as name keys. */
  function brandsMadeFrom(firstPools: typeof pools, lastPools: typeof pools): Set<string> {
    const firsts = new Set(firstPools.flatMap(firstsOf).map((n) => n.trim().toLowerCase()))
    const lasts = new Set(lastPools.flatMap((p) => p.last).map((n) => n.trim().toLowerCase()))
    const out = new Set<string>()
    for (const brand of allBrands()) {
      const words = brand.name.trim().split(/\s+/)
      for (let i = 1; i < words.length; i++) {
        const first = words.slice(0, i).join(' ').toLowerCase()
        const last = words.slice(i).join(' ').toLowerCase()
        if (firsts.has(first) && lasts.has(last)) out.add(`${first}|${last}`)
      }
    }
    return out
  }

  it('equals the set the test recomputes: every brand of allBrands() that splits into a first name of any pool and a last name of any pool', () => {
    const recomputed = brandsMadeFrom(pools, pools)
    const copied = new Set(BRAND_PAIRS.map(([f, l]) => keyOf(f, l)))
    expect([...copied].sort(), 'update BRAND_PAIRS in met-names.ts from this list').toEqual([...recomputed].sort())
    expect(copied.size).toBe(BRAND_PAIRS.length)
  })

  it('has the seven names of today and contains the names one pool makes by itself (the ones latent() can give)', () => {
    expect(BRAND_PAIRS.length).toBe(7)
    const single = new Set<string>()
    for (const p of pools) for (const k of brandsMadeFrom([p], [p])) single.add(k)
    expect([...single].sort()).toEqual(['david|jones', 'edward|jones', 'ethan|allen', 'john|lewis'])
    const copied = new Set(BRAND_PAIRS.map(([f, l]) => keyOf(f, l)))
    for (const k of single) expect(copied.has(k), k).toBe(true)
  })

  it('is frozen to the bottom', () => {
    expect(Object.isFrozen(BRAND_PAIRS)).toBe(true)
    for (const pair of BRAND_PAIRS) expect(Object.isFrozen(pair)).toBe(true)
  })

  it('is never given: over thousands of slots in the countries whose pool spells a brand, no answer is a brand pair', () => {
    const g = game()
    const seed = worldSeed(g)
    const brands = new Set(BRAND_PAIRS.map(([f, l]) => keyOf(f, l)))
    const places = COUNTRIES.filter((c) => {
      const p = namePoolOf(c.id)
      return BRAND_PAIRS.some(([f, l]) => firstsOf(p).includes(f) && p.last.includes(l))
    }).map((c) => c.id)
    expect(places.length).toBeGreaterThan(0)
    const wouldHave = new Map<string, number>()
    const offenders: string[] = []
    for (const place of places) {
      for (const cohort of [1960, 1990, 2020]) {
        for (let ord = 0; ord < 2_000; ord++) {
          const lat = latent(seed, { kind: 'frn', place, cohort, ord })
          const key = keyOf(lat.first, lat.last)
          if (brands.has(key)) wouldHave.set(key, (wouldHave.get(key) ?? 0) + 1)
          const got = resolveName(g, lat)
          if (brands.has(keyOf(got.first, got.last))) offenders.push(`${lat.sid} ${got.first} ${got.last}`)
        }
      }
    }
    expect(offenders).toEqual([])
    // the guard is exercised: the latent name was a brand for at least one slot, and every such slot got another name
    expect(wouldHave.size, `brand pairs that latent() gave as k = 0: ${[...wouldHave.keys()].join(', ')}`).toBeGreaterThan(0)
    console.log('brand pairs latent() would have given:', Object.fromEntries(wouldHave))
  })

  it('is refused at k = 0 and the slot takes its alternate instead', () => {
    const g = game()
    const seed = worldSeed(g)
    const brands = new Set(BRAND_PAIRS.map(([f, l]) => keyOf(f, l)))
    let lat: LatentPerson | null = null
    for (let ord = 0; ord < 20_000 && lat === null; ord++) {
      const cand = latent(seed, { kind: 'frn', place: 'gb', cohort: 1990, ord })
      if (brands.has(keyOf(cand.first, cand.last))) lat = cand
    }
    expect(lat, 'a gb slot whose latent name is a brand').not.toBeNull()
    const got = resolveName(g, lat!)
    expect(got.k).toBeGreaterThanOrEqual(1)
    const alt = nameDraw(seed, lat!.sid, 1, lat!.gender, lat!.born, lat!.country)
    if (!brands.has(keyOf(alt.first, alt.last))) expect(got).toEqual({ ...alt, k: 1 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// resolveName: k = 0, the alternates, the hyphenated surname
// ---------------------------------------------------------------------------------------------------------------------------

describe('resolveName: the first free name', () => {
  const seedOf = (g: GameState): string => worldSeed(g)

  it('is the latent name at k = 0 when nobody holds it', () => {
    const g = game()
    const lat = latent(seedOf(g), slotOf('us', 7))
    expect(resolveName(g, lat)).toEqual({ first: lat.first, last: lat.last, k: 0 })
  })

  it('takes the first free alternate in order: k = 1 when only the latent name is held, k = 3 when k = 0..2 are', () => {
    const g = game()
    const seed = seedOf(g)
    const lat = latent(seed, slotOf('us', 7))
    const alt = (k: number) => nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
    g.people.push(person({ firstName: lat.first, lastName: lat.last }))
    expect(resolveName(g, lat)).toEqual({ ...alt(1), k: 1 })
    for (const k of [1, 2]) g.people.push(person({ firstName: alt(k).first, lastName: alt(k).last }))
    expect(resolveName(g, lat)).toEqual({ ...alt(3), k: 3 })
  })

  it('does not skip a free k because a later one is held: k = 1 is held and k = 0 free gives k = 0', () => {
    const g = game()
    const seed = seedOf(g)
    const lat = latent(seed, slotOf('us', 7))
    const one = nameDraw(seed, lat.sid, 1, lat.gender, lat.born, lat.country)
    g.people.push(person({ firstName: one.first, lastName: one.last }))
    expect(resolveName(g, lat).k).toBe(0)
  })

  it('refuses the name of the player, of a Met record and of a tombstone like any other', () => {
    const g = game()
    const seed = seedOf(g)
    const lat = latent(seed, slotOf('us', 7))
    g.character.firstName = lat.first
    g.character.lastName = lat.last
    expect(resolveName(g, lat).k).toBe(1)
    const one = nameDraw(seed, lat.sid, 1, lat.gender, lat.born, lat.country)
    const other = latent(seed, slotOf('us', 8))
    writeMet(g, { [other.sid]: recordOf(other, { first: one.first, last: one.last, k: 0 }) })
    expect(resolveName(g, lat).k).toBe(2)
    const two = nameDraw(seed, lat.sid, 2, lat.gender, lat.born, lat.country)
    writeMet(g, { ...readMet(g), p31: [2040, 0, 10, 1, two.first, two.last, packGb(1960, 1)] as unknown as MetShard[string] })
    expect(resolveName(g, lat).k).toBe(3)
  })

  it('takes a dead relative\'s name as taken: the name of a kept grandfather is not given to a stranger', () => {
    const g = game()
    const seed = seedOf(g)
    const lat = latent(seed, slotOf('us', 21))
    g.people.push(person({ firstName: lat.first, lastName: lat.last, relation: 'grandparent', alive: false }))
    const got = resolveName(g, lat)
    expect(got.k).toBeGreaterThanOrEqual(1)
    expect(keyOf(got.first, got.last)).not.toBe(keyOf(lat.first, lat.last))
    // createPerson's own check ignores the dead, so this is the registry holding more than it does
    expect(nameFree(g, lat.first, lat.last)).toBe(false)
  })

  it('answers in the case of the pool, whatever the case of the held name', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('us', 7))
    g.people.push(person({ firstName: lat.first.toUpperCase(), lastName: ` ${lat.last.toLowerCase()} ` }))
    const got = resolveName(g, lat)
    expect(got.k).toBe(1)
    expect(got.first).not.toBe(lat.first.toUpperCase())
  })
})

describe('resolveName: k = 8, the hyphenated surname', () => {
  /** A game where the eight names a slot can take are held, so the slot falls to the hyphen. */
  function crowded(lat: LatentPerson, g: GameState): void {
    const seed = worldSeed(g)
    g.people.push(person({ firstName: lat.first, lastName: lat.last }))
    for (let k = 1; k <= 7; k++) {
      const n = nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
      g.people.push(person({ firstName: n.first, lastName: n.last }))
    }
  }

  /** The second last names in the order the walk visits them: the pool from the start unit 30 sets, the last name of the person left out. */
  function walkOf(g: GameState, lat: LatentPerson): string[] {
    const lasts = namePoolOf(lat.country).last
    const start = Math.floor(latentUnit(worldSeed(g), lat.sid, HYPHEN_UNIT) * lasts.length)
    const out: string[] = []
    for (let j = 0; j < lasts.length; j++) {
      const second = lasts[(start + j) % lasts.length]!
      if (second.trim().toLowerCase() !== lat.last.trim().toLowerCase()) out.push(second)
    }
    return out
  }

  it('is the latent first name with the latent last name, a hyphen and a second last name of the pool, with k = 8', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('us', 7))
    crowded(lat, g)
    const got = resolveName(g, lat)
    expect(got.k).toBe(HYPHEN_K)
    expect(HYPHEN_K).toBe(8)
    expect(HYPHEN_K).toBe(MET_LIMITS.kMax)
    expect(got.first).toBe(lat.first)
    expect(got.last).toBe(`${lat.last}-${walkOf(g, lat)[0]}`)
    expect(nameFree(g, got.first, got.last)).toBe(true)
    expect(namePoolOf(lat.country).last).toContain(got.last.slice(lat.last.length + 1))
  })

  it('walks the pool from the seeded start: each held candidate moves it to the next last name, and it visits all of them', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('qa', 3))
    crowded(lat, g)
    const walk = walkOf(g, lat)
    expect(walk.length).toBeGreaterThanOrEqual(18)
    const seen: string[] = []
    for (let j = 0; j < walk.length; j++) {
      const got = resolveName(g, lat)
      expect(got.k).toBe(HYPHEN_K)
      expect(got.last, `step ${j}`).toBe(`${lat.last}-${walk[j]}`)
      seen.push(got.last)
      g.people.push(person({ firstName: got.first, lastName: got.last }))
    }
    expect(new Set(seen).size).toBe(walk.length)
  })

  it('still ends when every hyphenated name is held: it answers with the first candidate of the walk, k = 8, and does not throw', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('qa', 3))
    crowded(lat, g)
    const walk = walkOf(g, lat)
    for (const second of walk) g.people.push(person({ firstName: lat.first, lastName: `${lat.last}-${second}` }))
    expect(resolveName(g, lat)).toEqual({ first: lat.first, last: `${lat.last}-${walk[0]}`, k: HYPHEN_K })
  })

  it('starts the walk from the unit 30 of the key of the person: two slots of one family start in different places', () => {
    const g = game()
    const seed = worldSeed(g)
    const starts = new Set<number>()
    for (let ord = 0; ord < 40; ord++) {
      const lat = latent(seed, slotOf('qa', ord))
      starts.add(Math.floor(latentUnit(seed, lat.sid, HYPHEN_UNIT) * namePoolOf('qa').last.length))
    }
    expect(starts.size).toBeGreaterThan(8)
    expect(HYPHEN_UNIT).toBe(30)
  })

  it('fits a Met record: the longest first name of any pool and the longest hyphenated surname are within the 24 and 32 the record keeps', () => {
    let longestFirst = 0
    let longestLast = 0
    for (const c of COUNTRIES) {
      const p = namePoolOf(c.id)
      for (const n of [...p.male, ...p.female]) longestFirst = Math.max(longestFirst, n.length)
      for (const n of p.last) longestLast = Math.max(longestLast, n.length)
    }
    expect(longestFirst).toBeLessThanOrEqual(MET_LIMITS.firstMax)
    expect(longestLast * 2 + 1).toBeLessThanOrEqual(MET_LIMITS.lastMax)
  })

  it('is stored as it is: the record keeps the hyphenated name through the normalizer and a JSON round trip, with k = 8', () => {
    const g = game()
    const lat = latent(worldSeed(g), slotOf('us', 7))
    crowded(lat, g)
    const name = resolveName(g, lat)
    writeMet(g, { [lat.sid]: recordOf(lat, name) })
    const back = readMet({ world: JSON.parse(JSON.stringify(g.world)) as GameState['world'] })
    const rec = back[lat.sid] as MetRecord
    expect({ first: rec.f, last: rec.l, k: rec.k }).toEqual(name)
    expect(normalizeMet(JSON.parse(JSON.stringify(readMet(g))))[lat.sid]).toEqual(rec)
  })

  it('cuts to the 32 a record keeps when the latent last name is so long that every hyphenated name is over it (k = 8, no throw)', () => {
    const g = game()
    const lat = { ...latent(worldSeed(g), slotOf('us', 7)), last: 'Oberammergauerstrasse-Longname' }
    const seed = worldSeed(g)
    g.people.push(person({ firstName: lat.first, lastName: lat.last }))
    for (let k = 1; k <= 7; k++) {
      const n = nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
      g.people.push(person({ firstName: n.first, lastName: n.last }))
    }
    const got = resolveName(g, lat)
    expect(got.k).toBe(HYPHEN_K)
    expect(got.last.length).toBeLessThanOrEqual(MET_LIMITS.lastMax)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 400 slots of one family, promoted in ten orders
// ---------------------------------------------------------------------------------------------------------------------------

describe('promotion order: 400 slots of one family', () => {
  /**
   * The most of the 400 that fell to the hyphen in any one of the ten orders when this was written: qa 1 (3 of the 4,000 names of the
   * ten orders, 0.075%), gb 0 (the 30-name pool never needs it). A regression that made the alternates correlated would show here first.
   * Name tables change between releases: if a pool grows or shrinks, re-measure (the test prints the distribution) and move the number.
   */
  const K8_MOST = { qa: 1, gb: 0 } as const

  const ORDERS = Array.from({ length: 10 }, (_, i) => `order-${i}`)

  for (const [place, label] of [
    ['qa', 'qa, the smallest pool (20 first names, 19 last names: 380 pairs a gender)'],
    ['gb', 'gb, a pool of 30 first names a gender (30 x 40 pairs)'],
  ] as const) {
    describe(label, () => {
      let runs: Run[] = []
      beforeAll(() => {
        runs = ORDERS.map((o) => promoteAll(place, orderOf(`${place}|${o}`, COUNT)))
      })

      it('gives all 400 distinct names in every order, and holds the same 400 people', () => {
        const sids = Object.keys(readMet(runs[0]!.g)).sort()
        expect(sids.length).toBe(COUNT)
        for (const run of runs) {
          const keys = [...run.names.values()].map((n) => keyOf(n.first, n.last))
          expect(new Set(keys).size).toBe(COUNT)
          expect(Object.keys(readMet(run.g)).sort()).toEqual(sids)
          for (const [, n] of run.names) expect(n.sid in readMet(run.g)).toBe(true)
        }
      })

      it('changes only the names inside a collision: a slot nobody else can take the name of has k = 0 in every order', () => {
        const g = game()
        const seed = worldSeed(g)
        const candidates = new Map<number, string[]>()
        for (let ord = 0; ord < COUNT; ord++) {
          const lat = latent(seed, slotOf(place, ord))
          const keys = [keyOf(lat.first, lat.last)]
          for (let k = 1; k <= 7; k++) {
            const n = nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
            keys.push(keyOf(n.first, n.last))
          }
          candidates.set(ord, keys)
        }
        const inLists = new Map<string, Set<number>>()
        for (const [ord, keys] of candidates) for (const k of keys) (inLists.get(k) ?? inLists.set(k, new Set()).get(k)!).add(ord)
        const alone = new Set<number>()
        for (let ord = 0; ord < COUNT; ord++) {
          const mine = candidates.get(ord)![0]!
          if (inLists.get(mine)!.size === 1 && !BRAND_PAIRS.some(([f, l]) => keyOf(f, l) === mine) && mine !== keyOf(g.character.firstName, g.character.lastName)) alone.add(ord)
        }
        let moved = 0
        for (let ord = 0; ord < COUNT; ord++) {
          const names = new Set(runs.map((r) => keyOf(r.names.get(ord)!.first, r.names.get(ord)!.last)))
          if (names.size > 1) {
            moved++
            expect(alone.has(ord), `slot ${ord} changed name between orders but nobody else could take its name`).toBe(false)
          } else if (alone.has(ord)) expect(runs[0]!.names.get(ord)!.k).toBe(0)
        }
        console.log(`${place}: ${alone.size} of ${COUNT} slots could not collide, ${moved} changed a name between ten orders`)
        expect(moved).toBeLessThan(COUNT)
      })

      it('reports the share at k = 8 and keeps it at or under the measured value', () => {
        const shares = runs.map((r) => [...r.names.values()].filter((n) => n.k === HYPHEN_K).length)
        const dist = new Array<number>(9).fill(0)
        for (const r of runs) for (const n of r.names.values()) dist[n.k]!++
        console.log(`${place}: k = 0..8 over ${ORDERS.length} orders of ${COUNT}:`, dist.join(' '), `| at k = 8 per order:`, shares.join(' '))
        for (const s of shares) expect(s).toBeLessThanOrEqual(K8_MOST[place])
      })
    })
  }

  it('keeps the pure name for the first promoted of a colliding pair, the alternate for the second, whichever it is', () => {
    const g0 = game()
    const seed = worldSeed(g0)
    const byKey = new Map<string, number[]>()
    for (let ord = 0; ord < COUNT; ord++) {
      const lat = latent(seed, slotOf('qa', ord))
      const key = keyOf(lat.first, lat.last)
      byKey.set(key, [...(byKey.get(key) ?? []), ord])
    }
    const pair = [...byKey.values()].find((v) => v.length >= 2 && !BRAND_PAIRS.some(([f, l]) => byKey.get(keyOf(f, l)) === v))
    expect(pair, 'two qa slots with one latent name').toBeDefined()
    const [a, b] = pair!
    const latA = latent(seed, slotOf('qa', a!))
    const latB = latent(seed, slotOf('qa', b!))
    const pure = keyOf(latA.first, latA.last)
    const ab = game()
    const first = promote(ab, slotOf('qa', a!))
    const second = promote(ab, slotOf('qa', b!))
    const ba = game()
    const first2 = promote(ba, slotOf('qa', b!))
    const second2 = promote(ba, slotOf('qa', a!))
    expect([keyOf(first.first, first.last), first.k]).toEqual([pure, 0])
    expect(second.k).toBeGreaterThanOrEqual(1)
    expect(keyOf(second.first, second.last)).not.toBe(pure)
    expect([keyOf(first2.first, first2.last), first2.k]).toEqual([keyOf(latB.first, latB.last), 0])
    expect(second2.k).toBeGreaterThanOrEqual(1)
    // the same two people, a different split of the name between them
    expect(new Set([keyOf(first.first, first.last), keyOf(second.first, second.last)]).size).toBe(2)
    expect(new Set([keyOf(first2.first, first2.last), keyOf(second2.first, second2.last)]).size).toBe(2)
  })

  it('stores the answer: a second family of 400 in the same pool resolves on its own and a reload keeps every name', () => {
    const run = promoteAll('qa', orderOf('reload', COUNT))
    const reloaded = readMet({ world: JSON.parse(JSON.stringify(run.g.world)) as GameState['world'] })
    for (const n of run.names.values()) {
      const rec = reloaded[n.sid] as MetRecord
      expect({ first: rec.f, last: rec.l, k: rec.k }).toEqual({ first: n.first, last: n.last, k: n.k })
    }
    const other = promoteAll('qa', orderOf('reload', COUNT))
    for (const [ord, n] of run.names) expect(other.names.get(ord)).toEqual(n)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// A read draws nothing and writes nothing; the same call twice is equal; 100 times the cap
// ---------------------------------------------------------------------------------------------------------------------------

describe('a read draws nothing and writes nothing', () => {
  function stocked(): GameState {
    const g = game()
    g.people.push(person({ firstName: 'Living', lastName: 'Friend' }), person({ firstName: 'Gone', lastName: 'Father', relation: 'parent', alive: false }))
    for (let ord = 0; ord < 60; ord++) promote(g, slotOf('us', ord))
    g.nextId = 41
    expect(Object.keys(readMet(g)).length).toBe(60)
    return g
  }

  it('runs takenNames, nameFree and resolveName on a deep-frozen state with a trapped g.rng and leaves rng, nextId and world as they were', () => {
    const g = deepFreeze(trapRng(stocked()))
    const world = g.world
    const before = JSON.stringify(world)
    const lat = latent(worldSeed(g), slotOf('us', 500))
    expect(() => {
      takenNames(g)
      nameFree(g, 'Gone', 'Father')
      resolveName(g, lat)
    }).not.toThrow()
    expect(g.nextId).toBe(41)
    expect(g.world).toBe(world)
    expect(JSON.stringify(g.world)).toBe(before)
  })

  it('takes the k = 8 branch on a deep-frozen state too', () => {
    const g0 = stocked()
    const lat = latent(worldSeed(g0), slotOf('us', 500))
    const seed = worldSeed(g0)
    g0.people.push(person({ firstName: lat.first, lastName: lat.last }))
    for (let k = 1; k <= 7; k++) {
      const n = nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
      g0.people.push(person({ firstName: n.first, lastName: n.last }))
    }
    const g = deepFreeze(trapRng(g0))
    expect(resolveName(g, lat).k).toBe(HYPHEN_K)
  })

  it('gives the same answer twice, as a new object each time', () => {
    const g = stocked()
    const lat = latent(worldSeed(g), slotOf('us', 500))
    const a = resolveName(g, lat)
    const b = resolveName(g, lat)
    expect(b).toEqual(a)
    expect(b).not.toBe(a)
    expect(JSON.stringify(g)).toBe(JSON.stringify(g))
    expect([...takenNames(g)].sort()).toEqual([...takenNames(g)].sort())
  })

  it('does not change the lat it is given', () => {
    const g = stocked()
    const lat = latent(worldSeed(g), slotOf('us', 500))
    const before = JSON.stringify(lat)
    resolveName(g, lat)
    expect(JSON.stringify(lat)).toBe(before)
  })
})

describe('100 times the cap: 40,000 resolves', () => {
  it('finish on a full shard, never throw, and always answer with a free name of k = 0..8 that fits a record', () => {
    const run = promoteAll('qa', orderOf('flood-fill', COUNT))
    const g = run.g
    const seed = worldSeed(g)
    const held = takenNames(g)
    const t0 = Date.now()
    let hyphens = 0
    for (let i = 0; i < 40_000; i++) {
      const lat = latent(seed, { kind: 'cow', place: i % 3 === 0 ? 'qa' : i % 3 === 1 ? 'us' : 'jp', cohort: 1990 + (i % 20), ord: i % 10_000 })
      const got = resolveName(g, lat)
      expect(got.k).toBeGreaterThanOrEqual(0)
      expect(got.k).toBeLessThanOrEqual(HYPHEN_K)
      expect(got.first.length).toBeGreaterThan(0)
      expect(got.last.length).toBeGreaterThan(0)
      expect(got.last.length).toBeLessThanOrEqual(MET_LIMITS.lastMax)
      expect(held.has(keyOf(got.first, got.last)), `${lat.sid} ${got.first} ${got.last}`).toBe(false)
      if (got.k === HYPHEN_K) hyphens++
    }
    console.log(`40,000 resolves on 400 held names: ${Date.now() - t0} ms, ${hyphens} at k = 8`)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// The module and the notes
// ---------------------------------------------------------------------------------------------------------------------------

describe('the module', () => {
  const text = read(FILE)
  const imports = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)

  it('sits in layer 2 and imports only the stream hash, the types, the pools of world.ts and its two siblings', () => {
    expect(layerOf(FILE)).toBe(2)
    for (const t of imports) expect(['../kernel/streams', '../types', '../world', './latent', './met'], t).toContain(t)
    expect(imports).toContain('../world')
  })

  it('imports neither data/brands nor data/locales, nor anything of special/, and names none of them in code', () => {
    expect(imports.some((t) => /data\/(brands|locales)|special\//.test(t))).toBe(false)
    const code = text
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n')
    expect(code).not.toMatch(/data\/brands|data\/locales|allBrands|special\//)
    expect(text).not.toMatch(/\brequire\(|\bimport\(/)
  })

  it('has no long dash, no draw and no clock', () => {
    expect(DASH.test(text)).toBe(false)
    expect(text).not.toMatch(/\bg\.(rng|nextId|year)\b/)
    expect(text).not.toMatch(/\b(rand|randInt|randFloat|chance|pick|weightedPick|shuffle|bell)\(/)
    expect(text).not.toMatch(/Math\.random|Date\.now|new Date/)
    expect(text).not.toMatch(/\bstream\(|outcomeStream\(|streamKey\(/)
  })

  it('reads nothing at module level beyond its own constants (rule (d) of the layers test)', () => {
    const top = text.split('\n').filter((l) => /^(const|let|var|export const)\s/.test(l))
    for (const line of top) expect(line, line).not.toMatch(/namePoolOf|COUNTRIES|latent\(|readMet|allBrands|MET_LIMITS|worldSeed/)
  })
})

describe('docs/PEOPLE.md', () => {
  it('records unit 30 as the start of the walk over second last names, as the note on free units asks', () => {
    const doc = read('docs/PEOPLE.md')
    expect(doc).toMatch(/Unit 30 /)
    expect(doc).toContain('met-names.ts')
    expect(doc).toMatch(/BRAND_PAIRS/)
    expect(DASH.test(doc)).toBe(false)
  })
})
