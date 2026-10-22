// R2-B1 (K.7b, F.1 "Pinned seeds"): the seed kit. A test that needs a life with some property (born rich, marries, founds a
// company) asks findSeed(pred) for a seed instead of pinning a number: a pinned seed is a life of the code base of the day, and
// the next change that moves one draw moves the life and breaks the test for a reason that is not its own. test/seed-pins.test.ts
// keeps new `seed: <digits>` pins out of test/.
//
//   const seed = findSeed((s) => bornRich(s), { label: 'born rich' })
//
// findSeed scans from, from + 1, ... and returns the first seed for which pred(seed) is true. A predicate must return a boolean:
// a number or undefined throws, because `(s) => g.character.money` would pass on any seed that has money and hide the mistake.
// No hit within `tries` seeds throws a SeedSearchError that names the label and the range, so a rebaseline that makes a property
// rare says so instead of failing somewhere downstream.
//
// A label also memoises the answer for the process (one test file), so a describe block that needs the same life in five
// tests searches once. The label names a search, so the predicate text is part of it: a label reused for a different predicate
// throws. Values the predicate closes over are not part of its text, so put them in the label.
//
// No vitest import: this file may also run in a script, like test/play-kit.ts.

/** How to search: the first seed (default 1), how many to look at (default 200), and a name for the error and the memo. */
export interface SeedSearch {
  from?: number
  tries?: number
  label?: string
}

/** No seed in the range satisfied the predicate. */
export class SeedSearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedSearchError'
  }
}

const DEFAULT_FROM = 1
const DEFAULT_TRIES = 200

interface Memo {
  /** The text of the predicate that found it. */
  source: string
  from: number
  tries: number
  count: number
  result: number[]
}

/** One entry per label, kept apart for findSeed and findSeeds ('1:' and 'n:'). */
const memo = new Map<string, Memo>()

function options(fn: string, opts: SeedSearch | undefined): { from: number; tries: number; label: string | undefined } {
  const from = opts?.from ?? DEFAULT_FROM
  const tries = opts?.tries ?? DEFAULT_TRIES
  if (!Number.isInteger(from)) throw new RangeError(`${fn}: from must be a whole number, got ${String(from)}`)
  if (!Number.isInteger(tries) || tries < 1) throw new RangeError(`${fn}: tries must be a whole number of at least 1, got ${String(tries)}`)
  return { from, tries, label: opts?.label }
}

function describeRange(label: string | undefined, from: number, tries: number): string {
  return `${label !== undefined ? `"${label}", ` : ''}seeds ${from}..${from + tries - 1} (${tries} tried)`
}

function ask(fn: string, pred: (seed: number) => boolean, seed: number): boolean {
  let out: unknown
  try {
    out = pred(seed)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    throw new Error(`${fn}: the predicate threw for seed ${seed}: ${why}`, { cause: e })
  }
  if (typeof out !== 'boolean') {
    throw new TypeError(`${fn}: the predicate returned ${out === null ? 'null' : typeof out} for seed ${seed}; it must return true or false`)
  }
  return out
}

/** The memoised answer for a label, after checking that the same search is being asked again. Null when there is none. */
function recall(fn: string, kind: string, label: string | undefined, source: string, from: number, tries: number, count: number): number[] | null {
  if (label === undefined) return null
  const hit = memo.get(kind + label)
  if (!hit) return null
  if (hit.source !== source) throw new Error(`${fn}: the label "${label}" is already used for a different predicate; give each search its own label`)
  return hit.from === from && hit.tries === tries && hit.count === count ? [...hit.result] : null
}

function search(fn: string, kind: string, pred: (seed: number) => boolean, count: number, opts: SeedSearch | undefined): number[] {
  const { from, tries, label } = options(fn, opts)
  const source = pred.toString()
  const known = recall(fn, kind, label, source, from, tries, count)
  if (known) return known
  const found: number[] = []
  for (let seed = from; seed < from + tries; seed++) {
    if (!ask(fn, pred, seed)) continue
    found.push(seed)
    if (found.length === count) break
  }
  if (found.length < count) {
    const range = describeRange(label, from, tries)
    throw new SeedSearchError(
      count === 1
        ? `${fn}: no seed satisfies the predicate in ${range}`
        : `${fn}: only ${found.length} of ${count} seeds satisfy the predicate in ${range}`,
    )
  }
  if (label !== undefined) memo.set(kind + label, { source, from, tries, count, result: [...found] })
  return found
}

/** The first seed at or after `from` for which `pred(seed)` is true. Throws SeedSearchError when none of the `tries` seeds is. */
export function findSeed(pred: (seed: number) => boolean, opts?: SeedSearch): number {
  return search('findSeed', '1:', pred, 1, opts)[0]!
}

/** The first `count` seeds for which `pred(seed)` is true, in order. Throws SeedSearchError when fewer than `count` are found. */
export function findSeeds(pred: (seed: number) => boolean, count: number, opts?: SeedSearch): number[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`findSeeds: count must be a whole number of at least 1, got ${String(count)}`)
  return search('findSeeds', 'n:', pred, count, opts)
}
