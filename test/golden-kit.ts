// R2-P1 (K.7b a): the golden kit. sliceDigests(g) gives one canonical-JSON FNV digest per slice of a played state, so a
// golden run that moved says which slice moved (and explainMove says where inside it), and a test that adds one draw on a
// named stream can prove that only the slice the stream feeds moved. The kit is the vocabulary; the plans, the runner and
// the committed file are test/golden-run.ts and scripts/golden.mjs (R2-P2).
//
// The nine slices, and where every top-level key of GameState goes (TOP_KEYS):
//   rng            g.rng and g.nextId: the two counters every draw and every uid() moves
//   character      g.character without its memories, g.lifeId, year, generation, counters, yearActions, ancestors, ribbon
//   people         g.people, each person without notes
//   assets         g.assets
//   world          g.world (absent reads as null) and any top-level key TOP_KEYS does not place: new world-side state is
//                  the likely newcomer, and unclassified(g) lists it so a track adds a row on purpose
//   economy        flags.worldEconomy
//   flagsWorld     every other flag classifyFlag calls 'world'
//   flagsPersonal  flags classified 'personal', and flags nobody classified (the registry's rule: when in doubt, personal)
//   text           prose that no rule reads back into a roll: g.log, g.queue, g.obituary, flags.textMem, every flag
//                  classified 'cache' (only repeated text and popups depend on them), each person's notes, the memories
//   (ignored)      g.version and g.schemaVersion: constants of the build, so a schema bump moves no digest
//
// The text slice is wider than "log, queue text, flags.textMem" on purpose. An extra text draw lands in a person's notes,
// a memory or a repeat guard as well; if those lived in people or character, an extra draw on the text stream would show up
// as a move of people or character and no isolation test could pass.
//
// Every view is rooted at the real path of the state ({ people: [...] }, { flags: { diet: ... } }), so a JSON pointer out of
// firstDiff reads as a path of the saved game and not as a path inside a hash input.
//
// No vitest imports here: the same kit runs under vitest and as a bundled node script, like test/play-kit.ts.
import { firstDiff } from '../scripts/r1-parity-lib.mjs'
import type { GameState } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'

export const SLICES = ['rng', 'character', 'people', 'assets', 'world', 'economy', 'flagsWorld', 'flagsPersonal', 'text'] as const
export type SliceName = (typeof SLICES)[number]
export type SliceDigests = Record<SliceName, string>

/** Where each top-level key of GameState goes. 'flags' is split by key, 'ignore' is the build's own constants. */
export const TOP_KEYS: Readonly<Record<string, SliceName | 'flags' | 'ignore'>> = {
  version: 'ignore',
  schemaVersion: 'ignore',
  rng: 'rng',
  nextId: 'rng',
  lifeId: 'character',
  year: 'character',
  generation: 'character',
  character: 'character',
  counters: 'character',
  yearActions: 'character',
  ancestors: 'character',
  ribbon: 'character',
  people: 'people',
  assets: 'assets',
  // Ledger-world's g.world. Placed here so the slice reads it from the first day; its own shards are below this one key.
  world: 'world',
  flags: 'flags',
  log: 'text',
  queue: 'text',
  obituary: 'text',
}

type Obj = Record<string, unknown>
const has = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)

// ---------------------------------------------------------------------------------------------- canonical text

/** A state is at most 128 deep (the load limit); this only stops a cycle from overflowing the stack. */
const MAX_DEPTH = 512

/** The canonical text of one value, or undefined for a value JSON has no word for (undefined, function, symbol, bigint). */
function write(v: unknown, depth: number): string | undefined {
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v)
    case 'number':
      // String(-0) is '0'. A non-finite number is a string, so it can never hide as null.
      return Number.isFinite(v) ? String(v) : `"__num:${String(v)}"`
    case 'boolean':
      return v ? 'true' : 'false'
    case 'object': {
      if (v === null) return 'null'
      if (depth >= MAX_DEPTH) throw new RangeError('canonicalJson: nested too deep (a cycle?)')
      if (Array.isArray(v)) {
        let out = '['
        for (let i = 0; i < v.length; i++) {
          if (i > 0) out += ','
          out += write(v[i], depth + 1) ?? 'null'
        }
        return out + ']'
      }
      const o = v as Obj
      let out = '{'
      let first = true
      // Sorted by code unit (the default sort), so the text never depends on the order a key was added.
      for (const k of Object.keys(o).sort()) {
        const s = write(o[k], depth + 1)
        if (s === undefined) continue
        out += (first ? '' : ',') + JSON.stringify(k) + ':' + s
        first = false
      }
      return out + '}'
    }
    default:
      return undefined
  }
}

/**
 * JSON with the keys sorted, no whitespace, an undefined member skipped in an object and written null in an array (as
 * JSON.stringify does), -0 written 0, and a non-finite number written as the string "__num:NaN" ("__num:Infinity",
 * "__num:-Infinity"). A function, symbol or bigint is treated as undefined.
 */
export function canonicalJson(value: unknown): string {
  return write(value, 0) ?? 'null'
}

const FNV_PRIME = 0x01000193

/**
 * Two 32-bit FNV-1a lanes with different offset bases (0x811c9dc5 and 0x9747b28c), the text length mixed into both, written
 * as 16 lower-case hex characters. Built on Math.imul: a BigInt FNV-64 costs about 20 times more on a 2 MB state.
 */
export function fnv(text: string): string {
  let a = 0x811c9dc5
  let b = 0x9747b28c
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, FNV_PRIME)
    b = Math.imul(b ^ c, FNV_PRIME)
  }
  a = Math.imul(a ^ text.length, FNV_PRIME)
  b = Math.imul(b ^ text.length, FNV_PRIME)
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

// ---------------------------------------------------------------------------------------------- the slices

type FlagSlice = 'economy' | 'flagsWorld' | 'flagsPersonal' | 'text'

/** The slice a flags key belongs to. worldEconomy and textMem are special-cased, the rest go by classifyFlag. */
function flagSlice(key: string): FlagSlice {
  if (key === 'worldEconomy') return 'economy'
  if (key === 'textMem') return 'text'
  switch (classifyFlag(key)) {
    case 'world':
      return 'flagsWorld'
    case 'cache':
      return 'text'
    default:
      // 'personal', or nobody classified it: when in doubt, personal.
      return 'flagsPersonal'
  }
}

/** The top-level keys TOP_KEYS does not place (a key whose value is undefined is not in the JSON, so it does not count). */
function strayKeys(g: GameState): string[] {
  const s = g as unknown as Obj
  return Object.keys(s).filter((k) => !has(TOP_KEYS, k) && s[k] !== undefined).sort()
}

/** What each slice hashes, one pass over the state. Each view is rooted at the real paths of GameState. */
export function sliceViews(g: GameState): Record<SliceName, unknown> {
  const s = g as unknown as Obj
  const flags: Record<string, unknown> = g.flags
  const byFlag: Record<FlagSlice, Obj> = { economy: {}, flagsWorld: {}, flagsPersonal: {}, text: {} }
  for (const key of Object.keys(flags)) byFlag[flagSlice(key)][key] = flags[key]

  const { memories, ...character } = g.character
  const people: Obj[] = []
  const notes: Obj[] = []
  for (const p of g.people) {
    const { notes: n, ...rest } = p
    people.push(rest)
    notes.push({ id: p.id, notes: n })
  }
  const world: Obj = { world: s.world ?? null }
  for (const k of strayKeys(g)) world[k] = s[k]

  return {
    rng: { rng: g.rng, nextId: g.nextId },
    character: {
      character,
      lifeId: g.lifeId,
      year: g.year,
      generation: g.generation,
      counters: g.counters,
      yearActions: g.yearActions,
      ancestors: g.ancestors,
      ribbon: g.ribbon,
    },
    people: { people },
    assets: { assets: g.assets },
    world,
    economy: { flags: byFlag.economy },
    flagsWorld: { flags: byFlag.flagsWorld },
    flagsPersonal: { flags: byFlag.flagsPersonal },
    text: { log: g.log, queue: g.queue, obituary: g.obituary, flags: byFlag.text, people: notes, character: { memories } },
  }
}

/** What one slice hashes. */
export function sliceView(g: GameState, name: SliceName): unknown {
  return sliceViews(g)[name]
}

/** One digest per slice: fnv of the canonical JSON of its view. Reads the state, never writes it. */
export function sliceDigests(g: GameState): SliceDigests {
  const views = sliceViews(g)
  const out = {} as SliceDigests
  for (const name of SLICES) out[name] = fnv(canonicalJson(views[name]))
  return out
}

/** The slices whose digest differs, in SLICES order. */
export function movedSlices(a: SliceDigests, b: SliceDigests): SliceName[] {
  return SLICES.filter((name) => a[name] !== b[name])
}

const CUT = 120

function show(v: unknown): string {
  const text = v === undefined ? 'undefined' : canonicalJson(v)
  return text.length > CUT ? text.slice(0, CUT - 3) + '...' : text
}

/** The JSON pointer of the first difference inside one slice ("/people/3/relationship: 61 -> 58"), both values cut to 120 characters. */
export function explainMove(a: GameState, b: GameState, slice: SliceName): string {
  const diff = firstDiff(sliceView(a, slice), sliceView(b, slice))
  if (!diff) return `no difference found in ${slice}`
  return `${diff.path === '' ? '/' : diff.path}: ${show(diff.a)} -> ${show(diff.b)}`
}

/** Keys the partition had to guess: a top-level key TOP_KEYS lacks (it fell into world) and a flag classifyFlag does not know (it fell into flagsPersonal). */
export function unclassified(g: GameState): { topKeys: string[]; flags: string[] } {
  return { topKeys: strayKeys(g), flags: Object.keys(g.flags).filter((k) => classifyFlag(k) === null).sort() }
}
