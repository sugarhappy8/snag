// What a hired general manager does every year for a deep-tech company the player doesn't run:
// keeps the lab busy within the runway, raises the next round when money runs low, applies for
// the best grant, flies test rockets, rents compute for training runs. Cautious, not brilliant.
import { log } from '../core'
import { chance } from '../rng'
import type { Asset, GameState } from '../types'
import { PROGRAMS, programDef } from './deeptech-data'
import { burnRate, dtInd, revalue, runwayYears, techFunds, techOf } from './deeptech-core'
import { bestGrant, bridgeBlock, closeRound, grantAmount, grantKey, grantOdds, makeTermSheet, roundBlock } from './deeptech-funding'
import { bestProgram, bestTrial, maxPrograms, programCost, startProgram, startTrial, trialCost } from './deeptech-rd'
import { SERIES } from './deeptech-state'
import { testFlightAuto } from './deeptech-menu'
import { type BizState } from './state'
import { money } from './util'

export function deepTechManagerTurnImpl(g: GameState, a: Asset, b: BizState): void {
  if (!g.character.alive) return
  const t = techOf(b)
  const ind = dtInd(b)
  let runway = runwayYears(g, a, b, t)

  // 1) Money: raise when the runway gets short.
  if (!b.public && runway < 2) {
    if (!roundBlock(g, b, t)) {
      const ts = makeTermSheet(g, a, b, t)
      if (!ts.down || runway < 1) {
        closeRound(g, a, b, t, ts)
        log(g, `${a.name} raised ${money(ts.amount)} in a ${SERIES[ts.series]} (I now own ${Math.round(b.share * 100)}%).`, 'neutral')
      }
    } else if (runway < 0.8 && !bridgeBlock(g, b, t)) {
      const ts = makeTermSheet(g, a, b, t, true)
      closeRound(g, a, b, t, ts)
      log(g, `${a.name}'s investors put in a ${money(ts.amount)} bridge round to keep the lights on.`, 'neutral')
    }
    runway = runwayYears(g, a, b, t)
  }

  // 2) The pace follows the money.
  t.pace = runway < 1 ? 'lean' : 'steady'

  // 3) Keep the lab busy, but never bet the company: a full year of everything must be covered.
  for (let i = 0; i < 3 && t.programs.length < maxPrograms(b, t); i++) {
    const funds = techFunds(b, t)
    const burn = burnRate(g, a, b, t)
    if (ind === 'biotech') {
      const d = bestTrial(b, t, funds)
      if (d && burn + trialCost(b, d) <= funds) {
        const p = startTrial(g, b, t, d)
        if (p) {
          log(g, `${a.name}'s manager started ${p.name}.`)
          continue
        }
      }
    }
    const def = bestProgram(g, a, b, t)
    if (!def) break
    if (burn + programCost(b, t, def) > funds) break
    const p = startProgram(g, b, t, def)
    if (!p) break
    log(g, `${a.name}'s manager started an R&D program: ${p.name}.`)
  }

  // 4) A grant application a year.
  const gr = bestGrant(g, a, b, t)
  if (gr) {
    g.yearActions[grantKey(a, gr)] = (g.yearActions[grantKey(a, gr)] ?? 0) + 1
    const amount = grantAmount(b, t, gr)
    if (amount > 0 && chance(g, grantOdds(g, a, b, t, gr))) {
      t.venture += amount
      t.yearGrant += amount
      t.grants.push({ id: gr.id, year: g.year, amount })
      log(g, `${a.name} won a ${gr.name} worth ${money(amount)}.`, 'good')
    }
  }

  // 5) Industry chores.
  if (ind === 'spaceTech' && t.stage === 2 && techFunds(b, t) > 0) testFlightAuto(g, a, b, t)
  if (ind === 'aiLab' && t.models.length >= 3 && t.rented + t.plant < 1) t.rented = 1
  if (ind === 'aiLab' && runway < 0.8 && t.rented > 0) t.rented -= 1

  // Don't leave unknown program ids lying around (old saves, renamed programs).
  t.programs = t.programs.filter((p) => p.id === 'trial' || !!programDef(ind, p.id) || PROGRAMS[ind].length === 0)
  revalue(g, a, b, t)
}
