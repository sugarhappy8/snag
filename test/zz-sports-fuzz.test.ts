import { it, expect } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { sportsCareerMenu, sportsJobNodes } from '../src/game/special/sports'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 } }
function collect(g: GameState, nodes: MenuNode[], out: MenuAction[] = [], d = 0): MenuAction[] {
  if (d > 7) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action') out.push(n); else collect(g, n.children(g), out, d + 1)
  }
  return out
}
function drain(g: GameState, r: () => number) {
  for (let guard = 0; g.queue.length; guard++) {
    if (guard > 400) throw new Error('stuck ' + JSON.stringify(g.queue[0]).slice(0, 200))
    const m = g.queue.shift()!; const before = g.queue.length
    if (m.kind === 'choice') { const c = m.choices[Math.floor(r() * m.choices.length)]; if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m); else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id }) }
    else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Ace', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    g.queue.unshift(...g.queue.splice(before))
  }
}
it('fuzzes sports lives', () => {
  const countries = ['us', 'br', 'jp', 'th', 'in', 'gb', 'mx', 'ch', 'au', 'kr', 'ng', 'de']
  for (let seed = 1; seed <= 36; seed++) {
    const r = rng(seed * 101)
    const g = createNewLife({ seed, year: 2026, countryId: countries[seed % countries.length] })
    const trail: string[] = []
    try {
      drain(g, r)
      g.character.hidden.athleticism = 40 + Math.floor(r() * 60)
      g.character.money += 50000
      while (g.character.alive && g.character.age < 90) {
        for (let i = 0; i < 6 && g.character.alive; i++) {
          const pool = [...collect(g, [sportsCareerMenu]), ...collect(g, sportsJobNodes(g))]
          if (!pool.length) break
          const a = pool[Math.floor(r() * pool.length)]
          trail.push(`${g.character.age} ${a.id}`)
          a.run(g, a.input ? '100' : undefined)
          drain(g, r)
        }
        ageUp(g); drain(g, r)
        expect(Number.isFinite(g.character.money)).toBe(true)
        const js = JSON.stringify(g)
        expect(js.includes('NaN')).toBe(false)
        expect(JSON.stringify(JSON.parse(js))).toBe(js)
      }
    } catch (e) {
      throw new Error(`seed ${seed}: ${(e as Error).stack}\n${trail.slice(-12).join('\n')}`)
    }
  }
}, 600000)
