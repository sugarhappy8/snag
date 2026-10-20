// Main Character Syndrome (talents.ts MainCharacter, mastery.ts): whole MCS lives play to death
// without errors or runaway money next to a normal life of the same seed.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { hireForJob } from '../src/game/careers'
import { createNewLife } from '../src/game/life'
import { masteredCount } from '../src/game/mastery'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { applyFallback } from '../src/game/offline'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import { makeTestGame } from './helpers'
import { mergedSlices, ownedHere, readSlice, recordSlice, seedSlice } from './shard-kit'
import { STAT_KEYS, type AnnualReportData, type GameState, type MenuAction, type MenuNode, type MinigameModal, type ModalItem } from '../src/game/types'

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
}
type Driver = ReturnType<typeof driver>

// In CI each shard plays a slice of the seeds (SLICE=i/n) and the merge step checks the whole set (test/shard-kit.ts).
const slice = readSlice()

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
    case 'nationReport':
      return 'done'
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 5000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport': {
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
  return m.defaultValue || d.pick(['Go for a long run', 'Write a song about my cat', 'Alex'])
}

function drain(g: GameState, d: Driver, trail: string[]): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    switch (m.kind) {
      case 'notice':
        break
      case 'choice': {
        const choice = d.pick(m.choices)
        trail.push(`choice ${m.title} -> ${choice.label}`)
        if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        break
      }
      case 'input':
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        applyFallback(g, m.task)
        break
    }
    g.queue.unshift(...g.queue.splice(before))
  }
}

function collectActions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
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
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

interface LifeResult {
  age: number
  netWorth: number
  peakWorth: number
  mastered: number
}


function playLife(seed: number, talents: string[] | undefined): LifeResult {
  const d = driver(seed * 7919)
  const trail: string[] = []
  const g = createNewLife({ seed, year: 2026, talents })
  let peak = 0
  try {
    drain(g, d, trail)
    while (g.character.alive) {
      if (g.character.age > 125) throw new Error('character never dies')
      const n = d.int(0, 4)
      for (let i = 0; i < n && g.character.alive; i++) {
        let action: MenuAction | undefined
        if (d.next() < 0.25) {
          const living = g.people.filter((p) => p.alive)
          const person = living.length ? d.pick(living) : undefined
          if (person) action = d.pick([undefined, ...collectActions(g, personActions(g, person))])
        } else {
          const options = collectActions(g, d.pick([activitiesMenu, activitiesMenu, occupationMenu, assetsMenu]).children(g))
          if (options.length) action = d.pick(options)
        }
        if (!action) continue
        trail.push(`action ${action.id}`)
        const input = action.input
          ? action.input.kind === 'number'
            ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000)))
            : (action.input.defaultValue?.(g) ?? 'Alex')
          : undefined
        action.run(g, input)
        drain(g, d, trail)
        checkInvariants(g)
      }
      if (!g.character.alive) break
      ageUp(g)
      drain(g, d, trail)
      peak = Math.max(peak, netWorth(g))
      checkInvariants(g)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err)
    throw new Error(`seed ${seed}, age ${g.character.age}: ${msg}\nlast steps:\n  ${trail.slice(-15).join('\n  ')}`)
  }
  expect(g.obituary, 'obituary written').toBeTruthy()
  return { age: g.character.age, netWorth: netWorth(g), peakWorth: peak, mastered: masteredCount(g) }
}

describe('Main Character Syndrome lives', () => {
  const SEEDS = Array.from({ length: 14 }, (_, i) => i + 1)
  const mine = seedSlice(SEEDS, 'mcl:lives', slice)
  type Played = { seed: number; mcs: LifeResult; plain: LifeResult }
  const played: Played[] = []

  it.each(mine)('plays seed %i to death as a main character and as anybody else', (seed) => {
    played.push({ seed, mcs: playLife(seed, ['MainCharacter']), plain: playLife(seed, undefined) })
  }, 300_000)

  it('keeps the money bounded, and mastery to the main characters', () => {
    recordSlice('mcl:lives', played, slice)
    // A slice checks only that its own seeds were played; the merge step checks the whole set.
    if (slice.mode === 'part') {
      expect(played).toHaveLength(mine.length)
      return
    }
    const all = slice.mode === 'merge' ? mergedSlices<Played>('mcl:lives', slice) : played
    expect(all.map((r) => r.seed)).toEqual(SEEDS)
    const mcs = all.map((r) => r.mcs)
    const plain = all.map((r) => r.plain)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    // Things get mastered along the way for a main character, and never for anybody else.
    expect(mean(mcs.map((r) => r.mastered))).toBeGreaterThan(3)
    expect(plain.every((r) => r.mastered === 0)).toBe(true)
    // Bounded by the market: a great career or a lucky market, never minted cash.
    expect(Math.max(...mcs.map((r) => r.peakWorth))).toBeLessThan(1_000_000_000)
    expect(mcs.every((r) => Number.isFinite(r.netWorth))).toBe(true)
  })
})

// The careers describe (twelve short careers) runs in one owner slice only.
if (ownedHere('mcl:careers', slice)) describe('careers: faster, not richer than the ladder allows', () => {
  function careerTotal(seed: number, main: boolean): { total: number; top: number; level: number } {
    const g = makeTestGame(seed, { age: 25, money: 0, talents: main ? ['MainCharacter'] : undefined, stats: { happiness: 70, health: 90, smarts: 70, looks: 60 } })
    g.log = [{ age: 25, year: 2026, entries: [] }]
    hireForJob(g, { defId: 'executive', title: 'Assistant Vice President', company: 'Test Corp', category: 'fulltime', salary: 105_000 })
    let total = 0
    let top = 0
    for (let i = 0; i < 40 && g.character.alive; i++) {
      g.queue = []
      // Both lives are diligent: three rounds of "Work Harder" every year.
      const harder = g.character.job ? collectActions(g, occupationMenu.children(g)).find((a) => a.id === 'job.harder') : undefined
      for (let k = 0; k < 3 && harder; k++) harder.run(g)
      g.queue = []
      ageUp(g)
      g.queue = []
      const j = g.character.job
      if (j) {
        total += j.salary
        top = Math.max(top, j.salary)
      }
    }
    return { total, top, level: g.character.job?.level ?? -1 }
  }

  it('a master climbs the same ladder sooner, but earns no more than the top of it', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const a = SEEDS.map((s) => careerTotal(s, true))
    const b = SEEDS.map((s) => careerTotal(s, false))
    const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0)
    expect(sum(a.map((r) => r.total))).toBeGreaterThanOrEqual(sum(b.map((r) => r.total)) * 0.9)
    expect(sum(a.map((r) => r.total))).toBeLessThan(sum(b.map((r) => r.total)) * 2.2)
    // Nobody out-earns the top of the CEO band in this ladder (about 420,000 in today's dollars, with raises).
    expect(Math.max(...a.map((r) => r.top))).toBeLessThan(1_200_000)
  }, 120_000)
})
