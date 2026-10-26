// What a person remembers of the player changes a few odds, a little (R4-E8, D.3, X46): memoryOdds(g, p, group) is the term that three
// existing chances take, and nothing else here moves a number. Pure: it reads the memories of the edge `person > player` and answers a
// number; it never draws, never writes and never creates the world. It answers 0 for a life that is not stamped (X6), for a person with no
// edge and for an edge with no memory, so every v5.2.0 save and every unstamped life plays as it always did.
//
//   group 'repay'   added to repayOdds (events/wealth-core.ts): how likely a debtor is to pay back this year
//   group 'peace'   added to peaceOdds (events/will-core.ts): how likely an honest talk about the will gets through
//   group 'ask'     the weight of an ask (events/wealth.ts, requestCandidates) is multiplied by 1 + this: how likely they are to come to you
//
// MEMORY_ODDS is the table: for each of the 40 kinds and each group, the change in hundredths of a point of probability that one memory
// of that kind at the full weight of 3 makes (a memory of weight 1 or 2 makes a third or two thirds of it). The size of a row is bounded
// twice: no entry is more than 5 hundredths, and whatever the memories of one kind add up to, the kind never moves a group by more than
// 0.05; and the whole term never goes beyond plus or minus 0.15, however many memories are offered. A test prints the table and holds the
// bounds, and an appended kind needs a row in the same commit (the type is Record<MemoryKind, ...>, so the build fails without one).
//
// How to read a row. The edge is `person > player` and says what the person feels about the player, so a positive entry means the
// memory makes this group more likely. Repaying a loan makes the person more likely to repay the next one; a refused ask makes them less
// likely to ask again; a betrayal makes every group less likely. Unlike MEMORY_FX (a frozen table the lead reads), these numbers are
// tuning: a changed entry moves only stamped lives and needs a row in moved-tests.md.
//
// Layer 2: it imports the person key, the memory table, the edge model, the player's ref and the stamp.
import type { EntityRef } from '../kernel/ids'
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { MEMORY_KINDS, isMemoryKind, type MemoryKind } from './edge-memory'
import { memoriesOf, readEdge } from './edges'
import { playerRef } from './people'
import { socialOn } from './social'

export type OddsGroup = 'repay' | 'peace' | 'ask'

/** The three groups, in the column order of the table. */
export const ODDS_GROUPS: readonly OddsGroup[] = Object.freeze(['repay', 'peace', 'ask'] as const)

/** One kind never moves a group by more than this, however many of its memories there are. */
export const KIND_ODDS_MAX = 0.05
/** The whole term never goes beyond plus or minus this. */
export const TOTAL_ODDS_MAX = 0.15

/*
 * The table, one line a kind in the order of MEMORY_KINDS: [repay, peace, ask] in hundredths at weight 3, each from -5 to 5.
 *
 * Money:     a payer, a bailout and a forgiven loan make repaying and making peace likelier; an unpaid loan, a cut allowance and a
 *            refusal make both less likely. A gift or a loan makes the person come back for more (ask up); a refusal, a bound set and
 *            asking too often make them stop.
 * The will:  a cut and an estrangement are the biggest drops for peace; an olive branch, a reconciliation and a restoration are the
 *            biggest rises. Telling someone gently helps, telling them bluntly hurts.
 * Love:      a yes helps everything a little, a no, a break-up and a divorce cost, the divorce the most; a betrayal costs everything.
 * Secrets:   keeping one helps, a leak, a report and an outing cost peace the most.
 * Career:    hiring, promoting, signing, referring and mentoring build the three groups; firing, demoting, passing over, poaching and
 *            beating cost them.
 */
const ROWS = {
  loan_given: [2, 1, 3],
  loan_repaid: [4, 2, 1],
  loan_unpaid: [-5, -3, -2],
  loan_forgiven: [1, 4, 2],
  gift_given: [1, 2, 4],
  gift_refused: [-2, -2, -4],
  allowance_cut: [-3, -3, -3],
  bailed_out: [4, 3, 3],
  asked_too_often: [-1, -1, -3],
  cut_from_will: [-3, -5, -2],
  restored_to_will: [2, 4, 1],
  told_gently: [1, 3, 0],
  told_bluntly: [-1, -3, -1],
  olive_branch: [2, 5, 0],
  took_my_side: [2, 3, 1],
  estranged: [-4, -5, -3],
  reconciled: [3, 5, 1],
  betrayal: [-5, -5, -4],
  proposed_yes: [2, 2, 0],
  proposed_no: [-1, -2, 0],
  broke_up: [-2, -4, -2],
  divorced: [-3, -5, -3],
  stood_by_me: [3, 4, 1],
  saved_me: [5, 5, 2],
  covered_for_me: [3, 3, 1],
  kept_secret: [2, 3, 0],
  leaked_secret: [-3, -5, -2],
  gossiped_about_me: [-2, -4, -1],
  outed_me: [-3, -5, -2],
  reported_me: [-3, -5, -3],
  hired_me: [3, 2, 2],
  fired_me: [-3, -4, -3],
  promoted_me: [3, 2, 2],
  demoted_me: [-2, -3, -2],
  passed_over: [-2, -3, -2],
  poached_me: [-1, -2, -1],
  signed_me: [2, 2, 1],
  referred_me: [2, 2, 1],
  mentored_me: [3, 3, 1],
  beat_me: [-1, -2, 0],
} as const satisfies Record<MemoryKind, readonly [number, number, number]>

function frozenTable(): Readonly<Record<MemoryKind, Readonly<Record<OddsGroup, number>>>> {
  const out = {} as Record<MemoryKind, Readonly<Record<OddsGroup, number>>>
  for (const k of MEMORY_KINDS) {
    const [repay, peace, ask] = ROWS[k]
    out[k] = Object.freeze({ repay, peace, ask })
  }
  return Object.freeze(out)
}

/** The table: for each kind and group, hundredths of a point of probability at the full weight of 3. */
export const MEMORY_ODDS: Readonly<Record<MemoryKind, Readonly<Record<OddsGroup, number>>>> = frozenTable()

/** A memory as the odds read it: a kind and a weight (1 to 3). */
export interface OddsMemory {
  readonly kind: MemoryKind
  readonly w: number
}

/** A weight of a memory is worth this many thirds of the table entry; anything but 1, 2 or 3 is worth nothing. */
const weightUnits = (w: number): number => (w === 1 || w === 2 || w === 3 ? w : 0)

/**
 * The term of a list of memories, for one group. Pure and total: a kind that is not one of the 40 and a weight that is not 1, 2 or 3 are
 * skipped, one kind adds up to at most 0.05 however many of its memories are offered, and the whole is cut to plus or minus 0.15. The list
 * is not limited (an edge keeps 8): the bounds are the proof that 100 memories offered change no more than 8 do.
 */
export function oddsOfMemories(memories: readonly OddsMemory[], group: OddsGroup): number {
  if (!Array.isArray(memories) || !ODDS_GROUPS.includes(group)) return 0
  const col = ODDS_GROUPS.indexOf(group)
  const perKind = new Map<string, number>()
  for (const m of memories) {
    const kind: unknown = m === null || typeof m !== 'object' ? undefined : m.kind
    if (!isMemoryKind(kind)) continue
    const units = ROWS[kind][col]! * weightUnits(m.w)
    if (units !== 0) perKind.set(kind, (perKind.get(kind) ?? 0) + units)
  }
  // thirds of a hundredth: one kind is cut to 15 (0.05), the sum to 45 (0.15)
  let total = 0
  for (const units of perKind.values()) total += Math.max(-15, Math.min(15, units))
  total = Math.max(-45, Math.min(45, total))
  return total / 300
}

/**
 * What the person remembers of the player, as a change to one chance (see the header). Within plus or minus 0.15, and within plus or minus
 * 0.05 for each kind. Pure: no draw, no write, no world made. The game only needs the world and the player's id; every caller has a whole game.
 */
export function memoryOdds(g: Pick<GameState, 'world' | 'character'>, p: Person, group: OddsGroup): number {
  if (!ODDS_GROUPS.includes(group) || !socialOn(g)) return 0
  const from = personEntity(p)
  if (from === 'pool:other') return 0
  const e = readEdge(g, from, playerRef(g as GameState) as EntityRef)
  if (e === null || e.m === undefined) return 0
  return oddsOfMemories(memoriesOf(e), group)
}
