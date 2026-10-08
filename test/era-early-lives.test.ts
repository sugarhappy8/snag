// Whole lives from the early decades: born in 1900, 1925, 1950 and 1965 in a spread of countries,
// aged to death with every popup answered at random. No errors, no word that did not exist yet, the
// era packs actually show up, and a long life does not repeat itself.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { anachronismsIn } from '../src/game/events/era'
import { ERA_PACKS } from '../src/game/events/era-life'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { GameState, MinigameModal } from '../src/game/types'

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)], int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) }
}
type Driver = ReturnType<typeof driver>

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push'])
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 3000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport':
      return 'skip'
    default:
      return 'done'
  }
}

interface Played {
  texts: { text: string; year: number; countries: string[] }[]
  gAtEnd: GameState
  eventsSeen: string[]
}

function playLife(seed: number, year: number, countryId: string): Played {
  const d = driver(seed * 7919 + year)
  const g = createNewLife({ seed, year, countryId })
  const texts: Played['texts'] = []
  const logged = new Set<string>()
  const add = (text: string) => texts.push({ text, year: g.year, countries: [g.character.countryId] })
  function drain(): void {
    for (let guard = 0; g.queue.length > 0; guard++) {
      if (guard > 400) throw new Error(`queue never drains: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
      const m = g.queue.shift()!
      const before = g.queue.length
      switch (m.kind) {
        case 'notice':
          add(`${m.title} :: ${m.text}`)
          break
        case 'choice': {
          add(`${m.title} :: ${m.text}`)
          for (const c of m.choices) add(c.label)
          const choice = d.pick(m.choices)
          if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
          else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
          break
        }
        case 'input':
          runScript(g, m.scriptId, m.input === 'number' ? String(d.int(m.min ?? 1, Math.min(m.max ?? 1000, (m.min ?? 1) + 1000))) : m.defaultValue || 'Alex', m.data, m)
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
    for (const y of g.log)
      for (const e of y.entries) {
        if (logged.has(e.id)) continue
        logged.add(e.id)
        texts.push({ text: e.text, year: y.year, countries: [g.character.countryId] })
      }
  }
  drain()
  while (g.character.alive && g.character.age < 125) {
    ageUp(g)
    drain()
  }
  const history = g.flags.offlineEventHistory
  const eventsSeen = history && typeof history === 'object' && !Array.isArray(history) ? Object.keys(history) : []
  return { texts, gAtEnd: g, eventsSeen }
}

const COUNTRIES = ['us', 'gb', 'in', 'ng', 'jp', 'br', 'id', 'cn', 'de', 'za', 'mx', 'ru']
const BIRTHS = [1900, 1925, 1950, 1965]

describe('whole lives from the early decades', () => {
  const played: { year: number; country: string; life: Played }[] = []

  it('age to death without an error, in every country and decade', () => {
    let n = 0
    for (const year of BIRTHS) {
      for (const country of COUNTRIES) {
        const life = playLife(++n, year, country)
        played.push({ year, country, life })
        expect(!life.gAtEnd.character.alive || life.gAtEnd.character.age >= 125, `${year} ${country}`).toBe(true)
        expect(Number.isFinite(life.gAtEnd.character.money), `${year} ${country} money`).toBe(true)
        expect(life.gAtEnd.character.age).toBeGreaterThan(0)
      }
    }
  }, 600_000)

  it('mention nothing before its time', () => {
    const bad: string[] = []
    const seen = new Set<string>()
    for (const { year, country, life } of played) {
      for (const t of life.texts) {
        if (t.year >= PRESENT_YEAR) continue
        const rules = anachronismsIn(t.text, t.year, t.countries)
        if (!rules.length) continue
        const key = `${rules.join(',')}|${t.text.slice(0, 100)}`
        if (seen.has(key)) continue
        seen.add(key)
        bad.push(`[${rules.join(',')}] ${t.year} ${country} (born ${year}): ${t.text.slice(0, 200)}`)
      }
    }
    expect(bad.slice(0, 25).join('\n')).toBe('')
  })

  it('show the era packs\' own popups and a varied life log', () => {
    const packEvents = new Set(ERA_PACKS.flatMap((p) => p.events.map((e) => e.id)))
    let withEra = 0
    const distinct = new Set<string>()
    for (const { life } of played) {
      const mine = life.eventsSeen.filter((id) => packEvents.has(id))
      if (mine.length > 0) withEra++
      for (const id of mine) distinct.add(id)
    }
    expect(withEra).toBeGreaterThan(played.length * 0.6)
    expect(distinct.size).toBeGreaterThanOrEqual(20)
  })

  it('do not repeat themselves: era flavor lines almost never come twice in one life', () => {
    let total = 0
    let dupes = 0
    for (const { year, life } of played) {
      if (year > 1950) continue
      const counts = new Map<string, number>()
      for (const t of life.texts) {
        if (!t.text.startsWith('I ') && !t.text.startsWith('We ')) continue
        counts.set(t.text, (counts.get(t.text) ?? 0) + 1)
      }
      for (const n of counts.values()) {
        total += n
        if (n > 1) dupes += n - 1
      }
    }
    expect(total).toBeGreaterThan(1500)
    expect(dupes / total).toBeLessThan(0.05)
  })
})
