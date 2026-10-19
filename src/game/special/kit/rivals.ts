// Career kit, rivals: peers are derived, never stored. A roster of named fictional rivals is built per
// career, country and 5-year cohort from the family seed (the lifeId without its generation), so an
// heir meets the same names with an empty record. Strength follows an arc, form is a hidden but
// deterministic yearly integer, and the memory rows (who you met, beat and lost to) live in the
// career record. Nothing here touches g.rng except `rollScore`, which actions and settle bodies call.
import { seeded, type SRng } from '../../assets'
import { allBrands } from '../../data/brands'
import { nameFitsYear } from '../../history/events-people'
import { randInt } from '../../rng'
import { outcomeTag } from '../../timeMachine'
import type { GameState, Gender } from '../../types'
import { COUNTRIES, namePoolOf } from '../../world'
import { KIT_LIMITS, int, txt, type MemoryRow } from './state'

export type RivalArc = 'rising' | 'steady' | 'comet' | 'late' // odds .30 .30 .20 .20

export interface RivalSpec {
  career: string
  /** Career vocabulary: genres, agencies, programs, labels. */
  edges: readonly string[]
  /** Wanted active rivals, 0-40. 0 (or less) means no such field yet: the era and country gate. */
  field: (year: number, country: string) => number
  debutAge?: readonly [number, number]
  length?: readonly [number, number]
  peak?: readonly [number, number]
  /** Chance a rival's name comes from another country's pool. */
  foreignShare?: number
  /** Read-time multiplier on strength, clamped 0.5-1.3. */
  depth?: (g: GameState, year: number, country: string) => number
}

export interface CareerRival {
  id: string
  name: string
  gender: Gender
  country: string
  born: number
  debut: number
  exit: number
  peak: number
  arc: RivalArc
  edge: string
}

export interface Standing {
  rank: number
  of: number
  me: number
  top: { id: string; name: string; score: number }[]
  beat: string[]
  lostTo: string | null
}

const COHORT = 5
/** The first cohort a roster can start from, and the last year it can reach. */
const FIRST_COHORT = 1850
const LAST_YEAR = 2400
const VISIBLE = 24
const CACHE_MAX = 200
const YEAR_MEMO = 64
const NAME_TRIES = 8
const NAME_MAX = 40
const KEY_MAX = 60
/** Where on its career [0, 1] each arc peaks. */
const ARC_PEAK: Record<RivalArc, number> = { rising: 0.85, steady: 0.5, comet: 0.2, late: 0.7 }

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** (lifeId || 'life') without its generation suffix: heirs share it. */
export function familySeed(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

// ---------------------------------------------------------------------------
// Roster

interface Plan {
  career: string
  edges: readonly string[]
  debutAge: readonly [number, number]
  length: readonly [number, number]
  peak: readonly [number, number]
  foreign: number
  meanLength: number
}

interface Build {
  /** The last cohort start built so far. */
  upTo: number
  rivals: CareerRival[]
  used: Set<string>
  byYear: Map<number, CareerRival[]>
}

interface SpecCache {
  plan: Plan
  builds: Map<string, Build>
}

// Keyed by the spec object, so two specs that share a career id never share a roster.
const CACHES = new WeakMap<RivalSpec, SpecCache>()
let brandNames: Set<string> | null = null

function range(v: readonly [number, number] | undefined, d: readonly [number, number], lo: number, hi: number): readonly [number, number] {
  const a = int(v?.[0], d[0], lo, hi)
  const b = int(v?.[1], d[1], lo, hi)
  return a <= b ? [a, b] : [b, a]
}

function planOf(spec: RivalSpec): Plan {
  const length = range(spec.length, [8, 30], 1, 80)
  const foreign = typeof spec.foreignShare === 'number' && Number.isFinite(spec.foreignShare) ? clamp(spec.foreignShare, 0, 1) : 0.15
  return {
    career: txt(spec.career, KEY_MAX, 'career'),
    edges: spec.edges,
    debutAge: range(spec.debutAge, [18, 30], 10, 60),
    length,
    peak: range(spec.peak, [35, 95], 1, 100),
    foreign,
    meanLength: (length[0] + length[1]) / 2,
  }
}

function cacheOf(spec: RivalSpec): SpecCache {
  let c = CACHES.get(spec)
  if (!c) {
    c = { plan: planOf(spec), builds: new Map() }
    CACHES.set(spec, c)
  }
  return c
}

function wanted(spec: RivalSpec, year: number, country: string): number {
  const n = spec.field(year, country)
  return typeof n === 'number' && Number.isFinite(n) ? clamp(n, 0, 40) : 0
}

function nameKey(name: string): string {
  return name.toLowerCase()
}

function isBrand(name: string): boolean {
  brandNames ??= new Set(allBrands().map((b) => nameKey(b.name)))
  return brandNames.has(nameKey(name))
}

/** A person's name from the home pool that fits the birth year and is neither used nor a brand. */
function nameFor(r: SRng, home: string, gender: Gender, born: number, used: ReadonlySet<string>): string {
  const pool = namePoolOf(home)
  const all = gender === 'male' ? pool.male : pool.female
  const fitting = all.filter((f) => nameFitsYear(f, born))
  const firsts = fitting.length ? fitting : all
  const lasts = pool.last
  if (!firsts.length || !lasts.length) return gender === 'male' ? 'Alex Doe' : 'Sam Doe'
  const free = (n: string): boolean => !used.has(nameKey(n)) && !isBrand(n)
  let name = ''
  for (let i = 0; i < NAME_TRIES; i++) {
    name = txt(`${r.pick(firsts)} ${r.pick(lasts)}`, NAME_MAX)
    if (free(name)) return name
  }
  // an unlucky run: walk the pool from a seeded start until one is free
  const f0 = r.int(0, firsts.length - 1)
  const l0 = r.int(0, lasts.length - 1)
  for (let i = 0; i < firsts.length; i++) {
    for (let j = 0; j < lasts.length; j++) {
      const n = txt(`${firsts[(f0 + i) % firsts.length]} ${lasts[(l0 + j) % lasts.length]}`, NAME_MAX)
      if (free(n)) return n
    }
  }
  return name
}

function addCohort(spec: RivalSpec, p: Plan, family: string, country: string, d: number, b: Build): void {
  const f = wanted(spec, d + 2, country)
  if (f <= 0) return
  const sr = seeded(`${family}|size|${p.career}|${country}|${d}`)
  const mean = Math.min(60, (COHORT * f) / p.meanLength)
  const n = Math.floor(mean) + (sr.next() < mean - Math.floor(mean) ? 1 : 0)
  const others = COUNTRIES.map((c) => c.id).filter((id) => id !== country)
  for (let i = 0; i < n; i++) {
    const r = seeded(`${family}|rival|${p.career}|${country}|${d}|${i}`)
    const debut = d + r.int(0, COHORT - 1)
    const born = debut - r.int(p.debutAge[0], p.debutAge[1])
    const exit = debut + r.int(p.length[0], p.length[1])
    const peak = r.int(p.peak[0], p.peak[1])
    const roll = r.next()
    const arc: RivalArc = roll < 0.3 ? 'rising' : roll < 0.6 ? 'steady' : roll < 0.8 ? 'comet' : 'late'
    const edge = p.edges.length ? txt(r.pick(p.edges), NAME_MAX) : ''
    const abroad = r.chance(p.foreign)
    const away = others.length ? r.pick(others) : country
    const home = abroad ? away : country
    const gender: Gender = r.chance(0.5) ? 'male' : 'female'
    const name = nameFor(r, home, gender, born, b.used)
    b.used.add(nameKey(name))
    b.rivals.push(Object.freeze({ id: `${p.career}.${country}.${d}.${i}`, name, gender, country: home, born, debut, exit, peak, arc, edge }))
  }
}

/**
 * Named rivals active in `year` (default this year) in `country` (default the player's), derived from
 * the family seed. Empty while `spec.field` gives 0. Pure; never draws g.rng.
 */
export function rosterAt(g: GameState, spec: RivalSpec, year: number = g.year, country: string = g.character.countryId): CareerRival[] {
  if (!Number.isFinite(year) || year < FIRST_COHORT || year > LAST_YEAR) return []
  const y = Math.floor(year)
  if (wanted(spec, y, country) <= 0) return []
  const c = cacheOf(spec)
  const family = familySeed(g)
  const key = `${family}|${country}`
  let b = c.builds.get(key)
  if (!b) {
    b = { upTo: FIRST_COHORT - COHORT, rivals: [], used: new Set(), byYear: new Map() }
    c.builds.set(key, b)
    if (c.builds.size > CACHE_MAX) c.builds.delete(c.builds.keys().next().value as string)
  }
  const last = Math.floor(y / COHORT) * COHORT
  if (b.upTo < last) {
    // later cohorts only append, so a rival keeps its name and every earlier year keeps its roster
    for (let d = b.upTo + COHORT; d <= last; d += COHORT) addCohort(spec, c.plan, family, country, d, b)
    b.upTo = last
    b.byYear.clear()
  }
  let active = b.byYear.get(y)
  if (!active) {
    active = b.rivals.filter((r) => r.debut <= y && y < r.exit)
    if (b.byYear.size >= YEAR_MEMO) b.byYear.delete(b.byYear.keys().next().value as number)
    b.byYear.set(y, active)
  }
  return active.slice()
}

/** 0 outside [debut, exit); otherwise 35% to 100% of peak along the rival's arc. */
export function strengthAt(r: CareerRival, year: number): number {
  if (!(year >= r.debut && year < r.exit)) return 0
  const t = (year - r.debut) / (r.exit - r.debut)
  const tp = ARC_PEAK[r.arc]
  const off = (t - tp) / Math.max(tp, 1 - tp)
  return r.peak * (0.35 + 0.65 * (1 - off * off))
}

/** Hidden, deterministic yearly form, an integer -8..8. A Time Machine jump rerolls it. */
export function formOf(g: GameState, spec: RivalSpec, r: CareerRival, year: number = g.year): number {
  return seeded(`${familySeed(g)}|form|${txt(spec.career, KEY_MAX, 'career')}|${r.id}|${year}${outcomeTag(g, year)}`).int(-8, 8)
}

// ---------------------------------------------------------------------------
// Ranking

function scoredField(g: GameState, spec: RivalSpec, memory: readonly MemoryRow[], year: number): { rival: CareerRival; score: number }[] {
  const country = g.character.countryId
  const roster = rosterAt(g, spec, year, country)
  if (!roster.length) return []
  const d = spec.depth?.(g, year, country)
  const depth = clamp(typeof d === 'number' && Number.isFinite(d) ? d : 1, 0.5, 1.3)
  const rows = new Map(memory.map((m) => [m.id, m]))
  return roster
    .map((rival) => ({
      rival,
      score: Math.round(clamp(strengthAt(rival, year) * depth + formOf(g, spec, rival, year) + grudgeBonus(rows.get(rival.id)), 0, 100)),
    }))
    .sort((a, b) => b.score - a.score || (a.rival.id < b.rival.id ? -1 : a.rival.id > b.rival.id ? 1 : 0))
}

/** The top 24 active rivals by score (strength x depth + form + grudge), ties by id. */
export function activeField(g: GameState, spec: RivalSpec, memory: readonly MemoryRow[] = [], year: number = g.year): { rival: CareerRival; score: number }[] {
  return scoredField(g, spec, memory, year).slice(0, VISIBLE)
}

/** Where `me` ranks against this year's whole field. An empty field is rank 1 of 1. Pure. */
export function standingOf(g: GameState, spec: RivalSpec, me: number, memory: readonly MemoryRow[] = []): Standing {
  const m = Number.isFinite(me) ? me : 0
  const all = scoredField(g, spec, memory, g.year)
  const above = all.filter((x) => x.score > m).length
  const top = all.slice(0, 5).map((x) => ({ id: x.rival.id, name: x.rival.name, score: x.score }))
  return {
    rank: 1 + above,
    of: all.length + 1,
    me: m,
    top,
    beat: all.slice(above, above + 5).map((x) => x.rival.id),
    lostTo: top.length && top[0].score > m ? top[0].id : null,
  }
}

/** clamp((me - rival + spread) / (2 x spread), 0, 1). Pure: the odds a hint prints. */
export function beatOdds(me: number, rival: number, spread = 10): number {
  if (!Number.isFinite(me) || !Number.isFinite(rival)) return 0
  if (!(spread > 0)) return me > rival ? 1 : me < rival ? 0 : 0.5
  return clamp((me - rival + spread) / (2 * spread), 0, 1)
}

/** base + randInt(-10, 10). Draws g.rng: actions and settle bodies only. */
export function rollScore(g: GameState, base: number): number {
  return base + randInt(g, -10, 10)
}

// ---------------------------------------------------------------------------
// Memory

const COUNT_MAX = 1e6

/** min(9, 3 x grudge). */
export function grudgeBonus(row: MemoryRow | undefined): number {
  const g = row?.grudge
  return typeof g === 'number' && Number.isFinite(g) ? Math.min(9, 3 * Math.max(0, g)) : 0
}

/** Keeps 16 rows, evicting the lowest met + 2 x grudge first, then the oldest. */
function trim(rows: MemoryRow[]): MemoryRow[] {
  const over = rows.length - KIT_LIMITS.memory
  if (over <= 0) return rows
  const order = rows
    .map((r, i) => ({ i, value: r.met + 2 * r.grudge, last: r.last }))
    .sort((a, b) => a.value - b.value || a.last - b.last || a.i - b.i)
  const drop = new Set(order.slice(0, over).map((o) => o.i))
  return rows.filter((_, i) => !drop.has(i))
}

function blank(id: string, name: string, year: number): MemoryRow {
  return { id, name: txt(name, NAME_MAX), met: 0, won: 0, lost: 0, grudge: 0, last: year }
}

function copy(rows: readonly MemoryRow[]): MemoryRow[] {
  return rows.map((r) => ({ ...r }))
}

/**
 * Fold one ranked contest into the memory: the top five rivals are met, the one you lost to is a loss,
 * rivals you beat are wins. A beaten rival with no row and not in the top five has no name here, so it
 * is skipped (`noteRival` records one named contest). Pure.
 */
export function remember(rows: readonly MemoryRow[], st: Standing, year: number): MemoryRow[] {
  const y = int(year, 0, 0, 9999)
  const out = copy(rows)
  const byId = new Map(out.map((r) => [r.id, r]))
  for (const t of st.top) {
    const id = txt(t.id, KEY_MAX)
    if (!id) continue
    let r = byId.get(id)
    if (!r) {
      r = blank(id, t.name, y)
      out.push(r)
      byId.set(id, r)
    }
    r.met = Math.min(COUNT_MAX, r.met + 1)
    r.last = y
    if (id === st.lostTo) r.lost = Math.min(COUNT_MAX, r.lost + 1)
  }
  for (const id of st.beat) {
    const r = byId.get(id)
    if (!r) continue
    r.won = Math.min(COUNT_MAX, r.won + 1)
    r.last = y
  }
  return trim(out)
}

/** grudge -1 for every rival not met since last year. Pure. */
export function cool(rows: readonly MemoryRow[], year: number): MemoryRow[] {
  return rows.map((r) => (r.last < year - 1 ? { ...r, grudge: Math.max(0, r.grudge - 1) } : { ...r }))
}

/** One named contest: finds or creates the row, adds the deltas (grudge clamped 0-100), same cap as `remember`. Pure. */
export function noteRival(
  rows: readonly MemoryRow[],
  rival: { id: string; name: string },
  year: number,
  d: { met?: number; won?: number; lost?: number; grudge?: number },
): MemoryRow[] {
  const id = txt(rival.id, KEY_MAX)
  if (!id) return copy(rows)
  const y = int(year, 0, 0, 9999)
  const out = copy(rows)
  let r = out.find((x) => x.id === id)
  if (!r) {
    r = blank(id, rival.name, y)
    out.push(r)
  }
  const delta = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  r.met = int(r.met + delta(d.met), 0, 0, COUNT_MAX)
  r.won = int(r.won + delta(d.won), 0, 0, COUNT_MAX)
  r.lost = int(r.lost + delta(d.lost), 0, 0, COUNT_MAX)
  r.grudge = int(r.grudge + delta(d.grudge), 0, 0, 100)
  r.last = y
  return trim(out)
}
