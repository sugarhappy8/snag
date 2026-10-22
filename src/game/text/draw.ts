// The text stream (R2-B2, D1): where every draw of prose comes from. Picking a line of flavor, a greeting or a name for a
// rumor must not move g.rng, or one more line in a pool would reshuffle every roll after it. So text has a stream of its own.
//
// The stream is counter based. The n-th value of the text stream of year Y is a pure function of the life, the Time Machine
// outcome tag and Y (kernel/streams.ts textUnit); n is the number of text draws already made this year. That counter is the
// cursor, one string '<year>,<count>' in flags.textMem.c (the memory already lives in flags, is personal, resets for heirs and is
// bounded). It restarts at 0 when g.year changes, so a yearly step is idempotent by its year stamp. A reload, a structuredClone
// and a replay carry the cursor with the state, so they continue with the same lines; a Time Machine jump re-keys the year it
// lands in, so the same pools read different lines after it.
//
// Imports memory (the codec and the repair of the cursor), the kernel's stream and, for types only, the game state.
import { textUnit } from '../kernel/streams'
import type { GameState } from '../types'
import { parseTextCursor, writableTextMem } from './memory'

/** The newest year a cursor can name (seven digits in the codec, kept to six so a year never looks like a count). */
const YEAR_MAX = 999_999
/** The highest count the codec holds (nine digits). A year that draws more than this stops counting and repeats its last value. */
const COUNT_MAX = 999_999_999

/** A year the cursor can name: an integer in 0..999999. Any other year draws unit 0 of its stream and keeps no cursor. */
function cursorYear(year: number): boolean {
  return Number.isInteger(year) && year >= 0 && year <= YEAR_MAX
}

/** Pure. Where the cursor stands for `g.year`: a missing, malformed or other-year cursor reads { year: g.year, n: 0 }. */
export function textCursor(g: GameState): { year: number; n: number } {
  const raw = g.flags.textMem
  const mem = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && raw.v === 1 ? raw : null
  const at = mem ? parseTextCursor(mem.c) : null
  return { year: g.year, n: at && cursorYear(g.year) && at.year === g.year ? at.n : 0 }
}

/**
 * The next value of this year's text stream, in [0, 1), and the cursor one step on. Draws nothing from g.rng, reads nothing but
 * the life, the forks and the cursor, and writes only flags.textMem, so a frozen state throws exactly where rand(g) did.
 */
export function textRand(g: GameState): number {
  const mem = writableTextMem(g)
  const year = g.year
  if (!cursorYear(year)) return textUnit(g, year, 0)
  const at = parseTextCursor(mem.c)
  const n = at && at.year === year ? at.n : 0
  mem.c = `${year},${Math.min(n + 1, COUNT_MAX)}`
  return textUnit(g, year, n)
}

/** A log id for a line whose count depends on text: 't<year>.<n>', unique within a year. Consumes one text draw, never a uid. */
export function textLineId(g: GameState): string {
  const n = textCursor(g).n
  textRand(g)
  return `t${g.year}.${n}`
}

/**
 * A test aid: starts `year` with `n` more text draws already made, without drawing. It writes c as '<year>,<n>' when the cursor
 * is on another year, and adds n when it is already on `year`. The coming year's text shifts by n draws; nothing else moves.
 * Writes only flags.textMem, so a frozen state throws exactly where rand(g) did.
 */
export function skipTextDraws(g: GameState, year: number, n: number): void {
  if (!cursorYear(year) || !Number.isInteger(n) || n < 0) return
  const mem = writableTextMem(g)
  const at = parseTextCursor(mem.c)
  const base = at && at.year === year ? at.n : 0
  mem.c = `${year},${Math.min(base + n, COUNT_MAX)}`
}

/** The draws a text consumer needs, bound to one state. Each call is one step of the cursor, except pick of nothing (it throws first). */
export interface TextRng {
  next(): number
  /** Integer in [min, max] inclusive; a > b swaps, like randInt. */
  int(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

/** rng.ts's next, randInt, chance, pick and shuffle, on the text stream. The same arithmetic, a different source of numbers. */
export function textRng(g: GameState): TextRng {
  const next = (): number => textRand(g)
  return {
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min]
      return min + Math.floor(next() * (max - min + 1))
    },
    chance: (p) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() from empty list')
      return items[Math.floor(next() * items.length)]
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
  }
}
