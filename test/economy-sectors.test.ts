// Which sector of the economy each trade belongs to (economy/model sectorOf): the cycle, credit
// and input rules a company lives under. The names are matched by pattern, so a new trade whose id
// holds a word of another sector (neurotech holds 'tech') has to be checked by hand.
import { describe, expect, it } from 'vitest'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { SECTOR_RULES, sectorOf, type Sector } from '../src/game/economy/model'

/** Every trade's sector as v2.8.0 shipped it (the four newer trades are as intended). */
const SECTORS: Record<(typeof INDUSTRY_IDS)[number], Sector> = {
  foodTruck: 'essentials',
  restaurant: 'essentials',
  cafe: 'essentials',
  bakery: 'essentials',
  bar: 'leisure',
  brewery: 'leisure',
  grocery: 'essentials',
  fashion: 'consumer',
  beauty: 'consumer',
  salon: 'consumer',
  gym: 'consumer',
  autoShop: 'industry',
  construction: 'housing',
  realEstate: 'housing',
  software: 'technology',
  gameStudio: 'technology',
  ecommerce: 'consumer',
  marketing: 'consumer',
  clinic: 'care',
  hotel: 'leisure',
  logistics: 'logistics',
  manufacturing: 'industry',
  farm: 'essentials',
  energy: 'energy',
  entertainment: 'leisure',
  investmentFirm: 'finance',
  bank: 'finance',
  onlineBank: 'finance',
  casino: 'leisure',
  nightclub: 'leisure',
  stripClub: 'leisure',
  solar: 'energy',
  battery: 'energy',
  water: 'energy',
  recycling: 'energy',
  telecom: 'technology',
  dataCenter: 'technology',
  education: 'public',
  petCare: 'consumer',
  homeCare: 'care',
  packaging: 'industry',
  furniture: 'industry',
  travel: 'logistics',
  semiconductor: 'technology',
  aiLab: 'technology',
  robotics: 'industry',
  // Its id holds 'tech', which the technology rule matches first. It always has been technology.
  biotech: 'technology',
  spaceTech: 'industry',
  electricVehicles: 'industry',
  quantum: 'technology',
  cybersecurity: 'technology',
  fusion: 'energy',
  // The newer trade that is meant to follow the health cycle: slow and steady, not the tech cycle.
  neurotech: 'care',
  drones: 'technology',
  carbonCapture: 'energy',
}

describe('economy sectors of the trades', () => {
  it('covers every trade in INDUSTRY_IDS, and nothing else', () => {
    expect(Object.keys(SECTORS).sort()).toEqual([...INDUSTRY_IDS].sort())
  })

  it('puts every trade in the sector it had, and the four newer trades where they are meant to be', () => {
    const wrong = INDUSTRY_IDS.filter((id) => sectorOf(id) !== SECTORS[id]).map((id) => `${id}: ${sectorOf(id)}, expected ${SECTORS[id]}`)
    expect(wrong).toEqual([])
  })

  it('runs neurotech on the health cycle, not the technology cycle', () => {
    expect(SECTOR_RULES[sectorOf('neurotech')].label).toBe('Health & care')
    expect(SECTOR_RULES[sectorOf('neurotech')].cycle).toBeLessThan(SECTOR_RULES[sectorOf('software')].cycle)
    expect(SECTOR_RULES[sectorOf('biotech')].label).toBe('Technology')
  })
})
