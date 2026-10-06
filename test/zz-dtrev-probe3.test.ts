import { describe, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu } from '../src/game/business'
import { techView } from '../src/game/business/deeptech-core'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { bizOf, businessAssets, readBiz } from '../src/game/business/state'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function adultIn(countryId: string, money: number, seed = 3, smarts = 90): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = smarts
  c.talent = null
  c.talents = []
  return g
}
function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Co'), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        const production = Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05))
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production }), m.data, m)
      } else runScript(g, m.scriptId, 'lose', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}
function find(nodes: MenuNode[], id: string): MenuNode | undefined {
  return nodes.find((n) => n.id === id)
}
function startRow(g: GameState, industry: string): MenuAction {
  const start = find(businessCareerMenu.children(g), 'biz.start') as MenuGroup
  return find(start.children(g), `biz.start.${industry}`) as MenuAction
}
const YEAR_PREFS = ['sign', 'savings', 'pay', 'decline', 'patch', 'recall', 'help', 'disclose', 'fix', 'investor', 'loan', 'steady', 'closed', 'pause', 'license', 'program', 'quiet', 'fair']

describe('probe3', () => {
  it('calibration', () => {
    const out: string[] = []
    const inds = (process.env.DT_INDS ?? 'cybersecurity,aiLab,spaceTech,semiconductor,robotics,biotech,electricVehicles,quantum').split(',')
    const ccs = (process.env.DT_CCS ?? 'us').split(',')
    const years = Number(process.env.DT_YEARS ?? 8)
    for (const ind of inds) for (const cc of ccs) {
      const stakes: number[] = []
      const invs: number[] = []
      for (let seed = 1; seed <= Number(process.env.DT_SEEDS ?? 8); seed++) {
        const g = adultIn(cc, 4_000_000, seed * 13)
        const before = g.character.money
        const row = startRow(g, ind)
        if (row.disabledReason?.(g)) continue
        row.run(g)
        drain(g, ['savings', 'seed', 'cofounder', 'me', 'refuse', 'yes'])
        const a = businessAssets(g)[0]
        if (!a) continue
        const lines: string[] = []
        for (let y = 0; y < years; y++) {
          const cur = businessAssets(g)[0]
          if (cur) deepTechManagerTurnImpl(g, cur, bizOf(g, cur))
          ageUp(g)
          drain(g, YEAR_PREFS)
          const c2 = businessAssets(g)[0]
          if (!c2) { lines.push('GONE'); break }
          const b = readBiz(g, c2)
          const t = techView(b)
          lines.push(`y${y}: rev ${(b.last!.revenue / 1e6).toFixed(1)} net ${(b.last!.net / 1e6).toFixed(1)} val ${(b.valuation / 1e6).toFixed(0)} st${t.stage} sh${b.share.toFixed(2)} emp ${b.last!.employees}`)
        }
        const c2 = businessAssets(g)[0]
        const stake = c2 ? c2.value : 0
        stakes.push(stake)
        invs.push(before - g.character.money)
        if (seed <= 2) out.push(`${ind} ${cc} s${seed}: ${lines.join(' | ')}`)
      }
      const avg = stakes.reduce((s, x) => s + x, 0) / Math.max(1, stakes.length)
      const pos = stakes.filter((x, i) => x > invs[i] * 1.5).length
      out.push(`== ${ind} ${cc}: avg stake after ${years}y ${(avg / 1e6).toFixed(1)}M, >1.5x invested in ${pos}/${stakes.length}; median ${(stakes.sort((a, b) => a - b)[Math.floor(stakes.length / 2)] / 1e6).toFixed(1)}M`)
    }
    console.log(out.join('\n'))
  }, 600_000)
})
