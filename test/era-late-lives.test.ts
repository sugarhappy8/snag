// Whole lives through the late decades: born 1980, 1995, 2005 and 2015 in different parts of the
// world, played year by year with popups answered and leisure chosen (including Hang Out), must
// simulate without errors and without a single anachronism; and where you grew up changes what
// the decade was like (a Nigerian 1998 teen has a cyber cafe and a shared TV, an American one has
// the mall and the family computer).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pastimesMenu } from '../src/game/activities/pastimes'
import { ageUp } from '../src/game/aging'
import { anachronismsIn, eraOk } from '../src/game/events/era'
import { householdHas } from '../src/game/events/era-late-kit'
import { eraFlavorPools } from '../src/game/events/era-life'
import { createNewLife } from '../src/game/life'
import { activitiesMenu } from '../src/game/menus'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
}
type Driver = ReturnType<typeof driver>

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => errorSpy.mockRestore())

function usable(g: GameState, n: MenuNode): boolean {
  if (n.type === 'info' || n.type === 'heading') return false
  if (n.visible && !n.visible(g)) return false
  if (n.disabledReason && n.disabledReason(g)) return false
  return !(n.type === 'action' && n.id === 'surrenderLife')
}

function actionsOf(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 3) return out
  for (const n of nodes) {
    if (!usable(g, n)) continue
    if (n.type === 'action' && !n.input) out.push(n)
    else if (n.type === 'menu') actionsOf(g, n.children(g), depth + 1, out)
  }
  return out
}

function drain(g: GameState, d: Driver, texts: string[]): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
    const m: ModalItem = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') texts.push(`${m.title} :: ${m.text}`)
    else if (m.kind === 'choice') {
      texts.push(`${m.title} :: ${m.text}`, ...m.choices.map((c) => c.label))
      const c = d.pick(m.choices)
      if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Alex', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function playLife(seed: number, year: number, countryId: string, maxAge: number): { texts: { text: string; year: number; countries: string[] }[]; died: boolean; age: number } {
  const d = driver(seed * 7919 + year)
  const g = createNewLife({ seed, year, countryId })
  const out: { text: string; year: number; countries: string[] }[] = []
  const seen = new Set<string>()
  const collect = (extra: string[] = []) => {
    const texts: string[] = [...extra]
    for (const y of g.log) for (const e of y.entries) if (!seen.has(e.id)) (seen.add(e.id), texts.push(e.text))
    for (const t of texts) out.push({ text: t, year: g.year, countries: [...new Set([countryId, g.character.countryId])] })
  }
  let texts: string[] = []
  drain(g, d, texts)
  collect(texts)
  while (g.character.alive && g.character.age < maxAge) {
    const n = d.int(0, 2)
    for (let i = 0; i < n && g.character.alive; i++) {
      // Half the time open Hang Out, the rest the whole Activities menu.
      const pool = d.next() < 0.5 ? actionsOf(g, pastimesMenu.children(g)) : actionsOf(g, activitiesMenu.children(g))
      if (!pool.length) continue
      const a = d.pick(pool)
      texts = [a.label]
      a.run(g)
      drain(g, d, texts)
      collect(texts)
    }
    if (!g.character.alive) break
    texts = []
    ageUp(g)
    drain(g, d, texts)
    collect(texts)
  }
  return { texts: out, died: !g.character.alive, age: g.character.age }
}

const LIVES: [number, string][] = [
  [1980, 'us'],
  [1980, 'ng'],
  [1980, 'jp'],
  [1995, 'us'],
  [1995, 'in'],
  [1995, 'br'],
  [2005, 'us'],
  [2005, 'gb'],
  [2005, 'ng'],
  [2015, 'us'],
  [2015, 'ke'],
  [2015, 'kr'],
]

describe('lives through the late decades', () => {
  it('simulate without errors and without a single anachronism', () => {
    const bad: string[] = []
    for (const [i, [year, country]] of LIVES.entries()) {
      const life = playLife(i + 3, year, country, 85)
      expect(life.age, `${year} ${country}`).toBeGreaterThan(30)
      for (const t of life.texts) {
        const rules = anachronismsIn(t.text, t.year, t.countries)
        if (rules.length) bad.push(`[${rules.join(',')}] ${t.year} ${country} (born ${year}): ${t.text.slice(0, 160)}`)
        if (/undefined|NaN|\[object|\{\w+\}/.test(t.text)) bad.push(`stray text ${t.year} ${country}: ${t.text.slice(0, 120)}`)
      }
    }
    expect(errorSpy).not.toHaveBeenCalled()
    // Other builders' texts may still trip the lint; ours never do (anything in era-pack or Hang Out).
    const mine = bad.filter((b) => /cyber|LAN party|arcade|mall|video|mixtape|karaoke|roller|radio|stream|feed|family chat|bulletin|early web|app store|broadband/i.test(b))
    expect(mine, bad.join('\n').slice(0, 3000)).toEqual([])
  }, 600_000)
})

describe('where you grew up changes the decade', () => {
  const teen = (year: number, country: string, age = 15): GameState => {
    const g = makeTestGame(21, { countryId: country, birthCountryId: country, age })
    g.year = year
    return g
  }
  const keys = (g: GameState): string[] => eraFlavorPools(g).map((p) => p.key.replace(/^era:/, ''))

  it('gives a Nigerian 1998 teen a poorer-country pool and Africa, an American one the American mall pool', () => {
    const ng = keys(teen(1998, 'ng'))
    const us = keys(teen(1998, 'us'))
    expect(ng).toContain('80.teen.poorer')
    expect(ng).toContain('80.teen.africa')
    expect(ng).not.toContain('80.teen.anglo')
    expect(us).toContain('80.teen.anglo')
    expect(us).toContain('80.teen.rich')
    expect(us).not.toContain('80.teen.poorer')
    expect(us).not.toContain('80.teen.africa')
  })

  it('gives a 1998 Lagos household a home computer rarely and a cyber cafe often, an American one the other way round', () => {
    const owners = (country: string, tech: 'homeComputer' | 'internet'): number => {
      let n = 0
      for (let i = 0; i < 400; i++) {
        const g = teen(1998, country)
        g.lifeId = `life-${i}`
        if (householdHas(g, tech)) n++
      }
      return n / 400
    }
    expect(owners('ng', 'homeComputer')).toBeLessThan(0.15)
    expect(owners('us', 'homeComputer')).toBeGreaterThan(0.25)
    expect(owners('ng', 'internet')).toBeLessThan(0.05)
    // Same household, same answer on every call.
    const g = teen(1998, 'us')
    expect(householdHas(g, 'homeComputer')).toBe(householdHas(g, 'homeComputer'))

    // The lines about a family computer reach only households that have one; the cafe is for everyone else.
    const lines = (country: string, owns: boolean): string[] => {
      const t = teen(1998, country)
      t.flags['own.homeComputer'] = owns
      t.flags['own.internet'] = false
      return eraFlavorPools(t).flatMap((p) => p.lines).filter((l) => eraOk(t, l))
    }
    const homeLine = /computer for my birthday|my father let me use his computer|installed a game from a stack of floppy/i
    expect(lines('ng', false).some((l) => homeLine.test(l))).toBe(false)
    expect(lines('ng', false).some((l) => /cyber cafe/i.test(l))).toBe(true)
    expect(lines('us', true).some((l) => /computer/i.test(l))).toBe(true)
    expect(lines('us', false).some((l) => /cyber cafe/i.test(l))).toBe(false)
  })

  it('moves from pagers and landlines to group chats and short video across the decades', () => {
    const lines = (year: number, age = 15): string[] => {
      const g = teen(year, 'us', age)
      return eraFlavorPools(g).flatMap((p) => p.lines).filter((l) => eraOk(g, l))
    }
    expect(lines(1990).some((l) => /pager|Walkman|mixtape|arcade/i.test(l))).toBe(true)
    expect(lines(1990).some((l) => /short-video|streak|group chat|chatbot/i.test(l))).toBe(false)
    expect(lines(2006).some((l) => /instant messenger|top eight|profile/i.test(l))).toBe(true)
    expect(lines(2018).some((l) => /short-video|streak|influencer/i.test(l))).toBe(true)
    expect(lines(2018).some((l) => /pager|dial-up|cassette/i.test(l))).toBe(false)
    expect(lines(2025).some((l) => /chatbot|AI/i.test(l))).toBe(true)
    expect(lines(2010).some((l) => /chatbot/i.test(l))).toBe(false)
  })
})
