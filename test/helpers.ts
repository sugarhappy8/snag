// Minimal game state for unit tests (does not depend on life.ts).
import { GAME_VERSION } from '../src/game/core'
import type { Character, GameState, MenuNode } from '../src/game/types'

/**
 * A company screen as one flat list. With the cockpits on (the default from v4.1.0) the screen is a short top plus tiles whose
 * ids start with `hub.`; each tile holds rows of the old flat list in the old order. This opens every tile in place, so a test
 * that looks for a row by its place in the list (or for its absence) reads the same list with the cockpits on or off.
 * Call it with the state the nodes were built from: a tile asks the latest state for its rows when it opens.
 */
export function openTiles(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && n.id.startsWith('hub.') ? n.children(g) : [n]))
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'player',
    firstName: 'Test',
    lastName: 'Player',
    gender: 'male',
    sexuality: 'straight',
    birthday: { month: 3, day: 14 },
    zodiac: 'Pisces',
    countryId: 'us',
    city: 'Chicago',
    birthCountryId: 'us',
    age: 0,
    alive: true,
    stats: { happiness: 80, health: 90, smarts: 60, looks: 60 },
    hidden: {
      karma: 50,
      craziness: 20,
      willpower: 50,
      discipline: 50,
      athleticism: 40,
      fertility: 70,
      fame: 0,
      notoriety: 0,
      religiousness: 30,
    },
    money: 0,
    avatar: { skinTone: 0, hair: 'brown', eyes: 'brown' },
    education: { current: null, degrees: [], completed: [], droppedOut: [], expelled: 0 },
    job: null,
    partTimeJob: null,
    careerHistory: [],
    retired: false,
    pension: 0,
    conditions: [],
    licenses: [],
    criminalRecord: [],
    prison: null,
    wantedLevel: 0,
    residence: { status: 'parents' },
    loans: [],
    social: null,
    talent: null,
    memories: [],
    willBeneficiaries: [],
    religion: null,
    ...overrides,
  }
}

/** A deterministic game state with just the player (no family). */
export function makeTestGame(seed = 1, character: Partial<Character> = {}): GameState {
  return {
    version: GAME_VERSION,
    lifeId: 'test-life',
    rng: seed,
    nextId: 0,
    year: 2026,
    generation: 1,
    character: makeCharacter(character),
    people: [],
    assets: [],
    log: [{ age: character.age ?? 0, year: 2026, entries: [] }],
    queue: [],
    ancestors: [],
    counters: {},
    yearActions: {},
    flags: {},
    ribbon: null,
    obituary: null,
  }
}
