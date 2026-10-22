// ci: fast
// R2-P5 (K.7b f): the pure half of the nightly deep tier. scripts/nightly-lib.mjs has the sizes the workflow runs at, the merge of
// the shards' metric files, the rules and the diff against the previous night; scripts/nightly.mjs is its command line. Nothing
// here plays a life (test/nightly-probes.test.ts does), so the file runs in a few seconds: every rule is pinned on small numbers.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  RULES,
  checkMetricsFile,
  diffMarkdown,
  diffMetrics,
  mergeMetricFiles,
  nightlySizes,
  parseFuzzTotal,
  parseShard,
  percentile,
  sizeEnv,
  type MetricsFile,
  type Rule,
} from '../scripts/nightly-lib.mjs'
import { ROOT } from './scan-kit'
import { textMetrics } from './text-metrics'
import type { PlayedPopup, PlayedYear } from './play-kit'

/** A hand-built trace has no life behind it; the seed is only the field LifeTrace asks for (a name, so no seed pin is written). */
const TRACE_SEED = 0

/** One entry of the list fuzz-engine writes with --json: a finding, the first time it was seen and how often. */
const finding = (kind: string, at: number, count = 1) => ({ first: { kind, seed: at, age: 3, message: 'boom', stack: '' }, count })

const file = (job: string, shard: number, metrics: Record<string, number>, samples?: Record<string, number[]>): MetricsFile => ({ v: 1, job, shard, metrics, ...(samples ? { samples } : {}) })

// ---------------------------------------------------------------------------------------------- 1. the sizes

describe('nightlySizes', () => {
  const full = nightlySizes('full')
  const smoke = nightlySizes('smoke')

  it('full is the roadmap list: 40 fuzz seeds by 160 years, 200 balance lives, 100x ceilings, 400 anachronism lives, old saves for 20 years', () => {
    expect(full.fuzz.shards * full.fuzz.seedsPerShard).toBe(40)
    expect(full.fuzz.shards).toBe(8)
    expect(full.fuzz.years).toBe(160)
    expect(full.fuzz.budgetSeconds).toBe(600)
    expect(full.balance.shards * full.balance.lives).toBe(200)
    expect(full.ceiling.scale).toBe(100)
    expect(full.ceiling.shards * full.ceiling.lives).toBe(24)
    expect(full.ceiling.years).toBe(20)
    expect(full.anachronism).toEqual({ lives: 400, slices: 8 })
    // The repeat probe plays its fixed 13 lives (the gate is stated over them): it has no size to set.
    expect(full).not.toHaveProperty('text')
    expect(smoke).not.toHaveProperty('text')
    expect(full.oldSaves.years).toBeGreaterThanOrEqual(5)
    expect(full.oldSaves).toEqual({ years: 20, reseeds: 8 })
  })

  it('smoke is strictly smaller in every size it has, and keeps the shape (shards, slices and the 100x scale) so the whole workflow runs', () => {
    const sizes: [string, number, number][] = [
      ['fuzz.seedsPerShard', smoke.fuzz.seedsPerShard, full.fuzz.seedsPerShard],
      ['fuzz.years', smoke.fuzz.years, full.fuzz.years],
      ['fuzz.budgetSeconds', smoke.fuzz.budgetSeconds, full.fuzz.budgetSeconds],
      ['balance.lives', smoke.balance.lives, full.balance.lives],
      ['balance.years', smoke.balance.years, full.balance.years],
      ['ceiling.lives', smoke.ceiling.lives, full.ceiling.lives],
      ['ceiling.years', smoke.ceiling.years, full.ceiling.years],
      ['anachronism.lives', smoke.anachronism.lives, full.anachronism.lives],
      ['oldSaves.years', smoke.oldSaves.years, full.oldSaves.years],
      ['oldSaves.reseeds', smoke.oldSaves.reseeds, full.oldSaves.reseeds],
    ]
    for (const [name, small, big] of sizes) {
      expect(small, name).toBeGreaterThan(0)
      expect(small, name).toBeLessThan(big)
    }
    expect(smoke.fuzz.shards).toBe(full.fuzz.shards)
    expect(smoke.balance.shards).toBe(full.balance.shards)
    expect(smoke.ceiling.shards).toBe(full.ceiling.shards)
    expect(smoke.anachronism.slices).toBe(full.anachronism.slices)
    expect(smoke.ceiling.scale).toBe(full.ceiling.scale)
  })

  it('returns a fresh object each call, and refuses a scale that is neither full nor smoke', () => {
    const a = nightlySizes('full')
    a.fuzz.years = 1
    expect(nightlySizes('full').fuzz.years).toBe(160)
    expect(() => nightlySizes('huge' as 'full')).toThrow(/full.*smoke/)
  })
})

describe('sizeEnv and parseShard', () => {
  const asMap = (pairs: readonly (readonly [string, string])[]): Record<string, string> => Object.fromEntries(pairs)

  it('reads i/n with 1 <= i <= n and n the shard count of a job', () => {
    expect(parseShard('2/8')).toEqual({ i: 2, n: 8 })
    expect(parseShard('4/4')).toEqual({ i: 4, n: 4 })
    for (const bad of ['0/8', '9/8', '1/3', '2', '/8', '1/', 'a/b', '1/8/2', '-1/8', '']) expect(() => parseShard(bad), bad).toThrow(/shard/)
  })

  it('without a shard prints the sizes every job shares and no start offsets', () => {
    const env = asMap(sizeEnv('full'))
    expect(env.FUZZ_YEARS).toBe('160')
    expect(env.FUZZ_BUDGET).toBe('600')
    expect(env.CEILING_SCALE).toBe('100')
    expect(env.ANACHRONISM_LIVES).toBe('400')
    expect(env).not.toHaveProperty('TEXT_PROBE_LIVES')
    expect(env.OLD_SAVES_YEARS).toBe('20')
    expect(env.OLD_SAVES_RESEEDS).toBe('8')
    expect(Object.keys(env).filter((k) => k.endsWith('_START'))).toEqual([])
  })

  it('shard i of n gives each job that has an i-th shard its own run of seeds, with no overlap and no gap', () => {
    const fuzz = Array.from({ length: 8 }, (_, k) => asMap(sizeEnv('full', { i: k + 1, n: 8 })))
    expect(fuzz.map((e) => Number(e.FUZZ_START))).toEqual([1, 6, 11, 16, 21, 26, 31, 36])
    expect(new Set(fuzz.map((e) => e.FUZZ_SEEDS))).toEqual(new Set(['5']))
    const balance = Array.from({ length: 4 }, (_, k) => asMap(sizeEnv('full', { i: k + 1, n: 4 })))
    expect(balance.map((e) => Number(e.BALANCE_START))).toEqual([1, 51, 101, 151])
    expect(balance.map((e) => e.BALANCE_COUNT)).toEqual(['50', '50', '50', '50'])
    expect(balance.map((e) => Number(e.CEILING_START))).toEqual([1, 7, 13, 19])
    expect(balance.map((e) => e.CEILING_COUNT)).toEqual(['6', '6', '6', '6'])
    // a job with fewer shards than i has no start of its own
    expect(asMap(sizeEnv('full', { i: 6, n: 8 })).BALANCE_START).toBeUndefined()
  })

  it('every name the workflow reads is printed, for both scales', () => {
    const names = ['FUZZ_START', 'FUZZ_SEEDS', 'FUZZ_YEARS', 'FUZZ_BUDGET', 'BALANCE_START', 'BALANCE_COUNT', 'BALANCE_YEARS', 'CEILING_START', 'CEILING_COUNT', 'CEILING_YEARS', 'CEILING_SCALE', 'ANACHRONISM_LIVES', 'ANACHRONISM_SLICES', 'OLD_SAVES_YEARS', 'OLD_SAVES_RESEEDS']
    for (const scale of ['full', 'smoke'] as const) {
      const env = asMap(sizeEnv(scale, { i: 1, n: 8 }))
      for (const name of names) expect(env[name], `${scale} ${name}`).toMatch(/^\d+$/)
    }
  })
})

// ---------------------------------------------------------------------------------------------- 2. percentile

describe('percentile', () => {
  it('is the nearest rank: the value at rank ceil(p * n / 100) of the sorted list', () => {
    expect(percentile([5, 1, 3, 2, 4, 9, 8, 7, 6, 10], 50)).toBe(5)
    expect(percentile([5, 1, 3, 2, 4, 9, 8, 7, 6, 10], 90)).toBe(9)
    expect(percentile([5, 1, 3, 2, 4, 9, 8, 7, 6, 10], 95)).toBe(10)
    expect(percentile([3, 1, 2], 50)).toBe(2)
    expect(percentile([3, 1, 2], 10)).toBe(1)
    expect(percentile([3, 1, 2], 100)).toBe(3)
    expect(percentile([42], 10)).toBe(42)
    expect(percentile([42], 99)).toBe(42)
  })

  it('gives NaN for an empty list and leaves the list alone', () => {
    expect(percentile([], 50)).toBeNaN()
    const xs = [3, 1, 2]
    percentile(xs, 50)
    expect(xs).toEqual([3, 1, 2])
  })

  it('agrees with the spread test/text-metrics.ts reports for the same numbers (p50, p90, max)', () => {
    const popup = (n: number): PlayedPopup => ({ kind: 'notice', title: `T${n}`, text: 'Something happened.', passive: true, item: { kind: 'notice', id: `m${n}`, title: `T${n}`, text: 'Something happened.' } })
    const trace = (counts: readonly number[]): PlayedYear[] => counts.map((c, y) => ({ age: y, year: 2000 + y, popups: Array.from({ length: c }, (_, k) => popup(y * 100 + k)), lines: [] }))
    for (const counts of [[0], [4], [1, 2], [3, 1, 2], [5, 1, 3, 2, 4, 9, 8, 7, 6, 10], [0, 0, 0, 0, 7, 0, 0, 1, 2, 0, 3, 0, 0], Array.from({ length: 37 }, (_, k) => (k * 7) % 11)]) {
      const spread = textMetrics({ seed: TRACE_SEED, birthYear: 2000, rich: false, years: trace(counts) }).popupsPerYear
      expect(percentile(counts, 50), counts.join(',')).toBe(spread.p50)
      expect(percentile(counts, 90), counts.join(',')).toBe(spread.p90)
      expect(percentile(counts, 100), counts.join(',')).toBe(spread.max)
    }
  })
})

// ---------------------------------------------------------------------------------------------- 3. merging

describe('mergeMetricFiles', () => {
  it('adds the .sum names and takes the biggest of the .max names', () => {
    const merged = mergeMetricFiles([file('balance', 1, { 'balance.lives.sum': 50, 'balance.x.max': 3 }), file('balance', 2, { 'balance.lives.sum': 50, 'balance.x.max': 9 }), file('balance', 3, { 'balance.lives.sum': 7, 'balance.x.max': 4 })])
    expect(merged['balance.lives.sum']).toBe(107)
    expect(merged['balance.x.max']).toBe(9)
  })

  it('pools samples across files and expands each name to n, p10, p50, p90, p95, p99 and max (percentiles of the pool, never averages of shard percentiles)', () => {
    const merged = mergeMetricFiles([file('balance', 1, {}, { 'balance.birth.final': [1, 2, 3, 4, 5] }), file('balance', 2, {}, { 'balance.birth.final': [6, 7, 8, 9, 10] })])
    expect(Object.keys(merged).sort()).toEqual(['balance.birth.final.max', 'balance.birth.final.n', 'balance.birth.final.p10', 'balance.birth.final.p50', 'balance.birth.final.p90', 'balance.birth.final.p95', 'balance.birth.final.p99'])
    expect(merged['balance.birth.final.n']).toBe(10)
    expect(merged['balance.birth.final.p10']).toBe(1)
    expect(merged['balance.birth.final.p50']).toBe(5)
    expect(merged['balance.birth.final.p90']).toBe(9)
    expect(merged['balance.birth.final.p95']).toBe(10)
    expect(merged['balance.birth.final.p99']).toBe(10)
    expect(merged['balance.birth.final.max']).toBe(10)
  })

  it('writes only n for a sample name no shard filled (no NaN reaches the diff)', () => {
    const merged = mergeMetricFiles([file('balance', 1, {}, { 'balance.birth.age80': [] }), file('balance', 2, {}, { 'balance.birth.age80': [] })])
    expect(merged).toEqual({ 'balance.birth.age80.n': 0 })
  })

  it('refuses a name two files both write that is not a .sum or a .max, and names both files', () => {
    expect(() => mergeMetricFiles([file('text', 1, { 'text.repeatedShare': 0.03 }), file('text', 2, { 'text.repeatedShare': 0.05 })])).toThrow(/text\.repeatedShare.*text-1.*text-2/s)
    // one writer is fine
    expect(mergeMetricFiles([file('text', 1, { 'text.repeatedShare': 0.03 }), file('balance', 1, { 'balance.lives.sum': 2 })])['text.repeatedShare']).toBe(0.03)
  })

  it('refuses an expanded sample name that another file writes as a metric', () => {
    expect(() => mergeMetricFiles([file('a', 1, { 'x.max': 1 }), file('b', 1, {}, { x: [1, 2] })])).toThrow(/x\.max/)
  })

  it('returns its names in sorted order, so the same shards always give the same file', () => {
    const merged = mergeMetricFiles([file('b', 1, { 'z.sum': 1 }), file('a', 1, { 'a.sum': 1, 'm.sum': 2 })])
    expect(Object.keys(merged)).toEqual(['a.sum', 'm.sum', 'z.sum'])
  })

  it('checkMetricsFile accepts what writeMetrics writes and refuses a file that is not that shape', () => {
    expect(checkMetricsFile(file('balance', 1, { 'a.b': 1 }, { 'c.d': [1] }), 'f.json').job).toBe('balance')
    for (const bad of [null, [], { v: 2, job: 'a', shard: 0, metrics: {} }, { v: 1, job: 'a', shard: 0 }, { v: 1, job: 'a', shard: 0, metrics: { 'a.b': 'x' } }, { v: 1, job: 'a', shard: 0, metrics: { 'A.b': 1 } }, { v: 1, job: '', shard: 0, metrics: {} }, { v: 1, job: 'a', shard: 0, metrics: {}, samples: { 'a.b': [1, 'x'] } }]) {
      expect(() => checkMetricsFile(bad, 'f.json'), JSON.stringify(bad)).toThrow(/f\.json/)
    }
  })
})

// ---------------------------------------------------------------------------------------------- 4. the diff

describe('diffMetrics', () => {
  const byName = (rows: ReturnType<typeof diffMetrics>, name: string) => {
    const row = rows.find((r) => r.name === name)
    if (!row) throw new Error(`no row for ${name}`)
    return row
  }

  it('a cap breach is a hard fail, with or without a previous night; a value at the cap passes', () => {
    const prev = { 'fuzz.failures.sum': 0, 'balance.birth.msYear.p95': 25 }
    const rows = diffMetrics(prev, { 'fuzz.failures.sum': 1, 'balance.birth.msYear.p95': 160 })
    expect(byName(rows, 'fuzz.failures.sum').verdict).toBe('fail')
    expect(byName(rows, 'fuzz.failures.sum').why).toMatch(/fuzz failure is a bug/)
    expect(byName(rows, 'balance.birth.msYear.p95').verdict).toBe('ok')
    expect(byName(diffMetrics(prev, { 'balance.birth.msYear.p95': 160.5 }), 'balance.birth.msYear.p95').verdict).toBe('fail')
    expect(byName(diffMetrics(null, { 'fuzz.failures.sum': 2 }), 'fuzz.failures.sum').verdict).toBe('fail')
  })

  it('the hard caps of the plan, each at its limit and just over it', () => {
    const cases: [string, number, number][] = [
      ['fuzz.failures.sum', 0, 1],
      ['fuzz.nototal.sum', 0, 1],
      ['balance.birth.final.max', 1e13, 1.1e13],
      ['balance.founder.peak.max', 1e13, 1.1e13],
      ['ceiling.life.maxNetWorth.max', 1e12, 1.1e12],
      ['ceiling.life.growth.max', 40, 41],
      ['balance.birth.msYear.p95', 160, 161],
      ['text.repeatedShare', 0.0415, 0.0416],
      ['oldsaves.failures.sum', 0, 1],
      ['anachronism.findings.sum', 0, 1],
    ]
    for (const [name, limit, over] of cases) {
      expect(byName(diffMetrics({ [name]: limit }, { [name]: limit }), name).verdict, `${name} at ${limit}`).toBe('ok')
      const bad = byName(diffMetrics({ [name]: limit }, { [name]: over }), name)
      expect(bad.verdict, `${name} at ${over}`).toBe('fail')
      expect(bad.why.length, name).toBeGreaterThan(10)
    }
  })

  it('a relative rule only warns: a quarter on a median, half on anything else', () => {
    const rows = diffMetrics({ 'balance.birth.age40.p50': 100, 'balance.birth.age40.p90': 100, 'other.thing.sum': 100, 'other.same.sum': 100 }, { 'balance.birth.age40.p50': 126, 'balance.birth.age40.p90': 140, 'other.thing.sum': 151, 'other.same.sum': 149 })
    expect(byName(rows, 'balance.birth.age40.p50').verdict).toBe('warn')
    expect(byName(rows, 'balance.birth.age40.p90').verdict).toBe('ok')
    expect(byName(rows, 'other.thing.sum').verdict).toBe('warn')
    expect(byName(rows, 'other.same.sum').verdict).toBe('ok')
    expect(rows.some((r) => r.verdict === 'fail')).toBe(false)
    // a drop counts as much as a rise
    expect(byName(diffMetrics({ 'a.b.sum': 100 }, { 'a.b.sum': 40 }), 'a.b.sum').verdict).toBe('warn')
    // from nothing to something is worth a look; nothing to nothing is not
    expect(byName(diffMetrics({ 'a.b.sum': 0 }, { 'a.b.sum': 3 }), 'a.b.sum').verdict).toBe('warn')
    expect(byName(diffMetrics({ 'a.b.sum': 0 }, { 'a.b.sum': 0 }), 'a.b.sum').verdict).toBe('ok')
  })

  it('a metric new tonight is new, one missing is gone (a warning that fails nothing)', () => {
    const rows = diffMetrics({ 'old.one.sum': 4, 'both.sum': 1 }, { 'both.sum': 1, 'fresh.one.sum': 9 })
    expect(byName(rows, 'fresh.one.sum')).toMatchObject({ verdict: 'new', prev: null, cur: 9 })
    expect(byName(rows, 'old.one.sum')).toMatchObject({ verdict: 'gone', prev: 4, cur: null })
    expect(byName(rows, 'both.sum').verdict).toBe('ok')
  })

  it('no previous night marks everything new and fails nothing that is inside its caps', () => {
    const rows = diffMetrics(null, { 'balance.birth.final.p50': 5, 'fuzz.failures.sum': 0, 'a.b.sum': 3 })
    expect(rows.map((r) => r.verdict)).toEqual(['new', 'new', 'new'])
    expect(rows.every((r) => r.prev === null)).toBe(true)
  })

  it('the first matching rule wins (two rules that overlap)', () => {
    const rules: readonly Rule[] = [
      { match: 'a.b.*', kind: 'cap', limit: 10, hard: true, why: 'first' },
      { match: 'a.*', kind: 'rel', limit: 0.01, hard: false, why: 'second' },
    ]
    const rows = diffMetrics({ 'a.b.x': 5, 'a.c.x': 5 }, { 'a.b.x': 6, 'a.c.x': 6 }, rules)
    expect(byName(rows, 'a.b.x')).toMatchObject({ verdict: 'ok' })
    expect(byName(rows, 'a.c.x')).toMatchObject({ verdict: 'warn', why: expect.stringContaining('second') })
    const swapped = diffMetrics({ 'a.b.x': 5 }, { 'a.b.x': 6 }, [rules[1], rules[0]])
    expect(byName(swapped, 'a.b.x').verdict).toBe('warn')
  })

  it('a * in a rule matches any run of characters, dots included, and nothing else', () => {
    const rules: readonly Rule[] = [{ match: 'balance.*.max', kind: 'cap', limit: 1, hard: true, why: 'cap' }]
    const rows = diffMetrics(null, { 'balance.birth.age25.max': 2, 'balance.max': 2, 'balance.birth.max.p50': 2, 'xbalance.birth.max': 2 }, rules)
    expect(rows.filter((r) => r.verdict === 'fail').map((r) => r.name)).toEqual(['balance.birth.age25.max'])
  })

  it('a NaN or infinite current value fails, whatever the rules say', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const row = byName(diffMetrics({ 'a.b.sum': 1 }, { 'a.b.sum': bad }, []), 'a.b.sum')
      expect(row.verdict, String(bad)).toBe('fail')
      expect(row.why).toMatch(/finite/)
    }
  })

  it('rows come back in name order', () => {
    const rows = diffMetrics({ 'z.sum': 1 }, { 'b.sum': 1, 'a.sum': 1, 'z.sum': 1 })
    expect(rows.map((r) => r.name)).toEqual(['a.sum', 'b.sum', 'z.sum'])
  })
})

describe('RULES', () => {
  it('has the plan table in order, ends with the catch-all, and gives every row a reason', () => {
    expect(RULES.map((r) => r.match)).toEqual([
      'fuzz.failures.sum',
      'fuzz.nototal.sum',
      'balance.*.max',
      'ceiling.life.maxNetWorth.max',
      'ceiling.life.growth.max',
      'balance.birth.msYear.p95',
      'text.repeatedShare',
      'oldsaves.failures.sum',
      'anachronism.findings.sum',
      'balance.*.p50',
      '*',
    ])
    expect(RULES[RULES.length - 1]).toMatchObject({ kind: 'rel', limit: 0.5, hard: false })
    expect(RULES.find((r) => r.match === 'balance.*.p50')).toMatchObject({ kind: 'rel', limit: 0.25, hard: false })
    for (const r of RULES) expect(r.why.length, r.match).toBeGreaterThan(10)
    expect(RULES.filter((r) => r.hard).every((r) => r.kind === 'cap')).toBe(true)
  })

  it('has no dash of either kind in its text', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
    for (const r of RULES) expect(r.why).not.toMatch(dashes)
  })
})

// ---------------------------------------------------------------------------------------------- 5. the markdown

describe('diffMarkdown', () => {
  const rows = diffMetrics(
    { 'fuzz.failures.sum': 0, 'other.thing.sum': 100, 'calm.sum': 5, 'old.one.sum': 1 },
    { 'fuzz.failures.sum': 3, 'other.thing.sum': 200, 'calm.sum': 5, 'new.one.sum': 2 },
  )

  it('lists the failed jobs first, then every warn and fail row with its reason', () => {
    const md = diffMarkdown(rows, ['fuzz', 'balance'])
    expect(md.indexOf('fuzz, balance')).toBeGreaterThan(-1)
    for (const name of ['fuzz.failures.sum', 'other.thing.sum']) expect(md.indexOf('fuzz, balance'), name).toBeLessThan(md.indexOf(name))
    const fail = rows.find((r) => r.verdict === 'fail')
    const warn = rows.find((r) => r.verdict === 'warn')
    expect(md).toContain(`\`${fail?.name}\``)
    expect(md).toContain(fail?.why ?? 'missing')
    expect(md).toContain(`\`${warn?.name}\``)
    expect(md).toContain(warn?.why ?? 'missing')
    expect(md).toMatch(/FAIL/)
    expect(md).toMatch(/WARN/)
  })

  it('says all jobs passed when none failed, counts the rows, and has no dash of either kind', () => {
    const md = diffMarkdown(rows, [])
    expect(md).toMatch(/all jobs passed/i)
    expect(md).toMatch(/1 failed/)
    expect(md).toMatch(/1 warning/)
    expect(md).toMatch(/1 new/)
    expect(md).toMatch(/1 gone/)
    expect(md).not.toMatch(new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`))
  })

  it('a clean night says so and shows no problem table', () => {
    const md = diffMarkdown(diffMetrics({ 'a.b.sum': 1 }, { 'a.b.sum': 1 }), [])
    expect(md).toMatch(/no hard failure/i)
    expect(md).not.toMatch(/FAIL/)
  })
})

// ---------------------------------------------------------------------------------------------- 6. the fuzzer's TOTAL line

describe('parseFuzzTotal', () => {
  it('reads every count from the line the fuzzer prints', () => {
    const line = 'TOTAL: 5 seeds, 800 life-years, 4123 actions, 310 swept actions, 9001 menu actions evaluated, 47 industries, 93s, 3 distinct findings (2 failures)'
    expect(parseFuzzTotal(`seed 1: ...\nsomething\n\n${line}\n`)).toEqual({
      'fuzz.seeds.sum': 5,
      'fuzz.years.sum': 800,
      'fuzz.actions.sum': 4123,
      'fuzz.swept.sum': 310,
      'fuzz.menuActions.sum': 9001,
      'fuzz.industries.max': 47,
      'fuzz.seconds.max': 93,
      'fuzz.findings.sum': 3,
      'fuzz.failures.sum': 2,
      'fuzz.nototal.sum': 0,
    })
  })

  it('takes the last TOTAL line: a forked run prints one per child and then its own', () => {
    const child = 'TOTAL: 1 seeds, 40 life-years, 5 actions, 1 swept actions, 6 menu actions evaluated, 3 industries, 2s, 0 distinct findings (0 failures)'
    const parent = 'TOTAL: 2 seeds, 80 life-years, 10 actions, 2 swept actions, 12 menu actions evaluated, 4 industries, 5s, 1 distinct findings (1 failures)'
    const m = parseFuzzTotal(`${child}\n${child}\n${parent}\n`)
    expect(m['fuzz.seeds.sum']).toBe(2)
    expect(m['fuzz.failures.sum']).toBe(1)
  })

  it('a log without the line gives zero counts and a fuzz.nototal.sum of 1', () => {
    const m = parseFuzzTotal('seed 1: crashed\nOut of memory\n')
    expect(m['fuzz.nototal.sum']).toBe(1)
    for (const [name, value] of Object.entries(m)) if (name !== 'fuzz.nototal.sum') expect(value, name).toBe(0)
    expect(parseFuzzTotal('')['fuzz.nototal.sum']).toBe(1)
  })

  it('reads the line scripts/fuzz-engine.ts really builds (a change to its wording must change the parser)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'fuzz-engine.ts'), 'utf8')
    const template = /console\.log\(`\\nTOTAL: (.*)`\)/.exec(src)?.[1]
    expect(template, 'the TOTAL template of scripts/fuzz-engine.ts moved').toBeTruthy()
    let k = 10
    const line = `TOTAL: ${(template ?? '').replace(/\$\{[^}]*\}/g, () => String(++k))}`
    const m = parseFuzzTotal(line)
    expect(m['fuzz.nototal.sum'], line).toBe(0)
    expect(m['fuzz.seeds.sum']).toBe(11)
    expect(m['fuzz.years.sum']).toBe(12)
  })
})

// ---------------------------------------------------------------------------------------------- 8. the command line

describe('scripts/nightly.mjs', () => {
  const work = mkdtempSync(join(tmpdir(), 'nightly-cli-'))
  afterAll(() => rmSync(work, { recursive: true, force: true }))
  const nightly = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'nightly.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' })
  const put = (name: string, value: unknown): string => {
    const path = join(work, name)
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }
  const read = (path: string): { v: number; metrics: Record<string, number>; failedJobs: string[] } => JSON.parse(readFileSync(path, 'utf8'))

  it('sizes prints KEY=VALUE lines for GITHUB_ENV: sizes smoke --shard 2/8 has the fuzz start and seeds', () => {
    const run = nightly('sizes', 'smoke', '--shard', '2/8')
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toMatch(/^FUZZ_START=2$/m)
    expect(run.stdout).toMatch(/^FUZZ_SEEDS=1$/m)
    expect(run.stdout.split('\n').filter(Boolean).every((l) => /^[A-Z][A-Z_]*=\d+$/.test(l))).toBe(true)
    const full = nightly('sizes', 'full', '--shard', '2/8')
    expect(full.stdout).toMatch(/^FUZZ_START=6$/m)
    expect(full.stdout).toMatch(/^FUZZ_SEEDS=5$/m)
    expect(nightly('sizes', 'full').stdout).not.toMatch(/_START=/)
  })

  it('merge then diff --prev none on two tiny files exits 0 and prints markdown', () => {
    const a = put('balance-1.json', file('balance', 1, { 'balance.lives.sum': 2 }, { 'balance.birth.final': [1, 2] }))
    const b = put('balance-2.json', file('balance', 2, { 'balance.lives.sum': 2 }, { 'balance.birth.final': [3, 4] }))
    const out = join(work, 'all.json')
    const merged = nightly('merge', '--out', out, '--result', 'balance=success', a, b)
    expect(merged.status, merged.stderr).toBe(0)
    expect(read(out)).toMatchObject({ v: 1, failedJobs: [], metrics: { 'balance.lives.sum': 4, 'balance.birth.final.n': 4, 'balance.birth.final.max': 4 } })
    const diff = nightly('diff', '--prev', 'none', '--cur', out)
    expect(diff.status, diff.stderr).toBe(0)
    expect(diff.stdout).toMatch(/Nightly metrics/)
  })

  it('a failed job is recorded by merge and fails diff, named first', () => {
    const a = put('ok-1.json', file('balance', 1, { 'balance.lives.sum': 2 }))
    const out = join(work, 'failed.json')
    const merged = nightly('merge', '--out', out, '--result', 'balance=success', '--result', 'fuzz=failure', '--result', 'metrics-skipped=skipped', a)
    expect(merged.status, merged.stderr).toBe(0)
    expect(read(out).failedJobs).toEqual(['fuzz', 'metrics-skipped'])
    const diff = nightly('diff', '--prev', 'none', '--cur', out)
    expect(diff.status).toBe(1)
    expect(diff.stdout).toMatch(/fuzz, metrics-skipped/)
  })

  it('a cap breach exits 1 and names the metric, against a previous night or none', () => {
    const bad = put('bad.json', { v: 1, failedJobs: [], metrics: { 'fuzz.failures.sum': 2, 'a.b.sum': 1 } })
    const good = put('good.json', { v: 1, failedJobs: [], metrics: { 'fuzz.failures.sum': 0, 'a.b.sum': 1 } })
    for (const prev of ['none', good]) {
      const run = nightly('diff', '--prev', prev, '--cur', bad)
      expect(run.status, `prev ${prev}`).toBe(1)
      expect(run.stdout).toContain('fuzz.failures.sum')
    }
    expect(nightly('diff', '--prev', good, '--cur', good).status).toBe(0)
  })

  it('a relative move only warns: exit 0 with a WARN row', () => {
    const prev = put('prev.json', { v: 1, failedJobs: [], metrics: { 'a.b.sum': 10 } })
    const cur = put('cur.json', { v: 1, failedJobs: [], metrics: { 'a.b.sum': 30 } })
    const run = nightly('diff', '--prev', prev, '--cur', cur)
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toMatch(/WARN/)
  })

  it('fuzz-metrics reads the log and the failure list into a metrics file the merge accepts', () => {
    const log = put('fuzz.log', 'seed 6: 160 years\nTOTAL: 5 seeds, 800 life-years, 12 actions, 3 swept actions, 40 menu actions evaluated, 9 industries, 12s, 2 distinct findings (1 failures)\n')
    const list = put('fuzz.json', [finding('engine-throw', 7, 2), finding('note-big-windfall', 8)])
    const out = join(work, 'fuzz-3.json')
    const run = nightly('fuzz-metrics', '--shard', '3', '--log', log, '--json', list, '--out', out)
    expect(run.status, run.stderr).toBe(0)
    const written = JSON.parse(readFileSync(out, 'utf8')) as MetricsFile
    expect(written).toMatchObject({ v: 1, job: 'fuzz', shard: 3 })
    expect(written.metrics['fuzz.years.sum']).toBe(800)
    expect(written.metrics['fuzz.failures.sum']).toBe(1)
    expect(written.metrics['fuzz.notes.sum']).toBe(1)
    expect(mergeMetricFiles([checkMetricsFile(written, out)])['fuzz.years.sum']).toBe(800)
  })

  it('fuzz-metrics counts a failure the list has and the log does not say, and still writes when the list is missing or the log has no TOTAL', () => {
    const log = put('fuzz2.log', 'TOTAL: 1 seeds, 40 life-years, 1 actions, 0 swept actions, 1 menu actions evaluated, 1 industries, 1s, 0 distinct findings (0 failures)\n')
    const list = put('fuzz2.json', [finding('engine-throw', 7)])
    const out = join(work, 'fuzz-1.json')
    expect(nightly('fuzz-metrics', '--shard', '1', '--log', log, '--json', list, '--out', out).status).toBe(0)
    expect((JSON.parse(readFileSync(out, 'utf8')) as MetricsFile).metrics['fuzz.failures.sum']).toBe(1)
    const gone = nightly('fuzz-metrics', '--shard', '1', '--log', log, '--json', join(work, 'missing.json'), '--out', out)
    expect(gone.status, gone.stderr).toBe(0)
    expect((JSON.parse(readFileSync(out, 'utf8')) as MetricsFile).metrics['fuzz.failures.sum']).toBe(0)
    const none = put('fuzz3.log', 'crashed\n')
    expect(nightly('fuzz-metrics', '--shard', '1', '--log', none, '--json', join(work, 'missing.json'), '--out', out).status).toBe(0)
    expect((JSON.parse(readFileSync(out, 'utf8')) as MetricsFile).metrics['fuzz.nototal.sum']).toBe(1)
  })

  it('merge refuses a name two shards both write (exit 1, both files named), and a file that is not a metrics file', () => {
    const a = put('dup-1.json', file('text', 1, { 'text.repeatedShare': 0.01 }))
    const b = put('dup-2.json', file('text', 2, { 'text.repeatedShare': 0.02 }))
    const run = nightly('merge', '--out', join(work, 'dup.json'), a, b)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/text\.repeatedShare/)
    const junk = put('junk.json', '{"nope":1}')
    const bad = nightly('merge', '--out', join(work, 'junk-out.json'), junk)
    expect(bad.status).toBe(1)
    expect(bad.stderr).toMatch(/junk\.json/)
  })

  it('a bad command, a missing option, a bad shard or an unknown flag exits 2', () => {
    expect(nightly('bogus').status).toBe(2)
    expect(nightly().status).toBe(2)
    expect(nightly('sizes').status).toBe(2)
    expect(nightly('sizes', 'huge').status).toBe(2)
    expect(nightly('sizes', 'full', '--shard', '9/8').status).toBe(2)
    expect(nightly('sizes', 'full', '--shard', '1/3').status).toBe(2)
    expect(nightly('sizes', 'full', '--nope').status).toBe(2)
    expect(nightly('diff', '--cur', join(work, 'cur.json')).status).toBe(2)
    expect(nightly('diff', '--prev', 'none').status).toBe(2)
    expect(nightly('diff', '--prev', join(work, 'no-such-file.json'), '--cur', join(work, 'cur.json')).status).toBe(2)
    expect(nightly('merge', join(work, 'cur.json')).status).toBe(2)
    expect(nightly('merge', '--out', join(work, 'x.json')).status).toBe(2)
    expect(nightly('merge', '--out', join(work, 'x.json'), '--result', 'nojob', join(work, 'cur.json')).status).toBe(2)
    expect(nightly('fuzz-metrics', '--shard', 'x', '--log', 'a', '--out', 'b').status).toBe(2)
    expect(nightly('help').status).toBe(0)
  })
})
