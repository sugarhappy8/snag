// Types for scripts/r1-parity-lib.mjs, so that test/r1-parity.test.ts can import it (tsc checks test/ and cannot import an
// untyped .mjs).

export interface LifeSpec {
  seed: number
  kind: 'birth' | 'founder'
  birthYear: number
  businesses: number
  years: number
}

/**
 * 30 specs by default: seeds 1..lives; odd seeds are 'birth' lives (createNewLife, played from age 0), even seeds 'founder'
 * lives (probeLife with 1 to 3 companies). Birth years cycle 1925, 1950, 1975, 1990, 2010 by seed.
 */
export function lifeSpecs(lives?: number, years?: number): LifeSpec[]
/**
 * The JSON pointer (RFC 6901) of the first difference ('/flags/lifeSeries/rows/3'; '' for the root), with the value on each
 * side, or null. Key order is ignored, NaN equals NaN, arrays compare by index and length.
 */
export function firstDiff(a: unknown, b: unknown): { path: string; a: unknown; b: unknown } | null
/** Every array, object and primitive counts one, as the save loader counts nodes. */
export function countNodes(v: unknown): number
/** The middle value, or the mean of the middle two. NaN for an empty list. */
export function median(xs: readonly number[]): number
/**
 * R1 over base for each life, and their mean. A zero baseline counts that life as 1 (no division by zero); no lives give a
 * mean of 1; lists of different length throw.
 */
export function costRatio(base: readonly number[], r1: readonly number[]): { perLife: number[]; mean: number }
/** Markdown: one row per life and a mean row. */
export function formatCostTable(rows: readonly { seed: number; baseMs: number; r1Ms: number; baseNodes: number; r1Nodes: number }[]): string
