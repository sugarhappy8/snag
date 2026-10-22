// Build-time feature switches (R1-P3, K.11). Features of a release ship dark behind these and the lead turns
// them on in the release commit. They are NOT saved and NOT the same thing as GameState.flags (the saved misc
// flags that world-flags.ts classifies), nor the player setting Settings.quietMode (the build flag quietInbox
// only decides whether the inbox code exists in the build).
//
// Rules for every track:
// - These eight keys are the complete R1 set; R3 adds a ninth, yearCard (below). Nobody else adds, renames or flips a key;
//   only the lead's release commit changes a default, together with the package.json version (test/flags.test.ts fails on
//   either half).
// - Production code reads FLAGS.key or flagOn('key') at the place of use. Never keep one in a module-level const.
// - Tests use withFlags, or setFlags plus resetFlags. Never a module mock and never an assignment to FLAGS.
// - R1 flags change presentation only. A flag that changes simulation output must be stamped into the save when
//   the life is created and read from the save, never from FLAGS at runtime, so replays stay deterministic.
//   A flag never changes the meaning of a saved field.
// - This file imports nothing, so any module can read it without joining an import cycle.
//
// Outside tests the starting values come from the URL (?flags=chartKit,-navRegroup, or all, or none), then from
// localStorage['anotherlife.flags'], then from the defaults below. Node and tests have no location, so they
// always start from the defaults. A ?flags= in the URL replaces the stored list instead of adding to it.

export interface FlagDef {
  readonly default: boolean
  /** The package.json version that turns it on. */
  readonly ships: string
}

export const FLAG_DEFS = {
  // Chart rows in menus, ladders, stock sparklines, the Books group, the net-worth line (G.2, G.6, G.7).
  chartKit: { default: true, ships: '4.1.0' },
  // Tabbed Annual Report data, the Year-End Desk and the company strip (G.4).
  annualReport2: { default: true, ships: '4.1.0' },
  // Regrouped Activities, "Needs you" badges, breadcrumbs (G.8).
  navRegroup: { default: true, ships: '4.1.0' },
  // Header search, palette, shortcuts, pins, recents (G.9).
  navPalette: { default: true, ships: '4.1.0' },
  // Company, wealth and tab cockpits (G.5).
  cockpits: { default: true, ships: '4.1.0' },
  // The ModalHost digest merge (G.11 step 1).
  noticeDigest: { default: true, ships: '4.1.0' },
  // Minor notices to the inbox, the Settings section and the header bell (G.11 step 2).
  quietInbox: { default: true, ships: '4.1.0' },
  // The IndexedDB boot (K.5a).
  idbSaves: { default: true, ships: '4.1.0' },
  // The year close in the store flow (R3, E.D2): ageUpAction closes the year with a card, folds the small notices into the log and
  // budgets the unrequested choices, when Quiet Mode is on too. Headless ageUp is never touched. On since 5.1.0: the release commit
  // flipped it together with the version.
  yearCard: { default: true, ships: '5.1.0' },
} as const satisfies Record<string, FlagDef>

export type FlagKey = keyof typeof FLAG_DEFS
export type FlagOverrides = Partial<Record<FlagKey, boolean>>

const KEYS = Object.keys(FLAG_DEFS) as FlagKey[]
const BY_LOWER = new Map<string, FlagKey>(KEYS.map((k) => [k.toLowerCase(), k]))
const STORE_KEY = 'anotherlife.flags'
const MAX_LIST_CHARS = 200
const MAX_LIST_TOKENS = 20

// The one live object. setFlags, resetFlags and withFlags rewrite its properties in place, so an
// `import { FLAGS }` stays valid after an override. The type is readonly for everyone who imports it.
const live = Object.fromEntries(KEYS.map((k) => [k, FLAG_DEFS[k].default])) as Record<FlagKey, boolean>
export const FLAGS: Readonly<Record<FlagKey, boolean>> = live

export function flagOn(key: FlagKey): boolean {
  return live[key]
}

/**
 * Turn a comma list into overrides: a name turns the flag on, -name turns it off, all and none set every flag.
 * Tokens apply left to right (so "all,-navRegroup" works), names are not case sensitive and unknown names are
 * ignored. Text over 200 characters or with more than 20 tokens gives {}.
 */
export function parseFlagList(raw: string | null | undefined): FlagOverrides {
  if (typeof raw !== 'string' || raw.length > MAX_LIST_CHARS) return {}
  const tokens = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '')
  if (tokens.length > MAX_LIST_TOKENS) return {}
  const out: FlagOverrides = {}
  for (const token of tokens) {
    if (token === 'all' || token === 'none') {
      for (const key of KEYS) out[key] = token === 'all'
      continue
    }
    const off = token.startsWith('-')
    const key = BY_LOWER.get(off ? token.slice(1) : token)
    if (key) out[key] = !off
  }
  return out
}

/** Replace every override: the flags named here take these values and all the others go back to their defaults. */
export function setFlags(over: FlagOverrides): void {
  for (const key of KEYS) {
    const value = over[key]
    live[key] = typeof value === 'boolean' ? value : FLAG_DEFS[key].default
  }
}

export function resetFlags(): void {
  setFlags({})
}

/**
 * Run fn with these flags laid over the current ones, then put every flag back, even when fn throws. Nested
 * calls restore in order. For synchronous code only: an async test should use setFlags and resetFlags.
 */
export function withFlags<T>(over: FlagOverrides, fn: () => T): T {
  const before = { ...live }
  for (const key of KEYS) {
    const value = over[key]
    if (typeof value === 'boolean') live[key] = value
  }
  try {
    return fn()
  } finally {
    for (const key of KEYS) live[key] = before[key]
  }
}

/** The starting overrides: the URL if it has ?flags=, else the stored list. Any failure means no overrides. */
function startingOverrides(): FlagOverrides {
  try {
    if (typeof location === 'undefined') return {}
    const fromUrl = new URLSearchParams(location.search).get('flags')
    if (fromUrl !== null) return parseFlagList(fromUrl)
    return parseFlagList(localStorage.getItem(STORE_KEY))
  } catch {
    return {}
  }
}

setFlags(startingOverrides())
