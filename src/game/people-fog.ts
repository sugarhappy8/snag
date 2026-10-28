// R4-U2 (People UI and fog track, H.7): the Knowledge half of the person profile. A person can be read, sharpened by time and bought.
// Nothing here is a screen: U3 (the facts builder), U4 (the profile) and U5 (the action rows and Look closer) call these helpers.
//
//   peopleFog()      the flag `peopleProfile` and Realistic mode: the one switch of the whole track. Exact is today, byte for byte.
//   usesProfile(p)   peopleFog() for a living person who is not a pet: the eager gate of the profile (the profile itself is a lazy chunk)
//   exposureOf(p)    how much of a person the player has seen, 0 to 1, a pure number from yearsKnown, relationship and living together.
//                    Nothing is saved: an heir gets the exposure the re-rolled relationships earn. Knowledge's `exp` option turns it into
//                    a narrower passive band (x(1 - .4 exposure)).
//   isClose(p)       relationship 35 or more, or living with you: the gate of cash and of an NPC's career detail
//   traitsShown(p)   the first trait word at exposure .30, the second at .60, the rest unknown
//   pplKey, readPerson, lookKeysOf   the keys `ppl:<personKey>:<field>`, the estimate of one number, the keys Look closer offers
//
// The `ppl` key kind is registered here: a label, the truth of a number by the person's key, a tier 1 scope in the person's country (the
// private investigator's fee follows the country and never the cash) and `gone`, true when nobody has that key any more, so the yearly
// knowledge step forgets what was researched about a person who left. Net worth has no truth here: npcWorth lives in npc-lives.ts, which
// imports this file, so the worth row is a passive read at the call site and is not for sale. A Met-only record has no profile until R6
// materializes it; the kind reads the Persons of `g.people` only.
//
// Rules: no draw and no write (the noise of an estimate is a hashed draw of life, key, year and source in knowledge/normal.ts); every
// reader is total; a key the contract refuses reads as null, never as the exact number; this is the only file besides business/leader-fog.ts
// that passes `exp:` to know() (test/knowledge-unwired.test.ts). Layer: a root file of domain life, so it reaches knowledge only through
// knowledge/contract.ts and imports no other domain.
import { flagOn } from './flags'
import { personKey } from './kernel/person-ref'
import { isExact, know, parseKey, registerKeyKind, type Estimate } from './knowledge/contract'
import { npcLife, type NpcLife } from './npc-state'
import type { GameState, Person } from './types'

/** The ceilings of the track. `forgetPerStep` is the same 12 as knowledge/module.ts FORGET_ROWS (a test holds both). */
export const PEOPLE_CAPS = Object.freeze({ lookKeys: 5, personality: 6, connections: 6, memories: 3, forgetPerStep: 12 } as const)

const EPS = 1e-9
/** The exposure at which the first and the second trait word are named. */
const TRAIT_FIRST = 0.3
const TRAIT_SECOND = 0.6
/** A trait word on a profile is a word; a hostile record cannot print a page. */
const TRAIT_CHARS = 40
/** A purse the fog can read: past this a number is a rumour (the NPC life caps its money at the same figure). */
const MONEY_MAX = 1e15

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** `v / per` held to 0..1; a number that is not finite counts as 0. */
const share = (v: unknown, per: number): number => (finite(v) ? Math.min(1, Math.max(0, v / per)) : 0)

/** The profile exists: the build flag is on and the player reads estimates (Realistic). Exact and a flag-off life show today's sheet. */
export function peopleFog(): boolean {
  return flagOn('peopleProfile') && !isExact()
}

/** The one gate of the profile: peopleFog(), for a living person who is not a pet. */
export function usesProfile(p: Pick<Person, 'alive' | 'relation'>): boolean {
  return peopleFog() && p.alive === true && p.relation !== 'pet'
}

/**
 * How much of this person the player has seen, 0 to 1: `min(1, 0.1 + 0.6 [lives with you] + 0.4 min(1, yearsKnown / 8) + 0.3
 * relationship / 100)`. Total (a term that is not a finite number counts as 0), monotone in each input, and never above 1.
 */
export function exposureOf(p: Pick<Person, 'yearsKnown' | 'relationship' | 'livesWithPlayer'>): number {
  const e = 0.1 + (p.livesWithPlayer === true ? 0.6 : 0) + 0.4 * share(p.yearsKnown, 8) + 0.3 * share(p.relationship, 100)
  return Math.min(1, e)
}

/** Close enough to know their purse and their career: relationship 35 or more, or living with you. */
export function isClose(p: Pick<Person, 'relationship' | 'livesWithPlayer'>): boolean {
  return (typeof p.relationship === 'number' && p.relationship >= 35) || p.livesWithPlayer === true
}

/** The trait words the player may read, in array order (the first at exposure .30, the second at .60), and how many stay unknown. */
export function traitsShown(p: Pick<Person, 'traits' | 'yearsKnown' | 'relationship' | 'livesWithPlayer'>): { shown: string[]; hidden: number } {
  const words = Array.isArray(p.traits) ? p.traits.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : []
  const e = exposureOf(p)
  const named = e >= TRAIT_SECOND - EPS ? 2 : e >= TRAIT_FIRST - EPS ? 1 : 0
  const shown = words.slice(0, named).map((w) => w.slice(0, TRAIT_CHARS))
  return { shown, hidden: words.length - shown.length }
}

/**
 * The Knowledge key of one number of a person: `ppl:<personKey>:<field>`. Null when the contract refuses it (an id with a space, a
 * sixty character id, a field with a colon), so a person like that reads as unknown and never as exact.
 */
export function pplKey(p: Pick<Person, 'id' | 'data'>, field: string): string | null {
  const id: unknown = personKey(p)
  if (typeof id !== 'string' || typeof field !== 'string') return null
  const key = `ppl:${id}:${field}`
  const parsed = parseKey(key)
  return parsed !== null && parsed.kind === 'ppl' && parsed.field === field && parsed.ids.join(':') === id ? key : null
}

/**
 * What the player may read of one number of a person: the estimate of `truth` for `ppl:<key>:<field>` at this person's exposure. Null
 * when the key is refused or the truth is not a number, never the truth. A money truth of 0 or less has no log scale (estimate would
 * answer exact), so cash and worth are read as at least 1: a broke person reads as a band around nothing and never as an exact 0.
 */
export function readPerson(g: GameState, p: Person, field: string, truth: number): Estimate | null {
  const key = pplKey(p, field)
  if (key === null || !finite(truth)) return null
  return know(g, key, field === 'cash' || field === 'worth' ? Math.min(MONEY_MAX, Math.max(1, truth)) : truth, { exp: exposureOf(p) })
}

/** The NPC life of a person, or null (a very old save can hold a person with no `data`). */
function lifeOf(p: Person): NpcLife | null {
  try {
    return p.data ? npcLife(p) : null
  } catch {
    return null
  }
}

/** The keys Look closer offers for a person: smarts, health, happiness, cash, then skill when they have an NPC life. [] unless peopleFog(). */
export function lookKeysOf(_g: GameState, p: Person): string[] {
  if (!peopleFog()) return []
  const fields = lifeOf(p) !== null ? ['smarts', 'health', 'happiness', 'cash', 'skill'] : ['smarts', 'health', 'happiness', 'cash']
  const keys: string[] = []
  for (const field of fields) {
    const key = pplKey(p, field)
    if (key !== null) keys.push(key)
  }
  return keys.slice(0, PEOPLE_CAPS.lookKeys)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The owner of the ppl keys

const STATS: ReadonlySet<string> = new Set(['looks', 'health', 'happiness', 'smarts'])
const WORDS: Readonly<Record<string, string>> = Object.freeze({ looks: 'looks', health: 'health', happiness: 'mood', smarts: 'smarts', cash: 'cash', skill: 'skill', worth: 'net worth', ambition: 'ambition' })

/** The person a key names, by personKey, among the Persons of `g.people`; null for none. Total over a hostile list. */
function personOfKey(g: GameState, key: string): { p: Person | null; field: string } | null {
  const parsed = parseKey(key)
  if (parsed === null || parsed.kind !== 'ppl') return null
  const id = parsed.ids.join(':')
  const people: unknown = g.people
  if (!Array.isArray(people)) return { p: null, field: parsed.field }
  for (const row of people as unknown[]) {
    if (typeof row !== 'object' || row === null) continue
    try {
      if (personKey(row as Person) === id) return { p: row as Person, field: parsed.field }
    } catch {
      // a row with no id is nobody
    }
  }
  return { p: null, field: parsed.field }
}

/** The true value of a number of a person, or null when there is nothing to read or it is not for sale. A pure read of this year's state. */
function truthOf(g: GameState, key: string): number | null {
  const found = personOfKey(g, key)
  if (found === null || found.p === null) return null
  const { p, field } = found
  if (field === 'worth') return null
  if (field === 'cash') return finite(p.money) ? Math.min(MONEY_MAX, Math.max(1, p.money)) : null
  if (field === 'skill') return lifeOf(p)?.skill ?? null
  const bag: unknown = STATS.has(field) ? p.stats : p.data
  if (typeof bag !== 'object' || bag === null || !hasOwn(bag, field)) return null
  const v = (bag as Record<string, unknown>)[field]
  return finite(v) && (STATS.has(field) || (v >= 0 && v <= 100)) ? Math.min(100, Math.max(0, v)) : null
}

registerKeyKind({
  kind: 'ppl',
  label: (g, key) => {
    const found = personOfKey(g, key)
    if (found === null) return key
    const name = found.p !== null && typeof found.p.firstName === 'string' && found.p.firstName.trim() !== '' ? found.p.firstName.trim() : 'Someone'
    return `${name}'s ${hasOwn(WORDS, found.field) ? WORDS[found.field] : found.field}`.slice(0, 60)
  },
  truth: truthOf,
  // The private investigator's fee follows the scope and the country, never the buyer's cash. The country is the person's own when
  // they live abroad (the rule of personCountry in events/wealth-core.ts, copied: that file is another domain).
  scope: (g, key) => {
    const cid = personOfKey(g, key)?.p?.data?.countryId
    return { tier: 1, country: typeof cid === 'string' && cid !== '' ? cid : g.character.countryId }
  },
  // True when no person has the key. A life whose book cannot be read forgets nothing.
  gone: (g, key) => {
    if (!Array.isArray(g.people)) return false
    const found = personOfKey(g, key)
    return found === null || found.p === null
  },
})
