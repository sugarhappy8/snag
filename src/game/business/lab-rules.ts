// R&D 3.0 rules: what an Operations R&D program costs, takes, risks and offers, why it can't start and
// what it is worth. All pure: they read the company and the year, never draw g.rng and never write state
// (the hypothetical companies below are shallow copies that are thrown away). Prices are fixed per trade
// and rung (rd.ts rdSiteScale): nothing here reads the company's cash, sales or valuation, except the
// cash a program needs to start and the worth it is judged against.
import type { GameState } from '../types'
import { patentLaw } from '../workshop/market'
import { marketKey } from './competition-core'
import { bizWorth, localEcon, marketCtxFor, type Worth } from './economy'
import { eraFits } from './era'
import { breakthroughByName } from './heavy-data'
import { heavyEligible, readHeavy } from './heavy-rd'
import { IP_SHARE, LAB_LEVEL_MAX, LAB_FADE, labTierOf, LICENSE_X, OPS_COOLDOWN, OPS_MAX_RUNG, OPS_PROGRAMS, OPS_TIER, opsProgram, PATENT_AGE, PATENT_FEE_X, ROYALTY_CAP_X, RUNG_PENALTY, RUNG_X, RUNG_YEARS, SHIELD, TEAM_CAP, TEAM_FEE_X, TEAM_MIN_YEARS, TEAM_PAY_X, type OpsProgram } from './lab-data'
import { draftLab, LAB_LIMITS, levelOf, opsEffectsOf, readLab, saveLab, shieldsOf, winLevel, type LabTrack } from './lab-state'
import { LAB_LABEL, LAB_SAY } from './lab-text'
import { fieldFor, fieldOf, infoOf, productPull, type FieldMarket } from './product-market'
import { productIdeas } from './products'
import { baseYears, bestRdIdea, DISCOUNT, HORIZON, launchP, pullValue, rdCost, rdProjects, rdReserve, rdSiteScale, RD_BASE, roundBudget } from './rd'
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

/** Every family the company sells a line of that it developed itself (a rival bought out doesn't count) and launched at most PATENT_AGE years ago, with its newest launch. A line not on sale yet doesn't count. */
function ownRecent(g: GameState, b: BizState): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of b.products) {
    if (p.from || !(p.launched <= g.year) || g.year - p.launched > PATENT_AGE) continue
    const family = infoOf(p, b.industry).family
    out.set(family, Math.max(out.get(family) ?? Number.NEGATIVE_INFINITY, p.launched))
  }
  return out
}

/**
 * The families the screen offers to patent: the company's own lines of the last PATENT_AGE years, newest
 * launch first, at most as many as it may hold (patentBlock says which of them can be filed). Pure.
 */
export function patentableFamilies(g: GameState, b: BizState): readonly string[] {
  if (!heavyEligible(b)) return []
  return [...ownRecent(g, b)]
    .sort((x, y) => y[1] - x[1])
    .slice(0, LAB_LIMITS.patents)
    .map((x) => x[0])
}

/**
 * What a patent on a family costs, shields and is worth on the books: fixed by the kind and the country,
 * never by the company's cash or sales. `plan` is the price the kind cost to develop (a breakthrough's own
 * record, else an ordinary idea's cost); the fee is a share of it plus the country's filing fee; the shield
 * lasts the tier's years times how well the country's courts enforce it (at least two); the book is a share
 * of the price. Pure.
 */
export function patentTerms(g: GameState, b: BizState, family: string): { plan: number; fee: number; years: number; until: number; book: number } {
  const law = patentLaw(b.countryId, g.year)
  const record = readHeavy(g, b.industry, marketKey(b)).find((r) => r.family === family)
  const plan = record && record.cost > 0 ? record.cost : rdCost(b, family)
  const fee = roundBudget(PATENT_FEE_X * plan) + law.fee
  const years = Math.max(2, Math.round(SHIELD[labTierOf(b.industry) ?? 'mid'] * law.enforcement))
  return { plan, fee, years, until: g.year + years, book: Math.round(IP_SHARE * plan) }
}

/**
 * Why a family can't be patented now: one reason, or null when it can. In order: not a product company, six
 * live patents already, the family was patented here before, no line of its own launched in the last
 * PATENT_AGE years, a recipe or service in a low-tech trade (only a breakthrough), a rival already sells it
 * (nothing new) and cash (the fee plus the usual reserve; `cashPaid` skips it, for the hired CEO whose board
 * budget already took the fee). Pure.
 */
export function patentBlock(g: GameState, b: BizState, family: string, cashPaid = false): string | null {
  const tier = labTierOf(b.industry)
  if (!tier || !heavyEligible(b)) return LAB_SAY.patentNotEligible()
  const lab = readLab(b)
  const name = typeof family === 'string' ? family : ''
  if (lab.patents.length >= LAB_LIMITS.patents) return LAB_SAY.patentsFull(String(LAB_LIMITS.patents))
  if (lab.filed.includes(name)) return LAB_SAY.alreadyFiled(shown(name))
  if (!name || !ownRecent(g, b).has(name)) return LAB_SAY.noOwnLine(String(PATENT_AGE))
  if (tier === 'low' && breakthroughByName(name) === null) return LAB_SAY.lowTier(shown(name))
  if (fieldFor(marketCtxFor(g, b, g.year)).of(name).offer > 0.02) return LAB_SAY.notNovel(shown(name))
  if (!cashPaid) {
    const need = patentTerms(g, b, name).fee + rdReserve(b)
    if (!(b.cash >= need)) return LAB_SAY.patentCash(money(need), money(need - Math.max(0, b.cash)))
  }
  return null
}

/** Why a held patent can't be licensed: no such patent, already licensed, or it runs out too soon to earn anything. Pure. */
export function licenseBlock(g: GameState, b: BizState, family: string): string | null {
  const name = typeof family === 'string' ? family : ''
  const p = readLab(b).patents.find((x) => x.family === name)
  if (!p) return LAB_SAY.noPatent(shown(name))
  if (p.mode === 'license') return LAB_SAY.alreadyLicensed(shown(name))
  if (p.until <= g.year + 1) return LAB_SAY.tooLate(shown(name))
  return null
}

/**
 * Expected dollars of patenting a family now, over the shield's years, in the better of two ways, less the
 * fee. Hold: each year the company's pull with the shield against its pull in the open field, the
 * customers that are worth (pullValue, as ordinary R&D counts them). License: from next year the
 * royalties rivals that sell the kind would pay, up to the lifetime cap. Both fields come from fieldOf with
 * and without the new shield (and with the company's other patents), the resolver's own math. Pure: it
 * draws nothing and writes nothing.
 */
export function patentValue(g: GameState, b: BizState, family: string, w: Worth = bizWorth(g, b)): { value: number; mode: 'hold' | 'license'; hold: number; license: number; fee: number } {
  const t = patentTerms(g, b, family)
  const c = marketCtxFor(g, b, g.year)
  const heavy = fieldFor(c).heavy
  const others = shieldsOf(b).filter((x) => x.family !== family)
  const open: FieldMarket = { industry: b.industry, shield: others }
  const shut: FieldMarket = { industry: b.industry, shield: [...others, { family, until: t.until }] }
  let hold = 0
  let license = 0
  let capLeft = ROYALTY_CAP_X * t.plan
  for (let k = 0; k < t.years; k++) {
    const year = g.year + k
    const free = fieldOf(c.rivals, c.fringe, c.key, year, heavy, open)
    const held = fieldOf(c.rivals, c.fringe, c.key, year, heavy, shut)
    hold += Math.pow(DISCOUNT, k) * pullValue(c, b, w, productPull(b.industry, b.products, year, free).total, productPull(b.industry, b.products, year, held).total)
    if (k >= 1) {
      const f = free.of(family)
      const royalty = Math.max(0, Math.min(capLeft, LICENSE_X * t.plan * f.offer * f.level))
      license += Math.pow(DISCOUNT, k) * royalty
      capLeft -= royalty
    }
  }
  const best = Math.max(hold, license)
  const value = Number.isFinite(best) ? best - t.fee : -t.fee
  return { value, mode: license > hold ? 'license' : 'hold', hold: Number.isFinite(hold) ? hold : 0, license: Number.isFinite(license) ? license : 0, fee: t.fee }
}

/** One move of the lab a hired CEO may make: an Operations program to start or a patent to file (in the way that pays more), its price and what it is worth to them. */
export type LabMove =
  | { kind: 'ops'; id: string; track: LabTrack; price: number; value: number }
  | { kind: 'patent'; family: string; mode: 'hold' | 'license'; price: number; value: number }

/**
 * The best move of the lab within `avail` dollars: the program or patent with the highest expected value,
 * as the same opsValue and patentValue the rows' hints show (null: nothing pays). A candidate is a program
 * on offer, or a family on the patentable list, that its own block says can go ahead (the cash test skipped:
 * `avail` is what the board's budget and reserve leave, and the price must fit in it). `judge` is the CEO's
 * mistake model, applied to the gross win before the price; `costOnly` keeps cost-track programs only (a
 * cost-cutter's extra move). Never a hire. Pure, and the only thing that can draw from g.rng is `judge`
 * (the hired CEO's draws one number a call): a candidate whose exact value is not above 0 is dropped before
 * `judge` sees it, so a CEO with nothing worth starting draws exactly what it drew before this existed.
 */
export function bestLabMove(g: GameState, b: BizState, avail: number, w: Worth, judge: (v: number) => number = (v) => v, costOnly = false): LabMove | null {
  let best: LabMove | null = null
  for (const p of opsOffers(g, b)) {
    if (costOnly && p.track !== 'cost') continue
    const price = opsPrice(b, p.rung)
    if (!(price <= avail) || opsBlock(g, b, p.id, true) !== null) continue
    const exact = opsValue(g, b, p.id, w)
    if (!(exact > 0)) continue
    const value = judge(exact + price) - price
    if (value > 0 && (best === null || value > best.value)) best = { kind: 'ops', id: p.id, track: p.track, price, value }
  }
  if (costOnly) return best
  for (const family of patentableFamilies(g, b)) {
    if (!(patentTerms(g, b, family).fee <= avail) || patentBlock(g, b, family, true) !== null) continue
    const pv = patentValue(g, b, family, w)
    if (!(pv.value > 0)) continue
    const value = judge(pv.value + pv.fee) - pv.fee
    if (value > 0 && (best === null || value > best.value)) best = { kind: 'patent', family, mode: pv.mode, price: pv.fee, value }
  }
  return best
}
