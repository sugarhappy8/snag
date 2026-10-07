// What the calendar allows: which modern-life features exist yet where the player lives, what a
// home computer of the era is called and costs, and the polite "not yet" reasons the menus show.
// Used by the home computer (computer/*), social media and fame, the game industry, shops and
// assets, love, careers and education. Pure helpers over history/timeline.ts: no RNG, no state.
//
// Engine money is constant PRESENT_YEAR dollars, so an era price here is what the thing cost then
// in today's money (a 1983 home computer: about $2,000 of today's dollars). The money display
// turns that into the money of the year when the player asks for it; never apply priceLevel here.
import { hasTech, PRESENT_YEAR, TECH, techAdoption, techOdds, type TechId } from '../history/timeline'
import type { GameState } from '../types'
import { getCountry } from '../world'

export { PRESENT_YEAR }

// ---------------------------------------------------------------------------
// Gates

/** When something exists: all listed technologies present here, and the year inside [from, until]. */
export interface EraGate {
  tech?: TechId | readonly TechId[]
  /** First calendar year it exists (inclusive). */
  from?: number
  /** Last calendar year it exists (inclusive); later it's a thing of the past. */
  until?: number
}

function techList(gate: EraGate): readonly TechId[] {
  return gate.tech === undefined ? [] : typeof gate.tech === 'string' ? [gate.tech] : gate.tech
}

// Menus ask the same "does X exist here this year" question hundreds of times per render. The
// answer depends only on static country data, so it's memoized (a cache, never game state).
const techHereCache = new Map<string, boolean>()

function techHere(countryId: string, tech: TechId, year: number): boolean {
  const key = `${countryId}|${tech}|${year}`
  let v = techHereCache.get(key)
  if (v === undefined) {
    if (techHereCache.size > 20_000) techHereCache.clear()
    v = techAdoption(countryId, tech, year) >= 0.02
    techHereCache.set(key, v)
  }
  return v
}

/** True when the gate is open in that country and year (pure; for data tables). */
export function eraOpenAt(countryId: string, gate: EraGate | undefined, year: number): boolean {
  if (!gate) return true
  if (gate.from !== undefined && year < gate.from) return false
  if (gate.until !== undefined && year > gate.until) return false
  for (const t of techList(gate)) if (!techHere(countryId, t, year)) return false
  return true
}

/** True when the gate is open for the player this year. */
export function eraOpen(g: GameState, gate: EraGate | undefined, year = g.year): boolean {
  return eraOpenAt(g.character.countryId, gate, year)
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function countryLabel(countryId: string): string {
  const k = getCountry(countryId)
  return k.name || 'your country'
}

/**
 * Why a gated feature isn't available ("Smartphones: not invented yet. It's 1995."), or null when
 * it is. `what` is a noun phrase; the colon keeps the grammar right for singular and plural.
 */
export function eraReason(g: GameState, gate: EraGate | undefined, what: string, year = g.year): string | null {
  if (!gate || eraOpen(g, gate, year)) return null
  const name = capFirst(what)
  if (gate.until !== undefined && year > gate.until) return `${name}: a thing of the past by ${year}.`
  const missing = techList(gate).filter((t) => techAdoption(g.character.countryId, t, year) < 0.02)
  const neverYet = (gate.from !== undefined && year < gate.from) || missing.some((t) => year < TECH[t].invented)
  if (neverYet) return `${name}: not invented yet. It's ${year}.`
  return `${name}: not available in ${countryLabel(g.character.countryId)} yet. It's ${year}.`
}

/** The internet is here (and so web tutorials, online stores, freelance platforms...). */
export function online(g: GameState, year = g.year): boolean {
  return hasTech(g, 'internet', year)
}

// ---------------------------------------------------------------------------
// The home computer by era

/** none: no home computers here yet · micro: 8-bit micros · pc: beige desktops · modern: laptops. */
export type ComputerEra = 'none' | 'micro' | 'pc' | 'modern'

export function computerEra(g: GameState, year = g.year): ComputerEra {
  if (!hasTech(g, 'homeComputer', year)) return 'none'
  if (year < 1988) return 'micro'
  if (year < 2003) return 'pc'
  return 'modern'
}

/** True once a home computer can be bought (or given) where the player lives. */
export function computersExist(g: GameState, year = g.year): boolean {
  return computerEra(g, year) !== 'none'
}

/** Share of families here that have a home computer this year (0-1). */
export function homeComputerOdds(g: GameState, year = g.year): number {
  return techOdds(g, 'homeComputer', year)
}

// Price of a typical new home computer, in today's dollars (real terms), by year. Computers were
// luxury goods in 1980 and again when the first beige PCs with hard drives arrived.
const COMPUTER_USD: readonly [number, number][] = [
  [1977, 6_500],
  [1980, 4_500],
  [1983, 2_200],
  [1986, 1_800],
  [1988, 5_000],
  [1992, 4_400],
  [1996, 3_600],
  [1999, 2_400],
  [2002, 1_900],
  [2006, 1_500],
  [2010, 1_300],
]

/** A typical new home computer in today's dollars for that year (the modern laptop: $1,300). */
export function computerUsd(year: number): number {
  if (year >= 2010) return 1_300
  if (year <= COMPUTER_USD[0][0]) return COMPUTER_USD[0][1]
  for (let i = 1; i < COMPUTER_USD.length; i++) {
    const [y1, v1] = COMPUTER_USD[i]
    if (year <= y1) {
      const [y0, v0] = COMPUTER_USD[i - 1]
      return Math.round(v0 + ((v1 - v0) * (year - y0)) / (y1 - y0))
    }
  }
  return 1_300
}

export interface ComputerModel {
  /** Asset name; always matches computer.ts isComputer (contains computer/PC/laptop/desktop). */
  name: string
  /** Mid-sentence: "a home computer". */
  noun: string
  emoji: string
  /** Today's dollars. */
  usd: number
  /** One line of era color for the gift/purchase notice. */
  flavor: string
}

/** The everyday home computer of the era (the one parents buy, or a kid saves up for). */
export function computerModel(g: GameState, year = g.year): ComputerModel {
  const era = computerEra(g, year)
  const usd = computerUsd(year)
  if (era === 'micro' || era === 'none') {
    return { name: 'Home Computer', noun: 'an 8-bit home computer', emoji: '\u{1F5A5}\u{FE0F}', usd, flavor: 'It plugs into the TV, loads programs from a cassette tape and greets you with a blinking cursor that says READY.' }
  }
  if (era === 'pc') {
    const cd = year >= 1994
    return {
      name: 'Desktop PC',
      noun: cd ? 'a beige multimedia PC' : 'a beige desktop PC',
      emoji: '\u{1F5A5}\u{FE0F}',
      usd,
      flavor: cd ? 'It has a CD-ROM drive, two speakers the size of bricks and a modem that screams like a fax machine in pain.' : 'It has a hard drive with a whole 40 megabytes, a floppy drive and a beige case the size of a suitcase.',
    }
  }
  return { name: 'Laptop', noun: 'a laptop', emoji: '\u{1F4BB}', usd, flavor: '' }
}

/** What the family computer is called when it lives in the den and everyone shares it. */
export function familyComputerName(g: GameState, year = g.year): string {
  const era = computerEra(g, year)
  return era === 'modern' ? 'Family Computer' : era === 'pc' ? 'Family Desktop PC' : 'Family Home Computer'
}

/** "the classified ads in the Chicago paper" before the internet, "the Chicago Buy & Sell board" after. */
export function classifiedsName(g: GameState, year = g.year): string {
  return online(g, year) && year >= 2000 ? `the ${g.character.city} Buy & Sell board` : `the classified ads in the ${g.character.city} paper`
}

/** Activities › Computer explanation when you have no computer ('' = nothing to add). */
export function noComputerText(g: GameState, year = g.year): string {
  const era = computerEra(g, year)
  if (era === 'none') {
    // Worded without "computer": before home computers the word itself was rare (and the
    // anachronism lint in events/era.ts is right to flag it).
    return year < 1975
      ? `It's ${year}. The only calculating machines fill whole rooms at universities and banks. Nobody has one at home.`
      : `Home computing hasn't reached ${countryLabel(g.character.countryId)} yet. The few machines that exist are in offices and universities.`
  }
  if (era === 'micro') return "You don't have a computer. Home computers are new, pricey and rare: ask your parents, or save up for one at the Electronics Store (Activities › Shopping)."
  if (era === 'pc') return "You don't have a computer. A desktop PC costs a small fortune: ask your parents, or save up for one at the Electronics Store (Activities › Shopping)."
  return "You don't have a computer. Buy a laptop or gaming PC at the Electronics Store (Activities › Shopping)."
}

/** Menu subtitle for Activities › Computer when you don't own one. */
export function noComputerSubtitle(g: GameState, year = g.year): string {
  const era = computerEra(g, year)
  if (era === 'none') return 'Not invented yet'
  if (era === 'modern') return 'Get a laptop or gaming PC to unlock'
  return 'Get a home computer to unlock'
}

// ---------------------------------------------------------------------------
// Feature gates shared across modules

/** Social networks (any platform at all). */
export const SOCIAL_GATE: EraGate = { tech: 'socialMedia' }
/** Online video sites. */
export const VIDEO_GATE: EraGate = { tech: 'videoSharing' }
/** Phone apps and app stores. */
export const APPS_GATE: EraGate = { tech: 'smartphone' }
/** Web pages anyone can make. */
export const WEB_GATE: EraGate = { tech: 'internet', from: 1993 }
/** Online stores and payments. */
export const SHOP_GATE: EraGate = { tech: ['internet', 'onlineShopping'], from: 1996 }
/** Software sold as a subscription over the web. */
export const SAAS_GATE: EraGate = { tech: 'internet', from: 2000 }
/** Online freelancing marketplaces. */
export const FREELANCE_GATE: EraGate = { tech: 'internet', from: 2000 }
/** Online stock and options trading. */
export const BROKERAGE_GATE: EraGate = { tech: 'onlineBrokerage' }
/** Same-day expiring options. */
export const ZERO_DTE_GATE: EraGate = { tech: 'onlineBrokerage', from: 2016 }
/** Cryptocurrency and meme coins. */
export const CRYPTO_GATE: EraGate = { tech: 'crypto' }
/** Swipe-to-match dating apps. */
export const DATING_APP_GATE: EraGate = { tech: 'datingApps' }
/** Dating websites (before the apps). */
export const DATING_SITE_GATE: EraGate = { tech: 'internet', from: 1995 }
/** Pro gaming with paid players and leagues. */
export const ESPORTS_GATE: EraGate = { tech: 'esports' }
/** Coding bootcamps (twelve weeks to "developer"). */
export const BOOTCAMP_GATE: EraGate = { tech: 'internet', from: 2012 }
/** Online courses with certificates. */
export const ONLINE_COURSE_GATE: EraGate = { tech: 'internet', from: 2000 }
/** Podcasts. */
export const PODCAST_GATE: EraGate = { tech: 'internet', from: 2005 }
/** Livestreaming platforms. */
export const STREAMING_GATE: EraGate = { tech: 'videoSharing', from: 2011 }
