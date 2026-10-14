// Conglomerate state. A group has no asset of its own: every member company carries its
// membership and a full copy of the group's record in BizState.group (plain JSON inside
// Asset.details), so saves, structuredClone, heirs and net worth just work, and the group survives
// any member being sold, closed, seized or going bankrupt by any code path. Every write bumps the
// record's revision and copies it to every member; reads take the newest copy.
//
// Ownership: the group owns `own` of each division (1 unless the division raised outside money
// after joining) and the player owns `share` (S) of the group, so each division's BizState.share
// is the player's look-through stake S × own, and every existing payout path (dividends, sale
// proceeds, investor preferences) already pays the player exactly that. The group's value
// multiplier (`mult`: the conglomerate discount, or the market's price for a listed group)
// applies to each division's operating value through state.stakeValue, so net worth counts each
// company once.
import { onBusinessGone } from '../assetHooks'
import { log } from '../core'
import type { Asset, GameState, Json } from '../types'
import { registerGroupBoard, type Mandate } from './board-state'
import { refreshValue } from './economy'
import { newTicker } from './listing-id'
import { bizOf, businessAssets, CEO_STYLES, diluteManagerEquity, executiveEquity, readBiz, type BizState, type Manager } from './state'
import { clampN, num, rec, round2, str, toJson } from './util'
import { readFamilyShares, type FamilyShare } from './family-share-state'

export const GROUP_VERSION = 1
/** Years of group history kept. */
export const GROUP_HISTORY = 10

export interface GroupListing {
  exchange: string
  ipoYear: number
  sharesOut: number
  sharePrice: number
}

export interface GroupYear {
  year: number
  revenue: number
  profit: number
  /** The group's value (all shareholders) at the end of that year. */
  value: number
  divisions: number
}

/** What the group's structure earned and cost in the last booked year (dollars, all divisions). */
export interface GroupSynergy {
  year: number
  /** Shared back office: overhead saved (credited to the divisions). */
  backOffice: number
  /** Cross-selling: about what next year's demand lift is worth. */
  crossSell: number
  /** Purchasing power: about what next year's lower unit costs are worth. */
  purchasing: number
  /** Complexity of running a sprawling group (charged). */
  complexity: number
  /** One-off integration of newly merged divisions (charged). */
  integration: number
  /** The hired group CEO's pay (charged). */
  hq: number
}

export interface GroupCore {
  v: number
  id: string
  name: string
  /** Bumped on every write: the newest copy wins. */
  rev: number
  founded: number
  /** The player's share of the group, 0-1. */
  share: number
  /** Value multiplier on the divisions' operating value (1 - discount, or the market's price). */
  mult: number
  /** The conglomerate discount at the last valuation (0-0.25). */
  discount: number
  ceo: 'owner' | 'manager'
  /** The hired group CEO (when ceo is 'manager'). */
  manager: Manager | null
  /** A mandate imposed on every division, or null (each division's board decides). */
  mandate: Mandate | null
  /** The group's own board (business/board-state.ts BoardState) once it has outside shareholders. */
  board?: Json
  listing: GroupListing | null
  /** Year the group last delisted (0 = never). */
  delisted: number
  history: GroupYear[]
  synergy: GroupSynergy | null
  /** The group CEO's last letter (lines) and its year. */
  memo: string[]
  letter: number
  /** Years in a row the group missed (the group board's patience). */
  misses: number
  /** IPO hint shown. */
  ipoHint: boolean
  /** A hired CEO manages every division unless the owner explicitly pauses delegation. */
  autonomous?: boolean
  /** Allow permanent group equity awards for subsidiary executive retention (never self-awards). */
  autoEquity?: boolean
  /** One management/payroll pass per calendar year. */
  managementYear?: number
  familyPay?: number
  /** Cash remains on this wholly owned custodian's books, counted exactly once. */
  treasuryId?: string
  autoFound?: boolean
  lastFounded?: number
  /** Vested awards include former executives, so a buyback cannot confiscate them. */
  executiveEquity?: number
  familyShares?: FamilyShare[]
}

export interface Membership {
  id: string
  /** Calendar year this company joined. */
  joined: number
  /** The group's ownership of this division, 0-1. */
  own: number
  /** Year the one-off integration cost was booked (0 = still due). */
  integrated: number
  /** Next year's demand and cost multipliers the group set (undone if it leaves early). */
  fx: { year: number; demand: number; cost: number } | null
  core: GroupCore
}

export interface GroupMember {
  a: Asset
  b: BizState
  m: Membership
}

export interface Group {
  core: GroupCore
  /** Biggest first (by the group's stake in it). */
  members: GroupMember[]
}

const MANDATES: readonly Mandate[] = ['growth', 'balanced', 'profit', 'cash']

function readManager(v: Json | undefined): Manager | null {
  const d = rec(v)
  if (!d) return null
  const style = CEO_STYLES.find((x) => x === d.style)
  return {
    firstName: str(d.firstName, 'Pat'),
    lastName: str(d.lastName, 'Morgan'),
    gender: d.gender === 'female' ? 'female' : 'male',
    skill: Math.round(clampN(num(d.skill, 60), 1, 100)),
    salary: Math.max(0, Math.round(num(d.salary))),
    since: Math.round(num(d.since)),
    ...(typeof d.equity === 'number' ? { equity: clampN(num(d.equity), 0, .999) } : {}),
    ...(typeof d.equityAsked === 'number' ? { equityAsked: Math.round(num(d.equityAsked)) } : {}),
    ...(style ? { style } : {}),
    integrity: Math.round(clampN(num(d.integrity, 70), 0, 100)),
    ...(num(d.bonus) > 0 ? { bonus: Math.round(num(d.bonus)) } : {}),
    ...(typeof d.asked === 'number' ? { asked: Math.round(num(d.asked)) } : {}),
    ...(str(d.personId) ? { personId: str(d.personId) } : {}),
  }
}

function readListing(v: Json | undefined): GroupListing | null {
  const d = rec(v)
  if (!d) return null
  const sharesOut = Math.round(num(d.sharesOut))
  const sharePrice = num(d.sharePrice)
  if (!(sharesOut > 0) || !(sharePrice > 0)) return null
  return { exchange: str(d.exchange, 'NYSE'), ipoYear: Math.round(num(d.ipoYear)), sharesOut, sharePrice: round2(clampN(sharePrice, 0.01, 1e7)) }
}

function readYear(v: Json): GroupYear | null {
  const d = rec(v)
  if (!d || typeof d.year !== 'number' || !Number.isFinite(d.year)) return null
  return { year: Math.round(d.year), revenue: num(d.revenue), profit: num(d.profit), value: Math.max(0, num(d.value)), divisions: Math.max(0, Math.round(num(d.divisions))) }
}

function readSynergy(v: Json | undefined): GroupSynergy | null {
  const d = rec(v)
  if (!d || typeof d.year !== 'number' || !Number.isFinite(d.year)) return null
  const p = (k: string) => Math.max(0, Math.round(num(d[k])))
  return { year: Math.round(d.year), backOffice: p('backOffice'), crossSell: p('crossSell'), purchasing: p('purchasing'), complexity: p('complexity'), integration: p('integration'), hq: p('hq') }
}

function historyOf(v: Json | undefined): GroupYear[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<number>()
  const out: GroupYear[] = []
  for (let i = v.length - 1; i >= 0 && out.length < GROUP_HISTORY; i--) {
    const row = readYear(v[i])
    if (!row || seen.has(row.year)) continue
    seen.add(row.year)
    out.push(row)
  }
  return out.reverse()
}

/**
 * A complete, sane group record from whatever is stored. `fallbackShare` is the player's share
 * of the group when the record doesn't say (a damaged copy): read off a member's own stake, never
 * assumed to be all of it.
 */
export function readCore(v: Json | undefined, fallbackId = '', fallbackShare = 1): GroupCore | null {
  const d = rec(v)
  if (!d) return null
  const id = str(d.id, fallbackId)
  if (!id) return null
  const manager = readManager(d.manager)
  const ceo = d.ceo === 'manager' && manager ? 'manager' : 'owner'
  return {
    v: GROUP_VERSION,
    id,
    name: str(d.name, 'The Group').slice(0, 48) || 'The Group',
    rev: Math.max(0, Math.round(num(d.rev))),
    founded: Math.round(num(d.founded)),
    share: clampN(num(d.share, fallbackShare), 0, 1),
    mult: clampN(num(d.mult, 1), 0.3, 3),
    discount: clampN(num(d.discount), 0, 0.25),
    ceo,
    manager: ceo === 'manager' ? manager : null,
    mandate: MANDATES.find((m) => m === d.mandate) ?? null,
    ...(rec(d.board) ? { board: d.board } : {}),
    listing: readListing(d.listing),
    delisted: Math.round(num(d.delisted)),
    history: historyOf(d.history),
    synergy: readSynergy(d.synergy),
    memo: Array.isArray(d.memo) ? d.memo.filter((x): x is string => typeof x === 'string').slice(-100) : [],
    letter: Math.round(num(d.letter)),
    misses: Math.max(0, Math.round(num(d.misses))),
    ipoHint: d.ipoHint === true,
    autonomous: d.autonomous !== false,
    autoEquity: d.autoEquity !== false,
    managementYear: Math.round(num(d.managementYear, -1)),
    familyPay: Math.max(0, num(d.familyPay)),
    treasuryId: str(d.treasuryId),
    autoFound: d.autoFound !== false,
    lastFounded: Math.round(num(d.lastFounded, num(d.founded))),
    executiveEquity: clampN(num(d.executiveEquity), 0, .999),
    ...(Array.isArray(d.familyShares) ? { familyShares: readFamilyShares(d.familyShares, 1 - clampN(num(d.share, fallbackShare), 0, 1) - clampN(num(d.executiveEquity), 0, .999)) } : {}),
  }
}

/**
 * A company's membership, normalized (null when it is not in a group). `memberShare` is the
 * company's BizState.share (the player's look-through stake), used if the group record is damaged.
 */
export function readMembership(v: Json | undefined, memberShare?: number): Membership | null {
  const d = rec(v)
  if (!d) return null
  const id = str(d.id)
  if (!id) return null
  const own = clampN(num(d.own, 1), 0.001, 1)
  const core = readCore(d.core, id, memberShare !== undefined && Number.isFinite(memberShare) ? clampN(memberShare / own, 0, 1) : 1)
  if (!core || core.id !== id) return null
  const fx = rec(d.fx)
  return {
    id,
    joined: Math.round(num(d.joined)),
    own,
    integrated: Math.round(num(d.integrated)),
    fx: fx && typeof fx.year === 'number' && Number.isFinite(fx.year) ? { year: Math.round(fx.year), demand: clampN(num(fx.demand), 0, 0.2), cost: clampN(num(fx.cost), 0, 0.2) } : null,
    core,
  }
}

/** The group id a company record carries ('' when none). Cheap: no normalizing. */
export function groupIdOf(b: { group?: Json }): string {
  return str(rec(b.group)?.id)
}

/** How many owned companies carry a readable membership of this group. */
function memberCount(g: GameState, id: string): number {
  let n = 0
  for (const a of g.assets) {
    if (a.kind !== 'business') continue
    const d = rec(a.details.group)
    const core = rec(d?.core)
    // The same test readMembership applies: a copy whose record names another group doesn't count.
    if (d && core && str(d.id) === id && str(core.id, id) === id) n += 1
  }
  return n
}

/** True when this company belongs to a live group (two or more members). */
export function inGroup(g: GameState, b: { group?: Json }): boolean {
  const id = groupIdOf(b)
  return !!id && memberCount(g, id) >= 2
}

function byStake(x: GroupMember, y: GroupMember): number {
  return y.m.own * Math.max(0, y.b.valuation) - x.m.own * Math.max(0, x.b.valuation) || (x.a.id < y.a.id ? -1 : 1)
}

function collect(g: GameState, mutable: boolean): Map<string, GroupMember[]> {
  const out = new Map<string, GroupMember[]>()
  for (const a of businessAssets(g)) {
    if (!groupIdOf(a.details)) continue
    const b = mutable ? bizOf(g, a) : readBiz(g, a)
    const m = readMembership(b.group, b.share)
    if (!m) continue
    const list = out.get(m.id) ?? []
    list.push({ a, b, m })
    out.set(m.id, list)
  }
  return out
}

/**
 * The group's ownership of a division follows the division's own stake record: when a division
 * sells part of itself after joining (a cash-crunch investor, a deep-tech funding round), its
 * BizState.share drops below S × own, and the group now owns less of it. Read that drift before
 * anything rewrites the stake from the membership (syncMembers), or the outside investor's stake
 * would silently go back to the player. The 1% floor every company record keeps is not drift.
 */
function reconcileOwnership(core: GroupCore, list: GroupMember[]): void {
  if (core.share <= 0) return // No playable stake is not a sale of the group's divisions.
  const s = core.share
  for (const x of list) {
    const expected = s * x.m.own
    const share = x.b.share
    if (!Number.isFinite(share) || Math.abs(share - expected) <= 1e-4) continue
    if (!core.familyShares?.length && expected < .01 && Math.abs(share - .01) <= 1e-6) continue
    x.m.own = clampN(share / s, 0.001, 1)
  }
}

function assemble(list: GroupMember[]): Group {
  const newest = list.reduce((best, x) => (x.m.core.rev > best.m.core.rev ? x : best), list[0])
  const core: GroupCore = JSON.parse(JSON.stringify(newest.m.core)) as GroupCore
  reconcileOwnership(core, list)
  core.executiveEquity = Math.max(core.executiveEquity ?? 0, sittingExecutiveEquity(core, list))
  return { core, members: [...list].sort(byStake) }
}

/** Every group (read-only copies), including stale groups of one; biggest first. */
export function allGroups(g: GameState): Group[] {
  return [...collect(g, false).values()].map(assemble).sort((x, y) => groupStake(y) - groupStake(x) || (x.core.id < y.core.id ? -1 : 1))
}

/** Live groups (two or more members), read-only. */
export function groupsOf(g: GameState): Group[] {
  return allGroups(g).filter((x) => x.members.length >= 2)
}

/** One group, read-only (null when gone or down to one company). */
export function groupById(g: GameState, id: string): Group | null {
  const list = collect(g, false).get(id)
  return list && list.length >= 2 ? assemble(list) : null
}

/**
 * One group with mutable member records (actions, scripts and yearly hooks only). Changes to
 * `core` or memberships are written back with saveGroup.
 */
export function liveGroup(g: GameState, id: string): Group | null {
  const list = collect(g, true).get(id)
  return list && list.length ? assemble(list) : null
}

/** Group shares a division's sitting CEO holds in this group. */
function sittingAward(core: GroupCore, x: GroupMember): number {
  return x.b.ceo === 'manager' && x.b.manager?.groupEquity?.id === core.id ? Math.max(0, x.b.manager.groupEquity.share) : 0
}

/** Group shares held by people still in their seat: the group's own CEO and sitting division CEOs. */
function sittingExecutiveEquity(core: GroupCore, members: GroupMember[]): number {
  return (core.ceo === 'manager' ? Math.max(0, core.manager?.equity ?? 0) : 0) + members.reduce((t, x) => t + sittingAward(core, x), 0)
}

/**
 * Executive shares of people who no longer hold their seat go back to the founder: a division's
 * own grants return to the group's holding in it, and group shares awarded to the group CEO or a
 * division CEO who has left return to the player's group stake (with the cost basis that came
 * with them). Run by every saveGroup, so whichever code path replaced the CEO, the next write of
 * the group settles it. Shares still held by a sitting CEO are never touched.
 */
export function settleGroupExecutives(grp: Group): void {
  const core = grp.core
  for (const x of grp.members) {
    const held = x.b.ceo === 'manager' ? Math.max(0, x.b.manager?.equity ?? 0) : 0
    const former = Math.max(0, x.b.executiveEquity ?? 0) - held
    if (!(former > 1e-9)) continue
    const before = x.b.share
    x.m.own = clampN(x.m.own + former, 0.001, 1)
    x.b.executiveEquity = held
    x.b.share = clampN(core.share * x.m.own, 0, 1)
    if (before > 0 && x.b.share > before) x.b.invested *= x.b.share / before
  }
  // In a family holding where you hold no shares, nothing comes back to you.
  if (core.share <= 0) return
  const active = sittingExecutiveEquity(core, grp.members)
  const former = Math.max(0, core.executiveEquity ?? 0) - active
  if (!(former > 1e-9)) return
  const before = core.share
  core.share = clampN(core.share + former, 0, 1)
  core.executiveEquity = active
  for (const x of grp.members) {
    const was = x.b.share
    x.b.share = clampN(core.share * x.m.own, 0, 1)
    if (before > 0 && was > 0 && x.b.share > was) x.b.invested *= x.b.share / was
  }
}

/**
 * Your stake in a company once it leaves the group (spun off, or the last one when the group is
 * wound up): it leaves the group executives' seats, so their slice of it comes back to you, except
 * its own CEO's, which detach turns into shares of the company they run.
 */
export function stakeOnLeaving(grp: Group, x: GroupMember): number {
  if (grp.core.share <= 0) return x.b.share
  const others = Math.max(0, (grp.core.executiveEquity ?? 0) - sittingAward(grp.core, x))
  return Math.max(x.b.share, clampN((grp.core.share + others) * x.m.own, 0, 1))
}

/** Give the founder that stake, with the cost basis that comes with it. Call just before detach. */
export function returnExecutiveSlice(grp: Group, x: GroupMember): boolean {
  const was = x.b.share, now = stakeOnLeaving(grp, x)
  if (!(now > was + 1e-9)) return false
  x.b.share = now
  if (was > 0) x.b.invested *= now / was
  return true
}

/**
 * Write the group record (bumped) and each member's membership back to every member, and refresh
 * their asset values (a member's value depends on the group's multiplier).
 */
export function saveGroup(g: GameState, grp: Group): void {
  settleGroupExecutives(grp)
  grp.core.rev += 1
  // The stored price is a display copy of the derived one.
  if (grp.core.listing) grp.core.listing.sharePrice = round2(clampN(sharePriceOf(grp), 0.01, 1e7))
  for (const x of grp.members) {
    if (!g.assets.includes(x.a)) continue
    x.m.core = grp.core
    x.b.group = toJson({ id: grp.core.id, joined: x.m.joined, own: x.m.own, integrated: x.m.integrated, fx: x.m.fx, core: grp.core })
    refreshValue(x.a, x.b)
  }
}

/** New group shares dilute every active executive award, not only the head-office CEO. */
export function diluteGroupEquity(grp: Group, retained: number): void {
  for (const holder of grp.core.familyShares ?? []) holder.share *= clampN(retained, 0, 1)
  grp.core.executiveEquity = (grp.core.executiveEquity ?? 0) * clampN(retained, 0, 1)
  diluteManagerEquity(grp.core.manager, retained)
  const ratio = clampN(retained, 0, 1)
  for (const x of grp.members) {
    const manager = x.b.manager, award = manager?.groupEquity
    if (!manager || !award || award.id !== grp.core.id) continue
    award.share *= ratio; award.credit *= ratio
    delete manager.equityAsked
    if (!ratio) delete manager.groupEquity
  }
}

/** A new membership for a company joining now. */
export function newMembership(g: GameState, core: GroupCore): Membership {
  return { id: core.id, joined: g.year, own: 1, integrated: 0, fx: null, core }
}

// ---------------------------------------------------------------------------
// Values

/** The company's operating value: its equity value without its net cash. */
export function operatingValue(b: BizState): number {
  const v = b.valuation - (b.cash - b.debt)
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

/** The group's stake in a division, valued with the group's multiplier. */
export function memberValue(b: BizState, own: number, mult: number): number {
  const v = own * (b.valuation + (mult - 1) * operatingValue(b))
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

/** What the whole group is worth to all its shareholders (with its multiplier). */
export function groupValue(grp: Group): number {
  return Math.round(grp.members.reduce((s, x) => s + memberValue(x.b, x.m.own, grp.core.mult), 0))
}

/** The player's stake in the group. */
export function groupStake(grp: Group): number {
  return Math.round(groupValue(grp) * grp.core.share)
}

/** Sum of the group's stakes in its divisions at their own (standalone) valuations. */
export function fundamental(grp: Group): number {
  return grp.members.reduce((s, x) => s + x.m.own * Math.max(0, x.b.valuation), 0)
}

/** Sum of the group's stakes in its divisions' operating values. */
export function operating(grp: Group): number {
  return grp.members.reduce((s, x) => s + x.m.own * operatingValue(x.b), 0)
}

/**
 * A listed group's share price: always derived from its divisions and the market's multiplier (so
 * cash paid out, a division sold or a spin-off moves it at once; nothing is ever priced twice).
 */
export function sharePriceOf(grp: Group): number {
  const l = grp.core.listing
  if (!l) return 0
  const v = groupValue(grp) / Math.max(1, l.sharesOut)
  return Number.isFinite(v) ? Math.max(0.01, v) : 0.01
}

/**
 * The market's mood on a listed group's operating value: its multiplier without the conglomerate
 * discount (1 for a private group, whose multiplier is the discount alone). Cash always counts at
 * face. Restructuring keeps the mood: a spun-off division lists at it, and what is left keeps it.
 */
export function moodOf(core: GroupCore): number {
  return core.listing ? clampN(core.mult / Math.max(0.05, 1 - core.discount), 0.3, 3) : 1
}

/** The multiplier that makes the group worth `value` (clamped). */
export function multFor(grp: Group, value: number): number {
  const ev = operating(grp)
  if (!(ev > 1)) return 1
  return clampN(1 + (value - fundamental(grp)) / ev, 0.3, 3)
}

/** Push the player's look-through stake and the multiplier into every member's asset value. */
export function syncMembers(grp: Group): void {
  for (const x of grp.members) {
    // Inheritance can create tiny or zero playable stakes; never round those up into new shares.
    x.b.share = clampN(grp.core.share * x.m.own, 0, 1)
    x.m.core = grp.core
    // stakeValue reads the multiplier from the stored record: write it before refreshing.
    const cur = rec(x.b.group)
    if (cur && rec(cur.core)) (cur.core as Record<string, Json>).mult = grp.core.mult
    refreshValue(x.a, x.b)
  }
}

// ---------------------------------------------------------------------------
// Leaving

/** Undo next year's group-set demand and cost multipliers on a company that leaves early. */
function undoFx(g: GameState, b: BizState, m: Membership | null): void {
  const fx = m?.fx
  if (!fx || fx.year !== g.year) return
  b.demandShock = clampN(b.demandShock / (1 + fx.demand), 0.3, 2)
  b.costShock = clampN(b.costShock / Math.max(0.5, 1 - fx.cost), 0.5, 2)
}

/**
 * Take a company out of its group: its membership goes, its look-through stake stays (the group's
 * shareholders hold it pro rata), and with `listing` it trades on its own on the group's exchange.
 */
export function detach(g: GameState, a: Asset, b: BizState, listing: GroupListing | null, opts: { keepIpoYear?: boolean; mult?: number } = {}): void {
  const membership = readMembership(b.group)
  undoFx(g, b, membership)
  if (membership?.core.familyShares?.length) b.familyShares = membership.core.familyShares.map(x => ({ id: x.id, share: x.share * membership.own }))
  // A sitting CEO's group shares become shares of the company they run (their slice of it, as with
  // every group shareholder); the group's next save returns the group shares to the founder.
  const award = b.manager?.groupEquity
  if (membership && b.manager && award?.id === membership.id) {
    const slice = b.ceo === 'manager' ? clampN(award.share * membership.own, 0, 1) : 0
    if (slice > 0) {
      const recorded = executiveEquity(b)
      b.manager.equity = (b.manager.equity ?? 0) + slice
      b.executiveEquity = clampN(recorded + slice, 0, 1)
    }
    delete b.manager.groupEquity
  }
  delete b.group
  if (listing && !b.public) {
    // It starts trading at the price the market was paying for it inside the group (its mood, not
    // the conglomerate discount).
    const mult = clampN(opts.mult ?? 1, 0.3, 3)
    const value = Math.max(1, Math.round(b.valuation + (mult - 1) * operatingValue(b)))
    b.public = true
    b.exchange = listing.exchange
    b.ipoYear = opts.keepIpoYear ? listing.ipoYear : g.year
    b.sharesOut = Math.max(1000, Math.round(value / 25))
    b.sharePrice = round2(Math.max(0.05, value / b.sharesOut))
    b.valuation = Math.round(b.sharePrice * b.sharesOut)
    b.pref = 0
    b.ticker = newTicker(g, a, b)
    // A group wound up around its last company keeps the listing's year, and has no offer price to show.
    if (opts.keepIpoYear) delete b.ipoPrice
    else b.ipoPrice = b.sharePrice
  }
  refreshValue(a, b)
}

/**
 * A group down to one company dissolves: the last division goes back to standing alone (keeping
 * the group's listing, if any). Returns true when it did.
 */
export function dissolveIfAlone(g: GameState, id: string, quiet = false): boolean {
  const grp = liveGroup(g, id)
  if (!grp || grp.members.length !== 1) return false
  const last = grp.members[0]
  // The group CEO's seat ends with the group: their slice of the last company comes back to you.
  returnExecutiveSlice(grp, last)
  // On its own it sheds the conglomerate discount and keeps the market's mood.
  detach(g, last.a, last.b, grp.core.listing, { keepIpoYear: true, mult: moodOf(grp.core) })
  if (!quiet) log(g, `${grp.core.name} was down to one company, ${last.a.name}, so the group was wound up.`, 'neutral')
  return true
}

/**
 * Call after a company left the player's hands by any route (sold, closed, bankrupt, seized):
 * the group it belonged to carries on without it, or dissolves when only one is left.
 */
export function afterMemberGone(g: GameState, b: { group?: Json }, name: string): void {
  const m = readMembership(b.group)
  if (!m) return
  const left = memberCount(g, m.id)
  if (left === 0) return
  if (left === 1) {
    dissolveIfAlone(g, m.id)
    return
  }
  log(g, `${name} is no longer part of ${m.core.name}.`, 'neutral')
}

// Seizure, repossession and divorce remove companies outside the business screens (assetHooks.ts).
onBusinessGone((g, a) => afterMemberGone(g, a.details, a.name))

// ---------------------------------------------------------------------------
// Boards: a member of a live group always has a board; the group's people fill the owner's seats.

registerGroupBoard((g, b) => {
  const id = groupIdOf(b)
  if (!id || memberCount(g, id) < 2) return null
  return { name: str(rec(rec(b.group)?.core)?.name, 'your group') }
})
