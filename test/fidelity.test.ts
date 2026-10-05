// Small checks for details a player of the classic life sim would notice right away.
import { describe, expect, it } from 'vitest'
import { activitiesMenu } from '../src/game/menus'
import { createNewLife } from '../src/game/life'
import type { MenuNode } from '../src/game/types'

function labels(nodes: MenuNode[]): string[] {
  return nodes.map((n) => ('label' in n ? n.label : ''))
}

describe('Surrender', () => {
  it('sits at the very bottom of Activities and ends the life with the Wasteful ribbon', () => {
    const g = createNewLife({ seed: 3, countryId: 'us', year: 2026 })
    g.character.age = 30
    const nodes = activitiesMenu.children(g)
    expect(labels(nodes).at(-1)).toBe('Surrender')
    const action = nodes.at(-1)
    if (!action || action.type !== 'action') throw new Error('Surrender is not an action')
    expect(action.confirm?.(g)).toContain(g.character.firstName)
    action.run(g)
    expect(g.character.alive).toBe(false)
    expect(g.ribbon).toBe('wasteful')
    const lines = g.log.flatMap((y) => y.entries.map((e) => e.text))
    expect(lines.at(-1)).toBe('I surrendered.')
    expect(g.queue.some((m) => m.kind === 'aiTask')).toBe(true) // the obituary
  })

  it('keeps "Turn Yourself In" (police) separate from giving up', () => {
    const g = createNewLife({ seed: 4, countryId: 'us', year: 2026 })
    g.character.age = 25
    g.character.wantedLevel = 2
    const names = labels(activitiesMenu.children(g))
    expect(names).toContain('Turn Yourself In')
    expect(names.filter((n) => n === 'Surrender')).toHaveLength(1)
  })
})

describe('journal noise', () => {
  it('mentions the yearly tax bill once, then only when it changes a lot', async () => {
    const { yearlyFinance } = await import('../src/game/finance')
    const g = createNewLife({ seed: 5, countryId: 'us', year: 2026 })
    g.character.age = 30
    const taxLines = () => g.log.flatMap((y) => y.entries.map((e) => e.text)).filter((t) => /tax/i.test(t)).length
    for (let i = 0; i < 3; i++) {
      g.flags.taxableIncome = 60_000
      yearlyFinance(g)
    }
    expect(taxLines()).toBe(1)
    g.flags.taxableIncome = 250_000 // big raise: worth a line
    yearlyFinance(g)
    expect(taxLines()).toBe(2)
  })
})

describe('Surrender obituary', () => {
  it('does not say "died from surrender"', async () => {
    const { surrenderLife } = await import('../src/game/activities/misc')
    const { fallbackObituary } = await import('../src/game/events')
    const g = createNewLife({ seed: 9, countryId: 'us', year: 2026 })
    g.character.age = 40
    surrenderLife(g)
    const obit = fallbackObituary(g)
    expect(obit).not.toMatch(/died from surrender/i)
    expect(obit).toContain(g.character.firstName)
  })
})

describe('school grades', () => {
  it('an average kid (50% smarts) is not failing school', async () => {
    const { ageUp } = await import('../src/game/aging')
    const grades: number[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const g = createNewLife({ seed, countryId: 'us', year: 2026 })
      for (let i = 0; i < 10 && g.character.alive; i++) {
        g.queue = []
        Object.assign(g.character.stats, { smarts: 50, happiness: 70, health: 90 })
        ageUp(g)
      }
      const cur = g.character.education.current
      if (cur && cur.level !== 'preschool') grades.push(cur.grades)
    }
    expect(grades.length).toBeGreaterThan(6)
    const avg = grades.reduce((a, b) => a + b, 0) / grades.length
    expect(avg).toBeGreaterThanOrEqual(60) // D- or better on average, not an F
  })
})
