// Helpers shared by the deep-tech funding and autopilot tests: a founder with money, popups
// answered the way a sensible player answers them, and founding through the real Start a Business menu.
import { expect } from 'vitest'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu } from '../src/game/business'
import { techOf } from '../src/game/business/deeptech-core'
import { closeRound, makeTermSheet, roundBlock } from '../src/game/business/deeptech-funding'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { bizOf, businessAssets } from '../src/game/business/state'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

export function adultIn(countryId: string, money: number, seed = 3, smarts = 90, year = 2000): GameState {
  const g = createNewLife({ seed, year, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = smarts
  c.licenses = ['driver']
  c.talent = null
  c.talents = []
  return g
}

/** Answer every popup: preferred ids first, else the first choice; sane annual plans. */
export function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Co'), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        const production = Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05))
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production }), m.data, m)
      } else runScript(g, m.scriptId, 'lose', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

/** The answers a sensible player gives to the year's popups. */
export const YEAR_PREFS = ['sign', 'savings', 'pay', 'decline', 'patch', 'recall', 'help', 'disclose', 'fix', 'investor', 'loan', 'steady', 'closed', 'pause', 'license', 'program', 'quiet', 'fair']

function find(nodes: MenuNode[], id: string): MenuNode | undefined {
  return nodes.find((n) => n.id === id)
}

function startMenu(g: GameState): MenuGroup {
  const start = find(businessCareerMenu.children(g), 'biz.start')
  if (!start || start.type !== 'menu') throw new Error('no start menu')
  return start
}

function startRow(g: GameState, industry: string): MenuAction {
  const row = find(startMenu(g).children(g), `biz.start.${industry}`)
  if (!row || row.type !== 'action') throw new Error(`no row for ${industry}`)
  return row
}

/** Found a company through the real menus and popups. */
export function found(g: GameState, industry: string, prefer = ['savings', 'seed', 'cofounder', 'me', 'refuse', 'yes']): Asset {
  const row = startRow(g, industry)
  const reason = row.disabledReason?.(g)
  expect(reason, `can't found ${industry}: ${reason}`).toBeFalsy()
  row.run(g)
  drain(g, prefer)
  const a = businessAssets(g).find((x) => x.details.industry === industry)
  expect(a, `${industry} was founded`).toBeTruthy()
  return a!
}

// ---------------------------------------------------------------------------
// Playing a lab for years

/** When (in years after founding, -1 for never) a company hit each milestone. */
export interface LabRun {
  industry: string
  /** Year the company vanished (bankrupt), -1 when it was still there at the end. */
  gone: number
  /** First year a program was running. */
  first: number
  /** Year each funding series was raised, by series number (1 = seed ... 6 = Series E). */
  series: number[]
  /** Year each commercial stage was reached, by stage. */
  stage: number[]
  /** First year the pilot power plant (fusion) was running as a program. */
  pilot: number
}

/**
 * Found `industry` through the real menus and run it year after year the way the deeptech
 * tests do: the general manager's turn each year (it starts programs the money covers, applies for
 * a grant and raises a round when the runway gets short), then the year itself with its popups
 * answered. With `eager`, the founder also signs any round investors will offer, the moment they
 * offer it (a player does that from the Funding menu), instead of waiting for the runway to run low.
 */
export function playLab(countryId: string, seed: number, industry: string, opts: { years?: number; eager?: boolean; year?: number } = {}): LabRun {
  const g = adultIn(countryId, 6_000_000, seed, 95, opts.year ?? PRESENT_YEAR)
  found(g, industry)
  const run: LabRun = { industry, gone: -1, first: -1, series: [-1, -1, -1, -1, -1, -1, -1], stage: [-1, -1, -1, -1, -1, -1], pilot: -1 }
  for (let y = 0; y < (opts.years ?? 25) && g.character.alive; y++) {
    const cur = businessAssets(g)[0]
    if (!cur) {
      run.gone = y
      break
    }
    const b = bizOf(g, cur)
    if (opts.eager) {
      const t0 = techOf(b)
      if (!roundBlock(g, b, t0)) {
        const ts = makeTermSheet(g, cur, b, t0)
        if (!ts.down) closeRound(g, cur, b, t0, ts)
      }
    }
    deepTechManagerTurnImpl(g, cur, b)
    const t = techOf(b)
    if (run.first < 0 && t.programs.length > 0) run.first = y
    for (let k = 1; k < run.series.length; k++) if (run.series[k] < 0 && t.series >= k) run.series[k] = y
    for (let s = 0; s < run.stage.length; s++) if (run.stage[s] < 0 && t.stage >= s) run.stage[s] = y
    if (run.pilot < 0 && t.programs.some((p) => p.id === 'pilot')) run.pilot = y
    ageUp(g)
    drain(g, YEAR_PREFS)
  }
  return run
}
