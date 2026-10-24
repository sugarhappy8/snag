// Inflation eats the cash a player holds at every birthday (cash.ts erodeCash). With the money shown in today's prices or in
// US dollars the bank balance visibly shrinks, and for a rich life that is billions a year with nothing saying why. The year
// now says so, once, when the loss is worth a line.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import type { GameState, LogEntry } from '../src/game/types'
import '../src/game/menus'
import { findSeed } from './seed-kit'

function adultWith(money: number, seed: number, year = 2030): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId: 'us' })
  g.queue = []
  g.character.age = 30
  g.year = year
  g.character.money = money
  bindMoneyContext(g)
  return g
}

const entriesOf = (g: GameState): LogEntry[] => g.log.flatMap((y) => y.entries)
const inflationLines = (g: GameState): LogEntry[] => entriesOf(g).filter((e) => e.id.startsWith('infl-'))

// Any adult who lives through the year: the test is about the bank, not about who owns it.
const seed = findSeed(
  (s) => {
    const g = adultWith(10e9, s)
    ageUp(g)
    return g.character.alive
  },
  { label: 'an adult who lives through the year' },
)

describe('the year says what inflation took from held cash', () => {
  it('tells a rich player how much, in the new year, with the amount and a fixed id', () => {
    const g = adultWith(10e9, seed)
    const before = g.character.money
    ageUp(g)
    const lines = inflationLines(g)
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect(line.id).toBe(`infl-${g.year}`)
    expect(line.text).toMatch(/inflation/i)
    expect(line.s).toBe('finance')
    // The amount is what the bank lost to inflation: well over $10,000, and about what the balance fell by before any income.
    expect(line.a).toBeGreaterThan(10_000)
    expect(line.a).toBeLessThan(before)
    // It is in the new year's log, where the card for that year reads it.
    expect(g.log[g.log.length - 1]!.entries).toContain(line)
  })

  it('stays quiet when the loss is small', () => {
    const g = adultWith(20_000, seed)
    ageUp(g)
    expect(inflationLines(g)).toHaveLength(0)
  })
})
