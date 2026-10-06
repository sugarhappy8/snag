import { it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu } from '../src/game/business'
import { bizOf, businessAssets } from '../src/game/business/state'
import { techView } from '../src/game/business/deeptech-core'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

it('space', () => {
  const g = createNewLife({ seed: 3, year: 2000, countryId: 'us' })
  g.queue = []
  g.character.age = 30; g.character.money = 3_000_000; g.character.city = getCountry('us').cities[0]; g.character.stats.smarts = 90
  const find = (nodes: MenuNode[], id: string) => nodes.find((n) => n.id === id)
  const start = find(businessCareerMenu.children(g), 'biz.start') as any
  const row = find(start.children(g), 'biz.start.spaceTech') as any
  row.run(g)
  const log: string[] = []
  const drain = () => { for (let i = 0; g.queue.length && i < 100; i++) { const m = g.queue.shift()!; const before = g.queue.length
    if (m.kind === 'choice') { log.push(`CHOICE ${m.title}: ${m.choices.map(c=>c.id).join(',')}`); const ch = m.choices.find(c => ['savings','seed','me','sign','decline'].includes(c.id)) ?? m.choices[0]; if (m.source==='script') runScript(g, m.scriptId!, ch.id, m.data, m); else applyFallback(g, {type:'resolveChoice', event: m, choiceId: ch.id}) }
    else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'X', m.data, m)
    else if (m.kind === 'notice') log.push(`NOTICE ${m.title}: ${m.text.slice(0, 200)}`)
    else if (m.kind === 'minigame') { log.push('MINIGAME'); runScript(g, m.scriptId, 'skip', m.data, m) }
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    g.queue.unshift(...g.queue.splice(before)) } }
  drain()
  const a = businessAssets(g)[0]
  const b = bizOf(g, a)
  log.push(`after found: cash ${b.cash} venture ${techView(b).venture} share ${b.share} val ${b.valuation} salary ${b.ownerSalary}`)
  ageUp(g)
  const a2 = businessAssets(g)[0]
  if (a2) { const b2 = bizOf(g, a2); log.push(`y1: cash ${b2.cash} venture ${techView(b2).venture} net ${b2.last?.net} stmt ${JSON.stringify(b2.last)}`) }
  drain()
  require('fs').writeFileSync('/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/space.txt', log.join('\n'))
})
