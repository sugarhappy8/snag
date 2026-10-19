// Care, Education and Personal Services, the play side: the four levers of the Clients and Standards desk,
// the seven events of the family and every string they show (clinic, education, gym, salon, petCare,
// homeCare, autoShop). The math (loyalty, plans, payers, accreditation, intake) is in sector-care.ts; this
// file registers CARE_MODEL. It imports no other sector file than the kit, the state and the math:
// sector-menu.ts and sector-events.ts import sector-core.ts, which imports the barrel that imports this file.
// Every branch of an event is computed inside branches() from the same numbers the resolver rolls, so a
// shown cost is the cost that is applied and a hint is the resolver's own expectation. Nothing here draws.
import type { Asset, GameState } from '../types'
import type { BizFx } from './economy'
import { accProgramCost, CARE_NOTE_COPY, careFx, careHeader, careRow, careSeed, clientsOf } from './sector-care'
import {
  registerFamily, sectorCtx, sectorText,
  type Branch, type CopyTable, type FamilyModel, type LeverDef, type LeverOption, type SecFx, type SectorChoice, type SectorCtx, type SectorEvent,
} from './sector-kit'
import type { CareState } from './sector-state'
import type { BizState } from './state'
import { clampN, money, pct, units } from './util'

// ---------------------------------------------------------------------------
// Copy. Keys: care.lever.<lever>.<value>.label and .tip, care.ev.<event>.head and .scene (a variant scene
// is care.ev.<event>.<variant>.scene, the variant a trade), care.ev.<event>.<choice>.label,
// care.ev.<event>.<choice>.<k>.out for the k-th branch, care.<name>.log. The key suffix gives the voice role.

const LEVER_COPY: CopyTable = {
  'care.lever.plans.label': 'Recurring plans',
  'care.lever.plans.0.label': 'Off',
  'care.lever.plans.0.tip': 'Plans wind down 10 points a year. No discount and no retention lift.',
  'care.lever.plans.0.2.label': '20% of clients',
  'care.lever.plans.0.2.tip': 'Aim for 20% on plans. Members pay 6% less and stay longer.',
  'care.lever.plans.0.4.label': '40% of clients',
  'care.lever.plans.0.4.tip': 'Aim for 40% on plans. Plans build 10 points a year and pay back slowly.',
  'care.lever.plans.0.6.label': '60% of clients',
  'care.lever.plans.0.6.tip': 'Aim for 60% on plans. It builds 10 points a year and evens out the seasons.',
  'care.lever.payer.label': 'Payer mix',
  'care.lever.payer.0.label': 'Off',
  'care.lever.payer.0.tip': 'Stops payer billing at once. No discounts and no denied bills.',
  'care.lever.payer.0.2.label': '20% of sales',
  'care.lever.payer.0.2.tip': 'Payers for 20% of sales. They add clients and take a discount. Some bills get denied.',
  'care.lever.payer.0.4.label': '40% of sales',
  'care.lever.payer.0.4.tip': 'Payers for 40% of sales. It pays only with idle capacity, since a full house gains nothing.',
  'care.lever.payer.0.6.label': '60% of sales',
  'care.lever.payer.0.6.tip': 'Payers for 60% of sales. Most clients come through them, and the discounts add up.',
  'care.lever.intake.label': 'Intake',
  'care.lever.intake.0.label': 'Open',
  'care.lever.intake.0.tip': "Take every client. A crowd above the trade's limit lowers satisfaction.",
  'care.lever.intake.1.label': 'Steady 90%',
  'care.lever.intake.1.tip': 'Turn clients away above 90% use. Fewer sales, but a crowd hurts less.',
  'care.lever.intake.2.label': 'Protected 75%',
  'care.lever.intake.2.tip': 'Turn clients away above 75% use. The most lost sales and the least crowding.',
  'care.lever.program.label': 'Accreditation program',
  'care.lever.program.1.label': 'Run the program',
  'care.lever.program.1.tip': 'Lifts the accreditation target 20 points this year. Paid once a year.',
}

const EVENT_COPY: CopyTable = {
  'care.ev.accreditationReview.head': 'Accreditation Review',
  'care.ev.accreditationReview.scene': 'The accrediting body sent a review team. It wants your files by Friday. What will you do?',
  'care.ev.accreditationReview.prepare.label': 'Prepare the files for ${cost}',
  'care.ev.accreditationReview.prepare.0.out': 'The files were in order and the team signed off. Your accreditation score holds.',
  'care.ev.accreditationReview.prepare.1.out': 'The team found gaps in the files anyway. Your score fell 12 points.',
  'care.ev.accreditationReview.bluff.label': 'Bluff it',
  'care.ev.accreditationReview.bluff.0.out': 'The team took your word and signed off. Your accreditation score holds.',
  'care.ev.accreditationReview.bluff.1.out': 'The team saw through it. Your score fell 12 points and word got round.',
  'care.ev.accreditationReview.time.label': 'Ask for more time',
  'care.ev.accreditationReview.time.0.out': 'The team gave you a month. You passed the second look.',
  'care.ev.accreditationReview.time.1.out': 'The team gave you a month and still found gaps. Your score fell 12 points.',

  'care.ev.starLeaves.head': 'Your Star Is Leaving',
  'care.ev.starLeaves.clinic.scene': 'Your lead doctor gave notice. ${n} patients have asked to follow them to the new practice. What will you do?',
  'care.ev.starLeaves.education.scene': 'Your lead teacher gave notice. ${n} students have asked to follow them to the new school. What will you do?',
  'care.ev.starLeaves.gym.scene': 'Your lead trainer gave notice. ${n} members have signed with them at the new gym. What will you do?',
  'care.ev.starLeaves.salon.scene': 'Your lead stylist gave notice. ${n} regulars have booked with them at the new place. What will you do?',
  'care.ev.starLeaves.petCare.scene': 'Your lead groomer gave notice. ${n} regulars have booked with them at the new place. What will you do?',
  'care.ev.starLeaves.homeCare.scene': 'Your lead carer gave notice. ${n} clients have asked to follow them to the new agency. What will you do?',
  'care.ev.starLeaves.autoShop.scene': 'Your lead mechanic gave notice. ${n} regulars have taken their cars to the new shop. What will you do?',
  'care.ev.starLeaves.counter.label': 'Make a counter-offer',
  'care.ev.starLeaves.counter.0.out': 'They stayed after you matched the offer. Pay rose 2% across the team, and ${n} regulars left anyway.',
  'care.ev.starLeaves.release.label': 'Let them go',
  'care.ev.starLeaves.release.0.out': '${n} regulars followed them. Your retention fell to ${pct}.',
  'care.ev.starLeaves.enforce.label': 'Enforce the contract',
  'care.ev.starLeaves.enforce.0.out': 'The court upheld the contract and awarded you ${sum}. ${n} regulars followed them anyway.',

  'care.ev.payerAudit.head': 'Payer Audit',
  'care.ev.payerAudit.scene': 'A payer audited your bills for the past two years. It wants money back. What will you do?',
  'care.ev.payerAudit.pay.label': 'Pay ${cost} back',
  'care.ev.payerAudit.pay.0.out': 'You repaid ${cost} and the payer closed the audit.',
  'care.ev.payerAudit.contest.label': 'Contest it',
  'care.ev.payerAudit.contest.0.out': 'Your records held up and the payer dropped its claim. Fees came to ${fees}.',
  'care.ev.payerAudit.contest.1.out': 'The payer won. You repaid ${cost} and paid ${fees} in fees.',
  'care.ev.payerAudit.drop.label': 'Drop the contract',
  'care.ev.payerAudit.drop.0.out': 'You dropped the contract. The payer withdrew its claim, and its clients went elsewhere.',

  'care.ev.rush.head': 'A Rush of Clients',
  'care.ev.rush.gym.scene': 'January brought the new-year crowd. The floor is full from six in the morning. What will you do?',
  'care.ev.rush.education.scene': 'Exam season started. Every class is full and the waiting list keeps growing. What will you do?',
  'care.ev.rush.clinic.scene': 'Flu season hit. The waiting room is full by eight each morning. What will you do?',
  'care.ev.rush.homeCare.scene': 'Flu season hit, and your clients need more visits than your carers can cover. What will you do?',
  'care.ev.rush.salon.scene': 'Holiday week is here. Every chair is booked and the walk-ins keep coming. What will you do?',
  'care.ev.rush.petCare.scene': 'Holiday week is here. Every kennel and grooming slot is booked. What will you do?',
  'care.ev.rush.autoShop.scene': 'The first frost hit and dead batteries filled the lot. The bays are full. What will you do?',
  'care.ev.rush.temps.label': 'Hire temps for ${cost}',
  'care.ev.rush.temps.0.out': 'The temps kept things moving. Clients rebooked for next month.',
  'care.ev.rush.temps.1.out': 'The temps needed training mid-rush. You paid ${cost} for little.',
  'care.ev.rush.cap.label': 'Cap intake',
  'care.ev.rush.cap.0.out': 'You capped intake. Some clients left, and the rest got better service.',
  'care.ev.rush.ride.label': 'Ride it',
  'care.ev.rush.ride.0.out': 'Your team coped with the rush. Clients came back the next week.',
  'care.ev.rush.ride.1.out': 'The team fell behind. Waits grew, and some clients left for good.',

  'care.ev.incident.head': 'A Serious Complaint',
  'care.ev.incident.scene': "A client says they were hurt at your place. A lawyer's letter arrived this morning. What will you do?",
  'care.ev.incident.settle.label': 'Settle for ${cost}',
  'care.ev.incident.settle.0.out': 'You settled for ${cost}. The client withdrew the claim.',
  'care.ev.incident.fight.label': 'Fight it',
  'care.ev.incident.fight.0.out': 'A judge dismissed the claim. Your fees came to ${cost}.',
  'care.ev.incident.fight.1.out': 'You lost in court. Damages and fees came to ${cost}, and your score fell 4 points.',
  'care.ev.incident.report.label': 'Report it',
  'care.ev.incident.report.0.out': 'The regulator closed the file and noted your report. Your score rose 3 points.',
  'care.ev.incident.report.1.out': 'The regulator cited you for the lapse. It cost ${cost}, and your score fell 5 points.',

  'care.ev.contractOffer.head': 'A Contract Offer',
  'care.ev.contractOffer.scene': 'A large employer wants your business on its benefits plan. It asks for a discount. What will you do?',
  'care.ev.contractOffer.sign.label': 'Sign it for ${cost}',
  'care.ev.contractOffer.sign.0.out': "You signed. The employer's staff joined your plans at a discount.",
  'care.ev.contractOffer.negotiate.label': 'Negotiate the terms',
  'care.ev.contractOffer.negotiate.0.out': 'The employer agreed to your terms. Its staff joined your plans with no discount.',
  'care.ev.contractOffer.negotiate.1.out': "The employer wouldn't move on price and went to a rival.",
  'care.ev.contractOffer.decline.label': 'Decline',
  'care.ev.contractOffer.decline.0.out': 'You declined the offer. The employer signed with another provider.',

  'care.ev.waitlist.head': 'A Waiting List',
  'care.ev.waitlist.scene': "A waiting list has built up. People ask when you'll have room. What will you do?",
  'care.ev.waitlist.hours.label': 'Add hours for ${cost}',
  'care.ev.waitlist.hours.0.out': 'You added hours for ${cost}. The list cleared and clients came back more often.',
  'care.ev.waitlist.small.label': 'Keep it small',
  'care.ev.waitlist.small.0.out': 'You left things as they were. The list stayed long, and some people gave up.',
}

/** Every string of the family. The yearly tier lines come from the math file. */
export const CARE_COPY: CopyTable = { ...CARE_NOTE_COPY, ...LEVER_COPY, ...EVENT_COPY }

type Vals = Record<string, string | number>
const text = (key: string, vals?: Vals): string => sectorText(CARE_COPY, key, vals)

// ---------------------------------------------------------------------------
// Levers: a stored number each, one change a year. The program is the one paid action.

/** Plans and payers move in steps of a fifth, from none to 60%. */
const STEPS = [0, .2, .4, .6] as const

function option(lever: string, value: number): LeverOption {
  return { value, label: text(`care.lever.${lever}.${value}.label`), tip: text(`care.lever.${lever}.${value}.tip`) }
}

/** The lever sets the plan target; the stock of plans ramps toward it by 10 points a year. */
const PLANS_LEVER: LeverDef = {
  id: 'plans', label: text('care.lever.plans.label'), paid: false,
  options: () => STEPS.map((v) => option('plans', v)),
  current: (st: CareState) => st.planTarget,
  apply: (st: CareState, value) => ({ ...st, planTarget: clampN(value, 0, .6) }),
  cost: () => 0,
}

/** Only a trade with a payer row can bill payers: salon and pet care get no options, so the desk shows no such row. */
const PAYER_LEVER: LeverDef = {
  id: 'payer', label: text('care.lever.payer.label'), paid: false,
  options: (_g: GameState, b: BizState) => (careRow(b.industry)?.payer ? STEPS.map((v) => option('payer', v)) : []),
  current: (st: CareState) => st.payer,
  apply: (st: CareState, value) => ({ ...st, payer: clampN(value, 0, .6) }),
  cost: () => 0,
}

const INTAKE_LEVER: LeverDef = {
  id: 'intake', label: text('care.lever.intake.label'), paid: false,
  options: () => [0, 1, 2].map((v) => option('intake', v)),
  current: (st: CareState) => st.intake,
  apply: (st: CareState, value) => ({ ...st, intake: value >= 2 ? 2 : value >= 1 ? 1 : 0 }),
  cost: () => 0,
}

/** `program` holds the year of the last program, so the setting reads as done only in the year it was paid. */
const PROGRAM_LEVER: LeverDef = {
  id: 'program', label: text('care.lever.program.label'), paid: true,
  options: () => [option('program', 1)],
  current: (st: CareState, year) => (st.program === year ? 1 : 0),
  apply: (st: CareState, _value, year) => ({ ...st, program: year }),
  cost: (_g, b: BizState, _st, _value, cx: SectorCtx) => accProgramCost(b, cx),
}

export const CARE_LEVERS: readonly LeverDef[] = [PLANS_LEVER, PAYER_LEVER, INTAKE_LEVER, PROGRAM_LEVER]

// ---------------------------------------------------------------------------
// Events. Every branch is built inside branches() from the company's own numbers.

const ctxOf = (g: GameState, b: BizState): SectorCtx => sectorCtx(g, b, g.year)
/** The most cash one outcome may move (spec 4.1). */
const cap = (cx: SectorCtx): number => Math.floor(Math.max(.12 * cx.base, 3000 * cx.level))
/** Whole dollars, never above the cap. */
const outlay = (cx: SectorCtx, x: number): number => Math.min(Math.max(0, Math.round(x)), cap(cx))
const out = (x: number): number => (x > 0 ? -x : 0)
/** Insurance pays 85% of a claim, as it does for a disaster. */
const insured = (b: BizState, x: number): number => Math.round(b.insured ? x * .15 : x)

function branch(p: number, key: string, fx: BizFx, sec?: SecFx, vals?: Vals): Branch {
  return { p, fx, text: key, ...(sec ? { sec } : {}), ...(vals ? { vals } : {}) }
}

/** Build a choice whose branches come from one function of the live numbers. */
function choice(event: string, id: string, vals: Vals | undefined, branches: SectorChoice['branches']): SectorChoice {
  return { id, label: text(`care.ev.${event}.${id}.label`, vals), branches }
}

/** The retention a trade starts at: the bar the waiting list is measured against. */
function retentionBar(b: BizState): number {
  return careRow(b.industry)?.r0 ?? 1
}

/** How many regulars a loss of `loss` of the client base takes (at least two, so a young company still has a number). */
function followers(b: BizState, loss: number): number {
  const row = careRow(b.industry)
  return Math.max(2, Math.round((row ? clientsOf(b, row) : 0) * loss))
}

/** A scene with the trade's own words, the salon's when a trade is missing. */
function sceneFor(event: string, b: BizState, vals?: Vals): string {
  return text(`care.ev.${event}.${b.industry}.scene`, vals) || text(`care.ev.${event}.salon.scene`, vals)
}

// ---- accreditationReview

type ReviewChoice = 'prepare' | 'bluff' | 'time'
const REVIEW_BONUS: Readonly<Record<ReviewChoice, number>> = { prepare: .15, bluff: -.10, time: .05 }

/** The chance the team signs off: the score over 110, plus what the choice adds, held between .1 and .97. */
function reviewPassP(acc: number, id: ReviewChoice): number {
  return clampN(acc / 110 + REVIEW_BONUS[id], .1, .97)
}

/** Preparing the files costs a program; a program already paid this year has prepared them. */
function filesPrice(g: GameState, b: BizState, st: CareState): number {
  const cx = ctxOf(g, b)
  return st.program === g.year ? 0 : outlay(cx, accProgramCost(b, cx))
}

function reviewBranches(id: ReviewChoice, g: GameState, b: BizState, st: CareState): Branch[] {
  const pass = reviewPassP(st.acc, id)
  const price = id === 'prepare' ? filesPrice(g, b, st) : 0
  const vals = { cost: money(price) }
  return [
    branch(pass, `care.ev.accreditationReview.${id}.0.out`, { cash: out(price), brand: 2 }, undefined, vals),
    branch(1 - pass, `care.ev.accreditationReview.${id}.1.out`, { cash: out(price), brand: id === 'bluff' ? -8 : -3 }, { add: { acc: -12 } }, vals),
  ]
}

const ACCREDITATION_REVIEW: SectorEvent = {
  id: 'accreditationReview', family: 'care', title: text('care.ev.accreditationReview.head'), emoji: '\u{1F4CB}',
  weight: () => 1,
  scene: () => text('care.ev.accreditationReview.scene'),
  choices: (g, b, st: CareState) => [
    choice('accreditationReview', 'prepare', { cost: money(filesPrice(g, b, st)) }, (gg, bb, ss: CareState) => reviewBranches('prepare', gg, bb, ss)),
    choice('accreditationReview', 'bluff', undefined, (gg, bb, ss: CareState) => reviewBranches('bluff', gg, bb, ss)),
    choice('accreditationReview', 'time', undefined, (gg, bb, ss: CareState) => reviewBranches('time', gg, bb, ss)),
  ],
}

// ---- starLeaves

/** The share of the client base that follows a star who leaves, and the share a counter-offer keeps. */
const STAR_LOSS = .08
const STAR_LOSS_COUNTERED = .03

/** What the retention reads after a loss (the record's own clamp, .2 to 1). */
const retentionAfter = (st: CareState, loss: number): string => pct(clampN(st.loyal - loss, .2, 1))

/** What a court awards for a broken contract: a floor by price level, else .4% of a normal year's sales. */
function damagesFor(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .004 * cx.base))
}

const STAR_LEAVES: SectorEvent = {
  id: 'starLeaves', family: 'care', title: text('care.ev.starLeaves.head'), emoji: '\u{1F6AA}',
  weight: () => .8,
  scene: (_g, _a: Asset, b) => sceneFor('starLeaves', b, { n: units(followers(b, STAR_LOSS)) }),
  choices: () => [
    choice('starLeaves', 'counter', undefined, (_gg, bb, ss: CareState) => [
      branch(1, 'care.ev.starLeaves.counter.0.out', { wage: .02 }, { add: { loyal: -STAR_LOSS_COUNTERED } }, { n: units(followers(bb, STAR_LOSS_COUNTERED)), pct: retentionAfter(ss, STAR_LOSS_COUNTERED) }),
    ]),
    choice('starLeaves', 'release', undefined, (_gg, bb, ss: CareState) => [
      branch(1, 'care.ev.starLeaves.release.0.out', {}, { add: { loyal: -STAR_LOSS } }, { n: units(followers(bb, STAR_LOSS)), pct: retentionAfter(ss, STAR_LOSS) }),
    ]),
    choice('starLeaves', 'enforce', undefined, (gg, bb, ss: CareState) => {
      const sum = damagesFor(ctxOf(gg, bb))
      return [
        branch(1, 'care.ev.starLeaves.enforce.0.out', { cash: sum, brand: -5 }, { add: { loyal: -STAR_LOSS } }, { n: units(followers(bb, STAR_LOSS)), pct: retentionAfter(ss, STAR_LOSS), sum: money(sum) }),
      ]
    }),
  ],
}

// ---- payerAudit

/** The clawback: a tenth of a year of the payer's bills, floored by price level. */
function clawback(cx: SectorCtx, st: CareState): number {
  return outlay(cx, Math.max(2000 * cx.level, .10 * cx.base * st.payer))
}

const PAYER_AUDIT: SectorEvent = {
  id: 'payerAudit', family: 'care', title: text('care.ev.payerAudit.head'), emoji: '\u{1F9FE}',
  weight: (_g, b, st: CareState) => (careRow(b.industry)?.payer && st.payer > 0 ? .8 : 0),
  scene: () => text('care.ev.payerAudit.scene'),
  choices: (g, b, st: CareState) => [
    choice('payerAudit', 'pay', { cost: money(clawback(ctxOf(g, b), st)) }, (gg, bb, ss: CareState) => {
      const sum = clawback(ctxOf(gg, bb), ss)
      return [branch(1, 'care.ev.payerAudit.pay.0.out', { cash: out(sum) }, undefined, { cost: money(sum) })]
    }),
    choice('payerAudit', 'contest', undefined, (gg, bb, ss: CareState) => {
      const cx = ctxOf(gg, bb)
      const sum = clawback(cx, ss)
      const fees = outlay(cx, .3 * sum)
      // The better the records, the likelier the audit is dropped; a loss repays half as much again.
      const win = clampN(.30 + ss.acc / 250, .2, .6)
      const repay = Math.min(Math.round(1.5 * sum), cap(cx) - fees)
      return [
        branch(win, 'care.ev.payerAudit.contest.0.out', { cash: out(fees) }, undefined, { fees: money(fees) }),
        branch(1 - win, 'care.ev.payerAudit.contest.1.out', { cash: out(fees + repay), brand: -2 }, undefined, { cost: money(repay), fees: money(fees) }),
      ]
    }),
    choice('payerAudit', 'drop', undefined, () => [branch(1, 'care.ev.payerAudit.drop.0.out', {}, { add: { payer: -.2 } })]),
  ],
}

// ---- rush

function tempsCost(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .008 * cx.base))
}

/** The odds that a rush is served well: the more room to spare, the better. */
function rushOdds(cx: SectorCtx): number {
  return clampN(1.15 - cx.use, .1, .85)
}

const RUSH: SectorEvent = {
  id: 'rush', family: 'care', title: text('care.ev.rush.head'), emoji: '\u{1F4C8}',
  weight: () => .6,
  scene: (_g, _a: Asset, b) => sceneFor('rush', b),
  choices: (g, b) => [
    choice('rush', 'temps', { cost: money(tempsCost(ctxOf(g, b))) }, (gg, bb) => {
      const cx = ctxOf(gg, bb)
      const good = clampN(rushOdds(cx) + .12, .1, .9)
      const vals = { cost: money(tempsCost(cx)) }
      return [
        branch(good, 'care.ev.rush.temps.0.out', { cash: out(tempsCost(cx)), demandTo: 1.06, brand: 2 }, { add: { loyal: .02 } }, vals),
        branch(1 - good, 'care.ev.rush.temps.1.out', { cash: out(tempsCost(cx)) }, undefined, vals),
      ]
    }),
    // Turning people away costs a little capacity and sets the intake lever to Steady (or keeps a tighter one).
    choice('rush', 'cap', undefined, (_gg, _bb, ss: CareState) => [
      branch(1, 'care.ev.rush.cap.0.out', { capacityTo: .06 }, { add: { loyal: .02 }, set: { intake: Math.max(ss.intake, 1) } }),
    ]),
    choice('rush', 'ride', undefined, (gg, bb) => {
      const good = rushOdds(ctxOf(gg, bb))
      return [
        branch(good, 'care.ev.rush.ride.0.out', { demandTo: 1.06, brand: 2 }, { add: { loyal: .02 } }),
        branch(1 - good, 'care.ev.rush.ride.1.out', { demandTo: .97, brand: -2 }, { add: { loyal: -.04 } }),
      ]
    }),
  ],
}

// ---- incident

/** A settlement: a floor by price level, else 1% of a normal year's sales. */
function settlement(cx: SectorCtx): number {
  return outlay(cx, Math.max(2500 * cx.level, .01 * cx.base))
}

/** Every cash cost of an incident is what the company pays after its insurance. */
function incidentBranches(id: 'settle' | 'fight' | 'report', g: GameState, b: BizState, st: CareState): Branch[] {
  const cx = ctxOf(g, b)
  const s = settlement(cx)
  if (id === 'settle') {
    const paid = insured(b, s)
    return [branch(1, 'care.ev.incident.settle.0.out', { cash: out(paid), brand: -1 }, undefined, { cost: money(paid) })]
  }
  if (id === 'fight') {
    const fees = outlay(cx, .35 * s)
    const lost = Math.min(Math.round(fees + 1.6 * s), cap(cx))
    // The better the records, the likelier the judge dismisses the claim.
    const win = clampN(.35 + st.acc / 250, .3, .65)
    return [
      branch(win, 'care.ev.incident.fight.0.out', { cash: out(insured(b, fees)), brand: 1 }, undefined, { cost: money(insured(b, fees)) }),
      branch(1 - win, 'care.ev.incident.fight.1.out', { cash: out(insured(b, lost)), brand: -5 }, { add: { acc: -4 } }, { cost: money(insured(b, lost)) }),
    ]
  }
  const filing = outlay(cx, .2 * s)
  const cited = Math.min(Math.round(filing + .8 * s), cap(cx))
  return [
    branch(.7, 'care.ev.incident.report.0.out', { cash: out(insured(b, filing)), brand: -1 }, { add: { acc: 3 } }, { cost: money(insured(b, filing)) }),
    branch(.3, 'care.ev.incident.report.1.out', { cash: out(insured(b, cited)), brand: -3 }, { add: { acc: -5 } }, { cost: money(insured(b, cited)) }),
  ]
}

const INCIDENT: SectorEvent = {
  id: 'incident', family: 'care', title: text('care.ev.incident.head'), emoji: '\u{26A0}\u{FE0F}',
  weight: () => .6,
  scene: () => text('care.ev.incident.scene'),
  choices: (g, b) => [
    choice('incident', 'settle', { cost: money(insured(b, settlement(ctxOf(g, b)))) }, (gg, bb, ss: CareState) => incidentBranches('settle', gg, bb, ss)),
    choice('incident', 'fight', undefined, (gg, bb, ss: CareState) => incidentBranches('fight', gg, bb, ss)),
    choice('incident', 'report', undefined, (gg, bb, ss: CareState) => incidentBranches('report', gg, bb, ss)),
  ],
}

// ---- contractOffer

/** The discount a signed deal gives away up front: a floor by price level, else .4% of a normal year's sales. */
function dealDiscount(cx: SectorCtx): number {
  return outlay(cx, Math.max(1000 * cx.level, .004 * cx.base))
}

/** What the deal adds: 10 points of plans, and of payers for a trade that bills them. */
function dealAdds(b: BizState): Record<string, number> {
  return careRow(b.industry)?.payer ? { plans: .1, payer: .1 } : { plans: .1 }
}

/** The plan target follows the plans the deal adds (on the lever's grid, never above 60%), so the next update doesn't undo it. */
function dealTarget(st: CareState): number {
  const need = Math.ceil((st.plans + .1) / .2 - 1e-9) * .2
  return Math.round(clampN(Math.max(st.planTarget, need), 0, .6) * 100) / 100
}

const CONTRACT_OFFER: SectorEvent = {
  id: 'contractOffer', family: 'care', title: text('care.ev.contractOffer.head'), emoji: '\u{1F91D}',
  weight: (_g, b) => (b.brand >= 30 ? .5 : 0),
  scene: () => text('care.ev.contractOffer.scene'),
  choices: (g, b) => [
    choice('contractOffer', 'sign', { cost: money(dealDiscount(ctxOf(g, b))) }, (gg, bb, ss: CareState) => [
      branch(1, 'care.ev.contractOffer.sign.0.out', { cash: out(dealDiscount(ctxOf(gg, bb))), brand: 1 }, { add: dealAdds(bb), set: { planTarget: dealTarget(ss) } }),
    ]),
    // Half the time the employer takes your price: the same deal with no discount.
    choice('contractOffer', 'negotiate', undefined, (_gg, bb, ss: CareState) => [
      branch(.5, 'care.ev.contractOffer.negotiate.0.out', { brand: 1 }, { add: dealAdds(bb), set: { planTarget: dealTarget(ss) } }),
      branch(.5, 'care.ev.contractOffer.negotiate.1.out', {}),
    ]),
    choice('contractOffer', 'decline', undefined, () => [branch(1, 'care.ev.contractOffer.decline.0.out', {})]),
  ],
}

// ---- waitlist

function hoursCost(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .01 * cx.base))
}

const WAITLIST: SectorEvent = {
  id: 'waitlist', family: 'care', title: text('care.ev.waitlist.head'), emoji: '\u{23F3}',
  weight: (_g, b, st: CareState) => (st.loyal > retentionBar(b) + 1e-9 ? .4 : 0),
  scene: () => text('care.ev.waitlist.scene'),
  choices: (g, b) => [
    choice('waitlist', 'hours', { cost: money(hoursCost(ctxOf(g, b))) }, (gg, bb) => {
      const cost = hoursCost(ctxOf(gg, bb))
      return [branch(1, 'care.ev.waitlist.hours.0.out', { cash: out(cost), demandTo: 1.03 }, { add: { loyal: .04 } }, { cost: money(cost) })]
    }),
    choice('waitlist', 'small', undefined, () => [branch(1, 'care.ev.waitlist.small.0.out', {})]),
  ],
}

export const CARE_EVENTS: readonly SectorEvent[] = [ACCREDITATION_REVIEW, STAR_LEAVES, PAYER_AUDIT, RUSH, INCIDENT, CONTRACT_OFFER, WAITLIST]

export const CARE_MODEL: FamilyModel = {
  family: 'care', copy: CARE_COPY, seed: careSeed, effects: careFx, header: careHeader, levers: CARE_LEVERS, events: CARE_EVENTS,
}

registerFamily(CARE_MODEL)
