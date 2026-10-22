// Pace families of the company events (R3-Q10, E.T5): which of the 33 events of business/events.ts are the same kind of trouble or
// luck, so a kind that just hit one of your companies weighs a quarter as much for 5 years, whichever company it was (text/pace.ts).
// The memory is the player's, not the company's: a tycoon with ten firms hears about inspectors, rivals and strikes at the rate
// one owner would, not ten times as often. No `family` field on the events: this table names the ids, so an event never moves.
//
// The ids are the EVENTS list of events.ts, COMPETITION_EVENTS (competition-events.ts) and EXTRA_EVENTS (events-extra.ts). Six
// families, each with at least 2 members, an id in one only (checked when the module loads and again in test/biz-pace.test.ts). With
// the 32 event families and the 14 ask families that is 52 of the PACE.maxFamilies (60) the text memory leaves for popups; the
// career kit (special/kit/families.ts) has the other 8. Imports the pace key only.
import { paceKey } from '../text/pace'

/** Family name to the event ids in it. The names are the pace families ('pop.biz.<name>'). */
const THEMES: Readonly<Record<string, readonly string[]>> = {
  // The state and the courts come to the door.
  regulator: ['inspection', 'audit', 'lawsuit', 'breach'],
  // Somebody in your market moves: a bigger firm, a copy, a price war, a newcomer.
  rivals: ['competitor', 'giantBid', 'copycat', 'rivalPriceWar', 'rivalScandal', 'rivalMove', 'newcomer', 'localCopycat'],
  // The people who work for you.
  staff: ['strike', 'union', 'embezzle', 'poached', 'employeeIdea', 'tacos'],
  // The public notices you: a clip, a star, a critic, a creator, a trend.
  press: ['viral', 'celebrity', 'critic', 'influencer', 'trend'],
  // An offer to sell, buy in, expand or move.
  deals: ['buyout', 'bid', 'starInvestor', 'franchisePitch', 'prime', 'rent'],
  // The world moves under the whole firm: suppliers, money, weather.
  shocks: ['supplier', 'currency', 'disaster', 'supplyShock'],
}

function flatten(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [family, ids] of Object.entries(THEMES)) {
    paceKey('biz', family)
    if (ids.length < 2) throw new Error(`business/event-families: the family "${family}" has fewer than 2 events`)
    for (const id of ids) {
      if (Object.hasOwn(out, id)) throw new Error(`business/event-families: "${id}" is in two families ("${out[id]}" and "${family}")`)
      out[id] = family
    }
  }
  return out
}

/** Company event id to its family. Every event of the three lists is here (test/biz-pace.test.ts). */
export const BIZ_EVENT_FAMILIES: Readonly<Record<string, string>> = Object.freeze(flatten())

/** id to the memory key of its family, built once: a pick weighs every event of every company, so the key is asked for hundreds of times a year. */
const KEYS: ReadonlyMap<string, string> = new Map(Object.entries(BIZ_EVENT_FAMILIES).map(([id, family]) => [id, paceKey('biz', family)]))

/** The pace key of a company event's family ('pop.biz.rivals'), or undefined for an id the table does not know (then only the yearly roll holds it back). */
export function bizPaceKey(id: string): string | undefined {
  return KEYS.get(id)
}
