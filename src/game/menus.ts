// Top-level menus for the bottom bar. Each feature module exports its own MenuGroup;
// this file only arranges them.
import { emigrateMenu, licensesMenu, mindBodyMenu, miscActivities, moviesMenu, nightlifeMenu, surrenderLifeAction, vacationMenu } from './activities'
import { ASSET_KIND_VIEWS, assetsMenu as baseAssetsMenu, shoppingMenu as baseShoppingMenu } from './assets'
import { businessAssetSubtitle, businessAssetView, businessesMenu } from './business'
import { occupationMenu } from './careers'
import { computerMenu } from './computer'
import { inPrison, queueAi } from './core'
import { investmentAssetSubtitle, investmentAssetView, investmentsMenu } from './investments'
import { crimeMenu } from './crime'
import { casinoMenu, lotteryMenu } from './gambling'
import { doctorMenu } from './health'
import { adoptionMenu, loveMenu, petsMenu } from './love'
import { prisonMenu } from './prison'
import { everydayStoreMenus, luxuryLifestyleMenu, membershipAssetSubtitle, membershipAssetView, membershipsMenu, ticketsMenu } from './shops'
import { fameMenu, socialMediaMenu } from './special'
import type { GameState, MenuAction, MenuGroup, MenuNode } from './types'

export { occupationMenu }

// Owned-asset screens that other modules build (see ASSET_KIND_VIEWS in assets.ts).
ASSET_KIND_VIEWS.business = { subtitle: businessAssetSubtitle, children: businessAssetView }
ASSET_KIND_VIEWS.investment = { subtitle: investmentAssetSubtitle, children: investmentAssetView }
ASSET_KIND_VIEWS.membership = { subtitle: membershipAssetSubtitle, children: membershipAssetView }

/** Insert `extra` right before the node with id `beforeId` (or at the end if it is missing). */
function insertBefore(nodes: MenuNode[], beforeId: string, extra: MenuNode[]): MenuNode[] {
  const i = nodes.findIndex((n) => n.id === beforeId)
  return i < 0 ? [...nodes, ...extra] : [...nodes.slice(0, i), ...extra, ...nodes.slice(i)]
}

/** The Assets tab: assets.ts's menu plus businesses, investments and the newer stores. */
export const assetsMenu: MenuGroup = {
  ...baseAssetsMenu,
  children: (g) => {
    const base = insertBefore(baseAssetsMenu.children(g), 'housingHeading', [
      { type: 'heading', id: 'moneyHeading', label: 'Business & Investments' },
      businessesMenu,
      investmentsMenu,
    ])
    return [...base, ...everydayStoreMenus, membershipsMenu, ticketsMenu, luxuryLifestyleMenu]
  },
}

/** Activities › Shopping: every store, the big purchases and lifestyle spending. */
export const shoppingMenu: MenuGroup = {
  ...baseShoppingMenu,
  children: (g) => [
    ...insertBefore(baseShoppingMenu.children(g), 'shopBig', everydayStoreMenus),
    { type: 'heading', id: 'shopLifestyle', label: 'Lifestyle' },
    membershipsMenu,
    ticketsMenu,
    luxuryLifestyleMenu,
  ],
}

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
      return [doAnythingAction, ...prisonMenu.children(g), mindBodyMenu, doctorMenu, surrenderLifeAction]
    }
    const all: MenuNode[] = [
      adoptionMenu,
      casinoMenu,
      computerMenu,
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
    // Like the real game, Surrender sits on its own at the very bottom of the list.
    return [doAnythingAction, ...sortByLabel(all), surrenderLifeAction]
  },
}
