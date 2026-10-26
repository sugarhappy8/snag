// The Edge model (R4-E6a, D.3): who feels what about whom, as pure code. Nothing is stored and nothing is written here; E6b adds the
// writer (world/edge-write.ts), the `social` stamp and the `world.edges` entity slice on top.
//
// An edge is `first end > second end` and says what the first end feels about the second: trust, affection (it equals
// Person.relationship for the ego's people, E7 makes that true), respect, resentment, obligation, up to 8 memories, and optionally a
// feud rung, a debt, a favor call-in stamp and a link kind. The record `g.world.edges` is ONE keyed map, 'person:p12>person:p3' to
// the edge, keys ascending by code unit, no `v` key (the version is in the slice table). The same map holds the secrets, under
// 'secret:<n>' (a record { a, k, v, h, y, p? }, written by E11, checked here); they are not edges and every reader below skips them.
//
//   normalizeEdges(raw)   TOTAL: any value in, a valid map out, never a throw. A map that is already valid comes back as itself.
//   edgeKey / readEdge / edgesOf / memoriesOf / salience / liveFeuds / openDebts   the pure reads.
//   edgeLocalBound(e)     bound by the edge alone: a link kind, an unpaid debt, a feud or a pinned memory.
//   edgeProblems(raw, people?, ego?)   every fault of a stored map, named, for the world invariant (E6b wires it).
//
// The reads take the raw `readWorld(g).edges` and run normalizeEdges on it, cached by the identity of the root (a shard root is
// replaced, never edited in place, as world/state.ts worldShard assumes), so they work before any shard is registered and E6b's
// registration changes none of their results. Reads never create g.world, never draw a number and never write.
//
// The caps are EDGE_CAPS (world/caps.ts). The order in which the normalizer enforces them is the one that keeps `edgeLocalBound`
// true to the stored fields: fields first (each clamped or dropped), then 8 memories an edge, 6 `n` and 8 `d`, then `n` and `d` on
// 120 edges at most, 4,000 memories in all, 12 feuds, 40 debts, 40 secrets with 6 holders each, and last the 1,200 edges, the
// lowest salience first and the edges that are bound last. Every cut is by salience (highest kept, ties by key) and so is a function
// of the set of edges, never of the order they came in.
//
// Layer 2: it imports the ref grammar, the person key, the caps, the memory table, the world rows and the world root.
import { parseRef, type EntityRef } from '../kernel/ids'
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { EDGE_CAPS } from './caps'
import { isMemoryKind, isPinnedKind, parseMemory, type Memory } from './edge-memory'
import { SEEN_MAX, SEEN_MIN, isPlain } from './rows'
import { readWorld } from './state'

/** What ties two people beyond how they feel. Structural: such an edge is exempt from eviction while the link stands. Append-only (R6 appends); an unknown value is dropped. */
export const LINK_KINDS = Object.freeze(['kin', 'rival', 'company', 'staff', 'pair'] as const)
export type LinkKind = (typeof LINK_KINDS)[number]

export interface Edge {
  /** Trust, affection (= Person.relationship), respect and resentment, 0 to 100. Fractions are allowed (heirEdges scales by 0.5 and 0.6). */
  t: number
  f: number
  r: number
  s: number
  /** Obligation, -100 to 100: positive when the first end owes the second. */
  o: number
  /** Since and last touched (years). */
  y: number
  l: number
  /** Memories 'kind.year.weight.by', oldest first, at most 8 (world/edge-memory.ts). */
  m?: string[]
  /** Callback keys told (6) and topic ids said (8): the dialogue store, reserved for R5 and written by nobody in R4 (X27). On 120 edges at most. */
  n?: string[]
  d?: number[]
  /** The feud: rung 1 to 4 (cold, gossip, sabotage, legal), since (year), cause (a code from 0 to 255). */
  q?: [rung: number, since: number, cause: number]
  /** The debt, in dollars the first end owes the second: owed, rate in percent a year (0 to 60), since (year), kind (0 a loan, 1 a divorce), paid. */
  dv?: [owed: number, ratePct: number, since: number, kind: number, paid: number]
  /** The year of the last favor call-in. */
  c?: number
  k?: LinkKind
}

/** 'person:p12>person:p3': both ends pass parseRef, 140 characters at most. */
export type EdgeKey = string

/** What heirEdges and Life's carryEdges take. The stored map also holds 'secret:<n>' records, which are not edges: walk it with isSecretKey in hand. */
export type EdgeMap = { readonly [key: EdgeKey]: Readonly<Edge> }

/** A secret, as stored under 'secret:<n>' (E11 writes it; society/secret.ts names the same shape). h are the holders, y the year it began, p the year it leaked. */
export interface SecretRecord {
  a: EntityRef
  k: 'affair' | 'debt'
  v: 1 | 2 | 3 | 4 | 5
  h: EntityRef[]
  y: number
  p?: number
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ranges and small readers
// ---------------------------------------------------------------------------------------------------------------------------------

const KEY_MAX = 140
const FEUD_RUNGS = 4
const CAUSE_MAX = 255
const TOPIC_MAX = 9_999
const KIND_MAX = 9
const RATE_MAX = 60
/** The largest debt or payment a record may hold: a trillion dollars (a ceiling for a hostile value, far above any loan or settlement). */
const MONEY_MAX = 1e12
const TALK_KEYS = 6
const TALK_TOPICS = 8
/** A hostile list is read from its last entries only: a valid list is far shorter than this. */
const SCAN_MAX = 64
const TOKEN = /^[A-Za-z0-9._-]{1,32}$/
const SECRET_KEY = /^secret:(?:0|[1-9][0-9]{0,8})$/
const SECRET_KINDS: readonly string[] = ['affair', 'debt']
/** Most problems edgeProblems lists; the rest are counted in a last line. */
const PROBLEMS_MAX = 60
/** Most people edgeProblems looks at for the affection invariant. */
const PEOPLE_MAX = 5_000

const LINK_ROLE: Readonly<Record<LinkKind, number>> = Object.freeze({ kin: 40, pair: 60, staff: 20, rival: 0, company: 0 })
const EDGE_FIELDS: ReadonlySet<string> = new Set(['t', 'f', 'r', 's', 'o', 'y', 'l', 'm', 'n', 'd', 'q', 'dv', 'c', 'k'])
const SECRET_FIELDS: ReadonlySet<string> = new Set(['a', 'k', 'v', 'h', 'y', 'p'])

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** An own property of a plain object, else undefined: nothing is read off the prototype chain. */
const own = (o: Record<string, unknown>, k: string): unknown => (hasOwn(o, k) ? o[k] : undefined)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
const isYear = (x: unknown): x is number => isInt(x, SEEN_MIN, SEEN_MAX)
const isMoney = (x: unknown): x is number => isNum(x) && x >= 0 && x <= MONEY_MAX
const isLinkKind = (x: unknown): x is LinkKind => typeof x === 'string' && (LINK_KINDS as readonly string[]).includes(x)
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
/** A short, quoted form of a value for a problem line. */
const show = (x: unknown): string => {
  if (typeof x === 'string') return JSON.stringify(x.length > 40 ? `${x.slice(0, 40)}...` : x)
  try {
    return String(x).slice(0, 40)
  } catch {
    return '?'
  }
}

/** A key cut for a problem line. */
const brief = (k: string): string => (k.length > 60 ? `${k.slice(0, 60)}...` : k)

/** The last SCAN_MAX entries of a list. */
const tail = (list: readonly unknown[]): readonly unknown[] => (list.length > SCAN_MAX ? list.slice(list.length - SCAN_MAX) : list)

function validQ(x: unknown): x is [number, number, number] {
  return Array.isArray(x) && x.length === 3 && isInt(x[0], 1, FEUD_RUNGS) && isYear(x[1]) && isInt(x[2], 0, CAUSE_MAX)
}

function validDv(x: unknown): x is [number, number, number, number, number] {
  return Array.isArray(x) && x.length === 5 && isMoney(x[0]) && isNum(x[1]) && x[1] >= 0 && x[1] <= RATE_MAX && isYear(x[2]) && isInt(x[3], 0, KIND_MAX) && isMoney(x[4])
}

/** True for 'secret:<n>': a whole number of nine digits at most, no leading zero. */
export function isSecretKey(k: unknown): k is string {
  return typeof k === 'string' && SECRET_KEY.test(k)
}

/** The two ends of an edge key, or null when it is not one. */
function splitKey(k: string): [EntityRef, EntityRef] | null {
  if (k.length > KEY_MAX) return null
  const at = k.indexOf('>')
  if (at < 0 || k.indexOf('>', at + 1) >= 0) return null
  const a = k.slice(0, at)
  const b = k.slice(at + 1)
  return parseRef(a) !== null && parseRef(b) !== null ? [a as EntityRef, b as EntityRef] : null
}

/** The key of the edge `from > to`, or null when either end is not a ref or the key would pass 140 characters. */
export function edgeKey(from: EntityRef, to: EntityRef): EdgeKey | null {
  if (parseRef(from) === null || parseRef(to) === null) return null
  const k = `${from}>${to}`
  return k.length <= KEY_MAX ? k : null
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Memories, salience, the bound predicate
// ---------------------------------------------------------------------------------------------------------------------------------

interface Parsed {
  s: string
  m: Memory
}

/**
 * The memories of a raw list, canonical: only text parseMemory reads, oldest year first (a stable sort, so the order they were made
 * in is kept inside a year), at most 8: over the cap the oldest unpinned goes first, and only then the oldest pinned. A fresh array.
 */
function cleanMemories(raw: unknown): Parsed[] {
  if (!Array.isArray(raw)) return []
  const out: Parsed[] = []
  let sorted = true
  for (const s of tail(raw)) {
    const m = parseMemory(s)
    if (m === null) continue
    if (out.length > 0 && m.year < out[out.length - 1]!.m.year) sorted = false
    out.push({ s: s as string, m })
  }
  if (!sorted) out.sort((a, b) => a.m.year - b.m.year)
  while (out.length > EDGE_CAPS.memPerEdge) {
    const at = out.findIndex((x) => !isPinnedKind(x.m.kind))
    out.splice(at >= 0 ? at : 0, 1)
  }
  return out
}

/** The memories of an edge as { kind, year, w, by }, oldest first and newest last, at most 8. Pure and total: anything unreadable is skipped. */
export function memoriesOf(e: Readonly<Edge>): readonly Memory[] {
  const r: unknown = e
  return isPlain(r) ? cleanMemories(own(r, 'm')).map((x) => x.m) : []
}

/** f + s + abs(o) + role, on an edge that is already clean. */
function salienceOf(e: Readonly<Edge>, role: number): number {
  return e.f + e.s + Math.abs(e.o) + role
}

/**
 * How much an edge matters: f + s + abs(o) + role, where role is the weight of the link (kin 40, pair 60, staff 20, anything else 0)
 * unless the caller gives one (E14's registered salience gives 0, X13). Pure and total: a field that is not a finite number counts as
 * 0, a number is cut to its range, and the role is cut to 0 to 100, so the result is never NaN, never negative and at most 360.
 */
export function salience(e: Readonly<Edge>, role?: number): number {
  const r: unknown = e
  const given = typeof role === 'number' && Number.isFinite(role) ? clamp(role, 0, 100) : null
  if (!isPlain(r)) return given ?? 0
  const num = (k: string, lo: number, hi: number): number => {
    const v = own(r, k)
    return isNum(v) ? clamp(v, lo, hi) : 0
  }
  const link = own(r, 'k')
  const base = given ?? (isLinkKind(link) ? LINK_ROLE[link] : 0)
  return num('f', 0, 100) + num('s', 0, 100) + Math.abs(num('o', -100, 100)) + base
}

/**
 * Bound by the edge alone, with no look at the people: a link kind, a debt with more owed than paid, a feud, or a pinned memory
 * (betrayal, saved_me, cut_from_will, estranged, divorced). normalizeEdges evicts a bound edge last, E6b's putEdge refuses to evict
 * one, E7's orphan rule keeps it; E14 widens this to isBound with the person-level cases. Pure and total.
 */
export function edgeLocalBound(e: Readonly<Edge>): boolean {
  const r: unknown = e
  if (!isPlain(r)) return false
  if (isLinkKind(own(r, 'k'))) return true
  if (validQ(own(r, 'q'))) return true
  const dv = own(r, 'dv')
  if (validDv(dv) && dv[0] > dv[4]) return true
  const m = own(r, 'm')
  return Array.isArray(m) && tail(m).some((s) => {
    const p = parseMemory(s)
    return p !== null && isPinnedKind(p.kind)
  })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// One edge, one secret
// ---------------------------------------------------------------------------------------------------------------------------------

/** A required number cut to its range; null when it is not a finite number (the edge goes). Years are whole. */
function required(raw: Record<string, unknown>, k: string, lo: number, hi: number, whole: boolean): number | null {
  const v = own(raw, k)
  if (!isNum(v)) return null
  const c = clamp(v, lo, hi)
  return whole ? Math.round(c) : c
}

/** The callback keys of a raw list: well formed tokens, the last 6. The same array when it already is such a list. */
function cleanTokens(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const good = tail(raw).filter((x): x is string => typeof x === 'string' && TOKEN.test(x))
  const kept = good.length > TALK_KEYS ? good.slice(good.length - TALK_KEYS) : good
  if (kept.length === 0) return undefined
  return kept.length === raw.length && kept.every((x, i) => x === raw[i]) ? (raw as string[]) : kept
}

/** The topic ids of a raw list: whole numbers from 0 to 9999, the last 8. The same array when it already is such a list. */
function cleanTopics(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const good = tail(raw).filter((x): x is number => isInt(x, 0, TOPIC_MAX))
  const kept = good.length > TALK_TOPICS ? good.slice(good.length - TALK_TOPICS) : good
  if (kept.length === 0) return undefined
  return kept.length === raw.length && kept.every((x, i) => x === raw[i]) ? (raw as number[]) : kept
}

/** The memory list of an edge: the raw array when it is already canonical, a new one when it is not, undefined when nothing is left. */
function memoryList(raw: unknown): string[] | undefined {
  const parsed = cleanMemories(raw)
  if (parsed.length === 0) return undefined
  return Array.isArray(raw) && raw.length === parsed.length && parsed.every((x, i) => x.s === raw[i]) ? (raw as string[]) : parsed.map((x) => x.s)
}

/**
 * One edge, clean: the required numbers cut to their range, every optional field kept only when it is valid, no other key. The edge
 * itself when it already is that; null when it is not an object or a required number is not a finite number.
 */
function cleanEdge(raw: unknown): Edge | null {
  if (!isPlain(raw)) return null
  const t = required(raw, 't', 0, 100, false)
  const f = required(raw, 'f', 0, 100, false)
  const r = required(raw, 'r', 0, 100, false)
  const s = required(raw, 's', 0, 100, false)
  const o = required(raw, 'o', -100, 100, false)
  const y = required(raw, 'y', SEEN_MIN, SEEN_MAX, true)
  const l = required(raw, 'l', SEEN_MIN, SEEN_MAX, true)
  if (t === null || f === null || r === null || s === null || o === null || y === null || l === null) return null
  const out: Edge = { t, f, r, s, o, y, l }
  const m = memoryList(own(raw, 'm'))
  if (m !== undefined) out.m = m
  const n = cleanTokens(own(raw, 'n'))
  if (n !== undefined) out.n = n
  const d = cleanTopics(own(raw, 'd'))
  if (d !== undefined) out.d = d
  const q = own(raw, 'q')
  if (validQ(q)) out.q = q
  const dv = own(raw, 'dv')
  if (validDv(dv)) out.dv = dv
  const c = own(raw, 'c')
  if (isYear(c)) out.c = c
  const k = own(raw, 'k')
  if (isLinkKind(k)) out.k = k
  // the same object when nothing changed: every field is the one that was read, and no key was added or dropped
  const keys = Object.keys(out) as (keyof Edge)[]
  if (Object.keys(raw).length !== keys.length) return out
  for (const key of keys) if (own(raw, key) !== out[key]) return out
  return raw as unknown as Edge
}

/** The holders of a raw list: valid refs, each once, the first 6. */
function cleanHolders(raw: unknown): EntityRef[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: EntityRef[] = []
  for (const x of raw.slice(0, SCAN_MAX)) {
    if (out.length >= EDGE_CAPS.holders) break
    if (parseRef(x) === null || seen.has(x as string)) continue
    seen.add(x as string)
    out.push(x as EntityRef)
  }
  return out.length === raw.length && out.every((x, i) => x === raw[i]) ? (raw as EntityRef[]) : out
}

/** One secret, clean; the object itself when it already is; null when a field is missing or wrong (a bad `p` drops the secret: a leak is never forgotten). */
function cleanSecret(raw: unknown): SecretRecord | null {
  if (!isPlain(raw)) return null
  const a = own(raw, 'a')
  const k = own(raw, 'k')
  const v = own(raw, 'v')
  const y = own(raw, 'y')
  const h = cleanHolders(own(raw, 'h'))
  if (parseRef(a) === null || typeof k !== 'string' || !SECRET_KINDS.includes(k) || !isInt(v, 1, 5) || !isYear(y) || h === null) return null
  const out: SecretRecord = { a: a as EntityRef, k: k as SecretRecord['k'], v: v as SecretRecord['v'], h, y }
  if (hasOwn(raw, 'p')) {
    const p = raw.p
    if (!isYear(p)) return null
    out.p = p
  }
  const keys = Object.keys(out) as (keyof SecretRecord)[]
  if (Object.keys(raw).length !== keys.length) return out
  for (const key of keys) if (own(raw, key) !== out[key]) return out
  return raw as unknown as SecretRecord
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The normalizer
// ---------------------------------------------------------------------------------------------------------------------------------

interface Row {
  key: string
  e: Edge
  sal: number
}

/** Highest salience first, ties by key. */
const strongFirst = (a: Row, b: Row): number => b.sal - a.sal || byKey(a.key, b.key)
/** Lowest salience first, ties by key. */
const weakFirst = (a: Row, b: Row): number => a.sal - b.sal || byKey(a.key, b.key)

type OptionalField = 'm' | 'n' | 'd' | 'q' | 'dv' | 'c' | 'k'

function without(e: Edge, ...fields: OptionalField[]): Edge {
  const out: Edge = { ...e }
  for (const f of fields) delete out[f]
  return out
}

function withMemories(e: Edge, m: string[]): Edge {
  return m.length > 0 ? { ...e, m } : without(e, 'm')
}

const pinnedText = (s: string): boolean => {
  const p = parseMemory(s)
  return p !== null && isPinnedKind(p.kind)
}

/** Which of the secrets to keep: unleaked before leaked, then the heavier, then the newer, then by key. */
const secretFirst = (a: { key: string; s: SecretRecord }, b: { key: string; s: SecretRecord }): number =>
  (a.s.p === undefined ? 0 : 1) - (b.s.p === undefined ? 0 : 1) || b.s.v - a.s.v || b.s.y - a.s.y || byKey(a.key, b.key)

function build(raw: unknown): EdgeMap {
  if (!isPlain(raw)) return {}
  const rawKeys = Object.keys(raw)
  let same = true
  let rows: Row[] = []
  let secrets: { key: string; s: SecretRecord }[] = []
  for (const key of rawKeys) {
    const v = raw[key]
    try {
      if (isSecretKey(key)) {
        const s = cleanSecret(v)
        if (s === null) same = false
        else {
          if (s !== v) same = false
          secrets.push({ key, s })
        }
      } else if (splitKey(key) !== null) {
        const e = cleanEdge(v)
        if (e === null) same = false
        else {
          if (e !== v) same = false
          rows.push({ key, e, sal: salienceOf(e, e.k === undefined ? 0 : LINK_ROLE[e.k]) })
        }
      } else same = false
    } catch {
      same = false
    }
  }

  // n and d: on 120 edges at most, the most salient keep them
  const talkers = rows.filter((r) => r.e.n !== undefined || r.e.d !== undefined)
  if (talkers.length > EDGE_CAPS.talkEdges) {
    talkers.sort(strongFirst)
    for (const r of talkers.slice(EDGE_CAPS.talkEdges)) r.e = without(r.e, 'n', 'd')
    same = false
  }

  // 4,000 memories in all: the lowest-salience edge gives up its oldest unpinned memories first, pinned ones only when nothing else is left
  let memories = 0
  for (const r of rows) memories += r.e.m?.length ?? 0
  if (memories > EDGE_CAPS.memTotal) {
    same = false
    const holders = rows.filter((r) => r.e.m !== undefined).sort(weakFirst)
    for (const onlyUnpinned of [true, false]) {
      for (const r of holders) {
        if (memories <= EDGE_CAPS.memTotal) break
        const m = r.e.m
        if (m === undefined) continue
        const keep: string[] = []
        for (const s of m) {
          if (memories > EDGE_CAPS.memTotal && (!onlyUnpinned || !pinnedText(s))) memories--
          else keep.push(s)
        }
        if (keep.length !== m.length) r.e = withMemories(r.e, keep)
      }
    }
  }

  // 12 feuds and 40 debts: the most salient keep theirs
  const feuds = rows.filter((r) => r.e.q !== undefined)
  if (feuds.length > EDGE_CAPS.feuds) {
    feuds.sort(strongFirst)
    for (const r of feuds.slice(EDGE_CAPS.feuds)) r.e = without(r.e, 'q')
    same = false
  }
  const debts = rows.filter((r) => r.e.dv !== undefined)
  if (debts.length > EDGE_CAPS.debts) {
    debts.sort(strongFirst)
    for (const r of debts.slice(EDGE_CAPS.debts)) r.e = without(r.e, 'dv')
    same = false
  }

  // 40 secrets
  if (secrets.length > EDGE_CAPS.secrets) {
    secrets = secrets.sort(secretFirst).slice(0, EDGE_CAPS.secrets)
    same = false
  }

  // 1,200 edges: the edges that are bound stay, the rest go by salience
  if (rows.length > EDGE_CAPS.edges) {
    const ranked = rows.map((r) => ({ r, bound: edgeLocalBound(r.e) }))
    ranked.sort((a, b) => Number(b.bound) - Number(a.bound) || strongFirst(a.r, b.r))
    rows = ranked.slice(0, EDGE_CAPS.edges).map((x) => x.r)
    same = false
  }

  if (same) {
    let ordered = true
    for (let i = 1; i < rawKeys.length; i++) if (!(rawKeys[i - 1]! < rawKeys[i]!)) ordered = false
    if (ordered) return raw as EdgeMap
  }
  const keyed: [string, unknown][] = rows.map((r) => [r.key, r.e])
  for (const s of secrets) keyed.push([s.key, s.s])
  keyed.sort((a, b) => byKey(a[0], b[0]))
  const out: Record<string, unknown> = {}
  for (const [k, v] of keyed) out[k] = v
  return out as EdgeMap
}

/**
 * Makes any value into a valid edge map. TOTAL: it never throws, and whatever it is given it returns a plain object whose keys are
 * edge keys and secret keys in ascending code-unit order, every edge clean, and every cap of EDGE_CAPS held. A map that is already
 * valid comes back as itself (same object, and the same entries), so a read of a good save costs one pass and no allocation.
 * It does not change its input.
 */
export function normalizeEdges(raw: unknown): EdgeMap {
  try {
    return build(raw)
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------------------------------------------------------------

type Entry = readonly [EdgeKey, Readonly<Edge>]

interface Derived {
  feuds: number
  debts: number
  index: Map<string, readonly Entry[]> | null
}

const EMPTY: EdgeMap = Object.freeze({})
const NONE: readonly Entry[] = Object.freeze([])
/** The normalized map by the identity of the stored root. */
const MAPS = new WeakMap<object, EdgeMap>()
/** What is derived from a normalized map (the counters, the index of ends), by its identity. */
const DERIVED = new WeakMap<object, Derived>()

/** The normalized edge map of this game. Pure: an absent or garbage root reads as empty and nothing is created. */
function storedMap(g: Pick<GameState, 'world'>): EdgeMap {
  const raw: unknown = readWorld(g).edges
  if (raw === null || typeof raw !== 'object') return EMPTY
  const hit = MAPS.get(raw)
  if (hit !== undefined) return hit
  const out = normalizeEdges(raw)
  MAPS.set(raw, out)
  return out
}

function derived(map: EdgeMap): Derived {
  let d = DERIVED.get(map)
  if (d === undefined) {
    let feuds = 0
    let debts = 0
    for (const k of Object.keys(map)) {
      if (isSecretKey(k)) continue
      const e = map[k]!
      if (e.q !== undefined) feuds++
      if (e.dv !== undefined) debts++
    }
    d = { feuds, debts, index: null }
    DERIVED.set(map, d)
  }
  return d
}

/** The edge `from > to`, or null. Pure. */
export function readEdge(g: Pick<GameState, 'world'>, from: EntityRef, to: EntityRef): Readonly<Edge> | null {
  const key = edgeKey(from, to)
  if (key === null) return null
  const map = storedMap(g)
  return hasOwn(map, key) ? map[key]! : null
}

/** Every edge that has `ref` at either end, as frozen [key, edge] pairs sorted by key. Pure. The keys tell the direction: `ref>` starts at it. */
export function edgesOf(g: Pick<GameState, 'world'>, ref: EntityRef): readonly Entry[] {
  if (parseRef(ref) === null) return NONE
  const map = storedMap(g)
  const d = derived(map)
  if (d.index === null) {
    const lists = new Map<string, Entry[]>()
    for (const k of Object.keys(map)) {
      const ends = isSecretKey(k) ? null : splitKey(k)
      if (ends === null) continue
      const entry: Entry = Object.freeze([k, map[k]!] as const)
      for (const end of ends[0] === ends[1] ? [ends[0]] : ends) {
        const list = lists.get(end)
        if (list === undefined) lists.set(end, [entry])
        else list.push(entry)
      }
    }
    const index = new Map<string, readonly Entry[]>()
    for (const [end, list] of lists) index.set(end, Object.freeze(list))
    d.index = index
  }
  return d.index.get(ref) ?? NONE
}

/** How many edges carry a feud rung (1 to 4): at most EDGE_CAPS.feuds. Pure and total on a hostile map. */
export function liveFeuds(g: Pick<GameState, 'world'>): number {
  return derived(storedMap(g)).feuds
}

/** How many edges carry a valid debt: at most EDGE_CAPS.debts. Pure and total on a hostile map. */
export function openDebts(g: Pick<GameState, 'world'>): number {
  return derived(storedMap(g)).debts
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The problems of a stored map
// ---------------------------------------------------------------------------------------------------------------------------------

class Problems {
  readonly list: string[] = []
  private more = 0
  add(text: string): void {
    if (this.list.length < PROBLEMS_MAX) this.list.push(text)
    else this.more++
  }
  done(): string[] {
    if (this.more > 0) this.list.push(`and ${this.more} more problems`)
    return this.list
  }
}

function edgeFaults(label: string, v: unknown, add: (text: string) => void): void {
  if (!isPlain(v)) return add(`${label}: not a plain object`)
  for (const f of Object.keys(v)) if (!EDGE_FIELDS.has(f)) add(`${label}: unknown field ${show(f)}`)
  for (const f of ['t', 'f', 'r', 's'] as const) {
    const x = own(v, f)
    if (!isNum(x) || x < 0 || x > 100) add(`${label}: ${f} must be a number from 0 to 100`)
  }
  const o = own(v, 'o')
  if (!isNum(o) || o < -100 || o > 100) add(`${label}: o must be a number from -100 to 100`)
  for (const f of ['y', 'l'] as const) if (!isYear(own(v, f))) add(`${label}: ${f} must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)

  if (hasOwn(v, 'm')) {
    const m = v.m
    if (!Array.isArray(m)) add(`${label}: m must be a list of memories`)
    else if (m.length === 0) add(`${label}: m is empty (leave it out)`)
    else {
      if (m.length > EDGE_CAPS.memPerEdge) add(`${label}: m has ${m.length} memories (cap ${EDGE_CAPS.memPerEdge})`)
      let last = -Infinity
      let ordered = true
      for (const s of tail(m)) {
        const p = parseMemory(s)
        if (p === null) {
          const head = typeof s === 'string' ? s.split('.') : []
          add(head.length === 4 && !isMemoryKind(head[0]) ? `${label}: m holds an unknown memory kind ${show(head[0])}` : `${label}: m holds a malformed memory ${show(s)}`)
        } else {
          if (p.year < last) ordered = false
          last = p.year
        }
      }
      if (!ordered) add(`${label}: m is out of order (oldest first)`)
    }
  }
  if (hasOwn(v, 'n')) {
    const n = v.n
    if (!Array.isArray(n)) add(`${label}: n must be a list of callback keys`)
    else if (n.length === 0) add(`${label}: n is empty (leave it out)`)
    else {
      if (n.length > TALK_KEYS) add(`${label}: n has ${n.length} entries (cap ${TALK_KEYS})`)
      for (const x of tail(n)) if (typeof x !== 'string' || !TOKEN.test(x)) add(`${label}: n holds a bad entry ${show(x)}`)
    }
  }
  if (hasOwn(v, 'd')) {
    const d = v.d
    if (!Array.isArray(d)) add(`${label}: d must be a list of topic ids`)
    else if (d.length === 0) add(`${label}: d is empty (leave it out)`)
    else {
      if (d.length > TALK_TOPICS) add(`${label}: d has ${d.length} entries (cap ${TALK_TOPICS})`)
      for (const x of tail(d)) if (!isInt(x, 0, TOPIC_MAX)) add(`${label}: d holds a bad entry ${show(x)}`)
    }
  }
  if (hasOwn(v, 'q') && !validQ(v.q)) add(`${label}: q is not a valid feud (rung 1 to ${FEUD_RUNGS}, a year, a cause 0 to ${CAUSE_MAX})`)
  if (hasOwn(v, 'dv') && !validDv(v.dv)) add(`${label}: dv is not a valid debt (owed, rate 0 to ${RATE_MAX}, a year, a kind 0 to ${KIND_MAX}, paid)`)
  if (hasOwn(v, 'c') && !isYear(v.c)) add(`${label}: c must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)
  if (hasOwn(v, 'k') && !isLinkKind(v.k)) add(`${label}: k is not a link kind`)
}

function secretFaults(label: string, v: unknown, add: (text: string) => void): void {
  if (!isPlain(v)) return add(`${label}: not a plain object`)
  for (const f of Object.keys(v)) if (!SECRET_FIELDS.has(f)) add(`${label}: unknown field ${show(f)}`)
  if (parseRef(own(v, 'a')) === null) add(`${label}: a must be a ref`)
  const k = own(v, 'k')
  if (typeof k !== 'string' || !SECRET_KINDS.includes(k)) add(`${label}: k must be "affair" or "debt"`)
  if (!isInt(own(v, 'v'), 1, 5)) add(`${label}: v must be a whole number from 1 to 5`)
  if (!isYear(own(v, 'y'))) add(`${label}: y must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)
  if (hasOwn(v, 'p') && !isYear(v.p)) add(`${label}: p must be a whole year from ${SEEN_MIN} to ${SEEN_MAX}`)
  const h = own(v, 'h')
  if (!Array.isArray(h)) add(`${label}: h must be a list of refs`)
  else {
    if (h.length > EDGE_CAPS.holders) add(`${label}: h has ${h.length} holders (cap ${EDGE_CAPS.holders})`)
    const seen = new Set<unknown>()
    let twice = false
    for (const x of h.slice(0, SCAN_MAX)) {
      if (parseRef(x) === null) add(`${label}: h holds an invalid holder ${show(x)}`)
      else if (seen.has(x)) twice = true
      seen.add(x)
    }
    if (twice) add(`${label}: h names a holder twice`)
  }
}

/**
 * Every fault of a stored `edges` map, named, one line each (at most 60 lines, then one line that counts the rest): the shape of the
 * map, a key that is no edge key or secret key, keys out of order, each edge's fields and ranges, lists that are empty, over their
 * cap, out of order or hold an unknown kind or a malformed text, a feud or debt that is not valid, the secrets, and the caps in all
 * (1,200 edges, 4,000 memories, 12 feuds, 40 debts, `n` and `d` on 120 edges, 40 secrets). With `people` and `ego` it also names an
 * edge `person>ego` of a person who is not a pet whose `f` differs from Person.relationship (the affection invariant: E6b wires the
 * check, E7 makes it true). An absent map (undefined) has no problems. Empty exactly when normalizeEdges gives the map back as itself.
 * Pure and total.
 */
export function edgeProblems(raw: unknown, people?: readonly Person[], ego?: EntityRef): string[] {
  if (raw === undefined) return []
  const problems = new Problems()
  const add = (text: string): void => problems.add(text)
  if (!isPlain(raw)) {
    add('edges is not a plain object')
    return problems.done()
  }
  try {
    let edges = 0
    let secrets = 0
    let memories = 0
    let feuds = 0
    let debts = 0
    let talkers = 0
    let previous: string | null = null
    for (const key of Object.keys(raw)) {
      if (previous !== null && !(previous < key)) add(`key ${show(key)} is out of order (keys ascend by code unit)`)
      previous = key
      const v = raw[key]
      if (isSecretKey(key)) {
        secrets++
        secretFaults(`secret ${key}`, v, add)
      } else if (splitKey(key) !== null) {
        edges++
        edgeFaults(`edge ${brief(key)}`, v, add)
        if (isPlain(v)) {
          const m = own(v, 'm')
          if (Array.isArray(m)) memories += m.length
          if (validQ(own(v, 'q'))) feuds++
          if (validDv(own(v, 'dv'))) debts++
          const n = own(v, 'n')
          const d = own(v, 'd')
          if ((Array.isArray(n) && n.length > 0) || (Array.isArray(d) && d.length > 0)) talkers++
        }
      } else add(`key ${show(key)} is not an edge key or a secret key`)
    }
    if (edges > EDGE_CAPS.edges) add(`${edges} edges (cap ${EDGE_CAPS.edges})`)
    if (memories > EDGE_CAPS.memTotal) add(`${memories} memories in all (cap ${EDGE_CAPS.memTotal})`)
    if (feuds > EDGE_CAPS.feuds) add(`${feuds} feuds (cap ${EDGE_CAPS.feuds})`)
    if (debts > EDGE_CAPS.debts) add(`${debts} debts (cap ${EDGE_CAPS.debts})`)
    if (talkers > EDGE_CAPS.talkEdges) add(`n and d sit on ${talkers} edges (cap ${EDGE_CAPS.talkEdges})`)
    if (secrets > EDGE_CAPS.secrets) add(`${secrets} secrets (cap ${EDGE_CAPS.secrets})`)

    if (Array.isArray(people) && ego !== undefined && parseRef(ego) !== null) {
      for (const p of people.slice(0, PEOPLE_MAX)) {
        if (p === null || typeof p !== 'object' || p.relation === 'pet') continue
        const key = edgeKey(personEntity(p), ego)
        if (key === null || !hasOwn(raw, key)) continue
        const e = raw[key]
        if (!isPlain(e)) continue
        const f = own(e, 'f')
        if (isNum(f) && f !== p.relationship) add(`edge ${key}: affection f is ${f} but the relationship is ${show(p.relationship)}`)
      }
    }
  } catch {
    add('edges could not be read')
  }
  return problems.done()
}
