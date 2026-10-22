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
// R2-B2 appends the layer-3 blocks below: after the rebaseline the text stream is off g.rng, so an extra text draw every year
// moves no g.rng value and no non-text slice, and addFlavorLines draws no g.rng at all.
import { describe, expect, it } from 'vitest'
import { addFlavorLines } from '../src/game/events/flavor'
import { createNewLife } from '../src/game/life'
import { skipTextDraws } from '../src/game/text/draw'
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

// ---------------------------------------------------------------------------------------------------------------------
// R2-B2 (D7 layer 3): the text stream is off g.rng. One extra text draw at the start of every year, for 20 years, must change no
// g.rng value and no non-text slice digest (all years); only the text may differ. The extra draw is made by skipTextDraws in
// onYear (which runs at the end of a year): the coming year starts its cursor at 1, as if one more line had been drawn first. A
// draw made at the end of a year itself would be wasted, the cursor restarts with the year.
// ---------------------------------------------------------------------------------------------------------------------

const EXTRA_YEARS = 20
const EXTRA_IDS = ['b1925', 'b1975', 'b2010', 'f1975-2x25']

/** The life cut to 20 years: a birth life stops at 20, a founder lives 20 years from 30. */
function twenty(id: string): ParityLife {
  const life = PARITY_LIVES.find((l) => l.id === id)
  if (!life) throw new Error(`no parity life ${id}`)
  return life.kind === 'birth' ? { ...life, untilAge: EXTRA_YEARS } : { ...life, years: EXTRA_YEARS }
}

const extraMoved = new Map<string, boolean>()

describe('r2 text isolation: one extra text draw every year moves nothing but text (4 lives, 20 years)', () => {
  for (const id of EXTRA_IDS) {
    it(
      `${id}: g.rng and every non-text slice are identical in every year`,
      () => {
        const life = twenty(id)
        const base: ParityTrace = traceLife(life)
        const extra: ParityTrace = traceLife(life, (g) => skipTextDraws(g, g.year + 1, 1))
        extraMoved.set(
          id,
          base.years.some((row, t) => row[TEXT] !== extra.years[t]?.[TEXT]),
        )
        const moves = traceMoves(base, extra)
        if (moves.length > 0) {
          throw new Error(`an extra text draw moved a non-text slice: ${first(moves)}. Some text draw reaches state: a g.rng draw, a uid, a flag or a branch hangs off a text pick.`)
        }
        expect(moves).toEqual([])
      },
      TIMEOUT,
    )
  }

  it('the stream is live: the text digest differs in at least one life', (ctx) => {
    if (extraMoved.size < EXTRA_IDS.length) ctx.skip()
    expect([...extraMoved.values()].some(Boolean)).toBe(true)
  })
})

describe('r2 text isolation: addFlavorLines draws nothing from g.rng', () => {
  // Fixed lives as tuples (the seed-pin ratchet counts only `seed: <digits>`): [seed, birth year].
  const FLAVOR_LIVES = [
    [11, 1925],
    [12, 1960],
    [13, 1990],
    [14, 2012],
  ] as const

  for (const [seed, birth] of FLAVOR_LIVES) {
    it(`born ${birth}: g.rng is the same after every one of 85 years, and flavor lines take their ids from the text stream`, () => {
      const g = createNewLife({ seed, year: birth })
      g.queue = []
      const rng = g.rng
      const startId = g.nextId
      const entries = (): { id: string; text: string }[] => g.log.flatMap((y) => y.entries)
      const already = entries().length
      for (let age = 1; age <= 85; age++) {
        g.character.age = age
        g.year = birth + age
        addFlavorLines(g)
        expect(g.rng, `age ${age}`).toBe(rng)
      }
      const added = entries().slice(already)
      expect(added.length).toBeGreaterThan(60)
      // Milestone lines (the first word, the first steps) still take a uid; a flavor line never does, so the flavor count cannot move nextId.
      const milestones = added.filter((e) => /^l\d+$/.test(e.id))
      expect(g.nextId - startId).toBe(milestones.length)
      expect(milestones.length).toBeGreaterThan(0)
      for (const e of added) expect(e.id, e.text).toMatch(/^(l\d+|t\d+\.\d+)$/)
      expect(added.filter((e) => e.id.startsWith('t')).length).toBeGreaterThan(50)
      expect(new Set(added.map((e) => e.id)).size).toBe(added.length)
    })
  }
})
