// What the player does with a conglomerate: form one, bring more companies in, move cash
// between divisions, pay a group dividend, set a group mandate, hire (and replace, as often as
// they like) a group CEO, buy rivals with the group's cash, spin divisions off, and list or delist
// the whole group. Every deal pays real fees; boards with outside members vote on anything that
// touches their shareholders; nothing here creates value out of thin air (merger stakes are set at
// fair value and spin-offs hand every holder their share).
import { firmCash, firmPurse, moveCash as moveBetween } from '../cash'
import { addMoney, addStat, count, earnIncome, endJob, formatMoney, log, moneyWith, notice, remember, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { arrestPlayer } from '../crime'
import { exchangeFor } from '../data/markets'
import type { Reason } from '../kernel/reasons'
import { masterBusiness } from '../mastery'
import { saleImpact } from '../invest/liquidity'
import { bell, chance, randInt, uid } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { boardAllows, hasBoard, needsVote, ownerControls, passOdds, setMandate, vote, type Mandate, type Proposal, type VoteResult } from './board'
import { boardView, mandateDef } from './board-state'
import { payableCash, refusedThisYear, reserveDollars, sustainablePayout } from './board-vote'
import { mandateMerit } from './board-ceo'
import { ceoSeverance, headhunterFee, managerCandidate, managerName, paySeverance, shortlist, SMART_SKILL, STYLE_INFO, styleOf, type SearchKind } from './career'
import { acquireRival, acquisitionQuote } from './competition-moves'
import { marketViewOf } from './competition'
import {
  antitrustBlock,
  captureOf,
  conglomerateDiscount,
  dealFee,
  dealMerit,
  groupAcquireBlock,
  groupCeoValue,
  joinValue,
  mergeTerms,
  ownerCapture,
  spinOffFee,
  spinValue,
  type DivisionInput,
} from './conglomerate-econ'
import {
  detach,
  diluteGroupEquity,
  dissolveIfAlone,
  fundamental,
  groupIdOf,
  groupValue,
  inGroup,
  liveGroup,
  moodOf,
  multFor,
  newMembership,
  operating,
  returnExecutiveSlice,
  sharePriceOf,
  saveGroup,
  syncMembers,
  GROUP_VERSION,
  type Group,
  type GroupCore,
  type GroupMember,
} from './conglomerate-state'
import { LASTING_YEARS, refreshValue, valuationOf } from './economy'
import { capitalGainsTax, familyNote, IPO_COLLAPSE, ipoThreshold } from './exit'
import { earmarkedCash } from './gamestudio'
import { clearGroupCeoJob, clearGroupJob, readGroupJob } from './conglomerate-job'
import { BIZ_VERSION, bizOf, ceoJob, executiveEquity, findBusiness, normalizeBiz, readBiz, type BizState, type Manager, type Statement } from './state'
import { equityTarget, stakeText } from './executive-shares'
import { cashOutFamilyHolders, payFamilyGroupDividend } from './dynasty-ownership'
import { FLOAT_DEFAULT, ipoPlan, shareCountText } from './share-structure'
import { listingMood } from '../history/market-events'
import { clampN, cleanName, markBest, money, num, pct, rec, round2, str, toJson } from './util'

// ---------------------------------------------------------------------------
// Gates

/** Why the player can't run a group right now, or null. */
export function groupBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't run a group of companies from a prison cell. The group's executives are handling it."
  if (c.age < 18) return 'You must be 18 to run a group of companies.'
  return null
}

/** Why this company can't join a group now (null: it can). Pure. */
export function joinBlock(g: GameState, a: Asset): string | null {
  const cur = findBusiness(g, a.id)
  if (!cur) return 'You no longer own this business.'
  const b = readBiz(g, cur)
  if (inGroup(g, b)) return `${cur.name} already belongs to ${str(rec(rec(b.group)?.core)?.name, 'a group')}.`
  if (!ownerControls(g, cur)) return `You don't control ${cur.name}'s board, so you can't bring it into a group.`
  return null
}

// ---------------------------------------------------------------------------
// The group as one company (its board votes; its CEO's pay is benchmarked against it)

function inputs(grp: Group): DivisionInput[] {
  return grp.members.map((x) => ({ id: x.a.id, b: x.b, own: x.m.own }))
}

/** The divisions' last booked statements added up (null before any booked year). */
function consolidated(grp: Group): Statement | null {
  const books = grp.members.map((x) => x.b.last).filter((s): s is Statement => !!s)
  if (!books.length) return null
  const year = Math.max(...books.map((s) => s.year))
  const out: Record<string, number> = {}
  for (const s of books) {
    if (s.year !== year) continue
    for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v
  }
  out.year = year
  return out as unknown as Statement
}

/** True when the group has a board of its own (outside shareholders, or a listing). */
export function groupHasBoard(core: GroupCore): boolean {
  return core.share < 0.999 || !!core.listing
}

/** The whole group as one company, for its board and its CEO's pay (never stored). */
export function groupBiz(g: GameState, grp: Group): BizState {
  const lead = grp.members[0].b
  const sum = (f: (b: BizState) => number) => grp.members.reduce((s, x) => s + (Number.isFinite(f(x.b)) ? f(x.b) : 0), 0)
  const n = Math.max(1, grp.members.length)
  const debt = sum((b) => b.debt)
  const core = grp.core
  const d = toJson({
    v: BIZ_VERSION,
    industry: lead.industry,
    countryId: lead.countryId,
    city: lead.city,
    founded: core.founded,
    founderName: '',
    acquired: false,
    share: core.share,
    invested: sum((b) => b.invested),
    cash: sum((b) => b.cash),
    debt,
    debtRate: debt > 0 ? sum((b) => b.debt * b.debtRate) / debt : 0.08,
    employees: sum((b) => b.employees),
    wageLevel: 1,
    morale: Math.round(sum((b) => b.morale) / n),
    staff: [],
    quality: Math.round(sum((b) => b.quality) / n),
    brand: Math.round(sum((b) => b.brand) / n),
    outlets: grp.members.flatMap((x) => x.b.outlets),
    history: core.history.map((h) => ({ year: h.year, revenue: h.revenue, profit: h.profit, tax: 0, units: 0, price: 0, staff: 0, valuation: h.value, outlets: 0 })),
    last: consolidated(grp),
    valuation: groupValue(grp),
    public: !!core.listing,
    sharesOut: core.listing?.sharesOut ?? 0,
    sharePrice: core.listing ? sharePriceOf(grp) : 0,
    exchange: core.listing?.exchange ?? '',
    ipoYear: core.listing?.ipoYear ?? 0,
    ceo: core.ceo,
    manager: core.manager,
    ownerSalary: 0,
    board: core.board,
  })
  return normalizeBiz(rec(d) ?? {}, g.year)
}

function groupAsset(grp: Group, gb: BizState): Asset {
  return { id: grp.core.id, kind: 'business', name: grp.core.name, emoji: '\u{1F3E2}', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 0, upkeep: 0, details: gb as unknown as Record<string, Json> }
}

/** True when the group's board turned down a merger-type proposal from the owner this year. Pure. */
function groupRefused(g: GameState, grp: Group): boolean {
  const st = groupBoardView(g, grp)
  return !!st && st.refused.merge === g.year
}

/** Put a proposal to the group's board (passes without a board). The caller saves the group. */
export function groupVote(g: GameState, grp: Group, p: Proposal, opts: { quiet?: boolean } = {}): VoteResult {
  if (!groupHasBoard(grp.core)) return { passed: true, yes: 0, no: 0, vetoed: false, skipped: true }
  const gb = groupBiz(g, grp)
  const r = vote(g, groupAsset(grp, gb), gb, p, opts)
  if (gb.board) grp.core.board = toJson(gb.board)
  return r
}

/** The exact chance the group's board passes a proposal (1 without a board). Pure. */
export function groupPassOdds(g: GameState, grp: Group, p: Proposal): number {
  if (!groupHasBoard(grp.core)) return 1
  const gb = groupBiz(g, grp)
  return passOdds(g, groupAsset(grp, gb), gb, p)
}

/** Why a proposal needs the group's board (null: the group may simply do it). Pure. */
export function groupNeedsVote(g: GameState, grp: Group, p: Proposal): string | null {
  if (!groupHasBoard(grp.core)) return null
  const gb = groupBiz(g, grp)
  return needsVote(g, groupAsset(grp, gb), gb, p)
}

/** The group's board as it sits now (null without one). Pure. */
export function groupBoardView(g: GameState, grp: Group) {
  if (!groupHasBoard(grp.core)) return null
  const gb = groupBiz(g, grp)
  return boardView(g, groupAsset(grp, gb), gb)
}

/** The gate for the group's decisions: true when it may go ahead (voting when it must). */
export function groupAllows(g: GameState, grp: Group, p: Proposal): boolean {
  if (p.by === 'owner' && grp.core.share <= 0) return false
  if (!groupNeedsVote(g, grp, p)) return true
  return groupVote(g, grp, p).passed
}

// ---------------------------------------------------------------------------
// Cash: what can leave a division, and fees

/** Cash a division can hand to the group: above its debts, earmarks and the board's reserve. */
export function movableCash(g: GameState, x: GroupMember): number {
  if (x.m.own < 0.999) return 0
  return Math.max(0, Math.round(payableCash(x.a, x.b) - reserveDollars(x.b, boardView(g, x.a, x.b))))
}

/** Cash a company can spend on a fee right now (not money earmarked for unreleased games). */
function spendable(a: Asset, b: BizState): number {
  return Math.max(0, Math.round(b.cash - earmarkedCash(a)))
}

/** What the player must add from their own pocket for these fees (0: the companies can pay). */
export function feeShortfall(parts: { a: Asset; b: BizState; fee: number }[]): number {
  return parts.reduce((s, p) => s + Math.max(0, p.fee - spendable(p.a, p.b)), 0)
}

function charge(g: GameState, a: Asset, b: BizState, n: number, reason: Reason): void {
  const v = Math.max(0, Math.round(n))
  if (!v) return
  firmCash(g, b, -v, reason, a.id)
  b.yearCosts += v
  if (!b.public) b.valuation = Math.max(0, Math.round(b.valuation - v))
}

/**
 * Pay each company's fee from its cash, the player covering any shortfall (added to their stake's
 * cost). Returns what came from the player and what each company is worth afterwards (a listed
 * company's market price doesn't move with its cash, so the fee comes off its market value here).
 */
function payFees(g: GameState, parts: { a: Asset; b: BizState; fee: number }[]): { fromOwner: number; worth: number[] } {
  let fromOwner = 0
  const worth: number[] = []
  for (const p of parts) {
    const fee = Math.max(0, Math.round(p.fee))
    const own = Math.min(fee, spendable(p.a, p.b))
    charge(g, p.a, p.b, own, 'legal')
    const rest = fee - own
    if (rest > 0) {
      addMoney(g, -rest, 'legal')
      p.b.invested += rest
      p.b.yearCosts += rest
      fromOwner += rest
    }
    worth.push(Math.max(0, Math.round(p.b.valuation - (p.b.public ? own : 0))))
    refreshValue(p.a, p.b)
  }
  return { fromOwner, worth }
}

/** Move cash between two divisions of a group (no P&L: it is the same group's money). */
function shift(g: GameState, fromX: GroupMember, toX: GroupMember, n: number): void {
  const from = fromX.b
  const to = toX.b
  const v = Math.max(0, Math.round(n))
  if (!v) return
  moveBetween(g, firmPurse(from, fromX.a.id), firmPurse(to, toX.a.id), v, 'inject')
  if (!from.public) from.valuation = Math.max(0, Math.round(from.valuation - v))
  if (!to.public) to.valuation = Math.round(to.valuation + v)
}

/** Pull up to `need` from the other divisions' movable cash into `to` (biggest surplus first). */
function pool(g: GameState, grp: Group, to: GroupMember, need: number, from?: { x: GroupMember; n: number }[]): number {
  let left = Math.max(0, Math.round(need))
  const others = grp.members.filter((x) => x.a.id !== to.a.id).map((x) => ({ x, spare: movableCash(g, x) })).sort((p, q) => q.spare - p.spare)
  let moved = 0
  for (const o of others) {
    if (left <= 0) break
    const take = Math.min(left, o.spare)
    if (take <= 0) continue
    shift(g, o.x, to, take)
    from?.push({ x: o.x, n: take })
    left -= take
    moved += take
  }
  return moved
}

/** The division that holds the group's treasury: the biggest one the group fully owns. */
export function treasuryOf(grp: Group): GroupMember {
  return grp.members.find(x => x.a.id === grp.core.treasuryId && x.m.own >= .999) ?? grp.members.find((x) => x.m.own >= 0.999) ?? [...grp.members].sort((p, q) => q.m.own - p.m.own)[0]
}

// ---------------------------------------------------------------------------
// Valuing the group after a change of shape

/**
 * Set the group's value multiplier after a division left: a private group's is the conglomerate
 * discount alone; a listed group keeps the market's mood on its operating value (cash counts at
 * face), with the discount recomputed for what is left. Restructuring therefore never revalues
 * cash, and the only value a spin-off unlocks is the discount it lifts.
 */
function revalue(grp: Group, mood: number): void {
  const d = conglomerateDiscount(inputs(grp))
  grp.core.discount = d
  grp.core.mult = grp.core.listing ? clampN(mood * (1 - d), 0.3, 3) : clampN(1 - d, 0.3, 1)
  syncMembers(grp)
}

/** Spread the player's cost basis over the divisions by value (a merger swaps stakes, not money). */
function spreadBasis(grp: Group, extra = 0): void {
  const total = grp.members.reduce((s, x) => s + Math.max(0, x.b.invested), 0) + Math.max(0, extra)
  const w = grp.members.map((x) => Math.max(1, x.m.own * Math.max(0, x.b.valuation)))
  const sw = w.reduce((s, x) => s + x, 0)
  grp.members.forEach((x, i) => (x.b.invested = Math.round((total * w[i]) / sw)))
}

// ---------------------------------------------------------------------------
// Forming a group and bringing companies in

export function suggestGroupName(g: GameState): string {
  const words = ['Holdings', 'Group', 'Industries', 'Enterprises', 'Consolidated']
  const n = Math.max(0, Math.round(num(g.counters.conglomerates)))
  return `${g.character.lastName} ${words[n % words.length]}`
}

function newCore(g: GameState, name: string, share: number): GroupCore {
  return {
    v: GROUP_VERSION,
    id: uid(g, 'grp'),
    name,
    rev: 0,
    founded: g.year,
    share,
    mult: 1,
    discount: 0,
    ceo: 'owner',
    manager: null,
    mandate: null,
    listing: null,
    delisted: 0,
    history: [],
    synergy: null,
    memo: [],
    letter: 0,
    misses: 0,
    ipoHint: false,
  }
}

/** Due diligence when outside holders are involved: cooked books can sink the deal (and worse). */
function dueDiligence(g: GameState, parts: { a: Asset; b: BizState }[], outsiders: boolean): boolean {
  if (!outsiders) return true
  for (const p of parts) {
    if (p.b.cooked <= 0 || !chance(g, 0.4)) continue
    p.b.cooked = 0
    p.b.brand = clampN(p.b.brand - 15, 0, 100)
    log(g, `The merger collapsed when the lawyers found ${p.a.name}'s cooked books.`, 'bad')
    notice(g, 'Merger Collapsed', `The other side's auditors found ${p.a.name}'s creative accounting during due diligence. The deal is off, and the minority shareholders' lawyers sent everything to the authorities.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    if (chance(g, 0.5)) arrestPlayer(g, 'Accounting Fraud', 3, { evidence: 0.7, noResist: true, context: `Prosecutors charged you over ${p.a.name}'s cooked books.` })
    return false
  }
  return true
}

interface Ballot {
  who: string
  r: VoteResult
}

function ballotText(list: Ballot[]): string {
  return list.map((x) => `${x.who}: ${x.r.yes}\u{2013}${x.r.no} ${x.r.passed ? 'in favor' : 'against'}`).join('; ')
}

/** A rejected deal still bills a quarter of the fees (bankers and lawyers did the work). */
function brokenDeal(g: GameState, parts: { a: Asset; b: BizState; fee: number }[], ballots: Ballot[], what: string): void {
  let billed = 0
  for (const p of parts) {
    const bill = Math.min(Math.round(p.fee * 0.25), spendable(p.a, p.b))
    charge(g, p.a, p.b, bill, 'legal')
    refreshValue(p.a, p.b)
    billed += bill
  }
  log(g, `The boards voted down ${what}.`, 'bad')
  notice(g, 'Deal Voted Down', `The boards voted on ${what}: ${ballotText(ballots)}. The deal is off${billed > 0 ? `, and the bankers and lawyers still billed ${formatMoney(billed)}` : ''}.`, { emoji: '\u{1F3DB}\u{FE0F}', tone: 'bad' })
}

/**
 * Fold `joiners` into `grp` (fees paid, votes passed): listings, preferences, stakes and values.
 * `worth` is what each joiner was worth after the fees: its holders swap into group shares at
 * exactly that, and the group's value grows by exactly that (less any change in the
 * conglomerate discount). The market's mood on a listed group is never applied to a newcomer for
 * free, so merging and spinning off can't conjure value; a listed joiner is valued on its
 * fundamentals inside the group like every other division.
 */
function admit(g: GameState, grp: Group, joiners: { a: Asset; b: BizState }[], worth: number[]): void {
  const core = grp.core
  const prior = grp.members.length ? groupValue(grp) : 0
  const priorOp = operating(grp)
  const priorDiscount = grp.members.length >= 2 ? core.discount : 0
  const mood = moodOf(core)
  const value = (i: number) => (Number.isFinite(worth[i]) ? Math.max(0, worth[i]) : 0)
  const credited = joiners.reduce((s, _j, i) => s + value(i), 0)
  // The player's share at fair value after the fees (before any preference converts).
  const share = mergeTerms(grp.members.length ? { value: prior, share: core.share } : null, joiners.map((j, i) => ({ id: j.a.id, b: { ...j.b, valuation: value(i) } }))).share
  // A listed company's shareholders swap into the group: the group takes over its listing.
  const listed = joiners.filter((j) => j.b.public).sort((p, q) => q.b.valuation - p.b.valuation)
  let fresh = false
  if (!core.listing && listed.length) {
    const top = listed[0].b
    core.listing = { exchange: top.exchange || exchangeFor(top.countryId).code, ipoYear: top.ipoYear || g.year, sharesOut: 1000, sharePrice: 1 }
    fresh = true
  }
  for (const j of joiners) {
    // Investors' preferred shares convert into group shares at fair value (it priced them in).
    j.b.pref = 0
    if (j.b.public) {
      j.b.public = false
      j.b.sharesOut = 0
      j.b.sharePrice = 0
      j.b.exchange = ''
      j.b.ipoYear = 0
      // Its holders were paid the market price; inside the group it is valued like any division.
      j.b.valuation = valuationOf(j.b)
    }
    j.b.morale = clampN(j.b.morale - 3, 0, 100)
    grp.members.push({ a: j.a, b: j.b, m: newMembership(g, core) })
  }
  core.share = clampN(share, 0.001, 1)
  if (prior > 0 && credited > 0) diluteGroupEquity(grp, prior / (prior + credited))
  // Every outside holder swaps into group shares, including vested executives.
  // Convert after diluting the existing group so a newcomer's award is not diluted twice.
  joiners.forEach((j, i) => {
    const weight = value(i) / Math.max(1, prior + credited)
    for (const holder of j.b.familyShares ?? []) {
      const existing = (core.familyShares ??= []).find(x => x.id === holder.id)
      if (existing) existing.share += holder.share * weight
      else core.familyShares.push({ id: holder.id, share: holder.share * weight })
    }
    delete j.b.familyShares
    const vested = Math.min(Math.max(0, 1 - j.b.share), executiveEquity(j.b))
    if (!vested) return
    core.executiveEquity = (core.executiveEquity ?? 0) + vested * weight
    const manager = j.b.manager, active = Math.min(vested, manager?.equity ?? 0)
    if (manager && active > 0) {
      manager.groupEquity = { id: core.id, share: active * weight, credit: active }
      delete manager.equity
    }
    j.b.executiveEquity = 0
  })
  spreadBasis(grp)
  if (core.mandate) for (const j of joiners) if (ownerControls(g, j.a)) setMandate(g, j.a, j.b, core.mandate)
  const d = conglomerateDiscount(inputs(grp))
  core.discount = d
  if (core.listing) {
    // Worth what it was plus what came in, less the change in the discount at the market's mood.
    const cap = Math.max(1, prior + credited - mood * (d * operating(grp) - priorDiscount * priorOp))
    // New shares go to the newcomers' holders at the market price.
    core.listing.sharesOut = fresh || prior <= 0 ? Math.max(1000, Math.round(cap / 25)) : Math.max(1000, Math.round((core.listing.sharesOut * (prior + credited)) / prior))
    core.mult = multFor(grp, cap)
  } else core.mult = clampN(1 - d, 0.3, 1)
  syncMembers(grp)
  grp.members.sort((p, q) => q.m.own * q.b.valuation - p.m.own * p.b.valuation)
  saveGroup(g, grp)
}

export interface JoinPlan {
  parts: { a: Asset; b: BizState; fee: number }[]
  share: number
  total: number
  fees: number
  shortfall: number
  block: string | null
  /** The deal's value to all shareholders (DealValue.value) and its yearly synergies. */
  value: number
  yearly: number
  votes: string[]
}

/** Everything a merger would do, for the confirm text and the hints (pure). */
export function planJoin(g: GameState, grp: Group | null, assets: Asset[]): JoinPlan {
  const parts = assets.map((a) => findBusiness(g, a.id)).filter((a): a is Asset => !!a).map((a) => ({ a, b: readBiz(g, a), fee: 0 }))
  const terms = mergeTerms(grp ? { value: groupValue(grp), share: grp.core.share } : null, parts.map((p) => ({ id: p.a.id, b: p.b })))
  parts.forEach((p, i) => (p.fee = terms.fees[i]?.fee ?? dealFee(p.b)))
  // The share the player ends up with: every company comes in at its value after the fees it pays
  // from its own cash (exactly what admit() credits), the player covering any shortfall.
  const share = mergeTerms(grp ? { value: groupValue(grp), share: grp.core.share } : null, parts.map((p) => ({ id: p.a.id, b: { ...p.b, valuation: Math.max(0, p.b.valuation - Math.min(p.fee, spendable(p.a, p.b))) } }))).share
  let block: string | null = null
  for (const p of parts) block = block ?? joinBlock(g, p.a)
  // A board that said no this year won't hear the same merger again until next year.
  for (const p of parts) if (!block && refusedThisYear(g, p.b, 'merge')) block = `${p.a.name}'s board already voted a merger down this year.`
  if (!block && grp && groupHasBoard(grp.core) && groupRefused(g, grp)) block = `${grp.core.name}'s board already voted down a deal like this this year.`
  if (!block && (grp ? grp.members.length : 0) + parts.length < 2) block = 'A group needs at least two companies.'
  if (!block) block = antitrustBlock(g, [...(grp ? grp.members.map((x) => x.b) : []), ...parts.map((p) => p.b)])
  const capture = grp ? captureOf(g, grp.core) : ownerCapture(g)
  const dv = joinValue(g, grp, parts.map((p) => ({ id: p.a.id, b: p.b })), capture)
  const shortfall = feeShortfall(parts)
  if (!block && shortfall > g.character.money) block = `The bankers and lawyers want ${money(terms.feeTotal)}; the companies are ${money(shortfall)} short and you can't cover it.`
  const votes = [...parts.filter((p) => hasBoard(g, p.b)).map((p) => p.a.name), ...(grp && groupHasBoard(grp.core) ? [`${grp.core.name}'s board`] : [])]
  return { parts, share, total: terms.total, fees: terms.feeTotal, shortfall, block, value: dv.value, yearly: dv.yearly, votes }
}

/** The merit the boards weigh for a merger (pure; the same number the vote uses). */
export function joinMerit(plan: JoinPlan): number {
  return dealMerit(plan.value, plan.total)
}

function runVotes(g: GameState, grp: Group | null, plan: JoinPlan, label: (name: string) => string): Ballot[] {
  const merit = joinMerit(plan)
  const ballots: Ballot[] = []
  for (const p of plan.parts) {
    if (!hasBoard(g, p.b)) continue
    const cur = findBusiness(g, p.a.id)
    if (!cur) continue
    const r = vote(g, cur, bizOf(g, cur), { kind: 'merge', by: 'owner', merit, gain: Math.max(0, plan.yearly), amount: plan.total, label: label(cur.name) }, { quiet: true })
    ballots.push({ who: cur.name, r })
    if (!r.passed) return ballots
  }
  if (grp && groupHasBoard(grp.core)) {
    const r = groupVote(g, grp, { kind: 'merge', by: 'owner', merit, gain: Math.max(0, plan.yearly), amount: plan.total, label: label(grp.core.name) }, { quiet: true })
    ballots.push({ who: `${grp.core.name} (group board)`, r })
  }
  return ballots
}

/** Forget a stale group of one a company still carries (before it joins another). */
function clearStale(g: GameState, a: Asset): void {
  const id = groupIdOf(a.details)
  if (id) dissolveIfAlone(g, id, true)
}

/** Merge two or more of the player's companies into a new group. Returns true when it happened. */
export function formGroup(g: GameState, ids: string[], rawName: string): boolean {
  if (groupBlock(g)) return false
  const assets = [...new Set(ids)].map((id) => findBusiness(g, id)).filter((a): a is Asset => !!a)
  assets.forEach((a) => clearStale(g, a))
  const plan = planJoin(g, null, assets)
  if (plan.block) {
    notice(g, 'No Deal', plan.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  const name = cleanName(rawName, suggestGroupName(g), 40)
  const live = plan.parts.map((p) => ({ a: p.a, b: bizOf(g, p.a), fee: p.fee }))
  if (!dueDiligence(g, live, live.some((p) => p.b.share < 0.999 || p.b.public))) return false
  const ballots = runVotes(g, null, plan, (n) => `Merge ${n} into ${name}`)
  if (ballots.some((x) => !x.r.passed)) {
    brokenDeal(g, live, ballots, `forming ${name}`)
    return false
  }
  const { fromOwner, worth } = payFees(g, live)
  const core = newCore(g, name, plan.share)
  const grp: Group = { core, members: [] }
  admit(g, grp, live, worth)
  masterBusiness(g)
  count(g, 'conglomerates')
  addStat(g, 'happiness', 6)
  const names = live.map((p) => p.a.name)
  log(g, `I merged ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} into ${name}.`, 'good')
  remember(g, `Formed ${name}, a group of ${live.length} companies.`)
  notice(
    g,
    'Conglomerate Formed!',
    `${names.join(', ')} are now divisions of ${name}. Each keeps its own CEO, screen and market; the group shares a back office and a treasury, and the group's people sit on every division's board.${ballots.length ? ` The boards voted: ${ballotText(ballots)}.` : ''} Bankers and lawyers billed ${formatMoney(plan.fees)}${fromOwner > 0 ? ` (${formatMoney(fromOwner)} of it from your own pocket)` : ''}. ${core.share < 0.999 ? `Outside shareholders swapped into the group at fair value: you own ${pct(core.share, 1)} of ${name}.` : `You own all of ${name}.`}${core.listing ? ` ${name} took over the stock-market listing on the ${core.listing.exchange}.` : ''} Integrating the divisions costs extra in the first year.`,
    { emoji: '\u{1F3E2}', tone: 'good' },
  )
  return true
}

/** Bring one more of the player's companies into an existing group. */
export function addToGroup(g: GameState, groupId: string, assetId: string): boolean {
  if (groupBlock(g)) return false
  const a0 = findBusiness(g, assetId)
  if (!a0) return false
  clearStale(g, a0)
  const grp = liveGroup(g, groupId)
  if (!grp || grp.members.length < 2) return false
  const plan = planJoin(g, grp, [a0])
  if (plan.block) {
    notice(g, 'No Deal', plan.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  const live = plan.parts.map((p) => ({ a: p.a, b: bizOf(g, p.a), fee: p.fee }))
  const outsiders = grp.core.share < 0.999 || !!grp.core.listing || live.some((p) => p.b.share < 0.999 || p.b.public)
  if (!dueDiligence(g, live, outsiders)) return false
  const ballots = runVotes(g, grp, plan, (n) => `Bring ${a0.name} into ${grp.core.name}${n === grp.core.name ? '' : ` (${n})`}`)
  if (ballots.some((x) => !x.r.passed)) {
    saveGroup(g, grp)
    brokenDeal(g, live, ballots, `bringing ${a0.name} into ${grp.core.name}`)
    return false
  }
  const { fromOwner, worth } = payFees(g, live)
  admit(g, grp, live, worth)
  count(g, 'groupMergers')
  log(g, `I brought ${a0.name} into ${grp.core.name}.`, 'good')
  notice(
    g,
    'Welcome to the Group',
    `${a0.name} is now a division of ${grp.core.name}.${ballots.length ? ` The votes: ${ballotText(ballots)}.` : ''} Fees: ${formatMoney(plan.fees)}${fromOwner > 0 ? ` (${formatMoney(fromOwner)} from your own pocket)` : ''}. You now own ${pct(grp.core.share, 1)} of the group${grp.core.listing ? `; new shares went to ${a0.name}'s holders at the market price` : ''}.`,
    { emoji: '\u{1F91D}', tone: 'good' },
  )
  return true
}

// ---------------------------------------------------------------------------
// Spin-offs

/** What a spin-off would cost and who pays (pure). */
export function spinPlan(g: GameState, grp: Group, assetId: string): { fee: number; block: string | null; value: number; yearly: number; discount: number } {
  const x = grp.members.find((m) => m.a.id === assetId)
  if (!x) return { fee: 0, block: 'That company is not in the group.', value: 0, yearly: 0, discount: 0 }
  const fee = spinOffFee(x.b, !!grp.core.listing)
  const dv = spinValue(g, grp, assetId, captureOf(g, grp.core))
  const treasury = grp.members.filter((m) => m.a.id !== assetId).reduce((s, m) => s + movableCash(g, m), 0)
  const avail = spendable(x.a, x.b) + treasury + Math.max(0, g.character.money)
  return { fee, block: avail < fee ? `The spin-off costs ${money(fee)} in fees, more than the group and you can pay.` : null, value: dv.value, yearly: dv.yearly, discount: dv.discount }
}

/** Spin a division off: it trades on its own and every group shareholder gets their share of it. */
export function spinOff(g: GameState, groupId: string, assetId: string): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp || grp.members.length < 2) return false
  const x = grp.members.find((m) => m.a.id === assetId)
  if (!x) return false
  const plan = spinPlan(g, grp, assetId)
  if (plan.block) {
    notice(g, 'No Deal', plan.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  const r = groupNeedsVote(g, grp, { kind: 'merge', by: 'owner', label: '' })
    ? groupVote(g, grp, { kind: 'merge', by: 'owner', merit: dealMerit(plan.value, Math.max(1, groupValue(grp))), label: `Spin off ${x.a.name} from ${grp.core.name}` })
    : null
  if (r && !r.passed) {
    saveGroup(g, grp)
    return false
  }
  // It leaves the group executives' seats: their slice of it comes back to you.
  const returned = returnExecutiveSlice(grp, x)
  // The fee: the division's own cash, then the group's treasury, then the player's pocket.
  let left = plan.fee
  const own = Math.min(left, spendable(x.a, x.b))
  charge(g, x.a, x.b, own, 'legal')
  left -= own
  if (left > 0) {
    const pulled = pool(g, grp, x, left)
    charge(g, x.a, x.b, pulled, 'legal')
    left -= pulled
  }
  if (left > 0) {
    addMoney(g, -left, 'legal')
    x.b.invested += left
    x.b.yearCosts += left
  }
  // A listed group's spin-off trades at the market's mood on its operating value, without the
  // conglomerate discount; what is left keeps the mood (cash counts at face on both sides).
  const mood = moodOf(grp.core)
  const listing = grp.core.listing
  grp.members = grp.members.filter((m) => m.a.id !== assetId)
  detach(g, x.a, x.b, listing, { mult: mood })
  if (grp.members.length >= 2) {
    // Group shareholders keep their group shares and get the spun-off company's too: same share
    // count, a lower price for what's left.
    revalue(grp, mood)
    saveGroup(g, grp)
  } else {
    saveGroup(g, grp)
    dissolveIfAlone(g, groupId)
  }
  count(g, 'spinOffs')
  const stake = readBiz(g, x.a).share
  log(g, `${grp.core.name} spun off ${x.a.name}.`, 'neutral')
  notice(
    g,
    'Spun Off',
    `${x.a.name} left ${grp.core.name} and stands on its own${listing ? `, listed on the ${listing.exchange}` : ''}. You hold ${pct(stake, 1)} of it${returned ? ', including the group executives’ shares of it, which come back to you' : ', just as you held it through the group'}. Lawyers and separation cost ${formatMoney(plan.fee)}.${grp.members.length >= 2 ? '' : ` ${grp.core.name} was down to one company and was wound up.`}`,
    { emoji: '\u{2702}\u{FE0F}', tone: 'neutral' },
  )
  return true
}

// ---------------------------------------------------------------------------
// The treasury

export function moveCash(g: GameState, groupId: string, fromId: string, toId: string, amount: number): boolean {
  if (groupBlock(g) || fromId === toId) return false
  const grp = liveGroup(g, groupId)
  if (!grp || grp.core.share <= 0) return false
  const from = grp.members.find((m) => m.a.id === fromId)
  const to = grp.members.find((m) => m.a.id === toId)
  if (!from || !to) return false
  if (to.m.own < 0.999) {
    notice(g, 'Not Allowed', `${to.a.name} has outside investors of its own: cash moved in would hand them a slice of it for nothing.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  const max = movableCash(g, from)
  const n = Math.round(clampN(Number.isFinite(amount) ? amount : 0, 0, max))
  if (n <= 0) {
    notice(g, 'Nothing to Move', `${from.a.name} has no cash it can spare: what it holds covers its debts and the reserve its board requires.`, { emoji: '\u{1F4B8}' })
    return false
  }
  shift(g, from, to, n)
  syncMembers(grp)
  log(g, `${grp.core.name} moved ${money(n)} from ${from.a.name} to ${to.a.name}.`, 'neutral')
  notice(g, 'Cash Moved', `${grp.core.name}'s treasury moved ${formatMoney(n)} from ${from.a.name} to ${to.a.name}. ${from.a.name} keeps ${formatMoney(from.b.cash)}; ${to.a.name} now has ${formatMoney(to.b.cash)}.`, { emoji: '\u{1F3E6}' })
  return true
}

/** What the group can pay out without a vote: each division's cash above its reserve and debts. */
export function groupSpare(g: GameState, grp: Group): number {
  return grp.members.reduce((s, x) => s + sustainablePayout(x.a, x.b, boardView(g, x.a, x.b)), 0)
}

/**
 * How a group dividend of `amount` splits: each division pays in proportion to its spare cash,
 * and the player gets their look-through share of each part. Pure (the preview uses it too).
 */
export function dividendSplit(g: GameState, grp: Group, amount: number): { n: number; parts: number[]; mine: number } {
  const spare = grp.members.map((x) => sustainablePayout(x.a, x.b, boardView(g, x.a, x.b)))
  const total = spare.reduce((s, x) => s + x, 0)
  const n = total > 0 ? Math.round(clampN(Number.isFinite(amount) ? amount : 0, 0, total)) : 0
  const parts = spare.map((x) => (n > 0 ? Math.min(x, Math.round((n * x) / total)) : 0))
  const mine = Math.round(parts.reduce((s, p, i) => s + p * grp.members[i].b.share, 0))
  return { n: parts.reduce((s, p) => s + p, 0), parts, mine }
}

export function groupDividend(g: GameState, groupId: string, amount: number): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp || grp.core.share <= 0) return false
  const { n, parts, mine } = dividendSplit(g, grp, amount)
  if (n <= 0) return false
  grp.members.forEach((x, i) => {
    const part = parts[i]
    if (part <= 0) return
    firmCash(g, x.b, -part, 'dividend', x.a.id)
    if (!x.b.public) x.b.valuation = Math.max(0, Math.round(x.b.valuation - part))
  })
  earnIncome(g, mine, 'dividend')
  payFamilyGroupDividend(g, grp, parts.reduce((sum, part, i) => sum + part * grp.members[i].m.own, 0))
  // A listed group's price falls by the cash paid out by itself (it is derived from the divisions).
  syncMembers(grp)
  saveGroup(g, grp)
  log(g, `${grp.core.name} paid me ${money(mine)} in dividends.`, 'good')
  notice(g, 'Group Dividend', `${grp.core.name} paid out ${formatMoney(n)} from its divisions' spare cash${grp.core.share < 0.999 ? `; your ${pct(grp.core.share, 1)} share is ${formatMoney(mine)}` : ''}. It will be taxed as income at the end of the year.`, { emoji: '\u{1F4E4}', tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// The group mandate

/** What a group mandate is worth to the shareholders (the divisions' merit, weighted by value). Pure. */
export function groupMandateMerit(g: GameState, grp: Group, m: Mandate): number {
  let w = 0
  let s = 0
  for (const x of grp.members) {
    const v = Math.max(1, x.m.own * x.b.valuation)
    const cur = boardView(g, x.a, x.b).mandate
    w += v
    s += v * mandateMerit(g, x.a, x.b, cur, m)
  }
  return w > 0 ? clampN(s / w, -3, 3) : 0
}

export function setGroupMandate(g: GameState, groupId: string, m: Mandate | null): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp) return false
  if (m) {
    const p: Proposal = { kind: 'mandate', by: 'owner', mandate: m, merit: groupMandateMerit(g, grp, m), label: `Set a ${mandateDef(m).label} mandate for every division of ${grp.core.name}` }
    if (!groupAllows(g, grp, p)) {
      saveGroup(g, grp)
      return false
    }
  }
  grp.core.mandate = m
  const skipped: string[] = []
  if (m) {
    for (const x of grp.members) {
      if (ownerControls(g, x.a)) setMandate(g, x.a, x.b, m)
      else skipped.push(x.a.name)
    }
  }
  saveGroup(g, grp)
  log(g, m ? `I gave every division of ${grp.core.name} a ${mandateDef(m).label} mandate.` : `I let ${grp.core.name}'s divisions set their own mandates.`, 'neutral')
  notice(
    g,
    'Group Mandate',
    m
      ? `Every division of ${grp.core.name} now works to a ${mandateDef(m).label} mandate: ${mandateDef(m).brief}.${skipped.length ? ` ${skipped.join(', ')} ${skipped.length === 1 ? 'has' : 'have'} outside investors on the board, so the group can only recommend it there.` : ''}`
      : `Each division's board sets its own mandate again${grp.core.ceo === 'manager' ? '; a sharp group CEO picks the best one for each' : ''}.`,
    { emoji: m ? mandateDef(m).emoji : '\u{1F4CB}' },
  )
  return true
}

// ---------------------------------------------------------------------------
// The group CEO (no limit on how often: severance, the headhunter and churn are the price)

function face(m: Manager): string {
  return m.gender === 'female' ? '\u{1F469}\u{200D}\u{1F4BC}' : '\u{1F468}\u{200D}\u{1F4BC}'
}

/** Pay a group expense from treasury cash first, then the player's pocket. Null means unaffordable. */
function payGroup(g: GameState, grp: Group, n: number, reason: Reason): 'group' | 'owner' | 'split' | null {
  const t = treasuryOf(grp)
  const cost = Math.max(0, Math.round(Number.isFinite(n) ? n : 0))
  const fromGroup = Math.min(cost, spendable(t.a, t.b))
  const fromOwner = cost - fromGroup
  if (fromOwner > Math.max(0, g.character.money)) return null
  if (fromGroup > 0) charge(g, t.a, t.b, fromGroup, reason)
  if (fromOwner > 0) {
    addMoney(g, -fromOwner, reason)
    t.b.invested += fromOwner
    t.b.yearCosts += fromOwner
  }
  return fromGroup > 0 && fromOwner > 0 ? 'split' : fromOwner > 0 ? 'owner' : 'group'
}

function canPayGroup(g: GameState, grp: Group, n: number): boolean {
  const cost = Math.max(0, Math.round(Number.isFinite(n) ? n : 0))
  const t = treasuryOf(grp)
  return spendable(t.a, t.b) + Math.max(0, g.character.money) >= cost
}

function readCandidate(g: GameState, raw: Record<string, Json>): Manager {
  const style = ['grower', 'costCutter', 'steady', 'visionary'].find((x) => x === raw.style) as Manager['style']
  return {
    firstName: str(raw.firstName, 'Pat'),
    lastName: str(raw.lastName, 'Morgan'),
    gender: raw.gender === 'female' ? 'female' : 'male',
    skill: Math.round(clampN(num(raw.skill, 60), 1, 100)),
    salary: Math.max(0, Math.round(num(raw.salary))),
    since: g.year,
    ...(style ? { style } : {}),
    integrity: Math.round(clampN(num(raw.integrity, 70), 0, 100)),
  }
}

const CEO_PICK = defineScript('business.group.ceo', (g, choice, data) => {
  const d = rec(data)
  if (!d || choice === 'cancel' || groupBlock(g)) return
  const groupId = str(d.groupId)
  if (choice === 'again' || choice === 'exec') {
    searchGroupCeo(g, groupId, choice === 'exec' ? 'executive' : 'standard')
    return
  }
  const grp = liveGroup(g, groupId)
  if (!grp || grp.members.length < 2) return
  const list = Array.isArray(d.candidates) ? d.candidates : []
  const raw = rec(list[Number(choice.replace('m', ''))])
  if (!raw) return
  const m = readCandidate(g, raw)
  const out = grp.core.ceo === 'manager' ? grp.core.manager : null
  const sev = out ? ceoSeverance(out, g.year) : 0
  if (sev > 0 && !canPayGroup(g, grp, sev)) {
    notice(g, 'Not Enough Cash', `Buying out ${managerName(out!)}'s contract costs ${formatMoney(sev)}. The group and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  if (!groupAllows(g, grp, { kind: 'hire', by: 'owner', amount: m.salary, skill: m.skill, label: `Hire ${managerName(m)} as group CEO at ${money(m.salary)} a year` })) {
    saveGroup(g, grp)
    return
  }
  if (sev > 0 && !payGroup(g, grp, sev, 'payroll')) {
    notice(g, 'Not Enough Cash', `Buying out ${managerName(out!)}'s contract costs ${formatMoney(sev)}. The group and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  paySeverance(g, grp.members[0].b.countryId, out, sev)
  clearGroupCeoJob(g, out)
  grp.core.ceo = 'manager'
  grp.core.manager = { ...m, since: g.year }
  grp.core.misses = 0
  saveGroup(g, grp)
  const style = STYLE_INFO[styleOf(m)]
  log(g, `${managerName(m)} became group CEO of ${grp.core.name}.`)
  notice(
    g,
    'New Group CEO',
    `${managerName(m)} (skill ${m.skill}/100, ${style.label.toLowerCase()}, ${formatMoney(m.salary)} a year, paid by the divisions) now runs ${grp.core.name}: the treasury, the back office, the division CEOs.${out && sev > 0 ? ` Buying out ${managerName(out)}'s contract cost ${formatMoney(sev)}.` : ''} Autonomous Management reviews every division each year; higher skill improves capital allocation and execution. ${grp.core.autoEquity !== false ? 'You have authorized permanent, value-weighted group share grants to retain subsidiary executives; disable this under Autonomous Management if desired.' : 'Automatic executive equity grants are disabled.'} The Group CEO must still receive any ownership grant from you; they cannot award themselves shares.`,
    { emoji: face(m), tone: 'good' },
  )
})

/** The headhunter's shortlist for a group CEO (every search this year costs half as much again). */
export function searchGroupCeo(g: GameState, groupId: string, kind: SearchKind): void {
  const grp = liveGroup(g, groupId)
  if (!grp || grp.members.length < 2 || groupBlock(g)) return
  const gb = groupBiz(g, grp)
  const key = `biz.group.headhunt.${groupId}`
  const fee = headhunterFee(gb, kind, yearActionsUsed(g, key))
  const by = payGroup(g, grp, fee, 'inputs')
  if (!by) {
    notice(g, 'Not Enough Cash', `The headhunter wants ${formatMoney(fee)}. The group's available cash and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  useYearAction(g, key, Number.MAX_SAFE_INTEGER)
  syncMembers(grp)
  saveGroup(g, grp)
  const list = shortlist(g, gb, kind)
  const used = yearActionsUsed(g, key)
  const cur = grp.core.ceo === 'manager' ? grp.core.manager : null
  const sev = cur ? ceoSeverance(cur, g.year) : 0
  const choices: ChoiceOption[] = [
    ...list.map((m, i) => ({ id: `m${i}`, label: `${managerName(m)} \u{00B7} ${m.skill}/100 \u{00B7} ${STYLE_INFO[styleOf(m)].label} \u{00B7} ${money(m.salary)}`, emoji: m.skill >= 85 ? '\u{2B50}' : face(m) })),
    { id: 'again', label: `Another shortlist (${money(headhunterFee(gb, 'standard', used))})`, emoji: '\u{1F504}' },
    { id: 'exec', label: `Executive search for a star (${money(headhunterFee(gb, 'executive', used))})`, emoji: '\u{1F31F}' },
    { id: 'cancel', label: cur ? `Keep ${managerName(cur)}` : 'Keep chairing it myself', emoji: '\u{2716}\u{FE0F}' },
  ]
  const ins = inputs(grp)
  const values = list.map((m) => groupCeoValue(ins, m.skill, m.salary) - sev / LASTING_YEARS)
  const keep = cur ? groupCeoValue(ins, cur.skill, cur.salary) : null
  markBest(g, choices, (id) => (id === 'cancel' ? keep : id.startsWith('m') ? (values[Number(id.slice(1))] ?? null) : null), (id) =>
    id === 'cancel' ? 'Best move: nobody here captures enough extra synergy to pay for the change' : `Best value: about ${money(values[Number(id.slice(1))] ?? 0)} a year of synergies after pay${(list[Number(id.slice(1))]?.skill ?? 0) > SMART_SKILL ? ', and they work the numbers' : ''}`,
  )
  const lines = list.map((m) => `\u{2022} ${managerName(m)}: skill ${m.skill}/100, ${STYLE_INFO[styleOf(m)].label.toLowerCase()}, wants ${formatMoney(m.salary)} a year. ${m.skill >= 85 ? `${stakeText(equityTarget(m.skill, 'group'))} group ownership for long-term retention.` : 'Salary-based retention.'}`)
  const notes = [`The search cost ${formatMoney(fee)}${by === 'owner' ? ' (from your own pocket: the treasury was empty)' : by === 'split' ? ' (split between the treasury and your own pocket)' : ''}.`]
  if (cur && sev > 0) notes.push(`Replacing ${managerName(cur)} means about ${formatMoney(sev)} in severance.`)
  notes.push('A group CEO captures the synergies (the better, the more), keeps the sprawl in check and is paid by the divisions; above 75 they also manage the treasury and the division CEOs.')
  scriptChoice(g, CEO_PICK, cur ? 'Replace the Group CEO' : 'Hire a Group CEO', `A headhunter sent over ${list.length} candidates to run ${grp.core.name}:\n${lines.join('\n')}\n${notes.join(' ')}`, choices, {
    emoji: '\u{1F9D1}\u{200D}\u{1F4BC}',
    data: { groupId, candidates: toJson(list) },
  })
}

/** The player chairs the group again (a hired group CEO is bought out). */
export function chairGroup(g: GameState, groupId: string): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp || grp.core.ceo !== 'manager' || !grp.core.manager) return false
  const m = grp.core.manager
  const sev = ceoSeverance(m, g.year)
  if (sev > 0 && !canPayGroup(g, grp, sev)) {
    notice(g, 'Not Enough Cash', `Buying out ${managerName(m)}'s contract costs ${formatMoney(sev)}. The group and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return false
  }
  if (!groupAllows(g, grp, { kind: 'takeOver', by: 'owner', skill: Math.round(ownerCapture(g) * 100), label: `Make ${g.character.firstName} ${g.character.lastName} chair and CEO of ${grp.core.name}` })) {
    saveGroup(g, grp)
    return false
  }
  if (sev > 0 && !payGroup(g, grp, sev, 'payroll')) {
    notice(g, 'Not Enough Cash', `Buying out ${managerName(m)}'s contract costs ${formatMoney(sev)}. The group and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return false
  }
  paySeverance(g, grp.members[0].b.countryId, m, sev)
  clearGroupCeoJob(g, m)
  grp.core.ceo = 'owner'
  grp.core.manager = null
  syncMembers(grp)
  saveGroup(g, grp)
  masterBusiness(g)
  log(g, `I took over ${grp.core.name} myself.`, 'neutral')
  notice(g, 'Chair and CEO', `You run ${grp.core.name} yourself again: the treasury, the mandate and the division CEOs are your call.${sev > 0 ? ` Buying out ${managerName(m)}'s contract cost ${formatMoney(sev)}.` : ''}`, { emoji: '\u{1F454}' })
  return true
}

// ---------------------------------------------------------------------------
// Buying rivals with the group's cash

export function acquirePower(g: GameState, grp: Group, x: GroupMember): number {
  const own = spendable(x.a, x.b)
  if (x.m.own < 0.999) return own
  return own + grp.members.filter((m) => m.a.id !== x.a.id).reduce((s, m) => s + movableCash(g, m), 0)
}

/** Yearly profit a rival brings: most of its customers at the division's margin. */
export function rivalGain(g: GameState, b: BizState, rivalId: string): number {
  const v = marketViewOf(g, b)
  const r = v.rivals.find((x) => x.id === rivalId)
  const s = b.last
  if (!r || !s || s.revenue <= 0) return 0
  const margin = clampN(s.net / s.revenue, -0.5, 0.6)
  return Math.max(0, Math.round(r.share * v.size * 0.7 * margin))
}

/** Why the group can't buy this rival for this division (null: it can try). Pure. */
export function groupAcquireWhy(g: GameState, grp: Group, x: GroupMember, rivalId: string): string | null {
  const q = acquisitionQuote(g, x.b, rivalId)
  if (!q) return 'Not for sale.'
  const block = q.block ?? groupAcquireBlock(g, x.b, grp.members.filter((m) => m.a.id !== x.a.id).map((m) => m.b), q.rival.share)
  if (block) return block
  const power = acquirePower(g, grp, x)
  return power < q.price ? `The group can put ${money(power)} behind ${x.a.name}; this deal needs ${money(q.price)}.` : null
}

export function acquireForGroup(g: GameState, groupId: string, assetId: string, rivalId: string): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  const x = grp?.members.find((m) => m.a.id === assetId)
  if (!grp || !x) return false
  const q = acquisitionQuote(g, x.b, rivalId)
  if (!q) return false
  const block = q.block ?? groupAcquireBlock(g, x.b, grp.members.filter((m) => m.a.id !== x.a.id).map((m) => m.b), q.rival.share)
  if (block) {
    notice(g, 'Deal Blocked', `${block} Your lawyers suggest a smaller target.`, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  if (acquirePower(g, grp, x) < q.price) {
    notice(g, 'Not Enough Group Cash', `Buying ${q.rival.name} costs ${formatMoney(q.price)}. ${grp.core.name} can only put ${formatMoney(acquirePower(g, grp, x))} behind ${x.a.name}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return false
  }
  if (!boardAllows(g, x.a, x.b, { kind: 'capex', by: 'owner', amount: q.price, gain: rivalGain(g, x.b, rivalId), label: `Buy ${q.rival.name} for ${money(q.price)}` })) return false
  // Money set aside for unreleased games stays where it is: the treasury tops up the rest.
  const need = Math.max(0, q.price - spendable(x.a, x.b))
  const from: { x: GroupMember; n: number }[] = []
  const pulled = need > 0 ? pool(g, grp, x, need, from) : 0
  if (!acquireRival(g, x.a, x.b, rivalId)) {
    // Give each sister its money back.
    for (const f of from) shift(g, x, f.x, Math.min(f.n, Math.max(0, x.b.cash)))
    syncMembers(grp)
    return false
  }
  syncMembers(grp)
  saveGroup(g, grp)
  count(g, 'groupAcquisitions')
  if (pulled > 0) log(g, `${grp.core.name}'s treasury put ${money(pulled)} toward ${x.a.name}'s purchase of ${q.rival.name}.`, 'neutral')
  return true
}

// ---------------------------------------------------------------------------
// The stock market

/** Yearly profit the exchange wants before listing the group (the strictest of its divisions'). */
export function groupIpoThreshold(grp: Group): number {
  return Math.max(...grp.members.map((x) => ipoThreshold(x.b)))
}

/** Last booked year's combined profit. */
export function groupProfit(grp: Group): number {
  const s = consolidated(grp)
  return s ? Math.round(s.net) : 0
}

export function canGroupIpo(g: GameState, grp: Group): string | null {
  if (grp.core.listing) return 'The group is already listed.'
  if (grp.core.delisted && g.year - grp.core.delisted < 3) return `Exchanges won't list ${grp.core.name} again until ${grp.core.delisted + 3}.`
  const need = groupIpoThreshold(grp)
  const profit = groupProfit(grp)
  if (profit < need) return `Exchanges want at least ${money(need)} of yearly profit from the whole group. Last year: ${money(profit)}.`
  return null
}

/** The underwriters' audit before a group listing (exit.IPO_COLLAPSE per division with cooked books). */
function groupIpoAudit(g: GameState, grp: Group): boolean {
  for (const x of grp.members) {
    if (x.b.cooked <= 0 || !chance(g, IPO_COLLAPSE)) continue
    x.b.cooked = 0
    x.b.brand = clampN(x.b.brand - 15, 0, 100)
    log(g, `The IPO of ${grp.core.name} was pulled when the underwriters found ${x.a.name}'s cooked books.`, 'bad')
    notice(g, 'IPO Pulled', `The underwriters' auditors found ${x.a.name}'s creative accounting while preparing ${grp.core.name}'s prospectus. The listing is off, and the files went to the regulator.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    if (chance(g, 0.5)) arrestPlayer(g, 'Accounting Fraud', 3, { evidence: 0.7, noResist: true, context: `Prosecutors charged you over ${x.a.name}'s cooked books.` })
    return false
  }
  return true
}

/** The group IPO slider's preview: floating `floatPct` percent of the group today (pure). */
export function groupIpoPreview(g: GameState, grp: Group, floatPct: number): string {
  const lead = grp.members[0].b
  const plan = ipoPlan(Math.max(1, groupValue(grp)), null, floatPct, listingMood(lead.industry, lead.countryId, g.year))
  const keep = grp.core.share * plan.retain
  const fill = plan.coverage >= 1 ? `orders should cover it about ${plan.coverage.toFixed(1)} times` : `only about ${pct(Math.min(1, plan.coverage))} of it would sell`
  return `${shareCountText(plan.offered)} new group shares at about ${moneyWith(plan.price, (v) => v.toFixed(2))}: ${fill}, raising about ${money(plan.raise - plan.fees)} for the treasury after fees. You'd keep ${pct(keep, 1)} of the group.${keep < 0.5 && grp.core.share >= 0.5 ? ' Under half: outside shareholders would control the group board.' : ''}`
}

export function groupIpo(g: GameState, groupId: string, floatPct = FLOAT_DEFAULT): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp || grp.members.length < 2) return false
  const why = canGroupIpo(g, grp)
  if (why) {
    notice(g, 'Not Yet', why, { emoji: '\u{1F514}' })
    return false
  }
  if (!groupAllows(g, grp, { kind: 'ipo', by: 'owner', label: `Take ${grp.core.name} public` })) {
    saveGroup(g, grp)
    return false
  }
  // The underwriters audit every division first: cooked books anywhere sink the listing.
  if (!groupIpoAudit(g, grp)) {
    saveGroup(g, grp)
    return false
  }
  const lead = grp.members[0].b
  const ex = exchangeFor(lead.countryId)
  const pre = Math.max(1, groupValue(grp))
  const plan = ipoPlan(pre, null, floatPct, listingMood(lead.industry, lead.countryId, g.year))
  const { raise, fees } = plan
  const pop = clampN(1 + bell(g, -150, 300) / 1000 + 0.06 * Math.max(0, Math.min(3, plan.coverage) - 1), 0.8, 1.45)
  const t = treasuryOf(grp)
  // One booking: the money raised, net of the underwriters' fees.
  firmCash(g, t.b, raise - fees, 'firm.sale', t.a.id)
  if (!t.b.public) t.b.valuation = Math.round(t.b.valuation + raise - fees)
  grp.core.share = clampN(grp.core.share * plan.retain, 0, 1)
  diluteGroupEquity(grp, plan.retain)
  const sharesOut = plan.sharesOut
  const sharePrice = round2(clampN(plan.price * pop, 0.05, 1e7))
  grp.core.listing = { exchange: ex.code, ipoYear: g.year, sharesOut, sharePrice }
  grp.core.discount = conglomerateDiscount(inputs(grp))
  grp.core.mult = multFor(grp, sharePrice * sharesOut)
  syncMembers(grp)
  saveGroup(g, grp)
  count(g, 'businessIpos')
  count(g, 'groupIpos')
  addStat(g, 'happiness', 15)
  log(g, `I took ${grp.core.name} public on the ${ex.code}.`, 'good')
  remember(g, `Took ${grp.core.name} public on the ${ex.name}.`)
  notice(
    g,
    'Group IPO!',
    `${grp.core.name} rang the opening bell on the ${ex.name} (${ex.code}). ${plan.coverage >= 1 ? `Orders covered the offer ${plan.coverage.toFixed(1)} times over.` : `Only ${pct(plan.sold / plan.offered)} of the shares on offer found buyers.`} The IPO raised ${money(raise)} for the group's treasury (underwriters kept ${money(fees)}), and the shares ${pop >= 1.05 ? 'popped' : pop <= 0.95 ? 'slid' : 'traded flat'} on day one at ${moneyWith(sharePrice, (v) => v.toFixed(2))}. You own ${pct(grp.core.share, 1)} of the group, worth about ${money(grp.core.share * sharePrice * sharesOut)}.`,
    { emoji: '\u{1F514}', tone: 'good' },
  )
  return true
}

/** What selling a fraction (0-1) of the player's group shares brings in (pure; the slider shows it). */
export function shareSale(g: GameState, grp: Group, fraction: number): { sold: number; impact: number; price: number; gross: number; tax: number } {
  const l = grp.core.listing
  const f = clampN(Number.isFinite(fraction) ? fraction : 0, 0, 1)
  if (!l) return { sold: 0, impact: 0, price: 0, gross: 0, tax: 0 }
  const sold = grp.core.share * f
  const impact = saleImpact(sold, 1).discount
  const price = sharePriceOf(grp)
  const gross = Math.round(sold * l.sharesOut * price * (1 - impact))
  const basis = grp.members.reduce((s, x) => s + Math.max(0, x.b.invested), 0) * f
  return { sold, impact, price, gross, tax: capitalGainsTax(g, gross, basis) }
}

/**
 * A listed group you no longer own any of leaves your hands with all its divisions; relatives'
 * family shares stay theirs, joining their own wealth at `marketCap`. Returns their names.
 */
export function leaveListedGroup(g: GameState, grp: Group, marketCap: number, why: 'quit' | 'other' = 'other'): string[] {
  const relatives = grp.core.familyShares?.length ? cashOutFamilyHolders(g, grp.core.familyShares, marketCap, `${grp.core.name}'s family shares`) : []
  const ids = new Set(grp.members.map((x) => x.a.id))
  g.assets = g.assets.filter((x) => !ids.has(x.id))
  const job = ceoJob(g)
  if (job && typeof job.data.assetId === 'string' && ids.has(job.data.assetId)) endJob(g, 'job', why)
  // Relatives working for the group work for somebody else's company now.
  for (const p of g.people) if (readGroupJob(p)?.groupId === grp.core.id) clearGroupJob(p)
  return relatives
}

/** Sell a fraction (0-1) of the player's group shares on the market. */
export function sellGroupShares(g: GameState, groupId: string, fraction: number): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  const l = grp?.core.listing
  const f = clampN(Number.isFinite(fraction) ? fraction : 0, 0, 1)
  if (!grp || !l || f <= 0) return false
  const stake = grp.core.share
  const { sold, price, gross, tax } = shareSale(g, grp, f)
  addMoney(g, gross, 'trade.sell')
  if (tax) addMoney(g, -tax, 'tax.capgains')
  for (const x of grp.members) x.b.invested = Math.round(x.b.invested * (1 - f))
  grp.core.share = stake - sold
  if (f >= 0.999 || grp.core.share < 0.01) {
    // Sold out: the group is somebody else's now (relatives keep their family shares).
    const n = grp.members.length
    const relatives = leaveListedGroup(g, grp, price * saleImpact(sold, 1).end * l.sharesOut, 'quit')
    count(g, 'businessesSold', n)
    log(g, `I sold the last of my ${grp.core.name} shares.`, 'good')
    notice(g, 'Sold Out', `You sold all your remaining shares of ${grp.core.name} for ${formatMoney(gross)}${tax ? ` (${formatMoney(tax)} capital gains tax)` : ''}. Its ${n} divisions are somebody else's now.${familyNote(relatives)}`, { emoji: '\u{1F4B8}', tone: 'good' })
    return true
  }
  // The sale weighs on the price.
  grp.core.mult = multFor(grp, price * saleImpact(sold, 1).end * l.sharesOut)
  syncMembers(grp)
  saveGroup(g, grp)
  log(g, `I sold ${pct(sold, 1)} of ${grp.core.name} on the stock market.`, 'good')
  notice(
    g,
    'Group Shares Sold',
    `You sold ${pct(sold, 1)} of ${grp.core.name} for ${formatMoney(gross)}${tax ? `; capital gains tax took ${formatMoney(tax)}` : ''}. The share price dipped to ${moneyWith(sharePriceOf(grp), (v) => v.toFixed(2))} on the news. You still own ${pct(grp.core.share, 1)}.`,
    { emoji: '\u{1F4C8}', tone: 'good' },
  )
  return true
}

/** Premium the outside shareholders get for their shares when the group goes private. */
export const DELIST_PREMIUM = 0.25

/** What taking the group private costs and who pays (pure). */
export function delistPlan(g: GameState, grp: Group): { cost: number; fees: number; fromGroup: number; fromYou: number; block: string | null } {
  const l = grp.core.listing
  if (!l) return { cost: 0, fees: 0, fromGroup: 0, fromYou: 0, block: 'The group is not listed.' }
  const cap = groupValue(grp)
  const cost = Math.round((1 - grp.core.share) * cap * (1 + DELIST_PREMIUM))
  const fees = Math.round(cost * 0.02)
  const avail = grp.members.reduce((s, x) => s + movableCash(g, x), 0)
  const fromGroup = Math.min(avail, cost + fees)
  const fromYou = cost + fees - fromGroup
  let block: string | null = null
  if (grp.core.familyShares?.length) block = 'Family-owned shares require a separate agreement; a delisting cannot confiscate inherited stakes.'
  else if (g.year - l.ipoYear < 2) block = `${grp.core.name} only listed in ${l.ipoYear}: the exchange wants two years before a delisting.`
  else if (fromYou > g.character.money) block = `Buying out the other shareholders costs ${money(cost + fees)}: the group can spare ${money(fromGroup)} and you have ${money(Math.max(0, g.character.money))}.`
  return { cost, fees, fromGroup, fromYou, block }
}

/**
 * What taking the group private does to the player's net worth: the whole group at its private
 * valuation (the conglomerate discount, no market mood) less what the buyout costs, against the
 * player's stake at the market price now. Pure (the Business talent's hint shows it).
 */
export function delistEffect(g: GameState, grp: Group): number {
  const plan = delistPlan(g, grp)
  const d = conglomerateDiscount(inputs(grp))
  const privateValue = fundamental(grp) - d * operating(grp) - plan.fromGroup
  const v = privateValue - plan.fromYou - grp.core.share * groupValue(grp)
  return Number.isFinite(v) ? Math.round(v) : 0
}

export function delistGroup(g: GameState, groupId: string): boolean {
  if (groupBlock(g)) return false
  const grp = liveGroup(g, groupId)
  if (!grp || !grp.core.listing) return false
  const plan = delistPlan(g, grp)
  if (plan.block) {
    notice(g, 'Not Now', plan.block, { emoji: '\u{1F6AB}', tone: 'bad' })
    return false
  }
  const l = grp.core.listing
  const cap = groupValue(grp)
  if (!groupAllows(g, grp, { kind: 'sell', by: 'owner', amount: Math.round(cap * (1 + DELIST_PREMIUM)), label: `Take ${grp.core.name} private at a ${pct(DELIST_PREMIUM)} premium` })) {
    saveGroup(g, grp)
    return false
  }
  // The treasury buys back what it can spare; the player pays the rest.
  let left = plan.fromGroup
  for (const x of grp.members) {
    if (left <= 0) break
    const take = Math.min(left, movableCash(g, x))
    if (take <= 0) continue
    firmCash(g, x.b, -take, 'trade.buy', x.a.id)
    if (!x.b.public) x.b.valuation = Math.max(0, Math.round(x.b.valuation - take))
    left -= take
  }
  if (plan.fromYou > 0) addMoney(g, -plan.fromYou, 'trade.buy')
  grp.core.share = 1
  diluteGroupEquity(grp, 0)
  grp.core.listing = null
  grp.core.delisted = g.year
  spreadBasis(grp, plan.fromYou)
  revalue(grp, 1)
  saveGroup(g, grp)
  log(g, `I took ${grp.core.name} private.`, 'neutral')
  notice(g, 'Taken Private', `${grp.core.name} bought out its outside shareholders at a ${pct(DELIST_PREMIUM)} premium (${formatMoney(plan.cost)} plus ${formatMoney(plan.fees)} in fees): ${formatMoney(plan.fromGroup)} from the group's spare cash${plan.fromYou > 0 ? ` and ${formatMoney(plan.fromYou)} from your own pocket` : ''}. The shares are off the ${l.exchange} and you own the whole group.`, { emoji: '\u{1F512}' })
  return true
}

// ---------------------------------------------------------------------------
// The interim group CEO

/** An interim group CEO when the player can't chair (prison, a minor heir). */
export function interimCeo(g: GameState, grp: Group): Manager {
  const gb = groupBiz(g, grp)
  return managerCandidate(g, gb, randInt(g, 50, 72))
}
