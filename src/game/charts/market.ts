// The market builders (R1 charts, G.1): a company's market history becomes a line of your share against the leader's, a
// tile of the market's size, and a ladder of the rivals. Pure: they read the MarketView the caller computed (the caller
// already imports marketViewOf, which this folder must not, because competition.ts sits inside the big import cycle) and
// write nothing, draw no random number and look at no year after the view's. Every change on the ladder comes from the
// history the market keeps, one year back; nothing here asks a rival where it is heading.
import type { MarketView } from '../business/competition'
import { topPairs } from '../business/competition-state'
import type { GameState } from '../types'
import { fit, moneyLabel, pctLabel, priceBasisYear, whole } from './money'
import { cleanText, ladderSpec, type RankSource } from './ranks'
import { reveal } from './reveal'
import { SPEC_LIMITS, type ChartSpec } from './spec'

/** The id of the player's own row. A rival that carries it is left out. */
const YOU = 'you'
/** Years of history the share line and the size tile draw (the market keeps this many rows). */
const HISTORY_ROWS = 20
/** Points of a rival's sparkline. */
const SPARK_ROWS = 10
const YEAR_MIN = 1
const YEAR_MAX = 9999
const MAX_RANK = 1_000_000
const NOUN_MAX = 40

/** One year of the market's history, with each number checked. A number that is not usable is null. */
interface Row {
  year: number
  share: number | null
  lead: number | null
  size: number | null
  rank: number | null
  /** The stored row, for its `top` list. */
  h: MarketView['history'][number]
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** A share held to 0 to 1 and rounded to 1e-6 (how the history keeps one), or null when it is not a number. */
function frac(v: unknown): number | null {
  return isNum(v) ? Math.round(Math.max(0, Math.min(1, v)) * 1e6) / 1e6 + 0 : null
}

/** '7.2%', '12%', '0.4%', '<0.1%': one digit under ten percent, none above. */
function shareLabel(f: number): string {
  return pctLabel(f, f < 0.1 ? 1 : 0).replace(/\.0%$/, '%')
}

/**
 * The view's history in year order, one row a year (the later one wins). A row that is not an object or has no sane year
 * is left out, so a damaged history gives fewer rows, not a throw. Not cut to length: each builder picks its own rows.
 */
function readRows(v: MarketView): Row[] {
  const list: unknown = v.history
  const byYear = new Map<number, Row>()
  if (Array.isArray(list)) {
    for (const item of list as unknown[]) {
      if (item === null || typeof item !== 'object') continue
      const h = item as MarketView['history'][number]
      if (!isNum(h.year)) continue
      const year = Math.round(h.year)
      if (year < YEAR_MIN || year > YEAR_MAX) continue
      const rank = isNum(h.rank) && Number.isInteger(h.rank) && h.rank >= 1 && h.rank <= MAX_RANK ? h.rank : null
      byYear.set(year, { year, share: frac(h.share), lead: frac(h.lead), size: isNum(h.size) && h.size >= 0 ? whole(h.size) : null, rank, h })
    }
  }
  return [...byYear.entries()].sort((p, q) => p[0] - q[0]).map((e) => e[1])
}

/** The market's noun as it reads in a title ('restaurant', 'AI'), or the empty string. */
function nounOf(v: MarketView): string {
  return cleanText(v.noun, NOUN_MAX)
}

// ---------------------------------------------------------------------------
// Share against the leader

/**
 * Your share and the leader's, year by year, up to twenty years (the market keeps twenty). The `leader` series is the
 * biggest rival's share, null in a year the history did not record one. Needs a booked market and two years with a
 * share of yours; otherwise null.
 */
export function shareSpec(_g: GameState, view: MarketView): ChartSpec | null {
  if (!view || view.booked !== true) return null
  const rows = readRows(view).filter((r) => r.share !== null).slice(-HISTORY_ROWS)
  if (rows.length < 2) return null
  const first = rows[0]!
  const last = rows[rows.length - 1]!
  let leader: number | null = null
  for (let i = rows.length - 1; i >= 0 && leader === null; i--) leader = rows[i]!.lead
  const noun = nounOf(view)
  const said = `Your share ${shareLabel(last.share!)}, ${leader === null ? '' : `the leader's ${shareLabel(leader)}, `}from ${first.year} to ${last.year}.`
  return reveal({
    v: 1,
    kind: 'line',
    title: fit(noun ? `Your share of the ${noun} market` : 'Your share of the market', 60),
    unit: 'pct',
    x: rows.map((r) => r.year),
    series: [
      { id: 'you', label: 'You', tone: 'c1', values: rows.map((r) => r.share) },
      { id: 'leader', label: 'Biggest rival', tone: 'c2', values: rows.map((r) => r.lead) },
    ],
    summary: fit(said),
  })
}

// ---------------------------------------------------------------------------
// Market size

/** 'growing 3% a year', 'shrinking 2% a year' or 'flat'; null when the view has no growth figure. */
function growthNote(growth: unknown): string | null {
  if (!isNum(growth)) return null
  const size = Math.abs(growth)
  if (size < 0.0005) return 'flat'
  return `${growth > 0 ? 'growing' : 'shrinking'} ${shareLabel(Math.min(1, size))} a year`
}

/**
 * The size of the market, year by year, as one KPI tile: the last year's size is the number, the years before are the
 * sparkline, and the note is how fast the market is growing. In the prices of the chart's basis year. Needs a booked
 * market whose last year has a size; otherwise null.
 */
export function marketSizeSpec(g: GameState, view: MarketView): ChartSpec | null {
  if (!view || view.booked !== true) return null
  const rows = readRows(view).slice(-HISTORY_ROWS)
  const last = rows[rows.length - 1]
  if (!last || last.size === null) return null
  const note = growthNote(view.growth)
  const shown = note === null ? null : fit(note, SPEC_LIMITS.note)
  return reveal({
    v: 1,
    kind: 'kpi',
    title: 'Market size',
    unit: 'money',
    x: rows.map((r) => r.year),
    series: [{ id: 'size', label: 'Market size', tone: 'c3', values: rows.map((r) => r.size) }],
    basis: priceBasisYear(g),
    ...(shown ? { note: shown } : {}),
    summary: fit(`Market size ${moneyLabel(g, last.size)} a year in ${last.year}${shown ? `, ${shown}` : ''}.`),
  })
}

// ---------------------------------------------------------------------------
// The rival ladder

/** One rival as the ladder needs it. */
interface Rival {
  id: string
  name: string
  share: number
}

/** The rivals of the view whose id, name and share can be read, biggest listed first as given, one a row and never the player's id. */
function readRivals(v: MarketView): Rival[] {
  const list: unknown = v.rivals
  const out: Rival[] = []
  if (!Array.isArray(list)) return out
  const seen = new Set<string>()
  for (const item of list as unknown[]) {
    if (item === null || typeof item !== 'object') continue
    const r = item as MarketView['rivals'][number]
    const id = r.id
    const share = frac(r.share)
    if (typeof id !== 'string' || id === '' || id === YOU || seen.has(id) || share === null) continue
    seen.add(id)
    out.push({ id, name: typeof r.name === 'string' ? r.name : '', share })
  }
  return out
}

/**
 * Last year's ladder, read from the previous history row only: its `top` list (the rivals it names) plus your share in
 * that row. The rivals' ranks are their places on that list with you put in by share. Your own rank is the row's `rank`
 * when it has one, since you may have stood outside the eight the list names; a rival that was not on the list has no
 * entry here and reads as new.
 */
function lastYear(prev: Row | undefined): { ranks: Record<string, number>; shares: Map<string, number> } {
  const ranks: Record<string, number> = Object.create(null) as Record<string, number>
  const shares = new Map<string, number>()
  if (!prev) return { ranks, shares }
  const field: { id: string; share: number; you: boolean }[] = []
  for (const [id, raw] of topPairs(prev.h)) {
    const share = frac(raw)
    if (share === null || id === YOU || shares.has(id)) continue
    shares.set(id, share)
    field.push({ id, share, you: false })
  }
  const named = field.length
  if (prev.share !== null) field.push({ id: YOU, share: prev.share, you: true })
  field.sort((a, b) => b.share - a.share || (a.you === b.you ? 0 : a.you ? -1 : 1))
  field.forEach((e, i) => {
    ranks[e.id] = i + 1
  })
  if (prev.rank !== null) ranks[YOU] = prev.rank
  else if (named === 0) delete ranks[YOU]
  return { ranks, shares }
}

/**
 * Who holds the market: you and the named rivals by share, rank 1 and up, cut to the top five and you with two
 * neighbours each side (never more than twelve). The change is against the previous history row; a rival that was not
 * in its top eight reads as new, and the first booked year has nothing to compare with, so every row reads new. Each
 * row's sparkline is that player's share in each of the last ten history rows, null where a rival was not named. The
 * rivals' names arrive already masked (adultBrandName); `youName` is the player's company. Needs a booked market.
 */
export function marketLadderSpec(_g: GameState, view: MarketView, youName: string): ChartSpec | null {
  if (!view || view.booked !== true) return null
  const history = readRows(view)
  const rivals = readRivals(view)
  const now = frac(view.share) ?? 0

  // The row for the year the shares are for is the last one; the one before it is last year's.
  const current = isNum(view.year) ? view.year : (history[history.length - 1]?.year ?? 0)
  let prev: Row | undefined
  for (let i = history.length - 1; i >= 0 && !prev; i--) if (history[i]!.year < current) prev = history[i]
  const before = lastYear(prev)

  const recent = history.slice(-SPARK_ROWS)
  const named = recent.map((r) => new Map(topPairs(r.h).map(([id, s]): [string, number | null] => [id, frac(s)])))
  const sources: RankSource[] = [
    { id: YOU, name: youName, value: now, prev: prev?.share ?? null, history: recent.map((r) => r.share), you: true },
    ...rivals.map((r): RankSource => ({
      id: r.id,
      name: r.name,
      value: r.share,
      prev: before.shares.get(r.id) ?? null,
      history: named.map((m) => m.get(r.id) ?? null),
    })),
  ]

  // Where you stand, for the summary (a tie goes to you, as it does on the ladder).
  const noun = nounOf(view)
  const market = noun ? `${noun} market` : 'market'
  const rank = 1 + rivals.filter((r) => r.share > now).length
  const leader = rivals.reduce<Rival | null>((top, r) => (top === null || r.share > top.share ? r : top), null)
  const leaderName = leader ? cleanText(leader.name, SPEC_LIMITS.label) || 'The leader' : ''
  let said: string
  if (leader === null) said = `You hold ${shareLabel(now)} of the ${market}.`
  else if (rank === 1) said = `You lead the ${market} with ${shareLabel(now)}. ${leaderName} is next with ${shareLabel(leader.share)}.`
  else said = `You're #${rank} in the ${market} with ${shareLabel(now)}. ${leaderName} leads with ${shareLabel(leader.share)}.`

  return ladderSpec({
    title: fit(noun ? `Who holds the ${noun} market` : 'Who holds the market', 60),
    unit: 'pct',
    rows: sources,
    prevRanks: before.ranks,
    summary: said,
  })
}
