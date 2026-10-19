// Every string the sector families can print, against docs/VOICE.md and the rule helpers of the voice
// report (scripts/voice/rules.mjs). The family copy tables, the desk's own MENU_COPY, the hired CEO's
// letter lines CEO_COPY, the key-role blurbs and the headers of every trade are measured as the game prints
// them: a named hole "${name}" counts for nothing, as in the report, so it is turned back into "${...}"
// before anything is measured. No rule is mocked: the real models are registered by importing the barrel.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIMITS, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { letterWords, LETTER_WORDS } from '../src/game/business/career'
import { CEO_COPY } from '../src/game/business/sector-ceo'
import '../src/game/business/sector-families'
import { SECTOR_ROLES } from '../src/game/business/sector-data'
import { copyLines, registeredModels, sectorText, type CopyTable } from '../src/game/business/sector-kit'
import { deskLines, MENU_COPY } from '../src/game/business/sector-menu'
import { FAMILY_TRADES, type FamilyId, type SectorState } from '../src/game/business/sector-state'
import type { Industry } from '../src/game/data/markets'
import { deskGame } from './sector-kit'

const EM = String.fromCharCode(0x2014)
const EN = String.fromCharCode(0x2013)
const DASHES = new RegExp(`[${EM}${EN}]`)
/** The pattern the plan names for an escaped em-dash in source text. */
const ESCAPED_EM_DASH = /\\u\{?0*2014\}?/i
/** The most a string may hold, in characters of static text (the report's `long`). */
const LONG = 180

/** A copy template turned back into what the voice report measures: every named hole becomes "${...}". */
const template = (text: string): string => text.replace(/\$\{\w+\}/g, '${...}')

interface Line { source: string; key: string; role: string; text: string }

/** Every line of a copy table, tagged with where it comes from. */
function linesOf(source: string, table: CopyTable): Line[] {
  return copyLines(table).map(({ key, role, text }) => ({ source, key, role, text }))
}

const MODELS = registeredModels()
const ALL: Line[] = [
  ...MODELS.flatMap((m) => linesOf(m.family, m.copy)),
  ...linesOf('menu', MENU_COPY),
  ...linesOf('ceo', CEO_COPY),
]

describe('sector copy keeps to the voice guide', () => {
  it('measures every family, the desk and the CEO letter', () => {
    expect(MODELS.map((m) => m.family).sort()).toEqual(['care', 'food', 'util'])
    for (const f of ['food', 'care', 'util']) expect(ALL.filter((l) => l.source === f).length, f).toBeGreaterThan(40)
    expect(ALL.filter((l) => l.source === 'menu').length).toBeGreaterThan(20)
    expect(ALL.filter((l) => l.source === 'ceo').length).toBeGreaterThan(3)
    // A copy key is one string in one table: no key is written twice across the tables.
    const keys = ALL.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    // The roles the key suffixes name all show up.
    expect([...new Set(ALL.map((l) => l.role))].sort()).toEqual(['label', 'log', 'outcome', 'scene', 'title', 'tooltip'])
  })

  it('every string is inside its length cap and has no voice flag', () => {
    for (const { source, key, role, text } of ALL) {
      const where = `${source} ${key}: ${text}`
      const t = template(text)
      expect(text.trim(), where).toBe(text)
      expect(text, where).not.toMatch(DASHES)
      // over-aim only aims; the hard cap per role is checked on its own below.
      expect(unitFlags(t, role).filter((f) => f !== 'over-aim'), where).toEqual([])
      expect(staticLength(t), where).toBeLessThanOrEqual(LONG)
      if (role === 'scene' || role === 'log' || role === 'outcome' || role === 'tooltip') {
        expect(staticLength(t), where).toBeLessThanOrEqual(LIMITS[role])
      }
      if (role === 'scene') expect(text.endsWith('What will you do?'), where).toBe(true)
      if (role === 'label') expect(t.trim().split(/\s+/).length, where).toBeLessThanOrEqual(5)
      if (role === 'title') expect(text.length, where).toBeLessThanOrEqual(40)
    }
  })

  it('a scene ends with the closer and nothing else does', () => {
    for (const { source, key, role, text } of ALL) {
      if (role !== 'scene') expect(text.endsWith('What will you do?'), `${source} ${key}`).toBe(false)
    }
  })

  it('the key-role blurbs are short and clean', () => {
    const blurbs = Object.entries(SECTOR_ROLES)
    expect(blurbs).toHaveLength(18)
    for (const [trade, role] of blurbs) {
      const where = `${trade}: ${role.blurb}`
      expect(role.blurb.length, where).toBeLessThanOrEqual(50)
      expect(role.blurb, where).not.toMatch(DASHES)
      expect(unitFlags(role.blurb, 'tooltip').filter((f) => f !== 'over-aim'), where).toEqual([])
      expect(unitFlags(role.title, 'label'), `${trade}: ${role.title}`).toEqual([])
      expect(role.title.trim().split(/\s+/).length, role.title).toBeLessThanOrEqual(5)
    }
  })
})

describe('the hired CEO letter lines', () => {
  /** The longest lever label and the longest option label of every registered family, over every trade of it. */
  function longest(): { lever: string; setting: string } {
    let lever = ''
    let setting = ''
    for (const m of MODELS) {
      for (const trade of FAMILY_TRADES[m.family]) {
        const { g, a, b } = deskGame(trade as Industry)
        const st = m.seed(g, a, b, g.year)
        for (const l of m.levers) {
          const name = l.label.charAt(0).toLowerCase() + l.label.slice(1)
          if (name.length > lever.length) lever = name
          for (const o of l.options(g, b, st)) if (o.label.length > setting.length) setting = o.label
        }
      }
    }
    return { lever, setting }
  }

  it('fit the 12-word letter line with the longest names and $99.9M', () => {
    const { lever, setting } = longest()
    expect(lever.length).toBeGreaterThan(0)
    expect(setting.length).toBeGreaterThan(0)
    const vals = { lever, setting, cost: '$99.9M', gain: '$99.9M' }
    const lines = copyLines(CEO_COPY)
    expect(lines.length).toBeGreaterThan(0)
    for (const { key, text } of lines) {
      const line = sectorText(CEO_COPY, key, vals)
      // The long forms may be too wide for the longest names: the turn then falls back to a short one.
      if (key === 'ceo.set.log' || key === 'ceo.buy.log') continue
      expect(letterWords(line), `${key}: ${line}`).toBeLessThanOrEqual(LETTER_WORDS)
      expect(line, key).toMatch(/\d/)
      expect(text, key).not.toMatch(/^(Cut|Let|Closed|Retired|Opened|Built)\b/)
    }
  })

  it('give a line of at most 12 words for every lever and setting of every trade', () => {
    // The turn picks the first of the two forms that fits and the fallback after them; one always does.
    const forms: [string, string][] = [['ceo.set.log', 'ceo.setShort.log'], ['ceo.buy.log', 'ceo.buyShort.log']]
    for (const m of MODELS) {
      for (const trade of FAMILY_TRADES[m.family]) {
        const { g, a, b } = deskGame(trade as Industry)
        const st = m.seed(g, a, b, g.year)
        for (const l of m.levers) {
          const name = l.label.charAt(0).toLowerCase() + l.label.slice(1)
          for (const o of l.options(g, b, st)) {
            const vals = { lever: name, setting: o.label, cost: '$99.9M', gain: '$99.9M' }
            for (const keys of forms) {
              const line = [...keys, 'ceo.fallback.log'].map((k) => sectorText(CEO_COPY, k, vals)).find((x) => letterWords(x) <= LETTER_WORDS)
              expect(line, `${trade} ${l.id} ${o.label}`).toBeTruthy()
            }
          }
        }
      }
    }
  })
})

describe('the desk header lines', () => {
  const YEARS = [2024, 2020]

  it('every line of every trade passes the voice rules and fits 140 characters', () => {
    let seen = 0
    const problems: string[] = []
    for (const m of MODELS) {
      const first = deskGame(FAMILY_TRADES[m.family][0] as Industry)
      expect(m.header(first.g, first.b, null)).toEqual([])
      for (const trade of FAMILY_TRADES[m.family]) {
        for (const year of YEARS) {
          const { g, a, b } = deskGame(trade as Industry, { year })
          const seed = m.seed(g, a, b, g.year)
          // The seed record, each option of each lever on its own, and every lever at its first and at its last option.
          const records: SectorState[] = [seed]
          for (const l of m.levers) {
            for (const o of l.options(g, b, seed)) records.push(l.apply(seed, o.value, g.year))
          }
          for (const pick of [() => 0, (n: number) => n - 1]) {
            records.push(m.levers.reduce<SectorState>((st, l) => {
              const opts = l.options(g, b, st)
              return opts.length ? l.apply(st, opts[pick(opts.length)].value, g.year) : st
            }, seed))
          }
          for (const st of records) {
            const lines = m.header(g, b, st)
            expect(lines.length, `${trade} ${year}`).toBeGreaterThan(0)
            for (const line of lines) {
              seen++
              const flags = unitFlags(line, 'text')
              if (line.length > 140 || DASHES.test(line) || flags.length) problems.push(`${trade} ${year}: ${line} [${flags.join(', ')}]`)
            }
          }
        }
      }
    }
    expect([...new Set(problems)]).toEqual([])
    expect(seen).toBeGreaterThan(400)
  })

  it('the desk lines (header, wait line, CEO note) pass the rules too', () => {
    for (const family of ['food', 'care', 'util'] as FamilyId[]) {
      for (const trade of FAMILY_TRADES[family]) {
        const { g, a } = deskGame(trade as Industry)
        const lines = deskLines(g, a)
        expect(lines.length, trade).toBeGreaterThan(0)
        for (const line of lines) {
          expect(line.length, `${trade}: ${line}`).toBeLessThanOrEqual(140)
          expect(unitFlags(line, 'text'), `${trade}: ${line}`).toEqual([])
        }
      }
    }
  })
})

describe('no em-dash in the sector code', () => {
  const dir = join(__dirname, '..', 'src', 'game', 'business')
  const files = readdirSync(dir).filter((f) => /^sector-.*\.ts$/.test(f))

  it('reads every sector source file', () => {
    expect(files.length).toBeGreaterThanOrEqual(12)
  })

  it('holds neither U+2014 nor an escape for it, and no en-dash', () => {
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8')
      expect(body.includes(EM), `${f} holds an em-dash`).toBe(false)
      expect(body.includes(EN), `${f} holds an en-dash`).toBe(false)
      expect(ESCAPED_EM_DASH.test(body), `${f} holds an escaped em-dash`).toBe(false)
    }
  })
})
