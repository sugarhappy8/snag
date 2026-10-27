// The feud ladder (R4-E12, D.4, X29, X31, X40, X54, C12): what a grudge becomes when nobody stops it. A feud is a rung `q = [rung, since, cause]` on
// the edge person > player, the only thing it saves. Rung 1 is cold, 2 gossip, 3 sabotage, 4 legal. At most 12 are live in the whole map (EDGE_CAPS.feuds);
// Life's strife edges between two relatives carry a rung too (X31, C12) and count toward the 12, but this file only plays the feuds that are the
// player's. The will keeps its own ladder (events/will-feud.ts): a pair whose person is cut out or estranged under the will (favor.ts cutOff, the raw
// record read by world/edge-legacy.ts) belongs to it, and this file neither starts a feud on such a pair nor plays one that is already there.
//
// The yearly step, `stepFeuds`, runs inside the one `society.acts` entry (society/module.ts) after the debts, the leak and the mentor. First the live
// feuds, then the new ones, so a feud that ends frees its slot before a new one asks for it:
//
//   a feud already stepped this year is skipped (the tick, below); a person who has left the game ends the feud quietly; one who died ends it with
//   a line; a pair the will has come to own is handed back to it, quietly. Otherwise:
//   calm      resentment under 25 counts a calm year (0 to 3 in the cause byte), anything else clears it; the second calm year in a row ends the feud:
//             the notice `Feud Cooled` (weight 1, it folds into the log)
//   the rung  1 cold   the person's regard falls 2 more points a year, as a drift (it adds no resentment); the status row `feud.cold` speaks sparingly
//             2 gossip  one leak: the two best-liked contacts of the person and one more through each hear the worst (society/gossip.ts, hop cap 2),
//                       3 points each as an offence and the memory `gossiped_about_me`, no person losing more than 9 in a pass whatever the feuds
//             3 sabotage  at most 3 happiness and 2 job performance a year in all, however many feuds are on this rung, no money
//             4 legal   the suit is decided: a one-off fee through the ledger, then the settlement, below
//   the rise  25% a year while resentment is at least 40 + 10 x the rung (50, 60, 70); the legal rung is the last. A rise into 3 or 4 says the fact and
//             asks the player (`A Falling Out`)
//   new       resentment 45 or more, a betrayal, an unpaid loan or a cut from the will on the edge from the last 5 years, no stamp of a settlement or
//             a peace in the last 5 years (`Edge.c`), fewer than 12 live feuds, a person the will does not own; the chance is 0.10 + (s - 45) / 200 a
//             year, drawn from the stream `social` (id `feud.start|<key>`). The biggest grudges are asked first. A new feud is cold and is not played
//             in the year it starts.
//
// The legal fee is priced by the object and never by the payer's wealth (design P9 and 14.2): 1.5 x a typical income (society/seam.ts, from the P7 leaf)
// for a first suit and 2.5 x once the feud has run 4 years, so never above 3 x, and capped at a quarter of the payer's cash as an affordability guard
// only, and the suits of one year take a quarter of the cash between them (the cash the pass began with). It reads the cash and nothing else about the
// payer: an asset-rich, cash-poor payer pays little, and a balance is never made negative. It is booked
// through cash.moveCash from the player to `pool:legal` under `legal`, once, by the token `feudToken` (the books say what it was, and a replay books
// nothing). The settlement: the person's resentment and the player's, if the player's edge to them is there, fall 30, the feud ends and `Edge.c` is stamped,
// which keeps the pair from a new feud for 5 years.
//
// The cause byte. `q[2]` is a whole number from 0 to 255 and the model keeps nothing else for a feud, so it holds three things (the model reads it as an
// opaque code; nothing outside this file does): bits 0 to 2 the cause (0 none, 1 betrayal, 2 loan_unpaid, 3 cut_from_will), bits 3 and 4 the calm years
// (0 to 3), bits 5 to 7 the tick of the year the feud was last stepped (1 to 7, `1 + year mod 7`; 0 for a feud nobody has stepped). The tick is what makes the
// step idempotent in a year on its own, whatever the stamp of the entry says, and what keeps a feud from being played in the year it began. A rung written
// by another task (Life's strife edges write [1, year, 0]) is a feud with no cause, no calm years and no tick.
//
// The stamp `Edge.c` is the year of the last call-in on the edge. This task also writes it for a peace tried (a try holds the next try off 3 years, the
// cooldown of the favors) and for a settlement or a peace made (it holds a new feud off 5 years). The favors read it the same way, so a settled pair can't
// call in a favor for 3 years, which is the intent.
//
// `A Falling Out` is a choice: make peace (the odds of the Make peace row), hold firm (the grudge grows 5, the person's regard falls 2) or pay it off (a
// settlement at the price of one typical income, a quarter of the cash at most). It is one of the year's three family choices (useFamilyAct 'social') and
// the year's one scene of the will's ladder as well (`will.scene`): it is queued only if both are unspent, and it spends both, so a year has one popup
// across the two ladders. It waits PACE.askGap years in the family `pop.kin.feud` and is not deferrable at the year close.
//
// Make peace. `peaceAct` (id `feud.peace`) is a SocialAct on the edge person > player, the row of society/menu.ts and the answer of the scene. The odds are
// clamp(0.22 + 0.3 x f/100 - 0.3 x s/100 + memoryOdds(peace) + reconcileOdds, 0.05, 0.85) from the pair edge: the shape of the will's `peaceOdds` without
// its temper and will terms (society/ may not import it). A pair the will owns keeps `peaceOdds` through events/will-amends.ts, so the act refuses it.
//
// The fact `social.feud` (X29) goes on the bus when a feud reaches rung 3 or 4 and when it ends: the subject is the player, the other party the person's
// key, `v` the rung (0 for an end), `s` 65, 90 and 40. The module declares it. At most 8 a year. The store keeps one row for a kind, year, subject and
// other party, so a rung and an end of the same person in the same year are one row, the first.
//
// Luck is the stream `social` (actRoll in society/acts.ts): `feud.start|<key>`, `feud.up|<key>` and `feud.peace|<key>`. The lines come from the text kit,
// which has a stream of its own. Nothing here draws from g.rng, reads a clock or writes a raw relationship.
//
// Layer 3 (society). It imports core, the kernel, the text kit, world/ and society/ itself; no events/, no business/.
import { addRelationship, addStat, formatMoney, getPerson, log, notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { emit } from '../kernel/bus'
import type { EntityRef } from '../kernel/ids'
import { personEntity, personKey } from '../kernel/person-ref'
import type { RelKind } from '../kernel/relations'
import { defineScript } from '../scripts'
import { fnv1a } from '../text/hash'
import { askGapOk, notePopup, paceKey } from '../text/pace'
import { pickLine } from '../text/pick'
import { FEUD_COOLED_LINES, FEUD_GONE_LINES, FEUD_GOSSIP_LINES, FEUD_LEGAL_LINES, FEUD_PEACE_LINES, FEUD_SABOTAGE_LINES, FEUD_SETTLED_LINES } from '../text/pools'
import { fillSlots, stateLine } from '../text/state'
import type { GameState, Json, Person } from '../types'
import { EDGE_CAPS } from '../world/caps'
import { memoryOdds } from '../world/edge-odds'
import { putEdge, remember } from '../world/edge-write'
import { edgesOf, liveFeuds, memoriesOf, readEdge, type Edge, type EdgeKey } from '../world/edges'
import { playerRef } from '../world/people'
import { SEEN_MAX, SEEN_MIN } from '../world/rows'
import { socialOn } from '../world/social'
import { actRoll, moveCash, playerEdgeKey, playerPurse, poolPurse, runAct, type ActCtx, type ActPatch, type SocialAct } from './acts'
import { useFamilyAct } from './budget'
import { FAVOR_AGE, FAVOR_COOLDOWN, cutOff, lineFor, my } from './favor'
import { tellings } from './gossip'
import { reconcileOdds } from './reconcile'
import { typicalIncome } from './seam'

/** The numbers of the ladder. The multiples and odds are the planner's and are tested as ranges; the rungs, the 12 and the 5 years are the plan's. */
export const FEUD = Object.freeze({
  /** A feud starts at this resentment or more, with the chance startBase + (s - startFrom) / startSlope a year. */
  startFrom: 45,
  startBase: 0.1,
  startSlope: 200,
  /** The trigger memory must be younger than this, and a settlement or a peace holds the pair off this long. */
  recentYears: 5,
  cooldownYears: 5,
  /** Resentment under this counts a calm year; this many in a row end the feud. */
  calmBelow: 25,
  calmYears: 2,
  /** A rise needs upBase + upPerRung x the rung in resentment, and happens with the chance upChance. */
  upBase: 40,
  upPerRung: 10,
  upChance: 0.25,
  /** Rung 1: points of regard lost a year. */
  coldDrift: 2,
  /** Rung 2: points each person told loses, and the most any person loses to the gossip of one pass. */
  gossipHit: 3,
  gossipYear: 9,
  /** Rung 3: happiness and job performance lost a year. */
  sabotageHappiness: 3,
  sabotageJob: 2,
  /** Rung 4: the fee as a multiple of a typical income (a first suit, a feud that has run longYears), and the share of the cash it can take. */
  feeFirst: 1.5,
  feeLong: 2.5,
  longYears: 4,
  feeCash: 0.25,
  /** The answer "pay it off": a multiple of a typical income (the same cap). */
  payoff: 1,
  /** A settlement lowers resentment by this much, on both sides. */
  settle: 30,
  /** The answer "hold firm": the grudge grows by this much. */
  firm: 5,
  /** A peace made warms the person's regard by this much. */
  peaceWarm: 6,
  /** The numbers of the odds of a peace. */
  peace: Object.freeze({ base: 0.22, f: 0.3, s: 0.3, min: 0.05, max: 0.85 }),
  /** The most facts a year says. */
  factsYear: 8,
})

/** The script id of `A Falling Out`. */
export const FEUD_SCRIPT = 'society.feud'

/** The year-action keys: the will's scene of the year (events/will-feud.ts), and the facts this file has said. */
const WILL_SCENE = 'will.scene'
const FACTS_KEY = 'feud.facts'

/** The memory kinds that start a feud, in the order of their cause codes 1 to 3. */
const TRIGGERS = ['betrayal', 'loan_unpaid', 'cut_from_will'] as const

const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
const isYear = (x: unknown): x is number => isInt(x, SEEN_MIN, SEEN_MAX)
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const cut = (x: number, max: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.trunc(x))) : 0)

// ---------------------------------------------------------------------------------------------------------------------------------
// The cause byte and the feud on an edge
// ---------------------------------------------------------------------------------------------------------------------------------

/** What the cause byte holds. */
export interface Cause {
  /** 0 none, 1 betrayal, 2 loan_unpaid, 3 cut_from_will (4 to 7 are free). */
  code: number
  /** Years in a row under FEUD.calmBelow, 0 to 3. */
  calm: number
  /** The tick of the year the feud was last stepped (1 to 7), or 0 when nobody has. */
  tick: number
}

/** The byte of a cause, calm years and tick; each is cut to its range (3 bits, 2 bits, 3 bits). */
export function packCause(code: number, calm: number, tick: number): number {
  return cut(code, 7) | (cut(calm, 3) << 3) | (cut(tick, 7) << 5)
}

/** The three things in a byte; a value that is not a whole number from 0 to 255 reads as the blank triple. */
export function unpackCause(cause: unknown): Cause {
  const c = isInt(cause, 0, 255) ? cause : 0
  return { code: c & 7, calm: (c >> 3) & 3, tick: (c >> 5) & 7 }
}

/** The tick of a year: 1 to 7, never 0, and different for two years in a row. */
export function tickOf(year: number): number {
  const y = typeof year === 'number' && Number.isFinite(year) ? Math.trunc(year) : 0
  return 1 + (((y % 7) + 7) % 7)
}

/** A feud as the edge holds it. */
export interface Feud extends Cause {
  rung: number
  since: number
  cause: number
}

/** The feud on an edge, or null when it has no valid rung. */
function feudOfEdge(e: Readonly<Edge> | null): Feud | null {
  if (e === null) return null
  const q: unknown = e.q
  if (!Array.isArray(q) || q.length !== 3) return null
  const [rung, since, cause] = q as unknown[]
  if (!isInt(rung, 1, 4) || !isYear(since) || !isInt(cause, 0, 255)) return null
  return { rung, since, cause, ...unpackCause(cause) }
}

/** The feud between the player and a person, on the edge person > player, or null. Pure. */
export function feudOf(g: Pick<GameState, 'world' | 'character'>, p: Pick<Person, 'id' | 'data'>): Feud | null {
  return feudOfEdge(readEdge(g, personEntity(p), playerRef(g as GameState)))
}

/** One live feud of the player: the key of the edge, the edge, the ref of the person and the feud. */
interface Row {
  key: EdgeKey
  edge: Readonly<Edge>
  who: EntityRef
  feud: Feud
}

/** The player's live feuds, in key order: the edges person > player with a valid rung. */
function liveRows(g: GameState, ego: EntityRef): Row[] {
  const suffix = `>${ego}`
  const out: Row[] = []
  for (const [key, edge] of edgesOf(g, ego)) {
    if (!key.endsWith(suffix)) continue
    const feud = feudOfEdge(edge)
    if (feud !== null) out.push({ key, edge, who: key.slice(0, key.length - suffix.length) as EntityRef, feud })
  }
  return out
}

/** The people of the game by their ref. */
function peopleByRef(g: GameState): Map<EntityRef, Person> {
  const m = new Map<EntityRef, Person>()
  for (const p of g.people) if (!m.has(personEntity(p))) m.set(personEntity(p), p)
  return m
}

const present = (p: Person): boolean => p.alive && p.relation !== 'pet'

// ---------------------------------------------------------------------------------------------------------------------------------
// The price
// ---------------------------------------------------------------------------------------------------------------------------------

/** A price held to a quarter of the cash, whole dollars, 0 or more. The cash is the only thing about the payer that is read. */
function affordable(g: Readonly<GameState>, price: number): number {
  const cash = g.character.money
  const room = typeof cash === 'number' && Number.isFinite(cash) && cash > 0 ? Math.floor(FEUD.feeCash * cash) : 0
  return Math.max(0, Math.min(Math.round(price), room))
}

/**
 * The fee of the suit of a feud that began in `since`: 1.5 x a typical income, or 2.5 x once it has run 4 years, held to a quarter of the cash
 * (see the header). A whole number of dollars, 0 or more, and the same for any net worth. Pure.
 */
export function legalFee(g: Readonly<GameState>, since: number): number {
  const years = typeof since === 'number' && Number.isFinite(since) ? g.year - since : 0
  return affordable(g, (years >= FEUD.longYears ? FEUD.feeLong : FEUD.feeFirst) * typicalIncome(g as GameState))
}

/** What "pay it off" costs: one typical income, held to a quarter of the cash. Pure. */
export function payoffFee(g: Readonly<GameState>): number {
  return affordable(g, FEUD.payoff * typicalIncome(g as GameState))
}

/** The ledger token of a payment on a feud: `feud.suit:<year>:<8 hex>` (the suit) or `feud.pay:<year>:<8 hex>` (the settlement), under 40 characters, the year first. */
export function feudToken(year: number, key: string, kind: 'suit' | 'pay'): string {
  const y = Number.isFinite(year) ? Math.min(999_999, Math.max(0, Math.trunc(year))) : 0
  return `feud.${kind}:${y}:${fnv1a(`${kind}|${key}`).toString(16).padStart(8, '0')}`
}

/** Pays `fee` to the lawyers once, through the ledger, and answers what was paid (0 for no fee or a replayed token). */
function payLawyers(g: GameState, fee: number, token: string): number {
  return fee >= 1 ? moveCash(g, playerPurse(g), poolPurse('legal'), fee, 'legal', token) : 0
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Small writers
// ---------------------------------------------------------------------------------------------------------------------------------

/** A change of a person's regard, through the shim of core.ts (the one caller of it in this file). */
function feel(g: GameState, p: Person, delta: number, kind?: RelKind): void {
  addRelationship(g, p, delta, kind)
}

/** Says a fact of the feud (rung 3 or 4, or 0 for an end): at most FEUD.factsYear a year. */
function say(g: GameState, p: Person, rung: number): void {
  if (!useYearAction(g, FACTS_KEY, FEUD.factsYear)) return
  emit(g, { k: 'social.feud', y: g.year, c: playerRef(g), a: personKey(p), v: rung, s: rung >= 4 ? 90 : rung === 3 ? 65 : 40 })
}

/** The player's own edge to a person, if the model holds one. */
function backEdge(g: GameState, p: Person): { key: EdgeKey; edge: Readonly<Edge> } | null {
  const edge = readEdge(g, playerRef(g), personEntity(p))
  return edge === null ? null : { key: `${playerRef(g)}>${personEntity(p)}`, edge }
}

/** Ends the feud on the edge. `stamp` also writes `c`, which holds the pair off a new feud. */
function endFeud(g: GameState, key: EdgeKey, stamp: boolean): void {
  putEdge(g, key, stamp ? { q: undefined, c: g.year } : { q: undefined })
}

/** The settlement: resentment down 30 on both sides, the feud ended, the pair held off a new one for 5 years, and the fact of the end. */
function settle(g: GameState, key: EdgeKey, p: Person): void {
  const e = readEdge(g, personEntity(p), playerRef(g))
  putEdge(g, key, { s: Math.max(0, num(e?.s, 0) - FEUD.settle), q: undefined, c: g.year })
  const back = backEdge(g, p)
  if (back !== null) putEdge(g, back.key, { s: Math.max(0, num(back.edge.s, 0) - FEUD.settle) })
  say(g, p, 0)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The rungs
// ---------------------------------------------------------------------------------------------------------------------------------

/** What one pass has done, shared by all the feuds of the pass: the allowances that hold however many feuds there are. */
interface Pass {
  /** The points each person has lost to gossip so far, by person id. */
  lost: Map<string, number>
  /** Has a feud of this pass already taken the year's happiness and job performance? Sabotage takes them once. */
  sabotaged: boolean
  /** What the suits of the pass may still take: a quarter of the cash the pass began with, less what was paid. */
  legalRoom: number
}

function coldLine(g: GameState, p: Person): void {
  const line = stateLine(g, 'feud.cold', 1, { id: p.id, slots: { who: my(p) } })
  if (line !== null) log(g, line, 'bad')
}

function cold(g: GameState, p: Person): void {
  feel(g, p, -FEUD.coldDrift, 'decay')
  coldLine(g, p)
}

function gossip(g: GameState, p: Person, pass: Pass): void {
  const told = tellings(g, p, new Set())
  if (told.length === 0) return
  for (const t of told) {
    const room = FEUD.gossipYear - (pass.lost.get(t.who.id) ?? 0)
    const hit = Math.max(0, Math.min(FEUD.gossipHit, room))
    if (hit > 0) {
      pass.lost.set(t.who.id, (pass.lost.get(t.who.id) ?? 0) + hit)
      feel(g, t.who, -hit, 'offence')
    }
    remember(g, t.who, 'gossiped_about_me', { w: 1, by: 'them' })
  }
  log(g, fillSlots(pickLine(g, FEUD_GOSSIP_LINES), { who: my(p), whom: my(told[0]!.who) }), 'bad')
}

function sabotage(g: GameState, p: Person, pass: Pass): void {
  if (!pass.sabotaged) {
    pass.sabotaged = true
    addStat(g, 'happiness', -FEUD.sabotageHappiness)
    const job = g.character.job
    if (job && Number.isFinite(job.performance)) job.performance = clamp(job.performance - FEUD.sabotageJob, 0, 100)
  }
  log(g, fillSlots(pickLine(g, FEUD_SABOTAGE_LINES), { who: my(p) }), 'bad')
}

/** The suit is decided: the fee (held to what the pass may still take), the line, the settlement. */
function legal(g: GameState, key: EdgeKey, p: Person, since: number, pass: Pass): void {
  const paid = payLawyers(g, Math.min(legalFee(g, since), pass.legalRoom), feudToken(g.year, key, 'suit'))
  pass.legalRoom = Math.max(0, pass.legalRoom - paid)
  const line = paid >= 1 ? fillSlots(pickLine(g, FEUD_LEGAL_LINES), { who: my(p), money: formatMoney(paid) }) : fillSlots(pickLine(g, FEUD_SETTLED_LINES), { who: my(p) })
  log(g, line, 'bad')
  settle(g, key, p)
}

/** The feud burns out: the notice, the end, the fact. No stamp, because nothing was settled. */
function cooled(g: GameState, key: EdgeKey, p: Person): void {
  endFeud(g, key, false)
  notice(g, 'Feud Cooled', fillSlots(pickLine(g, FEUD_COOLED_LINES), { who: my(p) }), { emoji: '\u{1F54A}\u{FE0F}' })
  say(g, p, 0)
}

/** The person died: the end, a line, the fact. */
function gone(g: GameState, key: EdgeKey, p: Person): void {
  endFeud(g, key, false)
  log(g, fillSlots(pickLine(g, FEUD_GONE_LINES), { who: my(p) }))
  say(g, p, 0)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Asks the player what to do about a feud that has just risen to rung 3 or 4. Only if the family has a choice to spare, the will's scene of the
 * year is unspent and the family has not been asked lately; and then it spends the choice and the scene.
 */
function fallingOut(g: GameState, p: Person, key: EdgeKey, rung: number): void {
  const family = paceKey('kin', 'feud')
  if (!askGapOk(g, family)) return
  if (yearActionsUsed(g, WILL_SCENE) > 0 || !useFamilyAct(g, 'social')) return
  useYearAction(g, WILL_SCENE, 1)
  notePopup(g, family)
  const name = p.firstName
  const text = rung >= 4 ? `${name} has gone to the lawyers. A suit is coming. What will you do?` : `${name} is working against you now, and it's getting worse. What will you do?`
  scriptChoice(
    g,
    FEUD_SCRIPT,
    'A Falling Out',
    text,
    [
      { id: 'peace', label: 'Try to make peace', emoji: '\u{1F54A}\u{FE0F}' },
      { id: 'firm', label: 'Hold firm', emoji: '\u{1F4AA}' },
      { id: 'pay', label: 'Pay it off', emoji: '\u{1F4B5}' },
    ],
    { emoji: '\u{1F4A2}', data: { pid: p.id, key }, personId: p.id },
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Make peace
// ---------------------------------------------------------------------------------------------------------------------------------

/** The odds that a talk ends the feud: see the header. Within 0.05 and 0.85. Pure and total. */
export function peaceOdds(g: Pick<GameState, 'world' | 'character'>, p: Person): number {
  const e = readEdge(g, personEntity(p), playerRef(g as GameState))
  const f = clamp(num(e === null ? p.relationship : e.f, 50), 0, 100)
  const s = clamp(num(e === null ? 0 : e.s, 0), 0, 100)
  const k = FEUD.peace
  return clamp(k.base + (k.f * f) / 100 - (k.s * s) / 100 + memoryOdds(g, p, 'peace') + reconcileOdds(g, p), k.min, k.max)
}

/** Why the talk can't be had now, in words, or null. Pure. */
function peaceBlock(g: Readonly<GameState>, c: ActCtx): string | null {
  const p = c.person
  if (p === null) return 'There is no one to talk to.'
  if (c.key !== playerEdgeKey(g, p)) return 'That is not your edge.'
  if (!g.character.alive) return "You can't make peace now."
  if (!(g.character.age >= FAVOR_AGE)) return "You're too young to make peace."
  const name = p.firstName
  if (!present(p)) return `${name} isn't there to talk to.`
  if (cutOff(g, p)) return `${name} and you have this out through the will.`
  const e = readEdge(g, personEntity(p), playerRef(g as GameState))
  if (feudOfEdge(e) === null) return `You and ${name} aren't feuding.`
  const c0 = e?.c
  if (c0 !== undefined && c0 <= g.year && g.year - c0 < FAVOR_COOLDOWN) return `You tried with ${name} in ${c0}. Give it a few years.`
  return null
}

function planPeace(g: Readonly<GameState>, c: ActCtx): ActPatch {
  const p = c.person!
  const yes = c.roll() < peaceOdds(g, p)
  const u = c.roll()
  const name = p.firstName
  if (yes) {
    return {
      edge: { c: c.year, q: undefined },
      remember: [{ kind: 'reconciled', w: 2 }],
      relationship: [{ delta: FEUD.peaceWarm }],
      log: fillSlots(lineFor(FEUD_PEACE_LINES, u), { who: my(p) }),
      notice: { title: 'Peace Made', text: `${name} heard you out. The feud is over.` },
    }
  }
  return {
    edge: { c: c.year },
    relationship: [{ delta: -1, kind: 'offence' }],
    notice: { title: 'Not Yet', text: `${name} wasn't ready to hear it. Try again in ${FAVOR_COOLDOWN} years.` },
  }
}

/** The talk that ends a feud, or not: a SocialAct on the edge person > player. It stamps the try (`c`), so asking again waits 3 years. */
export const peaceAct: SocialAct = {
  id: 'feud.peace',
  blocked: (g, c) => peaceBlock(g, c),
  plan: (g, c) => planPeace(g, c),
}

/** The player talks to `p` about the feud. The patch, or null when it was blocked. A peace made says the fact of the end. */
export function makePeace(g: GameState, p: Person): ActPatch | null {
  const key = playerEdgeKey(g, p)
  if (key === null) return null
  const out = runAct(g, peaceAct, key, p)
  if (out !== null && feudOf(g, p) === null) say(g, p, 0)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------------------------------------------------------------

/** What the popup is about: the person and the live feud, read again from the state it is answered in. Null when there is none to answer. */
function callOf(g: GameState, data: Json | undefined): { person: Person; key: EdgeKey } | null {
  if (!socialOn(g) || !g.character.alive || data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) return null
  const pid = (data as { pid?: unknown }).pid
  const key = (data as { key?: unknown }).key
  if (typeof pid !== 'string' || typeof key !== 'string') return null
  const person = getPerson(g, pid)
  if (person === undefined || !present(person) || cutOff(g, person)) return null
  if (key !== playerEdgeKey(g, person) || feudOf(g, person) === null) return null
  return { person, key }
}

defineScript(FEUD_SCRIPT, (g, choice, data) => {
  const call = callOf(g, data)
  if (call === null) return
  const { person, key } = call
  const name = person.firstName
  if (choice === 'peace') {
    if (makePeace(g, person) === null) notice(g, 'Not Now', `${name} won't hear it right now.`)
  } else if (choice === 'firm') {
    // the regard cools (a drift: the grudge grows by FEUD.firm and by nothing else)
    feel(g, person, -2, 'decay')
    putEdge(g, key, { s: Math.min(100, num(readEdge(g, personEntity(person), playerRef(g))?.s, 0) + FEUD.firm) })
    notice(g, 'Standing Firm', `You stood your ground with ${name}. It isn't over.`)
  } else if (choice === 'pay') {
    const paid = payLawyers(g, payoffFee(g), feudToken(g.year, key, 'pay'))
    if (paid < 1) {
      feel(g, person, -1, 'offence')
      notice(g, 'Nothing to Offer', `You had nothing to settle with ${name}.`)
      return
    }
    log(g, fillSlots(pickLine(g, FEUD_SETTLED_LINES), { who: my(person) }))
    settle(g, key, person)
    notice(g, 'Settled', `You paid ${formatMoney(paid)} and it's done with ${name}.`)
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The yearly step
// ---------------------------------------------------------------------------------------------------------------------------------

/** One live feud, one year. */
function stepOne(g: GameState, row: Row, people: Map<EntityRef, Person>, year: number, pass: Pass): void {
  const { key, feud } = row
  if (feud.tick === tickOf(year)) return
  const p = people.get(row.who)
  if (p === undefined) return endFeud(g, key, false)
  if (!p.alive) return gone(g, key, p)
  if (p.relation === 'pet' || cutOff(g, p)) return endFeud(g, key, false)

  const s = clamp(num(row.edge.s, 0), 0, 100)
  const calm = s < FEUD.calmBelow ? Math.min(3, feud.calm + 1) : 0
  if (calm >= FEUD.calmYears) return cooled(g, key, p)

  if (feud.rung === 1) cold(g, p)
  else if (feud.rung === 2) gossip(g, p, pass)
  else if (feud.rung === 3) sabotage(g, p, pass)
  else return legal(g, key, p, feud.since, pass)

  let rung = feud.rung
  if (s >= FEUD.upBase + FEUD.upPerRung * rung && actRoll(g, 'feud.up', key)() < FEUD.upChance) rung++
  putEdge(g, key, { q: [rung, feud.since, packCause(feud.code, calm, tickOf(year))] })
  if (rung > feud.rung && rung >= 3) {
    say(g, p, rung)
    fallingOut(g, p, key, rung)
  }
}

/** The code of the newest trigger memory on the edge from the last FEUD.recentYears years (the first of the three on a tie), or 0. A memory dated later is not read. */
function triggerOf(e: Readonly<Edge>, year: number): number {
  let best = 0
  let bestYear = -Infinity
  for (const m of memoriesOf(e)) {
    const code = (TRIGGERS as readonly string[]).indexOf(m.kind) + 1
    if (code === 0 || m.year > year || !(year - m.year < FEUD.recentYears)) continue
    if (m.year > bestYear || (m.year === bestYear && code < best)) {
      best = code
      bestYear = m.year
    }
  }
  return best
}

/** New feuds: the biggest grudges first, while there is a slot. */
function startFeuds(g: GameState, ego: EntityRef, people: Map<EntityRef, Person>, year: number): void {
  const suffix = `>${ego}`
  const asks: { key: EdgeKey; p: Person; s: number; code: number }[] = []
  for (const [key, e] of edgesOf(g, ego)) {
    if (!key.endsWith(suffix) || feudOfEdge(e) !== null) continue
    const p = people.get(key.slice(0, key.length - suffix.length) as EntityRef)
    if (p === undefined || !present(p) || cutOff(g, p)) continue
    const s = clamp(num(e.s, 0), 0, 100)
    if (s < FEUD.startFrom) continue
    if (e.c !== undefined && e.c <= year && year - e.c < FEUD.cooldownYears) continue
    const code = triggerOf(e, year)
    if (code !== 0) asks.push({ key, p, s, code })
  }
  asks.sort((a, b) => b.s - a.s || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (const a of asks) {
    if (liveFeuds(g) >= EDGE_CAPS.feuds) break
    if (!(actRoll(g, 'feud.start', a.key)() < FEUD.startBase + (a.s - FEUD.startFrom) / FEUD.startSlope)) continue
    if (putEdge(g, a.key, { q: [1, year, packCause(a.code, 0, tickOf(year))] })) coldLine(g, a.p)
  }
}

/**
 * The yearly step of the feuds (see the header): the live feuds first, then the new ones. A no-op for a life that is not stamped and for a player who is
 * dead. Idempotent in a year by the tick of each feud, and the new feuds are the same ones in a second call, because every roll is the stream's.
 */
export function stepFeuds(g: GameState): void {
  if (!socialOn(g) || !g.character.alive) return
  const year = g.year
  if (!isYear(year)) return
  const ego = playerRef(g)
  const people = peopleByRef(g)
  const pass: Pass = { lost: new Map(), sabotaged: false, legalRoom: affordable(g, Number.POSITIVE_INFINITY) }
  for (const row of liveRows(g, ego)) stepOne(g, row, people, year, pass)
  startFeuds(g, ego, people, year)
}
