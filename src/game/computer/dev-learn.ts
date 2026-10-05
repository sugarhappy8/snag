// Learning to code at home: free tutorials, paid online courses, a coding bootcamp (16+), a
// coding camp for kids, coding contests and hackathons; and, before any of that, getting a
// computer (asking your parents, or a used laptop off the local classifieds).
import { electronicsStoreMenu, localGoodsMult, nicePrice, seeded, yearKey } from '../assets'
import { addHidden, addRelationship, addStat, count, formatMoney, log, notice, pronouns, remember, spend, useYearAction, yearActionsUsed } from '../core'
import { fillLocal } from '../data/locales'
import { createPerson } from '../people'
import { chance, pick, randFloat, randInt, uid } from '../rng'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { getCountry } from '../world'
import { ageBlock, computerBlock, earnNow, firstReason, guardians, lifeBlock, paidLine, parentWord, payFor, taxLine, useComputer } from './dev-common'
import { between, localFee, localNameWords, onlinePrice, withDev, type DevAward } from './dev-state'
import {
  addCodingSkill,
  addLanguageXp,
  bestLanguageFor,
  codingCeiling,
  codingSkill,
  codingSkillLabel,
  CODING_LANGUAGES,
  getLanguage,
  knownLanguages,
  languageLevel,
  markCoded,
  type CodingLanguage,
} from './skills'

// ---------------------------------------------------------------------------
// Skill gain

/** How quickly you learn: smarts and discipline, plus the Programming talent. */
export function aptitude(g: GameState): number {
  const c = g.character
  return (0.45 + (c.stats.smarts / 100) * 0.55 + (c.hidden.discipline / 100) * 0.35) * (c.talent === 'Programming' ? 1.3 : 1)
}

/**
 * Practice coding: raises overall skill (diminishing returns, capped by age) and a language.
 * Returns the skill and language gains actually applied.
 */
export function practice(g: GameState, base: number, langId: string | null, langMult = 2.2): { skill: number; lang: number } {
  const c = g.character
  const before = codingSkill(g)
  const ceiling = codingCeiling(c.age)
  const lang = langId ? getLanguage(langId) : undefined
  const apt = aptitude(g)
  const room = Math.pow(Math.max(0, 1 - before / 110), 1.3)
  // Scratch teaches the basics; it stops helping once you know them.
  const scratchCap = lang?.id === 'scratch' && before >= 25 ? 0.25 : 1
  const diff = lang ? 1 - lang.difficulty * 0.3 : 1
  const raw = base * apt * room * diff * scratchCap * randFloat(g, 0.75, 1.2)
  const gain = Math.max(0, Math.min(Math.round(raw), Math.max(0, ceiling - before)))
  if (gain > 0) addCodingSkill(g, gain)
  let langGain = 0
  if (lang) {
    const lvl = languageLevel(g, lang.id)
    const lroom = Math.max(0, 1 - lvl / 105)
    const lcap = Math.max(0, Math.min(100, ceiling + 10) - lvl)
    langGain = Math.max(1, Math.min(lcap, Math.round(base * langMult * apt * lroom * (1 - lang.difficulty * 0.35) * randFloat(g, 0.8, 1.2))))
    if (lcap <= 0) langGain = 0
    if (langGain > 0) addLanguageXp(g, lang.id, langGain)
  }
  markCoded(g)
  return { skill: gain, lang: langGain }
}

function skillLine(g: GameState, before: number, lang: CodingLanguage | undefined, gains: { skill: number; lang: number }): string {
  const after = codingSkill(g)
  const parts: string[] = []
  if (lang) parts.push(gains.lang > 0 ? `${lang.label}: ${languageLevel(g, lang.id) - gains.lang} → ${languageLevel(g, lang.id)}.` : `Your ${lang.label} didn't improve much.`)
  parts.push(gains.skill > 0 ? `Coding skill: ${before} → ${after} (${codingSkillLabel(after)}).` : after >= codingCeiling(g.character.age) ? `Coding skill: ${after}. You've learned about all a ${g.character.age}-year-old brain can hold for now.` : `Coding skill: ${after} (${codingSkillLabel(after)}). Diminishing returns are real.`)
  return parts.join(' ')
}

function languagesFor(g: GameState): CodingLanguage[] {
  const age = g.character.age
  return CODING_LANGUAGES.filter((l) => age >= l.minAge && (l.maxAge === undefined || age <= l.maxAge))
}

// ---------------------------------------------------------------------------
// Tutorials, courses, bootcamp, camp

const TUTORIAL_SITES = ['CodeCub', 'ByteSized', 'CodeCove', 'a video series by a guy who types very loudly', 'a free course with a suspiciously cheerful narrator']
const COURSE_SITES = ['LearnLoop', 'SkillShelf', 'CourseCrate']

const TUTORIAL_LINES = [
  'You followed a tutorial step by step. It worked on the first try, which made you deeply suspicious.',
  'You spent three hours on a missing semicolon. You will never forget that semicolon.',
  'You copied the code exactly, it broke, and fixing it taught you more than the tutorial did.',
  'The tutorial was from 2014. Half of it no longer exists. You learned resilience.',
  'You built a to-do list app. You have nothing to do. It was still satisfying.',
]

const COURSE_QUIT_LINES = [
  'You watched the first video, then forty videos about cats. Your progress bar is at 3%.',
  'You bought the course, felt very productive about buying the course, and never opened it.',
]

function studyTutorial(g: GameState, langId: string): void {
  const lang = getLanguage(langId)
  if (!lang) return
  const reason = firstReason(computerBlock(g))
  if (reason) return notice(g, 'Coding', reason, { emoji: '\u{1F4BB}' })
  if (!useYearAction(g, 'computer.dev.tutorial', 3)) {
    return notice(g, 'Free Tutorials', "You've already done three tutorials this year. Your brain needs time to compile.", { emoji: lang.emoji })
  }
  const before = codingSkill(g)
  const gains = practice(g, 4, lang.id)
  useComputer(g, 1)
  if (chance(g, 0.3)) addStat(g, 'smarts', 1)
  addStat(g, 'happiness', randInt(g, -1, 2))
  count(g, 'codingSessions')
  log(g, `I learned some ${lang.label} from free online tutorials.`, 'good')
  notice(g, `${lang.label} Tutorials`, `You worked through free ${lang.label} tutorials on ${pick(g, TUTORIAL_SITES)}. ${pick(g, TUTORIAL_LINES)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: lang.emoji, tone: 'good' })
}

export function courseCost(g: GameState): number {
  return onlinePrice(g, 60)
}

function takeCourse(g: GameState, langId: string): void {
  const lang = getLanguage(langId)
  if (!lang) return
  const reason = firstReason(computerBlock(g))
  if (reason) return notice(g, 'Coding', reason, { emoji: '\u{1F4BB}' })
  if (yearActionsUsed(g, 'computer.dev.course') >= 2) {
    return notice(g, 'Online Courses', "You've taken two courses this year. Any more and you'll start dreaming in syntax errors.", { emoji: lang.emoji })
  }
  const cost = courseCost(g)
  const site = pick(g, COURSE_SITES)
  const who = payFor(g, cost, `A ${lang.label} course on ${site}`, { emoji: lang.emoji })
  if (!who) return
  useYearAction(g, 'computer.dev.course', 2)
  useComputer(g, 2)
  const c = g.character
  const before = codingSkill(g)
  if (chance(g, between(0.3 - c.hidden.discipline / 300, 0.04, 0.3))) {
    const gains = practice(g, 1.5, lang.id, 1.5)
    log(g, `I signed up for a ${lang.label} course and mostly didn't do it.`, 'bad')
    notice(g, 'Course Abandoned', `${pick(g, COURSE_QUIT_LINES)}${paidLine(who, cost)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: lang.emoji, tone: 'bad' })
    return
  }
  const gains = practice(g, 7, lang.id)
  addStat(g, 'smarts', randInt(g, 0, 2))
  addHidden(g, 'discipline', 1)
  count(g, 'codingCourses')
  withDev(g, (s) => {
    const title = `${lang.label} course certificate`
    if (!s.certs.some((x) => x.title === title)) s.certs.push({ title, org: site, age: c.age, strength: between(2 + Math.round(lang.difficulty * 3), 2, 5) })
  })
  log(g, `I completed an online ${lang.label} course.`, 'good')
  notice(g, `${lang.label} Course`, `You finished ${/^(HTML|SQL)/.test(lang.label) ? 'an' : 'a'} ${lang.label} course on ${site} and got a certificate with your name spelled almost right.${paidLine(who, cost)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: '\u{1F393}', tone: 'good' })
}

interface Track {
  id: string
  label: string
  emoji: string
  langs: string[]
}

const BOOTCAMP_TRACKS: Track[] = [
  { id: 'web', label: 'Full-Stack Web Development', emoji: '\u{1F310}', langs: ['javascript', 'html', 'sql'] },
  { id: 'mobile', label: 'Mobile App Development', emoji: '\u{1F4F1}', langs: ['swift', 'javascript'] },
  { id: 'data', label: 'Data Science', emoji: '\u{1F4CA}', langs: ['python', 'sql'] },
  { id: 'games', label: 'Game Development', emoji: '\u{1F3AE}', langs: ['cpp', 'lua'] },
]

export function bootcampCost(g: GameState): number {
  return localFee(g, 13_000)
}

function bootcampName(g: GameState): string {
  const words = localNameWords(g)
  const word = words.length ? words[Math.abs(g.character.city.length * 7 + g.character.countryId.charCodeAt(0)) % words.length] : ''
  return word ? `${word} Code Academy` : `${g.character.city} Coding Bootcamp`
}

function bootcamp(g: GameState, track: Track): void {
  const c = g.character
  const reason = firstReason(computerBlock(g), ageBlock(g, 16, 'join a coding bootcamp'))
  if (reason) return notice(g, 'Coding Bootcamp', reason, { emoji: track.emoji })
  if (yearActionsUsed(g, 'computer.dev.bootcamp') >= 1) {
    return notice(g, 'Coding Bootcamp', 'One bootcamp a year is plenty. The last one still haunts your dreams.', { emoji: track.emoji })
  }
  const cost = bootcampCost(g)
  const school = bootcampName(g)
  const who = payFor(g, cost, `${school}'s ${track.label} bootcamp`, { emoji: track.emoji })
  if (!who) return
  useYearAction(g, 'computer.dev.bootcamp', 1)
  useComputer(g, 4)
  const before = codingSkill(g)
  const gains = practice(g, 22, track.langs[0])
  for (const l of track.langs.slice(1)) practice(g, 6, l, 2)
  addStat(g, 'smarts', randInt(g, 1, 3))
  addStat(g, 'happiness', -randInt(g, 1, 4))
  addStat(g, 'health', -randInt(g, 0, 2))
  addHidden(g, 'discipline', randInt(g, 1, 3))
  const cur = c.education.current
  if (cur && cur.level !== 'preschool') cur.grades = Math.round(between(cur.grades - randInt(g, 2, 6), 0, 100))
  count(g, 'bootcamps')
  withDev(g, (s) => {
    s.certs.push({ title: `Coding bootcamp: ${track.label}`, org: school, age: c.age, strength: 5 })
  })
  remember(g, `Graduated from ${school}'s ${track.label} bootcamp.`)
  log(g, `I graduated from a ${track.label.toLowerCase()} bootcamp at ${school}.`, 'good')
  const langs = track.langs.map((l) => getLanguage(l)?.label ?? l).join(', ')
  notice(
    g,
    'Bootcamp Graduate',
    `Twelve weeks, ${randInt(g, 70, 95)} hours a week, ${randInt(g, 300, 900)} cups of ${pick(g, ['coffee', 'tea', 'energy drinks'])}. You graduated from ${school}'s ${track.label} bootcamp (${langs}). The instructor called your capstone project "ambitious," which is instructor for "it crashed during the demo."${paidLine(who, cost)}\n\n${skillLine(g, before, getLanguage(track.langs[0]), gains)}`,
    { emoji: '\u{1F393}', tone: 'good' },
  )
}

export function campCost(g: GameState): number {
  return localFee(g, 450)
}

const CAMP_LINES = [
  'You programmed a robot to draw a square. It drew a sad potato. Everyone clapped.',
  'You made a game where a cat dodges homework. A counselor asked for your autograph.',
  'You learned what a loop is, then made your character jump forever. Best day of your life.',
  'Lunch was terrible. The coding was incredible.',
]

function codingCamp(g: GameState): void {
  const c = g.character
  const reason = firstReason(computerBlock(g))
  if (reason) return notice(g, 'Coding Camp', reason, { emoji: '\u{1F3D5}\u{FE0F}' })
  if (c.age > 15) return notice(g, 'Coding Camp', "You're too old for kids' coding camp. The counselors would ask you to be a counselor.", { emoji: '\u{1F3D5}\u{FE0F}' })
  if (yearActionsUsed(g, 'computer.dev.camp') >= 1) return notice(g, 'Coding Camp', 'Camp only runs once a year. You already went!', { emoji: '\u{1F3D5}\u{FE0F}' })
  const cost = campCost(g)
  const camp = fillLocal(g, pick(g, ['{city} Young Coders Camp', '{place} Code Club Summer Camp', 'Little Hackers Camp in {city}']))
  const who = payFor(g, cost, camp, { emoji: '\u{1F3D5}\u{FE0F}' })
  if (!who) return
  useYearAction(g, 'computer.dev.camp', 1)
  useComputer(g, 1)
  const langId = c.age <= 11 ? 'scratch' : chance(g, 0.5) ? 'python' : 'scratch'
  const before = codingSkill(g)
  const gains = practice(g, 6, langId)
  addStat(g, 'happiness', randInt(g, 3, 7))
  addStat(g, 'smarts', randInt(g, 0, 1))
  let friendLine = ''
  if (chance(g, 0.4)) {
    const gender = chance(g, 0.5) ? 'male' : 'female'
    const f = createPerson(g, { relation: 'friend', age: Math.max(7, c.age + randInt(g, -1, 1)), gender, relationship: randInt(g, 55, 80) })
    f.notes.push(`Met at ${camp}.`)
    friendLine = ` You also made a friend, ${f.firstName}, who agrees that semicolons are hilarious.`
  }
  withDev(g, (s) => {
    if (!s.certs.some((x) => x.title === 'Coding camp')) s.certs.push({ title: 'Coding camp', org: camp, age: c.age, strength: 2 })
  })
  log(g, `I went to ${camp}.`, 'good')
  notice(g, 'Coding Camp', `You spent a week at ${camp}. ${pick(g, CAMP_LINES)}${friendLine}${paidLine(who, cost)}\n\n${skillLine(g, before, getLanguage(langId), gains)}`, { emoji: '\u{1F3D5}\u{FE0F}', tone: 'good' })
}

function langAction(lang: CodingLanguage, prefix: string, run: (g: GameState, id: string) => void, cost?: (g: GameState) => number): MenuAction {
  return {
    type: 'action',
    id: `${prefix}.${lang.id}`,
    label: lang.label,
    emoji: lang.emoji,
    subtitle: (g) => `${languageLevel(g, lang.id) > 0 ? `Level ${languageLevel(g, lang.id)}` : 'New'} · ${lang.good}${cost ? ` · ${formatMoney(cost(g))}` : ''}`,
    visible: (g) => g.character.age >= lang.minAge && (lang.maxAge === undefined || g.character.age <= lang.maxAge),
    disabledReason: computerBlock,
    run: (g) => run(g, lang.id),
  }
}

export const learnMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.learn',
  label: 'Learn to Code',
  emoji: '\u{1F468}\u{200D}\u{1F4BB}',
  subtitle: (g) => {
    const s = codingSkill(g)
    const langs = knownLanguages(g).slice(0, 3)
    return s > 0 ? `Skill ${s}/100 (${codingSkillLabel(s)})${langs.length ? ` · ${langs.join(', ')}` : ''}` : 'Tutorials, courses, bootcamps and camps'
  },
  disabledReason: computerBlock,
  header: (g) => {
    const s = codingSkill(g)
    const langs = knownLanguages(g, 1)
    return `Coding skill: ${s}/100 (${codingSkillLabel(s)}).${langs.length ? ` You know ${langs.join(', ')}.` : " You haven't written a single line yet."}`
  },
  children: (g) => {
    const langs = languagesFor(g)
    const nodes: MenuNode[] = [
      {
        type: 'menu',
        id: 'computer.dev.learn.tutorials',
        label: 'Free Online Tutorials',
        emoji: '\u{1F4FA}',
        subtitle: (gg) => `Free · ${yearActionsUsed(gg, 'computer.dev.tutorial')}/3 this year`,
        disabledReason: computerBlock,
        header: () => 'Pick a language. Free, slow and occasionally out of date.',
        children: () => langs.map((l) => langAction(l, 'computer.dev.tut', studyTutorial)),
      },
      {
        type: 'menu',
        id: 'computer.dev.learn.courses',
        label: 'Paid Online Course',
        emoji: '\u{1F4DA}',
        subtitle: (gg) => `${formatMoney(courseCost(gg))} · ${yearActionsUsed(gg, 'computer.dev.course')}/2 this year`,
        disabledReason: computerBlock,
        header: (gg) => `A structured course with exercises and a certificate. ${formatMoney(courseCost(gg))} each (regional pricing).`,
        children: () => langs.filter((l) => l.id !== 'scratch').map((l) => langAction(l, 'computer.dev.course', takeCourse, courseCost)),
      },
      {
        type: 'menu',
        id: 'computer.dev.learn.bootcamp',
        label: 'Coding Bootcamp',
        emoji: '\u{1F525}',
        subtitle: (gg) => `${formatMoney(bootcampCost(gg))} · 12 intense weeks · age 16+`,
        visible: (gg) => gg.character.age >= 14,
        disabledReason: (gg) => firstReason(computerBlock(gg), ageBlock(gg, 16, 'join a coding bootcamp')),
        header: (gg) => `${bootcampName(gg)}: twelve weeks that will either make you a developer or make you cry. Usually both. ${formatMoney(bootcampCost(gg))}.`,
        children: () =>
          BOOTCAMP_TRACKS.map(
            (t): MenuAction => ({
              type: 'action',
              id: `computer.dev.bootcamp.${t.id}`,
              label: t.label,
              emoji: t.emoji,
              subtitle: t.langs.map((l) => getLanguage(l)?.label ?? l).join(' · '),
              disabledReason: (gg) => firstReason(computerBlock(gg), ageBlock(gg, 16, 'join a coding bootcamp')),
              confirm: (gg) => `Enroll in the ${t.label} bootcamp for ${formatMoney(bootcampCost(gg))}?`,
              run: (gg) => bootcamp(gg, t),
            }),
          ),
      },
      {
        type: 'action',
        id: 'computer.dev.camp',
        label: 'Coding Camp for Kids',
        emoji: '\u{1F3D5}\u{FE0F}',
        subtitle: (gg) => `${formatMoney(campCost(gg))} · ages 8-15 · robots, games, snacks`,
        visible: (gg) => gg.character.age <= 15,
        disabledReason: computerBlock,
        run: codingCamp,
      },
    ]
    return nodes
  },
}

// ---------------------------------------------------------------------------
// Contests & hackathons

interface CompDef {
  id: string
  label: string
  emoji: string
  minAge: number
  maxAge?: number
  /** Extra score needed to place (harder competitions). */
  bar: number
  /** Prize money for 1st/2nd/3rd in US dollars. */
  prizes: number[]
  /** CV strength for 1st/2nd/3rd/finalist. */
  strengths: number[]
  /** What kind of code it rewards. */
  use: string
  local: boolean
  name: (g: GameState) => string
}

const HACK_THEMES = ['climate', 'public transit in {city}', 'pet adoption', 'fixing school lunches', 'accessibility', 'small farmers', 'mental health', 'disaster relief', 'saving {landmark}']

const COMPETITIONS: CompDef[] = [
  { id: 'contest', label: 'Online Coding Contest', emoji: '\u{2328}\u{FE0F}', minAge: 12, bar: 0, prizes: [250, 100, 50], strengths: [5, 4, 3, 2], use: 'data', local: false, name: () => 'the CodeDuel Monthly Challenge' },
  { id: 'gamejam', label: '48-Hour Game Jam', emoji: '\u{1F3AE}', minAge: 12, bar: 0, prizes: [500, 200, 100], strengths: [6, 5, 4, 3], use: 'games', local: false, name: (g) => `the ${pick(g, ['Pixel Panic', 'Midnight Sprite', 'Jamboree'])} 48-Hour Game Jam` },
  { id: 'olympiad', label: 'Olympiad in Informatics', emoji: '\u{1F947}', minAge: 13, maxAge: 19, bar: 12, prizes: [0, 0, 0], strengths: [8, 7, 6, 4], use: 'data', local: true, name: (g) => { const k = getCountry(g.character.countryId); return `the ${k.demonym || k.name} Olympiad in Informatics` } },
  { id: 'hackathon', label: 'Hackathon', emoji: '\u{1F9D1}\u{200D}\u{1F4BB}', minAge: 14, bar: 6, prizes: [4_000, 1_500, 750], strengths: [7, 6, 5, 3], use: 'web', local: true, name: (g) => fillLocal(g, `the ${g.character.city} Hackathon for ${pick(g, HACK_THEMES)}`) },
]

/** 1st, 2nd, 3rd, 4th... 11th, 12th, 13th... 21st. */
function ordinal(n: number): string {
  const v = Math.abs(Math.round(n))
  const teen = v % 100 >= 11 && v % 100 <= 13
  const suffix = teen ? 'th' : v % 10 === 1 ? 'st' : v % 10 === 2 ? 'nd' : v % 10 === 3 ? 'rd' : 'th'
  return `${v}${suffix}`
}

const NO_PLACE = [
  'You placed {n} out of {m}. Your code compiled, which is more than some people can say.',
  'Your solution worked perfectly on every test except the ones that counted.',
  'You spent the first hour setting up your keyboard lighting. You never recovered.',
  'Your team argued about tabs versus spaces until time ran out.',
]

function compete(g: GameState, def: CompDef): void {
  const c = g.character
  const reason = firstReason(computerBlock(g), ageBlock(g, def.minAge, `enter the ${def.label.toLowerCase()}`))
  if (reason) return notice(g, def.label, reason, { emoji: def.emoji })
  if (def.maxAge !== undefined && c.age > def.maxAge) return notice(g, def.label, `It's for students up to ${def.maxAge}. You've aged out.`, { emoji: def.emoji })
  if (!useYearAction(g, 'computer.dev.comp', 2)) return notice(g, 'Competitions', "You've entered two competitions this year. Your keyboard needs a rest.", { emoji: def.emoji })
  useComputer(g, 2)
  const name = def.name(g)
  const best = bestLanguageFor(g, def.use)
  const score = codingSkill(g) * 0.75 + c.stats.smarts * 0.2 + c.hidden.discipline * 0.1 + (best ? best.level * 0.12 : 0) + (c.talent === 'Programming' ? 8 : 0) + randInt(g, -22, 22) - def.bar
  practice(g, 2, best?.id ?? null, 1)
  count(g, 'codingCompetitions')
  const placed: number = score >= 92 ? 0 : score >= 80 ? 1 : score >= 70 ? 2 : score >= 58 ? 3 : -1
  if (placed < 0) {
    addStat(g, 'happiness', -randInt(g, 1, 4))
    const m = randInt(g, 40, 900)
    log(g, `I competed in ${name} and didn't place.`, 'bad')
    notice(g, def.label, `You competed in ${name}. ${pick(g, NO_PLACE).replace('{n}', ordinal(randInt(g, Math.floor(m / 3), m - 1))).replace('{m}', String(m))}`, { emoji: def.emoji, tone: 'bad' })
    return
  }
  const place = between(placed, 0, 3)
  const olympiad = def.id === 'olympiad'
  const titles = olympiad ? ['Gold Medal', 'Silver Medal', 'Bronze Medal', 'Honorable Mention'] : ['1st Place', '2nd Place', '3rd Place', 'Finalist']
  let title = `${titles[place]}, ${def.label}`
  let strength: number = def.strengths[place] ?? 3
  let extra = ''
  if (olympiad && place === 0 && chance(g, 0.35)) {
    title = 'National Team, International Olympiad in Informatics'
    strength = 9
    extra = ' You were picked for the national team at the International Olympiad in Informatics! Your school put your face on a banner. It is not a flattering photo.'
    addHidden(g, 'fame', randInt(g, 1, 3))
  }
  const prizeUsd: number = place <= 2 ? (def.prizes[place] ?? 0) : 0
  const prize = prizeUsd > 0 ? (def.local ? localFee(g, prizeUsd) : onlinePrice(g, prizeUsd)) : 0
  const tax = prize > 0 ? earnNow(g, prize) : 0
  addStat(g, 'happiness', randInt(g, 3, 8))
  addStat(g, 'smarts', randInt(g, 0, 1))
  const detail = olympiad ? (strength >= 9 ? 'Selected for the international olympiad' : 'National olympiad') : place === 3 ? 'Made the final round' : 'Podium finish'
  const award: DevAward = { title, org: name.replace(/^the /, ''), age: c.age, strength, detail }
  withDev(g, (s) => {
    s.awards.push(award)
  })
  if (place === 0) remember(g, `Won ${titles[0].toLowerCase()} at ${name}.`)
  if (def.id === 'hackathon' && place === 0 && c.age >= 16) extra += ' A suit in the audience handed you a business card that just says "Let\'s talk." You could turn this into a real startup.'
  log(g, `I took ${titles[place].toLowerCase()} at ${name}.`, 'good')
  const hype = place === 0 ? pick(g, ['You won! The trophy is shaped like a keyboard and you love it.', 'You won! Your victory dance was captured on the livestream.']) : place === 3 ? (olympiad ? 'An honorable mention. Honorable!' : 'You made the final. Very CV-able.') : `You placed ${titles[place].toLowerCase()}!`
  notice(g, def.label, `You competed in ${name}. ${hype}${extra}${prize > 0 ? ` Prize: ${formatMoney(prize)}.${taxLine(tax)}` : ''}`, { emoji: '\u{1F3C6}', tone: 'good' })
}

export const competitionsMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.competitions',
  label: 'Contests & Hackathons',
  emoji: '\u{1F3C6}',
  subtitle: (g) => `Coding contests, game jams, olympiads · ${yearActionsUsed(g, 'computer.dev.comp')}/2 this year`,
  visible: (g) => g.character.age >= 12,
  disabledReason: computerBlock,
  header: (g) => `Your coding skill is ${codingSkill(g)}/100. The kid who wins these every year is 11 and terrifying.`,
  children: () =>
    COMPETITIONS.map(
      (d): MenuAction => ({
        type: 'action',
        id: `computer.dev.comp.${d.id}`,
        label: d.label,
        emoji: d.emoji,
        subtitle: (g) => {
          const p = d.prizes[0] > 0 ? `Top prize ${formatMoney(d.local ? localFee(g, d.prizes[0]) : onlinePrice(g, d.prizes[0]))}` : 'Medals and glory'
          return `${p} · age ${d.minAge}${d.maxAge ? `-${d.maxAge}` : '+'}`
        },
        visible: (g) => g.character.age >= Math.min(12, d.minAge) && (d.maxAge === undefined || g.character.age <= d.maxAge),
        disabledReason: (g) => firstReason(computerBlock(g), ageBlock(g, d.minAge, `enter the ${d.label.toLowerCase()}`)),
        run: (g) => compete(g, d),
      }),
    ),
}

// ---------------------------------------------------------------------------
// No computer: ask your parents, or buy a used laptop

export function laptopPrice(g: GameState): number {
  return nicePrice(1_300 * localGoodsMult(g, 'electronics'))
}

function giveComputer(g: GameState, name: string, price: number, condition: number, details: Record<string, string | boolean>): Asset {
  const a: Asset = {
    id: uid(g, 'a'),
    kind: 'other',
    name,
    emoji: '\u{1F4BB}',
    purchasePrice: price,
    value: Math.max(5, nicePrice(price * 0.6 * (condition / 100))),
    condition,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: { category: 'electronics', isNew: condition >= 100, insured: false, ...details },
  }
  g.assets.push(a)
  return a
}

const REFUSALS: Record<string, string[]> = {
  poor: ['"We can\'t afford one right now, sweetie. Maybe next year."', '"Do you know what those cost? Do you know what RENT costs?"', '"The library has computers. And they\'re free. Like the air."'],
  grades: [`"Bring your grades up first. Then we'll talk."`, '"A computer? With THOSE grades? You\'ll just play games on it."'],
  relationship: ['"After what you did to the microwave? Absolutely not."', '"Ask me again when you start clearing your plate."'],
  young: ['"You\'re too young. Maybe when you\'re older."', '"You can use mine. Supervised. With the parental controls on."'],
  generic: ['"We\'ll see." (This means no.)', '"Maybe for your birthday." (Your birthday came and went.)'],
}

/** Ask your parents to buy you a computer. Decided by their money, your relationship and your grades. */
export function askParentsForComputer(g: GameState): void {
  const c = g.character
  const reason = firstReason(lifeBlock(g))
  if (reason) return notice(g, 'Ask for a Computer', reason, { emoji: '\u{1F4BB}' })
  const ps = guardians(g)
  if (c.age >= 18 || ps.length === 0) return notice(g, 'Ask for a Computer', ps.length === 0 ? "There's nobody to ask." : "You're an adult. Buy your own computer.", { emoji: '\u{1F4BB}' })
  if (!useYearAction(g, 'computer.dev.askParents', 1)) return notice(g, 'Ask for a Computer', `You already asked this year. They said they'd "think about it."`, { emoji: '\u{1F4BB}' })
  const asks = withDev(g, (s) => ++s.asks)
  const price = laptopPrice(g)
  const lastGift = g.flags.devParentLaptopAge
  if (typeof lastGift === 'number' && c.age - lastGift < 5) {
    addStat(g, 'happiness', -randInt(g, 1, 3))
    log(g, 'I asked my parents for another computer. They asked what happened to the last one.', 'bad')
    return notice(g, 'Ask for a Computer', `"We bought you one ${c.age - lastGift <= 1 ? 'last year' : `${c.age - lastGift} years ago`}. What happened to it?" You did not have a good answer.`, { emoji: '\u{1F928}' })
  }
  const budget = ps.reduce((s, p) => s + Math.max(0, p.money), 0)
  const rel = ps.reduce((s, p) => s + p.relationship, 0) / ps.length
  const cur = c.education.current
  const grades = cur && cur.level !== 'preschool' ? cur.grades : 65
  const score = (rel / 100) * 0.4 + between(budget / (price * 8), 0, 1) * 0.45 + ((grades - 50) / 100) * 0.3 + (c.age >= 12 ? 0.05 : -0.05) - Math.min(0.15, (asks - 1) * 0.04) + randFloat(g, -0.12, 0.12)
  const payer = ps.reduce((a, b) => (b.money > a.money ? b : a))
  const who = parentWord(payer)
  const Who = who.charAt(0).toUpperCase() + who.slice(1)
  if (budget >= price * 4 && score >= 0.55) {
    payer.money = Math.round(payer.money - price)
    addRelationship(payer, 2)
    giveComputer(g, 'Laptop', price, 100, { gift: 'parents' })
    g.flags.devParentLaptopAge = c.age
    addStat(g, 'happiness', randInt(g, 8, 14))
    count(g, 'gotComputer')
    log(g, `${Who} bought me a laptop!`, 'good')
    remember(g, `${Who} bought me my first laptop.`)
    const x = pronouns(payer.gender)
    notice(g, 'New Laptop!', `${Who} bought you a brand-new laptop (${formatMoney(price)})! ${pick(g, [`"It's for SCHOOLWORK," ${x.he} said, twice.`, '"If I see one virus on it, it goes in the garage."', `${x.He} set the parental controls to "maximum." You found the off switch in four minutes.`])}\n\nActivities › Computer is now open.`, { emoji: '\u{1F4BB}', tone: 'good' })
    return
  }
  if (budget >= price * 0.25 && score >= 0.35) {
    const condition = randInt(g, 30, 55)
    addRelationship(payer, 1)
    giveComputer(g, 'Hand-Me-Down Laptop', Math.round(price * 0.2), condition, { gift: 'parents', handMeDown: true })
    // Old laptops die young: they'll consider another one in about three years.
    g.flags.devParentLaptopAge = c.age - 2
    addStat(g, 'happiness', randInt(g, 4, 8))
    count(g, 'gotComputer')
    log(g, `${Who} gave me an old laptop.`, 'good')
    notice(g, 'Hand-Me-Down Laptop', `${Who} dug out an old laptop. ${pick(g, ['It has a sticker of a band nobody remembers and a battery that lasts eleven minutes.', 'It takes four minutes to boot and sounds like a jet engine. It is yours.', 'The "E" key is missing. You will write very carefully.'])} Condition: ${condition}%.\n\nActivities › Computer is now open.`, { emoji: '\u{1F4BB}', tone: 'good' })
    return
  }
  const why = budget < price * 0.25 ? 'poor' : grades < 50 ? 'grades' : rel < 45 ? 'relationship' : c.age < 11 ? 'young' : 'generic'
  addStat(g, 'happiness', -randInt(g, 1, 4))
  log(g, 'I asked my parents for a computer. They said no.', 'bad')
  notice(g, 'Ask for a Computer', `You asked ${who} for a computer. ${pick(g, REFUSALS[why])}${why === 'poor' && c.age >= 12 ? ' You could save up for a used one.' : ''}`, { emoji: '\u{1F645}' })
}

interface UsedLaptop {
  price: number
  condition: number
  seller: string
  dud: boolean
}

/** This year's used laptop on the local classifieds (stable all year, no g.rng). */
export function usedLaptopListing(g: GameState): UsedLaptop {
  const r = seeded(yearKey(g, 'dev.usedLaptop'))
  const price = nicePrice(1_300 * localGoodsMult(g, 'electronics') * r.float(0.16, 0.28))
  const condition = r.int(30, 70)
  const seller = r.pick(['a guy who "just upgraded"', 'a student moving abroad', 'a man named Gary', 'a retired teacher', 'someone with 2,000 five-star reviews', 'someone with no reviews at all'])
  return { price, condition, seller, dud: r.chance(0.12) }
}

function classifiedsName(g: GameState): string {
  return `the ${g.character.city} Buy & Sell board`
}

function buyUsedLaptop(g: GameState): void {
  const c = g.character
  const reason = firstReason(lifeBlock(g), ageBlock(g, 12, 'buy things online'))
  if (reason) return notice(g, 'Used Laptop', reason, { emoji: '\u{1F4BB}' })
  if (g.flags.devUsedLaptopYear === g.year) return notice(g, 'Used Laptop', 'That listing is gone. Check again next year.', { emoji: '\u{1F4BB}' })
  const l = usedLaptopListing(g)
  if (!spend(g, l.price)) return notice(g, 'Used Laptop', `It costs ${formatMoney(l.price)} and you have ${formatMoney(Math.max(0, c.money))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  g.flags.devUsedLaptopYear = g.year
  count(g, 'purchases')
  if (l.dud) {
    addStat(g, 'happiness', -randInt(g, 4, 8))
    log(g, `I bought a used laptop off ${classifiedsName(g)}. It was a brick.`, 'bad')
    notice(g, 'Scammed', `You met ${l.seller} in a parking lot and paid ${formatMoney(l.price)} for a used laptop. At home you opened it. It was a laptop-shaped brick of plastic with a rock inside. The seller's account has vanished.`, { emoji: '\u{1F9F1}', tone: 'bad' })
    return
  }
  giveComputer(g, 'Used Laptop', l.price, l.condition, { bought: 'classifieds' })
  addStat(g, 'happiness', randInt(g, 3, 6))
  log(g, `I bought a used laptop off ${classifiedsName(g)}.`, 'good')
  notice(g, 'Used Laptop', `You bought a used laptop from ${l.seller} for ${formatMoney(l.price)}. Condition ${l.condition}%. ${pick(g, ['It smells faintly of fries.', 'The previous owner left a desktop wallpaper of their cat. You kept it.', 'The fan sounds like a tiny helicopter. It works.'])}\n\nActivities › Computer is now open.`, { emoji: '\u{1F4BB}', tone: 'good' })
}

/** Rows shown in Activities › Computer when there's no computer. */
export function getAComputerNodes(g: GameState): MenuNode[] {
  const c = g.character
  const nodes: MenuNode[] = []
  if (c.age < 18 && guardians(g).length > 0) {
    nodes.push({
      type: 'action',
      id: 'computer.dev.askParents',
      label: 'Ask Your Parents for a Computer',
      emoji: '\u{1F64F}',
      subtitle: (gg) => (yearActionsUsed(gg, 'computer.dev.askParents') > 0 ? 'Already asked this year' : 'Good grades and a good relationship help'),
      disabledReason: (gg) => firstReason(lifeBlock(gg), yearActionsUsed(gg, 'computer.dev.askParents') > 0 ? 'You already asked this year.' : null),
      run: askParentsForComputer,
    })
  }
  if (c.age >= 12) {
    nodes.push({
      type: 'action',
      id: 'computer.dev.usedLaptop',
      label: 'Used Laptop (Classifieds)',
      emoji: '\u{1F4E6}',
      subtitle: (gg) => {
        const l = usedLaptopListing(gg)
        return gg.flags.devUsedLaptopYear === gg.year ? 'Sold. Check again next year.' : `${formatMoney(l.price)} · condition ${l.condition}% · from ${l.seller}`
      },
      disabledReason: (gg) => firstReason(lifeBlock(gg), gg.flags.devUsedLaptopYear === gg.year ? 'That listing is gone. Check again next year.' : null),
      confirm: (gg) => `Buy a used laptop from ${usedLaptopListing(gg).seller} on ${classifiedsName(gg)} for ${formatMoney(usedLaptopListing(gg).price)}? No refunds. No questions. No guarantees.`,
      run: buyUsedLaptop,
    })
    nodes.push(electronicsStoreMenu)
  }
  if (nodes.length === 0) nodes.push({ type: 'info', id: 'computer.dev.noParents', emoji: '\u{1F4DA}', text: (gg) => `The ${gg.character.city} library has free computers, a two-hour limit and a librarian who sees everything. At 12 you can buy your own.` })
  return nodes
}

/** Readers for tests. */
export const learnInternals = { studyTutorial, takeCourse, bootcamp, codingCamp, compete, buyUsedLaptop, COMPETITIONS, BOOTCAMP_TRACKS }

/** Living parents are referenced by the yearly nagging (kept here so it shares the refusal tone). */
export function nagParent(g: GameState): Person | undefined {
  const ps = guardians(g).filter((p) => p.livesWithPlayer || g.character.residence.status === 'parents')
  return ps.length ? ps.reduce((a, b) => (b.relationship < a.relationship ? b : a)) : undefined
}

/** For devSummary: "Python and JavaScript". */
export function languagesPhrase(g: GameState, max = 2): string {
  const langs = knownLanguages(g).slice(0, max)
  if (langs.length <= 1) return langs[0] ?? ''
  return `${langs.slice(0, -1).join(', ')} and ${langs[langs.length - 1]}`
}
