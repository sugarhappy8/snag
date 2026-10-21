// "Books and Charts" on a company screen (R1 charts, C13): the Profit and Loss waterfall, why profit changed, the profit
// history, the cost structure, the cash walk, cash and debt, and the share of the market, each one chart row. The
// Annual Report shows the same charts once a year; this puts them one tap from the company, and it serves every kind of
// company (a studio, a lab, a bank and a fund book the same statement). Pure reads of settled years: nothing here
// writes state, draws a random number or looks past the statement's year. manage.ts adds the group only while chartKit
// is on, and chartInfo gives no rows without it.
import { bridgeSpec, cashLinesSpec, cashWalkSpec, chartInfo, costShareSpec, moneyLabel, plSpec, profitSpec, shareSpec } from '../charts'
import type { ChartSpec } from '../charts/spec'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { marketViewOf } from './competition'
import { findBusiness, readBiz, type BizState } from './state'

interface BooksRow {
  /** The last part of the row id: `biz.books.{key}.{assetId}`. */
  key: string
  emoji: string
  /** What the row says when its chart cannot be drawn yet. */
  none: string
  build: (g: GameState, b: BizState) => ChartSpec | null
}

/** The rows in the order they show. Each `none` is one plain sentence of at most 120 characters. */
const ROWS: readonly BooksRow[] = [
  { key: 'pl', emoji: '\u{1F9FE}', none: 'The profit and loss needs a settled year.', build: plSpec },
  { key: 'bridge', emoji: '\u{1F50E}', none: 'Why profit changed needs two booked years.', build: bridgeSpec },
  { key: 'profit', emoji: '\u{1F4C8}', none: 'Profit by year needs two booked years.', build: profitSpec },
  { key: 'costs', emoji: '\u{1F9EE}', none: 'Where each dollar goes needs two years with full books.', build: costShareSpec },
  { key: 'cash', emoji: '\u{1F4B5}', none: 'The cash walk needs two booked years.', build: cashWalkSpec },
  { key: 'cashlines', emoji: '\u{1F3E6}', none: 'Cash and debt needs two booked years.', build: cashLinesSpec },
  // The share builder takes the market view (charts never import competition.ts); the caller computes it.
  { key: 'share', emoji: '\u{1F3AF}', none: 'The share of the market needs two booked years in a market.', build: (g, b) => shareSpec(g, marketViewOf(g, b)) },
]

const FILLS_IN = 'Fills in after the first full year'

/** A company has books once it has a statement or a year of history. */
function booked(b: BizState): boolean {
  return !!b.last || b.history.length > 0
}

export function booksMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.books.${a.id}`,
    label: 'Books and Charts',
    emoji: '\u{1F4CA}',
    subtitle: (g) => {
      const cur = findBusiness(g, a.id)
      const last = cur ? readBiz(g, cur).last : null
      return last && Number.isFinite(last.year) && Number.isFinite(last.net) ? `${last.year} net profit ${moneyLabel(g, last.net)}` : FILLS_IN
    },
    children: (g): MenuNode[] => {
      const cur = findBusiness(g, a.id)
      if (!cur) return []
      if (!booked(readBiz(g, cur))) return [{ type: 'info', id: `biz.books.empty.${a.id}`, emoji: '\u{1F4CA}', text: 'The books fill in after the first full year.' }]
      return ROWS.flatMap((row) =>
        chartInfo(
          `biz.books.${row.key}.${a.id}`,
          row.emoji,
          (_g, spec) => spec?.summary ?? row.none,
          (gg) => {
            // Read the company from the state the row is drawn with, so a chart never shows another year's books.
            const live = findBusiness(gg, a.id)
            return live ? row.build(gg, readBiz(gg, live)) : null
          },
        ),
      )
    },
  }
}
