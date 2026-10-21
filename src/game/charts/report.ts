// The Annual Report assembler (R1 charts, G.4 builder side): one company's books become the charts of the Annual Report
// 2.0 book, in one plain JSON value the report's data carries as `chart`. Four KPI tiles, a one-line verdict, the Profit
// and Loss waterfall in a short and a full version, and whichever of the history, cash and market charts the company has
// the books for. Pure: it reads settled years and writes nothing, draws no random number and looks at no year after the
// statement's. It imports the C4 to C6 builders and types only, never yearly, manage, economy or competition.
//
// Every member is built on its own, so one builder's bug drops one member and never the report, and every member is
// passed through readChartSpec before it is kept, so what leaves here is what the reader accepts. The reader below is for
// the other end: a queued modal can come from an old save or a hostile blob, and the book must never trust it.
import type { MarketView } from '../business/competition'
import type { BizState } from '../business/state'
import type { Asset, GameState } from '../types'
import { cashLinesSpec, cashWalkSpec, companyKpis, costShareSpec, profitSpec } from './books'
import { marketLadderSpec, marketSizeSpec, shareSpec } from './market'
import { priceBasisYear } from './money'
import { bridgeSpec, plSpec, plSummarySpec, profitVerdict } from './pl'
import { readChartSpec, type ChartSpec } from './spec'

export interface ReportCharts {
  v: 1
  /** The year of the statement the report covers. */
  year: number
  /** The price year of the money charts (the same number each multi-year member carries). */
  basis: number
  /** One line on the year, at most 120 characters. */
  verdict: string
  /** The four tiles, kind 'kpi' with one series each: Net profit, Sales, Cash, Value. */
  kpis: ChartSpec[]
  /** The Profit and Loss waterfall with its five biggest rows. */
  summary: ChartSpec
  /** The full Profit and Loss waterfall. */
  pl: ChartSpec
  bridge?: ChartSpec
  profit?: ChartSpec
  costs?: ChartSpec
  cash?: ChartSpec
  cashLines?: ChartSpec
  share?: ChartSpec
  ladder?: ChartSpec
  size?: ChartSpec
}

/** The members that may be missing, in the order the book reads them. */
const OPTIONAL = ['bridge', 'profit', 'costs', 'cash', 'cashLines', 'share', 'ladder', 'size'] as const
type OptionalKey = (typeof OPTIONAL)[number]

const KPI_MAX = 4
const VERDICT_MAX = 120
const YEAR_MIN = 1
const YEAR_MAX = 9999
/** The same price-year range the spec reader allows, so a report that builds always reads back. */
const BASIS_MIN = 1800
const BASIS_MAX = 2300

// ---------------------------------------------------------------------------
// Small readers

function plain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** An own property, so nothing is ever read through the prototype chain. */
function own(o: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined
}

function integerIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

/** The text when it is a string of at most 120 characters with no control character; otherwise the empty string. */
function verdictText(v: unknown): string {
  if (typeof v !== 'string' || v.length > VERDICT_MAX) return ''
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32 || v.charCodeAt(i) === 127) return ''
  return v
}

/** A one-series KPI tile the reader accepts, or null. */
function readTile(v: unknown): ChartSpec | null {
  const spec = readChartSpec(v)
  return spec !== null && spec.kind === 'kpi' && spec.series.length === 1 ? spec : null
}

/**
 * The valid tiles among the first four entries. Anything past the fourth is not read at all, so a hostile ten-thousand
 * entry list costs the same as a list of four; a value that is not a list gives no tiles.
 */
function readTiles(v: unknown): ChartSpec[] {
  if (!Array.isArray(v)) return []
  const out: ChartSpec[] = []
  const n = Math.min(v.length, KPI_MAX)
  for (let i = 0; i < n; i++) {
    const tile = readTile(v[i])
    if (tile) out.push(tile)
  }
  return out
}

// ---------------------------------------------------------------------------
// The reader

/**
 * Read the `chart` of a report's data, which nobody vouches for (a queued modal, an old save). Returns a fresh object, or
 * null when the report cannot be drawn at all: the value is not a version 1 object, `year` or `basis` is not a whole
 * number in range, or `pl` or `summary` is not a spec the chart reader accepts. Otherwise it keeps what is good and drops
 * what is not: a tile that is not a one-series KPI is dropped (only the first four entries are looked at), an optional
 * member the chart reader refuses is dropped, and a verdict that is not a string of at most 120 characters reads as the
 * empty string. Keys it does not know are dropped. It never throws.
 */
export function readReportCharts(json: unknown): ReportCharts | null {
  try {
    if (!plain(json) || own(json, 'v') !== 1) return null
    const year = integerIn(own(json, 'year'), YEAR_MIN, YEAR_MAX)
    const basis = integerIn(own(json, 'basis'), BASIS_MIN, BASIS_MAX)
    if (year === null || basis === null) return null
    const pl = readChartSpec(own(json, 'pl'))
    const summary = readChartSpec(own(json, 'summary'))
    if (pl === null || summary === null) return null
    const out: ReportCharts = { v: 1, year, basis, verdict: verdictText(own(json, 'verdict')), kpis: readTiles(own(json, 'kpis')), summary, pl }
    for (const key of OPTIONAL) {
      const spec = readChartSpec(own(json, key))
      if (spec !== null) out[key] = spec
    }
    return out
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The assembler

/** A member's spec as the reader would hand it back, or null when the builder has nothing, throws or builds a bad spec. */
function member(build: () => ChartSpec | null): ChartSpec | null {
  try {
    return readChartSpec(build())
  } catch {
    return null
  }
}

/** The market view when it is booked; the market members and the rank note need one. */
function bookedView(view: MarketView | null): MarketView | null {
  try {
    return view !== null && view !== undefined && view.booked === true ? view : null
  } catch {
    return null
  }
}

/**
 * Everything the Annual Report 2.0 book draws for one company: the four tiles, the verdict, the Profit and Loss in two
 * sizes, and the history, cash and market charts the books can support (a company with v4.0.2 history has the profit line
 * and no cash or cost detail). `b` is a normalized copy of the company (readBiz), so a damaged saved history never reaches
 * a builder, and `view` is marketViewOf for that company or null; the market members, and the rank on the Value tile, are
 * left out when it is null or not booked. Null when the company has no statement yet or its Profit and Loss cannot be built.
 * It never throws.
 */
export function reportCharts(g: GameState, a: Asset, b: BizState, view: MarketView | null): ReportCharts | null {
  try {
    const last = b.last
    if (!last) return null
    const year = integerIn(last.year, YEAR_MIN, YEAR_MAX)
    const basis = integerIn(priceBasisYear(g), BASIS_MIN, BASIS_MAX)
    if (year === null || basis === null) return null
    const pl = member(() => plSpec(g, b))
    const summary = member(() => plSummarySpec(g, b))
    if (pl === null || summary === null) return null

    const market = bookedView(view)
    let kpis: ChartSpec[] = []
    try {
      kpis = companyKpis(g, b, market)
        .map(readTile)
        .filter((t): t is ChartSpec => t !== null)
        .slice(0, KPI_MAX)
    } catch {
      kpis = []
    }
    let verdict = ''
    try {
      verdict = verdictText(profitVerdict(g, b))
    } catch {
      verdict = ''
    }

    const out: ReportCharts = { v: 1, year, basis, verdict, kpis, summary, pl }
    const add = (key: OptionalKey, build: () => ChartSpec | null): void => {
      const spec = member(build)
      if (spec !== null) out[key] = spec
    }
    add('bridge', () => bridgeSpec(g, b))
    add('profit', () => profitSpec(g, b))
    add('costs', () => costShareSpec(g, b))
    add('cash', () => cashWalkSpec(g, b))
    add('cashLines', () => cashLinesSpec(g, b))
    if (market !== null) {
      add('share', () => shareSpec(g, market))
      add('ladder', () => marketLadderSpec(g, market, a.name))
      add('size', () => marketSizeSpec(g, market))
    }
    return out
  } catch {
    return null
  }
}
