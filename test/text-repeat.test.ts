// R2-P7 (E.T3 a): the 13-life repeat probe, played. It plays the 13 lives of test/text-probe.ts to age 85 through the real
// yearly loop, measures them, and prints how the pooled repeated-line share compares with R1's 0.0831 (test/fixtures/
// text-baseline-13.json). For now it checks only that the measure is sound: every number is finite, no log line carries an
// unfilled slot, and a replay is byte-identical. R2-P9 adds the families that must stay converted (FAMILIES below: a line
// that moved onto a state line may repeat only so often over the 13 lives), and R2-P10 turns the gate on (the ratio to R1 at
// most 0.5) and holds the line there.
//
// With NIGHTLY_METRICS_DIR set it also writes text.repeatedShare, text.sameWithin10.sum and text.lines.sum for the nightly.
// To see the families while converting: scripts/text-probe.ts (the command is at the top of that file).
//
// The harness only reads g.log and the drained popups, so it never changes the game.
import { describe, expect, it } from 'vitest'
import { fillSlots } from '../src/game/text/state'
import { STATE_TABLE } from '../src/game/text/state-table'
import { normalize, textMetrics, type LifeTrace } from './text-metrics'
import { formatProbe, playProbeLife, probeLives, PROBE_UNTIL_AGE, summarize, writeTextMetrics, type ProbeLife, type ProbeResult } from './text-probe'

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

let pooledResult: ProbeResult | undefined
/** The 13 lives pooled, summarized once for every test that reads the families. */
function pooled(): ProbeResult {
  pooledResult ??= summarize(LIVES.map((_, i) => playedOf(i).trace))
  return pooledResult
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
      const r = pooled()
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

// ---- R2-P9: the status lines that moved onto a state line -----------------------------------------------------------------

/**
 * One family of status lines. `re` matches the normalized text (lower case, digits as #, no money sign) of the line as the
 * game wrote it before R2-P9 and of every variant of its rows, so a family cannot go quiet in this test just because its
 * words changed. The probe cuts a family's text at 100 characters, so a pattern never reaches for the end of a line.
 * `was` is the line as R1 wrote it and `slots` fill the variants; the pattern test below checks `re` against both.
 */
interface Family {
  name: string
  re: RegExp
  /** The most repeats beyond the first the 13 lives may add up to. */
  maxExtra: number
  rows: readonly (keyof typeof STATE_TABLE)[]
  was: string
  slots: Readonly<Record<string, string>>
}

const FAMILIES: readonly Family[] = [
  {
    name: 'around me',
    re: /^around me: |^(money got tight around me|times got harder in my town|the squeeze reached my whole street|work got scarce where i live|belts got tighter all over town|banks stopped lending around me|credit dried up where i live|borrowing got hard for the people i knew|loans got hard to find in my town|the banks near me shut their wallets|shortages hit the shops around me|prices jumped on everything i buy|stores near me ran short of goods|empty shelves showed up around town|the shops near me couldn't keep things in stock)\./,
    maxExtra: 6,
    rows: ['around.growth', 'around.credit', 'around.supply'],
    was: 'Around me: Spending, lending and employment are adjusting gradually.',
    slots: { cause: 'Spending, lending and employment are adjusting gradually.' },
  },
  {
    name: 'index days',
    re: /^the .+ (crashed|boomed|fell|dropped|jumped|gained|slid|lost|climbed|surged) #%/,
    maxExtra: 6,
    rows: ['index.crash', 'index.boom'],
    was: 'The IBC crashed 29% this year. Good thing I had nothing in it.',
    slots: { index: 'IBC', move: '29%' },
  },
]

describe('R2-P9 families', () => {
  for (const f of FAMILIES) {
    it(
      `${f.name}: the 13 lives repeat it at most ${f.maxExtra} times`,
      () => {
        const hits = pooled().families.filter((x) => f.re.test(x.text))
        const extra = hits.reduce((n, x) => n + x.extra, 0)
        const worst = hits.slice(0, 3).map((x) => `${x.extra} x ${x.text}`).join(' | ')
        expect(extra, `${f.name} repeats ${extra} times over the 13 lives (most repeated: ${worst || 'none'})`).toBeLessThanOrEqual(f.maxExtra)
      },
      TIMEOUT,
    )
  }

  it('each pattern matches the line as R1 wrote it and every variant of its rows, and no other family\'s', () => {
    for (const f of FAMILIES) {
      expect(f.re.test(normalize(f.was)), `${f.name}: the R1 line`).toBe(true)
      for (const key of f.rows) {
        const row = STATE_TABLE[key]
        expect(row, `${f.name}: row ${key} exists`).toBeDefined()
        for (const v of row.variants) {
          const line = normalize(fillSlots(v, f.slots))
          expect(f.re.test(line), `${f.name}: ${key}: ${line}`).toBe(true)
          for (const other of FAMILIES) if (other !== f) expect(other.re.test(line), `${other.name} also matches ${line}`).toBe(false)
        }
      }
    }
  })
})

