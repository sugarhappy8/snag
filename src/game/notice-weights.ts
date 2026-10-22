// Which notices are routine (R1-T5, G.11 step 2): the titles that carry the minor weight without every call site
// opting in. notice() in core.ts looks a title up here when it is given no weight of its own, so a title in this set
// can be sent to the Quiet Mode inbox (ui/store.ts, behind FLAGS.quietInbox) while nothing it says changes. R1-T7
// filled the set from a counting probe: 13 seeded lives played to 85 (test/play-kit.ts, test/notice-probe.test.ts),
// the notices that arrived on their own counted by exact title, then the most frequent ones kept by hand when the
// never-route policy lets the sample through, the tone is not bad, and every call site is yearly code (a notice the
// player just asked for stays a popup). test/fixtures/notice-probe.json records the list, and test/notice-weights.test.ts
// keeps it and this table in step. R3 (E.D1) adds NOTICE_WEIGHTS below: the same idea with four weights instead of one.
//
// A leaf: no imports.

/** Exact notice titles that are routine news, most frequent first. */
export const MINOR_NOTICE_TITLES: ReadonlySet<string> = new Set<string>([
  'Report Card',
  'Season Over',
  'Graduation',
  'Puberty',
  "You're an Adult!",
  'Family Computer!',
  'Special Talent',
  'One Small Step',
  'Wedding Bells',
  'Champions!',
])

export function noticeWeightFor(title: string): 'minor' | undefined {
  return MINOR_NOTICE_TITLES.has(title) ? 'minor' : undefined
}

/**
 * How much a notice matters to the year (R3, E.D1): 0 trivia, 1 routine, 2 notable, 3 life-changing. notice() (core.ts) stamps
 * the weight of a title found here on the popup as `w`, and the store's year close folds the low ones into the card. A title not
 * listed is read as 2 by the planner, so only titles that earn a 0, a 1 or a 3 need a row. Every title in MINOR_NOTICE_TITLES is
 * a 1 here (the planner reads `weight: 'minor'` as 1 as well), so the two tables cannot disagree.
 */
export const NOTICE_WEIGHTS: Readonly<Record<string, 0 | 1 | 2 | 3>> = Object.freeze({
  ...Object.fromEntries([...MINOR_NOTICE_TITLES].map((title) => [title, 1 as const])),
})

/** The year weight of a notice title, or undefined when the table does not know it (an own property only: 'constructor' is not a title). */
export function noticeWeightOf(title: string): 0 | 1 | 2 | 3 | undefined {
  return Object.prototype.hasOwnProperty.call(NOTICE_WEIGHTS, title) ? NOTICE_WEIGHTS[title] : undefined
}
