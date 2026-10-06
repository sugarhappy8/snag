import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { bestPlan, evolve, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf } from '../src/game/business/state'
import { applyPlan, autoPlan, reportData } from '../src/game/business/yearly'
import { createNewLife } from '../src/game/life'
import type { MenuNode, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

function allNodes(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && depth < 4) {
      try {
        out.push(...allNodes(g, n.children(g), depth + 1))
      } catch {
        /* */
      }
    }
  }
  return out
}

describe('scratch', () => {
  it('perf of big company', () => {
    const g = createNewLife({ seed: 3, year: 2000, countryId: 'us' })
    g.queue = []
    g.character.age = 40
    g.year = 2040
    g.character.money = 1e9
    g.character.talents = ['Business']
    const b0 = newBiz(g, 'restaurant', 'us', 'Chicago', { cash: 50_000_000 })
    const a = createBusinessAsset(g, 'Big Co', b0, 100_000)
    g.assets.push(a)
    becomeCeo(g, a, b0)
    const b = bizOf(g, a)
    const cids = ['us', 'jp', 'de', 'br', 'gb', 'fr', 'in', 'ng', 'kr', 'mx', 'ca', 'au']
    b.outlets = []
    for (const cid of cids) for (const city of getCountry(cid).cities.slice(0, 5)) b.outlets.push({ countryId: cid, city, count: 4, opened: 2030 } as never)
    applyPlan(b, autoPlan(g, b, 1))
    for (let y = 0; y < 2; y++) {
      const r = simulateYear(g, b, g.year, b.ownerSalary)
      evolve(g, b, r.stmt, g.year)
      recordYear(b, r.stmt)
      b.valuation = valuationOf(b)
      g.year += 1
      applyPlan(b, autoPlan(g, b, r.stmt.cycle))
    }
    let t = performance.now()
    const r = reportData(g, a, bizOf(g, a))
    console.log('report ms', performance.now() - t, r.talentHint?.text)
    t = performance.now()
    const nodes = allNodes(g, businessView(g, a))
    let n = 0
    for (const x of nodes) if ((x.type === 'menu' || x.type === 'action') && x.hint?.(g)) n++
    console.log('menu hints ms', performance.now() - t, n)
    t = performance.now()
    bestPlan(g, bizOf(g, a), { fast: true })
    console.log('fast ms', performance.now() - t)
    expect(r).toBeTruthy()
  }, 120_000)
})
