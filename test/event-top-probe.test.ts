// R3-Q12 (E.T6): the counting probe behind the 60 events that get scene variants. It plays 30 seeded lives to 85 through
// test/play-kit.ts (20 ordinary, 10 with 60,000,000 at 25), counts the event popups that arrived by themselves (the first
// step of a random event, not the follow-up a choice queued) by data.eventId, and writes the 60 most frequent to
// test/fixtures/event-top60.json. Opt-in (a few minutes), so CI time doesn't grow:
//
//   EVENT_TOP=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/event-top-probe.test.ts
//
// test/event-variants.test.ts reads the fixture: its `top` list must stay the list of events that have scenes.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { playLife } from './play-kit'

const FIXTURE = join(__dirname, 'fixtures', 'event-top60.json')
const ORDINARY = 20
const RICH = 10
const UNTIL_AGE = 85
const TOP = 60
const BIRTH_YEARS = [1925, 1950, 1975, 1990, 2010, 2026]

interface Row {
  id: string
  count: number
  lives: number
}

describe.skipIf(process.env.EVENT_TOP !== '1')('event top probe', () => {
  it(
    'counts the random events of 30 lives and writes test/fixtures/event-top60.json',
    () => {
      const counts = new Map<string, { count: number; lives: Set<number> }>()
      const seeds: number[] = []
      const lives = ORDINARY + RICH
      for (let i = 0; i < lives; i++) {
        const rich = i >= ORDINARY
        const firstSeed = rich ? 301 : 201
        const seedOf = firstSeed + (rich ? i - ORDINARY : i)
        seeds.push(seedOf)
        const { years } = playLife({ seed: seedOf, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length], untilAge: UNTIL_AGE, rich })
        for (const y of years) {
          for (const p of y.popups) {
            if (p.kind !== 'choice' || !p.passive) continue
            const item = p.item
            if (item.kind !== 'choice' || item.scriptId !== EVENT_SCRIPT) continue
            const data = item.data as { eventId?: unknown } | undefined
            const id = typeof data?.eventId === 'string' ? data.eventId : ''
            if (!id) continue
            const row = counts.get(id) ?? { count: 0, lives: new Set<number>() }
            row.count++
            row.lives.add(i)
            counts.set(id, row)
          }
        }
      }
      const rows: Row[] = [...counts.entries()]
        .map(([id, r]) => ({ id, count: r.count, lives: r.lives.size }))
        .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const file = {
        v: 1,
        lives,
        seeds,
        untilAge: UNTIL_AGE,
        total: rows.reduce((n, r) => n + r.count, 0),
        top: rows.slice(0, TOP).map((r) => r.id),
        rows: rows.slice(0, 120),
      }
      writeFileSync(FIXTURE, `${JSON.stringify(file, null, 2)}\n`)
      console.log(`random events ${file.total} in ${rows.length} ids; the 60th has ${rows[TOP - 1]?.count ?? 0}`)
      expect(file.top.length).toBe(TOP)
    },
    900_000,
  )
})
