import { describe, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu } from '../src/game/business'
import { techOf, techView } from '../src/game/business/deeptech-core'
import { PROGRAMS } from '../src/game/business/deeptech-data'
import { startProgram } from '../src/game/business/deeptech-rd'
import { sellBusiness } from '../src/game/business/exit'
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

describe('probe', () => {
  it('seed -> R&D -> sell loop', () => {
    const rows: string[] = []
    for (const ind of ['software', 'ecommerce', 'marketing', 'cybersecurity']) {
      for (const cc of ['us']) {
        let total = 0
        let n = 0
        for (let seed = 1; seed <= 12; seed++) {
          const g = adultIn(cc, 6_000_000, seed * 7)
          const before = g.character.money
          const row = startRow(g, ind)
          if (row.disabledReason?.(g)) continue
          row.run(g)
          drain(g, ['loan', 'seed', 'cofounder', 'me', 'refuse', 'yes'])
          const a = businessAssets(g)[0]
          if (!a) continue
          for (let y = 0; y < 3; y++) {
            const b = bizOf(g, a)
            const t = techOf(b)
            t.pace = 'blitz'
            if (PROGRAMS[ind as 'aiLab']) for (const def of PROGRAMS[ind as 'aiLab']) startProgram(g, b, t, def)
            b.ownerSalary = 0
            ageUp(g)
            drain(g, ['blitz', 'decline', 'closed', 'sign', 'let', 'settle'])
            if (!businessAssets(g)[0]) break
          }
          const left = businessAssets(g)[0]
          if (!left) {
            total += g.character.money - before
            n++
            continue
          }
          const b = readBiz(g, left)
          const t = techView(b)
          const val = b.valuation
          sellBusiness(g, left, bizOf(g, left), Math.round(val * 1.28), 'buyer')
          drain(g)
          const loans = g.character.loans.reduce((s, l) => s + l.balance, 0)
          total += g.character.money - loans - before
          n++
          if (seed <= 2) rows.push(`   hist: ${b.history.map((h) => `${h.year}: rev ${Math.round(h.revenue / 1e5) / 10}M profit ${Math.round(h.profit / 1e5) / 10}M`).join(' | ')} stage ${t.stage} level ${t.level} hype ${t.hype} invested ${Math.round(b.invested/1e5)/10}M`)
          if (seed <= 2) rows.push(`${ind} ${cc} s${seed}: val ${Math.round(val / 1e6)}M share ${b.share} raised ${Math.round(t.raised / 1e6)}M venture ${Math.round(t.venture / 1e6)}M ip ${Math.round(t.ipBook / 1e6)}M value ${Math.round(t.value / 1e6)}M net ${Math.round((g.character.money - loans - before) / 1e6)}M`)
        }
        rows.push(`== ${ind} ${cc}: avg net after 3y + sale at 1.28x = ${Math.round(total / Math.max(1, n) / 1e6 * 100) / 100}M (n=${n})`)
      }
    }
    console.log(rows.join('\n'))
  }, 300_000)
})
