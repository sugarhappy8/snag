// R&D 3.0 rules: what an Operations R&D program costs, takes, risks and offers, why it can't start and
// what it is worth. All pure: they read the company and the year, never draw g.rng and never write state
// (the hypothetical companies below are shallow copies that are thrown away). Prices are fixed per trade
// and rung (rd.ts rdSiteScale): nothing here reads the company's cash, sales or valuation, except the
// cash a program needs to start and the worth it is judged against.
import type { GameState } from '../types'
import { bizWorth, localEcon, type Worth } from './economy'
import { eraFits } from './era'
import { heavyEligible } from './heavy-rd'
import { LAB_LEVEL_MAX, LAB_FADE, labTierOf, OPS_COOLDOWN, OPS_MAX_RUNG, OPS_PROGRAMS, OPS_TIER, opsProgram, RUNG_PENALTY, RUNG_X, RUNG_YEARS, TEAM_CAP, TEAM_FEE_X, TEAM_MIN_YEARS, TEAM_PAY_X, type OpsProgram } from './lab-data'
import { draftLab, levelOf, opsEffectsOf, readLab, saveLab, winLevel, type LabTrack } from './lab-state'
import { LAB_LABEL, LAB_SAY } from './lab-text'
import { productIdeas } from './products'
import { baseYears, bestRdIdea, DISCOUNT, HORIZON, launchP, rdProjects, rdReserve, rdSiteScale, RD_BASE, roundBudget } from './rd'
import { MAX_STORED_PROJECTS, type BizState } from './state'
import { clampN, money } from './util'

/** What the cheapest program of a trade costs: the ordinary R&D base at the size of a typical site here, to two digits. */
export function opsBase(b: BizState): number {
  return roundBudget(RD_BASE * rdSiteScale(b))
}

/** A program's price (rung 1 to 3): fixed per trade, paid when it starts. */
export function opsPrice(b: BizState, rung: 1 | 2 | 3): number {
  return roundBudget(opsBase(b) * RUNG_X[rung - 1])
}

/** Booked years a program takes (1 to 4): the trade's usual project time, longer for the higher rungs. */
export function opsYears(b: BizState, rung: 1 | 2 | 3): number {
  return clampN(Math.ceil(baseYears(b.industry) * RUNG_YEARS[rung - 1] - 1e-9), 1, 4)
}

/** The chance a program works when it is done: the company's R&D skill, the tier's ease, less the rung's difficulty. */
export function opsOdds(g: GameState, b: BizState, rung: 1 | 2 | 3): number {
  const tier = labTierOf(b.industry)
  return clampN(0.9 * launchP(g, b) + (tier ? OPS_TIER[tier].odds : 0) - RUNG_PENALTY[rung - 1], 0.15, 0.92)
}

/** The programs on offer now: product companies only, from each program's first year, as far up the rungs as the tier goes. */
export function opsOffers(g: GameState, b: BizState): readonly OpsProgram[] {
  const tier = labTierOf(b.industry)
  if (!tier || !heavyEligible(b)) return []
  return OPS_PROGRAMS.filter((p) => p.rung <= OPS_MAX_RUNG[tier] && g.year >= p.first && eraFits(g, b.countryId, p.label))
}

/** A name for a message: a damaged one can't flood a popup. */
const shown = (name: string): string => (typeof name === 'string' ? name.slice(0, 60) : '')

/**
 * Why a program can't start now: one reason, or null when it can. In order: not a product company, not a
 * program, the era, the rung, the track already busy, the cooldown, the storage guard and cash (price plus
 * the usual reserve; `cashPaid` skips it, for the hired CEO whose board budget already took the price). Pure.
 */
export function opsBlock(g: GameState, b: BizState, id: string, cashPaid = false): string | null {
  const tier = labTierOf(b.industry)
  if (!tier || !heavyEligible(b)) return LAB_SAY.notEligible()
  const p = typeof id === 'string' ? opsProgram(id) : null
  if (!p) return typeof id === 'string' && id.trim() ? LAB_SAY.unknownProgram(shown(id)) : LAB_SAY.pickProgram()
  if (g.year < p.first || !eraFits(g, b.countryId, p.label)) return LAB_SAY.notReady(p.label)
  if (p.rung > OPS_MAX_RUNG[tier]) return LAB_SAY.rungTooBig(p.label)
  const lab = readLab(b)
  const running = lab.programs.find((x) => opsProgram(x.id)?.track === p.track)
  if (running) return LAB_SAY.trackBusy(LAB_LABEL.track[p.track], opsProgram(running.id)?.label ?? running.id)
  // A win booked for fiscal F frees the program in year F + 3. A year from the future is damage, not a wait.
  const won = lab.done[p.id]
  if (won !== undefined && won <= g.year && won + OPS_COOLDOWN > g.year) return LAB_SAY.cooldown(p.label, String(won), String(won + OPS_COOLDOWN))
  if (rdProjects(b).length >= MAX_STORED_PROJECTS) return LAB_SAY.drowning()
  if (!cashPaid) {
    const need = opsPrice(b, p.rung) + rdReserve(b)
    if (!(b.cash >= need)) return LAB_SAY.cash(p.label, money(need), money(need - Math.max(0, b.cash)))
  }
  return null
}

/** A throwaway copy of the company with one track's level set (a hypothetical for opsEffectsOf: the real company is never touched). */
function withLevel(b: BizState, track: LabTrack, v: number, at: number): BizState {
  const d = draftLab(b)
  d.levels[track] = { v, at }
  const hypothetical: BizState = { ...b }
  saveLab(hypothetical, d)
  return hypothetical
}

/** How far a win moves the track's own channel of opsEffectsOf, as a positive number (cost falls, output and demand rise). */
function channelChange(track: LabTrack, now: { cost: number; capacity: number; demand: number }, then: { cost: number; capacity: number; demand: number }): number {
  if (track === 'cost') return now.cost - then.cost
  return track === 'yield' ? then.capacity - now.capacity : then.demand - now.demand
}

/**
 * What a win would do: the booked years of work, the level it adds (the learning curve: nothing once the
 * track is at its ceiling) and the first-year change that makes to the track's channel, as a fraction
 * ("0.04": unit costs 4% lower, output or demand 4% higher). `effect` is the number the screen shows after
 * "up to"; every later year's change fades 5% from it.
 */
export function opsGain(g: GameState, b: BizState, id: string): { years: number; gain: number; effect: number } {
  const p = opsProgram(id)
  if (!p) return { years: 0, gain: 0, effect: 0 }
  const years = opsYears(b, p.rung)
  const st = readLab(b)
  const fiscal = g.year + years - 1
  const first = fiscal + 1
  const base = levelOf(st, p.track, first)
  const gain = Math.max(0, winLevel(st, p, fiscal) - base)
  const effect = channelChange(p.track, opsEffectsOf(b, first), opsEffectsOf(withLevel(b, p.track, base + gain, first), first))
  return { years, gain, effect: Number.isFinite(effect) ? Math.max(0, effect) : 0 }
}

/**
 * Expected dollars of starting a program now, over the same eight years ordinary R&D is valued: the odds it
 * works times what the track's change is worth each year (discounted from the year the work is done), less
 * the price. A win's change in year t is the channel with the level raised by gain x .95^t, less the channel
 * as it is, read through the same opsEffectsOf the year end uses. Cost saves `cogs`; output is worth
 * contribution only to the extent the company sells all it can make; demand is worth contribution.
 * Pure, and the same numbers the year rolls.
 */
export function opsValue(g: GameState, b: BizState, id: string, w: Worth = bizWorth(g, b)): number {
  const p = opsProgram(id)
  if (!p) return 0
  const { years, gain } = opsGain(g, b, id)
  const price = opsPrice(b, p.rung)
  const st = readLab(b)
  const bound = clampN((w.util - 0.85) * 6, 0, 1)
  let sum = 0
  for (let t = 0; t < HORIZON; t++) {
    const year = g.year + years + t
    const now = opsEffectsOf(b, year)
    const raised = Math.min(LAB_LEVEL_MAX, levelOf(st, p.track, year) + gain * Math.pow(LAB_FADE, t))
    const then = opsEffectsOf(withLevel(b, p.track, raised, year), year)
    const yearly = p.track === 'cost' ? (now.cost - then.cost) * w.cogs : p.track === 'yield' ? (then.capacity - now.capacity) * w.contrib * bound : (then.demand - now.demand) * w.contrib
    sum += Math.pow(DISCOUNT, years - 1 + t) * yearly
  }
  const value = opsOdds(g, b, p.rung) * sum - price
  return Number.isFinite(value) ? value : -price
}

/** Scientists this company can employ: by its trade's tier, none for a breakthrough trade or a company that runs its own kind of R&D. */
export function teamCap(b: { industry: string }): number {
  const tier = labTierOf(b.industry)
  return tier && heavyEligible(b) ? TEAM_CAP[tier] : 0
}

/** What one scientist is paid a year: a multiple of a general employee's pay here, fixed per trade and place (never by the company's cash or sales). */
export function teamPay(b: BizState): number {
  return roundBudget(TEAM_PAY_X * localEcon(b.industry, b.countryId, b.city).wage)
}

/** What it costs to take a scientist on, and to let one go: a share of a year's pay, paid when it happens. */
export function teamFee(b: BizState): number {
  return Math.round(TEAM_FEE_X * teamPay(b))
}

/**
 * Why a scientist can't be hired or let go now: one reason, or null when it can. In order: not a product
 * company; the team is full (hire) or empty (release); cash (hire: the fee, a year's pay and the usual
 * reserve; release: the fee and the reserve); the three years' service of the longest-serving scientist
 * (release). Pure.
 */
export function teamBlock(g: GameState, b: BizState, kind: 'hire' | 'release'): string | null {
  const cap = teamCap(b)
  if (!cap) return LAB_SAY.teamNotEligible()
  const team = readLab(b).team
  if (kind === 'hire' && team.length >= cap) return LAB_SAY.teamFull(String(cap))
  if (kind === 'release' && team.length === 0) return LAB_SAY.teamNone()
  const need = teamFee(b) + (kind === 'hire' ? teamPay(b) : 0) + rdReserve(b)
  if (!(b.cash >= need)) return (kind === 'hire' ? LAB_SAY.hireCash : LAB_SAY.releaseCash)(money(need), money(need - Math.max(0, b.cash)))
  if (kind === 'release') {
    // The stored team is oldest first. A hire year from the future is damage, not a wait.
    const hired = team[0]
    const served = g.year - hired
    if (served >= 0 && served < TEAM_MIN_YEARS) return LAB_SAY.minService(String(hired), String(hired + TEAM_MIN_YEARS))
  }
  return null
}

/**
 * What the next scientist is worth a year: the change in the best ordinary idea's value (the same
 * bestRdIdea the Products rows and the hired CEO use, over the first four ideas) plus the change in the
 * best Operations program's value, each recomputed with one more scientist (more odds and one more slot
 * for every second one), and `value` that gain less a year's pay. Pure: the extra scientist lives on a
 * throwaway copy of the company, and nothing here draws g.rng.
 */
export function teamValue(g: GameState, b: BizState, w: Worth = bizWorth(g, b)): { gain: number; pay: number; value: number } {
  const pay = teamPay(b)
  if (!teamCap(b)) return { gain: 0, pay, value: -pay }
  const d = draftLab(b)
  d.team.push(g.year)
  const more: BizState = { ...b }
  saveLab(more, d)
  const room = Math.max(0, b.cash - rdReserve(b))
  const ideas = productIdeas(g, b, 4)
  const best = (x: BizState): { ordinary: number; ops: number } => ({
    ordinary: bestRdIdea(g, x, ideas, room, w)?.value ?? 0,
    ops: opsOffers(g, x).reduce((top, p) => Math.max(top, opsValue(g, x, p.id, w)), 0),
  })
  const now = best(b)
  const next = best(more)
  const gain = next.ordinary - now.ordinary + (next.ops - now.ops)
  const safe = Number.isFinite(gain) ? gain : 0
  return { gain: safe, pay, value: safe - pay }
}
