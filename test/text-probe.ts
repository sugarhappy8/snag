// R2-P7 (E.T3 a): the 13-life repeat probe. The R2 acceptance names one number, "the repeated-line rate of E.T2's 13-life
// probe is at most half of R1's", and this file measures it. The 13 lives are the notice probe's (test/notice-probe.test.ts:
// seeds 101 to 113, the same birth years, played to 85), and every second life is given 60,000,000 at 25 (the harness's `rich`,
// so that half the lives are rich as in digest E). The R1 record is test/fixtures/text-baseline-13.json: the same lives
// measured on v4.1.1, before wave 0 and before any R2 text change.
//
// The probe plays through test/play-kit.ts and measures with test/text-metrics.ts, so a line is "repeated" exactly as the E.T2
// harness (test/text-kit.test.ts) counts it: its normalized text was already in the same life. A family is one normalized line
// with the repeats it adds over all the lives, which is the worklist for converting lines (R2-P9, R2-P10).
//
// No vitest imports: the same module runs under vitest and as the bundled node script scripts/text-probe.ts, like
// test/play-kit.ts. It only reads g.log and the drained popups, so it never changes the game.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import baseline from './fixtures/text-baseline-13.json'
import { playLife } from './play-kit'
import { mergeMetrics, normalize, textMetrics, type LifeTrace, type TextMetrics } from './text-metrics'

export interface ProbeLife {
  seed: number
  birthYear: number
  rich: boolean
}

export const PROBE_UNTIL_AGE = 85

/** The first seed of the probe, and the birth years it cycles through (the notice probe's). */
const FIRST_SEED = 101
const BIRTH_YEARS: readonly number[] = [1925, 1950, 1975, 1990, 2010, 2026]
/** A family's text is cut to this many characters for the table; two lines that differ after the cut stay two families. */
const FAMILY_CHARS = 100

/** The first 13 are the R1 baseline's lives; more extend the same recipe (the nightly plays 20). */
export function probeLives(n = 13): ProbeLife[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => ({ seed: FIRST_SEED + i, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length], rich: i % 2 === 1 }))
}

/** One normalized log line with its repeats over the lives. `text` is normalize()d and cut to 100 characters. */
export interface Family {
  text: string
  /** repeats beyond the first, summed over the lives (a line met three times in one life adds 2) */
  extra: number
  /** every sighting, over all the lives */
  total: number
  /** the number of lives the line appears in, each counted once */
  lives: number
}

export interface ProbeResult {
  lives: TextMetrics[]
  merged: TextMetrics
  /** repeated lines over all the lives: the sum of every family's `extra` */
  repeated: number
  /** the lines that repeat, most repeats first, then by text */
  families: Family[]
}

/** Measure played lives and rank the lines that repeat. Pure: it reads the traces and writes nothing. */
export function summarize(traces: readonly LifeTrace[]): ProbeResult {
  const lives = traces.map(textMetrics)
  const byLine = new Map<string, { extra: number; total: number; lives: number }>()
  let repeated = 0
  for (const trace of traces) {
    const seen = new Map<string, number>()
    for (const y of trace.years) {
      for (const line of y.lines) {
        const text = normalize(line.text)
        seen.set(text, (seen.get(text) ?? 0) + 1)
      }
    }
    for (const [text, n] of seen) {
      const f = byLine.get(text) ?? { extra: 0, total: 0, lives: 0 }
      f.extra += n - 1
      f.total += n
      f.lives += 1
      byLine.set(text, f)
      repeated += n - 1
    }
  }
  const families = [...byLine]
    .filter(([, f]) => f.extra > 0)
    .sort(([a, fa], [b, fb]) => fb.extra - fa.extra || (a < b ? -1 : a > b ? 1 : 0))
    .map(([text, f]) => ({ text: text.slice(0, FAMILY_CHARS), extra: f.extra, total: f.total, lives: f.lives }))
  return { lives, merged: mergeMetrics(lives), repeated, families }
}

/** Play one probe life to age 85 (or death) and keep what the metrics read. */
export function playProbeLife(life: ProbeLife): { trace: LifeTrace; alive: boolean } {
  const { g, years } = playLife({ seed: life.seed, birthYear: life.birthYear, untilAge: PROBE_UNTIL_AGE, rich: life.rich })
  return { trace: { seed: life.seed, birthYear: life.birthYear, rich: life.rich, years }, alive: g.character.alive }
}

/** Play the first `n` probe lives (default 13) and summarize them. About 1.5 seconds a life on a desktop. */
export function playProbe(n = 13): ProbeResult {
  return summarize(probeLives(n).map((l) => playProbeLife(l).trace))
}

// ---- the record of R1 --------------------------------------------------------------------------------------------

/** What test/fixtures/text-baseline-13.json holds: the 13 lives measured on v4.1.1 (a65349a), before wave 0. */
export interface R1Baseline {
  v: 1
  recordedAt: string
  spec: { lives: number; firstSeed: number; birthYears: number[]; richOn: string; untilAge: number; weighting: string }
  merged: { lines: number; repeated: number; repeatedShare: number; sameWithin10: number; over3: { distinct: number; max: number } }
  perLife: { lines: number; share: number; in10: number; max: number; over3: number }[]
}

export function readBaseline(): R1Baseline {
  return baseline as R1Baseline
}

/** The pooled repeated-line share over R1's. The R2 acceptance wants at most 0.5. */
export function ratioToR1(r: ProbeResult): number {
  return r.merged.repeatedShare / readBaseline().merged.repeatedShare
}

// ---- reports -----------------------------------------------------------------------------------------------------

const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`

/**
 * The text the CLI prints and the tests log: the pooled share against R1, each life, and the `top` heaviest families as
 * `extra total lives text`. The lives are labelled by position, from probeLives, so a result of the first n lives reads right.
 */
export function formatProbe(r: ProbeResult, top = 40): string {
  const base = readBaseline().merged
  const specs = probeLives(r.lives.length)
  const rows = [
    ['life', 'lines', 'repeat', 'share', 'in10y', '>3x max'],
    ...r.lives.map((m, i) => [
      `seed ${specs[i].seed}, born ${specs[i].birthYear}${specs[i].rich ? ', rich' : ''}`,
      String(m.lines),
      String(Math.round(m.repeatedShare * m.lines)),
      pct(m.repeatedShare),
      String(m.sameWithin10),
      String(m.over3.max),
    ]),
  ]
  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)))
  const table = rows.map((row) => row.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ')).join('\n')
  const families = r.families.slice(0, Math.max(0, top))
  const head = [
    `text probe: ${r.lives.length} lives to age ${PROBE_UNTIL_AGE}, ${r.merged.lines} log lines, ${r.repeated} repeated`,
    `pooled repeated share ${pct(r.merged.repeatedShare, 2)}; R1 ${pct(base.repeatedShare, 2)}, ratio ${ratioToR1(r).toFixed(2)} (the bar is 0.50, a share of ${pct(base.repeatedShare / 2, 2)})`,
    `sameWithin10 ${r.merged.sameWithin10} (R1 ${base.sameWithin10}); lines over 3 times ${r.merged.over3.distinct}, most ${r.merged.over3.max} (R1 ${base.over3.distinct}, ${base.over3.max})`,
  ]
  const list = families.map((f) => `${String(f.extra).padStart(4)} ${String(f.total).padStart(4)} ${String(f.lives).padStart(3)}  ${f.text}`)
  return [...head, table, ...(list.length ? [`top ${list.length} families (extra total lives text)`, ...list] : [])].join('\n')
}

// ---- the nightly -------------------------------------------------------------------------------------------------

/** The three numbers the nightly takes from the probe. A name ending `.sum` is added over shards. */
export function nightlyMetrics(r: ProbeResult): Record<string, number> {
  return {
    'text.repeatedShare': r.merged.repeatedShare,
    'text.sameWithin10.sum': r.merged.sameWithin10,
    'text.lines.sum': r.merged.lines,
  }
}

/**
 * With NIGHTLY_METRICS_DIR set, writes <dir>/text-<NIGHTLY_SHARD or 0>.json as { v: 1, job, shard, metrics } and returns its
 * path; otherwise writes nothing and returns null. This is the shape of the nightly metrics file (R2-P4's test/nightly-metrics.ts
 * `writeMetrics` writes the same for the other jobs); it stands alone here so this probe does not wait for that file.
 */
export function writeTextMetrics(r: ProbeResult, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const dir = env.NIGHTLY_METRICS_DIR
  if (!dir) return null
  const n = Number(env.NIGHTLY_SHARD ?? 0)
  const shard = Number.isInteger(n) && n >= 0 ? n : 0
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `text-${shard}.json`)
  writeFileSync(file, `${JSON.stringify({ v: 1, job: 'text', shard, metrics: nightlyMetrics(r) })}\n`)
  return file
}
