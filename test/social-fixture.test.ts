// ci: fast
// R4-E1: test/fixtures/save-v5.2.0-social.json.gz is the v5.2.0 save the People track of v5.3.0 is checked against: every record that
// R4 reads, mirrors or copies, written by the engine of the tag (scripts/save-fixtures.ts, mode `social`). test/old-saves.test.ts
// loads it and plays it for any fixture; this file pins what it holds, so a fixture swapped for another life, or regenerated from a
// later engine, fails here and not three tasks later: a spouse and two children, the family firm with both children on the payroll
// and one named successor, a will that cuts one child out, a loan to a friend, and 22 live exes (cleanupPeople keeps 20).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { familyOf } from '../src/game/business/nepo-state'
import { readJob } from '../src/game/business/nepo-job'
import { bizOf } from '../src/game/business/state'
import { readTies } from '../src/game/events/wealth-core'
import { readWl } from '../src/game/events/will-core'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Person } from '../src/game/types'
import { ROOT } from './scan-kit'

const FILE = join(ROOT, 'test', 'fixtures', 'save-v5.2.0-social.json.gz')
const text = gunzipSync(readFileSync(FILE)).toString()

/** The fixture brought up to date, afresh each time (migrateSave changes what it is given). */
function loaded(): GameState {
  const r = migrateSave(JSON.parse(text) as Record<string, unknown>)
  if (r.kind !== 'ready') throw new Error(`save-v5.2.0-social did not migrate: ${JSON.stringify(r)}`)
  return r.game
}

const liveExes = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation === 'ex' && p.data.babyParent !== true && !p.data.npcCompany)

describe('the v5.2.0 social save', () => {
  it('is an inline schema 3 save of a founder of 60 in 2026, alive, with a world', () => {
    const raw = JSON.parse(text) as Record<string, unknown>
    expect(raw.schemaVersion).toBe(3)
    expect(raw).toHaveProperty('world')
    expect(raw).not.toHaveProperty('chunks')
    const g = loaded()
    expect(g.character).toMatchObject({ age: 60, alive: true })
    expect(g.year).toBe(2026)
  })

  it('has a living spouse and two living children', () => {
    const g = loaded()
    expect(g.people.filter((p) => p.alive && p.relation === 'spouse')).toHaveLength(1)
    expect(g.people.filter((p) => p.alive && p.relation === 'child')).toHaveLength(2)
  })

  it('has a family firm: both children on its payroll and one of them named as the successor', () => {
    const g = loaded()
    const asset = g.assets.find((a) => a.kind === 'business')!
    const kids = g.people.filter((p) => p.alive && p.relation === 'child')
    for (const k of kids) expect(readJob(k)?.assetId, `${k.firstName} is on the payroll`).toBe(asset.id)
    const family = familyOf(bizOf(g, asset))
    expect(family.succ.kind).toBe('person')
    expect(kids.map((k) => k.id)).toContain(family.succ.id)
    expect(family.hires).toBe(2)
  })

  it('has a will that cuts one child out and names the other', () => {
    const g = loaded()
    const kids = g.people.filter((p) => p.alive && p.relation === 'child')
    const cut = kids.filter((k) => readWl(g, k).cut)
    expect(cut).toHaveLength(1)
    expect(g.character.willBeneficiaries).toEqual(kids.filter((k) => !readWl(g, k).cut).map((k) => k.id))
  })

  it('has a loan to a friend that is not paid back', () => {
    const g = loaded()
    const lent = g.people.filter((p) => readTies(g, p).owes > 0)
    expect(lent.map((p) => p.relation)).toEqual(['friend'])
    expect(readTies(g, lent[0]!).owes).toBe(25_000)
  })

  it('has 22 live exes, and the first year played keeps the 20 the cleanup allows', () => {
    const g = loaded()
    expect(liveExes(g)).toHaveLength(22)
    g.queue = []
    ageUp(g)
    expect(liveExes(g)).toHaveLength(20)
  })
})
