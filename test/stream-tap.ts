// R2-P3 (K.7b d): the tap. One extra draw on one named stream, made from outside the game, so a test can prove that the draw moves
// only the slices that stream feeds (test/stream-isolation.test.ts). The game never imports this file.
//
// A test wraps the two modules a draw can come from, from inside vi.mock (the factory is hoisted, so it loads this file with a
// dynamic import and holds no top-level reference):
//
//   vi.mock('../src/game/kernel/streams', async (original) => (await import('./stream-tap')).wrapStreams(await original()))
//   vi.mock('../src/game/text/draw', async (original) => (await import('./stream-tap')).wrapTextDraw(await original()))
//
// With `tap.rule` null the wrappers change nothing (a baseline is played through them too, which proves they are inert).
//
// The two taps differ because the two streams do. stream() and outcomeStream() return a generator: the tap advances the generator
// of the matching call once before the caller sees it. The text stream is not a generator (kernel/streams.ts textUnit is pure and
// the cursor lives in flags.textMem.c, text/draw.ts), so the tap calls the real textRand once more, the first time a state draws
// text in the tapped year. That moves the cursor by one, the same as skipTextDraws(g, year, 1), and every line of that year is
// then drawn one step on.
//
// No vitest imports: the file is loaded by the factory above and could as well run in a script.
import type { SliceName } from './golden-kit'

/** What to tap: the stream tag, and the calendar year the caller passes (text: g.year when the draw is made). */
export interface TapRule {
  tag: string
  year: number
}

/** The tap. A test sets `rule` before it plays a life and reads `hits` after; `hits` counts the extra draws that were made. */
export const tap: { rule: TapRule | null; hits: number } = { rule: null, hits: 0 }

type Fn = (...args: never[]) => unknown

function isFn(v: unknown): v is Fn {
  return typeof v === 'function'
}

function ruleOfCall(args: readonly unknown[]): TapRule | null {
  const [, tag, year] = args
  return typeof tag === 'string' && typeof year === 'number' ? { tag, year } : null
}

/**
 * How to read (tag, year) from the arguments of each export of kernel/streams.ts that returns a generator. `stream` and
 * `outcomeStream` are (g, tag, year, id?). outcomeStream calls stream inside the module, where no mock reaches, so both are listed.
 */
export const EXPORT_TAGS: Record<string, (args: readonly unknown[]) => TapRule | null> = {
  stream: ruleOfCall,
  outcomeStream: ruleOfCall,
}

/** The functions of kernel/streams.ts that draw nothing: keys, hashes and the pure text unit. Anything else the module exports must be in EXPORT_TAGS. */
const PURE_STREAM_EXPORTS: ReadonlySet<string> = new Set(['hashKey', 'streamKey', 'streamUnit', 'textStreamKey', 'textUnit', 'worldSeed'])

/**
 * Wraps every function kernel/streams.ts exports that hands out a generator: when a call matches `tap.rule`, the generator it
 * returns is advanced once (one extra draw) before the caller sees it, and `hits` counts it. A function the module exports that is
 * neither in EXPORT_TAGS nor a known pure helper throws, so a new way to draw cannot go untapped.
 */
export function wrapStreams<M extends Record<string, unknown>>(actual: M): M {
  const out: Record<string, unknown> = { ...actual }
  for (const [name, read] of Object.entries(EXPORT_TAGS)) {
    const real = actual[name]
    if (!isFn(real)) throw new Error(`stream-tap: kernel/streams.ts no longer exports ${name}; change EXPORT_TAGS in test/stream-tap.ts`)
    out[name] = (...args: unknown[]) => {
      const next = (real as (...a: unknown[]) => () => number)(...args)
      const at = tap.rule === null ? null : read(args)
      if (tap.rule !== null && at !== null && at.tag === tap.rule.tag && at.year === tap.rule.year) {
        next()
        tap.hits++
      }
      return next
    }
  }
  for (const [name, value] of Object.entries(actual)) {
    if (isFn(value) && !(name in EXPORT_TAGS) && !PURE_STREAM_EXPORTS.has(name)) {
      throw new Error(`stream-tap: kernel/streams.ts exports ${name}, which the tap does not know: add it to EXPORT_TAGS (it hands out a generator) or to PURE_STREAM_EXPORTS (it draws nothing)`)
    }
  }
  return out as M
}

/** The text/draw.ts functions that start a draw or hand out the means to draw. textCursor and skipTextDraws draw nothing. */
const TEXT_DRAWERS: ReadonlySet<string> = new Set(['textRand', 'textLineId', 'textRng'])
const PURE_TEXT_EXPORTS: ReadonlySet<string> = new Set(['textCursor', 'skipTextDraws'])

/**
 * For vi.mock('../src/game/text/draw', ...). When `tap.rule` is the `text` tag and the state is in the tapped year (g.year), the
 * first textRand, textLineId or textRng call on that state first calls the real textRand once more: one extra text draw, the cursor
 * in flags.textMem.c one step on. Later calls in the year, and every other year, are untouched. textLineId and textRng are wrapped
 * as well because draw.ts calls its own textRand inside them, where no mock reaches; a textRng made in the tapped year taps when it
 * is made, which is before its first draw. A function the module exports that is neither a drawer nor known to be pure throws.
 */
export function wrapTextDraw<M extends Record<string, unknown>>(actual: M): M {
  const real = actual.textRand
  if (!isFn(real)) throw new Error('stream-tap: text/draw.ts no longer exports textRand; change wrapTextDraw in test/stream-tap.ts')
  const draw = real as (g: { year: number }) => number
  // One tap per state and rule: a later call in the same year must not tap again.
  const done = new WeakMap<object, TapRule>()
  const before = (g: { year: number }): void => {
    const rule = tap.rule
    if (rule === null || rule.tag !== 'text' || g.year !== rule.year || done.get(g) === rule) return
    done.set(g, rule)
    draw(g)
    tap.hits++
  }
  const out: Record<string, unknown> = { ...actual }
  for (const name of TEXT_DRAWERS) {
    const fn = actual[name]
    if (!isFn(fn)) throw new Error(`stream-tap: text/draw.ts no longer exports ${name}; change TEXT_DRAWERS in test/stream-tap.ts`)
    out[name] = (g: { year: number }, ...rest: unknown[]) => {
      before(g)
      return (fn as (...a: unknown[]) => unknown)(g, ...rest)
    }
  }
  for (const [name, value] of Object.entries(actual)) {
    if (isFn(value) && !TEXT_DRAWERS.has(name) && !PURE_TEXT_EXPORTS.has(name)) {
      throw new Error(`stream-tap: text/draw.ts exports ${name}, which the tap does not know: add it to TEXT_DRAWERS (it draws or hands out a draw) or to PURE_TEXT_EXPORTS`)
    }
  }
  return out as M
}

/** One row of STREAM_SLICES. */
export interface StreamRow {
  /** The slices (test/golden-kit.ts) an extra draw on the stream may move. A leak outside them is a bug of the module, never a reason to widen the row. */
  slices: readonly SliceName[]
  why: string
  /** The age of a birth life at which to tap (default 5; a founder's first year is age 30, so the year is birthYear + 30 + age). */
  age?: number
  /** No code draws from the tag yet, so the tap cannot hit. The row exists so the guard passes; remove `idle` when a caller lands (the test says so). */
  idle?: boolean
  /**
   * The year argument the module passes to stream or outcomeStream when it is not the calendar year of the tap: a stream that is not
   * tied to a year passes 0 (lod does). Default: the calendar year the row taps.
   */
  year?: number
  /**
   * A module draws from the tag, but no played life calls it yet (a library that a later release wires in), so the test calls its
   * entry point itself, once, in the tapped year (DRIVERS in test/stream-isolation.test.ts). The call is a pure read, so by itself it
   * moves no slice, and the row says which slices the stream may move once the module writes what it draws.
   */
  driven?: boolean
}

/**
 * The table the guard test enforces: for each stream tag a module draws from, the slices one more draw may move. Every track that
 * adds `stream(g, 'tag', ...)` or `outcomeStream(g, 'tag', ...)` adds a row in the same commit, and says honestly which slices the
 * module's output reaches (a war stream: world, economy, text).
 */
export const STREAM_SLICES: Readonly<Record<string, StreamRow>> = {
  text: {
    slices: ['text'],
    why: 'lines and popups are prose; nothing reads them back into a roll',
  },
  'flavor.milestone': {
    slices: ['text'],
    why: 'the toddler milestone age keys on outcomeStream; the age lands in flags.milestonesLogged, a cache flag, which the golden kit files under text',
    age: 1,
  },
  lod: {
    slices: [],
    why: 'R2-L16 seededEntity draws a stranger from stream(g, "lod", 0, kind:key); only promote makes one persist, and no played life calls either in R2',
    year: 0,
    driven: true,
  },
  'effort.risk': {
    slices: ['assets', 'character', 'economy', 'text'],
    why: 'R3-M7 simulateStudioEngines draws a pushing year\'s setback from outcomeStream(g, "effort.risk", year, "studio:<engine>"); it cuts the gain of an engine in development (assets), which moves the studio\'s costs and cash, so the owner\'s pay and net worth (character), the company\'s investment (economy) and the report line (text), and no played life pushes an engine yet',
    driven: true,
  },
  frontier: {
    slices: ['world', 'flagsPersonal', 'text'],
    why: 'R3-F1 applyDisclosure draws a disclosure\'s luck from outcomeStream(g, "frontier", year, ...); the shard feeds the Workshop race year, which drops an idea from the notebook flag and logs it, and no played life writes a disclosure yet',
    driven: true,
  },
  'intel.risk': {
    slices: ['character', 'flagsPersonal', 'text'],
    why: 'R3-H4 the yearly roll of the illegal-intel heat (knowledge/risk.ts); a hit writes a criminal record, wanted level, notoriety and karma (character), the heat and its year stamp in flags.know (flagsPersonal), and a notice and a log line (text); only a life that bought from an informant or a hacker has heat, so no played life rolls it',
    driven: true,
  },
}
