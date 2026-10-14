// Money an investigation took before the trial comes back when the player is cleared (acquittal, or a
// conviction overturned on appeal), and an acquittal that says "you can sue" creates a real grievance in
// Activities > Lawsuit. Everything runs through the real arrest and trial scripts.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { addGrievance, grievances } from '../src/game/activities/common'
import { defendants, lawsuitMenu } from '../src/game/activities/lawsuit'
import { counter, formatMoney } from '../src/game/core'
import { arrestPlayer } from '../src/game/crime'
import { fugitiveInfo, prisonMenu, releaseFromPrison, sendToPrison } from '../src/game/prison'
import { isLoadableGame, migrateLegacyAi, migrateSave } from '../src/game/save-schema'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const START = 10_000
const REFUND = 2_500_000

function newGame(seed: number, o: { age?: number; money?: number; countryId?: string } = {}): GameState {
  return makeTestGame(seed, { age: o.age ?? 40, money: o.money ?? START, ...(o.countryId ? { countryId: o.countryId } : {}) })
}

function answer(g: GameState, m: ChoiceModal, choice: string): void {
  runScript(g, m.scriptId!, choice, m.data, m)
}

/** Answer the trial chain: cooperate, free lawyer, then accept or refuse a plea deal. */
function runTrial(g: GameState, opts: { plea?: 'accept' | 'trial' } = {}): void {
  for (let guard = 0; guard < 10; guard++) {
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.'))
    if (!m) return
    g.queue.splice(g.queue.indexOf(m), 1)
    if (m.scriptId === 'crime.arrest') answer(g, m, 'cooperate')
    else if (m.scriptId === 'crime.trial.lawyer') answer(g, m, 'pd')
    else if (m.scriptId === 'crime.trial.plea') answer(g, m, opts.plea ?? 'trial')
    else if (m.scriptId === 'crime.trial.feds') answer(g, m, 'refuse')
    else return
  }
}

function pendingTrial(g: GameState): ChoiceModal {
  const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.'))
  if (!m) throw new Error('no trial in the queue')
  return m
}

function notice(g: GameState, title: string): NoticeModal | undefined {
  return g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === title)
}

function noticeTexts(g: GameState): string {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice').map((m) => m.text).join('\n')
}

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function prisonAction(g: GameState, id: string): MenuAction {
  const n = findNode(g, prisonMenu.children(g), id)
  if (!n || n.type !== 'action') throw new Error(`no prison action ${id}`)
  return n
}

type Opts = NonNullable<Parameters<typeof arrestPlayer>[3]>

/** A realistic agency case: moderate severity, middling evidence, free lawyer. Acquits roughly a quarter of the time. */
const AGENCY: Opts = { evidence: 0.5, noResist: true, refund: REFUND, defendant: 'the FCA' }

/** Play one arrest to the end. `convicted` is true when the player ended up in prison. */
function play(seed: number, opts: Opts, plea: 'accept' | 'trial' = 'trial', setup?: (g: GameState) => void): { g: GameState; convicted: boolean } {
  const g = newGame(seed)
  setup?.(g)
  arrestPlayer(g, 'Insider Trading', 2, opts)
  runTrial(g, { plea })
  return { g, convicted: !!g.character.prison }
}

const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1)

describe('acquittal returns the money the investigation took', () => {
  it('pays back exactly the refund, once, and the notice says so', () => {
    let acquitted = 0
    let convictedSeeds = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, AGENCY)
      if (convicted) {
        convictedSeeds++
        continue
      }
      acquitted++
      expect(g.character.money).toBe(START + REFUND)
      const n = notice(g, 'Not Guilty!')
      expect(n, `seed ${seed}`).toBeDefined()
      expect(n!.text).toContain(formatMoney(REFUND))
      expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId?.startsWith('crime.'))).toBe(false)
      expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    }
    expect(acquitted).toBeGreaterThan(0)
    expect(convictedSeeds).toBeGreaterThan(0)
  })

  it('names the agency that took it when there is one, and not when there is not', () => {
    let named = 0
    let plain = 0
    for (const seed of SEEDS) {
      const a = play(seed, AGENCY)
      if (!a.convicted) {
        named++
        expect(notice(a.g, 'Not Guilty!')!.text).toContain('the FCA')
      }
      const b = play(seed, { ...AGENCY, defendant: undefined })
      if (!b.convicted) {
        plain++
        expect(b.g.character.money).toBe(START + REFUND)
        expect(notice(b.g, 'Not Guilty!')!.text).toContain(formatMoney(REFUND))
      }
    }
    expect(named).toBeGreaterThan(0)
    expect(plain).toBeGreaterThan(0)
  })

  it('an acquittal without a refund changes no money and says nothing about getting money back', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, { evidence: 0.5, noResist: true })
      if (convicted) continue
      acquitted++
      expect(g.character.money).toBe(START)
      expect(notice(g, 'Not Guilty!')!.text).not.toMatch(/got back|came back|returned/i)
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('also pays it back in the fugitive branch ("Not Guilty... But")', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = newGame(seed)
      sendToPrison(g, 'Burglary', 5, { quiet: true })
      releaseFromPrison(g, 'escaped')
      expect(fugitiveInfo(g)).not.toBeNull()
      g.character.money = START
      // A false accusation is acquitted about nine times in ten.
      arrestPlayer(g, 'Insider Trading', 1, { evidence: 0.2, noResist: true, falseAccusation: true, refund: REFUND, defendant: 'the FCA' })
      runTrial(g)
      const n = notice(g, 'Not Guilty... But')
      if (!n) continue
      seen++
      expect(g.character.money).toBe(START + REFUND)
      expect(n.text).toContain(formatMoney(REFUND))
      expect(g.character.prison).not.toBeNull()
      expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('a conviction forfeits it and remembers it for an appeal', () => {
  it('a verdict keeps the money gone and writes CrimeRecord.refund', () => {
    let convictions = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, AGENCY)
      if (!convicted) continue
      convictions++
      expect(g.character.money).toBe(START)
      const rec = g.character.criminalRecord.filter((r) => r.convicted)
      expect(rec).toHaveLength(1)
      expect(rec[0].refund).toBe(REFUND)
      expect(noticeTexts(g)).not.toContain(formatMoney(REFUND))
      expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    }
    expect(convictions).toBeGreaterThan(0)
  })

  it('a plea deal does the same', () => {
    let pleas = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, AGENCY, 'accept')
      if (!convicted || !notice(g, 'Plea Accepted')) continue
      pleas++
      expect(g.character.money).toBe(START)
      const rec = g.character.criminalRecord.filter((r) => r.convicted)
      expect(rec).toHaveLength(1)
      expect(rec[0].refund).toBe(REFUND)
    }
    expect(pleas).toBeGreaterThan(0)
  })

  it('a conviction with no refund leaves the record without the field', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const { g, convicted } = play(seed, { evidence: 0.9, noResist: true })
      if (!convicted) continue
      expect(g.character.criminalRecord.every((r) => !('refund' in r))).toBe(true)
    }
  })
})

describe('a successful appeal returns it once', () => {
  /** A convicted game with enough cash and karma to appeal. */
  function convictedGame(seed: number, refund: number | undefined): GameState | null {
    const g = newGame(seed)
    arrestPlayer(g, 'Insider Trading', 2, { evidence: 0.9, noResist: true, ...(refund ? { refund, defendant: 'the FCA' } : {}) })
    runTrial(g)
    if (!g.character.prison) return null
    g.character.money = 1_000_000_000
    g.character.hidden.karma = 100
    return g
  }

  it('the appeal pays the refund back, the notice says so, and a second overturn pays nothing', () => {
    let won = 0
    for (const seed of SEEDS) {
      const control = convictedGame(seed, undefined)
      const treated = convictedGame(seed, REFUND)
      if (!control || !treated) continue
      // Same seed, same rolls: the only difference between the two lives is the refund.
      expect(treated.character.money).toBe(control.character.money)
      prisonAction(control, 'prison.appeal.top').run(control)
      prisonAction(treated, 'prison.appeal.top').run(treated)
      expect(!!treated.character.prison).toBe(!!control.character.prison)
      if (treated.character.prison) {
        expect(treated.character.money).toBe(control.character.money)
        expect(treated.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(REFUND)
        continue
      }
      won++
      expect(treated.character.money - control.character.money).toBe(REFUND)
      expect(notice(treated, 'Appeal Won!')!.text).toContain(formatMoney(REFUND))
      expect(notice(control, 'Appeal Won!')!.text).not.toMatch(/got back/i)
      expect(treated.character.criminalRecord.every((r) => r.refund === undefined && !r.convicted)).toBe(true)
      expect(JSON.parse(JSON.stringify(treated))).toEqual(treated)

      // Locked up again for the same crime and overturned again: nothing more comes back.
      for (const g of [control, treated]) {
        sendToPrison(g, 'Insider Trading', 3, { quiet: true })
        g.queue = []
        g.character.money += 1_000_000_000
        g.character.hidden.karma = 100
        prisonAction(g, 'prison.appeal.top').run(g)
      }
      expect(!!treated.character.prison).toBe(!!control.character.prison)
      expect(treated.character.money - control.character.money).toBe(REFUND)
    }
    expect(won).toBeGreaterThan(0)
  })

  it('an appeal that fails returns nothing and keeps the amount on the record', () => {
    let lost = 0
    for (const seed of SEEDS) {
      const g = convictedGame(seed, REFUND)
      if (!g) continue
      g.character.hidden.karma = 0
      const before = g.character.money
      prisonAction(g, 'prison.appeal.budget').run(g)
      if (!g.character.prison) continue
      lost++
      expect(g.character.money).toBeLessThan(before)
      expect(g.character.criminalRecord.find((r) => r.convicted)?.refund).toBe(REFUND)
    }
    expect(lost).toBeGreaterThan(0)
  })

  it('a death row exoneration returns it too', () => {
    let exonerated = 0
    for (let seed = 1; seed <= 600; seed++) {
      const g = newGame(seed)
      g.character.criminalRecord.push({ crime: 'Insider Trading', age: 35, caught: true, convicted: true, sentenceYears: 99, refund: REFUND })
      sendToPrison(g, 'Insider Trading', 0, { deathRow: true, life: true, quiet: true })
      g.queue = []
      g.character.money = 1_000_000_000
      g.character.hidden.karma = 100
      prisonAction(g, 'prison.appeal.top').run(g)
      const n = notice(g, 'Exonerated!')
      if (!n) continue
      exonerated++
      // The appeal fee is well under a million; the refund is the rest.
      expect(g.character.money).toBeGreaterThan(1_000_000_000 + REFUND - 1_000_000)
      expect(g.character.money).toBeLessThan(1_000_000_000 + REFUND)
      expect(n.text).toContain(formatMoney(REFUND))
      expect(g.character.criminalRecord[0].refund).toBeUndefined()
      expect(g.character.criminalRecord[0].convicted).toBe(false)
    }
    expect(exonerated).toBeGreaterThan(0)
  })

  it('an absurd stored refund is capped when it is paid back', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const g = newGame(seed)
      g.character.criminalRecord.push({ crime: 'Insider Trading', age: 35, caught: true, convicted: true, sentenceYears: 99, refund: 1e300 })
      sendToPrison(g, 'Insider Trading', 0, { deathRow: true, life: true, quiet: true })
      g.queue = []
      g.character.hidden.karma = 100
      g.character.money = 1_000_000_000
      prisonAction(g, 'prison.appeal.top').run(g)
      if (!notice(g, 'Exonerated!')) continue
      expect(Number.isFinite(g.character.money)).toBe(true)
      expect(g.character.money).toBeLessThan(1e15 + 1_000_000_000)
      return
    }
    throw new Error('no exoneration in 600 seeds')
  })

  it('serving the time, parole and a prison-yard deal do not return it', () => {
    const g = newGame(1)
    g.character.criminalRecord.push({ crime: 'Insider Trading', age: 35, caught: true, convicted: true, sentenceYears: 3, refund: REFUND })
    for (const reason of ['served', 'parole', 'pardon', 'informant', 'commuted']) {
      sendToPrison(g, 'Insider Trading', 3, { quiet: true })
      g.character.money = START
      releaseFromPrison(g, reason)
      expect(g.character.money).toBe(START)
    }
    expect(g.character.criminalRecord[0].refund).toBe(REFUND)
  })
})

describe('arrests that merge, and edge branches', () => {
  it('two arrests in one chain add their refunds, and the first agency stays', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const g = newGame(seed)
      arrestPlayer(g, 'Insider Trading', 1, { evidence: 0.2, falseAccusation: true, noResist: true, refund: 100_000, defendant: 'the SEC' })
      arrestPlayer(g, 'Market Manipulation', 1, { evidence: 0.2, refund: 250_000, defendant: 'the FCA' })
      const data = pendingTrial(g).data as { refund: number; defendant: string }
      expect(data.refund).toBe(350_000)
      expect(data.defendant).toBe('the SEC')
      runTrial(g)
      if (g.character.prison) continue
      acquitted++
      expect(g.character.money).toBe(START + 350_000)
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('a second arrest adopts the agency when the first had none', () => {
    const g = newGame(3)
    arrestPlayer(g, 'Insider Trading', 1, { noResist: true })
    arrestPlayer(g, 'Market Manipulation', 1, { refund: 5_000, defendant: 'the FCA' })
    expect(pendingTrial(g).data).toMatchObject({ refund: 5_000, defendant: 'the FCA' })
  })

  it('a second arrest with a bad refund adds nothing', () => {
    const g = newGame(3)
    arrestPlayer(g, 'Insider Trading', 1, { noResist: true, refund: 1_000 })
    arrestPlayer(g, 'Market Manipulation', 1, { refund: -5_000 })
    arrestPlayer(g, 'Fraud', 1, { refund: Number.NaN })
    arrestPlayer(g, 'Perjury', 1, { refund: Number.POSITIVE_INFINITY })
    expect((pendingTrial(g).data as { refund: number }).refund).toBe(1_000)
  })

  it('a child under ten gets the money back at once (no trial happens)', () => {
    const g = newGame(1, { age: 8 })
    arrestPlayer(g, 'Insider Trading', 1, { refund: 5_000, defendant: 'the FCA' })
    expect(g.character.money).toBe(START + 5_000)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
    expect(noticeTexts(g)).toContain(formatMoney(5_000))
  })

  it('a conviction inside prison forfeits it (no trial, no appeal)', () => {
    const g = newGame(5)
    sendToPrison(g, 'Burglary', 3, { quiet: true })
    arrestPlayer(g, 'Insider Trading', 2, { refund: 5_000, defendant: 'the FCA' })
    expect(g.character.money).toBe(START)
  })

  it('a zero or missing refund is the same as before', () => {
    const a = play(7, { evidence: 0.5, noResist: true })
    const b = play(7, { evidence: 0.5, noResist: true, refund: 0 })
    expect(JSON.stringify(b.g)).toBe(JSON.stringify(a.g))
  })
})

describe('hostile and old saved data', () => {
  const BAD_REFUNDS: unknown[] = [-50, -1e9, 'lots', '5000', null, true, {}, [], [5], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  /** A trial waiting for its verdict, with the queued data replaced by `patch`. */
  function trialWith(seed: number, patch: Record<string, unknown>, opts: Opts = { evidence: 0.2, noResist: true, falseAccusation: true }): GameState {
    const g = newGame(seed)
    arrestPlayer(g, 'Insider Trading', 1, opts)
    const m = pendingTrial(g)
    const data = m.data as Record<string, unknown>
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete data[k]
      else data[k] = v
    }
    return g
  }

  it('a refund that is not a finite number >= 0 is treated as zero', () => {
    for (const bad of BAD_REFUNDS) {
      let acquitted = 0
      for (const seed of SEEDS.slice(0, 25)) {
        const g = trialWith(seed, { refund: bad })
        runTrial(g)
        if (g.character.prison) continue
        acquitted++
        expect(g.character.money, `refund ${String(bad)}`).toBe(START)
        expect(noticeTexts(g)).not.toMatch(/got back/i)
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
      expect(acquitted).toBeGreaterThan(0)
    }
  })

  it('a huge refund is capped, never infinite money', () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const g = trialWith(seed, { refund: 1e300 })
      runTrial(g)
      if (g.character.prison) continue
      expect(Number.isFinite(g.character.money)).toBe(true)
      expect(g.character.money).toBeLessThanOrEqual(1e15 + START)
      return
    }
    throw new Error('no acquittal in 25 seeds')
  })

  it('a hostile defendant becomes a short clean name, or nothing', () => {
    const cases: [unknown, RegExp | null][] = [
      ['x'.repeat(10_000), /^x{1,60}$/],
      ['<b>the FCA\u0000</b>\n', /^[^<>\u0000-\u001f]{1,60}$/],
      ['the\nFCA\tdesk', /^the FCA desk$/],
      [42, null],
      ['', null],
      ['   ', null],
      ['\u0000\u0001<>', null],
      [{ name: 'the FCA' }, null],
    ]
    for (const [bad, shape] of cases) {
      let acquitted = 0
      for (const seed of SEEDS.slice(0, 25)) {
        const g = trialWith(seed, { defendant: bad, refund: 1_000 })
        runTrial(g)
        if (g.character.prison) continue
        acquitted++
        const gv = grievances(g)
        expect(gv).toHaveLength(1)
        if (shape) expect(gv[0].name).toMatch(shape)
        else expect(gv[0].name).toBe('the police department')
        expect(noticeTexts(g)).not.toMatch(/[<>]/)
      }
      expect(acquitted).toBeGreaterThan(0)
    }
  })

  it('a trial saved before the fields existed plays exactly as before', () => {
    let acquitted = 0
    for (const seed of SEEDS.slice(0, 40)) {
      const g = trialWith(seed, { refund: undefined, defendant: undefined }, { evidence: 0.5, noResist: true })
      const data = pendingTrial(g).data as Record<string, unknown>
      expect('refund' in data).toBe(false)
      runTrial(g)
      if (g.character.prison) continue
      acquitted++
      expect(g.character.money).toBe(START)
      expect(grievances(g)).toHaveLength(0)
      expect(noticeTexts(g)).not.toMatch(/sue|Lawsuit|got back/i)
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('a mid-trial game survives a JSON round trip with refund and defendant intact', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const g = newGame(seed)
      arrestPlayer(g, 'Insider Trading', 2, { evidence: 0.5, refund: REFUND, defendant: 'the FCA' })
      // Saved at the arrest popup.
      const atArrest = JSON.parse(JSON.stringify(g)) as GameState
      expect(pendingTrial(atArrest).data).toMatchObject({ refund: REFUND, defendant: 'the FCA' })
      const arrest = pendingTrial(atArrest)
      atArrest.queue.splice(atArrest.queue.indexOf(arrest), 1)
      answer(atArrest, arrest, 'cooperate')
      // Saved again at the lawyer popup.
      const atLawyer = JSON.parse(JSON.stringify(atArrest)) as GameState
      expect(pendingTrial(atLawyer).data).toMatchObject({ refund: REFUND, defendant: 'the FCA' })
      runTrial(atLawyer)
      if (atLawyer.character.prison) continue
      acquitted++
      expect(atLawyer.character.money).toBe(START + REFUND)
    }
    expect(acquitted).toBeGreaterThan(0)
  })
})

describe('the saved criminal record', () => {
  const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>

  function load(patch: (g: GameState) => void): GameState {
    const raw = structuredClone(fixture) as unknown as GameState
    patch(raw)
    const out = migrateSave(JSON.parse(JSON.stringify(raw)))
    if (out.kind !== 'ready') throw new Error(`save did not load: ${out.kind}`)
    return out.game
  }

  it('keeps a valid refund and leaves an old record without the field alone', () => {
    const game = load((g) => {
      g.character.criminalRecord = [
        { crime: 'Insider Trading', age: 40, caught: true, convicted: true, sentenceYears: 4, refund: REFUND },
        { crime: 'Shoplifting', age: 15, caught: true, convicted: false },
      ]
    })
    expect(game.character.criminalRecord[0].refund).toBe(REFUND)
    expect('refund' in game.character.criminalRecord[1]).toBe(false)
    expect(isLoadableGame(game)).toBe(true)
  })

  it('drops a refund that is negative or not a number instead of refusing the save', () => {
    const game = load((g) => {
      const bad = (refund: unknown) => ({ crime: 'Fraud', age: 30, caught: true, convicted: true, refund }) as never
      g.character.criminalRecord = [bad(-5), bad('lots'), bad(null), bad({}), bad(true), bad(1e300), bad(0)]
    })
    const refunds = game.character.criminalRecord.map((r) => r.refund)
    expect(refunds.slice(0, 5)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(refunds[5]).toBe(1e300) // kept as saved; it is capped when it is paid back
    expect(refunds[6]).toBe(0)
    expect(isLoadableGame(game)).toBe(true)
  })
})

describe('the Time Machine load path', () => {
  it('repairs a damaged refund too (it shares the in-place clean-up)', () => {
    const g = newGame(1)
    g.character.criminalRecord = [
      { crime: 'Fraud', age: 30, caught: true, convicted: true, refund: -1 },
      { crime: 'Fraud', age: 31, caught: true, convicted: true, refund: 40 },
      { crime: 'Fraud', age: 32, caught: true, convicted: true, refund: 'x' as never },
    ]
    migrateLegacyAi(g)
    expect(g.character.criminalRecord.map((r) => r.refund)).toEqual([undefined, 40, undefined])
    migrateLegacyAi(g)
    expect(g.character.criminalRecord.map((r) => r.refund)).toEqual([undefined, 40, undefined])
  })
})

describe('"you might have grounds to sue" is true', () => {
  const FALSE_ACCUSATION: Opts = { evidence: 0.2, noResist: true, falseAccusation: true }

  it('a false-accusation acquittal files a police grievance that shows in the Lawsuit menu', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, FALSE_ACCUSATION)
      if (convicted) {
        expect(grievances(g)).toHaveLength(0)
        continue
      }
      acquitted++
      const gv = grievances(g)
      expect(gv).toHaveLength(1)
      expect(gv[0]).toMatchObject({ kind: 'police', name: 'the police department', strength: 45, age: 40 })
      const list = defendants(g)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ kind: 'police', name: 'the police department', strength: 45 })
      const text = notice(g, 'Not Guilty!')!.text
      expect(text).toContain('the police department')
      expect(text).toContain('Activities, Lawsuit')
      const menu = lawsuitMenu.children(g)
      expect(menu).toHaveLength(1)
      expect(menu[0].type).toBe('menu')
      expect((menu[0] as MenuGroup).label).toBe('The police department')
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('an agency prosecution files a grievance against the agency', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, AGENCY)
      if (convicted) {
        expect(grievances(g)).toHaveLength(0)
        continue
      }
      acquitted++
      const gv = grievances(g)
      expect(gv).toHaveLength(1)
      expect(gv[0]).toMatchObject({ kind: 'police', name: 'the FCA', strength: 35 })
      expect(gv[0].detail).toMatch(/took your money/)
      const text = notice(g, 'Not Guilty!')!.text
      expect(text).toContain('the FCA')
      expect(text).toContain('Activities, Lawsuit')
      expect(defendants(g).map((d) => d.name)).toEqual(['the FCA'])
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('an ordinary acquittal creates nothing and says nothing about suing', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, { evidence: 0.5, noResist: true })
      if (convicted) continue
      acquitted++
      expect(grievances(g)).toHaveLength(0)
      expect(defendants(g)).toHaveLength(0)
      expect(notice(g, 'Not Guilty!')!.text).not.toMatch(/sue|Lawsuit/i)
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('a minor cannot sue, so nothing is filed and nothing is promised', () => {
    let acquitted = 0
    for (const seed of SEEDS) {
      const g = newGame(seed, { age: 16 })
      arrestPlayer(g, 'Larceny', 1, { ...FALSE_ACCUSATION, refund: 1_000, defendant: 'the police' })
      runTrial(g)
      if (g.character.prison) continue
      acquitted++
      expect(grievances(g)).toHaveLength(0)
      expect(notice(g, 'Not Guilty!')!.text).not.toMatch(/sue|Lawsuit/i)
      expect(g.character.money).toBe(START + 1_000)
    }
    expect(acquitted).toBeGreaterThan(0)
  })

  it('suing the grievance pays out on a winning seed, once', () => {
    let wins = 0
    for (const seed of SEEDS) {
      const { g, convicted } = play(seed, FALSE_ACCUSATION)
      if (convicted) continue
      g.queue = []
      g.character.money = 1_000_000
      const before = g.character.money
      const group = lawsuitMenu.children(g)[0] as MenuGroup
      const firm = group.children(g).find((n): n is MenuAction => n.type === 'action' && n.id.endsWith('.firm2'))!
      firm.run(g)
      const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice')!
      const amount = Number(modal.choices[0].label.replace(/[^0-9]/g, ''))
      answer(g, modal, '0')
      expect(counter(g, 'lawsuits')).toBe(1)
      expect(defendants(g)).toHaveLength(0)
      expect(grievances(g)).toHaveLength(0)
      if (counter(g, 'lawsuitsWon') === 1) {
        wins++
        expect(g.character.money).toBeGreaterThan(before - 100_000 + amount - 1)
      }
    }
    expect(wins).toBeGreaterThan(0)
  })

  it('the fugitive branch files nothing and promises nothing', () => {
    let seen = 0
    for (const seed of SEEDS) {
      const g = newGame(seed)
      sendToPrison(g, 'Burglary', 5, { quiet: true })
      releaseFromPrison(g, 'escaped')
      arrestPlayer(g, 'Insider Trading', 1, { ...FALSE_ACCUSATION, refund: 1_000, defendant: 'the FCA' })
      runTrial(g)
      const n = notice(g, 'Not Guilty... But')
      if (!n) continue
      seen++
      expect(grievances(g)).toHaveLength(0)
      expect(n.text).not.toMatch(/sue|Lawsuit/i)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('existing grievances from other modules are untouched', () => {
    const { g, convicted } = play(1, FALSE_ACCUSATION, 'trial', (game) => addGrievance(game, { kind: 'surgeon', name: 'Dr. Who', strength: 60, detail: 'botched your nose job' }))
    const names = grievances(g).map((x) => x.name)
    expect(names).toContain('Dr. Who')
    expect(names.length).toBe(convicted ? 1 : 2)
  })
})
