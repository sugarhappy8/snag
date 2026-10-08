// The event library: the story of every year. Each year gets one or two first-person flavor
// lines and, most years, one classic random-event popup chosen by weighted, condition-aware
// selection (age, school, job, family, prison, money) that never repeats too soon:
// each event has a cooldown, related events share one (EVENT_KINDS), the same person
// can't star in the same kind of event for a few years. Events play out in the player's own
// country (a flood day in Jakarta, the leavers' ball in Leeds, a drink stand in Mumbai);
// foreignToLocale stays as a backstop that skips any American-only scene that slips through.
//
// Contract exports: queueFallbackYearEvents, fallbackChoiceOutcome, fallbackCustomAction,
// fallbackObituary. The event data lives in src/game/events/*.ts.
import { fullName, inPrison, notice } from './core'
import { localeOf, type LocaleProfile } from './data/locales'
import { ADULT_EVENTS } from './events/adult'
import { BABY_EVENTS } from './events/baby'
import { resolveGenericChoice } from './events/choice'
import { resolveCustomAction } from './events/custom'
import { ELDER_EVENTS } from './events/elder'
import { ERA_LIFE_EVENTS } from './events/era-life'
import { FAMILY_EVENTS } from './events/family'
import { addFlavorLines } from './events/flavor'
import { FRIEND_EVENTS } from './events/friends'
import { EVENT_SCRIPT, present, withCtx, type Ctx, type EvData, type EventDef } from './events/helpers'
import { KID_EVENTS } from './events/kid'
import { writeObituary } from './events/obituary'
import { PRISON_EVENTS } from './events/prison'
import { SCHOOL_EVENTS } from './events/school'
import { SOS_EVENTS } from './events/sos'
import { TEEN_EVENTS } from './events/teen'
import { WORK_EVENTS } from './events/work'
import { chance, randInt } from './rng'
import { defineScript } from './scripts'
import type { ChoiceModal, GameState, Json, ModalItem, Person } from './types'

export type { EventDef } from './events/helpers'

/** Every offline random event, in one list. */
export const EVENT_LIBRARY: EventDef[] = [
  ...BABY_EVENTS,
  ...KID_EVENTS,
  ...SCHOOL_EVENTS,
  ...TEEN_EVENTS,
  ...FRIEND_EVENTS,
  ...FAMILY_EVENTS,
  ...ADULT_EVENTS,
  ...WORK_EVENTS,
  ...SOS_EVENTS,
  ...ELDER_EVENTS,
  ...PRISON_EVENTS,
  // What an ordinary year felt like in each era (events/era-life.ts).
  ...ERA_LIFE_EVENTS,
]

const EVENTS_BY_ID: Record<string, EventDef> = {}
for (const ev of EVENT_LIBRARY) if (!EVENTS_BY_ID[ev.id]) EVENTS_BY_ID[ev.id] = ev

export function getEventDef(id: string): EventDef | undefined {
  return EVENTS_BY_ID[id]
}

/** g.flags key: { [eventId]: age when it last fired }. */
export const EVENT_HISTORY_FLAG = 'offlineEventHistory'
const DEFAULT_COOLDOWN = 10
const DEFAULT_WEIGHT = 10

/**
 * Events that are different popups about the same kind of thing. After one fires, the others
 * in its kind wait KIND_COOLDOWN years (no neighbor drama two years running), and the same
 * person can't star in the same kind of event (or the same event) for PERSON_COOLDOWN years.
 */
const EVENT_KINDS: Record<string, string[]> = {
  siblingFriction: ['kid.siblingSpat', 'family.siblingJealous'],
  neighbors: ['adult.neighborNoise', 'adult.neighborTree', 'adult.neighborBbq', 'adult.upstairs'],
  scam: ['adult.phoneScam', 'adult.emailScam', 'adult.fraudAlert', 'elder.grandparentScam', 'elder.techSupport'],
  salesPitch: ['adult.mlm', 'adult.timeshare', 'adult.doorToDoor', 'elder.salesman'],
  moneyAsk: ['family.borrowMoney', 'family.adultChildMoney', 'elder.grandkidMoney'],
  traffic: ['adult.parkingTicket', 'adult.trafficStop'],
  carTrouble: ['adult.carTrouble', 'friend.flatTire', 'adult.strandedDriver'],
  bully: ['school.bully', 'school.bleacherBully', 'juvie.breakfastBully'],
  cheating: ['school.cheatRequest', 'school.answerKey'],
  shadyFavor: ['friend.insuranceFraud', 'friend.alibi', 'friend.hideout', 'friend.distillery'],
  coworker: ['work.rumor', 'work.prank', 'work.annoying', 'work.lunchThief', 'work.credit'],
  petTrouble: ['family.petBehavior', 'family.petEscape'],
  healthScare: ['elder.fall', 'elder.healthScare'],
  oldFlame: ['adult.exText', 'elder.oldFlame'],
  prisonFight: ['prison.brawl', 'prison.guardAttack'],
}
const KIND_OF: Record<string, string> = {}
for (const [kind, ids] of Object.entries(EVENT_KINDS)) for (const id of ids) KIND_OF[id] = kind
const KIND_COOLDOWN = 3
const PERSON_COOLDOWN = 5

/** The kind an event belongs to (its own id when it has no group). */
export function eventKind(id: string): string {
  return KIND_OF[id] ?? id
}

/**
 * g.flags.eventMemory: the last popups shown, newest last (the same person doesn't star in the
 * same kind of event again too soon). Older saves may also hold entries the old AI narrator
 * wrote ({ source: 'ai' }); they are read like any other.
 */
export const EVENT_MEMORY_FLAG = 'eventMemory'
const EVENT_MEMORY_MAX = 16

interface EventMemo {
  [key: string]: Json
  title: string
  age: number
  personId: string
  person: string
  kind: string
  /** g.generation when it fired (memories of a parent's life don't count for the child). */
  gen: number
}

function eventMemory(g: GameState): EventMemo[] {
  const raw = g.flags[EVENT_MEMORY_FLAG]
  if (!Array.isArray(raw)) return []
  const out: EventMemo[] = []
  for (const v of raw) {
    if (!isRecord(v) || typeof v.title !== 'string' || typeof v.age !== 'number') continue
    if (typeof v.gen === 'number' && v.gen !== g.generation) continue
    out.push({
      title: v.title,
      age: v.age,
      personId: typeof v.personId === 'string' ? v.personId : '',
      person: typeof v.person === 'string' ? v.person : '',
      kind: typeof v.kind === 'string' ? v.kind : '',
      gen: g.generation,
    })
  }
  return out
}

function rememberEvent(g: GameState, memo: EventMemo): void {
  const kept = eventMemory(g).filter((m) => m.age <= g.character.age)
  g.flags[EVENT_MEMORY_FLAG] = [...kept, memo].slice(-EVENT_MEMORY_MAX)
}

/** Was this person the subject of the same kind of event within PERSON_COOLDOWN years? */
function personRecentlyFeatured(g: GameState, personId: string, kind: string): boolean {
  const age = g.character.age
  return eventMemory(g).some((m) => m.personId === personId && m.kind === kind && m.age <= age && age - m.age < PERSON_COOLDOWN)
}

function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * g.flags key: the generation the history belongs to. Flags carry over when the player
 * continues as their child, and the parent's "age 15" is not the child's.
 */
const HISTORY_GEN_FLAG = 'offlineEventGeneration'

/** The history of this generation's life (undefined when it belongs to a previous one). */
function currentHistory(g: GameState): { [key: string]: Json } | undefined {
  const raw = g.flags[EVENT_HISTORY_FLAG]
  if (!isRecord(raw)) return undefined
  const gen = g.flags[HISTORY_GEN_FLAG]
  return typeof gen === 'number' && gen !== g.generation ? undefined : raw
}

function history(g: GameState): { [key: string]: Json } {
  const raw = currentHistory(g)
  g.flags[HISTORY_GEN_FLAG] = g.generation
  if (raw) return raw
  const fresh: { [key: string]: Json } = {}
  g.flags[EVENT_HISTORY_FLAG] = fresh
  return fresh
}

/** Age at which an event last fired in this life, if ever. */
export function lastFired(g: GameState, id: string): number | undefined {
  const v = currentHistory(g)?.[id]
  return typeof v === 'number' ? v : undefined
}

// ---------------------------------------------------------------------------
// Locale guard: much of the library was first written with an American childhood in mind.
// A scene that only makes sense in the US (prom, the SATs, the DMV, a lemonade stand,
// Thanksgiving, a snow day in the tropics) is skipped for players elsewhere, unless their
// country's locale says it fits (Indonesia has prom night, Canada has Thanksgiving, Mexico
// dials 911). The US keeps everything.

interface Marker {
  re: RegExp
  /** The scene still fits this country. */
  fits?: (loc: LocaleProfile, countryId: string) => boolean
}

function listed(list: readonly string[] | undefined, re: RegExp): boolean {
  return Array.isArray(list) && list.some((x) => typeof x === 'string' && re.test(x))
}

const AMERICAN_MARKERS: Marker[] = [
  { re: /\bprom\b|homecoming (?:dance|game|king|queen|court|parade)|pep rally/i, fits: (l) => /\bprom\b|homecoming/i.test(l.terms.schoolDance) },
  { re: /\bSATs?\b/, fits: (l) => /\bSAT/.test(l.terms.finalExam) },
  { re: /\bDMV\b/, fits: (l) => /DMV/.test(l.terms.licenseOffice) },
  { re: /(?<![\d$.,])\b911\b(?![\d,])/, fits: (l) => l.terms.emergencyNumber.includes('911') },
  { re: /Thanksgiving/i, fits: (l) => listed(l.holidays, /Thanksgiving/i) },
  { re: /Fourth of July|4th of July|July 4th/i },
  { re: /Halloween|trick-or-treat/i, fits: (l) => listed(l.holidays, /Halloween/i) },
  { re: /Super Bowl/i },
  { re: /Little League/i, fits: (l) => listed(l.sports, /baseball/i) },
  { re: /Las Vegas/i, fits: (l) => listed(l.getaways, /Vegas/i) },
  { re: /lemonade stand/i, fits: (_l, id) => id === 'ca' },
  { re: /\bfreshman\b|\bsophomore\b|\bGPA\b/i },
  { re: /\bHOA\b|homeowners'? association/i },
  { re: /Medicaid|Obamacare/i },
  { re: /state trooper|county sheriff/i },
  { re: /snow day|sledding|\bsled\b|blizzard|snowman|snowball fight|snowed in|shovel(?:ed|ing)? (?:the )?snow/i, fits: (l) => l.snow },
]

/**
 * True when a text paints an American scene that doesn't belong in the player's country
 * (always false for US players). Screens events and flavor lines.
 */
export function foreignToLocale(g: GameState, text: string, countryId = g.character.countryId): boolean {
  if (countryId === 'us' || !text) return false
  const loc = localeOf(countryId)
  return AMERICAN_MARKERS.some((m) => m.re.test(text) && !(m.fits?.(loc, countryId) ?? false))
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch (err) {
    console.error('[events]', err)
    return fallback
  }
}

function weightOf(g: GameState, ev: EventDef): number {
  const w = typeof ev.weight === 'function' ? safe(() => (ev.weight as (g: GameState) => number)(g), 0) : (ev.weight ?? DEFAULT_WEIGHT)
  return Number.isFinite(w) && w > 0 ? w : 0
}

/** Can this event fire right now (age, prison, cooldown, once, condition)? */
export function eventEligible(g: GameState, ev: EventDef): boolean {
  const c = g.character
  if (!c.alive) return false
  if (c.age < ev.minAge || c.age > ev.maxAge) return false
  const where = ev.where ?? 'free'
  const jailed = inPrison(g)
  if (where === 'free' && jailed) return false
  if (where === 'prison' && !jailed) return false
  const last = lastFired(g, ev.id)
  if (last !== undefined) {
    if (ev.once) return false
    if (c.age - last < (ev.cooldown ?? DEFAULT_COOLDOWN) && last <= c.age) return false
  }
  const kind = KIND_OF[ev.id]
  if (kind) {
    for (const other of EVENT_KINDS[kind]) {
      if (other === ev.id) continue
      const at = lastFired(g, other)
      if (at !== undefined && at <= c.age && c.age - at < KIND_COOLDOWN) return false
    }
  }
  if (ev.when && !safe(() => ev.when!(g), false)) return false
  return weightOf(g, ev) > 0
}

export function eligibleEvents(g: GameState): EventDef[] {
  return EVENT_LIBRARY.filter((ev) => eventEligible(g, ev))
}

/**
 * Queue one random event popup chosen by weight among eligible events.
 * Returns the event id, or null when nothing fits.
 */
export function queueRandomEvent(g: GameState): string | null {
  const pool = eligibleEvents(g)
  for (let attempt = 0; attempt < 20 && pool.length > 0; attempt++) {
    const total = pool.reduce((sum, ev) => sum + weightOf(g, ev), 0)
    if (total <= 0) return null
    let roll = randInt(g, 1, Math.max(1, Math.round(total * 100))) / 100
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= weightOf(g, pool[i])
      if (roll <= 0) {
        index = i
        break
      }
    }
    const ev = pool[index]
    const setup = safe(() => ev.setup(g), null)
    const kind = eventKind(ev.id)
    // Same kind of thing about the same person too soon (Hendra again?), or a scene from
    // somebody else's country: pick something else.
    if (
      !setup ||
      setup.choices.length < 2 ||
      (setup.person && personRecentlyFeatured(g, setup.person.id, kind)) ||
      foreignToLocale(g, [setup.title ?? ev.title, setup.text, ...setup.choices.map((c) => c.label)].join(' \n '))
    ) {
      pool.splice(index, 1)
      continue
    }
    present(g, ev, setup)
    history(g)[ev.id] = g.character.age
    rememberEvent(g, {
      title: setup.title ?? ev.title,
      age: g.character.age,
      personId: setup.person?.id ?? '',
      person: setup.person?.firstName ?? '',
      kind,
      gen: g.generation,
    })
    bumpEventCounter(g)
    return ev.id
  }
  return null
}

function bumpEventCounter(g: GameState): void {
  g.counters.randomEvents = (g.counters.randomEvents ?? 0) + 1
}

/** Chance that a year brings a popup event (most years, not every year). */
function eventChance(g: GameState): number {
  const age = g.character.age
  if (inPrison(g)) return 0.6
  if (age < 2) return 0.55
  if (age < 5) return 0.65
  if (age >= 80) return 0.65
  return 0.72
}

// ---------------------------------------------------------------------------
// Resolving event popups

function alivePerson(g: GameState, id: Json | undefined): Person | undefined {
  if (typeof id !== 'string') return undefined
  const p = g.people.find((x) => x.id === id)
  return p && p.alive ? p : undefined
}

function makeCtx(g: GameState, ev: EventDef, data: EvData): Ctx {
  return {
    ev,
    data,
    p: alivePerson(g, data.personId),
    q: alivePerson(g, data.otherId),
    s: (key) => {
      const v = data[key]
      return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
    },
    n: (key) => {
      const v = data[key]
      return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0
    },
  }
}

function handleEvent(g: GameState, choice: string, data: Json | undefined, modal: ModalItem): void {
  if (!g.character.alive) return
  const d: EvData = isRecord(data) ? { ...data } : {}
  const ev = typeof d.eventId === 'string' ? EVENTS_BY_ID[d.eventId] : undefined
  const fn = ev?.resolve[choice]
  if (!ev || !fn) {
    if (modal.kind === 'choice') resolveGenericChoice(g, modal, choice)
    return
  }
  const where = ev.where ?? 'free'
  if (where === 'free' && inPrison(g)) {
    notice(g, 'Behind Bars', "Before you could act, you remembered you're locked up. The moment passed.", { emoji: '🔒' })
    return
  }
  if (where === 'prison' && !inPrison(g)) {
    notice(g, 'Water Under the Bridge', "You're not in prison anymore. Whatever was going on in there is someone else's problem now.", { emoji: '🕊️' })
    return
  }
  const ctx = makeCtx(g, ev, d)
  try {
    withCtx(ctx, () => fn(g, ctx))
  } catch (err) {
    console.error(`[events] ${ev.id}/${choice} failed`, err)
    if (g.character.alive && modal.kind === 'choice') resolveGenericChoice(g, modal, choice)
  }
}

defineScript(EVENT_SCRIPT, handleEvent)

// ---------------------------------------------------------------------------
// Contract exports

/** The year's story: 1-2 flavor log lines and, most years, one random event popup. */
export function queueFallbackYearEvents(g: GameState): void {
  if (!g.character.alive) return
  const last = g.log[g.log.length - 1]
  const before = last && last.age === g.character.age ? last.entries.length : 0
  safe(() => addFlavorLines(g), undefined)
  // Drop flavor lines from somebody else's country (a snow day in Jakarta).
  const year = g.log[g.log.length - 1]
  if (year && year.age === g.character.age && year.entries.length > before) {
    const fresh = year.entries.slice(before).filter((e) => !foreignToLocale(g, e.text))
    year.entries.splice(before, year.entries.length - before, ...fresh)
  }
  if (chance(g, eventChance(g))) queueRandomEvent(g)
}

/**
 * Resolve a choice popup that has no script of its own: an event the old AI narrator wrote,
 * still queued in an older save. A generic outcome that fits the option picked.
 */
export function fallbackChoiceOutcome(g: GameState, event: ChoiceModal, choiceId: string): void {
  if (!g.character.alive) return
  resolveGenericChoice(g, event, choiceId)
}

/** Resolve the free-form "Do Anything" text offline (counts 'customActions'). */
export function fallbackCustomAction(g: GameState, text: string): void {
  if (!g.character.alive) return
  resolveCustomAction(g, text)
}

/** A few-sentence obituary built from the life that was lived. */
export function fallbackObituary(g: GameState): string {
  return safe(
    () => writeObituary(g),
    `${fullName(g.character)} died at the age of ${g.character.age}${g.character.causeOfDeath ? ` from ${g.character.causeOfDeath.toLowerCase()}` : ''}. Rest in peace.`,
  )
}
