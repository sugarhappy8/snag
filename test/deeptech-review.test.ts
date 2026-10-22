// Deep tech, adversarial review: money that could be pulled out of grants, windfalls, side
// revenue and investors; purple hints that have to follow the game's own math; and owners who
// are too young to run a lab.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { businessAssetView, businessCareerMenu } from '../src/game/business'
import { earnTech, operatingValue, refreshTechValue, revalue, techOf, techView } from '../src/game/business/deeptech-core'
import { PROGRAMS, grantsFor } from '../src/game/business/deeptech-data'
import { awardGrant, grantAmount, pushOdds } from '../src/game/business/deeptech-funding'
import { cancelProgram, startProgram } from '../src/game/business/deeptech-rd'
import { presentDeepTechEvent } from '../src/game/business/deeptech-events'
import { simInternals } from '../src/game/business/deeptech-sim'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { equipmentValue, industryHint, localEcon } from '../src/game/business/economy'
import { closeBusiness, sellBusiness } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets, readBiz, stakeValue } from '../src/game/business/state'
import { DEEP_TECH_IDS, INDUSTRY_IDS, isIndustryLegal } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, Asset, ChoiceModal, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { openTiles } from './helpers'

function adultIn(countryId: string, money: number, seed = 3, smarts = 90): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = money
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = smarts
  c.licenses = ['driver']
  c.talent = null
  c.talents = []
  return g
}

function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
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

const YEAR_PREFS = ['sign', 'savings', 'pay', 'decline', 'patch', 'recall', 'help', 'disclose', 'fix', 'investor', 'loan', 'steady', 'closed', 'pause', 'license', 'program', 'quiet', 'fair', 'let', 'settle']

function all(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...all(g, n.children(g))] : [n]))
}

function act(g: GameState, a: Asset, id: string): MenuAction {
  const node = all(g, businessAssetView(g, a)).find((n) => n.id === `${id}.${a.id}`)
  if (!node || node.type !== 'action') throw new Error(`no action ${id}`)
  return node
}

function startRows(g: GameState): MenuNode[] {
  const start = businessCareerMenu.children(g).find((n) => n.id === 'biz.start')
  if (!start || start.type !== 'menu') throw new Error('no start menu')
  return start.children(g)
}

/** A player-run deep-tech company set up directly (skips the founding popups). */
function company(g: GameState, industry: string, patch: Partial<TechState> = {}, opts: { cash?: number; share?: number } = {}): Asset {
  const c = g.character
  const b = newBiz(g, industry as (typeof INDUSTRY_IDS)[number], c.countryId, c.city, { cash: opts.cash ?? 0, share: opts.share ?? 1 })
  const t = readTech(undefined)
  Object.assign(t, { level: 40, ...patch })
  b.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

describe('deep tech review: grants', () => {
  it('pays a capital grant back when the project it paid for is cancelled (no grant-then-cancel money)', () => {
    const g = adultIn('jp', 1_000_000, 5)
    const a = company(g, 'semiconductor', { level: 60, stage: 2, done: ['firstChip', 'volume'] })
    const b = bizOf(g, a)
    const t = techOf(b)
    const fab = startProgram(g, b, t, PROGRAMS.semiconductor.find((p) => p.id === 'fab')!)!
    const meti = grantsFor('jp', 'semiconductor').find((x) => x.id === 'jp-meti')!
    const amount = grantAmount(b, t, meti)
    expect(amount).toBeGreaterThan(100_000_000)
    awardGrant(g, t, meti, amount)
    expect(t.venture).toBe(amount)
    // The confirm warns about it, and cancelling sends it all back (none of it was spent).
    const cancel = act(g, a, `dt.cancel.${fab.key}`)
    expect(cancel.confirm?.(g)).toMatch(/goes back to the agency/)
    cancel.run(g)
    drain(g)
    const after = techView(readBiz(g, a))
    expect(after.programs).toHaveLength(0)
    expect(after.venture).toBe(0)
    expect(after.yearGrant).toBe(0)
    expect(readBiz(g, a).cash).toBe(0)
    // And the year books no grant profit.
    ageUp(g)
    drain(g, YEAR_PREFS)
    const s = readBiz(g, a).last!
    expect(s.otherIncome).toBeLessThan(1_000_000)
    expect(s.net).toBeLessThan(0)
  })

  it('pays back the unbuilt share of a capital grant after the project is partly built', () => {
    const g = adultIn('jp', 1_000_000, 6)
    const a = company(g, 'semiconductor', { level: 60, stage: 2, done: ['firstChip', 'volume'], venture: 600_000_000, raised: 600_000_000, series: 4 }, { share: 0.4 })
    const b = bizOf(g, a)
    const t = techOf(b)
    const fab = startProgram(g, b, t, PROGRAMS.semiconductor.find((p) => p.id === 'fab')!)!
    const meti = grantsFor('jp', 'semiconductor').find((x) => x.id === 'jp-meti')!
    const amount = grantAmount(b, t, meti)
    awardGrant(g, t, meti, amount)
    ageUp(g)
    drain(g, YEAR_PREFS)
    const b2 = bizOf(g, a)
    const t2 = techOf(b2)
    const p = t2.programs.find((x) => x.key === fab.key)
    expect(p, 'the fab is a three-year build').toBeTruthy()
    const v0 = t2.venture
    const gone = cancelProgram(g, b2, t2, fab.key)!
    // Two of three years unbuilt: 40% of two years of fab spending goes back.
    expect(gone.repaid).toBe(Math.round(Math.min(amount, 0.4 * (p!.years - p!.progress) * p!.cost)))
    expect(gone.repaid).toBeGreaterThan(amount * 0.5)
    expect(t2.venture).toBe(v0 - gone.repaid)
    expect(t2.grants[0].repaid).toBe(gone.repaid)
    // It can't be clawed back twice.
    expect(cancelProgram(g, b2, t2, fab.key)).toBeNull()
  })

  it('pays back this year\'s research grant share of a cancelled program, and grants never turn R&D into profit', () => {
    const g = adultIn('us', 1_000_000, 7)
    const a = company(g, 'quantum', { venture: 30_000_000, raised: 30_000_000, series: 2, qubits: 120 }, { share: 0.7 })
    const b = bizOf(g, a)
    const t = techOf(b)
    const qec = startProgram(g, b, t, PROGRAMS.quantum.find((p) => p.id === 'qec')!)!
    const darpa = grantsFor('us', 'quantum').find((x) => x.id === 'us-darpa')!
    const amount = grantAmount(b, t, darpa)
    expect(amount).toBeGreaterThan(0)
    awardGrant(g, t, darpa, amount)
    const gone = cancelProgram(g, b, t, qec.key)!
    expect(gone.repaid).toBe(Math.min(amount, Math.round(darpa.share * qec.cost)))
    expect(t.yearGrant).toBe(amount - gone.repaid)

    // A huge grant on a small R&D budget counts as income only up to that budget.
    const g2 = adultIn('us', 1_000_000, 8)
    const a2 = company(g2, 'quantum', { venture: 5_000_000, raised: 5_000_000, series: 1 }, { share: 0.8 })
    const b2 = bizOf(g2, a2)
    const t2 = techOf(b2)
    startProgram(g2, b2, t2, PROGRAMS.quantum.find((p) => p.id === 'algorithms')!)
    awardGrant(g2, t2, darpa, 100_000_000)
    ageUp(g2)
    drain(g2, YEAR_PREFS)
    const x = techView(readBiz(g2, a2)).last!
    expect(x.grants).toBeLessThanOrEqual(x.rd + x.compute - x.credit)
    expect(readBiz(g2, a2).last!.pbt).toBeLessThan(0)
  })
})

describe('deep tech review: side revenue and windfalls', () => {
  it('charges for delivering satellites, licences and contracts, and satellites wear out', () => {
    const g = adultIn('us', 1_000_000, 9)
    const a = company(g, 'spaceTech', { stage: 3, level: 60, sats: 6, done: ['engine', 'rocket', 'smallsat'], venture: 500_000_000, raised: 500_000_000, series: 4 }, { share: 0.5 })
    ageUp(g)
    drain(g, YEAR_PREFS)
    const b = readBiz(g, a)
    const t = techView(b)
    expect(t.last!.side).toBeGreaterThan(0)
    // At least 45% of the satellite internet and 75% of satellite building is cost.
    expect(b.last!.cogs).toBeGreaterThanOrEqual(t.last!.side * 0.45)
    let sats = t.sats
    for (let y = 0; y < 15; y++) {
      ageUp(g)
      drain(g, YEAR_PREFS)
      const cur = businessAssets(g)[0]
      if (!cur) break
      sats = techView(readBiz(g, cur)).sats
    }
    expect(sats).toBeLessThan(6)
  })

  it("doesn't capitalize a one-off windfall at a profit multiple", () => {
    const base = adultIn('us', 1_000_000, 10)
    const a = company(base, 'cybersecurity', { stage: 2, level: 60, done: ['detect', 'platform'] }, { cash: 5_000_000 })
    for (let y = 0; y < 3; y++) {
      ageUp(base)
      drain(base, YEAR_PREFS)
    }
    const plain = structuredClone(base)
    const lucky = structuredClone(base)
    const windfall = 40_000_000
    const mine = (g: GameState) => businessAssets(g).find((x) => x.id === a.id)!
    const lb = bizOf(lucky, mine(lucky))
    earnTech(lucky, lb, techOf(lb), windfall)
    for (const g of [plain, lucky]) {
      ageUp(g)
      drain(g, YEAR_PREFS)
    }
    const vPlain = readBiz(plain, mine(plain)).valuation
    const vLucky = readBiz(lucky, mine(lucky)).valuation
    expect(readBiz(lucky, mine(lucky)).last!.otherIncome).toBeGreaterThanOrEqual(windfall)
    // Worth (at most) the cash it brought in, not ten times it.
    expect(vLucky - vPlain).toBeLessThanOrEqual(windfall * 1.05)
  })

  it("values the company the same at year end and after a later action (no double-counted year)", () => {
    const g = adultIn('us', 1_000_000, 11)
    const a = company(g, 'cybersecurity', { stage: 2, level: 60, done: ['detect', 'platform'] }, { cash: 5_000_000 })
    for (let y = 0; y < 4; y++) {
      ageUp(g)
      drain(g, YEAR_PREFS)
    }
    const b = bizOf(g, a)
    const before = b.valuation
    expect(before).toBeGreaterThan(0)
    revalue(g, a, b, techOf(b))
    expect(Math.abs(b.valuation - before)).toBeLessThanOrEqual(Math.max(1, before * 0.005))
  })
})

describe('deep tech review: investors are paid back first', () => {
  it('cannot sign the same queued bridge-round term sheet twice', () => {
    const g = adultIn('us', 1_000_000, 111)
    const a = company(g, 'robotics', { series: 1, lastRoundYear: g.year - 2, venture: 0, raised: 10_000_000 }, { share: .8 })
    const b = bizOf(g, a)
    const t = techOf(b)
    const data = { assetId: a.id, series: 1, investor: 'existing investors', amount: 2_000_000, pre: 18_000_000, equity: .1, down: false, bridge: true } as unknown as Json
    const modal = { kind: 'choice', source: 'script', id: 'term', title: '', text: '', choices: [{ id: 'sign', label: 'Sign' }], scriptId: 'deeptech.term' } as ChoiceModal
    runScript(g, 'deeptech.term', 'sign', data, modal)
    const once = { venture: t.venture, raised: t.raised, share: b.share, rounds: t.rounds.length }
    runScript(g, 'deeptech.term', 'sign', data, modal)
    expect({ venture: t.venture, raised: t.raised, share: b.share, rounds: t.rounds.length }).toEqual(once)
    expect(once).toMatchObject({ venture: 2_000_000, raised: 12_000_000, rounds: 1 })
  })

  it("doesn't hand the founder the patents investors paid for", () => {
    const g = adultIn('us', 1_000_000, 12)
    // Investors put in $60M; it all went into R&D that left $30M of patents.
    const a = company(g, 'robotics', { stage: 1, level: 50, raised: 60_000_000, venture: 0, ipBook: 30_000_000, series: 3 }, { share: 0.55 })
    const b = bizOf(g, a)
    const t = techOf(b)
    revalue(g, a, b, t)
    expect(operatingValue(g, b, t)).toBeGreaterThan(15_000_000)
    // The company is worth less than the preference: the founder's stake is close to nothing.
    expect(stakeValue(b)).toBeLessThan(1_000_000)
    // Once the company is worth far more than the investors put in, the founder owns their share of it.
    t.ipBook = 400_000_000
    revalue(g, a, b, t)
    const ev = operatingValue(g, b, t)
    expect(stakeValue(b)).toBeGreaterThan(0.5 * ev)
    expect(stakeValue(b)).toBeLessThanOrEqual(ev - 60_000_000 + 1)
    // A bootstrapped company's grant money isn't the owner's either.
    const g2 = adultIn('us', 1_000_000, 13)
    const a2 = company(g2, 'robotics', { stage: 1, level: 50, venture: 20_000_000 })
    const b2 = bizOf(g2, a2)
    const t2 = techOf(b2)
    refreshTechValue(g2, b2, t2)
    revalue(g2, a2, b2, t2)
    expect(b2.valuation).toBeLessThan(operatingValue(g2, b2, t2) + 1)
  })

  it("doesn't let a founder blitz R&D on investor money and flip the company in three years", () => {
    let total = 0
    let n = 0
    for (const ind of ['cybersecurity', 'spaceTech', 'aiLab'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const g = adultIn('us', 6_000_000, seed * 7)
        const before = g.character.money
        const row = startRows(g).find((r) => r.id === `biz.start.${ind}`) as MenuAction
        row.run(g)
        drain(g, ['loan', 'seed', 'cofounder', 'me', 'refuse', 'yes'])
        const a = businessAssets(g)[0]
        expect(a).toBeTruthy()
        for (let y = 0; y < 3 && businessAssets(g)[0]; y++) {
          const b = bizOf(g, a)
          const t = techOf(b)
          t.pace = 'blitz'
          for (const def of PROGRAMS[ind]) startProgram(g, b, t, def)
          b.ownerSalary = 0
          ageUp(g)
          drain(g, ['blitz', 'decline', 'closed', 'sign', 'let', 'settle'])
        }
        const left = businessAssets(g)[0]
        if (left) sellBusiness(g, left, bizOf(g, left), Math.round(readBiz(g, left).valuation * 1.28), 'a buyer')
        drain(g)
        const loans = g.character.loans.reduce((s, l) => s + l.balance, 0)
        total += g.character.money - loans - before
        n++
      }
    }
    // On average the founder loses money: investor cash funds the lab, not the founder's exit.
    expect(total / n).toBeLessThan(0)
  }, 60_000)
})

describe('classic founding with investors', () => {
  it('pays investors back first, so founding with their money and closing at once loses money', () => {
    for (const ind of INDUSTRY_IDS.filter((i) => !(DEEP_TECH_IDS as readonly string[]).includes(i) && i !== 'gameStudio')) {
      const g = adultIn('us', 20_000_000, 4)
      const before = g.character.money
      const row = startRows(g).find((n) => n.id === `biz.start.${ind}`) as MenuAction
      if (row.disabledReason?.(g)) continue
      row.run(g)
      drain(g, ['investors', 'refuse', 'me', 'yes'])
      const a = businessAssets(g)[0]
      expect(a, ind).toBeTruthy()
      const b = bizOf(g, a)
      expect(b.share, ind).toBeLessThan(1)
      expect(b.pref, ind).toBeGreaterThan(0)
      closeBusiness(g, a, b, equipmentValue(b) * 0.35 + b.inventory * localEcon(b.industry, b.countryId, b.city).unitCost * 0.3)
      drain(g)
      expect(g.character.money, ind).toBeLessThan(before)
    }
  })
})

describe('deep tech review: honest purple hints', () => {
  it('ranks classic industries on the start menu by the simulated payback, deep tech by real hubs', () => {
    for (const cc of ['us', 'jp', 'br', 'ng', 'tw', 'kr']) {
      const g = adultIn(cc, 5_000_000, 14)
      g.character.talents = ['Business']
      const before = JSON.stringify(g)
      const rng = g.rng
      const city = getCountry(cc).cities[0]
      const rows = startRows(g).filter((n): n is MenuAction => n.type === 'action')
      for (const row of rows) {
        const id = row.id.replace('biz.start.', '') as (typeof INDUSTRY_IDS)[number]
        const hint = row.hint?.(g) ?? null
        if (!isIndustryLegal(cc, id)) expect(hint).toBeNull()
        else if (id.length && !['semiconductor', 'aiLab', 'robotics', 'biotech', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity'].includes(id)) expect(hint, `${cc} ${id}`).toBe(industryHint(g, id, cc, city))
        else if (hint) expect(hint).toMatch(/hub for this/)
      }
      // Building the menu never rolls the dice or changes the save.
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('keeps the enterprise-pitch, demo and test-flight hints off rows you cannot use', () => {
    const g = adultIn('us', 1_000_000, 15)
    g.character.talents = ['Business']
    // Frontier-grade model but no enterprise platform yet: the pitch is locked, so no hint.
    const a = company(g, 'aiLab', { stage: 2, level: 70, models: [{ gen: 1, name: 'Nova 1', score: 99, open: false, year: 2000 }] })
    const pitch = act(g, a, 'dt.enterprise')
    expect(pitch.disabledReason?.(g)).toBeTruthy()
    expect(pitch.hint?.(g) ?? null).toBeNull()
    techOf(bizOf(g, a)).stage = 3
    const open = act(g, a, 'dt.enterprise')
    expect(open.disabledReason?.(g)).toBeNull()
    expect(open.hint?.(g)).toMatch(/probably win/)
    // A space company that already flew twice this year.
    const s = company(g, 'spaceTech', { stage: 2, level: 50, done: ['engine', 'rocket'] })
    g.yearActions[`dt.flight.${s.id}`] = 2
    const fly = act(g, s, 'dt.testflight')
    expect(fly.disabledReason?.(g)).toMatch(/two missions/)
    expect(fly.hint?.(g) ?? null).toBeNull()
  })

  it('recommends a closed release for the best model with paying customers, open weights otherwise', () => {
    const g = adultIn('us', 1_000_000, 16)
    g.character.talents = ['Business']
    const a = company(g, 'aiLab', { stage: 2, level: 50, models: [{ gen: 1, name: 'Vega 1', score: 40, open: false, year: 2000 }, { gen: 2, name: 'Vega 2', score: 30, open: false, year: 2001 }] })
    const t = techOf(bizOf(g, a))
    // Gen 1 is the best and customers pay for it: opening it would cut API demand by a quarter.
    simInternals.queueRelease(g, a, t, 1)
    let m = g.queue.pop() as ChoiceModal
    expect(m.choices.find((c) => c.hint)?.id).toBe('closed')
    // Gen 2 is worse than what customers use: giving it away costs no sales.
    simInternals.queueRelease(g, a, t, 2)
    m = g.queue.pop() as ChoiceModal
    expect(m.choices.find((c) => c.hint)?.id).toBe('open')
    // No hints without the talent.
    g.character.talents = []
    simInternals.queueRelease(g, a, t, 1)
    m = g.queue.pop() as ChoiceModal
    expect(m.choices.some((c) => c.hint)).toBe(false)
  })
})

describe('deep tech review: event hints follow the odds', () => {
  function hinted(g: GameState, a: Asset, ev: string, extra: Record<string, Json> = {}): string | undefined {
    g.queue = []
    expect(presentDeepTechEvent(g, a, ev, extra), ev).toBe(true)
    const m = g.queue.pop() as ChoiceModal
    return m.choices.find((c) => c.hint)?.id
  }

  it('picks the bid, deal, sale and lawsuit choices with the best expected value', () => {
    const g = adultIn('us', 1_000_000, 18)
    g.character.talents = ['Business']
    // Without clearance a cyber bid is a long shot, but still worth far more than its 3% cost.
    const cyber = company(g, 'cybersecurity', { stage: 2, level: 50 })
    expect(hinted(g, cyber, 'cyberGov')).toBe('low')
    // A sure 85% beats a 50% shot at full price; a leading supplier wins holdouts 90% of the time.
    const chips = company(g, 'semiconductor', { stage: 2, level: 50 })
    expect(hinted(g, chips, 'designWin')).toBe('accept')
    techOf(bizOf(g, chips)).stage = 3
    expect(hinted(g, chips, 'designWin')).toBe('hold')
    // Every acquisition offer is 25-70% over the valuation.
    const robots = company(g, 'robotics', { stage: 2, level: 60 }, { cash: 30_000_000 })
    bizOf(g, robots).valuation = 40_000_000
    expect(hinted(g, robots, 'acquirer')).toBe('accept')
    // Fighting a troll: 35% legal fees, and 35% of the time 150% damages: 87.5% of settling.
    techOf(bizOf(g, robots)).ipBook = 1_000_000
    expect(hinted(g, robots, 'troll')).toBe('fight')
  })

  it('advises pushing on a term sheet only when investors will likely improve it and rarely walk', () => {
    let pushes = 0
    let signs = 0
    for (const [hype, level] of [[0, 20], [100, 95], [60, 70], [10, 40]]) {
      const g = adultIn('us', 1_000_000, 20 + hype)
      g.character.talents = ['Business']
      const a = company(g, 'aiLab', { stage: 1, level, hype, venture: 40_000_000, raised: 6_000_000, series: 1, done: ['train'], lastRoundYear: g.year - 1, models: [{ gen: 1, name: 'Iris 1', score: 60, open: false, year: 2000 }] }, { share: 0.8 })
      act(g, a, 'dt.raise').run(g)
      const sheet = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'deeptech.term') as ChoiceModal
      const hinted = sheet.choices.find((c) => c.hint)?.id
      const b = bizOf(g, a)
      const odds = pushOdds(g, a, b, techOf(b))
      if (hinted === 'push') {
        pushes++
        expect(odds.better).toBeGreaterThanOrEqual(0.5)
        expect(odds.walk).toBeLessThanOrEqual(0.2)
      } else signs++
    }
    expect(pushes + signs).toBe(4)
  })

  it('licenses a drug when the lab cannot pay for its next trial, keeps it when it can', () => {
    const g = adultIn('us', 1_000_000, 19)
    g.character.talents = ['Business']
    const drug = { id: 'd1', name: 'Velozumab', area: 'autoimmune', phase: 2, quality: 70, peak: 3, filed: 2000, approved: 0, royalty: 1, partner: '', failed: false }
    const poor = company(g, 'biotech', { stage: 2, level: 50, drugs: [drug] })
    expect(hinted(g, poor, 'pharmaDeal', { drug: 'd1' })).toBe('accept')
    const rich = company(g, 'biotech', { stage: 2, level: 50, drugs: [{ ...drug }], venture: 400_000_000, raised: 400_000_000, series: 4 }, { share: 0.4 })
    expect(hinted(g, rich, 'pharmaDeal', { drug: 'd1' })).toBe('keep')
  })
})

describe('deep tech review: saves from before the review', () => {
  it('re-reads a version-1 lab state that lacks the newer fields instead of crashing', () => {
    const g = adultIn('us', 1_000_000, 21)
    const a = company(g, 'cybersecurity', { stage: 1, level: 50, done: ['detect'] }, { cash: 2_000_000 })
    const tech = a.details.tech as Record<string, Json>
    tech.v = 1
    delete tech.oneOff
    delete tech.oneOffs
    const b = bizOf(g, a)
    earnTech(g, b, techOf(b), 1_000)
    for (let y = 0; y < 2; y++) {
      ageUp(g)
      drain(g, YEAR_PREFS)
    }
    const t = techView(readBiz(g, a))
    expect(Array.isArray(t.oneOffs)).toBe(true)
    expect(Number.isFinite(readBiz(g, a).valuation)).toBe(true)
  })
})

describe('deep tech review: who can run the lab', () => {
  it('keeps an underage owner (an heir) out of the boardroom', () => {
    const g = adultIn('us', 1_000_000, 17)
    const a = company(g, 'robotics', { level: 50, venture: 10_000_000, raised: 10_000_000, series: 1 }, { share: 0.8 })
    g.character.age = 12
    g.character.job = null
    const lab = openTiles(g, businessAssetView(g, a)).find((n) => n.id === `dt.lab.${a.id}`) as MenuGroup
    expect(lab.disabledReason?.(g)).toMatch(/18/)
    const row = all(g, lab.children(g)).find((n) => n.id === `dt.rd.proto.${a.id}`) as MenuAction
    expect(row.disabledReason?.(g)).toMatch(/18/)
    row.run(g)
    expect(techView(readBiz(g, a)).programs).toHaveLength(0)
  })
})
