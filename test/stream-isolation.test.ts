// ci: fast
// R2-P3 (K.7b d): the mandatory test. One extra draw on a named stream changes only the golden digests of the slices that stream
// feeds, and one extra rand(g) still changes everything downstream (the "before": it proves the digests are sensitive, so the
// isolation is not just blindness). Two lives of the PR plan play 12 years through the real yearly loop; every variant plays the
// same two lives, and a slice digest (test/golden-kit.ts) is taken after year 6, year 12 and at the end.
//
// The extra draw is made by the tap (test/stream-tap.ts), which wraps kernel/streams.ts and text/draw.ts from inside vi.mock. For
// every row of STREAM_SLICES the tap advances that stream once in one calendar year; the slices that moved must be inside the
// row. A slice outside the row that moves is a leak, and there are two kinds: prose that is really simulation state (a name, a
// number: give its draw back to g.rng in the owning module, as wave 0's codemod did for the identity pools) or prose the golden
// kit forgot to mask (add it to the text rule of the kit). Widening the row to make the test pass is never the answer.
//
// The guard at the end scans src for calls of stream and outcomeStream: every tag is a string literal and has a row.
import { describe, expect, it, vi } from 'vitest'
import { posix } from 'node:path'
import { rand } from '../src/game/rng'
import { textCursor } from '../src/game/text/draw'
import { pickLine } from '../src/game/text/pick'
import type { GameState } from '../src/game/types'
import { SLICES, explainMove, type SliceName } from './golden-kit'
import { GOLDEN_PLANS, compareGolden, playGolden, type GoldenLife, type LifeDigests, type Moved } from './golden-run'
import { K_ID, K_STR, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile } from './scan-kit'
import { setbackLuck } from '../src/game/business/studio-effort'
import { hazardRoll } from '../src/game/knowledge/risk'
import { gainLuck } from '../src/game/world/frontier'
import { seededEntity } from '../src/game/world/lod'
import { makeTestGame } from './helpers'
import { STREAM_SLICES, tap, type StreamRow, type TapRule } from './stream-tap'

// vi.mock is hoisted above the imports: the factories load the tap with a dynamic import and hold no top-level name.
vi.mock('../src/game/kernel/streams', async (importOriginal) => {
  const { wrapStreams } = await import('./stream-tap')
  return wrapStreams(await importOriginal<typeof import('../src/game/kernel/streams')>())
})
vi.mock('../src/game/text/draw', async (importOriginal) => {
  const { wrapTextDraw } = await import('./stream-tap')
  return wrapTextDraw(await importOriginal<typeof import('../src/game/text/draw')>())
})

const TIMEOUT = 180_000
const CHECKPOINTS = [6, 12]
/** The age of a birth life at which a row taps unless it says otherwise. */
const DEFAULT_AGE = 5
/** A founder is made an adult at 30 by probeLife, so its first year is age 30. */
const FOUNDER_AGE = 30

/** The two `pr` lives, cut to 12 years. Copies of the plan's own specs, so no seed is written here. */
const LIVES: readonly GoldenLife[] = ['birth-1950', 'founder-1975'].map((id) => {
  const spec = GOLDEN_PLANS.pr.lives.find((l) => l.id === id)
  if (!spec) throw new Error(`the pr plan has no life ${id}: this test names two of its lives`)
  return { ...spec, years: 12 }
})

type Run = Record<string, LifeDigests>

/** What a played variant gives: the digests of every life and how many extra draws the tap made. */
interface Played {
  run: Run
  hits: number
}

/** The calendar year in which a row taps a life. */
function tapYear(l: GoldenLife, row: StreamRow): number {
  return l.birthYear + (l.kind === 'founder' ? FOUNDER_AGE : 0) + (row.age ?? DEFAULT_AGE)
}

/** The year the tap rule carries: the calendar year of the tap, or the argument the module itself passes (row.year). */
const ruleYear = (l: GoldenLife, row: StreamRow): number => row.year ?? tapYear(l, row)

/**
 * For each `driven` row (test/stream-tap.ts): the entry point of the module that draws from the tag, called once in the tapped year of
 * a played life. Every driver is a pure read: it writes nothing to the state, so a move of any slice would come from the extra draw.
 */
const DRIVERS: Readonly<Record<string, (g: GameState) => void>> = {
  lod: (g) => void seededEntity(g, 'person', 'probe', (rand) => rand()),
  'effort.risk': (g) => void setbackLuck(g, g.year, 'probe'),
  frontier: (g) => void gainLuck(g, 'fusion', 'probe', g.year),
  // A played life has no heat, so the driver asks for the roll of a heat of 6 (a hacker's) in this year: a pure read of the stream.
  'intel.risk': (g) => void hazardRoll(g, 6),
}

/** The hook of a row that is driven: calls its driver after the years the row taps at, in every life. Undefined for a row that is not. */
function driveFor(tag: string, row: StreamRow): ((l: GoldenLife, g: GameState, yearsPlayed: number) => void) | undefined {
  const drive = row.driven ? DRIVERS[tag] : undefined
  return drive ? (_l, g, years) => { if (years === (row.age ?? DEFAULT_AGE)) drive(g) } : undefined
}

/**
 * Plays both lives. `ruleFor` is the tap for each life (null: no tap, the baseline) and `onYear` the lives' own hook (it runs after
 * the digests of that year were taken). Every life gets a clean tap, and the tap is switched off again before this returns.
 */
function play(ruleFor: (l: GoldenLife) => TapRule | null, onYear?: (l: GoldenLife, g: GameState, yearsPlayed: number) => void, capture?: (l: GoldenLife, g: GameState, yearsPlayed: number) => void): Played {
  const run: Run = {}
  tap.hits = 0
  try {
    for (const l of LIVES) {
      tap.rule = ruleFor(l)
      run[l.id] = playGolden(l, CHECKPOINTS, (g, years) => {
        capture?.(l, g, years)
        onYear?.(l, g, years)
      })
    }
    return { run, hits: tap.hits }
  } finally {
    tap.rule = null
  }
}

let baseline: Played | null = null
function base(): Played {
  return (baseline ??= play(() => null))
}

/** The state of one life, at one checkpoint ('end' is the last year played), in a play with the given tap: for the failure text only. */
function stateOf(l: GoldenLife, ruleFor: (l: GoldenLife) => TapRule | null, onYear: ((l: GoldenLife, g: GameState, y: number) => void) | undefined, at: string): GameState {
  let found: GameState | null = null
  let last: GameState | null = null
  play(ruleFor, onYear, (life, g, years) => {
    if (life.id !== l.id) return
    last = g
    if (String(years) === at) found = structuredClone(g)
  })
  const g = found ?? last
  if (!g) throw new Error(`no state for ${l.id} at ${at}`)
  return g
}

/** The first move of a slice, as text: where it is and what it was. Replays the life once for each side, so it is used on failure only. */
function explain(m: Moved, ruleFor: (l: GoldenLife) => TapRule | null, onYear?: (l: GoldenLife, g: GameState, y: number) => void): string {
  const l = LIVES.find((x) => x.id === m.life)
  if (!l) return ''
  try {
    return `${m.life} at ${m.at === 'end' ? 'the end' : `year ${m.at}`}, slice ${m.slice}: ${explainMove(stateOf(l, () => null, undefined, m.at), stateOf(l, ruleFor, onYear, m.at), m.slice)}`
  } catch (err) {
    return `${m.life} at ${m.at}, slice ${m.slice}: (no explanation: ${(err as Error).message})`
  }
}

/** The slices that moved between two plays, per life and in all, in SLICES order. */
function movedIn(a: Run, b: Run): { moves: Moved[]; all: SliceName[]; byLife: Record<string, SliceName[]> } {
  const moves = compareGolden(a, b)
  const set = (list: readonly Moved[]): SliceName[] => SLICES.filter((s) => list.some((m) => m.slice === s))
  return { moves, all: set(moves), byLife: Object.fromEntries(LIVES.map((l) => [l.id, set(moves.filter((m) => m.life === l.id))])) }
}

describe('stream isolation: determinism', () => {
  it(
    'the baseline played twice, through the tap with no rule, gives the same digests (the tap is inert)',
    () => {
      const first = base()
      const second = play(() => null)
      expect(first.hits).toBe(0)
      expect(second.hits).toBe(0)
      expect(second.run).toEqual(first.run)
      for (const l of LIVES) expect(Object.keys(first.run[l.id]!).sort(), l.id).toEqual(['12', '6', 'end'])
    },
    TIMEOUT,
  )
})

describe('stream isolation: the tap reaches pickLine', () => {
  // The lives above draw text from addFlavorLines too, so they would still hit the tap if pickLine went back to g.rng. This pins pickLine itself.
  const POOL = ['The kettle is on.', 'A bus goes by.', 'Rain on the glass.']
  const tapped = <T>(year: number, f: () => T): { out: T; hits: number } => {
    tap.rule = { tag: 'text', year }
    tap.hits = 0
    try {
      return { out: f(), hits: tap.hits }
    } finally {
      tap.rule = null
    }
  }

  it('a pool of two or more lines takes one step of the text stream in the tapped year, and g.rng stays put', () => {
    const g = makeTestGame(1)
    const rng = g.rng
    const { hits } = tapped(g.year, () => pickLine(g, POOL))
    expect(hits, "pickLine did not draw from the text stream: ask the lead whether wave 0 moved it onto textRand").toBe(1)
    expect(g.rng, 'pickLine moved g.rng').toBe(rng)
    // The tap's extra draw and pickLine's own: the cursor stands at 2.
    expect(textCursor(g).n).toBe(2)
  })

  it('a pool of one line draws nothing, so the tap is not touched; another year is not tapped either', () => {
    const g = makeTestGame(1)
    expect(tapped(g.year, () => pickLine(g, [POOL[0]!])).hits).toBe(0)
    expect(tapped(g.year + 1, () => pickLine(g, POOL)).hits).toBe(0)
    expect(textCursor(g).n).toBe(1)
  })

  it('taps once per state and year: a second pick in the same year draws one step, not two', () => {
    const g = makeTestGame(1)
    const { hits } = tapped(g.year, () => {
      pickLine(g, POOL)
      pickLine(g, POOL)
    })
    expect(hits).toBe(1)
    expect(textCursor(g).n).toBe(3)
  })
})

describe('stream isolation: the tap reaches seededEntity', () => {
  // No played life calls seededEntity, so the lod row is driven. This pins the drive itself: the tap sees the call, and only a rule
  // for the tag and the year 0 the module passes.
  const stranger = (g: GameState): number => seededEntity(g, 'person', 'z1', (rand) => rand())
  const tapped = (rule: TapRule | null, g: GameState): { out: number; hits: number } => {
    tap.rule = rule
    tap.hits = 0
    try {
      return { out: stranger(g), hits: tap.hits }
    } finally {
      tap.rule = null
    }
  }

  it('takes one step of the lod stream when the rule is lod and year 0, and then gives another stranger; g.rng and the state stay put', () => {
    const g = makeTestGame(1)
    const before = JSON.stringify(g)
    const plain = tapped(null, g)
    const hit = tapped({ tag: 'lod', year: 0 }, g)
    expect(hit.hits, 'seededEntity did not draw from the tap: ask the lead whether R2-L16 moved it off stream(g, "lod", 0, ...)').toBe(1)
    expect(plain.hits).toBe(0)
    expect(hit.out).not.toBe(plain.out)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('does not tap for another tag, or for a calendar year (the module passes 0)', () => {
    const g = makeTestGame(1)
    expect(tapped({ tag: 'lod', year: g.year }, g).hits).toBe(0)
    expect(tapped({ tag: 'flavor.milestone', year: 0 }, g).hits).toBe(0)
  })
})

describe('stream isolation: one extra draw on a named stream moves only the slices it feeds', () => {
  for (const [tag, row] of Object.entries(STREAM_SLICES)) {
    it(
      `${tag}: ${row.slices.length ? `only ${row.slices.join(', ')}` : 'nothing'} moves${row.idle ? ' (idle: no module draws from it yet)' : ''}${row.driven ? ' (driven: the test calls the module itself)' : ''}`,
      () => {
        const ruleFor = (l: GoldenLife): TapRule => ({ tag, year: ruleYear(l, row) })
        const drive = driveFor(tag, row)
        const tapped = play(ruleFor, drive)
        const years = LIVES.map((l) => ruleYear(l, row)).join(' and ')
        if (row.idle) {
          expect(tapped.hits, `stream '${tag}' is marked idle but a module drew from it in ${years}: remove idle from its row of STREAM_SLICES and say which slices its output reaches`).toBe(0)
        } else {
          expect(tapped.hits, `no module drew from stream '${tag}' in ${years}: the stream is not wired, or the tap does not see it; ask the lead whether wave 0 moved pickLine onto it`).toBeGreaterThan(0)
        }
        const { moves, all } = movedIn(base().run, tapped.run)
        const leaks = all.filter((s) => !row.slices.includes(s))
        if (leaks.length > 0) {
          const first = leaks.map((s) => explain(moves.find((m) => m.slice === s)!, ruleFor, drive)).join('\n  ')
          throw new Error(
            `one extra draw on stream '${tag}' (${years}) moved slice(s) ${leaks.join(', ')}, which the row allows only ${row.slices.join(', ') || 'none'}.\n  ${first}\n` +
              `A leak is prose that is really simulation state (a name, a number: restore its g.rng draw in the owning module, wave 0's codemod scope) or prose the golden kit forgot to mask (add it to the text rule of test/golden-kit.ts). Never widen the row to make the test pass.`,
          )
        }
        if (tag === 'text') expect(all, 'the extra text draw changed no text: the tap does not reach the lines').toContain('text')
      },
      TIMEOUT,
    )
  }
})

describe('stream isolation: the before, one extra rand(g) moves everything downstream', () => {
  it(
    'an extra rand(g) after year 4 moves rng, character and text in each life, and at least four slices in all',
    () => {
      const extra = play(
        () => null,
        (_l, g, years) => {
          // Year 4, not 5 (R3-Q9): a later conditional roll can take one draw in the base life and none in the tapped one (the
          // company event roll of business/events.ts), and the stream is then in step again. The wealth ask families moved the
          // founder's life so that this happened from year 5, at every checkpoint; from year 4 both lives keep the property.
          if (years === 4) rand(g)
        },
      )
      const { byLife, all } = movedIn(base().run, extra.run)
      for (const l of LIVES) {
        for (const slice of ['rng', 'character', 'text'] as const) expect(byLife[l.id], `${l.id}: an extra rand(g) did not move ${slice}`).toContain(slice)
      }
      expect(all.length, `an extra rand(g) moved only ${all.join(', ')}`).toBeGreaterThanOrEqual(4)
    },
    TIMEOUT,
  )
})

// ---------------------------------------------------------------------------------------------------------------------
// The guard: every tag is a literal and has a row
// ---------------------------------------------------------------------------------------------------------------------

const STREAMS_MODULE = 'src/game/kernel/streams'
type Drawer = 'stream' | 'outcomeStream'
const DRAWERS: readonly string[] = ['stream', 'outcomeStream']

/** A call of stream or outcomeStream: its file, line, and the tag when the second argument is exactly one string literal. */
interface StreamCall {
  path: string
  line: number
  fn: Drawer
  tag: string | null
}

/** Something the scan cannot follow (a re-export, a dynamic import), so a call could hide from it. */
interface Blind {
  path: string
  line: number
  what: string
}

const resolves = (src: SourceFile, spec: string): boolean => spec.startsWith('.') && posix.normalize(posix.join(posix.dirname(src.path), spec)) === STREAMS_MODULE

/**
 * Every call of stream and outcomeStream that comes from kernel/streams.ts, by the names the file gives them (`import { outcomeStream
 * as os }` and `import * as k` are followed). A function that merely has the same name (everyday-brands.ts has a local `stream`) is
 * not a call of the kernel's, because the file does not import it from there. kernel/streams.ts itself defines them and is skipped.
 */
function streamCalls(src: SourceFile): { calls: StreamCall[]; blind: Blind[] } {
  const calls: StreamCall[] = []
  const blind: Blind[] = []
  if (src.path === `${STREAMS_MODULE}.ts`) return { calls, blind }
  const { toks } = src
  const fns = new Map<string, Drawer>()
  const spaces = new Set<string>()
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (isId(t, 'import') && isPunct(toks[i + 1], '(') && toks[i + 2]?.k === K_STR && resolves(src, toks[i + 2]!.v)) {
      blind.push({ path: src.path, line: lineOf(src.text, t.p), what: 'a dynamic import of kernel/streams' })
      continue
    }
    if (t.k !== K_STR || !(isId(toks[i - 1], 'from') || isId(toks[i - 1], 'import')) || !resolves(src, t.v)) continue
    let head = i - 1
    while (head >= 0 && !isId(toks[head], 'import') && !isId(toks[head], 'export')) head--
    if (head < 0) continue
    const line = lineOf(src.text, t.p)
    if (isId(toks[head], 'export')) {
      blind.push({ path: src.path, line, what: 're-exports from kernel/streams (import the functions where they are called)' })
      continue
    }
    if (isId(toks[head + 1], 'type') && !isId(toks[head + 2], 'from')) continue
    let inBraces = false
    for (let j = head + 1; j < i; j++) {
      const n = toks[j]!
      if (isPunct(n, '{')) inBraces = true
      else if (isPunct(n, '}')) inBraces = false
      else if (isPunct(n, '*') && isId(toks[j + 1], 'as') && toks[j + 2]?.k === K_ID) spaces.add(toks[j + 2]!.v)
      else if (inBraces && n.k === K_ID && DRAWERS.includes(n.v) && !isId(toks[j - 1], 'type') && !isId(toks[j - 1], 'as')) {
        fns.set(isId(toks[j + 1], 'as') && toks[j + 2]?.k === K_ID ? toks[j + 2]!.v : n.v, n.v as Drawer)
      }
    }
  }
  if (fns.size === 0 && spaces.size === 0) return { calls, blind }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_ID || !isPunct(toks[i + 1], '(')) continue
    const prev = toks[i - 1]
    let fn: Drawer | undefined
    if (isPunct(prev, '.') && !isPunct(toks[i - 2], '?.')) {
      // k.stream(...): a method of a namespace import of the kernel's file, and nothing else with a dot.
      if (toks[i - 2]?.k === K_ID && spaces.has(toks[i - 2]!.v) && DRAWERS.includes(t.v)) fn = t.v as Drawer
    } else if (!isPunct(prev, '?.') && !isId(prev, 'function')) fn = fns.get(t.v)
    if (!fn) continue
    const close = closeParen(toks, i + 1)
    // `stream(g, t) {` is a method declaration that has the name, not a call.
    if (isPunct(toks[close + 1], '{')) continue
    const arg = splitArgs(toks, i + 1, close)[1]
    const tag = arg !== undefined && arg.length === 1 && arg[0]!.k === K_STR ? arg[0]!.v : null
    calls.push({ path: src.path, line: lineOf(src.text, t.p), fn, tag })
  }
  return { calls, blind }
}

const scanAll = (sources: readonly SourceFile[]): { calls: StreamCall[]; blind: Blind[] } => {
  const calls: StreamCall[] = []
  const blind: Blind[] = []
  for (const s of sources) {
    const r = streamCalls(s)
    calls.push(...r.calls)
    blind.push(...r.blind)
  }
  return { calls, blind }
}

describe('stream isolation: the guard scan', () => {
  const at = (code: string, path = 'src/game/world/war.ts'): ReturnType<typeof streamCalls> => streamCalls(toSource(path, code))
  const head = `import { stream, outcomeStream } from '../kernel/streams'\n`

  it('reads the literal tag of a call of stream or outcomeStream, and null for anything else', () => {
    expect(at(`${head}const a = stream(g, 'econ', 2030, 'us')\nconst b = outcomeStream(g, "wars", y)`).calls.map((c) => [c.fn, c.tag, c.line])).toEqual([
      ['stream', 'econ', 2],
      ['outcomeStream', 'wars', 3],
    ])
    expect(at(`${head}stream(g, TAG, 2030)`).calls.map((c) => c.tag)).toEqual([null])
    expect(at(`${head}stream(g, \`lod.\${kind}\`, 0)`).calls.map((c) => c.tag)).toEqual([null])
    expect(at(`${head}stream(g, 'lod.' + kind, 0)`).calls.map((c) => c.tag)).toEqual([null])
    expect(at(`${head}stream(g)`).calls.map((c) => c.tag)).toEqual([null])
  })

  it('follows an alias and a namespace import, and ignores a function that only has the name', () => {
    expect(at(`import { outcomeStream as os } from '../kernel/streams'\nos(g, 'a', 1)`).calls.map((c) => [c.fn, c.tag])).toEqual([['outcomeStream', 'a']])
    expect(at(`import * as k from '../kernel/streams'\nk.stream(g, 'b', 1)\nk.worldSeed(g)`).calls.map((c) => [c.fn, c.tag])).toEqual([['stream', 'b']])
    expect(at(`function stream(key: string) { return key }\nstream('x|y')`).calls).toEqual([])
    expect(at(`${head}other.stream(g, 'q', 1)\nconst s = { stream(g, t) {} }`).calls).toEqual([])
    expect(at(`${head}// stream(g, 'in a comment', 1)\nconst t = "stream(g, 'in a string', 1)"`).calls).toEqual([])
  })

  it('skips type-only imports and the definition file, and reports what it cannot follow', () => {
    expect(at(`import type { stream } from '../kernel/streams'\nstream(g, 'x', 1)`).calls).toEqual([])
    expect(at(`export function stream(g, tag, year) { return outcomeStream(g, tag, year) }`, 'src/game/kernel/streams.ts').calls).toEqual([])
    expect(at(`export { stream } from '../kernel/streams'`).blind.map((b) => b.what)).toEqual([expect.stringContaining('re-exports')])
    expect(at(`const m = await import('../kernel/streams')`).blind.map((b) => b.what)).toEqual([expect.stringContaining('dynamic import')])
    expect(at(`import { stream } from './streams'`, 'src/game/kernel/ids.ts').calls).toEqual([])
    expect(at(`import { stream } from './streams'\nstream(g, 'k', 1)`, 'src/game/kernel/ids.ts').calls.map((c) => c.tag)).toEqual(['k'])
  })

  it('reads the real source: every tag is a literal, every literal tag has a row, no idle row has a caller', () => {
    const { calls, blind } = scanAll(loadSources())
    expect(
      blind.map((b) => `${b.path}:${b.line} ${b.what}`),
      'a call of stream or outcomeStream could hide from the table',
    ).toEqual([])
    const dynamic = calls.filter((c) => c.tag === null).map((c) => `${c.path}:${c.line} ${c.fn}(...) has a tag that is not a string literal: write the tag as a literal so the table can see it`)
    expect(dynamic).toEqual([])
    const missing = calls.filter((c) => c.tag !== null && !(c.tag in STREAM_SLICES)).map((c) => `${c.path}:${c.line} ${c.fn}(g, '${c.tag}', ...) has no row in STREAM_SLICES (test/stream-tap.ts): add one in the same commit, naming the slices its output reaches`)
    expect(missing).toEqual([])
    const idle = calls.filter((c) => c.tag !== null && STREAM_SLICES[c.tag]?.idle).map((c) => `${c.path}:${c.line} draws from '${c.tag}', whose row says idle: remove idle`)
    expect(idle).toEqual([])
    // The scan reads the file that is known to draw from a keyed stream today, so it cannot pass by seeing nothing.
    expect(calls.some((c) => c.tag === 'flavor.milestone' && c.path === 'src/game/events/flavor.ts')).toBe(true)
  })

  it('has a driver for every driven row and a driven row for every driver, and no row is both idle and driven', () => {
    for (const [tag, row] of Object.entries(STREAM_SLICES)) {
      expect(Boolean(row.driven), `${tag}: driven and DRIVERS disagree`).toBe(tag in DRIVERS)
      expect(row.idle && row.driven, `${tag}: a row with a caller to drive is not idle`).toBeFalsy()
    }
    for (const tag of Object.keys(DRIVERS)) expect(STREAM_SLICES[tag], `${tag}: a driver with no row`).toBeDefined()
  })

  it('has a well formed table: a real reason, real slices, a plausible age', () => {
    for (const [tag, row] of Object.entries(STREAM_SLICES)) {
      if (row.year !== undefined) {
        expect(Number.isInteger(row.year), `${tag}: year`).toBe(true)
        expect(row.year).toBeGreaterThanOrEqual(0)
      }
      expect(tag, tag).toMatch(/^[a-z][a-z0-9._-]{0,31}$/)
      expect(row.why.length, `${tag}: why`).toBeGreaterThanOrEqual(12)
      for (const s of row.slices) expect(SLICES, `${tag}: ${s}`).toContain(s)
      if (row.age !== undefined) {
        expect(Number.isInteger(row.age), `${tag}: age`).toBe(true)
        expect(row.age).toBeGreaterThanOrEqual(0)
        expect(row.age).toBeLessThanOrEqual(12)
      }
    }
  })
})
