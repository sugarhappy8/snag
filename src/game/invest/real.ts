// Real listed companies for the investments engine. The registry (data/brands-stocks.ts, category
// 'stock') names the companies of each country's exchange: segment = the engine's sector id,
// hq = the exchange's home country, founded = the first year it traded under its lineage's name on
// that exchange (its listing year), ended = the last year it traded (a real merger, takeover or
// documented bankruptcy; never later than PRESENT_YEAR - 1), data = { exchange, aka, fate, arc, size,
// label, emoji }.
//
// This module is pure and RNG-free. It turns the registry into a "plan": for each listing slot of
// an exchange, the ordered queue of real companies that occupy it over the centuries. A slot with
// no real company in a given year holds a fictional small cap (invest/engine.ts fills those), and
// a fictional filler makes way (is "bought out") in the year the next real company lists. Real
// companies are never bankrupted, scandalised or bought out at random: they end only in the year
// the registry says they did, and none ends after PRESENT_YEAR - 1.
import { allBrands, brandsInCategory, type Brand } from '../data/brands'
import { PRESENT_YEAR } from '../history/timeline'
import type { Json } from '../types'

/** Generations at or above this are real companies: gen = REAL_GEN + index in the slot queue. */
export const REAL_GEN = 100_000
/** Fictional fillers after the k-th real company of a slot start at gen 100 * k (k = 0: gen 0). */
export const FILLER_STEP = 100

export type EndFate = 'acquired' | 'bankrupt'
export type SizeClass = 'mega' | 'large' | 'mid'

export interface RealCo {
  brand: Brand
  id: string
  /** The name today. */
  name: string
  /** SectorId of the engine (validated by the engine). */
  sector: string
  /** Listing year (first year it traded). */
  start: number
  /** Last year it traded, or null while it still trades. */
  end: number | null
  fame: number
  fate: EndFate
  /** Change on the last quote paid to holders when `fate` is 'acquired': a deterministic premium of 0.12-0.38, or the recorded payout of a rescue deal (negative). */
  premium: number
  /** Names in order, each valid from its year; the last is the current name. Empty = never renamed. */
  names: { from: number; name: string }[]
  /** Coarse directional excess return per year by era: [fromYear, toYear, excess]. */
  arc: [number, number, number][]
  /** Rough size class by era: [fromYear, class]. */
  size: [number, SizeClass][]
  label?: string
  emoji?: string
  /** Dividend yield override (growth companies pay little or nothing). */
  dy?: number
  exchange: string
  blurb: string
}

function isRec(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function finite(v: Json | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Parse Brand.data.aka: [{ from, name }] (oldest first). Bad entries are ignored. */
export function parseAka(v: Json | undefined): { from: number; name: string }[] {
  if (!Array.isArray(v)) return []
  const out: { from: number; name: string }[] = []
  for (const e of v) if (isRec(e) && finite(e.from) && typeof e.name === 'string' && e.name.trim()) out.push({ from: Math.round(e.from), name: e.name })
  return out.sort((a, b) => a.from - b.from)
}

function parseArc(v: Json | undefined): [number, number, number][] {
  if (!Array.isArray(v)) return []
  const out: [number, number, number][] = []
  for (const e of v) if (Array.isArray(e) && finite(e[0]) && finite(e[1]) && finite(e[2]) && e[1] >= e[0]) out.push([Math.round(e[0]), Math.round(e[1]), Math.max(-0.15, Math.min(0.15, e[2]))])
  return out
}

function parseSize(v: Json | undefined): [number, SizeClass][] {
  if (!Array.isArray(v)) return []
  const out: [number, SizeClass][] = []
  for (const e of v) if (Array.isArray(e) && finite(e[0]) && (e[1] === 'mega' || e[1] === 'large' || e[1] === 'mid')) out.push([Math.round(e[0]), e[1]])
  return out.sort((a, b) => a[0] - b[0])
}

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

function toCo(b: Brand): RealCo {
  const d = b.data ?? {}
  const names = parseAka(d.aka)
  const end = b.ended !== undefined ? Math.min(b.ended, PRESENT_YEAR - 1) : null
  return {
    brand: b,
    id: b.id,
    name: b.name,
    sector: b.segment ?? 'industrials',
    start: b.founded,
    end,
    fame: b.fame ?? 5,
    fate: d.fate === 'bankrupt' ? 'bankrupt' : 'acquired',
    premium: finite(d.payout) ? Math.max(-0.9, Math.min(1, d.payout)) : Math.round((0.12 + 0.26 * hash01(b.id)) * 1000) / 1000,
    names,
    arc: parseArc(d.arc),
    size: parseSize(d.size),
    label: typeof d.label === 'string' ? d.label : undefined,
    emoji: typeof d.emoji === 'string' ? d.emoji : undefined,
    dy: finite(d.dy) ? Math.max(0, Math.min(0.1, d.dy)) : undefined,
    exchange: typeof d.exchange === 'string' ? d.exchange : '',
    blurb: b.blurb ?? '',
  }
}

let byHome: Map<string, RealCo[]> | null = null
let nameSet: Set<string> | null = null

function build(): Map<string, RealCo[]> {
  if (byHome) return byHome
  const map = new Map<string, RealCo[]>()
  for (const b of brandsInCategory('stock')) {
    if (!b.hq) continue
    const list = map.get(b.hq) ?? []
    list.push(toCo(b))
    map.set(b.hq, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start || b.fame - a.fame || a.id.localeCompare(b.id))
  byHome = map
  return map
}

/** Every real company of an exchange's home country, oldest listing first. */
export function realRoster(home: string): readonly RealCo[] {
  return build().get(home) ?? []
}

/** Every registered stock, all countries (data tools and tests). */
export function allRealCos(): RealCo[] {
  return [...build().values()].flat()
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** True when `name` is (or was) the name of a registered real brand (a stock, or any other brand): made-up companies must never take one. */
export function isRealName(name: string): boolean {
  if (!nameSet) {
    nameSet = new Set<string>()
    for (const co of allRealCos()) {
      nameSet.add(norm(co.name))
      for (const n of co.names) nameSet.add(norm(n.name))
    }
    for (const b of allBrands()) {
      nameSet.add(norm(b.name))
      const aka = b.data?.aka
      if (Array.isArray(aka)) for (const e of aka) if (typeof e === 'object' && e !== null && !Array.isArray(e) && typeof e.name === 'string') nameSet.add(norm(e.name))
    }
  }
  return nameSet.has(norm(name))
}

/** The company's name in `year` (before its first recorded name, the oldest one). */
export function realNameAt(co: RealCo, year: number): string {
  if (!co.names.length) return co.name
  let name = co.names[0].name
  for (const n of co.names) if (n.from <= year) name = n.name
  return name
}

/** True when the company is listed in `year`. */
export function realListed(co: RealCo, year: number): boolean {
  return year >= co.start && (co.end === null || year <= co.end)
}

/** The company's coarse excess return for `year` (0 outside its arcs). Only used for years of real history. */
export function arcExcess(co: RealCo, year: number): number {
  let ex = 0
  for (const [from, to, e] of co.arc) if (year >= from && year <= to) ex += e
  return Math.max(-0.2, Math.min(0.2, ex))
}

const SIZE_VALUE: Record<SizeClass, number> = { mega: 3, large: 2, mid: 1 }
export const SIZE_LABEL: Record<SizeClass, string> = { mega: 'Mega-cap', large: 'Large-cap', mid: 'Mid-cap' }

/** The rough size class in `year`: the recorded one, else from fame (young companies are a notch smaller). */
export function sizeClassAt(co: RealCo, year: number): SizeClass {
  let cls: SizeClass | null = null
  for (const [from, c] of co.size) if (from <= year) cls = c
  if (cls) return cls
  if (co.size.length && year < co.size[0][0]) return 'mid'
  const base: SizeClass = co.fame >= 9 ? 'mega' : co.fame >= 6 ? 'large' : 'mid'
  if (base === 'mega' && year < co.start + 12) return 'large'
  if (base === 'large' && year < co.start + 5) return 'mid'
  return base
}

/** Menu ordering: bigger first (class, then fame). */
export function sizeScore(co: RealCo, year: number): number {
  return SIZE_VALUE[sizeClassAt(co, year)] * 100 + co.fame
}

// ---------------------------------------------------------------------------
// Slot plans

export interface RealPlan {
  /** For each slot, the real companies that occupy it, in order (no overlaps). */
  queues: RealCo[][]
  /** Sectors of the slots beyond the base plan. */
  extraSectors: string[]
  /** Real companies that did not fit (kept out because too many were listed at once). */
  dropped: string[]
}

/** The most listings an exchange shows at once (the busiest markets show a few more). */
export const MAX_REAL_SLOTS = 36
const BUSY_SLOTS: Readonly<Record<string, number>> = { us: 40 }

/**
 * Assign an exchange's real companies to listing slots. `base` is the exchange's sector plan
 * (the slots every exchange has); more slots are added, up to MAX_REAL_SLOTS, when more real
 * companies were listed at once than the base plan has room for. Pure and deterministic.
 */
export function buildRealPlan(home: string, base: readonly string[]): RealPlan | null {
  const roster = realRoster(home)
  if (!roster.length) return null
  const cap = Math.max(base.length, BUSY_SLOTS[home] ?? MAX_REAL_SLOTS)
  const kept = [...roster]
  const dropped: string[] = []
  // Never more than `cap` real companies at once: the least famous give way.
  for (let guard = 0; guard < 500; guard++) {
    let worst: { year: number; n: number } | null = null
    const lo = Math.min(...kept.map((c) => c.start))
    const hi = PRESENT_YEAR + 1
    for (let y = lo; y <= hi; y++) {
      let n = 0
      for (const c of kept) if (realListed(c, y)) n++
      if (n > cap && (!worst || n > worst.n)) worst = { year: y, n }
    }
    if (!worst) break
    const alive = kept.filter((c) => realListed(c, worst!.year)).sort((a, b) => a.fame - b.fame || b.start - a.start || a.id.localeCompare(b.id))
    const out = alive[0]
    kept.splice(kept.indexOf(out), 1)
    dropped.push(out.id)
  }
  const slots: { sector: string; lastEnd: number }[] = base.map((sector) => ({ sector, lastEnd: -Infinity }))
  const queues: RealCo[][] = base.map(() => [])
  const extraSectors: string[] = []
  for (const co of kept) {
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (!(s.lastEnd < co.start)) continue
      const gap = s.lastEnd === -Infinity ? 200 : Math.min(199, co.start - s.lastEnd)
      const score = (s.sector === co.sector ? 0 : 10_000) + gap
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if ((best < 0 || bestScore >= 10_000) && slots.length < cap) {
      slots.push({ sector: co.sector, lastEnd: -Infinity })
      queues.push([])
      extraSectors.push(co.sector)
      best = slots.length - 1
    }
    if (best < 0) {
      dropped.push(co.id)
      continue
    }
    queues[best].push(co)
    slots[best].lastEnd = co.end === null ? Infinity : co.end
  }
  return { queues, extraSectors, dropped }
}

/** The real company in slot `slot` in `year` (index into its queue), or -1 when a filler holds it. */
export function realIndexAt(plan: RealPlan, slot: number, year: number): number {
  const q = plan.queues[slot] ?? []
  for (let i = 0; i < q.length; i++) if (realListed(q[i], year)) return i
  return -1
}

/** Number of the slot's real companies that had listed by `year`. */
export function realStartedBy(plan: RealPlan, slot: number, year: number): number {
  const q = plan.queues[slot] ?? []
  let n = 0
  for (const c of q) if (c.start <= year) n++
  return n
}
