// Mentorship (R4-E11 part B, D.4, X27): a younger relative or coworker of 14 to 40 learns a little faster with the player around. The
// player takes up to 3 of them under their wing; each year the protege's own skill gain is topped up by at most 15% of that gain.
//
//   mentorAct          the SocialAct of the enrolment (id `mentor.enrol`), run on the edge person > player. It is blocked for a life that is not
//                      stamped, a player who is dead or under 16, a protege who is dead, a pet, estranged, not in the game, not a younger
//                      sibling, half or step sibling, child, step child, grandchild or coworker, under 14, over 40, not younger than the player,
//                      with no life of their own to measure (npcLife), already enrolled, or a fourth (3 at most). It writes the memory
//                      `mentored_me` on the edge (the protege owes the player a little and respects them more), a log line and a notice.
//   enrolMentor(g, p)  runs the act through runAct and, when it was done, writes the baseline pair [ref, skill] with patchSocial. The act is
//                      the authorization (runAct checks the stamp, the key and the person, then `blocked`); the baseline is the enrolment.
//   protegesOf(g)      the pairs of the baseline in the `social` shard (`ms`), through the shard's normalizer: three at most, each person once,
//                      a skill held between 0 and 100. A baseline that is missing or hostile reads as none. Pure.
//   mentorSettle(g)    the settle at `close` 6, inside the one `society.acts` entry (society/module.ts, after the leak pass): for each protege
//                      it takes the gain of the NPC year since the baseline, adds the bonus (0.15 x the gain, never negative, never past a
//                      skill of 100) through npcLife and saveNpcLife, and writes the new baseline with patchSocial. A protege who is no
//                      longer one (dead, a pet, estranged, gone from the game, over 40, no life) leaves the baseline and gets nothing.
//
// The year of a protege is lived by the NPC engine (npc-lives.ts, inside `relationships` at life 40, before the close phase), which this file
// does not touch: the settle is applied around it, against the baseline of the last settle, so the gain it measures is the year's own. There
// is no second aging entry and nothing in the `society` phase (test/kernel-aging.test.ts pins that phase empty in front of the life hooks, and
// a second yearly entry in one module would be renamed `society.acts#0` and `#1`, which the group tables do not list).
//
// Why it can't run away: the bonus is 0.15 of the year's gain and the baseline is rewritten to the skill WITH the bonus, so the next year's
// gain is the next year's own again and the bonus is never taken on a bonus. Over any run of years a mentored protege is at most 1.15 x
// the unmentored gain ahead of the control (a probe in test/social-mentor.test.ts), and the skill stays at 100 or under. A year with no gain or
// a fall adds nothing, and the baseline follows the skill down. Settling twice in one state adds nothing the second time (the gain is 0).
//
// It draws no number (no g.rng, no stream), books no money and reads no clock. The menu row is in society/menu.ts.
//
// Layer 3 (society). It reaches a person's NPC life through the seam (society/seam.ts: the one file of society/ that imports npc-state.ts, so
// the layer baseline for `society->life` stays at two) and the shard writers of world/.
import { getPerson } from '../core'
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person, RelationKind } from '../types'
import { patchSocial, readSocial, socialOn, SOCIAL_MS_MAX, type MentorPair } from '../world/social'
import { playerEdgeKey, runAct, type SocialAct } from './acts'
import { FAVOR_AGE, estranged, my } from './favor'
import { npcLife, saveNpcLife } from './seam'

/** The numbers of the mentorship. */
export const MENTOR = Object.freeze({ proteges: 3, bonus: 0.15, ageMin: 14, ageMax: 40 })

/** The people a player can take under their wing: the younger kin (siblings, children, grandchildren) and coworkers. */
const KIND: ReadonlySet<RelationKind> = new Set<RelationKind>(['sibling', 'halfSibling', 'stepsibling', 'child', 'stepchild', 'grandchild', 'coworker'])

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const clampSkill = (x: number): number => (x < 0 ? 0 : x > 100 ? 100 : x)

// ---------------------------------------------------------------------------------------------------------------------------------
// The baseline
// ---------------------------------------------------------------------------------------------------------------------------------

/** The pairs of the baseline ([person ref, skill] each, three at most), as the shard's reader gives them. Pure and total. */
export function protegesOf(g: Pick<GameState, 'world'>): readonly MentorPair[] {
  return readSocial(g)?.ms ?? []
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Who can be taught
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Why this person is not a protege now, in words, or null: the rules that hold the whole time a person is one (the settle drops a pair that
 * fails them). Comparisons are written so that a number that is not a number fails them. Pure.
 */
export function protegeBlock(g: Readonly<GameState>, p: Person): string | null {
  if (!g.character.alive) return "You can't teach anyone now."
  if (!(g.character.age >= FAVOR_AGE)) return "You're too young to take anyone under your wing."
  const name = p.firstName
  if (!p.alive || p.relation === 'pet') return `${name} isn't around.`
  if (!KIND.has(p.relation)) return `${name} isn't a younger relative or a coworker.`
  if (estranged(g, p)) return `${name} isn't speaking to you.`
  if (!(p.age >= MENTOR.ageMin)) return `${name} is too young to learn a trade from you.`
  if (!(p.age <= MENTOR.ageMax)) return `${name} has a career of their own by now.`
  if (!(p.age < g.character.age)) return `${name} isn't younger than you.`
  if (npcLife(p) === null) return `${name} has no work of their own to learn from yet.`
  return null
}

/** Is this person on the baseline now? Pure. */
export function isProtege(g: Pick<GameState, 'world'>, p: Person): boolean {
  const ref = personEntity(p)
  return protegesOf(g).some((pair) => pair[0] === ref)
}

/** The block of the enrolment: the person is the other end of the edge person > player, can be taught, is not enrolled and there is room. */
function enrolBlock(g: Readonly<GameState>, key: string, p: Person | null): string | null {
  if (p === null) return 'There is no one to teach.'
  if (key !== playerEdgeKey(g, p)) return 'That is not your edge.'
  const why = protegeBlock(g, p)
  if (why !== null) return why
  if (isProtege(g, p)) return `${p.firstName} is learning from you already.`
  if (protegesOf(g).length >= MENTOR.proteges) return `You can only look after ${MENTOR.proteges} at a time.`
  return null
}

/** The enrolment, as a SocialAct. The edge is person > player, the person is the protege. */
export const mentorAct: SocialAct = {
  id: 'mentor.enrol',
  blocked: (g, c) => enrolBlock(g, c.key, c.person),
  plan: (_g, c) => {
    const p = c.person!
    return {
      remember: [{ kind: 'mentored_me', w: 1 }],
      log: `I took ${my(p)} under my wing.`,
      notice: { title: 'Under Your Wing', text: `${p.firstName} will learn a little faster with you around. Every year it adds up.` },
    }
  },
}

/** The skill a person has now, or null when they have no life of their own to measure. */
function skillOf(p: Person): number | null {
  const life = npcLife(p)
  return life === null || !finite(life.skill) ? null : clampSkill(life.skill)
}

/**
 * Takes `p` under the player's wing: runs the act, and when it was done writes the baseline pair [ref, skill] (the skill they have now).
 * True when the person was taken on. Nothing is written when the act is blocked.
 */
export function enrolMentor(g: GameState, p: Person): boolean {
  const live = getPerson(g, p.id)
  if (live === undefined) return false
  const key = playerEdgeKey(g, live)
  if (key === null || runAct(g, mentorAct, key, live) === null) return false
  const skill = skillOf(live)
  if (skill === null) return false
  const pairs: MentorPair[] = [...protegesOf(g)]
  pairs.push([personEntity(live), skill])
  return patchSocial(g, { ms: pairs.slice(0, SOCIAL_MS_MAX) })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The settle
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * The yearly settle (see the header). Does nothing for a life that is not stamped or a player who is dead. For each pair of the baseline:
 * a person who is no longer a protege leaves it; otherwise the gain since the baseline gets its 15% (never negative, never past 100) and
 * the pair is rewritten to the skill the protege has now. Run twice in one state it changes nothing the second time.
 */
export function mentorSettle(g: GameState): void {
  if (!socialOn(g) || !g.character.alive) return
  const pairs = protegesOf(g)
  if (pairs.length === 0) return
  const next: MentorPair[] = []
  for (const [ref, base] of pairs) {
    const p = g.people.find((x) => personEntity(x) === ref)
    if (p === undefined || protegeBlock(g, p) !== null) continue
    const life = npcLife(p)
    if (life === null || !finite(life.skill)) continue
    const now = clampSkill(life.skill)
    const gain = now - base
    let skill = now
    if (gain > 0 && finite(gain)) {
      skill = clampSkill(now + Math.min(MENTOR.bonus * gain, 100 - now))
      if (skill > now) saveNpcLife(p, { ...life, skill })
    }
    next.push([ref, skill])
  }
  patchSocial(g, { ms: next.length === 0 ? null : next })
}
