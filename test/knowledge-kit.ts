// R3-H2: the Knowledge test kit. Shared by the estimate tests here and by the Fog track's coverage cases.
//
// Mode. The whole suite runs in Exact (test/setup-exact.ts). A Fog test flips the mode for ONE call with inFog(fn) (or
// withInfoMode(m, fn)); it never calls setInfoMode, because the suite override beats the player's setting on purpose.
//
// Lives. know() hashes (lifeId, key, year, source), so ten thousand draws need ten thousand lifeIds. fogGame(i) is one cheap
// shallow copy of a real test game with its own lifeId, so a coverage run does not build ten thousand characters.
import { streamKey, streamUnit } from '../src/game/kernel/streams'
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
