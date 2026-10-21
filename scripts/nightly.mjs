#!/usr/bin/env node
// nightly.mjs - the command line of the nightly deep tier (R2-P5, K.7b f). It does the parts of the workflow that are not a vitest
// file or a life probe: which size each job runs at, turning a fuzz shard's log into metrics, pooling the shards' metric files,
// and the diff against the previous night. The logic is in scripts/nightly-lib.mjs, where test/nightly-lib.test.ts pins it.
//
//   node scripts/nightly.mjs sizes <full|smoke> [--shard i/n]
//       KEY=VALUE lines for $GITHUB_ENV: FUZZ_START FUZZ_SEEDS FUZZ_YEARS FUZZ_BUDGET, BALANCE_START BALANCE_COUNT BALANCE_YEARS,
//       CEILING_START CEILING_COUNT CEILING_YEARS CEILING_SCALE, ANACHRONISM_LIVES ANACHRONISM_SLICES, TEXT_PROBE_LIVES,
//       OLD_SAVES_YEARS OLD_SAVES_RESEEDS. Shard i of n is 1 based and n is a job's shard count (fuzz 8, balance and ceiling 4,
//       anachronism 8); each sharded job that has an i-th shard gets its *_START, the first seed of its run.
//   node scripts/nightly.mjs fuzz-metrics --shard n --log FILE [--json FILE] --out FILE
//       A metrics file from the last TOTAL line of fuzz-engine's output and the list of findings it wrote with --json.
//   node scripts/nightly.mjs merge --out FILE [--result job=outcome ...] FILE...
//       Pools the metrics files into { v: 1, failedJobs, metrics }; every job whose outcome is not "success" is a failed job.
//   node scripts/nightly.mjs diff --prev FILE|none --cur FILE
//       Markdown for $GITHUB_STEP_SUMMARY on stdout; exit 1 on a hard failure or a failed job.
//   node scripts/nightly.mjs help
//
// The life probes (balance and ceiling) need the engine, so they are a separate bundle: scripts/nightly-probes.ts.
// Exit codes: 0 ok, 1 a hard failure or a file that cannot be used, 2 bad usage. Dependency-free Node ESM.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { checkMetricsFile, diffMarkdown, diffMetrics, mergeMetricFiles, parseFuzzTotal, parseShard, sizeEnv } from './nightly-lib.mjs'

class Usage extends Error {}

const USAGE = `usage:
  node scripts/nightly.mjs sizes <full|smoke> [--shard i/n]
  node scripts/nightly.mjs fuzz-metrics --shard n --log FILE [--json FILE] --out FILE
  node scripts/nightly.mjs merge --out FILE [--result job=outcome ...] FILE...
  node scripts/nightly.mjs diff --prev FILE|none --cur FILE
  node scripts/nightly.mjs help`

/** `--name value` options and positional words. A name in `repeat` may appear more than once; any other name or flag is an error. */
function parseArgs(argv, { values, repeat = [], positionals }) {
  const opts = {}
  const rest = []
  for (let k = 0; k < argv.length; k++) {
    const word = argv[k]
    if (!word.startsWith('--')) {
      rest.push(word)
      continue
    }
    const name = word.slice(2)
    if (!values.includes(name) && !repeat.includes(name)) throw new Usage(`unknown option ${word}`)
    const value = argv[++k]
    if (value === undefined) throw new Usage(`${word} needs a value`)
    if (repeat.includes(name)) (opts[name] ??= []).push(value)
    else if (name in opts) throw new Usage(`${word} was given twice`)
    else opts[name] = value
  }
  const [min, max] = positionals
  if (rest.length < min) throw new Usage(`expected ${min === 1 ? 'an argument' : `${min} arguments`}`)
  if (rest.length > max) throw new Usage(`unexpected argument ${rest[max]}`)
  return { opts, rest }
}

const need = (opts, name) => {
  if (opts[name] === undefined) throw new Usage(`--${name} is required`)
  return opts[name]
}

function readJson(path, what) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`${path}: cannot read ${what}: ${e.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${path}: ${what} is not JSON: ${e.message}`)
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

// ---------------------------------------------------------------------------------------------- the commands

function sizes(argv) {
  const { opts, rest } = parseArgs(argv, { values: ['shard'], positionals: [1, 1] })
  const scale = rest[0]
  if (scale !== 'full' && scale !== 'smoke') throw new Usage(`the scale must be full or smoke, got "${scale}"`)
  let shard
  if (opts.shard !== undefined) {
    try {
      shard = parseShard(opts.shard, scale)
    } catch (e) {
      throw new Usage(e.message)
    }
  }
  process.stdout.write(`${sizeEnv(scale, shard).map(([k, v]) => `${k}=${v}`).join('\n')}\n`)
  return 0
}

function fuzzMetrics(argv) {
  const { opts } = parseArgs(argv, { values: ['shard', 'log', 'json', 'out'], positionals: [0, 0] })
  const shardText = need(opts, 'shard')
  if (!/^\d{1,6}$/.test(shardText)) throw new Usage(`--shard must be a whole number, got "${shardText}"`)
  const log = need(opts, 'log')
  const out = need(opts, 'out')
  // A log that is not there is a fuzzer that never ran: no TOTAL line, which the rules fail.
  const text = existsSync(log) ? readFileSync(log, 'utf8') : ''
  const metrics = parseFuzzTotal(text)
  // The list of findings, when the fuzzer got far enough to write it, is counted too: it can only add to what the TOTAL line says.
  if (opts.json !== undefined && existsSync(opts.json)) {
    try {
      const list = JSON.parse(readFileSync(opts.json, 'utf8'))
      if (Array.isArray(list)) {
        const isNote = (entry) => String(entry?.first?.kind ?? '').startsWith('note-')
        metrics['fuzz.failures.sum'] = Math.max(metrics['fuzz.failures.sum'], list.filter((entry) => !isNote(entry)).length)
        metrics['fuzz.notes.sum'] = list.filter(isNote).length
      }
    } catch {
      // a half-written list is the same as none: the TOTAL line stands
    }
  }
  writeJson(out, checkMetricsFile({ v: 1, job: 'fuzz', shard: Number(shardText), metrics }, 'fuzz-metrics'))
  return 0
}

function merge(argv) {
  const { opts, rest } = parseArgs(argv, { values: ['out'], repeat: ['result'], positionals: [1, Infinity] })
  const out = need(opts, 'out')
  const failedJobs = []
  for (const item of opts.result ?? []) {
    const m = /^([a-z][a-z0-9-]*)=(.*)$/.exec(item)
    if (!m) throw new Usage(`--result wants job=outcome, got "${item}"`)
    if (m[2] !== 'success' && !failedJobs.includes(m[1])) failedJobs.push(m[1])
  }
  const files = rest.map((path) => checkMetricsFile(readJson(path, 'a metrics file'), path))
  writeJson(out, { v: 1, failedJobs, metrics: mergeMetricFiles(files) })
  return 0
}

/** The merged file `merge` writes, or throws with its path. */
function readMerged(path) {
  const x = readJson(path, 'a merged metrics file')
  if (x === null || typeof x !== 'object' || x.v !== 1 || x.metrics === null || typeof x.metrics !== 'object' || Array.isArray(x.metrics)) throw new Error(`${path}: not a merged metrics file (written by the merge command)`)
  for (const [name, value] of Object.entries(x.metrics)) if (typeof value !== 'number') throw new Error(`${path}: metric ${name} is not a number`)
  return { metrics: x.metrics, failedJobs: Array.isArray(x.failedJobs) ? x.failedJobs.map(String) : [] }
}

function diff(argv) {
  const { opts } = parseArgs(argv, { values: ['prev', 'cur'], positionals: [0, 0] })
  const prevPath = need(opts, 'prev')
  const curPath = need(opts, 'cur')
  if (prevPath !== 'none' && !existsSync(prevPath)) throw new Usage(`--prev ${prevPath}: no such file (say --prev none when there is no previous night)`)
  const cur = readMerged(curPath)
  let prev = null
  let note = ''
  if (prevPath !== 'none') {
    // A previous night that cannot be read must not hide tonight's verdict: it is reported and tonight is judged on its own.
    try {
      prev = readMerged(prevPath).metrics
    } catch (e) {
      note = `The previous night could not be read (${e.message}), so tonight is judged without it.\n\n`
    }
  }
  const rows = diffMetrics(prev, cur.metrics)
  const md = diffMarkdown(rows, cur.failedJobs)
  process.stdout.write(note === '' ? md : md.replace('\n\n', `\n\n${note}`))
  return rows.some((r) => r.verdict === 'fail') || cur.failedJobs.length > 0 ? 1 : 0
}

function main(argv) {
  const [command, ...rest] = argv
  switch (command) {
    case 'sizes':
      return sizes(rest)
    case 'fuzz-metrics':
      return fuzzMetrics(rest)
    case 'merge':
      return merge(rest)
    case 'diff':
      return diff(rest)
    case 'help':
      process.stdout.write(`${USAGE}\n`)
      return 0
    case undefined:
      throw new Usage('no command')
    default:
      throw new Usage(`unknown command "${command}"`)
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  if (e instanceof Usage) {
    process.stderr.write(`nightly.mjs: ${e.message}\n${USAGE}\n`)
    process.exitCode = 2
  } else {
    process.stderr.write(`nightly.mjs: ${e instanceof Error ? e.message : String(e)}\n`)
    process.exitCode = 1
  }
}
