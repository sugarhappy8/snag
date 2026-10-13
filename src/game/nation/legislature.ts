// Votes: seats per party, the governing coalition, honest pass odds, vetoes and the courts.
// Seats are seeded from stable hashes of the family and country (no game RNG); the odds below are
// exactly what the vote resolver rolls, so the probability on a button is the real one.
import { economicRoll } from '../economy/model'
import type { GameState } from '../types'
import { institutionStrength, PARTY_IDS, PARTY_STANCE, type Lean } from './data'
import { leaderTitle, parliamentary, type OfficeView, type Power } from './office'
import { policyOf, type CountryPolicy, type Legislature } from './state'

const BASE_SEATS: Record<string, number> = { progressive: .28, conservative: .3, centrist: .16, green: .08, libertarian: .07, independent: .11 }

function family(g: GameState): string {
  return g.lifeId.replace(/-g\d+$/, '')
}

/** Seats after an election: stable for a family, country and election year. */
export function seedSeats(g: GameState, country: string, year: number): Record<string, number> {
  const raw: Record<string, number> = {}
  let total = 0
  for (const id of PARTY_IDS) {
    let base = BASE_SEATS[id] ?? .05
    if (id === 'green' && year < 1980) base = .01
    if (id === 'libertarian' && year < 1970) base = .02
    const v = base * (.6 + .8 * economicRoll(`${family(g)}|seats|${country}|${year}|${id}`))
    raw[id] = v
    total += v
  }
  return Object.fromEntries(PARTY_IDS.map(id => [id, Math.round(raw[id] / total * 10_000) / 10_000]))
}

/** The governing coalition: the leader's party, plus the closest partners until it has a majority. */
export function coalition(seats: Record<string, number>, first: string, parliamentaryRule: boolean): string[] {
  if (!parliamentaryRule) return [first]
  const out = [first]
  let total = seats[first] ?? 0
  const near = PARTY_IDS.filter(id => id !== first && (seats[id] ?? 0) > .02)
    .sort((a, b) => Math.abs(PARTY_STANCE[a].econ - PARTY_STANCE[first].econ) - Math.abs(PARTY_STANCE[b].econ - PARTY_STANCE[first].econ) || (seats[b] ?? 0) - (seats[a] ?? 0))
  for (const id of near) {
    if (total > .5 || out.length >= 4) break
    out.push(id); total += seats[id] ?? 0
  }
  return out
}

function largest(seats: Record<string, number>): string {
  return PARTY_IDS.reduce((best, id) => ((seats[id] ?? 0) > (seats[best] ?? 0) ? id : best), PARTY_IDS[0])
}

/** The legislature as it stands (pure: an unseeded country gets its stable default). */
export function legislatureOf(g: GameState, country: string, p: CountryPolicy = policyOf(g, country)): Legislature {
  if (Object.keys(p.legislature.seats).length) return p.legislature
  const year = Math.floor(g.year / 4) * 4
  const seats = seedSeats(g, country, year)
  const pm = parliamentary({ ...g, character: { ...g.character, countryId: country } })
  const leaderParty = pm ? largest(seats) : economicRoll(`${family(g)}|president|${country}|${year}`) < .5 ? 'progressive' : 'conservative'
  return { seats, gov: coalition(seats, leaderParty, pm), year, leaderParty }
}

/** Write a fresh legislature after the player wins the top job: their party leads, seats follow the vote. */
export function electedLegislature(g: GameState, p: CountryPolicy, party: string, voteShare: number, gerrymander = 0): Legislature {
  const seats = { ...seedSeats(g, p.country, g.year) }
  const target = Math.max(.15, Math.min(.65, .22 + (voteShare - 50) / 100 * 1.4 + gerrymander))
  const others = PARTY_IDS.filter(id => id !== party).reduce((s, id) => s + (seats[id] ?? 0), 0)
  for (const id of PARTY_IDS) seats[id] = id === party ? target : others > 0 ? (seats[id] ?? 0) / others * (1 - target) : (1 - target) / (PARTY_IDS.length - 1)
  const pm = parliamentary(g)
  return { seats, gov: coalition(seats, party, pm), year: g.year, leaderParty: party }
}

/** Midterm swing against the governing parties (presidential systems, two years into a term). */
export function midterm(leg: Legislature, swing: number): Legislature {
  const seats = { ...leg.seats }
  const gov = new Set(leg.gov)
  let moved = 0
  for (const id of PARTY_IDS) if (gov.has(id)) { const cut = (seats[id] ?? 0) * swing; seats[id] = (seats[id] ?? 0) - cut; moved += cut }
  const opp = PARTY_IDS.filter(id => !gov.has(id))
  const oppTotal = opp.reduce((s, id) => s + (seats[id] ?? 0), 0)
  for (const id of opp) seats[id] = (seats[id] ?? 0) + (oppTotal > 0 ? moved * (seats[id] ?? 0) / oppTotal : moved / opp.length)
  return { ...leg, seats }
}

/** How much a party likes a measure (0-1) from its stance and the measure's direction. */
export function supportOf(party: string, lean: Lean): number {
  const s = PARTY_STANCE[party] ?? PARTY_STANCE.independent
  const v = .5 + .4 * s.econ * (lean.econ ?? 0) + .3 * (2 * s.green - 1) * (lean.green ?? 0) + .25 * (2 * s.liberty - 1) * (lean.liberty ?? 0) + .25 * (2 * s.order - 1) * (lean.order ?? 0)
  return Math.max(.03, Math.min(.97, v))
}

export type Sweetener = 'none' | 'whip' | 'deal' | 'bribe'
export interface VoteOdds {
  pass: number
  /** Expected yes share and what it needs. */
  yes: number
  need: number
  /** The party a deal would win over (the biggest one that is closest to yes). */
  dealParty: string
  body: Power['body']
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x))

/**
 * Odds a measure passes. `sweetener`: lean on the party (political capital), a deal with a
 * swing party (budget pork), or bribes (dirty money, evidence). Pure; the resolver rolls this.
 */
export function voteOdds(g: GameState, v: OfficeView, power: Power, lean: Lean, opts: { constitutional?: boolean; sweetener?: Sweetener } = {}): VoteOdds {
  const country = g.character.countryId
  const p = policyOf(g, country)
  const sweet = opts.sweetener ?? 'none'
  if (power.route === 'decree' || power.body === 'none') return { pass: 1, yes: 1, need: 0, dealParty: '', body: 'none' }
  if (power.body === 'council') {
    const fit = supportOf(v.party, lean) - .5
    const bonus = sweet === 'whip' ? .08 : sweet === 'deal' ? .12 : sweet === 'bribe' ? .15 : 0
    const pass = Math.max(.08, Math.min(.92, .5 + power.agenda + (v.approval - 50) / 150 + fit * .3 + bonus))
    return { pass, yes: pass, need: .5, dealParty: '', body: 'council' }
  }
  const leg = legislatureOf(g, country, p)
  const regime = p.institutions.regime
  const need = opts.constitutional ? .667 : .5
  if (regime === 'authoritarian') return { pass: .97, yes: .95, need, dealParty: '', body: 'legislature' }
  const gov = new Set(leg.gov)
  const sponsorGov = v.leader || gov.has(v.party)
  let yes = 0
  let dealParty = '', dealGain = 0
  for (const id of PARTY_IDS) {
    const seats = leg.seats[id] ?? 0
    if (!seats) continue
    let s = supportOf(id, lean)
    if (gov.has(id)) s = sponsorGov ? s + (1 - s) * .6 : s * .75
    else if (sponsorGov) s *= .85
    yes += seats * s
    const gain = seats * (1 - s) * .7
    if (!gov.has(id) && gain > dealGain) { dealGain = gain; dealParty = id }
  }
  yes += power.agenda + (v.approval - 50) / 400 + (regime === 'hybrid' ? .1 : 0)
  if (sweet === 'whip') yes += .06
  if (sweet === 'deal') yes += dealGain
  if (sweet === 'bribe') yes += .09
  const pass = Math.max(.02, Math.min(.98, logistic((yes - need) / .035)))
  return { pass, yes, need, dealParty, body: 'legislature' }
}

/** Chance the (NPC) head of government vetoes a bill the player got through (presidential systems). */
export function vetoChance(g: GameState, v: OfficeView, lean: Lean): number {
  if (v.leader || leaderTitle(g) !== 'President') return 0
  const leg = legislatureOf(g, g.character.countryId)
  if (leg.leaderParty === v.party) return .08
  return Math.max(.1, Math.min(.7, .25 + .4 * (1 - supportOf(leg.leaderParty, lean))))
}

/** Chance the courts strike down a constitutional measure (packed courts rarely do). */
export function strikeChance(g: GameState, severity: number): number {
  const p = policyOf(g, g.character.countryId)
  if (p.institutions.regime === 'authoritarian') return 0
  const independence = institutionStrength(g.character.countryId, g.year) / 100
  return Math.max(0, Math.min(.9, independence * (1 - p.institutions.courtPacked * .85) * severity))
}

/** Seats the governing parties hold together (0-1). */
export function governmentSeats(g: GameState, country = g.character.countryId): number {
  const leg = legislatureOf(g, country)
  return leg.gov.reduce((s, id) => s + (leg.seats[id] ?? 0), 0)
}
