// Music 2.0, Task 5: the negotiated label deal. The roster by year and country, the offer and its push roll
// (one function, `pushOdds`, rolled and hinted), the advance paid once a year through the ledger, the
// renewal, the exits, the grandfathered legacy deal and the Release Plan. A replayed modal, a stale deal or
// another owner's modal changes nothing.
import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire } from '../src/game/special/common'
import { yearlyCareerSims } from '../src/game/special/kit/careers'
import { appointmentId } from '../src/game/special/kit/state'
import { YEARLY_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import { musicJobNodes, yearlyMusic } from '../src/game/special/music'
import { LABEL_ROSTER, claimOdds, labelId } from '../src/game/special/music-data'
import { md, mdView, musicJob } from '../src/game/special/music-job'
import {
  attentionOf,
  baseRoyalty,
  cooled,
  endDeal,
  labelNamed,
  labelsAt,
  offerDeal,
  planRow,
  pushOdds,
  stepDeal,
  type DealOffer,
} from '../src/game/special/music-label'
import { formatMix, stepCatalogue, waterfall } from '../src/game/special/music-market'
import { musicSim } from '../src/game/special/music-sim'
import { adoptMusic, musicStore, type LedgerRow, type MusicState } from '../src/game/special/music-state'
import type { ChoiceModal, GameState, Json, MenuAction, NoticeModal } from '../src/game/types'
import { rand, randInt } from '../src/game/rng'
import { assertMenuPure, checkLedger, drainCareer, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

const SOLO = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: 40, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }
const LEGACY_SOLO = { ...SOLO, label: 'Garage Door Records', contractYears: 3, advancePerYear: 10_000, popularity: 30 }
const NAMES = ['Garage Door Records', 'Echo Chamber Records', 'Velvet Records', 'Meridian Sound Group']

type Offered = DealOffer & { owner: string; year: number }

/** A 1995 US life with a guitar and cash, no job and no record. */
function life(seed: number, o: { year?: number; country?: string; talent?: boolean; fame?: number } = {}): GameState {
  const g = makeTestGame(seed, { age: 30 })
  g.year = o.year ?? 1995
  if (o.country) g.character.countryId = o.country
  g.character.money = 1_000_000
  g.character.hidden.fame = o.fame ?? 0
  g.flags.instruments = { Guitar: 60 }
  if (o.talent) g.character.talent = 'Music'
  return g
}

/** A life with an unsigned solo job (popularity as given). */
function soloLife(seed: number, o: { popularity?: number; talent?: boolean; fame?: number } = {}): GameState {
  const g = life(seed, o)
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Independent', salary: 0, data: { ...SOLO, popularity: o.popularity ?? 40 } as Record<string, Json> })
  return g
}

const dealModals = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.deal')
const dataOf = (m: ChoiceModal): Offered => m.data as unknown as Offered
const notices = (g: GameState, title?: string): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))

type OfferArg = Parameters<typeof offerDeal>[1]

/** Offers a deal of a tier through offerDeal and returns the queued negotiation modal. */
function offerOf(g: GameState, tier: 0 | 1 | 2 | 3, o: Partial<OfferArg> = {}): ChoiceModal {
  const label = NAMES[tier]
  const ok = offerDeal(g, { instrument: 'Guitar', labelId: labelId(label), label, tier, genre: 'Rock', advance: 90_000, years: 3, goingSolo: false, ...o })
  expect(ok).toBe(true)
  const modal = dealModals(g).at(-1)
  expect(modal).toBeDefined()
  return modal!
}

/** Answers a queued modal the way the store does: it leaves the queue, then its script runs. */
function answer(g: GameState, modal: ChoiceModal, choice: string): void {
  g.queue = g.queue.filter((m) => m !== modal)
  runScript(g, modal.scriptId!, choice, modal.data, modal)
}

/** A solo life that signed a tier-1 deal (3 years, $30,000 a year) through the negotiation. */
function signed(seed: number, tier: 0 | 1 | 2 | 3 = 1, o: Partial<OfferArg> = {}): GameState {
  const g = life(seed)
  answer(g, offerOf(g, tier, o), 'sign')
  return g
}

const sOf = (g: GameState): MusicState => musicStore.peek(g)!
/** The state as JSON without the engine's own record of resolved modals, which every runScript call extends. */
const snap = (g: GameState): string => JSON.stringify({ ...g, flags: Object.fromEntries(Object.entries(g.flags).filter(([k]) => k !== 'core.resolvedScriptModals')) })
const ctxY = (g: GameState): CareerCtx<MusicState> => careerCtx(g, 'music', musicStore.mut(g), { ...YEARLY_BUDGET })
const yearOf = (g: GameState): void => nextYear(g, (x) => {
  yearlyMusic(x)
  musicSim.yearly(x)
})

function row(o: Partial<LedgerRow> = {}): LedgerRow {
  return { id: 'r1', title: 'Old Hit', type: 'studio', year: 1995, fmt: 'cd', units0: 100_000, k: 0.4, pay: 1, quality: 60, peak: 0, dealId: '', label: '', rate: 0.16, members: 1, samples: 'original', gross: 0, paid: 0, lastLabel: 0, lastYear: 1995, adopted: false, legacy: false, ...o }
}

describe('the label roster', () => {
  it('lists the roster by year and country with a tier-0 floor', () => {
    const names = (year: number, country: string, city = 'Austin') => labelsAt(year, country, city).map((l) => l.name)
    expect(names(1930, 'us')).toEqual(expect.arrayContaining(['Velvet Records', 'Meridian Sound Group', 'Austin Records']))
    expect(names(1930, 'us')).not.toContain('Garage Door Records')
    expect(names(1964, 'us')).not.toContain('Garage Door Records')
    expect(names(1965, 'us')).toContain('Garage Door Records')
    expect(names(1900, 'gb')).toContain('Crown & Anchor Music Group')
    expect(names(1900, 'us')).not.toContain('Crown & Anchor Music Group')
    expect(names(1960, 'jp')).toContain('Pacific Rim Music Co')
    expect(names(1950, 'jp')).not.toContain('Pacific Rim Music Co')
    expect(names(1960, 'us')).not.toContain('Pacific Rim Music Co')
    expect(labelsAt(1899, 'xx', 'Y')).toEqual([{ id: 'y-records', name: 'Y Records', tier: 0 }])
    for (const country of ['us', 'ng', 'jp', 'br']) for (let y = 1900; y <= 2026; y++) expect(labelsAt(y, country, 'Lagos').some((l) => l.tier === 0), `${country} ${y}`).toBe(true)
    // tiers ascend, the floor leads tier 0, and the roster keeps its order inside a tier
    const list = labelsAt(2026, 'us', 'Austin')
    expect(list.map((l) => l.tier)).toEqual([...list.map((l) => l.tier)].sort((a, b) => a - b))
    expect(list[0]).toEqual({ id: 'austin-records', name: 'Austin Records', tier: 0 })
    expect(list.at(-1)?.name).toBe('Meridian Sound Group')
    expect(list.map((l) => l.id)).toEqual(list.map((l) => labelId(l.name)))
  })

  it('resolves a label by name in any year and country, else the local floor, else null', () => {
    expect(labelNamed('Velvet Records', 'Austin')).toEqual({ id: 'velvet-records', name: 'Velvet Records', tier: 2 })
    expect(labelNamed('Crown & Anchor Music Group', 'Austin')?.tier).toBe(3)
    expect(labelNamed('Austin Records', 'Austin')).toEqual({ id: 'austin-records', name: 'Austin Records', tier: 0 })
    expect(labelNamed('Dallas Records', 'Austin')).toBeNull()
    expect(labelNamed('Nope', 'Austin')).toBeNull()
    expect(baseRoyalty(0)).toBeCloseTo(0.144, 6)
    expect(baseRoyalty(1)).toBeCloseTo(0.16, 6)
    expect(baseRoyalty(3)).toBeCloseTo(0.2, 6)
    expect(LABEL_ROSTER.length).toBe(9)
  })
})

describe('the negotiation', () => {
  it('rolls the pushOdds it hints, over 1500 seeds [RF6]', () => {
    const g = soloLife(7, { popularity: 45, talent: true, fame: 20 })
    const p = pushOdds(g, 1)
    expect(p).toBeCloseTo(0.3 + (45 + 0.5 * 20 - 52) / 80, 6)
    const modal = offerOf(g, 1)
    const push = modal.choices.find((c) => c.id === 'push')!
    expect(push.hint).toContain(`About ${Math.round(100 * p)}% to land`)
    let hits = 0
    for (let seed = 1; seed <= 1500; seed++) {
      const c = structuredClone(g)
      c.rng = seed
      answer(c, dealModals(c)[0], 'push')
      if (dealModals(c).some((m) => dataOf(m).pushed === true)) hits++
    }
    expect(Math.abs(hits / 1500 - p)).toBeLessThan(0.045)
    // no talent, no hint
    const plain = soloLife(7, { popularity: 45, fame: 20 })
    expect(offerOf(plain, 1).choices.find((c) => c.id === 'push')!.hint).toBeUndefined()
  }, 120_000)

  it('keeps pushOdds inside .10 and .85 and orders it by leverage', () => {
    const weak = soloLife(1, { popularity: 0 })
    const strong = soloLife(1, { popularity: 100, fame: 100 })
    const middle = soloLife(1, { popularity: 60, fame: 20 })
    for (const tier of [0, 1, 2, 3]) {
      expect(pushOdds(weak, tier)).toBe(0.1)
      expect(pushOdds(strong, tier)).toBe(0.85)
    }
    expect(pushOdds(middle, 0)).toBeCloseTo(0.675, 6)
    expect(pushOdds(middle, 3)).toBeCloseTo(0.225, 6)
    expect(pushOdds(life(1), 1)).toBe(0.1)
  })

  it('a hit adds .03 royalty once and drops the push option; a miss withdraws and cools two years; walk cools three', () => {
    const g = soloLife(11, { popularity: 60, fame: 40 })
    const base = offerOf(g, 1)
    const royalty = dataOf(base).royalty
    expect(base.choices.map((c) => c.id)).toEqual(['sign', 'push', 'walk'])
    let hit: GameState | null = null
    let miss: GameState | null = null
    for (let seed = 1; seed <= 200 && (!hit || !miss); seed++) {
      const c = structuredClone(g)
      c.rng = seed
      answer(c, dealModals(c)[0], 'push')
      if (dealModals(c).some((m) => dataOf(m).pushed === true)) hit ??= c
      else miss ??= c
    }
    expect(hit && miss).toBeTruthy()
    const again = dealModals(hit!)[0]
    expect(dataOf(again).royalty).toBeCloseTo(royalty + 0.03, 6)
    expect(dataOf(again).offerId).toBe(dataOf(base).offerId)
    expect(again.choices.map((c) => c.id)).toEqual(['sign', 'walk'])
    expect(notices(hit!).some((n) => /moved up to/.test(n.text))).toBe(true)
    // the second offer can be signed at the pushed royalty, once
    answer(hit!, again, 'sign')
    expect(sOf(hit!).deal?.royalty).toBeCloseTo(royalty + 0.03, 6)
    // a miss: the offer is withdrawn and the label cools for two years (this year and next)
    const s = sOf(miss!)
    expect(dealModals(miss!)).toHaveLength(0)
    expect(notices(miss!).some((n) => /withdrew the offer/.test(n.text))).toBe(true)
    expect(cooled(s, labelId('Echo Chamber Records'), miss!.year)).toBe(true)
    expect(cooled(s, labelId('Echo Chamber Records'), miss!.year + 1)).toBe(true)
    expect(cooled(s, labelId('Echo Chamber Records'), miss!.year + 2)).toBe(false)
    // walk cools three
    const w = soloLife(11)
    answer(w, offerOf(w, 1), 'walk')
    expect(cooled(sOf(w), 'echo-chamber-records', w.year + 2)).toBe(true)
    expect(cooled(sOf(w), 'echo-chamber-records', w.year + 3)).toBe(false)
    expect(sOf(w).deal).toBeNull()
    expect(musicJob(w)?.title).toBe('Solo Artist')
  })

  it('chooseLabel hides a cooled label', () => {
    const g = life(5)
    answer(g, offerOf(g, 1), 'walk')
    runScript(g, 'special.music.soloInstrument', 'Guitar', undefined, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'special.music.label')!
    expect(modal).toBeDefined()
    const ids = modal.choices.map((c) => c.id)
    expect(ids).not.toContain('Echo Chamber Records')
    expect(ids).toContain('Big Noise Music')
    expect(ids).toContain('Chicago Records')
    expect(ids).toContain('Meridian Sound Group')
    expect(ids).toContain('cancel')
    // the four-star major is marked with its tier
    expect(modal.choices.find((c) => c.id === 'Meridian Sound Group')!.label).toContain('\u{2B50}'.repeat(4))
  })

  it('chooseLabel lists only the labels open in the year and country [RF7]', () => {
    const idsOf = (year: number, country: string): string[] => {
      const g = life(5, { year, country })
      runScript(g, 'special.music.soloInstrument', 'Guitar', undefined, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
      return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'special.music.label').flatMap((m) => m.choices.map((c) => c.id))
    }
    const old = idsOf(1930, 'us')
    expect(old).toEqual(expect.arrayContaining(['Chicago Records', 'Velvet Records', 'Meridian Sound Group', 'cancel']))
    for (const name of ['Garage Door Records', 'Indigo Basement Music', 'Echo Chamber Records', 'Big Noise Music', 'Platinum Peak Entertainment', 'Crown & Anchor Music Group', 'Pacific Rim Music Co']) expect(old, name).not.toContain(name)
    expect(idsOf(1995, 'gb')).toContain('Crown & Anchor Music Group')
    expect(idsOf(1995, 'gb')).not.toContain('Meridian Sound Group')
    expect(idsOf(1899, 'us')).toEqual(['Chicago Records', 'cancel'])
  })

  it('an audition for a tier-3 major offers the 750,000 table, capped at 1,500,000 a deal', () => {
    let seen = 0
    for (let seed = 1; seed <= 30 && seen < 3; seed++) {
      const g = life(seed, { fame: 60 })
      g.flags.instruments = { Guitar: 100 }
      runScript(g, 'special.music.label', 'Meridian Sound Group', { instrument: 'Guitar', goingSolo: false } as Json, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
      const modal = dealModals(g)[0]
      if (!modal) continue
      seen++
      const o = dataOf(modal)
      expect(o).toMatchObject({ tier: 3, label: 'Meridian Sound Group', labelId: 'meridian-sound-group', pushed: false, renew: false, dealId: '', carry: 0 })
      expect(o.royalty).toBeCloseTo(baseRoyalty(3), 6)
      expect(o.advance).toBe(1_500_000)
      expect(o.years).toBeGreaterThanOrEqual(2)
      expect(o.years).toBeLessThanOrEqual(4)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('sign writes the deal and the job mirror, and a replay changes nothing [RF3]', () => {
    for (const tier of [0, 1, 2, 3] as const) {
      const g = life(20 + tier)
      const modal = offerOf(g, tier, { advance: 90_000, years: 3 })
      const o = dataOf(modal)
      expect(o.royalty).toBeCloseTo(baseRoyalty(tier), 6)
      expect(o.royalty).toBeCloseTo(0.16 * [0.9, 1, 1.12, 1.25][tier], 3)
      expect(o.advance).toBeLessThanOrEqual(1_500_000)
      answer(g, modal, 'sign')
      const s = sOf(g)
      const job = musicJob(g)!
      expect(s.deal).toMatchObject({ labelId: labelId(NAMES[tier]), label: NAMES[tier], tier, since: 1995, term: 3, years: 3, advance: 90_000, perYear: 30_000, unrecouped: 0, trust: 55, legacy: false, renewals: 0 })
      expect(s.deal!.royalty).toBeCloseTo(baseRoyalty(tier), 6)
      expect(s.deal!.appt).toBe(appointmentId(job))
      expect(s.migrated).toBe(true)
      expect(mdView(job)).toMatchObject({ mode: 'solo', label: NAMES[tier], contractYears: 3, advancePerYear: 0, genre: 'Rock', instrument: 'Guitar' })
      expect(job.salary).toBe(30_000)
      expect(job.company).toBe(NAMES[tier])
      expect(notices(g, 'Record Deal').at(-1)?.text).toContain('3 years')
      // a replay under a fresh modal id (the resolved-modal guard cannot help) changes nothing
      const json = snap(g)
      const rng = g.rng
      runScript(g, 'career.music.deal', 'sign', modal.data, { ...modal, id: 'again' })
      expect(snap(g)).toBe(json)
      expect(g.rng).toBe(rng)
    }
  })

  it('ignores a renewal whose deal is gone, a modal of another owner and a modal with no record [RF3]', () => {
    const g = signed(31)
    const stale = { ...dataOf(offerOf(g, 1)), renew: true, dealId: sOf(g).deal!.id }
    g.queue = []
    ;(musicJobNodes(g).find((n) => n.id === 'music.quit') as MenuAction).run(g)
    expect(sOf(g).deal).toBeNull()
    g.queue = []
    const json = snap(g)
    const rng = g.rng
    runScript(g, 'career.music.deal', 'sign', stale as unknown as Json, { kind: 'choice', id: 'old', title: 't', text: 't', choices: [], source: 'script', scriptId: 'career.music.deal' } as ChoiceModal)
    expect(snap(g)).toBe(json)
    expect(g.rng).toBe(rng)
    // a modal answered a year late
    const late = life(36)
    const lateModal = offerOf(late, 1)
    late.year += 1
    const beforeLate = snap(late)
    runScript(late, 'career.music.deal', 'sign', lateModal.data, { ...lateModal, id: 'late' })
    expect(snap(late)).toBe(beforeLate)
    expect(late.character.job).toBeNull()
    // another owner
    const h = life(32)
    const m = offerOf(h, 1)
    const foreign = { ...dataOf(m), owner: 'v2:9:somebody-else' }
    const before = snap(h)
    runScript(h, 'career.music.deal', 'sign', foreign as unknown as Json, { ...m, id: 'foreign' })
    expect(snap(h)).toBe(before)
    // no record at all: a stale modal creates none
    const bare = life(33)
    runScript(bare, 'career.music.deal', 'sign', { ...dataOf(m), owner: 'x' } as unknown as Json, { ...m, id: 'bare' })
    expect(musicStore.has(bare)).toBe(false)
    expect(bare.character.job).toBeNull()
  })

  it('signing over a deal of a replaced job closes the old one with a history row', () => {
    const g = signed(34)
    const old = sOf(g).deal!
    // the job was replaced without the deal being closed
    g.character.job = null
    answer(g, offerOf(g, 2), 'sign')
    const s = sOf(g)
    expect(s.history).toHaveLength(1)
    expect(s.history[0]).toMatchObject({ label: old.label, ended: 'expired' })
    expect(s.deal).toMatchObject({ tier: 2, label: 'Velvet Records', unrecouped: 0 })
    expect(s.deal!.id).not.toBe(old.id)
  })

  it('signing from a band keeps the one job and goes solo', () => {
    const g = life(35)
    hire(g, { defId: 'musician', title: 'Guitarist', company: 'The Neon Wolves', salary: 4_000, data: { ...SOLO, mode: 'band', bandName: 'The Neon Wolves', members: 3, popularity: 50 } as Record<string, Json> })
    const modal = offerOf(g, 1, { goingSolo: true })
    answer(g, modal, 'sign')
    expect(musicJob(g)?.title).toBe('Solo Artist')
    expect(mdView(musicJob(g)!)).toMatchObject({ mode: 'solo', members: 1, label: 'Echo Chamber Records', contractYears: 3, advancePerYear: 0, popularity: 50 })
    expect(sOf(g).deal?.label).toBe('Echo Chamber Records')
    expect(g.character.memories.some((x) => x.includes('Went solo with Echo Chamber Records'))).toBe(true)
  })
})

describe('the deal year', () => {
  it('pays the advance once a year through c.earn and unrecouped follows [RF5]', () => {
    const g = signed(41)
    md(musicJob(g)!).popularity = 90
    g.queue = []
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    try {
      for (let y = 1; y <= 3; y++) {
        const before = g.character.money
        yearOf(g)
        expect(g.character.money - before, `year ${y}`).toBe(30_000)
        expect(sOf(g).deal?.unrecouped).toBe(30_000 * y)
        expect(sOf(g).deal?.years).toBe(3 - y)
        expect(mdView(musicJob(g)!).contractYears).toBe(3 - y)
        // a second hook call in the same tick pays nothing
        const json = JSON.stringify(g)
        const rng = g.rng
        yearlyCareerSims(g)
        expect(JSON.stringify(g)).toBe(json)
        expect(g.rng).toBe(rng)
        g.queue = g.queue.filter((m) => m.kind === 'choice')
      }
    } finally {
      setCareerAudit(null)
    }
    expect(checkLedger(events, g)).toEqual([])
    expect(events.filter((e) => e.t === 'earn' && e.label === 'Label advance')).toHaveLength(3)
    // the third tick opened the renewal
    expect(dealModals(g)).toHaveLength(1)
    expect(dataOf(dealModals(g)[0])).toMatchObject({ renew: true, dealId: sOf(g).deal!.id })
  })

  it('a legacy deal keeps its salary, adds nothing to unrecouped and never pays twice [RF2]', () => {
    const g = makeTestGame(3, { age: 25 })
    g.year = 2026
    g.flags.instruments = { Guitar: 55 }
    g.character.money = 100_000
    hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...LEGACY_SOLO, popularity: 80 } as Record<string, Json> })
    adoptMusic(g, musicStore.mut(g))
    expect(sOf(g).deal).toMatchObject({ id: 'legacy', legacy: true, royalty: 1, years: 3, perYear: 10_000 })
    for (let y = 1; y <= 3; y++) {
      const before = g.character.money
      yearOf(g)
      expect(g.character.money - before, `year ${y}`).toBe(10_000)
      expect(sOf(g).deal?.unrecouped).toBe(0)
      expect(sOf(g).deal?.years).toBe(3 - y)
      expect(mdView(musicJob(g)!).contractYears).toBe(3 - y)
      expect(mdView(musicJob(g)!).advancePerYear).toBe(10_000)
    }
    // at years 0 the renewal opens with nothing carried and the base royalty plus .02
    const modal = dealModals(g)[0]
    expect(modal).toBeDefined()
    expect(dataOf(modal)).toMatchObject({ renew: true, dealId: 'legacy', carry: 0, tier: 0, pushed: false })
    expect(dataOf(modal).royalty).toBeCloseTo(baseRoyalty(0) + 0.02, 3)
    // signing it makes a ledger deal with a fresh id and the carried nothing
    answer(g, modal, 'sign')
    const deal = sOf(g).deal!
    expect(deal).toMatchObject({ legacy: false, unrecouped: 0, renewals: 1 })
    expect(deal.id).not.toBe('legacy')
    expect(deal.royalty).toBeCloseTo(baseRoyalty(0) + 0.02, 3)
    expect(mdView(musicJob(g)!)).toMatchObject({ contractYears: deal.years, advancePerYear: 0 })
    expect(musicJob(g)!.salary).toBe(deal.perYear)
  })

  it('a labelled legacy life through the real yearly hook pays its three advances once each across the adoption tick [RF2]', () => {
    const g = makeTestGame(3, { age: 25 })
    g.year = 2026
    g.flags.instruments = { Guitar: 55 }
    g.character.money = 100_000
    hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...LEGACY_SOLO, popularity: 80 } as Record<string, Json> })
    expect(musicStore.has(g)).toBe(false)
    const start = g.character.money
    for (let y = 1; y <= 3; y++) {
      const before = g.character.money
      nextYear(g, yearlySpecial)
      expect(g.character.money - before, `year ${y}`).toBe(10_000)
      // the first tick is the legacy hook's whole year; the sim adopts and takes over from the second
      expect(sOf(g).migrated).toBe(true)
      expect(mdView(musicJob(g)!).contractYears).toBe(3 - y)
    }
    expect(g.character.money - start).toBe(30_000)
    expect(sOf(g).deal).toMatchObject({ legacy: true, years: 0, unrecouped: 0 })
    expect(dealModals(g)).toHaveLength(1)
    // no fourth payment while the renewal waits
    const before = g.character.money
    g.queue = g.queue.filter((m) => m.kind !== 'choice')
    nextYear(g, yearlySpecial)
    expect(g.character.money).toBe(before)
  })

  it('renews with half of the balance, +.02 when clear, capped at .40 [RF3]', () => {
    const open = (unrecouped: number, royalty?: number) => {
      const g = signed(51)
      const job = musicJob(g)!
      md(job).popularity = 80
      md(job).contractYears = 0
      const s = musicStore.mut(g)
      s.deal!.years = 0
      s.deal!.unrecouped = unrecouped
      if (royalty !== undefined) s.deal!.royalty = royalty
      g.queue = []
      const probe = structuredClone(g)
      stepDeal(ctxY(g))
      return { g, probe }
    }
    const { g, probe } = open(40_000)
    const modal = dealModals(g)[0]
    expect(dealModals(g)).toHaveLength(1)
    const years = randInt(probe, 2, 4)
    const advance = Math.round((80 ** 2 * 60 * years * (0.7 + rand(probe) * 0.6)) / 1_000) * 1_000
    expect(dataOf(modal)).toMatchObject({ renew: true, years, advance: Math.min(1_500_000, advance), carry: 20_000, pushed: false, tier: 1, goingSolo: false, instrument: 'Guitar', genre: 'Rock' })
    expect(dataOf(modal).royalty).toBeCloseTo(0.16, 6)
    expect(dataOf(modal).dealId).toBe(sOf(g).deal!.id)
    // the deal itself changes only when the player signs
    expect(sOf(g).deal).toMatchObject({ years: 0, unrecouped: 40_000, renewals: 0 })
    answer(g, modal, 'sign')
    expect(sOf(g).deal).toMatchObject({ years, term: years, advance: Math.min(1_500_000, advance), unrecouped: 20_000, renewals: 1, legacy: false })
    expect(sOf(g).deal!.perYear).toBe(Math.round(Math.min(1_500_000, advance) / years))
    expect(sOf(g).deal!.royalty).toBeCloseTo(0.16, 6)
    expect(mdView(musicJob(g)!)).toMatchObject({ contractYears: years, advancePerYear: 0 })
    expect(musicJob(g)!.salary).toBe(sOf(g).deal!.perYear)
    // nothing owed: +.02, and the cap holds
    const clear = open(0)
    expect(dataOf(dealModals(clear.g)[0]).royalty).toBeCloseTo(0.18, 6)
    expect(dataOf(dealModals(clear.g)[0]).carry).toBe(0)
    const capped = open(0, 0.39)
    expect(dataOf(dealModals(capped.g)[0]).royalty).toBeCloseTo(0.4, 6)
    // a second tick with the modal still queued opens no second one
    stepDeal(ctxY(clear.g))
    expect(dealModals(clear.g)).toHaveLength(1)
  })

  it('drops under popularity 35 or trust 25 and writes a dropped history row', () => {
    for (const [popularity, trust] of [[34, 55], [80, 24]]) {
      const g = signed(52)
      const job = musicJob(g)!
      md(job).popularity = popularity
      const s = musicStore.mut(g)
      s.deal!.years = 0
      s.deal!.trust = trust
      s.deal!.unrecouped = 12_000
      g.queue = []
      stepDeal(ctxY(g))
      expect(g.character.job).toBeNull()
      expect(dealModals(g)).toHaveLength(0)
      expect(sOf(g).deal).toBeNull()
      expect(sOf(g).history.at(-1)).toMatchObject({ label: 'Echo Chamber Records', ended: 'dropped', forgiven: 12_000 })
      expect(notices(g).some((n) => n.text.includes("didn't renew you"))).toBe(true)
      expect(g.character.careerHistory.at(-1)?.reason).toBe('fired')
    }
    // exactly at the line it renews
    const g = signed(52)
    md(musicJob(g)!).popularity = 35
    const s = musicStore.mut(g)
    s.deal!.years = 0
    s.deal!.trust = 25
    g.queue = []
    stepDeal(ctxY(g))
    expect(dealModals(g)).toHaveLength(1)
  })

  it('a push miss on a renewal ends the deal as dropped and the job is gone', () => {
    const g = signed(53)
    md(musicJob(g)!).popularity = 80
    const s = musicStore.mut(g)
    s.deal!.years = 0
    g.queue = []
    stepDeal(ctxY(g))
    let done = 0
    for (let seed = 1; seed <= 100 && done < 1; seed++) {
      const c = structuredClone(g)
      c.rng = seed
      answer(c, dealModals(c)[0], 'push')
      if (dealModals(c).length > 0) continue
      done++
      expect(c.character.job).toBeNull()
      expect(sOf(c).deal).toBeNull()
      expect(sOf(c).history.at(-1)).toMatchObject({ ended: 'dropped' })
      expect(notices(c).some((n) => /withdrew the offer/.test(n.text))).toBe(true)
    }
    expect(done).toBe(1)
    // declining a renewal ends it as walked and the artist leaves the label
    const w = structuredClone(g)
    answer(w, dealModals(w)[0], 'walk')
    expect(w.character.job).toBeNull()
    expect(sOf(w).history.at(-1)).toMatchObject({ ended: 'walked' })
    expect(w.character.careerHistory.at(-1)?.reason).toBe('quit')
    expect(cooled(sOf(w), 'echo-chamber-records', w.year + 2)).toBe(true)
  })

  it('trust moves +3 after a release this or last year, else -4, and stays within 0 and 100', () => {
    const trustAfter = (lastRelease: number, trust = 55): number => {
      const g = signed(54)
      md(musicJob(g)!).lastRelease = lastRelease === 0 ? g.character.age : g.character.age + lastRelease
      musicStore.mut(g).deal!.trust = trust
      g.queue = []
      stepDeal(ctxY(g))
      return sOf(g).deal!.trust
    }
    expect(trustAfter(0)).toBe(58)
    expect(trustAfter(-1)).toBe(58)
    expect(trustAfter(-2)).toBe(51)
    expect(trustAfter(0, 99)).toBe(100)
    expect(trustAfter(-5, 2)).toBe(0)
  })

  it('exits forgive the balance, write one history row, cool the label three years, and the ledger keeps paying', () => {
    const g = signed(61)
    const s = musicStore.mut(g)
    const deal = s.deal!
    deal.unrecouped = 25_000
    s.ledger.push(row({ id: 'r9', dealId: deal.id, label: deal.label, rate: 0.16, units0: 100_000, k: 0.4, year: 1995, lastYear: 1995 }))
    const cash = g.character.money
    endDeal(ctxY(g), 'quit')
    expect(g.character.money).toBe(cash)
    expect(sOf(g).deal).toBeNull()
    expect(sOf(g).history).toHaveLength(1)
    expect(sOf(g).history[0]).toMatchObject({ label: 'Echo Chamber Records', from: 1995, to: 1995, ended: 'quit', forgiven: 25_000 })
    expect(cooled(sOf(g), 'echo-chamber-records', 1997)).toBe(true)
    expect(cooled(sOf(g), 'echo-chamber-records', 1998)).toBe(false)
    // endDeal never ends the job nor touches Job.data
    expect(musicJob(g)).not.toBeNull()
    expect(mdView(musicJob(g)!).contractYears).toBe(3)
    // a second call is a no-op
    const json = JSON.stringify(g)
    endDeal(ctxY(g), 'quit')
    expect(JSON.stringify(g)).toBe(json)
    // the row keeps paying at its rate with nothing recouped
    g.year += 1
    g.character.age += 1
    const expected = waterfall(row({ dealId: deal.id, rate: 0.16 }), Math.round(100_000 * 0.4), formatMix('us', 1996), null)
    expect(expected.recoup).toBe(0)
    const t = stepCatalogue(ctxY(g))
    expect(t.paid).toBe(expected.paid)
    expect(t.recoup).toBe(0)
    expect(g.character.money - cash).toBe(expected.paid)
  })

  it('quitMusic closes the deal first: one history row with the forgiven balance', () => {
    const g = signed(62)
    musicStore.mut(g).deal!.unrecouped = 10_000
    ;(musicJobNodes(g).find((n) => n.id === 'music.quit') as MenuAction).run(g)
    expect(g.character.job).toBeNull()
    expect(sOf(g).deal).toBeNull()
    expect(sOf(g).history).toHaveLength(1)
    expect(sOf(g).history[0]).toMatchObject({ ended: 'quit', forgiven: 10_000 })
    // a legacy life with no record quits as before and creates none
    const old = makeTestGame(9, { age: 25 })
    hire(old, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...LEGACY_SOLO } as Record<string, Json> })
    ;(musicJobNodes(old).find((n) => n.id === 'music.quit') as MenuAction).run(old)
    expect(old.character.job).toBeNull()
    expect(musicStore.has(old)).toBe(false)
  })

  it('closes the deal when the job is gone, once', () => {
    const g = signed(63)
    md(musicJob(g)!).popularity = 90
    yearOf(g)
    g.character.job = null
    g.queue = []
    yearOf(g)
    expect(sOf(g).deal).toBeNull()
    expect(sOf(g).history).toHaveLength(1)
    expect(sOf(g).history[0]).toMatchObject({ ended: 'expired', forgiven: 30_000 })
    yearOf(g)
    expect(sOf(g).history).toHaveLength(1)
  })

  it('a stale legacy renewal modal re-derives a legacy deal [RF2]', () => {
    const g = makeTestGame(3, { age: 25 })
    g.year = 2026
    g.flags.instruments = { Guitar: 55 }
    g.character.money = 100_000
    hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...LEGACY_SOLO, contractYears: 0, advancePerYear: 0, popularity: 80 } as Record<string, Json> })
    adoptMusic(g, musicStore.mut(g))
    expect(sOf(g).deal).toBeNull()
    runScript(g, 'special.music.renew', 'accept', { advance: 90_000, years: 3 }, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
    expect(mdView(musicJob(g)!)).toMatchObject({ contractYears: 3, advancePerYear: 30_000 })
    const before = g.character.money
    yearOf(g)
    expect(g.character.money - before).toBe(30_000)
    expect(sOf(g).deal).toMatchObject({ legacy: true, royalty: 1, years: 2, perYear: 30_000, label: 'Garage Door Records' })
    expect(mdView(musicJob(g)!).contractYears).toBe(2)
  })

  it('a stale deal of a replaced job closes, then the new job lifts its own legacy deal', () => {
    const g = signed(64)
    const old = sOf(g).deal!
    g.character.job = null
    hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...LEGACY_SOLO, popularity: 80 } as Record<string, Json> })
    const before = g.character.money
    yearOf(g)
    expect(g.character.money - before).toBe(10_000)
    expect(sOf(g).history.at(-1)).toMatchObject({ label: old.label, ended: 'expired' })
    expect(sOf(g).deal).toMatchObject({ legacy: true, label: 'Garage Door Records', years: 2 })
    expect(sOf(g).deal!.appt).toBe(appointmentId(musicJob(g)))
  })

  it('computes attention from the standing and the tier', () => {
    const g = signed(65)
    const s = sOf(g)
    const deal = s.deal!
    const att = attentionOf(g, s, deal)
    expect(att).toBeGreaterThanOrEqual(0.5)
    expect(att).toBeLessThanOrEqual(1.3)
    expect(attentionOf(g, s, { ...deal, tier: 0 })).toBeGreaterThan(attentionOf(g, s, { ...deal, tier: 3 }))
    const before = JSON.stringify(g)
    attentionOf(g, s, deal)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('the offer queue', () => {
  it('keeps the offer when the queue is full', () => {
    const run = (full: boolean): { legacy: number; deal: number } => {
      let passed = 0
      let legacy = 0
      let deal = 0
      for (let seed = 1; seed <= 25; seed++) {
        const g = life(seed, { fame: 60 })
        g.flags.instruments = { Guitar: 100 }
        if (full) for (let i = 0; i < 2; i++) g.queue.push({ kind: 'choice', id: `q${i}`, title: 'q', text: 'q', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'career.actor.filler' })
        runScript(g, 'special.music.label', 'Meridian Sound Group', { instrument: 'Guitar', goingSolo: false } as Json, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
        const queued = g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && (m.scriptId === 'career.music.deal' || m.scriptId === 'special.music.contract'))
        if (queued.length === 0) continue
        passed++
        legacy += queued.filter((m) => m.scriptId === 'special.music.contract').length
        deal += queued.filter((m) => m.scriptId === 'career.music.deal').length
        // a full queue writes no record
        if (full) expect(musicStore.has(g)).toBe(false)
      }
      expect(passed).toBeGreaterThan(0)
      return { legacy, deal }
    }
    const open = run(false)
    expect(open.legacy).toBe(0)
    expect(open.deal).toBeGreaterThan(0)
    const full = run(true)
    expect(full.deal).toBe(0)
    expect(full.legacy).toBeGreaterThan(0)
  })

  it('a legacy contract signed from the fallback pays as a grandfathered deal', () => {
    const g = life(71)
    g.queue.push({ kind: 'choice', id: 'q0', title: 'q', text: 'q', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'career.actor.filler' }, { kind: 'choice', id: 'q1', title: 'q', text: 'q', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'career.actor.filler' })
    runScript(g, 'special.music.contract', 'accept', { instrument: 'Guitar', label: 'Echo Chamber Records', tier: 1, genre: 'Rock', advance: 90_000, years: 3 } as Json, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
    md(musicJob(g)!).popularity = 70
    adoptMusic(g, musicStore.mut(g))
    expect(sOf(g).deal).toMatchObject({ legacy: true, royalty: 1, years: 3, perYear: 30_000, tier: 1 })
    const before = g.character.money
    yearOf(g)
    expect(g.character.money - before).toBe(30_000)
  })
})

describe('the whole loop', () => {
  it('replays a 10-year life from a clone to the same JSON, and the hook twice in a tick equals once [RF3]', () => {
    const a = signed(81)
    md(musicJob(a)!).popularity = 60
    a.flags.instruments = { Guitar: 80 }
    const b = structuredClone(a)
    const play = (g: GameState): void => {
      for (let y = 0; y < 10; y++) {
        const job = musicJob(g)
        if (job && mdView(job).recordedAge !== g.character.age) runScript(g, 'special.music.title', `Night ${y}`, { type: 'studio', subgenre: 'Dance' }, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
        yearOf(g)
        drainCareer(g, 'steady', [], [])
      }
    }
    play(a)
    play(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // the signed life earned a catalogue and renewed at least once or ended cleanly
    expect(sOf(a).ledger.length).toBeGreaterThan(0)
    const json = JSON.stringify(a)
    const rng = a.rng
    yearlyCareerSims(a)
    yearlyCareerSims(a)
    expect(JSON.stringify(a)).toBe(json)
    expect(a.rng).toBe(rng)
  }, 120_000)
})

describe('the Release Plan', () => {
  it('the row is pure and its risky hint is the claim table', () => {
    const g = soloLife(91, { talent: true })
    adoptMusic(g, musicStore.mut(g))
    assertMenuPure(g, () => [planRow])
    expect(planRow.hint?.(g)).toContain(`About ${Math.round(100 * claimOdds('sample', 1))}% claim risk if it charts top 10`)
    expect(planRow.hint?.(g)).toContain('About 40% claim risk if it charts top 10')
    const plain = soloLife(91)
    expect(planRow.hint?.(plain) ?? '').toBe('')
    const sub = (gg: GameState): string => (typeof planRow.subtitle === 'function' ? planRow.subtitle(gg) : (planRow.subtitle ?? ''))
    expect(sub(g)).toBe('Samples: write it fresh')
    expect(planRow.id).toBe('music.plan')
    expect(planRow.disabledReason?.(g)).toBeNull()
  })

  it('the script sets policy.samples, claims once, and a second pick the same year works [RF3]', () => {
    const g = soloLife(92)
    adoptMusic(g, musicStore.mut(g))
    g.character.money = 500_000
    planRow.run(g)
    const first = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.plan')!
    expect(first).toBeDefined()
    expect(first.choices.map((c) => c.id)).toEqual(['original', 'cleared', 'risky'])
    expect(voiceProblems(first.text, 'scene')).toEqual([])
    expect(first.text.endsWith('What will you do?')).toBe(true)
    for (const c of first.choices) {
      expect(c.label.split(/\s+/).length).toBeLessThanOrEqual(5)
      expect(voiceProblems(c.label, 'title')).toEqual([])
    }
    expect(first.choices.map((c) => c.label)).toEqual(['Write it fresh', 'Clear every sample', 'Skip clearances'])
    answer(g, first, 'cleared')
    expect(sOf(g).policy.samples).toBe('cleared')
    const sub = typeof planRow.subtitle === 'function' ? planRow.subtitle(g) : ''
    expect(sub).toMatch(/^Samples: cleared, \$[\d,]+ at release$/)
    expect(notices(g, 'Release Plan').at(-1)?.text).toMatch(/clear every sample\. It costs \$/)
    // a replay under a new modal id changes nothing
    const json = snap(g)
    runScript(g, 'career.music.plan', 'risky', first.data, { ...first, id: 'again' })
    expect(snap(g)).toBe(json)
    // a second pick the same year still works (a fresh pid)
    planRow.run(g)
    const second = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.plan' && m !== first)!
    expect(second).toBeDefined()
    answer(g, second, 'risky')
    expect(sOf(g).policy.samples).toBe('risky')
    expect(typeof planRow.subtitle === 'function' ? planRow.subtitle(g) : '').toBe('Samples: skipped clearances')
    expect(notices(g, 'Release Plan').at(-1)?.text).toContain('A claim is possible.')
    // back to original
    planRow.run(g)
    const third = g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.plan').at(-1)!
    answer(g, third, 'original')
    expect(sOf(g).policy.samples).toBe('original')
  })

  it('a stale plan modal changes nothing', () => {
    const g = soloLife(93)
    const json = snap(g)
    runScript(g, 'career.music.plan', 'risky', { pid: 'p1', owner: 'v2:1:player', year: g.year } as Json, { kind: 'notice', id: 'x', title: 'x', text: 'x' } as NoticeModal)
    expect(snap(g)).toBe(json)
    expect(musicStore.has(g)).toBe(false)
  })

  it('the offer scene and its labels pass the voice rules', () => {
    const g = life(94)
    const modal = offerOf(g, 1)
    expect(voiceProblems(modal.text, 'scene')).toEqual([])
    expect(modal.text.endsWith('What will you do?')).toBe(true)
    expect(modal.text).toContain('Echo Chamber Records offers 3 years')
    expect(modal.text).toContain('% of net.')
    expect(modal.choices.map((c) => c.label)).toEqual(['Sign the deal', 'Push for royalty', 'Walk away'])
    for (const c of modal.choices) expect(c.label.split(/\s+/).length).toBeLessThanOrEqual(5)
    answer(g, modal, 'sign')
    for (const n of notices(g)) expect(voiceProblems(n.text, 'outcome'), n.text).toEqual([])
  })
})
