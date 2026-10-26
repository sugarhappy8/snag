// The life log's year view (R3-Q7, E.D3). A busy year (a tycoon's has 12 or 13 lines) is hard to read, so a year keeps its
// notable lines in view, at most 8, and the routine ones and the overflow fold into one closed row per category, each with
// its count. Pure: no React, no store, no draw, nothing written. The line's `s` (the yearly hook that wrote it) and `w`
// (its weight, 0 trivia to 3 life-changing) are read as unknown, like every other save field the UI draws, so a damaged
// or hostile line is a plain notable line and never a throw. A leaf: it reads only the year card's category labels.
import { GROUP_LABEL, GROUP_ORDER, type GroupKey } from './yearCardModel'

/** Lines a year keeps in view. Weight 3 lines come first, then weight 2, the newest first among equals. */
export const LOG_VISIBLE = 8

/** A year of this many lines or fewer is drawn whole, whatever the weights. */
export const LOG_PLAIN = 5

/**
 * The category of a line's source, for the rows that fold. A copy of the table the year planner uses
 * (game/hubs/year-plan.ts, the shape contract between the two lanes); the integration test compares the two. The source
 * is the name of the yearly hook, or the id of a module that writes lines.
 */
export const GROUP_OF_SOURCE: Readonly<Record<string, GroupKey>> = {
  household: 'people',
  relationships: 'people',
  sharedProjects: 'people',
  background: 'people',
  royalty: 'people',
  royalCareers: 'people',
  familyUse: 'people',
  nepo: 'people',
  willFeuds: 'people',
  'world.edges': 'people',
  health: 'body',
  education: 'work',
  professions: 'work',
  career: 'work',
  special: 'work',
  advisors: 'work',
  'effort.you': 'work',
  workshop: 'companies',
  corruption: 'companies',
  business: 'companies',
  techWaves: 'companies',
  hedge: 'companies',
  development: 'money',
  investments: 'money',
  shops: 'money',
  computer: 'money',
  finance: 'money',
  wealth: 'money',
  assets: 'money',
  'knowledge.core': 'money',
  immigration: 'law',
  crime: 'law',
  underworld: 'law',
  nation: 'law',
  history: 'world',
  digest: 'world',
  world: 'world',
  'world.frontier': 'world',
  events: 'life',
  milestones: 'life',
  givingFund: 'life',
}

/** The category of a source: Everyday for a line the player's own action made (no source), a source not in the table, or junk. */
export function groupOf(s: unknown): GroupKey {
  return typeof s === 'string' && Object.hasOwn(GROUP_OF_SOURCE, s) ? GROUP_OF_SOURCE[s]! : 'life'
}

/** The weight of a line: its `w` when that is 0, 1, 2 or 3, and 2 (notable) for a line that has none or a bad one. */
export function lineWeight(e: { s?: unknown; w?: unknown }): 0 | 1 | 2 | 3 {
  const w = e.w
  return w === 0 || w === 1 || w === 2 || w === 3 ? w : 2
}

/** Whether a line carries a usable weight of its own. */
function isWeighed(e: { w?: unknown }): boolean {
  const w = e.w
  return w === 0 || w === 1 || w === 2 || w === 3
}

export interface FoldedGroup<E> {
  k: GroupKey
  label: string
  /** How many lines are in the row; the same as lines.length. */
  n: number
  /** In the order of the log. */
  lines: E[]
}

export interface YearLogView<E> {
  /** The lines that stay in view, in the order of the log. */
  shown: E[]
  /** One row per category that has folded lines, in the order of the year card. */
  collapsed: FoldedGroup<E>[]
}

/**
 * What a year's log shows. A year with 5 lines or fewer, or with no weight on any line (an older save), shows every line
 * and folds none. Otherwise a line of weight 0 or 1 folds, and so does whatever of the lines of weight 2 and 3 does not fit
 * in `visible`: the lowest weight goes first, and among equal weights the oldest, so the newest line stays where the
 * player is looking. Every input line is in `shown` or in exactly one folded row.
 */
export function viewYearLog<E extends { id: string; s?: unknown; w?: unknown }>(entries: readonly E[], visible: number = LOG_VISIBLE): YearLogView<E> {
  if (entries.length <= LOG_PLAIN || !entries.some(isWeighed)) return { shown: entries.slice(), collapsed: [] }
  const room = Number.isFinite(visible) ? Math.max(0, Math.floor(visible)) : LOG_VISIBLE
  const kept = new Set<number>()
  entries
    .map((e, i) => ({ i, w: lineWeight(e) }))
    .filter((x) => x.w >= 2)
    .sort((a, b) => b.w - a.w || b.i - a.i)
    .slice(0, room)
    .forEach((x) => kept.add(x.i))
  const shown: E[] = []
  const folded = new Map<GroupKey, E[]>()
  entries.forEach((e, i) => {
    if (kept.has(i)) {
      shown.push(e)
      return
    }
    const k = groupOf(e.s)
    const list = folded.get(k)
    if (list) list.push(e)
    else folded.set(k, [e])
  })
  const collapsed: FoldedGroup<E>[] = []
  for (const k of GROUP_ORDER) {
    const lines = folded.get(k)
    if (lines) collapsed.push({ k, label: GROUP_LABEL[k], n: lines.length, lines })
  }
  return { shown, collapsed }
}

/** The count on a folded row: "1 line" or "5 lines". Text, so the row's name carries the number. */
export function foldCount(n: number): string {
  return n === 1 ? '1 line' : `${n} lines`
}
