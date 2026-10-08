// Picking real brands for everyday life. The registry (data/brands.ts) knows which brands exist in
// which country and year; this module turns that into choices for the places that name them:
// first jobs, endorsements, store names, the phone in your pocket. Home-market brands come first
// ("a Japanese life sees Japanese brands first"), then global ones.
//
// Two ways to pick:
//  - pickBrand(g, ...) uses g's RNG: for actions that happen once (an endorsement offer).
//  - seededBrand(g, ...) uses a seeded stream keyed by life, year and salt: for menus, subtitles and
//    listings that must stay put while the screen re-renders and must never touch g's RNG.
import { brandAvailable, brandById, allBrands, type Brand, type BrandTier } from '../data/brands'
import { nextRandom, rand } from '../rng'
import type { GameState, Json } from '../types'

export interface PickOpts {
  /** Only these tiers. */
  tiers?: readonly BrandTier[]
  /** Only this segment of the category. */
  segment?: string
  /** Skip this segment of the category (furniture makers are not furniture shops). */
  notSegment?: string
  /** Ask for another year or country than the character's. */
  year?: number
  countryId?: string
  /** Skip brands below this fame (1-10). */
  minFame?: number
  /** Skip these brand ids. */
  exclude?: readonly string[]
  /** Only brands whose home is this country. */
  homeOnly?: boolean
  /** Only brands that are NOT home brands. */
  foreignOnly?: boolean
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/** A tiny deterministic stream (same generator as rng.ts, no game state). */
function stream(key: string): () => number {
  let state = hashString(key)
  return () => {
    const [v, s] = nextRandom(state)
    state = s
    return v
  }
}

const CATEGORY_INDEX = new Map<string, Brand[]>()

function inCategory(category: string): Brand[] {
  let list = CATEGORY_INDEX.get(category)
  if (!list) {
    list = allBrands().filter((b) => b.category === category)
    CATEGORY_INDEX.set(category, list)
  }
  return list
}

/**
 * American brands were not on sale in countries under a US trade embargo while it held (Cuba from 1961,
 * Iran from 1980, Syria from 2004, North Korea always). Foreign brands there are unaffected.
 */
export function embargoed(b: Brand, countryId: string, year: number): boolean {
  if (b.hq !== 'us') return false
  switch (countryId) {
    case 'cu':
      return year >= 1961
    case 'ir':
      return year >= 1980
    case 'sy':
      return year >= 2004
    case 'kp':
      return true
    default:
      return false
  }
}

/** True when the brand's home market is where the character lives. */
export function isHomeBrand(b: Brand, countryId: string): boolean {
  return b.hq === countryId
}

/** How likely a brand is among its category: famous ones and home-market ones more. */
export function brandWeight(b: Brand, countryId: string): number {
  const fame = Math.max(1, b.fame ?? 5)
  return Math.pow(fame, 1.4) * (isHomeBrand(b, countryId) ? 3 : 1)
}

/** Brands of a category on sale where the character lives this year, home brands first, then by fame. */
export function brandPool(g: GameState, category: string, opts: PickOpts = {}): Brand[] {
  const year = opts.year ?? g.year
  const countryId = opts.countryId ?? g.character.countryId
  const skip = opts.exclude ?? []
  return inCategory(category)
    .filter(
      (b) =>
        brandAvailable(b, countryId, year) &&
        !embargoed(b, countryId, year) &&
        (!opts.segment || b.segment === opts.segment) &&
        (!opts.notSegment || b.segment !== opts.notSegment) &&
        (!opts.tiers || opts.tiers.includes(b.tier)) &&
        (opts.minFame === undefined || (b.fame ?? 5) >= opts.minFame) &&
        !skip.includes(b.id) &&
        (!opts.homeOnly || isHomeBrand(b, countryId)) &&
        (!opts.foreignOnly || !isHomeBrand(b, countryId)),
    )
    .sort((a, b) => Number(isHomeBrand(b, countryId)) - Number(isHomeBrand(a, countryId)) || (b.fame ?? 5) - (a.fame ?? 5) || a.name.localeCompare(b.name))
}

function weightedPick(pool: Brand[], countryId: string, roll: number): Brand | undefined {
  if (pool.length === 0) return undefined
  const total = pool.reduce((s, b) => s + brandWeight(b, countryId), 0)
  let r = roll * total
  for (const b of pool) {
    r -= brandWeight(b, countryId)
    if (r < 0) return b
  }
  return pool[pool.length - 1]
}

/** A brand chosen with g's RNG (home market and famous brands more likely). */
export function pickBrand(g: GameState, category: string | readonly string[], opts: PickOpts = {}): Brand | undefined {
  const cats = typeof category === 'string' ? [category] : category
  const pool = cats.flatMap((c) => brandPool(g, c, opts))
  return weightedPick(pool, opts.countryId ?? g.character.countryId, rand(g))
}

/**
 * A brand chosen without touching g's RNG: stable for a given life, year, country and salt, so a
 * menu row shows the same chain all year (and the shopkeeper does not change on every render).
 */
export function seededBrand(g: GameState, category: string | readonly string[], salt: string, opts: PickOpts = {}): Brand | undefined {
  const cats = typeof category === 'string' ? [category] : category
  const pool = cats.flatMap((c) => brandPool(g, c, opts))
  const c = g.character
  const next = stream(`${g.lifeId}|${c.firstName}${c.lastName}|${opts.year ?? g.year}|${opts.countryId ?? c.countryId}|brand|${cats.join('+')}|${salt}`)
  return weightedPick(pool, opts.countryId ?? c.countryId, next())
}

/** A brand drawn with a caller-supplied random stream (a listing's seeded `r`): no g RNG, no state. */
export function streamBrand(g: GameState, category: string | readonly string[], next: () => number, opts: PickOpts = {}): Brand | undefined {
  const cats = typeof category === 'string' ? [category] : category
  const pool = cats.flatMap((c) => brandPool(g, c, opts))
  return weightedPick(pool, opts.countryId ?? g.character.countryId, next())
}

export interface ModelPick {
  brand: Brand
  /** The known model of the year ("iPhone 5"), when the registry has one. */
  line: string | undefined
  /** Brand and model as a player would say it ("Apple iPhone 5", "Commodore 64"). */
  name: string
}

/**
 * A maker and the model it sold this year, picked without g's RNG. With `needsLine` only makers whose
 * model for that year is known are considered (so a 1982 computer is always a real model).
 */
export function seededModel(g: GameState, category: string | readonly string[], salt: string, opts: PickOpts & { needsLine?: boolean; rejectLine?: RegExp } = {}): ModelPick | undefined {
  const cats = typeof category === 'string' ? [category] : category
  const year = opts.year ?? g.year
  const countryId = opts.countryId ?? g.character.countryId
  let pool = cats.flatMap((c) => brandPool(g, c, opts))
  if (opts.needsLine) pool = pool.filter((b) => lineOf(b, year, countryId) !== undefined)
  if (opts.rejectLine) pool = pool.filter((b) => !opts.rejectLine!.test(lineOf(b, year, countryId) ?? ''))
  const c = g.character
  const next = stream(`${g.lifeId}|${c.firstName}${c.lastName}|${year}|${countryId}|model|${cats.join('+')}|${salt}`)
  const brand = weightedPick(pool, countryId, next())
  if (!brand) return undefined
  return { brand, line: lineOf(brand, year, countryId), name: modelName(brand, year, countryId) }
}

export interface GadgetSpec {
  /** Registry categories to draw from, or explicit brand ids. */
  category?: string | readonly string[]
  segment?: string
  ids?: readonly string[]
  /** 'model': maker + model of the year ("Apple iPhone 5"). 'prefix': maker + the item ("Sony Camcorder"). 'brand': the brand name is the product ("Apple Watch"). */
  mode?: 'model' | 'prefix' | 'brand'
  /** Added when the name does not already say what it is ("Laptop", "Console"). */
  suffix?: string
  /** Model lines must match / must not match (a laptop is not a desktop). */
  accept?: RegExp
  reject?: RegExp
  /** The name already says what it is when it matches this (no suffix added). */
  already?: RegExp
}

/** The word that makes a model name self-explanatory: "Dell XPS" + "Laptop", but "MacBook" alone. */
function withSuffix(name: string, suffix: string | undefined, already?: RegExp): string {
  if (!suffix || (already && already.test(name))) return name
  const first = suffix.split(/\s+/).pop() ?? suffix
  return new RegExp(`\\b${first}\\b`, 'i').test(name) ? name : `${name} ${suffix}`
}

/**
 * The name of a real product of the era for a store listing, picked without g's RNG: "Sony Camcorder",
 * "Apple iPhone 5", "Nintendo Switch Console". Undefined when no maker trades here this year.
 */
export function gadgetName(g: GameState, spec: GadgetSpec, salt: string, label: string): string | undefined {
  const countryId = g.character.countryId
  const year = g.year
  let pool: Brand[]
  if (spec.ids) pool = spec.ids.map((id) => brandById(id)).filter((b): b is Brand => !!b && brandAvailable(b, countryId, year) && !embargoed(b, countryId, year))
  else pool = (typeof spec.category === 'string' ? [spec.category] : spec.category ?? []).flatMap((c) => brandPool(g, c, spec.segment ? { segment: spec.segment } : {}))
  const mode = spec.mode ?? 'prefix'
  if (mode === 'model') {
    pool = pool.filter((b) => {
      const line = lineOf(b, year, countryId)
      return line !== undefined && (!spec.accept || spec.accept.test(line)) && (!spec.reject || !spec.reject.test(line))
    })
  }
  const c = g.character
  const next = stream(`${g.lifeId}|${c.firstName}${c.lastName}|${year}|${countryId}|gadget|${salt}`)
  const brand = weightedPick(pool, countryId, next())
  if (!brand) return undefined
  if (mode === 'model') return withSuffix(modelName(brand, year, countryId), spec.suffix, spec.already)
  if (mode === 'brand') return withSuffix(brand.name, spec.suffix, spec.already)
  return `${brand.name} ${label}`
}

/** The same, but a stable pick that does not change from year to year (a family's bank, the local supermarket). */
export function steadyBrand(g: GameState, category: string | readonly string[], salt: string, opts: PickOpts = {}): Brand | undefined {
  const cats = typeof category === 'string' ? [category] : category
  const pool = cats.flatMap((c) => brandPool(g, c, opts))
  const c = g.character
  const next = stream(`${g.lifeId}|${c.firstName}${c.lastName}|${opts.countryId ?? c.countryId}|steady|${cats.join('+')}|${salt}`)
  return weightedPick(pool, opts.countryId ?? c.countryId, next())
}

/** Name of a seeded pick, or `fallback` when nothing in the category is on sale here and now. */
export function seededBrandName(g: GameState, category: string | readonly string[], salt: string, fallback: string, opts: PickOpts = {}): string {
  return seededBrand(g, category, salt, opts)?.name ?? fallback
}

/** Name of a pick made with g's RNG, or `fallback`. */
export function pickBrandName(g: GameState, category: string | readonly string[], fallback: string, opts: PickOpts = {}): string {
  return pickBrand(g, category, opts)?.name ?? fallback
}

// ---------------------------------------------------------------------------
// Product lines ("iPhone 5", "Commodore 64")

type Line = [name: string, from: number, until?: number, where?: string]

function lineList(b: Brand): Line[] {
  const raw = b.data?.lines as Json | undefined
  return Array.isArray(raw) ? (raw as unknown as Line[]) : []
}

function matchesWhere(where: string | undefined, countryId: string): boolean {
  if (!where) return true
  let ok: boolean | null = null
  for (const tok of where.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('-')) {
      if (tok.slice(1) === countryId) return false
      continue
    }
    ok = (ok ?? false) || tok === countryId
  }
  return ok ?? true
}

/**
 * The line the brand sold in this country and year: the newest one that had come out, unless it was
 * already retired (then nothing, rather than an older line that was long gone too).
 */
export function lineOf(b: Brand, year: number, countryId: string): string | undefined {
  let best: Line | undefined
  for (const l of lineList(b)) {
    const [, from, , where] = l
    if (year < from || !matchesWhere(where, countryId)) continue
    if (!best || from >= best[1]) best = l
  }
  if (!best) return undefined
  const until = best[2]
  return until !== undefined && until !== 0 && year > until ? undefined : best[0]
}

/** "Commodore 64" when the model is known, else the brand name ("Samsung"). */
export function modelName(b: Brand, year: number, countryId: string): string {
  const line = lineOf(b, year, countryId)
  if (!line) return b.name
  // Lines that already carry the brand ("PlayStation 2", "iPhone 5") are not prefixed again.
  return line.toLowerCase().includes(b.name.toLowerCase()) ? line : `${b.name} ${line}`
}

// ---------------------------------------------------------------------------
// Names of real brands, for text that must not make claims about them

let REAL_NAMES: Set<string> | null = null

function realNames(): Set<string> {
  if (!REAL_NAMES) REAL_NAMES = new Set(allBrands().map((b) => b.name.toLowerCase()))
  return REAL_NAMES
}

/** True when the text is exactly the name of a registered real brand. */
export function isRealBrandName(name: string): boolean {
  return realNames().has(name.trim().toLowerCase())
}

/** Use a real company's name in neutral text, but fall back to a generic phrase in text that makes claims (layoffs, crimes, disputes). */
export function employerRef(name: string, generic = 'the company'): string {
  return isRealBrandName(name) ? generic : name
}

export { brandById }
