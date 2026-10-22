// The world economy as a save slice (K.5, design 13.5), at version 2: the save diet's shape (A.K9).
//
// Version 1 is what v4.1.1 wrote: `previous` is last year's frame of all 102 countries and `history` keeps 32 years per
// country. Version 2 keeps `previous` for the countries a reader can name (economy/focus.ts) and 16 years of history. The
// yearly step already writes the new shape (economy/index.ts yearlyEconomy); this slice's `migrate` brings an older save to it
// once, on load, which is the first real use of a slice migrate. Both readers (economyState, economyOf) accept either shape,
// so a save that never passes through here is still read correctly: it only stays big until its next year step.
//
// The row is declared here and registered when save-slices.ts imports this file, with the rest of the R2 table.
import { defineSlice } from '../kernel/slices'
import { HISTORY_YEARS, economyFocus, pruneToFocus } from './focus'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Brings a version 1 economy to version 2: a copy of the object with `previous` cut to the countries of `game` (the whole record
 * being loaded, read only) and every `history[country]` cut to its last HISTORY_YEARS points. Idempotent. A value that is not a
 * plain object, or a `previous` or `history` that is not, is left as it is for economyState to reject, never thrown at. The
 * copy keeps the object's key order, so a re-saved record differs from the old one only where the diet cut.
 */
export function dietEconomy(from: number, json: unknown, game: Readonly<Record<string, unknown>>): unknown {
  if (from >= 2 || !isObject(json)) return json
  const out: Record<string, unknown> = { ...json }
  if (isObject(json.previous)) out.previous = pruneToFocus(json.previous, economyFocus(game as unknown as Parameters<typeof economyFocus>[0]))
  if (isObject(json.history)) {
    const history = json.history
    // fromEntries defines own keys, so a hostile "__proto__" country is a key and not a prototype.
    out.history = Object.fromEntries(Object.keys(history).map((id) => {
      const rows = history[id]
      return [id, Array.isArray(rows) && rows.length > HISTORY_YEARS ? rows.slice(-HISTORY_YEARS) : rows]
    }))
  }
  return out
}

// The economy is a flag, so it carves itself out of `flags`. Its writer builds a new root every year (storeEconomy).
defineSlice({
  key: 'flags.worldEconomy',
  version: 2,
  chunk: 'world',
  caps: { nodes: 150_000, chars: 2_000_000 },
  normalize: (raw) => (isObject(raw) ? raw : undefined),
  migrate: dietEconomy,
  write: 'replace',
})
