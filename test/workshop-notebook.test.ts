// The Workshop notebook: spark popups that fit the character's age and era, ideas that don't
// come straight back after being forgotten or scrapped, and idea rows that only show the patent
// and launch rows once a prototype can use them.
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { isHistory } from '../src/game/workshop/catalog'
import { addIdea, candidates, drawIdea, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { scrapIdea } from '../src/game/workshop/launch'
import { sparkScenes, yearlyWorkshop } from '../src/game/workshop/yearly'
import { SEEN_MAX, normalizeWorkshop } from '../src/game/workshop/state'
import { give, ideaMenu, inSchool, inventor, nextYear } from './workshop-fixtures'

describe('spark contexts', () => {
  const KIDLY = /lesson|class|school|homework|fort|tree|asleep|bubbles/i
  const GROWN = /meeting|lunch break|traffic|lecture|laundry|dishes|garden|shed|nap|ducks|jigsaw/i
  const SCHOOL = /lesson|class\b|homework|school/i

  it('are grammatical, fit the stage of life, and never use a word before its time', () => {
    for (let year = 1900; year <= 2060; year += 8) {
      for (const age of [6, 8, 11, 14, 17, 22, 35, 50, 64, 70, 88]) {
        for (const busy of [false, true]) {
          const g = inventor({ age, year, genius: true })
          if (busy && age < 18) inSchool(g, age < 11 ? 'elementary' : age < 14 ? 'middle' : 'high')
          if (busy && age >= 18 && age < 65) g.character.job = { title: 'Clerk' } as never
          const scenes = sparkScenes(g)
          expect(scenes.length, `${age} in ${year}`).toBeGreaterThan(0)
          for (const s of scenes) {
            const line = `${s}, you had an idea: the Umbrella Hat.`
            // Review: "While during a boring lesson, you had an idea".
            expect(line).toMatch(/^[A-Z][^,]*(, [^,]+)?, you had an idea: the /)
            expect(line).not.toMatch(/While (during|in|on|at) /)
            expect(anachronismsIn(line, year, ['us']), `${line} (${year})`).toEqual([])
            // Review: adults were daydreaming through school lessons.
            if (age >= 18 || !busy) expect(s, `${age}: ${s}`).not.toMatch(SCHOOL)
            if (age < 13) expect(s, `${age}: ${s}`).not.toMatch(GROWN)
            if (age >= 65) expect(s, `${age}: ${s}`).not.toMatch(/meeting|lunch break|lecture/i)
          }
          if (age < 13) expect(scenes.some((s) => KIDLY.test(s))).toBe(true)
        }
      }
    }
    // No traffic jams before families have cars, no commercial breaks before television.
    expect(sparkScenes(inventor({ age: 30, year: 1905 })).join(' ')).not.toMatch(/traffic/)
    expect(sparkScenes(inventor({ age: 15, year: 1935 })).join(' ')).not.toMatch(/commercial/)
  })

  it('reach the popup as "<scene>, you had an idea: the ..." for a working adult in 1960', () => {
    let popups = 0
    for (let s = 1; s < 60 && popups < 5; s++) {
      const g = inventor({ genius: true, age: 30, year: 1960, seed: s })
      g.character.job = { title: 'Clerk' } as never
      nextYear(g)
      yearlyWorkshop(g)
      for (const m of g.queue) {
        if (m.kind !== 'choice' || m.scriptId !== 'workshop.spark') continue
        popups++
        expect(sparkScenes(g).some((x) => m.text.startsWith(`${x}, you had an idea: the `)), m.text).toBe(true)
        expect(m.text).not.toMatch(SCHOOL)
      }
    }
    expect(popups).toBeGreaterThan(0)
  })
})

describe('repeat ideas', () => {
  it('a forgotten or scrapped idea waits while fresh ones remain, deterministically', () => {
    // Review: the Popcorn Seasoning Bowl and the Indoor Snowball Kit came straight back.
    const run = (seed: number) => {
      const g = inventor({ genius: true, year: 1980, seed })
      const ws = mutWorkshop(g)
      const offered: string[] = []
      for (let i = 0; i < 25; i++) {
        const d = drawIdea(g, ws)!
        offered.push(d.id)
        // Half are forgotten at once; the rest go in the notebook and get scrapped.
        if (i % 2 && addIdea(g, ws, d)) scrapIdea(g, d.id)
      }
      return { offered, seen: [...readWorkshop(g).seen] }
    }
    const a = run(3)
    expect(new Set(a.offered).size).toBe(a.offered.length)
    expect(run(3)).toEqual(a)
    expect(a.seen.length).toBeLessThanOrEqual(SEEN_MAX)
  })

  it('keeps the seen list bounded, plain JSON and loadable from old saves', () => {
    const g = inventor({ genius: true, year: 1990 })
    const ws = mutWorkshop(g)
    for (let i = 0; i < 120; i++) drawIdea(g, ws)
    expect(ws.seen.length).toBe(SEEN_MAX)
    expect(new Set(ws.seen).size).toBe(SEEN_MAX)
    expect(normalizeWorkshop(g, JSON.parse(JSON.stringify(ws))).seen).toEqual(ws.seen)
    expect(normalizeWorkshop(g, { ...ws, seen: 'junk' }).seen).toEqual([])
    expect(normalizeWorkshop(g, { ...ws, seen: undefined }).seen).toEqual([])
  })

  it('when every idea of the era was offered lately, the one offered longest ago returns first', () => {
    const g = inventor({ year: 1905 })
    const ws = mutWorkshop(g)
    const pool = candidates(g, ws)
    expect(pool.length).toBeLessThan(SEEN_MAX)
    const firstRound = pool.map(() => drawIdea(g, ws)!.id)
    // Every idea of 1905 once, before any comes back...
    expect(new Set(firstRound).size).toBe(pool.length)
    // ...then the oldest first, in the same order.
    for (const id of firstRound) expect(drawIdea(g, ws)!.id).toBe(id)
  })

  it('keeps history-race ideas as rare as before', () => {
    let race = 0, total = 0
    for (let s = 1; s <= 40; s++) {
      const g = inventor({ genius: true, year: 1960, seed: s })
      const ws = mutWorkshop(g)
      for (let i = 0; i < 10; i++) {
        const d = drawIdea(g, ws)!
        total++
        if (isHistory(d)) race++
      }
    }
    expect(race / total).toBeGreaterThan(0.005)
    expect(race / total).toBeLessThan(0.08)
  })
})

describe('notebook clutter', () => {
  it('shows patent and launch rows only once the prototype is good enough', () => {
    // Review: every idea with no prototype showed 2 disabled patent rows and 4 disabled launch routes.
    const g = inventor({ genius: true, year: 2000 })
    give(g, 'robot-mower', 0)
    const rows = (q: number) => {
      mutWorkshop(g).ideas.find((i) => i.id === 'robot-mower')!.q = q
      return ideaMenu(g, 'robot-mower').children(g)
    }
    const fresh = rows(0)
    expect(fresh.some((n) => n.id.startsWith('ws.patent.') || n.id.startsWith('ws.launch.'))).toBe(false)
    expect(fresh.map((n) => (n.type === 'info' ? String(n.text) : '')).join(' ')).toMatch(/unlock launch deals/)
    // The genius hint (real appeal, best route) stays on the idea row itself.
    expect(ideaMenu(g, 'robot-mower').hint?.(g)).toMatch(/Real appeal/)
    const launchOnly = rows(34)
    expect(launchOnly.some((n) => n.id.startsWith('ws.launch.'))).toBe(true)
    expect(launchOnly.some((n) => n.id.startsWith('ws.patent.'))).toBe(false)
    expect(launchOnly.map((n) => (n.type === 'info' ? String(n.text) : '')).join(' ')).toMatch(/Reach quality 40 to patent/)
    const all = rows(45)
    expect(all.filter((n) => n.id.startsWith('ws.patent.'))).toHaveLength(2)
    expect(all.some((n) => n.id.startsWith('ws.launch.'))).toBe(true)
  })
})
