// The name registry (R4-S6, D.1 e): "one name is not two people", decided once, at promotion, and stored. A person who is promoted from a
// slot (world/latent.ts) to the Met store (world/met.ts) takes the first name of a short list that nobody else holds, and the Met record
// keeps the answer (its `k`), so the name never changes after the first sight.
//
//   nameKey(first, last)       the key of a name: trimmed, lower-cased, `first|last`. Two names are one name when their keys are equal
//   takenNames(g)              every key somebody holds: the player, every Person of g.people (alive, dead or a pet), every Met record
//                              and tombstone, and the brand names a first and a last name of the pools can spell (BRAND_PAIRS)
//   nameFree(g, first, last)   true when no one holds that name
//   resolveName(g, lat)        the first k in 0..7 whose name nameDraw gives is free, else k = 8: the latent first name with the latent
//                              last name, a hyphen and a second last name walked from a seeded start, so it always ends
//
// Pure. Nothing here draws, writes or reads a clock, and the game's own random number is never read: the walk of k = 8 starts at unit
// 30 of the key of the person (latentUnit), a hash like every other number of a latent person, so it needs no stream tag and no row
// in test/stream-tap.ts.
// The order of promotion is the one thing a name depends on beyond the seed: of a colliding pair the first promoted keeps the pure name
// (k = 0) and the second gets its alternate. Call resolveName before the person is stored; once the Met record is there, its own name
// is taken (S7's touchMet reads the record first and calls this only for a sid with none).
//
// The brand list is a copied constant, and the module imports neither data/brands nor data/locales: R5 makes both lazy (X20), and a
// layer 2 file of world/ reads names from the pools of world.ts only (C30). test/world-met-names.test.ts recomputes the list from
// allBrands() and the pools and fails when a brand is added or removed, until the copy below is updated.
//
// Layer 2. Imports the stream hash, the pools of world.ts and its two siblings latent.ts and met.ts.
import { worldSeed } from '../kernel/streams'
import type { GameState } from '../types'
import { namePoolOf } from '../world'
import { latentUnit, nameDraw, type LatentPerson } from './latent'
import { isTomb, MET_LIMITS, readMet } from './met'

/** What the registry reads of a game: the player, the people and the Met shard. */
export type NameBook = Pick<GameState, 'character' | 'people' | 'world'>

/** The same and the life id: the family seed that resolveName draws its alternates with is worldSeed(g). */
export type NameState = NameBook & Pick<GameState, 'lifeId'>

/** The unit of the key of a person that sets the start of the walk over second last names (k = 8). Units 16 to 29 are the alternates. */
export const HYPHEN_UNIT = 30

/** The k of the hyphenated surname: the stored value that says a person's name is the last resort, not a draw (MET_LIMITS.kMax, held equal by the test). */
export const HYPHEN_K = 8

/**
 * The brand names that equal a first name and a last name of the name pools (world.ts), as [first, last]. A first name of one pool with
 * a last name of another counts, because createPerson draws the two through separate calls: Oscar Mayer, Sara Lee, Paul Mitchell, Ethan
 * Allen, Edward Jones, John Lewis and David Jones are 7 today, and only the last four are spelled by one pool (so by latent()).
 * Copied from allBrands() (data/brands.ts, 5,201 brands in v5.3.0) as special/kit/rivals.ts isBrand reads it; the test recomputes it.
 */
export const BRAND_PAIRS: readonly (readonly [first: string, last: string])[] = Object.freeze(
  [
    ['Oscar', 'Mayer'],
    ['Sara', 'Lee'],
    ['Paul', 'Mitchell'],
    ['Ethan', 'Allen'],
    ['Edward', 'Jones'],
    ['John', 'Lewis'],
    ['David', 'Jones'],
  ].map((pair) => Object.freeze(pair) as readonly [string, string]),
)

/** The key of a name: first and last trimmed and lower-cased, joined with a bar. */
export function nameKey(first: string, last: string): string {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`
}

const BRAND_KEYS: readonly string[] = Object.freeze(BRAND_PAIRS.map(([first, last]) => nameKey(first, last)))

function addName(out: Set<string>, first: unknown, last: unknown): void {
  if (typeof first === 'string' && typeof last === 'string') out.add(nameKey(first, last))
}

/**
 * The keys of every name somebody holds. The player and every Person of g.people count, alive or dead, kin or not (createPerson's own
 * check skips the dead and pets; a promoted person is held to more, because a name that was ever in the family is not given to a
 * stranger); so does every Met record and tombstone, and so does each brand pair. A fresh set each call: the caller may add to it.
 */
export function takenNames(g: NameBook): Set<string> {
  const out = new Set<string>(BRAND_KEYS)
  addName(out, g.character?.firstName, g.character?.lastName)
  if (Array.isArray(g.people)) for (const p of g.people) addName(out, p?.firstName, p?.lastName)
  const shard = readMet(g)
  for (const key of Object.keys(shard)) {
    const v = shard[key]
    if (v === undefined) continue
    if (isTomb(v)) addName(out, v[4], v[5])
    else addName(out, v.f, v.l)
  }
  return out
}

/** True when nobody holds the name (see takenNames). */
export function nameFree(g: NameBook, first: string, last: string): boolean {
  return !takenNames(g).has(nameKey(first, last))
}

/**
 * The name a promoted person takes: { first, last, k }. k = 0 is the latent name; the first free of nameDraw's alternates k = 1..7
 * comes next; k = 8 is the latent first name with the latent last name, a hyphen and a second last name of the home pool, walked from
 * a start the person's own key sets (as special/kit/rivals.ts walks its pool from a seeded start) until one is free. The walk visits
 * every last name of the pool once and so always ends; if none is free (not reachable under the caps of the Met store, 400 records) it
 * answers with the first candidate of the walk, so even then the answer is a pure function of the state. A candidate longer than the
 * 32 characters a Met record keeps is skipped (the longest last name of a pool is 15, so no pool reaches it).
 *
 * Pure: it reads g.character, g.people, g.world and g.lifeId and writes nothing, and it draws nothing. The same state and the same
 * `lat` give the same answer.
 */
export function resolveName(g: NameState, lat: LatentPerson): { first: string; last: string; k: number } {
  const taken = takenNames(g)
  const seed = worldSeed(g)
  for (let k = 0; k < HYPHEN_K; k++) {
    const name = k === 0 ? { first: lat.first, last: lat.last } : nameDraw(seed, lat.sid, k, lat.gender, lat.born, lat.country)
    if (!taken.has(nameKey(name.first, name.last))) return { first: name.first, last: name.last, k }
  }
  const pool = namePoolOf(lat.country).last
  const lasts = pool.length > 0 ? pool : ['Doe']
  const start = Math.floor(latentUnit(seed, lat.sid, HYPHEN_UNIT) * lasts.length)
  const own = lat.last.trim().toLowerCase()
  let fallback: string | null = null
  for (let j = 0; j < lasts.length; j++) {
    const second = lasts[(start + j) % lasts.length]!
    if (second.trim().toLowerCase() === own) continue
    const last = `${lat.last}-${second}`
    if (last.length > MET_LIMITS.lastMax) continue
    fallback ??= last
    if (!taken.has(nameKey(lat.first, last))) return { first: lat.first, last, k: HYPHEN_K }
  }
  return { first: lat.first, last: fallback ?? `${lat.last}-${lasts[start]!}`.slice(0, MET_LIMITS.lastMax), k: HYPHEN_K }
}
