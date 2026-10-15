// The money team's copy keeps docs/VOICE.md rule 4 (contractions always). The feature's strings are spread over
// advisors/*.ts and the managed-book section of investments.ts, so this scans the string literals of exactly
// that code with the voice report's own negative counter.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { countNegatives } from '../scripts/voice/rules.mjs'

const SRC = fileURLToPath(new URL('../src/game/', import.meta.url))

/** The string and template literals of some code, with comments taken out first. */
function literals(code: string): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return [...bare.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '')
}

/** The managed book: from its banner comment to the next one. */
function managedSection(): string {
  const text = readFileSync(join(SRC, 'investments.ts'), 'utf8')
  const start = text.indexOf('// The managed book (advisors/)')
  const end = text.indexOf('// Portfolio stats', start)
  if (start < 0 || end < 0) throw new Error('the managed book section moved')
  return text.slice(start, end)
}

describe('the money team copy', () => {
  it('has no uncontracted negatives ("could not" is "couldn\'t")', () => {
    const files = readdirSync(join(SRC, 'advisors')).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const f of files) for (const s of literals(readFileSync(join(SRC, 'advisors', f), 'utf8'))) if (countNegatives(s) > 0) bad.push(`${f}: ${s}`)
    for (const s of literals(managedSection())) if (countNegatives(s) > 0) bad.push(`investments.ts: ${s}`)
    expect(bad).toEqual([])
  })
})
