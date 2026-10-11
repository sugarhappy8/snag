// A group's year, after every division has booked its own: one-off integration of new divisions,
// the synergies (a shared back office credited now; cross-selling and purchasing power lifting
// next year's demand and cutting next year's unit costs) and what sprawl costs, the hired group
// CEO's pay and turn (above 75: paying down expensive debt from the treasury, matching each
// division to the right mandate, upgrading a weak division CEO), the group board's review of the
// group CEO, and the group's value (the conglomerate discount, or the share price of a listed
// group). The treasury also covers a division's cash hole before it turns into a crisis.
import { formatMoney, log, notice } from '../core'
import { masterBusiness } from '../mastery'
import { bell, chance } from '../rng'
import type { Asset, GameState } from '../types'
import { ownerControls, setMandate } from './board'
import { boardView, controlsBoard, mandateDef } from './board-state'
import { payCap, reserveDollars } from './board-vote'
import { bestMandate, mandateMerit } from './board-ceo'
import { ceoSeverance, managerName, ownerAvailable, shortlist, SMART_SKILL } from './career'
import { cleanGroupJobs, familyRoleEdge, payFamilyGroupCeo, prepareGroupFamily } from './conglomerate-family'
import { hasInternalServices, internalRevenue } from './group-services'
import { allocateGroupCapital, manageDivisionCeos, managementEffectiveness, retainDivisionCeo } from './conglomerate-management'
import { clearGroupCeoJob } from './conglomerate-job'
import {
  canGroupIpo,
  groupBiz,
  groupBoardView,
  groupHasBoard,
  groupVote,
  interimCeo,
  movableCash,
  treasuryOf,
} from './conglomerate-actions'
import { captureOf, conglomerateDiscount, groupPerformance, integrationCost, synergyPlan, type DivisionInput } from './conglomerate-econ'
import {
  dissolveIfAlone,
  fundamental,
  groupIdOf,
  groupValue,
  GROUP_HISTORY,
  liveGroup,
  multFor,
  operating,
  readMembership,
  saveGroup,
  sharePriceOf,
  syncMembers,
  type Group,
  type GroupMember,
  type GroupSynergy,
} from './conglomerate-state'
import { exchangeMove, maxProduction, refreshValue } from './economy'
import { earmarkedCash } from './gamestudio'
import { bizOf, businessAssets, runsIt, type BizState, type Manager } from './state'
import { clampN, money, pct } from './util'
import { sweepGroupTreasury } from './group-treasury'
import { foundGroupVenture } from './group-ventures'

function inputs(grp: Group): DivisionInput[] {
  return grp.members.map((x) => ({ id: x.a.id, b: x.b, own: x.m.own }))
}

function credit(b: BizState, n: number): void {
  const v = Math.max(0, Math.round(n))
  if (!v) return
  b.cash += v
  b.yearIncome += v
  if (!b.public) b.valuation = Math.round(b.valuation + v)
}

function charge(b: BizState, n: number): void {
  const v = Math.max(0, Math.round(n))
  if (!v) return
  b.cash -= v
  b.yearCosts += v
  if (!b.public) b.valuation = Math.max(0, Math.round(b.valuation - v))
}

function shift(from: BizState, to: BizState, n: number): void {
  const v = Math.max(0, Math.round(n))
  if (!v) return
  from.cash -= v
  to.cash += v
  if (!from.public) from.valuation = Math.max(0, Math.round(from.valuation - v))
  if (!to.public) to.valuation = Math.round(to.valuation + v)
}

// ---------------------------------------------------------------------------
// The treasury covers a cash hole (yearly.ts calls this before a division's cash crunch)

/** Cover a fully owned division's negative cash from its sisters' spare cash. */
export function groupRescue(g: GameState, a: Asset, b: BizState): void {
  if (b.cash >= 0) return
  const id = groupIdOf(b)
  if (!id) return
  const grp = liveGroup(g, id)
  if (!grp || grp.members.length < 2) return
  const me = grp.members.find((x) => x.a.id === a.id)
  if (!me || me.m.own < 0.999) return
  let need = Math.round(-me.b.cash)
  let moved = 0
  const others = grp.members.filter((x) => x.a.id !== a.id).map((x) => ({ x, spare: movableCash(g, x) })).sort((p, q) => q.spare - p.spare)
  for (const o of others) {
    if (need <= 0) break
    const take = Math.min(need, o.spare)
    if (take <= 0) continue
    shift(o.x.b, me.b, take)
    need -= take
    moved += take
  }
  if (moved <= 0) return
  syncMembers(grp)
  log(g, `${grp.core.name}'s treasury covered ${money(moved)} of ${a.name}'s cash shortfall.`, 'neutral')
}

// ---------------------------------------------------------------------------
// Ownership drift and the CEO seat

/** A division that raised outside money after joining (a funding round, an investor) is owned less by the group. */
function trackOwnership(grp: Group): void {
  const s = grp.core.share
  if (s <= 0) return
  for (const x of grp.members) {
    const expected = s * x.m.own
    if (Math.abs(x.b.share - expected) > 1e-4) x.m.own = clampN(x.b.share / s, 0.001, 1)
  }
}

/** The player can't chair from a cell or as a child: the group board appoints an interim CEO. */
function ensureCeo(g: GameState, grp: Group): void {
  if (grp.core.ceo === 'manager' && grp.core.manager) return
  if (ownerAvailable(g) && grp.core.share > 0) {
    // Repair WIP/hand-edited saves that already have the player chairing a group but predate the
    // business-mastery hook. This runs in the yearly action path, never while rendering a menu.
    masterBusiness(g)
    return
  }
  const m = interimCeo(g, grp)
  grp.core.ceo = 'manager'
  grp.core.manager = { ...m, since: g.year }
  const why = g.character.prison ? 'With me behind bars' : g.character.age < 18 ? 'With me too young to run it' : 'With nobody at the top'
  log(g, `${why}, ${grp.core.name} appointed ${managerName(m)} as interim group CEO.`, 'neutral')
}

// ---------------------------------------------------------------------------
// The hired group CEO's turn

/** Pay down a division's expensive debt from its own spare cash and the group's treasury. */
function paydown(g: GameState, grp: Group, x: GroupMember, share: number): number {
  const b = x.b
  if (b.debt <= 0 || b.debtRate < 0.05) return 0
  const st = boardView(g, x.a, b)
  // Repaying with its own cash keeps the reserve (and money earmarked for unreleased games);
  // sisters chip in what they can spare.
  const ownSpare = Math.max(0, Math.floor(b.cash - earmarkedCash(x.a) - reserveDollars(b, st) - (b.manager?.salary ?? 0)))
  const sisters = x.m.own >= 0.999 ? grp.members.filter((o) => o.a.id !== x.a.id).map((o) => ({ o, spare: Math.max(0, movableCash(g, o) - (o.b.manager?.salary ?? 0)) })) : []
  const avail = ownSpare + sisters.reduce((s, o) => s + o.spare, 0)
  const pay = Math.round(Math.min(b.debt, avail) * clampN(share, 0, 1))
  if (pay < Math.max(5_000, b.debt * 0.02)) return 0
  let need = Math.max(0, pay - ownSpare)
  for (const o of sisters.sort((p, q) => q.spare - p.spare)) {
    if (need <= 0) break
    const take = Math.min(need, o.spare)
    shift(o.o.b, b, take)
    need -= take
  }
  const done = Math.min(pay - need, b.debt, Math.max(0, b.cash))
  b.debt = Math.max(0, Math.round(b.debt - done))
  b.cash -= done
  return done
}

function ceoTurn(g: GameState, grp: Group): string[] {
  const m = grp.core.manager
  if (grp.core.ceo !== 'manager' || !m) return []
  const smart = m.skill > SMART_SKILL
  if (grp.core.autonomous === false) return ['Autonomous portfolio management is paused.']
  const lines: string[] = [...sweepGroupTreasury(g, grp), ...manageDivisionCeos(g, grp)]
  // Expensive debt first: the treasury earns less than the loans cost.
  const debtors = grp.members.filter((x) => x.b.debt > 0 && x.b.debtRate >= 0.05).sort((p, q) => q.b.debtRate - p.b.debtRate)
  for (const x of debtors) {
    const paid = paydown(g, grp, x, managementEffectiveness(g, grp))
    if (paid > 0) lines.push(`Paid down ${money(paid)} of ${x.a.name}'s ${pct(x.b.debtRate, 1)} debt with cash the group didn't need.`)
  }
  if (smart) {
    if (!grp.core.mandate) {
      for (const x of grp.members) {
        if (!ownerControls(g, x.a)) continue
        const best = bestMandate(g, x.a, x.b)
        const cur = boardView(g, x.a, x.b).mandate
        // Only for a clear gain: a CEO who flips mandates every year just confuses the division.
        if (best && best !== cur && mandateMerit(g, x.a, x.b, cur, best) >= 0.3) {
          setMandate(g, x.a, x.b, best)
          lines.push(`Moved ${x.a.name} to a ${mandateDef(best).label} mandate (${mandateDef(best).brief}).`)
        }
      }
    }
  }
  lines.push(...foundGroupVenture(g, grp), ...allocateGroupCapital(g, grp))
  for (const x of grp.members) { const retention = retainDivisionCeo(g, grp, x); if (retention) lines.push(retention) }
  if (!lines.length) lines.push(smart ? 'Kept the divisions on plan; nothing needed fixing this year.' : 'Kept the divisions ticking over.')
  return lines
}

/** Runs before division retention and annual operating plans, once per year. */
function prepareGroup(g: GameState, grp: Group): void {
  if ((grp.core.managementYear ?? -1) >= g.year) return
  grp.core.managementYear = g.year
  grp.core.familyPay = 0
  // An employed heir is never their own hired group CEO.
  if (grp.core.manager?.personId === g.character.id) { grp.core.ceo = 'owner'; grp.core.manager = null }
  const family = prepareGroupFamily(g, grp)
  ensureCeo(g, grp)
  grp.core.memo = [...family, ...ceoTurn(g, grp)].slice(0, 100)
  grp.core.letter = g.year
  saveGroup(g, grp)
}

export function prepareGroupManagement(g: GameState): void {
  if (!g.character.alive) return
  cleanGroupJobs(g)
  const ids = [...new Set(businessAssets(g).map(a => groupIdOf(a.details)).filter(Boolean))]
  for (const id of ids) { const grp = liveGroup(g, id); if (grp && grp.members.length >= 2) prepareGroup(g, grp) }
}

// ---------------------------------------------------------------------------
// The group board's review of the group CEO

function boardPick(g: GameState, grp: Group): Manager {
  const gb = groupBiz(g, grp)
  const st = groupBoardView(g, grp)
  const cap = st ? payCap(gb, st) * 1.25 : Infinity
  const list = shortlist(g, gb, 'standard')
  const within = list.filter((m) => m.salary <= cap)
  const pool = within.length ? within : [...list].sort((x, y) => x.salary - y.salary).slice(0, 1)
  return pool.reduce((best, m) => (m.skill > best.skill ? m : best), pool[0])
}

function boardReview(g: GameState, grp: Group): void {
  const perf = groupPerformance(inputs(grp))
  grp.core.misses = perf < -0.15 ? grp.core.misses + 1 : Math.max(0, grp.core.misses - 1)
  if (!groupHasBoard(grp.core)) return
  const st = groupBoardView(g, grp)
  if (!st || controlsBoard(st)) return
  const hired = grp.core.ceo === 'manager' && grp.core.manager
  if (grp.core.misses < (hired ? 2 : 3) || !chance(g, hired ? 0.6 : 0.35)) return
  const who = hired && grp.core.manager ? managerName(grp.core.manager) : `${g.character.firstName} ${g.character.lastName}`
  const r = groupVote(g, grp, { kind: 'fire', by: 'board', label: `Replace ${who} as group CEO` }, { quiet: true })
  if (!r.passed) return
  const next = boardPick(g, grp)
  const out = hired ? grp.core.manager : null
  const sev = out ? ceoSeverance(out, g.year) : 0
  if (sev > 0) charge(treasuryOf(grp).b, sev)
  clearGroupCeoJob(g, out)
  grp.core.ceo = 'manager'
  grp.core.manager = { ...next, since: g.year }
  grp.core.misses = 0
  log(g, `${grp.core.name}'s board replaced ${who} as group CEO.`, 'bad')
  notice(
    g,
    hired ? 'Group CEO Fired' : 'Ousted as Group Chair',
    `After ${hired ? 'two' : 'three'} rough years, ${grp.core.name}'s board voted ${r.yes}\u{2013}${r.no} to replace ${hired ? who : 'you'} as group CEO with ${managerName(next)} (skill ${next.skill}/100, ${formatMoney(next.salary)} a year).${hired ? '' : ` Outside shareholders control the board; you still own ${pct(grp.core.share, 1)} of the group.`}`,
    { emoji: '\u{1FA91}', tone: 'bad' },
  )
}

// ---------------------------------------------------------------------------
// The year

function revalue(g: GameState, grp: Group, fiscal: number): void {
  const d = conglomerateDiscount(inputs(grp))
  grp.core.discount = d
  const l = grp.core.listing
  if (!l) grp.core.mult = clampN(1 - d, 0.3, 1)
  else {
    const fd = Math.max(1, fundamental(grp) - d * operating(grp))
    const per = fd / Math.max(1, l.sharesOut)
    const market = exchangeMove(g, grp.members[0].b.countryId, fiscal)
    const own = bell(g, -120, 120) / 1000
    // Like a listed company: half momentum (this year's market and news), half fundamentals.
    const next = 0.5 * sharePriceOf(grp) * (1 + market + own) + 0.5 * per * (1 + market * 0.5)
    grp.core.mult = multFor(grp, clampN(next, 0.05, 1e7) * l.sharesOut)
  }
  syncMembers(grp)
}

function groupYear(g: GameState, grp: Group, fiscal: number): void {
  trackOwnership(grp)
  prepareGroup(g, grp)
  ensureCeo(g, grp)
  const core = grp.core
  const syn: GroupSynergy = { year: fiscal, backOffice: 0, crossSell: 0, purchasing: 0, complexity: 0, integration: 0, hq: 0 }
  // New divisions: a one-off integration bill in their first booked year.
  for (const x of grp.members) {
    if (x.m.integrated > 0 || x.m.joined > fiscal) continue
    const cost = integrationCost(x.b)
    charge(x.b, cost)
    x.m.integrated = g.year
    syn.integration += cost
  }
  // Synergies and sprawl (half of them in the year a division joined).
  const plan = synergyPlan(inputs(grp), clampN(captureOf(g, core) + familyRoleEdge(g, core.id, 'operations'), 0, 1))
  plan.divisions.forEach((d, i) => {
    const x = grp.members[i]
    if (hasInternalServices(g, x.a.id)) { d.backOffice = 0; d.purchasing = 0; d.purchasingValue = 0 }
    const part = x.m.joined > fiscal ? 0 : x.m.joined === fiscal ? 0.5 : 1
    if (part > 0) {
      credit(x.b, d.backOffice * part)
      charge(x.b, d.complexity * part)
      syn.backOffice += Math.round(d.backOffice * part)
      syn.complexity += Math.round(d.complexity * part)
    }
    if (d.crossSell > 0 || d.purchasing > 0) {
      x.b.demandShock = clampN(x.b.demandShock * (1 + d.crossSell), 0.3, 2)
      x.b.costShock = clampN(x.b.costShock * (1 - d.purchasing), 0.5, 2)
      x.m.fx = { year: g.year, demand: d.crossSell, cost: d.purchasing }
      // A hired CEO plans for the customers the sister divisions send over.
      if (d.crossSell > 0 && x.b.ceo === 'manager' && !runsIt(g, x.a)) x.b.production = Math.round(clampN(x.b.production * (1 + d.crossSell), 0, maxProduction(g, x.b)))
      syn.crossSell += d.crossSellValue
      syn.purchasing += d.purchasingValue
    } else x.m.fx = null
  })
  // The group CEO's pay, shared by the divisions by sales.
  if (core.ceo === 'manager' && core.manager) {
    const available = grp.members.map(x => Math.max(0, Math.floor(x.b.cash - earmarkedCash(x.a))))
    const total = available.reduce((s, v) => s + v, 0)
    const pay = Math.min(Math.round(core.manager.salary), total)
    let remaining = pay
    grp.members.forEach((x, i) => { const part = Math.min(available[i], remaining, i === grp.members.length - 1 ? remaining : Math.floor(pay * available[i] / Math.max(1, total))); charge(x.b, part); remaining -= part })
    syn.hq = pay - remaining
    payFamilyGroupCeo(g, grp, syn.hq)
    if (syn.hq < core.manager.salary) core.memo.push(`Group CEO salary was underpaid: ${money(syn.hq)} of ${money(core.manager.salary)}; project cash was protected.`)
  }
  syn.hq += core.familyPay ?? 0
  if (core.ceo === 'manager' && core.autonomous !== false) core.memo.push(...sweepGroupTreasury(g, grp))
  const lines = core.memo
  boardReview(g, grp)
  revalue(g, grp, fiscal)
  // The record.
  const booked = grp.members.filter((x) => x.b.last && x.b.last.year === fiscal)
  core.history = [
    ...core.history.filter((h) => h.year !== fiscal),
    {
      year: fiscal,
      revenue: Math.max(0, Math.round(booked.reduce((s, x) => s + (x.b.last?.revenue ?? 0), 0) - internalRevenue(g, core.id, fiscal))),
      profit: Math.round(booked.reduce((s, x) => s + (x.b.last?.net ?? 0), 0)),
      value: groupValue(grp),
      divisions: grp.members.length,
    },
  ].slice(-GROUP_HISTORY)
  core.synergy = syn
  if (core.ceo === 'manager' && core.manager && lines.length) {
    core.memo = lines.slice(0, 100)
    core.letter = g.year
    log(g, `${managerName(core.manager)}'s letter from ${core.name}: ${lines.slice(0, 2).join(' ')}`, 'neutral')
  }
  const gains = syn.backOffice + syn.crossSell + syn.purchasing
  const costs = syn.complexity + syn.integration + syn.hq
  if (gains > 0 || costs > 0) log(g, `${core.name}: synergies worth about ${money(gains)}; sprawl, integration and head office cost ${money(costs)}.`, gains >= costs ? 'good' : 'neutral')
  if (!core.listing && !core.ipoHint && !canGroupIpo(g, grp)) {
    core.ipoHint = true
    notice(g, 'Ready for the Stock Market?', `${core.name}'s divisions made ${money(core.history[core.history.length - 1]?.profit ?? 0)} together last year: enough to list the whole group on a stock exchange. You can take it public from the group's screen.`, { emoji: '\u{1F514}', tone: 'good' })
  }
  saveGroup(g, grp)
}

/** Every group's year (business/yearly.ts runs it after each company's year is booked). */
export function yearlyGroups(g: GameState): void {
  if (!g.character.alive) return
  const fiscal = g.year - 1
  const ids: string[] = []
  for (const a of businessAssets(g)) {
    const id = groupIdOf(a.details)
    if (!id) continue
    // A damaged membership nobody can read any more: the company stands alone again.
    if (!readMembership(a.details.group)) {
      const b = bizOf(g, a)
      delete b.group
      refreshValue(a, b)
      continue
    }
    if (!ids.includes(id)) ids.push(id)
  }
  for (const id of ids) {
    if (dissolveIfAlone(g, id)) continue
    const grp = liveGroup(g, id)
    if (!grp || grp.members.length < 2) continue
    if (grp.core.history.some(h => h.year === fiscal)) continue
    groupYear(g, grp, fiscal)
  }
}
