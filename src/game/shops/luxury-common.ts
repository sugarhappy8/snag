// Shared helpers for the Luxury Lifestyle (shops/luxury*.ts): the $5M gate, plain-JSON state in
// g.flags, local price levels, celebrity encounters and the yearly popup budget.
import { localGoodsMult, nicePrice, salesTaxLabel } from '../assets'
import {
  addRelationship,
  attractedTo,
  count,
  currentPartner,
  formatMoney,
  inPrison,
  log,
  netWorth,
  notice,
  pronouns,
  remember,
  scriptChoice,
} from '../core'
import { localMarket } from '../data/markets'
import { createPerson, notePerson } from '../people'
import { bell, chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, GameState, Gender, Json, Person } from '../types'
import { randomFirstName, randomLastName } from '../world'

/** Net worth that opens the Luxury Lifestyle (BitLife's "very wealthy" tier). */
export const LUXURY_NET_WORTH = 5_000_000

// ---------------------------------------------------------------------------
// Plain-JSON readers

export function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function obj(v: Json | undefined): Record<string, Json> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

export function strList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function toJson(x: unknown): Json {
  return JSON.parse(JSON.stringify(x)) as Json
}

/** A field of a choice/input modal's data object. */
export function field<T extends Json>(data: Json | undefined, key: string): T | null {
  const o = obj(data)
  if (!o) return null
  const v = o[key]
  return v === undefined || v === null ? null : (v as T)
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Clean a player-typed name (yacht, island): letters, digits, a little punctuation, 28 chars. */
export function cleanName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{M}\p{N}' .&-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28)
    .trim()
  return cleaned || fallback
}

// ---------------------------------------------------------------------------
// Gates

/** Why the player can't do luxury things at all (dead, in prison, a minor). */
export function luxuryBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return "You're dead. Your yacht has already been sold to a crypto founder."
  if (inPrison(g)) return "You can't do that from prison. The warden doesn't take bottle service orders."
  if (c.age < 18) return 'The Luxury Lifestyle is for adults. Ask again when you can sign a yacht contract.'
  return null
}

/** How much more net worth the player needs to reach the $5M tier (0 once there). */
export function luxuryShortfall(g: GameState): number {
  return Math.max(0, LUXURY_NET_WORTH - netWorth(g))
}

/** The net-worth lock, with how much more the player needs. */
export function wealthLock(g: GameState): string | null {
  const short = luxuryShortfall(g)
  if (short <= 0) return null
  const worth = netWorth(g)
  const now = worth < 0 ? `you're ${formatMoney(-worth)} in the hole` : `your net worth is ${formatMoney(worth)}`
  return `The Luxury Lifestyle opens at a net worth of ${formatMoney(LUXURY_NET_WORTH)}, and ${now}. You need ${formatMoney(short)} more.`
}

/** Block or wealth lock: why the player can't buy into the luxury tier right now. */
export function luxuryReason(g: GameState): string | null {
  return luxuryBlock(g) ?? wealthLock(g)
}

// ---------------------------------------------------------------------------
// Local price levels

/** Local labor cost vs the US (1), clamped to something sane. */
export function laborMult(g: GameState): number {
  const m = localMarket(g).laborCost
  return Number.isFinite(m) && m > 0 ? Math.min(2.5, Math.max(0.05, m)) : 1
}

/** Pampering and personal services: imported products, local hands. */
export function serviceMult(g: GameState): number {
  return Math.min(2.2, Math.max(0.25, 0.3 + 0.7 * laborMult(g)))
}

/** Designer goods, gala tickets, wedding gifts: the local luxury price level (duties included). */
export function luxuryMult(g: GameState): number {
  return localGoodsMult(g, 'luxury')
}

/** Champagne and bottle service: the local alcohol price level (sin taxes included). */
export function alcoholMult(g: GameState): number {
  return localGoodsMult(g, 'alcohol')
}

/** A local price for something that costs `usd` in the US, rounded to a shop-looking number. */
export function localized(usd: number, mult: number): number {
  const p = usd * (Number.isFinite(mult) && mult > 0 ? mult : 1)
  return Math.max(1, nicePrice(p))
}

/** "Prices include 20% VAT." or '' where there's no consumption tax. */
export function taxLine(g: GameState): string {
  const label = salesTaxLabel(g)
  return label ? `Prices include ${label}.` : ''
}

export function cantAfford(g: GameState, price: number, what: string): void {
  notice(
    g,
    'Insufficient Funds',
    pick(g, [
      `${capitalize(what)} costs ${formatMoney(price)} and you have ${formatMoney(Math.max(0, g.character.money))}. Even rich people have limits.`,
      `Your private banker called. ${capitalize(what)} costs ${formatMoney(price)}, and the answer is no.`,
      `You can't afford ${what} (${formatMoney(price)}). The concierge pretended not to notice.`,
    ]),
    { emoji: '\u{1F4B8}', tone: 'bad' },
  )
}

// ---------------------------------------------------------------------------
// Luxury assets

export type LuxuryKind = 'island' | 'megayacht' | 'jet'

export function luxuryKind(a: Asset): LuxuryKind | null {
  const k = a.details.luxury
  if (k === 'island' && a.kind === 'house') return 'island'
  if (k === 'megayacht' && a.kind === 'boat') return 'megayacht'
  if (k === 'jet' && a.kind === 'aircraft') return 'jet'
  return null
}

export function luxuryAssets(g: GameState, kind?: LuxuryKind): Asset[] {
  return g.assets.filter((a) => {
    const k = luxuryKind(a)
    return k !== null && (!kind || k === kind)
  })
}

export function findLuxuryAsset(g: GameState, id: string): Asset | undefined {
  return g.assets.find((a) => a.id === id && luxuryKind(a) !== null)
}

/** Listings bought this year, so they disappear from the shop (`<year>:` prefixed ids). */
export function isListingBought(g: GameState, id: string): boolean {
  return strList(g.flags['luxury.bought']).includes(id)
}

export function markListingBought(g: GameState, id: string): void {
  const prefix = `${g.year}:`
  g.flags['luxury.bought'] = [...strList(g.flags['luxury.bought']).filter((x) => x.startsWith(prefix)), id]
}

// ---------------------------------------------------------------------------
// Yearly popup budget: the luxury yearly hook shows about one popup a year.

export interface PopupBudget {
  left: number
}

/** Use a popup slot. Mandatory notices (you got expelled, staff quit) always show. */
export function takePopup(b: PopupBudget, mandatory = false): boolean {
  if (b.left > 0 || mandatory) {
    b.left -= 1
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Celebrities

const CELEB_COUNTRIES = ['us', 'us', 'gb', 'fr', 'it', 'es', 'br', 'kr', 'jp', 'in', 'ng', 'mx', 'au', 'ca', 'de', 'se', 'za', 'ae']

export const CELEB_JOBS = [
  'Movie Star',
  'Pop Star',
  'Rapper',
  'Supermodel',
  'Pro Athlete',
  'Reality TV Star',
  'Tech Billionaire',
  'Fashion Designer',
  'Film Director',
  'Celebrity Chef',
  'Talk Show Host',
  'Rock Legend',
]

export interface CelebSpec {
  firstName: string
  lastName: string
  gender: Gender
  age: number
  occupation: string
  countryId: string
}

/** Can the player start dating a stranger they just met (single adult, not already taken)? */
export function canRomanceNow(g: GameState): boolean {
  const c = g.character
  return c.alive && c.age >= 18 && !inPrison(g) && !currentPartner(g)
}

/** Roll a fictional celebrity (not added to g.people yet). */
export function rollCeleb(g: GameState, occupation?: string, romantic = false): CelebSpec {
  const c = g.character
  const countryId = chance(g, 0.45) ? c.countryId : pick(g, CELEB_COUNTRIES)
  let gender: Gender = chance(g, 0.5) ? 'male' : 'female'
  if (romantic) {
    if (c.sexuality === 'gay') gender = c.gender
    else if (c.sexuality === 'straight') gender = c.gender === 'male' ? 'female' : 'male'
  }
  const age = romantic ? Math.max(18, Math.min(90, c.age + randInt(g, -8, 6))) : Math.max(18, Math.min(95, c.age + randInt(g, -20, 20)))
  return {
    firstName: randomFirstName(g, countryId, gender),
    lastName: randomLastName(g, countryId),
    gender,
    age,
    occupation: occupation ?? pick(g, CELEB_JOBS),
    countryId,
  }
}

/** Add a celebrity to the player's life as a friend. */
export function befriendCeleb(g: GameState, spec: CelebSpec, metAt: string): Person {
  const p = createPerson(g, {
    relation: 'friend',
    age: spec.age,
    gender: spec.gender,
    firstName: spec.firstName,
    lastName: spec.lastName,
    countryId: spec.countryId,
    occupation: spec.occupation,
    money: randInt(g, 5, 400) * 1_000_000,
    relationship: randInt(g, 45, 70),
    stats: { looks: bell(g, 60, 100) },
    data: { celebrity: true, metAt },
  })
  notePerson(p, `Met the player at ${metAt}.`)
  count(g, 'celebFriends')
  return p
}

const ROMANCE = defineScript('luxury.celebRomance', (g, choice, data) => {
  const spec = obj(field(data, 'celeb')) as unknown as CelebSpec | null
  const metAt = field<string>(data, 'metAt') ?? 'a VIP event'
  if (!spec || typeof spec.firstName !== 'string') return
  const name = `${spec.firstName} ${spec.lastName}`
  const { he, him, He } = pronouns(spec.gender === 'male' ? 'male' : 'female')
  if (choice === 'friends') {
    befriendCeleb(g, spec, metAt)
    log(g, `I became friends with the ${spec.occupation.toLowerCase()} ${name}.`, 'good')
    notice(g, 'New Famous Friend', `You and ${name} swapped numbers. ${He} already sent you a voice memo that's eleven minutes long.`, { emoji: '\u{2B50}', tone: 'good' })
    return
  }
  const c = g.character
  if (!canRomanceNow(g) || !attractedTo(c, spec.gender)) {
    befriendCeleb(g, spec, metAt)
    notice(g, 'Just Friends', `You and ${name} decided to stay friends.`, { emoji: '\u{1F91D}' })
    return
  }
  const odds = Math.min(0.85, Math.max(0.15, 0.3 + (c.stats.looks - 50) / 150 + c.hidden.fame / 250 + (c.money >= 50_000_000 ? 0.1 : 0)))
  if (!chance(g, odds)) {
    log(g, `I asked out ${name} and got turned down.`, 'bad')
    notice(g, 'Rejected', pick(g, [`${name} laughed, said "you're sweet," and walked away to find ${pronouns(spec.gender).his} publicist.`, `${name} said ${he} doesn't date outside the industry. Ouch.`, `${name}'s manager stepped in and said ${he} isn't taking new relationships this quarter.`]), { emoji: '\u{1F494}', tone: 'bad' })
    return
  }
  const p = createPerson(g, {
    relation: 'partner',
    age: spec.age,
    gender: spec.gender,
    firstName: spec.firstName,
    lastName: spec.lastName,
    countryId: spec.countryId,
    occupation: spec.occupation,
    money: randInt(g, 5, 400) * 1_000_000,
    relationship: randInt(g, 60, 80),
    stats: { looks: bell(g, 65, 100) },
    data: { celebrity: true, metAt, datingSince: c.age },
  })
  addRelationship(p, 0)
  notePerson(p, `Started dating the player at age ${c.age} after meeting at ${metAt}.`)
  count(g, 'partners')
  log(g, `I started dating the ${spec.occupation.toLowerCase()} ${name}.`, 'good')
  remember(g, `Started dating the celebrity ${name} (${spec.occupation}) after meeting at ${metAt}.`)
  notice(g, 'Power Couple', `You asked ${name} out and ${he} said yes! The tabloids already have a couple name for you two. Paparazzi followed ${him} home and now they follow you too.`, { emoji: '\u{1F496}', tone: 'good' })
})

/**
 * The player met a celebrity: a popup offering friendship (and a date, when the player is
 * single, an adult and attracted to them). Returns the celebrity's display name.
 */
export function meetCeleb(g: GameState, spec: CelebSpec, metAt: string, intro: string): string {
  const name = `${spec.firstName} ${spec.lastName}`
  const romanceOk = canRomanceNow(g) && attractedTo(g.character, spec.gender) && Math.abs(spec.age - g.character.age) <= 15
  if (!romanceOk) {
    befriendCeleb(g, spec, metAt)
    log(g, `I befriended the ${spec.occupation.toLowerCase()} ${name} at ${metAt}.`, 'good')
    notice(g, 'Famous Friend', `${intro} You and ${name} (${spec.occupation.toLowerCase()}) hit it off and swapped numbers.`, { emoji: '\u{2B50}', tone: 'good' })
    return name
  }
  scriptChoice(
    g,
    ROMANCE,
    'Sparks Fly',
    `${intro} You and ${name}, the ${spec.occupation.toLowerCase()}, couldn't stop talking all night. There's definitely something there.`,
    [
      { id: 'ask', label: `Ask ${spec.firstName} out`, emoji: '\u{1F496}' },
      { id: 'friends', label: 'Just be friends', emoji: '\u{1F91D}' },
    ],
    { emoji: '\u{2728}', data: { celeb: toJson(spec), metAt } },
  )
  return name
}
