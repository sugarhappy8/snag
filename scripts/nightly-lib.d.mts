// Types for scripts/nightly-lib.mjs, so that test/nightly-lib.test.ts and test/nightly-probes.test.ts can import it (tsc checks
// test/ and cannot import an untyped .mjs; the same arrangement as scripts/ci-shard.d.mts). The command line is documented at the
// top of scripts/nightly.mjs and in docs/CI.md.

export type Scale = 'full' | 'smoke'

export interface NightlySizes {
  /** shards x seedsPerShard lives of `years` years, each capped at budgetSeconds. */
  fuzz: { shards: number; seedsPerShard: number; years: number; budgetSeconds: number }
  /** shards x lives balance lives: odd seeds birth lives to age 80, even seeds founders for `years` years. */
  balance: { shards: number; lives: number; years: number }
  /** shards x lives founder lives with `scale` times the money, for `years` years. */
  ceiling: { shards: number; lives: number; years: number; scale: number }
  anachronism: { lives: number; slices: number }
  /** The strict ledger drift check: the first `lives` lives of the ledger probe (at most 40), in `slices` jobs. */
  ledgerStrict: { lives: number; slices: number }
  oldSaves: { years: number; reseeds: number }
}

/** The sizes a job runs at. A new object each call. Throws for a scale that is not 'full' or 'smoke'. */
export function nightlySizes(scale: Scale): NightlySizes
/** Shard `i` of `n` ('2/8'), 1 <= i <= n, where n is the shard count of a job. Throws with the reason otherwise. */
export function parseShard(text: string, scale?: Scale): { i: number; n: number }
/**
 * The KEY=VALUE pairs for $GITHUB_ENV, in a fixed order: FUZZ_*, BALANCE_*, CEILING_*, ANACHRONISM_*, LEDGER_STRICT_LIVES, OLD_SAVES_*.
 * With a shard, each sharded job that has an i-th shard also gets its *_START (the first seed of its run).
 */
export function sizeEnv(scale: Scale, shard?: { i: number; n: number }): [string, string][]

/** What test/nightly-metrics.ts writes: one number per dotted name, and lists of numbers the merge pools. */
export interface MetricsFile {
  v: 1
  job: string
  shard: number
  metrics: Record<string, number>
  samples?: Record<string, number[]>
}

/** Nearest rank: sorted[ceil(p * n / 100) - 1], NaN for an empty list. The list is not changed. */
export function percentile(xs: readonly number[], p: number): number
/** Returns the file when it has the shape of MetricsFile; throws with `label` (its path) in the message when not. */
export function checkMetricsFile(x: unknown, label: string): MetricsFile
/**
 * .sum names are added, .max names take the biggest, samples are pooled and expanded to name.n, .p10, .p50, .p90, .p95, .p99 and
 * .max (only .n for an empty pool). Any other name two files both write throws. Names come back sorted.
 */
export function mergeMetricFiles(files: readonly MetricsFile[]): Record<string, number>

export interface Rule {
  /** A metric name where * is any run of characters (dots included). The first matching rule wins. */
  match: string
  /** cap: the value must be at most `limit`. rel: it may move at most `limit` (0.25 is a quarter) from the previous night. */
  kind: 'cap' | 'rel'
  limit: number
  /** A hard rule fails the run; a soft one prints a WARN row. */
  hard: boolean
  why: string
}
export const RULES: readonly Rule[]

export interface DiffRow {
  name: string
  /** The previous night's value, or null when there was none. */
  prev: number | null
  /** Tonight's value, or null for a metric that went missing. */
  cur: number | null
  verdict: 'ok' | 'warn' | 'fail' | 'new' | 'gone'
  why: string
}
/** One row per metric of either night, in name order. A hard cap is judged with or without a previous night. */
export function diffMetrics(prev: Record<string, number> | null, cur: Record<string, number>, rules?: readonly Rule[]): DiffRow[]
/** Markdown for $GITHUB_STEP_SUMMARY: failed jobs first, the counts, a table of failures and warnings, the rest folded. */
export function diffMarkdown(rows: readonly DiffRow[], failedJobs: readonly string[]): string
/** The counts of the last TOTAL line of scripts/fuzz-engine.ts; zero counts and fuzz.nototal.sum of 1 when there is none. */
export function parseFuzzTotal(log: string): Record<string, number>
