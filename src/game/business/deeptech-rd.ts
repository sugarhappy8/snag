// Deep-tech R&D: starting programs, yearly progress and spending, breakthroughs and setbacks,
// clinical trials for drugs, and the Business talent's pick of the best program to fund.
import { chance, rand } from '../rng'
import { hasTalent } from '../talents'
import type { Asset, GameState } from '../types'
import { DEEP_TECH, PROGRAMS, TRIALS, drugRegulator, maxStage, programDef, type ProgramDef } from './deeptech-data'
import { dtInd, paceOf, rdScale, runwayYears, syncBiotechStage, techSkill } from './deeptech-core'
import { repayGrants } from './deeptech-funding'
import { timesDone, type Drug, type TechProgram, type TechState } from './deeptech-state'
import { runsIt, totalOutlets, type BizState } from './state'
import { clampN, money } from './util'

/**
 * Most programs stored on a company (deeptech-state readTech keeps eight): the lab grows into it
 * as it opens more sites.
 */
export const MAX_PARALLEL = 8

/** How many programs the lab can run at once: more sites (lab space), a bigger round, a listing. */
export function maxPrograms(b: Pick<BizState, 'outlets' | 'public'>, t: TechState): number {
  const sites = Math.max(1, totalOutlets(b as BizState))
  return clampN(2 + Math.floor(Math.log2(sites)) + (t.series >= 2 ? 1 : 0) + (b.public ? 1 : 0), 2, MAX_PARALLEL)
}

/** Local yearly cost of a program at a steady pace. */
export function programCost(b: BizState, t: TechState, def: ProgramDef): number {
  return Math.round(def.cost(t) * rdScale(b.countryId, !!def.capex))
}

/** Budget multipliers a program can be funded at (1 = as planned). */
export const BUDGET_MIN = 0.5
export const BUDGET_MAX = 3

/**
 * What funding a program at `k` times its plan buys: faster (but not proportionally), likelier
 * to work (diminishing), and dearer in total. Pure.
 */
export function programTerms(b: BizState, t: TechState, def: ProgramDef, k = 1): { cost: number; years: number; odds: number } {
  const m = clampN(Number.isFinite(k) ? k : 1, BUDGET_MIN, BUDGET_MAX)
  const years = Math.round(clampN(def.years / Math.pow(m, 0.55), 0.5, 10) * 100) / 100
  const odds = clampN(1 - (1 - def.odds(t)) * Math.pow(m, -0.35), 0.02, 0.98)
  return { cost: Math.round(programCost(b, t, def) * m), years, odds }
}

/**
 * Booked years a program of `years` really takes at a pace of `speed` progress a year: progress
 * moves a whole pace step at every year-end (advancePrograms), so a 1.1-year rush still needs
 * two steady years. The menus quote this, never the fractional plan.
 */
export function wholeYears(years: number, speed = 1): number {
  const y = Number.isFinite(years) ? Math.max(0, years) : 1
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1
  return Math.max(1, Math.ceil(y / s - 1e-9))
}

/** Why this program can't start right now (null when it can). */
export function programBlock(b: BizState, t: TechState, def: ProgramDef): string | null {
  const gate = def.gate(t, b.countryId)
  if (gate) return gate
  if (t.programs.some((p) => p.id === def.id && !p.target)) return 'Already running.'
  if (t.programs.length >= maxPrograms(b, t)) return `Your lab can run ${maxPrograms(b, t)} programs at once. Finish or cancel one first.`
  return null
}

function newProgram(g: GameState, key: string, def: { id: string; name: string; emoji: string; years: number; cost: number; odds: number }, target = ''): TechProgram {
  return { id: def.id, key, name: def.name, emoji: def.emoji, years: def.years, progress: 0, cost: def.cost, odds: def.odds, started: g.year, spent: 0, target }
}

/**
 * Start an R&D program (costs are paid every year from the R&D account, then company cash).
 * `budget` funds it at a multiple of its plan (0.5-3): see programTerms.
 */
export function startProgram(g: GameState, b: BizState, t: TechState, def: ProgramDef, budget = 1): TechProgram | null {
  if (programBlock(b, t, def)) return null
  const terms = programTerms(b, t, def, budget)
  const p = newProgram(g, `${def.id}:${timesDone(t, def.id) + 1}`, { id: def.id, name: def.label(t), emoji: def.emoji, years: terms.years, cost: terms.cost, odds: terms.odds })
  t.programs.push(p)
  return p
}

// ---------------------------------------------------------------------------
// Clinical trials (biotech)

/** The next clinical step for a drug (null when approved or failed). */
export function trialStep(d: Drug): (typeof TRIALS)[number] | null {
  if (d.failed || d.phase >= 4) return null
  return TRIALS[Math.max(0, Math.min(3, d.phase))]
}

export function trialName(d: Drug, countryId: string): string {
  const step = trialStep(d)
  if (!step) return d.name
  return d.phase >= 3 ? `${d.name}: review by ${drugRegulator(countryId)}` : `${d.name}: ${step.label}`
}

export function trialBlock(b: BizState, t: TechState, d: Drug): string | null {
  if (d.failed) return 'This drug failed its trials.'
  if (d.partner) return `${d.partner} runs this drug's trials now.`
  if (!trialStep(d)) return 'Already approved.'
  if (t.programs.some((p) => p.id === 'trial' && p.target === d.id)) return 'Its trial is already running.'
  if (t.programs.length >= maxPrograms(b, t)) return `Your lab can run ${maxPrograms(b, t)} programs at once. Finish or cancel one first.`
  return null
}

export function trialCost(b: BizState, d: Drug): number {
  const step = trialStep(d)
  return step ? Math.round(step.cost * rdScale(b.countryId)) : 0
}

export function trialOdds(d: Drug): number {
  const step = trialStep(d)
  if (!step) return 0
  const area = d.area
  const areaMod = area === 'alzheimers' ? -0.15 : area === 'rare' ? 0.1 : area === 'oncology' ? -0.05 : area === 'obesity' || area === 'infection' ? 0.03 : 0
  return clampN(step.odds + areaMod + (d.quality - 50) / 250, 0.05, 0.95)
}

export function startTrial(g: GameState, b: BizState, t: TechState, d: Drug): TechProgram | null {
  if (trialBlock(b, t, d)) return null
  const step = trialStep(d)
  if (!step) return null
  const p = newProgram(g, `trial:${d.id}:${d.phase}`, { id: 'trial', name: trialName(d, b.countryId), emoji: d.phase >= 3 ? '\u{1F4DC}' : '\u{1F9EA}', years: step.years, cost: trialCost(b, d), odds: trialOdds(d) }, d.id)
  t.programs.push(p)
  syncBiotechStage(t)
  return p
}

// ---------------------------------------------------------------------------
// Yearly progress

export interface RdResult {
  /** R&D spending this year. */
  spend: number
  /** Lines for the lab report. */
  notes: string[]
  /** Big news worth a popup (milestones, approvals, explosions of hope). */
  headlines: string[]
  wins: number
  losses: number
  /** AI: a model finished training and awaits a release decision. */
  newModel: number
  /** The stage moved up this year. */
  stageUp: boolean
}

function finalOdds(g: GameState, a: Asset, b: BizState, t: TechState, p: TechProgram): number {
  const skill = techSkill(g, a, b, t)
  let o = p.odds * (0.75 + skill / 200)
  if (t.pace === 'blitz') o *= 0.96
  const ind = dtInd(b)
  if (runsIt(g, a) && ((ind === 'aiLab' || ind === 'cybersecurity' || ind === 'robotics' || ind === 'drones') && hasTalent(g, 'Programming'))) o *= 1.05
  if (runsIt(g, a) && ((ind === 'biotech' || ind === 'quantum' || ind === 'semiconductor' || ind === 'fusion' || ind === 'neurotech' || ind === 'carbonCapture') && hasTalent(g, 'Academics'))) o *= 1.05
  return clampN(o, 0.03, 0.95)
}

/**
 * One year of R&D: every program makes progress and costs money; finished ones succeed or fail.
 * Mutates the TechState; the caller books the spending.
 */
export function advancePrograms(g: GameState, a: Asset, b: BizState, t: TechState, year: number): RdResult {
  const ind = dtInd(b)
  const pace = paceOf(t.pace)
  const out: RdResult = { spend: 0, notes: [], headlines: [], wins: 0, losses: 0, newModel: 0, stageUp: false }
  const stageBefore = t.stage
  const keep: TechProgram[] = []
  const finished: TechProgram[] = []
  for (const p of t.programs) {
    const cost = Math.round(p.cost * pace.cost)
    out.spend += cost
    p.spent += cost
    p.progress = Math.round((p.progress + pace.speed) * 100) / 100
    if (p.progress + 1e-9 >= p.years) finished.push(p)
    else keep.push(p)
  }
  t.programs = keep
  for (const p of finished) {
    const ok = chance(g, finalOdds(g, a, b, t, p))
    if (p.id === 'trial') {
      resolveTrial(g, b, t, p, ok, out)
      continue
    }
    const def = programDef(ind, p.id)
    if (!def) continue
    const ctx = { t, countryId: b.countryId, year, roll: () => rand(g), company: a.name }
    const modelsBefore = t.models.length
    if (ok) {
      // Patents count what the plan was worth, not a crash budget on top (no valuation pump);
      // endless next-generation work mostly pays through better products, not the books.
      const nominal = programCost(b, t, def) * def.years
      t.done.push(p.id)
      const line = def.win(ctx)
      out.wins += 1
      out.notes.push(`\u{2705} ${line}`)
      if (def.capex) t.plantBook += p.spent * 0.85
      else t.ipBook += Math.min(p.spent, Math.max(0, nominal)) * (def.ipShare ?? 1.2)
      if (t.models.length > modelsBefore) out.newModel = t.models[t.models.length - 1].gen
      if (p.years >= 2 || def.capex) out.headlines.push(line)
    } else {
      t.fails += 1
      const line = def.lose ? def.lose(ctx) : `${p.name} didn't pan out. The money taught you a lot, expensively.`
      out.losses += 1
      out.notes.push(`\u{274C} ${line}`)
      if (def.capex) t.plantBook += p.spent * 0.3
      else t.ipBook += p.spent * 0.25
      if (p.years >= 2 || def.capex) out.headlines.push(line)
    }
  }
  if (ind === 'biotech') syncBiotechStage(t)
  t.stage = Math.min(maxStage(ind), t.stage)
  out.stageUp = t.stage > stageBefore
  return out
}

function resolveTrial(g: GameState, b: BizState, t: TechState, p: TechProgram, ok: boolean, out: RdResult): void {
  const d = t.drugs.find((x) => x.id === p.target)
  if (!d || d.failed) return
  const regulator = drugRegulator(b.countryId)
  if (ok) {
    d.phase = Math.min(4, d.phase + 1)
    t.ipBook += p.spent * 1.2
    t.level = Math.min(100, t.level + 3)
    out.wins += 1
    if (d.phase >= 4) {
      d.approved = g.year
      t.hype = Math.min(100, t.hype + 25)
      const line = `${regulator.charAt(0).toUpperCase()}${regulator.slice(1)} approved ${d.name}! It goes on sale this year.`
      out.notes.push(`\u{1F389} ${line}`)
      out.headlines.push(line)
    } else {
      t.hype = Math.min(100, t.hype + (d.phase >= 2 ? 15 : 6))
      const line = d.phase >= 3 ? `${d.name} passed Phase III. Time to file with ${regulator}.` : `${d.name} passed Phase ${d.phase}${d.phase === 2 ? ': the drug works' : ': it’s safe in people'}.`
      out.notes.push(`\u{2705} ${line}`)
      out.headlines.push(line)
    }
  } else {
    d.failed = true
    t.fails += 1
    t.ipBook += p.spent * 0.2
    t.hype = Math.max(0, t.hype - (d.phase >= 2 ? 20 : 8))
    out.losses += 1
    const line = d.phase >= 3 ? `${regulator.charAt(0).toUpperCase()}${regulator.slice(1)} rejected ${d.name}. Years of work, one letter.` : `${d.name} failed its Phase ${d.phase + 1} trial. ${d.phase >= 1 ? 'The stock market would call this a "readout".' : 'Safety problems in volunteers.'}`
    out.notes.push(`\u{274C} ${line}`)
    out.headlines.push(line)
  }
}

/**
 * Cancel a program: the money spent so far is gone (some know-how stays), and grant money it
 * hadn't spent yet goes back to the agency. Returns the program and what was repaid.
 */
export function cancelProgram(g: GameState, b: BizState, t: TechState, key: string): { program: TechProgram; repaid: number } | null {
  const p = t.programs.find((x) => x.key === key)
  if (!p) return null
  const repaid = repayGrants(g, b, t, p)
  t.programs = t.programs.filter((x) => x.key !== key)
  t.ipBook += p.spent * 0.15
  return { program: p, repaid }
}

/** Stop every program that matches (a dropped drug, a licensed one...), repaying unspent grants. */
export function stopPrograms(g: GameState, b: BizState, t: TechState, match: (p: TechProgram) => boolean): number {
  let repaid = 0
  for (const p of t.programs.filter(match)) repaid += cancelProgram(g, b, t, p.key)?.repaid ?? 0
  return repaid
}

// ---------------------------------------------------------------------------
// Advice (the Business talent's purple hint and the general manager's choices)

/** Rough value of finishing a program, per dollar, for ranking. */
function programScore(b: BizState, t: TechState, def: ProgramDef): number {
  const cost = Math.max(1, programCost(b, t, def) * def.years)
  const odds = def.odds(t)
  // Programs that unlock the next stage are worth the most; then price, cost and demand gains.
  const unlocks = def.id === 'firstChip' || def.id === 'volume' || def.id === 'api' || def.id === 'enterprise' || def.id === 'pilots' || def.id === 'line' || def.id === 'engine' || def.id === 'rocket' || def.id === 'prototype' || def.id === 'lowvol' || def.id === 'ramp' || def.id === 'cloud' || def.id === 'detect' || def.id === 'platform' || def.id === 'clearance' || def.id === 'proto' || def.id === 'discovery' || (def.id === 'train' && t.models.length < 3) || (def.id === 'qubits' && t.qubits < 20)
  const value = (unlocks ? 5 : 1) * (def.capex ? 1.4 : 1)
  return (odds * value * 1e7) / cost
}

/** The best program to fund now, within the runway (null when none fits). */
export function bestProgram(g: GameState, a: Asset, b: BizState, t: TechState): ProgramDef | null {
  const ind = dtInd(b)
  const runway = runwayYears(g, a, b, t)
  const funds = t.venture + Math.max(0, b.cash)
  let best: ProgramDef | null = null
  let score = -Infinity
  for (const def of PROGRAMS[ind]) {
    if (programBlock(b, t, def)) continue
    const yearly = programCost(b, t, def)
    // Don't bet the company: the first year of the program must fit in the money on hand.
    if (yearly > funds * (runway >= 1 ? 0.9 : 0.5)) continue
    const sc = programScore(b, t, def)
    if (sc > score) {
      score = sc
      best = def
    }
  }
  return best
}

/** The drug most worth trialing next (biotech). */
export function bestTrial(b: BizState, t: TechState, funds: number): Drug | null {
  let best: Drug | null = null
  let score = -Infinity
  for (const d of t.drugs) {
    if (trialBlock(b, t, d)) continue
    const cost = trialCost(b, d)
    if (cost > funds * 0.9) continue
    const sc = (trialOdds(d) * d.peak * (1 + d.phase)) / Math.max(1, cost)
    if (sc > score) {
      score = sc
      best = d
    }
  }
  return best
}

/** One line describing a running program. */
export function programLine(p: TechProgram): string {
  const rest = Math.max(0, p.years - p.progress)
  const left = rest <= 1e-9 ? 0 : wholeYears(rest)
  return `${Math.round(Math.min(1, p.progress / Math.max(0.01, p.years)) * 100)}% done · ${left <= 0 ? 'finishing' : `${left} yr${left === 1 ? '' : 's'} left at a steady pace`} · ${money(p.cost)}/yr · ${Math.round(p.odds * 100)}% base odds`
}

/** The deep-tech stage names, for summaries. */
export function stageList(b: BizState): string[] {
  return DEEP_TECH[dtInd(b)].stages.map((s) => s.name)
}
