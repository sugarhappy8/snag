// Music 2.0 label deal: the roster by year and country, the offer and its negotiation, the yearly deal
// tick (the advance paid through the ledger, trust, expiry and the renewal), the exits and the Release
// Plan. Reads (`labelsAt`, `pushOdds`, `attentionOf`, `cooled`, the plan row) are pure and never draw
// g.rng; the push roll, the renewal terms and the term draws happen only in scripts and in the settle
// body. Every log, popup and choice goes through the career context. This file imports the music data,
// job, state and market modules, never music.ts.
import { remember } from '../core'
import { chance, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import type { ChoiceOption, GameState, MenuAction } from '../types'
import { fameOf, leave, money, quitNote } from './common'
import { honest } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { flt, int, nextId, rec, txt, appointmentId, cap, type Raw } from './kit/state'
import { careerCtx, careerLog, careerSay, choiceRoom, claimChoice, offerChoice, type CareerCtx } from './kit/year'
import { GENRES, LABEL_ROSTER, ROYALTY_BASE, claimOdds, labelId, type SampleMode } from './music-data'
import { md, mdView, musicJob, signDeal } from './music-job'
import { planEffect } from './music-market'
import { adoptMusic, dealOf, legacyDeal, musicScore, musicStore, type LabelDeal, type MusicState } from './music-state'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4
const pctOf = (royalty: number): number => Math.round(royalty * 100)

/** The most a deal advances, in dollars. */
const ADVANCE_MAX = 1_500_000
/** The most the artist's share of net can reach. */
const ROYALTY_MAX = 0.4
/** What a successful push adds to the royalty. */
const PUSH_STEP = 0.03
/** The renewal bonus when nothing is owed, and the margin a grandfathered life keeps over a fresh one. */
const CLEAR_BONUS = 0.02
/** Popularity and trust a renewal needs. */
const RENEW_POP = 35
const RENEW_TRUST = 25
/** Years a label stays cold after each way a deal or an offer ends. */
const COOL_PUSH = 2
const COOL_WALK = 3
const COOL_EXIT = 3
/** The standing a label expects of its artist, by tier. */
const ATTENTION_AT: readonly number[] = [38, 52, 66, 74]

const DEAL_SCRIPT = 'career.music.deal'
const PLAN_SCRIPT = 'career.music.plan'

// ---------------------------------------------------------------------------
// The roster

export interface RosterEntry {
  id: string
  name: string
  tier: 0 | 1 | 2 | 3
}

/**
 * The labels open in a year and country, plus a tier-0 floor in the player's city so no year and country
 * is empty. Sorted by tier, the floor first among tier 0, then roster order: the last reachable one is the
 * biggest. Pure.
 */
export function labelsAt(year: number, country: string, city: string): RosterEntry[] {
  const open = LABEL_ROSTER.filter((l) => l.from <= year && (!l.countries || l.countries.includes(country))).map((l): RosterEntry => ({ id: l.id, name: l.name, tier: l.tier }))
  return [floorLabel(city), ...open].sort((a, b) => a.tier - b.tier)
}

function floorLabel(city: string): RosterEntry {
  const place = typeof city === 'string' && city.trim() ? city.trim().slice(0, 40) : 'Local'
  const name = `${place} Records`
  return { id: labelId(name), name, tier: 0 }
}

/** A label by name in any year and country, else the floor label of this city, else null; so a stale modal still resolves. Pure. */
export function labelNamed(name: string, city: string): RosterEntry | null {
  const known = LABEL_ROSTER.find((l) => l.name === name)
  if (known) return { id: known.id, name: known.name, tier: known.tier }
  const floor = floorLabel(city)
  return floor.name === name ? floor : null
}

/** The artist's base share of net by label tier. */
export function baseRoyalty(tier: number): number {
  return ROYALTY_BASE[int(tier, 1, 0, 3)]
}

/** True while a label is cold for the artist: `cool['label.<id>']` holds the last cold year. Pure. */
export function cooled(s: MusicState, id: string, year: number): boolean {
  return (s.cool[`label.${id}`] ?? -1) >= year
}

/** Cools a label for `years` years from `year` (this year counts). */
function coolLabel(s: MusicState, id: string, year: number, years: number): void {
  const key = `label.${id}`
  delete s.cool[key]
  s.cool[key] = Math.min(9999, year + years - 1)
}

// ---------------------------------------------------------------------------
// Odds and attention (pure)

/** The chance a push lands: 0.30 plus the leverage over the label's need, 0.10 to 0.85. The roll and the hint both call this. */
export function pushOdds(g: GameState, tier: number): number {
  const job = musicJob(g)
  const leverage = (job ? mdView(job).popularity : 0) + 0.5 * fameOf(g)
  const need = 40 + 12 * int(tier, 1, 0, 3)
  return clamp(0.3 + (leverage - need) / 80, 0.1, 0.85)
}

/** How much a label looks at the artist: the standing against the tier's bar, 0.5 to 1.3. */
export function attentionOf(g: GameState, s: MusicState, deal: LabelDeal): number {
  return clamp(1 + (musicScore(g, s) - (ATTENTION_AT[int(deal.tier, 1, 0, 3)] ?? 52)) / 100, 0.5, 1.3)
}

// ---------------------------------------------------------------------------
// The offer

/** The modal data of a negotiation. A type, not an interface, so it is assignable to the kit's Record<string, Json>. */
export type DealOffer = {
  offerId: string
  instrument: string
  labelId: string
  label: string
  tier: 0 | 1 | 2 | 3
  genre: string
  advance: number
  years: number
  royalty: number
  pushed: boolean
  renew: boolean
  goingSolo: boolean
  dealId: string // the deal a renewal replaces, '' for a new offer
  carry: number // the unrecouped balance a renewal brings over
}

/** A modal's data as a safe offer: every field clamped, the royalty to 4 decimals. */
function readOffer(d: Raw): DealOffer {
  const tier = int(d.tier, 1, 0, 3) as DealOffer['tier']
  const label = txt(d.label, 60) || 'Independent'
  const genre = typeof d.genre === 'string' && GENRES[d.genre] ? d.genre : 'Pop'
  return {
    offerId: txt(d.offerId, 24),
    instrument: txt(d.instrument, 40) || 'Voice',
    labelId: txt(d.labelId, 40) || labelId(label),
    label,
    tier,
    genre,
    advance: int(d.advance, 0, 0, ADVANCE_MAX),
    years: int(d.years, 3, 1, 8),
    royalty: round4(flt(d.royalty, baseRoyalty(tier), 0.05, ROYALTY_MAX)),
    pushed: d.pushed === true,
    renew: d.renew === true,
    goingSolo: d.goingSolo === true,
    dealId: txt(d.dealId, 24),
    carry: int(d.carry, 0, 0, 1e9),
  }
}

const perYearOf = (o: DealOffer): number => Math.round(o.advance / Math.max(1, o.years))

const dealScene = (o: DealOffer): string => `${o.label} offers ${o.years} years, ${money(perYearOf(o))} paid yearly, and ${pctOf(o.royalty)}% of net. What will you do?`

/** Sign, push (only while it has not been pushed) and walk. Only the Music talent sees the odds. */
function dealChoices(g: GameState, o: DealOffer): ChoiceOption[] {
  const out: ChoiceOption[] = [{ id: 'sign', label: 'Sign the deal', emoji: '\u{270D}\u{FE0F}' }]
  if (!o.pushed) out.push({ id: 'push', label: 'Push for royalty', emoji: '\u{1F4AC}', ...honest(g, 'Music', `About ${Math.round(100 * pushOdds(g, o.tier))}% to land`) })
  out.push({ id: 'walk', label: 'Walk away', emoji: '\u{1F6AA}' })
  return out
}

function queueOffer(c: CareerCtx<MusicState>, o: DealOffer): boolean {
  return offerChoice(c, DEAL_SCRIPT, o.renew ? 'Contract Expiring' : o.label, dealScene(o), dealChoices(c.g, o), o, '\u{1F4BF}')
}

/**
 * Offers a new deal from an audition. The record is adopted first, so a life that acts is the sim's.
 * False (and nothing written) when the career queue has no room: the caller then queues the legacy
 * contract modal instead, so an offer is never lost.
 */
export function offerDeal(g: GameState, o: Pick<DealOffer, 'instrument' | 'labelId' | 'label' | 'tier' | 'genre' | 'advance' | 'years' | 'goingSolo'>): boolean {
  // The room check reads a throw-away context over the pure view, so a refusal writes nothing.
  if (!choiceRoom(careerCtx(g, 'music', musicStore.view(g)))) return false
  const s = musicStore.mut(g)
  adoptMusic(g, s)
  const c = careerCtx(g, 'music', s)
  const tier = int(o.tier, 1, 0, 3) as DealOffer['tier']
  return queueOffer(
    c,
    readOffer({
      ...o,
      offerId: nextId(s, 'o'),
      tier,
      labelId: o.labelId || labelId(o.label),
      advance: Math.min(ADVANCE_MAX, Math.max(0, Math.round(o.advance))),
      royalty: baseRoyalty(tier),
      pushed: false,
      renew: false,
      dealId: '',
      carry: 0,
    }),
  )
}

// ---------------------------------------------------------------------------
// Exits

/**
 * Closes the deal: one history row (the unrecouped balance forgiven, never a debt), the label cold for
 * three years, the ledger rows still paying at their rate. A no-op with no deal. It never touches
 * Job.data and never ends the job: the callers use leave(g, ...), and a replaced job's data belongs to
 * the new appointment.
 */
export function endDeal(c: CareerCtx<MusicState>, how: 'expired' | 'dropped' | 'walked' | 'quit'): void {
  const { s } = c
  const deal = s.deal
  if (!deal) return
  s.history = cap([...s.history, { label: deal.label, from: deal.since, to: c.year, ended: how, forgiven: deal.unrecouped }], 8)
  s.deal = null
  coolLabel(s, deal.labelId, c.year, COOL_EXIT)
}

// ---------------------------------------------------------------------------
// The deal year

const hasDealModal = (g: GameState): boolean => g.queue.some((m) => m.kind === 'choice' && m.scriptId === DEAL_SCRIPT)

/**
 * One tick of the deal for a held musician job, before everything else in the year. A deal that does not
 * belong to this appointment closes with its history row, and a legacy contract in Job.data (an old
 * modal answered after the record was made) becomes a grandfathered deal again. While years remain it
 * pays the advance, a ledger deal adds it to the balance, and trust moves. At years 0 it offers the
 * renewal or drops the artist. Settle bodies only.
 */
export function stepDeal(c: CareerCtx<MusicState>): void {
  const { g, s } = c
  const job = musicJob(g)
  // A musician job whose record is not an object has nothing to tick (the readers below would throw).
  if (!job || !job.data || typeof job.data !== 'object' || Array.isArray(job.data)) return
  let deal = dealOf(g, s)
  const d0 = mdView(job)
  const resigned = !!deal && deal.years === 0 && d0.contractYears > 0 && d0.advancePerYear > 0
  if (!deal || resigned) {
    const lifted = legacyDeal(g)
    if (s.deal) endDeal(c, 'expired')
    if (!lifted) return
    s.deal = lifted
    deal = lifted
  }
  const d = md(job)
  if (deal.years > 0) {
    c.earn('Label advance', deal.perYear)
    if (!deal.legacy) deal.unrecouped = Math.min(1e9, deal.unrecouped + deal.perYear)
    deal.years -= 1
    d.contractYears = deal.years
    deal.trust = clamp(deal.trust + (d.lastRelease >= g.character.age - 1 ? 3 : -4), 0, 100)
  }
  if (deal.years > 0) return
  if (d.popularity >= RENEW_POP && deal.trust >= RENEW_TRUST) {
    offerRenewal(c, deal)
    return
  }
  const label = deal.label
  endDeal(c, 'dropped')
  leave(g, 'fired')
  careerLog(c, `${label} dropped me.`, 'bad')
  careerSay(c, 'Dropped', `${label} didn't renew you. You're a free agent.`, '\u{1F4C9}', 'bad')
}

/**
 * The renewal screen: the legacy term and advance draws in the legacy order, the royalty up when nothing
 * is owed, half of the balance carried. It waits a year, drawing nothing, when the queue has no room.
 */
function offerRenewal(c: CareerCtx<MusicState>, deal: LabelDeal): void {
  const { g, s } = c
  const job = musicJob(g)
  if (!job || !choiceRoom(c) || hasDealModal(g)) return
  const d = mdView(job)
  const years = randInt(g, 2, 4)
  const advance = Math.min(ADVANCE_MAX, Math.round((d.popularity ** 2 * 60 * years * (0.7 + rand(g) * 0.6)) / 1_000) * 1_000)
  const royalty = deal.legacy ? baseRoyalty(deal.tier) + CLEAR_BONUS : Math.min(ROYALTY_MAX, deal.royalty + (deal.unrecouped === 0 ? CLEAR_BONUS : 0))
  queueOffer(c, {
    offerId: nextId(s, 'o'),
    instrument: d.instrument,
    labelId: deal.labelId,
    label: deal.label,
    tier: deal.tier,
    genre: d.genre,
    advance,
    years,
    royalty: round4(royalty),
    pushed: false,
    renew: true,
    goingSolo: false,
    dealId: deal.id,
    carry: deal.legacy ? 0 : Math.round(deal.unrecouped / 2),
  })
}

// ---------------------------------------------------------------------------
// The negotiation script

function signNew(c: CareerCtx<MusicState>, o: DealOffer): void {
  const { g, s } = c
  // A stale deal of a replaced job closes with its history row.
  if (s.deal) endDeal(c, 'expired')
  const { job, quit, fromBand } = signDeal(g, { instrument: o.instrument, label: o.label, tier: o.tier, genre: o.genre, advance: o.advance, years: o.years }, { advancePerYear: 0 })
  const perYear = perYearOf(o)
  s.deal = {
    id: nextId(s, 'd'),
    appt: appointmentId(job),
    labelId: o.labelId,
    label: o.label,
    tier: o.tier,
    since: c.year,
    term: o.years,
    years: o.years,
    royalty: o.royalty,
    advance: o.advance,
    perYear,
    unrecouped: 0,
    trust: 55,
    legacy: false,
    renewals: 0,
  }
  job.salary = perYear
  md(job).contractYears = o.years
  careerLog(c, `I signed with ${o.label} for ${o.years} years.`, 'good')
  remember(g, fromBand ? `Went solo with ${o.label}.` : `Signed a ${o.genre} record deal with ${o.label}.`)
  careerSay(c, 'Record Deal', `You signed with ${o.label} for ${o.years} years, ${money(perYear)} a year, and ${pctOf(o.royalty)}% of net.${quitNote(quit)}`, '\u{1F4BF}', 'good')
}

function signRenewal(c: CareerCtx<MusicState>, o: DealOffer): void {
  const { s } = c
  const job = musicJob(c.g)
  const deal = dealOf(c.g, s)
  if (!job || !deal) return
  const perYear = perYearOf(o)
  if (deal.id === 'legacy') deal.id = nextId(s, 'd')
  deal.since = c.year
  deal.term = o.years
  deal.years = o.years
  deal.advance = o.advance
  deal.perYear = perYear
  deal.renewals = Math.min(9, deal.renewals + 1)
  deal.royalty = o.royalty
  deal.unrecouped = o.carry
  deal.legacy = false
  const d = md(job)
  d.contractYears = o.years
  d.advancePerYear = 0
  job.salary = perYear
  careerLog(c, `I re-signed with ${deal.label}.`, 'good')
  careerSay(c, 'Contract Renewed', `You re-signed with ${deal.label} for ${o.years} years, ${money(perYear)} a year, and ${pctOf(o.royalty)}% of net.`, '\u{270D}\u{FE0F}', 'good')
}

function pushDeal(c: CareerCtx<MusicState>, o: DealOffer): void {
  const { g, s } = c
  if (chance(g, pushOdds(g, o.tier))) {
    const better: DealOffer = { ...o, pushed: true, royalty: round4(Math.min(ROYALTY_MAX, o.royalty + PUSH_STEP)) }
    // The new terms come first, then the screen that offers them. With no room a new offer lapses and a renewal waits for next year.
    if (choiceRoom(c)) {
      careerSay(c, o.label, `${o.label} moved up to ${pctOf(better.royalty)}% of net.`, '\u{1F4AC}', 'good')
      queueOffer(c, better)
    } else if (!o.renew) careerLog(c, `${o.label} withdrew the offer.`, 'bad')
    return
  }
  // A miss: the offer is withdrawn, and a renewal that is withdrawn ends the deal.
  if (o.renew) {
    endDeal(c, 'dropped')
    leave(g, 'fired')
    careerLog(c, `${o.label} dropped me.`, 'bad')
  } else {
    coolLabel(s, o.labelId, c.year, COOL_PUSH)
  }
  careerSay(c, o.label, `${o.label} withdrew the offer.`, '\u{1F4C9}', 'bad')
}

function walkAway(c: CareerCtx<MusicState>, o: DealOffer): void {
  const { g, s } = c
  if (!o.renew) {
    coolLabel(s, o.labelId, c.year, COOL_WALK)
    careerSay(c, o.label, `You turned down ${o.label}. They won't take your calls for ${COOL_WALK} years.`, '\u{1F4BF}')
    return
  }
  endDeal(c, 'walked')
  leave(g, 'quit')
  careerLog(c, `I walked away from ${o.label}.`)
  careerSay(c, 'Free Agent', `You turned down ${o.label}'s new deal and left the label.`, '\u{1F4BF}')
}

defineScript(DEAL_SCRIPT, (g, choice, data) => {
  if (choice !== 'sign' && choice !== 'push' && choice !== 'walk') return
  // A stale modal must not create a record.
  if (!musicStore.has(g)) return
  const s = musicStore.mut(g)
  const o = readOffer(rec(data))
  // A renewal of a deal that is no longer the live one changes nothing, not even the done list.
  if (o.renew && dealOf(g, s)?.id !== o.dealId) return
  if (!claimChoice(g, s, data, `deal.${o.offerId}.${o.pushed ? 1 : 0}`)) return
  adoptMusic(g, s)
  const c = careerCtx(g, 'music', s)
  if (choice === 'sign') return o.renew ? signRenewal(c, o) : signNew(c, o)
  if (choice === 'push') return pushDeal(c, o)
  walkAway(c, o)
})

// ---------------------------------------------------------------------------
// The Release Plan

const MODES: readonly SampleMode[] = ['original', 'cleared', 'risky']

/** What a sample policy would cost and do, whatever the saved policy is. Pure. */
function effectOf(g: GameState, s: MusicState, mode: SampleMode): ReturnType<typeof planEffect> {
  return planEffect(g, { ...s, policy: { samples: mode } })
}

/** The sold clause of a plan hint. A grandfathered release keeps its drawn `sold` (music-market `bookRelease`), so it promises none. Pure. */
const soldText = (g: GameState, s: MusicState, mult: number): string => (dealOf(g, s)?.legacy ? '' : `, about ${Math.round((mult - 1) * 100)}% more sold`)

const claimHint = (): string => `About ${Math.round(100 * claimOdds('sample', 1))}% claim risk if it charts top 10`

function planChoices(g: GameState, s: MusicState): ChoiceOption[] {
  const cleared = effectOf(g, s, 'cleared')
  const risky = effectOf(g, s, 'risky')
  return [
    { id: 'original', label: 'Write it fresh', emoji: '\u{270F}\u{FE0F}' },
    { id: 'cleared', label: 'Clear every sample', emoji: '\u{1F4DC}', ...honest(g, 'Music', `Costs ${money(cleared.cost)}, +${cleared.quality} quality${soldText(g, s, cleared.sold)}.`) },
    { id: 'risky', label: 'Skip clearances', emoji: '\u{1F3B2}', ...honest(g, 'Music', `Free, +${risky.quality} quality${soldText(g, s, risky.sold)}. ${claimHint()}.`) },
  ]
}

defineScript(PLAN_SCRIPT, (g, choice, data) => {
  if (!musicStore.has(g)) return
  if (!MODES.includes(choice as SampleMode)) return
  const s = musicStore.mut(g)
  if (!claimChoice(g, s, data, `plan.${txt(rec(data).pid, 24)}`)) return
  s.policy.samples = choice as SampleMode
  const c = careerCtx(g, 'music', s)
  const cost = planEffect(g, s).cost
  careerSay(
    c,
    'Release Plan',
    choice === 'original' ? "You'll write it fresh." : choice === 'cleared' ? `You'll clear every sample. It costs ${money(cost)} at release.` : "You'll skip clearances. A claim is possible.",
    '\u{1F4DD}',
  )
})

/** How the next release handles samples. Reads only; the choice is made through career.music.plan. */
export const planRow: MenuAction = gatedAction<MusicState>({
  id: 'music.plan',
  label: 'Release Plan',
  emoji: '\u{1F4DD}',
  career: 'music',
  store: musicStore,
  subtitle: (g) => {
    const e = planEffect(g, musicStore.view(g))
    return e.mode === 'cleared' ? `Samples: cleared, ${money(e.cost)} at release` : e.mode === 'risky' ? 'Samples: skipped clearances' : 'Samples: write it fresh'
  },
  hint: (g) => talentHint(g, 'Music', claimHint()) || null,
  gate: () => null,
  run: (c) => {
    offerChoice(c, PLAN_SCRIPT, 'Release Plan', 'How will you handle samples on the next release? What will you do?', planChoices(c.g, c.s), { pid: nextId(c.s, 'p') }, '\u{1F4DD}')
  },
})
