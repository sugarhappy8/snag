// R2-P4 (K.7b e, f): how a test file or a probe hands numbers to the nightly metric diff (scripts/nightly-lib.mjs, R2-P5).
// A file of one job and one shard is <dir>/<job>-<shard>.json: { v: 1, job, shard, metrics, samples? }. `metrics` is one number per
// dotted name; the last part of the name says how shards combine (.sum adds, .max takes the biggest), and `samples` are lists of
// numbers the merge pools across shards and turns into n, p10, p50, p90, p99 and max.
//
// No vitest imports here: the same module runs under vitest and inside a bundle a script makes (like test/play-kit.ts).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface MetricsFile {
  v: 1
  job: string
  shard: number
  metrics: Record<string, number>
  samples?: Record<string, number[]>
}

/** A job is one word, or words joined by hyphens: it becomes a file name, so no path can come out of it. */
const JOB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** A metric is dotted words that start with a lower-case letter; camel case inside a word is allowed (msYear, maxNetWorth). */
const NAME = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/

/** The shard number of this job: NIGHTLY_SHARD, or 0 when it is not set. Anything but a whole number throws. */
function shardOf(): number {
  const raw = process.env.NIGHTLY_SHARD
  if (raw === undefined || raw === '') return 0
  if (!/^\d{1,6}$/.test(raw)) throw new Error(`NIGHTLY_SHARD must be a whole number, got "${raw}"`)
  return Number(raw)
}

/**
 * The file writeMetrics would write, checked the same way: the job, the shard of this run (NIGHTLY_SHARD, or 0), the metrics and
 * the samples. The life probes (test/nightly-probes.ts) hand it to a script, which writes it where the workflow says.
 */
export function metricsFile(job: string, metrics: Record<string, number>, samples?: Record<string, number[]>): MetricsFile {
  if (!JOB.test(job)) throw new Error(`writeMetrics: job "${job}" must be lower-case words joined by hyphens`)
  for (const [name, value] of Object.entries(metrics)) {
    if (!NAME.test(name)) throw new Error(`writeMetrics: metric name "${name}" must be dotted words that start with a lower-case letter`)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`writeMetrics: metric ${name} is ${String(value)}, not a finite number`)
  }
  for (const [name, list] of Object.entries(samples ?? {})) {
    if (!NAME.test(name)) throw new Error(`writeMetrics: sample name "${name}" must be dotted words that start with a lower-case letter`)
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error(`writeMetrics: samples ${name} hold a value that is not a finite number`)
  }
  return { v: 1, job, shard: shardOf(), metrics, ...(samples ? { samples } : {}) }
}

/**
 * When NIGHTLY_METRICS_DIR is set, writes <dir>/<job>-<NIGHTLY_SHARD or 0>.json as { v: 1, job, shard, metrics, samples? } (a
 * rerun of the same job and shard replaces the file); otherwise writes nothing. What it is given is checked either way, so a bad
 * name or a NaN fails in a pull request and not only in the nightly.
 */
export function writeMetrics(job: string, metrics: Record<string, number>, samples?: Record<string, number[]>): void {
  const file = metricsFile(job, metrics, samples)
  const dir = process.env.NIGHTLY_METRICS_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${job}-${file.shard}.json`), `${JSON.stringify(file)}\n`)
}
