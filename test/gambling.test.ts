import { describe, expect, it } from 'vitest'
import {
  blackjackNet,
  buyLottery,
  casinoAge,
  casinoBlock,
  casinoMenu,
  drawTicket,
  GAMBLING_ADDICTION,
  LOTTERY_GAMES,
  lotteryExpectedValue,
  lotteryJackpot,
  lotteryMenu,
  parseBlackjackResult,
  raceCard,
  settleBlackjack,
  settleRace,
  slotPayout,
  slotRtp,
  startBlackjack,
  startRace,
  startSlots,
} from '../src/game/gambling'
import { nextRandom } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import type { GameState, MinigameModal, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function gambler(money = 10_000, age = 30, seed = 5): GameState {
  return makeTestGame(seed, { age, money })
}

function lastMinigame(g: GameState): MinigameModal | undefined {
  const m = g.queue.filter((x): x is MinigameModal => x.kind === 'minigame')
  return m[m.length - 1]
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    if (node.type === 'info' || node.type === 'heading') continue
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.visible?.(g)
    node.disabledReason?.(g)
    if (node.type === 'action') node.input?.defaultValue?.(g)
    else {
      node.header?.(g)
      if (depth < 5) n += walk(g, node.children(g), depth + 1)
    }
  }
  return n
}

describe('blackjack', () => {
  it('parses results and pays 2x on a win, 3x on blackjack', () => {
    expect(parseBlackjackResult('nonsense')).toBeNull()
    const r = (s: string) => parseBlackjackResult(s)!
    expect(blackjackNet(100, r('win'))).toBe(100)
    expect(blackjackNet(100, r('blackjack'))).toBe(200)
    expect(blackjackNet(100, r('push'))).toBe(0)
    expect(blackjackNet(100, r('lose'))).toBe(-100)
    expect(blackjackNet(100, r('win:double'))).toBe(200)
    expect(blackjackNet(100, r('lose:double:bust'))).toBe(-200)
    expect(r('win:charlie').charlie).toBe(true)
  })

  it('settles the payout script with counters', () => {
    const g = gambler(1_000)
    settleBlackjack(g, 'win', { bet: 100, casino: 'The Gilded Ace' })
    expect(g.character.money).toBe(1_100)
    settleBlackjack(g, 'blackjack', { bet: 100 })
    expect(g.character.money).toBe(1_300)
    settleBlackjack(g, 'lose:double', { bet: 100 })
    expect(g.character.money).toBe(1_100)
    settleBlackjack(g, 'push', { bet: 100 })
    expect(g.character.money).toBe(1_100)
    expect(g.counters.casinoWins).toBe(2)
    expect(g.counters.casinoLosses).toBe(1)
    expect(g.counters.moneyGambled).toBe(100 + 100 + 200 + 100)
    // Never loses more than you have.
    const broke = gambler(50)
    settleBlackjack(broke, 'lose:double', { bet: 50 })
    expect(broke.character.money).toBe(0)
  })

  it('asks for a bet, then runs the minigame whose result goes to the payout script', () => {
    const g = gambler(500)
    startBlackjack(g, 'Starlight Casino', '200')
    const mg = lastMinigame(g)!
    expect(mg.game).toBe('blackjack')
    expect(mg.data).toMatchObject({ bet: 200, canDouble: true })
    runScript(g, mg.scriptId, 'win', mg.data, mg)
    expect(g.character.money).toBe(700)
  })

  it('rejects bets you cannot cover or that are too small', () => {
    const g = gambler(100)
    startBlackjack(g, 'X', '5000')
    startBlackjack(g, 'X', '1')
    startBlackjack(g, 'X', 'abc')
    expect(lastMinigame(g)).toBeUndefined()
    expect(g.queue.filter((m) => m.kind === 'notice')).toHaveLength(3)
  })
})

describe('age and legality', () => {
  it('uses the drinking age (at least 18) for casinos and 18 for the lottery', () => {
    const us = gambler(1_000, 19)
    expect(casinoAge(us)).toBe(21)
    expect(casinoBlock(us)).toContain('21')
    expect(lotteryMenu.disabledReason?.(us)).toBeNull()
    const kid = gambler(1_000, 15)
    expect(lotteryMenu.disabledReason?.(kid)).toContain('18')
    expect(casinoMenu.disabledReason?.(kid)).toBeTruthy()
    const adult = gambler(1_000, 25)
    expect(casinoBlock(adult)).toBeNull()
  })

  it('bans casinos where gambling is illegal, and in prison', () => {
    const g = gambler(1_000, 30)
    g.character.countryId = 'sa'
    expect(casinoBlock(g)).toContain('illegal')
    expect(casinoBlock(g, 'track')).toContain('no horse races')
    const con = gambler(1_000, 30)
    con.character.prison = { name: 'Pen', security: 'minimum', crime: 'Fraud', sentenceYears: 1, yearsServed: 0, respect: 10, appealed: false, escapeAttempts: 0 }
    expect(casinoMenu.visible?.(con)).toBe(false)
    expect(lotteryMenu.visible?.(con)).toBe(false)
  })

  it('limits casino visits per year', () => {
    const g = gambler(1_000_000)
    for (let i = 0; i < 12; i++) startSlots(g, 'X', '10')
    expect(g.queue.filter((m) => m.kind === 'minigame')).toHaveLength(12)
    startSlots(g, 'X', '10')
    expect(g.queue.filter((m) => m.kind === 'minigame')).toHaveLength(12)
    expect(g.queue.at(-1)?.kind).toBe('notice')
  })
})

describe('slots', () => {
  it('has a house edge and pays the paytable', () => {
    const rtp = slotRtp()
    expect(rtp).toBeGreaterThan(0.85)
    expect(rtp).toBeLessThan(1)
    expect(slotPayout(['star', 'star', 'star'])).toBe(20)
    expect(slotPayout(['diamond', 'diamond', 'lemon'])).toBe(4)
    expect(slotPayout(['star', 'coin', 'diamond'])).toBe(6)
    expect(slotPayout(['grape', 'lemon', 'melon'])).toBe(3)
    expect(slotPayout(['skull', 'skull', 'skull'])).toBe(0)
    expect(slotPayout(['lemon', 'lemon', 'skull'])).toBe(0)
  })

  it('decides the reels in the engine and settles them after the animation', () => {
    const g = gambler(1_000)
    startSlots(g, 'Neon Palms Casino', '100')
    const mg = lastMinigame(g)!
    const d = mg.data as { reelIds: string[]; payout: number }
    expect(d.reelIds).toHaveLength(3)
    expect(d.payout).toBe(slotPayout(d.reelIds))
    runScript(g, mg.scriptId, 'done', mg.data, mg)
    expect(g.character.money).toBe(1_000 - 100 + 100 * d.payout)
  })
})

describe('horse races', () => {
  it('has a stable race card with five horses', () => {
    const g = gambler()
    const a = raceCard(g)
    expect(a.horses).toHaveLength(5)
    expect(raceCard(g)).toEqual(a)
  })

  it('decides the winner in advance and pays the odds only on a win', () => {
    let sawWin = false
    let sawLoss = false
    for (let seed = 1; seed < 60 && !(sawWin && sawLoss); seed++) {
      const g = gambler(1_000, 30, seed)
      startRace(g, 0, '100')
      const mg = lastMinigame(g)!
      const d = mg.data as { winner: number; pick: number; horses: { oddsNum: number; oddsDen: number }[] }
      expect(d.winner).toBeGreaterThanOrEqual(0)
      expect(d.winner).toBeLessThan(5)
      expect(g.character.money).toBe(990) // admission
      runScript(g, mg.scriptId, 'done', mg.data, mg)
      if (d.winner === d.pick) {
        sawWin = true
        expect(g.character.money).toBe(990 + Math.round((100 * d.horses[0].oddsNum) / d.horses[0].oddsDen))
      } else {
        sawLoss = true
        expect(g.character.money).toBe(890)
      }
    }
    expect(sawWin && sawLoss).toBe(true)
  })

  it('lets you just watch', () => {
    const g = gambler(100)
    startRace(g, -1, undefined)
    const mg = lastMinigame(g)!
    settleRace(g, mg.data)
    expect(g.character.money).toBe(90)
  })
})

describe('lottery', () => {
  it('always has a house edge and astronomical jackpot odds', () => {
    const g = gambler()
    for (const game of LOTTERY_GAMES) {
      const jackpot = lotteryJackpot(g, game)
      expect(lotteryExpectedValue(game, jackpot)).toBeLessThan(game.price)
    }
    const mega = LOTTERY_GAMES.find((x) => x.id === 'mega')!
    expect(mega.tiers[0].odds).toBeGreaterThanOrEqual(10_000_000)
  })

  it('pays small prizes often and jackpots (almost) never', () => {
    const g = gambler()
    const lotto = LOTTERY_GAMES.find((x) => x.id === 'lotto')!
    let wins = 0
    let jackpots = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const t = drawTicket(g, lotto, 1_000_000)
      if (t.prize > 0) wins++
      if (t.jackpot) jackpots++
    }
    const expected = lotto.tiers.reduce((s, t) => s + 1 / t.odds, 0)
    expect(wins / n).toBeGreaterThan(expected * 0.85)
    expect(wins / n).toBeLessThan(expected * 1.15)
    expect(jackpots).toBe(0)
  })

  it('buys tickets, counts them and refuses kids and the broke', () => {
    const g = gambler(100)
    const out = buyLottery(g, 'lotto', 10)!
    expect(out.spent).toBe(20)
    expect(g.counters.lotteryTickets).toBe(10)
    expect(g.character.money).toBe(100 - 20 + out.won)
    expect(buyLottery(gambler(1), 'mega', 10)).toBeNull()
    expect(buyLottery(gambler(100, 16), 'scratch1', 1)).toBeNull()
  })

  it('makes jackpot winners famous', () => {
    const lotto = LOTTERY_GAMES.find((x) => x.id === 'lotto')!
    expect(drawTicket(gambler(), lotto, 123, 1e12).jackpot).toBe(true)
    // Find an RNG state whose next draw lands in the jackpot tier (the ticket is the first draw).
    let seed = 1
    while (nextRandom(seed)[0] >= 1 / lotto.tiers[0].odds) seed++
    const winner = gambler(100, 30, seed)
    const jackpot = lotteryJackpot(winner, lotto)
    const res = buyLottery(winner, 'lotto', 1)!
    expect(res.jackpot).toBe(true)
    expect(winner.character.money).toBe(100 - 2 + jackpot)
    expect(winner.character.hidden.fame).toBeGreaterThan(0)
    expect(winner.counters.lotteryWins).toBe(1)
    expect(winner.queue.some((m) => m.kind === 'notice' && m.title === 'JACKPOT!!!')).toBe(true)
  })
})

describe('addiction and menus', () => {
  it('can give heavy gamblers a gambling addiction', () => {
    let addicted = false
    for (let seed = 1; seed < 40 && !addicted; seed++) {
      const g = gambler(100_000, 30, seed)
      g.character.hidden.willpower = 5
      for (let i = 0; i < 12; i++) settleBlackjack(g, 'lose', { bet: 5_000 })
      addicted = g.character.conditions.some((c) => c.name === GAMBLING_ADDICTION)
    }
    expect(addicted).toBe(true)
  })

  it('builds the casino and lottery menus', () => {
    const g = gambler(10_000)
    expect(walk(g, casinoMenu.children(g))).toBeGreaterThan(8)
    expect(walk(g, lotteryMenu.children(g))).toBeGreaterThan(8)
  })
})
