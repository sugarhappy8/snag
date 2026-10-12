// Business: founding through the real menus and popups, then years of trading in very
// different markets via the yearly hook and the Annual Report.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { businessAssetView, businessCareerMenu, businessSummary } from '../src/game/business'
import { startupCapitalPreview } from '../src/game/business/founding'
import { rescueNodes } from '../src/game/business/rescue'
import { aIndustry, aYearsOld, industryNoun, labelPlural, runwayText, units } from '../src/game/business/util'
import { bizOf, businessAssets, readBiz } from '../src/game/business/state'
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
function drain(g: GameState, prefer: string[] = [], notices?: string[]): void {
  for (let guard = 0; g.queue.length && guard < 200; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') notices?.push(m.text)
    else if (m.kind === 'choice') {
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

  it('says the first company got a manager when you found a second one to run yourself', () => {
    const g = adultIn('us', 5_000_000)
    found(g, 'foodTruck')
    const first = businessAssets(g)[0]
    startRow(g, 'cafe').run(g)
    const notices: string[] = []
    drain(g, ['savings', 'me', 'pay'], notices)
    const opened = notices.find((t) => t.includes('is officially registered'))
    expect(opened).toBeDefined()
    expect(opened).not.toMatch(/quit your job as/)
    expect(opened).toContain(`You're the Founder & CEO, and you handed ${first.name} to a general manager.`)
    expect(readBiz(g, first).ceo).toBe('manager')
  })

  it('describes the starting cash buffer in months or years, never "0.0 years"', () => {
    expect(runwayText(0)).toBe('less than a month')
    expect(runwayText(0.2)).toBe('2 months')
    expect(runwayText(0.99)).toBe('1 year')
    expect(runwayText(2.46)).toBe('2.5 years')
    expect(runwayText(10_847.04)).toBe('10,847 years')
    expect(units(50_000)).toBe('50K')
    expect(units(12_345)).toBe('12.3K')
    expect(units(3_000_000)).toBe('3M')
    // Capital & Ownership: a cash-rich company has no "$0" stabilization target.
    const rich = adultIn('us', 5_000_000)
    found(rich, 'foodTruck')
    const truck = businessAssets(rich)[0]
    bizOf(rich, truck).cash = 10_000_000
    const position = rescueNodes(rich, truck)[0]
    const text = position.type === 'info' ? (typeof position.text === 'function' ? position.text(rich) : position.text) : ''
    expect(text).toContain('Cash already covers six months of costs.')
    expect(text).not.toMatch(/target \$0|\d\.\d years base-cost/)
    // Plain words, short subtitles: no "Stabilization target" or "Subscribe to New Equity".
    expect(text).not.toMatch(/Stabilization|Capital does not fix|restructure/)
    const actions = rescueNodes(rich, truck).filter((n): n is MenuAction => n.type === 'action')
    expect(actions.map((n) => n.label)).toEqual(['Buy Out Investors', 'Put In More Money', 'Company Buys Back Shares'])
    for (const n of actions) expect(typeof n.subtitle === 'string' ? n.subtitle : '').toMatch(/^.{20,90}$/)
    bizOf(rich, truck).cash = 1_000
    const tight = rescueNodes(rich, truck)[0]
    expect(tight.type === 'info' && typeof tight.text === 'string' ? tight.text : '').toMatch(/To be safe, add \$[\d.,]+K? so cash covers six months\. More money buys time, not customers/)
    const g = adultIn('us', 5_000_000)
    startRow(g, 'aiLab').run(g)
    for (let guard = 0; g.queue.length && guard < 10; guard++) {
      const m = g.queue[0]
      if (m.kind === 'input' && m.scriptId === 'business.found.capital') {
        const text = startupCapitalPreview(g, m.data, m.min ?? 0)
        expect(text).toMatch(/roughly (less than a month|\d+ months?|[\d.,]+ years?) of base wages/)
        expect(text).not.toMatch(/0\.0 years/)
        return
      }
      g.queue.shift()
      if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Test Co', m.data, m)
      else if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
    }
    throw new Error('never asked for starting capital')
  })

  it('names industries in a proper plural ("Marketing Agencies", never "Agencys")', () => {
    expect(labelPlural('Brewery')).toBe('Breweries')
    expect(labelPlural('Marketing Agency')).toBe('Marketing Agencies')
    expect(labelPlural('Bar')).toBe('Bars')
    expect(labelPlural('Data Centers')).toBe('Data Centers')
    // Review: a UK marketing agency's Annual Report said "Marketing Agencys are in hot demand here."
    const g = adultIn('gb', 5_000_000)
    found(g, 'marketing')
    let note = ''
    for (let y = 0; y < 3 && !note; y++) {
      ageUp(g)
      const report = g.queue.find((m) => m.kind === 'minigame' && m.game === 'annualReport')
      if (report && report.kind === 'minigame') note = String((report.data as { marketNote?: string }).marketNote ?? '')
      drain(g, ['savings', 'pay', 'ignore', 'decline'])
    }
    expect(note).toMatch(/economy is/)
    expect(note).not.toMatch(/\b[A-Z][a-z]+ys\b|Agencys|label/)
  })

  it('writes "an AI company" and "an energy company", never "a ai company"', () => {
    expect(aIndustry('AI Company')).toBe('an AI company')
    expect(aIndustry('Energy Company')).toBe('an energy company')
    expect(aIndustry('Food Truck')).toBe('a food truck')
    expect(industryNoun('E-Commerce Store')).toBe('e-commerce store')
    expect(aYearsOld(8)).toBe('an 8-year-old')
    expect(aYearsOld(11)).toBe('an 11-year-old')
    expect(aYearsOld(7)).toBe('a 7-year-old')
    expect(aYearsOld(25)).toBe('a 25-year-old')
    // Review: "Investors only back a ai company with a technical founder", "I founded Walker AI, a ai company".
    const g = adultIn('us', 5_000_000)
    g.character.stats.smarts = 40
    startRow(g, 'aiLab').run(g)
    const texts: string[] = []
    drain(g, ['cofounder', 'savings', 'bootstrap', 'me'], texts)
    for (const m of g.queue) if (m.kind === 'choice') texts.push(m.text)
    texts.push(...g.log.flatMap((y) => y.entries.map((e) => e.text)), ...g.character.memories)
    expect(texts.join('\n')).toMatch(/I founded .+, an AI company in /)
    expect(texts.join('\n')).not.toMatch(/\b[aA] (ai|AI)\b|\ba energy\b|\(ai company\)/)
  })

  it("doesn't repeat the company's name in a header box under the sheet title", () => {
    const g = adultIn('us', 400_000)
    found(g, 'foodTruck')
    const a = businessAssets(g)[0]
    const node = businessCareerMenu.children(g).find((n) => n.id === `biz.company.${a.id}`)
    expect(node?.type).toBe('menu')
    if (node?.type !== 'menu') return
    expect(node.label).toBe(a.name)
    expect(node.header?.(g)).toBeFalsy()
    g.assets = g.assets.filter((x) => x.id !== a.id)
    expect(node.header?.(g)).toBe('You no longer own this business.')
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

  it("won't let the owner pay out borrowed money (loan, withdraw, bankruptcy loop)", () => {
    const g = adultIn('us', 400_000)
    found(g, 'foodTruck')
    const a = businessAssets(g)[0]
    const b = bizOf(g, a)
    b.cash = 500_000
    b.debt = 450_000
    const all = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((n) => (n.type === 'menu' ? [n, ...all(n.children(g))] : [n]))
    const withdraw = all(businessAssetView(g, a)).find((n) => n.id === `biz.dividend.${a.id}`) as MenuAction | undefined
    expect(withdraw).toBeDefined()
    expect(withdraw!.input?.max).toBe(50_000)
    const before = g.character.money
    withdraw!.run(g, '500000')
    g.queue = []
    expect(readBiz(g, a).cash).toBe(450_000)
    expect(g.character.money - before).toBeLessThanOrEqual(50_000)
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
