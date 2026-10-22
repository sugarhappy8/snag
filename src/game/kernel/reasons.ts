// The reason table (R2, design 4.1): why money moved, and who is on the other side when the caller names no one.
//
// Every booking carries a reason from REASONS. A reason says who receives when an entity pays (`pay`) and who pays when an entity
// receives (`get`), so `addMoney(g, -500, 'tax.income')` needs no second account: the table sends it to gov:<country>. A caller that
// knows the real counterparty names it (`with`) and the table is only the default. Pools are the world's anonymous crowds (the
// landlords, the retailers, the households of a country): money that leaves a life goes to one and money that arrives comes from one.
//
// Mints and burns are the only places a dollar is created or destroyed, they are a closed list, and each has a yearly cap. A mint
// over its room is clipped (kernel/ledger.ts bookMint), so nothing can run away. Each cap is a ceiling-list entry.
//
// A track that needs a new reason appends one line to its group, keeping the group in alphabetical order, with its default
// counterparties. Never rename or delete one: saved flow rows and the reasoned-call ratchet name them. At most 80 reasons exist.
//
// This file is part of the kernel (L0): it imports only types.
import type { EntityRef } from './ids'

/** The anonymous crowds a flow can start or end in. Closed: a new pool is a decision. */
export const POOLS = [
  'banks',
  'charity',
  'crime',
  'edu',
  'employers',
  'family',
  'firms',
  'health',
  'hh',
  'insurers',
  'landlords',
  'legal',
  'leisure',
  'markets',
  'other',
  'retail',
  'sellers',
] as const
export type PoolName = (typeof POOLS)[number]

/** A yearly-capped way to create money. `cap` is dollars a year; 0 means "declared but off". */
export interface SinkDef {
  cap: number
  why: string
}

export const MINTS = {
  immigrants: { cap: 500_000_000, why: 'savings that immigrants bring with them' },
  lending: { cap: 1_000_000_000_000, why: 'a lender creates the deposit it lends' },
  printing: { cap: 0, why: 'central-bank printing in a declared war (a later release raises the cap)' },
  revaluation: { cap: 1_000_000_000_000, why: 'falling prices raise what held cash buys, and an inflating debt shrinks' },
} as const satisfies Record<string, SinkDef>
export type MintName = keyof typeof MINTS

export const BURNS = {
  emigration: { cap: 1_000_000_000_000, why: 'what a named entity takes out of the world when it leaves' },
  inflation: { cap: 1_000_000_000_000, why: 'erosion of held cash and company cash' },
  writeoff: { cap: 1_000_000_000_000, why: 'a debt removed without payment destroys the deposit it created' },
} as const satisfies Record<string, SinkDef>
export type BurnName = keyof typeof BURNS

/** A counterparty as the table writes it: a pool, the player's government, abroad, or a sink. */
export type Cp = PoolName | 'gov' | 'abroad' | `mint:${MintName}` | `burn:${BurnName}`

export interface ReasonDef {
  /** Who receives when the entity pays. */
  pay: Cp
  /** Who pays when the entity receives. */
  get: Cp
  note: string
}

const same = (cp: Cp, note: string): ReasonDef => ({ pay: cp, get: cp, note })

// Each group is sorted by name. One reason per line, so a new one is a one-line diff.
const WORK = {
  benefit: same('gov', 'welfare, allowance, subsidy, royal allowance'),
  'career.cost': same('other', 'what a career spends (the career kit pay)'),
  'career.income': same('employers', 'what a career earns (the career kit earn)'),
  pension: same('gov', 'state and private pension'),
  prize: same('other', 'contests, awards, windfall prizes'),
  royalty: same('markets', 'royalties, residuals, advances, licences'),
  severance: same('employers', 'a payout on losing a job'),
  wage: same('employers', 'salary, job pay, prison wages'),
} as const satisfies Record<string, ReasonDef>

const TAX_AND_LAW = {
  bribe: same('crime', 'money slipped to someone for a favour'),
  'fee.gov': same('gov', 'licences, permits, visas'),
  fine: same('gov', 'penalties paid to the state'),
  legal: same('legal', 'lawyers, settlements, court costs'),
  'tax.capgains': same('gov', 'capital gains tax'),
  'tax.corp': same('gov', 'company tax'),
  'tax.estate': same('gov', 'estate and inheritance tax'),
  'tax.income': same('gov', 'income tax'),
  'tax.property': same('gov', 'property tax'),
  'tax.sales': same('gov', 'sales and value added tax'),
  'tax.transaction': same('gov', 'tax on trades'),
} as const satisfies Record<string, ReasonDef>

const LIVING = {
  claim: same('insurers', 'an insurer pays out'),
  health: same('health', 'doctors, hospitals, drugs'),
  leisure: same('leisure', 'travel, nightlife, clubs, memberships'),
  living: same('retail', 'cost of living'),
  premium: same('insurers', 'insurance premiums'),
  purchase: same('retail', 'everyday goods, repairs, upkeep, refunds'),
  rent: { pay: 'landlords', get: 'hh', note: 'paying rent goes to landlords, receiving rent comes from households' },
  tuition: same('edu', 'school and university fees'),
} as const satisfies Record<string, ReasonDef>

const ASSETS = {
  'asset.buy': same('retail', 'vehicles, jewelry, art, instruments'),
  'asset.sell': same('retail', 'vehicles, jewelry, art, instruments'),
  'property.buy': same('sellers', 'a home or a lot bought'),
  'property.sell': same('sellers', 'a home or a lot sold'),
} as const satisfies Record<string, ReasonDef>

const CREDIT = {
  'fee.bank': same('banks', 'bank fees'),
  'loan.interest': same('banks', 'interest on a loan'),
  'loan.principal': { pay: 'banks', get: 'mint:lending', note: 'the lender creates what it lends' },
  'loan.repay': same('banks', 'principal paid back'),
} as const satisfies Record<string, ReasonDef>

const MARKETS = {
  'bond.redeem': same('gov', 'a bond repaid at par; always name the issuer with `with`'),
  dividend: same('markets', 'dividends'),
  'invest.income': same('markets', 'coupons and interest'),
  'trade.buy': same('markets', 'a security bought'),
  'trade.sell': same('markets', 'a security sold'),
} as const satisfies Record<string, ReasonDef>

const LUCK = {
  gamble: same('leisure', 'bets and lotteries'),
  luck: same('other', 'an event money effect with no named party'),
} as const satisfies Record<string, ReasonDef>

const FAMILY = {
  divorce: same('family', 'a divorce settlement'),
  donation: same('charity', 'gifts to charity'),
  estate: same('family', 'an estate passed on'),
  gift: same('family', 'a gift between people'),
  inheritance: same('family', 'what an heir receives'),
  support: same('family', 'money sent to relatives'),
} as const satisfies Record<string, ReasonDef>

const CRIME = {
  'crime.cost': same('crime', 'what a crime costs its author'),
  'crime.take': same('crime', 'what a crime brings in'),
} as const satisfies Record<string, ReasonDef>

const BUSINESS = {
  capex: same('retail', 'equipment and buildings'),
  draw: same('other', 'an owner draws cash from a firm (use moveCash)'),
  'firm.sale': same('other', 'a company sold'),
  inject: same('other', 'an owner puts cash into a firm (use moveCash)'),
  inputs: same('retail', 'supplies, rent and services of a firm'),
  intel: same('other', 'reports, analysts and investigators'),
  marketing: same('other', 'advertising'),
  payroll: same('hh', 'wages and benefits paid to staff'),
  rnd: same('other', 'research and development'),
  sales: same('hh', 'revenue'),
} as const satisfies Record<string, ReasonDef>

const SINKS = {
  emigration: same('burn:emigration', 'only demote(..., emigrated) uses it'),
  inflation: { pay: 'burn:inflation', get: 'mint:revaluation', note: 'only erodeCash and erodeFirm use it' },
  writeoff: same('burn:writeoff', 'only writeoff() uses it'),
} as const satisfies Record<string, ReasonDef>

const DEFAULT = {
  unreasoned: same('other', 'what a call without a reason books; the ratchet counts it'),
} as const satisfies Record<string, ReasonDef>

/** The groups in table order, for the tests that hold each one sorted. */
export const REASON_GROUPS = {
  work: WORK,
  taxAndLaw: TAX_AND_LAW,
  living: LIVING,
  assets: ASSETS,
  credit: CREDIT,
  markets: MARKETS,
  luck: LUCK,
  family: FAMILY,
  crime: CRIME,
  business: BUSINESS,
  sinks: SINKS,
  default: DEFAULT,
} as const

export const REASONS = {
  ...WORK,
  ...TAX_AND_LAW,
  ...LIVING,
  ...ASSETS,
  ...CREDIT,
  ...MARKETS,
  ...LUCK,
  ...FAMILY,
  ...CRIME,
  ...BUSINESS,
  ...SINKS,
  ...DEFAULT,
} as const satisfies Record<string, ReasonDef>
export type Reason = keyof typeof REASONS

/** An account name as a string: `person:<id>`, `gov:<country>`, `pool:<name>`, `abroad`, and so on. */
export type AcctRefString = EntityRef | 'abroad'

/** What a mint books under when its caller names no reason. */
export const MINT_REASON: Readonly<Record<MintName, Reason>> = {
  immigrants: 'wage',
  lending: 'loan.principal',
  printing: 'benefit',
  revaluation: 'inflation',
}

/** What a burn books under when its caller names no reason. */
export const BURN_REASON: Readonly<Record<BurnName, Reason>> = {
  emigration: 'emigration',
  inflation: 'inflation',
  writeoff: 'writeoff',
}

/**
 * The account a counterparty of the table names, in `country`: `hh` is that country's households (pool:hh:<country>), `gov` is its
 * government, a pool is pool:<name>, and abroad and the sinks are written as they are.
 */
export function counterparty(cp: Cp, country: string): AcctRefString {
  if (cp === 'hh') return `pool:hh:${country}`
  if (cp === 'gov') return `gov:${country}`
  if (cp === 'abroad') return 'abroad'
  if (cp.startsWith('mint:') || cp.startsWith('burn:')) return cp as AcctRefString
  return `pool:${cp}`
}
