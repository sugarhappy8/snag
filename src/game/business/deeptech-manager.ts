// What a hired general manager does every year for a deep-tech company the player doesn't run:
// keeps the lab busy within the runway, raises the next round when money runs low, applies for
// the best grant, flies test rockets, rents compute for training runs. A CEO above 75 also scales
// the factories to demand without a cap (within the board's budget and cash reserve) and keeps the
// cushion the mandate asks for; one at 75 or below stays cautious. Price and output mistakes shrink
// with skill (the year re-plans with them: deeptech-sim). Either way they write the owner a letter.
import { log } from '../core'
import { chance } from '../rng'
import { boardOf } from './board-state'
import { capexLeft, noteSpend, reserveDollars } from './board-vote'
import { ceoLetter, SMART_SKILL } from './career'
import type { Asset, GameState } from '../types'
import { PROGRAMS, programDef } from './deeptech-data'
import { bestTechPlan, burnRate, dtInd, revalue, runwayYears, sellable, techFunds, techOf, techPlan } from './deeptech-core'
import { localEcon } from './economy'
import { industryDef } from './industries'
import { awardGrant, bestGrant, bridgeBlock, closeRound, grantAmount, grantKey, grantOdds, makeTermSheet, roundBlock } from './deeptech-funding'
import { bestProgram, bestTrial, maxPrograms, programCost, slotCount, startProgram, startTrial, trialCost } from './deeptech-rd'
import { SERIES, type TechState } from './deeptech-state'
import { testFlightAuto } from './deeptech-menu'
import { totalOutlets, type BizState } from './state'
import { money, unitMoney, units } from './util'

export function deepTechManagerTurnImpl(g: GameState, a: Asset, b: BizState): void {
  if (!g.character.alive) return
  const t = techOf(b)
  const ind = dtInd(b)
  let runway = runwayYears(g, a, b, t)
  const hired = b.ceo === 'manager' && !!b.manager
  const smart = hired && (b.manager?.skill ?? 0) > SMART_SKILL
  const mandate = hired ? boardOf(b).mandate : 'balanced'
  const lines: string[] = []
  let big = false

  // 1) Money: raise when the runway gets short.
  if (!b.public && runway < 2) {
    if (!roundBlock(g, b, t)) {
      const ts = makeTermSheet(g, a, b, t)
      if (!ts.down || runway < 1) {
        closeRound(g, a, b, t, ts)
        log(g, `${a.name} raised ${money(ts.amount)} in a ${SERIES[ts.series]} (I now own ${Math.round(b.share * 100)}%).`, 'neutral')
        lines.push(`Raised ${money(ts.amount)} in a ${SERIES[ts.series]} round. You now own ${Math.round(b.share * 100)}%.`)
        big = true
      }
    } else if (runway < 0.8 && !bridgeBlock(g, b, t)) {
      const ts = makeTermSheet(g, a, b, t, true)
      closeRound(g, a, b, t, ts)
      log(g, `${a.name}'s investors put in a ${money(ts.amount)} bridge round to keep the lights on.`, 'neutral')
      lines.push(`Took a ${money(ts.amount)} bridge round from our investors.`)
      big = true
    }
    runway = runwayYears(g, a, b, t)
  }

  // 2) The pace follows the money.
  t.pace = runway < 1 ? 'lean' : 'steady'

  // 3) Keep the lab busy, but never bet the company: a full year of everything must be covered.
  for (let i = 0; i < 3 && slotCount(b, t) < maxPrograms(b, t); i++) {
    const funds = techFunds(b, t)
    const burn = burnRate(g, a, b, t)
    // An idle lab may bet on its next milestone with half a year of burn in reserve; the mandate
    // moves the cushion (growth bets harder, profit and cash keep more back).
    const cushion = !smart ? 1 : mandate === 'growth' ? 0.75 : mandate === 'balanced' ? 1 : 1.5
    const reserve = (t.programs.length === 0 ? burn * 0.5 : burn) * cushion
    if (ind === 'biotech') {
      const d = bestTrial(b, t, funds)
      if (d && reserve + trialCost(b, d) <= funds) {
        const p = startTrial(g, b, t, d)
        if (p) {
          log(g, `${a.name}'s manager started ${p.name}.`)
          lines.push(`Started ${p.name}.`)
          continue
        }
      }
    }
    const def = bestProgram(g, a, b, t)
    if (!def) break
    if (reserve + programCost(b, t, def) > funds) break
    const p = startProgram(g, b, t, def)
    if (!p) break
    log(g, `${a.name}'s manager started an R&D program: ${p.name}.`)
    lines.push(`Started the R&D program "${p.name}".`)
    big = true
  }

  // 4) A grant application a year.
  const gr = bestGrant(g, a, b, t)
  if (gr) {
    g.yearActions[grantKey(a, gr)] = (g.yearActions[grantKey(a, gr)] ?? 0) + 1
    const amount = grantAmount(b, t, gr)
    if (amount > 0 && chance(g, grantOdds(g, a, b, t, gr))) {
      awardGrant(g, t, gr, amount)
      log(g, `${a.name} won a ${gr.name} worth ${money(amount)}.`, 'good')
      lines.push(`Won a ${gr.name} worth ${money(amount)}.`)
    }
  }

  // 5) Industry chores.
  if (ind === 'spaceTech' && t.stage === 2 && techFunds(b, t) > 0) testFlightAuto(g, a, b, t)
  if (ind === 'aiLab' && t.models.length >= 3 && t.rented + t.plant < 1) t.rented = 1
  if (ind === 'aiLab' && runway < 0.8 && t.rented > 0) t.rented -= 1

  // 5b) Keep up with the market: turning customers away hands them to rivals for good.
  const opened = scaleUp(g, a, b, t, smart)
  if (opened) {
    lines.push(opened)
    big = true
  }

  // Don't leave unknown program ids lying around (old saves, renamed programs).
  t.programs = t.programs.filter((p) => p.id === 'trial' || !!programDef(ind, p.id) || PROGRAMS[ind].length === 0)

  // 6) Next year's price and production, with the tech in mind (the year itself re-plans with the
  // manager's skill-sized mistakes: deeptech-sim).
  if (sellable(g, b, t)) {
    const plan = bestTechPlan(g, b, t)
    b.price = plan.price
    b.production = plan.production
    const def = industryDef(b.industry)
    lines.push(`Next year, ${units(b.production)} ${b.production === 1 ? def.unitOne : def.unit} at ${unitMoney(b.price)} each.`)
  } else {
    b.production = 0
    lines.push(`Nothing to sell yet. The lab is ${t.programs.length ? `working on ${t.programs.length} program${t.programs.length === 1 ? '' : 's'}` : 'between programs'}.`)
  }
  revalue(g, a, b, t)
  if (hired) ceoLetter(g, a, b, lines, big)
}

/**
 * A manager opens more sites when last year's demand ran well past what the company could make,
 * paying from company cash only and keeping a year of burn in reserve. A cautious one opens up to
 * 25 a year; a CEO above 75 builds what the demand needs, within the board's budget and the
 * mandate's cash reserve. Returns the letter line ('' when nothing opened).
 */
function scaleUp(g: GameState, a: Asset, b: BizState, t: TechState, smart: boolean): string {
  const s = b.last
  if (!s || !sellable(g, b, t) || s.demand <= s.sold * 1.15) return ''
  const plan = techPlan(g, b, t, g.year, { calm: true })
  const per = plan.capacity / Math.max(1, totalOutlets(b))
  if (!(per > 0) || plan.demand <= plan.capacity * 1.05) return ''
  const capital = localEcon(b.industry, b.countryId, b.city).capital
  let reserve = burnRate(g, a, b, t)
  let budget = Infinity
  if (smart) {
    const st = boardOf(b)
    reserve = Math.max(reserve, reserveDollars(b, st))
    budget = capexLeft(g, b, st)
  }
  const affordable = Math.floor(Math.min(Math.max(0, b.cash - reserve), budget) / Math.max(1, capital))
  const n = Math.min(smart ? Infinity : 25, affordable, Math.ceil((plan.demand - plan.capacity) / per))
  if (!(n > 0)) return ''
  b.cash -= n * capital
  if (smart) noteSpend(g, boardOf(b), n * capital)
  const home = b.outlets.find((o) => o.countryId === b.countryId && o.city === b.city)
  if (home) home.count += n
  else b.outlets.push({ countryId: b.countryId, city: b.city, count: n, opened: g.year })
  const def = industryDef(b.industry)
  log(g, `${a.name}'s manager opened ${n} new ${n === 1 ? def.site : def.sitePlural} to keep up with demand.`, 'neutral')
  return `Opened ${n} ${n === 1 ? def.site : def.sitePlural} for ${money(n * capital)}.`
}

