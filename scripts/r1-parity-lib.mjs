// r1-parity-lib.mjs - the pure functions behind scripts/r1-parity.mjs (R1-P9): which lives to play, where two saved
// lives first differ, how big a life is, and how the per-tap cost of one tree compares with another. No file or process
// access here, so test/r1-parity.test.ts can pin every rule on small numbers. Types are in r1-parity-lib.d.mts.
//
// Dependency-free Node ESM.

/** Birth years of the probe lives, used in turn by seed. */
const BIRTH_YEARS = [1925, 1950, 1975, 1990, 2010]
const DEFAULT_LIVES = 30
const DEFAULT_YEARS = 40
const MAX_FOUNDER_COMPANIES = 3

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const isContainer = (v) => v !== null && typeof v === 'object'

// ---------------------------------------------------------------------------------------------- the lives

/** 30 specs by default: odd seeds are birth lives, even seeds founders with 1 to 3 companies. */
export function lifeSpecs(lives = DEFAULT_LIVES, years = DEFAULT_YEARS) {
  const specs = []
  for (let seed = 1; seed <= lives; seed++) {
    const birth = seed % 2 === 1
    specs.push({
      seed,
      kind: birth ? 'birth' : 'founder',
      birthYear: BIRTH_YEARS[(seed - 1) % BIRTH_YEARS.length],
      businesses: birth ? 0 : 1 + ((seed / 2 - 1) % MAX_FOUNDER_COMPANIES),
      years,
    })
  }
  return specs
}

// ---------------------------------------------------------------------------------------------- comparing

const pointerPart = (key) => key.replace(/~/g, '~0').replace(/\//g, '~1')

function diffAt(a, b, path) {
  if (a === b || (a !== a && b !== b)) return null
  if (!isContainer(a) || !isContainer(b) || Array.isArray(a) !== Array.isArray(b)) return { path, a, b }
  if (Array.isArray(a)) {
    const longest = Math.max(a.length, b.length)
    for (let i = 0; i < longest; i++) {
      const found = diffAt(a[i], b[i], `${path}/${i}`)
      if (found) return found
    }
    return null
  }
  // A key whose value is undefined is not in the JSON, so it counts as missing. Sorted, so "first" does not depend on key order.
  const keys = new Set()
  for (const side of [a, b]) for (const k of Object.keys(side)) if (side[k] !== undefined) keys.add(k)
  for (const k of [...keys].sort()) {
    const found = diffAt(hasOwn(a, k) ? a[k] : undefined, hasOwn(b, k) ? b[k] : undefined, `${path}/${pointerPart(k)}`)
    if (found) return found
  }
  return null
}

/**
 * The JSON pointer (RFC 6901) of the first difference, with both values there, or null. Key order is ignored, NaN equals
 * NaN, arrays compare by index and length (a longer array differs at the first index the other lacks).
 */
export function firstDiff(a, b) {
  return diffAt(a, b, '')
}

// ---------------------------------------------------------------------------------------------- size and cost

/** Every array, object and primitive counts one, as the save loader counts them (the same rule as jsonNodes in test/charts-kit.ts). */
export function countNodes(v) {
  let nodes = 0
  const stack = [v]
  while (stack.length) {
    const item = stack.pop()
    nodes++
    if (isContainer(item)) for (const child of Array.isArray(item) ? item : Object.values(item)) stack.push(child)
  }
  return nodes
}

/** The middle value, or the mean of the middle two. NaN for an empty list. The list is not changed. */
export function median(xs) {
  if (xs.length === 0) return NaN
  const sorted = [...xs].sort((x, y) => x - y)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** r1 over base. A baseline of zero has nothing to compare with, so that life counts as unchanged (1). */
function ratioOf(base, r1) {
  return base > 0 ? r1 / base : 1
}

/** The R1 cost over the base cost for each life, and the mean of those ratios (1 for no lives). Throws when the lists differ in length. */
export function costRatio(base, r1) {
  if (base.length !== r1.length) throw new Error(`costRatio: ${base.length} baseline lives against ${r1.length} R1 lives`)
  const perLife = base.map((b, i) => ratioOf(b, r1[i]))
  const mean = perLife.length === 0 ? 1 : perLife.reduce((sum, r) => sum + r, 0) / perLife.length
  return { perLife, mean }
}

const commas = (n) => n.toLocaleString('en-US')

/** A markdown table of milliseconds, nodes and their ratios per life, with a mean row. */
export function formatCostTable(rows) {
  const time = costRatio(
    rows.map((r) => r.baseMs),
    rows.map((r) => r.r1Ms),
  )
  const nodes = costRatio(
    rows.map((r) => r.baseNodes),
    rows.map((r) => r.r1Nodes),
  )
  const lines = [
    '| Seed | Base ms | R1 ms | Time ratio | Base nodes | R1 nodes | Node ratio |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  rows.forEach((r, i) => {
    lines.push(`| ${r.seed} | ${r.baseMs.toFixed(2)} | ${r.r1Ms.toFixed(2)} | ${time.perLife[i].toFixed(3)} | ${commas(r.baseNodes)} | ${commas(r.r1Nodes)} | ${nodes.perLife[i].toFixed(3)} |`)
  })
  lines.push(`| mean | | | ${time.mean.toFixed(3)} | | | ${nodes.mean.toFixed(3)} |`)
  return lines.join('\n')
}
