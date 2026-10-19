// Food and Drink Service, the play side: the four levers of the Kitchen and Floor desk, the eight events
// of the family and every string they show (restaurant, foodTruck, cafe, bakery). The math (hygiene,
// rating, the peak squeeze, delivery, hours) is in sector-food.ts; this file registers FOOD_MODEL. It
// imports no other sector file than the kit, the state and the math: sector-menu.ts and sector-events.ts
// import sector-core.ts, which imports the barrel that imports this file.
// Every branch of an event is computed inside branches() from the same numbers the resolver rolls, so a
// shown fine is the fine that is applied and a hint is the resolver's own expectation. Nothing here draws.
import type { Asset, GameState } from '../types'
import type { BizFx } from './economy'
import { bizHas } from './era'
import { auditCost, FOOD_NOTE_COPY, foodFx, foodHeader, foodRow, foodSeed, gradeOf, kitchenFine } from './sector-food'
import {
  registerFamily, sectorCtx, sectorText,
  type Branch, type CopyTable, type FamilyModel, type LeverDef, type SecFx, type SectorChoice, type SectorCtx, type SectorEvent,
} from './sector-kit'
import type { FoodState } from './sector-state'
import type { BizState } from './state'
import { clampN, money } from './util'

// ---------------------------------------------------------------------------
// Copy. Keys: food.lever.<lever>.<value>.label and .tip, food.ev.<event>.head and .scene (a variant
// scene is food.ev.<event>.<variant>.scene), food.ev.<event>.<choice>.label, food.ev.<event>.<choice>.<k>.out
// for the k-th branch, food.<name>.log. The key suffix gives the voice role.

const LEVER_COPY: CopyTable = {
  'food.lever.menu.label': 'Menu style',
  'food.lever.menu.0.label': 'Lean',
  'food.lever.menu.0.tip': 'Unit cost down 7%, demand down 3%. The rating target drops 0.2.',
  'food.lever.menu.1.label': 'Balanced',
  'food.lever.menu.1.tip': 'No change to cost or demand. Quality sets the rating target.',
  'food.lever.menu.2.label': 'Signature',
  'food.lever.menu.2.tip': 'Demand up 5% and the rating target up 0.2. Unit cost up 7%.',
  'food.lever.delivery.label': 'Delivery',
  'food.lever.delivery.0.label': 'Off',
  'food.lever.delivery.0.tip': 'No delivered orders and no commission.',
  'food.lever.delivery.1.label': 'Platform',
  'food.lever.delivery.1.tip': 'Reaches new guests. The platform keeps 30% of each order.',
  'food.lever.delivery.2.label': 'Own fleet',
  'food.lever.delivery.2.tip': 'Reaches new guests. Riders cost 10% of orders plus 1.5% of sales.',
  'food.lever.hours.label': 'Opening hours',
  'food.lever.hours.0.label': 'Standard',
  'food.lever.hours.0.tip': 'Regular hours and regular wages.',
  'food.lever.hours.1.label': 'Extended',
  'food.lever.hours.1.tip': '15% more seat-hours for the busy parts of the day. Wages up 5%.',
  'food.lever.audit.label': 'Kitchen audit',
  'food.lever.audit.1.label': 'Audit the kitchen',
  'food.lever.audit.1.tip': 'Lifts the hygiene target 12 points this year. Cuts failed inspection odds by 65%.',
}

const EVENT_COPY: CopyTable = {
  'food.ev.inspection.head': 'Health Inspection',
  'food.ev.inspection.scene': 'An inspector walks into the kitchen at 11:40. The lunch rush starts in twenty minutes. What will you do?',
  'food.ev.inspection.open.label': 'Open the kitchen',
  'food.ev.inspection.open.0.out': 'The inspector signed off and left. Your grade stays on the door.',
  'food.ev.inspection.open.1.out': 'The inspector found raw chicken above the salad. You are graded ${grade}. Fine ${fine}.',
  'food.ev.inspection.audit.label': 'Pay ${cost} for an audit',
  'food.ev.inspection.audit.0.out': 'The audit report was on the pass. The inspector found nothing to write up.',
  'food.ev.inspection.audit.1.out': 'The audit missed a drain. The inspector found it and graded you ${grade}. Fine ${fine}.',
  'food.ev.inspection.stall.label': 'Stall them',
  'food.ev.inspection.stall.0.out': 'The crew scrubbed while the inspector waited. The visit ended with no fault.',
  'food.ev.inspection.stall.1.out': 'The wait annoyed the inspector. You are graded ${grade}. Fine ${fine} and a week of short service.',

  'food.ev.review.head': 'A Review Is Coming',
  'food.ev.review.critic.scene': 'A critic from the paper is eating here tonight. The whole crew has heard. What will you do?',
  'food.ev.review.blogger.scene': 'A food blogger with a big following is eating here tonight. The whole crew has heard. What will you do?',
  'food.ev.review.comp.label': 'Comp their meal',
  'food.ev.review.comp.0.out': 'They enjoyed the free meal and wrote kindly of it. Your rating rose half a point.',
  'food.ev.review.comp.1.out': 'The free meal came out cold. They wrote that, and your rating fell half a point.',
  'food.ev.review.comp.2.out': "They ate the free meal and wrote a plain note. Your rating didn't move.",
  'food.ev.review.invite.label': 'Send a tasting for ${cost}',
  'food.ev.review.invite.0.out': 'The tasting cost ${cost}. They called the kitchen one to watch and your rating rose half a point.',
  'food.ev.review.invite.1.out': 'The tasting cost ${cost}. They disliked the main dish and your rating fell half a point.',
  'food.ev.review.invite.2.out': 'The tasting cost ${cost}. They wrote a plain note and your rating stayed where it was.',
  'food.ev.review.ignore.label': 'Treat them as usual',
  'food.ev.review.ignore.0.out': 'They found the place better than most and said so. Your rating rose half a point.',
  'food.ev.review.ignore.1.out': 'They found the place worse than most and said so. Your rating fell half a point.',
  'food.ev.review.ignore.2.out': "They wrote a short, neutral note. Your rating didn't move.",

  'food.ev.platformHike.head': 'Platform Fee Hike',
  'food.ev.platformHike.scene': 'The delivery platform raised its commission by five points. Every order now pays more. What will you do?',
  'food.ev.platformHike.pay.label': 'Pay ${cost} more',
  'food.ev.platformHike.pay.0.out': 'You paid the new rate. The extra commission came to ${cost} this year.',
  'food.ev.platformHike.fleet.label': 'Own fleet for ${cost}',
  'food.ev.platformHike.fleet.0.out': 'You bought bikes and a dispatch desk for ${cost}. Orders go out under your own name now.',
  'food.ev.platformHike.drop.label': 'Drop the platform',
  'food.ev.platformHike.drop.0.out': 'You left the platform. Regulars who ordered through it went to a rival.',
  'food.ev.platformHike.drop.1.out': 'You left the platform. Most of its orders came back to the counter.',

  'food.ev.recall.head': 'Supplier Recall',
  'food.ev.recall.scene': 'A supplier recalled a batch you bought last week. Some is still in the walk-in. What will you do?',
  'food.ev.recall.pull.label': 'Pull it for ${cost}',
  'food.ev.recall.pull.0.out': 'You pulled the batch and binned ${cost} of stock. The log shows the date and the lot.',
  'food.ev.recall.ride.label': 'Ride it out',
  'food.ev.recall.ride.0.out': 'Three guests fell ill. The health office fined you ${fine}.',
  'food.ev.recall.ride.1.out': 'The batch went into dishes and no guest got ill.',

  'food.ev.festival.head': 'Street Festival',
  'food.ev.festival.scene': 'A street festival offers you a stall for the weekend. The fee is due today. What will you do?',
  'food.ev.festival.book.label': 'Book a stall for ${fee}',
  'food.ev.festival.book.0.out': 'The stall sold out by Sunday. After the fee you cleared ${net}.',
  'food.ev.festival.book.1.out': 'Rain kept the crowds home. You lost the ${fee} fee and sold little.',
  'food.ev.festival.skip.label': 'Skip it',
  'food.ev.festival.skip.0.out': 'You passed on the stall. The weekend ran as usual.',

  'food.ev.chefOffer.head': 'A Rival Wants Your Cook',
  'food.ev.chefOffer.scene': 'A rival kitchen offered your head cook a better wage. The cook came to you first. What will you do?',
  'food.ev.chefOffer.match.label': 'Match the offer',
  'food.ev.chefOffer.match.0.out': 'You matched the offer. Pay across the kitchen rose 6%.',
  'food.ev.chefOffer.release.label': 'Let them go',
  'food.ev.chefOffer.release.0.out': 'The cook left. Plates came out slower and plainer, and the rating slipped.',
  'food.ev.chefOffer.release.1.out': 'The cook left. Their second took the line and held it well enough.',

  'food.ev.noise.head': 'Noise Complaint',
  'food.ev.noise.scene': 'Neighbors complained about noise after midnight. The council sent you a notice. What will you do?',
  'food.ev.noise.cut.label': 'Cut late hours',
  'food.ev.noise.cut.0.out': 'You went back to standard hours and the complaints stopped.',
  'food.ev.noise.proof.label': 'Soundproof it for ${cost}',
  'food.ev.noise.proof.0.out': 'Sound panels went in for ${cost}. Your late hours can stay.',
  'food.ev.noise.ignore.label': 'Ignore it',
  'food.ev.noise.ignore.0.out': 'The council fined you ${fine} and set your closing time.',
  'food.ev.noise.ignore.1.out': 'The council let it pass this time.',

  'food.ev.rush.head': 'A Line Out the Door',
  'food.ev.rush.scene': 'A food blogger posted about your place. The line runs round the block. What will you do?',
  'food.ev.rush.staff.label': 'Add staff for ${cost}',
  'food.ev.rush.staff.0.out': 'Temps kept the line moving. The crowd booked again for next week.',
  'food.ev.rush.staff.1.out': "The temps got in each other's way. You paid ${cost} for little.",
  'food.ev.rush.turn.label': 'Turn people away',
  'food.ev.rush.turn.0.out': 'You closed the line at nine. Word got round that you were full, and some came back.',
  'food.ev.rush.ride.label': 'Ride it',
  'food.ev.rush.ride.0.out': 'Your crew coped. The line cleared and the rating rose.',
  'food.ev.rush.ride.1.out': 'The kitchen fell behind. Plates came out cold and the rating fell.',
}

/** Every string of the family. The yearly grade lines come from the math file. */
export const FOOD_COPY: CopyTable = { ...FOOD_NOTE_COPY, ...LEVER_COPY, ...EVENT_COPY }

type Vals = Record<string, string | number>
const text = (key: string, vals?: Vals): string => sectorText(FOOD_COPY, key, vals)

// ---------------------------------------------------------------------------
// Levers: a stored number each, one change a year. The audit is the one paid action.

const MENU = [0, 1, 2] as const

function slot<T>(value: number, all: readonly T[]): T {
  return all[Math.min(all.length - 1, Math.max(0, Math.round(value)))]
}

function option(lever: string, value: number): { value: number; label: string; tip: string } {
  return { value, label: text(`food.lever.${lever}.${value}.label`), tip: text(`food.lever.${lever}.${value}.tip`) }
}

const MENU_LEVER: LeverDef = {
  id: 'menu', label: text('food.lever.menu.label'), paid: false,
  options: () => MENU.map((v) => option('menu', v)),
  current: (st: FoodState) => st.menu,
  apply: (st: FoodState, value) => ({ ...st, menu: slot(value, [0, 1, 2] as const) }),
  cost: () => 0,
}

/** Delivery by trade and era: a platform needs phones and a trade with platform sales, a fleet needs a trade with one. */
const DELIVERY_LEVER: LeverDef = {
  id: 'delivery', label: text('food.lever.delivery.label'), paid: false,
  options: (g: GameState, b: BizState) => {
    const row = foodRow(b.industry)
    const values = [0]
    if (row && row.platform > 0 && bizHas(g, b.countryId, 'smartphone')) values.push(1)
    if (row && row.fleet > 0) values.push(2)
    return values.map((v) => option('delivery', v))
  },
  current: (st: FoodState) => st.channel,
  apply: (st: FoodState, value) => ({ ...st, channel: slot(value, [0, 1, 2] as const) }),
  cost: () => 0,
}

const HOURS_LEVER: LeverDef = {
  id: 'hours', label: text('food.lever.hours.label'), paid: false,
  options: () => [0, 1].map((v) => option('hours', v)),
  current: (st: FoodState) => st.hours,
  apply: (st: FoodState, value) => ({ ...st, hours: slot(value, [0, 1] as const) }),
  cost: () => 0,
}

/** `audit` holds the year of the last audit, so the setting reads as done only in the year it was paid. */
const AUDIT_LEVER: LeverDef = {
  id: 'audit', label: text('food.lever.audit.label'), paid: true,
  options: () => [option('audit', 1)],
  current: (st: FoodState, year) => (st.audit === year ? 1 : 0),
  apply: (st: FoodState, _value, year) => ({ ...st, audit: year }),
  cost: (_g, b: BizState, _st, _value, cx: SectorCtx) => auditCost(b, cx),
}

export const FOOD_LEVERS: readonly LeverDef[] = [MENU_LEVER, DELIVERY_LEVER, HOURS_LEVER, AUDIT_LEVER]

// ---------------------------------------------------------------------------
// Events. Every branch is built inside branches() from the company's own numbers.

const ctxOf = (g: GameState, b: BizState): SectorCtx => sectorCtx(g, b, g.year)
/** The most cash one outcome may move (spec 4.1). */
const cap = (cx: SectorCtx): number => Math.floor(Math.max(.12 * cx.base, 3000 * cx.level))
/** Whole dollars, never above the cap. */
const outlay = (cx: SectorCtx, x: number): number => Math.min(Math.max(0, Math.round(x)), cap(cx))
const out = (x: number): number => (x > 0 ? -x : 0)

function branch(p: number, key: string, fx: BizFx, sec?: SecFx, vals?: Vals): Branch {
  return { p, fx, text: key, ...(sec ? { sec } : {}), ...(vals ? { vals } : {}) }
}

/** Build a choice whose branches come from one function of the live numbers. */
function choice(event: string, id: string, vals: Vals | undefined, branches: SectorChoice['branches']): SectorChoice {
  return { id, label: text(`food.ev.${event}.${id}.label`, vals), branches }
}

// ---- inspection

type InspectionChoice = 'open' | 'audit' | 'stall'

/** The chance of a failed inspection at this hygiene: .55 less hygiene over 180, between .03 and .5. */
function inspectionFailP(hygiene: number): number {
  return clampN(.55 - hygiene / 180, .03, .5)
}

/** What an audit costs now: nothing when one is already paid for this year. */
function auditPrice(g: GameState, b: BizState, st: FoodState): number {
  return st.audit === g.year ? 0 : auditCost(b, ctxOf(g, b))
}

function inspectionBranches(id: InspectionChoice, g: GameState, b: BizState, st: FoodState): Branch[] {
  const cx = ctxOf(g, b)
  // An audit paid in the year just booked (or this year) cuts the odds by 65%; the event fires at the start of g.year.
  const covered = id === 'audit' || st.audit >= g.year - 1
  const pFail = inspectionFailP(st.hygiene) * (covered ? .35 : 1) * (id === 'stall' ? .8 : 1)
  const price = id === 'audit' ? auditPrice(g, b, st) : 0
  const fine = Math.min(Math.round(kitchenFine(b, cx) * (id === 'stall' ? 1.6 : 1)), cap(cx) - price)
  const audit: SecFx | undefined = id === 'audit' ? { set: { audit: g.year } } : undefined
  const grade = gradeOf(clampN(st.hygiene - 8, 0, 100))
  return [
    branch(1 - pFail, `food.ev.inspection.${id}.0.out`, { cash: out(price), brand: 1 }, id === 'stall' ? { add: { hygiene: 4 } } : audit),
    branch(pFail, `food.ev.inspection.${id}.1.out`, { cash: out(price + fine), brand: -7, ...(id === 'stall' ? { capacityTo: .06 } : {}) }, { add: { hygiene: -8 }, ...(audit ?? {}) }, { fine: money(fine), grade }),
  ]
}

const INSPECTION: SectorEvent = {
  id: 'inspection', family: 'food', title: text('food.ev.inspection.head'), emoji: '\u{1F50D}',
  weight: () => 1,
  scene: () => text('food.ev.inspection.scene'),
  choices: (g, b, st: FoodState) => [
    choice('inspection', 'open', undefined, (gg, bb, ss: FoodState) => inspectionBranches('open', gg, bb, ss)),
    choice('inspection', 'audit', { cost: money(auditPrice(g, b, st)) }, (gg, bb, ss: FoodState) => inspectionBranches('audit', gg, bb, ss)),
    choice('inspection', 'stall', undefined, (gg, bb, ss: FoodState) => inspectionBranches('stall', gg, bb, ss)),
  ],
}

// ---- review

type ReviewChoice = 'comp' | 'invite' | 'ignore'

function compCost(cx: SectorCtx): number {
  return outlay(cx, Math.max(500 * cx.level, .002 * cx.base))
}

/**
 * Rave, pan or plain: the better the kitchen and the rating, the likelier the rave. A comped meal shifts
 * the odds a little; a tasting raises the stakes (both the rave and the pan get likelier), so it pays only
 * for a kitchen that is better than its reviews.
 */
function reviewBranches(id: ReviewChoice, g: GameState, b: BizState, st: FoodState): Branch[] {
  const cx = ctxOf(g, b)
  const lean = .10 * (st.rating - 3.4) + .004 * (b.quality - 50)
  const shift = id === 'comp' ? .05 : 0
  const stakes = id === 'invite' ? 1.5 : 1
  const good = clampN(stakes * (.30 + lean + shift), .08, .85)
  const bad = clampN(stakes * (.30 - lean - shift), .05, .75)
  const price = id === 'invite' ? outlay(cx, auditCost(b, cx)) : id === 'comp' ? compCost(cx) : 0
  const vals = { cost: money(price) }
  return [
    branch(good, `food.ev.review.${id}.0.out`, { cash: out(price), brand: 3 }, { add: { rating: .5 } }, vals),
    branch(bad, `food.ev.review.${id}.1.out`, { cash: out(price), brand: -3 }, { add: { rating: -.5 } }, vals),
    branch(Math.max(0, 1 - good - bad), `food.ev.review.${id}.2.out`, { cash: out(price) }, undefined, vals),
  ]
}

const REVIEW: SectorEvent = {
  id: 'review', family: 'food', title: text('food.ev.review.head'), emoji: '\u{2B50}',
  weight: () => .6,
  scene: (g, _a: Asset, b) => text(bizHas(g, b.countryId, 'socialMedia') ? 'food.ev.review.blogger.scene' : 'food.ev.review.critic.scene'),
  choices: (g, b) => [
    choice('review', 'comp', undefined, (gg, bb, ss: FoodState) => reviewBranches('comp', gg, bb, ss)),
    choice('review', 'invite', { cost: money(outlay(ctxOf(g, b), auditCost(b, ctxOf(g, b)))) }, (gg, bb, ss: FoodState) => reviewBranches('invite', gg, bb, ss)),
    choice('review', 'ignore', undefined, (gg, bb, ss: FoodState) => reviewBranches('ignore', gg, bb, ss)),
  ],
}

// ---- platformHike

/** Five more points of commission on the year's platform orders (the delivered share plus the new sales). */
function hikeCost(b: BizState, cx: SectorCtx): number {
  const share = foodRow(b.industry)?.platform ?? 0
  return outlay(cx, .05 * share * cx.base * (1 + share * .6))
}

function fleetSetup(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .01 * cx.base))
}

const PLATFORM_HIKE: SectorEvent = {
  id: 'platformHike', family: 'food', title: text('food.ev.platformHike.head'), emoji: '\u{1F6F5}',
  weight: (_g, _b, st: FoodState) => (st.channel === 1 ? .8 : 0),
  scene: () => text('food.ev.platformHike.scene'),
  choices: (g, b) => {
    const cx = ctxOf(g, b)
    const pay = choice('platformHike', 'pay', { cost: money(hikeCost(b, cx)) }, (gg, bb) => [
      branch(1, 'food.ev.platformHike.pay.0.out', { cash: out(hikeCost(bb, ctxOf(gg, bb))) }, undefined, { cost: money(hikeCost(bb, ctxOf(gg, bb))) }),
    ])
    const fleet = choice('platformHike', 'fleet', { cost: money(fleetSetup(cx)) }, (gg, bb) => [
      branch(1, 'food.ev.platformHike.fleet.0.out', { cash: out(fleetSetup(ctxOf(gg, bb))) }, { set: { channel: 2 } }, { cost: money(fleetSetup(ctxOf(gg, bb))) }),
    ])
    const drop = choice('platformHike', 'drop', undefined, () => [
      branch(.6, 'food.ev.platformHike.drop.0.out', { demandTo: .97 }, { set: { channel: 0 } }),
      branch(.4, 'food.ev.platformHike.drop.1.out', {}, { set: { channel: 0 } }),
    ])
    return foodRow(b.industry)?.fleet ? [pay, fleet, drop] : [pay, drop]
  },
}

// ---- recall

function stockCost(cx: SectorCtx): number {
  return outlay(cx, Math.max(1200 * cx.level, .003 * cx.base))
}

const RECALL: SectorEvent = {
  id: 'recall', family: 'food', title: text('food.ev.recall.head'), emoji: '\u{1F6A8}',
  weight: () => .5,
  scene: () => text('food.ev.recall.scene'),
  choices: (g, b) => [
    choice('recall', 'pull', { cost: money(stockCost(ctxOf(g, b))) }, (gg, bb) => {
      const cost = stockCost(ctxOf(gg, bb))
      return [branch(1, 'food.ev.recall.pull.0.out', { cash: out(cost) }, { add: { hygiene: 2 } }, { cost: money(cost) })]
    }),
    choice('recall', 'ride', undefined, (gg, bb, ss: FoodState) => {
      const cx = ctxOf(gg, bb)
      const hit = clampN(.40 - ss.hygiene / 250, .04, .40)
      const fine = outlay(cx, Math.min(kitchenFine(bb, cx) * 1.5, cap(cx)))
      return [
        branch(hit, 'food.ev.recall.ride.0.out', { cash: out(fine), brand: -4 }, { add: { hygiene: -10 } }, { fine: money(fine) }),
        branch(1 - hit, 'food.ev.recall.ride.1.out', {}),
      ]
    }),
  ],
}

// ---- festival

function festivalFee(cx: SectorCtx): number {
  return outlay(cx, Math.max(1000 * cx.level, .004 * cx.base))
}

/** What a good weekend takes in: 1.2% of a normal year, and at least what covers the fee with room. */
function festivalTakings(cx: SectorCtx): number {
  return outlay(cx, Math.max(.012 * cx.base, 1.8 * festivalFee(cx)))
}

const FESTIVAL: SectorEvent = {
  id: 'festival', family: 'food', title: text('food.ev.festival.head'), emoji: '\u{1F3AA}',
  weight: () => .5,
  scene: () => text('food.ev.festival.scene'),
  choices: (g, b) => [
    choice('festival', 'book', { fee: money(festivalFee(ctxOf(g, b))) }, (gg, bb) => {
      const cx = ctxOf(gg, bb)
      const fee = festivalFee(cx)
      const net = festivalTakings(cx) - fee
      // The stall pays only with seats to spare: a full house has nobody to feed.
      const good = clampN(1.1 - cx.use, .1, .75)
      return [
        branch(good, 'food.ev.festival.book.0.out', { cash: net, brand: 1, demandTo: 1.04 }, undefined, { fee: money(fee), net: money(net) }),
        branch(1 - good, 'food.ev.festival.book.1.out', { cash: out(fee) }, undefined, { fee: money(fee), net: money(net) }),
      ]
    }),
    choice('festival', 'skip', undefined, () => [branch(1, 'food.ev.festival.skip.0.out', {})]),
  ],
}

// ---- chefOffer

const CHEF_OFFER: SectorEvent = {
  id: 'chefOffer', family: 'food', title: text('food.ev.chefOffer.head'), emoji: '\u{1F468}\u{200D}\u{1F373}',
  weight: () => .5,
  scene: () => text('food.ev.chefOffer.scene'),
  choices: () => [
    choice('chefOffer', 'match', undefined, () => [branch(1, 'food.ev.chefOffer.match.0.out', { wage: .06 })]),
    choice('chefOffer', 'release', undefined, () => [
      branch(.6, 'food.ev.chefOffer.release.0.out', { quality: -2 }, { add: { rating: -.2 } }),
      branch(.4, 'food.ev.chefOffer.release.1.out', { quality: -1 }),
    ]),
  ],
}

// ---- noise

const NOISE: SectorEvent = {
  id: 'noise', family: 'food', title: text('food.ev.noise.head'), emoji: '\u{1F50A}',
  weight: (_g, _b, st: FoodState) => (st.hours === 1 ? .6 : 0),
  scene: () => text('food.ev.noise.scene'),
  choices: (g, b) => {
    const priceOf = (gg: GameState, bb: BizState): number => {
      const cx = ctxOf(gg, bb)
      return outlay(cx, Math.max(3000 * cx.level, .01 * cx.base))
    }
    return [
      choice('noise', 'cut', undefined, () => [branch(1, 'food.ev.noise.cut.0.out', {}, { set: { hours: 0 } })]),
      choice('noise', 'proof', { cost: money(priceOf(g, b)) }, (gg, bb) => [
        branch(1, 'food.ev.noise.proof.0.out', { cash: out(priceOf(gg, bb)), brand: 1 }, undefined, { cost: money(priceOf(gg, bb)) }),
      ]),
      choice('noise', 'ignore', undefined, (gg, bb) => {
        const fine = outlay(ctxOf(gg, bb), kitchenFine(bb, ctxOf(gg, bb)))
        return [
          branch(.45, 'food.ev.noise.ignore.0.out', { cash: out(fine), brand: -2 }, { set: { hours: 0 } }, { fine: money(fine) }),
          branch(.55, 'food.ev.noise.ignore.1.out', {}),
        ]
      }),
    ]
  },
}

// ---- rush

function tempsCost(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .008 * cx.base))
}

/** The odds that a line out the door is served well: the more seats to spare, the better. */
function rushOdds(cx: SectorCtx): number {
  return clampN(1.15 - cx.use, .1, .85)
}

const RUSH: SectorEvent = {
  id: 'rush', family: 'food', title: text('food.ev.rush.head'), emoji: '\u{1F4C8}',
  weight: (g, b) => (bizHas(g, b.countryId, 'socialMedia') ? .5 : 0),
  scene: () => text('food.ev.rush.scene'),
  choices: (g, b) => [
    choice('rush', 'staff', { cost: money(tempsCost(ctxOf(g, b))) }, (gg, bb) => {
      const cx = ctxOf(gg, bb)
      const good = clampN(rushOdds(cx) + .12, .1, .9)
      const vals = { cost: money(tempsCost(cx)) }
      return [
        branch(good, 'food.ev.rush.staff.0.out', { cash: out(tempsCost(cx)), demandTo: 1.08, brand: 2 }, { add: { rating: .2 } }, vals),
        branch(1 - good, 'food.ev.rush.staff.1.out', { cash: out(tempsCost(cx)) }, undefined, vals),
      ]
    }),
    choice('rush', 'turn', undefined, () => [branch(1, 'food.ev.rush.turn.0.out', { demandTo: 1.03, brand: 1 })]),
    choice('rush', 'ride', undefined, (gg, bb) => {
      const good = rushOdds(ctxOf(gg, bb))
      return [
        branch(good, 'food.ev.rush.ride.0.out', { demandTo: 1.08, brand: 2 }, { add: { rating: .2 } }),
        branch(1 - good, 'food.ev.rush.ride.1.out', { demandTo: .97, brand: -1 }, { add: { rating: -.3 } }),
      ]
    }),
  ],
}

export const FOOD_EVENTS: readonly SectorEvent[] = [INSPECTION, REVIEW, PLATFORM_HIKE, RECALL, FESTIVAL, CHEF_OFFER, NOISE, RUSH]

export const FOOD_MODEL: FamilyModel = {
  family: 'food', copy: FOOD_COPY, seed: foodSeed, effects: foodFx, header: foodHeader, levers: FOOD_LEVERS, events: FOOD_EVENTS,
}

registerFamily(FOOD_MODEL)
