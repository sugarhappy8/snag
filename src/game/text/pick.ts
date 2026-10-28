// Text kit pick (R1-T1, E.T1): pick() that remembers. Until R2-B2 it drew once from g.rng, like pick(), and with an empty
// memory returned what pick() returned, so a life that adopted it later did not change on day one.
// R2-A2 added pickSite (a pool named by a numeric site key, for pools whose lines carry ${} holes), made both generic over
// the element type, and added a hook that a test can use to turn the kit into plain pick or into a rotation, so that a
// converted string that flows into state shows itself. The game never sets the hook.
// R2-B2 (the rebaseline) moves the draw off g.rng onto the text stream (text/draw.ts): a pool of one line draws nothing, a
// longer pool takes one step of the text cursor, and g.rng is never touched.
import type { GameState } from '../types'
import { textRand } from './draw'
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
 * How a call of the kit behaves. `memory` is the game: the exclusion rule and the memory. The other two exist for tests (a hook,
 * see setPickHook): `plain` returns the line the text draw points at, reads and writes no memory; `rotate` returns the line after
 * that one, also without memory. All three take the same one text draw, so they leave the cursor, and g.rng, where the game would.
 */
export type PickMode = 'memory' | 'plain' | 'rotate'

/** What the hook is told about a call of two or more lines: its number since the hook was set, the memory key and the size. */
export interface PickCall {
  index: number
  key: string
  n: number
}

type PickHook = (call: PickCall) => PickMode | undefined

let hook: PickHook | null = null
let calls = 0

/** Sets the hook (null removes it) and starts counting calls from 0. Test code only; the game never sets one. */
export function setPickHook(next: PickHook | null): void {
  hook = next
  calls = 0
}

/**
 * Runs `fn` with every call of two or more lines in `mode`, then puts back the hook that was set before and its counter, also when
 * `fn` throws. Calls inside `fn` count from 0.
 */
export function withPickMode<T>(mode: PickMode, fn: () => T): T {
  const outer = hook
  const outerCalls = calls
  setPickHook(() => mode)
  try {
    return fn()
  } finally {
    hook = outer
    calls = outerCalls
  }
}

/**
 * The one core of pickLine and pickSite. A pool of one line has no choice to make: it returns before anything is drawn, asked or
 * stored (D3), so a list that an era filter cut down to one line does not move the text cursor. Otherwise the draw (one step of the
 * text stream) comes first, so an exception after it cannot change the draw count. `where` is lazy: a pool of one line never pays
 * for its key. Pools of 12 or fewer are shuffle-bags, larger ones exclude their recent picks (candidateIndexes).
 */
function choose<T>(g: GameState, lines: readonly T[], name: string, where: () => { key: string; named: boolean }): T {
  const n = lines.length
  if (n === 0) throw new Error(`${name}() from empty list`)
  if (n === 1) return lines[0]
  const r = textRand(g)
  const { key, named } = where()
  const mode = hook ? (hook({ index: calls++, key, n }) ?? 'memory') : 'memory'
  if (mode === 'plain') return lines[Math.floor(r * n)]
  if (mode === 'rotate') return lines[(Math.floor(r * n) + 1) % n]
  const mem = writableTextMem(g)
  const allowed = candidateIndexes(n, recallPool(mem, key, n))
  const index = allowed[Math.floor(r * allowed.length)]
  rememberPool(mem, key, n, index)
  if (named) noteFamily(g, key)
  return lines[index]
}

/**
 * Like pick(g, lines), but on the text stream and with a memory: one text draw for a pool of two or more lines (none for one line),
 * no g.rng draw.
 * Pools of 12 or fewer are shuffle-bags (no line twice before every line was used; a new cycle never starts on the last line of the old one).
 * Larger pools exclude the last min(8, floor(n / 2)) picks.
 * `fam` (letters, digits, _ . : -, at most 48 characters, starting with a letter) names the pool and the family; without it the pool's registered id, else poolHash(lines).
 * A named pool also notes the family (noteFamily). A pool of one line returns it, draws nothing and stores nothing.
 * Generic over the element type, like pick, so a converted site keeps its type: string for an inline pool, the literal union for
 * an `as const` pool. The `& readonly string[]` half only restricts the argument; T comes from the first half.
 */
export function pickLine<T>(g: GameState, lines: readonly T[] & readonly string[], fam?: string): T {
  return choose<T>(g, lines, 'pickLine', () => poolKey(lines, fam))
}

/**
 * pickLine for a pool whose lines carry ${} holes (the codemod writes `site`, a number it derives from the file and the array text).
 * Such a pool has new text for every value of its holes, so hashing the lines would write one throwaway pool per call into the
 * 300-pool memory. The site is the memory key: 's' + 8 hex digits. It never notes a family (a number is not a family name, and
 * the 160-family memory is the composer's). A site that is not an integer in 0..0xffffffff falls back to the hash of the lines.
 * One text draw, like pickLine.
 */
export function pickSite<T>(g: GameState, lines: readonly T[] & readonly string[], site: number): T {
  return choose<T>(g, lines, 'pickSite', () =>
    Number.isInteger(site) && site >= 0 && site <= 0xffffffff ? { key: 's' + site.toString(16).padStart(8, '0'), named: false } : { key: poolHash(lines), named: false },
  )
}
