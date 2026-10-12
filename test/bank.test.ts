// Banking 2.0: books, the yearly settlement, the regulator, runs, events, menus, the hired CEO and
// old-save migration. Deterministic: every random draw is seeded per life/bank/year.
import { describe, expect, it } from 'vitest'
import { bailoutEligible, bailoutTerms, bankAfterYear, BANK_EVENT_IDS, forceBankEvent, reassureOdds, resolveRun, seizeNeed } from '../src/game/business/bank-events'
import { bankBooks, bankCapitalNeed, bankCapitalPreview, bankEraBlock, bankInfo, bankManagerTurn, bankNodes, bankPayoutBlock, bankSettledYear, bankStartingCash, queueBankReport, simulateBankYear } from '../src/game/business/bank'
import { bankLeverBlock, runBankCampaign, setBankAppetite, setBankRate, switchBankProduct } from '../src/game/business/bank-actions'
import { bankCapital, bankMarket, bankRank, bankYearCtx, bestRates, capitalRatio, expectedPath, ibGate, productGate, projectYear, riskWeighted, setupCost } from '../src/game/business/bank-model'
import { LEND_LINES, PRODUCT_IDS, loanTotal, minCapitalRatio, openBank, readBank, saveBank, type BankBook } from '../src/game/business/bank-state'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { financeNodes, simulateFinanceYear } from '../src/game/business/finance-firm'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { valuationOf } from '../src/game/business/economy'
import { bizOf, normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { anachronismsIn } from '../src/game/events/era'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, Json, MenuNode, ModalItem } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'
import { ageUp } from '../src/game/aging'
import { applyFallback } from '../src/game/offline'
import { createNewLife } from '../src/game/life'
import { businessCareerMenu } from '../src/game/business'
import { businessAssets } from '../src/game/business/state'
import type { AnnualReportData } from '../src/game/types'
import { settlePerfectForesight } from '../src/game/business/executive-foresight'
import { closeBusiness } from '../src/game/business/exit'
import { payableCash } from '../src/game/business/board-vote'
import { payDividend } from '../src/game/business/board-menu'

function bank(opts: { country?: string; year?: number; cash?: number; industry?: 'bank' | 'onlineBank'; seed?: number; talents?: string[] } = {}) {
  const country = opts.country ?? 'us', year = opts.year ?? 2030
  const g = makeTestGame(opts.seed ?? 5, { age: 40, money: 500_000_000, countryId: country, city: getCountry(country).cities[0], ...(opts.talents ? { talents: opts.talents } : {}) })
  g.year = year
  const b0 = newBiz(g, opts.industry ?? 'bank', country, getCountry(country).cities[0], { cash: opts.cash ?? 15_000_000, founded: year - 3, ownerSalary: 0 })
  b0.openFraction = 1
  const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

/** Customers' side always balances: loans + workout + reserves + bonds = deposits + advance. */
function balanced(book: BankBook): void {
  expect(loanTotal(book) + book.badNet + book.reserves + book.bonds).toBeCloseTo(book.deposits + book.advance, 0)
  for (const line of LEND_LINES) expect(book.loans[line]).toBeGreaterThanOrEqual(-1e-6)
  expect(book.reserves).toBeGreaterThanOrEqual(-1e-6)
  expect(book.bonds).toBeGreaterThanOrEqual(-1e-6)
}

function finiteDeep(x: unknown, path = ''): void {
  if (typeof x === 'number') { expect(Number.isFinite(x), path).toBe(true); return }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finiteDeep(v, `${path}.${k}`)
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): void {
  for (const n of nodes) {
    n.visible?.(g)
    if (n.type === 'info') { if (typeof n.text === 'function') n.text(g); continue }
    if (n.type === 'heading') continue
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.disabledReason?.(g); n.hint?.(g)
    if (n.type === 'action') {
      n.confirm?.(g); n.input?.defaultValue?.(g)
      if (n.input?.preview) for (const v of [n.input.min ?? 0, n.input.max ?? 1, ((n.input.min ?? 0) + (n.input.max ?? 1)) / 2]) n.input.preview(g, v)
    } else if (depth < 4) { n.header?.(g); walk(g, n.children(g), depth + 1) }
  }
}

/** Play the bank's years the way yearly.ts does (manager turn, settlement, manager turn), auto-answering popups. */
function playYears(g: GameState, a: Asset, years: number, answer = (m: ModalItem & { kind: 'choice' }) => m.choices[0].id): void {
  for (let i = 0; i < years; i++) {
    g.year += 1; g.character.age += 1; g.yearActions = {}
    const live = g.assets.find(x => x.id === a.id)
    if (!live) return
    const b = bizOf(g, live)
    if (b.ceo === 'manager') bankManagerTurn(g, b)
    const res = simulateBankYear(g, b, g.year - 1, 0)
    b.yearCosts = 0; b.yearIncome = 0
    expect(res.stmt.year).toBe(g.year - 1)
    if (b.cash < 0) { b.cash = 0 }
    if (b.ceo === 'manager') bankManagerTurn(g, b)
    else queueBankReport(g, live, b)
    for (let guard = 0; guard < 8 && g.queue.length; guard++) {
      const m = g.queue.shift()!
      if (m.kind === 'choice' && m.source === 'script' && m.scriptId) runScript(g, m.scriptId, answer(m as ModalItem & { kind: 'choice' }), m.data, m)
    }
    g.queue = []
  }
}

describe('Banking 2.0 books', () => {
  it('starts balanced client books sized to the bank, and the books never count as company value', () => {
    for (const industry of ['bank', 'onlineBank'] as const) {
      const { b } = bank({ industry })
      const book = readBank(b)
      balanced(book)
      expect(book.deposits).toBeGreaterThan(0)
      expect(b.cash).toBe(15_000_000)
      const value = valuationOf(b)
      book.deposits *= 50; for (const line of LEND_LINES) book.loans[line] *= 50
      book.reserves *= 50; book.bonds *= 50
      saveBank(b, book)
      expect(valuationOf(b)).toBe(value)
      expect(bankBooks(b).deposits).toBe(book.deposits)
    }
  })

  it('books every dollar of the year exactly once: client money never reaches b.cash or the owner', () => {
    for (const [country, year] of [['us', 2030], ['de', 1975], ['ng', 2010], ['jp', 1998], ['ar', 2001]] as const) {
      const { g, b } = bank({ country, year })
      b.yearCosts = 120_000; b.yearIncome = 30_000; b.cash += b.yearIncome - b.yearCosts
      const cash = b.cash, debt = b.debt, rng = g.rng, queue = g.queue.length, flags = JSON.stringify(g.flags), money = g.character.money
      const res = simulateBankYear(g, b, year, 50_000)
      const s = res.stmt, book = readBank(b)
      // The settlement writes only the company: no game RNG, popups, flags or personal money.
      expect([g.rng, g.queue.length, JSON.stringify(g.flags), g.character.money]).toEqual([rng, queue, flags, money])
      balanced(book)
      expect(s.pbt).toBe(s.netRevenue - s.cogs - s.wages - s.keyStaff - s.rent - s.marketing - s.interest - s.upkeep - s.other + s.otherIncome - s.ownerPay)
      expect(s.net).toBe(s.pbt - s.corpTax)
      expect(book.last!.profit).toBe(s.net)
      expect(s.ownerPay).toBe(50_000)
      expect(b.cash - cash).toBe(s.net + 120_000 - 30_000)
      expect(b.debt).toBe(debt)
      expect(b.production).toBe(0); expect(b.inventory).toBe(0)
      expect(res.market).toBeNull()
      expect(res.bank!.bankLoss).toBe(book.last!.bankLoss)
      // A second settlement of the same year changes nothing and reports nothing new.
      const settled = JSON.stringify(b)
      expect(simulateBankYear(g, b, year, 50_000).bank).toBeUndefined()
      expect(JSON.stringify(b)).toBe(settled)
    }
  })

  it('pays panicked savers out of the client book; withdrawals never add to shareholder cash', () => {
    let runs = 0
    for (let i = 0; i < 30; i++) {
      const { g, b } = bank({ seed: i })
      g.lifeId = `bank-run-${i}`
      const book = readBank(b); book.trust = 0; book.savingsGap = -.03; saveBank(b, book)
      const cash = b.cash
      const res = simulateBankYear(g, b, g.year, 0)
      const after = readBank(b)
      balanced(after)
      expect(b.cash - cash).toBe(res.stmt.net)
      if (after.last!.runWithdrawals > 0) { runs++; expect(after.run).not.toBeNull(); expect(res.bank!.bankRun).toBe(after.last!.runWithdrawals) }
    }
    expect(runs).toBeGreaterThan(0)
  })

  it('a closed bank earns no interest or fees', () => {
    const { g, b } = bank()
    b.openFraction = 0
    expect(normalizeBiz(b as unknown as Record<string, Json>, g.year).openFraction).toBe(0)
    const res = simulateBankYear(g, b, g.year, 0)
    expect(res.stmt.revenue).toBe(0)
  })
})

describe('Banking 2.0 over many years', () => {
  it('stays finite and balanced for 60+ years across countries, eras and managers', () => {
    const cases = [
      { country: 'us', year: 1905, industry: 'bank', skill: 80 }, { country: 'de', year: 1915, industry: 'bank', skill: 60 },
      { country: 'ng', year: 1965, industry: 'bank', skill: 45 }, { country: 'jp', year: 1985, industry: 'bank', skill: 95 },
      { country: 'gb', year: 2000, industry: 'onlineBank', skill: 70 }, { country: 'ar', year: 1975, industry: 'bank', skill: 30 },
    ] as const
    for (const c of cases) {
      const { g, a, b } = bank({ country: c.country, year: c.year, industry: c.industry, cash: 25_000_000 })
      b.ceo = 'manager'; b.manager = { firstName: 'Mo', lastName: 'Ney', gender: 'male', skill: c.skill, salary: 120_000, since: c.year }
      playYears(g, a, 62)
      const live = g.assets.find(x => x.id === a.id)
      if (!live) continue // seized or sold along the way is a legitimate ending
      const bb = readBiz(g, live), book = readBank(bb)
      finiteDeep(book, 'book'); finiteDeep(bb.last, 'stmt')
      expect(Number.isFinite(bb.cash)).toBe(true)
      balanced(book)
      expect(bankSettledYear(bb)).toBe(g.year - 1)
    }
  }, 240_000)

  it('a sensibly capitalized new bank with ordinary settings makes plausible returns', () => {
    const roes: number[] = []
    for (const [country, year] of [['us', 1995], ['gb', 1970], ['in', 2000], ['de', 1960]] as const) {
      const { g, a, b } = bank({ country, year, cash: bankStartingCash(country, year) })
      const book = readBank(b); book.products.mortgage = year; saveBank(b, book)
      let capital = bankCapital(b, book), sum = 0, n = 0
      for (let i = 0; i < 25; i++) {
        g.year += 1
        const live = bizOf(g, a)
        const res = simulateBankYear(g, live, g.year - 1, 0)
        const after = readBank(live)
        if (after.run) { after.run = null; saveBank(live, after) }
        if (i >= 3) { sum += res.stmt.net / Math.max(1, capital); n++ }
        capital = bankCapital(live, after)
        expect(after.seize).toBe(false)
      }
      roes.push(sum / n)
    }
    for (const r of roes) { expect(r).toBeGreaterThan(.01); expect(r).toBeLessThan(.3) }
  }, 120_000)
})

describe('Banking 2.0 regulator', () => {
  // A mortgage-heavy book runs off slowly, so thin capital can't hide behind maturing loans.
  function undercapitalized(capital: number) {
    const x = bank({ cash: capital })
    const book = readBank(x.b)
    Object.assign(book, { deposits: 700_000_000, loans: { business: 0, mortgage: 600_000_000, auto: 0, cards: 0 }, reserves: 60_000_000, bonds: 40_000_000, badNet: 0 })
    book.products.mortgage = 2020; book.savingsGap = .02 // generous rates keep profits thin
    saveBank(x.b, book)
    return x
  }

  it('warns, then forces loan sales with a fine, and threatens seizure far below the minimum', () => {
    const { g, a, b } = undercapitalized(6_000_000)
    simulateBankYear(g, b, g.year, 0)
    let book = readBank(b)
    expect(book.strikes).toBe(1)
    expect(book.last!.regulator).toMatch(/warned/)
    expect(book.last!.fine).toBe(0)
    g.year += 1
    b.cash = 6_000_000 // the owner paid the profit out: still thin
    const loans = loanTotal(book)
    const res = simulateBankYear(g, b, g.year, 0)
    book = readBank(b)
    expect(book.strikes).toBe(2)
    expect(book.last!.shrink).toBeGreaterThan(0)
    expect(book.last!.fine).toBeGreaterThan(0)
    expect(res.stmt.other).toBeGreaterThanOrEqual(book.last!.fine)
    expect(loanTotal(book)).toBeLessThan(loans)
    expect(loanTotal(book)).toBeGreaterThan(loans * .5) // at most a third sold a year, plus ordinary runoff
    // Either the forced sales restored the minimum, or the seizure threat is on.
    expect(capitalRatio(b, book) >= minCapitalRatio(b.countryId, g.year) || book.seize).toBe(true)
    balanced(book)
    void a
  })

  it('offers recapitalization or seizure, and both paths settle cleanly', () => {
    for (const choice of ['inject', 'seize'] as const) {
      const { g, a, b } = undercapitalized(1_000_000)
      simulateBankYear(g, b, g.year, 0)
      expect(readBank(b).seize).toBe(true)
      g.year += 1
      bankAfterYear(g, a, b, false)
      const popup = g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.regulator')
      expect(popup).toBeTruthy()
      const need = seizeNeed(g, b, readBank(b)), money = g.character.money
      runScript(g, 'bank.regulator', choice, popup!.kind === 'choice' ? popup!.data : undefined, popup!)
      if (choice === 'inject') {
        expect(g.character.money).toBe(money - need)
        expect(readBank(bizOf(g, a)).seize).toBe(false)
        expect(capitalRatio(bizOf(g, a), readBank(bizOf(g, a)))).toBeGreaterThanOrEqual(minCapitalRatio('us', g.year))
      } else {
        expect(g.assets.some(x => x.id === a.id)).toBe(false)
        expect(g.character.money).toBe(money)
      }
    }
  })
})

describe('Banking 2.0 runs', () => {
  function withRun() {
    const x = bank({ year: 2009 })
    const book = readBank(x.b)
    // A wave bigger than the cash and bonds on hand: loans must be sold or funded.
    book.run = { year: 2008, wave: Math.round(book.deposits * .7), severity: .25 }
    saveBank(x.b, book)
    return { ...x, wave: book.run.wave }
  }

  it('an emergency central-bank loan pays savers as company debt that the book repays later', () => {
    const { g, a, b, wave } = withRun()
    const debt = b.debt, cash = b.cash, deposits = readBank(b).deposits
    resolveRun(g, a, b, 'cb', false)
    let book = readBank(b)
    expect(book.run).toBeNull()
    expect(b.debt).toBe(debt + wave)
    expect(b.cash).toBe(cash)
    expect(book.advance).toBe(wave); expect(book.cbOwed).toBe(wave)
    expect(book.deposits).toBe(deposits - wave)
    expect(bankCapital(b, book)).toBe(cash - debt)
    balanced(book)
    expect(b.debtRate).toBeGreaterThanOrEqual(.05)
    for (let i = 0; i < 6 && book.advance > 0; i++) {
      g.year += 1
      const before = { cash: b.cash, debt: b.debt, advance: book.advance }
      const res = simulateBankYear(g, b, g.year - 1, 0)
      book = readBank(b)
      balanced(book)
      const returned = before.advance - book.advance, repaid = before.debt - b.debt
      expect(repaid).toBeLessThanOrEqual(returned + 1)
      expect(b.cash - before.cash).toBe(res.stmt.net + (returned - repaid))
    }
    expect(book.advance).toBeLessThan(wave)
  })

  it('a fire sale books its loss through yearCosts; a TV appeal uses the shown odds', () => {
    const sale = withRun()
    const cash = sale.b.cash
    resolveRun(sale.g, sale.a, sale.b, 'sell', false)
    expect(sale.b.yearCosts).toBeGreaterThan(0)
    expect(sale.b.cash).toBe(cash - sale.b.yearCosts)
    balanced(readBank(sale.b))
    let calmed = 0
    for (let i = 0; i < 20; i++) {
      const tv = withRun()
      tv.g.rng = 1000 + i
      const odds = reassureOdds(tv.g, tv.b, readBank(tv.b))
      expect(odds).toBeGreaterThan(0); expect(odds).toBeLessThan(1)
      const deposits = readBank(tv.b).deposits
      resolveRun(tv.g, tv.a, tv.b, 'tv', false)
      const book = readBank(tv.b)
      expect(book.run).toBeNull()
      balanced(book)
      if (book.deposits === deposits) calmed++
      else expect(tv.b.yearCosts).toBeGreaterThan(0)
    }
    expect(calmed).toBeGreaterThan(0); expect(calmed).toBeLessThan(20)
  })

  it('queues a run popup for the owner and lets a hired CEO handle it alone', () => {
    const owner = withRun()
    const book = readBank(owner.b); book.lastYear = owner.g.year - 1; book.dramaYear = -1; saveBank(owner.b, book)
    bankAfterYear(owner.g, owner.a, owner.b, false)
    const popup = owner.g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.run')
    expect(popup).toBeTruthy()
    expect(popup!.kind === 'choice' && popup!.choices.some(c => c.id === 'cb')).toBe(true)
    const managed = withRun()
    const mb = readBank(managed.b); mb.lastYear = managed.g.year - 1; mb.dramaYear = -1; saveBank(managed.b, mb)
    bankAfterYear(managed.g, managed.a, managed.b, true)
    expect(managed.g.queue.some(m => m.kind === 'choice' && m.scriptId === 'bank.run')).toBe(false)
    expect(readBank(managed.b).run).toBeNull()
    // Drama for a year runs once.
    const queued = managed.g.queue.length
    bankAfterYear(managed.g, managed.a, managed.b, true)
    expect(managed.g.queue.length).toBe(queued)
  })
})

describe('Banking 2.0 events', () => {
  it('every event and every choice resolves, keeps the client book whole and books company cash once', () => {
    for (const id of BANK_EVENT_IDS) {
      for (let pick = 0; pick < 3; pick++) {
        const { g, a, b } = bank({ year: id === 'cyber' || id === 'fintech' ? 2024 : 2030, cash: 30_000_000 })
        const book = readBank(b)
        if (id === 'cyber') book.products.app = 2020
        if (id === 'tbtf') Object.assign(book, { deposits: 3e12, loans: { business: 2.5e12, mortgage: 0, auto: 0, cards: 0 }, bonds: 2e11, reserves: 3e11, badNet: 0 })
        saveBank(b, book)
        // Capital just under the minimum: a rescue the state can offer on fair terms.
        if (id === 'tbtf') { g.year = 2009; b.cash = 2e11 }
        b.valuation = valuationOf(b)
        g.queue = []
        const shown = forceBankEvent(g, a, b, id)
        if (!shown) continue
        const popup = g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.event')!
        expect(popup).toBeTruthy()
        expect(popup.kind === 'choice' && popup.text.length).toBeGreaterThan(10)
        if (popup.kind !== 'choice') continue
        const choice = popup.choices[Math.min(pick, popup.choices.length - 1)]
        const cash = b.cash, costs = b.yearCosts, income = b.yearIncome, money = g.character.money
        runScript(g, 'bank.event', choice.id, popup.data, popup)
        const live = g.assets.find(x => x.id === a.id)
        if (!live) { expect(id).toBe('merger'); expect(g.character.money).toBeGreaterThan(money); continue }
        const after = bizOf(g, live)
        balanced(readBank(after))
        // Company cash moved only through the one-off ledger, or as an equity rescue.
        const booked = (after.yearIncome - income) - (after.yearCosts - costs)
        if (id !== 'tbtf') expect(after.cash - cash).toBe(booked)
        finiteDeep(readBank(after))
      }
    }
  })

  it('event and report texts fit their era', () => {
    for (const year of [1905, 1935, 1965, 1999, 2012, 2030]) {
      for (const id of BANK_EVENT_IDS) {
        const { g, a, b } = bank({ year, cash: 30_000_000 })
        const book = readBank(b); book.products.app = year; saveBank(b, book)
        g.queue = []
        forceBankEvent(g, a, b, id)
        const run = readBank(b); run.run = { year: year - 1, wave: 1_000_000, severity: .2 }; run.lastYear = year - 1; run.dramaYear = -1; saveBank(b, run)
        bankAfterYear(g, a, b, false)
        simulateBankYear(g, b, year - 1, 0)
        queueBankReport(g, a, b)
        for (const m of g.queue) {
          if (m.kind !== 'choice' && m.kind !== 'notice') continue
          const texts = [m.title, m.text, ...(m.kind === 'choice' ? m.choices.map(c => c.label) : [])]
          for (const t of texts) expect(anachronismsIn(t, year, ['us']), `${year} ${t}`).toEqual([])
          for (const t of texts) expect(t.length).toBeLessThan(600)
        }
      }
    }
  })
})

describe('Banking 2.0 products and levers', () => {
  it('gates products by era and size in the menu and the resolver', () => {
    const { g, a, b } = bank({ year: 1950 })
    const book = readBank(b)
    expect(productGate(b, book, 'cards', 1950).ok).toBe(false)
    expect(productGate(b, book, 'app', 1990).ok).toBe(false)
    expect(productGate(b, book, 'crypto', 2005).ok).toBe(false)
    expect(productGate(b, book, 'auto', 1915).ok).toBe(false)
    expect(productGate(b, book, 'wealth', 1965).ok).toBe(false)
    expect(productGate(b, book, 'ib', 2030).ok).toBe(book.deposits >= ibGate('us'))
    expect(productGate(b, book, 'mortgage', 1950).ok).toBe(true)
    expect(productGate(b, book, 'cards', 1990).ok).toBe(true)
    expect(productGate(b, book, 'crypto', 2024).ok).toBe(true)
    const cash = b.cash
    switchBankProduct(g, a.id, 'cards', true)
    switchBankProduct(g, a.id, 'crypto', true)
    expect(bizOf(g, a).cash).toBe(cash)
    expect(readBank(bizOf(g, a)).products.cards).toBeUndefined()
    switchBankProduct(g, a.id, 'mortgage', true)
    expect(bizOf(g, a).cash).toBe(cash - setupCost(b, book, 'mortgage'))
    expect(bizOf(g, a).yearCosts).toBe(setupCost(b, book, 'mortgage'))
    expect(readBank(bizOf(g, a)).products.mortgage).toBe(1950)
  })

  it('levers move only policy, one campaign a year, and a hired CEO keeps the levers', () => {
    const { g, a, b } = bank()
    const m = bankMarket(g, 'us', g.year)
    setBankRate(g, a.id, 'savings', m.savings + .01)
    setBankRate(g, a.id, 'loan', NaN)
    setBankAppetite(g, a.id, 'highYield')
    let book = readBank(bizOf(g, a))
    expect(book.savingsGap).toBeCloseTo(.01, 6)
    expect(book.appetite).toBe('highYield')
    expect(bizOf(g, a).cash).toBe(15_000_000)
    runBankCampaign(g, a.id)
    const spent = 15_000_000 - bizOf(g, a).cash
    expect(spent).toBeGreaterThan(0)
    expect(bizOf(g, a).yearCosts).toBe(spent)
    runBankCampaign(g, a.id)
    expect(15_000_000 - bizOf(g, a).cash).toBe(spent)
    book = readBank(bizOf(g, a))
    expect(book.campaignBoost).toBeGreaterThan(0)
    b.ceo = 'manager'; b.manager = { firstName: 'Al', lastName: 'Ex', gender: 'male', skill: 70, salary: 1, since: 2020 }
    expect(bankLeverBlock(g, a)).toMatch(/runs the bank/)
    const before = JSON.stringify(g)
    setBankAppetite(g, a.id, 'prime'); setBankRate(g, a.id, 'savings', .2); switchBankProduct(g, a.id, 'auto', true)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('Banking 2.0 menus and hints', () => {
  it('renders the dashboard, previews and purple hints without touching state or RNG', () => {
    for (const talents of [undefined, ['Business']]) {
      const { g, a, b } = bank({ talents })
      simulateBankYear(g, b, g.year - 1, 0)
      const book = readBank(b); book.run = { year: g.year - 1, wave: 1e6, severity: .2 }; saveBank(b, book)
      const before = JSON.stringify(g)
      walk(g, bankNodes(g, a)); walk(g, financeNodes(g, a)); bankInfo(g, b)
      expect(JSON.stringify(g)).toBe(before)
      const texts: string[] = []
      const collect = (nodes: MenuNode[]) => { for (const n of nodes) { if (n.type === 'info') texts.push(typeof n.text === 'function' ? n.text(g) : n.text); else if (n.type === 'menu') collect(n.children(g)) } }
      collect(bankNodes(g, a))
      for (const t of texts) expect(t.length).toBeLessThanOrEqual(140)
      const hints = bankNodes(g, a).map(n => (n.type === 'action' || n.type === 'menu') ? n.hint?.(g) : null).filter(Boolean)
      expect(hints.length > 0).toBe(!!talents)
      b.ceo = 'manager'; b.manager = { firstName: 'Al', lastName: 'Ex', gender: 'male', skill: 70, salary: 1, since: 2020 }
      const managed = JSON.stringify(g)
      walk(g, bankNodes(g, a))
      expect(JSON.stringify(g)).toBe(managed)
    }
  })

  it('the best-rates hint is computed with the same model the year runs on', () => {
    const { g, b } = bank({ talents: ['Business'] })
    const before = JSON.stringify(g)
    const best = bestRates(g, b)
    expect(JSON.stringify(g)).toBe(before)
    const ctx = bankYearCtx(g, b, g.year), book = readBank(b)
    expect(best.profit).toBeCloseTo(expectedPath(g, ctx, book, { savingsGap: best.savingsGap, loanGap: best.loanGap }, 1), 6)
    const p = projectYear(g, b, g.year, null, { savingsGap: best.savingsGap, loanGap: best.loanGap })
    expect(Number.isFinite(p.operating)).toBe(true)
    // It is the best of the policies it considered, never a promise: some real years fall short.
    expect(expectedPath(g, ctx, book, { savingsGap: best.savingsGap, loanGap: best.loanGap }, 6, true)).toBeGreaterThanOrEqual(expectedPath(g, ctx, book, { savingsGap: 0, loanGap: 0 }, 6, true) - 1)
  })
})

describe('Banking 2.0 hired CEO', () => {
  it('runs the bank without foresight: no guaranteed returns, better CEOs do better on average', () => {
    const results: Record<number, number[]> = { 30: [], 90: [] }
    for (const skill of [30, 90]) {
      for (let seed = 0; seed < 4; seed++) {
        const { g, a, b } = bank({ year: 1985, cash: 20_000_000, seed })
        g.lifeId = `ceo-${seed}`
        b.ceo = 'manager'; b.manager = { firstName: 'C', lastName: `E${seed}`, gender: 'female', skill, salary: 150_000, since: 1985 }
        const rng = g.rng
        let equity = bankCapital(b, readBank(b))
        const roes: number[] = []
        for (let i = 0; i < 25; i++) {
          g.year += 1
          const live = g.assets.find(x => x.id === a.id)
          if (!live) break
          const bb = bizOf(g, live)
          bankManagerTurn(g, bb)
          const res = simulateBankYear(g, bb, g.year - 1, 0)
          bb.yearCosts = 0; bb.yearIncome = 0
          roes.push(res.stmt.net / Math.max(1, equity))
          const book = readBank(bb); book.run = null; book.dramaYear = book.lastYear; saveBank(bb, book)
          bankManagerTurn(g, bb)
          equity = bankCapital(bb, readBank(bb))
          expect(g.rng).toBe(rng) // the CEO and the settlement never use the game RNG
        }
        for (const r of roes) expect(r).toBeLessThan(.6)
        results[skill].push(roes.reduce((s, x) => s + x, 0) / Math.max(1, roes.length))
      }
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(avg(results[90])).toBeGreaterThan(avg(results[30]))
    expect(avg(results[90])).toBeLessThan(.3)
  }, 120_000)

  it('keeps an elite CEO bank above the regulator minimum in ordinary times', () => {
    const { g, a, b } = bank({ year: 1995, cash: 30_000_000 })
    b.ceo = 'manager'; b.manager = { firstName: 'Ada', lastName: 'Lovelock', gender: 'female', skill: 92, salary: 150_000, since: 1995 }
    let below = 0
    for (let i = 0; i < 20; i++) {
      g.year += 1
      const bb = bizOf(g, a)
      bankManagerTurn(g, bb)
      simulateBankYear(g, bb, g.year - 1, 0)
      bb.yearCosts = 0; bb.yearIncome = 0
      const book = readBank(bb); book.run = null; book.dramaYear = book.lastYear; saveBank(bb, book)
      bankManagerTurn(g, bb)
      if (book.last!.ratio < book.last!.minRatio) below++
    }
    expect(below).toBeLessThanOrEqual(2)
  }, 60_000)
})

describe('Banking 2.0 old saves', () => {
  it('migrates a legacy v2.1 bank to equivalent books without free money or a second settlement', () => {
    const { g, a, b } = bank({ year: 2026 })
    const legacy = financeView(b)
    Object.assign(legacy, { deposits: 80_000_000, loanBook: 50_000_000, bonds: 10_000_000, reserves: 20_000_000, confidence: 72, depositRate: .03, loanRate: .085, strategy: 'aggressive', lastYear: 2025, lastDefaults: 400_000 })
    saveFinance(b, legacy)
    b.last = { year: 2025, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0, revenue: 4e6, salesTax: 0, netRevenue: 4e6, cogs: 2e6, wages: 1e6, keyStaff: 0, rent: 1e5, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 9e5, corpTax: 2e5, net: 7e5, cashErosion: 0, cycle: 1, openFraction: 1, employees: 20 }
    const cash = b.cash, saved = JSON.parse(JSON.stringify(g)) as GameState
    const book = readBank(b)
    expect(book.deposits).toBe(80_000_000)
    expect(loanTotal(book)).toBeCloseTo(50_000_000, 0)
    expect(book.bonds).toBe(10_000_000); expect(book.reserves).toBe(20_000_000)
    expect(book.trust).toBe(72); expect(book.appetite).toBe('highYield')
    expect(book.lastYear).toBe(2025); expect(bankSettledYear(b)).toBe(2025)
    expect(book.products.mortgage).toBeDefined()
    balanced(book)
    expect(b.cash).toBe(cash)
    // The settled year is not booked again; the next one runs on the migrated books.
    expect(simulateFinanceYear(g, b, 2025, 0).bank).toBeUndefined()
    expect(b.cash).toBe(cash)
    const res = simulateFinanceYear(g, b, 2026, 0)
    expect(res.bank).toBeDefined()
    expect(b.cash - cash).toBe(res.stmt.net)
    balanced(readBank(b))
    // Loading the old save and playing the year through the yearly hook works too.
    const loaded = saved
    loaded.year = 2027; loaded.character.age += 1
    yearlyBusinessImpl(loaded)
    const after = readBiz(loaded, loaded.assets.find(x => x.id === a.id)!)
    expect(readBank(after).lastYear).toBe(2026)
    expect((after.financeFirm as Record<string, Json>).kind).toBe('bank')
  })

  it('normalizes malformed or partial bank records safely, and round-trips as JSON', () => {
    const { g, b } = bank()
    b.financeFirm = { kind: 'bank', deposits: 'x', loans: { business: NaN, mortgage: -5, cards: 1e40 }, reserves: Infinity, trust: 900, appetite: 'yolo', products: { cards: 'soon' }, run: { wave: -1 }, cool: { fraud: NaN }, hist: [{ y: 'a' }, 7] } as unknown as Json
    const before = JSON.stringify(b)
    const book = readBank(b)
    expect(JSON.stringify(b)).toBe(before)
    finiteDeep(book)
    balanced(book)
    expect(book.trust).toBeLessThanOrEqual(100)
    expect(book.appetite).toBe('balanced')
    expect(book.run).toBeNull()
    simulateBankYear(g, b, g.year, 0)
    const restored = JSON.parse(JSON.stringify(b)) as BizState
    expect(readBank(restored)).toEqual(readBank(b))
    for (const legacy of [false, true]) {
      const { b: fresh } = bank()
      fresh.financeFirm = legacy ? financeView(fresh) as unknown as Json : undefined
      const f = readBank(fresh)
      balanced(f); finiteDeep(f)
      expect(f.lastYear).toBe(-1)
    }
  })
})

describe('Banking 2.0 odds and ends', () => {
  it('gates online banks by era and keeps conglomerate capital requests bounded', () => {
    const { g, b } = bank()
    expect(bankEraBlock(g, 'onlineBank', 'us', 1985)).toBeTruthy()
    expect(bankEraBlock(g, 'onlineBank', 'us', 2026)).toBeNull()
    expect(bankEraBlock(g, 'bank', 'us', 1900)).toBeNull()
    const need = bankCapitalNeed(g, b, 1e9, .8)
    expect(need).toBeGreaterThan(0); expect(need).toBeLessThanOrEqual(1e9)
    expect(bankCapitalNeed(g, b, 0, 1)).toBe(0)
    expect(bankCapitalPreview('bank', 'us', 2026, 1_000_000)).toMatch(/struggle/)
    expect(bankCapitalPreview('bank', 'us', 2026, bankStartingCash('us', 2026))).toMatch(/Enough/)
  })

  it('ranks banks sensibly within their country', () => {
    expect(bankRank('us', 2026, 5e6).rank).toBeGreaterThan(bankRank('us', 2026, 5e9).rank)
    expect(bankRank('us', 2026, 3e12).rank).toBe(1)
    expect(bankRank('is', 2026, 1e10).rank).toBeLessThan(bankRank('us', 2026, 1e10).rank)
    const r = bankRank('ng', 2026, 0)
    expect(r.rank).toBe(r.of)
  })

  it('risk-weights loans and never counts borrowed cash as capital', () => {
    const { b } = bank()
    const book = readBank(b)
    const rwa = riskWeighted(book, bankCapital(b, book))
    b.debt = 5_000_000; b.cash += 5_000_000
    expect(bankCapital(b, book)).toBe(15_000_000)
    expect(riskWeighted(book, bankCapital(b, book))).toBeCloseTo(rwa, 6)
    expect(PRODUCT_IDS.length).toBe(8)
  })
})

describe('Banking 2.0 in a played life', () => {
  /** Answer every popup the way a player might (cycling through choices). */
  function drain(g: GameState, turn: number, prefer: string[] = []): ModalItem[] {
    const seen: ModalItem[] = []
    for (let guard = 0; g.queue.length && guard < 200; guard++) {
      const m = g.queue.shift()!
      seen.push(m)
      const before = g.queue.length
      if (m.kind === 'choice') {
        const ch = m.choices.find(c => prefer.includes(c.id)) ?? m.choices[(turn + guard) % m.choices.length]
        if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
      } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Test Bank'), m.data, m)
      else if (m.kind === 'minigame') {
        if (m.game === 'annualReport') { const r = m.data as unknown as AnnualReportData; runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production: r.expectedDemand }), m.data, m) }
        else runScript(g, m.scriptId, 'lose', m.data, m)
      } else if (m.kind === 'aiTask') applyFallback(g, m.task)
      g.queue.unshift(...g.queue.splice(before))
    }
    return seen
  }

  it('founds a bank through the real menus with the advised capital and plays 15 years', () => {
    const g = createNewLife({ seed: 21, year: 1990, countryId: 'gb' })
    g.queue = []
    g.character.age = 32; g.character.money = 60_000_000; g.character.city = getCountry('gb').cities[0]
    const start = businessCareerMenu.children(g).find(n => n.id === 'biz.start')
    if (!start || start.type !== 'menu') throw new Error('no start menu')
    const row = start.children(g).find(n => n.id === 'biz.start.bank')
    if (!row || row.type !== 'action') throw new Error('no bank row')
    expect(row.disabledReason?.(g) ?? null).toBeNull()
    row.run(g)
    drain(g, 0, ['savings', 'run', 'ceo', 'pay', 'yes'])
    const a = businessAssets(g).find(x => x.details.industry === 'bank')!
    expect(a).toBeTruthy()
    expect(bizOf(g, a).cash).toBeGreaterThanOrEqual(bankStartingCash('gb', 1990) * .99)
    let reports = 0
    for (let year = 0; year < 15 && g.character.alive; year++) {
      ageUp(g)
      // Keep the bank (turn down buyouts and takeovers); every other popup cycles its choices.
      const seen = drain(g, year, ['decline', 'refuse', 'inject', 'cb'])
      reports += seen.filter(m => m.kind === 'choice' && m.title.endsWith('Financial Institution Report')).length
      const live = businessAssets(g).find(x => x.id === a.id)
      if (!live) break
      const b = readBiz(g, live), book = readBank(b)
      balanced(book); finiteDeep(book)
      expect(Number.isFinite(b.cash)).toBe(true)
      walk(g, bankNodes(g, live))
    }
    expect(reports).toBeGreaterThan(3)
  }, 240_000)
})

describe('Banking 2.0 review: money that must not appear', () => {
  /** A top-ten bank in 2009 (a crisis) with `cash` of shareholder capital against $2.5T of loans. */
  function bigBank(cash: number) {
    const x = bank({ year: 2009, cash: 30_000_000 })
    const book = readBank(x.b)
    Object.assign(book, { deposits: 3e12, loans: { business: 2.5e12, mortgage: 0, auto: 0, cards: 0 }, bonds: 2e11, reserves: 3e11, badNet: 0 })
    saveBank(x.b, book)
    x.b.cash = cash
    x.b.valuation = valuationOf(x.b)
    return x
  }
  const ownerValue = (b: BizState) => valuationOf(b) * b.share

  it('a government rescue never makes the owner richer, and a near-worthless bank gets none', () => {
    // Capital a little under the minimum: the state's terms are at least fair to taxpayers.
    for (const cash of [1.5e11, 2.2e11]) {
      const { g, a, b } = bigBank(cash)
      const before = ownerValue(b)
      expect(bailoutEligible(g, b, readBank(b))).toBe(true)
      const t = bailoutTerms(g, b, readBank(b))
      expect(t.stake).toBeGreaterThanOrEqual(t.fair)
      g.queue = []
      expect(forceBankEvent(g, a, b, 'tbtf')).toBe(true)
      const popup = g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.event')!
      runScript(g, 'bank.event', 'accept', popup.kind === 'choice' ? popup.data : undefined, popup)
      expect(b.cash).toBe(cash + t.inject)
      expect(ownerValue(b)).toBeLessThanOrEqual(before + 1)
      // The run-time bailout uses the same terms.
      const run = bigBank(cash)
      const book = readBank(run.b); book.run = { year: 2008, wave: 1e11, severity: .2 }; saveBank(run.b, book)
      const pre = ownerValue(run.b)
      resolveRun(run.g, run.a, run.b, 'bailout', false)
      expect(readBank(run.b).run).toBeNull()
      expect(run.b.share).toBeLessThan(1)
      expect(ownerValue(run.b)).toBeLessThanOrEqual(pre + 1)
    }
    // Capital nearly gone: the rescue would have to buy almost all of it, so the state lets it fail.
    const { g, a, b } = bigBank(1e9)
    expect(bailoutTerms(g, b, readBank(b)).fair).toBeGreaterThan(.9)
    expect(bailoutEligible(g, b, readBank(b))).toBe(false)
    g.queue = []
    expect(forceBankEvent(g, a, b, 'tbtf')).toBe(false)
    const book = readBank(b); book.run = { year: 2008, wave: 1e11, severity: .2 }; book.lastYear = 2008; book.dramaYear = -1; saveBank(b, book)
    bankAfterYear(g, a, b, false)
    const popup = g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.run')
    expect(popup && popup.kind === 'choice' && popup.choices.some(c => c.id === 'bailout')).toBe(false)
    // A stale "too big to fail" popup for a bank that has since lost its value is withdrawn.
    const stale = bigBank(2.2e11)
    stale.g.queue = []
    forceBankEvent(stale.g, stale.a, stale.b, 'tbtf')
    const offer = stale.g.queue.find(m => m.kind === 'choice' && m.scriptId === 'bank.event')!
    stale.b.cash = 1e9; stale.b.valuation = valuationOf(stale.b)
    const share = stale.b.share, cash = stale.b.cash
    runScript(stale.g, 'bank.event', 'accept', offer.kind === 'choice' ? offer.data : undefined, offer)
    expect([stale.b.share, stale.b.cash]).toEqual([share, cash])
  })

  it('a 100-rated CEO gets no perfect-foresight trading income at a bank', () => {
    const { g, b } = bank()
    b.ceo = 'manager'; b.manager = { firstName: 'Per', lastName: 'Fect', gender: 'female', skill: 100, salary: 1, since: 2020 }
    const res = simulateBankYear(g, b, g.year, 0)
    const cash = b.cash, net = res.stmt.net
    settlePerfectForesight(g, b, res.stmt)
    expect(res.stmt.strategicIncome ?? 0).toBe(0)
    expect([b.cash, res.stmt.net]).toEqual([cash, net])
    expect(readBank(b).last!.profit).toBe(res.stmt.net)
  })

  it('the run-time advance is equity: an emergency loan neither erases the bank’s value nor bankrupts a closing', () => {
    const { g, a, b } = bank({ year: 2009 })
    const book = readBank(b); book.run = { year: 2008, wave: Math.round(book.deposits * .5), severity: .25 }; saveBank(b, book)
    const value = valuationOf(b)
    expect(value).toBeGreaterThan(0)
    resolveRun(g, a, b, 'cb', false)
    expect(readBank(b).advance).toBeGreaterThan(b.cash)
    expect(valuationOf(b)).toBe(value)
    // Repaying the central bank by hand moves value between cash and debt, nothing more.
    const repay = Math.min(b.cash, b.debt)
    b.cash -= repay; b.debt -= repay
    expect(valuationOf(b)).toBe(value)
    // Closing pays the savers out of the client book; the advance comes back to the owners.
    const money = g.character.money, equity = b.cash - b.debt + readBank(b).advance
    closeBusiness(g, a, b, 0)
    expect(g.assets.some(x => x.id === a.id)).toBe(false)
    expect(g.character.money - money).toBe(equity)
  })

  it('opens a new bank’s books at founding: capital or branches added before the first year-end conjure no deposits', () => {
    const { g, b } = bank({ cash: 15_000_000 })
    expect((b.financeFirm as Record<string, Json>).kind).toBe('bank')
    const book = readBank(b)
    balanced(book)
    b.cash += 300_000_000; b.outlets[0].count += 20
    expect(readBank(b)).toEqual(book)
    // A bank whose cash arrives after newBiz (a group venture) is opened again from that cash.
    const late = newBiz(g, 'bank', 'us', getCountry('us').cities[0], { founded: g.year })
    expect(loanTotal(readBank(late))).toBe(0)
    late.cash = 15_000_000
    openBank(late)
    expect(loanTotal(readBank(late))).toBeGreaterThan(0)
    balanced(readBank(late))
  })

  it('owners can take out only the capital above the regulatory minimum, and nothing in a run or a seizure', () => {
    const { g, a, b } = bank({ cash: 15_000_000 })
    simulateBankYear(g, b, g.year - 1, 0)
    b.yearCosts = 0; b.yearIncome = 0
    let book = readBank(b)
    const capital = bankCapital(b, book), need = riskWeighted(book, capital) * minCapitalRatio(b.countryId, g.year)
    expect(need).toBeGreaterThan(0)
    expect(payableCash(a, b)).toBeLessThanOrEqual(Math.ceil(capital - need))
    expect(payableCash(a, b)).toBeGreaterThan(0)
    // Pay out everything allowed: the bank is still at (or above) its minimum.
    const money = g.character.money
    payDividend(g, a, b, 1e15)
    expect(g.character.money).toBeGreaterThan(money)
    book = readBank(b)
    expect(capitalRatio(b, book)).toBeGreaterThanOrEqual(minCapitalRatio(b.countryId, g.year) - 1e-6)
    expect(payableCash(a, b)).toBe(0)
    // A pending run or seizure freezes payouts, and the Money menu says why.
    b.cash += 50_000_000
    for (const patch of [{ run: { year: g.year - 1, wave: 1e6, severity: .2 } }, { seize: true }]) {
      const x = readBank(b); Object.assign(x, patch); saveBank(b, x)
      expect(payableCash(a, b)).toBe(0)
      expect(bankPayoutBlock(b)).toMatch(/run|seize/)
      const y = readBank(b); y.run = null; y.seize = false; saveBank(b, y)
    }
    expect(payableCash(a, b)).toBeGreaterThan(0)
  })
})
