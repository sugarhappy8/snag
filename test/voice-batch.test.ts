// The rewrite tool's first half: `scripts/voice-batch.mjs extract` and the library behind it
// (scripts/voice/units.mjs). extract picks the string literals of src/ that break the voice rules and writes
// them as a JSON batch that a rewriting agent can edit without ever seeing the code. It is driven the way the
// controller runs it, through the command line, on small source trees built from test/fixtures/voice-batch.
// The fixtures are committed as .txt because tsc compiles every .ts under test/ and they are deliberately odd.
//
// Every game sentence in this file is made up. None may equal a string of src/: extract leaves alone any text
// that a test pins, so a test file that repeated a real game string would shield that string from rewriting.
// The file is pure ASCII (Unicode is written as escapes) so that no editor or tool can change it.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'voice-batch.mjs')
const FIXTURES = join(ROOT, 'test', 'fixtures', 'voice-batch')
const CORPUS_URL = pathToFileURL(join(ROOT, 'scripts', 'voice', 'corpus.mjs')).href
const UNITS_URL = pathToFileURL(join(ROOT, 'scripts', 'voice', 'units.mjs')).href

interface Sibling {
  role: string
  text: string
}
interface Unit {
  id: string
  sha: string
  role: string
  text: string
  holes: string[]
  tag: string
  limit: number
  maxWords?: number
  flags: string[]
  siblings: Sibling[]
  code: string
}
interface Batch {
  version: number
  root: string
  units: Unit[]
  counts: {
    total: number
    byRole: Record<string, number>
    byFlag: Record<string, number>
    pinnedExcluded: number
    lexErrorFiles: string[]
  }
}

const trash: string[] = []
afterAll(() => {
  for (const dir of trash) rmSync(dir, { recursive: true, force: true })
})

const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-batch-'))
  trash.push(dir)
  return dir
}

// ---------------------------------------------------------------------------------------------------------
// The temporary repository: each fixture becomes one file of src/, at the path that gives it its shape.

const LAYOUT: [fixture: string, path: string][] = [
  ['pool-kids.ts.txt', 'src/game/events/era-pack-1900-kids.ts'],
  ['pool-objects.ts.txt', 'src/game/events/era-pack-1980-child.ts'],
  ['alias-say.ts.txt', 'src/game/events/era-pack-2000-alias.ts'],
  ['helpers-self.ts.txt', 'src/game/events/helpers.ts'],
  ['events-short-keys.ts.txt', 'src/game/events/era-pack-1980-events.ts'],
  ['events-setup-say.ts.txt', 'src/game/events/era-pack-1946-adultevents.ts'],
  ['events-index.ts.txt', 'src/game/events.ts'],
  ['digest-early.ts.txt', 'src/game/history/digest-early.ts'],
  ['digest-late.ts.txt', 'src/game/history/digest-late.ts'],
  ['digest-menu.ts.txt', 'src/game/history/digest-menu.ts'],
  ['club-menu.ts.txt', 'src/game/business/club-menu.ts'],
  ['special-say.ts.txt', 'src/game/special/actor.ts'],
  ['local-say.ts.txt', 'src/game/computer/dev-venture.ts'],
  ['other-say.ts.txt', 'src/game/activities/nightlife.ts'],
  ['loose-calls.ts.txt', 'src/game/misc/loose.ts'],
  ['excluded.ts.txt', 'src/game/excluded.ts'],
  ['keyed-table.ts.txt', 'src/game/data/keyed.ts'],
  ['excluded.tsx.txt', 'src/ui/Panel.tsx'],
  ['columns.ts.txt', 'src/game/columns.ts'],
  ['settings.tsx.txt', 'src/ui/screens/SettingsScreen.tsx'],
  ['settings.tsx.txt', 'src/ui/screens/AboutScreen.tsx'],
  ['short.ts.txt', 'src/game/events/custom.ts'],
  ['broken.ts.txt', 'src/game/broken.ts'],
  ['limits.ts.txt', 'src/game/limits.ts'],
  ['siblings.ts.txt', 'src/game/siblings.ts'],
]

/** A test file of the temporary repository that pins some of the texts of src/ (see excluded.ts and short.ts). */
const PINS_TEST = [
  '// A test that pins some of the texts of src/: extract must leave exactly these alone.',
  "import { expect, it } from 'vitest'",
  "it('pins texts', () => {",
  "  expect(1).toBe('Nobody pinned this exact sentence.')",
  "  expect(1).toBe('Then Everyone cheered. The end.')",
  "  expect(1).toBe('The hall is empty.')",
  "  expect(1).toBe('Nobody said \"stop\" to the pinned door.')",
  '  expect(1).toBe("Nobody\'s curly door is open.")',
  "  expect(1).toBe('Nobody pinned {{0}}.')",
  "  expect(1).toContain('Feel free to')",
  '  expect(1).toContain("Let\'s go on")',
  "  expect(1).toContain('Good call')",
  '})',
  '',
].join('\n')

/** A test file that does not lex (an unterminated string): extract reads it as plain text, so even a comment pins. */
const BROKEN_TEST = ['// Nobody pinned by a broken test file.', "const open = 'never closed", ''].join('\n')

/** The texts that the two files above pin and a default run would otherwise export (they all carry a flag). */
const PINNED = [
  'Everyone cheered.',
  'Nobody pinned this exact sentence.',
  'Nobody said "stop" to the pinned door.',
  'Nobody pinned by a broken test file.',
  'Feel free to',
]

/** The texts that src/game/data/keyed.ts looks up (a key, two comparisons, a case, an index) and excluded.ts lists. */
const LOOKED_UP = [
  'Nobody opens the shop on Sundays.',
  'Nobody sells tickets at the door.',
  'Nobody sells programs at the door.',
  'Nobody locks the gate at night.',
  'Nobody reads the gate sign aloud.',
]

const TEST_FILES = { 'test/pins.test.ts': PINS_TEST, 'test/broken.test.ts': BROKEN_TEST }

function makeRepo(layout: [string, string][] = LAYOUT, extra: Record<string, string> = TEST_FILES): string {
  const dir = scratch()
  for (const [fixture, path] of layout) put(dir, path, readFileSync(join(FIXTURES, fixture), 'utf8'))
  for (const [path, text] of Object.entries(extra)) put(dir, path, text)
  return dir
}

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

let shared: string | null = null
/** One repository for the tests that only read it. */
function repo(): string {
  shared ??= makeRepo()
  return shared
}

// ---------------------------------------------------------------------------------------------------------
// Running the tool

interface Result {
  status: number | null
  stdout: string
  stderr: string
  out: string
  /** The batch file as written, or null when none was. */
  bytes: string | null
}

function run(args: string[], options: { cwd?: string; out?: string } = {}): Result {
  const out = options.out ?? join(scratch(), 'batch.json')
  const child = spawnSync(process.execPath, [SCRIPT, 'extract', ...args, '--out', out], {
    encoding: 'utf8',
    cwd: options.cwd,
    maxBuffer: 256 * 1024 * 1024,
  })
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    out,
    bytes: existsSync(out) ? readFileSync(out, 'utf8') : null,
  }
}

function extract(root: string, args: string[] = []): Batch {
  const result = run(['--root', root, ...args])
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  if (result.bytes === null) throw new Error('extract wrote no batch')
  return JSON.parse(result.bytes) as Batch
}

const fileOf = (u: Unit): string => parseId(u.id).file

function parseId(id: string): { file: string; line: number; col: number } {
  const m = /^(.*):(\d+):(\d+)$/.exec(id)
  if (!m) throw new Error(`not an id: ${id}`)
  return { file: m[1], line: Number(m[2]), col: Number(m[3]) }
}

/** Order of ids: the path as a plain string, then the line, then the column. */
function byPosition(a: string, b: string): number {
  const x = parseId(a)
  const y = parseId(b)
  return x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line || x.col - y.col
}

/** Where a snippet starts in a file of the temporary repository, as an id. Counted here, not by the tool. */
function positionOf(root: string, file: string, snippet: string): string {
  const src = readFileSync(join(root, file), 'utf8')
  const at = src.indexOf(snippet)
  if (at < 0) throw new Error(`${snippet} is not in ${file}`)
  const line = src.slice(0, at).split('\n').length
  const col = at - (src.lastIndexOf('\n', at - 1) + 1) + 1
  return `${file}:${line}:${col}`
}

const sha8 = (literal: string): string => createHash('sha256').update(literal, 'utf8').digest('hex').slice(0, 8)

/** The units of one file, in the order of the batch. */
const unitsIn = (batch: Batch, file: string): Unit[] => batch.units.filter((u) => fileOf(u) === file)

function unit(batch: Batch, file: string, text: string): Unit {
  const found = unitsIn(batch, file).filter((u) => u.text === text)
  if (found.length !== 1) throw new Error(`${found.length} units with the text ${JSON.stringify(text)} in ${file}`)
  return found[0]
}

// ---------------------------------------------------------------------------------------------------------
// What each fixture must give: [role, text, flags, tag]. Hand-listed from the fixtures, in source order. The
// strings that are not in the lists are the ones that have no flag (a flag-free string is not exported) or
// that are code, and each of those is named in the test that covers it.

type Row = [role: string, text: string, flags: string, tag?: string]

const EXPECTED: Record<string, Row[]> = {
  'src/game/activities/nightlife.ts': [
    // result() is a popup like notice(); the say() of the activities helpers is unknown, so its texts stay text.
    ['title', 'Nobody Came Along', 'nobody'],
    ['text', 'Nobody came to the party.', 'nobody'],
    ['text', 'Everyone left early.', 'everyone'],
    // chat() is imported from a module that nothing is known about, so its arguments stay text as well.
    ['text', 'Nobody Chatted Here', 'nobody'],
    ['text', 'Nobody chatted for long.', 'nobody'],
    ['text', 'I chatted. Mostly.', 'punchline qualifier stock'],
    ['text', 'Nobody Heard Here', 'nobody'],
    ['text', 'Nobody heard the news today.', 'nobody'],
  ],
  'src/game/business/club-menu.ts': [
    ['label', 'Nobody Gets In Early', 'nobody'],
    ['tooltip', 'Costs $40. Nobody may refuse, and the staff are fictional.', 'nobody disclaimer'],
    ['tooltip', 'Nobody sees the desc.', 'nobody'],
    ['tooltip', 'Nobody reads the description.', 'nobody'],
    ['tooltip', 'Nobody Header Line', 'nobody'],
    ['tooltip', 'Nobody needs this tip.', 'nobody'],
    ['tooltip', 'Nobody sub line', 'nobody'],
    ['tooltip', 'Nobody note here.', 'nobody'],
    ['title', 'Nobody Title Here', 'nobody'],
    ['outcome', 'Nobody text without choices.', 'nobody'],
    ['text', 'Nobody Important', 'nobody'],
    ['title', 'Nobody Home Today', 'nobody'],
    ['outcome', 'The shop is shut and nobody knows why.', 'nobody'],
  ],
  'src/game/columns.ts': [
    ['text', 'Nobody knows the plain one.', 'nobody'],
    ['text', 'She said "hi" and nobody answered.', 'nobody'],
    ['text', 'Caf\u00e9 Zo\u00eb: nobody ordered.', 'nobody'],
    ['text', 'Nobody ordered the cr\u00e8me br\u00fbl\u00e9e.', 'nobody'],
    ['text', "Everyone's caf\u00e9 is closed.", 'everyone'],
    ['text', 'Nobody saw the emoji before this.', 'nobody'],
    ['text', 'Everyone {{0}} left.', 'everyone'],
    ['text', 'Nobody begins at the first column.', 'nobody'],
  ],
  'src/game/computer/dev-venture.ts': [
    // A file that defines its own say() says nothing about its arguments, even at the places of the event say().
    ['text', 'Nobody Bought It', 'nobody'],
    ['text', 'Nobody bought the pitch, so you went home.', 'nobody'],
  ],
  'src/game/events.ts': [['text', 'Nobody greets you at the index.', 'nobody']],
  'src/game/events/custom.ts': [
    ['text', 'Good call', 'chatbot'],
    ['text', "Let's go!", 'chatbot'],
    ['text', 'Welcome to {{0}}!', 'chatbot'],
    ['text', ' (abstract)', 'disclaimer'],
    ['text', 'Nobody home yet', 'nobody'],
    ['text', "Let's go on", 'chatbot'],
    ['text', "Let's nobody", 'chatbot'],
  ],
  'src/game/events/era-pack-1900-kids.ts': [
    // Family A: the lines of a pool() call are log lines, and the key of the pool is not text.
    ['log', 'Nobody warned me that the wooden cradle creaked all night long.', 'over-aim nobody'],
    ['log', 'Nobody lent me a phone, so I borrowed my uncle\u2019s.', 'nobody', '@1998,own:mobilePhone '],
    ['log', 'Everyone called me by my second name.', 'everyone', '@-1925 '],
    ['log', 'I learned to say "again!" and used it on every song. Mostly.', 'punchline qualifier stock'],
    ['log', 'Nobody saw me hide the slate under the bench.', 'nobody'],
    ['log', 'I did not hand in my sums that day.', 'no-contraction'],
    ['log', 'The teacher said: sit down and write it out again.', 'colon-join'],
  ],
  'src/game/events/era-pack-1946-adultevents.ts': [
    // Family C: ch() labels, a setup() scene, and the arguments of say(g, x, title, text, log).
    ['title', 'Nobody Waits Here', 'nobody'],
    ['label', 'Let everyone see your glasses', 'everyone'],
    ['label', 'Show nobody your teeth', 'nobody'],
    ['label', 'Pay {{0}} for nobody to see', 'nobody'],
    ['scene', 'A new clinic has opened and nobody can stop talking about it. Everyone is queuing. What will you do?', 'nobody everyone'],
    ['outcome', 'The optician put a frame on your nose. Nobody had told you leaves had edges.', 'nobody'],
    ['log', 'I got free spectacles. Mostly.', 'punchline qualifier stock'],
    ['title', 'Nobody Likes the Dentist', 'nobody'],
    ['outcome', 'You paid {{0}}. Nobody was gentle.', 'punchline nobody'],
    ['log', 'I did not enjoy it. Mostly.', 'no-contraction punchline qualifier stock'],
    ['title', 'Nobody Next Year', 'nobody'],
    ['outcome', 'You won the box. Nobody else had one.', 'nobody'],
    ['outcome', 'No box for you. Nobody cares.', 'punchline nobody'],
  ],
  'src/game/events/era-pack-1980-child.ts': [
    // Family A as the 1980 and 2000 packs write it: an object with a weight and a lines array.
    ['log', 'Nobody let me near the stereo, so I sang to the washing machine.', 'over-aim nobody'],
    ['log', 'Everyone in the house sang the theme song at breakfast.', 'everyone', '@tv '],
    ['log', 'I fell asleep to a purple dinosaur. Mostly.', 'punchline qualifier stock', '@1992,tv '],
    ['log', 'Nobody wore the car seat as proudly as I did.', 'nobody', '@1980,-1995 '],
    // Not a pool (no weight): a lines array of a brand is plain text.
    ['text', 'Nobody Soap and Detergent', 'nobody'],
    ['text', 'Nobody Bar of Soap', 'nobody'],
    ['text', 'Nobody Liquid Soap Bottle', 'nobody'],
    // The short keys are for an outcome object, which has a t and an x: this x is data.
    ['text', 'nobody:1999 everyone:2001 nobody:2005', 'nobody everyone'],
  ],
  'src/game/events/era-pack-1980-events.ts': [
    // Family B: title, the scene in the object that a text() function returns, label, hint.text and the
    // short keys t, x and l of an outcome, each of which may be a list of variants or a function.
    ['title', 'Nobody Beats the Machine', 'nobody'],
    ['scene', 'Nobody has beaten the machine in the corner yet. You have {{0}} in coins. What will you do?', 'nobody'],
    ['label', 'Feed the machine until nobody is left', 'nobody'],
    ['tooltip', 'Everyone says you have about {{0}}% to win.', 'everyone'],
    ['title', 'Nobody Is Faster', 'nobody'],
    ['outcome', 'You beat the top score. Nobody had ever typed their initials there.', 'nobody'],
    ['log', 'I put my initials at the top. Mostly.', 'punchline qualifier stock'],
    ['title', 'Nobody Cared At All', 'nobody'],
    ['outcome', '{{0}} said nobody was looking.', 'nobody'],
    // A string inside a hole is a piece of the text it sits in, not an outcome of its own.
    ['text', 'Nobody you know', 'nobody'],
    ['log', 'I did not win. Mostly.', 'no-contraction punchline qualifier stock'],
    ['label', 'Nobody wins anything here', 'nobody'],
    ['title', 'Nobody Home Today', 'nobody'],
    ['scene', 'Nobody answers the door at the end of the street. What will you do?', 'nobody'],
    ['outcome', 'Nobody came to the door.', 'nobody'],
    ['log', 'I knocked. Mostly.', 'punchline qualifier stock'],
    // A text() function with a block body that returns the scene, one of them in parentheses.
    ['title', 'Nobody Likes Rain', 'nobody'],
    ['scene', 'Nobody brought an umbrella to the game today. What will you do?', 'nobody'],
    ['scene', 'Nobody stayed dry at the game. What will you do?', 'nobody'],
  ],
  'src/game/events/era-pack-2000-alias.ts': [
    // The names a function is imported under do not matter, and an export-from line does not bind anything.
    ['label', 'Nobody asks twice', 'nobody'],
    ['title', 'Nobody Spoke Up', 'nobody'],
    ['outcome', 'Nobody spoke up when the teacher asked.', 'nobody'],
    ['log', 'I stayed quiet. Mostly.', 'punchline qualifier stock'],
  ],
  'src/game/events/helpers.ts': [
    // The module that defines say() knows its own shape, but a default value of its parameters is not a call.
    ['text', 'Nobody typed any text here', 'nobody'],
    ['title', 'Nobody Demo Title', 'nobody'],
    ['outcome', 'Nobody demo outcome text.', 'nobody'],
    ['log', 'I ran the demo. Mostly.', 'punchline qualifier stock'],
  ],
  'src/game/excluded.ts': [
    ['text', 'Nobody opened it.', 'nobody'],
    ['text', 'Nobody cheered.', 'nobody'],
    ['text', 'Nobody pinned this sentence too, and it is still open.', 'nobody'],
    ['text', 'Nobody pinned {{0}}.', 'nobody'],
    ['text', 'Nobody\u2019s curly door is open.', 'nobody'],
    ['text', 'Nobody keeps the shop open late.', 'nobody'],
  ],
  'src/game/history/digest-early.ts': [
    // Family D: every string of the two digest files is a digest line; the object keys are not.
    ['digest', 'Horse trams and gas lamps, and nobody owns a car.', 'nobody'],
    ['digest', 'Ragtime from every saloon piano. Everyone hums it. Mostly.', 'punchline qualifier everyone stock'],
    ['digest', 'Nobody laughs at the flying machine for {{0}} seconds.', 'nobody'],
    ['digest', 'Nobody said it was the first decade.', 'nobody'],
  ],
  'src/game/history/digest-late.ts': [['digest', 'Everyone has a video site open and nobody finishes a cartoon.', 'nobody everyone']],
  'src/game/history/digest-menu.ts': [
    // Next to the digests, but not one of them.
    ['text', 'Nobody reads the menu header', 'nobody'],
    ['text', 'Nobody pays the printed price any more.', 'nobody'],
  ],
  'src/game/misc/loose.ts': [
    // No import says where say(), notice() and ch() come from: the event shapes apply.
    ['title', 'Nobody Said Much', 'nobody'],
    ['outcome', 'Nobody said a word on the way home.', 'nobody'],
    ['log', 'I walked home. Mostly.', 'punchline qualifier stock'],
    ['title', 'Nobody Knew That', 'nobody'],
    ['outcome', 'Nobody knew {{0}} in {{1}}.', 'nobody'],
    ['label', 'Nobody sends cards', 'nobody'],
    // A method call (chat.say) is not a call of the function that is meant; \${ in a template is not a hole.
    ['text', 'Nobody Replied Here', 'nobody'],
    ['text', 'Nobody replied to the note.', 'nobody'],
    ['title', 'Nobody Paid Up', 'nobody'],
    ['outcome', 'Nobody pays ${5} but {{0}} is due.', 'nobody'],
  ],
  'src/game/special/actor.ts': [
    // Family E, the popups of the careers: say(g, title, text, emoji, tone) and tell(g, title, text).
    ['title', 'Nobody Called Back', 'nobody'],
    ['outcome', '{{0}} said nobody would hire you.', 'nobody'],
    ['outcome', 'Nobody clapped.', 'nobody'],
    ['title', 'Nobody Tells Rules', 'nobody'],
    ['outcome', 'Nobody tells you the rules of the room.', 'nobody'],
    // pick() hands its argument on; shout() is not a known call, so what is inside it is text.
    ['title', 'Nobody Left Early', 'nobody'],
    ['outcome', 'Nobody stayed until the end.', 'nobody'],
    ['outcome', 'Everyone left at the break.', 'everyone'],
    ['title', 'Nobody Counted', 'nobody'],
    ['text', 'Nobody counted the votes here.', 'nobody'],
  ],
  'src/ui/Panel.tsx': [
    ['title', 'Nobody can click this button', 'nobody'],
    ['text', 'Everyone can read this', 'everyone'],
    ['text', 'Nobody types here', 'nobody'],
  ],
  'src/ui/screens/AboutScreen.tsx': [
    ['text', 'Everything here is made up. People and companies are fictional and the money systems are simulated.', 'disclaimer'],
    ['text', 'Nobody should treat the fictional crime systems as advice.', 'nobody disclaimer'],
  ],
  'src/ui/screens/SettingsScreen.tsx': [['text', 'Nobody should treat the fictional crime systems as advice.', 'nobody']],
}

/** Fixtures that have a test of their own (their texts are long, or only there for their position). */
const OWN_TEST = ['src/game/limits.ts', 'src/game/siblings.ts']

function tableOf(batch: Batch, pick: (u: Unit) => string[]): Record<string, string[][]> {
  const table: Record<string, string[][]> = {}
  for (const u of batch.units) {
    if (OWN_TEST.includes(fileOf(u))) continue
    ;(table[fileOf(u)] ??= []).push(pick(u))
  }
  return table
}

const expectedTable = (pick: (r: Row) => string[]): Record<string, string[][]> =>
  Object.fromEntries(Object.entries(EXPECTED).map(([file, rows]) => [file, rows.map(pick)]))

describe('voice-batch extract', () => {
  it('infers roles from pool, say, notice and property names', () => {
    const got = tableOf(extract(repo()), (u) => [u.role, u.text])
    const want = expectedTable((r) => [r[0], r[1]])
    expect(Object.keys(got)).toEqual(Object.keys(want))
    for (const file of Object.keys(want)) expect(got[file], file).toEqual(want[file])
  })

  it('raises the voice flags on each unit, judging the text without its era tag', () => {
    const got = tableOf(extract(repo()), (u) => [u.text, u.flags.join(' ')])
    const want = expectedTable((r) => [r[1], r[2]])
    for (const file of Object.keys(want)) expect(got[file], file).toEqual(want[file])
  })

  it('shows holes as {{n}} and splits off an era tag', () => {
    const batch = extract(repo())
    const kids = 'src/game/events/era-pack-1900-kids.ts'
    // The tag, with the white space after it, is kept out of the text and out of the judgement: the line is 71
    // characters with its tag, 49 without, and only a line over 60 is over the aim of a log line.
    const phone = unit(batch, kids, 'Nobody lent me a phone, so I borrowed my uncle\u2019s.')
    expect(phone).toMatchObject({ tag: '@1998,own:mobilePhone ', holes: [], flags: ['nobody'], limit: 90 })
    expect(unit(batch, kids, 'Everyone called me by my second name.').tag).toBe('@-1925 ')
    expect(unit(batch, kids, 'I learned to say "again!" and used it on every song. Mostly.').tag).toBe('')
    // The other gates of the packs.
    const child = 'src/game/events/era-pack-1980-child.ts'
    expect(unit(batch, child, 'Everyone in the house sang the theme song at breakfast.').tag).toBe('@tv ')
    expect(unit(batch, child, 'Nobody wore the car seat as proudly as I did.').tag).toBe('@1980,-1995 ')

    // Holes, in order, as the source of their expressions; the static text keeps everything else.
    const events = 'src/game/events/era-pack-1980-events.ts'
    expect(unit(batch, events, 'Nobody has beaten the machine in the corner yet. You have {{0}} in coins. What will you do?').holes).toEqual([
      'money(eraPrice(g, 3))',
    ])
    expect(unit(batch, events, 'Everyone says you have about {{0}}% to win.').holes).toEqual(['pct'])
    expect(unit(batch, events, '{{0}} said nobody was looking.').holes).toEqual(["x.p?.firstName ?? 'Nobody you know'"])
    const loose = unit(batch, 'src/game/misc/loose.ts', 'Nobody knew {{0}} in {{1}}.')
    expect(loose.holes).toEqual(['g.character.name', 'town ?? `the ${g.year} fair`'])
    expect(unit(batch, 'src/game/history/digest-early.ts', 'Nobody laughs at the flying machine for {{0}} seconds.').holes).toEqual(['12'])
    // '${' + holes[n] + '}' is exactly what stood in the source.
    const src = readFileSync(join(repo(), 'src/game/misc/loose.ts'), 'utf8')
    expect(src).toContain(`\`Nobody knew \${${loose.holes[0]}} in \${${loose.holes[1]}}.\``)
    // A \${ that is escaped is text, not a hole; the text keeps the characters it decoded to.
    const paid = unit(batch, 'src/game/misc/loose.ts', 'Nobody pays ${5} but {{0}} is due.')
    expect(paid.holes).toEqual(['g.price'])
    // A plain string has no holes, and a string that merely looks like a hole is not one.
    expect(unit(batch, kids, 'I did not hand in my sums that day.').holes).toEqual([])
    expect(unit(batch, 'src/game/excluded.ts', 'Nobody pinned {{0}}.').holes).toEqual(["'this'"])
  })

  it('sets limits by role and the label word cap', () => {
    const batch = extract(repo())
    const limitOf = (file: string, text: string): [number, number | undefined] => {
      const u = unit(batch, file, text)
      return [u.limit, u.maxWords]
    }
    const events = 'src/game/events/era-pack-1980-events.ts'
    // The roles that have a number get it, however long the original is.
    expect(limitOf('src/game/events/era-pack-1900-kids.ts', 'I did not hand in my sums that day.')).toEqual([90, undefined])
    expect(limitOf(events, 'Nobody came to the door.')).toEqual([120, undefined])
    expect(limitOf(events, 'Everyone says you have about {{0}}% to win.')).toEqual([120, undefined])
    expect(limitOf('src/game/history/digest-late.ts', 'Everyone has a video site open and nobody finishes a cartoon.')).toEqual([110, undefined])
    // A scene shorter than the cap still gets the cap.
    expect(limitOf(events, 'Nobody answers the door at the end of the street. What will you do?')).toEqual([140, undefined])
    // title, label and text are capped at the length of the original, a hole counting 0; a label has a word cap.
    expect(limitOf(events, 'Nobody Beats the Machine')).toEqual([24, undefined])
    expect(limitOf(events, 'Feed the machine until nobody is left')).toEqual([37, 5])
    expect(limitOf('src/game/misc/loose.ts', 'Nobody sends cards')).toEqual([18, 5])
    expect(limitOf('src/game/events/custom.ts', 'Welcome to {{0}}!')).toEqual([12, undefined])
    expect(limitOf('src/game/events.ts', 'Nobody greets you at the index.')).toEqual([31, undefined])
    expect(limitOf('src/game/events/era-pack-1946-adultevents.ts', 'Pay {{0}} for nobody to see')).toEqual([22, 5])
    // ... and never above 180; a scene, a tooltip and a log line are capped even when the original is longer.
    const wide = unitsIn(batch, 'src/game/limits.ts').map((u) => [u.role, u.text.length, u.limit, u.maxWords, u.flags.join(' ')])
    expect(wide).toEqual([
      ['title', 200, 180, undefined, 'long nobody'],
      ['label', 190, 180, 5, 'long nobody'],
      ['text', 250, 180, undefined, 'long nobody'],
      ['scene', 150, 140, undefined, 'over-cap over-aim nobody'],
      ['tooltip', 130, 120, undefined, 'over-cap over-aim nobody'],
      ['log', 100, 90, undefined, 'over-cap over-aim nobody'],
    ])
    // maxWords belongs to labels alone.
    for (const u of batch.units) expect('maxWords' in u, u.id).toBe(u.role === 'label')
  })

  it('excludes ids, keys, comparisons and strings a test pins', () => {
    const batch = extract(repo())
    const texts = new Set(batch.units.map((u) => u.text))
    // Each of these would be exported if it were text: it holds a flagged word and is long enough.
    const code = [
      'nobody.club.id', 'nobody-kind-value', 'nobody-type-value', 'nobody-flag-value', 'nobody-slot-value', 'nobody-icon-value',
      'nobody-emoji-value', 'nobody-key-value', // properties id, kind, type, flag, slot, icon, emoji, key
      'e1900.nobody.key', 'nobody.80.baby', // the key of a pool, and the key property of a pool object
      './nobody-here', './nobody-moods', // import
      'Nobody is at home', 'Everyone is at home', // type
      'Nobody answers the door', 'Everyone is welcome', // compare
      'Nobody is in the hall', // case
      'Nobody lives here', 'Everyone lives here', // an object key (quoted), and obj['...']
      'the nobody decade', // a quoted key of a digest table
      'nobody-panel everyone-panel', 'nobody-kind-value', 'nobody-id-value', 'nobody-type-value', // JSX markup attributes
    ]
    for (const text of code) expect(texts.has(text), text).toBe(false)
    // A comparison next to a real text: the operand goes, the returned text stays.
    expect(texts.has('Nobody opened it.')).toBe(true)

    // Pinned: a test file of the repository holds the whole text (12 characters or more, no hole). They are
    // counted when they would be exported: 'The hall is empty.' is pinned too, but has no flag.
    for (const text of PINNED) expect(texts.has(text), text).toBe(false)
    // Looked up: the same sentence is a key, a comparison, a case or an index in another file (keyed.ts); a list
    // that holds it (MOMENTS in excluded.ts) must keep it, or the lookup stops finding it.
    for (const text of LOOKED_UP) expect(texts.has(text), text).toBe(false)
    expect(batch.counts.pinnedExcluded).toBe(PINNED.length + LOOKED_UP.length)
    // Not pinned: a text that differs by a curly quote (quotes are not normalised), a text with a hole (the
    // test holds its {{0}} form, which is not a pin), a text of 11 characters, and longer neighbours; and the
    // sentence of the list that no code looks up.
    for (const text of ['Nobody\u2019s curly door is open.', 'Nobody pinned {{0}}.', "Let's go on", 'Nobody pinned this sentence too, and it is still open.', 'Nobody cheered.', 'Nobody keeps the shop open late.']) {
      expect(texts.has(text), text).toBe(true)
    }
    // The lookups are found in files that the run does not select: one file asked for, the same exclusions.
    const alone = extract(repo(), ['--files', 'src/game/excluded.ts'])
    for (const text of LOOKED_UP) expect(alone.units.some((u) => u.text === text), text).toBe(false)
    expect(alone.units.some((u) => u.text === 'Nobody keeps the shop open late.')).toBe(true)
    expect(alone.counts.pinnedExcluded).toBe(PINNED.length - 1 + LOOKED_UP.length) // all the pinned texts but 'Feel free to', which is in custom.ts

    // A pinned text asked for by id is left out and counted too, unless --include-pinned says otherwise.
    const hall = positionOf(repo(), 'src/game/excluded.ts', "'The hall is empty.'")
    const asked = extract(repo(), ['--ids', hall])
    expect(asked.units).toEqual([])
    expect(asked.counts.pinnedExcluded).toBe(1)
    const kept = extract(repo(), ['--ids', hall, '--include-pinned'])
    expect(kept.units.map((u) => u.text)).toEqual(['The hall is empty.'])
    expect(kept.counts.pinnedExcluded).toBe(0)
    const all = extract(repo(), ['--include-pinned'])
    const allTexts = new Set(all.units.map((u) => u.text))
    for (const text of PINNED) expect(allTexts.has(text), text).toBe(true)
    expect(all.counts.pinnedExcluded).toBe(0)
    expect(all.units.length).toBe(batch.units.length + PINNED.length + LOOKED_UP.length)
  })

  describe('selection', () => {
    const everything = (): Unit[] => extract(repo()).units

    it('selects by flag, by id and after an id, in stable order', () => {
      const all = everything()
      // Plain string order of the paths, then position in the file: 'src/game/events.ts' sorts before
      // 'src/game/events/custom.ts' ('.' is before '/'), which a walk of the folders would get the other way.
      const ids = all.map((u) => u.id)
      expect(ids).toEqual([...ids].sort(byPosition))
      const keys = ids.map(parseId)
      const files = [...new Set(keys.map((k) => k.file))]
      expect(files.indexOf('src/game/events.ts')).toBeLessThan(files.indexOf('src/game/events/custom.ts'))

      // By flag: every unit that has one of the flags, whole (all of its flags still listed), in the same order.
      const stock = extract(repo(), ['--flags', 'stock']).units
      expect(stock.length).toBeGreaterThan(3)
      expect(stock).toEqual(all.filter((u) => u.flags.includes('stock')))
      const two = extract(repo(), ['--flags', 'colon-join,chatbot']).units
      expect(two).toEqual(all.filter((u) => u.flags.includes('colon-join') || u.flags.includes('chatbot')))
      expect(two.some((u) => u.flags.includes('colon-join'))).toBe(true)
      expect(two.some((u) => u.flags.includes('chatbot'))).toBe(true)
      // A flag that no unit has gives an empty batch, not an error.
      expect(extract(repo(), ['--flags', 'em-dash']).units).toEqual([])

      // By file: the exact path, or the tail of a path; the order of the list does not matter.
      const two2 = extract(repo(), ['--files', 'src/game/columns.ts,era-pack-1900-kids.ts'])
      expect(two2.units).toEqual(all.filter((u) => ['src/game/columns.ts', 'src/game/events/era-pack-1900-kids.ts'].includes(fileOf(u))))
      expect(extract(repo(), ['--files', 'era-pack-1900-kids.ts,src/game/columns.ts'])).toEqual(two2)
      expect(extract(repo(), ['--files', './src/game/columns.ts']).units).toEqual(all.filter((u) => fileOf(u) === 'src/game/columns.ts'))
      // The tail has to start after a "/": events.ts is src/game/events.ts and not era-pack-1980-events.ts.
      expect(new Set(extract(repo(), ['--files', 'events.ts']).units.map(fileOf))).toEqual(new Set(['src/game/events.ts']))
      expect(extract(repo(), ['--files', 'src/ui/screens/SettingsScreen.tsx']).units.map((u) => u.id)).toEqual(
        all.filter((u) => fileOf(u) === 'src/ui/screens/SettingsScreen.tsx').map((u) => u.id),
      )

      // By id: exactly those units, flags or not (a unit without a flag is not exported otherwise), in file order.
      const kids = 'src/game/events/era-pack-1900-kids.ts'
      const flaggedId = positionOf(repo(), kids, "'Nobody warned me")
      const plainId = positionOf(repo(), kids, "'I was bathed in the kitchen sink")
      const columnsId = positionOf(repo(), 'src/game/columns.ts', "'Nobody ordered the cr")
      const byId = extract(repo(), ['--ids', `${columnsId},${plainId},${flaggedId}`]).units
      expect(byId.map((u) => u.id)).toEqual([columnsId, flaggedId, plainId].sort(byPosition))
      const plain = byId.find((u) => u.id === plainId)
      expect(plain).toMatchObject({ role: 'log', text: 'I was bathed in the kitchen sink and objected loudly.', flags: [] })
      expect(byId.find((u) => u.id === flaggedId)).toEqual(all.find((u) => u.id === flaggedId))
      // --ids together with --flags: both must hold.
      expect(extract(repo(), ['--ids', `${flaggedId},${plainId}`, '--flags', 'nobody']).units.map((u) => u.id)).toEqual([flaggedId])

      // An id that is no unit is named on stderr; the others are still written.
      const lost = `${kids}:1:1`
      const withLost = run(['--root', repo(), '--ids', `${lost},${flaggedId}`])
      expect(withLost.status).toBe(0)
      expect(withLost.stderr).toContain(lost)
      expect((JSON.parse(withLost.bytes ?? '') as Batch).units.map((u) => u.id)).toEqual([flaggedId])

      // After an id: the units that come strictly after it, whether or not that id is a unit.
      const k = Math.floor(all.length / 2)
      expect(extract(repo(), ['--after', all[k].id]).units).toEqual(all.slice(k + 1))
      expect(extract(repo(), ['--after', all[all.length - 1].id]).units).toEqual([])
      expect(extract(repo(), ['--after', plainId]).units).toEqual(all.filter((u) => byPosition(u.id, plainId) > 0))
      // ... and with a flag and a file, in the same order.
      expect(extract(repo(), ['--after', all[2].id, '--flags', 'nobody']).units).toEqual(all.slice(3).filter((u) => u.flags.includes('nobody')))
    })

    it('stops at --max and says how to go on', () => {
      const all = everything()
      const first = run(['--root', repo(), '--max', '4'])
      expect(first.status).toBe(0)
      const batch = JSON.parse(first.bytes ?? '') as Batch
      expect(batch.units).toEqual(all.slice(0, 4))
      expect(batch.counts.total).toBe(4)
      expect(first.stdout).toContain(`--after ${all[3].id}`)
      const next = JSON.parse(run(['--root', repo(), '--max', '4', '--after', all[3].id]).bytes ?? '') as Batch
      expect(next.units).toEqual(all.slice(4, 8))
      // Nothing is left over when the batch holds everything.
      expect(run(['--root', repo()]).stdout).not.toContain('--after')
    })

    it('counts the batch by role and by flag', () => {
      for (const args of [[], ['--flags', 'nobody'], ['--files', 'src/game/events/era-pack-1980-events.ts'], ['--max', '9']]) {
        const batch = extract(repo(), args)
        const byRole: Record<string, number> = {}
        const byFlag: Record<string, number> = {}
        for (const u of batch.units) {
          byRole[u.role] = (byRole[u.role] ?? 0) + 1
          for (const f of u.flags) byFlag[f] = (byFlag[f] ?? 0) + 1
        }
        expect(batch.counts.total, args.join(' ')).toBe(batch.units.length)
        expect(batch.counts.byRole, args.join(' ')).toEqual(byRole)
        expect(batch.counts.byFlag, args.join(' ')).toEqual(byFlag)
      }
      const batch = extract(repo())
      expect(batch.version).toBe(1)
      expect(batch.root).toBe(repo())
      expect(Object.keys(batch)).toEqual(['version', 'root', 'units', 'counts'])
      expect(Object.keys(batch.counts)).toEqual(['total', 'byRole', 'byFlag', 'pinnedExcluded', 'lexErrorFiles'])
      // The tallies list roles and flags in a fixed order, so that the same batch is the same bytes.
      const rank = (order: string[]) => (a: string, b: string) => order.indexOf(a) - order.indexOf(b)
      const roleOrder = ['log', 'scene', 'outcome', 'title', 'label', 'tooltip', 'digest', 'text']
      const flagOrder = ['over-cap', 'over-aim', 'long', 'no-contraction', 'colon-join', 'punchline', 'qualifier', 'nobody', 'everyone', 'disclaimer', 'chatbot', 'stock', 'tell', 'list-of-three', 'feeling-end', 'em-dash']
      expect(Object.keys(batch.counts.byRole)).toEqual(Object.keys(batch.counts.byRole).sort(rank(roleOrder)))
      expect(Object.keys(batch.counts.byFlag)).toEqual(Object.keys(batch.counts.byFlag).sort(rank(flagOrder)))
      expect(Object.keys(batch.counts.byRole).length).toBeGreaterThan(5)
      expect(Object.keys(batch.counts.byFlag).length).toBeGreaterThan(8)
      expect(Object.keys(batch.units[0])).toEqual(['id', 'sha', 'role', 'text', 'holes', 'tag', 'limit', 'flags', 'siblings', 'code'])
      const label = batch.units.find((u) => u.role === 'label')
      expect(Object.keys(label ?? {})).toEqual(['id', 'sha', 'role', 'text', 'holes', 'tag', 'limit', 'maxWords', 'flags', 'siblings', 'code'])
    })
  })

  it('exposes extractUnits, with the options of the command, and the id helpers for apply', () => {
    const program = `
      import { extractUnits, literalSha, parseId, compareIds } from ${JSON.stringify(UNITS_URL)}
      const [root, id] = process.argv.slice(1)
      const fail = (options) => { try { extractUnits({ root, ...options }); return 'no error' } catch (e) { return e.constructor.name + ': ' + e.message } }
      process.stdout.write(JSON.stringify({
        all: extractUnits({ root }),
        some: extractUnits({ root, flags: ['stock'], files: ['src/game/misc/loose.ts'], max: 1, min: 14, includePinned: true }),
        byId: extractUnits({ root, ids: [id] }),
        after: extractUnits({ root, after: id, max: 2 }),
        sha: literalSha("'x'"),
        parsed: parseId('src/a.ts:3:14'),
        order: [compareIds('a.ts:1:2', 'a.ts:1:10'), compareIds('b.ts:1:1', 'a.ts:9:9'), compareIds('a.ts:2:2', 'a.ts:2:2')],
        notAnId: parseId('src/a.ts'),
        errors: [fail({ flags: ['nope'] }), fail({ max: 0 }), fail({ files: ['nothing.ts'] }), fail({ ids: ['x'] })],
      }))
    `
    const id = positionOf(repo(), 'src/game/misc/loose.ts', "'Nobody Said Much'")
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', program, repo(), id], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    const api = JSON.parse(child.stdout) as Record<string, unknown>
    // The same batch as the command writes, option for option.
    expect(api.all).toEqual(extract(repo()))
    expect(api.some).toEqual(extract(repo(), ['--flags', 'stock', '--files', 'src/game/misc/loose.ts', '--max', '1', '--min', '14', '--include-pinned']))
    expect(api.byId).toEqual(extract(repo(), ['--ids', id]))
    expect(api.after).toEqual(extract(repo(), ['--after', id, '--max', '2']))
    expect((api.some as Batch).units).toHaveLength(1)
    expect((api.after as Batch).units).toHaveLength(2)
    expect(api.sha).toBe(sha8("'x'"))
    expect(api.parsed).toEqual({ file: 'src/a.ts', line: 3, col: 14 })
    expect(api.notAnId).toBeNull()
    expect((api.order as number[]).map((n) => Math.sign(n))).toEqual([-1, 1, 0])
    expect(api.errors).toEqual([
      expect.stringMatching(/^UsageError: .*nope/),
      expect.stringMatching(/^UsageError: --max/),
      expect.stringMatching(/^UsageError: .*nothing\.ts/),
      expect.stringMatching(/^UsageError: --ids/),
    ])
  })

  it('two runs give identical bytes', () => {
    const one = run(['--root', repo()])
    const two = run(['--root', repo()], { cwd: scratch() })
    expect(one.bytes).not.toBeNull()
    expect(two.bytes).toBe(one.bytes)
    expect(one.bytes?.endsWith('}\n')).toBe(true)
    expect(one.bytes).toBe(JSON.stringify(JSON.parse(one.bytes ?? ''), null, 2) + '\n')
    expect(two.stdout.replaceAll(two.out, one.out)).toBe(one.stdout)
    // The same repository built in another order, and the same files named in another order, give the same units.
    const other = makeRepo([...LAYOUT].reverse())
    const a = extract(repo(), ['--files', 'src/game/events/custom.ts,src/game/columns.ts'])
    const b = extract(other, ['--files', 'src/game/columns.ts,src/game/events/custom.ts'])
    expect({ ...b, root: a.root }).toEqual(a)
    expect(extract(other).units).toEqual(extract(repo()).units)
    expect(extract(other).counts).toEqual(extract(repo()).counts)
    // No clock, no random value: nothing in the file changes with time.
    expect(one.bytes).not.toMatch(/20\d\d-\d\d-\d\dT/)
  })

  it('lists siblings and the code line', () => {
    const batch = extract(repo())
    const events = 'src/game/events/era-pack-1946-adultevents.ts'
    // The other literals of the same pair of brackets, whichever argument they are in; both branches of a
    // conditional are there, with the role each has.
    expect(unit(batch, events, 'Nobody Next Year').siblings).toEqual([
      { role: 'title', text: 'The Big Box' },
      { role: 'outcome', text: 'You won the box. Nobody else had one.' },
      { role: 'outcome', text: 'No box for you. Nobody cares.' },
    ])
    expect(unit(batch, events, 'Show nobody your teeth').siblings).toEqual([{ role: 'label', text: 'Pay {{0}} for nobody to see' }])
    // The tone ('good') and the emoji of a say() are not text: they are not siblings, and a popup of the careers
    // does not list its emoji or tone either.
    expect(unit(batch, events, 'The optician put a frame on your nose. Nobody had told you leaves had edges.').siblings).toEqual([
      { role: 'title', text: 'Seeing Clearly' },
      { role: 'log', text: 'I got free spectacles. Mostly.' },
    ])
    expect(unit(batch, 'src/game/special/actor.ts', 'Nobody Called Back').siblings).toEqual([{ role: 'outcome', text: '{{0}} said nobody would hire you.' }])
    // A list of variants: the other variants.
    expect(unit(batch, events, 'Nobody Likes the Dentist').siblings).toEqual([{ role: 'title', text: 'The Dentist' }])
    expect(unit(batch, events, 'I did not enjoy it. Mostly.').siblings).toEqual([{ role: 'log', text: 'I went to the dentist.' }])
    // The popup of a say() that has lists around it: what is directly in its brackets is only the text.
    expect(unit(batch, events, 'You paid {{0}}. Nobody was gentle.').siblings).toEqual([])
    // An outcome object: the other keys that hold text (the tone and the numbers do not).
    expect(unit(batch, 'src/game/events/era-pack-1980-events.ts', 'Nobody Is Faster').siblings).toEqual([
      { role: 'outcome', text: 'You beat the top score. Nobody had ever typed their initials there.' },
      { role: 'log', text: 'I put my initials at the top. Mostly.' },
    ])
    // The lines of a table, even the ones without a flag, and a template shows its holes.
    expect(unit(batch, 'src/game/history/digest-early.ts', 'Horse trams and gas lamps, and nobody owns a car.').siblings).toEqual([
      { role: 'digest', text: 'Ragtime from every saloon piano. Everyone hums it. Mostly.' },
      { role: 'digest', text: 'Teddy bears are the toy of the year.' },
      { role: 'digest', text: 'Nobody laughs at the flying machine for {{0}} seconds.' },
    ])
    // A literal alone at the top of a file has none: there is no pair of brackets around it.
    expect(unit(batch, 'src/game/events.ts', 'Nobody greets you at the index.').siblings).toEqual([])
    // ... and its line is the last one of a file that has no newline at the end.
    expect(unit(batch, 'src/game/events.ts', 'Nobody greets you at the index.').code).toBe("export const HELLO = 'Nobody greets you at the index.'")
    // The tag is not part of a sibling's text.
    expect(unit(batch, 'src/game/events/era-pack-1980-child.ts', 'Nobody wore the car seat as proudly as I did.').siblings).toEqual([])

    // At most six, the nearest in the source: nine lines in a pool.
    const nine = unitsIn(batch, 'src/game/siblings.ts').filter((u) => u.role === 'log')
    expect(nine).toHaveLength(9)
    const near = (i: number): string[] => nine[i].siblings.map((s) => s.text)
    const line = (i: number): string => nine[i].text
    expect(nine.map((u) => u.siblings.length)).toEqual([6, 6, 6, 6, 6, 6, 6, 6, 6])
    expect(near(0)).toEqual([1, 2, 3, 4, 5, 6].map(line))
    expect(near(4)).toEqual([1, 2, 3, 5, 6, 7].map(line))
    expect(near(8)).toEqual([2, 3, 4, 5, 6, 7].map(line))
    expect(nine[4].siblings.every((s) => s.role === 'log')).toBe(true)
    // A long sibling is not cut, and a sibling without a flag is still a sibling.
    const gloss = unit(batch, 'src/game/siblings.ts', 'Nobody reads this gloss at all')
    expect(gloss.siblings.map((s) => [s.role, s.text.length])).toEqual([
      ['text', 195],
      ['text', 25],
    ])

    // The code line: the line of the literal, trimmed, and cut at 200 characters.
    expect(unit(batch, 'src/game/excluded.ts', 'Nobody opened it.').code).toBe("if (door === 'Nobody answers the door') return 'Nobody opened it.'")
    expect(gloss.code).toHaveLength(200)
    expect(gloss.code.startsWith("gloss: 'Nobody reads this gloss at all', other: 'a very long second string")).toBe(true)
    const line17 = readFileSync(join(repo(), 'src/game/siblings.ts'), 'utf8').split('\n')[16]
    expect(line17.length).toBeGreaterThan(250)
    expect(gloss.code).toBe(line17.trim().slice(0, 200))
    // A literal on the first line of a template is shown with that line.
    expect(unit(batch, 'src/game/misc/loose.ts', 'Nobody knew {{0}} in {{1}}.').code.startsWith("notice(g, 'Nobody Knew That', `Nobody knew ${g.character.name}")).toBe(true)
    for (const u of batch.units) expect(u.code.length, u.id).toBeLessThanOrEqual(200)
  })

  it('gives every unit an id of file:line:col in UTF-16 columns and a sha of the literal as written', () => {
    const batch = extract(repo())
    const file = 'src/game/columns.ts'
    // Counted by hand: the column is that of the opening quote or backtick, in UTF-16 code units, from 1. After
    // the accented letters of 'caf\u00e9' a count in bytes would be one too many for each, and after the
    // emoji (two code units, four bytes) a count in code points would be one too few.
    expect(unitsIn(batch, file).map((u) => [u.id, u.text])).toEqual([
      [`${file}:2:23`, 'Nobody knows the plain one.'],
      [`${file}:2:54`, 'She said "hi" and nobody answered.'], // a double-quoted string with escaped quotes
      [`${file}:2:94`, 'Caf\u00e9 Zo\u00eb: nobody ordered.'],
      [`${file}:3:32`, 'Nobody ordered the cr\u00e8me br\u00fbl\u00e9e.'],
      [`${file}:3:68`, "Everyone's caf\u00e9 is closed."],
      [`${file}:4:29`, 'Nobody saw the emoji before this.'],
      [`${file}:4:66`, 'Everyone {{0}} left.'], // a template literal after the emoji
      [`${file}:5:1`, 'Nobody begins at the first column.'], // the first column of a line
    ])
    // The sha is the first 8 hex digits of the SHA-256 of the literal as it stands in the file, quotes included.
    const sources: [string, string][] = [
      ["'Nobody knows the plain one.'", `${file}:2:23`],
      ['"She said \\"hi\\" and nobody answered."', `${file}:2:54`],
      ["'Nobody ordered the cr\u00e8me br\u00fbl\u00e9e.'", `${file}:3:32`],
      ["`Everyone ${'\u{1F600}'} left.`", `${file}:4:66`],
    ]
    for (const [source, id] of sources) {
      const u = batch.units.find((x) => x.id === id)
      expect(u?.sha, id).toBe(sha8(source))
      expect(readFileSync(join(repo(), file), 'utf8').split('\n')[parseId(id).line - 1].slice(parseId(id).col - 1).startsWith(source), id).toBe(true)
    }
    expect(unit(batch, file, 'Everyone {{0}} left.').holes).toEqual(["'\u{1F600}'"])
    for (const u of batch.units) expect(u.sha, u.id).toMatch(/^[0-9a-f]{8}$/)
    // Ids are unique.
    expect(new Set(batch.units.map((u) => u.id)).size).toBe(batch.units.length)
  })

  it('flags chatbot and disclaimer on short literals and keeps the floor for the other flags', () => {
    const short = (args: string[] = []): [string, string][] =>
      unitsIn(extract(repo(), args), 'src/game/events/custom.ts').map((u) => [u.text, u.flags.join(' ')])
    // 14 characters by default. The chatbot openers and the disclaimer words are found at any length (the
    // report's metrics 8 and 9 scan every literal); 'Nobody' and 'Everyone' are under the floor, and the
    // chatbot phrase with a nobody in it loses its nobody. 'Feel free to' (12 characters) is pinned.
    expect(short()).toEqual([
      ['Good call', 'chatbot'],
      ["Let's go!", 'chatbot'],
      ['Welcome to {{0}}!', 'chatbot'],
      [' (abstract)', 'disclaimer'],
      ['Nobody home yet', 'nobody'],
      ["Let's go on", 'chatbot'],
      ["Let's nobody", 'chatbot'],
    ])
    // --min 0 takes a literal of any length; --min N takes those of N characters or more.
    expect(short(['--min', '0'])).toEqual([
      ['Good call', 'chatbot'],
      ["Let's go!", 'chatbot'],
      ['Welcome to {{0}}!', 'chatbot'],
      [' (abstract)', 'disclaimer'],
      ['Nobody', 'nobody'],
      ['Nobody home yet', 'nobody'],
      ['Everyone', 'everyone'],
      ["Let's go on", 'chatbot'],
      ["Let's nobody", 'nobody chatbot'],
    ])
    expect(short(['--min', '8']).map(([text]) => text)).toContain('Everyone')
    expect(short(['--min', '8']).map(([text]) => text)).not.toContain('Nobody')
    expect(short(['--min', '9']).map(([text]) => text)).not.toContain('Everyone')
    expect(short(['--min', '12']).find(([text]) => text === "Let's nobody")).toEqual(["Let's nobody", 'nobody chatbot'])
    // The chatbot and disclaimer flags can be asked for by name, and then they find the short ones too.
    const chatbot = extract(repo(), ['--flags', 'chatbot,disclaimer']).units
    expect(chatbot.map((u) => u.text)).toEqual(
      expect.arrayContaining(['Good call', "Let's go!", 'Welcome to {{0}}!', ' (abstract)', "Let's go on"]),
    )
  })

  it('never gives the disclaimer flag to SettingsScreen.tsx, where the About text lives', () => {
    const batch = extract(repo())
    const settings = unitsIn(batch, 'src/ui/screens/SettingsScreen.tsx')
    // The About paragraph has no flag left, so it is not exported; the other text keeps its other flags.
    expect(settings.map((u) => [u.text, u.flags])).toEqual([['Nobody should treat the fictional crime systems as advice.', ['nobody']]])
    // The same text in any other file is flagged.
    expect(unitsIn(batch, 'src/ui/screens/AboutScreen.tsx').map((u) => u.flags)).toEqual([['disclaimer'], ['nobody', 'disclaimer']])
    // ... and the flag cannot be asked for there either, but --ids still finds the paragraph, without the flag.
    const asked = extract(repo(), ['--flags', 'disclaimer']).units.filter((u) => fileOf(u) === 'src/ui/screens/SettingsScreen.tsx')
    expect(asked).toEqual([])
    const about = positionOf(repo(), 'src/ui/screens/SettingsScreen.tsx', "'Everything here is made up")
    const byId = extract(repo(), ['--ids', about]).units
    expect(byId).toHaveLength(1)
    expect(byId[0].flags).toEqual([])
  })

  it('skips a file that does not lex and lists it', () => {
    const batch = extract(repo())
    expect(batch.counts.lexErrorFiles).toEqual(['src/game/broken.ts'])
    expect(unitsIn(batch, 'src/game/broken.ts')).toEqual([])
    expect(batch.units.length).toBeGreaterThan(50)
    const direct = run(['--root', repo(), '--files', 'src/game/broken.ts'])
    expect(direct.status).toBe(0)
    expect(JSON.parse(direct.bytes ?? '')).toMatchObject({ units: [], counts: { total: 0, lexErrorFiles: ['src/game/broken.ts'] } })
    expect(direct.stdout).toContain('src/game/broken.ts')
    // A tree where every file lexes lists none, and a file that is not read is not listed.
    expect(extract(repo(), ['--files', 'src/game/columns.ts']).counts.lexErrorFiles).toEqual([])
  })

  it('reads only under --root and writes only the file --out names', () => {
    const dir = makeRepo(LAYOUT, {})
    const before = snapshot(dir)
    const elsewhere = scratch()
    const result = run(['--root', dir], { cwd: elsewhere })
    expect(result.status).toBe(0)
    // Nothing in the repository changed and nothing was written beside the output.
    expect(snapshot(dir)).toEqual(before)
    expect(readdirSync(elsewhere)).toEqual([])
    expect(readdirSync(dirname(result.out))).toEqual(['batch.json'])
    // This repository has no test folder, so no test pins anything (the lookups in src/ still count), although
    // the tests of the real repository, where the command is run from, hold some of the same sentences.
    const batch = JSON.parse(result.bytes ?? '') as Batch
    expect(batch.counts.pinnedExcluded).toBe(LOOKED_UP.length)
    expect(batch.units.some((u) => u.text === 'Nobody pinned this exact sentence.')).toBe(true)
    const fromRepo = run(['--root', dir], { cwd: ROOT })
    expect(fromRepo.bytes).toBe(result.bytes)
  })

  it('refuses bad usage with exit 2 and writes nothing', () => {
    const bad: [string[], RegExp][] = [
      [['--root', repo(), '--flags', 'nobody,no-such-flag'], /no-such-flag/],
      [['--root', repo(), '--files', 'src/game/missing.ts'], /missing\.ts/],
      [['--root', repo(), '--max', '0'], /--max/],
      [['--root', repo(), '--max', 'many'], /--max/],
      [['--root', repo(), '--min', '-1'], /--min/],
      [['--root', repo(), '--after', 'no id'], /--after/],
      [['--root', repo(), '--ids', 'src/game/columns.ts'], /--ids/],
      [['--root', repo(), '--surprise'], /--surprise/],
      [['--root', join(scratch(), 'nowhere')], /src/],
      [['--root', repo(), '--files'], /--files/],
    ]
    for (const [args, message] of bad) {
      const result = run(args)
      expect(result.status, args.join(' ')).toBe(2)
      expect(result.stderr, args.join(' ')).toMatch(message)
      expect(result.stdout, args.join(' ')).toBe('')
      expect(result.bytes, args.join(' ')).toBeNull()
    }
    // Without --out there is nowhere to write; without a command there is nothing to do.
    const noOut = spawnSync(process.execPath, [SCRIPT, 'extract', '--root', repo()], { encoding: 'utf8' })
    expect(noOut.status).toBe(2)
    expect(noOut.stderr).toContain('--out')
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2)
    const unknown = spawnSync(process.execPath, [SCRIPT, 'frobnicate'], { encoding: 'utf8' })
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('frobnicate')
    const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('extract')
    expect(help.stdout).toContain('--flags')
  })

  it('prints the counts it wrote', () => {
    const result = run(['--root', repo()])
    const batch = JSON.parse(result.bytes ?? '') as Batch
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`units: ${batch.units.length} written to ${result.out}`)
    for (const [role, n] of Object.entries(batch.counts.byRole)) expect(result.stdout).toContain(`${role} ${n}`)
    for (const [flag, n] of Object.entries(batch.counts.byFlag)) expect(result.stdout).toContain(`${flag} ${n}`)
    expect(result.stdout).toContain(`${batch.counts.pinnedExcluded}`)
    expect(result.stdout).toContain('src/game/broken.ts')
  })

  it('agrees with the corpus of the report on the whole real tree', () => {
    const { batch, out } = realTree()
    expect(batch.units.length).toBeGreaterThan(3000)
    expect(new Set(batch.units.map((u) => u.id)).size).toBe(batch.units.length)
    expect(batch.units.map((u) => u.id)).toEqual(batch.units.map((u) => u.id).sort(byPosition))
    // Every unit is a literal that buildCorpus() finds at the same line and column, with the same sha, text and
    // holes: the corpus counts the columns by a different code path than the tool does.
    const program = `
      import fs from 'node:fs'
      import path from 'node:path'
      import crypto from 'node:crypto'
      import { buildCorpus } from ${JSON.stringify(CORPUS_URL)}
      const root = process.argv[1]
      const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
      const corpus = buildCorpus(root)
      const byId = new Map(corpus.records.map((r) => [r.file + ':' + r.line + ':' + r.col, r]))
      const sources = new Map()
      const bad = []
      for (const u of batch.units) {
        const r = byId.get(u.id)
        if (!r || r.kind === 'jsx') { bad.push([u.id, 'no literal there']); continue }
        if (!sources.has(r.file)) sources.set(r.file, fs.readFileSync(path.join(root, r.file), 'utf8'))
        const src = sources.get(r.file)
        const literal = src.slice(r.start, r.end)
        if (crypto.createHash('sha256').update(literal).digest('hex').slice(0, 8) !== u.sha) bad.push([u.id, 'sha'])
        if (u.tag + u.text.replace(/\\{\\{\\d+\\}\\}/g, '\${...}') !== r.text) bad.push([u.id, 'text'])
        if (u.holes.length !== r.nExpr) bad.push([u.id, 'hole count'])
        let at = 0
        for (const h of u.holes) {
          const i = literal.indexOf('\${' + h + '}', at)
          if (i < 0) { bad.push([u.id, 'hole source']); break }
          at = i + h.length + 3
        }
        let code = src.split('\\n')[r.line - 1].trim().slice(0, 200)
        if (code.length === 200 && code.charCodeAt(199) >= 0xd800 && code.charCodeAt(199) <= 0xdbff) code = code.slice(0, 199)
        if (u.code !== code) bad.push([u.id, 'code'])
      }
      process.stdout.write(JSON.stringify({ bad: bad.slice(0, 20), lexErrors: corpus.lexErrors.length }))
    `
    const check = spawnSync(process.execPath, ['--input-type=module', '-e', program, ROOT, out], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    expect(check.stderr).toBe('')
    expect(check.status).toBe(0)
    const verdict = JSON.parse(check.stdout) as { bad: [string, string][]; lexErrors: number }
    expect(verdict.bad).toEqual([])
    // The tool and the corpus agree on whether any file fails to lex.
    expect(batch.counts.lexErrorFiles.length > 0).toBe(verdict.lexErrors > 0)
    // The limit follows the role, and the counts add up.
    const fixed: Record<string, number> = { log: 90, scene: 140, outcome: 120, tooltip: 120, digest: 110 }
    for (const u of batch.units) {
      expect(u.limit, u.id).toBe(fixed[u.role] ?? Math.min(u.text.replace(/\{\{\d+\}\}/g, '').length, 180))
      expect(u.flags.length, u.id).toBeGreaterThan(0)
    }
    expect(batch.counts.total).toBe(batch.units.length)
    expect(Object.values(batch.counts.byRole).reduce((a, b) => a + b, 0)).toBe(batch.units.length)
  }, 120_000)

  it('is not itself a test that pins a string of the game', () => {
    // extract leaves out every text that a test file holds, and this file is one of them: so it must hold no
    // sentence of the game. The batch of the real tree must not change when this file is taken away.
    const copy = scratch()
    cpSync(join(ROOT, 'src'), join(copy, 'src'), { recursive: true })
    cpSync(join(ROOT, 'test'), join(copy, 'test'), { recursive: true, filter: (from) => !from.endsWith('voice-batch.test.ts') })
    const without = extract(copy)
    const { batch: kept } = realTree()
    const seen = new Set(kept.units.map((u) => u.id))
    expect(without.units.filter((u) => !seen.has(u.id)).map((u) => u.text)).toEqual([])
    expect(kept.counts.pinnedExcluded).toBe(without.counts.pinnedExcluded)
  }, 120_000)
})

const real = new Map<string, { batch: Batch; out: string }>()
/** extract on the real src/ of this repository, once per set of arguments. */
function realTree(args: string[] = []): { batch: Batch; out: string } {
  const key = args.join(' ')
  let found = real.get(key)
  if (!found) {
    const result = run(['--root', ROOT, ...args])
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    found = { batch: JSON.parse(result.bytes ?? '') as Batch, out: result.out }
    real.set(key, found)
  }
  return found
}

/** Every file under a folder with a hash of its bytes, to see that a run changed nothing. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[p.slice(dir.length)] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  walk(dir)
  return out
}
