// R2-P7 (E.T3 a): the 13-life repeat probe, played. It plays the 13 lives of test/text-probe.ts to age 85 through the real
// yearly loop, measures them, and prints how the pooled repeated-line share compares with R1's 0.0831 (test/fixtures/
// text-baseline-13.json). For now it checks only that the measure is sound: every number is finite, no log line carries an
// unfilled slot, and a replay is byte-identical. R2-P9 adds the families that must stay converted, and R2-P10 turns the gate
// on (the ratio to R1 at most 0.5) and holds the line there.
//
// With NIGHTLY_METRICS_DIR set it also writes text.repeatedShare, text.sameWithin10.sum and text.lines.sum for the nightly.
// To see the families while converting: scripts/text-probe.ts (the command is at the top of that file).
//
// The harness only reads g.log and the drained popups, so it never changes the game.
import { describe, expect, it } from 'vitest'
import { textMetrics, type LifeTrace } from './text-metrics'
import { formatProbe, playProbeLife, probeLives, PROBE_UNTIL_AGE, summarize, writeTextMetrics, type ProbeLife } from './text-probe'

const TIMEOUT = 120_000
const LIVES = probeLives(13)

interface Played {
  trace: LifeTrace
  alive: boolean
}

// A life is played once per run: the per-life tests and the pooled table reuse what each measured.
const played = new Map<number, Played>()
function playedOf(i: number): Played {
  let p = played.get(i)
  if (!p) {
    p = playProbeLife(LIVES[i])
    played.set(i, p)
  }
  return p
}

/** Every number in a metrics object, with its path. A null gap is the one non-number allowed. */
function numbers(v: unknown, path = 'metrics'): Array<[string, unknown]> {
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => numbers(x, `${path}.${k}`))
  return [[path, v]]
}

const label = (l: ProbeLife): string => `seed ${l.seed}, born ${l.birthYear}${l.rich ? ', rich' : ''}`

describe('13-life text probe', () => {
  LIVES.forEach((spec, i) => {
    it(
      `${label(spec)}: plays to ${PROBE_UNTIL_AGE} or death, measures, and leaves no slot unfilled`,
      () => {
        const { trace, alive } = playedOf(i)
        const last = trace.years[trace.years.length - 1]
        // The life stops at the target age, or sooner because the character died.
        if (alive) expect(last.age).toBeGreaterThanOrEqual(PROBE_UNTIL_AGE)
        else expect(last.age).toBeLessThan(PROBE_UNTIL_AGE)
        const m = textMetrics(trace)
        for (const [path, v] of numbers(m)) {
          if (path === 'metrics.popupFamilies.minGapYears' && v === null) continue
          expect(typeof v, path).toBe('number')
          expect(Number.isFinite(v), path).toBe(true)
        }
        expect(m.lines).toBeGreaterThan(0)
        for (const y of trace.years) {
          for (const line of y.lines) {
            // A brace left in a line is a {slot} that nothing filled.
            expect(line.text, `age ${y.age}`).not.toMatch(/[{}]/)
          }
        }
      },
      TIMEOUT,
    )
  })

  it(
    'a replay of the third life is byte-identical, popups included',
    () => {
      const first = playedOf(2)
      const again = playProbeLife(LIVES[2])
      expect(JSON.stringify(again.trace)).toBe(JSON.stringify(first.trace))
    },
    TIMEOUT,
  )

  it(
    'pools the 13 lives, prints the table and the heaviest families, and writes the nightly numbers',
    () => {
      const r = summarize(LIVES.map((_, i) => playedOf(i).trace))
      expect(r.lives).toHaveLength(13)
      expect(r.merged.lines).toBe(r.lives.reduce((n, m) => n + m.lines, 0))
      for (const [path, v] of numbers(r.merged, 'merged')) {
        if (path === 'merged.popupFamilies.minGapYears' && v === null) continue
        expect(Number.isFinite(v), path).toBe(true)
      }
      expect(r.merged.repeatedShare).toBeCloseTo(r.repeated / r.merged.lines, 10)
      console.info(formatProbe(r, 15))
      writeTextMetrics(r)
    },
    TIMEOUT,
  )
})
