// R3-H2 (H.1): the noise of a reading. A pure function of (life, key, year, source): no generator, no state in the game.
//
// Six hashed uniform values are summed and scaled to unit variance (an Irwin-Hall draw, a close cousin of the normal with its
// tails cut at 4.24 sd). The same life, key, year and source always give the same number, so a repeat read in a year is the same
// read; another year or another source is another number. It reads no g.rng and no market state, so it can be asked from any
// menu, hint or tooltip without moving the sim (test/knowledge-estimate.test.ts holds knowledge/** to that).
import { streamKey, streamUnit } from '../kernel/streams'
import type { GameState } from '../types'

const MEMO_MAX = 512
/** A bounded cache of finished draws (the answer is the same with or without it). Oldest out first. */
const memo = new Map<string, number>()

/** The standard-normal-like draw of one reading: mean 0, variance 1, within +-4.25. */
export function zOf(g: Pick<GameState, 'lifeId'>, key: string, year: number, src: string): number {
  const name = streamKey(g.lifeId || 'life', 'know', year, `${key}|${src}`)
  const hit = memo.get(name)
  if (hit !== undefined) return hit
  let sum = 0
  for (let n = 0; n < 6; n++) sum += streamUnit(name, n)
  const z = (sum - 3) * Math.SQRT2
  if (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next()
    if (!oldest.done) memo.delete(oldest.value)
  }
  memo.set(name, z)
  return z
}
