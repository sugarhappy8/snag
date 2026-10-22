// Building prototypes and brainstorming. buildOdds/brainstormOdds are pure and are exactly the
// probabilities the resolvers roll against, so the Inventor talent's purple hints are honest.
import { addStat, count, formatMoney, log, notice, scriptChoice, spend, yearActionsUsed } from '../core'
import { goodsMult } from '../assets'
import { FOCUS_WEEKS, focusLeft, focusPreview, focusReason, spendFocus } from '../effort/focus'
import { newFx } from '../effort/fx'
import { burnedOut } from '../effort/persona'
import { step } from '../effort/step'
import type { Outcome, Quote, Reason } from '../effort/types'
import { payoffLine } from '../effort/why'
import { ageCeiling, capAt, liftSkill } from '../mastery'
import { rand } from '../rng'
import { defineScript } from '../scripts'
import { hasMainCharacter, talentHint } from '../talents'
import type { ChoiceOption, GameState, Json } from '../types'
import { type IdeaDef } from './catalog'
import { BUILD_COST, brainstormChance, buildLineQuote, buildNumbers, buildReasons, buildTask, type BuildFacts } from './effort'
import { addIdea, addRep, drawIdea, findIdea, findInvention, helperShare, isGenius, logIdea, mutWorkshop, readWorkshop, storeInv, workshopBlock, workshopTools } from './notebook'
import { NOTEBOOK_MAX, noteDef, rec, text, type Workshop } from './state'

export type Approach = 'safe' | 'bold' | 'cheap'
export const APPROACHES: Record<Approach, { label: string; emoji: string; cost: number; shift: number; spread: number; kaboom: number }> = {
  safe: { label: 'Play it safe', emoji: '\u{1F6E1}\u{FE0F}', cost: 1, shift: 0, spread: 16, kaboom: 0.05 },
  bold: { label: 'Go bold', emoji: '\u{1F680}', cost: 1, shift: 4, spread: 44, kaboom: 0.14 },
  cheap: { label: 'Cheap & cheerful', emoji: '\u{1F4B8}', cost: 0.4, shift: -12, spread: 20, kaboom: 0.12 },
}
export const MASTERPIECE = 88

/** Focus weeks one brainstorm takes, and how many brainstorms a year the pool is planned for. */
export const BRAINSTORM_WEEKS = 1
export const BRAINSTORMS = 2
/** Builds a year may run past the limit, as overtime (fatigue at the year's end). Past these a year is over, however many weeks are left. */
export const MAX_OVERTIME_BUILDS = 2

/** Focus weeks one build takes out of the year's pool of 12: 3, or 2 for a genius (the Inventor talent builds faster). */
export function buildWeeks(g: GameState): number {
  return isGenius(g) ? 2 : 3
}
/** The builds a year plans for: what the pool holds beside two brainstorms (3, or 5 for a genius). Past it a build is overtime. */
export function buildLimit(g: GameState): number {
  return Math.floor((FOCUS_WEEKS - BRAINSTORMS * BRAINSTORM_WEEKS) / buildWeeks(g))
}
/** Builds made this year. The counter counts focus weeks, like every key of the pool. */
function buildsMade(g: GameState): number {
  return Math.floor(yearActionsUsed(g, 'workshop.build') / buildWeeks(g))
}
/** Builds the pool still holds without overtime: the weeks left over the weeks a build takes. */
export function buildsLeft(g: GameState): number {
  return Math.floor(focusLeft(g) / buildWeeks(g))
}
/** What a build spends of the pool; the key's own full is the limit's weeks (the weeks past it are worth half, which a build does not use). */
const buildFull = (g: GameState): number => buildLimit(g) * buildWeeks(g)

/** What a bench assistant is paid a year at nominal prices (bench.ts hires one), and at local prices. */
export const HELPER_WAGE = 4000
export function helperWage(g: GameState): number {
  return Math.round(HELPER_WAGE * goodsMult(g))
}

/** Prototype cost (local prices); kids under 16 build easy things from scrap for free. */
export function buildCost(g: GameState, def: IdeaDef, approach: Approach): number {
  if (g.character.age < 16 && def.d <= 2) return 0
  return Math.round(BUILD_COST[def.d] * goodsMult(g) * APPROACHES[approach].cost)
}

/** What a build is aiming at: a notebook idea, or a patented invention not launched yet. */
export type Target = { kind: 'idea' | 'asset'; id: string }

export interface BuildOdds { kaboom: number; master: number; low: number; high: number }

const SKILL_CEILING = { from: 8, full: 22, floor: 35 }
/** Inventing skill as a build uses it: Main Character Syndrome lifts it to what this age allows. Pure. */
export function effectiveSkill(g: GameState, ws: Workshop): number {
  return hasMainCharacter(g) ? Math.max(ws.skill, ageCeiling(g.character.age, SKILL_CEILING)) : ws.skill
}

/** What a build reads of the maker (pure): effective skill, smarts, whether a genius, the idea's earlier builds, lab access and the assistant. */
function factsOf(g: GameState, ws: Workshop, builds: number): BuildFacts {
  return { skill: effectiveSkill(g, ws), smarts: g.character.stats.smarts, genius: isGenius(g), builds, tools: workshopTools(g), helper: helperShare(ws) }
}

/**
 * Exact odds of a build (pure): 💥 chance, 🌟 chance and the quality range when it works. They run on the effort engine (effort.ts): at
 * the default actor (ambition 50, steady, rested, no know-how in the idea's category) they are the table's own numbers.
 */
export function buildOdds(g: GameState, ws: Workshop, def: IdeaDef, builds: number, approach: Approach): BuildOdds {
  const n = buildNumbers(g, factsOf(g, ws, builds), def, APPROACHES[approach])
  const master = (1 - n.kaboom) * Math.max(0, Math.min(1, (n.high - MASTERPIECE) / n.spread))
  return { kaboom: round2(n.kaboom), master: round2(master), low: n.low, high: n.high }
}

/** The labelled lines of a build's odds ("your skill +3, hard build -6, know-how +5"), for a panel to print with the core's `oddsLine`. Pure. */
export function buildWhy(g: GameState, ws: Workshop, def: IdeaDef, builds: number, approach: Approach): readonly Reason[] {
  return buildReasons(g, factsOf(g, ws, builds), def, APPROACHES[approach])
}
/** A build's quote for the odds line of a menu (`whyNodes`): the odds it works as rolled, with every labelled term. Pure. */
export function buildQuote(g: GameState, ws: Workshop, def: IdeaDef, builds: number, approach: Approach): Quote {
  return buildLineQuote(g, factsOf(g, ws, builds), def, APPROACHES[approach])
}
const round2 = (x: number) => Math.round(x * 10_000) / 10_000
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Skill gained from one build: more from harder builds and from disasters; ×2 for a genius. */
export function skillGain(g: GameState, skill: number, d: number, result: 'kaboom' | 'master' | 'works'): number {
  const base = (0.8 + d * 0.5) * Math.pow(Math.max(0, 1 - skill / 100), 1.8) * (isGenius(g) ? 2 : 1)
  return base * (result === 'kaboom' ? 1.3 : result === 'master' ? 1.2 : 1)
}

interface Bench { def: IdeaDef; q: number; builds: number }
function benchOf(g: GameState, ws: Workshop, t: Target): Bench | null {
  if (t.kind === 'idea') {
    const idea = findIdea(ws, t.id)
    if (!idea) return null
    const def = noteDef(idea)
    return { def, q: idea.q, builds: idea.builds }
  }
  const o = findInvention(g, t.id)
  if (!o || o.inv.stage !== 'patented') return null
  return { def: o.def, q: o.inv.q, builds: o.inv.builds }
}

export function buildBlock(g: GameState, t: Target): string | null {
  const reason = workshopBlock(g)
  if (reason) return reason
  if (!benchOf(g, readWorkshop(g), t)) return 'That idea is no longer on your bench.'
  if (burnedOut(g)) return "You're burned out. Rest before you build again."
  if (buildsMade(g) >= buildLimit(g) + MAX_OVERTIME_BUILDS || focusReason(g, 'workshop.build', buildFull(g), buildWeeks(g)) !== null) return "You're out of workshop time this year."
  return null
}

const KABOOM = [
  'KABOOM. The {x} exploded and took your eyebrows with it.',
  'The {x} caught fire. The fire department now knows you by name.',
  'Your prototype launched itself through the garage roof.',
  'It worked for three glorious seconds. Then it very much did not.',
  'A spring shot out of the {x} and bonked you on the forehead.',
  'The {x} made a noise like a goose in a blender, then went still forever.',
  'Smoke everywhere. The smoke smelled expensive.',
]
const SORT_OF = ['It sort of works, if you hold it at a funny angle.', 'It works on Tuesdays.', 'It works, but it wobbles. A lot.']
const WORKS = ['It works! Mostly as intended.', 'It works. You did a small victory dance.', "It works, and nobody got hurt. Today's a good day."]
const MASTER = ['It works perfectly. You stared at it for an hour, grinning.', 'A masterpiece. Even the cat looked impressed.', 'Flawless. You whispered "I am a genius" to nobody.']

function line(g: GameState, list: readonly string[], name: string): string {
  return list[Math.floor(rand(g) * list.length)].replace('{x}', name)
}

/** Open the approach popup for a build. */
export function startBuild(g: GameState, t: Target): void {
  if (buildBlock(g, t)) return
  const ws = readWorkshop(g)
  const bench = benchOf(g, ws, t)!
  const choices: ChoiceOption[] = []
  for (const id of ['safe', 'bold', 'cheap'] as Approach[]) {
    const cost = buildCost(g, bench.def, id)
    if (g.character.money < cost) continue
    const o = buildOdds(g, ws, bench.def, bench.builds, id)
    const hint = talentHint(g, 'Inventor', `\u{1F4A5} ${pct(o.kaboom)} · \u{1F31F} ${pct(o.master)} · quality ${Math.max(0, Math.round(o.low))}-${Math.min(100, Math.round(o.high))}`)
    choices.push({ id, label: `${APPROACHES[id].label} (${cost ? formatMoney(cost) : 'free'})`, emoji: APPROACHES[id].emoji, ...(hint ? { hint } : {}) })
  }
  if (!choices.length) {
    notice(g, 'Too Broke to Tinker', `Parts for the ${bench.def.name} cost ${formatMoney(buildCost(g, bench.def, 'cheap'))} even on the cheap.`, { emoji: '\u{1F4B8}' })
    return
  }
  choices.push({ id: 'cancel', label: 'Not today', emoji: '\u{1F6AA}' })
  const tires = focusPreview(g, 'workshop.build', buildFull(g), buildWeeks(g)).overtime > 0 ? ' This build runs past your focus weeks and will tire you.' : ''
  scriptChoice(g, BUILD_SCRIPT, `Build: ${bench.def.name}`, `${bench.def.emoji} How do you build it? ${bench.q ? `Best so far: ${Math.round(bench.q)}/100.` : 'First attempt!'}${tires}`, choices, { emoji: '\u{1F527}', data: { kind: t.kind, id: t.id } as unknown as Json })
}

/**
 * Books a build's result with the effort engine, after both draws (it draws nothing). Each build is its own piece of work (a fresh
 * record, so a second build of a category in one year books too): a blow-up banks know-how in the idea's category, which lowers that
 * category's next blow-up chance by at most 15 points, and a win banks none. Returns the line that says what it left behind: always
 * for a blow-up, and for a win only when the maker holds know-how in the category.
 */
function learn(g: GameState, def: IdeaDef, approach: Approach, result: 'kaboom' | 'master' | 'works', u: number, kaboom: number): string {
  const task = buildTask(def, APPROACHES[approach])
  const outcome: Outcome = {
    kind: result === 'kaboom' ? 'fail' : result === 'master' ? 'hit' : 'works',
    margin: (u - kaboom) * 100,
    cause: result === 'kaboom' ? 'deadEnd' : null,
    done: result === 'kaboom' ? 0.5 : 1,
  }
  const r = step(g, task, outcome, { year: g.year, who: 'you', fx: newFx(g.year) })
  return result === 'kaboom' || r.knowledge > 0 ? payoffLine(task, outcome, r) : ''
}

/** Resolve a build (also callable directly by tests). Returns the result or null if nothing happened. */
export function resolveBuild(g: GameState, t: Target, approach: Approach): { result: 'kaboom' | 'master' | 'works'; quality: number } | null {
  if (buildBlock(g, t) || !APPROACHES[approach]) return null
  const ws = mutWorkshop(g)
  const bench = benchOf(g, ws, t)
  if (!bench) return null
  const cost = buildCost(g, bench.def, approach)
  if (!spend(g, cost, 'purchase')) return null
  spendFocus(g, 'workshop.build', buildFull(g), buildWeeks(g))
  // Main Character Syndrome: the first build lifts inventing skill to what this age allows.
  ws.skill = liftSkill(g, 'workshop.inventing', 'craft', 'inventing', ws.skill, ageCeiling(g.character.age, SKILL_CEILING))
  const odds = buildOdds(g, ws, bench.def, bench.builds, approach)
  const u = rand(g)
  let result: 'kaboom' | 'master' | 'works'
  let quality = 0
  if (u < odds.kaboom) result = 'kaboom'
  else {
    quality = Math.max(0, Math.min(100, odds.low + rand(g) * (odds.high - odds.low)))
    if (quality >= MASTERPIECE) {
      result = 'master'
      quality = Math.min(100, quality + 6)
    } else result = 'works'
  }
  quality = Math.round(quality)
  const before = bench.q
  const best = Math.max(before, quality)
  if (t.kind === 'idea') {
    const idea = findIdea(ws, t.id)!
    idea.q = best
    idea.builds += 1
  } else {
    const o = findInvention(g, t.id)!
    o.inv.q = best
    o.inv.builds += 1
    storeInv(g, o.a, o.inv, ws.rep)
  }
  const gain = skillGain(g, ws.skill, bench.def.d, result)
  ws.skill = Math.round(capAt(g, Math.min(100, ws.skill + gain), ageCeiling(g.character.age, SKILL_CEILING), ws.skill) * 10) / 10
  ws.builds += 1
  count(g, 'prototypes')
  const taught = learn(g, bench.def, approach, result, u, odds.kaboom)
  const name = bench.def.name
  if (result === 'kaboom') {
    ws.kabooms += 1
    count(g, 'kabooms')
    addStat(g, 'health', -(2 + Math.floor(rand(g) * 5)))
    addStat(g, 'happiness', -3)
    notice(g, '\u{1F4A5} Disaster!', `${line(g, KABOOM, `${name}`)} You learned a lot, mostly about fire. Skill +${gain.toFixed(1)}. ${taught}`, { emoji: '\u{1F4A5}', tone: 'bad' })
    log(g, `My ${name} prototype blew up in my face.`, 'bad')
  } else {
    const label = result === 'master' ? '\u{1F31F} Masterpiece!' : quality < 30 ? '\u{1F529} Sort Of Works' : '\u{2705} It Works!'
    const text1 = line(g, result === 'master' ? MASTER : quality < 30 ? SORT_OF : WORKS, name)
    const better = quality > before ? ` Quality ${Math.round(before)} → ${quality}.` : ` Quality ${quality} (your best is still ${Math.round(before)}).`
    addStat(g, 'happiness', result === 'master' ? 6 : 2)
    if (result === 'master') {
      addRep(ws, 2)
      addStat(g, 'smarts', 1)
    }
    notice(g, label, `${bench.def.emoji} ${name}: ${text1}${better} Skill +${gain.toFixed(1)}.${taught ? ` ${taught}` : ''}`, { emoji: result === 'master' ? '\u{1F31F}' : '\u{1F527}', tone: result === 'master' ? 'good' : 'neutral' })
    log(g, result === 'master' ? `I built a masterpiece: the ${name}.` : `I built a prototype of the ${name}.`, result === 'master' ? 'good' : 'neutral')
  }
  return { result, quality }
}

const BUILD_SCRIPT = defineScript('workshop.build', (g, choice, data) => {
  const d = rec(data)
  if (choice === 'cancel' || !Object.hasOwn(APPROACHES, choice)) return
  const kind = d.kind === 'asset' ? 'asset' : 'idea'
  resolveBuild(g, { kind, id: text(d.id) }, choice as Approach)
})

// ---------------------------------------------------------------------------
// Brainstorming

/** Exact chance a brainstorm produces an idea (pure). On the effort engine like a build: today's number at the default actor. */
export function brainstormOdds(g: GameState, ws: Workshop): number {
  return brainstormChance(g, factsOf(g, ws, 0))
}

export function brainstormBlock(g: GameState): string | null {
  const reason = workshopBlock(g)
  if (reason) return reason
  if (yearActionsUsed(g, 'workshop.brainstorm') >= BRAINSTORMS * BRAINSTORM_WEEKS) return 'Your brain needs a rest. Two brainstorms a year.'
  const pool = focusReason(g, 'workshop.brainstorm', BRAINSTORMS * BRAINSTORM_WEEKS, BRAINSTORM_WEEKS)
  if (pool) return pool
  if (readWorkshop(g).ideas.length >= NOTEBOOK_MAX) return 'Your notebook is full. Scrap an idea first.'
  return null
}

const BLANK = ['You stared at a blank page for an hour. The page won.', 'You had a great idea, then realized it was a sandwich.', 'Nothing. Your brain played elevator music.', 'You invented a new way to doodle. That is all.']

export function brainstorm(g: GameState): IdeaDef | null {
  if (brainstormBlock(g)) return null
  const ws = mutWorkshop(g)
  spendFocus(g, 'workshop.brainstorm', BRAINSTORMS * BRAINSTORM_WEEKS, BRAINSTORM_WEEKS)
  if (rand(g) >= brainstormOdds(g, ws)) {
    notice(g, '\u{1F4AD} Brainstorm', line(g, BLANK, ''), { emoji: '\u{1F4AD}' })
    return null
  }
  const def = drawIdea(g, ws)
  if (!def || !addIdea(g, ws, def)) {
    notice(g, '\u{1F4AD} Brainstorm', 'Every idea you had turned out to already exist. Rude.', { emoji: '\u{1F4AD}' })
    return null
  }
  logIdea(g, def)
  notice(g, '\u{1F4A1} Eureka!', `${def.emoji} The ${def.name}! ${def.blurb} It's in your notebook.`, { emoji: '\u{1F4A1}', tone: 'good' })
  return def
}
