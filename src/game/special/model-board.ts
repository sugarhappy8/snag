// Model 2.0 board: the Season Board (castings built from the year, the country and the registry brands, never g.rng),
// the cast roll, direction, rest, portfolio shoots, sabotage and the menu rows. The board is derived on demand
// (seeded, pure) until the first cast of the year writes it once; an offer's `brand` is a registry brand id ('' for a
// fictional house) and `house` is the name a menu prints. Every cash move goes through c.pay; menus read `view` only.
// Imports from model.ts are used inside function bodies only.
import { seeded } from '../assets'
import type { BrandTier } from '../data/brands'
import { brandById, brandName } from '../data/brands'
import { addHidden, addStat, count, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { priceLevel } from '../activities/common'
import { eraOf } from '../history/timeline'
import { nameFitsYear } from '../history/events-people'
import { luxuryLevel } from '../nation/effects'
import { chance, randInt } from '../rng'
import { defineScript } from '../scripts'
import { streamBrand } from '../shops/everyday-brands'
import { hasTalent } from '../talents'
import { outcomeTag } from '../timeMachine'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { namePoolOf } from '../world'
import { addFame, blocked, bump, leave, money, ownerKey } from './common'
import { honest, oddsText } from './kit/crisis'
import { gatedAction, standingMenu } from './kit/menu'
import { activeField, noteRival } from './kit/rivals'
import { cap, int, rec } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, fit, type CareerCtx } from './kit/year'
import { PHOTOGRAPHERS, modelJob } from './model'
import { agencyRows, motherPct } from './model-agency'
import { MODEL_SPEC, castPlan, lookValue, marketFactor, scoreOf } from './model-core'
import { BRAND_TIERS, CIRCUITS, FOCUS, FOCUSES, KINDS, KIND_IDS, SEASON_CAP, TIER_FEE, TIER_REQ, circuitsAt, housePool, kindLabel, kindOpen, tierIndex } from './model-data'
import { modelStore, payOut, readContract, type Focus, type Kind, type MdOffer, type ModelState, type Season } from './model-state'
import { totalFollowers } from './social'

export const SABOTAGE_SCRIPT = 'career.model.sabotage'
/** What an abroad show or couture week costs to get to. */
export const ABROAD_COST = 1_800
const BOARD_SIZE = 8
const WAR_CUT = 2
/** Fees at your home circuit run 10% higher. */
const HOME_FEE = 1.1
const SHOOT_ONCE = 'model.shoot'
const PLAN_COST = 1_500
const LINE = 90

const BOARD = '\u{1F4C5}'
const SHOW = '\u{1F460}'
const EXIT = '\u{1F6AA}'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const round1 = (n: number): number => Math.round(n * 10) / 10
const info = (id: string, text: string): MenuInfo => ({ type: 'info', id, text: fit(text, LINE) })
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const SEASON_LABEL: Record<Season, string> = { couture: 'couture', aw: 'autumn', ss: 'spring', year: 'year-round' }
const KIND_EMOJI: Record<Kind, string> = { catalogue: '\u{1F4D2}', commercial: '\u{1F4FA}', digital: '\u{1F4F1}', editorial: '\u{1F4F0}', cover: '\u{1F4F8}', runway: SHOW, couture: '\u{1F457}', campaign: '\u{1F48E}', face: '\u{2728}' }
/** Unsigned models work the open-call kinds; the rest book through an agency. */
const UNSIGNED_KINDS: readonly Kind[] = ['catalogue', 'commercial', 'digital', 'editorial']
const KIND_WEIGHT: Record<Kind, number> = { catalogue: 1.3, commercial: 1.1, digital: 1, editorial: 1.2, cover: 0.6, runway: 1.2, couture: 0.7, campaign: 0.8, face: 0.5 }

type Spec = Omit<Parameters<typeof gatedAction<ModelState>>[0], 'career' | 'store'>

function row(spec: Spec, visible?: (g: GameState) => boolean): MenuAction {
  return { ...gatedAction<ModelState>({ career: 'model', store: modelStore, ...spec }), ...(visible ? { visible } : {}) }
}

// ---------------------------------------------------------------------------
// Meters

/** One book point's worth: each point takes (100 - book) x min(0.5, points / 100). */
export function gainBook(book: number, points: number): number {
  const b = clamp(fin(book), 0, 100)
  return clamp(b + (100 - b) * Math.min(0.5, Math.max(0, fin(points)) / 100), 0, 100)
}

/**
 * A freelance gig the legacy script booked. With a sim record it is paid through the ledger and is worth one book
 * point (true); with none the legacy script pays it itself (false).
 */
export function bookFreelance(g: GameState, name: string, pay: number): boolean {
  if (!modelStore.has(g)) return false
  const s = modelStore.mut(g)
  payOut(careerCtx(g, 'model', s), name, pay, { agency: 0, mother: 0, recoup: 0 })
  s.book = round1(gainBook(s.book, 1))
  return true
}

// ---------------------------------------------------------------------------
// The board

const hidden = (s: ModelState, id: string, year: number): boolean => (s.cool[`sab.${id}`] ?? -1) >= year

function feeOf(g: GameState, s: ModelState, kind: Kind, tier: number, days: number, home: boolean, jitter: number): number {
  const def = KINDS[kind]
  const f = FOCUS[s.focus] ?? FOCUS.editorial
  let mult = marketFactor(g) * f.fee * (def.light ? f.lightFee : 1)
  if (!def.show) mult *= priceLevel(g) // local work follows the local price level; international work does not
  if (home) mult *= HOME_FEE
  if (tier >= 3) mult *= Math.max(0.5, 1 - 0.04 * luxuryLevel(g))
  const fee = Math.round((def.fee * TIER_FEE[tier] * days * mult * jitter) / 50) * 50
  return clamp(fee, 50, 2_000_000)
}

/**
 * This year's castings, up to 8: seeded from the life, the year and the timeline (never g.rng), shaped by the era (kinds
 * and circuits that exist), the country (the home circuit pays 10% more), your direction and standing, and the registry
 * brands on sale where you live. The war years close the shows abroad and cut two offers; Paris couture still posts.
 * Pure: the same inputs give the same board.
 */
export function buildBoard(g: GameState, s: ModelState): MdOffer[] {
  const year = g.year
  const country = g.character.countryId
  const signed = !!modelJob(g)
  const war = ['wwi', 'wwii'].includes(eraOf(year).id)
  const circuits = circuitsAt(year).filter((c) => !c.couture)
  const weeks = war ? circuits.filter((c) => c.home === country) : circuits
  const followers = totalFollowers(g)
  const kinds = KIND_IDS.filter((k) => kindOpen(g, k, followers) && (signed || UNSIGNED_KINDS.includes(k)) && (k !== 'runway' || weeks.length > 0))
  if (kinds.length === 0) return []
  const r = seeded(`${g.lifeId}|board|model|${year}${outcomeTag(g, year)}`)
  const field = activeField(g, MODEL_SPEC, s.memory)
  const center = clamp(fin(s.standing) / 20, 0, 4)
  const size = war ? BOARD_SIZE - WAR_CUT : BOARD_SIZE
  const out: MdOffer[] = []
  const used = new Set<string>()
  for (let tries = 0; out.length < size && tries < size * 6; tries++) {
    const kind = r.weighted(kinds, (k) => KIND_WEIGHT[k] * (KINDS[k].niche === s.focus ? 1.6 : 1))
    const def = KINDS[kind]
    const tier = r.weighted([0, 1, 2, 3, 4], (t) => Math.max(0.15, 1.2 - 0.45 * Math.abs(t - center)))
    const season = r.pick(def.seasons)
    const days = r.int(def.days[0], def.days[1])
    let circuit = ''
    let abroad = false
    if (kind === 'couture') {
      circuit = 'paris-couture'
      abroad = CIRCUITS.find((c) => c.id === circuit)?.home !== country
    } else if (kind === 'runway') {
      const week = r.weighted(weeks, (c) => (c.home === country ? 3 : 1))
      circuit = week.id
      abroad = week.home !== country
    }
    // the client: a registry brand of the tier on sale here this year, else any tier, else a fictional house
    const brand = streamBrand(g, def.categories, r.next, { tiers: [BRAND_TIERS[tier] as BrandTier] }) ?? streamBrand(g, def.categories, r.next)
    const house = brand ? brand.name : r.pick(housePool(kind))
    const key = `${kind}|${brand?.id ?? house}`
    if (used.has(key)) continue
    used.add(key)
    const at = brand ? tierIndex(brand.tier) : tier
    const pool = field.filter((x) => x.rival.edge === def.niche && !hidden(s, x.rival.id, year))
    const rivals: string[] = []
    while (rivals.length < 2 && rivals.length < pool.length) {
      const next = r.pick(pool.filter((x) => !rivals.includes(x.rival.id)))
      rivals.push(next.rival.id)
    }
    out.push({
      id: `${year}-${out.length}`,
      kind,
      season,
      circuit,
      brand: brand?.id ?? '',
      house,
      fee: feeOf(g, s, kind, at, days, !abroad && !!circuit, 0.9 + 0.2 * r.next()),
      days,
      minLook: Math.round(0.55 * TIER_REQ[at]),
      minTitle: at,
      abroad,
      window: brand && kind === 'face' ? 2 : brand && kind === 'campaign' ? 1 : 0,
      rivals,
      status: 'open',
      terms: null,
    })
  }
  return out
}

/** The derived board of the last render, so the rows of one menu share one build. Keyed by the inputs the board reads. */
const derived = new WeakMap<GameState, { sig: string; items: MdOffer[] }>()

/** This year's castings: the stored board when it is this year's, else a freshly derived one (a copy). Pure. */
export function boardOf(g: GameState, s: ModelState): MdOffer[] {
  if (s.board.year === g.year) return s.board.items
  const sig = [
    g.lifeId,
    g.year,
    outcomeTag(g, g.year),
    g.character.countryId,
    modelJob(g) ? 1 : 0,
    s.focus,
    s.standing,
    s.memory.map((m) => `${m.id}:${m.grudge}`).join(','),
    Object.entries(s.cool)
      .filter(([k]) => k.startsWith('sab.'))
      .join(','),
    Math.round(totalFollowers(g)),
    marketFactor(g).toFixed(4),
    priceLevel(g).toFixed(3),
    luxuryLevel(g),
  ].join('|')
  const hit = derived.get(g)
  if (hit && hit.sig === sig) return structuredClone(hit.items)
  const items = buildBoard(g, s)
  derived.set(g, { sig, items })
  return structuredClone(items)
}

/** Castings you can take a year: 3 + floor(title / 2), +1 for a commercial direction, -2 after a rest season. */
export function slotCap(g: GameState, s: ModelState): number {
  const title = clamp(Math.round(fin(modelJob(g)?.level)), 0, 4)
  return Math.max(0, 3 + Math.floor(title / 2) + (FOCUS[s.focus] ?? FOCUS.editorial).slots - (s.restYear === g.year ? 2 : 0))
}

/** Castings taken so far this year: a lost casting still uses one. */
export const slotsUsed = (items: readonly MdOffer[]): number => items.filter((o) => o.status === 'booked' || o.status === 'lost').length

const daysUsed = (items: readonly MdOffer[], season: Season): number => items.filter((o) => o.status === 'booked' && o.season === season).reduce((n, o) => n + o.days, 0)

const categoryOf = (brand: string): string => brandById(brand)?.category ?? ''
const tripCost = (o: MdOffer): number => (o.abroad && (o.kind === 'runway' || o.kind === 'couture') ? ABROAD_COST : 0)

/**
 * Why you can't take this casting now, or null: prison, under 16, a closed offer, worn down (strain 95), couture with no
 * agency, an exclusivity window in the same category, a full season calendar, no castings left, a look under the client's
 * floor, or no cash for the trip. Pure; castOffer checks it again.
 */
export function castBlock(g: GameState, s: ModelState, o: MdOffer): string | null {
  const why = blocked(g, 16)
  if (why) return why
  if (o.status !== 'open') return 'That casting is closed.'
  if (s.strain >= 95) return "You're too worn down for more work."
  if (o.kind === 'couture' && !modelJob(g)) return 'Couture houses book through an agency.'
  const cat = categoryOf(o.brand)
  const win = cat ? s.windows.find((w) => w.until >= g.year && w.category === cat && w.brand !== o.brand) : undefined
  if (win) return `You're exclusive with ${brandName(win.brand)} until ${win.until}.`
  const items = boardOf(g, s)
  if (daysUsed(items, o.season) + o.days > SEASON_CAP[o.season]) return `The ${SEASON_LABEL[o.season]} calendar is full.`
  if (slotsUsed(items) >= slotCap(g, s)) return "You're out of castings this year."
  if (lookValue(g, s) < o.minLook) return "They want a stronger look than yours right now."
  const trip = tripCost(o)
  if (trip > 0 && g.character.money < trip) return `You can't cover the ${money(trip)} trip.`
  return null
}

const kindName = (g: GameState, o: MdOffer): string => kindLabel(g, o.kind).toLowerCase()

/** One result as a log line (first person) and a popup (second person), the popup only while the notice budget lasts. */
function report(c: CareerCtx<ModelState>, title: string, popup: string, line: string, emoji: string, tone: 'good' | 'bad' | 'neutral'): void {
  careerLog(c, line, tone === 'neutral' ? undefined : tone)
  if (c.budget.notices > 0) careerSay(c, title, popup, emoji, tone)
}

/**
 * Takes a casting: the gates again, the trip (c.pay, +6 strain), then one roll on the castPlan odds the hint printed.
 * A win books the offer with the terms snapshotted now (agency, commission, mother override) and opens an exclusivity
 * window when the client asks for one; a loss still uses the slot. Rivals remember it. Fees pay at the yearly settle.
 */
export function castOffer(c: CareerCtx<ModelState>, id: string): void {
  const { g, s, year } = c
  const items = boardOf(g, s)
  const first = items.find((x) => x.id === id)
  const why = first ? castBlock(g, s, first) : 'That casting is gone.'
  if (why) {
    careerSay(c, 'Casting', why, BOARD)
    return
  }
  if (s.board.year !== g.year) s.board = { year: g.year, items }
  const o = s.board.items.find((x) => x.id === id)
  if (!o) return
  const trip = tripCost(o)
  if (trip > 0) {
    if (!c.pay('Travel', trip)) {
      careerSay(c, 'Casting', `You can't cover the ${money(trip)} trip.`, BOARD)
      return
    }
    s.strain = Math.min(100, round1(s.strain + 6))
  }
  const plan = castPlan(g, s, o)
  const won = chance(g, plan.odds)
  const field = activeField(g, MODEL_SPEC, s.memory)
  const named = o.rivals.map((rid) => field.find((x) => x.rival.id === rid)?.rival).filter((x): x is NonNullable<typeof x> => !!x)
  const label = kindName(g, o)
  if (won) {
    const k = readContract(modelJob(g), g)
    o.status = 'booked'
    // an unsigned model keeps the whole fee: no terms (a stored commission is never under 12%)
    o.terms = k ? { agency: k.agency, commission: k.commission, mother: motherPct(s, year) } : null
    if (o.window > 0 && o.brand) s.windows = cap([...s.windows.filter((w) => w.brand !== o.brand), { brand: o.brand, category: categoryOf(o.brand), until: year + o.window }], 8)
    for (const r of named) {
      const grudge = s.memory.find((m) => m.id === r.id)?.grudge ?? 0
      s.memory = noteRival(s.memory, r, year, { met: 1, won: 1, grudge: Math.max(0, Math.min(1, 3 - grudge)) })
    }
    report(c, 'Booked', `You booked the ${label} for ${o.house}. It pays out at the year's end.`, `I booked a ${label} for ${o.house}.`, KIND_EMOJI[o.kind], 'good')
    return
  }
  o.status = 'lost'
  const winner = named[0]
  if (winner) s.memory = noteRival(s.memory, winner, year, { met: 1, lost: 1 })
  report(c, 'Passed Over', `${winner ? winner.name : 'Another model'} got the ${label} for ${o.house}.`, `I lost a ${label} for ${o.house}${winner ? ` to ${winner.name}` : ''}.`, KIND_EMOJI[o.kind], 'bad')
}

// ---------------------------------------------------------------------------
// Direction, rest and the portfolio

/** Why you can't change direction now, or null. */
export function focusBlock(g: GameState, s: ModelState, focus: Focus): string | null {
  const why = blocked(g, 16)
  if (why) return why
  if (s.focus === focus) return 'You already work that direction.'
  if (s.focusYear === g.year) return "You've already changed direction this year."
  return null
}

/** One change a year. The first is free; later ones cost 3 book points and 20% of your buzz. */
export function focusChange(c: CareerCtx<ModelState>, focus: Focus): void {
  const { g, s } = c
  const why = FOCUSES.includes(focus) ? focusBlock(g, s, focus) : "That direction doesn't exist."
  if (why) {
    careerSay(c, 'Direction', why, BOARD)
    return
  }
  const free = s.focusYear === 0
  if (!free) {
    s.book = Math.max(0, round1(s.book - 3))
    s.buzz = round1(s.buzz * 0.8)
  }
  s.focus = focus
  s.focusYear = g.year
  careerLog(c, `I moved to ${FOCUS[focus].label.toLowerCase()} work.`)
  careerSay(c, 'Direction', `You moved to ${FOCUS[focus].label.toLowerCase()} work. ${free ? 'The first change is free.' : 'Your book and buzz took a small hit.'}`, BOARD)
}

/** Why you can't rest a season now, or null. */
export function restBlock(g: GameState, s: ModelState): string | null {
  const why = blocked(g, 16)
  if (why) return why
  return s.restYear === g.year ? "You've already rested this year." : null
}

/** A rest season: two fewer castings and buzz -6 now, and your workload eases by 30 at the next settle. Once a year. */
export function restSeason(c: CareerCtx<ModelState>): void {
  const { g, s } = c
  const why = restBlock(g, s)
  if (why) {
    careerSay(c, 'Rest Season', why, EXIT)
    return
  }
  s.restYear = g.year
  s.buzz = Math.max(0, round1(s.buzz - 6))
  careerLog(c, 'I took a season off.')
  careerSay(c, 'Rest Season', 'You took a season off. Your workload eases next year. You have two fewer castings and a little less buzz.', EXIT)
}

/** What a recovery plan costs. */
export const planPrice = (g: GameState): number => Math.round(PLAN_COST * priceLevel(g))

/** Why you can't start a recovery plan now, or null. */
export function planBlock(g: GameState, s: ModelState): string | null {
  const why = blocked(g, 16)
  if (why) return why
  if (s.planYear === g.year) return "You've already started a plan this year."
  return g.character.money < planPrice(g) ? `You can't cover the ${money(planPrice(g))} plan.` : null
}

/** A recovery plan: c.pay of 1,500 x the price level, health +2 now, and your workload eases by 15 at the next settle. Once a year. */
export function recoveryPlan(c: CareerCtx<ModelState>): void {
  const { g, s } = c
  const why = planBlock(g, s)
  if (why) {
    careerSay(c, 'Recovery Plan', why, EXIT)
    return
  }
  if (!c.pay('Recovery plan', planPrice(g))) return
  s.planYear = g.year
  addStat(g, 'health', 2)
  careerLog(c, 'I started a recovery plan.')
  careerSay(c, 'Recovery Plan', `You paid ${money(planPrice(g))} for a recovery plan. Your workload eases next year and your health picked up.`, EXIT)
}

const PHOTO_POINTS = [2, 5, 9] as const

/** Why you can't shoot a portfolio with this photographer now, or null. */
export function shootBlock(g: GameState, photographer: number): string | null {
  const why = blocked(g, 16)
  if (why) return why
  const ph = PHOTOGRAPHERS[photographer]
  if (!ph) return "That photographer isn't taking bookings."
  if (yearActionsUsed(g, SHOOT_ONCE) >= 1) return "You've already shot a portfolio this year."
  return g.character.money < ph.cost ? `You can't cover the ${money(ph.cost)} shoot.` : null
}

function photographerName(g: GameState, key: string): string {
  const r = seeded(`${g.lifeId}|photographer|${key}`)
  const pool = namePoolOf(g.character.countryId)
  const firsts = (r.chance(0.5) ? pool.male : pool.female).filter((f) => nameFitsYear(f, g.year - 35))
  return `${r.pick(firsts.length > 0 ? firsts : pool.male)} ${r.pick(pool.last)}`
}

/** A portfolio shoot: 150, 1,200 or 7,500 for 2, 5 or 9 book points, by a named fictional photographer. Once a year. */
export function portfolioShoot(c: CareerCtx<ModelState>, photographer: number): void {
  const { g, s } = c
  const why = shootBlock(g, photographer)
  if (why) {
    careerSay(c, 'Portfolio Shoot', why, '\u{1F4F7}')
    return
  }
  const ph = PHOTOGRAPHERS[photographer]
  if (!useYearAction(g, SHOOT_ONCE, 1)) return
  if (!c.pay('Photographer', ph.cost)) {
    g.yearActions[SHOOT_ONCE] = 0
    return
  }
  s.book = round1(gainBook(s.book, PHOTO_POINTS[photographer] ?? 2))
  const name = photographerName(g, `${g.year}|${photographer}|${s.photographers.length}`)
  s.photographers = cap([...s.photographers.filter((x) => x !== name), name], 8)
  careerLog(c, `I shot a portfolio with ${name}.`, 'good')
  careerSay(c, 'Portfolio Shoot', `${name} shot your portfolio for ${money(ph.cost)}, and your book grew.`, '\u{1F4F7}', 'good')
}

// ---------------------------------------------------------------------------
// Sabotage

/** The three rivals nearest above you (by score), nearest first. Pure. */
export function sabotageTargets(g: GameState, s: ModelState): { id: string; name: string; score: number }[] {
  const me = scoreOf(lookValue(g, s), s.book, s.buzz, s.rep)
  return activeField(g, MODEL_SPEC, s.memory)
    .filter((x) => x.score > me)
    .sort((a, b) => a.score - b.score || (a.rival.id < b.rival.id ? -1 : a.rival.id > b.rival.id ? 1 : 0))
    .slice(0, 3)
    .map((x) => ({ id: x.rival.id, name: x.rival.name, score: x.score }))
}

/**
 * Asks which of the three nearest rivals above you to go after. False (nothing queued) when you aren't signed or no
 * rival is above you: the menu then falls back to the legacy choice. Writes nothing and draws no g.rng.
 */
export function offerSabotage(g: GameState): boolean {
  if (!modelJob(g) || blocked(g)) return false
  const targets = sabotageTargets(g, modelStore.view(g))
  if (targets.length === 0) return false
  scriptChoice(
    g,
    SABOTAGE_SCRIPT,
    'Sabotage',
    'Which rival do you want out of the way? What will you do?',
    [...targets.map((t) => ({ id: t.id, label: fit(t.name, 40), emoji: '\u{1F608}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
    { emoji: '\u{1F608}', data: { owner: ownerKey(g), year: g.year } },
  )
  return true
}

defineScript(SABOTAGE_SCRIPT, (g, choice, data) => {
  if (choice === 'cancel' || !g.character.alive) return
  const job = modelJob(g)
  if (!job) return
  const s = modelStore.mut(g)
  if (!claimChoice(g, s, data, `sabotage.${g.year}`)) return
  const target = sabotageTargets(g, s).find((t) => t.id === choice)
  if (!target) return
  const c = careerCtx(g, 'model', s)
  if (!useYearAction(g, 'model.sabotage', 1)) {
    careerSay(c, 'Sabotage', "You're watched too closely to try that again this year.", '\u{1F440}')
    return
  }
  const past = int(rec(job.data).sabotaged, 0, 0, 1e6)
  job.data.sabotaged = Math.min(1e6, past + 1)
  addHidden(g, 'karma', -8)
  count(g, 'sabotage')
  const grudge = s.memory.find((m) => m.id === choice)?.grudge ?? 0
  if (chance(g, clamp(0.25 + 0.1 * past + 0.1 * grudge, 0.05, 0.95))) {
    if (chance(g, 0.5)) {
      for (const a of s.agencies) if (a.to === 0) a.to = g.year
      const agency = job.company
      leave(g, 'fired')
      careerLog(c, `I was fired from ${agency} for sabotage.`, 'bad')
      careerSay(c, 'Busted', `Security footage caught you. ${agency} let you go on the spot.`, '\u{1F6A8}', 'bad')
      return
    }
    s.mood = Math.max(0, round1(s.mood - 25))
    s.rep = Math.max(0, round1(s.rep - 15))
    addFame(g, -2)
    careerLog(c, 'I was caught sabotaging a rival.', 'bad')
    careerSay(c, 'Busted', 'You were caught. The agency put you on probation and the tabloids took notice.', '\u{1F6A8}', 'bad')
    return
  }
  bump(job, randInt(g, 6, 12))
  s.cool[`sab.${choice}`] = g.year
  if (s.board.year !== g.year) s.board = { year: g.year, items: buildBoard(g, s) }
  for (const o of s.board.items) o.rivals = o.rivals.filter((x) => x !== choice)
  careerLog(c, `I kept ${target.name} off this year's shortlists.`, 'bad')
  careerSay(c, 'Sabotage', `${target.name} dropped off this year's shortlists. The calls came to you.`, '\u{1F608}')
})

// ---------------------------------------------------------------------------
// Rows

const signedNow = (g: GameState): boolean => !!modelJob(g)
const view = (g: GameState): ModelState => modelStore.view(g)

/** The best odds on the board among the castings you can take now: the row the hint marks. Pure. */
function bestCast(g: GameState, s: ModelState): { id: string; hint: string } | null {
  const field = activeField(g, MODEL_SPEC, s.memory)
  let best: { id: string; odds: number; hint: string } | null = null
  for (const o of boardOf(g, s)) {
    if (castBlock(g, s, o) !== null) continue
    const plan = castPlan(g, s, o)
    if (best && plan.odds <= best.odds) continue
    const n = o.rivals.filter((rid) => field.some((x) => x.rival.id === rid)).length
    const rivals = n >= 2 ? 'two rivals' : n === 1 ? 'one rival' : 'a typical field'
    best = { id: o.id, odds: plan.odds, hint: `Odds ${oddsText(plan.odds)}: your fit ${plan.fit} against ${rivals} near ${plan.rivalMean}.` }
  }
  return best ? { id: best.id, hint: best.hint } : null
}

function boardLabel(g: GameState, o: MdOffer): string {
  return fit(`${kindLabel(g, o.kind)}, ${o.house}`, 60)
}

const STATUS_WORD: Record<MdOffer['status'], string> = { open: 'Open', booked: 'Booked', lost: 'Lost', passed: 'Passed', paid: 'Paid' }

/** One casting as a row you can take, or as a line once it is booked, lost or paid. */
function boardRow(g: GameState, o: MdOffer): MenuNode {
  if (o.status !== 'open') return info(`model.board.${o.id}`, `${STATUS_WORD[o.status]}: ${kindLabel(g, o.kind).toLowerCase()} for ${o.house}.`)
  return row({
    id: `model.cast.${o.id}`,
    label: boardLabel(g, o),
    emoji: KIND_EMOJI[o.kind],
    subtitle: `${plural(o.days, 'day')}, ${money(o.fee)}${o.circuit ? `, ${CIRCUITS.find((c) => c.id === o.circuit)?.city ?? ''}` : ''}${o.abroad ? ', abroad' : ''}. ${SEASON_LABEL[o.season]}.`,
    gate: (gg, ss) => {
      const live = boardOf(gg, ss).find((x) => x.id === o.id)
      return live ? castBlock(gg, ss, live) : 'That casting is gone.'
    },
    hint: (gg, ss) => {
      if (!hasTalent(gg, 'Modeling')) return null // the hint is the talent's: no talent, nothing to work out
      const top = bestCast(gg, ss)
      return top && top.id === o.id ? (honest(gg, 'Modeling', top.hint).hint ?? null) : null
    },
    run: (c) => castOffer(c, o.id),
  })
}

function boardMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.board',
    label: 'Season Board',
    emoji: BOARD,
    subtitle: (g) => {
      const s = view(g)
      const items = boardOf(g, s)
      return fit(`${items.filter((o) => o.status === 'open').length} open, ${Math.max(0, slotCap(g, s) - slotsUsed(items))} of ${slotCap(g, s)} castings left`, LINE)
    },
    header: () => 'Couture holds 8 days a season, autumn and spring shows 12, year-round 24. Booked fees pay out at the year end.',
    children: (g) => {
      const s = view(g)
      const items = boardOf(g, s)
      const out: MenuNode[] = [info('model.board.slots', `You have ${Math.max(0, slotCap(g, s) - slotsUsed(items))} of ${slotCap(g, s)} castings left this year.`)]
      if (items.length === 0) out.push(info('model.board.none', 'No castings are open this year.'))
      return [...out, ...items.map((o) => boardRow(g, o))]
    },
  }
}

const FOCUS_LINE: Record<Focus, string> = {
  runway: 'Shows build your book faster. Light work pays 20% less.',
  editorial: 'The balanced path.',
  commercial: 'Fees up 25% and one more casting. Your book grows slower.',
}

function focusMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.focus',
    label: 'Direction',
    emoji: '\u{1F9ED}',
    subtitle: (g) => FOCUS[view(g).focus].label,
    header: () => 'Your direction sets your prime and your offers. One change a year, free the first time.',
    hint: (g) => {
      const s = view(g)
      const left = FOCUS[s.focus].prime + (hasTalent(g, 'Modeling') ? 2 : 0) - fin(g.character.age)
      return left > 0 ? (honest(g, 'Modeling', `Your ${FOCUS[s.focus].label.toLowerCase()} look stays in its prime for ${left} more ${left === 1 ? 'year' : 'years'}.`).hint ?? null) : null
    },
    children: (g) => [
      info('model.focus.now', `You work ${FOCUS[view(g).focus].label.toLowerCase()}.`),
      ...FOCUSES.map((f) =>
        row({
          id: `model.focus.${f}`,
          label: FOCUS[f].label,
          emoji: '\u{1F9ED}',
          subtitle: `Prime to ${FOCUS[f].prime}. ${FOCUS_LINE[f]}`,
          gate: (gg, ss) => focusBlock(gg, ss, f),
          confirm: (gg) => (view(gg).focusYear === 0 ? null : 'A change costs 3 book points and 20% of your buzz. Continue?'),
          run: (c) => focusChange(c, f),
        }),
      ),
    ],
  }
}

function restMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.rest',
    label: 'Rest and Recovery',
    emoji: EXIT,
    visible: signedNow,
    subtitle: 'Ease your workload',
    header: () => 'A heavy calendar builds up workload. Rest and a recovery plan ease it at the next year end.',
    hint: (g) => {
      const strain = view(g).strain
      return strain > 40 ? (honest(g, 'Modeling', `Injury risk this year at your workload: ${oddsText(Math.min(0.29, 0.02 + 0.006 * Math.max(0, strain - 55)))}.`).hint ?? null) : null
    },
    children: () => [
      row({
        id: 'model.rest.season',
        label: 'Rest a Season',
        emoji: EXIT,
        subtitle: 'Eases your workload. Two fewer castings, buzz -6.',
        gate: (g, s) => restBlock(g, s),
        confirm: () => 'Rest this season? You lose two castings and some buzz.',
        run: (c) => restSeason(c),
      }),
      row({
        id: 'model.rest.plan',
        label: 'Recovery Plan',
        emoji: '\u{1FA7A}',
        subtitle: (g) => `Cost ${money(planPrice(g))}. Eases your workload, health +2.`,
        gate: (g, s) => planBlock(g, s),
        run: (c) => recoveryPlan(c),
      }),
    ],
  }
}

function shootMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'model.shoot',
    label: 'Portfolio Shoot',
    emoji: '\u{1F4F7}',
    subtitle: 'Once a year',
    header: () => 'A new portfolio grows your book. A better photographer grows it more.',
    children: () =>
      PHOTOGRAPHERS.map((ph, i) =>
        row({
          id: `model.shoot.${ph.id}`,
          label: ph.label,
          emoji: '\u{1F4F7}',
          subtitle: `Cost ${money(ph.cost)}. Book +${PHOTO_POINTS[i] ?? 2}.`,
          gate: (g) => shootBlock(g, i),
          run: (c) => portfolioShoot(c, i),
        }),
      ),
  }
}

/** The marketability report card (the standing menu), built on first use. */
let card: MenuGroup | null = null
const cardOf = (): MenuGroup =>
  (card ??= standingMenu<ModelState>({
    id: 'model.standing',
    label: 'Career',
    emoji: '\u{1F31F}',
    store: modelStore,
    standingLabel: 'Marketability',
    incomeLabel: 'Bookings',
    peers: { spec: MODEL_SPEC, score: (g, s) => scoreOf(lookValue(g, s), s.book, s.buzz, s.rep) },
  }))

export const modelStanding: MenuGroup = {
  type: 'menu',
  id: 'model.standing',
  label: 'Career',
  emoji: '\u{1F31F}',
  visible: (g) => modelStore.has(g) || !!modelJob(g),
  subtitle: (g) => {
    const s = cardOf().subtitle
    return typeof s === 'function' ? s(g) : (s ?? '')
  },
  children: (g) => cardOf().children(g),
}

/** The Season Board, direction, contract, agency switch, rest and portfolio rows, in the order a model wants them. */
export function modelRows(g: GameState): MenuNode[] {
  return [boardMenu(), focusMenu(), ...agencyRows(g), restMenu(), shootMenu()]
}

