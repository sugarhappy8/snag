// R2-P7 (E.T3 a): the 13-life repeat probe, tested on hand-built traces. The probe is the tool that measures the R2 acceptance
// number (the repeated-line rate of 13 lives, at most half of R1's), so its own arithmetic is pinned here without playing a
// life: the lives it asks for, how it counts a family, the ratio to the R1 record, and the record itself. One life is played
// twice at the end, to show a replay is byte-identical. test/text-repeat.test.ts plays all thirteen.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PlayedYear } from './play-kit'
import {
  PROBE_UNTIL_AGE,
  formatProbe,
  nightlyMetrics,
  playProbeLife,
  probeLives,
  ratioToR1,
  readBaseline,
  summarize,
  writeTextMetrics,
} from './text-probe'
import { mergeMetrics, normalize, textMetrics, type LifeTrace } from './text-metrics'

// ---- builders ----------------------------------------------------------------------------------------------------

const SYNTH_SEED = 1

/** One log line per entry, in the year given, so a line's year is easy to read off. */
function life(spec: ReadonlyArray<readonly [number, string]>): LifeTrace {
  const years: PlayedYear[] = spec.map(([y, text]) => ({ age: y - 2000, year: y, popups: [], lines: [{ text, tone: 'neutral' as const }] }))
  return { seed: SYNTH_SEED, birthYear: 2000, rich: false, years }
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

// ---- the lives ---------------------------------------------------------------------------------------------------

describe('probeLives', () => {
  it('names the 13 lives of the notice probe: seeds 101 to 113, six birth years in turn, rich on every second life', () => {
    const lives = probeLives(13)
    expect(lives).toHaveLength(13)
    expect(lives.map((l) => l.seed)).toEqual(Array.from({ length: 13 }, (_, i) => 101 + i))
    const years = [1925, 1950, 1975, 1990, 2010, 2026]
    expect(lives.map((l) => l.birthYear)).toEqual(Array.from({ length: 13 }, (_, i) => years[i % 6]))
    expect(lives.map((l) => l.rich)).toEqual(Array.from({ length: 13 }, (_, i) => i % 2 === 1))
  })

  it('defaults to 13, and a longer list starts with the same 13 (the nightly plays 20)', () => {
    expect(probeLives()).toEqual(probeLives(13))
    const twenty = probeLives(20)
    expect(twenty).toHaveLength(20)
    expect(twenty.slice(0, 13)).toEqual(probeLives(13))
    expect(twenty[19].seed).toBe(120)
    expect(probeLives(0)).toEqual([])
  })

  it('plays to age 85, as the notice probe does', () => {
    expect(PROBE_UNTIL_AGE).toBe(85)
  })
})

// ---- summarize ---------------------------------------------------------------------------------------------------

describe('summarize', () => {
  it('counts extra as the repeats beyond the first within a life, and a line in two lives once per life', () => {
    const a = life([
      [2000, 'I paid $50 in taxes.'],
      [2001, 'I paid $70 in taxes.'],
      [2002, 'I PAID $90 in taxes.'],
      [2003, 'Something else happened.'],
    ])
    const b = life([
      [2000, 'I paid $12 in taxes.'],
      [2001, 'I paid $13 in taxes.'],
    ])
    const r = summarize([a, b])
    expect(r.families).toEqual([{ text: 'i paid # in taxes.', extra: 3, total: 5, lives: 2 }])
    expect(r.repeated).toBe(3)
  })

  it('does not call a line repeated when each life has it once', () => {
    const r = summarize([life([[2000, 'I got a cat.']]), life([[2000, 'I got a cat.']])])
    expect(r.families).toEqual([])
    expect(r.repeated).toBe(0)
  })

  it('sorts by extra, most first, then by text', () => {
    const a = life([
      [2000, 'b line'],
      [2001, 'b line'],
      [2002, 'a line'],
      [2003, 'a line'],
      [2004, 'z line'],
      [2005, 'z line'],
      [2006, 'z line'],
      [2007, 'z line'],
    ])
    const r = summarize([a])
    expect(r.families.map((f) => [f.text, f.extra])).toEqual([
      ['z line', 3],
      ['a line', 1],
      ['b line', 1],
    ])
  })

  it('repeated is the sum of extra, and equals the repeats the metrics count', () => {
    const a = life([
      [2000, 'one'],
      [2001, 'one'],
      [2002, 'two'],
      [2003, 'two'],
      [2004, 'two'],
      [2005, 'three'],
    ])
    const b = life([
      [2000, 'one'],
      [2001, 'one'],
      [2002, 'one'],
    ])
    const r = summarize([a, b])
    expect(r.repeated).toBe(r.families.reduce((n, f) => n + f.extra, 0))
    expect(r.repeated).toBe(5)
    expect(r.repeated).toBe(r.lives.reduce((n, m) => n + Math.round(m.repeatedShare * m.lines), 0))
  })

  it('normalizes a family, cuts it to 100 characters, and never joins two lines that differ after the cut', () => {
    const head = 'x'.repeat(100)
    const a = life([
      [2000, `${head} one`],
      [2001, `${head} one`],
      [2002, `${head} two`],
      [2003, `${head} two`],
      [2004, 'Paid 1,200 in 1999.'],
      [2005, 'Paid 3,400 in 2001.'],
    ])
    const r = summarize([a])
    expect(r.families).toHaveLength(3)
    for (const f of r.families) expect(f.text.length).toBeLessThanOrEqual(100)
    expect(r.families.find((f) => f.text.startsWith('paid'))?.text).toBe(normalize('Paid 1,200 in 1999.'))
    expect(r.families.filter((f) => f.text === head)).toHaveLength(2)
    expect(r.families.map((f) => f.extra)).toEqual([1, 1, 1])
  })

  it('gives the per-life metrics, the merged metrics and nothing else for no lives', () => {
    const a = life([
      [2000, 'one'],
      [2001, 'one'],
    ])
    const b = life([[2000, 'two']])
    const r = summarize([a, b])
    expect(r.lives).toEqual([textMetrics(a), textMetrics(b)])
    expect(r.merged).toEqual(mergeMetrics(r.lives))
    const none = summarize([])
    expect(none.lives).toEqual([])
    expect(none.families).toEqual([])
    expect(none.repeated).toBe(0)
    expect(none.merged.lines).toBe(0)
  })

  it('reads a deep-frozen trace and changes nothing', () => {
    const a = deepFreeze(life([[2000, 'one'], [2001, 'one']]))
    const before = JSON.stringify(a)
    expect(summarize([a]).repeated).toBe(1)
    expect(JSON.stringify(a)).toBe(before)
  })
})

// ---- the record of R1 --------------------------------------------------------------------------------------------

describe('the R1 baseline', () => {
  const base = readBaseline()

  it('holds the 13 lives of the plan: 5,093 lines, 423 repeats, 266 within ten years, 41 lines over three times, at most 17', () => {
    expect(base.v).toBe(1)
    expect(base.perLife).toHaveLength(13)
    expect(base.merged.lines).toBe(5093)
    expect(base.merged.repeated).toBe(423)
    expect(base.merged.repeatedShare).toBeCloseTo(423 / 5093, 12)
    expect(base.merged.repeatedShare).toBeCloseTo(0.08305517376791675, 12)
    expect(base.merged.sameWithin10).toBe(266)
    expect(base.merged.over3).toEqual({ distinct: 41, max: 17 })
  })

  it('keeps the per-life lines and shares the plan records, and the rows add up to the merged numbers', () => {
    expect(base.perLife.map((l) => l.lines)).toEqual([365, 479, 159, 406, 271, 444, 368, 597, 410, 452, 320, 348, 474])
    expect(base.perLife.map((l) => Number(l.share.toFixed(4)))).toEqual([
      0.0932, 0.0731, 0.0126, 0.0985, 0.0369, 0.1374, 0.1196, 0.0754, 0.0805, 0.0951, 0.0563, 0.0977, 0.0506,
    ])
    expect(base.perLife.reduce((n, l) => n + l.lines, 0)).toBe(base.merged.lines)
    expect(base.perLife.reduce((n, l) => n + Math.round(l.share * l.lines), 0)).toBe(base.merged.repeated)
    expect(base.perLife.reduce((n, l) => n + l.in10, 0)).toBe(base.merged.sameWithin10)
    expect(base.perLife.reduce((n, l) => n + l.over3, 0)).toBe(base.merged.over3.distinct)
    expect(Math.max(...base.perLife.map((l) => l.max))).toBe(base.merged.over3.max)
  })

  it('names the spec it was measured with, and that spec is the one probeLives gives', () => {
    const lives = probeLives(base.spec.lives)
    expect(lives[0].seed).toBe(base.spec.firstSeed)
    expect(lives.map((l) => l.birthYear)).toEqual(lives.map((_, i) => base.spec.birthYears[i % base.spec.birthYears.length]))
    expect(base.spec.untilAge).toBe(PROBE_UNTIL_AGE)
    expect(base.recordedAt).toContain('a65349a')
  })

  it('makes the ratio the pooled share over R1 pooled share: half the share is 0.5, the same share is 1', () => {
    const blank = summarize([])
    const withShare = (repeatedShare: number) => ({ ...blank, merged: { ...blank.merged, repeatedShare } })
    expect(ratioToR1(withShare(base.merged.repeatedShare / 2))).toBeCloseTo(0.5, 12)
    expect(ratioToR1(withShare(base.merged.repeatedShare))).toBeCloseTo(1, 12)
    expect(ratioToR1(withShare(0))).toBe(0)
  })
})

// ---- the report and the nightly numbers --------------------------------------------------------------------------

describe('the report and the nightly metrics', () => {
  const r = summarize([
    life([
      [2000, 'I paid $50 in taxes.'],
      [2001, 'I paid $70 in taxes.'],
      [2002, 'A different line.'],
    ]),
    life([[2000, 'Only once.']]),
  ])

  it('formatProbe prints the pooled share, the ratio to R1, each life and the top families as extra, total, lives, text', () => {
    const out = formatProbe(r, 5)
    expect(out).toContain('2 lives')
    expect(out).toContain('R1')
    expect(out).toContain('ratio')
    expect(out).toMatch(/\bseed 101\b/)
    expect(out).toMatch(/\b1\s+2\s+1\s+i paid # in taxes\./)
    // top 0 prints no family rows
    expect(formatProbe(r, 0)).not.toContain('i paid # in taxes.')
  })

  it('nightlyMetrics names the three metrics of the nightly file, with finite numbers', () => {
    const m = nightlyMetrics(r)
    expect(Object.keys(m).sort()).toEqual(['text.lines.sum', 'text.repeatedShare', 'text.sameWithin10.sum'])
    expect(m['text.lines.sum']).toBe(4)
    expect(m['text.repeatedShare']).toBe(r.merged.repeatedShare)
    expect(m['text.sameWithin10.sum']).toBe(r.merged.sameWithin10)
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true)
  })

  it('writeTextMetrics writes <dir>/text-<shard>.json when NIGHTLY_METRICS_DIR is set, and nothing otherwise', () => {
    expect(writeTextMetrics(r, {})).toBeNull()
    const dir = mkdtempSync(join(tmpdir(), 'text-probe-'))
    try {
      const file = writeTextMetrics(r, { NIGHTLY_METRICS_DIR: dir, NIGHTLY_SHARD: '3' })
      expect(file).toBe(join(dir, 'text-3.json'))
      expect(readdirSync(dir)).toEqual(['text-3.json'])
      expect(JSON.parse(readFileSync(join(dir, 'text-3.json'), 'utf8'))).toEqual({ v: 1, job: 'text', shard: 3, metrics: nightlyMetrics(r) })
      const plain = writeTextMetrics(r, { NIGHTLY_METRICS_DIR: dir })
      expect(plain).toBe(join(dir, 'text-0.json'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---- a life ------------------------------------------------------------------------------------------------------

describe('playing a probe life', () => {
  it(
    'a replay of the third life gives byte-identical metrics',
    () => {
      const spec = probeLives(13)[2]
      const first = playProbeLife(spec)
      const again = playProbeLife(spec)
      expect(JSON.stringify(textMetrics(again.trace))).toBe(JSON.stringify(textMetrics(first.trace)))
      expect(first.trace.seed).toBe(spec.seed)
      expect(first.trace.birthYear).toBe(spec.birthYear)
      expect(first.trace.rich).toBe(spec.rich)
    },
    120_000,
  )
})
