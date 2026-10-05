// Minigame kind -> component. Each component reports a result string to its script.
import type { ComponentType } from 'react'
import type { MinigameKind } from '../../game/types'
import { AnnualReport } from './AnnualReport'
import { Blackjack } from './Blackjack'
import { Burglary } from './Burglary'
import { HorseRace } from './HorseRace'
import { Pickpocket } from './Pickpocket'
import { PrisonEscape } from './PrisonEscape'
import { Slots } from './Slots'
import type { MinigameProps } from './types'

export const MINIGAMES: Record<MinigameKind, ComponentType<MinigameProps>> = {
  blackjack: Blackjack,
  horseRace: HorseRace,
  slots: Slots,
  burglary: Burglary,
  prisonEscape: PrisonEscape,
  pickpocket: Pickpocket,
  annualReport: AnnualReport,
}
