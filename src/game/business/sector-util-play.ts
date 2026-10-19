// Utilities, Land and Fleets, the play side: the four levers of the Plant and Network desk, the seven
// events of the family and every string they show (energy, solar, water, telecom, dataCenter, farm,
// logistics). The math (condition, outages, weather, spot and contract, the hedge) is in sector-util.ts;
// this file registers UTIL_MODEL. It imports no other sector file than the kit, the state, the data and
// the math: sector-menu.ts and sector-events.ts import sector-core.ts, which imports the barrel that
// imports this file.
// Every branch of an event is computed inside branches() from the same numbers the resolver rolls, so a
// shown bill is the bill that is applied and a hint is the resolver's own expectation. Nothing here draws.
import type { Asset, GameState } from '../types'
import type { BizFx } from './economy'
import { bizHas } from './era'
import type { UtilRow } from './sector-data'
import {
  registerFamily, sectorCtx, sectorText,
  type Branch, type CopyTable, type FamilyModel, type LeverDef, type LeverOption, type SecFx, type SectorChoice, type SectorCtx, type SectorEvent,
} from './sector-kit'
import type { UtilState } from './sector-state'
import { contractOptions, overhaulCost, UTIL_NOTE_COPY, utilFx, utilHeader, utilRow, utilSeed } from './sector-util'
import type { BizState } from './state'
import { clampN, money, round2 } from './util'

// ---------------------------------------------------------------------------
// Copy. Keys: util.lever.<lever>.<value>.label and .tip, util.ev.<event>.head and .scene (a variant scene
// is util.ev.<event>.<variant>.scene, the variant a trade), util.ev.<event>.<choice>.label,
// util.ev.<event>.<choice>.<k>.out for the k-th branch, util.<name>.log. The key suffix gives the voice role.

const LEVER_COPY: CopyTable = {
  'util.lever.overhaul.label': 'Overhaul',
  'util.lever.overhaul.1.label': 'Overhaul now',
  'util.lever.overhaul.1.tip': 'Adds 12 condition points this year. Outages get rarer and smaller. Paid once a year.',
  'util.lever.contract.label': 'Contract mix',
  'util.lever.contract.0.label': 'All spot',
  'util.lever.contract.0.tip': 'Nothing on contract. Spot pays a premium but swings and costs margin. Suits a worn plant.',
  'util.lever.contract.0.25.label': 'Contract 25%',
  'util.lever.contract.0.25.tip': 'Sell 25% on contract, the rest at spot. Spot pays a premium but swings and costs margin.',
  'util.lever.contract.0.3.label': 'Contract 30%',
  'util.lever.contract.0.3.tip': 'Sell 30% on contract, the rest at spot. Spot pays a premium but swings and costs margin.',
  'util.lever.contract.0.5.label': 'Contract 50%',
  'util.lever.contract.0.5.tip': 'Sell half on contract, half at spot. Spot pays a premium but swings and costs margin.',
  'util.lever.contract.0.55.label': 'Contract 55%',
  'util.lever.contract.0.55.tip': 'Sell 55% on contract, the rest at spot. Spot pays a premium but swings and costs margin.',
  'util.lever.contract.0.75.label': 'Contract 75%',
  'util.lever.contract.0.75.tip': 'Sell 75% on contract, the rest at spot. Less swing, but an outage means buying in.',
  'util.lever.contract.0.8.label': 'Contract 80%',
  'util.lever.contract.0.8.tip': 'Sell 80% on contract, the rest at spot. Less swing, but an outage means buying in.',
  'util.lever.contract.1.label': 'All contract',
  'util.lever.contract.1.tip': 'Every sale on contract. No spot swings and no premium, and an outage means buying in.',
  'util.lever.hedge.label': 'Fuel hedge',
  'util.lever.hedge.0.label': 'No hedge',
  'util.lever.hedge.0.tip': 'No cover on fuel. Costs follow the market up or down, and you pay no premium.',
  'util.lever.hedge.0.5.label': 'Hedge 50%',
  'util.lever.hedge.0.5.tip': 'Offsets half of any fuel cost swing for a yearly premium. Pays in a spike, costs in a glut.',
  'util.lever.hedge.0.8.label': 'Hedge 80%',
  'util.lever.hedge.0.8.tip': 'Offsets most of any fuel cost swing for a bigger premium. Pays in a spike, costs in a glut.',
  'util.lever.cover.label': 'Weather cover',
  'util.lever.cover.0.label': 'Off',
  'util.lever.cover.0.tip': 'No cover. A bad weather year takes its full toll on output or cost.',
  'util.lever.cover.1.label': 'On',
  'util.lever.cover.1.tip': 'Halves what bad weather takes. Costs 0.6% of a normal year of sales, every year.',
}

const EVENT_COPY: CopyTable = {
  'util.ev.storm.head': 'A Storm Hits',
  'util.ev.storm.energy.scene': 'A storm took out two lines overnight. The crews need a decision by noon. What will you do?',
  'util.ev.storm.solar.scene': 'Hail cracked a block of panels overnight. The crews need a decision by noon. What will you do?',
  'util.ev.storm.water.scene': 'A storm broke two mains overnight. The crews need a decision by noon. What will you do?',
  'util.ev.storm.telecom.scene': 'A storm brought down two towers overnight. The crews need a decision by noon. What will you do?',
  'util.ev.storm.dataCenter.scene': 'A storm cut the grid feed overnight. The generators need a decision by noon. What will you do?',
  'util.ev.storm.farm.scene': 'A storm flattened a field overnight. The crews need a decision by noon. What will you do?',
  'util.ev.storm.logistics.scene': 'A storm closed two roads overnight. The dispatchers need a decision by noon. What will you do?',
  'util.ev.storm.crews.label': 'Pay ${cost} for crews',
  'util.ev.storm.crews.0.out': 'The crews worked through the night and had you running by morning. The bill was ${cost}.',
  'util.ev.storm.degraded.label': 'Run degraded',
  'util.ev.storm.degraded.0.out': 'You ran on what still worked. Output fell, and the damaged kit wore faster.',
  'util.ev.storm.power.label': 'Rent backup for ${cost}',
  'util.ev.storm.power.0.out': 'You rented backup supply for the week at ${cost}, and output held.',

  'util.ev.rateCase.head': 'A Rate Case',
  'util.ev.rateCase.scene': 'The regulator opened a rate case. It plans to trim your rates unless you answer. What will you do?',
  'util.ev.rateCase.file.label': 'File for an increase',
  'util.ev.rateCase.file.0.out': 'The regulator granted an increase. After fees of ${fees} you gained ${net}.',
  'util.ev.rateCase.file.1.out': 'The regulator refused and trimmed your rates anyway. The cut and fees came to ${cost}.',
  'util.ev.rateCase.accept.label': 'Accept the cut',
  'util.ev.rateCase.accept.0.out': 'You accepted the cut. The new rates cost you ${cost} this year.',
  'util.ev.rateCase.settle.label': 'Settle for ${cost}',
  'util.ev.rateCase.settle.0.out': 'You settled with the regulator. The trim was small, and the deal cost ${cost}.',

  'util.ev.fuelSpike.head': 'Fuel Price Spike',
  'util.ev.fuelSpike.scene': 'Fuel prices jumped this month. Your next bills will carry the increase. What will you do?',
  'util.ev.fuelSpike.hedge.label': 'Hedge now for ${cost}',
  'util.ev.fuelSpike.hedge.0.out': 'You paid ${cost} for fuel cover. The spike still hit the share you had left open.',
  'util.ev.fuelSpike.pass.label': 'Pass it on',
  'util.ev.fuelSpike.pass.0.out': 'You raised prices to cover the fuel. Some customers left, and most stayed.',
  'util.ev.fuelSpike.absorb.label': 'Absorb it',
  'util.ev.fuelSpike.absorb.0.out': 'You absorbed the increase. This month and next year both ran at a higher cost.',

  'util.ev.subsidy.head': 'A Grant Opens',
  'util.ev.subsidy.energy.scene': 'A grid grant is open for plant upgrades. The forms are due Friday. What will you do?',
  'util.ev.subsidy.solar.scene': 'A clean power grant is open for new panels. The forms are due Friday. What will you do?',
  'util.ev.subsidy.water.scene': 'A pipe renewal grant is open this season. The forms are due Friday. What will you do?',
  'util.ev.subsidy.farm.scene': 'A farm aid scheme is open this season. The forms are due Friday. What will you do?',
  'util.ev.subsidy.apply.label': 'Apply and pay ${cost}',
  'util.ev.subsidy.apply.0.out': 'The grant came through. After ${fees} in paperwork you gained ${net}.',
  'util.ev.subsidy.apply.1.out': 'The agency turned the claim down. The paperwork cost you ${fees}.',
  'util.ev.subsidy.skip.label': 'Skip it',
  'util.ev.subsidy.skip.0.out': 'You let the deadline pass and the forms went unfiled.',

  'util.ev.bigCustomer.head': 'A Big Customer',
  'util.ev.bigCustomer.dataCenter.scene': 'A large tenant wants a third of your racks and asks for a discount. What will you do?',
  'util.ev.bigCustomer.telecom.scene': 'A large employer wants lines for every site and asks for a discount. What will you do?',
  'util.ev.bigCustomer.telecomNet.scene': 'A large employer wants broadband for every site and asks for a discount. What will you do?',
  'util.ev.bigCustomer.logistics.scene': 'A large shipper wants all its freight with you and asks for a discount. What will you do?',
  'util.ev.bigCustomer.discount.label': 'Offer a discount',
  'util.ev.bigCustomer.discount.0.out': 'They took the discount and signed. Demand rose, and the discount cost ${cost}.',
  'util.ev.bigCustomer.discount.1.out': 'They used your offer to bargain with a rival and signed nothing.',
  'util.ev.bigCustomer.release.label': 'Let them go',
  'util.ev.bigCustomer.release.0.out': 'You let them go and they signed with a rival. The rival took a few of your accounts too.',
  'util.ev.bigCustomer.release.1.out': 'You let them go and they signed with a rival. Your own accounts stayed put.',
  'util.ev.bigCustomer.lock.label': 'Lock a contract',
  'util.ev.bigCustomer.lock.0.out': 'You locked a long contract and paid ${cost} in discounts. Your sales are steadier now.',

  'util.ev.shortage.head': 'A Labor Shortage',
  'util.ev.shortage.logistics.scene': 'Three drivers quit this month and routes are going uncovered. What will you do?',
  'util.ev.shortage.farm.scene': "The harvest hands you counted on never showed. The crop won't wait. What will you do?",
  'util.ev.shortage.dataCenter.scene': 'Two night technicians quit. The racks need watching around the clock. What will you do?',
  'util.ev.shortage.raise.label': 'Raise pay',
  'util.ev.shortage.raise.0.out': 'You raised pay 4% across the team. People stayed and output held.',
  'util.ev.shortage.temps.label': 'Hire temps for ${cost}',
  'util.ev.shortage.temps.0.out': 'The temps covered the gap for ${cost}, and output held through the month.',
  'util.ev.shortage.temps.1.out': 'The temps were slow and needed training. You paid ${cost} and lost some output.',
  'util.ev.shortage.cut.label': 'Cut back the work',
  'util.ev.shortage.cut.0.out': 'You cut back the work until you could hire. Output fell for the season.',

  'util.ev.recall.head': 'A Parts Recall',
  'util.ev.recall.scene': 'The maker of a key part recalled it. Yours is in the affected batch. What will you do?',
  'util.ev.recall.replace.label': 'Replace it for ${cost}',
  'util.ev.recall.replace.0.out': 'You replaced the part for ${cost}. The new one runs cleaner than the old.',
  'util.ev.recall.wait.label': 'Wait and watch',
  'util.ev.recall.wait.0.out': 'The part held. The recall passed without a bill.',
  'util.ev.recall.wait.1.out': 'The part failed. The repair cost ${cost} and output fell for a while.',
}

/** Every string of the family. The yearly outage and condition lines come from the math file. */
export const UTIL_COPY: CopyTable = { ...UTIL_NOTE_COPY, ...LEVER_COPY, ...EVENT_COPY }

type Vals = Record<string, string | number>
const text = (key: string, vals?: Vals): string => sectorText(UTIL_COPY, key, vals)

// ---------------------------------------------------------------------------
// Levers: a stored number each, one change a year. The overhaul is the one paid action.

function option(lever: string, value: number): LeverOption {
  return { value, label: text(`util.lever.${lever}.${value}.label`), tip: text(`util.lever.${lever}.${value}.tip`) }
}

/** `overhaul` holds the year of the last overhaul, so the setting reads as done only in the year it was paid. */
const OVERHAUL_LEVER: LeverDef = {
  id: 'overhaul', label: text('util.lever.overhaul.label'), paid: true,
  options: () => [option('overhaul', 1)],
  current: (st: UtilState, year) => (st.overhaul === year ? 1 : 0),
  apply: (st: UtilState, _value, year) => ({ ...st, overhaul: year }),
  cost: (_g, b: BizState, _st, _value, cx: SectorCtx) => {
    const row = utilRow(b.industry)
    return row ? overhaulCost(b, row, cx) : 0
  },
}

/** Only a trade with a spot share can move its mix: water and telecom are regulated, so the desk shows no such row. */
const CONTRACT_LEVER: LeverDef = {
  id: 'contract', label: text('util.lever.contract.label'), paid: false,
  options: (_g: GameState, b: BizState) => {
    const row = utilRow(b.industry)
    return row && row.vol > 0 ? contractOptions(row.floor).map((v) => option('contract', v)) : []
  },
  current: (st: UtilState) => st.contract,
  apply: (st: UtilState, value) => ({ ...st, contract: clampN(round2(value), 0, 1) }),
  cost: () => 0,
}

/** Only a trade with a fuel share has anything to hedge: solar and telecom get no options. */
const HEDGES = [0, .5, .8] as const
const HEDGE_LEVER: LeverDef = {
  id: 'hedge', label: text('util.lever.hedge.label'), paid: false,
  options: (_g: GameState, b: BizState) => ((utilRow(b.industry)?.fuel ?? 0) > 0 ? HEDGES.map((v) => option('hedge', v)) : []),
  current: (st: UtilState) => st.hedge,
  apply: (st: UtilState, value) => ({ ...st, hedge: clampN(value, 0, .8) }),
  cost: () => 0,
}

const COVER_LEVER: LeverDef = {
  id: 'cover', label: text('util.lever.cover.label'), paid: false,
  options: () => [0, 1].map((v) => option('cover', v)),
  current: (st: UtilState) => st.cover,
  apply: (st: UtilState, value) => ({ ...st, cover: value >= 1 ? 1 : 0 }),
  cost: () => 0,
}

export const UTIL_LEVERS: readonly LeverDef[] = [OVERHAUL_LEVER, CONTRACT_LEVER, HEDGE_LEVER, COVER_LEVER]

// ---------------------------------------------------------------------------
// Events. Every branch is built inside branches() from the company's own numbers.

const ctxOf = (g: GameState, b: BizState): SectorCtx => sectorCtx(g, b, g.year)
/** The most cash one outcome may move (spec 4.1). */
const cap = (cx: SectorCtx): number => Math.floor(Math.max(.12 * cx.base, 3000 * cx.level))
/** Whole dollars, never above the cap. */
const outlay = (cx: SectorCtx, x: number): number => Math.min(Math.max(0, Math.round(x)), cap(cx))
const out = (x: number): number => (x > 0 ? -x : 0)
const rowOf = (b: BizState): UtilRow | null => utilRow(b.industry)

function branch(p: number, key: string, fx: BizFx, sec?: SecFx, vals?: Vals): Branch {
  return { p, fx, text: key, ...(sec ? { sec } : {}), ...(vals ? { vals } : {}) }
}

/** Build a choice whose branches come from one function of the live numbers. */
function choice(event: string, id: string, vals: Vals | undefined, branches: SectorChoice['branches']): SectorChoice {
  return { id, label: text(`util.ev.${event}.${id}.label`, vals), branches }
}

/** The trade a scene is written for when its own trade has no variant. */
const SCENE_FALLBACK: Readonly<Record<string, string>> = { storm: 'energy', subsidy: 'energy', bigCustomer: 'logistics', shortage: 'logistics' }

/** A scene in the trade's own words. Telecom speaks of broadband only once the internet exists where it runs. */
function sceneFor(event: string, g: GameState, b: BizState): string {
  const broadband = event === 'bigCustomer' && b.industry === 'telecom' && bizHas(g, b.countryId, 'internet')
  return text(`util.ev.${event}.${broadband ? 'telecomNet' : b.industry}.scene`) || text(`util.ev.${event}.${SCENE_FALLBACK[event]}.scene`)
}

// ---- storm

/** A crew call-out: a floor by price level, else 1% of a normal year's sales. */
function crewBill(cx: SectorCtx): number {
  return outlay(cx, Math.max(2500 * cx.level, .01 * cx.base))
}

/** Backup supply for the week costs three crew bills. */
function backupBill(cx: SectorCtx): number {
  return outlay(cx, 3 * crewBill(cx))
}

/** The output a storm takes from a plant left to run degraded: more from a worn one. */
function stormLoss(condition: number): number {
  return round2(clampN(.07 + .1 * (1 - condition / 100), .07, .17))
}

const STORM: SectorEvent = {
  id: 'storm', family: 'util', title: text('util.ev.storm.head'), emoji: '\u{26C8}\u{FE0F}',
  weight: (_g, _b, st: UtilState) => 1 + Math.max(0, 65 - st.condition) / 50,
  scene: (g, _a: Asset, b) => sceneFor('storm', g, b),
  choices: (g, b) => [
    choice('storm', 'crews', { cost: money(crewBill(ctxOf(g, b))) }, (gg, bb) => {
      const bill = crewBill(ctxOf(gg, bb))
      return [branch(1, 'util.ev.storm.crews.0.out', { cash: out(bill), capacityTo: .02 }, { add: { condition: -2 } }, { cost: money(bill) })]
    }),
    choice('storm', 'degraded', undefined, (_gg, _bb, ss: UtilState) => [
      branch(1, 'util.ev.storm.degraded.0.out', { capacityTo: stormLoss(ss.condition), brand: -2 }, { add: { condition: -7 } }),
    ]),
    choice('storm', 'power', { cost: money(backupBill(ctxOf(g, b))) }, (gg, bb) => {
      const bill = backupBill(ctxOf(gg, bb))
      return [branch(1, 'util.ev.storm.power.0.out', { cash: out(bill) }, undefined, { cost: money(bill) })]
    }),
  ],
}

// ---- rateCase

/** What the regulator's trim is worth: a floor by price level, else 2.5% of the regulated sales (a fifth of sales at least, so the number is never tiny). */
function rateAmount(cx: SectorCtx, row: UtilRow): number {
  return outlay(cx, Math.max(2000 * cx.level, .025 * Math.max(.2, row.floor) * cx.base))
}

/** The cost of a hearing: a floor by price level, else .4% of a normal year's sales. */
function hearingFee(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .004 * cx.base))
}

/** The better the plant is kept, the likelier the regulator grants an increase. */
function increaseP(condition: number): number {
  return clampN(.25 + condition / 200, .25, .7)
}

/** A settlement: 15% of the trim and half a hearing's fee. */
function settlement(cx: SectorCtx, row: UtilRow): number {
  return Math.min(Math.round(.15 * rateAmount(cx, row) + .5 * hearingFee(cx)), cap(cx))
}

const RATE_CASE: SectorEvent = {
  id: 'rateCase', family: 'util', title: text('util.ev.rateCase.head'), emoji: '\u{2696}\u{FE0F}',
  weight: (_g, b) => ((rowOf(b)?.floor ?? 0) >= .5 ? .8 : 0),
  scene: () => text('util.ev.rateCase.scene'),
  choices: (g, b) => {
    const row = rowOf(b)
    return [
      choice('rateCase', 'file', undefined, (gg, bb, ss: UtilState) => {
        const cx = ctxOf(gg, bb)
        const r = rowOf(bb)
        const rate = r ? rateAmount(cx, r) : 0
        const fee = hearingFee(cx)
        const win = increaseP(ss.condition)
        const net = Math.max(0, rate - fee)
        const lost = Math.min(fee + Math.round(.5 * rate), cap(cx))
        return [
          branch(win, 'util.ev.rateCase.file.0.out', { cash: net, brand: 2 }, undefined, { fees: money(fee), net: money(net) }),
          branch(1 - win, 'util.ev.rateCase.file.1.out', { cash: out(lost), brand: -2 }, undefined, { cost: money(lost) }),
        ]
      }),
      choice('rateCase', 'accept', undefined, (gg, bb) => {
        const cx = ctxOf(gg, bb)
        const r = rowOf(bb)
        const cut = r ? outlay(cx, .3 * rateAmount(cx, r)) : 0
        return [branch(1, 'util.ev.rateCase.accept.0.out', { cash: out(cut) }, undefined, { cost: money(cut) })]
      }),
      choice('rateCase', 'settle', { cost: money(row ? settlement(ctxOf(g, b), row) : 0) }, (gg, bb) => {
        const r = rowOf(bb)
        const paid = r ? settlement(ctxOf(gg, bb), r) : 0
        return [branch(1, 'util.ev.rateCase.settle.0.out', { cash: out(paid) }, undefined, { cost: money(paid) })]
      }),
    ]
  },
}

// ---- fuelSpike

/** How far fuel prices jump, and what this month's fuel bought at the spike costs (a share of a normal year's sales per unit of fuel share). */
const SPIKE = .26
const SPIKE_CASH = .06
/** The first year's premium of a half hedge, as a share of a normal year's sales per unit of fuel share. */
const HALF_HEDGE_PREMIUM = .025 * .5

interface Spike { cash: number; shock: number }

/** What the spike costs a plant with this much of its fuel hedged: this month's bill and next year's unit cost. */
function spikeAt(cx: SectorCtx, row: UtilRow, hedge: number): Spike {
  const open = 1 - clampN(hedge, 0, .8)
  return { cash: outlay(cx, SPIKE_CASH * row.fuel * open * cx.base), shock: 1 + SPIKE * row.fuel * open }
}

/** A cost shock only when there is one (a trade with no fuel share sees none). */
function spikeFx(cash: number, shock: number): BizFx {
  return { ...(cash > 0 ? { cash: -cash } : {}), ...(shock > 1 + 1e-9 ? { costTo: shock } : {}) }
}

const FUEL_SPIKE: SectorEvent = {
  id: 'fuelSpike', family: 'util', title: text('util.ev.fuelSpike.head'), emoji: '\u{26FD}',
  weight: (_g, b) => ((rowOf(b)?.fuel ?? 0) > 0 ? .7 : 0),
  scene: () => text('util.ev.fuelSpike.scene'),
  choices: (g, b) => {
    const row = rowOf(b)
    return [
      choice('fuelSpike', 'hedge', { cost: money(row ? outlay(ctxOf(g, b), HALF_HEDGE_PREMIUM * row.fuel * ctxOf(g, b).base) : 0) }, (gg, bb, ss: UtilState) => {
        const cx = ctxOf(gg, bb)
        const r = rowOf(bb)
        if (!r) return [branch(1, 'util.ev.fuelSpike.hedge.0.out', {}, undefined, { cost: money(0) })]
        const premium = outlay(cx, HALF_HEDGE_PREMIUM * r.fuel * cx.base)
        // Below half a hedge this buys half; at half or more it protects nothing extra, so only the premium is new.
        const lower = ss.hedge < .5
        const spike = spikeAt(cx, r, lower ? .5 : ss.hedge)
        return [branch(1, 'util.ev.fuelSpike.hedge.0.out', spikeFx(Math.min(spike.cash + premium, cap(cx)), spike.shock), lower ? { set: { hedge: .5 } } : undefined, { cost: money(premium) })]
      }),
      choice('fuelSpike', 'pass', undefined, (gg, bb, ss: UtilState) => {
        const r = rowOf(bb)
        const spike = r ? spikeAt(ctxOf(gg, bb), r, ss.hedge) : { cash: 0, shock: 1 }
        // Customers carry 60% of the increase, and some leave over it (a plant with no fuel to pass on loses none).
        const leave: BizFx = spike.shock > 1 + 1e-9 ? { demandTo: .97, brand: -1 } : {}
        return [branch(1, 'util.ev.fuelSpike.pass.0.out', { ...spikeFx(Math.round(.4 * spike.cash), 1 + .4 * (spike.shock - 1)), ...leave })]
      }),
      choice('fuelSpike', 'absorb', undefined, (gg, bb, ss: UtilState) => {
        const r = rowOf(bb)
        const spike = r ? spikeAt(ctxOf(gg, bb), r, ss.hedge) : { cash: 0, shock: 1 }
        return [branch(1, 'util.ev.fuelSpike.absorb.0.out', spikeFx(spike.cash, spike.shock))]
      }),
    ]
  },
}

// ---- subsidy

const SUBSIDY_TRADES: readonly string[] = ['energy', 'solar', 'water', 'farm']

/** The grant: a floor by price level, else 2% of a normal year's sales. */
function grantSum(cx: SectorCtx): number {
  return outlay(cx, Math.max(3000 * cx.level, .02 * cx.base))
}

/** The paperwork, paid win or lose: a floor by price level, else .6% of a normal year's sales. */
function paperwork(cx: SectorCtx): number {
  return outlay(cx, Math.max(1000 * cx.level, .006 * cx.base))
}

const SUBSIDY: SectorEvent = {
  id: 'subsidy', family: 'util', title: text('util.ev.subsidy.head'), emoji: '\u{1F4B5}',
  weight: (_g, b) => (SUBSIDY_TRADES.includes(b.industry) ? .5 : 0),
  scene: (g, _a: Asset, b) => sceneFor('subsidy', g, b),
  choices: (g, b) => [
    choice('subsidy', 'apply', { cost: money(paperwork(ctxOf(g, b))) }, (gg, bb, ss: UtilState) => {
      const cx = ctxOf(gg, bb)
      const fees = paperwork(cx)
      const net = Math.max(0, grantSum(cx) - fees)
      // A plant that is run down gets a harder look from the agency.
      const win = clampN(.2 + ss.condition / 150, .2, .7)
      return [
        branch(win, 'util.ev.subsidy.apply.0.out', { cash: net }, undefined, { fees: money(fees), net: money(net) }),
        branch(1 - win, 'util.ev.subsidy.apply.1.out', { cash: out(fees) }, undefined, { fees: money(fees) }),
      ]
    }),
    choice('subsidy', 'skip', undefined, () => [branch(1, 'util.ev.subsidy.skip.0.out', {})]),
  ],
}

// ---- bigCustomer

const CUSTOMER_TRADES: readonly string[] = ['dataCenter', 'telecom', 'logistics']

/** The discount a big customer asks for: a floor by price level, else 1.2% of a normal year's sales. */
function dealDiscount(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .012 * cx.base))
}

const BIG_CUSTOMER: SectorEvent = {
  id: 'bigCustomer', family: 'util', title: text('util.ev.bigCustomer.head'), emoji: '\u{1F91D}',
  weight: (_g, b) => (CUSTOMER_TRADES.includes(b.industry) ? .6 : 0),
  scene: (g, _a: Asset, b) => sceneFor('bigCustomer', g, b),
  choices: () => [
    choice('bigCustomer', 'discount', undefined, (gg, bb) => {
      const d = dealDiscount(ctxOf(gg, bb))
      // Three times in four they sign; otherwise they take the offer to a rival and nothing changes.
      return [
        branch(.75, 'util.ev.bigCustomer.discount.0.out', { cash: out(d), demandTo: 1.02, brand: 1 }, undefined, { cost: money(d) }),
        branch(.25, 'util.ev.bigCustomer.discount.1.out', {}),
      ]
    }),
    choice('bigCustomer', 'release', undefined, () => [
      branch(.3, 'util.ev.bigCustomer.release.0.out', { demandTo: .99 }),
      branch(.7, 'util.ev.bigCustomer.release.1.out', {}),
    ]),
    // A long contract: a deeper discount, more demand, and a quarter more of your sales on contract.
    choice('bigCustomer', 'lock', undefined, (gg, bb) => {
      const d = outlay(ctxOf(gg, bb), 2 * dealDiscount(ctxOf(gg, bb)))
      return [branch(1, 'util.ev.bigCustomer.lock.0.out', { cash: out(d), demandTo: 1.03, brand: 1 }, { add: { contract: .25 } }, { cost: money(d) })]
    }),
  ],
}

// ---- shortage

const SHORTAGE_TRADES: readonly string[] = ['logistics', 'farm', 'dataCenter']

/** Temps for the month: a floor by price level, else 1% of a normal year's sales. */
function tempsBill(cx: SectorCtx): number {
  return outlay(cx, Math.max(1500 * cx.level, .01 * cx.base))
}

const SHORTAGE: SectorEvent = {
  id: 'shortage', family: 'util', title: text('util.ev.shortage.head'), emoji: '\u{1F477}',
  weight: (_g, b) => (SHORTAGE_TRADES.includes(b.industry) ? .6 : 0),
  scene: (g, _a: Asset, b) => sceneFor('shortage', g, b),
  choices: (g, b) => [
    choice('shortage', 'raise', undefined, () => [branch(1, 'util.ev.shortage.raise.0.out', { wage: .04, morale: 3 })]),
    choice('shortage', 'temps', { cost: money(tempsBill(ctxOf(g, b))) }, (gg, bb) => {
      const bill = tempsBill(ctxOf(gg, bb))
      const vals = { cost: money(bill) }
      return [
        branch(.6, 'util.ev.shortage.temps.0.out', { cash: out(bill) }, undefined, vals),
        branch(.4, 'util.ev.shortage.temps.1.out', { cash: out(bill), capacityTo: .05 }, undefined, vals),
      ]
    }),
    choice('shortage', 'cut', undefined, () => [branch(1, 'util.ev.shortage.cut.0.out', { capacityTo: .10, brand: -1 })]),
  ],
}

// ---- recall

/** A replacement part: a floor by price level, else 1.2% of a normal year's sales. */
function partBill(cx: SectorCtx): number {
  return outlay(cx, Math.max(2000 * cx.level, .012 * cx.base))
}

const RECALL: SectorEvent = {
  id: 'recall', family: 'util', title: text('util.ev.recall.head'), emoji: '\u{1F527}',
  weight: () => .4,
  scene: () => text('util.ev.recall.scene'),
  choices: (g, b) => [
    choice('recall', 'replace', { cost: money(partBill(ctxOf(g, b))) }, (gg, bb) => {
      const bill = partBill(ctxOf(gg, bb))
      return [branch(1, 'util.ev.recall.replace.0.out', { cash: out(bill) }, { add: { condition: 3 } }, { cost: money(bill) })]
    }),
    choice('recall', 'wait', undefined, (gg, bb, ss: UtilState) => {
      const cx = ctxOf(gg, bb)
      // A worn plant is likelier to have the faulty part fail; a failure costs 60% more than replacing it would have.
      const fail = clampN(.2 + Math.max(0, 65 - ss.condition) / 100, .2, .6)
      const repair = outlay(cx, 1.6 * partBill(cx))
      return [
        branch(1 - fail, 'util.ev.recall.wait.0.out', {}),
        branch(fail, 'util.ev.recall.wait.1.out', { cash: out(repair), capacityTo: .06 }, { add: { condition: -4 } }, { cost: money(repair) }),
      ]
    }),
  ],
}

export const UTIL_EVENTS: readonly SectorEvent[] = [STORM, RATE_CASE, FUEL_SPIKE, SUBSIDY, BIG_CUSTOMER, SHORTAGE, RECALL]

export const UTIL_MODEL: FamilyModel = {
  family: 'util', copy: UTIL_COPY, seed: utilSeed, effects: utilFx, header: utilHeader, levers: UTIL_LEVERS, events: UTIL_EVENTS,
}

registerFamily(UTIL_MODEL)
