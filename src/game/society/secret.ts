// Secrets and the leak (R4-E11, D.4, X27, X29, C39): what the people who know something about the player might tell. A secret is a record
// under 'secret:<n>' in the edges map (world/edges.ts holds the shape and the normalizer, world/edge-write.ts putSecret the one writer):
//
//   { a: the ref it is about, k: 'affair' | 'debt', v: severity 1 to 5, h: the holders (6 at most), y: the year it began, p?: the year it leaked }
//
// There are at most 40 (EDGE_CAPS.secrets). A secret is about the current player and no one else in R4 (a record about an earlier player is
// inert: standing and memory do not pass to an heir, X28), and it can be told by any holder who is a living person of the game.
//
//   addSecret(g, about, kind, v, holders)   begins a secret and answers its id, or null when it is refused (see below). It is the writer the
//                      callers use (love.ts reaches it through `betray` of the door, C39); nothing else writes a record.
//   secretsOf(g) / readSecret(g, id)   the records in number order, with their ids; pure, total, hostile records read as none.
//   leakOdds(g, holder)   the odds that a holder tells in a year: 0.02 + 0.10 x resentment + 0.06 x (1 - honesty) + a temper term, where
//                      resentment is the `s` of the edge holder > player over 100, honesty is the honesty axis over 100 (the seam) and the
//                      temper term is 0.04 x the holder's temper over 100 x the resentment over 100: a hot head only spills when there is a
//                      grudge to spill. So the odds run from 0.02 (an honest holder with no grudge: under 3% a year, whatever the temper)
//                      to 0.22. Pure.
//   leakPass(g)        the yearly pass (society/module.ts runs it inside the one `society.acts` entry, after the debts). For each secret that
//                      is about the player, has not leaked and began in an earlier year, each holder in the list order rolls once for the
//                      year (`actRoll(g, 'leak', '<secret id>|<holder ref>')`, the stream `social`); the first holder under their odds who
//                      has someone to tell leaks it. A `debt` secret is moot while the player owes nobody (it reads the record E10b keeps,
//                      debtsOf), and a holder who is dead, a pet or not in the game does not roll.
//
// A leak. The holder tells at most 2 people, each of those at most 1 more, then it stops (society/gossip.ts, hop cap 2). Everyone told gets
// the memory `gossiped_about_me` and a relationship hit of 3 x severity as an offence, through the shim, bounded so that no person loses more
// than LEAK.damageYear (30) points to leaks in one pass whatever the number of secrets. The secret's `p` is set to the year FIRST, so a
// secret leaks at most once, and the hits apply once for each (secret, person): the pass skips a secret whose `p` is set, and the whole
// `society.acts` entry is stamped by `social.ay`, so a second run in the year changes nothing either. The player hears of it from a line
// of LEAK_LINES that names the holder and the first person told, in the life log and, once in PACE.askGap years (the kin family `leak`),
// as the notice `Word Got Around` (a notice, not a choice: it spends no family act, X40). The fact `social.leak` goes on the bus (kernel/bus),
// at most LEAK.factsPerPass a pass, severity 40 to 90; the module declares it, a kind nobody declared is dropped by the bus.
//
// Reputation by group, the timing of a leak beyond this pass and scandal stories are R5's, on storage it adds itself; this file stores
// nothing but the records. It draws no number but the roll of the stream, writes no money and reads no clock.
//
// Part B of R4-E11 adds `betray` (the leaker's own cost, and the secret a found affair begins) to this file.
//
// Layer 3 (society). It imports core, the kernel, the text kit, world/ and society/ itself; no events/, no business/.
import { addRelationship, log, notice } from '../core'
import { emit } from '../kernel/bus'
import { parseRef, type EntityRef } from '../kernel/ids'
import { personEntity, personKey } from '../kernel/person-ref'
import type { RelKind } from '../kernel/relations'
import { askGapOk, notePopup, paceKey } from '../text/pace'
import { pickLine } from '../text/pick'
import { LEAK_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import type { GameState, Person } from '../types'
import { putSecret, remember } from '../world/edge-write'
import { readEdge, readSecrets, type SecretRecord } from '../world/edges'
import { playerRef } from '../world/people'
import { SEEN_MAX, SEEN_MIN } from '../world/rows'
import { socialOn } from '../world/social'
import { actRoll } from './acts'
import { DEBT_KIND, debtsOf } from './debt'
import { my } from './favor'
import { tellings } from './gossip'
import { honestyOf, temperOf } from './seam'

/** A secret, as stored (the shape of world/edges.ts). */
export type Secret = SecretRecord

/** A stored secret with its id ('secret:3') and its number. */
export interface SecretRow {
  id: string
  n: number
  secret: Readonly<Secret>
}

/** The most secrets and holders: the caps of the edge model (EDGE_CAPS.secrets and .holders; a test compares them). Plain numbers, because a module-level read of an import is a hazard of the load order. */
export const SECRET_CAP = 40
export const HOLDER_CAP = 6

/** The numbers of the leak. */
export const LEAK = Object.freeze({
  /** The odds of a holder with no grudge and no scruples missing: 0.02 + 0.10 x resentment + 0.06 x (1 - honesty) + 0.04 x temper x resentment. */
  base: 0.02,
  resentment: 0.1,
  dishonesty: 0.06,
  temper: 0.04,
  /** The ceiling of the odds: all four terms at their most. */
  maxOdds: 0.22,
  /** Relationship points lost for each point of severity, by each person told. */
  hit: 3,
  /** The most relationship points any one person loses to leaks in one pass. */
  damageYear: 30,
  /** The most `social.leak` facts one pass says (Life's own limit is 8 a year as well, X29). */
  factsPerPass: 8,
  /** Years a leaked secret is kept before it can make room for a new one. */
  spentAfter: 10,
})

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)

// ---------------------------------------------------------------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------------------------------------------------------------

/** The secrets of the game in number order, each with its id. Pure and total: a hostile record is not listed. */
export function secretsOf(g: Pick<GameState, 'world'>): readonly SecretRow[] {
  return readSecrets(g).map(([id, secret]) => ({ id, n: Number(id.slice('secret:'.length)), secret }))
}

/** The secret under an id ('secret:3'), or null. Pure. */
export function readSecret(g: Pick<GameState, 'world'>, id: string): Readonly<Secret> | null {
  for (const [key, secret] of readSecrets(g)) if (key === id) return secret
  return null
}

/** The person of the game a ref names, if they are alive and not a pet. */
function holderOf(g: Pick<GameState, 'people'>, ref: string): Person | undefined {
  return g.people.find((p) => p.alive && p.relation !== 'pet' && personEntity(p) === ref)
}

/** The refs of the holders offered: living people of the game, each once, in the order given, 6 at most. */
function holderRefs(g: Pick<GameState, 'people'>, offered: readonly (Person | EntityRef)[]): EntityRef[] {
  const out: EntityRef[] = []
  for (const h of Array.isArray(offered) ? offered : []) {
    if (out.length >= HOLDER_CAP) break
    const ref: EntityRef | null = typeof h === 'string' ? (parseRef(h) === null ? null : (h as EntityRef)) : typeof h === 'object' && h !== null ? personEntity(h) : null
    if (ref === null || out.includes(ref) || holderOf(g, ref) === undefined) continue
    out.push(ref)
  }
  return out
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * A record that can make room: one about someone who is not the player (inert), or one that leaked LEAK.spentAfter years ago or more.
 * The inert ones go first, then the one that leaked longest ago, then by number.
 */
function spentFirst(rows: readonly SecretRow[], ego: EntityRef, year: number): SecretRow[] {
  const spent = rows.filter((r) => r.secret.a !== ego || (r.secret.p !== undefined && year - r.secret.p >= LEAK.spentAfter))
  const rank = (r: SecretRow): number => (r.secret.a !== ego ? -Infinity : r.secret.p!)
  return spent.sort((a, b) => rank(a) - rank(b) || a.n - b.n)
}

/**
 * Begins a secret about the player and answers its id ('secret:<n>', the next number after the largest held), or null when it is refused,
 * with nothing written: a life that is not stamped, an `about` that is not the player, a kind that is not 'affair' or 'debt', a severity that
 * is not a whole number from 1 to 5, no holder who is a living person of the game (6 are kept, each once), the same kind with the same holders
 * begun already this year, or 40 secrets held none of which is spent (see spentFirst: a spent one is dropped to make room).
 */
export function addSecret(g: GameState, about: EntityRef, kind: Secret['k'], severity: number, holders: readonly (Person | EntityRef)[]): string | null {
  if (!socialOn(g)) return null
  const ego = playerRef(g)
  const year = g.year
  if (about !== ego || !isYear(year)) return null
  if (kind !== 'affair' && kind !== 'debt') return null
  if (typeof severity !== 'number' || !Number.isInteger(severity) || severity < 1 || severity > 5) return null
  const h = holderRefs(g, holders)
  if (h.length === 0) return null
  let rows = secretsOf(g)
  if (rows.some((r) => r.secret.k === kind && r.secret.y === year && r.secret.a === ego && sameList(r.secret.h, h))) return null
  if (rows.length >= SECRET_CAP) {
    const victim = spentFirst(rows, ego, year)[0]
    if (victim === undefined || !putSecret(g, victim.id, null)) return null
    rows = rows.filter((r) => r.id !== victim.id)
  }
  const n = rows.reduce((m, r) => Math.max(m, r.n), 0) + 1
  if (n > 999_999_999) return null
  const id = `secret:${n}`
  return putSecret(g, id, { a: about, k: kind, v: severity as Secret['v'], h, y: year }) ? id : null
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The odds
// ---------------------------------------------------------------------------------------------------------------------------------

/** The odds that `holder` tells a secret in a year: 0.02 to 0.22 (see the header). Pure and total. */
export function leakOdds(g: Pick<GameState, 'world' | 'character'>, holder: Person): number {
  const edge = readEdge(g, personEntity(holder), playerRef(g as GameState))
  const grudge = edge === null ? 0 : clamp(num(edge.s, 0), 0, 100) / 100
  const honesty = clamp(num(honestyOf(g, holder), 50), 0, 100) / 100
  const temper = clamp(num(temperOf(g, holder), 50), 0, 100) / 100
  const odds = LEAK.base + LEAK.resentment * grudge + LEAK.dishonesty * (1 - honesty) + LEAK.temper * temper * grudge
  return clamp(odds, LEAK.base, LEAK.maxOdds)
}

/** The severity of the fact a leak says: 1 to 5 mapped onto 40 to 90 (40, 53, 65, 78, 90). A severity that is not a number is the lightest. */
export function leakSeverity(v: number): number {
  const x = clamp(num(v, 1), 1, 5)
  return Math.round(40 + 12.5 * (x - 1))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The leak
// ---------------------------------------------------------------------------------------------------------------------------------

/** A change of a person's regard, through the shim of core.ts (the one caller of it in this file). */
function feel(g: GameState, p: Person, delta: number, kind?: RelKind): void {
  addRelationship(g, p, delta, kind)
}

/** The weight of the memory the people told keep: a light secret 1, a heavy one 2, the heaviest 3. */
const weightOf = (v: number): 1 | 2 | 3 => (v >= 5 ? 3 : v >= 3 ? 2 : 1)

/** Does the player owe anyone a loan? The record E10b keeps (debtsOf), read for a debt secret. */
function owesAnyone(g: GameState): boolean {
  return debtsOf(g, playerRef(g)).some((d) => d.owedBy && d.kind === DEBT_KIND.loan && d.owed >= 1)
}

/**
 * One holder tells one secret. Answers how it went: `leaked` is false, with nothing written, when there is nobody to tell or the record can't
 * be marked; `said` is true when the bus took the fact. The record is marked first (`p`), so whatever happens after it the secret has leaked
 * once and is never told again.
 */
function leak(g: GameState, row: SecretRow, holder: Person, lost: Map<string, number>, sayFact: boolean): { leaked: boolean; said: boolean } {
  const s = row.secret
  const heard = new Set<string>()
  for (const ref of s.h) {
    const p = g.people.find((x) => personEntity(x) === ref)
    if (p !== undefined) heard.add(p.id)
  }
  const told = tellings(g, holder, heard)
  if (told.length === 0 || !putSecret(g, row.id, { ...s, p: g.year })) return { leaked: false, said: false }
  const hit = LEAK.hit * s.v
  for (const t of told) {
    const cut = Math.max(0, Math.min(hit, LEAK.damageYear - (lost.get(t.who.id) ?? 0)))
    if (cut > 0) {
      lost.set(t.who.id, (lost.get(t.who.id) ?? 0) + cut)
      feel(g, t.who, -cut, 'offence')
    }
    remember(g, t.who, 'gossiped_about_me', { w: weightOf(s.v), by: 'them' })
  }
  const line = fillSlots(pickLine(g, LEAK_LINES), { who: my(holder), whom: my(told[0]!.who) })
  log(g, line, 'bad')
  const family = paceKey('kin', 'leak')
  if (askGapOk(g, family)) {
    notePopup(g, family)
    notice(g, 'Word Got Around', line, { emoji: '\u{1F5E3}\u{FE0F}', tone: 'bad' })
  }
  const said = sayFact && emit(g, { k: 'social.leak', y: g.year, c: s.a, a: personKey(holder), v: told.length, s: leakSeverity(s.v) })
  return { leaked: true, said }
}

/**
 * The yearly pass (see the header). Does nothing for a life that is not stamped or a player who is dead. The `society.acts` entry runs it
 * once a year; run twice in a year it changes nothing the second time, because every secret that leaked has its `p` and the rest rolled
 * under the same stream.
 */
export function leakPass(g: GameState): void {
  if (!socialOn(g) || !g.character.alive) return
  const year = g.year
  if (!isYear(year)) return
  const ego = playerRef(g)
  const lost = new Map<string, number>()
  let said = 0
  let owes: boolean | undefined
  for (const row of secretsOf(g)) {
    const s = row.secret
    if (s.p !== undefined || s.a !== ego || !(s.y < year)) continue
    if (s.k === 'debt') {
      owes ??= owesAnyone(g)
      if (!owes) continue
    }
    for (const ref of s.h) {
      const holder = holderOf(g, ref)
      if (holder === undefined) continue
      if (!(actRoll(g, 'leak', `${row.id}|${ref}`)() < leakOdds(g, holder))) continue
      const out = leak(g, row, holder, lost, said < LEAK.factsPerPass)
      if (out.said) said++
      if (out.leaked) break
    }
  }
}

/**
 * The cost of a betrayal (part B of R4-E11 writes this): a pinned memory `betrayal` on the edge `key` and a relationship hit of 20 to 40 by
 * severity. Not written yet. The door (society/contract.ts) already exports it, so that the red tests of part B (test/social-reconcile.test.ts)
 * compile; nothing calls it yet, and part B also makes the leak call it for the holder who told.
 */
export function betray(_g: GameState, _key: string, _severity: number): void {
  // R4-E11 part B
}
