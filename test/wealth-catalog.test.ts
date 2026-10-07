// Every money request in the catalog (events/wealth-kids/-family/-world.ts), built for lives across
// eras and countries and answered with every option: no NaN/undefined/[object] text, nothing that
// didn't exist yet in that year and country, amounts that are finite and never negative, and no
// answer (follow-up sliders included, at their maximum) that takes the player below zero.
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { askDefs } from '../src/game/events/wealth-catalog'
import { wealthTier } from '../src/game/events/wealth-core'
import { askChoices, presentAsk } from '../src/game/events/wealth-resolve'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { GameState, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

function texts(items: ModalItem[]): string[] {
  return items.flatMap((m) =>
    m.kind === 'choice' ? [m.title, m.text, ...m.choices.map((c) => `${c.label} ${c.hint ?? ''}`)] : m.kind === 'notice' || m.kind === 'input' ? [m.title, m.text] : [],
  )
}

function household(year: number, country: string, money: number, liquid: boolean, young: boolean): GameState {
  const g = makeTestGame(year + money % 97 + country.charCodeAt(0), { age: young ? 40 : 66, money: liquid ? money : 50, countryId: country, residence: { status: 'owned', assetId: 'h' } })
  g.year = year
  g.assets.push({ id: 'h', kind: 'house', name: 'House', emoji: '🏠', purchasePrice: 500_000, value: liquid ? 500_000 : money, condition: 70, purchasedAge: 30, upkeep: 0, details: {} })
  g.character.hidden.fame = 70
  if (young) {
    // Single, with parents in their sixties, siblings and a friend who only calls about money.
    for (const age of [8, 17]) createPerson(g, { relation: 'child', age, relationship: 60 })
    createPerson(g, { relation: 'parent', age: 66, relationship: 60, money: 100 })
    createPerson(g, { relation: 'sibling', age: 35, relationship: 60, data: { married: true } })
    createPerson(g, { relation: 'sibling', age: 30, relationship: 60 })
    createPerson(g, { relation: 'friend', age: 41, relationship: 60, traits: ['manipulative', 'funny'], data: { w: { by: 'player', yes: 1 } } })
    return g
  }
  for (const age of [5, 9, 12, 16, 19, 22, 26, 33, 45]) createPerson(g, { relation: 'child', age, relationship: 60 })
  // A spoiled adult kid who just wrecked the car you bought them.
  createPerson(g, { relation: 'child', age: 27, relationship: 60, data: { entitlement: 75, w: { by: 'player', marks: { crash: year } } } })
  createPerson(g, { relation: 'grandchild', age: 10, relationship: 60 })
  createPerson(g, { relation: 'spouse', age: 60, relationship: 60, livesWithPlayer: true })
  createPerson(g, { relation: 'parent', age: 88, relationship: 60, money: 100 })
  createPerson(g, { relation: 'sibling', age: 63, relationship: 60, data: { married: true } })
  const abroad = createPerson(g, { relation: 'sibling', age: 60, relationship: 60 })
  abroad.data.countryId = country === 'us' ? 'ng' : 'us'
  for (let i = 0; i < 3; i++) createPerson(g, { relation: 'friend', age: 40 + i * 10, relationship: 60, traits: i === 0 ? ['sneaky', 'lazy'] : ['kind', 'honest'] })
  return g
}

describe('the money request catalog', () => {
  it('reads well, fits its era and never overdraws, for every ask and every answer', () => {
    const problems = new Set<string>()
    const seen = new Set<string>()
    for (const year of [1912, 1952, 1977, 1996, 2026]) {
      for (const country of ['us', 'ng', 'jp', 'gb']) {
        for (const money of [3_000_000, 900_000_000]) {
          for (const [liquid, young] of [[true, false], [false, false], [true, true]] as const) {
            const g = household(year, country, money, liquid, young)
            const tier = Math.max(1, wealthTier(g))
            for (const def of askDefs()) {
              for (const p of (def.people ? def.people(g) : [undefined]).slice(0, 2)) {
                if (def.when && !def.when(g, tier, p)) continue
                const a = def.build(g, tier, p)
                if (!a) continue
                seen.add(def.id)
                if (!Number.isFinite(a.amt) || a.amt < 0) problems.add(`${def.id}: amount ${a.amt}`)
                const choices = askChoices(g, a)
                if (!choices.length) problems.add(`${def.id}: no options`)
                for (const ch of choices) {
                  const h: GameState = structuredClone(g)
                  const start = h.queue.length
                  presentAsk(h, a)
                  const m = h.queue[h.queue.length - 1]
                  if (m.kind !== 'choice') continue
                  runScript(h, m.scriptId!, ch.id, m.data, m)
                  for (let k = 0; k < 3; k++) {
                    const f = h.queue.find((x, i) => i >= start && x.kind === 'input')
                    if (!f || f.kind !== 'input') break
                    h.queue = h.queue.filter((x) => x !== f)
                    runScript(h, f.scriptId, String(f.max ?? 0), f.data, f)
                  }
                  if (h.character.money < 0) problems.add(`${def.id}/${ch.id}: money ${h.character.money}`)
                  const all = texts(h.queue.slice(start)).concat(h.log.flatMap((y) => y.entries.map((e) => e.text)))
                  for (const t of all) {
                    if (/undefined|NaN|\[object|\bnull\b/.test(t)) problems.add(`${def.id}/${ch.id}: ${t}`)
                    const bad = anachronismsIn(t, year, [country])
                    if (bad.length) problems.add(`${year} ${country} ${def.id}/${ch.id} (${bad.join(', ')}): ${t.slice(0, 140)}`)
                  }
                }
              }
            }
          }
        }
      }
    }
    expect([...problems]).toEqual([])
    // Every catalog entry comes up somewhere in this sweep.
    expect(askDefs().map((d) => d.id).filter((id) => !seen.has(id))).toEqual([])
  }, 120_000)
})
