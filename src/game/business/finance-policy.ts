// Approximate game regulations, not a claim to reproduce each nation's legal code.
import { marketOf } from '../data/markets'
import { economyOf } from '../economy'
import { hasTech } from '../history/timeline'
import type { GameState } from '../types'
import { getCountry } from '../world'
import type { BizState } from './state'
import { financeView } from './finance-firm-state'
import { clampN } from './util'

export function bankRequirements(g: GameState, b: BizState, year = g.year) {
  const regulation = marketOf(b.countryId).easeOfBusiness
  return { capital: year < 1988 ? .06 : year < 2010 ? .08 : .105,
    reserve: clampN(.08 + (100 - regulation) / 1000 + (year < 1935 ? .07 : 0), .08, .22),
    emergencyWindow: year >= 1935 && economyOf(g, b.countryId, year).services > .35 }
}

/** Institutional research precedes household computers; local development shifts adoption. */
export function financeInfrastructure(g: GameState, b: BizState, year = g.year) {
  const local = { ...g, character: { ...g.character, countryId: b.countryId } }
  const lag = Math.round((1 - Math.min(1, getCountry(b.countryId).wealth)) * 24)
  const electronic = hasTech(local, 'onlineBrokerage', year)
  const stage = hasTech(local, 'deepLearning', year) && electronic ? 5 : electronic ? 4 :
    year >= 1980 + lag ? 3 : year >= 1970 + lag ? 2 : year >= 1955 + lag ? 1 : 0
  return { stage, label: ['Manual statistics & human execution', 'Institutional computer-assisted research', 'Computer-based quantitative research', 'Computerized portfolio trading', 'Electronic trading infrastructure', 'Machine learning & large datasets'][stage], electronic }
}

export function algorithmCapacity(g: GameState, b: BizState, year = g.year): number {
  const f = financeView(b), infra = financeInfrastructure(g, b, year)
  const researchers = b.staff.filter(s => s.focus === 'quality' || s.focus === 'finance')
  const expertise = researchers.reduce((sum, s) => sum + s.skill * s.morale / 10000, 0)
  return (500_000 + expertise * 1_500_000) * (1 + infra.stage) * (1 + f.computing / 25) * (1 + f.researchQuality / 50)
}
