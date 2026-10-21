// The module registry (R2, K.3, design 14.5): the one place that knows which modules exist and in what order they run.
//
// A module is a plain definition (ModuleDef): an id, a layer, the saved slices it owns, and the entries it adds to the three
// seams the game has today. A yearly entry runs in a year step (the aging seam is ageUp, the special seam is yearlySpecial). A
// menu entry builds the nodes of one named slot of a menu. A handler hears one kind of fact from the bus. The registry sorts
// them: the order is a pure function of the registered set, (phase, order, module id, index in module), so the order modules
// are imported or registered in never matters, and a track adds a module without touching anyone else's list.
//
// Rules this file keeps:
//   - a definition is checked whole before anything changes, then copied and frozen, so a throw leaves no half-registered
//     module and a later edit of the caller's object changes nothing;
//   - a list is frozen and is the same array until the next registration (a registration drops every cache), so a year step
//     reads it for free and nobody can change it by accident;
//   - it draws no random number, reads no clock and keeps no game state: it is a table, and a test starts it fresh by
//     importing a new copy (vi.resetModules);
//   - it imports only the game types and other kernel files (L0).
//
// A handler is declared in ModuleDef.handles; there is no on(kind, handler). The bus (bus.ts) needs the module id to order its
// deliveries and the slice to hold a handler to the slice it writes, and both are in the definition.
import type { Asset, GameState, MenuNode } from '../types'
import { isFactKind, type Fact } from './fact'

export type Layer = 0 | 1 | 2 | 3 | 4
export type YearlySeam = 'aging' | 'special'

/**
 * The phases of each yearly seam, in run order. Today's hooks keep today's order inside the legacy phases; a new module takes
 * the phase its reads allow, and a module reads only what earlier phases wrote in the same year.
 */
export const YEARLY_PHASES = Object.freeze({
  aging: Object.freeze([
    'geopolitics',
    'world',
    'frontier',
    'society',
    'life',
    'careers',
    'government',
    'firms',
    'money',
    'assets',
    'advisors',
    'close',
    'settle',
    'news',
  ] as const),
  special: Object.freeze(['service', 'careers', 'public'] as const),
})

/** The phases of a menu slot: what comes first, the body (the default) and what comes last. */
export const MENU_PHASES = Object.freeze(['head', 'main', 'tail'] as const)

export interface YearlyEntry {
  seam: YearlySeam
  phase: string
  /** 0 to 9999. A multiple of 10 by habit, so a track can insert between two. */
  order: number
  run: (g: GameState) => void
}

export interface MenuEntry {
  /** A slot name: lower case dotted words, as `assets.money` or `business.view.top`. A track may introduce a new slot. */
  path: string
  /** One of MENU_PHASES; main when absent. */
  phase?: string
  order: number
  build: (g: GameState, a?: Asset, ctx?: unknown) => MenuNode[]
}

export interface HandlerEntry {
  /** The fact kind this handler hears, or '*' for every kind. */
  kind: string
  /** The one slice the handler writes (a dotted path into the state, `world.facts`). */
  slice: string
  run: (g: GameState, fact: Fact) => void
}

export interface ModuleDef {
  /** Unique: lower case first word, then dotted words of letters and digits (`yearly.history`, `facts`). */
  id: string
  layer: Layer
  /** Saved slice keys this module owns. One owner per key. */
  slices?: readonly string[]
  yearly?: readonly YearlyEntry[]
  menus?: readonly MenuEntry[]
  handles?: readonly HandlerEntry[]
  /** Fact kinds this module may emit. */
  facts?: readonly string[]
  /** Reserved for the level-of-detail framework (K.6). */
  lod?: Readonly<Record<string, unknown>>
  /** Reserved for the budget meter (K.6). */
  budget?: { readonly yearMs?: number; readonly stateNodes?: number }
}

/** An entry with its name: the module id, or `${moduleId}#${i}` when the module has several entries in one seam or slot. */
export type Ordered<T> = T & { id: string }

const ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/
const SLOT = /^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/
const SLICE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/
const MAX_ORDER = 9999

// ---------------------------------------------------------------------------------------------------------------------
// What is registered

const MODULES = new Map<string, ModuleDef>()
const OWNERS = new Map<string, string>()
/** The lists `withYearly` put in place for the length of a call, per seam. */
const OVERRIDES = new Map<YearlySeam, readonly Ordered<YearlyEntry>[]>()

interface HandlerRef {
  moduleId: string
  entry: HandlerEntry
}

interface Index {
  yearly: Record<YearlySeam, readonly Ordered<YearlyEntry>[]>
  menus: Map<string, readonly Ordered<MenuEntry>[]>
  /** Each exact kind that has a handler: its handlers, then the star handlers. */
  handlers: Map<string, readonly HandlerRef[]>
  star: readonly HandlerRef[]
  ids: readonly string[]
  slices: readonly string[]
  facts: ReadonlySet<string>
}

/** Built on the first read after a registration; a registration sets it back to null. */
let index: Index | null = null

const EMPTY: readonly never[] = Object.freeze([])

// ---------------------------------------------------------------------------------------------------------------------
// Checking a definition

/** How a bad value reads in a message: a string quoted, anything else by its type, so a hostile value never throws here. */
function show(v: unknown): string {
  return typeof v === 'string' ? JSON.stringify(v.slice(0, 60)) : typeof v
}

const isOrder = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_ORDER

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function listOf(v: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(v)) throw new Error(`registry: ${where} is not a list`)
  return v
}

/** One yearly entry, checked and copied. `seam` is the seam it has to belong to, when the caller knows it (withYearly). */
function checkYearly(raw: unknown, where: string, seam?: YearlySeam): Readonly<YearlyEntry> {
  if (!isRecord(raw)) throw new Error(`registry: ${where} is not an object`)
  const s = raw.seam
  if (s !== 'aging' && s !== 'special') throw new Error(`registry: ${where} has a bad seam ${show(s)}`)
  if (seam !== undefined && s !== seam) throw new Error(`registry: ${where} is for the seam ${s}, not ${seam}`)
  const phases: readonly string[] = YEARLY_PHASES[s]
  if (typeof raw.phase !== 'string' || !phases.includes(raw.phase)) throw new Error(`registry: ${where} has a phase the ${s} seam does not have: ${show(raw.phase)}`)
  if (!isOrder(raw.order)) throw new Error(`registry: ${where} has a bad order ${show(raw.order)}, an integer from 0 to ${MAX_ORDER}`)
  if (typeof raw.run !== 'function') throw new Error(`registry: ${where} has no run function`)
  return Object.freeze({ seam: s, phase: raw.phase, order: raw.order, run: raw.run as YearlyEntry['run'] })
}

function checkMenu(raw: unknown, where: string): Readonly<MenuEntry> {
  if (!isRecord(raw)) throw new Error(`registry: ${where} is not an object`)
  if (typeof raw.path !== 'string' || !SLOT.test(raw.path)) throw new Error(`registry: ${where} has a bad menu slot ${show(raw.path)}`)
  if (raw.phase !== undefined && (typeof raw.phase !== 'string' || !(MENU_PHASES as readonly string[]).includes(raw.phase))) {
    throw new Error(`registry: ${where} has a bad menu phase ${show(raw.phase)}`)
  }
  if (!isOrder(raw.order)) throw new Error(`registry: ${where} has a bad order ${show(raw.order)}, an integer from 0 to ${MAX_ORDER}`)
  if (typeof raw.build !== 'function') throw new Error(`registry: ${where} has no build function`)
  const entry: MenuEntry = { path: raw.path, order: raw.order, build: raw.build as MenuEntry['build'] }
  if (raw.phase !== undefined) entry.phase = raw.phase as string
  return Object.freeze(entry)
}

function checkHandler(raw: unknown, where: string): Readonly<HandlerEntry> {
  if (!isRecord(raw)) throw new Error(`registry: ${where} is not an object`)
  if (raw.kind !== '*' && !isFactKind(raw.kind)) throw new Error(`registry: ${where} has a bad handler kind ${show(raw.kind)}`)
  if (typeof raw.slice !== 'string' || !SLICE.test(raw.slice)) throw new Error(`registry: ${where} has a bad slice ${show(raw.slice)}`)
  if (typeof raw.run !== 'function') throw new Error(`registry: ${where} has no run function`)
  return Object.freeze({ kind: raw.kind as string, slice: raw.slice, run: raw.run as HandlerEntry['run'] })
}

/**
 * The whole definition, checked, and copied into a frozen snapshot. Throws on the first problem; changes nothing. `hasId` and
 * `ownerOf` say what is registered already (for a batch, including what the batch registered before this one).
 */
function prepare(raw: unknown, hasId: (id: string) => boolean, ownerOf: (slice: string) => string | undefined): ModuleDef {
  if (!isRecord(raw)) throw new Error('registry: a module definition is not an object')
  const id = raw.id
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`registry: bad id ${show(id)}`)
  if (hasId(id)) throw new Error(`registry: module ${id} is already registered`)
  const at = (what: string): string => `module ${id}: ${what}`
  const layer = raw.layer
  if (typeof layer !== 'number' || !Number.isInteger(layer) || layer < 0 || layer > 4) throw new Error(`registry: ${at(`bad layer ${show(layer)}, 0 to 4`)}`)
  const def: { -readonly [K in keyof ModuleDef]: ModuleDef[K] } = { id, layer: layer as Layer }

  if (raw.slices !== undefined) {
    const seen = new Set<string>()
    const slices = listOf(raw.slices, at('slices')).map((s) => {
      if (typeof s !== 'string' || !SLICE.test(s)) throw new Error(`registry: ${at(`bad slice ${show(s)}`)}`)
      if (seen.has(s)) throw new Error(`registry: ${at(`slice ${s} is listed more than once`)}`)
      seen.add(s)
      const owner = ownerOf(s)
      if (owner !== undefined) throw new Error(`registry: ${at(`slice ${s} is already owned by ${owner}`)}`)
      return s
    })
    def.slices = Object.freeze(slices)
  }
  if (raw.yearly !== undefined) def.yearly = Object.freeze(listOf(raw.yearly, at('yearly')).map((e, i) => checkYearly(e, at(`yearly[${i}]`))))
  if (raw.menus !== undefined) def.menus = Object.freeze(listOf(raw.menus, at('menus')).map((e, i) => checkMenu(e, at(`menus[${i}]`))))
  if (raw.handles !== undefined) def.handles = Object.freeze(listOf(raw.handles, at('handles')).map((e, i) => checkHandler(e, at(`handles[${i}]`))))
  if (raw.facts !== undefined) {
    def.facts = Object.freeze(
      listOf(raw.facts, at('facts')).map((k) => {
        if (!isFactKind(k)) throw new Error(`registry: ${at(`bad fact kind ${show(k)}`)}`)
        return k
      }),
    )
  }
  if (raw.lod !== undefined) {
    if (!isRecord(raw.lod)) throw new Error(`registry: ${at('lod is not an object')}`)
    def.lod = Object.freeze({ ...raw.lod })
  }
  if (raw.budget !== undefined) {
    const b = raw.budget
    if (!isRecord(b)) throw new Error(`registry: ${at('budget is not an object')}`)
    const budget: { yearMs?: number; stateNodes?: number } = {}
    for (const key of ['yearMs', 'stateNodes'] as const) {
      const v = b[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`registry: ${at(`budget.${key} is not a number of 0 or more`)}`)
      budget[key] = v
    }
    def.budget = Object.freeze(budget)
  }
  return Object.freeze(def)
}

function commit(def: ModuleDef): void {
  MODULES.set(def.id, def)
  for (const s of def.slices ?? []) OWNERS.set(s, def.id)
  index = null
}

/**
 * Adds one module. Throws on a duplicate module id or slice, a bad id, layer, phase, order, slot or kind, and then the registry
 * is exactly as it was. The registry keeps a frozen copy of the definition.
 */
export function registerModule(def: ModuleDef): void {
  commit(prepare(def, (id) => MODULES.has(id), (s) => OWNERS.get(s)))
}

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Where a phase sits in its list; a definition was checked, so it is there. */
const phaseIndex = (phases: readonly string[], phase: string): number => phases.indexOf(phase)

/** Adds the modules sorted by id (so the first problem a batch reports is the same whatever its order). All or none: a bad one registers nothing. */
export function registerModules(defs: readonly ModuleDef[]): void {
  const idOf = (d: unknown): string => (isRecord(d) && typeof d.id === 'string' ? d.id : '')
  const sorted = [...defs].sort((a, b) => byCode(idOf(a), idOf(b)))
  const stagedIds = new Set<string>()
  const stagedOwners = new Map<string, string>()
  const staged: ModuleDef[] = []
  for (const d of sorted) {
    const p = prepare(d, (id) => MODULES.has(id) || stagedIds.has(id), (s) => OWNERS.get(s) ?? stagedOwners.get(s))
    stagedIds.add(p.id)
    for (const s of p.slices ?? []) stagedOwners.set(s, p.id)
    staged.push(p)
  }
  for (const p of staged) commit(p)
}

// ---------------------------------------------------------------------------------------------------------------------
// The sorted views

interface Row<T> {
  phase: number
  order: number
  moduleId: string
  i: number
  item: Ordered<T>
}

function rowsSorted<T>(rows: Row<T>[]): readonly Ordered<T>[] {
  rows.sort((a, b) => a.phase - b.phase || a.order - b.order || byCode(a.moduleId, b.moduleId) || a.i - b.i)
  return Object.freeze(rows.map((r) => r.item))
}

function build(): Index {
  const defs = [...MODULES.values()]
  const yearlyRows: Record<YearlySeam, Row<YearlyEntry>[]> = { aging: [], special: [] }
  const menuRows = new Map<string, Row<MenuEntry>[]>()
  const exact = new Map<string, { moduleId: string; i: number; entry: HandlerEntry }[]>()
  const star: { moduleId: string; i: number; entry: HandlerEntry }[] = []
  const facts = new Set<string>()
  for (const def of defs) {
    const inSeam: Record<YearlySeam, number> = { aging: 0, special: 0 }
    for (const e of def.yearly ?? []) inSeam[e.seam]++
    const seamI: Record<YearlySeam, number> = { aging: 0, special: 0 }
    for (const e of def.yearly ?? []) {
      const i = seamI[e.seam]++
      const id = inSeam[e.seam] === 1 ? def.id : `${def.id}#${i}`
      yearlyRows[e.seam].push({ phase: phaseIndex(YEARLY_PHASES[e.seam], e.phase), order: e.order, moduleId: def.id, i, item: Object.freeze({ ...e, id }) })
    }
    const inSlot = new Map<string, number>()
    for (const e of def.menus ?? []) inSlot.set(e.path, (inSlot.get(e.path) ?? 0) + 1)
    const slotI = new Map<string, number>()
    for (const e of def.menus ?? []) {
      const i = slotI.get(e.path) ?? 0
      slotI.set(e.path, i + 1)
      const id = inSlot.get(e.path) === 1 ? def.id : `${def.id}#${i}`
      const row: Row<MenuEntry> = { phase: phaseIndex(MENU_PHASES, e.phase ?? 'main'), order: e.order, moduleId: def.id, i, item: Object.freeze({ ...e, id }) }
      const list = menuRows.get(e.path)
      if (list) list.push(row)
      else menuRows.set(e.path, [row])
    }
    ;(def.handles ?? []).forEach((entry, i) => {
      const row = { moduleId: def.id, i, entry }
      if (entry.kind === '*') star.push(row)
      else {
        const list = exact.get(entry.kind)
        if (list) list.push(row)
        else exact.set(entry.kind, [row])
      }
    })
    for (const k of def.facts ?? []) facts.add(k)
  }
  const refs = (rows: { moduleId: string; i: number; entry: HandlerEntry }[]): readonly HandlerRef[] =>
    rows
      .sort((a, b) => byCode(a.moduleId, b.moduleId) || a.i - b.i)
      .map((r) => Object.freeze({ moduleId: r.moduleId, entry: r.entry }))
  const starRefs = Object.freeze(refs(star))
  const handlers = new Map<string, readonly HandlerRef[]>()
  for (const kind of [...exact.keys()].sort(byCode)) handlers.set(kind, Object.freeze([...refs(exact.get(kind)!), ...starRefs]))
  const menus = new Map<string, readonly Ordered<MenuEntry>[]>()
  for (const path of [...menuRows.keys()].sort(byCode)) menus.set(path, rowsSorted(menuRows.get(path)!))
  return {
    yearly: { aging: rowsSorted(yearlyRows.aging), special: rowsSorted(yearlyRows.special) },
    menus,
    handlers,
    star: starRefs,
    ids: Object.freeze([...MODULES.keys()].sort(byCode)),
    slices: Object.freeze([...OWNERS.keys()].sort(byCode)),
    facts: new Set([...facts].sort(byCode)),
  }
}

const view = (): Index => (index ??= build())

/**
 * The yearly entries of one seam in run order: (phase, order, module id, index in module). The same frozen array until the
 * next registration. Inside withYearly it is the list the test put in place.
 */
export function yearlyEntries(seam: YearlySeam): readonly Ordered<YearlyEntry>[] {
  if (seam !== 'aging' && seam !== 'special') throw new Error(`registry: bad seam ${show(seam)}`)
  return OVERRIDES.get(seam) ?? view().yearly[seam]
}

/** The entries of one menu slot in (phase, order, module id) order. Throws on a bad slot name. An unused slot is the empty list. */
export function menuEntries(path: string): readonly Ordered<MenuEntry>[] {
  if (typeof path !== 'string' || !SLOT.test(path)) throw new Error(`registry: bad menu slot ${show(path)}`)
  return view().menus.get(path) ?? EMPTY
}

/** The nodes of one menu slot: every builder of the slot called with (g, a, ctx), in order, joined. A new array each call. */
export function collectMenu(path: string, g: GameState, a?: Asset, ctx?: unknown): MenuNode[] {
  const out: MenuNode[] = []
  for (const e of menuEntries(path)) {
    for (const node of e.build(g, a, ctx)) out.push(node)
  }
  return out
}

/** The handlers a fact of `kind` goes to: the handlers of that exact kind first, then the '*' handlers, each sorted by module id. */
export function handlersFor(kind: string): readonly { moduleId: string; entry: HandlerEntry }[] {
  const v = view()
  return v.handlers.get(kind) ?? v.star
}

/** Every fact kind a module declared it may emit, sorted. */
export function registeredFacts(): ReadonlySet<string> {
  return view().facts
}

/** Every slice key a module owns, sorted. */
export function registeredSlices(): readonly string[] {
  return view().slices
}

/** Every module id, sorted. */
export function moduleIds(): readonly string[] {
  return view().ids
}

/** The frozen copy of a registered definition. */
export function getModule(id: string): ModuleDef | undefined {
  return MODULES.get(id)
}

/**
 * A test seam: for the length of `fn`, the yearly list of `seam` is `entries`, in the order given (not sorted again, so a test
 * can swap two hooks). An entry that has an id (one taken from yearlyEntries) keeps it, any other is called `override#<index>`.
 * It restores the list when `fn` returns or throws, and it nests. Synchronous: an async `fn` is restored when it returns its promise.
 */
export function withYearly<T>(seam: YearlySeam, entries: readonly YearlyEntry[], fn: () => T): T {
  if (seam !== 'aging' && seam !== 'special') throw new Error(`registry: bad seam ${show(seam)}`)
  const list = entries.map((raw, i): Ordered<YearlyEntry> => {
    const e = checkYearly(raw, `withYearly entry ${i}`, seam)
    const given = (raw as { id?: unknown }).id
    return Object.freeze({ ...e, id: typeof given === 'string' && given !== '' ? given : `override#${i}` })
  })
  const before = OVERRIDES.get(seam)
  OVERRIDES.set(seam, Object.freeze(list))
  try {
    return fn()
  } finally {
    if (before) OVERRIDES.set(seam, before)
    else OVERRIDES.delete(seam)
  }
}
