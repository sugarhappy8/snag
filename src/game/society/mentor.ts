// Mentorship (R4-E11 part B): a younger relative or coworker of 14 to 40 gets a yearly bonus of at most 15% of the year's own skill gain,
// measured against a baseline kept in the `social` shard (`ms`, at most 3 [ref, skill] pairs). NOT WRITTEN YET.
//
// What part B writes here (the spec is in docs/superpowers/plans/2026-10-26-r4-v5.3.0/edges-acts.md, "R4-E11", and test/social-mentor.test.ts
// is the red test that pins it):
//   mentorAct          the SocialAct of the enrolment (id `mentor.enrol`), run on the edge person > player; blocked for a life that is not
//                      stamped, a protege who is dead, a pet, estranged, not in the game, not younger than the player, under 14 or over 40, not
//                      a relative or a coworker, already enrolled, or a fourth (3 at most)
//   enrolMentor(g, p)  runs the act through runAct and, when it was done, writes the baseline pair [ref, skill] with patchSocial
//   protegesOf(g)      the pairs of the baseline, read through the normalizer (a hostile or missing baseline reads as none)
//   mentorSettle(g)    the settle at `close` 6, inside the one `society.acts` entry (society/module.ts): for each protege it takes the gain
//                      of the NPC year since the baseline, adds the bonus (at most 15% of that gain, never negative) through npcLife and
//                      saveNpcLife (npc-state.ts), and writes the new baseline with patchSocial. Idempotent: a second settle sees a gain of 0
//
// Layer 3 (society). It imports the seam of npc-state.ts (the only file of society/ that does) and the shard writers of world/.
import type { GameState, Person } from '../types'
import type { MentorPair } from '../world/social'
import type { SocialAct } from './acts'

/** The numbers of the mentorship. */
export const MENTOR = Object.freeze({ proteges: 3, bonus: 0.15, ageMin: 14, ageMax: 40 })

/** Part B writes this. Until then it blocks everyone. */
export const mentorAct: SocialAct = {
  id: 'mentor.enrol',
  blocked: () => 'Not written yet.',
  plan: () => ({}),
}

/** Part B writes this. Until then it enrols no one. */
export function enrolMentor(_g: GameState, _p: Person): boolean {
  return false
}

/** Part B writes this. Until then the baseline reads as none. */
export function protegesOf(_g: Pick<GameState, 'world'>): readonly MentorPair[] {
  return []
}

/** Part B writes this. Until then it does nothing. */
export function mentorSettle(_g: GameState): void {
  // R4-E11 part B
}
