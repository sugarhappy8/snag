// Minigame kind -> component. Each component reports a result string to its script.
import type { ComponentType } from 'react'
import type { MinigameKind } from '../../game/types'
import { AnnualReport } from './AnnualReport'
import { LazyBlackjack, LazyBurglary, LazyHorseRace, LazyNationReport, LazyPickpocket, LazyPrisonEscape, LazySlots } from './lazy'
import type { MinigameProps } from './types'

export const MINIGAMES: Record<MinigameKind, ComponentType<MinigameProps>> = {
  blackjack: LazyBlackjack,
  horseRace: LazyHorseRace,
  slots: LazySlots,
  burglary: LazyBurglary,
  prisonEscape: LazyPrisonEscape,
  pickpocket: LazyPickpocket,
  annualReport: AnnualReport,
  nationReport: LazyNationReport,
}
