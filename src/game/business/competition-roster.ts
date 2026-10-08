// The rivals: a deterministic cast of competitors for every market (the world for tradable
// industries, one country for local trades). The named cast is REAL: the companies of
// data/brands-rivals.ts, each from the year it was founded (or began to compete in the market, or
// reached the country) until the year it really ended, with a rough size, a ramp and a strength
// arc. Around them the family's seed generates a thin long tail of fictional, locally named
// challengers (never named like a real brand) so every market in every year has a believable
// field; the same world keeps the same tail across heirs, saves and the Time Machine. Fictional
// challengers are founded as their market grows (an AI lab rarely before deep learning), mature
// over a few years and close, sell out or go bust after a lifespan, when someone new takes their
// place. Real brands never end after PRESENT_YEAR: in the procedural future they only shrink or
// grow. Nothing here reads or writes game state; results are cached per market.
import { seeded, type SRng } from '../assets'
import { allBrands, type Brand, type BrandTier } from '../data/brands'
import { marketOf } from '../data/markets'
import { getCountry, namePoolOf } from '../world'
import { marketDef, NETWORK_KNEE, sizeRatio, type MarketDef } from './competition-data'
import { industryDef } from './industries'
import { PRESENT_YEAR } from '../history/timeline'

export type RivalTier = 'giant' | 'major' | 'mid' | 'small'

export interface Rival {
  id: string
  name: string
  /** Headquarters country. */
  hq: string
  /** The year the company was founded (real companies: the real year). */
  founded: number
  /** First year it competes in THIS market (a later entry, or arrival in a country); defaults to `founded`. */
  from?: number
  /** First year it no longer trades. */
  exit: number
  /** Relative pull at full strength (1 = a solid reference competitor). */
  pot: number
  /** Years to reach full strength. */
  ramp: number
  tier: RivalTier
  /** A state-backed incumbent that fades as the market opens up. */
  legacy: boolean
  quality: number
  tech: number
  /** How it leaves the market. */
  fate: 'acquired' | 'bankrupt' | 'merged' | 'closed'
  /** A real company from the brand registry (otherwise a fictional challenger from the long tail). */
  real?: boolean
  brandId?: string
  /** Price segment of a real company's offer. */
  seg?: BrandTier
  /** Strength arc of a real company: [year, multiplier] control points (rises and falls). */
  arc?: [number, number][]
  /** Procedural-future drift of a real company (yearly log-growth per decade after PRESENT_YEAR). */
  drift?: number
  /** National markets: the countries a real company trades in (home first). */
  places?: string[]
}

export interface Roster {
  rivals: Rival[]
  /** Combined pull of the ordinary named rivals at PRESENT_YEAR (normalizes how full the field is). */
  presentPull: number
  byId: Map<string, Rival>
}

/** Rivals are generated up to this year (the far future is procedural too). */
const HORIZON = 2200

/** The family's world seed: heirs (lifeId '-g2', '-g3'...) share their parents' world. */
export function familyId(lifeId: string): string {
  return lifeId.replace(/-g\d+$/, '')
}

/** The most network effects can multiply a company's pull (even a monopoly can be out-built). */
export const MAX_NETWORK_PULL = 80

/** Network effects: the pull a share of the market brings (1 for small players, a lot for giants). */
export function networkPull(share: number, beta: number): number {
  const s = Math.max(0, Math.min(1, share))
  if (!(beta > 0) || s <= 0) return 1
  return Math.min(MAX_NETWORK_PULL, Math.exp((beta * s * s) / (s + NETWORK_KNEE)))
}

/**
 * Rivals' network effects are half as strong as the player's: the generated field concentrates
 * around a few leaders without one of them running away with a market before anyone plays in it.
 */
export const RIVAL_NETWORK = 0.5

/** 0 → 1 as a rival grows up, and fading out in its last years. */
export function maturity(r: { founded: number; from?: number; exit: number; ramp: number }, year: number): number {
  const start = r.from ?? r.founded
  if (year < start || year >= r.exit) return 0
  const age = year - start + 1
  let m = Math.min(1, 0.15 + 0.85 * (1 - Math.exp((-2.5 * age) / Math.max(1, r.ramp))))
  const left = r.exit - year
  if (left <= 3) m *= left / 4
  return m
}

/** A real company's strength multiplier from its arc (1 when it has none), flat after the last point. */
export function arcMult(arc: readonly (readonly [number, number])[] | undefined, year: number): number {
  if (!arc || arc.length === 0) return 1
  if (year <= arc[0][0]) return arc[0][1]
  for (let i = 1; i < arc.length; i++) {
    const [y1, v1] = arc[i]
    if (year <= y1) {
      const [y0, v0] = arc[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / Math.max(1, y1 - y0)
    }
  }
  return arc[arc.length - 1][1]
}

/** Legacy incumbents lose their grip as the market opens up (to a quarter of their old pull). */
export function legacyFade(d: MarketDef, year: number): number {
  const l = d.legacy
  if (!l) return 1
  if (year <= l.fadeFrom) return 1
  if (year >= l.fadeTo) return 0.25
  return 1 - 0.75 * ((year - l.fadeFrom) / Math.max(1, l.fadeTo - l.fadeFrom))
}

/** The size class of a company with this pull (1 = a solid reference competitor). */
export function tierOfPot(pot: number): RivalTier {
  return pot >= 6 ? 'giant' : pot >= 2.2 ? 'major' : pot >= 0.8 ? 'mid' : 'small'
}

const TIER_ODDS: [RivalTier, number][] = [
  ['giant', 0.08],
  ['major', 0.22],
  ['mid', 0.4],
  ['small', 0.3],
]

function tierStats(s: SRng, tier: RivalTier, national: boolean): { pot: number; life: number; ramp: number } {
  const startupDies = { giant: 0.05, major: 0.15, mid: 0.35, small: 0.6 }[tier]
  const short = s.chance(startupDies)
  const pot = tier === 'giant' ? s.float(6, 14) : tier === 'major' ? s.float(2, 5) : tier === 'mid' ? s.float(0.8, 2) : s.float(0.2, 0.7)
  const long = tier === 'giant' ? s.int(50, 150) : tier === 'major' ? s.int(30, 90) : tier === 'mid' ? s.int(15, 60) : s.int(10, 30)
  const life = short ? s.int(3, 12) : national ? Math.round(long * 0.7) : long
  const ramp = tier === 'giant' ? s.int(8, 12) : tier === 'major' ? s.int(5, 8) : tier === 'mid' ? s.int(3, 6) : s.int(2, 4)
  return { pot, life: Math.max(3, life), ramp }
}

function fateOf(s: SRng, tier: RivalTier, life: number): Rival['fate'] {
  if (life <= 12) return s.chance(0.55) ? 'bankrupt' : 'acquired'
  return s.pick(tier === 'giant' || tier === 'major' ? (['merged', 'acquired', 'acquired', 'bankrupt'] as const) : (['acquired', 'closed', 'bankrupt', 'merged'] as const))
}

function localWords(countryId: string): string[] {
  const words = marketOf(countryId).nameWords
  return words.length ? words : [getCountry(countryId).demonym]
}

export function rivalName(s: SRng, industry: string, d: MarketDef, hq: string): string {
  const def = industryDef(industry)
  if (d.scope === 'national') {
    const pool = namePoolOf(hq)
    const word = s.chance(0.5) ? s.pick(localWords(hq)) : s.pick(pool.last)
    return `${word} ${s.pick(def.suffixes)}`
  }
  const post = d.names?.post.length ? d.names.post : def.suffixes
  const pre = d.names?.pre ?? []
  const word = pre.length && s.chance(0.6) ? s.pick(pre) : s.pick(localWords(hq))
  const p = s.pick(post)
  return p.startsWith(' ') || p === '' ? `${word}${p}` : `${word} ${p}`
}

export function pickHub(s: SRng, d: MarketDef, scopeKey: string): string {
  if (d.scope === 'national' || !d.hubs?.length) return scopeKey === 'world' ? 'us' : scopeKey
  return s.weighted(d.hubs, (h) => h[1])[0]
}

// ---------------------------------------------------------------------------
// The real cast

let realIndex: Map<string, Brand[]> | null = null
let realNames: Set<string> | null = null

/** The registry's rival brands of one industry (static, in registry order). */
export function realBrandsOf(industry: string): readonly Brand[] {
  if (!realIndex) {
    realIndex = new Map()
    realNames = new Set()
    for (const b of allBrands()) {
      realNames.add(b.name.toLowerCase())
      if (!b.category.startsWith('rival.')) continue
      const k = b.category.slice(6)
      const list = realIndex.get(k)
      if (list) list.push(b)
      else realIndex.set(k, [b])
    }
  }
  return realIndex.get(industry) ?? []
}

/** True when a name belongs to a real brand (fictional challengers never take one). */
export function isRealName(name: string): boolean {
  realBrandsOf('')
  return !!realNames?.has(name.trim().toLowerCase())
}

function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x
  return out
}

function arcOf(v: unknown): [number, number][] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: [number, number][] = []
  for (const p of v) if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') out.push([p[0], Math.max(0, p[1])])
  return out.length ? out.sort((x, y) => x[0] - y[0]) : undefined
}

const FOREIGN_PULL = 0.6
const TIER_QUALITY: Record<BrandTier, number> = { budget: -3, mass: 0, premium: 5, luxury: 9, ultra: 11 }

function defaultRamp(pot: number): number {
  return pot >= 6 ? 10 : pot >= 2.2 ? 7 : pot >= 0.8 ? 5 : 3
}

/** The real company as a rival in one market (null when it never plays there). */
function realRival(fam: string, b: Brand, d: MarketDef, scopeKey: string): Rival | null {
  const data = (b.data ?? {}) as Record<string, unknown>
  const national = d.scope === 'national'
  const hq = b.hq ?? 'us'
  const since = typeof data.since === 'number' ? data.since : b.founded
  let from = Math.max(b.founded, since)
  let pot = typeof data.pot === 'number' ? data.pot : 1
  let exit = b.ended !== undefined ? b.ended + 1 : HORIZON + 1
  let places: string[] | undefined
  if (national) {
    const sold = b.sold ?? {}
    if (hq !== scopeKey) {
      const entered = sold[scopeKey]
      if (entered === undefined) return null
      from = Math.max(from, entered)
      pot *= FOREIGN_PULL
    }
    const last = numMap(data.x)[scopeKey]
    if (last !== undefined) exit = Math.min(exit, last + 1)
    const w = numMap(data.w)[scopeKey]
    if (w !== undefined) pot *= w
    places = b.countries ? [...b.countries] : [hq]
  }
  if (!(pot > 0) || exit <= from) return null
  const ramp = typeof data.ramp === 'number' ? data.ramp : defaultRamp(pot)
  const jitter = seeded(`brand|${b.id}`)
  const lp = Math.log2(1 + pot)
  const qOver = typeof data.q === 'number' ? data.q : null
  const tOver = typeof data.t === 'number' ? data.t : null
  const fate = data.fate === 'merged' || data.fate === 'closed' || data.fate === 'bankrupt' ? data.fate : 'acquired'
  const rv: Rival = {
    id: b.id,
    name: b.name,
    hq,
    founded: b.founded,
    from,
    exit,
    pot,
    ramp,
    tier: tierOfPot(pot),
    legacy: data.leg === true,
    quality: Math.round(Math.max(20, Math.min(97, qOver ?? 42 + 11 * lp + TIER_QUALITY[b.tier] + jitter.int(-6, 6)))),
    tech: Math.round(Math.max(15, Math.min(98, tOver ?? 38 + 13 * lp + (b.tier === 'premium' || b.tier === 'luxury' ? 3 : 0) + jitter.int(-8, 8)))),
    fate,
    real: true,
    brandId: b.id,
    seg: b.tier,
    ...(places ? { places } : {}),
  }
  const arc = arcOf(data.a)
  if (arc) rv.arc = arc
  // The procedural future: a real brand only shrinks or grows (never ends).
  rv.drift = Math.round(seeded(`${fam}|drift|${b.id}`).float(-0.35, 0.35) * 1000) / 1000
  return rv
}

function generate(fam: string, industry: string, scopeKey: string): Roster {
  const d = marketDef(industry)
  const national = d.scope === 'national'
  const s = seeded(`${fam}|roster|${industry}|${scopeKey}`)
  const start = d.from ?? d.curve[0][0]
  const ratio: number[] = []
  for (let y = start; y <= HORIZON; y++) ratio.push(sizeRatio(industry, y))
  const firstYearAt = (theta: number): number => {
    for (let i = 0; i < ratio.length; i++) if (ratio[i] >= theta) return start + i
    return HORIZON + 1
  }
  const rivals: Rival[] = []
  const names = new Set<string>()

  // The real cast first (no randomness: the same everywhere), then the fictional tail.
  const real: Rival[] = []
  for (const b of realBrandsOf(industry)) {
    const r = realRival(fam, b, d, scopeKey)
    if (r) real.push(r)
  }
  const legacyReal = real.filter((r) => r.legacy)
  if (d.legacy && legacyReal.length) {
    // State-backed incumbents carry the legacy pull of the market, however many there are.
    let peak = 0
    for (let y = start; y <= start + 140; y++) peak = Math.max(peak, legacyReal.reduce((t, r) => t + r.pot * maturity(r, y) * arcMult(r.arc, y), 0))
    const scale = peak > 0 ? d.legacy.pull / peak : 1
    for (const r of legacyReal) r.pot *= scale
  }
  for (const r of real) {
    if (r.legacy && !d.legacy) r.legacy = false
    names.add(r.name.toLowerCase())
    rivals.push(r)
  }
  const realNow = real.filter((r) => !r.legacy && PRESENT_YEAR >= (r.from ?? r.founded) && PRESENT_YEAR < r.exit).length

  const add = (r: Omit<Rival, 'id' | 'name' | 'quality' | 'tech'>, nameTries = 8): void => {
    let name = ''
    const clash = (n: string) => !n || names.has(n.toLowerCase()) || isRealName(n)
    for (let i = 0; i < nameTries && clash(name); i++) name = rivalName(s, industry, d, r.hq)
    // A clash after the tries: the second company of that name sets itself apart.
    if (clash(name)) name = national ? `New ${name}` : `${name} International`
    if (clash(name)) return
    names.add(name.toLowerCase())
    const lp = Math.log2(1 + r.pot)
    rivals.push({
      ...r,
      id: `f${rivals.length}`,
      name,
      quality: Math.round(Math.max(20, Math.min(97, 42 + 11 * lp + s.int(-10, 10)))),
      tech: Math.round(Math.max(15, Math.min(98, 38 + 13 * lp + s.int(-12, 12)))),
    })
  }

  // The fictional tail: a few local challengers, more where the real cast is thin.
  const thin = realNow < 4
  const slots = national ? (thin ? d.named : Math.max(3, Math.round(d.named * 0.5))) : thin ? d.named : Math.max(3, Math.round(d.named * 0.3))
  const lo = Math.log(Math.max(1e-4, ratio[0] || 1e-4))
  const hi = Math.log(1.15)
  for (let k = 0; k < slots; k++) {
    const u = s.next()
    let t: number
    if (!d.emerging) t = start + Math.floor(s.next() * 30)
    else {
      const theta = Math.exp(lo + (hi - lo) * ((k + u) / slots))
      t = firstYearAt(theta) + s.int(0, 2)
    }
    let guard = 0
    while (t < HORIZON && guard++ < 60) {
      const tier = s.weighted(tailOdds(t, thin), (x) => x[1])[0]
      const st = tierStats(s, tier, national)
      const exit = t + st.life
      add({ hq: tailHub(s, d, scopeKey), founded: t, exit, pot: st.pot, ramp: st.ramp, tier, legacy: false, fate: fateOf(s, tier, st.life) })
      t = exit + s.int(1, 4)
    }
  }
  let presentPull = 0
  for (const r of rivals) if (!r.legacy) presentPull += r.pot * maturity(r, PRESENT_YEAR) * arcMult(r.arc, PRESENT_YEAR)
  return { rivals, presentPull: Math.max(0.01, presentPull), byId: new Map(rivals.map((r) => [r.id, r])) }
}

/** Size odds of a fictional challenger founded in year `t`: no giants today (the real ones are there), some in the future. */
function tailOdds(t: number, thin: boolean): [RivalTier, number][] {
  if (thin) return TIER_ODDS
  const giant = t > PRESENT_YEAR + 4 ? 0.05 : 0
  return [['giant', giant], ['major', 0.17], ['mid', 0.4], ['small', 0.43 - giant]]
}

function tailHub(s: SRng, d: MarketDef, scopeKey: string): string {
  return pickHub(s, d, scopeKey)
}

const rosterCache = new Map<string, Roster>()

/** The rivals of one market (world: scopeKey 'world'; national: the country id). Cached. */
export function rosterOf(fam: string, industry: string, scopeKey: string): Roster {
  const key = `${fam}|${industry}|${scopeKey}`
  const hit = rosterCache.get(key)
  if (hit) return hit
  const r = generate(fam, industry, scopeKey)
  rosterCache.set(key, r)
  if (rosterCache.size > 160) {
    const first = rosterCache.keys().next().value
    if (first !== undefined) rosterCache.delete(first)
  }
  return r
}

/** Rivals trading in `year` (named, not yet gone). */
export function activeRivals(roster: Roster, year: number): Rival[] {
  return roster.rivals.filter((r) => year >= (r.from ?? r.founded) && year < r.exit)
}

/** How full the field is vs PRESENT_YEAR (rivals founded and grown up), 0.02 - 2. */
export function rosterFill(roster: Roster, year: number): number {
  let pull = 0
  for (const r of roster.rivals) if (!r.legacy && year >= (r.from ?? r.founded) && year < r.exit) pull += r.pot * maturity(r, year) * arcMult(r.arc, year) * futureDrift(r, year)
  return Math.max(0.02, Math.min(2, pull / roster.presentPull))
}

/** The procedural future of a real brand: it drifts up or down by a few percent a year, never vanishes. */
export function futureDrift(r: Pick<Rival, 'drift'>, year: number): number {
  if (!r.drift || year <= PRESENT_YEAR) return 1
  return Math.max(0.35, Math.min(2.5, Math.exp((r.drift * (year - PRESENT_YEAR)) / 10)))
}

/** A rival's raw pull in a year (before network effects and events). */
export function rawPull(d: MarketDef, r: Rival, year: number): number {
  return r.pot * maturity(r, year) * arcMult(r.arc, year) * futureDrift(r, year) * (r.legacy ? legacyFade(d, year) : 1)
}

// ---------------------------------------------------------------------------
// The market without the player: how the rivals' shares evolved on their own (used for a company
// that has just entered, and for saves from before competition existed).

interface Baseline {
  /** year → rival id → share of the whole market. */
  years: Map<number, Map<string, number>>
}

const baseCache = new Map<string, Baseline>()

/** Rivals' shares of the whole market in `year` if the player had never entered it. */
export function baselineShares(fam: string, industry: string, scopeKey: string, year: number): Map<string, number> {
  const key = `${fam}|${industry}|${scopeKey}`
  let b = baseCache.get(key)
  if (!b) {
    b = { years: new Map() }
    baseCache.set(key, b)
    if (baseCache.size > 160) {
      const first = baseCache.keys().next().value
      if (first !== undefined) baseCache.delete(first)
    }
  }
  const hit = b.years.get(year)
  if (hit) return hit
  const d = marketDef(industry)
  const roster = rosterOf(fam, industry, scopeKey)
  // Start from the latest year already known (or fifty years back: older history has washed out).
  let y = year - 50
  let prev = new Map<string, number>()
  for (let k = year - 1; k >= year - 50; k--) {
    const known = b.years.get(k)
    if (known) {
      y = k + 1
      prev = known
      break
    }
  }
  for (; y <= year; y++) {
    const active = activeRivals(roster, y)
    const pulls = active.map((r) => rawPull(d, r, y) * networkPull(prev.get(r.id) ?? 0, d.network * RIVAL_NETWORK))
    const total = pulls.reduce((t, p) => t + p, 0)
    const next = new Map<string, number>()
    if (total > 0) active.forEach((r, i) => next.set(r.id, ((1 - d.fringe) * pulls[i]) / total))
    b.years.set(y, next)
    prev = next
  }
  if (b.years.size > 400) {
    const first = b.years.keys().next().value
    if (first !== undefined && first !== year) b.years.delete(first)
  }
  return prev
}
