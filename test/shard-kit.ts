// The seed-slice kit (R1-P7, K.7a b). Five test files are 45% of the suite's run time, so in CI each shard runs a
// slice of their seeds. A slice never weakens an assertion: whatever is checked per seed stays per seed, and whatever
// is checked over all the seeds (a count, a median, a threshold) runs once, in the merge step, on the union of the rows
// every slice recorded.
//
// The SLICE environment variable picks the mode:
//   unset or ''   full   the whole file, as in a local npm test
//   'i/n'         part   slice i of n (1-based, n at most 64): its share of the seeds, and it records its rows
//   'merge'       merge  no seeds; the aggregate tests read every slice's rows and check the union
//
// Plain Node (builtins only, no vitest), so the tests of the kit can drive it directly. Recipe: docs/CI.md.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type SliceMode = 'full' | 'part' | 'merge'
/** index is 0-based; count is the number of slices (1 outside part mode). */
export interface SliceSpec {
  mode: SliceMode
  index: number
  count: number
}

const MAX_SLICES = 64
const PART = /^([1-9]\d?)\/([1-9]\d?)$/
const ROW_FILE = /^(\d+)of(\d+)$/

/** The slice from SLICE (or from the text given). Throws on anything but '', 'merge' and 'i/n' with 1 <= i <= n <= 64. */
export function readSlice(raw: string | undefined = process.env.SLICE): SliceSpec {
  if (raw === undefined || raw === '') return { mode: 'full', index: 0, count: 1 }
  if (raw === 'merge') return { mode: 'merge', index: 0, count: 1 }
  const m = PART.exec(raw)
  const index = m ? Number(m[1]) : 0
  const count = m ? Number(m[2]) : 0
  if (!m || index > count || count > MAX_SLICES) {
    throw new Error(`bad SLICE ${JSON.stringify(raw)}: expected "i/n" with 1 <= i <= n <= ${MAX_SLICES}, "merge" or nothing`)
  }
  return { mode: 'part', index: index - 1, count }
}

/** A key as a file name: anything outside [A-Za-z0-9._-] becomes a hyphen. An empty key is a mistake. */
function fileKey(key: string): string {
  if (typeof key !== 'string' || key === '') throw new Error('a slice needs a non-empty key')
  return key.replace(/[^A-Za-z0-9._-]/g, '-')
}

/** This slice's share of a list: full gives all of it (a copy), merge nothing, part the contiguous range of its index. */
export function seedSlice<T>(all: readonly T[], key: string, spec: SliceSpec = readSlice()): T[] {
  fileKey(key)
  if (spec.mode === 'full') return [...all]
  if (spec.mode === 'merge') return []
  const len = all.length
  return all.slice(Math.floor((spec.index * len) / spec.count), Math.floor(((spec.index + 1) * len) / spec.count))
}

/** FNV-1a over the key's UTF-16 code units. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** True in exactly one slice per key (full: always, merge: never). The owner runs the cheap tests that are not worth splitting. */
export function ownedHere(key: string, spec: SliceSpec = readSlice()): boolean {
  fileKey(key)
  if (spec.mode === 'full') return true
  if (spec.mode === 'merge') return false
  return fnv1a(key) % spec.count === spec.index
}

// ---------------------------------------------------------------------------------------------- rows on disk

const NUMBERS: Record<string, number> = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity }

/** JSON, except that NaN, Infinity and -Infinity (which JSON turns into null) are written as {"__num":"NaN"} and so on. */
export function encodeRows(rows: unknown): string {
  return JSON.stringify(rows, (_name, value) => (typeof value === 'number' && !Number.isFinite(value) ? { __num: String(value) } : value))
}

/** The inverse of encodeRows. */
export function decodeRows<T>(text: string): T {
  return JSON.parse(text, (_name, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value as object)
      const tag = (value as { __num?: unknown }).__num
      if (keys.length === 1 && typeof tag === 'string' && Object.hasOwn(NUMBERS, tag)) return NUMBERS[tag]
    }
    return value
  }) as T
}

/** Where slice files go: SLICE_DIR, or test-slices (ignored by git) under the working directory. */
export function sliceDir(): string {
  return process.env.SLICE_DIR || 'test-slices'
}

/** What a slice file holds: which slice of how many it says it is, and its rows. */
interface SliceFile {
  slice: number
  of: number
  rows: unknown[]
}

/** Part mode only: writes this slice's rows to <SLICE_DIR>/<key>.<i>of<n>.json. In full and merge mode it does nothing. */
export function recordSlice(key: string, rows: unknown, spec: SliceSpec = readSlice()): void {
  if (spec.mode !== 'part') return
  const name = fileKey(key)
  if (!Array.isArray(rows)) throw new TypeError(`slice rows for "${key}" must be a list`)
  const dir = sliceDir()
  mkdirSync(dir, { recursive: true })
  const file: SliceFile = { slice: spec.index + 1, of: spec.count, rows }
  writeFileSync(join(dir, `${name}.${spec.index + 1}of${spec.count}.json`), encodeRows(file))
}

/**
 * Merge mode only (any other mode gives []): the rows of every slice of the key, joined in slice order, which is the
 * order of the original list. Throws, naming the key and the slice, when a slice file is missing, shows up twice,
 * comes from a run of another size, or cannot be read.
 */
export function mergedSlices<T = unknown>(key: string, spec: SliceSpec = readSlice()): T[] {
  if (spec.mode !== 'merge') return []
  const name = fileKey(key)
  const dir = sliceDir()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    entries = []
  }
  const found: { file: string; i: number; n: number }[] = []
  for (const file of entries) {
    if (!file.startsWith(`${name}.`) || !file.endsWith('.json')) continue
    const m = ROW_FILE.exec(file.slice(name.length + 1, -'.json'.length))
    if (m) found.push({ file, i: Number(m[1]), n: Number(m[2]) })
  }
  if (found.length === 0) throw new Error(`slice 1 of "${key}" is missing: there are no slice files for it in ${dir}`)

  // The run size is the one most files agree on (the larger on a tie); a file from another size is a stale leftover.
  const votes = new Map<number, number>()
  for (const f of found) votes.set(f.n, (votes.get(f.n) ?? 0) + 1)
  const want = [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const stray = found.filter((f) => f.n !== want).sort((a, b) => a.i - b.i || a.n - b.n)[0]
  if (stray) throw new Error(`slice ${stray.i} of "${key}" comes from a run of ${stray.n} slices, not ${want} (${stray.file} in ${dir})`)

  const rows: T[] = []
  for (let i = 1; i <= want; i++) {
    const file = `${name}.${i}of${want}.json`
    if (!found.some((f) => f.file === file)) throw new Error(`slice ${i} of ${want} is missing for "${key}" in ${dir}`)
    let doc: SliceFile
    try {
      doc = decodeRows<SliceFile>(readFileSync(join(dir, file), 'utf8'))
      if (!doc || !Array.isArray(doc.rows) || !Number.isInteger(doc.slice) || doc.of !== want) throw new Error('not a slice file')
    } catch (e) {
      throw new Error(`slice ${i} of "${key}" cannot be read (${file}): ${e instanceof Error ? e.message : String(e)}`)
    }
    if (doc.slice !== i) throw new Error(`slice ${doc.slice} of "${key}" appears twice: ${file} holds it again`)
    rows.push(...(doc.rows as T[]))
  }
  return rows
}
