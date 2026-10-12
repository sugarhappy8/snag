// Company milestones: the first profitable year, sales of $1M to $1B, 10 to 1,000 locations, #1 in
// the market, a $1B valuation, the IPO and the big anniversaries. Checked once a year after the
// books close (yearly.ts); new ones bring a small reward, a log line and at most one popup a year
// for all companies together. Stored in BizState.milestones (plain JSON: { id: year reached }).
import { addHidden, addStat, count, log, notice } from '../core'
import type { Asset, GameState, Json, MenuGroup, MenuNode, NoticeModal } from '../types'
import { marketViewOf } from './competition'
import { isFinanceFirm } from './finance-firm'
import { franchiseUnits } from './franchise'
import { findBusiness, readBiz, totalOutlets, type BizState } from './state'
import { clampN, money, num, rec } from './util'

export interface MilestoneDef {
  id: string
  emoji: string
  /** 'First profitable year'. */
  label: string
  /** Also worth a little fame (big news, not just a nice day at the office). */
  famous?: boolean
  /** How far along the company is, 0-1 (1: reached). Pure. */
  progress: (g: GameState, b: BizState) => number
  /** 'now $891K' for the next-up list. */
  now?: (g: GameState, b: BizState) => string
}

/** Own outlets plus franchised ones: every place customers find the brand. */
export function locationsOf(b: BizState): number {
  return totalOutlets(b) + franchiseUnits(b)
}

function sales(b: BizState): number {
  return Math.max(0, b.last?.revenue ?? 0)
}

function age(g: GameState, b: BizState): number {
  return Math.max(0, g.year - b.founded)
}

function revenue(id: string, amount: number, label: string, famous = false): MilestoneDef {
  return { id, emoji: '\u{1F4B0}', label, famous, progress: (_g, b) => sales(b) / amount, now: (_g, b) => `now ${money(sales(b))}` }
}

function locations(id: string, n: number): MilestoneDef {
  return { id, emoji: '\u{1F4CD}', label: `${n.toLocaleString('en-US')} locations`, famous: n >= 1_000, progress: (_g, b) => locationsOf(b) / n, now: (_g, b) => `now ${locationsOf(b).toLocaleString('en-US')}` }
}

function anniversary(id: string, years: number): MilestoneDef {
  return { id, emoji: '\u{1F382}', label: `${years} years in business`, famous: years >= 50, progress: (g, b) => age(g, b) / years, now: (g, b) => `${age(g, b)} so far` }
}

/** #1 in its market: a booked market where nobody sells more (finance markets aren't ranked here). */
function topOfMarket(g: GameState, b: BizState): boolean {
  if (isFinanceFirm(b)) return false
  const v = marketViewOf(g, b)
  return v.booked && v.share > 0 && v.rank === 1
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'profit', emoji: '\u{1F4B5}', label: 'First profitable year', progress: (_g, b) => ((b.last?.net ?? 0) > 0 || b.history.some((r) => r.profit > 0) ? 1 : 0) },
  revenue('rev1m', 1_000_000, '$1M in yearly sales'),
  revenue('rev10m', 10_000_000, '$10M in yearly sales'),
  revenue('rev100m', 100_000_000, '$100M in yearly sales', true),
  revenue('rev1b', 1_000_000_000, '$1B in yearly sales', true),
  locations('loc10', 10),
  locations('loc100', 100),
  locations('loc1000', 1_000),
  { id: 'top1', emoji: '\u{1F947}', label: '#1 in its market', famous: true, progress: (g, b) => (topOfMarket(g, b) ? 1 : 0), now: (g, b) => (isFinanceFirm(b) ? '' : `now #${marketViewOf(g, b).rank}`) },
  { id: 'unicorn', emoji: '\u{1F984}', label: 'Worth $1 billion (a unicorn)', famous: true, progress: (_g, b) => Math.max(0, b.valuation) / 1_000_000_000, now: (_g, b) => `now ${money(Math.max(0, b.valuation))}` },
  { id: 'ipo', emoji: '\u{1F514}', label: 'Listed on a stock exchange', famous: true, progress: (_g, b) => (b.public || b.ipoYear > 0 ? 1 : 0) },
  anniversary('age10', 10),
  anniversary('age25', 25),
  anniversary('age50', 50),
]

/** Milestones reached: id → calendar year (pure; old saves have none). */
export function readMilestones(b: Pick<BizState, 'milestones'>): Record<string, number> {
  const d = rec(b.milestones)
  const out: Record<string, number> = {}
  if (!d) return out
  for (const m of MILESTONES) {
    const y = num(d[m.id], NaN)
    if (Number.isFinite(y)) out[m.id] = Math.round(y)
  }
  return out
}

function reached(g: GameState, b: BizState, m: MilestoneDef): boolean {
  const p = m.progress(g, b)
  return Number.isFinite(p) && p >= 1
}

export interface MilestoneHit {
  assetId: string
  company: string
  id: string
}

const TITLE = 'Milestones!'

/** Happiness per milestone, and the most one year's popup can give. */
const JOY = 2
const JOY_MAX = 6
const FAME_MAX = 3

/**
 * Check one company after its year is booked: record what it reached, log it, reward it and add it
 * to this year's single milestone popup. A company from an old save (or one bought with a past)
 * records what it had already achieved without a party: only new achievements are celebrated.
 */
export function milestoneYear(g: GameState, a: Asset, b: BizState): MilestoneHit[] {
  if (!g.character.alive) return []
  const known = rec(b.milestones) !== null
  const done = readMilestones(b)
  const fresh: MilestoneDef[] = []
  for (const m of MILESTONES) {
    if (done[m.id] !== undefined || !reached(g, b, m)) continue
    done[m.id] = g.year
    fresh.push(m)
  }
  b.milestones = done as unknown as Json
  // First look at a company with years behind it: catch up quietly.
  if (!known && (b.history.length >= 2 || b.acquired)) return []
  if (!fresh.length) return []
  for (const m of fresh) log(g, `${a.name}: ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}!`, 'good')
  count(g, 'bizMilestones', fresh.length)
  const hits = fresh.map((m) => ({ assetId: a.id, company: a.name, id: m.id }))
  announce(g, hits)
  return hits
}

/** Add milestones to this year's popup (one for all companies), with a small, capped reward. */
function announce(g: GameState, hits: MilestoneHit[]): void {
  const lines = hits.map((h) => {
    const m = MILESTONES.find((x) => x.id === h.id)!
    return `${m.emoji} ${h.company}: ${m.label}`
  })
  const flag = rec(g.flags['biz.milestonePopup'])
  const sameYear = flag && num(flag.year) === g.year
  const joyUsed = sameYear ? num(flag!.joy) : 0
  const fameUsed = sameYear ? num(flag!.fame) : 0
  const joy = clampN(hits.length * JOY, 0, Math.max(0, JOY_MAX - joyUsed))
  const famous = hits.filter((h) => MILESTONES.find((x) => x.id === h.id)?.famous).length
  const fame = clampN(famous, 0, Math.max(0, FAME_MAX - fameUsed))
  if (joy > 0) addStat(g, 'happiness', joy)
  if (fame > 0) addHidden(g, 'fame', fame)
  g.flags['biz.milestonePopup'] = { year: g.year, joy: joyUsed + joy, fame: fameUsed + fame }
  const open = g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === TITLE && m.text.startsWith(`${g.year}:`))
  if (open) {
    open.text = `${open.text}\n${lines.join('\n')}`
    return
  }
  notice(g, TITLE, `${g.year}: ${hits.length > 1 ? 'Big days at the office.' : 'A big day at the office.'}\n${lines.join('\n')}`, { emoji: '\u{1F3C6}', tone: 'good' })
}

// ---------------------------------------------------------------------------
// The Milestones submenu (pure)

/** 'Milestones (3/14)'. */
export function milestoneCount(b: BizState): { done: number; total: number } {
  const done = readMilestones(b)
  return { done: MILESTONES.filter((m) => done[m.id] !== undefined).length, total: MILESTONES.length }
}

/** The milestones not reached yet, closest first (finance firms skip the market rank). */
export function nextMilestones(g: GameState, b: BizState, n = 3): { m: MilestoneDef; progress: number }[] {
  const done = readMilestones(b)
  return MILESTONES.filter((m) => done[m.id] === undefined && !(m.id === 'top1' && isFinanceFirm(b)))
    .map((m) => ({ m, progress: clampN(m.progress(g, b), 0, 0.999) }))
    .sort((x, y) => y.progress - x.progress || MILESTONES.indexOf(x.m) - MILESTONES.indexOf(y.m))
    .slice(0, n)
}

export function milestonesMenu(a: Asset): MenuGroup {
  const live = (g: GameState) => findBusiness(g, a.id) ?? a
  return {
    type: 'menu',
    id: `biz.milestones.${a.id}`,
    label: 'Milestones',
    emoji: '\u{1F3C6}',
    subtitle: (g) => {
      const c = milestoneCount(readBiz(g, live(g)))
      return `${c.done} of ${c.total} reached`
    },
    children: (g) => {
      const b = readBiz(g, live(g))
      const done = readMilestones(b)
      const nodes: MenuNode[] = [{ type: 'heading', id: `biz.ms.nextH.${a.id}`, label: 'Next up' }]
      const next = nextMilestones(g, b, 3)
      if (!next.length) nodes.push({ type: 'info', id: `biz.ms.all.${a.id}`, emoji: '\u{1F451}', text: 'Every milestone reached. Legendary.' })
      for (const x of next) {
        const now = x.m.now?.(g, b)
        nodes.push({ type: 'info', id: `biz.ms.next.${a.id}.${x.m.id}`, emoji: x.m.emoji, text: `${x.m.label}${now ? ` · ${now}` : ''}${x.progress > 0 && x.m.now ? ` (${Math.floor(x.progress * 100)}%)` : ''}` })
      }
      const reachedList = MILESTONES.filter((m) => done[m.id] !== undefined).sort((x, y) => done[y.id] - done[x.id])
      nodes.push({ type: 'heading', id: `biz.ms.doneH.${a.id}`, label: `Reached (${reachedList.length})` })
      if (!reachedList.length) nodes.push({ type: 'info', id: `biz.ms.none.${a.id}`, emoji: '\u{1F331}', text: 'Nothing yet: the first profitable year is the first one to chase.' })
      for (const m of reachedList) nodes.push({ type: 'info', id: `biz.ms.done.${a.id}.${m.id}`, emoji: m.emoji, text: `${m.label} · ${done[m.id]}` })
      return nodes
    },
  }
}
