// The ledger (R2, design 4.2): every dollar that moves is an entry between two accounts, so the books cannot part from the cash.
//
//   An account is a string: person:<id>, firm:<id>, bank:<id>, gov:<country>, pool:<name>, pool:hh:<country>, abroad. Its balance is
//   the net of every dollar that ever moved through it, in whole dollars, and may be negative. Nothing invents an opening balance, so
//   an old save loads with an empty ledger. A balance that returns to 0 is deleted.
//
//   book(from, to)     double entry: the payer loses what the payee gains.
//   bookMint/bookBurn  the only places a dollar appears or vanishes: closed lists with a yearly cap (kernel/reasons.ts MINTS, BURNS).
//                      A mint over its room is clipped and a `cap` row is logged, so nothing runs away.
//   The identity       sum(accounts) = sum(mints) - sum(burns), always. checkLedger tests it; normalizeLedger restores it on a hostile
//                      load with a mint or burn named `heal`, and the probes assert that `heal` stays 0.
//   Flows              f["<year>:<country>:<reason>"] = [person, firm, bank, gov, pool, abroad, mint, burn]: the net each class gained
//                      or lost, so every row sums to zero. Two years are kept, at most 8 countries a year have their own rows.
//   Closes             the first booking of a new year pushes [year, sum, cumulative mint, cumulative burn] (the last 4 are kept) and
//                      clears the yearly counters and the tokens. A clock that moves backwards resets the counters with no close.
//   Tokens             a booking with a token is skipped when the token was already booked this year (tokens embed the year), so a
//                      replayed year books nothing twice.
//
// The shard lives in g.world.ledger (world/shards.ts registers its reader). It is the one world shard that every booking edits in
// place; ledgerRoot validates it once per object identity. peekLedger and acctBalance never write and work on a frozen state.
//
// This file is part of the kernel (L0): it imports only types and other kernel files. It never draws and never reads the clock.
import type { GameState } from '../types'
import { parseRef, type EntityRef } from './ids'
import type { LedgerShard } from './ledger-types'
import { BURNS, BURN_REASON, MINTS, MINT_REASON, REASONS, counterparty, type BurnName, type MintName, type Reason } from './reasons'

export { BURNS, MINTS } from './reasons'

/** An account: an entity ref (person:p1, gov:us, pool:retail) or `abroad`. */
export type AcctRef = EntityRef | 'abroad'

/** The classes a flow row counts, in the order of its vector. Every kind that is not one of these is a pool. */
export const ACCT_CLASSES = ['person', 'firm', 'bank', 'gov', 'pool', 'abroad', 'mint', 'burn'] as const
export type AcctClass = (typeof ACCT_CLASSES)[number]

export interface BookOpts {
  /** The counterparty, when the caller knows it. Without it the reason's default applies (kernel/reasons.ts). */
  with?: AcctRef
  /** The country of a flow, for hh, gov and the flow rows. Default: the player's country. */
  country?: string
  /** Books once a year per token. Embed the year in it. */
  token?: string
}

/** What a money call says about why: a reason, or a reason with options. A call with nothing books as `unreasoned`. */
export type Why = Reason | ({ reason: Reason } & BookOpts)

export const LEDGER_CAPS = {
  accounts: 500,
  flowRows: 480,
  flowCountries: 8,
  receipts: 600,
  closes: 4,
  logRows: 40,
  maxBooking: 1e15,
  maxBalance: 9e15,
} as const

export interface FlowRow {
  year: number
  country: string
  reason: Reason
  /** What each class gained (positive) or lost (negative) under this reason, in this country, in this year. The row sums to zero. */
  net: Readonly<Record<AcctClass, number>>
}

export interface LedgerReport {
  ok: boolean
  problems: string[]
  /** Sum of the accounts. */
  sum: number
  /** Cumulative mint, heal included. */
  mint: number
  /** Cumulative burn, heal included. */
  burn: number
  accounts: number
  flowRows: number
  bookings: number
}

// ---------------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------------

/** The account that absorbs a booking the ledger has no room to name. */
const OTHER = 'pool:other'
const YEAR_MAX = 1_000_000
const TOKEN_MAX = 80
/** Roll: above this many accounts the smallest person and firm accounts are folded into pool:other, down to this many. */
const FOLD_TO = 450
/** Most reasons the table may hold (a test), so `*` rows never need more than this many a year. */
const REASONS_MAX = 80
/** Rows a year may hold for named countries: the year's budget (half of flowRows) less the `*` rows it may need. */
const FLOW_NAMED_PER_YEAR = LEDGER_CAPS.flowRows / 2 - REASONS_MAX
const COUNTRY = /^[A-Za-z0-9._-]{1,16}$/
const LOG_KIND = /^[a-z][a-z0-9.]{0,15}$/
const LOG_NAME = /^[A-Za-z0-9._:*-]{1,32}$/

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** A non-null object that is not an array, a Date, a Map and so on: what JSON.parse and structuredClone make of `{ ... }`. */
function isPlain(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Object.prototype.toString.call(x) === '[object Object]'
}

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= YEAR_MAX

function emptyShard(): LedgerShard {
  return { v: 1, y: 0, a: {}, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0 }
}

function freezeDeep<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v)) freezeDeep(x)
  }
  return v
}

/** What peekLedger returns when there is no ledger. */
const EMPTY: Readonly<LedgerShard> = freezeDeep(emptyShard())

/** Whole dollars of an amount, or 0 when it is not a number, rounds to under 1 or is over the booking cap. */
function whole(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  const r = Math.round(x)
  return r >= 1 && r <= LEDGER_CAPS.maxBooking ? r : 0
}

/** The index of an account's class in a flow vector (0 to 5), or -1 when it is not an account (mint and burn are not accounts). */
const CLASS_OF: Readonly<Record<string, number>> = { person: 0, firm: 1, bank: 2, gov: 3, abroad: 5 }
const classCache = new Map<string, number>()
function classIdx(acct: unknown): number {
  if (typeof acct !== 'string') return -1
  const hit = classCache.get(acct)
  if (hit !== undefined) return hit
  let idx = -1
  if (acct === 'abroad') idx = 5
  else {
    const p = parseRef(acct)
    if (p && p.kind !== 'mint' && p.kind !== 'burn') idx = hasOwn(CLASS_OF, p.kind) ? CLASS_OF[p.kind]! : 4
  }
  if (classCache.size >= 4096) classCache.clear()
  classCache.set(acct, idx)
  return idx
}

/** The class an account counts in, for a flow row: a pool for any kind that is not named, and `pool` for text that is no account. */
export function acctClass(acct: string): AcctClass {
  const p = parseRef(acct)
  if (p && (p.kind === 'mint' || p.kind === 'burn')) return p.kind
  const i = classIdx(acct)
  return i < 0 ? 'pool' : ACCT_CLASSES[i]!
}

const kindOf = (acct: string): string => (acct.indexOf(':') < 0 ? acct : acct.slice(0, acct.indexOf(':')))

type Sink = { kind: 'mint'; name: MintName } | { kind: 'burn'; name: BurnName }

/** `mint:lending` and `burn:writeoff` and so on: a declared sink, or null. */
function sinkOf(s: string): Sink | null {
  const at = s.indexOf(':')
  if (at < 0) return null
  const kind = s.slice(0, at)
  const name = s.slice(at + 1)
  if (kind === 'mint' && hasOwn(MINTS, name)) return { kind, name: name as MintName }
  if (kind === 'burn' && hasOwn(BURNS, name)) return { kind, name: name as BurnName }
  return null
}

function countryOf(g: GameState, country?: string): string {
  const c: unknown = country ?? g.character?.countryId
  return typeof c === 'string' && COUNTRY.test(c) ? c : 'xx'
}

const tokenOf = (t: unknown): string | undefined => (typeof t === 'string' && t.length > 0 ? t.slice(0, TOKEN_MAX) : undefined)

const total = (r: Record<string, number>): number => {
  let s = 0
  for (const v of Object.values(r)) if (typeof v === 'number' && Number.isFinite(v)) s += v
  return s
}

function setBal(a: Record<string, number>, acct: string, v: number): void {
  if (v === 0) delete a[acct]
  else a[acct] = v
}

/** One log row, merged with an earlier row of the same year, kind and name. The log keeps the newest 40. */
function addLog(L: LedgerShard, kind: string, name: string, amount: number): void {
  const l = L.l
  for (let i = l.length - 1; i >= 0; i--) {
    const row = l[i]!
    if (row[0] === L.y && row[1] === kind && row[2] === name) {
      row[3] = Math.min(LEDGER_CAPS.maxBalance, row[3] + amount)
      return
    }
  }
  l.push([L.y, kind, name, Math.min(LEDGER_CAPS.maxBalance, amount)])
  if (l.length > LEDGER_CAPS.logRows) l.splice(0, l.length - LEDGER_CAPS.logRows)
}

function flowYear(key: string): number {
  return Number(key.slice(0, key.indexOf(':')))
}

function parseFlowKey(key: string): { year: number; country: string; reason: Reason } | null {
  const a = key.indexOf(':')
  if (a < 1) return null
  const b = key.indexOf(':', a + 1)
  if (b < 0) return null
  const ys = key.slice(0, a)
  const year = Number(ys)
  if (!/^\d{1,7}$/.test(ys) || String(year) !== ys || year > YEAR_MAX) return null
  const country = key.slice(a + 1, b)
  if (country !== '*' && !COUNTRY.test(country)) return null
  const reason = key.slice(b + 1)
  if (!hasOwn(REASONS, reason)) return null
  return { year, country, reason: reason as Reason }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading: the shard of a state
// ---------------------------------------------------------------------------------------------------------------------------

/** Shards this module has checked (the object itself, so a structuredClone is checked once more). */
const VALIDATED = new WeakSet<object>()
/** What peekLedger made of a saved object that was not valid as it stood, by the identity of that object. */
const PEEKED = new WeakMap<object, LedgerShard>()

/**
 * The ledger of this game. Pure: absent or garbage reads as the empty shard (frozen), a ledger that needs repair reads as its
 * repaired copy, and nothing is ever written, so it works on a frozen state.
 */
export function peekLedger(g: GameState): Readonly<LedgerShard> {
  const w: unknown = g.world
  if (!isPlain(w) || w.v !== 1) return EMPTY
  const raw = w.ledger
  if (typeof raw !== 'object' || raw === null) return EMPTY
  if (VALIDATED.has(raw)) return raw as LedgerShard
  const seen = PEEKED.get(raw)
  if (seen) return seen
  const n = normalizeLedger(raw)
  if (n === raw) VALIDATED.add(raw)
  else PEEKED.set(raw, n)
  return n
}

/**
 * The ledger of this game for writing. It creates and validates the shard once per object identity, and replaces a garbage `world`
 * the way ensureWorld does (a plain object with v === 1 is kept with its other shards, anything else becomes { v: 1 }). It writes,
 * so on a frozen state it throws a TypeError.
 */
export function ledgerRoot(g: GameState): LedgerShard {
  let w: unknown = g.world
  if (!isPlain(w) || w.v !== 1) {
    const fresh: NonNullable<GameState['world']> = { v: 1 }
    g.world = fresh
    w = fresh
  }
  const world = w as Record<string, unknown>
  const raw = world.ledger
  if (typeof raw === 'object' && raw !== null && VALIDATED.has(raw)) return raw as LedgerShard
  const n = normalizeLedger(raw)
  if (n !== raw) world.ledger = n
  VALIDATED.add(n)
  return n
}

/** The balance of an account, in whole dollars (negative when it owes). Pure. */
export function acctBalance(g: GameState, acct: AcctRef): number {
  const a = peekLedger(g).a
  return hasOwn(a, acct) ? a[acct]! : 0
}

/** The account of the player: person:<character id>. An heir keeps the id of the child, so an heir's history is already under it. */
export function playerAcct(g: GameState): AcctRef {
  return `person:${g.character.id}`
}

/** Whether a token was already booked this year. Pure. A token of last year is free. */
export function tokenSeen(g: GameState, token: string): boolean {
  const tok = tokenOf(token)
  if (tok === undefined) return false
  const L = peekLedger(g)
  return L.y === g.year && L.r.includes(tok)
}

/** What a mint can still create this year. Pure. */
export function mintRoom(g: GameState, name: MintName): number {
  if (!hasOwn(MINTS, name)) return 0
  const L = peekLedger(g)
  const used = L.y === g.year && hasOwn(L.ym, name) ? L.ym[name]! : 0
  return Math.max(0, MINTS[name].cap - used)
}

/** The flow rows of one year (or of this year and last year without an argument), sorted by year, country, reason. Pure. */
export function flowsOf(g: GameState, year?: number): FlowRow[] {
  const f = peekLedger(g).f
  const out: FlowRow[] = []
  for (const key of Object.keys(f)) {
    const p = parseFlowKey(key)
    if (!p) continue
    if (year === undefined ? p.year !== g.year && p.year !== g.year - 1 : p.year !== year) continue
    const v = f[key]!
    const net = {} as Record<AcctClass, number>
    ACCT_CLASSES.forEach((c, i) => {
      net[c] = v[i] ?? 0
    })
    out.push({ year: p.year, country: p.country, reason: p.reason, net })
  }
  out.sort((x, y) => x.year - y.year || (x.country < y.country ? -1 : x.country > y.country ? 1 : 0) || (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0))
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// Writing: the roll, the account cap, the flow rows
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Folds the smallest accounts into pool:other until at most `limit` remain (pool:other included): person and firm accounts first, and
 * with `wide` any other account too. Never `keep` (the player) and never pool:other itself. It books no flow: it is a relabel.
 */
function foldSmallest(L: LedgerShard, limit: number, keep: string | null, wide: boolean): void {
  const names = Object.keys(L.a)
  const over = names.length - limit
  if (over <= 0) return
  const need = over + (hasOwn(L.a, OTHER) ? 0 : 1)
  const crowd = (k: string): boolean => k.startsWith('person:') || k.startsWith('firm:')
  const cand = names.filter((k) => k !== OTHER && k !== keep && (wide || crowd(k)))
  cand.sort((x, y) => Math.abs(L.a[x]!) - Math.abs(L.a[y]!) || (x < y ? -1 : 1))
  const moved: Record<string, number> = {}
  let sum = 0
  for (const k of cand.slice(0, need)) {
    const bal = L.a[k]!
    delete L.a[k]
    sum += bal
    const kind = kindOf(k)
    moved[kind] = (moved[kind] ?? 0) + Math.abs(bal)
  }
  if (sum !== 0 || hasOwn(L.a, OTHER)) setBal(L.a, OTHER, (hasOwn(L.a, OTHER) ? L.a[OTHER]! : 0) + sum)
  for (const kind of Object.keys(moved).sort()) addLog(L, 'fold', kind, moved[kind]!)
}

/** The first booking of a new year closes the old one; a clock that moves backwards resets the counters. */
function roll(g: GameState, L: LedgerShard): void {
  const year = g.year
  if (!isYear(year) || L.y === year) return
  if (L.y === 0) {
    L.y = year
    return
  }
  if (year < L.y) {
    L.ym = {}
    L.yb = {}
    L.r = []
    L.y = year
    for (const key of Object.keys(L.f)) if (flowYear(key) > year) delete L.f[key]
    return
  }
  let sum = 0
  for (const v of Object.values(L.a)) sum += v
  while (L.c.length > 0 && L.c[L.c.length - 1]![0] >= L.y) L.c.pop()
  L.c.push([L.y, sum, total(L.m), total(L.b)])
  if (L.c.length > LEDGER_CAPS.closes) L.c.splice(0, L.c.length - LEDGER_CAPS.closes)
  L.ym = {}
  L.yb = {}
  L.r = []
  L.y = year
  for (const key of Object.keys(L.f)) if (flowYear(key) < year - 1) delete L.f[key]
  if (Object.keys(L.a).length > FOLD_TO) foldSmallest(L, FOLD_TO, g.character ? `person:${g.character.id}` : null, false)
}

/**
 * Where a booking to `acct` lands: the account, or pool:other when the ledger holds as many accounts as it may and `acct` is new.
 * One slot always stays free for pool:other itself. `extra` counts an account the same booking is about to create.
 */
function landing(L: LedgerShard, acct: string, extra: number): string {
  if (hasOwn(L.a, acct)) return acct
  const room = LEDGER_CAPS.accounts - (acct === OTHER || hasOwn(L.a, OTHER) ? 0 : 1)
  return Object.keys(L.a).length + extra < room ? acct : OTHER
}

/** The vector of a flow row, created on first use. Named countries stop at 8 a year and at a budget of rows; the rest share `*`. */
function flowVec(L: LedgerShard, country: string, reason: Reason): number[] {
  const year = L.y
  const key = `${year}:${country}:${reason}`
  const hit = L.f[key]
  if (hit) return hit
  let at = country
  const prefix = `${year}:`
  const keys = Object.keys(L.f)
  if (country !== '*') {
    const seen = new Set<string>()
    let rows = 0
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue
      rows++
      const c = k.slice(prefix.length, k.indexOf(':', prefix.length))
      if (c !== '*') seen.add(c)
    }
    if ((seen.size >= LEDGER_CAPS.flowCountries && !seen.has(country)) || rows >= FLOW_NAMED_PER_YEAR) at = '*'
  }
  const key2 = at === country ? key : `${year}:${at}:${reason}`
  const hit2 = L.f[key2]
  if (hit2) return hit2
  const v = [0, 0, 0, 0, 0, 0, 0, 0]
  // The budget above keeps the rows under the cap; a shard loaded already full gets a scratch row (the books still balance).
  if (keys.length < LEDGER_CAPS.flowRows) L.f[key2] = v
  return v
}

function takeToken(L: LedgerShard, tok: string): void {
  L.r.push(tok)
  if (L.r.length > LEDGER_CAPS.receipts) L.r.splice(0, L.r.length - LEDGER_CAPS.receipts)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Double entry: `amount` (whole dollars) moves from `from` to `to` under `reason`. Returns what it booked, or 0 when it refused:
 * an amount under a dollar, not finite or over 1e15, an unknown reason, a bad or equal pair of accounts (a mint or burn is not an
 * account: use bookMint and bookBurn), a token already booked this year, or a balance that would pass 9e15. A refusal changes nothing.
 * `country` names the country of the flow row (default: the player's).
 */
export function book(g: GameState, reason: Reason, from: AcctRef, to: AcctRef, amount: number, token?: string, country?: string): number {
  if (!hasOwn(REASONS, reason)) return 0
  const r = whole(amount)
  if (r === 0) return 0
  const fi = classIdx(from)
  const ti = classIdx(to)
  if (fi < 0 || ti < 0 || from === to) return 0
  const L = ledgerRoot(g)
  roll(g, L)
  const tok = tokenOf(token)
  if (tok !== undefined && L.r.includes(tok)) return 0
  const a = L.a
  const f = landing(L, from, 0)
  const t = landing(L, to, hasOwn(a, f) ? 0 : 1)
  let nf = 0
  let nt = 0
  if (f !== t) {
    nf = (hasOwn(a, f) ? a[f]! : 0) - r
    nt = (hasOwn(a, t) ? a[t]! : 0) + r
    if (Math.abs(nf) > LEDGER_CAPS.maxBalance || Math.abs(nt) > LEDGER_CAPS.maxBalance) return 0
    setBal(a, f, nf)
    setBal(a, t, nt)
  }
  if (f !== from) addLog(L, 'redirect', kindOf(from), r)
  if (t !== to) addLog(L, 'redirect', kindOf(to), r)
  const v = flowVec(L, countryOf(g, country), reason)
  v[fi]! -= r
  v[ti]! += r
  L.k += 1
  if (tok !== undefined) takeToken(L, tok)
  return r
}

/**
 * Creates `amount` dollars in `to` from the declared mint `name`, clipped to what the mint has left this year (the clipped part is
 * logged as a `cap` row). Returns what was created. The reason defaults to the sink's own (kernel/reasons.ts MINT_REASON).
 */
export function bookMint(g: GameState, name: MintName, to: AcctRef, amount: number, reason?: Reason, token?: string, country?: string): number {
  if (!hasOwn(MINTS, name)) return 0
  const why: Reason = reason ?? MINT_REASON[name]
  if (!hasOwn(REASONS, why)) return 0
  const r = whole(amount)
  if (r === 0) return 0
  const ti = classIdx(to)
  if (ti < 0) return 0
  const L = ledgerRoot(g)
  roll(g, L)
  const tok = tokenOf(token)
  if (tok !== undefined && L.r.includes(tok)) return 0
  const room = Math.max(0, MINTS[name].cap - (hasOwn(L.ym, name) ? L.ym[name]! : 0))
  const give = Math.min(r, room)
  if (give < r) addLog(L, 'cap', name, r - give)
  if (give < 1) return 0
  const t = landing(L, to, 0)
  const nt = (hasOwn(L.a, t) ? L.a[t]! : 0) + give
  if (Math.abs(nt) > LEDGER_CAPS.maxBalance) return 0
  setBal(L.a, t, nt)
  if (t !== to) addLog(L, 'redirect', kindOf(to), give)
  L.m[name] = (hasOwn(L.m, name) ? L.m[name]! : 0) + give
  L.ym[name] = (hasOwn(L.ym, name) ? L.ym[name]! : 0) + give
  const v = flowVec(L, countryOf(g, country), why)
  v[6]! -= give
  v[ti]! += give
  addLog(L, 'mint', name, give)
  L.k += 1
  if (tok !== undefined) takeToken(L, tok)
  return give
}

/** The mirror of bookMint: destroys `amount` dollars of `from` into the declared burn `name`, clipped to its yearly cap. */
export function bookBurn(g: GameState, name: BurnName, from: AcctRef, amount: number, reason?: Reason, token?: string, country?: string): number {
  if (!hasOwn(BURNS, name)) return 0
  const why: Reason = reason ?? BURN_REASON[name]
  if (!hasOwn(REASONS, why)) return 0
  const r = whole(amount)
  if (r === 0) return 0
  const fi = classIdx(from)
  if (fi < 0) return 0
  const L = ledgerRoot(g)
  roll(g, L)
  const tok = tokenOf(token)
  if (tok !== undefined && L.r.includes(tok)) return 0
  const room = Math.max(0, BURNS[name].cap - (hasOwn(L.yb, name) ? L.yb[name]! : 0))
  const take = Math.min(r, room)
  if (take < r) addLog(L, 'cap', name, r - take)
  if (take < 1) return 0
  const f = landing(L, from, 0)
  const nf = (hasOwn(L.a, f) ? L.a[f]! : 0) - take
  if (Math.abs(nf) > LEDGER_CAPS.maxBalance) return 0
  setBal(L.a, f, nf)
  if (f !== from) addLog(L, 'redirect', kindOf(from), take)
  L.b[name] = (hasOwn(L.b, name) ? L.b[name]! : 0) + take
  L.yb[name] = (hasOwn(L.yb, name) ? L.yb[name]! : 0) + take
  const v = flowVec(L, countryOf(g, country), why)
  v[fi]! -= take
  v[7]! += take
  addLog(L, 'burn', name, take)
  L.k += 1
  if (tok !== undefined) takeToken(L, tok)
  return take
}

/**
 * Moves a whole balance (it may be negative) from one account into another and deletes the first. The sum is unchanged and no flow
 * is booked: it is a relabel, not money moving. Returns the balance moved, 0 when there was none or the move was refused.
 */
export function foldAccount(g: GameState, from: AcctRef, into: AcctRef, token?: string): number {
  if (classIdx(from) < 0 || classIdx(into) < 0 || from === into) return 0
  if (!hasOwn(peekLedger(g).a, from)) return 0
  const L = ledgerRoot(g)
  roll(g, L)
  const tok = tokenOf(token)
  if (tok !== undefined && L.r.includes(tok)) return 0
  if (!hasOwn(L.a, from)) return 0
  const bal = L.a[from]!
  const next = (hasOwn(L.a, into) ? L.a[into]! : 0) + bal
  if (Math.abs(next) > LEDGER_CAPS.maxBalance) return 0
  delete L.a[from]
  setBal(L.a, into, next)
  addLog(L, 'fold', kindOf(from), Math.abs(bal))
  if (tok !== undefined) takeToken(L, tok)
  return bal
}

// ---------------------------------------------------------------------------------------------------------------------------
// Booking for an entity: what the money wrappers use
// ---------------------------------------------------------------------------------------------------------------------------

interface WhyObj {
  reason: Reason
  with?: AcctRef
  country?: string
  token?: string
}

function whyOf(why: Why | undefined): WhyObj {
  if (typeof why === 'string') return { reason: hasOwn(REASONS, why) ? why : 'unreasoned' }
  if (why !== null && typeof why === 'object' && typeof why.reason === 'string') return hasOwn(REASONS, why.reason) ? why : { ...why, reason: 'unreasoned' }
  return { reason: 'unreasoned' }
}

/**
 * The account on the other side of a booking for `self`: `with` when it names an account (or the right sink) other than `self`,
 * else the reason's default in the call's country. A sink on the wrong side (a receipt from a burn, a payment into a mint) is
 * pool:other, so the books never part from the cash.
 */
function otherSide(g: GameState, w: WhyObj, receiving: boolean, self: string): string {
  const named = w.with
  if (named !== undefined && named !== self && (classIdx(named) >= 0 || sinkOf(named) !== null)) {
    const s = sinkOf(named)
    if (!s || s.kind === (receiving ? 'mint' : 'burn')) return named
    return OTHER
  }
  const def = REASONS[w.reason]
  const cp = counterparty(receiving ? def.get : def.pay, countryOf(g, w.country))
  const s = sinkOf(cp)
  if (s && s.kind !== (receiving ? 'mint' : 'burn')) return OTHER
  return cp
}

/** The most a receipt under `why` can book for the player: the mint's room when its payer is a mint, else no limit. Pure. */
export function roomFor(g: GameState, why: Why | undefined): number {
  const s = sinkOf(otherSide(g, whyOf(why), true, playerAcct(g)))
  return s && s.kind === 'mint' ? mintRoom(g, s.name) : Infinity
}

/**
 * Books a change of `delta` dollars for `acct`: a positive delta is a receipt (the payer is the counterparty, or a mint), a negative
 * one a payment (the payee is the counterparty, or a burn). Returns the signed whole dollars booked, 0 when nothing was.
 */
export function bookAcct(g: GameState, acct: AcctRef, why: Why | undefined, delta: number): number {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return 0
  const r = whole(Math.abs(delta))
  if (r === 0 || classIdx(acct) < 0) return 0
  const w = whyOf(why)
  const receiving = delta > 0
  const cp = otherSide(g, w, receiving, acct)
  const s = sinkOf(cp)
  if (receiving) return s && s.kind === 'mint' ? bookMint(g, s.name, acct, r, w.reason, w.token, w.country) : book(g, w.reason, cp as AcctRef, acct, r, w.token, w.country)
  const paid = s && s.kind === 'burn' ? bookBurn(g, s.name, acct, r, w.reason, w.token, w.country) : book(g, w.reason, acct, cp as AcctRef, r, w.token, w.country)
  return paid === 0 ? 0 : -paid
}

/** bookAcct for the player: what addMoney, spend and earnIncome book. */
export function bookPlayer(g: GameState, why: Why | undefined, delta: number): number {
  return bookAcct(g, playerAcct(g), why, delta)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading what was saved: normalize and check
// ---------------------------------------------------------------------------------------------------------------------------

const clampBal = (x: number): number => Math.max(-LEDGER_CAPS.maxBalance, Math.min(LEDGER_CAPS.maxBalance, x))

/** A saved balance: a whole number within the cap, 0 for anything else. */
function balOf(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  const r = clampBal(Math.round(x))
  return r === 0 ? 0 : r
}

/** A saved cumulative: a whole number from 0 to the cap, 0 for anything else. */
function cumOf(src: unknown, name: string): number {
  if (!isPlain(src) || !hasOwn(src, name)) return 0
  const x = src[name]
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  const r = Math.max(0, Math.min(LEDGER_CAPS.maxBalance, Math.round(x)))
  return r === 0 ? 0 : r
}

/** A saved flow vector: 8 whole numbers that sum to 0, else null. */
function vecOf(x: unknown): number[] | null {
  if (!Array.isArray(x) || x.length !== 8) return null
  const v: number[] = []
  let sum = 0
  for (const e of x) {
    if (typeof e !== 'number' || !Number.isFinite(e)) return null
    const r = Math.round(e)
    if (Math.abs(r) > LEDGER_CAPS.maxBalance) return null
    v.push(r === 0 ? 0 : r)
    sum += r
  }
  return sum === 0 ? v : null
}

function sameShape(a: unknown, b: unknown, depth: number): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b)
  if (a === b) return true
  if (depth > 5) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!sameShape(a[i], b[i], depth + 1)) return false
    return true
  }
  if (Array.isArray(b)) return false
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a)
    if (ka.length !== Object.keys(b).length) return false
    for (const k of ka) if (!hasOwn(b, k) || !sameShape(a[k], b[k], depth + 1)) return false
    return true
  }
  return false
}

function rebuild(raw: unknown): LedgerShard {
  const out = emptyShard()
  if (!isPlain(raw) || raw.v !== 1) return out
  out.y = isYear(raw.y) ? raw.y : 0
  out.k = typeof raw.k === 'number' && Number.isInteger(raw.k) && raw.k >= 0 && raw.k <= LEDGER_CAPS.maxBalance ? raw.k : 0

  const l0 = raw.l
  if (Array.isArray(l0)) {
    for (let i = Math.max(0, l0.length - 2 * LEDGER_CAPS.logRows); i < l0.length; i++) {
      const row: unknown = l0[i]
      if (!Array.isArray(row) || row.length !== 4) continue
      const [y, kind, name, amount] = row as unknown[]
      if (!isYear(y) || typeof kind !== 'string' || !LOG_KIND.test(kind) || typeof name !== 'string' || !LOG_NAME.test(name)) continue
      if (typeof amount !== 'number' || !Number.isFinite(amount)) continue
      const n = Math.round(amount)
      if (n < 0 || n > LEDGER_CAPS.maxBalance) continue
      out.l.push([y, kind, name, n === 0 ? 0 : n])
    }
    if (out.l.length > LEDGER_CAPS.logRows) out.l.splice(0, out.l.length - LEDGER_CAPS.logRows)
  }

  const a0 = raw.a
  if (isPlain(a0)) {
    for (const key of Object.keys(a0)) {
      const v = balOf(a0[key])
      if (v === 0) continue
      const dest = classIdx(key) >= 0 ? key : OTHER
      setBal(out.a, dest, clampBal((hasOwn(out.a, dest) ? out.a[dest]! : 0) + v))
    }
    const n = Object.keys(out.a).length
    const limit = n === LEDGER_CAPS.accounts && !hasOwn(out.a, OTHER) ? LEDGER_CAPS.accounts - 1 : LEDGER_CAPS.accounts
    if (n > limit) {
      foldSmallest(out, limit, null, false)
      foldSmallest(out, limit, null, true)
    }
  }

  for (const name of [...Object.keys(MINTS), 'heal']) {
    const v = cumOf(raw.m, name)
    if (v > 0) out.m[name] = v
  }
  for (const name of [...Object.keys(BURNS), 'heal']) {
    const v = cumOf(raw.b, name)
    if (v > 0) out.b[name] = v
  }
  for (const name of Object.keys(MINTS)) {
    const v = Math.min(cumOf(raw.ym, name), MINTS[name as MintName].cap)
    if (v > 0) out.ym[name] = v
  }
  for (const name of Object.keys(BURNS)) {
    const v = Math.min(cumOf(raw.yb, name), BURNS[name as BurnName].cap)
    if (v > 0) out.yb[name] = v
  }

  // The identity: whatever is left of a broken one is repaired by a mint or burn named `heal`, and logged.
  const diff = total(out.a) - (total(out.m) - total(out.b))
  if (diff !== 0) {
    const mag = Math.min(LEDGER_CAPS.maxBalance, Math.abs(diff))
    if (diff > 0) out.m.heal = Math.min(LEDGER_CAPS.maxBalance, (out.m.heal ?? 0) + mag)
    else out.b.heal = Math.min(LEDGER_CAPS.maxBalance, (out.b.heal ?? 0) + mag)
    addLog(out, 'heal', diff > 0 ? 'mint' : 'burn', mag)
  }

  const f0 = raw.f
  if (isPlain(f0)) {
    const rows: { year: number; country: string; reason: Reason; v: number[] }[] = []
    for (const key of Object.keys(f0)) {
      const p = parseFlowKey(key)
      if (!p) continue
      const v = vecOf(f0[key])
      if (v) rows.push({ ...p, v })
    }
    rows.sort((x, y) => y.year - x.year || (x.country < y.country ? -1 : x.country > y.country ? 1 : 0) || (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0))
    const named = new Map<number, Set<string>>()
    const merged = new Map<string, number[]>()
    for (const row of rows) {
      let country = row.country
      if (country !== '*') {
        let set = named.get(row.year)
        if (!set) named.set(row.year, (set = new Set()))
        if (set.has(country) || set.size < LEDGER_CAPS.flowCountries) set.add(country)
        else country = '*'
      }
      const key = `${row.year}:${country}:${row.reason}`
      const have = merged.get(key)
      if (have) row.v.forEach((x, i) => (have[i]! += x))
      else merged.set(key, row.v.slice())
    }
    let n = 0
    for (const [key, v] of merged) {
      if (n++ >= LEDGER_CAPS.flowRows) break
      out.f[key] = v
    }
  }

  const r0 = raw.r
  if (Array.isArray(r0)) {
    const seen = new Set<string>()
    for (let i = Math.max(0, r0.length - 2 * LEDGER_CAPS.receipts); i < r0.length; i++) {
      const t: unknown = r0[i]
      if (typeof t === 'string' && t.length >= 1 && t.length <= TOKEN_MAX && !seen.has(t)) {
        seen.add(t)
        out.r.push(t)
      }
    }
    if (out.r.length > LEDGER_CAPS.receipts) out.r.splice(0, out.r.length - LEDGER_CAPS.receipts)
  }

  // Closes: whole numbers, years strictly increasing, and each one must balance (sum = mint - burn) or the chain of checks breaks.
  const c0 = raw.c
  if (Array.isArray(c0)) {
    let last = -1
    for (let i = 0; i < Math.min(c0.length, 100); i++) {
      const row: unknown = c0[i]
      if (!Array.isArray(row) || row.length !== 4) continue
      const [y, s, m, b] = row as unknown[]
      if (!isYear(y) || y <= last) continue
      if (![s, m, b].every((x) => typeof x === 'number' && Number.isInteger(x) && Math.abs(x) <= LEDGER_CAPS.maxBalance)) continue
      const [sn, mn, bn] = [s, m, b] as number[]
      if (mn! < 0 || bn! < 0 || sn! !== mn! - bn!) continue
      out.c.push([y, sn! === 0 ? 0 : sn!, mn! === 0 ? 0 : mn!, bn! === 0 ? 0 : bn!])
      last = y
    }
    if (out.c.length > LEDGER_CAPS.closes) out.c.splice(0, out.c.length - LEDGER_CAPS.closes)
  }
  return out
}

/**
 * Makes any value into a valid shard: total and bounded. Invalid account keys fold into pool:other, balances are whole numbers
 * within the cap, over-cap lists are cut, a flow row that does not sum to zero is dropped, and any remaining break of the identity
 * is repaired by a mint or burn named `heal` with a log row. A shard that is already valid comes back as the same object.
 */
export function normalizeLedger(raw: unknown): LedgerShard {
  try {
    const out = rebuild(raw)
    return raw !== undefined && raw !== null && sameShape(raw, out, 0) ? (raw as LedgerShard) : out
  } catch {
    return emptyShard()
  }
}

/** Every problem of the books, or none. Pure. A repaired hostile load shows as a nonzero `heal` unless `allowHeal` is set. */
export function checkLedger(g: GameState, opts?: { allowHeal?: boolean }): LedgerReport {
  const L = peekLedger(g) as LedgerShard
  const problems: string[] = []
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  let sum = 0
  let accounts = 0
  for (const [k, v] of Object.entries(L.a)) {
    accounts++
    if (classIdx(k) < 0) problems.push(`account ${k} is not an account`)
    if (!num(v) || !Number.isInteger(v)) problems.push(`account ${k} holds ${String(v)}, not a whole number`)
    else {
      sum += v
      if (Math.abs(v) > LEDGER_CAPS.maxBalance) problems.push(`account ${k} passes the balance cap`)
    }
  }
  if (accounts > LEDGER_CAPS.accounts) problems.push(`${accounts} accounts, more than the ${LEDGER_CAPS.accounts} allowed`)
  const mint = total(L.m)
  const burn = total(L.b)
  if (Math.abs(sum - (mint - burn)) > 1) problems.push(`sum of the accounts ${sum} differs from mint ${mint} less burn ${burn}`)
  for (const name of Object.keys(L.m)) if (!hasOwn(MINTS, name) && name !== 'heal') problems.push(`mint ${name} is not declared`)
  for (const name of Object.keys(L.b)) if (!hasOwn(BURNS, name) && name !== 'heal') problems.push(`burn ${name} is not declared`)
  for (const [name, v] of Object.entries(L.ym)) {
    if (!hasOwn(MINTS, name)) problems.push(`yearly mint ${name} is not declared`)
    else if (!num(v) || v < 0 || v > MINTS[name as MintName].cap) problems.push(`yearly mint ${name} ${String(v)} is over its cap ${MINTS[name as MintName].cap}`)
  }
  for (const [name, v] of Object.entries(L.yb)) {
    if (!hasOwn(BURNS, name)) problems.push(`yearly burn ${name} is not declared`)
    else if (!num(v) || v < 0 || v > BURNS[name as BurnName].cap) problems.push(`yearly burn ${name} ${String(v)} is over its cap ${BURNS[name as BurnName].cap}`)
  }
  if (L.c.length > LEDGER_CAPS.closes) problems.push(`${L.c.length} closes, more than the ${LEDGER_CAPS.closes} kept`)
  for (let i = 0; i < L.c.length; i++) {
    const c = L.c[i]!
    if (i > 0 && !(c[0] > L.c[i - 1]![0])) problems.push(`close of ${c[0]} does not come after the close of ${L.c[i - 1]![0]}`)
    if (i > 0) {
      const p = L.c[i - 1]!
      if (Math.abs(c[1] - p[1] - (c[2] - p[2] - (c[3] - p[3]))) > 1) problems.push(`closes of ${p[0]} and ${c[0]}: the change of sum is not the change of mint less burn`)
    }
  }
  const last = L.c[L.c.length - 1]
  if (last && Math.abs(sum - last[1] - (mint - burn - (last[2] - last[3]))) > 1) problems.push(`the books since the close of ${last[0]} do not balance: sum moved apart from mint less burn`)
  const rows = Object.keys(L.f)
  if (rows.length > LEDGER_CAPS.flowRows) problems.push(`${rows.length} flow rows, more than the ${LEDGER_CAPS.flowRows} allowed`)
  const countries = new Map<number, Set<string>>()
  for (const key of rows) {
    const p = parseFlowKey(key)
    if (!p) {
      problems.push(`flow row ${key} has a bad key`)
      continue
    }
    const v = L.f[key]
    if (!Array.isArray(v) || v.length !== 8 || !v.every((x) => num(x) && Number.isInteger(x))) problems.push(`flow row ${key} is not 8 whole numbers`)
    else if (v.reduce((x, y) => x + y, 0) !== 0) problems.push(`flow row ${key} does not net to zero`)
    if (p.country !== '*') {
      let set = countries.get(p.year)
      if (!set) countries.set(p.year, (set = new Set()))
      set.add(p.country)
    }
  }
  for (const [year, set] of countries) if (set.size > LEDGER_CAPS.flowCountries) problems.push(`${set.size} countries have flow rows in ${year}, more than ${LEDGER_CAPS.flowCountries}`)
  if (L.r.length > LEDGER_CAPS.receipts) problems.push(`${L.r.length} tokens, more than the ${LEDGER_CAPS.receipts} kept`)
  if (L.l.length > LEDGER_CAPS.logRows) problems.push(`${L.l.length} log rows, more than the ${LEDGER_CAPS.logRows} kept`)
  const heal = (L.m.heal ?? 0) + (L.b.heal ?? 0)
  if (heal !== 0 && !opts?.allowHeal) problems.push(`heal ${heal}: the books had to be repaired`)
  return { ok: problems.length === 0, problems, sum, mint, burn, accounts, flowRows: rows.length, bookings: L.k }
}

/** The problems of the books, one line each. */
export function ledgerProblems(g: GameState): string[] {
  return checkLedger(g).problems
}
