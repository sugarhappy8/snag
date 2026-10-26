// The will model: who can be named, who expects what, how angry being written out makes someone,
// and the shares an estate is split into. Everything here is a pure function of the state or a
// plain-JSON reader/writer (no popups, no randomness), so menus, previews and hints can use it
// freely and the engine can call it when the player dies.
//
// State (plain JSON, so old saves keep loading):
//   g.character.willBeneficiaries   ids of the people named (empty = divide evenly among the
//                                   children). Any nameable relative can be in it now.
//   g.flags['will.state']           WillState: each named person's share (percent of an equal
//                                   share), the charity's share of the estate, the snapshot of who
//                                   was in line at the last check and when the will last changed.
//   Person.data.wl                  Wl: one relative's feelings about the will (anger meter, what
//                                   they know, how it reached them), stamped with the character id
//                                   so an heir starts with a clean slate.
import { clamp, netWorth, relationLabel } from '../core'
import { dataObj } from '../people'
import type { GameState, Json, Person } from '../types'
import { TRAIT_SETS } from '../world/axes'
import { syncLegacy } from '../world/edge-step'
import { memoryOdds } from '../world/edge-odds'
import { socialOn } from '../world/social'
import { entitlement, personCountry, readTies, typicalIncome } from './wealth-core'

// ---------------------------------------------------------------------------
// Roles: who can be named

export type WillRole = 'spouse' | 'child' | 'stepchild' | 'grandchild' | 'parent' | 'sibling' | 'friend'

export const ROLE_ORDER: readonly WillRole[] = ['spouse', 'child', 'stepchild', 'grandchild', 'parent', 'sibling', 'friend']

export const ROLE_TITLES: Record<WillRole, string> = {
  spouse: 'Spouse',
  child: 'Children',
  stepchild: 'Stepchildren',
  grandchild: 'Grandchildren',
  parent: 'Parents',
  sibling: 'Siblings',
  friend: 'Close Friends',
}

/** The id the will uses for the charity share in slices (never a person id). */
export const CHARITY = 'charity'

/** Friends only count as family-of-choice when they are adults you are actually close to. */
export const FRIEND_MIN_CLOSENESS = 25

/** Most rows the will menu shows for one kind of relative (the closest ones). */
export const ROLE_LIMIT = 8

export function willRole(p: Person): WillRole | null {
  switch (p.relation) {
    case 'spouse':
      return 'spouse'
    case 'child':
      return 'child'
    case 'stepchild':
      return 'stepchild'
    case 'grandchild':
      return 'grandchild'
    case 'parent':
    case 'stepparent':
      return 'parent'
    case 'sibling':
    case 'halfSibling':
    case 'stepsibling':
      return 'sibling'
    case 'friend':
    case 'bestFriend':
      return 'friend'
    default:
      return null
  }
}

/** True for a person the will can name right now. */
export function canBeNamed(p: Person): boolean {
  if (!p.alive || p.relation === 'pet' || p.data.disowned === true) return false
  const role = willRole(p)
  if (!role) return false
  if (role === 'friend') return p.age >= 18 && p.relationship >= FRIEND_MIN_CLOSENESS
  return true
}

function orderKey(p: Person): number {
  const role = willRole(p)
  return role ? ROLE_ORDER.indexOf(role) : 99
}

/** Everyone the will can name: spouse, children, stepchildren, grandchildren, parents, siblings, close friends. */
export function willNameable(g: GameState): Person[] {
  return g.people
    .filter(canBeNamed)
    .sort((a, b) => orderKey(a) - orderKey(b) || b.relationship - a.relationship || b.age - a.age)
}

/** The nameable relatives of one kind, closest first, capped for the menu. */
export function nameableBy(g: GameState, role: WillRole): Person[] {
  const list = willNameable(g).filter((p) => willRole(p) === role)
  if (role === 'child' || role === 'stepchild' || role === 'spouse') return list
  return list.sort((a, b) => b.relationship - a.relationship).slice(0, ROLE_LIMIT)
}

/** The legal core of the family the old will menu offered: spouse and children (incl. stepchildren). */
export function willEligible(g: GameState): Person[] {
  const sp = g.people.find((p) => p.alive && p.relation === 'spouse')
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild')).sort((a, b) => b.age - a.age)
  return sp ? [sp, ...kids] : kids
}

export function livingKids(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild'))
}

// ---------------------------------------------------------------------------
// The will itself

export interface WillState {
  /** Percent of an equal share per named person (10-100); a missing id means 100. */
  shares: Record<string, number>
  /** Percent of the estate that goes to charity (0-90). */
  charity: number
  /** Who was in line the last time the will was checked (null = never checked). */
  snap: string[] | null
  /** True once the player has changed the will on purpose. */
  written: boolean
  /** Calendar year of the last change (0 = never). */
  changed: number
  /** How many times the will has been changed. */
  changes: number
}

export const WILL_KEY = 'will.state'

function blankWill(): WillState {
  return { shares: {}, charity: 0, snap: null, written: false, changed: 0, changes: 0 }
}

export function readWill(g: GameState): WillState {
  const raw = g.flags[WILL_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blankWill()
  const shares: Record<string, number> = {}
  const rs = raw.shares
  if (rs && typeof rs === 'object' && !Array.isArray(rs)) {
    for (const [k, v] of Object.entries(rs)) if (typeof v === 'number' && Number.isFinite(v)) shares[k] = clamp(Math.round(v), 10, 100)
  }
  const snap = Array.isArray(raw.snap) ? raw.snap.filter((x): x is string => typeof x === 'string') : null
  return {
    shares,
    charity: typeof raw.charity === 'number' && Number.isFinite(raw.charity) ? clamp(Math.round(raw.charity), 0, 90) : 0,
    snap,
    written: raw.written === true,
    changed: typeof raw.changed === 'number' && Number.isFinite(raw.changed) ? raw.changed : 0,
    changes: typeof raw.changes === 'number' && Number.isFinite(raw.changes) ? Math.max(0, Math.round(raw.changes)) : 0,
  }
}

export function writeWill(g: GameState, w: WillState): void {
  const out: Record<string, Json> = {
    shares: { ...w.shares },
    charity: w.charity,
    snap: w.snap ? [...w.snap] : null,
    written: w.written,
    changed: w.changed,
    changes: w.changes,
  }
  g.flags[WILL_KEY] = out
}

/** The named people who are still around and can still be named (dead or divorced ones drop out). */
export function willHeirs(g: GameState): Person[] {
  const ok = new Map(willNameable(g).map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out: Person[] = []
  for (const id of g.character.willBeneficiaries) {
    const p = ok.get(id)
    if (p && !seen.has(id)) {
      seen.add(id)
      out.push(p)
    }
  }
  return out
}

/** Drop beneficiaries who can't be named any more (reverts to "divide evenly" when empty). */
export function pruneWill(g: GameState): void {
  const ids = new Set(willNameable(g).map((p) => p.id))
  g.character.willBeneficiaries = [...new Set(g.character.willBeneficiaries)].filter((id) => ids.has(id))
  const w = readWill(g)
  let changed = false
  for (const id of Object.keys(w.shares)) {
    if (!g.character.willBeneficiaries.includes(id)) {
      delete w.shares[id]
      changed = true
    }
  }
  if (changed) writeWill(g, w)
}

/** True when the will names people (otherwise it divides evenly among the children). */
export function hasNamedHeirs(g: GameState): boolean {
  return willHeirs(g).length > 0
}

export interface Slice {
  /** A person id, or CHARITY. */
  id: string
  /** Fraction of the estate, 0-1; the slices of a will add up to 1. */
  pct: number
}

/**
 * How the estate is divided: named people take shares weighted by their percent of an equal share,
 * the charity takes its percent off the top, and an empty will divides evenly among the living
 * children. Sums to 1 (or is empty when there is nobody and no charity).
 */
export function willSlices(g: GameState): Slice[] {
  const w = readWill(g)
  const named = willHeirs(g)
  const people = named.length > 0 ? named : livingKids(g)
  const weights = people.map((p) => (named.length > 0 ? w.shares[p.id] ?? 100 : 100))
  const total = weights.reduce((a, b) => a + b, 0)
  let charity = w.charity / 100
  if (people.length === 0 || total <= 0) return charity > 0 ? [{ id: CHARITY, pct: 1 }] : []
  const out: Slice[] = people.map((p, i) => ({ id: p.id, pct: ((1 - charity) * weights[i]) / total }))
  if (charity > 0) out.push({ id: CHARITY, pct: charity })
  return out
}

/** Ids of the people who would inherit right now (not the charity). */
export function inLineIds(g: GameState): string[] {
  return willSlices(g)
    .filter((s) => s.id !== CHARITY && s.pct > 0)
    .map((s) => s.id)
}

export function inLine(g: GameState): Person[] {
  const ids = new Set(inLineIds(g))
  return g.people.filter((p) => ids.has(p.id))
}

export function isInLine(g: GameState, p: Person): boolean {
  return inLineIds(g).includes(p.id)
}

/** A person's fraction of the estate under the current will (0 when out of it). */
export function shareOf(g: GameState, p: Person): number {
  return willSlices(g).find((s) => s.id === p.id)?.pct ?? 0
}

// ---------------------------------------------------------------------------
// One relative's feelings (Person.data.wl)

export type Explained = '' | 'kind' | 'blunt' | 'letter'

export interface Wl {
  /** Character id of the player these feelings are about. */
  by: string
  /** Currently written out by a deliberate change. */
  cut: boolean
  /** Year they were written out. */
  cutY: number
  /** They used to be in line (so being cut out is a betrayal, not just a default). */
  was: boolean
  /** What they were told: 'in' = "you will inherit", 'out' = "you won't". */
  told: '' | 'in' | 'out'
  known: boolean
  /** How they found out: 'told', 'letter', 'leak', 'relative', 'dinner', 'reading', 'external'. */
  how: string
  knownY: number
  explained: Explained
  /** 0-100. */
  anger: number
  peak: number
  /** Hardening from doubling down or stonewalling (0-3). */
  hard: number
  /** The latest escalation they reached (0 none, 1 cold, 2 gossip, 3 confrontation, 4 estranged). */
  stage: number
  cold: boolean
  /** Times they were cut out again after being put back. */
  flips: number
  /** Times they were put back in the will. */
  restores: number
  restoreY: number
  /** Times they were added to the will without having been cut. */
  adds: number
  addY: number
  /** Times money was used to smooth things over. */
  buys: number
  buyY: number
  talkY: number
  confY: number
  threatY: number
  estr: boolean
  estrY: number
}

function blankWl(by: string): Wl {
  return {
    by,
    cut: false,
    cutY: 0,
    was: false,
    told: '',
    known: false,
    how: '',
    knownY: 0,
    explained: '',
    anger: 0,
    peak: 0,
    hard: 0,
    stage: 0,
    cold: false,
    flips: 0,
    restores: 0,
    restoreY: 0,
    adds: 0,
    addY: 0,
    buys: 0,
    buyY: 0,
    talkY: 0,
    confY: 0,
    threatY: 0,
    estr: false,
    estrY: 0,
  }
}

function n0(v: Json | undefined, lo = 0, hi = 1_000_000): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : lo
}

/** This player's record of one relative's feelings about the will (blank for a stranger or an older generation's record). */
export function readWl(g: GameState, p: Person): Wl {
  const by = g.character.id
  const raw = dataObj(p, 'wl')
  if (!raw || raw.by !== by) return blankWl(by)
  const told = raw.told === 'in' || raw.told === 'out' ? raw.told : ''
  const explained: Explained = raw.explained === 'kind' || raw.explained === 'blunt' || raw.explained === 'letter' ? raw.explained : ''
  return {
    by,
    cut: raw.cut === true,
    cutY: n0(raw.cutY),
    was: raw.was === true,
    told,
    known: raw.known === true,
    how: typeof raw.how === 'string' ? raw.how : '',
    knownY: n0(raw.knownY),
    explained,
    anger: n0(raw.anger, 0, 100),
    peak: n0(raw.peak, 0, 100),
    hard: n0(raw.hard, 0, 3),
    stage: n0(raw.stage, 0, 4),
    cold: raw.cold === true,
    flips: n0(raw.flips, 0, 50),
    restores: n0(raw.restores, 0, 50),
    restoreY: n0(raw.restoreY),
    adds: n0(raw.adds, 0, 50),
    addY: n0(raw.addY),
    buys: n0(raw.buys, 0, 50),
    buyY: n0(raw.buyY),
    talkY: n0(raw.talkY),
    confY: n0(raw.confY),
    threatY: n0(raw.threatY),
    estr: raw.estr === true,
    estrY: n0(raw.estrY),
  }
}

export function writeWl(p: Person, w: Wl): void {
  const out: Record<string, Json> = { ...w }
  p.data.wl = out
}

/** Read, change and save one relative's feelings in one go. */
export function updateWl(g: GameState, p: Person, fn: (w: Wl) => void): Wl {
  const w = readWl(g, p)
  fn(w)
  w.anger = clamp(Math.round(w.anger))
  w.peak = Math.max(w.peak, w.anger)
  writeWl(p, w)
  // A stamped life follows the anger into the edge at once (R4-E7, X22); the record stays the authority.
  if (socialOn(g)) syncLegacy(g, p)
  return w
}

export function isEstranged(g: GameState, p: Person): boolean {
  return p.alive && readWl(g, p).estr
}

/** The estranged parent who keeps a grandchild away from the player, if there is one. */
export function keptAwayBy(g: GameState, p: Person): Person | undefined {
  if (!p.alive || p.relation !== 'grandchild') return undefined
  return g.people.find((x) => x.alive && readWl(g, x).estr && (x.id === p.data.parentId || x.id === p.data.childOf || x.id === p.otherParentId))
}

/** Adult children (and stepchildren) who have cut contact with the player. */
export function estrangedKids(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && readWl(g, p).estr)
}

export function angerLabel(a: number): string {
  if (a < 8) return 'Fine'
  if (a < 20) return 'Over it'
  if (a < 35) return 'Hurt'
  if (a < 50) return 'Upset'
  if (a < 70) return 'Angry'
  return 'Furious'
}

// ---------------------------------------------------------------------------
// Personality

// The four trait sets (forgiving, petulant, gossips, discreet) live in world/axes.ts as TRAIT_SETS and are read inside the functions below.

export interface Temper {
  forgiving: number
  petulant: number
}

export function temper(p: Person): Temper {
  let forgiving = 0
  let petulant = 0
  for (const t of p.traits) {
    if (TRAIT_SETS.forgiving.has(t)) forgiving += 1
    if (TRAIT_SETS.petulant.has(t)) petulant += 1
  }
  // A spoiled streak counts once even before the trait pill shows.
  if (entitlement(p) >= 45 && !p.traits.includes('spoiled')) petulant += 1
  return { forgiving, petulant }
}

/** Multiplier on anger: kind and forgiving people shrug it off more, petulant and vengeful ones carry it. */
export function personaMult(p: Person): number {
  const t = temper(p)
  const spoil = Math.max(0, entitlement(p) - 40) * 0.003
  return clamp(1 - 0.22 * t.forgiving + 0.22 * t.petulant + spoil, 0.55, 1.7)
}

export function isGossip(p: Person): boolean {
  return p.traits.some((t) => TRAIT_SETS.gossips.has(t))
}

export function isDiscreet(p: Person): boolean {
  return p.traits.some((t) => TRAIT_SETS.discreet.has(t))
}

// ---------------------------------------------------------------------------
// Expectation and anger

const ROLE_BASE: Record<WillRole, number> = {
  spouse: 0.8,
  child: 0.8,
  stepchild: 0.5,
  grandchild: 0.12,
  parent: 0.34,
  sibling: 0.32,
  friend: 0.04,
}

function relationScale(p: Person): number {
  switch (p.relation) {
    case 'halfSibling':
      return 0.6
    case 'stepsibling':
      return 0.35
    case 'stepparent':
      return 0.4
    case 'bestFriend':
      return 2.5
    default:
      return 1
  }
}

/** How much a person is counting on inheriting from you, 0-100 (role, closeness, history, money needs). Pure. */
export function expectation(g: GameState, p: Person): number {
  const role = willRole(p)
  if (!role) return 0
  const w = readWl(g, p)
  const rel = clamp(p.relationship) / 100
  const years = Math.min(1, 0.5 + p.yearsKnown / 20)
  let base = ROLE_BASE[role] * relationScale(p) * (0.3 + 0.7 * rel) * years
  if (role === 'grandchild' && !g.people.some((x) => x.alive && (x.relation === 'child' || x.relation === 'stepchild') && (x.id === p.data.parentId || x.id === p.data.childOf))) {
    // Orphaned grandchildren stand in for their parent.
    base = Math.max(base, 0.25 * (0.3 + 0.7 * rel))
  }
  if (w.was) base *= 1.25
  if (w.told === 'in') base = Math.max(base * 1.3, 0.75 * (0.5 + 0.5 * rel))
  const typical = typicalIncome(g, personCountry(g, p))
  if (p.age >= 18 && p.money < typical * 0.4) base += 0.08
  const ties = readTies(g, p)
  if (ties.allowance > 0) base += 0.1
  base += (entitlement(p) / 100) * 0.1
  if (p.age < 13) base *= 0.3
  else if (p.age < 18) base *= 0.7
  return clamp(Math.round(base * 100))
}

export function expectationLabel(e: number): string {
  if (e >= 55) return 'counts on a big share'
  if (e >= 30) return 'hopes for a share'
  if (e >= 12) return 'might hope for something'
  return "doesn't expect anything"
}

/** What the estate is worth today (never negative). */
export function estateEstimate(g: GameState): number {
  const n = netWorth(g)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** How much a cut matters at this estate size: a small estate is a small fight, a fortune is a big one. 0.3-1.1. */
export function stakeFactor(g: GameState, p: Person): number {
  const people = Math.max(1, inLineIds(g).filter((id) => id !== p.id).length + 1)
  const ratio = estateEstimate(g) / people / typicalIncome(g, personCountry(g, p))
  return clamp(0.35 + 0.22 * Math.log10(1 + Math.max(0, ratio)), 0.3, 1.1)
}

/** What they would have got (dollars) if they were in line under an equal split. */
export function potentialShare(g: GameState, p: Person): number {
  const people = Math.max(1, inLineIds(g).filter((id) => id !== p.id).length + 1)
  return Math.round(estateEstimate(g) / people)
}

export type Learn = 'kind' | 'blunt' | 'letter' | 'now' | 'leak' | 'relative' | 'dinner' | 'reading' | 'external'

const HOW_MULT: Record<Learn, number> = { kind: 0.55, blunt: 1.15, letter: 0.8, now: 1.1, leak: 1.15, relative: 1.1, dinner: 1.2, reading: 1, external: 1 }

export const HOW_TEXT: Record<Learn, string> = {
  kind: 'you told them yourself',
  blunt: 'you told them bluntly',
  letter: 'your letter',
  now: 'seeing the paperwork',
  leak: 'a leak from your lawyer’s office',
  relative: 'a relative',
  dinner: 'a family dinner',
  reading: 'the reading of the will',
  external: 'the family grapevine',
}

function needMult(g: GameState, p: Person): number {
  if (p.age < 18) return 1
  const typical = typicalIncome(g, personCountry(g, p))
  if (p.money < typical * 0.5) return 1.25
  if (p.money > typical * 25) return 0.7
  return 1
}

/** How angry this relative gets on learning they are out of your will, by how they learn. Pure and deterministic. */
export function angerOnLearning(g: GameState, p: Person, how: Learn): number {
  if (p.age < 13 || !willRole(p)) return 0
  const w = readWl(g, p)
  let how2 = HOW_MULT[how]
  // A letter written in advance softens the reading.
  if (how === 'reading' && w.explained === 'letter') how2 = HOW_MULT.letter
  const betrayal = w.told === 'in' ? 1.4 : w.was ? 1.2 : 0.75
  let a = expectation(g, p) * stakeFactor(g, p) * personaMult(p) * betrayal * (1 + 0.25 * w.restores) * needMult(g, p) * how2
  if (p.age < 18) a *= 0.6
  return clamp(Math.round(a))
}

/** The risk row shown in the will menu: how upset someone would be if they were removed now. */
export function cutRisk(g: GameState, p: Person): { quiet: number; kind: number } {
  return { quiet: angerOnLearning(g, p, 'leak'), kind: angerOnLearning(g, p, 'kind') }
}

/** Yearly change in someone's anger while the matter is unresolved (negative = cooling). Pure. */
export function angerDrift(p: Person, w: Wl, inWill: boolean): number {
  const t = temper(p)
  let d = -(1.2 + t.forgiving * 1.3 - t.petulant * 1.1)
  if (p.relationship >= 60) d -= 1
  else if (p.relationship < 25) d += 1
  if (w.explained === 'kind') d -= 1
  d += w.hard * 1.2
  if (inWill) d -= 4
  if (w.estr) d *= 0.5
  return clamp(Math.round(d * 10) / 10, -6, 4)
}

/** Anger after a share is offered (honest preview for the compromise slider): full restoration cuts it to a quarter. */
export function angerAfterShare(anger: number, sharePct: number): number {
  const f = clamp(sharePct, 0, 100) / 100
  return clamp(Math.round(anger * (1 - 0.75 * Math.pow(f, 0.8))))
}

/** Odds that a heart-to-heart (an honest apology) gets through, 0.05-0.85. Pure. A stamped life adds what the person remembers (world/edge-odds.ts). */
export function peaceOdds(g: GameState, p: Person): number {
  const w = readWl(g, p)
  const t = temper(p)
  const o = 0.22 + 0.1 * t.forgiving - 0.1 * t.petulant + (clamp(p.relationship) / 100) * 0.3 - (w.anger / 100) * 0.3 + (w.explained === 'kind' ? 0.08 : 0) - w.hard * 0.08 - (w.estr ? 0.15 : 0) + memoryOdds(g, p, 'peace')
  return clamp(Math.round(o * 100) / 100, 0.05, 0.85)
}

/** How much a gift of this size soothes (anger points removed), diminishing and worse each time money is tried again. Pure. */
export function giftRelief(g: GameState, p: Person, amount: number): number {
  if (!(amount > 0)) return 0
  const w = readWl(g, p)
  const potential = Math.max(1, potentialShare(g, p) * (expectation(g, p) / 100))
  const t = temper(p)
  const base = 40 * (1 - Math.exp(-amount / (0.35 * potential)))
  const mood = clamp(1 + 0.15 * t.forgiving - 0.2 * t.petulant, 0.5, 1.4)
  return Math.round(base * mood * Math.pow(0.6, w.buys))
}

/** Words for the person's role: "your daughter Dana". */
export function yourWho(p: Person): string {
  return `your ${relationLabel(p).toLowerCase()} ${p.firstName}`
}

/** "my daughter Dana" (log lines are first person). */
export function myWho(p: Person): string {
  return `my ${relationLabel(p).toLowerCase()} ${p.firstName}`
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Years the player has gone without word from someone who is estranged. */
export function estrangedYears(g: GameState, p: Person): number {
  const w = readWl(g, p)
  return w.estr ? Math.max(0, g.year - w.estrY) : 0
}
