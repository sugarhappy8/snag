// The lazy gate of the table and street games (R3 release, the bundle budget): the only file that starts these chunks. The
// six games (blackjack, horse race, slots, burglary, prison escape, pickpocket) are reached through import(), so they stay
// out of the first download. MinigameCard (ModalHost.tsx) draws the game inside its PopupFrame, so a game that is still
// loading shows the busy box under the frame's title, and the idle prefetch (prefetchLazyViews, App.tsx) normally has the
// chunks in before a game is offered. A failed load keeps the box and adds Try again, then Reload (lazyView). The Nation
// Report (a President's yearly State of the Nation, with its stylesheet) loads the same way since the v5.1.0 release commit,
// which needed about 1 KB more room under the bundle budget. The Annual Report stays in the entry: it comes every year to
// every owner, and test/annualReport.test.ts pins MINIGAMES.annualReport to the component itself.
import { lazyView, type LazyView } from '../lazy/lazyView'
import type { MinigameProps } from './types'

export const LazyBlackjack: LazyView<MinigameProps> = lazyView('blackjack', () => import('./Blackjack').then((m) => ({ default: m.Blackjack })))
export const LazyHorseRace: LazyView<MinigameProps> = lazyView('horse-race', () => import('./HorseRace').then((m) => ({ default: m.HorseRace })))
export const LazySlots: LazyView<MinigameProps> = lazyView('slots', () => import('./Slots').then((m) => ({ default: m.Slots })))
export const LazyBurglary: LazyView<MinigameProps> = lazyView('burglary', () => import('./Burglary').then((m) => ({ default: m.Burglary })))
export const LazyPrisonEscape: LazyView<MinigameProps> = lazyView('prison-escape', () => import('./PrisonEscape').then((m) => ({ default: m.PrisonEscape })))
export const LazyPickpocket: LazyView<MinigameProps> = lazyView('pickpocket', () => import('./Pickpocket').then((m) => ({ default: m.Pickpocket })))
export const LazyNationReport: LazyView<MinigameProps> = lazyView('nation-report', () => import('./NationReport').then((m) => ({ default: m.NationReport })))
