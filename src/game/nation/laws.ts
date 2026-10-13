// What each country's own law says before any government in the game changes it: casinos, alcohol,
// cannabis and marriage equality, by country and year. Approximate, for gameplay.
import { isIndustryLegal } from '../data/markets'
import type { GameState } from '../types'
import type { LegalId } from './data'

const CANNABIS: Record<string, number> = { uy: 2013, ca: 2018, mt: 2021, th: 2022, de: 2024, lu: 2023 }
const MARRIAGE: Record<string, number> = {
  nl: 2001, be: 2003, es: 2005, ca: 2005, za: 2006, no: 2009, se: 2009, pt: 2010, is: 2010, ar: 2010, dk: 2012, fr: 2013, br: 2013, uy: 2013, nz: 2013,
  gb: 2014, lu: 2015, us: 2015, ie: 2015, co: 2016, fi: 2017, mt: 2017, de: 2017, au: 2017, at: 2019, tw: 2019, ec: 2019, cr: 2020, cl: 2022, ch: 2022,
  si: 2022, mx: 2022, cu: 2022, ad: 2023, ee: 2024, gr: 2024, th: 2025,
}

/** True when the thing is legal here and now under the country's own law (no game policy). */
export function legalBase(_g: GameState, country: string, id: LegalId, year = _g.year): boolean {
  if (id === 'casinos') return isIndustryLegal(country, 'casino')
  if (id === 'prohibition') return isIndustryLegal(country, 'bar') && !(country === 'us' && year >= 1920 && year <= 1933)
  if (id === 'cannabis') return year >= (CANNABIS[country] ?? 99_999)
  return year >= (MARRIAGE[country] ?? 99_999)
}
