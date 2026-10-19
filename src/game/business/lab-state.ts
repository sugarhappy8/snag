// Plain-JSON state of a company's research lab (BizState.lab): Operations R&D levels and programs, the
// research team, patents and a four-year ledger, plus the pure readers the rest of the game uses.
// Light on imports on purpose, as franchise-state.ts is: economy.ts reads labIncomeIn() and labValue()
// for the valuation, and lab-year.ts holds the bookings and the actions. Nothing here draws g.rng.
//
// A stored lab is never changed in place. Readers call readLab(), which returns a shared, frozen,
// normalized copy cached by the identity of the stored object. Writers take draftLab() (a mutable copy),
// change it and hand it to saveLab(), which stores a NEW object, so a cached read can never go stale.
import type { Json } from '../types'
import { OPS_PROGRAMS, opsProgram } from './lab-data'
import type { BizState } from './state'
import { clampN, num, rec } from './util'

export type LabTrack = 'cost' | 'yield' | 'quality'

/** The three tracks in the order programs roll at year end. */
export const LAB_TRACKS: readonly LabTrack[] = ['cost', 'yield', 'quality']

/** Storage and rule bounds: a damaged or hostile save can never make the lab bigger than these. */
export const LAB_LIMITS = { programs: 3, team: 6, patents: 6, filed: 40, ledger: 4, runs: 12, done: 9, family: 80 } as const

/** A track's level: `v` (0 to .95) at the start of year `at`, fading 5% a year after it. */
export interface LabLevel {
  v: number
  at: number
}

/** An Operations R&D program being worked on (one per track). The price is paid when it starts. */
export interface LabProgram {
  id: string
  /** Calendar year it started. */
  started: number
  /** Booked years of work it needs (1-4). */
  years: number
  /** Booked years done so far. */
  progress: number
  /** Chance it works when it is done (fixed when it starts). */
  odds: number
  price: number
  /** The research grant it will pay when the work is done, win or flop (fixed when it starts). */
  grant: number
}

export interface LabPatent {
  /** The product family it protects. */
  family: string
  filed: number
  /** Protected while the year is before this one. */
  until: number
  mode: 'hold' | 'license'
  /** First licensed year (0: not licensed). */
  lic: number
  /** The fixed development price it is based on. */
  plan: number
  /** What it is worth on the company's books. */
  book: number
  /** Royalties received so far. */
  earned: number
}

/** What the lab booked for one fiscal year (every amount is also on the annual report). */
export interface LabRow {
  year: number
  credit: number
  grant: number
  royalty: number
  payroll: number
}

export interface LabState {
  v: 1
  levels: Record<LabTrack, LabLevel>
  /** Wins per track: the learning curve (0-12). */
  runs: Record<LabTrack, number>
  /** Program id to the year of its last win (its cooldown). */
  done: Record<string, number>
  programs: LabProgram[]
  /** The year each scientist was hired, oldest first. */
  team: number[]
  patents: LabPatent[]
  /** Families ever patented here: they cannot be filed again. */
  filed: string[]
  /** Grant earned and not yet paid: it arrives with the next booking. */
  due: { grant: number }
  /** Last fiscal year booked and last fiscal year advanced; year of the last grant (0: none yet). */
  booked: number
  stepped: number
  lastGrant: number
  /** The last four fiscal years the lab booked something. */
  ledger: LabRow[]
}

const YEAR_MIN = 1800
const YEAR_MAX = 2300
const MONEY_MAX = 1e15

/** A year in range, rounded, or NaN. */
function yearOf(v: Json | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= YEAR_MIN && v <= YEAR_MAX ? Math.round(v) : Number.NaN
}

/** A year in range, or 0 for "none". */
function markOf(v: Json | undefined): number {
  const y = yearOf(v)
  return Number.isNaN(y) ? 0 : y
}

/** Dollars, never negative and never huge; a missing amount reads 0. */
function dollarsOf(v: Json | undefined): number {
  return Math.round(clampN(num(v), 0, MONEY_MAX))
}

/** A ledger amount: a missing one reads 0, a damaged one (not a finite number from 0) is NaN and drops the row. */
function rowMoney(v: Json | undefined): number {
  if (v === undefined) return 0
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(Math.min(MONEY_MAX, v)) : Number.NaN
}

function names(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= LAB_LIMITS.family))]
}

function readLevel(v: Json | undefined): LabLevel {
  const x = rec(v)
  const level = x ? clampN(num(x.v), 0, 0.95) : 0
  const at = x ? markOf(x.at) : 0
  return level > 0 && at > 0 ? { v: level, at } : { v: 0, at: 0 }
}

function readProgram(v: Json): LabProgram | null {
  const x = rec(v)
  const def = x && typeof x.id === 'string' ? opsProgram(x.id) : null
  if (!x || !def) return null
  const started = yearOf(x.started)
  if (Number.isNaN(started)) return null
  const years = Math.round(clampN(num(x.years, 1), 1, 4))
  return {
    id: def.id,
    started,
    years,
    progress: Math.round(clampN(num(x.progress), 0, years)),
    odds: clampN(num(x.odds, 0.5), 0.02, 0.98),
    price: dollarsOf(x.price),
    grant: dollarsOf(x.grant),
  }
}

function readPatent(v: Json): LabPatent | null {
  const x = rec(v)
  if (!x || typeof x.family !== 'string' || x.family.length === 0 || x.family.length > LAB_LIMITS.family) return null
  const filed = yearOf(x.filed)
  const until = yearOf(x.until)
  if (Number.isNaN(filed) || Number.isNaN(until) || until <= filed) return null
  const lic = markOf(x.lic)
  const licensed = x.mode === 'license' && lic > 0
  return { family: x.family, filed, until, mode: licensed ? 'license' : 'hold', lic: licensed ? lic : 0, plan: dollarsOf(x.plan), book: dollarsOf(x.book), earned: dollarsOf(x.earned) }
}

function readRow(v: Json): LabRow | null {
  const x = rec(v)
  if (!x) return null
  const year = yearOf(x.year)
  const row = { year, credit: rowMoney(x.credit), grant: rowMoney(x.grant), royalty: rowMoney(x.royalty), payroll: rowMoney(x.payroll) }
  return Object.values(row).some(Number.isNaN) ? null : row
}

/** A sane lab from whatever is stored or handed in (pure; always a fresh, mutable object). */
function normalize(raw: Json | undefined): LabState {
  const d = rec(raw)
  const levels = rec(d?.levels)
  const runs = rec(d?.runs)
  const done = rec(d?.done)
  const doneOut: Record<string, number> = {}
  for (const p of OPS_PROGRAMS) {
    const y = done ? yearOf(done[p.id]) : Number.NaN
    if (!Number.isNaN(y)) doneOut[p.id] = y
  }
  // One program per track (the first one stored wins), in the order they roll.
  const programs: LabProgram[] = []
  for (const x of Array.isArray(d?.programs) ? d.programs : []) {
    const p = readProgram(x)
    if (p && !programs.some((q) => opsProgram(q.id)?.track === opsProgram(p.id)?.track)) programs.push(p)
  }
  programs.sort((x, y) => LAB_TRACKS.indexOf(opsProgram(x.id)!.track) - LAB_TRACKS.indexOf(opsProgram(y.id)!.track))
  const patents: LabPatent[] = []
  for (const x of Array.isArray(d?.patents) ? d.patents : []) {
    const p = readPatent(x)
    if (p && !patents.some((q) => q.family === p.family)) patents.push(p)
  }
  // The newest row of a year wins; the last four years are kept, oldest first.
  const byYear = new Map<number, LabRow>()
  for (const x of Array.isArray(d?.ledger) ? d.ledger : []) {
    const row = readRow(x)
    if (row) byYear.set(row.year, row)
  }
  const ledger = [...byYear.values()].sort((x, y) => x.year - y.year).slice(-LAB_LIMITS.ledger)
  return {
    v: 1,
    levels: { cost: readLevel(levels?.cost), yield: readLevel(levels?.yield), quality: readLevel(levels?.quality) },
    runs: {
      cost: Math.round(clampN(num(runs?.cost), 0, LAB_LIMITS.runs)),
      yield: Math.round(clampN(num(runs?.yield), 0, LAB_LIMITS.runs)),
      quality: Math.round(clampN(num(runs?.quality), 0, LAB_LIMITS.runs)),
    },
    done: doneOut,
    programs,
    team: (Array.isArray(d?.team) ? d.team : [])
      .map(yearOf)
      .filter((y) => !Number.isNaN(y))
      .sort((x, y) => x - y)
      .slice(0, LAB_LIMITS.team),
    patents: patents.slice(0, LAB_LIMITS.patents),
    filed: names(d?.filed).slice(-LAB_LIMITS.filed),
    due: { grant: dollarsOf(rec(d?.due)?.grant) },
    booked: markOf(d?.booked),
    stepped: markOf(d?.stepped),
    lastGrant: markOf(d?.lastGrant),
    ledger,
  }
}

function freezeDeep<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) freezeDeep(x)
  }
  return v
}

let empty: LabState | null = null

/** What a company with no lab reads as: one shared frozen object (built on first use, not at module load). */
function emptyLab(): LabState {
  return (empty ??= freezeDeep(normalize(undefined)))
}

const cache = new WeakMap<object, LabState>()

/**
 * The company's lab, normalized: shared, frozen and cached by the identity of the stored object (a
 * stored lab is only ever replaced, never changed). An absent or wrong-typed lab reads as an empty one.
 */
export function readLab(b: Pick<BizState, 'lab'>): LabState {
  const raw = b.lab
  if (!raw || typeof raw !== 'object') return emptyLab()
  const hit = cache.get(raw)
  if (hit) return hit
  const st = freezeDeep(normalize(raw))
  cache.set(raw, st)
  return st
}

/** A fresh mutable deep copy of the company's lab, for a writer that will saveLab() it. */
export function draftLab(b: Pick<BizState, 'lab'>): LabState {
  return JSON.parse(JSON.stringify(readLab(b))) as LabState
}

/** Store a lab on the company as a NEW normalized object (the old object keeps reading as it did). */
export function saveLab(b: BizState, st: LabState): void {
  b.lab = normalize(st as unknown as Json) as unknown as Json
}

function rowOf(b: Pick<BizState, 'lab'>, year: number): LabRow | undefined {
  return b.lab ? readLab(b).ledger.find((r) => r.year === year) : undefined
}

/** Credit, grant and royalty booked for a fiscal year (0 for a company with no lab). */
export function labIncomeIn(b: Pick<BizState, 'lab'>, year: number): number {
  const row = rowOf(b, year)
  return row ? row.credit + row.grant + row.royalty : 0
}

/** The research team's pay booked for a fiscal year. */
export function labPayrollIn(b: Pick<BizState, 'lab'>, year: number): number {
  return rowOf(b, year)?.payroll ?? 0
}

/** What the company's patents are worth on its books. */
export function labValue(b: Pick<BizState, 'lab'>): number {
  if (!b.lab) return 0
  return readLab(b).patents.reduce((sum, p) => sum + p.book, 0)
}

/**
 * The lab's share of a statement's other income, for its own lines: credit plus grant, and royalty.
 * `taken` is what other lines already claim; the lab's lines are clipped to what is left, so the lines
 * always add up to the other income.
 */
export function labSplit(b: Pick<BizState, 'lab'>, s: { year: number; otherIncome: number }, taken: number): { grants: number; royalty: number } {
  const row = rowOf(b, s.year)
  if (!row) return { grants: 0, royalty: 0 }
  const room = Number.isFinite(s.otherIncome - taken) ? Math.max(0, Math.round(s.otherIncome - taken)) : 0
  const grants = Math.min(row.credit + row.grant, room)
  return { grants, royalty: Math.min(row.royalty, room - grants) }
}
