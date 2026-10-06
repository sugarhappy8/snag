import { it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { sportsCareerMenu, sportsJobNodes, yearlySports } from '../src/game/special/sports'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'
const OUT = '/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/copy.txt'
const fs = require('fs')
function find(g: GameState, nodes: MenuNode[], id: string, d = 0): MenuAction | undefined {
  if (d > 7) return
  for (const n of nodes) { if (n.type === 'action' && n.id === id) return n; if (n.type === 'menu') { const h = find(g, n.children(g), id, d + 1); if (h) return h } }
}
function drain(g: GameState, pick: (m: any) => string | undefined = () => undefined) {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!; const before = g.queue.length
    if (m.kind === 'notice') fs.appendFileSync(OUT, `[${m.title}] ${m.text}\n`)
    if (m.kind === 'choice') { fs.appendFileSync(OUT, `<${m.title}> ${m.text} :: ${m.choices.map((c) => c.label).join(' | ')}\n`); const id = pick(m) ?? m.choices[0].id; runScript(g, m.scriptId!, id, m.data, m) }
    g.queue.unshift(...g.queue.splice(before))
  }
}
function next(g: GameState) { g.character.age++; g.year++; g.yearActions = {}; g.log.push({ age: g.character.age, year: g.year, entries: [] }) }
it('dumps copy', () => {
  fs.writeFileSync(OUT, '')
  const g = makeTestGame(4, { age: 18, countryId: 'br', city: 'Rio de Janeiro' })
  g.character.hidden.athleticism = 90; g.character.money = 50000
  find(g, [sportsCareerMenu], 'sports.mma.gym')!.run(g); drain(g, () => '1')
  const p = g.flags['special.sports.fight'] as any; p.striking = 80; p.grappling = 80; p.cardio = 80
  for (let i = 0; i < 3; i++) { find(g, [sportsCareerMenu], 'sports.mma.amateur')!.run(g); drain(g, (m) => m.scriptId === 'sports.fight.round' ? ['strike','grapple','sub','defend','taunt'][i % 5] : undefined) }
  find(g, [sportsCareerMenu], 'sports.mma.turnPro')!.run(g); drain(g, (m) => m.choices.find((c: any) => /natural/.test(c.label))?.id)
  for (let i = 0; i < 3; i++) { find(g, sportsJobNodes(g), 'sports.fight.go')!.run(g); drain(g, (m) => m.scriptId === 'sports.fight.round' ? 'strike' : m.scriptId === 'sports.fight.presser' ? 'trash' : undefined) }
  next(g); yearlySports(g); drain(g)
  fs.appendFileSync(OUT, '\n===== TENNIS\n')
  const t = makeTestGame(9, { age: 18, countryId: 'es', city: 'Madrid' })
  t.character.money = 100000
  find(t, [sportsCareerMenu], 'sports.ind.tennis.practice')!.run(t); drain(t)
  const ind = t.flags['special.sports.ind'] as any; for (const k of Object.keys(ind.sports.tennis.attrs)) ind.sports.tennis.attrs[k] = 75
  find(t, [sportsCareerMenu], 'sports.ind.tennis.pro')!.run(t); drain(t)
  for (let i = 0; i < 3; i++) { find(t, sportsJobNodes(t), 'sports.ind.compete')!.run(t); drain(t, (m) => m.scriptId === 'sports.ind.enter' ? m.choices[0].id : 'attack') }
  next(t); yearlySports(t); drain(t)
  fs.appendFileSync(OUT, '\n===== SUMO\n')
  const s = makeTestGame(2, { age: 16, countryId: 'jp', city: 'Osaka', gender: 'male' })
  find(s, [sportsCareerMenu], 'sports.sumo.join')!.run(s); drain(s)
  next(s); yearlySports(s); drain(s)
  fs.appendFileSync(OUT, '\n===== YOUTH\n')
  const y = makeTestGame(3, { age: 9, countryId: 'th', city: 'Bangkok' })
  y.character.money = 20000
  find(y, [sportsCareerMenu], 'sports.youth.join.combat')!.run(y); drain(y)
  find(y, [sportsCareerMenu], 'sports.youth.train')!.run(y); drain(y)
  find(y, [sportsCareerMenu], 'sports.youth.compete')!.run(y); drain(y)
})
