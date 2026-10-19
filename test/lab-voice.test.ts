// R&D 3.0 text against docs/VOICE.md, through the same rule helper the voice report uses
// (scripts/voice/rules.mjs unitFlags and staticLength): the life-log lines are role 'log' (cap 90), the
// notices and the one reason a row can't run are outcomes (cap 120), the rows and hints of the screen are
// tooltips (cap 120). A hole (a name, a price, a number) counts for nothing, as in the report, so every
// text is measured as its template: built with empty pieces and with "${...}" holes, and, for the texts
// of a played story, turned back into the template from the values that were poured into them.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BANNED_ANYWHERE, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { opsProgram } from '../src/game/business/lab-data'
import { opsPrice, patentTerms } from '../src/game/business/lab-rules'
import { readLab } from '../src/game/business/lab-state'
import { LAB_LABEL, LAB_LOG, LAB_SAY, LAB_STATEMENT, LAB_TIP, type Say } from '../src/game/business/lab-text'
import { doHire, doLicense, doOps, doPatent, doRelease } from '../src/game/business/lab-year'
import { money, plural } from '../src/game/business/util'
import type { GameState } from '../src/game/types'
import { labGame, launchBreakthrough, PATENT_COUNTRY, PATENT_TRADE } from './lab-kit'
import { nextYear } from './market-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Typed with String.fromCharCode so that this file carries neither character itself.
const EM = String.fromCharCode(0x2014)
const EN = String.fromCharCode(0x2013)
const HOLE = '${...}'
const BANNED = ['Good call', 'Feel free', 'Consider', 'You might want to', "Let's", 'Welcome to']

const TABLES = [
  { name: 'LAB_LOG', table: LAB_LOG, role: 'log', cap: 90 },
  { name: 'LAB_SAY', table: LAB_SAY, role: 'outcome', cap: 120 },
  { name: 'LAB_TIP', table: LAB_TIP, role: 'tooltip', cap: 120 },
] as const

/** The text with each value that was poured into it put back as a "${...}" hole. */
function template(text: string, values: readonly string[]): string {
  return [...values].sort((x, y) => y.length - x.length).reduce((t, v) => (v ? t.split(v).join(HOLE) : t), text)
}

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

function noticeText(g: GameState, title: string): string {
  const n = g.queue.find((m) => m.kind === 'notice' && m.title === title)
  return n && n.kind === 'notice' ? n.text : ''
}

describe('R&D 3.0 text keeps to the voice guide', () => {
  it('every template fits its cap and passes the voice rules', () => {
    let seen = 0
    for (const { name, table, role, cap } of TABLES) {
      for (const [key, say] of Object.entries(table) as [string, Say][]) {
        // Built with empty pieces and with holes: the static text is what the report measures either way.
        for (const fill of ['', HOLE]) {
          const t = say(fill, fill, fill, fill, fill, fill)
          // A template that is all holes (the ledger with nothing to say) has no static text to judge.
          if (!t.trim()) continue
          seen++
          expect(staticLength(t), `${name}.${key} length`).toBeLessThanOrEqual(cap)
          expect(unitFlags(t, role), `${name}.${key}`).toEqual([])
          expect(t.includes(EM) || t.includes(EN), `${name}.${key} dash`).toBe(false)
          for (const phrase of [...BANNED, ...BANNED_ANYWHERE]) expect(t.includes(phrase), `${name}.${key} says "${phrase}"`).toBe(false)
        }
      }
    }
    // Every table was really walked: each template at least once with holes, and most of them with empty pieces too.
    expect(seen).toBeGreaterThan(Object.keys(LAB_LOG).length + Object.keys(LAB_SAY).length + Object.keys(LAB_TIP).length)
  })

  it('the labels carry no dash and none of the banned phrases', () => {
    const labels = [LAB_LABEL.group, LAB_LABEL.ops, LAB_LABEL.team, LAB_LABEL.hire, LAB_LABEL.release, LAB_LABEL.hireVote, LAB_LABEL.releaseVote, LAB_LABEL.patents, LAB_LABEL.license(HOLE), LAB_LABEL.patentVote(HOLE, HOLE), ...Object.values(LAB_LABEL.tier), ...Object.values(LAB_LABEL.track), ...Object.values(LAB_STATEMENT)]
    for (const text of labels) {
      expect(text.includes(EM) || text.includes(EN), text).toBe(false)
      for (const phrase of BANNED) expect(text.includes(phrase), `${text} says "${phrase}"`).toBe(false)
    }
  })

  it('the statement labels are the three named in the spec', () => {
    expect(LAB_STATEMENT).toEqual({ credit: 'R&D tax credit and grants', royalty: 'Patent licences', payroll: 'Research team' })
  })

  it('no R&D 3.0 source or test carries an em-dash or an en-dash', () => {
    const files = [
      ...['data', 'state', 'rules', 'year', 'text', 'menu'].map((x) => `src/game/business/lab-${x}.ts`),
      ...['kit.ts', 'state.test.ts', 'credit.test.ts', 'ops.test.ts', 'team.test.ts', 'patents.test.ts', 'hints.test.ts', 'story.test.ts', 'voice.test.ts'].map((x) => `test/lab-${x}`),
      'test/rd-tier.test.ts',
      'test/rival-rise.test.ts',
    ]
    for (const f of files) {
      const text = readFileSync(`${ROOT}${f}`, 'utf8')
      expect(text.includes(EM), `${f} has an em-dash`).toBe(false)
      expect(text.includes(EN), `${f} has an en-dash`).toBe(false)
    }
  })

  it('real texts of a played story fit as templates', () => {
    // A restaurant in Canada (a low-tech trade with a grant): hires a scientist, starts a program, wins or flops,
    // lets the scientist go after the minimum service, patents a launched breakthrough, licenses it and plays
    // on until the patent runs out. Every notice and every life-log line is turned back into its template.
    const { g, a, b } = labGame(41, 'restaurant', { country: 'ca' })
    const id = 'ops.cost.1'
    const def = opsProgram(id)!
    g.queue = []
    expect(doHire(g, a)).toBe(true)
    expect(doOps(g, a, id)).toBe(true)
    const program = readLab(b).programs[0]
    const opsNote = noticeText(g, 'Operations R&D')
    expect(opsNote).toContain(a.name)
    expect(opsNote).toContain(def.label)
    const opsValues = [a.name, def.label, money(opsPrice(b, def.rung)), plural(program.years, 'year'), String(Math.round(program.odds * 100))]

    for (let n = 0; n < 3; n++) nextYear(g)
    expect(readLab(b).programs).toEqual([])
    expect(doRelease(g, a)).toBe(true)

    const family = launchBreakthrough(g, a, b)
    g.queue = []
    const terms = patentTerms(g, b, family)
    expect(doPatent(g, a, family)).toBe(true)
    const patentNote = noticeText(g, 'Patent Filed')
    expect(patentNote).toContain(family)
    const patentValues = [a.name, family, String(terms.years), money(terms.fee)]
    g.queue = []
    expect(doLicense(g, a, family)).toBe(true)
    const licenseNote = noticeText(g, 'Licensed')
    const patent = readLab(b).patents[0]
    expect(licenseNote).toContain(family)
    const licenseValues = [family, String(patent.lic), String(patent.until)]

    let royalty = 0
    for (let n = 0; n < 12 && readLab(b).patents.length > 0; n++) {
      nextYear(g)
      const row = readLab(b).ledger.find((r) => r.year === g.year - 1)
      if (!royalty && row && row.royalty > 0) royalty = row.royalty
    }
    expect(readLab(b).patents).toEqual([])

    // The notices are outcomes: 120 at most, and clean under the report's own rules.
    for (const [text, values] of [[opsNote, opsValues], [patentNote, patentValues], [licenseNote, licenseValues]] as const) {
      const t = template(text, values)
      expect(staticLength(t), t).toBeLessThanOrEqual(120)
      expect(unitFlags(t, 'outcome'), t).toEqual([])
    }

    // The life-log lines of the lab: the named ones must all have been written, and each fits as a template.
    const grant = readLab(b).ledger.reduce((sum, r) => sum + r.grant, 0) || program.grant
    const values = [a.name, def.label, family, money(grant), money(royalty), money(program.grant)]
    const played = lines(g).filter((x) => x.includes(a.name) && (x.includes(def.label) || x.includes(family) || /research (scientist|grant)/.test(x) || /royalt/.test(x)))
    for (const expected of [LAB_LOG.hired(a.name), LAB_LOG.started(a.name, def.label), LAB_LOG.released(a.name), LAB_LOG.patented(a.name, family), LAB_LOG.licensed(a.name, family), LAB_LOG.expired(a.name, family)]) expect(played, expected).toContain(expected)
    expect(played.some((x) => x === LAB_LOG.worked(a.name, def.label) || x === LAB_LOG.failed(a.name, def.label))).toBe(true)
    expect(played.some((x) => x.includes('research grant'))).toBe(true)
    for (const text of played) {
      const t = template(text, values)
      expect(staticLength(t), t).toBeLessThanOrEqual(90)
      expect(unitFlags(t, 'log'), t).toEqual([])
    }
  }, 120_000)

  it('the first royalty line of a played licence fits as a template', () => {
    // A mid-tech company in Canada whose breakthrough takes 4 years: its shield outlasts the first rivals' arrival, so a royalty is paid.
    const { g, a, b } = labGame(71, PATENT_TRADE, { country: PATENT_COUNTRY })
    const family = launchBreakthrough(g, a, b)
    expect(doPatent(g, a, family)).toBe(true)
    expect(doLicense(g, a, family)).toBe(true)
    let royalty = 0
    for (let n = 0; n < 12 && readLab(b).patents.length > 0; n++) {
      nextYear(g)
      const row = readLab(b).ledger.find((r) => r.year === g.year - 1)
      if (!royalty && row && row.royalty > 0) royalty = row.royalty
    }
    expect(royalty).toBeGreaterThan(0)
    const first = lines(g).filter((x) => x.includes('in royalties'))
    expect(first).toEqual([LAB_LOG.royalty(a.name, money(royalty), family)])
    const t = template(first[0], [a.name, family, money(royalty)])
    expect(staticLength(t), t).toBeLessThanOrEqual(90)
    expect(unitFlags(t, 'log'), t).toEqual([])
  }, 120_000)
})
