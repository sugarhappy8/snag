// Business: founding through the real menus and popups, then years of trading in very
// different markets via the yearly hook and the Annual Report.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { businessCareerMenu, businessSummary } from '../src/game/business'
import { businessAssets, readBiz } from '../src/game/business/state'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function adultIn(countryId: string, money: number, seed = 3): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = 70
  c.licenses = ['driver']
  return g
}

/** Answer every popup: first choice (or a preferred id), default text, sane annual plans. */
function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length && guard < 200; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Co'), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        const production = Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05))
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production }), m.data, m)
      } else runScript(g, m.scriptId, 'lose', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function find(nodes: MenuNode[], id: string): MenuNode | undefined {
  return nodes.find((n) => n.id === id)
}

function startRow(g: GameState, industry: string): MenuAction {
  const start = find(businessCareerMenu.children(g), 'biz.start')
  if (!start || start.type !== 'menu') throw new Error('no start menu')
  const row = find(start.children(g), `biz.start.${industry}`)
  if (!row || row.type !== 'action') throw new Error(`no row for ${industry}`)
  return row
}

function found(g: GameState, industry: string): void {
  const row = startRow(g, industry)
  const reason = row.disabledReason?.(g)
  expect(reason, `can't found ${industry}: ${reason}`).toBeFalsy()
  row.run(g)
  drain(g, ['savings', 'run', 'ceo', 'pay', 'yes'])
}

function finiteBiz(g: GameState): void {
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const [k, v] of Object.entries({ value: a.value, cash: b.cash, debt: b.debt, price: b.price, production: b.production, valuation: b.valuation })) {
      expect(Number.isFinite(v), `${a.name} ${k} = ${v}`).toBe(true)
    }
    expect(b.price).toBeGreaterThan(0)
  }
  expect(Number.isFinite(g.character.money)).toBe(true)
}

describe('business', () => {
  it('founds a food truck in the US and trades for 15 years with sane numbers', () => {
    const g = adultIn('us', 400_000)
    found(g, 'foodTruck')
    expect(businessAssets(g)).toHaveLength(1)
    expect(g.character.job?.defId).toBe('business_owner')
    let profitable = 0
    for (let y = 0; y < 15 && g.character.alive; y++) {
      ageUp(g)
      drain(g, ['savings', 'pay', 'ignore', 'decline'])
      finiteBiz(g)
      const a = businessAssets(g)[0]
      if (!a) break
      const last = readBiz(g, a).last
      if (last && last.net > 0) profitable++
    }
    expect(profitable, 'a sensibly run US food truck makes money most years').toBeGreaterThan(5)
    expect(businessSummary(g)).toMatch(/Food Truck|food truck/i)
  })

  it('feels different by market and respects banned industries', () => {
    const sa = adultIn('sa', 5_000_000)
    expect(startRow(sa, 'bar').disabledReason?.(sa)).toBeTruthy()
    const us = adultIn('us', 5_000_000)
    const jp = adultIn('jp', 5_000_000)
    const ng = adultIn('ng', 5_000_000)
    const subs = [us, jp, ng].map((g) => String(typeof startRow(g, 'cafe').subtitle === 'function' ? (startRow(g, 'cafe').subtitle as (g: GameState) => string)(g) : ''))
    expect(new Set(subs).size, `cafe rows: ${subs.join(' | ')}`).toBe(3)
  })

  it('survives hyperinflation and many years in Venezuela, Switzerland and Nigeria', () => {
    for (const [cc, industry] of [['ve', 'grocery'], ['ch', 'software'], ['ng', 'restaurant']] as const) {
      const g = adultIn(cc, 3_000_000, 11)
      found(g, industry)
      expect(businessAssets(g).length, cc).toBe(1)
      for (let y = 0; y < 20 && g.character.alive; y++) {
        ageUp(g)
        drain(g, ['inject', 'loan', 'pay', 'ignore', 'decline', 'savings'])
        finiteBiz(g)
      }
      expect(() => JSON.parse(JSON.stringify(g))).not.toThrow()
    }
  })
})
