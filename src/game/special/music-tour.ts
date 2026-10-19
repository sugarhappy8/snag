// Music 2.0 touring: a real profit and loss by venue tier. `tourModel` prices a tour from the record, the
// country and the year (pure, shared by the resolver and every hint), `settleTour` moves the cash through the
// ledger so the identity gate + merch + absorbed = costs + playerNet + bandCut holds to the dollar, and the
// picker (`career.music.tour`) is the one place a tour is rolled. The luck draw and the incident roll are
// drawn in the resolver only and never shown or hinted. Reads are pure and never draw g.rng. Every log, popup
// and choice goes through the career context. This file imports the music data, job and state modules, never
// music.ts.
import { addStat, useYearAction, yearActionsUsed } from '../core'
import { economyOf } from '../economy/model'
import { homeFrontAt, warsAt } from '../history/events-wars'
import { rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, MenuAction } from '../types'
import { getCountry } from '../world'
import { addFame, clamp100, money, ownerMatches } from './common'
import { honest } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { cap, rec } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, emitBooks, offerChoice, type CareerCtx } from './kit/year'
import { CREW_RATE, TOUR_TIERS, type TourTierId } from './music-data'
import { md, mdView, musicJob, musicProfile } from './music-job'
import { modMult, musicStore, topPeaks, type MusicState } from './music-state'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

const TOUR_SCRIPT = 'career.music.tour'
const TOUR_KEY = 'music.tour'
const TIER_IDS: readonly TourTierId[] = ['club', 'theater', 'arena', 'stadium']
const TIER_LABEL: Record<TourTierId, string> = { club: 'Club tour', theater: 'Theater tour', arena: 'Arena tour', stadium: 'Stadium tour' }
const TIER_EMOJI: Record<TourTierId, string> = { club: '\u{1F3A4}', theater: '\u{1F3AD}', arena: '\u{1F3DF}\u{FE0F}', stadium: '\u{1F30D}' }
const WORLD = '\u{1F30D}'

/** The share of the gate the promoter keeps. */
const PROMOTER_CUT = 0.25
/** What the merchandise costs to make, as a share of its sales. */
const MERCH_COST = 0.45
/** The cash cushion a tour needs before it leaves, as a share of its costs (split by the band). */
const CUSHION = 0.1
/** The luck every hint prints: a poor-but-not-bad run, never the roll itself. */
const HINT_LUCK = 0.1
/** Incident roll thresholds: below 0.08 weather, below 0.14 illness, below 0.22 a surge. */
const WEATHER_BELOW = 0.08
const ILLNESS_BELOW = 0.14
const SURGE_BELOW = 0.22

export type TourIncident = 'weather' | 'illness' | 'surge'

export interface TourPlan {
  tier: TourTierId
  shows: number
  heads: number
  fill: number
  ticket: number
  gate: number
  promoter: number
  crew: number
  travel: number
  production: number
  merch: number
  cogs: number
  costs: number // promoter + crew + travel + production + cogs
  net: number // gate + merch - costs
  perShowCosts: number
  breakEven: number // heads a night where a show pays for itself
  draw: number // heads a night, seats x fill
}

// ---------------------------------------------------------------------------
// Blocks (pure)

/** Why no tour can leave this year: venues shut in 2020 and 2021, or a war at home. Null when the road is open. */
export function tourBlock(g: GameState): string | null {
  if (g.year === 2020 || g.year === 2021) return 'Venues are shut this year.'
  const country = g.character.countryId
  if (warsAt(country, g.year).some((w) => homeFrontAt(w, country))) return "Travel isn't safe at home this year."
  return null
}

/** Why a stage is closed to you: popularity, its first year, the country's wealth, or a cool-down after an absorbed loss. Null when open. */
export function tierBlock(g: GameState, s: MusicState, tier: TourTierId): string | null {
  const t = TOUR_TIERS[tier]
  if (!t) return "That stage doesn't exist."
  const job = musicJob(g)
  const pop = job ? mdView(job).popularity : 0
  if (pop < t.minPop) return `You need popularity ${t.minPop} for that stage.`
  if (g.year < t.from) return `Promoters don't book ${tier} tours yet.`
  if (wealthOf(g) < t.wealth) return "Your home market can't fill that stage."
  if ((s.cool.tour ?? -1) >= g.year) return 'Promoters want a quiet year before they book you again.'
  return null
}

function openTiers(g: GameState, s: MusicState): TourTierId[] {
  return TIER_IDS.filter((t) => tierBlock(g, s, t) === null)
}

// ---------------------------------------------------------------------------
// The model (pure)

/** The home country's wealth, 0.05 to 1. */
function wealthOf(g: GameState): number {
  const w = getCountry(g.character.countryId)?.wealth
  return Number.isFinite(w) ? clamp(w, 0.05, 1) : 1
}

/** How much the home country spends on a night out, 0.8 to 1.2 (the reader music-rights uses). */
function leisureOf(g: GameState): number {
  const d = economyOf(g, g.character.countryId)?.sectors?.leisure?.demand
  return typeof d === 'number' && Number.isFinite(d) ? clamp(d, 0.8, 1.2) : 1
}

/** Popularity and the heads who share the pay: a band splits the net, a solo artist keeps it. */
function actOf(g: GameState): { pop: number; members: number } {
  const job = musicJob(g)
  if (!job) return { pop: 0, members: 1 }
  const d = mdView(job)
  return { pop: d.popularity, members: d.mode === 'band' ? d.members : 1 }
}

const merchFactor = (year: number): number => (year < 1965 ? 0.15 : year < 1985 ? 0.6 : 1)

/**
 * One tour priced end to end. `u` is the luck in 0 to 1 and `incident` the one thing that went wrong or
 * right (weather trims the gate, an illness cancels shows, a surge fills the house); `leisure` overrides the
 * economy reader (tests only). Pure: the resolver and every hint call this, so a statement cannot disagree
 * with a hint.
 */
export function tourModel(g: GameState, s: MusicState, tier: TourTierId, o: { u: number; incident?: TourIncident; leisure?: number }): TourPlan {
  const t = TOUR_TIERS[tier] ?? TOUR_TIERS.club
  const { pop } = actOf(g)
  const year = Number.isFinite(g.year) ? g.year : 0
  const u = Number.isFinite(o.u) ? clamp(o.u, 0, 1) : 0.5
  const leisure = typeof o.leisure === 'number' && Number.isFinite(o.leisure) ? o.leisure : leisureOf(g)
  const base = clamp((pop + 20 - t.minPop) / 60 + 0.2 * u + 0.03 * Math.min(3, topPeaks(s, year, 10, 2)) + (o.incident === 'surge' ? 0.1 : 0), 0.05, 1)
  const fill = Math.min(1, base * modMult(s, 'fill', year))
  const shows = o.incident === 'illness' ? Math.round(0.85 * t.shows) : t.shows
  const ticketEra = 1 + 0.35 * clamp((year - 1995) / 20, 0, 1)
  const ticket = (8 + 0.6 * pop) * wealthOf(g) ** 0.7 * ticketEra * leisure
  const heads = Math.round(t.seats * fill * shows)
  const gate = Math.round(heads * ticket * (o.incident === 'weather' ? 0.94 : 1))
  const promoter = Math.round(PROMOTER_CUT * gate)
  const crew = t.crew * CREW_RATE * shows
  const travel = t.travel * shows
  const production = t.production * shows
  const merchPerHead = (4 + 0.12 * pop) * merchFactor(year)
  const merch = Math.round(heads * merchPerHead)
  const cogs = Math.round(MERCH_COST * merch)
  const costs = promoter + crew + travel + production + cogs
  const net = gate + merch - costs
  const perShowCosts = t.crew * CREW_RATE + t.travel + t.production
  const marginPerHead = (1 - PROMOTER_CUT) * ticket + (1 - MERCH_COST) * merchPerHead
  return {
    tier: t.id,
    shows,
    heads,
    fill,
    ticket,
    gate,
    promoter,
    crew,
    travel,
    production,
    merch,
    cogs,
    costs,
    net,
    perShowCosts,
    breakEven: marginPerHead > 0 ? Math.min(1e9, Math.ceil(perShowCosts / marginPerHead)) : 1e9,
    draw: Math.round(t.seats * fill),
  }
}

const places = (n: number): string => n.toLocaleString('en-US')

/** What the picker prints under a stage: the night where it pays for itself and the house to expect. Never the luck or an incident. */
export function tourHint(g: GameState, s: MusicState, tier: TourTierId): string {
  const p = tourModel(g, s, tier, { u: HINT_LUCK })
  return `Break-even about ${places(p.breakEven)} a night, you should draw about ${places(p.draw)}`
}

// ---------------------------------------------------------------------------
// Settlement

export interface Settlement {
  playerNet: number
  bandCut: number
  absorbed: number
}

/**
 * Moves the player's share of the net through the ledger. A gain is earned. A loss is paid up to the cash on
 * hand and the promoter absorbs the rest, which cools tours for two years. The identity
 * gate + merch + absorbed = promoter + crew + travel + production + cogs + playerNet + bandCut holds exactly,
 * and the cash moves by exactly `playerNet`. Resolver bodies only.
 */
export function settleTour(c: CareerCtx<MusicState>, plan: TourPlan, members: number): Settlement {
  const { g, s, year } = c
  const heads = Number.isFinite(members) ? Math.max(1, Math.floor(members)) : 1
  const mine = Math.round(plan.net / heads)
  let playerNet = 0
  let absorbed = 0
  if (mine >= 1) {
    playerNet = c.earn('Tour', mine)
  } else if (mine <= -1) {
    const cash = Number.isFinite(g.character.money) ? Math.floor(Math.max(0, g.character.money)) : 0
    const owed = -mine
    const pay = Math.min(owed, cash)
    const paid = pay >= 1 && c.pay('Tour costs', pay) ? pay : 0
    absorbed = owed - paid
    playerNet = -paid
    if (absorbed > 0) s.cool.tour = Math.min(9999, year + 1)
  }
  return { playerNet, bandCut: plan.net + absorbed - playerNet, absorbed }
}

/** The tour's one popup: the stage, the shows, what the act cleared or lost, a band's share and the promoter's cover. */
function tourText(tier: TourTierId, plan: TourPlan, st: Settlement, members: number): string {
  const lead = `Your ${tier} tour played ${plan.shows} shows.`
  const band = members > 1
  const parts = [lead]
  if (plan.net >= 0) {
    parts.push(`${band ? 'The band' : 'You'} cleared ${money(plan.net)}.`)
    if (band) parts.push(`Your share is ${money(st.playerNet)}.`)
  } else {
    parts.push(`${band ? 'The band' : 'You'} lost ${money(-plan.net)}.`)
    if (band) parts.push(`Your share of the loss is ${money(Math.max(0, -st.playerNet))}.`)
    if (st.absorbed > 0) parts.push(`The promoter covered ${money(st.absorbed)} of it.`)
  }
  const text = parts.join(' ')
  return text.length > 120 ? parts.slice(1).join(' ') : text
}

// ---------------------------------------------------------------------------
// The picker

const incidentOf = (x: number): TourIncident | undefined => (x < WEATHER_BELOW ? 'weather' : x < ILLNESS_BELOW ? 'illness' : x < SURGE_BELOW ? 'surge' : undefined)

const isTier = (v: string): v is TourTierId => (TIER_IDS as readonly string[]).includes(v)

/**
 * One option per open stage, each with the Music talent's hint, plus Never mind. A blocked stage is left
 * out, so the picker never offers what the resolver would refuse.
 */
function pickerChoices(g: GameState, s: MusicState): ChoiceOption[] {
  const out: ChoiceOption[] = openTiers(g, s).map((tier) => ({ id: tier, label: TIER_LABEL[tier], emoji: TIER_EMOJI[tier], ...honest(g, 'Music', tourHint(g, s, tier)) }))
  out.push({ id: 'cancel', label: 'Never mind', emoji: '\u{274C}' })
  return out
}

/** The cash a tour needs on hand: a tenth of its costs at the hint's luck, split by the band. */
function cushion(g: GameState, s: MusicState, tier: TourTierId, members: number): number {
  return Math.ceil((CUSHION * tourModel(g, s, tier, { u: HINT_LUCK }).costs) / Math.max(1, members))
}

defineScript(TOUR_SCRIPT, (g, choice, data) => {
  if (!isTier(choice)) return // Never mind, or a junk choice
  // A stale modal must not create a record, and a replay, another owner or another year must not write.
  const seen = musicStore.peek(g)
  const job = musicJob(g)
  // A job whose record is not an object has nothing to tour with (the readers below would throw).
  if (!seen || !job || !job.data || typeof job.data !== 'object' || Array.isArray(job.data)) return
  const year = g.year
  const key = `tour.${year}`
  const d = rec(data)
  if (!ownerMatches(g, d.owner) || d.year !== year || seen.done.includes(key)) return
  // Every refusal says why, claims nothing and spends nothing, so the player can pick again.
  const talk = careerCtx(g, 'music', seen)
  const refuse = (why: string): void => void careerSay(talk, 'Tour', why, WORLD, 'bad')
  const why = tourBlock(g) ?? (yearActionsUsed(g, TOUR_KEY) >= 1 ? 'You already toured this year.' : null) ?? tierBlock(g, seen, choice)
  if (why) return refuse(why)
  const { members } = actOf(g)
  const need = cushion(g, seen, choice, members)
  if (!(g.character.money >= need)) return refuse(`You need ${money(need)} on hand to book that stage.`)
  const s = musicStore.mut(g)
  if (!claimChoice(g, s, data, key)) return
  if (!useYearAction(g, TOUR_KEY, 1)) return
  const c = careerCtx(g, 'music', s)
  const before = g.character.money

  // The luck and the incident: the only draws of the tour, never shown.
  const u = rand(g)
  const incident = incidentOf(rand(g))
  const plan = tourModel(g, s, choice, incident ? { u, incident } : { u })
  const st = settleTour(c, plan, members)

  // The aftermath keeps the legacy shape: a profit lifts popularity, a loss barely does.
  const profit = plan.net > 0
  const act = md(job)
  act.popularity = clamp100(act.popularity + (profit ? randInt(g, 2, 5) : 1))
  addFame(g, profit ? 2 : 1)
  addStat(g, 'health', -randInt(g, 3, 8))
  addStat(g, 'happiness', profit ? 8 : 2)
  musicProfile(g).tours += 1
  if (g.character.age >= 75) g.flags['special.music.tour75'] = true
  s.tours = cap([...s.tours, { year, tier: choice, shows: plan.shows, gate: plan.gate, costs: plan.costs, net: st.playerNet }], 8)
  careerLog(c, `I went on a ${choice} tour.`, profit ? 'good' : 'neutral')
  careerSay(c, 'World Tour', tourText(choice, plan, st, members), WORLD, profit ? 'good' : 'bad')
  emitBooks(c, TOUR_KEY, before)
})

/**
 * The Tour row: it keeps its id, label and subtitle and opens the picker. The gate is the road, then the once-a-year
 * limit, then the club stage when no stage is open; the resolver checks all of it again and applies the limit itself.
 */
export const tourAction: MenuAction = gatedAction<MusicState>({
  id: TOUR_KEY,
  label: 'Tour',
  emoji: WORLD,
  career: 'music',
  store: musicStore,
  subtitle: 'Go on a world tour',
  gate: (g, s) => tourBlock(g) ?? (yearActionsUsed(g, TOUR_KEY) >= 1 ? 'You already toured this year.' : null) ?? (openTiers(g, s).length === 0 ? tierBlock(g, s, 'club') : null),
  run: (c) => {
    // With two career choices already waiting there is no room for a third: say so rather than do nothing.
    if (!offerChoice(c, TOUR_SCRIPT, 'Tour', 'Which stage will you play? What will you do?', pickerChoices(c.g, c.s), {}, WORLD)) careerSay(c, 'Tour', 'Answer your open choices first.', WORLD)
  },
})
