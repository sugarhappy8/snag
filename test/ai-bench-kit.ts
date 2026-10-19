// Helpers shared by the AI Lab 2.0 tests: a player-run AI lab in a chosen year, and models with ratings.
import { CAP_IDS, type CapMap } from '../src/game/business/ai-bench-data'
import { capBest, capOpen, modelScore } from '../src/game/business/ai-bench'
import { familyId } from '../src/game/business/competition-roster'
import { techOf } from '../src/game/business/deeptech-core'
import { readTech, type AiModel, type TechState } from '../src/game/business/deeptech-state'
import { businessAssetView } from '../src/game/business'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState } from '../src/game/business/state'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adultIn } from './deeptech-kit'

export interface Lab { g: GameState; a: Asset; b: BizState; t: TechState; fam: string }

/** A player-run US AI lab (level 60, stage 2) in `year`; `t` is the live state of `b.tech`. */
export function lab(patch: Partial<TechState> = {}, year: number = PRESENT_YEAR, seed = 3): Lab {
  const g = adultIn('us', 50_000_000, seed, 95, year)
  const b0 = newBiz(g, 'aiLab', 'us', getCountry('us').cities[0], { cash: 50_000_000 })
  b0.tech = JSON.parse(JSON.stringify(Object.assign(readTech(undefined), { level: 60, stage: 2, venture: 50_000_000 }, patch))) as Json
  const a = createBusinessAsset(g, 'Test Lab', b0, 0)
  g.assets.push(a)
  g.character.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: g.character.age, roleStartAge: g.character.age } }
  const b = bizOf(g, a)
  return { g, a, b, t: techOf(b), fam: familyId(g.lifeId) }
}

/** A rating in every capability open in `year`, at the best lab's rating plus `delta`. */
export function offBest(fam: string, year: number, delta: number): CapMap {
  const out: CapMap = {}
  for (const c of CAP_IDS) if (capOpen(c) <= year) out[c] = capBest(fam, c, year) + delta
  return out
}

/** A rated model named `Nova ${gen}`; its score is the composite on `year`'s tests. */
export function rated(fam: string, gen: number, year: number, rating: CapMap, extra: Partial<AiModel> = {}): AiModel {
  return { gen, name: `Nova ${gen}`, score: modelScore(fam, rating, year), open: false, year, rating, ...extra }
}

/** `n` unrated models (gens 1 to n, named `Nova ${gen}`, score 50, closed), the way saves before 4.0 stored them. */
export function priors(n: number, year = 2020): AiModel[] {
  return Array.from({ length: n }, (_, i) => ({ gen: i + 1, name: `Nova ${i + 1}`, score: 50, open: false, year }))
}

function all(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...all(g, n.children(g))] : [n]))
}

/** The node `${id}.${a.id}` anywhere in the business view of `a` (any node type). */
export function node(g: GameState, a: Asset, id: string): MenuNode {
  const n = all(g, businessAssetView(g, a)).find((x) => x.id === `${id}.${a.id}`)
  if (!n) throw new Error(`no node ${id}`)
  return n
}

/** The action `${id}.${a.id}` anywhere in the business view of `a`. */
export function act(g: GameState, a: Asset, id: string): MenuAction {
  const n = node(g, a, id)
  if (n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}
