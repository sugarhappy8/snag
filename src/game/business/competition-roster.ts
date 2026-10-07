// The rivals: a deterministic cast of fictional competitors for every market (the world for
// tradable industries, one country for local trades), generated from the family's seed so the
// same world keeps the same rivals across heirs, saves and the Time Machine. Rivals are founded
// as their market grows (an AI lab rarely before deep learning), mature over a few years, and
// close, sell out or go bust after a lifespan, when someone new takes their place. Nothing here
// reads or writes game state; results are cached per market.
import { seeded, type SRng } from '../assets'
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
  founded: number
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
export function maturity(r: { founded: number; exit: number; ramp: number }, year: number): number {
  if (year < r.founded || year >= r.exit) return 0
  const age = year - r.founded + 1
  let m = Math.min(1, 0.15 + 0.85 * (1 - Math.exp((-2.5 * age) / Math.max(1, r.ramp))))
  const left = r.exit - year
  if (left <= 3) m *= left / 4
  return m
}

/** Legacy incumbents lose their grip as the market opens up (to a quarter of their old pull). */
export function legacyFade(d: MarketDef, year: number): number {
  const l = d.legacy
  if (!l) return 1
  if (year <= l.fadeFrom) return 1
  if (year >= l.fadeTo) return 0.25
  return 1 - 0.75 * ((year - l.fadeFrom) / Math.max(1, l.fadeTo - l.fadeFrom))
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
  const add = (r: Omit<Rival, 'id' | 'name' | 'quality' | 'tech'>, nameTries = 6): void => {
    let name = ''
    for (let i = 0; i < nameTries && (!name || names.has(name)); i++) name = rivalName(s, industry, d, r.hq)
    // A clash after six tries: the second company of that name sets itself apart.
    if (names.has(name)) name = national ? `New ${name}` : `${name} International`
    if (names.has(name)) return
    names.add(name)
    const lp = Math.log2(1 + r.pot)
    rivals.push({
      ...r,
      id: `r${rivals.length}`,
      name,
      quality: Math.round(Math.max(20, Math.min(97, 42 + 11 * lp + s.int(-10, 10)))),
      tech: Math.round(Math.max(15, Math.min(98, 38 + 13 * lp + s.int(-12, 12)))),
    })
  }

  // State-backed incumbents (launch providers before private spaceflight).
  if (d.legacy) {
    const homes = ['us', 'ru', 'fr', 'cn', 'jp']
    for (let i = 0; i < d.legacy.count; i++) {
      const hq = homes[i % homes.length]
      add({ hq, founded: start + s.int(0, 8), exit: HORIZON + 1, pot: d.legacy.pull / d.legacy.count, ramp: 4, tier: 'giant', legacy: true, fate: 'merged' })
    }
  }

  const lo = Math.log(Math.max(1e-4, ratio[0] || 1e-4))
  const hi = Math.log(1.15)
  for (let k = 0; k < d.named; k++) {
    const u = s.next()
    let t: number
    if (!d.emerging) t = start + Math.floor(s.next() * 30)
    else {
      const theta = Math.exp(lo + (hi - lo) * ((k + u) / d.named))
      t = firstYearAt(theta) + s.int(0, 2)
    }
    let guard = 0
    while (t < HORIZON && guard++ < 60) {
      const tier = s.weighted(TIER_ODDS, (x) => x[1])[0]
      const st = tierStats(s, tier, national)
      const hq = pickHub(s, d, scopeKey)
      const exit = t + st.life
      add({ hq, founded: t, exit, pot: st.pot, ramp: st.ramp, tier, legacy: false, fate: fateOf(s, tier, st.life) })
      t = exit + s.int(1, 4)
    }
  }
  let presentPull = 0
  for (const r of rivals) if (!r.legacy) presentPull += r.pot * maturity(r, PRESENT_YEAR)
  return { rivals, presentPull: Math.max(0.01, presentPull), byId: new Map(rivals.map((r) => [r.id, r])) }
}

const rosterCache = new Map<string, Roster>()

/** The rivals of one market (world: scopeKey 'world'; national: the country id). Cached. */
export function rosterOf(fam: string, industry: string, scopeKey: string): Roster {
  const key = `${fam}|${industry}|${scopeKey}`
  const hit = rosterCache.get(key)
  if (hit) return hit
  const r = generate(fam, industry, scopeKey)
  rosterCache.set(key, r)
  if (rosterCache.size > 48) {
    const first = rosterCache.keys().next().value
    if (first !== undefined) rosterCache.delete(first)
  }
  return r
}

/** Rivals trading in `year` (named, not yet gone). */
export function activeRivals(roster: Roster, year: number): Rival[] {
  return roster.rivals.filter((r) => year >= r.founded && year < r.exit)
}

/** How full the field is vs PRESENT_YEAR (rivals founded and grown up), 0.02 - 2. */
export function rosterFill(roster: Roster, year: number): number {
  let pull = 0
  for (const r of roster.rivals) if (!r.legacy && year >= r.founded && year < r.exit) pull += r.pot * maturity(r, year)
  return Math.max(0.02, Math.min(2, pull / roster.presentPull))
}

/** A rival's raw pull in a year (before network effects and events). */
export function rawPull(d: MarketDef, r: Rival, year: number): number {
  return r.pot * maturity(r, year) * (r.legacy ? legacyFade(d, year) : 1)
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
    if (baseCache.size > 48) {
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
