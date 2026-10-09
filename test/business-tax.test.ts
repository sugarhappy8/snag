import { describe, expect, it } from 'vitest'
import { allocatedCorporateTax } from '../src/game/business/tax'
import { corporateTax } from '../src/game/data/markets'

describe('corporate tax allocation', () => {
  it('allocates attributed sales abroad while leaving unrelated one-off income at headquarters', () => {
    const profit = 20_000_000
    const tax = allocatedCorporateTax('us', profit, 0, 20_000_000, { ae: 10_000_000 })
    expect(tax).toBe(corporateTax('us', profit / 2) + corporateTax('ae', profit / 2))
  })

  it('combines multi-country operations and bookings without giving weight to malformed amounts', () => {
    const profit = 40_000_000
    const tax = allocatedCorporateTax('us', profit, { us: 10, jp: 10 }, 20, { ae: 10, gb: Number.NaN })
    const quarter = profit / 4
    expect(tax).toBe(corporateTax('us', profit / 2) + corporateTax('jp', quarter) + corporateTax('ae', quarter))
  })

  it('keeps extreme finite save values finite while preserving their relative allocation', () => {
    const profit = 1e308
    const homeOnly = allocatedCorporateTax('us', profit, { us: 1e308 }, 1e308, { us: 1e308 })
    const split = allocatedCorporateTax('us', profit, { us: 1e308 }, 1e308, { ae: 1e308 })

    expect(homeOnly).toBe(corporateTax('us', profit))
    expect(split).toBe(corporateTax('us', profit / 2) + corporateTax('ae', profit / 2))
    expect(Number.isFinite(homeOnly)).toBe(true)
    expect(Number.isFinite(split)).toBe(true)
  })
})
