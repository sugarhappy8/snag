// Share classes, task 2: control reads votes through one function (seatPlan). This scan pins every
// other place in the game that compares a share with half, so a new one has to be classified.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '../src/game')

/** A line that tests a stake against 0.5 (or 0.50, 0.51, .5, .51). */
const HALF = /\.share\b[^;{}]{0,12}(>=|>|<=|<)\s*0?\.5[01]?\b/

/**
 * The sites, per file, and why each one is not a board decision. Anything that decides who runs a
 * board goes through ownerVotes by way of seatPlan (business/board-state.ts); these do not.
 */
const SITES: Record<string, number> = {
  // Economics: a bank buyout event needs half of a private company.
  'business/bank-events.ts': 1,
  // Group economics: the group IPO preview.
  'business/conglomerate-actions.ts': 1,
  // Group economics: keeping a manager's shares out of the group's half.
  'business/conglomerate-management.ts': 1,
  // Group economics: a division manager's grant needs the group's half.
  'business/executive.ts': 2,
  // The single-class branch of ipoPreview. The classed branch reads votes through the board (Task 3).
  'business/exit.ts': 1,
  // Group economics: group services need the group's half.
  'business/group-services.ts': 3,
  // Economics: "own most of it".
  'business/succession-review.ts': 2,
  // Who profits from the firm.
  'nation/drama.ts': 1,
  'nation/graft.ts': 2,
  'underworld.ts': 1,
}

function sources(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => f.split('\\').join('/')).sort()
}

describe('every place that tests a share against half', () => {
  it('is on the list, each classified', () => {
    const found: Record<string, number> = {}
    for (const file of sources(SRC)) {
      const hits = readFileSync(join(SRC, file), 'utf8').split('\n').filter((line) => HALF.test(line)).length
      if (hits > 0) found[file] = hits
    }
    expect(
      found,
      'A new comparison of a share with half needs a class: if it decides who runs the board, read ownerVotes through seatPlan; if it is about money or a group, add it here.',
    ).toEqual(SITES)
  })

  it('counts 15 sites in 10 files', () => {
    expect(Object.keys(SITES).length).toBe(10)
    expect(Object.values(SITES).reduce((sum, n) => sum + n, 0)).toBe(15)
  })

  it('the scan sees the rule it is looking for', () => {
    expect(HALF.test('if (b.share >= 0.5) return')).toBe(true)
    expect(HALF.test('x.b.share > .5 && y')).toBe(true)
    expect(HALF.test('grp.core.share - shares < .51')).toBe(true)
    expect(HALF.test('const half = b.share * 0.5')).toBe(false)
    expect(HALF.test('b.share >= 0.05')).toBe(false)
  })
})
