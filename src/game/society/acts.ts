// The SocialAct engine (R4-E10a, D.4, X24, X26, C9, C14): a typed act with a pure plan and ONE applier. What people do to each other (a
// favor asked, a word put in, a peace brokered; later a loan, a leak, a falling out) is a `SocialAct`:
//
//   blocked(g, c)   the reason the act can't be run now, in words, or null. Pure.
//   plan(g, c)      the consequence as data, an `ActPatch`: the edge fields to set, memories to make, relationship deltas, money lines, a
//                   log line and a notice. Pure: it reads the state and draws luck only from `c.roll`, the stream `social`.
//   runAct(g, act, key, person)   the applier. The only place an act writes. It books the money lines through cash.moveCash (reason
//                   `support`), writes the edge through putEdge, the memories through `remember`, the relationship deltas through the
//                   shim of core.ts and the log and notice, and answers the patch; it answers null, with nothing written, when the act
//                   is blocked.
//
// Authorization is inside the function (design 14.1, invariant 4): runAct checks the stamp, that the key is an edge of the current ego
// (one end is the player's own ref; an edge between two other people or one of an earlier ego is refused), that the person is the other
// end of the key and is in the game, runs `blocked`, and only then plans and writes. So a caller that bypasses the menu gets nothing the
// menu would not have given. The test of it is table-driven (test/social-act-auth.test.ts); every later act adds its rows.
//
// Order of writing, chosen so that a refusal leaves no trace: the edges first (a new edge may be refused by the cap; if it is, the edges
// made so far are taken back and the answer is null), then the money, the memories, the relationship deltas, the log and the notice.
// A patch may carry `also`: the same shapes for a second edge and person (the third person of a vouch, the cut-out relative of a brokered
// peace); money, log and notice belong to the patch as a whole. `also` is an addition to the frozen shape (cross-check 3.1), optional,
// so a reader of the frozen shape reads every patch.
//
// Luck: `actRoll(g, act, key, year)` is outcomeStream(g, 'social', year, '<act>|<key>'), the one place society/ draws, so a Time Machine
// jump re-rolls the year it lands in and no draw touches g.rng. It does not look at the stamp (the stream test drives it on lives that
// are not stamped). A patch is a pure function of the state and that stream.
//
// Layer 3 (society). It imports core, cash, the kernel and the edge model and writer of world/. No events/, no business/.
import { moveCash, personPurse, playerPurse, type Purse } from '../cash'
import { addRelationship, getPerson, log, notice } from '../core'
import type { EntityRef } from '../kernel/ids'
import { personEntity } from '../kernel/person-ref'
import type { RelKind } from '../kernel/relations'
import { outcomeStream } from '../kernel/streams'
import type { GameState, Person } from '../types'
import type { MemoryKind } from '../world/edge-memory'
import { putEdge, remember } from '../world/edge-write'
import { edgeKey, readEdge, type Edge, type EdgeKey } from '../world/edges'
import { playerRef } from '../world/people'
import { socialOn } from '../world/social'

// The purses of society/ (R4-E10b, X26): this is the one file of society/ that imports cash.ts, because the layer baseline counts the files
// of a domain that reach another (`society->life` is 2: this file and the seam). A debt (society/debt.ts) takes the purses from here.
export { moveCash, personPurse, playerPurse }
export type { Purse }

/** What an act is run with: the game (read only), the edge it is run on, the person at its other end, the year and the luck of the stream. */
export interface ActCtx {
  g: Readonly<GameState>
  key: EdgeKey
  person: Person | null
  year: number
  /** outcomeStream(g, 'social', year, '<act>|<key>'): values in [0, 1), the same sequence for the same state and act. */
  roll: () => number
}

/** A dollar line: booked as `support` through cash.moveCash, once per token (a replay books nothing). */
export interface MoneyLine {
  from: 'player' | Person
  to: 'player' | Person
  amount: number
  token: string
}

/** The shapes an act can write on one edge and the person at its other end. */
export interface ActPart {
  /** Fields of the edge to set; `undefined` clears an optional one. A required field of an edge that does not exist is filled with the defaults first. */
  edge?: Partial<Edge>
  remember?: { kind: MemoryKind; w?: 1 | 2 | 3 }[]
  /** Deltas to the person's relationship with the player, through the shim (addRelationship). */
  relationship?: { delta: number; kind?: RelKind }[]
}

/** A second edge and person a patch writes: the key of the edge, the id of the person of the game at its other end, and what to write. */
export interface ActSide extends ActPart {
  key: EdgeKey
  who: string
}

/** What an act does. The fields after `relationship` are the patch's own, written once. */
export interface ActPatch extends ActPart {
  money?: MoneyLine[]
  log?: string
  notice?: { title: string; text: string }
  /** Further edges and people the act touches. Not part of the frozen 3.1 shape: an optional addition. */
  also?: readonly ActSide[]
}

export interface SocialAct {
  id: string
  /** Why the act can't run now (a sentence for the player), or null. Pure. */
  blocked(g: Readonly<GameState>, c: ActCtx): string | null
  /** The consequence. Pure. Called only when blocked said null. */
  plan(g: Readonly<GameState>, c: ActCtx): ActPatch
}

/** An edge key is 140 characters at most. */
const KEY_MAX = 140

/** The ends of an edge key, or null when it is not one (edgeKey is the grammar: both ends parse and the key is exactly `from>to`). */
export function endsOfKey(key: unknown): readonly [EntityRef, EntityRef] | null {
  if (typeof key !== 'string' || key.length > KEY_MAX) return null
  const at = key.indexOf('>')
  if (at < 1 || key.indexOf('>', at + 1) >= 0) return null
  const from = key.slice(0, at) as EntityRef
  const to = key.slice(at + 1) as EntityRef
  return edgeKey(from, to) === key ? [from, to] : null
}

/** The key of the edge `person > player`, or null for a person with no ref. */
export function playerEdgeKey(g: Pick<GameState, 'character'>, p: Pick<Person, 'id' | 'data'>): EdgeKey | null {
  return edgeKey(personEntity(p), playerRef(g as GameState))
}

/**
 * The luck of an act: the stream `social` for the year, the act's id and the edge key. The one place society/ draws a number. A
 * Time Machine jump re-rolls the year it lands in (outcomeStream) and no draw touches g.rng, g.nextId or a flag.
 */
export function actRoll(g: Pick<GameState, 'lifeId' | 'flags' | 'year'>, act: string, key: string, year: number = g.year): () => number {
  return outcomeStream(g, 'social', year, `${act}|${key}`)
}

/** The ego's end of a key and the other end, or null when neither end is the current ego. */
function egoSplit(g: Pick<GameState, 'character'>, key: EdgeKey): { other: EntityRef; ego: EntityRef } | null {
  const ends = endsOfKey(key)
  if (ends === null) return null
  const ego = playerRef(g as GameState)
  if (ends[0] === ends[1]) return null
  if (ends[0] === ego) return { other: ends[1], ego }
  if (ends[1] === ego) return { other: ends[0], ego }
  return null
}

/** The context an act is run with. */
function ctxOf(g: GameState, id: string, key: EdgeKey, person: Person | null): ActCtx {
  return { g, key, person, year: g.year, roll: actRoll(g, id, key) }
}

/**
 * The person of the game that `person` stands for when it is given: the live one, which must be the other end of the key. Null when the
 * person is not in the game or is not that end; `undefined` when no person was given.
 */
function liveOf(g: GameState, other: EntityRef, person: Person | null): Person | null | undefined {
  if (person === null) return undefined
  const live = getPerson(g, person.id)
  if (live === undefined || personEntity(live) !== other) return null
  return live
}

/**
 * The reasons an act can't run, or null: the stamp, the key, the person and the act's own `blocked`. Pure. It is the first half of
 * runAct, for a menu row that wants to grey itself out with the same words (the viability of a new edge is the one thing it can't see).
 */
export function actBlock(g: Readonly<GameState>, act: SocialAct, key: EdgeKey, person: Person | null): string | null {
  if (!socialOn(g)) return 'Not now.'
  const split = egoSplit(g, key)
  if (split === null) return 'That is not your edge.'
  const live = liveOf(g as GameState, split.other, person)
  if (live === null) return 'That is not the person.'
  return act.blocked(g, ctxOf(g as GameState, act.id, key, live ?? null))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------------------------

const clampRel = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50)

/** An edge that does not exist yet, as `remember` would make it: t 50, r 50, s 0, o 0, this year, and f the relationship when it points at the player. */
function blankEdge(g: GameState, key: EdgeKey, person: Person | undefined): Edge {
  const ends = endsOfKey(key)
  const f = person !== undefined && ends !== null && ends[1] === playerRef(g) ? clampRel(person.relationship) : 50
  return { t: 50, f, r: 50, s: 0, o: 0, y: g.year, l: g.year }
}

interface Write {
  key: EdgeKey
  person: Person | undefined
  part: ActPart
}

/** The edge writes of a patch, in two phases: the edges that are not there yet (they may be refused), then the ones that are. False, with nothing changed, if a new edge is refused. */
function writeEdges(g: GameState, writes: readonly Write[]): boolean {
  const made: EdgeKey[] = []
  for (const w of writes) {
    if (w.part.edge === undefined) continue
    const ends = endsOfKey(w.key)!
    if (readEdge(g, ends[0], ends[1]) !== null) continue
    if (!putEdge(g, w.key, { ...blankEdge(g, w.key, w.person), ...w.part.edge })) {
      for (const k of made) putEdge(g, k, null)
      return false
    }
    made.push(w.key)
  }
  for (const w of writes) {
    if (w.part.edge === undefined || made.includes(w.key)) continue
    const ends = endsOfKey(w.key)!
    const old = readEdge(g, ends[0], ends[1])
    putEdge(g, w.key, { l: Math.max(old?.l ?? g.year, g.year), ...w.part.edge })
  }
  return true
}

/** The memories and the relationship deltas of one part. */
function writeEffects(g: GameState, w: Write): void {
  const ends = endsOfKey(w.key)!
  for (const m of w.part.remember ?? []) remember(g, ends[0], m.kind, { w: m.w, with: ends[1] })
  if (w.person !== undefined) for (const d of w.part.relationship ?? []) addRelationship(g, w.person, d.delta, d.kind)
}

function purseOf(g: GameState, side: 'player' | Person): Purse | null {
  if (side === 'player') return playerPurse(g)
  const live = getPerson(g, side.id)
  return live === undefined ? null : personPurse(live)
}

/**
 * Runs an act: answers the patch it applied, or null when it is blocked or can't be written (and then nothing was written, not a byte,
 * not a draw of g.rng, not an id). See the header for the checks. `person` is the person at the other end of `key`, or null for an act
 * that is not about one.
 */
export function runAct(g: GameState, act: SocialAct, key: EdgeKey, person: Person | null): ActPatch | null {
  if (actBlock(g, act, key, person) !== null) return null
  const split = egoSplit(g, key)!
  const live = liveOf(g, split.other, person) ?? undefined
  const patch = act.plan(g, ctxOf(g, act.id, key, live ?? null))

  const writes: Write[] = [{ key, person: live, part: patch }]
  for (const side of patch.also ?? []) {
    const sideSplit = egoSplit(g, side.key)
    const who = getPerson(g, side.who)
    if (sideSplit === null || who === undefined || personEntity(who) !== sideSplit.other) return null
    writes.push({ key: side.key, person: who, part: side })
  }

  if (!writeEdges(g, writes)) return null
  for (const line of patch.money ?? []) {
    const from = purseOf(g, line.from)
    const to = purseOf(g, line.to)
    if (from !== null && to !== null) moveCash(g, from, to, line.amount, 'support', line.token)
  }
  for (const w of writes) writeEffects(g, w)
  if (patch.log !== undefined) log(g, patch.log)
  if (patch.notice !== undefined) notice(g, patch.notice.title, patch.notice.text)
  return patch
}
