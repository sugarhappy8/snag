// The level-of-detail framework (R2-L16, K.6 a, design 13.4): how much of the world the game keeps by name, and what happens to the
// money of an entity that stops being kept.
//
//   Named    a row in an index shard (world/people, firms, homes), capped. The Person, Asset or old NPC firm is still where it was;
//            the row says the world knows it. promote names an entity, demote lets it go, lodSweep does the yearly clean-up.
//   Pooled   what is only counted: the `over` of each index shard (copied into lod.pooled by the sweep) and the pool accounts of the
//            ledger. An entity that stops being named folds its account into a pool (people into pool:hh:<country>, firms into
//            pool:firms, homes into pool:landlords), so the sum of the books never changes, a negative balance included.
//            Emigration is the one exit that destroys money: a named person who leaves burns a positive balance (burn:emigration).
//   Seeded   a stranger who is a pure function of the life and an id (seededEntity). It exists nowhere until something touches it,
//            and only promote makes it persist.
//
// Rules this file keeps:
//   - The rows that survive depend only on the set of names promoted, never on the order they came in. A row is ranked by
//     [protected, relevance, id] and the cap cuts the lowest unprotected rank; a name the cap turns away counts as let go, so the
//     count is order free too.
//   - Protected means an obligation exists: a person of g.people now (pets aside), the owner of an old NPC firm, a holder in the
//     holdings table, the player; a firm or home whose record still exists. A protected row is never let go by idleness or by the
//     cap. The shard's own reader (the cap of the normalizer) is the hard bound.
//   - Idle: an unprotected row whose `seen` is older than DEMOTE_AFTER_YEARS full years before g.year (seen < g.year - 5: five
//     untouched years in between). Nothing reads a year after g.year, so a row stamped in the future is never idle.
//   - The sweep's cap of a kind is how many rows R2 can name: the 80 intimate people (the other 320 of LOD_CAPS.people arrive with R4's
//     named strangers), the 60 firms of the shard (20 of them full, the rest lite), the 150 homes. LOD_CAPS.jobs has no shard yet.
//   - A promoted entity moves no cash in R2: no stranger holds any. A later release that gives a seeded entity an endowment buys it
//     from the pool at promotionPrice and sells it back at demotionProceeds, so a promote and demote loop loses the spread.
//   - Every shard is written by replacing its root (commitShard), only when it changed. No luck is drawn here except through
//     stream(g, 'lod', ...) in seededEntity, and no clock is read.
//
// The index readers go through the registered normalizers: import world/shards for effect (world/sync.ts does).
import type { EntityRef } from '../kernel/ids'
import { acctBalance, bookBurn, foldAccount, type AcctRef } from '../kernel/ledger'
import { counterparty, type PoolName } from '../kernel/reasons'
import { ask, bid } from '../kernel/spreads'
import { stream } from '../kernel/streams'
import type { GameState } from '../types'
import { DEMOTE_AFTER_YEARS, LOD_CAPS } from './caps'
import { firmRef, normalizeFirms, rankFirms, readFirms } from './firms'
import { OUTSIDE, readHoldings } from './holdings'
import { normalizeHomes, rankHomes, readHomes } from './homes'
import { normalizePeople, npcFirmId, personRef, playerRef, readPeople } from './people'
import { commitShard, isPlain, overOf, refOfKind, sameJson, seenOf } from './rows'
import { worldShard } from './state'
import type { FirmRow, HomeRow, LodShard, PersonRow } from './types'

export { DEMOTE_AFTER_YEARS, LOD_CAPS }

export type LodKind = 'person' | 'firm' | 'home'

/** Why an entity stops being named: it sat idle, the cap pushed it out, or (people only) it left the country. */
export type DemoteWhy = 'idle' | 'cap' | 'emigrated'

/** What promote needs to know of a company or home that has no record in the game: who owns it and, for a company, which kind it is. */
export interface PromoteOpts {
  owner?: EntityRef
  form?: 'biz' | 'npc'
}

type Row = PersonRow | FirmRow | HomeRow

/** The pool each kind trades with: what a promotion buys from and a demotion sells back to. */
const POOL_OF: Readonly<Record<LodKind, PoolName>> = { person: 'hh', firm: 'firms', home: 'sellers' }

/** A recent row of a person who owns an old NPC firm or holds shares ranks above its recency alone by this much. */
const BONUS = 1_000
/** The most `demoted` counts. */
const DEMOTED_MAX = 1_000_000_000
const COUNTRY = /^[A-Za-z0-9._-]{1,16}$/

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

// ---------------------------------------------------------------------------------------------------------------------------
// The lod shard
// ---------------------------------------------------------------------------------------------------------------------------

const EMPTY_LOD: Readonly<LodShard> = Object.freeze({ v: 1, y: 0, pooled: Object.freeze({ person: 0, firm: 0, home: 0 }), demoted: 0 })

function countOf(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(DEMOTED_MAX, Math.trunc(x))) || 0 : 0
}

/** Makes any value into a valid lod shard: { v: 1, y, pooled, demoted }, whole numbers in range, a year or 0. Total; a valid input comes back as itself. */
export function normalizeLod(raw: unknown): LodShard {
  try {
    const next: LodShard = { v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 }
    if (isPlain(raw) && raw.v === 1) {
      next.y = seenOf(raw.y) ?? 0
      const p = raw.pooled
      if (isPlain(p)) next.pooled = { person: overOf(p.person), firm: overOf(p.firm), home: overOf(p.home) }
      next.demoted = countOf(raw.demoted)
    }
    return sameJson(raw, next) ? (raw as LodShard) : next
  } catch {
    return { v: 1, y: 0, pooled: { person: 0, firm: 0, home: 0 }, demoted: 0 }
  }
}

/** The lod shard of this game. Pure: an absent or garbage shard reads as empty. */
export function lodShard(g: GameState): Readonly<LodShard> {
  return worldShard<LodShard>(g, 'lod') ?? EMPTY_LOD
}

function writeLod(g: GameState, patch: Partial<LodShard>): void {
  const have = lodShard(g)
  const next = normalizeLod({ v: 1, y: patch.y ?? have.y, pooled: patch.pooled ?? have.pooled, demoted: Math.min(DEMOTED_MAX, patch.demoted ?? have.demoted) })
  commitShard(g, 'lod', next, EMPTY_LOD)
}

function bump(g: GameState, n: number): void {
  if (n > 0) writeLod(g, { demoted: lodShard(g).demoted + n })
}

// ---------------------------------------------------------------------------------------------------------------------------
// The three kinds
// ---------------------------------------------------------------------------------------------------------------------------

interface Def {
  kind: LodKind
  shard: 'people' | 'firms' | 'homes'
  /** How many rows R2 names of this kind. */
  cap: number
  read: (g: GameState) => { rows: readonly Row[]; over: number }
  normalize: (raw: unknown) => object
}

const DEFS: Readonly<Record<LodKind, Def>> = {
  person: { kind: 'person', shard: 'people', cap: LOD_CAPS.intimate, read: readPeople, normalize: normalizePeople },
  firm: { kind: 'firm', shard: 'firms', cap: LOD_CAPS.firms, read: readFirms, normalize: normalizeFirms },
  home: { kind: 'home', shard: 'homes', cap: LOD_CAPS.homes, read: readHomes, normalize: normalizeHomes },
}

function defOf(kind: unknown): Def | null {
  return typeof kind === 'string' && hasOwn(DEFS, kind) ? DEFS[kind as LodKind] : null
}

function countryOf(g: GameState): string {
  const c: unknown = g.character?.countryId
  return typeof c === 'string' && COUNTRY.test(c) ? c : 'xx'
}

/** Where the cash of an entity that stops being named goes: back to the pool its kind came from. */
function foldTarget(g: GameState, kind: LodKind): AcctRef {
  if (kind === 'person') return counterparty('hh', countryOf(g))
  return kind === 'firm' ? 'pool:firms' : 'pool:landlords'
}

/** Stores the rows of a kind by replacing the shard root, only when they differ from what is stored. `over` stays as the last sync left it. */
function writeRows(g: GameState, def: Def, rows: readonly Row[]): void {
  commitShard(g, def.shard, def.normalize({ v: 1, rows, over: def.read(g).over }), { v: 1, rows: [], over: 0 })
}

// ---------------------------------------------------------------------------------------------------------------------------
// Protection and rank
// ---------------------------------------------------------------------------------------------------------------------------

interface Ctx {
  cap: number
  /** An obligation exists: this row is never let go by idleness or by the cap. */
  guarded: (id: string) => boolean
  /** Extra relevance of an id (an owner of an old NPC firm, a holder). */
  bonus: (id: string) => number
}

function contextOf(g: GameState, kind: LodKind): Ctx {
  const cap = DEFS[kind].cap
  if (kind === 'person') {
    const here = new Set<string>()
    const owners = new Set<string>()
    for (const p of g.people) {
      if (p.relation === 'pet') continue
      const r = personRef(p)
      here.add(r)
      if (npcFirmId(p) !== null) owners.add(r)
    }
    const held = new Set<string>()
    for (const r of readHoldings(g).rows) if (r[0] !== OUTSIDE) held.add(r[0])
    const me: string = playerRef(g)
    return { cap, guarded: (id) => id === me || here.has(id) || held.has(id), bonus: (id) => (owners.has(id) || held.has(id) ? BONUS : 0) }
  }
  const present: ReadonlySet<string> = kind === 'firm' ? rankFirms(g).present : rankHomes(g).present
  return { cap, guarded: (id) => present.has(id), bonus: () => 0 }
}

/** How relevant a row is: its `seen` (never later than this year) plus the bonus of its id. Pure. */
export function relevance(g: GameState, kind: LodKind, row: { id: string; seen: number }): number {
  const def = defOf(kind)
  if (def === null) return 0
  const seen = Number.isFinite(row.seen) ? Math.min(row.seen, g.year) : 0
  return seen + contextOf(g, kind).bonus(row.id)
}

interface Ranked {
  row: Row
  rel: number
}

/** Higher relevance first, then the smaller id. */
const higher = (a: Ranked, b: Ranked): number => b.rel - a.rel || cmp(a.row.id, b.row.id)

/**
 * What the cap keeps of `all`: every protected row, and the best of the others by [relevance, id] up to what is left of the cap. What it
 * cuts is every other row, sorted by id. The result depends only on the set of rows.
 */
function cut(all: readonly Row[], ctx: Ctx, year: number): { keep: Row[]; out: Row[] } {
  const keep: Row[] = []
  const free: Ranked[] = []
  for (const row of all) {
    if (ctx.guarded(row.id)) keep.push(row)
    else free.push({ row, rel: Math.min(row.seen, year) + ctx.bonus(row.id) })
  }
  free.sort(higher)
  const room = Math.max(0, ctx.cap - keep.length)
  for (const r of free.slice(0, room)) keep.push(r.row)
  const out = free.slice(room).map((r) => r.row)
  return { keep, out: out.sort((a, b) => cmp(a.id, b.id)) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Letting go
// ---------------------------------------------------------------------------------------------------------------------------

/** Settles the account of one entity that stops being named: a fold into its pool, or for an emigrant a burn of what is positive. Returns the balance moved. */
function settle(g: GameState, kind: LodKind, id: string, emigrated: boolean): number {
  const into = foldTarget(g, kind)
  const acct = id as AcctRef
  if (!emigrated) return foldAccount(g, acct, into)
  const bal = acctBalance(g, acct)
  const burned = bal > 0 ? bookBurn(g, 'emigration', acct, bal) : 0
  // A burn the yearly cap clipped leaves the rest of the balance: it folds, so no account is left behind.
  return burned + foldAccount(g, acct, into)
}

/** Stores `keep` as the rows of a kind and folds the account of every row in `out` (sorted ids). Returns how many rows were let go. */
function release(g: GameState, def: Def, keep: readonly Row[], out: readonly Row[]): number {
  for (const row of out) settle(g, def.kind, row.id, false)
  writeRows(g, def, keep)
  return out.length
}

/**
 * Lets an entity go: removes its row (if it has one), counts it, and settles its ledger account. 'idle' and 'cap' fold the account
 * into the pool of its kind (a negative balance too, so the sum of the books never changes). 'emigrated' is for people only: a positive
 * balance is burned (burn:emigration, capped, with a log row) and a negative one is folded. Returns the balance it moved, 0 when there
 * was none. Asking for a name that is not a ref of that kind, or for a firm or home to emigrate, changes nothing.
 */
export function demote(g: GameState, kind: LodKind, id: EntityRef, why: DemoteWhy): number {
  const def = defOf(kind)
  if (def === null || refOfKind(id, kind) === null) return 0
  if (why !== 'idle' && why !== 'cap' && why !== 'emigrated') return 0
  if (why === 'emigrated' && kind !== 'person') return 0
  const moved = settle(g, kind, id, why === 'emigrated')
  const rows = def.read(g).rows
  if (rows.some((r) => r.id === id)) {
    writeRows(g, def, rows.filter((r) => r.id !== id))
    bump(g, 1)
  }
  return moved
}

// ---------------------------------------------------------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------------------------------------------------------

/** The row for a candidate: stamped with this year; a company takes its owner and form from the record it names, `opts` overrides either, and a home belongs to the player. */
function rowFor(g: GameState, kind: LodKind, id: EntityRef, opts: PromoteOpts | undefined): Row | null {
  const seen = g.year
  if (kind === 'person') return { id, seen }
  const me = playerRef(g)
  let owner: EntityRef = me
  let form: 'biz' | 'npc' = 'npc'
  if (kind === 'firm') {
    const asset = g.assets.find((a) => a.kind === 'business' && firmRef(a.id) === id)
    if (asset) {
      form = 'biz'
    } else {
      const person = g.people.find((p) => {
        const key = npcFirmId(p)
        return key !== null && firmRef(key) === id
      })
      if (person) owner = personRef(person)
    }
    if (opts?.form === 'biz' || opts?.form === 'npc') form = opts.form
  }
  if (opts?.owner !== undefined) owner = opts.owner
  if (refOfKind(owner, 'person') === null) return null
  return kind === 'firm' ? { id, form, owner, seen } : { id, owner, seen }
}

/**
 * Takes an entity into the index, stamped with this year, and says whether it is named afterwards. A name that is already there is
 * only touched. When the kind is full, the lowest ranked unprotected row (the new name included) is let go, so the rows that stay depend
 * only on the set of names promoted, not on their order; a name the cap turns away is let go too (and counted). A shard full of protected
 * rows has nothing to give: promote returns false and changes nothing. A company or home with no record in the game takes its owner
 * and form from `opts`, else the player and an old NPC firm. No cash moves.
 */
export function promote(g: GameState, kind: LodKind, id: EntityRef, opts?: PromoteOpts): boolean {
  const def = defOf(kind)
  if (def === null || refOfKind(id, kind) === null || seenOf(g.year) === null) return false
  const rows = def.read(g).rows
  const have = rows.find((r) => r.id === id)
  if (have) {
    if (have.seen !== g.year) writeRows(g, def, rows.map((r) => (r === have ? { ...r, seen: g.year } : r)))
    return true
  }
  const row = rowFor(g, kind, id, opts)
  if (row === null) return false
  const ctx = contextOf(g, kind)
  const kept = rows.filter((r) => ctx.guarded(r.id)).length
  if (ctx.guarded(id) ? kept + 1 > ctx.cap : kept >= ctx.cap) return false
  const next = cut([...rows, row], ctx, g.year)
  release(g, def, next.keep, next.out)
  bump(g, next.out.length)
  return !next.out.includes(row)
}

/**
 * The yearly clean-up (the W7 step), idempotent by the year stamp. For each kind, in the order person, firm, home: (1) every unprotected
 * row idle for DEMOTE_AFTER_YEARS full years goes; (2) a shard still past its cap (a hostile load) keeps its protected rows and the best
 * of the others by [relevance, id], and the rest go, in sorted id order; (3) the over counts are copied into lod.pooled and lod.y is
 * stamped. Each row that goes folds its account. Returns how many rows went.
 */
export function lodSweep(g: GameState): number {
  if (lodShard(g).y === g.year) return 0
  const limit = g.year - DEMOTE_AFTER_YEARS
  let gone = 0
  for (const kind of ['person', 'firm', 'home'] as const) {
    const def = DEFS[kind]
    const ctx = contextOf(g, kind)
    const idle: Row[] = []
    const live: Row[] = []
    for (const r of def.read(g).rows) (r.seen < limit && !ctx.guarded(r.id) ? idle : live).push(r)
    const next = cut(live, ctx, g.year)
    gone += release(g, def, next.keep, [...idle, ...next.out].sort((a, b) => cmp(a.id, b.id)))
  }
  writeLod(g, { y: g.year, pooled: { person: readPeople(g).over, firm: readFirms(g).over, home: readHomes(g).over }, demoted: lodShard(g).demoted + gone })
  return gone
}

// ---------------------------------------------------------------------------------------------------------------------------
// Seeded entities and the spread
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * A stranger made from the life and an id alone: `make` gets the generator of the stream named by the kind and the key, so the same
 * life gives the same entity every time (an heir of the family too), in any year, after any reload. Pure: it reads only the life id,
 * writes nothing, and never touches g.rng. The stranger persists nowhere until promote names it.
 */
export function seededEntity<T>(g: GameState, kind: string, key: string, make: (rand: () => number) => T): T {
  return make(stream(g, 'lod', 0, `${kind}:${key}`))
}

const priced = (mid: number): number => (Number.isFinite(mid) && mid > 0 ? mid : 0)

/** What taking an entity worth `mid` out of its pool costs: above the mid price by the pool's spread. */
export function promotionPrice(mid: number, kind: LodKind): number {
  return ask(priced(mid), POOL_OF[kind])
}

/** What folding an entity worth `mid` back into its pool returns: below the mid price by the pool's spread. */
export function demotionProceeds(mid: number, kind: LodKind): number {
  return bid(priced(mid), POOL_OF[kind])
}
