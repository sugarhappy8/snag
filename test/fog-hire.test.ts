// R3-G4 (H.4): hiring reads estimates. An interview shortlist used to print every candidate's skill and trait exactly. In Realistic
// mode the popup shows what an interview can tell you: a range for the skill and "not clear yet" for the trait. A background check
// is a choice in the popup: it costs a small share of the role's pay (never the cash on hand), books once through the company's
// books, reads each candidate's skill much closer (Knowledge's due diligence source) and names the trait. Hiring a candidate still
// stores the true skill and trait: you hired them, and the trait-after-a-year reveal is a later item.
//
//   exact    Exact mode: the popup's lines, labels, choices and data are what they were before this task
//   honest   the range holds the true skill about 80% of the time (rounded outward, so a little more), before and after a check
//   stable   the same candidate reads the same range again; a second check of the same shortlist reads and charges nothing
//   pure     building a read, a fee or the menu never writes and never draws from g.rng
//   tidy     the readings live only while the popup does: hiring, or hiring nobody, forgets them
//   ceiling  the fee follows the role's pay, so a hundred times the cash or the money pays the same
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { traitOf } from '../src/game/business/flavor'
import { industryDef, type RoleDef } from '../src/game/business/industries'
import { interviewFee } from '../src/game/business/staff'
import { candidateLabel, candidateLine, candidateRead, candKey, takeVet, vetFee } from '../src/game/business/staff-fog'
import { bizOf, readBiz } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { formatMoney } from '../src/game/core'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { localPay } from '../src/game/data/local-pay'
import { flowsOf, ledgerProblems } from '../src/game/kernel/ledger'
import { buyIntel, lookCloser, readKnow } from '../src/game/knowledge/contract'
import { trackedKeys } from '../src/game/knowledge/standing'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuInfo, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'
import { deepFreeze, fogGame, inFog, readerGame, unitAt } from './knowledge-kit'
import { adult, allNodes, company, drain } from './market-kit'

const DASH = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
const BAD = /NaN|undefined|\[object|Infinity/

interface Cand {
  firstName: string
  lastName: string
  age: number
  skill: number
  salary: number
  trait: string
}

const isHire = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire'
const hires = (g: GameState): ChoiceModal[] => g.queue.filter(isHire)
const dataOf = (m: ChoiceModal): Record<string, unknown> => m.data as unknown as Record<string, unknown>
const candsOf = (m: ChoiceModal): Cand[] => dataOf(m).candidates as Cand[]
const idOf = (m: ChoiceModal): string => String(dataOf(m).ck)
const linesOf = (m: ChoiceModal): string[] => m.text.split('\n').filter((l) => l.startsWith('• '))

/** A grown-up with a restaurant and a lot of cash, with or without the Business talent. */
function life(seed: number, opts: { talent?: boolean; cash?: number; money?: number } = {}): { g: GameState; a: Asset } {
  const g = adult(seed, 2026, 'us', opts.money)
  g.character.talents = opts.talent ? ['Business'] : []
  const a = company(g, 'restaurant', { cash: opts.cash ?? 5_000_000 })
  return { g, a }
}

/** The first hiring row that is open now. */
function hireRow(g: GameState, a: Asset): MenuAction {
  return allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g)) as MenuAction
}

const roleOfRow = (g: GameState, a: Asset, row: MenuAction): RoleDef => {
  const title = row.id.slice(`biz.hire.${a.id}.`.length)
  return industryDef(readBiz(g, a).industry).roles.find((r) => r.title === title)!
}

/** Hold an interview and give back its popup (the last one queued) and the role. */
function interview(g: GameState, a: Asset): { m: ChoiceModal; role: RoleDef } {
  const row = hireRow(g, a)
  row.run(g)
  return { m: hires(g).at(-1)!, role: roleOfRow(g, a, row) }
}

/** The first skill range a line or a label carries: "about 55 to 75" gives [55, 75], "about 70" gives [70, 70]. */
function rangeIn(text: string): [number, number] | null {
  const m = /about (\d+)(?: to (\d+))?/.exec(text)
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null
}
const widthOf = (text: string): number => {
  const r = rangeIn(text)
  return r ? r[1] - r[0] : Number.NaN
}

const exactLine = (c: Cand): string => `• ${c.firstName} ${c.lastName}, ${c.age}: skill ${c.skill}/100, asks ${formatMoney(c.salary)}, ${traitOf(c.trait).label.toLowerCase()}.`
const exactLabel = (c: Cand): string => `${c.firstName} ${c.lastName} · ${c.skill}/100 · ${money(c.salary)}`
const infoText = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const firmInputs = (g: GameState): number => flowsOf(g, g.year).filter((r) => r.reason === 'inputs').reduce((s, r) => s + r.net.firm, 0)

describe('the shortlist in Realistic mode', () => {
  it('shows a skill range and an unclear trait, never the exact skill', () => {
    inFog(() => {
      for (let s = 1; s <= 6; s++) {
        const { g, a } = life(s * 7)
        const { m } = interview(g, a)
        const list = candsOf(m)
        expect(list.length).toBeGreaterThanOrEqual(2)
        const lines = linesOf(m)
        expect(lines).toHaveLength(list.length)
        for (const [i, c] of list.entries()) {
          expect(lines[i]).toMatch(/skill about \d+ to \d+, asks /)
          expect(lines[i]).toContain('trait not clear yet.')
          expect(lines[i]).not.toContain('/100')
          expect(lines[i]).not.toContain(traitOf(c.trait).label.toLowerCase())
          const r = rangeIn(lines[i])!
          expect(r[0]).toBeLessThan(r[1])
          const label = m.choices.find((x) => x.id === `c${i}`)!.label
          expect(label).toMatch(/ · about \d+ to \d+ · /)
          expect(label).not.toContain('/100')
        }
        expect(m.text).toMatch(/Skill reads are (a rough guess|a fair estimate|a good estimate|close to exact)/)
        expect(m.text + m.choices.map((x) => x.label).join('|')).not.toMatch(BAD)
        expect(DASH.test(m.text)).toBe(false)
      }
    })
  })

  it('offers a background check before Hire nobody, which stays last (so a drain still picks it)', () => {
    inFog(() => {
      const { g, a } = life(11)
      const { m, role } = interview(g, a)
      const n = candsOf(m).length
      expect(m.choices.map((c) => c.id)).toEqual([...Array.from({ length: n }, (_, i) => `c${i}`), 'vet', 'none'])
      expect(m.choices.find((c) => c.id === 'vet')!.label).toContain(money(vetFee(bizOf(g, a), role)))
      const staff0 = readBiz(g, a).staff.length
      drain(g)
      expect(readBiz(g, a).staff).toHaveLength(staff0)
      expect(g.queue).toHaveLength(0)
    })
  })

  it('offers no check to a company that cannot pay for it, and does to one that just can', () => {
    inFog(() => {
      const { g, a } = life(12)
      const b = bizOf(g, a)
      const row = hireRow(g, a)
      const role = roleOfRow(g, a, row)
      const iv = interviewFee(b, role, 0)
      const fee = vetFee(b, role)
      b.cash = iv + fee - 1
      row.run(g)
      let m = hires(g).at(-1)!
      expect(m.choices.map((c) => c.id)).not.toContain('vet')
      expect(m.choices.at(-1)!.id).toBe('none')
      expect(m.text).toMatch(/trait not clear yet/)
      g.queue = []
      g.yearActions = {}
      bizOf(g, a).cash = iv + fee
      row.run(g)
      m = hires(g).at(-1)!
      expect(m.choices.map((c) => c.id)).toContain('vet')
    })
  })

  it('reads the same range again, in the same year, for the same candidate', () => {
    inFog(() => {
      const { g, a } = life(13)
      const { m } = interview(g, a)
      const id = idOf(m)
      const list = candsOf(m)
      const before = list.map((c, i) => candidateRead(g, id, i, c, 0).skill.text)
      expect(list.map((c, i) => candidateRead(g, id, i, c, 0).skill.text)).toEqual(before)
      const lines = linesOf(m)
      before.forEach((t, i) => expect(lines[i]).toContain(`skill ${t},`))
      // another year reads another number somewhere along a run of truths
      const next = { ...g, year: g.year + 1 }
      const at = (h: GameState, k: number): string => candidateRead(h, `${id}${k}`, 0, { skill: 55, trait: 'steady' }, 0).skill.text
      expect(Array.from({ length: 40 }, (_, k) => k).some((k) => at(next, k) !== at(g, k))).toBe(true)
    })
  })

  it('holds the true skill in its range about 80% of the time (rounded outward, so a little more)', () => {
    inFog(() => {
      let hit = 0
      const n = 300
      for (let i = 0; i < n; i++) {
        const skill = 10 + Math.floor(unitAt('cand', i) * 90)
        const r = rangeIn(candidateRead(fogGame(i), `id${i}`, 0, { skill, trait: 'steady' }, 0).skill.text)!
        if (r[0] <= skill && skill <= r[1]) hit++
      }
      expect(hit / n).toBeGreaterThanOrEqual(0.75)
      expect(hit / n).toBeLessThan(0.97)
    })
  })

  it('carries the confidence of the read: a rough guess for anyone, a better one for the Business talent', () => {
    inFog(() => {
      const plain = candidateRead(fogGame(1), 'x', 0, { skill: 60, trait: 'steady' }, 0)
      expect(plain.skill.conf).toBe(1)
      expect(plain.trait).toBe('not clear yet')
      const talent = candidateRead(fogGame(1, { talents: ['Business'] }), 'x', 0, { skill: 60, trait: 'steady' }, 0)
      expect(talent.skill.conf).toBeGreaterThanOrEqual(2)
    })
  })

  it('keeps the Business talent hint on a candidate, never on the check, and reads the skill closer for the talent', () => {
    inFog(() => {
      const { g, a } = life(14, { talent: true })
      const { m } = interview(g, a)
      const n = candsOf(m).length
      expect(m.choices.map((c) => c.id)).toEqual([...Array.from({ length: n }, (_, i) => `c${i}`), 'vet', 'none'])
      expect(m.choices.find((c) => c.id === 'vet')!.hint).toBeUndefined()
      expect(m.choices.filter((c) => c.hint).length).toBe(1)
      expect(m.text).toMatch(/Skill reads are (a fair estimate|a good estimate|close to exact)/)
      runScript(g, m.scriptId!, 'vet', m.data, m)
      const again = hires(g).at(-1)!
      expect(again.choices.find((c) => c.id === 'vet')).toBeUndefined()
      expect(again.choices.filter((c) => c.hint).length).toBe(1)
      expect(again.text).toMatch(/Background checks are in/)
    })
  })

  it('still stores the true skill and trait of the one you hire', () => {
    inFog(() => {
      for (let s = 1; s <= 4; s++) {
        const { g, a } = life(s * 5 + 1)
        const { m } = interview(g, a)
        const list = candsOf(m)
        const pick = s % list.length
        runScript(g, m.scriptId!, `c${pick}`, m.data, m)
        const staff = readBiz(g, a).staff
        expect(staff).toHaveLength(1)
        expect(staff[0].skill).toBe(list[pick].skill)
        expect(staff[0].trait).toBe(list[pick].trait)
        expect(readKnow(g)).toBeNull()
      }
    })
  })
})

describe('a background check', () => {
  it('charges the fee once through the company books, names the traits and narrows the ranges', () => {
    inFog(() => {
      const { g, a } = life(21)
      const { m, role } = interview(g, a)
      const b = bizOf(g, a)
      const fee = vetFee(b, role)
      const cash0 = b.cash
      const player0 = g.character.money
      const costs0 = b.yearCosts
      const inputs0 = firmInputs(g)
      const problems0 = ledgerProblems(g)
      const queued0 = hires(g).length
      runScript(g, m.scriptId!, 'vet', m.data, m)
      expect(cash0 - bizOf(g, a).cash).toBe(fee)
      expect(g.character.money).toBe(player0)
      expect(bizOf(g, a).yearCosts - costs0).toBe(fee)
      expect(firmInputs(g) - inputs0).toBe(-fee)
      expect(ledgerProblems(g)).toEqual(problems0)
      const all = hires(g)
      expect(all).toHaveLength(queued0 + 1)
      const again = all.at(-1)!
      expect(dataOf(again).vet).toBe(1)
      expect(candsOf(again)).toEqual(candsOf(m))
      const before = linesOf(m)
      const after = linesOf(again)
      expect(after).toHaveLength(before.length)
      for (const [i, c] of candsOf(again).entries()) {
        expect(after[i]).toContain(`, trait ${traitOf(c.trait).label.toLowerCase()}.`)
        expect(after[i]).toMatch(/skill about \d+( to \d+)?, asks /)
        expect(after[i]).not.toContain('not clear yet')
        expect(widthOf(after[i])).toBeLessThan(widthOf(before[i]))
      }
      expect(again.choices.map((c) => c.id)).not.toContain('vet')
      expect(again.choices.at(-1)!.id).toBe('none')
      expect(again.choices).toHaveLength(m.choices.length - 1)
      expect(again.text).toMatch(/Background checks are in/)
      expect(again.text).not.toMatch(BAD)
      expect(DASH.test(again.text)).toBe(false)
    })
  })

  it('reads the same range on a replay and charges nothing the second time', () => {
    inFog(() => {
      const { g, a } = life(22)
      const { m } = interview(g, a)
      runScript(g, m.scriptId!, 'vet', m.data, m)
      const first = hires(g).at(-1)!
      const cash = bizOf(g, a).cash
      runScript(g, m.scriptId!, 'vet', m.data, m)
      expect(bizOf(g, a).cash).toBe(cash)
      const second = hires(g).at(-1)!
      expect(second.text).toBe(first.text)
      expect(second.choices).toEqual(first.choices)
    })
  })

  it('forgets the readings when you hire, or hire nobody', () => {
    inFog(() => {
      const { g, a } = life(23)
      const { m } = interview(g, a)
      runScript(g, m.scriptId!, 'vet', m.data, m)
      expect(readKnow(g)).not.toBeNull()
      const vetted = hires(g).at(-1)!
      runScript(g, vetted.scriptId!, 'none', vetted.data, vetted)
      expect(readKnow(g)).toBeNull()

      const w = life(24)
      const iv = interview(w.g, w.a)
      runScript(w.g, iv.m.scriptId!, 'vet', iv.m.data, iv.m)
      expect(readKnow(w.g)).not.toBeNull()
      const v2 = hires(w.g).at(-1)!
      runScript(w.g, v2.scriptId!, 'c0', v2.data, v2)
      expect(readKnow(w.g)).toBeNull()
      expect(readBiz(w.g, w.a).staff[0].skill).toBe(candsOf(v2)[0].skill)
    })
  })

  it('holds the true skill about 80% of the time and reads closer than a first look', () => {
    inFog(() => {
      const base = makeTestGame(1)
      const n = 300
      let hit = 0
      let wide = 0
      let narrow = 0
      for (let i = 0; i < n; i++) {
        const g = readerGame(base, `vet-life-${i}`)
        const c = { skill: 10 + Math.floor(unitAt('vet', i) * 90), trait: 'steady' }
        const id = `s${i}`
        wide += widthOf(candidateRead(g, id, 0, c, 0).skill.text)
        expect(takeVet(g, id, [c])).toBe(true)
        const r = candidateRead(g, id, 0, c, 1)
        narrow += widthOf(r.skill.text)
        const band = rangeIn(r.skill.text)!
        if (band[0] <= c.skill && c.skill <= band[1]) hit++
        expect(r.skill.conf).toBeGreaterThanOrEqual(2)
        expect(r.trait).toBe('steady')
        // a second check of the same shortlist this year reads nothing
        expect(takeVet(g, id, [c])).toBe(false)
      }
      expect(hit / n).toBeGreaterThanOrEqual(0.75)
      expect(hit / n).toBeLessThan(0.99)
      expect(narrow).toBeLessThan(wide * 0.6)
    })
  })

  it('keeps two rounds of interviews apart: checking one does not touch the other', () => {
    inFog(() => {
      const { g, a } = life(25)
      const one = interview(g, a)
      const two = interview(g, a)
      expect(idOf(one.m)).not.toBe(idOf(two.m))
      const second = candsOf(two.m).map((c, i) => candidateRead(g, idOf(two.m), i, c, 0).skill.text)
      runScript(g, one.m.scriptId!, 'vet', one.m.data, one.m)
      expect(candsOf(two.m).map((c, i) => candidateRead(g, idOf(two.m), i, c, 0).skill.text)).toEqual(second)
      expect(Object.keys(readKnow(g)!.k).every((k) => candsOf(one.m).some((_, i) => k === candKey(idOf(one.m), i)))).toBe(true)
    })
  })

  it('does not charge or read when the company is short at the moment of the check, and the shortlist stays open', () => {
    inFog(() => {
      const { g, a } = life(26)
      const { m, role } = interview(g, a)
      bizOf(g, a).cash = vetFee(bizOf(g, a), role) - 1
      const cash = bizOf(g, a).cash
      const queued = g.queue.length
      runScript(g, m.scriptId!, 'vet', m.data, m)
      expect(bizOf(g, a).cash).toBe(cash)
      expect(readKnow(g)).toBeNull()
      expect(g.queue.some((q) => q.kind === 'notice' && /Not Enough Company Cash/.test(q.title))).toBe(true)
      const open = hires(g).at(-1)!
      expect(g.queue.length).toBeGreaterThan(queued)
      expect(candsOf(open)).toEqual(candsOf(m))
      expect(dataOf(open).vet).toBe(0)
    })
  })

  it('is the one way to read a candidate: no Look closer group, no purchase and nothing tracked for the key', () => {
    inFog(() => {
      const { g, a } = life(27)
      const { m } = interview(g, a)
      const key = candKey(idOf(m), 0)
      expect(lookCloser(g, { id: 'cand', keys: [key] })).toBeNull()
      expect(buyIntel(g, 'investigator', [key]).ok).toBe(false)
      runScript(g, m.scriptId!, 'vet', m.data, m)
      expect(Object.keys(readKnow(g)!.k).every((k) => k.startsWith('cand:'))).toBe(true)
      expect(trackedKeys(g)).toEqual([])
    })
  })
})

describe('every industry', () => {
  it('opens a shortlist for each of its roles, checks it and hires from it, with no NaN and no dash', () => {
    inFog(() => {
      let rows = 0
      INDUSTRY_IDS.forEach((industry, n) => {
        const g = adult(60 + n, 2026, 'us')
        g.character.talents = n % 2 === 0 ? ['Business'] : []
        const a = company(g, industry, { cash: 50_000_000 })
        const heads = allNodes(g, businessAssetView(g, a)).filter((x): x is MenuAction => x.type === 'action' && x.id.startsWith(`biz.hire.${a.id}.`))
        for (const row of heads.slice(0, 2)) {
          if (row.disabledReason?.(g)) continue
          g.queue = []
          row.run(g)
          const m = hires(g).at(-1)
          if (!m) continue
          rows++
          expect(m.text, industry).not.toMatch(BAD)
          expect(DASH.test(m.text), industry).toBe(false)
          expect(m.choices.at(-1)!.id).toBe('none')
          runScript(g, m.scriptId!, 'vet', m.data, m)
          const v = hires(g).at(-1)!
          expect(v.text, industry).not.toMatch(BAD)
          expect(v.text, industry).not.toContain('not clear yet')
          runScript(g, v.scriptId!, 'c0', v.data, v)
          expect(readBiz(g, a).staff.length, industry).toBeGreaterThanOrEqual(1)
          expect(readKnow(g), industry).toBeNull()
        }
      })
      expect(rows).toBeGreaterThan(20)
    })
  })
})

describe('the fee', () => {
  it('is 3% of the role pay where the company is, and never moves with the cash on hand or the money in your pocket', () => {
    inFog(() => {
      const fees: number[] = []
      for (const [cash, wallet] of [[2_000_000, 1e7], [200_000_000, 1e9], [2_000_000_000, 1e11]] as const) {
        const { g, a } = life(31, { cash, money: wallet })
        const b = bizOf(g, a)
        const role = roleOfRow(g, a, hireRow(g, a))
        fees.push(vetFee(b, role))
        expect(vetFee(b, role)).toBe(Math.round(localPay(b.countryId, role.pay) * 0.03))
      }
      expect(new Set(fees).size).toBe(1)
      expect(fees[0]).toBeGreaterThan(0)
    })
  })
})

describe('the hiring menu', () => {
  it('ends with a Look closer row in Realistic mode, and has none in Exact', () => {
    const { g, a } = life(41)
    const hireMenu = (): MenuNode => allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'menu' && n.id === `biz.hireMenu.${a.id}`)!
    const kids = (): MenuNode[] => (hireMenu() as Extract<MenuNode, { type: 'menu' }>).children(g)
    const exact = kids()
    expect(exact.some((n) => n.id.startsWith('biz.hire.look.'))).toBe(false)
    inFog(() => {
      const fog = kids()
      expect(fog).toHaveLength(exact.length + 1)
      const row = fog.at(-1) as MenuInfo
      expect(row.type).toBe('info')
      expect(row.id).toBe(`biz.hire.look.${a.id}`)
      const text = infoText(g, row)
      expect(text).toMatch(/^Look closer: /)
      expect(text).toMatch(/background check/i)
      expect(text).toContain('3%')
      expect(text.length).toBeLessThanOrEqual(140)
      expect(DASH.test(text)).toBe(false)
      // the role rows are the ones they were
      expect(fog.slice(0, -1).map((n) => n.id)).toEqual(exact.map((n) => n.id))
    })
  })

  it('is pure: building it, reading a candidate and asking the fee change nothing and draw nothing', () => {
    inFog(() => {
      const { g, a } = life(42)
      const json = JSON.stringify(g)
      const rng = g.rng
      const nodes = allNodes(g, businessAssetView(g, a))
      for (const n of nodes) if (n.type === 'action') void [n.subtitle, n.hint?.(g), n.disabledReason?.(g)]
      const b = bizOf(g, a)
      const role = industryDef(b.industry).roles[0]
      void vetFee(b, role)
      void candidateRead(g, 'abc', 0, { skill: 55, trait: 'steady' }, 0)
      // a deep-frozen game reads fine: nothing here writes
      const frozen = deepFreeze(makeTestGame(7))
      expect(() => candidateRead(frozen, 'abc', 0, { skill: 55, trait: 'steady' }, 0)).not.toThrow()
      void candidateLine({ firstName: 'A', lastName: 'B', age: 30 }, candidateRead(g, 'abc', 0, { skill: 55, trait: 'steady' }, 0), '$50K')
      expect(JSON.stringify(g)).toBe(json)
      expect(g.rng).toBe(rng)
    })
  })
})

describe('Exact mode', () => {
  it('prints the lines, labels, choices and data it printed before', () => {
    for (let s = 1; s <= 5; s++) {
      const { g, a } = life(s * 3, { talent: s % 2 === 0 })
      const { m } = interview(g, a)
      const list = candsOf(m)
      expect(linesOf(m)).toEqual(list.map(exactLine))
      expect(m.text).toBe(`You interviewed ${list.length} candidates in ${bizOf(g, a).city}:\n${list.map(exactLine).join('\n')}`)
      expect(m.choices.filter((c) => c.id !== 'none').map((c) => c.label)).toEqual(list.map(exactLabel))
      expect(m.choices.map((c) => c.id)).toEqual([...list.map((_, i) => `c${i}`), 'none'])
      expect(Object.keys(dataOf(m)).sort()).toEqual(['assetId', 'candidates', 'focus', 'role'])
      list.forEach((c, i) => {
        const r = candidateRead(g, 'zz', i, c, 0)
        expect(r.skill).toEqual({ text: `${c.skill}/100` })
        expect(r.trait).toBe(traitOf(c.trait).label.toLowerCase())
        expect(candidateLine(c, r, formatMoney(c.salary))).toBe(exactLine(c))
        expect(candidateLabel(c, r, money(c.salary))).toBe(exactLabel(c))
      })
      expect(readKnow(g)).toBeNull()
    }
  })

  it('has no check to buy: a forged vet choice does nothing', () => {
    const { g, a } = life(9)
    const { m } = interview(g, a)
    const cash = bizOf(g, a).cash
    const queued = g.queue.length
    runScript(g, m.scriptId!, 'vet', m.data, m)
    expect(bizOf(g, a).cash).toBe(cash)
    expect(g.queue.length).toBe(queued)
    expect(readKnow(g)).toBeNull()
  })
})
