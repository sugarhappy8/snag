// The world frontier (R3-F1, C.6): how far the world's research is ahead of the calendar path, in g.world.frontier.
//
// A field (world/frontier-fields.ts) keeps three things: `lead`, how many years the world is ahead (0 to 12, kept as whole
// centi-years: `fold` plus the `d` of its rows), `pub`, the public research other researchers can use (0 to 18 odds points, kept as
// tenths of a point), and the newest rows, the last few pushes with who, when, where and how much. A disclosure is one push. The shard
// is created by the first accepted disclosure, so a save from before R3, and every life that never meets a push, has no `frontier`
// key at all and plays exactly as it did.
//
//   readFrontier(g)         pure. The shard, absent or garbage read as a frozen empty one; nothing is created or written.
//   frontierLead(g, f)      years ahead, 0 to 12, two places.          frontierSpill(g, f)  public research, whole points, 0 to 18.
//   frontierRows(g, f)      the rows, oldest year first.              lastPush(g, f)       the year of the newest push, 0 for none.
//   applyDisclosure(g, d)   the one writer. It checks, in order, bad, history, future, secret and repeat; draws one luck number from
//                           the named stream `frontier`; and replaces the shard root. A refusal writes nothing, not even a world.
//   normalizeFrontier(raw)  the shard's registered reader: total, bounded, and a valid shard comes back as itself.
//   frontierProblems(raw)   for worldProblems: one line for each way a stored shard is wrong, none when it is sound.
//   frontierRoom, pushRow, boundRows   the pieces the yearly step (R3-F2) shares with the writer, so the caps live in one place.
//
// The numbers, and why they are safe:
//   - lead from one disclosure is size x 2.0 years (you) or x 1.5 (a rival), times a luck of 0.8 to 1.2. A field gains at most 2
//     years in a year, in all, and holds at most 12. The room is cut at the writer, and `yg` remembers what the field gained in
//     its newest year, so folding rows away never gives the room back;
//   - spill from one disclosure is 1 + 5 size points (1 to 6) times the shield (open 1, patent 0.5 the default; secret is refused),
//     so it is at most 6 points, and the pool holds at most 18 (the agreed ceiling of the roadmap's probe);
//   - bounded: 6 rows a market and 4 markets a field. An older row folds into `fold`, so the lead is never lost. 20 fields of 24
//     rows are about 3,500 JSON nodes (6% of the world's budget), and a life with a few pushes is under 150;
//   - history is fixed: a disclosure dated 2026 or earlier changes nothing. No foresight: one dated after g.year is refused;
//   - replay-safe: a row is keyed by its year and origin, so a disclosure made twice is stored once (while its row is stored: a row
//     that has folded away, after 6 more in the same market and year, can be pushed again, and the caps above still hold); the luck
//     is a pure function of the family, the year, the field and the origin (outcomeStream), so a reload, a clone and an heir see the
//     same number and a Time Machine jump re-rolls the year it lands in;
//   - written by replacing the shard root (ensureWorld(g).frontier = next), never in place, because the Save track shares each shard
//     root between drafts, frozen. A reader caches by the identity of the stored root (world/state.ts worldShard).
//
// Load order: the shard registers itself when this file loads, and normalizeWorld drops a shard nobody registered. The registration
// hub world/shards.ts imports this file for the processes that read a save without the game. This file imports ./state and never the
// hub, so no cycle forms. It draws no luck but the named stream, and reads no clock. It sits in layer 2.
import { PRESENT_YEAR } from '../history/timeline'
import { hashKey, outcomeStream } from '../kernel/streams'
import type { GameState } from '../types'
import { FRONTIER_CAPS } from './caps'
import { FIELDS, FIELD_IDS, isFieldId, type FieldId } from './frontier-fields'
import { isPlain, sameJson } from './rows'
import { ensureWorld, registerShard, worldShard } from './state'

export type Shield = 'open' | 'patent' | 'secret'

/** One push. y: the year; w: who; m: the market; d: centi-years it added; o: the origin hash (base 36); f: a rival followed it (R3-F2). */
export interface FrontierRow {
  y: number
  w: 'you' | 'rival'
  m: string
  d: number
  o: string
  f?: 1
}

/**
 * One field. fold: centi-years folded out of the rows; pub: tenths of a point of public research; ly: the year of the newest push;
 * rows: newest last; yg: centi-years the field gained in year `ly` (what the year's room is cut by; absent for none).
 */
export interface FieldRec {
  fold: number
  pub: number
  ly: number
  rows: FrontierRow[]
  yg?: number
}

/** The stored shape, g.world.frontier. y: the last year the yearly step ran (0 = never). */
export interface FrontierShard {
  v: 1
  y: number
  f: Partial<Record<FieldId, FieldRec>>
}

export interface Disclosure {
  field: FieldId
  /** The year of the push: after 2026 (history is fixed) and not after g.year (no foresight). */
  year: number
  /** How big a leap, 0 to 1 (outside that it is cut). */
  size: number
  /** What the push came from: a wave id, a project. 1 to 64 characters. It is the key of the row. */
  origin: string
  by: 'you' | 'rival'
  /** A market id or 'world' (the default). */
  market?: string
  /** How open the research is. Default patent. Secret is refused: a secret is not disclosed. */
  shield?: Shield
}

export type DisclosureResult =
  | { applied: true; lead: number; spill: number }
  | { applied: false; why: 'bad' | 'history' | 'future' | 'secret' | 'repeat' }

/** Lead in centi-years, the most a field gains in one year, public research in tenths of a point, and the rows a field keeps. Functions, not constants: a module-level const may not read an import. */
const leadMax = (): number => FRONTIER_CAPS.leadYears * 100
const yearMax = (): number => FRONTIER_CAPS.yearYears * 100
const pubMax = (): number => FRONTIER_CAPS.spillPoints * 10
const rowsMax = (): number => FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField
/** Centi-years of lead a size 1 disclosure adds before luck: 2.0 years for you, 1.5 for a rival. */
const BASE = { you: 200, rival: 150 } as const
/** What a shield lets through of the spill. Secret is refused before it is read. */
const SHIELD: Readonly<Record<Shield, number>> = { open: 1, patent: 0.5, secret: 0 }
/** The first year a push may be dated: history up to PRESENT_YEAR is fixed. */
const FIRST_YEAR = PRESENT_YEAR + 1
const LAST_YEAR = 100_000
/** Rows of a hostile list a reader looks at, and lines frontierProblems gives. */
const SCAN_MAX = 200
const PROBLEMS_MAX = 64

const MARKET = /^[a-z][a-z0-9._-]{0,15}$/
const ORIGIN = /^[a-z0-9-]{1,8}$/

const EMPTY: Readonly<FrontierShard> = Object.freeze<FrontierShard>({ v: 1, y: 0, f: Object.freeze({}) })
const NO_ROWS: readonly FrontierRow[] = Object.freeze([])

const own = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)
const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= FIRST_YEAR && x <= LAST_YEAR

/** A finite number cut to a whole number from lo to hi, or null for anything else. */
function whole(x: unknown, lo: number, hi: number): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  return Math.min(hi, Math.max(lo, Math.trunc(x)))
}

const sumD = (rows: readonly FrontierRow[]): number => {
  let n = 0
  for (const r of rows) n += r.d
  return n
}

/** The key of an origin in a row: its hash in base 36, 1 to 8 characters (a rival's follow adds an 'f'). */
export function originKey(origin: string): string {
  return hashKey(origin).toString(36)
}

/** The luck of one disclosure, in [0, 1): a pure function of the family, the year, the field and the origin key. Draws nothing from g.rng. */
export function gainLuck(g: Pick<GameState, 'lifeId' | 'flags'>, field: FieldId, o: string, year: number): number {
  return outcomeStream(g, 'frontier', year, `${field}|d|${o}`)()
}

// ---------------------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Cuts a field's rows to the caps: oldest year first (a stable sort, so the order the rows came in is kept inside a year), the 4
 * markets whose newest row is newest, and the newest 6 rows of each. What goes is folded into `fold`, so the lead is unchanged
 * (and cut to 12 years). Pure; it returns new arrays and leaves its arguments alone.
 */
export function boundRows(rows: readonly FrontierRow[], fold: number): { rows: FrontierRow[]; fold: number } {
  const ordered = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.y - b.r.y || a.i - b.i)
    .map((x) => x.r)
  const newest = new Map<string, number>()
  ordered.forEach((r, i) => newest.set(r.m, i))
  const markets = new Set([...newest.entries()].sort((a, b) => b[1] - a[1]).slice(0, FRONTIER_CAPS.marketsPerField).map(([m]) => m))
  const count = new Map<string, number>()
  const keep: boolean[] = new Array<boolean>(ordered.length).fill(false)
  let lost = 0
  for (let i = ordered.length - 1; i >= 0; i--) {
    const r = ordered[i]!
    const n = count.get(r.m) ?? 0
    if (markets.has(r.m) && n < FRONTIER_CAPS.rowsPerMarket) {
      keep[i] = true
      count.set(r.m, n + 1)
    } else lost += r.d
  }
  const kept = ordered.filter((_, i) => keep[i])
  return { rows: kept, fold: Math.max(0, Math.min(fold + lost, leadMax() - sumD(kept))) }
}

/** The lead of a field record in centi-years: fold plus its rows, at most 12 years. */
function leadOf(rec: Readonly<FieldRec> | undefined): number {
  return rec === undefined ? 0 : Math.min(leadMax(), rec.fold + sumD(rec.rows))
}

/** Centi-years the field gained in `year`: what its newest year remembers, or the rows of that year when it is an older one. */
function gainedIn(rec: Readonly<FieldRec> | undefined, year: number): number {
  if (rec === undefined) return 0
  let rows = 0
  for (const r of rec.rows) if (r.y === year) rows += r.d
  return year === rec.ly ? Math.max(rec.yg ?? 0, rows) : rows
}

/**
 * The centi-years a push dated `year` may still add to a field: the 2 years a year is worth, less what the field gained in that year,
 * and the 12 years in all, less its lead. 0 for a field that has no lead (the AI capabilities).
 */
export function frontierRoom(rec: Readonly<FieldRec> | undefined, field: FieldId, year: number): number {
  if (!isFieldId(field) || !FIELDS[field].lead) return 0
  return Math.max(0, Math.min(yearMax() - gainedIn(rec, year), leadMax() - leadOf(rec)))
}

/**
 * The record after one more push: the row (its `d` cut to the room, and to 0 for a field with no lead), `spill` tenths added to the
 * pool (up to 18 points), the year's gain, `ly`, and the rows cut to the caps with the excess folded. Pure: a new record, the old one
 * untouched. The writer and the yearly step both go through it.
 */
export function pushRow(rec: Readonly<FieldRec> | undefined, field: FieldId, row: FrontierRow, spill: number): FieldRec {
  const base = rec ?? { fold: 0, pub: 0, ly: 0, rows: [] as FrontierRow[] }
  const d = Math.min(Math.max(0, Math.trunc(row.d)), frontierRoom(rec, field, row.y))
  const added: FrontierRow = d === row.d ? row : { ...row, d }
  const bounded = boundRows([...base.rows, added], base.fold)
  const out: FieldRec = {
    fold: bounded.fold,
    pub: Math.min(pubMax(), base.pub + Math.max(0, Math.trunc(spill))),
    ly: Math.max(base.ly, row.y),
    rows: bounded.rows,
  }
  const yg = row.y >= base.ly ? gainedIn(rec, row.y) + d : (base.yg ?? 0)
  if (yg > 0) out.yg = Math.min(yearMax(), yg)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------------------------------------

/** One row, or null: the row is rebuilt from valid parts, with its keys in order. Never throws. */
function cleanRow(raw: unknown, lead: boolean): FrontierRow | null {
  if (!isPlain(raw)) return null
  const { y, w, m, o } = raw
  if (!isYear(y) || (w !== 'you' && w !== 'rival')) return null
  if (typeof m !== 'string' || !MARKET.test(m) || typeof o !== 'string' || !ORIGIN.test(o)) return null
  const d = whole(raw.d, 0, leadMax())
  if (d === null) return null
  const out: FrontierRow = { y, w, m, d: lead ? d : 0, o }
  if (raw.f === 1) out.f = 1
  return out
}

/** One field record, or null for one that is not a record or has nothing in it. */
function cleanRec(raw: unknown, field: FieldId): FieldRec | null {
  if (!isPlain(raw)) return null
  const lead = FIELDS[field].lead
  const list: unknown = raw.rows
  const rows: FrontierRow[] = []
  const seen = new Set<string>()
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length && i < SCAN_MAX; i++) {
      const row = cleanRow(list[i], lead)
      if (row === null || seen.has(`${row.y}|${row.o}`)) continue
      seen.add(`${row.y}|${row.o}`)
      rows.push(row)
    }
  }
  const bounded = boundRows(rows, lead ? (whole(raw.fold, 0, leadMax()) ?? 0) : 0)
  // The 12 years in all: the oldest rows keep theirs, the newest are cut.
  let room = leadMax() - bounded.fold
  const kept = bounded.rows.map((r) => {
    const d = Math.min(r.d, Math.max(0, room))
    room -= d
    return d === r.d ? r : { ...r, d }
  })
  const pub = whole(raw.pub, 0, pubMax()) ?? 0
  if (kept.length === 0 && bounded.fold === 0 && pub === 0) return null
  const out: FieldRec = {
    fold: bounded.fold,
    pub,
    ly: Math.max(isYear(raw.ly) ? raw.ly : 0, kept.length > 0 ? kept[kept.length - 1]!.y : 0),
    rows: kept,
  }
  const yg = lead ? whole(raw.yg, 0, yearMax()) : null
  if (yg !== null) out.yg = yg
  return out
}

/** Whether `raw` is what `next` says, key order aside. It walks `next` (bounded), never `raw`, so a hostile `raw` cannot make it deep. */
function same(raw: unknown, next: unknown): boolean {
  if (next === null || typeof next !== 'object') return Object.is(raw, next)
  if (Array.isArray(next)) {
    if (!Array.isArray(raw) || raw.length !== next.length) return false
    for (let i = 0; i < next.length; i++) if (!same(raw[i], next[i])) return false
    return true
  }
  if (!isPlain(raw)) return false
  const keys = Object.keys(next)
  if (Object.keys(raw).length !== keys.length) return false
  for (const k of keys) if (!own(raw, k) || !same(raw[k], (next as Record<string, unknown>)[k])) return false
  return true
}

/**
 * Any value into a valid shard: only the known fields, in the table's order, each with whole numbers inside their ranges and only
 * valid rows (one for a year and origin, oldest year first, the caps of 6 and 4 and the 12 years applied, an AI capability with no
 * lead), and an empty field dropped. It never throws. A shard that is already valid comes back as itself, so a read costs nothing
 * and keeps its identity (worldShard caches by it); anything that is not a v1 shard comes back as the one frozen empty shard.
 */
export function normalizeFrontier(raw: unknown): FrontierShard {
  try {
    if (!isPlain(raw) || raw.v !== 1) return EMPTY as FrontierShard
    const src = isPlain(raw.f) ? raw.f : {}
    const f: Partial<Record<FieldId, FieldRec>> = {}
    for (const id of FIELD_IDS) {
      if (!own(src, id)) continue
      const rec = cleanRec(src[id], id)
      if (rec !== null) f[id] = rec
    }
    const next: FrontierShard = { v: 1, y: isYear(raw.y) ? raw.y : 0, f }
    return same(raw, next) ? (raw as unknown as FrontierShard) : next
  } catch {
    return EMPTY as FrontierShard
  }
}

registerShard('frontier', { normalize: normalizeFrontier })

/** The shard. Pure: an absent shard reads as a frozen empty one and nothing is created. The shard is the stored one, so treat it as read-only. */
export function readFrontier(g: Pick<GameState, 'world'>): Readonly<FrontierShard> {
  return worldShard<FrontierShard>(g, 'frontier') ?? EMPTY
}

const recOf = (g: Pick<GameState, 'world'>, field: FieldId): Readonly<FieldRec> | undefined => (isFieldId(field) ? readFrontier(g).f[field] : undefined)

/** Years the world is ahead of the calendar path in this field, 0 to 12, two places. 0 for a field that is not one or has no lead. */
export function frontierLead(g: Pick<GameState, 'world'>, field: FieldId): number {
  return isFieldId(field) && FIELDS[field].lead ? leadOf(recOf(g, field)) / 100 : 0
}

/** Public research in this field, in whole odds points, 0 to 18. */
export function frontierSpill(g: Pick<GameState, 'world'>, field: FieldId): number {
  return Math.round((recOf(g, field)?.pub ?? 0) / 10)
}

/** The rows of a field, oldest year first. The array is the stored one, so treat it as read-only. */
export function frontierRows(g: Pick<GameState, 'world'>, field: FieldId): readonly FrontierRow[] {
  return recOf(g, field)?.rows ?? NO_ROWS
}

/** The year of the newest push in this field, 0 for none. */
export function lastPush(g: Pick<GameState, 'world'>, field: FieldId): number {
  return recOf(g, field)?.ly ?? 0
}

// ---------------------------------------------------------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------------------------------------------------------

const BAD: DisclosureResult = { applied: false, why: 'bad' }

/** Whether a disclosure has the right shape, and the shield it means. */
function shieldOf(d: Disclosure): Shield | null {
  if (!isPlain(d)) return null
  if (!isFieldId(d.field) || typeof d.size !== 'number' || !Number.isFinite(d.size)) return null
  if (typeof d.origin !== 'string' || d.origin.length < 1 || d.origin.length > 64) return null
  if (d.market !== undefined && (typeof d.market !== 'string' || !MARKET.test(d.market))) return null
  if (typeof d.year !== 'number' || !Number.isInteger(d.year) || (d.by !== 'you' && d.by !== 'rival')) return null
  const shield = d.shield ?? 'patent'
  return typeof shield === 'string' && own(SHIELD, shield) ? shield : null
}

/**
 * The one writer: one push to the frontier. It checks, in this order, bad (the shape), history (a year up to 2026), future (a year
 * after g.year), secret and repeat (a row with this year and origin is there already); a refusal writes nothing, not even a world.
 * Otherwise it draws one luck number, adds the row, its lead (cut to the room) and its spill (to the pool), and replaces the shard
 * root. It reports the centi-years of lead and the tenths of a point of spill it really added.
 */
export function applyDisclosure(g: GameState, d: Disclosure): DisclosureResult {
  const shield = shieldOf(d)
  if (shield === null) return BAD
  if (d.year <= PRESENT_YEAR) return { applied: false, why: 'history' }
  if (!(d.year <= g.year)) return { applied: false, why: 'future' }
  if (shield === 'secret') return { applied: false, why: 'secret' }
  const shard = readFrontier(g)
  const rec = shard.f[d.field]
  const o = originKey(d.origin)
  if (rec !== undefined && rec.rows.some((r) => r.y === d.year && r.o === o)) return { applied: false, why: 'repeat' }

  const size = Math.min(1, Math.max(0, d.size))
  const raw = Math.round(BASE[d.by] * size * (0.8 + 0.4 * gainLuck(g, d.field, o, d.year)))
  const gain = Math.min(raw, frontierRoom(rec, d.field, d.year))
  const spill = Math.round(10 * (1 + 5 * size) * SHIELD[shield])
  const row: FrontierRow = { y: d.year, w: d.by, m: d.market ?? 'world', d: gain, o }
  const nextRec = pushRow(rec, d.field, row, spill)

  const f: Partial<Record<FieldId, FieldRec>> = {}
  for (const id of FIELD_IDS) {
    const r = id === d.field ? nextRec : shard.f[id]
    if (r !== undefined) f[id] = r
  }
  const next: FrontierShard = { v: 1, y: shard.y, f }
  if (!sameJson(next, shard)) ensureWorld(g).frontier = next
  return { applied: true, lead: gain, spill: nextRec.pub - (rec?.pub ?? 0) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------------------------------------------------------

const show = (x: unknown): string => (typeof x === 'number' ? String(x) : typeof x === 'string' ? JSON.stringify(x.slice(0, 16)) : typeof x)
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi

/** Why a stored row is wrong, or null. */
function rowProblem(r: unknown): string | null {
  if (!isPlain(r)) return 'is not a row'
  if (typeof r.y === 'number' && Number.isInteger(r.y) && r.y < FIRST_YEAR) return `is from ${r.y}, in the fixed past (before ${FIRST_YEAR})`
  if (!isYear(r.y) || (r.w !== 'you' && r.w !== 'rival') || !isInt(r.d, 0, leadMax())) return 'is not a valid row'
  if (typeof r.m !== 'string' || !MARKET.test(r.m) || typeof r.o !== 'string' || !ORIGIN.test(r.o) || (r.f !== undefined && r.f !== 1)) return 'is not a valid row'
  return null
}

/**
 * Every way a stored frontier shard is wrong, one line each ("<field>: <what>"), or none for sound. It reads the shard raw, as stored,
 * because the reader would repair what this has to name. Bounded: it looks at 200 rows of a field and gives 64 lines at most.
 * Pure; it never throws. An absent shard (undefined) is sound.
 */
export function frontierProblems(raw: unknown): string[] {
  const out: string[] = []
  const add = (line: string): void => {
    if (out.length < PROBLEMS_MAX) out.push(line)
  }
  try {
    if (raw === undefined) return out
    if (!isPlain(raw) || raw.v !== 1) return ['not a v1 shard']
    if (raw.y !== 0 && !isYear(raw.y)) add(`y ${show(raw.y)} is not a year`)
    if (!isPlain(raw.f)) return [...out, 'f is not a record']
    const keys = Object.keys(raw.f)
    if (keys.length > FRONTIER_CAPS.fields) add(`${keys.length} fields, over the cap of ${FRONTIER_CAPS.fields}`)
    for (const key of keys.slice(0, 64)) {
      if (!isFieldId(key)) add(`unknown field ${JSON.stringify(key.slice(0, 16))}`)
      else recProblems(key, raw.f[key], add)
    }
  } catch {
    add('could not be read')
  }
  return out
}

function recProblems(field: FieldId, r: unknown, add: (line: string) => void): void {
  if (!isPlain(r)) return add(`${field}: not a record`)
  if (!isInt(r.fold, 0, leadMax())) add(`${field}: fold ${show(r.fold)} is not a whole number from 0 to ${leadMax()}`)
  if (!isInt(r.pub, 0, pubMax())) add(typeof r.pub === 'number' && r.pub > pubMax() ? `${field}: pub ${r.pub} is over the cap of ${pubMax()}` : `${field}: pub ${show(r.pub)} is not a whole number from 0 to ${pubMax()}`)
  if (r.ly !== 0 && !isYear(r.ly)) add(`${field}: ly ${show(r.ly)} is not a year`)
  if (r.yg !== undefined && !isInt(r.yg, 0, yearMax())) add(`${field}: yg ${show(r.yg)} is not a whole number from 0 to ${yearMax()}`)
  if (!Array.isArray(r.rows)) return add(`${field}: rows is not a list`)
  const rows: unknown[] = r.rows
  if (rows.length > rowsMax()) add(`${field}: ${rows.length} rows, over the cap of ${rowsMax()}`)
  const perMarket = new Map<string, number>()
  const seen = new Set<string>()
  let total = typeof r.fold === 'number' && Number.isFinite(r.fold) ? r.fold : 0
  let last = 0
  let unsorted = false
  for (let i = 0; i < rows.length && i < SCAN_MAX; i++) {
    const row = rows[i]
    const why = rowProblem(row)
    if (why !== null) {
      add(`${field}: row ${i} ${why}`)
      continue
    }
    const x = row as FrontierRow
    perMarket.set(x.m, (perMarket.get(x.m) ?? 0) + 1)
    if (seen.has(`${x.y}|${x.o}`)) add(`${field}: row ${i} repeats origin ${x.o} in ${x.y}`)
    seen.add(`${x.y}|${x.o}`)
    if (x.y < last) unsorted = true
    last = x.y
    total += x.d
  }
  if (unsorted) add(`${field}: rows are not in year order`)
  for (const [m, n] of perMarket) if (n > FRONTIER_CAPS.rowsPerMarket) add(`${field}: market ${m} has ${n} rows, over the cap of ${FRONTIER_CAPS.rowsPerMarket}`)
  if (perMarket.size > FRONTIER_CAPS.marketsPerField) add(`${field}: ${perMarket.size} markets, over the cap of ${FRONTIER_CAPS.marketsPerField}`)
  if (total > leadMax()) add(`${field}: lead ${(total / 100).toFixed(2)} years is over the cap of ${FRONTIER_CAPS.leadYears}`)
  if (!FIELDS[field].lead && total > 0) add(`${field}: lead years on a field that has no lead`)
}
