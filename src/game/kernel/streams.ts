// Named streams (R2, design 13.3): the only source of luck a world module may use.
//
// A stream is a pure function of the family, a tag, a year and an entity id. It keeps no state in the game: two calls with the
// same arguments return two generators that give the same sequence, and neither reads or writes g.rng, g.nextId or a flag. So
// one extra draw on one stream cannot move any other stream, and a replay, a reload and a Time Machine fork see the same luck.
//
//   stream(g, 'econ', year, 'us')         luck of one country in one year, shared by every heir of the family
//   outcomeStream(g, 'wars', year, id)    the same, but a jump to the past re-rolls the year it lands in (outcomeTag)
//   textUnit(g, year, n)                  the n-th value of the life's text stream (the cursor lives in text/draw.ts)
//
// One tag per module, the id is the entity (see docs/STREAMS.md). The kernel is a leaf (L0): it imports nextRandom from rng,
// types, and other kernel files, and test/world-streams.test.ts holds it to that.
import { nextRandom } from '../rng'
import type { GameState } from '../types'
import { outcomeTag } from './forks'

/** What a stream tag looks like: a lower case word, then letters, digits, dots, underscores and dashes, 32 at most. */
export const STREAM_TAG = /^[a-z][a-z0-9._-]{0,31}$/

/** Separates the parts of a stream key. */
const SEP = '\u001f'

/** (lifeId || 'life') without its generation suffix: heirs share it (the familySeed of special/kit/rivals.ts). */
export function worldSeed(g: Pick<GameState, 'lifeId'>): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

/** FNV-1a over the UTF-16 code units of `key`, as an int32: the same hash assets.ts uses for seeded(key). */
export function hashKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/** The name of a stream: seed, tag, year and id joined with U+001F. An absent id reads as an empty one. */
export function streamKey(seed: string, tag: string, year: number, id?: string | number): string {
  return [seed, tag, String(year), id === undefined ? '' : String(id)].join(SEP)
}

/**
 * The generator of one stream: values in [0, 1), the same for the same arguments. The seed is the hash of the key, and one
 * warm-up output is dropped because the first output of nearby seeds correlates (cv.ts unit() drops one for the same reason).
 */
export function stream(g: Pick<GameState, 'lifeId'>, tag: string, year: number, id?: string | number): () => number {
  if (!STREAM_TAG.test(tag)) throw new Error('stream: bad tag')
  let state = nextRandom(hashKey(streamKey(worldSeed(g), tag, year, id)))[1]
  return () => {
    const [value, next] = nextRandom(state)
    state = next
    return value
  }
}

/**
 * stream() for a roll whose result only shows once `year` is over: the Time Machine's outcome tag is added to the id, so a jump
 * back to `year` re-rolls it, and every year that ended before the jump keeps its luck. With no fork it equals
 * stream(g, tag, year, id ?? '').
 */
export function outcomeStream(g: Pick<GameState, 'lifeId' | 'flags'>, tag: string, year: number, id?: string | number): () => number {
  return stream(g, tag, year, String(id ?? '') + outcomeTag(g, year))
}

/** The n-th value of the stream named by `key`, in [0, 1). Pure: the same key and n always give the same number. */
export function streamUnit(key: string, n: number): number {
  const state = nextRandom(hashKey(key + SEP + n))[1]
  return nextRandom(state)[0]
}

/**
 * The name of a life's text stream for `year`: the life id (not the family, so each generation has its own text luck) with the
 * outcome tag (so a Time Machine jump re-rolls the year it lands in and the years after it).
 */
export function textStreamKey(g: Pick<GameState, 'lifeId' | 'flags'>, year: number): string {
  return streamKey((g.lifeId || 'life') + outcomeTag(g, year), 'text', year)
}

/** The n-th value of the text stream of `year`. Which n is next lives in text/draw.ts (a cursor in flags.textMem). */
export function textUnit(g: Pick<GameState, 'lifeId' | 'flags'>, year: number, n: number): number {
  return streamUnit(textStreamKey(g, year), n)
}
