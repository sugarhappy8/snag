// R1-P8 (J.1, decision D25): the depth registry. Business and the eleven careers are scored 0 to 3 on 17 dimensions
// (digest J, section 3: docs/superpowers/audits/living-world/J-business-depth-rubric.md). The scores were seeded from
// that table and each column was summed against its printed total.
//
// This is a measure, not a gate, until R12: test/depth-rubric.test.ts prints the table and fails only on a malformed
// entry. Each release from R3 to R11 raises the `scores` line of the entries it finishes, in its own hunk, and fills
// `metrics` and `evidence` for them. R12 flips ENFORCE_GATE. Plain TypeScript, no vitest, so a script can import it.
//
// Scoring: 0 absent, 1 token (a stat or a menu row), 2 working (state, a yearly step, a choice, a test), 3 meets the
// bar in the dimension's `bar`, which is also its acceptance test. The digest numbers its dimensions R1 to R17, which
// collide with the release names, so this file says `n` and `key`.

export type ModuleId =
  | 'business'
  | 'actor'
  | 'astronaut'
  | 'model'
  | 'musician'
  | 'author'
  | 'influencer'
  | 'politician'
  | 'sports'
  | 'gameIndustry'
  | 'hustler'
  | 'military'

export type Score = 0 | 1 | 2 | 3

export type DimKey =
  | 'ladder'
  | 'field'
  | 'money'
  | 'assets'
  | 'team'
  | 'law'
  | 'crises'
  | 'research'
  | 'reports'
  | 'fog'
  | 'exit'
  | 'automation'
  | 'history'
  | 'news'
  | 'showcase'
  | 'text'
  | 'tests'

/** n is 1 to 17 (digest J's R1 to R17). bar is the checkable text for a 3, at most 140 characters. */
export interface Dimension {
  n: number
  key: DimKey
  label: string
  bar: string
}

/** The 17 dimensions, in the order every entry's `scores` follows. */
export const DIMENSIONS: readonly Dimension[] = [
  { n: 1, key: 'ladder', label: 'Ladder', bar: '5+ named rungs in a data table, each gated, with a ceiling and a way down. A seeded walk reaches all; none opens before its era.' },
  { n: 2, key: 'field', label: 'Living field', bar: 'Named rivals by era, country and cohort, ranked by a pure function, with memory, for the same slot at the same odds. Same seed, same names.' },
  { n: 3, key: 'money', label: 'Money and books', bar: 'One ledger, a named source and sink per dollar, a yearly statement, gross equals parts. Scan test, 30-year identity test. No minted money.' },
  { n: 4, key: 'assets', label: 'Assets', bar: '3+ kinds that hold value, can be sold or licensed and pass to an heir. Capped, and counted once in net worth.' },
  { n: 5, key: 'team', label: 'Team', bar: '3+ hire roles as Person entities with skill, loyalty, cut and poaching. Quality feeds 2+ outcome formulas (fixed-seed swap test).' },
  { n: 6, key: 'law', label: 'Law', bar: '6+ country or era rules enforced inside actions, one regulator, claim or audit event, and 10+ countries that differ.' },
  { n: 7, key: 'crises', label: 'Crises', bar: '20+ event rows, 3 stances, odds from one function the hint prints, one choice and two notices a year at most. 100-life cadence probe.' },
  { n: 8, key: 'research', label: 'Research and craft', bar: '3+ tracks. Price set by the project, not wealth. Odds rise with money (under 2x for double), staff quality, ambition and labor; flops.' },
  { n: 9, key: 'reports', label: 'Reports', bar: 'A statement, a 30-year series (6 numbers a year), rank against the field and milestones. Pure, and idempotent on a re-run.' },
  { n: 10, key: 'fog', label: 'Fog', bar: 'Each hidden fact has a paid or earned reveal kept as state; the default is an estimate band; no text leaks it; no foresight.' },
  { n: 11, key: 'exit', label: 'Exit and legacy', bar: '3+ exits that settle money, a legacy score and an heir fixture test.' },
  { n: 12, key: 'automation', label: 'Automation', bar: 'A hired manager or agent with a mandate, limits and a yearly letter, no irreversible moves, and lockouts enforced in actions.' },
  { n: 13, key: 'history', label: 'History and country', bar: 'First-year tables, 10+ countries that differ, and no anachronism over a 1900 to 2040 start-year sweep.' },
  { n: 14, key: 'news', label: 'World hooks and news', bar: 'Reads 2+ world signals (war, cycle, wave, policy), writes one news item a year at most; a war-year test changes the output.' },
  { n: 15, key: 'showcase', label: 'Showcase', bar: 'A yearly public event (launch, premiere, tour, fair, ceremony) with spend, odds and a bounded reputation or sales result.' },
  { n: 16, key: 'text', label: 'Text and clutter', bar: '3+ variants per branch, no repeat in 10 years, VOICE caps, a voice test, counted over 200 lives.' },
  { n: 17, key: 'tests', label: 'Tests', bar: 'Unit, seeded balance (3 styles x 2 seeds x 10 years), opt-in fuzz, money scan, old-save fixture, idempotence, a 160-year ceiling test.' },
]

/** Counts the owning release fills in: R1 ladder rungs, R7 event rows, R6 rules. */
export interface DepthMetrics {
  rungs?: number
  rows?: number
  rules?: number
}

export interface DepthEntry {
  id: ModuleId
  label: string
  /** Digest J's total at v4.0.2. Never changes. */
  baseline: number
  /** 17 scores, in DIMENSIONS order. The only field releases change routinely. */
  scores: readonly Score[]
  metrics: DepthMetrics
  /** One sentence or a file path, at most 140 characters. */
  evidence: Partial<Record<DimKey, string>>
  /** A named substitute where a dimension cannot apply (hustler automation becomes a crew). */
  substitute: Partial<Record<DimKey, string>>
}

//                     lad fld mon ast tem law cri res rep fog ext aut his new sho txt tst
// Each scores line is one release's edit; keep them on one line.
/** 12 entries, in the ModuleId order above. */
export const DEPTH: readonly DepthEntry[] = [
  {
    id: 'business',
    label: 'Business',
    baseline: 43,
    scores: [3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 3, 3, 3, 2, 1, 2, 3],
    metrics: {},
    evidence: {
      money: 'Foresight mint removed in R0-3, so the score of 3 stands.',
      research: 'src/game/business/rd.ts: odds come from the budget only.',
      automation: 'src/game/business/board-ceo.ts, 729 lines.',
    },
    substitute: {},
  },
  {
    id: 'actor',
    label: 'Actor',
    baseline: 34,
    scores: [2, 3, 3, 2, 3, 2, 2, 1, 2, 1, 2, 0, 3, 1, 2, 2, 3],
    metrics: {},
    evidence: {
      field: 'src/game/special/kit/rivals.ts, 386 lines.',
      team: 'src/game/special/actor-team.ts, 461 lines.',
    },
    substitute: {},
  },
  {
    id: 'astronaut',
    label: 'Astronaut',
    baseline: 31,
    scores: [3, 3, 2, 1, 1, 2, 2, 1, 2, 1, 2, 0, 3, 2, 1, 2, 3],
    metrics: {},
    evidence: { field: 'src/game/special/kit/rivals.ts, 386 lines.' },
    substitute: {},
  },
  {
    id: 'model',
    label: 'Model',
    baseline: 32,
    scores: [2, 3, 3, 1, 2, 2, 2, 1, 2, 1, 2, 0, 3, 1, 2, 2, 3],
    metrics: {},
    evidence: { field: 'src/game/special/kit/rivals.ts, 386 lines.' },
    substitute: {},
  },
  {
    id: 'musician',
    label: 'Musician',
    baseline: 36,
    scores: [2, 3, 3, 3, 2, 3, 2, 1, 2, 1, 2, 0, 3, 1, 3, 2, 3],
    metrics: {},
    evidence: {
      field: 'src/game/special/kit/rivals.ts, 386 lines.',
      showcase: 'src/game/special/music-tour.ts, 316 lines.',
    },
    substitute: {},
  },
  {
    id: 'author',
    label: 'Author',
    baseline: 17,
    scores: [1, 0, 2, 2, 1, 1, 1, 2, 1, 1, 1, 0, 1, 0, 0, 1, 2],
    metrics: {},
    evidence: {},
    substitute: {},
  },
  {
    id: 'influencer',
    label: 'Influencer',
    baseline: 14,
    scores: [1, 0, 1, 1, 0, 1, 2, 1, 0, 0, 1, 0, 2, 1, 1, 1, 1],
    metrics: {},
    evidence: {},
    substitute: {},
  },
  {
    id: 'politician',
    label: 'Politician',
    baseline: 34,
    scores: [2, 3, 2, 1, 2, 3, 3, 1, 2, 1, 2, 0, 3, 3, 2, 2, 2],
    metrics: {},
    evidence: {},
    substitute: {},
  },
  {
    id: 'sports',
    label: 'Sports',
    baseline: 30,
    scores: [3, 2, 2, 1, 1, 2, 3, 2, 2, 1, 3, 0, 1, 1, 3, 2, 1],
    metrics: {},
    evidence: {},
    substitute: {},
  },
  {
    id: 'gameIndustry',
    label: 'Game industry',
    baseline: 32,
    scores: [3, 1, 2, 3, 2, 1, 2, 2, 2, 1, 2, 1, 3, 2, 2, 1, 2],
    metrics: {},
    evidence: {},
    substitute: {},
  },
  {
    id: 'hustler',
    label: 'Hustler',
    baseline: 8,
    scores: [1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    metrics: {},
    evidence: {},
    substitute: { automation: 'A crew the hustler hires stands in for a hired manager.' },
  },
  {
    id: 'military',
    label: 'Military',
    baseline: 18,
    scores: [3, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 3, 2, 0, 1, 0],
    metrics: {},
    evidence: {},
    substitute: {},
  },
]

/** R12 flips this to true, and with it the real-registry assertion in test/depth-rubric.test.ts. */
export const ENFORCE_GATE = false

/** D25: no dimension under minEach, at least minThrees dimensions at 3, a total of at least minTotal out of max. */
export const GATE = { minEach: 2, minThrees: 14, minTotal: 45, max: 51 } as const

/** Business must itself reach 3 on these, on top of the gate. */
export const BUSINESS_MUST_BE_3: readonly DimKey[] = ['research', 'reports', 'fog', 'news', 'showcase', 'text']

/** A score the entry doesn't have (a short list) counts as 0, so a malformed entry can't pass the gate by omission. */
function scoreAt(e: DepthEntry, i: number): number {
  return e.scores[i] ?? 0
}

export function total(e: DepthEntry): number {
  return e.scores.reduce<number>((sum, s) => sum + s, 0)
}

export function threes(e: DepthEntry): number {
  return e.scores.filter((s) => s === 3).length
}

/** The dimensions scored under `min`, in DIMENSIONS order. */
export function below(e: DepthEntry, min: number): DimKey[] {
  return DIMENSIONS.filter((_, i) => scoreAt(e, i) < min).map((d) => d.key)
}

/**
 * D25 for one entry. `failing` has one line per dimension under the minimum (rubric order), then `threes`, then
 * `total`, each saying what is short. For business a dimension in BUSINESS_MUST_BE_3 must be 3 and is named once.
 */
export function gateStatus(e: DepthEntry): { ok: boolean; failing: string[] } {
  const failing: string[] = []
  DIMENSIONS.forEach((d, i) => {
    const s = scoreAt(e, i)
    if (e.id === 'business' && BUSINESS_MUST_BE_3.includes(d.key)) {
      if (s < 3) failing.push(`${d.key}: ${s}, business needs 3`)
    } else if (s < GATE.minEach) {
      failing.push(`${d.key}: ${s} is under ${GATE.minEach}`)
    }
  })
  const t3 = threes(e)
  if (t3 < GATE.minThrees) failing.push(`threes: ${t3} of ${GATE.minThrees} needed`)
  const t = total(e)
  if (t < GATE.minTotal) failing.push(`total: ${t} of ${GATE.minTotal} needed`)
  return { ok: failing.length === 0, failing }
}

/**
 * The table as text: a header of module labels, 17 dimension rows, then Total, Threes, Under-2 and Gate. Pure and
 * deterministic: the same entries give the same string.
 */
export function formatDepthTable(entries: readonly DepthEntry[]): string {
  const heads = DIMENSIONS.map((d) => `${d.n} ${d.label}`)
  const first = Math.max('Dimension'.length, 'Under-2'.length, ...heads.map((h) => h.length))
  const widths = entries.map((e) => Math.max(e.label.length, 4))
  const row = (head: string, cells: readonly string[]): string =>
    [head.padEnd(first), ...cells.map((c, i) => c.padStart(widths[i] ?? c.length))].join('  ').trimEnd()
  const lines = [row('Dimension', entries.map((e) => e.label))]
  DIMENSIONS.forEach((_, i) => {
    lines.push(row(heads[i] ?? '', entries.map((e) => (e.scores[i] === undefined ? '?' : String(e.scores[i])))))
  })
  lines.push(row('Total', entries.map((e) => String(total(e)))))
  lines.push(row('Threes', entries.map((e) => String(threes(e)))))
  lines.push(row('Under-2', entries.map((e) => String(below(e, 2).length))))
  lines.push(row('Gate', entries.map((e) => (gateStatus(e).ok ? 'pass' : 'fail'))))
  return lines.join('\n')
}
