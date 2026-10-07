// Online ventures run from the home computer: a SaaS, a mobile app, an online store (sneakers,
// thrift flips...) and an indie game. Each one is a kind 'venture' asset (value = valuation ×
// your stake) whose state lives in Asset.details (VentureData), so it is listed, inherited and
// counted in net worth like any other asset.
//
// Flow: pick an idea → build it yourself (coding skill) or hire a freelancer → name it → build
// progress → launch → yearly growth/churn/revenue. Growth depends on product quality, coding
// skill, tech debt, pricing, marketing, contractors, the home market (population × spending
// power), how global it has become (reach), the local business cycle and the world economy.
// Profit is paid to you as taxable income (your share); losses come out of the company's cash,
// then your pocket. Events: outages, going viral, clones, a big customer, acquisition offers,
// data breaches, co-founder drama, investors, and type-specific chaos.
import { cycleOf } from '../business/economy'
import { COMPANY_WORDS } from '../data/jobs'
import { addHidden, addMoney, addRelationship, addStat, count, earnIncome, formatCents, formatMoney, log, notice, peopleBy, remember, scriptChoice, scriptInput, useYearAction, yearActionsUsed } from '../core'
import { fillLocal, localPick, localTerm } from '../data/locales'
import { worldYear } from '../invest/engine'
import { chance, pick, rand, randFloat, randInt, shuffle, uid, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import { totalFollowers } from '../special/social'
import { hasTalent } from '../talents'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { randomFirstName } from '../world'
import { ageBlock, computerBlock, earnNow, firstReason, guardians, lifeBlock, parentWord, receiveSale, useComputer } from './dev-common'
import { practice } from './dev-learn'
import {
  AD_LEVELS,
  adBudget,
  between,
  contractorCost,
  dataRegulator,
  homeMarketFactor,
  localFee,
  localNameWords,
  money,
  niceAmount,
  num,
  plural,
  priceLevel,
  privacyLaw,
  readVenture,
  shortCount,
  str,
  toJson,
  allVentureAssets,
  ventureAssets,
  whole,
  withDev,
  writeVenture,
  type VentureData,
  type VentureType,
} from './dev-state'
import { bestLanguageFor, codingSkill } from './skills'
import { MAX_VENTURES, VENTURE_DEFS, type Tier, type TypeDef } from './dev-kinds'
import { eraOpen, eraReason } from './era'
import { hasTech } from '../history/timeline'

export { MAX_VENTURES, VENTURE_DEFS }

// ---------------------------------------------------------------------------
// Venture types

function def(v: VentureData): TypeDef {
  return VENTURE_DEFS[v.type]
}

function unitWord(v: VentureData, n: number): string {
  return plural(n, def(v).unit[0], def(v).unit[1])
}

// ---------------------------------------------------------------------------
// Ideas and names

interface Idea {
  text: string
  key: string
  mult: number
  product?: string
}

function strip(s: string): string {
  return s.replace(/^(the|a|an)\s+/i, '').trim()
}

const SAAS_IDEAS: [string, string, number][] = [
  ['Invoicing for freelance clowns', 'Honk', 0.08],
  ['Appointment booking for dog groomers', 'Groom', 0.5],
  ['A CRM for wedding DJs', 'Spin', 0.25],
  ['Inventory tracking for {food} stalls', 'Stall', 0.6],
  ['Shift scheduling for restaurants', 'Shift', 1.4],
  ['Payroll for teams of three', 'Payday', 1.2],
  ['An AI that rewrites angry emails into polite ones', 'Polite', 1.6],
  ['Software that cancels meetings that should have been emails', 'Cancel', 1.3],
  ['Bookings for {city} barbershops', 'Fade', 0.35],
  ['Tutor matching for students cramming for {exam}', 'Cram', 0.9],
  ['Dispatch software for {transport} operators', 'Route', 0.5],
  ['Membership management for small gyms', 'Rep', 0.8],
  ['Recipe costing for bakeries', 'Crumb', 0.5],
  ['Maintenance requests for landlords who never answer', 'Fixit', 0.9],
  ['Spreadsheet-to-dashboard magic for tiny businesses', 'Chart', 1.5],
  ['Lost-and-found tracking for schools', 'Found', 0.3],
  ['Review monitoring for cafés near {hangout}', 'Star', 0.6],
]

const APP_IDEAS: [string, string, number][] = [
  ['A flashcard app for {exam}', 'Cram', 1],
  ['A habit tracker that guilt-trips you', 'Guilt', 1.3],
  ['A bus-arrival app for {city}', 'Bus', 0.3],
  ['A meme generator for group chats', 'Meme', 1.6],
  ['A plant identifier that is wrong 40% of the time', 'Leaf', 1],
  ['A split-the-bill app for {food} nights', 'Split', 0.9],
  ['A white-noise app with 600 kinds of rain', 'Drizzle', 1.2],
  ['A to-do list that deletes itself if you ignore it', 'Doom', 1],
  ['A parking-spot finder for {city}', 'Spot', 0.4],
  ['An app that rates your outfit, brutally', 'Drip', 1.1],
]

const STORE_IDEAS: [string, string, number, string][] = [
  ['Reselling limited-edition sneakers', 'Kicks', 1, 'sneakers'],
  ['Thrift-flipped vintage clothes', 'Thrift', 1, 'vintage jackets'],
  ['Handmade phone cases', 'Case', 0.8, 'phone cases'],
  ['Custom keyboard keycaps', 'Keycap', 0.5, 'keycaps'],
  ['Secondhand textbooks', 'Shelf', 0.7, 'textbooks'],
  ['Shipping {food} snack boxes to homesick expats', 'Snack', 0.6, 'snack boxes'],
  ['Retro video games and consoles', 'Retro', 0.8, 'retro cartridges'],
  ['Hand-painted tote bags', 'Tote', 0.6, 'tote bags'],
]

const GAME_IDEAS: [string, string, number][] = [
  ['A cozy farming game about {food}', 'Harvest', 1.1],
  ['A roguelike where you are a pigeon', 'Coo', 1],
  ['A horror game set in your old {primary}', 'Hallway', 1],
  ['A puzzle game about doing your taxes', 'Ledger', 0.6],
  ['A racing game with shopping carts', 'Cart', 1.2],
  ['A platformer starring a very determined snail', 'Snail', 1],
  ['A strategy game about running a {food} stand', 'Stand', 0.8],
  ['A soulslike, but everything is a cat', 'Paw', 1.3],
]

function fillIdea(g: GameState, text: string): string {
  return fillLocal(
    g,
    text
      .replace('{exam}', localTerm(g, 'finalExam'))
      .replace('{primary}', localTerm(g, 'primary'))
      .replace('{transport}', strip(localPick(g, 'transport') || 'bus')),
  ).replace(/\{\w+\}/g, 'local')
}

export function generateIdeas(g: GameState, type: VentureType, n = 3): Idea[] {
  if (type === 'store') return shuffle(g, STORE_IDEAS).slice(0, n).map(([t, k, m, p]) => ({ text: fillIdea(g, t), key: k, mult: m, product: p }))
  const pool = type === 'saas' ? SAAS_IDEAS : type === 'app' ? APP_IDEAS : GAME_IDEAS
  return shuffle(g, pool)
    .slice(0, n)
    .map(([t, k, m]) => ({ text: fillIdea(g, t), key: k, mult: m }))
}

export function suggestName(g: GameState, type: VentureType, key: string): string {
  const words = localNameWords(g)
  const local = words.length && chance(g, 0.25) ? pick(g, words) : ''
  switch (type) {
    case 'saas':
      return `${local || key}${pick(g, ['Sloth', 'Panda', 'ly', 'ify', 'Hub', 'Pilot', 'Nest', 'Flow', 'Base', 'Desk', 'Stack', 'Bee'])}`
    case 'app':
      return `${local || key}${pick(g, ['r', 'ly', 'Pal', 'Buddy', 'o', 'Go', 'Up'])}`
    case 'store':
      return pick(g, [`${key} Kingdom`, `${key} Club`, `${g.character.firstName}'s ${key}`, `The ${key} Drop`, `${local || key} ${pick(g, ['Supply', 'Co.', 'Corner'])}`])
    case 'game':
      return `${key}${pick(g, [' Quest', ' Simulator', ': The Reckoning', ' Royale', ' Tales', ' Odyssey', ' Legends'])}`
  }
}

// ---------------------------------------------------------------------------
// Market math

function fam(g: GameState): string {
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
}

/** Share of customers in the home market (falls as the product goes global). */
function localShare(v: VentureData): number {
  return between(def(v).localWeight * (1 - 0.6 * v.reach), 0.05, 0.95)
}

/** Local price for a US price, blending home-market prices with global ones. */
export function custPrice(v: VentureData, usd: number): number {
  const ls = localShare(v)
  return usd * (ls * priceLevel(v.countryId) + (1 - ls))
}

/** Market size in users/customers. */
export function marketCap(v: VentureData): number {
  const d = def(v)
  return Math.max(50, v.niche * (d.localWeight * homeMarketFactor(v.countryId) + (1 - d.localWeight) * v.reach))
}

/**
 * How strongly product-market fit drives growth. Superlinear on purpose: a lukewarm idea stays a
 * small side business no matter how hard you grind, and the rare idea that clicks takes off.
 */
function pull(v: VentureData): number {
  return Math.pow(v.fit, 1.5)
}

/** The economy this year for this venture: local business cycle blended with the world economy. */
function econOf(g: GameState, v: VentureData): number {
  const w = worldYear(fam(g), g.year)
  const world = between((1 + 0.05 * w.z) * (w.crash ? 0.85 : 1) * (w.boom ? 1.08 : 1), 0.7, 1.25)
  const local = cycleOf(g, v.countryId, g.year)
  const ls = localShare(v)
  return between(ls * (Number.isFinite(local) ? local : 1) + (1 - ls) * world, 0.5, 1.4)
}

/** What one paying customer / user / sale costs in ads right now. */
export function cacOf(v: VentureData): number {
  const price = custPrice(v, tierOf(v).price)
  switch (v.type) {
    case 'saas':
      return Math.max(5, price * 9 * (1.4 - 0.6 * (v.quality / 100)))
    case 'app':
      // Paid installs: a few dollars each in rich markets, less where ads are cheap.
      return Math.max(0.4, 2.5 * custPrice(v, 1))
    case 'store':
      // Real shoppers cost real money to reach: roughly 60% of an order in ads.
      return Math.max(4, price * 0.6)
    case 'game':
      return Math.max(0.5, price * 0.6)
  }
}

function tierOf(v: VentureData): Tier {
  return def(v).tiers[between(Math.round(v.tier), 0, 2)]
}

export function tierPriceLabel(v: VentureData, t: Tier = tierOf(v)): string {
  const p = custPrice(v, t.price)
  const amount = p >= 20 ? formatMoney(Math.round(p)) : formatCents(p)
  switch (v.type) {
    case 'saas':
      return `${amount}/month`
    case 'app':
      return v.tier === 2 ? `${amount} upfront` : `~${amount}/user/year`
    case 'store':
      return `~${amount} per order`
    case 'game':
      return `${amount} a copy`
  }
}

// ---------------------------------------------------------------------------
// Creating ventures

export function canStartVenture(g: GameState): string | null {
  if (ventureAssets(g).length >= MAX_VENTURES) return `You already run ${MAX_VENTURES} ventures. Even founders need to sleep.`
  if (yearActionsUsed(g, 'computer.dev.newVenture') >= 1) return "You already started a venture this year. Let this one breathe."
  return null
}

function ventureEmoji(type: VentureType): string {
  return VENTURE_DEFS[type].emoji
}

export interface NewVentureOpts {
  /** Product-market fit (random when absent). */
  fit?: number
  hired?: boolean
  invested?: number
  quality?: number
  users?: number
  live?: boolean
}

/** Create the venture asset. */
export function createVenture(g: GameState, type: VentureType, name: string, idea: Idea, opts: NewVentureOpts = {}): Asset {
  const c = g.character
  const d = VENTURE_DEFS[type]
  const [lo, hi] = d.niche
  const niche = Math.round(lo * Math.pow(hi / lo, randFloat(g, 0, 1)) * between(idea.mult, 0.05, 2))
  const best = bestLanguageFor(g, d.use)
  // Programming talent: a gifted coder ships a noticeably better first version.
  const selfQ = 15 + codingSkill(g) * 0.5 + (best?.level ?? 0) * 0.1 + (hasTalent(g, 'Programming') ? 8 : 0) + randInt(g, -6, 6)
  const storeQ = 38 + c.stats.smarts * 0.1 + c.stats.looks * 0.08 + randInt(g, -5, 5)
  const quality = between(opts.quality ?? (type === 'store' ? storeQ : opts.hired ? 40 + randInt(g, 0, 15) : selfQ), 5, 95)
  const live = opts.live === true || type === 'store'
  const v: VentureData = {
    type,
    idea: idea.text,
    niche,
    countryId: c.countryId,
    stage: live ? 'live' : 'building',
    progress: live ? 100 : 0,
    quality: Math.round(quality),
    debt: opts.hired ? randInt(g, 15, 30) : randInt(g, 5, 15),
    users: whole(opts.users ?? (type === 'store' ? randInt(g, 5, 25) : 0)),
    peakUsers: 0,
    tier: 1,
    ad: 0,
    contractors: 0,
    stake: 1,
    valuation: 0,
    cash: 0,
    owed: 0,
    invested: whole(opts.invested ?? 0),
    reach: 0.1,
    hype: live ? 20 : 0,
    // Most ideas are lukewarm (median ~0.6), one in four barely registers, one in ten is rocket fuel.
    fit: opts.fit ?? between(Math.exp(-0.55 + (rand(g) + rand(g) + rand(g) - 1.5) / 0.5), 0.08, 2.5),
    revenue: 0,
    costs: 0,
    profit: 0,
    mrr: 0,
    prevMrr: 0,
    tail: 0,
    founded: g.year,
    launchYear: live ? g.year : 0,
    hired: opts.hired === true,
    cofounder: '',
    lastWorked: g.year,
    strain: 0,
    lastEvent: 0,
    history: [],
  }
  if (type === 'game') v.reach = 0.35
  if (type === 'game' && live) v.tail = Math.round(marketCap(v) * 0.03 * Math.pow(v.quality / 100, 2))
  v.valuation = valuationOf(v)
  const a: Asset = {
    id: uid(g, 'a'),
    kind: 'venture',
    name: name.slice(0, 40),
    emoji: ventureEmoji(type),
    purchasePrice: v.invested,
    value: 0,
    condition: 100,
    purchasedAge: c.age,
    upkeep: 0,
    details: {},
  }
  writeVenture(a, v)
  if (type === 'store') a.details.product = idea.product || 'goods'
  g.assets.push(a)
  useYearAction(g, 'computer.dev.newVenture', 1)
  withDev(g, (s) => {
    s.founded += 1
  })
  count(g, 'venturesFounded')
  return a
}

/** Turn a hit app or game project into a venture. */
export function spinOffVenture(g: GameState, type: 'app' | 'game', name: string, q: number, users: number): void {
  const reason = firstReason(lifeBlock(g), canStartVenture(g))
  if (reason) return notice(g, 'New Venture', reason, { emoji: ventureEmoji(type) })
  const a = createVenture(g, type, name, { text: type === 'game' ? `${name}, the game everyone's talking about` : `${name}, the app that's taking off`, key: name, mult: 1 }, { quality: q, users: type === 'game' ? users : Math.round(users * 0.4), live: true, fit: 1.3 })
  const v = readVenture(g, a)
  v.hype = 45
  writeVenture(a, v)
  log(g, `I turned ${name} into a real business.`, 'good')
  remember(g, `Turned ${name} into a business.`)
  notice(g, 'It\'s a Business Now', `${name} is officially a business. Manage it from Assets › Online Ventures or Activities › Computer: pricing, marketing, contractors and updates.`, { emoji: ventureEmoji(type), tone: 'good' })
}

const IDEA_SCRIPT = defineScript('computer.dev.venture.idea', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = obj(data)
  const type = readType(d.type)
  const ideas = Array.isArray(d.ideas) ? d.ideas.map(obj) : []
  const i = Number(choice.replace('idea', ''))
  const pickIdea = ideas[i]
  if (!pickIdea) return
  const idea = { text: str(pickIdea.text), key: str(pickIdea.key, 'Idea'), mult: num(pickIdea.mult, 1), product: str(pickIdea.product) }
  const vd = VENTURE_DEFS[type]
  const startCost = localFee(g, vd.startUsd)
  if (type === 'store') {
    scriptChoice(
      g,
      BUILD_SCRIPT,
      vd.label,
      `"${idea.text}." You'll need about ${formatMoney(startCost)} for your first batch of stock, packaging and a store page. ${g.character.age < 18 ? `Since you're ${g.character.age}, the payment account goes in a parent's name. They now have opinions about your business.` : ''}`.trim(),
      [
        { id: 'self', label: `Open it (${formatMoney(startCost)})`, emoji: '\u{1F4E6}' },
        { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' },
      ],
      { emoji: vd.emoji, data: { type, idea: toJson(idea) } },
    )
    return
  }
  const skill = codingSkill(g)
  const hire = localFee(g, vd.hireUsd)
  const choices: ChoiceOption[] = []
  if (skill >= vd.minSkill) choices.push({ id: 'self', label: `Build it yourself (${formatMoney(startCost)})`, emoji: '\u{1F468}\u{200D}\u{1F4BB}' })
  if (hire > 0) choices.push({ id: 'hire', label: `Hire a freelancer (${formatMoney(hire + startCost)})`, emoji: '\u{1F4BC}' })
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' })
  scriptChoice(
    g,
    BUILD_SCRIPT,
    vd.label,
    `"${idea.text}." Who builds the first version? Your coding skill is ${skill}/100.${skill < vd.minSkill ? ` You'd need ${vd.minSkill} to build ${vd.noun} yourself.` : ''}`,
    choices,
    { emoji: vd.emoji, data: { type, idea: toJson(idea) } },
  )
})

const BUILD_SCRIPT = defineScript('computer.dev.venture.build', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = obj(data)
  const type = readType(d.type)
  const idea = obj(d.idea)
  const vd = VENTURE_DEFS[type]
  const reason = firstReason(lifeBlock(g), canStartVenture(g))
  if (reason) return notice(g, vd.label, reason, { emoji: vd.emoji })
  const hired = choice === 'hire'
  if (!hired && codingSkill(g) < vd.minSkill) {
    return notice(g, vd.label, `You need coding skill ${vd.minSkill} to build ${vd.noun} yourself (you have ${codingSkill(g)}). Learn more, or hire a freelancer.`, { emoji: vd.emoji })
  }
  const cost = localFee(g, vd.startUsd) + (hired ? localFee(g, vd.hireUsd) : 0)
  if (g.character.money < cost) {
    return notice(g, "Can't Afford It", `Getting ${vd.noun} off the ground costs ${formatMoney(cost)}, and you have ${formatMoney(Math.max(0, g.character.money))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  }
  scriptInput(g, {
    title: 'Name Your Venture',
    emoji: vd.emoji,
    text: `What will you call it? "${str(idea.text)}"`,
    input: 'text',
    placeholder: 'Name',
    defaultValue: suggestName(g, type, str(idea.key, 'Idea')),
    scriptId: NAME_SCRIPT,
    data: { type, idea: toJson(idea), hired, cost },
  })
})

const NAME_SCRIPT = defineScript('computer.dev.venture.name', (g, input, data) => {
  const d = obj(data)
  const type = readType(d.type)
  const idea = obj(d.idea)
  const vd = VENTURE_DEFS[type]
  const reason = firstReason(lifeBlock(g), canStartVenture(g))
  if (reason) return notice(g, vd.label, reason, { emoji: vd.emoji })
  const cost = whole(num(d.cost))
  if (g.character.money < cost) {
    return notice(g, "Can't Afford It", `You need ${formatMoney(cost)} to get it going.`, { emoji: '\u{1F4B8}', tone: 'bad' })
  }
  addMoney(g, -cost)
  const name = cleanName(input) || suggestName(g, type, str(idea.key, 'Idea'))
  const hired = d.hired === true
  const a = createVenture(g, type, name, { text: str(idea.text, name), key: str(idea.key, 'Idea'), mult: num(idea.mult, 1), product: str(idea.product) }, { hired, invested: cost })
  const v = readVenture(g, a)
  addStat(g, 'happiness', randInt(g, 3, 7))
  remember(g, `Founded ${name}: ${v.idea}.`)
  log(g, `I started ${vd.noun}: ${name}.`, 'good')
  const kid = g.character.age < 18
  const parentNote = kid && guardians(g).length ? ` ${pick(g, [`${capWord(parentWord(guardians(g)[0]))} asked if this is "one of those pyramid things." It is not.`, 'Your parents told the whole family you\'re "basically a CEO now."', 'Your parents co-signed the paperwork and asked for 10% "for the electricity."'])}` : ''
  const how =
    type === 'store'
      ? `Your store is open with ${unitWord(v, v.users)} (mostly people who owe you favors).`
      : hired
        ? `A freelancer is building the first version. It should be ready in about a year. You'll want contractors (or your own coding skill) to keep improving it after that.`
        : `You're building it yourself. Use "${vd.workLabel}" to speed things up; it launches when it's done.`
  notice(g, `${name} Is Born`, `You founded ${name}: ${v.idea}. ${how}${parentNote}\n\nManage it from Assets › Online Ventures or Activities › Computer.`, { emoji: vd.emoji, tone: 'good' })
})

/** "Snail Legends'" / "CancelHub's". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

function capWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function cleanName(input: string): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
}

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function readType(v: Json | undefined): VentureType {
  return v === 'app' || v === 'store' || v === 'game' ? v : 'saas'
}

/** Start the founding flow (idea → build → name). */
export function startVenture(g: GameState, type: VentureType): void {
  const vd = VENTURE_DEFS[type]
  if (type === 'game') return notice(g, vd.label, GAMES_POINTER, { emoji: vd.emoji })
  const reason = firstReason(computerBlock(g), ageBlock(g, vd.minAge, `start ${vd.noun}`), eraReason(g, vd.era, `${vd.label.toLowerCase()} businesses`), canStartVenture(g))
  if (reason) return notice(g, vd.label, reason, { emoji: vd.emoji })
  const ideas = generateIdeas(g, type)
  useComputer(g, 1)
  scriptChoice(
    g,
    IDEA_SCRIPT,
    `Start ${vd.noun}`,
    type === 'store' ? 'What will you sell?' : `Pick an idea. ${pick(g, ['Every unicorn started as a weird idea.', 'Most of these will fail. One of them might not.', 'Your gut says one of these is genius. Your gut is often hungry.'])}`,
    [...ideas.map((idea, i) => ({ id: `idea${i}`, label: idea.text, emoji: '\u{1F4A1}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' }],
    { emoji: vd.emoji, data: { type, ideas: toJson(ideas) } },
  )
}

// ---------------------------------------------------------------------------
// Valuation and yearly simulation

/** Whole-company valuation from the latest numbers. */
export function valuationOf(v: VentureData): number {
  const pl = priceLevel(v.countryId)
  const floor = v.invested * 0.2
  if (v.stage === 'building') return whole(Math.max(floor * 2.5, 150 * pl + v.progress * 10 * pl))
  const q = v.quality / 100
  // Growth in customers (not revenue, so a price hike doesn't inflate the multiple).
  const h = v.history
  const prev = h.length >= 2 ? h[h.length - 2].users : 0
  const growth = prev > 0 ? between(h[h.length - 1].users / prev - 1, -0.9, 2) : 0.5
  let val = 0
  switch (v.type) {
    case 'saas':
      val = v.mrr * 12 * between(2 + 4 * growth + (q - 0.5) * 2, 1, 8) + v.users * 10 * pl
      break
    case 'app':
      val = v.revenue * between(1.5 + 2 * growth, 0.8, 5) + v.users * 0.3 * pl
      break
    case 'store':
      val = v.revenue * 0.35 + Math.max(0, v.profit) * 2
      break
    case 'game':
      val = v.revenue * 1.2 + v.tail * custPrice(v, tierOf(v).price) * 0.7 * 1.5
      break
  }
  return whole(between(Math.max(val + v.cash - v.owed, floor - v.owed), 0, 5e9))
}

export interface StepResult {
  launched: boolean
  revenue: number
  payout: number
  closed: boolean
  /** Why it closed: couldn't cover losses, or unpaid fines. */
  closedBy?: 'money' | 'fines'
  line: string
}

/** Yearly costs of running it (not counting inventory). */
export function runningCosts(v: VentureData): { contractors: number; ads: number; fixed: number } {
  return { contractors: v.contractors * contractorCost(v.countryId, v.type), ads: adBudget(v.countryId, v.ad), fixed: niceAmount(def(v).fixedUsd * priceLevel(v.countryId)) }
}

/**
 * One year for one venture (yearly hook). `absent` = the owner can't work on it (prison).
 * Pays your share of profits as taxable income and covers losses from company cash, then you.
 */
export function stepVenture(g: GameState, a: Asset, absent: boolean): StepResult {
  const c = g.character
  const v = readVenture(g, a)
  const d = def(v)
  const pl = priceLevel(v.countryId)
  const worked = !absent && v.lastWorked >= g.year - 1
  const res: StepResult = { launched: false, revenue: 0, payout: 0, closed: false, line: '' }
  const { contractors, ads, fixed } = runningCosts(v)

  if (v.stage === 'building') {
    const skill = codingSkill(g)
    const passive = absent ? 0 : d.buildRate * (0.4 + skill / 100) * 0.45
    v.progress = between(v.progress + passive + v.contractors * 18 + (v.hired ? 100 : 0), 0, 100)
    v.hired = false
    // Building costs: contractors (and ads to build hype before launch).
    const spendNeeded = contractors + ads
    const before = Math.max(0, c.money)
    const paid = coverCosts(g, v, spendNeeded)
    if (ads > 0 && paid >= spendNeeded) v.hype = between(v.hype + 10 * v.ad, 0, 100)
    if (paid < spendNeeded) cutBack(v)
    else {
      v.strain = 0
      guardSavings(g, a, v, before)
    }
    // Contractors polish it up to what they can manage (never below what it already is).
    if (v.contractors > 0) v.quality = between(Math.min(v.quality + v.contractors * 1.5, Math.max(v.quality, 45 + v.contractors * 8)), 0, 100)
    if (v.progress >= 100) {
      launch(g, v)
      res.launched = true
      res.line = launchLine(a.name, v)
      if (v.type === 'game' && v.revenue > 0) {
        res.payout = whole(v.revenue * v.stake)
        if (res.payout > 0) earnIncome(g, res.payout)
        res.revenue = v.revenue
        v.history.push({ y: g.year, users: v.users, revenue: v.revenue, profit: v.revenue })
      }
    } else {
      res.line = `I kept building ${a.name} (${Math.round(v.progress)}% done).`
    }
    v.valuation = valuationOf(v)
    writeVenture(a, v)
    return res
  }

  // Live.
  const lastMrr = v.mrr
  const q = v.quality / 100
  const tier = tierOf(v)
  const cap = marketCap(v)
  const econ = econOf(g, v)
  const effort = worked ? 1 : v.contractors > 0 ? 0.85 : v.type === 'store' ? 0.45 : 0.7
  const appeal = tier.growth * econ * (1 - v.debt / 250) * (1 + v.hype / 100) * effort * (absent ? 0.7 : 1)
  const start = v.users
  const sat = Math.max(0, 1 - start / cap)
  // Ads sell a product people want; for one they don't, every click costs more.
  const adPull = Math.sqrt(v.fit)
  let revenue = 0
  let variable = 0
  let end = start
  let newUsers = 0
  switch (v.type) {
    case 'saas': {
      const price = custPrice(v, tier.price)
      const organic = cap * d.organic * q * q * appeal * sat * pull(v)
      const paidUsers = (ads / cacOf(v)) * sat * adPull
      const m = between(tier.x * (1.6 - q) * (1 + v.debt / 120), 0.004, 0.25)
      const retained = Math.pow(1 - m, 12)
      newUsers = organic + paidUsers
      end = start * retained + newUsers
      revenue = ((start + end) / 2) * price * 12
      variable = fixed + revenue * 0.1
      v.mrr = whole(end * price)
      break
    }
    case 'app': {
      const organic = cap * d.organic * q * q * appeal * sat * pull(v)
      newUsers = organic + (ads / cacOf(v)) * sat * adPull
      const retention = between(0.2 + 0.45 * q - v.debt / 400, 0.08, 0.8)
      end = start * retention + newUsers
      const avg = (start + end) / 2
      revenue = v.tier === 2 ? newUsers * custPrice(v, tier.price) * 0.7 + avg * 0.2 * pl : avg * custPrice(v, tier.price) * (v.tier === 1 ? 0.7 : 1)
      variable = fixed + end * 0.02
      v.mrr = whole(revenue / 12)
      break
    }
    case 'store': {
      const organic = cap * d.organic * q * appeal * sat * pull(v)
      newUsers = organic + (ads / cacOf(v)) * sat * adPull
      const retention = between(0.3 + 0.35 * q, 0.2, 0.75)
      end = start * retention + newUsers
      const orders = ((start + end) / 2) * 1.6
      revenue = orders * custPrice(v, tier.price)
      variable = fixed + revenue * (1 - tier.x) + revenue * 0.06
      v.mrr = whole(revenue / 12)
      break
    }
    case 'game': {
      const price = custPrice(v, tier.price)
      const sales = Math.max(0, v.tail * between(appeal, 0.3, 2.5)) + (ads / cacOf(v)) * sat * adPull
      newUsers = sales
      end = start + sales
      revenue = sales * price * 0.7
      v.tail = whole(v.tail * between(0.3 + 0.25 * q, 0.2, 0.6))
      variable = fixed
      v.mrr = whole(revenue / 12)
      break
    }
  }
  v.users = whole(end)
  v.prevMrr = lastMrr
  revenue = whole(revenue)
  const costs = whole(variable + contractors + ads)
  const profit = revenue - costs
  v.revenue = revenue
  v.costs = costs
  v.profit = profit
  res.revenue = revenue

  // Unpaid fines come out of the company account first.
  if (v.owed > 0 && v.cash > 0) {
    const x = Math.min(v.cash, v.owed)
    v.cash -= x
    v.owed -= x
  }

  // Money: your share of profits (after any unpaid fines); losses from company cash, then you.
  if (profit >= 0) {
    const due = Math.min(v.owed, profit)
    v.owed -= due
    const payout = whole((profit - due) * v.stake)
    if (payout > 0) earnIncome(g, payout)
    res.payout = payout
    v.strain = 0
  } else {
    const before = Math.max(0, c.money)
    const paid = coverCosts(g, v, -profit)
    if (paid < -profit) cutBack(v)
    else {
      v.strain = 0
      guardSavings(g, a, v, before)
    }
  }
  // A regulator waiting on its money is patient for about three years.
  const finesDue = v.owed > 0
  if (finesDue) v.strain += 1

  // Product, debt, reach and hype drift.
  const team = Math.max(d.minSkill > 0 ? (absent ? 0 : codingSkill(g) + (hasTalent(g, 'Programming') ? 8 : 0)) + 20 : 50 + c.stats.smarts * 0.2, v.contractors > 0 ? 45 + v.contractors * 7 : 0)
  if (!worked) v.quality -= randInt(g, 1, 4)
  if (v.contractors > 0) v.quality += v.contractors * 1.5
  v.quality = between(Math.round(Math.min(v.quality, Math.max(team, 35))), 5, 100)
  if (d.minSkill > 0) v.debt = between(v.debt + randInt(g, 1, 3) + (end > start * 1.5 ? 2 : 0) + v.contractors, 0, 100)
  v.reach = between(v.reach + (v.type === 'store' ? 0.01 + 0.01 * v.ad : 0.01 + 0.04 * q + 0.015 * v.ad), 0.05, 1)
  v.hype = Math.round(v.hype * 0.4)

  v.history.push({ y: g.year, users: v.users, revenue, profit })
  v.peakUsers = Math.max(v.peakUsers, v.users)
  v.valuation = valuationOf(v)

  if (v.strain >= 3) {
    closeVenture(g, a, v, finesDue ? 'was shut down over unpaid fines' : 'ran out of money')
    res.closed = true
    res.closedBy = finesDue ? 'fines' : 'money'
    return res
  }
  writeVenture(a, v)
  const share = v.stake < 1 ? ' (my share)' : ''
  res.line =
    profit >= 0
      ? `${a.name} had ${unitWord(v, v.users)} and made ${money(revenue)} in revenue; I took home ${money(res.payout)}${share}.`
      : `${a.name} had ${unitWord(v, v.users)} and lost ${money(-profit)} this year.`
  return res
}

/** Pay costs from company cash, then the owner's money. Returns how much was covered. */
function coverCosts(g: GameState, v: VentureData, amount: number): number {
  const need = whole(amount)
  if (need <= 0) return 0
  const fromCash = Math.min(v.cash, need)
  v.cash -= fromCash
  const rest = need - fromCash
  const fromYou = Math.min(rest, Math.max(0, g.character.money))
  if (fromYou > 0) {
    addMoney(g, -fromYou)
    v.invested += fromYou
  }
  return fromCash + fromYou
}

/** Your savings are not a bottomless pit: when a venture eats a big chunk of them, you cut the burn. */
function guardSavings(g: GameState, a: Asset, v: VentureData, before: number): void {
  const fromYou = Math.max(0, before - Math.max(0, g.character.money))
  if (fromYou > 0.4 * before && (v.ad > 0 || v.contractors > 0)) {
    const hadTeam = v.contractors > 0
    v.ad = 0
    v.contractors = Math.max(0, v.contractors - 1)
    log(g, `${a.name} was eating my savings, so I cut its marketing${hadTeam ? ' and let a contractor go' : ''}.`, 'bad')
  }
}

/** Couldn't pay the bills: marketing stops, a contractor leaves, the product suffers. */
function cutBack(v: VentureData): void {
  v.strain += 1
  v.ad = 0
  v.contractors = Math.max(0, v.contractors - 1)
  v.quality = between(v.quality - 4, 5, 100)
}

function launch(g: GameState, v: VentureData): void {
  const q = v.quality / 100
  const cap = marketCap(v)
  const hype = 1 + v.hype / 100
  v.stage = 'live'
  v.progress = 100
  v.launchYear = g.year
  v.hype = between(v.hype + 25, 0, 100)
  if (v.type === 'game') {
    const sales = whole(cap * 0.035 * q * q * hype * tierOf(v).growth * pull(v) * randFloat(g, 0.6, 1.4))
    v.users = sales
    v.tail = whole(sales * between(0.35 + 0.2 * q, 0.2, 0.6))
    v.revenue = whole(sales * custPrice(v, tierOf(v).price) * 0.7)
    v.profit = v.revenue
    v.mrr = whole(v.revenue / 12)
  } else {
    const rate = v.type === 'saas' ? 0.004 : v.type === 'app' ? 0.02 : 0.01
    v.users = whole(cap * rate * Math.pow(q, 1.5) * hype * pull(v) * randFloat(g, 0.6, 1.4)) + randInt(g, 1, 10)
    if (v.type === 'saas') v.mrr = whole(v.users * custPrice(v, tierOf(v).price))
  }
  v.peakUsers = Math.max(v.peakUsers, v.users)
}

export function fitLabel(fit: number): string {
  if (fit < 0.5) return 'Weak (people shrug)'
  if (fit < 0.85) return 'Lukewarm'
  if (fit < 1.3) return 'Solid'
  if (fit < 1.8) return 'Strong'
  return 'Rocket fuel'
}

function reviewLabel(q: number): string {
  if (q >= 90) return 'Overwhelmingly Positive'
  if (q >= 75) return 'Very Positive'
  if (q >= 60) return 'Mostly Positive'
  if (q >= 45) return 'Mixed'
  if (q >= 30) return 'Mostly Negative'
  return 'Overwhelmingly Negative'
}

function launchLine(name: string, v: VentureData): string {
  if (v.type === 'game') return `I launched ${name} on PixelPantry: ${unitWord(v, v.users)} and "${reviewLabel(v.quality)}" reviews.`
  return `I launched ${name}! ${capWord(unitWord(v, v.users))} signed up in the first weeks.`
}

function closeVenture(g: GameState, a: Asset, v: VentureData, why: string): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  withDev(g, (s) => {
    s.shutdowns += 1
  })
  count(g, 'venturesClosed')
  log(g, `${a.name} ${why} and shut down.`, 'bad')
  remember(g, `${a.name} (${v.idea}) shut down after ${Math.max(1, g.year - v.founded)} years.`)
}

// ---------------------------------------------------------------------------
// Events (at most one a year, chosen by yearlyVentures)

interface EventCtx {
  a: Asset
  v: VentureData
}

type EventId =
  | 'outage'
  | 'viral'
  | 'clone'
  | 'bigCustomer'
  | 'acquisition'
  | 'breach'
  | 'cofounderDrama'
  | 'investor'
  | 'cofounderOffer'
  | 'counterfeit'
  | 'lostParcels'
  | 'streamer'
  | 'reviewBomb'
  | 'teacher'

function friendFor(g: GameState): Person | undefined {
  const friends = peopleBy(g, ['bestFriend', 'friend']).filter((p) => p.age >= 12 && p.relationship >= 40)
  return friends.length ? pick(g, friends) : undefined
}

function eligibleEvents(g: GameState, { a, v }: EventCtx): [EventId, number][] {
  const c = g.character
  const out: [EventId, number][] = []
  const pl = priceLevel(v.countryId)
  const live = v.stage === 'live'
  const yearsLive = live ? g.year - v.launchYear : 0
  const code = v.type !== 'store'
  const growth = v.prevMrr > 0 && v.history.length >= 2 ? v.history[v.history.length - 1].revenue / Math.max(1, v.history[v.history.length - 2].revenue) - 1 : 0
  if (live && code && v.type !== 'game' && v.users >= 20) out.push(['outage', 0.8 + v.debt / 25])
  if (live && v.users >= 10) out.push(['viral', 0.6 + (v.quality / 100) * 1.5])
  if (live && code && v.users >= 150 && yearsLive >= 1) out.push(['clone', 0.9])
  if (live && v.type === 'saas' && v.users >= 25) out.push(['bigCustomer', 1.1])
  if (live && yearsLive >= 2 && v.valuation >= 40_000 * pl && v.revenue > 0) out.push(['acquisition', 0.7 + between(growth, 0, 2)])
  if (live && (v.type === 'saas' || v.type === 'app') && v.users >= 100) out.push(['breach', 0.35 + v.debt / 40])
  if (v.cofounder) out.push(['cofounderDrama', 0.6])
  if (live && growth > 0.15 && v.valuation >= 20_000 * pl && v.stake > 0.35 && v.revenue > 0) out.push(['investor', 0.8])
  if (!v.cofounder && (v.stage === 'building' || yearsLive <= 2) && v.stake >= 0.9 && friendFor(g)) out.push(['cofounderOffer', 0.5])
  if (live && v.type === 'store' && v.users >= 15) out.push(['counterfeit', 0.8], ['lostParcels', 0.6])
  if (live && v.type === 'game' && v.users >= 100) {
    // Streamers need streaming; review bombs need a storefront with reviews.
    if (hasTech(g, 'streaming')) out.push(['streamer', 1])
    out.push(['reviewBomb', 0.6])
  }
  if (c.age < 18 && c.education.current && c.education.current.level !== 'preschool' && a.name) out.push(['teacher', 0.5])
  return out
}

function buyerName(g: GameState, v: VentureData): string {
  const words = localNameWords(g)
  const W = COMPANY_WORDS
  if (v.type === 'store') return pick(g, [`${pick(g, W.corpPrefix)} Retail Group`, `a big ${pick(g, ['sneaker', 'fashion', 'resale'])} marketplace`, words.length ? `${pick(g, words)} Commerce` : 'a regional retail chain'])
  if (v.type === 'game') return `${words.length && chance(g, 0.4) ? pick(g, words) : pick(g, W.corpPrefix)} ${pick(g, ['Interactive', 'Games', 'Entertainment', 'Publishing'])}`
  return `${words.length && chance(g, 0.4) ? pick(g, words) : pick(g, W.corpPrefix)} ${pick(g, W.techSuffix)}`
}

function bigLocalCompany(g: GameState): string {
  const words = localNameWords(g)
  return words.length ? `${pick(g, words)} ${pick(g, ['Group', 'Holdings', 'Industries', 'Logistics', 'Foods'])}` : `${pick(g, COMPANY_WORDS.corpPrefix)} ${pick(g, COMPANY_WORDS.corpSuffix)}`
}

/** Show one event popup for this venture. */
function fireEvent(g: GameState, ctx: EventCtx, ev: EventId): void {
  const { a, v } = ctx
  const name = a.name
  const pl = priceLevel(v.countryId)
  const base = { assetId: a.id, ev }
  const show = (title: string, text: string, choices: ChoiceOption[], extra: Record<string, Json> = {}, emoji = a.emoji) =>
    scriptChoice(g, EVENT_SCRIPT, title, text, choices, { emoji, data: { ...base, ...extra } })
  v.lastEvent = g.year
  writeVenture(a, v)
  switch (ev) {
    case 'outage': {
      const hours = randInt(g, 3, 30)
      show('Outage!', `${name} went down for ${hours} hours. ${capWord(unitWord(v, Math.max(1, Math.round(v.users * 0.6))))} noticed. Your inbox is on fire and so, briefly, was a server.`, [
        { id: 'fix', label: 'Pull an all-nighter and fix it properly', emoji: '\u{1F319}' },
        { id: 'blame', label: 'Blame the cloud provider', emoji: '\u{2601}\u{FE0F}' },
        { id: 'apologize', label: 'Post an honest apology', emoji: '\u{1F64F}' },
      ], {}, '\u{1F525}')
      return
    }
    case 'viral': {
      // Before social media, buzz came from TV segments, magazines and email newsletters.
      const social = hasTech(g, 'socialMedia')
      const who = v.type === 'store' ? (social ? 'a fashion influencer' : 'a fashion magazine') : pick(g, social ? ['a huge tech creator', 'a celebrity with 30 million followers', 'a viral video', 'a popular newsletter'] : ['a morning TV segment', 'a famous tech columnist', 'a popular email newsletter', 'a magazine cover story'])
      const boost = adBudget(v.countryId, 2)
      show('Going Viral', `${capWord(who)} just featured ${name}. Traffic is exploding. ${pick(g, ['Your server is sweating.', 'Your phone has not stopped buzzing.', 'Your aunt saw it before you did.'])}`, [
        { id: 'ride', label: `Pour ${formatMoney(boost)} into ads while it's hot`, emoji: '\u{1F4E3}' },
        { id: 'calm', label: 'Enjoy the ride', emoji: '\u{1F60E}' },
        { id: 'price', label: 'Raise prices while demand is high', emoji: '\u{1F4B0}' },
      ], { cost: boost }, '\u{1F680}')
      return
    }
    case 'clone': {
      const lawyer = localFee(g, 6_000)
      show('A Wild Clone Appears', `A well-funded startup just launched a copy of ${name}. Same features, a suspiciously similar logo and ten times your marketing budget.`, [
        { id: 'quality', label: 'Out-build them', emoji: '\u{1F6E0}\u{FE0F}' },
        { id: 'cut', label: 'Cut your prices', emoji: '\u{2702}\u{FE0F}' },
        { id: 'sue', label: `Lawyer up (${formatMoney(lawyer)})`, emoji: '\u{2696}\u{FE0F}' },
        { id: 'ignore', label: 'Ignore them', emoji: '\u{1F648}' },
      ], { cost: lawyer }, '\u{1F47F}')
      return
    }
    case 'bigCustomer': {
      const company = bigLocalCompany(g)
      const seats = randInt(g, 200, 5_000)
      show('Big Fish', `${company}, one of the biggest employers in ${g.character.city}, wants ${name} for ${seats.toLocaleString('en-US')} staff. They also want custom features, an invoice in triplicate and a 40-page security questionnaire.`, [
        { id: 'sign', label: 'Sign the deal', emoji: '\u{270D}\u{FE0F}' },
        { id: 'triple', label: 'Quote them triple', emoji: '\u{1F4B8}' },
        { id: 'decline', label: 'Politely decline', emoji: '\u{1F645}' },
      ], { company, seats }, '\u{1F40B}')
      return
    }
    case 'acquisition': {
      const buyer = buyerName(g, v)
      const offer = niceAmount(v.valuation * randFloat(g, 0.8, 1.6))
      const share = niceAmount(offer * v.stake)
      show('Acquisition Offer', `${capWord(buyer)} wants to buy ${name} for ${formatMoney(offer)}.${v.stake < 1 ? ` Your ${Math.round(v.stake * 100)}% would be worth ${formatMoney(share)}.` : ''} The term sheet uses the word "synergy" eleven times.`, [
        { id: 'accept', label: `Sell for ${money(offer)}`, emoji: '\u{1F91D}' },
        { id: 'counter', label: 'Counteroffer for more', emoji: '\u{1F4C8}' },
        { id: 'decline', label: 'Not for sale', emoji: '\u{1F6AB}' },
      ], { buyer, offer }, '\u{1F4BC}')
      return
    }
    case 'breach': {
      const reg = dataRegulator(v.countryId)
      const firm = localFee(g, 4_000)
      show('Data Breach', `A security researcher emailed you: a hole in ${possessive(name)} code exposed customer data. They found it first. Probably. Legally you're supposed to tell ${reg}${privacyLaw(v.countryId)}.`, [
        { id: 'disclose', label: `Disclose it and notify ${reg}`, emoji: '\u{1F4E2}' },
        { id: 'quiet', label: 'Quietly patch it and hope', emoji: '\u{1F92B}' },
        { id: 'firm', label: `Hire a security firm (${formatMoney(firm)})`, emoji: '\u{1F6E1}\u{FE0F}' },
      ], { cost: firm }, '\u{1F513}')
      return
    }
    case 'cofounderDrama': {
      const want = pick(g, ['pivot the whole company to crypto', `move to ${localPick(g, 'getaway') || 'the beach'} and work "async"`, 'double their equity', 'rename the company to something with "AI" in it'])
      show('Co-Founder Drama', `${v.cofounder}, your co-founder, wants to ${want}. You've had better meetings.`, [
        { id: 'buyout', label: `Buy out their share (${money(niceAmount(v.valuation * cofounderStake(a) * 0.8))})`, emoji: '\u{1F4B5}' },
        { id: 'equity', label: 'Give them more equity', emoji: '\u{1F370}' },
        { id: 'part', label: 'Part ways', emoji: '\u{1F44B}' },
      ], { cost: niceAmount(v.valuation * cofounderStake(a) * 0.8) }, '\u{1F624}')
      return
    }
    case 'investor': {
      const pct = randInt(g, 10, 25)
      const amount = niceAmount((v.valuation * pct) / 100 * randFloat(g, 0.9, 1.3))
      show('Angel Investor', `An angel investor wants to put ${formatMoney(amount)} into ${name} for ${pct}% of the company.${g.character.age < 18 ? ' Since you are a minor, your parents would have to sign. They read all 40 pages, twice.' : ''}`, [
        { id: 'take', label: `Take the ${money(amount)}`, emoji: '\u{1F4B0}' },
        { id: 'negotiate', label: 'Negotiate a better deal', emoji: '\u{1F91D}' },
        { id: 'decline', label: 'Stay independent', emoji: '\u{1F3E0}' },
      ], { pct, amount }, '\u{1F47C}')
      return
    }
    case 'cofounderOffer': {
      const f = friendFor(g)
      if (!f) return
      show('Co-Founder?', `${f.firstName} ${f.lastName}, your friend, wants to join ${name} as a co-founder for 30% of the company. ${pick(g, ['They can code.', 'They are extremely good at talking to people.', 'They have a lot of energy and a whiteboard.'])}`, [
        { id: 'accept', label: 'Welcome aboard!', emoji: '\u{1F91D}' },
        { id: 'decline', label: 'Keep it solo', emoji: '\u{1F64B}' },
      ], { personId: f.id, name: `${f.firstName} ${f.lastName}` }, '\u{1F46F}')
      return
    }
    case 'counterfeit': {
      const product = str(a.details.product, 'sneakers')
      show('Fakes!', `A batch of ${product} from your supplier turned out to be counterfeit. ${pick(g, ['The logo is spelled wrong.', 'One of them squeaks.', 'The "leather" smells like a swimming pool.'])} Some already shipped.`, [
        { id: 'refund', label: 'Refund everyone who bought one', emoji: '\u{1F4B8}' },
        { id: 'sell', label: 'Sell the rest anyway', emoji: '\u{1F92B}' },
      ], { cost: niceAmount(Math.max(50 * pl, v.revenue * 0.1)) }, '\u{1F45F}')
      return
    }
    case 'lostParcels': {
      // A bad week at the courier: a slice of a year's orders, replaced at what the goods cost you.
      const n = Math.round(between(v.users * 1.6 * randFloat(g, 0.03, 0.1), 2, 40))
      const unit = custPrice(v, tierOf(v).price) * (1 - tierOf(v).x)
      show('Lost in the Mail', `The courier lost ${n} of your parcels. The tracking page says they are "in transit." It has said that for six weeks.`, [
        { id: 'replace', label: 'Replace them at your own cost', emoji: '\u{1F4E6}' },
        { id: 'blame', label: 'Tell customers to take it up with the courier', emoji: '\u{1F937}' },
      ], { cost: niceAmount(Math.max(10 * pl, n * unit)) }, '\u{1F4EE}')
      return
    }
    case 'streamer': {
      show('Streamer Spotlight', `A huge streamer played ${name} for six hours straight and screamed the whole time (in a good way). Clips are everywhere.`, [
        { id: 'sale', label: 'Put it on sale while it\'s hot', emoji: '\u{1F3F7}\u{FE0F}' },
        { id: 'hold', label: 'Keep the price', emoji: '\u{1F44D}' },
      ], {}, '\u{1F3A5}')
      return
    }
    case 'reviewBomb': {
      const why = pick(g, ['you changed the font', 'a character they love got a haircut', 'the cat in the game cannot be petted', 'someone thinks it is too hard (it is)'])
      show('Review Bombed', `Players are review-bombing ${name} because ${why}.`, [
        { id: 'patch', label: 'Patch it fast', emoji: '\u{1FA79}' },
        { id: 'reply', label: 'Reply to every review personally', emoji: '\u{1F4AC}' },
        { id: 'ignore', label: 'Ignore it', emoji: '\u{1F648}' },
      ], {}, '\u{1F4A3}')
      return
    }
    case 'teacher': {
      show('Teacher Found Out', `Your teacher found out you run ${name}. Instead of being impressed, they asked you to build the school's new website. For free. "For the experience."`, [
        { id: 'free', label: 'Do it for the experience', emoji: '\u{1F34E}' },
        { id: 'invoice', label: 'Send them an invoice', emoji: '\u{1F9FE}' },
      ], { fee: localFee(g, 300) }, '\u{1F469}\u{200D}\u{1F3EB}')
      return
    }
  }
}

function cofounderStake(a: Asset): number {
  return between(num(a.details.cofounderStake, 0), 0, 0.9)
}

/** Sell the venture: you get your share; the gain is taxed now. */
export function sellVenture(g: GameState, a: Asset, price: number, buyer: string): void {
  const v = readVenture(g, a)
  const proceeds = whole(price * v.stake)
  const { tax } = receiveSale(g, proceeds, v.invested)
  g.assets = g.assets.filter((x) => x.id !== a.id)
  withDev(g, (s) => {
    s.exits.push({ name: a.name, type: v.type, age: g.character.age, amount: proceeds, buyer })
  })
  count(g, 'venturesSold')
  addStat(g, 'happiness', randInt(g, 6, 14))
  const profit = proceeds - v.invested
  remember(g, `Sold ${a.name} to ${buyer} for ${formatMoney(price)}${v.stake < 1 ? ` (my share: ${formatMoney(proceeds)})` : ''}.`)
  log(g, `I sold ${a.name} to ${buyer} for ${formatMoney(price)}.`, 'good')
  notice(
    g,
    'Sold!',
    `You sold ${a.name} to ${buyer} for ${formatMoney(price)}.${v.stake < 1 ? ` Your ${Math.round(v.stake * 100)}% came to ${formatMoney(proceeds)}.` : ''}${profit > 0 ? ` That's ${formatMoney(profit)} more than you ever put in.` : profit < 0 ? ` That's ${formatMoney(-profit)} less than you put in. Startups!` : ''}${tax > 0 ? ` ${formatMoney(tax)} went to taxes.` : ''}${g.character.age < 18 ? ' Your parents made you put most of it in a savings account. Then they framed the contract.' : ''}`,
    { emoji: '\u{1F91D}', tone: 'good' },
  )
}

const EVENT_SCRIPT = defineScript('computer.dev.venture.event', (g, choice, data) => {
  const d = obj(data)
  const a = g.assets.find((x) => x.id === str(d.assetId) && x.kind === 'venture')
  if (!a || !g.character.alive) return
  const v = readVenture(g, a)
  const c = g.character
  const name = a.name
  const cost = whole(num(d.cost))
  const say = (title: string, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral', emoji = a.emoji) => notice(g, title, text, { emoji, tone })
  const lose = (frac: number) => {
    v.users = whole(v.users * (1 - between(frac, 0, 0.9)))
  }
  /**
   * A boost: a share of your current users plus a sliver of the whole market (if they actually
   * want it). A game's players buy it, so for games the boost lands in next year's sales.
   */
  const addUsers = (n: number) => {
    if (v.type === 'game') v.tail = whole(v.tail + n)
    else v.users = whole(v.users + n)
  }
  const nowLine = () => (v.type === 'game' ? 'Wishlists piled up; expect a sales spike next year.' : `${capWord(unitWord(v, v.users))} now.`)
  const gain = (frac: number) => {
    const base = v.type === 'game' ? Math.max(v.tail, v.users * 0.05) : v.users
    addUsers(Math.max(1, base * frac * 5 + marketCap(v) * frac * 0.1 * Math.min(1.5, pull(v))))
  }
  const payNow = (amount: number): boolean => {
    if (amount <= 0) return true
    const fromCash = Math.min(v.cash, amount)
    const rest = amount - fromCash
    if (c.money < rest) return false
    v.cash -= fromCash
    if (rest > 0) {
      addMoney(g, -rest)
      v.invested += rest
    }
    return true
  }
  /** A fine: company cash, then your savings; whatever is left is owed and comes out of future profits. Returns the unpaid part. */
  const payFine = (amount: number): number => {
    const fromCash = Math.min(v.cash, amount)
    v.cash -= fromCash
    const fromYou = Math.min(amount - fromCash, Math.max(0, c.money))
    if (fromYou > 0) {
      addMoney(g, -fromYou)
      v.invested += fromYou
    }
    const rest = whole(amount - fromCash - fromYou)
    v.owed = whole(v.owed + rest)
    return rest
  }
  const done = () => writeVenture(a, v)
  // Arrested between the event and your answer: the company handles it without you.
  if (c.prison) {
    const missed = ['acquisition', 'investor', 'cofounderOffer', 'bigCustomer', 'teacher', 'streamer', 'viral'].includes(str(d.ev))
    if (!missed) {
      lose(randFloat(g, 0.03, 0.08))
      v.quality = between(v.quality - 3, 5, 100)
      done()
    }
    say('Handled Without You', missed ? `You're behind bars, so the opportunity at ${name} came and went without you.` : `You're behind bars, so ${name} had to deal with it without you. It did not go well.`, missed ? 'neutral' : 'bad')
    return
  }
  switch (str(d.ev) as EventId) {
    case 'outage':
      if (choice === 'fix') {
        addStat(g, 'health', -randInt(g, 1, 4))
        addStat(g, 'happiness', -randInt(g, 1, 3))
        const coder = codingSkill(g) >= 20 || v.contractors > 0
        v.debt = between(v.debt - (coder ? randInt(g, 8, 15) : randInt(g, 2, 5)), 0, 100)
        lose(randFloat(g, 0.01, 0.03))
        v.lastWorked = g.year
        if (codingSkill(g) >= 20) practice(g, 2, null)
        done()
        say(
          'Fixed',
          coder
            ? 'You fixed it by 5 AM. You also found three other bugs and one comment from yourself that just says "sorry." Tech debt went down.'
            : 'You spent the night on the phone with the freelancer who built it, repeating "have you tried turning it off and on again?" It worked. Eventually.',
          'good',
        )
      } else if (choice === 'blame') {
        addHidden(g, 'karma', -2)
        if (chance(g, 0.55)) {
          lose(0.01)
          done()
          say('Nobody Checked', 'You posted that the cloud provider had "a massive incident." Nobody checked. You got away with it, and you feel a little bit worse as a person.')
        } else {
          lose(randFloat(g, 0.05, 0.1))
          v.quality = between(v.quality - 3, 5, 100)
          done()
          say('Busted', "The cloud provider's status page was green all day. Someone posted the screenshot next to yours. The replies were brutal.", 'bad')
        }
      } else {
        lose(randFloat(g, 0.02, 0.04))
        v.quality = between(v.quality + 2, 5, 100)
        v.hype = between(v.hype + 5, 0, 100)
        done()
        say('Honest Apology', `Your apology was so honest that people shared it. A few customers left; the rest said they trust ${name} more now.`, 'good')
      }
      return
    case 'viral':
      if (choice === 'ride') {
        if (payNow(cost)) {
          gain(randFloat(g, 0.04, 0.1))
          // Ads bought while everyone is already looking go twice as far (if people want the thing).
          addUsers((cost / cacOf(v)) * 2 * Math.sqrt(v.fit) * Math.max(0, 1 - v.users / marketCap(v)))
          v.hype = between(v.hype + 50, 0, 100)
          done()
          say('Rocket Fuel', `You spent ${formatMoney(cost)} on ads while everyone was watching. ${v.type === 'game' ? 'Sales' : v.type === 'store' ? 'Orders' : 'Sign-ups'} went vertical. ${nowLine()}`, 'good')
        } else {
          gain(randFloat(g, 0.02, 0.05))
          v.hype = between(v.hype + 35, 0, 100)
          done()
          say('Broke but Viral', `You wanted to pour money into ads but couldn't afford ${formatMoney(cost)}. The free attention still helped. ${nowLine()}`, 'good')
        }
      } else if (choice === 'price') {
        if (v.tier < 2) priceHikeLoss(g, v, 1, 0.3)
        v.tier = Math.min(2, v.tier + 1)
        gain(randFloat(g, 0.01, 0.03))
        v.hype = between(v.hype + 25, 0, 100)
        done()
        say('Price Hike', `You raised prices to ${tierOf(v).label}. A few people grumbled. Most paid.`, 'good')
      } else {
        gain(randFloat(g, 0.02, 0.06))
        v.hype = between(v.hype + 40, 0, 100)
        done()
        say('Enjoying It', `You refreshed the analytics page 400 times a day. ${nowLine()}`, 'good')
      }
      return
    case 'clone':
      if (choice === 'quality') {
        const skill = codingSkill(g)
        const up = skill >= 30 || v.contractors > 0 ? randInt(g, 4, 9) : randInt(g, 0, 2)
        v.quality = between(v.quality + up, 5, 100)
        v.debt = between(v.debt + 6, 0, 100)
        lose(randFloat(g, 0.02, 0.06))
        v.lastWorked = g.year
        if (skill > 0) practice(g, 2, null)
        done()
        say('Out-Built', up >= 4 ? `You shipped feature after feature. Reviewers called ${name} "the original, and still the best."` : "You tried to out-build them, but you're stretched thin. It's a stalemate.", up >= 4 ? 'good' : 'neutral')
      } else if (choice === 'cut') {
        v.tier = Math.max(0, v.tier - 1)
        lose(randFloat(g, 0.01, 0.04))
        done()
        say('Price War', `You cut prices to ${tierOf(v).label}. Your customers stayed. Your margins cried quietly.`)
      } else if (choice === 'sue') {
        if (!payNow(cost)) {
          lose(randFloat(g, 0.05, 0.12))
          done()
          say('No Lawyer', `You couldn't afford ${formatMoney(cost)} for a lawyer. The clone took a chunk of your ${def(v).unit[1]}.`, 'bad')
        } else if (chance(g, 0.3)) {
          v.hype = between(v.hype + 20, 0, 100)
          done()
          say('Victory', `Your lawyer sent a letter so scary the clone rebranded overnight. Worth every one of the ${formatMoney(cost)}.`, 'good')
        } else {
          lose(randFloat(g, 0.04, 0.1))
          done()
          say('Lawyered', `You spent ${formatMoney(cost)} on lawyers. The judge said "ideas aren't property." The clone is still out there.`, 'bad')
        }
      } else {
        lose(randFloat(g, 0.06, 0.15))
        done()
        say('Ignored', `You ignored the clone. Some of your ${def(v).unit[1]} did not.`, 'bad')
      }
      return
    case 'bigCustomer': {
      const seats = whole(num(d.seats, 500))
      const company = str(d.company, 'A big company')
      // A whale for a tiny company, but not bigger than the company itself.
      const equiv = Math.round(between(seats / randInt(g, 30, 60), 3, Math.max(5, v.users * 0.5)))
      if (choice === 'sign') {
        v.users += equiv
        v.debt = between(v.debt + 10, 0, 100)
        v.quality = between(v.quality + 2, 5, 100)
        done()
        say('Deal!', `${company} signed! It's like ${unitWord(v, equiv)} at once. You also promised them three features you haven't built yet. Tech debt went up.`, 'good')
      } else if (choice === 'triple') {
        if (chance(g, 0.45)) {
          v.users += Math.round(equiv * 2.5)
          v.debt = between(v.debt + 12, 0, 100)
          done()
          say('They Said Yes', `${company} didn't even blink at triple the price. You realize you've been undercharging your whole life.`, 'good')
        } else {
          say('They Walked', `${company} said your quote was "aspirational" and went with a competitor.`, 'bad')
        }
      } else {
        say('Declined', `You turned down ${company}. Your accountant fainted. Your weekends are safe.`)
      }
      return
    }
    case 'acquisition': {
      const offer = whole(num(d.offer))
      const buyer = str(d.buyer, 'A bigger company')
      if (offer <= 0) return
      if (choice === 'accept') return sellVenture(g, a, offer, buyer)
      if (choice === 'counter') {
        if (chance(g, 0.45)) return sellVenture(g, a, niceAmount(offer * randFloat(g, 1.1, 1.3)), buyer)
        v.hype = between(v.hype - 5, 0, 100)
        done()
        say('Deal Off', `${capWord(buyer)} said "we'll circle back," which means never. ${name} is still yours.`, 'bad')
        return
      }
      log(g, `I turned down an offer for ${name}.`)
      say('Not for Sale', `You told ${buyer} ${name} isn't for sale. They said that's what everyone says.`)
      return
    }
    case 'breach': {
      const reg = dataRegulator(v.countryId)
      const smallFine = niceAmount(Math.min(localFee(g, 2_000) + v.users * 0.5 * priceLevel(v.countryId), localFee(g, 60_000)))
      const bigFine = niceAmount(Math.min(localFee(g, 20_000) + v.users * 3 * priceLevel(v.countryId), localFee(g, 500_000)))
      if (choice === 'disclose') {
        const unpaid = payFine(smallFine)
        lose(randFloat(g, 0.04, 0.1))
        v.debt = between(v.debt - 6, 0, 100)
        addHidden(g, 'karma', 2)
        done()
        say('Disclosed', `You came clean. ${capWord(reg)} fined ${name} ${formatMoney(smallFine)}${unpaid > 0 ? ` (${formatMoney(unpaid)} of it is still owed and comes out of future profits)` : ''} and praised your "prompt notification." Some customers left; the rest appreciated the honesty.`, 'neutral')
      } else if (choice === 'firm') {
        if (payNow(cost)) {
          v.debt = between(v.debt - 15, 0, 100)
          v.quality = between(v.quality + 3, 5, 100)
          lose(0.02)
          done()
          say('Locked Down', `The security firm patched the hole, found four more, and wrote a report so long it has chapters. ${name} is safer now.`, 'good')
        } else {
          lose(randFloat(g, 0.04, 0.08))
          done()
          say('Patched Alone', `You couldn't afford ${formatMoney(cost)}, so you patched it yourself at 3 AM. You think you got it all.`, 'neutral')
        }
      } else {
        addHidden(g, 'karma', -4)
        if (chance(g, 0.5)) {
          const unpaid = payFine(bigFine)
          lose(randFloat(g, 0.15, 0.3))
          v.quality = between(v.quality - 8, 5, 100)
          addHidden(g, 'notoriety', 2)
          done()
          say('Cover-Up Exposed', `A journalist found out about the breach before your customers did. ${capWord(reg)} fined ${name} ${formatMoney(bigFine)}${privacyLaw(v.countryId)}${unpaid > 0 ? ` (${formatMoney(unpaid)} of it is still owed; the regulator takes it out of future profits before you see a cent)` : ''}, and "${name} breach" trended for two days.`, 'bad')
        } else {
          done()
          say('Quietly Patched', 'You patched it quietly. Nobody ever found out. You check the news every morning now, just in case.')
        }
      }
      return
    }
    case 'cofounderDrama': {
      const cs = cofounderStake(a)
      if (choice === 'buyout') {
        if (cs > 0 && payNow(cost)) {
          v.stake = between(v.stake + cs, 0.01, 1)
          a.details.cofounderStake = 0
          const who = v.cofounder
          v.cofounder = ''
          done()
          say('Bought Out', `You bought out ${who} for ${formatMoney(cost)}. You now own ${Math.round(v.stake * 100)}% of ${name}. The office is very quiet.`, 'good')
        } else {
          v.quality = between(v.quality - 3, 5, 100)
          done()
          say('Stalemate', `You couldn't afford to buy out ${v.cofounder}. You're stuck together, communicating mainly through passive-aggressive commit messages.`, 'bad')
        }
      } else if (choice === 'equity') {
        const give = Math.min(v.stake - 0.05, 0.1)
        if (give > 0) {
          v.stake -= give
          a.details.cofounderStake = between(cs + give, 0, 0.95)
        }
        v.quality = between(v.quality + 3, 5, 100)
        done()
        say('Peace Treaty', `You gave ${v.cofounder} another ${Math.round(give * 100)}% of the company. They're motivated again. You own ${Math.round(v.stake * 100)}% now.`)
      } else {
        const who = v.cofounder
        v.cofounder = ''
        v.quality = between(v.quality - randInt(g, 5, 10), 5, 100)
        if (v.stage === 'building') v.progress = between(v.progress - 15, 0, 100)
        done()
        say('Parted Ways', `${who} left. They kept their shares, the good chair and the only copy of the database password. It took a week to recover.`, 'bad')
      }
      return
    }
    case 'investor': {
      let pct = between(num(d.pct, 15), 1, 40) / 100
      let amount = whole(num(d.amount))
      if (choice === 'decline') {
        say('Independent', `You turned the money down. ${name} stays yours.`)
        return
      }
      if (choice === 'negotiate') {
        if (chance(g, 0.5)) {
          pct = pct * 0.7
          say('Better Terms', 'They grumbled, then agreed to take a smaller slice for the same money.', 'good')
        } else {
          say('Walked Away', 'The investor said "I love the hustle" and invested in your clone instead.', 'bad')
          return
        }
      }
      amount = Math.max(1, amount)
      const cs = cofounderStake(a)
      v.stake = between(v.stake * (1 - pct), 0.01, 1)
      if (cs > 0) a.details.cofounderStake = between(cs * (1 - pct), 0, 0.95)
      v.cash += amount
      v.valuation = Math.max(v.valuation, whole(amount / pct))
      done()
      count(g, 'fundraises')
      log(g, `I raised ${formatMoney(amount)} for ${name}.`, 'good')
      if (choice === 'take') say('Funded', `You raised ${formatMoney(amount)} for ${Math.round(pct * 100)}% of ${name}. The money sits in the company account for growth and losses. You own ${Math.round(v.stake * 100)}% now.`, 'good', '\u{1F4B0}')
      else notice(g, 'Funded', `${formatMoney(amount)} is in the company account. You own ${Math.round(v.stake * 100)}% of ${name} now.`, { emoji: '\u{1F4B0}', tone: 'good' })
      return
    }
    case 'cofounderOffer': {
      const p = g.people.find((x) => x.id === str(d.personId))
      if (choice !== 'accept' || !p) {
        if (p) addRelationship(p, -randInt(g, 2, 6))
        say('Solo', 'You decided to keep going alone. Your friend said "no worries" in a tone that suggested worries.')
        return
      }
      const give = v.stake * 0.3
      v.stake -= give
      a.details.cofounderStake = between(cofounderStake(a) + give, 0, 0.95)
      v.cofounder = str(d.name, p.firstName)
      v.quality = between(v.quality + randInt(g, 3, 7), 5, 100)
      if (v.stage === 'building') v.progress = between(v.progress + 25, 0, 100)
      addRelationship(p, randInt(g, 6, 12))
      done()
      log(g, `${p.firstName} joined ${name} as my co-founder.`, 'good')
      say('Co-Founders', `${p.firstName} is officially your co-founder. You celebrated with ${localPick(g, 'food') || 'pizza'} and a 40-slide pitch deck. You own ${Math.round(v.stake * 100)}% now.`, 'good')
      return
    }
    case 'counterfeit':
      if (choice === 'refund') {
        if (!payNow(cost)) lose(0.05)
        addHidden(g, 'karma', 2)
        v.quality = between(v.quality + 3, 5, 100)
        done()
        say('Refunded', `You refunded everyone and dumped the supplier. Customers posted about how decent you were. ${cost > 0 ? `It cost about ${formatMoney(cost)}.` : ''}`.trim(), 'good')
      } else {
        addHidden(g, 'karma', -6)
        if (chance(g, 0.5)) {
          const extra = whole(cost * 0.8)
          if (extra > 0) earnNow(g, extra)
          done()
          say('Got Away With It', `Nobody noticed. You made an extra ${formatMoney(extra)} and a little bit of your soul left your body.`, 'neutral')
        } else {
          lose(randFloat(g, 0.15, 0.3))
          v.quality = between(v.quality - 15, 5, 100)
          done()
          say('One-Star Avalanche', `Customers noticed. The reviews were savage. Someone made a video titled "${name} sold me FAKE ${str(a.details.product, 'stuff').toUpperCase()}."`, 'bad')
        }
      }
      return
    case 'lostParcels':
      if (choice === 'replace') {
        if (!payNow(cost)) {
          v.quality = between(v.quality - 6, 5, 100)
          done()
          say('Couldn\'t Cover It', `You couldn't afford ${formatMoney(cost)} to replace them. You issued store credit and a heartfelt apology.`, 'bad')
          return
        }
        v.quality = between(v.quality + 2, 5, 100)
        done()
        say('Replaced', `You re-shipped everything at your own cost (${formatMoney(cost)}). Customers were impressed.`, 'good')
      } else {
        v.quality = between(v.quality - 7, 5, 100)
        lose(0.05)
        done()
        say('Blame Game', 'Your customers did not want to take it up with the courier. They took it up with your reviews.', 'bad')
      }
      return
    case 'streamer': {
      const extra = whole(Math.max(v.tail, v.users * 0.1, 20) * (choice === 'sale' ? randFloat(g, 0.8, 1.4) : randFloat(g, 0.4, 0.8)))
      const price = custPrice(v, tierOf(v).price) * (choice === 'sale' ? 0.6 : 1)
      const revenue = whole(extra * price * 0.7)
      v.users += extra
      v.hype = between(v.hype + 40, 0, 100)
      if (revenue > 0) earnNow(g, whole(revenue * v.stake))
      done()
      say('Sales Spike', `${capWord(plural(extra, 'new player'))} bought ${name} in a week, bringing in ${formatMoney(revenue)}.${choice === 'sale' ? ' The sale made it an impulse buy.' : ''}`, 'good')
      return
    }
    case 'reviewBomb':
      if (choice === 'patch') {
        v.quality = between(v.quality + randInt(g, 2, 5), 5, 100)
        v.lastWorked = g.year
        done()
        say('Patched', 'You patched it within a day. The review bombers moved on to someone else\'s game.', 'good')
      } else if (choice === 'reply') {
        if (chance(g, 0.5)) {
          v.hype = between(v.hype + 15, 0, 100)
          done()
          say('Charmed Them', 'Your replies were so funny that people started buying the game just to read them.', 'good')
        } else {
          v.quality = between(v.quality - 4, 5, 100)
          done()
          say('Fed the Trolls', 'You argued with 300 strangers. You won zero arguments.', 'bad')
        }
      } else {
        v.quality = between(v.quality - 3, 5, 100)
        lose(0.02)
        done()
        say('It Passed', `It blew over eventually. ${possessive(name)} rating took a hit.`)
      }
      return
    case 'teacher': {
      const cur = c.education.current
      if (choice === 'free') {
        addHidden(g, 'karma', 2)
        addStat(g, 'happiness', -2)
        if (cur && cur.level !== 'preschool') cur.grades = Math.round(between(cur.grades + 2, 0, 100))
        log(g, 'I built my school a website for free.', 'good')
        say('For the Experience', 'You built the school a website. Your teacher loved it. Your grades mysteriously improved. Coincidence.', 'good', '\u{1F34E}')
      } else {
        const fee = whole(num(d.fee, 100))
        if (chance(g, 0.4)) {
          if (fee > 0) earnNow(g, fee)
          say('Paid in Full', `The school actually paid your ${formatMoney(fee)} invoice. The principal called you "a little capitalist," fondly.`, 'good', '\u{1F9FE}')
        } else {
          if (cur && cur.level !== 'preschool') cur.grades = Math.round(between(cur.grades - 3, 0, 100))
          say('Detention', 'You got detention for "attitude." You spent it planning features.', 'bad', '\u{1F9FE}')
        }
      }
      return
    }
  }
})

// ---------------------------------------------------------------------------
// Yearly

/** Yearly hook for ventures. `popupBudget` = how many popups this side may still show (0 or 1). Returns popups used. */
export function yearlyVentures(g: GameState, popupBudget: number): number {
  const c = g.character
  const list = allVentureAssets(g)
  if (list.length === 0) return 0
  const absent = !!c.prison
  let used = 0
  const launches: string[] = []
  let payouts = 0
  for (const a of list) {
    const r = stepVenture(g, a, absent)
    if (r.line) log(g, r.line, r.launched || r.payout > 0 ? 'good' : 'neutral')
    if (r.launched) {
      launches.push(a.id)
      count(g, 'ventureLaunches')
      remember(g, `Launched ${a.name}.`)
    }
    if (r.closed && used < popupBudget) {
      used++
      notice(
        g,
        'Shut Down',
        r.closedBy === 'fines'
          ? `${a.name} never paid off its fine, and the regulator ran out of patience before you ran out of excuses. The company was wound up. You still have the domain name and the hoodies.`
          : `${a.name} ran out of money. You couldn't cover the losses three years in a row, so you shut it down. You still have the domain name and the hoodies.`,
        { emoji: '\u{1FAA6}', tone: 'bad' },
      )
    }
    payouts += r.payout
  }
  if (payouts > 0) count(g, 'ventureIncome', payouts)
  if (used >= popupBudget || absent) return used
  // A launch gets the popup; otherwise maybe one event.
  if (launches.length) {
    const a = g.assets.find((x) => x.id === launches[0])
    if (a) {
      const v = readVenture(g, a)
      used++
      const verdict = v.type === 'game' ? `Reviews: "${reviewLabel(v.quality)}." ${capWord(unitWord(v, v.users))} bought it in the first year.` : `${capWord(unitWord(v, v.users))} signed up in the first few weeks.`
      notice(g, 'Launch Day!', `${a.name} is live! ${verdict} ${pick(g, ['You refreshed the dashboard until your thumb went numb.', 'Your first ever customer email was a complaint. You framed it.', 'Your family pretended to understand what it does.'])}`, { emoji: a.emoji, tone: 'good' })
    }
    return used
  }
  if (!chance(g, 0.4)) return used
  const options: [EventCtx, EventId, number][] = []
  for (const a of allVentureAssets(g)) {
    const v = readVenture(g, a)
    if (v.lastEvent === g.year) continue
    for (const [ev, w] of eligibleEvents(g, { a, v })) options.push([{ a, v }, ev, w])
  }
  if (options.length === 0) return used
  const [ctx, ev] = weightedPick(g, options, (o) => o[2])
  fireEvent(g, ctx, ev)
  return used + 1
}

// ---------------------------------------------------------------------------
// The venture dashboard (owned-asset screen) and actions

function liveVenture(g: GameState, id: string): Asset | undefined {
  return g.assets.find((x) => x.id === id && x.kind === 'venture')
}

function workOn(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const d = def(v)
  const reason = computerBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  if (!useYearAction(g, `computer.dev.work.${a.id}`, 2)) return notice(g, a.name, `You already worked on ${a.name} twice this year. Burnout is not a growth strategy.`, { emoji: a.emoji })
  useComputer(g, 1)
  const skill = codingSkill(g)
  v.lastWorked = g.year
  let text: string
  if (v.type === 'store') {
    v.quality = between(v.quality + randInt(g, 3, 7), 5, 100)
    v.users += randInt(g, 1, 6)
    text = pick(g, [`You restocked, photographed everything on a bedsheet backdrop and wrote very convincing descriptions.`, `You packed 80 orders at the kitchen table and only taped your hand to a box once.`, `You found a great deal on new stock and took 300 photos of it.`])
  } else if (v.stage === 'building') {
    const add = Math.round(d.buildRate * (0.4 + skill / 100) * 0.45 * randFloat(g, 0.8, 1.2))
    v.progress = between(v.progress + add, 0, 99)
    // You can polish it up to what your skill allows; you never make it worse by working on it.
    v.quality = between(Math.min(v.quality + randInt(g, 1, 3) * (skill >= 50 ? 2 : 1), Math.max(v.quality, 30, skill + 25)), 5, 100)
    practice(g, 2, bestLanguageFor(g, d.use)?.id ?? null, 1.2)
    text = `You coded for ${randInt(g, 3, 9)} days straight. ${a.name} is now ${Math.round(v.progress)}% done.`
  } else if (skill < 15) {
    // Inherited (or freelancer-built) code you can't read: you do the non-coding work instead.
    v.quality = between(Math.min(v.quality + 1, Math.max(v.quality, 40)), 5, 100)
    v.hype = between(v.hype + 4, 0, 100)
    text = pick(g, [
      "You can't read a line of the code, so you answered 200 support emails and wrote very enthusiastic release notes for features you don't understand.",
      "You opened the code, closed it, and spent the week on customer calls instead. Customers liked you. The bugs did not notice.",
    ])
  } else {
    const up = Math.round(randInt(g, 2, 6) * between(skill / 55, 0.3, 1.6))
    v.quality = between(Math.min(v.quality + up, Math.max(v.quality, 35, skill + 25 + v.contractors * 5)), 5, 100)
    v.debt = between(v.debt + randInt(g, 2, 5), 0, 100)
    v.hype = between(v.hype + 5, 0, 100)
    practice(g, 2, bestLanguageFor(g, d.use)?.id ?? null, 1.2)
    text = pick(g, [`You shipped a big update. ${up >= 5 ? 'Users loved it.' : 'Users noticed. Some of them.'}`, `You shipped the feature everyone asked for. Now they're asking for a different one.`, `You rewrote the onboarding. Fewer people get lost now.`])
  }
  writeVenture(a, v)
  log(g, `I worked on ${a.name}.`, 'good')
  notice(g, d.workLabel, `${text}\n\n${v.type === 'store' ? 'Reputation' : 'Quality'}: ${Math.round(v.quality)}/100${d.minSkill > 0 && v.stage === 'live' ? ` · Tech debt: ${v.debt}/100` : ''}`, { emoji: a.emoji, tone: 'good' })
}

function fixDebt(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = computerBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  if (!useYearAction(g, `computer.dev.debt.${a.id}`, 1)) return notice(g, a.name, 'You already did a cleanup sprint this year.', { emoji: '\u{1F9F9}' })
  useComputer(g, 1)
  const skill = codingSkill(g)
  const cut = Math.round(randInt(g, 8, 16) * between(0.5 + skill / 80 + v.contractors * 0.15, 0.4, 2))
  v.debt = between(v.debt - cut, 0, 100)
  v.quality = between(v.quality + 1, 5, 100)
  v.lastWorked = g.year
  practice(g, 2, bestLanguageFor(g, def(v).use)?.id ?? null, 1)
  writeVenture(a, v)
  notice(g, 'Cleanup Sprint', `${pick(g, ['You deleted 4,000 lines of code and everything still works. Mostly.', 'You finally renamed the variable called "thing2."', 'You wrote tests. Several of them even pass.'])} Tech debt: ${v.debt}/100.`, { emoji: '\u{1F9F9}', tone: 'good' })
}

function promote(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  if (!useYearAction(g, `computer.dev.promote.${a.id}`, 1)) return notice(g, a.name, 'You already promoted it this year. Your followers are starting to mute you.', { emoji: '\u{1F4E3}' })
  const followers = totalFollowers(g)
  const reach = Math.min(marketCap(v) * 0.05, followers * 0.002 * (0.5 + v.quality / 100))
  const added = whole(reach * randFloat(g, 0.5, 1.5))
  v.users += added
  v.hype = between(v.hype + Math.min(40, Math.log10(Math.max(10, followers)) * 6), 0, 100)
  writeVenture(a, v)
  notice(g, 'Shameless Plug', `You posted about ${a.name} to your ${shortCount(followers)} followers. ${added > 0 ? `${capWord(unitWord(v, added))} came from it.` : 'Three people liked it. One was your aunt.'}`, { emoji: '\u{1F4E3}', tone: added > 0 ? 'good' : 'neutral' })
}

function makeDlc(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = computerBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  if (!useYearAction(g, `computer.dev.dlc.${a.id}`, 1)) return notice(g, a.name, 'One expansion a year. Your players need time to complain about the last one.', { emoji: '\u{1F381}' })
  useComputer(g, 2)
  const skill = codingSkill(g)
  const q = between((skill + v.quality) / 2 + randInt(g, -15, 15), 0, 100)
  v.lastWorked = g.year
  practice(g, 2, bestLanguageFor(g, 'games')?.id ?? null, 1)
  if (q < 35) {
    v.quality = between(v.quality - 4, 5, 100)
    writeVenture(a, v)
    return notice(g, 'Expansion Flopped', `The expansion added a fishing minigame nobody asked for. Reviews: "${reviewLabel(q)}."`, { emoji: '\u{1F41F}', tone: 'bad' })
  }
  // An expansion sells to people who liked the game: fit matters as much as polish.
  v.tail = whole(v.tail + marketCap(v) * 0.015 * (q / 100) * (q / 100) * pull(v))
  v.quality = between(v.quality + randInt(g, 1, 4), 5, 100)
  v.hype = between(v.hype + 20, 0, 100)
  writeVenture(a, v)
  log(g, `I released an expansion for ${a.name}.`, 'good')
  notice(g, 'Expansion Released', `You released a new expansion for ${a.name}. Reviews: "${reviewLabel(q)}." Sales should pick up next year.`, { emoji: '\u{1F381}', tone: 'good' })
}

/**
 * Raising prices on existing customers makes some of them leave (SaaS and stores bill them
 * again). The bigger the jump, the bigger the exodus: tripling the price loses about half.
 */
function priceHikeLoss(g: GameState, v: VentureData, steps: number, scale = 1): number {
  if (steps <= 0 || v.stage !== 'live' || (v.type !== 'saas' && v.type !== 'store')) return 0
  const tiers = def(v).tiers
  const from = tiers[between(v.tier, 0, 2)].price
  const to = tiers[between(v.tier + steps, 0, 2)].price
  const keep = Math.sqrt(from / Math.max(from, to)) * randFloat(g, 0.9, 1.08)
  const loss = between((1 - keep) * scale, 0, 0.85)
  const lost = whole(v.users * loss)
  v.users = whole(v.users - lost)
  return lost
}

function setTier(g: GameState, id: string, tier: number): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  const next = between(tier, 0, 2)
  if (next === v.tier) return
  if (!useYearAction(g, `computer.dev.price.${a.id}`, 1)) return notice(g, 'Pricing', 'You already changed prices this year. Customers hate whiplash.', { emoji: '\u{1F3F7}\u{FE0F}' })
  const lost = priceHikeLoss(g, v, next - v.tier)
  if (next < v.tier) v.hype = between(v.hype + 8 * (v.tier - next), 0, 100)
  v.tier = next
  writeVenture(a, v)
  const effect = lost > 0 ? ` ${capWord(unitWord(v, lost))} left over the price hike.` : ''
  notice(g, 'Pricing', `${a.name} is now ${tierOf(v).label}: ${tierPriceLabel(v)}. ${v.tier === 2 ? 'Fewer customers, more money each.' : v.tier === 0 ? 'More customers, less money each.' : 'Right down the middle.'}${effect}`, { emoji: '\u{1F3F7}\u{FE0F}' })
}

function setAds(g: GameState, id: string, level: number): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  v.ad = between(level, 0, 3)
  writeVenture(a, v)
  const cost = adBudget(v.countryId, v.ad)
  notice(g, 'Marketing', v.ad === 0 ? `You stopped all marketing for ${a.name}. Word of mouth it is.` : `${AD_LEVELS[v.ad]}: ${formatMoney(cost)} a year on ads for ${a.name}, paid from its revenue (or your pocket).`, { emoji: '\u{1F4E3}' })
}

function hire(g: GameState, id: string, delta: number): void {
  const a = liveVenture(g, id)
  if (!a) return
  const v = readVenture(g, a)
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  const next = between(v.contractors + delta, 0, 5)
  if (next === v.contractors) return notice(g, a.name, delta > 0 ? 'Five contractors is the most you can manage from a bedroom.' : 'There is nobody left to let go.', { emoji: '\u{1F477}' })
  v.contractors = next
  writeVenture(a, v)
  const cost = contractorCost(v.countryId, v.type)
  const who = v.type === 'store' ? pick(g, ['a part-time packer', 'a product photographer', 'a customer-service whiz']) : pick(g, ['a freelance developer', 'a designer who only wears black', 'a backend contractor', 'a QA tester who breaks everything'])
  notice(g, delta > 0 ? 'Hired' : 'Let Go', delta > 0 ? `You hired ${who} for ${a.name} at about ${formatMoney(cost)} a year. Team size: ${v.contractors}.` : `You let a contractor go. Team size: ${v.contractors}. They took the office plant.`, { emoji: '\u{1F477}' })
}

interface Offer {
  buyer: string
  amount: number
}

function sellOffers(g: GameState, v: VentureData): Offer[] {
  const val = Math.max(1, v.valuation)
  const pl = priceLevel(v.countryId)
  const f = (lo: number, hi: number) => Math.max(niceAmount(50 * pl), niceAmount(val * randFloat(g, lo, hi)))
  if (v.stage === 'building' || v.revenue <= 0) {
    return [
      { buyer: 'a buyer on a startup marketplace', amount: f(0.3, 0.7) },
      { buyer: `${randomFirstName(g, g.character.countryId, chance(g, 0.5) ? 'male' : 'female')}, a developer who "sees potential"`, amount: f(0.4, 0.9) },
    ]
  }
  return [
    { buyer: 'a buyer on a startup marketplace', amount: f(0.5, 0.85) },
    { buyer: buyerName(g, v), amount: f(0.65, 1.05) },
    { buyer: buyerName(g, v), amount: f(0.7, 1.15) },
  ]
}

const SELL_SCRIPT = defineScript('computer.dev.venture.sell', (g, choice, data) => {
  if (choice === 'keep') return
  const d = obj(data)
  const a = liveVenture(g, str(d.assetId))
  if (!a || lifeBlock(g)) return
  const offers = Array.isArray(d.offers) ? d.offers.map(obj) : []
  const o = offers[Number(choice.replace('offer', ''))]
  if (!o) return
  sellVenture(g, a, whole(num(o.amount)), str(o.buyer, 'a buyer'))
})

/**
 * This year's offers. They stand until next year: putting it up for sale again just shows the
 * same buyers (no re-rolling until someone overpays).
 */
function yearOffers(g: GameState, a: Asset, v: VentureData): Offer[] {
  const cached = obj(a.details.sellOffers)
  if (num(cached.year) === g.year && Array.isArray(cached.list)) {
    const list = cached.list.map(obj).map((o) => ({ buyer: str(o.buyer, 'a buyer'), amount: whole(num(o.amount)) })).filter((o) => o.amount > 0)
    if (list.length) return list
  }
  const offers = sellOffers(g, v)
  a.details.sellOffers = { year: g.year, list: toJson(offers) }
  return offers
}

function sell(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  const v = readVenture(g, a)
  const offers = yearOffers(g, a, v)
  scriptChoice(
    g,
    SELL_SCRIPT,
    `Sell ${a.name}`,
    `You put ${a.name} up for sale (valuation ${money(v.valuation)}${v.stake < 1 ? `, you own ${Math.round(v.stake * 100)}%` : ''}${v.owed > 0 ? `, ${money(v.owed)} in unpaid fines` : ''}). Offers came in. They stand until next year:`,
    [...offers.map((o, i) => ({ id: `offer${i}`, label: `${money(o.amount)} from ${o.buyer}`, emoji: '\u{1F4B5}' })), { id: 'keep', label: 'Keep it', emoji: '\u{2716}\u{FE0F}' }],
    { emoji: a.emoji, data: { assetId: a.id, offers: toJson(offers) } },
  )
}

function shutDown(g: GameState, id: string): void {
  const a = liveVenture(g, id)
  if (!a) return
  const reason = lifeBlock(g)
  if (reason) return notice(g, a.name, reason, { emoji: a.emoji })
  const v = readVenture(g, a)
  // Salvage is what the domain and code fetch; any company cash goes back to the investors first.
  const salvage = whole(Math.max(0, v.valuation - v.cash) * v.stake * 0.03)
  closeVenture(g, a, v, 'was closed by its founder')
  if (salvage > 0) addMoney(g, salvage)
  addStat(g, 'happiness', -randInt(g, 2, 6))
  const investors = v.cash > 0 ? ` The ${formatMoney(v.cash)} left in the company account went back to your investors, who sent a very short email.` : ''
  notice(g, 'Shut Down', `You shut down ${a.name}. ${salvage > 0 ? `You sold the domain name and the code for ${formatMoney(salvage)}.` : 'You kept the domain name. For sentimental reasons.'}${investors} ${pick(g, ['You wrote a long post about "lessons learned."', 'You still have 40 branded hoodies.', 'Your users were sad. Well, three of them.'])}`, { emoji: '\u{1FAA6}' })
}

/** Dashboard rows for a venture. */
export function ventureInfo(g: GameState, a: Asset): MenuNode[] {
  const v = readVenture(g, a)
  const d = def(v)
  const rows: string[] = []
  rows.push(`${d.emoji} ${d.label}: ${v.idea}`)
  if (v.stage === 'building') rows.push(`\u{1F6E0}\u{FE0F} Building: ${Math.round(v.progress)}% done${v.hired ? ' (a freelancer is on it)' : ''}`)
  else rows.push(`\u{1F680} Live since ${v.launchYear || v.founded}${v.type === 'game' ? ` · Reviews: ${reviewLabel(v.quality)}` : ''}`)
  if (v.stage === 'live') {
    rows.push(`\u{1F465} ${capWord(unitWord(v, v.users))}${v.type === 'game' ? ' so far' : ''}${v.peakUsers > v.users ? ` (peak ${shortCount(v.peakUsers)})` : ''}`)
    rows.push(v.type === 'saas' ? `\u{1F4B5} MRR ${money(v.mrr)} · revenue last year ${money(v.revenue)}` : `\u{1F4B5} Revenue last year: ${money(v.revenue)}`)
    if (v.history.length) rows.push(`\u{1F4C8} Last year's ${v.profit >= 0 ? 'profit' : 'loss'}: ${money(Math.abs(v.profit))}${v.profit > 0 && v.stake < 1 ? ` (your share ${money(v.profit * v.stake)})` : ''}`)
  }
  rows.push(`\u{1F3F7}\u{FE0F} Valuation ${money(v.valuation)} · you own ${Math.round(v.stake * 100)}% (${money(a.value)})`)
  rows.push(`\u{2B50} ${v.type === 'store' ? 'Reputation' : 'Quality'} ${Math.round(v.quality)}/100${d.minSkill > 0 ? ` · \u{1F9F1} Tech debt ${v.debt}/100` : ''}`)
  if (v.stage === 'live' && v.history.length >= 1) rows.push(`\u{1F3AF} Product-market fit: ${fitLabel(v.fit)}`)
  const { contractors, ads, fixed } = runningCosts(v)
  rows.push(`\u{1F477} ${v.contractors} contractor${v.contractors === 1 ? '' : 's'}${contractors > 0 ? ` (${money(contractors)}/yr)` : ''} · \u{1F4E3} ${AD_LEVELS[v.ad]}${ads > 0 ? ` (${money(ads)}/yr)` : ''}`)
  if (v.stage === 'live') rows.push(`\u{1F9FE} ${v.type === 'store' ? 'Store plan, packaging and fees' : v.type === 'game' ? 'Store page and website' : 'Hosting, tools and fees'}: ${money(fixed)}/yr`)
  rows.push(`\u{1F4B2} Pricing: ${tierOf(v).label} (${tierPriceLabel(v)})`)
  if (v.cofounder) rows.push(`\u{1F91D} Co-founder: ${v.cofounder} (${Math.round(cofounderStake(a) * 100)}%)`)
  if (v.cash > 0) rows.push(`\u{1F3E6} Company cash: ${money(v.cash)}`)
  if (v.owed > 0) rows.push(`\u{26A0}\u{FE0F} Unpaid fines: ${money(v.owed)} (paid from profits before you get a cent)`)
  if (v.history.length >= 2) rows.push(`\u{1F4CA} ${v.history.slice(-3).map((h) => `'${String(h.y).slice(-2)}: ${shortCount(h.users)} · ${money(h.revenue)}`).join('  |  ')}`)
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `venture-${a.id}-info-${i}`, text }))
}

export function ventureActions(g: GameState, a: Asset): MenuNode[] {
  const v = readVenture(g, a)
  const d = def(v)
  const id = a.id
  const nodes: MenuNode[] = [{ type: 'heading', id: `venture-${id}-actions`, label: 'Run It' }]
  nodes.push({
    type: 'action',
    id: `venture-${id}-work`,
    label: v.stage === 'building' ? 'Keep Building' : d.workLabel,
    emoji: v.type === 'store' ? '\u{1F4E6}' : '\u{1F468}\u{200D}\u{1F4BB}',
    subtitle: (gg) => `${yearActionsUsed(gg, `computer.dev.work.${id}`)}/2 this year${d.minSkill > 0 ? ` · your skill ${codingSkill(gg)}` : ''}`,
    disabledReason: (gg) => firstReason(computerBlock(gg), yearActionsUsed(gg, `computer.dev.work.${id}`) >= 2 ? 'You already worked on it twice this year.' : null),
    run: (gg) => workOn(gg, id),
  })
  if (d.minSkill > 0) {
    nodes.push({
      type: 'action',
      id: `venture-${id}-debt`,
      label: 'Fix Tech Debt',
      emoji: '\u{1F9F9}',
      subtitle: `Tech debt ${v.debt}/100 · causes outages and churn`,
      disabledReason: (gg) => firstReason(computerBlock(gg), yearActionsUsed(gg, `computer.dev.debt.${id}`) >= 1 ? 'You already did a cleanup sprint this year.' : null),
      run: (gg) => fixDebt(gg, id),
    })
  }
  if (v.type === 'game' && v.stage === 'live') {
    nodes.push({
      type: 'action',
      id: `venture-${id}-dlc`,
      label: 'Release an Expansion',
      emoji: '\u{1F381}',
      subtitle: 'New content, new sales (if it is good)',
      disabledReason: (gg) => firstReason(computerBlock(gg), yearActionsUsed(gg, `computer.dev.dlc.${id}`) >= 1 ? 'One expansion a year.' : null),
      run: (gg) => makeDlc(gg, id),
    })
  }
  if (v.stage === 'live') {
    nodes.push({
      type: 'action',
      id: `venture-${id}-promote`,
      label: 'Promote on Your Socials',
      emoji: '\u{1F4E3}',
      subtitle: (gg) => `Free · ${shortCount(totalFollowers(gg))} followers`,
      disabledReason: (gg) =>
        firstReason(
          lifeBlock(gg),
          totalFollowers(gg) < 50 ? 'You need a social media following first (Activities › Social Media).' : null,
          yearActionsUsed(gg, `computer.dev.promote.${id}`) >= 1 ? 'Once a year.' : null,
        ),
      run: (gg) => promote(gg, id),
    })
  }
  nodes.push({
    type: 'menu',
    id: `venture-${id}-pricing`,
    label: 'Pricing',
    emoji: '\u{1F4B2}',
    subtitle: `${tierOf(v).label} · ${tierPriceLabel(v)}`,
    disabledReason: lifeBlock,
    children: () =>
      d.tiers.map(
        (t, i): MenuAction => ({
          type: 'action',
          id: `venture-${id}-tier-${i}`,
          label: `${t.label}${i === v.tier ? ' (current)' : ''}`,
          emoji: ['\u{1F7E2}', '\u{1F7E1}', '\u{1F7E3}'][i],
          subtitle: `${tierPriceLabel(v, t)} · ${t.growth > 1 ? 'more customers' : t.growth < 1 ? 'fewer customers' : 'balanced'}`,
          disabledReason: (gg) => firstReason(lifeBlock(gg), i === v.tier ? 'Already your pricing.' : yearActionsUsed(gg, `computer.dev.price.${id}`) >= 1 ? 'You already changed prices this year.' : null),
          run: (gg) => setTier(gg, id, i),
        }),
      ),
  })
  nodes.push({
    type: 'menu',
    id: `venture-${id}-ads`,
    label: 'Marketing Budget',
    emoji: '\u{1F4E3}',
    subtitle: `${AD_LEVELS[v.ad]} · ${money(adBudget(v.countryId, v.ad))}/yr`,
    disabledReason: lifeBlock,
    children: () =>
      AD_LEVELS.map(
        (label, i): MenuAction => ({
          type: 'action',
          id: `venture-${id}-ad-${i}`,
          label: `${label}${i === v.ad ? ' (current)' : ''}`,
          emoji: ['\u{1F507}', '\u{1F4E2}', '\u{1F4FA}', '\u{1F680}'][i],
          subtitle: `${formatMoney(adBudget(v.countryId, i))} a year`,
          disabledReason: (gg) => firstReason(lifeBlock(gg), i === v.ad ? 'Already your budget.' : null),
          run: (gg) => setAds(gg, id, i),
        }),
      ),
  })
  nodes.push({
    type: 'action',
    id: `venture-${id}-hire`,
    label: v.type === 'store' ? 'Hire a Helper' : 'Hire a Contractor',
    emoji: '\u{1F477}',
    subtitle: `${formatMoney(contractorCost(v.countryId, v.type))} a year each · ${v.contractors}/5`,
    disabledReason: (gg) => firstReason(lifeBlock(gg), v.contractors >= 5 ? 'Five is the most you can manage.' : null),
    run: (gg) => hire(gg, id, 1),
  })
  if (v.contractors > 0) {
    nodes.push({ type: 'action', id: `venture-${id}-fire`, label: 'Let a Contractor Go', emoji: '\u{1F44B}', disabledReason: lifeBlock, run: (gg) => hire(gg, id, -1) })
  }
  nodes.push({ type: 'heading', id: `venture-${id}-exit`, label: 'Exit' })
  nodes.push({ type: 'action', id: `venture-${id}-sell`, label: 'Sell It', emoji: '\u{1F3F7}\u{FE0F}', subtitle: `Valuation ${money(v.valuation)}`, disabledReason: lifeBlock, run: (gg) => sell(gg, id) })
  nodes.push({
    type: 'action',
    id: `venture-${id}-close`,
    label: 'Shut It Down',
    emoji: '\u{1FAA6}',
    disabledReason: lifeBlock,
    confirm: () => `Shut down ${a.name} for good?`,
    run: (gg) => shutDown(gg, id),
  })
  return nodes
}

/** The whole owned-asset screen. */
export function ventureView(g: GameState, a: Asset): MenuNode[] {
  const nodes = [...ventureInfo(g, a), ...ventureActions(g, a)]
  if (a.details?.type === 'game') {
    nodes.push({ type: 'info', id: `venture-${a.id}-studio`, emoji: '\u{1F3E2}', text: `${a.name} also appears in Occupation › Special Careers › Game Industry, where it can grow into a registered game studio once you're 18.` })
  }
  return nodes
}

export function ventureSubtitle(g: GameState, a: Asset): string {
  const v = readVenture(g, a)
  const d = def(v)
  if (v.stage === 'building') return `${d.label} · building ${Math.round(v.progress)}% · ${money(a.value)}`
  const bits = [d.label, unitWord(v, v.users)]
  if (v.type === 'saas') bits.push(`${money(v.mrr)} MRR`)
  else if (v.revenue > 0) bits.push(`${money(v.revenue)}/yr`)
  bits.push(money(a.value))
  return bits.join(' · ')
}

/** Activities › Computer › Start a Venture. */
export const startVentureMenu: MenuGroup = {
  type: 'menu',
  id: 'computer.dev.startVenture',
  label: 'Start a Venture',
  emoji: '\u{1F680}',
  subtitle: (g) => {
    const open = (['saas', 'app', 'store'] as VentureType[]).filter((t) => eraOpen(g, VENTURE_DEFS[t].era))
    const what = open.length === 3 ? 'SaaS, apps, an online store' : open.map((t) => (t === 'saas' ? 'SaaS' : t === 'app' ? 'apps' : 'an online store')).join(', ')
    return `${what} · ${ventureAssets(g).length}/${MAX_VENTURES} running`
  },
  visible: (g) => g.character.age >= 12 && (['saas', 'app', 'store'] as VentureType[]).some((t) => eraOpen(g, VENTURE_DEFS[t].era)),
  disabledReason: (g) => firstReason(computerBlock(g), canStartVenture(g)),
  header: (g) => `Coding skill ${codingSkill(g)}/100 · You have ${formatMoney(g.character.money)}. One new venture a year.`,
  children: (): MenuNode[] => [
    ...(['store', 'app', 'saas'] as VentureType[]).map((t): MenuAction => {
      const vd = VENTURE_DEFS[t]
      return {
        type: 'action',
        id: `computer.dev.start.${t}`,
        label: vd.label,
        emoji: vd.emoji,
        subtitle: (g) => {
          const start = localFee(g, vd.startUsd)
          const self = vd.minSkill > 0 ? `build it yourself at skill ${vd.minSkill}+` : 'no coding needed'
          const hired = vd.hireUsd > 0 ? ` or hire a freelancer (${money(localFee(g, vd.hireUsd))})` : ''
          return `From ${formatMoney(start)} · ${self}${hired} · age ${vd.minAge}+`
        },
        visible: (g) => eraOpen(g, vd.era),
        disabledReason: (g) => firstReason(computerBlock(g), ageBlock(g, vd.minAge, `start ${vd.noun}`), canStartVenture(g)),
        run: (g) => startVenture(g, t),
      }
    }),
    { type: 'info', id: 'computer.dev.start.games', emoji: '\u{1F579}\u{FE0F}', text: GAMES_POINTER },
  ],
}

/** Where game making lives now. */
export const GAMES_POINTER = 'Indie games: make, crowdfund and sell them in Occupation › Special Careers › Game Industry. At 18 a hit can grow into a real game studio.'

export const ventureInternals = { stepVenture, valuationOf, marketCap, custPrice, fireEvent, eligibleEvents, EVENT_SCRIPT, IDEA_SCRIPT, BUILD_SCRIPT, NAME_SCRIPT, SELL_SCRIPT, sellOffers, workOn, fixDebt, setTier, setAds, hire, sell, shutDown, makeDlc, promote }
