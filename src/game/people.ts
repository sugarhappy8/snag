// Generating NPCs. Every module that adds someone to the player's life uses createPerson.
import { clamp } from './core'
import { eraOccupation, oldTradeShare, OLD_TRADES } from './history/events-people'
import { isHistorical } from './history/timeline'
import { bell, chance, pick, rand, randInt, uid } from './rng'
import { getCountry, randomFirstName, randomLastName } from './world'
import type { GameState, Gender, Json, Person, RelationKind, StatKey } from './types'

export const TRAITS = [
  'kind',
  'generous',
  'stingy',
  'hot-headed',
  'calm',
  'funny',
  'serious',
  'ambitious',
  'lazy',
  'jealous',
  'loyal',
  'manipulative',
  'shy',
  'outgoing',
  'nerdy',
  'sporty',
  'artistic',
  'religious',
  'rebellious',
  'anxious',
  'optimistic',
  'grumpy',
  'romantic',
  'flirty',
  'honest',
  'sneaky',
  'dramatic',
  'caring',
  'arrogant',
  'gullible',
]

const ADULT_OCCUPATIONS = [
  'Accountant',
  'Teacher',
  'Nurse',
  'Software Developer',
  'Plumber',
  'Electrician',
  'Cashier',
  'Retail Manager',
  'Truck Driver',
  'Chef',
  'Waiter',
  'Mechanic',
  'Police Officer',
  'Firefighter',
  'Doctor',
  'Lawyer',
  'Dentist',
  'Engineer',
  'Pharmacist',
  'Architect',
  'Real Estate Agent',
  'Bank Teller',
  'Construction Worker',
  'Hairdresser',
  'Janitor',
  'Barista',
  'Graphic Designer',
  'Journalist',
  'Librarian',
  'Pilot',
  'Social Worker',
  'Veterinarian',
  'Marketing Manager',
  'Receptionist',
  'Farmer',
  'Professor',
  'Personal Trainer',
  'Security Guard',
  'Bus Driver',
  'Unemployed',
]

/**
 * Everyday work where most people earn a living in markets, workshops, fields and on the road
 * rather than in offices (lower-income countries): the neighbors are tailors and moto-taxi
 * drivers, not baristas and marketing managers.
 */
const LOCAL_TRADES = [
  'Farmer',
  'Market Vendor',
  'Street Food Vendor',
  'Tailor',
  'Shopkeeper',
  'Factory Worker',
  'Motorcycle Taxi Driver',
  'Civil Servant',
  'Fisherman',
  'Mechanic',
  'Construction Worker',
  'Teacher',
]

/** Share of 18-22-year-olds at university, by year (only far fewer went in the past). */
function universityShare(year: number): number {
  if (!isHistorical(year)) return 0.5
  if (year < 1930) return 0.06
  if (year < 1960) return 0.15
  if (year < 1980) return 0.3
  if (year < 2000) return 0.4
  return 0.5
}

/**
 * A plausible occupation label for an NPC of this age in a country (default: where the player
 * lives), named as it was in the game year: a 1930 neighbor is a Switchboard Operator or a Coal
 * Miner, not a Barista (history/events-people.ts; modern years are unchanged).
 */
export function randomOccupation(g: GameState, age: number, countryId: string = g.character.countryId): string {
  if (age < 5) return 'None'
  if (age < 18) return 'Student'
  if (age < 23 && chance(g, universityShare(g.year))) return 'University Student'
  if (age >= 67) return 'Retired'
  const wealth = getCountry(countryId).wealth
  if (wealth < 0.45 && chance(g, 0.6 - wealth)) return eraOccupation(pick(g, LOCAL_TRADES), g.year)
  if (isHistorical(g.year) && chance(g, oldTradeShare(g.year))) return pick(g, OLD_TRADES)
  return eraOccupation(pick(g, ADULT_OCCUPATIONS), g.year)
}

/** Rough wealth for an NPC with this occupation and age. */
export function randomWealth(g: GameState, age: number, occupation: string): number {
  if (age < 16) return randInt(g, 0, 200)
  const high = ['Doctor', 'Lawyer', 'Dentist', 'Pilot', 'Architect', 'Engineer', 'Pharmacist', 'Software Developer', 'Professor']
  const base = high.includes(occupation) ? 60000 : occupation === 'Unemployed' ? 2000 : 15000
  const years = Math.max(0, age - 22)
  return Math.round(base * (0.5 + rand(g)) + years * randInt(g, 500, high.includes(occupation) ? 9000 : 3000))
}

export interface PersonOptions {
  relation: RelationKind
  age: number
  gender?: Gender
  firstName?: string
  lastName?: string
  /** Defaults to the player's current country. */
  countryId?: string
  occupation?: string
  relationship?: number
  money?: number
  traits?: string[]
  stats?: Partial<Record<StatKey, number>>
  species?: string
  breed?: string
  contextId?: string
  livesWithPlayer?: boolean
  otherParentId?: string
  biological?: boolean
  skinTone?: number
  data?: Record<string, Json>
}

/** Create a person and add them to g.people. */
export function createPerson(g: GameState, opts: PersonOptions): Person {
  const gender: Gender = opts.gender ?? (chance(g, 0.5) ? 'male' : 'female')
  const countryId = opts.countryId ?? g.character.countryId
  const occupation = opts.occupation ?? (opts.relation === 'pet' ? 'Pet' : randomOccupation(g, opts.age, countryId))
  const traitCount = opts.relation === 'pet' ? 1 : 2
  const traits = opts.traits ?? pickDistinct(g, TRAITS, traitCount)
  const stat = (key: StatKey, lo: number, hi: number) => clamp(Math.round(opts.stats?.[key] ?? bell(g, lo, hi)))
  const person: Person = {
    id: uid(g, 'p'),
    firstName: opts.firstName ?? randomFirstName(g, countryId, gender),
    lastName: opts.relation === 'pet' ? '' : (opts.lastName ?? randomLastName(g, countryId)),
    gender,
    age: Math.max(0, Math.round(opts.age)),
    alive: true,
    relation: opts.relation,
    relationship: clamp(Math.round(opts.relationship ?? randInt(g, 40, 80))),
    stats: {
      happiness: stat('happiness', 30, 100),
      health: stat('health', opts.age > 70 ? 20 : 50, 100),
      smarts: stat('smarts', 10, 100),
      looks: stat('looks', 10, 100),
    },
    money: Math.round(opts.money ?? randomWealth(g, opts.age, occupation)),
    occupation,
    traits,
    species: opts.species,
    breed: opts.breed,
    otherParentId: opts.otherParentId,
    biological: opts.biological,
    contextId: opts.contextId,
    yearsKnown: 0,
    livesWithPlayer: opts.livesWithPlayer ?? false,
    notes: [],
    data: { ...(opts.data ?? {}), ...(opts.skinTone !== undefined ? { skinTone: opts.skinTone } : {}) },
  }
  // A randomly rolled name must not clash with the player or someone already in their life
  // (two "Carmen Medina" classmates, a sibling named exactly like you).
  if (opts.relation !== 'pet' && (opts.firstName === undefined || opts.lastName === undefined)) {
    for (let i = 0; i < 5 && nameTaken(g, person); i++) {
      if (opts.firstName === undefined) person.firstName = randomFirstName(g, countryId, gender)
      else person.lastName = randomLastName(g, countryId)
    }
  }
  g.people.push(person)
  return person
}

function nameTaken(g: GameState, person: Person): boolean {
  const same = (x: { firstName: string; lastName: string }) => x.firstName === person.firstName && x.lastName === person.lastName
  return same(g.character) || g.people.some((p) => p.alive && p.relation !== 'pet' && same(p))
}

export function pickDistinct<T>(g: GameState, items: readonly T[], n: number): T[] {
  const pool = [...items]
  const out: T[] = []
  while (out.length < n && pool.length > 0) {
    const i = randInt(g, 0, pool.length - 1)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

/** Add a short shared-history note to a person (AI memory), keeping the list short. */
export function notePerson(p: Person, text: string): void {
  p.notes.push(text)
  if (p.notes.length > 12) p.notes.splice(0, p.notes.length - 12)
}
