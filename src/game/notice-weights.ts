// Which notices are routine (R1-T5, G.11 step 2): the titles that carry the minor weight without every call site
// opting in. notice() in core.ts looks a title up here when it is given no weight of its own, so a title in this set
// can be sent to the Quiet Mode inbox (ui/store.ts, behind FLAGS.quietInbox) while nothing it says changes. R1-T7
// filled the set from a counting probe: 13 seeded lives played to 85 (test/play-kit.ts, test/notice-probe.test.ts),
// the notices that arrived on their own counted by exact title, then the most frequent ones kept by hand when the
// never-route policy lets the sample through, the tone is not bad, and every call site is yearly code (a notice the
// player just asked for stays a popup). test/fixtures/notice-probe.json records the list, and test/notice-weights.test.ts
// keeps it and this table in step. R3 (E.D1) adds NOTICE_WEIGHTS below: the same idea with four weights instead of one, and R3-Q2 fills it.
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
 * the weight of a title found here on the popup as `w`, res() puts it on the log line, and the store's year close folds the low
 * ones into the card. A title not listed is read as 2 by the planner, so only titles that earn a 0, a 1 or a 3 need a row; the
 * rows at 2 are the titles that are frequent in the probe and shared by bad or large outcomes, kept here so a reader can see they
 * were decided. Every title in MINOR_NOTICE_TITLES is a 1 here (the planner reads `weight: 'minor'` as 1 as well), so the two
 * tables cannot disagree.
 *
 * The 150 or so titles were picked from a counting probe of 34 seeded lives played to 85 (24 ordinary, 6 rich, 4 founders;
 * test/notice-title-probe.test.ts, opt-in, recorded in test/fixtures/notice-titles.json). Only about 35 titles arrive by themselves
 * (the yearly hooks), so the table also takes the frequent outcomes of the small choices a player answers, whose log lines carry
 * the weight too. test/notice-weight-table.test.ts keeps this table and that fixture in step. The rubric:
 *   0 trivia: a reaction or an aside that changes nothing you would remember (a stranger turned down, a joke, a snack).
 *   1 routine: a thing that happens on schedule or a small closed outcome (a kindness, a school milestone, a market mood).
 *   2 notable: the default. Bad-tone, health, legal and large-money titles are never below 2 (the never-route policy of
 *     notice-policy.ts blocks them from the inbox; the planner raises a single blocked notice to 2 as well, which is how the R1
 *     routine titles above stay at 1 although a report card with a failing grade is bad-tone).
 *   3 life-changing: a wedding, a split, a diagnosis, a pregnancy, an arrest and its sentence, a collapse or an exit of a company,
 *     an eviction. The list is pinned by hand in the test; a title joins it on purpose.
 * A title built at run time (`Baby ${word}!`) is not a string in the source, so it has no row.
 */
export const NOTICE_WEIGHTS: Readonly<Record<string, 0 | 1 | 2 | 3>> = Object.freeze<Record<string, 0 | 1 | 2 | 3>>({
  ...Object.fromEntries([...MINOR_NOTICE_TITLES].map((title) => [title, 1 as const])),
  // 0 trivia
  'Admirer': 0,
  'Sibling Rivalry': 0,
  'Finders keepers': 0,
  'Squabble': 0,
  'Personal space': 0,
  'Smart money': 0,
  'Not my business': 0,
  'Dodged it': 0,
  'Faithful': 0,
  'Polite': 0,
  'Bigger person': 0,
  'Busy': 0,
  'Music critic': 0,
  'Walked past': 0,
  'Lol': 0,
  'Nonbeliever': 0,
  'Skeptic': 0,
  'The truth is out there': 0,
  'Burn': 0,
  'Mortifying': 0,
  'Moving on': 0,
  'Nice try': 0,
  'Off the grid': 0,
  'Snack stash': 0,
  'Above it': 0,
  "Finder's fee": 0,
  'Hibernation': 0,
  'No vacancy': 0,
  'Pen pal': 0,
  'Real friend': 0,
  'Oops': 0,
  'Petty': 0,
  'Villain arc': 0,
  'Unplugged': 0,
  'Three Minutes': 0,
  'Damage control': 0,
  'Good boy': 0,
  'Gross': 0,
  'Hungry': 0,
  'Late night purchase': 0,
  'Payback': 0,
  'Radio Commentary': 0,
  'Rock star dreams': 0,
  'Rude': 0,
  'Very busy': 0,
  'Window Shopping': 0,
  'Wobbling': 0,
  'Vacay': 0,
  'Forty Views': 0,
  // 1 routine
  'Kindness': 1,
  'Protected': 1,
  'Street party': 1,
  'The Real World': 1,
  'Not a dry eye': 1,
  'Friendship unlocked': 1,
  'Helpful': 1,
  'Reunited': 1,
  'Good call': 1,
  'Honest': 1,
  'Mine!': 1,
  'New Glasses': 1,
  'Patron of the arts': 1,
  'Unclaimed': 1,
  'Scam the scammer': 1,
  'Good sport': 1,
  'Little scientist': 1,
  'Mature': 1,
  'Roadside hero': 1,
  'New friend!': 1,
  'Happy New Millennium!': 1,
  'A Good Day’s Trade': 1,
  'Every Hand': 1,
  'Second-hand Songs': 1,
  'Night rider': 1,
  'Faith in humanity': 1,
  'Good friend': 1,
  'Hero of the people': 1,
  'Out like a light': 1,
  'The Open Door': 1,
  'Iron will': 1,
  'Eye Contact': 1,
  'Cozy': 1,
  'Philosopher': 1,
  // 2 notable
  'Rest in Peace': 2,
  'Debt Collectors': 2,
  'Feeling Weak': 2,
  'Missed Payment': 2,
  'Rogue CEO Caught': 2,
  'Lockdown': 2,
  'The AI boom': 2,
  'War at Home': 2,
  'Dumped': 2,
  'Milestones!': 2,
  'It Worked!': 2,
  'The 2022 market crash': 2,
  'Debt Free!': 2,
  'Promotion': 2,
  'Retired': 2,
  'September 11': 2,
  'Smallpox': 2,
  'The Great Earthquake': 2,
  'Scammed': 2,
  'Funeral': 2,
  'Treatment Failed': 2,
  'Cured': 2,
  'Bedridden': 2,
  'Assaulted': 2,
  'Robbed': 2,
  'Missing Pet': 2,
  'Acquitted': 2,
  'Not Guilty!': 2,
  'Endorsement Deal': 2,
  'Re-signed': 2,
  'Welcome to the Pros!': 2,
  'Icon Elite': 2,
  'Coming Out': 2,
  'Ashes': 2,
  'Elected!': 2,
  'Laid Off': 2,
  'Fired!': 2,
  'Fired': 2,
  'Engaged!': 2,
  'Repossessed!': 2,
  'Assets Seized': 2,
  'Appeal Denied': 2,
  // 3 life-changing
  'Just Married!': 3,
  'Divorce': 3,
  'Diagnosis': 3,
  'Pregnant!': 3,
  'Bankrupt': 3,
  'IPO Day!': 3,
  'Company Sold!': 3,
  'Arrested': 3,
  'Guilty': 3,
  'Plea Accepted': 3,
  'Locked Up': 3,
  'Death Row': 3,
  'Free at Last': 3,
  'Evicted!': 3,
  'Sentence Commuted': 3,
  'Final Appeal Denied': 3,
})

/** The year weight of a notice title, or undefined when the table does not know it (an own property only: 'constructor' is not a title). */
export function noticeWeightOf(title: string): 0 | 1 | 2 | 3 | undefined {
  return Object.prototype.hasOwnProperty.call(NOTICE_WEIGHTS, title) ? NOTICE_WEIGHTS[title] : undefined
}
