// Top-level menus for the bottom bar. Each feature module exports its own MenuGroup;
// this file only arranges them.
import { emigrateMenu, licensesMenu, mindBodyMenu, miscActivities, moviesMenu, nightlifeMenu, vacationMenu } from './activities'
import { assetsMenu, shoppingMenu } from './assets'
import { occupationMenu } from './careers'
import { inPrison, queueAi } from './core'
import { crimeMenu } from './crime'
import { casinoMenu, lotteryMenu } from './gambling'
import { doctorMenu } from './health'
import { adoptionMenu, loveMenu, petsMenu } from './love'
import { prisonMenu } from './prison'
import { fameMenu, socialMediaMenu } from './special'
import type { GameState, MenuAction, MenuGroup, MenuNode } from './types'

export { assetsMenu, occupationMenu }

/** The AI-native activity: type anything and the local model decides what happens. */
export const doAnythingAction: MenuAction = {
  type: 'action',
  id: 'doAnything',
  label: 'Do Anything',
  emoji: '\u{2728}',
  subtitle: 'Describe any action and the AI decides what happens',
  disabledReason: (g) => (g.character.age < 4 ? 'You are too young to do that.' : null),
  input: { kind: 'text', label: 'What do you want to do?', placeholder: 'e.g. Start a garage band with my best friend' },
  run: (g, input) => {
    const text = (input ?? '').trim()
    if (!text) return
    queueAi(g, { type: 'customAction', text: text.slice(0, 300) })
  },
}

function sortByLabel(nodes: MenuNode[]): MenuNode[] {
  const label = (n: MenuNode) => ('label' in n ? n.label : '')
  return [...nodes].sort((a, b) => label(a).localeCompare(label(b)))
}

export const activitiesMenu: MenuGroup = {
  type: 'menu',
  id: 'activities',
  label: 'Activities',
  emoji: '\u{1F3AF}',
  children: (g: GameState): MenuNode[] => {
    if (inPrison(g)) {
      return [doAnythingAction, ...prisonMenu.children(g), mindBodyMenu, doctorMenu]
    }
    const all: MenuNode[] = [
      adoptionMenu,
      casinoMenu,
      crimeMenu,
      doctorMenu,
      emigrateMenu,
      fameMenu,
      licensesMenu,
      lotteryMenu,
      loveMenu,
      mindBodyMenu,
      moviesMenu,
      nightlifeMenu,
      petsMenu,
      shoppingMenu,
      socialMediaMenu,
      vacationMenu,
      ...miscActivities,
    ]
    return [doAnythingAction, ...sortByLabel(all)]
  },
}
