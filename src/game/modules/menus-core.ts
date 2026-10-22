// The rows of the Assets, Shopping and Activities menus (R2, K.3 g): one module, `menus.core`, with an entry per row.
//
// Until R2 the three menus listed their rows in menus.ts: a new feature had to edit that file, in the middle of an array. Now each
// row is an entry of a named slot, and menus.ts reads the slots with collectMenu. The slots are
//
//   assets.money        the Business & Investments block, inserted before the housing heading of the Assets tab
//   assets.tail         the rows appended after the Assets tab (the everyday stores and the lifestyle rows)
//   shopping.stores     the everyday stores, inserted before the big purchases of Activities > Shopping
//   shopping.lifestyle  the Lifestyle block appended to the Shopping menu
//   activities.items    the rows of Activities, which menus.ts sorts by label (a stable sort, so equal labels keep this order)
//
// The orders are the places the rows had in the old lists, in steps of ten, so a track puts its row between two of these by taking
// the gap (an order of 55 in assets.money lands between Banking and Development). Shopping is the one Activities row that lives in
// menus.ts, as the module `menus.shopping` at order 170 (it is menus.ts's own export); everything else is here.
//
// test/kernel-parity.test.ts holds the trees of four canned lives against a fixture recorded before this file existed, and
// test/kernel-menus.test.ts holds the slots and the orders.
//
// Each `build` is an arrow that reads the imported menu when it is called, never when this file loads: a menu is rebuilt on every
// render anyway, and a read at load would be an eager read of an import that sits in a cycle. This file is layer L4 (assembly) and in
// no import cycle: nothing below L4 imports src/game/modules.
import { emigrateMenu, licensesMenu, mindBodyMenu, miscActivities, moviesMenu, nightlifeMenu, vacationMenu } from '../activities'
import { moneyTeamMenu } from '../advisors/menu'
import { businessesMenu } from '../business'
import { computerMenu } from '../computer'
import { crimeMenu } from '../crime'
import { developmentMenu } from '../development'
import { bankingMenu, economyMenu } from '../economy/menu'
import { casinoMenu, lotteryMenu } from '../gambling'
import { doctorMenu } from '../health'
import { thisYearMenu } from '../history/digest-menu'
import { lifePrioritiesMenu } from '../household'
import { investmentsMenu } from '../investments'
import type { MenuEntry, ModuleDef } from '../kernel/registry'
import { adoptionMenu, loveMenu, petsMenu } from '../love'
import { royalMenu } from '../royalty'
import { everydayStoreMenus, luxuryLifestyleMenu, membershipsMenu, ticketsMenu } from '../shops'
import { fameMenu, socialMediaMenu } from '../special'
import { corruptionMenu } from '../special/corruption'
import type { MenuNode } from '../types'
import { workshopMenu } from '../workshop/menu'

/** An entry that builds a list of nodes when it is asked. */
const rows = (path: string, order: number, build: () => MenuNode[]): MenuEntry => ({ path, order, build })

/** An entry that builds one node. */
const one = (path: string, order: number, node: () => MenuNode): MenuEntry => rows(path, order, () => [node()])

/** The Lifestyle rows: memberships, tickets and the luxury menu, in the order both the Assets tab and Shopping always had them. */
const lifestyle = (path: string, first: number): MenuEntry[] => [
  one(path, first, () => membershipsMenu),
  one(path, first + 10, () => ticketsMenu),
  one(path, first + 20, () => luxuryLifestyleMenu),
]

const MENUS_CORE: ModuleDef = {
  id: 'menus.core',
  layer: 4,
  menus: [
    // assets.money: before the housing heading of the Assets tab
    rows('assets.money', 10, () => [{ type: 'heading', id: 'moneyHeading', label: 'Business & Investments' }]),
    one('assets.money', 20, () => businessesMenu),
    one('assets.money', 30, () => investmentsMenu),
    one('assets.money', 40, () => moneyTeamMenu),
    one('assets.money', 50, () => bankingMenu),
    one('assets.money', 60, () => developmentMenu),

    // assets.tail: after the last row of the Assets tab
    rows('assets.tail', 10, () => [...everydayStoreMenus]),
    ...lifestyle('assets.tail', 20),

    // shopping.stores: before the big purchases of Activities > Shopping
    rows('shopping.stores', 10, () => [...everydayStoreMenus]),

    // shopping.lifestyle: after them, under its own heading
    rows('shopping.lifestyle', 10, () => [{ type: 'heading', id: 'shopLifestyle', label: 'Lifestyle' }]),
    ...lifestyle('shopping.lifestyle', 20),

    // activities.items: the rows of Activities in the order they were listed in (shopping is 170, from menus.ts; misc is last)
    one('activities.items', 10, () => adoptionMenu),
    one('activities.items', 20, () => casinoMenu),
    one('activities.items', 30, () => computerMenu),
    one('activities.items', 40, () => crimeMenu),
    one('activities.items', 50, () => corruptionMenu),
    one('activities.items', 60, () => doctorMenu),
    one('activities.items', 70, () => emigrateMenu),
    one('activities.items', 80, () => fameMenu),
    one('activities.items', 90, () => licensesMenu),
    one('activities.items', 100, () => lotteryMenu),
    one('activities.items', 110, () => loveMenu),
    one('activities.items', 120, () => mindBodyMenu),
    one('activities.items', 130, () => moviesMenu),
    one('activities.items', 140, () => nightlifeMenu),
    one('activities.items', 150, () => petsMenu),
    one('activities.items', 160, () => workshopMenu),
    one('activities.items', 180, () => socialMediaMenu),
    one('activities.items', 190, () => thisYearMenu),
    one('activities.items', 200, () => economyMenu),
    one('activities.items', 210, () => royalMenu),
    one('activities.items', 220, () => lifePrioritiesMenu),
    one('activities.items', 230, () => vacationMenu),
    rows('activities.items', 240, () => [...miscActivities]),
  ],
}

/** The module list of this file, sorted by id, for modules/index.ts. */
export const MENU_MODULES: readonly ModuleDef[] = [MENUS_CORE]
