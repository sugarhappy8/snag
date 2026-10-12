// Plays many complete random lives through the real engine (AI off → offline fallbacks),
// tapping random menu actions and person interactions every year and answering every popup.
// Catches crashes, stuck queues and broken invariants across all modules at once.
import { afterAll, describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { continueAsChild, createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { hasScript, runScript } from '../src/game/scripts'
import { STAT_KEYS, type AnnualReportData, type GameState, type MenuAction, type MenuNode, type MinigameModal, type ModalItem } from '../src/game/types'

/** Tiny driver RNG, separate from the game's so the driver doesn't depend on engine rolls. */
function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Driver = ReturnType<typeof driver>

const TEXT_INPUTS = ['Go for a long run', 'Write a song about my cat', 'Steal a candy bar', 'Ask my boss for a raise', 'Alex']

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
      return 'done'
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 5000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport': {
      if (d.next() < 0.2) return 'skip'
      const r = m.data as unknown as AnnualReportData
      return JSON.stringify({ price: d.int(r.minPrice, r.maxPrice), production: d.int(0, r.maxProduction) })
    }
  }
}

function inputValue(m: Extract<ModalItem, { kind: 'input' }>, d: Driver): string {
  if (m.input === 'number') {
    const lo = m.min ?? 1
    const hi = Math.min(m.max ?? lo + 1000, lo + 100000)
    return String(d.int(lo, Math.max(lo, hi)))
  }
  return m.defaultValue || d.pick(TEXT_INPUTS)
}

/** Resolve the whole modal queue the way the store does (follow-ups jump to the front). */
function drain(g: GameState, d: Driver, trail: string[]): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    switch (m.kind) {
      case 'notice':
        break
      case 'choice': {
        expect(m.choices.length, `choice "${m.title}" has no options`).toBeGreaterThan(0)
        const choice = d.pick(m.choices)
        trail.push(`choice ${m.title} -> ${choice.label}`)
        if (m.source === 'script') {
          expect(hasScript(m.scriptId!), `missing script handler "${m.scriptId}" for choice "${m.title}"`).toBe(true)
          runScript(g, m.scriptId!, choice.id, m.data, m)
        }
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        break
      }
      case 'input':
        trail.push(`input ${m.title}`)
        expect(hasScript(m.scriptId), `missing script handler "${m.scriptId}" for input "${m.title}"`).toBe(true)
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        trail.push(`minigame ${m.game}`)
        expect(hasScript(m.scriptId), `missing script handler "${m.scriptId}" for minigame "${m.title}"`).toBe(true)
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        trail.push(`ai ${m.task.type}`)
        applyFallback(g, m.task)
        break
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

/** All runnable actions reachable from a menu node (depth-limited). */
function collectActions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    // A random player shouldn't simply give up: Surrender ends the life on the spot.
    if (n.type === 'action' && n.id === 'surrenderLife') continue
    if (n.type === 'action') out.push(n)
    else collectActions(g, n.children(g), depth + 1, out)
  }
  return out
}

function checkInvariants(g: GameState): void {
  const c = g.character
  for (const k of STAT_KEYS) {
    expect(c.stats[k]).toBeGreaterThanOrEqual(0)
    expect(c.stats[k]).toBeLessThanOrEqual(100)
  }
  expect(Number.isFinite(c.money), 'money is finite').toBe(true)
  expect(Number.isFinite(netWorth(g)), 'net worth is finite').toBe(true)
  const ids = g.people.map((p) => p.id)
  expect(new Set(ids).size, 'person ids are unique').toBe(ids.length)
  for (const p of g.people) {
    expect(Number.isFinite(p.age) && p.age >= 0, `person age ${p.age}`).toBe(true)
    expect(p.relationship).toBeGreaterThanOrEqual(0)
    expect(p.relationship).toBeLessThanOrEqual(100)
  }
  // Must survive a save/load round trip unchanged.
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

interface LifeResult {
  age: number
  cause: string
  ribbon: string | null
  netWorth: number
  actions: number
}

function playLife(seed: number, actionsPerYear: number): { g: GameState; result: LifeResult } {
  const d = driver(seed * 7919)
  const trail: string[] = []
  let g = createNewLife({ seed, year: 2026 })
  let actions = 0
  try {
    drain(g, d, trail)
    checkInvariants(g)
    while (g.character.alive) {
      if (g.character.age > 125) throw new Error('character never dies')
      const n = d.int(0, actionsPerYear)
      for (let i = 0; i < n && g.character.alive; i++) {
        const roll = d.next()
        let action: MenuAction | undefined
        if (roll < 0.25) {
          const living = g.people.filter((p) => p.alive)
          const person = living.length ? d.pick(living) : undefined
          if (person) action = d.pick([undefined, ...collectActions(g, personActions(g, person))])
        } else {
          const menu = d.pick([activitiesMenu, activitiesMenu, occupationMenu, assetsMenu])
          const options = collectActions(g, menu.children(g))
          if (options.length) action = d.pick(options)
        }
        if (!action) continue
        trail.push(`action ${action.id}`)
        const input = action.input
          ? action.input.kind === 'number'
            ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000)))
            : (action.input.defaultValue?.(g) ?? d.pick(TEXT_INPUTS))
          : undefined
        action.run(g, input)
        actions++
        drain(g, d, trail)
        checkInvariants(g)
      }
      if (!g.character.alive) break
      trail.push(`ageUp -> ${g.character.age + 1}`)
      ageUp(g)
      drain(g, d, trail)
      checkInvariants(g)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err)
    throw new Error(`seed ${seed}, age ${g.character.age}: ${msg}\nlast steps:\n  ${trail.slice(-15).join('\n  ')}`)
  }
  expect(g.obituary, 'obituary written').toBeTruthy()
  return {
    g,
    result: { age: g.character.age, cause: g.character.causeOfDeath ?? '?', ribbon: g.ribbon, netWorth: netWorth(g), actions },
  }
}

describe('whole-life simulation (offline)', () => {
  describe('40 random lives from birth to death', () => {
    const results: LifeResult[] = []
    // Keep every life, action and save round-trip, but give each seed its own timeout
    // and failure report. The persistent world makes the old single 40-life timer
    // sensitive to other simulation workers running at the same time.
    it.each(Array.from({ length: 40 }, (_, i) => i + 1))('plays seed %i without errors', seed => {
      results.push(playLife(seed, 4).result)
    }, 30_000)

    afterAll(() => {
      expect(results).toHaveLength(40)
      const ages = results.map((r) => r.age).sort((a, b) => a - b)
      const causes: Record<string, number> = {}
      const ribbons: Record<string, number> = {}
      for (const r of results) {
        causes[r.cause] = (causes[r.cause] ?? 0) + 1
        ribbons[r.ribbon ?? 'none'] = (ribbons[r.ribbon ?? 'none'] ?? 0) + 1
      }
      console.log(
        `lifespans: min ${ages[0]}, median ${ages[Math.floor(ages.length / 2)]}, max ${ages[ages.length - 1]}\n` +
          `causes: ${JSON.stringify(causes)}\nribbons: ${JSON.stringify(ribbons)}\n` +
          `net worth median: ${results.map((r) => r.netWorth).sort((a, b) => a - b)[Math.floor(results.length / 2)]}`,
      )
      // Most lives should be long ones; a typical median is in the 70s-80s.
      expect(ages[Math.floor(ages.length / 2)]).toBeGreaterThan(50)
    })
  })

  it('continues as a child after death', () => {
    for (let seed = 100; seed < 106; seed++) {
      const { g } = playLife(seed, 6)
      let kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild'))
      // Random play doesn't always produce children; give this life one so the hand-off is tested.
      if (!kids.length) kids = [createPerson(g, { relation: 'child', age: 30, lastName: g.character.lastName, relationship: 80 })]
      const next = continueAsChild(g, kids[0].id)
      expect(next.character.alive).toBe(true)
      expect(next.generation).toBe(g.generation + 1)
      expect(next.ancestors.length).toBe(g.ancestors.length + 1)
      expect(next.flags.worldEconomy).toEqual(g.flags.worldEconomy)
      checkInvariants(next)
      // The heir can keep living.
      const d = driver(seed)
      for (let i = 0; i < 5 && next.character.alive; i++) {
        ageUp(next)
        drain(next, d, [])
      }
    }
    // Six whole lives plus their heirs: sized for a 2-core CI runner.
  }, 600_000)
})
