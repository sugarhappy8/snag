// R1-T9 (E.T2): the text harness. It plays four seeded lives to age 90 through the real yearly loop (test/play-kit.ts),
// measures how repetitive the words are (test/text-metrics.ts), prints a table, and checks the measure itself: every
// number is finite, a replay is byte-identical, and the card counts only ever fall as the digest and Quiet Mode are
// applied. The design thresholds (9.2) are NOT checked in R1: the baseline is recorded, and R2, R3 and R5 switch the
// thresholds on, one metric at a time, as their work brings the numbers down.
//
//   TEXT_KIT_RECORD=1  writes test/fixtures/text-baseline.json from this run
//   TEXT_KIT_RECORD=r2 writes test/fixtures/text-baseline-r2.json (R2-B2, the text stream) and prints how repeatedShare and
//                      sameWithin10 compare with the R1 baseline. The R1 file is left alone: test/text-metrics.test.ts pins it.
//   TEXT_KIT_ENFORCE=1 also asserts the rest of DESIGN_THRESHOLDS on each life (fails today on purpose)
//
// The harness only reads g.log and the drained popups, so it never changes the game.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { playLife } from './play-kit'
import { DESIGN_THRESHOLDS, mergeMetrics, textMetrics, type LifeTrace, type TextMetrics } from './text-metrics'

const FIXTURE = join(__dirname, 'fixtures', 'text-baseline.json')
const FIXTURE_R2 = join(__dirname, 'fixtures', 'text-baseline-r2.json')
const UNTIL_AGE = 90
const TIMEOUT = 120_000
const ENFORCE = process.env.TEXT_KIT_ENFORCE === '1'
const RECORD = process.env.TEXT_KIT_RECORD === '1'
const RECORD_R2 = process.env.TEXT_KIT_RECORD === 'r2'

const LIVES: ReadonlyArray<{ seed: number; birthYear: number; rich: boolean }> = [
  { seed: 1, birthYear: 1950, rich: false },
  { seed: 2, birthYear: 1990, rich: false },
  { seed: 3, birthYear: 2005, rich: false },
  { seed: 4, birthYear: 1975, rich: true },
]

function play(spec: (typeof LIVES)[number]): TextMetrics {
  const { years } = playLife({ seed: spec.seed, birthYear: spec.birthYear, untilAge: UNTIL_AGE, rich: spec.rich })
  const life: LifeTrace = { seed: spec.seed, birthYear: spec.birthYear, rich: spec.rich, years }
  return textMetrics(life)
}

// A life is played once per run: the table and the baseline reuse what each test measured.
const measured = new Map<number, TextMetrics>()
function metricsOf(i: number): TextMetrics {
  let m = measured.get(i)
  if (!m) {
    m = play(LIVES[i])
    measured.set(i, m)
  }
  return m
}

/** Every number in a metrics object, with its path. A null gap is the one non-number allowed. */
function numbers(v: unknown, path = 'metrics'): Array<[string, unknown]> {
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => numbers(x, `${path}.${k}`))
  return [[path, v]]
}

/** The design thresholds a life must meet in every run (R2-P10): the repeated-line share, 5% a life and 8% for the rich one. */
function enforceAlways(m: TextMetrics, rich: boolean): void {
  const T = DESIGN_THRESHOLDS
  expect(m.repeatedShare, 'repeatedShare').toBeLessThanOrEqual(rich ? T.repeatedShareRich : T.repeatedShare)
}

/** The rest of the design thresholds, still opt-in (TEXT_KIT_ENFORCE=1): a later release moves each into enforceAlways when its numbers allow. */
function enforceAll(m: TextMetrics, rich: boolean): void {
  const T = DESIGN_THRESHOLDS
  expect(m.sameWithin10, 'sameWithin10').toBeLessThanOrEqual(T.sameWithin10)
  expect(m.over3.max, 'over3.max').toBeLessThanOrEqual(T.over3Max)
  expect(m.popupFamilies.maxPerLife, 'popupFamilies.maxPerLife').toBeLessThanOrEqual(T.popupFamilyMax)
  if (m.popupFamilies.minGapYears !== null) expect(m.popupFamilies.minGapYears, 'popupFamilies.minGapYears').toBeGreaterThanOrEqual(T.popupFamilyMinGap)
  expect(m.openerShare, 'openerShare').toBeLessThanOrEqual(rich ? T.openerShareRich : T.openerShare)
  expect(m.popupsPerYear.p90, 'popupsPerYear.p90').toBeLessThanOrEqual(T.popupsP90)
}

describe('text harness', () => {
  LIVES.forEach((spec, i) => {
    it(
      `seed ${spec.seed}, born ${spec.birthYear}${spec.rich ? ', rich' : ''}: plays to ${UNTIL_AGE} and measures`,
      () => {
        const m = metricsOf(i)
        for (const [path, v] of numbers(m)) {
          if (path === 'metrics.popupFamilies.minGapYears' && v === null) continue
          expect(typeof v, path).toBe('number')
          expect(Number.isFinite(v), path).toBe(true)
        }
        expect(m.lines).toBeGreaterThan(100)
        // Merging notices into digests, then routing routine ones to the inbox, can only lower the card count.
        expect(m.cardsPerYear.quiet.mean).toBeLessThanOrEqual(m.cardsPerYear.digest.mean)
        expect(m.cardsPerYear.digest.mean).toBeLessThanOrEqual(m.cardsPerYear.raw.mean)
        // The raw count is the popup count, by definition.
        expect(m.cardsPerYear.raw).toEqual(m.popupsPerYear)
        enforceAlways(m, spec.rich)
        if (ENFORCE) enforceAll(m, spec.rich)
      },
      TIMEOUT,
    )
  })

  it(
    'a replay of seed 1 gives byte-identical metrics',
    () => {
      const first = metricsOf(0)
      const again = play(LIVES[0])
      expect(JSON.stringify(again)).toBe(JSON.stringify(first))
    },
    TIMEOUT,
  )

  afterAll(() => {
    const lives = LIVES.map((_, i) => measured.get(i))
    // A filtered run that skipped a life prints and records nothing.
    if (lives.some((m) => m === undefined)) return
    const all = lives as TextMetrics[]
    const merged = mergeMetrics(all)
    console.info(table(all, merged))
    if (RECORD) {
      writeFileSync(FIXTURE, `${JSON.stringify({ v: 1, recordedAt: 'v4.1.0 candidate', lives: all, merged }, null, 2)}\n`)
    }
    if (RECORD_R2) {
      writeFileSync(FIXTURE_R2, `${JSON.stringify({ v: 1, recordedAt: 'v5.0.0 R2-B2: text stream', lives: all, merged }, null, 2)}\n`)
      console.info(ratioToR1(merged))
    }
  })
})

// ---- the printed table -------------------------------------------------------------------------------------------

/** How the merged repeatedShare and sameWithin10 compare with the R1 baseline (R1 is the denominator). The lead decides the gate. */
function ratioToR1(merged: TextMetrics): string {
  const r1 = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { merged: TextMetrics }).merged
  const ratio = (now: number, then: number): string => (then === 0 ? 'n/a' : (now / then).toFixed(2))
  return [
    'R2 text baseline against R1 (merged, 4 lives):',
    `  repeatedShare ${pct(r1.repeatedShare)} -> ${pct(merged.repeatedShare)}  ratio ${ratio(merged.repeatedShare, r1.repeatedShare)}`,
    `  sameWithin10  ${r1.sameWithin10} -> ${merged.sameWithin10}  ratio ${ratio(merged.sameWithin10, r1.sameWithin10)}`,
  ].join('\n')
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2))

function table(lives: readonly TextMetrics[], merged: TextMetrics): string {
  const head = ['life', 'lines', 'repeat', 'in10y', '>3x n/max', 'fam max/>6/gap', 'opener', 'pop/yr mean/p90', 'cards raw/digest/quiet']
  const row = (label: string, m: TextMetrics): string[] => [
    label,
    String(m.lines),
    pct(m.repeatedShare),
    String(m.sameWithin10),
    `${m.over3.distinct}/${m.over3.max}`,
    `${m.popupFamilies.maxPerLife}/${m.popupFamilies.over6}/${m.popupFamilies.minGapYears ?? '-'}`,
    pct(m.openerShare),
    `${num(m.popupsPerYear.mean)}/${num(m.popupsPerYear.p90)}`,
    `${num(m.cardsPerYear.raw.mean)}/${num(m.cardsPerYear.digest.mean)}/${num(m.cardsPerYear.quiet.mean)}`,
  ]
  const rows = [
    head,
    ...lives.map((m, i) => row(`seed ${LIVES[i].seed} (${LIVES[i].birthYear}${LIVES[i].rich ? ', rich' : ''})`, m)),
    row('merged', merged),
  ]
  const widths = head.map((_, c) => Math.max(...rows.map((r) => r[c].length)))
  return `text harness, ${lives.length} lives to age ${UNTIL_AGE}\n${rows.map((r) => r.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd()).join('\n')}`
}
