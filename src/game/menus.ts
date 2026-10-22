// Top-level menus for the bottom bar. Each feature module exports its own MenuGroup;
// this file only arranges them. The rows of Assets, Shopping and Activities are registered with the kernel, in slots
// (modules/menus-core.ts), and collected here: a new feature adds a row with one registry entry and edits no list in this file.
import { mindBodyMenu, surrenderLifeAction } from './activities'
import { isVisaLock, visaLockSubtitle, visaLockView } from './activities/immigration-lock'
import { ASSET_KIND_VIEWS, ASSET_NODE_HOOKS, assetsMenu as baseAssetsMenu, shoppingMenu as baseShoppingMenu } from './assets'
import { businessAssetSubtitle, businessAssetView } from './business'
import { occupationMenu } from './careers'
import { developmentNodes } from './development'
import { actorLikenessNodes } from './special/actor-legacy'
import { musicMasterNodes } from './special/music-rights'
import { ventureAssetSubtitle, ventureAssetView } from './computer/dev'
import { inPrison, queueAi, yearActionsUsed } from './core'
import { investmentAssetSubtitle, investmentAssetView } from './investments'
import { collectMenu, registerModule } from './kernel/registry'
import { CUSTOM_ACTION_KEY, MAX_CUSTOM_ACTIONS_PER_YEAR } from './offline'
import { inventionNodes, inventionSubtitle } from './workshop/menu'
import { doctorMenu } from './health'
import { prisonMenu } from './prison'
import { membershipAssetSubtitle, membershipAssetView } from './shops'
import { luxuryAssetNodes } from './shops/luxury-brands-assets'
import { familyAccessNode } from './shops/luxury-family'
// Registers the modules (the rows of the slots below among them); menus is the entry that guarantees they are loaded before a menu is built.
import './modules'
import type { GameState, MenuAction, MenuGroup, MenuNode } from './types'

export { occupationMenu }

// Owned-asset screens that other modules build (see ASSET_KIND_VIEWS in assets.ts).
ASSET_KIND_VIEWS.business = { subtitle: businessAssetSubtitle, children: businessAssetView }
ASSET_KIND_VIEWS.investment = { subtitle: investmentAssetSubtitle, children: investmentAssetView }
ASSET_KIND_VIEWS.membership = { subtitle: membershipAssetSubtitle, children: membershipAssetView }
ASSET_KIND_VIEWS.venture = { subtitle: ventureAssetSubtitle, children: ventureAssetView }
ASSET_KIND_VIEWS.invention = { subtitle: inventionSubtitle, children: inventionNodes }
ASSET_NODE_HOOKS.subtitle = (g, a) => (isVisaLock(a) ? visaLockSubtitle(g, a) : null)
ASSET_NODE_HOOKS.view = (g, a) => developmentNodes(g, a) ?? musicMasterNodes(g, a) ?? actorLikenessNodes(g, a) ?? (isVisaLock(a) ? visaLockView(g, a) : luxuryAssetNodes(g, a))
ASSET_NODE_HOOKS.extra = familyAccessNode

/** Insert `extra` right before the node with id `beforeId` (or at the end if it is missing). */
function insertBefore(nodes: MenuNode[], beforeId: string, extra: MenuNode[]): MenuNode[] {
  const i = nodes.findIndex((n) => n.id === beforeId)
  return i < 0 ? [...nodes, ...extra] : [...nodes.slice(0, i), ...extra, ...nodes.slice(i)]
}

/** The Assets tab: assets.ts's menu plus businesses, investments and the newer stores. */
export const assetsMenu: MenuGroup = {
  ...baseAssetsMenu,
  children: (g) => {
    const base = insertBefore(baseAssetsMenu.children(g), 'housingHeading', collectMenu('assets.money', g))
    return [...base, ...collectMenu('assets.tail', g)]
  },
}

/** Activities › Shopping: every store, the big purchases and lifestyle spending. */
export const shoppingMenu: MenuGroup = {
  ...baseShoppingMenu,
  children: (g) => [...insertBefore(baseShoppingMenu.children(g), 'shopBig', collectMenu('shopping.stores', g)), ...collectMenu('shopping.lifestyle', g)],
}

/**
 * Type anything: the built-in keyword resolver (events/custom.ts) works out what happens, within
 * the rules for age, prison and money. A few a year (offline.ts): once they're used up the row
 * says so, instead of asking for an action that can't happen.
 */
export const doAnythingAction: MenuAction = {
  type: 'action',
  id: 'doAnything',
  label: 'Do Anything',
  emoji: '\u{2728}',
  subtitle: 'Type any action and see how it plays out',
  disabledReason: (g) =>
    g.character.age < 4
      ? 'You are too young to do that.'
      : yearActionsUsed(g, CUSTOM_ACTION_KEY) >= MAX_CUSTOM_ACTIONS_PER_YEAR
        ? "You've done enough wild things for one year. Age up and try again."
        : null,
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
    const all = collectMenu('activities.items', g)
    // Like the real game, Surrender sits on its own at the very bottom of the list.
    return [doAnythingAction, ...sortByLabel(all), surrenderLifeAction]
  },
}

// Activities > Shopping is this file's own export, so its row is registered here and the other 22 rows of the slot are in modules/menus-core.ts.
// The slot lists it where the old array did, after the workshop and before social media. The arrow reads it when the menu is built.
registerModule({ id: 'menus.shopping', layer: 4, menus: [{ path: 'activities.items', order: 170, build: () => [shoppingMenu] }] })
