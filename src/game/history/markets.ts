// Economic history: how markets, inflation, interest rates and business cycles really moved in
// each year and region (1929, the 1970s oil shocks, 1987, Japan's 1990 bust, 1997 Asia, the
// dot-com crash, 2008, the euro crisis, 2020...). invest/engine.ts, investments.ts and
// business/economy.ts cycleOf read it so a life lived through history feels it.
// CONTRACT STUB: the historical-markets builder owns this file and fills it in.

export interface MarketYear {
  /** Real (inflation-adjusted) total return of the country's stock index that year, e.g. -0.38. */
  index?: number
  crash?: boolean
  boom?: boolean
  /** Real returns of specific sectors (invest/engine.ts SectorId keys), e.g. { tech: -0.6 }. */
  sectors?: Partial<Record<string, number>>
  /** Real return of crypto that year (null before crypto existed). */
  crypto?: number | null
  gold?: number
  housing?: number
  /** Local consumer inflation that year. */
  inflation?: number
  /** Central bank policy rate that year. */
  rate?: number
  /** Short note for news and the AI, e.g. 'The dot-com bubble bursts.' */
  note?: string
}

/** What really happened to this country's markets in this year, or null for the future/no data. */
export function marketHistory(_countryId: string, _year: number): MarketYear | null {
  return null
}

/**
 * The business-cycle demand multiplier for a country and year: real history (recessions,
 * booms) blended with the procedural `synthetic` value, which is returned unchanged for the future.
 */
export function historicalCycle(_countryId: string, _year: number, synthetic: number): number {
  return synthetic
}
