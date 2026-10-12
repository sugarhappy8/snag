// Investment Firms 2.0 review regressions: unique startup names, a hired CEO who leaves pitches
// for the owner, and LPs who won't fund a manager that never invests.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { fundNodes } from '../src/game/business/fund'
import { investInPitch } from '../src/game/business/fund-actions'
import { readFund, saveFund, type FundState } from '../src/game/business/fund-state'
import { fundLine } from '../src/game/business/fund-text'
import { newVcFund, openPitches, pitchesFor, raiseQuote } from '../src/game/business/fund-vc'
import { bizOf, readBiz } from '../src/game/business/state'
import { ageBusinessYear, drain, firm, menuText } from './fund-fixtures'

/** Run a VC firm's owner-CEO for some years, backing every pitch (follow-ons and raises accepted). */
function ownerVc(lifeId: string, year: number, years: number, back = true) {
  const { g, a } = firm('vc', { year, lifeId })
  g.character.job = null
  becomeCeo(g, a, bizOf(g, a)); g.queue = []
  const seen: { year: number; names: string[]; portfolio: Set<string> }[] = []
  for (let y = 0; y < years; y++) {
    const b = readBiz(g, a), f = readFund(b)
    seen.push({ year: g.year, names: pitchesFor(g, b, f, g.year).map(p => p.name), portfolio: new Set(f.cos.filter(c => c.born < g.year).map(c => c.name)) })
    if (back) for (const p of openPitches(g, b, f, g.year)) investInPitch(g, a.id, p.id)
    ageBusinessYear(g)
    drain(g, m => m.choices.find(c => c.id === (back ? 'invest' : 'pass') || c.id === 'safe' || c.id === 'cooperate')?.id ?? m.choices[0].id)
    g.character.age = 40
  }
  return { g, a, seen }
}

describe('venture capital: startup names', () => {
  it('never pitches two startups with the same name in a year, or one the firm already backed', () => {
    let years = 0, names = 0
    for (let i = 0; i < 6; i++) {
      // A 2015 US firm draws from the 2015 syllables (the "Novagrid twice" report).
      for (const s of ownerVc(`names-${i}`, 2015, 14).seen) {
        years++; names += s.names.length
        expect(new Set(s.names.map(n => n.toLowerCase())).size, `${s.year}: ${s.names.join(', ')}`).toBe(s.names.length)
        for (const n of s.names) expect(s.portfolio.has(n), `${s.year}: ${n} is already in the portfolio`).toBe(false)
      }
    }
    expect(years).toBe(84)
    expect(names).toBeGreaterThan(200)
  }, 120_000)

  it('keeps a year’s pitches identical while the player invests in them', () => {
    const { g, a, b } = firm('vc', { year: 2015 })
    const before = pitchesFor(g, b, readFund(b), 2015)
    for (const p of before.slice(0, 2)) expect(investInPitch(g, a.id, p.id)).toBe(true)
    const live = bizOf(g, a)
    expect(pitchesFor(g, live, readFund(live), 2015)).toEqual(before)
  })

  it('renames a pitch that would repeat an older portfolio company, without touching the rest', () => {
    const { g, b } = firm('vc', { year: 2015 })
    const f = readFund(b)
    const plain = pitchesFor(g, b, f, 2015)
    // Pretend the firm backed a company with the first pitch's name last year.
    const old: FundState = { ...f, cos: [{ id: '2014.0', name: plain[0].name, emoji: '🚀', sector: 'Software', fund: 1, q: 50, stage: 0, val: 5e6, own: .1, cost: 5e5, born: 2014, status: 'dead', end: 2015, got: 0, how: 'ran out of money', round: null, unicorn: false }] }
    const renamed = pitchesFor(g, b, old, 2015)
    expect(renamed[0].name).not.toBe(plain[0].name)
    expect(renamed.map(p => ({ ...p, name: '' }))).toEqual(plain.map(p => ({ ...p, name: '' })))
  })
})

describe('venture capital: a hired CEO and the owner', () => {
  it('leaves the pitches it passes on for an owner who isn’t running the firm', () => {
    const { g, a } = firm('vc', { year: 2010, skill: 60, lifeId: 'mgr-vc' })
    let open = 0, offered = 0
    for (let y = 0; y < 10; y++) {
      ageBusinessYear(g); drain(g)
      const b = readBiz(g, a), f = readFund(b)
      const all = pitchesFor(g, b, f, g.year), left = openPitches(g, b, f, g.year)
      const backed = f.cos.filter(c => c.born === g.year)
      expect(backed.length).toBeLessThanOrEqual(3)
      // Only the CEO's own picks are off the table.
      expect(left.map(p => p.id).sort()).toEqual(all.filter(p => !backed.some(c => c.id === p.id)).map(p => p.id).sort())
      offered += all.length; open += left.length
    }
    expect(offered).toBeGreaterThan(20)
    expect(open).toBeGreaterThan(5)
    // The owner can still back one of them.
    const b = readBiz(g, a), f = readFund(b)
    const left = openPitches(g, b, f, g.year)
    if (left.length) expect(investInPitch(g, a.id, left[0].id)).toBe(true)
  }, 60_000)

  it('explains an empty pitch list instead of a bare "No pitches right now"', () => {
    const { g, a } = firm('vc', { year: 2015 })
    const b = bizOf(g, a), f = readFund(b)
    f.funds[0].dry = 0; f.funds[0].invested = f.funds[0].size * .8
    saveFund(b, f)
    const text = menuText(g, fundNodes(g, a)).join('\n')
    expect(text).not.toMatch(/No pitches right now/)
    expect(text).toMatch(/Fund I has finished investing/)
  })
})

describe('venture capital: LPs judge what you invested', () => {
  it('a firm that never backs a startup can’t keep raising funds just to collect fees', () => {
    const { g, a } = ownerVc('lazy-vc', 1990, 26, false)
    const f = readFund(readBiz(g, a))
    expect(f.cos).toHaveLength(0)
    expect(f.funds).toHaveLength(1)
    const q = raiseQuote(g, readBiz(g, a), f, g.year)
    expect(q.size).toBe(0)
    expect(q.block).toMatch(/barely invested/)
  }, 60_000)

  it('sizes the next fund by how much of the last one went to work', () => {
    const { g, b } = firm('vc', { year: 2000 })
    const f = readFund(b)
    const after = (invested: number): FundState => {
      const x = newVcFund(1, 30e6, 2000)
      x.invested = invested; x.dry = 24e6 - invested; x.fees = 3e6; x.dist = 1.2 * (invested + 3e6)
      return { ...f, funds: [x], cos: [] }
    }
    const full = raiseQuote(g, b, after(24e6), 2006), half = raiseQuote(g, b, after(.35 * 24e6), 2006), none = raiseQuote(g, b, after(0), 2006)
    expect(full.block).toBeNull()
    expect(half.block).toBeNull()
    expect(half.size).toBeLessThan(full.size * .7)
    expect(half.size).toBeGreaterThan(0)
    expect(none.block).toBeTruthy()
    // After the fee years the unused money goes back to LPs: that doesn't count as invested.
    const old = after(0)
    old.funds[0].dry = 0
    expect(raiseQuote(g, b, old, 2012).block).toBeTruthy()
  })

  it('shows no multiple for a fund that hasn’t backed anyone, and no "carry $0" in the report', () => {
    const { g, a, b } = firm('vc', { year: 2015 })
    expect(fundLine(readFund(b), 1, 2016)).toMatch(/no startups yet · \$[\d.]+M to invest/)
    expect(fundLine(readFund(b), 1, 2016)).not.toMatch(/0\.0×/)
    g.character.job = null
    becomeCeo(g, a, bizOf(g, a)); g.queue = []
    ageBusinessYear(g)
    const report = g.queue.find(m => m.kind === 'notice' && m.title.endsWith('Financial Institution Report'))
    expect(report && report.kind === 'notice' ? report.text : '').not.toMatch(/carry \$0/)
  })
})
