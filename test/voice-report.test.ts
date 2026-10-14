// The voice report (scripts/voice-report.mjs) and the library behind it (scripts/voice/*.mjs): the lexer,
// the string contexts, the corpus, the rules and the A7 metrics. The report is driven the way CI runs it,
// through the command line, on small source trees built from test/fixtures/voice. Those fixtures are
// committed as .txt: tsc compiles every .ts under test/, and several of them are deliberately odd syntax.
// Every expected number below was counted by hand from the fixture it belongs to.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import * as rules from '../scripts/voice/rules.mjs'
import {
  AIMS,
  BANNED_ANYWHERE,
  countColonJoins,
  countDisclaimers,
  countEmDashes,
  countEveryone,
  countNegatives,
  countNobody,
  endsWithFeeling,
  FEELING_WORDS,
  FLAG_NAMES,
  fragmentLead,
  gateOf,
  hasColonJoin,
  hasListOfThree,
  hasTell,
  hasUncontractedNegative,
  isPunchlineFragment,
  isStockVerdict,
  LIMITS,
  norm,
  startsWithChatbotPhrase,
  staticLength,
  STOCK_VERDICTS,
  TELLS,
  unitFlags,
} from '../scripts/voice/rules.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'voice-report.mjs')
const RULES_DTS = join(ROOT, 'scripts', 'voice', 'rules.d.mts')
const CORPUS_URL = pathToFileURL(join(ROOT, 'scripts', 'voice', 'corpus.mjs')).href

const trees: string[] = []
afterAll(() => {
  for (const dir of trees) rmSync(dir, { recursive: true, force: true })
})

const fixture = (name: string): string => readFileSync(join(ROOT, 'test', 'fixtures', 'voice', name), 'utf8')

/** A temporary repository: each key is a path inside it, each value the text of that file. */
function makeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'voice-report-'))
  trees.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

interface Run {
  status: number | null
  stdout: string
  stderr: string
}

/** Runs the report the way CI does. GITHUB_STEP_SUMMARY is cleared, so only a test that sets it sees it. */
function report(args: string[], env: NodeJS.ProcessEnv = {}): Run {
  const base = { ...process.env }
  delete base.GITHUB_STEP_SUMMARY
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...base, ...env },
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

interface MetricRow {
  id: string
  key: string
  name: string
  audit: number
  value: number
  deltaPct: number | null
  definition: string
  topFiles: [string, number][]
}
interface TargetRow {
  id: string
  name: string
  keys: string[]
  audit: number[]
  now: number[]
  target: string
  status: 'met' | 'missed'
}
interface ReportJson {
  meta: { files: number; textStrings: number; lexerErrors: number; sourceBytes: number; sourceSha256: string }
  metrics: MetricRow[]
  targets: { count: number; missed: number; rows: TargetRow[] }
  perFile?: Record<string, Record<string, number>>
}

function reportJson(root: string, extra: string[] = []): ReportJson {
  const run = report(['--json', '--root', root, ...extra])
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  return JSON.parse(run.stdout) as ReportJson
}

const values = (doc: ReportJson): Record<string, number> => Object.fromEntries(doc.metrics.map((m) => [m.key, m.value]))

// ---------------------------------------------------------------------------------------------------------
// The lexer and the corpus

interface Dump {
  files: string[]
  lexErrors: string[]
  regexCount: number
  records: {
    file: string
    line: number
    col: number
    start: number
    end: number
    kind: string
    ctx: string
    text: string
    nExpr: number
    attr: string | null
    partLines: number[] | null
  }[]
}

/** buildCorpus() on a tree, in a child process: scripts/voice/corpus.mjs has no type declarations. */
function corpusOf(root: string): Dump {
  const program = `
    import { buildCorpus } from ${JSON.stringify(CORPUS_URL)}
    const c = buildCorpus(process.argv[1])
    const records = c.records.map(({ file, line, col, start, end, kind, ctx, text, nExpr, attr, partLines }) => ({ file, line, col, start, end, kind, ctx, text, nExpr, attr: attr ?? null, partLines: partLines ?? null }))
    process.stdout.write(JSON.stringify({ files: c.files, lexErrors: c.lexErrors, regexCount: c.regexCount, records }))
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', program, root], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  return JSON.parse(run.stdout) as Dump
}

interface Want {
  at: string
  kind: 'str' | 'tmpl' | 'jsx'
  ctx: string
  text: string
  src: string
  nExpr: number
  attr: string | null
}
const want = (
  at: string,
  kind: Want['kind'],
  ctx: string,
  text: string,
  src: string,
  extra: { nExpr?: number; attr?: string } = {},
): Want => ({ at, kind, ctx, text, src, nExpr: extra.nExpr ?? 0, attr: extra.attr ?? null })

// Hand-listed from test/fixtures/voice/lexer.ts.txt ("line:column" are 1-based, `src` is the literal as written).
const LEXER_WANT: Want[] = [
  want('2:24', 'str', 'import', './a-long-module-name', "'./a-long-module-name'"),
  want('3:8', 'str', 'import', './side-effects-only-module', "'./side-effects-only-module'"),
  want('5:13', 'str', 'type', 'quiet-mode-enabled', "'quiet-mode-enabled'"),
  want('5:36', 'str', 'type', 'quiet-mode-disabled', "'quiet-mode-disabled'"),
  want('6:25', 'str', 'type', 'circle-or-oval-shape', "'circle-or-oval-shape'"),
  // Nested templates: the outer one comes first, then the one inside its hole, then the string inside that.
  want('8:16', 'tmpl', 'other', 'outer ${...} end', "`outer ${`inner ${'deep literal'} tail`} end`", { nExpr: 1 }),
  want('8:25', 'tmpl', 'other', 'inner ${...} tail', "`inner ${'deep literal'} tail`", { nExpr: 1 }),
  want('8:34', 'str', 'other', 'deep literal', "'deep literal'"),
  // The regex literal on line 9 is not a string, and neither is the division on line 10 or the comment.
  want('9:44', 'str', 'other', 'regex input text', "'regex input text'"),
  want('11:17', 'str', 'other', "it's \u00e9 and A", "'it\\'s \\u00e9 and \\x41'"),
  want('12:16', 'str', 'other', 'one two', "'one \\\ntwo'"),
  want('15:13', 'str', 'other', 'http://example.com/a//b', "'http://example.com/a//b'"),
  want('16:22', 'str', 'case', 'case label here', "'case label here'"),
  want('17:14', 'str', 'compare', 'compare operand!', "'compare operand!'"),
  want('18:20', 'str', 'index', 'index lookup key', "'index lookup key'"),
  want('19:15', 'str', 'key', 'quoted key of obj', "'quoted key of obj'"),
  want('19:46', 'str', 'other', 'a plain value', "'a plain value'"),
  want('20:15', 'tmpl', 'other', '${...} and ${...}', "`${ { a: 'object in hole' }.a } and ${(() => { return 'arrow in hole' })()}`", { nExpr: 2 }),
  want('20:24', 'str', 'other', 'object in hole', "'object in hole'"),
  want('20:69', 'str', 'other', 'arrow in hole', "'arrow in hole'"),
  // The slash inside the character class does not end the regex literal, so these two are strings.
  want('21:55', 'str', 'other', 'has quote characters', "'has quote characters'"),
  want('21:80', 'str', 'other', 'plain text input here', "'plain text input here'"),
  want('22:15', 'tmpl', 'other', 'tick ` and dollar ${not a hole} done', '`tick \\` and dollar \\${not a hole} done`'),
  want('23:15', 'str', 'other', 'It\u2019s \u201cfine\u201d here, really', "'It\u2019s \u201cfine\u201d here, really'"),
  want('24:15', 'tmpl', 'other', 'first line\nsecond line ${...} third', '`first line\nsecond line ${n} third`', { nExpr: 1 }),
  want('26:15', 'str', 'other', 'after the multi-line template', "'after the multi-line template'"),
  want('27:14', 'str', 'other', 'tab\there, slash \\ and \u{1F600} and \0 end\n', "'tab\\there, slash \\\\ and \\u{1F600} and \\0 end\\n'"),
  want('28:15', 'str', 'other', '\r|\b|\f|\v|~|~|~|q', "'\\r|\\b|\\f|\\v|\\x7e|\\u007e|\\u{7e}|\\q'"),
  // A slash after `)` or `]` is a division, so these two strings are not swallowed by a regex literal.
  want('29:22', 'str', 'other', 'after paren', "'after paren'"),
  want('30:21', 'str', 'other', 'after bracket', "'after bracket'"),
  // An escaped slash does not end a regex literal, and the quote inside it does not open a string.
  want('31:26', 'str', 'other', 'after regex escape', "'after regex escape'"),
  // A string next to a | is part of a union type even outside a `type` declaration.
  want('32:21', 'str', 'type', 'union member one', "'union member one'"),
  want('32:42', 'str', 'type', 'union member two', "'union member two'"),
]

// Hand-listed from test/fixtures/voice/jsx.tsx.txt. JSX text is a record of its own (kind 'jsx'); the
// apostrophes in it do not open strings, and the comment and the whitespace between tags give nothing.
const JSX_WANT: Want[] = [
  want('3:22', 'str', 'jsxattr', 'card box-with-long-class-name', '"card box-with-long-class-name"', { attr: 'className' }),
  want('3:60', 'str', 'other', 'Hover text for the card', '"Hover text for the card"', { attr: 'title' }),
  want('4:8', 'jsx', 'jsxtext', "You can't do that, it's ", "You can't do that, it's "),
  want('4:35', 'jsx', 'jsxtext', " o'clock.", " o'clock."),
  want('5:17', 'jsx', 'jsxtext', "Plural it's", "Plural it's"),
  want('5:38', 'jsx', 'jsxtext', "Single it's", "Single it's"),
  want('6:24', 'str', 'other', 'Type something here...', '"Type something here..."', { attr: 'placeholder' }),
  want('8:8', 'tmpl', 'other', 'fragment template ${...}', '`fragment template ${n}`', { nExpr: 1 }),
  want('9:12', 'str', 'other', 'a plain string child', "'a plain string child'"),
  want(
    '10:8',
    'jsx',
    'jsxtext',
    'First line of text second line of text',
    '\n      First line of text\n      second line of text\n    ',
  ),
  want('14:9', 'jsx', 'jsxtext', 'Wait \u2014 what? A & B < C', 'Wait &mdash; what? A &amp; B &lt; C'),
]

describe('the lexer and the corpus', () => {
  const lexerSource = fixture('lexer.ts.txt')
  const jsxSource = fixture('jsx.tsx.txt')
  const sources: Record<string, string> = { 'src/game/lexer.ts': lexerSource, 'src/ui/jsx.tsx': jsxSource }

  it('lexes nested templates, regex literals, comments and JSX text without inventing strings', () => {
    const dump = corpusOf(makeTree(sources))
    expect(dump.files).toEqual(['src/game/lexer.ts', 'src/ui/jsx.tsx'])
    expect(dump.lexErrors).toEqual([])
    // /it's "not" a string/g, /[/'"]+/ and /a\/b'c/ are regex literals; the divisions and the // inside a string are not.
    expect(dump.regexCount).toBe(3)
    const got = dump.records.map((r) => ({
      file: r.file,
      row: {
        at: `${r.line}:${r.col}`,
        kind: r.kind,
        ctx: r.ctx,
        text: r.text,
        src: (sources[r.file] ?? '').slice(r.start, r.end),
        nExpr: r.nExpr,
        attr: r.attr,
      },
    }))
    expect(got.filter((g) => g.file === 'src/game/lexer.ts').map((g) => g.row)).toEqual(LEXER_WANT)
    expect(got.filter((g) => g.file === 'src/ui/jsx.tsx').map((g) => g.row)).toEqual(JSX_WANT)
  })

  it('gives each template the line on which each of its static parts starts', () => {
    const dump = corpusOf(makeTree(sources))
    const partLines = (file: string): (number[] | null)[] => dump.records.filter((r) => r.file === file && r.kind === 'tmpl').map((r) => r.partLines)
    // outer, inner, the two holes of line 20, the template with escapes, the one that runs over two lines.
    expect(partLines('src/game/lexer.ts')).toEqual([[8, 8], [8, 8], [20, 20, 20], [22], [24, 25]])
    expect(partLines('src/ui/jsx.tsx')).toEqual([[8, 8]])
    expect(dump.records.filter((r) => r.kind !== 'tmpl').every((r) => r.partLines === null)).toBe(true)
  })

  it('gives every record the line, the column and the offsets of its delimited literal', () => {
    const dump = corpusOf(makeTree(sources))
    expect(dump.records.length).toBe(LEXER_WANT.length + JSX_WANT.length)
    for (const r of dump.records) {
      const source = sources[r.file] ?? ''
      const lineStart = source.lastIndexOf('\n', r.start - 1) + 1
      expect(r.line, `${r.file} @${r.start}`).toBe(source.slice(0, r.start).split('\n').length)
      expect(r.col, `${r.file} @${r.start}`).toBe(r.start - lineStart + 1)
      if (r.kind !== 'jsx') {
        // A string or a template starts and ends on its own delimiter.
        const delimiter = source[r.start] ?? ''
        expect(['"', "'", '`']).toContain(delimiter)
        expect(source[r.end - 1], `${r.file} @${r.start}`).toBe(delimiter)
      }
    }
  })

  it('reports what it could not lex, and keeps going', () => {
    const root = makeTree({ 'src/game/bad.ts': "export const A = 'never closed\nexport const B = 'one closed string'\n" })
    expect(corpusOf(root).lexErrors).toEqual(['src/game/bad.ts: unterminated string at 17'])
    expect(reportJson(root).meta.lexerErrors).toBe(1)
    const run = report(['--root', root])
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('1 lexer errors')
    expect(run.stdout).toMatch(/Lexer errors:\n {2}src\/game\/bad\.ts: unterminated string at 17/)
  })

  it('reads only .ts and .tsx files under src/, and skips tests, declarations and build folders', () => {
    const kept = "export const KEPT = 'a string that is kept here'\n"
    const skipped = "export const SKIPPED = 'a string that is skipped here'\n"
    const root = makeTree({
      'src/game/a.ts': kept,
      'src/ui/b.tsx': kept,
      'src/game/c.d.ts': skipped,
      'src/game/d.test.ts': skipped,
      'src/ui/e.spec.tsx': skipped,
      'src/game/test/f.ts': skipped,
      'src/game/tests/g.ts': skipped,
      'src/game/__tests__/h.ts': skipped,
      'src/game/node_modules/i.ts': skipped,
      'src/game/dist/j.ts': skipped,
      'src/game/.git/k.ts': skipped,
      'src/game/notes.md': skipped,
      'src/game/data.json': '{"a": "a string that is skipped here"}\n',
      'scripts/outside.ts': skipped,
      'test/outside.ts': skipped,
      'lib/outside.ts': skipped,
    })
    expect(corpusOf(root).files).toEqual(['src/game/a.ts', 'src/ui/b.tsx'])
    expect(reportJson(root).meta.textStrings).toBe(2)
  })
})

// ---------------------------------------------------------------------------------------------------------
// The metrics, on a tree with one fixture file per metric

const METRIC_TREE: Record<string, string> = {
  'src/game/long.ts': fixture('long.ts.txt'),
  // The era packs: four decades of src/game/events/era-pack-YYYY-*.ts and the two history digests.
  'src/game/events/era-pack-1900-kids.ts': fixture('era-kids.ts.txt'),
  'src/game/events/era-pack-1946-adults.ts': fixture('era-1946-adults.ts.txt'),
  'src/game/events/era-pack-1980-teen.ts': fixture('era-1980-teen.ts.txt'),
  'src/game/events/era-pack-2000-events-life.ts': fixture('era-2000-events-life.ts.txt'),
  'src/game/history/digest-early.ts': fixture('era-digest-early.ts.txt'),
  'src/game/history/digest-late.ts': fixture('era-digest-late.ts.txt'),
  // Not era packs: the base file of a decade, a kids file outside events/, a .tsx file and a digest that is
  // neither early nor late. Four lines of 170 characters, which would move the p90 if they were counted.
  'src/game/events/era-pack-1900.ts': fixture('era-outside.ts.txt'),
  'src/game/other/era-pack-1900-kids.ts': fixture('era-outside.ts.txt'),
  'src/game/events/era-pack-1900-view.tsx': fixture('era-outside.ts.txt'),
  'src/game/history/digest.ts': fixture('era-outside.ts.txt'),
  'src/game/fragments.ts': fixture('fragments.ts.txt'),
  'src/game/negatives.ts': fixture('negatives.ts.txt'),
  'src/game/colons.ts': fixture('colons.ts.txt'),
  'src/game/crowds.ts': fixture('crowds.ts.txt'),
  'src/game/disclaimers.ts': fixture('disclaimers.ts.txt'),
  'src/ui/disclaimers.tsx': fixture('disclaimers.tsx.txt'),
  'src/game/chatbot.ts': fixture('chatbot.ts.txt'),
  'src/game/events/chatbot-two.ts': fixture('chatbot-two.ts.txt'),
  'src/game/emdash.ts': fixture('emdash.ts.txt'),
  'src/game/extras.ts': fixture('extras.ts.txt'),
}

describe('the metrics', () => {
  it('counts each metric on the fixture tree', () => {
    const doc = reportJson(makeTree(METRIC_TREE))
    expect(doc.meta.files).toBe(21)
    expect(doc.meta.lexerErrors).toBe(0)
    expect(doc.meta.textStrings).toBe(112)
    expect(values(doc)).toEqual({
      total: 112, // 8 long, 10 + 3 + 2 era, 4 outside, 18 fragments, 10 negatives, 14 colons, 9 crowds, 4 + 2 disclaimers, 16 + 1 chatbot, 6 em dash, 5 extras
      long: 3, // 200, 181 and the template with 181 static characters; 180 is not long
      eraMedian: 90, // 15 lines: 24 36 40 50 60 70 80 90 100 110 115 125 135 145 155, the 8th
      eraP90: 145, // the 14th
      fragments: 11,
      qualifiers: 7,
      negatives: 19, // 16 in negatives.ts and 3 in the kids pack
      negKids: 3,
      colonJoins: 4, // includes the "@1998,own:mobilePhone " line, which the audit's gate pattern does not strip
      nobody: 6,
      everyone: 4,
      both: 10,
      disclaimers: 9, // 8 in disclaimers.ts and 1 in disclaimers.tsx
      banRaw: 15, // 14 in chatbot.ts and 1 in chatbot-two.ts; the "@1998,own:mobilePhone Good call" line is not one
      banSites: 2,
      emDash: 5,
      ouch: 3,
      forNow: 2,
      mostly: 2, // "Mostly." in extras.ts and in fragments.ts
      fair: 2,
      at3am: 4,
      walletNap: 4,
    })
  })

  it('lists the files that hold each metric, most first', () => {
    const doc = reportJson(makeTree(METRIC_TREE))
    const top = (key: string): [string, number][] => doc.metrics.find((m) => m.key === key)?.topFiles ?? []
    expect(top('banRaw')).toEqual([
      ['src/game/chatbot.ts', 14],
      ['src/game/events/chatbot-two.ts', 1],
    ])
    expect(top('negatives')).toEqual([
      ['src/game/negatives.ts', 16],
      ['src/game/events/era-pack-1900-kids.ts', 3],
    ])
    expect(top('nobody')).toEqual([['src/game/crowds.ts', 6]])
    expect(top('everyone')).toEqual([['src/game/crowds.ts', 4]])
    expect(top('both')).toEqual([['src/game/crowds.ts', 10]])
    // Text strings per file, 8 files, ties (10 and 10) in name order.
    expect(top('total')).toEqual([
      ['src/game/fragments.ts', 18],
      ['src/game/chatbot.ts', 16],
      ['src/game/colons.ts', 14],
      ['src/game/events/era-pack-1900-kids.ts', 10],
      ['src/game/negatives.ts', 10],
      ['src/game/crowds.ts', 9],
      ['src/game/long.ts', 8],
      ['src/game/emdash.ts', 6],
    ])
    expect(top('emDash')).toEqual([['src/game/emdash.ts', 5]])
  })

  it('--per-file adds the counts of each file, and the era-pack length of the era files', () => {
    const doc = reportJson(makeTree({ ...METRIC_TREE, 'src/game/quiet.ts': "export const Q = 'hi'\n" }), ['--per-file'])
    const perFile = doc.perFile ?? {}
    expect(Object.keys(perFile)).toContain('src/game/long.ts')
    // A file with nothing to count is left out.
    expect(Object.keys(perFile)).not.toContain('src/game/quiet.ts')
    expect(perFile['src/game/long.ts']).toMatchObject({ text: 8, long: 3, banRaw: 0 })
    expect(perFile['src/game/chatbot.ts']).toMatchObject({ text: 16, banRaw: 14 })
    expect(perFile['src/game/events/chatbot-two.ts']).toMatchObject({ text: 1, banRaw: 1 })
    expect(perFile['src/game/fragments.ts']).toMatchObject({ text: 18, fragments: 11, qualifiers: 7 })
    expect(perFile['src/game/colons.ts']).toMatchObject({ text: 14, colonJoins: 4 })
    expect(perFile['src/game/crowds.ts']).toMatchObject({ text: 9, nobody: 6, everyone: 4 })
    expect(perFile['src/game/disclaimers.ts']).toMatchObject({ text: 4, disclaimers: 8 })
    expect(perFile['src/ui/disclaimers.tsx']).toMatchObject({ text: 2, disclaimers: 1 })
    expect(perFile['src/game/emdash.ts']).toMatchObject({ text: 6, emDash: 5 })
    // The kids pack alone: 24 36 40 50 60 70 80 90 100 110, so the 5th (60) and the 9th (100).
    expect(perFile['src/game/events/era-pack-1900-kids.ts']).toMatchObject({
      text: 10,
      negatives: 3,
      eraMedian: 60,
      eraP90: 100,
    })
    expect(perFile['src/game/events/era-pack-1946-adults.ts']).toMatchObject({ eraMedian: 115, eraP90: 115 })
    // Not an era file: no era length.
    expect(perFile['src/game/fragments.ts']).not.toHaveProperty('eraMedian')
  })

  it('fingerprints the source it read, so two runs can tell whether they saw the same tree', () => {
    const a = {
      'src/game/a.ts': "export const A = 'one plain line of text'\n",
      'src/game/b.ts': "export const B = 'caf\u00e9 au lait for all'\n",
    }
    const doc = reportJson(makeTree(a))
    expect(doc.meta.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(doc.meta.sourceBytes).toBe(Buffer.byteLength(a['src/game/a.ts'] + a['src/game/b.ts']))
    // The same files in another folder: the same fingerprint.
    expect(reportJson(makeTree(a)).meta.sourceSha256).toBe(doc.meta.sourceSha256)
    // One character changed, or the same text under another name: a different one.
    const edited = { ...a, 'src/game/b.ts': a['src/game/b.ts'].replace('caf', 'cab') }
    expect(reportJson(makeTree(edited)).meta.sourceSha256).not.toBe(doc.meta.sourceSha256)
    const renamed = { 'src/game/a.ts': a['src/game/a.ts'], 'src/game/c.ts': a['src/game/b.ts'] }
    expect(reportJson(makeTree(renamed)).meta.sourceSha256).not.toBe(doc.meta.sourceSha256)
  })

  it('prints the per-file table in the text report too', () => {
    const run = report(['--per-file', '--root', makeTree(METRIC_TREE)])
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('Per-file breakdown')
    expect(run.stdout).toMatch(/src\/game\/chatbot\.ts\s+16\s+0\s+0\s+0\s+0\s+0\s+0\s+0\s+0\s+14\s+0/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// The table, the exit codes and the CI mode

/** id, a distinctive part of the name, the PDF's audit value, the value on METRIC_TREE, the target, the status. */
const TABLE: [string, string, string, string, string, string][] = [
  ['1', 'Strings longer than 180', '464', '3', '< 60', 'met'],
  ['2', 'Era-pack string length', '75 / 124', '90 / 145', '<= 50 / <= 100', 'missed'],
  ['3', 'Fragment punchlines', '988', '11', '< 300', 'met'],
  ['4', 'Especially/Including/Twice', '77', '7', '< 15', 'met'],
  ['5', 'Contraction-free negatives', '544', '19', '< 100', 'met'],
  ['6', 'colon joins', '722', '4', '< 250', 'met'],
  ['7', 'Nobody', '901', '10', '< 400', 'met'],
  ['8', 'Disclaimer words', '37', '9', '<= 3', 'missed'],
  ['9', 'Chatbot phrasings (files with one)', '17', '2', '0', 'missed'],
  ['10', 'Em dashes', '24', '5', '<= 24', 'met'],
]

const CLEAN_TREE: Record<string, string> = { 'src/game/a.ts': "export const A = 'one plain line of text'\n" }

/** Tests that start many child processes get room: each node start-up is slow on a busy CI machine. */
const MANY_PROCESSES = 60_000

describe('the report', () => {
  it('prints the audit rows with target status', () => {
    const run = report(['--root', makeTree(METRIC_TREE)])
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const rows = run.stdout
      .split('\n')
      .map((line) => line.trim().split(/\s{2,}/))
      .filter((cells) => cells.length === 6 && /^\d+$/.test(cells[0] ?? ''))
    expect(rows.length).toBe(10)
    TABLE.forEach(([id, name, audit, now, target, status], i) => {
      const cells = rows[i] ?? []
      expect(cells[0]).toBe(id)
      expect(cells[1]).toContain(name)
      expect(cells.slice(2)).toEqual([audit, now, target, status])
    })
    expect(run.stdout).toContain('3 of 10 targets missed')
    // The definitions are part of the report.
    expect(run.stdout).toContain('Definitions')
    expect(run.stdout).toContain('measured length >= 14')
  })

  it('groups thousands in the counts, in the text report and in the markdown', () => {
    const tree = { 'src/game/a.ts': Array.from({ length: 1234 }, (_, i) => `export const L${i} = 'one plain line of text'\n`).join('') }
    const text = report(['--root', makeTree(tree)])
    expect(text.stdout).toContain('1,234 text strings')
    const markdown = report(['--summary', '--root', makeTree(tree)])
    expect(markdown.stdout).toContain('1 files, 1,234 text strings.')
  })

  it('right-aligns the numbers of the table', () => {
    const run = report(['--root', makeTree(METRIC_TREE)])
    const ends = run.stdout
      .split('\n')
      .map((line) => /^(\d+)\s+(.+?)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(met|missed)$/d.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m.indices?.[3]?.[1], m.indices?.[4]?.[1]])
    expect(ends.length).toBe(10)
    expect(new Set(ends.map(([audit]) => audit)).size).toBe(1)
    expect(new Set(ends.map(([, now]) => now)).size).toBe(1)
  })

  it('exits 0 by default and 1 with --strict when a target is missed', () => {
    const missed = makeTree(METRIC_TREE)
    expect(report(['--root', missed]).status).toBe(0)
    expect(report(['--root', missed, '--strict']).status).toBe(1)
    expect(report(['--root', missed, '--strict', '--json']).status).toBe(1)
    // Every target met: --strict is still 0.
    const clean = makeTree(CLEAN_TREE)
    expect(report(['--root', clean, '--strict']).status).toBe(0)
    const doc = reportJson(clean)
    expect(doc.targets.missed).toBe(0)
    expect(doc.targets.rows.every((row) => row.status === 'met')).toBe(true)
    // No era file: the era lengths are 0, not missing.
    expect(doc.targets.rows[1]).toMatchObject({ now: [0, 0], status: 'met' })
  }, MANY_PROCESSES)

  it('judges every target at its boundary', () => {
    const dash = String.fromCharCode(0x2014)
    /** The text of a source file with `n` copies of a line, each its own constant. */
    const fileOf = (n: number, line: string): string =>
      Array.from({ length: n }, (_, i) => `export const L${i} = ${JSON.stringify(line)}\n`).join('')
    const copies = (n: number, line: string): Record<string, string> => ({ 'src/game/a.ts': fileOf(n, line) })
    const row = (id: string, tree: Record<string, string>): TargetRow => {
      const found = reportJson(makeTree(tree)).targets.rows.find((r) => r.id === id)
      if (!found) throw new Error(`no target row ${id}`)
      return found
    }
    // id, the most hits that still meet the target, the fewest that miss it, and a line that is one hit of that metric.
    const cases: [id: string, met: number, missed: number, line: string][] = [
      ['1', 59, 60, 'x'.repeat(181)],
      ['3', 299, 300, 'The captain was seasick for five days. Classic.'],
      ['4', 14, 15, 'The captain was seasick for five days. Probably.'],
      ['5', 99, 100, 'You did not see it coming.'],
      ['6', 249, 250, 'The pantry was empty: nothing but old flour.'],
      ['7', 399, 400, 'Nobody saw you take the cookie.'],
      ['8', 3, 4, 'This is a fictional company.'],
      ['9', 0, 1, 'Good call. Your organs send their thanks.'],
      ['10', 24, 25, `Wait${dash}what happened here?`],
    ]
    for (const [id, met, missed, line] of cases) {
      // The chatbot row counts files with a hit, and all the copies are in one file.
      expect(row(id, copies(met, line)), `${id}: ${met}`).toMatchObject({ now: [met], status: 'met' })
      expect(row(id, copies(missed, line)), `${id}: ${missed}`).toMatchObject({ now: [id === '9' ? 1 : missed], status: 'missed' })
    }
    // The Nobody row adds Nobody and Everyone together.
    const crowd = (nobody: number, everyone: number): Record<string, string> => ({
      'src/game/a.ts': fileOf(nobody, 'Nobody saw you take the cookie.'),
      'src/game/b.ts': fileOf(everyone, 'Everyone laughed when the cake fell.'),
    })
    expect(row('7', crowd(200, 199))).toMatchObject({ now: [399], status: 'met' })
    expect(row('7', crowd(200, 200))).toMatchObject({ now: [400], status: 'missed' })
    // The era row has two numbers: the median must be 50 or less and the p90 100 or less.
    const era = (lengths: number[]): Record<string, string> => ({
      'src/game/events/era-pack-1900-kids.ts': lengths.map((n, i) => `export const L${i} = '${'x'.repeat(n)}'\n`).join(''),
    })
    const spread = (top: number): number[] => [...Array<number>(8).fill(20), top, top]
    expect(row('2', era([50]))).toMatchObject({ now: [50, 50], status: 'met' })
    expect(row('2', era([51]))).toMatchObject({ now: [51, 51], status: 'missed' })
    expect(row('2', era(spread(100)))).toMatchObject({ now: [20, 100], status: 'met' })
    expect(row('2', era(spread(101)))).toMatchObject({ now: [20, 101], status: 'missed' })
  }, MANY_PROCESSES)

  it('--json carries the target rows beside the metrics', () => {
    const doc = reportJson(makeTree(METRIC_TREE))
    expect(doc.targets.count).toBe(10)
    expect(doc.targets.missed).toBe(3)
    expect(doc.targets.rows.map((row) => [row.id, row.status])).toEqual(TABLE.map(([id, , , , , status]) => [id, status]))
    const era = doc.targets.rows[1]
    expect(era).toMatchObject({ keys: ['eraMedian', 'eraP90'], audit: [75, 124], now: [90, 145], target: '<= 50 / <= 100' })
    // The per-file table is only there when asked for.
    expect(doc).not.toHaveProperty('perFile')
    // The change since the audit, in percent with one decimal: 3 against 464 is -99.4%.
    expect(doc.metrics.find((m) => m.key === 'long')?.deltaPct).toBe(-99.4)
    expect(doc.metrics.find((m) => m.key === 'emDash')?.deltaPct).toBe(-79.2)
    // Every row says what it counts.
    expect(doc.metrics.filter((m) => m.definition.length < 10)).toEqual([])
    // The audit values on the metric rows are the PDF's.
    const audit = Object.fromEntries(doc.metrics.map((m) => [m.key, m.audit]))
    expect(audit).toEqual({
      total: 59172, long: 464, eraMedian: 75, eraP90: 124, fragments: 988, qualifiers: 77, negatives: 544, negKids: 26,
      colonJoins: 722, nobody: 453, everyone: 448, both: 901, disclaimers: 37, banRaw: 22, banSites: 17, emDash: 24,
      ouch: 30, forNow: 25, mostly: 19, fair: 13, at3am: 22, walletNap: 11,
    })
  })

  it('--summary prints the markdown table', () => {
    const run = report(['--summary', '--root', makeTree(METRIC_TREE)])
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const rows = markdownRows(run.stdout)
    expect(rows.length).toBe(10)
    TABLE.forEach(([id, name, audit, now, target, status], i) => {
      const cells = rows[i] ?? []
      expect(cells[0]).toBe(id)
      expect(cells[1]).toContain(name)
      expect(cells.slice(2)).toEqual([audit, now, target, status])
    })
    expect(run.stdout).toContain('3 of 10 targets missed')
  })

  it('--ci writes the markdown table to GITHUB_STEP_SUMMARY and prints one warning line', () => {
    const root = makeTree(METRIC_TREE)
    const summary = join(makeTree({}), 'summary.md')
    const run = report(['--ci', '--root', root], { GITHUB_STEP_SUMMARY: summary })
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const warnings = run.stdout.split('\n').filter((line) => line.startsWith('::'))
    expect(warnings).toEqual(['::warning title=Voice report::3 of 10 targets missed'])
    const written = readFileSync(summary, 'utf8')
    const rows = markdownRows(written)
    expect(rows.map((cells) => cells[0])).toEqual(TABLE.map(([id]) => id))
    expect(rows.map((cells) => cells[5])).toEqual(TABLE.map(([, , , , , status]) => status))
    // The job summary is appended to, not replaced.
    report(['--ci', '--root', root], { GITHUB_STEP_SUMMARY: summary })
    expect(readFileSync(summary, 'utf8').split('### Voice report').length - 1).toBe(2)
  })

  it('writes the job summary only under --ci', () => {
    const root = makeTree(METRIC_TREE)
    const summary = join(makeTree({}), 'summary.md')
    for (const args of [[], ['--summary'], ['--json'], ['--strict']]) {
      report([...args, '--root', root], { GITHUB_STEP_SUMMARY: summary })
      expect(existsSync(summary), args.join(' ')).toBe(false)
    }
    // And an unset or empty variable is not a path.
    expect(report(['--ci', '--root', root], { GITHUB_STEP_SUMMARY: '' }).status).toBe(0)
  }, MANY_PROCESSES)

  it('--ci without GITHUB_STEP_SUMMARY still warns, and with every target met stays quiet', () => {
    const run = report(['--ci', '--root', makeTree(METRIC_TREE)])
    expect(run.status).toBe(0)
    expect(run.stdout.split('\n').filter((line) => line.startsWith('::warning'))).toHaveLength(1)
    const quiet = report(['--ci', '--root', makeTree(CLEAN_TREE)])
    expect(quiet.status).toBe(0)
    expect(quiet.stdout).not.toContain('::')
  })

  it('refuses bad usage with exit code 2 and writes nothing to stdout', () => {
    const root = makeTree(CLEAN_TREE)
    for (const args of [
      ['--bogus', '--root', root],
      ['--root'],
      ['stray', '--root', root],
      ['--json', '--ci', '--root', root],
      ['--json', '--summary', '--root', root],
    ]) {
      const run = report(args)
      expect(run.status, args.join(' ')).toBe(2)
      expect(run.stdout, args.join(' ')).toBe('')
      expect(run.stderr, args.join(' ')).not.toBe('')
    }
    const empty = report(['--root', makeTree({})])
    expect(empty.status).toBe(2)
    expect(empty.stderr).toContain('src')
    const help = report(['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('--strict')
  }, MANY_PROCESSES)
})

/** The cells of the data rows of the markdown tables in a text (the header and the separator are skipped). */
function markdownRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => /^\d+$/.test(cells[0] ?? ''))
}

// ---------------------------------------------------------------------------------------------------------
// The rules library

describe('the word lists and limits', () => {
  it('BANNED_ANYWHERE is the A3 ban list and the eulogy stock, three entries ending in a space', () => {
    expect(BANNED_ANYWHERE).toEqual([
      "here's what",
      'Good call',
      'Look at you',
      'You matter',
      'honestly?',
      'Note that',
      'Consider ',
      'You might want to',
      'Feel free',
      "Let's ",
      'Welcome to ',
      'remarkable years',
      'taken far too soon',
      'well-earned retirement',
      'ripe old age',
      'dearly missed',
      'lived it his own way',
      'lived it her own way',
      'lived it their own way',
    ])
  })

  it('STOCK_VERDICTS, TELLS and FEELING_WORDS are the lists of the voice guide', () => {
    expect(STOCK_VERDICTS).toEqual([
      'Ouch',
      'Classic',
      'Mostly',
      'Worth it',
      'Barely',
      'Fair',
      'Still',
      'Yet',
      'For now',
      'Nice',
      'Honestly',
      'Apparently',
      'Allegedly',
      'Yes really',
      'needs a nap',
      'at 3 AM',
      'Nobody noticed',
      'What could possibly go wrong',
    ])
    expect(TELLS).toEqual(['quietly', 'somehow', 'suddenly', 'a sense of'])
    expect(FEELING_WORDS).toEqual([
      'proud', 'happy', 'sad', 'relieved', 'magical', 'wonderful', 'special', 'lonely', 'safe', 'free', 'alive',
      'loved', 'grateful', 'sorry', 'scared', 'nervous', 'excited', 'hopeful', 'homesick', 'perfect', 'complete', 'whole',
    ])
  })

  it('LIMITS are the hard caps and AIMS the aims of the voice guide', () => {
    expect(LIMITS).toEqual({ log: 90, scene: 140, outcome: 120, tooltip: 120, digest: 110 })
    expect(AIMS).toEqual({ log: 60, scene: 110, outcome: 100, tooltip: 100, digest: 100 })
  })

  it('FLAG_NAMES are the sixteen flags, in the order unitFlags reports them', () => {
    expect(FLAG_NAMES).toEqual([
      'over-cap', 'over-aim', 'long', 'no-contraction', 'colon-join', 'punchline', 'qualifier', 'nobody', 'everyone',
      'disclaimer', 'chatbot', 'stock', 'tell', 'list-of-three', 'feeling-end', 'em-dash',
    ])
  })

  it('VOICE.md lists every banned phrase, stock verdict and tell', () => {
    // Entries may end in a space (the lists look for "Consider " so that "Considerable" is fine); the guide does not.
    const guide = readFileSync(join(ROOT, 'docs', 'VOICE.md'), 'utf8').replace(/\s+/g, ' ')
    const entries = [...BANNED_ANYWHERE, ...STOCK_VERDICTS, ...TELLS].map((entry) => entry.trim())
    expect(entries.every((entry) => entry.length > 0)).toBe(true)
    expect(entries.filter((entry) => !guide.includes(entry))).toEqual([])
  })

  it('rules.d.mts declares every export of rules.mjs', () => {
    const declared = [...readFileSync(RULES_DTS, 'utf8').matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1])
    expect(declared.sort()).toEqual(Object.keys(rules).sort())
  })
})

describe('staticLength and gateOf', () => {
  it('counts characters, and a hole counts zero', () => {
    expect(staticLength('')).toBe(0)
    expect(staticLength('abc')).toBe(3)
    expect(staticLength('Cost: ${...} today')).toBe('Cost:  today'.length)
    expect(staticLength('{{0}} and {{1}}')).toBe(' and '.length)
    // A {token} is text in the source, so it counts; so does a leading gate (split it off first).
    expect(staticLength('Hi {name}!')).toBe(10)
    expect(staticLength('@1950 Hi')).toBe(8)
  })

  it('splits a leading era gate off, including the real colon gates', () => {
    expect(gateOf('@1998,own:mobilePhone I got a phone.')).toEqual({ tag: '@1998,own:mobilePhone ', rest: 'I got a phone.' })
    expect(gateOf('@-1925 Plain.')).toEqual({ tag: '@-1925 ', rest: 'Plain.' })
    expect(gateOf('@tv,1950   Two spaces.')).toEqual({ tag: '@tv,1950   ', rest: 'Two spaces.' })
    expect(gateOf('@!smartphone Not yet.')).toEqual({ tag: '@!smartphone ', rest: 'Not yet.' })
    expect(gateOf('@+internet Online.')).toEqual({ tag: '@+internet ', rest: 'Online.' })
    expect(gateOf('@2016,own:smartphone,-2019 Gated twice.')).toEqual({ tag: '@2016,own:smartphone,-2019 ', rest: 'Gated twice.' })
    expect(gateOf('Plain text')).toEqual({ tag: '', rest: 'Plain text' })
    expect(gateOf('')).toEqual({ tag: '', rest: '' })
  })

  it('does not take a mention, a handle or a mid-string @ for a gate', () => {
    for (const text of ['@${...} says hi', '@AnotherLifeDevs', '@', 'Mail me @home now', ' @1950 indented']) {
      expect(gateOf(text), text).toEqual({ tag: '', rest: text })
    }
  })
})

describe('norm and the counting functions', () => {
  it('norm straightens curly quotes and no-break spaces and leaves other text alone', () => {
    expect(norm('It\u2019s \u201cfine\u201d \u2018here\u2019\u00a0now')).toBe('It\'s "fine" \'here\' now')
    expect(norm('\u201bx\u201f')).toBe('\'x"')
    expect(norm('plain text')).toBe('plain text')
    expect(norm('')).toBe('')
  })

  it('countNegatives counts every occurrence', () => {
    expect(countNegatives('It was not a good day. It was not a bad day.')).toBe(2)
    expect(countNegatives('He did\nnot know, and she cannot say.')).toBe(2)
    expect(countNegatives("He didn't know.")).toBe(0)
    // The phrase has to start a word: "Chad not" ends in "had not", "this not" in "is not".
    expect(countNegatives('Chad not Brad, and this not that.')).toBe(0)
    expect(countNegatives('')).toBe(0)
  })

  it('countNobody and countEveryone count whole words, in any case', () => {
    expect(countNobody("Nobody came, and nobody called. NOBODY'S fault.")).toBe(3)
    expect(countNobody('The nobodyness of it, and Somebody, and Mrnobody.')).toBe(0)
    expect(countEveryone('Everyone knew, and EVERYONE said nothing.')).toBe(2)
    expect(countEveryone('Everyones phones, and everyone-else.')).toBe(1)
    expect(countEveryone('Overeveryone was there.')).toBe(0)
    expect(countEveryone('Nobody came.')).toBe(0)
  })

  it('countDisclaimers counts the four words, in any case', () => {
    expect(countDisclaimers('Fictional, simulated and abstract.')).toBe(3)
    expect(countDisclaimers('Results are Not   Guaranteed.')).toBe(1)
    expect(countDisclaimers('Not guaranteed, but not promised either.')).toBe(1)
    expect(countDisclaimers('A real, concrete thing.')).toBe(0)
    expect(countDisclaimers('We do not guarantee anything.')).toBe(0)
  })

  it('countEmDashes counts U+2014 and nothing else', () => {
    expect(countEmDashes('a \u2014 b \u2014 c')).toBe(2)
    expect(countEmDashes('a \u2013 b - c -- d')).toBe(0)
    expect(countEmDashes('')).toBe(0)
  })
})

describe('hasUncontractedNegative', () => {
  const PHRASES = ['did not', 'was not', 'is not', 'cannot', 'were not', 'do not', 'does not', 'had not', 'would not', 'could not', 'have not', 'has not']

  it('finds each of the twelve phrases', () => {
    for (const phrase of PHRASES) expect(hasUncontractedNegative(`They ${phrase} go.`), phrase).toBe(true)
  })

  it('ignores case and the white space between the words', () => {
    expect(hasUncontractedNegative('DID NOT RETURN')).toBe(true)
    expect(hasUncontractedNegative('He did\n  not know')).toBe(true)
  })

  it('leaves contractions and look-alikes alone', () => {
    for (const text of ["You didn't see it.", 'You didn\u2019t see it.', "She can't swim.", 'This is nothing.', 'It was notable.', 'Do notice that.', 'Not today.']) {
      expect(hasUncontractedNegative(text), text).toBe(false)
    }
  })
})

describe('hasColonJoin', () => {
  it('counts a colon between two clauses', () => {
    expect(hasColonJoin('The pantry was empty: nothing but old flour.')).toBe(true)
    expect(hasColonJoin('Intro. You packed three bags: socks and shoes.')).toBe(true)
  })

  it('leaves labels, prices, times and short sides alone', () => {
    for (const text of [
      'Cost: $40 per month',
      'Note: this is fine and nothing else matters.',
      'The price is steep: $4,200 for the lot.',
      'Pay the fine: \u00a340 and be quick.',
      'Pay the fine: \u20ac40 and be quick.',
      'Pay the fine: \u00a540 and be quick.',
      'Pay the fine: $ 40 and be quick.',
      'The meeting starts at: 10:30 in the morning',
      'Here is the thing: no way.',
      'The ratio was 3:1 for the team',
      'You see the key:value pair stored here.',
    ]) {
      expect(hasColonJoin(text), text).toBe(false)
    }
  })

  it('counts the words since the last sentence end or line break', () => {
    for (const text of ['Really? Pay up: the rent is due.', 'Stop! Pay up: the rent is due.', 'Done. Pay up: the rent is due.', 'Done.\u00a0Pay up: the rent is due.', 'A preamble line\nPay up: the rent is due.']) {
      expect(hasColonJoin(text), text).toBe(false)
    }
  })

  it('counts the words after the colon up to the next sentence end or line break', () => {
    expect(hasColonJoin('The rule is simple: pay up and then leave.')).toBe(true)
    expect(hasColonJoin('The rule is simple: pay up. Then leave.')).toBe(false)
    expect(hasColonJoin('The rule is simple: pay up\nand then leave.')).toBe(false)
  })

  it('counts every join', () => {
    expect(countColonJoins('You packed three bags: socks and shoes. Then you left: the dog barked twice.')).toBe(2)
    expect(countColonJoins('Cost: $40')).toBe(0)
    expect(countColonJoins('')).toBe(0)
  })
})

describe('isPunchlineFragment and fragmentLead', () => {
  it('finds a one to three word fragment closing the string', () => {
    for (const text of [
      // The audit's definition is any short last sentence, so the reference voice is counted too.
      'I ate a crayon. It was blue.',
      'You held your own. Mostly.',
      'It rained all week. Including the roof.',
      'The wine was fine. Worth it.',
      'He said "It works. Twice."',
      'The soup was cold. Don\u2019t ask.',
      'You tried the soup (once. Barely.)',
      'It rained. Again. Twice.',
      'Did it work? Probably.',
      'You won the raffle! Barely.',
      'It was over. Well-known.',
      'She said "no." Twice.',
      "The soup was cold. I can't tell.",
      'It ended. Not so well-known.',
    ]) {
      expect(isPunchlineFragment(text), text).toBe(true)
    }
  })

  it('does not find one in anything else', () => {
    for (const text of [
      'The room was dark. Not even close today.',
      'You won the raffle. Nice!',
      'Mostly harmless and fully legal.',
      'You went home early. You were tired and cold.',
      'He left early. Mostly',
      'It was a long day. mostly good.',
      'You tried it. ${...}.',
      '',
    ]) {
      expect(isPunchlineFragment(text), text).toBe(false)
    }
  })

  it('names the first word of the last fragment', () => {
    expect(fragmentLead('It works. Mostly.')).toBe('Mostly')
    expect(fragmentLead('It rained. Again. Twice.')).toBe('Twice')
    expect(fragmentLead('It rained all week. Including the roof.')).toBe('Including')
    expect(fragmentLead('The soup was cold. Don\u2019t ask.')).toBe("Don't")
    expect(fragmentLead('No fragment here at all.')).toBeNull()
  })
})

describe('hasTell', () => {
  it('finds each tell as a whole word or phrase, in any case', () => {
    for (const tell of TELLS) {
      expect(hasTell(`It ${tell} happened.`), tell).toBe(true)
      expect(hasTell(`${tell.toUpperCase()} it happened.`), tell).toBe(true)
    }
    expect(hasTell('You felt a sense of calm.')).toBe(true)
  })

  it('does not find one inside another word, or half a phrase', () => {
    for (const text of ['A quieter night.', 'Somewhat odd.', 'The suddenness of it.', 'It made a sense.', 'Make sense of it.', 'You sensed it.', 'An unquietly sea.', 'The somehows of it.', 'Suddenlyish things.', '']) {
      expect(hasTell(text), text).toBe(false)
    }
  })
})

describe('hasListOfThree', () => {
  it('finds three items joined by commas and a final and / or', () => {
    for (const text of [
      'The room smelled of smoke, soap and wet wool.',
      'Tea, coffee or juice?',
      'You opened it, read one line, and fell asleep.',
      'You bought ${...}, ${...} and ${...}.',
      'You bought {{0}}, {{1}} and {{2}}.',
      'Tea, coffee, juice and water',
      'Mom, Dad, or Grandma came.',
      'We bought tea, one big old pot and a spoon.',
      'TEA, COFFEE AND JUICE.',
      'You met {a}, {b} and {c}.',
      '"Tea, coffee and juice"',
      'We said don\u2019t, won\u2019t and can\u2019t.',
      'Rates were 10%, 20% and 30%.',
      'Prices were $5, $10 and $20.',
      'Shots were slow-mo, hand-held and out-of-focus.',
    ]) {
      expect(hasListOfThree(text), text).toBe(true)
    }
  })

  it('does not find one in pairs, asides or separate sentences', () => {
    for (const text of ['Tea and coffee.', 'Yes, sir, thank you.', 'I ate a crayon. It was blue.', 'First, we left. Then, we ate.', 'Salt and pepper.', 'We bought tea, one big old red pot and a spoon.', '']) {
      expect(hasListOfThree(text), text).toBe(false)
    }
  })
})

describe('endsWithFeeling', () => {
  it('finds each feeling word at the end, through punctuation and quotes', () => {
    for (const word of FEELING_WORDS) expect(endsWithFeeling(`It was ${word}.`), word).toBe(true)
    for (const text of [
      'I felt proud', 'It was magical!', 'She was "grateful."', 'He seemed lonely.)', 'SAFE.', 'It felt wonderful\u2026', 'You were so happy...', 'You felt relieved?',
      'The sign said [free]', "He said 'I'm safe'", 'It was magical. ', "He called it 'free'",
      'She said \u201cI am safe\u201d', 'It was her \u2018home\u2019 and she was free\u2019',
    ]) {
      expect(endsWithFeeling(text), text).toBe(true)
    }
  })

  it('does not find one in the middle, or inside another word', () => {
    for (const text of ['The safe was empty.', 'Unhappy.', 'I felt freedom.', 'A perfectly fine day.', 'Whole wheat bread', 'Free pizza for everyone in the room.', 'He was happy and then he left.', 'They were half-happy.', '']) {
      expect(endsWithFeeling(text), text).toBe(false)
    }
  })
})

describe('isStockVerdict', () => {
  it('finds a stock word standing alone as a sentence', () => {
    for (const text of [
      'Mostly.', 'Ouch!', 'Worth it.', 'For now.', 'Yet.', 'Nice!', 'Honestly?', 'Allegedly.', 'Barely.', 'Classic.', 'Fair.', 'Still.', 'Apparently.',
      'It works. Mostly.', 'Nothing new has appeared. Yet.', '"It works. Mostly."', 'Ouch. That hurt.', 'mostly.', 'FOR NOW.',
      'She said "stop." Ouch.', 'Ouch\nThat hurt.', 'It works. "Mostly."',
      'You waited\u2026 Fair.', 'Mostly\u2026', '\u201cIt works. Mostly.\u201d',
    ]) {
      expect(isStockVerdict(text), text).toBe(true)
    }
  })

  it('finds the stock phrases anywhere', () => {
    for (const text of [
      'Your wallet needs a nap.', 'You woke up at 3 AM.', 'You woke up at 3 a.m.', 'You woke up at 3:00 am to a noise.', 'He woke at 3am.',
      'What could possibly go wrong?', 'Nobody noticed.', 'They did, and nobody noticed you left.', 'Yes really.',
      'Some asked what could possibly go wrong.', 'He said yes really and left.', 'You woke up AT 3 AM.',
    ]) {
      expect(isStockVerdict(text), text).toBe(true)
    }
  })

  it('leaves the same words alone as ordinary words', () => {
    for (const text of [
      'Still life with apples.', 'Not yet.', 'Fair enough.', "It isn't fair.", 'Barely made it home.', 'Yet another day.', 'The science fair.', 'Classic cars are here.',
      'Nice try.', 'Honestly, it was fine.', 'Apparently nothing happened.', 'The baby needs a rest.', 'You woke up at 3 PM.', 'They arrived at 3 amazing hotels.',
      'Her eyes really hurt.', 'He needs a napkin.', 'Look what 3 am does to a person.', '',
    ]) {
      expect(isStockVerdict(text), text).toBe(false)
    }
  })
})

describe('startsWithChatbotPhrase', () => {
  it('finds each phrase of the ban list at the start', () => {
    for (const text of [
      'Good call. Your organs send their thanks.',
      'Look at you, being a good person.',
      "Dear ${...}, here's what your CEOs did",
      "Dear {{0}}, here's what your CEOs did",
      'You matter',
      'honestly? That is the plan.',
      'Note that this is fine.',
      'Consider the offer.',
      'You might want to sit down.',
      'Feel free to leave.',
      "Let's go!",
      'Let\u2019s go!',
      'Welcome to ${...}! Enjoy.',
      'Welcome to {{0}}! Enjoy.',
      'Welcome to the Pros!',
      '"Look at you," said Mom.',
      "(Let's go)",
    ]) {
      expect(startsWithChatbotPhrase(text), text).toBe(true)
    }
  })

  it('needs the phrase at the start, in this case, and "Welcome to ...!" needs its exclamation mark', () => {
    for (const text of [
      'You said Good call to the vendor.',
      'good call, said the vendor.',
      'Dear ${...}, here is what happened.',
      'Welcome to the club, friend',
      'Welcome home!',
      'Welcome to the club. Enjoy!',
      'No consideration was given.',
      '',
    ]) {
      expect(startsWithChatbotPhrase(text), text).toBe(false)
    }
  })
})

describe('unitFlags', () => {
  const CLEAN = 'I got a detention for laughing in class.'

  it('gives no flag to a line that follows the rules', () => {
    expect(unitFlags(CLEAN, 'log')).toEqual([])
    expect(unitFlags('', 'text')).toEqual([])
  })

  it('flags a length over the aim, over the cap and over 180, with holes counting zero', () => {
    expect(unitFlags('x'.repeat(60), 'log')).toEqual([])
    expect(unitFlags('x'.repeat(61), 'log')).toEqual(['over-aim'])
    expect(unitFlags('x'.repeat(90), 'log')).toEqual(['over-aim'])
    expect(unitFlags('x'.repeat(91), 'log')).toEqual(['over-cap', 'over-aim'])
    expect(unitFlags('x'.repeat(100) + '{{0}}', 'outcome')).toEqual([])
    expect(unitFlags('x'.repeat(101), 'outcome')).toEqual(['over-aim'])
    expect(unitFlags('x'.repeat(121), 'outcome')).toEqual(['over-cap', 'over-aim'])
    expect(unitFlags('x'.repeat(110), 'scene')).toEqual([])
    expect(unitFlags('x'.repeat(141), 'scene')).toEqual(['over-cap', 'over-aim'])
    expect(unitFlags('x'.repeat(100), 'tooltip')).toEqual([])
    expect(unitFlags('x'.repeat(121), 'tooltip')).toEqual(['over-cap', 'over-aim'])
    expect(unitFlags('x'.repeat(100), 'digest')).toEqual([])
    expect(unitFlags('x'.repeat(111), 'digest')).toEqual(['over-cap', 'over-aim'])
    expect(unitFlags('x'.repeat(180), 'text')).toEqual([])
    expect(unitFlags('x'.repeat(181), 'text')).toEqual(['long'])
    expect(unitFlags('x'.repeat(181), 'log')).toEqual(['over-cap', 'over-aim', 'long'])
    expect(unitFlags('x'.repeat(170) + '${...}'.repeat(5), 'text')).toEqual([])
  })

  it('gives roles without a number, and roles it does not know, no length flag below 181', () => {
    for (const role of ['title', 'label', 'text', 'nonsense', 'constructor', 'toString']) {
      expect(unitFlags('x'.repeat(150), role), role).toEqual([])
    }
  })

  it('looks a role up among its own properties only', () => {
    // A role name that an inherited property would answer for (Object.prototype.title = 5) is still a role without a number.
    const inherited = Object.prototype as Record<string, unknown>
    inherited.title = 5
    inherited.log = 5
    try {
      expect(unitFlags('x'.repeat(50), 'title')).toEqual([])
      expect(unitFlags('x'.repeat(61), 'log')).toEqual(['over-aim'])
    } finally {
      delete inherited.title
      delete inherited.log
    }
  })

  it('judges the editable text: the era gate is split off first, colon gates too', () => {
    expect(unitFlags('@1950 ' + 'x'.repeat(60), 'log')).toEqual([])
    expect(unitFlags('@1998,own:mobilePhone ' + 'x'.repeat(60), 'log')).toEqual([])
    expect(unitFlags('@1950 Pay up: the rent is due today.', 'log')).toEqual([])
    expect(unitFlags('@1998,own:mobilePhone Pay up: the rent is due today.', 'log')).toEqual([])
    expect(unitFlags('@1998,own:mobilePhone Good call, said the vendor.', 'log')).toEqual(['chatbot'])
    expect(unitFlags('@1950 Mostly.', 'log')).toEqual(['stock'])
  })

  it('raises each rule flag on its own', () => {
    expect(unitFlags('You did not see it.', 'log')).toEqual(['no-contraction'])
    expect(unitFlags('The pantry was empty: nothing but old flour.', 'log')).toEqual(['colon-join'])
    expect(unitFlags('You held your own. Probably.', 'log')).toEqual(['punchline', 'qualifier'])
    expect(unitFlags('You paid the fine. Classic.', 'log')).toEqual(['punchline', 'stock'])
    expect(unitFlags('Nobody saw you take the last cookie.', 'log')).toEqual(['nobody'])
    expect(unitFlags('Everyone laughed when the cake fell.', 'log')).toEqual(['everyone'])
    expect(unitFlags('This is a fictional company.', 'log')).toEqual(['disclaimer'])
    expect(unitFlags('Not guaranteed, but you tried.', 'log')).toEqual(['disclaimer'])
    expect(unitFlags('Look at you, being a good person.', 'log')).toEqual(['chatbot'])
    expect(unitFlags('Your wallet needs a nap.', 'log')).toEqual(['stock'])
    expect(unitFlags('You quietly moved the money.', 'log')).toEqual(['tell'])
    expect(unitFlags('Somehow it worked out.', 'log')).toEqual(['tell'])
    expect(unitFlags('It suddenly got cold.', 'log')).toEqual(['tell'])
    expect(unitFlags('You felt a sense of calm.', 'log')).toEqual(['tell'])
    expect(unitFlags('The room smelled of smoke, soap and wet wool.', 'log')).toEqual(['list-of-three'])
    expect(unitFlags('You felt so proud.', 'log')).toEqual(['feeling-end'])
    expect(unitFlags('Wait\u2014what happened?', 'log')).toEqual(['em-dash'])
  })

  it('reports all sixteen flags in the fixed order on a line that breaks every rule', () => {
    // Starts with a ban-list phrase; has a colon join, Nobody, Everyone, a disclaimer word, an em-dash, a stock
    // phrase, a tell, a list of three and an uncontracted negative; runs past 180 characters; and ends on a
    // fragment that starts with a qualifier word and ends on a feeling.
    const text =
      'Good call from the vendor: nobody quietly told everyone it was fictional \u2014 and your wallet needs a nap, a tip and a tax, ' +
      'but you did not pay. ' +
      'x'.repeat(40) +
      '. Especially proud.'
    expect(staticLength(text)).toBeGreaterThan(180)
    expect(unitFlags(text, 'log')).toEqual([...FLAG_NAMES])
  })

  it('uses the same text on the holes whichever way they are written', () => {
    expect(unitFlags('You bought ${...}, ${...} and ${...}.', 'log')).toEqual(['list-of-three'])
    expect(unitFlags('You bought {{0}}, {{1}} and {{2}}.', 'log')).toEqual(['list-of-three'])
  })
})
