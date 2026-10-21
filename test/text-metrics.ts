// Text metrics for the harness (R1-T9, E.T2): how repetitive a played life reads, and how many cards its popups would
// need. Pure functions over a LifeTrace, which is just what test/play-kit.ts records (the log lines and the popups of
// each year). They read the trace and write nothing, so a deep-frozen trace is fine. No vitest imports: the same
// module can run under vitest or as a bundled node script, like test/play-kit.ts.
//
// A trace is in play order: years ascend, and the lines and popups inside a year are in the order they appeared.
import { routesToInbox } from '../src/game/notice-policy'
import type { ModalItem } from '../src/game/types'
import { DIGEST_MAX, DIGEST_MIN, mergeable } from '../src/ui/components/noticeModel'
import type { PlayedYear } from './play-kit'

export interface LifeTrace {
  seed: number
  birthYear: number
  rich: boolean
  years: PlayedYear[]
}

/** Nearest-rank percentiles: the p-th is the value at rank ceil(p * n / 100) of the sorted list. */
export interface Spread {
  mean: number
  p50: number
  p90: number
  max: number
}

export interface TextMetrics {
  lines: number
  /** share of log lines whose normalized text was already in the life */
  repeatedShare: number
  /** consecutive repeats of one normalized line that are at most 10 years apart */
  sameWithin10: number
  /** distinct normalized lines seen more than 3 times, and the highest count of any line */
  over3: { distinct: number; max: number }
  /** popups by normalized title: families, the biggest count in one life, families above 6, the shortest gap in years between two of one family (null when none repeats) */
  popupFamilies: { families: number; maxPerLife: number; over6: number; minGapYears: number | null }
  /** share of lines whose first three words are shared with at least one other line */
  openerShare: number
  /** popups a year over all years */
  popupsPerYear: Spread
  /** cards a year if the UI drew them: raw popups, after the digest merge, after the digest merge with Quiet Mode routing */
  cardsPerYear: { raw: Spread; digest: Spread; quiet: Spread }
}

/** The numbers design 9.2 sets for the finished text work. Enforced only when TEXT_KIT_ENFORCE=1 (test/text-kit.test.ts). */
export const DESIGN_THRESHOLDS: Readonly<{
  repeatedShare: 0.05
  repeatedShareRich: 0.08
  sameWithin10: 0
  over3Max: 3
  popupFamilyMax: 6
  popupFamilyMinGap: 4
  openerShare: 0.12
  openerShareRich: 0.2
  popupsP90: 4
}> = Object.freeze({
  repeatedShare: 0.05,
  repeatedShareRich: 0.08,
  sameWithin10: 0,
  over3Max: 3,
  popupFamilyMax: 6,
  popupFamilyMinGap: 4,
  openerShare: 0.12,
  openerShareRich: 0.2,
  popupsP90: 4,
} as const)

/**
 * The form two lines are compared in: lower case, money symbols removed, every run of digits one '#', white space
 * collapsed and trimmed. So "You earned $800." and "you  earned $950." are the same line. A separator between digits
 * is not part of the run ("1,200" becomes "#,#"), which keeps the rule to what it says.
 */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\p{Sc}/gu, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

/** The mean and the nearest-rank p50, p90 and max of a list of counts; all 0 for an empty list. */
function spread(xs: readonly number[]): Spread {
  const n = xs.length
  if (n === 0) return { mean: 0, p50: 0, p90: 0, max: 0 }
  const sorted = [...xs].sort((a, b) => a - b)
  // p is a whole number, so p * n is exact and the division by 100 cannot round a whole rank up.
  const rank = (p: number): number => sorted[Math.min(n, Math.max(1, Math.ceil((p * n) / 100))) - 1]
  let sum = 0
  for (const x of sorted) sum += x
  return { mean: sum / n, p50: rank(50), p90: rank(90), max: sorted[n - 1] }
}

/**
 * How many cards the popups of one year take if the UI drew them in this order. A choice, input or minigame is one
 * card. A run of notices that can share a card (noticeModel's `mergeable`) is one card per notice, or, with `digest`,
 * ceil(len / DIGEST_MAX) cards when it has at least DIGEST_MIN notices. With `quiet`, the notices Quiet Mode would
 * send to the inbox (`routesToInbox`) are taken out first. A built-in task is never drawn and ends a run.
 */
export function countCards(shown: readonly ModalItem[], opts: { digest: boolean; quiet: boolean }): number {
  let cards = 0
  let run = 0
  const flush = (): void => {
    cards += opts.digest && run >= DIGEST_MIN ? Math.ceil(run / DIGEST_MAX) : run
    run = 0
  }
  for (const m of shown) {
    if (opts.quiet && routesToInbox(m, true)) continue
    if (mergeable(m)) {
      run++
      continue
    }
    flush()
    if (m.kind !== 'aiTask') cards++
  }
  flush()
  return cards
}

/** The year gaps between the sightings of one thing, as consecutive differences. */
function gaps(years: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < years.length; i++) out.push(years[i] - years[i - 1])
  return out
}

function push(map: Map<string, number[]>, key: string, year: number): void {
  const seen = map.get(key)
  if (seen) seen.push(year)
  else map.set(key, [year])
}

/** Measure one played life. */
export function textMetrics(life: LifeTrace): TextMetrics {
  // The log: every normalized line with the years it appeared in, and every three-word opener with its count.
  const lineYears = new Map<string, number[]>()
  const openerCount = new Map<string, number>()
  const openers: string[] = []
  let lines = 0
  let repeated = 0
  // The popups: every normalized title with the years it appeared in, and the counts per year.
  const titleYears = new Map<string, number[]>()
  const perYear: number[] = []
  const raw: number[] = []
  const digest: number[] = []
  const quiet: number[] = []

  for (const y of life.years) {
    for (const line of y.lines) {
      const text = normalize(line.text)
      lines++
      if (lineYears.has(text)) repeated++
      push(lineYears, text, y.year)
      const opener = text.split(' ', 3).join(' ')
      openers.push(opener)
      openerCount.set(opener, (openerCount.get(opener) ?? 0) + 1)
    }
    perYear.push(y.popups.length)
    const shown = y.popups.map((p) => p.item)
    raw.push(countCards(shown, { digest: false, quiet: false }))
    digest.push(countCards(shown, { digest: true, quiet: false }))
    quiet.push(countCards(shown, { digest: true, quiet: true }))
    for (const p of y.popups) push(titleYears, normalize(p.title), y.year)
  }

  let within10 = 0
  let over3 = 0
  let most = 0
  for (const years of lineYears.values()) {
    if (years.length > 3) over3++
    most = Math.max(most, years.length)
    within10 += gaps(years).filter((d) => d <= 10).length
  }

  let perLife = 0
  let over6 = 0
  let minGap: number | null = null
  for (const years of titleYears.values()) {
    perLife = Math.max(perLife, years.length)
    if (years.length > 6) over6++
    for (const d of gaps(years)) minGap = minGap === null ? d : Math.min(minGap, d)
  }

  // An empty opener (a line with no words) is no opener, so it never counts as shared.
  const shared = openers.filter((o) => o !== '' && (openerCount.get(o) ?? 0) > 1).length

  return {
    lines,
    repeatedShare: lines === 0 ? 0 : repeated / lines,
    sameWithin10: within10,
    over3: { distinct: over3, max: most },
    popupFamilies: { families: titleYears.size, maxPerLife: perLife, over6, minGapYears: minGap },
    openerShare: lines === 0 ? 0 : shared / lines,
    popupsPerYear: spread(perYear),
    cardsPerYear: { raw: spread(raw), digest: spread(digest), quiet: spread(quiet) },
  }
}

/**
 * One measure for several lives. Shares and the mean, p50 and p90 of a spread are means weighted by each life's log
 * lines (so merged percentiles are an approximation, not the percentiles of the pooled years). A max is the max of the
 * maxes, the shortest gap is the smallest gap (null when no life has one), and a count is the sum over the lives. Lives
 * with no lines at all weigh the same. No lives give the measure of an empty life.
 */
export function mergeMetrics(lives: readonly TextMetrics[]): TextMetrics {
  if (lives.length === 0) return textMetrics({ seed: 0, birthYear: 0, rich: false, years: [] })
  const total = lives.reduce((n, l) => n + l.lines, 0)
  // The weight is a fraction computed first, so a single life weighs exactly 1 and merges to itself.
  const weights = lives.map((l) => (total > 0 ? l.lines / total : 1 / lives.length))
  const mean = (pick: (l: TextMetrics) => number): number => lives.reduce((s, l, i) => s + pick(l) * weights[i], 0)
  const sum = (pick: (l: TextMetrics) => number): number => lives.reduce((s, l) => s + pick(l), 0)
  const max = (pick: (l: TextMetrics) => number): number => Math.max(...lives.map(pick))
  const spreadOf = (pick: (l: TextMetrics) => Spread): Spread => ({
    mean: mean((l) => pick(l).mean),
    p50: mean((l) => pick(l).p50),
    p90: mean((l) => pick(l).p90),
    max: max((l) => pick(l).max),
  })
  const seen = lives.map((l) => l.popupFamilies.minGapYears).filter((d): d is number => d !== null)
  return {
    lines: total,
    repeatedShare: mean((l) => l.repeatedShare),
    sameWithin10: sum((l) => l.sameWithin10),
    over3: { distinct: sum((l) => l.over3.distinct), max: max((l) => l.over3.max) },
    popupFamilies: {
      families: sum((l) => l.popupFamilies.families),
      maxPerLife: max((l) => l.popupFamilies.maxPerLife),
      over6: sum((l) => l.popupFamilies.over6),
      minGapYears: seen.length > 0 ? Math.min(...seen) : null,
    },
    openerShare: mean((l) => l.openerShare),
    popupsPerYear: spreadOf((l) => l.popupsPerYear),
    cardsPerYear: {
      raw: spreadOf((l) => l.cardsPerYear.raw),
      digest: spreadOf((l) => l.cardsPerYear.digest),
      quiet: spreadOf((l) => l.cardsPerYear.quiet),
    },
  }
}
