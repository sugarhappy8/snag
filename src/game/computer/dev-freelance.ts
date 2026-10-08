// Freelancing from the home computer (13+): websites, landing pages, logos, scripts, databases
// and client apps on real freelance marketplaces. Pay follows your skill and your reviews (and is
// closer to global rates than local wages), clients can be from hell, and some never pay.
import { addStat, count, formatMoney, log, notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { fillLocal } from '../data/locales'
import { eraLines, eraOk, eraPick, eraStrip } from '../events/era'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { GameState, Json, MenuAction, MenuGroup } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { ageBlock, computerBlock, earnNow, firstReason, taxLine, useComputer } from './dev-common'
import { practice } from './dev-learn'
import { between, devState, freelanceRateMult, freelanceRating, num, saveDev, str, whole } from './dev-state'
import { bestLanguageFor, codingSkill, getLanguage } from './skills'
import { eraOpen, eraReason, FREELANCE_GATE, type EraGate } from './era'

export interface CodeGig {
  id: string
  label: string
  emoji: string
  minAge: number
  minSkill: number
  hours: [number, number]
  /** Language use, or null for design work. */
  use: string | null
  /** Pay relative to a plain web job (bigger, harder jobs pay more per hour). */
  pay: number
  /** What the job is, for the notice: "fixed a broken website". */
  done: string
  /** When clients ask for this (no client apps before smartphones). */
  era?: EraGate
}

export const CODE_GIGS: CodeGig[] = [
  { id: 'logo', label: 'Design a Logo', emoji: '\u{1F3A8}', minAge: 13, minSkill: 0, hours: [3, 10], use: null, pay: 1, done: 'designed a logo' },
  { id: 'fixsite', label: 'Fix a Broken Website', emoji: '\u{1F527}', minAge: 13, minSkill: 10, hours: [3, 12], use: 'web', pay: 0.85, done: 'fixed a broken website' },
  { id: 'landing', label: 'Build a Landing Page', emoji: '\u{1F310}', minAge: 14, minSkill: 20, hours: [8, 25], use: 'web', pay: 1, done: 'built a landing page' },
  { id: 'script', label: 'Write an Automation Script', emoji: '\u{1F916}', minAge: 15, minSkill: 30, hours: [4, 16], use: 'data', pay: 1.1, done: 'wrote an automation script' },
  { id: 'database', label: 'Clean Up a Database', emoji: '\u{1F5C4}\u{FE0F}', minAge: 16, minSkill: 40, hours: [6, 20], use: 'data', pay: 1.2, done: 'cleaned up a database' },
  { id: 'app', label: 'Build a Client App', emoji: '\u{1F4F1}', minAge: 16, minSkill: 50, hours: [30, 90], use: 'apps', pay: 1.3, done: 'built an app', era: { tech: 'smartphone', from: 2009 } },
  { id: 'game', label: 'Port a Game', emoji: '\u{1F3AE}', minAge: 17, minSkill: 60, hours: [20, 70], use: 'games', pay: 1.35, done: 'ported a game' },
  // Before phones ran apps, small businesses wanted desktop software (appended so ids stay put).
  { id: 'desktop', label: 'Write Custom Business Software', emoji: '\u{1F5A5}\u{FE0F}', minAge: 16, minSkill: 45, hours: [25, 80], use: 'data', pay: 1.25, done: 'wrote custom business software', era: { until: 2008 } },
]

/** Freelance jobs clients post this year. */
function gigsNow(g: GameState): CodeGig[] {
  return CODE_GIGS.filter((x) => eraOpen(g, x.era))
}

/** Real freelance marketplaces, tagged with the years they traded (Elance and oDesk became Upwork in 2015). */
export const GIG_PLATFORMS = ['@2000,-2015 Elance', '@2003,-2015 oDesk', '@2009 Freelancer.com', '@2010 Fiverr', '@2015 Upwork']

/** The marketplaces open this year (always at least one: the first ones are untagged for old years). */
export function gigPlatformsNow(g: GameState): string[] {
  const now = eraLines(g, GIG_PLATFORMS)
  return now.length ? now : ['a freelance job board']
}
export const GIG_LIMIT = 6

/** [description, is a person (gets a local name)]. */
const CLIENTS: [string, boolean][] = [
  ['a bakery in {city}', false],
  ['a dentist who "just needs a quick website"', true],
  ['a startup founder with a napkin sketch', true],
  ['a local {sport} club', false],
  ['a real-estate agent with very white teeth', true],
  ['a restaurant that serves {food}', false],
  ['@socialMedia a pet influencer (the pet is the influencer)', true],
  ['a wedding photographer', true],
  ['a man who wants to "disrupt" lawn care', false],
  ['a yoga studio near {hangout}', false],
  ['a tiny law firm', false],
  ['a band with more members than fans', false],
]

const HELL = [
  // Era tags (events/era.ts): no voice notes before smartphones, no social networks before 2004.
  'The client wants "one tiny change": a complete redesign, for no extra money.',
  'The client asked you to "make it pop." Then "pop it less." Then "the first pop, but different."',
  'The client says their nephew could have done it in an hour and wants a discount.',
  '@socialMedia The client wants it "like the big social networks, but better." Their budget has not changed.',
  '@smartphone The client sent 47 voice notes at 2 AM, each one a new feature.',
  '@!smartphone The client sent 47 emails at 2 AM, each one a new feature.',
]

const REVIEWS: Record<number, string[]> = {
  5: ['"Absolute wizard. Would hire again."', '"Fast, friendly, and fixed things I didn\'t know were broken."', '"10/10, my cat approves."'],
  4: ['"Great work, a little slow on replies."', '"Solid job. Would hire again."'],
  3: ['"It works. Mostly."', '"Fine. Not amazing. Fine."'],
  2: ['"Missed the deadline by a week but was very polite about it."', '"It looked nothing like the mockup."'],
  1: ['"I asked for a website and got a riddle."', '"Do not hire. My site now plays music on load."'],
}

function clientName(g: GameState): string {
  const c = g.character
  const [tagged, person] = pick(g, CLIENTS.filter(([t]) => eraOk(g, t)))
  const who = fillLocal(g, eraStrip(tagged)).replace(/\{\w+\}/g, 'local')
  return person && chance(g, 0.6) ? `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, c.countryId)}, ${who}` : who
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Your hourly rate (local dollars) for a gig right now. */
export function gigRate(g: GameState, gig: CodeGig): number {
  const c = g.character
  const s = devState(g)
  const rating = freelanceRating(s)
  const skill = codingSkill(g)
  const base = gig.use === null ? 8 + c.stats.smarts * 0.25 + (hasTalent(g, 'Art') ? 15 : 0) + skill * 0.15 : 8 + skill * 0.85 + (hasTalent(g, 'Programming') ? 6 : 0)
  const reviews = rating > 0 ? (rating - 3.5) * 8 : 0
  const kid = c.age < 16 ? 0.7 : c.age < 18 ? 0.85 : 1
  return Math.max(2, Math.round((base + reviews) * gig.pay * kid * freelanceRateMult(c.countryId)))
}

function stars(score: number): number {
  return score >= 75 ? 5 : score >= 60 ? 4 : score >= 45 ? 3 : score >= 30 ? 2 : 1
}

function recordGig(g: GameState, pay: number, rating: number | null, stiffed = false): void {
  const s = devState(g)
  const f = s.freelance
  if (f.gigs === 0) f.firstAge = g.character.age
  f.gigs += 1
  f.lastAge = g.character.age
  f.earned += whole(pay)
  if (rating !== null) {
    f.stars += between(Math.round(rating), 1, 5)
    f.reviews += 1
  }
  if (stiffed) f.stiffed += 1
  saveDev(g, s)
  count(g, 'freelanceGigs')
}

const HELL_SCRIPT = defineScript('computer.dev.gig.hell', (g, choice, data) => {
  if (!g.character.alive) return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const pay = whole(num(d.pay))
  const rating = between(num(d.stars, 3), 1, 5)
  const client = str(d.client, 'The client')
  const platform = str(d.platform, 'a freelance job board')
  if (choice === 'comply') {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    const tax = earnNow(g, pay)
    recordGig(g, pay, Math.min(5, rating + 1))
    log(g, `I did a freelance job for free extra work and earned ${formatMoney(pay)}.`)
    notice(g, 'People Pleaser', `You did all the extra work for free. ${capFirst(client)} paid ${formatMoney(pay)} and left a glowing review on ${platform}. You aged two years.${taxLine(tax)}`, { emoji: '\u{1F62E}\u{200D}\u{1F4A8}' })
  } else if (choice === 'charge') {
    if (chance(g, 0.55)) {
      const total = Math.round(pay * 1.4)
      const tax = earnNow(g, total)
      recordGig(g, total, rating)
      log(g, `I billed a difficult client for extra work and got ${formatMoney(total)}.`, 'good')
      notice(g, 'Invoice Paid', `You sent a polite invoice for the extra work. To your amazement, ${client} paid it: ${formatMoney(total)} in total.${taxLine(tax)}`, { emoji: '\u{1F9FE}', tone: 'good' })
    } else {
      const tax = earnNow(g, pay)
      recordGig(g, pay, randInt(g, 1, 2))
      log(g, `A client left me a bad review on ${platform} for charging for extra work.`, 'bad')
      notice(g, 'Revenge Review', `${capFirst(client)} paid the original ${formatMoney(pay)}, then left you a ${randInt(g, 1, 2)}-star review: ${pick(g, REVIEWS[1])}${taxLine(tax)}`, { emoji: '\u{1F4A2}', tone: 'bad' })
    }
  } else {
    const half = Math.round(pay * 0.5)
    const tax = earnNow(g, half)
    recordGig(g, half, null)
    addStat(g, 'happiness', randInt(g, 1, 4))
    log(g, 'I fired a nightmare client.', 'good')
    notice(g, 'Client Fired', `You fired ${client}. They paid ${formatMoney(half)} for the work already done and called you "unprofessional" in a 900-word email you did not read.${taxLine(tax)}`, { emoji: '\u{1F525}' })
  }
})

/** Take one freelance job. */
export function doCodeGig(g: GameState, gig: CodeGig): void {
  const c = g.character
  const reason = firstReason(computerBlock(g), eraReason(g, FREELANCE_GATE, 'online freelancing platforms'), ageBlock(g, gig.minAge, `take ${gig.label.toLowerCase()} jobs`), eraReason(g, gig.era, `${gig.label.toLowerCase()} jobs`))
  if (reason) return notice(g, gig.label, reason, { emoji: gig.emoji })
  if (codingSkill(g) < gig.minSkill) return notice(g, gig.label, `Clients want coding skill ${gig.minSkill}+ for this (you have ${codingSkill(g)}).`, { emoji: gig.emoji })
  if (!useYearAction(g, 'computer.dev.gig', GIG_LIMIT)) return notice(g, 'Freelancing', `You've done ${GIG_LIMIT} freelance jobs this year. Your wrists have filed a complaint.`, { emoji: gig.emoji })
  useComputer(g, 1)
  const platform = pick(g, gigPlatformsNow(g))
  const client = clientName(g)
  const rate = gigRate(g, gig)
  const hours = randInt(g, gig.hours[0], gig.hours[1])
  const pay = rate * hours
  const best = gig.use ? bestLanguageFor(g, gig.use) : null
  const skill = codingSkill(g)
  const score =
    (gig.use === null ? c.stats.smarts * 0.4 + skill * 0.2 + (hasTalent(g, 'Art') ? 20 : 0) + 15 : skill * 0.7 + (best?.level ?? 0) * 0.2 - gig.minSkill * 0.3 + 15 + (hasTalent(g, 'Programming') ? 8 : 0)) +
    c.hidden.discipline * 0.15 +
    randInt(g, -20, 20)
  const rating = stars(score)
  if (gig.use) practice(g, 1.5, best?.id ?? null, 1)
  const lang = best ? getLanguage(best.id)?.label : undefined
  const roll = randInt(g, 1, 100)
  if (roll <= 10) {
    scriptChoice(
      g,
      HELL_SCRIPT,
      'Client From Hell',
      `You took a job on ${platform} for ${client}: ${gig.label.toLowerCase()}, ${hours} hours at ${formatMoney(rate)}/hour (${formatMoney(pay)}). ${eraPick(g, HELL)}`,
      [
        { id: 'comply', label: 'Do it anyway, for free', emoji: '\u{1F64F}' },
        { id: 'charge', label: 'Bill them for the extra work', emoji: '\u{1F9FE}' },
        { id: 'fire', label: 'Fire the client', emoji: '\u{1F525}' },
      ],
      { emoji: '\u{1F47F}', data: { pay, stars: rating, client, platform } as Json },
    )
    return
  }
  if (roll <= 16) {
    recordGig(g, 0, null, true)
    addStat(g, 'happiness', -randInt(g, 3, 6))
    log(g, 'A freelance client never paid me.', 'bad')
    notice(g, 'Ghosted', `You ${gig.done} for ${client} (${hours} hours). They loved it. Then they deleted their account and never paid the ${formatMoney(pay)}.`, { emoji: '\u{1F47B}', tone: 'bad' })
    return
  }
  const tip = rating === 5 && chance(g, 0.3) ? Math.max(5, Math.round(pay * randInt(g, 10, 25) / 100)) : 0
  const total = pay + tip
  const tax = earnNow(g, total)
  recordGig(g, total, rating)
  addStat(g, 'happiness', rating >= 4 ? randInt(g, 1, 3) : -randInt(g, 0, 2))
  log(g, `I ${gig.done} for ${client} on ${platform} and earned ${formatMoney(total)}.`, 'good')
  const s = devState(g)
  notice(
    g,
    gig.label,
    `On ${platform}, ${client} hired you: ${hours} hours at ${formatMoney(rate)}/hour.${lang ? ` You did it in ${lang}.` : ''} You earned ${formatMoney(total)}${tip ? ` (including a ${formatMoney(tip)} tip)` : ''}.${taxLine(tax)}\n\nReview: ${'\u{2B50}'.repeat(rating)} ${pick(g, REVIEWS[rating])}\nYour rating: ${freelanceRating(s).toFixed(1)} from ${s.freelance.reviews} review${s.freelance.reviews === 1 ? '' : 's'}.`,
    { emoji: gig.emoji, tone: rating >= 3 ? 'good' : 'neutral' },
  )
}

function gigAction(gig: CodeGig): MenuAction {
  return {
    type: 'action',
    id: `computer.dev.gig.${gig.id}`,
    label: gig.label,
    emoji: gig.emoji,
    subtitle: (g) => `~${formatMoney(gigRate(g, gig))}/hr · ${gig.hours[0]}-${gig.hours[1]} hours · skill ${gig.minSkill}+ · age ${gig.minAge}+`,
    visible: (g) => g.character.age >= gig.minAge - 1,
    disabledReason: (g) =>
      firstReason(
        computerBlock(g),
        ageBlock(g, gig.minAge, `take ${gig.label.toLowerCase()} jobs`),
        codingSkill(g) < gig.minSkill ? `Clients want coding skill ${gig.minSkill}+ (you have ${codingSkill(g)}).` : null,
        yearActionsUsed(g, 'computer.dev.gig') >= GIG_LIMIT ? `You've done ${GIG_LIMIT} freelance jobs this year.` : null,
      ),
    run: (g) => doCodeGig(g, gig),
  }
}

/** Activities › Computer › Freelancing (also linked from Occupation › Freelance Gigs). */
export const codeFreelanceMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.freelance',
  label: 'Freelance Online',
  emoji: '\u{1F4BC}',
  subtitle: (g) => {
    const s = devState(g)
    const r = freelanceRating(s)
    return s.freelance.gigs > 0 ? `${s.freelance.gigs} jobs · ${r > 0 ? `${r.toFixed(1)}\u{2B50}` : 'no reviews'} · ${yearActionsUsed(g, 'computer.dev.gig')}/${GIG_LIMIT} this year` : `Websites, logos, scripts and ${gigsNow(g).some((x) => x.id === 'app') ? 'apps' : 'business software'} for paying clients`
  },
  visible: (g) => g.character.age >= 13 && eraOpen(g, FREELANCE_GATE),
  disabledReason: (g) => firstReason(computerBlock(g), ageBlock(g, 13, 'freelance')),
  header: (g) => {
    const s = devState(g)
    const r = freelanceRating(s)
    return `Gig platforms: ${gigPlatformsNow(g).join(', ')}. ${s.freelance.gigs > 0 ? `You've done ${s.freelance.gigs} jobs and earned ${formatMoney(s.freelance.earned)}${r > 0 ? `; rating ${r.toFixed(1)}/5` : ''}.` : 'Better skill and better reviews mean better rates.'}${g.character.age < 18 ? ' Clients pay kids less. Rude, but true.' : ''}`
  },
  children: (g) => gigsNow(g).map(gigAction),
}
