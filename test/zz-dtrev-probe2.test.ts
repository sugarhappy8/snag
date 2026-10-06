import { describe, it } from 'vitest'
import { techOf, techView } from '../src/game/business/deeptech-core'
import { PROGRAMS, grantsFor } from '../src/game/business/deeptech-data'
import { grantAmount } from '../src/game/business/deeptech-funding'
import { startProgram, cancelProgram } from '../src/game/business/deeptech-rd'
import { newBiz, createBusinessAsset } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { createNewLife } from '../src/game/life'
import type { Json } from '../src/game/types'
import { readTech } from '../src/game/business/deeptech-state'
import { getCountry } from '../src/game/world'

describe('probe2', () => {
  it('capex grant then cancel', () => {
    const g = createNewLife({ seed: 5, year: 2000, countryId: 'jp' })
    g.queue = []
    g.character.age = 30
    g.character.city = getCountry('jp').cities[0]
    const b0 = newBiz(g, 'semiconductor', 'jp', g.character.city, { cash: 0 })
    const t0 = readTech(undefined)
    Object.assign(t0, { level: 60, stage: 2, done: ['firstChip', 'volume'] })
    b0.tech = JSON.parse(JSON.stringify(t0)) as Json
    const a = createBusinessAsset(g, 'Fab Co', b0, 0)
    g.assets.push(a)
    const b = bizOf(g, a)
    const t = techOf(b)
    const fab = PROGRAMS.semiconductor.find((p) => p.id === 'fab')!
    const p = startProgram(g, b, t, fab)
    console.log('started', p?.cost, 'venture', t.venture, 'cash', b.cash)
    for (const gr of grantsFor('jp', 'semiconductor')) console.log(gr.id, grantAmount(b, t, gr))
    const meti = grantsFor('jp', 'semiconductor').find((x) => x.id === 'jp-meti')!
    const amt = grantAmount(b, t, meti)
    t.venture += amt
    cancelProgram(t, p!.key)
    console.log('after cancel venture', techView(readBiz(g, a)).venture)
  })
})
