// The business research seam (R3-M1, C.3): the one place where what a company knows about its own research becomes the inputs of the
// Effort engine (effort/engine.ts `quote`, effort/step.ts `step`), and the two parts `launchP` is made of.
//
// A leaf of the business import graph. It imports numbers, plain records and modules outside the 59-module business cycle (util,
// state, lab-data, lab-state, board-state), so the adapters of every research system (product R&D, Heavy R&D, the lab, deep tech,
// the AI capability tracks, the studio engines) can call it without joining the cycle. Whatever needs a member of the cycle (the
// CEO's skill, the staff's power) is read by the caller, in `researchState` (rd.ts), and handed in as a `ResearchSnap`.
//
//   launchSkill, launchTeam   the two parts of rd.ts `launchP`: the manager and the quality staff, and the research team
//   researchPeople            the crew as the engine counts it: the CEO or owner, the quality staff, each scientist
//   researchActor             who is doing the work: the player (an owner-run company) or nobody in particular (a hired CEO, an NPC),
//                             and, for a hired CEO of the player's own company, the steady CEO's line of the odds (ceo-edge.ts, J.8)
//   withCeoEdge               puts that line into an input: a labelled base term and its points in the base (the one place J.8 acts)
//   researchInputs            the EffortInput of one run: budget, crew, tools, the company's know-how in the field, the frontier
//   frontierFieldOf/Inputs    the world's public research and rival pressure for a trade or an AI capability (the only caller of
//                             frontierTerms in R3, D37): zero while no one has pushed the field
//   bookResearch              books a finished run through `step`: a failure banks know-how in the company's own map
//
// Who it is (D11): posture and ambition are the player's own, so an owner-run company (no hired CEO, an owner who is alive) takes the
// persona's ambition, posture and fatigue (`who: 'you'`). A hired-CEO company and an NPC company are steady, ambition 50, fatigue 0,
// whatever the board mandate says: a push with nobody to tire would be a free edge. Only the player's own companies bank know-how
// (`a` is the asset; an NPC company has none), so the NPC economy and the golden digests keep today's bytes.
//
// Nothing here draws a number or books a dollar, and every function that reads is a read: it writes nothing. `bookResearch` is the
// one writer, and it writes the company's `knowHow` only when a run banked something, so a default life saves what v5.0.0 saved.
// A module-level const here is a literal (rule (d) of the layer ratchet).
import { K_MAX, K_MIN } from '../effort/limits'
import { ambitionOf, fatigueOf, postureOf } from '../effort/persona'
import { knowHowOf } from '../effort/knowhow'
import { clampNum } from '../effort/num'
import { step } from '../effort/step'
import type { EffortInput, Fx, Outcome, Posture, Reason, StepCtx, StepResult, Task, Worker } from '../effort/types'
import type { Asset, GameState } from '../types'
import { fieldOfCap, fieldOfTrade, type FieldId } from '../world/frontier-fields'
import { frontierTerms } from '../world/frontier-terms'
import type { Mandate } from './board-state'
import { topCeoPts } from './ceo-edge'
import { TEAM_ODDS } from './lab-data'
import { LAB_LIMITS, teamPower } from './lab-state'
import { bizOf, type BizState } from './state'

/**
 * What the research of a company comes to in numbers, read once by `researchState` (rd.ts). `skill` is whoever runs the company
 * (the owner's, or the hired manager's), `qualityStaff` is the key staff's power for quality (0 for nobody, about 1 for one strong
 * hire, at most 2.5), `scientists` the research team's head count.
 */
export interface ResearchSnap {
  year: number
  skill: number
  quality: number
  qualityStaff: number
  scientists: number
  /** True when the player's own hands are not on it: a hired CEO runs the company, or the owner is dead. */
  managed: boolean
  /** The hired manager's skill, 0 when there is none. */
  managerSkill: number
  morale: number
  mandate: Mandate
  /**
   * How steady a hired CEO keeps the research, 0 to 1 (ceo-edge.ts topCeoSteady of the best hired CEO's skill: the company's own
   * manager, or the autonomous group CEO's over it). Read by `researchState` (rd.ts) because the group is a member of the cycle.
   * 0 or absent for an owner-run company and for a CEO rated 90 or less.
   */
  steady?: number
}

/** The skill a research scientist counts for in the crew (a competent professional: the stored team keeps hire years only). */
const SCIENTIST_SKILL = 60
/** The most the quality staff's power can be (leadership.ts saturates at 2.5), and the most people it counts as. */
const STAFF_POWER_MAX = 2.5
const STAFF_PEOPLE_MAX = 3

/** The skill part of the odds a project at a normal budget works: the manager, the quality of the company and the quality staff. */
export function launchSkill(s: ResearchSnap): number {
  return 0.25 + s.skill / 250 + s.quality / 300 + 0.1 * s.qualityStaff
}

/** The research team's part: each scientist adds TEAM_ODDS times the one before's share (lab-state.ts teamPower), up to the team limit. */
export function launchTeam(scientists: number): number {
  return TEAM_ODDS * teamPower(scientists)
}

/**
 * Whether the player's own hands are on the research: the company has no hired CEO and its owner is alive. The same test the CEO's
 * skill uses (economy.ts ceoSkill reads the manager for a managed company or a dead owner).
 */
export function ownerRuns(g: Pick<GameState, 'character'>, b: Pick<BizState, 'ceo'>): boolean {
  return b.ceo !== 'manager' && g.character.alive
}

/**
 * The crew as the engine counts it: the CEO or owner (one person at `skill` and the company's morale), the quality staff as skilled
 * labor equal to its power (the same labor, in at most three people, so no more than 2.5 people-at-100 however much it is told), and
 * each scientist of the lab (one person, up to the team limit). Every number is cut to its range; a morale that is not a number is
 * the middle.
 */
export function researchPeople(s: ResearchSnap): Worker[] {
  const morale = clampNum(s.morale, 0, 100, 50)
  const people: Worker[] = [{ fte: 1, skill: clampNum(s.skill, 0, 100, 50), morale }]
  const power = clampNum(s.qualityStaff, 0, STAFF_POWER_MAX, 0)
  if (power > 0) {
    const n = Math.min(STAFF_PEOPLE_MAX, Math.max(1, Math.ceil(power)))
    people.push({ fte: n, skill: Math.round((100 * power) / n), morale })
  }
  const scientists = Math.floor(clampNum(s.scientists, 0, LAB_LIMITS.team, 0))
  for (let i = 0; i < scientists; i++) people.push({ fte: 1, skill: SCIENTIST_SKILL, morale })
  return people
}

/** Who does the research: the player or not, how they work, and the crew. */
export interface ResearchActor {
  /** True for the player's own work (an owner-run company). */
  you: boolean
  posture: Posture
  /** 0 to 100, 50 is neutral. */
  ambition: number
  /** 0 to 100. */
  fatigue: number
  people: Worker[]
  /** The steady CEO's line of the odds (J.8), or null: only a hired CEO of the player's own company has one. */
  ceo: Reason | null
}

/**
 * The actor of a company's research. An owner-run company of the player's is the player: the persona's posture, ambition and fatigue.
 * A hired-CEO company and an NPC company (`a` is null) are steady, ambition 50, fatigue 0, whatever the board mandate says (D11).
 */
export function researchActor(g: GameState, s: ResearchSnap, a: Asset | null): ResearchActor {
  return researchActorOf(g, s, a !== null)
}

/**
 * The actor of a company's research when the caller knows whether the company is the player's (`own`) but holds a copy of its state
 * and not the asset (a menu reads `readBiz`, which is a copy, so no asset is at hand there). `researchActor` is this with `a !== null`.
 */
export function researchActorOf(g: GameState, s: ResearchSnap, own: boolean): ResearchActor {
  const people = researchPeople(s)
  if (own && !s.managed) return { you: true, posture: postureOf(g), ambition: ambitionOf(g), fatigue: fatigueOf(g), people, ceo: null }
  return { you: false, posture: 'steady', ambition: 50, fatigue: 0, people, ceo: own ? ceoTerm(s) : null }
}

/**
 * The steady CEO's line (J.8): `TOP_CEO_MAX_PTS` times how steady the hired CEO keeps the lab, as a labelled term of the odds. Null
 * for no edge (an owner-run company, a CEO rated 90 or less). The points are exact (a CEO rated 95 is 1.5): the odds line rounds them
 * to read. Pure, and not for an NPC company (the caller leaves it out, see `researchActorOf`).
 */
function ceoTerm(s: ResearchSnap): Reason | null {
  const pts = topCeoPts(clampNum(s.steady, 0, 1, 0))
  return pts > 0 ? { key: 'ceo', label: 'steady CEO', pts } : null
}

/**
 * Puts the steady CEO's edge into the input of one quote, as the last of its base terms and as odds in its base: at a budget of one
 * the base moves by exactly the line's points, and at another budget by those points times `k` to the task's odds exponent, so
 * the odds the quote gives move by the line and money does not widen it (the engine's money curve would otherwise stretch a
 * point at a small budget). The base is the task's `p0` when the input has none. The price, the years and the quality are not
 * touched, the odds stay inside the task's own clamp, and no money moves. An input with no edge is returned as it is; with one, a
 * copy is. `own` is whether the company is the player's: an NPC company's research is not lifted.
 */
export function withCeoEdge(input: EffortInput, s: ResearchSnap, own: boolean, task: Pick<Task, 'p0' | 'oddsExp' | 'kmax'>): EffortInput {
  const term = own && s.managed ? ceoTerm(s) : null
  if (term === null) return input
  const top = Math.max(K_MIN, Math.min(task.kmax, K_MAX))
  const k = Math.min(top, Math.max(K_MIN, clampNum(input.k, -Infinity, Infinity, 1)))
  const base = clampNum(input.base, 0, 1, task.p0)
  const moved = (term.pts / 100) * Math.pow(k, task.oddsExp)
  return { ...input, base: Math.min(1, base + moved), baseTerms: [...(input.baseTerms ?? []), term] }
}

/**
 * The frontier field a piece of research is in: the AI capability's own field when it names one, else the field of the trade. A
 * capability wins over the trade of the same name ('robotics' the capability is `ai.robotics`, 'robotics' the trade is `automation`),
 * so a caller names both and the more specific one is read. Null for a trade and a capability that no field stands for.
 */
export function frontierFieldOf(trade: string, cap?: string): FieldId | null {
  return (cap === undefined ? null : fieldOfCap(cap)) ?? fieldOfTrade(trade)
}

/**
 * What the world's research does to the odds in a field: public research (odds points, 0 to 18) and rival pressure (0 to 8), both 0
 * while no one has pushed the field and for a null field. Pure; `quote` bounds them again.
 */
export function frontierInputs(g: Pick<GameState, 'world' | 'year'>, field: FieldId | null): { spill: number; rival: number } {
  const t = frontierTerms(g, field)
  return { spill: t.spill, rival: t.rival }
}

/**
 * The EffortInput of one run of a company's research: the budget multiple `k`, the crew, `tools` (0 to 1), the company's own know-how
 * in `field` (its `knowHow` map; an NPC company has none) and, for a field the world researches (`front`, from `frontierFieldOf`),
 * public research and rival pressure. The owner-run company says `who: 'you'` and the engine reads the persona; any other company
 * says steady, ambition 50 and fatigue 0 itself. It leaves the odds before the engine's terms (`base`) and the task to the caller.
 */
export function researchInputs(g: GameState, s: ResearchSnap, a: Asset | null, field: string, k: number, tools = 0, front: FieldId | null = null): EffortInput {
  const map = a !== null ? (a.details.knowHow as unknown as Readonly<Record<string, number>> | undefined) : undefined
  return researchInputsOf(g, s, a !== null, map, field, k, tools, front)
}

/**
 * `researchInputs` for a caller that holds the company's state (its `knowHow` map) and not the asset: `own` says whether the company
 * is the player's, `knowHow` is the company's map (undefined for none). The same inputs, bit for bit, as `researchInputs` gives.
 */
export function researchInputsOf(g: GameState, s: ResearchSnap, own: boolean, knowHow: Readonly<Record<string, number>> | undefined, field: string, k: number, tools = 0, front: FieldId | null = null): EffortInput {
  const actor = researchActorOf(g, s, own)
  const map = own ? knowHow : undefined
  const world = frontierInputs(g, front)
  const input: EffortInput = { k, people: actor.people, tools, knowledge: knowHowOf(map, field), spill: world.spill, rival: world.rival }
  if (actor.you) input.who = 'you'
  else {
    input.posture = actor.posture
    input.ambition = actor.ambition
    input.fatigue = actor.fatigue
  }
  return input
}

/** What a caller knows about the run it books, besides the outcome (see StepCtx): the year, the project's own `fx`, the budget multiple, the weeks. */
export interface BookCtx {
  year?: number
  fx?: Fx
  k?: number
  weeks?: number
  quality?: number
}

/**
 * Books a finished run of a company's research through `step`. A run that did not work banks know-how in the company's own map
 * (`BizState.knowHow`, by reference; made only when something was banked, so a win leaves no key); an owner-run win also lifts the
 * player's ambition a little. Returns what `step` did (its `replay`, `learned`, `knowledge` and the `reveals`), or null for an NPC
 * company: `a` is null, nothing is booked and no state moves. The caller draws the one number, `resolve`s it into the `outcome` and
 * pays through the ledger; this draws nothing and moves no money.
 */
export function bookResearch(g: GameState, a: Asset | null, task: Task, outcome: Outcome, ctx: BookCtx = {}): StepResult | null {
  if (a === null) return null
  const b = bizOf(g, a)
  const had = b.knowHow
  const map: Record<string, number> = had ?? {}
  const c: StepCtx = { year: ctx.year ?? g.year, know: map }
  if (ownerRuns(g, b)) c.who = 'you'
  if (ctx.fx !== undefined) c.fx = ctx.fx
  if (ctx.k !== undefined) c.k = ctx.k
  if (ctx.weeks !== undefined) c.weeks = ctx.weeks
  if (ctx.quality !== undefined) c.quality = ctx.quality
  const result = step(g, task, outcome, c)
  if (had === undefined && Object.keys(map).length > 0) b.knowHow = map
  return result
}
