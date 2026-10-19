// Music 2.0, Task 6: the touring P&L. A tour is a real profit and loss by venue tier: the gate, the
// promoter's 25%, the crew, the road and the stage, merch and its cost, split by the band. The accounting
// identity and `delta money = playerNet` hold to the dollar, a refusal claims nothing, and a hint prints the
// numbers of the same `tourModel` the resolver settles with (never the luck draw or the incident).
import { afterEach, describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { hire, money } from '../src/game/special/common'
import { honest } from '../src/game/special/kit/crisis'
import { careerCtx, setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import { musicJobNodes } from '../src/game/special/music'
import { TOUR_TIERS, type TourTierId } from '../src/game/special/music-data'
import { mdView, musicJob, viewMusic } from '../src/game/special/music-job'
import { settleTour, tierBlock, tourAction, tourBlock, tourHint, tourModel, type TourPlan } from '../src/game/special/music-tour'
import { adoptMusic, musicStore, type MusicState } from '../src/game/special/music-state'
import { homeFrontAt, warsAt } from '../src/game/history/events-wars'
import { rand } from '../src/game/rng'
import { COUNTRIES } from '../src/game/world'
import type { ChoiceModal, GameState, Json, NoticeModal } from '../src/game/types'
import { assertMenuPure, careerRoots, checkLedger, finiteJson, voiceProblems } from './career-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const TIERS: readonly TourTierId[] = ['club', 'theater', 'arena', 'stadium']
const SCRIPT = 'career.music.tour'

interface TourerOpts {
  seed?: number
  popularity?: number
  members?: number
  cash?: number
  year?: number
  country?: string
  talent?: boolean
  age?: number
}

/** A 1995 US life with a solo or band job, an adopted record and cash on hand. */
function newTourer(o: TourerOpts = {}): GameState {
  const g = makeTestGame(o.seed ?? 1, { age: o.age ?? 30 })
  g.year = o.year ?? 1995
  if (o.country) g.character.countryId = o.country
  g.character.money = o.cash ?? 500_000
  g.character.hidden.fame = 10
  g.flags.instruments = { Guitar: 60 }
  if (o.talent) g.character.talent = 'Music'
  const members = o.members ?? 1
  hire(g, {
    defId: 'musician',
    title: members > 1 ? 'Guitarist' : 'Solo Artist',
    company: 'Independent',
    salary: 0,
    data: { mode: members > 1 ? 'band' : 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: o.popularity ?? 40, bandName: members > 1 ? 'The Neon Wolves' : null, bandmates: [], members, recordedAge: -1, lastRelease: -1 } as Record<string, Json>,
  })
  adoptMusic(g, musicStore.mut(g))
  return g
}

const sOf = (g: GameState): MusicState => musicStore.view(g)
const pickers = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === SCRIPT)
const notices = (g: GameState, title?: string): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))
const logText = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))

/** Opens the tour picker through the row, as the player does, and returns its modal. */
function openPicker(g: GameState): ChoiceModal {
  tourAction.run(g)
  const modal = pickers(g).at(-1)
  expect(modal).toBeDefined()
  return modal!
}

/** Answers a queued modal the way the store does: it leaves the queue, then its script runs. */
function answer(g: GameState, modal: ChoiceModal, choice: string): void {
  g.queue = g.queue.filter((m) => m !== modal)
  runScript(g, modal.scriptId!, choice, modal.data, modal)
}

/** The state as JSON without the queue, the log, the modal id counter (a told reason bumps it) and the engine's record of resolved modals. */
const snap = (g: GameState): string => JSON.stringify({ ...g, queue: [], log: [], nextId: 0, flags: Object.fromEntries(Object.entries(g.flags).filter(([k]) => k !== 'core.resolvedScriptModals')) })

type Incident = 'weather' | 'illness' | 'surge'

/** The two draws the resolver makes first, replayed on a copy: the luck and the incident. */
function draws(g: GameState): { u: number; incident?: Incident } {
  const probe = structuredClone(g)
  const u = rand(probe)
  const x = rand(probe)
  const incident: Incident | undefined = x < 0.08 ? 'weather' : x < 0.14 ? 'illness' : x < 0.22 ? 'surge' : undefined
  return incident ? { u, incident } : { u }
}

/** tourModel with the replayed draws. */
function planOf(g: GameState, tier: TourTierId): TourPlan {
  return tourModel(g, sOf(g), tier, draws(g))
}

const members = (g: GameState): number => mdView(musicJob(g)!).members
const preflight = (g: GameState, tier: TourTierId): number => Math.ceil((0.1 * tourModel(g, sOf(g), tier, { u: 0.1 }).costs) / members(g))

describe('the tour P&L', () => {
  it('settles the P&L to the dollar and delta money = playerNet [RF5]', () => {
    const seen = { gain: 0, loss: 0, absorbed: 0, incident: 0 }
    for (let seed = 1; seed <= 40; seed++) {
      const tier = TIERS[seed % 4]
      const band = 1 + (seed % 4)
      const minPop = TOUR_TIERS[tier].minPop
      // two seeds in three sit just above the stage's minimum popularity on just enough cash for the preflight, where a
      // tour loses more than the cash and the promoter absorbs the rest; the third ranges up to 90 on plenty of cash
      const tight = seed % 3 !== 0
      const popularity = tight ? minPop + ((seed * 5) % 3) : minPop + ((seed * 7) % (91 - minPop))
      const g = newTourer({ seed, popularity, members: band })
      g.character.money = preflight(g, tier) + (tight ? 0 : 50_000_000)
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      const cash = g.character.money
      const plan = planOf(g, tier)
      const mine = Math.round(plan.net / band)
      const expected = mine >= 0 ? mine : -Math.min(-mine, cash)

      // the identity, on a copy settled directly
      const copy = structuredClone(g)
      const st = settleTour(careerCtx(copy, 'music', musicStore.mut(copy)), plan, band)
      expect(plan.gate + plan.merch + st.absorbed, `seed ${seed} identity`).toBe(plan.promoter + plan.crew + plan.travel + plan.production + plan.cogs + st.playerNet + st.bandCut)
      expect(st.playerNet, `seed ${seed} playerNet`).toBe(expected)
      if (mine >= 0) seen.gain++
      else seen.loss++
      if (st.absorbed > 0) seen.absorbed++
      if (draws(g).incident) seen.incident++
      expect(copy.character.money - cash, `seed ${seed} copy cash`).toBe(expected)

      // the whole resolver
      answer(g, openPicker(g), tier)
      expect(g.character.money - cash, `seed ${seed} delta`).toBe(expected)
      expect(musicStore.peek(g)!.tours.at(-1)?.net, `seed ${seed} row`).toBe(expected)
      expect(checkLedger(events)).toEqual([])
      expect(finiteJson(g)).toEqual([])
      setCareerAudit(null)
    }
    // the loop really covered a gain, a loss, a loss beyond cash and an incident
    expect(seen.gain).toBeGreaterThan(5)
    expect(seen.loss).toBeGreaterThan(5)
    expect(seen.absorbed).toBeGreaterThan(0)
    expect(seen.incident).toBeGreaterThan(0)
  })

  it('the preflight refuses and changes nothing, and the player can pick again', () => {
    const g = newTourer({ popularity: 40 })
    const need = preflight(g, 'theater')
    g.character.money = need - 1
    const modal = openPicker(g)
    expect(modal.choices.map((c) => c.id)).toEqual(['club', 'theater', 'cancel'])
    g.queue = g.queue.filter((m) => m !== modal)
    const before = snap(g)
    const rng = g.rng
    runScript(g, SCRIPT, 'theater', modal.data, modal)
    expect(snap(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(g.yearActions['music.tour']).toBeUndefined()
    expect(sOf(g).done).toEqual([])
    expect(notices(g)).toHaveLength(1)
    expect(notices(g)[0].text).toContain(money(need))

    // with the cash restored, a fresh picker answers the same year
    g.queue = []
    g.character.money = need + 1
    answer(g, openPicker(g), 'theater')
    expect(g.yearActions['music.tour']).toBe(1)
    expect(sOf(g).tours).toHaveLength(1)
    expect(sOf(g).done).toContain('tour.1995')
    expect(tourAction.disabledReason?.(g)).toBe('You already toured this year.')
  })

  it('blocks 2020, 2021 and a home-front war year, with the reason on the row', () => {
    for (const year of [2020, 2021]) {
      const g = newTourer({ year })
      expect(tourBlock(g)).toBe('Venues are shut this year.')
      expect(tourAction.disabledReason?.(g)).toBe('Venues are shut this year.')
    }
    expect(tourBlock(newTourer({ year: 2019 }))).toBeNull()
    expect(tourBlock(newTourer({ year: 2022 }))).toBeNull()
    let found: { country: string; year: number } | null = null
    for (const country of ['de', 'gb', 'ru', 'fr', 'za', 'mx']) {
      for (let year = 1900; year <= 1950 && !found; year++) if (warsAt(country, year).some((w) => homeFrontAt(w, country))) found = { country, year }
    }
    expect(found).not.toBeNull()
    const war = newTourer({ year: found!.year, country: found!.country })
    expect(tourBlock(war)).toBe("Travel isn't safe at home this year.")
    expect(tourAction.disabledReason?.(war)).toBe("Travel isn't safe at home this year.")
    // a refused row runs nothing: no picker is queued
    tourAction.run(war)
    expect(pickers(war)).toHaveLength(0)
    expect(notices(war)).toHaveLength(1)
  })

  it('opens tiers by era, wealth and popularity: no stadium in 1960, no arena in 1950, club always [RF7]', () => {
    const at = (year: number, popularity: number, tier: TourTierId, country = 'us'): string | null => {
      const g = newTourer({ year, popularity, country })
      return tierBlock(g, sOf(g), tier)
    }
    expect(at(1964, 80, 'stadium')).not.toBeNull()
    expect(at(1965, 80, 'stadium')).toBeNull()
    expect(at(1954, 80, 'arena')).not.toBeNull()
    expect(at(1955, 80, 'arena')).toBeNull()
    expect(at(1900, 10, 'club')).toBeNull()
    expect(at(1900, 30, 'theater')).toBeNull()
    expect(at(2026, 10, 'club')).toBeNull()
    // a poor country gets neither big stage at any year
    const poor = COUNTRIES.find((c) => c.wealth <= 0.2)!
    for (const year of [1960, 1990, 2026]) {
      expect(at(year, 90, 'arena', poor.id), `${poor.id} ${year} arena`).not.toBeNull()
      expect(at(year, 90, 'stadium', poor.id), `${poor.id} ${year} stadium`).not.toBeNull()
    }
    // popularity gates
    for (const [tier, min] of [['club', 10], ['theater', 30], ['arena', 55], ['stadium', 75]] as const) {
      expect(at(1995, min - 1, tier), `${tier} below`).not.toBeNull()
      expect(at(1995, min, tier), `${tier} at`).toBeNull()
    }
    // every reason is a plain sentence under 90 characters
    const reasons = [at(1964, 80, 'stadium'), at(1954, 80, 'arena'), at(1995, 5, 'club'), at(1995, 20, 'theater'), at(1995, 40, 'arena'), at(1995, 60, 'stadium'), at(1995, 90, 'arena', poor.id)]
    for (const r of reasons) {
      expect(r).not.toBeNull()
      expect(r!.length).toBeLessThan(90)
      expect(r!).toMatch(/[.!]$/)
      expect(voiceProblems(r!, 'outcome')).toEqual([])
    }
    // the picker leaves a blocked tier out
    const g = newTourer({ popularity: 60 })
    expect(openPicker(g).choices.map((c) => c.id)).toEqual(['club', 'theater', 'arena', 'cancel'])
  })

  it('splits the net by members and absorbs a loss beyond cash, cooling tours two years', () => {
    const band = newTourer({ popularity: 40, members: 4, cash: 0 })
    const profit = tourModel(band, sOf(band), 'club', { u: 0.5 })
    expect(profit.net).toBeGreaterThan(0)
    const cash0 = band.character.money
    const st = settleTour(careerCtx(band, 'music', musicStore.mut(band)), profit, 4)
    expect(st.playerNet).toBe(Math.round(profit.net / 4))
    expect(band.character.money - cash0).toBe(st.playerNet)
    expect(st.bandCut).toBe(profit.net - st.playerNet)
    expect(st.absorbed).toBe(0)

    const poor = newTourer({ popularity: 30, cash: 100 })
    const loss = tourModel(poor, sOf(poor), 'theater', { u: 0 })
    expect(loss.net).toBeLessThan(-100_000)
    const out = settleTour(careerCtx(poor, 'music', musicStore.mut(poor)), loss, 1)
    expect(poor.character.money).toBe(0)
    expect(out.playerNet).toBe(-100)
    expect(out.absorbed).toBe(-loss.net - 100)
    expect(loss.gate + loss.merch + out.absorbed).toBe(loss.promoter + loss.crew + loss.travel + loss.production + loss.cogs + out.playerNet + out.bandCut)
    expect(sOf(poor).cool.tour).toBe(poor.year + 1)
    poor.year += 1
    expect(tierBlock(poor, sOf(poor), 'club')).not.toBeNull()
    poor.year += 1
    expect(tierBlock(poor, sOf(poor), 'club')).toBeNull()
  })

  it('a loss inside cash is paid in full and cools nothing', () => {
    const g = newTourer({ popularity: 30, cash: 5_000_000 })
    const loss = tourModel(g, sOf(g), 'theater', { u: 0 })
    const st = settleTour(careerCtx(g, 'music', musicStore.mut(g)), loss, 1)
    expect(st.absorbed).toBe(0)
    expect(st.playerNet).toBe(loss.net)
    expect(g.character.money).toBe(5_000_000 + loss.net)
    expect(sOf(g).cool.tour).toBeUndefined()
  })

  it('hint break-even and draw equal tourModel at u 0.1, and the roll never shows luck [RF6]', () => {
    const g = newTourer({ popularity: 60, talent: true })
    const s = sOf(g)
    for (const tier of ['club', 'theater', 'arena'] as const) {
      const p = tourModel(g, s, tier, { u: 0.1 })
      expect(tourHint(g, s, tier)).toBe(`Break-even about ${p.breakEven.toLocaleString('en-US')} a night, you should draw about ${p.draw.toLocaleString('en-US')}`)
    }
    const modal = openPicker(g)
    for (const tier of ['club', 'theater', 'arena'] as const) {
      const hint = modal.choices.find((c) => c.id === tier)?.hint
      expect(hint).toBe(honest(g, 'Music', tourHint(g, s, tier)).hint)
      expect(hint).toContain(tourHint(g, s, tier))
      expect(hint).not.toMatch(/weather|illness|surge|incident|cancel|luck|%/i)
    }
    expect(modal.choices.find((c) => c.id === 'cancel')?.hint).toBeUndefined()
    // the hint does not move with the luck of the rng
    const other = structuredClone(g)
    other.rng = 99_999
    expect(tourHint(other, sOf(other), 'arena')).toBe(tourHint(g, s, 'arena'))
    // only the Music talent sees it
    const plain = newTourer({ popularity: 60 })
    expect(openPicker(plain).choices.every((c) => c.hint === undefined)).toBe(true)
  })

  it('breaks even near the digest popularity, and a club tour at 25 nets about $64,000', () => {
    const netAt = (tier: TourTierId, popularity: number): number => {
      const g = newTourer({ popularity, year: 1995 })
      return tourModel(g, sOf(g), tier, { u: 0.1, leisure: 1 }).net
    }
    for (const [tier, b] of [['club', 16], ['theater', 37], ['arena', 60], ['stadium', 76]] as const) {
      expect(netAt(tier, b + 6), `${tier} above`).toBeGreaterThan(0)
      expect(netAt(tier, b - 6), `${tier} below`).toBeLessThan(0)
    }
    expect(Math.abs(netAt('club', 25) - 64_000)).toBeLessThan(3_000)
  })

  it('prices a plan from its parts: the break-even night matches the margin, incidents move the right line', () => {
    const g = newTourer({ popularity: 50 })
    const s = sOf(g)
    const base = tourModel(g, s, 'theater', { u: 0.3, leisure: 1 })
    expect(base.costs).toBe(base.promoter + base.crew + base.travel + base.production + base.cogs)
    expect(base.net).toBe(base.gate + base.merch - base.costs)
    expect(base.shows).toBe(24)
    expect(base.draw).toBe(Math.round(2_500 * base.fill))
    expect(base.perShowCosts).toBe(10 * 300 + 10_000 + 18_000)
    // the weather trims the gate, an illness the shows, a surge the fill
    const weather = tourModel(g, s, 'theater', { u: 0.3, leisure: 1, incident: 'weather' })
    expect(weather.gate).toBeLessThan(base.gate)
    expect(weather.shows).toBe(base.shows)
    const ill = tourModel(g, s, 'theater', { u: 0.3, leisure: 1, incident: 'illness' })
    expect(ill.shows).toBe(Math.round(0.85 * 24))
    expect(ill.heads).toBeLessThan(base.heads)
    const surge = tourModel(g, s, 'theater', { u: 0.3, leisure: 1, incident: 'surge' })
    expect(surge.fill).toBeGreaterThan(base.fill)
    // a merch-poor era earns less merch than the modern one
    const old = newTourer({ popularity: 50, year: 1960 })
    const young = newTourer({ popularity: 50, year: 1995 })
    const m = (x: GameState): number => tourModel(x, sOf(x), 'club', { u: 0.3, leisure: 1 }).merch / tourModel(x, sOf(x), 'club', { u: 0.3, leisure: 1 }).heads
    expect(m(old)).toBeLessThan(m(young))
  })

  it('replaying the picker or the tour twice changes nothing more [RF3]', () => {
    const g = newTourer({ popularity: 40 })
    const modal = openPicker(g)
    answer(g, modal, 'club')
    expect(sOf(g).tours).toHaveLength(1)
    g.queue = []
    const after = snap(g)
    const rng = g.rng
    // the same modal again, as a different modal item (the engine's own token guard would catch a same-id replay)
    runScript(g, SCRIPT, 'club', modal.data, { ...modal, id: 'replay-1' })
    expect(snap(g)).toBe(after)
    expect(g.rng).toBe(rng)
    expect(g.queue).toHaveLength(0)
    // a modal of another year changes nothing, even with a fresh claim key
    const stale = { ...(modal.data as Record<string, Json>), year: 1994 }
    runScript(g, SCRIPT, 'theater', stale, { ...modal, id: 'replay-2', data: stale })
    expect(snap(g)).toBe(after)
    // a modal stamped for another owner
    const alien = { ...(modal.data as Record<string, Json>), owner: 'v2:9:somebody-else' }
    runScript(g, SCRIPT, 'theater', alien, { ...modal, id: 'replay-3', data: alien })
    expect(snap(g)).toBe(after)
    expect(g.yearActions['music.tour']).toBe(1)
    // cancel and a junk choice do nothing either
    runScript(g, SCRIPT, 'cancel', modal.data, { ...modal, id: 'replay-4' })
    runScript(g, SCRIPT, 'junk', modal.data, { ...modal, id: 'replay-5' })
    expect(snap(g)).toBe(after)
  })

  it('a stale picker with no record or no job creates nothing', () => {
    const g = makeTestGame(3, { age: 30 })
    g.year = 1995
    const json = JSON.stringify(g)
    runScript(g, SCRIPT, 'club', { owner: 'x', year: 1995 }, { kind: 'choice', id: 'm1', source: 'script', scriptId: SCRIPT, title: 'x', text: 'x', choices: [{ id: 'club', label: 'Club tour' }] } as ChoiceModal)
    expect(musicStore.has(g)).toBe(false)
    expect(g.flags['special.music.sim']).toBeUndefined()
    expect(JSON.stringify({ ...g, flags: Object.fromEntries(Object.entries(g.flags).filter(([k]) => k !== 'core.resolvedScriptModals')) })).toBe(json)
  })

  it('renders the tour row and picker pure and frozen [RF4]', () => {
    const g = newTourer({ popularity: 60, talent: true })
    assertMenuPure(g, careerRoots('music'))
    // the row and its gate on a frozen state, and the hint, the model and the blocks
    const frozen = deepFreeze(structuredClone(g))
    expect(tourAction.disabledReason?.(frozen)).toBeNull()
    for (const tier of TIERS) {
      tierBlock(frozen, musicStore.view(frozen), tier)
      tourHint(frozen, musicStore.view(frozen), tier)
      tourModel(frozen, musicStore.view(frozen), tier, { u: 0.1 })
    }
    tourBlock(frozen)
    expect(JSON.stringify(frozen)).toBe(JSON.stringify(g))
    expect(frozen.rng).toBe(g.rng)
    // the row is where it was in the job menu, with the legacy id and label
    const node = musicJobNodes(g).flatMap((n) => (n.type === 'action' ? [n] : [])).find((n) => n.id === 'music.tour')
    expect(node?.label).toBe('Tour')
    expect(node?.subtitle).toBe('Go on a world tour')
  })

  it('keeps junk harmless: every plan number is finite whatever the record holds [RF1]', () => {
    const g = newTourer({ popularity: 60 })
    musicJob(g)!.data.popularity = Number.NaN
    musicJob(g)!.data.members = 1e300
    const s = musicStore.read({ ledger: 'bad', mods: [{ id: 'x', kind: 'fill', mult: 1e300, until: 1e300 }], tours: 5, cool: { tour: 'x' }, done: 7 }, g)
    for (const tier of TIERS) {
      const p = tourModel(g, s, tier, { u: Number.NaN })
      for (const [k, v] of Object.entries(p)) if (typeof v === 'number') expect(Number.isFinite(v), `${tier}.${k}`).toBe(true)
      expect(tourHint(g, s, tier)).not.toMatch(/NaN|Infinity|undefined/)
    }
  })

  it('says so when the queue has no room, and ignores a picker for a junk job record [RF1]', () => {
    const g = newTourer({ popularity: 40 })
    const modal = openPicker(g)
    g.queue = [
      { ...modal, id: 'a1' },
      { ...modal, id: 'a2' },
    ]
    tourAction.run(g)
    expect(pickers(g)).toHaveLength(2)
    expect(notices(g, 'Tour')).toHaveLength(1)
    // a job whose data is not an object has nothing to tour with
    const junk = newTourer({ popularity: 40 })
    const picker = openPicker(junk)
    ;(musicJob(junk) as { data: unknown }).data = [1, 2]
    junk.queue = []
    const before = snap(junk)
    runScript(junk, SCRIPT, 'club', picker.data, { ...picker, id: 'j1' })
    expect(snap(junk)).toBe(before)
    expect(junk.yearActions['music.tour']).toBeUndefined()
  })

  it('keeps the legacy aftermath', () => {
    // a profit
    const g = newTourer({ popularity: 40, age: 75, seed: 5 })
    const pop0 = mdView(musicJob(g)!).popularity
    const fame0 = g.character.hidden.fame
    const health0 = g.character.stats.health
    const happy0 = g.character.stats.happiness
    const plan = planOf(g, 'club')
    expect(plan.net).toBeGreaterThan(0)
    answer(g, openPicker(g), 'club')
    const pop1 = mdView(musicJob(g)!).popularity
    expect(pop1 - pop0).toBeGreaterThanOrEqual(2)
    expect(pop1 - pop0).toBeLessThanOrEqual(5)
    expect(g.character.hidden.fame - fame0).toBe(2)
    expect(health0 - g.character.stats.health).toBeGreaterThanOrEqual(3)
    expect(health0 - g.character.stats.health).toBeLessThanOrEqual(8)
    expect(g.character.stats.happiness - happy0).toBe(8)
    expect(viewMusic(g).tours).toBe(1)
    expect(g.flags['special.music.tour75']).toBe(true)
    expect(logText(g)).toContain('I went on a club tour.')
    const told = notices(g, 'World Tour')
    expect(told).toHaveLength(1)
    expect(told[0].text.length).toBeLessThanOrEqual(120)
    expect(told[0].text).toContain(money(plan.net))
    expect(voiceProblems(told[0].text, 'outcome')).toEqual([])
    expect(notices(g)).toHaveLength(1)

    // a loss
    const h = newTourer({ popularity: 30, cash: 50_000_000, seed: 6 })
    const popH = mdView(musicJob(h)!).popularity
    const fameH = h.character.hidden.fame
    const happyH = h.character.stats.happiness
    const lost = planOf(h, 'theater')
    expect(lost.net).toBeLessThan(0)
    answer(h, openPicker(h), 'theater')
    expect(mdView(musicJob(h)!).popularity - popH).toBe(1)
    expect(h.character.hidden.fame - fameH).toBe(1)
    expect(h.character.stats.happiness - happyH).toBe(2)
    expect(h.flags['special.music.tour75']).toBeUndefined()
    const sad = notices(h, 'World Tour')
    expect(sad).toHaveLength(1)
    expect(sad[0].text).toContain('lost')
    expect(sad[0].text).toContain(money(-lost.net))
    expect(voiceProblems(sad[0].text, 'outcome')).toEqual([])
  })

  it('tells a band its share and the promoter cover in plain, short sentences', () => {
    const g = newTourer({ popularity: 30, members: 4, cash: 100, seed: 9 })
    g.character.money = preflight(g, 'club')
    const cash = g.character.money
    const plan = planOf(g, 'club')
    answer(g, openPicker(g), 'club')
    const told = notices(g, 'World Tour')
    expect(told).toHaveLength(1)
    expect(voiceProblems(told[0].text, 'outcome')).toEqual([])
    expect(told[0].text).toMatch(/share/i)
    expect(g.character.money - cash).toBe(Math.round(plan.net / 4) >= 0 ? Math.round(plan.net / 4) : -Math.min(-Math.round(plan.net / 4), cash))
  })

  it('a tour in a poor country uses its wealth: smaller tickets than a rich one', () => {
    const poor = COUNTRIES.find((c) => c.wealth <= 0.3)!
    const rich = newTourer({ popularity: 60, country: 'us' })
    const low = newTourer({ popularity: 60, country: poor.id })
    const t = (x: GameState): number => tourModel(x, sOf(x), 'club', { u: 0.1, leisure: 1 }).ticket
    expect(t(low)).toBeLessThan(t(rich))
    expect(t(low)).toBeGreaterThan(0)
  })
})
