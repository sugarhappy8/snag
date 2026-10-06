// World history as the character lives it: the headlines of each year (wars, crashes, firsts,
// pandemics, elections, sport), era-appropriate life events (drafts, rationing, the Moon landing
// on the family TV...), and the era context the AI narrator gets so it never mentions a
// smartphone in 1985.
//
// Data: events-1900/1946/1990.ts (real headlines HISTORY_START-PRESENT_YEAR), events-future.ts
// (the procedural future), events-wars.ts (wars, drafts, national service), events-medicine.ts
// (era health), events-people.ts (era jobs and families), events-era.ts (flavor lines, tech
// status), events-guard.ts (anachronism guard). The era popups themselves live in
// game/events/history*.ts. Nothing here consumes the game's RNG except the era popups, which
// only run for years before PRESENT_YEAR: a life lived in the present plays exactly as before
// plus one news line a year.
import { currentLogYear } from '../core'
import { eraMoments } from '../events/history'
import type { GameState } from '../types'
import { CONTINENTS, getCountry, type Continent } from '../world'
import { HEADLINES_1900 } from './events-1900'
import { HEADLINES_1946 } from './events-1946'
import { HEADLINES_1990 } from './events-1990'
import { eraBlurb, techStatus } from './events-era'
import { futureHeadlines } from './events-future'
import { eraSafe } from './events-guard'
import type { HeadlineRow, WorldEventKind } from './events-types'
import { warsAt } from './events-wars'
import { eraOf, HISTORY_START, isHistorical, PRESENT_YEAR } from './timeline'

export type { WorldEventKind } from './events-types'
export { eraBlurb, eraPreview, techPhrase, techStatus } from './events-era'
export { getWar, warDraftAt, warsAt, type DraftRule, type WarDef } from './events-wars'

export interface WorldEvent {
  year: number
  id: string
  /** One short headline, e.g. 'A man walks on the Moon'. No real living private individuals. */
  headline: string
  kind: WorldEventKind
  /** 'world', a continent name from world.ts, or a list of country ids it mainly concerns. */
  region: 'world' | string | string[]
  /** 0 trivia … 3 history-defining. */
  severity: 0 | 1 | 2 | 3
  /** Countries or continents a 'world' or continent headline leaves out (they get their own). */
  except?: string[]
}

/** Prefix of the yearly world-news line in the life log. */
export const NEWS_EMOJI = '\u{1F4F0}'

/** True for the "📰 1969: ..." world-news lines (other modules ignore them when counting a year's events). */
export function isNewsLine(text: string): boolean {
  return text.startsWith(NEWS_EMOJI)
}

// ---------------------------------------------------------------------------
// The data, indexed by year

const CONTINENT_SET = new Set<string>(CONTINENTS)

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function toEvent(row: HeadlineRow, used: Set<string>): WorldEvent {
  const [year, kind, severity, regionText, headline] = row
  const parts = regionText.split(',').map((s) => s.trim()).filter(Boolean)
  const except = parts.filter((p) => p.startsWith('-')).map((p) => p.slice(1))
  const include = parts.filter((p) => !p.startsWith('-'))
  let region: WorldEvent['region']
  if (include.includes('world') || include.length === 0) region = 'world'
  else if (include.length === 1 && CONTINENT_SET.has(include[0])) region = include[0]
  else region = include
  let id = `${year}-${slug(headline)}`
  for (let n = 2; used.has(id); n++) id = `${year}-${slug(headline)}-${n}`
  used.add(id)
  const ev: WorldEvent = { year, id, headline, kind, region, severity }
  if (except.length) ev.except = except
  return ev
}

const BY_YEAR: ReadonlyMap<number, readonly WorldEvent[]> = (() => {
  const used = new Set<string>()
  const map = new Map<number, WorldEvent[]>()
  for (const row of [...HEADLINES_1900, ...HEADLINES_1946, ...HEADLINES_1990]) {
    const ev = toEvent(row, used)
    const list = map.get(ev.year) ?? []
    list.push(ev)
    map.set(ev.year, list)
  }
  return map
})()

/** Every historical headline of a year (all regions), for tests and tools. */
export function allHeadlines(year: number): readonly WorldEvent[] {
  if (year > PRESENT_YEAR) {
    const used = new Set<string>()
    return futureHeadlines(year).map((r) => toEvent(r, used))
  }
  return BY_YEAR.get(year) ?? []
}

function continentOf(countryId: string): Continent {
  return getCountry(countryId).continent
}

/** How a headline relates to a country: 2 its own news, 1 its continent's, 0.5 world news, 0 none. */
function reach(ev: WorldEvent, countryId: string): number {
  const continent = continentOf(countryId)
  if (ev.except?.includes(countryId) || ev.except?.includes(continent)) return 0
  if (ev.region === 'world') return 0.5
  if (typeof ev.region === 'string') return ev.region === continent ? 1 : 0
  if (ev.region.includes(countryId)) return 2
  return ev.region.includes(continent) ? 1 : 0
}

/** Higher = more worth telling this player about. */
function relevance(ev: WorldEvent, countryId: string): number {
  const r = reach(ev, countryId)
  if (r === 0) return -1
  const local = r === 2 ? 3 : r === 1 ? 1.5 : 0
  return ev.severity * 2 + local
}

/** A stable 0-1 number for tie-breaks (so neighbors don't all read the same trivia). */
function stable(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** The year's headlines that matter where the character lives (world events + local ones), most relevant first. */
export function worldEvents(year: number, countryId: string): WorldEvent[] {
  const list = allHeadlines(year).filter((ev) => reach(ev, countryId) > 0)
  return list
    .map((ev) => ({ ev, score: relevance(ev, countryId) + stable(`${countryId}|${ev.id}`) * 0.9 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.ev)
}

/** Headlines a person living here and then would actually have heard (no TV news before TV). */
export function headlinesFor(year: number, countryId: string): WorldEvent[] {
  return worldEvents(year, countryId).filter((ev) => eraSafe(ev.headline, countryId, year))
}

function sentence(text: string): string {
  return /[.!?…]['"’”]?$/.test(text) ? text : `${text}.`
}

/** The "📰 1969: Humans walk on the Moon for the first time." line ('' if there is no news). */
export function newsLine(year: number, countryId: string): string {
  const top = headlinesFor(year, countryId)[0]
  return top ? `${NEWS_EMOJI} ${year}: ${sentence(top.headline)}` : ''
}

// ---------------------------------------------------------------------------
// Yearly hook

/**
 * Log this year's top headline once (safe to call twice in a year). The entry's id is derived
 * from the year instead of uid(), so adding the news shifts no other ids: a life in the present
 * plays out exactly as it did before the news existed (prices and picks hashed from ids included).
 */
export function logNews(g: GameState): void {
  const line = newsLine(g.year, g.character.countryId)
  if (!line) return
  const entries = currentLogYear(g).entries
  if (entries.some((e) => isNewsLine(e.text))) return
  entries.push({ id: `news-${g.generation}-${g.year}`, text: line, tone: 'neutral' })
}

/** Yearly hook (aging.ts, first): world news in the log, era life events (drafts, rationing...). */
export function yearlyHistory(g: GameState): void {
  if (!g.character.alive) return
  logNews(g)
  // Era popups only for real history: the present and the future play exactly as before.
  if (isHistorical(g.year) && g.year >= HISTORY_START) eraMoments(g)
}

// ---------------------------------------------------------------------------
// The AI's era line

function listOf(items: readonly string[], max: number): string {
  return items.slice(0, max).join(', ')
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** One line for the AI prompt: the year, the era and what the world is like ('' = nothing to add). */
export function eraSummary(g: GameState): string {
  const year = g.year
  const countryId = g.character.countryId
  const news = headlinesFor(year, countryId)
    .slice(0, 3)
    .map((ev) => truncate(ev.headline, 90))
  const newsText = news.length ? ` News this year: ${news.join('; ')}.` : ''
  if (year > PRESENT_YEAR) {
    return `ERA: ${year}, the future: everything that exists today (smartphones, the internet, AI assistants) still does; new inventions stay modest and believable.${newsText}`
  }
  const era = eraOf(year)
  const label = year === PRESENT_YEAR ? 'the present day' : era.label
  const tech = techStatus(countryId, year)
  const parts: string[] = [`ERA: ${year}, ${label} (${eraBlurb(year)}).`]
  if (tech.common.length) parts.push(`Common here: ${listOf(tech.common.slice(-6), 6)}.`)
  if (tech.rare.length) parts.push(`Rare: ${listOf(tech.rare, 5)}.`)
  if (tech.notYet.length) parts.push(`Not here yet: ${listOf(tech.notYet, 9)}. Never mention anything invented after ${year}.`)
  const wars = warsAt(countryId, year)
  if (wars.length) parts.push(`At war: ${wars.map((w) => w.name).join(', ')}.`)
  return parts.join(' ') + newsText
}
