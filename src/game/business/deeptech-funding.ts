// Deep-tech funding: venture rounds (seed → Series A-E) that sell equity for cash in the R&D
// account, bridge rounds when milestones slip, down rounds when the hype fades, and government
// grants that differ by country. Rounds need milestones and a year between them; grants have
// one application a year, cooldowns and lifetime caps. None of this money can be paid out.
import { marketOf } from '../data/markets'
import { rand } from '../rng'
import type { Asset, GameState } from '../types'
import { valuationOf } from './economy'
import { DEEP_TECH, GRANT_COOLDOWN, MAX_GRANT_AWARDS, NATIONAL_GRANT, grantsFor, maxStage, programDef, vcDepth, type GrantDef } from './deeptech-data'
import { dtInd, industryCycle, rdBudget, rdScale, revalue, runwayYears, techSkill } from './deeptech-core'
import { MAX_SERIES, SERIES, type TechState } from './deeptech-state'
import { investorFirm } from './flavor'
import { type BizState } from './state'
import { clampN, money } from './util'

// ---------------------------------------------------------------------------
// Rounds

export interface TermSheet {
  series: number
  investor: string
  amount: number
  pre: number
  equity: number
  down: boolean
  bridge: boolean
}

/** Stage investors expect before each series (index = series). */
const STAGE_FOR = [0, 0, 1, 2, 3, 3, 4]
/** Or yearly sales that prove it (US dollars, scaled to the market). */
const SALES_FOR = [0, 0, 0, 0, 30_000_000, 50_000_000, 150_000_000]
/** Typical share sold in each round. */
const DILUTION = [0, 0.2, 0.2, 0.18, 0.15, 0.12, 0.1]

export function lastPost(t: TechState): number {
  const r = t.rounds[t.rounds.length - 1]
  return r ? r.pre + r.raised : 0
}

/** What the next priced round needs (milestone text) and whether it's met. */
export function nextRoundNeed(b: BizState, t: TechState): { series: number; met: boolean; text: string } {
  const ind = dtInd(b)
  const k = Math.min(MAX_SERIES, t.series + 1)
  const stage = Math.min(maxStage(ind), STAGE_FOR[k])
  const sales = Math.round(SALES_FOR[k] * rdScale(b.countryId))
  const revenue = b.last ? b.last.revenue : 0
  const stageName = DEEP_TECH[ind].stages[stage].name
  // A first R&D win is enough for a Series A; a Series B also takes a breakthrough-level lab.
  const alt = k === 2 ? t.done.length > 0 || t.drugs.some((d) => d.phase >= 1) : k === 3 ? t.stage >= stage - 1 && t.level >= 50 : false
  const met = t.stage >= stage || (sales > 0 && revenue >= sales) || alt
  const text =
    k <= 1
      ? 'a pitch deck and a founder investors believe in'
      : k === 2
        ? `a first R&D breakthrough or "${stageName}"`
        : k === 3
          ? `"${stageName}" (or the stage before it with tech level 50+)`
          : sales > 0
            ? `"${stageName}" or ${money(sales)} of yearly sales`
            : `"${stageName}"`
  return { series: k, met, text }
}

/** Why the company can't raise a priced round right now (null when it can). */
export function roundBlock(g: GameState, b: BizState, t: TechState): string | null {
  if (b.public) return 'Listed companies raise money on the stock market, not from venture capitalists.'
  if (t.series >= MAX_SERIES) return `You have raised every private round there is (${SERIES[MAX_SERIES]}). The next stop is an IPO.`
  if (t.lastRoundYear === g.year) return 'You already raised money this year. Investors want to see what you do with it.'
  const need = nextRoundNeed(b, t)
  if (!need.met) return `${SERIES[need.series]} investors want to see ${need.text} first.`
  return null
}

/** Why a bridge round from existing investors isn't possible (null when it is). */
export function bridgeBlock(g: GameState, b: BizState, t: TechState): string | null {
  if (b.public) return 'Listed companies raise money on the stock market.'
  if (t.series < 1) return 'Bridge rounds come from existing investors, and you don’t have any.'
  if (t.lastRoundYear >= g.year - 1) return 'Your investors put money in less than two years ago. They’ll wait for milestones.'
  return null
}

/** How investors rate the company right now (0.25 - 2.5): tech, stage, sales and buzz. */
export function investorAppetite(g: GameState, a: Asset, b: BizState, t: TechState): number {
  const ind = dtInd(b)
  const k = Math.min(MAX_SERIES, t.series + 1)
  const expected = Math.min(maxStage(ind), STAGE_FOR[k])
  const revenue = b.last ? b.last.revenue : 0
  const p = 0.45 + t.level / 120 + (t.stage - expected) * 0.25 + Math.log10(1 + Math.max(0, revenue) / 1e6) * 0.12 + t.hype / 250 + (techSkill(g, a, b, t) - 50) / 300
  return clampN(p, 0.25, 2.5)
}

/** A term sheet for the next round (uses the engine RNG: call from actions only). */
export function makeTermSheet(g: GameState, a: Asset, b: BizState, t: TechState, bridge = false): TermSheet {
  const ind = dtInd(b)
  const m = marketOf(b.countryId)
  const depth = vcDepth(b.countryId, m.gdpPerCapita, m.easeOfBusiness)
  const heat = industryCycle(g, ind, g.year).value
  const p = investorAppetite(g, a, b, t)
  const last = lastPost(t)
  const roll = 0.85 + rand(g) * 0.3
  const investor = bigInvestor(b, t.series + 1, rand(g), rand(g))
  if (bridge) {
    const prevRaised = t.rounds[t.rounds.length - 1]?.raised ?? DEEP_TECH[ind].rounds[1]
    const amount = Math.round(prevRaised * 0.4 * roll)
    const fundamental = Math.max(1, valuationOf(b))
    const pre = Math.round(Math.max(amount * 2, Math.min(last || fundamental, fundamental) * 0.8))
    return { series: t.series, investor: 'your existing investors', amount, pre, equity: amount / (pre + amount), down: last > 0 && pre < last * 0.9, bridge: true }
  }
  const k = Math.min(MAX_SERIES, t.series + 1)
  const base = DEEP_TECH[ind].rounds[k]
  const amount = Math.round(base * (0.5 + 0.5 * depth) * Math.pow(rdScale(b.countryId), 0.7) * p * roll)
  const d = clampN(DILUTION[k] / (0.75 + 0.25 * heat) / (0.8 + 0.2 * p), 0.08, 0.4)
  let pre = Math.round((amount * (1 - d)) / d)
  // Investors never price far below what the company is already worth.
  const fundamental = Math.max(0, valuationOf(b))
  if (pre < fundamental * 0.8 * heat) pre = Math.round(fundamental * 0.8 * heat)
  return { series: k, investor, amount, pre, equity: amount / (pre + amount), down: last > 0 && pre < last * 0.9, bridge: false }
}

function bigInvestor(b: BizState, series: number, r1: number, r2: number): string {
  if (series >= 4 && r1 < 0.3) return r2 < 0.5 ? 'a sovereign wealth fund' : 'a tech giant’s venture arm'
  if (series >= 5 && r1 < 0.5) return 'a crossover hedge fund'
  return investorFirm(b.countryId, r1, r2)
}

/** Sign a term sheet: cash into the R&D account, equity out of the owner's stake. */
export function closeRound(g: GameState, a: Asset, b: BizState, t: TechState, ts: TermSheet): void {
  const amount = Math.max(0, Math.round(ts.amount))
  const equity = clampN(amount / Math.max(1, ts.pre + amount), 0, 0.6)
  b.share = clampN(Math.round(b.share * (1 - equity) * 10000) / 10000, 0.01, 1)
  t.venture += amount
  t.raised += amount
  if (!ts.bridge) t.series = Math.min(MAX_SERIES, Math.max(t.series, ts.series))
  t.lastRoundYear = g.year
  t.rounds.push({ series: ts.bridge ? t.series : ts.series, year: g.year, raised: amount, pre: Math.round(ts.pre), equity: Math.round(equity * 1000) / 1000, investor: ts.investor, down: ts.down })
  if (t.rounds.length > 12) t.rounds.splice(0, t.rounds.length - 12)
  if (ts.down) {
    t.hype = Math.max(0, t.hype - 10)
    t.pressure = Math.min(100, t.pressure + 20)
    b.morale = clampN(b.morale - 8, 0, 100)
  } else {
    t.hype = Math.min(100, t.hype + (ts.bridge ? 0 : 6))
    t.pressure = Math.max(0, t.pressure - 10)
    b.morale = clampN(b.morale + 3, 0, 100)
  }
  revalue(g, a, b, t)
}

/** Advice for a term sheet (the Business talent): 'sign', 'push' or 'walk'. */
export function termAdvice(g: GameState, a: Asset, b: BizState, t: TechState, ts: TermSheet, canPush: boolean): 'sign' | 'push' | 'walk' {
  const runway = runwayYears(g, a, b, t)
  if (runway < 1.2) return 'sign'
  if (ts.down && runway >= 2) return 'walk'
  const heat = industryCycle(g, dtInd(b), g.year).value
  if (canPush && !ts.down && (heat >= 1.05 || investorAppetite(g, a, b, t) >= 1.3) && runway >= 1.5) return 'push'
  if (ts.equity > 0.3 && runway >= 2) return 'walk'
  return 'sign'
}

// ---------------------------------------------------------------------------
// Grants

function grantMax(gr: GrantDef, countryId: string): number {
  if (gr.id !== NATIONAL_GRANT.id) return gr.max
  const m = marketOf(countryId)
  return Math.round(gr.max * clampN(m.gdpPerCapita / 60_000, 0.05, 1))
}

/** True for programs that build plant (fabs, factories, clusters...), not research. */
function isCapex(b: BizState, id: string): boolean {
  return !!programDef(dtInd(b), id)?.capex
}

/** Money still to be spent on big capital projects now underway. */
export function capexLeft(b: BizState, t: TechState): number {
  return t.programs.reduce((s, p) => s + (isCapex(b, p.id) ? Math.max(0, p.years - p.progress) * p.cost : 0), 0)
}

/** What a grant would pay now (0 when nothing qualifies). */
export function grantAmount(b: BizState, t: TechState, gr: GrantDef): number {
  const cap = grantMax(gr, b.countryId)
  const research = t.programs.reduce((s, p) => s + (isCapex(b, p.id) ? 0 : p.cost), 0)
  const base = gr.capex ? capexLeft(b, t) : Math.min(rdBudget(t), research)
  return Math.round(Math.max(0, Math.min(cap, base * gr.share)))
}

/** Why the company can't apply for this grant now (null when it can). */
export function grantBlock(g: GameState, a: Asset, b: BizState, t: TechState, gr: GrantDef): string | null {
  const awards = t.grants.filter((x) => x.id === gr.id)
  if (awards.length >= MAX_GRANT_AWARDS) return 'You have had this grant twice already. Let someone else have a turn.'
  const lastAward = awards[awards.length - 1]
  if (lastAward && g.year - lastAward.year < GRANT_COOLDOWN) return `You won this grant in ${lastAward.year}. You can apply again in ${lastAward.year + GRANT_COOLDOWN}.`
  if ((g.yearActions[grantKey(a, gr)] ?? 0) >= 1) return 'You already applied this year. The committee meets again next year.'
  if (grantAmount(b, t, gr) <= 0) return gr.capex ? 'Only for a big capital project that is being built.' : 'Only for R&D programs that are running. Start one first.'
  return null
}

export function grantKey(a: Asset, gr: GrantDef): string {
  return `dt.grant.${gr.id}.${a.id}`
}

/** Odds a grant application succeeds. */
export function grantOdds(g: GameState, a: Asset, b: BizState, t: TechState, gr: GrantDef): number {
  return clampN(gr.odds * (0.7 + t.level / 150 + techSkill(g, a, b, t) / 400), 0.03, 0.85)
}

export function grantList(b: BizState): GrantDef[] {
  return grantsFor(b.countryId, dtInd(b))
}

/** Pick the grant most worth applying for (Business hint, managers). */
export function bestGrant(g: GameState, a: Asset, b: BizState, t: TechState): GrantDef | null {
  let best: GrantDef | null = null
  let score = 0
  for (const gr of grantList(b)) {
    if (grantBlock(g, a, b, t, gr)) continue
    const sc = grantAmount(b, t, gr) * grantOdds(g, a, b, t, gr)
    if (sc > score) {
      score = sc
      best = gr
    }
  }
  return best
}
