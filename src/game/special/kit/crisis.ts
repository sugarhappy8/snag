// Career kit, crisis: a yearly event with two or three stances (safe, bold, cash), a roll whose odds
// come from one function, and a hint that prints that same function. `optionOdds` is the only place a
// probability is made, so the roll, the hint and `bestStance` cannot disagree. Every script is a
// one-shot: a replay, another owner or another year changes nothing.
import type { SRng } from '../../assets'
import { seeded } from '../../assets'
import { addStat } from '../../core'
import { typicalIncome } from '../../events/wealth-core'
import { chance, weightedPick } from '../../rng'
import { defineScript } from '../../scripts'
import type { TalentId } from '../../talents'
import { talentHint } from '../../talents'
import { outcomeTag } from '../../timeMachine'
import type { ChoiceOption, GameState, Json } from '../../types'
import { addFame, stableChoice, withHint } from '../common'
import { noteRival, familySeed } from './rivals'
import { rec, type CareerBase, type CareerStore } from './state'
import { careerCtx, careerSay, choiceRoom, claimChoice, careerAudit, offerChoice, type CareerCtx } from './year'

export type Stance = 'safe' | 'bold' | 'cash'

const STANCES: readonly Stance[] = ['safe', 'bold', 'cash']

/** What a branch does. Money, standing, fame, happiness and health move only through here. */
export interface Effects {
  money?: number
  standing?: number
  fame?: number
  happiness?: number
  health?: number
  /** Carries the name: action and script contexts have no peer ranking to look it up in. */
  grudge?: { id: string; name: string; by: number }
}

export interface Result { paid: number; earned: number }

export interface Branch<S extends CareerBase = CareerBase> {
  /** At most 120 static characters. */
  text: (r: Result) => string
  fx: Effects
  /** After the effects: record changes and non-money state on g (karma, a flag skill, a relationship). No money, no rng. */
  then?: (s: S, g: GameState) => void
}

export interface Option<S extends CareerBase, D> {
  /** Five words or fewer, imperative. */
  label: string
  emoji: string
  /** Pure, clamped to .05-.95. The only probability source for the roll and the hint. No odds means a fixed outcome: no roll, no rng, no percentage. */
  odds?: (g: GameState, s: S, d: D) => number
  good: (g: GameState, s: S, d: D) => Branch<S>
  bad?: (g: GameState, s: S, d: D) => Branch<S>
}

export interface CrisisDef<S extends CareerBase, D extends Record<string, Json>> {
  id: string
  title: string
  emoji: string
  /** Years before it may come again, default 4. */
  cool?: number
  /** Pure; 0 means not eligible. */
  weight: (g: GameState, s: S) => number
  /** The crisis data, from `r` (seeded by family, career, def, year and timeline), never g.rng. Stored in the modal. */
  make: (g: GameState, s: S, r: SRng) => D
  /** At most 140 static characters, ends "What will you do?". */
  scene: (g: GameState, s: S, d: D) => string
  options: Partial<Record<Stance, Option<S, D>>>
}

export interface CrisisSet<S extends CareerBase> {
  /** True when a crisis was queued. False when the budget, a cool-down, the pending cap or the roll said no. */
  offer(c: CareerCtx<S>): boolean
}

/** Chance of an offer per active career-year, drawn from g.rng after the settle marker. */
export const CRISIS_ODDS = 0.35

const ODDS_MIN = 0.05
const ODDS_MAX = 0.95
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// ---------------------------------------------------------------------------
// Odds, hints and values (all pure)

/** `about 65%`, to the nearest 5. */
export function oddsText(p: number): string {
  return `about ${Math.round(p * 20) * 5}%`
}

/** The option's odds clamped to .05-.95, or null for a fixed outcome. */
export function optionOdds<S extends CareerBase, D>(g: GameState, s: S, d: D, opt: Option<S, D>): number | null {
  if (!opt.odds) return null
  const p = opt.odds(g, s, d)
  return Number.isFinite(p) ? Math.min(ODDS_MAX, Math.max(ODDS_MIN, p)) : 0.5
}

/** Resolves one option: the roll (g.rng, rolled options only) and the branch it picked. */
export function rollOption<S extends CareerBase, D>(g: GameState, s: S, d: D, opt: Option<S, D>): { good: boolean; p: number | null; branch: Branch<S> } {
  const p = optionOdds(g, s, d, opt)
  const good = p === null ? true : chance(g, p)
  return { good, p, branch: good || !opt.bad ? opt.good(g, s, d) : opt.bad(g, s, d) }
}

/** standing + .6 fame + 6 money / typicalIncome + .4 happiness + .5 health. */
export function fxValue(g: GameState, fx: Effects): number {
  return num(fx.standing) + 0.6 * num(fx.fame) + (6 * num(fx.money)) / typicalIncome(g) + 0.4 * num(fx.happiness) + 0.5 * num(fx.health)
}

/** The stance with the best p x value(good) + (1 - p) x value(bad); ties keep the order safe, bold, cash. */
export function bestStance<S extends CareerBase, D>(g: GameState, s: S, d: D, def: CrisisDef<S, any>): Stance | null {
  let best: Stance | null = null
  let top = -Infinity
  for (const stance of STANCES) {
    const opt: Option<S, D> | undefined = def.options[stance]
    if (!opt) continue
    const p = optionOdds(g, s, d, opt)
    const good = fxValue(g, opt.good(g, s, d).fx)
    const value = p === null ? good : p * good + (1 - p) * fxValue(g, (opt.bad ?? opt.good)(g, s, d).fx)
    if (value > top) {
      top = value
      best = stance
    }
  }
  return best
}

/** The year's hot item for a career, the same for the sim and the hint. */
export function hot<T>(g: GameState, career: string, items: readonly T[]): T {
  return stableChoice(g, `career.${career}.hot`, items)
}

/** `{ hint }` only when the character has the talent. */
export function honest(g: GameState, talent: TalentId, text: string): { hint?: string } {
  return withHint(talentHint(g, talent, text))
}

// ---------------------------------------------------------------------------
// Effects

/**
 * Applies a branch's effects. A negative `money` pays at most the cash on hand (no debt); standing and
 * peak stay 0-100; a grudge is written through noteRival from the effect's own id and name.
 */
export function applyEffects<S extends CareerBase>(c: CareerCtx<S>, fx: Effects, label: string): Result {
  const g = c.g
  const s = c.s
  const out: Result = { paid: 0, earned: 0 }
  const m = fx.money
  if (typeof m === 'number' && Number.isFinite(m)) {
    if (m >= 1) out.earned = c.earn(label, m)
    else if (m <= -1) {
      const cash = Number.isFinite(g.character.money) ? Math.floor(Math.max(0, g.character.money)) : 0
      const n = Math.min(Math.round(-m), cash)
      if (n >= 1 && c.pay(label, n)) out.paid = n
    }
  }
  if (typeof fx.standing === 'number' && Number.isFinite(fx.standing)) {
    s.standing = Math.min(100, Math.max(0, Math.round(s.standing + fx.standing)))
    s.peak = Math.max(Math.min(100, Math.max(0, s.peak)), s.standing)
  }
  if (typeof fx.fame === 'number') addFame(g, fx.fame)
  if (typeof fx.happiness === 'number') addStat(g, 'happiness', fx.happiness)
  if (typeof fx.health === 'number') addStat(g, 'health', fx.health)
  if (fx.grudge) s.memory = noteRival(s.memory, { id: fx.grudge.id, name: fx.grudge.name }, c.year, { grudge: fx.grudge.by })
  return out
}

// ---------------------------------------------------------------------------
// Defining crises

export function defineCrises<S extends CareerBase>(o: {
  career: string
  store: CareerStore<S>
  talent: TalentId
  defs: readonly CrisisDef<S, any>[]
}): CrisisSet<S> {
  const { career, store, talent, defs } = o
  const scriptOf = (id: string): string => `career.${career}.${id}`
  const coolKey = (id: string): string => `crisis.${id}`

  const resolve = (def: CrisisDef<S, any>, g: GameState, choice: string, data: Json | undefined): void => {
    const opt: Option<S, any> | undefined = STANCES.includes(choice as Stance) ? def.options[choice as Stance] : undefined
    if (!opt || !store.has(g)) return
    const s = store.mut(g)
    if (!claimChoice(g, s, data, `${coolKey(def.id)}.${g.year}`)) return
    const d = rec(rec(data).d)
    const { good, p, branch } = rollOption(g, s, d, opt)
    const c = careerCtx(g, career, s)
    const result = applyEffects(c, branch.fx, def.title)
    branch.then?.(s, g)
    careerSay(c, def.title, branch.text(result), def.emoji, p === null ? 'neutral' : good ? 'good' : 'bad')
  }
  for (const def of defs) defineScript(scriptOf(def.id), (g, choice, data) => resolve(def, g, choice, data))

  return {
    offer(c) {
      const g = c.g
      if (!choiceRoom(c)) return false
      const eligible = defs.filter((def) => def.weight(g, c.s) > 0 && (c.s.cool[coolKey(def.id)] ?? -1) < c.year)
      if (eligible.length === 0 || !chance(g, CRISIS_ODDS)) return false
      const def = weightedPick(g, eligible, (x) => x.weight(g, c.s))
      const d = def.make(g, c.s, seeded(`${familySeed(g)}|crisis|${career}.${def.id}|${c.year}${outcomeTag(g, c.year)}`))
      const best = bestStance(g, c.s, d, def)
      const choices: ChoiceOption[] = []
      for (const stance of STANCES) {
        const opt: Option<S, any> | undefined = def.options[stance]
        if (!opt) continue
        const base: ChoiceOption = { id: stance, label: opt.label, emoji: opt.emoji }
        if (stance !== best) {
          choices.push(base)
          continue
        }
        const p = optionOdds(g, c.s, d, opt)
        choices.push({ ...base, ...honest(g, talent, p === null ? 'Looks best on average.' : `Looks best: ${oddsText(p)} to go well.`) })
      }
      if (!offerChoice(c, scriptOf(def.id), def.title, def.scene(g, c.s, d), choices, { id: def.id, d }, def.emoji)) return false
      c.s.cool[coolKey(def.id)] = Math.min(9999, c.year + Math.max(1, def.cool ?? 4) - 1)
      careerAudit({ t: 'crisis', career, id: def.id, stances: choices.map((x) => x.id) })
      return true
    },
  }
}
