// The offline event library: what the player sees when the AI narrator is off,
// unreachable or skipped. Every year gets one or two first-person flavor lines and,
// most years, one classic random-event popup chosen by weighted, condition-aware
// selection (age, school, job, family, prison, money) that never repeats too soon.
//
// Contract exports: queueFallbackYearEvents, fallbackChoiceOutcome, fallbackCustomAction,
// fallbackObituary. The event data lives in src/game/events/*.ts.
import { fullName, inPrison, notice } from './core'
import { ADULT_EVENTS } from './events/adult'
import { BABY_EVENTS } from './events/baby'
import { resolveGenericChoice } from './events/choice'
import { resolveCustomAction } from './events/custom'
import { ELDER_EVENTS } from './events/elder'
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

function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function history(g: GameState): { [key: string]: Json } {
  const raw = g.flags[EVENT_HISTORY_FLAG]
  if (isRecord(raw)) return raw
  const fresh: { [key: string]: Json } = {}
  g.flags[EVENT_HISTORY_FLAG] = fresh
  return fresh
}

/** Age at which an event last fired in this life, if ever. */
export function lastFired(g: GameState, id: string): number | undefined {
  const raw = g.flags[EVENT_HISTORY_FLAG]
  if (!isRecord(raw)) return undefined
  const v = raw[id]
  return typeof v === 'number' ? v : undefined
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
  for (let attempt = 0; attempt < 10 && pool.length > 0; attempt++) {
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
    if (!setup || setup.choices.length < 2) {
      pool.splice(index, 1)
      continue
    }
    present(g, ev, setup)
    history(g)[ev.id] = g.character.age
    count(g)
    return ev.id
  }
  return null
}

function count(g: GameState): void {
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

/** Offline year: 1-2 flavor log lines and, most years, one random event popup. */
export function queueFallbackYearEvents(g: GameState): void {
  if (!g.character.alive) return
  safe(() => addFlavorLines(g), undefined)
  if (chance(g, eventChance(g))) queueRandomEvent(g)
}

/** Resolve an AI-sourced choice popup when the AI fails before narrating the outcome. */
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
