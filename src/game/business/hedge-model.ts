// The return model behind Personal, Family and Company hedge funds. A fund is the owner's money
// riding the hedge-fund firm's strategy maths (fund-model.ts, fund-outlook.ts), with no client book,
// no fee and a small running cost. Everything here is pure: nothing reads or advances g.rng, and
// nothing changes g. Noise comes from hedgeRng (company funds use fundRng), seeded by life, outcome
// tag, the vehicle and the year, so a Time Machine jump rerolls it like any fiscal outcome.
import { seeded } from '../assets'
import { typicalIncome } from '../events/wealth-core'
import { investingBlocked } from '../history/markets'
import { exchangeInfo, exchangeName, exchangeStatus } from '../invest/engine'
import { politicianJob } from '../special/politics'
import { hasTalent } from '../talents'
import { outcomeTag } from '../timeMachine'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { alphaMean, capacityOf, financingCost, hedgeBlock, hedgeGross, marketMove, quantBlock } from './fund-model'
import { marketDrift, outlookOf } from './fund-outlook'
import type { HedgeStrategy, MacroCall } from './fund-state'
import { RUNNING_COST } from './hedge-record'
import { clampN } from './util'

/** The seeded noise stream of one fund and one year. `id` is the fund's asset id. */
export function hedgeRng(g: GameState, id: string, year: number): ReturnType<typeof seeded> {
  return seeded(`${g.lifeId}${outcomeTag(g, year)}|hedge1|${id}|${year}`)
}

// ---------------------------------------------------------------------------
// Skill

/**
 * How good the player is at running money, 5-100: the owner branch of the firm's ceoSkill (smarts,
 * discipline, schooling, years since `since`, an addiction) without the Business-run floor and the
 * Business talent, which are about running a company. Rounded as ceoSkill is.
 */
export function runnerSkill(g: GameState, since: number): number {
  const c = g.character
  const degrees = c.education.degrees
  let s = c.stats.smarts * .55 + c.hidden.discipline * .15 + 10
  if (degrees.some((d) => d.kind === 'mba')) s += 15
  else if (degrees.some((d) => d.major && /business|econom|finance|account|management|marketing/i.test(d.major))) s += 8
  s += Number.isFinite(since) ? Math.min(12, Math.max(0, g.year - since)) : 0
  if (c.conditions.some((x) => x.kind === 'addiction')) s -= 10
  return clampN(Math.round(s), 5, 100)
}

/** The runner's investing skill 0-100: runnerSkill, plus 8 while alive with the Investing talent (the firm's leaderSkill rule). */
export function leadOf(g: GameState, since: number): number {
  return clampN(runnerSkill(g, since) + (g.character.alive && hasTalent(g, 'Investing') ? 8 : 0), 0, 100)
}

/** The fund's skill 5-100: the firm's fundSkill without key staff. */
export function skillOf(lead: number): number {
  return clampN(lead * .62 + 6, 5, 100)
}

// ---------------------------------------------------------------------------
// The year

export interface YearIn {
  countryId: string
  strategy: HedgeStrategy
  call: MacroCall
  lev: number
  nav: number
  skill: number
  year: number
}

export interface YearOut {
  gross: number
  net: number
  market: number
}

/**
 * One year's return of a fund holding `nav` dollars: the home index's real move in `year`, the
 * strategy's gross return from the firm's formula, then the running cost. `r` is the year's noise.
 * Net is never below -0.9503 or above 3.975, whatever the inputs.
 */
export function vehicleYear(g: GameState, x: YearIn, r: ReturnType<typeof seeded>): YearOut {
  const skill = clampN(x.skill, 0, 100)
  const market = marketMove(g, x.countryId, x.year)
  const cap = capacityOf(x.nav, skill)
  const alpha = alphaMean(skill) * (x.strategy === 'macro' ? 1 : cap)
  // The firm's algorithm edge is research a vehicle lacks; only the runner's own edge counts.
  const quantEdge = x.strategy === 'quant' ? (skill - 50) * .0003 * cap : 0
  const gross = hedgeGross(x.strategy, market, alpha, quantEdge, { call: x.call, lev: x.lev }, financingCost(x.countryId, x.year), r)
  const net = (1 + gross) * (1 - RUNNING_COST) - 1
  return { gross, net, market }
}

/** What a strategy is expected to earn a year net of the running cost, and the swing around it. Same formulas as the firm's previews. */
export function vehicleOutlook(strategy: HedgeStrategy, x: { countryId: string; skill: number; nav: number; lev: number }): { expected: number; swing: number } {
  const skill = clampN(x.skill, 0, 100)
  const o = outlookOf(strategy, { skill, cap: capacityOf(x.nav, skill), drift: marketDrift(x.countryId), lev: clampN(x.lev, 1, 3), algoEdge: 0 })
  return { expected: o.expected - RUNNING_COST, swing: o.swing }
}

/**
 * The terms a fund runs on when nobody is at the wheel: the firm's autopilot. At a lead of 50 or more it
 * takes the best of Long/Short, Event-driven and Quant (Quant only where it is possible) by expected
 * return less a fifth of the swing; below that, Long/Short. Never a call, never leverage.
 */
export function autoTerms(x: { countryId: string; lead: number; nav: number; year: number }): { strategy: HedgeStrategy; call: 'flat'; lev: 1 } {
  let strategy: HedgeStrategy = 'longShort'
  if (x.lead >= 50) {
    const skill = skillOf(x.lead)
    const options: HedgeStrategy[] = ['longShort', 'event']
    if (!quantBlock(x.countryId, x.year)) options.push('quant')
    let best = -Infinity
    for (const s of options) {
      const o = vehicleOutlook(s, { countryId: x.countryId, skill, nav: x.nav, lev: 1 })
      const score = o.expected - o.swing * .2
      if (score > best) { best = score; strategy = s }
    }
  }
  return { strategy, call: 'flat', lev: 1 }
}

// ---------------------------------------------------------------------------
// Gates

/** The smallest first seed: five years of a typical income where the player lives. */
export function seedMin(g: GameState): number {
  return Math.round(5 * typicalIncome(g))
}

/** Why this person can't run a fund, or null. */
export function personBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't run a fund from prison."
  if (!(c.age >= 18)) return 'You must be 18 to start a fund.'
  return null
}

/** Why a fund can't follow `countryId`'s market this year, or null: too early, investing banned, exchange shut or missing. */
export function marketBlock(g: GameState, countryId: string): string | null {
  const early = hedgeBlock(g.year)
  if (early) return early
  const banned = investingBlocked(countryId, g.year)
  if (banned) return banned
  const info = exchangeInfo(countryId)
  const status = exchangeStatus(info, g.year)
  if (status === 'closed') return `The ${exchangeName(info, g.year)} is closed this year.`
  if (status === 'none') return `${getCountry(countryId).name} has no stock market to follow.`
  return null
}

/** Why a market call can't be made: an official moves indexes, so a leveraged index bet is the insider position the rules stop. */
export function macroBlock(g: GameState): string | null {
  return politicianJob(g) ? "Officials can't make market calls." : null
}

/** Why a strategy can't be picked here and now, or null. */
export function strategyBlock(g: GameState, countryId: string, s: HedgeStrategy): string | null {
  if (s === 'quant') return quantBlock(countryId, g.year)
  if (s === 'macro') return macroBlock(g)
  return null
}
