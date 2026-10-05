// Love life: dating, the dating app, matchmaker, hook-ups, proposals, weddings, divorce,
// pregnancy & births, the fertility clinic, adoption and pets.
// relationships.ts uses the exported partner / marriage / baby helpers (same owner).
import {
  addHidden,
  addMoney,
  addPersonStat,
  addRelationship,
  addStat,
  attractedTo,
  canAfford,
  children,
  clamp,
  count,
  currentPartner,
  formatMoney,
  fullName,
  getPerson,
  inPrison,
  log,
  netWorth,
  notice,
  parents,
  preferredGender,
  pronouns,
  relationLabel,
  remember,
  removePerson,
  scriptChoice,
  scriptInput,
  spend,
  useYearAction,
} from './core'
import { createPerson, notePerson, pickDistinct, randomOccupation, randomWealth, TRAITS } from './people'
import { bell, chance, pick, randFloat, randInt, shuffle } from './rng'
import { defineScript } from './scripts'
import { COUNTRIES, getCountry, randomFirstName, randomLastName } from './world'
import type { ChoiceOption, GameState, Gender, Json, MenuAction, MenuGroup, MenuNode, Person, RelationKind } from './types'

// ---------------------------------------------------------------------------
// Small shared helpers (also used by relationships.ts)

/** Treat a plain JSON-compatible value as Json (for modal data). */
export function asJson<T>(value: T): Json {
  return value as unknown as Json
}

export function rec(data: Json | undefined): Record<string, Json> {
  return data !== null && data !== undefined && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function dStr(data: Json | undefined, key: string, def = ''): string {
  const v = rec(data)[key]
  return typeof v === 'string' ? v : def
}

export function dNum(data: Json | undefined, key: string, def = 0): number {
  const v = rec(data)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

export function pNum(p: Person, key: string, def = 0): number {
  const v = p.data[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

export function pStr(p: Person, key: string, def = ''): string {
  const v = p.data[key]
  return typeof v === 'string' ? v : def
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Record that the player interacted with someone this year (slows relationship decay). */
export function touch(g: GameState, p: Person): void {
  p.data.lastInteractionAge = g.character.age
}

/** Lower-case relation label: "mother", "ex-fling", "dog". */
export function labelOf(p: Person): string {
  if (p.relation === 'ex' && p.data.fling === true) return 'ex-fling'
  if (p.relation === 'child' && p.biological === false && p.data.adopted === true) {
    return p.gender === 'male' ? 'adopted son' : 'adopted daughter'
  }
  return relationLabel(p).toLowerCase()
}

/** "your mother Jane" */
export function yourRel(p: Person): string {
  return `your ${labelOf(p)} ${p.firstName}`
}

/** "my mother Jane" */
export function myRel(p: Person): string {
  return `my ${labelOf(p)} ${p.firstName}`
}

export const ROMANTIC: RelationKind[] = ['partner', 'fiance', 'spouse']

export function isRomantic(p: Person): boolean {
  return ROMANTIC.includes(p.relation)
}

function money(n: number): string {
  return formatMoney(n)
}

function anyConviction(g: GameState): boolean {
  return g.character.criminalRecord.some((r) => r.convicted)
}

function tooYoungReason(g: GameState, min: number, text?: string): string | null {
  return g.character.age < min ? (text ?? `You must be at least ${min} years old.`) : null
}

function blockedReason(g: GameState): string | null {
  if (!g.character.alive) return 'You are dead.'
  if (inPrison(g)) return "You can't do that from prison."
  return null
}

function hasTrait(p: Person, ...traits: string[]): boolean {
  return p.traits.some((t) => traits.includes(t))
}

function kidWord(gender: Gender): string {
  return gender === 'male' ? 'boy' : 'girl'
}

function childWord(gender: Gender): string {
  return gender === 'male' ? 'son' : 'daughter'
}

// ---------------------------------------------------------------------------
// Meeting people

export interface Candidate {
  firstName: string
  lastName: string
  gender: Gender
  age: number
  looks: number
  smarts: number
  health: number
  happiness: number
  occupation: string
  money: number
  traits: string[]
  std: boolean
  onBirthControl: boolean
}

const RICH_JOBS = [
  'Surgeon',
  'Investment Banker',
  'Corporate Lawyer',
  'Tech Founder',
  'Orthodontist',
  'Hedge Fund Manager',
  'Movie Producer',
  'Airline Captain',
  'Real Estate Developer',
  'Anesthesiologist',
  'Chief Executive',
  'Software Architect',
]

export type WealthFilter = 'any' | 'comfortable' | 'rich' | 'loaded'

export function makeCandidate(
  g: GameState,
  o: { minAge: number; maxAge: number; gender?: Gender; quality?: 'normal' | 'premium' | 'elite'; wealth?: WealthFilter },
): Candidate {
  const c = g.character
  const gender = o.gender ?? preferredGender(g)
  const age = randInt(g, Math.max(0, o.minAge), Math.max(o.minAge, o.maxAge))
  const quality = o.quality ?? 'normal'
  const looks = quality === 'elite' ? bell(g, 70, 100) : quality === 'premium' ? bell(g, 50, 100) : bell(g, 10, 100)
  const wealth = o.wealth ?? 'any'
  let occupation = randomOccupation(g, age)
  let worth = randomWealth(g, age, occupation)
  if (age >= 22 && wealth !== 'any') {
    occupation = pick(g, RICH_JOBS)
    if (wealth === 'comfortable') worth = randInt(g, 100_000, 950_000)
    else if (wealth === 'rich') worth = randInt(g, 1_000_000, 9_500_000)
    else worth = randInt(g, 10_000_000, 250_000_000)
  }
  return {
    firstName: randomFirstName(g, c.countryId, gender),
    lastName: randomLastName(g, c.countryId),
    gender,
    age,
    looks,
    smarts: bell(g, 10, 100),
    health: bell(g, 50, 100),
    happiness: bell(g, 30, 100),
    occupation,
    money: Math.round(worth),
    traits: pickDistinct(g, TRAITS, 2),
    std: chance(g, 0.12),
    onBirthControl: chance(g, 0.5),
  }
}

/** Ages someone of this age can date. */
export function dateAgeRange(age: number): [number, number] {
  if (age < 18) return [Math.max(13, age - 2), Math.min(17, age + 2)]
  if (age < 22) return [18, age + 4]
  return [Math.max(18, age - 8), Math.min(99, age + 8)]
}

function candidateSummary(k: Candidate): string {
  const lines = [
    `${k.firstName} ${k.lastName}, ${k.age} (${k.gender === 'male' ? 'male' : 'female'})`,
    `Occupation: ${k.occupation}`,
    `Looks: ${k.looks}%  ·  Smarts: ${k.smarts}%`,
  ]
  if (k.age >= 18) lines.push(`Net worth: ${formatMoney(k.money)}`)
  lines.push(`Personality: ${k.traits.join(', ')}`)
  return lines.join('\n')
}

function personFromCandidate(g: GameState, k: Candidate, relation: RelationKind, relationship: number): Person {
  return createPerson(g, {
    relation,
    age: k.age,
    gender: k.gender,
    firstName: k.firstName,
    lastName: k.lastName,
    occupation: k.occupation,
    money: k.money,
    traits: k.traits,
    relationship,
    stats: { looks: k.looks, smarts: k.smarts, health: k.health, happiness: k.happiness },
    data: { std: k.std, birthControl: k.onBirthControl },
  })
}

/** Begin a romantic relationship, either with a new candidate or someone already in your life. */
export function startDating(g: GameState, who: Person | Candidate, how: string): Person {
  const c = g.character
  let p: Person
  if ('id' in who) {
    p = who
    if (p.relation !== 'partner') p.data.formerRelation = p.relation
    p.relation = 'partner'
    addRelationship(p, randInt(g, 8, 15))
  } else {
    p = personFromCandidate(g, who, 'partner', randInt(g, 55, 75))
  }
  p.data.datingSince = c.age
  p.data.metAt = how
  delete p.data.engagedAge
  touch(g, p)
  count(g, 'partners')
  notePerson(p, `Started dating the player at age ${c.age} (${how}).`)
  log(g, `I started dating ${fullName(p)}.`, 'good')
  remember(g, `Started dating ${fullName(p)} (${how}).`)
  return p
}

/** Why the player can't romance this person (null = fine). */
export function datingProblem(g: GameState, p: Person): string | null {
  const c = g.character
  const { him } = pronouns(p.gender)
  if (!c.alive) return 'You are dead.'
  if (!p.alive) return `${p.firstName} has passed away.`
  if (c.age < 13) return 'You are too young to date.'
  if (p.age < 13) return `${p.firstName} is too young to date.`
  if (c.age < 18 !== p.age < 18) return 'That would be illegal. One of you is a minor.'
  if (c.age < 18 && Math.abs(c.age - p.age) > 3) return 'The age gap is too big.'
  if (p.relation === 'teacher') return 'Dating a teacher? Absolutely not.'
  if (['parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'child', 'stepchild', 'grandchild', 'pet'].includes(p.relation)) {
    return "That's family. No."
  }
  if (!attractedTo(c, p.gender)) return `You aren't attracted to ${him}.`
  const partner = currentPartner(g)
  if (partner && partner.id !== p.id) return `You're already in a relationship with ${partner.firstName}.`
  return null
}

const ASK_OUT_YES = [
  '{He} said yes before you even finished the question!',
  '{He} blushed and said yes.',
  '{He} said {he} was hoping you would ask.',
  '{He} pretended to think about it, then said yes.',
]
const ASK_OUT_NO = [
  '{He} laughed in your face.',
  '{He} said {he} only sees you as a friend.',
  "{He} said {he}'d rather date a cactus.",
  '{He} pretended {he} got a phone call and walked away.',
  '{He} said {he} is focusing on {him}self right now.',
  '{He} said no, then told everyone about it.',
]

function fillPronouns(text: string, gender: Gender): string {
  const p = pronouns(gender)
  return text
    .replaceAll('{He}', p.He)
    .replaceAll('{he}', p.he)
    .replaceAll('{him}', p.him)
    .replaceAll('{His}', p.His)
    .replaceAll('{his}', p.his)
}

/** Ask someone already in your life (classmate, coworker, friend, ex) out. */
export function askOut(g: GameState, p: Person): void {
  const problem = datingProblem(g, p)
  if (problem) {
    notice(g, 'Ask Out', problem, { emoji: '\u{1F6AB}' })
    return
  }
  const c = g.character
  touch(g, p)
  count(g, 'askedOut')
  let odds = 0.25 + p.relationship / 220 + (c.stats.looks - p.stats.looks) / 250
  if (hasTrait(p, 'flirty', 'romantic')) odds += 0.1
  if (hasTrait(p, 'shy', 'serious')) odds -= 0.05
  if (p.data.married === true) odds -= 0.25
  odds = clamp(odds, 0.05, 0.92)
  if (chance(g, odds)) {
    startDating(g, p, `asked out (${relationLabel({ ...p, relation: (p.data.formerRelation as RelationKind | undefined) ?? p.relation }).toLowerCase()})`)
    addStat(g, 'happiness', randInt(g, 5, 10))
    notice(g, 'Ask Out', `You asked ${p.firstName} out. ${fillPronouns(pick(g, ASK_OUT_YES), p.gender)}\n\nYou are now dating ${fullName(p)}!`, {
      emoji: '\u{1F496}',
      tone: 'good',
    })
  } else {
    addRelationship(p, -randInt(g, 4, 10))
    addStat(g, 'happiness', -randInt(g, 3, 8))
    log(g, `I asked ${p.firstName} out and got rejected.`, 'bad')
    notice(g, 'Ask Out', `You asked ${p.firstName} out. ${fillPronouns(pick(g, ASK_OUT_NO), p.gender)}`, { emoji: '\u{1F494}', tone: 'bad' })
  }
}

// ---------------------------------------------------------------------------
// Date (Activities > Love > Date)

function dateCandidate(g: GameState): Candidate {
  const [lo, hi] = dateAgeRange(g.character.age)
  return makeCandidate(g, { minAge: lo, maxAge: hi })
}

function showDateCandidate(g: GameState, k: Candidate): void {
  scriptChoice(
    g,
    'love.date.pick',
    'Date',
    `You've met someone!\n\n${candidateSummary(k)}\n\nWould you like to ask ${pronouns(k.gender).him} out?`,
    [
      { id: 'ask', label: 'Ask them out', emoji: '\u{1F498}' },
      { id: 'next', label: 'Find someone else', emoji: '\u{1F504}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F6B6}' },
    ],
    { emoji: '\u{1F498}', data: asJson({ candidate: k, source: 'date' }) },
  )
}

function attractionOdds(g: GameState, k: Candidate, bonus = 0): number {
  const c = g.character
  return clamp(0.5 + (c.stats.looks - k.looks) / 160 + (c.stats.smarts - 50) / 500 + bonus, 0.08, 0.95)
}

defineScript('love.date.pick', (g, choice, data) => {
  const d = rec(data)
  const k = d.candidate as unknown as Candidate | undefined
  if (!k || choice === 'cancel') return
  if (choice === 'next') {
    if (!useYearAction(g, 'love.dateSearch', 8)) {
      notice(g, 'Date', "You've swiped through everyone in town this year. Try again next year.", { emoji: '\u{1F648}' })
      return
    }
    showDateCandidate(g, dateCandidate(g))
    return
  }
  const partner = currentPartner(g)
  if (partner) {
    notice(g, 'Date', `You're already in a relationship with ${partner.firstName}.`, { emoji: '\u{1F6AB}' })
    return
  }
  if (chance(g, attractionOdds(g, k))) {
    const p = startDating(g, k, 'met on a date')
    addStat(g, 'happiness', randInt(g, 6, 12))
    notice(g, 'Date', `You asked ${k.firstName} out and ${fillPronouns(pick(g, ['{he} said yes!', '{he} happily agreed!', '{he} said {he} thought you would never ask.']), k.gender)}\n\nYou're now dating ${fullName(p)}.`, {
      emoji: '\u{1F496}',
      tone: 'good',
    })
  } else {
    addStat(g, 'happiness', -randInt(g, 2, 6))
    log(g, `I asked ${k.firstName} out but got turned down.`, 'bad')
    notice(g, 'Date', `You asked ${k.firstName} out. ${fillPronouns(pick(g, ASK_OUT_NO), k.gender)}`, { emoji: '\u{1F494}', tone: 'bad' })
  }
})

// ---------------------------------------------------------------------------
// Dating app ("Kindling")

const APP_NAME = 'Kindling'
const APP_PRICE = 100
const APP_GOLD_PRICE = 1000

const APP_AGE_RANGES: { id: string; label: string; min: number; max: number }[] = [
  { id: '18', label: '18-20', min: 18, max: 20 },
  { id: '20', label: '20-29', min: 20, max: 29 },
  { id: '30', label: '30-39', min: 30, max: 39 },
  { id: '40', label: '40-49', min: 40, max: 49 },
  { id: '50', label: '50-59', min: 50, max: 59 },
  { id: '60', label: '60-69', min: 60, max: 69 },
  { id: '70', label: '70-79', min: 70, max: 79 },
  { id: '80', label: '80+', min: 80, max: 95 },
]

interface AppFilters {
  gender: Gender | 'any'
  minAge: number
  maxAge: number
  wealth: WealthFilter
  gold: boolean
}

function startDatingApp(g: GameState, gold: boolean): void {
  const c = g.character
  if (c.sexuality === 'bisexual') {
    scriptChoice(
      g,
      'love.app.gender',
      APP_NAME,
      'Who would you like to see?',
      [
        { id: 'female', label: 'Women', emoji: '\u{1F469}' },
        { id: 'male', label: 'Men', emoji: '\u{1F468}' },
        { id: 'any', label: 'Everyone', emoji: '\u{1F308}' },
      ],
      { emoji: '\u{1F525}', data: asJson({ gold }) },
    )
    return
  }
  askAppAge(g, { gender: preferredGender(g), minAge: 18, maxAge: 30, wealth: 'any', gold })
}

function askAppAge(g: GameState, f: AppFilters): void {
  scriptChoice(
    g,
    'love.app.age',
    APP_NAME,
    'What age range are you looking for?',
    APP_AGE_RANGES.map((r) => ({ id: r.id, label: r.label })),
    { emoji: '\u{1F525}', data: asJson(f) },
  )
}

defineScript('love.app.gender', (g, choice, data) => {
  const gold = rec(data).gold === true
  const gender: Gender | 'any' = choice === 'male' || choice === 'female' ? choice : 'any'
  askAppAge(g, { gender, minAge: 18, maxAge: 30, wealth: 'any', gold })
})

defineScript('love.app.age', (g, choice, data) => {
  const f = rec(data) as unknown as AppFilters
  const r = APP_AGE_RANGES.find((x) => x.id === choice) ?? APP_AGE_RANGES[1]
  const next: AppFilters = { ...f, minAge: r.min, maxAge: r.max }
  scriptChoice(
    g,
    'love.app.worth',
    APP_NAME,
    'Any preference on their net worth?',
    [
      { id: 'any', label: "Doesn't matter", emoji: '\u{1F937}' },
      { id: 'comfortable', label: '$100K+', emoji: '\u{1F4B5}' },
      { id: 'rich', label: '$1M+', emoji: '\u{1F4B0}' },
      { id: 'loaded', label: '$10M+', emoji: '\u{1F48E}' },
    ],
    { emoji: '\u{1F525}', data: asJson(next) },
  )
})

function appSwipe(g: GameState, f: AppFilters): void {
  const price = f.gold ? APP_GOLD_PRICE : APP_PRICE
  if (!spend(g, price)) {
    notice(g, APP_NAME, `You can't afford ${f.gold ? `${APP_NAME} Gold` : 'another swipe'} (${money(price)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  if (!useYearAction(g, 'love.appSwipe', 12)) {
    addMoney(g, price)
    notice(g, APP_NAME, "You've run out of matches in your area this year. Try again next year.", { emoji: '\u{1F648}' })
    return
  }
  const gender: Gender = f.gender === 'any' ? (chance(g, 0.5) ? 'male' : 'female') : f.gender
  // Rich people are pickier about being found on a filtered search; they're rarer.
  const wealthHit = f.wealth === 'any' || chance(g, f.wealth === 'comfortable' ? 0.8 : f.wealth === 'rich' ? 0.6 : 0.4)
  const k = makeCandidate(g, {
    minAge: f.minAge,
    maxAge: f.maxAge,
    gender,
    quality: f.gold ? 'premium' : 'normal',
    wealth: wealthHit ? f.wealth : 'any',
  })
  const miss = wealthHit ? '' : "\n\n(The app couldn't find anyone that wealthy, so here's the next best thing.)"
  scriptChoice(
    g,
    'love.app.match',
    APP_NAME,
    `${APP_NAME}${f.gold ? ' Gold' : ''} matched you with:\n\n${candidateSummary(k)}${miss}`,
    [
      { id: 'date', label: 'Go on a date', emoji: '\u{1F377}' },
      { id: 'again', label: `Swipe again (${money(price)})`, emoji: '\u{1F449}' },
      { id: 'close', label: 'Close the app', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F525}', data: asJson({ filters: f, candidate: k }) },
  )
}

defineScript('love.app.worth', (g, choice, data) => {
  const f = rec(data) as unknown as AppFilters
  const wealth: WealthFilter = choice === 'comfortable' || choice === 'rich' || choice === 'loaded' ? choice : 'any'
  appSwipe(g, { ...f, wealth })
})

defineScript('love.app.match', (g, choice, data) => {
  const d = rec(data)
  const f = d.filters as unknown as AppFilters | undefined
  const k = d.candidate as unknown as Candidate | undefined
  if (!f || !k || choice === 'close') return
  if (choice === 'again') {
    appSwipe(g, f)
    return
  }
  const partner = currentPartner(g)
  if (partner) {
    notice(g, APP_NAME, `You're already in a relationship with ${partner.firstName}.`, { emoji: '\u{1F6AB}' })
    return
  }
  if (chance(g, 0.12)) {
    addStat(g, 'happiness', -randInt(g, 3, 8))
    log(g, `My ${APP_NAME} date stood me up.`, 'bad')
    notice(g, APP_NAME, pick(g, [`${k.firstName} never showed up. You ate breadsticks alone for two hours.`, `${k.firstName} looked nothing like ${pronouns(k.gender).his} pictures, and you both knew it.`, `${k.firstName} unmatched you five minutes before the date.`]), { emoji: '\u{1F494}', tone: 'bad' })
    return
  }
  if (chance(g, attractionOdds(g, k, 0.2))) {
    const p = startDating(g, k, `the ${APP_NAME} app`)
    log(g, `The dating app paired me with ${article2(k.occupation)} named ${k.firstName}.`)
    addStat(g, 'happiness', randInt(g, 6, 12))
    notice(g, APP_NAME, `You went on a date with ${k.firstName} and hit it off! You're now dating ${fullName(p)}.`, { emoji: '\u{1F496}', tone: 'good' })
  } else {
    addStat(g, 'happiness', -randInt(g, 2, 5))
    notice(g, APP_NAME, `You went on a date with ${k.firstName}, but ${pronouns(k.gender).he} wasn't feeling it. ${pick(g, ['The conversation died before the appetizers did.', 'You talked about your ex for forty minutes. Mistake.', `${pronouns(k.gender).He} said you were "a lot".`])}`, { emoji: '\u{1F494}', tone: 'bad' })
  }
})

function article2(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Matchmaker

const MATCHMAKER_FEE = 5000

defineScript('love.matchmaker.pick', (g, choice, data) => {
  const k = rec(data).candidate as unknown as Candidate | undefined
  if (!k || choice !== 'date') return
  if (currentPartner(g)) {
    notice(g, 'Matchmaker', "You're already in a relationship.", { emoji: '\u{1F6AB}' })
    return
  }
  if (chance(g, attractionOdds(g, k, 0.3))) {
    const p = startDating(g, k, 'a professional matchmaker')
    addRelationship(p, randInt(g, 5, 12))
    addStat(g, 'happiness', randInt(g, 8, 14))
    notice(g, 'Matchmaker', `Sparks flew! You and ${k.firstName} are officially dating. The matchmaker would like a five-star review.`, { emoji: '\u{1F496}', tone: 'good' })
  } else {
    addStat(g, 'happiness', -randInt(g, 3, 7))
    notice(g, 'Matchmaker', `${k.firstName} politely declined a second date. Your matchmaker says "these things take time" and does not offer a refund.`, { emoji: '\u{1F494}', tone: 'bad' })
  }
})

// ---------------------------------------------------------------------------
// Hook-ups

const STDS: { name: string; curable: boolean; severity: [number, number] }[] = [
  { name: 'Chlamydia', curable: true, severity: [8, 18] },
  { name: 'Gonorrhea', curable: true, severity: [10, 20] },
  { name: 'Herpes', curable: false, severity: [6, 14] },
  { name: 'HPV', curable: false, severity: [8, 16] },
  { name: 'Syphilis', curable: true, severity: [15, 30] },
  { name: 'Crabs', curable: true, severity: [4, 10] },
  { name: 'Trichomoniasis', curable: true, severity: [6, 14] },
]

const HOOKUP_AFTER = [
  '{He} asked "What\'s your name again?" afterwards.',
  '{He} challenged you to a game of chess afterwards.',
  '{He} fell asleep halfway through.',
  '{He} asked if this makes you a couple.',
  "{He} said {he}'ll call you. {He} won't.",
  '{He} talked about {his} fantasy football team the entire time.',
  "{His} roommate walked in on you. Everyone's still recovering.",
  "{His} dog watched the whole thing and judged you.",
  'You broke the bed. Somebody owes somebody a bed frame.',
  'You snuck out while {he} was asleep.',
  'You walked around with a pep in your step the next day.',
  'You told everyone you know the next day.',
  '{He} asked for your autograph. You are not famous.',
  '{He} cried as you parted ways.',
  'You threw out your back giving it your best.',
  '{He} told you {he} lives in {his} mother\'s basement.',
  '{He} invited you to play video games afterwards.',
]

function hookupCandidate(g: GameState): Candidate {
  const a = g.character.age
  return makeCandidate(g, { minAge: Math.max(18, a - 10), maxAge: Math.min(85, a + 10) })
}

function showHookupCandidate(g: GameState, k: Candidate): void {
  const warn = k.std && chance(g, 0.6) ? '\n\n\u{26A0}\u{FE0F} Rumor has it there might be some craziness going on down below.' : ''
  scriptChoice(
    g,
    'love.hookup.pick',
    'Hook Up',
    `You met someone who's down to hook up.\n\n${candidateSummary(k)}${warn}`,
    [
      { id: 'hookup', label: 'Hook up', emoji: '\u{1F525}' },
      { id: 'next', label: 'Find someone else', emoji: '\u{1F504}' },
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F6B6}' },
    ],
    { emoji: '\u{1F48B}', data: asJson({ candidate: k }) },
  )
}

defineScript('love.hookup.pick', (g, choice, data) => {
  const k = rec(data).candidate as unknown as Candidate | undefined
  if (!k || choice === 'cancel') return
  if (choice === 'next') {
    if (!useYearAction(g, 'love.hookupSearch', 6)) {
      notice(g, 'Hook Up', "Nobody else is answering your texts this year. Try again next year.", { emoji: '\u{1F648}' })
      return
    }
    showHookupCandidate(g, hookupCandidate(g))
    return
  }
  hookUpWith(g, k)
})

/** Have a one-night stand with a new candidate or someone already in your life (adults only). */
export function hookUpWith(g: GameState, target: Person | Candidate): void {
  const c = g.character
  if (c.age < 18 || target.age < 18) {
    notice(g, 'Hook Up', 'You both need to be adults for that.', { emoji: '\u{1F6AB}' })
    return
  }
  const existing = 'id' in target ? target : null
  const partner = currentPartner(g)
  const cheating = !!partner && partner.id !== existing?.id
  const yours = bell(g, 15, 100)
  const theirs = bell(g, 15, 100)
  const carriesStd = existing ? existing.data.std === true || chance(g, 0.04) : target.std
  const name = target.firstName
  let p: Person
  if (existing) {
    p = existing
    addRelationship(p, Math.round((theirs - 50) / 5))
  } else {
    p = personFromCandidate(g, target as Candidate, 'ex', theirs)
    p.data.fling = true
    p.data.flingAge = c.age
  }
  touch(g, p)
  notePerson(p, `Hooked up with the player at age ${c.age}.`)
  count(g, 'hookups')
  addStat(g, 'happiness', randInt(g, 3, 10))
  const lines = [`You hooked up with ${name}. \u{1F525}`, '', `Your enjoyment: ${yours}%`, `${name}'s enjoyment: ${theirs}%`, '', fillPronouns(pick(g, HOOKUP_AFTER), p.gender)]
  log(g, `I hooked up with ${fullName(p)}.`)

  // STDs
  if (carriesStd && chance(g, 0.45)) {
    const std = pick(g, STDS)
    if (!c.conditions.some((x) => x.name === std.name)) {
      c.conditions.push({
        id: `c${g.nextId + 1}`,
        name: std.name,
        kind: 'std',
        severity: randInt(g, std.severity[0], std.severity[1]),
        yearsHad: 0,
        curable: std.curable,
        diagnosed: false,
        age: c.age,
      })
      g.nextId += 1
      count(g, 'stds')
      lines.push('', 'A few days later, things started to feel a little... itchy. You might want to see a doctor.')
    }
  }
  if (!existing && p.data.std !== true && chance(g, 0.15)) p.data.std = true

  // Pregnancy
  const babyOdds = existing ? 0.05 : target.onBirthControl ? 0.015 : 0.06
  if (!conceptionBlocker(g, p) && chance(g, babyOdds)) {
    conceive(g, p, 1, 'natural')
    lines.push('', c.gender === 'female' ? 'A few weeks later, you took a pregnancy test. It was positive. \u{1F633}' : `A few weeks later, ${name} called. ${pronouns(p.gender).He}'s pregnant, and you're the father. \u{1F633}`)
  }

  notice(g, 'Hook Up', lines.join('\n'), { emoji: '\u{1F48B}' })

  if (cheating && partner) {
    count(g, 'cheated')
    addHidden(g, 'karma', -3)
    if (chance(g, 0.25)) {
      addRelationship(partner, -randInt(g, 25, 45))
      if (partner.relationship < 30 && chance(g, 0.6)) {
        breakUp(g, partner, 'them', `found out you hooked up with ${name}`)
      } else {
        addStat(g, 'happiness', -randInt(g, 4, 10))
        log(g, `${cap(myRel(partner))} found out I cheated.`, 'bad')
        notice(g, 'Busted!', `${cap(yourRel(partner))} found out you hooked up with ${name}. There was yelling. There were tears. A vase didn't make it.`, { emoji: '\u{1F620}', tone: 'bad' })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Break-ups, proposals, weddings, divorce

const BREAKUP_PLAYER = [
  '{He} cried and asked what {he} did wrong.',
  '{He} threw your stuff out the window.',
  '{He} said {he} saw it coming.',
  '{He} said "Fine. I was going to dump you anyway."',
  '{He} changed {his} relationship status before you got home.',
  '{He} asked for {his} hoodie back.',
]
const BREAKUP_THEM = [
  '"It\'s not you, it\'s me." (It was you.)',
  '"I think we want different things."',
  '"I need to focus on myself right now."',
  '"I met someone at the gym."',
  '"I just don\'t feel the spark anymore."',
  '"We grew apart."',
]

/** End a dating relationship or engagement (spouses get a divorce instead). */
export function breakUp(g: GameState, p: Person, by: 'player' | 'them', reason?: string): void {
  if (p.relation === 'spouse') {
    divorce(g, p, by)
    return
  }
  const c = g.character
  const wasEngaged = p.relation === 'fiance'
  const fondness = p.relationship
  p.relation = 'ex'
  p.livesWithPlayer = false
  p.data.exAge = c.age
  p.data.brokeUp = by
  delete p.data.engagedAge
  touch(g, p)
  count(g, 'breakups')
  const { He } = pronouns(p.gender)
  if (by === 'player') {
    addRelationship(p, -randInt(g, 20, 40))
    addStat(g, 'happiness', fondness > 50 ? -randInt(g, 3, 10) : randInt(g, 2, 6))
    log(g, `I broke up with ${fullName(p)}.`, 'bad')
    notePerson(p, `The player broke up with them at age ${c.age}.`)
    notice(g, wasEngaged ? 'Engagement Over' : 'Break Up', `You broke up with ${p.firstName}. ${fillPronouns(pick(g, BREAKUP_PLAYER), p.gender)}${wasEngaged && p.data.ring ? `\n\n${He} kept the ring.` : ''}`, {
      emoji: '\u{1F494}',
    })
  } else {
    addRelationship(p, -randInt(g, 10, 25))
    addStat(g, 'happiness', -randInt(g, 8, 18))
    log(g, `${fullName(p)} broke up with me.`, 'bad')
    notePerson(p, `Broke up with the player at age ${c.age}${reason ? ` (${reason})` : ''}.`)
    notice(g, wasEngaged ? 'Engagement Called Off' : 'Dumped', `${p.firstName} broke up with you${reason ? ` because ${pronouns(p.gender).he} ${reason}` : ''}.\n\n${pick(g, BREAKUP_THEM)}`, { emoji: '\u{1F494}', tone: 'bad' })
  }
  remember(g, `Broke up with ${fullName(p)}.`)
}

/** Turn a fiancé(e) back into a boyfriend/girlfriend. */
export function cancelEngagement(g: GameState, p: Person, by: 'player' | 'them'): void {
  if (p.relation !== 'fiance') return
  p.relation = 'partner'
  delete p.data.engagedAge
  touch(g, p)
  addRelationship(p, -randInt(g, 12, 25))
  addStat(g, 'happiness', -randInt(g, 3, 8))
  if (by === 'player') {
    log(g, `I called off my engagement to ${fullName(p)}.`, 'bad')
    notice(g, 'Engagement Cancelled', `You called off your engagement to ${p.firstName}. You're still together... for now.`, { emoji: '\u{1F48D}' })
  } else {
    log(g, `${fullName(p)} called off our engagement.`, 'bad')
    notice(g, 'Engagement Cancelled', `${p.firstName} called off the engagement. You're still together, technically.`, { emoji: '\u{1F48D}', tone: 'bad' })
  }
}

interface Ring {
  id: string
  label: string
  price: number
  bonus: number
}

const RINGS: Ring[] = [
  { id: 'none', label: 'No ring', price: 0, bonus: 0 },
  { id: 'fake', label: 'Fake diamond ring', price: 60, bonus: 0.1 },
  { id: 'silver', label: 'Silver band', price: 450, bonus: 0.04 },
  { id: 'gold', label: 'Gold ring', price: 2200, bonus: 0.1 },
  { id: 'diamond', label: 'Diamond ring', price: 9500, bonus: 0.18 },
  { id: 'huge', label: 'Enormous diamond ring', price: 48000, bonus: 0.26 },
]

export function proposalProblem(g: GameState, p: Person): string | null {
  const c = g.character
  if (p.relation !== 'partner') return null
  if (c.age < 16 || p.age < 16) return 'You are both too young to get engaged.'
  return null
}

/** Propose to your boyfriend/girlfriend: pick a ring first. */
export function proposeTo(g: GameState, p: Person): void {
  const problem = proposalProblem(g, p)
  if (problem) {
    notice(g, 'Propose', problem, { emoji: '\u{1F6AB}' })
    return
  }
  scriptChoice(
    g,
    'love.propose.ring',
    'Propose',
    `How will you pop the question to ${p.firstName}?`,
    [
      ...RINGS.map((r) => ({ id: r.id, label: r.price ? `${r.label} (${money(r.price)})` : 'Propose without a ring', emoji: r.id === 'none' ? '\u{1F64F}' : '\u{1F48D}' })),
      { id: 'cancel', label: 'Not yet', emoji: '\u{1F6B6}' },
    ],
    { emoji: '\u{1F48D}', data: asJson({ pid: p.id }), personId: p.id },
  )
}

defineScript('love.propose.ring', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  const ring = RINGS.find((r) => r.id === choice)
  if (!p || !p.alive || p.relation !== 'partner' || !ring) return
  if (!spend(g, ring.price)) {
    notice(g, 'Propose', `You can't afford the ${ring.label.toLowerCase()} (${money(ring.price)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  const c = g.character
  const { He, he, him } = pronouns(p.gender)
  touch(g, p)
  count(g, 'proposals')
  const years = c.age - pNum(p, 'datingSince', c.age)
  const r = p.relationship
  let odds = r >= 80 ? 0.82 : r >= 60 ? 0.6 : r >= 40 ? 0.3 : 0.08
  if (years < 1) odds -= 0.25
  if (c.age < 18 || p.age < 18) odds -= 0.15
  if (hasTrait(p, 'romantic')) odds += 0.08
  odds += ring.bonus
  let caughtFake = false
  if (ring.id === 'fake' && p.stats.smarts > 55 && chance(g, 0.55)) {
    caughtFake = true
    odds *= 0.3
    addRelationship(p, -randInt(g, 8, 15))
  }
  odds = clamp(odds, 0.02, 0.95)
  const ringText = ring.id === 'none' ? 'without a ring' : `with ${article2(ring.label)}`
  if (chance(g, odds)) {
    p.relation = 'fiance'
    p.data.engagedAge = c.age
    if (ring.id !== 'none') {
      p.data.ring = ring.label
      p.data.ringValue = ring.price
    }
    count(g, 'engagements')
    addRelationship(p, randInt(g, 5, 12))
    addStat(g, 'happiness', randInt(g, 10, 16))
    log(g, `I proposed to ${fullName(p)} ${ringText}. ${He} said yes!`, 'good')
    remember(g, `Got engaged to ${fullName(p)}.`)
    notePerson(p, `Got engaged to the player at age ${c.age}.`)
    notice(
      g,
      'Engaged!',
      `You got down on one knee and proposed to ${p.firstName} ${ringText}.${caughtFake ? `\n\n${He} noticed the ring was fake, but said yes anyway.` : ''}\n\n${pick(g, [`${He} said yes!`, `${He} screamed "YES!" loud enough to scare a nearby pigeon.`, `${He} cried, laughed, and said yes.`])} You're engaged! \u{1F48D}`,
      { emoji: '\u{1F48D}', tone: 'good' },
    )
  } else {
    addRelationship(p, -randInt(g, 8, 18))
    addStat(g, 'happiness', -randInt(g, 8, 14))
    log(g, `I proposed to ${fullName(p)}, but ${he} said no.`, 'bad')
    const refund = ring.price > 0 ? Math.round(ring.price * 0.5) : 0
    if (refund) addMoney(g, refund)
    let text = `You proposed to ${p.firstName} ${ringText}.${caughtFake ? `\n\n${He} immediately noticed the ring was fake.` : ''}\n\n${pick(g, [`${He} said no.`, `${He} said ${he} isn't ready.`, `${He} laughed, then realized you were serious, then said no.`, `${He} said "Can we talk about this later?" which means no.`])}`
    if (refund) text += `\n\nYou returned the ring for a ${money(refund)} partial refund.`
    notice(g, 'Rejected', text, { emoji: '\u{1F494}', tone: 'bad' })
    if (p.relationship < 25 && chance(g, 0.35)) breakUp(g, p, 'them', 'felt pressured by the proposal')
    else if (chance(g, 0.05)) notice(g, 'Awkward...', `${p.firstName} asked if you could still be friends with ${him}... while you're still dating.`, { emoji: '\u{1F62C}' })
  }
})

/** Your partner proposes to you (yearly event). */
export function partnerProposes(g: GameState, p: Person): void {
  const ring = pick(g, RINGS.slice(2))
  scriptChoice(
    g,
    'love.proposed',
    'Proposal',
    `${p.firstName} got down on one knee with ${article2(ring.label)} and asked you to marry ${pronouns(p.gender).him}!`,
    [
      { id: 'yes', label: 'Say yes!', emoji: '\u{1F48D}' },
      { id: 'no', label: 'Say no', emoji: '\u{1F645}' },
    ],
    { emoji: '\u{1F48D}', data: asJson({ pid: p.id, ring: ring.label }), personId: p.id },
  )
}

defineScript('love.proposed', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || p.relation !== 'partner') return
  const c = g.character
  touch(g, p)
  if (choice === 'yes') {
    p.relation = 'fiance'
    p.data.engagedAge = c.age
    count(g, 'engagements')
    addRelationship(p, randInt(g, 8, 14))
    addStat(g, 'happiness', randInt(g, 10, 16))
    log(g, `${fullName(p)} proposed to me and I said yes!`, 'good')
    remember(g, `Got engaged to ${fullName(p)}.`)
    notice(g, 'Engaged!', `You said yes! You and ${p.firstName} are engaged. You now own ${article2(dStr(data, 'ring', 'ring'))} worth more than your car.`, { emoji: '\u{1F48D}', tone: 'good' })
  } else {
    addRelationship(p, -randInt(g, 15, 30))
    log(g, `${fullName(p)} proposed to me and I said no.`, 'bad')
    if (p.relationship < 35 && chance(g, 0.5)) breakUp(g, p, 'them', 'was crushed that you turned down the proposal')
    else notice(g, 'Proposal Declined', `You turned ${p.firstName} down. The walk back to the car was very, very quiet.`, { emoji: '\u{1F494}' })
  }
})

interface Venue {
  id: string
  label: string
  cost: number
  place: string
}

const VENUES: Venue[] = [
  { id: 'courthouse', label: 'Courthouse', cost: 250, place: 'the courthouse' },
  { id: 'vegas', label: 'Las Vegas chapel', cost: 900, place: 'a 24-hour Las Vegas chapel' },
  { id: 'backyard', label: 'Backyard wedding', cost: 4500, place: 'a backyard full of string lights' },
  { id: 'church', label: 'Church wedding', cost: 14000, place: 'a beautiful old church' },
  { id: 'beach', label: 'Beach resort', cost: 32000, place: 'a beach resort at sunset' },
  { id: 'vineyard', label: 'Vineyard', cost: 48000, place: 'a vineyard in the hills' },
  { id: 'castle', label: 'Castle', cost: 125000, place: 'an actual castle' },
]

const HONEYMOONS: { id: string; label: string; cost: number }[] = [
  { id: 'none', label: 'No honeymoon', cost: 0 },
  { id: 'roadtrip', label: 'Road trip', cost: 1200 },
  { id: 'paris', label: 'Paris', cost: 6500 },
  { id: 'bali', label: 'Bali', cost: 9000 },
  { id: 'maldives', label: 'The Maldives', cost: 16000 },
  { id: 'antarctica', label: 'Antarctica cruise', cost: 28000 },
]

const WEDDING_FLAVOR = [
  'Your uncle gave a 40-minute toast that nobody asked for.',
  'The ring bearer tried to eat the ring. It was recovered.',
  'It rained, and everyone agreed it was good luck (it was not).',
  'The DJ played the chicken dance four times.',
  'Your grandmother cried through the whole ceremony.',
  'Someone objected. It was a joke. Mostly.',
  'The cake was taller than the groomsmen.',
  'Everybody said it was the best wedding they had ever been to.',
]

export function weddingProblem(g: GameState, p: Person): string | null {
  const c = g.character
  if (p.relation !== 'fiance') return null
  if (c.age < 18) return 'Eager beaver. You are not old enough to get married.'
  if (p.age < 18) return `${p.firstName} is not old enough to get married.`
  return blockedReason(g)
}

export function planWedding(g: GameState, p: Person): void {
  const problem = weddingProblem(g, p)
  if (problem) {
    notice(g, 'Wedding', problem, { emoji: '\u{1F6AB}' })
    return
  }
  askVenue(g, p)
}

function askVenue(g: GameState, p: Person): void {
  scriptChoice(
    g,
    'love.wedding.venue',
    'Plan the Wedding',
    `Where will you and ${p.firstName} tie the knot? You have ${money(g.character.money)}.`,
    [...VENUES.map((v) => ({ id: v.id, label: `${v.label} (${money(v.cost)})`, emoji: '\u{1F492}' })), { id: 'cancel', label: 'Not yet', emoji: '\u{1F6B6}' }],
    { emoji: '\u{1F492}', data: asJson({ pid: p.id }), personId: p.id },
  )
}

defineScript('love.wedding.venue', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  const venue = VENUES.find((v) => v.id === choice)
  if (!p || !p.alive || p.relation !== 'fiance' || !venue) return
  if (!spend(g, venue.cost)) {
    notice(g, 'Plan the Wedding', `You can't afford a ${venue.label.toLowerCase()} wedding (${money(venue.cost)}).`, { emoji: '\u{1F4B8}' })
    askVenue(g, p)
    return
  }
  scriptChoice(
    g,
    'love.wedding.prenup',
    'Prenup',
    `Will you ask ${p.firstName} to sign a prenuptial agreement?\n\nYour net worth: ${formatMoney(netWorth(g))}\n${p.firstName}'s net worth: ${formatMoney(p.money)}`,
    [
      { id: 'ask', label: 'Ask for a prenup', emoji: '\u{1F4DC}' },
      { id: 'none', label: 'No prenup', emoji: '\u{1F91D}' },
    ],
    { emoji: '\u{1F4DC}', data: asJson({ pid: p.id, venue: venue.id }), personId: p.id },
  )
})

function askHoneymoon(g: GameState, p: Person, venue: string, prenup: boolean): void {
  scriptChoice(
    g,
    'love.wedding.honeymoon',
    'Honeymoon',
    `Where will you go on your honeymoon? You have ${money(g.character.money)} left.`,
    HONEYMOONS.map((h) => ({ id: h.id, label: h.cost ? `${h.label} (${money(h.cost)})` : h.label, emoji: h.cost ? '\u{2708}\u{FE0F}' : '\u{1F3E0}' })),
    { emoji: '\u{1F334}', data: asJson({ pid: p.id, venue, prenup }), personId: p.id },
  )
}

defineScript('love.wedding.prenup', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  const venue = dStr(data, 'venue')
  if (!p || !p.alive || p.relation !== 'fiance') return
  if (choice !== 'ask') {
    askHoneymoon(g, p, venue, false)
    return
  }
  let refuse = 0.4
  if (p.money < netWorth(g) / 2) refuse += 0.15
  if (p.money > netWorth(g) * 2) refuse -= 0.25
  if (hasTrait(p, 'romantic', 'jealous')) refuse += 0.1
  if (!chance(g, clamp(refuse, 0.05, 0.9))) {
    log(g, `${fullName(p)} signed a prenup.`)
    askHoneymoon(g, p, venue, true)
    return
  }
  addRelationship(p, -randInt(g, 8, 15))
  if (chance(g, 0.12)) {
    cancelEngagement(g, p, 'them')
    notice(g, 'Prenup', `${p.firstName} was so offended by the prenup that ${pronouns(p.gender).he} called off the wedding. Your venue deposit is gone.`, { emoji: '\u{1F4DC}', tone: 'bad' })
    return
  }
  scriptChoice(
    g,
    'love.wedding.prenupRefused',
    'Prenup',
    `${p.firstName} refused to sign the prenup. "${pick(g, ['So you think this is going to fail?', "I'm not marrying a contract.", 'Wow. Just wow.', 'My lawyer says absolutely not. I do not have a lawyer.'])}"`,
    [
      { id: 'marry', label: 'Marry without a prenup', emoji: '\u{1F492}' },
      { id: 'cancel', label: 'Call off the wedding', emoji: '\u{1F6AB}' },
    ],
    { emoji: '\u{1F4DC}', data: asJson({ pid: p.id, venue }), personId: p.id },
  )
})

defineScript('love.wedding.prenupRefused', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || p.relation !== 'fiance') return
  if (choice === 'cancel') {
    cancelEngagement(g, p, 'player')
    return
  }
  askHoneymoon(g, p, dStr(data, 'venue'), false)
})

defineScript('love.wedding.honeymoon', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive || p.relation !== 'fiance') return
  const venue = dStr(data, 'venue')
  const prenup = rec(data).prenup === true
  const h = HONEYMOONS.find((x) => x.id === choice) ?? HONEYMOONS[0]
  if (!spend(g, h.cost)) {
    notice(g, 'Honeymoon', `You can't afford ${h.label} (${money(h.cost)}).`, { emoji: '\u{1F4B8}' })
    askHoneymoon(g, p, venue, prenup)
    return
  }
  performWedding(g, p, { venue, prenup, honeymoon: h.id === 'none' ? null : h.label })
})

/** Make it official. */
export function performWedding(g: GameState, p: Person, o: { venue: string; prenup: boolean; honeymoon: string | null }): void {
  const c = g.character
  const v = VENUES.find((x) => x.id === o.venue)
  p.relation = 'spouse'
  p.data.marriedAge = c.age
  p.data.prenup = o.prenup
  p.data.venue = v ? v.label : 'Eloped'
  delete p.data.engagedAge
  delete p.data.waitForMarriage
  p.livesWithPlayer = true
  touch(g, p)
  count(g, 'marriages')
  addRelationship(p, randInt(g, 10, 16))
  addStat(g, 'happiness', randInt(g, 12, 20))
  const where = v ? v.place : 'a secret ceremony'
  log(g, `I married ${fullName(p)} at ${where}.`, 'good')
  remember(g, `Married ${fullName(p)}${o.prenup ? ' (with a prenup)' : ''}.`)
  notePerson(p, `Married the player at age ${c.age}.`)
  let text = `You married ${p.firstName} at ${where}! \u{1F492}\n\n${pick(g, WEDDING_FLAVOR)}`
  if (o.prenup) text += '\n\nThe prenup is signed and filed.'
  if (o.honeymoon) {
    addStat(g, 'happiness', randInt(g, 4, 8))
    addStat(g, 'health', randInt(g, 1, 4))
    text += `\n\nYou honeymooned in ${o.honeymoon}. ${pick(g, ['It was magical.', 'You got the worst sunburn of your life.', 'You barely left the hotel room. The minibar bill was astonishing.', 'You lost your luggage but found each other. Aww.'])}`
    log(g, `We honeymooned in ${o.honeymoon}.`)
  }
  notice(g, 'Just Married!', text, { emoji: '\u{1F492}', tone: 'good' })
}

export function elope(g: GameState, p: Person): void {
  const problem = weddingProblem(g, p)
  if (problem) {
    notice(g, 'Elope', problem, { emoji: '\u{1F6AB}' })
    return
  }
  touch(g, p)
  let odds = 0.3 + p.relationship / 400
  if (hasTrait(p, 'romantic', 'rebellious', 'flirty')) odds += 0.2
  if (hasTrait(p, 'serious', 'religious', 'anxious')) odds -= 0.12
  if (chance(g, clamp(odds, 0.05, 0.85))) {
    performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
    log(g, 'We eloped!')
  } else {
    addRelationship(p, -randInt(g, 5, 12))
    notice(g, 'Elope', `${p.firstName} refused to elope. "${pick(g, ['My mother would never forgive me.', 'I want a real wedding with a cake taller than me.', 'Are you trying to avoid paying for a wedding?'])}"`, { emoji: '\u{1F645}' })
  }
}

export function renewVows(g: GameState, p: Person): void {
  const c = g.character
  const since = pNum(p, 'vowsAge', pNum(p, 'marriedAge', c.age))
  if (c.age - since < 10) {
    notice(g, 'Renew Vows', `You've only been married ${c.age - since} years. ${p.firstName} says to ask again after your 10th anniversary.`, { emoji: '\u{23F3}' })
    return
  }
  touch(g, p)
  if (chance(g, p.relationship >= 60 ? 0.88 : 0.4)) {
    const cost = Math.min(2500, Math.max(0, c.money))
    spend(g, cost)
    p.data.vowsAge = c.age
    addRelationship(p, randInt(g, 12, 20))
    addStat(g, 'happiness', randInt(g, 8, 12))
    log(g, `${fullName(p)} and I renewed our wedding vows.`, 'good')
    notice(g, 'Renew Vows', `You and ${p.firstName} renewed your vows in front of family and friends.${cost ? ` It cost ${money(cost)}.` : ''} ${pick(g, ['There was not a dry eye in the house.', 'You still got the words wrong.', 'Your kids rolled their eyes the whole time.'])}`, {
      emoji: '\u{1F492}',
      tone: 'good',
    })
  } else {
    addRelationship(p, -randInt(g, 4, 8))
    notice(g, 'Renew Vows', `${p.firstName} said no. "We can barely stand each other right now."`, { emoji: '\u{1F645}', tone: 'bad' })
  }
}

export function couplesCounseling(g: GameState, p: Person): void {
  const c = g.character
  const fee = c.age >= 18 ? randInt(g, 250, 600) : 0
  if (!canAfford(g, fee)) {
    notice(g, 'Counseling', `You can't afford couples counseling (${money(fee)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  touch(g, p)
  if (!chance(g, clamp(0.4 + p.relationship / 200 + (hasTrait(p, 'caring', 'kind') ? 0.15 : 0), 0.15, 0.9))) {
    addRelationship(p, -randInt(g, 3, 8))
    if (chance(g, 0.35)) {
      addStat(g, 'happiness', -randInt(g, 3, 6))
      notice(g, 'Counseling', `${p.firstName} refused to go to counseling, and it turned into an argument about whether you two even need counseling. (You do.)`, { emoji: '\u{1F620}', tone: 'bad' })
    } else {
      notice(g, 'Counseling', `${p.firstName} refused to go to counseling. "We don't need a stranger telling us how to love."`, { emoji: '\u{1F645}' })
    }
    return
  }
  spend(g, fee)
  const gain = randInt(g, 8, 22)
  addRelationship(p, gain)
  addStat(g, 'happiness', randInt(g, 2, 6))
  log(g, `${fullName(p)} and I went to couples counseling.`)
  notice(g, 'Counseling', `You and ${p.firstName} went to the counseling office${fee ? ` (${money(fee)})` : ''}. ${pick(g, ['The therapist made you hold hands and say three nice things. It worked.', 'You both cried. You both felt better.', 'You learned about "love languages". Yours is apparently snacks.', 'The counselor took a lot of notes. A worrying amount of notes.'])}`, { emoji: '\u{1F6CB}\u{FE0F}', tone: 'good' })
}

/** Divorce your spouse, splitting assets unless there's a prenup. */
export function divorce(g: GameState, p: Person, by: 'player' | 'them'): void {
  if (p.relation !== 'spouse') {
    breakUp(g, p, by)
    return
  }
  const c = g.character
  const fondness = p.relationship
  const prenup = p.data.prenup === true
  const lines: string[] = []
  lines.push(by === 'player' ? `You divorced ${p.firstName}.` : `${p.firstName} filed for divorce. "${pick(g, BREAKUP_THEM)}"`)

  // Settlement
  let owed = 0
  if (!prenup) {
    const mine = Math.max(0, netWorth(g))
    const theirs = Math.max(0, p.money)
    owed = Math.round(((mine - theirs) / 2) * randFloat(g, 0.5, 1))
    if (Math.abs(owed) < 500) owed = 0
  }
  if (prenup) {
    lines.push('Thanks to the prenup, nobody owes anybody anything. Your lawyer high-fived you.')
  } else if (owed > 0) {
    const cash = Math.min(owed, Math.max(0, c.money))
    if (cash > 0) {
      spend(g, cash)
      p.money += cash
    }
    let remaining = owed - cash
    const taken: string[] = []
    const candidates = [...g.assets]
      .filter((a) => a.id !== c.residence.assetId)
      .map((a) => ({ a, equity: Math.max(0, a.value - (a.mortgage?.balance ?? 0)) }))
      .sort((x, y) => y.equity - x.equity)
    for (const { a, equity } of candidates) {
      if (remaining <= 0) break
      if (equity <= 0) continue
      g.assets = g.assets.filter((x) => x.id !== a.id)
      p.money += equity
      remaining -= equity
      taken.push(a.name)
    }
    lines.push(`The judge ordered you to pay ${money(owed)} to your ex.`)
    if (taken.length) lines.push(`${p.firstName} also got your ${taken.join(', ')}.`)
  } else if (owed < 0) {
    const receive = Math.min(-owed, Math.max(0, p.money))
    if (receive > 0) {
      addMoney(g, receive)
      p.money -= receive
      lines.push(`The judge ordered ${p.firstName} to pay you ${money(receive)}.`)
    } else {
      lines.push('Neither of you owed the other anything.')
    }
  } else {
    lines.push('Neither of you owed the other anything.')
  }

  p.relation = 'exSpouse'
  p.livesWithPlayer = false
  p.data.divorcedAge = c.age
  p.data.divorcedBy = by
  touch(g, p)
  addRelationship(p, -randInt(g, 15, 30))
  count(g, 'divorces')
  addStat(g, 'happiness', fondness >= 40 ? -randInt(g, 10, 20) : -randInt(g, 0, 6))

  // Stepchildren leave with their parent; shared kids may split custody.
  const steps = g.people.filter((x) => x.relation === 'stepchild' && x.data.viaSpouseId === p.id)
  if (steps.length) {
    g.people = g.people.filter((x) => !steps.includes(x))
    lines.push(`You are no longer a stepparent to ${steps.map((s) => s.firstName).join(' and ')}.`)
  }
  const kids = children(g).filter((k) => k.otherParentId === p.id && k.age < 18 && k.livesWithPlayer)
  const leaving = kids.filter(() => chance(g, 0.5))
  for (const k of leaving) k.livesWithPlayer = false
  if (leaving.length) lines.push(`${leaving.map((k) => k.firstName).join(' and ')} will live with ${p.firstName}.`)

  log(g, by === 'player' ? `I divorced ${fullName(p)}.` : `${fullName(p)} divorced me.`, 'bad')
  remember(g, `Divorced ${fullName(p)}.`)
  notePerson(p, `Divorced the player at age ${c.age}.`)
  notice(g, 'Divorce', lines.join('\n\n'), { emoji: '\u{1F4C4}', tone: 'bad' })
}

// ---------------------------------------------------------------------------
// Pregnancy & babies

export interface PlayerPregnancy {
  otherParentId: string | null
  via: 'natural' | 'ivf' | 'insemination' | 'surrogate'
  babies: number
  surrogateName: string | null
}

export function playerPregnancy(g: GameState): PlayerPregnancy | null {
  const v = g.flags.pregnancy
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return {
    otherParentId: typeof v.otherParentId === 'string' ? v.otherParentId : null,
    via: v.via === 'ivf' || v.via === 'insemination' || v.via === 'surrogate' ? v.via : 'natural',
    babies: typeof v.babies === 'number' ? Math.max(1, Math.min(3, Math.round(v.babies))) : 1,
    surrogateName: typeof v.surrogateName === 'string' ? v.surrogateName : null,
  }
}

/** Who would carry a baby between the player and this person: 'player', 'them' or null (can't). */
function carrierWith(g: GameState, p: Person): 'player' | 'them' | null {
  const c = g.character
  if (c.gender === p.gender) return null
  return c.gender === 'female' ? 'player' : 'them'
}

/** Why the player and this person can't conceive right now (null = they can). */
export function conceptionBlocker(g: GameState, p: Person): string | null {
  const c = g.character
  const carrier = carrierWith(g, p)
  if (!carrier) return "You two can't conceive naturally. Try adoption, a surrogate, or the fertility clinic."
  if (g.flags.sterile === true) return c.gender === 'male' ? 'Your vasectomy is doing its job.' : 'Your tubal ligation is doing its job.'
  const motherAge = carrier === 'player' ? c.age : p.age
  if (motherAge > 50) return carrier === 'player' ? "You're too old to get pregnant." : `${p.firstName} is too old to get pregnant.`
  if (carrier === 'player' && playerPregnancy(g)) return "You're already pregnant!"
  if (carrier === 'them' && p.pregnant) return `${p.firstName} is already pregnant!`
  return null
}

function fertilityFactor(g: GameState, p: Person): number {
  const c = g.character
  const motherAge = c.gender === 'female' ? c.age : p.age
  const ageFactor = motherAge <= 30 ? 1 : motherAge <= 35 ? 0.85 : motherAge <= 40 ? 0.6 : motherAge <= 45 ? 0.3 : 0.08
  return ageFactor * (0.6 + c.hidden.fertility / 250)
}

/** Start a pregnancy between the player and p (no checks). */
export function conceive(g: GameState, p: Person, babies: number, via: PlayerPregnancy['via']): void {
  const c = g.character
  if (c.gender === 'female' && p.gender === 'male') {
    g.flags.pregnancy = asJson({ otherParentId: p.id, via, babies, surrogateName: null })
  } else {
    p.pregnant = true
    p.data.babies = babies
  }
  count(g, 'pregnancies')
  remember(g, c.gender === 'female' ? `Got pregnant (father: ${fullName(p)}).` : `${fullName(p)} got pregnant.`)
}

function rollMultiples(g: GameState, twinOdds: number): number {
  if (chance(g, twinOdds / 8)) return 3
  return chance(g, twinOdds) ? 2 : 1
}

function announcePregnancy(g: GameState, p: Person, babies: number): void {
  const c = g.character
  const multi = babies === 3 ? ' Triplets!' : babies === 2 ? ' Twins!' : ''
  if (c.gender === 'female') {
    log(g, `I found out I'm pregnant with ${p.firstName}'s baby.`, 'event')
    notice(g, 'Pregnant!', `You're pregnant!${multi} ${p.firstName} is the father. The baby is due next year. \u{1F930}`, { emoji: '\u{1F930}', tone: 'good' })
  } else {
    log(g, `${cap(myRel(p))} is pregnant!`, 'event')
    notice(g, 'Pregnant!', `${cap(yourRel(p))} is pregnant!${multi} The baby is due next year. \u{1F930}`, { emoji: '\u{1F930}', tone: 'good' })
  }
}

const MAKE_LOVE_LINES = [
  'You and {name} made love. \u{1F495}',
  'You and {name} had a romantic night in. \u{1F495}',
  'You and {name} turned off your phones and made love. \u{1F495}',
]
const MAKE_LOVE_AFTER = [
  '{He} said it was the best night of {his} life.',
  '{He} fell asleep immediately afterwards.',
  'You broke the bed. Again.',
  'The neighbors banged on the wall. Twice.',
  '{He} asked if you wanted to cuddle and watch documentaries.',
  '{He} said "that was nice" in a way you will be thinking about for weeks.',
  'Neither of you will ever look the neighbors in the eye again.',
]

export function intimacyProblem(g: GameState, p: Person): string | null {
  const c = g.character
  if (c.age < 18) return 'You must be 18 or older.'
  if (p.age < 18) return `${p.firstName} must be 18 or older.`
  return blockedReason(g)
}

/** "Make Love" with a partner or lover (non-explicit). May conceive. */
export function makeLove(g: GameState, p: Person): void {
  const problem = intimacyProblem(g, p)
  if (problem) {
    notice(g, 'Make Love', problem, { emoji: '\u{1F6AB}' })
    return
  }
  const c = g.character
  touch(g, p)
  if (p.relation !== 'spouse' && p.data.waitChecked !== true) {
    p.data.waitChecked = true
    if (chance(g, 0.12)) p.data.waitForMarriage = true
  }
  if (p.relation !== 'spouse' && p.data.waitForMarriage === true) {
    scriptChoice(
      g,
      'love.makeLove.wait',
      'Make Love',
      `${p.firstName} told you ${pronouns(p.gender).he} wants to wait until marriage.`,
      [
        { id: 'respect', label: 'Respect their wishes', emoji: '\u{1F91D}' },
        { id: 'argue', label: 'Argue with them', emoji: '\u{1F620}' },
        ...(p.relation === 'partner' && !proposalProblem(g, p) ? [{ id: 'propose', label: 'Propose', emoji: '\u{1F48D}' }] : []),
      ],
      { emoji: '\u{1F495}', data: asJson({ pid: p.id }), personId: p.id },
    )
    return
  }
  const notInMood = p.relationship < 30 ? 0.5 : 0.12
  if (chance(g, notInMood)) {
    addRelationship(p, -1)
    notice(g, 'Make Love', `${p.firstName} ${pick(g, ["wasn't in the mood.", 'said they have a headache.', 'fell asleep on the couch before you could ask.', 'said "Not tonight, I just washed my hair."'])}`, { emoji: '\u{1F634}' })
    return
  }
  addRelationship(p, randInt(g, 3, 8))
  addStat(g, 'happiness', randInt(g, 4, 10))
  const lines = [pick(g, MAKE_LOVE_LINES).replace('{name}', p.firstName), '', fillPronouns(pick(g, MAKE_LOVE_AFTER), p.gender)]
  log(g, `${fullName(p)} and I made love.`)
  const partner = currentPartner(g)
  if (p.relation === 'lover' && partner) {
    count(g, 'cheated')
    addHidden(g, 'karma', -2)
  }
  let pregnant = false
  if (!conceptionBlocker(g, p)) {
    const onBc = c.gender === 'female' ? g.flags.birthControl === true : p.data.birthControl === true
    if (chance(g, 0.08 * fertilityFactor(g, p) * (onBc ? 0.08 : 1))) {
      const babies = rollMultiples(g, 0.03)
      conceive(g, p, babies, 'natural')
      pregnant = true
      notice(g, 'Make Love', lines.join('\n'), { emoji: '\u{1F495}' })
      announcePregnancy(g, p, babies)
    }
  }
  if (!pregnant) notice(g, 'Make Love', lines.join('\n'), { emoji: '\u{1F495}' })
  if (p.relation === 'lover' && partner && chance(g, 0.15)) {
    addRelationship(partner, -randInt(g, 25, 40))
    if (partner.relationship < 30 && chance(g, 0.5)) breakUp(g, partner, 'them', `caught you with ${p.firstName}`)
    else notice(g, 'Busted!', `${cap(yourRel(partner))} caught you sneaking around with ${p.firstName}. That's going to be a long conversation.`, { emoji: '\u{1F620}', tone: 'bad' })
  }
}

defineScript('love.makeLove.wait', (g, choice, data) => {
  const p = getPerson(g, dStr(data, 'pid'))
  if (!p || !p.alive) return
  if (choice === 'respect') {
    addRelationship(p, randInt(g, 10, 16))
    notice(g, 'Make Love', `You told ${p.firstName} you'd wait. ${pronouns(p.gender).He} hugged you so hard your back cracked.`, { emoji: '\u{1F91D}', tone: 'good' })
  } else if (choice === 'propose') {
    proposeTo(g, p)
  } else {
    addRelationship(p, -randInt(g, 15, 25))
    addHidden(g, 'karma', -4)
    notice(g, 'Make Love', `You argued with ${p.firstName} about it. ${pronouns(p.gender).He} is very, very upset with you.`, { emoji: '\u{1F620}', tone: 'bad' })
  }
})

export function tryForBaby(g: GameState, p: Person): void {
  const problem = intimacyProblem(g, p) ?? conceptionBlocker(g, p)
  if (problem) {
    notice(g, 'Try for a Baby', problem, { emoji: '\u{1F6AB}' })
    return
  }
  const c = g.character
  touch(g, p)
  const willing = (p.relation === 'spouse' ? 0.75 : p.relation === 'fiance' ? 0.55 : 0.35) + (p.relationship - 50) / 200
  if (!chance(g, clamp(willing, 0.05, 0.95))) {
    addRelationship(p, -randInt(g, 1, 4))
    notice(g, 'Try for a Baby', `${p.firstName} said ${pronouns(p.gender).he}'s not ready to have kids. ${pick(g, ['"Maybe in a few years."', '"We can barely keep a houseplant alive."', '"Ask me again after the honeymoon phase."'])}`, { emoji: '\u{1F645}' })
    return
  }
  if (c.gender === 'female') g.flags.birthControl = false
  else p.data.birthControl = false
  addRelationship(p, randInt(g, 2, 6))
  addStat(g, 'happiness', randInt(g, 2, 6))
  if (chance(g, 0.45 * fertilityFactor(g, p))) {
    const babies = rollMultiples(g, 0.03)
    conceive(g, p, babies, 'natural')
    announcePregnancy(g, p, babies)
  } else {
    log(g, `${fullName(p)} and I tried for a baby.`)
    notice(g, 'Try for a Baby', `You and ${p.firstName} tried for a baby. No luck yet. ${pick(g, ['Maybe next year.', 'The fertility app says to "relax". Thanks, app.', 'Your mother keeps asking. Please make her stop.'])}`, { emoji: '\u{1F37C}' })
  }
}

export function askBirthControl(g: GameState, p: Person): void {
  const c = g.character
  if (c.gender === 'female' || p.gender !== 'female') return
  touch(g, p)
  const on = p.data.birthControl === true
  const agree = clamp(0.45 + p.relationship / 250, 0.1, 0.9)
  if (chance(g, agree)) {
    p.data.birthControl = !on
    notice(g, 'Birth Control', on ? `${p.firstName} agreed to stop taking birth control. \u{1F476}?` : `${p.firstName} agreed to start taking birth control.`, { emoji: '\u{1F48A}' })
  } else {
    addRelationship(p, -randInt(g, 3, 7))
    notice(g, 'Birth Control', on ? `${p.firstName} refused to stop taking birth control. "I'm not ready."` : `${p.firstName} refused to go on birth control. "My body, my choice."`, { emoji: '\u{1F645}' })
  }
}

const BABY_LINES_THEM = ['{label} gave birth to a healthy baby {kid}!', 'Congratulations! {label} gave birth to a beautiful baby {kid}!', '{label} just delivered a baby {kid} who already has your nose!']

/** Births at age-up: partners/flings who were pregnant and the player's own pregnancy. Asks to name each baby. */
export function processPregnancies(g: GameState): void {
  const c = g.character
  for (const p of [...g.people]) {
    if (!p.pregnant) continue
    const babies = Math.max(1, Math.min(3, pNum(p, 'babies', 1)))
    delete p.pregnant
    delete p.data.babies
    if (!p.alive) continue
    if (chance(g, 0.02)) {
      addStat(g, 'happiness', -randInt(g, 8, 15))
      log(g, `${cap(myRel(p))} had a miscarriage.`, 'bad')
      notice(g, 'Miscarriage', `${cap(yourRel(p))} lost the baby. You are both heartbroken. \u{1F494}`, { emoji: '\u{1F494}', tone: 'bad' })
      continue
    }
    deliver(g, p, babies, 'them', null)
  }
  const preg = playerPregnancy(g)
  if (preg) {
    delete g.flags.pregnancy
    const other = getPerson(g, preg.otherParentId ?? undefined) ?? null
    if (preg.via !== 'surrogate' && chance(g, 0.02)) {
      addStat(g, 'happiness', -randInt(g, 8, 15))
      log(g, 'I had a miscarriage.', 'bad')
      notice(g, 'Miscarriage', 'You lost the baby. Take all the time you need. \u{1F494}', { emoji: '\u{1F494}', tone: 'bad' })
      return
    }
    if (preg.via === 'surrogate' && chance(g, 0.06)) {
      addStat(g, 'happiness', -randInt(g, 10, 18))
      log(g, `My surrogate ${preg.surrogateName ?? ''} decided to keep the baby.`.replace('  ', ' '), 'bad')
      notice(g, 'Surrogate', `Your surrogate${preg.surrogateName ? `, ${preg.surrogateName},` : ''} decided to keep the baby and broke the contract. You could sue, but the baby isn't coming back.`, { emoji: '\u{1F494}', tone: 'bad' })
      return
    }
    void c
    deliver(g, other, preg.babies, preg.via === 'surrogate' ? 'surrogate' : 'player', preg.surrogateName)
  }
}

function uniqueFirstName(g: GameState, gender: Gender): string {
  const used = new Set(g.people.filter((p) => p.alive && p.relation !== 'pet').map((p) => p.firstName))
  used.add(g.character.firstName)
  let name = randomFirstName(g, g.character.countryId, gender)
  for (let i = 0; i < 12 && used.has(name); i++) name = randomFirstName(g, g.character.countryId, gender)
  return name
}

function deliver(g: GameState, other: Person | null, babies: number, carrier: 'them' | 'player' | 'surrogate', surrogateName: string | null): void {
  const c = g.character
  const togetherWithOther = !!other && other.alive && isRomantic(other)
  const livesWithPlayer = !inPrison(g) && (carrier !== 'them' || togetherWithOther)
  addStat(g, 'happiness', randInt(g, 8, 15))
  if (other && other.relation === 'ex') other.data.babyParent = true
  for (let i = 0; i < babies; i++) {
    const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
    const avg = (k: 'smarts' | 'looks') => Math.round(((c.stats[k] + (other?.stats[k] ?? 50)) / 2) + randInt(g, -15, 15))
    const skin = other && typeof other.data.skinTone === 'number' && chance(g, 0.5) ? (other.data.skinTone as number) : c.avatar.skinTone
    const kid = createPerson(g, {
      relation: 'child',
      age: 0,
      gender,
      firstName: uniqueFirstName(g, gender),
      lastName: c.lastName,
      occupation: 'Baby',
      relationship: randInt(g, 90, 100),
      money: 0,
      stats: { smarts: clamp(avg('smarts')), looks: clamp(avg('looks')), health: randInt(g, 70, 100), happiness: randInt(g, 80, 100) },
      otherParentId: other?.id,
      biological: true,
      livesWithPlayer,
      skinTone: skin,
      data: { bornAge: c.age, lastInteractionAge: c.age },
    })
    count(g, 'children')
    const kidW = kidWord(gender)
    let title = gender === 'male' ? "It's a boy!" : "It's a girl!"
    if (babies > 1) title = babies === 3 ? `Triplets! (#${i + 1})` : `Twins! (#${i + 1})`
    let text: string
    let logLine: string
    const kin = childWord(gender)
    if (carrier === 'player') {
      text = `You gave birth to a healthy baby ${kidW}!${other ? ` ${other.firstName} is the father.` : ''}`
      logLine = `I gave birth to my ${kin}, {name}.`
    } else if (carrier === 'surrogate') {
      text = `Your surrogate${surrogateName ? `, ${surrogateName},` : ''} delivered a healthy baby ${kidW}!`
      logLine = `My surrogate gave birth to my ${kin}, {name}.`
    } else {
      const label = other ? cap(yourRel(other)) : 'Your partner'
      text = pick(g, BABY_LINES_THEM).replace('{label}', label).replace('{kid}', kidW)
      logLine = `${other ? cap(myRel(other)) : 'My partner'} gave birth to my ${kin}, {name}.`
      if (!livesWithPlayer && !inPrison(g)) text += ` The baby will live with ${other ? other.firstName : 'the mother'}.`
    }
    if (inPrison(g)) text += '\n\nSince you are in prison, the baby will be raised by family.'
    text += `\n\nWhat would you like to name ${gender === 'male' ? 'him' : 'her'}?`
    scriptInput(g, {
      title,
      emoji: '\u{1F476}',
      text,
      input: 'text',
      placeholder: kid.firstName,
      defaultValue: kid.firstName,
      scriptId: 'love.baby.name',
      data: asJson({ childId: kid.id, logLine }),
    })
  }
}

export function sanitizeName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{M}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
  if (!cleaned) return fallback
  return cleaned
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

defineScript('love.baby.name', (g, value, data) => {
  const kid = getPerson(g, dStr(data, 'childId'))
  if (!kid) return
  kid.firstName = sanitizeName(value, kid.firstName)
  const line = dStr(data, 'logLine', 'I had a baby named {name}.').replace('{name}', kid.firstName)
  log(g, line, 'good')
  remember(g, `Had a ${childWord(kid.gender)} named ${kid.firstName}.`)
  notePerson(kid, `Born when the player was ${g.character.age}.`)
})

// ---------------------------------------------------------------------------
// Fertility clinic

const SURROGATE_NAMES_F = ['Brianna', 'Keisha', 'Monica', 'Rosa', 'Tamsin', 'Delia', 'Ingrid', 'Paloma', 'Yuki', 'Amara']

function fertilityNodes(): MenuNode[] {
  const bc: MenuAction = {
    type: 'action',
    id: 'birthControl',
    label: 'Birth Control',
    emoji: '\u{1F48A}',
    subtitle: (g) => (g.flags.birthControl === true ? 'You are on birth control' : 'You are not on birth control'),
    visible: (g) => g.character.gender === 'female',
    disabledReason: (g) => tooYoungReason(g, 14) ?? (g.character.age > 55 ? "You don't need birth control anymore." : null),
    run: (g) => {
      const on = g.flags.birthControl === true
      g.flags.birthControl = !on
      const partner = currentPartner(g)
      log(g, on ? 'I stopped taking birth control.' : 'I started taking birth control.')
      let text = on ? 'You stopped taking birth control.' : 'You started taking birth control.'
      if (on && partner && partner.gender === 'male' && chance(g, 0.3)) {
        addRelationship(partner, -randInt(g, 3, 8))
        text += ` ${partner.firstName} found out and isn't thrilled you didn't talk to ${pronouns(partner.gender).him} first.`
      }
      notice(g, 'Birth Control', text, { emoji: '\u{1F48A}' })
    },
  }
  const sterilize: MenuAction = {
    type: 'action',
    id: 'sterilize',
    label: 'Vasectomy',
    emoji: '\u{2702}\u{FE0F}',
    subtitle: (g) => (g.character.gender === 'male' ? `Never worry about it again (${money(900)})` : `Never worry about it again (${money(3500)})`),
    visible: (g) => g.flags.sterile !== true,
    disabledReason: (g) => tooYoungReason(g, 18),
    confirm: (g) => `Are you sure? This is meant to be permanent${g.character.gender === 'male' ? '' : ' (tubal ligation)'}.`,
    run: (g) => {
      const cost = g.character.gender === 'male' ? 900 : 3500
      if (!spend(g, cost)) {
        notice(g, 'Fertility', `You can't afford the procedure (${money(cost)}).`, { emoji: '\u{1F4B8}' })
        return
      }
      g.flags.sterile = true
      const male = g.character.gender === 'male'
      log(g, male ? 'I got a vasectomy.' : 'I got my tubes tied.')
      const partner = currentPartner(g)
      let text = male ? 'You got a vasectomy. You walked funny for a week, but no more surprises.' : 'You had a tubal ligation. No more surprises.'
      if (partner && chance(g, 0.4)) {
        addRelationship(partner, -randInt(g, 5, 12))
        text += ` ${partner.firstName} wishes you had asked first.`
      }
      notice(g, 'Fertility', text, { emoji: '\u{2702}\u{FE0F}' })
    },
  }
  const reverse: MenuAction = {
    type: 'action',
    id: 'reverse',
    label: 'Reverse Procedure',
    emoji: '\u{1F504}',
    subtitle: `Undo your sterilization (${money(12000)})`,
    visible: (g) => g.flags.sterile === true,
    run: (g) => {
      if (!spend(g, 12000)) {
        notice(g, 'Fertility', `You can't afford the reversal (${money(12000)}).`, { emoji: '\u{1F4B8}' })
        return
      }
      if (chance(g, 0.65)) {
        g.flags.sterile = false
        notice(g, 'Fertility', 'The reversal worked! You can have children again.', { emoji: '\u{1F389}', tone: 'good' })
      } else {
        notice(g, 'Fertility', "The reversal didn't work. The doctor kept the money anyway.", { emoji: '\u{1F614}', tone: 'bad' })
      }
    },
  }
  const ivf: MenuAction = {
    type: 'action',
    id: 'ivf',
    label: 'IVF',
    emoji: '\u{1F9EB}',
    subtitle: `In vitro fertilization with your partner (${money(15000)})`,
    disabledReason: (g) => {
      const young = tooYoungReason(g, 18)
      if (young) return young
      const p = currentPartner(g)
      if (!p) return 'You need a partner for IVF.'
      if (p.gender === g.character.gender) return 'IVF needs an egg and a womb in the relationship. Try a surrogate instead.'
      return conceptionBlocker(g, p)
    },
    run: (g) => {
      const p = currentPartner(g)
      if (!p) return
      if (!useYearAction(g, 'love.ivf', 1)) {
        notice(g, 'IVF', 'The clinic says you need to wait until next year before another round.', { emoji: '\u{23F3}' })
        return
      }
      if (!canAfford(g, 15000)) {
        notice(g, 'IVF', `You can't afford IVF (${money(15000)}).`, { emoji: '\u{1F4B8}' })
        return
      }
      touch(g, p)
      if (!chance(g, clamp(0.45 + p.relationship / 200, 0.2, 0.92))) {
        addRelationship(p, -randInt(g, 2, 5))
        notice(g, 'IVF', `${p.firstName} isn't ready to try IVF.`, { emoji: '\u{1F645}' })
        return
      }
      spend(g, 15000)
      if (chance(g, 0.45 * fertilityFactor(g, p) + 0.1)) {
        const babies = rollMultiples(g, 0.25)
        conceive(g, p, babies, 'ivf')
        announcePregnancy(g, p, babies)
      } else {
        addStat(g, 'happiness', -randInt(g, 4, 8))
        notice(g, 'IVF', 'The IVF treatment was unsuccessful. You can try again next year.', { emoji: '\u{1F614}', tone: 'bad' })
      }
    },
  }
  const insemination: MenuAction = {
    type: 'action',
    id: 'insemination',
    label: 'Artificial Insemination',
    emoji: '\u{1F489}',
    subtitle: `Use a sperm donor (${money(5000)})`,
    visible: (g) => g.character.gender === 'female',
    disabledReason: (g) => tooYoungReason(g, 18) ?? (g.character.age > 50 ? "You're too old for artificial insemination." : playerPregnancy(g) ? "You're already pregnant!" : g.flags.sterile === true ? 'Your tubal ligation is doing its job.' : null),
    run: (g) => {
      if (!useYearAction(g, 'love.insemination', 1)) {
        notice(g, 'Fertility', 'The clinic says to wait until next year.', { emoji: '\u{23F3}' })
        return
      }
      if (!spend(g, 5000)) {
        notice(g, 'Fertility', `You can't afford it (${money(5000)}).`, { emoji: '\u{1F4B8}' })
        return
      }
      if (chance(g, 0.5 * (g.character.age <= 35 ? 1 : g.character.age <= 42 ? 0.6 : 0.25))) {
        const babies = rollMultiples(g, 0.15)
        g.flags.pregnancy = asJson({ otherParentId: null, via: 'insemination', babies, surrogateName: null })
        count(g, 'pregnancies')
        log(g, 'I got pregnant through artificial insemination.', 'event')
        const partner = currentPartner(g)
        let text = `It worked! You're pregnant${babies > 1 ? ` with ${babies === 2 ? 'twins' : 'triplets'}` : ''}. The baby is due next year.`
        if (partner && partner.gender === 'male' && chance(g, 0.6)) {
          addRelationship(partner, -randInt(g, 15, 30))
          text += `\n\n${partner.firstName} is furious you used a donor instead of ${pronouns(partner.gender).him}.`
        }
        notice(g, 'Pregnant!', text, { emoji: '\u{1F930}', tone: 'good' })
      } else {
        notice(g, 'Fertility', "The insemination didn't take. You can try again next year.", { emoji: '\u{1F614}', tone: 'bad' })
      }
    },
  }
  const donate: MenuAction = {
    type: 'action',
    id: 'spermDonation',
    label: 'Sperm Donation',
    emoji: '\u{1F9EA}',
    subtitle: 'Get paid to help others start a family',
    visible: (g) => g.character.gender === 'male',
    disabledReason: (g) => tooYoungReason(g, 18) ?? (g.flags.sterile === true ? 'Your vasectomy makes this pointless.' : null),
    run: (g) => {
      const c = g.character
      if (!useYearAction(g, 'love.spermDonation', 1)) {
        notice(g, 'Sperm Donation', 'You already donated this year. Come back later.', { emoji: '\u{23F3}' })
        return
      }
      if (c.stats.smarts < 30 || c.stats.looks < 30 || c.age > 45 || anyConviction(g)) {
        const reason = c.age > 45 ? 'Age' : anyConviction(g) ? 'Unspecified' : c.stats.smarts < 30 ? 'Smarts' : 'Looks'
        notice(g, 'Sperm Donation', `The fertility lab rejected your donation.\n\nReason: ${reason}`, { emoji: '\u{1F6AB}' })
        return
      }
      const pay = randInt(g, 40, 80)
      addMoney(g, pay)
      count(g, 'spermDonations')
      log(g, `I donated sperm and earned ${money(pay)}.`)
      notice(g, 'Sperm Donation', `You made a donation to the fertility lab and got paid ${money(pay)}. ${pick(g, ['Somewhere, a family is grateful.', 'The magazine selection was disappointing.', 'The nurse did not make eye contact.'])}`, { emoji: '\u{1F9EA}' })
    },
  }
  const surrogate: MenuAction = {
    type: 'action',
    id: 'surrogate',
    label: 'Surrogate',
    emoji: '\u{1F930}',
    subtitle: 'Hire a surrogate to carry your baby',
    disabledReason: (g) => tooYoungReason(g, 18) ?? (playerPregnancy(g) ? 'You already have a baby on the way.' : null),
    run: (g) => {
      const options = Array.from({ length: 3 }, () => ({
        name: pick(g, SURROGATE_NAMES_F),
        age: randInt(g, 22, 38),
        health: bell(g, 50, 100),
        fee: randInt(g, 45, 140) * 1000,
      }))
      scriptChoice(
        g,
        'love.fertility.surrogate',
        'Surrogate',
        `Choose a surrogate:\n\n${options.map((o, i) => `${i + 1}. ${o.name}, ${o.age} - Health ${o.health}% - ${money(o.fee)}`).join('\n')}`,
        [...options.map((o, i) => ({ id: String(i), label: `${o.name} (${money(o.fee)})`, emoji: '\u{1F469}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{1F6B6}' }],
        { emoji: '\u{1F930}', data: asJson({ options }) },
      )
    },
  }
  return [bc, ivf, insemination, surrogate, donate, sterilize, reverse].map((n) => {
    if (n.id === 'sterilize') {
      return { ...n, label: 'Vasectomy / Tubal Ligation' }
    }
    return n
  }).map((n) => fixSterilizeLabel(n))
}

function fixSterilizeLabel(n: MenuAction): MenuAction {
  if (n.id !== 'sterilize') return n
  return {
    ...n,
    label: 'Sterilization',
    subtitle: (g) => (g.character.gender === 'male' ? `Vasectomy (${money(900)})` : `Tubal ligation (${money(3500)})`),
  }
}

defineScript('love.fertility.surrogate', (g, choice, data) => {
  if (choice === 'cancel') return
  const list = rec(data).options
  if (!Array.isArray(list)) return
  const o = rec(list[Number(choice)] ?? null)
  const name = typeof o.name === 'string' ? o.name : 'your surrogate'
  const fee = typeof o.fee === 'number' ? o.fee : 80000
  const health = typeof o.health === 'number' ? o.health : 70
  if (!spend(g, fee)) {
    notice(g, 'Surrogate', `You can't afford ${name}'s fee (${money(fee)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  const partner = currentPartner(g)
  if (chance(g, 0.12)) {
    notice(g, 'Surrogate', `${name} turned you down. The agency refunded your money.`, { emoji: '\u{1F645}' })
    addMoney(g, fee)
    return
  }
  if (chance(g, 0.45 + health / 250)) {
    const babies = rollMultiples(g, 0.12)
    g.flags.pregnancy = asJson({ otherParentId: partner?.id ?? null, via: 'surrogate', babies, surrogateName: name })
    count(g, 'pregnancies')
    log(g, `${name} agreed to be my surrogate.`, 'event')
    notice(g, 'Surrogate', `${name} is pregnant with your baby${babies > 1 ? ` (${babies === 2 ? 'twins' : 'triplets'}!)` : ''}! The baby is due next year.`, { emoji: '\u{1F930}', tone: 'good' })
    if (partner) addRelationship(partner, randInt(g, 3, 8))
  } else {
    const refund = Math.round(fee / 2)
    addMoney(g, refund)
    notice(g, 'Surrogate', `${name} wasn't able to get pregnant. The agency refunded half of your money (${money(refund)}).`, { emoji: '\u{1F614}', tone: 'bad' })
  }
})

export const fertilityMenu: MenuGroup = {
  type: 'menu',
  id: 'fertility',
  label: 'Fertility',
  emoji: '\u{1F37C}',
  subtitle: 'Visit the fertility clinic',
  visible: (g) => g.character.age >= 14,
  disabledReason: (g) => blockedReason(g),
  header: (g) => {
    const preg = playerPregnancy(g)
    if (preg) return preg.via === 'surrogate' ? 'Your surrogate is expecting. The baby is due next year.' : 'You are pregnant! The baby is due next year.'
    return 'Plan (or prevent) your family.'
  },
  children: () => fertilityNodes(),
}

// ---------------------------------------------------------------------------
// Love menu

const dateAction: MenuAction = {
  type: 'action',
  id: 'date',
  label: 'Date',
  emoji: '\u{1F498}',
  subtitle: 'Find someone to date',
  disabledReason: (g) => {
    const p = currentPartner(g)
    return tooYoungReason(g, 13, 'You are too young to date.') ?? (p ? `You're already in a relationship with ${p.firstName}.` : null)
  },
  run: (g) => {
    if (!useYearAction(g, 'love.dateSearch', 8)) {
      notice(g, 'Date', "You've met everyone in town this year. Try again next year.", { emoji: '\u{1F648}' })
      return
    }
    showDateCandidate(g, dateCandidate(g))
  },
}

const appAction: MenuAction = {
  type: 'action',
  id: 'datingApp',
  label: `${APP_NAME} (Dating App)`,
  emoji: '\u{1F525}',
  subtitle: `Find love on the dating app (${money(APP_PRICE)} per swipe)`,
  disabledReason: (g) => {
    const p = currentPartner(g)
    return tooYoungReason(g, 18) ?? (p ? `You're already in a relationship with ${p.firstName}.` : null)
  },
  run: (g) => startDatingApp(g, false),
}

const appGoldAction: MenuAction = {
  type: 'action',
  id: 'datingAppGold',
  label: `${APP_NAME} Gold`,
  emoji: '\u{1F31F}',
  subtitle: `Premium matches with better-looking people (${money(APP_GOLD_PRICE)} per swipe)`,
  disabledReason: (g) => {
    const p = currentPartner(g)
    return tooYoungReason(g, 18) ?? (p ? `You're already in a relationship with ${p.firstName}.` : null)
  },
  run: (g) => startDatingApp(g, true),
}

const matchmakerAction: MenuAction = {
  type: 'action',
  id: 'matchmaker',
  label: 'Matchmaker',
  emoji: '\u{1F3F9}',
  subtitle: `A professional finds your perfect match (${money(MATCHMAKER_FEE)})`,
  disabledReason: (g) => {
    const p = currentPartner(g)
    return tooYoungReason(g, 21) ?? (p ? `You're already in a relationship with ${p.firstName}.` : null)
  },
  confirm: () => `Hire a matchmaker for ${money(MATCHMAKER_FEE)}?`,
  run: (g) => {
    if (!useYearAction(g, 'love.matchmaker', 2)) {
      notice(g, 'Matchmaker', 'Your matchmaker needs time to find new candidates. Try next year.', { emoji: '\u{23F3}' })
      return
    }
    if (!spend(g, MATCHMAKER_FEE)) {
      notice(g, 'Matchmaker', `You can't afford the matchmaker's fee (${money(MATCHMAKER_FEE)}).`, { emoji: '\u{1F4B8}' })
      return
    }
    const a = g.character.age
    const k = makeCandidate(g, { minAge: Math.max(18, a - 6), maxAge: Math.min(95, a + 6), quality: 'elite', wealth: chance(g, 0.4) ? 'comfortable' : 'any' })
    k.traits = pickDistinct(g, ['kind', 'loyal', 'funny', 'caring', 'honest', 'romantic', 'optimistic', 'generous'], 2)
    scriptChoice(
      g,
      'love.matchmaker.pick',
      'Matchmaker',
      `Your matchmaker set you up with:\n\n${candidateSummary(k)}\n\n"Trust me, you two are perfect for each other."`,
      [
        { id: 'date', label: 'Go on a date', emoji: '\u{1F377}' },
        { id: 'pass', label: 'Pass', emoji: '\u{1F44B}' },
      ],
      { emoji: '\u{1F3F9}', data: asJson({ candidate: k }) },
    )
  },
}

const hookupAction: MenuAction = {
  type: 'action',
  id: 'hookup',
  label: 'Hook Up',
  emoji: '\u{1F48B}',
  subtitle: 'Find a one-night stand',
  disabledReason: (g) => tooYoungReason(g, 18),
  confirm: (g) => {
    const p = currentPartner(g)
    return p ? `You're in a relationship with ${p.firstName}. Hooking up with someone else would be cheating. Continue?` : null
  },
  run: (g) => {
    if (!useYearAction(g, 'love.hookup', 5)) {
      notice(g, 'Hook Up', "You're exhausted. Take the rest of the year off.", { emoji: '\u{1F634}' })
      return
    }
    showHookupCandidate(g, hookupCandidate(g))
  },
}

function partnerShortcuts(g: GameState): MenuNode[] {
  const p = currentPartner(g)
  if (!p) return []
  const pid = p.id
  const nodes: MenuNode[] = [{ type: 'heading', id: 'yourLove', label: `You & ${p.firstName}` }]
  const status =
    p.relation === 'spouse'
      ? `Married to ${fullName(p)} for ${g.character.age - pNum(p, 'marriedAge', g.character.age)} years`
      : p.relation === 'fiance'
        ? `Engaged to ${fullName(p)}`
        : `Dating ${fullName(p)}`
  nodes.push({ type: 'info', id: 'loveStatus', emoji: '\u{2764}\u{FE0F}', text: `${status} (relationship ${p.relationship}%)` })
  const find = (g2: GameState) => getPerson(g2, pid)
  if (p.relation === 'partner') {
    nodes.push({
      type: 'action',
      id: 'propose',
      label: 'Propose',
      emoji: '\u{1F48D}',
      subtitle: `Ask ${p.firstName} to marry you`,
      disabledReason: (g2) => {
        const x = find(g2)
        return !x ? 'They are gone.' : blockedReason(g2) ?? proposalProblem(g2, x)
      },
      run: (g2) => {
        const x = find(g2)
        if (x) proposeTo(g2, x)
      },
    })
  }
  if (p.relation === 'fiance') {
    nodes.push({
      type: 'action',
      id: 'wedding',
      label: 'Plan the Wedding',
      emoji: '\u{1F492}',
      subtitle: 'Choose a venue, prenup and honeymoon',
      disabledReason: (g2) => {
        const x = find(g2)
        return !x ? 'They are gone.' : weddingProblem(g2, x)
      },
      run: (g2) => {
        const x = find(g2)
        if (x) planWedding(g2, x)
      },
    })
  }
  if (p.relation === 'spouse') {
    nodes.push({
      type: 'action',
      id: 'divorce',
      label: 'Divorce',
      emoji: '\u{1F4C4}',
      subtitle: (g2) => (find(g2)?.data.prenup === true ? 'You have a prenup' : 'No prenup: assets may be split'),
      confirm: () => `Are you sure you want to divorce ${p.firstName}?`,
      run: (g2) => {
        const x = find(g2)
        if (x && x.relation === 'spouse') divorce(g2, x, 'player')
      },
    })
  } else {
    nodes.push({
      type: 'action',
      id: 'breakup',
      label: 'Break Up',
      emoji: '\u{1F494}',
      subtitle: `End things with ${p.firstName}`,
      confirm: () => `Are you sure you want to break up with ${p.firstName}?`,
      run: (g2) => {
        const x = find(g2)
        if (x && isRomantic(x)) breakUp(g2, x, 'player')
      },
    })
  }
  return nodes
}

export const loveMenu: MenuGroup = {
  type: 'menu',
  id: 'love',
  label: 'Love',
  emoji: '\u{2764}\u{FE0F}',
  subtitle: 'Find someone to love',
  disabledReason: (g) => blockedReason(g) ?? tooYoungReason(g, 13, 'You are too young for love. Stick to crayons for now.'),
  header: (g) => {
    const p = currentPartner(g)
    if (!p) return g.character.age < 18 ? 'Looking for a crush?' : 'Single and ready to mingle.'
    return `You're with ${fullName(p)}.`
  },
  children: (g) => [dateAction, appAction, appGoldAction, matchmakerAction, hookupAction, fertilityMenu, ...partnerShortcuts(g)],
}

// ---------------------------------------------------------------------------
// Adoption

const ADOPTION_REASONS = [
  'Their birth parents died in a car crash.',
  'Their birth parents were unfit teens.',
  'Their birth parents had serious financial problems.',
  'Their birth parents had serious health problems.',
  'Their birth parents were imprisoned.',
  'Their birth parents struggled with addiction.',
  'Their birth parents were in rehab.',
  'Their birth parents were neglectful.',
  'They were found on the doorstep of a fire station.',
  'Their birth parents died in a house fire.',
  'Their birth parent died in a plane crash.',
  'Their birth parents moved overseas without them.',
  "Their birth parents couldn't stand that they rooted for the wrong sports team.",
  'Their birth parents joined a traveling circus.',
]

interface AdoptKid {
  firstName: string
  lastName: string
  gender: Gender
  age: number
  countryId: string
  smarts: number
  looks: number
  health: number
  behavior: number
  fee: number
  reason: string
}

type AdoptKind = 'domestic' | 'international' | 'foster'

export function adoptionRejection(g: GameState): string | null {
  const c = g.character
  if (c.age < 21 || c.age > 70) return 'Age'
  if (anyConviction(g)) return 'Criminal Record'
  if (['parents', 'homeless', 'dorm', 'prison', 'military'].includes(c.residence.status)) return 'Housing'
  if (!c.job && !c.partTimeJob && !c.retired && c.money < 100_000) return 'Unemployed'
  if (c.money < 1000) return 'Finances'
  const kids = g.people.filter((p) => (p.relation === 'child' || p.relation === 'stepchild') && p.alive).length
  if (kids >= 5) return 'Unspecified'
  return null
}

function adoptionKids(g: GameState, kind: AdoptKind): AdoptKid[] {
  const c = g.character
  const n = randInt(g, 4, 6)
  const kids: AdoptKid[] = []
  for (let i = 0; i < n; i++) {
    const gender: Gender = chance(g, 0.5) ? 'male' : 'female'
    const country = kind === 'international' ? pick(g, COUNTRIES.filter((x) => x.id !== c.countryId)) : getCountry(c.countryId)
    const age = kind === 'foster' ? randInt(g, 5, 17) : randInt(g, 1, kind === 'international' ? 12 : 10)
    const baseFee = kind === 'foster' ? randInt(g, 0, 3) * 500 : kind === 'international' ? randInt(g, 25, 50) * 1000 : randInt(g, 8, 30) * 1000
    kids.push({
      firstName: randomFirstName(g, country.id, gender),
      lastName: randomLastName(g, country.id),
      gender,
      age,
      countryId: country.id,
      smarts: bell(g, 10, 100),
      looks: bell(g, 10, 100),
      health: bell(g, 40, 100),
      behavior: bell(g, kind === 'foster' ? 10 : 25, 100),
      fee: Math.round(baseFee * (age <= 3 ? 1.3 : 1)),
      reason: pick(g, ADOPTION_REASONS),
    })
  }
  return kids
}

function adoptAction(kind: AdoptKind, label: string, emoji: string, subtitle: string): MenuAction {
  return {
    type: 'action',
    id: `adopt.${kind}`,
    label,
    emoji,
    subtitle,
    disabledReason: (g) => blockedReason(g) ?? tooYoungReason(g, 18),
    run: (g) => {
      if (!useYearAction(g, 'love.adoptApply', 3)) {
        notice(g, 'Adoption', 'The agency has already reviewed enough of your applications this year.', { emoji: '\u{23F3}' })
        return
      }
      const reason = adoptionRejection(g)
      if (reason) {
        log(g, 'My adoption application was rejected.', 'bad')
        notice(g, 'Adoption', `The adoption agency rejected your application.\n\nReason: ${reason}`, { emoji: '\u{1F6AB}', tone: 'bad' })
        return
      }
      const kids = adoptionKids(g, kind)
      const lines = kids.map((k, i) => {
        const flag = getCountry(k.countryId).flag
        return `${i + 1}. ${k.firstName} (${kidWord(k.gender)}, ${k.age}) ${flag} - ${money(k.fee)}\n   Smarts ${k.smarts}% · Looks ${k.looks}% · Health ${k.health}% · Behavior ${k.behavior}%\n   ${k.reason}`
      })
      scriptChoice(
        g,
        'love.adopt.pick',
        label,
        `These children are looking for a home:\n\n${lines.join('\n\n')}`,
        [...kids.map((k, i) => ({ id: String(i), label: `Adopt ${k.firstName}, ${k.age} (${money(k.fee)})`, emoji: k.gender === 'male' ? '\u{1F466}' : '\u{1F467}' })), { id: 'cancel', label: 'Not right now', emoji: '\u{1F6B6}' }],
        { emoji: '\u{1F3E0}', data: asJson({ kids }) },
      )
    },
  }
}

defineScript('love.adopt.pick', (g, choice, data) => {
  if (choice === 'cancel') return
  const list = rec(data).kids
  if (!Array.isArray(list)) return
  const k = list[Number(choice)] as unknown as AdoptKid | undefined
  if (!k || typeof k.firstName !== 'string') return
  if (!spend(g, k.fee)) {
    notice(g, 'Adoption', `You can't afford the adoption fee (${money(k.fee)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  const c = g.character
  const partner = currentPartner(g)
  const kid = createPerson(g, {
    relation: 'child',
    age: k.age,
    gender: k.gender,
    firstName: k.firstName,
    lastName: k.lastName,
    countryId: k.countryId,
    relationship: randInt(g, 55, 80),
    money: 0,
    stats: { smarts: k.smarts, looks: k.looks, health: k.health },
    otherParentId: partner && partner.relation === 'spouse' ? partner.id : undefined,
    biological: false,
    livesWithPlayer: true,
    data: { adopted: true, adoptedAge: c.age, behavior: k.behavior, originCountry: k.countryId, adoptionReason: k.reason, lastInteractionAge: c.age },
  })
  kid.occupation = npcOccupationLabel(kid.age)
  count(g, 'adoptions')
  addStat(g, 'happiness', randInt(g, 8, 14))
  if (partner) addRelationship(partner, partner.relationship >= 50 ? randInt(g, 3, 8) : -randInt(g, 3, 8))
  log(g, `I adopted ${kid.firstName}, a ${k.age}-year-old ${kidWord(k.gender)} from ${getCountry(k.countryId).name}.`, 'good')
  remember(g, `Adopted ${kid.firstName} (age ${k.age}).`)
  if (k.lastName === c.lastName) {
    notice(g, 'Adoption', `You adopted ${kid.firstName}! Welcome to the family. \u{1F3E0}`, { emoji: '\u{1F3E0}', tone: 'good' })
    return
  }
  scriptChoice(
    g,
    'love.adopt.surname',
    'Adoption',
    `You adopted ${kid.firstName}! Welcome to the family. \u{1F3E0}\n\nWhat surname will ${pronouns(kid.gender).he} use?`,
    [
      { id: 'keep', label: `Keep ${k.lastName}`, emoji: '\u{1F3F7}\u{FE0F}' },
      { id: 'change', label: `Change to ${c.lastName}`, emoji: '\u{270D}\u{FE0F}' },
    ],
    { emoji: '\u{1F3E0}', data: asJson({ childId: kid.id }) },
  )
})

defineScript('love.adopt.surname', (g, choice, data) => {
  const kid = getPerson(g, dStr(data, 'childId'))
  if (!kid) return
  if (choice === 'change') {
    kid.lastName = g.character.lastName
    log(g, `${kid.firstName} took my surname.`)
  }
})

export const adoptionMenu: MenuGroup = {
  type: 'menu',
  id: 'adoption',
  label: 'Adoption',
  emoji: '\u{1F3E0}',
  subtitle: 'Adopt a child',
  visible: (g) => g.character.age >= 18,
  disabledReason: (g) => blockedReason(g),
  header: () => 'Agencies require applicants to be 21-70 with stable housing, an income and a clean record.',
  children: () => [
    adoptAction('domestic', 'Domestic Adoption', '\u{1F3E1}', 'Adopt a child from your country'),
    adoptAction('international', 'International Adoption', '\u{1F30E}', 'Adopt a child from abroad'),
    adoptAction('foster', 'Foster Care', '\u{1F9F8}', 'Give an older child a forever home'),
  ],
}

/** Occupation label for a family NPC of this age (school stage). */
export function npcOccupationLabel(age: number): string {
  if (age < 2) return 'Baby'
  if (age < 4) return 'Toddler'
  if (age < 5) return 'Preschooler'
  if (age < 11) return 'Elementary School Student'
  if (age < 14) return 'Middle School Student'
  if (age < 18) return 'High School Student'
  return 'Unemployed'
}

// ---------------------------------------------------------------------------
// Pets

interface PetKind {
  species: string
  breeds: string[]
  price: [number, number]
  age: [number, number]
  lifespan: [number, number]
  exotic?: boolean
}

export const PET_LIFESPAN: Record<string, [number, number]> = {
  Dog: [10, 15],
  Cat: [12, 20],
  Horse: [25, 32],
  Rabbit: [8, 12],
  Hamster: [2, 4],
  'Guinea Pig': [5, 8],
  Parrot: [40, 70],
  Bird: [8, 15],
  Fish: [3, 10],
  Snake: [15, 28],
  Lizard: [10, 20],
  Turtle: [30, 60],
  Pig: [15, 20],
  Goat: [12, 18],
  Ferret: [6, 10],
  Monkey: [20, 35],
  Tiger: [15, 22],
  Lion: [12, 18],
  Wolf: [10, 15],
  Fox: [10, 14],
  Gorilla: [35, 45],
}

export function petLifespan(species: string | undefined): [number, number] {
  return (species && PET_LIFESPAN[species]) || [10, 15]
}

const SHELTER: PetKind[] = [
  { species: 'Dog', breeds: ['Mutt', 'Pit Bull', 'Labrador Mix', 'Beagle Mix', 'Chihuahua', 'Boxer Mix', 'Shepherd Mix'], price: [50, 300], age: [1, 9], lifespan: [10, 15] },
  { species: 'Cat', breeds: ['Alley Cat', 'Tabby Cat', 'Calico Cat', 'House Cat', 'Tuxedo Cat'], price: [25, 150], age: [1, 10], lifespan: [12, 20] },
  { species: 'Rabbit', breeds: ['Lop Rabbit', 'Dutch Rabbit'], price: [20, 80], age: [1, 4], lifespan: [8, 12] },
  { species: 'Guinea Pig', breeds: ['Guinea Pig'], price: [15, 40], age: [1, 3], lifespan: [5, 8] },
]
const PET_STORE: PetKind[] = [
  { species: 'Hamster', breeds: ['Syrian Hamster', 'Dwarf Hamster'], price: [15, 30], age: [0, 1], lifespan: [2, 4] },
  { species: 'Fish', breeds: ['Goldfish', 'Betta Fish', 'Guppy'], price: [5, 40], age: [0, 1], lifespan: [3, 10] },
  { species: 'Bird', breeds: ['Parakeet', 'Canary', 'Cockatiel', 'Finch', 'Lovebird'], price: [30, 250], age: [0, 3], lifespan: [8, 15] },
  { species: 'Turtle', breeds: ['Box Turtle', 'Red-Eared Slider'], price: [40, 120], age: [1, 10], lifespan: [30, 60] },
  { species: 'Lizard', breeds: ['Leopard Gecko', 'Bearded Dragon', 'Iguana'], price: [60, 300], age: [0, 3], lifespan: [10, 20] },
  { species: 'Snake', breeds: ['Corn Snake', 'Ball Python', 'Garter Snake', 'California Kingsnake'], price: [80, 350], age: [0, 4], lifespan: [15, 28] },
  { species: 'Ferret', breeds: ['Ferret'], price: [150, 400], age: [0, 2], lifespan: [6, 10] },
  { species: 'Rabbit', breeds: ['Holland Lop', 'Netherland Dwarf'], price: [60, 150], age: [0, 1], lifespan: [8, 12] },
]
const DOG_BREEDER: PetKind[] = [
  {
    species: 'Dog',
    breeds: ['Golden Retriever', 'Labrador Retriever', 'German Shepherd', 'French Bulldog', 'Poodle', 'Corgi', 'Siberian Husky', 'Beagle', 'Dachshund', 'Shiba Inu', 'Great Dane', 'Pug', 'Bernese Mountain Dog', 'Border Collie', 'Yorkshire Terrier', 'Dalmatian', 'Rottweiler', 'Cavalier King Charles Spaniel'],
    price: [800, 4000],
    age: [0, 1],
    lifespan: [10, 15],
  },
]
const CAT_BREEDER: PetKind[] = [
  { species: 'Cat', breeds: ['Maine Coon Cat', 'Persian Cat', 'Siamese Cat', 'Ragdoll Cat', 'Bengal Cat', 'Sphynx Cat', 'British Shorthair Cat', 'Abyssinian Cat', 'Scottish Fold Cat'], price: [600, 3000], age: [0, 1], lifespan: [12, 20] },
]
const HORSE_RANCH: PetKind[] = [
  { species: 'Horse', breeds: ['Thoroughbred', 'Arabian Horse', 'Appaloosa', 'American Quarter Horse', 'Pony', 'Clydesdale', 'Mustang'], price: [3000, 30000], age: [2, 12], lifespan: [25, 32] },
  { species: 'Goat', breeds: ['Pygmy Goat', 'Nubian Goat'], price: [200, 800], age: [0, 4], lifespan: [12, 18] },
  { species: 'Pig', breeds: ['Pot-Bellied Pig', 'Mini Pig'], price: [300, 1500], age: [0, 3], lifespan: [15, 20] },
]
const EXOTIC: PetKind[] = [
  { species: 'Tiger', breeds: ['Bengal Tiger', 'White Tiger'], price: [15000, 60000], age: [1, 6], lifespan: [15, 22], exotic: true },
  { species: 'Lion', breeds: ['African Lion'], price: [20000, 70000], age: [1, 6], lifespan: [12, 18], exotic: true },
  { species: 'Monkey', breeds: ['Capuchin Monkey', 'Squirrel Monkey', 'Chimpanzee', 'Macaque'], price: [5000, 45000], age: [1, 8], lifespan: [20, 35], exotic: true },
  { species: 'Wolf', breeds: ['Gray Wolf', 'Arctic Wolf'], price: [4000, 15000], age: [1, 5], lifespan: [10, 15], exotic: true },
  { species: 'Fox', breeds: ['Fennec Fox', 'Red Fox'], price: [2500, 8000], age: [0, 4], lifespan: [10, 14], exotic: true },
  { species: 'Snake', breeds: ['Burmese Python', 'Boa Constrictor'], price: [1500, 6000], age: [1, 8], lifespan: [15, 28], exotic: true },
  { species: 'Parrot', breeds: ['Scarlet Macaw', 'Cockatoo', 'African Grey Parrot'], price: [2000, 9000], age: [1, 15], lifespan: [40, 70], exotic: true },
  { species: 'Gorilla', breeds: ['Silverback Gorilla'], price: [50000, 120000], age: [3, 10], lifespan: [35, 45], exotic: true },
]

const PET_NAMES = [
  'Max', 'Bella', 'Luna', 'Charlie', 'Lucy', 'Cooper', 'Daisy', 'Milo', 'Rocky', 'Bear', 'Coco', 'Teddy', 'Pepper', 'Ziggy',
  'Biscuit', 'Nugget', 'Waffles', 'Pickles', 'Sir Fluffington', 'Mr. Whiskers', 'Princess', 'Bandit', 'Shadow', 'Ginger',
  'Oreo', 'Peanut', 'Mochi', 'Noodle', 'Tater Tot', 'Gizmo', 'Zeus', 'Apollo', 'Simba', 'Nala', 'Rex', 'Sparky', 'Buttercup',
  'Clover', 'Pumpkin', 'Pretzel', 'Gus', 'Loki', 'Duke', 'Ruby', 'Sadie', 'Meatball', 'Captain', 'Professor Paws', 'Beans',
]
const EXOTIC_NAMES = ['Rajah', 'Kong', 'Fang', 'Sultan', 'Medusa', 'Khan', 'Shere', 'Bubbles', 'Caesar', 'Cleo', 'Titan', 'Mowgli']

export function randomPetName(g: GameState, exotic = false): string {
  return pick(g, exotic && chance(g, 0.6) ? EXOTIC_NAMES : PET_NAMES)
}

interface PetOffer {
  name: string
  species: string
  breed: string
  gender: Gender
  age: number
  price: number
  health: number
  happiness: number
  smarts: number
  craziness: number
  lifespan: number
  exotic: boolean
}

type PetStore = 'shelter' | 'store' | 'dogBreeder' | 'catBreeder' | 'ranch' | 'exotic'

const STORES: Record<PetStore, { label: string; emoji: string; subtitle: string; kinds: PetKind[]; minAge: number }> = {
  shelter: { label: 'Animal Shelter', emoji: '\u{1F3DA}\u{FE0F}', subtitle: 'Rescue an animal in need', kinds: SHELTER, minAge: 6 },
  store: { label: 'Pet Store', emoji: '\u{1F3EA}', subtitle: 'Small pets, fish, birds and reptiles', kinds: PET_STORE, minAge: 6 },
  dogBreeder: { label: 'Dog Breeder', emoji: '\u{1F415}', subtitle: 'Purebred puppies', kinds: DOG_BREEDER, minAge: 6 },
  catBreeder: { label: 'Cat Breeder', emoji: '\u{1F408}', subtitle: 'Purebred kittens', kinds: CAT_BREEDER, minAge: 6 },
  ranch: { label: 'Horse Ranch', emoji: '\u{1F40E}', subtitle: 'Horses and farm animals (requires property)', kinds: HORSE_RANCH, minAge: 18 },
  exotic: { label: 'Exotic Pet Dealer', emoji: '\u{1F405}', subtitle: 'Dangerous, expensive, and probably a bad idea', kinds: EXOTIC, minAge: 18 },
}

function petOffers(g: GameState, store: PetStore): PetOffer[] {
  const kinds = STORES[store].kinds
  const offers: PetOffer[] = []
  for (let i = 0; i < 5; i++) {
    const k = pick(g, kinds)
    const breed = pick(g, k.breeds)
    const lifespan = randInt(g, k.lifespan[0], k.lifespan[1])
    const age = Math.min(randInt(g, k.age[0], k.age[1]), Math.max(0, lifespan - 3))
    offers.push({
      name: randomPetName(g, !!k.exotic),
      species: k.species,
      breed,
      gender: chance(g, 0.5) ? 'male' : 'female',
      age,
      price: Math.round(randInt(g, k.price[0], k.price[1]) / 5) * 5,
      health: bell(g, store === 'shelter' ? 40 : 60, 100),
      happiness: bell(g, 30, 100),
      smarts: bell(g, 10, 100),
      craziness: k.exotic ? bell(g, 40, 100) : bell(g, 0, 80),
      lifespan,
      exotic: !!k.exotic,
    })
  }
  return offers
}

export function livingPets(g: GameState): Person[] {
  return g.people.filter((p) => p.relation === 'pet' && p.alive)
}

function ownsProperty(g: GameState): boolean {
  return g.assets.some((a) => a.kind === 'house')
}

function petStoreAction(store: PetStore): MenuAction {
  const s = STORES[store]
  return {
    type: 'action',
    id: `pets.${store}`,
    label: s.label,
    emoji: s.emoji,
    subtitle: s.subtitle,
    visible: (g) => g.character.age >= Math.min(s.minAge, 18) || s.minAge <= 6,
    disabledReason: (g) => {
      const blocked = blockedReason(g)
      if (blocked) return blocked
      if (g.character.age < 6) return "You're too young to take care of a pet."
      if (g.character.age < s.minAge) return `You must be at least ${s.minAge} to buy from the ${s.label.toLowerCase()}.`
      if (store === 'ranch' && !ownsProperty(g)) return 'You need to own property with room for animals.'
      return null
    },
    run: (g) => {
      if (!useYearAction(g, 'love.petBrowse', 6)) {
        notice(g, s.label, "You've browsed enough animals this year. The staff are starting to recognize you.", { emoji: '\u{1F648}' })
        return
      }
      const offers = petOffers(g, store)
      const kid = g.character.age < 15
      const lines = offers.map(
        (o, i) => `${i + 1}. ${o.name} - ${o.breed}, ${o.age === 0 ? 'baby' : `${o.age} yr${o.age === 1 ? '' : 's'}`} (${o.gender === 'male' ? 'M' : 'F'})${kid ? '' : ` - ${money(o.price)}`}\n   Health ${o.health}% · Happiness ${o.happiness}% · Smarts ${o.smarts}% · Craziness ${o.craziness}%`,
      )
      scriptChoice(
        g,
        'love.pet.pick',
        s.label,
        `${kid ? 'Which pet will you ask your parents for?' : 'Available animals:'}\n\n${lines.join('\n\n')}`,
        [
          ...offers.map((o, i) => ({ id: String(i), label: kid ? `Ask for ${o.name} the ${o.breed}` : `${o.name} the ${o.breed} (${money(o.price)})`, emoji: '\u{1F43E}' })),
          { id: 'cancel', label: 'Leave', emoji: '\u{1F6B6}' },
        ],
        { emoji: s.emoji, data: asJson({ store, offers }) },
      )
    },
  }
}

export function petRejection(g: GameState, store: PetStore, o: PetOffer): string | null {
  const c = g.character
  if (g.flags.petBan === true && (store === 'shelter' || store === 'store')) return 'Failed Interview'
  if (store === 'shelter' && anyConviction(g)) return 'Criminal Record'
  if (livingPets(g).length >= 8) return 'Unspecified'
  if (c.age >= 15 && !c.job && !c.partTimeJob && !c.retired && c.money < o.price * 3 && store !== 'store') return 'Finances'
  return null
}

defineScript('love.pet.pick', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = rec(data)
  const store = (typeof d.store === 'string' && d.store in STORES ? d.store : 'shelter') as PetStore
  const list = d.offers
  if (!Array.isArray(list)) return
  const o = list[Number(choice)] as unknown as PetOffer | undefined
  if (!o || typeof o.species !== 'string') return
  const c = g.character
  const label = STORES[store].label
  const reason = petRejection(g, store, o)
  if (reason) {
    notice(g, label, `Your request to adopt ${o.name} was rejected.\n\nReason: ${reason}`, { emoji: '\u{1F6AB}', tone: 'bad' })
    return
  }
  let boughtBy: Person | null = null
  if (c.age < 15) {
    const ps = parents(g).filter((p) => p.alive)
    if (ps.length === 0) {
      notice(g, label, "You don't have any parents to ask for a pet.", { emoji: '\u{1F614}' })
      return
    }
    const parent = [...ps].sort((a, b) => b.relationship - a.relationship)[0]
    if (!useYearAction(g, 'love.petAskParents', 2)) {
      notice(g, label, `${cap(yourRel(parent))} said to stop asking for pets this year.`, { emoji: '\u{1F644}' })
      return
    }
    touch(g, parent)
    let odds = 0.3 + parent.relationship / 250 + (parent.money > o.price * 20 ? 0.15 : -0.1) - livingPets(g).length * 0.08
    if (hasTrait(parent, 'generous', 'kind')) odds += 0.1
    if (hasTrait(parent, 'stingy', 'grumpy')) odds -= 0.15
    if (!chance(g, clamp(odds, 0.05, 0.9))) {
      notice(g, label, `${cap(yourRel(parent))} said no. "${pick(g, ["Who's going to walk it? Me. That's who.", 'Maybe when you can take care of a houseplant.', "We can't afford another mouth to feed.", 'Absolutely not. Remember the goldfish?'])}"`, { emoji: '\u{1F645}' })
      return
    }
    parent.money = Math.max(0, parent.money - o.price)
    boughtBy = parent
  } else if (!spend(g, o.price)) {
    notice(g, label, `You can't afford ${o.name} (${money(o.price)}).`, { emoji: '\u{1F4B8}' })
    return
  }
  const pet = createPerson(g, {
    relation: 'pet',
    age: o.age,
    gender: o.gender,
    firstName: o.name,
    species: o.species,
    breed: o.breed,
    relationship: randInt(g, 50, 80),
    money: 0,
    occupation: 'Pet',
    stats: { health: o.health, happiness: o.happiness, smarts: o.smarts, looks: bell(g, 30, 100) },
    livesWithPlayer: true,
    data: { craziness: o.craziness, lifespan: o.lifespan, exotic: o.exotic, petSource: store, boughtByParent: boughtBy?.id ?? null, lastInteractionAge: c.age },
  })
  count(g, 'pets')
  if (o.exotic) count(g, 'exoticPets')
  addStat(g, 'happiness', randInt(g, 5, 10))
  const what = o.breed.toLowerCase().includes(o.species.toLowerCase()) ? o.breed : `${o.breed} (${o.species.toLowerCase()})`
  log(g, boughtBy ? `${cap(myRel(boughtBy))} got me a ${o.species.toLowerCase()} named ${pet.firstName}.` : `I got a ${o.species.toLowerCase()} named ${pet.firstName}.`, 'good')
  remember(g, `Got a pet ${o.species.toLowerCase()} named ${pet.firstName}.`)
  let text = boughtBy ? `${cap(yourRel(boughtBy))} agreed to get you ${o.name}, a ${what}! \u{1F43E}` : `You brought home ${o.name}, a ${what}, for ${money(o.price)}! \u{1F43E}`
  const partner = currentPartner(g)
  if (o.exotic && partner && chance(g, 0.5)) {
    addRelationship(partner, -randInt(g, 8, 18))
    text += `\n\n${partner.firstName} is terrified of ${pronouns(o.gender).him} and isn't speaking to you.`
  }
  if (boughtBy) {
    notice(g, label, text, { emoji: '\u{1F43E}', tone: 'good' })
    return
  }
  text += '\n\nWould you like to give them a new name?'
  scriptInput(g, {
    title: label,
    emoji: '\u{1F43E}',
    text,
    input: 'text',
    placeholder: pet.firstName,
    defaultValue: pet.firstName,
    scriptId: 'love.pet.name',
    data: asJson({ petId: pet.id }),
  })
})

defineScript('love.pet.name', (g, value, data) => {
  const pet = getPerson(g, dStr(data, 'petId'))
  if (!pet) return
  const name = sanitizeName(value, pet.firstName)
  if (name !== pet.firstName) {
    log(g, `I named my ${(pet.species ?? 'pet').toLowerCase()} ${name}.`)
    pet.firstName = name
  }
})

export const petsMenu: MenuGroup = {
  type: 'menu',
  id: 'pets',
  label: 'Pets',
  emoji: '\u{1F43E}',
  subtitle: 'Get a pet',
  disabledReason: (g) => blockedReason(g) ?? tooYoungReason(g, 6, "You're too young to take care of a pet."),
  header: (g) => {
    const n = livingPets(g).length
    const base = g.character.age < 15 ? "You'll need to convince your parents to buy it." : 'Every pet deserves a good home.'
    return n ? `${base} You have ${n} pet${n === 1 ? '' : 's'}.` : base
  },
  children: () => (Object.keys(STORES) as PetStore[]).map((s) => petStoreAction(s)),
}

// Re-exported for tests / other helpers.
export function removeFromLife(g: GameState, p: Person): void {
  removePerson(g, p.id)
}

export function addPetStat(p: Person, key: 'health' | 'happiness', delta: number): void {
  addPersonStat(p, key, delta)
}

export { shuffle as shuffleList }
