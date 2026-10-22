// `quote(g, task, input)` (R3-E3, C.1): what a piece of work comes to if it is funded, crewed and carried out this way: the odds it
// works, the years it takes, the quality it lands at, the money it costs, and the labelled lines that say why. It is the one place
// the odds of a research system are worked out.
//
// Pure. It draws no random number and never reads the roll (the caller hands one number to `resolve`, step.ts), it books no dollar
// and reads no cash (`spend` is `k * cost`: money buys odds and speed and never a lower price), and it writes nothing: the same input
// on the same state gives the same quote, and a deep-frozen state with a trapped rng reads fine. It reads the game only for
// `who: 'you'`, and then only the player's own record (persona.ts). It reads named fields of the input and never walks it, so an
// input that carries anything else is never looked at.
//
// The model, in the order the numbers are worked out:
//   1. the budget multiple k is cut to K_MIN..min(kmax, K_MAX): more than four times the normal budget buys nothing more
//   2. money: `1 - (1 - base) * k^-oddsExp` (base is the caller's odds before the engine's terms, the task's p0 when left out)
//   3. deviations, each in odds points and exactly 0 at the defaults (tools, crew, know-how, a hard field, rivals, public research,
//      a bold plan, tiredness): the shifts of tools, crew, a hard field, a bold plan and tiredness add up in logit space so none can
//      push the odds past the clamp, and know-how, rivals and public research are then added in odds points, so each is worth exactly
//      its capped points (15, -8, 18) in the final odds whatever the other terms did
//   4. years: `baseYears / (k^yearsExp * speed)` with speed = crew * tools * ambition's pace * fatigue's pace * know-how's pace, rounded
//      up from the default actor's years while the actor is at most a quarter of a year slower (a hair's breadth is not a year)
//   5. quality: a budget curve plus know-how, bent under the task's ceiling
//   6. the lines: the caller's own terms (team, a steady CEO), then funding and the engine's terms, adding up to the odds
//
// Reasons: `reasons` is the caller's `baseTerms` first, passed through, then the engine's own lines in the order funding, crew, tools,
// know, hard, rival, spill, bold, tired. The engine's lines sum to `round(p * 100) - round(base * 100)`; a line of 0 is left out.
import type { GameState } from '../types'
import { boldOf, budgetQuality, crewRatio, knowOdds, phiOf, rhoOf, softCeil } from './curves'
import {
  attribute,
  cleanBaseTerms,
  crewPtsOf,
  deviate,
  hardPtsOf,
  moneyOdds,
  payrollOf,
  risksOf,
  speedOf,
  tiredPtsOf,
  toolsPts,
  totalFte,
  yearsOf,
} from './factors'
import { BURNOUT_F, K_MAX, K_MIN, KNOW_MAX, RHO_MAX } from './limits'
import { cutNum, isRecord } from './num'
import { youInput } from './persona'
import type { EffortInput, Posture, Quote, Task, Worker } from './types'
import { rivalPts, spillPts } from './world'

const POSTURES: readonly string[] = ['lean', 'steady', 'push']

/** A know-how bonus to quality: this many points at full know-how (100), in proportion below it. */
const KNOW_QUALITY = 3

const isPosture = (v: unknown): v is Posture => typeof v === 'string' && POSTURES.includes(v)

/** A field the caller left out is undefined; one it gave is theirs, even when it is garbage (which then reads as neutral). */
const given = (v: unknown): boolean => v !== undefined

/**
 * What a piece of work comes to. `g` is read only when the input says `who: 'you'`, to fill what the caller left out (ambition, the
 * posture in force, fatigue, know-how in this field) from the player's own record. Everything is total: a number that is not a number
 * is read as the neutral value, an infinity as the nearest end, and nothing throws.
 */
export function quote(g: GameState, task: Task, input: EffortInput): Quote {
  const i = (isRecord(input) ? input : {}) as Record<string, unknown>
  const you = i.who === 'you' ? youInput(g, task.field) : null

  // The budget: cut to what the task can use. `asked` keeps the raw request so a cut can be reported.
  const kTop = Math.max(K_MIN, Math.min(task.kmax, K_MAX))
  const asked = cutNum(i.k, -Infinity, Infinity, 1)
  const k = asked < K_MIN ? K_MIN : asked > kTop ? kTop : asked

  const base = cutNum(i.base, 0, 1, task.p0)
  const tools = cutNum(i.tools, 0, 1, 0)
  const ambition = cutNum(given(i.ambition) ? i.ambition : you?.ambition, 0, 100, 50)
  const rawPosture = given(i.posture) ? i.posture : you?.posture
  const posture: Posture = isPosture(rawPosture) ? rawPosture : 'steady'
  const fatigue = cutNum(given(i.fatigue) ? i.fatigue : you?.fatigue, 0, 100, 0)
  const knowAsked = cutNum(given(i.knowledge) ? i.knowledge : you?.knowledge, -Infinity, Infinity, 0)
  const know = cutNum(knowAsked, 0, KNOW_MAX, 0)
  const people = Array.isArray(i.people) ? (i.people as readonly Worker[]) : undefined

  // The actor and the crew, as numbers.
  const crew = crewRatio(task, people)
  const rho = rhoOf(ambition, posture)
  const phi = phiOf(fatigue)
  const bold = boldOf(ambition, posture)
  const speed = speedOf(crew, tools, rho, phi, task.knowYears, know)

  // Odds: money first, then the deviations (each zero at the defaults).
  const pk = moneyOdds(task, base, k)
  const { p, pieces } = deviate(
    pk,
    task.oddsLo,
    task.oddsHi,
    {
      crew: crewPtsOf(task, crew),
      tools: toolsPts(tools),
      know: knowOdds(know),
      hard: hardPtsOf(task.hardness),
      rival: -rivalPts(i.rival as number),
      spill: spillPts(i.spill as number),
      tired: tiredPtsOf(phi),
    },
    bold,
  )
  const reasons = [...cleanBaseTerms(i.baseTerms), ...attribute(base, p, [{ key: 'funding', pts: (pk - base) * 100 }, ...pieces])]

  // Years: the sqrt of the budget (the rd.ts shape) read bit for bit when the exponent is a half.
  const kPow = task.yearsExp === 0.5 ? Math.sqrt(k) : Math.pow(k, task.yearsExp)
  const yearsNormal = task.baseYears / kPow
  const yearsExact = task.baseYears / (kPow * speed)
  const years = yearsOf(yearsNormal, yearsExact, task.minYears, task.maxYears)

  // Quality: a budget curve plus know-how, cut to the curve's bounds, then bent under its ceiling.
  let quality: number | null = null
  let qualityCapped = false
  const curve = task.quality
  if (curve !== null) {
    const raw = cutNum(i.quality0, -1e6, 1e6, 0) + budgetQuality(k, curve) + (KNOW_QUALITY * know) / 100
    const cut = Math.min(curve.hi, Math.max(curve.lo, raw))
    const bent = softCeil(cut, curve.ceiling, curve.room)
    quality = Math.round(bent)
    qualityCapped = raw > curve.hi || bent < cut
  }

  const hit = task.hit
  const capped: string[] = []
  if (asked > kTop) capped.push('k')
  if (totalFte(people) > task.fteCap) capped.push('fte')
  if (knowAsked >= KNOW_MAX) capped.push('knowledge')
  if (qualityCapped) capped.push('quality')
  if (rho >= RHO_MAX) capped.push('rho')

  return {
    p,
    hitP: hit === null ? 0 : Math.min(0.5, Math.max(0, hit.p * (1 + 0.4 * bold))),
    years,
    yearsExact,
    quality,
    spread: task.spread * (1 + 0.5 * bold),
    k,
    spend: k * task.cost,
    payrollX: payrollOf(posture),
    reasons,
    effort: { crew, tools, rho, phi, speed },
    risk: risksOf(bold, task.hardness, posture),
    burnout: fatigue >= BURNOUT_F,
    capped,
  }
}
