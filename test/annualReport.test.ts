// Annual Report minigame (src/ui/minigames/AnnualReport.tsx): defensive parsing, plan math,
// server-rendered markup for good and malformed data, and the two result strings it reports.
// The Profile sheet's "Business & Investments" block is checked with the store mocked.
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AnnualReportData, AnnualReportResult, Json, MinigameModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const mock = vi.hoisted(() => ({
  state: { game: null as unknown },
  business: '',
  investments: '',
}))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
}))

vi.mock('../src/game/business', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/game/business')>()),
  businessSummary: () => mock.business,
}))

vi.mock('../src/game/investments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/game/investments')>()),
  investmentsSummary: () => mock.investments,
}))

const report = await import('../src/ui/minigames/AnnualReport')
const { AnnualReport, readReportData, projectPlan, planResult, niceStep, snap, nudge, singularUnit, formatPrice, unitsToMeetDemand, SKIP_RESULT } =
  report
const { MINIGAMES } = await import('../src/ui/minigames')
const { ProfileSheet } = await import('../src/ui/components/ProfileSheet')

const SAMPLE: AnnualReportData = {
  assetId: 'biz1',
  businessName: 'Ramen Rocket',
  emoji: '🍜',
  industryLabel: 'Restaurant',
  location: 'Osaka, Japan',
  year: 2031,
  unitLabel: 'meals',
  unitCost: 3.2,
  price: 9.5,
  minPrice: 2,
  maxPrice: 30,
  suggestedPrice: 11,
  production: 24000,
  maxProduction: 60000,
  inventory: 1500,
  expectedDemand: 26000,
  marketNote: 'Osaka eats out more than anywhere in Japan; rents near the station are brutal.',
  lines: [
    { label: 'Revenue', value: '$228,000', tone: 'good' },
    { label: 'Cost of goods', value: '-$76,800', tone: 'bad' },
    { label: 'Rent', value: '-$42,000', tone: 'bad' },
    { label: 'Corporate tax (23%)', value: '-$12,400', tone: 'bad' },
    { label: 'Net profit', value: '$41,500', tone: 'good' },
  ],
}

function modalOf(data: Json): MinigameModal {
  return { kind: 'minigame', id: 'm1', game: 'annualReport', title: 'Annual Report', scriptId: 'business.report', data }
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findButton(n, label)
      if (hit) return hit
    }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as { children?: ReactNode; onClick?: () => void }
  if (node.type === 'button' && textOf(props.children).includes(label)) return node as ReactElement<{ onClick: () => void }>
  return findButton(props.children, label)
}

/** Server-render the report and keep the element tree it returned, so its buttons can be "clicked". */
function renderReport(data: Json) {
  const results: string[] = []
  let tree: ReactNode = null
  const props = { modal: modalOf(data), onDone: (r: string) => void results.push(r) }
  function Probe() {
    tree = AnnualReport(props)
    return tree
  }
  const html = renderToStaticMarkup(createElement(Probe))
  const click = (label: string) => {
    const btn = findButton(tree, label)
    expect(btn, `button "${label}"`).not.toBeNull()
    btn!.props.onClick()
  }
  return { html, results, click }
}

const MALFORMED: Json[] = [
  null,
  'nonsense',
  42,
  [],
  [1, 2, 3],
  {},
  { businessName: '', emoji: 7, lines: 'oops', year: 'soon' },
  { minPrice: 'x', maxPrice: -5, price: 'NaN', suggestedPrice: null, production: -40, maxProduction: 'lots' },
  { minPrice: 50, maxPrice: 5, price: 500, suggestedPrice: -3, unitCost: -2, inventory: -9, expectedDemand: 1e3 },
  { minPrice: 7, maxPrice: 7, price: 7, maxProduction: 0, production: 30, lines: [null, 3, { label: 'Revenue' }, { label: 'Tax', value: -1200, tone: 'meh' }] },
  { lines: Array.from({ length: 80 }, (_, i) => ({ label: `Line ${i}`, value: String(i) })) },
]

describe('readReportData', () => {
  it('keeps good data as-is', () => {
    const r = readReportData(SAMPLE as unknown as Json)
    expect(r.businessName).toBe('Ramen Rocket')
    expect(r.year).toBe(2031)
    expect(r.price).toBe(9.5)
    expect(r.suggestedPrice).toBe(11)
    expect([r.minPrice, r.maxPrice]).toEqual([2, 30])
    expect([r.production, r.maxProduction, r.inventory, r.expectedDemand]).toEqual([24000, 60000, 1500, 26000])
    expect(r.lines).toHaveLength(5)
    expect(r.lines[1]).toEqual({ label: 'Cost of goods', value: '-$76,800', tone: 'bad' })
  })

  it('never produces NaN, negative or unordered values from malformed data', () => {
    for (const data of MALFORMED) {
      const r = readReportData(data)
      const nums = [r.unitCost, r.price, r.minPrice, r.maxPrice, r.suggestedPrice, r.production, r.maxProduction, r.inventory, r.expectedDemand]
      for (const n of nums) {
        expect(Number.isFinite(n), JSON.stringify(data)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(0)
      }
      expect(r.maxPrice).toBeGreaterThan(r.minPrice)
      expect(r.price).toBeGreaterThanOrEqual(r.minPrice)
      expect(r.price).toBeLessThanOrEqual(r.maxPrice)
      expect(r.suggestedPrice).toBeGreaterThanOrEqual(r.minPrice)
      expect(r.suggestedPrice).toBeLessThanOrEqual(r.maxPrice)
      expect(r.production).toBeLessThanOrEqual(r.maxProduction)
      expect(Number.isInteger(r.production) && Number.isInteger(r.maxProduction)).toBe(true)
      expect(r.businessName.length).toBeGreaterThan(0)
      expect(r.emoji.length).toBeGreaterThan(0)
      expect(r.lines.length).toBeLessThanOrEqual(24)
      for (const l of r.lines) expect(['good', 'bad', 'neutral']).toContain(l.tone)
    }
  })

  it('swaps reversed price bounds and formats numeric line values', () => {
    const r = readReportData(MALFORMED[8])
    expect([r.minPrice, r.maxPrice]).toEqual([5, 50])
    expect(r.price).toBe(50)
    const s = readReportData(MALFORMED[9])
    expect(s.maxProduction).toBe(0)
    expect(s.production).toBe(0)
    expect(s.lines).toEqual([{ label: 'Tax', value: '-$1,200', tone: 'neutral' }])
  })
})

describe('plan math', () => {
  it('projects cost, revenue and margin with sales capped by demand', () => {
    const r = readReportData(SAMPLE as unknown as Json)
    const p = projectPlan(r, 10, 30000)
    expect(p.productionCost).toBeCloseTo(96000)
    expect(p.available).toBe(31500)
    expect(p.sold).toBe(26000)
    expect(p.revenue).toBe(260000)
    expect(p.leftover).toBe(5500)
    expect(p.shortfall).toBe(0)
    const short = projectPlan(r, 10, 10000)
    expect(short.sold).toBe(11500)
    expect(short.shortfall).toBe(14500)
    expect(unitsToMeetDemand(r)).toBe(24500)
  })

  it('builds the approve result, clamped and rounded', () => {
    const r = readReportData(SAMPLE as unknown as Json)
    expect(JSON.parse(planResult(r, 12.3456, 1234.4))).toEqual({ price: 12.35, production: 1234 } satisfies AnnualReportResult)
    expect(JSON.parse(planResult(r, 999, 1e9))).toEqual({ price: 30, production: 60000 })
    expect(JSON.parse(planResult(r, Number.NaN, -5))).toEqual({ price: 2, production: 0 })
  })

  it('sizes, snaps and nudges on a round grid', () => {
    expect(niceStep(0.28)).toBe(0.5)
    expect(niceStep(9)).toBe(10)
    expect(niceStep(1500)).toBe(2000)
    expect(niceStep(0)).toBe(0.01)
    expect(snap(4.27, 2, 30, 0.5)).toBe(4.5)
    expect(snap(99, 2, 30, 0.5)).toBe(30)
    expect(nudge(9.5, 1, 2, 30, 0.5)).toBe(10)
    expect(nudge(9.7, -1, 2, 30, 0.5)).toBe(9.5)
    expect(nudge(9.7, 1, 2, 30, 0.5)).toBe(10)
    expect(nudge(2, -1, 2, 30, 0.5)).toBe(2)
    expect(nudge(29.9, 1, 2, 30, 0.5)).toBe(30)
  })

  it('formats prices and unit names', () => {
    expect(formatPrice(4.5, 0.1)).toBe('$4.50')
    expect(formatPrice(4.5, 1)).toBe('$4.50')
    expect(formatPrice(45, 1)).toBe('$45')
    expect(formatPrice(125000, 1000)).toBe('$125,000')
    expect(singularUnit('meals')).toBe('meal')
    expect(singularUnit('batteries')).toBe('battery')
    expect(singularUnit('boxes')).toBe('box')
    expect(singularUnit('bottles of wine')).toBe('bottle of wine')
    expect(singularUnit('kg')).toBe('kg')
    expect(singularUnit('glasses')).toBe('glass')
  })
})

describe('AnnualReport', () => {
  it('is registered as the annualReport minigame', () => {
    expect(MINIGAMES.annualReport).toBe(AnnualReport)
  })

  it('renders the statement, market note, both controls and the projection', () => {
    const { html } = renderReport(SAMPLE as unknown as Json)
    for (const s of [
      'Ramen Rocket',
      'Restaurant · Osaka, Japan',
      'FY 2031',
      '2031 results',
      'Plan for 2032',
      'Net profit',
      '$41,500',
      'Osaka eats out more',
      'Price per meal',
      'Production',
      '24,000 meals',
      'Suggested $11.00',
      'Demand ~26,000',
      'In stock 1,500',
      'Match demand',
      'Estimate',
      'Approve plan',
      'Keep last year&#x27;s plan',
    ])
      expect(html, s).toContain(s)
    expect(html).toContain('type="range"')
    expect(html).toMatch(/<label for="[^"]+-price"/)
    expect(html).toContain('aria-valuetext="$9.50"')
    expect(html).toContain('ar-line is-good is-total')
    // Production cost 24,000 x $3.20 and revenue min(25,500, 26,000) x $9.50
    expect(html).toContain('-$76,800')
    expect(html).toContain('$242,250')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('reports the plan as JSON, or skip', () => {
    const a = renderReport(SAMPLE as unknown as Json)
    a.click('Approve plan')
    expect(a.results).toHaveLength(1)
    expect(JSON.parse(a.results[0])).toEqual({ price: 9.5, production: 24000 })

    const b = renderReport(SAMPLE as unknown as Json)
    b.click("Keep last year's plan")
    expect(b.results).toEqual([SKIP_RESULT])
    expect(SKIP_RESULT).toBe('skip')
  })

  it('renders malformed data without crashing and still reports valid results', () => {
    for (const data of MALFORMED) {
      const { html, results, click } = renderReport(data)
      expect(html, JSON.stringify(data)).toContain('Approve plan')
      expect(html).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
      click('Approve plan')
      click("Keep last year's plan")
      const plan = JSON.parse(results[0]) as AnnualReportResult
      const r = readReportData(data)
      expect(plan.price).toBeGreaterThanOrEqual(r.minPrice)
      expect(plan.price).toBeLessThanOrEqual(r.maxPrice)
      expect(plan.production).toBeGreaterThanOrEqual(0)
      expect(plan.production).toBeLessThanOrEqual(r.maxProduction)
      expect(results[1]).toBe('skip')
    }
  })

  it('handles a business with no production capacity and an empty statement', () => {
    const { html } = renderReport({ ...SAMPLE, maxProduction: 0, production: 0, inventory: 0, lines: [] } as unknown as Json)
    expect(html).toContain('No trading figures yet')
    expect(html).toContain('No production capacity this year')
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*-production|<input[^>]*-production"[^>]*disabled=""/)
    expect(html).not.toContain('Match demand')
  })

  it('warns about selling below cost and about leftover stock', () => {
    const below = renderReport({ ...SAMPLE, price: 2 } as unknown as Json).html
    expect(below).toContain('below your $3.20 cost per meal')
    const glut = renderReport({ ...SAMPLE, production: 60000 } as unknown as Json).html
    expect(glut).toContain('would be left over')
  })
})

describe('Profile sheet: Business & Investments', () => {
  it('appears only when there is something to show', () => {
    const g = makeTestGame()
    g.character.age = 40
    mock.state.game = g
    mock.business = ''
    mock.investments = ''
    expect(renderToStaticMarkup(createElement(ProfileSheet, { onClose: () => {} }))).not.toContain('Business &amp; Investments')

    mock.business = 'Owns Ramen Rocket (restaurant, Osaka): $228K revenue, $41K profit last year.'
    mock.investments = 'Portfolio worth $120K: 3 stocks, 1 ETF.'
    const html = renderToStaticMarkup(createElement(ProfileSheet, { onClose: () => {} }))
    expect(html).toContain('Business &amp; Investments')
    expect(html).toContain('Owns Ramen Rocket')
    expect(html).toContain('Portfolio worth $120K')
  })
})
