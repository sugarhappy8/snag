// The Workshop notebook: spark popups that fit the character's age and era, ideas that don't
// come straight back after being forgotten or scrapped, and idea rows that only show the patent
// and launch rows once a prototype can use them.
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { sparkScenes, yearlyWorkshop } from '../src/game/workshop/yearly'
import { inSchool, inventor, nextYear } from './workshop-fixtures'

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
