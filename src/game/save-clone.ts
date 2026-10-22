// The clone act() makes for every tap (R2, K.5 h, design 13.5): the committed state with its core copied and its `replace` roots shared.
//
// A tap used to be structuredClone(state): a copy of everything, the world economy and every year of the life log included, then a
// stringify of all of it on save. Most of that never changes between taps. The slice table (save-slices.ts) says which parts: a
// slice declared write 'replace' is never edited in place (its writer builds a new root: economy/model.ts storeEconomy, a log
// year that is finished), so a draft can hold the very object the committed state holds. This is what is shared:
//
//   every `replace` slice that is one value  ('flags.worldEconomy')
//   the completed years of the life log      (all but the last LOG_TAIL; the current year is core and is cloned)
//   each `replace` shard of a 'subkeys' slice (g.world.<name>); the container is a new object, and a shard declared in place
//                                            ('world.ledger', which every booking edits) is cloned with the core
//
// Everything else is cloned exactly as before, so the result is deep-equal to structuredClone(g) with the same JSON and key order.
//
// Shared roots are deep-frozen (kernel/slices.ts freezeRoot, once per object). That is deliberate and holds in every build: the
// save codec caches the text of a `replace` root by identity, so a root that could be edited after it was cached would be saved
// stale, silently. Frozen, an in-place write is a TypeError at the line that wrote it, in tests and for players alike. If a writer
// of one of these slices turns up, make it build a new root (the storeEconomy pattern); never unfreeze.
//
// Keeping the draft's own parts writable: the log array, the flags object and the world container are new objects every time, so a
// draft can append a year, set a flag or add a shard; only the roots inside them are shared.
//
// A leaf of the layering like the codec: it imports the slice registry, the slice table and types. It draws no random numbers and
// never changes the state it reads, except to freeze what it shares (a deep-frozen state is fine).
import { LOG_TAIL, freezeRoot, getAt, listSlices, setAt, sliceOf } from './kernel/slices'
import { ensureSliceTable } from './save-slices'
import type { GameState } from './types'

type Rec = Record<string, unknown>

const isObj = (v: unknown): v is object => typeof v === 'object' && v !== null
const isHolder = (v: unknown): v is Rec => isObj(v) && !Array.isArray(v)

/** What stands in a shared slot while the core is cloned. Never read: setAt puts the shared root back. */
const SHARED = ''

/** A shallow copy of `view[parent]`, made once, so a slot in it can be emptied without touching the state. False when it cannot hold a key. */
function detach(view: Rec, copied: Set<string>, parent: string): boolean {
  const current = view[parent]
  if (!isHolder(current)) return false
  if (!copied.has(parent)) {
    view[parent] = { ...current }
    copied.add(parent)
  }
  return true
}

/** True for `<parent>.<name>` when `<parent>` is a declared 'subkeys' slice: its own loop reads such a row, with the shard's own write rule. */
function underSubkeys(key: string, subkeys: ReadonlySet<string>): boolean {
  const dot = key.indexOf('.')
  return dot > 0 && subkeys.has(key.slice(0, dot))
}

/**
 * A draft of `g` for one action: equal to structuredClone(g), but every `replace` root and every completed log year is the same
 * object as in `g`, deep-frozen. Pure apart from freezing what it shares; draws nothing; a deep-frozen `g` is accepted.
 */
export function cloneForAct(g: GameState): GameState {
  ensureSliceTable()
  const table = listSlices()
  const subkeys = new Set(table.filter((s) => s.shape === 'subkeys').map((s) => s.key))
  // The state's own top-level keys, in the state's order. A shared slot is emptied in a copy; the state is never written.
  const view: Rec = { ...(g as unknown as Rec) }
  const copied = new Set<string>()
  /** Slice key and the root that goes back in after the clone. */
  const shared: [path: string, root: object][] = []
  let completed: readonly unknown[] | null = null
  let logKey = ''

  for (const def of table) {
    if (def.shape === 'logYears') {
      const years = view[def.key]
      if (def.write !== 'replace' || !Array.isArray(years) || years.length <= LOG_TAIL) continue
      completed = years.slice(0, -LOG_TAIL)
      logKey = def.key
      view[def.key] = years.slice(-LOG_TAIL)
    } else if (def.shape === 'subkeys') {
      // The container is a new object either way; each own key that has a replace row leaves it for the clone.
      const container = view[def.key]
      if (!isHolder(container)) continue
      const holder: Rec = { ...container }
      view[def.key] = holder
      for (const name of Object.keys(holder)) {
        const value = holder[name]
        const path = `${def.key}.${name}`
        if (!isObj(value) || sliceOf(path)?.write !== 'replace') continue
        holder[name] = SHARED
        shared.push([path, value])
      }
    } else if (def.write === 'replace' && !underSubkeys(def.key, subkeys)) {
      const value = getAt(view, def.key)
      if (!isObj(value)) continue
      const dot = def.key.indexOf('.')
      if (dot > 0 && !detach(view, copied, def.key.slice(0, dot))) continue
      setAt(view, def.key, SHARED)
      shared.push([def.key, value])
    }
  }

  const out = structuredClone(view)
  for (const [path, root] of shared) {
    freezeRoot(root)
    setAt(out, path, root)
  }
  if (completed !== null) {
    for (const year of completed) if (isObj(year)) freezeRoot(year)
    out[logKey] = [...completed, ...(out[logKey] as unknown[])]
  }
  return out as unknown as GameState
}
