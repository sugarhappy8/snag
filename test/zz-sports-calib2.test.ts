import { it } from 'vitest'
import { fightInternals } from '../src/game/special/sports-fight'
import { makeTestGame } from './helpers'

it('mirror', () => {
  const g = makeTestGame(5, { age: 25 })
  const st = { s: 40, g: 40, c: 40, chin: 65, iq: 35 }
  const moves = ['strike', 'grapple', 'sub', 'defend'] as const
  let a = 0, b = 0
  for (let i = 0; i < 20000; i++) {
    const m = moves[i % 4]; const o = moves[Math.floor(i / 4) % 4]
    const side = () => ({ hp: 10, st: 80, top: false, reckless: false })
    const x = fightInternals.exchange(g, st, side(), m, st, side(), o, 0, 40, 1)
    const y = fightInternals.exchange(g, st, side(), o, st, side(), m, 0, 40, 1)
    a += x.pts + x.finish * 100; b += y.pts + y.finish * 100
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-snag/10662b3d-d68a-59c1-a541-a28cb41ae61d/scratchpad/mirror.txt', `${a} ${b}`)
})
