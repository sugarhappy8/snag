// Actor 2.0 pipeline: how a role becomes a project, how a project is paid and released, and the yearly
// steps the sim runs (residuals, wrap, dry year, awards, close). Every cash move goes through the kit's
// `c.earn` / `c.pay`; every probability a hint prints comes from the same function the roll uses
// (`pushOdds`, `grossOf`, `awardOdds`). `landProject` is the only place a role becomes a `Proj`.
// Imports from actor.ts are used inside function bodies only (it imports this file back).
import { seeded } from '../assets'
import { personCash } from '../cash'
import { addRelationship, addStat, article, count, fullName, getPerson, remember as rememberLife, useYearAction, yearActionsUsed } from '../core'
import { techOdds } from '../history/timeline'
import { brandPool } from '../shops/everyday-brands'
import { chance, randFloat, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { ChoiceOption, GameState, Tone } from '../types'
import { actorJob, type Listing } from './actor'
import { AWARD_DEFS, BUDGETS, TYPE_IDS, TYPE_OF, type AwardDef, type BudgetId, type IndustryId, type TypeId } from './actor-data'
import { actorStore, adoptLegacy, type ActorState, type Credit, type Proj, type Role, type Terms } from './actor-state'
import { ACTOR_SPEC, awardOdds, breakEvenOf, grossOf, industryOf, scaleOf, starPower, studioYear } from './actor-world'
import { actingSkill, addColleague, addFame, clamp100, dropList, fameOf, fameToward, hire, money, setFlagSkill, setRole } from './common'
import { honest } from './kit/crisis'
import { activeField, familySeed, noteRival } from './kit/rivals'
import { cap, int, nextId, rec, txt } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, fit, ledgerOf, offerChoice, type CareerCtx } from './kit/year'

export type ContractChoice = 'sign' | 'points' | 'exclusive' | 'push'

/** The queued contract choice after a landed lead or supporting role. */
export const CONTRACT_SCRIPT = 'career.actor.contract'

const PIPELINE_MAX = 4
const FEE_MAX = 25_000_000
const BACKEND_MAX = 8_000_000
const MONEY_MAX = 1e12
const POINTS_MAX = 0.12
const CUT_MAX = 0.3
const RETAINER_YEARS = 7

const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const roundTo = (n: number, step: number): number => Math.round(n / step) * step

const FILM = '\u{1F3AC}'
const TV = '\u{1F4FA}'

// ---------------------------------------------------------------------------
// Small pure helpers

const actorWord = (g: GameState): string => (g.character.gender === 'female' ? 'Actress' : 'Actor')

function roleTitle(g: GameState, role: Role, kind: 'film' | 'tv'): string {
  if (role === 'Extra') return 'Extra'
  if (role === 'Supporting') return `Supporting ${actorWord(g)}`
  if (fameOf(g) >= 70) return kind === 'film' ? 'Movie Star' : 'TV Star'
  return `Lead ${actorWord(g)}`
}

const roleWord = (role: Role): string => (role === 'Extra' ? 'an extra' : role === 'Lead' ? 'the lead' : 'a supporting character')

/** The agent's and the manager's cuts together, never above 30%. */
function cutRate(s: ActorState): number {
  return clamp(fin(s.team.agent?.cut) + fin(s.team.manager?.cut), 0, CUT_MAX)
}

/** 'p12' to 12: projects run in the order they were made. */
const seqOf = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0)
const byId = (a: Proj, b: Proj): number => seqOf(a.id) - seqOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const isLive = (p: Proj): boolean => p.stage === 'shoot' || p.stage === 'offer'
const isBudget = (v: string, kind: 'film' | 'tv'): v is BudgetId => v in BUDGETS && BUDGETS[v as BudgetId].kind === kind

/** The budget a listing carries, or the plain one for its kind when the string is not a known budget of that kind. */
function budgetOf(l: Listing): BudgetId {
  const kind = l.kind === 'tv' ? 'tv' : 'film'
  return isBudget(l.budget, kind) ? l.budget : kind === 'film' ? 'indie' : 'network'
}

/** The studio or network as the brand registry knows it (clout 1-10), 5 when it has none. Pure. */
function studioFameOf(g: GameState, p: Pick<Proj, 'kind' | 'studio' | 'studioId' | 'since'>): number {
  const year = p.since > 0 ? p.since : g.year
  const b = brandPool(g, p.kind === 'film' ? 'film-studio' : 'streaming', { year }).find((x) => x.id === p.studioId || x.name === p.studio)
  return clamp(fin(b?.fame, 5), 1, 10)
}

function studioIdOf(g: GameState, kind: 'film' | 'tv', studio: string): string {
  return brandPool(g, kind === 'film' ? 'film-studio' : 'streaming').find((x) => x.name === studio)?.id ?? ''
}

/** The previous report's net (income less outlay): what "last year's net" means for a fee. */
function lastNet(s: ActorState): number {
  const row = s.rows[s.rows.length - 1]
  return row ? Math.max(0, row.income - row.spent) : 0
}

// ---------------------------------------------------------------------------
// The year's accumulator (per context: settleYear makes one a year)

interface Release { credit: Credit; budget: BudgetId; campaign: number; window: Proj['window']; studioFame: number }
interface Tick {
  wrapped: number
  released: number
  concurrent: number | null
  /** The two-shoots happiness cost is paid once a year. */
  crowded: boolean
  releases: Release[]
  best: { title: string; verdict: string; popularity: number } | null
}
const ticks = new WeakMap<object, Tick>()
function tickOf(c: CareerCtx<ActorState>): Tick {
  let t = ticks.get(c)
  if (!t) {
    t = { wrapped: 0, released: 0, concurrent: null, crowded: false, releases: [], best: null }
    ticks.set(c, t)
  }
  return t
}

// ---------------------------------------------------------------------------
// Blocks

/** Why you can't audition at all right now (an exclusive deal, a lay-low year), or null. */
export function auditionBlock(g: GameState, s: ActorState): string | null {
  const deal = s.pipeline.find((p) => p.terms.exclusive && isLive(p))
  if (deal) return `Your exclusive deal for "${deal.title}" rules out other auditions.`
  if (s.layLow > 0 && s.layLow >= g.year) return "You're laying low this year, so there are no auditions."
  return null
}

/**
 * Why this kind of part doesn't fit your schedule, or null. One film shoot and one series shoot at a time,
 * four projects counting the ones in post. Extras are exempt from every rule but the four.
 */
export function slotBlock(s: ActorState, p: Pick<Proj, 'kind' | 'role'>): string | null {
  if (s.pipeline.length >= PIPELINE_MAX) return 'You already have four projects going.'
  if (p.role === 'Extra') return null
  const live = s.pipeline.filter((x) => x.role !== 'Extra' && isLive(x))
  const deal = live.find((x) => x.terms.exclusive)
  if (deal) return `Your exclusive deal for "${deal.title}" rules out a second job.`
  if (live.some((x) => x.kind === p.kind)) return p.kind === 'film' ? "You're already shooting a film." : "You're already shooting a series."
  return null
}

// ---------------------------------------------------------------------------
// Fees and terms

/** (1 - scandal/250) x1.2 for a typecast type x the fee modifiers of Task 7 in force this year (all 1 until set). */
export function feeMult(s: ActorState, year: number, p: Pick<Proj, 'kind' | 'type'>): number {
  let m = 1 - clamp(fin(s.scandal), 0, 100) / 250
  if (fin(s.type[p.type]) >= 50) m *= 1.2
  const open = (key: string): boolean => (s.cool[key] ?? -1) >= year
  if (open('fee.up')) m *= 1.1
  if (open('fee.down')) m *= 0.7
  if (open('fee.wait')) m *= 0.75
  if (p.kind === 'film' && open('fee.film')) m *= 1.1
  if (fin(s.cool[`franchise.${p.type}`]) > 0) m *= 1.5
  return m
}

/** A lead with star 45 or more gets 2% of the back-end, a supporting role at star 60 gets 0.5%, films only. */
function standardPoints(s: ActorState, role: Role, kind: 'film' | 'tv'): number {
  if (kind !== 'film') return 0
  if (role === 'Lead' && s.standing >= 45) return 0.02
  if (role === 'Supporting' && s.standing >= 60) return 0.005
  return 0
}

interface Base { fee: number; points: number; exclusive: boolean; forced: boolean; kind: 'film' | 'tv'; type: TypeId; industry: IndustryId; budget: BudgetId; scale: number }

/** The terms a listing carries for this actor today: one function for the landing, the contract choice and the hints. */
function baseTerms(g: GameState, s: ActorState, l: Listing, role: Role): Base {
  const kind = l.kind === 'tv' ? 'tv' : 'film'
  const type = TYPE_OF[l.genre] ?? 'drama'
  const industry = industryOf(g)
  const scale = scaleOf(g, industry)
  const forced = studioYear(industry, g.year)
  let fee = fin(l.pay)
  if (s.team.agent) fee *= 1 + fin(s.team.agent.quality) / 400
  fee *= feeMult(s, g.year, { kind, type })
  if (forced) fee *= 0.7
  return {
    fee: clamp(Math.round(fee), 0, FEE_MAX * scale),
    points: forced ? 0 : standardPoints(s, role, kind),
    exclusive: forced && role !== 'Extra',
    forced,
    kind,
    type,
    industry,
    budget: budgetOf(l),
    scale,
  }
}

/** The terms an option changes the offer into (for push, the terms when they give ground). */
function optionTerms(base: Terms, option: ContractChoice, kind: 'film' | 'tv', scale: number): Terms {
  const feeOf = (mult: number): number => clamp(Math.round(base.fee * mult), 0, FEE_MAX * scale)
  switch (option) {
    case 'points':
      return kind === 'film' ? { fee: feeOf(0.8), points: roundTo(Math.min(POINTS_MAX, Math.max(0.01, base.points) * 2.5), 0.0001), exclusive: base.exclusive } : { ...base }
    case 'exclusive':
      return { fee: feeOf(1.2), points: base.points, exclusive: true }
    case 'push':
      return { fee: feeOf(1.3), points: base.points, exclusive: base.exclusive }
    default:
      return { ...base }
  }
}

/** clamp(0.30 + star/250 + agentQ/300 + managerQ/500 + 0.06 x min(3, others), .10, .85): the odds the studio gives ground. */
export function pushOdds(s: ActorState, _l: Listing, others: number): number {
  const star = clamp(fin(s.standing), 0, 100)
  const p = 0.3 + star / 250 + fin(s.team.agent?.quality) / 300 + fin(s.team.manager?.quality) / 500 + 0.06 * Math.min(3, Math.max(0, fin(others)))
  return clamp(p, 0.1, 0.85)
}

/** How many other cached listings pay as much (0-3). Pure: a read of the cached audition list. */
function othersOf(g: GameState, l: Listing): number {
  const items = rec(g.flags['special.list.actor.roles']).items
  if (!Array.isArray(items)) return 0
  let n = 0
  for (const x of items) {
    const r = rec(x)
    if (r.title !== l.title && fin(r.pay) >= fin(l.pay)) n++
  }
  return Math.min(3, n)
}

/** A project built from a listing. The id is the caller's: a draft for a hint uses a placeholder. */
function draftProj(g: GameState, l: Listing, role: Role, t: Base, id: string, stage: Proj['stage']): Proj {
  const r = seeded(`${familySeed(g)}|director|actor|${id}|${g.year}`)
  return {
    id,
    title: txt(l.title, 48) || 'Untitled',
    kind: t.kind,
    genre: txt(l.genre, 30) || 'Drama',
    type: t.type,
    role,
    studio: txt(l.studio, 60) || 'Independent Studio',
    studioId: studioIdOf(g, t.kind, l.studio),
    industry: t.industry,
    budget: t.budget,
    terms: { fee: t.fee, points: t.points, exclusive: t.exclusive },
    stage,
    developed: 0,
    buzz: 0,
    campaign: 0,
    season: 1,
    director: r.int(40, 90),
    costars: [],
    window: 'normal',
    quality: 0,
    since: g.year,
    lastYear: g.year,
  }
}

/** The quality a typical shoot comes out at, before the luck of the cut. Used only to project gross. */
function typicalQuality(g: GameState, p: Proj): number {
  const b = BUDGETS[p.budget] ?? BUDGETS.indie
  return clamp(0.5 * actingSkill(g) + (hasTalent(g, 'Acting') ? 15 : 0) + b.qBase + 17.5 + (p.role === 'Extra' ? 10 : 0), 0, 100)
}

/**
 * What an option is worth to you on average: the net fee plus points x (projected gross less break-even),
 * less a quarter of the fee for the exclusive option; push weighs the raise against the offer that stands or
 * lapses. Projected on this year's heat and trend at median luck. A hint says "on average", never "will".
 */
export function contractEV(g: GameState, s: ActorState, l: Listing, option: ContractChoice): number {
  const role = l.role
  const t = baseTerms(g, s, l, role)
  const base: Terms = { fee: t.fee, points: t.points, exclusive: t.exclusive }
  const draft = draftProj(g, l, role, t, 'hint', 'offer')
  const gross = grossOf(g, { ...draft, quality: typicalQuality(g, draft) }, { luck: 1 })
  const over = Math.max(0, gross - breakEvenOf(draft, t.scale))
  const keep = 1 - cutRate(s)
  const net = (x: Terms): number => keep * (x.fee + (t.kind === 'film' ? Math.min(BACKEND_MAX * t.scale, x.points * over) : 0))
  switch (option) {
    case 'sign':
      return net(base)
    case 'points':
      return net(optionTerms(base, 'points', t.kind, t.scale))
    case 'exclusive':
      return net(optionTerms(base, 'exclusive', t.kind, t.scale)) - 0.25 * base.fee
    case 'push': {
      const p = pushOdds(s, l, othersOf(g, l))
      return p * net(optionTerms(base, 'push', t.kind, t.scale)) + (1 - p) * 0.65 * net(base)
    }
  }
}

// ---------------------------------------------------------------------------
// Money

/** Books one payment: the totals prove gross - cuts = net, and c.earn is the only way cash moves. */
function bank(c: CareerCtx<ActorState>, gross: number, cuts: number, label: string): number {
  const g = Math.round(fin(gross))
  const k = clamp(Math.round(fin(cuts)), 0, Math.max(0, g))
  if (g - k < 1) return 0
  const net = c.earn(label, g - k)
  if (net < 1) return 0
  const t = c.s.totals
  t.gross = Math.min(1e13, t.gross + net + k)
  t.cuts = Math.min(1e13, t.cuts + k)
  t.net = Math.min(1e13, t.net + net)
  return net
}

/** An outlay: c.pay, and the totals keep what you spent. False when short (nothing moves). */
function outlay(c: CareerCtx<ActorState>, label: string, amount: number): boolean {
  const n = Math.round(fin(amount))
  if (n < 1) return true
  if (!c.pay(label, n)) return false
  c.s.totals.spent = Math.min(1e13, c.s.totals.spent + n)
  return true
}

/** cuts = round(gross x min(.30, agent + manager)); the net pays through c.earn; the totals keep gross, cuts and net. Returns the net. */
export function payActor(c: CareerCtx<ActorState>, gross: number, label: string): number {
  const whole = Math.round(fin(gross))
  return bank(c, whole, Math.round(whole * cutRate(c.s)), label)
}

/** min(8,000,000 x scale, points x max(0, gross - breakEven)). */
export function backEnd(p: Proj, gross: number, scale: number): number {
  const over = Math.max(0, fin(gross) - breakEvenOf(p, scale))
  return Math.round(Math.min(BACKEND_MAX * fin(scale, 1), fin(p.terms.points) * over))
}

// ---------------------------------------------------------------------------
// The job follows the pipeline

/** job.salary is the sum of the fees of what is shooting; between roles the title goes back to Actor. */
function syncJob(g: GameState, s: ActorState): void {
  const job = actorJob(g)
  if (!job) return
  const live = s.pipeline.filter(isLive)
  job.salary = clamp(live.reduce((n, p) => n + p.terms.fee, 0), 0, 1e15)
  if (live.length === 0 && (job.title !== actorWord(g) || job.salary !== 0)) setRole(g, job, actorWord(g), 0, job.level)
}

function removeCostars(g: GameState, p: Proj): void {
  if (p.costars.length > 0) g.people = g.people.filter((x) => !(p.costars.includes(x.id) && x.relation === 'coworker'))
  p.costars = []
}

function drop(g: GameState, s: ActorState, p: Proj): void {
  removeCostars(g, p)
  s.pipeline = s.pipeline.filter((x) => x.id !== p.id)
}

// ---------------------------------------------------------------------------
// Landing

/**
 * The one place a role becomes a project. Re-checks the audition and slot rules, takes the legacy record over,
 * hires at once, and for a lead or supporting part queues the contract choice (an extra, and any part in the
 * studio-system years, starts shooting on the offered terms). Null when the rules refuse.
 */
export function landProject(c: CareerCtx<ActorState>, l: Listing, role: Role): Proj | null {
  const { g, s } = c
  adoptLegacy(g, s)
  const kind = l.kind === 'tv' ? 'tv' : 'film'
  const why = auditionBlock(g, s) ?? slotBlock(s, { kind, role })
  if (why) {
    careerSay(c, 'Auditions', why, FILM)
    return null
  }
  const t = baseTerms(g, s, l, role)
  if (t.forced && role !== 'Extra' && s.pipeline.some((x) => x.role !== 'Extra' && isLive(x))) {
    careerSay(c, 'Auditions', "The studio wants you exclusive. Finish what you're shooting first.", FILM)
    return null
  }
  const franchise = fin(s.cool[`franchise.${t.type}`])
  if (franchise > 0) s.cool[`franchise.${t.type}`] = franchise - 1
  if (t.forced && s.studioFrom === 0) s.studioFrom = g.year
  const others = othersOf(g, l)
  const p = draftProj(g, l, role, t, nextId(s, 'p'), role === 'Extra' || t.forced ? 'shoot' : 'offer')

  const title = roleTitle(g, role, kind)
  let job = actorJob(g)
  let quit: string | null = null
  if (!job) {
    const hired = hire(g, { defId: 'actor', title, company: p.studio, salary: p.terms.fee, data: { project: null } })
    job = hired.job
    quit = hired.quit
  } else {
    job.company = p.studio
    setRole(g, job, title, p.terms.fee, role === 'Lead' ? 2 : role === 'Supporting' ? 1 : 0)
  }
  if (role !== 'Extra') {
    const n = randInt(g, 1, 2)
    for (let i = 0; i < n; i++) {
      const person = addColleague(g, p.studio, chance(g, 0.5) ? 'Actor' : 'Actress', { ageOffset: [-12, 15], relationship: randInt(g, 35, 65) })
      person.occupation = person.gender === 'female' ? 'Actress' : 'Actor'
      // The colleague's savings are rolled once, here; the books take the change from the pool of luck, so the account opens at that difference.
      personCash(g, person, randInt(g, 50, 5_000) * 1_000 - person.money, 'luck')
      if (chance(g, 0.35)) person.traits = ['arrogant', ...person.traits].slice(0, 3)
      person.data.costarOf = p.title
      p.costars.push(person.id)
    }
  }
  s.pipeline = cap([...s.pipeline, p], PIPELINE_MAX)
  s.dry = 0
  dropList(g, 'actor.roles')
  addStat(g, 'happiness', role === 'Lead' ? 15 : 8)
  if (role !== 'Extra') addFame(g, role === 'Lead' ? 3 : 1)
  if (l.genre === 'Animated' && role === 'Extra') g.flags['special.actor.zombie'] = true
  careerLog(c, `I was cast as ${roleWord(role)} in "${p.title}".`, 'good')
  rememberLife(g, `Cast in "${p.title}" (${p.genre}, ${role.toLowerCase()} role).`)
  if (quit) careerLog(c, `I quit my job as ${article(quit)} ${quit}.`)
  careerSay(c, 'You Got the Part!', `You were cast as ${roleWord(role)} in "${p.title}" for ${p.studio}.`, kind === 'film' ? FILM : TV, 'good')
  if (p.stage === 'offer' && !offerContract(c, p, l, others)) p.stage = 'shoot' // no room for a choice: signed as offered
  syncJob(g, s)
  return p
}

const CONTRACT_OPTIONS: readonly { id: ContractChoice; label: string; emoji: string }[] = [
  { id: 'sign', label: 'Sign as offered', emoji: '\u{270D}\u{FE0F}' },
  { id: 'points', label: 'Take points, lower fee', emoji: '\u{1F4C8}' },
  { id: 'exclusive', label: 'Sign exclusive', emoji: '\u{1F512}' },
  { id: 'push', label: 'Push for more', emoji: '\u{1F4AA}' },
]

/** True when an option can be taken for this offer. */
function allowed(s: ActorState, p: Proj, option: ContractChoice): boolean {
  if (option === 'points') return p.kind === 'film'
  if (option === 'exclusive') return !s.pipeline.some((x) => x.id !== p.id && x.role !== 'Extra' && isLive(x))
  return true
}

function offerContract(c: CareerCtx<ActorState>, p: Proj, l: Listing, others: number): boolean {
  const { g, s } = c
  const options = CONTRACT_OPTIONS.filter((o) => allowed(s, p, o.id))
  let best = options[0]
  let top = -Infinity
  for (const o of options) {
    const v = contractEV(g, s, l, o.id)
    if (v > top) {
      top = v
      best = o
    }
  }
  const choices: ChoiceOption[] = options.map((o) => ({ id: o.id, label: o.label, emoji: o.emoji, ...(o === best ? honest(g, 'Acting', 'Looks best on average.') : {}) }))
  const per = p.kind === 'tv' ? ' a season' : ''
  return offerChoice(c, CONTRACT_SCRIPT, `Contract: ${p.title}`, `${p.studio} offers ${money(p.terms.fee)}${per} for "${p.title}". What will you do?`, choices, { id: p.id, others }, '\u{270D}\u{FE0F}')
}

const OPTION_IDS: readonly string[] = CONTRACT_OPTIONS.map((o) => o.id)

defineScript(CONTRACT_SCRIPT, (g, choice, data) => {
  if (!actorStore.has(g) || !OPTION_IDS.includes(choice)) return
  const s = actorStore.mut(g)
  const d = rec(data)
  const id = txt(d.id, 24)
  if (!claimChoice(g, s, data, `contract.${id}`)) return
  const p = s.pipeline.find((x) => x.id === id && x.stage === 'offer')
  if (!p) return
  const c = careerCtx(g, 'actor', s)
  const scale = scaleOf(g, p.industry)
  const option: ContractChoice = allowed(s, p, choice as ContractChoice) ? (choice as ContractChoice) : 'sign'
  let text: string
  let tone: Tone = 'neutral'
  if (option === 'push') {
    const asListing: Listing = { title: p.title, kind: p.kind, genre: p.genre, role: p.role, studio: p.studio, pay: p.terms.fee, budget: p.budget }
    if (chance(g, pushOdds(s, asListing, int(d.others, 0, 0, 3)))) {
      p.terms = optionTerms(p.terms, 'push', p.kind, scale)
      text = `They gave ground. You signed for ${money(p.terms.fee)}.`
      tone = 'good'
    } else if (chance(g, 0.35)) {
      drop(g, s, p)
      syncJob(g, s)
      careerLog(c, `The offer for "${p.title}" fell through.`, 'bad')
      careerSay(c, 'Contract', `The studio walked away. "${p.title}" went to someone else.`, '\u{270D}\u{FE0F}', 'bad')
      return
    } else {
      text = `They held firm. You signed as offered for ${money(p.terms.fee)}.`
    }
  } else {
    p.terms = optionTerms(p.terms, option, p.kind, scale)
    text =
      option === 'points'
        ? `You took ${Math.round(p.terms.points * 1000) / 10}% of the back-end and a fee of ${money(p.terms.fee)}.`
        : option === 'exclusive'
          ? `You signed an exclusive deal for ${money(p.terms.fee)}.`
          : `You signed for ${money(p.terms.fee)}.`
  }
  p.stage = 'shoot'
  syncJob(g, s)
  careerSay(c, 'Contract', text, '\u{270D}\u{FE0F}', tone)
})

// ---------------------------------------------------------------------------
// Wrap, release, renew

/** Mean co-star relationship over 20, 0-5. */
function chemistry(g: GameState, p: Proj): number {
  const people = p.costars.map((id) => getPerson(g, id)).filter((x) => !!x && x.alive)
  if (!people.length) return 0
  return clamp(Math.round(people.reduce((n, x) => n + fin(x!.relationship), 0) / people.length / 20), 0, 5)
}

/** +3 in the type you're typecast in, -5 in any other type while you're typecast in one. */
function typeFit(s: ActorState, type: TypeId): number {
  if (fin(s.type[type]) >= 50) return 3
  return TYPE_IDS.some((x) => x !== type && fin(s.type[x]) >= 50) ? -5 : 0
}

/**
 * The shoot ends: quality is fixed, the fee pays through payActor, and the project goes to post (studio and
 * blockbuster films, for a year) or is released in the same tick (indie films, every TV season, every extra).
 */
export function wrapShoot(c: CareerCtx<ActorState>, p: Proj): void {
  const { g, s } = c
  const t = tickOf(c)
  if (t.concurrent === null) t.concurrent = s.pipeline.filter((x) => x.stage === 'shoot' && x.role !== 'Extra' && x.lastYear < g.year).length
  t.wrapped += 1
  const extra = p.role === 'Extra'
  const talent = hasTalent(g, 'Acting')
  const b = BUDGETS[p.budget] ?? BUDGETS.indie
  const crowded = extra ? 0 : 8 * Math.max(0, t.concurrent - 1)
  p.quality = clamp100(actingSkill(g) * 0.5 + (talent ? 15 : 0) + p.developed + b.qBase + (p.director - 65) / 6 + chemistry(g, p) + typeFit(s, p.type) - crowded + randInt(g, 0, 35) + (extra ? 10 : 0))
  // on-set experience: every shoot teaches you something, a natural soaks up far more
  const learned = talent ? (extra ? randInt(g, 1, 2) : randInt(g, 2, 4)) : extra ? 0 : 1
  if (learned > 0) setFlagSkill(g, 'acting', actingSkill(g) + learned)
  if (t.concurrent >= 2 && !extra && !t.crowded) {
    t.crowded = true
    addStat(g, 'happiness', -3)
  }
  payActor(c, p.terms.fee, p.studio)
  if (!extra && p.kind === 'film' && (p.budget === 'studio' || p.budget === 'blockbuster')) {
    p.stage = 'post'
    p.lastYear = g.year
    return
  }
  if (p.kind === 'film') releaseFilm(c, p)
  else seasonTv(c, p)
}

const verdictOf = (popularity: number, kind: 'film' | 'tv'): string =>
  popularity >= 85 ? (kind === 'film' ? 'a smash hit' : 'a cultural phenomenon') : popularity >= 65 ? (kind === 'film' ? 'a box office success' : 'a hit') : popularity >= 45 ? 'a modest success' : popularity >= 25 ? 'a flop' : 'a critical disaster'

/** 50 + 28 ln(gross / breakEven), 0-100. */
const popularityOf = (gross: number, breakEven: number): number => (breakEven > 0 ? clamp100(50 + 28 * Math.log(Math.max(1, gross) / breakEven)) : 0)

interface Outcome { gross: number; popularity: number; backend: number }

/** What every release does: fame, reputation, typecast, the credit row, the residual, the log line. Returns the credit. */
function finishRelease(c: CareerCtx<ActorState>, p: Proj, o: Outcome): Credit {
  const { g, s } = c
  const extra = p.role === 'Extra'
  const pop = o.popularity
  const verdict = verdictOf(pop, p.kind)
  const gain = extra ? (pop >= 55 ? 1 : 0) : p.role === 'Supporting' ? 1 + Math.round(pop / 30) : 3 + Math.round(pop / 14)
  addFame(g, gain + (hasTalent(g, 'Acting') && !extra ? 1 : 0))
  s.rep = clamp100(s.rep + (p.quality - 50) / 8)
  if (!extra) {
    for (const type of TYPE_IDS) {
      const step = type === p.type ? (p.role === 'Lead' ? 10 : 5) : -3
      s.type[type] = clamp(fin(s.type[type]) + step, 0, 100)
    }
  }
  if (p.role === 'Lead' && fameOf(g) >= 70) fameToward(g, 90, 2)
  count(g, 'movies')
  const residual = extra ? 0 : Math.round(p.terms.fee * 0.03 * (pop / 50))
  const cid = `c-${p.id}`
  let credit = s.credits.find((x) => x.id === cid) ?? (p.kind === 'tv' && p.season > 1 ? s.credits.find((x) => x.kind === 'tv' && x.title === p.title) : undefined)
  if (credit) {
    credit.seasons = p.season
    credit.pay = Math.min(MONEY_MAX, credit.pay + p.terms.fee)
    credit.quality = Math.max(credit.quality, p.quality)
    credit.popularity = pop
    credit.verdict = verdict
    credit.residual = Math.min(MONEY_MAX, credit.residual + residual)
    credit.gross = Math.min(1e13, credit.gross + o.gross)
    credit.backend = Math.min(MONEY_MAX, credit.backend + o.backend)
  } else {
    credit = {
      id: cid,
      title: p.title,
      kind: p.kind,
      role: p.role,
      genre: p.genre,
      type: p.type,
      industry: p.industry,
      studio: p.studio,
      year: g.year,
      age: g.character.age,
      pay: p.terms.fee,
      quality: p.quality,
      popularity: pop,
      gross: o.gross,
      backend: o.backend,
      seasons: p.season,
      verdict,
      residual,
      trust: false,
    }
    s.credits = cap([...s.credits, credit], 64)
  }
  if (p.genre === 'Bollywood' && p.role === 'Lead') g.flags['special.actor.bollywood'] = true
  if (p.genre === 'Telenovela' && p.season >= 3) g.flags['special.actor.telenovela'] = true
  if (pop < 25 && !extra) g.flags['special.actor.critics'] = true
  careerLog(c, p.kind === 'film' ? `My film "${p.title}" was ${verdict}.` : `Season ${p.season} of "${p.title}" aired. It was ${verdict}.`, pop >= 45 ? 'good' : 'bad')
  const t = tickOf(c)
  t.released += 1
  t.releases.push({ credit: { ...credit }, budget: p.budget, campaign: p.campaign, window: p.window, studioFame: studioFameOf(g, p) })
  if (!t.best || pop > t.best.popularity) t.best = { title: p.title, verdict, popularity: pop }
  return credit
}

/**
 * A film opens. The one g.rng draw is the luck, 0.6-1.5; gross is `grossOf`, popularity 50 + 28 ln(gross/breakEven),
 * and the back-end above break-even pays through payActor. An extra has no gross.
 */
export function releaseFilm(c: CareerCtx<ActorState>, p: Proj): void {
  const { g } = c
  let gross = 0
  let popularity: number
  let backend = 0
  if (p.role === 'Extra') popularity = clamp100(p.quality * 0.6 + fameOf(g) * 0.2)
  else {
    gross = Math.round(grossOf(g, p, { luck: randFloat(g, 0.6, 1.5) }))
    const scale = scaleOf(g, p.industry)
    popularity = popularityOf(gross, breakEvenOf(p, scale))
    backend = backEnd(p, gross, scale)
    if (backend >= 1) payActor(c, backend, p.studio)
  }
  finishRelease(c, p, { gross, popularity, backend })
  drop(g, c.s, p)
}

/**
 * A TV season airs: gross and popularity as for a film (break-even 1.5 x cost), then it renews at
 * min(.92, .35 + pop/150) with the fee x (1.1 + pop/500), or ends. Popularity 45 or more and a season before nine.
 */
export function seasonTv(c: CareerCtx<ActorState>, p: Proj): void {
  const { g, s } = c
  let gross = 0
  let popularity: number
  if (p.role === 'Extra') popularity = clamp100(p.quality * 0.6 + fameOf(g) * 0.2)
  else {
    gross = Math.round(grossOf(g, p, { luck: randFloat(g, 0.6, 1.5) }))
    popularity = popularityOf(gross, breakEvenOf(p, scaleOf(g, p.industry)))
  }
  finishRelease(c, p, { gross, popularity, backend: 0 })
  if (popularity >= 45 && p.season < 9 && chance(g, Math.min(0.92, 0.35 + popularity / 150))) {
    p.season += 1
    p.terms = { ...p.terms, fee: clamp(Math.round(p.terms.fee * (1.1 + popularity / 500)), 0, FEE_MAX * scaleOf(g, p.industry)) }
    p.stage = 'shoot'
    p.lastYear = g.year
    p.developed = Math.round(p.developed / 2)
    p.buzz = 0
    p.campaign = 0
    p.window = 'normal'
    p.quality = 0
    careerLog(c, `"${p.title}" was renewed for season ${p.season}.`, 'good')
  } else drop(g, s, p)
}

// ---------------------------------------------------------------------------
// Levers on one project (called by the menus; every gate is inside)

const refuse = (c: CareerCtx<ActorState>, title: string, text: string): void => void careerSay(c, title, text, FILM)

function projectOf(c: CareerCtx<ActorState>, id: string, title: string, stages: readonly Proj['stage'][] = ['shoot']): Proj | null {
  const p = c.s.pipeline.find((x) => x.id === id) ?? null
  if (!p || !stages.includes(p.stage)) {
    refuse(c, title, "That project isn't in a state for this.")
    return null
  }
  return p
}

/** Once a year per project: +8-15 developed, plus the manager's quality/12 for free. */
export function developProject(c: CareerCtx<ActorState>, id: string): void {
  const { g, s } = c
  const p = projectOf(c, id, 'Develop Character')
  if (!p) return
  if (!useYearAction(g, `actor.develop.${id}`, 1)) return refuse(c, 'Develop Character', "You've already worked on this character this year.")
  const free = Math.round(fin(s.team.manager?.quality) / 12)
  p.developed = Math.min(100, p.developed + randInt(g, 8, 15) + free)
  const job = actorJob(g)
  if (job) job.performance = clamp100(job.performance + 8)
  careerLog(c, `I prepared hard for my role in "${p.title}".`)
  careerSay(c, 'Develop Character', `You put in the work on "${p.title}". The director noticed.`, '\u{1F9E0}', 'good')
}

/** Once a year per project: dinner with a co-star, and a little buzz when it goes well. */
export function hireCostars(c: CareerCtx<ActorState>, id: string): void {
  const { g } = c
  const p = projectOf(c, id, 'Co-Stars')
  if (!p) return
  const people = p.costars.map((x) => getPerson(g, x)).filter((x): x is NonNullable<typeof x> => !!x && x.alive)
  if (!people.length) return refuse(c, 'Co-Stars', 'Your co-stars are busy running lines without you.')
  if (!useYearAction(g, `actor.costars.${id}`, 1)) return refuse(c, 'Co-Stars', 'Your co-stars are busy running lines without you.')
  const co = people[randInt(g, 0, people.length - 1)]
  const conceited = co.traits.includes('arrogant') || co.traits.includes('manipulative')
  if (conceited && chance(g, 0.6)) {
    addRelationship(g, co, -randInt(g, 5, 15))
    addStat(g, 'happiness', -4)
    careerLog(c, `I hung out with my co-star ${co.firstName}. It went badly.`, 'bad')
    careerSay(c, 'Co-Stars', `${fullName(co)} spent the evening talking about their trailer.`, '\u{1F465}', 'bad')
    return
  }
  addRelationship(g, co, randInt(g, 8, 18))
  p.buzz = Math.min(100, p.buzz + 3)
  addStat(g, 'happiness', 5)
  careerLog(c, `I hung out with my co-star ${co.firstName}.`)
  careerSay(c, 'Co-Stars', `You and ${fullName(co)} grabbed dinner after shooting. The chemistry shows.`, '\u{1F465}', 'good')
}

/** 4% of the fee, buzz +6, twice a year per project. A short purse refuses and nothing moves. */
export function pressTour(c: CareerCtx<ActorState>, id: string): void {
  const { g } = c
  const p = projectOf(c, id, 'Press Tour', ['shoot', 'post'])
  if (!p) return
  const key = `actor.press.${id}`
  if (yearActionsUsed(g, key) >= 2) return refuse(c, 'Press Tour', 'The studio says the press has seen enough of you this year.')
  if (!outlay(c, 'Press tour', Math.max(1, p.terms.fee * 0.04))) return refuse(c, 'Press Tour', "You can't afford the tour right now.")
  useYearAction(g, key, 2)
  p.buzz = Math.min(100, p.buzz + 6)
  careerLog(c, `I went on a press tour for "${p.title}".`)
  careerSay(c, 'Press Tour', `The tour for "${p.title}" put your face on a lot of mornings.`, '\u{1F4E2}', 'good')
}

/** Post only: an awards window (gross x0.92, odds +0.08) or a dodge (gross x0.95, no clash). Free. */
export function setWindow(c: CareerCtx<ActorState>, id: string, w: 'awards' | 'dodge'): void {
  const p = projectOf(c, id, 'Release Date', ['post'])
  if (!p) return
  p.window = w
  careerSay(c, 'Release Date', w === 'awards' ? `"${p.title}" opens in the awards window.` : `"${p.title}" moves to dodge the big opening.`, '\u{1F4C5}')
}

/** 5% of last year's net (at least 1,000 x scale), campaign +10, once per project. */
export function awardsCampaign(c: CareerCtx<ActorState>, id: string): void {
  const { g, s } = c
  const p = projectOf(c, id, 'Awards Campaign', ['shoot', 'post'])
  if (!p) return
  if (p.campaign >= 10) return refuse(c, 'Awards Campaign', "You've already campaigned for this one.")
  const cost = Math.max(1_000 * scaleOf(g, p.industry), lastNet(s) * 0.05)
  if (!outlay(c, 'Awards campaign', cost)) return refuse(c, 'Awards Campaign', "You can't afford a campaign right now.")
  p.campaign = Math.min(30, p.campaign + 10)
  careerLog(c, `I ran an awards campaign for "${p.title}".`)
  careerSay(c, 'Awards Campaign', `Your campaign for "${p.title}" reached the voters.`, '\u{1F3C6}', 'good')
}

/** Leave a project: reputation -15, the co-stars go home. */
export function walkAway(c: CareerCtx<ActorState>, id: string): void {
  const { g, s } = c
  const p = projectOf(c, id, 'Walk Away', ['offer', 'shoot', 'post'])
  if (!p) return
  s.rep = clamp100(s.rep - 15)
  drop(g, s, p)
  syncJob(g, s)
  careerLog(c, `I walked away from "${p.title}".`, 'bad')
  careerSay(c, 'Walk Away', `You walked off "${p.title}". Word travels fast in this business.`, '\u{1F6AA}', 'bad')
}

// ---------------------------------------------------------------------------
// The yearly steps

/** Each credit not held in a trust pays its residual, then it decays by 0.75 + 0.12 x streaming; under 25 it zeroes. */
export function stepResiduals(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const decay = 0.75 + 0.12 * techOdds(g, 'streaming')
  let total = 0
  for (const cr of s.credits) {
    if (cr.trust) continue
    if (cr.residual >= 25) {
      total += cr.residual
      const next = Math.round(cr.residual * decay)
      cr.residual = next < 25 ? 0 : next
    } else cr.residual = 0
  }
  if (total >= 1 && bank(c, total, 0, 'Residuals') > 0) careerLog(c, `I received ${money(total)} in residuals.`)
}

/** Wrap or release every project whose year has come, in id order. An unanswered offer signs as offered. */
export function stepWrap(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  for (const p of [...s.pipeline].sort(byId)) {
    if (p.lastYear >= g.year) continue
    if (p.stage === 'offer') p.stage = 'shoot'
    if (p.stage === 'shoot') wrapShoot(c, p)
    else if (p.stage === 'post') releaseFilm(c, p)
  }
}

/**
 * The job is gone (quit, or another career took it): unfinished shoots and offers are dropped unpaid, and a film
 * already in post still opens, since its fee was paid at the wrap.
 */
export function stepOrphans(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  for (const p of [...s.pipeline].sort(byId)) {
    if (p.stage !== 'post') drop(g, s, p)
    else if (p.lastYear < g.year) releaseFilm(c, p)
  }
}

/** A year with no wrap and no release: dry +1 (for an actor who has worked), fame falls, the studio retainer; scandal fades. */
export function stepDry(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const t = tickOf(c)
  if (t.wrapped + t.released > 0) s.dry = 0
  else if (s.credits.length > 0) {
    s.dry = Math.min(100, s.dry + 1)
    if (fameOf(g) > 10) addFame(g, -randInt(g, 1, 3))
    const industry = industryOf(g)
    if (studioYear(industry, g.year) && s.studioFrom > 0 && g.year - s.studioFrom < RETAINER_YEARS) {
      const last = [...s.credits].reverse().find((x) => x.pay > 0)
      if (last) payActor(c, Math.round(last.pay * 0.4), 'Studio retainer')
    }
  }
  if (s.scandal >= 75) addFame(g, -2)
  else if (s.scandal >= 50) addFame(g, -1)
  if (s.scandal > 0) s.scandal = Math.max(0, s.scandal - ((s.team.press?.quality ?? 0) >= 60 ? 18 : 10))
}

/** The prize for a release: Viewers Choice for streaming from 2013, else the industry's own for the kind; none when there is no row. */
const awardOf = (r: Release, year: number): AwardDef | null => {
  if (r.budget === 'streaming' && year >= 2013) return AWARD_DEFS.find((d) => d.id === 'viewers-choice') ?? null
  return AWARD_DEFS.find((d) => d.industry === r.credit.industry && d.kind === r.credit.kind && d.from <= year) ?? null
}

/**
 * The best release of the year with quality 70+ and popularity 55+ is nominated at 0.4 + campaign/100 (when a
 * prize exists for its industry, kind and year); the win is `awardOdds`. The top rival of the type is named.
 */
export function stepAwards(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const t = tickOf(c)
  const best = t.releases
    .filter((r) => r.credit.role !== 'Extra' && r.credit.quality >= 70 && r.credit.popularity >= 55)
    .sort((a, b) => b.credit.popularity - a.credit.popularity)[0]
  if (!best) return
  const credit = best.credit
  const def = awardOf(best, g.year)
  if (!def || !chance(g, clamp(0.4 + best.campaign / 100, 0, 1))) return
  s.noms = Math.min(1e6, s.noms + 1)
  const rival = activeField(g, ACTOR_SPEC, s.memory).filter((x) => x.rival.edge === credit.type)[0]?.rival
  const category = credit.role === 'Lead' ? `Best ${actorWord(g)}` : `Best Supporting ${actorWord(g)}`
  const award = `${category} at the ${def.name}`
  const odds = awardOdds(g, s, { quality: credit.quality, popularity: credit.popularity, campaign: best.campaign, window: best.window, studioFame: best.studioFame, type: credit.type })
  if (chance(g, odds)) {
    s.awards = cap([...s.awards, txt(`${award}, "${credit.title}" (age ${g.character.age})`, 120)], 40)
    count(g, 'awards')
    addFame(g, randInt(g, 5, 9))
    addStat(g, 'happiness', 20)
    s.rep = clamp100(s.rep + 10)
    if (rival) s.memory = noteRival(s.memory, rival, g.year, { met: 1, won: 1, grudge: 15 })
    careerLog(c, `I won ${award} for "${credit.title}".`, 'good')
    rememberLife(g, `Won ${award} for "${credit.title}".`)
    careerSay(c, 'And the Winner Is...', rival ? `You won ${award} for "${credit.title}". ${rival.name} was nominated too.` : `You won ${award} for "${credit.title}".`, '\u{1F3C6}', 'good')
    offerChoice(c, 'special.actor.speech', 'And the Winner Is...', `You won ${award}. The room waits for your speech. What will you do?`, SPEECH, {}, '\u{1F3C6}')
    return
  }
  addFame(g, 2)
  if (rival) s.memory = noteRival(s.memory, rival, g.year, { met: 1, lost: 1 })
  careerLog(c, `I was nominated for ${award} for "${credit.title}".`, 'good')
  careerSay(c, 'Nominated', rival ? `You were nominated for ${award}. ${rival.name} took it home.` : `You were nominated for ${award}, but lost.`, '\u{1F3C6}', 'neutral')
}

const SPEECH: ChoiceOption[] = [
  { id: 'family', label: 'Thank your family', emoji: '\u{1F46A}' },
  { id: 'agent', label: 'Thank your agent', emoji: '\u{1F574}\u{FE0F}' },
  { id: 'political', label: 'Make a political statement', emoji: '\u{1F4E2}' },
  { id: 'forget', label: 'Freeze up', emoji: '\u{1F976}' },
  { id: 'played', label: 'Ramble until the music plays', emoji: '\u{1F3BB}' },
]

/**
 * Closes the year: standing = star power, the job follows the pipeline, the caps hold, and one "Year in Film"
 * notice says what happened (nothing when nothing did). Returns the report note.
 */
export function closeYear(c: CareerCtx<ActorState>): string {
  const { g, s } = c
  s.standing = starPower(g, s)
  s.pipeline = cap(s.pipeline, PIPELINE_MAX)
  s.credits = cap(s.credits, 64)
  s.awards = cap(s.awards, 40)
  syncJob(g, s)
  const t = tickOf(c)
  const earned = ledgerOf(c).earned
  if (t.best) {
    const top = t.best
    careerSay(c, 'Year in Film', `"${top.title}" was ${top.verdict}. You earned ${money(earned)} this year.`, FILM)
    return fit(`"${top.title}" was ${top.verdict}.`, 90)
  }
  if (earned > 0) {
    careerSay(c, 'Year in Film', `You earned ${money(earned)} this year.`, FILM)
    return `Earned ${money(earned)}.`
  }
  return ''
}
