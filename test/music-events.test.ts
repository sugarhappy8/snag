// Music 2.0, Task 7: six events, the claim dispute and awards by country. Every def rolls only the odds it
// hints, a replayed or stale modal changes nothing, a claim is seeded and stable, at most one popup a year
// is offered (a due renewal first), and the legacy awards block stays quiet once the sim owns the life.
import { afterEach, describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { typicalIncome } from '../src/game/events/wealth-core'
import { hasTech } from '../src/game/history/timeline'
import { hasScript, runScript } from '../src/game/scripts'
import { hire, ownerKey } from '../src/game/special/common'
import { applyEffects, bestStance, defineCrises, optionOdds, type CrisisDef, type CrisisSet, type Stance } from '../src/game/special/kit/crisis'
import { activeField } from '../src/game/special/kit/rivals'
import { appointmentId } from '../src/game/special/kit/state'
import { YEARLY_BUDGET, careerCtx, setCareerAudit, type CareerCtx } from '../src/game/special/kit/year'
import { yearlyMusic } from '../src/game/special/music'
import { claimOdds, ceremonyAt, type ClaimKind } from '../src/game/special/music-data'
import { AUDIT_ODDS, DISPUTE, MUSIC_DEFS, claimAmount, claimKind, stepDispute, winOdds, type DisputeData } from '../src/game/special/music-events'
import { musicProfile, viewMusic, mdView, musicJob, type Release } from '../src/game/special/music-job'
import { MUSIC_SPEC } from '../src/game/special/music-market'
import { musicSim } from '../src/game/special/music-sim'
import { adoptMusic, musicStore, type LabelDeal, type LedgerRow, type MusicState } from '../src/game/special/music-state'
import type { ChoiceModal, GameState, Job, Json, NoticeModal } from '../src/game/types'
import { assertHonestOdds, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const STANCES: readonly Stance[] = ['safe', 'bold', 'cash']
type Def = CrisisDef<MusicState, any>
const defOf = (id: string): Def => MUSIC_DEFS.find((d) => d.id === id)!
const ALL: readonly Def[] = [...MUSIC_DEFS, DISPUTE]

interface LifeOpts {
  seed?: number
  year?: number
  country?: string
  pop?: number
  fame?: number
  cash?: number
  talent?: boolean
  deal?: 'ledger' | 'legacy' | 'none'
  release?: boolean
  adopt?: boolean
  quality?: number
}

function row(o: Partial<LedgerRow> = {}): LedgerRow {
  return { id: 'r1', title: 'Old Hit', type: 'studio', year: 1994, fmt: 'cd', units0: 100_000, k: 0.4, pay: 1, quality: 70, peak: 4, dealId: 'd1', label: 'Echo Chamber Records', rate: 0.16, members: 1, samples: 'original', gross: 500_000, paid: 0, lastLabel: 0, lastYear: 1994, adopted: false, legacy: false, ...o }
}

function deal(job: Job, o: Partial<LabelDeal> = {}): LabelDeal {
  return { id: 'd1', appt: appointmentId(job), labelId: 'echo-chamber-records', label: 'Echo Chamber Records', tier: 1, since: 1993, term: 3, years: 1, royalty: 0.16, advance: 90_000, perYear: 30_000, unrecouped: 40_000, trust: 55, legacy: false, renewals: 0, ...o }
}

/**
 * A 1995 US life at the time of the yearly hook: a solo musician (popularity 60, fame 40), an adopted record, a
 * signed ledger deal with 40,000 unrecouped and two of three years gone, a release last year (quality 70, peak 4)
 * in the ledger and the discography, and 200,000 in cash.
 */
function life(o: LifeOpts = {}): { g: GameState; s: MusicState } {
  const g = makeTestGame(o.seed ?? 1, o.country ? { age: 30, countryId: o.country } : { age: 30 })
  g.year = o.year ?? 1995
  g.character.money = o.cash ?? 200_000
  g.character.hidden.fame = o.fame ?? 40
  g.flags.instruments = { Guitar: 60 }
  if (o.talent) g.character.talent = 'Music'
  const age = g.character.age
  const { job } = hire(g, {
    defId: 'musician',
    title: 'Solo Artist',
    company: 'Independent',
    salary: 0,
    data: { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: o.pop ?? 60, bandName: null, bandmates: [], members: 1, recordedAge: age - 1, lastRelease: age - 1 } as Record<string, Json>,
  })
  if (o.release !== false) {
    const r: Release = { title: 'Last Hit', type: 'Studio Album', genre: 'Pop', subgenre: 'Dance', age: age - 1, sold: 100_000, earned: 20_000, cert: null, quality: o.quality ?? 70, royalty: 0 }
    musicProfile(g).discography.push(r)
  }
  const s = musicStore.mut(g)
  if (o.adopt !== false) adoptMusic(g, s)
  const kind = o.deal ?? 'ledger'
  if (kind === 'ledger') s.deal = deal(job)
  if (kind === 'legacy') s.deal = deal(job, { id: 'legacy', legacy: true, royalty: 1, unrecouped: 0 })
  s.ledger.push(row({ year: g.year - 1, lastYear: g.year - 1 }))
  return { g, s }
}

interface Fix { g: GameState; s: MusicState; d: any }

/** A life with the def's data made the way the kit makes it, from a seeded stream. */
function mk(def: Def, o: LifeOpts = {}): Fix {
  const { g, s } = life(o)
  return { g, s, d: def.make(g, s, seeded(`test|${def.id}`)) }
}

const ctxOf = (g: GameState, s: MusicState): CareerCtx<MusicState> => careerCtx(g, 'music', s, { ...YEARLY_BUDGET })
const choiceModals = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
const careerChoices = (g: GameState): ChoiceModal[] => choiceModals(g).filter((m) => m.scriptId?.startsWith('career.'))
const notices = (g: GameState, title?: string): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))
const snap = (g: GameState): string => JSON.stringify({ ...g, queue: [], log: [], nextId: 0, flags: Object.fromEntries(Object.entries(g.flags).filter(([k]) => k !== 'core.resolvedScriptModals')) })
const popOf = (g: GameState): number => mdView(musicJob(g)!).popularity
const fameOf = (g: GameState): number => g.character.hidden.fame

/** What offerChoice stamps on a crisis modal. */
const stamp = (g: GameState, id: string, d: unknown): Record<string, Json> => ({ id, d: d as Json, owner: ownerKey(g), year: g.year })
/** Runs a script the way the store does after it removed the modal. */
const fire = (g: GameState, script: string, choice: string, data: Json): void => runScript(g, script, choice, data, null as never)
const scriptOf = (def: Def): string => `career.music.${def.id}`

// One crisis set per def, under its own career id so the scripts of the real set stay untouched. A script id registers once.
const solos = new Map<string, CrisisSet<MusicState>>()
function solo(def: Def): CrisisSet<MusicState> {
  let set = solos.get(def.id)
  if (!set) {
    set = defineCrises({ career: 'musict', store: musicStore, talent: 'Music', defs: [def] })
    solos.set(def.id, set)
  }
  return set
}

/** Offers `def` alone on a fresh life by trying rng seeds until the 35% roll lands. */
function offerOne(def: Def, talent: boolean): { g: GameState; s: MusicState; modal: ChoiceModal; d: unknown } {
  for (let seed = 1; seed <= 300; seed++) {
    const f = life({ seed, talent })
    f.g.rng = seed
    if (!solo(def).offer(ctxOf(f.g, f.s))) continue
    const modal = choiceModals(f.g).find((m) => m.scriptId === `career.musict.${def.id}`)
    if (modal) return { ...f, modal, d: (modal.data as { d: unknown }).d }
  }
  throw new Error(`${def.id} was never offered`)
}

/** A row that draws a sample claim, found by id: a risky release one year old that charted #4. */
function claimedRow(g: GameState, o: Partial<LedgerRow> = {}, asOf: number = g.year): LedgerRow {
  const then: GameState = { ...g, year: asOf }
  for (let i = 1; i < 500; i++) {
    const r = row({ id: `c${i}`, year: g.year - 1, lastYear: g.year - 1, samples: 'risky', peak: 4, gross: 1_000_000, ...o })
    if (claimKind(then, r) === 'sample') return r
  }
  throw new Error('no claimed row')
}

interface Dispute extends Fix { row: LedgerRow; d: DisputeData }

/** A life with a claimed row and the dispute data of it (the fields the script reads, as the modal carries them). */
function disputeFix(o: LifeOpts & { legacyRow?: boolean } = {}): Dispute {
  const { g, s } = life(o)
  const r = claimedRow(g, { legacy: o.legacyRow === true })
  s.ledger.push(r)
  const kind = claimKind(g, r) as ClaimKind
  const d: DisputeData = { rowId: r.id, kind, claim: claimAmount(g, r, kind), evidence: 0.5, claimant: { id: 'music.GB.1995.0', name: 'Dana Reyes' }, legacy: r.legacy }
  return { g, s, d, row: r }
}

const disputeData = (g: GameState, d: DisputeData): Record<string, Json> => ({ ...d, owner: ownerKey(g), year: g.year })

describe('music events: the defs', () => {
  it('registers six defs and the dispute with two or three distinct stances', () => {
    expect(MUSIC_DEFS.map((d) => d.id)).toEqual(['collab', 'award', 'festival', 'scandal', 'clash', 'audit'])
    for (const def of MUSIC_DEFS) {
      expect(hasScript(`career.music.${def.id}`), def.id).toBe(true)
      const opts = STANCES.map((s) => def.options[s]).filter((o) => !!o)
      expect(opts.length).toBeGreaterThanOrEqual(2)
      expect(opts.length).toBeLessThanOrEqual(3)
      expect(new Set(opts.map((o) => o!.label)).size).toBe(opts.length)
    }
    expect(hasScript('career.music.dispute')).toBe(true)
    expect(Object.keys(DISPUTE.options).sort()).toEqual(['bold', 'cash', 'safe'])
    const labels = (def: Def): string[] => STANCES.map((s) => def.options[s]?.label).filter((x): x is string => !!x)
    expect(labels(defOf('collab'))).toEqual(['Turn it down', 'Record the feature', 'Sell a verse'])
    expect(labels(defOf('award'))).toEqual(['Attend quietly', 'Campaign for votes', 'Skip it'])
    expect(labels(defOf('festival'))).toEqual(['Take the side stage', 'Push for the main stage'])
    expect(labels(defOf('scandal'))).toEqual(['Say nothing', 'Deny it', 'Sell your side'])
    expect(labels(defOf('clash'))).toEqual(['Cut the radio edit', 'Meet halfway', 'Refuse flatly'])
    expect(labels(defOf('audit'))).toEqual(['Let it go', 'Hire an auditor', 'Ask nicely'])
    expect(labels(DISPUTE)).toEqual(['Settle', 'Fight it', 'Credit them'])
    expect(AUDIT_ODDS).toBe(0.55)
    // the dispute is never offered by the kit's own roll
    expect(DISPUTE.weight(life().g, life().s)).toBe(0)
  })

  it('gates every def by era, state and country [RF7]', () => {
    const w = (id: string, o: LifeOpts = {}, edit?: (f: { g: GameState; s: MusicState }) => void): number => {
      const f = life(o)
      edit?.(f)
      return defOf(id).weight(f.g, f.s)
    }
    // every def can be eligible in the base life
    for (const def of MUSIC_DEFS) expect(w(def.id), `${def.id} base`).toBeGreaterThan(0)
    // collab: popularity 25
    expect(w('collab', { pop: 24 })).toBe(0)
    expect(w('collab', { pop: 25 })).toBeGreaterThan(0)
    // clash: an active deal and radio
    expect(w('clash', { deal: 'none' })).toBe(0)
    expect(hasTech(life({ year: 1919 }).g, 'radio')).toBe(false)
    expect(w('clash', { year: 1919 })).toBe(0)
    expect(w('clash', { year: 1930 })).toBeGreaterThan(0)
    // a deal of another appointment is not active
    expect(w('clash', {}, (f) => void (f.s.deal!.appt = 'old'))).toBe(0)
    // festival: 1967, popularity 20 and the road open
    expect(w('festival', { year: 1950 })).toBe(0)
    expect(w('festival', { year: 2020 })).toBe(0)
    expect(w('festival', { year: 2021 })).toBe(0)
    expect(w('festival', { pop: 19 })).toBe(0)
    expect(w('festival', { year: 1967 })).toBeGreaterThan(0)
    // award: the country's ceremony, a release last year at critic 62 and popularity 40
    expect(ceremonyAt('ng', 1999)).toBeNull()
    expect(w('award', { country: 'ng', year: 1999 })).toBe(0)
    expect(w('award', { country: 'ng', year: 2000 })).toBeGreaterThan(0)
    expect(w('award', { year: 1958 })).toBe(0)
    expect(w('award', { year: 1959 })).toBeGreaterThan(0)
    expect(w('award', { quality: 61 })).toBe(0)
    expect(w('award', { quality: 62 })).toBeGreaterThan(0)
    expect(w('award', { pop: 39 })).toBe(0)
    expect(w('award', { release: false })).toBe(0)
    expect(w('award', {}, (f) => void (musicProfile(f.g).discography[0].age -= 1))).toBe(0)
    // scandal: fame 20
    expect(w('scandal', { fame: 19 })).toBe(0)
    expect(w('scandal', { fame: 20 })).toBeGreaterThan(0)
    // audit: a ledger deal with a balance and two deal years gone
    expect(w('audit', { deal: 'none' })).toBe(0)
    expect(w('audit', { deal: 'legacy' })).toBe(0)
    expect(w('audit', {}, (f) => void (f.s.deal!.unrecouped = 0))).toBe(0)
    expect(w('audit', {}, (f) => void (f.s.deal!.years = 2))).toBe(0)
    expect(w('audit', {}, (f) => void (f.s.deal!.years = 0))).toBeGreaterThan(0)
    // every weight is 0 in prison, and with no musician job
    for (const def of MUSIC_DEFS) {
      expect(w(def.id, {}, (f) => void (f.g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 })), `${def.id} in prison`).toBe(0)
      expect(w(def.id, {}, (f) => void (f.g.character.job = null)), `${def.id} with no job`).toBe(0)
    }
  })

  it('reads a junk job record without throwing [RF1]', () => {
    for (const junk of [null, 'x', 5, [1]] as unknown[]) {
      const f = life()
      musicJob(f.g)!.data = junk as never
      for (const def of MUSIC_DEFS) expect(def.weight(f.g, f.s), def.id).toBe(0)
      expect(stepDispute(ctxOf(f.g, f.s))).toBe(false)
    }
  })
})

describe('music events: playing them', () => {
  it('plays every stance over 40 seeds with no NaN, no negative cash, and ignores a stale year, deal or owner [RF3]', () => {
    for (const def of ALL) {
      const base = def === DISPUTE ? disputeFix() : mk(def)
      const script = scriptOf(def)
      const data = (g: GameState, d: unknown, over: Record<string, Json> = {}): Json => (def === DISPUTE ? { ...disputeData(g, d as DisputeData), ...over } : { ...stamp(g, def.id, d), ...over })
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 40; seed++) {
          const c = structuredClone({ g: base.g })
          c.g.rng = seed
          fire(c.g, script, stance, data(c.g, base.d))
          expect(finiteJson(c.g), `${def.id}/${stance}/${seed}`).toEqual([])
          expect(c.g.character.money, `${def.id}/${stance}/${seed} cash`).toBeGreaterThanOrEqual(0)
        }
        // a stale year, another owner and a replay change nothing at all
        for (const over of [{ year: base.g.year - 1 }, { owner: 'v2:9:somebody-else' }] as Record<string, Json>[]) {
          const c = structuredClone({ g: base.g })
          const before = snap(c.g)
          const rng = c.g.rng
          fire(c.g, script, stance, data(c.g, base.d, over))
          expect(snap(c.g), `${def.id}/${stance} ${JSON.stringify(over)}`).toBe(before)
          expect(c.g.rng).toBe(rng)
          expect(c.g.queue).toHaveLength(0)
        }
        const c = structuredClone({ g: base.g })
        const d = data(c.g, base.d)
        fire(c.g, script, stance, d)
        const after = snap(c.g)
        const rng = c.g.rng
        const queued = c.g.queue.length
        fire(c.g, script, stance, d)
        expect(snap(c.g), `${def.id}/${stance} replay`).toBe(after)
        expect(c.g.rng).toBe(rng)
        expect(c.g.queue).toHaveLength(queued)
      }
    }
    // a changed deal turns every branch of clash and audit into a no-effect line
    for (const id of ['clash', 'audit']) {
      const def = defOf(id)
      const base = mk(def)
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 12; seed++) {
          const c = structuredClone({ g: base.g })
          c.g.rng = seed
          const deal0 = JSON.stringify(musicStore.peek(c.g)!.deal)
          const cash = c.g.character.money
          const fame = fameOf(c.g)
          const pop = popOf(c.g)
          fire(c.g, scriptOf(def), stance, stamp(c.g, def.id, { ...base.d, dealId: 'someone-else' }))
          expect(JSON.stringify(musicStore.peek(c.g)!.deal), `${id}/${stance}`).toBe(deal0)
          expect(c.g.character.money).toBe(cash)
          expect(fameOf(c.g)).toBe(fame)
          expect(popOf(c.g)).toBe(pop)
          expect(notices(c.g).map((n) => n.text), `${id}/${stance}`).toEqual(['Nothing came of it.'])
        }
      }
    }
  }, 120_000)

  it('rolls the odds it hints, every rolled stance [RF6]', () => {
    for (const def of MUSIC_DEFS) assertHonestOdds(def, () => mk(def))
    assertHonestOdds(DISPUTE, () => disputeFix())
  }, 120_000)

  it('marks bestStance only with the Music talent [RF6]', () => {
    for (const def of MUSIC_DEFS) {
      const plain = offerOne(def, false)
      expect(
        plain.modal.choices.every((c) => c.hint === undefined),
        `${def.id} without Music`,
      ).toBe(true)
      const gifted = offerOne(def, true)
      const best = bestStance(gifted.g, gifted.s, gifted.d, def)
      const hinted = gifted.modal.choices.filter((c) => c.hint)
      expect(hinted.map((c) => c.id), def.id).toEqual([best])
      const opt = def.options[best as Stance]!
      if (opt.odds) expect(hinted[0].hint).toMatch(/Looks best: about \d+% to go well\.$/)
      else expect(hinted[0].hint).toMatch(/Looks best on average\.$/)
      // the printed percentage is the option's own odds, to the nearest 5
      if (opt.odds) {
        const p = optionOdds(gifted.g, gifted.s, gifted.d, opt)!
        expect(hinted[0].hint).toContain(`about ${Math.round(p * 20) * 5}%`)
      }
    }
  })
})

describe('music events: the effects', () => {
  /** Applies one branch the way the resolver does: the effects, then the record changes. */
  function apply(def: Def, stance: Stance, which: 'good' | 'bad', f: Fix = mk(def)) {
    const opt = def.options[stance]!
    const branch = (which === 'good' ? opt.good : opt.bad!)(f.g, f.s, f.d)
    const c = careerCtx(f.g, 'music', f.s)
    const cash = f.g.character.money
    const r = applyEffects(c, branch.fx, def.title)
    branch.then?.(f.s, f.g)
    expect(f.g.character.money - cash, `${def.id}/${stance}/${which} money`).toBe(r.earned - r.paid)
    return { ...f, branch, r, cash }
  }
  const typical = (g: GameState): number => typicalIncome(g)

  it('collab: a feature lifts you, a bad one costs a grudge, a verse pays', () => {
    const def = defOf('collab')
    const good = apply(def, 'bold', 'good')
    expect(popOf(good.g)).toBe(64)
    expect(fameOf(good.g)).toBe(43)
    expect(good.s.mods).toContainEqual({ id: 'collab', kind: 'units', mult: 1.06, until: 1996 })
    expect(good.r).toEqual({ paid: 0, earned: 0 })
    const bad = apply(def, 'bold', 'bad')
    expect(popOf(bad.g)).toBe(57)
    expect(bad.s.memory.find((m) => m.id === bad.d.id)?.grudge).toBe(8)
    const cash = apply(def, 'cash', 'good')
    expect(cash.r.earned).toBe(Math.round(0.15 * typical(cash.g) * (1 + 60 / 50)))
    expect(popOf(apply(def, 'safe', 'good').g)).toBe(60)
    // the partner is ranked 6 to 24 on the year's field
    const f = mk(def)
    const ranked = activeField(f.g, MUSIC_SPEC, f.s.memory).slice(5, 24).map((x) => x.rival.id)
    expect(ranked).toContain(f.d.id)
    expect(f.d.score).toBeGreaterThan(0)
  })

  it('festival and scandal apply the table', () => {
    const fest = defOf('festival')
    const f = mk(fest)
    const fee = Math.round(typical(f.g) * (0.3 + 60 / 100))
    expect(f.d.fee).toBe(fee)
    expect(apply(fest, 'safe', 'good').r.earned).toBe(fee)
    const big = apply(fest, 'bold', 'good')
    expect(big.r.earned).toBe(fee * 4)
    expect(fameOf(big.g)).toBe(44)
    expect(popOf(big.g)).toBe(63)
    expect(big.s.mods).toContainEqual({ id: 'festival', kind: 'fill', mult: 1.05, until: 1996 })
    const flop = apply(fest, 'bold', 'bad')
    expect(fameOf(flop.g)).toBe(39)
    expect(flop.r).toEqual({ paid: 0, earned: 0 })

    const sc = defOf('scandal')
    expect(fameOf(apply(sc, 'safe', 'good').g)).toBe(39)
    expect(fameOf(apply(sc, 'bold', 'good').g)).toBe(42)
    const lost = apply(sc, 'bold', 'bad')
    expect(fameOf(lost.g)).toBe(36)
    expect(popOf(lost.g)).toBe(55)
    const sold = apply(sc, 'cash', 'good')
    expect(sold.r.earned).toBe(Math.round(0.3 * typical(sold.g)))
    expect(fameOf(sold.g)).toBe(38)
  })

  it('clash: trust +8, +3, -6 and -12, read from the held deal', () => {
    const def = defOf('clash')
    expect(apply(def, 'safe', 'good').s.deal!.trust).toBe(63)
    expect(apply(def, 'bold', 'good').s.deal!.trust).toBe(58)
    expect(apply(def, 'bold', 'bad').s.deal!.trust).toBe(49)
    expect(apply(def, 'cash', 'good').s.deal!.trust).toBe(43)
    // the odds follow the attention of the label
    const f = mk(def)
    const p = optionOdds(f.g, f.s, f.d, def.options.bold!)!
    expect(p).toBeGreaterThanOrEqual(0.2)
    expect(p).toBeLessThanOrEqual(0.8)
    expect(f.d.dealId).toBe('d1')
  })

  it('audit: back-pay of the deal gross net of the fee, a lower balance, trust moves', () => {
    const def = defOf('audit')
    const f = mk(def)
    const fee = Math.round((4_000 * (1 + 1) * typical(f.g)) / 45_000)
    expect(f.d.fee).toBe(fee)
    expect(f.d.share).toBeGreaterThanOrEqual(0.08)
    expect(f.d.share).toBeLessThanOrEqual(0.2)
    expect(optionOdds(f.g, f.s, f.d, def.options.bold!)).toBe(0.55)
    expect(optionOdds(f.g, f.s, f.d, def.options.cash!)).toBe(0.25)
    // the deal's gross is the sum over the ledger rows of the deal
    f.s.ledger.push(row({ id: 'r2', gross: 250_000 }), row({ id: 'r3', gross: 900_000, dealId: 'other' }))
    const good = apply(def, 'bold', 'good', f)
    const back = Math.round(f.d.share * 750_000)
    expect(good.r.earned).toBe(back - fee)
    expect(good.s.deal!.trust).toBe(40)
    const bad = apply(def, 'bold', 'bad')
    expect(bad.r.paid).toBe(fee)
    expect(bad.s.deal!.trust).toBe(40)
    const nice = apply(def, 'cash', 'good')
    expect(nice.s.deal!.unrecouped).toBe(36_000)
    expect(nice.s.deal!.trust).toBe(58)
    const no = apply(def, 'cash', 'bad')
    expect(no.s.deal!.unrecouped).toBe(40_000)
    expect(no.r).toEqual({ paid: 0, earned: 0 })
    expect(apply(def, 'safe', 'good').s.deal!.trust).toBe(55)
  })
})

describe('music events: awards by country', () => {
  it('names the country ceremony, rolls the win from the nominees, and a win writes s.awards and counts', () => {
    const def = defOf('award')
    const f = mk(def, { country: 'ng', year: 2000, pop: 70, quality: 80 })
    expect(def.scene(f.g, f.s, f.d)).toContain('Naija Sound')
    expect(def.scene(f.g, f.s, f.d)).toMatch(/What will you do\?$/)
    expect(f.d).toMatchObject({ title: 'Last Hit', category: 'Album of the Year', ceremony: 'Naija Sound', quality: 80 })
    expect(f.d.nominees).toHaveLength(4)
    expect(new Set(f.d.nominees.map((n: { id: string }) => n.id)).size).toBe(4)
    const field = new Set(activeField(f.g, MUSIC_SPEC, f.s.memory).map((x) => x.rival.id))
    for (const n of f.d.nominees as { id: string; name: string; score: number }[]) expect(field.has(n.id)).toBe(true)
    // the same data again from the same seed (the cast never rerolls)
    expect(def.make(f.g, f.s, seeded('test|award'))).toEqual(f.d)
    const w = (x: number): number => Math.exp((x - 60) / 8)
    const mine = w(80)
    const p = mine / (mine + (f.d.nominees as { score: number }[]).reduce((n, x) => n + w(x.score), 0))
    const clamp = (n: number): number => Math.min(0.95, Math.max(0.05, n))
    expect(optionOdds(f.g, f.s, f.d, def.options.safe!)).toBeCloseTo(clamp(p), 10)
    expect(optionOdds(f.g, f.s, f.d, def.options.bold!)).toBeCloseTo(clamp(p + 0.08), 10)
    expect(def.options.cash!.odds).toBeUndefined()
    // a single is Record of the Year
    const single = life({ country: 'ng', year: 2000 })
    musicProfile(single.g).discography[0].type = 'Single'
    expect(def.make(single.g, single.s, seeded('x')).category).toBe('Record of the Year')

    // a win: fame +6, standing +4, pop +5, a line in s.awards and a count
    const won = structuredClone(f)
    const c = careerCtx(won.g, 'music', won.s)
    const stand = won.s.standing
    const branch = def.options.safe!.good(won.g, won.s, won.d)
    applyEffects(c, branch.fx, def.title)
    branch.then?.(won.s, won.g)
    expect(fameOf(won.g)).toBe(46)
    expect(won.s.standing).toBe(Math.min(100, stand + 4))
    expect(popOf(won.g)).toBe(75)
    expect(won.g.counters.awards).toBe(1)
    expect(won.s.awards).toHaveLength(1)
    expect(won.s.awards[0]).toBe(`"Last Hit" won the Naija Sound for Album of the Year at age ${won.g.character.age}.`)
    expect(won.s.awards[0]).not.toContain(':')
    // a loss: fame +2 and nothing written
    const lost = structuredClone(f)
    const lb = def.options.safe!.bad!(lost.g, lost.s, lost.d)
    applyEffects(careerCtx(lost.g, 'music', lost.s), lb.fx, def.title)
    lb.then?.(lost.s, lost.g)
    expect(fameOf(lost.g)).toBe(42)
    expect(lost.s.awards).toHaveLength(0)
    expect(lost.g.counters.awards).toBeUndefined()
    // campaigning costs 0.02 typical whether it works or not; skipping is free and fixed
    for (const which of ['good', 'bad'] as const) {
      const x = structuredClone(f)
      const b = (which === 'good' ? def.options.bold!.good : def.options.bold!.bad!)(x.g, x.s, x.d)
      const cash = x.g.character.money
      const r = applyEffects(careerCtx(x.g, 'music', x.s), b.fx, def.title)
      expect(r.paid).toBe(Math.round(0.02 * typicalIncome(x.g)))
      expect(x.g.character.money).toBe(cash - r.paid)
    }
    expect(def.options.cash!.good(f.g, f.s, f.d).fx).toEqual({})
  })

  it('has a ceremony in the other countries only from its year', () => {
    for (const [country, year, name] of [['us', 1959, 'Golden Record Award'], ['ca', 1970, 'Maple Disc'], ['gb', 1977, 'Silver Disc']] as const) {
      const f = mk(defOf('award'), { country, year })
      expect(defOf('award').weight(f.g, f.s), `${country} ${year}`).toBeGreaterThan(0)
      expect(f.d.ceremony).toBe(name)
      const early = life({ country, year: year - 1 })
      expect(defOf('award').weight(early.g, early.s), `${country} ${year - 1}`).toBe(0)
    }
  })

  it('writes no legacy award and no Golden Record Award notice once the sim owns the life, and an unmigrated life still does', () => {
    const hits = (adopt: boolean): { awards: number; notes: number } => {
      let awards = 0
      let notes = 0
      for (let seed = 1; seed <= 40; seed++) {
        const f = life({ seed, pop: 90, adopt, quality: 100, deal: 'none' })
        musicJob(f.g)!.data.lastRelease = f.g.character.age - 1
        yearlyMusic(f.g)
        awards += viewMusic(f.g).awards.length
        notes += notices(f.g).filter((n) => n.title === 'Golden Record Award' || n.title === 'Nominated').length
      }
      return { awards, notes }
    }
    const old = hits(false)
    expect(old.awards).toBeGreaterThan(0)
    expect(old.notes).toBeGreaterThan(0)
    expect(hits(true)).toEqual({ awards: 0, notes: 0 })
  })
})

describe('music events: the claim dispute', () => {
  it('claims are seeded and stable, with the table odds, one dispute at a time', () => {
    const { g } = life()
    const at = (i: number, o: Partial<LedgerRow> = {}): LedgerRow => row({ id: `q${i}`, year: g.year - 1, lastYear: g.year - 1, samples: 'risky', peak: 4, ...o })
    const r = at(7)
    expect(claimKind(g, r)).toBe(claimKind(g, r))
    expect(claimKind(structuredClone(g), r)).toBe(claimKind(g, r))
    const rate = (o: Partial<LedgerRow>, kind: ClaimKind, n = 2000): number => {
      let hit = 0
      for (let i = 0; i < n; i++) if (claimKind(g, at(i, o)) === kind) hit++
      return hit / n
    }
    expect(Math.abs(rate({ peak: 4 }, 'sample') - claimOdds('sample', 4))).toBeLessThan(0.04)
    expect(Math.abs(rate({ peak: 15 }, 'sample') - claimOdds('sample', 15))).toBeLessThan(0.04)
    // plagiarism needs a top-10 peak and comes after the sample draw
    expect(Math.abs(rate({ peak: 4, samples: 'original' }, 'plagiarism') - claimOdds('plagiarism', 4))).toBeLessThan(0.025)
    expect(rate({ peak: 15, samples: 'original' }, 'plagiarism', 500)).toBe(0)
    // an original release, an off-chart release and an old one draw no sample claim; this year's and a 3-year-old row nothing at all
    expect(rate({ samples: 'original' }, 'sample', 500)).toBe(0)
    expect(rate({ peak: 0 }, 'sample', 500)).toBe(0)
    expect(rate({ peak: 0 }, 'plagiarism', 500)).toBe(0)
    for (const year of [g.year, g.year - 3, g.year - 9]) {
      for (let i = 0; i < 300; i++) expect(claimKind(g, at(i, { year })), `year ${year}`).toBeNull()
    }
    for (const year of [g.year - 1, g.year - 2]) {
      let any = 0
      for (let i = 0; i < 300; i++) if (claimKind(g, at(i, { year }))) any++
      expect(any, `year ${year}`).toBeGreaterThan(0)
    }
    // amounts: 6% and 15% of the row's gross, at least 3,000 and 10,000 scaled by typical income
    expect(claimAmount(g, row({ gross: 1_000_000 }), 'sample')).toBe(60_000)
    expect(claimAmount(g, row({ gross: 1_000_000 }), 'plagiarism')).toBe(150_000)
    expect(claimAmount(g, row({ gross: 1_000 }), 'sample')).toBe(Math.round((3_000 * typicalIncome(g)) / 45_000))
    expect(claimAmount(g, row({ gross: 1_000 }), 'plagiarism')).toBe(Math.round((10_000 * typicalIncome(g)) / 45_000))
    // winOdds: the two formulas
    expect(winOdds('sample', 70, 0.5)).toBeCloseTo(0.45 + 70 / 400, 10)
    expect(winOdds('sample', 100, 0.5)).toBeCloseTo(0.7, 10)
    expect(winOdds('plagiarism', 70, 0.5)).toBeCloseTo(0.7 - 0.3 + 70 / 500, 10)
    expect(winOdds('plagiarism', 0, 0.8)).toBeCloseTo(0.22, 10)
    expect(winOdds('sample', 1000, 0)).toBe(0.95)
    expect(winOdds('plagiarism', 1000, 0)).toBe(0.85)
    expect(winOdds('sample', -1000, 0)).toBe(0.05)
    expect(winOdds('plagiarism', -1000, 1)).toBe(0.1)
  })

  it('stepDispute queues one modal for the newest claimed row, with the hint only for the talent, and never twice', () => {
    for (const talent of [false, true]) {
      const f = disputeFix({ talent })
      const older = row({ id: 'old', year: f.g.year - 2, lastYear: f.g.year - 2 })
      f.s.ledger.unshift(older)
      const c = ctxOf(f.g, f.s)
      expect(stepDispute(c)).toBe(true)
      const queued = careerChoices(f.g)
      expect(queued).toHaveLength(1)
      const m = queued[0]
      expect(m.scriptId).toBe('career.music.dispute')
      expect(m.data).toMatchObject({ rowId: f.row.id, kind: 'sample', claim: claimAmount(f.g, f.row, 'sample'), legacy: false, owner: ownerKey(f.g), year: f.g.year })
      expect(m.text).toMatch(/What will you do\?$/)
      expect(m.text).toContain((m.data as { claimant: { name: string } }).claimant.name)
      expect(m.choices.map((x) => x.label)).toEqual(['Settle', 'Fight it', 'Credit them'])
      expect(m.choices.map((x) => x.id)).toEqual(['safe', 'bold', 'cash'])
      const hinted = m.choices.filter((x) => x.hint)
      if (!talent) expect(hinted).toHaveLength(0)
      else {
        const d = m.data as unknown as DisputeData
        const best = bestStance(f.g, f.s, d, DISPUTE)
        expect(hinted.map((x) => x.id)).toEqual([best])
        expect(hinted[0].hint).toMatch(/^.{1,4}Looks best( on average\.|: about \d+% to go well\.)$/)
      }
      // the claimant is a named rival of the field, picked from a seeded key (stable)
      const claimant = (m.data as unknown as DisputeData).claimant
      expect(activeField(f.g, MUSIC_SPEC, f.s.memory).some((x) => x.rival.id === claimant.id)).toBe(true)
      // one dispute at a time, and the budget is spent
      expect(stepDispute(ctxOf(f.g, f.s))).toBe(false)
      expect(careerChoices(f.g)).toHaveLength(1)
    }
  })

  it('queues nothing without a claim, for a row already answered, or with no room', () => {
    const f = life()
    expect(stepDispute(ctxOf(f.g, f.s))).toBe(false)
    const d = disputeFix()
    d.s.done.push(`dispute.${d.row.id}`)
    expect(stepDispute(ctxOf(d.g, d.s))).toBe(false)
    const e = disputeFix()
    const c = ctxOf(e.g, e.s)
    c.budget.choices = 0
    expect(stepDispute(c)).toBe(false)
    expect(careerChoices(e.g)).toHaveLength(0)
  })

  it('the dispute pays and rolls as printed [RF5]', () => {
    const fx = disputeFix()
    const { claim } = fx.d
    const script = 'career.music.dispute'
    expect(fx.d.kind).toBe('sample')
    expect(optionOdds(fx.g, fx.s, fx.d, DISPUTE.options.bold!)).toBeCloseTo(winOdds('sample', 70, 0.5), 10)
    // Settle pays the claim exactly and nothing else
    const a = structuredClone(fx)
    const cash = a.g.character.money
    fire(a.g, script, 'safe', disputeData(a.g, a.d))
    expect(a.g.character.money).toBe(cash - claim)
    expect(musicStore.peek(a.g)!.done).toContain(`dispute.${a.row.id}`)
    expect(notices(a.g)).toHaveLength(1)
    // Fight it: a win pays 10% of the claim, a loss 1.8 times, and a loss adds a grudge of 10
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const b = structuredClone(fx)
      b.g.rng = seed
      const before = b.g.character.money
      fire(b.g, script, 'bold', disputeData(b.g, b.d))
      const paid = before - b.g.character.money
      const grudge = musicStore.peek(b.g)!.memory.find((m) => m.id === b.d.claimant.id)?.grudge ?? 0
      if (paid === Math.round(0.1 * claim)) {
        seen.add('win')
        expect(grudge).toBe(0)
      } else {
        expect(paid).toBe(Math.round(1.8 * claim))
        expect(grudge).toBe(10)
        seen.add('loss')
      }
    }
    expect([...seen].sort()).toEqual(['loss', 'win'])
    // Credit them lowers the row's rate by 15% and moves no cash
    const k = structuredClone(fx)
    const cash2 = k.g.character.money
    fire(k.g, script, 'cash', disputeData(k.g, k.d))
    expect(k.g.character.money).toBe(cash2)
    const rowAfter = musicStore.peek(k.g)!.ledger.find((r) => r.id === k.row.id)!
    expect(rowAfter.rate).toBeCloseTo(0.16 * 0.85, 3)
    // a legacy row offers no Credit them, and the script refuses it without burning the claim
    const l = disputeFix({ legacyRow: true })
    expect(stepDispute(ctxOf(l.g, l.s))).toBe(true)
    const legacyModal = careerChoices(l.g)[0]
    expect(legacyModal.choices.map((x) => x.id)).toEqual(['safe', 'bold'])
    const before = snap(l.g)
    fire(l.g, script, 'cash', legacyModal.data as Json)
    expect(snap(l.g)).toBe(before)
    expect(musicStore.peek(l.g)!.done).not.toContain(`dispute.${l.row.id}`)
    // the legacy row's rate is never touched, by any stance
    fire(l.g, script, 'safe', legacyModal.data as Json)
    expect(musicStore.peek(l.g)!.ledger.find((r) => r.id === l.row.id)!.rate).toBe(0.16)
  })

  it('a claimant who cannot be named takes no grudge', () => {
    const fx = disputeFix()
    const d: DisputeData = { ...fx.d, claimant: { id: '', name: 'A songwriter' } }
    for (let seed = 1; seed <= 20; seed++) {
      const c = structuredClone(fx)
      c.g.rng = seed
      fire(c.g, 'career.music.dispute', 'bold', disputeData(c.g, d))
      expect(musicStore.peek(c.g)!.memory.filter((m) => m.grudge > 0)).toHaveLength(0)
    }
  })
})

describe('music events: one popup a year', () => {
  const yearOf = (g: GameState): void => nextYear(g, (x) => {
    yearlyMusic(x)
    musicSim.yearly(x)
  })

  it('offers at most one popup a year: a due renewal takes the slot, the dispute waits a year, the crisis stays out [RF3]', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { g, s } = life({ seed, pop: 60, fame: 40 })
      // the renewal is due this tick, a claimed row came out this year, and every def is eligible
      s.deal!.years = 1
      s.deal!.term = 3
      const claimed = claimedRow(g, { year: g.year, lastYear: g.year }, g.year + 1)
      s.ledger.push(claimed)
      musicProfile(g).discography.push({ title: 'Fresh', type: 'Studio Album', genre: 'Pop', subgenre: 'Dance', age: g.character.age, sold: 1, earned: 1, cert: null, quality: 70, royalty: 0 })
      musicJob(g)!.data.lastRelease = g.character.age
      yearOf(g)
      const first = careerChoices(g)
      expect(first.map((m) => m.scriptId), `seed ${seed}`).toEqual(['career.music.deal'])
      expect(musicStore.peek(g)!.done).not.toContain(`dispute.${claimed.id}`)
      // answer the renewal, then the dispute is offered and no crisis is
      const renew = first[0]
      g.queue = g.queue.filter((m) => m !== renew)
      runScript(g, renew.scriptId!, 'sign', renew.data, renew)
      expect(musicStore.peek(g)!.deal!.years).toBeGreaterThan(1)
      g.queue = []
      yearOf(g)
      const second = careerChoices(g)
      expect(second.map((m) => m.scriptId), `seed ${seed} next year`).toEqual(['career.music.dispute'])
    }
  }, 60_000)

  it('offers no event on the adoption tick, which is the legacy year in full', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { g } = life({ seed, adopt: false, deal: 'none', pop: 70 })
      // every def is eligible on the next tick, and the sim has not met this life yet
      const old = structuredClone(g)
      for (const x of [g, old]) {
        x.year += 1
        x.character.age += 1
        x.yearActions = {}
        yearlyMusic(x)
      }
      musicSim.yearly(g)
      expect(musicStore.peek(g)!.migrated, `seed ${seed}`).toBe(true)
      expect(g.rng, `seed ${seed}`).toBe(old.rng)
      expect(careerChoices(g)).toHaveLength(careerChoices(old).length)
    }
  })

  it('the generic crisis still comes when nothing else wants the slot', () => {
    let crises = 0
    for (let seed = 1; seed <= 40; seed++) {
      const { g, s } = life({ seed })
      s.deal!.years = 3
      s.deal!.term = 5
      yearOf(g)
      const offered = careerChoices(g)
      expect(offered.length).toBeLessThanOrEqual(1)
      for (const m of offered) {
        expect(MUSIC_DEFS.map((d) => `career.music.${d.id}`)).toContain(m.scriptId)
        crises++
      }
    }
    expect(crises).toBeGreaterThan(0)
  }, 60_000)
})

describe('music events: voice', () => {
  const r = { paid: 12_345, earned: 54_321 }

  it('keeps every string in voice', () => {
    for (const def of MUSIC_DEFS) {
      const f = mk(def)
      const scene = def.scene(f.g, f.s, f.d)
      expect(scene.length, `${def.id} scene`).toBeLessThanOrEqual(140)
      expect(scene).toMatch(/What will you do\?$/)
      expect(voiceProblems(scene, 'scene'), `${def.id} scene`).toEqual([])
      expect(voiceProblems(def.title, 'title'), `${def.id} title`).toEqual([])
      for (const stance of STANCES) {
        const opt = def.options[stance]
        if (!opt) continue
        expect(opt.label.split(/\s+/).length, `${def.id}/${stance} label`).toBeLessThanOrEqual(5)
        expect(opt.label).not.toMatch(/[\u2013\u2014]/)
        for (const branch of [opt.good(f.g, f.s, f.d), opt.bad?.(f.g, f.s, f.d), opt.good(f.g, f.s, { ...f.d, dealId: 'x' }), opt.bad?.(f.g, f.s, { ...f.d, dealId: 'x' })]) {
          if (!branch) continue
          const text = branch.text(r)
          expect(text.length, `${def.id}/${stance} ${text}`).toBeLessThanOrEqual(120)
          expect(text).not.toMatch(/[\u2013\u2014]/)
          expect(text).not.toContain('undefined')
          expect(voiceProblems(text, 'outcome'), `${def.id}/${stance} ${text}`).toEqual([])
        }
      }
    }
    // the dispute, for both kinds
    for (const kind of ['sample', 'plagiarism'] as const) {
      const fx = disputeFix()
      const d: DisputeData = { ...fx.d, kind }
      const scene = DISPUTE.scene(fx.g, fx.s, d)
      expect(scene.length).toBeLessThanOrEqual(140)
      expect(scene).toMatch(/What will you do\?$/)
      expect(voiceProblems(scene, 'scene')).toEqual([])
      for (const stance of STANCES) {
        const opt = DISPUTE.options[stance]!
        expect(opt.label.split(/\s+/).length).toBeLessThanOrEqual(5)
        for (const branch of [opt.good(fx.g, fx.s, d), opt.bad?.(fx.g, fx.s, d)]) {
          if (!branch) continue
          const text = branch.text(r)
          expect(text.length, text).toBeLessThanOrEqual(120)
          expect(voiceProblems(text, 'outcome'), text).toEqual([])
        }
      }
    }
  })
})
