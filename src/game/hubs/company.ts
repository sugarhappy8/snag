// The company cockpit (G.5). businessView lists 39 or more rows in one flat list. With FLAGS.cockpits on, the company
// screen keeps its top (who, a KPI row, market, health and the small groups) and folds the four long sections into tiles:
// Run, Money, Leadership and Exit. The tiles hold the same nodes in the same order, so a walk of the menu reaches the
// same actions in the same sequence (the seeded drivers pick actions by position). Nothing here moves a number.
//
// Pure, like every hub: no draw, no write to the game, and no foresight (only settled years and the live books). The
// flat list and the way to rebuild it come in as arguments, because a hub must not import manage.ts (that would put it
// in the 30-module import cycle); manage.ts businessScreen passes both. The tiles ask `rebuild` again each time they
// are opened, because MenuSheet re-resolves the open group from the latest state on every render and a part cut once
// would go stale after the first action.
import { industryDef } from '../business/industries'
import { findBusiness, HISTORY_ROWS, readBiz, runsIt, totalOutlets } from '../business/state'
import { money, plural } from '../business/util'
import { fit, moneyLabel, priceBasisYear } from '../charts/money'
import { reveal } from '../charts/reveal'
import { CHART_LIMITS, SPEC_LIMITS, type ChartSpec } from '../charts/spec'
import { flagOn } from '../flags'
import type { Asset, GameState, MenuGroup, MenuInfo, MenuNode } from '../types'

/** Every hub group (a cockpit tile) has an id that starts with this, so a walk can leave it out of a path. */
export const HUB_PREFIX = 'hub.'

type TileKey = 'run' | 'money' | 'lead' | 'exit'

const TILE_KEYS: readonly TileKey[] = ['run', 'money', 'lead', 'exit']
const TILE_LABEL: Readonly<Record<TileKey, string>> = { run: 'Run', money: 'Money', lead: 'Leadership', exit: 'Exit' }
const GEAR = '\u{2699}\u{FE0F}'
const TILE_EMOJI: Readonly<Record<Exclude<TileKey, 'run'>, string>> = { money: '\u{1F4B0}', lead: '\u{1F454}', exit: '\u{1F6AA}' }
const BAR = '\u{00B7}'
/** Tile subtitles are at most this long. */
const SUBTITLE_MAX = 60
/** A company's name in a title and a summary is cut to this, so the numbers always fit. */
const NAME_MAX = 30

/** The ids of the KPI row and the four tiles of one company. */
export function hubIds(assetId: string): { kpi: string; run: string; money: string; lead: string; exit: string } {
  return {
    kpi: `${HUB_PREFIX}biz.kpi.${assetId}`,
    run: `${HUB_PREFIX}biz.run.${assetId}`,
    money: `${HUB_PREFIX}biz.money.${assetId}`,
    lead: `${HUB_PREFIX}biz.lead.${assetId}`,
    exit: `${HUB_PREFIX}biz.exit.${assetId}`,
  }
}

// ---------------------------------------------------------------------------
// The KPI spec

/** A whole-dollar number a spec can carry, or null when the books hold no usable number there. */
function amount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= SPEC_LIMITS.magnitude ? Math.round(v) + 0 : null
}

/** A year as a whole number, or null when it is not a sane year. */
function yearOf(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const year = Math.round(v)
  return year >= 1 && year <= 9999 ? year : null
}

/** The name for a title: no control character, cut short, and a word when there is none. */
function plainName(name: unknown): string {
  const raw = typeof name === 'string' ? name : ''
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean === '' ? 'Your company' : fit(clean, NAME_MAX)
}

function lastReal(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null && v !== undefined) return v
  }
  return null
}

interface Point {
  year: number
  sales: number | null
  net: number | null
  cash: number | null
  value: number | null
}

/**
 * The company's settled years in year order, one a year (the later row wins), at most HISTORY_ROWS. A row that is not an
 * object or has no sane year is left out. The statement is the book of record for its own year: its sales and net profit
 * stand in that year's point, and a statement whose year has no row gets one.
 */
function points(history: unknown, last: { year: number; revenue: number; net: number }): Point[] {
  const byYear = new Map<number, Point>()
  if (Array.isArray(history)) {
    for (const item of history as unknown[]) {
      if (item === null || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      const year = yearOf(r.year)
      if (year === null) continue
      byYear.set(year, { year, sales: amount(r.revenue), net: amount(r.profit), cash: amount(r.cash), value: amount(r.valuation) })
    }
  }
  const year = yearOf(last.year)
  if (year !== null) {
    const row = byYear.get(year)
    byYear.set(year, { year, sales: amount(last.revenue) ?? row?.sales ?? null, net: amount(last.net) ?? row?.net ?? null, cash: row?.cash ?? null, value: row?.value ?? null })
  }
  return [...byYear.values()].sort((p, q) => p.year - q.year).slice(-Math.min(HISTORY_ROWS, CHART_LIMITS.points - 1))
}

/**
 * Four tiles for a company's cockpit: Sales, Net profit, Cash and Value, each a series of its settled years and one more
 * point, 'now'. Sales and net profit are the years' books and have a gap at 'now'; cash and value end at the live cash and
 * valuation, so each tile's number is the one the Annual Report prints. A year whose books have no cash (a row from before
 * R1) is a gap. Null when the company has no settled year, or when nothing in the books is a number a spec can carry.
 * Values are internal dollars; the labels are formatted by the money context of the life. Like every builder it goes
 * through reveal (R3 hides what the player has not learned) and names its price basis.
 */
export function companyKpiSpec(g: GameState, a: Asset): ChartSpec | null {
  const b = readBiz(g, a)
  const last = b.last
  if (!last) return null
  const rows = points(b.history, last)
  const sales = [...rows.map((p) => p.sales), null]
  const net = [...rows.map((p) => p.net), null]
  const cash = [...rows.map((p) => p.cash), amount(b.cash)]
  const value = [...rows.map((p) => p.value), amount(b.valuation)]
  if (![sales, net, cash, value].some((line) => line.some((v) => v !== null))) return null

  const m = (n: number): string => moneyLabel(g, n)
  const name = plainName(a.name)
  const parts: string[] = []
  const nSales = lastReal(sales)
  const nNet = lastReal(net)
  const nCash = lastReal(cash)
  const nValue = lastReal(value)
  if (nSales !== null) parts.push(`sales ${m(nSales)}`)
  if (nNet !== null) parts.push(`net ${nNet < 0 ? 'loss' : 'profit'} ${m(Math.abs(nNet))}`)
  if (nCash !== null) parts.push(`cash ${m(nCash)}`)
  if (nValue !== null) parts.push(`value ${m(nValue)}`)

  return reveal({
    v: 1,
    kind: 'kpi',
    title: fit(`${name}: at a glance`, CHART_LIMITS.title),
    unit: 'money',
    x: [...rows.map((p) => p.year), 'now'],
    series: [
      { id: 'sales', label: 'Sales', tone: 'c1', values: sales },
      { id: 'net', label: 'Net profit', tone: last.net < 0 ? 'bad' : 'good', values: net },
      { id: 'cash', label: 'Cash', tone: 'c3', values: cash },
      { id: 'value', label: 'Value', tone: 'c2', values: value },
    ],
    basis: priceBasisYear(g),
    summary: fit(`${name}: ${parts.join(', ')}.`),
  })
}

// ---------------------------------------------------------------------------
// The tile subtitles

interface Facts {
  emoji: string
  sites: number
  site: string
  sitePlural: string
  staff: number
  cash: number
  debt: number
  ceo: 'you' | 'hired' | 'none'
  skill: number | null
  value: number
  listed: boolean
}

// Four tiles ask for the same few numbers: one read of the books per committed state (a new commit is a new object).
const factsMemo = new WeakMap<GameState, Map<string, Facts | null>>()

function factsOf(g: GameState, assetId: string): Facts | null {
  let seen = factsMemo.get(g)
  if (!seen) {
    seen = new Map()
    factsMemo.set(g, seen)
  }
  if (seen.has(assetId)) return seen.get(assetId) ?? null
  const asset = findBusiness(g, assetId)
  let out: Facts | null = null
  if (asset) {
    const b = readBiz(g, asset)
    const def = industryDef(b.industry)
    out = {
      emoji: def.emoji || GEAR,
      sites: totalOutlets(b),
      site: def.site,
      sitePlural: def.sitePlural,
      staff: b.employees + b.staff.length,
      cash: b.cash,
      debt: b.debt,
      ceo: runsIt(g, asset) ? 'you' : b.ceo === 'manager' && b.manager ? 'hired' : 'none',
      skill: b.manager && Number.isFinite(b.manager.skill) ? Math.round(b.manager.skill) : null,
      value: b.valuation,
      listed: b.public,
    }
  }
  seen.set(assetId, out)
  return out
}

function subtitleFor(which: TileKey, f: Facts | null): string {
  if (!f) return ''
  let text: string
  switch (which) {
    case 'run':
      text = `${plural(f.sites, f.site, f.sitePlural || f.site)} ${BAR} ${f.staff.toLocaleString('en-US')} staff`
      break
    case 'money':
      text = `Cash ${money(f.cash)}${f.debt > 0 ? ` ${BAR} debt ${money(f.debt)}` : ''}`
      break
    case 'lead':
      text = f.ceo === 'you' ? 'You are CEO' : f.ceo === 'hired' ? `Hired CEO${f.skill === null ? '' : ` ${BAR} skill ${f.skill}`}` : 'No CEO'
      break
    case 'exit':
      text = f.listed ? `Listed ${BAR} ${money(f.value)}` : `Worth ${money(f.value)}`
      break
  }
  return fit(text, SUBTITLE_MAX)
}

// ---------------------------------------------------------------------------
// The partition

/** Where each section starts in the flat list (-1 when its heading is not there). Run starts at either of its two headings. */
function marks(list: readonly MenuNode[], assetId: string): Record<TileKey, number> {
  const at = (heading: string): number => list.findIndex((n) => n.type === 'heading' && n.id === heading)
  const run = at(`biz.runH.${assetId}`)
  return { run: run >= 0 ? run : at(`biz.financeH.${assetId}`), money: at(`biz.moneyH.${assetId}`), lead: at(`biz.leadH.${assetId}`), exit: at(`biz.exitH.${assetId}`) }
}

/** One section of a flat list: from its heading to the next known heading, or to the end. */
function partOf(list: readonly MenuNode[], assetId: string, which: TileKey): MenuNode[] {
  const m = marks(list, assetId)
  const start = m[which]
  if (start < 0) return []
  let end = list.length
  for (const k of TILE_KEYS) if (m[k] > start && m[k] < end) end = m[k]
  return list.slice(start, end)
}

function tile(g: GameState, a: Asset, which: TileKey, rebuild: (g: GameState) => MenuNode[] | null): MenuGroup {
  const id = a.id
  const emoji = which === 'run' ? (factsOf(g, id)?.emoji ?? GEAR) : TILE_EMOJI[which]
  return {
    type: 'menu',
    id: hubIds(id)[which],
    label: TILE_LABEL[which],
    emoji,
    subtitle: (gg) => subtitleFor(which, factsOf(gg, id)),
    children: (gg) => {
      const flat = rebuild(gg)
      return flat ? partOf(flat, id, which) : [{ type: 'info', id: `${HUB_PREFIX}biz.gone.${id}`, text: 'You no longer own this business.' }]
    },
  }
}

function textOf(n: MenuNode, g: GameState): string {
  return n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''
}

/** The KPI row: the old money and results words as its text, the spec as its chart, drawn from the state it is asked with. */
function kpiRow(g: GameState, a: Asset, first: ChartSpec, text: string): MenuInfo {
  const id = hubIds(a.id).kpi
  const assetId = a.id
  const memo = new WeakMap<GameState, ChartSpec | null>([[g, first]])
  return {
    type: 'info',
    id,
    emoji: '\u{1F4CA}',
    text,
    chart: (gg) => {
      if (memo.has(gg)) return memo.get(gg) ?? null
      let out: ChartSpec | null = null
      try {
        const cur = findBusiness(gg, assetId)
        out = cur ? companyKpiSpec(gg, cur) : null
      } catch (err) {
        console.error(`[menu] chart(${id}) failed:`, err)
      }
      memo.set(gg, out)
      return out
    },
  }
}

/**
 * The company screen. With FLAGS.cockpits off, or when none of the four section headings of businessView is in `flat`,
 * it is `flat` itself. Otherwise: the top of the flat list (who, the KPI row in place of the money and results rows when a
 * settled year gives a spec, market, health, then the other nodes before the first section), and one tile for each section
 * that is there. `rebuild` gives the flat list of the latest state, or null when the asset is gone.
 */
export function companyScreen(g: GameState, a: Asset, flat: MenuNode[], rebuild: (g: GameState) => MenuNode[] | null): MenuNode[] {
  if (!flagOn('cockpits')) return flat
  const m = marks(flat, a.id)
  const present = TILE_KEYS.filter((k) => m[k] >= 0)
  if (present.length === 0) return flat
  const zone = flat.slice(0, Math.min(...present.map((k) => m[k])))

  let spec: ChartSpec | null = null
  try {
    spec = companyKpiSpec(g, a)
  } catch (err) {
    console.error(`[menu] companyKpiSpec(${a.id}) failed:`, err)
  }
  const old = new Set<string>([`biz.dash.money.${a.id}`, `biz.dash.results.${a.id}`])
  const replaced = spec ? zone.filter((n) => n.type === 'info' && old.has(n.id)) : []
  const top: MenuNode[] = []
  for (const n of zone) {
    if (!replaced.includes(n)) top.push(n)
    // The KPI row stands where the first of the two old rows was.
    else if (spec && n === replaced[0]) top.push(kpiRow(g, a, spec, replaced.map((r) => textOf(r, g)).join(' | ')))
  }
  return [...top, ...present.map((k) => tile(g, a, k, rebuild))]
}
