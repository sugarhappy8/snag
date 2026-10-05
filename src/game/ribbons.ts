// Ribbons: the decoration on a character's gravestone, awarded from how they lived.
// The list mirrors the real game's 40 ribbons (36 regular + 4 secret), with branded
// names swapped for originals. computeRibbon() is called by killCharacter().
import { counter, netWorth } from './core'
import type { GameState, Person } from './types'

export interface RibbonDef {
  id: string
  name: string
  emoji: string
  description: string
  /** Secret ribbons show as "???" in the collection until earned. */
  secret?: boolean
}

export const RIBBONS: RibbonDef[] = [
  { id: 'academic', name: 'Academic', emoji: '\u{1F9E0}', description: 'Complete a postgraduate education' },
  { id: 'addict', name: 'Addict', emoji: '\u{1F48A}', description: 'Die with addictions' },
  { id: 'dollface', name: 'Dollface', emoji: '\u{1FA86}', description: 'Go under many knives' },
  { id: 'catLady', name: 'Cat Lady', emoji: '\u{1F431}', description: 'Be a spinster, surrounded by felines' },
  { id: 'cunning', name: 'Cunning', emoji: '\u{1F3AD}', description: 'Practice extreme Machiavellianism' },
  { id: 'deadly', name: 'Deadly', emoji: '\u{1F52A}', description: 'Be responsible for the deaths of others' },
  { id: 'familyMan', name: 'Family Man', emoji: '\u{1F468}\u{200D}\u{1F467}\u{200D}\u{1F466}', description: 'Be an honest, loving father' },
  { id: 'famous', name: 'Famous', emoji: '\u{1F4F8}', description: 'Achieve fame in life' },
  { id: 'fertile', name: 'Fertile', emoji: '\u{1F37C}', description: 'Spawn a lot of offspring' },
  { id: 'generous', name: 'Generous', emoji: '\u{1F381}', description: 'Gift well and often' },
  { id: 'geriatric', name: 'Geriatric', emoji: '\u{267E}\u{FE0F}', description: 'Live for a very long time' },
  { id: 'globetrotter', name: 'Globetrotter', emoji: '\u{1F30D}', description: 'Travel or emigrate to many countries' },
  { id: 'goldDigger', name: 'Gold Digger', emoji: '\u{26CF}\u{FE0F}', description: 'Get rich by marrying rich' },
  { id: 'hero', name: 'Hero', emoji: '\u{1F9B8}', description: 'Save a life or die nobly' },
  { id: 'houdini', name: 'Houdini', emoji: '\u{1F513}', description: 'Escape from prison many times' },
  { id: 'highroller', name: 'Highroller', emoji: '\u{1F3B2}', description: 'Earn a lot of money gambling' },
  { id: 'influencer', name: 'Influencer', emoji: '\u{2705}', description: 'Enjoy the life of a social media star' },
  { id: 'jailbird', name: 'Jailbird', emoji: '\u{1F693}', description: 'Experience several stints in prison' },
  { id: 'lazy', name: 'Lazy', emoji: '\u{1F634}', description: 'Live an idle life' },
  { id: 'loaded', name: 'Loaded', emoji: '\u{1F911}', description: 'Die insanely wealthy' },
  { id: 'lustful', name: 'Lustful', emoji: '\u{1F60D}', description: 'Be extremely promiscuous' },
  { id: 'mediocre', name: 'Mediocre', emoji: '\u{1F610}', description: 'Be completely ordinary' },
  { id: 'flipper', name: 'Flipper', emoji: '\u{1F3E0}', description: 'Buy houses and sell houses' },
  { id: 'mooch', name: 'Mooch', emoji: '\u{1F932}', description: 'Ask of others and never give back' },
  { id: 'movieBuff', name: 'Movie Buff', emoji: '\u{1F3AC}', description: 'Dedicate yourself to the theater' },
  { id: 'rich', name: 'Rich', emoji: '\u{1F4B8}', description: 'Die with a high net worth' },
  { id: 'rowdy', name: 'Rowdy', emoji: '\u{1F479}', description: 'Live a life of debauchery' },
  { id: 'scandalous', name: 'Scandalous', emoji: '\u{1F608}', description: 'Spend a lot of time in prison' },
  { id: 'stupid', name: 'Stupid', emoji: '\u{1F92A}', description: 'Live a dumb, idle life' },
  { id: 'successful', name: 'Successful', emoji: '\u{1F44D}', description: 'Live a balanced, honest life' },
  { id: 'wildOne', name: 'Wild One', emoji: '\u{1F42F}', description: 'Bond with exotic animals' },
  { id: 'thief', name: 'Thief', emoji: '\u{1F99D}', description: 'Steal from others, frequently' },
  { id: 'unlucky', name: 'Unlucky', emoji: '\u{1F329}\u{FE0F}', description: 'Die young and unfortunately' },
  { id: 'veteran', name: 'Veteran', emoji: '\u{1F396}\u{FE0F}', description: 'Serve a distinguished career in the military' },
  { id: 'wasteful', name: 'Wasteful', emoji: '\u{1F6AE}', description: 'Fall short of your potential' },
  { id: 'wicked', name: 'Wicked', emoji: '\u{1F47F}', description: 'Be very cruel to others' },
  // Secret ribbons
  { id: 'modelCitizen', name: 'Model Citizen', emoji: '\u{1F64C}', description: 'Live an amazing life', secret: true },
  { id: 'teammate', name: 'Teammate', emoji: '\u{1F335}', description: 'Become an app developer', secret: true },
  { id: 'bandit', name: 'Bandit', emoji: '\u{1F682}', description: 'Live like an outlaw of old', secret: true },
  { id: 'bigBoss', name: 'Big Boss', emoji: '\u{1F4BC}', description: 'Finish your business career on top', secret: true },
]

const BY_ID = new Map(RIBBONS.map((r) => [r.id, r]))

export function getRibbon(id: string): RibbonDef | undefined {
  return BY_ID.get(id)
}

// ---------------------------------------------------------------------------
// Scoring helpers

/** Sum of several counter keys (modules may use slightly different names for one idea). */
function sum(g: GameState, ...keys: string[]): number {
  return keys.reduce((total, k) => total + counter(g, k), 0)
}

function flag(g: GameState, key: string): boolean {
  const v = g.flags[key]
  return v === true || (typeof v === 'number' && v > 0)
}

const GRAD_DEGREES = new Set(['master', 'doctorate', 'jd', 'md', 'mba', 'dds', 'pharmd', 'dvm'])
const MILITARY_TITLE =
  /\b(private|corporal|sergeant|lieutenant|colonel|general|admiral|ensign|commander|airman|seaman|marine|soldier|infantry|commodore|brigadier)\b/i
const TOP_MILITARY_TITLE = /\b(general|admiral|sergeant major|commander|marshal|colonel)\b/i
const CEO_TITLE = /\b(ceo|chief executive|president of|chairman|chairwoman)\b/i
const APP_TITLE = /\b(app developer|app tester|software|programmer|game developer|web developer)\b/i
const EXOTIC = new Set(['Tiger', 'Lion', 'Monkey', 'Snake', 'Fox', 'Lizard', 'Parrot', 'Turtle', 'Ferret', 'Pig', 'Goat', 'Bear', 'Wolf', 'Crocodile', 'Alligator', 'Elephant', 'Giraffe', 'Penguin', 'Kangaroo', 'Zebra', 'Leopard', 'Cheetah', 'Panther', 'Gorilla', 'Shark', 'Octopus', 'Komodo Dragon'])

function pets(g: GameState): Person[] {
  return g.people.filter((p) => p.relation === 'pet')
}

function addictionCount(g: GameState): number {
  return g.character.conditions.filter((c) => c.kind === 'addiction').length
}

function yearsWithTitle(g: GameState, re: RegExp): number {
  return g.character.careerHistory.filter((r) => re.test(r.title)).reduce((total, r) => total + Math.max(0, r.endAge - r.startAge), 0)
}

function cause(g: GameState): string {
  return (g.character.causeOfDeath ?? '').toLowerCase()
}

/** Deaths that are bad luck rather than choices (for Unlucky). */
function unluckyCause(g: GameState): boolean {
  const c = cause(g)
  if (!c) return false
  if (/suicide|surrender|execution|executed|overdose|alcohol poisoning|witch doctor|murder|assault|plastic surgery|hitman|mafia|\bmob\b|rival family|bar fight|shot by police/.test(c)) return false
  return true
}

/**
 * Pick the most fitting ribbon for a finished life. Rare, specific achievements win
 * over general ones; Mediocre is the fallback for an ordinary life.
 */
export function computeRibbon(g: GameState): string | null {
  const c = g.character
  const age = c.age
  const worth = netWorth(g)
  const death = cause(g)
  const female = c.gender === 'female'
  const male = c.gender === 'male'

  const murders = counter(g, 'murders')
  const escapes = counter(g, 'escapes')
  const convictions = counter(g, 'convictions')
  const prisonYears = counter(g, 'prisonYears')
  const arrests = counter(g, 'arrests')
  const crimes = counter(g, 'crimes')
  const everJailed = prisonYears > 0 || convictions > 0 || c.prison !== null
  const hadJob = counter(g, 'jobs') > 0 || c.careerHistory.length > 0 || c.job !== null
  const childrenPeople = g.people.filter((p) => p.relation === 'child' || p.relation === 'stepchild')
  const childCount = Math.max(childrenPeople.length, counter(g, 'children') + counter(g, 'adoptions'))
  const grandchildCount = g.people.filter((p) => p.relation === 'grandchild').length
  const allPets = pets(g)
  const cats = Math.max(counter(g, 'cats'), allPets.filter((p) => p.species === 'Cat').length)
  const otherPets = allPets.filter((p) => p.species !== 'Cat').length
  const exoticPets = Math.max(counter(g, 'exoticPets'), allPets.filter((p) => p.species !== undefined && EXOTIC.has(p.species)).length)
  const gradDegree = c.education.degrees.some((d) => GRAD_DEGREES.has(d.kind))
  const militaryYears = yearsWithTitle(g, MILITARY_TITLE)
  // Burglaries and car thefts count double, like the real game.
  const theftCounters =
    counter(g, 'thefts') +
    2 * sum(g, 'burglaries', 'carsStolen') +
    sum(g, 'pickpockets', 'shoplifts', 'porchPirate', 'bankRobberies')
  const theftRecord = c.criminalRecord.reduce((total, r) => {
    if (/burgl|car theft|steal.*car|grand theft/i.test(r.crime)) return total + 2
    if (/pickpocket|shoplift|porch pirat|theft|robbery|steal/i.test(r.crime)) return total + 1
    return total
  }, 0)
  const thefts = Math.max(theftCounters, theftRecord)

  // 1. Choices that define a life no matter what else happened.
  if (/suicide|surrender/.test(death) || flag(g, 'surrendered')) return 'wasteful'
  if (flag(g, 'heroicDeath') || flag(g, 'hero') || sum(g, 'rescues', 'rescueAttempts', 'heroics', 'livesSaved') > 0) return 'hero'

  // 2. Secret ribbons.
  if (sum(g, 'trainRobberies') > 0 && worth < 50_000_000) return 'bandit'
  if (
    ['Tucson', 'Miami'].includes(c.city) &&
    yearsWithTitle(g, APP_TITLE) >= 10
  ) {
    return 'teammate'
  }
  // Finish a business career on top: ran a company (or built one and took it public / sold it) and died rich.
  const builtCompany = counter(g, 'businessIpos') > 0 || counter(g, 'businessesSold') > 0
  if ((yearsWithTitle(g, CEO_TITLE) > 0 || builtCompany) && worth >= 20_000_000) return 'bigBoss'
  if (
    c.hidden.karma >= 85 &&
    worth >= 50_000 &&
    counter(g, 'compliments') >= 10 &&
    sum(g, 'gaveMoney', 'gifts') >= 10 &&
    crimes === 0 &&
    arrests === 0 &&
    !everJailed &&
    sum(g, 'insults', 'fights', 'cheated', 'askedForMoney', 'abandoned', 'stdsSpread', 'murders') === 0
  ) {
    return 'modelCitizen'
  }

  // 3. Crime and prison.
  if (murders >= 5) return 'deadly'
  if (escapes >= 10) return 'houdini'

  // 4. Extraordinary lives.
  if (age >= 120) return 'geriatric'
  if (worth >= 20_000_000) return 'loaded'
  if (militaryYears >= 20 || (Math.max(counter(g, 'minefieldsCleared'), counter(g, 'deployments')) >= 3 && yearsWithTitle(g, TOP_MILITARY_TITLE) > 0)) return 'veteran'
  if (c.social && c.social.verified && c.social.followers >= 1_000_000) return 'influencer'
  if (c.hidden.fame >= 50) return 'famous'
  if (!hadJob && counter(g, 'marriages') >= 1 && worth >= 1_500_000) return 'goldDigger'
  const gamblingProfit = sum(g, 'gamblingProfit', 'casinoWinnings')
  if (gamblingProfit >= 1_000_000 || (counter(g, 'moneyGambled') >= 1_000_000 && counter(g, 'casinoWins') > counter(g, 'casinoLosses'))) {
    return 'highroller'
  }

  // 5. Vices.
  if (addictionCount(g) >= 2) return 'addict'
  if (/overdose/.test(death)) return 'stupid'
  if (thefts >= 10) return 'thief'
  if (prisonYears >= 5) return 'scandalous'
  if (convictions >= 2 || counter(g, 'imprisonments') >= 2 || (escapes >= 2 && convictions >= 1) || counter(g, 'riots') >= 3) return 'jailbird'
  if ((escapes >= 1 && !c.prison) || (murders >= 1 && convictions === 0)) return 'cunning'
  if (sum(g, 'stdsSpread', 'abandoned') >= 5 || counter(g, 'cheated') >= 5 || counter(g, 'stds') >= 5) return 'wicked'
  if (counter(g, 'hookups') + counter(g, 'partners') >= 20) return 'lustful'

  // 6. Family, hobbies and lifestyle.
  if (childCount * 2 + grandchildCount >= 15) return 'fertile'
  if (
    male &&
    counter(g, 'marriages') === 1 &&
    counter(g, 'divorces') === 0 &&
    childCount >= 2 &&
    !everJailed &&
    counter(g, 'cheated') === 0 &&
    c.hidden.karma >= 60 &&
    childrenPeople.length > 0 &&
    childrenPeople.reduce((s, p) => s + p.relationship, 0) / childrenPeople.length >= 75
  ) {
    return 'familyMan'
  }
  if (female && cats >= 20 && otherPets < 5) return 'catLady'
  if (male && exoticPets >= 20) return 'wildOne'
  if (female && counter(g, 'surgeries') >= 6 && counter(g, 'botchedSurgeries') === 0) return 'dollface'
  if (counter(g, 'housesSold') >= 10 || counter(g, 'realEstateProfit') >= 2_000_000) return 'flipper'
  if (sum(g, 'movies', 'moviesWatched') >= 20) return 'movieBuff'
  if (counter(g, 'vacations') + counter(g, 'emigrations') >= 20) return 'globetrotter'
  if (counter(g, 'nightlife') >= 10) return 'rowdy'
  if (sum(g, 'gifts', 'giftsGiven', 'donated') >= 30) return 'generous'
  if (counter(g, 'askedForMoney') >= 10 && counter(g, 'gaveMoney') === 0) return 'mooch'

  // 7. Education and money.
  if (gradDegree) return 'academic'
  if (worth >= 2_500_000) return 'rich'

  // 8. How it ended.
  if (age < 30 && unluckyCause(g)) return 'unlucky'
  if (/lightning/.test(death)) return 'unlucky'
  if (worth >= 250_000 && age >= 65 && !everJailed && addictionCount(g) === 0 && c.hidden.karma >= 50 && hadJob) return 'successful'
  if (age >= 50 && !hadJob && c.stats.smarts > 10) return 'lazy'
  if (c.stats.smarts <= 10 && !c.conditions.some((x) => /dementia|alzheimer/i.test(x.name))) return 'stupid'
  if (worth < 0 && (c.stats.smarts + c.stats.looks) / 2 > 50) return 'wasteful'
  if (/execut/.test(death) && age < 40) return 'wasteful'
  return 'mediocre'
}
