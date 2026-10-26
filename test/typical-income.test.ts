// ci: fast
// R4-P7 (X54): typicalIncome, countryWealth and US_TYPICAL_INCOME live in the layer-2 leaf src/game/world/typical-income.ts, and
// events/wealth-core.ts re-exports them. The loan cap (E10b) and the legal fee (E12) in society/ need the figure, and a direct
// import from events/ would add a society->events domain pair that no rule approves; a leaf below the domains adds none.
//
// The move changes no number. TABLE was recorded from wealth-core.ts at bad9c0f, before the move, under Node 22.23.3: a row per
// country (a spread from the poorest to the richest, plus an id the game doesn't know), a column per year (the history ramp of
// realWealthFactor runs 1900 to 2026 and holds at 1 after). Every cell must come out the same to the digit.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { countryWealth as leafWealth, typicalIncome as leafIncome, US_TYPICAL_INCOME as leafUs } from '../src/game/world/typical-income'
import { countryWealth, typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { getCountry } from '../src/game/world'
import type { GameState } from '../src/game/types'
import { readImportGraph, type Graph } from './arch-kit'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LEAF = 'src/game/world/typical-income.ts'
const CORE = 'src/game/events/wealth-core.ts'

const YEARS = [1900, 1930, 1950, 1970, 1990, 2010, 2026, 2100]

const TABLE: Record<string, readonly number[]> = {
  us: [11250, 13500, 18000, 27000, 33750, 40500, 45000, 45000],
  cd: [1463, 1755, 2340, 3510, 4388, 5265, 5850, 5850],
  ng: [2250, 2700, 3600, 5400, 6750, 8100, 9000, 9000],
  in: [2813, 3375, 4500, 6750, 8438, 10125, 11250, 11250],
  mx: [4500, 5400, 7200, 10800, 13500, 16200, 18000, 18000],
  fr: [9563, 11475, 15300, 22950, 28688, 34425, 38250, 38250],
  de: [10125, 12150, 16200, 24300, 30375, 36450, 40500, 40500],
  ch: [12937, 15525, 20700, 31050, 38812, 46575, 51750, 51750],
  mc: [14625, 17550, 23400, 35100, 43875, 52650, 58500, 58500],
  qa: [12375, 14850, 19800, 29700, 37125, 44550, 49500, 49500],
  zz: [11250, 13500, 18000, 27000, 33750, 40500, 45000, 45000],
}

const WEALTH: Record<string, number> = { us: 1, cd: 0.13, ng: 0.2, in: 0.25, mx: 0.4, fr: 0.85, de: 0.9, ch: 1.15, mc: 1.3, qa: 1.1, zz: 1 }

/** A game with just the two fields typicalIncome reads for its defaults. */
function lifeIn(countryId: string, year: number): GameState {
  return { character: { countryId }, year } as unknown as GameState
}

/** Run `fn` with a country's wealth set to `w`, and put the real value back whatever happens. */
function withWealth<T>(countryId: string, w: unknown, fn: () => T): T {
  const country = getCountry(countryId) as { wealth: unknown }
  const was = country.wealth
  country.wealth = w
  try {
    return fn()
  } finally {
    country.wealth = was
  }
}

let realGraph: Promise<Graph> | null = null
function graphOnce(): Promise<Graph> {
  realGraph ??= readImportGraph(ROOT)
  return realGraph
}

describe('the leaf and the re-export', () => {
  it('are the same function and the same constant', () => {
    expect(Object.is(typicalIncome, leafIncome)).toBe(true)
    expect(Object.is(countryWealth, leafWealth)).toBe(true)
    expect(US_TYPICAL_INCOME).toBe(45_000)
    expect(leafUs).toBe(US_TYPICAL_INCOME)
  })

  it('give the recorded value for every country and year', () => {
    for (const [id, row] of Object.entries(TABLE)) {
      const seen = YEARS.map((y) => leafIncome(lifeIn('us', 2026), id, y))
      expect(seen, id).toEqual(row)
      expect(YEARS.map((y) => typicalIncome(lifeIn('us', 2026), id, y)), id).toEqual(row)
    }
  })

  it('give the recorded country wealth, and the US figure for an id nobody knows', () => {
    for (const [id, w] of Object.entries(WEALTH)) expect(leafWealth(id), id).toBe(w)
  })

  it('default to the character\'s country and the game\'s year', () => {
    expect(leafIncome(lifeIn('ng', 1950))).toBe(3600)
    expect(leafIncome(lifeIn('ng', 1950), 'ng', 1950)).toBe(3600)
    expect(leafIncome(lifeIn('ng', 1950), 'us')).toBe(18000)
    expect(leafIncome(lifeIn('ng', 1950), 'us', 2026)).toBe(45000)
  })

  it('keep the floor, the 0.08 country floor, the 1.6 income ceiling and the fallback to 1', () => {
    expect(withWealth('cd', 0.01, () => leafWealth('cd'))).toBe(0.08)
    expect(withWealth('cd', 0.01, () => leafIncome(lifeIn('us', 1900), 'cd', 1900))).toBe(1_000)
    expect(withWealth('cd', Number.NaN, () => leafWealth('cd'))).toBe(1)
    expect(withWealth('cd', 'rich', () => leafWealth('cd'))).toBe(1)
    expect(withWealth('cd', 100, () => leafWealth('cd'))).toBe(100)
    expect(withWealth('cd', 100, () => leafIncome(lifeIn('us', 2026), 'cd', 2026))).toBe(72_000)
    expect(leafIncome(lifeIn('cd', 2026))).toBe(5850)
  })

  it('stay finite and bounded at 100 times the largest country wealth', () => {
    const top = Math.max(...Object.values(WEALTH))
    const huge = withWealth('mc', top * 100, () => YEARS.map((y) => leafIncome(lifeIn('mc', y), 'mc', y)))
    for (const v of huge) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeLessThanOrEqual(US_TYPICAL_INCOME * 1.6)
    }
  })
})

describe('where the leaf sits', () => {
  it('is in layer 2, and wealth-core (a domain) is in layer 3', () => {
    expect(layerOf(LEAF)).toBe(2)
    expect(layerOf(CORE)).toBe(3)
  })

  it('imports only world, history/events-people and (as a type) types', () => {
    const src = readFileSync(join(ROOT, LEAF), 'utf8')
    const specs = [...src.matchAll(/^(?:import|export)\b[^\n]*\bfrom\s+'([^']+)'/gm)].map((m) => m[1]).sort()
    expect(specs).toEqual(['../history/events-people', '../types', '../world'])
    expect(src).toMatch(/^import type \{[^}]*\bGameState\b[^}]*\} from '\.\.\/types'/m)
  })

  it('has the runtime edges the layer test sees: the root world.ts and history/events-people.ts, nothing else', async () => {
    const g = await graphOnce()
    expect([...(g.get(LEAF) ?? [])].sort()).toEqual(['src/game/history/events-people.ts', 'src/game/world.ts'])
  })

  it('closes no cycle: nothing the leaf reaches at runtime reaches wealth-core', async () => {
    const g = await graphOnce()
    const seen = new Set<string>()
    const todo = [LEAF]
    while (todo.length > 0) {
      const at = todo.pop()!
      if (seen.has(at)) continue
      seen.add(at)
      todo.push(...(g.get(at) ?? []))
    }
    expect(seen.has(CORE)).toBe(false)
    expect([...seen].every((p) => layerOf(p) <= 2)).toBe(true)
  })

  it('is what wealth-core re-exports, and wealth-core no longer defines the three or imports getCountry', () => {
    const src = readFileSync(join(ROOT, CORE), 'utf8')
    expect(src).toMatch(/export \{ US_TYPICAL_INCOME, countryWealth, typicalIncome \} from '\.\.\/world\/typical-income'/)
    expect(src).not.toMatch(/export (?:const|function) (?:US_TYPICAL_INCOME|countryWealth|typicalIncome)\b/)
    expect(src).not.toMatch(/\bgetCountry\b/)
  })

  it('reads no import while it loads: its one constant is a literal', () => {
    const src = readFileSync(join(ROOT, LEAF), 'utf8')
    expect(src).toMatch(/export const US_TYPICAL_INCOME = 45_000\b/)
    expect(src.split('\n').filter((l) => /^(?:export )?const /.test(l))).toHaveLength(1)
  })
})
