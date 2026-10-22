// R3-H4 (H.2): key kinds. A key (`mkt:cafe:us:size`) names a hidden number; the kind (`mkt`) says who can tell what it really is. The
// owner of a family of keys (the Fog track: markets, rivals, candidates, valuations) registers one KeyKind at module load, and buying
// intel and Look closer ask it three things: what the key is called, what its truth is today, and how big the thing is (the scope that
// prices a source). The estimate core never asks: a screen passes the truth to know() itself.
//
//   label     the words a menu prints for the key
//   truth     the real value now, or null when there is nothing to read (a rival that left, a market that closed). It is a plain read of
//             this year's state: nothing in here looks ahead of g.year, and it never draws.
//   scope     tier 1 to 3 (a street, a country, the world), the country read, how many countries it spans, the deal size for diligence
//   scale     what a `delta` key is measured against (the company's revenue); absent means the size of the truth itself
//   revealedBy  the Effort research fields whose results sharpen the key (R3-H5 binds the sink that reads it)
//
// The registry is a module-level table: it holds code, not the game, so nothing here is saved. Registering the same def twice is fine
// (a reloaded module, a test file that registers again); a different def for a taken kind throws, so two owners can never fight over one
// kind without somebody noticing.
import type { GameState } from '../types'
import { isKindName, parseKey } from './keys'
import type { Scope } from './sources'

export interface KeyKind {
  kind: string
  label(g: GameState, key: string): string
  truth(g: GameState, key: string): number | null
  scope?(g: GameState, key: string): Scope
  scale?(g: GameState, key: string): number | null
  revealedBy?(g: GameState, key: string): readonly string[]
}

const HOOKS = ['label', 'truth', 'scope', 'scale', 'revealedBy'] as const

const registry = new Map<string, KeyKind>()

/** The functions of a def as text, so a def that is the same code (a module loaded twice) counts as the same def. */
function fingerprint(def: KeyKind): string {
  return HOOKS.map((h) => {
    const f = def[h]
    return typeof f === 'function' ? String(f) : '-'
  }).join('\u0001')
}

/** Register how to find the truth of a key kind. Throws for a kind that cannot start a key, a def without its two functions, or a different def for a taken kind. */
export function registerKeyKind(def: KeyKind): void {
  if (typeof def !== 'object' || def === null) throw new Error('registerKeyKind: the def is not an object')
  if (!isKindName(def.kind)) throw new Error(`registerKeyKind: ${String(def.kind)} cannot start a key`)
  if (typeof def.label !== 'function' || typeof def.truth !== 'function') throw new Error(`registerKeyKind: ${def.kind} needs a label and a truth`)
  for (const h of ['scope', 'scale', 'revealedBy'] as const) {
    if (def[h] !== undefined && typeof def[h] !== 'function') throw new Error(`registerKeyKind: ${def.kind} ${h} is not a function`)
  }
  const held = registry.get(def.kind)
  if (held === undefined) {
    registry.set(def.kind, def)
    return
  }
  if (held === def || fingerprint(held) === fingerprint(def)) return
  throw new Error(`registerKeyKind: ${def.kind} is already registered with a different def`)
}

/** The def registered for a kind, or null. */
export function kindOf(kind: string): KeyKind | null {
  return registry.get(kind) ?? null
}

/** The def of the kind a key starts with, or null for a key that is not well formed or has no owner. */
export function kindOfKey(key: string): KeyKind | null {
  const p = parseKey(key)
  return p ? kindOf(p.kind) : null
}

/** The words a menu prints for a key: its owner's label, cut to 60 characters, or the key itself when there is no owner or the owner has none. */
export function labelOfKey(g: GameState, key: string): string {
  const def = kindOfKey(key)
  if (def) {
    try {
      const text: unknown = def.label(g, key)
      if (typeof text === 'string' && text.trim() !== '') return text.slice(0, 60)
    } catch {
      // a label that throws is a label that is not there
    }
  }
  return key
}
