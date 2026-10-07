import { expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { emigrateMenu } from '../src/game/activities/emigrate'
import { visaLockView } from '../src/game/activities/immigration-lock'
import { lockAssets } from '../src/game/activities/immigration-move'
import { citizenshipsOf, statusOf } from '../src/game/activities/immigration-state'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

function walk(g: GameState, nodes: MenuNode[], depth: number, out: MenuAction[], texts: string[], rnd: () => number): void {
  if (depth > 3) return
  for (const n of nodes) {
    if (n.type === 'heading') { texts.push(n.label); continue }
    if (n.type === 'info') { texts.push(typeof n.text === 'string' ? n.text : n.text(g)); continue }
    if (n.visible && !n.visible(g)) continue
    texts.push(n.label)
    const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
    if (sub) texts.push(sub)
    const hint = n.hint?.(g)
    if (hint) texts.push(hint)
    const dis = n.disabledReason?.(g)
    if (dis) { texts.push(dis); continue }
    if (n.type === 'action') {
      const c = n.confirm?.(g)
      if (c) texts.push(c)
      out.push(n)
    } else {
      if (n.header) texts.push(n.header(g))
      // Only open some continents/countries to keep it quick.
      if (depth >= 1 && n.id.startsWith('emigrate.') && rnd() > 0.25) continue
      walk(g, n.children(g), depth + 1, out, texts, rnd)
    }
  }
}

// Random lives that keep emigrating (legally, illegally, by escape) across eras: no crashes, no
// NaN or undefined in the copy, plain JSON, a consistent status record and at least one passport.
it('keeps random emigrating lives consistent across eras', () => {
  const bad: string[] = []
  const lives: [string, number][] = [['pl', 1950], ['es', 1960], ['ng', 1985], ['in', 1975], ['mx', 1980], ['ru', 1960], ['cu', 1950], ['sy', 1990], ['cn', 1990], ['us', 1995], ['it', 1900], ['tr', 1950]]
  let moves = 0
  for (const [country, year] of lives) {
    for (let seed = 1; seed <= 1; seed++) {
      let s = seed * 7919 + year
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
      const g = createNewLife({ seed: seed * 31 + year, year, countryId: country })
      const texts: string[] = []
      const drain = () => {
        for (let guard = 0; g.queue.length && guard < 300; guard++) {
          const m = g.queue.shift()!
          const before = g.queue.length
          if (m.kind === 'notice') texts.push(m.text)
          if (m.kind === 'choice') {
            texts.push(m.text, ...m.choices.map((c) => c.label), ...m.choices.map((c) => c.hint ?? ''))
            const c = pick(m.choices)
            if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
            else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
          }
          if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'number' ? String(m.min ?? 10) : (m.defaultValue || 'Alex'), m.data, m)
          if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : m.game === 'burglary' ? JSON.stringify({ loot: 100, caught: false }) : 'done', m.data, m)
          if (m.kind === 'aiTask') applyFallback(g, m.task)
          g.queue.unshift(...g.queue.splice(before))
        }
      }
      drain()
      while (g.character.alive && g.character.age < 75) {
        if (g.character.age === 22 && rnd() < 0.5) g.character.money += Math.round(rnd() * 4_000_000)
        if (g.character.age >= 18 && !g.character.prison && rnd() < 0.6) {
          const acts: MenuAction[] = []
          if (!emigrateMenu.disabledReason?.(g)) walk(g, emigrateMenu.children(g), 0, acts, texts, rnd)
          for (const a of g.assets.filter((x) => x.details.category === 'immigration')) walk(g, visaLockView(g, a), 0, acts, texts, rnd)
          if (acts.length && rnd() < 0.7) {
            const a = pick(acts)
            const cid = g.character.countryId
            a.run(g)
            drain()
            if (g.character.countryId !== cid) moves++
          }
        }
        ageUp(g)
        drain()
        const c = g.character
        if (!Number.isFinite(c.money)) bad.push(`${country} ${year} ${seed}: money ${c.money}`)
        if (!citizenshipsOf(g).length) bad.push(`${country} ${year} ${seed}: stateless`)
        if (c.immigration && c.immigration.countryId !== c.countryId) bad.push(`${country} ${year} ${seed}: status for ${c.immigration.countryId} in ${c.countryId}`)
        if (c.immigration && citizenshipsOf(g).includes(c.countryId)) bad.push(`${country} ${year} ${seed}: citizen with a status record ${JSON.stringify(c.immigration)}`)
        for (const a of lockAssets(g)) if (!Number.isFinite(a.value) || a.value < 0) bad.push(`${country} ${year} ${seed}: lock ${a.value}`)
        statusOf(g)
      }
      for (const y of g.log) for (const e of y.entries) texts.push(e.text)
      for (const t of texts) if (/undefined|NaN|\[object|null\b/.test(t)) bad.push(`${country} ${year} ${seed}: ${t.slice(0, 200)}`)
      expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    }
  }
  expect(moves).toBeGreaterThan(10)
  expect(bad).toEqual([])
}, 180_000)
