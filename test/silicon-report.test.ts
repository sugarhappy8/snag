// Silicon 2.0: the Annual Report line (goodwill and price position), the market note and the hint suffix, the
// bargain tip, and the one segment index the Chips & Fabs rows and the Market & Competition screen share.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { bestTechPlan, marketReference, priceIndex, siliconOf, techView } from '../src/game/business/deeptech-core'
import { techReportData, techStatementLines } from '../src/game/business/deeptech-sim'
import { readTech } from '../src/game/business/deeptech-state'
import { newBiz } from '../src/game/business/founding'
import { localEcon } from '../src/game/business/economy'
import { mySegment, segmentsOf, type SegmentId } from '../src/game/business/market-view'
import { CHIP_LANES } from '../src/game/business/silicon-data'
import { reportLine } from '../src/game/business/silicon-text'
import { bizOf, type BizState } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { priceTip } from '../src/ui/minigames/AnnualReport'
import { adultIn } from './deeptech-kit'
import { chipLab, company, labOf, playYear, type Lab } from './silicon-kit'

const EM_DASH = String.fromCharCode(0x2014)
const LABEL = 'Goodwill · price vs market'
const CAP = ', within your cap of 60% of the market'

/** The silicon state of a lab at a goodwill, with a booked year of the given price index. */
function warm(L: Lab, goodwill: number, last: { year?: number; index?: number } | null = {}): void {
  const s = siliconOf(L.t)
  s.goodwill = goodwill
  s.last = last && { year: last.year ?? 2025, index: last.index ?? 0.88, served: 1, depth: 0.1, win: 1, step: 0, perf: 0, quality: 0 }
}

describe('the Annual Report line', () => {
  it('reads goodwill and the price position as one line', () => {
    const L = chipLab({ year: 2025 })
    warm(L, 62)
    expect(reportLine(L.t, 2025)).toEqual({ label: LABEL, value: '62 (warm) · 0.88x', tone: 'good' })
    const tones = [44, 45, 55, 56].map((n) => (warm(L, n), reportLine(L.t, 2025)!.tone))
    expect(tones).toEqual(['bad', 'neutral', 'neutral', 'good'])
    warm(L, 30, { index: 1.1 })
    expect(reportLine(L.t, 2025)).toEqual({ label: LABEL, value: '30 (cool) · 1.10x', tone: 'bad' })
  })

  it('is absent with no silicon state, no booked year or another year', () => {
    const L = chipLab({ year: 2025 })
    expect(L.t.silicon).toBeUndefined()
    expect(reportLine(L.t, 2025)).toBeNull()
    expect(reportLine(readTech(undefined), 2025)).toBeNull()
    warm(L, 62)
    expect(reportLine(L.t, 2026)).toBeNull()
    warm(L, 62, null)                                                      // a lane or a policy only
    expect(reportLine(L.t, 2025)).toBeNull()
  })

  it('sits right after the units line of the statement, and only for the year it booked', { timeout: 300_000 }, () => {
    const L0 = chipLab({ year: 2025 })
    playYear(L0.g)
    const { g, a, b, t } = labOf(L0.g), s = b.last!
    expect(t.silicon?.last?.year).toBe(s.year)
    const lines = techStatementLines(b, t, s), want = reportLine(t, s.year)!
    expect(lines[0].label).toMatch(/ sold$/)
    expect(lines[1]).toEqual(want)
    expect(techStatementLines(b, t, { ...s, year: s.year - 1 }).some((x) => x.label === LABEL)).toBe(false)
    expect(techReportData(g, a, b).lines[1]).toEqual(want)
    // Without a units line it is the first line; a trade with no silicon state never has it.
    expect(techStatementLines(b, t, { ...s, sold: 0, demand: 0 })[0]).toEqual(want)
    const old = chipLab({ year: 2020 })
    playYear(old.g)
    const o = labOf(old.g)
    expect(o.t.silicon).toBeUndefined()
    expect(techStatementLines(o.b, o.t, o.b.last!).some((x) => x.label === LABEL)).toBe(false)
  })
})

describe('the market note and the hint', () => {
  const noteOf = (L: Lab) => techReportData(L.g, L.a, L.b).marketNote

  it('tells a chip lab what chips like its own sell for, and points to the lanes only while one is open', () => {
    const L = chipLab({ year: 2025 })
    const note = noteOf(L)
    expect(note).toContain('Chips like yours sell for about')
    expect(note).not.toContain('A typical chip')
    expect(note).toContain("Set each chip line's discount under Chips & Fabs.")
    // 1990: no graphics, CPU, memory or accelerator line yet.
    const early = chipLab({ year: 1990 })
    expect(noteOf(early)).toContain('Chips like yours sell for about')
    expect(noteOf(early)).not.toContain("Set each chip line's discount")
    // A fab opens the memory line.
    const fab = chipLab({ year: 1990, patch: { plant: 1 } })
    expect(noteOf(fab)).toContain("Set each chip line's discount under Chips & Fabs.")
  })

  it('names the core reference of the year, in dollars', () => {
    const L = chipLab({ year: 2025 })
    const ref = marketReference(L.g, L.b, L.t, CHIP_LANES[0], L.g.year)
    expect(noteOf(L)).toContain(`Chips like yours sell for about ${money(ref)} here.`)
  })

  it('leaves another trade\'s note alone', () => {
    const g = adultIn('us', 5_000_000, 3, 95, 2025)
    const a = company(g, 'aiLab', { stage: 2, models: [{ gen: 1, name: 'Nova 1', score: 60, open: false, year: 2024 }] })
    const note = techReportData(g, a, bizOf(g, a)).marketNote
    expect(note).toContain('A typical')
    expect(note).not.toContain('Chips like yours')
    expect(note).not.toContain('Set each chip line')
  })

  it('adds the cap to the Business talent hint only when it clipped the plan', () => {
    const make = (ceiling: number): Lab => {
      const L = chipLab({ year: 2025 })
      L.g.character.talents = ['Business']
      L.b.quality = 0
      L.b.brand = 0
      if (ceiling > 0) siliconOf(L.t).ceiling = ceiling
      return L
    }
    const capped = make(0.6)
    const best = bestTechPlan(capped.g, capped.b, capped.t)
    expect(best.limit).toBeDefined()
    expect(best.price).toBeGreaterThanOrEqual(best.limit!)                                        // the cap clipped it
    const hint = techReportData(capped.g, capped.a, capped.b).talentHint
    expect(hint?.text).toMatch(/earns the most next year, within your cap of 60% of the market\.$/)
    expect(hint?.text.endsWith(`next year${CAP}.`)).toBe(true)

    const plain = make(0)
    expect(techReportData(plain.g, plain.a, plain.b).talentHint?.text).not.toContain('within your cap')
    expect(techReportData(plain.g, plain.a, plain.b).talentHint?.text).toMatch(/earns the most next year\.$/)

    const loose = make(1.3)
    const free = bestTechPlan(loose.g, loose.b, loose.t)
    expect(free.price).toBeLessThan(free.limit!)                                                  // a cap that doesn't clip
    expect(techReportData(loose.g, loose.a, loose.b).talentHint?.text).not.toContain('within your cap')
    // Without the talent there is no hint at all.
    const none = make(0.6)
    none.g.character.talents = []
    expect(techReportData(none.g, none.a, none.b).talentHint).toBeUndefined()
  })
})

describe('the bargain tip', () => {
  const r = { unitCost: 10, suggestedPrice: 100, unitLabel: 'chips' }
  it('says what a bargain price does, for any trade', () => {
    expect(priceTip(r, 80, 1)).toEqual({ tone: 'neutral', text: 'Bargain pricing. More buyers, thinner margins.' })
    expect(priceTip({ ...r, unitLabel: 'meals' }, 85, 1).text).toBe('Bargain pricing. More buyers, thinner margins.')
  })
  it('leaves the other tips as they were', () => {
    expect(priceTip(r, 5, 1)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^That's below your .+ cost per chip\. Every sale loses money\.$/) })
    expect(priceTip(r, 160, 1)).toEqual({ tone: 'bad', text: 'Luxury pricing. A few big spenders, a lot of window shoppers.' })
    expect(priceTip(r, 120, 1)).toEqual({ tone: 'neutral', text: 'Premium pricing. Fewer buyers, fatter margins.' })
    expect(priceTip(r, 100, 1)).toEqual({ tone: 'good', text: 'Right around the going rate here.' })
  })
})

describe('one segment index', () => {
  it('marketViewOf carries the core index for a chip company only', () => {
    const L = chipLab({ year: 2025 })
    const v = marketViewOf(L.g, L.b)
    expect(v.index).toBe(priceIndex(L.b.price, marketReference(L.g, L.b, techView(L.b), CHIP_LANES[0], L.g.year)))
    expect(Number.isFinite(v.index)).toBe(true)
    const g = adultIn('us', 5_000_000, 3, 95, 2025)
    const soft = bizOf(g, company(g, 'software'))
    expect(marketViewOf(g, soft).index).toBeUndefined()
  })

  it('the Segments screen and the Chips & Fabs row name the same segment', () => {
    for (const patch of [{}, { node: 6 }, { node: 0, level: 20 }]) {
      const L = chipLab({ year: 2025, patch })
      const v = marketViewOf(L.g, L.b)
      expect(segmentsOf(L.b, v).find((x) => x.mine)!.id).toBe(mySegment(L.b, v.index))
    }
  })

  it('prices a 2nm chip at its own premium as the market price, not as a luxury', () => {
    const L = chipLab({ year: 2025, patch: { node: 6 } })
    expect(mySegment(L.b, 1)).not.toBe(mySegment(L.b))
    expect(mySegment(L.b, 1)).toBe(mySegment({ ...L.b, quality: L.b.quality, price: localEcon(L.b.industry, L.b.countryId, L.b.city).goingPrice }))
  })

  const OLD = (b: BizState): SegmentId => {
    const going = localEcon(b.industry, b.countryId, b.city).goingPrice
    const ratio = going > 0 && b.price > 0 ? b.price / going : 1
    const score = (ratio - 1) * 1.2 + (b.quality - 55) / 60
    return score < -0.28 ? 'budget' : score < 0.28 ? 'mass' : score < 0.85 ? 'premium' : 'luxury'
  }

  it('without an index (or with a useless one) is the old formula, for every trade', () => {
    const g = adultIn('us', 5_000_000, 3, 95, 2025), city = g.character.city
    for (const id of INDUSTRY_IDS) {
      const b = newBiz(g, id, 'us', city)
      const going = localEcon(id, 'us', city).goingPrice
      for (const k of [0.4, 0.8, 1, 1.3, 2, 3]) {
        for (const q of [20, 55, 90]) {
          b.price = going * k
          b.quality = q
          const tag = `${id} price x${k} quality ${q}`
          expect(mySegment(b), tag).toBe(OLD(b))
          expect(mySegment(b, undefined), tag).toBe(OLD(b))
          expect(mySegment(b, Number.NaN), tag).toBe(OLD(b))
        }
      }
    }
  })

  it('reads a given index as the price ratio', () => {
    const g = adultIn('us', 5_000_000, 3, 95, 2025)
    const b = newBiz(g, 'semiconductor', 'us', g.character.city)
    b.price *= 5
    const at = (q: number, index?: number) => ((b.quality = q), mySegment(b, index))
    expect([at(20, 1), at(55, 1), at(90, 1)]).toEqual(['budget', 'mass', 'premium'])
    expect(at(55, 2.5)).toBe('luxury')
    expect(at(55, 0.4)).toBe('budget')
  })
})

describe('the new report strings', () => {
  it('stay within 180 characters and carry no em-dash', { timeout: 300_000 }, () => {
    const L = chipLab({ year: 2025 })
    warm(L, 62)
    L.g.character.talents = ['Business']
    siliconOf(L.t).ceiling = 0.6
    L.b.quality = 0
    L.b.brand = 0
    const data = techReportData(L.g, L.a, L.b)
    const row = reportLine(L.t, 2025)!
    const strings = [row.label, row.value, data.marketNote, data.talentHint?.text ?? '', priceTip({ unitCost: 10, suggestedPrice: 100, unitLabel: 'chips' }, 80, 1).text, CAP]
    for (const x of [row.label, row.value, "Set each chip line's discount under Chips & Fabs.", data.talentHint?.text ?? '', priceTip({ unitCost: 10, suggestedPrice: 100, unitLabel: 'chips' }, 80, 1).text]) {
      expect(x.length, x).toBeLessThanOrEqual(180)
    }
    for (const x of strings) expect(x).not.toContain(EM_DASH)
    expect(data.talentHint?.text).toContain('within your cap')
  })
})
