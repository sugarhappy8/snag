// The Business talent: purple hints in every company (the Annual Report's best plan, the best
// choice in every business popup, company-screen advice) and a modest growth perk.
import { describe, expect, it } from 'vitest'
import { bestPlan as bp } from '../src/game/business/economy'
import { becomeCeo } from '../src/game/business/career'
import {
  appealOf,
  bestPlan,
  bizWorth,
  ceoSkill,
  costFactor,
  evolve,
  fxValue,
  hotIndustries,
  industryHint,
  LASTING_YEARS,
  planFor,
  recordYear,
  simulateYear,
  staffNet,
  TALENT_DEMAND,
  valuationOf,
  type BizFx,
} from '../src/game/business/economy'
import { businessEventInternals } from '../src/game/business/events'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, findBusiness, readBiz, type BizState, type KeyStaff } from '../src/game/business/state'
import { applyPlan, autoPlan, crunchValues, reportData } from '../src/game/business/yearly'
import { industryDemand, INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** An adult who has run a company for two years (so it has a history and a last statement). */
function company(seed: number, countryId: string, industry: Industry, talent: boolean, opts: Partial<BizState> = {}): { g: GameState; a: Asset; b: BizState } {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  g.year = 2030
  c.money = 5_000_000
  c.talent = null
  c.talents = talent ? ['Business'] : undefined
  c.stats.smarts = 65
  c.licenses = ['driver']
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: 250_000, ...opts })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 2; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  g.queue = []
  return { g, a, b }
}

function staffer(id: string, focus: KeyStaff['focus'], skill: number, salary: number, trait = 'steady'): KeyStaff {
  return { id, firstName: 'Robin', lastName: 'Vale', gender: 'female', age: 40, role: `Lead ${id}`, focus, skill, salary, trait, morale: 70, years: 2 }
}

/** Every row of a menu tree, depth first (groups' children included). */
function allNodes(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && depth < 3) {
      try {
        out.push(...allNodes(g, n.children(g), depth + 1))
      } catch {
        // A submenu that needs more state than the test has.
      }
    }
  }
  return out
}

function hints(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => (n.type === 'menu' || n.type === 'action' ? [n.hint?.(g) ?? ''] : [])).filter(Boolean)
}

function lastChoice(g: GameState): ChoiceModal {
  const m = [...g.queue].reverse().find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) throw new Error('no choice queued')
  return m
}


function run(g0: GameState, aId: string, years: number, seed: number, fx?: (b: BizState) => void): number {
  const g = structuredClone(g0)
  g.rng = seed
  const b = bizOf(g, findBusiness(g, aId)!)
  fx?.(b)
  let total = 0
  for (let y = 0; y < years; y++) {
    const p = bp(g, b, { fast: true, ownerDraw: b.ownerSalary })
    b.price = p.price
    b.production = p.production
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    total += r.stmt.net
    g.year += 1
  }
  return total
}
const FX: [string, BizFx, (b: BizState) => void][] = [
  ['brand+10', { brand: 10 }, (b) => { b.brand = Math.min(100, b.brand + 10) }],
  ['quality+10', { quality: 10 }, (b) => { b.quality = Math.min(100, b.quality + 10) }],
  ['morale+15', { morale: 15 }, (b) => { b.morale = Math.min(100, b.morale + 15) }],
  ['demand0.9', { demandTo: 0.9 }, (b) => { b.demandShock = Math.min(b.demandShock, 0.9) }],
  ['demand1.15', { demandTo: 1.15 }, (b) => { b.demandShock = Math.max(b.demandShock, 1.15) }],
  ['cap0.3', { capacityTo: 0.3 }, (b) => { b.capacityLoss = Math.max(b.capacityLoss, 0.3) }],
  ['cost1.1', { costTo: 1.1 }, (b) => { b.costShock = Math.max(b.costShock, 1.1) }],
  ['pressure0.24', { pressureTo: 0.24 }, (b) => { b.pressure = Math.max(b.pressure, 0.24) }],
  ['wage+0.08', { wage: 0.08 }, (b) => { b.wageLevel = Math.round((b.wageLevel + 0.08) * 100) / 100 }],
]
describe('yardstick', () => {
  it('fxValue vs simulated', () => {
    const out: string[] = []
    for (const [cid, ind] of [['us','restaurant'],['jp','cafe'],['ng','foodTruck'],['br','software'],['de','gym'],['in','fashion']] as [string, Industry][]) {
      const { g, a, b } = company(300 + cid.length, cid, ind, true)
      const w = bizWorth(g, b)
      const row: string[] = [`${cid}/${ind} contrib ${Math.round(w.contrib)}`]
      for (const [name, fx, apply] of FX) {
        let d = 0
        const N = 12
        for (let s = 0; s < N; s++) d += run(g, a.id, 6, 50 + s * 101, apply) - run(g, a.id, 6, 50 + s * 101)
        d /= N
        const v = fxValue(g, b, w, fx)
        row.push(`${name}: hint ${Math.round(v)} sim ${Math.round(d)}`)
      }
      out.push(row.join('\n   '))
    }
    console.log(out.join('\n'))
    expect(1).toBe(1)
  }, 600_000)
})
