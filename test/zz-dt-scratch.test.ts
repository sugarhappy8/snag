import { it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu } from '../src/game/business'
import { bizOf, businessAssets } from '../src/game/business/state'
import { techView } from '../src/game/business/deeptech-core'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { stageName } from '../src/game/business/deeptech-data'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { DEEP_TECH_IDS } from '../src/game/data/markets'

function adultIn(countryId: string, money: number, seed = 3): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = 90
  c.licenses = ['driver']
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
const find = (nodes: MenuNode[], id: string) => nodes.find((n) => n.id === id)

it('calibrate', () => {
  const out: string[] = []
  for (const cc of ["us", "tw", "ng"]) for (const ind of DEEP_TECH_IDS) for (const seed of [3, 7]) {
    const g = adultIn(cc, 3_000_000, seed)
    const start = find(businessCareerMenu.children(g), 'biz.start')
    if (!start || start.type !== 'menu') throw new Error('no start')
    const row = find(start.children(g), `biz.start.${ind}`)
    if (!row || row.type !== 'action') throw new Error('no row')
    const why = row.disabledReason?.(g)
    if (why) { out.push(`${cc} ${ind}: blocked ${why}`); continue }
    row.run(g)
    drain(g, ['savings', 'seed', 'me', 'pay', 'cofounder'])
    const line: string[] = []
    for (let y = 0; y < 16 && g.character.alive; y++) {
      const a = businessAssets(g)[0]
      if (!a) { line.push(`y${y}:GONE`); break }
      deepTechManagerTurnImpl(g, a, bizOf(g, a))
      ageUp(g)
      drain(g, ['sign', 'savings', 'pay', 'decline', 'patch', 'recall', 'license', 'help', 'disclose', 'fix', 'investor', 'loan'])
      const a2 = businessAssets(g)[0]
      if (!a2) { line.push(`y${y}:GONE`); break }
      const b = bizOf(g, a2)
      const t = techView(b)
      if (y % 3 === 2 || y === 15) line.push(`y${y}:${t.stage}/${Math.round(t.level)} rev ${(b.last!.revenue/1e6).toFixed(1)}M net ${(b.last!.net/1e6).toFixed(1)}M val ${(b.valuation/1e6).toFixed(0)}M sh ${(b.share*100).toFixed(0)}% ven ${(t.venture/1e6).toFixed(1)}M ${t.series}`)
    }
    const a = businessAssets(g)[0]
    out.push(`${cc} ${ind} s${seed} money ${(g.character.money/1e6).toFixed(2)}M ${a ? stageName(ind, techView(bizOf(g, a)).stage) : 'gone'} | ${line.join(' | ')}`)
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/calib.txt', out.join('\n'))
}, 600_000)
