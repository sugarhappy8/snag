// Heavy R&D text against docs/VOICE.md, through the same rule helper the voice report uses
// (scripts/voice/rules.mjs unitFlags): the Heavy R&D line on the Products screen is a tooltip (cap 120),
// the "R&D Underway" notice and the launch line are outcomes (cap 120), and two clauses get a full stop.
// A hole (a number, a name, a price) counts for nothing, as in the report, so the rendered text is turned
// back into the template before it is measured.
import { describe, expect, it } from 'vitest'
import { unitFlags, staticLength } from '../scripts/voice/rules.mjs'
import { businessAssetView } from '../src/game/business'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { advanceHeavy, heavyCost, heavyOdds, heavyYears, startHeavy } from '../src/game/business/heavy-rd'
import { bizOf, type RdProject } from '../src/game/business/state'
import { formatMoney } from '../src/game/core'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { adult, allNodes, company, nextYear } from './market-kit'

const NAME = breakthroughsFor('restaurant')[1].name

/** The text with each value that was poured into it put back as a "${...}" hole. */
function template(text: string, values: readonly string[]): string {
  return [...values].sort((x, y) => y.length - x.length).reduce((t, v) => (v ? t.split(v).join('${...}') : t), text)
}

function biz(seed: number) {
  const g = adult(seed, 2030, 'us')
  const a = company(g, 'restaurant', { cash: 80_000_000 })
  nextYear(g)
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}

function infoRow(g: GameState, a: Asset, idPrefix: string): string {
  const menu = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'menu' && n.id === `biz.products.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no products menu')
  const row = menu.children(g).find((n: MenuNode) => n.type === 'info' && n.id.startsWith(idPrefix))
  if (!row || row.type !== 'info') throw new Error(`no ${idPrefix} row`)
  return typeof row.text === 'function' ? row.text(g) : row.text
}

describe('Heavy R&D text keeps to the voice guide', () => {
  it('the line under the Heavy R&D heading is a tooltip of at most 120 characters, and a clean one', () => {
    const { g, a } = biz(31)
    const text = infoRow(g, a, 'biz.heavyInfo.')
    expect(staticLength(text)).toBeLessThanOrEqual(120)
    expect(unitFlags(text, 'tooltip')).toEqual([])
  })

  it('the R&D Underway notice is an outcome of at most 120 characters, with the cost, the years and the odds', () => {
    const { g, a, b } = biz(32)
    const cost = heavyCost(g, b)!
    const years = heavyYears(b)
    const odds = Math.round(heavyOdds(g, b) * 100)
    expect(startHeavy(g, a, b, NAME)).not.toBeNull()
    const n = g.queue.find((m) => m.kind === 'notice' && m.title === 'R&D Underway')
    expect(n && n.kind === 'notice' ? n.text : '').toBeTruthy()
    const text = n && n.kind === 'notice' ? n.text : ''
    expect(text).toContain(formatMoney(cost))
    expect(text).toContain(`${years} years`)
    expect(text).toContain(`${odds}%`)
    expect(text).toMatch(/flop/i)
    const t = template(text, [a.name, NAME, formatMoney(cost), `${odds}`, `${years}`])
    expect(staticLength(t)).toBeLessThanOrEqual(120)
    expect(unitFlags(t, 'outcome')).toEqual([])
  })

  it('the launch line gives two clauses a full stop, not a semicolon, and stays inside the outcome cap', () => {
    let seen = 0
    for (let seed = 1; seed <= 80 && seen < 3; seed++) {
      const { g, a, b } = biz(seed)
      const p: RdProject = { id: 'rd-v', name: NAME, budget: 2e6, years: 4, progress: 4, odds: 0.98, boost: 0, quality: 80, family: NAME, kind: 'breakthrough', heavy: true, cost: 2e6, started: g.year - 4 }
      const r = advanceHeavy(g, a, b, p, g.year)
      if (!r.won) continue
      seen++
      expect(r.line).not.toContain(';')
      expect(r.line).toMatch(/No rival sells one yet\. The first can follow from about \d{4}\./)
      const t = template(r.line.replace(/^\S+\s/, ''), [NAME, String(Math.round(b.products.find((x) => x.name === NAME)!.quality ?? 0)), String(g.year + 1 + 4)])
      expect(staticLength(t)).toBeLessThanOrEqual(120)
      expect(unitFlags(t, 'outcome')).toEqual([])
    }
    expect(seen).toBe(3)
  })
})
