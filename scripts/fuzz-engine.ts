// Deep engine fuzzer, as a standalone node script (the kit lives in test/fuzz-kit.ts).
//
//   node_modules/.bin/esbuild scripts/fuzz-engine.ts --bundle --platform=node --format=esm \
//     --sourcemap --outfile=/tmp/fuzz-engine.mjs
//   node --enable-source-maps /tmp/fuzz-engine.mjs --start 1 --seeds 20 [--years 160] [--actions 6]
//     [--walk-every 1] [--sweep-every 3] [--sweep-max 150] [--depth 6] [--heirs 1] [--budget 600]
//     [--no-time-machine] [--fork [--heap MB]] [--quiet] [--json out.json]
//   node --enable-source-maps /tmp/fuzz-engine.mjs --industries [all|bakery,bank,...] [--start 1]
//     [--years 30] [--budget 600] [--fork]      (business mode: one company per industry)
//
// Plays `--seeds` lives starting at seed `--start` (birth year, country, talents and wealth all
// follow from the seed), prints a line per life and each new failure as it happens, then every
// distinct failure with the seed and the trail of steps that led to it. `--fork` plays each seed
// in its own child process (bounded memory for long runs). Exits 1 when anything failed
// ('note-' kinds, such as a big windfall, are for review and don't count).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALL_INDUSTRIES, DEFAULT_OPTIONS, FailureLog, formatFailures, fuzzBusiness, fuzzLife, type Failure, type FuzzOptions } from '../test/fuzz-kit'

const args = process.argv.slice(2)
const opt = (name: string, def: number): number => {
  const i = args.indexOf(name)
  return i >= 0 ? Number(args[i + 1]) : def
}
const str = (name: string): string | null => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}

const start = opt('--start', 1)
const industriesArg = str('--industries')
const industries = industriesArg === null ? null : industriesArg === 'all' ? [...ALL_INDUSTRIES] : industriesArg.split(',')
// Business mode plays one "seed" per industry.
const seeds = industries ? industries.length : opt('--seeds', 10)
const options: FuzzOptions = {
  ...DEFAULT_OPTIONS,
  maxYears: opt('--years', DEFAULT_OPTIONS.maxYears),
  actionsPerYear: opt('--actions', DEFAULT_OPTIONS.actionsPerYear),
  walkEvery: opt('--walk-every', DEFAULT_OPTIONS.walkEvery),
  maxDepth: opt('--depth', DEFAULT_OPTIONS.maxDepth),
  heirs: opt('--heirs', DEFAULT_OPTIONS.heirs),
  saveEvery: opt('--save-every', DEFAULT_OPTIONS.saveEvery),
  budgetMs: opt('--budget', 0) * 1000,
  sweepEvery: opt('--sweep-every', DEFAULT_OPTIONS.sweepEvery),
  sweepMax: opt('--sweep-max', DEFAULT_OPTIONS.sweepMax),
  timeMachine: !args.includes('--no-time-machine'),
}

// Engine code logs warnings for some recoverable situations; keep the output readable.
if (args.includes('--quiet')) console.warn = () => {}

function show(f: Failure): void {
  console.log(`   [${f.kind}] seed ${f.seed}, age ${f.age}: ${f.message.slice(0, 240)}`)
  if (f.kind.endsWith('throw')) console.log(f.stack.split('\n').slice(1, 7).map((l) => `      ${l.trim()}`).join('\n'))
}

const log = new FailureLog()
let years = 0
let actions = 0
let swept = 0
let nodes = 0
const allIndustries = new Set<string>()
const t0 = Date.now()

if (args.includes('--fork')) {
  // One child process per seed; the children stream their own lines and hand back a JSON report.
  const dir = mkdtempSync(join(tmpdir(), 'fuzz-'))
  const own = ['--fork', '--start', '--seeds', '--json', '--industries']
  const passOn = args.filter((a, i) => !own.includes(a) && !own.includes(args[i - 1]))
  for (let k = 0; k < seeds; k++) {
    const seed = start + k
    const out = join(dir, `seed-${seed}.json`)
    const which = industries ? ['--industries', industries[k]] : ['--seeds', '1']
    // A bounded heap per life: V8 collects instead of growing until the OS kills the process.
    const heap = process.execArgv.some((x) => x.startsWith('--max-old-space-size')) ? [] : [`--max-old-space-size=${opt('--heap', 1200)}`]
    const r = spawnSync(process.execPath, [...process.execArgv, ...heap, process.argv[1], ...passOn, '--start', String(seed), ...which, '--json', out, '--stats', `${out}.stats`], { stdio: ['ignore', 'inherit', 'inherit'] })
    if (r.status === null || (r.status !== 0 && r.status !== 1)) console.log(`   [process] seed ${seed} child exited with ${r.status ?? r.signal}`)
    try {
      for (const { first, count } of JSON.parse(readFileSync(out, 'utf8')) as { first: Failure; count: number }[]) {
        for (let k = 0; k < count; k++) log.add(first)
      }
      const s = JSON.parse(readFileSync(`${out}.stats`, 'utf8')) as { years: number; actions: number; swept: number; menuNodes: number; industries: string[] }
      years += s.years
      actions += s.actions
      swept += s.swept
      nodes += s.menuNodes
      for (const i of s.industries) allIndustries.add(i)
    } catch {
      // the child died before writing its report (reported above)
    }
  }
} else {
  log.onNew = show
  for (let k = 0; k < seeds; k++) {
    const seed = start + k
    const before = log.size
    const s = industries ? await fuzzBusiness(industries[k], seed, log, opt('--years', 30), options.budgetMs) : await fuzzLife(seed, log, options)
    years += s.years
    actions += s.actions
    swept += s.swept
    nodes += s.menuNodes
    for (const i of s.industries) allIndustries.add(i)
    console.log(
      `${industries ? `${industries[k]} ` : ''}seed ${seed}: ${s.years} years, ${s.generations} gen, ${s.actions} actions, ${s.swept} swept, ${s.menuNodes} actions seen in menus, industries [${s.industries.join(',')}], ${(s.ms / 1000).toFixed(1)}s, new failures ${log.size - before}`,
    )
    const stats = str('--stats')
    if (stats) writeFileSync(stats, JSON.stringify(s))
  }
}
const real = log.list().filter((x) => !x.first.kind.startsWith('note-')).length
console.log(`\nTOTAL: ${seeds} seeds, ${years} life-years, ${actions} actions, ${swept} swept actions, ${nodes} menu actions evaluated, ${allIndustries.size} industries, ${((Date.now() - t0) / 1000).toFixed(0)}s, ${log.size} distinct findings (${real} failures)`)
if (log.size && !args.includes('--stats')) console.log(`\n${formatFailures(log)}`)
const out = str('--json')
if (out) writeFileSync(out, JSON.stringify(log.list(), null, 1))
process.exitCode = real ? 1 : 0
