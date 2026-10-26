// R4-L4: the kit of the kin tests. A kin record is the Met record behind an NPC wedding or baby on a stamped life (src/game/kin.ts).
//
//   kinGame(n, married?, over?)   socialGame(n) (E7's stamped game, g.rng still the seed) plus `married` siblings who are married by the legacy
//                                 fields only (`married` true and a `spouseName`): no record, no link, no edge yet. Each is built with every
//                                 field given, so g.rng does not move and g.nextId moves by one a sibling. Ages 30 and up, so the NPC
//                                 marriage and baby rolls of familyLifeCycle (age 20 to 55, baby 44 or younger) are all possible.
//   married(g, p, name?)          the legacy marriage writers (markMarried, the kid weddings): `married` true and a `spouseName`
//   withLife(p)                   gives the person an NpcLife (what yearlyNpcLife makes the first year), so a history line has a home and
//                                 the hand-over keeps them as a known contact
//   kinSidsOf(g)                  the sids of the kin records in the Met shard, sorted
//   kinEdgesOf(g)                 the edges of the map that touch a kin sid, as 'key => k', sorted
//
// No dice and no dollars of its own.
import type { GameState, Person } from '../src/game/types'
import { readEdge } from '../src/game/world/edges'
import { readWorld } from '../src/game/world/state'
import { isTomb, readMet } from '../src/game/world/met'
import { cast, socialGame } from './social-kit'

/** Spouse names of the cast, the last with a long surname as in the plan ('Juan Carlos de Cuba' splits at the first space). */
export const SPOUSE_NAMES: readonly string[] = ['Ana Ruiz', 'Mateo Okafor', 'Ingrid Lindqvist', 'Rashid Haddad', 'Bao Tran', 'Odalys Navarro', 'Juan Carlos de Cuba', 'Lena Fischer']

const FIRSTS = ['Sol', 'Dani', 'Noor', 'Kai', 'Mira', 'Tomas', 'Yara', 'Eli']

/** The legacy writers of a wedding: the two fields the NPC code reads (nepo-asks, npc-lives, relationships). */
export function married(g: GameState, p: Person, name: string = SPOUSE_NAMES[g.nextId % SPOUSE_NAMES.length]!): Person {
  p.data.married = true
  p.data.spouseName = name
  return p
}

/** An NpcLife with an empty history, the shape npc-state.ts reads. */
export function withLife(p: Person): Person {
  p.data.life = { v: 1, lastYear: 2026, country: 'us', field: 'Business', education: 0, study: 0, skill: 30, experience: 10, income: 0, debt: 0, investments: 0, housing: 0, ambition: 50, employer: '', history: [], achievements: [], housingQuality: 50 } as never
  return p
}

/** A stamped game with `count` married siblings (30, 31, ...), each with a spouse name and no record yet. */
export function kinGame(n = 1, count = 3, over: Parameters<typeof socialGame>[1] = {}): GameState {
  const g = socialGame(n, { age: 40, ...over })
  for (let i = 0; i < count; i++) {
    const sib = cast(g, 60, 'sibling', {
      age: 30 + i,
      gender: i % 2 === 0 ? 'female' : 'male',
      firstName: FIRSTS[i % FIRSTS.length]!,
      lastName: g.character.lastName,
    })
    married(g, sib, SPOUSE_NAMES[i % SPOUSE_NAMES.length]!)
  }
  return g
}

/** The sids of the kin records in the Met shard (records, not tombstones), sorted. */
export function kinSidsOf(g: GameState): string[] {
  const shard = readMet(g)
  return Object.keys(shard)
    .filter((k) => k.startsWith('kin.') && !isTomb(shard[k]))
    .sort()
}

/** The edges that end or start at a kin sid, as 'key => kind' (a link kind or '-'), sorted. */
export function kinEdgesOf(g: GameState): string[] {
  const edges = (readWorld(g).edges ?? {}) as Record<string, { k?: string }>
  return Object.keys(edges)
    .filter((k) => k.includes('person:kin.'))
    .map((k) => `${k} => ${edges[k]!.k ?? '-'}`)
    .sort()
}

/** The edge between two entity refs in a direction, or null: a thin alias so tests read like the plan. */
export const edgeBetween = readEdge
