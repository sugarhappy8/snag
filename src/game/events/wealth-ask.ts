// Money requests: the shape of one ask (stored in a choice popup's data, so plain JSON) and of
// the catalog entries that produce them (events/wealth-kids.ts, wealth-family.ts, wealth-world.ts),
// plus the builders they share (local amounts, era items, letters from prison, calls from abroad).
import { getCountry } from '../world'
import { randFloat } from '../rng'
import { landline, texting } from './era'
import {
  TIER_MULT,
  cap,
  entitlement,
  goodsScale,
  isAbroad,
  perceivedWealth,
  personCountry,
  readTies,
  round,
  yourOf,
} from './wealth-core'
import type { GameState, Json, Person } from '../types'

export interface Ask {
  /** Catalog id ('kid.car'). */
  k: string
  /** Who asks (absent for relatives outside your contacts, strangers and charities). */
  pid?: string
  /** A display name for an asker who isn't a contact ('your cousin Dele'). */
  name?: string
  title: string
  emoji: string
  /** The popup text, second person. */
  text: string
  /** What they want, in dollars. */
  amt: number
  /** Short noun phrase for the log and their history: 'a car', 'help with rent'. */
  what: string
  /** True when you'd be buying them a thing (the gift is the item, not cash). */
  buy?: boolean
  /** Label for the main option ('Buy the sports car (...)'); defaults to 'Give ...'. */
  giveLabel?: string
  /** A cheaper alternative (a sensible car, the house deposit instead of the house). */
  alt?: number
  altWhat?: string
  altLabel?: string
  /** Offer "Give less..." (a slider). */
  less?: boolean
  /** Offer "Lend it" (tracked per person). */
  lend?: boolean
  /** Offer "Set boundaries". */
  bound?: boolean
  /** Can be bundled with other small asks into one popup. */
  small?: boolean
  /** Ventures/tips: odds of success and of a partial payback (see wealth-core expectedReturn). */
  odds?: number
  partial?: number
  /** Kind-specific values. */
  x?: Record<string, Json>
}

export interface Extra {
  id: string
  label: (g: GameState, a: Ask, p?: Person) => string
  emoji: string
  /** Hide the option when false. */
  show?: (g: GameState, a: Ask, p?: Person) => boolean
  hint?: (g: GameState, a: Ask, p?: Person) => string
  /** How this answer counts in the asker's history (fair parenting is a mix of yes and no). */
  ans?: 'yes' | 'no'
  run: (g: GameState, a: Ask, p?: Person) => void
}

export interface AskDef {
  id: string
  /** Lowest wealth tier at which this ask comes up. */
  minTier: number
  /** Years before the same ask from the same person (or, for outsiders, at all). */
  cooldown: number
  /** Can arrive as a letter while you're in prison. */
  prison?: boolean
  /** Who might ask (omitted for outsiders). */
  people?: (g: GameState) => Person[]
  when?: (g: GameState, tier: number, p?: Person) => boolean
  weight: (g: GameState, tier: number, p?: Person) => number
  build: (g: GameState, tier: number, p?: Person) => Ask | null
  /** A real need (medical bills, bail): helping earns karma and refusing costs some. */
  need?: boolean
  /** How much a yes spoils a kid (entitlement points for the full amount). */
  spoil?: number
  /** Relationship gain for a full yes before gratitude adjustments (default 8). */
  thanks?: number
  /** Relationship loss for a no before sting adjustments (default 6). */
  hurt?: number
  /** Extra effects after a yes; returns a sentence for the result popup ('' for none). */
  onGive?: (g: GameState, a: Ask, p: Person | undefined, amount: number, full: boolean) => string
  /** Extra effects after a no / boundaries; returns a sentence ('' for none). */
  onNo?: (g: GameState, a: Ask, p: Person | undefined) => string
  /** Options beyond the standard ones. */
  extras?: Extra[]
  /** Replace the standard options (give, less, lend, boundaries) with the extras (+ 'no'). */
  custom?: boolean
  /** The money goes to the asker as cash (Person.money); otherwise it pays a bill or buys a thing. */
  cash?: boolean
  /** Label for the refusal ('Decline politely'); default 'Say no'. */
  noLabel?: string
  /** No plain refusal option (the extras cover every answer). */
  noNo?: boolean
}

/** Living people of these relations (or matching the filter) within an age range. */
export function folks(g: GameState, test: (p: Person) => boolean, minAge = 0, maxAge = 200): Person[] {
  return g.people.filter((p) => p.alive && p.relation !== 'pet' && p.data.disowned !== true && p.age >= minAge && p.age <= maxAge && test(p))
}

/**
 * An open-ended amount (a loan, a gift, a pitch): base dollars at today's US prices, scaled by
 * local prices where the asker lives, the wealth tier and how spoiled they are, then capped to
 * a share of what you're worth so nobody asks for more than you could plausibly give.
 */
export function scaled(g: GameState, base: number, tier: number, p?: Person, maxShare = 0.08): number {
  const country = p ? personCountry(g, p) : g.character.countryId
  const spoil = p ? 1 + entitlement(p) / 100 : 1
  const raw = base * goodsScale(g, country) * (TIER_MULT[tier] ?? 1) * spoil * randFloat(g, 0.8, 1.25)
  const capAt = perceivedWealth(g) * maxShare
  return round(Math.max(1, Math.min(raw, Math.max(base * 0.25, capAt))))
}

/** A priced item (a phone, a car): at most a share of your net worth. */
export function priced(g: GameState, usd: number, maxShare = 0.25): number {
  return round(Math.max(1, Math.min(usd, Math.max(usd * 0.2, perceivedWealth(g) * maxShare))))
}

/** "your son Liam" or, for an outsider, their display name. */
export function whoOf(a: Ask, p?: Person): string {
  return p ? yourOf(p) : a.name ?? 'someone'
}

/**
 * How the ask reaches you: in person normally, as a letter in prison, as a call or letter from
 * family abroad. Returns a prefix sentence.
 */
export function channel(g: GameState, p?: Person): string {
  if (g.character.prison) return p ? `A letter from ${yourOf(p)} arrived in the prison mail. ` : 'A letter arrived in the prison mail. '
  if (p && isAbroad(g, p)) {
    const where = getCountry(personCountry(g, p)).name
    return texting(g) ? `${cap(yourOf(p))} messaged you from ${where}. ` : landline(g) ? `${cap(yourOf(p))} called from ${where}. ` : `A letter came from ${yourOf(p)} in ${where}. `
  }
  return ''
}

/** True when this person may ask this year (not too soon after their last ask, no boundaries). */
export function mayAsk(g: GameState, p: Person, gap = 2): boolean {
  if (!p.alive || p.data.disowned === true) return false
  const t = readTies(g, p)
  if (t.bound > g.year) return false
  const spoiledGap = entitlement(p) >= 60 ? 1 : gap
  return t.asked <= 0 || g.year - t.asked >= spoiledGap
}

/** The year this person last got this ask (0 = never). */
export function lastAsked(g: GameState, p: Person, id: string): number {
  return readTies(g, p).marks[`ask.${id}`] ?? 0
}

/** A line about how spoiled the asker is ('' for most people). */
export function spoiledLine(p: Person): string {
  const e = entitlement(p)
  const x = p.gender === 'male' ? { he: 'He', his: 'his' } : { he: 'She', his: 'her' }
  if (e >= 80) return ` ${x.he} has made it clear anything less would be "literally the worst thing that has ever happened to anyone."`
  if (e >= 60) return ` ${x.he} already picked a color, and a backup color.`
  return ''
}
