import { describe, expect, it } from 'vitest'
import { moneyState } from '../src/game/computer/money-common'
import { optionsMenu } from '../src/game/computer/money-options'
import { yearlyMoney } from '../src/game/computer/money'
import { marketInstinct } from '../src/game/invest/instinct'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

function trader(seed: number, cid: string, talent: boolean): GameState {
  const g = makeTestGame(seed, { age: 25, countryId: cid, money: 50_000_000, talents: talent ? ['Investing'] : undefined })
  g.lifeId = `opt-${cid}-${seed}`
  const st = moneyState(g)
  st.broker = 'Summit Securities'
  g.assets.push({ id: 'pc1', kind: 'other', name: 'Laptop', emoji: 'x', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: 25, upkeep: 0, details: { category: 'electronics' } })
  return g
}

function trade(g: GameState, dir: 'call' | 'put', strike: string, amount: number, side = 'buy'): boolean {
  g.queue = []
  const rows = optionsMenu().children(g)
  const buy = rows.find((n) => n.id === (side === 'buy' ? 'computer.options.buy' : 'computer.options.sell'))
  if (!buy || buy.type !== 'action') return false
  if (buy.disabledReason?.(g)) return false
  buy.run(g)
  let m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) return false
  g.queue = []
  runScript(g, m.scriptId!, dir, m.data, m)
  m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) return false
  g.queue = []
  runScript(g, m.scriptId!, strike, m.data, m)
  const inp = g.queue.find((x) => x.kind === 'input') as Extract<ModalItem, { kind: 'input' }> | undefined
  if (!inp) return false
  g.queue = []
  runScript(g, inp.scriptId, String(Math.min(amount, inp.max ?? amount)), inp.data, inp as never)
  return true
}

describe('options EV', () => {
  it('gut strategy', () => {
    for (const strike of ['atm', 'otm', 'sell-atm', 'sell-otm']) {
      for (const talent of [true, false]) {
        let staked = 0
        let back = 0
        let wins = 0
        let trades = 0
        let netSum = 0
        let lossYears = 0
        const lifeRatios: number[] = []
        for (const cid of ['us', 'jp', 'br', 'gb', 'in', 'kr']) {
          for (let life = 0; life < 4; life++) {
            const g = trader(100 + life, cid, talent)
            let ls = 0
            let lb = 0
            for (let y = 0; y < 30; y++) {
              const inst = marketInstinct(g)
              let dir: 'call' | 'put' | null = null
              if (talent && inst) dir = inst.gloomy || inst.market === 'down' ? 'put' : inst.market === 'up' ? 'call' : null
              if (!talent) dir = (y * 7 + life) % 2 ? 'call' : 'put'
              const before = g.character.money
              let n = 0
              if (dir) for (let k = 0; k < 4; k++) if (strike.startsWith('sell') ? trade(g, dir === 'call' ? 'put' : 'call', strike.slice(5), 20_000_000, 'sell') : trade(g, dir, strike, 2_000_000)) n++
              const spent = before - g.character.money
              g.queue = []
              g.year++
              g.character.age++
              g.yearActions = {}
              yearlyMoney(g)
              g.queue = []
              const got = g.character.money - (before - spent)
              if (n) { netSum += g.character.money - before; if (g.character.money < before) lossYears++ }
              if (n) {
                staked += spent
                back += got
                ls += spent
                lb += got
                trades++
                if (got > spent) wins++
              }
              g.character.money = 50_000_000
            }
            if (ls) lifeRatios.push(lb / ls)
          }
        }
        lifeRatios.sort((a, b) => a - b)
        console.log(strike, talent ? 'talent' : 'plain', 'ratio', (back / staked).toFixed(3), 'yearWin', (wins / trades).toFixed(2), 'years', trades, 'worstLife', lifeRatios[0]?.toFixed(2), 'median', lifeRatios[Math.floor(lifeRatios.length / 2)]?.toFixed(2), 'avgNet/yr', Math.round(netSum / Math.max(1, trades)), 'lossYears', lossYears)
      }
    }
    expect(1).toBe(1)
  }, 300_000)
})
