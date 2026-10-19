// What the sector families share: the types a family implements, the registry they join, and the
// pure helpers (seasons, key-role skill, base revenue, history rows, copy tables). Of the sector files
// this one imports only sector-state.ts and sector-data.ts, so a family file never imports
// sector-core.ts back and the registry stays free of cycles.
import { activeMarketEvents } from '../history/market-events'
import type { Asset, GameState } from '../types'
import { localEcon, planFor, type BizFx } from './economy'
import { bizHas, sameRole } from './era'
import { hashOf, mix } from './product-market'
import { SECTOR_HISTORY } from './sector-data'
import type { FamilyId, SectorState } from './sector-state'
import type { BizState } from './state'
import { clampN, pct } from './util'

/** 'book': what the year will really draw. 'expected': every draw at its mean and never past g.year (hints, previews, the CEO). */
export type FxMode = 'book' | 'expected'

/** The calm numbers a family reads: `use` is the calm plan's demand over its capacity. */
export interface SectorCtx { use: number; base: number; level: number; going: number }

export interface SectorFx {
  demand: number
  cost: number
  capLoss: number
  open: number
  income: number
  costs: number
  /** Random money flows (spot settlements, repairs, penalties): capped by the core at 12% of base revenue. */
  randIncome: number
  randCosts: number
  next: SectorState
  note: { text: string; tone: 'good' | 'bad' | 'neutral' } | null
}

export interface LeverOption { value: number; label: string; tip: string }

export interface LeverDef {
  id: string
  label: string
  paid: boolean
  options(g: GameState, b: BizState, st: SectorState): LeverOption[]
  current(st: SectorState, year: number): number
  apply(st: SectorState, value: number, year: number): SectorState
  cost(g: GameState, b: BizState, st: SectorState, value: number, cx: SectorCtx): number
}

/** Changes to the record's own numbers: `add` first, then `set`, on the keys of SEC_KEYS[family] only. */
export interface SecFx { add?: Record<string, number>; set?: Record<string, number> }

/** One outcome of an event choice. `text` is a copy key and `vals` fill its holes. */
export interface Branch { p: number; fx: BizFx; sec?: SecFx; text: string; vals?: Record<string, string | number> }

export interface SectorChoice {
  id: string
  label: string
  branches(g: GameState, b: BizState, st: SectorState): Branch[]
}

export interface SectorEvent {
  id: string
  family: FamilyId
  title: string
  emoji: string
  weight(g: GameState, b: BizState, st: SectorState): number
  scene(g: GameState, a: Asset, b: BizState, st: SectorState): string
  choices(g: GameState, b: BizState, st: SectorState): SectorChoice[]
}

/** The key suffix gives the voice role: .scene .out .log .tip .label .head (event titles, at most 40 characters). */
export type CopyTable = Readonly<Record<string, string>>

export interface FamilyModel {
  family: FamilyId
  copy: CopyTable
  seed(g: GameState, a: Asset, b: BizState, since: number): SectorState
  effects(g: GameState, a: Asset, b: BizState, st: SectorState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx
  header(g: GameState, b: BizState, st: SectorState | null): string[]
  levers: readonly LeverDef[]
  events: readonly SectorEvent[]
}

// ---------------------------------------------------------------------------
// The registry

const MODELS = new Map<FamilyId, FamilyModel>()

/** Join the registry. A model of the same family replaces the earlier one (a test's stub, a hot reload). */
export function registerFamily(m: FamilyModel): void {
  MODELS.set(m.family, m)
}

export function modelOf(f: FamilyId): FamilyModel | null {
  return MODELS.get(f) ?? null
}

export function registeredModels(): FamilyModel[] {
  return [...MODELS.values()]
}

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * A stable draw in [-1, 1] with mean 0 for a company, a year and a salt. A hash, never g.rng, so a
 * reload gives the same draw and nothing is re-rolled.
 */
export function seasonIndex(g: Pick<GameState, 'lifeId'>, a: Pick<Asset, 'id'>, year: number, salt: string): number {
  return 2 * mix(hashOf([g.lifeId, a.id, year, salt].join('|')), hashOf(salt), 1) - 1
}

/** The year whose draws a computation reads: 'expected' never reads past the year being lived. */
export function readYear(g: Pick<GameState, 'year'>, fiscal: number, mode: FxMode): number {
  return mode === 'expected' ? Math.min(fiscal, g.year) : fiscal
}

/** The skill (0 to 1) of the key person holding a role, 0 when nobody does. */
export function roleSkill(b: Pick<BizState, 'staff'>, title: string): number {
  const who = b.staff.find((s) => sameRole(s.role, title))
  return who ? clampN(who.skill / 100, 0, 1) : 0
}

/** What a normal year sells: last year's net sales, or for a new company the calm plan's units at the suggested price. */
export function baseRevenue(g: GameState, b: BizState): number {
  const last = b.last?.netRevenue ?? 0
  if (last > 0) return last
  const e = localEcon(b.industry, b.countryId, b.city)
  const plan = planFor(g, b, g.year, { calm: true })
  const units = Math.min(plan.demand, plan.capacity)
  const revenue = (units * plan.suggested) / (1 + e.taxRate)
  return Number.isFinite(revenue) ? Math.max(0, revenue) : 0
}

export function sectorCtx(g: GameState, b: BizState, year: number): SectorCtx {
  const calm = planFor(g, b, year, { calm: true })
  const e = localEcon(b.industry, b.countryId, b.city)
  return { use: calm.demand / Math.max(1, calm.capacity), base: baseRevenue(g, b), level: e.level, going: e.goingPrice }
}

function historyShifts(g: GameState, b: BizState, year: number): { event: string; name: string; shift: number }[] {
  const rows = SECTOR_HISTORY.filter((r) => r.trade === b.industry)
  if (!rows.length) return []
  const out: { event: string; name: string; shift: number }[] = []
  for (const { event, strength } of activeMarketEvents(b.countryId, year)) {
    for (const r of rows) {
      if (r.event !== event.id) continue
      out.push({ event: event.id, name: event.id === 'crash2020' ? 'The 2020 crash' : event.name, shift: strength * (r.demand + (r.internet && bizHas(g, b.countryId, 'internet') ? r.internet : 0)) })
    }
  }
  return out
}

/** A real event's demand effect on a trade the engine does not already map, .9 to 1.1 (1 when none applies). */
export function historyFactor(g: GameState, b: BizState, year: number): number {
  let f = 1
  for (const x of historyShifts(g, b, year)) f *= 1 + x.shift
  return clampN(f, .9, 1.1)
}

/** One rough-estimate line while a history row is active this year (null otherwise). */
export function sectorHistoryLine(g: GameState, b: BizState): string | null {
  const x = historyShifts(g, b, g.year)[0]
  if (!x) return null
  const shown = pct(x.shift)
  const text = x.shift > 0 ? `+${shown}` : shown === '-0%' ? '0%' : shown
  return `${x.name} moved your demand by about ${text}. That's a rough estimate.`
}

/** A copy line with its `${name}` holes filled (a hole with no value is empty; an unknown key gives ''). */
export function sectorText(table: CopyTable, key: string, vals: Record<string, string | number> = {}): string {
  if (!Object.prototype.hasOwnProperty.call(table, key)) return ''
  return table[key].replace(/\$\{(\w+)\}/g, (_, k: string) => (Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : ''))
}

export type CopyRole = 'scene' | 'outcome' | 'log' | 'tooltip' | 'label' | 'title'
const COPY_ROLES: Readonly<Record<string, CopyRole>> = { scene: 'scene', out: 'outcome', log: 'log', tip: 'tooltip', label: 'label', head: 'title' }

/** Every line of a copy table with the voice role its key suffix names (a key with another suffix throws). */
export function copyLines(table: CopyTable): { key: string; role: CopyRole; text: string }[] {
  return Object.entries(table).map(([key, text]) => {
    const dot = key.lastIndexOf('.')
    const role = dot >= 0 && Object.prototype.hasOwnProperty.call(COPY_ROLES, key.slice(dot + 1)) ? COPY_ROLES[key.slice(dot + 1)] : null
    if (!role) throw new Error(`Copy key "${key}" does not end in .scene, .out, .log, .tip, .label or .head`)
    return { key, role, text }
  })
}
