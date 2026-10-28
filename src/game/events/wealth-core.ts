// Being rich, felt: the wealth model behind money requests (events/wealth*.ts) and the person
// menus' Money section. Who counts as rich here and now, what things cost locally, and the money
// ties between the player and each person (allowance, loans, gifts, a spoiled kid).
//
// "Rich" is relative: the player's net worth divided by a typical yearly income where they live,
// in their era (engine money is constant 2026 dollars, so a typical 1950 income is smaller in
// real terms). $2M is rich in Nigeria and comfortable in the US.
//
// Per-person state lives in Person.data (plain JSON):
//   data.w            the player's money ties with this person (WealthTies), stamped with the
//                     character id: an heir inherits the people but not their parent's allowances,
//                     loans or ask history (readTies returns a blank record for another payer).
//   data.entitlement  0-100, how spoiled this person is (stays with them across generations); the
//                     'spoiled' trait pill shows at ENTITLED_AT and above.
import { addRelationship, clamp, formatMoney, netWorth, relationLabel, shortMoney } from '../core'
import { carPriceMult, goodsMult, housingMult, localGoodsMult, nicePrice } from '../assets'
import { marketOf } from '../data/markets'
import { realWealthFactor } from '../history/events-people'
import { countryWealth, typicalIncome } from '../world/typical-income'
import type { GameState, Json, Person, RelationKind } from '../types'
import { syncLegacy } from '../world/edge-step'
import { memoryOdds } from '../world/edge-odds'
import { socialOn } from '../world/social'

// ---------------------------------------------------------------------------
// Wealth tiers

// The typical income lives in the world layer (world/typical-income.ts) so society/ can use it without reaching into events/;
// these three names stay importable from here.
export { US_TYPICAL_INCOME, countryWealth, typicalIncome } from '../world/typical-income'

/** Net worth / typical income at which each tier starts: comfortable, rich, very rich, ultra rich. */
export const TIER_AT: readonly number[] = [25, 80, 400, 4_000]

export const TIER_NAMES = ['ordinary', 'comfortable', 'rich', 'very rich', 'ultra rich'] as const

/** Most money popups the wealth system shows in one year, by tier (prison: one letter at most). */
export const TIER_POPUP_CAP: readonly number[] = [0, 1, 2, 3, 3]

/** The hard cap on wealth popups in a year, whatever the tier. */
export const WEALTH_POPUP_CAP = 3

/** Expected requests a year by tier, before the cap. */
export const TIER_RATE: readonly number[] = [0, 0.75, 1.5, 2.3, 3]

/** How much bigger open-ended asks (loans, gifts, pitches) get with each tier. */
export const TIER_MULT: readonly number[] = [1, 1, 2.2, 5, 12]

/** Entitlement at which someone shows the 'spoiled' trait. */
export const ENTITLED_AT = 60

/**
 * How much richer you look than you are because of what you flash: the watch at the party, the
 * supercar at school, the yacht on social media (shops/luxury-family.ts). Fades by half a year,
 * never more than +35%.
 */
export function showOffHeat(g: GameState): number {
  const h = g.flags['lux.heat']
  return typeof h === 'number' && Number.isFinite(h) ? Math.min(0.35, Math.max(0, h)) : 0
}

/** What people around you think you're worth (net worth plus what your show-offs add, never negative). */
export function perceivedWealth(g: GameState): number {
  const n = netWorth(g)
  return Number.isFinite(n) ? Math.max(0, n) * (1 + showOffHeat(g)) : 0
}

/** Net worth in years of a typical local income. */
export function wealthRatio(g: GameState): number {
  return perceivedWealth(g) / typicalIncome(g)
}

/** 0 ordinary, 1 comfortable, 2 rich, 3 very rich, 4 ultra rich. */
export function wealthTier(g: GameState): number {
  const r = wealthRatio(g)
  let t = 0
  for (let i = 0; i < TIER_AT.length; i++) if (r >= TIER_AT[i]) t = i + 1
  return t
}

export function tierName(t: number): string {
  return TIER_NAMES[Math.max(0, Math.min(TIER_NAMES.length - 1, t))]
}

/** Money display for this module (always formatMoney: local currency, era prices). */
export function money(n: number): string {
  return formatMoney(n)
}

export function short(n: number): string {
  return shortMoney(n)
}

// ---------------------------------------------------------------------------
// People

const KID_RELATIONS: RelationKind[] = ['child', 'stepchild']
const PARENT_RELATIONS: RelationKind[] = ['parent', 'stepparent']
const SIBLING_RELATIONS: RelationKind[] = ['sibling', 'halfSibling', 'stepsibling']
const PARTNER_RELATIONS: RelationKind[] = ['partner', 'fiance', 'spouse']
const FRIEND_RELATIONS: RelationKind[] = ['friend', 'bestFriend']

export function isKid(p: Person): boolean {
  return KID_RELATIONS.includes(p.relation)
}

/** Kids and grandkids: the people a parent can spoil. */
export function isDescendant(p: Person): boolean {
  return isKid(p) || p.relation === 'grandchild'
}

export function isParent(p: Person): boolean {
  return PARENT_RELATIONS.includes(p.relation)
}

export function isSibling(p: Person): boolean {
  return SIBLING_RELATIONS.includes(p.relation)
}

export function isPartner(p: Person): boolean {
  return PARTNER_RELATIONS.includes(p.relation)
}

export function isFriend(p: Person): boolean {
  return FRIEND_RELATIONS.includes(p.relation)
}

/** Family and friends the money system deals with (no coworkers, exes, enemies or pets). */
export function inMoneyCircle(p: Person): boolean {
  return isDescendant(p) || isParent(p) || isSibling(p) || isPartner(p) || isFriend(p) || p.relation === 'grandparent'
}

/** The country a person lives in (family left behind after emigrating keep their own). */
export function personCountry(g: GameState, p: Person): string {
  const cid = p.data.countryId
  return typeof cid === 'string' && cid ? cid : g.character.countryId
}

export function isAbroad(g: GameState, p: Person): boolean {
  return personCountry(g, p) !== g.character.countryId
}

export function traitIn(p: Person, ...traits: string[]): boolean {
  return p.traits.some((t) => traits.includes(t))
}

/** "your son Liam" (lower case relation, like the rest of the relationships module). */
export function yourOf(p: Person): string {
  return `your ${relationLabel(p).toLowerCase()} ${p.firstName}`
}

/** "my son Liam" */
export function myOf(p: Person): string {
  return `my ${relationLabel(p).toLowerCase()} ${p.firstName}`
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ---------------------------------------------------------------------------
// Per-person money ties (Person.data.w)

export type Answer = 'yes' | 'less' | 'lend' | 'no' | 'bound'

export interface AskRecord {
  /** Calendar year. */
  y: number
  /** Short noun phrase: 'a car', 'a loan for the restaurant'. */
  what: string
  ans: Answer
  amt: number
}

export interface WealthTies {
  /** Character id of the player these ties belong to. */
  by: string
  /** Yearly allowance / support the player pays automatically (0 = none). */
  allowance: number
  /** Years in a row the allowance couldn't be paid. */
  missed: number
  /** True once the player decided to keep paying after the kid turned 18. */
  adultOk: boolean
  /** Outstanding loan from the player. */
  owes: number
  /** Year the oldest unpaid part of the loan was lent. */
  owesSince: number
  /** Lifetime money given (gifts, allowances, items). */
  given: number
  /** Requests answered yes / no (fair parenting is a mix). */
  yes: number
  no: number
  /** Last year this person asked for money. */
  asked: number
  /** No more asks from them until this year (the player set boundaries). */
  bound: number
  /** Years of notable things by key ('ask.kid.car', 'gift.house', 'crash'...). */
  marks: Record<string, number>
  /** The car the player bought them: a price and a label, until they crash or outgrow it. */
  car: { label: string; price: number; year: number } | null
  /** The last few asks (newest last). */
  history: AskRecord[]
}

function num(v: Json | undefined, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

function blankTies(by: string): WealthTies {
  return { by, allowance: 0, missed: 0, adultOk: false, owes: 0, owesSince: 0, given: 0, yes: 0, no: 0, asked: 0, bound: 0, marks: {}, car: null, history: [] }
}

/** This player's money ties with a person (a blank record when there are none, or they're an older generation's). */
export function readTies(g: GameState, p: Person): WealthTies {
  const raw = p.data.w
  const by = g.character.id
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.by !== by) return blankTies(by)
  const marks: Record<string, number> = {}
  if (raw.marks && typeof raw.marks === 'object' && !Array.isArray(raw.marks)) {
    for (const [k, v] of Object.entries(raw.marks)) if (typeof v === 'number' && Number.isFinite(v)) marks[k] = v
  }
  let car: WealthTies['car'] = null
  const rc = raw.car
  if (rc && typeof rc === 'object' && !Array.isArray(rc) && typeof rc.label === 'string') car = { label: rc.label, price: Math.max(0, num(rc.price)), year: num(rc.year) }
  const history: AskRecord[] = []
  if (Array.isArray(raw.history)) {
    for (const h of raw.history) {
      if (!h || typeof h !== 'object' || Array.isArray(h)) continue
      const ans = h.ans
      if (typeof h.what !== 'string' || (ans !== 'yes' && ans !== 'less' && ans !== 'lend' && ans !== 'no' && ans !== 'bound')) continue
      history.push({ y: num(h.y), what: h.what, ans, amt: Math.max(0, num(h.amt)) })
    }
  }
  return {
    by,
    allowance: Math.max(0, Math.round(num(raw.allowance))),
    missed: Math.max(0, num(raw.missed)),
    adultOk: raw.adultOk === true,
    owes: Math.max(0, Math.round(num(raw.owes))),
    owesSince: num(raw.owesSince),
    given: Math.max(0, Math.round(num(raw.given))),
    yes: Math.max(0, num(raw.yes)),
    no: Math.max(0, num(raw.no)),
    asked: num(raw.asked),
    bound: num(raw.bound),
    marks,
    car,
    history: history.slice(-6),
  }
}

export function writeTies(p: Person, t: WealthTies): void {
  p.data.w = {
    by: t.by,
    allowance: Math.max(0, Math.round(t.allowance)),
    missed: t.missed,
    adultOk: t.adultOk,
    owes: Math.max(0, Math.round(t.owes)),
    owesSince: t.owesSince,
    given: Math.max(0, Math.round(t.given)),
    yes: t.yes,
    no: t.no,
    asked: t.asked,
    bound: t.bound,
    marks: { ...t.marks },
    car: t.car ? { label: t.car.label, price: Math.round(t.car.price), year: t.car.year } : null,
    history: t.history.slice(-6).map((h) => ({ y: h.y, what: h.what, ans: h.ans, amt: Math.round(h.amt) })),
  }
}

/** Read, change and save a person's ties in one go. */
export function updateTies(g: GameState, p: Person, fn: (t: WealthTies) => void): WealthTies {
  const t = readTies(g, p)
  fn(t)
  writeTies(p, t)
  // A stamped life follows the loan into the edge at once (R4-E7, X22); the record stays the authority.
  if (socialOn(g)) syncLegacy(g, p)
  return t
}

export function recordAsk(g: GameState, p: Person, what: string, ans: Answer, amt: number): void {
  updateTies(g, p, (t) => {
    t.asked = g.year
    if (ans === 'yes' || ans === 'less' || ans === 'lend') t.yes += 1
    else t.no += 1
    t.history.push({ y: g.year, what, ans, amt: Math.max(0, Math.round(amt)) })
  })
}

// ---------------------------------------------------------------------------
// Entitlement (spoiling)

export function entitlement(p: Person): number {
  return clamp(num(p.data.entitlement, 0))
}

/** Change how spoiled someone is; keeps the 'spoiled' trait pill in sync. */
export function addEntitlement(p: Person, delta: number): void {
  const v = Math.round(clamp(entitlement(p) + delta))
  p.data.entitlement = v
  const has = p.traits.includes('spoiled')
  if (v >= ENTITLED_AT && !has) p.traits = [...p.traits, 'spoiled']
  else if (v < ENTITLED_AT - 20 && has) p.traits = p.traits.filter((t) => t !== 'spoiled')
}

/**
 * A plain cash gift (relationships.ts Give Money): counted in what you've given them, and a big
 * one spoils a kid like any other windfall (so handing over cash isn't a way around entitlement).
 */
export function noteCashGift(g: GameState, p: Person, amount: number): void {
  if (!(amount > 0) || !p.alive || p.relation === 'pet') return
  updateTies(g, p, (t) => {
    t.given += Math.round(amount)
  })
  if (isDescendant(p) && p.age < 30) {
    const ratio = amount / Math.max(1, allowanceNorm(g, p))
    if (ratio > 2) addEntitlement(p, Math.min(6, Math.round(Math.log2(ratio))))
  }
}

export type Upbringing = 'spoiled' | 'indulgent' | 'fair' | 'strict' | 'none'

/**
 * How you've handled this kid's money asks so far. Fair parenting (a real mix of yes and no) is
 * the sweet spot; always yes is indulgent and ends in a spoiled kid; almost always no is strict.
 */
export function upbringing(g: GameState, p: Person): Upbringing {
  const t = readTies(g, p)
  const e = entitlement(p)
  if (e >= ENTITLED_AT) return 'spoiled'
  const total = t.yes + t.no
  if (total < 3) return 'none'
  const share = t.yes / total
  if (share < 0.3) return 'strict'
  if (share > 0.8) return 'indulgent'
  return e < 45 ? 'fair' : 'indulgent'
}

export function upbringingLabel(u: Upbringing): string {
  switch (u) {
    case 'spoiled':
      return 'Spoiled \u{1F451}'
    case 'indulgent':
      return 'Gets almost everything \u{1F381}'
    case 'fair':
      return 'Fair (the sweet spot) \u{2696}\u{FE0F}'
    case 'strict':
      return 'Strict \u{1F9F1}'
    default:
      return 'Too early to tell'
  }
}

// ---------------------------------------------------------------------------
// Local prices (constant dollars, the player's country unless the person lives abroad)

function abroadGoods(countryId: string): number {
  return Math.min(1.5, Math.max(0.45, 0.4 + 0.6 * countryWealth(countryId)))
}

/** Everyday goods and services where `countryId` is (pocket money, trips, rent, fees). */
export function goodsScale(g: GameState, countryId = g.character.countryId): number {
  return countryId === g.character.countryId ? goodsMult(g) : abroadGoods(countryId)
}

export function electronicsScale(g: GameState, countryId = g.character.countryId): number {
  if (countryId === g.character.countryId) return localGoodsMult(g, 'electronics')
  const m = marketOf(countryId).priceMult.electronics
  return Math.min(4.5, Math.max(0.3, (typeof m === 'number' && m > 0 ? m : 1) * (0.6 + 0.4 * Math.min(1, countryWealth(countryId)))))
}

export function luxuryScale(g: GameState, countryId = g.character.countryId): number {
  if (countryId === g.character.countryId) return localGoodsMult(g, 'luxury')
  const m = marketOf(countryId).priceMult.luxury
  return Math.min(4.5, Math.max(0.5, (typeof m === 'number' && m > 0 ? m : 1) * (0.85 + 0.15 * Math.min(1, countryWealth(countryId)))))
}

export function carScale(g: GameState, type: string, countryId = g.character.countryId): number {
  if (countryId === g.character.countryId) return carPriceMult(g, type)
  const m = marketOf(countryId).priceMult.car
  const floor = type === 'economy' ? 0.35 : 0.8
  return Math.min(4.5, Math.max(0.2, (typeof m === 'number' && m > 0 ? m : 1) * (floor + (1 - floor) * Math.min(1, countryWealth(countryId)))))
}

export function housingScale(g: GameState, countryId = g.character.countryId): number {
  if (countryId === g.character.countryId) return housingMult(g)
  const rent = marketOf(countryId).rentCost
  const w = countryWealth(countryId)
  return Math.max(0.08, Math.min(4, Math.pow(w, 0.66) * Math.pow(Number.isFinite(rent) && rent > 0 ? Math.min(5, rent) : w, 0.4)))
}

/** A round, shop-looking amount (never below 1). */
export function round(n: number): number {
  return Number.isFinite(n) ? nicePrice(Math.max(1, n)) : 1
}

/**
 * A fair yearly allowance for a kid this age here and now: about a dollar a week per year of age
 * in today's US, scaled by local prices and the era's real incomes.
 */
export function pocketNorm(g: GameState, age: number, countryId = g.character.countryId): number {
  const a = Math.max(4, Math.min(17, age))
  return round(a * 52 * goodsScale(g, countryId) * realWealthFactor(g.year))
}

/** What helping an adult (a kid starting out, a retired parent) with a yearly allowance normally looks like. */
export function supportNorm(g: GameState, countryId = g.character.countryId): number {
  return round(typicalIncome(g, countryId) * 0.25)
}

/** The fair yearly allowance/support for this person. */
export function allowanceNorm(g: GameState, p: Person): number {
  return p.age < 18 ? pocketNorm(g, p.age, personCountry(g, p)) : supportNorm(g, personCountry(g, p))
}

/**
 * The slider's top for someone's allowance: generous enough to spoil them, never absurd. Never
 * below what they already get, so a fortune that shrank can still keep (or lower) an allowance
 * set in better years instead of the slider snapping it down.
 */
export function allowanceMax(g: GameState, p: Person): number {
  const norm = allowanceNorm(g, p)
  const rich = Math.min(perceivedWealth(g) * 0.02, typicalIncome(g) * (p.age < 18 ? 20 : 100))
  return Math.max(round(Math.max(norm * 12, rich)), readTies(g, p).allowance)
}

/** How an allowance compares with the norm, for the slider caption and the menu. */
export function allowanceVerdict(g: GameState, p: Person, amount: number): string {
  if (amount <= 0) return p.age < 18 ? 'No pocket money' : 'No support'
  const r = amount / Math.max(1, allowanceNorm(g, p))
  if (r < 0.5) return 'On the stingy side'
  if (r <= 1.5) return p.age < 18 ? 'About what kids their age get' : 'A helping hand'
  if (r <= 4) return 'Generous'
  if (r <= 15) return 'Spoiling them (entitlement creeps up)'
  return 'Absurd: they will never need a job (entitlement soars)'
}

/** Pocket money is 'allowance' in American English. */
export function pocketWord(g: GameState): string {
  return g.character.countryId === 'us' || g.character.countryId === 'ca' ? 'allowance' : 'pocket money'
}

// ---------------------------------------------------------------------------
// Diminishing returns for generosity in public (charity, fans)

const DONATED_KEY = 'wealth.donated'

/** What this character has given to causes so far (an heir starts their own reputation). */
export function donatedSoFar(g: GameState): number {
  const raw = g.flags[DONATED_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.by !== g.character.id) return 0
  return Math.max(0, num(raw.total))
}

/**
 * Karma for a donation: grows with the gift relative to a local income, shrinks the more you've
 * already given (a lifetime of donations buys less and less), never more than 8 at once.
 */
export function donationKarma(g: GameState, amount: number): number {
  if (!(amount > 0)) return 0
  const inc = typicalIncome(g)
  const lifetime = donatedSoFar(g)
  const base = Math.min(8, 1.5 + 2.5 * Math.log10(1 + (amount / inc) * 5))
  const decay = 1 / (1 + lifetime / (60 * inc))
  return Math.max(0, Math.min(8, Math.round(base * decay)))
}

/** Fame for a public donation (only for people already in the public eye), at most +3. */
export function donationFame(g: GameState, amount: number): number {
  if (!(amount > 0) || g.character.hidden.fame < 20) return 0
  const inc = typicalIncome(g)
  const lifetime = donatedSoFar(g)
  const base = Math.min(3, Math.log10(1 + amount / (inc * 2)))
  const decay = 1 / (1 + lifetime / (100 * inc))
  return Math.max(0, Math.min(3, Math.round(base * decay)))
}

export function noteDonation(g: GameState, amount: number): void {
  g.flags[DONATED_KEY] = { by: g.character.id, total: Math.round(donatedSoFar(g) + Math.max(0, amount)) }
}

// ---------------------------------------------------------------------------
// Pending outcomes (a kid's business, a friend's startup, a cousin's sure thing)

export interface Pending {
  id: string
  kind: 'venture' | 'tip'
  /** The person behind it (absent for relatives who aren't in your contacts). */
  pid?: string
  /** Display name ('your cousin Dele', 'your daughter Mia'). */
  name: string
  /** What it is: 'a food truck', 'a sure-thing mining stock'. */
  what: string
  amt: number
  /** Year it pays out (or doesn't). */
  due: number
  /** Odds of real success / of getting some money back. */
  odds: number
  partial: number
  /** Character id of the investor. */
  by: string
}

const PENDING_KEY = 'wealth.pending'

export function readPending(g: GameState): Pending[] {
  const raw = g.flags[PENDING_KEY]
  if (!Array.isArray(raw)) return []
  const out: Pending[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue
    if (typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.what !== 'string' || typeof x.by !== 'string') continue
    out.push({
      id: x.id,
      kind: x.kind === 'tip' ? 'tip' : 'venture',
      pid: typeof x.pid === 'string' ? x.pid : undefined,
      name: x.name,
      what: x.what,
      amt: Math.max(0, Math.round(num(x.amt))),
      due: num(x.due),
      odds: clamp(num(x.odds), 0, 1),
      partial: clamp(num(x.partial), 0, 1),
      by: x.by,
    })
  }
  return out
}

export function writePending(g: GameState, list: Pending[]): void {
  g.flags[PENDING_KEY] = list.map((x) => {
    const o: Record<string, Json> = { id: x.id, kind: x.kind, name: x.name, what: x.what, amt: x.amt, due: x.due, odds: x.odds, partial: x.partial, by: x.by }
    if (x.pid) o.pid = x.pid
    return o
  })
}

/** What a venture/tip pays back: success 1.25x, partial 0.5x, else nothing (always worth less than 1x on average). */
export const SUCCESS_RETURN = 1.25
export const PARTIAL_RETURN = 0.5

/** Expected payback per dollar for these odds (always below 1: generosity is never an investment strategy). */
export function expectedReturn(odds: number, partial: number): number {
  return odds * SUCCESS_RETURN + partial * PARTIAL_RETURN
}

// ---------------------------------------------------------------------------
// Relationship effects

/** Relationship gain from a gift: smaller from entitled people, never below 1. */
export function gratitude(p: Person, base: number): number {
  const e = entitlement(p)
  return Math.max(1, Math.round(base * (1 - e / 150)))
}

/** Relationship loss from a refusal: entitled people take it worse. */
export function sting(p: Person, base: number): number {
  return Math.max(1, Math.round(base * (1 + entitlement(p) / 100)))
}

/**
 * Yearly odds someone pays something back (from who they are, no randomness). With the game, a stamped life adds what the person
 * remembers of the player (world/edge-odds.ts, within plus or minus 0.15); without it, or on a life that is not stamped, the term is 0.
 */
export function repayOdds(p: Person, owes: number, g?: GameState): number {
  let o = 0.15 + (p.relationship - 50) / 400 - entitlement(p) / 300
  if (traitIn(p, 'honest', 'loyal', 'kind', 'caring')) o += 0.12
  if (traitIn(p, 'sneaky', 'manipulative', 'lazy')) o -= 0.1
  if (p.money >= owes) o += 0.15
  if (g !== undefined) o += memoryOdds(g, p, 'repay')
  return Math.max(0.03, Math.min(0.75, o))
}

export function bumpRelationship(g: GameState, p: Person, delta: number): void {
  if (Number.isFinite(delta) && delta !== 0) addRelationship(g, p, delta)
}
