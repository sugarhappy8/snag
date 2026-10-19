// R&D 3.0 task 1 (docs/superpowers/specs/2026-10-19-rd3-design.md S4.1): every trade has a tech tier,
// and every trade has the ageing style its products really have.
import { describe, expect, it } from 'vitest'
import { INDUSTRIES, RD_TIER, rdTierOf, type RdTier } from '../src/game/business/industries'
import { isDeepTechIndustry } from '../src/game/business/deeptech-state'
import { effectiveQuality } from '../src/game/business/product-market'
import { AGEING, ageStyleOf, styleOf } from '../src/game/business/products'

const IDS = Object.keys(INDUSTRIES).sort()

function count(tier: RdTier): number {
  return Object.values(RD_TIER).filter((t) => t === tier).length
}

describe('the tier table', () => {
  it('RD_TIER has exactly the 56 trades of INDUSTRIES', () => {
    expect(Object.keys(RD_TIER).sort()).toEqual(IDS)
    expect(IDS).toHaveLength(56)
  })

  it('breakthrough is exactly the deep-tech trades', () => {
    for (const id of IDS) expect(RD_TIER[id as keyof typeof RD_TIER] === 'breakthrough').toBe(isDeepTechIndustry(id))
    expect(count('breakthrough')).toBe(12)
  })

  it('the tiers hold 21, 13, 10 and 12 trades', () => {
    expect([count('low'), count('mid'), count('high'), count('breakthrough')]).toEqual([21, 13, 10, 12])
  })

  it('rdTierOf reads anything that is not a trade as mid', () => {
    for (const id of ['nope', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(rdTierOf(id)).toBe('mid')
    expect(rdTierOf('restaurant')).toBe('low')
    expect(rdTierOf('brewery')).toBe('mid')
    expect(rdTierOf('software')).toBe('high')
    expect(rdTierOf('quantum')).toBe('breakthrough')
  })
})

describe('the ageing table', () => {
  it('AGEING is total, keeps the 27 STYLE ids and moves exactly 14', () => {
    expect(Object.keys(AGEING).sort()).toEqual(IDS)
    // The 27 ids STYLE lists (the devices trade among them) read anything but 'service' from styleOf, and keep that value.
    const listed = IDS.filter((id) => styleOf(id) !== 'service')
    expect(listed).toHaveLength(27)
    for (const id of listed) expect(AGEING[id as keyof typeof AGEING]).toBe(styleOf(id))

    const goods = ['autoShop', 'construction', 'logistics', 'energy', 'water', 'recycling', 'packaging', 'furniture', 'clinic']
    const tech = ['telecom', 'dataCenter', 'battery', 'solar', 'onlineBank']
    const service = ['salon', 'gym', 'realEstate', 'marketing', 'hotel', 'entertainment', 'education', 'petCare', 'homeCare', 'travel', 'casino', 'nightclub', 'stripClub', 'investmentFirm', 'bank']
    for (const id of goods) expect(AGEING[id as keyof typeof AGEING]).toBe('goods')
    for (const id of tech) expect(AGEING[id as keyof typeof AGEING]).toBe('tech')
    for (const id of service) expect(AGEING[id as keyof typeof AGEING]).toBe('service')

    expect(IDS.filter((id) => AGEING[id as keyof typeof AGEING] !== styleOf(id))).toHaveLength(14)
  })

  it('ageStyleOf reads AGEING, and an id that is not a trade reads what styleOf does', () => {
    for (const id of IDS) expect(ageStyleOf(id)).toBe(AGEING[id as keyof typeof AGEING])
    for (const id of ['nope', '', 'constructor', '__proto__', 'toString']) expect(ageStyleOf(id)).toBe(styleOf(id))
  })

  it('effectiveQuality ages an unmoved trade as before and a moved one faster, capped at 30', () => {
    const line = { launched: 2000, boost: 0, quality: 70 }
    expect(effectiveQuality(line, 'restaurant', 2011)).toBeCloseTo(70 - 0.5 * 10, 9)
    expect(effectiveQuality(line, 'autoShop', 2011)).toBeCloseTo(70 - 1.2 * 10, 9)
    expect(effectiveQuality(line, 'telecom', 2011)).toBeCloseTo(70 - 2 * 10, 9)
    // 2100: the age is 99 years, so even food's .5 a year reaches the cap (at 2060 it would be 59 x .5 = 29.5, short of it)
    for (const id of Object.keys(INDUSTRIES)) expect(effectiveQuality(line, id, 2100)).toBe(40)
  })
})
