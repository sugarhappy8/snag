// ci: fast
// R2-C: the written list of every test the wave-0 rebaseline moved (docs/superpowers/plans/2026-10-21-r2-v5.0.0/moved-seeds.md).
// The rebaseline took the text draws off g.rng, so seeded lives play differently once; each test that had to change is one row
// with the old and the new situation and the reason. This test parses the table and keeps it honest:
//   - the file of every row exists and holds the test (each segment of the cut name is in the file's text);
//   - the kind is one of design, seed, number, text, bug; no cell is over its cap (test 80, before 80, after 80, why 120);
//   - a design or number row names the rule that moved it (text draws left g.rng, ids no longer shift);
//   - a seed row's file has no `seed: <digits>` line (the pin ratchet's own pattern) and finds its life: it contains findSeed( or
//     findSeeds( (the kit's plural form), or, for the fix the plan itself files under seed (a loop over makeTestGame seeds shares
//     one lifeId, so text no longer varies by seed), the row says lifeId and the file assigns .lifeId;
//   - no U+2014 or U+2013 anywhere; the totals line matches the rows (distinct files, and rows); the Bugs found table names files
//     that exist and covers the file of every bug row.
// The checker is a function of the document text and a file reader, so the last block proves that each rule can fail.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './scan-kit'

const DOC = 'docs/superpowers/plans/2026-10-21-r2-v5.0.0/moved-seeds.md'
const KINDS = ['design', 'seed', 'number', 'text', 'bug']
const CAPS = { test: 80, before: 80, after: 80, why: 120 }
const MAIN_HEADER = ['file', 'test', 'kind', 'before', 'after', 'why']
const BUGS_HEADER = ['file', 'what', 'fixed in']
const TITLE = '# R2 wave 0: tests that moved'
const SUMMARY = /^Rebaseline commit: [0-9a-f]{7,40}\. Recipe: wave0\.md, task R2-C\. Totals: (\d+) files, (\d+) tests\.$/
/** The pin ratchet's pattern (test/seed-pins.test.ts), per line. */
const PIN = /\bseed:\s*\d+/
const RULE_NAMED = /text draws left g\.rng|ids no longer shift|text stream|text cursor/
const DASHES = /[–—]/

interface Files {
  has(path: string): boolean
  read(path: string): string
}

function cells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** The header and the rows of the first table in `lines` (the separator line is checked and dropped). */
function tableOf(lines: string[], problems: string[], name: string): { header: string[]; rows: string[][] } {
  const rows = lines.filter((l) => l.startsWith('|'))
  if (rows.length < 2) {
    problems.push(`${name}: no table found`)
    return { header: [], rows: [] }
  }
  if (!/^\|(\s*:?-+:?\s*\|)+$/.test(rows[1]!)) problems.push(`${name}: the second line is not the |---| separator`)
  return { header: cells(rows[0]!), rows: rows.slice(2).map(cells) }
}

/** Every problem of a moved-seeds document, as a sentence each; an empty list means the document holds. */
function check(doc: string, files: Files): string[] {
  const problems: string[] = []
  if (DASHES.test(doc)) problems.push('the document has an em-dash or en-dash character')
  const lines = doc.split('\n')
  if (lines[0] !== TITLE) problems.push(`the first line must be "${TITLE}"`)
  const summary = SUMMARY.exec(lines[1] ?? '')
  if (!summary) problems.push('the second line must read "Rebaseline commit: <sha>. Recipe: wave0.md, task R2-C. Totals: <n> files, <n> tests."')
  const split = lines.findIndex((l) => l === '## Bugs found')
  if (split < 0) problems.push('the "## Bugs found" section is missing')
  const main = tableOf(split < 0 ? lines : lines.slice(0, split), problems, 'the main table')
  const bugs = tableOf(split < 0 ? [] : lines.slice(split), problems, 'the Bugs found table')
  if (main.header.join('|') !== MAIN_HEADER.join('|')) problems.push(`the main table header must be: ${MAIN_HEADER.join(' | ')}`)
  if (bugs.header.join('|') !== BUGS_HEADER.join('|')) problems.push(`the Bugs found header must be: ${BUGS_HEADER.join(' | ')}`)

  const seen = new Set<string>()
  const bugFiles = new Set<string>()
  main.rows.forEach((row, i) => {
    const [file = '', test = '', kind = '', before = '', after = '', why = ''] = row
    const tag = `row ${i + 1} (${file})`
    if (row.length !== MAIN_HEADER.length) {
      problems.push(`${tag}: ${row.length} cells, expected ${MAIN_HEADER.length}`)
      return
    }
    if (row.some((c) => c === '')) problems.push(`${tag}: an empty cell`)
    if (seen.has(`${file}\n${test}`)) problems.push(`${tag}: listed twice (${test})`)
    seen.add(`${file}\n${test}`)
    if (!KINDS.includes(kind)) problems.push(`${tag}: kind "${kind}" is not one of ${KINDS.join(', ')}`)
    for (const [name, cell, cap] of [['test', test, CAPS.test], ['before', before, CAPS.before], ['after', after, CAPS.after], ['why', why, CAPS.why]] as const) {
      if (cell.length > cap) problems.push(`${tag}: ${name} is ${cell.length} characters, the cap is ${cap}`)
    }
    if (!files.has(file)) {
      problems.push(`${tag}: the file does not exist`)
      return
    }
    const src = files.read(file)
    for (const part of test.split(' > ')) if (!src.includes(part)) problems.push(`${tag}: "${part}" is not in the file`)
    if ((kind === 'design' || kind === 'number') && !RULE_NAMED.test(why)) problems.push(`${tag}: a ${kind} row names the rule that moved it (text draws left g.rng, ids no longer shift)`)
    if (kind === 'bug') bugFiles.add(file)
    if (kind === 'seed') {
      const pins = src.split('\n').filter((l) => PIN.test(l)).length
      if (pins > 0) problems.push(`${tag}: a seed row's file still has ${pins} line(s) with seed: <digits>`)
      const finds = /\bfindSeeds?\(/.test(src)
      const lifeId = /lifeId/.test(after) && /\.lifeId\s*=/.test(src)
      if (!finds && !lifeId) problems.push(`${tag}: a seed row's file has no findSeed( and the row names no lifeId fix`)
    }
  })

  const covered = new Set<string>()
  bugs.rows.forEach((row, i) => {
    const [file = '', what = '', fixedIn = ''] = row
    const tag = `bug row ${i + 1} (${file})`
    if (row.length !== BUGS_HEADER.length || row.some((c) => c === '')) {
      problems.push(`${tag}: needs exactly ${BUGS_HEADER.length} filled cells`)
      return
    }
    covered.add(file)
    if (!files.has(file)) problems.push(`${tag}: the file does not exist`)
    const path = fixedIn.replace(/\s*\(.*\)$/, '')
    if (!files.has(path)) problems.push(`${tag}: "${path}" (fixed in) does not exist`)
    if (what.length > CAPS.why) problems.push(`${tag}: what is over ${CAPS.why} characters`)
  })
  for (const f of bugFiles) if (!covered.has(f)) problems.push(`${f}: a bug row has no entry in Bugs found`)

  if (summary) {
    const distinct = new Set(main.rows.map((r) => r[0])).size
    if (Number(summary[2]) !== main.rows.length) problems.push(`Totals say ${summary[2]} tests, the table has ${main.rows.length} rows`)
    if (Number(summary[1]) !== distinct) problems.push(`Totals say ${summary[1]} files, the table names ${distinct}`)
  }
  return problems
}

const real: Files = { has: (p) => existsSync(join(ROOT, p)), read: (p) => readFileSync(join(ROOT, p), 'utf8') }

describe('moved-seeds.md', () => {
  it('is in the plan format, and every row still holds', () => {
    expect(existsSync(join(ROOT, DOC))).toBe(true)
    const doc = readFileSync(join(ROOT, DOC), 'utf8')
    expect(check(doc, real)).toEqual([])
    expect(doc.split('\n').filter((l) => l.startsWith('| test/')).length).toBeGreaterThan(0)
  })
})

describe('the moved-seeds checker', () => {
  const FILES: Record<string, string> = {
    'test/a.test.ts': "describe('block', () => { it('finds a life', () => { findSeed(pred) }) })",
    'test/b.test.ts': "describe('loops', () => { it('varies by life', () => { g.lifeId = `x-${seed}` }) })",
    // Built by a join: a literal pin in this file would count against the ratchet in test/seed-pins.test.ts.
    'test/c.test.ts': `describe('pins', () => { it('still pinned', () => { run({ ${['seed', '226'].join(': ')} }) }) })`,
    'test/d.test.ts': "describe('plain', () => { it('has no finder', () => { run(1) }) })",
    'src/x.ts': 'export {}',
  }
  const files: Files = { has: (p) => p in FILES, read: (p) => FILES[p] ?? '' }

  /** A document with the given main rows (cells joined for you) and Bugs found rows. */
  function doc(rows: string[][], bugs: string[][] = [['test/a.test.ts', 'what broke', 'src/x.ts']], totals?: string): string {
    const row = (r: string[]) => `| ${r.join(' | ')} |`
    const nFiles = new Set(rows.map((r) => r[0])).size
    return [
      TITLE,
      totals ?? `Rebaseline commit: 20071a3. Recipe: wave0.md, task R2-C. Totals: ${nFiles} files, ${rows.length} tests.`,
      '',
      row(MAIN_HEADER),
      '|---|---|---|---|---|---|',
      ...rows.map(row),
      '',
      '## Bugs found',
      row(BUGS_HEADER),
      '|---|---|---|',
      ...bugs.map(row),
      '',
    ].join('\n')
  }
  const good = ['test/a.test.ts', 'block > finds a life', 'seed', 'one pinned seed', 'findSeed(alive)', 'text draws left g.rng']
  /** The good row with some cells replaced, by column index. */
  const with_ = (over: Record<number, string>): string[] => good.map((c, j) => over[j] ?? c)

  it('accepts a table that follows the plan', () => {
    expect(check(doc([good]), files)).toEqual([])
    expect(check(doc([with_({ 2: 'bug' })]), files)).toEqual([])
  })

  it('accepts the lifeId fix the plan files under seed, and the plural finder', () => {
    expect(check(doc([['test/b.test.ts', 'loops > varies by life', 'seed', 'one lifeId', "g.lifeId = 'x-' + seed", 'text draws left g.rng']]), files)).toEqual([])
    FILES['test/e.test.ts'] = "it('plural', () => { findSeeds(pred, 4) })"
    expect(check(doc([['test/e.test.ts', 'plural', 'seed', 'a pinned list', 'findSeeds(pred, 4)', 'text draws left g.rng']]), files)).toEqual([])
    delete FILES['test/e.test.ts']
  })

  it('rejects each way a row can be wrong', () => {
    const bad = (rows: string[][], bugs?: string[][], totals?: string) => check(doc(rows, bugs, totals), files).join('\n')
    expect(bad([with_({ 0: 'test/zz-missing.test.ts' })])).toMatch(/does not exist/)
    expect(bad([with_({ 1: 'block > never written' })])).toMatch(/is not in the file/)
    expect(bad([with_({ 2: 'guess' })])).toMatch(/is not one of/)
    expect(bad([with_({ 3: 'x'.repeat(81) })])).toMatch(/before is 81 characters/)
    expect(bad([with_({ 4: 'x'.repeat(81) })])).toMatch(/after is 81 characters/)
    expect(bad([with_({ 5: 'y'.repeat(121) })])).toMatch(/why is 121 characters/)
    expect(bad([with_({ 1: 'z'.repeat(81) })])).toMatch(/test is 81 characters/)
    expect(bad([with_({ 0: 'test/c.test.ts', 1: 'pins > still pinned' })])).toMatch(/still has 1 line/)
    expect(bad([with_({ 0: 'test/d.test.ts', 1: 'plain > has no finder' })])).toMatch(/no findSeed\( and the row names no lifeId fix/)
    expect(bad([with_({ 0: 'test/d.test.ts', 1: 'plain > has no finder', 4: 'lifeId' })])).toMatch(/no findSeed\(/)
    expect(bad([with_({ 2: 'number', 5: 'because it moved' })])).toMatch(/names the rule/)
    expect(bad([with_({ 2: 'design', 5: 'because it moved' })])).toMatch(/names the rule/)
    expect(bad([good, good])).toMatch(/listed twice/)
    expect(bad([with_({ 5: `text draws left g.rng ${String.fromCharCode(0x2014)} gone` })])).toMatch(/em-dash or en-dash/)
    expect(bad([with_({ 5: `text draws left g.rng ${String.fromCharCode(0x2013)} gone` })])).toMatch(/em-dash or en-dash/)
    expect(bad([good], undefined, 'Rebaseline commit: 20071a3. Recipe: wave0.md, task R2-C. Totals: 1 files, 2 tests.')).toMatch(/Totals say 2 tests/)
    expect(bad([good], undefined, 'Rebaseline commit: 20071a3. Recipe: wave0.md, task R2-C. Totals: 3 files, 1 tests.')).toMatch(/Totals say 3 files/)
    expect(bad([good], undefined, 'Totals: 1 files, 1 tests.')).toMatch(/second line must read/)
  })

  it('rejects a Bugs found table that is short, points nowhere or leaves a bug row out', () => {
    const bad = (bugs: string[][]) => check(doc([with_({ 2: 'bug' })], bugs), files).join('\n')
    expect(bad([])).toMatch(/has no entry in Bugs found/)
    expect(bad([['test/a.test.ts', 'what broke', 'src/missing.ts']])).toMatch(/fixed in\) does not exist/)
    expect(bad([['test/a.test.ts', 'what broke', 'src/x.ts (helper)']])).toBe('')
    expect(bad([['test/a.test.ts', 'what broke']])).toMatch(/needs exactly 3 filled cells/)
  })
})
