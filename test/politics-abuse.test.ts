// Abuse of power (special/politics.ts): office holders make market-moving announcements
// (invest/shocks.ts), bet on them first (computer/money-stocks.ts, Investments, a crony), and face
// leaks, scandals, regulators, impeachment / no-confidence votes and arrest, scaled by country.
import { describe, expect, it } from 'vitest'
import { moneyNodes, yearlyMoney } from '../src/game/computer/money'
import { anchor, fam, moneyState, readState } from '../src/game/computer/money-common'
import { BETS_PER_YEAR, betPayoff, coinTargets, placeBet, settlePrice, stockStrike, stockFairValue, stockOptionPrice, stockTargets, listedTargets } from '../src/game/computer/money-stocks'
import { settleMove } from '../src/game/computer/money-options'
import { companyDef, exchangeInfo, exchangeYear, indexMove, isRealSecId } from '../src/game/invest/engine'
import { addMarketShock, factorOf, marketShocks, shockFactor } from '../src/game/invest/shocks'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import { runScript } from '../src/game/scripts'
import { specialJobNodes, yearlySpecial } from '../src/game/special'
import type { ChoiceModal, GameState, InputModal, Json, MenuAction, MenuGroup, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

type Office = 'school' | 'mayor' | 'governor' | 'leader'
const TITLES: Record<Office, string> = { school: 'School Board Director', mayor: 'Mayor', governor: 'Governor', leader: 'President' }

function official(cid = 'us', office: Office = 'leader', seed = 1, money = 5_000_000, approval = 60): GameState {
  const g = makeTestGame(seed, { age: 55, countryId: cid, birthCountryId: cid, money })
  g.character.job = {
    defId: 'politician',
    title: TITLES[office],
    company: 'Somewhere',
    category: 'special',
    salary: 100_000,
    level: ['school', 'mayor', 'governor', 'leader'].indexOf(office),
    performance: approval,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { office, party: 'centrist', approval, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 55, roleStartAge: 55 },
  }
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && (!n.visible || n.visible(g))) {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const i = g.queue.findIndex((m) => m.kind === kind && (!scriptId || ('scriptId' in m && m.scriptId === scriptId)))
  if (i < 0) throw new Error(`no ${kind} ${scriptId ?? ''}: ${g.queue.map((m) => `${m.kind}:${'scriptId' in m ? m.scriptId : ''}`).join(', ')}`)
  const [m] = g.queue.splice(i, 1)
  return m as Extract<ModalItem, { kind: K }>
}

function answer(g: GameState, scriptId: string, choice: string): ChoiceModal {
  const m = take(g, 'choice', scriptId)
  runScript(g, scriptId, choice, m.data, m)
  return m
}

function input(g: GameState, scriptId: string, value: string): InputModal {
  const m = take(g, 'input', scriptId)
  runScript(g, scriptId, value, m.data, m)
  return m
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

/** Announce something about a security through the menus. */
function announce(g: GameState, secId: string, move: string): void {
  const row = findNode(g, specialJobNodes(g), `pol.abuse.announce.${secId}`)
  if (!row || row.type !== 'action') throw new Error('no announce row')
  expect(row.disabledReason?.(g) ?? null).toBeNull()
  row.run(g)
  answer(g, 'special.pol.abuse.announce', move)
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
}

function abuse(g: GameState): { heat: number; moves: number; cases: { id: string; status: string; via: string; evidence: number }[]; crony: string } {
  return (g.flags['special.politics'] as unknown as { abuse: ReturnType<typeof abuse> }).abuse
}

function roundTrips(g: GameState): void {
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
  expect(json).not.toContain('NaN')
  expect(json).not.toContain('null,"units"')
  expect(Number.isFinite(g.character.money)).toBe(true)
}

function hasArrest(g: GameState): boolean {
  return g.queue.some((m) => m.kind === 'choice' && (m.scriptId === 'crime.arrest' || m.scriptId === 'crime.trial.lawyer'))
}

describe('who can abuse power', () => {
  it('non-politicians and school board members have no such menu, and the scripts do nothing', () => {
    const civilian = makeTestGame(1, { age: 40, money: 1_000_000 })
    expect(findNode(civilian, specialJobNodes(civilian), 'pol.abuse')).toBeUndefined()
    const t = stockTargets(civilian)[0]
    runScript(civilian, 'special.pol.abuse.announce', 'ban', { secId: t.secId }, undefined as unknown as ModalItem)
    expect(marketShocks(civilian)).toHaveLength(0)
    runScript(civilian, 'special.pol.abuse.cronySize', '50000', { secId: t.secId, kind: 'put' }, undefined as unknown as ModalItem)
    expect(readState(civilian).bets).toHaveLength(0)
    expect(civilian.character.money).toBe(1_000_000)

    const board = official('us', 'school')
    const menu = findNode(board, specialJobNodes(board), 'pol.abuse') as MenuGroup | undefined
    expect(!menu || menu.visible?.(board) === false).toBe(true)
    runScript(board, 'special.pol.abuse.announce', 'ban', { secId: t.secId }, undefined as unknown as ModalItem)
    expect(marketShocks(board)).toHaveLength(0)
  })

  it('a mayor nudges markets, a head of government moves them, and only higher offices touch crypto', () => {
    const mayor = official('us', 'mayor')
    const pres = official('us', 'leader')
    const t = stockTargets(mayor)[2]
    announce(mayor, t.secId, 'ban')
    announce(pres, t.secId, 'ban')
    const m = 1 - marketShocks(mayor)[0].mult
    const p = 1 - marketShocks(pres)[0].mult
    expect(m).toBeGreaterThan(0.03)
    expect(p).toBeGreaterThan(m * 3)
    const coin = coinTargets(mayor)[0]
    expect(findNode(mayor, specialJobNodes(mayor), `pol.abuse.announce.${coin.secId}`)).toBeUndefined()
    expect(findNode(pres, specialJobNodes(pres), `pol.abuse.announce.${coin.secId}`)).toBeDefined()
    // Mayors can't nationalize.
    const fresh = official('us', 'mayor', 2)
    ;(findNode(fresh, specialJobNodes(fresh), `pol.abuse.announce.${t.secId}`) as MenuAction).run(fresh)
    const ch = take(fresh, 'choice', 'special.pol.abuse.announce')
    expect(ch.choices.map((c) => c.id)).not.toContain('nationalize')
    expect(ch.choices.map((c) => c.id)).toContain('contract')
  })

  it('refuses negative market moves against registered real companies without spending the action', () => {
    const g = official('us', 'leader')
    const real = listedTargets(g).find((t) => t.real)
    expect(real).toBeDefined()
    runScript(g, 'special.pol.abuse.announce', 'ban', { secId: real!.secId }, undefined as unknown as ModalItem)
    expect(marketShocks(g)).toHaveLength(0)
    expect(g.yearActions['pol.marketMove'] ?? 0).toBe(0)
    expect(notices(g).at(-1)?.text).toMatch(/legal advisers refused/i)
    g.queue = []
    runScript(g, 'special.pol.abuse.announce', 'contract', { secId: real!.secId }, undefined as unknown as ModalItem)
    expect(marketShocks(g)).toHaveLength(1)
    expect(marketShocks(g)[0].mult).toBeGreaterThan(1)
    expect(g.yearActions['pol.marketMove']).toBe(1)
  })
})

describe('market shocks', () => {
  it('move the price in Investments at once, revalue holdings, drag the index and stay put', () => {
    const g = official('jp', 'leader')
    const t = stockTargets(g)[1]
    const quote = () => investmentListing(g).find((q) => q.secId === t.secId)!
    const fund = investmentListing(g).find((q) => q.type === 'index')!
    expect(buySecurity(g, t.secId, 200_000)).toBe(true)
    expect(buySecurity(g, fund.secId, 200_000)).toBe(true)
    const before = quote().price
    const holding = () => investmentHoldings(g).find((a) => a.details.secId === t.secId)!
    const indexHolding = () => investmentHoldings(g).find((a) => a.details.secId === fund.secId)!
    const v0 = holding().value
    const f0 = indexHolding().value
    g.queue = []
    announce(g, t.secId, 'ban')
    const shock = marketShocks(g)[0]
    expect(shock.mult).toBeLessThan(0.75)
    expect(quote().price).toBeCloseTo(before * shock.mult, 6)
    expect(holding().value).toBeLessThan(v0 * 0.8)
    expect(indexHolding().value).toBeLessThan(f0)
    expect(notices(g).at(-1)!.text).toMatch(/plunged \d+%/)
    // Plain JSON, and the shock is permanent: no scheduled rebound to buy into.
    roundTrips(g)
    expect(factorOf(shock, g.year + 1)).toBeCloseTo(shock.mult, 9)
    expect(factorOf(shock, g.year + 4)).toBeCloseTo(shock.mult, 9)
    expect(factorOf(shock, g.year + 30)).toBeCloseTo(shock.mult, 9)
    // The yearly move starts from the shocked price (no snap-back to the old one).
    nextYear(g)
    yearlyInvestments(g)
    const h = holding()
    const engine = exchangeYear(fam(g), anchor(g), exchangeInfo('jp'), g.year).stocks[t.slot]
    if (h && engine.id === t.secId) expect(h.details.price as number).toBeCloseTo(engine.price * shockFactor(g, t.secId, g.year), 6)
    expect(shockFactor(g, t.secId, g.year)).toBeCloseTo(shock.mult, 9)
  })

  it('index options opened before a ban settle on the dragged-down index', () => {
    const g = official('us', 'leader')
    const inf = exchangeInfo('us')
    const pos = { id: 'o1', mode: 'real' as const, side: 'buy' as const, dir: 'put' as const, strike: 'atm' as const, k: 0, units: 10_000, premium: 1_000, year: g.year, exKey: inf.key, index: inf.ex.index, countryId: 'us', parentId: '', fx: 1 }
    const plain = indexMove(fam(g), inf, g.year + 1).ret
    expect(settleMove(g, pos)).toBeCloseTo(plain, 9)
    announce(g, stockTargets(g)[0].secId, 'nationalize')
    expect(settleMove(g, pos)).toBeLessThan(plain - 0.01)
  })

  it('a coin ban by a big economy crashes the coin everywhere it trades', () => {
    const g = official('us', 'leader')
    const coin = coinTargets(g).find((c) => c.name !== '' && c.sector === 'Cryptocurrency')!
    const before = investmentListing(g).find((q) => q.secId === coin.secId)!.price
    announce(g, coin.secId, 'ban')
    const after = investmentListing(g).find((q) => q.secId === coin.secId)!.price
    expect(after).toBeLessThan(before * 0.8)
    // A small economy's ban barely registers.
    const small = official('mt', 'leader')
    const c2 = coinTargets(small).find((c) => c.secId === coin.secId)!
    announce(small, c2.secId, 'ban')
    expect(1 - marketShocks(small)[0].mult).toBeLessThan(1 - marketShocks(g)[0].mult)
  })
})

describe('insider trading', () => {
  it('a president who buys puts, then bans the company, profits when nobody catches on', () => {
    let wins = 0
    let quiet = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = official('us', 'leader', seed)
      const t = stockTargets(g)[seed % stockTargets(g).length]
      const bet = placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 100_000 })!
      expect(bet).not.toBeNull()
      announce(g, t.secId, 'ban')
      expect(abuse(g).cases).toHaveLength(1)
      expect(readState(g).bets[0].caseId).toBe(abuse(g).cases[0].id)
      g.queue = []
      nextYear(g)
      const money0 = g.character.money
      yearlySpecial(g)
      const exposed = g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')
      const salary = g.character.money - money0
      yearlyMoney(g)
      roundTrips(g)
      if (exposed) continue
      quiet++
      const won = g.character.money - money0 - salary
      if (won > bet.premium) wins++
    }
    expect(quiet).toBeGreaterThan(0)
    expect(wins).toBeGreaterThanOrEqual(Math.ceil(quiet * 0.7))
  })

  it('puts are fairly priced without inside knowledge (a losing bet on average)', () => {
    const g = official('de', 'leader')
    const inf = exchangeInfo('de')
    for (const t of stockTargets(g).slice(0, 4)) {
      const m = /s(\d+)g(\d+)$/.exec(t.secId)!
      const def = companyDef(inf, Number(m[1]), Number(m[2]))
      for (const dir of ['call', 'put'] as const) {
        for (const strike of ['atm', 'otm'] as const) {
          const fair = stockFairValue(inf, def, dir, stockStrike(inf, def, strike))
          expect(stockOptionPrice(inf, def, dir, strike, 100)).toBeGreaterThan(fair)
        }
      }
    }
  })

  it('a crony bets for you: cash in, cash out minus their cut, harder to trace', () => {
    const g = official('gb', 'leader', 4)
    const t = stockTargets(g)[0]
    const row = findNode(g, specialJobNodes(g), `pol.abuse.crony.${t.secId}`) as MenuAction
    expect(row).toBeDefined()
    row.run(g)
    answer(g, 'special.pol.abuse.cronyDir', 'up')
    input(g, 'special.pol.abuse.cronySize', '200000')
    const st = readState(g)
    expect(st.bets).toHaveLength(1)
    expect(st.bets[0].via).toBe('crony')
    expect(st.bets[0].kind).toBe('call')
    expect(g.character.money).toBe(5_000_000 - 200_000)
    // Only one tip a year.
    expect((findNode(g, specialJobNodes(g), 'pol.abuse.crony') as MenuGroup).disabledReason?.(g)).toMatch(/already/)
    announce(g, t.secId, 'contract')
    const cs = abuse(g).cases[0]
    expect(cs.via).toBe('crony')
    expect(cs.evidence).toBeLessThan(0.5)
    // Settlement pays cash, off the books (not taxable income).
    g.queue = []
    nextYear(g)
    const bet = readState(g).bets[0]
    const price = settlePrice(g, bet)
    const pay = betPayoff(bet, price)
    const m0 = g.character.money
    yearlyMoney(g)
    const back = g.character.money - m0
    if (pay > bet.premium && back > 0) {
      expect(back).toBeLessThan(pay)
      expect(back).toBeGreaterThan(bet.premium)
    }
    expect(g.flags.taxableIncome ?? 0).toBe(0)
    roundTrips(g)
  })

  it('buying shares before awarding a contract is insider trading too; dumping your own shares is not', () => {
    const g = official('in', 'leader')
    const [a, b] = stockTargets(g)
    expect(buySecurity(g, a.secId, 300_000)).toBe(true)
    expect(buySecurity(g, b.secId, 300_000)).toBe(true)
    announce(g, a.secId, 'contract')
    expect(abuse(g).cases.map((c) => c.via)).toEqual(['shares'])
    nextYear(g)
    announce(g, b.secId, 'ban')
    expect(abuse(g).cases).toHaveLength(1)
  })
})

describe('getting caught', () => {
  /** A leader with an own-account insider trade, then age up until the press finds it. */
  function exposedLeader(cid: string, start = 1, approval = 60): GameState {
    for (let seed = start; seed <= start + 80; seed++) {
      const g = official(cid, 'leader', seed, 5_000_000, approval)
      const t = stockTargets(g)[0]
      placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 500_000 })
      announce(g, t.secId, 'ban')
      abuse(g).heat = 100
      g.queue = []
      nextYear(g)
      ;(g.character.job!.data as Record<string, Json>).approval = approval
      yearlySpecial(g)
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')) return g
    }
    throw new Error(`never exposed in ${cid} from seed ${start}`)
  }

  it('a prime minister without immunity is removed and arrested when the regulator investigates', () => {
    let arrested = 0
    for (let i = 0; i < 6; i++) {
      const g = exposedLeader('gb', 1 + i * 100)
      const approval0 = g.character.job!.data.approval as number
      g.queue = g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')
      answer(g, 'special.pol.abuse.exposed', 'deny')
      expect(notices(g).some((n) => n.title === 'Insider Trading Scandal')).toBe(true)
      expect(g.character.hidden.notoriety).toBeGreaterThan(0)
      if (hasArrest(g)) {
        arrested++
        expect(g.character.job).toBeNull()
        expect(readState(g).bets.filter((b) => b.caseId)).toHaveLength(0) // frozen by investigators
        expect(g.character.careerHistory.at(-1)?.reason).toBe('fired')
      } else if (g.character.job) {
        expect(g.character.job.data.approval as number).toBeLessThan(approval0)
      }
      roundTrips(g)
    }
    expect(arrested).toBeGreaterThan(0)
  })

  it('a sitting US president is immune, faces impeachment, and is prosecuted after leaving office', () => {
    let pending: GameState | null = null
    for (let i = 0; i < 8 && !pending; i++) {
      const g = exposedLeader('us', 1 + i * 100, 30)
      g.queue = g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')
      answer(g, 'special.pol.abuse.exposed', 'deny')
      if (abuse(g).cases[0].status === 'pending') pending = g
    }
    expect(pending).not.toBeNull()
    const g = pending!
    expect(hasArrest(g)).toBe(false)
    expect(g.character.job?.title).toBe('President')
    expect(notices(g).some((n) => /can't charge a sitting President/.test(n.text))).toBe(true)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.pol.impeach' && m.title === 'Impeachment')).toBe(true)
    // While in office nothing happens; once out, prosecutors come.
    g.queue = []
    nextYear(g)
    yearlySpecial(g)
    expect(hasArrest(g)).toBe(false)
    g.queue = []
    const resign = findNode(g, specialJobNodes(g), 'pol.resign') as MenuAction
    resign.run(g)
    g.queue = []
    let arrested = false
    for (let y = 0; y < 10 && !arrested; y++) {
      nextYear(g)
      yearlySpecial(g)
      arrested = hasArrest(g)
      g.queue = g.queue.filter((m) => m.kind === 'choice' && (m.scriptId === 'crime.arrest' || m.scriptId === 'crime.trial.lawyer'))
    }
    expect(arrested || abuse(g).cases[0].status === 'closed').toBe(true)
    roundTrips(g)
  })

  it('in a captured system the prime minister is shielded but faces a no-confidence vote', () => {
    let saw = false
    for (let i = 0; i < 10 && !saw; i++) {
      const g = exposedLeader('bd', 1 + i * 100, 25)
      g.queue = g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')
      answer(g, 'special.pol.abuse.exposed', 'deny')
      if (abuse(g).cases[0].status === 'pending') {
        expect(g.queue.some((m) => m.kind === 'choice' && m.title === 'No-Confidence Vote')).toBe(true)
        saw = true
      }
    }
    expect(saw).toBe(true)
  })

  it('leaning on the regulator works more often where corruption is rampant', () => {
    let cleanOk = 0
    let dirtyOk = 0
    for (let i = 0; i < 12; i++) {
      for (const [cid, inc] of [['dk', () => cleanOk++], ['ng', () => dirtyOk++]] as const) {
        const g = exposedLeader(cid, 1 + i * 100)
        g.queue = g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')
        answer(g, 'special.pol.abuse.exposed', 'lean')
        if (abuse(g).cases[0].status === 'closed' && !hasArrest(g) && notices(g).some((n) => /no evidence of wrongdoing/.test(n.text))) inc()
      }
    }
    expect(dirtyOk).toBeGreaterThan(cleanOk)
  })
})

describe('limits', () => {
  it('one announcement a year, markets learn to shrug, heat rises and cools', () => {
    const g = official('us', 'leader', 7, 5_000_000, 60)
    const targets = stockTargets(g)
    announce(g, targets[0].secId, 'ban')
    const row = findNode(g, specialJobNodes(g), `pol.abuse.announce.${targets[1].secId}`) as MenuAction | undefined
    const group = findNode(g, specialJobNodes(g), 'pol.abuse.announce') as MenuGroup
    expect(group.disabledReason?.(g)).toMatch(/already/)
    if (row) {
      row.run(g)
      runScript(g, 'special.pol.abuse.announce', 'ban', { secId: targets[1].secId }, undefined as unknown as ModalItem)
    }
    expect(marketShocks(g)).toHaveLength(1)
    const sizes: number[] = []
    let lastHeat = abuse(g).heat
    expect(lastHeat).toBeGreaterThan(0)
    for (let y = 0; y < 5; y++) {
      nextYear(g)
      ;(g.character.job!.data as Record<string, Json>).approval = 60
      ;(g.character.job!.data as Record<string, Json>).termLeft = 4
      g.queue = []
      yearlySpecial(g)
      expect(abuse(g).heat).toBeLessThanOrEqual(lastHeat)
      g.queue = []
      if (!g.character.job) break
      announce(g, targets[(y + 2) % targets.length].secId, 'probe')
      sizes.push(1 - marketShocks(g).at(-1)!.mult)
      lastHeat = abuse(g).heat
    }
    expect(sizes.length).toBeGreaterThanOrEqual(3)
    expect(sizes.at(-1)!).toBeLessThan(sizes[0])
    roundTrips(g)
  })

  it('old saves without abuse data or bets keep working; prison pauses cases; the dead are left alone', () => {
    const g = official('fr', 'leader')
    g.flags['special.politics'] = { held: [], wins: 1, losses: 0, party: 'centrist', billsPassed: 0, vetoes: 0, impeached: 0, formerLeader: false, formerLeaderTitle: '', owner: `${g.character.id}:${g.character.firstName}:${g.character.lastName}:${g.year - g.character.age}` }
    g.flags.computerMoney = { skill: 10, broker: '', pnl: 0, paperPnl: 0, paperCash: 10_000, lossCarry: 0, trades: 0, positions: [], coins: [], probes: [], apePnl: 0, apes: 0, heat: 0, scams: 0, scamTake: 0, scamKinds: {}, bans: 0, scamRecords: [] }
    const menu = findNode(g, specialJobNodes(g), 'pol.abuse') as MenuGroup
    expect(menu.children(g).length).toBeGreaterThan(2)
    nextYear(g)
    yearlySpecial(g)
    yearlyMoney(g)
    roundTrips(g)
    // Prison pauses the yearly rolls.
    const t = stockTargets(g)[0]
    placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 100_000 })
    announce(g, t.secId, 'ban')
    abuse(g).heat = 100
    g.character.prison = { name: 'Central', security: 'minimum', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    g.queue = []
    nextYear(g)
    yearlySpecial(g)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')).toBe(false)
    g.character.alive = false
    g.character.prison = null
    yearlySpecial(g)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'special.pol.abuse.exposed')).toBe(false)
  })
})

describe('single-stock options and coin bets from the computer', () => {
  function trader(cid = 'us', money = 500_000): GameState {
    const g = makeTestGame(3, { age: 35, countryId: cid, birthCountryId: cid, money })
    g.assets.push({ id: 'pc1', kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: 30, upkeep: 0, details: { category: 'electronics' } })
    moneyState(g).broker = 'Summit Securities'
    return g
  }

  it('buys puts on one company through the menus, a few bets a year', () => {
    const g = trader()
    const t = stockTargets(g)[0]
    for (let i = 0; i < BETS_PER_YEAR; i++) {
      const row = findNode(g, moneyNodes(g), `computer.stockbets.${t.secId}`) as MenuAction
      expect(row.disabledReason?.(g) ?? null).toBeNull()
      row.run(g)
      answer(g, 'computer.money.stock.dir', 'put')
      answer(g, 'computer.money.stock.strike', i % 2 ? 'otm' : 'atm')
      input(g, 'computer.money.stock.size', '10000')
    }
    const st = readState(g)
    expect(st.bets).toHaveLength(BETS_PER_YEAR)
    expect(st.bets.every((b) => b.kind === 'put' && b.via === 'own' && b.units > b.premium)).toBe(true)
    expect(g.character.money).toBe(500_000 - BETS_PER_YEAR * 10_100)
    const row = findNode(g, moneyNodes(g), `computer.stockbets.${t.secId}`) as MenuAction
    expect(row.disabledReason?.(g)).toMatch(/this year/)
    nextYear(g)
    yearlyMoney(g)
    expect(readState(g).bets).toHaveLength(0)
    expect(readState(g).betLog).toHaveLength(BETS_PER_YEAR)
    roundTrips(g)
  })

  it('a coin short that gets squeezed becomes margin debt, never NaN or negative cash', () => {
    const g = trader('us', 20_000)
    const coin = coinTargets(g).find((c) => c.sector === 'Cryptocurrency')!
    const bet = placeBet(g, { via: 'own', secId: coin.secId, kind: 'short', stake: 10_000 })!
    expect(bet.units).toBe(20_000)
    // Pretend it was opened at a tenth of the price: the coin "rose" 900%, capped at a 4x squeeze.
    moneyState(g).bets[0].openPrice = coin.price / 10
    nextYear(g)
    const pay = betPayoff(readState(g).bets[0], settlePrice(g, readState(g).bets[0]))
    expect(pay).toBeLessThan(0)
    expect(pay).toBeGreaterThanOrEqual(10_000 - 20_000 * 3 - 20_000 * 0.06 - 1)
    yearlyMoney(g)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    expect(g.character.loans.length).toBeGreaterThan(0)
    roundTrips(g)
  })

  it('crypto-banned countries get no coin bets', () => {
    const g = trader('cn')
    expect(findNode(g, moneyNodes(g), `computer.stockbets.${coinTargets(g)[0].secId}`)).toBeUndefined()
    expect(placeBet(g, { via: 'own', secId: coinTargets(g)[0].secId, kind: 'short', stake: 1_000 })).toBeNull()
  })
})

describe('review fixes', () => {
  function trader(cid = 'us', seed = 3, money = 1e9): GameState {
    const g = makeTestGame(seed, { age: 35, countryId: cid, birthCountryId: cid, money })
    g.lifeId = `review-${cid}-${seed}`
    moneyState(g).broker = 'Summit Securities'
    return g
  }

  function settleNextYear(g: GameState, bet: { year: number }) {
    const gg = structuredClone(g)
    gg.year = bet.year + 1
    gg.character.age += gg.year - g.year
    return gg
  }

  it('there is no scheduled rebound to buy into after a ban', () => {
    // A bet placed the year after a ban pays exactly what it would have paid with no ban at all:
    // the shock is permanent, so it is in both the opening and the settlement price.
    let compared = 0
    for (let seed = 1; seed <= 30; seed++) {
      const banned = official('us', 'leader', seed, 1e9)
      banned.lifeId = `rebound-${seed}`
      moneyState(banned).broker = 'Summit Securities'
      const calm = structuredClone(banned)
      const t = stockTargets(banned)[seed % stockTargets(banned).length]
      announce(banned, t.secId, 'ban')
      expect(abuse(banned).cases).toHaveLength(0)
      for (const g of [banned, calm]) nextYear(g)
      expect(shockFactor(banned, t.secId, banned.year + 1)).toBeCloseTo(shockFactor(banned, t.secId, banned.year), 9)
      for (const kind of ['call', 'put'] as const) {
        const a = placeBet(banned, { via: 'own', secId: t.secId, kind, strike: 'atm', stake: 10_000 })
        const b = placeBet(calm, { via: 'own', secId: t.secId, kind, strike: 'atm', stake: 10_000 })
        if (!a || !b) continue
        compared++
        expect(a.openPrice).toBeLessThan(b.openPrice)
        const pa = betPayoff(a, settlePrice(settleNextYear(banned, a), a))
        const pb = betPayoff(b, settlePrice(settleNextYear(calm, b), b))
        expect(Math.abs(pa - pb)).toBeLessThanOrEqual(Math.max(2, pb * 1e-6))
      }
    }
    expect(compared).toBeGreaterThan(40)
  })

  it('a coin long is never better than simply owning the coin', () => {
    let longs = 0
    for (const cid of ['us', 'jp', 'br', 'ng']) {
      for (let seed = 1; seed <= 40; seed++) {
        const g = trader(cid, seed)
        g.year = 2000 + seed
        for (const c of coinTargets(g)) {
          moneyState(g).bets = []
          const bet = placeBet(g, { via: 'own', secId: c.secId, kind: 'long', stake: 1_000 })
          if (!bet) continue
          longs++
          expect(bet.units).toBe(1_000)
          const price = settlePrice(settleNextYear(g, bet), bet)
          expect(betPayoff(bet, price)).toBeLessThanOrEqual(Math.max(0, Math.round(1_000 * (price / bet.openPrice))) + 1)
        }
      }
    }
    expect(longs).toBeGreaterThan(100)
  })

  it('shorting a stablecoin costs its staking yield, so it is a losing bet on average', () => {
    let stake = 0
    let pay = 0
    for (let seed = 1; seed <= 300; seed++) {
      const g = trader('us', seed)
      g.year = 1990 + (seed % 50)
      const stable = coinTargets(g).find((c) => c.sector === 'Stablecoin')
      if (!stable) continue
      const bet = placeBet(g, { via: 'own', secId: stable.secId, kind: 'short', stake: 1_000 })
      if (!bet) continue
      stake += bet.premium
      pay += betPayoff(bet, settlePrice(settleNextYear(g, bet), bet))
    }
    expect(stake).toBeGreaterThan(100_000)
    expect(pay / stake).toBeLessThan(0.95)
  })

  it('index puts bought before banning a listed company are insider trading too', () => {
    const g = official('us', 'leader', 11, 5_000_000)
    const inf = exchangeInfo('us')
    moneyState(g).positions.push({ id: 'opt1', mode: 'real', side: 'buy', dir: 'put', strike: 'otm', k: 0.05, units: 4_000_000, premium: 100_000, year: g.year, exKey: inf.key, index: inf.ex.index, countryId: 'us', parentId: '', fx: 1 })
    const t = stockTargets(g)[0]
    announce(g, t.secId, 'ban')
    const cs = abuse(g).cases
    expect(cs).toHaveLength(1)
    expect(cs[0].via).toBe('own')
    expect((cs[0] as unknown as { gain: number }).gain).toBeGreaterThan(0)
    expect(notices(g).at(-1)!.text).toMatch(/puts in your brokerage account/)
    roundTrips(g)
    // Paper trades are not real money and don't count.
    const p = official('us', 'leader', 12, 5_000_000)
    moneyState(p).positions.push({ id: 'opt2', mode: 'paper', side: 'buy', dir: 'put', strike: 'otm', k: 0.05, units: 4_000_000, premium: 100_000, year: p.year, exKey: inf.key, index: inf.ex.index, countryId: 'us', parentId: '', fx: 1 })
    announce(p, stockTargets(p)[0].secId, 'ban')
    expect(abuse(p).cases).toHaveLength(0)
  })
  it('a shocked company that gets bought out pays the takeover premium on the shocked price', () => {
    let checked = 0
    for (let seed = 1; seed <= 60 && checked < 2; seed++) {
      const base = trader('us', seed, 2_000_000)
      const inf = exchangeInfo('us')
      for (let y = base.year; y < base.year + 40 && checked < 2; y++) {
        const ex = exchangeYear(fam(base), anchor(base), inf, y)
        const nxt = exchangeYear(fam(base), anchor(base), inf, y + 1)
        // Real companies only end in their real year and can't be shocked: use a made-up company's buyout.
        const slot = nxt.stocks.findIndex((s, i) => s.ended?.kind === 'acquired' && s.ended.id === ex.stocks[i]?.id && !isRealSecId(s.ended.id))
        if (slot < 0) continue
        const g = structuredClone(base)
        g.character.age += y - g.year
        g.year = y
        const t = listedTargets(g)[slot]
        addMarketShock(g, { asset: 'stock', secId: t.secId, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, cause: 'ban', year: g.year, mult: 0.5, fade: 0, countryId: 'us' })
        const shocked = listedTargets(g)[slot]
        expect(buySecurity(g, t.secId, 100_000)).toBe(true)
        const units = investmentHoldings(g).find((a) => a.details.secId === t.secId)!.details.units as number
        const bet = placeBet(g, { via: 'own', secId: t.secId, kind: 'call', strike: 'atm', stake: 10_000 })!
        g.queue = []
        nextYear(g)
        const perUnit = nxt.stocks[slot].ended!.perUnit
        expect(settlePrice(g, bet)).toBeCloseTo(perUnit * 0.5, 6)
        expect(settlePrice(g, bet) / shocked.price).toBeCloseTo(perUnit / ex.stocks[slot].price, 6)
        const cash = g.character.money
        yearlyInvestments(g)
        expect(investmentHoldings(g).some((a) => a.details.secId === t.secId)).toBe(false)
        expect(g.character.money - cash).toBeLessThan(units * perUnit * 0.5 + 2)
        expect(g.character.money - cash).toBeGreaterThan(units * perUnit * 0.5 * 0.5)
        // The shock is forgotten the year after its company stopped trading.
        nextYear(g)
        yearlyInvestments(g)
        expect(marketShocks(g).some((s) => s.secId === t.secId)).toBe(false)
        roundTrips(g)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
