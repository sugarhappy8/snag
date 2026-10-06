// Immigration programs with their years. Money is nominal US dollars of the year the rule was
// set (immigration.ts real() converts it to today's money for the year being lived). Programs
// that ended have a `to` year (the last year applications were taken).

// ---------------------------------------------------------------------------
// Investor visas, golden visas and citizenship by investment

/**
 * How the locked money behaves: property and funds move with markets; bonds roughly keep pace
 * with inflation; an interest-free loan or deposit comes back as the same number of dollars
 * (worth less after inflation); a business project can fail; a fee is gone for good.
 */
export type InvestKind = 'property' | 'fund' | 'bonds' | 'loan' | 'deposit' | 'business' | 'fee'

export interface InvestorTier {
  from: number
  /** Amount to invest (or pay, for kind 'fee'), nominal dollars of that year. */
  invest: number
}

export interface InvestorProgram {
  id: string
  dest: string
  name: string
  emoji: string
  from: number
  to?: number
  tiers: InvestorTier[]
  kind: InvestKind
  /** Years the money stays locked. */
  lock: number
  /** Government and lawyer fees on top, nominal. */
  fee: number
  /** Net worth needed, as a multiple of the investment. */
  worth: number
  result: 'visa' | 'permanent' | 'citizen'
  /** Years to permanent residency for 'visa' results (null = never: renew while invested). */
  prYears?: number | null
  /** Processing years. */
  wait?: number
  /** [origin, from year, extra years]: per-country queues (EB-5 for China, India...). */
  backlog?: [string, number, number][]
  note: string
}

export const INVESTOR_PROGRAMS: InvestorProgram[] = [
  {
    id: 'us-eb5', dest: 'us', name: 'EB-5 Investor Green Card', emoji: '\u{1F985}', from: 1990, kind: 'business', lock: 5, fee: 60_000, worth: 1.5, result: 'permanent', wait: 1,
    tiers: [{ from: 1990, invest: 500_000 }, { from: 2019, invest: 900_000 }, { from: 2022, invest: 800_000 }],
    backlog: [['cn', 2015, 6], ['in', 2019, 4], ['vn', 2018, 3]],
    note: 'Invest in a job-creating US project; conditional green card, then permanent.',
  },
  {
    id: 'ca-iip', dest: 'ca', name: 'Federal Immigrant Investor Program', emoji: '\u{1F341}', from: 1986, to: 2014, kind: 'loan', lock: 5, fee: 15_000, worth: 2, result: 'permanent', wait: 2,
    tiers: [{ from: 1986, invest: 180_000 }, { from: 1999, invest: 270_000 }, { from: 2010, invest: 780_000 }],
    backlog: [['cn', 2008, 3]],
    note: 'Lend the government money interest-free for five years; permanent residence on arrival.',
  },
  {
    id: 'gb-tier1', dest: 'gb', name: 'Investor Visa', emoji: '\u{1F451}', from: 1994, to: 2021, kind: 'bonds', lock: 5, fee: 20_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 1994, invest: 1_500_000 }, { from: 2008, invest: 2_000_000 }, { from: 2014, invest: 3_300_000 }],
    note: 'Hold UK bonds and shares; settlement after five years. Closed in 2022.',
  },
  {
    id: 'au-siv', dest: 'au', name: 'Significant Investor Visa', emoji: '\u{1F998}', from: 2012, to: 2023, kind: 'fund', lock: 4, fee: 25_000, worth: 1.2, result: 'visa', prYears: 4,
    tiers: [{ from: 2012, invest: 5_000_000 }, { from: 2015, invest: 3_800_000 }],
    note: 'Park A$5M in Australian funds for four years. Closed in 2024.',
  },
  {
    id: 'nz-investor', dest: 'nz', name: 'Investor Resident Visa', emoji: '\u{1F95D}', from: 1999, kind: 'fund', lock: 4, fee: 15_000, worth: 1.5, result: 'permanent',
    tiers: [{ from: 1999, invest: 700_000 }, { from: 2009, invest: 1_500_000 }, { from: 2022, invest: 9_000_000 }, { from: 2025, invest: 3_000_000 }],
    note: 'Invest in New Zealand for a few years; residence from day one.',
  },
  {
    id: 'pt-golden', dest: 'pt', name: 'Golden Visa', emoji: '\u{1F3E0}', from: 2012, kind: 'property', lock: 5, fee: 20_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2012, invest: 650_000 }, { from: 2023, invest: 550_000 }],
    note: 'Buy property (investment funds after 2023); residence, then citizenship after five years.',
  },
  {
    id: 'es-golden', dest: 'es', name: 'Golden Visa', emoji: '\u{1F3E1}', from: 2013, to: 2024, kind: 'property', lock: 5, fee: 15_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2013, invest: 660_000 }],
    note: 'Buy €500,000 of Spanish property. Ended in April 2025.',
  },
  {
    id: 'gr-golden', dest: 'gr', name: 'Golden Visa', emoji: '\u{1F3DB}\u{FE0F}', from: 2013, kind: 'property', lock: 5, fee: 10_000, worth: 1.3, result: 'visa', prYears: 7,
    tiers: [{ from: 2013, invest: 330_000 }, { from: 2023, invest: 540_000 }, { from: 2024, invest: 860_000 }],
    note: 'Buy Greek property; a renewable five-year residence permit.',
  },
  {
    id: 'ie-iip', dest: 'ie', name: 'Immigrant Investor Programme', emoji: '\u{2618}\u{FE0F}', from: 2012, to: 2022, kind: 'fund', lock: 3, fee: 20_000, worth: 2, result: 'visa', prYears: 5,
    tiers: [{ from: 2012, invest: 1_300_000 }],
    note: 'Invest €1M in Ireland for three years. Closed in 2023.',
  },
  {
    id: 'hu-bond', dest: 'hu', name: 'Residency Bond Program', emoji: '\u{1F4DC}', from: 2013, to: 2017, kind: 'bonds', lock: 5, fee: 50_000, worth: 1.2, result: 'permanent',
    tiers: [{ from: 2013, invest: 400_000 }],
    note: 'Buy special Hungarian government bonds for five years; permanent residence.',
  },
  {
    id: 'hu-guest', dest: 'hu', name: 'Guest Investor Program', emoji: '\u{1F3DB}\u{FE0F}', from: 2024, kind: 'fund', lock: 5, fee: 10_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2024, invest: 270_000 }],
    note: 'Invest in a Hungarian real-estate fund for a ten-year residence permit.',
  },
  {
    id: 'it-investor', dest: 'it', name: 'Investor Visa', emoji: '\u{1F35D}', from: 2017, kind: 'business', lock: 2, fee: 5_000, worth: 2, result: 'visa', prYears: 5,
    tiers: [{ from: 2017, invest: 560_000 }],
    note: 'Invest €500,000 in an Italian company.',
  },
  {
    id: 'nl-dirs', dest: 'nl', name: 'Dutch Investor Residence Scheme', emoji: '\u{1F337}', from: 2013, to: 2023, kind: 'fund', lock: 5, fee: 5_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2013, invest: 1_600_000 }],
    note: 'Invest €1.25M in a Dutch company or fund. Closed in 2024.',
  },
  {
    id: 'ae-golden', dest: 'ae', name: 'Golden Visa', emoji: '\u{1F31F}', from: 2019, kind: 'property', lock: 10, fee: 8_000, worth: 1.2, result: 'visa', prYears: null,
    tiers: [{ from: 2019, invest: 2_700_000 }, { from: 2022, invest: 545_000 }],
    note: 'Own UAE property for a renewable ten-year visa. No path to citizenship.',
  },
  {
    id: 'sg-gip', dest: 'sg', name: 'Global Investor Programme', emoji: '\u{1F981}', from: 2004, kind: 'business', lock: 5, fee: 8_000, worth: 3, result: 'permanent',
    tiers: [{ from: 2004, invest: 600_000 }, { from: 2011, invest: 2_000_000 }, { from: 2023, invest: 7_400_000 }],
    note: 'Invest in a Singapore business; permanent residence.',
  },
  {
    id: 'hk-cies', dest: 'hk', name: 'Capital Investment Entrant Scheme', emoji: '\u{1F3D9}\u{FE0F}', from: 2003, to: 2015, kind: 'fund', lock: 7, fee: 5_000, worth: 1.3, result: 'visa', prYears: 7,
    tiers: [{ from: 2003, invest: 830_000 }, { from: 2010, invest: 1_300_000 }],
    note: 'Invest in Hong Kong assets until you qualify for permanent residency.',
  },
  {
    id: 'hk-ncies', dest: 'hk', name: 'New Capital Investment Entrant Scheme', emoji: '\u{1F3D9}\u{FE0F}', from: 2024, kind: 'fund', lock: 7, fee: 5_000, worth: 1.2, result: 'visa', prYears: 7,
    tiers: [{ from: 2024, invest: 3_800_000 }],
    note: 'Invest HK$30M in Hong Kong assets.',
  },
  {
    id: 'tr-cbi', dest: 'tr', name: 'Citizenship by Investment', emoji: '\u{1F319}', from: 2017, kind: 'property', lock: 3, fee: 15_000, worth: 1.2, result: 'citizen', wait: 0,
    tiers: [{ from: 2017, invest: 1_000_000 }, { from: 2018, invest: 250_000 }, { from: 2022, invest: 400_000 }],
    note: 'Buy Turkish property, hold it three years, get a passport straight away.',
  },
  {
    id: 'eg-cbi', dest: 'eg', name: 'Citizenship by Investment', emoji: '\u{1F3DC}\u{FE0F}', from: 2019, kind: 'deposit', lock: 3, fee: 10_000, worth: 1.3, result: 'citizen',
    tiers: [{ from: 2019, invest: 250_000 }],
    note: 'Deposit $250,000 for three years (returned without interest) for citizenship.',
  },
  {
    id: 'jo-cbi', dest: 'jo', name: 'Citizenship by Investment', emoji: '\u{1F3DB}\u{FE0F}', from: 2018, kind: 'deposit', lock: 3, fee: 15_000, worth: 1.3, result: 'citizen',
    tiers: [{ from: 2018, invest: 1_500_000 }, { from: 2020, invest: 1_000_000 }, { from: 2023, invest: 750_000 }],
    note: 'An interest-free deposit with the central bank buys a Jordanian passport.',
  },
  {
    id: 'pa-qi', dest: 'pa', name: 'Qualified Investor Visa', emoji: '\u{1F6A2}', from: 2020, kind: 'property', lock: 5, fee: 8_000, worth: 1.3, result: 'permanent',
    tiers: [{ from: 2020, invest: 300_000 }, { from: 2024, invest: 500_000 }],
    note: 'Buy Panamanian property for fast-track permanent residency.',
  },
  {
    id: 'cr-investor', dest: 'cr', name: 'Investor Residency', emoji: '\u{1F334}', from: 1996, kind: 'property', lock: 3, fee: 3_000, worth: 1.3, result: 'visa', prYears: 3,
    tiers: [{ from: 1996, invest: 200_000 }, { from: 2019, invest: 150_000 }],
    note: 'Invest in Costa Rican property or business.',
  },
  {
    id: 'do-investor', dest: 'do', name: 'Investor Residency', emoji: '\u{1F3D6}\u{FE0F}', from: 2007, kind: 'business', lock: 3, fee: 4_000, worth: 1.3, result: 'permanent',
    tiers: [{ from: 2007, invest: 200_000 }],
    note: 'Invest $200,000 for direct permanent residency.',
  },
  {
    id: 'bs-epr', dest: 'bs', name: 'Economic Permanent Residency', emoji: '\u{1F41A}', from: 1993, kind: 'property', lock: 5, fee: 10_000, worth: 1.3, result: 'permanent',
    tiers: [{ from: 1993, invest: 500_000 }, { from: 2021, invest: 750_000 }, { from: 2023, invest: 1_000_000 }],
    note: 'Buy a Bahamian home for permanent residency.',
  },
  {
    id: 'br-investor', dest: 'br', name: 'Investor Visa', emoji: '\u{1F49A}', from: 2018, kind: 'property', lock: 3, fee: 2_000, worth: 1.3, result: 'permanent',
    tiers: [{ from: 2018, invest: 180_000 }],
    note: 'Buy property in Brazil for permanent residency.',
  },
  {
    id: 'py-deposit', dest: 'py', name: 'Easy Residency (bank deposit)', emoji: '\u{1F9C9}', from: 2000, kind: 'deposit', lock: 2, fee: 1_500, worth: 1.5, result: 'visa', prYears: 2,
    tiers: [{ from: 2000, invest: 5_000 }],
    note: 'Deposit a few thousand dollars in a Paraguayan bank and you are in.',
  },
  {
    id: 'ge-investor', dest: 'ge', name: 'Investment Residence Permit', emoji: '\u{1F347}', from: 2015, kind: 'property', lock: 5, fee: 1_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2015, invest: 300_000 }, { from: 2019, invest: 100_000 }],
    note: 'Invest in Georgian property or business.',
  },
  {
    id: 'kz-golden', dest: 'kz', name: 'Golden Visa', emoji: '\u{1F985}', from: 2023, kind: 'fund', lock: 5, fee: 2_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2023, invest: 300_000 }],
    note: 'Invest $300,000 for a ten-year residence permit.',
  },
  {
    id: 'id-golden', dest: 'id', name: 'Golden Visa', emoji: '\u{1F334}', from: 2023, kind: 'fund', lock: 5, fee: 2_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2023, invest: 350_000 }],
    note: 'Invest in Indonesian bonds or shares for a long-stay visa.',
  },
  {
    id: 'kr-investor', dest: 'kr', name: 'Immigrant Investor Visa', emoji: '\u{1F3EF}', from: 2010, kind: 'property', lock: 5, fee: 2_000, worth: 1.3, result: 'visa', prYears: 5,
    tiers: [{ from: 2010, invest: 430_000 }],
    note: 'Buy designated property (Jeju and resort areas) for residence, permanent after five years.',
  },
  {
    id: 'jp-business', dest: 'jp', name: 'Business Manager Visa', emoji: '\u{1F3EF}', from: 1990, kind: 'business', lock: 3, fee: 3_000, worth: 2, result: 'visa', prYears: 10,
    tiers: [{ from: 1990, invest: 45_000 }, { from: 2025, invest: 200_000 }],
    note: 'Capitalize your own Japanese company and run it.',
  },
  {
    id: 'ph-sirv', dest: 'ph', name: 'Special Investor\'s Resident Visa', emoji: '\u{1F3DD}\u{FE0F}', from: 1987, kind: 'fund', lock: 3, fee: 2_000, worth: 1.5, result: 'permanent',
    tiers: [{ from: 1987, invest: 75_000 }],
    note: 'Invest $75,000 in the Philippines for indefinite residence.',
  },
  {
    id: 'th-ltr', dest: 'th', name: 'Long-Term Resident (wealthy investor)', emoji: '\u{1F418}', from: 2022, kind: 'bonds', lock: 5, fee: 1_500, worth: 2, result: 'visa', prYears: null,
    tiers: [{ from: 2022, invest: 500_000 }],
    note: 'Invest $500,000 in Thailand for a ten-year visa.',
  },
  {
    id: 'qa-property', dest: 'qa', name: 'Property Residency', emoji: '\u{1F3D9}\u{FE0F}', from: 2020, kind: 'property', lock: 5, fee: 2_000, worth: 1.2, result: 'permanent',
    tiers: [{ from: 2020, invest: 1_000_000 }],
    note: 'Buy $1M of Qatari property for permanent residency (citizenship stays closed).',
  },
  {
    id: 'sa-premium', dest: 'sa', name: 'Premium Residency', emoji: '\u{1F334}', from: 2019, kind: 'fee', lock: 0, fee: 0, worth: 2, result: 'permanent',
    tiers: [{ from: 2019, invest: 213_000 }],
    note: 'A one-time fee buys permanent "premium" residency. No citizenship.',
  },
  {
    id: 'mc-deposit', dest: 'mc', name: 'Residence by Deposit', emoji: '\u{1F3B0}', from: 1990, kind: 'deposit', lock: 10, fee: 5_000, worth: 3, result: 'visa', prYears: 10,
    tiers: [{ from: 1990, invest: 550_000 }],
    note: 'Keep a hefty deposit in a Monégasque bank and rent a flat.',
  },
  {
    id: 'ad-passive', dest: 'ad', name: 'Passive Residence', emoji: '\u{26F0}\u{FE0F}', from: 2012, kind: 'fund', lock: 10, fee: 60_000, worth: 2, result: 'visa', prYears: 10,
    tiers: [{ from: 2012, invest: 450_000 }, { from: 2022, invest: 650_000 }],
    note: 'Invest in Andorra and live there without working.',
  },
]

// ---------------------------------------------------------------------------
// Retirement visas (live on your pension or savings)

export interface RetireProgram {
  id: string
  dest: string
  name: string
  from: number
  to?: number
  minAge: number
  /** Yearly pension or passive income needed, nominal. */
  income: number
  /** A bank deposit kept locked while you hold the visa, nominal (optional). */
  deposit?: number
  result: 'visa' | 'permanent'
  prYears?: number | null
  note: string
}

export const RETIRE_PROGRAMS: RetireProgram[] = [
  { id: 'pa-pensionado', dest: 'pa', name: 'Pensionado Visa', from: 1987, minAge: 18, income: 12_000, result: 'permanent', note: 'A lifetime pension of $1,000 a month gets you in, with discounts on nearly everything.' },
  { id: 'cr-pensionado', dest: 'cr', name: 'Pensionado Residency', from: 1971, minAge: 18, income: 12_000, result: 'visa', prYears: 3, note: 'Retirees with a steady pension are welcome.' },
  { id: 'mx-solvency', dest: 'mx', name: 'Temporary Residency (financial solvency)', from: 2012, minAge: 18, income: 32_000, result: 'visa', prYears: 4, note: 'Show steady income or savings and stay as long as you like.' },
  { id: 'ec-pension', dest: 'ec', name: 'Pensioner Visa', from: 2000, minAge: 18, income: 10_000, result: 'visa', prYears: 2, note: 'Ecuador welcomes pensioners on modest incomes.' },
  { id: 'bz-qrp', dest: 'bz', name: 'Qualified Retired Persons Program', from: 1999, minAge: 45, income: 24_000, result: 'visa', prYears: null, note: 'Retire to Belize tax-free (no local job allowed).' },
  { id: 'ph-srrv', dest: 'ph', name: 'Special Resident Retiree\'s Visa', from: 1985, minAge: 50, income: 9_600, deposit: 20_000, result: 'permanent', note: 'A bank deposit plus a pension buys indefinite residence.' },
  { id: 'th-retire', dest: 'th', name: 'Retirement Visa', from: 1998, minAge: 50, income: 24_000, result: 'visa', prYears: null, note: 'A yearly visa for retirees with money in the bank.' },
  { id: 'my-mm2h', dest: 'my', name: 'Malaysia My Second Home', from: 2002, minAge: 50, income: 40_000, deposit: 90_000, result: 'visa', prYears: null, note: 'A ten-year renewable visa for well-off retirees.' },
  { id: 'pt-d7', dest: 'pt', name: 'D7 Passive Income Visa', from: 2007, minAge: 18, income: 10_000, result: 'visa', prYears: 5, note: 'Live in Portugal on a pension or passive income.' },
  { id: 'es-nlv', dest: 'es', name: 'Non-Lucrative Visa', from: 1996, minAge: 18, income: 30_000, result: 'visa', prYears: 5, note: 'Live in Spain without working, on savings or a pension.' },
  { id: 'fr-visitor', dest: 'fr', name: 'Long-Stay Visitor Visa', from: 1990, minAge: 18, income: 18_000, result: 'visa', prYears: 5, note: 'Retire to France if you promise not to work.' },
  { id: 'it-elective', dest: 'it', name: 'Elective Residence Visa', from: 1998, minAge: 18, income: 34_000, result: 'visa', prYears: 5, note: 'For people with passive income who just want to live in Italy.' },
  { id: 'au-405', dest: 'au', name: 'Investor Retirement Visa', from: 1998, to: 2017, minAge: 55, income: 50_000, deposit: 550_000, result: 'visa', prYears: null, note: 'Retirees parked money in state bonds for four-year visas. Closed in 2018.' },
  { id: 'id-retire', dest: 'id', name: 'Retirement KITAS', from: 1998, minAge: 55, income: 18_000, result: 'visa', prYears: 5, note: 'Retire to Bali (or anywhere else in Indonesia) on a pension.' },
  { id: 'uy-rentista', dest: 'uy', name: 'Rentista Residency', from: 2008, minAge: 18, income: 18_000, result: 'permanent', note: 'Steady passive income buys permanent residency.' },
  { id: 'br-retiree', dest: 'br', name: 'Retiree Visa', from: 2008, minAge: 18, income: 24_000, result: 'permanent', note: 'A $2,000-a-month pension gets you permanent residency.' },
  { id: 'co-pension', dest: 'co', name: 'Pension Visa', from: 2013, minAge: 18, income: 11_000, result: 'visa', prYears: 5, note: 'Colombia welcomes retirees with a pension.' },
  { id: 'do-pension', dest: 'do', name: 'Pensioner Residency', from: 2007, minAge: 18, income: 18_000, result: 'permanent', note: 'A pension of $1,500 a month buys residency.' },
]

// ---------------------------------------------------------------------------
// Remote-worker ("digital nomad") visas: keep your remote job, live somewhere sunnier.

export interface RemoteProgram {
  id: string
  dest: string
  name: string
  from: number
  /** Yearly remote income needed, nominal. */
  income: number
  /** Years per permit. */
  term: number
  /** Most years you can stay on it (null = renew forever). */
  maxYears: number | null
  prYears?: number | null
}

export const REMOTE_PROGRAMS: RemoteProgram[] = [
  { id: 'ee-dnv', dest: 'ee', name: 'Digital Nomad Visa', from: 2020, income: 45_000, term: 1, maxYears: 1 },
  { id: 'hr-dnv', dest: 'hr', name: 'Digital Nomad Residence', from: 2021, income: 33_000, term: 1, maxYears: 1 },
  { id: 'pt-d8', dest: 'pt', name: 'D8 Digital Nomad Visa', from: 2022, income: 42_000, term: 2, maxYears: null, prYears: 5 },
  { id: 'es-dnv', dest: 'es', name: 'Digital Nomad Visa', from: 2023, income: 35_000, term: 3, maxYears: null, prYears: 5 },
  { id: 'gr-dnv', dest: 'gr', name: 'Digital Nomad Visa', from: 2021, income: 45_000, term: 2, maxYears: null, prYears: 7 },
  { id: 'it-dnv', dest: 'it', name: 'Digital Nomad Visa', from: 2024, income: 30_000, term: 1, maxYears: null, prYears: 5 },
  { id: 'hu-white', dest: 'hu', name: 'White Card', from: 2021, income: 39_000, term: 1, maxYears: 2 },
  { id: 'ro-dnv', dest: 'ro', name: 'Digital Nomad Visa', from: 2022, income: 48_000, term: 1, maxYears: 2 },
  { id: 'ae-remote', dest: 'ae', name: 'Remote Work Visa', from: 2020, income: 42_000, term: 1, maxYears: null, prYears: null },
  { id: 'cr-nomad', dest: 'cr', name: 'Digital Nomad Visa', from: 2021, income: 36_000, term: 1, maxYears: 2 },
  { id: 'br-nomad', dest: 'br', name: 'Digital Nomad Visa', from: 2022, income: 18_000, term: 1, maxYears: 2 },
  { id: 'co-nomad', dest: 'co', name: 'Digital Nomad Visa', from: 2022, income: 11_000, term: 2, maxYears: 2 },
  { id: 'ar-nomad', dest: 'ar', name: 'Digital Nomad Visa', from: 2022, income: 18_000, term: 1, maxYears: 2 },
  { id: 'uy-nomad', dest: 'uy', name: 'Digital Nomad Permit', from: 2022, income: 18_000, term: 1, maxYears: 2 },
  { id: 'ec-nomad', dest: 'ec', name: 'Digital Nomad Visa', from: 2022, income: 16_000, term: 2, maxYears: 2 },
  { id: 'pa-remote', dest: 'pa', name: 'Short Stay Remote Worker Visa', from: 2021, income: 36_000, term: 1, maxYears: 2 },
  { id: 'bs-beats', dest: 'bs', name: 'BEATS Remote Work Permit', from: 2020, income: 40_000, term: 1, maxYears: 3 },
  { id: 'aw-workcation', dest: 'aw', name: 'One Happy Workcation', from: 2020, income: 30_000, term: 1, maxYears: 1 },
  { id: 'ge-remote', dest: 'ge', name: 'Remotely from Georgia', from: 2020, income: 24_000, term: 1, maxYears: null, prYears: 6 },
  { id: 'th-dtv', dest: 'th', name: 'Destination Thailand Visa', from: 2024, income: 15_000, term: 5, maxYears: 5 },
  { id: 'id-e33g', dest: 'id', name: 'Remote Worker Visa (E33G)', from: 2024, income: 60_000, term: 1, maxYears: 5 },
  { id: 'my-rantau', dest: 'my', name: 'DE Rantau Nomad Pass', from: 2022, income: 24_000, term: 1, maxYears: 2 },
  { id: 'jp-nomad', dest: 'jp', name: 'Digital Nomad Visa', from: 2024, income: 68_000, term: 1, maxYears: 1 },
  { id: 'kr-workcation', dest: 'kr', name: 'Workation Visa', from: 2024, income: 65_000, term: 1, maxYears: 2 },
  { id: 'za-remote', dest: 'za', name: 'Remote Work Visa', from: 2024, income: 55_000, term: 3, maxYears: 3 },
]

// ---------------------------------------------------------------------------
// Guest-worker programs (no CV needed, a job is arranged; few lead anywhere permanent).

export interface GuestProgram {
  id: string
  dest: string
  name: string
  from: number
  to?: number
  /** Origins recruited from, as [country, first year]; 'poorer' = any country much poorer than the host. */
  origins: [string, number][] | 'poorer'
  /** Job (data/jobs id) the program fills. */
  job: string
  /** Most years you can stay (null = renew while employed). */
  maxYears: number | null
  /** Years to permanent residency (null = never). */
  prYears: number | null
  /** Recruitment fees, nominal. */
  fee: number
  note: string
}

export const GUEST_PROGRAMS: GuestProgram[] = [
  {
    id: 'de-gastarbeiter', dest: 'de', name: 'Gastarbeiter recruitment', from: 1955, to: 1973, job: 'factory_worker', maxYears: null, prYears: 8, fee: 50,
    origins: [['it', 1955], ['es', 1960], ['gr', 1960], ['tr', 1961], ['ma', 1963], ['pt', 1964], ['tn', 1965], ['rs', 1968], ['hr', 1968]],
    note: 'West Germany recruited workers for its factories until the 1973 recruitment stop.',
  },
  { id: 'at-gastarbeiter', dest: 'at', name: 'Guest worker recruitment', from: 1962, to: 1973, job: 'factory_worker', maxYears: null, prYears: 10, fee: 50, origins: [['es', 1962], ['tr', 1964], ['rs', 1966], ['hr', 1966]], note: 'Austria signed recruitment deals across southern Europe.' },
  { id: 'nl-guest', dest: 'nl', name: 'Guest worker recruitment', from: 1960, to: 1973, job: 'factory_worker', maxYears: null, prYears: 5, fee: 50, origins: [['it', 1960], ['es', 1961], ['pt', 1963], ['tr', 1964], ['gr', 1966], ['ma', 1969], ['rs', 1970], ['hr', 1970], ['tn', 1971]], note: 'Dutch factories recruited abroad through the 1960s.' },
  { id: 'be-mines', dest: 'be', name: 'Coal mine recruitment', from: 1946, to: 1974, job: 'construction', maxYears: null, prYears: 5, fee: 30, origins: [['it', 1946], ['es', 1956], ['gr', 1957], ['ma', 1964], ['tr', 1964]], note: 'Belgium traded coal for Italian miners after the war.' },
  { id: 'ch-saisonnier', dest: 'ch', name: 'Seasonal worker statute', from: 1948, to: 2001, job: 'construction', maxYears: null, prYears: 10, fee: 50, origins: [['it', 1948], ['es', 1961], ['pt', 1970], ['rs', 1965], ['hr', 1965], ['tr', 1970]], note: 'Swiss "seasonal" permits that, for many, lasted a working life.' },
  { id: 'fr-onl', dest: 'fr', name: 'National Immigration Office recruitment', from: 1946, to: 1974, job: 'construction', maxYears: null, prYears: 5, fee: 30, origins: [['it', 1946], ['es', 1956], ['pt', 1963], ['ma', 1963], ['tn', 1963]], note: 'France recruited builders for its postwar boom.' },
  { id: 'se-labour', dest: 'se', name: 'Labor recruitment', from: 1947, to: 1972, job: 'factory_worker', maxYears: null, prYears: 5, fee: 30, origins: [['it', 1947], ['at', 1951], ['gr', 1960], ['rs', 1966], ['hr', 1966], ['tr', 1967]], note: 'Swedish factories recruited workers from across Europe.' },
  { id: 'us-bracero', dest: 'us', name: 'Bracero Program', from: 1942, to: 1964, job: 'farmer', maxYears: 3, prYears: null, fee: 20, origins: [['mx', 1942]], note: 'Mexican farmworkers on short contracts in American fields.' },
  { id: 'us-h2', dest: 'us', name: 'H-2A/H-2B seasonal worker visa', from: 1986, job: 'farmer', maxYears: 3, prYears: null, fee: 600, origins: 'poorer', note: 'Seasonal farm and hotel work, then back home.' },
  { id: 'ca-sawp', dest: 'ca', name: 'Seasonal Agricultural Worker Program', from: 1966, job: 'farmer', maxYears: 8, prYears: null, fee: 300, origins: [['jm', 1966], ['mx', 1974], ['bs', 1967]], note: 'Eight months a year on Canadian farms.' },
  {
    id: 'ae-kafala', dest: 'ae', name: 'Sponsored work visa (kafala)', from: 1973, job: 'construction', maxYears: null, prYears: null, fee: 1_500, origins: 'poorer',
    note: 'An employer sponsors you, holds the power over your visa, and citizenship is never on the table.',
  },
  { id: 'sa-kafala', dest: 'sa', name: 'Sponsored work visa (kafala)', from: 1973, job: 'construction', maxYears: null, prYears: null, fee: 1_500, origins: 'poorer', note: 'An employer sponsors you, and the visa ends when the job does.' },
  { id: 'qa-kafala', dest: 'qa', name: 'Sponsored work visa (kafala)', from: 1973, job: 'construction', maxYears: null, prYears: null, fee: 1_500, origins: 'poorer', note: 'Construction work for the building boom; your sponsor controls your visa.' },
  { id: 'kw-kafala', dest: 'kw', name: 'Sponsored work visa (kafala)', from: 1973, job: 'housekeeper', maxYears: null, prYears: null, fee: 1_500, origins: 'poorer', note: 'Domestic and service work under an employer\'s sponsorship.' },
  { id: 'sg-workpermit', dest: 'sg', name: 'Work Permit', from: 1978, job: 'construction', maxYears: 14, prYears: null, fee: 800, origins: [['my', 1978], ['cn', 1990], ['in', 1980], ['bd', 1980], ['th', 1980], ['ph', 1980], ['id', 1980]], note: 'Low-wage work permits with no path to permanent residency.' },
  { id: 'my-foreign', dest: 'my', name: 'Foreign Worker Permit', from: 1985, job: 'factory_worker', maxYears: 10, prYears: null, fee: 800, origins: [['id', 1985], ['bd', 1990], ['np', 1995], ['ph', 1990], ['in', 1995], ['vn', 2000]], note: 'Factory and plantation work on renewable permits.' },
  { id: 'jp-titp', dest: 'jp', name: 'Technical Intern Training Program', from: 1993, to: 2018, job: 'factory_worker', maxYears: 5, prYears: null, fee: 3_000, origins: [['cn', 1993], ['vn', 1993], ['id', 1993], ['ph', 1993], ['th', 1993], ['mn', 1993], ['np', 2000]], note: '"Training" that is mostly factory work, then home.' },
  { id: 'jp-ssw', dest: 'jp', name: 'Specified Skilled Worker visa', from: 2019, job: 'factory_worker', maxYears: null, prYears: 10, fee: 2_000, origins: [['vn', 2019], ['ph', 2019], ['id', 2019], ['cn', 2019], ['th', 2019], ['mn', 2019], ['np', 2019], ['in', 2023], ['bd', 2023]], note: 'Japan\'s first real door for blue-collar workers.' },
  { id: 'kr-eps', dest: 'kr', name: 'Employment Permit System', from: 2004, job: 'factory_worker', maxYears: 5, prYears: null, fee: 1_000, origins: [['ph', 2004], ['th', 2004], ['vn', 2004], ['id', 2004], ['mn', 2004], ['cn', 2004], ['bd', 2007], ['np', 2007], ['pk', 2007], ['kz', 2007]], note: 'Four years and ten months in a Korean factory.' },
  { id: 'il-foreign', dest: 'il', name: 'Foreign worker permit', from: 1993, job: 'farmer', maxYears: 5, prYears: null, fee: 3_000, origins: [['th', 1993], ['ph', 1993], ['cn', 1995], ['ro', 1995]], note: 'Farm and care work on five-year permits.' },
  { id: 'ru-patent', dest: 'ru', name: 'Labor patent', from: 1992, job: 'construction', maxYears: null, prYears: 5, fee: 300, origins: [['ua', 1992], ['ge', 1992], ['kz', 1992]], note: 'Pay monthly for a "patent" to work on Russian building sites.' },
  { id: 'au-palm', dest: 'au', name: 'Pacific Australia Labour Mobility', from: 2012, job: 'farmer', maxYears: 4, prYears: null, fee: 500, origins: [['pg', 2012], ['ws', 2012]], note: 'Seasonal and multi-year farm work for Pacific islanders.' },
  { id: 'nz-rse', dest: 'nz', name: 'Recognised Seasonal Employer scheme', from: 2007, job: 'farmer', maxYears: 7, prYears: null, fee: 300, origins: [['ws', 2007], ['pg', 2010]], note: 'Picking kiwifruit and apples for part of the year.' },
  { id: 'it-flussi', dest: 'it', name: 'Decreto Flussi work quota', from: 1998, job: 'farmer', maxYears: null, prYears: 5, fee: 500, origins: 'poorer', note: 'Italy\'s yearly quota of non-EU workers.' },
  { id: 'es-seasonal', dest: 'es', name: 'Seasonal harvest contract', from: 2000, job: 'farmer', maxYears: 4, prYears: null, fee: 200, origins: [['ma', 2000], ['co', 2008], ['ec', 2008]], note: 'Strawberry season in Huelva, then home.' },
]

// ---------------------------------------------------------------------------
// Open-door settlement and assisted passages (the early 1900s, the postwar boom).

export interface SettlerProgram {
  id: string
  dest: string
  name: string
  from: number
  to: number
  /** Only these origins (absent: anyone not barred by an exclusion law). */
  origins?: string[]
  /** Steamship or plane ticket, nominal dollars. */
  cost: number
  note: string
}

export const SETTLER_PROGRAMS: SettlerProgram[] = [
  { id: 'us-ellis', dest: 'us', name: 'Steamship to Ellis Island', from: 1900, to: 1923, cost: 40, note: 'Pass the health inspection and you are in.' },
  { id: 'ca-west', dest: 'ca', name: 'Settle the Canadian West', from: 1900, to: 1929, cost: 40, note: 'Canada advertised free farmland to settlers.' },
  { id: 'ar-open', dest: 'ar', name: 'Steamship to Buenos Aires', from: 1900, to: 1930, cost: 35, note: 'Argentina\'s constitution invited anyone who wanted to work its land.' },
  { id: 'br-open', dest: 'br', name: 'Steamship to Santos', from: 1900, to: 1933, cost: 35, note: 'Brazil recruited settlers for its coffee farms.' },
  { id: 'uy-open', dest: 'uy', name: 'Steamship to Montevideo', from: 1900, to: 1930, cost: 35, note: 'Uruguay welcomed European settlers.' },
  { id: 'cl-open', dest: 'cl', name: 'Steamship to Valparaíso', from: 1900, to: 1930, cost: 40, note: 'Chile offered land in the south to settlers.' },
  { id: 'br-japan', dest: 'br', name: 'Emigration ship from Kobe', from: 1908, to: 1941, origins: ['jp'], cost: 50, note: 'Japanese families sailed to Brazil to work the coffee plantations.' },
  { id: 'au-subject', dest: 'au', name: 'Passage to Australia', from: 1900, to: 1972, origins: ['gb', 'ie', 'nz', 'ca'], cost: 60, note: 'British subjects could settle in Australia.' },
  { id: 'au-tenpound', dest: 'au', name: 'Assisted passage (the "Ten Pound Poms")', from: 1945, to: 1982, origins: ['gb', 'ie'], cost: 30, note: 'Ten pounds bought a Briton a new life in Australia.' },
  { id: 'au-postwar', dest: 'au', name: 'Postwar migration scheme', from: 1947, to: 1972, origins: ['it', 'gr', 'nl', 'de', 'at', 'pl', 'hu', 'cz', 'rs', 'hr', 'ua', 'ee', 'es', 'pt', 'mc', 'ch', 'be', 'fr', 'dk', 'no', 'se', 'fi'], cost: 100, note: '"Populate or perish": Australia recruited across Europe.' },
  { id: 'nz-british', dest: 'nz', name: 'Passage to New Zealand', from: 1900, to: 1973, origins: ['gb', 'ie', 'au', 'ca'], cost: 60, note: 'British subjects could settle without a permit.' },
  { id: 'nz-assisted', dest: 'nz', name: 'Assisted passage scheme', from: 1947, to: 1975, origins: ['gb', 'ie', 'nl'], cost: 25, note: 'New Zealand paid most of the fare for young workers.' },
  { id: 've-european', dest: 've', name: 'European immigration drive', from: 1948, to: 1958, origins: ['es', 'it', 'pt', 'de', 'fr', 'gr', 'hr', 'rs', 'hu', 'pl'], cost: 150, note: 'Oil-rich Venezuela recruited European workers.' },
  { id: 'ca-postwar', dest: 'ca', name: 'Postwar immigration', from: 1947, to: 1966, origins: ['gb', 'ie', 'fr', 'nl', 'de', 'it', 'be', 'ch', 'dk', 'no', 'se', 'fi', 'at', 'pt', 'gr', 'pl', 'hu', 'cz', 'ua', 'us'], cost: 150, note: 'Canada opened up to fill its booming factories.' },
]

// ---------------------------------------------------------------------------
// Visa lotteries

export interface LotteryProgram {
  id: string
  dest: string
  name: string
  from: number
  to?: number
  /** Only these origins (absent: anyone not excluded). */
  origins?: string[]
  /** [origin, from, to]: countries that sent too many immigrants recently and were left out. */
  excluded?: [string, number, number][]
  /** Odds of being picked. */
  odds: number
  minAge?: number
  maxAge?: number
  /** Needs a high-school diploma (or two years of work). */
  diploma?: boolean
  note: string
}

export const LOTTERIES: LotteryProgram[] = [
  {
    id: 'us-dv', dest: 'us', name: 'Diversity Visa Lottery', from: 1995, odds: 0.012, diploma: true,
    excluded: [['mx', 1995, 2100], ['cn', 1995, 2100], ['in', 1995, 2100], ['ph', 1995, 2100], ['kr', 1995, 2100], ['gb', 1995, 2100], ['ca', 1995, 2100], ['pk', 1999, 2100], ['vn', 1995, 2100], ['bd', 2013, 2100], ['sv', 1995, 2100], ['do', 1995, 2100], ['jm', 1995, 2100], ['co', 1995, 2100], ['ht', 1995, 2100], ['br', 2013, 2100], ['ng', 2015, 2100], ['ve', 2024, 2100], ['pr', 1995, 2100], ['us', 1995, 2100]],
    note: 'Fifty-five thousand green cards a year, handed out at random.',
  },
  { id: 'nz-samoa', dest: 'nz', name: 'Samoan Quota ballot', from: 2002, origins: ['ws'], odds: 0.06, minAge: 18, maxAge: 45, note: '1,100 Samoans a year win residence in New Zealand.' },
  { id: 'au-pev', dest: 'au', name: 'Pacific Engagement Visa ballot', from: 2024, origins: ['pg', 'ws'], odds: 0.05, minAge: 18, maxAge: 45, note: 'Australia\'s permanent-residence ballot for Pacific islanders.' },
]

// ---------------------------------------------------------------------------
// Working holiday visas (young people from rich countries, a year or two of work and travel).

export interface WorkingHoliday {
  dest: string
  from: number
  maxAge: number
  years: number
}

export const WORKING_HOLIDAYS: WorkingHoliday[] = [
  { dest: 'au', from: 1975, maxAge: 30, years: 2 },
  { dest: 'nz', from: 1985, maxAge: 30, years: 1 },
  { dest: 'ca', from: 1980, maxAge: 35, years: 2 },
  { dest: 'gb', from: 2008, maxAge: 30, years: 2 },
  { dest: 'ie', from: 2000, maxAge: 30, years: 1 },
  { dest: 'jp', from: 1980, maxAge: 30, years: 1 },
  { dest: 'kr', from: 1995, maxAge: 30, years: 1 },
  { dest: 'de', from: 2000, maxAge: 30, years: 1 },
  { dest: 'fr', from: 1999, maxAge: 30, years: 1 },
  { dest: 'nl', from: 2005, maxAge: 30, years: 1 },
  { dest: 'tw', from: 2004, maxAge: 30, years: 1 },
  { dest: 'ar', from: 2001, maxAge: 30, years: 1 },
  { dest: 'cl', from: 2007, maxAge: 30, years: 1 },
]
