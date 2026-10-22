// R3 fix: the owner's voice rule is that no em-dash or en-dash character is added. A test that checks for the characters builds the class
// from char codes, so a search for them finds none in the file that checks. This guard holds the R3 folders and the R3 tests that check
// for them to that: the files below carry neither U+2013 nor U+2014 themselves.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EN = String.fromCharCode(0x2013)
const EM = String.fromCharCode(0x2014)

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const CHECKING_TESTS = [
  'test/fog-odds-sites.test.ts',
  'test/quiet-integration.test.ts',
  'test/culture-lines.test.ts',
  'test/fog-acceptance.test.ts',
  'test/lab-voice.test.ts',
  'test/research-odds-screens.test.ts',
  'test/fog-hint-probability.test.ts',
  'test/fog-forecast-scale.test.ts',
  'test/knowledge-reveal-real.test.ts',
]

describe('no em-dash or en-dash character in what R3 owns', () => {
  it('the R3 source folders (fog, knowledge, effort) carry none', () => {
    const bad: string[] = []
    for (const dir of ['src/game/fog', 'src/game/knowledge', 'src/game/effort']) {
      for (const path of walk(join(ROOT, dir), [])) if (readFileSync(path, 'utf8').split('').some((c) => c === EN || c === EM)) bad.push(path.slice(ROOT.length))
    }
    expect(bad).toEqual([])
  })

  it('the tests that check for the characters carry none themselves', () => {
    const bad = CHECKING_TESTS.filter((f) => readFileSync(join(ROOT, f), 'utf8').split('').some((c) => c === EN || c === EM))
    expect(bad).toEqual([])
  })
})
