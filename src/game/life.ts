// Birth, generations and life milestones: createNewLife builds a fresh GameState with a
// family, continueAsChild hands the game to a child after death (inheritance included),
// and yearlyMilestones adds the age-based moments (talents, puberty, adulthood...).
import { rollBirthBackground, initializeBirthParent, birthIntroduction } from './birth-background'
import { initializeRoyalBirth, inheritRoyalStatus, royalRule, type RoyalBirthChoice } from './royalty'
import { npcCompany, refreshRoyalCareers } from './npc-lives'
import { npcLife } from './npc-state'
import { refreshValue } from './business/economy'
import { keptFundHolders, payOutDroppedFunds, settleFundsAtDeath } from './business/hedge-year'
import { heirCitizenships } from './activities/immigration-state'
import {
  addHidden,
  addStat,
  bindMoneyContext,
  currentLogYear,
  formatMoney,
  fullName,
  GAME_VERSION,
  inPrison,
  log,
  MONTHS,
  moneyContextOf,
  netWorth,
  notice,
  parents,
  peopleBy,
  remember,
  roleLabel,
  SAVE_SCHEMA,
  scriptChoice,
  spend,
  zodiacFor,
} from './core'
import { fillLocal, hasSnow, localeOf, localSchoolName, localTerm, localUniversityName, type SchoolLevel as LocaleSchoolLevel } from './data/locales'
import { isIndustryLegal } from './data/markets'
import { schoolSystem } from './education'
import { contractCondition } from './health'
import { isNewsLine, logNews } from './history/events'
import { eraOccupation, familyWeights, homemakerShare, realWealthFactor, sameSexAdoptionShare, siblingWeights } from './history/events-people'
import { WARS, type WarDef } from './history/events-wars'
import { hasTech, HISTORY_START, isHistorical, PRESENT_YEAR, techOdds } from './history/timeline'
import { createPerson, eraName, notePerson, randomOccupation } from './people'
import { bell, chance, freshSeed, pick, randInt, uid, weightedPick } from './rng'
import { defineScript } from './scripts'
import { planEstate, settleReading } from './events/will-estate'
import { personalTax } from './nation/effects'
import { askingSalary, becomeCeo, installManager } from './business/career'
import { liveGroup, saveGroup } from './business/conglomerate-state'
import { successionEstateUnits } from './business/nepo-inheritance'
import { inheritConglomerates, settleLateFamilyOwners } from './business/dynasty-ownership'
import { familyOf } from './business/nepo-state'
import { afterSuccession, successorManager } from './business/nepo-succession'
import { bizOf, readBiz, type Manager } from './business/state'
import { yearlyMainCharacter } from './mastery'
import { hasMainCharacter, MAIN_CHARACTER, MAX_START_TALENTS, normalizeTalents, pickedTalents, refreshFamilyTalents, talentLabel, type TalentId } from './talents'
import { getCountry, randomCity, randomCountry, randomFirstName, randomLastName, randomSkinTone, type Country } from './world'
import type {
  AncestorSummary,
  Asset,
  Avatar,
  CareerRecord,
  Character,
  Degree,
  DegreeKind,
  Education,
  Enrollment,
  GameState,
  Gender,
  Json,
  Person,
  RelationKind,
  Residence,
  SchoolLevel,
  Sexuality,
  StatKey,
} from './types'

export interface NewLifeOptions {
  firstName?: string
  lastName?: string
  gender?: Gender
  countryId?: string
  city?: string
  sexuality?: Sexuality
  seed?: number
  /** Royal status only; ordinary family wealth always remains a seeded random roll. */
  royalty?: RoyalBirthChoice
  /**
   * Calendar year of birth (New Life › Born in; default PRESENT_YEAR). Years before
   * PRESENT_YEAR are real history: parents, jobs, technology, news and medicine of that era.
   * Clamped to HISTORY_START and later.
   */
  year?: number
  /**
   * Starting stats chosen before birth (New Life › Customize stats). Each one replaces the
   * rolled/inherited value once the baby is generated (clamped 0-100); missing keys stay random.
   */
  stats?: Partial<Record<StartStatKey, number>>
  /**
   * Special talents picked before birth (New Life › Special Talents): talents.ts ids, unique,
   * at most MAX_START_TALENTS; unknown ids are dropped. Stored on Character.talents.
   */
  talents?: string[]
}

/** The four main stats a player may set before birth. */
export type StartStatKey = 'happiness' | 'health' | 'smarts' | 'looks'
export const START_STAT_KEYS: readonly StartStatKey[] = ['happiness', 'health', 'smarts', 'looks']

/** Apply pre-birth stat choices; ignores anything that isn't a finite number. */
function applyStartStats(c: Character, stats: NewLifeOptions['stats']): void {
  if (!stats || typeof stats !== 'object') return
  for (const key of START_STAT_KEYS) {
    const v = stats[key]
    if (typeof v === 'number' && Number.isFinite(v)) c.stats[key] = clampStat(v)
  }
}

// ---------------------------------------------------------------------------
// Talents
//
// Childhood talents: a kid may discover one at random (g.flags.latentTalent → Character.talent),
// and every talent picked before birth (talents.ts, Character.talents) also gets its own
// discovery moment here. Perks are applied by the modules that ask talents.ts hasTalent().

export interface TalentDef {
  id: string
  emoji: string
  weight: number
  /** Journal hints in early childhood, before the talent is discovered. */
  hints: string[]
  /** Second-person reveal; may use locale tokens ({food}, {teamSport}, {scoutSpot}...) filled by lifeLocal. */
  discovery: string
  apply: (g: GameState) => void
}

export const TALENTS: TalentDef[] = [
  {
    id: 'Inventor', emoji: '💡', weight: 5,
    hints: ['I took apart a broken toy and made it work in a completely different way.', 'I filled a notebook with sketches of machines nobody had built yet.', 'I built a contraption that pours cereal. It mostly pours it on the floor.'],
    discovery: "Your homemade gadget won over the whole class. You have a special talent for inventing! Ideas will strike you all the time, and from age 8 the Inventor's Workshop under Activities is all yours.",
    apply: g => addStat(g, 'smarts', 5),
  },
  {
    id: 'Music',
    emoji: '\u{1F3B5}',
    weight: 15,
    hints: ['I banged on pots and pans like a rock-star drummer.', 'I hummed along to every song on the radio, perfectly in tune.', 'I spent the whole day tapping out rhythms on the kitchen table.'],
    discovery: 'Your music teacher pulled your parents aside after class. Apparently you have perfect pitch! You have a special talent for music.',
    apply: (g) => addStat(g, 'happiness', 5),
  },
  {
    id: 'Athletics',
    emoji: '\u{1F3C3}',
    weight: 18,
    hints: ['I outran every kid on the playground.', 'I climbed to the top of the jungle gym faster than anyone.', "I can't sit still. Running around is my favorite thing in the world."],
    discovery: "Your {peTeacher} can't stop raving about you, and the {teamSport} coach already wants you on the team. You're a natural athlete! You have a special talent for sports.",
    apply: (g) => {
      addHidden(g, 'athleticism', 15)
      addStat(g, 'health', 3)
    },
  },
  {
    id: 'Acting',
    emoji: '\u{1F3AD}',
    weight: 10,
    hints: ['I put on a dramatic one-kid show for my family.', 'I cried real tears on cue to get out of bedtime.', 'I did impressions of everyone at the dinner table.'],
    discovery: 'You stole the show in the school play and got a standing ovation. You have a special talent for acting!',
    apply: (g) => addStat(g, 'happiness', 5),
  },
  {
    id: 'Art',
    emoji: '\u{1F3A8}',
    weight: 10,
    hints: ['I drew a mural on my bedroom wall. My parents were not amused.', "I've been drawing on every surface I can find, including the dog."],
    discovery: "Your art teacher hung your painting in the principal's office. You have a special talent for art!",
    apply: (g) => addStat(g, 'happiness', 4),
  },
  {
    id: 'Writing',
    emoji: '\u{270D}\u{FE0F}',
    weight: 8,
    hints: ['I wrote a story about a dragon who sells insurance.', "I've filled an entire notebook with stories."],
    discovery: 'Your teacher entered your short story in a contest and it won first place! You have a special talent for writing.',
    apply: (g) => addStat(g, 'smarts', 4),
  },
  {
    id: 'Comedy',
    emoji: '\u{1F602}',
    weight: 6,
    hints: ['I made my whole class laugh during a fire drill.', 'I told a joke at dinner and someone snorted milk out of their nose.'],
    discovery: "Everyone says you're the funniest kid in school, including the teachers you roast. You have a special talent for comedy!",
    apply: (g) => addStat(g, 'happiness', 6),
  },
  {
    id: 'Academics',
    emoji: '\u{1F9E0}',
    weight: 8,
    hints: ['I taught myself long division.', 'I read an entire encyclopedia volume for fun.'],
    discovery: 'You aced a test meant for kids twice your age. Your teachers think you might be a genius! You have a special talent for academics.',
    apply: (g) => addStat(g, 'smarts', 12),
  },
  {
    id: 'Modeling',
    emoji: '\u{1F4F8}',
    weight: 8,
    hints: ['Strangers keep telling my parents I should be in commercials.', 'I struck a pose for every camera I saw.'],
    discovery: 'A talent scout stopped your family {scoutSpot} and handed over a business card. You have a special talent for modeling!',
    apply: (g) => addStat(g, 'looks', 10),
  },
  {
    id: 'Cooking',
    emoji: '\u{1F373}',
    weight: 6,
    hints: ['I made my first omelet. It was mostly shell, but still.', "I keep 'improving' the family recipes."],
    discovery: 'You made {food} for the whole family and it was actually delicious. Even the neighbors asked for the recipe. You have a special talent for cooking!',
    apply: (g) => addStat(g, 'happiness', 4),
  },
  {
    id: 'Crime',
    emoji: '\u{1F977}',
    weight: 5,
    hints: ['I picked the lock on the cookie jar.', 'I talked my way out of trouble again. Nobody suspects a thing.'],
    discovery: "You've noticed you have quick hands, a poker face and an uncanny knack for not getting caught. You have a special talent for... crime.",
    apply: (g) => addHidden(g, 'craziness', 4),
  },
  {
    id: 'Programming',
    emoji: '\u{1F4BB}',
    weight: 6,
    hints: ["I figured out the password to my parents' tablet.", 'I taught myself how to make a simple video game.'],
    discovery: 'You built your own website from scratch, and it actually works. You have a special talent for programming!',
    apply: (g) => addStat(g, 'smarts', 6),
  },
  {
    id: 'Business',
    emoji: '\u{1F4BC}',
    weight: 5,
    hints: [
      'I sold my drawings to my grandparents. Then I raised my prices.',
      'I traded one sticker for three better stickers. Everyone on the playground wants to trade with me now.',
      'I talked my parents into a bigger allowance with a hand-drawn chart.',
    ],
    discovery:
      'You started a snack-trading empire at school, hired two classmates as salespeople and turned a real profit before a teacher shut it down. Off the record, she said she was impressed. You have a special talent for business!',
    apply: (g) => {
      addStat(g, 'smarts', 4)
      addHidden(g, 'willpower', 5)
    },
  },
  {
    id: 'Investing',
    emoji: '\u{1F4C8}',
    weight: 3,
    hints: [
      'I refused to spend my birthday money. I told everyone I was "letting it grow."',
      'I kept a little notebook of how much everything costs. I check it every week.',
      'I asked why the numbers on the business news go up and down. Nobody at home could explain it.',
    ],
    discovery:
      "You've been guessing which toys and snacks will cost more next month, and you're right a suspicious amount of the time. A family friend who works at a bank asked you for tips. You have a special talent for investing!",
    apply: (g) => {
      addStat(g, 'smarts', 5)
      addHidden(g, 'discipline', 3)
    },
  },
  {
    id: 'Leadership',
    emoji: '\u{1F3DB}\u{FE0F}',
    weight: 5,
    hints: [
      'I organized the kids on our street into teams. Nobody argued.',
      'I settled a playground fight with a speech. Both sides clapped.',
      'I got put in charge of the class pet. I made a feeding schedule and stuck it on the wall.',
    ],
    discovery:
      'Your class voted you class representative by a landslide, and within a week you had talked your teachers into a longer break. Even the older kids do what you say. You have a special talent for leadership!',
    apply: (g) => {
      addStat(g, 'happiness', 3)
      addHidden(g, 'willpower', 6)
    },
  },
  {
    id: 'Gaming',
    emoji: '\u{1F3AE}',
    weight: 6,
    hints: [
      'I beat a video game my cousin has been stuck on for months.',
      "I memorized every level of my favorite game. I'd like that on my report card.",
      'I figured out a shortcut in a racing game that the grown-ups say is impossible.',
    ],
    discovery: 'You entered an online tournament for kids and finished in the top ten in all of {country}. Your reaction times are off the charts. You have a special talent for gaming!',
    apply: (g) => {
      addStat(g, 'happiness', 4)
      addStat(g, 'smarts', 2)
    },
  },
]

/**
 * Main Character Syndrome has no childhood discovery moment (the character already has every
 * talent), so it is not in TALENTS; this stand-in lets heirs inherit the gift like any other.
 */
const MAIN_CHARACTER_DEF: TalentDef = {
  id: MAIN_CHARACTER,
  emoji: '\u{1F31F}',
  weight: 0,
  hints: [],
  discovery: '',
  apply: () => undefined,
}

export function getTalent(id: string | null | undefined): TalentDef | undefined {
  return id === MAIN_CHARACTER ? MAIN_CHARACTER_DEF : TALENTS.find((t) => t.id === id)
}

/**
 * A talent's childhood hints and discovery as they'd happen in this year and country: no
 * websites before the internet, no video games before consoles, no radio before radio. Modern
 * years (and anything that already fits) use the originals.
 */
function eraTalentText(g: GameState, def: TalentDef): { hints?: string[]; discovery?: string } | null {
  if (!isHistorical(g.year)) return null
  switch (def.id) {
    case 'Programming': {
      if (!hasTech(g, 'homeComputer')) {
        return {
          hints: [
            hasTech(g, 'radio') ? 'I took apart the family radio to see how it works. It almost works again.' : 'I took apart the kitchen clock to see how it works. It almost works again.',
            'I invented a secret code that nobody in my class can crack.',
          ],
          discovery: "You built a working adding machine out of a shoebox, string and sheer stubbornness. Your teacher says you think like an engineer. You have a special talent for programming, even if there's nothing to program yet!",
        }
      }
      if (hasTech(g, 'smartphone')) return null
      const home = techOdds(g, 'homeComputer') >= 0.15
      return {
        hints: home
          ? ['I typed a whole game out of a magazine into the family computer. It crashed. I fixed it.', "I figured out the password to my dad's computer."]
          : ['I spent every spare minute on the one computer at school.', "I filled a notebook with programs for a computer we can't afford."],
        discovery: hasTech(g, 'internet')
          ? 'You built your own website from scratch, and it actually works. You have a special talent for programming!'
          : home
            ? 'You wrote a working game on the family computer, and your teacher had to ask you how it worked. You have a special talent for programming!'
            : "You wrote a program on the school computer that did the whole class's math homework. You have a special talent for programming!",
      }
    }
    case 'Gaming':
      if (!hasTech(g, 'videoGameConsole')) {
        return {
          hints: ['I beat my grandfather at checkers. He demanded a rematch. I won that too.', 'I memorized every card in the deck during a game of rummy.', 'I figured out how to win at marbles every single time.'],
          discovery: 'You won the town chess tournament against grown-ups three times your age. You have a special talent for games!',
        }
      }
      return hasTech(g, 'internet') ? null : { discovery: 'You set a high score at the local arcade that nobody in {country} can beat. You have a special talent for gaming!' }
    case 'Music':
      if (hasTech(g, 'radio') && g.year >= 1955) return null
      return {
        hints: [
          g.year >= 1955 ? 'I banged on pots and pans like a rock-star drummer.' : 'I banged on pots and pans like a marching-band drummer.',
          hasTech(g, 'radio') ? 'I hummed along to every song on the radio, perfectly in tune.' : 'I sang along with every hymn in church, perfectly in tune.',
          'I spent the whole day tapping out rhythms on the kitchen table.',
        ],
      }
    case 'Modeling':
      return hasTech(g, 'tv') ? null : { hints: ['Strangers keep telling my parents I should pose for magazine advertisements.', 'I struck a pose for every camera I saw.'] }
    default:
      return null
  }
}

function talentHints(g: GameState, def: TalentDef): string[] {
  return eraTalentText(g, def)?.hints ?? def.hints
}

function talentDiscovery(g: GameState, def: TalentDef): string {
  return eraTalentText(g, def)?.discovery ?? def.discovery
}

// ---------------------------------------------------------------------------
// Small helpers

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const MAJORS = [
  'Accounting',
  'Biology',
  'Business',
  'Chemistry',
  'Computer Science',
  'Economics',
  'Education',
  'Engineering',
  'English',
  'Finance',
  'History',
  'Journalism',
  'Marketing',
  'Mathematics',
  'Nursing',
  'Philosophy',
  'Physics',
  'Political Science',
  'Psychology',
]

const RICH_OCCUPATIONS = ['Surgeon', 'Lawyer', 'CEO', 'Investment Banker', 'Dentist', 'Real Estate Developer', 'Plastic Surgeon', 'Business Owner', 'Orthodontist', 'Hedge Fund Manager']
/** Where most people are poor, old money looks different. */
const RICH_OCCUPATIONS_DEVELOPING = ['Surgeon', 'Lawyer', 'CEO', 'Business Owner', 'Real Estate Developer', 'Politician', 'Factory Owner', 'Diplomat', 'Import-Export Tycoon', 'Bank Director']

function richOccupations(country: Country): string[] {
  return country.wealth < 0.45 ? RICH_OCCUPATIONS_DEVELOPING : RICH_OCCUPATIONS
}

const PET_NAMES = [
  'Max',
  'Bella',
  'Charlie',
  'Luna',
  'Lucy',
  'Cooper',
  'Daisy',
  'Milo',
  'Bailey',
  'Oliver',
  'Coco',
  'Rocky',
  'Shadow',
  'Ginger',
  'Pepper',
  'Biscuit',
  'Mochi',
  'Nugget',
  'Waffles',
  'Pickles',
  'Muffin',
  'Ziggy',
  'Bean',
  'Sir Fluffington',
  'Princess',
  'Tank',
  'Noodle',
  'Peanut',
]

const PET_SPECIES: { species: string; weight: number; breeds?: string[]; maxAge: number }[] = [
  { species: 'Dog', weight: 50, maxAge: 9, breeds: ['Labrador Retriever', 'Golden Retriever', 'Beagle', 'Bulldog', 'Poodle', 'German Shepherd', 'Chihuahua', 'Dachshund', 'Pug', 'Mutt', 'Border Collie', 'Husky'] },
  { species: 'Cat', weight: 35, maxAge: 10, breeds: ['Tabby', 'Siamese', 'Persian', 'Maine Coon', 'Sphynx', 'Calico', 'Tuxedo', 'Ragdoll'] },
  { species: 'Rabbit', weight: 4, maxAge: 5 },
  { species: 'Hamster', weight: 4, maxAge: 1 },
  { species: 'Parrot', weight: 3, maxAge: 10 },
  { species: 'Fish', weight: 3, maxAge: 2 },
  { species: 'Turtle', weight: 1, maxAge: 15 },
]

const PET_TRAITS = ['playful', 'lazy', 'loyal', 'mischievous', 'cuddly', 'skittish', 'grumpy', 'curious', 'needy', 'aloof']

/** Share of newborns raised in a religion here (world.ts religions are weighted by repetition). */
function religionShare(country: Country, religion: string): number {
  return country.religions.length ? country.religions.filter((r) => r === religion).length / country.religions.length : 0
}

/** Family pets by local custom: in Muslim-majority countries cats and birds are the usual house pets. */
function petWeight(country: Country, species: string, weight: number): number {
  if (religionShare(country, 'Islam') < 0.5) return weight
  return species === 'Dog' ? 8 : species === 'Cat' ? 60 : species === 'Parrot' ? 8 : weight
}

// Birth backstories. {tokens} are filled from the family's country (data/locales.ts), so an
// Indonesian baby's parents run off to Bali and an American one's to Las Vegas. {elope} is the
// country's signature getaway (the first one listed), {weather} and {season} follow the climate.
const CONCEPTION = [
  'I was a planned pregnancy.',
  'I was a happy accident.',
  'I was a test tube baby.',
  'I was conceived on my parents’ honeymoon in {getaway}.',
  'I was conceived on a weekend trip to {getaway}.',
  'I was conceived after my parents’ anniversary dinner at an all-you-can-eat buffet.',
  '{weather}',
  'I was conceived after my parents won a weekend in {getaway} in a radio contest.',
  'I was conceived after my mother’s birth control failed.',
  'I was conceived after my parents eloped to {elope}.',
  'I was conceived during a power outage. My parents blame the lack of TV.',
  'I was conceived at a music festival. My parents still argue about which band was playing.',
  'I was the result of a long-distance relationship and one very expensive plane ticket.',
  'I was conceived on a camping trip.',
  'I was conceived after my father’s vasectomy failed.',
  'I was conceived after a New Year’s Eve party got a little out of hand.',
  'I was conceived after my parents’ date at {dateSpot}. They still go back every anniversary.',
]
const SINGLE_MOTHER_CONCEPTION = [
  'I was the product of a {season} fling.',
  'I was the result of a one-night stand.',
  'I was conceived after a blind date that went a little too well.',
  'I was a surprise to everyone, especially my mother.',
  'I was the souvenir from my mother’s trip to {getaway}.',
]

/** Birth-story lines that only make sense from a certain year (IVF, the pill, TV, festivals...). */
const CONCEPTION_FROM: Readonly<Record<string, number>> = {
  'I was a test tube baby.': 1979,
  'I was conceived after my mother’s birth control failed.': 1962,
  'I was conceived after my father’s vasectomy failed.': 1965,
  'I was conceived at a music festival. My parents still argue about which band was playing.': 1969,
  'I was the result of a long-distance relationship and one very expensive plane ticket.': 1950,
  'I was conceived after my parents’ anniversary dinner at an all-you-can-eat buffet.': 1950,
  'I was conceived during a power outage. My parents blame the lack of TV.': 1955,
  'I was conceived after my parents won a weekend in {getaway} in a radio contest.': 1930,
}

/** The birth-story lines that fit the year (all of them from PRESENT_YEAR on). */
function eraLines(g: GameState, lines: readonly string[]): readonly string[] {
  if (!isHistorical(g.year)) return lines
  const fit = lines.filter((l) => {
    const from = CONCEPTION_FROM[l]
    if (from !== undefined && g.year < from) return false
    if (l.includes('TV') && !hasTech(g, 'tv')) return false
    if (l.includes('radio') && !hasTech(g, 'radio')) return false
    return true
  })
  return fit.length ? fit : lines
}

/** How my parents met (married couples only). */
const PARENTS_MET = [
  'My parents met at {dateSpot}.',
  'My parents met cheering for rival {teamSport} teams.',
  'My parents met on a school trip to {landmark}.',
  'My parents met at {hangout} and never looked back.',
]

/** Weather that keeps a couple indoors, by climate. */
function conceptionWeather(g: GameState, countryId: string): string {
  if (hasSnow(g, countryId)) return 'I was conceived during a blizzard that snowed my parents in for a week.'
  switch (localeOf(countryId).climate) {
    case 'tropical':
      return 'I was conceived during a tropical storm that kept my parents indoors for a week.'
    case 'arid':
      return 'I was conceived during a sandstorm that kept my parents indoors for a week.'
    case 'mediterranean':
      return 'I was conceived during a heat wave that knocked out the air conditioning.'
    default:
      return 'I was conceived during a week of nonstop rain.'
  }
}

/**
 * fillLocal plus this file's own tokens: {teamSport} (the country's favorite sport, so nobody
 * gets scouted by the rodeo coach) and {scoutSpot} (where a talent scout spots a kid: the mall
 * where there is one, a busy street elsewhere) and {peTeacher}.
 */
function lifeLocal(g: GameState, text: string, countryId = g.character.countryId): string {
  const loc = localeOf(countryId)
  let out = text
  if (out.includes('{teamSport}')) out = out.replace(/\{teamSport\}/g, loc.sports[0] ?? 'soccer')
  if (out.includes('{peTeacher}')) out = out.replace(/\{peTeacher\}/g, countryId === 'us' || countryId === 'ca' ? 'gym teacher' : 'PE teacher')
  if (out.includes('{scoutSpot}')) out = out.replace(/\{scoutSpot\}/g, loc.hangouts.includes('the mall') ? 'at the mall' : 'on a busy street in {city}')
  return fillLocal(g, out, countryId)
}

/** Fill a birth backstory line with words from the family's country. */
function localLine(g: GameState, line: string, countryId: string): string {
  const loc = localeOf(countryId)
  let filled = line
  if (filled.includes('{weather}')) filled = filled.replace('{weather}', conceptionWeather(g, countryId))
  if (filled.includes('{season}')) filled = filled.replace('{season}', loc.climate === 'tropical' || loc.climate === 'arid' ? 'whirlwind' : 'summer')
  if (filled.includes('{elope}')) filled = filled.replace('{elope}', loc.getaways[0] ?? '{getaway}')
  return lifeLocal(g, filled, countryId)
}

function numArticle(n: number): string {
  const s = String(n)
  return s.startsWith('8') || n === 11 || n === 18 ? 'an' : 'a'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function clampStat(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** "Jane Doe, a 31 year old Teacher" */
function describe(p: Person): string {
  const occ = p.occupation
  if (occ === 'Unemployed') return `${fullName(p)}, an unemployed ${p.age} year old`
  if (occ === 'None' || occ === 'Retired') return `${fullName(p)}, ${numArticle(p.age)} ${p.age} year old${occ === 'Retired' ? ' retiree' : ''}`
  return `${fullName(p)}, ${numArticle(p.age)} ${p.age} year old ${occ}`
}

function randomSexuality(g: GameState): Sexuality {
  const r = randInt(g, 1, 100)
  return r <= 88 ? 'straight' : r <= 94 ? 'gay' : 'bisexual'
}

function randomBirthday(g: GameState): { month: number; day: number } {
  const month = randInt(g, 1, 12)
  return { month, day: randInt(g, 1, DAYS_IN_MONTH[month - 1]) }
}

const FAIR_REGIONS = new Set(['anglo', 'german', 'dutch', 'nordic', 'irish', 'slavic', 'french'])

function randomAvatar(g: GameState, country: Country, skinTone?: number): Avatar {
  const fair = FAIR_REGIONS.has(country.names)
  const tone = skinTone ?? randomSkinTone(g, country)
  const hair: Avatar['hair'] = fair && tone <= 2 ? weightedPick(g, ['brown', 'blonde', 'black', 'red'] as const, (h) => ({ brown: 45, blonde: 30, black: 15, red: 10 })[h]) : weightedPick(g, ['black', 'brown'] as const, (h) => (h === 'black' ? 65 : 35))
  const eyes: Avatar['eyes'] = fair && tone <= 2 ? weightedPick(g, ['brown', 'blue', 'green', 'hazel', 'gray'] as const, (e) => ({ brown: 35, blue: 30, green: 12, hazel: 15, gray: 8 })[e]) : weightedPick(g, ['brown', 'hazel'] as const, (e) => (e === 'brown' ? 85 : 15))
  return { skinTone: tone, hair, eyes }
}

function emptyEducation(): Education {
  return { current: null, degrees: [], completed: [], droppedOut: [], expelled: 0 }
}

function strList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ---------------------------------------------------------------------------
// New life

type FamilyType = 'together' | 'singleMother' | 'singleFather' | 'divorced' | 'blended' | 'adopted'

function rollFamilyType(g: GameState): FamilyType {
  // Divorce and single parenthood were far rarer in the past (history/events-people.ts).
  const weights = familyWeights(g.year) ?? { together: 78, singleMother: 9, singleFather: 2, divorced: 3, blended: 6, adopted: 2 }
  return weightedPick(g, ['together', 'singleMother', 'singleFather', 'divorced', 'blended', 'adopted'] as FamilyType[], (t) => weights[t])
}

interface ParentSpec {
  gender: Gender
  age: number
  lastName: string
  livesWithPlayer: boolean
  relation: RelationKind
  skinTone: number
}

function makeParent(g: GameState, spec: ParentSpec, rich: boolean, wealth: number, mayStayHome = false): Person {
  let occupation = rich ? eraOccupation(pick(g, richOccupations(getCountry(g.character.countryId))), g.year) : randomOccupation(g, spec.age)
  // In the past most mothers in a two-parent home were full-time homemakers.
  if (mayStayHome && isHistorical(g.year) && spec.gender === 'female' && chance(g, homemakerShare(g.year))) occupation = 'Homemaker'
  const p = createPerson(g, {
    relation: spec.relation,
    age: spec.age,
    gender: spec.gender,
    lastName: spec.lastName,
    occupation,
    relationship: spec.relation === 'stepparent' ? randInt(g, 30, 80) : randInt(g, 60, 100),
    livesWithPlayer: spec.livesWithPlayer,
    skinTone: spec.skinTone,
  })
  const base = rich ? Math.max(p.money, 150_000) * randInt(g, 6, 30) : p.money
  // Real (today's-dollar) savings were smaller in the past (1 from PRESENT_YEAR on).
  p.money = Math.round(base * Math.max(0.2, wealth) * realWealthFactor(g.year))
  initializeBirthParent(g, p)
  return p
}

/** "the Second World War" → war drafts that could have taken someone born in `born`. */
function warsFor(countryId: string, born: number, before: number): WarDef[] {
  return WARS.filter((w) => {
    const rule = w.draft?.[countryId]
    if (!rule || rule.to >= before) return false
    return born + rule.maxAge >= rule.from && born + rule.minAge <= rule.to
  })
}

/**
 * Family history for a life born in the past: a father who served in a war before you were
 * born, a grandfather from an older one. Flavor lines plus a note on the father.
 */
function familyWarLines(g: GameState, father: Person | undefined, mother: Person | undefined, year: number): string[] {
  const out: string[] = []
  const id = g.character.countryId
  if (father && father.relation === 'parent') {
    const war = warsFor(id, year - father.age, year).pop()
    if (war && chance(g, 0.55)) {
      father.data.veteran = war.name
      notePerson(father, `Served in ${war.name}.`)
      out.push(`My father served in ${war.name}.`)
    }
  }
  const parentAge = father?.age ?? mother?.age ?? 28
  const grandWar = warsFor(id, year - parentAge - 30, year - 5).pop()
  if (grandWar && chance(g, 0.4)) out.push(`My grandfather fought in ${grandWar.name}.`)
  return out
}

/** The player's random first name, one that fits the birth year (modern years: one plain roll). */
function eraFirstName(g: GameState, countryId: string, gender: Gender, city: string, year: number): string {
  const name = randomFirstName(g, countryId, gender, city)
  return isHistorical(year) ? eraName(g, name, countryId, gender, year) : name
}

/** A usable calendar year of birth: PRESENT_YEAR by default, never before HISTORY_START. */
export function birthYearOf(year: number | undefined): number {
  if (typeof year !== 'number' || !Number.isFinite(year)) return PRESENT_YEAR
  return Math.max(HISTORY_START, Math.round(year))
}

/**
 * Build a complete, fresh GameState for a newborn: country, family, stats and the
 * birth entries in the life log.
 */
export function createNewLife(opts: NewLifeOptions = {}): GameState {
  const seed = Math.abs(Math.floor(opts.seed ?? freshSeed())) % 2 ** 31
  const year = birthYearOf(opts.year)
  const g: GameState = {
    version: GAME_VERSION,
    schemaVersion: SAVE_SCHEMA,
    lifeId: `life-${year}-${seed.toString(36)}`,
    rng: seed,
    nextId: 0,
    year,
    generation: 1,
    // Filled in below, before anything reads it.
    character: undefined as unknown as Character,
    people: [],
    assets: [],
    log: [],
    queue: [],
    ancestors: [],
    counters: {},
    yearActions: {},
    flags: {},
    ribbon: null,
    obituary: null,
  }

  const country = opts.countryId ? getCountry(opts.countryId) : randomCountry(g)
  const gender: Gender = opts.gender ?? (chance(g, 0.5) ? 'male' : 'female')
  const city = opts.city?.trim() || randomCity(g, country)
  const lastName = opts.lastName?.trim() || randomLastName(g, country.id, city)
  const firstName = opts.firstName?.trim() || eraFirstName(g, country.id, gender, city, year)
  const sexuality = opts.sexuality ?? randomSexuality(g)
  const birthday = randomBirthday(g)
  const avatar = randomAvatar(g, country)
  const religionPick = pick(g, country.religions)
  const religion = religionPick === 'None' ? null : religionPick

  g.character = {
    id: uid(g, 'me'),
    firstName,
    lastName,
    gender,
    sexuality,
    birthday,
    zodiac: zodiacFor(birthday.month, birthday.day),
    countryId: country.id,
    city,
    birthCountryId: country.id,
    age: 0,
    alive: true,
    stats: { happiness: bell(g, 55, 100), health: randInt(g, 80, 100), smarts: 50, looks: 50 },
    hidden: {
      karma: bell(g, 30, 80),
      craziness: bell(g, 0, 70),
      willpower: bell(g, 10, 100),
      discipline: bell(g, 10, 100),
      athleticism: randInt(g, 5, 100),
      fertility: bell(g, 30, 100),
      fame: 0,
      notoriety: 0,
      religiousness: religion ? bell(g, 20, 90) : randInt(g, 0, 25),
    },
    money: 0,
    avatar,
    education: emptyEducation(),
    job: null,
    partTimeJob: null,
    careerHistory: [],
    retired: false,
    pension: 0,
    conditions: [],
    licenses: [],
    criminalRecord: [],
    prison: null,
    wantedLevel: 0,
    residence: { status: 'parents' },
    loans: [],
    social: null,
    talent: null,
    memories: [],
    willBeneficiaries: [],
    religion,
  }
  currentLogYear(g)
  const c = g.character
  // Money written from here on (a wealthy parent's company, the birth log) is in this life's
  // currency and year, not whatever life was on screen before.
  bindMoneyContext(g)

  // --- Family -------------------------------------------------------------
  const rolledFamily = rollFamilyType(g)
  // A selected dynastic birth needs a biological royal parent. Keep the ordinary wealth
  // roll independent, and leave unselected/random lives' family generation unchanged.
  const chosenRoyal = opts.royalty === 'royal' && !!royalRule(country.id, year)
  const family = chosenRoyal && (rolledFamily === 'adopted' || rolledFamily === 'singleMother') ? 'together' : rolledFamily
  const rich = rollBirthBackground(g) >= 5
  const wealth = country.wealth
  const motherAge = Math.max(18, Math.min(46, bell(g, 18, 44)))
  const fatherAge = Math.max(18, motherAge + randInt(g, -3, 7))
  const toneFor = () => (chance(g, 0.75) ? avatar.skinTone : randomSkinTone(g, country))
  const lines: string[] = []
  let mother: Person | undefined
  let father: Person | undefined
  let step: Person | undefined
  let custodial: Person | undefined

  if (family === 'adopted') {
    const sameSex = chance(g, sameSexAdoptionShare(year) ?? 0.2)
    const g1: Gender = sameSex ? (chance(g, 0.5) ? 'male' : 'female') : 'female'
    const g2: Gender = sameSex ? g1 : 'male'
    const a = makeParent(g, { gender: g1, age: motherAge + randInt(g, 2, 8), lastName, livesWithPlayer: true, relation: 'parent', skinTone: randomSkinTone(g, country) }, rich, wealth)
    const b = makeParent(g, { gender: g2, age: fatherAge + randInt(g, 2, 8), lastName, livesWithPlayer: true, relation: 'parent', skinTone: randomSkinTone(g, country) }, rich, wealth)
    a.data.adoptive = true
    b.data.adoptive = true
    a.data.spouseId = b.id
    b.data.spouseId = a.id
    lines.push(pick(g, ['I was adopted as a newborn.', 'I was adopted at birth. My birth mother was too young to raise me.', 'I was adopted shortly after I was born.']))
    lines.push(`My ${g1 === 'male' ? 'father' : 'mother'} is ${describe(a)}.`)
    lines.push(`My ${sameSex ? 'other ' : ''}${g2 === 'male' ? 'father' : 'mother'} is ${describe(b)}.`)
    if (g1 === 'female') mother = a
    else father = a
    if (g2 === 'female' && !mother) mother = b
    else if (g2 === 'male' && !father) father = b
    custodial = a
    g.flags.parentsStatus = 'married'
  } else {
    const together = family === 'together'
    const motherHasName = together || family === 'singleMother' || chance(g, 0.4)
    if (family !== 'singleFather') {
      mother = makeParent(
        g,
        { gender: 'female', age: motherAge, lastName: motherHasName ? lastName : randomLastName(g, country.id), livesWithPlayer: together || family === 'singleMother' || chance(g, 0.75), relation: 'parent', skinTone: avatar.skinTone },
        rich,
        wealth,
        together,
      )
    }
    if (family !== 'singleMother') {
      father = makeParent(
        g,
        { gender: 'male', age: fatherAge, lastName, livesWithPlayer: together || family === 'singleFather', relation: 'parent', skinTone: toneFor() },
        rich && together,
        wealth,
      )
    }
    if (family === 'divorced' || family === 'blended') {
      // Exactly one parent has custody.
      custodial = mother && (mother.livesWithPlayer || !father) ? mother : father
      if (mother) mother.livesWithPlayer = custodial === mother
      if (father) father.livesWithPlayer = custodial === father
      if (mother && father) {
        mother.data.exSpouseId = father.id
        father.data.exSpouseId = mother.id
      }
      g.flags.parentsStatus = 'divorced'
    } else if (together && mother && father) {
      mother.data.spouseId = father.id
      father.data.spouseId = mother.id
      custodial = mother
      g.flags.parentsStatus = 'married'
    } else {
      custodial = mother ?? father
      g.flags.parentsStatus = 'single'
    }
    if (family === 'blended' && custodial) {
      const stepGender: Gender = custodial.gender === 'male' ? 'female' : 'male'
      step = makeParent(
        g,
        { gender: stepGender, age: Math.max(20, custodial.age + randInt(g, -5, 6)), lastName: randomLastName(g, country.id), livesWithPlayer: true, relation: 'stepparent', skinTone: randomSkinTone(g, country) },
        false,
        wealth,
      )
      step.data.spouseId = custodial.id
      custodial.data.spouseId = step.id
    }
    if (family === 'singleMother') lines.push(localLine(g, pick(g, eraLines(g, SINGLE_MOTHER_CONCEPTION)), country.id))
    else if (chance(g, 0.75)) lines.push(localLine(g, pick(g, eraLines(g, CONCEPTION)), country.id))
    if (mother) lines.push(`My mother is ${describe(mother)}.`)
    else lines.push(pick(g, ["My mother isn't in the picture.", 'My mother left shortly after I was born.', "I don't know much about my mother."]))
    if (father) lines.push(`My father is ${describe(father)}.`)
    else lines.push(pick(g, ["I don't know who my father is.", 'My father skipped town before I was born.', 'My father is not in the picture.']))
    if ((family === 'divorced' || family === 'blended') && custodial) {
      lines.push(`My parents are divorced. I live with my ${custodial.gender === 'male' ? 'father' : 'mother'}.`)
    }
    if (step) lines.push(`My ${step.gender === 'male' ? 'stepfather' : 'stepmother'} is ${describe(step)}.`)
    if (together && mother && father && chance(g, 0.3)) lines.push(localLine(g, pick(g, PARENTS_MET), country.id))
  }

  // Looks and smarts are partly inherited.
  const bio = family === 'adopted' ? [] : [mother, father].filter((p): p is Person => p !== undefined)
  const inherit = (key: StatKey) => {
    const avg = bio.length > 0 ? bio.reduce((s, p) => s + p.stats[key], 0) / bio.length : randInt(g, 0, 100)
    return clampStat(avg * 0.5 + randInt(g, 0, 100) * 0.5)
  }
  c.stats.smarts = inherit('smarts')
  c.stats.looks = inherit('looks')

  // --- Siblings -------------------------------------------------------------
  const anchor = mother ?? father ?? custodial
  const maxSiblingAge = anchor ? Math.min(15, anchor.age - 18) : 0
  // Big families were the norm in the past (history/events-people.ts).
  const eraSiblings = siblingWeights(year)
  const sibWeights = eraSiblings ?? [40, 32, 18, 10]
  let siblingCount = maxSiblingAge >= 1 ? weightedPick(g, sibWeights.map((_, i) => i), (n) => sibWeights[n]) : 0
  // A big family needs the years to have it in: no five four-year-olds for a 22-year-old mother.
  if (eraSiblings) siblingCount = Math.min(siblingCount, Math.max(1, Math.floor(maxSiblingAge / 1.6)))
  const ages: number[] = []
  for (let i = 0; i < siblingCount; i++) ages.push(randInt(g, 1, maxSiblingAge))
  ages.sort((a, b) => b - a)
  const parentIds = [mother?.id, father?.id].filter((x): x is string => typeof x === 'string')
  for (const age of ages) {
    const half = family !== 'together' && family !== 'adopted' && chance(g, 0.4)
    const sib = createPerson(g, {
      relation: half ? 'halfSibling' : 'sibling',
      age,
      lastName: half ? randomLastName(g, country.id) : lastName,
      relationship: randInt(g, 40, 90),
      livesWithPlayer: true,
      skinTone: toneFor(),
      data: { parentIds },
    })
    const word = sib.gender === 'male' ? 'brother' : 'sister'
    lines.push(`I have an older ${half ? `half ${word}` : word} named ${sib.firstName} (age ${sib.age}).`)
  }
  if (chance(g, 0.02)) {
    const twin = createPerson(g, {
      relation: 'sibling',
      age: 0,
      lastName,
      relationship: randInt(g, 60, 95),
      livesWithPlayer: true,
      skinTone: avatar.skinTone,
      occupation: 'None',
      data: { parentIds, twin: true },
    })
    lines.push(`I have a twin ${twin.gender === 'male' ? 'brother' : 'sister'} named ${twin.firstName}.`)
  }

  // --- Family pet -------------------------------------------------------------
  if (chance(g, 0.3)) {
    const kind = weightedPick(g, PET_SPECIES, (s) => petWeight(country, s.species, s.weight))
    const pet = createPerson(g, {
      relation: 'pet',
      age: randInt(g, 0, kind.maxAge),
      firstName: pick(g, PET_NAMES),
      species: kind.species,
      breed: kind.breeds ? pick(g, kind.breeds) : undefined,
      relationship: randInt(g, 60, 95),
      livesWithPlayer: true,
      money: 0,
      traits: [pick(g, PET_TRAITS)],
    })
    lines.push(`We have a family ${kind.species.toLowerCase()} named ${pet.firstName}.`)
  }

  // --- Birth log ---------------------------------------------------------------
  log(g, `I was born a ${gender} in ${city}, ${country.name}.`, 'event')
  const conceptionIdx = lines.findIndex((l) => l.startsWith('I was '))
  if (conceptionIdx >= 0) log(g, lines.splice(conceptionIdx, 1)[0])
  log(g, `My birthday is ${MONTHS[birthday.month - 1]} ${birthday.day}. I am ${/^[AEIOU]/.test(c.zodiac) ? 'an' : 'a'} ${c.zodiac}.`)
  log(g, `My name is ${firstName} ${lastName}.`)
  if (initializeRoyalBirth(g, opts.royalty)) refreshRoyalCareers(g, true)
  for (const line of lines) {
    const parent = line.startsWith('My father is ') ? father : line.startsWith('My mother is ') ? mother : undefined
    log(g, parent?.data.royalHouse ? `My ${parent.gender === 'male' ? 'father' : 'mother'} is ${fullName(parent)}, a ${parent.age} year old ${parent.occupation}.` : line)
  }
  birthIntroduction(g)
  if (isHistorical(year)) for (const line of familyWarLines(g, father, mother, year)) log(g, line)
  // The news the year I was born.
  logNews(g)
  remember(g, `Born in ${city}, ${country.name}${custodial ? `, raised by my ${custodial.gender === 'male' ? 'father' : 'mother'} ${custodial.firstName}` : ''}.`)

  // --- Hidden destiny -------------------------------------------------------------
  if (chance(g, 0.3)) {
    g.flags.latentTalent = weightedPick(g, TALENTS, (t) => t.weight).id
    g.flags.talentAge = randInt(g, 5, 12)
  }

  // Chosen stats and talents go on last so the same seed still rolls the same family and destiny.
  applyStartStats(c, opts.stats)
  const picked = normalizeTalents(opts.talents, MAX_START_TALENTS)
  if (picked.length) {
    c.talents = picked
    // A random extra talent is still possible, just not a second copy of one already picked.
    if (typeof g.flags.latentTalent === 'string' && (picked as string[]).includes(g.flags.latentTalent)) {
      delete g.flags.latentTalent
      delete g.flags.talentAge
    }
    // Main Character Syndrome already has every talent: no childhood talent to discover.
    if ((picked as string[]).includes(MAIN_CHARACTER)) {
      delete g.flags.latentTalent
      delete g.flags.talentAge
    }
  }
  // A citizen of the country you're born in (immigration.ts adds passports later).
  c.citizenships = [c.countryId]
  return g
}

// ---------------------------------------------------------------------------
// Generations: continue as a child

function isHeirloom(a: Asset): boolean {
  return a.details.heirloom === true || a.details.heirloom === 'true'
}

/** K-12 levels (types.ts) to the locale's school-name levels. */
const LOCALE_LEVEL: Partial<Record<SchoolLevel, LocaleSchoolLevel>> = { elementary: 'primary', middle: 'middle', high: 'high' }

/** Put a minor in the school (and year) that fits their age in their country's school system. */
function schoolForAge(g: GameState, age: number, countryId: string, smarts: number): { current: Enrollment | null; completed: SchoolLevel[] } {
  const completed: SchoolLevel[] = []
  let from = schoolSystem(countryId).startAge
  for (const spec of schoolSystem(countryId).levels) {
    if (age >= from + spec.years) {
      completed.push(spec.level)
      from += spec.years
      continue
    }
    if (age >= from) {
      const school = localSchoolName(g, LOCALE_LEVEL[spec.level] ?? 'high', countryId)
      return {
        current: { level: spec.level, school, year: age - from + 1, totalYears: spec.years, grades: clampStat(smarts * 0.6 + 30), data: {} },
        completed,
      }
    }
    break
  }
  return { current: null, completed }
}

const OCCUPATION_DEGREES: Record<string, { major: string; extra?: [DegreeKind, string] }> = {
  Doctor: { major: 'Biology', extra: ['md', 'Doctor of Medicine'] },
  Surgeon: { major: 'Biology', extra: ['md', 'Doctor of Medicine'] },
  'Plastic Surgeon': { major: 'Biology', extra: ['md', 'Doctor of Medicine'] },
  Lawyer: { major: 'Political Science', extra: ['jd', 'Juris Doctor'] },
  Dentist: { major: 'Biology', extra: ['dds', 'Doctor of Dental Surgery'] },
  Orthodontist: { major: 'Biology', extra: ['dds', 'Doctor of Dental Surgery'] },
  Pharmacist: { major: 'Chemistry', extra: ['pharmd', 'Doctor of Pharmacy'] },
  Veterinarian: { major: 'Biology', extra: ['dvm', 'Doctor of Veterinary Medicine'] },
  Professor: { major: 'History', extra: ['doctorate', 'PhD in History'] },
  CEO: { major: 'Finance', extra: ['mba', 'Master of Business Administration'] },
  'Investment Banker': { major: 'Finance' },
  'Hedge Fund Manager': { major: 'Finance', extra: ['mba', 'Master of Business Administration'] },
  Nurse: { major: 'Nursing' },
  'Software Developer': { major: 'Computer Science' },
  Engineer: { major: 'Engineering' },
  Accountant: { major: 'Accounting' },
  Architect: { major: 'Engineering' },
  Teacher: { major: 'Education' },
  Journalist: { major: 'Journalism' },
  'Marketing Manager': { major: 'Marketing' },
  'Graphic Designer': { major: 'English' },
  'Social Worker': { major: 'Psychology' },
  Librarian: { major: 'English' },
}

/** Where each professional degree is earned, appended to the university's name. */
const GRAD_SCHOOL_SUFFIX: Partial<Record<DegreeKind, string>> = {
  md: 'School of Medicine',
  jd: 'School of Law',
  dds: 'School of Dentistry',
  pharmd: 'School of Pharmacy',
  dvm: 'School of Veterinary Medicine',
  mba: 'School of Business',
}

function adultEducation(g: GameState, age: number, countryId: string, occupation: string): Education {
  const edu = emptyEducation()
  const levels = schoolSystem(countryId).levels
  edu.completed = levels.map((l) => l.level)
  const finalLevel = levels.find((l) => l.level === 'high') ?? levels[levels.length - 1]
  edu.degrees.push({ kind: 'highschool', name: `${finalLevel?.name ?? 'High School'} Diploma`, school: localSchoolName(g, 'high', countryId), age: Math.min(age, 18) })
  const plan = OCCUPATION_DEGREES[occupation]
  if (plan && age >= 22) {
    const university = localUniversityName(g, countryId)
    edu.completed.push('university')
    edu.degrees.push({ kind: 'bachelor', name: `Bachelor's in ${plan.major}`, major: plan.major, school: university, age: 22 })
    if (plan.extra && age >= 25) {
      edu.completed.push('graduate')
      const school = `${university} ${GRAD_SCHOOL_SUFFIX[plan.extra[0]] ?? 'Graduate School'}`
      edu.degrees.push({ kind: plan.extra[0], name: plan.extra[1], major: plan.major, school, age: Math.min(age, 26) } satisfies Degree)
    }
  }
  return edu
}

/** Chance that an heir inherits one of the late player's picked talents. */
const TALENT_INHERIT_CHANCE = 0.4

/**
 * Maybe hand one of the late player's picked talents to the heir (stored on heir.talents, so
 * it works like a pick from birth). Consumes no randomness when there was nothing picked.
 */
function inheritTalent(n: GameState, old: Character, heir: Character): TalentDef | undefined {
  if (heir.talents?.includes(MAIN_CHARACTER) || old.talents?.includes(MAIN_CHARACTER) || old.talent === MAIN_CHARACTER) {
    heir.talents = [MAIN_CHARACTER]
    return getTalent(MAIN_CHARACTER)
  }
  const picks = normalizeTalents(old.talents, Number.MAX_SAFE_INTEGER).filter((id) => id !== heir.talent)
  if (picks.length === 0 || !chance(n, TALENT_INHERIT_CHANCE)) return undefined
  const id: TalentId = picks.length === 1 ? picks[0] : pick(n, picks)
  const def = getTalent(id)
  if (!def) return undefined
  heir.talents = [id]
  return def
}

function siblingRelation(heir: Person, other: Person): RelationKind {
  const sameOther = heir.otherParentId !== undefined && heir.otherParentId === other.otherParentId
  if (heir.relation === 'child') {
    if (other.relation === 'child') return sameOther ? 'sibling' : 'halfSibling'
    return sameOther ? 'halfSibling' : 'stepsibling'
  }
  if (other.relation === 'stepchild') return sameOther ? 'sibling' : 'stepsibling'
  return sameOther ? 'halfSibling' : 'stepsibling'
}

function parentNoun(gender: Gender): string {
  return gender === 'male' ? 'father' : 'mother'
}

/**
 * Generations: after the player dies, carry on as one of their children. Returns a new
 * GameState (the input is not modified).
 */
export function continueAsChild(g: GameState, childId: string): GameState {
  const heirPerson = g.people.find((p) => p.id === childId)
  if (!heirPerson || !heirPerson.alive || (heirPerson.relation !== 'child' && heirPerson.relation !== 'stepchild')) return g
  if (g.character.alive) return g

  const n = structuredClone(g)
  refreshFamilyTalents(n)
  const old = n.character
  const heirP = n.people.find((p) => p.id === childId) as Person
  const npcEducation = npcLife(heirP)
  const country = getCountry(heirP.age >= 18 && typeof heirP.data.countryId === 'string' ? heirP.data.countryId : old.countryId)
  const passports = heirCitizenships(g, heirPerson)
  const pf = Math.max(0.3, country.wealth)
  const oldName = fullName(old)
  const oldNoun = parentNoun(old.gender)
  const cause = old.causeOfDeath ?? 'Unknown Causes'
  const occupation = typeof n.flags.finalOccupation === 'string' ? n.flags.finalOccupation : roleLabel(n)

  // --- Ancestor record ---------------------------------------------------------
  const deathMoney = moneyContextOf(n)
  const summary: AncestorSummary = {
    generation: n.generation,
    name: oldName,
    gender: old.gender,
    bornYear: n.year - old.age,
    diedYear: n.year,
    age: old.age,
    causeOfDeath: cause,
    netWorth: netWorth(n),
    countryId: old.countryId,
    ...(deathMoney.nominalScale ? { nominalScale: deathMoney.nominalScale } : {}),
    ...(deathMoney.usdNominalScale ? { usdNominalScale: deathMoney.usdNominalScale } : {}),
    occupation,
    ribbon: n.ribbon,
  }

  // --- Estate --------------------------------------------------------------------
  const heirlooms = n.assets.filter(isHeirloom)
  const property = n.assets.filter((a) => !isHeirloom(a))
  // Resolve every designation before choosing what this playable child keeps. A conglomerate is
  // one economic holding: it is a bequest only when all valid child designations agree. This makes
  // the result independent of which child the user chooses to continue as.
  // Co-owners who died before the player pass their stakes on first (the player's part joins the
  // estate that divides now), so no share stays on a late relative's record.
  settleLateFamilyOwners(n)
  // The same for family hedge funds: a relative who died first passes their units on, and yours are in the estate.
  settleFundsAtDeath(n)
  const successionUnits = successionEstateUnits(n)
  // Spun-off divisions with family co-owners remain in-kind holdings too.
  const groupIds = new Set(successionUnits.filter(u => u.group || u.assets.some(a => Array.isArray(a.details.familyShares) && a.details.familyShares.length > 0)).flatMap(u => u.assets.map(a => a.id)))
  const groupInheritanceLines = inheritConglomerates(n, childId, successionUnits)
  const familyOwnerIds = new Set(successionUnits.flatMap(u => u.group ? liveGroup(n, u.group.id)?.core.familyShares?.map(x => x.id) ?? [] : u.assets.flatMap(a => readBiz(n, a).familyShares?.map(x => x.id) ?? [])))
  const allocatedUnits = successionUnits.filter((unit) => unit.recipient !== null)
  const allocatedIds = new Set(allocatedUnits.flatMap((unit) => unit.assets.map((a) => a.id)))
  const selectedUnits = allocatedUnits.filter((unit) => unit.recipient?.id === childId)
  const selectedIds = new Set(selectedUnits.flatMap((unit) => unit.assets.map((a) => a.id)))
  const selectedBequests = property.filter((a) => selectedIds.has(a.id))
  const divisibleProperty = property.filter((a) => !allocatedIds.has(a.id) && !groupIds.has(a.id))
  // Capture management plans while every old-generation Person still exists. Some relatives do
  // not remain contacts after the point-of-view change, but their appointment should still stand
  // (as an ordinary external manager without a dangling personId).
  const managementPlans = new Map<string, Manager>()
  for (const a of selectedBequests) {
    if (a.kind !== 'business') continue
    const b = bizOf(n, a)
    const manager = successorManager(n, a, b, (skill) => askingSalary(b, skill, 0))
    if (manager) managementPlans.set(a.id, manager)
  }

  // NPC-owned companies are no longer player assets, but the designated child remains in the
  // family as their owner. Drop the old employee-only record so later family-year cleanup cannot
  // treat ownership as a dangling job at a vanished asset.
  for (const unit of allocatedUnits) {
    if (unit.assets.some(a => groupIds.has(a.id)) || !unit.recipient || unit.recipient.id === childId) continue
    // NPCs cannot retain Asset records after the point-of-view change. Represent the inherited
    // holding once in their modeled wealth instead, using the same net-equity basis as the
    // divisible estate and never turning an underwater holding into a new personal debt.
    const inheritedEquity = Math.max(0, Math.round(unit.assets.reduce((sum, a) => sum + a.value - (a.mortgage?.balance ?? 0), 0)))
    unit.recipient.money = Math.round(unit.recipient.money + inheritedEquity)
    delete unit.recipient.data.nepo
    unit.recipient.occupation = 'Business Owner'
  }

  const debts = old.loans.reduce((s, l) => s + l.balance, 0)
  const divisibleEquity = divisibleProperty.reduce((s, a) => s + a.value - (a.mortgage?.balance ?? 0), 0)
  const estate = Math.round(old.money + divisibleEquity - debts)
  const adult = heirP.age >= 18
  // Who inherits what (the will, charity, contests and probate live in events/will-estate.ts).
  const plan = planEstate(n, { estate, heirId: childId, adult, hasProperty: divisibleProperty.length > 0 || groupIds.size > 0, cashAfterDebts: old.money - debts, taxDelta: personalTax(g, 'inheritance', old.countryId) / 100 })
  const heirIncluded = plan.heirIncluded
  const shareCount = Math.max(1, plan.ways)
  const keepProperty = plan.keepProperty
  const inheritanceLines: string[] = []
  const cashInherited = plan.heirCash
  const estateTax = plan.tax
  const keptProperty = property.filter((a) => groupIds.has(a.id) || selectedIds.has(a.id) || (keepProperty && !allocatedIds.has(a.id)))
  const keptAssets: Asset[] = [...keptProperty, ...heirlooms]
  // Relatives in a family fund the heir does not keep are paid before the heir's money is built.
  inheritanceLines.push(...payOutDroppedFunds(n, property.filter((a) => !keptAssets.includes(a))))
  // Relatives in a family fund the heir keeps stay in the heir's contacts, so their units stay theirs.
  for (const id of keptFundHolders(keptAssets)) familyOwnerIds.add(id)

  // --- The heir becomes the player ---------------------------------------------
  const age = heirP.age
  const heirTone = typeof heirP.data.skinTone === 'number' ? heirP.data.skinTone : old.avatar.skinTone
  const sexualityData = heirP.data.sexuality
  const knownSexuality = sexualityData === 'straight' || sexualityData === 'gay' || sexualityData === 'bisexual'
  // A child who was already old enough to come out (and didn't) is straight.
  const sexuality: Sexuality = knownSexuality ? sexualityData : heirP.data.cameOutChecked === true ? 'straight' : randomSexuality(n)
  const bd = heirP.data.birthday
  const birthday =
    bd && typeof bd === 'object' && !Array.isArray(bd) && typeof bd.month === 'number' && typeof bd.day === 'number' ? { month: bd.month, day: bd.day } : randomBirthday(n)
  const talentData = typeof heirP.data.talent === 'string' ? heirP.data.talent : null
  // Durable NPC talents (Main Character Syndrome) carry over. Without any, leave `talents` unset
  // exactly as before: an empty list would read as "inherited a gift" to the heir logic and UI.
  const npcTalents = normalizeTalents(heirP.data.talents, Number.MAX_SAFE_INTEGER)
  const npcOccupation = heirP.occupation
  const grief = randInt(n, 20, 40) * (heirP.relationship >= 50 ? 1 : 0.5)

  let education: Education
  const careerHistory: CareerRecord[] = []
  let retired = false
  let pension = 0
  if (age < 18) {
    const school = schoolForAge(n, age, country.id, heirP.stats.smarts)
    education = { ...emptyEducation(), completed: school.completed, current: school.current }
  } else {
    education = adultEducation(n, age, country.id, npcOccupation)
    if (npcOccupation === 'University Student' && age <= 22) {
      education.current = {
        level: 'university',
        school: localUniversityName(n, country.id),
        year: Math.max(1, Math.min(4, npcEducation ? npcEducation.study + 1 : age - 17)),
        totalYears: 4,
        grades: clampStat(heirP.stats.smarts * 0.6 + 30),
        major: npcEducation?.field ?? pick(n, MAJORS),
        funding: country.freeUniversity ? 'free' : 'scholarship',
        data: {},
      }
    } else if (npcOccupation === 'Retired') {
      retired = true
      pension = Math.round(randInt(n, 12_000, 28_000) * pf)
      careerHistory.push({ title: 'Career', company: old.city, startAge: 22, endAge: Math.min(age, 67), reason: 'retired', salary: Math.round(45_000 * pf) })
    } else if (!['Unemployed', 'None', 'Student', 'University Student'].includes(npcOccupation)) {
      careerHistory.push({ title: npcOccupation, company: old.city, startAge: Math.max(18, age - randInt(n, 1, Math.max(1, age - 18))), endAge: age, reason: 'quit', salary: Math.round(randInt(n, 30_000, 90_000) * pf) })
      n.flags.heirOccupation = npcOccupation
    }
  }

  if (npcEducation) {
    // Recorded qualifications are authoritative, including no university degree. A job title
    // must not fabricate credentials when the player takes over an independent NPC's life.
    education.degrees = [
      ...education.degrees.filter(d => d.kind === 'highschool' || d.kind === 'ged'),
      ...Array.from({ length: npcEducation.education }, (_, i) => ({ kind: (['bachelor', 'master', 'doctorate'] as const)[i], name: `${["Bachelor's", "Master's", 'Doctorate'][i]} in ${npcEducation.field}`, major: npcEducation.field, school: 'Local university', age: Math.min(age, 22 + i * 2) })),
    ]
    education.completed = education.completed.filter(level => level !== 'university' && level !== 'graduate')
    if (npcEducation.education > 0) education.completed.push('university')
    if (npcEducation.education > 1) education.completed.push('graduate')
  }

  const heir: Character = {
    id: heirP.id,
    firstName: heirP.firstName,
    lastName: heirP.lastName || old.lastName,
    gender: heirP.gender,
    sexuality,
    birthday,
    zodiac: zodiacFor(birthday.month, birthday.day),
    countryId: country.id,
    city: npcEducation?.city && country.cities.includes(npcEducation.city) ? npcEducation.city : country.id === old.countryId ? old.city : country.cities[0],
    birthCountryId: old.countryId,
    citizenships: passports,
    ...(passports.includes(country.id) ? {} : { immigration: { countryId: country.id, status: 'permanent' as const, since: typeof heirP.data.relocated === 'number' ? heirP.data.relocated : n.year } }),
    age,
    alive: true,
    stats: {
      happiness: clampStat(heirP.stats.happiness - grief),
      health: clampStat(heirP.stats.health),
      smarts: clampStat(heirP.stats.smarts),
      looks: clampStat(heirP.stats.looks),
    },
    hidden: {
      karma: bell(n, 30, 80),
      craziness: bell(n, 0, 70),
      willpower: bell(n, 10, 100),
      discipline: bell(n, 10, 100),
      athleticism: randInt(n, 5, 100),
      fertility: bell(n, 30, 100),
      fame: old.hidden.fame >= 50 ? bell(n, 5, 25) : 0,
      notoriety: 0,
      religiousness: clampStat(old.hidden.religiousness + randInt(n, -20, 15)),
    },
    money: Math.max(0, Math.round(heirP.money)) + cashInherited,
    avatar: randomAvatar(n, country, heirTone),
    education,
    job: null,
    partTimeJob: null,
    careerHistory,
    retired,
    pension,
    conditions: [],
    licenses: age >= country.drivingAge + 2 && chance(n, 0.7) ? ['driver'] : [],
    criminalRecord: [],
    prison: null,
    wantedLevel: 0,
    residence: { status: 'parents' },
    loans: [],
    social: null,
    talent: talentData ?? (age >= 12 && chance(n, 0.25) ? weightedPick(n, TALENTS, (t) => t.weight).id : null),
    ...(npcTalents.length ? { talents: npcTalents } : {}),
    memories: [],
    willBeneficiaries: [],
    religion: old.religion,
  }

  // --- Rebuild relationships from the heir's point of view -----------------------
  const otherParent = n.people.find((p) => p.id === heirP.otherParentId) ?? (heirP.relation === 'stepchild' ? n.people.find((p) => p.relation === 'spouse') : undefined)
  const people: Person[] = []
  const knownYears = (p: Person) => Math.min(age, p.age)
  const reset = (p: Person, relation: RelationKind, relationship: number, livesWith: boolean): Person => {
    const out: Person = {
      ...p,
      relation,
      relationship: clampStat(relationship),
      livesWithPlayer: livesWith && p.alive,
      yearsKnown: knownYears(p),
      notes: p.alive ? [] : p.notes,
    }
    // Links that only made sense from the late player's point of view.
    delete out.otherParentId
    delete out.contextId
    delete out.pregnant
    return out
  }

  // The late player.
  people.push({
    id: old.id,
    firstName: old.firstName,
    lastName: old.lastName,
    gender: old.gender,
    age: old.age,
    alive: false,
    causeOfDeath: cause,
    relation: heirP.relation === 'stepchild' ? 'stepparent' : 'parent',
    relationship: heirP.relationship,
    stats: { ...old.stats },
    money: 0,
    occupation,
    traits: [],
    yearsKnown: age,
    livesWithPlayer: false,
    notes: [],
    data: { skinTone: old.avatar.skinTone, formerPlayer: true, talents: old.talents ?? [], ...(old.talent ? { talent: old.talent } : {}) },
  })

  let guardian: Person | undefined
  if (otherParent) {
    const p = reset(otherParent, 'parent', randInt(n, 55, 95), age < 18)
    people.push(p)
    if (p.alive) guardian = p
  }
  const spouse = n.people.find((p) => p.alive && p.relation === 'spouse' && p.id !== otherParent?.id)
  if (spouse && (age < 18 || heirP.livesWithPlayer)) {
    const p = reset(spouse, 'stepparent', randInt(n, 30, 75), age < 18)
    people.push(p)
    guardian = guardian ?? p
  }

  for (const sib of n.people.filter((p) => (p.relation === 'child' || p.relation === 'stepchild') && p.id !== childId)) {
    people.push(reset(sib, siblingRelation(heirP, sib), randInt(n, 35, 85), age < 18 && sib.livesWithPlayer))
  }
  for (const gp of n.people.filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent'))) {
    const p = reset(gp, 'grandparent', randInt(n, 50, 90), false)
    people.push(p)
    guardian = guardian ?? p
  }
  // The heir's own husband or wife (NPC marriages only store a name).
  let heirSpouse: Person | undefined
  const spouseName = typeof heirP.data.spouseName === 'string' ? heirP.data.spouseName.trim() : ''
  if (heirP.data.married === true && spouseName && age >= 18) {
    const [first, ...rest] = spouseName.split(' ')
    const spouseGender: Gender = sexuality === 'gay' ? heir.gender : sexuality === 'straight' ? (heir.gender === 'male' ? 'female' : 'male') : chance(n, 0.5) ? 'male' : 'female'
    const before = n.people.length
    heirSpouse = createPerson(n, {
      relation: 'spouse',
      age: Math.max(18, age + randInt(n, -4, 4)),
      gender: spouseGender,
      firstName: first,
      lastName: rest.join(' ') || heir.lastName,
      relationship: randInt(n, 55, 90),
      livesWithPlayer: true,
      skinTone: randomSkinTone(n, country),
    })
    // createPerson appends to the old list; move them into the rebuilt one.
    n.people.splice(before)
    heirSpouse.yearsKnown = randInt(n, 2, Math.max(2, age - 18))
    people.push(heirSpouse)
  }
  // Grandchildren through the heir become the heir's children.
  for (const gc of n.people.filter((p) => p.relation === 'grandchild')) {
    const ids = [gc.data.parentId, gc.data.childOf, gc.otherParentId, ...strList(gc.data.parentIds)]
    if (!ids.includes(childId)) continue
    const kid = reset(gc, 'child', randInt(n, 60, 95), gc.alive && gc.age < 18)
    if (heirSpouse) kid.otherParentId = heirSpouse.id
    people.push(kid)
  }
  for (const pet of n.people.filter((p) => p.alive && p.relation === 'pet')) {
    people.push(reset(pet, 'pet', randInt(n, 40, 80), true))
  }
  // Persistent entrepreneurs and known relatives do not disappear when the viewpoint changes.
  for (const contact of n.people) {
    if (contact.id === childId || people.some(p => p.id === contact.id) || (!npcLife(contact) && !familyOwnerIds.has(contact.id))) continue
    const kept = reset(contact, 'friend', Math.min(60, contact.relationship), false)
    kept.notes = contact.notes
    kept.data.generationConnection = `Known through ${oldName}`
    people.push(kept)
  }
  n.people = people
  for (const unit of allocatedUnits) {
    if (!unit.recipient || unit.recipient.id === childId) continue
    const recipient = n.people.find((p) => p.id === unit.recipient?.id)
    if (!recipient) continue
    const holding = unit.group?.name ?? unit.assets[0]?.name ?? 'the family company'
    notePerson(recipient, `Inherited ${holding} as the designated successor (age ${recipient.age}).`)
  }

  // --- Home --------------------------------------------------------------------
  let residence: Residence
  const oldHome = old.residence.status === 'owned' ? keptAssets.find((a) => a.id === old.residence.assetId) : undefined
  if (age < 18) residence = guardian ? { status: 'parents' } : { status: 'parents', description: 'Living with relatives' }
  else if (oldHome) residence = { status: 'owned', assetId: oldHome.id }
  else if (heirP.livesWithPlayer && age < 26 && guardian && guardian.relation === 'parent') residence = { status: 'parents' }
  else residence = { status: 'renting', rent: Math.round(randInt(n, 9_000, 16_000) * pf), description: 'Apartment' }
  heir.residence = residence
  for (const a of keptAssets) {
    a.purchasedAge = Math.min(a.purchasedAge, age)
    if (isHeirloom(a)) a.details.yearsInFamily = (typeof a.details.yearsInFamily === 'number' ? a.details.yearsInFamily : 0) + old.age
  }

  // --- Assemble the new generation -------------------------------------------------
  n.generation += 1
  n.lifeId = `${g.lifeId.replace(/-g\d+$/, '')}-g${n.generation}`
  n.ancestors = [...n.ancestors, summary]
  n.character = heir
  // The inheritance and the heir's first lines are written in the heir's currency (they may
  // live abroad), not the late parent's.
  bindMoneyContext(n)
  n.assets = keptAssets
  const ownedBeforeInheritance = npcCompany(heirP, n.year)
  if (ownedBeforeInheritance) {
    const { a, b } = ownedBeforeInheritance
    delete b.npcOwnerId
    const claim = n.assets.find(x => x.details.npcCompanyId === a.id)
    if (claim) { b.share = Math.min(1, b.share + (typeof claim.details.share === 'number' ? claim.details.share : 0)); n.assets = n.assets.filter(x => x.id !== claim.id) }
    installManager(n, b)
    a.details = b as unknown as Record<string, Json>
    refreshValue(a, b); n.assets.push(a)
  }
  if (npcEducation) {
    // Realize the heir's own pre-existing portfolio/housing once, not the deceased's estate.
    n.character.money += Math.max(0, npcEducation.investments + npcEducation.housing - npcEducation.debt)
    const shortfall = Math.max(0, npcEducation.debt - npcEducation.investments - npcEducation.housing)
    if (shortfall > 0) n.character.loans.push({ id: `npc-debt:${childId}`, kind: 'personal', lender: 'Existing personal creditors', balance: shortfall, rate: .06, yearsLeft: 10, yearlyPayment: shortfall * .14, countryId: npcEducation.country })
  }
  n.log = [{ age, year: n.year, entries: [] }]
  n.queue = []
  n.counters = {}
  n.yearActions = {}
  n.ribbon = null
  n.obituary = null
  n.flags = {
    sexualityRealized: age >= 16 || knownSexuality,
    ...(knownSexuality && sexuality !== 'straight' ? { out: true, closeted: false } : {}),
    puberty: age >= 14,
    adultNotice: age >= 18,
    midlifeCrisis: age > 55,
    previousGeneration: oldName,
    // Restricted charitable funds are not estate assets. Only stewardship and
    // already-funded program commitments survive; professional abilities do not.
    ...(n.flags.givingFund ? { givingFund: n.flags.givingFund } : {}),
    ...(typeof n.flags.heirOccupation === 'string' ? { heirOccupation: n.flags.heirOccupation } : {}),
    // Market shocks are world state (a banned company stays banned), not the old character's.
    ...(Array.isArray(n.flags.marketShocks) ? { marketShocks: n.flags.marketShocks } : {}),
    ...(Array.isArray(n.flags.marketBreakthroughs) ? { marketBreakthroughs: n.flags.marketBreakthroughs } : {}),
    ...(n.flags['business.confidence'] ? { 'business.confidence': n.flags['business.confidence'], 'business.confidenceYear': n.flags['business.confidenceYear'] ?? 0 } : {}),
    ...(n.flags.worldEconomy ? { worldEconomy: n.flags.worldEconomy } : {}),
    ...(n.flags.groupServices ? { groupServices: n.flags.groupServices, groupServicesPrepared: n.flags.groupServicesPrepared ?? -1, groupServicesSettled: n.flags.groupServicesSettled ?? -1, groupServiceResults: n.flags.groupServiceResults ?? [] } : {}),
    ...(Array.isArray(n.flags.timelineForks) ? { timelineForks: n.flags.timelineForks } : {}),
    // Inventions that beat history are world state: an heir can't invent them first again.
    ...(Array.isArray(n.flags['workshop.firsts']) ? { 'workshop.firsts': n.flags['workshop.firsts'] } : {}),
  }
  inheritRoyalStatus(n, heirP)
  // An heir already serving as group CEO keeps that appointment, now as the playable chair.
  // Do not retain a hired-manager pointer to a Person removed by the generation handoff.
  for (const unit of successionUnits) {
    if (!unit.group) continue
    const grp = liveGroup(n, unit.group.id)
    if (grp?.core.manager?.personId === childId && grp.core.share > 0 && age >= 18) {
      grp.core.ceo = 'owner'; grp.core.manager = null
      saveGroup(n, grp)
    }
  }

  // A designated heir is no longer a Person employee after becoming the player. Spend their
  // person-based succession records now, put one directly designated company in the player's CEO
  // job, and make any inherited group theirs to chair. Without this normalization syncCeo would
  // fail to find the old Person and replace the heir with a random manager on the next year.
  if (selectedUnits.length > 0) {
    for (const unit of selectedUnits) {
      if (!unit.group) continue
      const grp = liveGroup(n, unit.group.id)
      if (!grp) continue
      grp.core.ceo = 'owner'
      grp.core.manager = null
      saveGroup(n, grp)
    }
    const inheritedBusinesses = selectedBequests.filter((a) => a.kind === 'business').sort((a, b) => a.id.localeCompare(b.id))
    for (const a of inheritedBusinesses) {
      const b = bizOf(n, a)
      const family = familyOf(b)
      if (family.succ.kind === 'person' && family.succ.id === childId) family.succ = { kind: '', id: '' }
    }
    const leadIds = selectedUnits.map((unit) => unit.leadAssetId).filter((id): id is string => !!id).sort()
    const lead = inheritedBusinesses.find((a) => a.id === leadIds[0]) ?? inheritedBusinesses[0]
    if (lead) {
      for (const a of inheritedBusinesses) {
        if (a.id === lead.id) continue
        const b = bizOf(n, a)
        const captured = managementPlans.get(a.id)
        const planned = captured?.personId === childId ? null : captured ?? successorManager(n, a, b, (skill) => askingSalary(b, skill, 0))
        if (planned) {
          const installed = installManager(n, b, planned)
          afterSuccession(n, a, b, installed)
          if (installed.personId && !n.people.some((p) => p.id === installed.personId)) delete installed.personId
        } else if (b.ceo === 'owner' || b.manager?.personId === childId) installManager(n, b)
      }
      becomeCeo(n, lead, bizOf(n, lead), 'Owner & CEO')
    }
  }

  if (age < 12 && !heir.talent && chance(n, 0.3)) {
    n.flags.latentTalent = weightedPick(n, TALENTS, (t) => t.weight).id
    n.flags.talentAge = Math.max(age + 1, randInt(n, 5, 12))
  }
  // Talents picked before birth aren't handed down whole, but a gift can run in the family.
  const inherited = inheritTalent(n, old, heir)
  if (inherited && (n.flags.latentTalent === inherited.id || inherited.id === MAIN_CHARACTER)) {
    delete n.flags.latentTalent
    delete n.flags.talentAge
  }
  n.flags.grandkidsSeen = n.people.filter((p) => p.relation === 'grandchild').map((p) => p.id)
  inheritanceLines.push(...groupInheritanceLines)

  const childWord = heir.gender === 'male' ? (heirP.relation === 'stepchild' ? 'stepson' : 'son') : heirP.relation === 'stepchild' ? 'stepdaughter' : 'daughter'
  log(n, `I am now playing as ${fullName(heir)}, the ${childWord} of ${oldName}.`, 'event')
  log(n, `My ${heirP.relation === 'stepchild' ? `step${oldNoun}` : oldNoun}, ${oldName}, died from ${cause.toLowerCase()} at the age of ${old.age}.`, 'bad')

  if (!heirIncluded && plan.willed) {
    inheritanceLines.push(selectedBequests.length > 0 ? `${old.gender === 'male' ? 'His' : 'Her'} will left the rest of the estate to someone else. You didn't inherit any cash.` : `${old.gender === 'male' ? 'His' : 'Her'} will left everything to someone else. You didn't get a cent.`)
    log(n, `I was cut out of my ${oldNoun}'s will.`, 'bad')
  } else if (keepProperty) {
    const houses = divisibleProperty.filter((a) => a.kind === 'house').length
    const cars = divisibleProperty.filter((a) => a.kind === 'car').length
    const bits = [houses > 0 ? `${houses} ${houses === 1 ? 'property' : 'properties'}` : '', cars > 0 ? `${cars} ${cars === 1 ? 'vehicle' : 'vehicles'}` : '', divisibleProperty.length - houses - cars > 0 ? 'other belongings' : ''].filter(Boolean)
    inheritanceLines.push(`You inherited ${formatMoney(cashInherited)} in cash${bits.length > 0 ? `, plus ${bits.join(' and ')}` : ''}.`)
    log(n, `I inherited ${formatMoney(cashInherited)} and my ${oldNoun}'s belongings.`, 'good')
  } else if (cashInherited > 0) {
    const split = shareCount > 1 ? ` The estate was split ${shareCount} ways.` : ''
    const auction = !adult && divisibleProperty.length > 0 ? ` Because you're a minor, the houses and cars were auctioned off.` : ''
    const tax = estateTax > 0 ? ` The government took ${formatMoney(estateTax)} in ${old.countryId === 'us' ? 'estate taxes' : 'inheritance tax'}.` : ''
    inheritanceLines.push(`You inherited ${formatMoney(cashInherited)}.${split}${auction}${tax}`)
    log(n, `I inherited ${formatMoney(cashInherited)} from my late ${oldNoun}.`, 'good')
    if (!adult && divisibleProperty.length > 0) log(n, `My ${oldNoun}'s houses and cars were auctioned off because I'm a minor.`)
  } else if (plan.held > 0) {
    inheritanceLines.push('Your share is tied up in probate for now.')
    log(n, `My ${oldNoun}'s estate is tied up in probate.`)
  } else if (selectedBequests.length === 0 && !groupInheritanceLines.length) {
    inheritanceLines.push(estate <= 0 ? `${old.gender === 'male' ? 'He' : 'She'} died broke, so there was nothing to inherit.` : 'There was nothing left for you to inherit.')
    log(n, `My ${oldNoun} left me nothing but memories.`)
  }
  if (selectedBequests.length > 0) {
    const names = selectedUnits.map((unit) => unit.group?.name ?? unit.assets[0]?.name).filter((name): name is string => !!name).join(' and ')
    inheritanceLines.push(`As the designated successor, you inherited ${names} intact.`)
    log(n, `I inherited ${names} as the designated successor.`, 'good')
  }
  const giftFrom = heirP.relation === 'stepchild' ? `step${oldNoun}` : oldNoun
  if (inherited && age > PICK_REVEAL_BY) {
    // Old enough to have noticed long ago; a younger heir finds out in a childhood moment.
    markRevealed(n, [inherited.id])
    const talentName = talentLabel(inherited.id).toLowerCase()
    inheritanceLines.push(`Like your ${giftFrom}, you have a natural gift for ${talentName}.`)
    log(n, `Like my ${giftFrom}, I have a natural gift for ${talentName}.`, 'good')
  }
  if (heirlooms.length > 0) {
    inheritanceLines.push(`You also inherited ${heirlooms.length === 1 ? 'a family heirloom' : `${heirlooms.length} family heirlooms`}: ${heirlooms.map((a) => a.name).join(', ')}.`)
    log(n, `I inherited the family heirloom${heirlooms.length === 1 ? '' : 's'}.`)
  }
  if (education.current) log(n, `I'm in my ${ordinal(education.current.year)} year at ${education.current.school}.`)
  else if (careerHistory.length > 0 && careerHistory[0].reason === 'quit') log(n, `After the funeral, I quit my job as ${/^[aeiou]/i.test(npcOccupation) ? 'an' : 'a'} ${npcOccupation} to make a fresh start.`)
  if (heirSpouse) {
    const kids = people.filter((p) => p.relation === 'child' && p.alive).length
    log(n, `I'm married to ${fullName(heirSpouse)}${kids > 0 ? ` and we have ${kids === 1 ? 'a child' : `${kids} children`}` : ''}.`)
  }
  if (guardian && age < 18) log(n, `I live with my ${guardian.relation === 'grandparent' ? (guardian.gender === 'male' ? 'grandfather' : 'grandmother') : guardian.relation === 'stepparent' ? (guardian.gender === 'male' ? 'stepfather' : 'stepmother') : parentNoun(guardian.gender)}.`)

  heir.memories.push(`Age ${age}: My ${oldNoun} ${oldName} died from ${cause.toLowerCase()} at ${old.age}. I took over as generation ${n.generation} of the ${heir.lastName} family.`)
  if (inherited && age > PICK_REVEAL_BY) {
    const talentName = talentLabel(inherited.id).toLowerCase()
    heir.memories.push(`Age ${age}: Inherited my ${giftFrom}'s gift for ${talentName}.`)
  }
  notice(
    n,
    `Generation ${n.generation}`,
    `You are now playing as ${fullName(heir)}, the ${age}-year-old ${childWord} of the late ${oldName}. ${inheritanceLines.join(' ')}`,
    { emoji: '\u{1F9EC}' },
  )
  // The reading of the will: reactions, contests, the cut-out heir's choices (events/will-estate.ts).
  settleReading(n, plan, old, childId)
  return n
}

// ---------------------------------------------------------------------------
// Yearly milestones

const FIRST_STEPS = ['I took my first wobbly steps.', 'I learned to wave bye-bye at everyone, including the dog.', 'I learned how to clap. I clapped at everything.', 'I discovered my feet and tried to eat them.']
const TODDLER = ['I learned to say "mine" about everything.', 'I threw a tantrum in the middle of the grocery store.', 'I drew on the wall with a crayon. It was a masterpiece.', 'I figured out how to climb out of my crib.']

const PUBERTY_MALE = [
  'Your voice cracked in the middle of answering a question in class. Welcome to puberty!',
  'You woke up with a mustache. Well, three hairs. Welcome to puberty!',
  'You grew four inches over the summer and none of your pants fit. Welcome to puberty!',
]
const PUBERTY_FEMALE = [
  "You've hit puberty. Your body is changing and your emotions are a roller coaster.",
  'Puberty has arrived. Your parents gave you an awkward talk that nobody enjoyed.',
  'You grew three inches over the summer and your moods have a mind of their own. Welcome to puberty!',
]

const DECADE_LINES: Record<number, string[]> = {
  30: ["I'm officially in my thirties.", 'I turned 30. My back has started making noises.'],
  40: ["I'm forty. Over the hill, but the view is nice.", 'I turned 40 and found my first gray hair.'],
  50: ['I turned 50. Half a century!', "I'm 50 now. I've started enjoying gardening shows."],
  60: ['I turned 60. My knees can predict the weather.', "I'm in my sixties now."],
  65: ["I'm officially a senior citizen. Bring on the discounts.", 'I turned 65. I now qualify for the early-bird special.', 'I turned 65. Strangers have started offering me their seat on the bus.'],
  70: ['I turned 70. I still feel 69.', "I'm seventy years young."],
  80: ['I turned 80 and blew out all the candles. Eventually.', "I'm 80. I've outlived most of my enemies."],
  90: ['I turned 90. The doctors are impressed.', "I'm ninety and still kicking. Gently."],
}

/** Countries where people measure height in inches. */
const IMPERIAL = new Set(['us', 'gb', 'lr', 'mm'])

/** Growth spurts in local units and seasons: no "summer" where there isn't one. */
function localPuberty(g: GameState, text: string): string {
  const c = g.character
  let out = text
  if (!IMPERIAL.has(c.countryId)) out = out.replace('four inches', 'ten centimeters').replace('three inches', 'eight centimeters')
  const climate = localeOf(c.countryId).climate
  if (climate === 'tropical' || climate === 'arid') out = out.replace('over the summer', 'over the school holidays')
  return out
}

/** "your high school prom", "your Abiball", "your matric dance"... */
function schoolDanceMemory(g: GameState): string {
  const dance = localTerm(g, 'schoolDance')
  return /^the /i.test(dance) ? `your ${dance.slice(4)}` : `your ${localTerm(g, 'high')} ${dance}`
}

const HOBBIES = ['skydiving', 'the electric guitar', 'pottery', 'marathon running', 'salsa dancing', 'rock climbing', 'surfing', 'karate']

/** Hobbies a mid-life crisis could reach for in that year. */
const HOBBY_FROM: Readonly<Record<string, number>> = { skydiving: 1960, 'the electric guitar': 1952, 'salsa dancing': 1970, karate: 1960, 'marathon running': 1970, 'rock climbing': 1950 }

function eraHobbies(g: GameState): readonly string[] {
  if (!isHistorical(g.year)) return HOBBIES
  const fit = HOBBIES.filter((h) => g.year >= (HOBBY_FROM[h] ?? 0))
  return fit.length ? fit : ['ballroom dancing', 'pottery']
}

/** Picked talents get their childhood "you have a special talent" moment between these ages. */
const PICK_REVEAL_FROM = 5
const PICK_REVEAL_BY = 10

/** The "Special Talent" moment: one-time bump, popup, log line and memory. */
function revealTalent(g: GameState, def: TalentDef): void {
  def.apply(g)
  notice(g, 'Special Talent', lifeLocal(g, talentDiscovery(g, def)), { emoji: def.emoji, tone: 'good' })
  log(g, `I discovered I have a special talent for ${def.id.toLowerCase()}.`, 'good')
  remember(g, `Discovered a special talent for ${def.id.toLowerCase()}.`)
  g.flags.talentNoticeAge = g.character.age
}

/** Talents picked before birth (or inherited) that haven't had their discovery moment yet. */
function pendingPicks(g: GameState): TalentDef[] {
  const revealed = strList(g.flags.talentsRevealed)
  const out: TalentDef[] = []
  for (const id of pickedTalents(g)) {
    if (revealed.includes(id) || id === g.character.talent || id === MAIN_CHARACTER) continue
    const def = getTalent(id)
    if (def) out.push(def)
  }
  return out
}

function markRevealed(g: GameState, ids: string[]): void {
  g.flags.talentsRevealed = [...new Set([...strList(g.flags.talentsRevealed), ...ids])]
}

/**
 * Childhood talents. A random latent talent (rolled at birth) surfaces at its age; talents
 * picked before birth are active from day one but each still gets its own discovery moment
 * between PICK_REVEAL_FROM and PICK_REVEAL_BY, one a year at most (never on top of another
 * "Special Talent" popup). Before that, a few journal lines hint at what's coming.
 */
function talentMilestones(g: GameState): void {
  const c = g.character
  // Main Character Syndrome: every talent from day one, so nothing is left to discover.
  if (hasMainCharacter(g)) return
  const latent = typeof g.flags.latentTalent === 'string' && !c.talent ? getTalent(g.flags.latentTalent) : undefined
  const talentAge = typeof g.flags.talentAge === 'number' ? g.flags.talentAge : 8
  const noticeThisYear = () => g.flags.talentNoticeAge === c.age
  if (latent && c.age >= talentAge && !noticeThisYear()) {
    c.talent = latent.id
    revealTalent(g, latent)
    return
  }

  let pending = pendingPicks(g)
  if (pending.length > 0 && c.age > PICK_REVEAL_BY + 2) {
    // Too old for a "you have a gift" popup (an heir, an odd save): they've always known.
    markRevealed(g, pending.map((t) => t.id))
    pending = []
  }
  if (pending.length > 0 && c.age >= PICK_REVEAL_FROM && !noticeThisYear()) {
    // Spread the moments out, but make sure every one has happened by PICK_REVEAL_BY.
    const yearsLeft = Math.max(1, PICK_REVEAL_BY - c.age + 1)
    if (pending.length >= yearsLeft || chance(g, pending.length / yearsLeft)) {
      const def = pending.length === 1 ? pending[0] : pick(g, pending)
      markRevealed(g, [def.id])
      revealTalent(g, def)
      return
    }
  }
  if (noticeThisYear()) return

  // Journal hints: a latent talent before its age, or picked talents before their moment.
  const pool = [...(latent && c.age < talentAge ? talentHints(g, latent) : []), ...pending.flatMap((t) => talentHints(g, t))]
  if (pool.length === 0) return
  const hints = typeof g.flags.talentHints === 'number' ? g.flags.talentHints : 0
  // Each hint is used once, and never two years running.
  const used = strList(g.flags.talentHintsUsed)
  const fresh = pool.filter((h) => !used.includes(h))
  const lastAge = typeof g.flags.talentHintAge === 'number' ? g.flags.talentHintAge : -9
  if (c.age >= 2 && hints < 3 && fresh.length > 0 && c.age - lastAge >= 2 && chance(g, 0.4)) {
    const hint = pick(g, fresh)
    log(g, hint)
    g.flags.talentHints = hints + 1
    g.flags.talentHintsUsed = [...used, hint]
    g.flags.talentHintAge = c.age
  }
}

function attractedWord(c: Character): string {
  if (c.sexuality === 'bisexual') return 'both boys and girls'
  return c.sexuality === 'gay' ? (c.gender === 'male' ? 'boys' : 'girls') : c.gender === 'male' ? 'girls' : 'boys'
}

function sexualityMilestone(g: GameState): void {
  const c = g.character
  if (g.flags.sexualityRealized || c.age < 13) return
  if (c.age < 16 && !chance(g, 0.35)) return
  g.flags.sexualityRealized = true
  if (c.sexuality === 'straight') {
    log(g, pick(g, [`I've started noticing ${attractedWord(c)}.`, `I've developed my first crush on one of the ${attractedWord(c)} at school.`, `I think ${attractedWord(c)} are suddenly a lot less gross.`]))
    return
  }
  scriptChoice(
    g,
    SEXUALITY,
    'Feelings',
    pick(g, [
      `You've realized you're attracted to ${attractedWord(c)}. What will you do?`,
      `Lately you can't stop thinking about ${attractedWord(c)}. You're pretty sure you know what that means. What will you do?`,
    ]),
    [
      { id: 'out', label: 'Come out to my family', emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}' },
      { id: 'private', label: 'Keep it to myself', emoji: '\u{1F910}' },
      { id: 'deny', label: 'Deny it', emoji: '\u{1F648}' },
    ],
    { emoji: '\u{1F4AD}' },
  )
}

const SEXUALITY = defineScript('life.sexuality', (g, choice) => {
  const c = g.character
  if (!c.alive) return
  const label = c.sexuality === 'bisexual' ? 'bisexual' : 'gay'
  if (choice === 'deny') {
    g.flags.closeted = true
    g.flags.inDenial = true
    addStat(g, 'happiness', -randInt(g, 5, 10))
    notice(g, 'Feelings', "You told yourself it's just a phase. Your diary isn't convinced.", { emoji: '\u{1F648}' })
    log(g, 'I told myself my feelings were just a phase.')
    return
  }
  if (choice === 'private') {
    g.flags.closeted = true
    addStat(g, 'happiness', randInt(g, 2, 5))
    notice(g, 'Feelings', `You've accepted that you're ${label}, but you're not ready to tell anyone yet. That's okay.`, { emoji: '\u{1F910}' })
    log(g, `I realized I'm ${label}, but I'm keeping it to myself for now.`)
    return
  }
  g.flags.closeted = false
  g.flags.out = true
  const fam = parents(g)
  const reactions: string[] = []
  let rejected = 0
  // Acceptance came slowly: parents were far less supportive in past decades.
  const era = !isHistorical(g.year) ? 1 : g.year < 1970 ? 0.4 : g.year < 1990 ? 0.6 : g.year < 2005 ? 0.8 : 0.92
  for (const p of fam) {
    const strict = p.traits.includes('religious') || p.traits.includes('grumpy') || p.traits.includes('serious')
    const supportive = chance(g, (strict ? 0.45 : 0.88) * era)
    const who = p.relation === 'stepparent' ? (p.gender === 'male' ? 'stepfather' : 'stepmother') : p.gender === 'male' ? 'father' : 'mother'
    if (supportive) {
      p.relationship = clampStat(p.relationship + randInt(g, 3, 10))
      reactions.push(pick(g, [`Your ${who} hugged you and said they're proud of you.`, `Your ${who} said, "We know, sweetie. We've known for years."`, `Your ${who} cried happy tears and offered to make a celebratory cake.`]))
    } else {
      rejected++
      p.relationship = clampStat(p.relationship - randInt(g, 10, 25))
      reactions.push(pick(g, [`Your ${who} went quiet and left the room.`, `Your ${who} said they "need some time to process this."`]))
    }
  }
  addStat(g, 'happiness', rejected === 0 ? randInt(g, 8, 15) : randInt(g, -5, 5))
  const text =
    fam.length > 0
      ? `You came out to your family as ${label}. ${reactions.join(' ')}`
      : `You came out to your friends as ${label}. They shrugged and said they figured as much.`
  notice(g, 'Coming Out', text, { emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', tone: rejected === 0 ? 'good' : 'neutral' })
  log(g, `I came out to my family as ${label}.`, rejected === 0 ? 'good' : 'neutral')
  remember(g, `Came out as ${label}.`)
})

function midlifeCrisis(g: GameState): void {
  const c = g.character
  if (g.flags.midlifeCrisis || c.age < 40 || c.age > 55 || inPrison(g)) return
  // One per life: skip if the event library already gave us one.
  if (g.log.some((y) => y.entries.some((e) => /mid-?life crisis/i.test(e.text)))) {
    g.flags.midlifeCrisis = true
    return
  }
  if (!chance(g, 0.05)) return
  g.flags.midlifeCrisis = true
  scriptChoice(
    g,
    MIDLIFE,
    'Mid-Life Crisis',
    pick(g, [
      "You've been staring at your reflection a lot lately and wondering where the time went. What will you do?",
      `You just realized you are closer to retirement than to ${schoolDanceMemory(g)}. Panic is setting in. What will you do?`,
    ]),
    [
      { id: 'splurge', label: 'Blow money on a wild trip', emoji: '\u{1F334}' },
      { id: 'makeover', label: 'Get a dramatic makeover', emoji: '\u{1F487}' },
      { id: 'hobby', label: 'Take up a daring new hobby', emoji: '\u{1FA82}' },
      { id: 'accept', label: 'Accept getting older', emoji: '\u{1F9D8}' },
    ],
    { emoji: '\u{1F62C}' },
  )
}

const MIDLIFE = defineScript('life.midlife', (g, choice) => {
  const c = g.character
  if (!c.alive) return
  const pf = Math.max(0.3, getCountry(c.countryId).wealth)
  if (choice === 'splurge') {
    const want = Math.round(randInt(g, 3_000, 12_000) * pf)
    const cost = Math.min(want, Math.max(0, c.money))
    if (cost < 300) {
      addStat(g, 'happiness', randInt(g, 1, 4))
      notice(g, 'Mid-Life Crisis', `You wanted to ${g.year >= 1958 ? 'jet' : 'head'} off somewhere exotic, but your bank balance said "staycation." You bought some fancy sunglasses instead.`, { emoji: '\u{1F576}\u{FE0F}' })
      log(g, 'I had a mid-life crisis on a budget.')
      return
    }
    spend(g, cost)
    addStat(g, 'happiness', randInt(g, 10, 16))
    const where = lifeLocal(g, '{getaway}')
    notice(g, 'Mid-Life Crisis', `You blew ${formatMoney(cost)} on a spontaneous trip to ${where} and came back with a tan, a tattoo and some regrets.`, { emoji: '\u{1F334}', tone: 'good' })
    log(g, `I spent ${formatMoney(cost)} on a wild mid-life crisis getaway to ${where}.`)
    return
  }
  if (choice === 'makeover') {
    const cost = Math.min(Math.round(randInt(g, 150, 500) * pf), Math.max(0, c.money))
    spend(g, cost)
    const d = randInt(g, -4, 9)
    addStat(g, 'looks', d)
    addStat(g, 'happiness', randInt(g, 5, 10))
    notice(
      g,
      'Mid-Life Crisis',
      d >= 0 ? 'You got a bold new haircut and a wardrobe from this decade. People keep telling you that you look ten years younger!' : 'You dyed your hair a color not found in nature. You love it. Nobody else does.',
      { emoji: '\u{1F487}', tone: d >= 0 ? 'good' : 'neutral' },
    )
    log(g, 'I got a dramatic makeover during my mid-life crisis.')
    return
  }
  if (choice === 'hobby') {
    const hobby = pick(g, eraHobbies(g))
    addStat(g, 'happiness', randInt(g, 6, 12))
    addStat(g, 'health', randInt(g, 1, 5))
    notice(g, 'Mid-Life Crisis', `You took up ${hobby}. Your family thinks you've lost it, but you feel alive.`, { emoji: '\u{1FA82}', tone: 'good' })
    log(g, `I took up ${hobby} during my mid-life crisis.`)
    return
  }
  addStat(g, 'happiness', randInt(g, 2, 6))
  addStat(g, 'smarts', randInt(g, 1, 3))
  notice(g, 'Mid-Life Crisis', 'You decided wrinkles are just smile lines with seniority. Very wise.', { emoji: '\u{1F9D8}', tone: 'good' })
  log(g, 'I made peace with getting older.')
})

function grandparenthood(g: GameState): void {
  const c = g.character
  const seen = strList(g.flags.grandkidsSeen)
  const grandkids = peopleBy(g, ['grandchild'], true)
  const fresh = grandkids.filter((p) => !seen.includes(p.id))
  if (fresh.length === 0) return
  // The relationships module usually announces births itself; only fill the gaps
  // (grandchildren added by events or other modules).
  const entries = currentLogYear(g).entries
  let first = seen.length === 0 && g.flags.hadGrandchild !== true
  for (const kid of fresh) {
    if (kid.age > 1 || entries.some((e) => e.text.includes(kid.firstName))) continue
    const word = c.gender === 'male' ? 'grandfather' : 'grandmother'
    const rel = kid.gender === 'male' ? 'grandson' : 'granddaughter'
    if (first) {
      log(g, `I became a ${word}! My ${rel} ${kid.firstName} was born.`, 'good')
      addStat(g, 'happiness', randInt(g, 5, 12))
      g.flags.hadGrandchild = true
      first = false
    } else {
      log(g, `My ${rel} ${kid.firstName} was born.`, 'good')
    }
  }
  g.flags.grandkidsSeen = [...seen, ...fresh.map((p) => p.id)]
}

/** Yearly hook: age-based milestones not owned by other modules. Runs after the others. */
export function yearlyMilestones(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  // The yearly world-news line doesn't count as something happening to me.
  const quiet = currentLogYear(g).entries.every((e) => isNewsLine(e.text))

  if (c.age === 1 && quiet) log(g, pick(g, FIRST_STEPS))
  else if (c.age === 2 && quiet) log(g, pick(g, TODDLER))

  talentMilestones(g)
  yearlyMainCharacter(g)

  if (!g.flags.puberty && c.age >= 12) {
    const p = c.age >= 14 ? 1 : c.age === 13 ? 0.6 : 0.35
    if (chance(g, p)) {
      g.flags.puberty = true
      const looks = randInt(g, -6, 8)
      addStat(g, 'looks', looks)
      addStat(g, 'happiness', -randInt(g, 0, 4))
      let text = localPuberty(g, pick(g, c.gender === 'male' ? PUBERTY_MALE : PUBERTY_FEMALE))
      if (chance(g, 0.35) && contractCondition(g, 'Acne', { quiet: true, diagnosed: true })) text += ' To top it off, your face has broken out in acne.'
      notice(g, 'Puberty', text, { emoji: '\u{1F331}' })
      log(g, 'I hit puberty.')
    }
  }

  sexualityMilestone(g)

  if (c.age === 18 && !g.flags.adultNotice) {
    g.flags.adultNotice = true
    const country = getCountry(c.countryId)
    const drink = isIndustryLegal(c.countryId, 'bar') && country.drinkingAge <= 18 ? ' You can legally drink now, too.' : ''
    const text = inPrison(g)
      ? "Happy 18th birthday! You're officially an adult. Spending it behind bars isn't ideal, but the cake in the cafeteria was... edible."
      : `Happy 18th birthday! You're officially an adult. You can now get a full-time job, move out, sign contracts and make your own questionable decisions.${drink}`
    notice(g, "You're an Adult!", text, { emoji: '\u{1F382}', tone: 'good' })
    log(g, 'I became an adult.', 'event')
  }
  const drinkingAge = getCountry(c.countryId).drinkingAge
  if (c.age === drinkingAge && drinkingAge !== 18 && !inPrison(g) && isIndustryLegal(c.countryId, 'bar')) log(g, "I'm finally old enough to drink legally.")

  // The early-bird special is an American diner tradition.
  const decade = DECADE_LINES[c.age]?.filter((l) => c.countryId === 'us' || !l.includes('early-bird'))
  if (decade && decade.length > 0) log(g, pick(g, decade))

  if (c.age === 100) {
    addStat(g, 'happiness', randInt(g, 8, 15))
    const card = getCountry(c.countryId).monarchy ? 'A card of congratulations arrived from the palace' : 'The mayor sent you a card'
    notice(g, 'Centenarian', `Happy 100th birthday! You've lived a full century. ${card}, and the local news wants an interview about your secret to a long life.`, { emoji: '\u{1F389}', tone: 'good' })
    log(g, 'I turned 100 years old!', 'good')
    remember(g, 'Turned 100.')
  }

  midlifeCrisis(g)
  grandparenthood(g)
}
