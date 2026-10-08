// Real index trackers, ETFs and old investment trusts: what the local "index fund" slot of an
// exchange was called in each era. The engine's fee model is unchanged (fundFee); only the name
// follows history, and a provider appears only from the year its product really launched. Where
// no real product is recorded the fund keeps its generic name ('FTSE 100 Index Fund').
export interface FundName {
  /** First year this name applies. */
  from: number
  name: string
}

/** Old managed investment trusts (before index funds), by country. */
const TRUSTS: Readonly<Record<string, readonly FundName[]>> = {
  us: [{ from: 1924, name: 'Massachusetts Investors Trust' }],
  gb: [{ from: 1868, name: 'Foreign & Colonial Investment Trust' }],
}

/** Index funds and ETFs, by country (country id -> names by launch year). */
const FUNDS: Readonly<Record<string, readonly FundName[]>> = {
  us: [{ from: 1976, name: 'Vanguard 500 Index Fund' }],
  gb: [{ from: 2000, name: 'iShares FTSE 100 ETF' }],
  de: [{ from: 2000, name: 'iShares DAX ETF' }],
  fr: [{ from: 2001, name: 'Lyxor CAC 40 ETF' }, { from: 2022, name: 'Amundi CAC 40 ETF' }],
  hk: [{ from: 1999, name: 'Tracker Fund of Hong Kong' }],
  au: [{ from: 2001, name: 'SPDR S&P/ASX 200 Fund' }],
  ca: [{ from: 2001, name: 'iShares S&P/TSX Capped Composite ETF' }],
  kr: [{ from: 2002, name: 'KODEX 200' }],
  sg: [{ from: 2002, name: 'SPDR Straits Times Index ETF' }],
  mx: [{ from: 2002, name: 'NAFTRAC' }],
  br: [{ from: 2008, name: 'iShares Ibovespa ETF' }],
}

function pick(list: readonly FundName[] | undefined, year: number): string | null {
  if (!list) return null
  let name: string | null = null
  for (const e of list) if (e.from <= year) name = e.name
  return name
}

/**
 * The real fund provider's product on this market in `year`, or null (use the generic name).
 * `trust` selects the pre-index-fund era's investment trust.
 */
export function fundProviderName(home: string, year: number, trust: boolean): string | null {
  return pick(trust ? TRUSTS[home] : FUNDS[home], year)
}

/** Every real fund name the table can produce (tests and data tools). */
export function allFundProviderNames(): string[] {
  const out: string[] = []
  for (const t of [TRUSTS, FUNDS]) for (const list of Object.values(t)) for (const e of list) out.push(e.name)
  return out
}
