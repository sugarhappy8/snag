// ci: fast
// R1-P1 (K.7a): the CI shard planner, the timing parser and the workflow that uses them. Every test file must land in
// the fast tier or in a shard, or CI would silently skip it, so this file is the proof of D.11 criterion 10 (shards
// cover all test files). It reads the real test/ directory and the committed scripts/test-timings.json, and builds
// small fixture trees for the rules that have nothing to check in the repo yet (the seed-slice kit of R1-P7).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_SECONDS,
  FILE_OVERHEAD_SECONDS,
  estimateTimings,
  listFastFiles,
  listTestFiles,
  mergeTimings,
  parseTimingReport,
  planShards,
  readTimings,
  shardLoads,
  shardSummary,
  verifyCoverage,
  weightOf,
  type Timings,
} from '../scripts/ci-shard.mjs'
import TimingsSequencer from './timings-sequencer'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'ci-shard.mjs')
const PINNED: Record<string, number> = {
  'test/simulate.test.ts': 494,
  'test/era-features.test.ts': 401,
  'test/main-character-life.test.ts': 340,
  'test/sector-story.test.ts': 278,
  'test/anachronism.test.ts': 214,
}
const SHARD_COUNTS = [1, 2, 3, 4, 5, 8]

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** A small repo-shaped tree: the given files, plus scripts/test-timings.json when timings is not null. */
function fixture(files: Record<string, string>, timings: Timings | null): string {
  const root = mkdtempSync(join(tmpdir(), 'ci-shard-'))
  scratch.push(root)
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  for (const [rel, text] of Object.entries(files)) put(rel, text)
  if (timings) put('scripts/test-timings.json', JSON.stringify(timings, null, 2) + '\n')
  return root
}

function cli(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' })
}

function emptyTimings(split: string[] = []): Timings {
  return { v: 1, source: 'test', files: {}, split }
}

describe('listTestFiles and listFastFiles', () => {
  it('lists every *.test.ts under test/, sorted, posix, with no helper kit', () => {
    const onDisk = readdirSync(join(ROOT, 'test'))
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => `test/${f}`)
      .sort()
    const listed = listTestFiles()
    expect(listed).toEqual(onDisk)
    // The v4.0.2 count; never an exact number, because every R1 task adds files.
    expect(listed.length).toBeGreaterThanOrEqual(389)
    expect(listed.some((f) => /-kit\.ts$/.test(f))).toBe(false)
  })

  it('puts a file in the fast tier when one of its first 10 lines carries the marker', () => {
    const fast = listFastFiles()
    expect(fast).toContain('test/ci-shard.test.ts')
    expect(fast).toContain('test/voice-guards.test.ts')
    expect(fast.every((f) => listTestFiles().includes(f))).toBe(true)

    const late = Array.from({ length: 10 }, () => '// filler').join('\n') + '\n// ci: fast\n'
    const root = fixture(
      {
        'test/early.test.ts': '// header\n// ci: fast\nexport {}\n',
        'test/late.test.ts': late,
        'test/plain.test.ts': 'export {}\n',
      },
      emptyTimings(),
    )
    expect(listFastFiles(root)).toEqual(['test/early.test.ts'])
  })
})

describe('planShards and verifyCoverage', () => {
  it('covers every test file: fast tier plus shards, and verifyCoverage is clean, for several shard counts', () => {
    const all = listTestFiles()
    for (const n of SHARD_COUNTS) {
      expect(verifyCoverage(n)).toEqual([])
      const plan = planShards(all, readTimings(), n)
      expect(plan).toHaveLength(n)
      const union = new Set([...plan.flat(), ...listFastFiles()])
      expect([...union].sort()).toEqual(all)
    }
  })

  it('puts a split file in every shard, any other file in exactly one, and a fast file in none', () => {
    const files = [...listTestFiles(), 'test/a.test.ts']
    const timings: Timings = { v: 1, source: 'synthetic', files: { 'test/a.test.ts': 300 }, split: ['test/a.test.ts'] }
    const fast = new Set(listFastFiles())
    for (const n of [2, 3, 4]) {
      const plan = planShards(files, timings, n)
      for (const shard of plan) expect(shard).toContain('test/a.test.ts')
      for (const f of files) {
        const homes = plan.filter((shard) => shard.includes(f)).length
        if (fast.has(f)) expect(homes).toBe(0)
        else expect(homes).toBe(f === 'test/a.test.ts' ? n : 1)
      }
      // The split file counts 1/n of its weight in each shard, so every load starts there.
      for (const load of shardLoads(plan, timings, n)) expect(load).toBeGreaterThanOrEqual((300 + FILE_OVERHEAD_SECONDS) / n)
    }
  })

  it('balances the committed timings: at most 8% over the mean for 4 shards, 15% for 8', () => {
    const timings = readTimings()
    const all = listTestFiles()
    for (const [n, limit] of [
      [4, 1.08],
      [8, 1.15],
    ] as const) {
      const loads = shardLoads(planShards(all, timings, n), timings, n)
      const mean = loads.reduce((a, b) => a + b, 0) / n
      expect(Math.max(...loads)).toBeLessThanOrEqual(mean * limit)
    }
  })

  it('is deterministic, and weighs a file missing from the timings at DEFAULT_SECONDS', () => {
    const all = listTestFiles()
    expect(planShards(all, readTimings(), 4)).toEqual(planShards(all, readTimings(), 4))

    const empty = emptyTimings()
    expect(weightOf(empty, 'test/not-there.test.ts')).toBe(DEFAULT_SECONDS)
    expect(weightOf({ ...empty, files: { 'test/x.test.ts': 12.5 } }, 'test/x.test.ts')).toBe(12.5)
    // Equal weights: LPT leaves the shards no further apart than one file.
    const loads = shardLoads(planShards(all, empty, 4), empty, 4)
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(DEFAULT_SECONDS + FILE_OVERHEAD_SECONDS)
  })

  it('reports the seed-slice kit rules (R1-P7) on a fixture tree', () => {
    const kit = "import { slice } from './shard-kit'\nexport {}\n"
    const timings = (split: string[]): Timings => ({ v: 1, source: 'test', files: {}, split })
    const clean = fixture({ 'test/a.test.ts': kit, 'test/b.test.ts': 'export {}\n' }, timings(['test/a.test.ts']))
    expect(verifyCoverage(3, clean)).toEqual([])

    const unlisted = fixture({ 'test/a.test.ts': kit, 'test/b.test.ts': 'export {}\n' }, timings([]))
    expect(verifyCoverage(3, unlisted).join('\n')).toMatch(/test\/a\.test\.ts imports \.\/shard-kit but is not in split/)

    const bare = fixture({ 'test/a.test.ts': kit, 'test/b.test.ts': 'export {}\n' }, timings(['test/a.test.ts', 'test/b.test.ts']))
    expect(verifyCoverage(3, bare).join('\n')).toMatch(/test\/b\.test\.ts is in split but does not import \.\/shard-kit/)

    const ghost = fixture({ 'test/a.test.ts': 'export {}\n' }, timings(['test/gone.test.ts']))
    expect(verifyCoverage(2, ghost).join('\n')).toMatch(/test\/gone\.test\.ts/)

    const fastSplit = fixture({ 'test/a.test.ts': '// ci: fast\n' + kit }, timings(['test/a.test.ts']))
    expect(verifyCoverage(2, fastSplit).join('\n')).toMatch(/test\/a\.test\.ts is in split and in the fast tier/)

    const noTimings = fixture({ 'test/a.test.ts': 'export {}\n' }, null)
    expect(verifyCoverage(2, noTimings)).toHaveLength(1)
    expect(verifyCoverage(0)).toHaveLength(1)
  })

  // A sliced file that the check cannot see would run one quarter of its seeds in the shards, and the merge step never
  // runs a file that is not in split. So the check goes by what the file does, not by how it spells the import.
  it('finds a file that uses the seed-slice kit however it spells the import or the reader', () => {
    const timings = (split: string[]): Timings => ({ v: 1, source: 'test', files: {}, split })
    const plain = 'export {}\n'
    const spellings: Record<string, string> = {
      'a parent path': "import { seedSlice } from '../test/shard-kit'\nexport const s = seedSlice([1], 'k')\n",
      'a .js extension': "import { seedSlice } from './shard-kit.js'\nexport const s = seedSlice([1], 'k')\n",
      'a .ts extension': "import { seedSlice } from './shard-kit.ts'\nexport const s = seedSlice([1], 'k')\n",
      'a side-effect import': "import './shard-kit'\nexport {}\n",
      'a re-export': "export * from './shard-kit'\n",
      'a dynamic import': "const kit = await import('./shard-kit')\nexport const s = kit.seedSlice([1], 'k')\n",
      'a require': "const kit = require('./shard-kit')\nexport {}\n",
      'a multi-line import': "import {\n  readSlice,\n  seedSlice,\n} from '../test/shard-kit.js'\nexport {}\n",
      'readSlice with no import in sight': 'const spec = globalThis.kit.readSlice()\nexport {}\n',
      'ownedHere': "export const own = globalThis.kit.ownedHere('k')\n",
      'recordSlice': "globalThis.kit.recordSlice('k', [])\nexport {}\n",
      'mergedSlices': "export const rows = globalThis.kit.mergedSlices('k')\n",
      'process.env.SLICE': "export const slice = process.env.SLICE ?? ''\n",
    }
    for (const [how, code] of Object.entries(spellings)) {
      const unlisted = fixture({ 'test/a.test.ts': code, 'test/b.test.ts': plain }, timings([]))
      const found = verifyCoverage(3, unlisted).join('\n')
      expect(found, how).toMatch(/test\/a\.test\.ts .*but is not in split/)
      expect(found, how).not.toMatch(/test\/b\.test\.ts/)
      const listed = fixture({ 'test/a.test.ts': code, 'test/b.test.ts': plain }, timings(['test/a.test.ts']))
      expect(verifyCoverage(3, listed), how).toEqual([])
    }
  })

  it('names the reader when the file never imports the kit by its name', () => {
    const timings: Timings = { v: 1, source: 'test', files: {}, split: [] }
    const root = fixture({ 'test/a.test.ts': 'const s = globalThis.kit.recordSlice("k", [])\nexport {}\n' }, timings)
    expect(verifyCoverage(2, root).join('\n')).toMatch(/test\/a\.test\.ts uses the seed-slice kit \(recordSlice\) but is not in split/)
  })

  it('counts a split file that spells the import some other way as a user of the kit', () => {
    const timings: Timings = { v: 1, source: 'test', files: {}, split: ['test/a.test.ts', 'test/b.test.ts'] }
    const root = fixture(
      { 'test/a.test.ts': "import { seedSlice } from '../test/shard-kit'\nexport {}\n", 'test/b.test.ts': 'export const none = 1\n' },
      timings,
    )
    const found = verifyCoverage(2, root).join('\n')
    expect(found).not.toMatch(/test\/a\.test\.ts/)
    expect(found).toMatch(/test\/b\.test\.ts is in split but does not import \.\/shard-kit/)
  })

  it('leaves the kit tests and a plain mention of the module alone', () => {
    const timings: Timings = { v: 1, source: 'test', files: {}, split: [] }
    const mentions = "import { readSlice } from '../test/shard-kit'\nexport const s = readSlice()\n"
    const root = fixture(
      {
        'test/shard-kit.test.ts': mentions,
        'test/ci-shard.test.ts': "const fixture = \"import { slice } from './shard-kit'\"\n" + mentions,
        'test/notes.test.ts': '// the slice kit lives in test/shard-kit.ts and this file does not use it\nexport {}\n',
      },
      timings,
    )
    expect(verifyCoverage(3, root).join('\n')).not.toMatch(/shard-kit\.test|ci-shard\.test/)
  })
})

describe('parseTimingReport', () => {
  it('reads a vitest JSON report: absolute paths become repo-relative seconds', () => {
    const report = JSON.stringify({
      startTime: 1_700_000_000_000,
      success: true,
      testResults: [
        { name: '/home/runner/work/AnotherLife/AnotherLife/test/simulate.test.ts', startTime: 1_700_000_000_500, endTime: 1_700_000_013_000, status: 'passed' },
        { name: `${ROOT}test/era-features.test.ts`, startTime: 1_700_000_001_000, endTime: 1_700_000_001_250.5, status: 'passed' },
        { name: 'C:\\agent\\work\\test\\store.test.ts', startTime: 1_700_000_002_000, endTime: 1_700_000_004_000, status: 'passed' },
      ],
    })
    expect(parseTimingReport(report, 'shard-1.json')).toEqual({
      'test/simulate.test.ts': 12.5,
      'test/era-features.test.ts': 0.251,
      'test/store.test.ts': 2,
    })
  })

  it('reads a default-reporter log: ms and s, with or without colour codes, ignoring other lines', () => {
    const log = [
      ' RUN  v5.0.3 /home/runner/work/AnotherLife/AnotherLife',
      '',
      ' \u2713 test/alpha.test.ts (12 tests) 1234ms',
      '   \u2713 a nested test line is not a file 1500ms',
      ' \u2713 test/beta.test.ts (3 tests | 1 skipped) 1.2s',
      ' \u001b[32m\u2713\u001b[39m test/gamma.test.ts \u001b[2m(2 tests)\u001b[22m\u001b[33m 2500ms\u001b[39m',
      ' \u2193 test/delta.test.ts (4 tests | 4 skipped) 3ms',
      '   Duration  5.11s (tests 80%, transform 16%, import 4%)',
    ].join('\n')
    expect(parseTimingReport(log, 'shard-1.log')).toEqual({
      'test/alpha.test.ts': 1.234,
      'test/beta.test.ts': 1.2,
      'test/gamma.test.ts': 2.5,
      'test/delta.test.ts': 0.003,
    })
  })

  it('returns nothing for a log with no file lines, and throws on a JSON report that is not JSON', () => {
    expect(parseTimingReport('nothing to see here\n', 'x.log')).toEqual({})
    expect(() => parseTimingReport('not json', 'x.json')).toThrow(/x\.json/)
  })
})

describe('mergeTimings', () => {
  it('sums a split file across reports, keeps what no report covers, drops deleted files, rounds and sorts', () => {
    const prev: Timings = {
      v: 1,
      source: 'estimate',
      files: {
        'test/simulate.test.ts': 494,
        'test/voice-guards.test.ts': 3.3,
        'test/deleted-long-ago.test.ts': 9,
        'test/ci-shard.test.ts': 1,
      },
      split: ['test/simulate.test.ts'],
    }
    const reports = [1, 2, 3, 4].map((i) => ({ 'test/simulate.test.ts': 100 + i / 100, 'test/ci-shard.test.ts': i === 1 ? 0.04 : 0 }))
    const out = mergeTimings(prev, reports, 'ci:run-1')
    expect(out.source).toBe('ci:run-1')
    expect(out.v).toBe(1)
    expect(out.split).toEqual(['test/simulate.test.ts'])
    expect(out.files['test/simulate.test.ts']).toBe(400.1) // 400.10 rounded to one decimal
    expect(out.files['test/voice-guards.test.ts']).toBe(3.3) // in no report: kept
    expect(out.files['test/ci-shard.test.ts']).toBe(0) // in the reports: replaced, not added to the old value
    expect('test/deleted-long-ago.test.ts' in out.files).toBe(false)
    expect(Object.keys(out.files)).toEqual([...Object.keys(out.files)].sort())
    expect(JSON.parse(JSON.stringify(out, null, 2))).toEqual(out)
    // The input is not changed.
    expect(prev.files['test/simulate.test.ts']).toBe(494)
  })

  it('adds a file that is on disk and new to the timings', () => {
    const out = mergeTimings(emptyTimings(), [{ 'test/store.test.ts': 7.26 }], 'x')
    expect(out.files).toEqual({ 'test/store.test.ts': 7.3 })
  })
})

describe('estimateTimings', () => {
  const estimate = estimateTimings()

  it('pins the five digest-K files exactly and totals 3,869 seconds', () => {
    expect(estimate.v).toBe(1)
    expect(estimate.source).toBe('estimate')
    expect(estimate.split).toEqual([])
    for (const [file, seconds] of Object.entries(PINNED)) expect(estimate.files[file]).toBe(seconds)
    const total = Object.values(estimate.files).reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 3869)).toBeLessThan(1)
  })

  it('ranks the five pinned files first, covers every test file, and rounds to one decimal', () => {
    const ranked = Object.entries(estimate.files).sort((a, b) => b[1] - a[1])
    expect(new Set(ranked.slice(0, 5).map(([f]) => f))).toEqual(new Set(Object.keys(PINNED)))
    for (const f of listTestFiles()) expect(estimate.files).toHaveProperty([f])
    for (const seconds of Object.values(estimate.files)) {
      expect(seconds).toBeGreaterThan(0)
      expect(Math.round(seconds * 10) / 10).toBe(seconds)
    }
    expect(Object.keys(estimate.files)).toEqual([...Object.keys(estimate.files)].sort())
  })

  it('keeps the committed timings in the canonical form that --update writes, whoever refreshed them', () => {
    const committed = readTimings()
    expect(committed.v).toBe(1)
    expect(Object.keys(committed.files)).toEqual([...Object.keys(committed.files)].sort())
    expect(readFileSync(join(ROOT, 'scripts', 'test-timings.json'), 'utf8')).toBe(JSON.stringify(committed, null, 2) + '\n')
  })
})

describe('shardSummary', () => {
  it('shows each shard wall time and names the slowest file', () => {
    const report = (start: number, ...rows: [string, number, number][]) =>
      JSON.stringify({
        startTime: start,
        testResults: rows.map(([name, s, e]) => ({ name: `/runner/work/test/${name}`, startTime: s, endTime: e })),
      })
    const md = shardSummary([
      { name: 'test-results/shard-1.json', text: report(1_000, ['x-heavy.test.ts', 2_000, 101_000], ['y.test.ts', 2_000, 3_000]) },
      { name: 'test-results/shard-2.json', text: report(5_000, ['z-slowest-of-all.test.ts', 6_000, 205_500]) },
    ])
    expect(md).toContain('shard-1')
    expect(md).toContain('shard-2')
    expect(md).toContain('100.0')
    expect(md).toContain('200.5')
    expect(md).toContain('test/z-slowest-of-all.test.ts')
    expect(md.indexOf('z-slowest-of-all')).toBeLessThan(md.indexOf('x-heavy'))
  })

  it('lists at most 10 files, and says so in one line when there is no report', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ name: `/r/test/f${String(i).padStart(2, '0')}.test.ts`, startTime: 0, endTime: (i + 1) * 1000 }))
    const md = shardSummary([{ name: 'shard-1.json', text: JSON.stringify({ startTime: 0, testResults: rows }) }])
    expect(md.match(/test\/f\d\d\.test\.ts/g)).toHaveLength(10)
    expect(md).toContain('test/f13.test.ts')
    expect(md).not.toContain('test/f03.test.ts')
    expect(shardSummary([]).trim().split('\n')).toHaveLength(1)
  })
})

describe('the command line', () => {
  it('prints a shard as real test files, and the shards plus the fast tier cover all of them once', () => {
    const first = cli('1', '4')
    expect(first.status).toBe(0)
    const all = listTestFiles()
    const lines = first.stdout.trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(all).toContain(line)

    // Each file shows up once, except a split file (R1-P7), which every one of the four shards lists.
    const split = new Set(readTimings().split)
    const seen = [1, 2, 3, 4].flatMap((i) => cli(String(i), '4').stdout.trim().split('\n'))
    seen.push(...cli('--fast').stdout.trim().split('\n'))
    const expected = all.flatMap((f) => (split.has(f) && !listFastFiles().includes(f) ? [f, f, f, f] : [f]))
    expect([...seen].sort()).toEqual(expected.sort())
  })

  it('exits 2 on bad usage and 0 when the coverage check is clean', () => {
    expect(cli('5', '4').status).toBe(2)
    expect(cli('0', '4').status).toBe(2)
    expect(cli('1').status).toBe(2)
    expect(cli('1.5', '4').status).toBe(2)
    expect(cli('--nope').status).toBe(2)
    expect(cli('--verify').status).toBe(2)
    expect(cli('--verify', '4').status).toBe(0)
    expect(cli('--split').status).toBe(0)
    expect(cli('--split').stdout).toBe(readTimings().split.map((f) => `${f}\n`).join(''))
  })

  it('prints the plan and a fresh estimate', () => {
    const plan = cli('--plan', '4')
    expect(plan.status).toBe(0)
    expect(plan.stdout.trim().split('\n').filter((l) => /^shard \d/.test(l))).toHaveLength(4)
    const estimate = cli('--estimate')
    expect(estimate.status).toBe(0)
    expect(JSON.parse(estimate.stdout)).toEqual(estimateTimings())
  })

  it('exits 1 for a shard with no files, so vitest never gets an empty list', () => {
    const root = fixture({ 'test/a.test.ts': 'export {}\n' }, emptyTimings())
    const run = cli('2', '2', '--root', root)
    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(cli('1', '2', '--root', root).stdout.trim()).toBe('test/a.test.ts')
  })

  it('--update rewrites the timings from reports in a fixture tree, and --summary survives unreadable ones', () => {
    const root = fixture(
      { 'test/a.test.ts': 'export {}\n', 'test/b.test.ts': 'export {}\n' },
      { v: 1, source: 'estimate', files: { 'test/a.test.ts': 10, 'test/b.test.ts': 20, 'test/old.test.ts': 30 }, split: [] },
    )
    const report = join(root, 'shard-1.json')
    writeFileSync(
      report,
      JSON.stringify({ startTime: 0, testResults: [{ name: '/runner/work/x/test/a.test.ts', startTime: 0, endTime: 4_250 }] }),
    )
    const run = cli('--root', root, '--source', 'ci:run-7', '--update', report)
    expect(run.status).toBe(0)
    const written = JSON.parse(readFileSync(join(root, 'scripts', 'test-timings.json'), 'utf8')) as Timings
    expect(written).toEqual({ v: 1, source: 'ci:run-7', files: { 'test/a.test.ts': 4.3, 'test/b.test.ts': 20 }, split: [] })
    expect(readFileSync(join(root, 'scripts', 'test-timings.json'), 'utf8').endsWith('}\n')).toBe(true)

    expect(cli('--root', root, '--update').status).toBe(2)
    const none = cli('--summary', join(root, 'nothing', '*.json'))
    expect(none.status).toBe(0)
    expect(none.stdout.trim().split('\n')).toHaveLength(1)
    const some = cli('--summary', join(root, 'nothing', '*.json'), report)
    expect(some.status).toBe(0)
    expect(some.stdout).toContain('shard-1')
  })
})

describe('the sequencer', () => {
  it('sorts the heaviest file first and breaks ties by path', async () => {
    const timings = readTimings()
    const names = [
      'test/zz-unknown-b.test.ts',
      'test/ci-shard.test.ts',
      'test/simulate.test.ts',
      'test/aa-unknown-a.test.ts',
      'test/sector-story.test.ts',
      'test/era-features.test.ts',
    ]
    const specs = names.map((rel) => ({ moduleId: join(ROOT, rel) }))
    const sequencer = new TimingsSequencer({ config: { root: ROOT } } as never)
    const sorted = (await sequencer.sort(specs as never)).map((s) => (s as unknown as { moduleId: string }).moduleId.slice(ROOT.length))
    const expected = [...names].sort((a, b) => weightOf(timings, b) - weightOf(timings, a) || (a < b ? -1 : 1))
    expect(sorted).toEqual(expected)
    // The two files missing from the timings weigh DEFAULT_SECONDS, so they sort by path.
    expect(sorted.indexOf('test/aa-unknown-a.test.ts')).toBeLessThan(sorted.indexOf('test/zz-unknown-b.test.ts'))
  })
})

describe('the CI workflow', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')

  it('keeps the name CI (release.yml listens for it) and the sharded matrix', () => {
    expect(yml.split('\n')[0]).toBe('name: CI')
    expect(yml).toContain('shard: [1, 2, 3, 4, 5, 6, 7, 8]')
    expect(yml).toContain('SLICE: ${{ matrix.shard }}/8')
    expect(yml).toContain('ci-shard.mjs ${{ matrix.shard }} 8')
  })

  it('has the five jobs, a gate that always runs, and no whole-suite step', () => {
    const jobsBlock = yml.slice(yml.indexOf('\njobs:\n'))
    const jobs = [...jobsBlock.matchAll(/^ {2}([a-z]+):\s*$/gm)].map((m) => m[1])
    expect(jobs).toEqual(['checks', 'fast', 'test', 'aggregate', 'gate'])
    const gate = yml.slice(yml.indexOf('\n  gate:\n'))
    expect(gate).toContain('if: ${{ always() }}')
    expect(gate).toContain('needs: [checks, fast, test, aggregate]')
    expect(yml.split('\n').some((line) => /\bnpm (run )?test\b/.test(line))).toBe(false)
  })

  // The group a run lands in, worked out from the workflow's own expression and a small context. `a || b` takes the
  // first non-empty name, as GitHub does.
  const groupFor = (ctx: Record<string, string>): string => {
    const expr = /^ {2}group: (.+)$/m.exec(yml)?.[1] ?? ''
    return expr.replace(/\$\{\{([^}]+)\}\}/g, (_all, e: string) => e.split('||').map((name) => ctx[name.trim()] ?? '').find((v) => v !== '') ?? '')
  }
  const push = (ref: string): Record<string, string> => ({ 'github.event_name': 'push', 'github.ref_name': ref, 'github.ref': `refs/heads/${ref}` })
  const pull = (number: number, head: string): Record<string, string> => ({
    'github.event_name': 'pull_request',
    'github.event.pull_request.number': String(number),
    'github.head_ref': head,
    'github.ref_name': `${number}/merge`,
    'github.ref': `refs/pull/${number}/merge`,
  })

  it('gives the push run and the pull_request run of one branch separate concurrency groups', () => {
    // Same branch, same commit: one run must not cancel the other, or the cancelled run's gate goes red.
    expect(groupFor(push('release/v4.1.0'))).not.toBe(groupFor(pull(7, 'release/v4.1.0')))
    // A fork PR whose head branch is called main is not the push run of main.
    expect(groupFor(pull(9, 'main'))).not.toBe(groupFor(push('main')))
    // Two PRs from forks that both call their branch main do not cancel each other.
    expect(groupFor(pull(9, 'main'))).not.toBe(groupFor(pull(10, 'main')))
  })

  it('keeps a newer run of the same branch in the group of the older one, so it still cancels it', () => {
    expect(groupFor(push('release/v4.1.0'))).toBe(groupFor(push('release/v4.1.0')))
    expect(groupFor(pull(7, 'release/v4.1.0'))).toBe(groupFor(pull(7, 'release/v4.1.0')))
    expect(groupFor(push('release/v4.1.0'))).not.toBe(groupFor(push('release/v4.1.1')))
    expect(groupFor(push('release/v4.1.0'))).not.toBe('')
    // main never cancels a run in progress.
    expect(yml).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}")
  })

  it('lets a re-run of one failed shard upload its artifact again', () => {
    // upload-artifact v4 refuses a second artifact of the same name in a run unless it may overwrite.
    const test = yml.slice(yml.indexOf('\n  test:\n'), yml.indexOf('\n  aggregate:\n'))
    const upload = test.slice(test.indexOf('actions/upload-artifact@v4'))
    expect(upload).toContain('name: shard-${{ matrix.shard }}')
    expect(upload).toMatch(/^ {10}overwrite: true$/m)
    // Still one artifact per shard for the aggregate job to merge.
    expect(yml).toContain('pattern: shard-*')
  })
})
