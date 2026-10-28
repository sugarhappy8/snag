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
import { moveCash, personPurse } from '../cash'
import { killCharacter } from '../death'
import { applyEffects } from '../effects'
import { notePerson } from '../people'
import { fillLocal, locale, localTerm, type LocaleProfile } from '../data/locales'
import { noticeWeightOf } from '../notice-weights'
import { pick, randInt, rand, uid } from '../rng'
import { pickLine } from '../text/pick'
import { noteTold, toldLately } from '../text/told'
import type { Reason } from '../kernel/reasons'
import { getCountry, randomFirstName, randomLastName } from '../world'
import type { ChoiceOption, GameEffects, GameState, Gender, Job, Json, Person, Tone } from '../types'
import { anachronistic, eraOk, eraStrip, venueExists } from './era'
import { askedPurse } from './purses'

export { venueExists }

/** Every offline random event is resolved by this one script; data.eventId says which. */
export const EVENT_SCRIPT = 'events.random'

export type EvData = Record<string, Json>

function eventJobKey(job: Job): string {
  const appointment = typeof job.data.appointmentId === 'string' ? job.data.appointmentId : ''
  return `${job.category}|${job.defId}|${job.company}|${appointment}`
}

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

/**
 * Type-checks an event file's list. Each setup also gets an era backstop: a popup that would
 * mention something that doesn't exist yet where the player lives (texting in 1950, an app in
 * 1990) returns null, so the picker chooses another event. Era-aware events still write their
 * own variants (see era.ts); this only catches what slips through.
 */
export function defineEvents(list: EventDef[]): EventDef[] {
  return list.map((ev) => {
    const setup = ev.setup
    return {
      ...ev,
      setup: (g: GameState) => {
        const s = setup(g)
        if (!s) return s
        const shown = [s.title ?? ev.title, s.text, ...s.choices.map((c) => c.label)].join(' \n ')
        return anachronistic(g, shown) ? null : s
      },
    }
  })
}

export function ch(id: string, label: string, emoji?: string): ChoiceOption {
  return emoji ? { id, label, emoji } : { id, label }
}

// ---------------------------------------------------------------------------
// Popups

/** Queue an event popup (first step). */
export function present(g: GameState, ev: EventDef, s: Setup): void {
  const data: EvData = { ...(s.data ?? {}), eventId: ev.id }
  if (ev.id.startsWith('work.') && data.workSlot === undefined) {
    const main = g.character.job
    const regularMain = main && (main.category === 'fulltime' || main.category === 'parttime') ? main : null
    const slot = ev.id === 'work.rudeCustomer' && g.character.partTimeJob
      ? 'partTimeJob'
      : regularMain ? 'job' : g.character.partTimeJob ? 'partTimeJob' : main ? 'job' : null
    const target = slot ? g.character[slot] : null
    if (slot && target) {
      data.workSlot = slot
      data.workJobKey = eventJobKey(target)
    }
  }
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
  /** School grades change for the current enrollment. */
  grades?: number
  /** Prison respect change. */
  respect?: number
  /** Prison behavior change (g.flags.prisonLife.behavior, 0-100, read by parole). */
  behavior?: number
  /** Counter keys to bump by one. */
  count?: string | string[]
  /** Counter keys to bump by an amount. */
  countBy?: [string, number][]
  condition?: GameEffects['condition']
  arrest?: { crime: string; severity: number }
  /** Kill the player with this cause (e.g. 'Drowning'). */
  death?: string
  /** Line for the character's Memories list. */
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
  /** Show the real-world support line under the popup text (NoticeModal.support). */
  support?: boolean
}

/**
 * One of several variants (or the only one). String lists may carry era tags ("@smartphone ...",
 * see era.ts): lines that don't fit this year are skipped and tags never reach the screen.
 */
export function v<T>(g: GameState, items: T | readonly T[]): T {
  if (Array.isArray(items)) {
    const list = items as readonly T[]
    if (list.length && typeof list[0] === 'string') {
      const ok = (list as readonly string[]).filter((l) => eraOk(g, l))
      const from = ok.length ? ok : (list as readonly string[])
      return eraStrip(pickLine(g, from)) as T
    }
    return pick(g, list)
  }
  return (typeof items === 'string' ? eraStrip(items) : items) as T
}

/**
 * v without the text kit's memory: today's body, for a result that is an identity (stored on a Person or an Asset, a name, or something
 * the code branches on), and for a pool whose lines carry ${} holes (a new text per value would write one throwaway pool per call into the memory).
 */
export function vPlain<T>(g: GameState, items: T | readonly T[]): T {
  if (Array.isArray(items)) {
    const list = items as readonly T[]
    if (list.length && typeof list[0] === 'string') {
      const ok = (list as readonly string[]).filter((l) => eraOk(g, l))
      const from = ok.length ? ok : (list as readonly string[])
      return eraStrip(pick(g, from)) as T
    }
    return pick(g, list)
  }
  return (typeof items === 'string' ? eraStrip(items) : items) as T
}

/**
 * The context of the event being resolved right now. Resolvers run synchronously, so
 * outcome helpers called with `x = null` still get the event's emoji and people.
 */
let active: Ctx | null = null

export function withCtx(x: Ctx, fn: () => void): void {
  const prev = active
  active = x
  try {
    fn()
  } finally {
    active = prev
  }
}

/** Report an outcome like the classic game does: popup + journal line + stat changes. */
export function res(g: GameState, ctx: Ctx | null, r: Res): void {
  const x = ctx ?? active
  const c = g.character
  if (!c.alive) return
  const tone: Tone = r.tone ?? 'neutral'
  const title = v(g, r.t)
  const body = v(g, r.x)
  // The money the outcome moves, as applyFx will book it (a loss stops at the cash on hand), and the weight of the title. They go on
  // the popup and the log line so the year close can rank and sum them (R3, E.D1). Neither reads or draws anything.
  const a = outcomeAmount(g, r.fx)
  const w = noticeWeightOf(title)
  notice(g, title, body, { emoji: r.e ?? x?.ev.emoji, tone, support: r.support, a })
  if (r.l) {
    // The sentence is drawn either way (one text draw); a sentence told within 10 years is not written again, and takes the log id it would have taken.
    const line = v(g, r.l)
    if (toldLately(g, line)) uid(g, 'l')
    else {
      noteTold(g, line)
      log(g, line, tone, undefined, a === undefined && w === undefined ? undefined : { a, w })
    }
  }
  if (r.fx) applyFx(g, x, r.fx)
}

/** The size of an effect bundle's money in dollars as applyFx books it, or undefined when it moves none. */
function outcomeAmount(g: GameState, fx: Fx | undefined): number | undefined {
  const m = fx?.money
  if (typeof m !== 'number' || !Number.isFinite(m) || m === 0) return undefined
  const size = m > 0 ? m : Math.min(Math.max(0, g.character.money), -m)
  return size > 0 ? size : undefined
}

/** Apply an effect bundle (stats are capped by applyEffects). */
export function applyFx(g: GameState, ctx: Ctx | null, fx: Fx): void {
  const x = ctx ?? active
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
    if (fx.money > 0) addMoney(g, fx.money, 'luck')
    else addMoney(g, -Math.min(Math.max(0, c.money), -fx.money), 'luck')
  }
  if (fx.rel && x?.p) addRelationship(g, x.p, fx.rel)
  if (fx.rel2 && x?.q) addRelationship(g, x.q, fx.rel2)
  for (const r of fx.rels ?? []) if (r.p && r.p.alive) addRelationship(g, r.p, r.d)
  if (fx.note && x?.p) notePerson(x.p, fx.note)
  if (fx.perf) {
    const slot = x?.data.workSlot === 'partTimeJob' ? 'partTimeJob' : x?.data.workSlot === 'job' ? 'job' : null
    const candidate = slot ? c[slot] : null
    const savedKey = typeof x?.data.workJobKey === 'string' ? x.data.workJobKey : ''
    const workEvent = typeof x?.data.eventId === 'string' && x.data.eventId.startsWith('work.')
    const job = slot
      ? (candidate && eventJobKey(candidate) === savedKey ? candidate : null)
      : workEvent ? null : c.job ?? c.partTimeJob
    if (job) job.performance = Math.round(clamp(job.performance + fx.perf))
  }
  if (fx.grades && c.education.current) {
    const cur = c.education.current
    cur.grades = Math.round(clamp(cur.grades + fx.grades))
  }
  if (fx.respect && c.prison) c.prison.respect = Math.round(clamp(c.prison.respect + fx.respect))
  if (fx.behavior && c.prison) {
    // prison.ts keeps per-sentence data (behavior drives parole) in g.flags.prisonLife.
    const pl = g.flags.prisonLife
    if (pl && typeof pl === 'object' && !Array.isArray(pl) && typeof pl.behavior === 'number') {
      pl.behavior = Math.round(clamp(pl.behavior + fx.behavior))
    }
  }
  for (const key of typeof fx.count === 'string' ? [fx.count] : (fx.count ?? [])) count(g, key)
  for (const [key, by] of fx.countBy ?? []) count(g, key, by)
  if (fx.memory) remember(g, fx.memory)
  if (fx.arrest) applyEffects(g, { arrest: fx.arrest })
  if (fx.death && c.alive) killCharacter(g, fx.death)
}

/**
 * The player hands the event's person `amt` (the caller checked they can afford it): one booking between the two, and the value for
 * `fx.money`, which is 0 when the person took it and `-amt` when there is no person (the event's own money effect then takes it).
 */
export function handOver(g: GameState, x: Ctx, amt: number, reason: Reason): number {
  if (!x.p || !(amt > 0) || g.character.money < amt) return -amt
  return moveCash(g, askedPurse(g), personPurse(x.p), amt, reason) > 0 ? 0 : -amt
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
  return g.character.residence.status === 'owned' || g.assets.some((a) => a.kind === 'house' && a.details.commercial !== true)
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

// ---------------------------------------------------------------------------
// Local life: the library was written with an American childhood in mind. These helpers let
// an event keep its US version word for word while players elsewhere get their own country
// (data/locales.ts): their holidays, food, sports, hangouts, exam names and school customs.

/** True when the player lives in the United States (the library's home turf). */
export function isUS(g: GameState): boolean {
  return g.character.countryId === 'us'
}

/** The American version for US players, the local one everywhere else. */
export function usOr<T>(g: GameState, us: T, other: T): T {
  return isUS(g) ? us : other
}

/** Fill locale tokens ({holiday} {food} {sport} {landmark} {transport} {city}...) for the player's country. */
export function loc(g: GameState, template: string): string {
  return fillLocal(g, template)
}

/** A local term ('the SATs' / 'the Abitur', 'prom' / 'the leavers' ball', '911' / '112'...). */
export function term(g: GameState, key: keyof LocaleProfile['terms']): string {
  return localTerm(g, key)
}

/** "the leavers' ball" → "Leavers' ball", "prom" → "Prom" (for popup titles and line starts). */
export function titleOf(phrase: string): string {
  return uc(phrase.replace(/^the\s+/i, ''))
}

/** Countries where school is taught mostly in English (spelling bees, the ABC song...). */
const ENGLISH_SCHOOLING = new Set(['us', 'ca', 'gb', 'ie', 'au', 'nz', 'jm', 'bs', 'bz', 'gy', 'ng', 'ke', 'ug', 'za', 'zw', 'ph', 'in', 'sg', 'pg', 'ws', 'pk'])

export function englishSchooling(g: GameState): boolean {
  return ENGLISH_SCHOOLING.has(g.character.countryId)
}

/** Countries with no coastline (no beach days by default). */
const LANDLOCKED = new Set(['ad', 'at', 'ch', 'cz', 'hu', 'sk', 'rs', 'et', 'ug', 'zw', 'af', 'kz', 'mn', 'np', 'bo', 'py'])

export function coastal(g: GameState): boolean {
  return !LANDLOCKED.has(g.character.countryId)
}

/** The faith most people in the player's country follow ('Christianity', 'Islam', 'None'...). */
export function majorityFaith(g: GameState): string {
  const counts: Record<string, number> = {}
  for (const r of country(g).religions ?? []) counts[r] = (counts[r] ?? 0) + 1
  let best = 'None'
  let n = 0
  for (const [r, k] of Object.entries(counts)) {
    if (k > n) {
      best = r
      n = k
    }
  }
  return best
}

export function muslimMajority(g: GameState): boolean {
  return majorityFaith(g) === 'Islam'
}

/**
 * Muslim-majority countries where coed school dances, dates to the dance and "there will be
 * alcohol" teen parties aren't a default part of growing up. (Indonesia, Malaysia, Turkey,
 * Kazakhstan, Lebanon and Bangladesh have their prom nights, balls and Rag Days.)
 */
const DANCE_FRIENDLY_MUSLIM = new Set(['id', 'my', 'tr', 'kz', 'lb', 'bd', 'al'])

export function conservativeSchooling(g: GameState): boolean {
  return muslimMajority(g) && !DANCE_FRIENDLY_MUSLIM.has(g.character.countryId)
}

/** Grown-up places (bars, pubs, clubs, hookah lounges...) a kid shouldn't be sent to by default. */
const GROWN_UP_VENUE = /\b(?:bars?|pubs?|cantina|boteco|pagode|rumshop|heuriger|beer|kneipe|bodega|kafana|shebeen|izakaya|hookah|shisha|lounge|tavern|casino|sauna|baths|hammam|pool hall|karaoke|videoke|dohori|clubs?|kizomba|joint|wine|cocktails?|brewery|après-ski)\b/i
const KID_FRIENDLY_VENUE = /snack ?bar|milk bar|juice bar|youth club|karaoke box/i

export function kidSafeVenue(place: string): boolean {
  return KID_FRIENDLY_VENUE.test(place) || !GROWN_UP_VENUE.test(place)
}

/** Places that didn't exist yet in earlier decades (malls, bubble tea, karaoke, new landmarks). */
/** A local hangout ('the night market', 'the plaza', 'the mall'); no bars before drinking age. */
export function hangout(g: GameState): string {
  const all = locale(g).hangouts.filter((p) => venueExists(g, p))
  const ok = canDrink(g) ? all : all.filter(kidSafeVenue)
  return ok.length ? pick(g, ok) : 'the park'
}

/** A local spot for a cheap date ('the boardwalk', 'a bubble tea shop'); no bars before drinking age. */
export function dateSpot(g: GameState): string {
  const all = locale(g).dateSpots.filter((p) => venueExists(g, p))
  const ok = canDrink(g) ? all : all.filter(kidSafeVenue)
  return ok.length ? pick(g, ok) : g.year >= 1910 ? 'the cinema' : 'the park'
}

const ALCOHOL = /beer|wine|tequila|mezcal|\brum\b|vodka|soju|sake|whisk|\bgin\b|ouzo|rak[iı]|cacha[cç]a|pisco|chicha|arak|baijiu|makgeolli|brandy|cider|schnapps|aquavit|akvavit|grappa|p[aá]linka|rakija|\btej\b|lager|stout|michelada|caipirinha|aperol|spritz|cerveza|cava|prosecco|champagne|toddy|tuak|arrack|feni|chang|tuba|lambanog|absinthe|jenever|pastis|sangria|liqueur|bourbon|moonshine|kvass|horilka|sambuca|limoncello|retsina|tsipouro|slivovitz|vermouth|punch/i

/** A drink people bond over here; tea, coffee or juice before drinking age. */
export function localDrink(g: GameState): string {
  const all = locale(g).drinks
  const ok = canDrink(g) && !muslimMajority(g) ? all : all.filter((d) => !ALCOHOL.test(d))
  return ok.length ? pick(g, ok) : pick(g, ['tea', 'juice'])
}

/** A ball game kids play at recess or in the street (soccer, cricket, basketball...). */
export function playSport(g: GameState): string {
  const ball = /soccer|football|cricket|basketball|volleyball|futsal|handball|baseball|softball|badminton|kabaddi|sepak takraw|netball|rugby|hurling|floorball|pesäpallo|field hockey|ecuavolley|table tennis|kho kho/i
  const ok = locale(g).sports.filter((s) => ball.test(s) && !/ice|water|beach|wheelchair/i.test(s))
  return ok.length ? ok[0] : 'soccer'
}

/** What PE is called: 'gym class' in North America, 'PE' elsewhere. */
export function peClass(g: GameState): string {
  return g.character.countryId === 'us' || g.character.countryId === 'ca' ? 'gym class' : 'PE'
}

// ---------------------------------------------------------------------------
// Per-person cooldowns: the game shouldn't keep doing the same thing to the same person.

function stampKey(key: string): string {
  return `ev.${key}`
}

/** Age (this life) when the person last starred in `key`, if ever. */
export function lastWith(g: GameState, p: Person | undefined, key: string): number | undefined {
  const raw = p?.data?.[stampKey(key)]
  if (!Array.isArray(raw) || raw.length !== 2) return undefined
  const [gen, age] = raw
  if (gen !== g.generation || typeof age !== 'number' || age > g.character.age) return undefined
  return age
}

/** True when the person hasn't starred in `key` within the last `years` years. */
export function freshFor(g: GameState, p: Person | undefined, key: string, years: number): boolean {
  const last = lastWith(g, p, key)
  return last === undefined || g.character.age - last >= years
}

/** Remember that the person starred in `key` this year. */
export function stamp(g: GameState, p: Person | undefined, key: string): void {
  if (!p) return
  if (!p.data || typeof p.data !== 'object') p.data = {}
  p.data[stampKey(key)] = [g.generation, g.character.age]
}
