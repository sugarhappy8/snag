// The money team: one owner-stamped record in g.flags['fin.team'] (an advisor and a manager the player hired),
// the yearly offers, what they cost, who may hire them and how the advisor vets a manager. No new Asset and no
// new Person: the manager's trades are ordinary holdings. `readTeam` is the whitelist for the saved record and
// `writeTeam` the only writer; a save without the key plays exactly as before. Reads, offers, fees, gates and
// vetting are pure and never touch g.rng (offers hash the life, the year, the role, an epoch and the slot, the
// way special/common.ts stableRoll does). Only `hire`, `release` and `writeTeam` write.
import { formatMoney, inPrison, log, netWorth } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { managedBook } from '../investments'
import { nextRandom } from '../rng'
import type { GameState, Json } from '../types'
import { NAME_POOLS, getCountry } from '../world'
import { defaultMandate, poolOf, readMandate, type Mandate } from './mandate'

/**
 * Tuning for hiring and for what a hire costs. `advisorRate` and `managerRate` are [base, spread]:
 * rate = base + spread x skill / 100. `crookClaim` is how far above its real skill a crook claims to be.
 * The theft numbers (`skimPerLimit`, the catch odds, `clawback`) are read by the yearly step.
 */
export const TERMS = {
  offers: 3,
  crookedShare: 0.12,
  crookClaim: [12, 25],
  advisorGate: 25,
  managerGate: 10,
  floor: 0.1,
  advisorRate: [0.0015, 0.0025],
  managerRate: [0.004, 0.01],
  skimPerLimit: 0.03,
  baseCatch: 0.04,
  advisorCatch: 0.5,
  clawback: 0.3,
} as const

/** How an offer's true skill is drawn (the mean of two rolls, so middling hires are common) and how far a crook may claim. */
const OFFER_SKILL = { base: 30, spread: 62, min: 30, max: 92, claimCap: 97 } as const

export type Role = 'advisor' | 'manager'

export interface Hire {
  name: string
  skill: number
  since: number
}

export interface ManagerHire extends Hire {
  /** The rating they were hired on. A crook claims more than `skill`. */
  claimed: number
  honest: boolean
  /** The agreed yearly fee, as a share of the money they run. */
  rate: number
  /** Everything a crook has padded onto the bills so far. */
  skimmed: number
}

export interface Statement {
  year: number
  pool: number
  billed: number
  moved: number
  costs: number
  stocks: number
}

export interface Team {
  owner: string
  advisorEpoch?: number
  managerEpoch?: number
  done?: number
  advisor?: Hire
  manager?: ManagerHire
  mandate?: Mandate
  last?: Statement
}

const KEY = 'fin.team'
const MAX_MONEY = 1e15
const MAX_COUNT = 1e6

// ---------------------------------------------------------------------------
// Reading the record

/** Who the record belongs to: the character and the year they were born, so an heir starts clean. */
function ownerOf(g: GameState): string {
  const c = g.character
  return `${c.id}:${g.year - c.age}`
}

function plain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A number (infinities included, so they clamp), or null for anything else and for NaN. */
function numberOf(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function within(v: unknown, lo: number, hi: number): number | null {
  const n = numberOf(v)
  return n === null ? null : Math.min(hi, Math.max(lo, n))
}

function wholeWithin(v: unknown, lo: number, hi: number): number | null {
  const n = within(v, lo, hi)
  return n === null ? null : Math.min(hi, Math.max(lo, Math.round(n)))
}

/** 1 to 40 characters with the control characters taken out; null when nothing readable is left. */
function nameOf(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let out = ''
  for (const ch of v.slice(0, 400)) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 32 || (c >= 127 && c < 160)) continue
    out += ch
  }
  let cut = ''
  for (const ch of out.trim()) {
    if (cut.length + ch.length > 40) break
    cut += ch
  }
  cut = cut.trim()
  return cut.length > 0 ? cut : null
}

function readHire(v: unknown, g: GameState): Hire | null {
  if (!plain(v)) return null
  const name = nameOf(v.name)
  if (name === null) return null
  return { name, skill: within(v.skill, 20, 99) ?? 50, since: wholeWithin(v.since, 1800, 2300) ?? wholeWithin(g.year, 1800, 2300) ?? 2026 }
}

function readManager(v: unknown, g: GameState): ManagerHire | null {
  const h = readHire(v, g)
  if (!h || !plain(v)) return null
  const claimed = within(v.claimed, 20, 99) ?? h.skill
  return {
    ...h,
    claimed,
    honest: v.honest !== false,
    rate: within(v.rate, 0.002, 0.03) ?? managerRate(claimed),
    skimmed: within(v.skimmed, 0, MAX_MONEY) ?? 0,
  }
}

/** A statement with any bad number is no statement. */
function readStatement(v: unknown): Statement | null {
  if (!plain(v)) return null
  const year = wholeWithin(v.year, 1800, 2300)
  const pool = within(v.pool, 0, MAX_MONEY)
  const billed = within(v.billed, 0, MAX_MONEY)
  const moved = within(v.moved, 0, MAX_MONEY)
  const costs = within(v.costs, 0, MAX_MONEY)
  const stocks = wholeWithin(v.stocks, 0, 100)
  if (year === null || pool === null || billed === null || moved === null || costs === null || stocks === null) return null
  return { year, pool, billed, moved, costs, stocks }
}

/**
 * The mandate a record holds, as the nearest legal one. A manager with no usable mandate gets the default. A reserve
 * nobody can read must not become "keep nothing in the bank", so it falls back to the default reserve too.
 */
function mandateOf(g: GameState, v: unknown): Mandate {
  const read = readMandate(v)
  if (read && plain(v) && numberOf(v.reserve) !== null) return read
  const fallback = defaultMandate(managedBook(g), typicalIncome(g))
  return read ? { ...read, reserve: fallback.reserve } : fallback
}

/**
 * The nearest legal record for `v`, stamped with `owner`. Builds a new object and keeps only the known keys.
 * A manager without a usable mandate gets the default one; a mandate or a statement with no manager is dropped.
 */
function normalize(g: GameState, v: unknown, owner: string): Team {
  const src = plain(v) ? v : {}
  const out: Team = { owner }
  const advisorEpoch = wholeWithin(src.advisorEpoch, 0, MAX_COUNT)
  const managerEpoch = wholeWithin(src.managerEpoch, 0, MAX_COUNT)
  const done = wholeWithin(src.done, 0, MAX_COUNT)
  if (advisorEpoch !== null) out.advisorEpoch = advisorEpoch
  if (managerEpoch !== null) out.managerEpoch = managerEpoch
  if (done !== null) out.done = done
  const advisor = readHire(src.advisor, g)
  if (advisor) out.advisor = advisor
  const manager = readManager(src.manager, g)
  if (manager) {
    out.manager = manager
    out.mandate = mandateOf(g, src.mandate)
    const last = readStatement(src.last)
    if (last) out.last = last
  }
  return out
}

/** The stored record as a fresh, legal copy; null when there is none, it is damaged past reading, or it is somebody else's. */
export function readTeam(g: GameState): Team | null {
  const v = g.flags[KEY]
  if (!plain(v)) return null
  const owner = ownerOf(g)
  if (v.owner !== owner) return null
  return normalize(g, v, owner)
}

/** The stored record, or an empty one for this character. A copy: changing it stores nothing. */
export function teamOf(g: GameState): Team {
  return readTeam(g) ?? { owner: ownerOf(g) }
}

/** Store `t` as the record of the current character, in the shape `readTeam` returns. Removes the key when nothing is left of it. */
export function writeTeam(g: GameState, t: Team): void {
  const next = normalize(g, t, ownerOf(g))
  if (!next.advisor && !next.manager && !next.advisorEpoch && !next.managerEpoch) {
    delete g.flags[KEY]
    return
  }
  g.flags[KEY] = next as unknown as Json
}

/** A hire's skill as a word. The number itself is never shown. */
export function ratingLabel(skill: number): 'Junior' | 'Experienced' | 'Senior' | 'Top-tier' {
  if (!(skill >= 45)) return 'Junior'
  if (!(skill >= 65)) return 'Experienced'
  if (!(skill >= 82)) return 'Senior'
  return 'Top-tier'
}

// ---------------------------------------------------------------------------
// Offers

export interface Offer {
  role: Role
  slot: 0 | 1 | 2
  name: string
  skill: number
  claimed: number
  honest: boolean
}

/** FNV-1a over a string, the seed of a local stream. */
function hashOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/** A private stream of numbers in [0, 1) from a key. It touches no game state. */
function streamOf(key: string): () => number {
  let state = hashOf(key)
  return () => {
    const [value, next] = nextRandom(state)
    state = next
    return value
  }
}

function isRole(role: unknown): role is Role {
  return role === 'advisor' || role === 'manager'
}

function epochOf(team: Team | null, role: Role): number {
  return (role === 'advisor' ? team?.advisorEpoch : team?.managerEpoch) ?? 0
}

function offerKey(g: GameState, role: Role, slot: number, epoch: number): string {
  return `${g.lifeId}|fin|${role}|${g.year}|${epoch}|${slot}`
}

/** The three people who want the job this year. The same on every call until the year turns or that role's hire is let go. */
export function offersFor(g: GameState, role: Role): Offer[] {
  if (!isRole(role)) return []
  const epoch = epochOf(readTeam(g), role)
  const pool = NAME_POOLS[getCountry(g.character.countryId).names] ?? NAME_POOLS.anglo
  const taken = new Set<string>()
  const out: Offer[] = []
  for (let slot = 0; slot < TERMS.offers; slot++) {
    const next = streamOf(offerKey(g, role, slot, epoch))
    const u1 = next()
    const u2 = next()
    const u3 = next()
    const u4 = next()
    const skill = Math.min(OFFER_SKILL.max, Math.max(OFFER_SKILL.min, Math.round(OFFER_SKILL.base + (OFFER_SKILL.spread * (u1 + u2)) / 2)))
    const honest = !(role === 'manager' && u3 < TERMS.crookedShare)
    const [lo, hi] = TERMS.crookClaim
    const claimed = honest ? skill : Math.min(OFFER_SKILL.claimCap, skill + Math.round(lo + (hi - lo) * u4))

    // The name: the first from the men's or women's list, the last from the surnames. Redraw until it is new.
    let name = ''
    for (let tries = 0; tries < 50; tries++) {
      const firsts = next() < 0.5 ? pool.male : pool.female
      name = `${firsts[Math.floor(next() * firsts.length)]} ${pool.last[Math.floor(next() * pool.last.length)]}`
      if (!taken.has(name)) break
    }
    if (taken.has(name)) name = `${name} ${String.fromCharCode(65 + slot)}.`
    taken.add(name)
    out.push({ role, slot: slot as 0 | 1 | 2, name, skill, claimed, honest })
  }
  return out
}

// ---------------------------------------------------------------------------
// Fees

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0
}

function skillIn(skill: number): number {
  return Number.isFinite(skill) ? Math.min(100, Math.max(0, skill)) : 50
}

/** The least either role charges: a tenth of a typical year's income where you live. */
function feeFloor(g: GameState): number {
  return Math.round(TERMS.floor * typicalIncome(g))
}

/** The advisor's yearly retainer: a share of net worth that grows with skill, never under the floor. */
export function advisorFee(g: GameState, skill: number): number {
  const [base, spread] = TERMS.advisorRate
  const worth = Math.max(0, finite(netWorth(g)))
  return Math.max(feeFloor(g), Math.round(worth * (base + (spread * skillIn(skill)) / 100)))
}

/** The yearly rate a manager asks of the money they run, by the rating they claim. Whole hundredths of a percent. */
export function managerRate(claimed: number): number {
  const [base, spread] = TERMS.managerRate
  return Math.round((base + (spread * skillIn(claimed)) / 100) * 10000) / 10000
}

/** A manager's yearly bill for running `pool` at `rate`, never under the floor. */
export function managerFee(g: GameState, rate: number, pool: number): number {
  return Math.max(feeFloor(g), Math.round(Math.max(0, finite(pool)) * Math.max(0, finite(rate))))
}

// ---------------------------------------------------------------------------
// Gates and vetting

/** Why this role can't be hired right now, or null. The first reason that applies. */
export function hireBlock(g: GameState, role: Role): string | null {
  const c = g.character
  if (!c.alive) return "You're no longer alive."
  if (c.age < 18) return 'You must be 18 or older.'
  if (inPrison(g)) return "Your money team can't work while you're in prison."
  const team = readTeam(g)
  if (role === 'advisor' && team?.advisor) return 'You already have an advisor.'
  if (role === 'manager' && team?.manager) return 'You already have a manager.'
  const income = typicalIncome(g)
  if (role === 'advisor') {
    const need = TERMS.advisorGate * income
    return netWorth(g) < need ? `Advisors take clients worth at least ${formatMoney(need)}.` : null
  }
  const book = managedBook(g)
  if (book.idle) return book.idle
  const need = TERMS.managerGate * income
  const pool = poolOf(book, defaultMandate(book, income).reserve)
  return pool < need ? `Managers take accounts of at least ${formatMoney(need)}. Yours is ${formatMoney(pool)}.` : null
}

export interface Vetting {
  skill: number
  flagged: boolean
}

/**
 * What the player's advisor learns about an offer: nothing, or the true skill and whether the manager has
 * padded bills before. The chance is the advisor's skill in percent, fixed by the life, the offer and the advisor.
 */
export function vet(g: GameState, offer: Offer): Vetting | null {
  if (!isRole(offer.role)) return null
  const team = readTeam(g)
  const advisor = team?.advisor
  if (!advisor) return null
  const key = `${g.lifeId}|fin|vet|${offerKey(g, offer.role, offer.slot, epochOf(team, offer.role))}|${advisor.name}`
  return streamOf(key)() < advisor.skill / 100 ? { skill: offer.skill, flagged: !offer.honest } : null
}

// ---------------------------------------------------------------------------
// Hiring and letting go

/** Hire the person in `slot` of this year's offers. The offer is rebuilt here and the gate checked again. No money moves. */
export function hire(g: GameState, role: Role, slot: number): boolean {
  if (!isRole(role) || !Number.isInteger(slot) || slot < 0 || slot >= TERMS.offers) return false
  if (hireBlock(g, role)) return false
  const offer = offersFor(g, role)[slot]
  if (!offer) return false
  const team = teamOf(g)
  if (role === 'advisor') {
    team.advisor = { name: offer.name, skill: offer.skill, since: g.year }
  } else {
    team.manager = { name: offer.name, skill: offer.skill, since: g.year, claimed: offer.claimed, honest: offer.honest, rate: managerRate(offer.claimed), skimmed: 0 }
    team.mandate ??= defaultMandate(managedBook(g), typicalIncome(g))
  }
  writeTeam(g, team)
  log(g, `I hired ${offer.name} as my financial ${role}.`)
  return true
}

/** Let the hire go: no cost. The role's epoch moves on, so the next offers are new people. */
export function release(g: GameState, role: Role): void {
  const team = readTeam(g)
  if (!team || !isRole(role)) return
  const who = role === 'advisor' ? team.advisor : team.manager
  if (!who) return
  if (role === 'advisor') {
    delete team.advisor
    team.advisorEpoch = Math.min(MAX_COUNT, (team.advisorEpoch ?? 0) + 1)
  } else {
    delete team.manager
    delete team.mandate
    delete team.last
    team.managerEpoch = Math.min(MAX_COUNT, (team.managerEpoch ?? 0) + 1)
  }
  writeTeam(g, team)
  log(g, `I let ${who.name} go.`)
}
