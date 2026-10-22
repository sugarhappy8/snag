// R3-H2: the Knowledge test kit. Shared by the estimate tests here and by the Fog track's coverage cases.
//
// Mode. The whole suite runs in Exact (test/setup-exact.ts). A Fog test flips the mode for ONE call with inFog(fn) (or
// withInfoMode(m, fn)); it never calls setInfoMode, because the suite override beats the player's setting on purpose.
//
// Lives. know() hashes (lifeId, key, year, source), so ten thousand draws need ten thousand lifeIds. fogGame(i) is one cheap
// shallow copy of a real test game with its own lifeId, so a coverage run does not build ten thousand characters.
//
// R3-H6 adds the acceptance helpers: a rich life (richLife), a cheap reader that may keep a record (readerGame), test key kinds whose
// truths are a pure function of the key (registerTestKinds, testTruth), a step of the clock (nextYear) and the JSON size of a record.
import { hashKey, streamKey, streamUnit } from '../src/game/kernel/streams'
import { ruleOf } from '../src/game/knowledge/keys'
import { registerKeyKind } from '../src/game/knowledge/kinds'
import { withInfoMode } from '../src/game/knowledge/mode'
import type { Estimate } from '../src/game/knowledge/types'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

/** Run `fn` in Realistic mode (estimates, ranges and words), then put the earlier mode back. */
export function inFog<T>(fn: () => T): T {
  return withInfoMode('realistic', fn)
}

export interface FogOver {
  year?: number
  /** Special talents the character has (a game is built once per distinct list). */
  talents?: readonly string[]
}

const bases = new Map<string, GameState>()

function baseFor(talents: readonly string[]): GameState {
  const id = talents.join(',')
  let g = bases.get(id)
  if (!g) {
    g = makeTestGame(1, { talents: [...talents] })
    bases.set(id, g)
  }
  return g
}

/** Game number `i` of a family of lives: its own lifeId (so its own hashed draws), 2026 unless `year`. Shares sub-objects with a base game: read it, never write it. */
export function fogGame(i: number, over: FogOver = {}): GameState {
  const base = baseFor(over.talents ?? [])
  return { ...base, lifeId: `fog-life-${i}`, year: over.year ?? base.year }
}

/** The n-th value of a named stream of the test itself, in [0, 1): a stable way to spread truths without touching g.rng. */
export function unitAt(tag: string, n: number): number {
  return streamUnit(streamKey('knowledge-kit', tag, 0), n)
}

/** The share of `n` draws whose band holds the truth: `make(i)` gives the estimate and the truth it was read from. */
export function coverage(n: number, make: (i: number) => { est: Estimate; truth: number }): number {
  let hit = 0
  for (let i = 0; i < n; i++) {
    const { est, truth } = make(i)
    if (est.lo <= truth && truth <= est.hi) hit++
  }
  return hit / n
}

/** Freeze a value and everything under it, so a write throws at the line that made it. */
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

// ---------------------------------------------------------------------------------------------------------------------------------
// R3-H6: the acceptance helpers

export interface LifeOver {
  money?: number
  lifeId?: string
  year?: number
  age?: number
  seed?: number
  talents?: readonly string[]
  countryId?: string
}

/** A life of 40 (in 2026, in the US, with cash) built by makeTestGame; `lifeId` and `year` vary the hashed draws. A real life: write to it freely. */
export function richLife(over: LifeOver = {}): GameState {
  const g = makeTestGame(over.seed ?? 1, {
    age: over.age ?? 40,
    money: over.money ?? 5_000_000,
    ...(over.talents ? { talents: [...over.talents] } : {}),
    ...(over.countryId ? { countryId: over.countryId } : {}),
  })
  if (over.lifeId) g.lifeId = over.lifeId
  if (over.year) g.year = over.year
  return g
}

/**
 * A cheap game that can keep a research record: the shallow copy `base` with its own lifeId, its own flags bag and its own year
 * actions (so learn and takeReading never write into the base). Read everything else from it, write nothing else.
 */
export function readerGame(base: GameState, lifeId: string, year?: number): GameState {
  return { ...base, lifeId, flags: {}, yearActions: {}, ...(year !== undefined ? { year } : {}) }
}

/** One turn of the clock without the whole aging step: the year and the age move on, the year's actions reset. */
export function nextYear(g: GameState, years = 1): void {
  g.year += years
  g.character.age += years
  g.yearActions = {}
}

/** What a test kind reports as the truth of a key: a number on the scale of the key's unit, a pure function of the key and nothing else. */
export function testTruth(key: string): number {
  const u = ((hashKey(key) >>> 0) % 10_000) / 10_000
  switch (ruleOf(key)?.unit) {
    case 'score':
      return 15 + 75 * u
    case 'odds':
      return 0.05 + 0.9 * u
    case 'pct':
      return 0.02 + 0.5 * u
    case 'delta':
      return (u - 0.5) * 4e7
    default:
      return 1e6 * 10 ** (2.3 * u)
  }
}

/**
 * Register a key kind for each name, the way an owner (the Fog track) does at module load: a label, a truth that is a pure read
 * (testTruth) and a tier 1 scope in the US. The same call twice is fine (registerKeyKind accepts the same def).
 */
export function registerTestKinds(kinds: readonly string[], truth: (key: string) => number | null = testTruth): void {
  for (const kind of kinds) {
    registerKeyKind({
      kind,
      label: (_g, key) => `${kind} ${key.split(':')[1]}`,
      truth: (_g, key) => truth(key),
      scope: () => ({ tier: 1, country: 'us' }),
    })
  }
}

/** `n` keys of one shape: `shape(i)` for i from `from`. */
export function keyRange(n: number, shape: (i: number) => string, from = 0): string[] {
  return Array.from({ length: n }, (_, i) => shape(from + i))
}

/** A number as an id of fixed width, so keys sort and stay short. */
export const pad = (i: number, width = 3): string => String(i).padStart(width, '0')
