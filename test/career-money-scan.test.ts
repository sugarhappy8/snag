// Money truthfulness (spec 4.3, rule 6): a career moves cash only through c.earn and c.pay, so the audit sink,
// the popup budget and the report card see all of it. This scan fails the build on a stray payment call in
// any new career file. The legacy actor.ts, astronaut.ts and model.ts and the kit are not scanned.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('../src/game/special/', import.meta.url))
const FORBIDDEN = /\b(earnIncome|spend|addMoney|payForAction)\s*\(/

/** A career file added by slice 1: actor-*.ts, astronaut-*.ts, model-*.ts, and Music 2.0's music-*.ts (music-rights.ts keeps its legacy calls). */
const scanned = (name: string): boolean => /^(actor|astronaut|model|music)-[\w-]+\.ts$/.test(name) && name !== 'music-rights.ts'

/** The source with block and line comments blanked (newlines kept), so a mention in a comment is not a call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

function strays(file: string, src: string): string[] {
  const out: string[] = []
  code(src)
    .split('\n')
    .forEach((line, i) => {
      if (FORBIDDEN.test(line)) out.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`)
    })
  return out
}

describe('careers move money only through the ledger', () => {
  it('has no earnIncome, spend, addMoney or payForAction call in the actor, astronaut and model files', () => {
    const files = readdirSync(DIR).filter(scanned)
    const found = files.flatMap((f) => strays(f, readFileSync(join(DIR, f), 'utf8')))
    expect(found).toEqual([])
  })

  it('scans the new career files and leaves the legacy files and the kit alone', () => {
    for (const yes of ['actor-sim.ts', 'actor-pipeline.ts', 'astronaut-flight.ts', 'model-core.ts', 'model-exit.ts', 'music-sim.ts']) expect(scanned(yes)).toBe(true)
    for (const no of ['actor.ts', 'astronaut.ts', 'model.ts', 'music.ts', 'music-rights.ts', 'author-career.ts', 'actors-x.ts', 'year.ts', 'actor-sim.test.ts', 'actor-.ts']) expect(scanned(no)).toBe(false)
  })

  it('flags a stray call and passes the ledger, comments and look-alike names', () => {
    expect(strays('a.ts', 'earnIncome(g, 5)\nx = 1\n  spend (g, 9)\npayForAction(g, 1)\nreturn addMoney(g, 2)')).toHaveLength(4)
    expect(strays('a.ts', "c.earn('Fee', 5)\nc.pay('Rent', 3)\nconst spendable = earnIncomeRate(1)\nrespend(2)\nspending(3)")).toEqual([])
    expect(strays('a.ts', '// earnIncome(g, 5) is the old way\n/* spend(g, 3)\n addMoney(g, 1) */\nconst x = 1 // payForAction(g, 2)')).toEqual([])
    expect(strays('a.ts', 'const url = "https://x.test"\nearnIncome(g, 1)')).toEqual(['a.ts:2: earnIncome(g, 1)'])
  })
})
