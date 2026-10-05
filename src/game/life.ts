// Birth, generations and life milestones: createNewLife builds a fresh GameState with a
// family, continueAsChild hands the game to a child after death (inheritance included),
// and yearlyMilestones adds the age-based moments (talents, puberty, adulthood...).
import {
  addHidden,
  addStat,
  currentLogYear,
  formatMoney,
  fullName,
  GAME_VERSION,
  inPrison,
  log,
  MONTHS,
  netWorth,
  notice,
  parents,
  peopleBy,
  remember,
  roleLabel,
  scriptChoice,
  spend,
  zodiacFor,
} from './core'
import { contractCondition } from './health'
import { createPerson, randomOccupation } from './people'
import { bell, chance, freshSeed, pick, randInt, uid, weightedPick } from './rng'
import { defineScript } from './scripts'
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
  /** Calendar year of birth (the UI passes the real current year). */
  year?: number
}

// ---------------------------------------------------------------------------
// Talents

export interface TalentDef {
  id: string
  emoji: string
  weight: number
  /** Journal hints in early childhood, before the talent is discovered. */
  hints: string[]
  discovery: string
  apply: (g: GameState) => void
}

export const TALENTS: TalentDef[] = [
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
    discovery: "Your gym teacher can't stop raving about you. You're a natural athlete! You have a special talent for sports.",
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
    discovery: 'A talent scout stopped your family at the mall and handed over a business card. You have a special talent for modeling!',
    apply: (g) => addStat(g, 'looks', 10),
  },
  {
    id: 'Cooking',
    emoji: '\u{1F373}',
    weight: 6,
    hints: ['I made my first omelet. It was mostly shell, but still.', "I keep 'improving' the family recipes."],
    discovery: 'You cooked dinner for the whole family and it was actually delicious. You have a special talent for cooking!',
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
]

export function getTalent(id: string | null | undefined): TalentDef | undefined {
  return TALENTS.find((t) => t.id === id)
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

const CONCEPTION = [
  'I was a planned pregnancy.',
  'I was a happy accident.',
  'I was a test tube baby.',
  'I was conceived on my parents’ honeymoon.',
  'I was conceived on a cruise somewhere in the Caribbean.',
  'I was conceived after my parents’ anniversary dinner at an all-you-can-eat buffet.',
  'I was conceived during a blizzard that snowed my parents in for a week.',
  'I was conceived after my parents won a weekend getaway in a radio contest.',
  'I was conceived after my mother’s birth control failed.',
  'I was conceived after my parents eloped in Las Vegas.',
  'I was conceived during a power outage. My parents blame the lack of TV.',
  'I was conceived at a music festival. My parents still argue about which band was playing.',
  'I was the result of a long-distance relationship and one very expensive plane ticket.',
  'I was conceived on a camping trip.',
  'I was conceived after my father’s vasectomy failed.',
  'I was conceived after a New Year’s Eve party got a little out of hand.',
]
const SINGLE_MOTHER_CONCEPTION = ['I was the product of a summer fling.', 'I was the result of a one-night stand.', 'I was conceived after a blind date that went a little too well.', 'I was a surprise to everyone, especially my mother.']

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
  return weightedPick(g, ['together', 'singleMother', 'singleFather', 'divorced', 'blended', 'adopted'] as FamilyType[], (t) =>
    ({ together: 78, singleMother: 9, singleFather: 2, divorced: 3, blended: 6, adopted: 2 })[t],
  )
}

interface ParentSpec {
  gender: Gender
  age: number
  lastName: string
  livesWithPlayer: boolean
  relation: RelationKind
  skinTone: number
}

function makeParent(g: GameState, spec: ParentSpec, rich: boolean, wealth: number): Person {
  const occupation = rich ? pick(g, RICH_OCCUPATIONS) : randomOccupation(g, spec.age)
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
  p.money = Math.round(base * Math.max(0.2, wealth))
  return p
}

/**
 * Build a complete, fresh GameState for a newborn: country, family, stats and the
 * birth entries in the life log.
 */
export function createNewLife(opts: NewLifeOptions = {}): GameState {
  const seed = Math.abs(Math.floor(opts.seed ?? freshSeed())) % 2 ** 31
  const year = opts.year ?? 2026
  const g: GameState = {
    version: GAME_VERSION,
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
  const lastName = opts.lastName?.trim() || randomLastName(g, country.id)
  const firstName = opts.firstName?.trim() || randomFirstName(g, country.id, gender)
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

  // --- Family -------------------------------------------------------------
  const family = rollFamilyType(g)
  const rich = chance(g, 0.05)
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
    const sameSex = chance(g, 0.2)
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
    if (family === 'singleMother') lines.push(pick(g, SINGLE_MOTHER_CONCEPTION))
    else if (chance(g, 0.75)) lines.push(pick(g, CONCEPTION))
    if (mother) lines.push(`My mother is ${describe(mother)}.`)
    else lines.push(pick(g, ["My mother isn't in the picture.", 'My mother left shortly after I was born.', "I don't know much about my mother."]))
    if (father) lines.push(`My father is ${describe(father)}.`)
    else lines.push(pick(g, ["I don't know who my father is.", 'My father skipped town before I was born.', 'My father is not in the picture.']))
    if ((family === 'divorced' || family === 'blended') && custodial) {
      lines.push(`My parents are divorced. I live with my ${custodial.gender === 'male' ? 'father' : 'mother'}.`)
    }
    if (step) lines.push(`My ${step.gender === 'male' ? 'stepfather' : 'stepmother'} is ${describe(step)}.`)
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
  const siblingCount = maxSiblingAge >= 1 ? weightedPick(g, [0, 1, 2, 3], (n) => [40, 32, 18, 10][n]) : 0
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
    const kind = weightedPick(g, PET_SPECIES, (s) => s.weight)
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
  for (const line of lines) log(g, line)
  remember(g, `Born in ${city}, ${country.name}${custodial ? `, raised by my ${custodial.gender === 'male' ? 'father' : 'mother'} ${custodial.firstName}` : ''}.`)

  // --- Hidden destiny -------------------------------------------------------------
  if (chance(g, 0.3)) {
    g.flags.latentTalent = weightedPick(g, TALENTS, (t) => t.weight).id
    g.flags.talentAge = randInt(g, 5, 12)
  }
  return g
}

// ---------------------------------------------------------------------------
// Generations: continue as a child

function isHeirloom(a: Asset): boolean {
  return a.details.heirloom === true || a.details.heirloom === 'true'
}

const SCHOOL_PLAN: { level: SchoolLevel; from: number; years: number; name: (city: string) => string }[] = [
  { level: 'elementary', from: 5, years: 6, name: (city) => `${city} Elementary School` },
  { level: 'middle', from: 11, years: 3, name: (city) => `${city} Middle School` },
  { level: 'high', from: 14, years: 4, name: (city) => `${city} High School` },
]

/** Put a minor in the school (and year) that fits their age. */
function schoolForAge(age: number, city: string, smarts: number): { current: Enrollment | null; completed: SchoolLevel[] } {
  const completed: SchoolLevel[] = []
  for (const s of SCHOOL_PLAN) {
    if (age >= s.from + s.years) {
      completed.push(s.level)
      continue
    }
    if (age >= s.from) {
      return {
        current: { level: s.level, school: s.name(city), year: age - s.from + 1, totalYears: s.years, grades: clampStat(smarts * 0.6 + 30), data: {} },
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

function adultEducation(age: number, city: string, occupation: string): Education {
  const edu = emptyEducation()
  edu.completed = ['elementary', 'middle', 'high']
  edu.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: `${city} High School`, age: Math.min(age, 18) })
  const plan = OCCUPATION_DEGREES[occupation]
  if (plan && age >= 22) {
    edu.completed.push('university')
    edu.degrees.push({ kind: 'bachelor', name: `Bachelor's in ${plan.major}`, major: plan.major, school: `University of ${city}`, age: 22 })
    if (plan.extra && age >= 25) {
      edu.completed.push('graduate')
      edu.degrees.push({ kind: plan.extra[0], name: plan.extra[1], major: plan.major, school: `${city} Graduate School`, age: Math.min(age, 26) } satisfies Degree)
    }
  }
  return edu
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
  const old = n.character
  const heirP = n.people.find((p) => p.id === childId) as Person
  const country = getCountry(old.countryId)
  const pf = Math.max(0.3, country.wealth)
  const oldName = fullName(old)
  const oldNoun = parentNoun(old.gender)
  const cause = old.causeOfDeath ?? 'Unknown Causes'
  const occupation = typeof n.flags.finalOccupation === 'string' ? n.flags.finalOccupation : roleLabel(n)

  // --- Ancestor record ---------------------------------------------------------
  const summary: AncestorSummary = {
    generation: n.generation,
    name: oldName,
    gender: old.gender,
    bornYear: n.year - old.age,
    diedYear: n.year,
    age: old.age,
    causeOfDeath: cause,
    netWorth: netWorth(n),
    occupation,
    ribbon: n.ribbon,
  }

  // --- Estate --------------------------------------------------------------------
  const heirlooms = n.assets.filter(isHeirloom)
  const property = n.assets.filter((a) => !isHeirloom(a))
  const debts = old.loans.reduce((s, l) => s + l.balance, 0)
  const equity = property.reduce((s, a) => s + a.value - (a.mortgage?.balance ?? 0), 0)
  const estate = Math.round(old.money + equity - debts)
  const livingKids = n.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild'))
  const willed = old.willBeneficiaries.map((id) => n.people.find((p) => p.id === id)).filter((p): p is Person => !!p && p.alive && ['child', 'stepchild', 'spouse'].includes(p.relation))
  const beneficiaries = willed.length > 0 ? willed : livingKids
  const heirIncluded = beneficiaries.some((p) => p.id === childId)
  const shareCount = Math.max(1, beneficiaries.length)
  const adult = heirP.age >= 18
  const keepProperty = heirIncluded && shareCount === 1 && adult && property.length > 0 && old.money - debts >= 0
  const inheritanceLines: string[] = []
  let cashInherited = 0
  let estateTax = 0
  let keptAssets: Asset[] = heirlooms
  if (keepProperty) {
    cashInherited = Math.round(old.money - debts)
    keptAssets = [...property, ...heirlooms]
  } else if (estate > 0) {
    estateTax = estate > 10_000_000 ? Math.round((estate - 10_000_000) * 0.25) : 0
    const share = Math.floor((estate - estateTax) / shareCount)
    if (heirIncluded) cashInherited = share
    for (const b of beneficiaries) if (b.id !== childId) b.money = Math.round(b.money + share)
  }

  // --- The heir becomes the player ---------------------------------------------
  const age = heirP.age
  const heirTone = typeof heirP.data.skinTone === 'number' ? heirP.data.skinTone : old.avatar.skinTone
  const sexualityData = heirP.data.sexuality
  const sexuality: Sexuality = sexualityData === 'straight' || sexualityData === 'gay' || sexualityData === 'bisexual' ? sexualityData : randomSexuality(n)
  const bd = heirP.data.birthday
  const birthday =
    bd && typeof bd === 'object' && !Array.isArray(bd) && typeof bd.month === 'number' && typeof bd.day === 'number' ? { month: bd.month, day: bd.day } : randomBirthday(n)
  const talentData = typeof heirP.data.talent === 'string' ? heirP.data.talent : null
  const npcOccupation = heirP.occupation
  const grief = randInt(n, 20, 40) * (heirP.relationship >= 50 ? 1 : 0.5)

  let education: Education
  const careerHistory: CareerRecord[] = []
  let retired = false
  let pension = 0
  if (age < 18) {
    const school = schoolForAge(age, old.city, heirP.stats.smarts)
    education = { ...emptyEducation(), completed: school.completed, current: school.current }
  } else {
    education = adultEducation(age, old.city, npcOccupation)
    if (npcOccupation === 'University Student' && age <= 22) {
      education.current = {
        level: 'university',
        school: `University of ${old.city}`,
        year: Math.max(1, Math.min(4, age - 17)),
        totalYears: 4,
        grades: clampStat(heirP.stats.smarts * 0.6 + 30),
        major: pick(n, MAJORS),
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

  const heir: Character = {
    id: heirP.id,
    firstName: heirP.firstName,
    lastName: heirP.lastName || old.lastName,
    gender: heirP.gender,
    sexuality,
    birthday,
    zodiac: zodiacFor(birthday.month, birthday.day),
    countryId: old.countryId,
    city: old.city,
    birthCountryId: old.countryId,
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
    id: uid(n, 'p'),
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
    data: { skinTone: old.avatar.skinTone, formerPlayer: true },
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
  // Grandchildren through the heir become the heir's children.
  for (const gc of n.people.filter((p) => p.relation === 'grandchild')) {
    const ids = [gc.data.parentId, gc.data.childOf, gc.otherParentId, ...strList(gc.data.parentIds)]
    if (!ids.includes(childId)) continue
    people.push(reset(gc, 'child', randInt(n, 60, 95), gc.alive && gc.age < 18))
  }
  for (const pet of n.people.filter((p) => p.alive && p.relation === 'pet')) {
    people.push(reset(pet, 'pet', randInt(n, 40, 80), true))
  }
  n.people = people

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
  n.assets = keptAssets
  n.log = [{ age, year: n.year, entries: [] }]
  n.queue = []
  n.counters = {}
  n.yearActions = {}
  n.ribbon = null
  n.obituary = null
  n.flags = {
    sexualityRealized: age >= 16,
    puberty: age >= 14,
    adultNotice: age >= 18,
    midlifeCrisis: age > 55,
    previousGeneration: oldName,
    ...(typeof n.flags.heirOccupation === 'string' ? { heirOccupation: n.flags.heirOccupation } : {}),
  }
  if (age < 12 && !heir.talent && chance(n, 0.3)) {
    n.flags.latentTalent = weightedPick(n, TALENTS, (t) => t.weight).id
    n.flags.talentAge = Math.max(age + 1, randInt(n, 5, 12))
  }
  n.flags.grandkidsSeen = n.people.filter((p) => p.relation === 'grandchild').map((p) => p.id)

  const childWord = heir.gender === 'male' ? (heirP.relation === 'stepchild' ? 'stepson' : 'son') : heirP.relation === 'stepchild' ? 'stepdaughter' : 'daughter'
  log(n, `I am now playing as ${fullName(heir)}, the ${childWord} of ${oldName}.`, 'event')
  log(n, `My ${heirP.relation === 'stepchild' ? `step${oldNoun}` : oldNoun}, ${oldName}, died from ${cause.toLowerCase()} at the age of ${old.age}.`, 'bad')

  if (!heirIncluded && willed.length > 0) {
    inheritanceLines.push(`${old.gender === 'male' ? 'His' : 'Her'} will left everything to someone else. You didn't get a cent.`)
    log(n, `I was cut out of my ${oldNoun}'s will.`, 'bad')
  } else if (keepProperty) {
    const houses = property.filter((a) => a.kind === 'house').length
    const cars = property.filter((a) => a.kind === 'car').length
    const bits = [houses > 0 ? `${houses} ${houses === 1 ? 'property' : 'properties'}` : '', cars > 0 ? `${cars} ${cars === 1 ? 'vehicle' : 'vehicles'}` : '', property.length - houses - cars > 0 ? 'other belongings' : ''].filter(Boolean)
    inheritanceLines.push(`You inherited ${formatMoney(cashInherited)} in cash${bits.length > 0 ? `, plus ${bits.join(' and ')}` : ''}.`)
    log(n, `I inherited ${formatMoney(cashInherited)} and my ${oldNoun}'s belongings.`, 'good')
  } else if (cashInherited > 0) {
    const split = shareCount > 1 ? ` The estate was split ${shareCount} ways.` : ''
    const auction = !adult && property.length > 0 ? ` Because you're a minor, the houses and cars were auctioned off.` : ''
    const tax = estateTax > 0 ? ` The government took ${formatMoney(estateTax)} in estate taxes.` : ''
    inheritanceLines.push(`You inherited ${formatMoney(cashInherited)}.${split}${auction}${tax}`)
    log(n, `I inherited ${formatMoney(cashInherited)} from my late ${oldNoun}.`, 'good')
    if (!adult && property.length > 0) log(n, `My ${oldNoun}'s houses and cars were auctioned off because I'm a minor.`)
  } else {
    inheritanceLines.push(estate <= 0 ? `${old.gender === 'male' ? 'He' : 'She'} died broke, so there was nothing to inherit.` : 'There was nothing left for you to inherit.')
    log(n, `My ${oldNoun} left me nothing but memories.`)
  }
  if (heirlooms.length > 0) {
    inheritanceLines.push(`You also inherited ${heirlooms.length === 1 ? 'a family heirloom' : `${heirlooms.length} family heirlooms`}: ${heirlooms.map((a) => a.name).join(', ')}.`)
    log(n, `I inherited the family heirloom${heirlooms.length === 1 ? '' : 's'}.`)
  }
  if (education.current) log(n, `I'm in my ${ordinal(education.current.year)} year at ${education.current.school}.`)
  else if (careerHistory.length > 0 && careerHistory[0].reason === 'quit') log(n, `After the funeral, I quit my job as ${/^[aeiou]/i.test(npcOccupation) ? 'an' : 'a'} ${npcOccupation} to make a fresh start.`)
  if (guardian && age < 18) log(n, `I live with my ${guardian.relation === 'grandparent' ? (guardian.gender === 'male' ? 'grandfather' : 'grandmother') : guardian.relation === 'stepparent' ? (guardian.gender === 'male' ? 'stepfather' : 'stepmother') : parentNoun(guardian.gender)}.`)

  heir.memories.push(`Age ${age}: My ${oldNoun} ${oldName} died from ${cause.toLowerCase()} at ${old.age}. I took over as generation ${n.generation} of the ${heir.lastName} family.`)
  notice(
    n,
    `Generation ${n.generation}`,
    `You are now playing as ${fullName(heir)}, the ${age}-year-old ${childWord} of the late ${oldName}. ${inheritanceLines.join(' ')}`,
    { emoji: '\u{1F9EC}' },
  )
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
  65: ["I'm officially a senior citizen. Bring on the discounts.", 'I turned 65. I now qualify for the early-bird special.'],
  70: ['I turned 70. I still feel 69.', "I'm seventy years young."],
  80: ['I turned 80 and blew out all the candles. Eventually.', "I'm 80. I've outlived most of my enemies."],
  90: ['I turned 90. The doctors are impressed.', "I'm ninety and still kicking. Gently."],
}

const HOBBIES = ['skydiving', 'the electric guitar', 'pottery', 'marathon running', 'salsa dancing', 'rock climbing', 'surfing', 'karate']

function talentMilestones(g: GameState): void {
  const c = g.character
  const latent = typeof g.flags.latentTalent === 'string' ? getTalent(g.flags.latentTalent) : undefined
  if (!latent || c.talent) return
  const talentAge = typeof g.flags.talentAge === 'number' ? g.flags.talentAge : 8
  if (c.age >= talentAge) {
    c.talent = latent.id
    latent.apply(g)
    notice(g, 'Special Talent', latent.discovery, { emoji: latent.emoji, tone: 'good' })
    log(g, `I discovered I have a special talent for ${latent.id.toLowerCase()}.`, 'good')
    remember(g, `Discovered a special talent for ${latent.id.toLowerCase()}.`)
    return
  }
  const hints = typeof g.flags.talentHints === 'number' ? g.flags.talentHints : 0
  if (c.age >= 2 && hints < 3 && chance(g, 0.4)) {
    log(g, pick(g, latent.hints))
    g.flags.talentHints = hints + 1
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
  for (const p of fam) {
    const strict = p.traits.includes('religious') || p.traits.includes('grumpy') || p.traits.includes('serious')
    const supportive = chance(g, strict ? 0.45 : 0.88)
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
  // One per life: skip if the event library or the AI already gave us one.
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
      'You just realized you are closer to retirement than to your high school prom. Panic is setting in. What will you do?',
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
      notice(g, 'Mid-Life Crisis', 'You wanted to jet off somewhere exotic, but your bank balance said "staycation." You bought some fancy sunglasses instead.', { emoji: '\u{1F576}\u{FE0F}' })
      log(g, 'I had a mid-life crisis on a budget.')
      return
    }
    spend(g, cost)
    addStat(g, 'happiness', randInt(g, 10, 16))
    notice(g, 'Mid-Life Crisis', `You blew ${formatMoney(cost)} on a spontaneous trip and came back with a tan, a tattoo and some regrets.`, { emoji: '\u{1F334}', tone: 'good' })
    log(g, `I spent ${formatMoney(cost)} on a wild mid-life crisis getaway.`)
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
    const hobby = pick(g, HOBBIES)
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
  for (const kid of fresh) {
    if (kid.age <= 1) {
      const word = c.gender === 'male' ? 'grandfather' : 'grandmother'
      log(g, seen.length === 0 && kid === fresh[0] ? `I became a ${word}! My ${kid.gender === 'male' ? 'grandson' : 'granddaughter'} ${kid.firstName} was born.` : `My ${kid.gender === 'male' ? 'grandson' : 'granddaughter'} ${kid.firstName} was born.`, 'good')
    }
  }
  if (seen.length === 0 && fresh.some((k) => k.age <= 1)) addStat(g, 'happiness', randInt(g, 5, 12))
  g.flags.grandkidsSeen = [...seen, ...fresh.map((p) => p.id)]
}

/** Yearly hook: age-based milestones not owned by other modules. Runs after the others. */
export function yearlyMilestones(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const entries = currentLogYear(g).entries

  if (c.age === 1 && entries.length === 0) log(g, pick(g, FIRST_STEPS))
  else if (c.age === 2 && entries.length === 0) log(g, pick(g, TODDLER))

  talentMilestones(g)

  if (!g.flags.puberty && c.age >= 12) {
    const p = c.age >= 14 ? 1 : c.age === 13 ? 0.6 : 0.35
    if (chance(g, p)) {
      g.flags.puberty = true
      const looks = randInt(g, -6, 8)
      addStat(g, 'looks', looks)
      addStat(g, 'happiness', -randInt(g, 0, 4))
      let text = pick(g, c.gender === 'male' ? PUBERTY_MALE : PUBERTY_FEMALE)
      if (chance(g, 0.35) && contractCondition(g, 'Acne', { quiet: true, diagnosed: true })) text += ' To top it off, your face has broken out in acne.'
      notice(g, 'Puberty', text, { emoji: '\u{1F331}' })
      log(g, 'I hit puberty.')
    }
  }

  sexualityMilestone(g)

  if (c.age === 18 && !g.flags.adultNotice) {
    g.flags.adultNotice = true
    const country = getCountry(c.countryId)
    const drink = country.drinkingAge <= 18 ? ' You can legally drink now, too.' : ''
    const text = inPrison(g)
      ? "Happy 18th birthday! You're officially an adult. Spending it behind bars isn't ideal, but the cake in the cafeteria was... edible."
      : `Happy 18th birthday! You're officially an adult. You can now get a full-time job, move out, sign contracts and make your own questionable decisions.${drink}`
    notice(g, "You're an Adult!", text, { emoji: '\u{1F382}', tone: 'good' })
    log(g, 'I became an adult.', 'event')
  }
  const drinkingAge = getCountry(c.countryId).drinkingAge
  if (c.age === drinkingAge && drinkingAge !== 18 && !inPrison(g)) log(g, "I'm finally old enough to drink legally.")

  const decade = DECADE_LINES[c.age]
  if (decade) log(g, pick(g, decade))

  if (c.age === 100) {
    addStat(g, 'happiness', randInt(g, 8, 15))
    notice(g, 'Centenarian', "Happy 100th birthday! You've lived a full century. The mayor sent you a card, and the local news wants an interview about your secret to a long life.", { emoji: '\u{1F389}', tone: 'good' })
    log(g, 'I turned 100 years old!', 'good')
    remember(g, 'Turned 100.')
  }

  midlifeCrisis(g)
  grandparenthood(g)
}
