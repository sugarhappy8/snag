// ci: fast
// R2-A3 (D9): the voice tooling keys on the callee name. A call in PICKERS (scripts/voice/units.mjs) is transparent: its
// strings keep the role of the argument it sits in. The codemod renames pick to pickLine and pickSite, so those two
// must be pickers too, or every converted string moves out of its role and the voice report numbers change.
// The sentences below are made up; none equals a string of src/.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const UNITS_URL = pathToFileURL(join(ROOT, 'scripts', 'voice', 'units.mjs')).href

interface Unit {
  id: string
  code: string
  role: string
  text: string
  tag: string
  holes: string[]
  flags: string[]
  limit: number
  siblings: { role: string; text: string }[]
}

const trash: string[] = []
afterAll(() => {
  for (const dir of trash) rmSync(dir, { recursive: true, force: true })
})

const POOL = "['Alpha beta gamma.', 'Delta epsilon zeta.', 'Eta theta iota.']"

/** One call per variant, all with the same pool, at the same position of the same kind of file. */
const VARIANTS: Record<string, string> = {
  pick: `pick(g, ${POOL})`,
  pickLine: `pickLine(g, ${POOL})`,
  pickSite: `pickSite(g, ${POOL}, 0x1)`,
  v: `v(g, ${POOL})`,
}

function source(call: string): string {
  return ['export function f(g: unknown) {', `  notice(g, 'Title of the made up scene', ${call})`, '}', ''].join('\n')
}

/** The units of the three pool strings of a one-file tree, found by position (a unit is selected by its id whatever its flags). */
function unitsOf(call: string): Unit[] {
  const root = mkdtempSync(join(tmpdir(), 'voice-pickers-'))
  trash.push(root)
  const file = 'src/game/events/sample.ts'
  mkdirSync(dirname(join(root, file)), { recursive: true })
  const text = source(call)
  writeFileSync(join(root, file), text)
  const ids = ['Alpha beta gamma.', 'Delta epsilon zeta.', 'Eta theta iota.'].map((s) => {
    const at = text.indexOf(`'${s}'`)
    const line = text.slice(0, at).split('\n').length
    const col = at - text.lastIndexOf('\n', at - 1)
    return `${file}:${line}:${col}`
  })
  const program = `
    import { extractUnits } from ${JSON.stringify(UNITS_URL)}
    const [root, ...ids] = process.argv.slice(1)
    process.stdout.write(JSON.stringify(extractUnits({ root, ids, includePinned: true }).units))
  `
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program, root, ...ids], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  expect(child.stderr).toBe('')
  expect(child.status).toBe(0)
  return JSON.parse(child.stdout) as Unit[]
}

/** What a unit says about itself, without its position and the source line it sits in (which names the callee). */
function shape(u: Unit): Omit<Unit, 'id' | 'code'> {
  const { id: _id, code: _code, ...rest } = u
  return rest
}

describe('r2 voice pickers: pickLine and pickSite are transparent like pick', () => {
  const base = unitsOf(VARIANTS.pick)

  it('the made up pool is read as the outcome text of a notice', () => {
    expect(base.map((u) => u.role)).toEqual(['outcome', 'outcome', 'outcome'])
    expect(base.map((u) => u.text)).toEqual(['Alpha beta gamma.', 'Delta epsilon zeta.', 'Eta theta iota.'])
  })

  for (const name of ['pickLine', 'pickSite', 'v']) {
    it(`${name} gives the same roles, texts and contexts as pick`, () => {
      const got = unitsOf(VARIANTS[name])
      expect(got.map(shape)).toEqual(base.map(shape))
    })
  }

  it('a method call named pickLine is still opaque (a picker is a bare call)', () => {
    const got = unitsOf(`dealer.pickLine(g, ${POOL})`)
    expect(got.map((u) => u.role)).toEqual(['text', 'text', 'text'])
  })
})
