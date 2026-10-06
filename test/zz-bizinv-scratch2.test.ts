import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { startFounding } from '../src/game/business/founding'
import { startGreenlight, studioAssets, studioInternals } from '../src/game/business/gamestudio'
import { businessView } from '../src/game/business/manage'
import { bizOf, readBiz } from '../src/game/business/state'
import { addCodingSkill } from '../src/game/computer/skills'
import { runScript } from '../src/game/scripts'
import { gdMut } from '../src/game/special/gamedev-state'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import '../src/game/menus'
import { makeTestGame } from './helpers'

const seen: string[] = []
function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 400) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const h = m.choices.find((c) => c.hint)
      if (h) seen.push(`${m.title} -> ${h.id}: ${h.hint}`)
      const ch = h ?? m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Test Game', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}
function all(g: GameState, nodes: MenuNode[], d = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'menu' && d < 4) try { out.push(...all(g, n.children(g), d + 1)) } catch { /* */ }
  }
  return out
}

describe('studio talent', () => {
  for (const cid of ['us', 'jp', 'kr', 'br']) it(`studio in ${cid}`, () => {
    const g = makeTestGame(7, { age: 30, countryId: cid, money: 5_000_000, talents: ['Business'] })
    g.lifeId = `st-${cid}`
    g.character.city = getCountry(cid).cities[0]
    g.assets.push({ id: 'lap', kind: 'other', name: 'Laptop', emoji: 'x', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: 30, upkeep: 0, details: { category: 'electronics' } })
    addCodingSkill(g, 60)
    gdMut(g).design = 60
    startFounding(g, 'gameStudio')
    drain(g, ['city0', 'savings', 'me'])
    const a = studioAssets(g)[0] as Asset
    const b = bizOf(g, a)
    b.cash = 2_000_000
    studioInternals.hireDevs(g, a, b, 25)
    g.queue = []
    let t = performance.now()
    startGreenlight(g, a.id)
    drain(g)
    console.log(cid, 'greenlight ms', Math.round(performance.now() - t))
    for (let y = 0; y < 12; y++) {
      ageUp(g)
      drain(g)
      const cur = studioAssets(g)[0]
      if (!cur) break
      t = performance.now()
      const nodes = all(g, businessView(g, cur))
      const hs = nodes.map((n) => (n.type === 'menu' || n.type === 'action' ? n.hint?.(g) ?? '' : '')).filter(Boolean)
      for (const h of hs) expect(h).not.toMatch(/NaN|undefined|Infinity/)
      if (y % 4 === 0) console.log(cid, 'y', y, 'menu ms', Math.round(performance.now() - t), hs.slice(0, 6).join(' | '))
      const bb = readBiz(g, cur)
      expect(Number.isFinite(bb.cash)).toBe(true)
    }
    console.log(seen.slice(-12).join('\n'))
    seen.length = 0
  }, 120_000)
})
