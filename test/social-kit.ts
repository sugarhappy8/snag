// R4-E7 (X6): the kit that builds a stamped game. A life is stamped when the build key `social` is on at createNewLife (X6); a test
// that wants the social track on a small, hand-made game asks for one here, and a test that wants the real path of the stamp asks for
// a life made with the key on.
//
//   socialGame(seed?, over?)   makeTestGame(seed, over) plus stampSocial: the world shard `social` { v: 1, on: 1, y, fy } for the game's
//                              year. Nothing else is drawn or written (g.rng is still the seed, g.nextId is 0), so a test that
//                              builds a cast with createPerson (every field given) keeps its dice. The relationship hook is bound,
//                              because the kit imports the step file, which imports the mirror for its effect.
//   socialLife(opts?)          createNewLife with the key on, the way a stamped life is really made (the stamp is written by the
//                              last statement of createNewLife). The flag is put back whatever happens.
//   cast(g, relationship, relation?, over?)   one person with every field given, so building them draws nothing
//
// No dice and no dollars of its own.
import { withFlags } from '../src/game/flags'
import { createNewLife, type NewLifeOptions } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { Character, GameState, Person, RelationKind } from '../src/game/types'
import '../src/game/world/edge-step'
import { stampSocial } from '../src/game/world/social'
import { makeTestGame } from './helpers'

/** A test game with the stamp. `over` is the player (the default is makeTestGame's). */
export function socialGame(seed = 1, over: Partial<Character> = {}): GameState {
  const g = makeTestGame(seed, over)
  stampSocial(g)
  return g
}

/** A new life made with the build key `social` on: stamped by createNewLife itself. */
export function socialLife(opts: NewLifeOptions = {}): GameState {
  return withFlags({ social: true }, () => createNewLife(opts))
}

/** One person of the cast: every field given, so g.rng does not move. */
export function cast(g: GameState, relationship: number, relation: RelationKind = 'friend', over: Partial<Parameters<typeof createPerson>[1]> = {}): Person {
  const pet = relation === 'pet'
  return createPerson(g, {
    relation,
    age: 30,
    gender: g.nextId % 2 === 0 ? 'female' : 'male',
    firstName: `Kin${g.nextId}`,
    lastName: 'Test',
    relationship,
    occupation: pet ? 'Pet' : 'Clerk',
    traits: pet ? ['calm'] : ['kind', 'calm'],
    stats: { happiness: 60, health: 70, smarts: 50, looks: 50 },
    money: 0,
    livesWithPlayer: false,
    ...(pet ? { species: 'Dog' } : {}),
    ...over,
  })
}
