// The fact store (R2, K.3 c): where the facts that modules emit on the bus are kept, in g.world.facts.
//
// A fact (kernel/fact.ts) is a small discrete event: a bankruptcy, a layoff round, a border closing. The bus hands each one to every
// module that listens; this module is the one that listens to all of them and keeps what it hears, so that a later year, a news
// detector or a history page can ask "what happened" without every module having stored its own copy.
//
//   readFacts(g)      pure. The stored facts, oldest first. An absent or garbage shard reads as empty; nothing is created or written.
//   recordFact(g, f)  the writer. False when the fact is invalid, a row it already has, or one more of a kind-and-year that is full.
//   factsModule       the recorder: a '*' handler that owns the slice world.facts (modules/index.ts registers it).
//
// What it keeps, and why that is safe:
//   - bounded: at most FACT_CAP (400) rows, and at most FACTS_PER_KIND_YEAR (12) of one kind in one year, so one chatty module cannot
//     push the rest out. The oldest row goes first. 400 rows of at most 6 fields is about 2,800 JSON nodes (0.6% of the 500,000 node
//     cap of a save, 3.5% of the world's own WORLD_NODE_CAP) and, with every field at its limit, under 75 KB;
//   - replay-safe: a row is keyed by kind, year, subject and other party (k, y, c, a). Recording the same fact again adds nothing, so
//     a yearly step that runs twice, or a Time Machine jump that replays a year, stores one set;
//   - ordered: by year, then by the order the rows came in. A fact for an older year goes where its year belongs;
//   - hostile-proof: normalizeFacts is total. It drops what is not a fact (normalizeFact is the only door a row comes in by), puts the
//     rows in order, keeps the newest 400 and never throws. A valid shard comes back as itself, so a read costs nothing;
//   - written by replacing the shard root (ensureWorld(g).facts = { v: 1, rows }), never in place, because the Save track shares each
//     shard root between drafts, frozen. A reader caches by the identity of the stored root (world/state.ts worldShard).
//
// Load order: the shard registers itself when this file loads, and normalizeWorld drops a shard nobody registered. So every process
// that loads a save has to have loaded this file first: modules/index.ts imports it (the app gets there through aging), and the
// registration hub world/shards.ts imports it for the processes that read a save without the game (save-slices.ts). This file
// imports ./state and never the hub, so no cycle forms.
//
// It draws no random number and reads no clock. It sits in layer 2 and imports the game types, the fact, the registry (a type) and
// the world root.
import type { ModuleDef } from '../kernel/registry'
import { normalizeFact, type Fact } from '../kernel/fact'
import type { GameState } from '../types'
import { ensureWorld, registerShard, worldShard } from './state'

/** The most rows the store keeps. */
export const FACT_CAP = 400
/** The most rows of one kind in one year. */
export const FACTS_PER_KIND_YEAR = 12

/** The stored shape, g.world.facts. It has its own version, like every shard. */
export interface FactsShard {
  v: 1
  rows: Fact[]
}

const NONE: readonly Fact[] = Object.freeze([])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** One row: the row itself when it is already what normalizeFact makes of it, else the normalized copy, else null. Never throws. */
function cleanRow(row: unknown): Fact | null {
  try {
    const n = normalizeFact(row)
    if (n === null) return null
    const r = row as Record<string, unknown>
    const keys = Object.keys(n) as (keyof Fact)[]
    if (Object.keys(r).length !== keys.length) return n
    for (const key of keys) if (r[key] !== n[key]) return n
    return r as unknown as Fact
  } catch {
    return null
  }
}

/**
 * Any value into a valid shard: only valid rows (each through normalizeFact), oldest year first (a stable sort, so the order the rows
 * came in is kept inside a year), the newest FACT_CAP of them. It never throws. A shard that is already valid, with nothing else in it,
 * comes back as itself; one that only carries a stray key comes back with the same rows array.
 */
export function normalizeFacts(raw: unknown): FactsShard {
  try {
    if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.rows)) return { v: 1, rows: [] }
    const list: unknown[] = raw.rows
    let rows: Fact[] = []
    let same = true
    let sorted = true
    for (let i = 0; i < list.length; i++) {
      const row = cleanRow(list[i])
      if (row === null || row !== list[i]) same = false
      if (row === null) continue
      if (rows.length > 0 && row.y < rows[rows.length - 1]!.y) sorted = false
      rows.push(row)
    }
    if (!sorted) rows.sort((a, b) => a.y - b.y)
    if (rows.length > FACT_CAP) {
      rows = rows.slice(rows.length - FACT_CAP)
      same = false
    }
    if (same && sorted) {
      if (Object.keys(raw).length === 2) return raw as unknown as FactsShard
      return { v: 1, rows: raw.rows as Fact[] }
    }
    return { v: 1, rows }
  } catch {
    return { v: 1, rows: [] }
  }
}

registerShard('facts', { normalize: normalizeFacts })

/** The stored facts, oldest first. Pure: it never creates g.world and never writes. The array is the stored one, so treat it as read-only. */
export function readFacts(g: Pick<GameState, 'world'>): readonly Fact[] {
  return worldShard<FactsShard>(g, 'facts')?.rows ?? NONE
}

/**
 * Stores one fact. False, and nothing written, when the fact is not valid, when a row with the same kind, year, subject and other
 * party is stored already, when its kind and year already have FACTS_PER_KIND_YEAR rows, or when the store is full and the fact is
 * older than every row in it (it would be the first to go). Otherwise it goes in after the last row of its year or an earlier one,
 * the oldest rows beyond FACT_CAP are dropped, and the shard root is replaced.
 */
export function recordFact(g: GameState, fact: Fact): boolean {
  let f: Fact | null
  try {
    f = normalizeFact(fact)
  } catch {
    return false
  }
  if (f === null) return false
  const rows = readFacts(g)
  let sameKindYear = 0
  for (const r of rows) {
    if (r.k !== f.k || r.y !== f.y) continue
    if (r.c === f.c && r.a === f.a) return false
    sameKindYear++
  }
  if (sameKindYear >= FACTS_PER_KIND_YEAR) return false
  let at = rows.length
  while (at > 0 && rows[at - 1]!.y > f.y) at--
  if (at === 0 && rows.length >= FACT_CAP) return false
  const next = rows.slice()
  next.splice(at, 0, f)
  ensureWorld(g).facts = { v: 1, rows: next.length > FACT_CAP ? next.slice(next.length - FACT_CAP) : next } satisfies FactsShard
  return true
}

/** The recorder: it hears every fact and keeps it. It owns the slice world.facts and writes nothing else. */
export const factsModule: ModuleDef = {
  id: 'world.facts',
  layer: 2,
  slices: ['world.facts'],
  handles: [
    {
      kind: '*',
      slice: 'world.facts',
      run: (g, f) => {
        recordFact(g, f)
      },
    },
  ],
}
