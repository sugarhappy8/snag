// R3-H4 (H.2): the sources of knowledge. Every way to sharpen a hidden number is one row of SOURCES: what it reads, what it costs, how
// sharp it can ever be, whether it is legal and whether it exists yet. buyIntel and takeReading (intel.ts) are the only readers.
//
//   floor    no source reads sharper than its floor, whatever the spend, the provider or the talent: press 20%, report 12%, analyst 8%,
//            diligence 3%. The floor is what makes research a purchase and not a cheat: a second read of the same source in a year is
//            refused, so nothing averages the noise away, and a fresh source only helps through its own, independent draw.
//   price    follows the SCOPE of the keys (a street or the world: tier 1 to 3, how many countries, how big a deal) and the wealth of the
//            country read, never the buyer's cash. A hundred times the money pays the same fee. Constant dollars, like every amount.
//   reads    the kinds of key a source can speak about; a report cannot tell you what a candidate can do.
//   era      a hacker needs the internet; a research trade needs a decade to exist.
//   heat     the two illegal sources add heat (risk.ts): a yearly hazard, no minigame.
//
// A purchased reading is the truth plus a hashed draw of the sd readingSd gives (intel.ts), so the band the player sees holds the truth
// about 80% of the time, whichever source made it.
import { hasTech } from '../history/timeline'
import { getCountry } from '../world'
import type { GameState } from '../types'

export type SourceId = 'own' | 'news' | 'press' | 'report' | 'analyst' | 'diligence' | 'investigator' | 'informant' | 'hacker' | 'desk' | 'lab'
export type SourceKind = 'free' | 'sub' | 'once' | 'engage' | 'deal' | 'illegal' | 'standing'

/** How big the thing read is. The owner of a key kind says (kinds.ts); a key with no scope is a tier 1 read in the player's country. */
export interface Scope {
  /** 1 a business or a street, 2 a country, 3 the world. */
  tier: 1 | 2 | 3
  /** The country read: its wealth prices the source. */
  country?: string
  /** How many countries the thing spans (1 to MAX_COUNTRIES). */
  countries?: number
  /** The size of the deal, for diligence (the greater of 8,000 x wealth and 2% of it). */
  deal?: number
}

export interface SourceDef {
  id: SourceId
  kind: SourceKind
  /** What a menu calls it. */
  label: string
  /** The relative sd at ordinary quality and spend. */
  base: number
  /** Never sharper than this. */
  floor: number
  /** Dollars at tier 1, one country, wealth 1 (constant dollars). 0 for the free sources. */
  price: number
  /** The kinds it can read, or 'any'. */
  reads: readonly string[] | 'any'
  /** Heat added by a purchase (risk.ts). */
  heat: number
  /** A player can walk up to it. False for the news, the lab (research results only) and the desk (standing orders only). */
  buyable: boolean
  /** The first year it exists, and the technology it needs where the character lives. */
  since?: number
  tech?: 'internet'
}

const PUBLIC = ['mkt', 'riv', 'cmp', 'eco', 'pol', 'sec', 'scn'] as const
const ANALYST = ['mkt', 'riv', 'cmp', 'val', 'sec', 'fund', 'scn', 'odds'] as const

const row = (d: SourceDef): SourceDef => Object.freeze({ ...d, reads: d.reads === 'any' ? 'any' : Object.freeze([...d.reads]) })

/** The table. `own` is the player's own homework: its base is for smarts 50 and it takes a year action, not money. */
export const SOURCES: Readonly<Record<SourceId, SourceDef>> = Object.freeze({
  own: row({ id: 'own', kind: 'free', label: 'Do the homework yourself', base: 0.45, floor: 0.25, price: 0, reads: ['mkt', 'riv', 'cmp', 'eco', 'pol', 'sec', 'fund', 'odds', 'scn'], heat: 0, buyable: true }),
  news: row({ id: 'news', kind: 'free', label: 'The news', base: 0.3, floor: 0.2, price: 0, reads: 'any', heat: 0, buyable: false }),
  press: row({ id: 'press', kind: 'sub', label: 'A year of the trade press', base: 0.3, floor: 0.2, price: 1_200, reads: PUBLIC, heat: 0, buyable: true }),
  report: row({ id: 'report', kind: 'once', label: 'A market report', base: 0.18, floor: 0.12, price: 9_000, reads: ['mkt', 'riv', 'cmp', 'eco', 'scn', 'odds'], heat: 0, buyable: true, since: 1930 }),
  analyst: row({ id: 'analyst', kind: 'engage', label: 'An analyst', base: 0.12, floor: 0.08, price: 30_000, reads: ANALYST, heat: 0, buyable: true, since: 1920 }),
  diligence: row({ id: 'diligence', kind: 'deal', label: 'Due diligence', base: 0.05, floor: 0.03, price: 8_000, reads: ['val', 'cmp', 'cand'], heat: 0, buyable: true }),
  investigator: row({ id: 'investigator', kind: 'once', label: 'A private investigator', base: 0.14, floor: 0.1, price: 15_000, reads: ['riv', 'cand', 'ppl'], heat: 0, buyable: true }),
  informant: row({ id: 'informant', kind: 'illegal', label: 'An informant on the inside', base: 0.1, floor: 0.07, price: 6_000, reads: ['riv', 'cmp', 'mkt'], heat: 3, buyable: true }),
  hacker: row({ id: 'hacker', kind: 'illegal', label: 'A hacker for hire', base: 0.07, floor: 0.05, price: 20_000, reads: ['riv', 'cmp', 'val', 'cand'], heat: 6, buyable: true, tech: 'internet' }),
  desk: row({ id: 'desk', kind: 'standing', label: 'An analyst desk on retainer', base: 0.14, floor: 0.1, price: 0, reads: ANALYST, heat: 0, buyable: false, since: 1920 }),
  lab: row({ id: 'lab', kind: 'free', label: 'Your own research', base: 0.2, floor: 0.15, price: 0, reads: ['riv', 'mkt', 'cmp'], heat: 0, buyable: false }),
})

export const SOURCE_IDS: readonly SourceId[] = Object.freeze(Object.keys(SOURCES) as SourceId[])

export const isSourceId = (v: unknown): v is SourceId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, v)

/** The most countries a scope counts. Past this a thing is simply the world. */
export const MAX_COUNTRIES = 8
const TIER_MULT = [1, 2.2, 4.5] as const
const COUNTRY_STEP = 0.25
const WEALTH_LO = 0.3
const WEALTH_HI = 1.5
/** The desk costs this much of an analyst's fee for the same scope. */
const DESK_SHARE = 0.6
/** The diligence rule, as ddCost has it (business/fund-vc.ts): the greater of this x wealth and 2% of the deal. */
const DD_BASE = 8_000
const DD_SHARE = 0.02

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const round100 = (v: number): number => Math.round(v / 100) * 100

/** The wealth that prices a read in `country` (an unknown id reads as the first country of the table): world.ts wealth held to .3 to 1.5. */
export function wealthOf(country: string | undefined): number {
  return clamp(finite(getCountry(country ?? 'us').wealth, 1), WEALTH_LO, WEALTH_HI)
}

/**
 * What a source charges for a scope, in whole dollars. A function of the scope and the country read, never of the buyer: a hundred
 * times the cash pays the same, and so does a hundred times the wealth of the world (the wealth term stops at 1.5). `fallback` is the
 * country of the scope when it names none.
 *
 *   price = round100(base x [1, 2.2, 4.5][tier - 1] x (1 + .25 (countries - 1)) x clamp(country wealth, .3, 1.5))
 *   diligence: the greater of 8,000 x wealth and 2% of the deal, to the nearest 1,000 (no tier, no countries)
 *   desk: .6 of the analyst's fee for the same scope. The free sources cost nothing.
 */
export function priceOf(src: SourceId, scope: Scope, fallback = 'us'): number {
  const def = SOURCES[src]
  if (!def || def.kind === 'free') return 0
  const wealth = wealthOf(scope.country ?? fallback)
  if (src === 'diligence') {
    const deal = Math.max(0, finite(scope.deal, 0))
    return Math.round(Math.max(DD_BASE * wealth, deal * DD_SHARE) / 1000) * 1000
  }
  if (src === 'desk') return round100(DESK_SHARE * priceOf('analyst', scope, fallback))
  const tier = clamp(Math.round(finite(scope.tier, 1)), 1, 3)
  const countries = clamp(Math.round(finite(scope.countries, 1)), 1, MAX_COUNTRIES)
  return round100(def.price * TIER_MULT[tier - 1]! * (1 + COUNTRY_STEP * (countries - 1)) * wealth)
}

export interface SdOpts {
  /** The provider's quality, 0 to 1: .5 is an ordinary one. For `own`, the character's smarts over 100. */
  quality?: number
  /** What was spent, against `ref` (what the ordinary read costs). */
  spend?: number
  ref?: number
  /** The key is one the character's talent sharpens: x.8. */
  talent?: boolean
}

const SPEND_EXP = -0.35
const TALENT_SOURCE = 0.8

/** A usable positive number, else the fallback (a NaN, a negative or an infinite one is not a spend). */
const positive = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback)

/**
 * The relative sd of a purchased reading: base x (1.5 - quality) x (spend / ref)^-.35, x.8 on a talent key, never below the floor.
 * A hundred times the spend is 100^-.35 = .2 of the sd, which any source's floor catches.
 */
export function readingSd(src: SourceId, o: SdOpts = {}): number {
  const def = SOURCES[src]
  const quality = clamp(typeof o.quality === 'number' && Number.isFinite(o.quality) ? o.quality : 0.5, 0, 1)
  const ratio = positive(o.spend, 1) / positive(o.ref, 1)
  const sd = def.base * (1.5 - quality) * Math.pow(clamp(ratio, 1e-6, 1e6), SPEND_EXP) * (o.talent ? TALENT_SOURCE : 1)
  return Math.max(def.floor, sd)
}

/** Whether a source can speak about a kind of key. No source reads a `hint` key: those carry no unit of their own and are fogged by talent alone. */
export function reads(src: SourceId, kind: string): boolean {
  const def = SOURCES[src]
  if (!def || kind === 'hint') return false
  return def.reads === 'any' || def.reads.includes(kind)
}

/**
 * Why a source does not exist for this life now (a plain sentence for a button), or null when it does. The news and the lab are never
 * blocked; a hacker needs the internet where the character lives; the research trades need their decade.
 */
export function eraBlock(g: GameState, src: SourceId): string | null {
  const def = SOURCES[src]
  if (!def) return 'No one sells that.'
  if (def.since !== undefined && g.year < def.since) return 'No one sells that yet.'
  if (def.tech !== undefined && !hasTech(g, def.tech)) return 'There is no one to hire for that yet.'
  return null
}
