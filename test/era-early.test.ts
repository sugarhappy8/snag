// The early-era data and packs (1900-1979): every year has a culture line and prices, no line of
// any pack names a thing before its time where it is shown, ids are unique and prefixed, every flavor
// pool keeps fallbacks that need no tag or token, and every popup event resolves cleanly in every
// context it can appear in.
import { describe, expect, it } from 'vitest'
import { EVENT_LIBRARY } from '../src/game/events'
import { eraOk, eraStrip, ERA_RULES } from '../src/game/events/era'
import { ERA_PACKS, eraFlavorPools, type EraFlavorPool } from '../src/game/events/era-life'
import { ERA_PACK_1900 } from '../src/game/events/era-pack-1900'
import { ADULTS_1900 } from '../src/game/events/era-pack-1900-adults'
import { KIDS_1900 } from '../src/game/events/era-pack-1900-kids'
import { ADULTS_1946 } from '../src/game/events/era-pack-1946-adults'
import { KIDS_1946 } from '../src/game/events/era-pack-1946-kids'
import { ERA_PACK_1946 } from '../src/game/events/era-pack-1946'
import { withCtx, type Ctx, type EventDef } from '../src/game/events/helpers'
import { cultureOf, digestLine, nominalPrice, pricesLine, pricesOf, thisYearNodes } from '../src/game/history/digest'
import { CULTURE_EARLY } from '../src/game/history/digest-early'
import { PRICE_ITEMS } from '../src/game/history/digest-prices'
import { priceLevel, techAdoption, PRESENT_YEAR } from '../src/game/history/timeline'
import { adoptionWord, technologyRows, thisYearMenu } from '../src/game/history/digest-menu'
import { anachronismsIn } from '../src/game/events/era'
import { COUNTRIES, getCountry } from '../src/game/world'
import { createPerson } from '../src/game/people'
import { realWealthFactor } from '../src/game/history/events-people'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const ALL_COUNTRIES = COUNTRIES.map((c) => c.id)
const SAMPLE = ['us', 'gb', 'ie', 'ca', 'au', 'de', 'fr', 'it', 'ru', 'pl', 'jp', 'cn', 'in', 'pk', 'br', 'mx', 'ar', 'ng', 'ke', 'za', 'id', 'ph', 'eg', 'tr', 'kr']

describe('digest data, 1900-1979 culture and all prices', () => {
  it('has a culture line for every year 1900-1979', () => {
    for (let y = 1900; y <= 1979; y++) {
      expect(CULTURE_EARLY[y], `culture ${y}`).toBeTruthy()
      expect(cultureOf(y)).toBe(CULTURE_EARLY[y])
      expect(CULTURE_EARLY[y].length).toBeGreaterThan(60)
      expect(CULTURE_EARLY[y].length).toBeLessThanOrEqual(110)
      expect(CULTURE_EARLY[y]).toMatch(/[.!?]$/)
    }
  })

  it('has at least six prices for every year 1900-2026, all finite and positive', () => {
    for (let y = 1900; y <= 2026; y++) {
      const prices = pricesOf(y)
      expect(prices.length, `prices ${y}`).toBeGreaterThanOrEqual(6)
      for (const p of prices) {
        expect(Number.isFinite(p.nominal) && p.nominal > 0, `${y} ${p.id}`).toBe(true)
        expect(Number.isFinite(p.engine) && p.engine > 0, `${y} ${p.id} engine`).toBe(true)
        expect(p.engine).toBeCloseTo(p.nominal / priceLevel(y), 6)
      }
      expect(pricesLine(y).length).toBeGreaterThan(20)
    }
  })

  it('keeps every item sorted, unique and era-sensible', () => {
    const ids = new Set<string>()
    for (const item of PRICE_ITEMS) {
      expect(ids.has(item.id), item.id).toBe(false)
      ids.add(item.id)
      expect(item.label).toMatch(/^an? |^the |^\w/)
      for (let i = 1; i < item.anchors.length; i++) expect(item.anchors[i][0], `${item.id} anchors`).toBeGreaterThan(item.anchors[i - 1][0])
      expect(nominalPrice(item, item.from - 1)).toBeNull()
      expect(nominalPrice(item, item.from)).toBeGreaterThan(0)
    }
    expect(PRICE_ITEMS.length).toBeGreaterThanOrEqual(12)
    // Things that did not exist yet are not priced.
    const year1930 = pricesOf(1930).map((p) => p.id)
    for (const late of ['tv', 'tubeset', 'computer', 'micro', 'smartphone', 'mobile', 'album']) expect(year1930).not.toContain(late)
    const year1960 = pricesOf(1960).map((p) => p.id)
    expect(year1960).toContain('tubeset')
    expect(year1960).not.toContain('computer')
  })

  it('has period-right anchors a reader can recognize', () => {
    const by = (id: string, y: number) => nominalPrice(PRICE_ITEMS.find((i) => i.id === id)!, y)!
    expect(by('movie', 1950)).toBeCloseTo(0.46, 2)
    expect(by('gas', 1980)).toBeCloseTo(1.19, 2)
    expect(by('stamp', 1975)).toBeCloseTo(0.13, 2)
    expect(by('bread', 1930)).toBeGreaterThan(0.05)
    expect(by('bread', 1930)).toBeLessThan(0.15)
    expect(by('rent', 1970)).toBeGreaterThan(80)
    expect(by('car', 1960)).toBeGreaterThan(2000)
  })

  it('never names a thing before it existed, in any country', () => {
    const bad: string[] = []
    for (let y = 1900; y <= 2026; y++) {
      const line = digestLine(y)
      expect(line, `digest ${y}`).toContain(`${y}:`)
      for (const c of ALL_COUNTRIES) {
        const rules = anachronismsIn(line, y, [c])
        if (rules.length) bad.push(`${y} ${c} [${rules.join(',')}] ${line.slice(0, 160)}`)
      }
      for (const n of thisYearNodes(makeTestGame(1, { countryId: 'us' }))) void n
    }
    // The late digest (1980+) belongs to another builder; here only years before 1980 are enforced.
    const early = bad.filter((b) => Number(b.slice(0, 4)) < 1980)
    expect(early.slice(0, 20).join('\n')).toBe('')
  })

  it('builds the This Year rows for any early year', () => {
    for (const y of [1900, 1925, 1950, 1975]) {
      const g = makeTestGame(2, { countryId: 'us' })
      g.year = y
      const nodes = thisYearNodes(g)
      expect(nodes.length).toBeGreaterThan(7)
      expect(nodes.some((n) => n.type === 'info' && n.id === 'year.culture')).toBe(true)
    }
  })
})

describe('era pack flavor pools', () => {
  const mine: { pack: string; pool: EraFlavorPool }[] = [...ERA_PACK_1900.flavor.map((p) => ({ pack: '1900', pool: p })), ...ERA_PACK_1946.flavor.map((p) => ({ pack: '1946', pool: p }))]

  it('splits family lines into household pools without losing or duplicating a line', () => {
    const authored = [...KIDS_1900, ...ADULTS_1900, ...KIDS_1946, ...ADULTS_1946]
    const authoredLines = authored.reduce((n, p) => n + p.lines.length, 0)
    expect(mine.reduce((n, { pool }) => n + pool.lines.length, 0)).toBe(authoredLines)
    const kids = mine.filter(({ pool }) => pool.key.endsWith('+kids'))
    expect(kids.length).toBeGreaterThan(5)
    // A childless, unmarried adult never hears about babies or honeymoons.
    const g = makeTestGame(6, { countryId: 'us', age: 40 })
    g.year = 1955
    const lines = eraFlavorPools(g).flatMap((p) => p.lines.map(eraStrip))
    expect(lines.join('\n')).not.toMatch(/honeymoon|my husband|my wife|our baby|grandchild/i)
  })

  it('has serious volume and unique keys', () => {
    const keys = new Set<string>()
    let lines = 0
    for (const { pool } of mine) {
      expect(keys.has(pool.key), pool.key).toBe(false)
      keys.add(pool.key)
      expect(pool.weight).toBeGreaterThan(0)
      lines += pool.lines.length
    }
    expect(ERA_PACK_1900.flavor.reduce((s, p) => s + p.lines.length, 0)).toBeGreaterThan(900)
    expect(ERA_PACK_1946.flavor.reduce((s, p) => s + p.lines.length, 0)).toBeGreaterThan(900)
    expect(mine.length).toBeGreaterThan(110)
    expect(lines).toBeGreaterThan(1900)
  })

  it('keeps untagged, token-free fallbacks in every authored pool and no placeholder text', () => {
    const authored = [...KIDS_1900, ...ADULTS_1900, ...KIDS_1946, ...ADULTS_1946]
    for (const pool of authored) {
      const plain = pool.lines.filter((l) => !l.startsWith('@') && !l.includes('{'))
      expect(plain.length, pool.key).toBeGreaterThanOrEqual(Math.min(3, pool.lines.length))
      const seen = new Set<string>()
      for (const line of pool.lines) {
        expect(line, pool.key).not.toMatch(/\?\s*no\b|TODO|undefined|NaN|\bnull\b|\?\?/)
        expect(line.length, `${pool.key}: ${line}`).toBeGreaterThan(15)
        expect(line.length, `${pool.key}: ${line}`).toBeLessThan(260)
        expect(line, pool.key).toMatch(/[.!?”’]$/)
        expect(seen.has(line), `${pool.key} repeats: ${line}`).toBe(false)
        seen.add(line)
        // Typographic apostrophes only inside text; straight quotes are for code.
        expect(line, `${pool.key}: ${line}`).not.toMatch(/\bI I\b|  |\s,/)
      }
    }
  })

  it('has no repeated line across the two packs and every pool covers real ages and years', () => {
    const seen = new Map<string, string>()
    for (const { pool } of mine) {
      for (const line of pool.lines) {
        const key = eraStrip(line)
        const prev = seen.get(key)
        expect(prev === undefined || prev === pool.key, `"${key}" in ${prev} and ${pool.key}`).toBe(true)
        seen.set(key, pool.key)
      }
      if (pool.minAge !== undefined && pool.maxAge !== undefined) expect(pool.maxAge).toBeGreaterThanOrEqual(pool.minAge)
      if (pool.from !== undefined && pool.to !== undefined) expect(pool.to).toBeGreaterThanOrEqual(pool.from)
    }
  })

  it('shows no line before its time, in any country, in any year it can be picked', () => {
    // Match each line's rules once, then check every (year, country) where the pool and the line's tags hold.
    const bad: string[] = []
    const g = makeTestGame(3, { countryId: 'us', age: 30 })
    const years: number[] = []
    for (let y = 1900; y <= 1979; y += 2) years.push(y)
    for (const { pool, pack } of mine) {
      const from = pool.from ?? (pack === '1900' ? 1900 : 1946)
      const to = pool.to ?? (pack === '1900' ? 1945 : 1979)
      const matched = pool.lines.map((line) => {
        const text = eraStrip(line).replace(/\{\w+\}/g, 'Alex')
        return { line, rules: ERA_RULES.filter((r) => r.re.test(text) && r.id !== 'era tag') }
      })
      for (const { line, rules } of matched) {
        if (!rules.length) continue
        for (const y of years) {
          if (y < from || y > to) continue
          for (const c of SAMPLE) {
            g.character.countryId = c
            g.year = y
            g.character.age = pool.minAge ?? 30
            if (pool.when && !pool.when(g)) continue
            if (!eraOk(g, line)) continue
            for (const r of rules) {
              const violated = (r.year !== undefined && y < r.year) || (r.tech !== undefined && techAdoption(c, r.tech, y) < 0.02)
              if (violated) bad.push(`${pool.key} ${y} ${c} [${r.id}] ${line.slice(0, 110)}`)
            }
          }
        }
      }
    }
    const uniq = [...new Set(bad.map((b) => b.replace(/^(\S+) \d+ \S+ /, '$1 ')))]
    expect(uniq.slice(0, 40).join('\n')).toBe('')
  }, 120_000)

  it('gives every sampled country and decade something to say', () => {
    for (const c of SAMPLE) {
      for (const [y, age] of [[1905, 8], [1915, 30], [1925, 12], [1935, 40], [1944, 16], [1950, 6], [1958, 35], [1966, 15], [1975, 50], [1978, 72]] as const) {
        const g = makeTestGame(4, { countryId: c, age })
        g.year = y
        const pools = eraFlavorPools(g)
        expect(pools.length, `${c} ${y} age ${age}`).toBeGreaterThanOrEqual(2)
        expect(pools.reduce((s, p) => s + p.lines.filter((l) => !l.startsWith('@')).length, 0), `${c} ${y}`).toBeGreaterThan(20)
      }
    }
  })

  it('keeps places apart: no American drive-in for a Nigerian child', () => {
    const g = makeTestGame(5, { countryId: 'ng', age: 14 })
    g.year = 1958
    const text = eraFlavorPools(g).flatMap((p) => p.lines.map(eraStrip)).join('\n')
    expect(text).not.toMatch(/drive-in|sock hop|Little League|Pledge of Allegiance|Tupperware/i)
    const us = makeTestGame(5, { countryId: 'us', age: 14 })
    us.year = 1958
    expect(eraFlavorPools(us).flatMap((p) => p.lines.map(eraStrip)).join('\n')).toMatch(/record hop|coonskin|duck/i)
  })
})

describe('era pack popup events', () => {
  const events: EventDef[] = [...ERA_PACK_1900.events, ...ERA_PACK_1946.events]

  it('has unique, prefixed ids and sane definitions', () => {
    const ids = new Set<string>()
    for (const ev of events) {
      expect(ev.id).toMatch(/^era\.(1900|1946)\.[A-Za-z]+$/)
      expect(ids.has(ev.id), ev.id).toBe(false)
      ids.add(ev.id)
      expect(ev.minAge, ev.id).toBeLessThanOrEqual(ev.maxAge)
      expect(ev.title.length).toBeGreaterThan(3)
      expect(Object.keys(ev.resolve).length, ev.id).toBeGreaterThanOrEqual(2)
      if (typeof ev.weight === 'number') expect(ev.weight, ev.id).toBeGreaterThan(0)
      if (ev.cooldown !== undefined) expect(ev.cooldown, ev.id).toBeGreaterThan(0)
    }
    expect(ERA_PACK_1900.events.length).toBeGreaterThanOrEqual(30)
    expect(ERA_PACK_1946.events.length).toBeGreaterThanOrEqual(24)
    // And unique across the whole library (the lead merges every pack).
    const all = new Map<string, number>()
    for (const ev of EVENT_LIBRARY) all.set(ev.id, (all.get(ev.id) ?? 0) + 1)
    for (const ev of events) expect(all.get(ev.id), ev.id).toBe(1)
    expect(ERA_PACKS.length).toBe(4)
  })

  const YEARS = [...new Set([...Array.from({ length: 27 }, (_, i) => 1900 + i * 3), 1904, 1915, 1924, 1933, 1939, 1941, 1948, 1949, 1950, 1958, 1962, 1964, 1967, 1970, 1974, 1979])].sort((a, b) => a - b)

  function context(ev: EventDef, countryId: string, year: number, age: number, seed: number): GameState {
    const g = makeTestGame(seed, { countryId, age, gender: seed % 2 ? 'male' : 'female', money: 5000 + seed * 3000 })
    g.year = year
    g.character.licenses = ['driver']
    g.character.residence = { status: seed % 3 === 0 ? 'owned' : 'parents' }
    g.character.stats.health = 60
    if (ev.id.includes('relief')) g.character.money = 40
    if (age < 18) {
      const parent = createPerson(g, { relation: 'parent', age: 38, gender: seed % 2 ? 'female' : 'male', livesWithPlayer: true })
      parent.money = Math.round(40_000 * Math.max(0.25, getCountry(countryId).wealth) * realWealthFactor(year) * (seed === 2 ? 1.1 : 0.9))
    }
    if (age < 19 || ev.id.includes('School') || ev.id.includes('strap') || ev.id.includes('dunce') || ev.id.includes('leave') || ev.id.includes('eleven') || ev.id.includes('Pay')) {
      g.character.education.current = { level: 'elementary', school: 'Test School', year: 3, totalYears: 6, grades: 60, funding: 'free', major: undefined, data: {}, program: undefined } as never
    }
    if (age >= 18 && (ev.id.includes('accident') || ev.id.includes('Store') || ev.id.includes('strike'))) {
      g.character.job = { defId: 'factory_worker', title: 'Machinist', company: 'Acme Works', salary: 24000, category: 'fulltime', performance: 60, yearsAtCompany: 2, yearsInRole: 2, data: {} } as never
    }
    return g
  }

  it('fires in some context, offers real choices and resolves every one without trouble', () => {
    const reached = new Set<string>()
    const problems: string[] = []
    for (const ev of events) {
      for (const countryId of SAMPLE) {
        for (const year of YEARS) {
          for (const age of [ev.minAge, Math.min(ev.maxAge, ev.minAge + 4), ev.maxAge]) {
            for (let seed = 1; seed <= 3; seed++) {
              const g = context(ev, countryId, year, age, seed)
              let ok = false
              try {
                ok = (ev.when ? ev.when(g) : true) && (typeof ev.weight === 'function' ? ev.weight(g) > 0 : true)
              } catch (err) {
                problems.push(`${ev.id} when threw ${String(err)}`)
              }
              if (!ok) continue
              const setup = ev.setup(g)
              if (!setup) continue
              reached.add(ev.id)
              const label = `${ev.id} ${countryId} ${year} age ${age}`
              if (setup.choices.length < 2) problems.push(`${label}: fewer than 2 choices`)
              const shown = [setup.title ?? ev.title, setup.text, ...setup.choices.map((c) => c.label)].join('\n')
              if (/undefined|NaN|\[object|\$\{|\bnull\b/.test(shown)) problems.push(`${label}: bad text ${shown.slice(0, 120)}`)
              if (anachronismsIn(shown, year, [countryId]).length) problems.push(`${label}: anachronism ${anachronismsIn(shown, year, [countryId]).join(',')}`)
              for (const choice of setup.choices) {
                const fn = ev.resolve[choice.id]
                if (!fn) {
                  problems.push(`${label}: no resolver for ${choice.id}`)
                  continue
                }
                const copy: GameState = JSON.parse(JSON.stringify(g))
                const data = { ...(setup.data ?? {}) }
                const ctx: Ctx = {
                  ev,
                  data,
                  p: undefined,
                  q: undefined,
                  s: (k) => (typeof data[k] === 'string' ? (data[k] as string) : String(data[k] ?? '')),
                  n: (k) => (typeof data[k] === 'number' ? (data[k] as number) : 0),
                }
                try {
                  withCtx(ctx, () => fn(copy, ctx))
                } catch (err) {
                  problems.push(`${label}/${choice.id} threw ${String(err)}`)
                  continue
                }
                if (!Number.isFinite(copy.character.money) || copy.character.money < 0 && g.character.money >= 0) problems.push(`${label}/${choice.id}: money ${copy.character.money}`)
                for (const k of ['happiness', 'health', 'smarts', 'looks'] as const) {
                  const v = copy.character.stats[k]
                  if (!Number.isFinite(v) || v < 0 || v > 100) problems.push(`${label}/${choice.id}: ${k}=${v}`)
                }
                const out = [...copy.queue.map((m) => ('title' in m ? `${m.title} ${'text' in m ? m.text : ''}` : '')), ...copy.log.flatMap((y) => y.entries.map((e) => e.text))].join('\n')
                if (/undefined|NaN|\[object|\$\{/.test(out)) problems.push(`${label}/${choice.id}: bad outcome text ${out.slice(0, 160)}`)
                if (anachronismsIn(out, year, [countryId]).length) problems.push(`${label}/${choice.id}: outcome anachronism ${anachronismsIn(out, year, [countryId]).join(',')} ${out.slice(0, 200)}`)
              }
            }
          }
        }
      }
    }
    for (const ev of events) expect(reached.has(ev.id), `${ev.id} never fires in any tested context`).toBe(true)
    expect([...new Set(problems)].slice(0, 30).join('\n')).toBe('')
  }, 300_000)
})

describe('the This Year menu', () => {
  it('lists culture, prices and the technology that has reached the player, and touches nothing', () => {
    for (const [year, country] of [[1905, 'us'], [1925, 'gb'], [1950, 'ng'], [1965, 'jp'], [1978, 'in']] as const) {
      const g = makeTestGame(8, { countryId: country })
      g.year = year
      const rng = g.rng
      const before = JSON.stringify(g)
      expect(thisYearMenu.visible?.(g)).toBe(true)
      const nodes = thisYearMenu.children(g)
      expect(nodes.length).toBeGreaterThan(8)
      const text = nodes.map((n) => ('text' in n && typeof n.text === 'string' ? n.text : 'label' in n ? n.label : '')).join('\n')
      expect(text).toMatch(/What things cost in/)
      expect(text).toContain(String(year))
      expect(anachronismsIn(text, year, [country])).toEqual([])
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
      expect(thisYearMenu.header?.(g)).toContain(String(year))
    }
    const modern = makeTestGame(9, { countryId: 'us' })
    modern.year = PRESENT_YEAR
    expect(thisYearMenu.visible?.(modern)).toBe(false)
    const dead = makeTestGame(9, { countryId: 'us', alive: false })
    dead.year = 1950
    expect(thisYearMenu.visible?.(dead)).toBe(false)
  })

  it('words the spread of a technology and lists only what exists', () => {
    expect(adoptionWord(0.01)).toBe('')
    expect(adoptionWord(0.05)).toMatch(/rarity/)
    expect(adoptionWord(0.9)).toMatch(/everywhere/)
    const g = makeTestGame(10, { countryId: 'us' })
    g.year = 1900
    expect(technologyRows(g)[0]).toMatchObject({ id: 'year.tech.none' })
    g.year = 1960
    const ids = technologyRows(g).map((n) => n.id)
    expect(ids).toContain('year.tech.tv')
    expect(ids).toContain('year.tech.radio')
    expect(ids).not.toContain('year.tech.smartphone')
  })
})
