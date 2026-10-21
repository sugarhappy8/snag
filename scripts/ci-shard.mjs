#!/usr/bin/env node
// ci-shard.mjs - splits the test suite into time-balanced shards for CI, and keeps the timings that balance them.
//
//   node scripts/ci-shard.mjs <i> <n>          the files of shard i of n (1-based), one per line (exit 1 when empty)
//   node scripts/ci-shard.mjs --fast           the fast tier: files with "// ci: fast" in their first 10 lines
//   node scripts/ci-shard.mjs --split          timings.split: files that run a seed slice in every shard (R1-P7)
//   node scripts/ci-shard.mjs --verify <n>     print each coverage problem; exit 1 if there is any
//   node scripts/ci-shard.mjs --plan <n>       per-shard seconds and file counts
//   node scripts/ci-shard.mjs --estimate       a fresh seeded timings JSON on stdout
//   node scripts/ci-shard.mjs --update <report...>   rewrite scripts/test-timings.json from vitest JSON reports
//                                              (a .json file) or default-reporter logs (anything else)
//   node scripts/ci-shard.mjs --summary <report...>  markdown of shard wall times and the 10 slowest files
//
// Options for every mode: --root DIR (another tree, which the tests point at fixtures) and --source TEXT (the
// "source" written by --update, for example ci:run-39420764187). Exit codes: 0 ok, 1 a problem, 2 bad usage.
//
// Why not "vitest --shard": that cuts equal file counts, and the five slowest files are 45% of the time.
// Why a sequencer too: with no vitest cache, files run in discovery order, so test/timings-sequencer.ts starts
// the heaviest first. Both read scripts/test-timings.json. See docs/CI.md.
//
// Dependency-free Node ESM (Node builtins only), also imported by the tests and by the sequencer.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
const TIMINGS_FILE = join(ROOT, 'scripts', 'test-timings.json')

/** What a test file weighs when the timings do not know it (a file added since the last refresh). */
export const DEFAULT_SECONDS = 5
/** Added to every file when planning: the JSON reporter leaves out module import time (about 8% of the total). */
export const FILE_OVERHEAD_SECONDS = 1.5

const FAST_MARKER = '// ci: fast'
const FAST_WINDOW_LINES = 10
// The seed-slice kit (test/shard-kit.ts) is spelled many ways: './shard-kit', '../test/shard-kit', './shard-kit.js', a
// dynamic import() or a require(). So a file counts as using it by what it does, not by one spelling.
const KIT_MODULE = String.raw`['"\`](?:[^'"\`\n]*/)?shard-kit(?:\.[cm]?[jt]s)?['"\`]`
// A real import or re-export statement at the start of a line (a string that quotes one, as a fixture does, is not one),
// or an import() or require() call anywhere.
const SHARD_KIT_IMPORT = new RegExp(String.raw`^[ \t]*(?:import|export)\s[^'"\`;]*?${KIT_MODULE}|\b(?:import|require)\s*\(\s*${KIT_MODULE}`, 'm')
// The kit's readers, and the variable that carries the slice. A file that names one runs only slice i of its seeds in
// shard i, so it has to be in split, or three quarters of its seeds are never played.
const SHARD_KIT_NAMES = /\b(?:readSlice|seedSlice|ownedHere|recordSlice|mergedSlices)\b|\bprocess\.env\.SLICE\b/
// The tests of the kit itself and of this planner write all of the above on purpose.
const SHARD_KIT_TESTS = new Set(['test/shard-kit.test.ts', 'test/ci-shard.test.ts'])
const TOTAL_ESTIMATE_SECONDS = 3869
// Measured at v4.0.2 (digest K, worker-seconds). The other files share the remaining 2,142 seconds.
const PINNED_SECONDS = {
  'test/simulate.test.ts': 494,
  'test/era-features.test.ts': 401,
  'test/main-character-life.test.ts': 340,
  'test/sector-story.test.ts': 278,
  'test/anachronism.test.ts': 214,
}
const SIM_WORDS = /createNewLife|ageUp\(|playYear|yearlyBusiness|playLife|makeTestGame/g
// An explicit timeout of 1,000 ms or more: "}, 120_000)" closing a test (so a money argument such as
// "managed('vc', {}, 50_000_000)" does not count), "timeout: 60_000", "const TIMEOUT = 300_000".
const TIMEOUT_FORMS = [/^[ \t]*\}\s*,\s*(\d[\d_]{3,})\s*\)/gm, /\btimeout:\s*(\d[\d_]{3,})/g, /\bconst TIMEOUT\s*=\s*(\d[\d_]{3,})/g]
const MAX_TIMEOUT_MS = 3_600_000
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
// A file line of the default reporter: mark, optional |project|, path, "(12 tests ...)", duration.
const LOG_FILE_LINE = /^\s*[\u2713\u2714\u00d7\u2717\u2193\u276f]\s+(?:\|[^|]*\|\s+)?(\S+\.test\.ts)\s+\([^)]*\)\s+(\d+(?:\.\d+)?)(ms|s)\b/

const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const round1 = (x) => Math.round(x * 10) / 10
const isJsonReport = (name) => name.toLowerCase().endsWith('.json')
const isCount = (n) => Number.isInteger(n) && n >= 1

// ---------------------------------------------------------------------------------------------- listing

function walk(dir, rel, out) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(join(dir, entry.name), path, out)
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) out.push(`test/${path}`)
  }
}

/** Every *.test.ts under test/ (the vite.config include rule), repo-relative with forward slashes, sorted. */
export function listTestFiles(root = ROOT) {
  const out = []
  walk(join(root, 'test'), '', out)
  return out.sort(byPath)
}

/** The test files whose first 10 lines contain "// ci: fast": the guards, run in their own job and in no shard. */
export function listFastFiles(root = ROOT) {
  return listTestFiles(root).filter((file) =>
    readFileSync(join(root, file), 'utf8')
      .split(/\r?\n/, FAST_WINDOW_LINES)
      .some((line) => line.includes(FAST_MARKER)),
  )
}

// ---------------------------------------------------------------------------------------------- timings

/** scripts/test-timings.json, checked: { v: 1, source, files: { "test/x.test.ts": seconds }, split: [paths] }. */
export function readTimings(file = TIMINGS_FILE) {
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read the timings ${file}: ${e.message}`)
  }
  const bad = (why) => new Error(`bad timings ${file}: ${why}`)
  if (!doc || typeof doc !== 'object' || doc.v !== 1) throw bad('"v" must be 1')
  if (!doc.files || typeof doc.files !== 'object' || Array.isArray(doc.files)) throw bad('"files" must be an object')
  const files = {}
  for (const [name, seconds] of Object.entries(doc.files)) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw bad(`"${name}" is not a number of seconds`)
    files[name] = seconds
  }
  if (!Array.isArray(doc.split) || doc.split.some((f) => typeof f !== 'string')) throw bad('"split" must be a list of paths')
  return { v: 1, source: typeof doc.source === 'string' ? doc.source : '', files, split: [...doc.split] }
}

/** Seconds for a file, without the planning overhead. A file the timings do not know weighs DEFAULT_SECONDS. */
export function weightOf(t, file) {
  return Object.hasOwn(t.files, file) ? t.files[file] : DEFAULT_SECONDS
}

// ---------------------------------------------------------------------------------------------- planning

function planWith(files, t, count, fast) {
  if (!isCount(count)) throw new RangeError(`the shard count must be a positive integer, got ${count}`)
  const skip = new Set(fast)
  const split = new Set(t.split)
  const list = [...new Set(files)].filter((f) => !skip.has(f))
  const splitFiles = list.filter((f) => split.has(f)).sort(byPath)
  const cost = (f) => weightOf(t, f) + FILE_OVERHEAD_SECONDS
  // Each shard runs its own slice of every split file, so each starts with 1/count of their weight.
  const loads = new Array(count).fill(sum(splitFiles.map(cost)) / count)
  const shards = Array.from({ length: count }, () => [])
  // Longest processing time first: heaviest file next, onto the lightest shard (ties: lowest index).
  const rest = list.filter((f) => !split.has(f)).sort((a, b) => cost(b) - cost(a) || byPath(a, b))
  for (const f of rest) {
    let at = 0
    for (let i = 1; i < count; i++) if (loads[i] < loads[at]) at = i
    shards[at].push(f)
    loads[at] += cost(f)
  }
  return shards.map((shard) => [...splitFiles, ...shard].sort(byPath))
}

/** The shards: fast files left out, split files in every shard, the rest spread longest-first. */
export function planShards(files, t, count) {
  return planWith(files, t, count, listFastFiles())
}

/** Planned seconds per shard (a split file counts 1/count of its weight in each). */
export function shardLoads(plan, t, count) {
  const split = new Set(t.split)
  return plan.map((shard) => sum(shard.map((f) => (weightOf(t, f) + FILE_OVERHEAD_SECONDS) / (split.has(f) ? count : 1))))
}

/** How a test file reaches the seed-slice kit: { imports: it imports the module, name: the first reader it names or null }. */
function shardKitUse(root, file) {
  const text = readFileSync(join(root, file), 'utf8')
  return { imports: SHARD_KIT_IMPORT.test(text), name: SHARD_KIT_NAMES.exec(text)?.[0] ?? null }
}

/** Every reason the shards would skip or repeat a test file. An empty list means CI runs each file as intended. */
export function verifyCoverage(count, root = ROOT) {
  if (!isCount(count)) return [`the shard count must be a positive integer, got ${count}`]
  let t
  try {
    t = readTimings(join(root, 'scripts', 'test-timings.json'))
  } catch (e) {
    return [e.message]
  }
  const all = listTestFiles(root)
  const onDisk = new Set(all)
  const fast = listFastFiles(root)
  const fastSet = new Set(fast)
  const split = new Set(t.split)
  const plan = planWith(all, t, count, fast)
  const homes = new Map()
  plan.forEach((shard, i) => {
    for (const f of shard) {
      if (!onDisk.has(f)) continue
      homes.set(f, [...(homes.get(f) ?? []), i + 1])
    }
  })
  const problems = []
  for (const f of t.split) if (!onDisk.has(f)) problems.push(`${f} is listed in split but is not a test file on disk`)
  plan.forEach((shard, i) => {
    for (const f of shard) if (!onDisk.has(f)) problems.push(`shard ${i + 1} lists ${f}, which is not on disk`)
  })
  for (const f of all) {
    const where = homes.get(f) ?? []
    if (fastSet.has(f)) {
      if (split.has(f)) problems.push(`${f} is in split and in the fast tier`)
      if (where.length > 0) problems.push(`${f} is in the fast tier and also in shard ${where.join(', ')}`)
      continue
    }
    const want = split.has(f) ? count : 1
    if (where.length !== want) problems.push(`${f} is in ${where.length} shard${where.length === 1 ? '' : 's'}, expected ${want}`)
  }
  for (const f of all) {
    if (SHARD_KIT_TESTS.has(f)) continue
    const { imports, name } = shardKitUse(root, f)
    const uses = imports || name !== null
    if (imports && !split.has(f)) problems.push(`${f} imports ./shard-kit but is not in split`)
    else if (name !== null && !split.has(f)) problems.push(`${f} uses the seed-slice kit (${name}) but is not in split`)
    if (!uses && split.has(f)) problems.push(`${f} is in split but does not import ./shard-kit`)
  }
  return problems
}

// ---------------------------------------------------------------------------------------------- reports

/** A path from a report as "test/x.test.ts": inside the repo it is made relative; a CI runner path is cut at its last /test/. */
function repoRelative(path, root = ROOT) {
  const posix = String(path).replace(/\\/g, '/')
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (posix.startsWith(`${base}/`)) return posix.slice(base.length + 1)
  const cut = posix.lastIndexOf('/test/')
  if (cut >= 0) return posix.slice(cut + 1)
  return /^(?:[A-Za-z]:)?\//.test(posix) ? null : posix.replace(/^\.\//, '')
}

function parseJsonReport(text, name) {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${name} is not a vitest JSON report (${e.message})`)
  }
}

function jsonFileSeconds(doc) {
  const out = {}
  for (const r of Array.isArray(doc?.testResults) ? doc.testResults : []) {
    const file = typeof r?.name === 'string' ? repoRelative(r.name) : null
    const seconds = (r?.endTime - r?.startTime) / 1000
    if (!file || !Number.isFinite(seconds) || seconds < 0) continue
    out[file] = Math.round(((out[file] ?? 0) + seconds) * 1000) / 1000
  }
  return out
}

function logFileSeconds(text) {
  const out = {}
  for (const line of text.replace(ANSI, '').split(/\r?\n/)) {
    const m = LOG_FILE_LINE.exec(line)
    const file = m ? repoRelative(m[1]) : null
    if (!file) continue
    const seconds = m[3] === 'ms' ? Number(m[2]) / 1000 : Number(m[2])
    out[file] = Math.round(((out[file] ?? 0) + seconds) * 1000) / 1000
  }
  return out
}

/**
 * Seconds per test file from a vitest JSON report (name ends in .json: endTime minus startTime of each file, which
 * leaves out module import) or from a default-reporter log ("<mark> test/x.test.ts (12 tests) 1234ms", also "1.2s").
 * Keys are repo-relative with forward slashes.
 */
export function parseTimingReport(text, name) {
  return isJsonReport(name) ? jsonFileSeconds(parseJsonReport(text, name)) : logFileSeconds(text)
}

/**
 * The timings after a refresh: files in the reports get the sum over the reports (a split file runs once per
 * shard), files in no report keep their old value, files no longer on disk are dropped; one decimal, keys sorted.
 */
export function mergeTimings(prev, reports, source, root = ROOT) {
  const totals = {}
  for (const report of reports) for (const [file, seconds] of Object.entries(report)) totals[file] = (totals[file] ?? 0) + seconds
  const merged = { ...prev.files, ...totals }
  const files = {}
  for (const file of Object.keys(merged).sort(byPath)) {
    if (!Number.isFinite(merged[file]) || !existsSync(join(root, file))) continue
    files[file] = round1(merged[file])
  }
  return { v: 1, source, files, split: [...prev.split] }
}

/**
 * A seeded guess for scripts/test-timings.json, used until the first CI run measures real numbers. The five files
 * measured in digest K are pinned; every other file gets a score from its size, how many lives it simulates and its
 * explicit timeouts, and the scores are scaled so the total is 3,869 worker-seconds.
 */
export function estimateTimings(root = ROOT) {
  const raw = {}
  const files = {}
  for (const file of listTestFiles(root)) {
    if (Object.hasOwn(PINNED_SECONDS, file)) {
      files[file] = PINNED_SECONDS[file]
      continue
    }
    const text = readFileSync(join(root, file), 'utf8')
    const sims = (text.match(SIM_WORDS) ?? []).length
    let timeoutMs = 0
    for (const form of TIMEOUT_FORMS) {
      for (const m of text.matchAll(form)) {
        const ms = Number(m[1].replaceAll('_', ''))
        if (ms <= MAX_TIMEOUT_MS) timeoutMs += ms
      }
    }
    raw[file] = 1 + Buffer.byteLength(text) / 30000 + 0.15 * Math.min(sims, 30) + timeoutMs / 8000
  }
  const names = Object.keys(raw)
  if (names.length > 0) {
    // Scale to the seconds the pinned files leave, then round to tenths so that the total stays exact
    // (largest remainder: the entries with the biggest dropped fraction get the spare tenths).
    const goal = Math.round((TOTAL_ESTIMATE_SECONDS - sum(Object.values(files))) * 10)
    const factor = goal / sum(Object.values(raw))
    const tenths = names.map((file) => ({ file, exact: raw[file] * factor }))
    for (const row of tenths) row.floor = Math.floor(row.exact)
    let spare = goal - sum(tenths.map((row) => row.floor))
    for (const row of [...tenths].sort((a, b) => b.exact - b.floor - (a.exact - a.floor) || byPath(a.file, b.file))) {
      if (spare <= 0) break
      row.floor += 1
      spare -= 1
    }
    for (const row of tenths) files[row.file] = row.floor / 10
  }
  const sorted = {}
  for (const file of Object.keys(files).sort(byPath)) sorted[file] = files[file]
  return { v: 1, source: 'estimate', files: sorted, split: [] }
}

/** Markdown for $GITHUB_STEP_SUMMARY: wall time and file count per report, then the 10 slowest files. */
export function shardSummary(reports) {
  const rows = []
  const totals = {}
  for (const { name, text } of reports) {
    let files
    let wall = null
    if (isJsonReport(name)) {
      const doc = parseJsonReport(text, name)
      files = jsonFileSeconds(doc)
      const results = Array.isArray(doc?.testResults) ? doc.testResults : []
      const ends = results.map((r) => r?.endTime).filter(Number.isFinite)
      const starts = results.map((r) => r?.startTime).filter(Number.isFinite)
      const from = Number.isFinite(doc?.startTime) ? doc.startTime : starts.length > 0 ? Math.min(...starts) : null
      if (from !== null && ends.length > 0) wall = (Math.max(...ends) - from) / 1000
    } else {
      files = logFileSeconds(text)
      const m = /Duration\s+(\d+(?:\.\d+)?)(ms|s)/.exec(text.replace(ANSI, ''))
      if (m) wall = m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1])
    }
    rows.push({ label: basename(name).replace(/\.[^.]+$/, ''), wall, count: Object.keys(files).length })
    for (const [file, seconds] of Object.entries(files)) totals[file] = (totals[file] ?? 0) + seconds
  }
  if (rows.length === 0) return 'No test timing reports were found.\n'
  const slowest = Object.entries(totals)
    .sort((a, b) => b[1] - a[1] || byPath(a[0], b[0]))
    .slice(0, 10)
  return [
    '### Test shards',
    '',
    '| Shard | Wall (s) | Files |',
    '|---|---:|---:|',
    ...rows.map((r) => `| ${r.label} | ${r.wall === null ? 'n/a' : r.wall.toFixed(1)} | ${r.count} |`),
    '',
    '### Slowest files',
    '',
    '| File | Seconds |',
    '|---|---:|',
    ...slowest.map(([file, seconds]) => `| ${file} | ${seconds.toFixed(1)} |`),
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------- command line

class UsageError extends Error {}

const USAGE = [
  'usage: node scripts/ci-shard.mjs <i> <n>',
  '       node scripts/ci-shard.mjs --fast | --split | --estimate',
  '       node scripts/ci-shard.mjs --verify <n> | --plan <n>',
  '       node scripts/ci-shard.mjs --update <report...> | --summary <report...>',
  '       options: --root DIR, --source TEXT',
].join('\n')

function parseArgs(argv) {
  let root = ROOT
  let source = 'update'
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' || arg === '--source') {
      const value = argv[++i]
      if (value === undefined) throw new UsageError(`${arg} needs a value`)
      if (arg === '--root') root = resolve(value)
      else source = value
    } else rest.push(arg)
  }
  return { root, source, rest }
}

function countArg(text) {
  if (!/^[1-9]\d{0,3}$/.test(text ?? '')) throw new UsageError(`expected a shard count, got "${text ?? ''}"`)
  return Number(text)
}

function lines(out, list) {
  if (list.length > 0) out.write(list.join('\n') + '\n')
}

/** The reports that can be read and parsed. One that cannot (a glob that matched nothing, a cut-off file) is skipped. */
function readReports(paths) {
  const reports = []
  for (const path of paths) {
    try {
      const text = readFileSync(path, 'utf8')
      parseTimingReport(text, path)
      reports.push({ name: path, text })
    } catch {
      // Skipped on purpose: the summary is a courtesy and must not fail the job that prints it.
    }
  }
  return reports
}

/** Runs one command line and returns the exit code. */
function run(argv, io = { out: process.stdout, err: process.stderr }) {
  try {
    const { root, source, rest } = parseArgs(argv)
    const timingsFile = join(root, 'scripts', 'test-timings.json')
    const [first, ...args] = rest
    const exact = (n) => {
      if (args.length !== n) throw new UsageError(`${first} takes ${n === 0 ? 'no arguments' : `${n} argument${n === 1 ? '' : 's'}`}`)
    }
    switch (first) {
      case undefined:
        throw new UsageError('nothing to do')
      case '--fast':
        exact(0)
        lines(io.out, listFastFiles(root))
        return 0
      case '--split':
        exact(0)
        lines(io.out, readTimings(timingsFile).split)
        return 0
      case '--verify': {
        exact(1)
        const problems = verifyCoverage(countArg(args[0]), root)
        lines(io.out, problems)
        return problems.length > 0 ? 1 : 0
      }
      case '--plan': {
        exact(1)
        const n = countArg(args[0])
        const t = readTimings(timingsFile)
        const fast = listFastFiles(root)
        const plan = planWith(listTestFiles(root), t, n, fast)
        const loads = shardLoads(plan, t, n)
        const mean = sum(loads) / n
        lines(io.out, [
          ...plan.map((shard, i) => `shard ${i + 1}: ${loads[i].toFixed(1)} s, ${shard.length} files`),
          `mean ${mean.toFixed(1)} s, longest ${Math.max(...loads).toFixed(1)} s, fast tier ${fast.length} files`,
        ])
        return 0
      }
      case '--estimate':
        exact(0)
        io.out.write(JSON.stringify(estimateTimings(root), null, 2) + '\n')
        return 0
      case '--update': {
        if (args.length === 0) throw new UsageError('--update needs at least one report')
        const reports = args.map((path) => parseTimingReport(readFileSync(path, 'utf8'), path))
        const next = mergeTimings(readTimings(timingsFile), reports, source, root)
        writeFileSync(timingsFile, JSON.stringify(next, null, 2) + '\n')
        io.err.write(`wrote ${timingsFile}: ${Object.keys(next.files).length} files from ${reports.length} report${reports.length === 1 ? '' : 's'}\n`)
        return 0
      }
      case '--summary':
        io.out.write(shardSummary(readReports(args)))
        return 0
      default: {
        if (first.startsWith('-')) throw new UsageError(`unknown option ${first}`)
        exact(1)
        const index = countArg(first)
        const n = countArg(args[0])
        if (index > n) throw new UsageError(`shard ${index} of ${n} does not exist`)
        const files = planWith(listTestFiles(root), readTimings(timingsFile), n, listFastFiles(root))[index - 1]
        if (files.length === 0) {
          io.err.write(`shard ${index} of ${n} has no files; an empty list would make vitest run everything\n`)
          return 1
        }
        lines(io.out, files)
        return 0
      }
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err.write(`${e.message}\n${USAGE}\n`)
      return 2
    }
    io.err.write(`${e instanceof Error ? e.message : String(e)}\n`)
    return 1
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) process.exitCode = run(process.argv.slice(2))
