// The pure half of the Year-End Desk (R1-C12, roadmap D.4): which annual reports wait in the popup queue, how far through
// this year's batch the player is, and when the desk is drawn. No React and nothing from src/ui/charts/ (the zone rule:
// the kit is reached through lazy.tsx only), so the card around the report (ModalHost) can ask these questions without
// loading the kit. Nothing here writes the queue or any other state.
//
// The desk is dormant in v4.0.2 play: one company is owner-run, so one annual report queues a year. It is built for the
// day a release queues more, and tested with synthetic queues.
import type { Json, ModalItem } from '../../game/types'

/** What the desk remembers about the reports of one year: the year, and the most reports that waited together. */
export interface DeskBatch {
  year: number
  total: number
}

/** One queued annual report: the popup's id, and the fiscal year its data names (null when it names none). */
export interface DeskReport {
  id: string
  year: number | null
}

/** Where the player stands in the batch: "2 of 6". */
export interface DeskPosition {
  index: number
  of: number
}

/** The desk's one button. 'skip' keeps last year's plan (the REPORT script), it does not take the suggested one. */
export const KEEP_ALL_LABEL = 'Keep every plan'

/** The fiscal year in a report's data, read the way the report reads it (a number or a numeric string, 1 to 99999). */
function yearOf(data: Json): number | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const v = data.year
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? Math.round(n) : null
}

/** The annual reports in the queue, in queue order. Notices, choices and every other minigame are left out. */
export function reportsIn(queue: readonly ModalItem[]): DeskReport[] {
  const out: DeskReport[] = []
  if (!Array.isArray(queue)) return out
  for (const item of queue as readonly unknown[]) {
    if (item === null || typeof item !== 'object') continue
    const m = item as Partial<ModalItem>
    if (m.kind === 'minigame' && m.game === 'annualReport' && typeof m.id === 'string') out.push({ id: m.id, year: yearOf(m.data as Json) })
  }
  return out
}

/**
 * The batch after a look at the queue. The batch is the reports of the first report's year; its total is the most that
 * waited together (so it holds while the player finishes them one by one), and it starts over for a new year. A report
 * with no readable year counts as a year of its own. With no report left there is no batch. Calling it again with the
 * same reports changes nothing, so a render that runs twice is harmless.
 */
export function nextBatch(prev: DeskBatch | null, reports: readonly DeskReport[]): DeskBatch | null {
  const head = reports[0]
  if (!head) return null
  const year = head.year ?? 0
  let total = 0
  for (const r of reports) if ((r.year ?? 0) === year) total++
  if (prev !== null && prev.year === year && prev.total >= total) return prev
  return { year, total }
}

/**
 * How many of the waiting reports are in the batch: the ones of the batch's year, counted the way nextBatch counts them
 * (a missing year is the year 0). This is what deskPosition wants as `remaining`. The queue can hold reports of a later
 * year behind the batch; counting those would stop the stepper from advancing. 0 with no batch.
 */
export function remainingIn(batch: DeskBatch | null, reports: readonly DeskReport[]): number {
  if (batch === null) return 0
  let n = 0
  for (const r of reports) if ((r.year ?? 0) === batch.year) n++
  return n
}

/** "2 of 6": the batch's total minus the reports still waiting, plus one. Null for a single report, and for a count that makes no sense. */
export function deskPosition(batch: DeskBatch | null, remaining: number): DeskPosition | null {
  if (batch === null || !(batch.total >= 2) || !Number.isFinite(remaining) || remaining < 1) return null
  const left = Math.min(batch.total, Math.floor(remaining))
  return { index: batch.total - left + 1, of: batch.total }
}

/** The gate ModalHost uses: the desk needs the annualReport2 flag (passed in, read at use) and two or more reports in the batch. */
export function shouldShowDesk(flag: boolean, position: DeskPosition | null): boolean {
  return flag && position !== null
}
