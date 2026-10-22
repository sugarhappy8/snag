// Pace families of the wealth asks (R3-Q9, E.T5): which of the 57 money requests are the same kind of ask, so a kind that was
// put to you lately waits (text/pace.ts askGapOk). Before this the only brake was each ask's own cooldown (1 to 12 years, per person
// for the ones a person makes), so a rich life heard about a toy, a console, a phone and a concert one after another and the same
// kind of ask came back every 2 to 4 years. Now a family is offered at most once in PACE.askGap (4) years, whoever asks.
//
// A storyline is exempt: a crisis (bail, then rehab, then a gambling debt) and the will are one thread, and the thread should not be
// cut because its last chapter was two years ago. `storyline` is per ask, so a family may mix.
//
// The catalogs (wealth-kids.ts, wealth-family.ts, wealth-world.ts) are not edited: this file names the ids. An ask in no family has
// only its own cooldown, and test/ask-families.test.ts fails when a new ask is added without one. Unlike an event family, a family
// of one is fine here (pocket money): the gap is the whole point, not the sharing.
//
// 14 families. Together with the 32 of the event library (events/families.ts) that is 46 of the PACE.maxFamilies (60) the text memory
// leaves for popups, so company events and the career kit (R3-Q10) have 14. Imports the pace key only.
import { paceKey } from '../text/pace'

interface AskFamily {
  /** The pace family ('pop.ask.<name>'). */
  family: string
  /** True when a thread holds the family: the ask is offered whatever the gap says. */
  storyline?: true
}

/** Family name to its ask ids; an id in the list ending in '!' is a storyline ask. Written as lists so the table reads by theme. */
const THEMES: Readonly<Record<string, readonly string[]>> = {
  // Money in the kid's hands, and the gifts that are the same wish for a different thing.
  allowance: ['kid.pocket'],
  gifts: ['kid.toy', 'kid.console', 'kid.phone', 'kid.computer', 'kid.clothes', 'kid.concert', 'kid.party', 'partner.jewelry', 'partner.horse'],
  wheels: ['kid.car', 'kid.newcar', 'partner.car'],
  trips: ['kid.trip', 'kid.camp', 'kid.vacation', 'partner.trip', 'parent.cruise'],
  school: ['kid.tuition', 'kid.gradschool', 'sibling.kids'],
  // Life events that cost a lot and come once.
  wedding: ['kid.wedding', 'sibling.wedding', 'friend.wedding'],
  home: ['kid.house', 'partner.house', 'partner.reno', 'parent.mortgage'],
  // Need and trouble. The crisis and the will are threads.
  crisis: ['kid.bail!', 'kid.rehab!', 'kid.gamble!'],
  estate: ['kid.inherit!', 'kid.willfight!', 'partner.postnup'],
  care: ['parent.medical', 'parent.retire', 'grandparent.care', 'friend.medical'],
  // Somebody wants a loan, or a stake, or just the check.
  loan: ['friend.loan', 'friend.moocher', 'sibling.rent', 'kid.rent'],
  favors: ['friend.dinner', 'inlaw.help', 'relative.door', 'abroad.remit'],
  venture: ['kid.business', 'sibling.venture', 'sibling.restaurant', 'friend.startup', 'cousin.tip', 'parent.dream'],
  // People who are not in your life: strangers, charities, fans.
  outsiders: ['stranger.scam', 'stranger.golddigger', 'charity.gala', 'charity.wing', 'fans.letter'],
}

function flatten(): Record<string, AskFamily> {
  const out: Record<string, AskFamily> = {}
  for (const [family, list] of Object.entries(THEMES)) {
    paceKey('ask', family)
    for (const entry of list) {
      const storyline = entry.endsWith('!')
      const id = storyline ? entry.slice(0, -1) : entry
      if (Object.hasOwn(out, id)) throw new Error(`events/ask-families: "${id}" is in two families ("${out[id].family}" and "${family}")`)
      out[id] = storyline ? { family, storyline: true } : { family }
    }
  }
  return out
}

/** Ask id to its family, and whether the ask is a storyline. Every ask of the catalogs is here (test/ask-families.test.ts). */
export const ASK_FAMILIES: Readonly<Record<string, AskFamily>> = Object.freeze(flatten())

/** The pace key of an ask's family ('pop.ask.gifts'), or undefined for an id the table does not know (then only its cooldown holds it back). */
export function askPaceKey(id: string): string | undefined {
  return Object.hasOwn(ASK_FAMILIES, id) ? paceKey('ask', ASK_FAMILIES[id].family) : undefined
}

/** True when the ask is a thread (a crisis, the will): the family gap does not hold it back. */
export function askIsStoryline(id: string): boolean {
  return Object.hasOwn(ASK_FAMILIES, id) && ASK_FAMILIES[id].storyline === true
}
