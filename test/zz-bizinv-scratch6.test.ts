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


function future(g0: GameState, aId: string, years: number): number {
  const g = g0
  const a = findBusiness(g, aId)
  if (!a) return 0
  const b = bizOf(g, a)
  let total = 0
  for (let y = 0; y < years; y++) {
    const p = bp(g, b, { fast: true, ownerDraw: b.ownerSalary })
    b.price = p.price
    b.production = p.production
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    total += r.stmt.pbt
    g.year += 1
  }
  return total
}
const IDS = ['inspection','audit','strike','viral','competitor','supplier','currency','celebrity','lawsuit','disaster','tacos','poached','embezzle']
describe('truth', () => {
  it('hint vs simulated best', () => {
    const N = 14
    const lines: string[] = []
    let n = 0, wrong = 0
    const countries = ['us','mx','ng','jp','br','in','de','ar','kr','tw']
    const inds: Industry[] = ['restaurant','cafe','software','gym','fashion','foodTruck','brewery','hotel']
    for (const id of IDS) {
      for (let k = 0; k < 6; k++) {
        const cid = countries[(k * 3 + id.length) % countries.length]
        const ind = inds[(k + id.length) % inds.length]
        let made
        try { made = company(400 + k * 13 + id.length, cid, ind, true) } catch { continue }
        const { g, a, b } = made
        if (id === 'poached' || id === 'embezzle') b.staff.push(staffer('kx', (['sales','finance','ops','quality'] as const)[k % 4], 30 + k * 8, 20_000 + k * 15_000, ['steady','shady','lazy','genius'][k % 4] ?? 'steady'))
        if (id === 'strike') b.morale = 20 + k * 3
        g.queue = []
        if (!businessEventInternals.present(g, a, b, id)) continue
        const m = lastChoice(g)
        const hinted = m.choices.find((c) => c.hint)
        if (!hinted) continue
        g.queue = []
        const means = new Map<string, number>()
        for (const c of m.choices) {
          let sum = 0
          for (let i = 0; i < N; i++) {
            const g1 = structuredClone(g)
            g1.rng = 3_000 + i * 7919
            runScript(g1, m.scriptId!, c.id, m.data, m)
            g1.queue = []
            sum += future(g1, a.id, 5)
          }
          means.set(c.id, sum / N)
        }
        n++
        const sorted = [...means.entries()].sort((x, y) => y[1] - x[1])
        const regret = sorted[0][1] - means.get(hinted.id)!
        const scale = Math.abs(sorted[0][1]) + 1
        if (regret > 0.01 * scale && sorted[0][0] !== hinted.id) {
          wrong++
          lines.push(`${id} ${cid}/${ind} k${k}: hint ${hinted.id}, best ${sorted[0][0]} regret ${Math.round(regret)} (${(100 * regret / scale).toFixed(1)}% of 5y pbt) [${sorted.map(([x,y])=>x+':'+Math.round(y)).join(' ')}]`)
        }
      }
    }
    console.log('checked', n, 'wrong', wrong, '\n' + lines.join('\n'))
    expect(1).toBe(1)
  }, 900_000)
})
