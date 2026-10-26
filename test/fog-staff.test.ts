// ci: fast
// R4-U6 (People UI and fog track, H.5, first half): hired key staff are read through Knowledge. A shortlist already shows a range for the
// skill and "not clear yet" for the trait (R3). The sheet of the person you hired used to print `skill 72` and `Skill 72/100`, the trait
// label, and a "current contribution" worked out from the true skill, so it gave the number back by inversion. Now, in Realistic with the
// build flag `peopleProfile` on:
//
//   the carry     the read of the candidate you hired goes with the hire, into `stf:<asset>:<id>:skill` (source `interview`, or `diligence`
//                 after a background check), so the sheet opens on the range the shortlist showed
//   exposure      tenure: min(1, years / 3) narrows the passive read (x(1 - .4 exposure)); a carried read wins while its aged sd is lower
//   the trait     named after a year, or at once after a background check
//   the sum       "current contribution" is worked out on what the player reads (the middle of each range, a steady trait until it is named)
//   the owner     the leaf registers the `stf` kind (a label and `gone`, nothing for sale); a hire who left is forgotten by the yearly step
//
// Exact, and Realistic with the flag off, print today's sheet (test/people-ui-golden.test.ts holds the rows). The suite runs in Exact
// (test/setup-exact.ts); a Realistic case goes through `real` (inFog and withFlags), and the flag is always named.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { traitOf } from '../src/game/business/flavor'
import { industryDef, type RoleDef } from '../src/game/business/industries'
import { carryRead, leaderRead, shownLeader, skillText, staffExposure, staffFog, staffKey, staffSkillRead, traitNamed } from '../src/game/business/leader-fog'
import { fireStaff, staffMenu } from '../src/game/business/staff'
import { candKey, vetFee } from '../src/game/business/staff-fog'
import { bizOf, readBiz, type KeyStaff } from '../src/game/business/state'
import { withFlags } from '../src/game/flags'
import { ledgerProblems } from '../src/game/kernel/ledger'
import { buyIntel, know, learn, lookCloser, readKnow, storedEstimates } from '../src/game/knowledge/contract'
import { intelBriefingMenu } from '../src/game/knowledge/briefing'
import { kindOf, labelOfKey } from '../src/game/knowledge/kinds'
import { RULES } from '../src/game/knowledge/keys'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { setDial, trackedKeys } from '../src/game/knowledge/standing'
import { withInfoMode } from '../src/game/knowledge/mode'
import { peopleFog } from '../src/game/people-fog'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, ModalItem } from '../src/game/types'
import { FIXTURE_FILE, buildGroup, diffRows, groupOf, type Row } from './people-ui-kit'
import { deepFreeze, fogGame, inFog, readerGame, unitAt } from './knowledge-kit'
import { adult, allNodes, company } from './market-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the new sheet exists. */
const real = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
const BAD = /NaN|undefined|\[object|Infinity/
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

const isHire = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire'
const hires = (g: GameState): ChoiceModal[] => g.queue.filter(isHire)
const dataOf = (m: ChoiceModal): Record<string, unknown> => m.data as unknown as Record<string, unknown>
const linesOf = (m: ChoiceModal): string[] => m.text.split('\n').filter((l) => l.startsWith('• '))

/** A grown-up with a restaurant, a lot of cash and no talent, or with the Business talent. */
function life(seed: number, opts: { talent?: boolean } = {}): { g: GameState; a: Asset } {
  const g = adult(seed, 2026, 'us')
  g.character.talents = opts.talent ? ['Business'] : []
  const a = company(g, 'restaurant', { cash: 5_000_000 })
  return { g, a }
}

const hireRow = (g: GameState, a: Asset): MenuAction =>
  allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g)) as MenuAction

/** Hold an interview and give back its popup (the last one queued). */
function interview(g: GameState, a: Asset): ChoiceModal {
  hireRow(g, a).run(g)
  return hires(g).at(-1)!
}

/** The first range a text carries: "about 55 to 75", or "about 70". */
const rangeIn = (text: string): string | null => /skill (about \d+(?: to \d+)?)/i.exec(text)?.[1] ?? null
const widthOf = (range: string | null): number => {
  const m = /about (\d+)(?: to (\d+))?/.exec(range ?? '')
  return m ? Number(m[2] ?? m[1]) - Number(m[1]) : Number.NaN
}

/** Hire candidate `pick` of a popup and give back the key staff it made. */
function hire(g: GameState, a: Asset, m: ChoiceModal, pick = 0): KeyStaff {
  runScript(g, m.scriptId!, `c${pick}`, m.data, m)
  return bizOf(g, a).staff.at(-1)!
}

/** The sheet of one key staff member: the subtitle (a function of the state, or a string) and the header. */
function sheet(g: GameState, a: Asset, s: { id: string }): { subtitle: string; header: string } {
  const group = staffMenu(a)
    .children(g)
    .find((n): n is MenuGroup => n.type === 'menu' && n.id === `biz.staffMember.${a.id}.${s.id}`)
  if (!group) throw new Error(`fog-staff: no sheet for ${s.id}`)
  const sub = group.subtitle
  return { subtitle: typeof sub === 'function' ? sub(g) : (sub ?? ''), header: group.header?.(g) ?? '' }
}
const headerRange = (header: string): string | null => /^Skill (about \d+(?: to \d+)?)/m.exec(header)?.[1] ?? null
const contributionOf = (header: string): string | null => /Their current contribution: (.*?)\. Training and morale/.exec(header)?.[1] ?? null
/** The header without the team summary (rounded team percents are observed output and stay as they are). */
const bodyOf = (header: string): string => header.slice(0, header.indexOf('\n\nTeam impact'))

/** A key staff member by hand: every field given, so nothing is drawn. */
function member(over: Partial<KeyStaff> & { role: string }): KeyStaff {
  return { id: 'ks1', firstName: 'Rosa', lastName: 'Diaz', gender: 'female', age: 44, focus: 'ops', skill: 72, salary: 70_000, trait: 'workaholic', morale: 70, years: 0, ...over }
}

/** A restaurant with one hand-made key staff member (the same asset id and staff id in every life of one seed). */
function staffed(seed: number, over: Partial<KeyStaff> = {}, opts: { talent?: boolean } = {}): { g: GameState; a: Asset; s: KeyStaff } {
  const { g, a } = life(seed, opts)
  const role = industryDef(bizOf(g, a).industry).roles.find((r: RoleDef) => r.focus === (over.focus ?? 'ops'))!.title
  const s = member({ ...over, role })
  bizOf(g, a).staff.push(s)
  return { g, a, s }
}

const knowKeys = (g: GameState): string[] => Object.keys(readKnow(g)?.k ?? {})
const stfKeys = (g: GameState): string[] => knowKeys(g).filter((k) => k.startsWith('stf:'))

// ---------------------------------------------------------------------------------------------------------------------------------
// The gate

describe('staffFog is the leaf\'s own copy of peopleFog (a business file may not import people-fog.ts)', () => {
  const MODES = ['exact', 'realistic'] as const
  for (const flag of [true, false]) {
    for (const mode of MODES) {
      it(`the flag ${flag ? 'on' : 'off'} in ${mode}`, () => {
        withFlags({ peopleProfile: flag }, () =>
          withInfoMode(mode, () => {
            expect(staffFog()).toBe(peopleFog())
            expect(staffFog()).toBe(flag && mode === 'realistic')
          }),
        )
      })
    }
  }

  it('exposure is min(1, years / 3), total, and 1 at a hundred times the years', () => {
    expect([0, 1, 2, 3].map(staffExposure)).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(staffExposure(300)).toBe(1)
    expect(staffExposure(1e300)).toBe(1)
    for (const bad of [NaN, -1, Infinity, -Infinity, undefined as unknown as number, '3' as unknown as number, null as unknown as number]) expect(staffExposure(bad)).toBe(0)
  })

  it('the key of a hire is stf:<asset>:<id>:skill, and a refused key is null (never read as exact)', () => {
    expect(staffKey('a12', 'ks57')).toBe('stf:a12:ks57:skill')
    expect(staffKey('a12', 'ceo')).toBe('stf:a12:ceo:skill')
    expect(staffKey('a 12', 'ks57')).toBeNull()
    expect(staffKey('a12', 'sHead Chef')).toBeNull()
    expect(staffKey('a12', 'k:s')).toBeNull()
    expect(staffKey('a12', 'x'.repeat(60))).toBeNull()
    expect(staffKey('', 'ks1')).toBeNull()
    expect(staffKey(5 as unknown as string, 'ks1')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Exact is today

describe('Exact, and Realistic with the flag off, print today\'s sheet', () => {
  const recorded = (group: 'staff' | 'hire'): Row[] => (JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as { rows: Row[] }).rows.filter(([k]) => groupOf(k) === group)

  for (const flag of [true, false]) {
    it(`Exact with the flag ${flag ? 'on' : 'off'}: the staff rows are the recorded ones`, { timeout: 120_000 }, () => {
      const rows = withFlags({ peopleProfile: flag }, () => buildGroup('staff'))
      const moved = diffRows(recorded('staff'), rows)
      expect(moved, moved.join('\n')).toEqual([])
    })
  }

  it('Exact with the flag on: the shortlists and the hire are the recorded ones, and a hire writes no know row', { timeout: 120_000 }, () => {
    const rows = withFlags(ON, () => buildGroup('hire'))
    const moved = diffRows(recorded('hire'), rows)
    expect(moved, moved.join('\n')).toEqual([])
    const { g, a } = withFlags(ON, () => life(3))
    withFlags(ON, () => hire(g, a, interview(g, a)))
    expect(readKnow(g)).toBeNull()
  })

  it('Realistic with the flag off: the staff rows are the recorded ones (the sheet R3 left alone)', { timeout: 120_000 }, () => {
    const rows = withFlags(OFF, () => inFog(() => buildGroup('staff')))
    const moved = diffRows(recorded('staff'), rows)
    expect(moved, moved.join('\n')).toEqual([])
  })

  it('Realistic with the flag off keeps the R3 shortlist and writes no stf row when you hire', () => {
    withFlags(OFF, () =>
      inFog(() => {
        const { g, a } = life(4)
        const m = interview(g, a)
        expect(linesOf(m).every((l) => /skill about \d+ to \d+, asks .*trait not clear yet\.$/.test(l))).toBe(true)
        const s = hire(g, a, m)
        expect(stfKeys(g)).toEqual([])
        expect(knowKeys(g)).toEqual([])
        const { subtitle, header } = sheet(g, a, s)
        expect(subtitle).toBe(`${s.role} · skill ${s.skill} · morale ${s.morale}%`)
        expect(header).toContain(`Skill ${s.skill}/100 · ${traitOf(s.trait).label} · Morale ${s.morale}%`)
      }),
    )
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The carried read

describe('the read of the candidate you hire goes with the hire', () => {
  it('opens the sheet on the range the shortlist showed, names no trait yet, and keeps one stf row (source interview)', () => {
    real(() => {
      for (const [seed, talent] of [[1, false], [2, true], [3, false], [4, true]] as const) {
        const { g, a } = life(seed, { talent })
        const m = interview(g, a)
        const pick = seed % linesOf(m).length
        const shown = rangeIn(linesOf(m)[pick])!
        const s = hire(g, a, m, pick)
        const { subtitle, header } = sheet(g, a, s)
        expect(rangeIn(subtitle), `seed ${seed} subtitle`).toBe(shown)
        expect(headerRange(header), `seed ${seed} header`).toBe(shown)
        expect(subtitle).not.toContain(`skill ${s.skill} `)
        expect(header).not.toContain('/100')
        expect(header).toContain('Trait not clear yet')
        expect(header).not.toContain(traitOf(s.trait).label)
        expect(`${subtitle}\n${header}`).not.toMatch(BAD)
        expect(LONG_DASH.test(`${subtitle}\n${header}`)).toBe(false)
        expect(knowKeys(g)).toEqual([`stf:${a.id}:${s.id}:skill`])
        expect(readKnow(g)!.k[`stf:${a.id}:${s.id}:skill`].src).toBe('interview')
      }
    })
  })

  it('carries the sd of the shortlist read: .18, or .108 with the Business talent, a little under the passive .20 (.12)', () => {
    real(() => {
      for (const [seed, talent, sd] of [[5, false, 0.18], [6, true, 0.108]] as const) {
        const { g, a } = life(seed, { talent })
        const s = hire(g, a, interview(g, a))
        expect(readKnow(g)!.k[`stf:${a.id}:${s.id}:skill`].sd).toBeCloseTo(sd, 9)
        const e = staffSkillRead(g, a.id, s)!
        expect(e.sd).toBeCloseTo(sd, 9)
        expect(e.src).toBe('interview')
      }
    })
  })

  it('a background check names the trait at once, reads the narrow range of the checked shortlist, and keeps the source diligence', () => {
    real(() => {
      for (const seed of [7, 8, 9]) {
        const { g, a } = life(seed)
        const first = interview(g, a)
        const open = rangeIn(linesOf(first)[1])!
        runScript(g, first.scriptId!, 'vet', first.data, first)
        const checked = hires(g).at(-1)!
        expect(dataOf(checked).vet).toBe(1)
        const shown = rangeIn(linesOf(checked)[1])!
        expect(widthOf(shown)).toBeLessThan(widthOf(open))
        const s = hire(g, a, checked, 1)
        const { subtitle, header } = sheet(g, a, s)
        expect(rangeIn(subtitle)).toBe(shown)
        expect(headerRange(header)).toBe(shown)
        expect(header).toContain(`${traitOf(s.trait).label} · Morale`)
        expect(header).not.toContain('not clear yet')
        expect(traitNamed(g, a.id, s)).toBe(true)
        expect(readKnow(g)!.k[`stf:${a.id}:${s.id}:skill`].src).toBe('diligence')
        // the checks of the settled shortlist are gone; the one row is the hire's
        expect(knowKeys(g)).toEqual([`stf:${a.id}:${s.id}:skill`])
      }
    })
  })

  it('an unchecked hire does not know the trait at year 0', () => {
    real(() => {
      const { g, a } = life(10)
      const s = hire(g, a, interview(g, a))
      expect(traitNamed(g, a.id, s)).toBe(false)
    })
  })

  it('writes nothing else: money, cash, the ledger, g.rng and the ids are what the same hire does with the flag off', () => {
    const run = (flag: boolean) =>
      withFlags({ peopleProfile: flag }, () =>
        inFog(() => {
          const { g, a } = life(11)
          const m = interview(g, a)
          const s = hire(g, a, m)
          const b = bizOf(g, a)
          return { rng: g.rng, nextId: g.nextId, cash: b.cash, money: g.character.money, costs: b.yearCosts, staff: JSON.stringify(b.staff), id: s.id, problems: ledgerProblems(g), know: knowKeys(g).length }
        }),
      )
    const on = run(true)
    const off = run(false)
    expect({ ...on, know: 0 }).toEqual({ ...off, know: 0 })
    expect(on.know).toBe(1)
    expect(off.know).toBe(0)
  })

  it('one row a hire, inside the 120 of the record', () => {
    real(() => {
      const { g, a } = life(12)
      const b = bizOf(g, a)
      const roles = industryDef(b.industry).roles
      for (const [i] of roles.entries()) carryRead(g, a.id, `ks${100 + i}`, { mid: 60, sd: 0.18, checked: false })
      expect(stfKeys(g)).toHaveLength(roles.length)
      for (let i = 0; i < 400; i++) carryRead(g, a.id, `ks${1000 + i}`, { mid: 50 + (i % 20), sd: 0.18, checked: i % 2 === 0 })
      expect(knowKeys(g).length).toBeLessThanOrEqual(120)
    })
  })

  it('carryRead is a no-op in Exact, with the flag off, and for a key the contract refuses', () => {
    const g = fogGame(1)
    const h = readerGame(g, 'carry-1')
    withFlags(ON, () => carryRead(h, 'a1', 'ks1', { mid: 60, sd: 0.18, checked: false }))
    expect(readKnow(h)).toBeNull()
    withFlags(OFF, () => inFog(() => carryRead(h, 'a1', 'ks1', { mid: 60, sd: 0.18, checked: false })))
    expect(readKnow(h)).toBeNull()
    real(() => {
      carryRead(h, 'a 1', 'ks1', { mid: 60, sd: 0.18, checked: false })
      carryRead(h, 'a1', 'sHead Chef', { mid: 60, sd: 0.18, checked: false })
      carryRead(h, 'a1', 'ks1', { mid: NaN, sd: 0.18, checked: false })
      carryRead(h, 'a1', 'ks1', { mid: 60, sd: NaN, checked: false })
      expect(readKnow(h)).toBeNull()
      carryRead(h, 'a1', 'ks1', { mid: 60, sd: 0.18, checked: false })
      expect(Object.keys(readKnow(h)!.k)).toEqual(['stf:a1:ks1:skill'])
    })
  })

  it('the carried read is honest: the range holds the true skill about 80% of the time, rounded outward', () => {
    real(() => {
      const base = fogGame(1)
      const n = 1_500
      let hit = 0
      for (let i = 0; i < n; i++) {
        const g = readerGame(base, `carry-life-${i}`)
        const skill = 42 + 16 * unitAt('carry', i)
        const key = candKey('abc', 0)
        const est = know(g, key, skill)
        carryRead(g, 'a1', 'ks1', { mid: est.mid, sd: est.sd, checked: false })
        const e = staffSkillRead(g, 'a1', { id: 'ks1', skill, years: 0 })!
        expect(e.src).toBe('interview')
        if (e.lo <= skill && skill <= e.hi) hit++
      }
      expect(hit / n).toBeGreaterThan(0.75)
      expect(hit / n).toBeLessThan(0.86)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Exposure: the read tightens with the years

describe('tenure is exposure', () => {
  it('names the trait at year 1', () => {
    real(() => {
      const { g, a } = life(13)
      const s = hire(g, a, interview(g, a))
      expect(sheet(g, a, s).header).toContain('Trait not clear yet')
      g.year += 1
      s.years = 1
      const { header } = sheet(g, a, s)
      expect(traitNamed(g, a.id, s)).toBe(true)
      expect(header).toContain(`${traitOf(s.trait).label} · Morale`)
      expect(header).not.toContain('not clear yet')
      expect(headerRange(header)).not.toBeNull()
    })
  })

  it('reads at exposure 1 from year 3: the passive sd is .20 x (1 - .4) = .12, or .072 with the Business talent', () => {
    real(() => {
      for (const [seed, talent, sd] of [[14, false, 0.12], [15, true, 0.072]] as const) {
        const { g, a } = life(seed, { talent })
        const s = hire(g, a, interview(g, a))
        g.year += 3
        s.years = 3
        const e = staffSkillRead(g, a.id, s)!
        // the carried interview read is too old to beat it: the sd of the row aged three years is .20 or more
        expect(e.src).toBe('passive')
        expect(e.sd).toBeCloseTo(sd, 9)
        expect(e.conf).toBe(2)
      }
    })
  })

  it('a checked read keeps beating the passive one for a while, and then the passive one takes over', () => {
    real(() => {
      const { g, a } = life(16)
      const first = interview(g, a)
      runScript(g, first.scriptId!, 'vet', first.data, first)
      const s = hire(g, a, hires(g).at(-1)!)
      const start = g.year
      const at = (years: number) => {
        g.year = start + years
        s.years = years
        return staffSkillRead(g, a.id, s)!
      }
      expect(at(0).sd).toBeCloseTo(0.05, 9)
      expect(at(0).src).toBe('diligence')
      expect(at(3).src).toBe('diligence')
      expect(at(3).sd).toBeCloseTo(Math.sqrt(0.05 ** 2 + 0.05 ** 2 * 3), 9)
      expect(at(8).src).toBe('passive')
      expect(at(8).sd).toBeCloseTo(0.12, 9)
      // asOf names the year of a reading that is two or more years old
      expect(at(2).asOf).toBe(start)
      expect(at(1).asOf).toBeUndefined()
    })
  })

  it('the band narrows with the years: the mean width falls from year 0 to 1, 2 and 3', () => {
    real(() => {
      const width = (years: number): number => {
        let sum = 0
        const n = 300
        for (let i = 0; i < n; i++) {
          const e = staffSkillRead(fogGame(i), 'a1', { id: 'ks1', skill: 50, years })!
          sum += e.hi - e.lo
        }
        return sum / n
      }
      const w = [0, 1, 2, 3].map(width)
      expect(w[1]).toBeLessThan(w[0])
      expect(w[2]).toBeLessThan(w[1])
      expect(w[3]).toBeLessThan(w[2])
      // years x100 is exposure 1 and no sharper
      expect(width(300)).toBeCloseTo(w[3], 9)
    })
  })

  it('years x100 gives exposure 1 and an sd of at least 3%, for any talent', () => {
    real(() => {
      for (const talents of [[], ['Business'], ['MainCharacter', 'Business']]) {
        const e = staffSkillRead(fogGame(1, { talents }), 'a1', { id: 'ks1', skill: 60, years: 300 })!
        expect(e.sd).toBeGreaterThanOrEqual(0.03)
        expect(e.sd).toBeCloseTo(Math.max(0.03, 0.2 * (talents.length ? 0.6 : 1) * 0.6), 9)
      }
    })
  })

  it('coverage: the range holds the true skill 77% to 83% of 10,000 draws, at exposure 0 and at 1 (RF7)', () => {
    real(() => {
      const N = 10_000
      for (const years of [0, 3]) {
        let hit = 0
        for (let i = 0; i < N; i++) {
          const skill = 42 + 16 * unitAt(`cover-${years}`, i)
          const e = staffSkillRead(fogGame(i), 'a1', { id: 'ks7', skill, years })!
          if (e.lo <= skill && skill <= e.hi) hit++
        }
        expect(hit / N, `years ${years}`).toBeGreaterThan(0.77)
        expect(hit / N, `years ${years}`).toBeLessThan(0.83)
      }
    })
  })

  it('the same read twice in a year is equal; another year reads another number', () => {
    real(() => {
      const g = fogGame(3)
      const s = { id: 'ks1', skill: 55, years: 0 }
      expect(staffSkillRead(g, 'a1', s)).toEqual(staffSkillRead(g, 'a1', s))
      const reads = new Set<number>()
      for (let y = 0; y < 8; y++) reads.add(staffSkillRead({ ...g, year: g.year + y }, 'a1', s)!.mid)
      expect(reads.size).toBeGreaterThan(1)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The contribution stops leaking the skill

describe('"current contribution" is worked out on what the player reads', () => {
  const same = { mid: 60, sd: 0.18 }

  it('two staff of different true skill (and different unnamed traits) with the same read print the same sentence', () => {
    real(() => {
      const strong = staffed(21, { skill: 91, trait: 'visionary' })
      const weak = staffed(21, { skill: 33, trait: 'lazy' })
      for (const x of [strong, weak]) learn(x.g, `stf:${x.a.id}:${x.s.id}:skill`, { ...same, src: 'interview' })
      const a = sheet(strong.g, strong.a, strong.s)
      const b = sheet(weak.g, weak.a, weak.s)
      expect(headerRange(a.header)).toBe(headerRange(b.header))
      expect(a.subtitle).toBe(b.subtitle)
      expect(contributionOf(a.header)).not.toBeNull()
      expect(contributionOf(a.header)).toBe(contributionOf(b.header))
      expect(bodyOf(a.header)).toBe(bodyOf(b.header))
    })
  })

  it('in Exact the sentence does move with the true skill (the case above is not vacuous)', () => {
    const strong = staffed(21, { skill: 91, trait: 'steady' })
    const weak = staffed(21, { skill: 33, trait: 'steady' })
    expect(contributionOf(sheet(strong.g, strong.a, strong.s).header)).not.toBe(contributionOf(sheet(weak.g, weak.a, weak.s).header))
  })

  it('once the trait is named the contribution uses it', () => {
    real(() => {
      const fast = staffed(22, { skill: 70, trait: 'visionary', years: 1 })
      const slow = staffed(22, { skill: 70, trait: 'lazy', years: 1 })
      for (const x of [fast, slow]) learn(x.g, `stf:${x.a.id}:${x.s.id}:skill`, { mid: 60, sd: 0.03, src: 'diligence' })
      expect(traitNamed(fast.g, fast.a.id, fast.s)).toBe(true)
      expect(contributionOf(sheet(fast.g, fast.a, fast.s).header)).not.toBe(contributionOf(sheet(slow.g, slow.a, slow.s).header))
    })
  })

  it('a teammate\'s true skill does not reach the sentence through the diminishing returns', () => {
    real(() => {
      const mk = (mateSkill: number) => {
        const x = staffed(23, { skill: 50, trait: 'steady' })
        const b = bizOf(x.g, x.a)
        // the same focus, another role (a company keeps one leader a role)
        const other = industryDef(b.industry).roles.find((r) => r.title !== x.s.role)!
        b.staff.push(member({ id: 'ks2', firstName: 'Mate', role: other.title, focus: 'ops', skill: mateSkill, trait: 'steady' }))
        for (const id of ['ks1', 'ks2']) learn(x.g, `stf:${x.a.id}:${id}:skill`, { mid: 60, sd: 0.18, src: 'interview' })
        return x
      }
      const lo = mk(10)
      const hi = mk(98)
      expect(contributionOf(sheet(lo.g, lo.a, lo.s).header)).not.toBeNull()
      expect(contributionOf(sheet(lo.g, lo.a, lo.s).header)).toBe(contributionOf(sheet(hi.g, hi.a, hi.s).header))
      // and in Exact the teammate does move it
      const mkExact = (mateSkill: number) => {
        const x = staffed(23, { skill: 50, trait: 'steady' })
        const other = industryDef(bizOf(x.g, x.a).industry).roles.find((r) => r.title !== x.s.role)!
        bizOf(x.g, x.a).staff.push(member({ id: 'ks2', firstName: 'Mate', role: other.title, focus: 'ops', skill: mateSkill, trait: 'steady' }))
        return x
      }
      const e1 = mkExact(10)
      const e2 = mkExact(98)
      expect(contributionOf(withInfoMode('exact', () => sheet(e1.g, e1.a, e1.s).header))).not.toBe(contributionOf(withInfoMode('exact', () => sheet(e2.g, e2.a, e2.s).header)))
    })
  })

  it('shownLeader: the middle of the read, a steady trait until it is named, and a middling steady stranger when nothing can be read', () => {
    real(() => {
      const { g, a, s } = staffed(24, { skill: 88, trait: 'visionary' })
      learn(g, `stf:${a.id}:${s.id}:skill`, { mid: 41.6, sd: 0.18, src: 'interview' })
      const seen = shownLeader(g, a.id, s)
      expect(seen.skill).toBe(42)
      expect(seen.trait).toBe('steady')
      expect(seen.morale).toBe(s.morale)
      expect(shownLeader(g, a.id, { ...s, years: 2 }).trait).toBe('visionary')
      const lost = shownLeader(g, 'a 1', { ...s, skill: NaN })
      expect(lost.skill).toBe(50)
      expect(lost.trait).toBe('steady')
    })
  })

  it('the team summary under the header is what it was (rounded team percents are observed output)', () => {
    real(() => {
      const { g, a, s } = staffed(25)
      const exact = withInfoMode('exact', () => sheet(g, a, s).header)
      const fogged = sheet(g, a, s).header
      const tail = (h: string) => h.slice(h.indexOf('Team impact:'))
      expect(tail(fogged)).toBe(tail(exact))
      expect(tail(fogged).length).toBeGreaterThan(40)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Hostile records and purity

describe('hostile key staff', () => {
  it('a missing years, a NaN skill and a stranger\'s key print without NaN, and never as the exact number', () => {
    real(() => {
      const g = fogGame(2)
      expect(staffSkillRead(g, 'a1', { id: 'ks1', skill: NaN, years: 0 })).toBeNull()
      expect(staffSkillRead(g, 'a1', { id: 'ks1', skill: Infinity, years: 0 })).toBeNull()
      expect(staffSkillRead(g, 'a 1', { id: 'ks1', skill: 60, years: 0 })).toBeNull()
      expect(staffSkillRead(g, 'a1', { id: 'sHead Chef', skill: 60, years: 0 })).toBeNull()
      const noYears = staffSkillRead(g, 'a1', { id: 'ks1', skill: 60 } as unknown as { id: string; skill: number; years: number })!
      expect(noYears.sd).toBeCloseTo(0.2, 9)
      expect(noYears.exact).toBe(false)
      expect(traitNamed(g, 'a1', { id: 'ks1' } as unknown as { id: string; years: number })).toBe(false)
      expect(traitNamed(g, 'a1', { id: 'ks1', years: NaN })).toBe(false)
      expect(traitNamed(g, 'a1', { id: 'ks1', years: 5 })).toBe(true)
    })
  })

  it('the sheet of a staff member with a spaced id (an old save) reads "not clear yet" and never the true skill', () => {
    real(() => {
      const { g, a, s } = staffed(26, { id: 'sHead Chef', skill: 77 })
      const { subtitle, header } = sheet(g, a, s)
      expect(subtitle).toContain('skill not clear yet')
      expect(header).toContain('Skill not clear yet')
      expect(`${subtitle}\n${header}`).not.toMatch(BAD)
      expect(`${subtitle}\n${header}`).not.toMatch(/skill 77|77\/100/i)
    })
  })

  it('a hand-damaged company record still prints a sheet without NaN or undefined', () => {
    real(() => {
      const { g, a } = staffed(27)
      const raw = a.details.staff as Array<Record<string, unknown>>
      raw[0].skill = 'high'
      raw[0].years = undefined
      raw[0].morale = null
      const s = readBiz(g, a).staff[0]
      const { subtitle, header } = sheet(g, a, s)
      expect(`${subtitle}\n${header}`).not.toMatch(BAD)
    })
  })

  it('the leaf reads a hostile game without throwing: no assets, assets that are not a list, rows that are not objects', () => {
    real(() => {
      const g = fogGame(1)
      const key = 'stf:a1:ks1:skill'
      const def = kindOf('stf')!
      for (const assets of [undefined, null, 'x', 5, [null, 3, 'x', { id: 'a1' }, { id: 'a1', details: null }, { id: 'a1', details: { staff: 'no' } }]] as unknown[]) {
        const h = { ...g, assets } as unknown as GameState
        expect(() => def.label(h, key)).not.toThrow()
        expect(() => def.gone?.(h, key)).not.toThrow()
        expect(def.truth(h, key)).toBeNull()
        expect(typeof def.label(h, key)).toBe('string')
      }
      expect(def.gone!({ ...g, assets: 'x' } as unknown as GameState, key)).toBe(false)
      expect(def.gone!({ ...g, assets: [{ id: 'a1', details: { staff: 'no' } }] } as unknown as GameState, key)).toBe(false)
    })
  })
})

describe('the sheet is pure', () => {
  it('builds twice on a frozen copy with the same text, and moves neither g.rng nor g.nextId', () => {
    real(() => {
      const { g, a } = life(28)
      const s = hire(g, a, interview(g, a))
      const frozen = deepFreeze(JSON.parse(JSON.stringify(g)) as GameState)
      const fa = frozen.assets.find((x) => x.id === a.id)!
      const one = sheet(frozen, fa, s)
      const two = sheet(frozen, fa, s)
      expect(two).toEqual(one)
      expect(frozen.rng).toBe(g.rng)
      expect(frozen.nextId).toBe(g.nextId)
      expect(JSON.stringify(frozen)).toBe(JSON.stringify(g))
      expect(one.subtitle).toMatch(/skill about \d+/)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The owner of the stf key

describe('the stf key kind', () => {
  it('is registered with a label and gone, and nothing is for sale (truth is null, there is no scope)', () => {
    const def = kindOf('stf')
    expect(def).not.toBeNull()
    expect(typeof def!.label).toBe('function')
    expect(typeof def!.gone).toBe('function')
    expect(def!.scope).toBeUndefined()
    expect(def!.revealedBy).toBeUndefined()
    expect(def!.truth(fogGame(1), 'stf:a1:ks1:skill')).toBeNull()
    expect(RULES['stf.skill']).toBeDefined()
    // cand stays ownerless (a popup cannot hold a Look closer group; fog-acceptance pins it too)
    expect(kindOf('cand')).toBeNull()
  })

  it('names the person, and says gone when the hire left or the company is gone', () => {
    real(() => {
      const { g, a } = life(29)
      const s = hire(g, a, interview(g, a))
      const key = `stf:${a.id}:${s.id}:skill`
      expect(labelOfKey(g, key)).toBe(`${s.firstName} ${s.lastName}'s skill`)
      const def = kindOf('stf')!
      expect(def.gone!(g, key)).toBe(false)
      bizOf(g, a).staff = []
      expect(def.gone!(g, key)).toBe(true)
      expect(def.gone!(g, `stf:a99999:${s.id}:skill`)).toBe(true)
      expect(labelOfKey(g, `stf:a99999:${s.id}:skill`)).toBe("A hire's skill")
    })
  })

  it('the CEO key of a company reads gone when nobody but you runs it', () => {
    real(() => {
      const { g, a } = life(30)
      const b = bizOf(g, a)
      const key = `stf:${a.id}:ceo:skill`
      const def = kindOf('stf')!
      expect(def.gone!(g, key)).toBe(true)
      b.manager = { firstName: 'Ann', lastName: 'Cho', gender: 'female', skill: 70, salary: 120_000, since: g.year - 1, style: 'steady', integrity: 80 }
      expect(def.gone!(g, key)).toBe(false)
      expect(labelOfKey(g, key)).toBe("Ann Cho's skill")
    })
  })

  it('a staff member who quit or was fired has the row forgotten by the next yearly step, and twice is once', () => {
    real(() => {
      const { g, a } = life(31)
      const m = interview(g, a)
      const keep = hire(g, a, m, 0)
      const b = bizOf(g, a)
      // a second leader, then the first one is let go
      const second = industryDef(b.industry).roles.find((r) => !b.staff.some((x) => x.role === r.title))!
      b.staff.push(member({ id: 'ks2', role: second.title, focus: second.focus }))
      carryRead(g, a.id, 'ks2', { mid: 55, sd: 0.18, checked: false })
      expect(stfKeys(g).sort()).toEqual([`stf:${a.id}:${keep.id}:skill`, `stf:${a.id}:ks2:skill`].sort())
      fireStaff(g, a, b, b.staff.find((x) => x.id === keep.id)!)
      yearlyKnowledge(g)
      expect(stfKeys(g)).toEqual([`stf:${a.id}:ks2:skill`])
      const once = JSON.stringify(g.flags)
      yearlyKnowledge(g)
      expect(JSON.stringify(g.flags)).toBe(once)
      // quitting is the same: the staff list no longer holds them
      g.year += 1
      b.staff = []
      yearlyKnowledge(g)
      expect(stfKeys(g)).toEqual([])
      expect(readKnow(g)).toBeNull()
    })
  })

  it('forgets at most 12 rows a step, the stalest first', () => {
    real(() => {
      const g = readerGame(fogGame(1), 'forget-life')
      g.assets = []
      for (let i = 0; i < 20; i++) carryRead(g, 'a1', `ks${i}`, { mid: 50, sd: 0.18, checked: false })
      expect(stfKeys(g)).toHaveLength(20)
      yearlyKnowledge(g)
      expect(stfKeys(g)).toHaveLength(8)
      g.year += 1
      yearlyKnowledge(g)
      expect(stfKeys(g)).toHaveLength(0)
    })
  })

  it('the Briefing lists a carried row by name with its chip, and the standing orders neither buy nor choke on it', () => {
    real(() => {
      const { g, a } = life(32)
      const s = hire(g, a, interview(g, a))
      const key = `stf:${a.id}:${s.id}:skill`
      expect(intelBriefingMenu.visible?.(g)).toBe(true)
      const rows = intelBriefingMenu.children(g)
      const row = rows.find((n): n is Extract<MenuNode, { type: 'info' }> => n.type === 'info' && n.id === `intel.row.${key}`)
      expect(row).toBeDefined()
      const text = typeof row!.text === 'function' ? row!.text(g) : row!.text
      expect(text).toContain(`${s.firstName} ${s.lastName}'s skill`)
      expect(text).toMatch(/\d/)
      expect(rows.some((n) => n.id === `intel.refresh.${key}`)).toBe(false)
      expect(storedEstimates(g).map((e) => [e.key, e.src])).toEqual([[key, 'interview']])
      expect(trackedKeys(g)).toEqual([key])
      // nothing sells it
      const money = g.character.money
      expect(buyIntel(g, 'investigator', [key]).ok).toBe(false)
      expect(lookCloser(g, { id: 'staff', keys: [key] })).toBeNull()
      expect(g.character.money).toBe(money)
      // the orders at their highest level run a year and book nothing for it
      setDial(g, 3)
      g.year += 1
      s.years = 1
      const flows = JSON.stringify(ledgerProblems(g))
      expect(() => yearlyKnowledge(g)).not.toThrow()
      expect(g.character.money).toBe(money)
      expect(JSON.stringify(ledgerProblems(g))).toBe(flows)
      expect(stfKeys(g)).toEqual([key])
    })
  })

  it('a Look closer on a person is not offered for staff, and the standing desk reads nothing of the stf family', () => {
    real(() => {
      const { g, a } = life(33)
      const s = hire(g, a, interview(g, a))
      expect(lookCloser(g, { id: 'person', keys: [`stf:${a.id}:${s.id}:skill`] })).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// leaderRead and skillText (the helpers the CEO reads of U7 call)

describe('leaderRead and skillText', () => {
  it('skillText is the band rounded outward: to 5 while the read is rough, to 1 once it is sharp; exact prints as today', () => {
    real(() => {
      const wide = know(fogGame(1), 'stf:a1:ks1:skill', 60)
      expect(skillText(wide, 60)).toMatch(/^about \d+( to \d+)?$/)
      expect(wide.sd).toBeGreaterThan(0.1)
      const text = skillText(wide, 60)
      const [lo, hi] = (/about (\d+)(?: to (\d+))?/.exec(text) ?? []).slice(1).map(Number)
      expect(lo % 5).toBe(0)
      expect((hi ?? lo) % 5).toBe(0)
      const sharp = { ...wide, sd: 0.05, lo: 57.3, hi: 62.6 }
      expect(skillText(sharp, 60)).toBe('about 57 to 63')
      expect(skillText({ ...sharp, lo: 59.6, hi: 60.4 }, 60)).toBe('about 59 to 61')
      expect(skillText({ ...sharp, lo: 60, hi: 60 }, 60)).toBe('about 60')
    })
    withInfoMode('exact', () => expect(skillText(know(fogGame(1), 'stf:a1:ks1:skill', 60), 60)).toBe('60/100'))
  })

  it('leaderRead is today\'s text in Exact and with the flag off, and a range with a chip in Realistic with the flag on', () => {
    expect(leaderRead(fogGame(1), 'cand:abc:0:skill', 73, 0)).toEqual({ text: '73/100' })
    withFlags(OFF, () => inFog(() => expect(leaderRead(fogGame(1), 'cand:abc:0:skill', 73, 0)).toEqual({ text: '73/100' })))
    real(() => {
      const r = leaderRead(fogGame(1), 'cand:abc:0:skill', 73, 0)
      expect(r.text).toMatch(/^about \d+( to \d+)?$/)
      expect(r.conf).toBeGreaterThanOrEqual(0)
      expect(leaderRead(fogGame(1), 'stf:a1:ceo:skill', 73, 1).text).toMatch(/^about /)
      expect(leaderRead(fogGame(1), 'cand:abc:0:skill', 73, 0)).toEqual(r)
    })
  })

  it('leaderRead refuses a bad key, a bad skill and a key of another family, and never answers with the truth', () => {
    real(() => {
      const g = fogGame(1)
      for (const [key, skill] of [['cand:a b:0:skill', 73], ['nonsense', 73], ['cand:abc:0:skill', NaN], ['mkt:cafe:us:size', 73], ['cand:abc:0:quality', 73], ['stf:a1:ceo:skill', Infinity]] as const) {
        const r = leaderRead(g, key, skill, 0)
        expect(r.text, `${key} ${skill}`).toBe('not clear yet')
        expect(r.conf).toBe(0)
      }
    })
  })

  it('leaderRead at a hundred times the exposure reads as exposure 1', () => {
    real(() => {
      const g = fogGame(1)
      expect(leaderRead(g, 'stf:a1:ceo:skill', 60, 100)).toEqual(leaderRead(g, 'stf:a1:ceo:skill', 60, 1))
      expect(leaderRead(g, 'stf:a1:ceo:skill', 60, NaN)).toEqual(leaderRead(g, 'stf:a1:ceo:skill', 60, 0))
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The leaf stays a leaf

describe('the leaf', () => {
  const file = readFileSync(join(ROOT, 'src/game/business/leader-fog.ts'), 'utf8')
  const staffFile = readFileSync(join(ROOT, 'src/game/business/staff.ts'), 'utf8')
  const fogFile = readFileSync(join(ROOT, 'src/game/business/staff-fog.ts'), 'utf8')

  it('imports only the flags, the knowledge door and the types: nothing from business/ and nothing from people-fog.ts', () => {
    const imports = [...file.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const from of imports) expect(['../flags', '../knowledge/contract', '../types'], from).toContain(from)
  })

  it('passes exposure to know() (it is on the allow-list of knowledge-unwired) and draws nothing and books nothing', () => {
    const code = file.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).toMatch(/\bexp\s*:/)
    expect(code).not.toMatch(/Math\.random|\.rng\b|\brand\(|chance\(|randInt\(|uid\(/)
    expect(code).not.toMatch(/\.money\b|\.cash\b|firmCash|earnIncome|addMoney|spend\(|bookMint|bookBurn/)
  })

  it('staff.ts and staff-fog.ts take skillText and staffFog from the leaf, and the old copy is gone', () => {
    expect(fogFile).toMatch(/from '\.\/leader-fog'/)
    expect(fogFile).not.toMatch(/^function skillText/m)
    expect(staffFile).toMatch(/from '\.\/leader-fog'/)
  })

  it('holds no em dash or en dash in the three files', () => {
    for (const text of [file, staffFile, fogFile]) expect(LONG_DASH.test(text.replaceAll('−', '-'))).toBe(false)
  })

  it('every text the sheet prints is short and plain', () => {
    real(() => {
      const { g, a } = life(34)
      const s = hire(g, a, interview(g, a))
      const { subtitle, header } = sheet(g, a, s)
      expect(subtitle.length).toBeLessThanOrEqual(90)
      for (const line of header.split('\n').slice(0, 2)) expect(line.length, line).toBeLessThanOrEqual(120)
    })
  })

  it('vetFee is unchanged by the carry (the check is still a share of the role pay)', () => {
    real(() => {
      const { g, a } = life(35)
      const b = bizOf(g, a)
      const role = industryDef(b.industry).roles[0]
      expect(vetFee(b, role)).toBe(vetFee({ countryId: b.countryId }, role))
    })
  })
})
