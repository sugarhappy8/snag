// Data for the sector families: the one extra key role per trade, the history rows and the trade
// tables (each family fills its own banner block). Data only: type-only imports from industries.ts,
// which imports withSectorRoles() from here when it builds INDUSTRIES.
import type { IndustryDef, RoleDef } from './industries'

export interface SectorRole extends RoleDef {
  /** What the role moves, at most 50 characters (the sector score first, then the generic effect). */
  blurb: string
}

const GOVERNANCE = 'Raises accreditation and quality'
const RETENTION = 'Keeps clients and brings in more'
const RELIABILITY = 'Fewer outages, slower wear, more capacity'

/** The 18 trades' extra key role (spec 4.2 to 4.4), merged last into each trade's roles. */
export const SECTOR_ROLES: Readonly<Record<string, SectorRole>> = {
  restaurant: { title: 'Food Safety Lead', focus: 'quality', pay: 52_000, blurb: 'Raises hygiene and quality' },
  foodTruck: { title: 'Food Safety Lead', focus: 'quality', pay: 38_000, blurb: 'Raises hygiene and quality' },
  cafe: { title: 'Food Safety Lead', focus: 'quality', pay: 40_000, blurb: 'Raises hygiene and quality' },
  bakery: { title: 'Food Safety Lead', focus: 'quality', pay: 42_000, blurb: 'Raises hygiene and quality' },
  clinic: { title: 'Clinical Governance Lead', focus: 'quality', pay: 110_000, blurb: GOVERNANCE },
  education: { title: 'Registrar', focus: 'quality', pay: 60_000, blurb: GOVERNANCE },
  gym: { title: 'Member Experience Lead', focus: 'sales', pay: 48_000, blurb: RETENTION },
  salon: { title: 'Client Relations Lead', focus: 'sales', pay: 40_000, blurb: RETENTION },
  petCare: { title: 'Pet Welfare Officer', focus: 'quality', pay: 42_000, blurb: GOVERNANCE },
  homeCare: { title: 'Safety and Vetting Officer', focus: 'quality', pay: 44_000, blurb: GOVERNANCE },
  autoShop: { title: 'Fleet Accounts Manager', focus: 'sales', pay: 58_000, blurb: RETENTION },
  energy: { title: 'Reliability Engineer', focus: 'ops', pay: 130_000, blurb: RELIABILITY },
  solar: { title: 'Asset Manager', focus: 'ops', pay: 95_000, blurb: RELIABILITY },
  water: { title: 'Network Engineer', focus: 'ops', pay: 85_000, blurb: RELIABILITY },
  telecom: { title: 'Network Reliability Lead', focus: 'ops', pay: 110_000, blurb: RELIABILITY },
  dataCenter: { title: 'Facilities Engineer', focus: 'ops', pay: 120_000, blurb: RELIABILITY },
  farm: { title: 'Irrigation Engineer', focus: 'ops', pay: 62_000, blurb: RELIABILITY },
  logistics: { title: 'Fleet Maintenance Chief', focus: 'ops', pay: 70_000, blurb: RELIABILITY },
}

/** The trades with the extra role get a new roles array (the role last); every other entry is returned as it is. */
export function withSectorRoles<T extends Record<string, IndustryDef>>(raw: T): T {
  const out: Record<string, IndustryDef> = {}
  for (const [id, def] of Object.entries(raw)) {
    const role = SECTOR_ROLES[id]
    out[id] = role ? { ...def, roles: [...def.roles, { title: role.title, focus: role.focus, pay: role.pay }] } : def
  }
  return out as T
}

/** What the trade's extra role moves (null: not this trade's sector role). */
export function sectorRoleBlurb(industry: string, title: string): string | null {
  const role = SECTOR_ROLES[industry]
  return role && role.title === title ? role.blurb : null
}

export interface SectorHistoryRow {
  /** A history/market-events.ts event id. */
  event: string
  trade: string
  /** Demand change per unit of the event's strength. */
  demand: number
  /** Added when the country has the internet (education moved online). */
  internet?: number
}

/** Real events for trades the engine's own exposure map leaves out (spec 4.5). Modelled approximations. */
export const SECTOR_HISTORY: readonly SectorHistoryRow[] = [
  { event: 'crash2020', trade: 'clinic', demand: -.08 },
  { event: 'crash2020', trade: 'education', demand: -.10, internet: .06 },
  { event: 'crash2020', trade: 'petCare', demand: .05 },
  { event: 'crash2020', trade: 'homeCare', demand: .06 },
  { event: 'crash2020', trade: 'bakery', demand: .03 },
]

// ---- food (Task 3)

/** One part of the day: its share of demand and its share of the seat-hours (spec 4.2). */
export interface DayPart { name: string; share: number; seat: number }
/** `amp` is the season swing, `waste` the prep and plate waste, `platform` and `fleet` the share of sales that can go out (fleet 0: none). */
export interface FoodRow { dayparts: readonly DayPart[]; amp: number; waste: number; platform: number; fleet: number }

export const FOOD: Readonly<Record<'restaurant' | 'foodTruck' | 'cafe' | 'bakery', FoodRow>> = {
  restaurant: { dayparts: [{ name: 'lunch', share: .28, seat: .30 }, { name: 'dinner', share: .60, seat: .45 }, { name: 'late', share: .12, seat: .25 }], amp: .04, waste: .08, platform: .25, fleet: .15 },
  foodTruck: { dayparts: [{ name: 'lunch', share: .45, seat: .40 }, { name: 'dinner', share: .45, seat: .40 }, { name: 'late', share: .10, seat: .20 }], amp: .10, waste: .07, platform: .15, fleet: 0 },
  cafe: { dayparts: [{ name: 'morning', share: .50, seat: .35 }, { name: 'midday', share: .30, seat: .35 }, { name: 'afternoon', share: .20, seat: .30 }], amp: .03, waste: .06, platform: .20, fleet: .10 },
  bakery: { dayparts: [{ name: 'morning', share: .70, seat: .55 }, { name: 'midday', share: .25, seat: .30 }, { name: 'close', share: .05, seat: .15 }], amp: .02, waste: .12, platform: .15, fleet: .15 },
}

// ---- care (Task 5)

/** What a payer (an insurer, a school board, a fleet account) takes: `disc` off the price, `up` more demand per unit of payer mix, `deny` of the bill denied. */
export interface PayerRow { disc: number; up: number; deny: number }
/** `visits` a client makes a year (display only), `r0` the retention a trade starts at, `crowd` the use above which clients feel it, `amp` the season swing (spec 4.3). */
export interface CareRow { visits: number; r0: number; crowd: number; amp: number; payer: PayerRow | null }

export const CARE: Readonly<Record<'clinic' | 'education' | 'gym' | 'salon' | 'petCare' | 'homeCare' | 'autoShop', CareRow>> = {
  clinic: { visits: 3.2, r0: .78, crowd: .85, amp: .02, payer: { disc: .22, up: .55, deny: .07 } },
  education: { visits: 1.6, r0: .55, crowd: .90, amp: .05, payer: { disc: .30, up: .70, deny: .02 } },
  gym: { visits: 1.0, r0: .68, crowd: .80, amp: .06, payer: { disc: .15, up: .35, deny: 0 } },
  salon: { visits: 5.0, r0: .72, crowd: .85, amp: .03, payer: null },
  petCare: { visits: 5.0, r0: .70, crowd: .85, amp: .03, payer: null },
  homeCare: { visits: 4.0, r0: .74, crowd: .90, amp: .02, payer: { disc: .25, up: .60, deny: .04 } },
  autoShop: { visits: 1.6, r0: .60, crowd: .90, amp: .02, payer: { disc: .12, up: .30, deny: .01 } },
}

// ---- util (Task 7)
