// Product R&D on the Effort engine (R3-M2, C.3): the adapter between rd.ts and effort/. A leaf of the business import graph: it takes
// numbers and plain records and imports only modules outside the 59-module cycle (the engine, util, the seam research-effort.ts), so
// rd.ts can call it without a new import cycle. Whatever needs a member of the cycle (the CEO's skill, the staff's power, the cost of an
// idea) is read by rd.ts and handed in.
//
//   rdField       the know-how key of a product family ('rd.espressoBarDrink'): one per family, so a flop teaches the next try at it
//   rdBase        the odds a project at a normal budget starts from: launchP, the manager, the quality and the research team
//   rdTask        the Task of a product project, calibrated to the numbers rd.ts always had (odds clamp .05 to .95, 1 to 4 years,
//                 quality 5 to 97 as a hard clamp, hit 15% of the wins for 10 points, landing within 8 points)
//   rdInputs      the EffortInput of one quote: the budget, the company's know-how in the family, the owner or a steady manager, the team
//                 as a labelled term of the odds
//   rdResolve     how a finished project came out: the stored odds decide, and the draws are the ones rd.ts always made, in order
//   rdAfterword   what a finished project adds to its results line: the cause when it failed, then what it taught
//   rdStartFx     the effort record of a project the owner started strained (a push, or tired), and nothing for a default one
//   rdOddsLine    "Odds 62%: team +9, funding +7" for a quote, read through the reveal policy
//
// At the default actor (ambition 50, steady, no know-how, no fatigue) the engine returns exactly what rd.ts did, so a default life plays
// the same. Money still buys odds, speed and quality and never a lower price: the cost is the idea's (rd.ts rdCost) and never a share
// of what the company holds, and the budget multiple stops at the task's `kmax` (RD_MAX). The manager's and the quality staff's skill
// is the base the odds start from, so the odds line names the team (the scientists, as the points they add to that base), the funding,
// and then what the engine adds (know-how, a tired owner, a bold plan).
//
// Nothing here draws a number (`rdResolve` is handed the draw) or books a dollar. A module-level const is a literal (rule (d) of the layer
// ratchet).
import { newFx } from '../effort/fx'
import { revealPolicyOf } from '../effort/hooks'
import { resolve } from '../effort/step'
import { defineTask } from '../effort/task'
import { causeLine, oddsLine, payoffLine } from '../effort/why'
import type { EffortInput, Fx, Outcome, Quote, Reason, StepResult, Task } from '../effort/types'
import type { GameState } from '../types'
import { launchSkill, launchTeam, researchActorOf, researchInputsOf, type ResearchSnap } from './research-effort'
import { clampN } from './util'

/** The longest a know-how key can be (effort/task.ts FIELD_RE), and the most of it the family's words may take after 'rd.'. */
const FIELD_NAME_MAX = 37

/**
 * The know-how key of a product family: 'rd.' and the family's words in camel case, cut to the key's length ('Espresso Bar Drink' is
 * 'rd.espressoBarDrink'). A family with no letters or digits, and anything that is not a name, is 'rd.line'. Families that differ only
 * past the cut, or in a character the key can't hold, share one field: harmless, and it keeps the key a plain word.
 */
export function rdField(family: string): string {
  const words = typeof family === 'string' ? family.split(/[^A-Za-z0-9]+/).filter((w) => w !== '') : []
  const name = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1)).join('')
  return `rd.${name !== '' ? name.slice(0, FIELD_NAME_MAX) : 'line'}`
}

/** The odds a project at a normal budget starts from: the skill part and the research team's part, kept inside .1 to .9 (rd.ts launchP). */
export function rdBase(s: ResearchSnap): number {
  return clampN(launchSkill(s) + launchTeam(s.scientists), 0.1, 0.9)
}

/**
 * The Task of a product project: what an idea costs at a normal budget, the years it takes at that budget, and the family's know-how
 * key. The odds, the years and the quality follow the curves rd.ts always had: `1 - (1 - p0) * k^-.4` kept inside .05 to .95, `base
 * years / sqrt(k)` rounded up to 1 to 4, a budget curve of 28 up and 14 down in quality kept inside 5 to 97, no crew term (the team is
 * in the odds already), a hit (15% of the wins) for 10 points, a landing within 8 points. `p0` is the odds at a normal budget (rdBase).
 */
export function rdTask(cost: number, baseYears: number, family: string, kmax: number, p0 = 0.5): Task {
  return defineTask({
    field: rdField(family),
    mode: 'project',
    cost,
    baseYears,
    minYears: 1,
    maxYears: 4,
    kmax,
    p0,
    oddsExp: 0.4,
    yearsExp: 0.5,
    oddsLo: 0.05,
    oddsHi: 0.95,
    quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
    hit: { p: 0.15, bonus: 10 },
    spread: 8,
  })
}

/** The research team as a term of the odds: the points the scientists add to the company's odds, or nothing when they add none. */
function teamTerm(s: ResearchSnap): Reason | null {
  const pts = Math.round((rdBase(s) - clampN(launchSkill(s), 0.1, 0.9)) * 100)
  return pts !== 0 ? { key: 'team', label: 'team', pts } : null
}

/**
 * The input of one quote of a product project at `k` times its normal budget: the company's know-how in the family (`knowHow`, its own
 * map), the owner's ambition, posture and tiredness (a company the player runs) or a steady manager (a hired CEO), the odds the project
 * starts from (rdBase) with the team as its own labelled term, and `quality0`, the quality before the budget (the company, the manager,
 * the quality staff and the talents, which rd.ts reads). The crew is not a second term: the manager, the staff and the team are in the
 * base already.
 */
export function rdInputs(g: GameState, s: ResearchSnap, knowHow: Readonly<Record<string, number>> | undefined, family: string, k: number, quality0: number): EffortInput {
  const input = researchInputsOf(g, s, true, knowHow, rdField(family), k)
  delete input.people
  input.base = rdBase(s)
  input.quality0 = quality0
  const team = teamTerm(s)
  if (team !== null) input.baseTerms = [team]
  return input
}

/**
 * How a finished project came out. The stored odds decide, as they always did: the first draw is under them or not, and only a project
 * that works draws the second, for a hit (under `hitP`). `draw` is the caller's `rand`, called in that order and never more, so every
 * seeded life keeps its random stream. The cause of a failure is read from `reasons`, the lines of a quote of the project as it finishes.
 */
export function rdResolve(odds: number, hitP: number, reasons: readonly Reason[], draw: () => number): Outcome {
  // `resolve` reads the odds, the hit chance and the lines of its quote and nothing else.
  const q = { p: odds, hitP, reasons } as Quote
  return resolve(q, draw(), { drawHit: draw })
}

/**
 * What a finished project adds to its results line, after the words it always had: why it failed (a thin budget, a tired owner, a
 * bold plan, or a dead end) and what it taught ("The failure still taught you the field: know-how 17."), or for a win the know-how
 * the company holds when it holds some. Empty for a company that books nothing (`result` is null: an NPC company), for a replay and for
 * a win in a family the company knows nothing of. `family` is the product family, in words.
 */
export function rdAfterword(task: Task, out: Outcome, result: StepResult | null, family: string): string {
  if (result === null || result.replay) return ''
  const won = out.kind === 'works' || out.kind === 'hit'
  if (won && !(result.knowledge > 0)) return ''
  const parts: string[] = []
  if (!won && out.cause !== null) parts.push(causeLine(out.cause, family))
  parts.push(payoffLine(task, out, result))
  return parts.join(' ')
}

/**
 * The effort record of a project the owner starts, only when it carries something: the owner pushing, or tired (their tiredness is
 * the record's `fatigue`). A hired manager's project and a default one carry nothing, so they save what v5.0.0 saved.
 */
export function rdStartFx(g: GameState, s: ResearchSnap, year: number): Fx | undefined {
  const who = researchActorOf(g, s, true)
  if (!who.you || (who.posture === 'steady' && !(who.fatigue > 0))) return undefined
  return { ...newFx(year), fatigue: Math.round(clampN(who.fatigue, 0, 100)) }
}

/**
 * The odds line of a quote, "Odds 62%: team +9, funding +7": the odds and the lines that moved them, as far as the reveal policy lets
 * the player read them (every number, until Fog binds a realistic policy). The engine's `oddsLine` reads only the odds and the lines.
 */
export function rdOddsLine(g: GameState, q: { odds: number; why: readonly Reason[] }): string {
  return oddsLine({ p: q.odds, reasons: [...q.why] } as Quote, revealPolicyOf(g))
}
