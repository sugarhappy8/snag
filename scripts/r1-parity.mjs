#!/usr/bin/env node
// r1-parity.mjs - the R1 parity and cost probe (R1-P9). R1 promises no simulation output changes, and that a tap costs
// within 5% of before. This plays the same seeded lives on two trees, compares what they saved and times the work a tap does.
//
//   node scripts/r1-parity.mjs play    --repo <dir> --out <dir> [--lives 30] [--years 40] [--flags none|all]
//   node scripts/r1-parity.mjs compare --base <dir> --r1 <dir> [--repo-r1 <dir>]
//   node scripts/r1-parity.mjs cost    --base <dir> --r1 <dir> [--reps 15] [--limit 1.05]
//
// play     bundles a small driver with esbuild against the tree in --repo (a git worktree of release/v4.0.3 for the
//          baseline, the R1 head for the other side), plays the lives of lifeSpecs() in one node process and writes
//          <out>/life-<seed>-<kind>.json.gz (gzip of JSON.stringify of the final state) and <out>/index.json (an array of
//          { seed, kind, age, alive, bytes, nodes, ms }: bytes is the JSON length, ms the time to play the life).
//          A 'birth' life is createNewLife from age 0 and `years` calls of ageUp; a 'founder' life is probeLife. The queue is
//          cleared every year, so no choices are made and nothing depends on R1 code. --flags none (the default) turns every
//          build flag off, --flags all turns every one on (a tree without src/game/flags.ts has none; --flags all needs one).
// compare  reads the baseline folder as is and the R1 folder through stripR1 (test/r1-strip.ts of --repo-r1, default .),
//          prints one line per life (ok, or the JSON pointer of the first difference with both values) and which keys the
//          stripper took out of the R1 run. Exit 1 on any difference. The lead runs it three times against one baseline:
//          R1 with --flags none, R1 with --flags all and R1 again (determinism).
// cost     times structuredClone and JSON.stringify of each final state (what act() in ui/store.ts does on every tap, plus the
//          save), median of --reps rounds after 3 warm-up rounds, and prints a markdown table. Exit 1 when the mean R1 over
//          baseline time ratio is above --limit. The ratio is of final states of the same seeds, so it also shows what the
//          new optional keys cost. D.11 criterion 12 stays a decision for the lead.
//
// About 4 to 6 minutes a tree for 30 lives of 40 years: a script for the lead's release gate, not a test. Exit codes: 0 ok,
// 1 a difference, a cost over the limit or a failed run, 2 bad usage. Node builtins plus esbuild (a devDependency).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { costRatio, countNodes, firstDiff, formatCostTable, lifeSpecs, median } from './r1-parity-lib.mjs'

const LIB = fileURLToPath(new URL('./r1-parity-lib.mjs', import.meta.url))
const USAGE = `usage: node scripts/r1-parity.mjs <command> [options]
  play    --repo <dir> --out <dir> [--lives 30] [--years 40] [--flags none|all]
  compare --base <dir> --r1 <dir> [--repo-r1 <dir>]
  cost    --base <dir> --r1 <dir> [--reps 15] [--limit 1.05]`

const WARMUP_ROUNDS = 3
const DEFAULT_LIMIT = 1.05
const LINE_CAP = 120

class UsageError extends Error {}

const str = { type: 'string' }
const COMMANDS = {
  play: { options: { repo: str, out: str, lives: str, years: str, flags: str }, required: ['repo', 'out'], run: play },
  compare: { options: { base: str, r1: str, 'repo-r1': str }, required: ['base', 'r1'], run: compare },
  cost: { options: { base: str, r1: str, reps: str, limit: str }, required: ['base', 'r1'], run: cost },
}

// ---------------------------------------------------------------------------------------------- arguments

function wholeNumber(values, name, fallback, min, max) {
  const raw = values[name]
  if (raw === undefined) return fallback
  const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN
  if (!(n >= min && n <= max)) throw new UsageError(`--${name} needs a whole number from ${min} to ${max}`)
  return n
}

function parse(def, args) {
  try {
    const { values } = parseArgs({ args, options: def.options, allowPositionals: false, strict: true })
    for (const name of def.required) if (values[name] === undefined) throw new Error(`--${name} is required`)
    return values
  } catch (err) {
    throw new UsageError(err.message)
  }
}

// ---------------------------------------------------------------------------------------------- bundling

/** Bundles with esbuild for node into one .mjs file. `entry` is { entryPoints } or { stdin }. */
async function bundleTo(entry, file) {
  const { build } = await import('esbuild')
  const result = await build({ ...entry, bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false, logLevel: 'silent' })
  writeFileSync(file, result.outputFiles[0].text)
}

// The driver the bundle is made of. It imports by absolute path, so one script plays whichever tree --repo names.
function driverSource(repo, hasFlags, config) {
  const at = (path) => JSON.stringify(join(repo, path))
  return `
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { ageUp } from ${at('src/game/aging')}
import { createNewLife } from ${at('src/game/life')}
import { probeLife } from ${at('test/probe-life')}
import { countNodes } from ${JSON.stringify(LIB)}
${hasFlags ? `import { FLAG_DEFS, setFlags } from ${at('src/game/flags')}` : ''}
const CONFIG = ${JSON.stringify(config)}

${hasFlags ? 'setFlags(Object.fromEntries(Object.keys(FLAG_DEFS).map((key) => [key, CONFIG.flags === "all"])))' : ''}

function playLife(spec) {
  if (spec.kind === 'founder') {
    return probeLife({ seed: spec.seed, birthYear: spec.birthYear, businesses: spec.businesses, years: spec.years, keepAlive: false })
  }
  const g = createNewLife({ seed: spec.seed, year: spec.birthYear })
  for (let y = 0; y < spec.years && g.character.alive; y++) {
    g.queue = []
    ageUp(g)
  }
  return g
}

mkdirSync(CONFIG.out, { recursive: true })
const index = []
CONFIG.specs.forEach((spec, i) => {
  const started = performance.now()
  let g
  try {
    g = playLife(spec)
  } catch (err) {
    console.error('seed ' + spec.seed + ' (' + spec.kind + ') failed: ' + (err && err.message))
    throw err
  }
  const json = JSON.stringify(g)
  const ms = Math.round(performance.now() - started)
  writeFileSync(join(CONFIG.out, 'life-' + spec.seed + '-' + spec.kind + '.json.gz'), gzipSync(json))
  index.push({ seed: spec.seed, kind: spec.kind, age: g.character.age, alive: g.character.alive, bytes: Buffer.byteLength(json), nodes: countNodes(JSON.parse(json)), ms })
  console.error('[' + (i + 1) + '/' + CONFIG.specs.length + '] seed ' + spec.seed + ' ' + spec.kind + ': age ' + g.character.age + (g.character.alive ? '' : ' (dead)') + ', ' + ms + ' ms')
})
writeFileSync(join(CONFIG.out, 'index.json'), JSON.stringify(index, null, 1) + '\\n')
`
}

// ---------------------------------------------------------------------------------------------- play

async function play(values) {
  const repo = resolve(values.repo)
  const out = resolve(values.out)
  const lives = wholeNumber(values, 'lives', 30, 1, 1000)
  const years = wholeNumber(values, 'years', 40, 1, 200)
  const flags = values.flags ?? 'none'
  if (flags !== 'none' && flags !== 'all') throw new UsageError('--flags is none or all')
  if (!existsSync(join(repo, 'test', 'probe-life.ts'))) throw new UsageError(`${repo} has no test/probe-life.ts (--repo must be a tree of this game)`)
  const hasFlags = existsSync(join(repo, 'src', 'game', 'flags.ts'))
  if (flags === 'all' && !hasFlags) throw new UsageError(`${repo} has no src/game/flags.ts, so there are no flags to turn on`)

  const work = mkdtempSync(join(tmpdir(), 'r1-parity-'))
  try {
    const file = join(work, 'driver.mjs')
    const contents = driverSource(repo, hasFlags, { specs: lifeSpecs(lives, years), out, flags })
    await bundleTo({ stdin: { contents, resolveDir: repo, sourcefile: 'r1-parity-driver.ts', loader: 'ts' } }, file)
    const run = spawnSync(process.execPath, [file], { stdio: ['ignore', 'inherit', 'inherit'] })
    if (run.status !== 0) {
      console.error(`play failed (exit ${run.status ?? run.signal})`)
      return 1
    }
    console.log(`played ${lives} lives of ${years} years from ${repo} (flags ${flags}) into ${out}`)
    return 0
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------------------------- reading a run

function readRun(dir) {
  const root = resolve(dir)
  const file = join(root, 'index.json')
  if (!existsSync(file)) throw new UsageError(`${file} does not exist (was the folder made by "play"?)`)
  const index = JSON.parse(readFileSync(file, 'utf8'))
  const ok = (row) => row && Number.isInteger(row.seed) && (row.kind === 'birth' || row.kind === 'founder')
  if (!Array.isArray(index) || !index.every(ok)) throw new UsageError(`${file} is not an index written by "play"`)
  return { root, index }
}

const keyOf = (row) => `${row.seed}-${row.kind}`
const labelOf = (row) => `seed ${row.seed} ${row.kind}`
const loadLife = (run, row) => JSON.parse(gunzipSync(readFileSync(join(run.root, `life-${keyOf(row)}.json.gz`))).toString('utf8'))
const cut = (text) => (text.length > LINE_CAP ? `${text.slice(0, LINE_CAP - 3)}...` : text)
const show = (v) => (v === undefined ? 'missing' : JSON.stringify(v))

/** Lives of the base run paired with the R1 run's, plus the lives only one side has (as printable labels). */
function pairLives(base, r1) {
  const theirs = new Map(r1.index.map((row) => [keyOf(row), row]))
  const pairs = base.index.filter((row) => theirs.has(keyOf(row))).map((row) => [row, theirs.get(keyOf(row))])
  const ours = new Set(base.index.map(keyOf))
  const only = [
    ...base.index.filter((row) => !theirs.has(keyOf(row))).map((row) => `${labelOf(row)}: not in the R1 run`),
    ...r1.index.filter((row) => !ours.has(keyOf(row))).map((row) => `${labelOf(row)}: not in the baseline run`),
  ]
  return { pairs, only }
}

// ---------------------------------------------------------------------------------------------- compare

async function loadStripR1(repo) {
  const entry = join(repo, 'test', 'r1-strip.ts')
  if (!existsSync(entry)) throw new UsageError(`${entry} does not exist (--repo-r1 is the R1 tree, default .)`)
  const work = mkdtempSync(join(tmpdir(), 'r1-parity-'))
  try {
    const file = join(work, 'r1-strip.mjs')
    await bundleTo({ entryPoints: [entry] }, file)
    const mod = await import(pathToFileURL(file).href)
    if (typeof mod.stripR1 !== 'function') throw new Error(`${entry} does not export stripR1`)
    return mod.stripR1
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Counts, by key name, what `kept` lacks of `raw`. A list that lost its first rows counts them as "<key> rows". */
function tallyRemoved(raw, kept, counts, key) {
  const add = (name, n) => counts.set(name, (counts.get(name) ?? 0) + n)
  if (Array.isArray(raw) && Array.isArray(kept)) {
    const lost = Math.max(0, raw.length - kept.length)
    if (lost > 0) add(`${key} rows`, lost)
    kept.forEach((item, i) => tallyRemoved(raw[i + lost], item, counts, key))
  } else if (raw && kept && typeof raw === 'object' && typeof kept === 'object' && !Array.isArray(raw) && !Array.isArray(kept)) {
    for (const k of Object.keys(raw)) {
      if (k in kept) tallyRemoved(raw[k], kept[k], counts, k)
      else add(k, 1)
    }
  }
}

async function compare(values) {
  const base = readRun(values.base)
  const r1 = readRun(values.r1)
  const stripR1 = await loadStripR1(resolve(values['repo-r1'] ?? '.'))
  const { pairs, only } = pairLives(base, r1)
  const removed = new Map()
  let differing = only.length
  for (const line of only) console.log(line)
  for (const [baseRow, r1Row] of pairs) {
    const label = labelOf(baseRow)
    let found
    try {
      const raw = loadLife(r1, r1Row)
      const stripped = stripR1(raw)
      tallyRemoved(raw, stripped, removed, '')
      found = firstDiff(loadLife(base, baseRow), stripped)
    } catch (err) {
      console.log(cut(`${label}: cannot read (${err.message})`))
      differing++
      continue
    }
    if (found === null) console.log(`${label}: ok`)
    else {
      console.log(cut(`${label}: ${found.path || '(root)'} base=${show(found.a)} r1=${show(found.b)}`))
      differing++
    }
  }
  const names = [...removed].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([name, n]) => `${name} x${n}`)
  console.log(`stripped from the R1 run: ${names.length ? names.join(', ') : 'nothing'}`)
  console.log(differing === 0 ? `all ${pairs.length} lives are identical` : `${differing} of ${pairs.length + only.length} lives differ`)
  return differing === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------------------------- cost

/** Milliseconds for one round: a structuredClone plus a JSON.stringify of the state, the work act() and saveGame do on a tap. */
function oneRound(state, sink) {
  const t0 = performance.now()
  sink.copy = structuredClone(state)
  const t1 = performance.now()
  sink.text = JSON.stringify(state)
  return t1 - t0 + (performance.now() - t1)
}

/** Median round time of two states, measured in turn (the order flips every round) so drift and pauses hit both alike. */
function timeBoth(a, b, reps) {
  const sink = {}
  const times = [[], []]
  for (let round = -WARMUP_ROUNDS; round < reps; round++) {
    const order = round % 2 === 0 ? [0, 1] : [1, 0]
    for (const side of order) {
      const ms = oneRound(side === 0 ? a : b, sink)
      if (round >= 0) times[side].push(ms)
    }
  }
  return [median(times[0]), median(times[1])]
}

async function cost(values) {
  const reps = wholeNumber(values, 'reps', 15, 1, 1000)
  const limit = values.limit === undefined ? DEFAULT_LIMIT : Number(values.limit)
  if (!(limit > 0)) throw new UsageError('--limit needs a number above 0')
  const base = readRun(values.base)
  const r1 = readRun(values.r1)
  const { pairs, only } = pairLives(base, r1)
  for (const line of only) console.log(line)
  const rows = []
  for (const [baseRow, r1Row] of pairs) {
    const a = loadLife(base, baseRow)
    const b = loadLife(r1, r1Row)
    const [baseMs, r1Ms] = timeBoth(a, b, reps)
    rows.push({ seed: baseRow.seed, baseMs, r1Ms, baseNodes: countNodes(a), r1Nodes: countNodes(b) })
  }
  console.log(formatCostTable(rows))
  const { mean } = costRatio(rows.map((r) => r.baseMs), rows.map((r) => r.r1Ms))
  const over = mean > limit
  console.log(`\nmean time ratio ${mean.toFixed(3)} (limit ${limit}): ${over ? 'over' : 'within'}`)
  if (over) console.log('advisory: D.11 criterion 12 is a decision for the lead; state growth of 3 to 5% is the roadmap\'s own estimate')
  return over || only.length > 0 ? 1 : 0
}

// ---------------------------------------------------------------------------------------------- main

async function main(argv) {
  const [command, ...rest] = argv
  if (!command || !Object.hasOwn(COMMANDS, command)) throw new UsageError(command ? `unknown command: ${command}` : 'no command given')
  const def = COMMANDS[command]
  return def.run(parse(def, rest))
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n${USAGE}`)
      process.exitCode = 2
    } else {
      console.error(err?.stack ?? err)
      process.exitCode = 1
    }
  },
)
