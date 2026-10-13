import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { specialJobNodes } from '../src/game/special'
import { propose, resolveBill } from '../src/game/nation/govern'
import { policyOf } from '../src/game/nation/state'
import { economyOf } from '../src/game/economy'
import type { GameState, MenuNode } from '../src/game/types'

function leader(country = 'us', year = 2000): GameState {
  const g = createNewLife({ countryId: country, year: year - 50, seed: 7 })
  g.character.age = 50
  g.year = year
  g.character.money = 5_000_000
  g.character.job = { defId: 'politician', title: 'President', company: 'United States', category: 'special', salary: 400_000, level: 3, performance: 60, yearsInRole: 0, yearsAtCompany: 0,
    data: { office: 'leader', party: 'progressive', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 50, roleStartAge: 50 } }
  g.queue = []
  return g
}

function walk(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'menu' && (!n.visible || n.visible(g)) && depth < 5) { out.push(n.id); walk(g, n.children(g), depth + 1, out) }
    else if (n.type === 'action') { out.push(n.id); if (n.subtitle && typeof n.subtitle === 'function') n.subtitle(g); if (n.disabledReason) n.disabledReason(g); if (n.input?.preview) n.input.preview(g, n.input.min ?? 0) }
    else if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
  }
  return out
}

describe('nation smoke', () => {
  it('renders menus purely and enacts a tax', () => {
    const g = leader()
    const before = JSON.stringify(g)
    const ids = walk(g, specialJobNodes(g))
    expect(JSON.stringify(g)).toBe(before)
    expect(ids.some(x => x.includes('nation.tax'))).toBe(true)
    const ok = resolveBill(g, { k: 'tax', scope: 'national', id: 'corporate', value: 5 }, 'whip')
    console.log('passed?', ok, g.queue.map(m => m.kind === 'notice' ? m.text : m.kind).join(' | '))
    if (ok) expect(policyOf(g, 'us').national.taxes.corporate).toBe(5)
    for (let i = 0; i < 6; i++) {
      g.queue = []
      ageUp(g)
      while (g.queue.length) {
        const m = g.queue.shift()!
        if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
        if (m.kind === 'minigame') runScript(g, m.scriptId, 'ok', m.data, m)
      }
      const e = economyOf(g)
      console.log(g.year, g.character.job?.title, (g.character.job?.data as { approval?: number })?.approval, e.growth.toFixed(3), e.governmentDebt.toFixed(2), policyOf(g, 'us').rating)
    }
    propose(g, { k: 'tariff', input: 'industry', partner: 'cn', add: 25 })
    console.log(g.queue.map(m => m.kind === 'choice' ? m.text + ' ## ' + m.choices.map(c => c.label).join(' / ') : m.kind).join('\n'))
  })
})
