// Fictional venue-licensing rules for gameplay, not a real-world legal reference.
import type { IndustryDef } from './industries'

const CASINO_CLOSED = new Set(['af', 'dz', 'bd', 'bn', 'cn', 'ir', 'iq', 'kw', 'ly', 'pk', 'qa', 'sa', 'sd', 'ae', 'ye', 'kp', 'id', 'th', 'jo', 'om', 'mv'])
const DRY = new Set(['sa', 'kw', 'ir', 'af', 'pk', 'bd', 'kp'])
const ADULT_LICENCES = new Set(['us', 'gb', 'de', 'fr', 'es', 'nl', 'be', 'at', 'ch', 'ca', 'au', 'nz', 'jp', 'br', 'mx', 'cz', 'pl', 'gr', 'pt'])

export function venueLegal(countryId: string, industry: string): boolean {
  if (industry === 'casino') return !CASINO_CLOSED.has(countryId)
  if (industry === 'nightclub') return !DRY.has(countryId)
  if (industry === 'stripClub') return ADULT_LICENCES.has(countryId)
  return true
}

export function isVenue(industry: string): boolean {
  return ['bar', 'casino', 'nightclub', 'stripClub'].includes(industry)
}

const roles: IndustryDef['roles'] = [
  { title: 'Venue Manager', focus: 'ops', pay: 70_000 },
  { title: 'Head of Security', focus: 'ops', pay: 65_000 },
  { title: 'Entertainment Director', focus: 'quality', pay: 75_000 },
  { title: 'Guest Relations Director', focus: 'sales', pay: 62_000 },
  { title: 'Controller', focus: 'finance', pay: 75_000 },
]

const common = {
  localShare: .7, tradable: 0, elasticity: 1.2, incomeSens: .8,
  capitalLocal: .6, staffScale: .7, maint: .08, capMult: 1.6,
  multiple: 6, growth: .6, perMillion: 12, taxShare: 1, perishable: 1,
  roles, marketingShare: .04,
}

export const VENUE_INDUSTRIES: Record<'casino' | 'nightclub' | 'stripClub', IndustryDef> = {
  casino: {
    ...common, id: 'casino', label: 'Casino', emoji: '🎰', unit: 'guest visits', unitOne: 'guest visit',
    site: 'casino', sitePlural: 'casinos', blurb: 'Run the floor, hospitality, security and a licensed entertainment business.',
    price: 125, unitCost: 65, demand: 55_000, capital: 8_000_000, staff: 35, wage: 45_000, rent: 550_000,
    needs: undefined, perMillion: 2, products: ['Tournament Weekends', 'Hotel Partnership', 'Live Shows', 'Responsible Play Desk', 'Premium Dining', 'Poker Room', 'Slot Club Rewards', 'Headline Boxing Nights'], suffixes: ['Casino', 'Resort', 'Grand', 'Palace'],
  },
  nightclub: {
    ...common, id: 'nightclub', label: 'Nightclub', emoji: '🪩', unit: 'night out visits', unitOne: 'night out visit',
    site: 'club', sitePlural: 'clubs', blurb: 'Book talent, protect the dance floor and build a scene people return to.',
    price: 55, unitCost: 18, demand: 32_000, capital: 750_000, staff: 12, wage: 36_000, rent: 165_000,
    needs: 'drinking', products: ['Resident DJ', 'Live Band Nights', 'Members Lounge', 'Dance Showcase', 'Guest Artist Series', 'Theme Nights', 'Bottle Service', 'Afterparty Sessions'], suffixes: ['Club', 'Nights', 'Room', 'Lounge'],
  },
  stripClub: {
    ...common, id: 'stripClub', label: 'Adult Entertainment Club', emoji: '🌙', unit: 'adult guest visits', unitOne: 'adult guest visit',
    site: 'club', sitePlural: 'clubs', blurb: 'A licensed adults-only venue. Consent, performer welfare and security come first.',
    price: 90, unitCost: 35, demand: 22_000, capital: 1_200_000, staff: 14, wage: 42_000, rent: 190_000,
    products: ['Stage Production', 'Private Events', 'Premium Dining', 'Cabaret Nights', 'Performer Wellness Program', 'Bachelor Party Packages', 'Champagne Room', 'Comedy Burlesque Nights'], suffixes: ['Cabaret', 'Club', 'Velvet', 'Lounge'],
  },
}
