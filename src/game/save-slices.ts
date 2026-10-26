// The R2 slice table (K.5, design 13.5): where every top-level field of GameState lives in a save.
//
// The table is declared when this module is first imported. Callers that need it present (save-schema.ts, the codec, the clone
// that act() uses) import this file and call ensureSliceTable(), so a bundler that sees an import used only for its effect
// cannot drop it and a slice declared in a file nobody imports is never silently absent.
//
// The core is the head of a save: every scalar below and every core slice, in the key order of GameState. The chunked slices
// leave a placeholder string in it ("~flags.worldEconomy") and live in a chunk record beside it:
//
//   flags.worldEconomy  the world economy, replaced whole once a year (economy/model.ts storeEconomy): chunk `world`, with a shape table
//   log                 completed life-log years in decade chunks `log.<n>`; the current year stays in the core
//   world               the A.K2 world root (world/state.ts): each own key is a `world.<name>` replace sub-slice, except
//                       world.ledger, which every booking edits in place and so stays in the core. Every sub-slice takes the
//                       root's `pack: 'shapes'`. A shard that changes more than once a year does not belong in the `world`
//                       chunk (its id would change with it and the whole chunk would be written again): declare it a core row
//                       like the ledger. test/save-budget.test.ts measures the bytes a tap writes and is the detector. A shard that
//                       changes on taps and is keyed by person is an entity slice instead (world.met, world/met-slice.ts): its
//                       own row says chunk 'entities', and it takes `e.<kind>.<n>` chunks of its own
//
// `pack: 'shapes'` (kernel/shapes.ts, R2-S11) writes a value with its repeated object shapes in a table, so a country, a sector
// row, a history point or a rival stores its values only. The codec writes the packed form only when a shape repeats, and reads
// a plain value as it is, so a small state keeps the text it always had.
//
// Versions are 1 here, the shape v4.1.1 wrote, except `flags.worldEconomy`, which is 2 (the save diet: `previous` kept for the
// countries a reader can name, 16 years of history; economy/slice.ts). A later release that changes a slice's shape bumps its
// version and adds a `migrate`; a record's `sv` map (save-codec.ts) tells which version each slice was written at.
import './economy/slice'
// The Met shard's entity slice (R4-S5): `world.met` in the chunk `entities`, a tap that touches one person writes one chunk.
import './world/met-slice'
// The edge map's entity slice (R4-E6b): `world.edges` in the chunk `entities`, the same pattern as the Met store's.
import './world/edges-slice'
import { normalizeLedger } from './kernel/ledger'
import { defineSlice } from './kernel/slices'
// The world's registration hub, for its effect: normalizeWorld keeps a shard only when it is registered, so a process that reads a
// save without loading the game's modules (a script, a test, the boot before aging.ts) has to have registered them all first.
import './world/shards'
import { normalizeWorld } from './world/state'

/**
 * Top-level GameState keys that are plain values, not slices: they travel in the core head as they are. A key that is neither
 * here nor in the table has no home, and test/save-slices.test.ts fails on it.
 */
export const CORE_SCALARS = ['version', 'schemaVersion', 'lifeId', 'rng', 'nextId', 'year', 'generation', 'ribbon', 'obituary'] as const

function isPlain(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)

/**
 * The world root through its own reader (world/state.ts normalizeWorld: only the registered shards, each through its own reader,
 * within the world's node cap), with its keys where the saved root had them. normalizeWorld builds a new object with the shards in
 * name order; the head of a save keeps the key order of the state (the codec's contract: a reload gives the very JSON that was
 * encoded), so the keys go back to the order of the root that was read.
 */
function worldInOrder(raw: unknown): unknown {
  // Anything but an object reads as absent, as it did before the world had a reader; an object is made a valid world.
  if (!isPlain(raw)) return undefined
  const read = normalizeWorld(raw) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) if (hasOwn(read, key)) out[key] = read[key]
  for (const key of Object.keys(read)) if (!hasOwn(out, key)) out[key] = read[key]
  return out
}

/** The core's own slices keep what they hold: isLoadableGame (save-schema.ts) validates them. */
function keep(raw: unknown): unknown {
  return raw
}

// Core slices that stay in the head: cloned on every tap, written with the head.
const CORE_ROWS: readonly (readonly [key: string, nodes: number, chars: number])[] = [
  ['ancestors', 60_000, 600_000],
  ['assets', 120_000, 1_200_000],
  ['character', 60_000, 600_000],
  ['counters', 60_000, 600_000],
  ['flags', 150_000, 1_500_000],
  ['people', 60_000, 600_000],
  ['queue', 60_000, 600_000],
  ['yearActions', 60_000, 600_000],
]

for (const [key, nodes, chars] of CORE_ROWS) {
  defineSlice({ key, version: 1, chunk: 'core', caps: { nodes, chars }, normalize: keep, write: 'inplace' })
}

// `flags.worldEconomy` (chunk `world`, write 'replace', pack 'shapes') is declared in economy/slice.ts, which the first import above
// runs. It is the one slice past version 1 (A.K9, the save diet), so its row lives beside its migrate; its writer builds a new root
// every year.

// Completed years never change (core.ts currentLogYear edits only the last one), so they are written once, by decade.
defineSlice({
  key: 'log',
  version: 1,
  chunk: 'log',
  caps: { nodes: 120_000, chars: 1_200_000 },
  normalize: (raw) => (Array.isArray(raw) ? raw : undefined),
  write: 'replace',
  shape: 'logYears',
})

// The world root. The container stays in the core as a shallow object; each own key is a sub-slice.
defineSlice({
  key: 'world',
  version: 1,
  chunk: 'world',
  caps: { nodes: 60_000, chars: 700_000 },
  normalize: (raw) => worldInOrder(raw),
  write: 'replace',
  shape: 'subkeys',
  pack: 'shapes',
})

// The ledger shard is edited in place by every booking, so it cannot be a frozen shared root and must not sit in the world
// chunk (its id would change on every tap and the whole chunk would be rewritten). It stays inline in the core's `world` object.
defineSlice({
  key: 'world.ledger',
  version: 1,
  chunk: 'core',
  caps: { nodes: 12_000, chars: 150_000 },
  normalize: (raw) => (isPlain(raw) ? normalizeLedger(raw) : undefined),
  write: 'inplace',
})

/** The import hook for callers: the table is declared at module load, so importing this file is what fills it. Idempotent. */
export function ensureSliceTable(): void {
  // Nothing to do: the declarations above ran once, the first time this module was imported.
}
