// The risky side of the home computer: meme coins (launch, pump, dump, rug, regulators years
// later), options trading (seeded index settlement, paper trading, a parent's account, margin
// debt) and online scams (enforcement by country, parents confiscating the computer, heat).
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { canUseComputer, computerLocked } from '../src/game/computer'
import { moneyNodes, moneySummary, yearlyMoney } from '../src/game/computer/money'
import { anchor, brokerName, enforcement, fam, moneyState, readState, regulator, STATE_KEY } from '../src/game/computer/money-common'
import { apeMultiple, cleanCoinName, tickerFor } from '../src/game/computer/money-crypto'
import { fairValue, optionPrice, positionPayoff, strikeOffset, yoloMultiple } from '../src/game/computer/money-options'
import { scamDefs } from '../src/game/computer/money-scams'
import { counter, netWorth } from '../src/game/core'
import { GAMBLING_ADDICTION } from '../src/game/gambling'
import { exchangeInfo, exchangeYear, indexMove } from '../src/game/invest/engine'
import { createPerson } from '../src/game/people'
import { normal } from '../src/game/computer/money-common'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MenuAction, MenuNode, ModalItem, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function game(seed: number, age: number, money: number, countryId = 'us'): GameState {
  const g = makeTestGame(seed, { age, money, countryId, birthCountryId: countryId })
  g.assets.push({ id: 'pc1', kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: age, upkeep: 0, details: { category: 'electronics' } })
  return g
}

function withParent(g: GameState, money = 200_000) {
  return createPerson(g, { relation: 'parent', age: g.character.age + 30, money, relationship: 70 })
}

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function action(g: GameState, id: string): MenuAction {
  const n = findNode(g, moneyNodes(g), id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

function act(g: GameState, id: string): void {
  const a = action(g, id)
  expect(a.disabledReason?.(g) ?? null, `${id} disabled`).toBeNull()
  a.run(g)
}

function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const i = g.queue.findIndex((m) => m.kind === kind && (!scriptId || ('scriptId' in m && m.scriptId === scriptId)))
  if (i < 0) throw new Error(`no ${kind} ${scriptId ?? ''} in queue: ${g.queue.map((m) => `${m.kind}:${'scriptId' in m ? m.scriptId : ''}:${'title' in m ? m.title : ''}`).join(', ')}`)
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

function hasArrest(g: GameState): boolean {
  return g.queue.some((m) => m.kind === 'choice' && (m.scriptId === 'crime.arrest' || m.scriptId === 'crime.trial.lawyer'))
}

/** The engine's age-up for this module alone (no other hooks). */
function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  yearlyMoney(g)
}

function roundTrips(g: GameState): void {
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
  expect(json).not.toContain('NaN')
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(Number.isFinite(netWorth(g))).toBe(true)
}

/** Find a (family, year) whose index move matches a test. */
function findYear(test: (ret: number) => boolean, countryId = 'us'): { lifeId: string; year: number; ret: number } {
  const info = exchangeInfo(countryId)
  for (let f = 0; f < 200; f++) {
    for (let y = 2027; y < 2060; y++) {
      const ret = indexMove(`fam${f}`, info, y).ret
      if (test(ret)) return { lifeId: `fam${f}`, year: y, ret }
    }
  }
  throw new Error('no matching year')
}

/** Launch a coin through the menu: name it, run the promotions, then let buyers in. */
function launchCoin(g: GameState, name: string, promos: string[] = ['post']): void {
  act(g, 'computer.crypto.launch')
  input(g, 'computer.money.coin.name', name)
  for (const p of [...promos, 'go']) {
    if (!g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'computer.money.coin.hype')) break
    answer(g, 'computer.money.coin.hype', p)
  }
}

// ---------------------------------------------------------------------------
// Meme coins

describe('meme coins', () => {
  it('cleans names and makes tickers', () => {
    expect(cleanCoinName('  $Llama<script> Cash!!  ')).toBe('Llamascript Cash')
    expect(tickerFor('Llama Cash')).toBe('LLAMA')
    expect(tickerFor('Go')).toBe('GO')
    expect(tickerFor('Capybara Coin')).toBe('CAPY')
    expect(tickerFor('MoonDoge')).toBe('MOON')
    expect(tickerFor('Go Moon')).toBe('GOMO')
    expect(tickerFor('')).toBe('COIN')
  })

  it('launch → hype → pump → dump pays a finite profit and costs karma', () => {
    const g = game(3, 16, 5_000)
    const karma = g.character.hidden.karma
    launchCoin(g, 'Llama Cash')
    expect(g.character.money).toBeLessThan(5_000)
    const pump = take(g, 'choice', 'computer.money.coin.pump')
    expect(pump.choices.map((c) => c.id)).toEqual(['hold', 'trim', 'dump', 'rug'])
    expect(pump.text).toContain('$LLAMA')
    runScript(g, 'computer.money.coin.pump', 'dump', pump.data, pump)
    const st = readState(g)
    expect(st.coins).toHaveLength(1)
    expect(st.coins[0].outcome).toBe('dumped')
    expect(st.coins[0].take).toBeGreaterThan(0)
    expect(g.character.hidden.karma).toBeLessThan(karma)
    expect(notices(g).some((n) => n.title === 'Dumped')).toBe(true)
    expect(counter(g, 'coinsLaunched')).toBe(1)
    roundTrips(g)
  })

  it('holding rides the pump until you sell or get dumped on, always finite', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = game(seed, 30, 50_000)
      launchCoin(g, 'Goose Moon', seed % 2 ? ['shill'] : ['post', 'shill', 'celeb'])
      for (let guard = 0; guard < 10; guard++) {
        const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'computer.money.coin.pump')
        if (!m) break
        g.queue.splice(g.queue.indexOf(m), 1)
        const ids = m.choices.map((c) => c.id)
        runScript(g, m.scriptId!, ids.includes('hold') ? 'hold' : 'dump', m.data, m)
      }
      const coin = readState(g).coins[0]
      expect(['dumped', 'dumpedOn', 'rugged']).toContain(coin.outcome)
      expect(Number.isFinite(coin.take)).toBe(true)
      roundTrips(g)
    }
  })

  it('each promotion can be used once, then the pump starts; broke players are told so', () => {
    const g = game(4, 20, 2_000)
    act(g, 'computer.crypto.launch')
    input(g, 'computer.money.coin.name', 'Waffle Swap')
    const first = take(g, 'choice', 'computer.money.coin.hype')
    expect(first.choices.map((c) => c.id)).toEqual(['post', 'shill', 'celeb', 'go'])
    runScript(g, 'computer.money.coin.hype', 'celeb', first.data, first)
    const second = take(g, 'choice', 'computer.money.coin.hype')
    expect(second.text).toMatch(/can't afford a celebrity/)
    expect(second.choices.map((c) => c.id)).toEqual(['post', 'shill', 'go'])
    runScript(g, 'computer.money.coin.hype', 'shill', second.data, second)
    const third = take(g, 'choice', 'computer.money.coin.hype')
    expect(third.choices.map((c) => c.id)).toEqual(['post', 'go'])
    runScript(g, 'computer.money.coin.hype', 'post', third.data, third)
    // Every promotion used: straight to the pump.
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'computer.money.coin.pump')).toBe(true)
    expect(g.character.money).toBe(2_000 - 250 - 1_500)
  })

  it('a rug pull is a crime on the record that thieves get counted for', () => {
    const g = game(5, 25, 2_000)
    launchCoin(g, 'Pigeon Token')
    answer(g, 'computer.money.coin.pump', 'rug')
    const c = g.character
    expect(c.criminalRecord.some((r) => r.crime === 'Securities Fraud')).toBe(true)
    expect(counter(g, 'crimes')).toBe(1)
    expect(counter(g, 'thefts')).toBe(1)
    expect(counter(g, 'rugPulls')).toBe(1)
    expect(c.hidden.karma).toBeLessThanOrEqual(35)
    expect(readState(g).coins[0].outcome).toBe('rugged')
    roundTrips(g)
  })

  it('one launch per year and nothing in banned countries', () => {
    const g = game(2, 20, 5_000)
    launchCoin(g, 'Sloth Cash')
    answer(g, 'computer.money.coin.pump', 'dump')
    g.queue = []
    act(g, 'computer.crypto.launch')
    expect(notices(g).some((n) => n.title === 'One Is Plenty')).toBe(true)
    const cn = game(2, 20, 5_000, 'cn')
    expect(findNode(cn, moneyNodes(cn), 'computer.crypto')?.type).toBe('menu')
    expect(action(cn, 'computer.crypto.launch').disabledReason?.(cn)).toMatch(/banned/)
  })

  it('regulators can arrest you years later, harder where corruption is low', () => {
    let dk = 0
    let ve = 0
    for (let seed = 1; seed <= 80; seed++) {
      for (const cid of ['dk', 've']) {
        const g = game(seed, 30, 1_000, cid)
        const st = moneyState(g)
        g.character.criminalRecord.push({ crime: 'Securities Fraud', age: 27, caught: false, convicted: false })
        st.probes.push({ id: 'pr1', kind: 'rug', ticker: 'LLAMA', take: 80_000, dueAge: 31, startAge: 27, countryId: cid, evidence: 0.8, publicCase: true, recordIndex: 0 })
        nextYear(g)
        expect(readState(g).probes.length === 0 || readState(g).probes[0].dueAge > 31).toBe(true)
        if (hasArrest(g)) {
          if (cid === 'dk') dk++
          else ve++
          const m = g.queue.find((x) => x.kind === 'choice') as ChoiceModal
          expect(m.text).toContain(regulator(cid).replace(/^the /, ''))
        }
        roundTrips(g)
      }
    }
    expect(enforcement('dk')).toBeGreaterThan(enforcement('ve'))
    expect(dk).toBeGreaterThan(ve)
    expect(dk).toBeGreaterThan(40)
  })

  it('a probe that is not due yet waits, and prison pauses it', () => {
    const g = game(1, 30, 0, 'us')
    const st = moneyState(g)
    st.probes.push({ id: 'pr1', kind: 'rug', ticker: 'LLAMA', take: 5_000, dueAge: 33, startAge: 29, countryId: 'us', evidence: 0.8, publicCase: false, recordIndex: -1 })
    nextYear(g)
    expect(readState(g).probes).toHaveLength(1)
    expect(hasArrest(g)).toBe(false)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 9, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    nextYear(g)
    nextYear(g)
    nextYear(g)
    expect(readState(g).probes).toHaveLength(1)
    expect(readState(g).probes[0].dueAge).toBe(g.character.age + 1)
    expect(moneyNodes(g)).toEqual([])
  })

  it('a dump probe ends in a fine that becomes a payment plan when you are broke', () => {
    let fined = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(seed, 35, 1_000, 'gb')
      moneyState(g).probes.push({ id: 'p', kind: 'dump', ticker: 'TOAD', take: 40_000, dueAge: 36, startAge: 33, countryId: 'gb', evidence: 0.6, publicCase: false, recordIndex: -1 })
      nextYear(g)
      const n = notices(g).find((x) => x.title === 'Regulators')
      if (n) {
        fined++
        expect(n.text).toContain('FCA')
        expect(g.character.money).toBeGreaterThanOrEqual(0)
        expect(g.character.loans.some((l) => l.lender.includes('FCA'))).toBe(true)
      }
      roundTrips(g)
    }
    expect(fined).toBeGreaterThan(5)
  })

  it("a minor's regulator fine never pushes a parent's money below zero", () => {
    let fined = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(seed, 16, 0, 'us')
      const parent = withParent(g, 3_000)
      moneyState(g).probes.push({ id: 'p', kind: 'dump', ticker: 'TOAD', take: 40_000, dueAge: 17, startAge: 15, countryId: 'us', evidence: 0.6, publicCase: false, recordIndex: -1 })
      nextYear(g)
      if (notices(g).some((x) => x.title === 'Regulators')) {
        fined++
        expect(parent.money).toBeGreaterThanOrEqual(0)
        expect(g.character.loans).toHaveLength(0)
        expect(canUseComputer(g)).toBe(false)
      }
      roundTrips(g)
    }
    expect(fined).toBeGreaterThan(3)
  })

  it('a probe is closed when another arrest already caught that rug pull', () => {
    const g = game(1, 30, 0, 'dk')
    g.character.criminalRecord.push({ crime: 'Securities Fraud', age: 28, caught: true, convicted: true })
    moneyState(g).probes.push({ id: 'p', kind: 'rug', ticker: 'LLAMA', take: 80_000, dueAge: 31, startAge: 28, countryId: 'dk', evidence: 0.95, publicCase: true, recordIndex: 0 })
    nextYear(g)
    expect(readState(g).probes).toHaveLength(0)
    expect(hasArrest(g)).toBe(false)
  })

  it('a teen arrested over a coin also loses the computer to their parents', () => {
    let arrested = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = game(seed, 16, 0, 'dk')
      withParent(g)
      g.character.criminalRecord.push({ crime: 'Securities Fraud', age: 15, caught: false, convicted: false })
      moneyState(g).probes.push({ id: 'p', kind: 'rug', ticker: 'LLAMA', take: 8_000, dueAge: 17, startAge: 15, countryId: 'dk', evidence: 0.9, publicCase: true, recordIndex: 0 })
      nextYear(g)
      if (hasArrest(g)) {
        arrested++
        expect(canUseComputer(g)).toBe(false)
        const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
        expect(m.text).toMatch(/found out you were rug-pulling/)
      }
      roundTrips(g)
    }
    expect(arrested).toBeGreaterThan(20)
  })

  it('parents who catch a teen rug-pulling confiscate the computer', () => {
    let caught = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = game(seed, 15, 3_000)
      withParent(g)
      launchCoin(g, 'Hamster Inu')
      answer(g, 'computer.money.coin.pump', 'rug')
      if (typeof g.flags.computerLockedUntil === 'number') {
        caught++
        expect(computerLocked(g)).toMatch(/until you're (16|17|18)/)
        expect(canUseComputer(g)).toBe(false)
        const before = g.queue.length
        action(g, 'computer.crypto.launch').run(g)
        expect(g.queue.length).toBe(before)
      }
      roundTrips(g)
    }
    expect(caught).toBeGreaterThan(5)
  })

  it('aping in has negative expected value, even in a mania the menu announces', () => {
    const g = makeTestGame(9)
    let sum = 0
    const n = 40_000
    for (let i = 0; i < n; i++) sum += apeMultiple(g, false, false).mult
    expect(sum / n).toBeLessThan(0.95)
    let winter = 0
    for (let i = 0; i < n; i++) winter += apeMultiple(g, false, true).mult
    expect(winter / n).toBeLessThan(sum / n)
    // Regression: a mania (shown in the menu header) used to pay ~1.29x per $1 aped.
    let mania = 0
    for (let i = 0; i < n; i++) mania += apeMultiple(g, true, false).mult
    expect(mania / n).toBeGreaterThan(sum / n)
    expect(mania / n).toBeLessThan(0.95)
  })

  it('aping in moves real money and records the P&L', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = game(seed, 14, 1_000)
      act(g, 'computer.crypto.ape')
      const m = take(g, 'choice', 'computer.money.ape')
      const amount = Number(m.choices[0].id)
      expect(amount).toBeGreaterThan(0)
      runScript(g, 'computer.money.ape', m.choices[0].id, m.data, m)
      const st = readState(g)
      expect(st.apes).toBe(1)
      // Gains are taxed on the spot.
      expect(g.character.money).toBe(1_000 + st.apePnl - counter(g, 'taxesPaid'))
      roundTrips(g)
    }
  })
})

// ---------------------------------------------------------------------------
// Options

function adultTrader(seed: number, money: number, countryId = 'us'): GameState {
  const g = game(seed, 30, money, countryId)
  moneyState(g).broker = brokerName(countryId)
  return g
}

function buyIndex(g: GameState, opts: { mode?: 'real' | 'paper'; dir: 'call' | 'put'; strike: 'atm' | 'otm' | 'lotto'; amount: number }): void {
  act(g, opts.mode === 'paper' ? 'computer.options.paper.buy' : 'computer.options.buy')
  answer(g, 'computer.money.opt.dir', opts.dir)
  answer(g, 'computer.money.opt.strike', opts.strike)
  input(g, 'computer.money.opt.size', String(opts.amount))
}

describe('options trading', () => {
  it('is priced above fair value (buyers) and below it (sellers) on every exchange', () => {
    for (const cid of ['us', 'gb', 'jp', 'in', 'br', 'za']) {
      const info = exchangeInfo(cid)
      for (const dir of ['call', 'put'] as const) {
        for (const strike of ['atm', 'otm', 'lotto'] as const) {
          const fair = fairValue(info, dir, strikeOffset(info, dir, strike))
          expect(fair).toBeGreaterThan(0)
          for (const skill of [0, 100]) {
            expect(optionPrice(info, dir, strike, skill, 'buy')).toBeGreaterThan(fair * 1.06)
            expect(optionPrice(info, dir, strike, skill, 'sell')).toBeLessThan(fair / 1.06)
          }
        }
      }
    }
  })

  it('0DTE trades lose money on average even for a master trader', () => {
    const g = makeTestGame(4)
    let sum = 0
    const n = 30_000
    for (let i = 0; i < n; i++) sum += yoloMultiple(i % 2 ? 'call' : 'put', normal(g), 100)
    expect(sum / n).toBeLessThan(0.95)
    expect(sum / n).toBeGreaterThan(0.6)
  })

  it('opening an account needs an adult', () => {
    const teen = game(1, 16, 1_000)
    expect(findNode(teen, moneyNodes(teen), 'computer.options.open')).toBeUndefined()
    const g = game(1, 22, 1_000, 'de')
    act(g, 'computer.options.open')
    expect(readState(g).broker).toBe(brokerName('de'))
    expect(findNode(g, moneyNodes(g), 'computer.options.buy')).toBeDefined()
  })

  it('calls settle at the next age-up on the seeded index move: they win when the index rises', () => {
    const up = findYear((r) => r > 0.05)
    const g = adultTrader(1, 100_000)
    g.lifeId = up.lifeId
    g.year = up.year - 1
    buyIndex(g, { dir: 'call', strike: 'atm', amount: 1_000 })
    expect(g.character.money).toBe(100_000 - 1_000 - 10)
    const pos = readState(g).positions[0]
    expect(pos.premium).toBe(1_000)
    nextYear(g)
    const info = exchangeInfo('us')
    expect(exchangeYear(fam(g), anchor(g), info, g.year).index.ret).toBeCloseTo(up.ret, 10)
    const pay = positionPayoff(pos, up.ret)
    expect(pay).toBeGreaterThan(0)
    expect(g.character.money).toBe(100_000 - 1_010 + pay)
    expect(readState(g).positions).toHaveLength(0)
    expect(readState(g).pnl).toBe(pay - 1_000)
    roundTrips(g)
  })

  it('calls expire worthless when the index falls, and the loss is capped at the premium', () => {
    const down = findYear((r) => r < -0.03)
    const g = adultTrader(1, 50_000)
    g.lifeId = down.lifeId
    g.year = down.year - 1
    buyIndex(g, { dir: 'call', strike: 'lotto', amount: 2_000 })
    nextYear(g)
    expect(g.character.money).toBe(50_000 - 2_000 - 20)
    expect(readState(g).pnl).toBe(-2_000)
    expect(readState(g).lossCarry).toBe(2_000)
  })

  it('puts win in a crash, lottery tickets capped at 100x', () => {
    const crash = findYear((r) => r < -0.25)
    const g = adultTrader(2, 100_000)
    g.lifeId = crash.lifeId
    g.year = crash.year - 1
    buyIndex(g, { dir: 'put', strike: 'lotto', amount: 1_000 })
    const pos = readState(g).positions[0]
    nextYear(g)
    const pay = positionPayoff(pos, crash.ret)
    expect(pay).toBeGreaterThan(1_000)
    expect(pay).toBeLessThanOrEqual(100_000)
    expect(g.character.money).toBe(100_000 - 1_010 + pay)
  })

  it('selling puts before a crash turns into margin debt, never negative cash or NaN', () => {
    const crash = findYear((r) => r < -0.35)
    const g = adultTrader(3, 20_000)
    g.lifeId = crash.lifeId
    g.year = crash.year - 1
    act(g, 'computer.options.sell')
    answer(g, 'computer.money.opt.dir', 'put')
    answer(g, 'computer.money.opt.strike', 'atm')
    const size = take(g, 'input', 'computer.money.opt.size')
    expect(size.max).toBe(100_000)
    runScript(g, 'computer.money.opt.size', '100000', size.data, size)
    // The broker holds the premium until expiry: only the commission leaves now.
    expect(g.character.money).toBeLessThan(20_000)
    expect(g.character.money).toBeGreaterThan(19_900)
    nextYear(g)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    const loan = g.character.loans.find((l) => l.lender.includes('margin'))
    expect(loan).toBeDefined()
    expect(loan!.balance).toBeGreaterThan(0)
    expect(counter(g, 'marginCalls')).toBe(1)
    expect(notices(g).some((n) => n.title === 'Margin Call')).toBe(true)
    roundTrips(g)
  })

  it("a sold option's premium is held until it settles, so it can't be spent or inherited first", () => {
    // Regression: the premium used to land in cash at once, so a player could sell 4x5x their
    // cash in options, die (or surrender) before the age-up, and leave the premium to an heir.
    const calm = findYear((r) => r > 0.05)
    const g = adultTrader(4, 50_000)
    g.lifeId = calm.lifeId
    g.year = calm.year - 1
    act(g, 'computer.options.sell')
    answer(g, 'computer.money.opt.dir', 'put')
    answer(g, 'computer.money.opt.strike', 'otm')
    input(g, 'computer.money.opt.size', '250000')
    const pos = readState(g).positions[0]
    expect(pos.premium).toBeGreaterThan(1_000)
    const fee = Math.max(1, Math.round(pos.premium * 0.01))
    expect(g.character.money).toBe(50_000 - fee)
    // The collateral check sees the same cash as before (no premium to pyramid on).
    g.queue = []
    act(g, 'computer.options.sell')
    answer(g, 'computer.money.opt.dir', 'put')
    answer(g, 'computer.money.opt.strike', 'otm')
    expect(take(g, 'input', 'computer.money.opt.size').max).toBe((50_000 - fee) * 5)
    g.queue = []
    nextYear(g)
    expect(g.character.money).toBe(50_000 - fee + pos.premium)
    expect(readState(g).pnl).toBe(pos.premium)
    expect(g.character.loans).toHaveLength(0)
    roundTrips(g)
  })

  it('a 15-year-old can paper trade without ever touching real money', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = game(seed, 15, 500)
      buyIndex(g, { mode: 'paper', dir: seed % 2 ? 'call' : 'put', strike: 'otm', amount: 2_000 })
      act(g, 'computer.options.paper.yolo')
      answer(g, 'computer.money.yolo.dir', 'call')
      input(g, 'computer.money.yolo.size', '1000')
      act(g, 'computer.options.paper.sell')
      answer(g, 'computer.money.opt.dir', 'put')
      answer(g, 'computer.money.opt.strike', 'otm')
      input(g, 'computer.money.opt.size', '5000')
      expect(g.character.money).toBe(500)
      expect(readState(g).skill).toBeGreaterThan(0)
      nextYear(g)
      expect(g.character.money).toBe(500)
      expect(g.character.loans).toHaveLength(0)
      expect(readState(g).positions).toHaveLength(0)
      expect(readState(g).paperCash).toBeGreaterThanOrEqual(0)
      expect(counter(g, 'optionTrades')).toBe(0)
      roundTrips(g)
    }
  })

  it("trading in a parent's account moves their money and can get the computer confiscated", () => {
    let caught = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(seed, 15, 100)
      const parent = withParent(g, 200_000)
      act(g, 'computer.options.parent')
      answer(g, 'computer.money.opt.parent', 'yolo')
      answer(g, 'computer.money.yolo.dir', seed % 2 ? 'call' : 'put')
      const m = take(g, 'input', 'computer.money.yolo.size')
      expect(m.max).toBeLessThanOrEqual(1_500)
      runScript(g, 'computer.money.yolo.size', '5000', m.data, m)
      expect(parent.money).toBeGreaterThan(200_000 - 1_600)
      expect(g.character.money).toBeGreaterThanOrEqual(0)
      if (typeof g.flags.computerLockedUntil === 'number') {
        caught++
        expect(canUseComputer(g)).toBe(false)
        expect(parent.relationship).toBeLessThan(70)
        // A caught teen keeps none of the winnings (and repays losses from their own cash).
        expect(g.character.money).toBeLessThanOrEqual(100)
      }
      roundTrips(g)
    }
    expect(caught).toBeGreaterThan(5)
  })

  it("a teen can't milk a rich parent's account: kid-sized stakes, no free money", () => {
    // Regression: the stake was 15% of the parent's wealth and the teen kept every win while the
    // parent ate every loss, so one YOLO in a $5M account averaged ~$213K for a 14-year-old.
    let total = 0
    const n = 200
    for (let seed = 1; seed <= n; seed++) {
      const g = game(seed, 14, 0)
      withParent(g, 5_000_000)
      act(g, 'computer.options.parent')
      answer(g, 'computer.money.opt.parent', 'yolo')
      answer(g, 'computer.money.yolo.dir', 'call')
      const m = take(g, 'input', 'computer.money.yolo.size')
      expect(m.max).toBeLessThanOrEqual(1_500)
      runScript(g, 'computer.money.yolo.size', String(m.max), m.data, m)
      expect(g.character.money).toBeLessThanOrEqual(1_500 * 10)
      total += g.character.money
      roundTrips(g)
    }
    expect(total / n).toBeLessThan(1_000)
  })

  it("index options in a dead parent's account pay the estate, not the teen", () => {
    const up = findYear((r) => r > 0.15)
    const g = game(3, 15, 0)
    g.lifeId = up.lifeId
    g.year = up.year - 1
    const parent = withParent(g, 100_000)
    act(g, 'computer.options.parent')
    answer(g, 'computer.money.opt.parent', 'index')
    answer(g, 'computer.money.opt.dir', 'call')
    answer(g, 'computer.money.opt.strike', 'atm')
    input(g, 'computer.money.opt.size', '1500')
    expect(readState(g).positions).toHaveLength(1)
    parent.alive = false
    g.queue = []
    nextYear(g)
    expect(readState(g).positions).toHaveLength(0)
    expect(g.character.money).toBe(0)
    roundTrips(g)
  })

  it('every strike can actually pay, and is a losing bet for buyers and sellers alike', () => {
    // Regression: lottery puts on wild exchanges (Venezuela's IBC, volatility 0.6) needed a 90%
    // crash, which the engine never produces, so selling them was risk-free money.
    for (const cid of ['ve', 'ng', 'ar', 'tr', 'us', 'id', 'de', 'pe']) {
      const info = exchangeInfo(cid)
      for (const dir of ['call', 'put'] as const) {
        for (const strike of ['atm', 'otm', 'lotto'] as const) {
          const k = strikeOffset(info, dir, strike)
          expect(k).toBeGreaterThanOrEqual(0)
          expect(k).toBeLessThanOrEqual(0.85)
          const buy = optionPrice(info, dir, strike, 100, 'buy')
          const sell = optionPrice(info, dir, strike, 100, 'sell')
          let itm = 0
          let paid = 0
          let bought = 0
          const n = 6_000
          for (let i = 0; i < n; i++) {
            const r = indexMove(`check${i}`, info, 2150 + (i % 43)).ret
            const raw = Math.max(0, (dir === 'call' ? r : -r) - k)
            if (raw > 0) itm++
            paid += raw
            bought += Math.min(raw / buy, 100)
          }
          expect(itm / n, `${cid} ${dir} ${strike} reachable`).toBeGreaterThan(0.025)
          expect(bought / n, `${cid} ${dir} ${strike} buyer EV`).toBeLessThan(1)
          expect(sell, `${cid} ${dir} ${strike} seller EV`).toBeLessThan(paid / n)
        }
      }
    }
  }, 30_000)

  it('compulsive trading only hits people who actually trade', () => {
    const g = adultTrader(2, 100_000)
    g.character.conditions.push({ id: 'c1', name: GAMBLING_ADDICTION, kind: 'addiction', severity: 40, yearsHad: 0, curable: true, diagnosed: true, age: 30 })
    for (let i = 0; i < 8; i++) nextYear(g)
    expect(g.character.money).toBe(100_000)
    moneyState(g).trades = 2
    for (let i = 0; i < 8; i++) nextYear(g)
    expect(g.character.money).toBeLessThan(100_000)
  })

  it('caps real trades per year', () => {
    const g = adultTrader(1, 1_000_000)
    for (let i = 0; i < 4; i++) {
      buyIndex(g, { dir: 'call', strike: 'atm', amount: 100 })
      g.queue = []
    }
    buyIndex(g, { dir: 'call', strike: 'atm', amount: 100 })
    expect(notices(g).some((n) => n.title === 'Market Closed')).toBe(true)
    expect(readState(g).positions).toHaveLength(4)
  })

  it('settles through the real age-up with taxes and stays valid', () => {
    const g = adultTrader(7, 300_000)
    buyIndex(g, { dir: 'call', strike: 'atm', amount: 50_000 })
    g.queue = []
    ageUp(g)
    expect(readState(g).positions).toHaveLength(0)
    roundTrips(g)
  })
})

// ---------------------------------------------------------------------------
// Scams

describe('online scams', () => {
  it('every scam is age-gated and non-empty', () => {
    const defs = scamDefs()
    expect(defs.map((d) => d.id)).toEqual(['store', 'giveaway', 'suspended', 'techsupport', 'romance', 'charity'])
    const kid = game(1, 12, 0)
    expect(action(kid, 'computer.scam.store').disabledReason?.(kid)).toBeNull()
    expect(action(kid, 'computer.scam.romance').disabledReason?.(kid)).toMatch(/16/)
    const young = game(1, 11, 0)
    expect(moneyNodes(young)).toEqual([])
  })

  it('a scam is a crime with a victim, counted for ribbons, and limited per year', () => {
    let wins = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = game(seed, 30, 0, 'us')
      act(g, 'computer.scam.store')
      expect(counter(g, 'crimes')).toBe(1)
      expect(g.character.criminalRecord[0].crime).toBe('Online Fraud')
      const n = notices(g).find((x) => x.title === 'Scammed')
      if (n) {
        wins++
        expect(counter(g, 'thefts')).toBe(1)
        expect(g.character.money).toBeGreaterThan(0)
        expect(g.character.hidden.karma).toBeLessThan(50)
      }
      roundTrips(g)
    }
    expect(wins).toBeGreaterThan(5)
    const g = game(1, 30, 0)
    for (let i = 0; i < 3; i++) {
      action(g, 'computer.scam.charity').run(g)
      g.queue = []
    }
    action(g, 'computer.scam.charity').run(g)
    expect(notices(g).some((n) => n.title === 'Lie Low')).toBe(true)
    expect(counter(g, 'crimes')).toBe(3)
  })

  it('the cybercrime unit catches more scammers where corruption is low', () => {
    const arrests: Record<string, number> = { dk: 0, ve: 0 }
    const takes: Record<string, number> = { dk: 0, ve: 0 }
    for (let seed = 1; seed <= 150; seed++) {
      for (const cid of ['dk', 've']) {
        const g = game(seed, 30, 0, cid)
        moneyState(g).heat = 70
        action(g, 'computer.scam.techsupport').run(g)
        if (hasArrest(g)) arrests[cid]++
        takes[cid] += Math.max(0, g.character.money)
        // ...and the case can catch up at the next age-up.
        g.queue = []
        nextYear(g)
        if (hasArrest(g)) arrests[cid]++
        roundTrips(g)
      }
    }
    expect(arrests.dk).toBeGreaterThan(arrests.ve)
    // Denmark is richer: scams take more there too.
    expect(takes.dk).toBeGreaterThan(takes.ve)
  })

  it('heat cools over the years', () => {
    const g = game(1, 30, 0, 've')
    action(g, 'computer.scam.giveaway').run(g)
    g.queue = []
    moneyState(g).heat = 50
    moneyState(g).scamRecords = []
    nextYear(g)
    const h1 = readState(g).heat
    expect(h1).toBeLessThan(50)
    for (let i = 0; i < 5; i++) nextYear(g)
    expect(readState(g).heat).toBe(0)
  })

  it('parents catch scamming kids: computer confiscated, money refunded', () => {
    let caught = 0
    let viaArrest = 0
    for (let seed = 1; seed <= 80; seed++) {
      const g = game(seed, 13, 0, seed % 2 ? 'us' : 'dk')
      withParent(g)
      moneyState(g).heat = 80
      action(g, 'computer.scam.giveaway').run(g)
      if (typeof g.flags.computerLockedUntil === 'number') {
        caught++
        expect(g.flags.computerLockedUntil).toBeGreaterThan(13)
        expect(g.flags.computerLockedUntil).toBeLessThanOrEqual(18)
        expect(canUseComputer(g)).toBe(false)
        expect(g.character.money).toBe(0)
        const texts = g.queue.filter((m): m is NoticeModal | ChoiceModal => m.kind === 'notice' || m.kind === 'choice').map((m) => m.text)
        expect(texts.some((t) => /found out you were running online scams/.test(t))).toBe(true)
      }
      // Regression: a kid the cybercrime unit arrested used to keep the computer (and the take).
      if (hasArrest(g)) {
        viaArrest++
        expect(canUseComputer(g)).toBe(false)
        expect(g.character.money).toBe(0)
      }
      roundTrips(g)
    }
    expect(caught).toBeGreaterThan(5)
    expect(viaArrest).toBeGreaterThan(0)
  })

  it('a cybercrime catch-up really seizes the computer it says it seized', () => {
    let seized = 0
    for (let seed = 1; seed <= 80; seed++) {
      const g = game(seed, 30, 0, 'dk')
      const st = moneyState(g)
      st.heat = 95
      st.scams = 3
      st.scamTake = 6_000
      g.character.criminalRecord.push({ crime: 'Wire Fraud', age: 29, caught: false, convicted: false })
      st.scamRecords.push(0)
      nextYear(g)
      if (hasArrest(g)) {
        seized++
        expect(computerLocked(g)).toMatch(/^The police took your computer away until you're 32/)
        nextYear(g)
        expect(computerLocked(g)).toBeNull()
      }
      roundTrips(g)
    }
    expect(seized).toBeGreaterThan(5)
  })
})

// ---------------------------------------------------------------------------
// Yearly hook, summary, saves

describe('yearly hook and saves', () => {
  it('old saves without data are left alone', () => {
    const g = game(1, 30, 1_000)
    nextYear(g)
    expect(g.flags[STATE_KEY]).toBeUndefined()
    expect(moneySummary(g)).toBe('')
    expect(g.queue).toHaveLength(0)
  })

  it('repairs a corrupted state in place', () => {
    const g = game(1, 30, 1_000)
    g.flags[STATE_KEY] = { positions: [1, { bad: true }], heat: 'hot', coins: null, probes: [{ id: 'x' }], skill: 1e9, scamKinds: { store: 'x' }, pnl: null }
    const st = moneyState(g)
    expect(st.positions).toEqual([])
    expect(st.coins).toEqual([])
    expect(st.probes).toEqual([])
    expect(st.heat).toBe(0)
    expect(st.skill).toBe(100)
    expect(st.pnl).toBe(0)
    expect(st.scamKinds).toEqual({})
    expect(moneyState(g)).toBe(st)
    nextYear(g)
    roundTrips(g)
  })

  it('does nothing for the dead and shows nothing in prison', () => {
    const g = adultTrader(1, 10_000)
    buyIndex(g, { dir: 'call', strike: 'atm', amount: 1_000 })
    g.queue = []
    g.character.alive = false
    const before = JSON.stringify({ st: g.flags[STATE_KEY], money: g.character.money, log: g.log, counters: g.counters })
    nextYear(g)
    expect(JSON.stringify({ st: g.flags[STATE_KEY], money: g.character.money, log: g.log, counters: g.counters })).toBe(before)
    expect(g.queue).toHaveLength(0)
    expect(moneyNodes(g)).toEqual([])
  })

  it('shows at most one popup a year from this side', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = adultTrader(seed, 50_000, 'dk')
      buyIndex(g, { dir: 'put', strike: 'atm', amount: 20_000 })
      g.queue = []
      const st = moneyState(g)
      st.heat = 90
      g.character.criminalRecord.push({ crime: 'Wire Fraud', age: 29, caught: false, convicted: false })
      st.scamRecords.push(0)
      st.probes.push({ id: 'p', kind: 'dump', ticker: 'TOAD', take: 40_000, dueAge: 31, startAge: 28, countryId: 'dk', evidence: 0.6, publicCase: false, recordIndex: -1 })
      nextYear(g)
      expect(g.queue.length).toBeLessThanOrEqual(1)
      roundTrips(g)
    }
  })

  it('summarizes the risky side for the AI', () => {
    const g = adultTrader(1, 100_000)
    launchCoin(g, 'Llama Cash')
    answer(g, 'computer.money.coin.pump', 'rug')
    const st = moneyState(g)
    st.trades = 3
    st.pnl = 12_000
    st.probes.push({ id: 'p', kind: 'rug', ticker: 'LLAMA', take: 1, dueAge: 99, startAge: 30, countryId: 'us', evidence: 0.5, publicCase: true, recordIndex: -1 })
    const s = moneySummary(g)
    expect(s).toMatch(/^Trades index options \(up \$12K lifetime\)/)
    expect(s).toContain('$LLAMA')
    expect(s).toContain('rug-pulled')
    expect(s).toContain('under investigation')
  })

  it('names local regulators and brokers without real brands', () => {
    expect(regulator('us')).toBe('the SEC')
    expect(regulator('de')).toBe('BaFin')
    expect(regulator('id')).toBe('OJK')
    expect(regulator('ws')).toMatch(/financial regulator/)
    expect(brokerName('jp')).toMatch(/^[A-Z][A-Za-z' -]+ (Securities|Direct|Invest|Trade|Brokerage|Markets)$/)
    expect(brokerName('jp')).toBe(brokerName('jp'))
  })
})
