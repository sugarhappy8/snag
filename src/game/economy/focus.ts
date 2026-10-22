// The save diet's one question (A.K9): which countries can a reader of last year's economy name?
//
// `worldEconomy.previous` used to be a copy of last year's frame of all 102 countries (562 KB of a 1.8 MB economy at age 80),
// and only the countries the player is tied to are ever asked for it: economyOf(g, country, year) returns previous[country]
// when `year` is last year, and its callers (companies, houses, securities, the State of the Nation report) get `country` from
// the player's own state. So the yearly step keeps last year's frame for the focus countries and nothing for the rest; for any
// other country a reader gets the baseline for that year, which is what economyOf already answers when a frame is missing.
//
// The focus is a superset on purpose: an extra country costs about 5 KB and a missed one costs a reader its true value. Every
// string equal to a country id anywhere in the character, the assets, the people and the flags counts (a company's outlets,
// a house, a held foreign security, a politician's country), apart from the economy's own flag, which names every country.
//
// This file imports the country table and types only: model.ts imports HISTORY_YEARS from here, so it cannot import model.ts.
// It reads the state and draws no random numbers.
import type { GameState } from '../types'
import { COUNTRIES } from '../world'

/** Years of national history kept per country (the economy used to keep 32). */
export const HISTORY_YEARS = 16
/** Most countries that keep a previous-year frame. */
export const FOCUS_MAX = 40
/** Most JSON nodes one focus walk reads: the caps of the assets and flags slices are 120,000 and 150,000. */
const WALK_NODES = 100_000
/** The flag key of the economy (ECONOMY_KEY in model.ts, which a test keeps equal to this). Its text names every country. */
const ECONOMY_FLAG = 'worldEconomy'

let known: { readonly ids: ReadonlySet<string>; readonly longest: number } | null = null
/** The valid country ids, built on first use so that loading this file reads no imported value. */
function countries(): { readonly ids: ReadonlySet<string>; readonly longest: number } {
  if (known === null) {
    const ids = new Set(COUNTRIES.map((c) => c.id))
    let longest = 0
    for (const id of ids) longest = Math.max(longest, id.length)
    known = { ids, longest }
  }
  return known
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Every country a reader of last year's frame can name: the residence, the birth country, the citizenships and the
 * immigration country first, then every string equal to a country id anywhere in the character, assets, people and flags
 * (the economy's own flag excepted), in that order, at most FOCUS_MAX of them. The walk reads at most WALK_NODES nodes and
 * never recurses, so a hostile core costs a bounded few milliseconds. Strings only: a key is not a tie.
 */
export function economyFocus(g: Readonly<Pick<GameState, 'character' | 'people' | 'assets' | 'flags'>>): ReadonlySet<string> {
  const { ids, longest } = countries()
  const out = new Set<string>()
  const take = (v: unknown): boolean => {
    if (typeof v === 'string' && v.length <= longest && ids.has(v)) out.add(v)
    return out.size >= FOCUS_MAX
  }
  const c: unknown = g?.character
  if (isObject(c)) {
    take(c.countryId)
    take(c.birthCountryId)
    if (Array.isArray(c.citizenships)) for (const id of c.citizenships.slice(0, 16)) take(id)
    if (isObject(c.immigration)) take(c.immigration.countryId)
  }
  if (out.size >= FOCUS_MAX) return out
  // The flags are read whole on purpose: a tie to a country can sit in any of them. This is the one whole-object use of the flags
  // in this file, and src/game/world-flags.ts WHOLE_FLAGS_SITES lists it.
  const bag: unknown = g?.flags
  const roots: unknown[] = [c, g?.assets, g?.people]
  if (isObject(bag)) for (const key of Object.keys(bag)) if (key !== ECONOMY_FLAG) roots.push(bag[key])
  // One explicit stack for the whole walk, so nesting depth is no limit and the budget is shared across the roots. Children
  // are pushed last to first, so the walk reads each container in its own order.
  let budget = WALK_NODES
  const stack: unknown[] = []
  for (let r = 0; r < roots.length; r++) {
    stack.push(roots[r])
    while (stack.length > 0) {
      if (--budget < 0) return out
      const v = stack.pop()
      if (typeof v === 'string') {
        if (take(v)) return out
      } else if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i--) stack.push(v[i])
      } else if (typeof v === 'object' && v !== null) {
        const o = v as Record<string, unknown>
        const keys = Object.keys(o)
        for (let i = keys.length - 1; i >= 0; i--) stack.push(o[keys[i]!])
      }
    }
  }
  return out
}

/** The entries of `frame` whose key is in `focus`, in the frame's own key order. The values are shared, not copied. */
export function pruneToFocus<T>(frame: Readonly<Record<string, T>>, focus: ReadonlySet<string>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of Object.keys(frame)) if (focus.has(id)) out[id] = frame[id]!
  return out
}
