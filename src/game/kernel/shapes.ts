// Shape tables (R2, K.5 j, design 13.5): the columnar lever for the big world slices.
//
// Key names are more than half the bytes of a late save: a country frame, a sector row, a history point or a rival repeats the same
// fifty or so names in every copy. packShapes writes the key list of a repeated object shape once, in a table, and each object of
// that shape as its values only:
//
//   { "$s": [["year","growth",...], ...],  "$v": <the tree> }          the envelope: a table of shapes and the packed value
//   { "$": 0, "v": [2030, 0.02, ...] }                                 an object of shape 0, its values in the shape's key order
//   { "$": -1, "v": { "$": 5 } }                                       an escape: an object that has an own key "$", kept as it was
//
// What gets a table entry: an object with at least four keys whose exact key list (in iteration order) appears at least three
// times in the value, within the limits below. Arrays, scalars and every other object are left as they are, and the tree under
// them is packed the same way. An object with an own "$" key is escaped, never packed. An object with an own "__proto__" key,
// a key that holds NUL, a key JSON would leave out (a value that is undefined, a function or a symbol), or a toJSON, is never
// packed either. The result prints, through JSON.stringify, exactly the text its input printed once unpacked.
//
// unpackShapes is the other direction and the one that meets hostile input (a chunk read from storage), so it never trusts the
// packed value: the table is checked against the limits before any object is built, every wrapper is checked against its shape
// (an unknown index, values that are too few or too many, an extra member) and the count of values built is checked before each
// one is made, so a packed value cannot expand past `maxNodes` however it is built. It walks with its own stack, so nesting cannot
// overflow the call stack either. Every failure is a plain Error. Objects are made with the usual prototype, and a key named
// __proto__ is only ever defined as data, never assigned.
//
// This file is part of the kernel (L0): it imports nothing, draws no random numbers and keeps no state.

export interface ShapeLimits {
  /** Most values (objects, arrays and leaves) unpackShapes builds. */
  readonly maxNodes: number
  /** Most shapes in a table. */
  readonly maxShapes: number
  /** Most keys in one shape. */
  readonly maxKeys: number
  /** Most characters in one key. */
  readonly maxKeyChars: number
}

export const DEFAULT_SHAPE_LIMITS: ShapeLimits = Object.freeze({ maxNodes: 400_000, maxShapes: 256, maxKeys: 128, maxKeyChars: 64 })

/** Fewest keys an object needs to get a table entry. */
const MIN_KEYS = 4
/** Fewest times a key list must appear to get a table entry. */
const MIN_COUNT = 3
/** Deepest value packShapes accepts. A packed value is up to twice as deep (a wrapper adds its values array), and a chunk may be 100 deep. */
const MAX_PACK_DEPTH = 40
/** Deepest value unpackShapes builds. */
const MAX_UNPACK_DEPTH = 100
/** Characters a wrapper costs around its values: {"$":12,"v":[ ... ]}. */
const WRAPPER_CHARS = 15

type Rec = Record<string, unknown>

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

function fail(why: string): never {
  throw new Error(`shapes: ${why}`)
}

/** A plain data object: no class, no toJSON. Anything else is handed to JSON.stringify as it is. */
function isPlain(v: object): v is Rec {
  const proto: unknown = Object.getPrototypeOf(v)
  if (proto !== null && Object.getPrototypeOf(proto) !== null) return false
  return typeof (v as Rec).toJSON !== 'function'
}

/** An own data property, `__proto__` included: assigning to that name would set the prototype of `out`. */
function setOwn(out: Rec, key: string, value: unknown): void {
  if (key === '__proto__') Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true })
  else out[key] = value
}

/** True for a value the codec must write inside an envelope even when nothing packs: a plain object with an own "$s", which a reader would take for one. */
export function looksPacked(value: unknown): boolean {
  return isRecord(value) && hasOwn(value, '$s')
}

// ---------------------------------------------------------------------------
// Packing

interface Seen {
  readonly sig: string
  readonly keys: string[]
  readonly first: number
  /** Characters the key names take in one object of this shape: "name": for each key. */
  readonly chars: number
  count: number
}

interface Pass {
  /** One entry per plain object, in the order scan reaches them: its signature, or null when it cannot be packed. build reads them back in the same order. */
  readonly sigs: (string | null)[]
  readonly seen: Map<string, Seen>
  readonly index: Map<string, number>
  cursor: number
}

/** The key list of an object as one string, or null when the object cannot be packed. NUL joins the keys, so a key may not hold one. */
function signature(v: Rec, keys: readonly string[]): string | null {
  const n = keys.length
  if (n < MIN_KEYS || n > DEFAULT_SHAPE_LIMITS.maxKeys) return null
  for (let i = 0; i < n; i++) {
    const k = keys[i]!
    if (k.length > DEFAULT_SHAPE_LIMITS.maxKeyChars || k === '$' || k === '__proto__' || k.indexOf('\u0000') >= 0) return null
    const t = typeof v[k]
    if (t === 'undefined' || t === 'function' || t === 'symbol') return null
  }
  return keys.join('\u0000')
}

function scan(v: object, depth: number, p: Pass): void {
  if (depth > MAX_PACK_DEPTH) fail(`the value is nested more than ${MAX_PACK_DEPTH} levels`)
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i]
      if (typeof x === 'object' && x !== null) scan(x, depth + 1, p)
    }
    return
  }
  if (!isPlain(v)) return
  const keys = Object.keys(v)
  const sig = signature(v, keys)
  p.sigs.push(sig)
  if (sig !== null) {
    const known = p.seen.get(sig)
    if (known !== undefined) known.count++
    else p.seen.set(sig, { sig, keys, first: p.seen.size, chars: keys.reduce((a, k) => a + k.length + 3, 0), count: 1 })
  }
  for (let i = 0; i < keys.length; i++) {
    const x = v[keys[i]!]
    if (typeof x === 'object' && x !== null) scan(x, depth + 1, p)
  }
}

function build(v: unknown, p: Pass): unknown {
  if (typeof v !== 'object' || v === null) return v
  if (Array.isArray(v)) {
    const out = new Array<unknown>(v.length)
    for (let i = 0; i < v.length; i++) out[i] = build(v[i], p)
    return out
  }
  if (!isPlain(v)) return v
  const sig = p.sigs[p.cursor++]
  const keys = Object.keys(v)
  if (sig !== null && sig !== undefined) {
    const shape = p.index.get(sig)
    if (shape !== undefined) {
      const values = new Array<unknown>(keys.length)
      for (let i = 0; i < keys.length; i++) values[i] = build(v[keys[i]!], p)
      return { $: shape, v: values }
    }
  }
  const out: Rec = {}
  for (let i = 0; i < keys.length; i++) setOwn(out, keys[i]!, build(v[keys[i]!], p))
  return hasOwn(v, '$') ? { $: -1, v: out } : out
}

/** The shapes worth a table entry, in the order they first appear: seen three times, and when there are more than the table holds, the ones that save the most characters. */
function tabled(seen: Map<string, Seen>): Seen[] {
  const eligible = [...seen.values()].filter((s) => s.count >= MIN_COUNT)
  const saved = (s: Seen): number => s.count * (s.chars - WRAPPER_CHARS) - s.chars
  const kept = eligible.length > DEFAULT_SHAPE_LIMITS.maxShapes ? [...eligible].sort((a, b) => saved(b) - saved(a) || a.first - b.first).slice(0, DEFAULT_SHAPE_LIMITS.maxShapes) : eligible
  return kept.sort((a, b) => a.first - b.first)
}

/**
 * The value with its repeated object shapes in a table: `{ "$s": [[...keys], ...], "$v": tree }`. A value with nothing worth packing
 * comes back as `{ "$s": [], "$v": <the value, rebuilt> }`. Pure: it reads `value`, writes nothing, draws nothing. Throws a plain Error
 * for a value nested more than 40 levels (a state the loader would not have accepted).
 */
export function packShapes(value: unknown): unknown {
  const p: Pass = { sigs: [], seen: new Map(), index: new Map(), cursor: 0 }
  if (typeof value === 'object' && value !== null) scan(value, 0, p)
  const shapes = tabled(p.seen)
  shapes.forEach((s, i) => p.index.set(s.sig, i))
  const tree = build(value, p)
  if (p.cursor !== p.sigs.length) fail('the value changed while it was packed')
  return { $s: shapes.map((s) => s.keys), $v: tree }
}

// ---------------------------------------------------------------------------
// Unpacking

/** The table of a packed value, checked against the limits before any object is built. */
function readTable(raw: unknown, limits: ShapeLimits): string[][] {
  if (!Array.isArray(raw)) return fail('the shape table is not an array')
  if (raw.length > limits.maxShapes) return fail(`the shape table has more than ${limits.maxShapes} shapes`)
  const table: string[][] = []
  for (const shape of raw as unknown[]) {
    if (!Array.isArray(shape) || shape.length < 1 || shape.length > limits.maxKeys) return fail(`a shape needs 1 to ${limits.maxKeys} keys`)
    const seen = new Set<string>()
    for (const key of shape as unknown[]) {
      if (typeof key !== 'string' || key.length > limits.maxKeyChars) return fail(`a shape key must be a string of at most ${limits.maxKeyChars} characters`)
      if (key === '__proto__') return fail('a shape may not have the key __proto__')
      if (seen.has(key)) return fail('a shape has a key twice')
      seen.add(key)
    }
    table.push(shape as string[])
  }
  return table
}

/** What is still to be filled: a container made empty, the packed source of its members, and how deep it sits. */
interface Job {
  readonly mode: 'array' | 'plain' | 'shape'
  readonly src: unknown
  readonly out: unknown[] | Rec
  readonly keys: readonly string[] | null
  readonly depth: number
}

/**
 * The value a packed one stands for. `packed` is `{ "$s": table, "$v": tree }`, as JSON.parse reads what packShapes wrote. Throws a
 * plain Error on anything malformed or over `limits`, and never builds more than `limits.maxNodes` values (a count of every object,
 * array and leaf made, the root included) nor goes deeper than 100 levels.
 */
export function unpackShapes(packed: unknown, limits: ShapeLimits = DEFAULT_SHAPE_LIMITS): unknown {
  if (!isRecord(packed)) return fail('the packed value is not an object')
  const members = Object.keys(packed)
  if (members.length !== 2 || !hasOwn(packed, '$s') || !hasOwn(packed, '$v')) return fail('the packed value needs exactly $s and $v')
  const table = readTable(packed.$s, limits)
  let nodes = 0
  const jobs: Job[] = []

  // One value of the packed tree: a leaf as it is, a container made empty and queued to be filled.
  const make = (x: unknown, depth: number): unknown => {
    if (++nodes > limits.maxNodes) return fail(`the value is more than ${limits.maxNodes} nodes`)
    if (typeof x !== 'object' || x === null) return x
    if (depth > MAX_UNPACK_DEPTH) return fail(`the value is nested more than ${MAX_UNPACK_DEPTH} levels`)
    if (Array.isArray(x)) {
      const out: unknown[] = []
      jobs.push({ mode: 'array', src: x, out, keys: null, depth })
      return out
    }
    const src = x as Rec
    if (!hasOwn(src, '$')) {
      const out: Rec = {}
      jobs.push({ mode: 'plain', src, out, keys: null, depth })
      return out
    }
    if (Object.keys(src).length !== 2 || !hasOwn(src, 'v')) return fail('a wrapper has exactly the members $ and v')
    const shape = src.$
    if (shape === -1) {
      if (!isRecord(src.v)) return fail('an escape wraps an object')
      const out: Rec = {}
      jobs.push({ mode: 'plain', src: src.v, out, keys: null, depth })
      return out
    }
    if (typeof shape !== 'number' || !Number.isInteger(shape) || shape < 0 || shape >= table.length) return fail('a wrapper names a shape that is not in the table')
    const keys = table[shape]!
    if (!Array.isArray(src.v) || src.v.length !== keys.length) return fail('a wrapper has as many values as its shape has keys')
    const out: Rec = {}
    jobs.push({ mode: 'shape', src: src.v, out, keys, depth })
    return out
  }

  const root = make(packed.$v, 0)
  while (jobs.length > 0) {
    const job = jobs.pop()!
    const depth = job.depth + 1
    if (job.mode === 'array') {
      const from = job.src as unknown[]
      const out = job.out as unknown[]
      for (let i = 0; i < from.length; i++) out.push(make(from[i], depth))
    } else if (job.mode === 'shape') {
      const from = job.src as unknown[]
      const out = job.out as Rec
      const keys = job.keys!
      for (let i = 0; i < keys.length; i++) out[keys[i]!] = make(from[i], depth)
    } else {
      const from = job.src as Rec
      const out = job.out as Rec
      for (const key of Object.keys(from)) setOwn(out, key, make(from[key], depth))
    }
  }
  return root
}
