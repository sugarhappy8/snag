// ci: fast
// R4-U7 (People UI and fog track, H.5, second half): the CEO and the manager are read through Knowledge, like the key staff of R4-U6.
// A headhunter's shortlist used to print every candidate's skill as `N/100`, a star for 85 and up, and the true skill again in the hire
// notice, the CEO rows and the yearly letter. Now, in Realistic with the build flag `peopleProfile` on (staffFog):
//
//   shortlist   a range for each candidate (`cand:<list>:<n>:skill`), no star, a background check as a choice before "Never mind"
//               while the company or the owner can pay for it: a share of the pay norm (never the cash), charged once, books `inputs`,
//               reads the first eight candidates much closer, and reopens the same list
//   the hire    the read of the candidate goes with the CEO (`stf:<company>:ceo:skill`), so the notice and the rows open on the range
//               the list showed; a CEO who follows another starts clean (the row of the one before goes)
//   the rows    the CEO rows print the range at the exposure of the years in the chair; a group's CEO reads the same way; the tags that
//               gave the skill away (a star, "plans with the numbers", "works the numbers") are gone
//   the letter  the first line of the yearly letter says competent, elite or world-class from the middle of the read, never from the skill
//
// Exact, and Realistic with the flag off, print today's text (test/people-ui-golden.test.ts holds the rows, and this file compares them).
// The suite runs in Exact (test/setup-exact.ts); a Realistic case goes through `real` (inFog and withFlags), and the flag is always named.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { boardOf } from '../src/game/business/board-state'
import { askingSalary, ceoPayNorm, headhunterFee, installManager, stepDown } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupView } from '../src/game/business/conglomerate-menu'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { CEO_ID, ceoRead, ceoSkillRead, ceoWord, leaderEstimate, leaderRead, mappedText, staffExposure, staffFog, staffKey, startCeoRead } from '../src/game/business/leader-fog'
import { ceoVetFee, infoRows } from '../src/game/business/manage'
import { CAND_MAX, candKey, CEO_VET_MAX, ceoFooter, dropVet, takeVet } from '../src/game/business/staff-fog'
import { bizOf, readBiz } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { withFlags } from '../src/game/flags'
import { flowsOf, ledgerProblems } from '../src/game/kernel/ledger'
import { know, learn, readKnow } from '../src/game/knowledge/contract'
import { kindOf } from '../src/game/knowledge/kinds'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { withInfoMode } from '../src/game/knowledge/mode'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { nodeSubtitle } from '../src/ui/components/menuModel'
import { makeTestGame } from './helpers'
import { deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'
import { allNodes } from './market-kit'
import { FIXTURE_FILE, buildGroup, companyGame, diffRows, groupOf, type Row } from './people-ui-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the new reads exist. */
const real = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
const BAD = /NaN|undefined|\[object|Infinity/
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const STAR = '\u{2B50}'

// ---------------------------------------------------------------------------------------------------------------------------------
// Helpers

interface Cand {
  firstName: string
  lastName: string
  skill: number
  salary: number
}

const isManager = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.manager'
const popups = (g: GameState): ChoiceModal[] => g.queue.filter(isManager)
const dataOf = (m: ChoiceModal): Record<string, unknown> => m.data as unknown as Record<string, unknown>
const candsOf = (m: ChoiceModal): Cand[] => dataOf(m).candidates as Cand[]
const ckOf = (m: ChoiceModal): string => String(dataOf(m).ck)
const linesOf = (m: ChoiceModal): string[] => m.text.split('\n').filter((l) => l.startsWith('• '))
const noticesOf = (g: GameState): string => g.queue.flatMap((m) => (m.kind === 'notice' ? [`${m.title}: ${m.text}`] : [])).join('\n')
const idsOf = (m: ChoiceModal): string[] => m.choices.map((c) => c.id)
const textOf = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')

/** A restaurant the player runs as CEO, with 5 million in the till and in the pocket, with or without the Business talent. */
function ceoGame(opts: { talent?: boolean; industry?: 'restaurant' | 'investmentFirm'; cash?: number; money?: number } = {}): { g: GameState; a: Asset } {
  const { g, a } = companyGame(opts.industry ?? 'restaurant', { talent: opts.talent })
  if (opts.cash !== undefined) bizOf(g, a).cash = opts.cash
  if (opts.money !== undefined) g.character.money = opts.money
  return { g, a }
}

/** Open the shortlist of the Hire a CEO row (or the Replace row once there is one). `rng` picks the candidates. */
function openList(g: GameState, a: Asset, rng = 777, row: 'stepDown' | 'replaceManager' = 'stepDown'): ChoiceModal {
  const node = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.${row}.${a.id}`)
  if (!node) throw new Error(`fog-leader: no ${row} row`)
  g.queue = []
  g.rng = rng
  node.run(g)
  const m = popups(g).at(-1)
  if (!m) throw new Error(`fog-leader: ${row} opened no shortlist`)
  return m
}

/** Answer a manager popup and give back the popup that follows, if any. */
function answer(g: GameState, m: ChoiceModal, choice: string): ChoiceModal | null {
  g.queue = []
  runScript(g, 'business.manager', choice, m.data, m)
  return popups(g).at(-1) ?? null
}

/** Hire candidate `pick` of a fresh shortlist; gives back the popup it answered and the notice it wrote. */
function hire(g: GameState, a: Asset, pick = 0, rng = 777): { m: ChoiceModal; notice: string } {
  const m = openList(g, a, rng)
  answer(g, m, `m${pick}`)
  return { m, notice: noticesOf(g) }
}

/** The skill range a text carries: "about 55 to 75" gives [55, 75], "about 70" gives [70, 70]. */
function rangeIn(text: string): [number, number] | null {
  const m = /about (\d+)(?: to (\d+))?/.exec(text)
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null
}
const widthOf = (text: string): number => {
  const r = rangeIn(text)
  return r ? r[1] - r[0] : Number.NaN
}

const knowKeys = (g: GameState): string[] => Object.keys(readKnow(g)?.k ?? {})
const candKeys = (g: GameState): string[] => knowKeys(g).filter((k) => k.startsWith('cand:'))
const ceoKeyOf = (a: Asset): string => `stf:${a.id}:${CEO_ID}:skill`
const firmInputs = (g: GameState): number => flowsOf(g, g.year).filter((r) => r.reason === 'inputs').reduce((s, r) => s + r.net.firm, 0)

/** The Company Details line about the CEO. */
function ceoLine(g: GameState, a: Asset): MenuNode | undefined {
  return infoRows(g, a).find((n) => /^CEO /.test(textOf(g, n)))
}

/** The Replace the CEO row's subtitle. */
function replaceSubtitle(g: GameState, a: Asset): string {
  const node = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.replaceManager.${a.id}`)
  return node ? (nodeSubtitle(node, g) ?? '') : 'no row'
}

/** A CEO by hand: every field given, so nothing is drawn. */
const manager = (over: Partial<Parameters<typeof installManager>[2] & object> = {}) => ({
  firstName: 'Pat',
  lastName: 'Lee',
  gender: 'female' as const,
  skill: 72,
  salary: 150_000,
  since: 2026,
  style: 'steady' as const,
  integrity: 90,
  ...over,
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Exact is today

describe('Exact, and Realistic with the flag off, print today\'s CEO text', () => {
  const recorded = (): Row[] => (JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as { rows: Row[] }).rows.filter(([k]) => groupOf(k) === 'ceo')
  /** The Business talent's hints are fallible in Realistic (rankNoise), so a Realistic life is compared without them. */
  const unhinted = (rows: readonly Row[]): Row[] => rows.map(([k, t]) => [k, t.replace(/ \| hint: [^\n]*/g, '')] as const)

  for (const flag of [true, false]) {
    it(`Exact with the flag ${flag ? 'on' : 'off'}: the shortlists, the notice, the rows and the letters are the recorded ones`, { timeout: 180_000 }, () => {
      const rows = withFlags({ peopleProfile: flag }, () => buildGroup('ceo'))
      const moved = diffRows(recorded(), rows)
      expect(moved, moved.join('\n')).toEqual([])
    })
  }

  it('Realistic with the flag off: the same rows (a check choice, a range or a lost star would show here)', { timeout: 180_000 }, () => {
    const rows = withFlags(OFF, () => inFog(() => buildGroup('ceo')))
    const moved = diffRows(unhinted(recorded()), unhinted(rows))
    expect(moved, moved.join('\n')).toEqual([])
  })

  it('Realistic with the flag off keeps the star, the exact skill, the data as it was and writes no stf row', () => {
    withFlags(OFF, () =>
      inFog(() => {
        const { g, a } = ceoGame()
        const m = openList(g, a)
        expect(Object.keys(dataOf(m)).sort()).toEqual(['assetId', 'candidates', 'flow'])
        expect(idsOf(m)).not.toContain('vet')
        expect(m.text).not.toContain('Background check')
        for (const c of candsOf(m)) expect(m.text).toContain(`skill ${c.skill}/100`)
        const exec = answer(g, m, 'exec')!
        const hasStar = candsOf(exec).some((c) => c.skill >= 85)
        expect(hasStar).toBe(true)
        expect(exec.choices.some((c) => c.emoji === STAR)).toBe(true)
        answer(g, exec, 'm0')
        expect(noticesOf(g)).toMatch(/skill \d+\/100/)
        expect(knowKeys(g)).toEqual([])
      }),
    )
  })

  it('Exact with the flag on writes no know row and prints no range, whoever is hired', () => {
    withFlags(ON, () => {
      const { g, a } = ceoGame()
      const { notice } = hire(g, a)
      expect(notice).toMatch(/skill \d+\/100/)
      expect(readKnow(g)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The shortlist

describe('the CEO shortlist in Realistic mode', () => {
  it('shows a range for each candidate and never the exact skill, the star, or a digit outside its band', () => {
    real(() => {
      for (let i = 0; i < 6; i++) {
        const { g, a } = ceoGame()
        let m = openList(g, a, 100 + i * 31)
        if (i % 2 === 1) m = answer(g, m, 'exec')!
        const list = candsOf(m)
        const lines = linesOf(m)
        expect(lines).toHaveLength(list.length)
        for (const [n, c] of list.entries()) {
          const label = m.choices.find((x) => x.id === `m${n}`)!.label
          expect(label).toMatch(/ · about \d+(?: to \d+)? · /)
          expect(lines[n]).toMatch(/^• .+: skill about \d+(?: to \d+)?, /)
          expect(label).not.toContain('/100')
          expect(lines[n]).not.toContain('/100')
          // the text prints the very range the leaf reads for that candidate, and nothing else of the skill
          const want = leaderRead(g, candKey(ckOf(m), n), c.skill, 0)
          expect(label).toContain(want.text)
          expect(lines[n]).toContain(`skill ${want.text},`)
          const [lo, hi] = rangeIn(want.text)!
          expect(lo).toBeLessThanOrEqual(hi)
          expect(lo % 5).toBe(0)
          expect(m.choices.find((x) => x.id === `m${n}`)!.emoji).not.toBe(STAR)
        }
        expect(m.text + m.choices.map((x) => x.label).join('|')).not.toMatch(BAD)
        expect(LONG_DASH.test(m.text)).toBe(false)
        expect(m.choices.some((x) => x.emoji === STAR)).toBe(false)
      }
    })
  })

  it('an executive search has a star in it, and the popup still shows none', () => {
    real(() => {
      const { g, a } = ceoGame()
      const exec = answer(g, openList(g, a), 'exec')!
      expect(candsOf(exec).some((c) => c.skill >= 85)).toBe(true)
      expect(exec.choices.map((c) => c.emoji)).not.toContain(STAR)
    })
  })

  it('names the list and records the check state in the data; the candidates in it are the true ones', () => {
    real(() => {
      const { g, a } = ceoGame()
      const m = openList(g, a)
      const d = dataOf(m)
      expect(ckOf(m)).toMatch(/^[0-9a-z]{1,10}$/)
      expect(d.vet).toBe(0)
      expect(d.flow).toBe('stepDown')
      expect(d.assetId).toBe(a.id)
      for (const c of candsOf(m)) {
        expect(Number.isInteger(c.skill)).toBe(true)
        expect(c.skill).toBeGreaterThanOrEqual(1)
      }
      // two searches the same year are two lists
      const again = answer(g, m, 'again')!
      expect(ckOf(again)).not.toBe(ckOf(m))
    })
  })

  it('offers the check after the other searches and before "Never mind", which stays last', () => {
    real(() => {
      const { g, a } = ceoGame()
      const m = openList(g, a)
      const n = candsOf(m).length
      expect(idsOf(m)).toEqual([...Array.from({ length: n }, (_, i) => `m${i}`), 'again', 'exec', 'vet', 'cancel'])
      expect(m.choices.find((c) => c.id === 'vet')!.label).toBe(`Check backgrounds \u00B7 ${money(ceoVetFee(bizOf(g, a)))}`)
      expect(m.choices.find((c) => c.id === 'vet')!.label.split(/\s+/).length).toBeLessThanOrEqual(5)
      expect(m.text).toMatch(/Skill reads are (a rough guess|a fair estimate|a good estimate|close to exact)\. A background check \(\$[\d,.]+[KMB]?\) sharpens them\./)
      expect(m.text).toContain('The search cost')
    })
  })

  it('says the rule about 75 and not the count, so the sentence gives nothing away', () => {
    real(() => {
      for (let i = 0; i < 5; i++) {
        const { g, a } = ceoGame()
        const m = openList(g, a, 40 + i)
        expect(m.text).toContain('Anyone above 75 runs the company with the numbers, like a real executive.')
      }
    })
  })

  it('a finance firm keeps its profile summary, prints the finance skill as a range, and never as N/100', () => {
    real(() => {
      const { g, a } = ceoGame({ industry: 'investmentFirm' })
      const m = openList(g, a)
      const lines = linesOf(m)
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        expect(line).toMatch(/: skill about \d+(?: to \d+)?, .*career record \d+\/100/)
        expect(line).toMatch(/; finance skill about \d+(?: to \d+)?(?:;|\.)/)
        expect(line).not.toMatch(/skill \d+\/100/)
        expect(line).not.toMatch(/finance skill \d+\/100/)
      }
      expect(m.text).toContain('Finance experience changes finance skill.')
    })
  })

  it('the Business talent keeps its fallible hint, and the hint prints no skill figure', () => {
    real(() => {
      const { g, a } = ceoGame({ talent: true })
      const m = openList(g, a)
      const hints = m.choices.flatMap((c) => (c.hint ? [c.hint] : []))
      expect(hints.length).toBe(1)
      for (const h of hints) expect(h).not.toContain('/100')
      expect(idsOf(m)).toContain('vet')
    })
  })

  it('the same life opens the same list twice', () => {
    real(() => {
      const first = ceoGame()
      const second = ceoGame()
      expect(popupOf(first)).toBe(popupOf(second))
    })
    function popupOf(x: { g: GameState; a: Asset }): string {
      const m = openList(x.g, x.a)
      return `${m.text}\n${m.choices.map((c) => `${c.id}:${c.label}`).join('\n')}\n${JSON.stringify(m.data)}`
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The check

describe('the background check on a CEO shortlist', () => {
  it('costs a share of the pay norm, never the cash: equal for cash and money x100', () => {
    real(() => {
      const small = ceoGame({ cash: 2_000_000, money: 2_000_000 })
      const huge = ceoGame({ cash: 200_000_000, money: 200_000_000 })
      const fee = ceoVetFee(bizOf(small.g, small.a))
      expect(fee).toBe(Math.max(1, Math.round(ceoPayNorm(bizOf(small.g, small.a)) * 0.03)))
      expect(ceoVetFee(bizOf(huge.g, huge.a))).toBe(fee)
      const label = (x: { g: GameState; a: Asset }): string => openList(x.g, x.a).choices.find((c) => c.id === 'vet')!.label
      expect(label(huge)).toBe(label(small))
    })
  })

  it('charges once, from company cash first, books inputs only, and the books stay whole', () => {
    real(() => {
      const { g, a } = ceoGame()
      const b = bizOf(g, a)
      const m = openList(g, a)
      const fee = ceoVetFee(b)
      const cash0 = b.cash
      const money0 = g.character.money
      const costs0 = b.yearCosts
      const inputs0 = firmInputs(g)
      const reasons0 = new Set(flowsOf(g, g.year).map((r) => r.reason))
      const rng0 = g.rng
      const next = answer(g, m, 'vet')!
      expect(b.cash).toBe(cash0 - fee)
      expect(g.character.money).toBe(money0)
      expect(b.yearCosts).toBe(costs0 + fee)
      expect(firmInputs(g)).toBe(inputs0 - fee)
      expect(new Set(flowsOf(g, g.year).map((r) => r.reason))).toEqual(reasons0)
      expect(g.rng).toBe(rng0)
      expect(ledgerProblems(g)).toEqual([])
      expect(dataOf(next).vet).toBe(1)
      // the same choice again, from the first popup's data, reads and costs nothing
      const cash1 = b.cash
      const again = answer(g, { ...m, id: 'dup1' }, 'vet')!
      expect(b.cash).toBe(cash1)
      expect(g.character.money).toBe(money0)
      expect(firmInputs(g)).toBe(inputs0 - fee)
      expect(again.text).toBe(next.text)
      expect(candKeys(g)).toHaveLength(Math.min(CEO_VET_MAX, candsOf(m).length))
    })
  })

  it('reopens the same people with tighter reads, no check choice, and the words that say so', () => {
    real(() => {
      const { g, a } = ceoGame()
      const m = openList(g, a)
      const after = answer(g, m, 'vet')!
      expect(JSON.stringify(dataOf(after).candidates)).toBe(JSON.stringify(dataOf(m).candidates))
      expect(ckOf(after)).toBe(ckOf(m))
      expect(dataOf(after).assetId).toBe(a.id)
      expect(idsOf(after)).not.toContain('vet')
      expect(idsOf(after).slice(-3)).toEqual(['again', 'exec', 'cancel'])
      expect(after.text).toContain('Background checks are in. The skill reads are tighter.')
      expect(after.text).not.toContain('The search cost')
      let tighter = 0
      for (const [n, c] of candsOf(m).entries()) {
        const before = linesOf(m)[n]
        const now = linesOf(after)[n]
        expect(widthOf(now)).toBeLessThanOrEqual(widthOf(before))
        if (widthOf(now) < widthOf(before)) tighter++
        expect(now).not.toContain('/100')
        const e = know(g, candKey(ckOf(m), n), c.skill)
        expect(e.src).toContain('diligence')
        expect(e.sd).toBeLessThan(0.2)
      }
      expect(tighter).toBeGreaterThan(0)
      expect(after.text + after.choices.map((c) => c.label).join('|')).not.toMatch(BAD)
    })
  })

  it('is offered only while the company or the owner can pay for it', () => {
    real(() => {
      const probe = ceoGame()
      const b0 = bizOf(probe.g, probe.a)
      const search = headhunterFee(b0, 'standard', 0)
      const fee = ceoVetFee(b0)
      const offered = (cash: number, pocket: number): boolean => {
        const { g, a } = ceoGame({ cash, money: pocket })
        return idsOf(openList(g, a)).includes('vet')
      }
      // the search takes company cash first; what is left, with the owner's pocket, has to cover the check
      expect(offered(search, 0)).toBe(false)
      expect(offered(search + fee - 1, 0)).toBe(false)
      expect(offered(search + fee, 0)).toBe(true)
      expect(offered(search, fee - 1)).toBe(false)
      expect(offered(search, fee)).toBe(true)
      expect(offered(5_000_000, 0)).toBe(true)
    })
  })

  it('takes the check from the owner when the company is dry, and says it cannot when nobody can pay at the time', () => {
    real(() => {
      const probe = ceoGame()
      const search = headhunterFee(bizOf(probe.g, probe.a), 'standard', 0)
      const { g, a } = ceoGame({ cash: search, money: 1_000_000 })
      const b = bizOf(g, a)
      const m = openList(g, a)
      expect(b.cash).toBe(0)
      const fee = ceoVetFee(b)
      const money0 = g.character.money
      const next = answer(g, m, 'vet')!
      expect(g.character.money).toBe(money0 - fee)
      expect(b.cash).toBe(0)
      expect(dataOf(next).vet).toBe(1)
      expect(ledgerProblems(g)).toEqual([])
      // the pocket empties before the choice is made: a notice, no charge, the same list without a check
      const { g: h, a: ah } = ceoGame({ cash: search, money: fee })
      const n = openList(h, ah)
      h.character.money = 0
      const back = answer(h, n, 'vet')!
      expect(noticesOf(h)).toMatch(/Not Enough Cash: A background check costs/)
      expect(h.character.money).toBe(0)
      expect(candKeys(h)).toEqual([])
      expect(dataOf(back).vet).toBe(0)
    })
  })

  it('covers the first eight candidates; the others read as before, and a pick beyond them still carries its read', () => {
    real(() => {
      const { g, a } = ceoGame()
      const base = openList(g, a)
      const seed = candsOf(base)[0]
      const many = Array.from({ length: 12 }, (_, i) => ({ ...seed, firstName: `Cand${i}`, skill: 30 + i * 5, salary: 100_000 + i }))
      const data = { ...dataOf(base), candidates: many, ck: 'zz1', vet: 0 }
      g.queue = []
      runScript(g, 'business.manager', 'vet', data as never, base)
      expect(candKeys(g).sort()).toEqual(Array.from({ length: 8 }, (_, i) => candKey('zz1', i)).sort())
      const after = popups(g).at(-1)!
      expect(candsOf(after)).toHaveLength(12)
      expect(after.text).toContain(`It covers the first ${CEO_VET_MAX}.`)
      // a pick from the unchecked tail keeps the passive read it was shown
      const shown = know(g, candKey('zz1', 10), many[10].skill)
      g.queue = []
      runScript(g, 'business.manager', 'm10', after.data, after)
      expect(candKeys(g)).toEqual([])
      const row = readKnow(g)!.k[ceoKeyOf(a)]
      expect(row.src).toBe('interview')
      expect(row.mid).toBeCloseTo(shown.mid, 3)
    })
  })

  it('takeVet and dropVet cover four candidates unless told more, so the hire shortlist is as it was', () => {
    real(() => {
      const g = fogGame(7)
      const rich = { ...g, flags: {}, yearActions: {} } as GameState
      const six = Array.from({ length: 6 }, (_, i) => ({ skill: 40 + i }))
      expect(takeVet(rich, 'q1', six)).toBe(true)
      expect(Object.keys(readKnow(rich)!.k)).toHaveLength(CAND_MAX)
      dropVet(rich, 'q1', 6)
      expect(readKnow(rich)).toBeNull()
      expect(takeVet(rich, 'q2', six, 6)).toBe(true)
      expect(Object.keys(readKnow(rich)!.k)).toHaveLength(6)
      dropVet(rich, 'q2', 6, 2)
      expect(Object.keys(readKnow(rich)!.k)).toHaveLength(4)
      dropVet(rich, 'q2', 6, 6)
      expect(readKnow(rich)).toBeNull()
    })
  })

  it('a settled shortlist forgets its checks: hiring, another search and "Never mind" all leave no cand rows', () => {
    real(() => {
      for (const choice of ['m0', 'again', 'exec', 'cancel']) {
        const { g, a } = ceoGame()
        const m = openList(g, a)
        const after = answer(g, m, 'vet')!
        expect(candKeys(g).length).toBeGreaterThan(0)
        answer(g, after, choice)
        expect(candKeys(g), choice).toEqual([])
      }
    })
  })

  it('refuses a check on data it cannot trust: no list, a bad name, a candidate that is not a record', () => {
    real(() => {
      const { g, a } = ceoGame()
      const b = bizOf(g, a)
      const m = openList(g, a)
      const cash0 = b.cash
      const bad: Record<string, unknown>[] = [
        { ...dataOf(m), candidates: [] },
        { ...dataOf(m), ck: 'A B' },
        { ...dataOf(m), ck: undefined },
        { ...dataOf(m), candidates: [...candsOf(m), 7] },
        { ...dataOf(m), candidates: 'many' },
      ]
      for (const [i, data] of bad.entries()) {
        g.queue = []
        runScript(g, 'business.manager', 'vet', data as never, { ...m, id: `bad${i}` })
        expect(g.queue, `case ${i}`).toHaveLength(0)
        expect(b.cash, `case ${i}`).toBe(cash0)
      }
      expect(knowKeys(g)).toEqual([])
    })
  })

  it('with the flag off, or in Exact, the check choice does nothing (a copy of the popup, so the replay guard is not what stops it)', () => {
    const { g, a } = ceoGame()
    const m = real(() => openList(g, a))
    const cash0 = bizOf(g, a).cash
    const attempt = (id: string): void => {
      g.queue = []
      runScript(g, 'business.manager', 'vet', m.data, { ...m, id })
      expect(g.queue).toHaveLength(0)
    }
    attempt('exact1')
    withFlags(OFF, () => inFog(() => attempt('off1')))
    withFlags(ON, () => attempt('exact-on1'))
    expect(bizOf(g, a).cash).toBe(cash0)
    expect(readKnow(g)).toBeNull()
  })

  it('the footer is plain: four chips in four words, and it is empty without reads', () => {
    expect(ceoFooter([], 0, 100, 8)).toBe('')
    expect(ceoFooter([0, 1], 0, null, 8)).toBe('Skill reads are a rough guess.')
    expect(ceoFooter([3, 3], 0, 50, 8)).toBe('Skill reads are close to exact. A background check ($50) sharpens them.')
    expect(ceoFooter([2, 1], 1, 50, 8)).toBe('Background checks are in. The skill reads are tighter.')
    expect(ceoFooter(new Array<0 | 1 | 2 | 3>(9).fill(1), 1, 50, 8)).toContain('It covers the first 8.')
    for (const text of [ceoFooter([1], 0, 5000, 8), ceoFooter([1], 1, null, 8)]) expect(LONG_DASH.test(text)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The hire, the notice and the rows

describe('the hire carries the read', () => {
  it('prints in the notice the range the list showed, and nothing of the exact skill', () => {
    real(() => {
      for (let i = 0; i < 5; i++) {
        const { g, a } = ceoGame()
        const { m, notice } = hire(g, a, i % 3, 300 + i)
        const c = candsOf(m)[i % 3]
        const shown = rangeIn(m.choices.find((x) => x.id === `m${i % 3}`)!.label)!
        expect(rangeIn(notice)).toEqual(shown)
        expect(notice).not.toContain(`${c.skill}/100`)
        expect(notice).not.toContain('/100')
        expect(notice).not.toContain('Expect a yearly letter')
        expect(notice).not.toMatch(BAD)
        expect(bizOf(g, a).manager!.skill).toBe(c.skill)
      }
    })
  })

  it('the rows agree with the notice in the year of the hire, and the details row has a chip', () => {
    real(() => {
      const { g, a } = ceoGame()
      const { notice } = hire(g, a, 1)
      const range = rangeIn(notice)!
      const line = ceoLine(g, a)!
      expect(rangeIn(textOf(g, line))).toEqual(range)
      expect(rangeIn(replaceSubtitle(g, a))).toEqual(range)
      expect(textOf(g, line)).not.toContain('/100')
      expect(line.type === 'info' && line.conf !== undefined).toBe(true)
      expect(replaceSubtitle(g, a)).not.toContain('/100')
    })
  })

  it('writes one stf row for the CEO, from the interview, or from the check when one was made', () => {
    real(() => {
      const plain = ceoGame()
      hire(plain.g, plain.a)
      expect(Object.keys(readKnow(plain.g)!.k)).toEqual([ceoKeyOf(plain.a)])
      expect(readKnow(plain.g)!.k[ceoKeyOf(plain.a)].src).toBe('interview')
      const checked = ceoGame()
      const m = openList(checked.g, checked.a)
      answer(checked.g, answer(checked.g, m, 'vet')!, 'm0')
      expect(Object.keys(readKnow(checked.g)!.k)).toEqual([ceoKeyOf(checked.a)])
      expect(readKnow(checked.g)!.k[ceoKeyOf(checked.a)].src).toBe('diligence')
    })
  })

  it('a checked hire reads tighter than an unchecked one: the notice range is no wider', () => {
    real(() => {
      const a1 = ceoGame()
      const m1 = openList(a1.g, a1.a)
      const unchecked = widthOf(linesOf(m1)[0])
      const a2 = ceoGame()
      const m2 = openList(a2.g, a2.a)
      answer(a2.g, answer(a2.g, m2, 'vet')!, 'm0')
      expect(widthOf(noticesOf(a2.g))).toBeLessThanOrEqual(unchecked)
    })
  })

  it('a CEO who follows another starts clean: the row of the one before goes, and is not blended with the new read', () => {
    real(() => {
      const { g, a } = ceoGame()
      hire(g, a, 0, 500)
      const first = readKnow(g)!.k[ceoKeyOf(a)]
      g.queue = []
      const m = openList(g, a, 900, 'replaceManager')
      const n = candsOf(m).length - 1
      const c = candsOf(m)[n]
      const shown = know(g, candKey(ckOf(m), n), c.skill)
      answer(g, m, `m${n}`)
      expect(Object.keys(readKnow(g)!.k)).toEqual([ceoKeyOf(a)])
      const row = readKnow(g)!.k[ceoKeyOf(a)]
      expect(row.mid).toBeCloseTo(shown.mid, 3)
      expect(row.sd).toBeCloseTo(shown.sd, 2)
      expect(row.src).toBe('interview')
      expect(first.mid === row.mid && first.sd === row.sd).toBe(false)
    })
  })

  it('a cancelled hire leaves no stf row, and a hire the company cannot afford leaves the old CEO\'s row alone', () => {
    real(() => {
      const { g, a } = ceoGame()
      answer(g, openList(g, a), 'cancel')
      expect(readKnow(g)).toBeNull()
      hire(g, a, 0, 500)
      const row0 = JSON.stringify(readKnow(g))
      const next = openList(g, a, 41, 'replaceManager')
      // the new list is open; the company has no cash for the severance of the CEO it just hired
      bizOf(g, a).cash = 0
      g.queue = []
      runScript(g, 'business.manager', 'm0', next.data, next)
      expect(noticesOf(g)).toContain('Not Enough Company Cash')
      expect(JSON.stringify(readKnow(g))).toBe(row0)
    })
  })

  it('the read follows the years in the chair: tighter at 1 and 3 years, the same at a hundred times the years', () => {
    real(() => {
      const g = fogGame(11)
      const m = { skill: 66, since: g.year }
      const at = (years: number) => ceoSkillRead(g, 'a1', { skill: 66, since: g.year - years })!
      expect(at(0).sd).toBeGreaterThan(at(1).sd)
      expect(at(1).sd).toBeGreaterThan(at(3).sd)
      expect(at(3).sd).toBeCloseTo(Math.max(0.03, 0.2 * 0.6), 9)
      expect(at(300)).toEqual(at(3))
      expect(at(1e9)).toEqual(at(3))
      expect(ceoRead(g, 'a1', m).text).toMatch(/^about /)
    })
  })

  it('the exposure of a CEO is the one of a hired person: min(1, years / 3)', () => {
    expect([0, 1, 3, 30].map(staffExposure)).toEqual([0, 1 / 3, 1, 1])
    expect(staffKey('a12', CEO_ID)).toBe('stf:a12:ceo:skill')
  })

  it('a row learned before the CEO began is about the one before: it is ignored, and the next yearly step forgets it', () => {
    real(() => {
      const { g, a } = ceoGame()
      const b = bizOf(g, a)
      installManager(g, b, manager({ skill: 40 }))
      // a sharp read of someone else, from last year
      g.year -= 1
      learn(g, ceoKeyOf(a), { mid: 40, sd: 0.05, src: 'diligence' })
      g.year += 1
      installManager(g, b, manager({ firstName: 'Ann', skill: 90, since: g.year }))
      const e = ceoSkillRead(g, a.id, b.manager!)!
      expect(e.src).toBe('passive')
      expect(Math.abs(e.mid - 40)).toBeGreaterThan(0.001)
      const def = kindOf('stf')!
      expect(def.gone!(g, ceoKeyOf(a))).toBe(true)
      yearlyKnowledge(g)
      expect(readKnow(g)).toBeNull()
    })
  })

  it('an owner who takes the chair back, or a company that is gone, has the row forgotten next year', () => {
    real(() => {
      const { g, a } = ceoGame()
      hire(g, a)
      expect(knowKeys(g)).toEqual([ceoKeyOf(a)])
      const b = bizOf(g, a)
      b.ceo = 'owner'
      b.manager = null
      g.year += 1
      yearlyKnowledge(g)
      expect(readKnow(g)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The rows and the group

describe('the CEO rows', () => {
  it('print the range with a chip, drop the tag that said the skill was above 75, and never the exact skill', () => {
    real(() => {
      const { g, a } = ceoGame()
      installManager(g, bizOf(g, a), manager({ skill: 88, since: g.year - 2 }))
      const line = textOf(g, ceoLine(g, a)!)
      expect(line).toMatch(/^CEO Pat Lee · skill about \d+(?: to \d+)? · steady hand · \$/)
      expect(line).not.toContain('plans with the numbers')
      expect(line).not.toContain('/100')
      expect(replaceSubtitle(g, a)).toMatch(/^Pat Lee · skill about \d+(?: to \d+)? · /)
    })
  })

  it('Exact and the flag off keep the tag and the exact skill', () => {
    for (const run of [<T,>(f: () => T) => f(), <T,>(f: () => T) => withFlags(OFF, () => inFog(f)), <T,>(f: () => T) => withFlags(ON, f)]) {
      run(() => {
        const { g, a } = ceoGame()
        installManager(g, bizOf(g, a), manager({ skill: 88 }))
        expect(textOf(g, ceoLine(g, a)!)).toContain('skill 88/100 · steady hand')
        expect(textOf(g, ceoLine(g, a)!)).toContain('plans with the numbers')
        expect(replaceSubtitle(g, a)).toContain('skill 88/100')
        expect((ceoLine(g, a) as { conf?: unknown }).conf).toBeUndefined()
      })
    }
  })

  it('a finance CEO: the profile stays, the finance skill is a range, and a hire notice prints both', () => {
    real(() => {
      const { g, a } = ceoGame({ industry: 'investmentFirm' })
      const m = openList(g, a)
      answer(g, m, 'm0')
      const notice = noticesOf(g)
      expect(notice).toMatch(/Leadership skill about \d+(?: to \d+)?; finance skill about \d+(?: to \d+)?\./)
      expect(notice).toContain('career record')
      expect(notice).not.toMatch(/skill \d+\/100/)
      const line = textOf(g, ceoLine(g, a)!)
      expect(line).toMatch(/skill about \d+(?: to \d+)? · .* · finance skill about \d+(?: to \d+)?/)
      expect(line).not.toMatch(/finance skill \d+\/100/)
    })
  })

  it('a hostile CEO record prints no NaN: a 500 character name, and the leaf refuses a skill or a key it cannot read', () => {
    real(() => {
      const { g, a } = ceoGame()
      const b = bizOf(g, a)
      installManager(g, b, manager())
      b.manager = { ...b.manager!, lastName: 'L'.repeat(500) }
      const line = textOf(g, ceoLine(g, a)!)
      expect(line).toMatch(/skill about \d+/)
      expect(line).not.toMatch(/NaN|undefined|Infinity/)
      expect(replaceSubtitle(g, a)).not.toMatch(/NaN|undefined|Infinity/)
      expect(ceoRead(g, a.id, { skill: Number.NaN, since: 0 })).toEqual({ text: 'not clear yet', conf: 0 })
      expect(ceoRead(g, a.id, { skill: 70, since: Number.NaN }).text).toMatch(/^about /)
      expect(ceoRead(g, a.id, { skill: 70, since: undefined as unknown as number }).text).toMatch(/^about /)
      expect(ceoRead(g, 'bad id', { skill: 70, since: 0 })).toEqual({ text: 'not clear yet', conf: 0 })
      expect(ceoRead(g, a.id, null as never)).toEqual({ text: 'not clear yet', conf: 0 })
      expect(ceoWord(g, a.id, { skill: Number.NaN, since: 0 })).toBe('competent')
    })
  })

  it('building the rows writes nothing and draws nothing: a frozen copy, twice, the same text', () => {
    real(() => {
      const { g, a } = ceoGame()
      hire(g, a)
      const frozen = deepFreeze(structuredClone(g))
      const once = (): string => `${textOf(frozen, ceoLine(frozen, a)!)}\n${replaceSubtitle(frozen, a)}`
      expect(once()).toBe(once())
      expect(frozen.rng).toBe(g.rng)
    })
  })
})

describe('the group CEO', () => {
  /** A group of two divisions with a hired group CEO of the given skill (the shape of the oracle's `ceo/group` row). */
  function grouped(skill: number): { g: GameState; id: string } {
    const g = makeTestGame(123, { age: 45, money: 1e9 })
    g.character.talents = []
    for (const [i, industry] of (['solar', 'logistics'] as const).entries()) {
      const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
      installManager(g, b, { firstName: 'Ana', lastName: 'Div', gender: 'female', skill: 70 + i, salary: 200_000, since: g.year - 5, style: 'steady', integrity: 90 })
      g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
    }
    if (!formGroup(g, g.assets.map((x) => x.id), 'Atlas')) throw new Error('fog-leader: the group did not form')
    const id = groupsOf(g)[0].core.id
    const grp = liveGroup(g, id)!
    grp.core.ceo = 'manager'
    grp.core.manager = { firstName: 'Dana', lastName: 'Okoye', gender: 'female', skill, salary: 250_000, since: g.year - 2, style: 'visionary', integrity: 90 }
    saveGroup(g, grp)
    g.queue = []
    return { g, id }
  }
  const rowsOf = (g: GameState, id: string): string[] =>
    allNodes(g, groupView(g, id)).flatMap((n) =>
      n.id === `biz.group.i.${id}.5` ? [textOf(g, n)] : n.id === `biz.group.ceo.${id}` && (n.type === 'menu' || n.type === 'action') ? [`${n.label} | ${nodeSubtitle(n, g) ?? ''}`] : [],
    )

  it('prints a range in the info row and the menu, and drops "works the numbers"', () => {
    real(() => {
      const { g, id } = grouped(82)
      const rows = rowsOf(g, id)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatch(/^Group CEO: Dana Okoye \(skill about \d+(?: to \d+)?, visionary, \$/)
      expect(rows[1]).toMatch(/^Group CEO \| Dana Okoye · skill about \d+(?: to \d+)? · \$/)
      for (const r of rows) {
        expect(r).not.toContain('/100')
        expect(r).not.toContain('works the numbers')
      }
    })
  })

  it('Exact and the flag off print today\'s rows', () => {
    for (const run of [<T,>(f: () => T) => f(), <T,>(f: () => T) => withFlags(OFF, () => inFog(f)), <T,>(f: () => T) => withFlags(ON, f)]) {
      run(() => {
        const { g, id } = grouped(82)
        const rows = rowsOf(g, id)
        expect(rows[0]).toContain('(skill 82/100, visionary,')
        expect(rows[0]).toContain('works the numbers')
        expect(rows[1]).toContain('skill 82/100')
      })
    }
  })

  it('reads the same twice, on a frozen copy, and a group id the contract refuses reads as not clear yet', () => {
    real(() => {
      const { g, id } = grouped(82)
      const frozen = deepFreeze(structuredClone(g))
      expect(rowsOf(frozen, id)).toEqual(rowsOf(frozen, id))
      expect(ceoRead(g, 'grp 1', { skill: 82, since: g.year - 2 }).text).toBe('not clear yet')
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The letter

describe('the yearly letter', () => {
  /** The first line of the letter a hired CEO of `skill` writes (the shape of the oracle's `ceo/letter` rows). */
  function letter(skill: number, opts: { read?: { mid: number; sd: number } } = {}): string {
    const { g, a } = companyGame('restaurant')
    const b = bizOf(g, a)
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: g.year, style: 'steady', integrity: 100 })
    if (opts.read) learn(g, ceoKeyOf(a), { ...opts.read, src: 'diligence' })
    g.queue = []
    g.rng = 31_337
    smartManagerTurn(g, a, bizOf(g, a))
    return boardOf(bizOf(g, a)).memo[0] ?? 'no letter'
  }

  it('Exact and the flag off print today\'s line', () => {
    expect(letter(92)).toBe('Skill 92/100, elite.')
    expect(letter(100)).toBe('Skill 100/100. Forecasts can still miss.')
    withFlags(OFF, () => inFog(() => expect(letter(96)).toBe('Skill 96/100, world-class.')))
    withFlags(ON, () => expect(letter(80)).toBe('Skill 80/100, competent.'))
  })

  it('in Realistic with the flag on it names the word of the read and no skill figure', () => {
    real(() => {
      for (const skill of [80, 88, 92, 96, 100]) {
        const line = letter(skill)
        expect(line).toMatch(/^By your read, skill is (competent|elite|world-class)\.$/)
        expect(line).not.toMatch(/\d/)
      }
    })
  })

  it('the word comes from round(read.mid) against 90 and 95, and never from the true skill', () => {
    real(() => {
      // a sharp stored read wins over the passive one, and says what it says whatever the true skill is
      expect(letter(80, { read: { mid: 97, sd: 0.03 } })).toBe('By your read, skill is world-class.')
      expect(letter(99, { read: { mid: 91, sd: 0.03 } })).toBe('By your read, skill is elite.')
      expect(letter(99, { read: { mid: 70, sd: 0.03 } })).toBe('By your read, skill is competent.')
      const g = fogGame(5)
      const learned = (mid: number): string => {
        const h = { ...g, lifeId: `word-${mid}`, flags: {}, yearActions: {} } as GameState
        learn(h, 'stf:a1:ceo:skill', { mid, sd: 0.03, src: 'diligence' })
        return ceoWord(h, 'a1', { skill: 50, since: h.year })
      }
      expect([89.4, 89.5, 90, 94.4, 94.5, 95, 100].map(learned)).toEqual(['competent', 'elite', 'elite', 'elite', 'world-class', 'world-class', 'world-class'])
    })
  })

  it('the word is a read: the same twice on a frozen copy', () => {
    real(() => {
      const g = fogGame(8)
      const m = { skill: 93, since: g.year - 1 }
      const frozen = deepFreeze({ ...g, assets: [], flags: {} } as GameState)
      expect(ceoWord(frozen, 'a1', m)).toBe(ceoWord(frozen, 'a1', m))
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Honesty, ceilings, the leaf

describe('the reads are honest and bounded', () => {
  it('coverage: the CEO range holds the true skill 77% to 83% of 10,000 draws, at 0 and at 3 years in the chair (RF7)', () => {
    real(() => {
      const N = 10_000
      for (const years of [0, 3]) {
        let hit = 0
        for (let i = 0; i < N; i++) {
          const g = fogGame(i)
          const skill = 42 + 40 * unitAt(`ceo-cover-${years}`, i)
          const e = ceoSkillRead(g, 'a1', { skill, since: g.year - years })!
          if (e.lo <= skill && skill <= e.hi) hit++
        }
        expect(hit / N, `years ${years}`).toBeGreaterThan(0.77)
        expect(hit / N, `years ${years}`).toBeLessThan(0.83)
      }
    })
  })

  it('coverage: a candidate on the list holds the true skill 77% to 83% of 10,000 draws', () => {
    real(() => {
      const N = 10_000
      let hit = 0
      for (let i = 0; i < N; i++) {
        const skill = 38 + 47 * unitAt('ceo-cand', i)
        const e = leaderEstimate(fogGame(i), candKey('abc', 3), skill, 0)!
        if (e.lo <= skill && skill <= e.hi) hit++
      }
      expect(hit / N).toBeGreaterThan(0.77)
      expect(hit / N).toBeLessThan(0.83)
    })
  })

  it('the same read twice in a year is equal; another year reads another number', () => {
    real(() => {
      const g = fogGame(3)
      const m = { skill: 71, since: g.year }
      expect(ceoSkillRead(g, 'a1', m)).toEqual(ceoSkillRead(g, 'a1', m))
      const reads = new Set<number>()
      for (let y = 0; y < 8; y++) reads.add(ceoSkillRead({ ...g, year: g.year + y }, 'a1', m)!.mid)
      expect(reads.size).toBeGreaterThan(1)
    })
  })

  it('draws nothing: g.rng and g.nextId do not move, and no row is written, by any read', () => {
    real(() => {
      const { g, a } = ceoGame()
      hire(g, a)
      const before = { rng: g.rng, nextId: g.nextId, flags: JSON.stringify(g.flags) }
      for (let i = 0; i < 5; i++) {
        textOf(g, ceoLine(g, a)!)
        replaceSubtitle(g, a)
        ceoRead(g, a.id, bizOf(g, a).manager!)
        ceoWord(g, a.id, bizOf(g, a).manager!)
      }
      expect({ rng: g.rng, nextId: g.nextId, flags: JSON.stringify(g.flags) }).toEqual(before)
    })
  })

  it('mappedText works a range through a function of the skill, and says not clear yet when it cannot', () => {
    real(() => {
      const g = fogGame(2)
      const e = ceoSkillRead(g, 'a1', { skill: 60, since: g.year })!
      expect(mappedText(e, (s) => s)).toBe(ceoRead(g, 'a1', { skill: 60, since: g.year }).text)
      const shifted = rangeIn(mappedText(e, (s) => Math.min(100, s + 5)))!
      const plain = rangeIn(mappedText(e, (s) => s))!
      expect(shifted[0]).toBeGreaterThanOrEqual(plain[0])
      expect(shifted[1]).toBeGreaterThanOrEqual(plain[1])
      expect(mappedText(null, (s) => s)).toBe('not clear yet')
      expect(mappedText(e, () => Number.NaN)).toBe('not clear yet')
    })
  })

  it('startCeoRead does nothing without staffFog(), and forgets then carries with it', () => {
    const h = { ...fogGame(4), flags: {}, yearActions: {} } as GameState
    startCeoRead(h, 'a1', { mid: 60, sd: 0.18, checked: false })
    expect(readKnow(h)).toBeNull()
    real(() => {
      expect(staffFog()).toBe(true)
      learn(h, 'stf:a1:ceo:skill', { mid: 20, sd: 0.1, src: 'press' })
      startCeoRead(h, 'a1', null)
      expect(readKnow(h)).toBeNull()
      startCeoRead(h, 'a1', { mid: 60, sd: 0.18, checked: true })
      expect(readKnow(h)!.k['stf:a1:ceo:skill'].src).toBe('diligence')
      startCeoRead(h, 'bad id', { mid: 60, sd: 0.18, checked: false })
      expect(Object.keys(readKnow(h)!.k)).toEqual(['stf:a1:ceo:skill'])
    })
  })

  it('a hundred times the cash, the money or the years changes no fee and no exposure', () => {
    real(() => {
      const a1 = ceoGame({ cash: 1_000_000, money: 1_000_000 })
      const a2 = ceoGame({ cash: 100_000_000, money: 100_000_000 })
      expect(ceoVetFee(bizOf(a1.g, a1.a))).toBe(ceoVetFee(bizOf(a2.g, a2.a)))
      expect(staffExposure(3)).toBe(staffExposure(300))
    })
  })

  it('play: hire, check, wait three years, and every screen still reads', { timeout: 120_000 }, () => {
    real(() => {
      const { g, a } = ceoGame({ talent: true })
      answer(g, answer(g, openList(g, a), 'vet')!, 'm0')
      for (let y = 0; y < 3; y++) {
        g.year += 1
        g.yearActions = {}
        yearlyKnowledge(g)
        const line = textOf(g, ceoLine(g, a)!)
        expect(line).toMatch(/skill about \d+/)
        expect(line).not.toMatch(BAD)
        expect(replaceSubtitle(g, a)).not.toMatch(BAD)
      }
      const last = ceoSkillRead(g, a.id, readBiz(g, a).manager!)!
      expect(last.sd).toBeLessThanOrEqual(0.2)
      expect(knowKeys(g)).toEqual([ceoKeyOf(a)])
    })
  })
})

describe('the files', () => {
  const files = ['manage.ts', 'conglomerate-menu.ts', 'board-ceo.ts', 'staff-fog.ts', 'leader-fog.ts'].map((f) => [f, readFileSync(join(ROOT, 'src/game/business', f), 'utf8')] as const)

  it('none of the five imports people-fog.ts (a business file may not: business->life is a counted pair)', () => {
    for (const [f, text] of files) expect(text, f).not.toMatch(/from '(\.\.\/)+people-fog'|from '\.\/people-fog'/)
  })

  it('manage.ts, conglomerate-menu.ts and board-ceo.ts reach the reads through the leaf and never pass exposure themselves', () => {
    for (const [f, text] of files.filter(([f]) => ['manage.ts', 'conglomerate-menu.ts', 'board-ceo.ts'].includes(f))) {
      expect(text, f).toMatch(/from '\.\/leader-fog'/)
      expect(text, f).not.toMatch(/knowledge\/contract'/)
    }
  })

  it('no long dash in the five files or in this test, and the leaf stays a leaf', () => {
    for (const [f, text] of files) expect(LONG_DASH.test(text.replaceAll('−', '-')), f).toBe(false)
    expect(LONG_DASH.test(readFileSync(join(ROOT, 'test/fog-leader.test.ts'), 'utf8'))).toBe(false)
    const leaf = files.find(([f]) => f === 'leader-fog.ts')![1]
    const imports = [...leaf.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    for (const from of imports) expect(['../flags', '../knowledge/contract', '../types'], from).toContain(from)
  })

  it('the leaf draws nothing and books nothing', () => {
    const code = files.find(([f]) => f === 'leader-fog.ts')![1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/Math\.random|\.rng\b|\brand\(|chance\(|randInt\(|uid\(/)
    expect(code).not.toMatch(/\.money\b|\.cash\b|firmCash|earnIncome|addMoney|spend\(|bookMint|bookBurn/)
  })

  it('every text a screen prints for the list is within the voice limits', () => {
    real(() => {
      const { g, a } = ceoGame()
      const m = openList(g, a)
      for (const c of m.choices) expect(c.label.length, c.label).toBeLessThanOrEqual(90)
      expect(withInfoMode('realistic', () => ceoFooter([1], 0, 12_345, 8)).length).toBeLessThanOrEqual(120)
    })
  })
})
