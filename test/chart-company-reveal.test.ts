// R1 review (charts-data): the company cockpit's KPI spec (src/game/hubs/company.ts companyKpiSpec) is a chart builder
// like any other, so it goes through reveal() (roadmap D.2: "every builder passes its output through reveal(spec)"), and
// it names the price basis of its money series like the Annual Report tiles do. R3 replaces the body of reveal() to hide
// what the player has not learned; a builder that skips it would keep plotting everything.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bizOf, findBusiness } from '../src/game/business/state'
import { bindMoneyContext, moneyDisplay, setMoneyDisplay } from '../src/game/core'
import type { ChartSpec } from '../src/game/charts/spec'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { ownerGame } from './charts-kit'

const seen = vi.hoisted(() => ({ specs: [] as unknown[], hide: false }))

// reveal() as R3 might write it: it can change what a spec says. By default it is the identity, and it records each call.
vi.mock('../src/game/charts/reveal', () => ({
  reveal: <T extends { title: string }>(spec: T): T => {
    seen.specs.push(spec)
    return seen.hide ? { ...spec, title: 'Hidden for now' } : spec
  },
}))

const { companyKpiSpec } = await import('../src/game/hubs/company')

const saved = { ...moneyDisplay() }
// Building the company runs the other builders (the Annual Report), which call reveal too: count from the test's own call.
beforeEach(() => {
  seen.specs.length = 0
})
afterEach(() => {
  seen.hide = false
  setMoneyDisplay({ mode: saved.mode, nominal: saved.nominal })
  bindMoneyContext(null)
})

let owner: ReturnType<typeof ownerGame>
beforeAll(() => {
  owner = ownerGame({ years: 3 })
}, 120_000)

describe('companyKpiSpec and reveal', () => {
  it('passes the spec it returns through reveal, once', () => {
    const spec = companyKpiSpec(owner.g, owner.a)
    expect(spec).not.toBeNull()
    expect(seen.specs).toHaveLength(1)
    expect(seen.specs[0]).toBe(spec)
  })

  it('returns what reveal returns, so a spec reveal changes reaches the cockpit changed', () => {
    seen.hide = true
    const spec = companyKpiSpec(owner.g, owner.a) as ChartSpec
    expect(spec.title).toBe('Hidden for now')
  })

  it('does not call reveal when there is nothing to draw', () => {
    const g = structuredClone(owner.g)
    const a = findBusiness(g, owner.a.id)!
    bizOf(g, a).last = null
    expect(companyKpiSpec(g, a)).toBeNull()
    expect(seen.specs).toHaveLength(0)
  })
})

describe('companyKpiSpec basis', () => {
  it('names today money as its price basis', () => {
    setMoneyDisplay({ nominal: false })
    expect(companyKpiSpec(owner.g, owner.a)!.basis).toBe(PRESENT_YEAR)
  })

  it('names the year lived when the player reads prices as they were', () => {
    setMoneyDisplay({ nominal: true })
    expect(companyKpiSpec(owner.g, owner.a)!.basis).toBe(owner.g.year)
  })
})
