// ci: fast
// R4-L1 (X2, X4, X30, X35): the life pins. R4's Life and heirs track adds kin records, deaths through the estate path, debts and
// receivables, a divorce debt and a rebuilt hand-over, all of them only on a life stamped by the social flag (X6). The promise is that
// a life that is not stamped, every v5.2.0 save and every golden file stay byte-identical, and the golden files (R4-E1 to R4-E4) pin
// the relationship numbers, not these. So this file records, on the engine as it is, the behaviours the track changes and nothing
// else pins:
//
//   a  the NPC life cycle: marriages and babies of children, siblings and grandchildren over 40 years, four families
//   b  the death of an NPC relative at 0, $50,000 and $5M: the player's share, the cash left on the dead record, the books, who stays
//   c  a divorce the player cannot pay in full: the order, the cash, the sale, what is left over, the judge's line
//   d  the hand-over: the heir's husband or wife from a name, loans and anger across the switch, who is kept; a dead relative who owes
//   e  relatives employed at a firm the designated sibling adopts: who keeps the job record after two family years (X35)
//   f  the heirs of a stake of a relative whose family is a name and a count, and a firm with four late co-owners
//
// The scenes are in test/life-pins-kit.ts; the rows in test/fixtures/life-pins.json, recorded under Node 22 (the CI version) on the
// committed engine with the kit's recorder:
//
//   RECORD_SOCIAL_PARITY=lifepins RECORD_REASON="why the rows are recorded" /Users/saeed/projects/anotherlife/wt/bin/vt22 test/life-pins.test.ts
//
// Never record to make a change pass: a moved row is a changed answer, and a deliberate move takes RECORD_REASON and a row in
// docs/superpowers/plans/2026-10-26-r4-v5.3.0/moved-tests.md. The scenes built by createNewLife (e and the firm of f) are the rows
// that move at R4-E16, when every new life is stamped; the others run on makeTestGame and stay as they are for as long as old saves do.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readTies } from '../src/game/events/wealth-core'
import { readWl } from '../src/game/events/will-core'
import type { GameState } from '../src/game/types'
import {
  CYCLE_YEARS,
  DIVORCE_CASES,
  ESTATES,
  FAMILIES,
  HEIR_SPOUSES,
  OWING_FRIEND,
  playCoOwners,
  playCrowd,
  playDivorce,
  playEstate,
  playFamily,
  playHeirSpouse,
  playMinor,
  playNepo,
  playOwing,
  stakeRows,
  type CycleRun,
  type DivorceRun,
  type EstateRun,
  type HandOver,
  type NepoRun,
  type OwingRun,
} from './life-pins-kit'
import { ROOT } from './scan-kit'
import { expectRows, isRecording, oracle, readRows, recordRows, type ParityRow } from './social-parity-kit'

const ORACLE = oracle('lifepins', 'test/fixtures/life-pins.json')

interface Scenes {
  families: CycleRun[]
  estates: EstateRun[]
  divorces: DivorceRun[]
  spouses: HandOver[]
  crowd: HandOver
  minor: HandOver
  owing: OwingRun
  nepo: NepoRun
  stake: ParityRow[]
  coOwners: ParityRow[]
}

let played: Scenes | null = null

/** Every scene, played once, in the order of the file. Each scene builds its own state; the divorce binds the money display itself (the order is read off a notice). */
function scenes(): Scenes {
  played ??= {
    families: FAMILIES.map(playFamily),
    estates: ESTATES.map(playEstate),
    divorces: DIVORCE_CASES.map(playDivorce),
    spouses: HEIR_SPOUSES.map(playHeirSpouse),
    crowd: playCrowd(),
    minor: playMinor(),
    owing: playOwing(OWING_FRIEND),
    nepo: playNepo(),
    stake: stakeRows(),
    coOwners: playCoOwners(),
  }
  return played
}

function allRows(): ParityRow[] {
  const s = scenes()
  return [
    ...s.families.flatMap((r) => r.rows),
    ...s.estates.flatMap((r) => r.rows),
    ...s.divorces.flatMap((r) => r.rows),
    ...s.spouses.flatMap((r) => r.rows),
    ...s.crowd.rows,
    ...s.minor.rows,
    ...s.owing.rows,
    ...s.nepo.rows,
    ...s.stake,
    ...s.coOwners,
  ]
}

const last = <T>(rows: readonly T[]): T => rows[rows.length - 1]!
const xOf = (row: ParityRow): Record<string, unknown> => row.x as Record<string, unknown>

describe('the recorded rows', () => {
  it('are the ones the unmodified engine plays', () => {
    const rows = allRows()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('were recorded under Node 22 on a committed engine and hold every row the scenes play', () => {
    if (isRecording(ORACLE.area)) return
    expect(existsSync(join(ROOT, ORACLE.file))).toBe(true)
    const rec = readRows(ORACLE)
    expect(rec.header.node).toMatch(/^v22\./)
    expect(rec.header.dirty).toBeUndefined()
    expect(rec.header.count).toBe(allRows().length)
  })
})

describe('a  the NPC life cycle', () => {
  it('plays forty years a family, one row a year', () => {
    expect(scenes().families.map((r) => r.family.id)).toEqual(['f1960', 'f1975', 'f1990', 'f2010'])
    for (const r of scenes().families) expect(r.rows, r.family.id).toHaveLength(CYCLE_YEARS + 1)
  })

  it('marries children, a sibling or a grandchild, gives a married child a baby that is a Person, and loses someone in every family', () => {
    for (const r of scenes().families) {
      const g = r.game
      const married = g.people.filter((p) => p.data.married === true)
      const kids = married.filter((p) => p.relation === 'child' || p.relation === 'stepchild')
      expect(kids.length, `${r.family.id}: a married child`).toBeGreaterThan(0)
      expect(kids.some((p) => Number(p.data.kids ?? 0) > 0), `${r.family.id}: a married child with a baby`).toBe(true)
      expect(g.people.some((p) => p.relation === 'grandchild' && typeof p.data.parentId === 'string' && kids.some((k) => k.id === p.data.parentId)), `${r.family.id}: a baby is a Person`).toBe(true)
      expect(g.people.some((p) => !p.alive), `${r.family.id}: a death`).toBe(true)
      for (const p of married) expect(typeof p.data.spouseName, `${r.family.id}: ${p.id} has a spouse name`).toBe('string')
    }
    const game = (id: string): GameState => scenes().families.find((r) => r.family.id === id)!.game
    const [f1960, f1975, f1990, f2010] = ['f1960', 'f1975', 'f1990', 'f2010'].map(game)
    expect(f1960!.people.some((p) => p.data.married === true && p.relation === 'sibling'), 'a married sibling in 1960').toBe(true)
    expect(f1960!.people.some((p) => p.data.married === true && p.relation === 'grandchild'), 'a married grandchild in 1960').toBe(true)
    // A sibling's baby is a line in the log and nothing else (relationships.ts:1374): the count moves, no Person is made.
    for (const g of [f1975!, f1990!, f2010!]) {
      const sib = g.people.filter((p) => p.data.married === true && ['sibling', 'halfSibling', 'stepsibling'].includes(p.relation) && Number(p.data.kids ?? 0) > 0)
      expect(sib.length).toBeGreaterThan(0)
      for (const p of sib) expect(g.people.some((q) => q.relation === 'grandchild' && q.data.parentId === p.id)).toBe(false)
    }
  })

  it('never undoes a death and never drops a relative from the list (cleanupPeople keeps the family, living or dead)', () => {
    for (const r of scenes().families) {
      let dead = new Set<string>()
      let head = 0
      for (const row of r.rows) {
        const x = xOf(row)
        const now = new Set(x.d as string[])
        for (const id of dead) expect(now.has(id), `${r.family.id} ${row.label}: ${id} is still dead`).toBe(true)
        expect(x.n as number, `${r.family.id} ${row.label}: the head count never falls`).toBeGreaterThanOrEqual(head)
        dead = now
        head = x.n as number
      }
      expect(dead.size, r.family.id).toBeGreaterThan(0)
    }
  })
})

describe('b  the death of an NPC relative', () => {
  it('has the cases the plan names: seven relations at $0, $50,000 and $5M, and the ones that leave the player nothing', () => {
    const ids = scenes().estates.map((r) => r.id)
    for (const kind of ['parent+', 'parent', 'sibling', 'child', 'spouse', 'friend', 'ex']) for (const money of [0, 50000, 5000000]) expect(ids).toContain(`${kind}|${money}`)
    expect(ids.length).toBe(ESTATES.length)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('kills the target and nobody else, and the player gets a share exactly where the case says so', () => {
    for (const r of scenes().estates) {
      const c = ESTATES.find((e) => e.id === r.id)!
      expect(r.died, r.id).toEqual([r.target])
      if (c.share === 'some') expect(r.gain, r.id).toBeGreaterThan(0)
      else expect(r.gain, r.id).toBe(0)
    }
  })

  it('keeps the books and the record together: the dead account is exactly what the record gained or lost, and a friend\'s cash goes with the friend', () => {
    for (const r of scenes().estates) {
      const c = ESTATES.find((e) => e.id === r.id)!
      const end = xOf(last(r.rows))
      const [alive, , left, acct, listed] = end.t as [number, string, number, number, number]
      expect(alive, r.id).toBe(0)
      expect(acct, r.id).toBe(left - c.money)
      // A friend's record is dropped with the cash on it (nothing books it out); family and exes stay in the list.
      expect(listed, r.id).toBe(c.kind === 'friend' ? 0 : 1)
      if (c.kind === 'friend' && c.life === undefined) expect(left, r.id).toBe(c.money)
    }
  })

  it('turns a modeled life into cash before the estate is cut: investments and housing less debt, from the households to the dead person', () => {
    const net = 200_000 + 500_000 - 100_000
    const withLife = scenes().estates.filter((e) => ESTATES.find((c) => c.id === e.id)!.variant === 'assets')
    expect(withLife).toHaveLength(3)
    for (const r of withLife) {
      const row = (xOf(last(r.rows)).flows as [string, string, Record<string, number>][]).find((f) => f[0] === 'estate')!
      expect(row[2], r.id).toEqual({ person: net, pool: -net })
      expect((xOf(last(r.rows)).t as number[])[2], r.id).toBe(50_000 + net - r.gain)
    }
  })

  it('moves no money between classes in any other death: the books of a death are person to person, so a flow row has no net', () => {
    for (const r of scenes().estates.filter((e) => ESTATES.find((c) => c.id === e.id)!.variant !== 'assets')) {
      for (const row of xOf(last(r.rows)).flows as [string, string, Record<string, number>][]) expect(row[2], `${r.id} ${row[0]}`).toEqual({})
    }
  })

  it('asks for a funeral when a spouse, a child or the last parent dies', () => {
    for (const r of scenes().estates) {
      const c = ESTATES.find((e) => e.id === r.id)!
      const q = xOf(last(r.rows)).q as string[]
      if (c.variant === 'disowned' || c.kind === 'ex') expect(q, r.id).toEqual([])
      else if (['spouse', 'child', 'parent'].includes(c.kind)) expect(q, r.id).toEqual(['choice'])
      else expect(q, r.id).toEqual(['notice'])
    }
  })
})

describe('c  a divorce the player cannot pay in full', () => {
  const byId = (id: string): DivorceRun => scenes().divorces.find((r) => r.id === id)!

  it('has the six tuples of the plan: a $3M residence, $20,000 of cash, an ex with nothing, no prenup', () => {
    const six = scenes().divorces.slice(0, 6)
    expect(six.map((r) => r.id)).toEqual(['filed-a', 'filed-b', 'filed-c', 'served-a', 'served-b', 'served-c'])
    for (const r of six) {
      expect(r.owed, r.id).toBeGreaterThan(900_000)
      expect(r.ex.money, r.id).toBe(20_000)
      expect(r.game.assets.map((a) => a.id), `${r.id}: the residence is not sold`).toEqual(['home'])
      expect(r.game.character.money, r.id).toBe(0)
      expect(r.remaining, r.id).toBe(r.owed! - 20_000)
      expect(r.paragraphs[0], r.id).toMatch(/^(You divorced|.+ filed for divorce)/)
      expect(r.paragraphs.length, r.id).toBe(2)
    }
  })

  it('reads the order off the notice, and the settlement formula agrees when the player files', () => {
    for (const r of scenes().divorces) if (r.formula !== null && r.formula > 0) expect(r.owed, r.id).toBe(r.formula)
  })

  it('sells the second home for the ex, gives the player back what the sale brought above the order, and pays out of cash when there is cash', () => {
    const second = byId('second-home')
    expect(second.game.assets.map((a) => a.id)).toEqual(['home'])
    expect(second.ex.money).toBe(20_000 + 600_000)
    expect(second.remaining).toBe(second.owed! - 620_000)
    expect(second.paragraphs.length).toBe(3)
    const covers = byId('sale-covers')
    expect(covers.remaining).toBe(0)
    expect(covers.ex.money).toBe(covers.owed)
    expect(covers.game.assets.map((a) => a.id)).toEqual(['home'])
    expect(covers.game.character.money).toBe(5_000_000 - (covers.owed! - 20_000))
    const cash = byId('cash-pays')
    expect(cash.remaining).toBe(0)
    expect(cash.ex.money).toBe(cash.owed)
    expect(cash.game.character.money).toBe(5_000_000 - cash.owed!)
  })

  it('owes nothing under a prenup, and the richer ex pays the player', () => {
    const prenup = byId('prenup')
    expect(prenup.owed).toBeNull()
    expect(prenup.ex.money).toBe(0)
    const rich = byId('rich-ex')
    expect(rich.formula!).toBeLessThan(0)
    expect(rich.ex.money).toBe(6_000_000 + rich.formula!)
    expect(rich.game.character.money).toBe(20_000 - rich.formula!)
  })
})

describe('d  the hand-over', () => {
  const spouses = (): HandOver[] => scenes().spouses
  const byId = (id: string): HandOver => spouses().find((r) => r.id === id)!
  const spouseOf = (h: HandOver): unknown[] | null => xOf(last(h.rows)).sp as unknown[] | null

  it('makes the heir a husband or wife from the name: first word, the rest, the heir\'s own surname for a single word', () => {
    expect(spouseOf(byId('ana-ruiz'))!.slice(1, 3)).toEqual(['Ana', 'Ruiz'])
    expect(spouseOf(byId('juan-carlos'))!.slice(1, 3)).toEqual(['Juan', 'Carlos de Cuba'])
    expect(spouseOf(byId('one-word'))!.slice(1, 3)).toEqual(['Madonna', 'Test'])
    // The quirk of splitting on one space: two spaces leave a leading space on the surname.
    expect(spouseOf(byId('two-spaces'))!.slice(1, 3)).toEqual(['Ana', ' Ruiz'])
  })

  it('makes none for an empty name, a missing name, a heir who is not married, and a heir under 18', () => {
    for (const id of ['no-name', 'no-key', 'single', 'minor']) expect(spouseOf(byId(id)), id).toBeNull()
  })

  it('draws the gender from the heir\'s sexuality: opposite for straight, the same for gay, a coin for bisexual (both seen)', () => {
    const gender = (id: string): unknown => spouseOf(byId(id))![3]
    expect(gender('ana-ruiz')).toBe('male')
    expect(gender('gay')).toBe('female')
    expect(new Set([gender('bi-a'), gender('bi-b')])).toEqual(new Set(['male', 'female']))
  })

  it('gives the spouse an age within four years of the heir, 55 to 90 of fondness, and lives together', () => {
    for (const h of spouses()) {
      const sp = spouseOf(h)
      if (sp === null) continue
      const [, , , , age, skin, rel, known, together] = sp as number[]
      expect(Math.abs(age! - 45), h.id).toBeLessThanOrEqual(4)
      expect(skin).toEqual(expect.any(Number))
      expect(rel!, h.id).toBeGreaterThanOrEqual(55)
      expect(rel!, h.id).toBeLessThanOrEqual(90)
      expect(known!, h.id).toBeGreaterThanOrEqual(2)
      expect(together).toBe(1)
    }
  })

  it('draws more for a heir with a spouse than for one without (the husband\'s age, skin and years known are draws)', () => {
    // The generator adds 0x6d2b79f5 to its state at every draw, so the draws a hand-over made are what it takes to get from the seed to the state.
    const draws = (id: string, seed: number): number => {
      const end = last(byId(id).rows).rng as number
      for (let n = 0; n < 5000; n++) if (((seed + Math.imul(n, 0x6d2b79f5)) | 0) === end) return n
      throw new Error(`${id}: the state is not reachable from the seed`)
    }
    const married = draws('ana-ruiz', 31)
    const single = draws('single', 39)
    expect(married).toBeGreaterThan(single)
    expect(married - single).toBeGreaterThanOrEqual(15)
  })

  describe('the crowd: loans, anger, who is kept', () => {
    const rows = (): Map<string, unknown[]> => new Map((xOf(last(scenes().crowd.rows)).ties as unknown[][]).map((r) => [r[0] as string, r]))
    // [key, relation, relationship, readTies owes, readTies allowance, raw w.by, raw w.owes, readWl anger, raw wl.by, raw wl.anger, has a life, has a connection]

    it('keeps a sibling and a friend with a life of their own, and drops the friend, the classmate, the coworker and the ex who had none', () => {
      const t = rows()
      for (const k of ['sibA', 'sibB', 'fNpc', 'fLow', 'bNpc', 'mum', 'grandkid', 'dog', 'ex', 'wife']) expect(t.get(k)![1], k).not.toBeNull()
      for (const k of ['fNone', 'class', 'work', 'old']) expect(t.get(k)![1], `${k} is dropped`).toBeNull()
    })

    it('starts a friend at the lower of 60 and what they felt, a best friend at 60, and keeps the note of how they met', () => {
      const t = rows()
      expect([t.get('fNpc')![2], t.get('fLow')![2], t.get('bNpc')![2]]).toEqual([60, 30, 60])
      for (const k of ['fNpc', 'fLow', 'bNpc']) expect([t.get(k)![1], t.get(k)![11]], k).toEqual(['friend', 1])
    })

    it('leaves a loan stamped with the late player: the record still says $40,000 and the heir\'s reader says nothing', () => {
      const t = rows()
      for (const k of ['sibA', 'fNpc']) {
        const r = t.get(k)!
        expect(r[3], `${k}: readTies owes`).toBe(0)
        expect(r[5], `${k}: raw w.by`).toBe('player')
        expect(r[6], `${k}: raw w.owes`).toBe(40_000)
      }
      expect(t.get('fNone')![1], 'a friend with no life takes the loan with them').toBeNull()
    })

    it('leaves the anger of a cut-out sibling on the record and a blank slate to the reader', () => {
      const r = rows().get('sibB')!
      expect([r[7], r[8], r[9]]).toEqual([0, 'player', 70])
      const n = scenes().crowd.after
      const sib = n.people.find((p) => p.data.wl !== undefined && (p.data.wl as { anger?: number }).anger === 70)!
      expect(readWl(n, sib).anger).toBe(0)
      expect(readTies(n, sib).allowance).toBe(0)
    })

    it('re-rolls the direct kin inside the ranges of life.ts (the other parent 55 to 95, the stepparent 30 to 75, siblings 35 to 85, a grandparent 50 to 90, a child 60 to 95, a pet 40 to 80)', () => {
      const t = rows()
      const within = (k: string, lo: number, hi: number): void => {
        const v = t.get(k)![2] as number
        expect(v, k).toBeGreaterThanOrEqual(lo)
        expect(v, k).toBeLessThanOrEqual(hi)
      }
      within('ex', 55, 95)
      within('wife', 30, 75)
      within('sibA', 35, 85)
      within('sibB', 35, 85)
      within('mum', 50, 90)
      within('grandkid', 60, 95)
      within('dog', 40, 80)
    })

    it('makes the heir\'s husband from the name and brings the heir\'s child over as a child', () => {
      const x = xOf(last(scenes().crowd.rows))
      expect((x.sp as unknown[]).slice(1, 3)).toEqual(['Ana', 'Ruiz'])
      const kept = x.people as unknown[][]
      expect(kept.filter((p) => p[1] === 'child')).toHaveLength(1)
      expect(kept.filter((p) => p[1] === 'spouse')).toHaveLength(1)
      expect(kept.find((p) => p[1] === 'stepparent')).toBeDefined()
    })
  })

  it('takes a minor heir to the other parent, with the late player\'s wife as a stepparent and the grandmother', () => {
    const x = xOf(last(scenes().minor.rows))
    const people = x.people as unknown[][]
    expect(people.map((p) => p[1])).toEqual(['parent', 'parent', 'stepparent', 'sibling', 'grandparent', 'pet'])
    expect(x.sp).toBeNull()
  })

  describe('a relative who owes and is dead', () => {
    const o = (): OwingRun => scenes().owing
    const at = (i: number): Record<string, unknown> => xOf(o().rows[i]!)

    it('goes, with the loan and with no line, when a friend dies in a year of relationships', () => {
      expect(at(1).f).toEqual([0, 0, 40_000, 2023])
      expect(at(1).lines).toBe(0)
      expect(at(2).lines).toBe(1)
    })

    it('is written off once with one line when a dead sibling (kept in the list) owes', () => {
      expect(at(1).s).toEqual([0, 1, 40_000, 2023])
      expect(at(2).s).toEqual([0, 1, 0, 0])
      expect(o().lines()).toBe(1)
    })
  })
})

describe('e  relatives employed at a firm the designated sibling adopts', () => {
  const rows = (): NepoRun['rows'] => scenes().nepo.rows
  const jobs = (i: number): unknown[][] => xOf(rows()[i]!).jobs as unknown[][]

  it('hires the successor, a child, and the late player\'s sibling, and names the successor', () => {
    expect(scenes().nepo.hired).toEqual({ successor: true, other: true, uncle: true, designated: true })
    expect(rows().map((r) => r.label)).toEqual(['nepo|before', 'nepo|handed over', 'nepo|family year 1', 'nepo|family year 2'])
  })

  it('has the successor hold the firm as a company and the will heir carry on', () => {
    const x = xOf(rows()[1]!)
    expect(x.assets).toBe(0)
    expect((x.held as number[]).reduce((a, b) => a + b, 0)).toBe(1)
    expect((x.who as [string, number][]).find((w) => w[0] === 'willHeir')![1]).toBe(0)
  })

  it('keeps the other child\'s job record at the hand-over (X35 asked; the answer is yes, the record stays)', () => {
    const kept = jobs(1).filter((j) => j[2] !== null)
    expect(kept).toHaveLength(1)
    expect(kept[0]![1]).toBe('halfSibling')
  })

  it('ends it in the first family year: a job at a firm the player no longer owns closes, the person is unemployed (UNVERIFIED until this row)', () => {
    expect(jobs(2).filter((j) => j[2] !== null)).toHaveLength(0)
    const gone = jobs(2).find((j) => j[3] !== null)!
    expect(gone[3]).toEqual(['firm', 'closed'])
    expect(gone[4]).toBe('Unemployed')
    expect(jobs(3)).toEqual(jobs(2))
  })
})

describe('f  the heirs of a stake', () => {
  const rows = (): ParityRow[] => scenes().stake

  it('is empty for a sibling, a child or a grandchild with a husband or wife or children recorded as keys', () => {
    const marked = rows().filter((r) => !/\|-0$/.test(r.label))
    expect(marked).toHaveLength(18)
    for (const r of marked) {
      const expectOwn = r.label.startsWith('stake|child|ctx')
      if (!expectOwn) expect(xOf(r).heirs, r.label).toEqual([])
    }
  })

  it('names the player, or the list a relative of the player would have, when the family is not modeled as a name', () => {
    const heirs = (label: string): unknown => xOf(rows().find((r) => r.label === label)!).heirs
    expect(heirs('stake|sibling|bare|-0')).toEqual(['player', expect.any(String)])
    expect(heirs('stake|sibling|ctx|-0')).toEqual([expect.any(String)])
    expect(heirs('stake|child|bare|-0')).toEqual(['player'])
    expect(heirs('stake|grandchild|bare|-0')).toEqual(['player'])
  })

  it('lets a child\'s grandchild inherit whatever keys the child has (the one answer that is never empty)', () => {
    for (const label of ['stake|child|ctx|-0', 'stake|child|ctx|m0', 'stake|child|ctx|-2', 'stake|child|ctx|m2']) expect(xOf(rows().find((r) => r.label === label)!).heirs, label).toHaveLength(1)
  })

  it('passes four late co-owners\' stakes four ways: outside the family, to the parents, to a grandchild, and nowhere', () => {
    const [before, settled, again] = scenes().coOwners
    expect(xOf(before!).share).toBe(0.6)
    const family = (xOf(settled!).family as [string, number][]).map((f) => f[0])
    expect(family).not.toContain('sibMarried')
    expect(family).not.toContain('childKids')
    expect(family).toContain('grand')
    expect(xOf(settled!).lines).toBe(4)
    expect(xOf(again!)).toEqual(xOf(settled!))
  })
})
