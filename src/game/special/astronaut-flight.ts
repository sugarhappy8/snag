// Astronaut 2.0 flights: the Flight Board (the seats open this year and the edge you would bid with), the bid
// against a named rival, the tour length and care plan, the launch and what a tour costs the body, and the rows
// that care for it. Offers are seeded and priced by pure functions, so the menu, the hint and the bid agree; g.rng
// is drawn only in run() bodies and script handlers (the bid, the launch, the pay). Every payment goes through
// `c.earn` and `c.pay`. This file reads the legacy astronaut.ts inside function bodies only: it imports this one.
import { localPrice } from '../activities/common'
import { seeded } from '../assets'
import { addStat, useYearAction, yearActionsUsed } from '../core'
import { killCharacter } from '../death'
import { chance, randFloat, randInt, weightedPick } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { outcomeTag } from '../timeMachine'
import type { ChoiceOption, GameState, Json, MenuAction, MenuNode } from '../types'
import { DESTINATIONS, adata, agencyOf, astronautJob, flyOn } from './astronaut'
import { seededCandidates } from './astronaut-class'
import {
  BID,
  BID_RIVALS,
  BOARD,
  CAUSES,
  CAUSE_WEIGHT,
  DOSE_RATE,
  ERA,
  FLIGHT_PAY,
  INJURY_COST,
  LOSS,
  MISSIONS,
  MISSION_EDGES,
  PREP,
  PROMOTION_SEATS,
  PROMOTION_STANDING,
  REGIMEN_DAYS,
  REHAB,
  ROLES,
  ROLE_SKILL,
  ROLE_WEIGHT,
  SEAT_GATES,
  SQUEEZE_CAUSE,
  TOUR_365,
  eraKey,
  type MissionId,
  type Regimen,
  type Role,
} from './astronaut-data'
import { astronautStore, type AstroState, type FlightRec } from './astronaut-state'
import { ASTRO_SPEC, FATAL_SHARE, access, fundingIndex, launchRisk, missionsOpen, projectBody, tourDays, type Access } from './astronaut-world'
import { addColleague, money, ownFlag } from './common'
import { applyEffects, honest } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { activeField, familySeed, noteRival, standingOf, type CareerRival } from './kit/rivals'
import { cap, nextId, rec, txt } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, fit, offerChoice, type CareerCtx } from './kit/year'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
/** One decimal: the record keeps body numbers to one, so a re-read is stable. */
const round1 = (n: number): number => Math.round(n * 10) / 10
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

const ROCKET = '\u{1F680}'
const BOARD_SCRIPT = 'career.astronaut.board'
const PLAN_SCRIPT = 'career.astronaut.plan'
const BID_KEY = 'astro.bid'
const MISSION_KEY = 'astro.mission'
const TRAIN_KEY = 'astro.train'

/** Hop, orbit, orbiter and commercial flights use the generic `flight` arrival; the rest keep their legacy scene. */
export function legacyDest(type: MissionId): string {
  return type === 'station' || type === 'satellite' || type === 'moon' || type === 'deep' || type === 'mars' ? type : 'flight'
}

// ---------------------------------------------------------------------------
// Offers (pure, seeded, no g.rng)

export interface Offer { id: string; type: MissionId; days: number; role: Role; seats: number; risk: number; rival: { id: string; name: string } | null; edge: number }

/** The agency the astronaut flies for, as the access table knows it this year; null when none flies crews here. */
export function jobAccess(g: GameState): Access | null {
  const job = astronautJob(g)
  if (!job) return null
  const id = agencyOf(adata(job).agency, g).id
  return access(g).find((a) => a.id === id) ?? null
}

/** Launch prep: 1.2 unprepared, 1.0 after a training session this year. */
const prepOf = (g: GameState): number => (yearActionsUsed(g, TRAIN_KEY) >= 1 ? PREP.trained : PREP.cold)

/** Flights a year on the world manifest: clamp(round(base x F/50), 0, 6). */
export function manifestOf(year: number, funding: number): number {
  return clamp(Math.round((ERA[eraKey(year)].manifest * fin(funding)) / 50), 0, 6)
}

/** Names a past inquiry lost: they no longer bid. */
function lostNames(s: AstroState): Set<string> {
  return new Set(s.inquiries.flatMap((i) => i.lost))
}

type Scored = { rival: CareerRival; score: number }

/** The top rivals whose background fits the flight, from the kit's `activeField` (so a test can spy it). */
function fitting(all: readonly Scored[], type: MissionId, lost: ReadonlySet<string>): Scored[] {
  const edges: readonly string[] = MISSION_EDGES[type] ?? []
  return all.filter((x) => edges.includes(x.rival.edge) && !lost.has(x.rival.name)).slice(0, BID_RIVALS)
}

/** Rivals who could take the seat on a flight of this type: the top active ones whose edge fits it. */
export function bidRivals(g: GameState, s: AstroState, type: MissionId): CareerRival[] {
  return fitting(activeField(g, ASTRO_SPEC, s.memory), type, lostNames(s)).map((x) => x.rival)
}

/** 0.5 standing + 0.3 seat skill (pilot, team or eva by role) + 4 x rank, rounded. The edge of an offer is this minus the rival's score. */
export function bidScore(g: GameState, s: AstroState, o: Offer): number {
  const level = fin(astronautJob(g)?.level)
  return Math.round(BID.standing * fin(s.standing) + BID.skill * fin(s.skills[ROLE_SKILL[o.role]]) + BID.level * level)
}

/** The six seats the board builds this year, unfiltered: the bid re-reads this list, so a seat you may not take is still found and refused. */
function allOffers(g: GameState, s: AstroState, funding: number = fundingIndex(g, s, g.year)): Offer[] {
  const ac = jobAccess(g)
  if (!ac || funding < BOARD.minFunding) return []
  const open = missionsOpen(g, ac.agency).filter((t) => t !== 'own')
  if (open.length === 0) return []
  const field = activeField(g, ASTRO_SPEC, s.memory)
  const lost = lostNames(s)
  const family = familySeed(g)
  const tag = outcomeTag(g, g.year)
  const out: Offer[] = []
  for (let i = 0; i < BOARD.built; i++) {
    const r = seeded(`astro|${family}|${ac.id}|${g.year}|offer|${i}${tag}`)
    const type = r.pick(open)
    const seats = MISSIONS[type].seatCount
    const role = seats < 2 ? 'pilot' : r.weighted(ROLES, (x) => ROLE_WEIGHT[x])
    const days = tourDays(type, g.year)[0]
    const rivals = fitting(field, type, lost)
    const rival = rivals.length > 0 ? rivals[r.int(0, rivals.length - 1)] : null
    const o: Offer = {
      id: `o${i}`,
      type,
      days,
      role,
      seats,
      risk: launchRisk(g, s, type, days, { prep: prepOf(g), squeeze: s.mark.rush, rocketeer: ac.agency === 'rocketeer' }),
      rival: rival ? { id: rival.rival.id, name: rival.rival.name } : null,
      edge: 0,
    }
    o.edge = rival ? bidScore(g, s, o) - rival.score : 0
    out.push(o)
  }
  return out
}

/** The rank a flight asks for: the legacy row's minimum (Mars drops to 3 once the funding bill passed). */
function legacyMin(g: GameState, type: MissionId): number {
  const row = DESTINATIONS.find((d) => d.id === legacyDest(type))
  if (!row) return 1
  return row.id === 'mars' && ownFlag(g, 'marsFunding') === true ? 3 : row.minLevel
}

/** Why this seat is not yours: the role and rank gates, then the legacy rank for the flight. Null when it is. */
function seatBlock(g: GameState, s: AstroState, o: Offer): string | null {
  const job = astronautJob(g)
  if (!job) return "You don't fly for an agency."
  if (job.level < 1) return 'Astronaut Candidates are not cleared for flight yet. Keep training to earn your wings.'
  const gate = SEAT_GATES[o.role]
  if (job.level < gate.level) return o.role === 'commander' ? 'The command seat goes to a Mission Commander or above.' : 'The pilot seat needs the rank of Mission Specialist.'
  if (fin(s.skills.pilot) < gate.skill) return 'The pilot seat needs a pilot skill of 50.'
  return job.level < legacyMin(g, o.type) ? 'That flight asks for a higher rank.' : null
}

/** Why you cannot fly at all right now (health, leave, the radiation limit); the tour length is the one the offer carries. */
function stateBlock(g: GameState, s: AstroState, days: number): string | null {
  if (g.character.stats.health < 30) return 'The flight surgeon grounded you until your health improves.'
  if (s.mark.groundedYear === g.year) return "You're on leave this year. No flights."
  if (fin(s.dose) >= 100) return "Your radiation dose is at the limit. You're grounded for good."
  return fin(s.dose) + days * DOSE_RATE > 100 ? 'That tour would pass your radiation limit.' : null
}

/** Role and rank gates (seatBlock), then the grounded year and the dose. Checked in the menu and again inside run(). */
export function bidBlock(g: GameState, s: AstroState, o: Offer): string | null {
  return seatBlock(g, s, o) ?? stateBlock(g, s, o.days)
}

/** The seats you can bid on: the six built, minus the ones your rank bars, at most four and at most what the era's manifest flies. Funding under 20 gives none. */
export function buildOffers(g: GameState, s: AstroState): Offer[] {
  const funding = fundingIndex(g, s, g.year)
  return allOffers(g, s, funding)
    .filter((o) => seatBlock(g, s, o) === null)
    .slice(0, Math.min(BOARD.shown, manifestOf(g.year, funding)))
}

/** Tour lengths you may take: the offer's, minus the year-long tour before 2015 or below rank 3, minus any that would pass the radiation limit. */
export function tourOptions(g: GameState, s: AstroState, o: Offer): number[] {
  const level = fin(astronautJob(g)?.level)
  return tourDays(o.type, g.year).filter((d) => (d < 365 || (g.year >= TOUR_365.year && level >= TOUR_365.level)) && fin(s.dose) + d * DOSE_RATE <= 100)
}

// ---------------------------------------------------------------------------
// The bid

/** The limits that are not about the seat: one flight a year, two bids a year. */
function yearBlock(g: GameState): string | null {
  if (yearActionsUsed(g, MISSION_KEY) >= 1) return 'You already flew a mission this year. The next launch window is next year.'
  return yearActionsUsed(g, BID_KEY) >= BOARD.bids ? "You've made your two bids this year." : null
}

/**
 * Bids for an offer: two bids a year, the second at -3 edge. You win when your score plus randInt(-5, 5) beats the
 * rival's plus a seeded -4 to 4; with no rival the seat is sure. A win spends the year's flight (astro.mission), a
 * lost bid only the bid, and a named rival is remembered either way. A refused bid (no such seat, a gate, a limit)
 * says why, spends and books nothing, and reads as lost to the caller.
 */
export function runBid(c: CareerCtx<AstroState>, offerId: string): 'won' | 'lost' | 'sure' {
  const { g, s } = c
  const o = allOffers(g, s).find((x) => x.id === offerId)
  const why = !o ? 'That seat is gone.' : (yearBlock(g) ?? bidBlock(g, s, o))
  if (!o || why) {
    careerSay(c, 'Flight Board', why ?? 'That seat is gone.', ROCKET)
    return 'lost'
  }
  const second = yearActionsUsed(g, BID_KEY) >= 1
  useYearAction(g, BID_KEY, BOARD.bids)
  if (!o.rival) {
    useYearAction(g, MISSION_KEY, 1)
    return 'sure'
  }
  const theirs = bidScore(g, s, o) - o.edge + seeded(`astro|${familySeed(g)}|bid|${o.rival.id}|${g.year}|${o.id}${outcomeTag(g, g.year)}`).int(-BID.rival, BID.rival)
  const mine = bidScore(g, s, o) - (second ? BID.second : 0) + randInt(g, -BID.swing, BID.swing)
  const won = mine > theirs
  s.memory = noteRival(s.memory, o.rival, c.year, won ? { met: 1, won: 1 } : { met: 1, lost: 1 })
  if (won) useYearAction(g, MISSION_KEY, 1)
  return won ? 'won' : 'lost'
}

const nOf = (data: Json | undefined): string => txt(rec(data).n, 12)
const edgeText = (o: Offer): string => (o.rival ? `edge ${signed(o.edge)}` : 'sure seat')
const offerLabel = (o: Offer): string => `${MISSIONS[o.type].label}, ${edgeText(o)}`

defineScript(BOARD_SCRIPT, (g, choice, data) => {
  if (choice === 'cancel' || !g.character.alive || !astronautJob(g)) return
  const s = astronautStore.mut(g)
  const o = allOffers(g, s).find((x) => x.id === choice)
  if (!o || !claimChoice(g, s, data, `board.${nOf(data)}`)) return
  const c = careerCtx(g, 'astronaut', s)
  const why = yearBlock(g) ?? bidBlock(g, s, o)
  if (why) {
    careerSay(c, 'Flight Board', why, ROCKET)
    return
  }
  const result = runBid(c, o.id)
  if (result === 'lost') {
    const name = o.rival?.name ?? 'A rival'
    careerLog(c, `${name} got the seat I bid for.`, 'bad')
    careerSay(c, 'Flight Board', `${name} took the seat.${yearActionsUsed(g, BID_KEY) < BOARD.bids ? ' You can bid once more this year.' : ''}`, ROCKET, 'bad')
    return
  }
  startPlan(c, o, nOf(data))
})

// ---------------------------------------------------------------------------
// The plan: tour length, then care plan

const REGIMENS: readonly Regimen[] = ['light', 'standard', 'intense']
const REGIMEN_LABEL: Record<Regimen, string> = { light: 'Go light', standard: 'Go standard', intense: 'Go intense' }
const REGIMEN_EMOJI: Record<Regimen, string> = { light: '\u{1F6B6}', standard: '\u{1F3CB}\u{FE0F}', intense: '\u{1F4AA}' }

/** The regimen with the lowest bone loss plus injury cost for this body: the one the hint marks. */
export function bestRegimen(s: AstroState, days: number): Regimen {
  const cost = (r: Regimen): number => {
    const b = projectBody(s, days, r, s.skills.fit)
    return b.bone + b.injury * INJURY_COST
  }
  return REGIMENS.reduce((best, r) => (cost(r) < cost(best) ? r : best))
}

function startPlan(c: CareerCtx<AstroState>, o: Offer, n: string): void {
  const { g, s } = c
  const lengths = tourOptions(g, s, o)
  if (lengths.length === 0) {
    careerSay(c, 'Flight Board', 'That tour would pass your radiation limit.', ROCKET)
    return
  }
  if (lengths.length === 1) {
    nextStep(c, o, lengths[0], n)
    return
  }
  const rows = lengths.map((d) => {
    const b = projectBody(s, d, 'standard', s.skills.fit)
    return `${d} days, bone -${round1(b.bone)}, dose +${round1(b.dose)}`
  })
  const choices: ChoiceOption[] = lengths.map((d) => ({ id: `d${d}`, label: `Fly ${d} days`, emoji: ROCKET }))
  offerChoice(c, PLAN_SCRIPT, 'Tour Length', `Pick the tour. At standard care, ${rows.join('. ')}. What will you do?`, choices, { offerId: o.id, step: 'days', n }, ROCKET)
}

/** After the length: a tour over 30 days asks for a care plan; a short one flies at once. */
function nextStep(c: CareerCtx<AstroState>, o: Offer, days: number, n: string): void {
  const { g, s } = c
  if (days <= REGIMEN_DAYS) {
    resolveFlight(c, o, days, 'standard')
    return
  }
  const best = bestRegimen(s, days)
  const choices: ChoiceOption[] = REGIMENS.map((r) => {
    const b = projectBody(s, days, r, s.skills.fit)
    return { id: r, label: REGIMEN_LABEL[r], emoji: REGIMEN_EMOJI[r], ...(r === best ? honest(g, 'Academics', `Lowest bone and injury cost. Bone about ${Math.round(s.bone - b.bone)} after this tour.`) : {}) }
  })
  offerChoice(c, PLAN_SCRIPT, 'Care Plan', `${days} days up. Pick the care plan. Intense risks an injury. What will you do?`, choices, { offerId: o.id, step: 'regimen', days, n }, ROCKET)
}

defineScript(PLAN_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !astronautJob(g)) return
  const d = rec(data)
  const step = d.step === 'regimen' ? 'regimen' : 'days'
  const s = astronautStore.mut(g)
  const o = allOffers(g, s).find((x) => x.id === d.offerId)
  if (!o || !claimChoice(g, s, data, `plan.${nOf(data)}.${step}`)) return
  const c = careerCtx(g, 'astronaut', s)
  // The seat is won, but the body may have changed since: the tour must still be one you may fly.
  const days = step === 'days' ? Number(choice.slice(1)) : fin(d.days)
  const why = stateBlock(g, s, 0) ?? (tourOptions(g, s, o).includes(days) ? null : 'That tour is not open to you.')
  if (why) {
    careerSay(c, 'Flight Board', why, ROCKET)
    return
  }
  if (step === 'days') {
    nextStep(c, o, days, nOf(data))
    return
  }
  if (!REGIMENS.includes(choice as Regimen)) return
  resolveFlight(c, o, days, choice as Regimen)
})

// ---------------------------------------------------------------------------
// The flight

/** Fictional crew names: seeded from the family seed, never g.rng, and never a roster rival (nobody on the board is lost). */
export function crewNames(g: GameState, key: string, n: number): string[] {
  return n > 0 ? seededCandidates(g, key, g.year, n).map((x) => x.name) : []
}

const LAUNCH = ['The countdown ran clean and the engines lit.', 'The vehicle cleared the tower and climbed.', 'The launch went to plan. You settled in for the ride.']

/** A crewmate becomes a coworker (three living contacts at most): the person takes the crew roster's name. */
function befriend(g: GameState, company: string, crew: readonly string[]): void {
  if (crew.length === 0) return
  if (g.people.filter((p) => p.alive && p.relation === 'coworker' && p.contextId === company).length >= 3) return
  const person = addColleague(g, company, 'Astronaut', { ageOffset: [-6, 6] })
  const [first, ...rest] = crew[0].split(' ')
  person.firstName = first
  if (rest.length > 0) person.lastName = rest.join(' ')
}

/**
 * The launch and the tour. A launch roll on g.rng (a loss is fatal for you 60% of the time; otherwise you live, the
 * crew is named in one Inquiry and the flight ends as an anomaly). A flight that goes well pays flight pay through the
 * ledger (at most 40% of the salary), costs the body (bone, muscle, radiation dose, family strain), writes the
 * FlightRec and the tally, makes one crewmate a coworker, and hands the rest (the asteroid field, the arrival) to the
 * legacy mission code, flagged paid so it adds no bonus of its own.
 */
export function resolveFlight(c: CareerCtx<AstroState>, o: Offer, days: number, regimen: Regimen): void {
  const { g, s } = c
  const job = astronautJob(g)
  if (!job || !g.character.alive) return
  const m = MISSIONS[o.type]
  const label = m.label.toLowerCase()
  const squeezed = s.mark.rush
  const risk = launchRisk(g, s, o.type, days, { prep: prepOf(g), squeeze: squeezed, rocketeer: agencyOf(adata(job).agency, g).id === 'rocketeer' })
  const crew = crewNames(g, `crew.${o.id}.${s.seq}`, Math.min(5, Math.max(0, o.seats - 1)))
  adata(job).lastMissionAge = g.character.age
  s.mark.rush = false // a schedule squeeze is spent on the flight it hurried

  if (chance(g, risk)) {
    if (chance(g, FATAL_SHARE)) {
      careerSay(c, 'Liftoff', "The vehicle came apart on the way up. You didn't get out.", '\u{1F4A5}', 'bad')
      killCharacter(g, 'Rocket Explosion')
      return
    }
    const lost = crew.slice(0, crew.length > 0 ? randInt(g, 1, 3) : 0)
    if (lost.length > 0) {
      const cause = weightedPick(g, CAUSES, (x) => CAUSE_WEIGHT[x] + (x === 'schedule' && squeezed ? SQUEEZE_CAUSE : 0))
      s.inquiries = cap([...s.inquiries, { id: nextId(s, 'iq'), year: g.year, cause, lost, involved: true, yearsOpen: 0, status: 'open', stance: '', coverup: false }], 4)
    }
    s.flights = cap([...s.flights, { year: g.year, type: o.type, role: o.role, days, regimen, result: 'anomaly', crew, bone: s.bone, dose: s.dose } satisfies FlightRec], 12)
    s.mood = clamp(s.mood - LOSS.mood, 0, 100)
    s.safety = clamp(s.safety - LOSS.safety, 15, 95)
    addStat(g, 'health', -randInt(g, 10, 25))
    addStat(g, 'happiness', -10)
    careerLog(c, 'I survived a failed launch.', 'bad')
    careerSay(c, 'Launch Failure', lost.length > 0 ? `The ${label} failed on the way up. You lived. ${list(lost)} didn't.` : `The ${label} failed on the way up. You lived, hurt.`, '\u{1F4A5}', 'bad')
    return
  }

  const body = projectBody(s, days, regimen, s.skills.fit)
  const salary = fin(job.salary)
  const base = salary * m.bonus * randFloat(g, FLIGHT_PAY.lo, FLIGHT_PAY.hi) + FLIGHT_PAY.perDay * salary * days
  const paid = c.earn('Flight pay', Math.round(Math.min(FLIGHT_PAY.cap * salary, base) / 100) * 100)
  s.bone = Math.max(15, round1(s.bone - body.bone))
  s.muscle = Math.max(15, round1(s.muscle - body.muscle))
  s.dose = Math.min(100, round1(s.dose + body.dose))
  const child = g.people.some((p) => p.alive && p.relation === 'child' && p.age < 12)
  s.family = Math.min(100, round1(s.family + body.strain + (child ? 4 : 0)))
  if (regimen === 'intense') {
    s.cool.intense = Math.min(9999, g.year + 1) // research is cut 30% this year and next
    if (chance(g, body.injury)) {
      addStat(g, 'health', -randInt(g, 5, 12))
      careerLog(c, 'I hurt myself on the intense regimen.', 'bad')
    }
  }
  s.flights = cap([...s.flights, { year: g.year, type: o.type, role: o.role, days, regimen, result: 'clean', crew, bone: s.bone, dose: s.dose } satisfies FlightRec], 12)
  s.tally.flights = Math.min(1e6, s.tally.flights + 1)
  s.tally.days = Math.min(1e7, s.tally.days + days)
  if (o.role === 'commander') s.tally.commands = Math.min(1e6, s.tally.commands + 1)
  befriend(g, job.company, crew)
  careerLog(c, `I launched on a ${label}, ${days} days.`, 'event')
  if (paid > 0) careerLog(c, `I was paid ${money(paid)} for the flight.`, 'good')
  flyOn(g, legacyDest(o.type), pickLine(g, LAUNCH), true)
}

// ---------------------------------------------------------------------------
// Training, promotion and the body

/** What each legacy drill trains: the neutral buoyancy pool EVA, the simulator piloting, the centrifuge fitness, survival teamwork. */
const DRILL_SKILL: Record<string, keyof AstroState['skills']> = { pool: 'eva', sim: 'pilot', centrifuge: 'fit', survival: 'team' }

/**
 * A training session also trains a corps skill by 3 to 8 (the legacy drill's own gain): the pool EVA, the simulator
 * piloting, the centrifuge fitness, survival teamwork; with no drill named, the weakest skill. A no-op without a
 * corps record, so a legacy life trains exactly as before.
 */
export function trainSkills(g: GameState, choice?: string, gain?: number): void {
  if (!astronautStore.has(g)) return
  const s = astronautStore.mut(g)
  const weakest = (Object.keys(s.skills) as (keyof AstroState['skills'])[]).reduce((a, b) => (s.skills[b] < s.skills[a] ? b : a))
  const skill = (choice !== undefined ? DRILL_SKILL[choice] : undefined) ?? weakest
  s.skills[skill] = clamp(Math.round(s.skills[skill] + (gain ?? randInt(g, 3, 8))), 0, 100)
}

/**
 * The rank gate the legacy promotion also asks for: standing 50, 55, 60, 66 or 74 for rank 1 to 5, and for ranks 2 to 5
 * a seat in the corps (12, 8, 4 or 1 seats: you must stand that high among the peers). True without a record.
 */
export function astroPromotionOk(g: GameState, next: number): boolean {
  const s = astronautStore.peek(g)
  if (!s) return true
  if (s.standing < (PROMOTION_STANDING[next] ?? 0)) return false
  const seats = PROMOTION_SEATS[next]
  return seats === undefined || standingOf(g, ASTRO_SPEC, s.standing, s.memory).rank <= seats
}

type Spec = Omit<Parameters<typeof gatedAction<AstroState>>[0], 'career' | 'store'>
/** A gated action on the corps record. */
const row = (spec: Spec): MenuAction => gatedAction<AstroState>({ career: 'astronaut', store: astronautStore, ...spec })

const rehabPrice = (g: GameState): number => localPrice(g, REHAB.usd)

let bodyRows: MenuNode[] | null = null

/** astro.rehab (the full program, once a year) and astro.family (leave, once a year). */
export function astroBodyRows(_g: GameState): MenuNode[] {
  return (bodyRows ??= [
    row({
      id: 'astro.rehab',
      label: 'Bone Rehab',
      emoji: '\u{1F9B4}',
      subtitle: (g) => `Costs ${money(rehabPrice(g))}. Bone +${REHAB.bone}, muscle +${REHAB.muscle}. Once a year.`,
      gate: (g, s) => {
        if (!astronautJob(g)) return null
        if (s.bone >= 100 && s.muscle >= 100) return 'Your bones and muscle are at full strength.'
        return g.character.money >= rehabPrice(g) ? null : "You can't afford the program."
      },
      once: 'astro.rehab',
      run: (c) => {
        if (!c.pay('Bone rehab', rehabPrice(c.g))) return
        c.s.bone = Math.min(100, round1(c.s.bone + REHAB.bone))
        c.s.muscle = Math.min(100, round1(c.s.muscle + REHAB.muscle))
        careerSay(c, 'Bone Rehab', `The program ran for weeks. Bone is ${Math.round(c.s.bone)} and muscle ${Math.round(c.s.muscle)}.`, '\u{1F9B4}', 'good')
      },
    }),
    row({
      id: 'astro.family',
      label: 'Take Family Leave',
      emoji: '\u{1F3E0}',
      subtitle: 'No flights this year. Strain -25, happiness +6, standing -3. Once a year.',
      gate: (g, s) => {
        if (!astronautJob(g)) return null
        if (s.family < 40) return "Family strain is under 40. You don't need leave."
        return s.mark.groundedYear === g.year ? "You're already on leave this year." : null
      },
      once: 'astro.family',
      run: (c) => {
        c.s.mark.groundedYear = c.year
        c.s.family = Math.max(0, round1(c.s.family - 25))
        applyEffects(c, { standing: -3, happiness: 6 }, 'Family leave')
        careerSay(c, 'Family Leave', 'You took the year at home. The strain eased.', '\u{1F3E0}', 'good')
      },
    }),
  ])
}

// ---------------------------------------------------------------------------
// The Flight Board menu

/** astro.mission (the Flight Board) and one info row per open seat. */
export function flightBoardRows(g: GameState): MenuNode[] {
  const s = astronautStore.view(g)
  const rows: MenuNode[] = [missionRow()]
  const job = astronautJob(g)
  if (!job || job.level < 1) return rows
  for (const o of buildOffers(g, s)) {
    const rival = o.rival ? `, ${edgeText(o)} on ${o.rival.name}` : ', sure seat'
    rows.push({ type: 'info', id: `astro.board.${o.id}`, emoji: ROCKET, text: fit(`${MISSIONS[o.type].label}, ${o.days} days, ${o.role}, risk about ${(o.risk * 100).toFixed(1)}%${rival}.`, 90) })
  }
  return rows
}

let mission: MenuAction | null = null
function missionRow(): MenuAction {
  return (mission ??= row({
    id: 'astro.mission',
    label: 'Go on a Mission',
    emoji: ROCKET,
    subtitle: (g) => {
      const job = astronautJob(g)
      if (!job) return ''
      if (job.level < 1) return 'Candidates must finish training before flying'
      const n = buildOffers(g, astronautStore.view(g)).length
      return n > 0 ? `${n} seat${n === 1 ? '' : 's'} open · One launch window per year` : 'One launch window per year'
    },
    gate: (g, s) => {
      const job = astronautJob(g)
      if (!job) return null
      if (job.level < 1) return 'Astronaut Candidates are not cleared for flight yet. Keep training to earn your wings.'
      if (g.character.stats.health < 30) return 'The flight surgeon grounded you until your health improves.'
      const early = yearBlock(g)
      if (early) return early
      if (s.mark.groundedYear === g.year) return "You're on leave this year. No flights."
      if (fin(s.dose) >= 100) return "Your radiation dose is at the limit. You're grounded for good."
      if (!jobAccess(g)) return 'No agency here flies crews yet.'
      if (buildOffers(g, s).length === 0) return fundingIndex(g, s, g.year) < BOARD.minFunding ? 'No flights are scheduled this year.' : 'No open seat fits you this year.'
      return null
    },
    run: (c) => {
      const { g, s } = c
      const offers = buildOffers(g, s)
      const best = offers.reduce<Offer | null>((top, o) => (o.rival && (!top || o.edge > top.edge) ? o : top), null)
      const choices: ChoiceOption[] = offers.map((o) => ({
        id: o.id,
        label: offerLabel(o),
        emoji: ROCKET,
        ...(o === best && o.rival ? honest(g, 'Academics', `Largest edge, ${signed(o.edge)} on ${o.rival.name}. Your bid and theirs stay unseen.`) : {}),
      }))
      choices.push({ id: 'cancel', label: 'Not yet', emoji: '\u{274C}' })
      const second = yearActionsUsed(g, BID_KEY) >= 1
      const scene = `Seats open this year. Edge is your score over the rival's.${second ? ' A second bid is 3 lower.' : ''} What will you do?`
      if (!offerChoice(c, BOARD_SCRIPT, 'Flight Board', scene, choices, { n: nextId(s, 'b') }, ROCKET)) careerSay(c, 'Flight Board', 'Settle the decisions waiting on you first.', ROCKET)
    },
  }))
}
