import { expect, test } from 'vitest'
import { ageUp } from '../src/game/aging'
import { applyFallback } from '../src/ai/director'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import { buySecurity, investmentHoldings, investmentListing, investmentsSummary } from '../src/game/investments'
import { assetsMenu } from '../src/game/menus'
import type { GameState } from '../src/game/types'
function drain(g: GameState) {
  for (let i = 0; g.queue.length && i < 300; i++) {
    const m = g.queue.shift()!
    if (m.kind === 'choice') { if (m.source === 'script') runScript(g, m.scriptId!, m.choices[0].id, m.data, m); else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: m.choices[0].id }) }
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'number' ? String(m.min ?? 1) : 'x', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
  }
}
test('integration through ageUp', () => {
  for (const countryId of ['jp', 'us', 'tr', 'sa', 'ws']) {
    for (const seed of [3, 17, 58]) { const g = createNewLife({ countryId, seed, year: 2026 })
    while (g.character.alive && g.character.age < 25) { drain(g); ageUp(g) }
    drain(g)
    if (!g.character.alive || g.character.prison) { console.log(countryId, seed, "skipped"); continue }
    g.character.money += 200_000
    for (const t of ["index", "stock", "bond", "savings"]) { const ok = buySecurity(g, investmentListing(g).find(q => q.type === t)!.secId, 20_000); if (!ok) console.log("FAIL", countryId, t, g.character.age, g.character.money, g.character.prison, JSON.stringify(g.queue.slice(-1))) }
    drain(g)
    expect(investmentHoldings(g).length).toBe(4)
    const node = assetsMenu.children(g).find(n => n.id === 'investments')
    expect(node).toBeTruthy()
    drain(g); ageUp(g)
    const taxed = g.flags.taxableIncome as number
    expect(taxed).toBeGreaterThan(0)
    for (let i = 0; i < 30 && g.character.alive; i++) { drain(g); ageUp(g) }
    console.log(countryId, seed, g.character.age, g.character.alive, investmentsSummary(g), g.character.money) }
  }
})
