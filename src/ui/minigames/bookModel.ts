// The pure half of the Annual Report 2.0 book (R1-C11): which tabs it has, what the arrow keys do on them, what the
// header needs, what a tab says when a chart it would show is missing, and whether a report's data carries a book at
// all. No React and nothing from src/ui/charts/ (the zone rule: the kit is reached through lazy.tsx only), so the card
// around the report (ModalHost) and the report itself (AnnualReport) can ask these questions without loading the kit.
import { readReportCharts, type ReportCharts } from '../../game/charts/report'
import type { Json } from '../../game/types'
import { rovingMove } from '../a11y/roving'

/** The five tabs, in reading order. */
export const BOOK_TABS = ['summary', 'pl', 'cash', 'market', 'plan'] as const
export type BookTab = (typeof BOOK_TABS)[number]

/** What the tab says on the button. */
export const TAB_LABELS: Record<BookTab, string> = { summary: 'Summary', pl: 'P&L', cash: 'Cash', market: 'Market', plan: 'Plan' }

/** What a screen reader calls the tab: the short label "P&L" is spoken as the words. */
export const TAB_NAMES: Record<BookTab, string> = { summary: 'Summary', pl: 'Profit and loss', cash: 'Cash', market: 'Market', plan: 'Plan' }

/**
 * The tab to open after `key` is pressed on `current`: ArrowRight and ArrowLeft move to the next and the previous tab and
 * wrap, Home and End jump to the first and the last. Any other key returns `current`. The row is horizontal, so the
 * arrows are mapped onto the vertical keys of the shared roving helper (src/ui/a11y/roving.ts) and the rest is its table.
 */
export function tabKey(current: BookTab, key: string): BookTab {
  let roving: string
  switch (key) {
    case 'ArrowRight':
      roving = 'ArrowDown'
      break
    case 'ArrowLeft':
      roving = 'ArrowUp'
      break
    case 'Home':
    case 'End':
      roving = key
      break
    default:
      return current
  }
  const to = rovingMove(BOOK_TABS.length, BOOK_TABS.indexOf(current), roving)
  return to === null ? current : (BOOK_TABS[to] ?? current)
}

export interface BookHead {
  businessName: string
  emoji: string
  /** null when the data had no usable year; the header then uses the year of the statement. */
  year: number | null
  industryLabel: string
  location: string
  marketNote: string
  /** The statement lines the text report prints; the Summary tab keeps them under "All the numbers". */
  lines: { label: string; value: string; tone: 'good' | 'bad' | 'neutral' }[]
}

const SUMMARY_NOTE = 'The headline numbers fill in after a booked year.'
const BRIDGE_NOTE = 'The profit bridge needs a year to compare with.'
const CASH_LINES_NOTE = 'The cash and debt lines need two booked years.'
const MARKET_NOTE = 'The market fills in after a booked year.'

/**
 * What a tab says about the charts it has no data for, or null when nothing it shows is missing. The words say where the
 * books start: a company in its first booked year has no bridge, no history and no cash walk yet, and a blank space would
 * read as a bug. At most 120 characters, ASCII punctuation only.
 */
export function missingNote(tab: BookTab, charts: ReportCharts): string | null {
  const starts = `History starts ${charts.year}.`
  switch (tab) {
    case 'summary':
      return charts.kpis.length === 0 ? SUMMARY_NOTE : null
    case 'pl': {
      const parts: string[] = []
      if (charts.bridge === undefined) parts.push(BRIDGE_NOTE)
      if (charts.profit === undefined || charts.costs === undefined) parts.push(starts)
      return parts.length > 0 ? parts.join(' ') : null
    }
    case 'cash':
      if (charts.cash === undefined) return `History starts ${charts.year}: the cash walk needs two booked years.`
      return charts.cashLines === undefined ? CASH_LINES_NOTE : null
    case 'market':
      if (charts.share === undefined && charts.ladder === undefined && charts.size === undefined) return MARKET_NOTE
      return charts.share === undefined || charts.size === undefined ? starts : null
    case 'plan':
      return null
  }
}

/** True when the report's data carries a `chart` that reads as the book's charts: the report then opens as a book. */
export function isBook(data: Json): boolean {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false
  return readReportCharts(Object.prototype.hasOwnProperty.call(data, 'chart') ? data.chart : undefined) !== null
}
