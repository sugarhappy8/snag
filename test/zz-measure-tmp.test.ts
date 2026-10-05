import { it } from 'vitest'
import { applyFallback, planYear } from '../src/ai/director'
import { narratorSystem, yearEventsPrompt, resolveChoicePrompt, customActionPrompt, gameContext } from '../src/ai/prompts'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { GameState } from '../src/game/types'
import { DEFAULT_SETTINGS } from '../src/settings'

function drain(g: GameState) {
  for (let i = 0; g.queue.length && i < 300; i++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') { if (m.source === 'script') runScript(g, m.scriptId!, m.choices[0].id, m.data, m); else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: m.choices[0].id }) }
    else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Alex', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before); g.queue.unshift(...added)
  }
}
it('measure', () => {
  const rows: string[] = []
  for (const [country, age] of [['us', 8], ['id', 15], ['et', 30], ['jp', 45], ['br', 70]] as const) {
    const g = createNewLife({ seed: 42, year: 2026, countryId: country })
    drain(g)
    while (g.character.alive && g.character.age < age) { ageUp(g); drain(g) }
    const sys = narratorSystem(DEFAULT_SETTINGS)
    const p = yearEventsPrompt(g, { ...planYear(g), wantEvent: true })
    rows.push(`${country} age ${g.character.age}: system ${sys.length} chars, year ${p.length} chars, total ~${Math.ceil((sys.length + p.length) / 4)} tok; ctx ${gameContext(g).length}`)
  }
  console.log(rows.join('\n'))
})
