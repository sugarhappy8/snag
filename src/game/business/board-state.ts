// Governance state for one company, kept as plain JSON in BizState.board: the board of directors
// (when the company has one), the mandate and limits the hired CEO works under, recent votes, the
// board's patience with the CEO, CEO churn and the CEO's yearly letter.
//
// Seats follow ownership and are filled deterministically (names and stances are seeded per
// company and seat key, never drawn from g's RNG), so a menu can show the board a company is
// about to get without changing the future, and the yearly review seats exactly those people.
import { seeded } from '../assets'
import type { Asset, GameState, Json } from '../types'
import { namePoolOf } from '../world'
import { isDeepTech } from './deeptech-state'
import type { BizState } from './state'
import { clampN, num, rec, str } from './util'

export type Stance = 'growth' | 'profit' | 'caution'
/** Who put a director on the board: the owner, outside investors, the exchange's rules, a parent group. */
export type Seat = 'owner' | 'investor' | 'independent' | 'group'
/** What the board asks of the CEO. */
export type Mandate = 'growth' | 'balanced' | 'profit' | 'cash'

export interface Director {
  /** Seed key (names and stance are derived from it). */
  key: number
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  seat: Seat
  stance: Stance
  /** 0-100: goodwill toward the owner (results, how proposals treat them). */
  loyalty: number
  since: number
}

/** What the CEO may do without asking. */
export interface Limits {
  /** Yearly spending on new sites, capacity and R&D, as a share of the company's value. */
  capex: number
  /** Cash the company must keep, in months of running costs. */
  reserve: number
  /** Most a CEO may earn (salary + bonus) without a vote, as a multiple of the local norm. */
  pay: number
}

export interface VoteRecord {
  year: number
  what: string
  yes: number
  no: number
  passed: boolean
  /** Why it went the way it did (one short clause, or ''). */
  note: string
}

/** A hired CEO's hidden misconduct (the rogue-CEO event). */
export interface Scheme {
  kind: 'empire' | 'perks' | 'books'
  since: number
  /** Dollars it has cost the company so far. */
  taken: number
}

export interface BoardState {
  v: number
  /** Empty when the company has no board (the owner alone oversees the CEO). */
  members: Director[]
  mandate: Mandate
  limits: Limits
  /** Newest last. */
  votes: VoteRecord[]
  /** 0-100: the board's patience with whoever is CEO (resets for a new CEO). */
  patience: number
  /** Formal warnings to the current CEO. */
  warnings: number
  /** Years in a row the CEO missed the mandate. */
  misses: number
  /** Recent CEO changes (fades 40% a year): churn costs morale and scares candidates. */
  churn: number
  /** Next director seed key. */
  seq: number
  /** Capex and R&D spent against the budget in `spentYear`. */
  spent: number
  spentYear: number
  /** Year of the last CEO letter, and its lines (shown on the company screen). */
  letter: number
  memo: string[]
  scheme: Scheme | null
  /** Year the minority shareholders last sued the owner. */
  sued: number
  /**
   * Year the board last turned down (or a court blocked) each kind of the owner's proposals: the
   * board won't hear the same kind of proposal from the owner again that year (no re-rolling a vote).
   */
  refused: Record<string, number>
}

export const BOARD_VERSION = 2
const MAX_BOARD_SEQUENCE = 999_999_999
/** Votes kept on record. */
export const MAX_VOTES = 8

export interface MandateDef {
  id: Mandate
  label: string
  emoji: string
  /** What the CEO is told to do. */
  brief: string
  limits: Limits
}

export const MANDATES: readonly MandateDef[] = [
  { id: 'growth', label: 'Growth', emoji: '\u{1F680}', brief: 'grow sales and reinvest: new sites, capacity and products whenever they pay back', limits: { capex: 0.6, reserve: 2, pay: 2 } },
  { id: 'balanced', label: 'Balanced', emoji: '\u{2696}\u{FE0F}', brief: 'grow where it clearly pays and keep the books healthy', limits: { capex: 0.3, reserve: 3, pay: 1.5 } },
  { id: 'profit', label: 'Profit', emoji: '\u{1F4C8}', brief: 'squeeze the most profit out of what the company already has', limits: { capex: 0.12, reserve: 3, pay: 1.5 } },
  { id: 'cash', label: 'Cash to Owners', emoji: '\u{1F4B8}', brief: 'run lean, invest little and pay the spare cash out to the shareholders', limits: { capex: 0.05, reserve: 2, pay: 1.25 } },
]

export function mandateDef(m: Mandate): MandateDef {
  return MANDATES.find((x) => x.id === m) ?? MANDATES[1]
}

/** Bounds every limit stays within (proposals are clamped to them). */
export const LIMIT_BOUNDS: Record<keyof Limits, { min: number; max: number }> = {
  capex: { min: 0, max: 1 },
  reserve: { min: 0, max: 24 },
  pay: { min: 1, max: 5 },
}

export function clampLimits(l: Partial<Limits>, base: Limits): Limits {
  const one = (k: keyof Limits) => Math.round(clampN(num(l[k] as number | undefined, base[k]), LIMIT_BOUNDS[k].min, LIMIT_BOUNDS[k].max) * 1000) / 1000
  return { capex: one('capex'), reserve: one('reserve'), pay: one('pay') }
}

// ---------------------------------------------------------------------------
// Groups (business/conglomerate.ts): a company inside a group answers to the group's board.

/** What a group says about one of its member companies. */
export interface GroupBoardInfo {
  /** The group's name (shown as the company's parent). */
  name: string
}

type GroupProvider = (g: GameState, b: BizState) => GroupBoardInfo | null

let groupProvider: GroupProvider = () => null

/**
 * Extension point for conglomerates: tell the board module which companies belong to a group.
 * A member company always has a board (group-appointed directors sit in the owner's seats).
 */
export function registerGroupBoard(provider: GroupProvider): void {
  groupProvider = provider
}

/** The group a company belongs to, or null. */
export function groupOf(g: GameState, b: BizState): GroupBoardInfo | null {
  try {
    return groupProvider(g, b)
  } catch {
    return null
  }
}

/** True when this company has a board that can say no (outside owners, listed, or in a group). */
export function boardExists(g: GameState, b: BizState): boolean {
  return b.share < 0.999 || b.public || groupOf(g, b) !== null
}

// ---------------------------------------------------------------------------
// Reading and writing

const STANCES: readonly Stance[] = ['growth', 'profit', 'caution']
const SEATS: readonly Seat[] = ['owner', 'investor', 'independent', 'group']

function readDirector(x: Json): Director | null {
  const d = rec(x)
  if (!d) return null
  const seat = SEATS.find((s) => s === d.seat)
  const stance = STANCES.find((s) => s === d.stance)
  const key = Math.round(num(d.key))
  if (!seat || !stance || !Number.isSafeInteger(key) || key < 0 || key > MAX_BOARD_SEQUENCE) return null
  return {
    key,
    firstName: str(d.firstName, 'Alex'),
    lastName: str(d.lastName, 'Morgan'),
    gender: d.gender === 'female' ? 'female' : 'male',
    seat,
    stance,
    loyalty: Math.round(clampN(num(d.loyalty, 50), 0, 100)),
    since: Math.round(num(d.since)),
  }
}

function readVote(x: Json): VoteRecord | null {
  const d = rec(x)
  if (!d || typeof d.year !== 'number' || !Number.isFinite(d.year)) return null
  return { year: Math.round(d.year), what: str(d.what, 'A proposal'), yes: Math.max(0, Math.round(num(d.yes))), no: Math.max(0, Math.round(num(d.no))), passed: d.passed === true, note: str(d.note) }
}

function readScheme(x: Json | undefined): Scheme | null {
  const d = rec(x)
  if (!d) return null
  const kind = d.kind === 'empire' || d.kind === 'perks' || d.kind === 'books' ? d.kind : null
  if (!kind) return null
  return { kind, since: Math.round(num(d.since)), taken: Math.max(0, num(d.taken)) }
}

/** A complete, sane board state from whatever is stored (old saves have none). */
export function readBoard(v: Json | undefined, deepTech = false): BoardState {
  const d = rec(v) ?? {}
  const mandate = MANDATES.find((m) => m.id === d.mandate)?.id ?? (deepTech ? 'growth' : 'balanced')
  const memberKeys = new Set<number>()
  const members = (Array.isArray(d.members) ? d.members.map(readDirector).filter((x): x is Director => x !== null) : [])
    .filter(x => !memberKeys.has(x.key) && !!memberKeys.add(x.key)).slice(0, 31)
  const voteKeys = new Set<string>()
  const votes: VoteRecord[] = []
  if (Array.isArray(d.votes)) for (let i = d.votes.length - 1; i >= 0 && votes.length < MAX_VOTES; i--) {
    const vote = readVote(d.votes[i])
    const key = vote ? `${vote.year}\u0000${vote.what}` : ''
    if (!vote || voteKeys.has(key)) continue
    voteKeys.add(key); votes.push(vote)
  }
  votes.reverse()
  const maxKey = members.reduce((m, x) => Math.max(m, x.key + 1), 0)
  return {
    v: BOARD_VERSION,
    members,
    mandate,
    limits: clampLimits(rec(d.limits) ?? {}, mandateDef(mandate).limits),
    votes,
    patience: Math.round(clampN(num(d.patience, 60), 0, 100)),
    warnings: Math.max(0, Math.round(num(d.warnings))),
    misses: Math.max(0, Math.round(num(d.misses))),
    churn: Math.round(clampN(num(d.churn), 0, 20) * 100) / 100,
    seq: Math.min(MAX_BOARD_SEQUENCE, Math.max(maxKey, Math.round(clampN(num(d.seq), 0, MAX_BOARD_SEQUENCE)))),
    spent: Math.max(0, num(d.spent)),
    spentYear: Math.round(num(d.spentYear)),
    letter: Math.round(num(d.letter)),
    memo: Array.isArray(d.memo) ? d.memo.filter((x): x is string => typeof x === 'string').slice(0, 12) : [],
    scheme: readScheme(d.scheme),
    sued: Math.round(num(d.sued)),
    refused: readRefused(d.refused),
  }
}

/** Claim a finite unused director key, wrapping safely if a damaged save reached the ceiling. */
export function takeDirectorKey(st: BoardState): number {
  const used = new Set(st.members.map((member) => member.key))
  let key = Number.isSafeInteger(st.seq) && st.seq >= 0 && st.seq <= MAX_BOARD_SEQUENCE ? st.seq : 0
  for (let i = 0; i <= st.members.length; i++) {
    const next = key >= MAX_BOARD_SEQUENCE ? 0 : key + 1
    if (!used.has(key)) {
      st.seq = next
      return key
    }
    key = next
  }
  // Boards are bounded to 31 seats, so a free key must exist in this billion-key space.
  st.seq = 1
  return 0
}

function readRefused(x: Json | undefined): Record<string, number> {
  const d = rec(x)
  const out: Record<string, number> = {}
  if (!d) return out
  for (const [k, v] of Object.entries(d)) if (typeof v === 'number' && Number.isFinite(v) && /^[a-zA-Z]{1,24}$/.test(k)) out[k] = Math.round(v)
  return out
}

/**
 * Mutable governance state of a live company (normalized and stored on first use). Only call
 * from actions, scripts and yearly hooks; menus use readBoard / boardView.
 */
export function boardOf(b: BizState): BoardState {
  const cur = rec(b.board)
  if (cur && num(cur.v) === BOARD_VERSION && Array.isArray(cur.members) && Array.isArray(cur.votes) && rec(cur.limits) && rec(cur.refused)) return cur as unknown as BoardState
  const st = readBoard(b.board, isDeepTech(b))
  b.board = st as unknown as Json
  return st
}

// ---------------------------------------------------------------------------
// Seats

export interface SeatPlan {
  size: number
  owner: number
  investor: number
  independent: number
  group: number
}

/**
 * How many seats each side holds. Size grows as outsiders own more (a listed company's board is
 * bigger); the owner's seats follow their stake; a listing requires at least two independents;
 * a private company with outside investors always gives them at least one seat.
 */
export function seatPlan(g: GameState, b: BizState): SeatPlan {
  if (!boardExists(g, b)) return { size: 0, owner: 0, investor: 0, independent: 0, group: 0 }
  const outside = clampN(1 - b.share, 0, 1)
  const inGroup = groupOf(g, b) !== null
  let size = b.public ? 7 + Math.round(4 * outside) : 3 + Math.round(4 * outside)
  if (inGroup && !b.public) size = Math.max(size, 5)
  if (size % 2 === 0) size += 1
  let owner = Math.round(b.share * size)
  if (b.share >= 0.05) owner = Math.max(1, owner)
  let independent = 0
  if (b.public) {
    owner = Math.min(owner, size - 2)
    independent = Math.max(2, Math.ceil((size - owner) * 0.6))
  } else if (outside > 0.001) owner = Math.min(owner, size - 1)
  else independent = inGroup ? 1 : 0
  owner = Math.max(0, Math.min(owner, size - independent))
  // In a group the owner's seats are filled by the group's people.
  const group = inGroup ? owner : 0
  if (inGroup) owner = 0
  const investor = Math.max(0, size - owner - group - independent)
  return { size, owner, investor, independent, group }
}

/** Directors the player can count on: their own seats and the group's. */
export function ownerSeats(st: BoardState): number {
  return st.members.filter((d) => d.seat === 'owner' || d.seat === 'group').length
}

/** True when the owner's people hold a majority of the board (or there is no board at all). */
export function controlsBoard(st: BoardState): boolean {
  if (st.members.length === 0) return true
  return ownerSeats(st) * 2 > st.members.length
}

function stanceFor(r: () => number, seat: Seat, deepTech: boolean, isPublic: boolean): Stance {
  const w: Record<Stance, number> =
    seat === 'investor'
      ? deepTech
        ? { growth: 6, profit: 2, caution: 2 }
        : isPublic
          ? { growth: 3, profit: 4, caution: 3 }
          : { growth: 4, profit: 4, caution: 2 }
      : seat === 'independent'
        ? { growth: 2, profit: 3, caution: 5 }
        : { growth: 4, profit: 4, caution: 2 }
  const total = w.growth + w.profit + w.caution
  let x = r() * total
  for (const s of STANCES) {
    x -= w[s]
    if (x < 0) return s
  }
  return 'profit'
}

/** A director for a seat: local name and a stance seeded per company and key (pure). */
export function makeDirector(g: GameState, a: Asset, b: BizState, seat: Seat, key: number): Director {
  const s = seeded(`${g.lifeId}|board|${a.id}|${key}`)
  const pool = namePoolOf(b.countryId)
  const gender = s.next() < 0.5 ? 'male' : 'female'
  const first = s.pick(gender === 'male' ? pool.male : pool.female)
  const last = s.pick(pool.last)
  const stance = stanceFor(() => s.next(), seat, isDeepTech(b), b.public)
  const loyalty = seat === 'owner' || seat === 'group' ? 85 : seat === 'investor' ? 50 : 45
  return { key, firstName: first, lastName: last, gender, seat, stance, loyalty, since: g.year }
}

/**
 * Seat the board the company's ownership calls for: extra directors of a side step down (the
 * least loyal first), missing seats are filled. Deterministic: never touches g.rng.
 */
export function syncSeats(g: GameState, a: Asset, b: BizState, st: BoardState): void {
  const plan = seatPlan(g, b)
  if (plan.size === 0) {
    st.members = []
    return
  }
  const want: Record<Seat, number> = { owner: plan.owner, investor: plan.investor, independent: plan.independent, group: plan.group }
  for (const seat of SEATS) {
    const mine = st.members.filter((d) => d.seat === seat)
    if (mine.length > want[seat]) {
      const leave = new Set([...mine].sort((x, y) => x.loyalty - y.loyalty || x.key - y.key).slice(0, mine.length - want[seat]).map((d) => d.key))
      st.members = st.members.filter((d) => !leave.has(d.key))
    }
    for (let i = mine.length; i < want[seat]; i++) {
      st.members.push(makeDirector(g, a, b, seat, takeDirectorKey(st)))
    }
  }
  const order: Record<Seat, number> = { owner: 0, group: 1, investor: 2, independent: 3 }
  st.members.sort((x, y) => order[x.seat] - order[y.seat] || x.key - y.key)
}

/** The board as it stands for display: the stored state with its seats synced (pure). */
export function boardView(g: GameState, a: Asset, b: BizState): BoardState {
  const st = readBoard(b.board, isDeepTech(b))
  syncSeats(g, a, b, st)
  return st
}

export function directorName(d: Director): string {
  return `${d.firstName} ${d.lastName}`
}

export function seatLabel(seat: Seat): string {
  return seat === 'owner' ? 'your seat' : seat === 'group' ? 'group seat' : seat === 'investor' ? 'investor director' : 'independent'
}

export function stanceLabel(s: Stance): string {
  return s === 'growth' ? 'wants growth' : s === 'profit' ? 'wants profit' : 'cautious'
}

/** Record a vote (newest last, a few kept). */
export function recordVote(st: BoardState, v: VoteRecord): void {
  st.votes = [...st.votes, v].slice(-MAX_VOTES)
}
