// R2-A3 (D7 layer 2): mutation testing for text sinks. The same life is played three times: with the text kit forced to behave as
// plain pick, with it forced to return the line after the one pick would return, and as the game plays it (the memory). The
// first two draw exactly what the third draws, so g.rng and every non-text slice must be identical in all three. If a converted
// pool's line flows into state (a name on a Person, a title on an Asset, a flag, a branch), rotating it shows on the first call
// of that pool, not only when the memory happens to exclude a line.
//
//   R2_PARITY_ATTRIBUTE=1   after a failure, delta-debug the offending pools (bisectOffenders) and print them with their callers.
//   R2_PARITY_FULL=1        all 12 lives instead of six.
//
// Two properties to know when reading a failure. `rotate` also flags a pool that a life calls only once (its first call on an
// empty memory equals pick, so the memory would not differ), which is conservative and costs nothing to revert. And the founder
// lives never reach addFlavorLines or the popups (probeLife answers nothing), so a sink only the popups reach is tested by the
// birth lives alone.
//
// R2-B2 appends the extra-draw block to this file.
import { describe, expect, it } from 'vitest'
import { withPickMode } from '../src/game/text/pick'
import { PARITY_LIVES, PARITY_SLICES, bisectOffenders, traceLife, traceMoves, type Divergence, type ParityLife, type ParityTrace, type PoolOffender } from './r2-parity-kit'

const ATTRIBUTE = process.env.R2_PARITY_ATTRIBUTE === '1'
const FULL = process.env.R2_PARITY_FULL === '1'
const TIMEOUT = 900_000

/** Three birth lives (three eras), the rich one (the wealth events run) and two founders (the yearly hooks of companies). */
const SIX = new Set(['b1925', 'b1975', 'b2010', 'b1960-rich', 'f1975-2x25', 'f1990-3x25'])
const LIVES: readonly ParityLife[] = FULL ? PARITY_LIVES : PARITY_LIVES.filter((l) => SIX.has(l.id))

const TEXT = PARITY_SLICES.length

function first(moves: readonly Divergence[]): string {
  const d = moves[0]
  return d ? `life ${d.life}, year ${d.year}, slices ${d.slices.join(', ')} (${moves.length} year(s) differ)` : 'none'
}

function offenders(list: readonly PoolOffender[]): string {
  return list.map((o) => `  ${o.key}  ${o.where.join(' < ')}`).join('\n')
}

function failure(life: ParityLife, what: string, moves: readonly Divergence[]): string {
  const head = `${what}: ${first(moves)}. A converted pool changes state. `
  if (!ATTRIBUTE) return `${head}Run R2_PARITY_ATTRIBUTE=1 vt test/r2-text-isolation.test.ts to name the pools.`
  return `${head}Pools whose rotation moves state (revert each to pick, with a skip entry, or use eraPickPlain or vPlain):\n${offenders(bisectOffenders(life))}`
}

/** Per life: did the text digest differ between plain and memory in some year? Filled by the life tests, read by the last one. */
const textDiffers = new Map<string, boolean>()

describe(`r2 text isolation: plain, rotate and memory agree on g.rng and every non-text slice (${FULL ? 'all 12' : 'six'} lives)`, () => {
  for (const life of LIVES) {
    it(
      `${life.id}: no converted pool leaks into state`,
      () => {
        const plain: ParityTrace = withPickMode('plain', () => traceLife(life))
        const rotate: ParityTrace = withPickMode('rotate', () => traceLife(life))
        const memory: ParityTrace = traceLife(life)
        textDiffers.set(
          life.id,
          plain.years.some((row, t) => row[TEXT] !== memory.years[t]?.[TEXT]),
        )
        const rot = traceMoves(plain, rotate)
        if (rot.length > 0) throw new Error(failure(life, 'rotate against plain', rot))
        const mem = traceMoves(plain, memory)
        if (mem.length > 0) throw new Error(failure(life, 'memory against plain', mem))
        expect(rot).toEqual([])
        expect(mem).toEqual([])
      },
      TIMEOUT,
    )
  }

  it('the conversion has teeth: the text differs between plain and memory in at least one life', (ctx) => {
    if (textDiffers.size < LIVES.length) ctx.skip()
    expect([...textDiffers.values()].some(Boolean)).toBe(true)
  })
})
