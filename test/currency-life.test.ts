// Whole lives through the real engine with the currency converter: plain US dollars must read
// exactly as before, and a local-currency life must never leak a dollar amount.
import { afterEach, describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext, registerMoneyConverter, setMoneyDisplay } from '../src/game/core'
import { convertMoney } from '../src/game/data/currencies'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

afterEach(() => {
  registerMoneyConverter(convertMoney)
  setMoneyDisplay({ mode: 'usd', nominal: false })
  bindMoneyContext(null)
})

/** The converter before currencies existed (core.ts's default): plain US dollars. */
const plainDollars = (n: number) => ({ amount: n, symbol: '$', code: 'USD' })

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
}

function actions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 3) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason?.(g)) continue
    if (n.type === 'action') {
      if (n.id !== 'surrenderLife' && n.id !== 'doAnything') out.push(n)
    } else actions(g, n.children(g), depth + 1, out)
  }
  return out
}

/** Every text a player would read in a seeded life (log lines, popups, menu subtitles). */
function playLife(seed: number, countryId: string, year: number, years: number): string[] {
  const d = driver(seed)
  const g = createNewLife({ seed, countryId, year })
  const seen: string[] = []
  const drain = () => {
    for (let guard = 0; g.queue.length && guard < 300; guard++) {
      const m = g.queue.shift()!
      const before = g.queue.length
      if (m.kind === 'notice') seen.push(m.text)
      else if (m.kind === 'choice') {
        seen.push(m.text, ...m.choices.map((c) => c.label))
        const c = d.pick(m.choices)
        if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
      } else if (m.kind === 'input') {
        seen.push(m.text)
        runScript(g, m.scriptId, m.input === 'number' ? String(m.min ?? 10) : m.defaultValue || 'Alex', m.data, m)
      } else if (m.kind === 'minigame') {
        runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : m.game === 'burglary' ? JSON.stringify({ loot: 50, caught: false }) : 'done', m.data, m)
      } else if (m.kind === 'aiTask') applyFallback(g, m.task)
      g.queue.unshift(...g.queue.splice(before))
    }
  }
  drain()
  for (let y = 0; y < years && g.character.alive; y++) {
    for (let i = 0; i < 3 && g.character.age >= 6; i++) {
      const menu = d.pick([activitiesMenu, occupationMenu, assetsMenu])
      const opts = actions(g, menu.children(g))
      if (!opts.length) continue
      const a = d.pick(opts)
      const sub = typeof a.subtitle === 'function' ? a.subtitle(g) : a.subtitle
      if (sub) seen.push(sub)
      a.run(g, a.input ? (a.input.kind === 'number' ? String(a.input.min ?? 10) : 'Alex') : undefined)
      drain()
    }
    ageUp(g)
    drain()
  }
  for (const year of g.log) for (const e of year.entries) seen.push(e.text)
  return seen
}

describe('whole lives', () => {
  it('read exactly as before in plain US dollars', () => {
    for (const [seed, country, year] of [[11, 'us', 1990], [12, 'jp', 1975], [13, 'de', 2026]] as const) {
      registerMoneyConverter(plainDollars)
      setMoneyDisplay({ mode: 'usd', nominal: false })
      const before = playLife(seed, country, year, 30)
      registerMoneyConverter(convertMoney)
      const after = playLife(seed, country, year, 30)
      expect(after.length, country).toBe(before.length)
      expect(after, country).toEqual(before)
      expect(after.some((t) => /\$\d/.test(t)), country).toBe(true)
    }
  }, 120_000)

  it('write the birth year in the new life’s currency, whatever life was on screen before', () => {
    setMoneyDisplay({ mode: 'local', nominal: true })
    // Seed 1 in 2000s Britain: a wealthy parent founds a company the year you're born.
    for (const before of [null, createNewLife({ seed: 2, countryId: 'jp', year: 1980 })]) {
      bindMoneyContext(before)
      const g = createNewLife({ seed: 1, countryId: 'gb', year: 2000 })
      const texts = [...g.log.flatMap((y) => y.entries.map((e) => e.text)), ...g.people.map((p) => JSON.stringify(p.data))]
      expect(texts.some((t) => /founded .* using £[\d.,]+[KMB]? of personal savings/.test(t))).toBe(true)
      expect(texts.filter((t) => /(^|[^A-Za-z$])(\$|¥)\d/.test(t))).toEqual([])
    }
  })

  it('show a Japanese life in yen, never in dollars', () => {
    setMoneyDisplay({ mode: 'local', nominal: true })
    const texts = playLife(21, 'jp', 1975, 35)
    expect(texts.some((t) => /¥[\d,]+/.test(t))).toBe(true)
    const leaks = texts.filter((t) => /(^|[^A-Za-z$])\$\d/.test(t))
    expect(leaks).toEqual([])
  }, 120_000)
})
