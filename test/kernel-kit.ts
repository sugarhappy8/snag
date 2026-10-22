// R2-K2 (K.3 b): the kernel test kit. Three helpers for a test of a module that registers with the kernel.
//
//   loadModules()     imports src/game/modules, which registers MODULES into the registry of the current module epoch.
//   ownSliceGuard()   a bus guard that proves a handler writes only the slice it declares.
//   withGuard(fn)     runs fn with that guard set on the bus, and puts the bus back to no guard afterwards.
//
// The slice rule (design 14.4): a handler declares the one slice it writes (`world.facts`, `flags.textMem`), and the guard holds
// it to that. Before a handler runs it clones the state, takes the slice out of the clone and writes down what is left, key by
// key; after the handler it does the same and compares. A handler that wrote anywhere else changes a key and the guard throws,
// naming the module, the slice and the first top-level key that moved. Taking the slice out also takes out the parent objects
// that taking it out leaves bare (empty, or the `{ v: 1 }` root that world/state.ts ensureWorld creates), so a handler that has to
// create `g.world` to reach `world.facts` is not blamed for creating it. A parent that holds anything else, or another version,
// is not bare: a handler that adds a second shard or bumps the root's version while it is there is caught.
//
// The guard clones and writes down the whole state on every delivery, which costs tens of milliseconds on a long life. It is for
// tests and for the fuzz walk. Production never sets a guard (a scan in test/kernel-bus.test.ts keeps it that way).
//
// A test that resets modules (vi.resetModules) and imports its own copy of the bus passes that copy to withGuard, because this
// file's own import of the bus belongs to the epoch it was first loaded in.
import { setBusGuard, type BusGuard } from '../src/game/kernel/bus'
import type { GameState } from '../src/game/types'

/** Imports src/game/modules (registering MODULES). One module per registry epoch: a second call in the same epoch returns the same module. */
export function loadModules(): Promise<typeof import('../src/game/modules')> {
  return import('../src/game/modules')
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** What a parent holds once the slice is out of it and nobody else wrote there: nothing, or the bare root `{ v: 1 }` of the world. */
function isBare(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o)
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'v' && o.v === 1)
}

/**
 * Takes `parts` (a dotted slice path, split) out of a state clone, then the ancestors that are left bare. Both snapshots of a
 * delivery go through this, so a parent that only exists because the handler made it is out of both or in neither.
 */
function cutSlice(root: Record<string, unknown>, parts: readonly string[]): void {
  const chain: Record<string, unknown>[] = [root]
  for (let i = 0; i < parts.length - 1; i++) {
    const next = chain[i]![parts[i]!]
    if (!isRecord(next)) break
    chain.push(next)
  }
  if (chain.length === parts.length) delete chain[chain.length - 1]![parts[parts.length - 1]!]
  for (let i = chain.length - 1; i > 0; i--) {
    if (!isBare(chain[i]!)) break
    delete chain[i - 1]![parts[i - 1]!]
  }
}

/** The state with `slice` taken out, as the JSON text of each top-level key. */
function snapshot(g: GameState, slice: string): Map<string, string> {
  const copy = structuredClone(g) as unknown as Record<string, unknown>
  cutSlice(copy, slice.split('.'))
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(copy)) out.set(key, String(JSON.stringify(value)))
  return out
}

/** The first top-level key whose text differs between two snapshots (or that only one has), or null. */
function firstDifference(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string | null {
  for (const [key, text] of before) if (after.get(key) !== text) return key
  for (const key of after.keys()) if (!before.has(key)) return key
  return null
}

/** A guard that throws when a handler changed anything outside the slice it declares. */
export function ownSliceGuard(): BusGuard {
  return (info, g) => {
    const before = snapshot(g, info.slice)
    return () => {
      const moved = firstDifference(before, snapshot(g, info.slice))
      if (moved !== null) {
        throw new Error(`ownSliceGuard: module ${info.moduleId} handled ${info.kind} and wrote outside its slice ${info.slice} (${moved} changed)`)
      }
    }
  }
}

/**
 * Runs `fn` with the own-slice guard set on the bus and sets the bus back to no guard in a finally, so a throw cannot leave it on.
 * `bus` is the bus whose guard to set: this file's own by default, or a fresh copy a test imported after vi.resetModules.
 */
export function withGuard<T>(fn: () => T, bus: { setBusGuard(guard: BusGuard | null): void } = { setBusGuard }): T {
  bus.setBusGuard(ownSliceGuard())
  try {
    return fn()
  } finally {
    bus.setBusGuard(null)
  }
}
