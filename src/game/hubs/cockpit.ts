// The cockpit of a tab (G.5): a few tiles, one chart and, on Assets, one card for each company, drawn above the list of the
// tab. Occupation gets the facts of the job or the school, Assets gets the wealth cockpit (net worth, cash, debt, the
// net-worth line and the company cards), and Relationships and Activities are thin: no tiles, one line, and the screen's own
// "Needs you" card and Pinned/Recent strip carry them until the full People and World cockpits arrive (G.10, R4 to R8 plug
// into cockpitOf).
//
// Pure, like every hub: no draw, no write to the game, and no foresight (the settled years and the live books only). Every
// number here is one a screen already prints; a number that is not finite is 0, never NaN. Money text goes through
// moneyLabel, so it reads in the currency of the life it is built for.
import { netWorth, roleLabel } from '../core'
import { businessAssets } from '../business/state'
import { fit, moneyLabel } from '../charts/money'
import type { ChartSpec, ChartTone } from '../charts/spec'
import type { GameState, Job } from '../types'
import { lifeRowsOf, netWorthChart } from './series-adapter'
import { companyCards, finiteOrNull, plainText, type CompanyCard } from './wealth'

export type CockpitTab = 'occupation' | 'assets' | 'relationships' | 'activities'

export interface CockpitTile {
  id: string
  label: string
  value: string
  note?: string
  tone: ChartTone
  /** 0 to 100: the tile shows a meter under its number. */
  meter?: number
  /** A trend, oldest first. */
  spark?: (number | null)[]
  /** The path under the tab that opens the tile's screen. Only a tile with a screen has one. */
  open?: string[]
}

export interface CockpitModel {
  tab: CockpitTab
  /** One line: what the tab holds right now. The view shows it where there are no tiles. */
  summary: string
  tiles: CockpitTile[]
  chart: ChartSpec | null
  cards: CompanyCard[]
  /** Companies beyond the cards shown. */
  moreCards: number
}

const BAR = '\u{00B7}'
const SUMMARY_MAX = 120
/** Points of the Net worth trend. */
const SPARK_POINTS = 40
const TEXT_MAX = 40

function tile(id: string, label: string, value: string, tone: ChartTone, extra: Partial<CockpitTile> = {}): CockpitTile {
  return { id, label, value, tone, ...extra }
}

/** A whole number from 0 to 100; anything that is not a number is 0. */
function percent(v: unknown): number {
  const n = finiteOrNull(v)
  return n === null ? 0 : Math.max(0, Math.min(100, Math.round(n)))
}

/** How a 0 to 100 score reads: green from 60, red under 35. */
function scoreTone(score: number): ChartTone {
  return score >= 60 ? 'good' : score < 35 ? 'bad' : 'c2'
}

function years(n: unknown): string {
  const y = Math.max(0, Math.round(finiteOrNull(n) ?? 0))
  return `${y} ${y === 1 ? 'year' : 'years'}`
}

// ---------------------------------------------------------------------------
// Assets

/** Net worth as the Assets header prints it; if a damaged asset makes that not a number, the sum of what is readable. */
function worthOf(g: GameState): number {
  try {
    const n = finiteOrNull(netWorth(g))
    if (n !== null) return n
  } catch {
    // Fall through to the careful sum.
  }
  let total = finiteOrNull(g.character?.money) ?? 0
  for (const a of Array.isArray(g.assets) ? g.assets : []) total += (finiteOrNull(a?.value) ?? 0) - (finiteOrNull(a?.mortgage?.balance) ?? 0)
  for (const l of Array.isArray(g.character?.loans) ? g.character.loans : []) total -= finiteOrNull(l?.balance) ?? 0
  return Math.round(total)
}

/** Loans plus mortgages, the unreadable ones counting nothing. */
function debtOf(g: GameState): number {
  let total = 0
  for (const l of Array.isArray(g.character?.loans) ? g.character.loans : []) total += finiteOrNull(l?.balance) ?? 0
  for (const a of Array.isArray(g.assets) ? g.assets : []) total += finiteOrNull(a?.mortgage?.balance) ?? 0
  return Math.round(total)
}

/**
 * The Banking group sits in the Assets list for an adult who is alive (economy/menu.ts bankingMenu.visible). A hub cannot
 * import that menu (the import cycle), so the rule is written out here and test/nav-cockpit.test.ts holds the two together.
 */
function bankingListed(g: GameState): boolean {
  const c = g.character
  return c.alive === true && finiteOrNull(c.age) !== null && c.age >= 18
}

function netWorthTrend(g: GameState): (number | null)[] | undefined {
  try {
    const rows = lifeRowsOf(g)
    return rows.length >= 2 ? rows.slice(-SPARK_POINTS).map((r) => r.netWorth) : undefined
  } catch (err) {
    console.error('[hubs] lifeRows failed:', err)
    return undefined
  }
}

function netWorthLine(g: GameState): ChartSpec | null {
  try {
    return netWorthChart(g)
  } catch (err) {
    console.error('[hubs] netWorthSpec failed:', err)
    return null
  }
}

function assetsModel(g: GameState): CockpitModel {
  const m = (n: number): string => moneyLabel(g, n)
  const worth = worthOf(g)
  const cash = finiteOrNull(g.character.money) ?? 0
  const debt = debtOf(g)
  const trend = netWorthTrend(g)
  const companies = businessAssets(g).length
  const cards = companyCards(g)
  const debtTile = tile('debt', 'Debt', m(debt), debt > 0 ? 'bad' : 'muted', bankingListed(g) ? { open: ['banking'] } : {})
  const parts = [`Net worth ${m(worth)}`, `cash ${m(cash)}`]
  if (companies > 0) parts.push(`${companies} ${companies === 1 ? 'company' : 'companies'}`)
  return {
    tab: 'assets',
    summary: fit(parts.join(` ${BAR} `), SUMMARY_MAX),
    tiles: [tile('net', 'Net worth', m(worth), 'c1', trend ? { spark: trend } : {}), tile('cash', 'Cash', m(cash), 'c3'), debtTile],
    chart: netWorthLine(g),
    cards,
    moreCards: Math.max(0, companies - cards.length),
  }
}

// ---------------------------------------------------------------------------
// Occupation

function dataOf(job: Job): Record<string, unknown> {
  return job.data !== null && typeof job.data === 'object' && !Array.isArray(job.data) ? job.data : {}
}

function jobTiles(g: GameState, job: Job, partTime: boolean): { tiles: CockpitTile[]; summary: string } {
  const m = (n: number): string => moneyLabel(g, n)
  const title = plainText(job.title, 'Job', TEXT_MAX)
  const company = plainText(job.company, '', TEXT_MAX)
  const hourly = partTime ? finiteOrNull(dataOf(job).hourly) : null
  const pay = hourly !== null && hourly > 0 ? `${m(hourly)}/hr` : `${m(finiteOrNull(job.salary) ?? 0)}/yr`
  const performance = percent(job.performance)
  return {
    tiles: [
      tile('role', 'Role', title, 'c1', company === '' ? {} : { note: company }),
      tile('pay', 'Pay', pay, 'c3'),
      tile('performance', 'Performance', `${performance}%`, scoreTone(performance), { meter: performance }),
      tile('years', 'Years here', years(job.yearsAtCompany), 'muted'),
    ],
    summary: company === '' ? title : `${title} at ${company}`,
  }
}

function occupationModel(g: GameState): CockpitModel {
  const c = g.character
  const m = (n: number): string => moneyLabel(g, n)
  let tiles: CockpitTile[]
  let summary: string
  const school = c.education?.current ?? null
  if (c.alive !== true) {
    summary = roleLabel(g)
    tiles = [tile('role', 'Role', summary, 'muted')]
  } else if (c.prison) {
    const p = c.prison
    const name = plainText(p.name, 'Prison', TEXT_MAX)
    const served = finiteOrNull(p.yearsServed)
    const sentence = finiteOrNull(p.sentenceYears)
    const note = p.life ? 'Life sentence' : served !== null && sentence !== null ? `${Math.max(0, Math.round(served))} of ${Math.max(0, Math.round(sentence))} years` : undefined
    tiles = [tile('prison', 'Prison', name, 'bad', note === undefined ? {} : { note })]
    summary = `In ${name}`
  } else if (c.job || (!school && c.partTimeJob)) {
    const partTime = !c.job
    const built = jobTiles(g, (c.job ?? c.partTimeJob) as Job, partTime)
    tiles = built.tiles
    summary = built.summary
  } else if (school) {
    const name = plainText(school.school, 'School', TEXT_MAX)
    const grades = percent(school.grades)
    const year = finiteOrNull(school.year)
    const total = finiteOrNull(school.totalYears)
    tiles = [
      tile('school', 'School', name, 'c1', year !== null && total !== null && year >= 1 && total >= 1 ? { note: `Year ${Math.round(year)} of ${Math.round(total)}` } : {}),
      tile('grades', 'Grades', `${grades}%`, scoreTone(grades), { meter: grades }),
    ]
    summary = `Student at ${name}`
  } else if (c.retired) {
    const pension = m(finiteOrNull(c.pension) ?? 0)
    tiles = [tile('pension', 'Pension', `${pension}/yr`, 'c3')]
    summary = `Retired ${BAR} pension ${pension}/yr`
  } else {
    summary = plainText(roleLabel(g), 'Nothing yet', TEXT_MAX)
    tiles = [tile('role', 'Role', summary, 'c1')]
  }
  return { tab: 'occupation', summary: fit(summary, SUMMARY_MAX), tiles, chart: null, cards: [], moreCards: 0 }
}

// ---------------------------------------------------------------------------
// The thin tabs

function relationshipsModel(g: GameState): CockpitModel {
  const people = Array.isArray(g.people) ? g.people.filter((p) => p && p.alive === true && p.relation !== 'pet').length : 0
  const summary = people === 0 ? "You're on your own." : `${people} ${people === 1 ? 'person' : 'people'} in your life.`
  return { tab: 'relationships', summary, tiles: [], chart: null, cards: [], moreCards: 0 }
}

function activitiesModel(g: GameState): CockpitModel {
  const age = Math.max(0, Math.round(finiteOrNull(g.character.age) ?? 0))
  const cash = moneyLabel(g, finiteOrNull(g.character.money) ?? 0)
  return { tab: 'activities', summary: fit(`Age ${age} ${BAR} ${cash} on hand`, SUMMARY_MAX), tiles: [], chart: null, cards: [], moreCards: 0 }
}

/** What a tab's cockpit shows right now. Never throws: a failure is logged and the tab gets an empty model. */
export function cockpitOf(tab: CockpitTab, g: GameState): CockpitModel {
  try {
    switch (tab) {
      case 'assets':
        return assetsModel(g)
      case 'occupation':
        return occupationModel(g)
      case 'relationships':
        return relationshipsModel(g)
      case 'activities':
        return activitiesModel(g)
    }
  } catch (err) {
    console.error(`[hubs] cockpitOf(${String(tab)}) failed:`, err)
  }
  return { tab, summary: 'Nothing to show yet.', tiles: [], chart: null, cards: [], moreCards: 0 }
}
