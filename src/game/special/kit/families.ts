// Pace families of the career crises (R3-Q10, E.T5): which of the kit's yearly crises are the same kind of trouble or luck, so a
// kind that just came to you weighs a quarter as much for 5 years, whichever career it came through (text/pace.ts). The player is one
// person: a scandal in the studio and a rumor on the runway are both the press getting hold of your name.
//
// The crisis ids repeat across careers ('injury' is an actor's stunt and a model's fall), so the table is keyed by `<career>.<id>`.
// Eight families, each with at least 2 members, a crisis in one only (checked when the module loads and again in
// test/kit-pace.test.ts). With the 32 event families, the 14 ask families and the 6 company families that is the 60 of
// PACE.maxFamilies the text memory leaves for popups. A crisis not named here (a new career's) has only its own cool-down. Imports
// the pace key only.
import { paceKey } from '../../text/pace'

/** Family name to the `<career>.<crisis id>` keys in it. The names are the pace families ('pop.kit.<name>'). */
const THEMES: Readonly<Record<string, readonly string[]>> = {
  // The story gets out.
  press: ['actor.scandalLeak', 'model.rumor', 'model.pressStorm', 'music.scandal'],
  // The body pays for the work.
  body: ['actor.injury', 'model.injury', 'astronaut.boneScan', 'astronaut.anomaly'],
  // Someone in your own trade wants what you have.
  rival: ['actor.poach', 'actor.rivalFeud', 'model.agencyApproach', 'model.windowConflict', 'astronaut.crewFriction', 'music.clash'],
  // The trade itself changes under you.
  shift: ['actor.soundShift', 'actor.techShift', 'model.youngerFaces'],
  // An institution leans on you: a committee, a guild, the censors, a budget.
  power: ['actor.redScare', 'actor.guildStrike', 'actor.censor', 'astronaut.appropriations', 'astronaut.scheduleSqueeze'],
  // A chance knocks.
  offer: ['actor.franchise', 'model.testShoot', 'model.likenessLicence', 'music.collab', 'music.award', 'music.festival'],
  // The books.
  money: ['music.audit', 'actor.shelved'],
  // Home, and the people you flew with.
  home: ['astronaut.homeFront', 'astronaut.lostCrew'],
}

function flatten(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [family, keys] of Object.entries(THEMES)) {
    paceKey('kit', family)
    if (keys.length < 2) throw new Error(`special/kit/families: the family "${family}" has fewer than 2 crises`)
    for (const key of keys) {
      if (Object.hasOwn(out, key)) throw new Error(`special/kit/families: "${key}" is in two families ("${out[key]}" and "${family}")`)
      out[key] = family
    }
  }
  return out
}

/** `<career>.<crisis id>` to its family. Every crisis of the four kit careers is here (test/kit-pace.test.ts). */
export const KIT_FAMILIES: Readonly<Record<string, string>> = Object.freeze(flatten())

/** `<career>.<crisis id>` to the memory key of its family, built once (the offer and the odds ask for it for every eligible crisis). */
const KEYS: ReadonlyMap<string, string> = new Map(Object.entries(KIT_FAMILIES).map(([key, family]) => [key, paceKey('kit', family)]))

/** The pace key of a crisis's family ('pop.kit.press'), or undefined for a crisis the table does not know (then only its cool-down holds it back). */
export function kitPaceKey(career: string, id: string): string | undefined {
  return KEYS.get(`${career}.${id}`)
}
