// Product lines that compete head to head. Every line is a kind of product (its family: 'Street
// Lighting' for 'Street Lighting Mk II') with its own quality. Rivals offer each kind once it has
// caught on in their market (big rivals first), each at its own quality, and customers compare
// versions: a line better than the rivals' wins their customers, a worse one wins few, and a
// kind that few rivals offer yet pulls extra (early movers win). Every kind's demand follows its
// real history (product-data.ts); kinds stack one for one, variants of one kind share its demand.
// A breakthrough that Heavy R&D opened (heavy-rd.ts) follows its record instead: its own demand
// curve, and rivals that offer it only from the launch plus the time it took to develop.
//
// The pull lifts the company's own pull in the market model (competition-core marketDemand): its
// share rises, the rivals' falls. Which rivals lose is decided here too: those whose versions are
// worse than yours lose customers to the ones whose versions hold up (applyProductRivalry), with
// the rivals' combined pull unchanged so the player's share is computed only once. Pure: no game
// state, no RNG (deterministic hashes of rival and product names).
import type { FieldRival, MarketCtx } from './competition-core'
import { heavyArrival, heavyFringeArrival, heavyLevel, heavyLevelFor, heavyVersionQuality, type HeavyRecord } from './heavy-rd'
import { industryDef } from './industries'
import { demandLevel, demandSize, demandTrend, PERIOD_CLASSICS, type DemandLevel } from './product-data'
import { styleOf, TIMELESS } from './products'
import type { Product } from './state'

// ---------------------------------------------------------------------------
// Kinds of lines

/** What a line is within its kind of product. */
export type LineKind = 'core' | 'next' | 'premium' | 'value' | 'regional' | 'bundle' | 'addon' | 'breakthrough'

/**
 * Share of its kind's demand a line of each sort addresses (a regional edition reaches one city; a
 * breakthrough, a kind of product of its own that Heavy R&D opens, reaches more of its kind's demand
 * than a classic line does).
 */
export const KIND_WEIGHT: Record<LineKind, number> = { core: 1, next: 1, premium: 0.55, value: 0.5, regional: 0.35, bundle: 0.4, addon: 0.4, breakthrough: 1.6 }
/** Development cost of each sort of line against a classic one (a breakthrough's cost is fixed by heavy-rd.ts). */
export const KIND_COST: Record<LineKind, number> = { core: 1, next: 1.15, premium: 1.3, value: 0.7, regional: 0.45, bundle: 0.4, addon: 0.55, breakthrough: 1 }

export interface LineInfo {
  /** The classic kind of product this line belongs to. */
  family: string
  kind: LineKind
  /** Generation (2 for 'Mk II', '2.0', 'Recipe No. 2'). */
  gen: number
}

const familyCache = new Map<string, string[]>()

/** Every kind of product a trade can sell: its modern classics, then its timeless and period ones. */
export function familiesOf(industry: string): string[] {
  const hit = familyCache.get(industry)
  if (hit) return hit
  const out = [...new Set([...industryDef(industry).products, ...(TIMELESS[industry] ?? []), ...(PERIOD_CLASSICS[industry] ?? [])])]
  familyCache.set(industry, out)
  return out
}

const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20 }

const VARIANTS: [RegExp, LineKind][] = [
  [/^Premium (.+)$/, 'premium'],
  [/^Limited-Edition (.+)$/, 'premium'],
  [/^(.+) Pro$/, 'premium'],
  [/^(.+) Max$/, 'premium'],
  [/^(.+) Plus$/, 'premium'],
  [/^(.+) Lite$/, 'value'],
  [/^Budget (.+)$/, 'value'],
  [/^Mini (.+)$/, 'value'],
  [/^(.+) Express$/, 'value'],
  [/^Family-Size (.+)$/, 'value'],
  [/^Seasonal (.+)$/, 'value'],
  [/^(.+) Take-Home Kit$/, 'value'],
  [/^Eco (.+)$/, 'value'],
  [/^(.+): .+ Edition$/, 'regional'],
  [/^(.+), .+ Style$/, 'regional'],
  [/^(.+) in .+$/, 'regional'],
  [/^(.+) Accessories$/, 'addon'],
  [/^(.+) for Businesses$/, 'addon'],
  [/^(.+) for Enterprise$/, 'addon'],
  [/^(.+) Academy$/, 'addon'],
  [/^(.+) Toolkit$/, 'addon'],
  [/^(.+) Training Course$/, 'addon'],
]

const infoCache = new Map<string, LineInfo>()

/**
 * The kind of product a line name belongs to and what sort of line it is, for names made by
 * products.ts productIdeas (and old saves). An unknown name is a kind of its own. Cached: the
 * planner asks for every line on every what-if.
 */
export function lineInfo(name: string, industry: string): LineInfo {
  const key = `${industry}\u0000${name}`
  const hit = infoCache.get(key)
  if (hit) return hit
  const out = parseLine(name, industry)
  if (infoCache.size > 5_000) infoCache.clear()
  infoCache.set(key, out)
  return out
}

function parseLine(name: string, industry: string): LineInfo {
  const fams = familiesOf(industry)
  const known = (x: string) => fams.includes(x)
  if (known(name)) return { family: name, kind: 'core', gen: 1 }
  let m = /^(.+), Recipe No\. (\d+)$/.exec(name) ?? /^(.+) (\d+)\.0$/.exec(name)
  if (m && known(m[1])) return { family: m[1], kind: 'next', gen: Number(m[2]) || 2 }
  m = /^(.+) Mk ([IVX]+)$/.exec(name) ?? /^(.+) ([IVX]+)$/.exec(name)
  if (m && known(m[1]) && ROMAN[m[2]]) return { family: m[1], kind: 'next', gen: ROMAN[m[2]] }
  m = /^(.+?) & .+ (Combo|Bundle|Package|Suite)$/.exec(name)
  if (m && known(m[1])) return { family: m[1], kind: 'bundle', gen: 1 }
  for (const [re, kind] of VARIANTS) {
    const v = re.exec(name)
    if (v && known(v[1])) return { family: v[1], kind, gen: 1 }
  }
  return { family: name, kind: 'core', gen: 1 }
}

/** A stored line's kind and family (lines launched since products 2.0 carry them). */
export function infoOf(p: Pick<Product, 'name' | 'family' | 'kind'>, industry: string): LineInfo {
  if (p.family && p.kind) return { family: p.family, kind: p.kind, gen: 1 }
  return lineInfo(p.name, industry)
}

// ---------------------------------------------------------------------------
// Quality

/** Quality of a line from an old save's demand boost (0.08, a typical one, is an average 50). */
export function qualityFromBoost(boost: number): number {
  const b = Number.isFinite(boost) && boost > 0 ? boost : 0.05
  return Math.round(Math.max(25, Math.min(90, 50 + 15 * Math.log2(b / 0.08))))
}

/** A line's quality at launch (old saves: from its boost). */
export function lineQuality(p: Pick<Product, 'quality' | 'boost'>): number {
  return typeof p.quality === 'number' && Number.isFinite(p.quality) ? Math.max(0, Math.min(100, p.quality)) : qualityFromBoost(p.boost)
}

/** Points a year rivals' versions catch up with a line after its first year (tech moves fastest). */
const AGE_RATE = { food: 0.5, service: 0.7, goods: 1.2, tech: 2 } as const
/** The most a line can fall behind with age. */
const MAX_AGE_LOSS = 30

/** A line's quality against today's rivals: it stays what it was, while their versions improve. */
export function effectiveQuality(p: Pick<Product, 'quality' | 'boost' | 'launched'>, industry: string, year: number): number {
  const q = lineQuality(p)
  const age = Math.max(0, year - p.launched - 1)
  return q - Math.min(MAX_AGE_LOSS, AGE_RATE[styleOf(industry)] * age)
}

// ---------------------------------------------------------------------------
// The rivals' versions

/** FNV-1a: a stable 32-bit hash of a string. */
function fnv(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const hashCache = new Map<string, number>()

export function hashOf(s: string): number {
  let h = hashCache.get(s)
  if (h === undefined) {
    h = fnv(s)
    if (hashCache.size > 20_000) hashCache.clear()
    hashCache.set(s, h)
  }
  return h
}

/** A stable number in [0, 1) from a rival's hash, a kind of product's hash and a salt. */
export function mix(hr: number, hf: number, salt: number): number {
  let h = Math.imul(hr ^ Math.imul(hf, 0x9e3779b1), 0x85ebca6b) ^ salt
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Big rivals take up a new kind of product sooner (a lower adoption threshold). */
const TIER_EXP: Record<string, number> = { giant: 1.8, major: 1.4, mid: 1, small: 0.75 }
/** Quality of the long tail's versions. */
const FRINGE_QUALITY = 44
/** What customers compare a kind of product with when nobody sells it yet. */
const PAR_QUALITY = 50

/**
 * The adoption a rival takes a kind up at, and its version's quality, from the two hashes. Past
 * full adoption it never does: rivals specialize (about one kind in five for a mid-size rival,
 * fewer for giants), so buying one brings its own mix of products.
 */
function versionOf(hr: number, hf: number, tier: string, quality: number): { thr: number; quality: number } {
  return {
    thr: 0.05 + 1.2 * Math.pow(mix(hr, hf, 0), TIER_EXP[tier] ?? 1),
    quality: Math.round(Math.max(10, Math.min(99, quality + (mix(hr, hf, 1) - 0.5) * 16))),
  }
}

/** Whether a rival sells a kind of product (at a given adoption of it), and how good its version is. */
export function rivalVersion(r: Pick<FieldRival, 'id' | 'tier' | 'quality'>, family: string, adoption: number): { offers: boolean; quality: number } {
  const v = versionOf(hashOf(r.id), hashOf(family), r.tier, r.quality)
  return { offers: adoption >= v.thr, quality: v.quality }
}

export interface FamilyField {
  /** 0-1: share of the rivals' pull that offers this kind of product. */
  offer: number
  /** Pull-weighted quality of the rivals' versions (a par 50 when nobody offers it). */
  quality: number
  /** 0-1: how far the kind has caught on in this market. */
  adoption: number
  /** Demand for the kind now vs its eventual peak. */
  level: number
  /** False before anyone in this market could sell it. */
  exists: boolean
}

/** The rivals' side of every kind of product in one market and year (computed on demand). */
export interface Field {
  place: string
  year: number
  /** The rivals it was read from (versions() follows their order). */
  rivals: readonly unknown[]
  /** The breakthroughs of this market it was read with (heavy-rd.ts); a field for another year of the same market passes them on. */
  heavy: readonly HeavyRecord[]
  of(family: string): FamilyField
  /** Each rival's version of a kind, in the order of the rivals the field was made from (-1: none). */
  versions(family: string): readonly number[]
}

const fieldCache = new Map<string, Field>()
const NO_HEAVY: readonly HeavyRecord[] = Object.freeze([])

/**
 * The field of a market: what its rivals (and the long tail) offer of each kind of product, and how well.
 * Cached by a signature of the rivals (the planner reads the same market on every what-if); a
 * field is a pure function of its inputs, so sharing it is safe. `heavy` is the market's breakthrough
 * records (heavy-rd.ts readHeavy): a kind with a record follows it instead of the real-history curve, and
 * the records are part of the cache key. Without records the field is what it always was.
 */
export function fieldOf(rivals: readonly Pick<FieldRival, 'id' | 'tier' | 'quality' | 'pull'>[], fringe: number, place: string, year: number, heavy?: readonly HeavyRecord[]): Field {
  let pulls = 0
  let quality = 0
  rivals.forEach((r, i) => {
    pulls += r.pull * (1 + (i % 7))
    quality += r.quality * (1 + (i % 5))
  })
  const records = heavy ?? NO_HEAVY
  // Every number the field reads from a record is in the signature (the arrival depends on the years).
  const sig = records.length ? `|${records.map((r) => `${r.family}\u0001${r.year}\u0001${r.years}\u0001${r.quality}`).join('\u0002')}` : ''
  const key = `${place}|${year}|${fringe}|${rivals.length}|${rivals[0]?.id ?? ''}|${rivals[rivals.length - 1]?.id ?? ''}|${pulls}|${quality}${sig}`
  const hit = fieldCache.get(key)
  if (hit) return hit
  // The field keeps its own frozen copy: a list changed later by its owner can't change a shared, cached field.
  const out = makeField(rivals, fringe, place, year, records.length ? Object.freeze([...records]) : NO_HEAVY)
  if (fieldCache.size > 256) {
    const first = fieldCache.keys().next().value
    if (first !== undefined) fieldCache.delete(first)
  }
  fieldCache.set(key, out)
  return out
}

function makeField(rivals: readonly Pick<FieldRival, 'id' | 'tier' | 'quality' | 'pull'>[], fringe: number, place: string, year: number, heavy: readonly HeavyRecord[]): Field {
  const memo = new Map<string, { f: FamilyField; v: number[] }>()
  const total = rivals.reduce((t, r) => t + Math.max(0, r.pull), 0) + Math.max(0, fringe)
  let hashes: number[] | null = null
  const get = (family: string): { f: FamilyField; v: number[] } => {
    const hit = memo.get(family)
    if (hit) return hit
    const rec = heavy.length ? heavy.find((r) => r.family === family) : undefined
    // A breakthrough follows its own record: nothing before the launch, then rivals one by one (heavy-rd.ts).
    const d = rec ? heavyLevel(rec, year) : demandLevel(family, place, year)
    const versions: number[] = new Array(rivals.length).fill(-1)
    let wo = 0
    let wq = 0
    if (d.exists) {
      if (rec) {
        rivals.forEach((r, i) => {
          if (year < heavyArrival(rec, r)) return
          const q = heavyVersionQuality(rec, r)
          versions[i] = q
          if (!(r.pull > 0)) return
          wo += r.pull
          wq += r.pull * q
        })
        const tail = year >= heavyFringeArrival(rec) ? Math.max(0, fringe) * d.adoption : 0
        wo += tail
        wq += tail * FRINGE_QUALITY
      } else {
        hashes ??= rivals.map((r) => hashOf(r.id))
        const hf = hashOf(family)
        rivals.forEach((r, i) => {
          const v = versionOf(hashes![i], hf, r.tier, r.quality)
          if (d.adoption < v.thr) return
          versions[i] = v.quality
          if (!(r.pull > 0)) return
          wo += r.pull
          wq += r.pull * v.quality
        })
        const tail = Math.max(0, fringe) * d.adoption
        wo += tail
        wq += tail * FRINGE_QUALITY
      }
    }
    const out = { f: { offer: total > 0 ? Math.min(1, wo / total) : 0, quality: wo > 0 ? wq / wo : PAR_QUALITY, adoption: d.adoption, level: d.level, exists: d.exists }, v: versions }
    memo.set(family, out)
    return out
  }
  return { place, year, rivals, heavy, of: (family) => get(family).f, versions: (family) => get(family).v }
}

/** The market's field for a context (marketCtxFor attaches one; a bare context gets it computed). */
export function fieldFor(ctx: MarketCtx): Field {
  return ctx.field ?? fieldOf(ctx.rivals, ctx.fringe, ctx.key, ctx.year)
}

/**
 * Demand for a kind of product in a market and year: a breakthrough with a record in `heavy` follows
 * the record (heavy-rd.ts), every other kind its real history (product-data.ts). Pass the records of the
 * market (heavy-rd.ts heavyOf, or a field's own `heavy`); with none this is demandLevel.
 */
export function kindLevel(family: string, place: string, year: number, heavy?: readonly HeavyRecord[]): DemandLevel {
  return (heavy && heavy.length ? heavyLevelFor(family, heavy, year) : null) ?? demandLevel(family, place, year)
}

/** Growing (1), steady (0) or shrinking (-1) over the next few years, from kindLevel (the thresholds of demandTrend). */
export function kindTrend(family: string, place: string, year: number, heavy?: readonly HeavyRecord[]): -1 | 0 | 1 {
  if (!heavy || !heavy.length || !heavy.some((r) => r.family === family)) return demandTrend(family, place, year)
  const now = kindLevel(family, place, year, heavy).level
  const next = kindLevel(family, place, year + 4, heavy).level
  if (next > now * 1.12) return 1
  if (next < now * 0.9) return -1
  return 0
}

// ---------------------------------------------------------------------------
// The pull of a range

/** Share of a trade's demand one typical kind of product at its peak stands for. */
export const SEGMENT = 0.06
/** Extra pull while few rivals offer a kind (at most +80% when nobody does). */
export const NOVELTY = 0.8
/** Quality points that double (or halve) a line's pull against the rivals' versions. */
export const QUALITY_STEP = 20
/** Variants of one kind add at most this much on top of its best line. */
const FAMILY_CAP = 1.8
/** The rest of a kind's lines count at this share (they mostly reach the same customers). */
const SECOND_LINES = 0.5
/** Kinds stack one for one up to this much extra pull... */
const RANGE_KNEE = 0.8
/** ...then ever less, toward this ceiling (a vast range can't multiply demand without end). */
export const RANGE_CAP = 2

/** A line's edge over the rivals' versions of its kind (1 = as good as theirs, plenty of rivals). */
export function edgeOf(effective: number, f: Pick<FamilyField, 'offer' | 'quality'>): number {
  const q = Math.max(0.2, Math.min(3, Math.pow(2, (effective - f.quality) / QUALITY_STEP)))
  return q * (1 + NOVELTY * (1 - Math.max(0, Math.min(1, f.offer))))
}

/** Share of the company's pull a kind of product stands for in a market and year (before quality). */
export function segmentOf(family: string, f: Pick<FamilyField, 'level'>): number {
  return SEGMENT * demandSize(family) * Math.max(0, f.level)
}

export interface LinePull {
  name: string
  family: string
  kind: LineKind
  /** Quality at launch. */
  quality: number
  /** Quality against today's rivals (after age). */
  effective: number
  /** The rivals' versions: quality and how many offer it. */
  field: number
  offer: number
  /** Demand for its kind now vs its peak, and where it is heading. */
  level: number
  /** This line's share of the company's extra pull (after variants and the range ceiling). */
  lift: number
}

export interface ProductPull {
  /** Extra pull of the whole range: the company's pull is multiplied by 1 + total. */
  total: number
  lines: LinePull[]
}

const EMPTY: ProductPull = { total: 0, lines: [] }

/** Ranges already priced in a field (the planner asks for the same range on every what-if). */
const pullCache = new WeakMap<Field, Map<string, ProductPull>>()

/** What a range is made of, as a cache key. */
function rangeKey(industry: string, products: readonly Product[], year: number): string {
  let k = `${industry}|${year}`
  for (const p of products) k += `\u0002${p.name}\u0001${p.launched}\u0001${p.quality ?? ''}\u0001${p.boost}\u0001${p.family ?? ''}\u0001${p.kind ?? ''}`
  return k
}

/**
 * The pull of a company's product lines in its market: each line's kind's demand (real history)
 * times its edge over the rivals' versions, kinds stacking one for one, variants of a kind sharing
 * it, under a soft ceiling for the whole range. The result is shared (cached): read it, never
 * change it.
 */
export function productPull(industry: string, products: readonly Product[], year: number, field: Field): ProductPull {
  if (!products.length) return EMPTY
  // The planner passes the very same list on every what-if: a cheap fingerprint confirms it.
  const fp = fingerprint(industry, products, year)
  let same = sameList.get(field)
  const quick = same?.get(products)
  if (quick && quick.fp === fp) return quick.out
  let memo = pullCache.get(field)
  if (!memo) {
    memo = new Map()
    pullCache.set(field, memo)
  }
  const key = rangeKey(industry, products, year)
  let out = memo.get(key)
  if (!out) {
    out = computePull(industry, products, year, field)
    if (memo.size > 64) memo.clear()
    memo.set(key, out)
  }
  if (!same) {
    same = new WeakMap()
    sameList.set(field, same)
  }
  same.set(products, { fp, out })
  return out
}

/** Lists already priced in a field, by identity (with a fingerprint in case one was edited in place). */
const sameList = new WeakMap<Field, WeakMap<readonly Product[], { fp: number; out: ProductPull }>>()

/** A numeric fingerprint of a range (catches a line changed in place since it was priced). */
function fingerprint(industry: string, products: readonly Product[], year: number): number {
  let h = (year * 131 + industry.length) % 1_000_000_007
  for (const p of products) h = (h * 31 + p.launched * 7 + (p.quality ?? -1) * 13 + Math.round(p.boost * 1009) + p.name.length * 3 + (p.kind?.length ?? 0)) % 1_000_000_007
  return h + products.length * 1e10
}

function computePull(industry: string, products: readonly Product[], year: number, field: Field): ProductPull {
  const byFamily = new Map<string, { line: LinePull; raw: number }[]>()
  for (const p of products) {
    if (p.launched > year) continue
    const info = infoOf(p, industry)
    const f = field.of(info.family)
    if (!f.exists) continue
    const effective = effectiveQuality(p, industry, year)
    const raw = segmentOf(info.family, f) * KIND_WEIGHT[info.kind] * edgeOf(effective, f)
    const line: LinePull = { name: p.name, family: info.family, kind: info.kind, quality: lineQuality(p), effective, field: f.quality, offer: f.offer, level: f.level, lift: 0 }
    const list = byFamily.get(info.family)
    if (list) list.push({ line, raw })
    else byFamily.set(info.family, [{ line, raw }])
  }
  const lines: LinePull[] = []
  let sum = 0
  for (const list of byFamily.values()) {
    list.sort((x, y) => y.raw - x.raw)
    const best = list[0].raw
    let fam = 0
    const parts = list.map((x, i) => (i === 0 ? x.raw : x.raw * SECOND_LINES))
    for (const v of parts) fam += v
    const capped = Math.min(fam, best * FAMILY_CAP)
    const k = fam > 0 ? capped / fam : 0
    list.forEach((x, i) => {
      x.line.lift = parts[i] * k
      lines.push(x.line)
    })
    sum += capped
  }
  if (!(sum > 0)) return { total: 0, lines }
  const total = sum <= RANGE_KNEE ? sum : RANGE_KNEE + (RANGE_CAP - RANGE_KNEE) * (1 - Math.exp(-(sum - RANGE_KNEE) / (RANGE_CAP - RANGE_KNEE)))
  const scale = total / sum
  for (const l of lines) l.lift *= scale
  return { total: Number.isFinite(total) ? total : 0, lines }
}

/** The best line of each kind the company sells, at its quality against today's rivals. */
function bestByFamily(industry: string, products: readonly Product[], year: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of products) {
    if (p.launched > year) continue
    const info = infoOf(p, industry)
    const q = effectiveQuality(p, industry, year)
    if (q > (out.get(info.family) ?? -Infinity)) out.set(info.family, q)
  }
  return out
}

/** How hard the company's range presses on rivals' customers (at most half of a rival's pull moves). */
const MAX_PRESS = 0.5

/**
 * Which rivals lose customers to the company's products: those whose version of a kind is worse
 * than yours lose the most, those without one lose some, those with a better one lose nothing.
 * The rivals' combined pull is unchanged (the company's own gain is its pull, productPull), so
 * this only decides who pays for it. Returns the context unchanged when the company has no lines.
 */
export function applyProductRivalry(ctx: MarketCtx, industry: string, products: readonly Product[], field: Field = fieldOf(ctx.rivals, ctx.fringe, ctx.key, ctx.year, ctx.field?.heavy)): MarketCtx {
  if (!products.length || !ctx.rivals.length) return ctx
  const mine = bestByFamily(industry, products, ctx.year)
  if (!mine.size) return ctx
  // The field must have been read from these very rivals (same order): its versions line up.
  const own = field.rivals === ctx.rivals ? field : fieldOf(ctx.rivals, ctx.fringe, ctx.key, ctx.year, field.heavy)
  const press: { seg: number; q: number; adoption: number; versions: readonly number[] }[] = []
  for (const [family, q] of mine) {
    const f = own.of(family)
    if (f.exists) press.push({ seg: segmentOf(family, f), q, adoption: f.adoption, versions: own.versions(family) })
  }
  if (!press.length) return ctx
  let before = 0
  let after = 0
  const rivals = ctx.rivals.map((r, i) => {
    before += r.pull
    let pen = 0
    for (const x of press) {
      const v = x.versions[i]
      pen += x.seg * (v >= 0 ? Math.max(0, Math.min(1, (x.q - v) / 40)) : 0.5 * x.adoption)
    }
    const pull = r.pull * (1 - Math.min(MAX_PRESS, pen))
    after += pull
    return { ...r, pull }
  })
  if (!(after > 0) || !(before > 0)) return ctx
  const k = before / after
  for (const r of rivals) r.pull *= k
  return { ...ctx, rivals }
}

/** The kinds of product a rival sells this year, best-selling kinds first, with its quality in each. */
export function rivalLines(r: Pick<FieldRival, 'id' | 'tier' | 'quality'>, industry: string, place: string, year: number): { family: string; quality: number; level: number }[] {
  const out: { family: string; quality: number; level: number }[] = []
  for (const family of familiesOf(industry)) {
    const d = demandLevel(family, place, year)
    if (!d.exists) continue
    const v = rivalVersion(r, family, d.adoption)
    if (v.offers) out.push({ family, quality: v.quality, level: d.level * demandSize(family) })
  }
  return out.sort((x, y) => y.level - x.level)
}
