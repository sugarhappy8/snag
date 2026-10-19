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

// ---- care (Task 5)

// ---- util (Task 7)
