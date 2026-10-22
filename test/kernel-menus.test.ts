// ci: fast
// R2-K11 (K.3 g): the Assets, Shopping and Activities menus collect their rows from the registry.
//
// The slots are assets.money, assets.tail, shopping.stores, shopping.lifestyle and activities.items; the rows are module
// definitions (src/game/modules/menus-core.ts, and menus.shopping in menus.ts). test/kernel-parity.test.ts holds what the
// conversion must not change: the menu trees of four canned lives, group by group. This file holds what parity cannot see: which
// slot and which order each row sits in (a track adds a row by choosing an order between two of these), that an extension module
// lands in place, and that the prison branch of Activities never touches the registry.
//
// A case that registers an extension starts a fresh module registry (vi.resetModules) and imports its own copy of the registry and
// of menus, so the extension cannot leak into another case. No pinned seed: the states are nav-kit's canned ones.
import { describe, expect, it, vi } from 'vitest'
import { emigrateMenu, licensesMenu, mindBodyMenu, miscActivities, moviesMenu, nightlifeMenu, surrenderLifeAction, vacationMenu } from '../src/game/activities'
import { moneyTeamMenu } from '../src/game/advisors/menu'
import { businessesMenu } from '../src/game/business'
import { computerMenu } from '../src/game/computer'
import { crimeMenu } from '../src/game/crime'
import { developmentMenu } from '../src/game/development'
import { bankingMenu, economyMenu } from '../src/game/economy/menu'
import { casinoMenu, lotteryMenu } from '../src/game/gambling'
import { doctorMenu } from '../src/game/health'
import { thisYearMenu } from '../src/game/history/digest-menu'
import { lifePrioritiesMenu } from '../src/game/household'
import { investmentsMenu } from '../src/game/investments'
import { intelBriefingMenu } from '../src/game/knowledge/contract'
import { collectMenu, menuEntries } from '../src/game/kernel/registry'
import { adoptionMenu, loveMenu, petsMenu } from '../src/game/love'
import { activitiesMenu, assetsMenu, doAnythingAction, shoppingMenu } from '../src/game/menus'
import { prisonMenu } from '../src/game/prison'
import { royalMenu } from '../src/game/royalty'
import { everydayStoreMenus, luxuryLifestyleMenu, membershipsMenu, ticketsMenu } from '../src/game/shops'
import { fameMenu, socialMediaMenu } from '../src/game/special'
import { corruptionMenu } from '../src/game/special/corruption'
import { workshopMenu } from '../src/game/workshop/menu'
import type { GameState, MenuNode } from '../src/game/types'
import { navState } from './nav-kit'

const ids = (nodes: readonly MenuNode[]): string[] => nodes.map((n) => n.id)

/** The 23 named rows of the old `all` array of activitiesMenu, in the old order, then the spread of miscActivities. */
const OLD_ACTIVITIES: readonly MenuNode[] = [
  adoptionMenu,
  casinoMenu,
  computerMenu,
  crimeMenu,
  corruptionMenu,
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
  workshopMenu,
  shoppingMenu,
  socialMediaMenu,
  thisYearMenu,
  economyMenu,
  royalMenu,
  lifePrioritiesMenu,
  vacationMenu,
  ...miscActivities,
]

const MONEY_MENUS: readonly MenuNode[] = [businessesMenu, investmentsMenu, moneyTeamMenu, intelBriefingMenu, bankingMenu, developmentMenu]
const LIFESTYLE_MENUS: readonly MenuNode[] = [membershipsMenu, ticketsMenu, luxuryLifestyleMenu]

function adult(): GameState {
  return navState('adult')
}

function inJail(): GameState {
  const g = structuredClone(adult())
  g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
  return g
}

describe('the slots hold the rows the old menus listed, in the old order', () => {
  it('activities.items: the 23 menus at orders 10 to 230, then miscActivities at 240', () => {
    const entries = menuEntries('activities.items')
    expect(entries.map((e) => e.order)).toEqual(Array.from({ length: 24 }, (_, i) => (i + 1) * 10))
    expect(entries.filter((e) => e.id === 'menus.shopping')).toHaveLength(1)
    expect(entries.find((e) => e.id === 'menus.shopping')!.order).toBe(170)
    expect(ids(collectMenu('activities.items', adult()))).toEqual(ids(OLD_ACTIVITIES))
  })

  it('assets.money: the heading first, then the six money menus (the Intelligence Briefing sits at 45)', () => {
    const nodes = collectMenu('assets.money', adult())
    expect(nodes[0]).toEqual({ type: 'heading', id: 'moneyHeading', label: 'Business & Investments' })
    expect(ids(nodes.slice(1))).toEqual(ids(MONEY_MENUS))
    expect(menuEntries('assets.money').map((e) => e.order)).toEqual([10, 20, 30, 40, 45, 50, 60])
  })

  it('assets.tail: the everyday stores, then memberships, tickets and the luxury lifestyle', () => {
    expect(ids(collectMenu('assets.tail', adult()))).toEqual([...ids(everydayStoreMenus), ...ids(LIFESTYLE_MENUS)])
    expect(menuEntries('assets.tail').map((e) => e.order)).toEqual([10, 20, 30, 40])
  })

  it('shopping.stores and shopping.lifestyle', () => {
    expect(ids(collectMenu('shopping.stores', adult()))).toEqual(ids(everydayStoreMenus))
    const life = collectMenu('shopping.lifestyle', adult())
    expect(life[0]).toEqual({ type: 'heading', id: 'shopLifestyle', label: 'Lifestyle' })
    expect(ids(life.slice(1))).toEqual(ids(LIFESTYLE_MENUS))
  })

  it('the three menus read those slots: the same rows as before, in the same places', () => {
    const g = adult()
    const assets = ids(assetsMenu.children(g))
    const at = assets.indexOf('moneyHeading')
    expect(at).toBeGreaterThan(-1)
    expect(assets[at + 1 + MONEY_MENUS.length]).toBe('housingHeading')
    expect(assets.slice(at, at + 1 + MONEY_MENUS.length)).toEqual(['moneyHeading', ...ids(MONEY_MENUS)])
    expect(assets.slice(-(everydayStoreMenus.length + LIFESTYLE_MENUS.length))).toEqual([...ids(everydayStoreMenus), ...ids(LIFESTYLE_MENUS)])

    const shop = ids(shoppingMenu.children(g))
    expect(shop.slice(-(1 + LIFESTYLE_MENUS.length))).toEqual(['shopLifestyle', ...ids(LIFESTYLE_MENUS)])
    const big = shop.indexOf('shopBig')
    expect(shop.slice(big - everydayStoreMenus.length, big)).toEqual(ids(everydayStoreMenus))

    const acts = ids(activitiesMenu.children(g))
    expect(acts[0]).toBe(doAnythingAction.id)
    expect(acts[acts.length - 1]).toBe(surrenderLifeAction.id)
    expect(acts.slice(1, -1).sort()).toEqual(ids(OLD_ACTIVITIES).sort())
  })
})

/** A fresh registry and a fresh copy of menus: the extension a case registers is in this epoch only. */
async function fresh() {
  vi.resetModules()
  const reg = await import('../src/game/kernel/registry')
  const menus = await import('../src/game/menus')
  return { reg, menus }
}

describe('a track adds a menu row with one registry entry', () => {
  it('assets.money order 55 lands between banking and development; assets.tail order 45 comes after the luxury lifestyle', async () => {
    const { reg, menus } = await fresh()
    const row = (id: string): MenuNode => ({ type: 'info', id, text: id })
    reg.registerModule({ id: 'ext.k11money', layer: 3, menus: [{ path: 'assets.money', order: 55, build: () => [row('x.money')] }] })
    reg.registerModule({ id: 'ext.k11tail', layer: 3, menus: [{ path: 'assets.tail', order: 45, build: () => [row('x.tail')] }] })
    const g = adult()
    const assets = ids(menus.assetsMenu.children(g))
    const bank = assets.indexOf(bankingMenu.id)
    expect(assets.slice(bank, bank + 3)).toEqual([bankingMenu.id, 'x.money', developmentMenu.id])
    expect(assets[assets.length - 1]).toBe('x.tail')
    expect(assets[assets.length - 2]).toBe(luxuryLifestyleMenu.id)
  }, 120_000)

  it('shopping.stores order 15 lands after the everyday stores, before the big purchases; shopping.lifestyle order 45 is last', async () => {
    const { reg, menus } = await fresh()
    reg.registerModule({ id: 'ext.k11stores', layer: 3, menus: [{ path: 'shopping.stores', order: 15, build: () => [{ type: 'info', id: 'x.store', text: 'x' }] }] })
    reg.registerModule({ id: 'ext.k11life', layer: 3, menus: [{ path: 'shopping.lifestyle', order: 45, build: () => [{ type: 'info', id: 'x.life', text: 'x' }] }] })
    const shop = ids(menus.shoppingMenu.children(adult()))
    const big = shop.indexOf('shopBig')
    expect(shop[big - 1]).toBe('x.store')
    expect(shop[shop.length - 1]).toBe('x.life')
  }, 120_000)

  it('activities.items order 245 joins the list, and the labels still sort it', async () => {
    const { reg, menus } = await fresh()
    reg.registerModule({ id: 'ext.k11act', layer: 3, menus: [{ path: 'activities.items', order: 245, build: () => [{ type: 'heading', id: 'x.act', label: 'Aardvark watching' }] }] })
    const acts = menus.activitiesMenu.children(adult())
    expect(acts.map((n) => n.id)).toContain('x.act')
    const labels = acts.slice(1, -1).map((n) => ('label' in n ? n.label : ''))
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
    expect(acts[1]!.id).toBe('x.act')
  }, 120_000)

  it('in prison the Activities menu is the prison list and never asks the registry', async () => {
    const { reg, menus } = await fresh()
    const asked: string[] = []
    reg.registerModule({ id: 'ext.k11spy', layer: 3, menus: [{ path: 'activities.items', order: 5, build: () => (asked.push('items'), [{ type: 'info', id: 'x.spy', text: 'x' }]) }] })
    const jail = inJail()
    const got = menus.activitiesMenu.children(jail)
    expect(asked).toEqual([])
    expect(ids(got)).toEqual(ids([doAnythingAction, ...prisonMenu.children(jail), mindBodyMenu, doctorMenu, surrenderLifeAction]))
    // out of prison the same extension is in the list, so the spy proves the branch and not a dead slot
    menus.activitiesMenu.children(adult())
    expect(asked).toEqual(['items'])
  }, 120_000)
})
