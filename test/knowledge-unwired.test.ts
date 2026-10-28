// R3 fix (fog): two knowledge features have an engine and tests but no screen that uses them in v5.1.0: the free `news` source
// (`ingestSignal`) and exposure (`EstimateOpts.exp`, the player's own presence cutting the passive sd by up to 40%). Wiring them is a design
// choice (which news item says what about which key; how much a company's presence tells about a rival), so the docs say they are not wired.
// This test holds both halves: while no screen calls `ingestSignal`, the docs say so; the day one does, this fails and the note, the table row
// and this test change together.
//
// R4-U2 (X44) wired exposure for people and only for people: the person profile (src/game/people-fog.ts: how long and how well you know
// someone) and the hired-staff and CEO reads (src/game/business/leader-fog.ts: tenure). Those two files are the allow-list. A third file that
// passes `exp:` fails here, and the note in docs/KNOWLEDGE.md changes with it. The list names the second file before R4-U6 creates it, so the
// guard never requires an allowed file to exist; a file that does exist must really pass `exp:`, so the list holds no stale name.
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

/** The two readers that may pass exposure to know(): the person profile and the hired-staff and CEO reads. */
const EXPOSURE_READERS: readonly string[] = ['src/game/people-fog.ts', 'src/game/business/leader-fog.ts']

interface Source {
  file: string
  text: string
}

/** A screen is a file that reads through Knowledge's door; `exp:` in the Effort files is a quality exponent. */
const passesExposure = (s: Source): boolean => /knowledge\/contract'/.test(s.text) && /\bexp\s*:/.test(s.text)

/** The files outside the Knowledge folder that pass exposure and are not on the allow-list. */
const strangers = (files: readonly Source[], allowed: readonly string[]): string[] =>
  files.filter((s) => !s.file.startsWith('src/game/knowledge/') && passesExposure(s) && !allowed.includes(s.file)).map((s) => s.file)

const sources: Source[] = walk(join(ROOT, 'src'), []).map((p) => ({ file: relative(ROOT, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }))
const outsideKnowledge = sources.filter((s) => !s.file.startsWith('src/game/knowledge/'))
const docs = readFileSync(join(ROOT, 'docs/KNOWLEDGE.md'), 'utf8')

describe('what the knowledge engine has and no screen calls yet', () => {
  it('no screen calls ingestSignal (the free news source)', () => {
    const callers = outsideKnowledge.filter((s) => /\bingestSignal\s*\(/.test(s.text)).map((s) => s.file)
    expect(callers).toEqual([])
  })

  it('exposure is passed by two readers only: the person profile and the hired-staff and CEO reads', () => {
    expect(EXPOSURE_READERS).toEqual(['src/game/people-fog.ts', 'src/game/business/leader-fog.ts'])
    expect(strangers(sources, EXPOSURE_READERS)).toEqual([])
  })

  it('a stale name does not stay on the list: an allowed file that exists passes exp:', () => {
    const present = sources.filter((s) => EXPOSURE_READERS.includes(s.file))
    expect(present.map((s) => s.file)).toContain('src/game/people-fog.ts')
    for (const s of present) expect(passesExposure(s), s.file).toBe(true)
  })

  it('the guard catches a third file (a screen, a menu, a business file) that passes exp:', () => {
    const third: Source = { file: 'src/game/business/market-menu.ts', text: "import { know } from '../knowledge/contract'\nknow(g, key, truth, { exp: 0.5 })\n" }
    const reader: Source = { file: 'src/game/people-fog.ts', text: "import { know } from './knowledge/contract'\nknow(g, key, truth, { exp: e })\n" }
    const effort: Source = { file: 'src/game/effort/curve.ts', text: 'const k = { exp: 2 }\n' }
    const inside: Source = { file: 'src/game/knowledge/estimate.ts', text: "opts.exp: not a screen, and knowledge/contract' is its own door\n" }
    expect(strangers([third, reader, effort, inside], EXPOSURE_READERS)).toEqual(['src/game/business/market-menu.ts'])
    expect(strangers([third, reader], [...EXPOSURE_READERS, 'src/game/business/market-menu.ts'])).toEqual([])
    expect(strangers([reader], [])).toEqual(['src/game/people-fog.ts'])
  })

  it('the docs say ingestSignal is wired by no screen, and exposure by two readers and no screen beyond them', () => {
    expect(docs).toMatch(/Not wired in v5\.1\.0/)
    expect(docs).toMatch(/ingestSignal[^.]*no screen/i)
    expect(docs).toMatch(/exposure[^.]*no screen/i)
    expect(docs).toMatch(/exposure[^.]*wired\s+by\s+two\s+readers[^.]*no\s+screen\s+beyond\s+them/i)
    expect(docs).toMatch(/people-fog\.ts/)
    expect(docs).toMatch(/leader-fog\.ts/)
  })
})
