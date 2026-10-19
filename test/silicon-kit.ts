// Helpers shared by the Silicon 2.0 tests (not a test file): a player-run chip company set up directly,
// the menu action finder, and one played year. `company` and `act` are copies of the local helpers in
// deeptech-review.test.ts, which are not exported there.
import { ageUp } from '../src/game/aging'
import { businessAssetView } from '../src/game/business'
import { sellable, techOf } from '../src/game/business/deeptech-core'
import { techReportData } from '../src/game/business/deeptech-sim'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets, type BizState } from '../src/game/business/state'
import type { INDUSTRY_IDS } from '../src/game/data/markets'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { YEAR_PREFS, adultIn, drain } from './deeptech-kit'

export type Lab = { g: GameState; a: Asset; b: BizState; t: TechState }

function all(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...all(g, n.children(g))] : [n]))
}

/** The menu action `${id}.${asset id}` of a company; throws when it is missing or isn't an action. */
export function act(g: GameState, a: Asset, id: string): MenuAction {
  const node = all(g, businessAssetView(g, a)).find((n) => n.id === `${id}.${a.id}`)
  if (!node || node.type !== 'action') throw new Error(`no action ${id}`)
  return node
}

/** A player-run deep-tech company set up directly (skips the founding popups). */
export function company(g: GameState, industry: string, patch: Partial<TechState> = {}, opts: { cash?: number; share?: number } = {}): Asset {
  const c = g.character
  const b = newBiz(g, industry as (typeof INDUSTRY_IDS)[number], c.countryId, c.city, { cash: opts.cash ?? 0, share: opts.share ?? 1 })
  const t = readTech(undefined)
  Object.assign(t, { level: 40, ...patch })
  b.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

/**
 * A player-run semiconductor company. When it can sell, the first year is planned the way the first Annual
 * Report is answered (the suggested price, production a little above expected demand); newBiz leaves
 * production at 0, so without this the first booked year has no sales. `skill` hands the lab to a general
 * manager of that skill (the owner's job may stay: runsIt reads details.ceo).
 */
export function chipLab(o: { year?: number; country?: string; seed?: number; patch?: Partial<TechState>; skill?: number } = {}): Lab {
  const year = o.year ?? 2025
  const g = adultIn(o.country ?? 'us', 50_000_000, o.seed ?? 3, 95, year)
  const a = company(g, 'semiconductor', { stage: 2, level: 60, node: 3, done: ['firstChip', 'volume'], ...o.patch })
  const b = bizOf(g, a), t = techOf(b)
  if (sellable(g, b, t)) {
    const r = techReportData(g, a, b)
    b.price = r.suggestedPrice
    b.production = Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05))
  }
  if (o.skill !== undefined) {
    b.ceo = 'manager'
    b.manager = { firstName: 'Mo', lastName: 'Ney', gender: 'male', skill: o.skill, salary: 150_000, since: year }
  }
  return { g, a, b, t }
}

/** The first company of a game, re-read from the live state. */
export function labOf(g: GameState): Lab {
  const a = businessAssets(g)[0]
  const b = bizOf(g, a)
  return { g, a, b, t: techOf(b) }
}

/**
 * One year played. ageUp raises g.year before the yearly hooks and the business hook books g.year - 1, so
 * called at g.year Y it books fiscal Y and leaves g.year at Y + 1. drain answers the new Annual Report with
 * the suggested price (which resets b.price and b.production) and any other popup with the first choice.
 */
export function playYear(g: GameState): void {
  ageUp(g)
  drain(g, YEAR_PREFS)
}
