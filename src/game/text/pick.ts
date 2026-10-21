// Text kit pick (R1-T1, E.T1): pick() that remembers. It draws exactly once from g.rng, like pick(), and with
// an empty memory returns what pick() returns, so a life that adopts it later does not change on day one.
// Nothing in the game calls it yet (the codemod is E.T3, in R2).
import { rand } from '../rng'
import type { GameState } from '../types'
import { poolHash } from './hash'
import { TEXT_MEM_LIMITS, isMemKey, noteFamily, recallPool, rememberPool, writableTextMem, type PoolRecall } from './memory'
import { linesId } from './registry'

/**
 * Pure core of the exclusion rule: the indexes pickLine may choose from, never empty for n >= 1.
 * Pools of 12 or fewer are shuffle-bags: the lines not yet used this cycle, and once every line was used,
 * every line but the last one dealt (so a new cycle never starts on the last line of the old one).
 * Larger pools exclude the last min(8, floor(n / 2)) picks. A null or mismatched recall is an empty memory.
 */
export function candidateIndexes(n: number, recall: PoolRecall | null): number[] {
  const all = Array.from({ length: n }, (_, i) => i)
  if (!recall || n < 2) return all
  if (n <= TEXT_MEM_LIMITS.bag) {
    if (recall.kind !== 'bag') return all
    const used = recall.used & ((1 << n) - 1)
    const unused = all.filter((i) => (used & (1 << i)) === 0)
    if (unused.length) return unused
    const rest = all.filter((i) => i !== recall.last)
    return rest.length ? rest : all
  }
  if (recall.kind !== 'window') return all
  const k = Math.min(TEXT_MEM_LIMITS.recent, n >> 1)
  const banned = new Set(recall.recent.filter((i) => i >= 0 && i < n).slice(-k))
  const allowed = all.filter((i) => !banned.has(i))
  return allowed.length ? allowed : all
}

/** The memory key of a pool and whether it names a family: the valid fam, else the registered id, else the hash of the lines. */
function poolKey(lines: readonly string[], fam: string | undefined): { key: string; named: boolean } {
  if (isMemKey(fam)) return { key: fam, named: true }
  const id = linesId(lines)
  if (isMemKey(id)) return { key: id, named: true }
  return { key: poolHash(lines), named: false }
}

/**
 * Like pick(g, lines): exactly one rand(g) draw, and with an empty memory the same result.
 * Pools of 12 or fewer are shuffle-bags (no line twice before every line was used; a new cycle never starts on the last line of the old one).
 * Larger pools exclude the last min(8, floor(n / 2)) picks.
 * `fam` (letters, digits, _ . : -, at most 48 characters, starting with a letter) names the pool and the family; without it the pool's registered id, else poolHash(lines).
 * A named pool also notes the family (noteFamily). A pool of one line returns it after the draw and stores nothing.
 */
export function pickLine(g: GameState, lines: readonly string[], fam?: string): string {
  const n = lines.length
  if (n === 0) throw new Error('pickLine() from empty list')
  // The one and only draw, before anything else, so a later exception cannot change the draw count.
  const r = rand(g)
  if (n === 1) return lines[0]
  const { key, named } = poolKey(lines, fam)
  const mem = writableTextMem(g)
  const allowed = candidateIndexes(n, recallPool(mem, key, n))
  const index = allowed[Math.floor(r * allowed.length)]
  rememberPool(mem, key, n, index)
  if (named) noteFamily(g, key)
  return lines[index]
}
