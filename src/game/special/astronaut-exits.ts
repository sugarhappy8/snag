// Astronaut 2.0 exits and legacy: the five ways a career ends or goes on (administrator, politician, commercial
// flyer, speaker, author), the legacy score, the Hall of Fame and the Corps page. Money comes in only through
// `c.earn`; the commercial exit reads the player's own space company raw and guarded and writes nothing to it, and
// imports nothing from business/. This file imports the legacy astronaut.ts inside function bodies only.
import { addStat, remember, useYearAction, yearActionsUsed } from '../core'
import { killCharacter } from '../death'
import { hasTech } from '../history/timeline'
import { chance, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, Job, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { astronautJob } from './astronaut'
import { CREWS_FROM } from './astronaut-data'
import { astronautStore, type AstroState } from './astronaut-state'
import { ASTRO_SPEC, FATAL_SHARE, fundingIndex, projectBody } from './astronaut-world'
import { addFame, fameOf, leave, money, promote } from './common'
import { gatedAction } from './kit/menu'
import { standingOf } from './kit/rivals'
import { cap, int, rec } from './kit/state'
import { budgetLevel, careerCtx, careerLog, careerSay, claimChoice, fit, offerChoice, type CareerCtx } from './kit/year'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const round1 = (n: number): number => Math.round(n * 10) / 10

const NO_JOB = "You aren't in the astronaut corps."
const HALL = '\u{1F3C5}'
const BUILDING = '\u{1F3DB}\u{FE0F}'

type Spec = Omit<Parameters<typeof gatedAction<AstroState>>[0], 'career' | 'store'>
/** A gated action on the corps record. */
const row = (spec: Spec): MenuAction => gatedAction<AstroState>({ career: 'astronaut', store: astronautStore, ...spec })
/** The same row, shown only while `show` holds (gatedAction itself has no `visible`). */
const shownWhen = (a: MenuAction, show: (g: GameState) => boolean): MenuAction => ({ ...a, visible: show })

// ---------------------------------------------------------------------------
// Legacy points

/** 4 per flight, 1 per 30 days flown, 15 per lunar landing, 25 per Mars landing, 3 per command, 2 per spacewalk, 6 per first, minus 10 per blame. */
export function legacyPoints(s: AstroState): number {
  const t = s.tally
  return 4 * t.flights + Math.floor(t.days / 30) + 15 * t.lunar + 25 * t.mars + 3 * t.commands + 2 * t.evas + 6 * t.firsts.length - 10 * t.blame
}

/** The firsts a record has earned, each noted once (at most 8), from its tally and flights. */
export function noteFirsts(s: AstroState, _year: number): void {
  const t = s.tally
  const earned: [boolean, string][] = [
    [t.flights >= 1, 'First flight'],
    [t.commands >= 1, 'First command'],
    [t.evas >= 1, 'First spacewalk'],
    [t.lunar >= 1, 'First lunar landing'],
    [t.mars >= 1, 'First Mars landing'],
    [s.flights.some((f) => f.days >= 365), 'A year in orbit'],
  ]
  const have = new Set(t.firsts)
  const next = [...t.firsts]
  for (const [ok, name] of earned) if (ok && !have.has(name)) next.push(name)
  t.firsts = cap(next, 8)
}

// ---------------------------------------------------------------------------
// Administrator

export const ADMIN_SCRIPT = 'career.astronaut.admin'

/** Levels 6 and 7 of the same job sit beyond the legacy six rungs, so title and pay are set directly. */
const ADMIN_POSTS = [
  { level: 6, title: 'Deputy Administrator', salary: 150_000 },
  { level: 7, title: 'Administrator', salary: 210_000 },
] as const
/** Years as Deputy before the top post opens. */
const TOP_AFTER = 3
/** A schedule loss after a push year costs the administrator the post this often. */
const DISMISS = 0.55

const STANCES = ['push', 'safety', 'hold'] as const
type AdminStance = (typeof STANCES)[number] | ''

function adminOf(job: Job): { years: number; stance: AdminStance } {
  const a = rec(job.data.admin)
  const stance = (STANCES as readonly unknown[]).includes(a.stance) ? (a.stance as AdminStance) : ''
  return { years: int(a.years, 0, 0, 99), stance }
}

/** Why administration is closed to you, or null: rank 3, age 42, two flights, standing 65 (or a medical ground), and for the top post three years as Deputy. */
export function adminBlock(g: GameState, s: AstroState): string | null {
  const job = astronautJob(g)
  if (!job) return NO_JOB
  if (job.level >= 7) return 'You already lead the agency.'
  if (job.level === 6) return adminOf(job).years >= TOP_AFTER ? null : 'The top post opens after three years as Deputy.'
  if (job.level < 3) return 'Administration takes the rank of Flight Engineer or above.'
  if (g.character.age < 42) return 'Administration posts go to astronauts of 42 and over.'
  if (s.tally.flights < 2) return 'Administration wants two flights on your record.'
  if (s.standing < 65 && !(s.cool.ground > 0)) return 'Administration wants a standing of 65, or a medical ground.'
  return null
}

/** Moves to Deputy (150,000), or after three years as Deputy to Administrator (210,000). Refuses by itself, whatever the menu showed. */
export function takeAdmin(c: CareerCtx<AstroState>): void {
  const { g, s } = c
  const why = adminBlock(g, s)
  const job = astronautJob(g)
  if (why || !job) {
    careerSay(c, 'Administration', why ?? NO_JOB, BUILDING)
    return
  }
  const post = job.level >= 6 ? ADMIN_POSTS[1] : ADMIN_POSTS[0]
  const was = adminOf(job)
  promote(g, job, post.title, post.salary, post.level)
  job.data.admin = { years: post.level === 7 ? was.years : 0, stance: post.level === 7 ? was.stance : '' }
  s.mark.groundedYear = c.year // administrators fly nothing
  careerLog(c, `I became ${post.title === 'Administrator' ? 'the Administrator' : 'Deputy Administrator'}.`, 'good')
  careerSay(c, post.title, `You left flight status to become ${post.title === 'Administrator' ? 'the Administrator' : 'Deputy Administrator'} at ${money(post.salary)} a year. You fly no more.`, BUILDING, 'good')
}

/** An administrator year: counted, and no flights in it. Called from the yearly sim. */
export function adminYear(c: CareerCtx<AstroState>): void {
  const job = astronautJob(c.g)
  if (!job || job.level < 6) return
  const a = adminOf(job)
  job.data.admin = { years: Math.min(99, a.years + 1), stance: a.stance }
  c.s.mark.groundedYear = c.year
}

/** The year's one budget choice for an administrator (the sim offers it after the other forced choices). */
export function offerAdmin(c: CareerCtx<AstroState>): boolean {
  const job = astronautJob(c.g)
  if (!job || job.level < 6) return false
  const choices: ChoiceOption[] = [
    { id: 'push', label: 'Push for funding', emoji: '\u{1F4B0}' },
    { id: 'safety', label: 'Fund a safety review', emoji: '\u{1F6E1}\u{FE0F}' },
    { id: 'hold', label: 'Hold the line', emoji: '\u{270B}' },
  ]
  return offerChoice(c, ADMIN_SCRIPT, 'The Budget', 'Another budget year. You can push lawmakers for money or fund a safety review. What will you do?', choices, {}, BUILDING)
}

defineScript(ADMIN_SCRIPT, (g, choice, data) => {
  const job = astronautJob(g)
  if (!g.character.alive || !job || job.level < 6 || !astronautStore.has(g)) return
  if (!(STANCES as readonly string[]).includes(choice)) return
  const s = astronautStore.mut(g)
  if (!claimChoice(g, s, data, `admin.${g.year}`)) return
  const c = careerCtx(g, 'astronaut', s)
  const a = adminOf(job)
  job.data.admin = { years: a.years, stance: choice }
  if (choice === 'push') {
    s.lobby = clamp(s.lobby + 8, -6, 20)
    s.safety = clamp(s.safety - 4, 15, 95)
    careerLog(c, 'I pushed lawmakers for more funding.')
    careerSay(c, 'The Budget', 'You pushed lawmakers hard. Funding looks better, and the safety office is stretched.', BUILDING)
  } else if (choice === 'safety') {
    s.safety = clamp(s.safety + 8, 15, 95)
    s.lobby = clamp(s.lobby - 3, -6, 20)
    careerLog(c, 'I funded a safety review.')
    careerSay(c, 'The Budget', 'You paid for a full safety review. Crews trust the schedule more, and the funding case is weaker.', BUILDING)
  } else {
    careerSay(c, 'The Budget', 'You held the line this year. The budget stayed where it was.', BUILDING)
  }
})

/**
 * After a push year, a loss with a schedule cause can cost the administrator the post: 55% dismissal and blame +1.
 * True when dismissed. Draws g.rng only for a pushing administrator.
 */
export function adminFallout(c: CareerCtx<AstroState>): boolean {
  const { g, s } = c
  const job = astronautJob(g)
  if (!job || job.level < 6 || adminOf(job).stance !== 'push') return false
  if (!chance(g, DISMISS)) return false
  s.tally.blame = Math.min(20, s.tally.blame + 1)
  leave(g, 'fired')
  careerLog(c, 'The board dismissed me after the schedule inquiry.', 'bad')
  careerSay(c, 'Dismissed', 'The inquiry blamed the schedule you pushed. The board let you go.', BUILDING, 'bad')
  return true
}

// ---------------------------------------------------------------------------
// Commercial flights

const OWN_DAYS = 5
const OWN_BASE = 0.01

/** What a company's own record says about its crew capsule: the safety culture and the launches won and lost. */
export interface SpaceCompany { safety: number; booms: number; wins: number }

/**
 * The player's own space company, read raw from `g.assets` and guarded: an asset whose details name the industry
 * 'spaceTech' and whose tech has finished a 'crew' program. Null on any shape mismatch. Writes nothing and imports
 * nothing from business/, so another track's changes to those files cannot break it (a mismatch hides the exit).
 */
export function ownedSpaceCompany(g: GameState): SpaceCompany | null {
  if (!Array.isArray(g.assets)) return null
  for (const a of g.assets as unknown[]) {
    const d = rec(rec(a).details)
    if (d.industry !== 'spaceTech') continue
    const tech = rec(d.tech)
    if (!Array.isArray(tech.done) || !tech.done.includes('crew')) continue
    return { safety: clamp(fin(tech.safety, 40), 0, 100), booms: Math.max(0, Math.round(fin(tech.booms))), wins: Math.max(0, Math.round(fin(tech.wins))) }
  }
  return null
}

/** .010 x clamp((1 + booms)/(1 + wins), .6, 2.4) x (1.5 - safety/100): the chance the capsule is lost. */
export function ownRisk(co: SpaceCompany): number {
  const booms = Math.max(0, fin(co.booms))
  const wins = Math.max(0, fin(co.wins))
  const record = clamp((1 + booms) / (1 + wins), 0.6, 2.4)
  return clamp(OWN_BASE * record * (1.5 - clamp(fin(co.safety, 40), 0, 100) / 100), 0, 0.5)
}

/** Why you cannot fly your own capsule, or null: a flight on the record, a company with a crew capsule, 2020, the body. */
export function ownBlock(g: GameState, s: AstroState): string | null {
  if (s.tally.flights < 1) return 'You need a flight on your record first.'
  if (!ownedSpaceCompany(g)) return 'You need a space company with a crew capsule.'
  if (g.year < CREWS_FROM) return 'Commercial crews fly from 2020.'
  if (!hasTech(g, 'privateSpace')) return 'There is no private space industry yet.'
  if (g.character.stats.health < 30) return 'The flight surgeon grounded you until your health improves.'
  if (s.mark.groundedYear === g.year) return "You're on leave this year, so you can't fly."
  if (s.dose >= 100) return "Your radiation dose is at the limit. You're grounded for good."
  return s.dose + OWN_DAYS * 0.12 > 100 ? 'That flight would pass your radiation limit.' : null
}

function flyOwn(c: CareerCtx<AstroState>): void {
  const { g, s } = c
  const co = ownedSpaceCompany(g)
  const why = ownBlock(g, s)
  if (!co || why) {
    careerSay(c, 'Your Capsule', why ?? 'You need a space company with a crew capsule.', '\u{1F680}')
    return
  }
  if (chance(g, ownRisk(co))) {
    if (chance(g, FATAL_SHARE)) {
      careerSay(c, 'Liftoff', "Your own capsule came apart on the way up. You didn't get out.", '\u{1F4A5}', 'bad')
      killCharacter(g, 'Rocket Explosion')
      return
    }
    addStat(g, 'health', -randInt(g, 10, 25))
    addStat(g, 'happiness', -10)
    s.flights = cap([...s.flights, { year: c.year, type: 'own', role: 'pilot', days: OWN_DAYS, regimen: 'light', result: 'anomaly', crew: [], bone: s.bone, dose: s.dose }], 12)
    careerLog(c, 'My own capsule failed on the way up and I was hurt.', 'bad')
    careerSay(c, 'Launch Failure', 'Your capsule failed on the way up. You lived, hurt, and the company grounded the fleet.', '\u{1F4A5}', 'bad')
    return
  }
  const body = projectBody(s, OWN_DAYS, 'light', s.skills.fit)
  s.bone = Math.max(15, round1(s.bone - body.bone))
  s.muscle = Math.max(15, round1(s.muscle - body.muscle))
  s.dose = Math.min(100, round1(s.dose + body.dose))
  s.family = Math.min(100, round1(s.family + body.strain))
  s.flights = cap([...s.flights, { year: c.year, type: 'own', role: 'pilot', days: OWN_DAYS, regimen: 'light', result: 'clean', crew: [], bone: s.bone, dose: s.dose }], 12)
  s.tally.flights = Math.min(1e6, s.tally.flights + 1)
  s.tally.own = Math.min(1e6, s.tally.own + 1)
  s.tally.days = Math.min(1e7, s.tally.days + OWN_DAYS)
  addFame(g, 3)
  careerLog(c, 'I flew my own company capsule.', 'good')
  careerSay(c, 'Your Capsule', `You flew your own capsule for ${OWN_DAYS} days. There was no pay, and the press wanted your name.`, '\u{1F680}', 'good')
}

// ---------------------------------------------------------------------------
// Speaker and author

/** The wealth factor on every new fee: the country's wealth, 0.3 to 1.2. */
const wealthOf = (g: GameState): number => clamp(fin(getCountry(g.character.countryId).wealth, 1), 0.3, 1.2)

const LECTURE_KEY = 'astro.lecture'
const LECTURES = 3
/** Years between memoirs, and the most a life can hold. */
const MEMOIR_GAP = 8
const MEMOIRS = 3
/** What each yearly hook after a memoir pays, as a share of the advance (1.78 in all with the advance). */
const TAIL = [0.4, 0.24, 0.14] as const

/** round(clamp(600 + fame x 160, 800, 30000) x wealth). */
export function lectureFee(g: GameState, _s: AstroState): number {
  return Math.round(clamp(600 + fameOf(g) * 160, 800, 30_000) * wealthOf(g))
}

/** round(clamp(20000 + 15000 x flights + 4000 x fame, 20000, 600000) x wealth). */
export function memoirAdvance(g: GameState, s: AstroState): number {
  return Math.round(clamp(20_000 + 15_000 * s.tally.flights + 4_000 * fameOf(g), 20_000, 600_000) * wealthOf(g))
}

/**
 * The memoir's tail: each book pays .4, .24 and .14 of its advance over three yearly hooks, one a year, guarded by
 * the year it last paid. Runs whether or not the job is held; an heir has no record and so no tail.
 */
export function memoirTail(c: CareerCtx<AstroState>): void {
  let total = 0
  for (const m of c.s.legacy.memoirs) {
    if (m.paid >= TAIL.length || m.last >= c.year) continue
    const paid = c.earn('Memoir royalties', Math.round(m.advance * TAIL[m.paid]))
    m.paid += 1
    m.last = c.year
    total += paid
  }
  if (total > 0) careerSay(c, 'Royalties', `Your memoir paid ${money(total)} in royalties this year.`, '\u{1F4D6}', 'good')
}

function memoirBlock(g: GameState, s: AstroState): string | null {
  if (s.tally.flights < 1) return 'A memoir needs a flight to write about.'
  const books = s.legacy.memoirs
  if (books.length >= MEMOIRS) return "You've already written three books."
  const last = books[books.length - 1]
  if (last && g.year < last.year + MEMOIR_GAP) return `Your last book came out in ${last.year}. The next can wait until ${last.year + MEMOIR_GAP}.`
  return null
}

/** The titles an astronaut job carried: how the Hall of Fame knows a retirement was from the corps. */
const TITLES: readonly string[] = ['Astronaut Candidate', 'Astronaut', 'Mission Specialist', 'Flight Engineer', 'Mission Commander', 'Chief Astronaut', 'Deputy Administrator', 'Administrator']

/** The Hall of Fame: once, for an astronaut who retired from the corps at 60 or over. Fame +4 and one memory. */
export function hallOfFame(c: CareerCtx<AstroState>): void {
  const { g, s } = c
  if (s.legacy.hall || astronautJob(g) || g.character.age < 60) return
  const last = Array.isArray(g.character.careerHistory) ? g.character.careerHistory[g.character.careerHistory.length - 1] : undefined
  if (!last || last.reason !== 'retired' || !TITLES.includes(last.title) || fin(last.endAge, -1) < g.character.age - 1) return
  s.legacy.hall = true
  addFame(g, 4)
  remember(g, 'Entered the astronaut Hall of Fame.')
  careerSay(c, 'Hall of Fame', `The corps put you in its Hall of Fame. You retired with ${legacyPoints(s)} legacy points.`, HALL, 'good')
}

// ---------------------------------------------------------------------------
// Rows

let publicRows: MenuNode[] | null = null

/** astro.public (astro.lecture and astro.memoir), astro.admin and astro.own. Each row carries its own gate. */
export function astroPublicRows(_g: GameState): MenuNode[] {
  return (publicRows ??= buildPublicRows())
}

function buildPublicRows(): MenuNode[] {
  const lecture = row({
    id: LECTURE_KEY,
    label: 'Give a Lecture',
    emoji: '\u{1F3A4}',
    subtitle: (g) => `Pays about ${money(lectureFee(g, astronautStore.view(g)))}. ${Math.max(0, LECTURES - yearActionsUsed(g, LECTURE_KEY))} left this year.`,
    gate: (g, s) => {
      if (s.tally.flights < 1) return 'Audiences want an astronaut who has flown.'
      return yearActionsUsed(g, LECTURE_KEY) >= LECTURES ? "You've given three lectures this year." : null
    },
    run: (c) => {
      const { g, s } = c
      if (!useYearAction(g, LECTURE_KEY, LECTURES)) {
        careerSay(c, 'Lecture', "You've given three lectures this year.", '\u{1F3A4}')
        return
      }
      const fee = c.earn('Lecture fee', lectureFee(g, s))
      s.family = Math.min(100, round1(s.family + 2))
      s.mood = clamp(s.mood + 1, 0, 100)
      addFame(g, 1)
      careerLog(c, 'I gave a lecture about spaceflight.')
      careerSay(c, 'Lecture', `You lectured on your flights. The hall paid ${money(fee)}.`, '\u{1F3A4}', 'good')
    },
  })
  const memoir = row({
    id: 'astro.memoir',
    label: 'Write a Memoir',
    emoji: '\u{1F4D6}',
    subtitle: (g) => `The advance is about ${money(memoirAdvance(g, astronautStore.view(g)))}, then royalties for three years.`,
    gate: memoirBlock,
    run: (c) => {
      const { g, s } = c
      const advance = memoirAdvance(g, s)
      if (c.earn('Memoir advance', advance) < 1) return
      s.legacy.memoirs = cap([...s.legacy.memoirs, { year: c.year, advance, last: c.year, paid: 0 }], MEMOIRS)
      careerLog(c, 'I signed a memoir deal.', 'good')
      careerSay(c, 'Memoir', `A publisher signed your memoir and paid ${money(advance)} up front. Royalties follow for three years.`, '\u{1F4D6}', 'good')
    },
  })
  const menu: MenuGroup = {
    type: 'menu',
    id: 'astro.public',
    label: 'Public Life',
    emoji: '\u{1F3A4}',
    subtitle: 'Lectures and books',
    visible: (g) => astronautStore.view(g).tally.flights >= 1,
    children: () => [lecture, memoir],
  }
  const admin = shownWhen(
    {
      ...row({
        id: 'astro.admin',
        label: 'Move to Administration',
        emoji: BUILDING,
        subtitle: (g) => {
          const job = astronautJob(g)
          if (!job) return ''
          if (job.level >= 7) return 'You lead the agency.'
          if (job.level === 6) return `Administrator at ${money(ADMIN_POSTS[1].salary)}, after three years as Deputy.`
          return `Deputy Administrator at ${money(ADMIN_POSTS[0].salary)}, with no more flights.`
        },
        gate: adminBlock,
        run: takeAdmin,
      }),
      confirm: (g) => ((astronautJob(g)?.level ?? 0) < 6 ? 'Administrators fly no more. Move to administration?' : null),
    },
    (g) => !!astronautJob(g),
  )
  const own = shownWhen(
    row({
      id: 'astro.own',
      label: 'Fly Your Own Capsule',
      emoji: '\u{1F680}',
      subtitle: (g) => {
        const co = ownedSpaceCompany(g)
        return co ? `Risk about ${(ownRisk(co) * 100).toFixed(1)}%, fame +3, no pay, once a year.` : ''
      },
      gate: (g, s) => ownBlock(g, s) ?? (yearActionsUsed(g, 'astro.own') >= 1 ? "You've already flown your capsule this year." : null),
      once: 'astro.own',
      run: flyOwn,
    }),
    (g) => ownedSpaceCompany(g) !== null,
  )
  return [menu, admin, own]
}

// ---------------------------------------------------------------------------
// The Corps page

const info = (id: string, text: string): MenuNode => ({ type: 'info', id, text: fit(text, 90) })

let corps: MenuGroup | null = null

/** The Corps page: funding with its parts, the body, the rank among peers, classes, open inquiries and the legacy score. Read only. */
export function corpsMenu(): MenuGroup {
  return (corps ??= {
    type: 'menu',
    id: 'astro.corps',
    label: 'Corps Record',
    emoji: '\u{1F4CB}',
    subtitle: (g) => `Funding ${fundingIndex(g, astronautStore.view(g))}, legacy ${legacyPoints(astronautStore.view(g))}`,
    children: (g) => {
      const s = astronautStore.view(g)
      const out: MenuNode[] = [info('astro.corps.fund', `Funding ${fundingIndex(g, s)} of 100. Space line ${Math.round(budgetLevel(g, 'space') * 100)}%, mood ${s.mood}, lobby ${s.lobby}.`)]
      if (s.fund.length > 0) out.push(info('astro.corps.hist', `Recent funding: ${s.fund.join(', ')}.`))
      out.push(info('astro.corps.safety', `Safety culture ${s.safety}.`))
      out.push(info('astro.corps.body', `Bone ${Math.round(s.bone)}, muscle ${Math.round(s.muscle)}, dose ${Math.round(s.dose)}, strain ${Math.round(s.family)}.`))
      const st = standingOf(g, ASTRO_SPEC, s.standing, s.memory)
      if (st.top.length > 0) {
        out.push(info('astro.corps.rank', `You rank ${st.rank} of ${st.of} in the corps.`))
        out.push(info('astro.corps.peers', `Top peers: ${st.top.slice(0, 3).map((p) => p.name).join(', ')}.`))
      }
      const klass = s.classes[s.classes.length - 1]
      if (klass) out.push(info('astro.corps.class', `Class ${klass.year}: ${klass.seats} seats, ${klass.finalists} finalists${klass.rank > 0 ? `, you placed ${klass.rank}` : ''}.`))
      const open = s.inquiries.filter((i) => i.status === 'open').length
      if (open > 0) out.push(info('astro.corps.inquiry', `Open inquiries: ${open}.`))
      out.push(info('astro.corps.legacy', `Legacy points ${legacyPoints(s)}.`))
      if (s.tally.firsts.length > 0) out.push(info('astro.corps.firsts', `Firsts: ${s.tally.firsts.join(', ')}.`))
      return out
    },
  })
}
