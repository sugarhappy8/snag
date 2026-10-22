// Personal and Family hedge funds. A fund is one Asset (kind investment, details.type 'hedge') that
// carries a HedgeFund record in details.hf; Asset.value is the player's own units at the unit price, so
// net worth and the estate count them once. A family fund also holds relatives' units: their money is
// never in the player's net worth. Money moves only through spend, realize and the relatives' own
// savings (Person.money), and every action keeps the books whole: a fund never creates money.
// Nothing here reads or advances g.rng; ids come from uid, a counter.
import { personCash } from '../cash'
import { fullName, log, notice, spend } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { isEstranged, willRole } from '../events/will-core'
import { lossCarry, minTrade, realize } from '../investments'
import { capitalGainsTax } from '../nation/rates'
import { uid } from '../rng'
import type { Asset, GameState, Json, Person } from '../types'
import { cashOutFamilyHolders, familyStakeHeirs } from './dynasty-ownership'
import type { HedgeStrategy, MacroCall } from './fund-state'
import { macroBlock, marketBlock, personBlock, seedMin, strategyBlock } from './hedge-model'
import { HEDGE_STRATEGY_IDS, MACRO_CALL_IDS, MAX_HOLDERS, readHedge, RUNNING_COST, unitPrice, unitsValue, type HedgeFund, type Holder } from './hedge-record'
import { clampN, money, pct } from './util'

/** The share of their own savings a relative puts in. */
export const INVITE_SHARE = 0.2
/** Most relatives you invite yourself; heirs can take a fund to MAX_HOLDERS. */
export const INVITE_MAX = 8
/** A relative whose bond with you falls under this takes their money out. */
export const LEAVE_BELOW = 15

/** The largest pool, and the largest number of units, a fund can hold. */
const MONEY_MAX = 1e15
const EMOJI = '🦈'

export interface FundRow {
  a: Asset
  f: HedgeFund
}

// ---------------------------------------------------------------------------
// Reading and saving

/**
 * The record with a holder who is the player merged into the player's units, the cost stepped up to
 * the units' value. A relative who inherited the fund is the player now, and their old entry is the
 * player's own money. Returns `f` itself when there is no such entry. Pure.
 */
function merged(g: GameState, f: HedgeFund): HedgeFund {
  const own = f.holders.filter((h) => h.id === g.character.id)
  if (!own.length) return f
  const units = own.reduce((sum, h) => sum + h.units, 0)
  return { ...f, holders: f.holders.filter((h) => h.id !== g.character.id), mine: f.mine + units, cost: f.cost + unitsValue(f, units) }
}

/** Every hedge fund the player holds that has a readable record, in asset order. */
export function fundsOf(g: GameState): FundRow[] {
  const rows: FundRow[] = []
  for (const a of g.assets) {
    if (a.kind !== 'investment' || a.details.type !== 'hedge') continue
    const f = readHedge(a.details.hf)
    if (f) rows.push({ a, f })
  }
  return rows
}

export function fundOf(g: GameState, owner: 'person' | 'family'): FundRow | null {
  return fundsOf(g).find((r) => r.f.owner === owner) ?? null
}

/** A fund by its asset id, with any holder entry that is the player already merged into the player's units. */
function rowOf(g: GameState, assetId: string): FundRow | null {
  const row = fundsOf(g).find((r) => r.a.id === assetId)
  return row ? { a: row.a, f: merged(g, row.f) } : null
}

/**
 * Writes the record to its asset: a clean JSON copy in details.hf, the value of the player's units and
 * the player's cost basis. `f` is left equal to what was saved.
 */
export function saveFund(a: Asset, f: HedgeFund): void {
  const clean = readHedge(f) ?? f
  const copy: Json = JSON.parse(JSON.stringify(clean))
  a.details.type = 'hedge'
  a.details.hf = copy
  a.value = clampN(Math.round(unitsValue(clean, clean.mine)), 0, MONEY_MAX)
  a.purchasePrice = Math.round(clampN(clean.cost, 0, MONEY_MAX))
  if (clean !== f) Object.assign(f, clean)
}

function refuse(g: GameState, title: string, reason: string): false {
  notice(g, title, reason, { emoji: '🚫' })
  return false
}

function nameOf(g: GameState, owner: 'person' | 'family'): string {
  const last = typeof g.character.lastName === 'string' ? g.character.lastName.trim() : ''
  return `${last ? `${last} ` : ''}${owner === 'person' ? 'Personal' : 'Family'} Fund`
}

// ---------------------------------------------------------------------------
// Starting

/** Why this kind of fund can't be started now, or null. */
export function startBlock(g: GameState, owner: 'person' | 'family'): string | null {
  const block = personBlock(g) ?? marketBlock(g, g.character.countryId)
  if (block) return block
  return fundOf(g, owner) ? `You already have a ${owner === 'person' ? 'personal' : 'family'} fund.` : null
}

/** Opens a fund with `seed` dollars of your cash. It follows your home market. */
export function startFund(g: GameState, owner: 'person' | 'family', seed: number): boolean {
  if (owner !== 'person' && owner !== 'family') return false
  const block = startBlock(g, owner)
  if (block) return refuse(g, 'Start a Fund', block)
  const need = seedMin(g)
  const dollars = Number.isFinite(seed) ? Math.round(seed) : Number.NaN
  if (!(dollars >= need)) return refuse(g, 'Start a Fund', `A fund starts at ${money(need)}.`)
  if (dollars > g.character.money || !spend(g, dollars, 'trade.buy')) return refuse(g, 'Start a Fund', "You can't cover that.")
  const f: HedgeFund = {
    v: 1,
    owner,
    countryId: g.character.countryId,
    founded: g.year,
    strategy: 'longShort',
    call: 'flat',
    lev: 1,
    nav: dollars,
    units: dollars,
    mine: dollars,
    cost: dollars,
    holders: [],
    lastYear: -1,
    last: null,
    marks: [],
  }
  const a: Asset = {
    id: uid(g, 'a'),
    kind: 'investment',
    name: nameOf(g, owner),
    emoji: EMOJI,
    purchasePrice: dollars,
    value: dollars,
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: {},
  }
  saveFund(a, f)
  g.assets.push(a)
  log(g, `I started the ${a.name}.`, 'good')
  notice(g, 'Fund Started', `${a.name} opened with ${money(dollars)}. You run it. It pays no fee, only ${pct(RUNNING_COST, 1)} a year to run.`, { emoji: EMOJI })
  return true
}

// ---------------------------------------------------------------------------
// Money in and out

/** Why money can't go in or out of this fund now, or null: you must be able to run it and its market must be open. */
export function putBlock(g: GameState, f: HedgeFund): string | null {
  return personBlock(g) ?? marketBlock(g, f.countryId)
}

/** Why `d` more dollars can't be added to the pool, or null: a pool with no value has no price to buy at. */
function roomBlock(f: HedgeFund, d: number): string | null {
  const price = unitPrice(f)
  if (!(price > 0) || !Number.isFinite(price)) return 'The fund has nothing left in it.'
  const bought = d / price
  if (!Number.isFinite(bought) || f.nav + d > MONEY_MAX || f.units + bought > MONEY_MAX) return "The fund can't take that much."
  return null
}

/** Puts `dollars` of your cash into the pool at the unit price. */
export function putIn(g: GameState, assetId: string, dollars: number): boolean {
  const row = rowOf(g, assetId)
  if (!row) return false
  const { a, f } = row
  const title = 'Put In More'
  const block = putBlock(g, f)
  if (block) return refuse(g, title, block)
  if (!Number.isFinite(dollars)) return refuse(g, title, 'Enter an amount to put in.')
  const d = Math.round(dollars)
  if (d < minTrade(g)) return refuse(g, title, `The smallest amount is ${money(minTrade(g))}.`)
  if (d > g.character.money) return refuse(g, title, "You can't cover that.")
  const full = roomBlock(f, d)
  if (full) return refuse(g, title, full)
  if (!spend(g, d, 'trade.buy')) return refuse(g, title, "You can't cover that.")
  const bought = d / unitPrice(f)
  f.nav += d
  f.units += bought
  f.mine += bought
  f.cost += d
  saveFund(a, f)
  notice(g, 'Money In', `You put ${money(d)} into ${a.name}. You own ${pct(f.mine / f.units, 1)}.`, { emoji: EMOJI })
  return true
}

export interface TakeQuote {
  gross: number
  basis: number
  gain: number
  tax: number
  closes: boolean
  relatives: number
}

/**
 * What taking out `fraction` (0 to 1) of your units pays, before tax, and what the tax on the gain
 * would be (the way an investment sale is taxed: carried losses first, then the nation's capital gains
 * rate). A take out that is all of it, or leaves less than the smallest trade, closes the fund: then
 * the quote is for all your units and `relatives` is what the relatives get. Pure.
 */
export function takeQuote(g: GameState, fund: HedgeFund, fraction: number): TakeQuote {
  const f = merged(g, fund)
  const fr = clampN(fraction, 0, 1)
  const value = unitsValue(f, f.mine)
  const closes = fr >= 0.999 || (fr > 0 && value * (1 - fr) < minTrade(g))
  const part = closes ? 1 : fr
  const gross = Math.round(value * part)
  const basis = Math.round(f.cost * part)
  const gain = gross - basis
  const taxable = Math.max(0, gain - Math.min(lossCarry(g), Math.max(0, gain)))
  const tax = capitalGainsTax(g, taxable, 0)
  const relatives = closes ? f.holders.reduce((sum, h) => sum + unitsValue(f, h.units), 0) : 0
  return { gross, basis, gain, tax, closes, relatives }
}

/** Takes `fraction` of your units out as cash. All of it, or nearly, closes the fund. */
export function takeOut(g: GameState, assetId: string, fraction: number): boolean {
  const row = rowOf(g, assetId)
  if (!row) return false
  const { a, f } = row
  const title = 'Take Out'
  const block = putBlock(g, f)
  if (block) return refuse(g, title, block)
  if (!Number.isFinite(fraction) || !(fraction > 0) || fraction > 1 + 1e-9) return refuse(g, title, 'Enter an amount to take out.')
  const fr = Math.min(1, fraction)
  const q = takeQuote(g, f, fr)
  if (q.closes) return closeFund(g, assetId)
  if (!(q.gross >= 1)) return refuse(g, title, 'Enter an amount to take out.')
  const price = unitPrice(f)
  const r = realize(g, q.gross, q.gain, true)
  // The units you sold leave the pool at the price, so nobody else's value moves, and the pool
  // falls by exactly the cash you were paid.
  const sold = Math.min(f.mine, q.gross / price)
  f.mine = Math.max(0, f.mine - sold)
  f.units = Math.max(0, f.units - sold)
  f.nav = Math.max(0, f.nav - sold * price)
  f.cost = Math.max(0, f.cost - q.basis)
  saveFund(a, f)
  notice(g, 'Money Out', `You took ${money(q.gross)} out of ${a.name}.${r.tax > 0 ? ` Tax on the gain is about ${money(r.tax)}.` : ''}`, { emoji: EMOJI })
  return true
}

/** Sells all your units, pays the relatives their value and removes the fund. */
export function closeFund(g: GameState, assetId: string): boolean {
  const row = rowOf(g, assetId)
  if (!row) return false
  const { a, f } = row
  const block = putBlock(g, f)
  if (block) return refuse(g, 'Close Fund', block)
  const gross = Math.round(unitsValue(f, f.mine))
  realize(g, gross, gross - Math.round(f.cost), true)
  const relatives = f.holders.reduce((sum, h) => sum + unitsValue(f, h.units), 0)
  cashOutFamilyHolders(g, f.holders.map((h) => ({ id: h.id, share: h.units / f.units })), f.nav, 'the family fund')
  g.assets = g.assets.filter((x) => x.id !== a.id)
  log(g, `I closed the ${a.name}.`, 'neutral')
  notice(g, 'Fund Closed', `${a.name} is closed. You got ${money(gross)}.${relatives > 0 ? ` Relatives got ${money(relatives)}.` : ''}`, { emoji: EMOJI })
  return true
}

// ---------------------------------------------------------------------------
// Strategy

/** Picks a strategy. Any strategy but Macro puts the call back to flat and leverage to 1x. */
export function setFundStrategy(g: GameState, assetId: string, s: HedgeStrategy): boolean {
  if (!HEDGE_STRATEGY_IDS.includes(s)) return false
  const row = rowOf(g, assetId)
  if (!row) return false
  const block = strategyBlock(g, row.f.countryId, s)
  if (block) return refuse(g, 'Fund Strategy', block)
  row.f.strategy = s
  if (s !== 'macro') {
    row.f.call = 'flat'
    row.f.lev = 1
  }
  saveFund(row.a, row.f)
  return true
}

/** Makes a Macro call, with leverage from 1x to 3x in halves when given. The year end puts it back to Long/Short. */
export function setFundCall(g: GameState, assetId: string, call: MacroCall, lev?: number): boolean {
  if (!MACRO_CALL_IDS.includes(call)) return false
  const row = rowOf(g, assetId)
  if (!row) return false
  const block = macroBlock(g)
  if (block) return refuse(g, 'Market Call', block)
  row.f.strategy = 'macro'
  row.f.call = call
  if (lev !== undefined && Number.isFinite(lev)) row.f.lev = Math.round(clampN(lev, 1, 3) * 2) / 2
  saveFund(row.a, row.f)
  return true
}

// ---------------------------------------------------------------------------
// Relatives

export interface Candidate {
  person: Person
  amount: number
  /** Why they can't join, or null when they can. */
  why: string | null
}

function sortKey(p: Person): string {
  return `${fullName(p)}|${p.id}`
}

/**
 * The relatives the player could invite, closest first, at most INVITE_MAX: living contacts with a will
 * role other than friend who are not in the fund yet. `amount` is what they would put in: a fifth of
 * their savings, and never more than your own units are worth. Pure.
 */
export function candidates(g: GameState, f: HedgeFund): Candidate[] {
  const held = new Set(f.holders.map((h) => h.id))
  const mine = Math.floor(unitsValue(f, f.mine))
  const savings = 5 * typicalIncome(g)
  const pool = g.people
    .filter((p) => {
      const role = willRole(p)
      return p.alive && role !== null && role !== 'friend' && !held.has(p.id)
    })
    .sort((x, y) => (y.relationship - x.relationship) || (sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : 0))
    .slice(0, INVITE_MAX)
  return pool.map((p) => {
    const own = Number.isFinite(p.money) ? Math.max(0, p.money) : 0
    const amount = Math.max(0, Math.min(Math.floor(INVITE_SHARE * own), mine))
    let why: string | null = null
    if (!(p.age >= 18)) why = 'Too young.'
    else if (p.data.disowned === true) why = 'You disowned them.'
    else if (isEstranged(g, p)) why = 'Not on speaking terms.'
    else if (!(p.relationship >= 40)) why = "They don't trust you with money yet."
    else if (!(own >= savings)) why = "They don't have the savings."
    else if (f.owner !== 'family' || f.holders.length >= INVITE_MAX) why = 'The fund is full.'
    else if (!(amount >= 1)) why = 'Your share is too small.'
    return { person: p, amount, why }
  })
}

/** A relative puts a fifth of their savings in, at most what your units are worth, at the unit price. */
export function invite(g: GameState, assetId: string, personId: string): boolean {
  const row = rowOf(g, assetId)
  if (!row) return false
  const { a, f } = row
  const title = 'Family'
  const block = putBlock(g, f)
  if (block) return refuse(g, title, block)
  const c = candidates(g, f).find((x) => x.person.id === personId)
  if (!c) return false
  if (c.why) return refuse(g, title, c.why)
  const full = roomBlock(f, c.amount)
  if (full) return refuse(g, title, full)
  const bought = c.amount / unitPrice(f)
  personCash(g, c.person, -c.amount, 'trade.buy')
  f.nav += c.amount
  f.units += bought
  f.holders.push({ id: c.person.id, units: bought })
  saveFund(a, f)
  notice(g, 'Relative Joined', `${c.person.firstName} put ${money(c.amount)} into ${a.name}.`, { emoji: EMOJI })
  return true
}

/** Takes a holder's units out of the pool along with their value. The unit price stays. */
function dropUnits(f: HedgeFund, h: Holder, value: number): void {
  f.holders = f.holders.filter((x) => x !== h)
  f.units = Math.max(0, f.units - h.units)
  f.nav = Math.max(0, f.nav - value)
}

/** Pays a living holder their value in cash. */
function cashOut(g: GameState, f: HedgeFund, h: Holder, p: Person): number {
  const value = unitsValue(f, h.units)
  personCash(g, p, value, 'trade.sell')
  dropUnits(f, h, value)
  return value
}

/** Pays a relative what their units are worth and takes them out of the fund. */
export function payOutHolder(g: GameState, assetId: string, personId: string): boolean {
  const row = rowOf(g, assetId)
  if (!row) return false
  const { a, f } = row
  const h = f.holders.find((x) => x.id === personId)
  const p = g.people.find((x) => x.id === personId)
  if (!h || !p || !p.alive) return false
  const value = cashOut(g, f, h, p)
  saveFund(a, f)
  notice(g, 'Paid Out', `${p.firstName} took ${money(value)} out of ${a.name}.`, { emoji: EMOJI })
  return true
}

/** 'Sam', 'Sam and me', 'Sam and 2 others'. */
function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names[0]} and ${names.length - 1} others`
}

/** Hands a late holder's units to their heirs. Returns the life-log line. */
function passOn(g: GameState, f: HedgeFund, h: Holder, dead: Person, name: string): string {
  const heirs = familyStakeHeirs(g, dead)
  f.holders = f.holders.filter((x) => x !== h)
  const who = fullName(dead)
  if (!heirs.length) {
    dropUnits(f, h, unitsValue(f, h.units))
    return `${who}'s part of the ${name} left the family.`
  }
  const part = h.units / heirs.length
  const worth = unitsValue(f, part)
  const names: string[] = []
  let toMe = false
  for (const id of heirs) {
    if (id === g.character.id) {
      f.mine += part
      f.cost += worth
      toMe = true
      continue
    }
    const heir = g.people.find((x) => x.id === id && x.alive)
    if (!heir) {
      f.units = Math.max(0, f.units - part)
      f.nav = Math.max(0, f.nav - worth)
      continue
    }
    names.push(heir.firstName)
    const held = f.holders.find((x) => x.id === id)
    if (held) held.units += part
    else if (f.holders.length < MAX_HOLDERS) f.holders.push({ id, units: part })
    else {
      // The fund is full of holders: this heir is paid in cash instead.
      personCash(g, heir, worth, 'trade.sell')
      f.units = Math.max(0, f.units - part)
      f.nav = Math.max(0, f.nav - worth)
    }
  }
  if (toMe) names.push('me')
  return names.length ? `${who}'s part of the ${name} went to ${nameList(names)}.` : `${who}'s part of the ${name} left the family.`
}

/**
 * Settles who holds what before a year is booked. Mutates `f`; returns life-log lines. It never changes
 * the unit price, so it can't change anyone else's value:
 * 1. A holder who is the player merges into the player's units, the cost stepped up to their value.
 * 2. A holder with no contact left the family: their units leave with their value.
 * 3. A late holder's units go to the heirs the game models (the player's part joins the player's units).
 * 4. A living holder who has cooled, was disowned or is estranged is paid out.
 */
export function settleHolders(g: GameState, f: HedgeFund, name: string): string[] {
  const lines: string[] = []
  if (f.owner !== 'family' || !f.holders.length) return lines
  Object.assign(f, merged(g, f))
  for (const h of [...f.holders]) {
    const p = g.people.find((x) => x.id === h.id)
    if (!p) dropUnits(f, h, unitsValue(f, h.units))
    else if (!p.alive) lines.push(passOn(g, f, h, p, name))
  }
  for (const h of [...f.holders]) {
    const p = g.people.find((x) => x.id === h.id)
    if (!p || !p.alive) continue
    if (p.relationship < LEAVE_BELOW || p.data.disowned === true || isEstranged(g, p)) {
      cashOut(g, f, h, p)
      lines.push(`${p.firstName} took their money out of the ${name}.`)
    }
  }
  return lines
}
