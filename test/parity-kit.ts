// R2-K8 (K.3 d): the kernel parity kit. R2-K9 to R2-K12 move the yearly hooks, the menu trees and the company view behind the module
// registry. They must change nothing a player can see or a save can hold, so this kit records, on the unconverted code, what they
// must not change:
//
//   yearly.names / traced / reordered   the hook names of `aging` and `special` in run order, the names as they execute, and a way to
//                                       run with the aging list reordered (the mutation test). K9 and K10 swap these bodies to read
//                                       the registry; nothing else in this file or in test/kernel-parity.test.ts changes.
//   livesParity()                       wave 0's trace (test/r2-parity-kit.ts) of four lives, the v4.0.2 save played five years, and
//                                       one digest of the executed hook names per life
//   menusParity()                       the four canned lives of test/nav-kit.ts walked through the menus: one digest per tab and top group
//   viewsParity()                       the company view (businessView) of every id of INDUSTRY_IDS and of five special companies: one digest each
//
// A digest of a list is { n, h }: n items and h = fnv1a (src/game/text/hash.ts) of the items joined by newlines, as 8 hex digits. Menu
// and view digests hold ids only (no number), so they cannot differ between machines; the lives are digested by wave 0's parityDigests.
//
// The seeds are pinned ON PURPOSE. A golden digest has to name a life, and the lives are the tuples of PARITY_LIVES (no `seed: <digits>`
// is written here, so the pin ratchet of test/seed-pins.test.ts has nothing to count), the nav kit's own canned states, and the default
// seeds of the fixture kits (`rich()`, `founder()`, `adultIn()`). If a legitimate change moves the simulation, re-record with
// RECORD_KERNEL_PARITY=1 and say why in the commit message; never edit the fixture by hand.
//
// Floats are rounded before they are digested (the lead's decision 31): the engine's Math.log, Math.exp and Math.pow differ in the last
// bit between macOS arm64 and Linux x64 and between Node versions, so a lives digest of exact bits holds on one machine only. The state
// is deep-copied with every non-integer number cut to FLOAT_DIGITS significant digits and then digested by wave 0's parityDigests, which
// gives the same digests as test/r2-parity-kit.ts does once it rounds the same way (rounding twice is the same as once). For that
// reason this file plays the lives itself (traceOf, a copy of traceLife in test/r2-parity-kit.ts that digests the rounded copy).
//
// This kit draws no random number of its own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { ageUp } from '../src/game/aging'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf } from '../src/game/business/state'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { resetFlags } from '../src/game/flags'
import { withYearly, yearlyEntries, type YearlyEntry } from '../src/game/kernel/registry'
import { migrateSave } from '../src/game/save-schema'
import { fnv1a } from '../src/game/text/hash'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adultIn, found } from './deeptech-kit'
import { company, rich } from './hedge-kit'
import { buildNavState, canonical, navState, walkTree, type NavStateName } from './nav-kit'
import { founder, listed, listedGroup } from './own-listing-kit'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'
import { PARITY_LIVES, PARITY_SLICES, parityDigests, type ParityLife, type ParityTrace } from './r2-parity-kit'
import { managedDesk } from './sector-kit'

/** Where the fixture is written and read, relative to the repository root. */
export const PARITY_FILE = 'test/fixtures/kernel-parity.json'

/** n items; h = fnv1a of the items joined by newlines, as 8 hex digits. */
export interface Digest {
  n: number
  h: string
}

export function digestOf(items: readonly string[]): Digest {
  return { n: items.length, h: fnv1a(items.join('\n')).toString(16).padStart(8, '0') }
}

// ---------------------------------------------------------------------------------------------------------------------
// The yearly lists
// ---------------------------------------------------------------------------------------------------------------------

export interface YearlyAccess {
  /** The hook names of the seam, in run order. */
  names(seam: 'aging' | 'special'): string[]
  /** Runs `fn` and pushes the name of every hook that runs, in order: an aging hook as `name`, a special hook as `special.name`. */
  traced<T>(out: string[], fn: () => T): T
  /** Runs `fn` with the aging list in the order `reorder` gives (a permutation of the names; anything else throws). */
  reordered<T>(reorder: (names: string[]) => string[], fn: () => T): T
}

/** A hook's name: its module id without the seam's prefix (`yearly.` for aging, `special.` for special). */
const AGING_PREFIX = 'yearly.'
const SPECIAL_PREFIX = 'special.'
const nameOf = (prefix: string, e: { id: string }): string => (e.id.startsWith(prefix) ? e.id.slice(prefix.length) : e.id)

type Entry = YearlyEntry & { id: string }
const agingEntries = (): readonly Entry[] => yearlyEntries('aging')
const specialEntries = (): readonly Entry[] => yearlyEntries('special')
const agingName = (e: { id: string }): string => nameOf(AGING_PREFIX, e)

/** The entries with each run wrapped to push `label(entry)` first; the ids and the order are kept. */
const tracing = (out: string[], entries: readonly Entry[], label: (e: Entry) => string): Entry[] =>
  entries.map((e) => ({
    ...e,
    run: (g: GameState) => {
      out.push(label(e))
      e.run(g)
    },
  }))

// K9 and K10: both seams are read from the registry (yearlyEntries, withYearly); nothing here reads a mutable list any more.
export const yearly: YearlyAccess = {
  names: (seam) => (seam === 'aging' ? agingEntries().map(agingName) : specialEntries().map((e) => nameOf(SPECIAL_PREFIX, e))),
  // an aging hook is pushed as its name, a special hook as its id (`special.<name>`)
  traced: (out, fn) =>
    withYearly('aging', tracing(out, agingEntries(), agingName), () => withYearly('special', tracing(out, specialEntries(), (e) => e.id), fn)),
  reordered: (reorder, fn) => {
    const entries = agingEntries()
    const names = entries.map(agingName)
    const order = reorder(names.slice())
    const byName = new Map(entries.map((e) => [agingName(e), e]))
    if (order.length !== names.length || new Set(order).size !== names.length || order.some((n) => !byName.has(n))) {
      throw new Error(`yearly.reordered: the new order is not a permutation of ${names.join(', ')}`)
    }
    return withYearly('aging', order.map((name) => byName.get(name)!), fn)
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// Lives
// ---------------------------------------------------------------------------------------------------------------------

/** The four lives of PARITY_LIVES this kit plays: the two birth lives with `rich: true` and the founders with 1 and 3 companies. */
export const KERNEL_LIFE_IDS: readonly string[] = ['b1960-rich', 'b2000-rich', 'f1950-1x25', 'f1990-3x25']

/** Years the v4.0.2 save is played. */
export const V1_YEARS = 5

/** Significant digits kept of a number that is not an integer (the same as PARITY_DIGITS in test/r2-parity-kit.ts once that rounds). */
export const FLOAT_DIGITS = 9

/** A deep copy of plain data with every finite non-integer number cut to FLOAT_DIGITS significant digits; integers and non-finite numbers stay. */
export function rounded<T>(v: T): T {
  if (typeof v === 'number') return (Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(FLOAT_DIGITS)) : v) as T
  if (Array.isArray(v)) return Array.from(v, rounded) as T
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) out[k] = rounded((v as Record<string, unknown>)[k])
    return out as T
  }
  return v
}

/** One row of a trace, in wave 0's order (the slices, then 'text'), digested from the rounded copy of the state. */
export function rowOf(g: GameState): string[] {
  const d = parityDigests(rounded(g))
  return [...PARITY_SLICES.map((s) => d[s]), d.text]
}

/** A copy of traceLife (test/r2-parity-kit.ts): the same play, the same rows, digested by rowOf. Row 0 is the state before the first year. */
export function traceOf(life: ParityLife): ParityTrace {
  const years: string[][] = []
  const onYear = (g: GameState): void => {
    years.push(rowOf(g))
  }
  if (life.kind === 'birth') {
    playLife({ seed: life.seed, birthYear: life.birthYear, untilAge: life.untilAge ?? 40, rich: life.rich ?? false, onYear })
  } else {
    probeLife({ seed: life.seed, birthYear: life.birthYear, businesses: life.businesses ?? 1, years: life.years ?? 25, onYear })
  }
  return { id: life.id, years }
}

export interface LivesParity {
  /** Wave 0's trace of each life of KERNEL_LIFE_IDS (a row per year, the slice digests of parityDigests, then 'text'). */
  traces: ParityTrace[]
  /** The v4.0.2 fixture life: one row (the same twelve digests) after each of its V1_YEARS years. */
  v1: string[][]
  /** One digest of the executed hook names of each life (keys: the life ids and 'v1'). */
  hooks: Record<string, Digest>
}

export function lifeOf(id: string): ParityLife {
  const life = PARITY_LIVES.find((l) => l.id === id)
  if (!life) throw new Error(`parity-kit: no life ${id} in PARITY_LIVES`)
  return life
}

/** Plays `life` through the real loop; `reorder` (when given) runs the aging list in another order. Returns the trace and the digest of the hooks that ran. */
export function tracedLife(life: ParityLife, reorder?: (names: string[]) => string[]): { trace: ParityTrace; hooks: Digest } {
  const out: string[] = []
  const play = (): ParityTrace => yearly.traced(out, () => traceOf(life))
  const trace = reorder ? yearly.reordered(reorder, play) : play()
  return { trace, hooks: digestOf(out) }
}

const V1_SAVE = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'save-v1.json.gz')

/** The v4.0.2 save through migrateSave (as in test/wave-stocks-story.test.ts), played V1_YEARS years with the popups cleared after each. */
export function v1Life(): { rows: string[][]; hooks: Digest } {
  const r = migrateSave(JSON.parse(gunzipSync(readFileSync(V1_SAVE)).toString()) as Record<string, unknown>)
  if (r.kind !== 'ready') throw new Error(`parity-kit: the v4.0.2 save is not ready: ${JSON.stringify(r)}`)
  const g = r.game
  const rows: string[][] = []
  const out: string[] = []
  yearly.traced(out, () => {
    for (let y = 0; y < V1_YEARS; y++) {
      g.queue = []
      ageUp(g)
      g.queue = []
      rows.push(rowOf(g))
    }
  })
  return { rows, hooks: digestOf(out) }
}

export function livesParity(): LivesParity {
  const traces: ParityTrace[] = []
  const hooks: Record<string, Digest> = {}
  for (const id of KERNEL_LIFE_IDS) {
    const played = tracedLife(lifeOf(id))
    traces.push(played.trace)
    hooks[id] = played.hooks
  }
  const v1 = v1Life()
  hooks.v1 = v1.hooks
  return { traces, v1: v1.rows, hooks }
}

// ---------------------------------------------------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------------------------------------------------

export const MENU_STATES: readonly NavStateName[] = ['kid', 'adult', 'ceo', 'elder']

/** The tree of one canned state (nav-kit) with the flags at their defaults: 'tab/topGroup' -> digest of the ordered `path|type` lines below it. */
export function menuParity(name: NavStateName, build: (n: NavStateName) => GameState = navState): Record<string, Digest> {
  resetFlags()
  const groups = new Map<string, string[]>()
  for (const w of walkTree(build(name))) {
    const path = canonical(w)
    const key = path.split('/').slice(0, 2).join('/')
    const rows = groups.get(key)
    if (rows) rows.push(`${path}|${w.type}`)
    else groups.set(key, [`${path}|${w.type}`])
  }
  const out: Record<string, Digest> = {}
  for (const key of [...groups.keys()].sort()) out[key] = digestOf(groups.get(key)!)
  return out
}

export function menusParity(): Record<string, Record<string, Digest>> {
  const out: Record<string, Record<string, Digest>> = {}
  for (const name of MENU_STATES) out[name] = menuParity(name)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Company views
// ---------------------------------------------------------------------------------------------------------------------

function firstCity(countryId: string): string {
  return getCountry(countryId).cities[0] ?? 'the capital'
}

/** A founder (hedge-kit's `rich`) who owns and runs one company of this industry. */
function industryCompany(industry: string): { g: GameState; a: Asset } {
  const g = rich()
  const b0 = newBiz(g, industry as Parameters<typeof newBiz>[1], 'us', firstCity('us'), { cash: 5_000_000 })
  const a = createBusinessAsset(g, `Parity ${industry}`, b0, 1e6)
  g.assets.push(a)
  becomeCeo(g, a, bizOf(g, a))
  g.queue = []
  return { g, a }
}

/** The five special companies: a hired CEO with a board, a listed company, a group division, a deep-tech lab, a company in the red. */
export const VIEW_VARIANTS: Readonly<Record<string, () => { g: GameState; a: Asset }>> = {
  hiredCeoBoard: () => {
    const { g, a, b } = managedDesk('restaurant', 70)
    b.share = 0.7
    return { g, a }
  },
  listed: () => {
    const g = founder()
    return { g, a: listed(g).a }
  },
  groupDivision: () => {
    const g = founder()
    return { g, a: listedGroup(g, 'us', 0.6).members[0]! }
  },
  deepTechLab: () => {
    const g = adultIn('us', 6_000_000)
    return { g, a: found(g, 'biotech') }
  },
  negativeCash: () => {
    const g = rich()
    const { a, b } = company(g)
    b.cash = -2_000_000
    return { g, a }
  },
}

/** Every id of INDUSTRY_IDS first, then the five variants. */
export const VIEW_KEYS: readonly string[] = [...INDUSTRY_IDS, ...Object.keys(VIEW_VARIANTS)]

/** The ids of businessView and, inside each menu node, the ids one level down. Pure: a read of `g`. */
export function viewIds(g: GameState, a: Asset): string[] {
  const out: string[] = []
  for (const n of businessView(g, a)) {
    out.push(`${n.type} ${n.id}`)
    if (n.type === 'menu') for (const c of n.children(g)) out.push(`${n.id} > ${c.type} ${c.id}`)
  }
  return out
}

/** The digest of one company view, built from scratch (an industry id or a key of VIEW_VARIANTS). */
export function viewParity(key: string): Digest {
  resetFlags()
  const make = VIEW_VARIANTS[key]
  const { g, a } = make ? make() : industryCompany(key)
  return digestOf(viewIds(g, a))
}

export function viewsParity(): Record<string, Digest> {
  const out: Record<string, Digest> = {}
  for (const key of VIEW_KEYS) out[key] = viewParity(key)
  return out
}

/** Builds a canned state from scratch (no memo), for the determinism check of the menu kit. */
export const freshNavState = buildNavState
