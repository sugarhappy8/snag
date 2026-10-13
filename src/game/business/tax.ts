// Corporate profit follows where revenue was earned. One-off income that was not attributed to
// a foreign contract stays at headquarters; otherwise a partial foreign booking could
// accidentally move every other dollar of income into the foreign jurisdiction too.
import { corporateTax } from '../data/markets'
import { economyOf } from '../economy'
import { corporateDelta } from '../nation/effects'
import type { GameState } from '../types'

type CountryAmounts = number | Readonly<Record<string, number>>

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/** Allocate one profit figure across operating sales, attributed one-offs, and HQ one-offs. */
export function allocatedCorporateTax(
  homeCountry: string,
  profit: number,
  operatingSales: CountryAmounts,
  yearIncome: number,
  bookedSales: CountryAmounts,
  game?: GameState,
  year?: number,
  industry = '',
): number {
  if (!(profit > 0) || !Number.isFinite(profit)) return 0
  // A government's own corporate rate, windfall taxes and breaks (nation/) add to the country's rate.
  const taxFor = (country: string, amount: number) => Math.max(0, Math.min(amount, corporateTax(country, amount) + amount * (game ? economyOf(game, country, year ?? game.year).taxShift + corporateDelta(game, country, industry, year ?? game.year) : 0)))
  // Keep each revenue component separate until allocation. Adding two valid values near
  // Number.MAX_VALUE can overflow even though their relative weights are still well defined.
  const parts: { country: string; value: number }[] = []
  const add = (country: string, amount: number) => {
    const value = positive(amount)
    if (value <= 0) return
    parts.push({ country: country || homeCountry, value })
  }
  const addAmounts = (amounts: CountryAmounts): number => {
    if (typeof amounts === 'number') {
      const value = positive(amounts)
      add(homeCountry, value)
      return value
    }
    let total = 0
    for (const [country, raw] of Object.entries(amounts)) {
      const value = positive(raw)
      add(country, value)
      // This total is only used to decide whether any year income remains unattributed.
      // Saturation preserves that comparison without allowing a finite save to make Infinity.
      total = Math.min(Number.MAX_VALUE, total + value)
    }
    return total
  }

  addAmounts(operatingSales)
  const attributedIncome = addAmounts(bookedSales)
  add(homeCountry, Math.max(0, positive(yearIncome) - attributedIncome))

  const scale = parts.reduce((max, part) => Math.max(max, part.value), 0)
  if (!(scale > 0) || !Number.isFinite(scale)) return taxFor(homeCountry, profit)
  const weights = new Map<string, number>()
  for (const part of parts) weights.set(part.country, (weights.get(part.country) ?? 0) + part.value / scale)
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0)
  if (!(total > 0) || !Number.isFinite(total)) return taxFor(homeCountry, profit)
  let tax = 0
  for (const [country, weight] of weights) tax += taxFor(country, profit * (weight / total))
  return Number.isFinite(tax) ? Math.max(0, tax) : taxFor(homeCountry, profit)
}
