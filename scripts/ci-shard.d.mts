// Types for scripts/ci-shard.mjs, so that the tests and test/timings-sequencer.ts can import it (tsc checks test/ and
// cannot import an untyped .mjs). The CLI is documented at the top of the script and in docs/CI.md.

/** scripts/test-timings.json: seconds per test file, and the files that run a seed slice in every shard (R1-P7). */
export interface Timings {
  v: 1
  source: string
  files: Record<string, number>
  split: string[]
}

/** What a test file weighs when the timings do not know it. */
export const DEFAULT_SECONDS: number
/** Added to every file when planning: the JSON reporter leaves out module import time. */
export const FILE_OVERHEAD_SECONDS: number

/** Every *.test.ts under test/ ('test/x.test.ts', posix, sorted): the same rule as the vite.config include. */
export function listTestFiles(root?: string): string[]
/** The test files whose first 10 lines contain "// ci: fast". */
export function listFastFiles(root?: string): string[]
/** Reads and checks scripts/test-timings.json (or another file). Throws on a malformed file. */
export function readTimings(file?: string): Timings
/** Seconds for a file: the timings entry, or DEFAULT_SECONDS. */
export function weightOf(t: Timings, file: string): number
/** The shards, in order: fast files left out, split files in every shard, the rest spread longest first. */
export function planShards(files: readonly string[], t: Timings, count: number): string[][]
/** Planned seconds per shard, with FILE_OVERHEAD_SECONDS added per file and a split file counted 1/count. */
export function shardLoads(plan: readonly string[][], t: Timings, count: number): number[]
/** Seconds per repo-relative test file from a vitest JSON report (name ends in .json) or a default-reporter log. */
export function parseTimingReport(text: string, name: string): Record<string, number>
/** The timings after a refresh from reports; `root` is the tree used to drop files that no longer exist. */
export function mergeTimings(prev: Timings, reports: readonly Record<string, number>[], source: string, root?: string): Timings
/** A seeded guess for the timings, for use until a CI run measures real ones. */
export function estimateTimings(root?: string): Timings
/** Markdown for $GITHUB_STEP_SUMMARY: wall time per report and the 10 slowest files. */
export function shardSummary(reports: readonly { name: string; text: string }[]): string
/** Every reason the shards would skip or repeat a test file; an empty list means the coverage is right. */
export function verifyCoverage(count: number, root?: string): string[]
