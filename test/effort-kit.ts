// R3-E7 (C.1): the purity kit. R3 research has one rule that no type can state: a read never rolls. `quote` (the odds of a task)
// takes no roll and draws nothing, the why lines, the menus and the Profile row are views of a state that never move it, and a
// read of a frozen state is bounded. R3-E9 proves that on every read of the effort engine with these four tools, built before any
// caller exists:
//
//   trapRng(g)         the state with a g.rng that throws on a read and on a write, so a function that draws from the life's
//                      random stream (rand, randInt, chance, pick and the rest of src/game/rng.ts) fails at the offending line
//   frozenGame(seed)   a test game (makeTestGame) frozen all the way down, like the store treats a committed state (deepFreeze of
//                      test/fuzz-kit.ts), with that trap: a read that writes a field throws a TypeError, one that draws throws
//                      an RngTrapError
//   uTrap(input)       the same input with a `u` property (the roll) whose getter throws, so a quote that reads the roll fails
//   roundSig(x)        the 9 significant digit cut every fixture and golden of this repo uses (Mac and Linux differ in the last bit)
//
// Both traps are non-enumerable accessors on purpose. A spread, a structuredClone, JSON.stringify, Object.keys and Object.values
// of the state do not read the trap, so a read that copies the state to look at it is not a failure; only a direct read of
// `g.rng` (or `input.u`) is, which is the thing the proof is about. Two things follow, and the tests pin both: a clone of a
// trapped state is a plain state with no trap and no rng (set `clone.rng` before a draw from it), and the trap sits where
// deepFreeze never looks, so a frozen game can carry it. A named stream (src/game/kernel/streams.ts) reads the life id and
// writes nothing, so it draws freely under both tools: it is the way a world module gets luck without g.rng.
//
// The tools draw no random number and book no dollar. The parity oracle and its grid are R3-M0's (test/effort-parity-kit.ts).
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import type { Character, GameState } from '../src/game/types'

/** What roundSig keeps: the same count of significant digits as GOLDEN_DIGITS, PARITY_DIGITS and FLOAT_DIGITS. */
export const ROUND_DIGITS = 9

/** Thrown by a trapped g.rng: a function that should be pure drew from (or wrote) the life's random stream. */
export class RngTrapError extends Error {
  constructor(kind: 'read' | 'write') {
    super(`g.rng was ${kind === 'read' ? 'read' : 'written'} in a read that must not draw (use a named stream or a hashed draw, never g.rng)`)
    this.name = 'RngTrapError'
  }
}

/** Thrown by a trapped `u`: a quote read the roll, which it must never see (it is odds, the roll belongs to resolve). */
export class UTrapError extends Error {
  constructor(kind: 'read' | 'write') {
    super(`the roll u was ${kind === 'read' ? 'read' : 'written'}: a quote is odds only and never touches the roll`)
    this.name = 'UTrapError'
  }
}

const rngGet = (): never => {
  throw new RngTrapError('read')
}
const rngSet = (): never => {
  throw new RngTrapError('write')
}
const uGet = (): never => {
  throw new UTrapError('read')
}
const uSet = (): never => {
  throw new UTrapError('write')
}

/**
 * The same state with a g.rng whose read and write throw an RngTrapError. It changes `g` in place and returns it, so call it on
 * a state that is not frozen yet (frozenGame does, then freezes); a state that is already trapped is returned as it is, frozen
 * or not. The value g.rng held is gone: nothing may read it.
 */
export function trapRng<T extends { rng: number }>(g: T): T {
  if (Object.getOwnPropertyDescriptor(g, 'rng')?.get === rngGet) return g
  Object.defineProperty(g, 'rng', { get: rngGet, set: rngSet, enumerable: false, configurable: true })
  return g
}

/**
 * A test game (`makeTestGame(seed, character)`) frozen all the way down with g.rng trapped. Any read of it that writes a field
 * throws a TypeError, any that draws throws an RngTrapError. The seed is the value g.rng would have held, which nothing can
 * read: it is kept so the call reads like makeTestGame's.
 */
export function frozenGame(seed = 1, character: Partial<Character> = {}): GameState {
  return deepFreeze(trapRng(makeTestGame(seed, character)))
}

/**
 * The input with a `u` whose read and write throw a UTrapError. It returns a copy and leaves `input` alone; a `u` the input
 * already had is replaced. `u` is not enumerable, so a spread, Object.keys or JSON.stringify of the copy is not a read of it.
 */
export function uTrap<T extends object>(input: T): T {
  const out = { ...input }
  Object.defineProperty(out, 'u', { get: uGet, set: uSet, enumerable: false, configurable: false })
  return out
}

/**
 * x cut to `digits` (9) significant digits when it is a finite number that is not an integer; an integer and a non-finite number
 * stay as they are, and -0 is written 0 (the JSON a fixture is read from has no -0). Rounding twice is rounding once.
 */
export function roundSig(x: number, digits = ROUND_DIGITS): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return x === 0 ? 0 : x
  return Number(x.toPrecision(digits))
}
