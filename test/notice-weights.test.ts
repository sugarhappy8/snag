// R1-T7 (G.11 step 2): the routine-news table. src/game/notice-weights.ts lists the notice titles that carry the minor
// weight without every call site opting in, and notice() (core.ts) tags them. The list is picked by hand from the
// counting probe (test/notice-probe.test.ts, opt-in) and recorded in test/fixtures/notice-probe.json as `chosen`. These
// tests keep the table and the fixture in step and keep the table from going stale. They need no flag: the weight key
// is inert until Quiet Mode routes on it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { notice } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import { neverRoute } from '../src/game/notice-policy'
import { MINOR_NOTICE_TITLES } from '../src/game/notice-weights'
import type { NoticeModal } from '../src/game/types'
import type { ProbeFile } from './play-kit'

const ROOT = join(__dirname, '..')
const fixture = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'notice-probe.json'), 'utf8')) as ProbeFile

/** Every .ts and .tsx source under a folder, as text. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name)) out.push(readFileSync(path, 'utf8'))
  }
  return out
}

/** The ways a title can sit in source as a string literal: quoted with ', " or `, with that quote escaped. */
function literals(title: string): string[] {
  return ["'", '"', '`'].map((q) => `${q}${title.replace(/\\/g, '\\\\').split(q).join(`\\${q}`)}${q}`)
}

function queued(title: string, opts?: { weight?: 'minor' }): NoticeModal {
  const g = createNewLife({ seed: 7, year: 2000 })
  g.queue = []
  notice(g, title, 'x', opts)
  expect(g.queue).toHaveLength(1)
  return g.queue[0] as NoticeModal
}

describe('the counting probe fixture', () => {
  it('parses, sorted by count, at most 60 passive rows with unique titles', () => {
    expect(fixture.v).toBe(1)
    expect(fixture.lives).toBe(13)
    expect(fixture.seeds).toHaveLength(13)
    expect(fixture.passive.length).toBeGreaterThan(0)
    expect(fixture.passive.length).toBeLessThanOrEqual(60)
    for (const row of fixture.passive) {
      expect(typeof row.title).toBe('string')
      expect(typeof row.sample).toBe('string')
      expect(Number.isInteger(row.count) && row.count > 0).toBe(true)
    }
    const counts = fixture.passive.map((r) => r.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    const titles = fixture.passive.map((r) => r.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(fixture.outcome.length).toBeLessThanOrEqual(30)
  })
})

describe('MINOR_NOTICE_TITLES', () => {
  it('equals the chosen list of the fixture and has at most 20 titles', () => {
    expect(MINOR_NOTICE_TITLES).toEqual(new Set(fixture.chosen))
    expect(fixture.chosen.length).toBeGreaterThan(0)
    expect(new Set(fixture.chosen).size).toBe(fixture.chosen.length)
    expect(MINOR_NOTICE_TITLES.size).toBeLessThanOrEqual(20)
  })

  it('takes only frequent passive titles whose sample the never-route policy lets through', () => {
    const top = fixture.passive.slice(0, 40)
    for (const title of fixture.chosen) {
      const row = top.find((r) => r.title === title)
      expect(row, `"${title}" is not in the first 40 passive rows`).toBeDefined()
      const { sample, tone, support } = row!
      expect(neverRoute({ title, text: sample, tone, support }), `"${title}" sample must not be blocked`).toBeNull()
      expect(tone, `"${title}" sample must not be a bad tone`).not.toBe('bad')
    }
  })

  it('names only titles that still occur as a string literal under src/game', () => {
    const files = sources(join(ROOT, 'src', 'game'))
    for (const title of fixture.chosen) {
      const found = files.some((text) => literals(title).some((lit) => text.includes(lit)))
      expect(found, `"${title}" is not a string literal anywhere in src/game`).toBe(true)
    }
  })

  it('has no em-dash or en-dash in a title', () => {
    for (const title of fixture.chosen) expect(title).not.toMatch(/[\u2013\u2014]/)
  })
})

describe('notice() and the table', () => {
  const OTHERS = [
    'Promotion',
    'Rest in Peace',
    'Debt Collectors',
    'Feeling Weak',
    'Divorce',
    'Dumped',
    'Lockdown',
    'Diagnosis',
    'Found',
    'Tsunami',
  ]

  it('tags every chosen title minor, in headless runs too', () => {
    for (const title of fixture.chosen) {
      const m = queued(title)
      expect(m.weight, title).toBe('minor')
      expect(m.title).toBe(title)
    }
  })

  it('leaves any other title without a weight key', () => {
    expect(OTHERS).toHaveLength(10)
    for (const title of OTHERS) {
      expect(MINOR_NOTICE_TITLES.has(title), `${title} must not be chosen for this check`).toBe(false)
      expect(queued(title)).not.toHaveProperty('weight')
    }
  })

  it('honours an explicit minor weight for any title', () => {
    for (const title of [...OTHERS, 'A title nobody uses']) expect(queued(title, { weight: 'minor' }).weight, title).toBe('minor')
  })
})
