// The insider rule of tech waves (release 1b, docs/superpowers/specs/2026-10-19-waves-stocks-design.md section 5.7, S13). A founder or
// CEO whose own company launches a breakthrough has traded on a secret if they bought the stocks it moves in the year before: this
// opens an insider case through the shared helper in special/politics.ts, which then runs through the existing exposure, regulator and
// arrest code. Only a wave the player's own company wrote (heavy launch, deep-tech milestone) comes here, in the year it is announced.
// Import direction: roleOf and TechWave come from the leaf, never from ./tech-waves (which calls this module). No g.rng, no draws; the
// only writes are the ones openInsiderCase makes.
import { local } from '../computer/money-common'
import { listedTargets } from '../computer/money-stocks'
import { SECTOR_TRADE, sectorOfSec, waveIndexFactor, waveStockFactor } from '../invest/wave-stocks'
import { insiderPositions, openInsiderCase, type InsiderCaseInput } from '../special/politics'
import type { GameState } from '../types'
import { hashOf } from './product-market'
import { businessAssets, readBiz, runsIt } from './state'
import { roleOf, type TechWave } from './tech-wave-factors'

/** The most cases one wave opens: the largest stakes. */
const MAX_CASES = 3
/** A wave must lift a stock by at least this much (a fraction) to count. */
const MIN_MOVE = 0.005

/**
 * Open the insider cases a launch earned and return how many. None unless the character is alive and free, the wave was announced
 * this year, and the asset is the player's company that they founded (role `founder`) or run (role `ceo`): a hired CEO or a plain
 * owner is no insider here. Targets are the listed stocks on the player's exchange whose sector is core or supply for the wave's kind;
 * the positions are the ones bought this year or last (`freshOnly`), open calls and longs, and index calls on that exchange. A stock the
 * wave lifts by under half a percent, a stake of nothing and a gain under a thousand dollars (local) open nothing; the three largest
 * stakes become cases. Idempotent: the case id comes from the wave and the stock, so a repeat opens nothing new.
 */
export function waveInsiderCases(g: GameState, w: TechWave, assetId: string): number {
  const c = g.character
  if (!c.alive || c.prison || w.year !== g.year) return 0
  const a = businessAssets(g).find((x) => x.id === assetId)
  if (!a) return 0
  const b = readBiz(g, a)
  const role = b.founderName && b.founderName === `${c.firstName} ${c.lastName}` && !b.acquired ? 'founder' : runsIt(g, a) ? 'ceo' : null
  if (!role) return 0
  const floor = local(g, 1000)
  const found: { stake: number; input: InsiderCaseInput }[] = []
  for (const t of listedTargets(g)) {
    const sector = sectorOfSec(t.secId), trade = sector ? SECTOR_TRADE[sector] : null
    const part = trade ? roleOf(w.kind, trade) : null
    if (part !== 'core' && part !== 'supply') continue
    const pos = insiderPositions(g, t, false, { freshOnly: true })
    const stake = pos.own + pos.crony + pos.shares + pos.index
    const mult = waveStockFactor(g, t.secId, w.year) / waveStockFactor(g, t.secId, w.year - 1)
    const indexGain = pos.indexUnits * Math.max(0, waveIndexFactor(g, t.exKey, w.year) / waveIndexFactor(g, t.exKey, w.year - 1) - 1)
    if (!(stake > 0) || !(mult - 1 >= MIN_MOVE) || !(pos.shares * (mult - 1) + indexGain >= floor)) continue
    found.push({ stake, input: { target: t, pos, mult, indexGain, role, note: w.name, company: a.name, key: hashOf(`${w.id}|${t.secId}`).toString(36) } })
  }
  let opened = 0
  for (const x of found.sort((p, q) => q.stake - p.stake).slice(0, MAX_CASES)) if (openInsiderCase(g, x.input)) opened++
  return opened
}
