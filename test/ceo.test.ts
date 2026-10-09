// Hired CEOs who actually run the company: above 75 they plan with the optimizer and invest when
// it pays (within the mandate and the cash reserve); replacing them has no yearly cap but real
// costs (severance, headhunters, morale); old saves keep working.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { boardOf, readBoard } from '../src/game/business/board-state'
import { capexBudget, payableCash, reserveDollars } from '../src/game/business/board-vote'
import { smartManagerTurn, smartPlan } from '../src/game/business/board-ceo'
import { askingSalary, becomeCeo, ceoSeverance, headhunterFee, shortlist, stepDown, styleOf } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, businessAssets, findBusiness, normalizeBiz, readBiz, totalOutlets, type BizState, type Manager } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { startFounding } from '../src/game/business/founding'
import { studioAssets, studioInternals, studioManagerTurn, studioOf } from '../src/game/business/gamestudio'
import { devGames } from '../src/game/business/gamestudio-state'
import { makeTestGame } from './helpers'

/** Answer every popup with its first choice (inputs: their default). */
function drain(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 400; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || String(m.min ?? 1), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function manager(b: BizState, skill: number, year: number, extra: Partial<Manager> = {}): Manager {
  return { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: year, style: 'steady', integrity: 100, ...extra }
}

/** A six-site company that has just been handed to a hired CEO of this skill (same start for every skill). */
function managed(seed: number, skill: number, industry: Industry = 'restaurant', countryId = 'us', opts: { cash?: number; outlets?: number } = {}): { g: GameState; a: Asset } {
  const g = createNewLife({ seed, year: 1990, countryId })
  g.queue = []
  const c = g.character
  c.age = 36
  g.year = 2026
  c.money = 1_000_000
  c.talent = null
  c.talents = []
  const city = getCountry(countryId).cities[0]
  const b0 = newBiz(g, industry, countryId, city, { cash: opts.cash ?? 1_500_000, founded: 2020, outlets: [{ countryId, city, count: opts.outlets ?? 6, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  stepDown(g, a, b, manager(b, skill, g.year))
  g.queue = []
  return { g, a }
}

/** Book `n` years of the company (the business loop only), answering every popup. */
function years(g: GameState, n: number): number {
  let profit = 0
  for (let y = 0; y < n; y++) {
    yearlyBusinessImpl(g)
    drain(g)
    g.year += 1
    const cur = businessAssets(g)[0]
    if (!cur) break
    profit += readBiz(g, cur).last?.net ?? 0
  }
  return profit
}

function finite(x: unknown, path = 'state'): void {
  if (typeof x === 'number') expect(Number.isFinite(x), path).toBe(true)
  else if (Array.isArray(x)) x.forEach((v, i) => finite(v, `${path}[${i}]`))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finite(v, `${path}.${k}`)
}

function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 4 ? [n, ...all(g, n.children(g), depth + 1)] : [n]))
}

function action(g: GameState, a: Asset, id: string): MenuAction {
  const n = all(g, businessView(g, a)).find((x) => x.id === `${id}.${a.id}`)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

describe('smart hired CEOs', () => {
  it('a skill-90 CEO beats a skill-60 one on profit over 10 years, across seeds and markets', () => {
    let wins = 0
    let runs = 0
    let total90 = 0
    let total60 = 0
    for (const [industry, cc] of [['restaurant', 'us'], ['bakery', 'fr'], ['foodTruck', 'mx']] as [Industry, string][]) {
      for (const seed of [1, 2]) {
        const p60 = years(managed(seed, 60, industry, cc).g, 10)
        const p90 = years(managed(seed, 90, industry, cc).g, 10)
        runs++
        if (p90 > p60) wins++
        total90 += p90
        total60 += p60
      }
    }
    expect(wins).toBeGreaterThanOrEqual(runs - 1)
    expect(total90).toBeGreaterThan(total60 * 1.5)
  }, 120_000)

  it('plans price and production close to the optimizer, closer the better they are', () => {
    let err95 = 0
    let err76 = 0
    for (const seed of [1, 2, 3, 4]) {
      const { g, a } = managed(seed, 90)
      years(g, 2)
      const cur = businessAssets(g)[0]
      const b = bizOf(g, cur)
      const best = bestPlan(g, b)
      for (const [skill, add] of [
        [95, (e: number) => (err95 += e)],
        [76, (e: number) => (err76 += e)],
      ] as [number, (e: number) => void][]) {
        const p = smartPlan(g, cur, b, skill)
        const e = Math.abs(p.price / best.price - 1) + Math.abs(p.production / Math.max(1, best.production) - 1)
        expect(Math.abs(p.price / best.price - 1)).toBeLessThan(skill >= 95 ? 0.01 : 0.03)
        expect(Math.abs(p.production / Math.max(1, best.production) - 1)).toBeLessThan(skill >= 95 ? 0.015 : 0.04)
        add(e)
      }
      void a
    }
    expect(err95).toBeLessThan(err76)
  })

  it('obeys the mandate: the budget caps new sites and R&D, the reserve stays, cash mandates pay out', () => {
    // No budget: a smart CEO opens nothing and starts no R&D however good it looks.
    const x = managed(3, 92, 'bakery', 'fr', { cash: 6_000_000 })
    years(x.g, 2)
    let a = businessAssets(x.g)[0]
    let b = bizOf(x.g, a)
    const st = boardOf(b)
    st.limits = { capex: 0, reserve: 3, pay: 1.5 }
    const sites = totalOutlets(b)
    const rd = (b.rd ?? []).length
    smartManagerTurn(x.g, a, b)
    expect(totalOutlets(b)).toBeLessThanOrEqual(sites)
    expect((b.rd ?? []).length).toBe(rd)
    // A generous budget with a big reserve: spending never takes cash below the reserve.
    st.limits = { capex: 1, reserve: 9, pay: 1.5 }
    const cashBefore = b.cash
    const reserve = reserveDollars(b, st)
    smartManagerTurn(x.g, a, b)
    if (cashBefore > reserve) expect(b.cash).toBeGreaterThanOrEqual(reserve - 1)
    expect(st.spent).toBeLessThanOrEqual(capexBudget(b, st) + 1)
    // Cash to owners: spare cash above the reserve goes out as a dividend (taxed income for the owner).
    const y = managed(4, 90, 'restaurant', 'us', { cash: 5_000_000 })
    years(y.g, 2)
    a = businessAssets(y.g)[0]
    b = bizOf(y.g, a)
    boardOf(b).mandate = 'cash'
    boardOf(b).limits = { capex: 0.05, reserve: 2, pay: 1.25 }
    const money0 = y.g.character.money
    const payable0 = payableCash(a, b)
    smartManagerTurn(y.g, a, b)
    expect(y.g.character.money).toBeGreaterThan(money0)
    // Never more than the company could pay out (cash beyond its debt).
    expect(y.g.character.money - money0).toBeLessThanOrEqual(payable0)
    expect(b.cash).toBeGreaterThanOrEqual(reserveDollars(b, boardOf(b)) - 1)
    // One letter a year at most.
    const letters = y.g.queue.filter((m) => m.kind === 'notice' && /Letter from the CEO/.test(m.title)).length
    smartManagerTurn(y.g, a, b)
    expect(y.g.queue.filter((m) => m.kind === 'notice' && /Letter from the CEO/.test(m.title)).length).toBe(letters)
    expect(letters).toBeLessThanOrEqual(1)
  })

  it('replaces the CEO three times in one year, paying severance and a headhunter every time', () => {
    const { g, a } = managed(5, 70)
    years(g, 1)
    const cur = businessAssets(g)[0]
    let lastName = bizOf(g, cur).manager!.firstName + bizOf(g, cur).manager!.lastName
    for (let i = 0; i < 3; i++) {
      const b = bizOf(g, cur)
      b.cash = 3_000_000
      const sev = ceoSeverance(b.manager!, g.year)
      const fee = headhunterFee(b, 'standard', i)
      const row = action(g, cur, 'biz.replaceManager')
      expect(row.disabledReason?.(g) ?? null).toBeNull()
      row.run(g)
      const pick = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')
      expect(pick, `shortlist ${i}`).toBeTruthy()
      g.queue = g.queue.filter((m) => m !== pick)
      expect(bizOf(g, cur).cash).toBe(3_000_000 - fee)
      runScript(g, pick!.scriptId!, 'm1', pick!.data, pick!)
      const after = bizOf(g, cur)
      expect(after.cash).toBe(3_000_000 - fee - sev)
      expect(sev).toBeGreaterThan(0)
      const name = after.manager!.firstName + after.manager!.lastName
      expect(after.ceo).toBe('manager')
      expect(name === lastName && i > 0 ? 'same' : 'new').toBe('new')
      lastName = name
      g.queue = []
    }
    // Churning CEOs leaves a mark: candidates ask more and morale took hits.
    expect(readBoard(bizOf(g, cur).board).churn).toBeGreaterThanOrEqual(2)
    void a
  })

  it('never overdraws a company for a CEO search and does not consume a failed search', () => {
    const { g, a } = managed(51, 70)
    let b = bizOf(g, a)
    b.cash = 0
    g.character.money = 0
    action(g, a, 'biz.replaceManager').run(g)
    expect(bizOf(g, a).cash).toBe(0)
    expect(g.character.money).toBe(0)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'business.manager')).toBe(false)
    expect(g.queue.some((m) => m.kind === 'notice' && /cannot cover/i.test(m.text))).toBe(true)

    g.queue = []
    b = bizOf(g, a)
    const fee = headhunterFee(b, 'standard', 0)
    const companyPart = Math.floor(fee / 2)
    const costs = b.yearCosts
    b.cash = companyPart
    g.character.money = fee - companyPart
    action(g, a, 'biz.replaceManager').run(g)
    expect(bizOf(g, a).cash).toBe(0)
    expect(g.character.money).toBe(0)
    expect(bizOf(g, a).yearCosts).toBe(costs + fee)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'business.manager')).toBe(true)
  })

  it('offers fresh shortlists without limit, dearer each time, with stars in an executive search', () => {
    const { g } = managed(6, 60)
    const a = businessAssets(g)[0]
    const b = bizOf(g, a)
    expect(headhunterFee(b, 'standard', 3)).toBeGreaterThan(headhunterFee(b, 'standard', 0))
    expect(headhunterFee(b, 'executive', 0)).toBeGreaterThan(headhunterFee(b, 'standard', 0))
    const exec = shortlist(g, b, 'executive')
    expect(exec.length).toBe(5)
    expect(exec.some((m) => m.skill >= 85)).toBe(true)
    // Stars cost more than the rest.
    const star = exec.reduce((x, y) => (y.skill > x.skill ? y : x))
    expect(star.salary).toBeGreaterThan(Math.min(...exec.map((m) => m.salary)))
    // The Business talent marks exactly one candidate (or keeping the CEO) as the best value.
    g.character.talents = ['Business']
    b.cash = 2_000_000
    action(g, a, 'biz.replaceManager').run(g)
    let pick = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')!
    expect(pick.choices.filter((c) => c.hint).length).toBe(1)
    // "Another shortlist" again and again.
    for (let i = 0; i < 4; i++) {
      g.queue = g.queue.filter((m) => m !== pick)
      runScript(g, pick.scriptId!, i % 2 ? 'exec' : 'again', pick.data, pick)
      pick = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')!
      expect(pick).toBeTruthy()
    }
    expect(g.yearActions[`biz.headhunt.${a.id}`]).toBe(5)
  })

  it('loads old saves: managers without style or integrity, companies without governance', () => {
    const { g } = managed(7, 80)
    const a = businessAssets(g)[0]
    const d = a.details as Record<string, Json>
    delete d.board
    const m = d.manager as Record<string, Json>
    delete m.style
    delete m.integrity
    const b = normalizeBiz(JSON.parse(JSON.stringify(d)) as Record<string, Json>, g.year)
    expect(b.manager?.style).toBeUndefined()
    expect(styleOf(b.manager)).toBe('steady')
    expect(readBoard(undefined).mandate).toBe('balanced')
    expect(readBoard({ junk: 1, members: [{ seat: 'nope' }], limits: { capex: 'x' } } as unknown as Json).members).toEqual([])
    expect(() => years(g, 3)).not.toThrow()
    finite(g.assets)
  })

  it('a smart studio CEO fills the pipeline with the best pitches; a 60 starts one game when idle', () => {
    const made: Record<number, number> = {}
    for (const skill of [60, 90]) {
      const g = makeTestGame(9, { age: 30, countryId: 'us', money: 50_000_000 })
      g.lifeId = 'ceo-studio'
      g.character.city = getCountry('us').cities[0]
      startFounding(g, 'gameStudio')
      for (let guard = 0; g.queue.length && guard < 40; guard++) {
        const m = g.queue.shift()!
        if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, (m.choices.find((c) => ['city0', 'savings', 'me'].includes(c.id)) ?? m.choices[0]).id, m.data, m)
        else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Test Studio', m.data, m)
      }
      const a = studioAssets(g)[0]
      const b = bizOf(g, a)
      b.cash = 80_000_000
      studioInternals.hireDevs(g, a, b, 60)
      b.cash = 80_000_000
      stepDown(g, a, b, manager(b, skill, g.year))
      g.queue = []
      studioManagerTurn(g, a, b)
      made[skill] = devGames(studioOf(a)).length
      // The CEO's letter is on file either way.
      expect(readBoard(bizOf(g, a).board).memo.length).toBeGreaterThan(0)
    }
    expect(made[60]).toBe(1)
    expect(made[90]).toBeGreaterThanOrEqual(2)
  })

  it('runs managed companies of every kind for 30 years without errors or broken numbers', () => {
    const cases: [Industry, string, number][] = [
      ['restaurant', 'us', 90],
      ['fashion', 'jp', 78],
      ['bakery', 'fr', 62],
      ['gameStudio', 'us', 88],
      ['semiconductor', 'tw', 85],
    ]
    for (const [i, [industry, cc, skill]] of cases.entries()) {
      const { g, a } = managed(40 + i, skill, industry, cc, { outlets: industry === 'gameStudio' || industry === 'semiconductor' ? 1 : 4 })
      // Outside investors on some: a board that reviews, pays and fires.
      if (i % 2 === 1) bizOf(g, a).share = 0.45
      for (let y = 0; y < 30 && g.character.alive; y++) {
        ageUp(g)
        drain(g)
        finite(g.assets.map((x) => x.details))
        const cur = findBusiness(g, a.id)
        if (!cur) break
        const b = readBiz(g, cur)
        expect(b.cash).not.toBeNaN()
        expect(b.valuation).toBeGreaterThanOrEqual(0)
        expect(['owner', 'manager']).toContain(b.ceo)
      }
      expect(() => JSON.parse(JSON.stringify(g))).not.toThrow()
    }
  }, 240_000)
})
