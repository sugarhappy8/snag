import { it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { disciplineMenu } from '../src/game/special/sports-fight'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function find(g: GameState, nodes: MenuNode[], id: string): MenuAction | undefined {
  for (const n of nodes) {
    if (n.type === 'action' && n.id === id) return n
    if (n.type === 'menu') { const h = find(g, n.children(g), id); if (h) return h }
  }
}

it('calibrates fights', () => {
  for (const disc of ['mma', 'boxing', 'kickboxing', 'muaythai'] as const) {
    const stats = { win: 0, loss: 0, draw: 0, ko: 0, tko: 0, sub: 0, dec: 0, n: 0, rounds: 0 }
    for (let seed = 1; seed <= 600; seed++) {
      const g = makeTestGame(seed, { age: 22 })
      g.character.hidden.athleticism = 60
      const menu = disciplineMenu(disc)
      const a = find(g, [menu], `sports.${disc}.amateur`)!
      a.run(g)
      let guard = 0
      while (g.queue.length && guard++ < 50) {
        const m = g.queue.shift()!
        const before = g.queue.length
        if (m.kind === 'choice') {
          const ch = m.title === 'Amateur Bout' ? m.choices[seed % 2].id : m.choices[[0,0,1,1,2,0,1,0,2,3][(seed * 7 + guard) % 10] % m.choices.length].id
          if (/^Round/.test(m.title)) stats.rounds++
          if (m.title === 'Amateur Bout') { const me = Number(/level: (\d+)/.exec(m.text)![1]); const o = (m.data as any).offers[seed % 2].opp; (stats as any).diff = ((stats as any).diff ?? 0) + (o.rating - me); (stats as any).os = ((stats as any).os ?? 0) + o.s; (stats as any).og = ((stats as any).og ?? 0) + o.g; (stats as any).oc = ((stats as any).oc ?? 0) + o.c; (stats as any).oiq = ((stats as any).oiq ?? 0) + o.iq; (stats as any).me = ((stats as any).me ?? 0) + me }
          runScript(g, m.scriptId!, ch, m.data, m)
        } else if (m.kind === 'notice') {
          if (/Victory|Defeat|Draw/.test(m.title)) {
            stats.n++
            if (m.title === 'Victory!') stats.win++
            else if (m.title === 'Defeat') stats.loss++
            else stats.draw++
            if (/by KO/.test(m.text)) stats.ko++
            else if (/by TKO/.test(m.text)) stats.tko++
            else if (/by submission/.test(m.text)) stats.sub++
            else stats.dec++
          }
        }
        g.queue.unshift(...g.queue.splice(before))
      }
    }
    require('fs').appendFileSync('/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/calib.txt', disc + ' ' + JSON.stringify(stats) + '\n')
  }
})
