// Game Industry › Studio Jobs: get hired at a studio (a local indie shop, a mid-size studio or
// a global AAA giant's local office), climb from QA Tester to Studio Head, ship the studio's
// games with your name in the credits, survive crunch, layoffs and burnout.
//
// The job is a special-category Job (defId 'game_dev'); its studio, track and the game the
// team is making live in Job.data (gamedev-state.ts GdJobData). Pay follows the local market.
import { bestLanguageFor, codingSkill } from '../computer/skills'
import { practice } from '../computer/dev-learn'
import { localFee } from '../computer/dev-state'
import { seeded, yearKey, type SRng } from '../assets'
import { severanceMonths } from '../business/flavor'
import { addHidden, addRelationship, addStat, count, currentPartner, earnIncome, log, remember, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { industryDemand, localMarket } from '../data/markets'
import { chance, pick, randFloat, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { addColleague, addFame, blocked, hire, leave, money, ownFlag, promote, quitNote, say, setOwnFlag, setRole, syncTenure, tell } from './common'
import { addGamerFame, copiesLabel, firstYearCopies, gamePay, gameTitle, homeReach, industryYear, reviewScores, sequelTitle, trainArt, trainDesign } from './gamedev-core'
import {
  CONVENTION,
  GIANTS,
  genreDef,
  GENRES,
  HUBS,
  INDIE_SUFFIX,
  INDIE_WORDS,
  INTERVIEWS,
  LEVELS,
  levelDef,
  MAX_LEVEL,
  MID_SUFFIX,
  MID_WORDS,
  QA_PAY,
  scopeDef,
  TIER_INFO,
  TIER_LABEL,
  titleFor,
  TRACK_LABEL,
  type GenreId,
  type PlatformId,
  type Tier,
  type Track,
} from './gamedev-data'
import {
  artSkill,
  clampN,
  designSkill,
  GAME_JOB,
  gameJob,
  gamePortfolio,
  gdMut,
  gdView,
  nextId,
  readJobData,
  tidy,
  writeJobData,
  type GdJobData,
  type GdJobProject,
  type GdProfile,
} from './gamedev-state'

// ---------------------------------------------------------------------------
// Skills per track

/** The skill that matters for a track (QA leans on smarts and discipline). */
export function trackSkill(g: GameState, track: Track, p: GdProfile = gdView(g)): number {
  const c = g.character
  switch (track) {
    case 'code':
      return codingSkill(g)
    case 'art':
      return artSkill(g, p)
    case 'design':
      return designSkill(g, p)
    case 'qa':
      return Math.round(clampN(c.stats.smarts * 0.5 + c.hidden.discipline * 0.4 + 10, 0, 100))
  }
}

/** The best track for the player right now (for promotions out of QA). */
export function bestTrack(g: GameState, p: GdProfile = gdView(g)): Track | null {
  const options: [Track, number][] = [
    ['code', codingSkill(g)],
    ['design', designSkill(g, p)],
    ['art', artSkill(g, p)],
  ]
  options.sort((a, b) => b[1] - a[1])
  return options[0][1] >= LEVELS[1].skill ? options[0][0] : null
}

/** Why the player can't be hired at this level on this track (null = qualified). */
export function requirementProblem(g: GameState, level: number, track: Track): string | null {
  const c = g.character
  const L = levelDef(level)
  if (c.age < L.minAge) return `You must be at least ${L.minAge}.`
  if (level === 0) return null
  const p = gdView(g)
  const skill = trackSkill(g, track, p)
  const port = gamePortfolio(g, p)
  if (level === 1) {
    if (skill >= L.skill) return null
    if (track === 'code' && codingSkill(g) >= 25 && c.education.degrees.some((d) => d.major && /Computer Science|Information Systems|Mathematics|Engineering/.test(d.major))) return null
    if (track === 'art' && skill >= 25 && c.education.degrees.some((d) => d.major === 'Graphic Design')) return null
    if (track === 'design' && skill >= 25 && port.shipped >= 2) return null
    const how = track === 'code' ? 'coding skill' : track === 'art' ? 'art skill' : 'game design skill'
    return `Needs ${how} ${L.skill}+ (you have ${skill})${track === 'design' ? ' or two shipped games' : track === 'code' ? ' or a CS degree' : ' or a graphic design degree'}.`
  }
  if (skill < L.skill) return `Needs ${TRACK_LABEL[track].toLowerCase()} skill ${L.skill}+ (you have ${skill}).`
  if (port.shipped < L.credits) return `Needs ${L.credits} shipped game${L.credits === 1 ? '' : 's'} on your record (you have ${port.shipped}).`
  if (level >= 4 && port.best < 75) return `Needs a game that scored 75+ with critics (your best: ${port.best || 'none'}).`
  if (level >= 5 && p.gamerFame < 30) return `Studios want a name gamers know (gamer fame 30+, you have ${p.gamerFame}).`
  return null
}

// ---------------------------------------------------------------------------
// Listings

export interface Listing {
  id: string
  studio: string
  tier: Tier
  hq: string
  city: string
  level: number
  track: Track
  title: string
  salary: number
  craft: number
}

function localWords(g: GameState): string[] {
  return localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() && w.length <= 12)
}

function studioName(g: GameState, s: SRng, tier: Tier): { name: string; hq: string } {
  const c = g.character
  if (tier === 'aaa') {
    const home = GIANTS.filter((x) => x.hq === c.countryId)
    const giant = home.length && s.chance(0.6) ? s.pick(home) : s.pick(GIANTS)
    return { name: giant.name, hq: giant.hq }
  }
  const words = localWords(g)
  if (tier === 'mid') return { name: `${words.length && s.chance(0.5) ? s.pick(words) : s.pick(MID_WORDS)} ${s.pick(MID_SUFFIX)}`, hq: c.countryId }
  return { name: `${words.length && s.chance(0.35) ? s.pick(words) : s.pick(INDIE_WORDS)} ${s.pick(INDIE_SUFFIX)}`, hq: c.countryId }
}

/** Yearly salary for a level at a tier in the player's market (part-time for teenage testers). */
export function salaryFor(g: GameState, level: number, tier: Tier): number {
  const usPay = level === 0 ? QA_PAY : levelDef(level).pay
  const full = gamePay(g.character.countryId, usPay * TIER_INFO[tier].pay)
  return level === 0 && g.character.age < 18 ? Math.round(full * 0.45) : full
}

/** How big the local game scene is: decides how many studios hire here. */
function sceneSize(countryId: string): number {
  const demand = industryDemand(countryId, 'gameStudio')
  const hub = HUBS.includes(countryId) || GIANTS.some((x) => x.hq === countryId)
  return clampN(demand * (hub ? 1.3 : 0.8), 0, 3)
}

/**
 * This year's openings where the player lives. Seeded by the year, character and city, so the
 * list is stable all year, costs no game randomness and is safe to build in menus.
 */
export function jobListings(g: GameState): Listing[] {
  const c = g.character
  const s = seeded(yearKey(g, 'gamedev.jobs'))
  const scene = sceneSize(c.countryId)
  const mood = industryYear(g).mood
  const n = Math.round(clampN(2 + scene * 1.6 + (mood === 'boom' ? 1 : mood === 'downturn' ? -2 : 0), 1, 7))
  const city = getCountry(c.countryId).cities.includes(c.city) ? c.city : getCountry(c.countryId).cities[0] ?? c.city
  const port = gamePortfolio(g)
  const out: Listing[] = []
  for (let i = 0; i < n; i++) {
    const tiers: [Tier, number][] = [
      ['indie', 0.45],
      ['mid', 0.35 * Math.min(1.3, scene)],
      ['aaa', scene >= 1.2 ? 0.3 : scene >= 0.6 ? 0.08 : 0],
    ]
    const tier = s.weighted(
      tiers.filter((t) => t[1] > 0),
      (t) => t[1],
    )[0]
    // Mostly entry-level openings; experienced players see a few senior roles.
    const reach = Math.min(MAX_LEVEL - 1, 1 + Math.floor(port.shipped / 2))
    const levels = LEVELS.slice(0, reach + 2).map((L) => [L.level, L.level === 0 ? 0.3 : L.level <= reach ? 0.3 : 0.12] as [number, number])
    const level = c.age < 18 ? 0 : s.weighted(levels, (x) => x[1])[0]
    const track: Track = level === 0 ? 'qa' : s.pick(['code', 'art', 'design'] as Track[])
    const { name, hq } = studioName(g, s, tier)
    const [lo, hi] = TIER_INFO[tier].craft
    out.push({
      id: `${g.year}:${i}`,
      studio: name,
      tier,
      hq,
      city,
      level,
      track,
      title: titleFor(track, level),
      salary: salaryFor(g, level, tier),
      craft: s.int(lo, hi),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Applying

const INTERVIEW = defineScript('gamedev.job.interview', (g, choice, data) => {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const l = d.listing && typeof d.listing === 'object' && !Array.isArray(d.listing) ? (d.listing as unknown as Listing) : null
  const qi = typeof d.q === 'number' ? d.q : -1
  const q = INTERVIEWS[qi]
  if (!l || !q || blocked(g)) return
  const answer = q.answers.find((a) => a.id === choice) ?? q.answers[q.answers.length - 1]
  const p = gdView(g)
  const L = levelDef(l.level)
  const skill = trackSkill(g, l.track, p)
  const port = gamePortfolio(g, p)
  const mood = industryYear(g).mood
  const talent = (l.track === 'code' && g.character.talent === 'Programming') || (l.track === 'art' && g.character.talent === 'Art') ? 6 : 0
  const referral = hasReferral(g, l.studio) ? 10 : 0
  const score =
    42 +
    (skill - L.skill) * 0.7 +
    answer.score +
    Math.min(12, (port.shipped - L.credits) * 3) +
    p.gamerFame * 0.2 +
    talent +
    referral +
    (mood === 'boom' ? 8 : mood === 'downturn' ? -12 : 0) +
    (l.tier === 'aaa' ? -6 : l.tier === 'indie' ? 4 : 0) +
    randInt(g, -14, 14)
  const bar = l.level === 0 ? 34 : 50
  if (score < bar) {
    log(g, `I interviewed at ${l.studio} for ${l.title} and didn't get it.`, 'bad')
    say(g, 'Not This Time', `${answer.reply}\n\n${l.studio} went with another candidate. ${pick(g, ['They promised to "keep your CV on file," which is a large file nobody opens.', 'The rejection email had your name spelled wrong.', 'They said you were "a strong candidate," which is what they say to everyone.'])}`, '\u{1F4E7}', 'bad')
    return
  }
  takeJob(g, l, answer.reply)
})

/** A recruiter you met at the convention this year vouches for you at their studio. */
function hasReferral(g: GameState, studio: string): boolean {
  const v = ownFlag(g, 'gamedev.referral')
  return !!v && typeof v === 'object' && !Array.isArray(v) && v.year === g.year && v.studio === studio
}

/** Start working at a studio (quits the current main job). */
export function takeJob(g: GameState, l: Listing, intro = ''): void {
  const c = g.character
  if (blocked(g) || c.age < levelDef(l.level).minAge) return
  const genre = studioGenre(g, l)
  const d: GdJobData = { studio: l.studio, tier: l.tier, track: l.track, craft: l.craft, hq: l.hq, city: l.city, proj: null, raiseYear: 0, effort: 0, scare: 0, crunchYear: 0 }
  d.proj = newStudioProject(g, d, genre)
  const { quit } = hire(g, {
    defId: GAME_JOB,
    title: c.age < 18 && l.level === 0 ? 'QA Tester (Part-Time)' : l.title,
    company: l.studio,
    salary: l.salary,
    level: l.level,
    performance: 60,
    data: d as unknown as Record<string, Json>,
  })
  const p = gdMut(g)
  if (!p.studios.includes(l.studio)) p.studios.push(l.studio)
  tidy(p)
  addColleague(g, l.studio, pick(g, ['Game Programmer', 'Level Designer', 'Concept Artist', 'Producer', 'QA Tester', 'Sound Designer']))
  addStat(g, 'happiness', randInt(g, 4, 9))
  count(g, 'gameJobs')
  log(g, `I got a job as ${l.title} at ${l.studio}.`, 'good')
  remember(g, `Hired as ${l.title} at ${l.studio}, a ${TIER_LABEL[l.tier]}.`)
  const proj = d.proj
  const team = proj ? ` You're on the team making "${proj.title}", ${articleNoun(genreDef(proj.genre).noun)}.` : ''
  say(g, "You're Hired!", `${intro ? `${intro}\n\n` : ''}${l.studio} hired you as ${l.title} for ${money(l.salary)} a year.${team}${quitNote(quit)}`, '\u{1F3AE}', 'good')
}

function articleNoun(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

function applyTo(g: GameState, l: Listing): void {
  const reason = blocked(g) ?? requirementProblem(g, l.level, l.track)
  if (reason) return tell(g, l.title, reason, '\u{1F3AE}')
  if (!useYearAction(g, `gamedev.apply.${l.id}`, 1)) return tell(g, 'Already Applied', `You already applied to ${l.studio} this year.`, '\u{1F4E7}')
  if (!useYearAction(g, 'gamedev.apply', 4)) return tell(g, 'Application Fatigue', "You've sent four applications this year. Your cover letter template is starting to sound desperate.", '\u{1F4E7}')
  const pool = INTERVIEWS.map((q, i) => [q, i] as const).filter(([q]) => q.track === l.track || (q.track === 'any' && l.level > 0))
  const [q, qi] = pick(g, pool)
  scriptChoice(g, INTERVIEW, `Interview at ${l.studio}`, `${l.title} · ${TIER_LABEL[l.tier]}${l.tier === 'aaa' ? ` (${l.city} office)` : ` in ${l.city}`}\n\n${q.text}`, q.answers.map((a) => ({ id: a.id, label: a.label, emoji: a.emoji })), {
    emoji: '\u{1F3AE}',
    data: { listing: JSON.parse(JSON.stringify(l)) as Json, q: qi },
  })
}

function listingRow(l: Listing): MenuAction {
  return {
    type: 'action',
    id: `gamedev.job.${l.id}`,
    label: `${l.title} · ${l.studio}`,
    emoji: l.tier === 'aaa' ? '\u{1F3F0}' : l.tier === 'mid' ? '\u{1F3E2}' : '\u{1F3E0}',
    subtitle: (g) => {
      const reason = requirementProblem(g, l.level, l.track)
      return `${TIER_LABEL[l.tier]} · ${money(l.salary)}/yr${reason ? ` · ${reason}` : ' · you qualify'}`
    },
    disabledReason: (g) => blocked(g) ?? requirementProblem(g, l.level, l.track) ?? (yearActionsUsed(g, `gamedev.apply.${l.id}`) >= 1 ? 'You already applied here this year.' : null),
    confirm: (g) => {
      const j = g.character.job
      return j ? `If they hire you, you'll quit your job as ${j.title}${j.company ? ` at ${j.company}` : ''}. Apply?` : null
    },
    run: (g) => applyTo(g, l),
  }
}

/** Game Industry › Studio Jobs. */
export const studioJobsMenu: MenuGroup = {
  type: 'menu',
  id: 'gamedev.jobs',
  label: 'Studio Jobs',
  emoji: '\u{1F4BC}',
  subtitle: (g) => (g.character.age < 16 ? 'QA testing from 16, studio jobs from 18' : `Job market: ${industryYear(g).mood === 'downturn' ? 'layoff season' : industryYear(g).mood === 'boom' ? 'everyone is hiring' : 'steady'}`),
  disabledReason: (g) => blocked(g, 16),
  header: (g) => {
    const mood = industryYear(g).mood
    const scene = sceneSize(g.character.countryId)
    const where = getCountry(g.character.countryId).name
    const sceneLine = scene >= 1.6 ? `${where} is a game-making powerhouse.` : scene >= 0.9 ? `${where} has a healthy game scene.` : scene >= 0.4 ? `${where} has a small game scene.` : `${where} has very few game studios.`
    const moodLine = mood === 'downturn' ? 'The industry is in a layoff wave: fewer openings, more competition.' : mood === 'boom' ? 'The industry is booming: studios are hiring fast.' : 'Hiring is steady.'
    return `${sceneLine} ${moodLine} Every role lists what it needs: skill in your track, shipped games and, for leads, a hit.`
  },
  children: (g) => {
    const list = g.character.age >= 16 && g.character.alive && !g.character.prison ? jobListings(g) : []
    if (!list.length) return [{ type: 'info', id: 'gamedev.jobs.none', emoji: '\u{1F937}', text: 'No openings right now. Check again next year, or make your own games.' }]
    return list.map(listingRow)
  },
}

// ---------------------------------------------------------------------------
// The studio's game

function studioGenre(g: GameState, l: { studio: string; tier: Tier }): GenreId {
  const giant = GIANTS.find((x) => x.name === l.studio)
  return giant ? pick(g, giant.genres) : pick(g, GENRES).id
}

function newStudioProject(g: GameState, d: GdJobData, genre?: GenreId): GdJobProject {
  const giant = GIANTS.find((x) => x.name === d.studio)
  const scope = pick(g, TIER_INFO[d.tier].scopes)
  const gen = genre ?? (giant ? pick(g, giant.genres) : pick(g, GENRES).id)
  const platform: PlatformId = scope === 'aaa' ? 'multi' : scope === 'aa' ? pick(g, ['console', 'multi'] as PlatformId[]) : pick(g, ['pc', 'pc', 'handheld', 'mobile'] as PlatformId[])
  const title = giant && chance(g, 0.45) ? sequelTitle(giant.franchise, randInt(g, 2, 9)) : gameTitle(g, gen, new Set(gdView(g).games.map((x) => x.title)))
  return { title, genre: gen, scope, platform, progress: randInt(g, 0, 40), quality: d.craft, crunch: 0, started: g.year }
}

/** Contribution to the game per performance point, by level (leads shape it far more). */
const LEVEL_WEIGHT = [0.2, 0.4, 0.6, 0.85, 1.2, 1.7, 1.7]

// ---------------------------------------------------------------------------
// Crunch, burnout and other popups

const CRUNCH = defineScript('gamedev.job.crunch', (g, choice) => {
  const job = gameJob(g)
  if (!job || blocked(g)) return
  const d = readJobData(job)
  const p = gdMut(g)
  const proj = d.proj
  if (choice === 'crunch') {
    job.performance = Math.round(clampN(job.performance + 12, 0, 100))
    if (proj) {
      proj.progress = clampN(proj.progress + 12, 0, 100)
      proj.quality = clampN(proj.quality + 2, 0, 100)
      proj.crunch += 1
    }
    d.crunchYear = g.year
    addStat(g, 'health', -randInt(g, 3, 7))
    addStat(g, 'happiness', -randInt(g, 4, 7))
    p.burnout = Math.round(clampN(p.burnout + 22, 0, 100))
    p.crunchYears += 1
    const partner = currentPartner(g)
    if (partner) addRelationship(partner, -randInt(g, 3, 7))
    writeJobData(job, d)
    log(g, `I crunched for months on ${proj ? `"${proj.title}"` : 'the game'}.`, 'bad')
    say(g, 'Crunch Mode', `You slept under your desk, lived on vending-machine noodles and forgot what your ${partner ? 'partner' : 'apartment'} looks like. The milestone shipped. Your lead called you "a machine." Your doctor would use different words.`, '\u{1F35C}', 'bad')
    return
  }
  if (choice === 'organize') {
    addHidden(g, 'karma', 5)
    if (chance(g, 0.45)) {
      p.burnout = Math.round(clampN(p.burnout - 10, 0, 100))
      addStat(g, 'happiness', 5)
      writeJobData(job, d)
      say(g, 'Solidarity', `You and your coworkers wrote a polite, firm letter. To everyone's shock, management agreed to cap overtime and give comp days. Your desk neighbor cried a little. So did you.`, '\u{270A}', 'good')
    } else if (chance(g, 0.35)) {
      job.performance = Math.round(clampN(job.performance - 15, 0, 100))
      writeJobData(job, d)
      say(g, 'Noted', `Management "heard your concerns" and scheduled a meeting about "team culture." Afterwards your producer stopped inviting you to the important meetings.`, '\u{1F4DD}', 'bad')
    } else {
      say(g, 'The Letter', 'You organized a letter about the overtime. Management thanked everyone for their passion and ordered more pizza. The crunch continued.', '\u{1F355}')
    }
    return
  }
  if (choice === 'quit') {
    const title = job.title
    const studio = d.studio
    leave(g, 'quit')
    log(g, `I quit ${studio} in the middle of crunch.`, 'neutral')
    say(g, 'Walked Out', `You quit your job as ${title} at ${studio}. You slept fourteen hours that night and woke up feeling like a person.`, '\u{1F6AA}')
    p.burnout = Math.round(clampN(p.burnout - 15, 0, 100))
    return
  }
  // Normal hours.
  job.performance = Math.round(clampN(job.performance - 6 - (d.tier === 'aaa' && chance(g, 0.3) ? 6 : 0), 0, 100))
  p.burnout = Math.round(clampN(p.burnout - 5, 0, 100))
  addStat(g, 'happiness', 2)
  writeJobData(job, d)
  say(g, 'Home by Six', `You kept normal hours while the office turned into a sleepover. Your lead sighed every time you left. You had dinner with actual daylight.`, '\u{1F305}')
})

function queueCrunch(g: GameState, d: GdJobData): void {
  const proj = d.proj
  scriptChoice(
    g,
    CRUNCH,
    'Crunch Time',
    `"${proj?.title ?? 'The game'}" ships soon and it is ${pick(g, ['nowhere near done', 'held together with tape', 'mostly bugs in a trench coat'])}. Management "strongly encourages" 80-hour weeks until launch. Free dinners provided.`,
    [
      { id: 'crunch', label: 'Crunch with the team', emoji: '\u{1F35C}' },
      { id: 'normal', label: 'Keep normal hours', emoji: '\u{1F305}' },
      { id: 'organize', label: 'Organize a letter about overtime', emoji: '\u{270A}' },
      { id: 'quit', label: 'Quit', emoji: '\u{1F6AA}' },
    ],
    { emoji: '\u{23F0}' },
  )
}

const BURNOUT = defineScript('gamedev.job.burnout', (g, choice) => {
  if (blocked(g)) return
  const p = gdMut(g)
  const job = gameJob(g)
  if (choice === 'leave' && job) {
    const title = job.title
    leave(g, 'quit')
    p.burnout = Math.round(clampN(p.burnout - 45, 0, 100))
    addStat(g, 'happiness', 6)
    log(g, 'I quit the game industry grind to recover from burnout.', 'neutral')
    say(g, 'Time Off', `You quit your job as ${title}. You took long walks, played games purely for fun and remembered why you loved them in the first place.`, '\u{1F343}')
    return
  }
  if (choice === 'therapy') {
    const cost = localFee(g, 1_200)
    if (g.character.money >= cost) {
      g.character.money -= cost
      p.burnout = Math.round(clampN(p.burnout - 30, 0, 100))
      addStat(g, 'happiness', 4)
      say(g, 'Therapy', `You saw a therapist (${money(cost)}). You learned the word "boundaries" and practiced saying "no" to your producer in the mirror.`, '\u{1F6CB}\u{FE0F}', 'good')
      return
    }
    tell(g, "Can't Afford It", `Therapy costs ${money(cost)}. You have ${money(Math.max(0, g.character.money))}. You pushed through instead.`, '\u{1F4B8}')
  }
  addStat(g, 'health', -randInt(g, 3, 6))
  addStat(g, 'happiness', -randInt(g, 3, 6))
  p.burnout = Math.round(clampN(p.burnout - 5, 0, 100))
  say(g, 'Pushing Through', 'You pushed through. Your eye has been twitching since March. It has its own personality now.', '\u{1FAE0}', 'bad')
})

// ---------------------------------------------------------------------------
// Releases, promotions, layoffs

export interface StudioRelease {
  title: string
  critic: number
  players: number
  copies: number
}

function releaseStudioGame(g: GameState, job: Job, d: GdJobData, p: GdProfile): StudioRelease | null {
  const proj = d.proj
  if (!proj) return null
  const crunchBugs = proj.crunch * 6
  const quality = clampN(proj.quality + randInt(g, -5, 5) - proj.crunch * 2, 5, 98)
  const giant = GIANTS.find((x) => x.name === d.studio)
  const scope = scopeDef(proj.scope)
  const hype = d.tier === 'aaa' ? 60 : d.tier === 'mid' ? 35 : 15
  const r = reviewScores(g, quality, { bugs: crunchBugs, hype })
  const copies = firstYearCopies(g, {
    scope: proj.scope,
    genre: proj.genre,
    platform: proj.platform,
    quality: r.critic,
    hype,
    marketing: d.tier === 'aaa' ? 1.4 : d.tier === 'mid' ? 1 : 0.6,
    reach: (d.tier === 'aaa' ? 1.3 : d.tier === 'mid' ? 1 : 0.75) * homeReach(d.hq || g.character.countryId),
    fame: 0,
    franchise: giant && proj.title.startsWith(giant.franchise) ? 0.6 : 0,
    presold: 0,
  })
  const role = job.title.replace(' (Part-Time)', '')
  p.games.push({
    id: nextId(p, 'gc'),
    title: proj.title,
    genre: proj.genre,
    platform: proj.platform,
    scope: proj.scope,
    engine: scope.index >= 3 ? 'titan' : 'cobalt',
    role,
    studio: d.studio,
    own: false,
    free: false,
    year: g.year,
    age: g.character.age,
    critic: r.critic,
    players: r.players,
    copies,
    tail: 0,
    price: scope.price,
    gross: 0,
    earned: 0,
    dlcs: 0,
    lastDlc: 0,
    patched: 0,
    franchise: giant && proj.title.startsWith(giant.franchise) ? giant.franchise : '',
    publisher: '',
    recoup: 0,
    devShare: 0,
    awards: [],
  })
  const weight = LEVEL_WEIGHT[Math.max(0, Math.min(6, job.level))]
  const fameGain = Math.round(weight * Math.max(0, (r.critic - 55) / 8) * (0.4 + Math.log10(1 + copies) / 7))
  addGamerFame(p, fameGain)
  if (job.level >= 4 && fameGain >= 4) addFame(g, Math.round(fameGain / 3))
  count(g, 'gamesShipped')
  // Leads earn a bonus on a hit; everyone gets a launch party.
  let bonus = 0
  if (r.critic >= 80 && job.level >= 2) bonus = Math.round(job.salary * (0.05 + 0.05 * job.level) * (r.critic >= 90 ? 2 : 1))
  if (bonus > 0) earnIncome(g, bonus)
  if (r.critic >= 85) addStat(g, 'happiness', 8)
  else if (r.critic < 55) addStat(g, 'happiness', -5)
  const verdict = r.critic >= 90 ? 'a masterpiece' : r.critic >= 80 ? 'a hit' : r.critic >= 65 ? 'a solid release' : r.critic >= 50 ? 'a disappointment' : 'a disaster'
  log(g, `"${proj.title}" came out to ${verdict} (${r.critic} with critics). My name is in the credits as ${role}.${bonus > 0 ? ` Bonus: ${money(bonus)}.` : ''}`, r.critic >= 65 ? 'good' : 'bad')
  remember(g, `Shipped "${proj.title}" at ${d.studio} as ${role} (critic score ${r.critic}).`)
  d.proj = newStudioProject(g, d)
  if (r.critic < 55) d.scare = g.year
  return { title: proj.title, critic: r.critic, players: r.players, copies }
}

function maybePromote(g: GameState, job: Job, d: GdJobData, p: GdProfile): string | null {
  const next = job.level + 1
  if (next > MAX_LEVEL) return null
  if (next === MAX_LEVEL && d.tier === 'indie') return null
  // Stars get promoted fast; steady people get there on seniority.
  const star = job.yearsInRole >= 2 ? job.performance >= 70 : job.yearsInRole >= 1 && job.performance >= 88
  const seniority = job.yearsInRole >= 4 && job.performance >= 58
  if (!star && !seniority) return null
  let track = d.track
  // Testers move into a craft once they're good enough (a QA Lead isn't stuck there forever).
  if (track === 'qa' && job.level <= 1) track = bestTrack(g, p) ?? 'qa'
  const L = levelDef(next)
  if (track === 'qa' && next > 1) return null
  if (track !== 'qa' && trackSkill(g, track, p) < L.skill) return null
  const port = gamePortfolio(g, p)
  if (port.shipped < Math.max(0, L.credits - 2)) return null
  if (next >= 5 && (p.gamerFame < 20 || port.best < 75)) return null
  if (!chance(g, 0.65)) return null
  const raise = Math.max(job.salary * 1.08, salaryFor(g, next, d.tier))
  const title = titleFor(track, next)
  d.track = track
  promote(g, job, title, raise, next)
  return title
}

function layoffChance(job: Job, d: GdJobData, mood: string, g: GameState): number {
  const base = mood === 'downturn' ? 0.16 : mood === 'boom' ? 0.01 : 0.03
  const flop = d.scare === g.year ? 0.2 : 0
  const weak = job.performance < 45 ? 0.1 : 0
  const senior = Math.min(0.08, job.level * 0.015)
  const fresh = job.yearsAtCompany <= 1 ? 0.04 : 0
  return clampN(base + flop + weak + fresh - senior, 0, 0.6)
}

// ---------------------------------------------------------------------------
// Yearly

/** One year at the studio. Returns popups used (at most `budget`). */
export function yearlyGameJob(g: GameState, budget: number): number {
  const c = g.character
  const job = gameJob(g)
  if (!job || c.prison || !c.alive) return 0
  syncTenure(g, job)
  const d = readJobData(job)
  const p = gdMut(g)
  let used = 0
  p.industryYears += 1
  // A teenage tester goes full-time at 18.
  if (job.level === 0 && c.age >= 18 && job.title.includes('Part-Time')) {
    setRole(g, job, 'QA Tester', salaryFor(g, 0, d.tier), 0)
    log(g, `I went full-time as a QA Tester at ${d.studio}.`, 'good')
  }
  earnIncome(g, job.salary)

  // Skills grow on the job.
  if (d.track === 'code') practice(g, 2, bestLanguageFor(g, 'games')?.id ?? null, 1)
  else if (d.track === 'art') trainArt(g, p, 3)
  else if (d.track === 'design') trainDesign(g, p, 3)
  else {
    trainDesign(g, p, 1)
    if (chance(g, 0.4)) trainArt(g, p, 1)
  }
  if (job.level >= 4) trainDesign(g, p, 2)

  // Performance drifts toward how well you fit the role and how hard you worked.
  const L = levelDef(job.level)
  const fit = d.track === 'qa' ? (trackSkill(g, 'qa', p) - 50) / 3 : (trackSkill(g, d.track, p) - L.skill) / 2
  const target = clampN(55 + fit + d.effort * 6 - (p.burnout >= 70 ? 10 : 0) + randInt(g, -8, 8), 0, 100)
  job.performance = Math.round(clampN(job.performance + (target - job.performance) * 0.5, 0, 100))
  d.effort = 0

  // Burnout: every year in the industry costs a little; a quiet year gives some back.
  const crunchedThisYear = d.crunchYear >= g.year - 1
  p.burnout = Math.round(clampN(p.burnout + (crunchedThisYear ? 4 : -8) + (d.tier === 'aaa' ? 2 : 0), 0, 100))

  // The studio's game moves forward.
  if (!d.proj) d.proj = newStudioProject(g, d)
  const proj = d.proj
  const scope = scopeDef(proj.scope)
  proj.progress = clampN(proj.progress + (100 / Math.max(1, scope.years)) * randFloat(g, 0.8, 1.2), 0, 100)
  proj.quality = clampN(proj.quality + LEVEL_WEIGHT[Math.max(0, Math.min(6, job.level))] * ((job.performance - 50) / 12) + randFloat(g, -1, 1.5), 5, 98)
  let release: StudioRelease | null = null
  if (proj.progress >= 100) {
    release = releaseStudioGame(g, job, d, p)
  }
  // Crunch before launch (asked at the end of the year, once we know you still work here).
  const crunchDue = !release && proj.progress >= 65 && chance(g, d.tier === 'aaa' ? 0.55 : d.tier === 'mid' ? 0.4 : 0.25)
  writeJobData(job, d)
  tidy(p)
  if (release && used < budget) {
    used++
    const r = release
    say(
      g,
      'Launch Day',
      `"${r.title}" is out! Critics gave it ${r.critic} on CritiQ and players rate it ${r.players}. It sold ${copiesLabel(r.copies)} in its first year. Your name is in the credits as ${job.title.replace(' (Part-Time)', '')}.${r.critic >= 85 ? ' The studio threw a party with an ice sculpture of the main character.' : r.critic < 55 ? ' The mood in the office is grim. People are updating their CVs.' : ''}`,
      '\u{1F680}',
      r.critic >= 65 ? 'good' : 'bad',
    )
  }

  // Layoffs.
  const mood = industryYear(g).mood
  if (chance(g, layoffChance(job, d, mood, g))) {
    const months = severanceMonths(c.countryId)
    const sev = Math.round((job.salary * clampN(months, 0.5, 12)) / 12)
    const studio = d.studio
    leave(g, 'laid off')
    p.layoffs += 1
    if (sev > 0) earnIncome(g, sev)
    addStat(g, 'happiness', -randInt(g, 6, 12))
    count(g, 'laidOff')
    log(g, `I was laid off from ${studio}.`, 'bad')
    remember(g, `Laid off from ${studio}${mood === 'downturn' ? ' in an industry-wide layoff wave' : ''}.`)
    if (used < budget) {
      used++
      say(g, 'Laid Off', `${mood === 'downturn' ? 'The whole industry is shedding jobs, and' : 'After a rough year,'} ${studio} laid off ${pick(g, ['a fifth of the staff', '200 people', 'the entire team you were on', 'everyone whose name starts with a vowel, apparently'])}, including you. ${sev > 0 ? `Severance: ${money(sev)}.` : 'No severance.'} The CEO posted about "difficult decisions" from a yacht.`, '\u{1F4E6}', 'bad')
    }
    return used
  }

  // Fired for terrible performance.
  if (job.performance < 18) {
    const studio = d.studio
    leave(g, 'fired')
    count(g, 'fired')
    log(g, `I was fired from ${studio}.`, 'bad')
    if (used < budget) {
      used++
      say(g, 'Fired', `${studio} let you go. Your last commit message was "please work". It did not.`, '\u{1F525}', 'bad')
    }
    return used
  }

  // Promotions.
  const promoted = maybePromote(g, job, d, p)
  writeJobData(job, d)
  if (promoted) {
    log(g, `I was promoted to ${promoted} at ${d.studio}.`, 'good')
    remember(g, `Promoted to ${promoted} at ${d.studio}.`)
    addStat(g, 'happiness', 8)
    if (used < budget) {
      used++
      say(g, 'Promoted!', `${d.studio} promoted you to ${promoted}! Your new salary is ${money(job.salary)} a year${job.level >= 4 ? ', and junior devs now ask YOU the questions you used to ask' : ''}.`, '\u{1F389}', 'good')
    }
  }

  if (crunchDue && used < budget) {
    used++
    queueCrunch(g, d)
  }

  // Burnout catches up.
  if (p.burnout >= 80 && used < budget && chance(g, 0.45)) {
    used++
    scriptChoice(g, BURNOUT, 'Burned Out', `You stared at your monitor for an hour and couldn't remember what the game is about. You haven't had a weekend in ${randInt(g, 5, 14)} months.`, [
      { id: 'therapy', label: `See a therapist (${money(localFee(g, 1_200))})`, emoji: '\u{1F6CB}\u{FE0F}' },
      { id: 'push', label: 'Push through', emoji: '\u{1F4AA}' },
      { id: 'leave', label: 'Quit and recover', emoji: '\u{1F343}' },
    ], { emoji: '\u{1FAE0}' })
  } else if (p.burnout >= 60) {
    addStat(g, 'health', -1)
    addStat(g, 'happiness', -2)
    log(g, pick(g, ['I dreamed in bug reports again.', 'I found myself trying to quicksave real life.', 'My chair knows me better than my friends do.']), 'bad')
  }
  return used
}

// ---------------------------------------------------------------------------
// Occupation tab actions

function workHard(g: GameState): void {
  const job = gameJob(g)
  if (!job || blocked(g)) return
  if (!useYearAction(g, 'gamedev.job.work', 2)) return tell(g, 'Work Harder', 'You already put in extra hours twice this year. Any more and you will merge with your chair.', '\u{1FA91}')
  const d = readJobData(job)
  const p = gdMut(g)
  d.effort += 1
  job.performance = Math.round(clampN(job.performance + randInt(g, 3, 7), 0, 100))
  p.burnout = Math.round(clampN(p.burnout + 6, 0, 100))
  if (d.proj) d.proj.quality = clampN(d.proj.quality + LEVEL_WEIGHT[Math.max(0, Math.min(6, job.level))] * 1.5, 0, 98)
  if (d.track === 'code') practice(g, 2, bestLanguageFor(g, 'games')?.id ?? null, 1)
  else if (d.track === 'art') trainArt(g, p, 2)
  else trainDesign(g, p, 2)
  writeJobData(job, d)
  const line =
    d.track === 'qa'
      ? pick(g, ['You found a bug where the horse climbs ladders. Then twelve more.', 'You walked into every wall in the castle level. Three of them let you through.'])
      : d.track === 'code'
        ? pick(g, ['You fixed the crash that only happens on Tuesdays.', 'You got the frame rate up by 20%. The art team bought you a donut.'])
        : d.track === 'art'
          ? pick(g, ['You finished the boss design two days early. It has seven teeth too many and everyone loves it.', 'You repainted the sky. The whole level suddenly feels expensive.'])
          : pick(g, ['You rebalanced the economy so players stop hoarding cheese.', 'You rewrote the tutorial. Playtesters stopped crying.'])
  say(g, 'Extra Hours', `${line} Performance: ${job.performance}%.`, '\u{1F4BB}', 'good')
}

function takeItEasy(g: GameState): void {
  const job = gameJob(g)
  if (!job || blocked(g)) return
  if (!useYearAction(g, 'gamedev.job.easy', 1)) return tell(g, 'Already Chilled', 'You already took it easy this year. Any easier and you would be on vacation.', '\u{1F334}')
  const p = gdMut(g)
  p.burnout = Math.round(clampN(p.burnout - 12, 0, 100))
  job.performance = Math.round(clampN(job.performance - 3, 0, 100))
  addStat(g, 'happiness', 3)
  say(g, 'Logged Off at Five', `You closed the laptop at five, every day, for a month. The game did not collapse. Burnout: ${p.burnout}%.`, '\u{1F305}')
}

function askRaise(g: GameState): void {
  const job = gameJob(g)
  if (!job || blocked(g)) return
  const d = readJobData(job)
  if (d.raiseYear === g.year || !useYearAction(g, 'gamedev.job.raise', 1)) return tell(g, 'Raise', 'You already asked this year. Your producer is avoiding eye contact.', '\u{1F4B0}')
  d.raiseYear = g.year
  if (job.performance >= 65 && chance(g, 0.35 + job.performance / 250)) {
    const pct = randInt(g, 4, 12) / 100
    job.salary = Math.round(job.salary * (1 + pct))
    writeJobData(job, d)
    say(g, 'Raise Approved', `You got a ${Math.round(pct * 100)}% raise. New salary: ${money(job.salary)}. Your producer said "don't tell the others." You told the others.`, '\u{1F4B0}', 'good')
    return
  }
  if (job.performance < 40) job.performance = Math.round(clampN(job.performance - 4, 0, 100))
  writeJobData(job, d)
  say(g, 'Raise Denied', `${pick(g, ['"Budgets are tight this year." They just bought a second espresso machine.', '"We pay in passion here."', '"After the launch," they said, for the third launch in a row.'])}`, '\u{1F4B8}', 'bad')
}

function pitchIdea(g: GameState): void {
  const job = gameJob(g)
  if (!job || blocked(g)) return
  if (!useYearAction(g, 'gamedev.job.pitch', 1)) return tell(g, 'Pitch', 'You already pitched an idea this year.', '\u{1F4A1}')
  const d = readJobData(job)
  const p = gdMut(g)
  const design = designSkill(g, p)
  const odds = clampN(0.1 + design / 200 + job.level * 0.05 + p.gamerFame / 300, 0.05, 0.8)
  const genre = pick(g, GENRES)
  if (chance(g, odds)) {
    const title = gameTitle(g, genre.id, new Set(p.games.map((x) => x.title)))
    const scope = pick(g, TIER_INFO[d.tier].scopes)
    // Your pitch becomes the studio's next game (or replaces a project that barely started).
    if (!d.proj || d.proj.progress < 25) d.proj = { title, genre: genre.id, scope, platform: scope === 'aaa' ? 'multi' : 'pc', progress: 5, quality: Math.min(98, d.craft + Math.max(0, (design - 50) / 5)), crunch: 0, started: g.year }
    job.performance = Math.round(clampN(job.performance + 8, 0, 100))
    addGamerFame(p, 2)
    trainDesign(g, p, 2)
    writeJobData(job, d)
    log(g, `My pitch "${title}" got greenlit at ${d.studio}!`, 'good')
    say(g, 'Greenlit!', `You pitched "${title}", ${articleNoun(genre.noun)}. The room went quiet, then the studio head said "...okay, I'd play that." It's in production${d.proj?.title === title ? ' and you\'re on it' : ' after the current game ships'}.`, '\u{1F4A1}', 'good')
    return
  }
  trainDesign(g, p, 1)
  say(g, 'Pitch Meeting', `You pitched ${articleNoun(genre.noun)} about ${pick(g, ['a lighthouse keeper who is secretly a ghost', 'competitive cheese rolling', 'a dragon with tax problems', 'a heist planned entirely by pigeons'])}. ${pick(g, ['They said "interesting" the way people say it about mushrooms.', 'Marketing asked if it could be a battle royale.', 'They loved it. They will never make it.'])}`, '\u{1F4A1}')
}

function quitJob(g: GameState): void {
  const job = gameJob(g)
  if (!job) return
  const d = readJobData(job)
  const title = job.title
  leave(g, 'quit')
  log(g, `I quit my job as ${title} at ${d.studio}.`)
  say(g, 'Quit', `You quit your job as ${title} at ${d.studio}. Your farewell message in the team chat got ${randInt(g, 20, 140)} emoji reactions and one "who?"`, '\u{1F6AA}')
}

function retireJob(g: GameState): void {
  const job = gameJob(g)
  if (!job) return
  const c = g.character
  const p = gdMut(g)
  const d = readJobData(job)
  const years = p.industryYears
  const title = job.title
  const pension = years >= 10 ? Math.round(job.salary * Math.min(0.4, years * 0.012)) : 0
  leave(g, 'retired')
  c.retired = true
  if (pension > c.pension) c.pension = pension
  log(g, `I retired from the game industry as ${title} at ${d.studio}.`, 'good')
  remember(g, `Retired from games after ${years} years in the industry.`)
  say(g, 'Retired', `You retired as ${title} at ${d.studio} after ${years} years in games.${pension > 0 ? ` Your retirement plan pays ${money(pension)} a year.` : ''} The studio gave you a golden controller. It doesn't work, which feels symbolic.`, '\u{1F3D6}\u{FE0F}', 'good')
}

/** Occupation rows while the player works at a studio. */
export function gameJobNodes(g: GameState): MenuNode[] {
  const job = gameJob(g)
  if (!job) return []
  const d = readJobData(job)
  const p = gdView(g)
  const proj = d.proj
  const nodes: MenuNode[] = [
    {
      type: 'info',
      id: 'gamedev.job.status',
      emoji: '\u{1F3AE}',
      text: `${job.title} at ${d.studio} (${TIER_LABEL[d.tier]}) · ${money(job.salary)}/yr · performance ${job.performance}%`,
    },
    {
      type: 'info',
      id: 'gamedev.job.project',
      emoji: proj ? genreDef(proj.genre).emoji : '\u{1F4A4}',
      text: proj ? `Working on "${proj.title}" (${genreDef(proj.genre).label}, ${scopeDef(proj.scope).label}) · ${Math.round(proj.progress)}% done` : 'Between projects.',
    },
    { type: 'info', id: 'gamedev.job.burnout', emoji: p.burnout >= 70 ? '\u{1F525}' : '\u{1F50B}', text: `Burnout ${p.burnout}% · gamer fame ${p.gamerFame}` },
    { type: 'action', id: 'gamedev.job.work', label: 'Put In Extra Hours', emoji: '\u{1F4BB}', subtitle: (gg) => `${yearActionsUsed(gg, 'gamedev.job.work')}/2 this year · performance up, burnout up`, disabledReason: (gg) => blocked(gg), run: workHard },
    { type: 'action', id: 'gamedev.job.easy', label: 'Log Off at Five', emoji: '\u{1F305}', subtitle: 'Burnout down, performance slightly down', disabledReason: (gg) => blocked(gg), run: takeItEasy },
    {
      type: 'action',
      id: 'gamedev.job.pitch',
      label: 'Pitch a Game Idea',
      emoji: '\u{1F4A1}',
      subtitle: 'Get your concept greenlit',
      visible: () => job.level >= 1,
      disabledReason: (gg) => blocked(gg) ?? (yearActionsUsed(gg, 'gamedev.job.pitch') >= 1 ? 'Once a year.' : null),
      run: pitchIdea,
    },
    { type: 'action', id: 'gamedev.job.raise', label: 'Ask for a Raise', emoji: '\u{1F4B0}', disabledReason: (gg) => blocked(gg) ?? (yearActionsUsed(gg, 'gamedev.job.raise') >= 1 ? 'Once a year.' : null), run: askRaise },
    { ...studioJobsMenu, id: 'gamedev.job.switch', label: 'Look at Other Studios', emoji: '\u{1F50D}', subtitle: 'Openings this year' },
    {
      type: 'action',
      id: 'gamedev.job.retire',
      label: 'Retire',
      emoji: '\u{1F3D6}\u{FE0F}',
      visible: (gg) => gg.character.age >= 55,
      confirm: () => `Retire from the game industry?`,
      run: retireJob,
    },
    { type: 'action', id: 'gamedev.job.quit', label: 'Quit', emoji: '\u{1F6AA}', confirm: () => `Quit your job as ${job.title} at ${d.studio}?`, run: quitJob },
  ]
  return nodes
}

/** Attend the yearly games convention: networking, fame, sometimes a job offer. */
export function attendConvention(g: GameState): void {
  const reason = blocked(g, 14)
  if (reason) return tell(g, CONVENTION, reason, '\u{1F3AA}')
  if (!useYearAction(g, 'gamedev.convention', 1)) return tell(g, CONVENTION, `${CONVENTION} only happens once a year. Your feet are still recovering.`, '\u{1F3AA}')
  const cost = localFee(g, 250)
  if (g.character.money < cost) return tell(g, "Can't Afford It", `A ${CONVENTION} pass costs ${money(cost)}.`, '\u{1F4B8}')
  g.character.money -= cost
  const p = gdMut(g)
  const port = gamePortfolio(g, p)
  const gain = addGamerFame(p, randInt(g, 0, 2) + (port.best >= 80 ? 2 : 0))
  trainDesign(g, p, 1)
  addStat(g, 'happiness', randInt(g, 3, 6))
  const lines = [
    `You waited three hours to play a demo for nine minutes. Worth it.`,
    `You met a famous developer at the bar and told them their game changed your life. They seemed tired but grateful.`,
    `You got a free tote bag, a lanyard, and a cold from 40,000 strangers.`,
    `You watched a publisher's keynote where a CEO said "synergy" eleven times.`,
  ]
  // Sometimes a recruiter likes you.
  const listing = g.character.age >= 16 && !gameJob(g) && chance(g, 0.25 + port.shipped * 0.05) ? jobListings(g).find((l) => !requirementProblem(g, l.level, l.track)) : undefined
  if (listing) {
    setOwnFlag(g, 'gamedev.referral', { year: g.year, studio: listing.studio })
    say(g, CONVENTION, `${pick(g, lines)} A recruiter from ${listing.studio} liked your ${port.shipped ? 'games' : 'enthusiasm'} and told you to apply for their ${listing.title} opening (it's in Studio Jobs). You'll walk into that interview with a referral this year. (Pass: ${money(cost)}.)`, '\u{1F3AA}', 'good')
    return
  }
  say(g, CONVENTION, `${pick(g, lines)}${gain > 0 ? ' A few people recognized your name!' : ''} (Pass: ${money(cost)}.)`, '\u{1F3AA}', 'good')
}

export const careerInternals = { CRUNCH, BURNOUT, INTERVIEW, releaseStudioGame, maybePromote, applyTo, workHard, takeItEasy, askRaise, pitchIdea, quitJob, retireJob, hasReferral }
