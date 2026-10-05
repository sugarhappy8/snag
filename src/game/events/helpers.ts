// Shared building blocks for the offline event library: the event definition shape,
// outcome reporting (popup + life-log line + effects) and people/text helpers.
import {
  addHidden,
  addMoney,
  addRelationship,
  children as childrenOf,
  clamp,
  count,
  currentPartner,
  formatMoney,
  log,
  notice,
  parents as parentsOf,
  peopleBy,
  pronouns,
  relationLabel,
  remember,
  scriptChoice,
} from '../core'
import { killCharacter } from '../death'
import { applyEffects } from '../effects'
import { notePerson } from '../people'
import { pick, randInt, rand } from '../rng'
import { getCountry, randomFirstName, randomLastName } from '../world'
import type { ChoiceOption, GameEffects, GameState, Gender, Json, Person, Tone } from '../types'

/** Every offline random event is resolved by this one script; data.eventId says which. */
export const EVENT_SCRIPT = 'events.random'

export type EvData = Record<string, Json>

/** What an event shows when it fires. */
export interface Setup {
  text: string
  choices: ChoiceOption[]
  data?: EvData
  /** The person the event is about (avatar on the popup, `x.p` in resolvers). */
  person?: Person
  /** A second person involved (`x.q` in resolvers). */
  other?: Person
  title?: string
  emoji?: string
}

/** Context handed to a choice resolver. */
export interface Ctx {
  ev: EventDef
  data: EvData
  /** Main person (alive) the event is about, if any. */
  p: Person | undefined
  /** Second person (alive), if any. */
  q: Person | undefined
  /** String value from the event data ('' if missing). */
  s: (key: string) => string
  /** Number value from the event data (0 if missing). */
  n: (key: string) => number
}

export type Resolver = (g: GameState, x: Ctx) => void

export interface EventDef {
  /** Unique, namespaced id, e.g. 'kid.integrity'. */
  id: string
  emoji: string
  title: string
  minAge: number
  maxAge: number
  /** 'free' (default): only outside prison. 'prison': only while incarcerated. 'any': both. */
  where?: 'free' | 'prison' | 'any'
  /** Relative chance among eligible events (default 10). */
  weight?: number | ((g: GameState) => number)
  /** Years before it can fire again (default 10). */
  cooldown?: number
  /** Only once per life. */
  once?: boolean
  /** Extra eligibility condition. */
  when?: (g: GameState) => boolean
  /** Build the popup; return null if it can't happen right now (missing person...). */
  setup: (g: GameState) => Setup | null
  /** Handlers by choice id (follow-up popups' choice ids live here too). */
  resolve: Record<string, Resolver>
}

/** Identity helper so event files get type checking and inference. */
export function defineEvents(list: EventDef[]): EventDef[] {
  return list
}

export function ch(id: string, label: string, emoji?: string): ChoiceOption {
  return emoji ? { id, label, emoji } : { id, label }
}

// ---------------------------------------------------------------------------
// Popups

/** Queue an event popup (first step). */
export function present(g: GameState, ev: EventDef, s: Setup): void {
  const data: EvData = { ...(s.data ?? {}), eventId: ev.id }
  if (s.person) data.personId = s.person.id
  if (s.other) data.otherId = s.other.id
  scriptChoice(g, EVENT_SCRIPT, s.title ?? ev.title, s.text, s.choices, {
    emoji: s.emoji ?? ev.emoji,
    data,
    personId: s.person?.id,
  })
}

/** Queue a follow-up popup for the same event (choice ids must exist in ev.resolve). */
export function ask(g: GameState, x: Ctx, s: Setup): void {
  const data: EvData = { ...x.data, ...(s.data ?? {}), eventId: x.ev.id }
  if (s.person) data.personId = s.person.id
  if (s.other) data.otherId = s.other.id
  scriptChoice(g, EVENT_SCRIPT, s.title ?? x.ev.title, s.text, s.choices, {
    emoji: s.emoji ?? x.ev.emoji,
    data,
    personId: s.person?.id ?? x.p?.id,
  })
}

// ---------------------------------------------------------------------------
// Outcomes

export interface Fx {
  happiness?: number
  health?: number
  smarts?: number
  looks?: number
  karma?: number
  fame?: number
  notoriety?: number
  craziness?: number
  willpower?: number
  discipline?: number
  athleticism?: number
  religiousness?: number
  /** Positive: exact gain. Negative: loss of up to the cash on hand (never below $0). */
  money?: number
  /** Relationship change with the event's main person (x.p). */
  rel?: number
  /** Relationship change with the event's second person (x.q). */
  rel2?: number
  /** Relationship changes with anyone else. */
  rels?: { p: Person | undefined; d: number }[]
  /** Job performance change (main job, else part-time job). */
  perf?: number
  /** Prison respect change. */
  respect?: number
  /** Prison behavior change (g.flags.prisonBehavior, 0-100, read by parole). */
  behavior?: number
  /** Counter keys to bump by one. */
  count?: string | string[]
  /** Counter keys to bump by an amount. */
  countBy?: [string, number][]
  condition?: GameEffects['condition']
  arrest?: { crime: string; severity: number }
  /** Kill the player with this cause (e.g. 'Drowning'). */
  death?: string
  /** Long-term memory line for the AI. */
  memory?: string
  /** Shared-history note added to x.p. */
  note?: string
}

export interface Res {
  /** Popup title (one picked at random when a list). */
  t: string | readonly string[]
  /** Popup emoji (defaults to the event's). */
  e?: string
  /** Popup text, second person. */
  x: string | readonly string[]
  /** Life-log line, first person past tense (null/omitted: none). */
  l?: string | readonly string[] | null
  tone?: Tone
  fx?: Fx
}

export function v<T>(g: GameState, items: T | readonly T[]): T {
  if (Array.isArray(items)) return pick(g, items as readonly T[])
  return items as T
}

/** Report an outcome like the classic game does: popup + journal line + stat changes. */
export function res(g: GameState, x: Ctx | null, r: Res): void {
  const c = g.character
  if (!c.alive) return
  const tone: Tone = r.tone ?? 'neutral'
  notice(g, v(g, r.t), v(g, r.x), { emoji: r.e ?? x?.ev.emoji, tone })
  if (r.l) log(g, v(g, r.l), tone)
  if (r.fx) applyFx(g, x, r.fx)
}

/** Apply an effect bundle (stats are capped by applyEffects). */
export function applyFx(g: GameState, x: Ctx | null, fx: Fx): void {
  const c = g.character
  if (!c.alive) return
  const eff: GameEffects = {}
  if (fx.happiness) eff.happiness = fx.happiness
  if (fx.health) eff.health = fx.health
  if (fx.smarts) eff.smarts = fx.smarts
  if (fx.looks) eff.looks = fx.looks
  if (fx.karma) eff.karma = fx.karma
  if (fx.fame) eff.fame = fx.fame
  if (fx.notoriety) eff.notoriety = fx.notoriety
  if (fx.craziness) eff.craziness = fx.craziness
  if (fx.condition) eff.condition = fx.condition
  applyEffects(g, eff)
  if (fx.willpower) addHidden(g, 'willpower', fx.willpower)
  if (fx.discipline) addHidden(g, 'discipline', fx.discipline)
  if (fx.athleticism) addHidden(g, 'athleticism', fx.athleticism)
  if (fx.religiousness) addHidden(g, 'religiousness', fx.religiousness)
  if (fx.money) {
    if (fx.money > 0) addMoney(g, fx.money)
    else addMoney(g, -Math.min(Math.max(0, c.money), -fx.money))
  }
  if (fx.rel && x?.p) addRelationship(x.p, fx.rel)
  if (fx.rel2 && x?.q) addRelationship(x.q, fx.rel2)
  for (const r of fx.rels ?? []) if (r.p && r.p.alive) addRelationship(r.p, r.d)
  if (fx.note && x?.p) notePerson(x.p, fx.note)
  if (fx.perf) {
    const job = c.job ?? c.partTimeJob
    if (job) job.performance = Math.round(clamp(job.performance + fx.perf))
  }
  if (fx.respect && c.prison) c.prison.respect = Math.round(clamp(c.prison.respect + fx.respect))
  if (fx.behavior && c.prison) {
    const cur = typeof g.flags.prisonBehavior === 'number' ? g.flags.prisonBehavior : 50
    g.flags.prisonBehavior = Math.round(clamp(cur + fx.behavior))
  }
  for (const key of typeof fx.count === 'string' ? [fx.count] : (fx.count ?? [])) count(g, key)
  for (const [key, by] of fx.countBy ?? []) count(g, key, by)
  if (fx.memory) remember(g, fx.memory)
  if (fx.arrest) applyEffects(g, { arrest: fx.arrest })
  if (fx.death && c.alive) killCharacter(g, fx.death)
}

/** Shorthand: popup + log + effects in one call. */
export function say(
  g: GameState,
  x: Ctx | null,
  t: string | readonly string[],
  text: string | readonly string[],
  logLine: string | readonly string[] | null,
  fx: Fx = {},
  tone: Tone = 'neutral',
  e?: string,
): void {
  res(g, x, { t, x: text, l: logLine, fx, tone, e })
}

// ---------------------------------------------------------------------------
// People

export function mother(g: GameState): Person | undefined {
  return parentsOf(g).find((p) => p.relation === 'parent' && p.gender === 'female') ?? parentsOf(g).find((p) => p.gender === 'female')
}

export function father(g: GameState): Person | undefined {
  return parentsOf(g).find((p) => p.relation === 'parent' && p.gender === 'male') ?? parentsOf(g).find((p) => p.gender === 'male')
}

export function aParent(g: GameState): Person | undefined {
  const list = parentsOf(g)
  const bio = list.filter((p) => p.relation === 'parent')
  if (bio.length) return pick(g, bio)
  return list.length ? pick(g, list) : undefined
}

export function siblings(g: GameState): Person[] {
  return peopleBy(g, ['sibling', 'halfSibling', 'stepsibling'])
}

export function friends(g: GameState): Person[] {
  return peopleBy(g, ['friend', 'bestFriend'])
}

export function kids(g: GameState, minAge = 0, maxAge = 200): Person[] {
  return childrenOf(g).filter((p) => p.age >= minAge && p.age <= maxAge)
}

export function grandkids(g: GameState, minAge = 0, maxAge = 200): Person[] {
  return peopleBy(g, ['grandchild']).filter((p) => p.age >= minAge && p.age <= maxAge)
}

export function pets(g: GameState): Person[] {
  return peopleBy(g, ['pet'])
}

export function partner(g: GameState): Person | undefined {
  return currentPartner(g)
}

export function anyOf(g: GameState, list: Person[]): Person | undefined {
  return list.length ? pick(g, list) : undefined
}

/** "your mother, Linda" / "your dog, Rex". */
export function yourRel(p: Person): string {
  return `your ${relationLabel(p).toLowerCase()}, ${p.firstName}`
}

/** "my mother, Linda". */
export function myRel(p: Person): string {
  return `my ${relationLabel(p).toLowerCase()}, ${p.firstName}`
}

/** "Mother" / "Dog" lowercased: "mother". */
export function relWord(p: Person): string {
  return relationLabel(p).toLowerCase()
}

export function pr(p: { gender: Gender }) {
  return pronouns(p.gender)
}

/** A random name for a stranger who isn't added to the contacts. */
export function strangerName(g: GameState, gender?: Gender): { first: string; last: string; gender: Gender } {
  const gd: Gender = gender ?? (rand(g) < 0.5 ? 'male' : 'female')
  return { first: randomFirstName(g, g.character.countryId, gd), last: randomLastName(g, g.character.countryId), gender: gd }
}

// ---------------------------------------------------------------------------
// Situation checks

export function inGradeSchool(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'elementary' || cur.level === 'middle' || cur.level === 'high')
}

export function inHighSchool(g: GameState): boolean {
  return g.character.education.current?.level === 'high'
}

export function inUniversity(g: GameState): boolean {
  const cur = g.character.education.current
  return !!cur && (cur.level === 'university' || cur.level === 'community' || cur.level === 'graduate')
}

export function schoolName(g: GameState): string {
  return g.character.education.current?.school ?? 'school'
}

export function hasJob(g: GameState): boolean {
  return g.character.job !== null || g.character.partTimeJob !== null
}

export function jobCompany(g: GameState): string {
  const job = g.character.job ?? g.character.partTimeJob
  return job ? job.company : 'work'
}

export function hasCar(g: GameState): boolean {
  return g.assets.some((a) => a.kind === 'car')
}

export function ownsHome(g: GameState): boolean {
  return g.character.residence.status === 'owned' || g.assets.some((a) => a.kind === 'house')
}

export function livesWithParents(g: GameState): boolean {
  return g.character.residence.status === 'parents'
}

export function country(g: GameState) {
  return getCountry(g.character.countryId)
}

/** Price multiplier for the player's country (relative to the US). */
export function priceScale(g: GameState): number {
  return clamp(country(g).wealth, 0.4, 1.5)
}

/** A dollar amount in [lo, hi] scaled by country wealth, rounded to a "nice" number. */
export function dollars(g: GameState, lo: number, hi: number): number {
  const raw = randInt(g, lo, hi) * priceScale(g)
  const step = raw >= 10000 ? 500 : raw >= 1000 ? 50 : raw >= 100 ? 5 : 1
  return Math.max(1, Math.round(raw / step) * step)
}

export function money(n: number): string {
  return formatMoney(n)
}

export function canDrink(g: GameState): boolean {
  return g.character.age >= country(g).drinkingAge
}

/** Lowercase the first letter. */
export function lc(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s
}

/** Uppercase the first letter. */
export function uc(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
