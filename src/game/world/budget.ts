// The budget meter of the world (R2-L17, K.6 b, design 4.2.8): how big g.world is, and how long its yearly step takes.
//
//   worldBudget(g)    pure. Per-shard node counts of the world as it is stored, the total, its size in bytes (JSON), and `over`: one
//                     line for every breach of the budget (too many nodes, too many bytes, a shard past the cap its reader keeps).
//                     It walks the whole world, so it is for tests, dev tools and the platform probe, never for a tap.
//   timed(label, fn)  runs fn and adds its time to a table kept in this module. The table is never saved and nothing in the
//                     simulation reads it: a life played with a different clock is the same life, byte for byte.
//   budgetReport()    that table, sorted by label, as copies. resetBudgetReport() empties it.
//
// This is the one world file that reads the clock (test/ledger-guards.test.ts names it). Everything else in the world step is a pure
// function of the game; this file only measures it. No luck is drawn here either.
import { LEDGER_CAPS } from '../kernel/ledger'
import type { GameState } from '../types'
import { FRONTIER_CAPS, HOLDING_ROWS_CAP, LOD_CAPS, MET_CAPS } from './caps'
import { readWorld } from './state'

/**
 * What the world may cost: nodes and bytes of g.world after a long life, and the milliseconds one world step is meant to take.
 * R4-P2 raised the nodes from 25,000 to 55,000 and the bytes from 450,000 to 800,000 (cross-check X47). The measurement behind them
 * (test/world-budget.test.ts, every list at its cap at once, `met` and `edges` included): about 45,600 nodes and 443,000 bytes, and
 * the budget is the larger of the starting numbers and that measurement plus 15% (52,500 nodes, 510,000 bytes), so the starting
 * numbers stand. The hard ceiling is WORLD_NODE_CAP in world/caps.ts, and the split by release is WORLD_ALLOTMENT beside it.
 */
export const WORLD_BUDGET = { nodes: 55_000, bytes: 800_000, stepMs: 60 } as const

export interface WorldBudget {
  /** Nodes of each shard of the stored world, by name (the root's own `v` and `y` are not shards). */
  nodes: Record<string, number>
  /** Nodes of the whole world: the root, its `v` and `y`, and every shard. */
  total: number
  /** `JSON.stringify(g.world).length`. */
  bytes: number
  /** One line for each breach, empty when the world is inside its budget. */
  over: string[]
}

/** The walk gives up at this many nodes: a hostile world is reported as over budget, not walked to the end. The save loader's own cap is 500,000. */
const WALK_LIMIT = 1_000_000

const isPlain = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x) && Object.prototype.toString.call(x) === '[object Object]'

/** Nodes of a value, each value one node (the way the save loader counts), stopping once the count passes `WALK_LIMIT`. */
function countNodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    if (++n > WALK_LIMIT) return n
    if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) for (const x of item) stack.push(x)
      else for (const x of Object.values(item)) stack.push(x)
    }
  }
  return n
}

/** The length of a list or the number of keys of an object, 0 for anything else. */
function sizeOf(x: unknown): number {
  if (Array.isArray(x)) return x.length
  return isPlain(x) ? Object.keys(x).length : 0
}

/** The caps a shard's own reader keeps, as `[what, size of it in the stored shard, the cap]`. Read raw, so a shard written around its reader shows. */
function capsOf(name: string, shard: unknown): [string, number, number][] {
  if (!isPlain(shard)) return []
  switch (name) {
    case 'ledger':
      return [
        ['accounts', sizeOf(shard.a), LEDGER_CAPS.accounts],
        ['flow rows', sizeOf(shard.f), LEDGER_CAPS.flowRows],
        ['tokens', sizeOf(shard.r), LEDGER_CAPS.receipts],
        ['closes', sizeOf(shard.c), LEDGER_CAPS.closes],
        ['log rows', sizeOf(shard.l), LEDGER_CAPS.logRows],
      ]
    case 'people':
      return [['rows', sizeOf(shard.rows), LOD_CAPS.people]]
    case 'firms':
      return [['rows', sizeOf(shard.rows), LOD_CAPS.firms]]
    case 'homes':
      return [['rows', sizeOf(shard.rows), LOD_CAPS.homes]]
    case 'holdings':
      return [['rows', sizeOf(shard.rows), HOLDING_ROWS_CAP]]
    case 'met': {
      // A tombstone is an array, a record is not: counted as stored, so a shard written around its reader shows.
      let tombs = 0
      for (const v of Object.values(shard)) if (Array.isArray(v)) tombs++
      return [
        ['records', sizeOf(shard) - tombs, MET_CAPS.records],
        ['tombstones', tombs, MET_CAPS.tombs],
      ]
    }
    case 'frontier': {
      const recs = isPlain(shard.f) ? Object.values(shard.f) : []
      let rows = 0
      for (const rec of recs) if (isPlain(rec)) rows += sizeOf(rec.rows)
      return [
        ['fields', recs.length, FRONTIER_CAPS.fields],
        ['rows', rows, FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField * FRONTIER_CAPS.fields],
      ]
    }
    default:
      return []
  }
}

/** The size of the stored world, shard by shard, against WORLD_BUDGET. Pure: an absent or garbage world reads as the empty root. */
export function worldBudget(g: GameState): WorldBudget {
  const world = readWorld(g)
  const nodes: Record<string, number> = {}
  const over: string[] = []
  for (const name of Object.keys(world).sort()) {
    if (name === 'v' || name === 'y') continue
    nodes[name] = countNodes(world[name])
  }
  const total = countNodes(world)
  let bytes = 0
  try {
    bytes = JSON.stringify(world).length
  } catch {
    bytes = Infinity
  }
  if (total > WORLD_BUDGET.nodes) over.push(`nodes: ${total} pass the budget of ${WORLD_BUDGET.nodes}`)
  if (bytes > WORLD_BUDGET.bytes) over.push(`bytes: ${bytes} pass the budget of ${WORLD_BUDGET.bytes}`)
  for (const name of Object.keys(nodes)) {
    for (const [what, size, cap] of capsOf(name, world[name])) if (size > cap) over.push(`${name}: ${size} ${what} pass the cap of ${cap}`)
  }
  return { nodes, total, bytes, over }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The timer
// ---------------------------------------------------------------------------------------------------------------------------

interface Slot {
  calls: number
  ms: number
  max: number
}

/** Labels the table keeps: a code path names itself with a literal, so this is only a bound. */
const LABELS_MAX = 64

/** Module state: never saved, never read by the simulation. */
const TABLE = new Map<string, Slot>()

function record(label: string, ms: number): void {
  let slot = TABLE.get(label)
  if (slot === undefined) {
    if (TABLE.size >= LABELS_MAX) return
    slot = { calls: 0, ms: 0, max: 0 }
    TABLE.set(label, slot)
  }
  slot.calls += 1
  slot.ms += ms
  if (ms > slot.max) slot.max = ms
}

/**
 * Runs `fn`, adds the time it took to the table under `label`, and returns what it returned. An error from `fn` is recorded and
 * rethrown. Without a clock (`performance` missing) it only runs `fn`. Nothing is saved and the simulation never reads the table.
 */
export function timed<T>(label: string, fn: () => T): T {
  if (typeof performance === 'undefined') return fn()
  const start = performance.now()
  try {
    return fn()
  } finally {
    record(label, performance.now() - start)
  }
}

/** What `timed` has measured since the last reset, sorted by label: how many calls, the milliseconds in all, and the slowest call. */
export function budgetReport(): { label: string; calls: number; ms: number; max: number }[] {
  return [...TABLE.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([label, s]) => ({ label, calls: s.calls, ms: s.ms, max: s.max }))
}

/** Empties the table. */
export function resetBudgetReport(): void {
  TABLE.clear()
}
