import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { benchHard } from '../src/game/business/ai-bench'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { labStanding, marketYear } from '../src/game/business/ai-bench-market'
import { benchRows, benchSeries, firstRows, marketNote } from '../src/game/business/deeptech-bench'
import { deepTechSummaryImpl } from '../src/game/business/deeptech-menu'
import { techReportData } from '../src/game/business/deeptech-sim'
import type { AiModel } from '../src/game/business/deeptech-state'
import type { MenuGroup, MenuNode } from '../src/game/types'
import { lab, menuText, node, offBest, priors, rated, type Lab } from './ai-bench-kit'

const rows = (L: Lab): MenuNode[] => (node(L.g, L.a, 'dt.bench') as MenuGroup).children(L.g)
const txt = (n: MenuNode, g: Lab['g']): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : n.label)
/** A lab in `year` (default 2027, so the menus read 2026, the year the test models are rated in) holding `models(fam)`. */
const make = (models: (fam: string) => AiModel[], year = 2027): Lab => { const L = lab({}, year); L.t.models = models(L.fam); return L }

describe('the Benchmarks menu', () => {
  it('lists the header, the overall row, one row per open capability, firsts and the research menu, at most 16 rows', () => {
    const L = make((f) => [rated(f, 1, 2024, offBest(f, 2024, 0)), rated(f, 2, 2026, offBest(f, 2026, 30))]), r = rows(L), t = r.map((n) => txt(n, L.g)), s = labStanding(L.fam, L.t, 2026)!
    expect(r.length).toBeLessThanOrEqual(16); expect(t[0]).toBe("Scores are your best released model on 2026's tests. Tests get harder near the top, so a score can fall while your model doesn't change.")
    expect(t[1]).toMatch(/^Overall \d+\. Market \d+, best \d+, rank \d+ of \d+\. [↗→↘] [▁-█]+$/); expect(t.filter((x) => /^(Language|Coding|Vision|Speech|Reasoning and math|Agents|Robotics control|Science) \d+\. Market \d+, best \d+, rank \d+ of \d+\./.test(x))).toHaveLength(8)
    expect(t.includes(`Best lab: ${s.leader!.name} (modeled).`)).toBe(s.leader!.modeled); const research = r[r.length - 1] as MenuGroup
    expect([research.type, research.label, research.children(L.g).map((n) => n.id)]).toEqual(['menu', 'Research', CAP_IDS.map((c) => `dt.rd.cap.${c}.${L.a.id}`)])
  })
  it('moves the capability tracks out of Start a program into Research and points to Benchmarks', () => {
    const L = make((f) => [rated(f, 1, 2026, offBest(f, 2026, 0))]), kids = (node(L.g, L.a, 'dt.lab') as MenuGroup).children(L.g)
    expect(kids.some((n) => n.id.startsWith('dt.rd.cap.'))).toBe(false); expect(kids.some((n) => n.type === 'info' && txt(n, L.g) === 'Capability research is under Benchmarks.')).toBe(true)
  })
  it('renders for no model, an unrated model, 2011 and a model older than a capability, with no NaN, no em-dash and short rows', () => {
    const cases = [make(() => []), make(() => priors(2)), make(() => priors(1, 1999), 2000), make((f) => [rated(f, 1, 2011, {})], 2012), make((f) => [rated(f, 1, 2016, { language: 700, vision: 800 })])]
    for (const L of cases) { const t = rows(L).map((n) => txt(n, L.g)); expect(t.length).toBeLessThanOrEqual(16); t.forEach((x, i) => { expect(x).not.toMatch(/NaN|undefined|Infinity|\[object|[\u2014\u2013]/); expect(x.length).toBeLessThanOrEqual(i === 0 ? 140 : 110) }) }
    expect(rows(cases[2]).map((n) => txt(n, cases[2].g))).toEqual(['No benchmark exists yet.']); expect(rows(cases[1]).map((n) => txt(n, cases[1].g))).toContain('Train a model to see where it ranks.')
    expect(rows(cases[4]).map((n) => txt(n, cases[4].g)).some((x) => /^Coding 0\. Market \d+, best \d+, rank (\d+) of \1\./.test(x))).toBe(true)
  })
  it('builds from the saved state alone at every stage: no dice, no writes', () => {
    for (const stage of [0, 1, 2, 3, 4]) { const L = lab({ stage }); if (stage) L.t.models = [rated(L.fam, 1, 2026, offBest(L.fam, 2026, 0))]; const before = JSON.stringify(L.g), rng = L.g.rng; menuText(L.g, L.a); expect([JSON.stringify(L.g), L.g.rng], `stage ${stage}`).toEqual([before, rng]) }
  })
})
describe('series, firsts and trend', () => {
  it('derives the series from the models, at most 12 years, with a spark per row', () => {
    const f = 'test-life', t = { models: [rated(f, 1, 2014, offBest(f, 2014, 0)), rated(f, 2, 2020, offBest(f, 2020, 20))] }
    expect([benchSeries(f, t, 2026).length, benchSeries(f, t, 2026, 'coding').length, benchSeries(f, { models: [] }, 2026), benchSeries(f, { models: [rated(f, 1, 2025, offBest(f, 2025, 0))] }, 2026).length]).toEqual([12, 12, [], 2])
  })
  it('shows held and passed firsts, three rows at most, and never a market year that is still ahead', () => {
    const f = 'test-life', t = { models: [rated(f, 1, 2026, offBest(f, 2026, 0))] }, claims = { 'language.1': { year: 2026, lab: 'Test Lab' } }
    const now = firstRows(f, t, 2026, claims).map((r) => r.text); expect(now[0]).toBe('First to 1300 in language: you, 2026.'); expect(now.length).toBeLessThanOrEqual(3); expect(now.some((x) => /^Open: \d+ in [a-z ]+\. No lab has reached it\.$/.test(x))).toBe(true)
    for (const x of now) expect(x).not.toContain(String(marketYear(f, 'language', 2)))
    expect(firstRows(f, t, 2031, {}).map((r) => r.text).some((x) => /^A rival reached \d+ in [a-z ]+ in 20\d\d\.$/.test(x))).toBe(true)
  })
  it('a retired generation lowers a score but not the arrow', () => {
    const f = 'test-life'; let y = 2014; while (benchHard(f, 'language', y) <= benchHard(f, 'language', y - 1)) y++
    const m = rated(f, 1, y - 2, offBest(f, y - 2, 0)), S = (yr: number) => benchRows(f, { models: [m] }, yr).find((r) => r.id === 'language')!.text, n = (s: string) => Number(/^Language (\d+)\./.exec(s)![1])
    expect(n(S(y))).toBeLessThan(n(S(y - 1))); expect(S(y)).toContain('→')
  })
})
describe('the other lines share one source', () => {
  it('deeptech-bench.ts reads no game year, dice or clock', () => { expect(readFileSync(new URL('../src/game/business/deeptech-bench.ts', import.meta.url), 'utf8')).not.toMatch(/\bg\.(year|rng)\b|\brand\(|\bchance\(|Math\.random|Date\.now/) })
  it('rewrites the Compute & Models line, the Annual Report note and the profile clause, and keeps legacy wording for unrated models', () => {
    const L = make((f) => [rated(f, 4, 2026, offBest(f, 2026, 0), { name: 'Nova 4' })]), all = menuText(L.g, L.a)
    expect(all.some((x) => /^Benchmarks as of 2026\. Nova 4 scores \d+, the best rival scores \d+\. You rank \d+ of \d+\. Competitiveness \d+%\.$/.test(x))).toBe(true)
    const note = marketNote(L.fam, L.t, 2026); expect(note).toMatch(/^Nova 4 scores \d+; the best rival scores \d+\. You rank \d+ of \d+\.$/); expect(note.length).toBeLessThan(100); expect(techReportData(L.g, L.a, L.b).marketNote).toContain(note)
    expect(deepTechSummaryImpl(L.g, L.a)).toMatch(/best model Nova 4 \(score \d+, rank \d+ of \d+\)/)
    const O = lab({ models: [{ gen: 1, name: 'Vega 1', score: 40, open: false, year: 2000 }] }, 2000)
    expect(menuText(O.g, O.a)).toContain('The frontier: about 40/100 and rising. Your best, Vega 1, scores 40 (competitiveness 100%).'); expect(deepTechSummaryImpl(O.g, O.a)).toContain('best model Vega 1 (score 40)')
  })
})
