// R3 fix (fog): two knowledge features have an engine and tests but no screen that uses them in v5.1.0: the free `news` source
// (`ingestSignal`) and exposure (`EstimateOpts.exp`, the player's own presence cutting the passive sd by up to 40%). Wiring them is a design
// choice (which news item says what about which key; how much a company's presence tells about a rival) and is a follow-up, so the docs say
// they are not wired. This test holds both halves: while no screen calls them, the docs say so; the day one does, this fails and the
// note, the table row and this test change together.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const sources = walk(join(ROOT, 'src'), []).map((p) => ({ file: relative(ROOT, p), text: readFileSync(p, 'utf8') }))
const outsideKnowledge = sources.filter((s) => !s.file.startsWith('src/game/knowledge/'))
const docs = readFileSync(join(ROOT, 'docs/KNOWLEDGE.md'), 'utf8')

describe('what the knowledge engine has and no screen calls yet', () => {
  it('no screen calls ingestSignal (the free news source)', () => {
    const callers = outsideKnowledge.filter((s) => /\bingestSignal\s*\(/.test(s.text)).map((s) => s.file)
    expect(callers).toEqual([])
  })

  it('no screen passes exposure to know() or estimate()', () => {
    // a screen is a file that reads through Knowledge's door; `exp:` in the Effort files is a quality exponent
    const users = outsideKnowledge.filter((s) => /knowledge\/contract'/.test(s.text) && /\bexp\s*:/.test(s.text)).map((s) => s.file)
    expect(users).toEqual([])
  })

  it('the docs say both are engine hooks that no screen uses yet', () => {
    expect(docs).toMatch(/Not wired in v5\.1\.0/)
    expect(docs).toMatch(/ingestSignal[^.]*no screen/i)
    expect(docs).toMatch(/exposure[^.]*no screen/i)
  })
})
