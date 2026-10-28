// The favor family (R4-E10a, D.4; the departures from design 7.6 are in the cross-check, "Design 7 departures in R4"): the first three
// SocialActs. A favor is a CALL-IN on a person who is fond of you and trusts you. The person is the giver, the edge is `giver > player`,
// and the rules are the same for all three acts:
//
//   - the giver is alive, not a pet, not estranged; the player is alive and 16 or older; the edge has f 50 or more and t 40 or more (a
//     person with no edge yet reads as t 50 and f their relationship); and the last call-in on the edge is 3 years back or more
//     (`Edge.c`). A refusal counts as a call-in, so asking again is not a way round the cooldown;
//   - the giver says yes with odds in 0.25 to 0.95: 0.3 + 0.5 x strength + (t - 40) / 300, and a little for honesty and temper (the
//     seam). Strength is min(1, 0.5 + reach / 24), reach being the giver's living family and friends in g.people. There is NO wealth term
//     (the giver's cash is not read) and NO decay of obligation: the cooldown and the reach cap are the bounds (design 7 departure);
//   - a favor done leaves the player owing: `o` of the edge goes down by 20 (the first end owes the second when positive, so negative is
//     the player's debt), never below -100, and stays until something repays it. Nothing in this file gives it back;
//   - the third favor within 6 years, while two are still owed (o at -40 or less, the last call-in 6 years back or less), also writes the
//     memory `asked_too_often` (weight 1). The plan's "asking more than twice in 6 years" is kept as that test: the edge holds one call-in
//     year and the obligation, and no history, so what it can see is "asked again soon, with the earlier ones not yet returned";
//   - a favor refused costs one point of relationship (an offence), done warms it by 2.
//
// The three acts: `helpAct` (the call-in itself; R9's consumers of references, introductions, votes and hires register their own kinds,
// `FavorKind` is an open union), `vouch(third)` (the giver puts in a word with a third person who knows both of you: the third's
// relationship with the player rises by round(15 x strength), 8 to 15) and `broker(relative)` (the giver speaks for the player to a
// relative who is cut out or estranged: the relative's edge toward the player has its obligation raised by 20, at most 100, which E11's
// `reconcileOdds` reads at 0.0015 a point, so a brokered peace adds at most 0.15 to the peace odds; the 20 and the 0.0015 are the
// planner's and are tested as ranges). Two people "know each other" when they share a circle: the family, the friends, or the same
// school or firm (`contextId`); the model has no other acquaintance graph yet.
//
// Everything here is pure except the three `ask` functions at the end, which call runAct. The luck is the act's roll (the stream
// `social`); the log line is chosen with the same roll, because a plan may not touch the text memory.
//
// Layer 3 (society). It imports core (a label), the kernel, world/ (edges, the legacy will reader, the player's ref), the text pools and
// the seam. No events/ (the estranged flag is read from the raw record by world/edge-legacy.ts).
import { relationLabel } from '../core'
import { personEntity } from '../kernel/person-ref'
import { FAVOR_DONE_LINES, FAVOR_REFUSED_LINES, BROKER_LINES, VOUCH_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import type { GameState, Person, RelationKind } from '../types'
import { legacyWl } from '../world/edge-legacy'
import { readEdge } from '../world/edges'
import { playerRef } from '../world/people'
import { playerEdgeKey, runAct, type ActCtx, type ActPatch, type ActSide, type SocialAct } from './acts'
import { honestyOf, temperOf } from './seam'

/** The call-in rules. */
export const FAVOR_MIN_AFFECTION = 50
export const FAVOR_MIN_TRUST = 40
/** Years between two call-ins on one edge. */
export const FAVOR_COOLDOWN = 3
/** The obligation a favor done adds to what the player owes the giver. */
export const FAVOR_OWES = 20
/** The relationship a favor done adds with the giver, and one refused takes. */
export const FAVOR_BOND = 2
/** The player's age at which people can be asked for favors. */
export const FAVOR_AGE = 16
/** A favor asked again within this many years, with two already owed, is asking too often. */
export const STRAIN_YEARS = 6
/** The most a vouch adds to the third person's relationship with the player. */
export const VOUCH_MAX = 15
/** The obligation a brokered peace adds on the relative's edge, its ceiling, and how E11 reads it (hundredths of a point of odds per point). */
export const BROKER_OBLIGATION = 20
export const BROKER_OBLIGATION_MAX = 100
export const BROKER_ODDS_PER_POINT = 0.0015
export const BROKER_ODDS_MAX = 0.15

/** The kinds of favor. Open: a later release adds its consumers (references, introductions, votes, hires; R9, D.8). */
export type FavorKind = 'help' | 'vouch' | 'broker' | (string & Record<never, never>)
const idOf = (kind: FavorKind): string => `favor.${kind}`

// ---------------------------------------------------------------------------------------------------------------------------------
// Who knows whom, reach and strength
// ---------------------------------------------------------------------------------------------------------------------------------

const FAMILY: ReadonlySet<RelationKind> = new Set<RelationKind>([
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
])

/** The circle a person moves in, or null for one who is in none. */
export function circleOf(p: Pick<Person, 'relation' | 'contextId'>): string | null {
  if (FAMILY.has(p.relation)) return 'family'
  if (p.relation === 'friend' || p.relation === 'bestFriend') return 'friends'
  return typeof p.contextId === 'string' && p.contextId !== '' ? `ctx:${p.contextId}` : null
}

/** Do two people know each other: the same circle (the family, the friends, the same school or firm). Never a person and themself. */
export function acquainted(a: Person, b: Person): boolean {
  if (a.id === b.id) return false
  const ca = circleOf(a)
  return ca !== null && ca === circleOf(b)
}

const present = (p: Person): boolean => p.alive && p.relation !== 'pet'

/** How many living people in the game the giver knows (their living family and friends). */
export function reachOf(g: Readonly<GameState>, giver: Person): number {
  let n = 0
  for (const p of g.people) if (present(p) && acquainted(giver, p)) n++
  return n
}

/** min(1, 0.5 + reach / 24): half at no reach, all of it at 12. */
export function strengthOf(g: Readonly<GameState>, giver: Person): number {
  return Math.min(1, 0.5 + reachOf(g, giver) / 24)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The giver's standing, the odds, the reasons
// ---------------------------------------------------------------------------------------------------------------------------------

interface Standing {
  t: number
  f: number
  o: number
  c: number | undefined
}

/** What the giver's edge says; a person with no edge reads as t 50, f their relationship, nothing owed, no call-in. */
function standing(g: Readonly<GameState>, p: Person): Standing {
  const e = readEdge(g, personEntity(p), playerRef(g as GameState))
  return e === null ? { t: 50, f: p.relationship, o: 0, c: undefined } : { t: e.t, f: e.f, o: e.o, c: e.c }
}

/** The odds the giver says yes: 0.25 to 0.95. Pure; it reads the strength, the trust and the giver's axes, and no cash. */
export function favorOdds(g: Readonly<GameState>, giver: Person): number {
  const raw = 0.3 + 0.5 * strengthOf(g, giver) + (standing(g, giver).t - 40) / 300 + (honestyOf(g, giver) - 50) / 500 - (temperOf(g, giver) - 50) / 500
  return Math.min(0.95, Math.max(0.25, raw))
}

/** Is the person estranged under the ego's will record (they are not speaking to the player)? */
export function estranged(g: Readonly<GameState>, p: Person): boolean {
  return legacyWl(p, g.character.id).estr
}

/**
 * Why the giver can't be asked now, in words, or null. The rules of the header, except the key (the acts check it themselves). Pure.
 * Comparisons are written so that a number that is not a number fails them.
 */
export function favorBlock(g: Readonly<GameState>, giver: Person | null): string | null {
  if (giver === null) return 'There is no one to ask.'
  if (!g.character.alive) return "You can't ask anyone for anything now."
  if (!(g.character.age >= FAVOR_AGE)) return "You're too young to call in favors."
  const name = giver.firstName
  if (!present(giver)) return `${name} isn't there to ask.`
  if (estranged(g, giver)) return `${name} isn't speaking to you.`
  const s = standing(g, giver)
  if (!(s.f >= FAVOR_MIN_AFFECTION)) return `${name} isn't close enough to do you a favor.`
  if (!(s.t >= FAVOR_MIN_TRUST)) return `${name} doesn't trust you enough yet.`
  if (s.c !== undefined && g.year - s.c < FAVOR_COOLDOWN) return `You called in a favor with ${name} in ${s.c}. Give it a few years.`
  return null
}

/** The block of the call-in itself: the key is the edge giver > player, and the giver can be asked. */
function giverBlocked(g: Readonly<GameState>, c: ActCtx): string | null {
  if (c.person === null) return 'There is no one to ask.'
  if (c.key !== playerEdgeKey(g, c.person)) return 'That is not your edge.'
  return favorBlock(g, c.person)
}

/** The third person of a vouch can be vouched to: alive, not the giver, not estranged, knows the giver, not yet at 100. */
function thirdBlock(g: Readonly<GameState>, giver: Person, third: Person): string | null {
  const name = third.firstName
  if (third.id === giver.id) return `${giver.firstName} can't put in a word with ${giver.firstName}.`
  if (!present(third)) return `${name} isn't there to speak to.`
  if (playerEdgeKey(g, third) === null || estranged(g, third)) return `${name} isn't speaking to you.`
  if (!acquainted(giver, third)) return `${giver.firstName} doesn't know ${name}.`
  if (!(third.relationship < 100)) return `${name} already thinks the world of you.`
  return null
}

/** The relative of a brokered peace is cut out or estranged, known to the giver, has an edge, and has obligation left to add. */
function relativeBlock(g: Readonly<GameState>, giver: Person, relative: Person): string | null {
  const name = relative.firstName
  if (relative.id === giver.id) return `${giver.firstName} can't speak to ${giver.firstName} for you.`
  if (!present(relative)) return `${name} isn't there to speak to.`
  const w = legacyWl(relative, g.character.id)
  if (!w.cut && !w.estr) return `${name} isn't cut off from you.`
  if (!acquainted(giver, relative)) return `${giver.firstName} doesn't know ${name}.`
  const e = readEdge(g, personEntity(relative), playerRef(g as GameState))
  if (e === null) return `${name} has nothing to say to ${giver.firstName} yet.`
  if (!(e.o < BROKER_OBLIGATION_MAX)) return `${name} has heard all anyone can say for you.`
  return null
}

/** Is the year's strain on: two favors owed (o -40 or less) and the last call-in 6 years back or less. */
function strained(s: Standing, year: number): boolean {
  return s.o <= -2 * FAVOR_OWES && s.c !== undefined && year - s.c <= STRAIN_YEARS
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The plans
// ---------------------------------------------------------------------------------------------------------------------------------

/** "my friend Kay", "my sister Marit": how the log names a person. */
export const my = (p: Person): string => `my ${relationLabel(p).toLowerCase()} ${p.firstName}`

/** A line of a pool by a roll in [0, 1). */
export const lineFor = (lines: readonly string[], u: number): string => lines[Math.min(lines.length - 1, Math.max(0, Math.floor(u * lines.length)))]!

/** What a favor done adds to the patch: its own consequences and its words. */
interface Done {
  relationship?: NonNullable<ActPatch['relationship']>
  also?: readonly ActSide[]
  line: string
  title: string
  text: string
}

/**
 * The shared plan of a call-in. The first value of the roll decides, the second picks the line. A refusal and a favor done both stamp the
 * call-in year; only a favor done owes, and only the call-in on a strained edge writes the memory.
 */
function planFavor(g: Readonly<GameState>, c: ActCtx, done: (strength: number, u: number) => Done): ActPatch {
  const giver = c.person!
  const s = standing(g, giver)
  const yes = c.roll() < favorOdds(g, giver)
  const u = c.roll()
  const base: ActPatch = strained(s, c.year) ? { edge: { c: c.year }, remember: [{ kind: 'asked_too_often', w: 1 }] } : { edge: { c: c.year } }
  if (!yes) {
    return {
      ...base,
      relationship: [{ delta: -1, kind: 'offence' }],
      log: fillSlots(lineFor(FAVOR_REFUSED_LINES, u), { who: my(giver) }),
      notice: { title: 'Turned Down', text: `${giver.firstName} said no this time. You can ask again in ${FAVOR_COOLDOWN} years.` },
    }
  }
  const d = done(strengthOf(g, giver), u)
  return {
    ...base,
    edge: { c: c.year, o: Math.max(-100, s.o - FAVOR_OWES) },
    ...(d.relationship === undefined ? {} : { relationship: d.relationship }),
    ...(d.also === undefined ? {} : { also: d.also }),
    log: d.line,
    notice: { title: d.title, text: d.text },
  }
}

/** The call-in: the giver helps, the bond warms by 2 and the player owes. R9's consumers add kinds that do more. */
export const helpAct: SocialAct = {
  id: idOf('help'),
  blocked: (g, c) => giverBlocked(g, c),
  plan: (g, c) =>
    planFavor(g, c, (_strength, u) => ({
      relationship: [{ delta: FAVOR_BOND }],
      line: fillSlots(lineFor(FAVOR_DONE_LINES, u), { who: my(c.person!) }),
      title: 'A Favor Done',
      text: `${c.person!.firstName} came through for you. Now you owe ${c.person!.firstName} one.`,
    })),
}

/** The giver puts in a word for the player with `third`, who knows both. */
export function vouch(third: Person): SocialAct {
  return {
    id: idOf('vouch'),
    blocked: (g, c) => giverBlocked(g, c) ?? thirdBlock(g, c.person!, third),
    plan: (g, c) =>
      planFavor(g, c, (strength, u) => ({
        also: [{ key: playerEdgeKey(g, third)!, who: third.id, relationship: [{ delta: Math.round(VOUCH_MAX * strength) }] }],
        line: fillSlots(lineFor(VOUCH_LINES, u), { who: my(c.person!), third: my(third) }),
        title: 'A Good Word',
        text: `${c.person!.firstName} spoke up for you with ${third.firstName}. ${third.firstName} thinks better of you.`,
      })),
  }
}

/** The giver speaks for the player to a relative who is cut out or estranged: the relative's obligation toward the player rises by 20. */
export function broker(relative: Person): SocialAct {
  return {
    id: idOf('broker'),
    blocked: (g, c) => giverBlocked(g, c) ?? relativeBlock(g, c.person!, relative),
    plan: (g, c) =>
      planFavor(g, c, (_strength, u) => {
        const o = readEdge(g, personEntity(relative), playerRef(g as GameState))?.o ?? 0
        return {
          also: [{ key: playerEdgeKey(g, relative)!, who: relative.id, edge: { o: Math.min(BROKER_OBLIGATION_MAX, o + BROKER_OBLIGATION) } }],
          line: fillSlots(lineFor(BROKER_LINES, u), { who: my(c.person!), whom: my(relative) }),
          title: 'A Bridge',
          text: `${c.person!.firstName} carried your side to ${relative.firstName}. ${relative.firstName} may hear you out now.`,
        }
      }),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Who to ask
// ---------------------------------------------------------------------------------------------------------------------------------

const byId = (a: Person, b: Person): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The third person a giver would put in a word with: the living acquaintance with the lowest relationship (the most to gain), ties by id,
 * who is not estranged and is not yet at 100. Null when there is none. Pure.
 */
export function thirdFor(g: Readonly<GameState>, giver: Person): Person | null {
  let best: Person | null = null
  for (const p of g.people) {
    if (thirdBlock(g, giver, p) !== null || !Number.isFinite(p.relationship)) continue
    if (best === null || p.relationship < best.relationship || (p.relationship === best.relationship && byId(p, best) < 0)) best = p
  }
  return best
}

/**
 * The giver who would speak for the player to a cut-out relative: a living acquaintance who can be asked now, the most reach first, then
 * the warmest, then by id. Null when the relative can't be brokered or nobody can be asked. Pure.
 */
export function brokerFor(g: Readonly<GameState>, relative: Person): Person | null {
  let best: { p: Person; reach: number } | null = null
  for (const p of g.people) {
    if (p.id === relative.id || !present(p) || favorBlock(g, p) !== null || relativeBlock(g, p, relative) !== null) continue
    const reach = reachOf(g, p)
    if (best === null || reach > best.reach || (reach === best.reach && (p.relationship > best.p.relationship || (p.relationship === best.p.relationship && byId(p, best.p) < 0)))) best = { p, reach }
  }
  return best === null ? null : best.p
}

/** Is a person cut out of the will or estranged, so that a brokered peace could reach them? */
export function cutOff(g: Readonly<GameState>, p: Person): boolean {
  const w = legacyWl(p, g.character.id)
  return w.cut || w.estr
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------------------------------------------------------------

/** The player calls in a favor with `giver`. The patch, or null when it was blocked. */
export function askFavor(g: GameState, giver: Person): ActPatch | null {
  const key = playerEdgeKey(g, giver)
  return key === null ? null : runAct(g, helpAct, key, giver)
}

/** The player has `giver` put in a word with `third`. */
export function askVouch(g: GameState, giver: Person, third: Person): ActPatch | null {
  const key = playerEdgeKey(g, giver)
  return key === null ? null : runAct(g, vouch(third), key, giver)
}

/** The player has `giver` speak for them to `relative`. */
export function askBroker(g: GameState, giver: Person, relative: Person): ActPatch | null {
  const key = playerEdgeKey(g, giver)
  return key === null ? null : runAct(g, broker(relative), key, giver)
}
