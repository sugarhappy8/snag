// Main Character Syndrome has every talent, so every purple hint shows up. They stay honest
// (computed from the model, never a promise), and showing them never changes the game.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { applyFallback } from '../src/game/offline'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import { HINT_EMOJI } from '../src/game/talents'
import type { GameState, MenuNode } from '../src/game/types'

/** Words that would turn a hint into a promise. */
const PROMISE = /guarantee|certain(ly)?\b|for sure|sure thing|surefire|no risk|risk-free|can'?t lose|cannot lose|definitely|always (win|work|pay)|never fails?/i

/** "this is a guide, not a promise" and "gut feelings, not guarantees" are the opposite of a promise. */
const withoutDisclaimers = (h: string) => h.replace(/\b(not|no|isn'?t|never)\s+(a\s+|an\s+)?(sure\s+thing|guarantee\w*|promise\w*|certain\w*)/gi, '')

function hintsOf(g: GameState, nodes: MenuNode[], out: string[], depth = 0): void {
  if (depth > 4) return
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    const h = n.hint?.(g)
    if (typeof h === 'string' && h) out.push(h)
    if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(g)
    if (n.disabledReason) n.disabledReason(g)
    if (n.type === 'menu') hintsOf(g, n.children(g), out, depth + 1)
  }
}

function drain(g: GameState, hints: string[]): void {
  for (let guard = 0; g.queue.length > 0 && guard < 200; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      for (const c of m.choices) if (c.hint) hints.push(c.hint)
      const c = m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    g.queue.unshift(...g.queue.splice(before))
  }
}

describe('purple hints with every talent', () => {
  it('appear across a whole life, are never promises, and reading them never changes the game', () => {
    const seen = new Set<string>()
    let total = 0
    for (const seed of [3, 4, 5]) {
      const g = createNewLife({ seed, year: 2026, talents: ['MainCharacter'] })
      const hints: string[] = []
      drain(g, hints)
      while (g.character.alive && g.character.age < 70) {
        ageUp(g)
        drain(g, hints)
        if (!g.character.alive) break
        const before = JSON.stringify(g)
        const rng = g.rng
        for (const menu of [activitiesMenu, occupationMenu, assetsMenu]) hintsOf(g, menu.children(g), hints)
        for (const p of g.people.filter((x) => x.alive).slice(0, 6)) hintsOf(g, personActions(g, p), hints)
        // Reading menus, subtitles and hints must not write state or draw a random number.
        expect(JSON.stringify(g), `seed ${seed} age ${g.character.age}`).toBe(before)
        expect(g.rng).toBe(rng)
      }
      for (const h of hints) {
        expect(withoutDisclaimers(h), h).not.toMatch(PROMISE)
        expect(h.startsWith(HINT_EMOJI) || h.length > 0).toBe(true)
        seen.add(h.replace(/\d+/g, '#'))
        total++
      }
    }
    // Not vacuous: a main character really does see hints.
    expect(total).toBeGreaterThan(20)
    expect(seen.size).toBeGreaterThan(3)
  }, 300_000)

  it('a life without the talent sees none of them in the same menus', () => {
    const g = createNewLife({ seed: 3, year: 2026 })
    // No gift of any kind: not even the random one a child may discover.
    delete g.flags.latentTalent
    delete g.flags.talentAge
    const hints: string[] = []
    drain(g, hints)
    for (let i = 0; i < 25 && g.character.alive; i++) {
      ageUp(g)
      drain(g, hints)
      if (!g.character.alive) break
      for (const menu of [activitiesMenu, occupationMenu, assetsMenu]) hintsOf(g, menu.children(g), hints)
    }
    expect(hints.filter((h) => h.startsWith(HINT_EMOJI)).length).toBe(0)
  }, 120_000)
})
