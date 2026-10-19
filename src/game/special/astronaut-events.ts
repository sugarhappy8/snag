// Astronaut 2.0 events: seven yearly crises the kit offers (35% of active years, one at a time), the forced choices
// that take the slot first (the medical board, then inquiry testimony, then an administrator's budget), the report
// card, and the lobby, concern and research rows. Each rolled crisis option has one `odds()` for the roll and the
// hint; the rest are fixed outcomes. Effects go through the kit's `Effects`; what an `Effects` cannot carry (safety,
// mood, lobby, team skill, the flight record) rides in `Branch.then`, which moves no money and draws no g.rng.
//
// Safety and mood are not `Effects` fields, so the hint weighs a branch only by what `Effects` carries (standing,
// fame, money, happiness, health). The numbers a branch states are exact; the hint is a guide, not a promise.
//
// This file reads the legacy astronaut.ts inside function bodies only: astronaut.ts imports this one.
import { localPrice } from '../activities/common'
import { seeded } from '../assets'
import { addRelationship, addStat, useYearAction, yearActionsUsed } from '../core'
import { chance, randInt } from '../rng'
import { defineScript } from '../scripts'
import { outcomeTag } from '../timeMachine'
import type { ChoiceOption, GameState, Json, MenuAction, MenuNode } from '../types'
import { addResearchPoints, astronautJob, researchPoints } from './astronaut'
import { CAUSES, DOSE_RATE, FLIGHT_PAY, MISSIONS, REHAB, STRAIN_RATE } from './astronaut-data'
import { offerAdmin } from './astronaut-exits'
import { astronautStore, type AstroState, type FlightRec, type Inquiry } from './astronaut-state'
import { fundingIndex } from './astronaut-world'
import { bump, fameOf, leave, money } from './common'
import { applyEffects, defineCrises, honest, hot, oddsText, type Branch, type CrisisDef, type CrisisSet } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { familySeed } from './kit/rivals'
import { rec, txt } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, offerChoice, type CareerCtx } from './kit/year'

// ---------------------------------------------------------------------------
// Small pure helpers

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const str = (v: unknown, max: number): string => (typeof v === 'string' ? txt(v, max) : '')
const round1 = (n: number): number => Math.round(n * 10) / 10

const ROCKET = '\u{1F680}'
const NO_JOB = "You aren't in the astronaut corps."
const PARTNERS = new Set(['spouse', 'partner', 'fiance'])

const partnerOf = (g: GameState) => g.people.find((p) => p.alive && PARTNERS.has(p.relation))
const homeFolks = (g: GameState): boolean => !!partnerOf(g) || g.people.some((p) => p.alive && p.relation === 'child' && p.age < 18)
const levelOf = (g: GameState): number => fin(astronautJob(g)?.level)
const funding = (g: GameState, s: AstroState): number => fundingIndex(g, s, g.year)
/** The space line was cut this year or last (the sim keeps the last year it applies in `cool.cut`). */
const lineCut = (s: AstroState, year: number): boolean => (s.cool.cut ?? -1) >= year

/** The flights of the year just ended, in order. */
const lastFlights = (s: AstroState, year: number): FlightRec[] => s.flights.filter((f) => f.year === year - 1)
const lastFlight = (s: AstroState, year: number): FlightRec | undefined => {
  const all = lastFlights(s, year)
  return all[all.length - 1]
}

const bumpSafety = (s: AstroState, d: number): void => {
  s.safety = clamp(Math.round(s.safety + d), 15, 95)
}
const bumpMood = (s: AstroState, d: number): void => {
  s.mood = clamp(Math.round(s.mood + d), 0, 100)
}
const bumpTeam = (s: AstroState, d: number): void => {
  s.skills.team = clamp(Math.round(s.skills.team + d), 0, 100)
}
const bumpLobby = (s: AstroState, d: number): void => {
  s.lobby = clamp(Math.round(s.lobby + d), -6, 20)
}
const bumpStrain = (s: AstroState, d: number): void => {
  s.family = clamp(round1(s.family + d), 0, 100)
}
const markLast = (s: AstroState, year: number, result: FlightRec['result']): void => {
  const f = lastFlight(s, year)
  if (f) f.result = result
}

type NoData = Record<string, never>
type Def<D extends Record<string, Json> = Record<string, Json>> = CrisisDef<AstroState, D>
type Out = Branch<AstroState>

// ---------------------------------------------------------------------------
// The seven defs
//
// Weights are relative (the kit picks among the eligible ones); each is the digest's condition, with the
// probabilities in the digest folded into the weight.

const rehabPrice = (g: GameState): number => localPrice(g, REHAB.usd)

/** Half a flight's pay, estimated from the salary and the tour at the middle of the pay swing (the record keeps no pay). */
function payEstimate(g: GameState, f: FlightRec | undefined): number {
  const job = astronautJob(g)
  if (!job || !f) return 0
  const salary = fin(job.salary)
  const bonus = (MISSIONS[f.type] ?? MISSIONS.orbit).bonus
  const mean = (FLIGHT_PAY.lo + FLIGHT_PAY.hi) / 2
  return Math.round(Math.min(FLIGHT_PAY.cap * salary, salary * bonus * mean + FLIGHT_PAY.perDay * salary * f.days) / 100) * 100
}

const scheduleSqueeze: Def<NoData> = {
  id: 'scheduleSqueeze',
  title: 'The Schedule',
  emoji: '\u{1F4C5}',
  cool: 3,
  weight: (g, s) => (s.safety < 50 && funding(g, s) < 45 ? 3 : 0),
  make: () => ({}),
  scene: () => 'Management wants the next launch moved up. Engineers say the margins are thin. What will you do?',
  options: {
    safe: {
      label: 'File a concern',
      emoji: '\u{1F4DD}',
      good: () => ({ text: () => 'You filed a written concern. Management frowned, and the safety office took note.', fx: { standing: -3 }, then: (s) => bumpSafety(s, 4) }),
    },
    bold: {
      label: 'Refuse the date',
      emoji: '\u{270B}',
      good: () => ({ text: () => 'You refused the new date. Management was angry, and the safety office backed you.', fx: { standing: -6 }, then: (s) => bumpSafety(s, 6) }),
    },
    cash: {
      label: 'Sign off',
      emoji: '\u{270D}\u{FE0F}',
      good: () => ({ text: () => 'You signed off on the date. Your next flight carries more risk.', fx: { standing: 3 }, then: (s) => void (s.mark.rush = true) }),
    },
  },
}

const appropriations: Def<NoData> = {
  id: 'appropriations',
  title: 'The Hearing',
  emoji: '\u{1F3DB}\u{FE0F}',
  cool: 2,
  weight: (g, s) => ((funding(g, s) < 50 || lineCut(s, g.year)) && levelOf(g) >= 2 ? 2 : 0),
  make: () => ({}),
  scene: () => 'A budget panel is weighing space funds. It wants to hear from astronauts. What will you do?',
  options: {
    safe: {
      label: 'Stay out of it',
      emoji: '\u{1F910}',
      good: () => ({ text: () => 'You stayed out of it. The panel met without you.', fx: {} }),
    },
    bold: {
      label: 'Testify',
      emoji: '\u{1F5E3}\u{FE0F}',
      good: (_g, s) => {
        const hostile = s.mood < 40
        return {
          text: () => (hostile ? 'You testified to a hostile room. Lawmakers heard you, and your standing took a hit.' : 'You testified. Lawmakers listened, and the funding case got stronger.'),
          fx: hostile ? { standing: -3 } : {},
          then: (t) => bumpLobby(t, t.mood < 40 ? 9 : 6),
        }
      },
    },
    cash: {
      label: 'Brief reporters',
      emoji: '\u{1F4F0}',
      good: () => ({ text: () => 'You briefed reporters. The story played well, and the public warmed to the corps.', fx: { fame: 1 }, then: (s) => bumpMood(s, 4) }),
    },
  },
}

type AnomalyData = { days: number; pay: number }

const anomaly: Def<AnomalyData> = {
  id: 'anomaly',
  title: 'Alarm in Orbit',
  emoji: '\u{1F6A8}',
  cool: 3,
  weight: (g, s) => (lastFlights(s, g.year).some((f) => f.result === 'clean' && f.days > 7) ? 3 * (1.3 - clamp(s.skills.team, 0, 100) / 100) : 0),
  make: (g, s) => {
    const f = lastFlights(s, g.year).find((x) => x.result === 'clean' && x.days > 7) ?? lastFlight(s, g.year)
    return { days: f?.days ?? 0, pay: payEstimate(g, f) }
  },
  scene: () => 'An alarm sounded late in your last tour. Ground control waited on your call. What will you do?',
  options: {
    safe: {
      label: 'Wait for ground',
      emoji: '\u{1F4E1}',
      good: () => ({
        text: () => 'You waited for ground to talk you through it. The delay added dose and strain.',
        fx: {},
        then: (s) => {
          s.dose = Math.min(100, round1(s.dose + 3 * DOSE_RATE))
          bumpStrain(s, (3 / 30) * STRAIN_RATE)
        },
      }),
    },
    bold: {
      label: 'Fix it outside',
      emoji: '\u{1F9D1}\u{200D}\u{1F680}',
      odds: (_g, s) => 0.55 + s.skills.eva / 200,
      good: () => ({
        text: () => 'You went outside and fixed it. The crew cheered you back in.',
        fx: { standing: 3 },
        then: (s) => void (s.tally.evas = Math.min(1e6, s.tally.evas + 1)),
      }),
      bad: (g) => ({
        text: () => 'The repair failed and the hull took damage. The crew cut the tour short.',
        fx: { standing: -3 },
        then: (s) => markLast(s, g.year, 'abort'),
      }),
    },
    cash: {
      label: 'Abort the tour',
      emoji: '\u{1F6D1}',
      good: (g, _s, d) => ({
        text: (r) => (r.paid > 0 ? `You called the abort. The agency docked ${money(r.paid)} of your flight pay.` : 'You called the abort. The tour ended early.'),
        fx: { money: -Math.round(fin(d.pay) / 2) },
        then: (s) => {
          bumpMood(s, -2)
          markLast(s, g.year, 'abort')
        },
      }),
    },
  },
}

const crewFriction: Def<NoData> = {
  id: 'crewFriction',
  title: 'Crew Friction',
  emoji: '\u{1F624}',
  cool: 4,
  weight: (g, s) => (lastFlights(s, g.year).some((f) => f.result !== 'anomaly' && f.days > 90) && s.skills.team < 55 ? 2 : 0),
  make: () => ({}),
  scene: () => 'A long tour wore on the crew. Tempers frayed over shifts and chores. What will you do?',
  options: {
    safe: {
      label: 'Split the shifts',
      emoji: '\u{1F552}',
      good: () => ({ text: () => 'You split the shifts. The tension eased, and research ran slower.', fx: {}, then: (s, g) => void (s.cool.split = clamp(g.year, 0, 9999)) }),
    },
    bold: {
      label: 'Mediate',
      emoji: '\u{1F91D}',
      odds: (_g, s) => 0.5 + s.skills.team / 200,
      good: () => ({ text: () => 'You sat the crew down and talked it out. They worked as a team again.', fx: {}, then: (s) => bumpTeam(s, 3) }),
      bad: () => ({ text: () => 'The talk went badly, and word got back to ground.', fx: { standing: -3 } }),
    },
    cash: {
      label: 'Say nothing',
      emoji: '\u{1F910}',
      good: () => ({ text: () => 'You said nothing. The tension stayed for the rest of the tour.', fx: {}, then: (s) => bumpTeam(s, -4) }),
    },
  },
}

const boneScan: Def<NoData> = {
  id: 'boneScan',
  title: 'Bone Scan',
  emoji: '\u{1F9B4}',
  cool: 2,
  weight: (g, s) => (lastFlights(s, g.year).length > 0 && s.bone < 75 ? 3 : 0),
  make: () => ({}),
  scene: () => 'Your post-flight scan shows thin bone. The doctors offer a full rehab program. What will you do?',
  options: {
    safe: {
      label: 'Do full rehab',
      emoji: '\u{1F3CB}\u{FE0F}',
      good: (g): Out => {
        const price = rehabPrice(g)
        if (g.character.money < price) return { text: () => "You couldn't cover the program, so you took standard care.", fx: {} }
        return {
          text: (r) => `You paid ${money(r.paid)} for full rehab. Bone and muscle came back faster.`,
          fx: { money: -price },
          then: (s) => {
            s.bone = Math.min(100, round1(s.bone + REHAB.bone))
            s.muscle = Math.min(100, round1(s.muscle + REHAB.muscle))
          },
        }
      },
    },
    bold: {
      label: 'Return early',
      emoji: '\u{23E9}',
      good: () => ({ text: () => 'You went back to work early. Standing rose, and a stress fracture is possible.', fx: { standing: 4 }, then: (s, g) => void (s.cool.early = clamp(g.year, 0, 9999)) }),
    },
    cash: {
      label: 'Take standard care',
      emoji: '\u{1FA7A}',
      good: () => ({ text: () => 'You followed the standard plan. Nothing extra was done.', fx: {} }),
    },
  },
}

const homeFront: Def<NoData> = {
  id: 'homeFront',
  title: 'Home Front',
  emoji: '\u{1F3E0}',
  cool: 3,
  weight: (g, s) => (s.family >= 70 && homeFolks(g) ? 3 : 0),
  make: () => ({}),
  scene: () => 'Your family is worn thin by the time away. The calls home have gotten short. What will you do?',
  options: {
    safe: {
      label: 'Take leave',
      emoji: '\u{1F6EC}',
      good: () => ({
        text: () => 'You took the year at home, and the strain eased.',
        fx: { happiness: 6 },
        then: (s, g) => {
          bumpStrain(s, -25)
          s.mark.groundedYear = clamp(g.year, 0, 9999)
        },
      }),
    },
    bold: {
      label: 'Send a video',
      emoji: '\u{1F4F9}',
      good: () => ({ text: () => 'You recorded a long video for home. It helped a little.', fx: {}, then: (s) => bumpStrain(s, -6) }),
    },
    cash: {
      label: 'Keep flying',
      emoji: '\u{1F680}',
      good: () => ({
        text: () => 'You kept flying. The people at home felt it.',
        fx: {},
        then: (s, g) => {
          const partner = partnerOf(g)
          if (partner) addRelationship(partner, -6 - (s.family >= 85 ? 10 : 0))
        },
      }),
    },
  },
}

type CrewData = { name: string; more: number }

/** The newest inquiry opened this year or last: the crew you lost, or a peer's. */
function recentLoss(s: AstroState, year: number): Inquiry | undefined {
  return [...s.inquiries].reverse().find((i) => i.year >= year - 1 && i.lost.length > 0)
}

const lostCrew: Def<CrewData> = {
  id: 'lostCrew',
  title: 'Lost Crew',
  emoji: '\u{1F54A}\u{FE0F}',
  cool: 3,
  weight: (g, s) => (recentLoss(s, g.year) ? 4 : 0),
  make: (g, s) => {
    const i = recentLoss(s, g.year)
    return { name: i?.lost[0] ?? '', more: Math.max(0, (i?.lost.length ?? 1) - 1) }
  },
  scene: (_g, _s, d) => {
    const more = Math.max(0, Math.round(fin(d.more)))
    return `The agency set a memorial for ${str(d.name, 40) || 'the crew'}${more > 0 ? ` and ${more} more` : ''}. The families asked you to come. What will you do?`
  },
  options: {
    safe: {
      label: 'Stay with the families',
      emoji: '\u{1F91D}',
      good: () => ({ text: () => 'You sat with the families through the week. It took something out of you.', fx: { standing: 2 }, then: (s) => bumpStrain(s, -4) }),
    },
    bold: {
      label: 'Speak at the memorial',
      emoji: '\u{1F3A4}',
      good: () => ({ text: () => 'You spoke at the memorial. The press carried your words.', fx: { fame: 1 }, then: (s) => bumpMood(s, 3) }),
    },
  },
}

/** Every def, in the order the plan lists them. Each is one script, `career.astronaut.<id>`. */
export const ASTRO_DEFS: readonly CrisisDef<AstroState, any>[] = [scheduleSqueeze, appropriations, anomaly, crewFriction, boneScan, homeFront, lostCrew]

export const astroCrises: CrisisSet<AstroState> = defineCrises({ career: 'astronaut', store: astronautStore, talent: 'Academics', defs: ASTRO_DEFS })

// ---------------------------------------------------------------------------
// Forced choices: the medical board, then inquiry testimony, then an administrator's budget

export const MEDICAL_SCRIPT = 'career.astronaut.medical'
export const INQUIRY_SCRIPT = 'career.astronaut.inquiry'
const BOARD_EMOJI = '\u{1FA7A}'
const INQUIRY_EMOJI = '\u{1F4CB}'

/** The board sits at dose 85 or thin bone, but not in the year after it last sat. */
const medicalDue = (s: AstroState, year: number): boolean => (s.dose >= 85 || s.bone < 55) && (s.cool.medical ?? -1) < year

/** The chance the board clears an appeal: .4 + health/200. One function for the roll and the hint. */
export function appealOdds(g: GameState): number {
  return clamp(0.4 + fin(g.character.stats.health) / 200, 0.05, 0.95)
}

/** The oldest inquiry still waiting on your testimony: open for a year, unanswered, and yours or a senior's to answer. */
function testimonyDue(s: AstroState, level: number): Inquiry | undefined {
  return s.inquiries.find((i) => i.status === 'open' && i.stance === '' && i.yearsOpen >= 1 && (i.involved || level >= 3))
}

const BLAME: Record<Inquiry['cause'], string> = { hardware: 'Blame the hardware', procedure: 'Blame the procedure', schedule: 'Blame the schedule', crew: 'Blame the crew' }

/** The two causes put to you: the true one and a decoy, in a seeded order (no g.rng). */
function theories(g: GameState, inq: Inquiry): Inquiry['cause'][] {
  const r = seeded(`${familySeed(g)}|astro|inquiry|${inq.id}|${g.year}${outcomeTag(g, g.year)}`)
  const decoy = r.pick(CAUSES.filter((x) => x !== inq.cause))
  return r.chance(0.5) ? [inq.cause, decoy] : [decoy, inq.cause]
}

function offerMedical(c: CareerCtx<AstroState>): boolean {
  const { g, s } = c
  const choices: ChoiceOption[] = [{ id: 'ground', label: 'Accept a ground job', emoji: '\u{1F6EC}' }]
  if (s.dose < 100) choices.push({ id: 'appeal', label: 'Appeal the finding', emoji: '\u{2696}\u{FE0F}', ...honest(g, 'Academics', `Clears the board ${oddsText(appealOdds(g))} of the time.`) })
  choices.push({ id: 'retire', label: 'Retire', emoji: '\u{1F3D6}\u{FE0F}' })
  return offerChoice(c, MEDICAL_SCRIPT, 'Medical Board', 'The flight surgeons reviewed your scans. Your dose or bone is past the line for flying. What will you do?', choices, {}, BOARD_EMOJI)
}

function offerTestimony(c: CareerCtx<AstroState>, inq: Inquiry): boolean {
  const { g } = c
  const choices: ChoiceOption[] = theories(g, inq).map((cause) => ({
    id: `blame.${cause}`,
    label: BLAME[cause],
    emoji: INQUIRY_EMOJI,
    ...(cause === inq.cause ? honest(g, 'Academics', 'The flight records point to this cause.') : {}),
  }))
  choices.push({ id: 'protect', label: 'Protect the agency', emoji: '\u{1F6E1}\u{FE0F}' }, { id: 'recuse', label: 'Recuse yourself', emoji: '\u{1F64B}' })
  return offerChoice(c, INQUIRY_SCRIPT, 'Inquiry', 'The board is hearing testimony on the lost crew. Your account is wanted. What will you do?', choices, { id: inq.id }, INQUIRY_EMOJI)
}

/**
 * The yearly forced choices, taking the year's one choice slot before any random crisis: the medical board at dose 85
 * or bone under 55 (not for an administrator), then the testimony an open inquiry waits on, then an administrator's
 * budget. A loser waits a year. True when one was queued.
 */
export function forcedChoice(c: CareerCtx<AstroState>): boolean {
  const { g, s, year } = c
  const job = astronautJob(g)
  if (!job) return false
  if (job.level < 6 && medicalDue(s, year) && offerMedical(c)) {
    s.cool.medical = clamp(year + 1, 0, 9999)
    return true
  }
  const inq = testimonyDue(s, job.level)
  if (inq && offerTestimony(c, inq)) return true
  return job.level >= 6 && offerAdmin(c)
}

defineScript(MEDICAL_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !astronautJob(g) || !astronautStore.has(g)) return
  if (choice !== 'ground' && choice !== 'appeal' && choice !== 'retire') return
  const s = astronautStore.mut(g)
  if (!claimChoice(g, s, data, `medical.${g.year}`)) return
  const c = careerCtx(g, 'astronaut', s)
  // A full dose has nothing to appeal: the answer is a ground job.
  const answer = choice === 'appeal' && s.dose >= 100 ? 'ground' : choice
  if (answer === 'ground') {
    s.mark.groundedYear = g.year
    s.cool.ground = clamp(g.year, 0, 9999)
    applyEffects(c, { standing: 2 }, 'Medical board')
    careerLog(c, 'I took a ground job on medical advice.')
    careerSay(c, 'Medical Board', 'You took a ground job. There are no flights this year, and management took note.', BOARD_EMOJI)
    return
  }
  if (answer === 'appeal') {
    if (chance(g, appealOdds(g))) {
      careerSay(c, 'Medical Board', "The board cleared you on appeal. You're fit for one more flight.", BOARD_EMOJI, 'good')
      return
    }
    s.mark.groundedYear = g.year
    careerLog(c, 'The medical board turned down my appeal.', 'bad')
    careerSay(c, 'Medical Board', "The board turned down the appeal. You're grounded this year.", BOARD_EMOJI, 'bad')
    return
  }
  leave(g, 'retired')
  careerLog(c, 'I retired from the corps on medical advice.')
  careerSay(c, 'Retired', "You retired on the surgeons' advice.", '\u{1F3D6}\u{FE0F}')
})

defineScript(INQUIRY_SCRIPT, (g, choice, data) => {
  if (!g.character.alive || !astronautJob(g) || !astronautStore.has(g)) return
  const named = choice.startsWith('blame.') ? choice.slice('blame.'.length) : ''
  const cause = CAUSES.find((x) => x === named)
  if (choice !== 'protect' && choice !== 'recuse' && !cause) return
  const s = astronautStore.mut(g)
  const id = str(rec(data).id, 24)
  const inq = s.inquiries.find((i) => i.id === id && i.status === 'open' && i.stance === '')
  if (!inq || !claimChoice(g, s, data, `inquiry.${id}.${g.year}`)) return
  const c = careerCtx(g, 'astronaut', s)
  inq.status = 'closed'
  if (cause) {
    inq.stance = 'cause'
    const truth = cause === inq.cause
    bumpSafety(s, truth ? 10 : 3)
    const costly = truth && inq.cause === 'schedule'
    if (costly) applyEffects(c, { standing: -4 }, 'Inquiry')
    careerLog(c, 'I gave my account to the inquiry board.')
    careerSay(c, 'Inquiry', truth ? (costly ? 'You named the schedule as the cause, and the board agreed. Management took it badly.' : 'You named the cause and the board agreed. The agency fixed it.') : 'The board found a different cause. Your testimony still moved the review.', INQUIRY_EMOJI, truth ? 'good' : 'neutral')
    return
  }
  if (choice === 'protect') {
    inq.stance = 'protect'
    inq.coverup = true
    bumpSafety(s, -6)
    applyEffects(c, { standing: 3 }, 'Inquiry')
    careerLog(c, 'I defended the agency at the inquiry.')
    careerSay(c, 'Inquiry', "You defended the agency. The report closed with the agency's account.", INQUIRY_EMOJI)
    return
  }
  inq.stance = 'recuse'
  if (inq.involved) s.tally.blame = Math.min(20, s.tally.blame + 1)
  careerLog(c, 'I stepped aside from the inquiry.')
  careerSay(c, 'Inquiry', inq.involved ? 'You stepped aside. The board noted it, and your name stays on the record.' : 'You stepped aside. The board went on without you.', INQUIRY_EMOJI)
})

// ---------------------------------------------------------------------------
// The report card

/**
 * One notice when something moved: a flight, a class, an inquiry opened or closed, or funding up or down 8 or more.
 * Reads the record the sim just closed and moves nothing.
 */
export function reportCard(c: CareerCtx<AstroState>): void {
  const { s, year } = c
  const now = s.fund.length > 0 ? s.fund[s.fund.length - 1] : fundingIndex(c.g, s, year)
  const prev = s.fund.length > 1 ? s.fund[s.fund.length - 2] : null
  const swing = prev === null ? 0 : now - prev
  const flew = s.flights.some((f) => f.year === year - 1)
  const classed = s.classes.some((k) => k.year === year)
  const inquiry = s.inquiries.some((i) => i.year === year || (i.status === 'closed' && i.year + i.yearsOpen === year))
  if (!flew && !classed && !inquiry && Math.abs(swing) < 8) return
  const head = swing === 0 ? `Funding ${now}.` : `Funding ${now}, ${swing > 0 ? 'up' : 'down'} ${Math.abs(swing)}.`
  careerSay(c, 'Corps Report', `${head} Mood ${s.mood}. Safety ${s.safety}. Bone ${Math.round(s.bone)}, strain ${Math.round(s.family)}.`, ROCKET)
}

// ---------------------------------------------------------------------------
// Rows: lobby, concern and research

type Spec = Omit<Parameters<typeof gatedAction<AstroState>>[0], 'career' | 'store'>
/** A gated action on the corps record. */
const row = (spec: Spec): MenuAction => gatedAction<AstroState>({ career: 'astronaut', store: astronautStore, ...spec })

const LOBBY_KEY = 'astro.lobby'
const CONCERN_KEY = 'astro.concern'
const RESEARCH_KEY = 'astro.research'
export const RESEARCH_SCRIPT = 'career.astronaut.research'
/** Lifetime research points the lab will credit. */
const RESEARCH_CAP = 200

export const RESEARCH_LINES = [
  { id: 'bone', label: 'Study bone loss', emoji: '\u{1F9B4}' },
  { id: 'solar', label: 'Track solar storms', emoji: '\u{2600}\u{FE0F}' },
  { id: 'materials', label: 'Test new materials', emoji: '\u{1F9EA}' },
] as const

/** The year's hot line of research: the same pick for the hint and the payout (stable for the life and the year, no g.rng). */
export function hotLine(g: GameState): string {
  return hot(g, 'astronaut', RESEARCH_LINES.map((l) => l.id))
}

const lobbyGain = (s: AstroState): number => (s.mood < 40 ? 9 : 6)

let rows: MenuNode[] | null = null

/** astro.lobby, astro.concern and astro.research. */
export function astroLobbyRows(_g: GameState): MenuNode[] {
  return (rows ??= [
    row({
      id: LOBBY_KEY,
      label: 'Lobby for Funding',
      emoji: '\u{1F3DB}\u{FE0F}',
      subtitle: (g) => {
        const s = astronautStore.view(g)
        return `Lobby ${s.lobby} of 20, +${lobbyGain(s)} now. It halves each year, and you can lobby once a year.`
      },
      gate: (g) => {
        if (!astronautJob(g)) return NO_JOB
        if (levelOf(g) < 3 && fameOf(g) < 20) return 'Lobbying takes the rank of Flight Engineer or a name the public knows.'
        return yearActionsUsed(g, LOBBY_KEY) >= 1 ? "You've already lobbied this year." : null
      },
      run: (c) => {
        const { g, s } = c
        if (!useYearAction(g, LOBBY_KEY, 1)) {
          careerSay(c, 'Lobbying', "You've already lobbied this year.", '\u{1F3DB}\u{FE0F}')
          return
        }
        const hostile = s.mood < 40
        bumpLobby(s, lobbyGain(s))
        if (hostile) applyEffects(c, { standing: -3 }, 'Lobbying')
        careerLog(c, 'I lobbied lawmakers for space funding.')
        careerSay(c, 'Lobbying', hostile ? 'You made your case to a hostile room. Some votes moved, and your standing took a hit.' : 'You made your case to lawmakers. The funding outlook improved.', '\u{1F3DB}\u{FE0F}', 'good')
      },
    }),
    row({
      id: CONCERN_KEY,
      label: 'File a Safety Concern',
      emoji: '\u{1F4DD}',
      subtitle: 'Costs 3 standing, adds 3 safety and cuts a point of blame, once a year.',
      gate: (g) => {
        if (!astronautJob(g)) return NO_JOB
        return yearActionsUsed(g, CONCERN_KEY) >= 1 ? "You've already filed a concern this year." : null
      },
      run: (c) => {
        const { g, s } = c
        if (!useYearAction(g, CONCERN_KEY, 1)) {
          careerSay(c, 'Safety Concern', "You've already filed a concern this year.", '\u{1F4DD}')
          return
        }
        applyEffects(c, { standing: -3 }, 'Safety concern')
        if (s.safety < 70) bumpSafety(s, 3)
        s.tally.concerns = Math.min(1e6, s.tally.concerns + 1)
        s.tally.blame = Math.max(0, s.tally.blame - 1)
        careerLog(c, 'I filed a safety concern.')
        careerSay(c, 'Safety Concern', 'You filed a written safety concern. It cost you standing and went on the record.', '\u{1F4DD}')
      },
    }),
    researchRow(),
  ])
}

function researchRow(): MenuAction {
  return row({
    id: RESEARCH_KEY,
    label: 'Conduct Research',
    emoji: '\u{1F52C}',
    subtitle: (g) => `Research points: ${researchPoints(g)} of ${RESEARCH_CAP}`,
    gate: (g) => {
      if (!astronautJob(g)) return NO_JOB
      if (researchPoints(g) >= RESEARCH_CAP) return 'The lab has nothing more to credit you.'
      return yearActionsUsed(g, RESEARCH_KEY) >= 1 ? "You've already run your experiments this year." : null
    },
    run: (c) => {
      const { g } = c
      const hotId = hotLine(g)
      const choices: ChoiceOption[] = RESEARCH_LINES.map((l) => ({ id: l.id, label: l.label, emoji: l.emoji, ...(l.id === hotId ? honest(g, 'Academics', 'This line is hot this year. It pays half again as much.') : {}) }))
      if (!offerChoice(c, RESEARCH_SCRIPT, 'Research', 'Three lines of research are open this year. Pick one. What will you do?', choices, {}, '\u{1F52C}')) {
        careerSay(c, 'Research', 'Settle the decisions waiting on you first.', '\u{1F52C}')
      }
    },
  })
}

defineScript(RESEARCH_SCRIPT, (g, choice, data) => {
  const job = astronautJob(g)
  if (!g.character.alive || !job || !astronautStore.has(g)) return
  const line = RESEARCH_LINES.find((l) => l.id === choice)
  if (!line) return
  const s = astronautStore.mut(g)
  if (!claimChoice(g, s, data, `research.${g.year}`)) return
  const c = careerCtx(g, 'astronaut', s)
  if (researchPoints(g) >= RESEARCH_CAP) {
    careerSay(c, 'Research', 'The lab has nothing more to credit you.', '\u{1F52C}')
    return
  }
  if (!useYearAction(g, RESEARCH_KEY, 1)) {
    careerSay(c, 'Research', "You've already run your experiments this year.", '\u{1F52C}')
    return
  }
  const last = s.flights[s.flights.length - 1]
  const role = last?.role === 'specialist' ? 1.25 : 1
  const trimmed = ((s.cool.intense ?? -1) >= g.year ? 0.7 : 1) * ((s.cool.split ?? -1) >= g.year ? 0.8 : 1)
  const raw = 2 + (g.character.stats.smarts - 40) / 10 + randInt(g, 0, 4)
  const points = Math.max(1, Math.round(raw * role * (line.id === hotLine(g) ? 1.5 : 1) * trimmed))
  const credited = addResearchPoints(g, points)
  bump(job, randInt(g, 2, 5))
  addStat(g, 'smarts', randInt(g, 0, 2))
  careerLog(c, 'I ran research for the agency.')
  careerSay(c, 'Research', `You worked on ${line.label.toLowerCase().replace(/^\w+ /, '')}. Research +${credited}.`, '\u{1F52C}', 'good')
})
