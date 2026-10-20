// Which notices are routine (R1-T5, G.11 step 2): the titles that carry the minor weight without every call site
// opting in. notice() in core.ts looks a title up here when it is given no weight of its own, so a title in this set
// can be sent to the Quiet Mode inbox (ui/store.ts, behind FLAGS.quietInbox) while nothing it says changes. The set
// is empty until R1-T7 fills it from a measured list; E.D1 later replaces it with a bigger table.
//
// A leaf: no imports.

/** Exact notice titles that are routine news. */
export const MINOR_NOTICE_TITLES: ReadonlySet<string> = new Set<string>()

export function noticeWeightFor(title: string): 'minor' | undefined {
  return MINOR_NOTICE_TITLES.has(title) ? 'minor' : undefined
}
