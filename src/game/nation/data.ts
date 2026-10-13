// Politics 2.0 catalogs: taxes, new taxes, budget lines, laws, trade measures, voter groups and
// parties. Pure data plus small pure helpers (era and country gates). Coefficients are per unit of
// each measure (points of a tax rate, a budget line's level above its baseline...) and are tuned
// for gameplay, not taken from national accounts. No game state is read here except through the
// arguments, and nothing consumes randomness.
import { marketOf, type Industry } from '../data/markets'
import type { Sector } from '../economy/model'
import { getCountry } from '../world'

export type TaxId = 'income' | 'corporate' | 'capitalGains' | 'sales' | 'wealth' | 'inheritance' | 'property'
export type NewTaxId = 'luxury' | 'windfall' | 'sugar' | 'carbon' | 'digital' | 'transactions'
export type BudgetLine = 'military' | 'healthcare' | 'education' | 'infrastructure' | 'police' | 'research' | 'welfare' | 'space'
export type GroupId = 'workers' | 'middle' | 'business' | 'retirees' | 'young' | 'rural'
export type TradeInput = 'essentials' | 'energy' | 'industry' | 'technology'
export type TariffInput = TradeInput | 'all'
export type LegalId = 'casinos' | 'prohibition' | 'cannabis' | 'marriage'
export type Scope = 'national' | 'regional' | 'city'
/** The economy's own GDP-share budget lines (economy/government.ts). */
export type PublicLine = 'education' | 'health' | 'infrastructure' | 'transfers' | 'other'

export const TAX_IDS: readonly TaxId[] = ['income', 'corporate', 'capitalGains', 'sales', 'wealth', 'inheritance', 'property']
export const NEW_TAX_IDS: readonly NewTaxId[] = ['luxury', 'windfall', 'sugar', 'carbon', 'digital', 'transactions']
export const BUDGET_LINES: readonly BudgetLine[] = ['military', 'healthcare', 'education', 'infrastructure', 'police', 'research', 'welfare', 'space']
export const GROUP_IDS: readonly GroupId[] = ['workers', 'middle', 'business', 'retirees', 'young', 'rural']
export const TRADE_INPUT_IDS: readonly TradeInput[] = ['essentials', 'energy', 'industry', 'technology']
export const LEGAL_IDS: readonly LegalId[] = ['casinos', 'prohibition', 'cannabis', 'marriage']
/** Sectors a government can deregulate, nationalize or privatize. */
export const STATE_SECTORS: readonly Sector[] = ['energy', 'finance', 'logistics', 'technology', 'care', 'industry']

/** Direction of a measure for party stances: right = pro-market, green, liberty, order. */
export interface Lean { econ?: number; green?: number; liberty?: number; order?: number }

/** What one unit of a measure does while it is in force. */
export interface Impact {
  /** Government revenue, share of GDP (permanent while in force). */
  revenue?: number
  /** Extra public spending by economy budget line, share of GDP. */
  spend?: Partial<Record<PublicLine, number>>
  /** Yearly impulses that fade after enactment (see effects.ts FADE). */
  growth?: number; inflation?: number; unemployment?: number; inequality?: number; confidence?: number
  /** Easier (+) or tighter (-) private credit while in force. */
  credit?: number
  /** Quality of public services (schools, hospitals, roads) while in force. */
  services?: number
  /** Demand and cost levels for whole sectors and single industries while in force (0.05 = +5%). */
  sectors?: Partial<Record<Sector, { demand?: number; costs?: number }>>
  industries?: Partial<Record<Industry, { demand?: number; costs?: number }>>
  /** Approval points by voter group while in force (habituates over the years). */
  groups?: Partial<Record<GroupId, number>>
  lean?: Lean
}

export interface TaxDef {
  id: TaxId; label: string; emoji: string; unit: 'pts' | '%'; min: number; max: number; step: number
  from: number; impact: Impact
  /** Beyond this many units in either direction avoidance and capital flight bite. */
  soft: number
  /** Which layers can set it. */
  scopes: Scope[]
}

export const TAXES: Record<TaxId, TaxDef> = {
  income: { id: 'income', label: 'Income tax', emoji: '💵', unit: 'pts', min: -15, max: 20, step: 1, from: 1900, soft: 10, scopes: ['national', 'regional'],
    impact: { revenue: .0035, growth: -.0005, unemployment: .0002, inequality: -.0006, groups: { workers: -.35, middle: -.6, business: -.35, retirees: -.2, young: -.25, rural: -.3 }, lean: { econ: -1 } } },
  corporate: { id: 'corporate', label: 'Corporate tax', emoji: '🏢', unit: 'pts', min: -15, max: 20, step: 1, from: 1900, soft: 10, scopes: ['national'],
    impact: { revenue: .0012, growth: -.0007, unemployment: .0003, inequality: -.0002, confidence: -.002, groups: { business: -1, workers: .1, young: .05 }, lean: { econ: -1 } } },
  capitalGains: { id: 'capitalGains', label: 'Capital gains tax', emoji: '📈', unit: 'pts', min: -15, max: 25, step: 1, from: 1913, soft: 12, scopes: ['national'],
    impact: { revenue: .0003, growth: -.0003, inequality: -.0004, confidence: -.001, groups: { business: -.5, retirees: -.15, middle: -.1, workers: .1 }, lean: { econ: -.8 } } },
  sales: { id: 'sales', label: 'Sales tax', emoji: '🧾', unit: 'pts', min: -8, max: 12, step: 1, from: 1900, soft: 8, scopes: ['national', 'regional'],
    impact: { revenue: .0045, growth: -.0004, inflation: .004, inequality: .0005, sectors: { consumer: { demand: -.004 }, leisure: { demand: -.004 } }, groups: { workers: -.5, middle: -.45, retirees: -.45, young: -.35, rural: -.4, business: -.25 }, lean: { econ: -.3 } } },
  wealth: { id: 'wealth', label: 'Wealth tax', emoji: '💎', unit: '%', min: 0, max: 5, step: .5, from: 1900, soft: 2, scopes: ['national'],
    impact: { revenue: .0025, growth: -.0015, inequality: -.004, confidence: -.01, groups: { business: -2.5, workers: .8, young: .6, middle: -.3, retirees: -.6 }, lean: { econ: -1.5 } } },
  inheritance: { id: 'inheritance', label: 'Inheritance tax', emoji: '⚱️', unit: 'pts', min: -25, max: 40, step: 5, from: 1900, soft: 25, scopes: ['national'],
    impact: { revenue: .00008, growth: -.00005, inequality: -.0003, groups: { retirees: -.15, middle: -.12, business: -.15, workers: .05, young: .05 }, lean: { econ: -.6 } } },
  property: { id: 'property', label: 'Property tax', emoji: '🏠', unit: '%', min: -1, max: 2, step: .1, from: 1900, soft: 1, scopes: ['national', 'regional', 'city'],
    impact: { revenue: .007, growth: -.0006, inequality: -.001, sectors: { housing: { demand: -.04 } }, groups: { middle: -3, retirees: -3, rural: -2, business: -1, young: .5 }, lean: { econ: -.5 } } },
}

export interface NewTaxDef {
  id: NewTaxId; label: string; emoji: string; from: number; blurb: string
  /** Needs a target industry (windfall). */
  targeted?: boolean
  impact: Impact
}
/** Levels 1-3 (low, medium, high); the impact is per level. */
export const NEW_TAXES: Record<NewTaxId, NewTaxDef> = {
  luxury: { id: 'luxury', label: 'Luxury tax', emoji: '💍', from: 1900, blurb: 'A tax on yachts, jewels and supercars.',
    impact: { revenue: .0006, inequality: -.0008, industries: { fashion: { demand: -.03 }, beauty: { demand: -.02 }, hotel: { demand: -.01 } }, groups: { business: -.6, middle: -.15, workers: .4, young: .2 }, lean: { econ: -.6 } } },
  windfall: { id: 'windfall', label: 'Windfall tax', emoji: '🌪️', from: 1915, targeted: true, blurb: 'An extra tax on one industry\'s profits.',
    impact: { revenue: .0008, growth: -.0004, confidence: -.003, groups: { workers: .5, young: .3, business: -1.2 }, lean: { econ: -.8 } } },
  sugar: { id: 'sugar', label: 'Sugar tax', emoji: '🍬', from: 1922, blurb: 'A tax on sweets and fizzy drinks.',
    impact: { revenue: .0004, industries: { cafe: { demand: -.02 }, bakery: { demand: -.025 }, grocery: { demand: -.008 }, restaurant: { demand: -.008 } }, groups: { workers: -.35, rural: -.3, retirees: .1, middle: .05 }, lean: { econ: -.3, order: .2 } } },
  carbon: { id: 'carbon', label: 'Carbon tax', emoji: '🏭', from: 1990, blurb: 'A price on fuel and emissions.',
    impact: { revenue: .003, growth: -.0006, inflation: .003, sectors: { energy: { costs: .04 }, industry: { costs: .02 }, logistics: { costs: .02 } }, industries: { solar: { demand: .06 }, battery: { demand: .05 }, electricVehicles: { demand: .05 }, recycling: { demand: .03 } }, groups: { young: 1, rural: -1.2, workers: -.4, business: -.5, retirees: -.2 }, lean: { econ: -.4, green: 1 } } },
  digital: { id: 'digital', label: 'Digital services tax', emoji: '🌐', from: 2019, blurb: 'A tax on online platforms\' local sales.',
    impact: { revenue: .0005, industries: { software: { costs: .02 }, ecommerce: { costs: .02 }, marketing: { costs: .015 }, aiLab: { costs: .015 } }, groups: { workers: .2, business: -.3, young: -.15 }, lean: { econ: -.5 } } },
  transactions: { id: 'transactions', label: 'Financial transactions tax', emoji: '🏦', from: 1900, blurb: 'A small tax on every trade and transfer.',
    impact: { revenue: .0006, confidence: -.004, industries: { bank: { demand: -.03 }, onlineBank: { demand: -.03 }, investmentFirm: { demand: -.05 } }, groups: { workers: .3, young: .2, business: -.6 }, lean: { econ: -.7 } } },
}

/** A tax break (levels 1-3) for one industry, per level. */
export const BREAK_IMPACT: Impact = { revenue: -.0003, growth: .0002, groups: { business: .35, workers: -.05 }, lean: { econ: .6 } }
/** A windfall tax adds this to the target industry's corporate rate per level; a break removes it. */
export const WINDFALL_RATE = .1
export const BREAK_RATE = .05

export interface BudgetDef {
  id: BudgetLine; label: string; emoji: string; from: number
  /** Baseline share of GDP and the economy line it is paid from. */
  share: number; line: PublicLine
  blurb: string
  /** Per +100% of baseline (level 2 = +1 unit, level 0.5 = -0.5). */
  impact: Impact
  scopes: Scope[]
}
export const BUDGET_MIN = .5
export const BUDGET_MAX = 2

export const BUDGET: Record<BudgetLine, BudgetDef> = {
  military: { id: 'military', label: 'Military', emoji: '🪖', from: 1900, share: .018, line: 'other', blurb: 'Defence contracts feed factories and shipyards.', scopes: ['national'],
    impact: { growth: .001, sectors: { industry: { demand: .05 }, technology: { demand: .015 } }, industries: { spaceTech: { demand: .12 }, robotics: { demand: .08 }, manufacturing: { demand: .04 } }, groups: { rural: 2, retirees: 1.2, workers: .5, young: -1.5, middle: -.3 }, lean: { order: 1, econ: .2 } } },
  healthcare: { id: 'healthcare', label: 'Healthcare', emoji: '🏥', from: 1900, share: .035, line: 'health', blurb: 'Hospitals, clinics and care.', scopes: ['national', 'regional'],
    impact: { services: .12, inequality: -.002, sectors: { care: { demand: .1 } }, industries: { biotech: { demand: .04 }, clinic: { demand: .06 } }, groups: { retirees: 4, workers: 2, middle: 1.5, young: 1, rural: 1, business: -.5 }, lean: { econ: -.6 } } },
  education: { id: 'education', label: 'Education', emoji: '🎓', from: 1900, share: .03, line: 'education', blurb: 'Schools, universities and skills.', scopes: ['national', 'regional', 'city'],
    impact: { services: .08, growth: .0005, unemployment: -.001, inequality: -.0015, sectors: { public: { demand: .08 } }, industries: { education: { demand: .1 } }, groups: { young: 4, middle: 2, workers: 1, retirees: -.3 }, lean: { econ: -.4 } } },
  infrastructure: { id: 'infrastructure', label: 'Infrastructure', emoji: '🌉', from: 1900, share: .025, line: 'infrastructure', blurb: 'Roads, rail, power lines and ports.', scopes: ['national', 'regional', 'city'],
    impact: { services: .05, growth: .002, unemployment: -.002, sectors: { housing: { demand: .08 }, logistics: { demand: .06 }, industry: { demand: .03 } }, industries: { construction: { demand: .1 } }, groups: { rural: 2, workers: 2, business: 1.5, middle: .5 }, lean: { econ: -.2 } } },
  police: { id: 'police', label: 'Police', emoji: '🚓', from: 1900, share: .007, line: 'other', blurb: 'Officers, courts and prisons.', scopes: ['national', 'regional', 'city'],
    impact: { services: .03, confidence: .002, groups: { retirees: 2, rural: 1.5, middle: 1, business: .5, young: -1.5 }, lean: { order: 1 } } },
  research: { id: 'research', label: 'Research', emoji: '🔬', from: 1900, share: .006, line: 'other', blurb: 'Labs, grants and moonshots.', scopes: ['national'],
    impact: { growth: .0008, sectors: { technology: { demand: .04 } }, industries: { aiLab: { demand: .08 }, biotech: { demand: .08 }, quantum: { demand: .1 }, semiconductor: { demand: .05 } }, groups: { young: 2, business: 1, middle: .5, rural: -.5 }, lean: { econ: -.2, green: .2 } } },
  welfare: { id: 'welfare', label: 'Welfare', emoji: '🤝', from: 1900, share: .05, line: 'transfers', blurb: 'Pensions, benefits and relief.', scopes: ['national'],
    impact: { services: .04, growth: -.0004, inequality: -.004, sectors: { consumer: { demand: .03 }, essentials: { demand: .02 } }, groups: { workers: 4, retirees: 2.5, young: 2, rural: 1.5, business: -2, middle: -1.5 }, lean: { econ: -1 } } },
  space: { id: 'space', label: 'Space program', emoji: '🚀', from: 1957, share: .0008, line: 'other', blurb: 'Rockets, satellites and national pride.', scopes: ['national'],
    impact: { sectors: { technology: { demand: .01 } }, industries: { spaceTech: { demand: .25 } }, groups: { young: 2, middle: .5, retirees: -1, workers: -.5 }, lean: { order: .2 } } },
}

export type LaborLevel = -1 | 0 | 1
export interface LawDefs {
  /** Per +10% of minimum-wage pressure. */
  minWage: Impact
  /** Per step (-1 weak / +1 strong). */
  labor: Impact
  environment: Impact
  /** Per deregulated sector. */
  dereg: Impact
  /** Per nationalized sector (demand hit applies to the sector's private firms). */
  nationalize: Impact
}
export const LAWS: LawDefs = {
  minWage: { unemployment: .0015, inequality: -.002, sectors: { essentials: { costs: .012 }, consumer: { costs: .012 }, leisure: { costs: .014 }, care: { costs: .01 }, housing: { costs: .005 } }, groups: { workers: 2, young: 1.5, middle: .3, business: -2, rural: -.3 }, lean: { econ: -1 } },
  labor: { unemployment: .003, inequality: -.003, sectors: { industry: { costs: .02 }, logistics: { costs: .02 }, consumer: { costs: .015 }, essentials: { costs: .01 } }, groups: { workers: 3, young: 1, business: -3, middle: .2 }, lean: { econ: -1 } },
  environment: { growth: -.0005, sectors: { energy: { costs: .03 }, industry: { costs: .025 } }, industries: { solar: { demand: .06 }, battery: { demand: .04 }, recycling: { demand: .06 }, water: { demand: .03 } }, groups: { young: 3, middle: .5, rural: -2, business: -1.5, workers: -.3 }, lean: { green: 1, econ: -.3 } },
  dereg: { growth: .0008, groups: { business: 1.2, workers: -.6, young: -.2 }, lean: { econ: 1, green: -.3 } },
  nationalize: { revenue: .003, growth: -.001, confidence: -.004, groups: { workers: 1.5, young: .5, business: -3, middle: -.5 }, lean: { econ: -1.5 } },
}
/** Deregulated sector: cheaper to run; finance deregulation loosens credit (and feeds bubbles). */
export const DEREG_COSTS = -.05
export const DEREG_FINANCE_CREDIT = .04
/** Private firms in a nationalized sector keep this share of their demand. */
export const NATIONALIZED_DEMAND = .55
/** State enterprises run less efficiently. */
export const NATIONALIZED_COSTS = .04

export interface LegalDef {
  id: LegalId; label: string; emoji: string; from: number
  /** Labels when the law makes the thing legal / illegal. */
  legalize: string; ban: string
  /** Industries the law opens or closes. */
  industries: Industry[]
  /** Approval when it becomes legal (banning reverses it). */
  groups: Partial<Record<GroupId, number>>
  lean: Lean
  /** Revenue when legal (taxed), share of GDP. */
  revenue: number
}
export const LEGAL: Record<LegalId, LegalDef> = {
  casinos: { id: 'casinos', label: 'Casinos', emoji: '🎰', from: 1900, legalize: 'Legalize casinos and betting', ban: 'Ban casinos and betting', industries: ['casino'], groups: { business: 1, young: .5, retirees: -1.5, rural: -1 }, lean: { liberty: .6, order: -.6 }, revenue: .0006 },
  prohibition: { id: 'prohibition', label: 'Alcohol', emoji: '🍺', from: 1900, legalize: 'Allow alcohol', ban: 'Ban alcohol (prohibition)', industries: ['bar', 'brewery', 'nightclub'], groups: { young: 2, workers: 1.5, business: 1, retirees: -1, rural: -.5 }, lean: { liberty: 1, order: -.8 }, revenue: .002 },
  cannabis: { id: 'cannabis', label: 'Cannabis', emoji: '🌿', from: 2012, legalize: 'Legalize cannabis', ban: 'Recriminalize cannabis', industries: [], groups: { young: 3, workers: .5, retirees: -2, rural: -1.5 }, lean: { liberty: 1, order: -1 }, revenue: .0008 },
  marriage: { id: 'marriage', label: 'Marriage equality', emoji: '💞', from: 2001, legalize: 'Legalize same-sex marriage', ban: 'Repeal marriage equality', industries: [], groups: { young: 3, middle: .5, rural: -2, retirees: -1.5 }, lean: { liberty: 1.2, order: -.4 }, revenue: 0 },
}

/** Tariffs: per point added on imports of an input (or all goods). */
export const TARIFF_IMPACT: Impact = { revenue: .0004, growth: -.00012, inflation: .0003, groups: { workers: .12, rural: .08, middle: -.12, business: -.08, young: -.05 }, lean: { econ: -.5, order: .3 } }
/** Domestic producers in a protected sector win this much demand per point (× imported share). */
export const PROTECTION = .006
/** A trade deal with one partner. */
export const DEAL_IMPACT: Impact = { growth: .001, groups: { business: 1.5, middle: .5, workers: -.4, rural: -.2 }, lean: { econ: .8 } }
/** Sanctions on one partner (scaled by the partner's size). */
export const SANCTION_IMPACT: Impact = { growth: -.002, inflation: .002, groups: { business: -1, retirees: .5, middle: -.3 }, lean: { order: .8 } }
/** Export ban on one input. */
export const EXPORT_BAN_IMPACT: Impact = { growth: -.0015, inflation: -.002, groups: { rural: -1.5, workers: .5, middle: .6, business: -1 }, lean: { econ: -.6, order: .4 } }
export const TARIFF_MAX = 50

export interface GroupDef { id: GroupId; label: string; emoji: string }
export const GROUPS: Record<GroupId, GroupDef> = {
  workers: { id: 'workers', label: 'Workers', emoji: '👷' },
  middle: { id: 'middle', label: 'Middle class', emoji: '🏡' },
  business: { id: 'business', label: 'Business owners', emoji: '💼' },
  retirees: { id: 'retirees', label: 'Retirees', emoji: '👵' },
  young: { id: 'young', label: 'Young voters', emoji: '🎓' },
  rural: { id: 'rural', label: 'Rural voters', emoji: '🌾' },
}

/** Each group's share of the electorate in a country and year (sums to 1). */
export function groupWeights(countryId: string, year: number): Record<GroupId, number> {
  const w = Math.max(.05, Math.min(1.4, getCountry(countryId).wealth || .5))
  const modern = Math.max(0, Math.min(1, (year - 1900) / 120))
  const raw: Record<GroupId, number> = {
    workers: .26 + (1 - Math.min(1, w)) * .06,
    middle: .14 + .14 * Math.min(1, w) * (.4 + .6 * modern),
    business: .07,
    retirees: .08 + .1 * modern * Math.min(1, w),
    young: .14,
    rural: .1 + .22 * (1 - Math.min(1, w)) * (1 - .6 * modern),
  }
  const total = GROUP_IDS.reduce((s, id) => s + raw[id], 0)
  return Object.fromEntries(GROUP_IDS.map(id => [id, raw[id] / total])) as Record<GroupId, number>
}

/** The parties of special/politics.ts with stances for votes (econ -1 left .. +1 right; 0-1 others). */
export const PARTY_STANCE: Record<string, Required<Lean>> = {
  progressive: { econ: -.7, green: .6, liberty: .8, order: .3 },
  conservative: { econ: .7, green: .2, liberty: .4, order: .85 },
  centrist: { econ: 0, green: .4, liberty: .6, order: .5 },
  green: { econ: -.5, green: 1, liberty: .7, order: .3 },
  libertarian: { econ: .9, green: .15, liberty: 1, order: .2 },
  independent: { econ: 0, green: .4, liberty: .5, order: .5 },
}
export const PARTY_IDS = Object.keys(PARTY_STANCE)

/** 0 (captured) - 100 (rock solid): courts, auditors, the press. Weaker before 1945. */
export function institutionStrength(countryId: string, year: number): number {
  const c = marketOf(countryId).corruption
  return Math.max(5, Math.min(97, 100 - c - (year < 1945 ? 12 : 0)))
}

/** The country's sales tax name in that era (VAT arrived in the 1950s-60s). */
export function salesTaxLabel(countryId: string, year: number): string {
  const name = marketOf(countryId).salesTaxName || 'Sales tax'
  if (/VAT|GST|IVA|TVA|MwSt/i.test(name) && year < 1967) return 'Sales tax'
  return /tax/i.test(name) ? name : `${name} (sales tax)`
}

/** Is a measure available in this year at all (menus AND resolvers check this)? */
export const taxAvailable = (id: TaxId, year: number): boolean => year >= TAXES[id].from
export const newTaxAvailable = (id: NewTaxId, year: number): boolean => year >= NEW_TAXES[id].from
export const budgetAvailable = (id: BudgetLine, year: number): boolean => year >= BUDGET[id].from
export const legalAvailable = (id: LegalId, year: number): boolean => year >= LEGAL[id].from
export const environmentAvailable = (year: number): boolean => year >= 1960

/** Industries a windfall tax or a break can target (the big, well-defined ones). */
export const TARGET_INDUSTRIES: readonly Industry[] = ['energy', 'bank', 'investmentFirm', 'software', 'ecommerce', 'manufacturing', 'construction', 'realEstate', 'farm', 'logistics', 'telecom', 'semiconductor', 'aiLab', 'biotech', 'electricVehicles', 'solar', 'casino', 'hotel', 'restaurant']

export function industryAvailable(id: Industry, year: number): boolean {
  const from: Partial<Record<Industry, number>> = { software: 1960, ecommerce: 1995, semiconductor: 1955, aiLab: 2012, biotech: 1976, electricVehicles: 1997, solar: 1975, telecom: 1900, onlineBank: 1995 }
  return year >= (from[id] ?? 1900)
}

export const SECTOR_LABEL: Record<Sector, string> = {
  essentials: 'food and farming', consumer: 'shops and services', leisure: 'leisure', housing: 'housing and construction', finance: 'banking and finance',
  industry: 'heavy industry', energy: 'energy', logistics: 'transport', technology: 'telecoms and technology', care: 'hospitals and care', public: 'public services',
}
export const INPUT_LABEL: Record<TariffInput, string> = { essentials: 'food and farm goods', energy: 'fuel and energy', industry: 'industrial goods', technology: 'electronics and tech', all: 'all imports' }
