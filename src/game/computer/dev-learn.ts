// Learning to code at home: free tutorials, paid online courses, a coding bootcamp (16+), a
// coding camp for kids, coding contests and hackathons; and, before any of that, getting a
// computer (asking your parents, or a used laptop off the local classifieds).
import { electronicsStoreMenu, localGoodsMult, nicePrice, seeded, yearKey } from '../assets'
import { ownsComputer } from '../computer'
import { addHidden, addRelationship, addStat, count, formatMoney, log, notice, pronouns, remember, spend, useYearAction, yearActionsUsed } from '../core'
import { fillLocal } from '../data/locales'
import { eraLines } from '../events/era'
import { createPerson } from '../people'
import { liftSkill } from '../mastery'
import { chance, pick, randFloat, randInt, uid } from '../rng'
import { hasTalent, talentHint, talentMult } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { getCountry } from '../world'
import { BOOTCAMP_GATE, SAAS_GATE, noComputerText, classifiedsName, computerEra, computerModel, computersExist, eraOpen, eraReason, familyComputerName, homeComputerOdds, online, ONLINE_COURSE_GATE, type EraGate } from './era'
import { ageBlock, computerBlock, earnNow, firstReason, guardians, lifeBlock, paidLine, parentWord, payFor, taxLine, useComputer } from './dev-common'
import { between, localFee, localNameWords, onlinePrice, withDev, type DevAward } from './dev-state'
import {
  addCodingSkill,
  addLanguageXp,
  bestLanguageFor,
  codingCeiling,
  codingSkill,
  codingSkillLabel,
  getLanguage,
  kidLanguage,
  knownLanguages,
  languageBlurb,
  languageInEra,
  languageLevel,
  languagesInEra,
  markCoded,
  type CodingLanguage,
} from './skills'

// ---------------------------------------------------------------------------
// Skill gain

/** How quickly you learn: smarts and discipline, plus the Programming talent (picked or discovered). */
export function aptitude(g: GameState): number {
  const c = g.character
  return (0.45 + (c.stats.smarts / 100) * 0.55 + (c.hidden.discipline / 100) * 0.35) * talentMult(g, 'Programming', 1.5)
}

/**
 * Practice coding: raises overall skill (diminishing returns, capped by age) and a language.
 * Returns the skill and language gains actually applied.
 */
export function practice(g: GameState, base: number, langId: string | null, langMult = 2.2): { skill: number; lang: number } {
  const c = g.character
  const start = codingSkill(g)
  const ceiling = codingCeiling(c.age)
  const lang = langId ? getLanguage(langId) : undefined
  // Main Character Syndrome: the first time you code, and the first time in each language, is already mastery (to the age ceiling).
  const lifted = liftSkill(g, 'coding', 'coding', 'programming', start, ceiling)
  if (lifted > start) addCodingSkill(g, lifted - start)
  const before = codingSkill(g)
  const apt = aptitude(g)
  const room = Math.pow(Math.max(0, 1 - before / 110), 1.3)
  // Scratch teaches the basics; it stops helping once you know them.
  const scratchCap = lang?.id === 'scratch' && before >= 25 ? 0.25 : 1
  const diff = lang ? 1 - lang.difficulty * 0.3 : 1
  const raw = base * apt * room * diff * scratchCap * randFloat(g, 0.75, 1.2)
  const gain = Math.max(0, Math.min(Math.round(raw), Math.max(0, ceiling - before)))
  if (gain > 0) addCodingSkill(g, gain)
  let langGain = 0
  const langStart = lang ? languageLevel(g, lang.id) : 0
  if (lang) {
    const langLifted = liftSkill(g, `code.${lang.id}`, 'coding', lang.label, langStart, ceiling + 10)
    if (langLifted > langStart) addLanguageXp(g, lang.id, langLifted - langStart)
    const lvl = languageLevel(g, lang.id)
    const lroom = Math.max(0, 1 - lvl / 105)
    const lcap = Math.max(0, Math.min(100, ceiling + 10) - lvl)
    langGain = Math.max(1, Math.min(lcap, Math.round(base * langMult * apt * lroom * (1 - lang.difficulty * 0.35) * randFloat(g, 0.8, 1.2))))
    if (lcap <= 0) langGain = 0
    if (langGain > 0) addLanguageXp(g, lang.id, langGain)
  }
  markCoded(g)
  return { skill: codingSkill(g) - start, lang: lang ? languageLevel(g, lang.id) - langStart : 0 }
}

function skillLine(g: GameState, before: number, lang: CodingLanguage | undefined, gains: { skill: number; lang: number }): string {
  const after = codingSkill(g)
  const parts: string[] = []
  if (lang) parts.push(gains.lang > 0 ? `${lang.label}: ${languageLevel(g, lang.id) - gains.lang} → ${languageLevel(g, lang.id)}.` : `Your ${lang.label} didn't improve much.`)
  parts.push(gains.skill > 0 ? `Coding skill: ${before} → ${after} (${codingSkillLabel(after)}).` : after >= codingCeiling(g.character.age) ? `Coding skill: ${after}. You've learned about all a ${g.character.age}-year-old brain can hold for now.` : `Coding skill: ${after} (${codingSkillLabel(after)}). Diminishing returns are real.`)
  return parts.join(' ')
}

/** Languages you could learn at your age, this year (no Swift in 1990, no BASIC type-ins in 2015). */
function languagesFor(g: GameState): CodingLanguage[] {
  const age = g.character.age
  return languagesInEra(g).filter((l) => age >= l.minAge && (l.maxAge === undefined || age <= l.maxAge))
}

/** Why a language can't be studied this year ("Swift: not invented yet. It's 1998."), or null. */
function langReason(g: GameState, lang: CodingLanguage): string | null {
  return eraReason(g, lang.era, lang.label)
}

function noLanguagesInfo(g: GameState): MenuNode {
  return { type: 'info', id: 'computer.dev.learn.none', emoji: '\u{1F4ED}', text: `Nothing here suits a ${g.character.age}-year-old this year. Check back next year.` }
}

/** A line of era color at the top of Learn to Code before the web era. */
function eraInfo(g: GameState): MenuNode {
  const micro = computerEra(g) === 'micro'
  return {
    type: 'info',
    id: 'computer.dev.learn.era',
    emoji: micro ? '\u{1F4FC}' : '\u{1F4BE}',
    text: micro
      ? `It's ${g.year}. Programs come on cassette tapes and in the back pages of computer magazines, and the computer boots straight into BASIC.`
      : online(g)
        ? `It's ${g.year}. The web is new: a few tutorials exist, but most people still learn from fat books with CDs in the back.`
        : `It's ${g.year}. You learn from fat books, night classes and whoever at school knows the most. No modem in town can dial anywhere useful yet.`,
  }
}

// ---------------------------------------------------------------------------
// How people learned, by era

/** Free learning: web tutorials once the internet is here, library books and magazines before. */
function tutorialEra(g: GameState): { label: string; header: string; sites: string[]; lines: string[]; log: (lang: string) => string } {
  if (online(g) && g.year >= 1998) {
    // Era tags: video tutorials need video sites, to-do list apps need phones that run apps.
    return { label: 'Free Online Tutorials', header: 'Pick a language. Free, slow and occasionally out of date.', sites: eraLines(g, TUTORIAL_SITES), lines: eraLines(g, TUTORIAL_LINES), log: (l) => `I learned some ${l} from free online tutorials.` }
  }
  return {
    label: 'Library Books & Magazines',
    header: 'Pick a language. The library has three books on it and a computer magazine with type-in programs.',
    sites: ['a library book with a cassette taped inside the cover', 'a computer magazine full of type-in listings', "a photocopied manual from your cousin's computer club", 'the thick manual that came with the computer'],
    lines: [
      'You typed in a 300-line game from a magazine. One typo, and the dragon became a flashing square. You found the typo at 1 AM.',
      'You read the chapter on loops three times. Then the computer printed your name 10,000 times and it was beautiful.',
      'The book said "it is left as an exercise for the reader." You were the reader. It took all weekend.',
      'You saved your program to a cassette, rewound it, and it was gone. You typed it in again from memory. Character-building.',
      "The magazine's listing had a bug in it. The correction ran two issues later. You fixed it yourself first.",
    ],
    log: (l) => `I taught myself some ${l} from library books and computer magazines.`,
  }
}

/** Paid lessons: online courses from 2000, night classes and correspondence courses before. */
function courseEra(g: GameState): { label: string; header: string; sites: string[]; online: boolean } {
  if (eraOpen(g, ONLINE_COURSE_GATE)) return { label: 'Paid Online Course', header: 'A structured course with exercises and a certificate.', sites: eraLines(g, COURSE_SITES), online: true }
  return { label: 'Night Class', header: 'Evening classes with a tired instructor, a room of humming terminals and a certificate.', sites: fillSites(g, ['the {city} community college night school', 'a correspondence course (lessons arrive by mail)', 'the {city} Computer Learning Center']), online: false }
}

function fillSites(g: GameState, sites: string[]): string[] {
  return sites.map((x) => x.replace('{city}', g.character.city))
}

// ---------------------------------------------------------------------------
// Tutorials, courses, bootcamp, camp

const TUTORIAL_SITES = ['@1998 W3Schools', '@2008 Khan Academy', '@2011 Codecademy', '@2014 freeCodeCamp', '@2008 Stack Overflow', '@+videoSharing a YouTube series by a guy who types very loudly', 'a free course with a suspiciously cheerful narrator']
const COURSE_SITES = ['Lynda.com', '@2004 Pluralsight', '@2010 Udemy', '@2011 Udacity', '@2012 Coursera']

const TUTORIAL_LINES = [
  'You followed a tutorial step by step. It worked on the first try, which made you deeply suspicious.',
  'You spent three hours on a missing semicolon. You will never forget that semicolon.',
  'You copied the code exactly, it broke, and fixing it taught you more than the tutorial did.',
  'The tutorial was eight years old. Half of it no longer exists. You learned resilience.',
  '@+smartphone You built a to-do list app. You have nothing to do. It was still satisfying.',
]

const COURSE_QUIT_LINES = [
  '@+videoSharing You watched the first video, then forty videos about cats. Your progress bar is at 3%.',
  'You bought the course, felt very productive about buying the course, and never opened it.',
]

/** Quitting a night class or a correspondence course, before courses moved online. */
const NIGHT_QUIT_LINES = [
  'You went to the first two classes. Then the bowling league moved to the same night.',
  'The correspondence lessons piled up unopened on the hall table. Your mother dusts around them.',
  'You fell asleep at the back of the room three weeks running. The instructor stopped waking you.',
]

function studyTutorial(g: GameState, langId: string): void {
  const lang = getLanguage(langId)
  if (!lang) return
  const reason = firstReason(computerBlock(g), langReason(g, lang))
  if (reason) return notice(g, 'Coding', reason, { emoji: '\u{1F4BB}' })
  const era = tutorialEra(g)
  if (!useYearAction(g, 'computer.dev.tutorial', 3)) {
    return notice(g, era.label, "You've already studied three times this year on your own. Your brain needs time to compile.", { emoji: lang.emoji })
  }
  const before = codingSkill(g)
  const gains = practice(g, 4, lang.id)
  useComputer(g, 1)
  if (chance(g, 0.3)) addStat(g, 'smarts', 1)
  addStat(g, 'happiness', randInt(g, -1, 2))
  count(g, 'codingSessions')
  log(g, era.log(lang.label), 'good')
  const where = era.label === 'Free Online Tutorials' ? `You worked through free ${lang.label} tutorials on ${pick(g, era.sites)}.` : `You learned ${lang.label} from ${pick(g, era.sites)}.`
  notice(g, `${lang.label} ${era.label === 'Free Online Tutorials' ? 'Tutorials' : 'Self-Study'}`, `${where} ${pick(g, era.lines)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: lang.emoji, tone: 'good' })
}

export function courseCost(g: GameState): number {
  return onlinePrice(g, 60)
}

function takeCourse(g: GameState, langId: string): void {
  const lang = getLanguage(langId)
  if (!lang) return
  const reason = firstReason(computerBlock(g), langReason(g, lang))
  if (reason) return notice(g, 'Coding', reason, { emoji: '\u{1F4BB}' })
  const era = courseEra(g)
  if (yearActionsUsed(g, 'computer.dev.course') >= 2) {
    return notice(g, era.online ? 'Online Courses' : 'Night Classes', "You've taken two courses this year. Any more and you'll start dreaming in syntax errors.", { emoji: lang.emoji })
  }
  const cost = courseCost(g)
  const site = pick(g, era.sites)
  const at = era.online ? `on ${site}` : `at ${site}`
  const who = payFor(g, cost, `A ${lang.label} course ${at}`, { emoji: lang.emoji })
  if (!who) return
  useYearAction(g, 'computer.dev.course', 2)
  useComputer(g, 2)
  const c = g.character
  const before = codingSkill(g)
  if (chance(g, between(0.3 - c.hidden.discipline / 300, 0.04, 0.3))) {
    const gains = practice(g, 1.5, lang.id, 1.5)
    log(g, `I signed up for a ${lang.label} course and mostly didn't do it.`, 'bad')
    notice(g, 'Course Abandoned', `${pick(g, era.online ? eraLines(g, COURSE_QUIT_LINES) : NIGHT_QUIT_LINES)}${paidLine(who, cost)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: lang.emoji, tone: 'bad' })
    return
  }
  const gains = practice(g, 7, lang.id)
  addStat(g, 'smarts', randInt(g, 0, 2))
  addHidden(g, 'discipline', 1)
  count(g, 'codingCourses')
  withDev(g, (s) => {
    const title = `${lang.label} course certificate`
    if (!s.certs.some((x) => x.title === title)) s.certs.push({ title, org: site.replace(/^(a|an|the) /, ''), age: c.age, strength: between(2 + Math.round(lang.difficulty * 3), 2, 5) })
  })
  log(g, era.online ? `I completed an online ${lang.label} course.` : `I completed a ${lang.label} night course.`, 'good')
  notice(g, `${lang.label} Course`, `You finished ${/^(HTML|SQL|Assembly)/.test(lang.label) ? 'an' : 'a'} ${lang.label} course ${at} and got a certificate with your name spelled almost right.${paidLine(who, cost)}\n\n${skillLine(g, before, lang, gains)}`, { emoji: '\u{1F393}', tone: 'good' })
}

interface Track {
  id: string
  label: string
  emoji: string
  langs: string[]
  /** When this track is taught (bootcamps from 2012; computer institutes before). */
  era?: EraGate
}

const BOOTCAMP_TRACKS: Track[] = [
  { id: 'web', label: 'Full-Stack Web Development', emoji: '\u{1F310}', langs: ['javascript', 'html', 'sql'], era: BOOTCAMP_GATE },
  { id: 'mobile', label: 'Mobile App Development', emoji: '\u{1F4F1}', langs: ['swift', 'javascript'], era: { ...BOOTCAMP_GATE, from: 2014, tech: ['internet', 'smartphone'] } },
  { id: 'data', label: 'Data Science', emoji: '\u{1F4CA}', langs: ['python', 'sql'], era: BOOTCAMP_GATE },
  { id: 'games', label: 'Game Development', emoji: '\u{1F3AE}', langs: ['cpp', 'lua'], era: BOOTCAMP_GATE },
  // Before bootcamps: the computer training institutes that advertised on late-night TV.
  { id: 'business', label: 'Business Programming Diploma', emoji: '\u{1F4BE}', langs: ['pascal', 'sql'], era: { tech: 'homeComputer', from: 1986, until: 2005 } },
  { id: 'cprog', label: 'C Programming Certificate', emoji: '\u{1F523}', langs: ['c', 'assembly'], era: { tech: 'homeComputer', from: 1982, until: 1998 } },
  { id: 'webdesign', label: 'Web Design Diploma', emoji: '\u{1F578}\u{FE0F}', langs: ['html', 'javascript'], era: { tech: 'internet', from: 1997, until: 2011 } },
  { id: 'java', label: 'Java & Databases Certificate', emoji: '\u{2615}', langs: ['java', 'sql'], era: { from: 1998, until: 2011 } },
]

/** This year's tracks (only ones whose languages can be taught now). */
function tracksNow(g: GameState): Track[] {
  return BOOTCAMP_TRACKS.filter((t) => eraOpen(g, t.era) && t.langs.every((l) => languageInEra(g, l)))
}

/** "Coding bootcamp" from 2012; before that a computer training institute. */
function bootcampIsModern(g: GameState): boolean {
  return eraOpen(g, BOOTCAMP_GATE)
}

function bootcampWord(g: GameState): string {
  return bootcampIsModern(g) ? 'Coding Bootcamp' : 'Computer Training Institute'
}

export function bootcampCost(g: GameState): number {
  return localFee(g, 13_000)
}

function bootcampName(g: GameState): string {
  const words = localNameWords(g)
  const word = words.length ? words[Math.abs(g.character.city.length * 7 + g.character.countryId.charCodeAt(0)) % words.length] : ''
  if (!bootcampIsModern(g)) return word ? `${word} Institute of Computer Technology` : `${g.character.city} Computer Training Institute`
  return word ? `${word} Code Academy` : `${g.character.city} Coding Bootcamp`
}

function bootcamp(g: GameState, track: Track): void {
  const c = g.character
  const word = bootcampWord(g)
  const reason = firstReason(computerBlock(g), ageBlock(g, 16, `join a ${word.toLowerCase()} course`), tracksNow(g).some((t) => t.id === track.id) ? null : eraReason(g, track.era, `the ${track.label} course`) ?? `The ${track.label} course isn't taught this year.`)
  if (reason) return notice(g, word, reason, { emoji: track.emoji })
  if (yearActionsUsed(g, 'computer.dev.bootcamp') >= 1) {
    return notice(g, word, 'One intensive course a year is plenty. The last one still haunts your dreams.', { emoji: track.emoji })
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
  const modern = bootcampIsModern(g)
  withDev(g, (s) => {
    s.certs.push({ title: modern ? `Coding bootcamp: ${track.label}` : track.label, org: school, age: c.age, strength: 5 })
  })
  remember(g, modern ? `Graduated from ${school}'s ${track.label} bootcamp.` : `Earned a ${track.label} from ${school}.`)
  log(g, modern ? `I graduated from a ${track.label.toLowerCase()} bootcamp at ${school}.` : `I earned a ${track.label} from ${school}.`, 'good')
  const langs = track.langs.map((l) => getLanguage(l)?.label ?? l).join(', ')
  notice(
    g,
    modern ? 'Bootcamp Graduate' : 'Diploma Earned',
    modern
      ? `Twelve weeks, ${randInt(g, 70, 95)} hours a week, ${randInt(g, 300, 900)} cups of ${pick(g, ['coffee', 'tea', 'energy drinks'])}. You graduated from ${school}'s ${track.label} bootcamp (${langs}). The instructor called your capstone project "ambitious," which is instructor for "it crashed during the demo."${paidLine(who, cost)}\n\n${skillLine(g, before, getLanguage(track.langs[0]), gains)}`
      : `Twelve weeks of evenings at ${school}, ${randInt(g, 300, 900)} cups of vending-machine ${pick(g, ['coffee', 'tea', 'hot chocolate'])} and a final exam on paper. You earned the ${track.label} (${langs}). The certificate has a gold seal and a typo.${paidLine(who, cost)}\n\n${skillLine(g, before, getLanguage(track.langs[0]), gains)}`,
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

const OLD_CAMP_LINES = [
  'Twenty kids shared eight computers. You learned to type very fast when it was your turn.',
  'You made the screen print a rude word 1,000 times. A counselor confiscated your floppy disk.',
  'You programmed a little turtle to draw a star. It drew a star-shaped accident. Everyone clapped.',
  'Lunch was terrible. The computers were incredible.',
]

function codingCamp(g: GameState): void {
  const c = g.character
  const reason = firstReason(computerBlock(g))
  if (reason) return notice(g, 'Coding Camp', reason, { emoji: '\u{1F3D5}\u{FE0F}' })
  if (c.age > 15) return notice(g, 'Coding Camp', "You're too old for kids' coding camp. The counselors would ask you to be a counselor.", { emoji: '\u{1F3D5}\u{FE0F}' })
  if (yearActionsUsed(g, 'computer.dev.camp') >= 1) return notice(g, 'Coding Camp', 'Camp only runs once a year. You already went!', { emoji: '\u{1F3D5}\u{FE0F}' })
  const cost = campCost(g)
  const camp = fillLocal(g, pick(g, g.year >= 2005 ? ['{city} Young Coders Camp', '{place} Code Club Summer Camp', 'Little Hackers Camp in {city}'] : ['{city} Summer Computer Camp', 'the {place} Microcomputer Camp', 'Camp Kilobyte near {city}']))
  const who = payFor(g, cost, camp, { emoji: '\u{1F3D5}\u{FE0F}' })
  if (!who) return
  useYearAction(g, 'computer.dev.camp', 1)
  useComputer(g, 1)
  const kid = kidLanguage(g)
  const langId = c.age <= 11 || !languageInEra(g, 'python') ? kid : chance(g, 0.5) ? 'python' : kid
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
  notice(g, 'Coding Camp', `You spent a week at ${camp}. ${pick(g, g.year >= 2005 ? CAMP_LINES : OLD_CAMP_LINES)}${friendLine}${paidLine(who, cost)}\n\n${skillLine(g, before, getLanguage(langId), gains)}`, { emoji: '\u{1F3D5}\u{FE0F}', tone: 'good' })
}

function langAction(lang: CodingLanguage, prefix: string, run: (g: GameState, id: string) => void, cost?: (g: GameState) => number): MenuAction {
  return {
    type: 'action',
    id: `${prefix}.${lang.id}`,
    label: lang.label,
    emoji: lang.emoji,
    subtitle: (g) => `${languageLevel(g, lang.id) > 0 ? `Level ${languageLevel(g, lang.id)}` : 'New'} · ${languageBlurb(g, lang)}${cost ? ` · ${formatMoney(cost(g))}` : ''}`,
    visible: (g) => g.character.age >= lang.minAge && (lang.maxAge === undefined || g.character.age <= lang.maxAge) && languageInEra(g, lang.id),
    disabledReason: (g) => firstReason(computerBlock(g), langReason(g, lang)),
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
      ...(computerEra(g) === 'micro' || computerEra(g) === 'pc' ? [eraInfo(g)] : []),
      {
        type: 'menu',
        id: 'computer.dev.learn.tutorials',
        label: tutorialEra(g).label,
        emoji: online(g) ? '\u{1F4FA}' : '\u{1F4D6}',
        subtitle: (gg) => `Free · ${yearActionsUsed(gg, 'computer.dev.tutorial')}/3 this year`,
        disabledReason: computerBlock,
        header: (gg) => tutorialEra(gg).header,
        children: () => (langs.length ? langs.map((l) => langAction(l, 'computer.dev.tut', studyTutorial)) : [noLanguagesInfo(g)]),
      },
      {
        type: 'menu',
        id: 'computer.dev.learn.courses',
        label: courseEra(g).label,
        emoji: '\u{1F4DA}',
        subtitle: (gg) => `${formatMoney(courseCost(gg))} · ${yearActionsUsed(gg, 'computer.dev.course')}/2 this year`,
        disabledReason: computerBlock,
        header: (gg) => `${courseEra(gg).header} ${formatMoney(courseCost(gg))} each (${courseEra(gg).online ? 'regional pricing' : 'local fees'}).`,
        children: () => {
          const paid = langs.filter((l) => l.id !== 'scratch' && l.id !== 'logo')
          return paid.length ? paid.map((l) => langAction(l, 'computer.dev.course', takeCourse, courseCost)) : [noLanguagesInfo(g)]
        },
      },
      {
        type: 'menu',
        id: 'computer.dev.learn.bootcamp',
        label: bootcampWord(g),
        emoji: bootcampIsModern(g) ? '\u{1F525}' : '\u{1F3EB}',
        subtitle: (gg) => `${formatMoney(bootcampCost(gg))} · 12 intense weeks · age 16+`,
        visible: (gg) => gg.character.age >= 14 && tracksNow(gg).length > 0,
        disabledReason: (gg) => firstReason(computerBlock(gg), ageBlock(gg, 16, `join a ${bootcampWord(gg).toLowerCase()} course`)),
        header: (gg) =>
          bootcampIsModern(gg)
            ? `${bootcampName(gg)}: twelve weeks that will either make you a developer or make you cry. Usually both. ${formatMoney(bootcampCost(gg))}.`
            : `${bootcampName(gg)}: "Train for a career in computers!" says the ad that runs during daytime TV. Twelve weeks, ${formatMoney(bootcampCost(gg))}.`,
        children: (gg) =>
          tracksNow(gg).map(
            (t): MenuAction => ({
              type: 'action',
              id: `computer.dev.bootcamp.${t.id}`,
              label: t.label,
              emoji: t.emoji,
              subtitle: t.langs.map((l) => getLanguage(l)?.label ?? l).join(' · '),
              disabledReason: (g3) => firstReason(computerBlock(g3), ageBlock(g3, 16, `join a ${bootcampWord(g3).toLowerCase()} course`)),
              confirm: (g3) => `Enroll in the ${t.label}${bootcampIsModern(g3) ? ' bootcamp' : ' course'} for ${formatMoney(bootcampCost(g3))}?`,
              run: (g3) => bootcamp(g3, t),
            }),
          ),
      },
      {
        type: 'action',
        id: 'computer.dev.camp',
        label: 'Coding Camp for Kids',
        emoji: '\u{1F3D5}\u{FE0F}',
        subtitle: (gg) => `${formatMoney(campCost(gg))} · ages 8-15 · ${gg.year >= 2005 ? 'robots, games, snacks' : 'shared computers, floppy disks, snacks'}`,
        visible: (gg) => gg.character.age <= 15 && gg.year >= 1980 && computersExist(gg),
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
  /** When it runs (online contests need the internet; the computer club fair is an 80s thing). */
  era?: EraGate
}

const HACK_THEMES = ['climate', 'public transit in {city}', 'pet adoption', 'fixing school lunches', 'accessibility', 'small farmers', 'mental health', 'disaster relief', 'saving {landmark}']

const COMPETITIONS: CompDef[] = [
  { id: 'contest', label: 'Online Coding Contest', emoji: '\u{2328}\u{FE0F}', minAge: 12, bar: 0, prizes: [250, 100, 50], strengths: [5, 4, 3, 2], use: 'data', local: false, name: () => 'the CodeDuel Monthly Challenge', era: { tech: 'internet', from: 2001 } },
  { id: 'gamejam', label: '48-Hour Game Jam', emoji: '\u{1F3AE}', minAge: 12, bar: 0, prizes: [500, 200, 100], strengths: [6, 5, 4, 3], use: 'games', local: false, name: (g) => `the ${pick(g, ['Pixel Panic', 'Midnight Sprite', 'Jamboree'])} 48-Hour Game Jam`, era: { tech: 'internet', from: 2002 } },
  { id: 'olympiad', label: 'Olympiad in Informatics', emoji: '\u{1F947}', minAge: 13, maxAge: 19, bar: 12, prizes: [0, 0, 0], strengths: [8, 7, 6, 4], use: 'data', local: true, name: (g) => { const k = getCountry(g.character.countryId); return `the ${k.demonym || k.name} Olympiad in Informatics` }, era: { tech: 'homeComputer', from: 1989 } },
  { id: 'hackathon', label: 'Hackathon', emoji: '\u{1F9D1}\u{200D}\u{1F4BB}', minAge: 14, bar: 6, prizes: [4_000, 1_500, 750], strengths: [7, 6, 5, 3], use: 'web', local: true, name: (g) => fillLocal(g, `the ${g.character.city} Hackathon for ${pick(g, HACK_THEMES)}`), era: { tech: 'internet', from: 2005 } },
  // Before the internet: the local computer club's yearly contest (appended so ids stay stable).
  { id: 'clubfair', label: 'Computer Club Contest', emoji: '\u{1F4BE}', minAge: 10, bar: 0, prizes: [150, 75, 40], strengths: [5, 4, 3, 2], use: 'games', local: true, name: (g) => `the ${g.character.city} Computer Club's annual programming contest`, era: { tech: 'homeComputer', until: 2000 } },
]

/** This year's competitions. */
function competitionsNow(g: GameState): CompDef[] {
  return COMPETITIONS.filter((d) => eraOpen(g, d.era))
}

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
  const reason = firstReason(computerBlock(g), ageBlock(g, def.minAge, `enter the ${def.label.toLowerCase()}`), eraReason(g, def.era, `the ${def.label.toLowerCase()}`))
  if (reason) return notice(g, def.label, reason, { emoji: def.emoji })
  if (def.maxAge !== undefined && c.age > def.maxAge) return notice(g, def.label, `It's for students up to ${def.maxAge}. You've aged out.`, { emoji: def.emoji })
  if (!useYearAction(g, 'computer.dev.comp', 2)) return notice(g, 'Competitions', "You've entered two competitions this year. Your keyboard needs a rest.", { emoji: def.emoji })
  useComputer(g, 2)
  const name = def.name(g)
  const best = bestLanguageFor(g, def.use)
  const score = codingSkill(g) * 0.75 + c.stats.smarts * 0.2 + c.hidden.discipline * 0.1 + (best ? best.level * 0.12 : 0) + (hasTalent(g, 'Programming') ? 10 : 0) + randInt(g, -22, 22) - def.bar
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
  if (def.id === 'hackathon' && place === 0 && c.age >= 16 && eraOpen(g, SAAS_GATE)) extra += ' A suit in the audience handed you a business card that just says "Let\'s talk." You could turn this into a real startup.'
  log(g, `I took ${titles[place].toLowerCase()} at ${name}.`, 'good')
  const hype = place === 0 ? pick(g, ['You won! The trophy is shaped like a keyboard and you love it.', eraOpen(g, { tech: 'videoSharing', from: 2011 }) ? 'You won! Your victory dance was captured on the livestream.' : 'You won! Your victory dance made the local paper.']) : place === 3 ? (olympiad ? 'An honorable mention. Honorable!' : 'You made the final. Very CV-able.') : `You placed ${titles[place].toLowerCase()}!`
  notice(g, def.label, `You competed in ${name}. ${hype}${extra}${prize > 0 ? ` Prize: ${formatMoney(prize)}.${taxLine(tax)}` : ''}`, { emoji: '\u{1F3C6}', tone: 'good' })
}

export const competitionsMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.competitions',
  label: 'Contests & Hackathons',
  emoji: '\u{1F3C6}',
  subtitle: (g) => `${online(g) && g.year >= 2001 ? 'Coding contests, game jams, olympiads' : 'Computer club contests and olympiads'} · ${yearActionsUsed(g, 'computer.dev.comp')}/2 this year`,
  visible: (g) => {
    const now = competitionsNow(g)
    return now.length > 0 && g.character.age >= Math.min(...now.map((d) => Math.min(12, d.minAge)))
  },
  disabledReason: computerBlock,
  header: (g) => `Your coding skill is ${codingSkill(g)}/100. The kid who wins these every year is 11 and terrifying.`,
  children: (g) =>
    competitionsNow(g).map(
      (d): MenuAction => ({
        type: 'action',
        id: `computer.dev.comp.${d.id}`,
        label: d.label,
        emoji: d.emoji,
        subtitle: (gg) => {
          const p = d.prizes[0] > 0 ? `Top prize ${formatMoney(d.local ? localFee(gg, d.prizes[0]) : onlinePrice(gg, d.prizes[0]))}` : 'Medals and glory'
          return `${p} · age ${d.minAge}${d.maxAge ? `-${d.maxAge}` : '+'}`
        },
        visible: (gg) => gg.character.age >= Math.min(12, d.minAge) && (d.maxAge === undefined || gg.character.age <= d.maxAge),
        disabledReason: (gg) => firstReason(computerBlock(gg), ageBlock(gg, d.minAge, `enter the ${d.label.toLowerCase()}`)),
        run: (gg) => compete(gg, d),
      }),
    ),
}

// ---------------------------------------------------------------------------
// No computer: ask your parents, or buy a used laptop

/** A new computer of the era at local prices (a modern laptop: $1,300 in the US). */
export function laptopPrice(g: GameState): number {
  return nicePrice(computerModel(g).usd * localGoodsMult(g, 'electronics'))
}

function giveComputer(g: GameState, name: string, price: number, condition: number, details: Record<string, string | boolean>, emoji = computerModel(g).emoji): Asset {
  const a: Asset = {
    id: uid(g, 'a'),
    kind: 'other',
    name,
    emoji,
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
  rare: ['"A computer? What for? You have a perfectly good typewriter."', '"Those things cost as much as a car, and nobody knows what they\'re for."', '"Your uncle says computers are a fad. Go play outside."', '"When you\'re older you can use the one at the library. Maybe."'],
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
  if (!computersExist(g)) {
    log(g, 'I asked my parents for a computer. They had no idea what I meant.', 'neutral')
    return notice(g, 'Ask for a Computer', `It's ${g.year}. Computers fill whole rooms at universities and banks. Your parents laughed and offered you a transistor radio instead.`, { emoji: '\u{1F4FB}' })
  }
  const asks = withDev(g, (s) => ++s.asks)
  const price = laptopPrice(g)
  const model = computerModel(g)
  // How normal it is to have one: in 1984 a home computer was a rare, pricey novelty.
  const common = homeComputerOdds(g)
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
  const novelty = common >= 0.5 ? 0 : (0.5 - common) * 0.5
  const score = (rel / 100) * 0.4 + between(budget / (price * 8), 0, 1) * 0.45 + ((grades - 50) / 100) * 0.3 + (c.age >= 12 ? 0.05 : -0.05) - Math.min(0.15, (asks - 1) * 0.04) - novelty + randFloat(g, -0.12, 0.12)
  const payer = ps.reduce((a, b) => (b.money > a.money ? b : a))
  const who = parentWord(payer)
  const Who = who.charAt(0).toUpperCase() + who.slice(1)
  const modern = model.name === 'Laptop'
  const thing = modern ? 'laptop' : 'computer'
  if (budget >= price * 4 && score >= 0.55) {
    payer.money = Math.round(payer.money - price)
    addRelationship(payer, 2)
    giveComputer(g, model.displayName, price, 100, { gift: 'parents' })
    g.flags.devParentLaptopAge = c.age
    addStat(g, 'happiness', randInt(g, 8, 14))
    count(g, 'gotComputer')
    log(g, `${Who} bought me ${modern ? 'a laptop' : model.noun}!`, 'good')
    remember(g, `${Who} bought me my first ${thing}.`)
    const x = pronouns(payer.gender)
    const lines = modern
      ? [`"It's for SCHOOLWORK," ${x.he} said, twice.`, '"If I see one virus on it, it goes in the garage."', `${x.He} set the parental controls to "maximum." You found the off switch in four minutes.`]
      : [`"It's for SCHOOLWORK," ${x.he} said, twice.`, `${x.He} read the whole manual first and still asked you how to turn it on.`, `"If you break it, you're paying for it until you're thirty."`]
    notice(g, modern ? 'New Laptop!' : 'New Computer!', `${Who} bought you ${modern ? 'a brand-new laptop' : model.noun} (${formatMoney(price)})! ${model.flavor ? `${model.flavor} ` : ''}${pick(g, lines)}\n\nActivities › Computer is now open.`, { emoji: model.emoji, tone: 'good' })
    return
  }
  // Hand-me-downs need older computers to hand down (none in the first years of home computers).
  const oldOnesExist = computersExist(g, g.year - 6)
  if (oldOnesExist && budget >= price * 0.25 && score >= 0.35) {
    const condition = randInt(g, 30, 55)
    addRelationship(payer, 1)
    giveComputer(g, modern ? 'Hand-Me-Down Laptop' : 'Hand-Me-Down Computer', Math.round(price * 0.2), condition, { gift: 'parents', handMeDown: true })
    // Old computers die young: they'll consider another one in about three years.
    g.flags.devParentLaptopAge = c.age - 2
    addStat(g, 'happiness', randInt(g, 4, 8))
    count(g, 'gotComputer')
    log(g, `${Who} gave me an old ${thing}.`, 'good')
    const lines = modern
      ? ['It has a sticker of a band nobody remembers and a battery that lasts eleven minutes.', 'It takes four minutes to boot and sounds like a jet engine. It is yours.', 'The "E" key is missing. You will write very carefully.']
      : ['It came from the office of a friend of a friend and still has their spreadsheets on it.', 'The screen is green, the fan is loud and it is yours.', 'The "E" key sticks. You will write very carefully.']
    notice(g, modern ? 'Hand-Me-Down Laptop' : 'Hand-Me-Down Computer', `${Who} dug out an old ${thing}. ${pick(g, lines)} Condition: ${condition}%.\n\nActivities › Computer is now open.`, { emoji: model.emoji, tone: 'good' })
    return
  }
  const why = budget < price * 0.25 ? 'poor' : common < 0.2 && score < 0.55 ? 'rare' : grades < 50 ? 'grades' : rel < 45 ? 'relationship' : c.age < 11 ? 'young' : 'generic'
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
  const price = nicePrice(computerModel(g).usd * localGoodsMult(g, 'electronics') * r.float(0.16, 0.28))
  const condition = r.int(30, 70)
  const seller = online(g) && g.year >= 2000
    ? r.pick(['a guy who "just upgraded"', 'a student moving abroad', 'a man named Gary', 'a retired teacher', 'someone with 2,000 five-star reviews', 'someone with no reviews at all'])
    : r.pick(['a guy who "just upgraded"', 'a student moving abroad', 'a man named Gary', 'a retired teacher', 'an accountant whose office went "fully modern"', 'a teenager who wants a car instead'])
  return { price, condition, seller, dud: r.chance(0.12) }
}

/** "Used Laptop" today, "Used Desktop PC" in 1995, "Used Home Computer" in 1985. */
function usedName(g: GameState): string {
  return `Used ${computerModel(g).displayName}`
}

function buyUsedLaptop(g: GameState): void {
  const c = g.character
  const title = usedName(g)
  const reason = firstReason(lifeBlock(g), ageBlock(g, 12, online(g) ? 'buy things online' : 'answer classified ads'), computersExist(g) ? null : eraReason(g, { tech: 'homeComputer' }, 'home computers'))
  if (reason) return notice(g, title, reason, { emoji: '\u{1F4BB}' })
  if (g.flags.devUsedLaptopYear === g.year) return notice(g, title, 'That listing is gone. Check again next year.', { emoji: '\u{1F4BB}' })
  const l = usedLaptopListing(g)
  if (!spend(g, l.price)) return notice(g, title, `It costs ${formatMoney(l.price)} and you have ${formatMoney(Math.max(0, c.money))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  g.flags.devUsedLaptopYear = g.year
  count(g, 'purchases')
  if (l.dud) {
    addStat(g, 'happiness', -randInt(g, 4, 8))
    const thing = title.replace(/^Used /, '').toLowerCase()
    log(g, `I bought a used ${thing} off ${classifiedsName(g)}. It was a brick.`, 'bad')
    const vanished = online(g) && g.year >= 2000 ? "The seller's account has vanished." : "The seller's phone number now belongs to a pizza place."
    notice(g, 'Scammed', `You met ${l.seller} in a parking lot and paid ${formatMoney(l.price)} for a used ${thing}. At home you opened the box. It was an empty case with a brick inside. ${vanished}`, { emoji: '\u{1F9F1}', tone: 'bad' })
    return
  }
  const thing = title.replace(/^Used /, '').toLowerCase()
  giveComputer(g, title, l.price, l.condition, { bought: 'classifieds' })
  addStat(g, 'happiness', randInt(g, 3, 6))
  log(g, `I bought a used ${thing} off ${classifiedsName(g)}.`, 'good')
  const quirks = computerModel(g).name === 'Laptop' ? ['It smells faintly of fries.', 'The previous owner left a desktop wallpaper of their cat. You kept it.', 'The fan sounds like a tiny helicopter. It works.'] : ['It came with a shoebox of floppy disks labeled in three different handwritings.', 'The monitor has a faint ghost of a spreadsheet burned into it. It works.', 'The fan sounds like a tiny helicopter. It works.']
  notice(g, title, `You bought a used ${thing} from ${l.seller} for ${formatMoney(l.price)}. Condition ${l.condition}%. ${pick(g, quirks)}\n\nActivities › Computer is now open.`, { emoji: computerModel(g).emoji, tone: 'good' })
}

/** Rows shown in Activities › Computer when there's no computer. */
export function getAComputerNodes(g: GameState): MenuNode[] {
  const c = g.character
  const nodes: MenuNode[] = []
  if (!computersExist(g)) {
    nodes.push({ type: 'info', id: 'computer.dev.noneYet', emoji: '\u{1F5C4}\u{FE0F}', text: (gg) => noComputerText(gg) })
    return nodes
  }
  if (c.age < 18 && guardians(g).length > 0) {
    nodes.push({
      type: 'action',
      id: 'computer.dev.askParents',
      label: 'Ask Your Parents for a Computer',
      emoji: '\u{1F64F}',
      subtitle: (gg) => (yearActionsUsed(gg, 'computer.dev.askParents') > 0 ? 'Already asked this year' : homeComputerOdds(gg) < 0.25 ? `Few families own one in ${gg.year}: good luck` : 'Good grades and a good relationship help'),
      // Programming talent: you'd learn fast (aptitude ×1.5), and in an era when few kids have one, that's a head start.
      hint: (gg) => talentHint(gg, 'Programming', homeComputerOdds(gg) < 0.4 ? `Hardly any kid has a computer in ${gg.year}. You'd learn to code faster than almost anyone your age.` : "You'd pick up coding fast on one of these.") || null,
      disabledReason: (gg) => firstReason(lifeBlock(gg), yearActionsUsed(gg, 'computer.dev.askParents') > 0 ? 'You already asked this year.' : null),
      run: askParentsForComputer,
    })
  }
  if (c.age >= 12) {
    nodes.push({
      type: 'action',
      id: 'computer.dev.usedLaptop',
      label: `${usedName(g)} (Classifieds)`,
      emoji: '\u{1F4E6}',
      subtitle: (gg) => {
        const l = usedLaptopListing(gg)
        return gg.flags.devUsedLaptopYear === gg.year ? 'Sold. Check again next year.' : `${formatMoney(l.price)} · condition ${l.condition}% · from ${l.seller}`
      },
      disabledReason: (gg) => firstReason(lifeBlock(gg), gg.flags.devUsedLaptopYear === gg.year ? 'That listing is gone. Check again next year.' : null),
      confirm: (gg) => `Buy a ${usedName(gg).toLowerCase()} from ${usedLaptopListing(gg).seller} via ${classifiedsName(gg)} for ${formatMoney(usedLaptopListing(gg).price)}? No refunds. No questions. No guarantees.`,
      run: buyUsedLaptop,
    })
    nodes.push(electronicsStoreMenu)
  }
  if (nodes.length === 0) nodes.push({ type: 'info', id: 'computer.dev.noParents', emoji: '\u{1F4DA}', text: (gg) => `The ${gg.character.city} library has free computers, a two-hour limit and a librarian who sees everything. At 12 you can buy your own.` })
  return nodes
}

// ---------------------------------------------------------------------------
// The family computer and the first lines of code (yearly, no player action needed)

/** How much earlier (or later) than the typical family this one buys gadgets: 0.4 poor … 1.3 rich. */
function familyGadgetMult(g: GameState): number {
  const ps = guardians(g)
  const budget = ps.reduce((sum, p) => sum + Math.max(0, p.money), 0)
  const typical = 110_000 * Math.max(0.2, getCountry(g.character.countryId).wealth ?? 1)
  return between(Math.sqrt(budget / Math.max(1, typical)), 0.4, 1.3)
}

/** Chance (0-0.97) that this family has a home computer by `year`. */
function familyComputerShare(g: GameState, year: number): number {
  return between(homeComputerOdds(g, year) * familyGadgetMult(g), 0, 0.97)
}

/**
 * Yearly (ages 7-17, living at home): the parents bring home a computer, as often as families
 * like yours really did that year (a rare novelty in 1984, normal by 2005; rich families first).
 * Over a childhood the share of kids who get one follows the country's adoption curve. Returns
 * the popups used (0/1). Never twice per life, never when you already have a computer.
 */
export function familyComputerYear(g: GameState, budget: number): number {
  const c = g.character
  if (budget <= 0 || !c.alive || c.prison || c.age < 7 || c.age > 17 || c.residence.status !== 'parents') return 0
  if (typeof g.flags.devFamilyComputer === 'number' || g.assets.some((a) => a.condition > 0 && a.details.gift === 'family')) return 0
  if (!computersExist(g) || ownsComputer(g)) return 0
  const ps = guardians(g)
  if (!ps.length) return 0
  const first = g.flags.devFamilyPcSeen !== true
  g.flags.devFamilyPcSeen = true
  const now = familyComputerShare(g, g.year)
  const before = first ? 0 : familyComputerShare(g, g.year - 1)
  const p = first ? now : between((now - before) / Math.max(0.03, 1 - before), 0, 1)
  if (!chance(g, p)) return 0
  const price = laptopPrice(g)
  const payer = ps.reduce((a, b) => (b.money > a.money ? b : a))
  if (payer.money < price) return 0
  payer.money = Math.round(payer.money - price)
  const model = computerModel(g)
  const name = familyComputerName(g)
  giveComputer(g, name, price, 100, { gift: 'family' })
  g.flags.devFamilyComputer = c.age
  count(g, 'gotComputer')
  addStat(g, 'happiness', randInt(g, 4, 9))
  const who = capitalizeWord(parentWord(payer))
  remember(g, `${who} brought home our first family computer when I was ${c.age}.`)
  log(g, `${who.replace(/^Your/, 'My')} brought home a family computer!`, 'good')
  const era = computerEra(g)
  const room = pick(g, ['the den', 'the living room', 'a corner of the kitchen', 'the spare room'])
  const rules =
    era === 'micro'
      ? pick(g, ['Your dad bought three games and a book called "Programming for Absolute Beginners."', 'Your parents mostly use it to balance the checkbook. You mostly use it for everything else.', 'The whole family gathered to watch it draw a circle. It took a while.'])
      : era === 'pc'
        ? pick(g, ['There is a sign-up sheet on the fridge for computer time. Your name is on every line.', 'Your parents bought it "for the encyclopedia CD." You found the games folder in minutes.', 'Nobody is allowed to touch it while someone is on the phone, because the modem shares the line.'])
        : pick(g, ['Everyone in the family has their own login and nobody remembers the password.', 'It is "for homework." Everyone knows it is not for homework.', 'Your parents put it in the living room so they can see the screen. Bold.'])
  notice(g, 'Family Computer!', `${who} came home with ${model.noun}${model.name === 'Laptop' ? ' for the family' : ''} (${formatMoney(price)}). It lives in ${room}. ${model.flavor ? `${model.flavor} ` : ''}${rules}\n\nActivities › Computer is now open.`, { emoji: model.emoji, tone: 'good' })
  return 1
}

function capitalizeWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Yearly (ages 8-17): a kid with a working computer who has never coded may start on their own:
 * a BASIC type-in in 1984, a homepage in 1998, a Scratch game in 2015. Curious, smart kids
 * (and natural programmers) are likelier. Only the very first steps; the rest is up to you.
 */
export function tinkerYear(g: GameState): void {
  const c = g.character
  if (!c.alive || c.prison || c.age < 8 || c.age > 17 || codingSkill(g) > 0) return
  if (!computerBlockFree(g)) return
  const p = between(0.12 + c.stats.smarts / 400 + (hasTalent(g, 'Programming') ? 0.25 : 0), 0, 0.6)
  if (!chance(g, p)) return
  const langId = kidLanguage(g)
  practice(g, 3, langId)
  count(g, 'codingSessions')
  const line =
    langId === 'basic'
      ? 'I typed in a game listing from a computer magazine. Then I changed the numbers. I am basically a programmer.'
      : langId === 'logo'
        ? 'I made the little Logo turtle draw a house. It was mostly a house.'
        : langId === 'html'
          ? 'I made my own homepage. It has a visitor counter, a spinning globe and three visitors (all me).'
          : langId === 'scratch'
            ? 'I made a Scratch game where a cat eats tacos. I am a game developer now.'
            : 'I wrote my first program. It printed my name. I felt like a wizard.'
  log(g, line, 'good')
}

function computerBlockFree(g: GameState): boolean {
  return computerBlock(g) === null
}

/** Readers for tests. */
export const learnInternals = { studyTutorial, takeCourse, bootcamp, codingCamp, compete, buyUsedLaptop, COMPETITIONS, BOOTCAMP_TRACKS, competitionsNow, tracksNow, languagesFor, familyComputerShare }

/** Living parents are referenced by the yearly nagging (kept here so it shares the refusal tone). */
export function nagParent(g: GameState): Person | undefined {
  const ps = guardians(g).filter((p) => p.livesWithPlayer || g.character.residence.status === 'parents')
  return ps.length ? ps.reduce((a, b) => (b.relationship < a.relationship ? b : a)) : undefined
}
