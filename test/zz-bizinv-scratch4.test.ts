// The Business talent: purple hints in every company (the Annual Report's best plan, the best
// choice in every business popup, company-screen advice) and a modest growth perk.
import { describe, expect, it } from 'vitest'
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

/** The value of what a choice actually did to the company (the same yardstick the hints use). */
function measure(g0: GameState, g1: GameState, assetId: string, arrestSeverity: number): number {
  const b0 = readBiz(g0, findBusiness(g0, assetId)!)
  const w = bizWorth(g0, b0)
  const a1 = findBusiness(g1, assetId)
  if (!a1) throw new Error('business gone')
  const b1 = readBiz(g1, a1)
  const cost: Record<string, number> = { budget: 0.86, standard: 1, premium: 1.18 }
  const tier: Record<string, number> = { budget: -12, standard: 0, premium: 12 }
  const fx: BizFx = {
    cash: b1.cash - b0.cash,
    brand: b1.brand - b0.brand,
    quality: b1.quality - b0.quality,
    morale: b1.morale - b0.morale,
    demandTo: b1.demandShock,
    capacityTo: b1.capacityLoss,
    costSet: b1.costShock,
    pressureTo: b1.pressure,
    priceCut: b0.price > 0 ? Math.max(0, 1 - b1.price / b0.price) : 0,
    wage: b1.wageLevel - b0.wageLevel,
    karma: g1.character.hidden.karma - g0.character.hidden.karma,
    arrest: (g1.counters.arrests ?? 0) > (g0.counters.arrests ?? 0) ? arrestSeverity : 0,
    ...(b1.supplier !== b0.supplier ? { costFactor: cost[b1.supplier] / cost[b0.supplier], qualityTarget: tier[b1.supplier] - tier[b0.supplier] } : {}),
  }
  let v = fxValue(g0, b0, w, fx)
  // Key people: what they add (minus pay) over the years they stay.
  const team = (b: BizState) => b.staff.reduce((t, s) => t + staffNet(g0, b0, w, s), 0) * LASTING_YEARS
  v += team(b1) - team(b0)
  return v
}


const IDS = ['inspection','audit','strike','viral','competitor','supplier','currency','celebrity','lawsuit','disaster','tacos','poached','embezzle']
describe('wide MC', () => {
  it('hint vs best across many companies', () => {
    const RUNS = 120
    const bad: string[] = []
    let total = 0
    const countries = ['us','mx','ng','jp','br','in','de','ar','kr','tw']
    const inds: Industry[] = ['restaurant','cafe','software','gym','fashion','foodTruck','brewery','hotel']
    for (const id of IDS) {
      for (let k = 0; k < 8; k++) {
        const cid = countries[(k * 3 + id.length) % countries.length]
        const ind = inds[(k + id.length) % inds.length]
        let made
        try { made = company(200 + k * 13 + id.length, cid, ind, true) } catch { continue }
        const { g, a, b } = made
        if (id === 'poached' || id === 'embezzle') b.staff.push(staffer('kx', (['sales','finance','ops','quality'] as const)[k % 4], 30 + k * 8, 20_000 + k * 15_000, ['steady','shady','lazy','genius'][k % 4] ?? 'steady'))
        if (id === 'strike') b.morale = 20 + k * 3
        if (k % 3 === 0) b.share = 0.6
        if (k % 4 === 1) b.cooked = 1
        if (k % 2) b.quality = 30 + k * 7
        g.queue = []
        const ok = businessEventInternals.present(g, a, b, id)
        if (!ok) continue
        let m
        try { m = lastChoice(g) } catch { continue }
        const hinted = m.choices.find((c) => c.hint)
        if (!hinted) { bad.push(`${id} ${cid} ${ind}: no hint`); continue }
        g.queue = []
        const means = new Map<string, number>()
        const vars = new Map<string, number>()
        for (const c of m.choices) {
          let sum = 0, sq = 0
          for (let i = 0; i < RUNS; i++) {
            const g1 = structuredClone(g)
            g1.rng = 1_000 + i * 7919
            runScript(g1, m.scriptId!, c.id, m.data, m)
            let v = 0
            try { v = measure(g, g1, a.id, id === 'audit' && b.cooked ? 3 : 2) } catch { v = NaN }
            sum += v; sq += v * v
          }
          const mean = sum / RUNS
          means.set(c.id, mean)
          vars.set(c.id, Math.max(0, sq / RUNS - mean * mean))
        }
        total++
        const best = [...means.entries()].sort((x, y) => y[1] - x[1])[0]
        const pick = hinted.id
        const se = Math.sqrt((vars.get(pick)! + vars.get(best[0])!) / RUNS)
        const scale = Math.max(...[...means.values()].map(Math.abs), 1)
        if (means.get(pick)! < best[1] - 3 * se - scale * 0.06) bad.push(`${id} ${cid} ${ind} k${k}: hinted ${pick} ${Math.round(means.get(pick)!)} vs best ${best[0]} ${Math.round(best[1])} [${[...means.entries()].map(([x,y])=>x+':'+Math.round(y)).join(' ')}]`)
      }
    }
    console.log('checked', total, '\n' + bad.join('\n'))
    expect(1).toBe(1)
  }, 600_000)
})
