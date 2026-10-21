// Which notices are routine (R1-T5, G.11 step 2): the titles that carry the minor weight without every call site
// opting in. notice() in core.ts looks a title up here when it is given no weight of its own, so a title in this set
// can be sent to the Quiet Mode inbox (ui/store.ts, behind FLAGS.quietInbox) while nothing it says changes. R1-T7
// filled the set from a counting probe: 13 seeded lives played to 85 (test/play-kit.ts, test/notice-probe.test.ts),
// the notices that arrived on their own counted by exact title, then the most frequent ones kept by hand when the
// never-route policy lets the sample through, the tone is not bad, and every call site is yearly code (a notice the
// player just asked for stays a popup). test/fixtures/notice-probe.json records the list, and test/notice-weights.test.ts
// keeps it and this table in step. E.D1 later replaces it with a bigger table.
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
