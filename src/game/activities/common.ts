// Shared helpers for the Activities menus (activities.ts and activities/*.ts).
// Everything here is either a pure function of state (safe inside menu `children`,
// `subtitle`, `disabledReason`...) or clearly mutates a draft (only call from `run`
// functions and script handlers).
import {
  addHidden,
  addRelationship,
  addStat,
  attractedTo,
  count,
  currentPartner,
  formatMoney,
  log,
  notice,
  spend,
} from '../core'
import { createPerson, notePerson } from '../people'
import { chance, nextRandom, pick, randInt } from '../rng'
import { getCountry, NAME_POOLS, type Country } from '../world'
import type { Condition, ConditionKind, GameState, Gender, Json, Person, RelationKind, Tone } from '../types'

// ---------------------------------------------------------------------------
// Gating

export interface GateOptions {
  minAge?: number
  maxAge?: number
  /** Allowed while in prison (default false). */
  prison?: boolean
  minAgeText?: string
  maxAgeText?: string
}

/** Reason the player can't do something right now, or null. Pure. */
export function gate(g: GameState, o: GateOptions = {}): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer among the living.'
  if (c.prison && !o.prison) return "You can't do that while you're behind bars."
  if (o.minAge !== undefined && c.age < o.minAge) return o.minAgeText ?? `You must be at least ${o.minAge} years old to do that.`
  if (o.maxAge !== undefined && c.age > o.maxAge) return o.maxAgeText ?? "You're too old for that."
  return null
}

/** First non-null reason. */
export function firstReason(...reasons: (string | null | undefined | false)[]): string | null {
  for (const r of reasons) if (r) return r
  return null
}

// ---------------------------------------------------------------------------
// Deterministic "this year's offers" (no RNG mutation, safe in menu builders)

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A private random stream derived from the life, the age and a key. Does not touch g.rng. */
export function stableRng(g: GameState, key: string): () => number {
  let state = hashString(`${g.lifeId}|${g.character.age}|${g.year}|${key}`) | 0
  return () => {
    const [value, next] = nextRandom(state)
    state = next
    return value
  }
}

export function stableInt(g: GameState, key: string, min: number, max: number): number {
  const r = stableRng(g, key)
  return min + Math.floor(r() * (max - min + 1))
}

/** n distinct items, stable for this year of this life. */
export function stablePick<T>(g: GameState, key: string, items: readonly T[], n: number): T[] {
  const r = stableRng(g, key)
  const pool = [...items]
  const out: T[] = []
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(r() * pool.length), 1)[0])
  }
  return out
}

/** A stable random full name for an NPC that doesn't exist yet (surgeons, lawyers...). */
export function stableName(g: GameState, key: string, gender?: Gender): { first: string; last: string; gender: Gender } {
  const r = stableRng(g, `name:${key}`)
  const country = getCountry(g.character.countryId)
  const pool = NAME_POOLS[country.names] ?? NAME_POOLS.anglo
  const gen: Gender = gender ?? (r() < 0.5 ? 'male' : 'female')
  const firsts = gen === 'male' ? pool.male : pool.female
  return { first: firsts[Math.floor(r() * firsts.length)], last: pool.last[Math.floor(r() * pool.last.length)], gender: gen }
}

// ---------------------------------------------------------------------------
// Prices

export function countryOf(g: GameState): Country {
  return getCountry(g.character.countryId)
}

/** Local price level relative to the US. */
export function priceLevel(g: GameState): number {
  const w = countryOf(g).wealth
  return Math.max(0.35, Math.min(1.6, typeof w === 'number' && Number.isFinite(w) ? w : 1))
}

export function niceRound(n: number): number {
  const a = Math.abs(n)
  const step = a < 20 ? 1 : a < 100 ? 5 : a < 1_000 ? 10 : a < 10_000 ? 50 : a < 100_000 ? 500 : a < 1_000_000 ? 1_000 : 10_000
  return Math.max(step === 1 ? 1 : step, Math.round(n / step) * step)
}

/** A US-dollar list price adjusted to the local cost of living, rounded nicely. */
export function localPrice(g: GameState, usd: number): number {
  return niceRound(usd * priceLevel(g))
}

export const money = formatMoney

// ---------------------------------------------------------------------------
// Paying

export function brokeNotice(g: GameState, cost: number, what?: string): void {
  const lines = [
    `You can't afford ${what ?? 'that'}. It costs ${money(cost)} and your bank account just laughed at you.`,
    `${what ? capitalize(what) : 'That'} costs ${money(cost)}. You have ${money(Math.max(0, g.character.money))}. Do the math.`,
    `Your card was declined. You need ${money(cost)} for ${what ?? 'that'}.`,
  ]
  notice(g, 'Insufficient Funds', pick(g, lines), { emoji: '\u{1F4B8}', tone: 'bad' })
}

/** Living parents who can be asked for money (not abroad). */
export function payingParents(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent') && !isAbroad(g, p))
}

export interface Payment {
  by: 'self' | 'parent' | 'free'
  parent?: Person
}

/**
 * Pay for something. Minors' parents pick up the tab when they can (if `parentsPay`), otherwise
 * the player pays. Returns null (and spends nothing) when nobody can pay.
 */
export function payFor(g: GameState, cost: number, parentsPay: boolean): Payment | null {
  if (cost <= 0) return { by: 'free' }
  if (parentsPay && g.character.age < 18) {
    const parent = payingParents(g)
      .filter((p) => p.money >= cost)
      .sort((a, b) => b.relationship - a.relationship)[0]
    if (parent) {
      parent.money = Math.max(0, Math.round(parent.money - cost))
      return { by: 'parent', parent }
    }
  }
  if (spend(g, cost)) return { by: 'self' }
  return null
}

// ---------------------------------------------------------------------------
// Text helpers

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Fill {placeholders} in a template. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Pick a random template and fill it. */
export function say(g: GameState, templates: readonly string[], vars: Record<string, string | number> = {}): string {
  return fill(pick(g, templates), vars)
}

/** Popup for an activity result. At the Full AI level the director may rewrite it (facts preserved). */
export function result(g: GameState, title: string, text: string, emoji: string, tone?: Tone): void {
  notice(g, title, text, { emoji, tone, ai: { when: 'full', facts: text } })
}

/** Log line + popup in one go. */
export function outcome(g: GameState, title: string, emoji: string, popup: string, logLine: string, tone: Tone = 'neutral'): void {
  if (logLine) log(g, logLine, tone)
  result(g, title, popup, emoji, tone === 'neutral' ? undefined : tone)
}

export function stars(n: number, max = 5): string {
  const k = Math.max(0, Math.min(max, Math.round(n)))
  return '★'.repeat(k) + '☆'.repeat(max - k)
}

/** "+3 Health, -2 Happiness" style summary for a few deltas (skips zeros). */
export function deltaSummary(parts: [string, number][]): string {
  return parts
    .filter(([, d]) => d !== 0)
    .map(([k, d]) => `${d > 0 ? '+' : ''}${d} ${k}`)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Conditions

export function findCondition(g: GameState, name: string): Condition | undefined {
  const n = name.toLowerCase()
  return g.character.conditions.find((c) => c.name.toLowerCase() === n)
}

/** Add a condition unless already present. Returns the condition (new or existing). */
export function addCondition(
  g: GameState,
  name: string,
  kind: ConditionKind,
  severity: number,
  opts: { curable?: boolean; diagnosed?: boolean } = {},
): { condition: Condition; isNew: boolean } {
  const existing = findCondition(g, name)
  if (existing) return { condition: existing, isNew: false }
  const c = g.character
  g.nextId += 1
  const condition: Condition = {
    id: `c${g.nextId}`,
    name,
    kind,
    severity: Math.max(1, Math.min(100, Math.round(severity))),
    yearsHad: 0,
    curable: opts.curable ?? true,
    diagnosed: opts.diagnosed ?? (kind === 'injury' || kind === 'addiction'),
    age: c.age,
  }
  c.conditions.push(condition)
  if (kind === 'disease' || kind === 'std') count(g, 'diseases')
  return { condition, isNew: true }
}

export function addictions(g: GameState): Condition[] {
  return g.character.conditions.filter((c) => c.kind === 'addiction')
}

/**
 * Roll for an addiction to `name` (e.g. "Alcoholism", "Cocaine Addiction"). Chance grows with
 * existing addictions and low willpower. Returns true if a new addiction formed (or got worse).
 */
export function rollAddiction(g: GameState, name: string, baseChance: number): boolean {
  const c = g.character
  const existing = findCondition(g, name)
  const others = addictions(g).length
  const will = c.hidden.willpower
  const p = Math.min(0.75, baseChance * (1 + 0.6 * others) * (1.45 - will / 100))
  if (!chance(g, p)) return false
  if (existing) {
    existing.severity = Math.min(100, existing.severity + randInt(g, 4, 10))
    return true
  }
  addCondition(g, name, 'addiction', randInt(g, 15, 30), { curable: true, diagnosed: true })
  return true
}

/** Remove a condition by id. */
export function removeCondition(g: GameState, id: string): void {
  g.character.conditions = g.character.conditions.filter((c) => c.id !== id)
}

// ---------------------------------------------------------------------------
// People

/** Has this person been left behind in another country (see emigrate)? */
export function isAbroad(g: GameState, p: Person): boolean {
  const cid = p.data.countryId
  return typeof cid === 'string' && cid !== g.character.countryId
}

const COMPANION_RELATIONS: RelationKind[] = [
  'spouse',
  'fiance',
  'partner',
  'lover',
  'child',
  'stepchild',
  'parent',
  'stepparent',
  'sibling',
  'halfSibling',
  'stepsibling',
  'grandchild',
  'grandparent',
  'bestFriend',
  'friend',
]

/** People you could take somewhere, closest first. */
export function companionCandidates(g: GameState, opts: { minAge?: number; max?: number; relations?: RelationKind[] } = {}): Person[] {
  const rels = opts.relations ?? COMPANION_RELATIONS
  const order = (p: Person) => rels.indexOf(p.relation)
  return g.people
    .filter((p) => p.alive && rels.includes(p.relation) && p.age >= (opts.minAge ?? 0) && !isAbroad(g, p))
    .sort((a, b) => order(a) - order(b) || b.relationship - a.relationship)
    .slice(0, opts.max ?? 8)
}

/** Is `p` someone the player is related to (family)? */
export function isFamily(p: Person): boolean {
  return [
    'parent',
    'stepparent',
    'sibling',
    'halfSibling',
    'stepsibling',
    'grandparent',
    'child',
    'stepchild',
    'grandchild',
    'spouse',
  ].includes(p.relation)
}

export function strangerGender(g: GameState, romantic: boolean): Gender {
  const c = g.character
  if (romantic) {
    if (c.sexuality === 'bisexual') return chance(g, 0.5) ? 'male' : 'female'
    if (c.sexuality === 'gay') return c.gender
    return c.gender === 'male' ? 'female' : 'male'
  }
  return chance(g, 0.5) ? 'male' : 'female'
}

/** An age for an adult stranger near the player's age. */
export function strangerAge(g: GameState, spread = 5): number {
  const a = g.character.age
  return Math.max(18, a + randInt(g, -spread, spread))
}

/** Can the player plausibly start a romance with a stranger right now? */
export function canRomance(g: GameState): boolean {
  const c = g.character
  return c.alive && !c.prison && c.age >= 18
}

/**
 * Add someone the player just met. Romantic relations fall back to 'friend' when not possible.
 */
export function meetPerson(
  g: GameState,
  relation: RelationKind,
  where: string,
  opts: { gender?: Gender; age?: number; firstName?: string; lastName?: string; relationship?: number } = {},
): Person {
  const c = g.character
  let rel = relation
  const gender = opts.gender ?? strangerGender(g, rel === 'partner' || rel === 'lover')
  const age = opts.age ?? strangerAge(g)
  if ((rel === 'partner' || rel === 'lover') && (!canRomance(g) || !attractedTo(c, gender) || age < 18)) rel = 'friend'
  if (rel === 'partner' && currentPartner(g)) rel = 'lover'
  const p = createPerson(g, {
    relation: rel,
    age,
    gender,
    firstName: opts.firstName,
    lastName: opts.lastName,
    relationship: opts.relationship ?? randInt(g, 50, 75),
    data: { metAt: where },
  })
  notePerson(p, `Met the player at ${where}.`)
  if (rel === 'partner') count(g, 'partners')
  return p
}

// ---------------------------------------------------------------------------
// Grievances (who the player can sue). Other modules may push to g.flags['lawsuit.grievances']
// using the same shape: { id, kind, name, age, strength, personId?, detail? }.

export type GrievanceKind = 'assailant' | 'surgeon' | 'employer' | 'police' | 'coworker' | 'boss' | 'spouse' | 'other'

export interface Grievance {
  id: string
  kind: GrievanceKind
  /** Display name: "Dr. Jane Smith", "Acme Corp", "The bouncer at Club Neon". */
  name: string
  /** Player's age when it happened (statute of limitations). */
  age: number
  /** 0-100: how strong the case is. */
  strength: number
  personId?: string
  /** Short description: "botched your nose job". */
  detail?: string
}

const GRIEVANCE_KEY = 'lawsuit.grievances'

export function grievances(g: GameState): Grievance[] {
  const raw = g.flags[GRIEVANCE_KEY]
  if (!Array.isArray(raw)) return []
  const out: Grievance[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const o = item as Record<string, Json>
    if (typeof o.id !== 'string' || typeof o.name !== 'string') continue
    out.push({
      id: o.id,
      kind: (typeof o.kind === 'string' ? o.kind : 'other') as GrievanceKind,
      name: o.name,
      age: typeof o.age === 'number' ? o.age : g.character.age,
      strength: typeof o.strength === 'number' ? o.strength : 50,
      personId: typeof o.personId === 'string' ? o.personId : undefined,
      detail: typeof o.detail === 'string' ? o.detail : undefined,
    })
  }
  return out
}

export function addGrievance(g: GameState, gr: Omit<Grievance, 'id' | 'age'> & { age?: number }): void {
  const list = grievances(g)
  g.nextId += 1
  const entry: Grievance = { ...gr, id: `gv${g.nextId}`, age: gr.age ?? g.character.age }
  list.push(entry)
  // Keep it bounded: old grievances expire anyway (statute of limitations).
  const trimmed = list.slice(-30)
  g.flags[GRIEVANCE_KEY] = trimmed.map((x) => {
    const o: Record<string, Json> = { id: x.id, kind: x.kind, name: x.name, age: x.age, strength: x.strength }
    if (x.personId) o.personId = x.personId
    if (x.detail) o.detail = x.detail
    return o
  })
}

export function removeGrievance(g: GameState, id: string): void {
  const raw = g.flags[GRIEVANCE_KEY]
  if (!Array.isArray(raw)) return
  g.flags[GRIEVANCE_KEY] = raw.filter((x) => !(x && typeof x === 'object' && !Array.isArray(x) && (x as Record<string, Json>).id === id))
}

// ---------------------------------------------------------------------------
// Typed flag access for this module's own data

export function flagNumber(g: GameState, key: string, fallback = 0): number {
  const v = g.flags[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function flagRecord(g: GameState, key: string): Record<string, Json> {
  const v = g.flags[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {}
}

export function flagStrings(g: GameState, key: string): string[] {
  const v = g.flags[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function pushFlagString(g: GameState, key: string, value: string, max = 200): void {
  const list = flagStrings(g, key)
  if (!list.includes(value)) list.push(value)
  g.flags[key] = list.slice(-max)
}

/** Read a numeric field out of a record flag. */
export function recNumber(rec: Record<string, Json>, key: string, fallback = 0): number {
  const v = rec[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ---------------------------------------------------------------------------
// Small stat helpers

/** Add a random amount in [lo, hi] to a stat, returning the delta actually rolled. */
export function bump(g: GameState, stat: 'happiness' | 'health' | 'smarts' | 'looks', lo: number, hi: number): number {
  const d = randInt(g, lo, hi)
  if (d !== 0) addStat(g, stat, d)
  return d
}

export function bumpHidden(g: GameState, key: 'karma' | 'athleticism' | 'willpower' | 'discipline' | 'religiousness' | 'fame' | 'craziness', lo: number, hi: number): number {
  const d = randInt(g, lo, hi)
  if (d !== 0) addHidden(g, key, d)
  return d
}

export function bumpRelationship(g: GameState, p: Person, lo: number, hi: number): number {
  const d = randInt(g, lo, hi)
  addRelationship(p, d)
  return d
}

/** "your mom Linda", "your friend Max" */
export function whoLabel(p: Person, relation: string): string {
  return `your ${relation.toLowerCase()} ${p.firstName}`
}

export const YEARLY_KEY_PREFIX = 'act.'

/** Uses left this year for a limited action (for subtitles). */
export function usesLeft(g: GameState, key: string, max: number): number {
  return Math.max(0, max - (g.yearActions[key] ?? 0))
}
