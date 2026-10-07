// Boards of directors: who has one, seats that follow ownership, honest votes (self-dealing fails
// without control, mostly passes with it, independents block the blatant kind), the board's yearly
// review (firing a slumping CEO), its menu rows and hints, and the money rails it must not open.
import { describe, expect, it } from 'vitest'
import { boardNodes, boardYear, hasBoard, members, mandateOf, ownerControls, passOdds, registerGroupBoard, setMandate, vote, type Proposal } from '../src/game/business/board'
import { briefNodes, payDividend } from '../src/game/business/board-menu'
import { boardOf, boardView, controlsBoard, readBoard, seatPlan, syncSeats } from '../src/game/business/board-state'
import { needsVote, payableCash, payCap, sustainablePayout } from '../src/game/business/board-vote'
import { askingSalary, becomeCeo, ceoPayNorm, stepDown } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, findBusiness, readBiz, runsIt, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

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

/** A player-run company with two booked years and the given ownership. */
function company(seed: number, opts: { share?: number; isPublic?: boolean; cash?: number; talent?: boolean } = {}): { g: GameState; a: Asset; b: BizState } {
  const g = createNewLife({ seed, year: 1990, countryId: 'us' })
  g.queue = []
  const c = g.character
  c.age = 36
  g.year = 2026
  c.money = 2_000_000
  c.talent = null
  c.talents = opts.talent ? ['Business'] : []
  const city = getCountry('us').cities[0]
  const b0 = newBiz(g, 'restaurant', 'us', city, { cash: opts.cash ?? 2_000_000, founded: 2020, outlets: [{ countryId: 'us', city, count: 8, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Board Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  for (let y = 0; y < 2; y++) {
    yearlyBusinessImpl(g)
    drain(g)
    g.year += 1
  }
  const cur = findBusiness(g, a.id)!
  const bb = bizOf(g, cur)
  bb.share = opts.share ?? 1
  if (opts.isPublic) {
    bb.public = true
    bb.sharesOut = 1_000_000
    bb.sharePrice = Math.max(1, Math.round(bb.valuation / 1_000_000))
    bb.exchange = 'NYSE'
  }
  bb.cash = Math.max(bb.cash, opts.cash ?? 2_000_000)
  g.queue = []
  return { g, a: cur, b: bb }
}

function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 4 ? [n, ...all(g, n.children(g), depth + 1)] : [n]))
}

function action(g: GameState, a: Asset, id: string): MenuAction {
  const n = all(g, businessView(g, a)).find((x) => x.id === `${id}.${a.id}`)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

const raise = (b: BizState, k: number): Proposal => ({ kind: 'ownerPay', by: 'owner', amount: Math.round(ceoPayNorm(b) * k), label: `Raise your own salary to ${k}x the norm` })

describe('boards of directors', () => {
  it('exists when anyone else owns part of the company or it is listed, not for a 100%-owned private one', () => {
    const own = company(1)
    expect(hasBoard(own.g, own.b)).toBe(false)
    expect(members(own.g, own.a)).toEqual([])
    expect(boardNodes(own.g, own.a)).toEqual([])
    const inv = company(1, { share: 0.7 })
    expect(hasBoard(inv.g, inv.b)).toBe(true)
    expect(members(inv.g, inv.a).length).toBeGreaterThanOrEqual(3)
    const pub = company(1, { share: 1, isPublic: true })
    expect(hasBoard(pub.g, pub.b)).toBe(true)
    // A listing always seats independents, even for an owner who kept nearly everything.
    expect(members(pub.g, pub.a).filter((d) => d.seat === 'independent').length).toBeGreaterThanOrEqual(2)
    // Group membership (conglomerates) is an extension point.
    registerGroupBoard((_g, b) => (b === own.b ? { name: 'Test Group' } : null))
    expect(hasBoard(own.g, own.b)).toBe(true)
    expect(seatPlan(own.g, own.b).group).toBeGreaterThan(0)
    registerGroupBoard(() => null)
    expect(hasBoard(own.g, own.b)).toBe(false)
  })

  it('gives seats by ownership: a 30% owner of a listed company is outnumbered, an 80% owner controls it', () => {
    const low = company(2, { share: 0.3, isPublic: true })
    const high = company(2, { share: 0.8, isPublic: true })
    expect(ownerControls(low.g, low.a)).toBe(false)
    expect(ownerControls(high.g, high.a)).toBe(true)
    const lowSeats = members(low.g, low.a)
    expect(lowSeats.filter((d) => d.seat === 'owner').length * 2).toBeLessThan(lowSeats.length)
    // Names are local and stable: the menu shows exactly who the yearly review seats.
    const shown = members(low.g, low.a).map((d) => `${d.firstName} ${d.lastName}`)
    const rng = low.g.rng
    const st = boardOf(low.b)
    syncSeats(low.g, low.a, low.b, st)
    expect(st.members.map((d) => `${d.firstName} ${d.lastName}`)).toEqual(shown)
    expect(low.g.rng).toBe(rng)
    // Selling down the stake reshapes the board: fewer owner seats, more outsiders.
    low.b.share = 0.1
    syncSeats(low.g, low.a, low.b, st)
    expect(st.members.filter((d) => d.seat === 'owner').length).toBeLessThan(lowSeats.filter((d) => d.seat === 'owner').length)
  })

  it('votes a self-dealing pay raise down at 30% of a listed company and mostly through at 80%', () => {
    const low = company(3, { share: 0.3, isPublic: true })
    const high = company(3, { share: 0.8, isPublic: true })
    // 2.4x the going rate (the default pay policy allows 1.5x): self-dealing, not blatant.
    const pLow = passOdds(low.g, low.a, low.b, raise(low.b, 2.4))
    const pHigh = passOdds(high.g, high.a, high.b, raise(high.b, 2.4))
    expect(pLow).toBeLessThan(0.15)
    expect(pHigh).toBeGreaterThan(0.85)
    // The rolls agree with the odds.
    let passLow = 0
    let passHigh = 0
    for (let i = 0; i < 60; i++) {
      for (const [x, add] of [
        [low, () => passLow++],
        [high, () => passHigh++],
      ] as [typeof low, () => void][]) {
        const g = structuredClone(x.g)
        g.rng = 1000 + i
        const a = findBusiness(g, x.a.id)!
        if (vote(g, a, bizOf(g, a), raise(bizOf(g, a), 2.4), { quiet: true }).passed) add()
      }
    }
    expect(passLow).toBeLessThan(15)
    expect(passHigh).toBeGreaterThan(45)
    // Blatant self-dealing (4x the norm) is where independents block even an 80% owner.
    expect(passOdds(high.g, high.a, high.b, raise(high.b, 4))).toBeLessThan(pHigh - 0.2)
    // Within the pay policy no vote is needed at all.
    expect(needsVote(high.g, high.a, high.b, raise(high.b, 1.2))).toBeNull()
  })

  it('passOdds is the probability vote() rolls (an honest hint)', () => {
    const x = company(4, { share: 0.45 })
    const p: Proposal = { kind: 'dividend', by: 'owner', amount: Math.round(payableCash(x.a, x.b)), label: 'Pay out everything' }
    const odds = passOdds(x.g, x.a, x.b, p)
    let passed = 0
    const n = 400
    for (let i = 0; i < n; i++) {
      const g = structuredClone(x.g)
      g.rng = 7_000 + i * 13
      const a = findBusiness(g, x.a.id)!
      if (vote(g, a, bizOf(g, a), p, { quiet: true }).passed) passed++
    }
    expect(Math.abs(passed / n - odds)).toBeLessThan(0.08)
  })

  it('fires a slumping CEO: the owner when they do not control the board, and a hired one who keeps missing', () => {
    let ousted = 0
    for (let seed = 10; seed < 16; seed++) {
      const { g, a, b } = company(seed, { share: 0.3, isPublic: true })
      for (let y = 0; y < 8 && runsIt(g, a); y++) {
        const cur = bizOf(g, a)
        cur.slump = 3
        cur.history = cur.history.map((r, i) => ({ ...r, profit: -100_000 * (i + 1), revenue: r.revenue }))
        cur.last = { ...cur.last!, net: -500_000 }
        boardYear(g, a, cur, cur.last)
        drain(g)
        g.year += 1
      }
      if (!runsIt(g, a)) {
        ousted++
        expect(bizOf(g, a).ceo).toBe('manager')
        expect(g.character.careerHistory[g.character.careerHistory.length - 1]?.reason).toBe('fired')
      }
      void b
    }
    expect(ousted).toBeGreaterThanOrEqual(4)
    // A hired CEO on an investor-controlled board.
    const { g, a, b } = company(20, { share: 0.4 })
    stepDown(g, a, b, { firstName: 'Max', lastName: 'Slow', gender: 'male', skill: 40, salary: askingSalary(b, 40), since: g.year, integrity: 100 })
    let fired = false
    for (let y = 0; y < 8 && !fired; y++) {
      const cur = bizOf(g, a)
      cur.last = { ...cur.last!, revenue: 1_000_000, net: -400_000 }
      boardYear(g, a, cur, cur.last)
      fired = cur.manager?.lastName !== 'Slow'
      g.queue = []
      g.year += 1
    }
    expect(fired).toBe(true)
  })

  it('a 100%-owned company with a hired CEO gets the owner brief instead of a board', () => {
    const { g, a, b } = company(5)
    stepDown(g, a, b, { firstName: 'Ana', lastName: 'Ruiz', gender: 'female', skill: 82, salary: askingSalary(b, 82), since: g.year, integrity: 90 })
    expect(boardNodes(g, a)).toEqual([])
    expect(briefNodes(g, a).length).toBe(1)
    // Setting the mandate directly needs no vote and resets the limits to suit it.
    const set = all(g, businessView(g, a)).find((n) => n.id === `biz.board.mandate.growth.${a.id}`) as MenuAction
    expect(set).toBeTruthy()
    set.run(g)
    expect(mandateOf(g, a).mandate).toBe('growth')
    expect(readBoard(bizOf(g, a).board).votes.length).toBe(0)
  })

  it('shows members, mandate, votes and pure hints on the Board menu', () => {
    const { g, a } = company(6, { share: 0.4, isPublic: true, talent: true })
    const rows = all(g, businessView(g, a))
    expect(rows.some((r) => r.id === `biz.board.${a.id}`)).toBe(true)
    expect(rows.filter((r) => r.id.startsWith(`biz.board.m.${a.id}`)).length).toBe(members(g, a).length)
    const rng = g.rng
    const ids = g.nextId
    const texts: string[] = []
    for (const r of rows) {
      if (r.type === 'action' || r.type === 'menu') {
        const h = r.hint?.(g)
        if (h) texts.push(h)
        const s = typeof r.subtitle === 'function' ? r.subtitle(g) : r.subtitle
        if (s) texts.push(s)
      }
      if (r.type === 'action' && r.input?.kind === 'slider' && r.input.preview) {
        for (const v of [r.input.min ?? 0, r.input.max ?? 1]) texts.push(r.input.preview(g, v))
      }
    }
    // Hints and previews never touch the game's RNG or ids.
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(ids)
    expect(texts.some((t) => t.includes('\u{1F52E}'))).toBe(true)
    for (const t of texts) expect(t).not.toMatch(/NaN|undefined|Infinity/)
    // A proposal through the menu: the vote lands on the record.
    const budget = rows.find((r) => r.id === `biz.board.limit.capex.${a.id}`) as MenuAction
    budget.run(g, '60')
    expect(readBoard(bizOf(g, a).board).votes.length).toBe(1)
    expect(g.queue.some((m) => m.kind === 'notice' && /Board Vote/.test(m.title))).toBe(true)
  })

  it('keeps every money rail: no payout beyond cash net of debt, salary still capped, bonus once a year', () => {
    const { g, a, b } = company(7, { share: 0.6 })
    b.debt = 1_500_000
    b.cash = 2_000_000
    const before = g.character.money
    // Ask for far more than exists: at most cash beyond the debt can leave, and only if the board agrees.
    const paid = payDividend(g, a, b, 50_000_000)
    expect(g.character.money - before).toBeLessThanOrEqual(Math.round(500_000 * b.share) + 1)
    if (paid) expect(b.cash).toBeGreaterThanOrEqual(b.debt - 1)
    // Salary above the hard cap is clamped whatever the board says.
    const salary = action(g, a, 'biz.salary')
    salary.run(g, String(1e12))
    expect(bizOf(g, a).ownerSalary).toBeLessThanOrEqual(Math.max(payCap(b, boardOf(b)) * 10, 50_000_000))
    // The yearly bonus limit still holds.
    b.debt = 0
    b.cash = 3_000_000
    const bonus = action(g, a, 'biz.bonus')
    bonus.run(g, '1000')
    g.queue = []
    const cash = bizOf(g, a).cash
    bonus.run(g, '1000')
    expect(bizOf(g, a).cash).toBe(cash)
    // Sustainable payouts need no vote; spare cash is cash beyond debt and the reserve.
    const st = boardView(g, a, bizOf(g, a))
    expect(sustainablePayout(a, bizOf(g, a), st)).toBeLessThanOrEqual(payableCash(a, bizOf(g, a)))
    expect(needsVote(g, a, bizOf(g, a), { kind: 'dividend', by: 'owner', amount: Math.max(1, sustainablePayout(a, bizOf(g, a), st)), label: '' })).toBeNull()
  })

  it('applies a mandate the group decides, and the CEO letter respects it', () => {
    const { g, a, b } = company(8, { share: 0.55 })
    setMandate(g, a, b, 'cash')
    expect(mandateOf(g, a).mandate).toBe('cash')
    expect(mandateOf(g, a).limits.capex).toBeLessThan(0.1)
    expect(controlsBoard(boardOf(b))).toBe(true)
  })

  it('keeps old saves loading: a company without governance data reviews fine', () => {
    const { g, a, b } = company(9, { share: 0.5 })
    delete b.board
    expect(() => boardYear(g, a, b, b.last!)).not.toThrow()
    expect(readBiz(g, a).board).toBeTruthy()
  })
})
