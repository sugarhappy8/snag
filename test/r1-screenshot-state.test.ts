// R1-C16: the screenshot harness. scripts/r1-screenshot-state.ts makes, with the real engine, a save whose first popup is
// the Annual Report book; scripts/r1-screenshots.mjs seeds that save into a browser and photographs the book on a phone.
// The lead runs the browser half (Chromium and Vite need ports the test sandbox does not have), so this file covers what
// runs in plain node: the state maker, the bundling of it, the argument parser and the small pure helpers of the script.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildSave, DEFAULTS, loadPlaywright, parseOptions, scrollPositions, shotName, UsageError } from '../scripts/r1-screenshots.mjs'
import { makeReportState } from '../scripts/r1-screenshot-state'
import { companyStrip } from '../src/game/charts/books'
import { readReportCharts } from '../src/game/charts/report'
import { flagOn, resetFlags } from '../src/game/flags'
import { rec } from '../src/game/love'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, MinigameModal } from '../src/game/types'

afterEach(() => {
  resetFlags()
})

const tmp = mkdtempSync(join(tmpdir(), 'r1-screenshots-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const reports = (g: GameState): MinigameModal[] => g.queue.filter((m): m is MinigameModal => m.kind === 'minigame' && m.game === 'annualReport')

describe('makeReportState', () => {
  let g: GameState
  let flagsAfter: { annualReport2: boolean; chartKit: boolean }
  beforeAll(() => {
    g = makeReportState({ seed: 7, years: 6, companies: 2 })
    // Read before any afterEach can tidy the flags for us.
    flagsAfter = { annualReport2: flagOn('annualReport2'), chartKit: flagOn('chartKit') }
  }, 60_000)

  it('queues an Annual Report that carries a chart, and the state loads', () => {
    const first = g.queue[0]
    expect(first?.kind).toBe('minigame')
    if (first?.kind !== 'minigame') throw new Error('the first popup is not a minigame')
    expect(first.game).toBe('annualReport')
    expect(readReportCharts(rec(first.data).chart)).not.toBeNull()
    const saved = migrateSave(JSON.parse(JSON.stringify(g)))
    expect(saved.kind).toBe('ready')
  })

  it('puts nothing but annual reports in the queue, and exactly one of them for two companies', () => {
    expect(g.queue.every((m) => m.kind === 'minigame' && m.game === 'annualReport')).toBe(true)
    expect(reports(g)).toHaveLength(1)
    expect(g.assets.filter((a) => a.kind === 'business')).toHaveLength(2)
    expect(companyStrip(g)).toHaveLength(2)
  })

  it('leaves the build flags as it found them', () => {
    expect(flagsAfter).toEqual({ annualReport2: false, chartKit: false })
  })

  it('throws, with the flags still back, when no seed queues a report', () => {
    expect(() => makeReportState({ seed: 3, years: 0, companies: 1 })).toThrow(/seeds 3 to 12/)
    expect(flagOn('annualReport2')).toBe(false)
  })

  it('refuses a number of companies it cannot found', () => {
    expect(() => makeReportState({ companies: 0 })).toThrow(/companies/)
    expect(() => makeReportState({ companies: 13 })).toThrow(/companies/)
  })
})

describe('buildSave', () => {
  it('bundles the state maker with esbuild, runs it with node and hands back the save of the real harness life', async () => {
    const { json, lifeId } = await buildSave({ seed: DEFAULTS.seed, years: DEFAULTS.years, companies: DEFAULTS.companies })
    const g = JSON.parse(json) as GameState
    expect(g.lifeId).toBe(lifeId)
    expect(g.character.age).toBe(60)
    const saved = migrateSave(g)
    expect(saved.kind).toBe('ready')
    expect(reports(g)).toHaveLength(1)
    const chart = readReportCharts(rec(reports(g)[0]?.data).chart)
    expect(chart).not.toBeNull()
    // Thirty years of books: the profit history the P&L and Cash tabs draw is all there.
    expect(chart?.profit?.series[0]?.values.length).toBeGreaterThanOrEqual(20)
    if (saved.kind === 'ready') expect(companyStrip(saved.game)).toHaveLength(DEFAULTS.companies)
  }, 60_000)
})

describe('parseOptions', () => {
  it('needs --playwright and gives the plan\'s defaults for everything else', () => {
    const o = parseOptions(['--playwright', '/pw'], {})
    expect(o).toMatchObject({
      playwright: '/pw',
      chromium: null,
      url: 'http://localhost:5173/',
      serve: false,
      seed: 7,
      years: 30,
      companies: 3,
      width: 390,
      height: 844,
      narrow: 360,
    })
    expect(o.out).toBe(DEFAULTS.out)
    expect(() => parseOptions([], {})).toThrow(UsageError)
  })

  it('takes every option, and the Chromium path from PW_CHROMIUM unless --chromium names one', () => {
    const argv = ['--playwright', '/pw', '--url', 'https://example.test:8443/app/', '--out', '/o', '--seed', '9', '--years', '12', '--companies', '2', '--width', '412', '--height', '915', '--narrow', '320']
    expect(parseOptions(argv, {})).toMatchObject({ url: 'https://example.test:8443/app/', out: '/o', seed: 9, years: 12, companies: 2, width: 412, height: 915, narrow: 320 })
    expect(parseOptions(['--playwright', '/pw'], { PW_CHROMIUM: '/env/chrome' }).chromium).toBe('/env/chrome')
    expect(parseOptions(['--playwright', '/pw', '--chromium', '/flag/chrome'], { PW_CHROMIUM: '/env/chrome' }).chromium).toBe('/flag/chrome')
    expect(parseOptions(['--playwright', '/pw', '--serve'], {}).serve).toBe(true)
  })

  it('refuses what it cannot use, with a UsageError that says which option', () => {
    const bad = (...rest: string[]): void => {
      expect(() => parseOptions(['--playwright', '/pw', ...rest], {})).toThrow(UsageError)
    }
    bad('--bogus')
    bad('--seed', 'x')
    bad('--seed', '-1')
    bad('--years', '0')
    bad('--years', '201')
    bad('--companies', '0')
    bad('--companies', '13')
    bad('--width', '200')
    bad('--height', '99999')
    bad('--narrow', '10')
    bad('--url', 'ftp://example.test/')
    bad('--url', 'not a url')
    bad('--serve', '--url', 'http://localhost:5173/')
    expect(() => parseOptions(['--playwright', '/pw', '--years', '0'], {})).toThrow(/--years/)
  })
})

describe('scrollPositions', () => {
  it('is one position when the panel fits, and otherwise starts at the top and ends at the bottom', () => {
    expect(scrollPositions(600, 700)).toEqual([0])
    expect(scrollPositions(700, 700)).toEqual([0])
    const p = scrollPositions(2000, 700)
    expect(p[0]).toBe(0)
    expect(p[p.length - 1]).toBe(1300)
    expect(p).toEqual([...p].sort((a, b) => a - b))
    for (let i = 1; i < p.length; i++) expect(p[i]! - p[i - 1]!).toBeLessThanOrEqual(700)
  })

  it('never makes more than the cap, and never an odd number from a bad measurement', () => {
    expect(scrollPositions(100_000, 700, 4)).toHaveLength(4)
    expect(scrollPositions(100_000, 700).length).toBeLessThanOrEqual(6)
    expect(scrollPositions(Number.NaN, 700)).toEqual([0])
    expect(scrollPositions(2000, 0)).toEqual([0])
    expect(scrollPositions(-5, -5)).toEqual([0])
  })
})

describe('shotName', () => {
  it('names the first view of a tab r1-<scheme>-<tab>.png and the later ones with the step', () => {
    expect(shotName('light', 'summary')).toBe('r1-light-summary.png')
    expect(shotName('dark', 'pl')).toBe('r1-dark-pl.png')
    expect(shotName('dark', 'cash', 2)).toBe('r1-dark-cash-3.png')
    expect(shotName('light', 'pl', 0, true)).toBe('r1-light-narrow-pl.png')
  })
})

describe('loadPlaywright', () => {
  function fakePackage(root: string, name: string): void {
    const dir = join(root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }))
    writeFileSync(join(dir, 'index.js'), `module.exports = { chromium: { launch() {} }, from: ${JSON.stringify(name)} }\n`)
  }

  it('finds playwright-core in the node_modules of the folder it is given, or playwright, and prefers playwright', () => {
    const core = join(tmp, 'core-only')
    fakePackage(core, 'playwright-core')
    expect((loadPlaywright(core) as unknown as { from: string }).from).toBe('playwright-core')
    const both = join(tmp, 'both')
    fakePackage(both, 'playwright-core')
    fakePackage(both, 'playwright')
    expect((loadPlaywright(both) as unknown as { from: string }).from).toBe('playwright')
  })

  it('also takes the package folder itself', () => {
    const root = join(tmp, 'direct')
    fakePackage(root, 'playwright-core')
    expect((loadPlaywright(join(root, 'node_modules', 'playwright-core')) as unknown as { from: string }).from).toBe('playwright-core')
  })

  it('says where it looked when there is nothing there', () => {
    const empty = join(tmp, 'empty')
    mkdirSync(empty, { recursive: true })
    expect(() => loadPlaywright(empty)).toThrow(UsageError)
    expect(() => loadPlaywright(empty)).toThrow(/playwright/)
  })
})
