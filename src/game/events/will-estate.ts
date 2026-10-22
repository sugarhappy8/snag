// After the player dies: who gets what, the reading of the will, contested wills and probate.
//
// life.ts continueAsChild calls planEstate while the late player is still the character (it moves
// the money to the other heirs, the charity and any contestant who wins, exactly once) and
// settleReading once the heir has become the player (the scene, the siblings' reactions, the offer
// to contest). Money is conserved: estate = tax + legal fees + charity + every person's cash (the
// heir's, and the part of it held in probate), and a held or disputed amount only ever moves from
// one of those places to another.
//
// A will that cuts out someone close can be contested. Odds follow the role (a spouse or a young
// dependent child fares best), how recent the change was, whether it looks unduly influenced, and
// whether the person was told in advance. The estate pays the fees of a contest filed by a relative;
// the heir pays for one they file themselves, and only the amount they would win is held back while
// it plays out. Probate holds half of the heir's share for a year or three when a contest was filed.
import { moveCash, poolPurse, writeoff, type Purse } from '../cash'
import { addMoney, addRelationship, addStat, canAfford, clamp, formatMoney, log, notice, scriptChoice } from '../core'
import { book, foldAccount, playerAcct } from '../kernel/ledger'
import { counterparty, type Reason } from '../kernel/reasons'
import { notePerson } from '../people'
import { chance, rand, randFloat, randInt, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import type { Character, GameState, Json, Person } from '../types'
import { noteCashGift, personCountry, typicalIncome } from './wealth-core'
import { askedPurse, wholePurse } from './purses'
import { afterWillChange, ensureSnap, reactionClause } from './will-act'
import {
  angerOnLearning,
  CHARITY,
  expectation,
  hasNamedHeirs,
  readWill,
  readWl,
  temper,
  updateWl,
  willNameable,
  willRole,
  willSlices,
  type Slice,
} from './will-core'

const EMOJI = '\u{1F4DC}'

export const S_HEIR = 'will.estate.heir'
export const S_ASK = 'will.estate.ask'

// ---------------------------------------------------------------------------
// Odds and awards (pure; the heir's popup shows the same numbers)

/** Base chance a court sides with a person cut out of a will, by role. */
function roleOdds(p: Person): number {
  switch (willRole(p)) {
    case 'spouse':
      return 0.5
    case 'child':
      return p.age < 18 ? 0.55 : 0.33
    case 'stepchild':
      return p.age < 18 ? 0.35 : 0.18
    case 'grandchild':
      return 0.08
    case 'parent':
      return 0.12
    case 'sibling':
      return 0.1
    default:
      return 0.03
  }
}

function lacksCapacity(c: Character): boolean {
  return c.conditions.some((x) => /alzheimer|dementia/i.test(x.name))
}

/** The chance that a contest by this person succeeds in court (0.03-0.85). Pure. */
export function contestOdds(g: GameState, p: Person): number {
  const ws = readWill(g)
  const w = readWl(g, p)
  let o = roleOdds(p)
  const since = ws.changed > 0 ? g.year - ws.changed : 99
  if (since <= 1) o += 0.18
  else if (since <= 3) o += 0.08
  const people = willSlices(g).filter((s) => s.id !== CHARITY && s.pct > 0)
  const sole = people.length === 1 ? g.people.find((x) => x.id === people[0].id) : undefined
  if (ws.written && sole && sole.id !== p.id && sole.relationship >= 85 && since <= 5 && (g.character.age >= 75 || lacksCapacity(g.character))) o += 0.15
  if (w.explained === 'kind' || w.explained === 'blunt') o -= 0.12
  else if (w.explained === 'letter') o -= 0.08
  if (w.told === 'out' && w.cutY > 0 && g.year - w.cutY >= 5) o -= 0.06
  if (p.relation === 'spouse' && p.data.prenup === true) o -= 0.2
  return clamp(Math.round(o * 100) / 100, 0.03, 0.85)
}

/** What a court would restore if it sided with this person: a fraction of an equal share (a spouse gets at least a fifth of the estate). */
export function contestAward(p: Person, net: number, otherHeirs: number): number {
  const fair = Math.max(0, net) / (Math.max(0, otherHeirs) + 1)
  const frac = (() => {
    switch (willRole(p)) {
      case 'spouse':
        return 0.6
      case 'child':
        return p.age < 18 ? 0.8 : 0.5
      case 'stepchild':
        return 0.3
      case 'grandchild':
        return 0.2
      case 'parent':
        return 0.3
      case 'sibling':
        return 0.25
      default:
        return 0.1
    }
  })()
  const base = frac * fair
  return Math.round(willRole(p) === 'spouse' ? Math.max(base, 0.2 * Math.max(0, net)) : base)
}

/** Legal fees for one contest: a slice of the estate, capped. */
export function contestFee(g: GameState, p: Person, net: number): number {
  const typical = typicalIncome(g, personCountry(g, p))
  return Math.round(Math.max(0, Math.min(0.12 * net, 0.04 * net + 0.5 * typical)))
}

// ---------------------------------------------------------------------------
// Pending state kept across the generation change (plain JSON in g.flags)

interface Escrow {
  amount: number
  year: number
}

interface Pot {
  claim: number
  odds: number
  /** Year the court decides (0 = not filed yet). */
  year: number
  /** Whom the money comes back to when the claim fails. */
  back: { id: string; pct: number }[]
}

const ESCROW_KEY = 'will.escrow'
const POT_KEY = 'will.pot'

function num(v: Json | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function readEscrow(g: GameState): Escrow | null {
  const raw = g.flags[ESCROW_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const amount = Math.max(0, Math.round(num(raw.amount)))
  return amount > 0 ? { amount, year: num(raw.year) } : null
}

function readPot(g: GameState): Pot | null {
  const raw = g.flags[POT_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const claim = Math.max(0, Math.round(num(raw.claim)))
  if (claim <= 0) return null
  const back: Pot['back'] = []
  if (Array.isArray(raw.back)) {
    for (const b of raw.back) {
      if (b && typeof b === 'object' && !Array.isArray(b) && typeof b.id === 'string' && typeof b.pct === 'number') back.push({ id: b.id, pct: b.pct })
    }
  }
  return { claim, odds: num(raw.odds), year: num(raw.year), back }
}

function writePot(g: GameState, p: Pot | null): void {
  if (!p) delete g.flags[POT_KEY]
  else g.flags[POT_KEY] = { claim: p.claim, odds: p.odds, year: p.year, back: p.back.map((b) => ({ id: b.id, pct: b.pct })) }
}

function writeEscrow(g: GameState, e: Escrow | null): void {
  if (!e) delete g.flags[ESCROW_KEY]
  else g.flags[ESCROW_KEY] = { amount: e.amount, year: e.year }
}

/** Hand a refused or lost claim back to the people it was taken from. */
function refund(g: GameState, pot: Pot): number {
  let given = 0
  const shares = pot.back.map((b) => ({ id: b.id, cash: Math.floor(pot.claim * b.pct) }))
  const total = shares.reduce((a, b) => a + b.cash, 0)
  if (shares.length > 0) shares[0].cash += pot.claim - total // ledger-ok: one relative's cut in a local list, not a purse
  for (const s of shares) {
    if (s.id === CHARITY) {
      given += s.cash
      continue
    }
    const p = g.people.find((x) => x.id === s.id)
    if (p) {
      // The held claim sits in the family pool (bookEstate put it there); it comes back to the relatives it was taken from.
      payFrom(g, poolPurse('family'), p, s.cash, 'inheritance')
      given += s.cash
    }
  }
  return given
}

/** Money still in probate when the player dies joins the estate; a claim not yet decided goes back to the family. Returns the extra estate. */
function takePending(n: GameState): number {
  let extra = 0
  const esc = readEscrow(n)
  if (esc) {
    extra += esc.amount
    writeEscrow(n, null)
  }
  const pot = readPot(n)
  if (pot) {
    refund(n, pot)
    writePot(n, null)
  }
  return extra
}

// ---------------------------------------------------------------------------
// The books (R2-L8): an estate is a flow out of the late player's account

/** The late player's account as a purse: it pays on the books and changes no record (the character is replaced, not debited). */
export function estatePurse(n: GameState): Purse {
  return { acct: playerAcct(n), add: (delta) => delta }
}

/** Moves `cash` from `from` into a person's money (kept on a whole dollar, as it always was). A zero share still rounds the record, as it did. */
function payFrom(g: GameState, from: Purse, p: Person, cash: number, reason: Reason): void {
  if (cash > 0) moveCash(g, from, wholePurse(p), cash, reason)
  else wholePurse(p).add(0)
}

/** A person's share of the estate, booked out of the late player's account. Call it while the late player is still the character. */
export function payHeir(n: GameState, p: Person, cash: number, reason: Reason): void {
  payFrom(n, estatePurse(n), p, cash, reason)
}

export interface EstateBooks {
  /** The late player. */
  old: Character
  heirId: string
  /** Cash plus the equity of the property that is sold, before the loans: what the estate had to pay them with. */
  gross: number
  /** What the late player still owed on loans. */
  debts: number
}

/**
 * Books what the plan paid out, once, from the late player's account (`person:<old.id>`): the heir's cash (inheritance), the estate
 * tax (to the late player's government), the lawyers (legal), the charity (donation), the loans the estate paid off (loan.repay) and
 * those it could not (a declared write-off). Probate money that waited joins the estate from the family pool, and what the court holds
 * (the heir's held half and a claim the heir may press) goes to the family pool, which pays it out when it is released or refunded.
 * The other heirs' cash was booked as planEstate paid them. Call it right after planEstate, while the late player is the character.
 */
export function bookEstate(n: GameState, plan: EstatePlan, e: EstateBooks): void {
  const me = playerAcct(n)
  const gov = counterparty('gov', e.old.countryId)
  const token = (what: string): string => `estate:${e.old.id}:${n.year}:${what}`
  if (plan.carried > 0) book(n, 'estate', 'pool:family', me, plan.carried, token('carried'))
  const owed = Math.max(0, Math.round(e.debts))
  const paid = Math.min(owed, Math.max(0, Math.round(e.gross + plan.carried)))
  if (paid > 0) book(n, 'loan.repay', me, 'pool:banks', paid, token('loans'))
  if (owed > paid) writeoff(n, owed - paid)
  if (plan.heirCash > 0) book(n, 'inheritance', me, `person:${e.heirId}`, plan.heirCash, token('heir'))
  if (plan.tax > 0) book(n, 'tax.estate', me, gov, plan.tax, token('tax'))
  if (plan.fees > 0) book(n, 'legal', me, 'pool:legal', plan.fees, token('fees'))
  if (plan.charityCash > 0) book(n, 'donation', me, 'pool:charity', plan.charityCash, token('charity'))
  if (plan.held > 0) book(n, 'estate', me, 'pool:family', plan.held, token('held'))
  if (plan.pot) book(n, 'estate', me, 'pool:family', plan.pot.claim, token('claim'))
}

/** Clears the late player's account into their country's households once the estate is settled; the sum of all accounts is unchanged. */
export function closeEstate(n: GameState, old: Character): void {
  foldAccount(n, playerAcct(n), counterparty('hh', old.countryId), `estate:${old.id}:${n.year}:fold`)
}

// ---------------------------------------------------------------------------
// The plan

export interface CutOut {
  id: string
  anger: number
  filed: boolean
  outcome: '' | 'won' | 'settled' | 'lost'
  award: number
}

export interface EstatePlan {
  /** True when the will names people (otherwise an even split among the children). */
  willed: boolean
  heirIncluded: boolean
  /** People and charity sharing the estate (for "split N ways"). */
  ways: number
  keepProperty: boolean
  tax: number
  fees: number
  /** Cash the heir gets now. */
  heirCash: number
  /** Cash held back for the heir in probate. */
  held: number
  charityCash: number
  /** Relatives who count as cut out, with how they took it. */
  cutOut: CutOut[]
  /** Offer the heir a chance to contest (they were cut out and the claim is worth something). */
  heirClaim: { claim: number; odds: number; fee: number } | null
  /** The reading of the will, one line per beat. */
  lines: string[]
  /** Extra cash from probate that was waiting when the player died. */
  carried: number
  /** A claim the heir may press, held out of everyone's share until they decide (written to the new state by settleReading). */
  pot: Pot | null
}

export interface EstateInput {
  /** Cash + equity - debts (+ nothing for probate: planEstate adds it). */
  estate: number
  heirId: string
  adult: boolean
  hasProperty: boolean
  /** Cash left once debts are paid (for an heir who keeps the property). */
  cashAfterDebts: number
  /** A government's change to the 25% estate tax (nation/: +0.1 = 35%). */
  taxDelta?: number
}

/** Persons the will leaves out whom the family would count as cut out. */
function excludedFamily(n: GameState, inIds: Set<string>): Person[] {
  const ws = readWill(n)
  return willNameable(n).filter((p) => {
    if (inIds.has(p.id)) return false
    const w = readWl(n, p)
    // A will that names people and leaves out a spouse or any child (even one born after it was written) cuts them out.
    const dependent = ws.written && (p.relation === 'spouse' || p.relation === 'child' || p.relation === 'stepchild')
    return w.cut || dependent
  })
}

/** Would they take it to court? Pure. */
function filingChance(n: GameState, p: Person, anger: number, worth: number): number {
  // A guardian acts for a dependent child whatever the child feels.
  if (p.age < 18) return 0.45 * Math.min(1, worth / (typicalIncome(n, personCountry(n, p)) * 1.5))
  if (anger < 40) return 0
  const exp = expectation(n, p)
  const litigious = p.traits.some((t) => ['hot-headed', 'arrogant', 'manipulative', 'stingy', 'jealous'].includes(t)) ? 0.1 : 0
  const worthIt = Math.min(1, worth / (typicalIncome(n, personCountry(n, p)) * 1.5))
  return clamp(((anger - 35) / 100 + (exp / 100) * 0.25 + litigious) * worthIt, 0, 0.8)
}

/**
 * Work out who gets what and move the money (NPC heirs, the charity, any contestant who wins).
 * Mutates `n` (the state about to become the next generation) and consumes n's randomness.
 */
export function planEstate(n: GameState, input: EstateInput): EstatePlan {
  ensureSnap(n)
  afterWillChange(n, true)
  const carried = takePending(n)
  const estate = input.estate + carried
  const cashAfterDebts = input.cashAfterDebts + carried
  const slices: Slice[] = willSlices(n)
  const people = slices.filter((s) => s.id !== CHARITY && s.pct > 0)
  const inIds = new Set(slices.filter((s) => s.pct > 0).map((s) => s.id))
  const heirIncluded = inIds.has(input.heirId)
  const willed = hasNamedHeirs(n) || slices.some((s) => s.id === CHARITY)
  const plan: EstatePlan = {
    willed,
    heirIncluded,
    ways: slices.filter((s) => s.pct > 0).length,
    keepProperty: false,
    tax: 0,
    fees: 0,
    heirCash: 0,
    held: 0,
    charityCash: 0,
    cutOut: [],
    heirClaim: null,
    lines: [],
    carried,
    pot: null,
  }
  const excluded = excludedFamily(n, inIds)
  const worth = estate / Math.max(1, people.length + 1)

  // Who is out, how they take it, who goes to court.
  const filers: { p: Person; entry: CutOut; chance: number }[] = []
  for (const p of excluded) {
    if (p.age < 13 && p.id !== input.heirId) continue
    const w = readWl(n, p)
    const anger = w.known ? w.anger : angerOnLearning(n, p, 'reading')
    if (!w.known) {
      updateWl(n, p, (x) => {
        x.known = true
        x.how = 'reading'
        x.knownY = n.year
        x.told = 'out'
        x.anger = Math.max(x.anger, anger)
      })
    }
    const entry: CutOut = { id: p.id, anger, filed: false, outcome: '', award: 0 }
    plan.cutOut.push(entry)
    const isAdultHeir = p.id === input.heirId && p.age >= 18
    if (estate > 0 && !isAdultHeir) filers.push({ p, entry, chance: filingChance(n, p, anger, worth) })
  }

  const netBase = Math.max(0, estate)
  const awardsPool: { p: Person; entry: CutOut; award: number }[] = []
  let fees = 0
  if (estate > 0) {
    const sorted = filers.sort((a, b) => b.entry.anger - a.entry.anger)
    let filed = 0
    for (const f of sorted) {
      if (filed >= 2 || f.chance <= 0) continue
      if (!chance(n, f.chance)) continue
      filed += 1
      f.entry.filed = true
      fees += contestFee(n, f.p, netBase)
      const odds = contestOdds(n, f.p)
      const roll = rand(n)
      const award = contestAward(f.p, netBase, people.length)
      if (roll < odds) {
        f.entry.outcome = 'won'
        f.entry.award = award
      } else if (roll < odds + 0.15) {
        f.entry.outcome = 'settled'
        f.entry.award = Math.round(award / 2)
      } else {
        f.entry.outcome = 'lost'
      }
      if (f.entry.award > 0) awardsPool.push({ p: f.p, entry: f.entry, award: f.entry.award })
    }
  }
  fees = Math.min(fees, Math.round(netBase * 0.2))
  plan.fees = fees
  const contested = plan.cutOut.some((c) => c.filed)

  // Estate math. A sole adult heir keeps the property untaxed (as before) unless a court took a share.
  const soleKeeper = heirIncluded && people.length === 1 && !slices.some((s) => s.id === CHARITY) && input.adult && input.hasProperty && cashAfterDebts >= 0 && awardsPool.length === 0 && fees === 0
  if (soleKeeper) {
    plan.keepProperty = true
    plan.heirCash = Math.round(cashAfterDebts)
    return plan
  }
  if (estate <= 0) return plan
  plan.tax = estate > 10_000_000 ? Math.round((estate - 10_000_000) * Math.max(0, Math.min(0.8, 0.25 + (Number.isFinite(input.taxDelta) ? input.taxDelta! : 0)))) : 0
  let pot = estate - plan.tax - fees
  if (pot < 0) pot = 0

  // Court awards come off the top (never more than 60% of what is left).
  const totalAward = awardsPool.reduce((a, b) => a + b.award, 0)
  const scale = totalAward > pot * 0.6 && totalAward > 0 ? (pot * 0.6) / totalAward : 1
  for (const a of awardsPool) {
    const paid = Math.floor(a.award * scale)
    a.entry.award = paid
    payHeir(n, a.p, paid, 'inheritance')
    pot -= paid
    notePerson(a.p, 'Won part of a share in a contested will.')
  }

  // The heir, cut out, may fight for a share themselves: that claim waits on the court.
  const heirP = n.people.find((p) => p.id === input.heirId)
  if (!heirIncluded && heirP && input.adult && excluded.some((p) => p.id === input.heirId) && willed) {
    const claim = Math.min(contestAward(heirP, pot, people.length), Math.floor(pot * 0.5))
    if (claim >= 1) {
      const odds = contestOdds(n, heirP)
      const fee = Math.max(1, Math.round(Math.min(claim * 0.12, 0.4 * typicalIncome(n, personCountry(n, heirP)))))
      plan.heirClaim = { claim, odds, fee }
      pot -= claim
      plan.pot = { claim, odds, year: 0, back: slices.filter((s) => s.pct > 0).map((s) => ({ id: s.id, pct: s.pct })) }
    }
  }

  // Slices (each rounded down, as it always was: less than a dollar per heir is lost to rounding).
  const cash = slices.map((s) => ({ id: s.id, cash: Math.floor(pot * s.pct + 1e-9) }))
  for (const c of cash) {
    if (c.id === CHARITY) {
      plan.charityCash = c.cash
      continue
    }
    if (c.id === input.heirId) {
      plan.heirCash = c.cash
      continue
    }
    const p = n.people.find((x) => x.id === c.id)
    if (p) payHeir(n, p, c.cash, 'inheritance')
  }
  if (contested && plan.heirCash > 0) {
    plan.held = Math.round(plan.heirCash * 0.5)
    plan.heirCash -= plan.held
  }
  return plan
}

// ---------------------------------------------------------------------------
// The scene

/** Say what happened at the reading (second person, from the heir's seat). Needs the heir to be the player already. */
function readingLines(n: GameState, plan: EstatePlan, old: Character, heirId: string): string[] {
  const lines: string[] = []
  const poss = old.gender === 'male' ? 'his' : 'her'
  lines.push('The lawyer put on reading glasses and read the will out in a flat voice.')
  for (const c of plan.cutOut) {
    const p = n.people.find((x) => x.id === c.id)
    if (!p || p.id === heirId) continue
    const prior = `${p.firstName}`
    if (c.anger < 12) lines.push(`${prior} shrugged. It was never about the money.`)
    else lines.push(`${prior} ${reactionClause(p, c.anger)}${c.anger >= 55 ? ' and left before the lawyer finished reading' : ''}.`)
  }
  const heirCut = plan.cutOut.find((c) => c.id === heirId)
  if (heirCut) lines.push(`You were not in ${poss} will.`)
  for (const c of plan.cutOut) {
    if (!c.filed) continue
    const p = n.people.find((x) => x.id === c.id)
    if (!p) continue
    if (c.outcome === 'won') lines.push(`${p.firstName} took the will to court and won ${formatMoney(c.award)}.`)
    else if (c.outcome === 'settled') lines.push(`${p.firstName} took the will to court; the family settled and ${p.firstName} got ${formatMoney(c.award)}.`)
    else lines.push(`${p.firstName} took the will to court and lost.`)
  }
  if (plan.fees > 0) lines.push(`Lawyers on both sides billed the estate ${formatMoney(plan.fees)}.`)
  if (plan.held > 0) lines.push(`Probate froze ${formatMoney(plan.held)} of your share while the court sorted it out.`)
  if (plan.charityCash > 0) lines.push(`${formatMoney(plan.charityCash)} went to charity.`)
  return lines
}

function isSiblingOf(p: Person): boolean {
  return p.relation === 'sibling' || p.relation === 'halfSibling' || p.relation === 'stepsibling'
}

/**
 * The reading of the will, from the heir's seat: shock and slammed doors, siblings who got
 * everything, an angry sibling asking for a share, the choice to contest. Call it once the heir is
 * the player (n.character) and the people list has been rebuilt; `old` is the late player.
 */
export function settleReading(n: GameState, plan: EstatePlan, old: Character, heirId: string): void {
  const out: string[] = []
  // The new generation's flags were rebuilt after the plan was made: record the claim now.
  if (plan.pot) writePot(n, plan.pot)
  if (plan.cutOut.length === 0 && plan.fees === 0 && plan.held === 0 && plan.charityCash === 0) return

  // Held back in probate for the heir.
  if (plan.held > 0) {
    const years = randInt(n, 1, 3)
    writeEscrowFor(n, plan.held, n.year + years)
  }

  // The family's feelings toward the heir.
  const heirCut = plan.cutOut.find((c) => c.id === heirId)
  for (const c of plan.cutOut) {
    const p = n.people.find((x) => x.id === c.id)
    if (!p || p.id === heirId) continue
    if (heirCut) addRelationship(p, 5)
    else addRelationship(p, -Math.round(c.anger / 8))
  }
  out.push(...readingLines(n, plan, old, heirId))

  // Siblings who got everything react to the heir being cut out.
  if (heirCut) {
    const sibs = n.people.filter((p) => p.alive && isSiblingOf(p) && p.id !== heirId && plan.cutOut.every((c) => c.id !== p.id))
    for (const s of sibs.slice(0, 3)) {
      const t = temper(s)
      const gloat = s.traits.filter((tr) => ['jealous', 'arrogant', 'stingy', 'manipulative'].includes(tr)).length
      const kind = t.forgiving + (s.relationship >= 60 ? 2 : 0)
      const mood = weightedPick(n, ['guilt', 'gloat', 'shrug'] as const, (m) => (m === 'guilt' ? 0.4 + kind : m === 'gloat' ? 0.2 + 2 * gloat : 1))
      if (mood === 'guilt' && s.money > 0) {
        const amt = Math.min(Math.round(s.money), Math.max(1, Math.round(s.money * randFloat(n, 0.2, 0.5))))
        moveCash(n, wholePurse(s), askedPurse(n), amt, 'gift')
        addRelationship(s, 8)
        log(n, `${s.firstName} felt guilty and shared ${formatMoney(amt)} of the inheritance with me.`, 'good')
        out.push(`${s.firstName} pulled you aside, red-eyed, and pressed ${formatMoney(amt)} into your hands. "It isn't fair. Take it."`)
      } else if (mood === 'gloat') {
        addRelationship(s, -12)
        addStat(n, 'happiness', -4)
        log(n, `${s.firstName} gloated about getting the inheritance.`, 'bad')
        out.push(`${s.firstName} didn't try very hard to hide a smile. You will remember that smile.`)
      } else {
        addRelationship(s, -3)
        out.push(`${s.firstName} stared at the carpet and said nothing at all.`)
      }
    }
  }

  notice(n, 'The Reading of the Will', out.join('\n\n'), { emoji: EMOJI, tone: heirCut ? 'bad' : undefined })

  // An angry sibling who was cut out asks the heir for a share.
  if (!heirCut) {
    const asker = plan.cutOut
      .filter((c) => c.anger >= 45 && c.id !== heirId && c.outcome !== 'won' && c.outcome !== 'settled')
      .sort((a, b) => b.anger - a.anger)
      .map((c) => ({ c, p: n.people.find((x) => x.id === c.id) }))
      .find(({ p }) => !!p && p.alive && isSiblingOf(p) && p.age >= 18)
    if (asker && asker.p && plan.heirCash > 0) {
      const p = asker.p
      const cash = plan.heirCash
      const half = Math.round(cash / 2)
      const tenth = Math.round(cash / 10)
      scriptChoice(
        n,
        S_ASK,
        `${p.firstName} Wants a Share`,
        `${p.firstName} caught you outside the lawyer's office. "You got everything. I got a speech about how ${old.gender === 'male' ? 'he' : 'she'} 'loved me in ${old.gender === 'male' ? 'his' : 'her'} own way.' Be fair."`,
        [
          { id: 'half', label: `Split it evenly (give ${formatMoney(half)})`, emoji: '\u{2696}\u{FE0F}' },
          { id: 'tenth', label: `Give a tenth (${formatMoney(tenth)})`, emoji: '\u{1F91D}' },
          { id: 'keep', label: 'Keep what the will gave you', emoji: '\u{1F512}' },
        ],
        { emoji: EMOJI, data: { pid: p.id, cash, anger: asker.c.anger }, personId: p.id },
      )
    }
  }

  // The cut-out heir may take the family to court.
  if (plan.heirClaim) {
    const { claim, odds, fee } = plan.heirClaim
    const pct = Math.round(odds * 100)
    const options = [
      ...(canAfford(n, fee) ? [{ id: 'contest', label: `Contest the will (about ${pct}% to win, ${formatMoney(fee)} in fees)`, emoji: '\u{2696}\u{FE0F}' }] : []),
      { id: 'talk', label: 'Ask the family to be fair, no lawyers', emoji: '\u{1F54A}\u{FE0F}' },
      { id: 'drop', label: 'Let it go', emoji: '\u{1F64F}' },
    ]
    scriptChoice(
      n,
      S_HEIR,
      'Contest the Will?',
      `You were cut out. A lawyer thinks you might have a case for about ${formatMoney(claim)}. Courts side with someone in your position about ${pct}% of the time, it takes one to three years, and ${canAfford(n, fee) ? `it will cost ${formatMoney(fee)} in fees whether you win or not, and the relatives you sue will not forget it` : 'you can’t afford the fees right now'}.`,
      options,
      { emoji: '\u{2696}\u{FE0F}', data: { claim, odds, fee } },
    )
  }
}

function writeEscrowFor(n: GameState, amount: number, year: number): void {
  writeEscrow(n, { amount, year })
}

defineScript(S_ASK, (g, choice, data) => {
  const pidv = data && typeof data === 'object' && !Array.isArray(data) ? data.pid : ''
  const cashv = data && typeof data === 'object' && !Array.isArray(data) ? data.cash : 0
  const p = typeof pidv === 'string' ? g.people.find((x) => x.id === pidv) : undefined
  if (!p || !p.alive || typeof cashv !== 'number') return
  const c = g.character
  if (choice === 'keep') {
    updateWl(g, p, (w) => {
      w.hard = Math.min(3, w.hard + 1)
    })
    addRelationship(p, -10)
    log(g, `I kept my whole inheritance when ${p.firstName} asked for a share.`, 'bad')
    notice(g, 'Fair Is Fair', `You kept it all. ${p.firstName} nodded slowly, the way people do when they've decided something about you.`, { emoji: EMOJI, tone: 'bad' })
    return
  }
  const amt = Math.min(Math.max(0, Math.round(c.money)), choice === 'half' ? Math.round(cashv / 2) : Math.round(cashv / 10))
  if (amt <= 0) return
  moveCash(g, askedPurse(g), wholePurse(p), amt, 'gift')
  noteCashGift(g, p, amt)
  addRelationship(p, choice === 'half' ? 22 : 10)
  addStat(g, 'happiness', choice === 'half' ? 4 : 2)
  log(g, `I shared ${formatMoney(amt)} of my inheritance with ${p.firstName}.`, 'good')
  notice(g, 'Fair Is Fair', `You gave ${p.firstName} ${formatMoney(amt)}. ${choice === 'half' ? 'It cost you half. It bought you a sibling.' : 'It was not nothing. It was not everything.'}`, { emoji: EMOJI, tone: 'good' })
})

defineScript(S_HEIR, (g, choice, data) => {
  const pot = readPot(g)
  if (!pot) return
  const fee = data && typeof data === 'object' && !Array.isArray(data) ? num(data.fee) : 0
  const siblings = g.people.filter((p) => p.alive && isSiblingOf(p))
  if (choice === 'contest') {
    if (!canAfford(g, fee)) {
      refund(g, pot)
      writePot(g, null)
      return
    }
    addMoney(g, -fee, 'legal')
    writePot(g, { ...pot, year: g.year + randInt(g, 1, 3) })
    for (const s of siblings) addRelationship(s, -randInt(g, 6, 12))
    log(g, `I took my ${g.character.gender === 'male' ? 'father' : 'mother'}'s will to court.`)
    notice(g, 'See You in Court', `Your lawyer filed the papers and billed you ${formatMoney(fee)} for the privilege. The court will decide in a year or three. The next family get-together will be interesting.`, { emoji: '\u{2696}\u{FE0F}' })
    return
  }
  if (choice === 'talk') {
    const odds = clamp(pot.odds * 0.5 + 0.1, 0.05, 0.5)
    const agreed = chance(g, odds)
    const given = agreed ? Math.round(pot.claim / 2) : 0
    if (given > 0) addMoney(g, given, 'inheritance')
    refund(g, { ...pot, claim: pot.claim - given })
    writePot(g, null)
    for (const s of siblings) addRelationship(s, agreed ? 3 : -2)
    log(g, agreed ? `My family agreed to give me ${formatMoney(given)} of the estate.` : 'I asked my family to be fair about the will. It went nowhere.', agreed ? 'good' : 'neutral')
    notice(g, 'A Family Conversation', agreed ? `After a long, awkward talk, the family agreed to give you ${formatMoney(given)}. No lawyers. Some forgiveness.` : 'You asked nicely. The answer was a polite, immovable no.', { emoji: EMOJI, tone: agreed ? 'good' : undefined })
    return
  }
  refund(g, pot)
  writePot(g, null)
  for (const s of siblings) addRelationship(s, 2)
  log(g, 'I let the will stand.')
})

// ---------------------------------------------------------------------------
// Years later

/** Yearly: release the share held in probate and let the court decide a claim the heir filed. */
export function yearlyEstateTail(g: GameState): void {
  const esc = readEscrow(g)
  if (esc && g.year >= esc.year) {
    addMoney(g, esc.amount, 'inheritance')
    writeEscrow(g, null)
    log(g, `Probate released ${formatMoney(esc.amount)} of my inheritance.`, 'good')
    notice(g, 'Probate Cleared', `The court released the ${formatMoney(esc.amount)} that had been held back from your inheritance. The lawyers have moved on to someone else's family.`, { emoji: EMOJI, tone: 'good' })
  }
  const pot = readPot(g)
  if (pot && pot.year > 0 && g.year >= pot.year) {
    const win = chance(g, pot.odds)
    const siblings = g.people.filter((p) => p.alive && isSiblingOf(p))
    if (win) {
      addMoney(g, pot.claim, 'inheritance')
      writePot(g, null)
      for (const s of siblings) addRelationship(s, -5)
      log(g, `The court gave me ${formatMoney(pot.claim)} of the estate.`, 'good')
      notice(g, 'The Court Rules', `The judge found for you. ${formatMoney(pot.claim)} is yours. It cost more than money to get, and your relatives have noticed that too.`, { emoji: '\u{2696}\u{FE0F}', tone: 'good' })
    } else {
      refund(g, pot)
      writePot(g, null)
      for (const s of siblings) addRelationship(s, -3)
      addStat(g, 'happiness', -3)
      log(g, 'The court upheld the will. I got nothing and a bill.', 'bad')
      notice(g, 'The Court Rules', 'The judge upheld the will. You got nothing, and the fees were already spent. At least the relatives are no longer your opponents; they are merely people who testified against you.', { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
    }
  }
}
