import { test } from 'vitest'
import { exchangeInfo, exchangeYear } from '../src/game/invest/engine'
test('tr', () => {
  for (const c of ['tr', 'ar', 've', 'us', 'jp']) {
    const info = exchangeInfo(c)
    const growth: number[] = []
    for (let s = 0; s < 200; s++) {
      let m = 1
      for (let y = 2027; y <= 2056; y++) m *= 1 + exchangeYear('f' + s, 2000, info, y).fund.ret
      growth.push(m)
    }
    growth.sort((a, b) => a - b)
    console.log(c, info.ex.drift, 'fund price x30y p10', growth[20].toFixed(1), 'median', growth[100].toFixed(1), 'p90', growth[180].toFixed(1), 'max', growth[199].toFixed(0))
  }
})
