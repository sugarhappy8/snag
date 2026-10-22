// Model 2.0 exits and legacy: the three ways out of modeling (photographer, fashion label, agent desk), the
// proteges a desk signs, the unlocks that announce each path once, and Retire with its career summary. Every cash
// move goes through c.earn and c.pay; nothing here becomes an Asset. The label path calls the existing founding flow
// (business/founding.ts is read, never edited), and the photographer path hires through careers.ts. Imports from
// model.ts and business/ are used inside function bodies only: model.ts imports this file. The ordinary job market (the photographer's
// company, pay shape, entry rules and hiring) comes through the workplace.ordinaryJobs port, bound by careers.ts, because careers.ts
// imports special.ts, which imports the model sim.
import { seeded } from '../assets'
import { priceLevel } from '../activities/common'
import { foundingProblem, startFounding } from '../business/founding'
import { remember, useYearAction, yearActionsUsed } from '../core'
import { getJobDef, type Industry } from '../data/jobs'
import { economyOf } from '../economy/model'
import { nameFitsYear } from '../history/events-people'
import { chance } from '../rng'
import type { GameState, MenuAction, MenuInfo, MenuNode } from '../types'
import { ordinaryJobs, type OrdinaryJobs } from '../workplace/contract'
import { getCountry, namePoolOf } from '../world'
import { blocked, fameOf, leave, money, short } from './common'
import { honest } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { cap } from './kit/state'
import { careerCtx, careerLog, careerSay, fit, type CareerCtx } from './kit/year'
import { RANK_MULT, modelJob } from './model'
import { labelHeadStart } from './model-core'
import { modelStore, type MdProtege, type ModelState } from './model-state'

export type Exit = 'photographer' | 'label' | 'agent'
const EXITS: readonly Exit[] = ['photographer', 'label', 'agent']

/** What an agent desk costs to open before the price level, and what a scouting trip costs. */
export const DESK_COST = 6_000
export const SCOUT_COST = 1_200
/** Proteges on a desk at once, the years each stays, and the most one override can pay a year. */
export const PROTEGE_MAX = 2
export const PROTEGE_YEARS = 8
export const PROTEGE_PAY_MAX = 25_000
/** A protege who outgrows the desk pays this many years of their override as one finder's fee. */
export const PROTEGE_FEE = 1
/** The chance a protege past book 60 leaves each year from the third on. */
const LEAVE_ODDS = 0.25
const SCOUT_ONCE = 'model.scout'
const LINE = 90

/** Names kept in `announced`: an unlock the player has been told about, the desk once opened, and a retirement. */
const MARK: Record<Exit, string> = { photographer: 'photo', label: 'label', agent: 'agent' }
const DESK = 'desk'
const RETIRED = 'retired'
const EXIT_MARKS: readonly string[] = [...Object.values(MARK), DESK, RETIRED]

const EXIT_EMOJI: Record<Exit, string> = { photographer: '\u{1F4F8}', label: '\u{1F457}', agent: '\u{1F4BC}' }
const BEYOND = '\u{1F6AA}'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const info = (id: string, text: string): MenuInfo => ({ type: 'info', id, text: fit(text, LINE) })
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const view = (g: GameState): ModelState => modelStore.view(g)

/** What an agent desk costs here. */
export const deskPrice = (g: GameState): number => Math.round(DESK_COST * priceLevel(g))

// ---------------------------------------------------------------------------
// Where you stand

/** True when you retired from modeling and have not signed with an agency since. Pure. */
export function isRetired(g: GameState, s: ModelState): boolean {
  return !modelJob(g) && s.announced.includes(RETIRED)
}

/** True when the agent desk is open. Pure. */
export const deskOpen = (s: ModelState): boolean => s.announced.includes(DESK)

const mark = (s: ModelState, name: string): void => {
  s.announced = cap([...s.announced.filter((x) => x !== name), name], 8)
}

/**
 * The threshold part of each exit, apart from cash, jobs and the real hiring and founding rules: a photographer
 * knows three photographers, has a book of 50 and is 22; a label wants fame 30, a book of 50 and 10 bookings; an agent
 * wants reputation 55, 28 years or a retirement behind them, and 10 bookings. Pure.
 */
export function exitReady(g: GameState, s: ModelState, exit: Exit): boolean {
  const age = fin(g.character.age)
  switch (exit) {
    case 'photographer':
      return s.photographers.length >= 3 && s.book >= 50 && age >= 22
    case 'label':
      return fameOf(g) >= 30 && s.book >= 50 && s.life.booked >= 10
    case 'agent':
      return s.rep >= 55 && (age >= 28 || isRetired(g, s)) && s.life.booked >= 10
  }
}

/** Why this exit is closed right now, or null. The row and the action share it, so a row mirrors the real gate. Pure. */
export function exitBlock(g: GameState, s: ModelState, exit: Exit): string | null {
  const why = blocked(g)
  if (why) return why
  const age = fin(g.character.age)
  switch (exit) {
    case 'photographer': {
      const job = g.character.job
      if (job?.defId === 'photographer') return 'You already shoot for a living.'
      if (job && job.defId !== 'model') return 'Leave your current job before you change careers.'
      if (s.photographers.length < 3) return `Three photographers must know your work. You know ${s.photographers.length}.`
      if (s.book < 50) return 'Photography studios want a book of 50 or more.'
      if (age < 22) return 'Studios hire photographers at 22 and over.'
      const def = getJobDef('photographer')
      const jobs = ordinaryJobs()
      return def && jobs ? jobs.jobRequirementProblem(g, def) : "Nobody is hiring photographers right now."
    }
    case 'label': {
      if (fameOf(g) < 30) return 'A label needs fame of 30 or more.'
      if (s.book < 50) return 'A label needs a book of 50 or more.'
      if (s.life.booked < 10) return 'A label needs 10 bookings behind you.'
      return foundingProblem(g, 'fashion')
    }
    case 'agent': {
      if (deskOpen(s)) return 'Your agent desk is already open.'
      if (s.rep < 55) return 'An agent desk needs a reputation of 55 or more.'
      if (age < 28 && !isRetired(g, s)) return 'Agents open desks at 28 and over, or after retiring.'
      if (s.life.booked < 10) return 'An agent desk needs 10 bookings behind you.'
      const price = deskPrice(g)
      return g.character.money < price ? `You can't cover the ${money(price)} desk.` : null
    }
  }
}

/** True when the exits menu has something to show: a path is ready, was announced, was taken, or you retired. Pure. */
export function exitsVisible(g: GameState, s: ModelState): boolean {
  return s.exit !== '' || isRetired(g, s) || s.announced.some((x) => EXIT_MARKS.includes(x)) || EXITS.some((e) => exitReady(g, s, e))
}

// ---------------------------------------------------------------------------
// Unlocks

const UNLOCK: Record<Exit, { log: string; text: string }> = {
  photographer: { log: 'Photographers started asking me to work behind the camera.', text: 'Photographers know your name. You could trade the runway for a camera.' },
  label: { log: 'Buyers started asking about a label with my name on it.', text: 'Your name sells. You could start a fashion label of your own.' },
  agent: { log: 'Younger models started asking me for advice.', text: 'You know the business well. You could open an agent desk and find new faces.' },
}

/**
 * Tells you once about each exit whose thresholds you now pass, and records it in `announced`: a log line and a notice
 * each (a notice within the budget, else a log line). Settle bodies and actions only; a second call changes nothing.
 */
export function unlockExits(c: CareerCtx<ModelState>): void {
  const { g, s } = c
  for (const exit of EXITS) {
    if (s.announced.includes(MARK[exit]) || !exitReady(g, s, exit)) continue
    mark(s, MARK[exit])
    careerLog(c, UNLOCK[exit].log)
    careerSay(c, 'A Way Out', UNLOCK[exit].text, EXIT_EMOJI[exit])
  }
}

// ---------------------------------------------------------------------------
// Taking an exit

/** The pay of a photographer's first rung where you live: the rung's pay scaled the way a listing scales it. */
function photographerPay(g: GameState, year: number, ladderPay: number, industry: Industry, eraPayShape: OrdinaryJobs['eraPayShape']): number {
  const wealth = Math.max(0.25, fin(getCountry(g.character.countryId).wealth, 1))
  return Math.max(100, Math.round((ladderPay * wealth * eraPayShape(year, industry) * fin(economyOf(g).wages, 1)) / 100) * 100)
}

/**
 * Takes an exit. Photographer: hires you at the Photographer rung through careers.ts. Label: opens the existing
 * founding flow for a fashion brand. Agent: pays for the desk once. Each re-checks its own gate here, whatever the
 * menu showed, and a refusal says why and changes nothing. Actions only.
 */
export function takeExit(c: CareerCtx<ModelState>, exit: Exit): void {
  const { g, s, year } = c
  const why = exitBlock(g, s, exit)
  if (why) {
    careerSay(c, 'Beyond the Runway', why, BEYOND)
    return
  }
  if (exit === 'photographer') {
    const def = getJobDef('photographer')
    const jobs = ordinaryJobs()
    const rung = def?.ladder.find((r) => r.title === 'Photographer') ?? def?.ladder[def.ladder.length - 1]
    if (!def || !rung || !jobs) return
    const r = seeded(`${g.lifeId}|exit|photographer|${year}`)
    const company = jobs.companyName(g, def.industry, () => r.next())
    for (const a of s.agencies) if (a.to === 0) a.to = year
    jobs.hireForJob(g, { defId: def.id, title: rung.title, company, salary: photographerPay(g, year, rung.salary, def.industry, jobs.eraPayShape), category: def.category })
    s.exit = 'photographer'
    careerLog(c, `I left modeling to shoot for ${company}.`, 'good')
    careerSay(c, 'Behind the Camera', `You left the runway and took a job as a photographer at ${company}.`, EXIT_EMOJI.photographer, 'good')
    return
  }
  if (exit === 'label') {
    startFounding(g, 'fashion')
    s.exit = 'label'
    careerLog(c, 'I began setting up a fashion label.')
    return
  }
  const price = deskPrice(g)
  if (!c.pay('Agent desk', price)) {
    careerSay(c, 'Agent Desk', `You can't cover the ${money(price)} desk.`, EXIT_EMOJI.agent)
    return
  }
  mark(s, DESK)
  s.exit = 'agent'
  careerLog(c, 'I opened an agent desk.', 'good')
  careerSay(c, 'Agent Desk', `You opened an agent desk for ${money(price)}. A scouting trip each year can find a new face.`, EXIT_EMOJI.agent, 'good')
}

// ---------------------------------------------------------------------------
// Proteges

/** The pay a protege brings a year: 10% of 40,000 x RANK_MULT[tier + 1] x (0.5 + standing / 100), at most 25,000. Pure. */
export function protegePay(p: MdProtege): number {
  const book = clamp(fin(p.book), 0, 100)
  const tier = clamp(Math.floor(book / 25), 0, 3)
  const standing = Math.round(0.5 * clamp(fin(p.look), 0, 100) + 0.5 * book)
  return clamp(Math.round(0.1 * 40_000 * (RANK_MULT[tier + 1] ?? 1.5) * (0.5 + standing / 100)), 0, PROTEGE_PAY_MAX)
}

/** Why you can't scout a face now, or null: the desk, room for two, once a year, the trip. Pure. */
export function scoutBlock(g: GameState, s: ModelState): string | null {
  const why = blocked(g, 16)
  if (why) return why
  if (!deskOpen(s)) return "You don't have an agent desk yet."
  if (s.proteges.length >= PROTEGE_MAX) return 'Your desk is full. Two faces are enough.'
  if (yearActionsUsed(g, SCOUT_ONCE) >= 1) return "You've already scouted this year."
  return g.character.money < SCOUT_COST ? `You can't cover the ${money(SCOUT_COST)} trip.` : null
}

/** A seeded newcomer of 16 to 19 with a fictional local name, the same for the same life, year and desk. */
function newcomer(g: GameState, s: ModelState, year: number): MdProtege {
  const r = seeded(`${g.lifeId}|protege|${year}|${s.proteges.length}`)
  const age = r.int(16, 19)
  const born = year - age
  const pool = namePoolOf(g.character.countryId)
  const firsts = (r.chance(0.5) ? pool.male : pool.female).filter((f) => nameFitsYear(f, born))
  const name = `${r.pick(firsts.length > 0 ? firsts : pool.male)} ${r.pick(pool.last)}`
  return { id: `p${year}`, name, born, look: r.int(45, 80), book: r.int(0, 20), signed: year }
}

/** A scouting trip: c.pay of 1,200, a seeded newcomer on the desk (two at most, eight years each). Once a year. Actions only. */
export function scoutProtege(c: CareerCtx<ModelState>): void {
  const { g, s, year } = c
  const why = scoutBlock(g, s)
  if (why) {
    careerSay(c, 'Scouting', why, EXIT_EMOJI.agent)
    return
  }
  if (!useYearAction(g, SCOUT_ONCE, 1)) return
  if (!c.pay('Scouting trip', SCOUT_COST)) {
    g.yearActions[SCOUT_ONCE] = 0
    return
  }
  const p = newcomer(g, s, year)
  s.proteges = cap([...s.proteges.filter((x) => x.id !== p.id), p], PROTEGE_MAX)
  careerLog(c, `I signed ${p.name} to my desk.`, 'good')
  careerSay(c, 'Scouting', `You scouted ${p.name} on a ${money(SCOUT_COST)} trip. ${p.name} signed with your desk.`, EXIT_EMOJI.agent, 'good')
}

/**
 * The desk's yearly money: each protege signed in an earlier year pays their override through c.earn with the name
 * as the source, then grows (a seeded book gain, never g.rng). From the third year a protege past book 60 leaves at
 * 25% and pays one finder's fee; after eight years each leaves. Settle bodies only: it runs once a (year, age).
 */
export function protegeIncome(c: CareerCtx<ModelState>): void {
  const { g, s, year } = c
  const kept: MdProtege[] = []
  for (const p of s.proteges) {
    const years = year - p.signed
    if (years < 1) {
      kept.push(p)
      continue
    }
    const pay = protegePay(p)
    c.earn(`${p.name} override`, pay)
    const book = clamp(p.book + seeded(`${g.lifeId}|protege|${p.id}|${year}`).int(8, 20), 0, 100)
    if (years >= 2 && book > 60 && chance(g, LEAVE_ODDS)) {
      c.earn(`${p.name} finder's fee`, pay * PROTEGE_FEE)
      careerLog(c, `${p.name} outgrew my desk and left. I got a finder's fee.`, 'good')
      careerSay(c, "Finder's Fee", `${p.name} left for a bigger agency and paid you a finder's fee.`, EXIT_EMOJI.agent, 'good')
      continue
    }
    if (years >= PROTEGE_YEARS) {
      careerLog(c, `${p.name} finished eight years with my desk.`)
      continue
    }
    kept.push({ ...p, book })
  }
  s.proteges = kept
}

// ---------------------------------------------------------------------------
// Retire

/**
 * Retires: leave 'retired', one notice with the career in numbers (bookings, face deals, shows, the best ranking
 * and its year, gross and kept), a log line and one memory. Nothing is left as an Asset and nothing passes to an
 * heir: the record is owner-stamped. Does nothing without a model job. Actions only.
 */
export function retireSummary(c: CareerCtx<ModelState>): void {
  const { g, s, year } = c
  if (!modelJob(g)) return
  const l = s.life
  for (const a of s.agencies) if (a.to === 0) a.to = year
  leave(g, 'retired')
  mark(s, RETIRED)
  const parts = [l.booked > 0 ? `You retired after ${plural(l.booked, 'booking')}. ${plural(l.faces, 'face deal')}, ${plural(l.shows, 'show')}.` : 'You retired from modeling.']
  if (l.peak > 0) parts.push(`Best rank ${l.peak}${l.peakYear > 0 ? ` in ${l.peakYear}` : ''}.`)
  if (l.gross > 0) parts.push(`Kept ${short(l.net)} of ${short(l.gross)}.`)
  careerLog(c, l.booked > 0 ? `I retired from modeling after ${plural(l.booked, 'booking')}.` : 'I retired from modeling.')
  remember(g, l.booked > 0 ? `Retired from modeling after ${plural(l.booked, 'booking')}.` : 'Retired from modeling.')
  careerSay(c, 'Retired', parts.join(' '), BEYOND)
}

/** The Retire row's body: retires the current model with the summary, creating the record when a legacy life has none. */
export function retireModel(g: GameState): void {
  if (!modelJob(g)) return
  retireSummary(careerCtx(g, 'model', modelStore.mut(g)))
}

// ---------------------------------------------------------------------------
// Rows

type Spec = Omit<Parameters<typeof gatedAction<ModelState>>[0], 'career' | 'store'>

function row(spec: Spec, visible?: (g: GameState) => boolean): MenuAction {
  return { ...gatedAction<ModelState>({ career: 'model', store: modelStore, ...spec }), ...(visible ? { visible } : {}) }
}

/** The exit rows, built on first use (the menu text reads money, never at module load). */
let exits: MenuNode | null = null

function buildExits(): MenuNode {
  const photo = row({
    id: 'model.exit.photo',
    label: 'Become a Photographer',
    emoji: EXIT_EMOJI.photographer,
    subtitle: 'Needs a book of 50 and three photographers on your side.',
    gate: (g, s) => exitBlock(g, s, 'photographer'),
    confirm: () => 'Leave modeling to shoot for a living?',
    run: (c) => takeExit(c, 'photographer'),
  })
  const label = row({
    id: 'model.exit.label',
    label: 'Launch a Fashion Label',
    emoji: EXIT_EMOJI.label,
    subtitle: 'Needs fame 30 and a book of 50. You keep modeling.',
    gate: (g, s) => exitBlock(g, s, 'label'),
    hint: (g) => honest(g, 'Modeling', `A label starts at brand ${labelHeadStart(g)} of 60.`).hint ?? null,
    run: (c) => takeExit(c, 'label'),
  })
  const agent = row({
    id: 'model.exit.agent',
    label: 'Open an Agent Desk',
    emoji: EXIT_EMOJI.agent,
    subtitle: (g) => `Costs ${money(deskPrice(g))}. Needs reputation 55 and 10 bookings.`,
    gate: (g, s) => exitBlock(g, s, 'agent'),
    confirm: (g) => `Open an agent desk for ${money(deskPrice(g))}?`,
    run: (c) => takeExit(c, 'agent'),
  })
  const scout = row(
    {
      id: 'model.exit.scout',
      label: 'Scout a New Face',
      emoji: EXIT_EMOJI.agent,
      subtitle: () => `A trip costs ${money(SCOUT_COST)}. Two faces at most, eight years each.`,
      gate: (g, s) => scoutBlock(g, s),
      run: (c) => scoutProtege(c),
    },
    (g) => deskOpen(view(g)),
  )
  return {
    type: 'menu',
    id: 'model.exits',
    label: 'Beyond the Runway',
    emoji: BEYOND,
    visible: (g) => exitsVisible(g, view(g)),
    subtitle: (g) => {
      const s = view(g)
      if (isRetired(g, s)) return 'You retired'
      const ready = EXITS.filter((e) => exitReady(g, s, e)).length
      return ready > 0 ? `${plural(ready, 'path')} open` : 'Not yet'
    },
    header: () => 'Every path out of modeling wants a name, a book and some bookings behind it.',
    children: (g) => {
      const s = view(g)
      const out: MenuNode[] = [info('model.exits.now', `Book ${Math.round(s.book)}, reputation ${Math.round(s.rep)}. ${plural(s.life.booked, 'booking')}, ${plural(s.photographers.length, 'photographer')} known.`), photo, label, agent, scout]
      s.proteges.forEach((p, i) => out.push(info(`model.exits.protege.${i}`, `${p.name} pays about ${money(protegePay(p))} a year, ${plural(Math.max(0, PROTEGE_YEARS - (g.year - p.signed)), 'year')} left.`)))
      return out
    },
  }
}

/** model.exits and its rows: the photographer, label, agent and scouting rows. Hidden until a path is ready or you retire. */
export function modelExitRows(_g: GameState): MenuNode[] {
  return [(exits ??= buildExits())]
}
