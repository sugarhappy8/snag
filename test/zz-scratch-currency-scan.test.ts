import { it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { setMoneyDisplay } from '../src/game/core'
import '../src/game/data/currencies'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

function collect(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    try {
      if (n.type === 'info' || n.type === 'heading') continue
      if (n.visible && !n.visible(g)) continue
      if (n.disabledReason && n.disabledReason(g)) continue
      if (n.type === 'action' && n.id === 'surrenderLife') continue
      if (n.type === 'action') out.push(n)
      else collect(g, n.children(g), depth + 1, out)
    } catch { /* others' WIP */ }
  }
  return out
}
function texts(g: GameState, sink: Set<string>) {
  for (const y of g.log) for (const e of y.entries) sink.add(e.text)
}
it('scans texts for dollar amounts in non-dollar lives', () => {
  setMoneyDisplay({ mode: 'local', nominal: true })
  const found = new Map<string, string>()
  const errors: string[] = []
  for (const [country, year] of [['jp', 1975], ['de', 1985], ['id', 2010], ['br', 1990], ['gb', 1960], ['in', 2000]] as const) {
    for (let seed = 1; seed <= 6; seed++) {
      let s = seed * 9973
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
      const g = createNewLife({ seed, year, countryId: country })
      const sink = new Set<string>()
      const seen = new Set<string>()
      const flush = () => {
        for (const t of sink) {
          if (seen.has(t)) continue
          seen.add(t)
          if (g.character.countryId === 'us' || g.character.countryId === 'ec' || g.character.countryId === 'sv' || g.character.countryId === 'pr' || g.character.countryId === 'pa') continue
          if (/(^|[^A-Za-z$])\$\d/.test(t) && !/\$[A-Z]{2,}/.test(t)) found.set(t, `${country}->${g.character.countryId} ${g.year}`)
        }
        sink.clear()
      }
      const drain = () => {
        for (let guard = 0; g.queue.length && guard < 300; guard++) {
          const m = g.queue.shift()!
          const before = g.queue.length
          if (m.kind === 'notice') sink.add(m.text)
          if (m.kind === 'choice') { sink.add(m.text); for (const c of m.choices) sink.add(c.label); const c = pick(m.choices); if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m); else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id }) }
          if (m.kind === 'input') { sink.add(m.text); runScript(g, m.scriptId, m.input === 'number' ? String(m.min ?? 10) : (m.defaultValue || 'Alex'), m.data, m) }
          if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : m.game === 'burglary' ? JSON.stringify({ loot: 100, caught: false }) : 'done', m.data, m)
          if (m.kind === 'aiTask') applyFallback(g, m.task)
          g.queue.unshift(...g.queue.splice(before))
        }
      }
      try {
        drain()
        while (g.character.alive && g.character.age < 70) {
          for (let i = 0; i < 4; i++) {
            const menu = pick([activitiesMenu, occupationMenu, assetsMenu, activitiesMenu])
            const opts = collect(g, menu.children(g))
            const living = g.people.filter((p) => p.alive)
            if (rnd() < 0.3 && living.length) opts.push(...collect(g, personActions(g, pick(living))))
            if (!opts.length) continue
            const a = pick(opts)
            for (const n of collect(g, [a])) {
              const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
              if (sub) sink.add(sub)
              sink.add(n.label)
            }
            a.run(g, a.input ? (a.input.kind === 'number' ? String(a.input.min ?? 10) : 'Alex') : undefined)
            drain()
            texts(g, sink)
            flush()
          }
          ageUp(g)
          drain()
          texts(g, sink)
          flush()
        }
      } catch (err) {
        errors.push(`${country} ${seed}: ${String(err).slice(0, 80)}`)
      }

    }
  }
  console.log('ERRORS', errors.length, errors.slice(0, 5))
  console.log('FOUND', found.size)
  for (const [t, c] of [...found].slice(0, 60)) console.log(c, '|', t.slice(0, 220))
})
