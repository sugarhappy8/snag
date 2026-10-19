// Silicon 2.0: the launch pricing choice that follows an AI accelerator (or a leading node) win in a squeeze year,
// and the chip-leap news. The popup is read straight from the queue, never answered by `drain`, which would pick
// `undercut` and take it away.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { marketViewOf } from '../src/game/business/competition'
import { marketKey } from '../src/game/business/competition-core'
import { emptyMarket } from '../src/game/business/competition-state'
import { marketReference, planContribution, siliconOf, techOf, techPlan, techView } from '../src/game/business/deeptech-core'
import { programDef } from '../src/game/business/deeptech-data'
import { startProgram } from '../src/game/business/deeptech-rd'
import { simInternals } from '../src/game/business/deeptech-sim'
import type { TechState } from '../src/game/business/deeptech-state'
import { afterYearSilicon, chipPerformance, launchDiscounts, launchOptions, leadsField, type LaunchId } from '../src/game/business/silicon'
import { CHIP_LANES, laneOpen } from '../src/game/business/silicon-data'
import { bizOf, stakeValue } from '../src/game/business/state'
import { announceWave, readTechWaves } from '../src/game/business/tech-waves'
import { money, round2, toJson } from '../src/game/business/util'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, ModalItem } from '../src/game/types'
import { chipLab, company, labOf, playYear, type Lab } from './silicon-kit'

const AI_CHIP = ['firstChip', 'volume', 'aiChip']
/** The chips lead the field whatever the seed: 99 or 100 against a rival cap of 98. */
const LEADING = { stage: 4, plant: 1, level: 100, node: 5, yieldRate: 0.97 }
const BEHIND = { level: 40, node: 3 }
const EM_DASH = String.fromCharCode(0x2014)

type Program = 'aiChip' | 'node'

/**
 * A lab whose program (or programs) finish at the next booking, booked once with `ageUp` (not `playYear`: `drain`
 * would answer the launch popup as `undercut` and remove it from the queue). Each program wins with a probability
 * well under 1, so it tries seeds 1 to 40 until every one of them is in `done`.
 */
function winYear(program: Program | readonly Program[], year: number, opts: { skill?: number; patch?: Partial<TechState> } = {}): { g: GameState; a: Asset } {
  const wanted = typeof program === 'string' ? [program] : program
  for (let seed = 1; seed <= 40; seed++) {
    const { g, a, b, t } = chipLab({ year, seed, ...opts })
    for (const id of wanted) {
      const started = startProgram(g, b, t, programDef('semiconductor', id)!)
      expect(started, `${id} can start`).not.toBeNull()
      started!.progress = started!.years
    }
    ageUp(g)
    const done = techOf(bizOf(g, a)).done
    if (wanted.every((id) => done.includes(id))) return { g, a }
  }
  throw new Error(`no seed in 1 to 40 won ${wanted.join(' and ')}`)
}

const launches = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'deeptech.launch')
const logText = (g: GameState): string[] => g.log.flatMap((e) => e.entries).map((e) => e.text)
const NOTICE = { kind: 'notice', id: 'no-op', title: 'No-op', text: 'No-op' } as ModalItem

/** An owner-run chip lab with the accelerator line open and a headline 30% over what the market charges. */
function lab(over: { price?: number; patch?: Partial<TechState>; talent?: boolean } = {}): Lab {
  const L = chipLab({ year: 2025, patch: { done: AI_CHIP, plant: 1, ...over.patch } })
  L.b.price = over.price ?? round2(L.b.price * 1.3)
  L.g.character.talents = over.talent ? ['Business'] : []
  return L
}

/** The launch popup of a lab that just booked fiscal `year`, taken straight out of the queue. */
function popup(L: Lab, year = 2025): ChoiceModal {
  L.g.queue = []
  simInternals.queueLaunch(L.g, L.a, L.b, L.t, year)
  return L.g.queue.pop() as ChoiceModal
}
const answer = (L: Lab, m: ChoiceModal, id: string): void => runScript(L.g, 'deeptech.launch', id, m.data, m)
const exposed = (L: Lab, year: number) => CHIP_LANES.filter((l) => l.id !== 'core' && l.shortage > 0 && laneOpen(l, techView(L.b), year))
const indexOf = (L: Lab, id: string, year: number): number => {
  const t = techOf(L.b), lane = CHIP_LANES.find((l) => l.id === id)!
  return (L.b.price * (1 - (t.silicon?.lanes[id] ?? 0))) / marketReference(L.g, L.b, t, lane, year)
}

describe('the launch popup', () => {
  it('asks the question, with the three choices in order and the planning year in its data', () => {
    const L = lab()
    const rivals = marketViewOf(L.g, L.b).rivals
    const m = popup(L)
    expect(m.title).toBe('Price the new chips?')
    expect(m.text).toBe(`${L.a.name}'s new chips are ready. The best rival scores ${Math.max(0, ...rivals.map((r) => r.tech))}. Yours scores ${chipPerformance(L.t)}. What will you do?`)
    expect(m.text.length).toBeLessThanOrEqual(140)
    expect(m.choices.map((c) => [c.id, c.label])).toEqual([['undercut', 'Undercut the market'], ['match', 'Match the market'], ['keep', 'Keep my prices']])
    expect(m.data).toEqual({ assetId: L.a.id, year: 2026 })
    expect(m.source).toBe('script')
    expect(m.scriptId).toBe('deeptech.launch')
    for (const c of m.choices) expect(c.label.split(' ').length).toBeLessThanOrEqual(3)
  })

  it('reads the best rival as 0 when the market has none', () => {
    const L = lab()
    L.b.market = toJson({ ...emptyMarket(marketKey(L.b)), year: 2025 })
    expect(popup(L).text).toContain('The best rival scores 0.')
  })

  it('is pure: the popup draws no dice and writes no state of the lab', () => {
    const L = lab()
    const rng = JSON.stringify(L.g.rng), live = JSON.stringify([L.b, L.a])
    launchOptions(L.g, L.b, L.t, 2026)
    popup(L)
    expect(JSON.stringify(L.g.rng)).toBe(rng)
    expect(JSON.stringify([L.b, L.a])).toBe(live)
  })
})

describe('launch triggers', { timeout: 300_000 }, () => {
  it('an aiChip win in 2024 queues exactly one launch', () => {
    expect(launches(winYear('aiChip', 2024).g)).toHaveLength(1)
  })

  it('a node win queues one only while the chips lead the field', () => {
    const lead = winYear('node', 2025, { patch: LEADING })
    expect(launches(lead.g)).toHaveLength(1)
    const { b, t } = labOf(lead.g)
    expect(leadsField(lead.g, b, t)).toBe(true)
    const behind = winYear('node', 2025, { patch: BEHIND })
    expect(launches(behind.g)).toHaveLength(0)
    const { b: b2, t: t2 } = labOf(behind.g)
    expect(leadsField(behind.g, b2, t2)).toBe(false)
  })

  it('none for a win after the squeeze, none for a managed lab, one (not two) for two wins in one booking', () => {
    expect(launches(winYear('aiChip', 2028).g)).toHaveLength(0)
    expect(launches(winYear('aiChip', 2025, { skill: 60 }).g)).toHaveLength(0)
    expect(launches(winYear(['aiChip', 'node'], 2025, { patch: LEADING }).g)).toHaveLength(1)
  })
})

describe('what each choice does', () => {
  it('undercut puts every exposed open lane at an index of 0.90, leaves the others alone and never passes 0.5', () => {
    const L = lab({ patch: {} })
    siliconOf(L.t).lanes = { cpu: 0.1 }
    const m = popup(L)
    answer(L, m, 'undercut')
    const t = techOf(L.b), lanes = t.silicon!.lanes
    const open = exposed(L, 2026)
    expect(open.map((l) => l.id)).toEqual(['gfx', 'mem', 'accel'])
    for (const lane of open) {
      expect(Math.abs(indexOf(L, lane.id, 2026) - 0.9), lane.id).toBeLessThanOrEqual(0.01)
      expect(lanes[lane.id]).toBeGreaterThan(0)
      expect(lanes[lane.id]).toBeLessThanOrEqual(0.5)
    }
    expect(lanes.cpu).toBe(0.1)
    expect(Object.keys(lanes).sort()).toEqual(['accel', 'cpu', 'gfx', 'mem'])
    expect(Object.values(lanes).every((d) => d > 0 && d <= 0.5 && d === round2(d))).toBe(true)

    const dear = lab({ price: 5 * lab().b.price })
    answer(dear, popup(dear), 'undercut')
    expect(Math.max(...Object.values(techOf(dear.b).silicon!.lanes))).toBe(0.5)
  })

  it('does not touch a lane that is not open', () => {
    const L = lab({ patch: { done: ['firstChip', 'volume'], plant: 0 } })
    answer(L, popup(L), 'undercut')
    const lanes = techOf(L.b).silicon!.lanes
    expect(Object.keys(lanes)).toEqual(['gfx'])
    expect(laneOpen(CHIP_LANES.find((l) => l.id === 'accel')!, techView(L.b), 2026)).toBe(false)
  })

  it('match puts them at 1.00, and a headline already under the market gets no discount', () => {
    const L = lab()
    answer(L, popup(L), 'match')
    for (const lane of exposed(L, 2026)) expect(Math.abs(indexOf(L, lane.id, 2026) - 1), lane.id).toBeLessThanOrEqual(0.01)

    const cheap = lab({ price: 0.5 })
    siliconOf(cheap.t).lanes = { accel: 0.2, cpu: 0.1 }
    answer(cheap, popup(cheap), 'match')
    expect(techOf(cheap.b).silicon!.lanes).toEqual({ cpu: 0.1 })
  })

  it('keep changes nothing and writes no log line', () => {
    const L = lab()
    siliconOf(L.t).lanes = { accel: 0.2 }
    const m = popup(L), log = JSON.stringify(L.g.log)
    answer(L, m, 'keep')
    expect(techOf(L.b).silicon!.lanes).toEqual({ accel: 0.2 })
    expect(JSON.stringify(L.g.log)).toBe(log)
  })

  it('says what it did in a notice and, for a cut, one log line', () => {
    const say: Record<LaunchId, [string, string | null]> = {
      undercut: ['New chips priced at 90% of the market. Goodwill moves with orders shipped, and only in squeeze years.', 'undercut the market on its new chips.'],
      match: ['New chips priced at the market. Goodwill stays where it is.', 'matched the market on its new chips.'],
      keep: ['Prices unchanged. The new chips sell at your current price.', null],
    }
    for (const id of ['undercut', 'match', 'keep'] as const) {
      const L = lab()
      answer(L, popup(L), id)
      const notices = L.g.queue.filter((m) => m.kind === 'notice')
      expect(notices.map((n) => [n.title, (n as { text: string }).text]), id).toEqual([['Chips Priced', say[id][0]]])
      const lines = logText(L.g).filter((x) => x.includes('on its new chips'))
      expect(lines, id).toEqual(say[id][1] ? [`${L.a.name} ${say[id][1]}`] : [])
      expect(L.a.value).toBe(stakeValue(L.b))
    }
  })

  it('is a no-op for an unknown choice, a missing asset, a bad year or an asset that is not a chip lab', () => {
    const L = lab()
    const m = popup(L)
    const soft = company(L.g, 'software')
    const before = JSON.stringify(L.g)
    // A `notice` modal, so the handler's own checks refuse these and not runScript's option check.
    runScript(L.g, 'deeptech.launch', 'sideways', m.data, NOTICE)
    runScript(L.g, 'deeptech.launch', 'undercut', { assetId: 'nope', year: 2026 }, NOTICE)
    runScript(L.g, 'deeptech.launch', 'undercut', { assetId: soft.id, year: 2026 }, NOTICE)
    runScript(L.g, 'deeptech.launch', 'undercut', { assetId: L.a.id, year: 'soon' }, NOTICE)
    runScript(L.g, 'deeptech.launch', 'undercut', undefined, NOTICE)
    expect(JSON.stringify(L.g)).toBe(before)
  })

  it('launchDiscounts keeps the current map for keep, drops zeros and never stores core', () => {
    const L = lab()
    siliconOf(L.t).lanes = { cpu: 0.1, accel: 0.3 }
    const t = techOf(L.b)
    expect(launchDiscounts(L.g, L.b, t, 'keep', 2026)).toEqual({ cpu: 0.1, accel: 0.3 })
    expect(launchDiscounts(L.g, L.b, t, 'keep', 2026)).not.toBe(t.silicon!.lanes)
    const matched = launchDiscounts(L.g, L.b, t, 'match', 2026)
    expect(matched.cpu).toBe(0.1)
    expect(Object.keys(matched)).not.toContain('core')
    expect(Object.values(matched).every((d) => d > 0)).toBe(true)
    // The state itself is only read.
    expect(t.silicon!.lanes).toEqual({ cpu: 0.1, accel: 0.3 })
  })
})

describe('launchOptions', () => {
  it('lists the three options in order with the profit of the calm plan on a copy that carries the lanes', () => {
    const L = lab()
    const rng = JSON.stringify(L.g.rng), live = JSON.stringify(L.b.tech)
    const options = launchOptions(L.g, L.b, L.t, 2026)
    expect(options.map((o) => o.id)).toEqual(['undercut', 'match', 'keep'])
    expect(options.map((o) => o.lanes)).toEqual((['undercut', 'match', 'keep'] as const).map((id) => launchDiscounts(L.g, L.b, L.t, id, 2026)))
    const keep = options[2]
    expect(keep.profit).toBe(planContribution(L.g, L.b, techPlan(L.g, L.b, techView(L.b), 2026, { calm: true }), 2026).profit)
    expect(options[0].profit).not.toBe(keep.profit)
    expect(JSON.stringify(L.g.rng)).toBe(rng)       // a pure read
    expect(JSON.stringify(L.b.tech)).toBe(live)     // and nothing live was touched
  })
})

describe('the Business talent hint', () => {
  it('marks only the option that earns the most, with the money it earns over the next best', () => {
    const L = lab({ talent: true })
    const m = popup(L)
    const ranked = [...launchOptions(L.g, L.b, L.t, 2026)].sort((x, y) => y.profit - x.profit)
    const delta = ranked[0].profit - ranked[1].profit
    expect(delta).toBeGreaterThan(1)
    const hinted = m.choices.filter((c) => c.hint)
    expect(hinted.map((c) => c.id)).toEqual([ranked[0].id])
    expect(hinted[0].hint).toContain(`Earns the most next year, about ${money(delta)} more than the rest. It doesn't count goodwill.`)
  })

  it('is absent without the talent, and when the best two are within one currency unit', () => {
    const plain = lab()
    expect(popup(plain).choices.some((c) => c.hint)).toBe(false)
    // A headline far under the market: no choice moves a price, so all three earn the same.
    const flat = lab({ talent: true, price: 0.01 })
    const options = launchOptions(flat.g, flat.b, flat.t, 2026)
    expect(Math.abs(options[0].profit - options[2].profit)).toBeLessThanOrEqual(1)
    expect(popup(flat).choices.some((c) => c.hint)).toBe(false)
  })
})

describe('the chip-leap news', () => {
  const STATE = { stage: 4, plant: 1, level: 100, node: 6, yieldRate: 0.97 }
  const LEAP = 'Record-speed chips'

  it('announces one chips wave and one log line when the chips beat the field after a booked year', { timeout: 300_000 }, () => {
    const { g, a } = chipLab({ year: 2025, patch: STATE })
    playYear(g)
    const { t } = labOf(g)
    expect(t.silicon!.last!.year).toBe(2025)
    const waves = readTechWaves(g).filter((w) => w.kind === 'chips')
    expect(waves).toHaveLength(1)
    expect(waves[0]).toMatchObject({ source: 'deeptech', kind: 'chips', origin: `${a.id}#leap`, name: LEAP, size: 0.35, market: 'world' })
    expect(logText(g).filter((x) => x === `${a.name}'s chips are the fastest on the market.`)).toHaveLength(1)
    expect(t.silicon!.lead).toBe(2025)

    // The next year, still leading: nothing new, and the lead just advances.
    playYear(g)
    expect(readTechWaves(g).filter((w) => w.kind === 'chips')).toHaveLength(1)
    expect(labOf(g).t.silicon!.lead).toBe(2026)
    expect(logText(g).filter((x) => x.endsWith('chips are the fastest on the market.'))).toHaveLength(1)
  })

  // One after-year step for the fiscal year `year`, with the chips ahead of the field and the lead as given.
  const step = (lead: number, year = 2030, patch: Partial<TechState> = STATE): Lab => {
    const L = chipLab({ year: year + 1, patch })
    const s = siliconOf(L.t)
    s.lead = lead
    s.applied = 0
    s.last = { year, index: 1, served: 1, depth: 0, win: 0, step: 0, perf: 0, quality: 0 }
    afterYearSilicon(L.g, L.a, L.b, L.t)
    return L
  }
  const leaps = (L: Lab) => readTechWaves(L.g).filter((w) => w.origin === `${L.a.id}#leap`)

  it('announces the first lead, and a new one only after three years without it', () => {
    const first = step(0)
    expect(leadsField(first.g, first.b, first.t)).toBe(true)
    expect([leaps(first).length, first.t.silicon!.lead]).toEqual([1, 2030])
    const lost = step(2026)                      // led in 2026, not in 2027 to 2029
    expect([leaps(lost).length, lost.t.silicon!.lead]).toEqual([1, 2030])
    expect(logText(lost.g)).toContain(`${lost.a.name}'s chips are the fastest on the market.`)
    const kept = step(2027)                      // a gap of three years: still the same run
    expect([leaps(kept).length, kept.t.silicon!.lead]).toEqual([0, 2030])
    expect(logText(kept.g).filter((x) => x.includes('fastest on the market'))).toHaveLength(0)
  })

  it('does nothing while the chips do not lead the field', () => {
    const L = step(0, 2030, BEHIND)
    expect(leadsField(L.g, L.b, L.t)).toBe(false)
    expect([leaps(L).length, L.t.silicon!.lead]).toEqual([0, 0])
    const alone = chipLab({ year: 2031, patch: STATE })
    alone.b.market = toJson({ ...emptyMarket(marketKey(alone.b)), year: 2030 })
    expect(leadsField(alone.g, alone.b, alone.t)).toBe(false)   // a field of fewer than two rivals is no field
  })

  it('adds nothing when a chips wave from this asset is under three years old, and does not set the lead', () => {
    const L = chipLab({ year: 2031, patch: STATE })
    expect(announceWave(L.g, { kind: 'chips', source: 'deeptech', origin: `${L.a.id}#euv`, name: 'Leading-edge chips', size: 0.45, market: 'world', home: L.b.countryId })).not.toBeNull()
    const s = siliconOf(L.t)
    s.last = { year: 2030, index: 1, served: 1, depth: 0, win: 0, step: 0, perf: 0, quality: 0 }
    afterYearSilicon(L.g, L.a, L.b, L.t)
    expect(readTechWaves(L.g).filter((w) => w.kind === 'chips').map((w) => w.origin)).toEqual([`${L.a.id}#euv`])
    expect(s.lead).toBe(0)
    expect(logText(L.g).filter((x) => x.includes('fastest on the market'))).toHaveLength(0)
  })

  it('leaves the lead unset when announceWave refuses (its yearly cap), so the next year tries again', () => {
    const L = chipLab({ year: 2031, patch: STATE })
    for (const [kind, origin] of [['ai', 'other#a'], ['space', 'other#b']] as const) {
      expect(announceWave(L.g, { kind, source: 'deeptech', origin, name: 'Another wave', size: 0.3, market: 'world' })).not.toBeNull()
    }
    const s = siliconOf(L.t)
    s.last = { year: 2030, index: 1, served: 1, depth: 0, win: 0, step: 0, perf: 0, quality: 0 }
    afterYearSilicon(L.g, L.a, L.b, L.t)
    expect(leaps(L)).toHaveLength(0)
    expect(s.lead).toBe(0)
    expect(s.applied).toBe(2030)
    expect(logText(L.g).filter((x) => x.includes('fastest on the market'))).toHaveLength(0)
  })

  it('draws no dice and a second call changes nothing', () => {
    const L = step(0)
    const once = JSON.stringify([L.g, L.b])
    afterYearSilicon(L.g, L.a, L.b, L.t)
    expect(JSON.stringify([L.g, L.b])).toBe(once)
    const fresh = chipLab({ year: 2031, patch: STATE })
    const rng = JSON.stringify(fresh.g.rng)
    siliconOf(fresh.t).last = { year: 2030, index: 1, served: 1, depth: 0, win: 0, step: 0, perf: 0, quality: 0 }
    afterYearSilicon(fresh.g, fresh.a, fresh.b, fresh.t)
    expect(JSON.stringify(fresh.g.rng)).toBe(rng)
  })
})

describe('voice', () => {
  it('the new strings are short and carry no em-dash', () => {
    const L = lab({ talent: true })
    const m = popup(L)
    const strings = [m.title, m.text, ...m.choices.flatMap((c) => [c.label, c.hint ?? ''])]
    for (const id of ['undercut', 'match', 'keep'] as const) {
      const X = lab()
      answer(X, popup(X), id)
      strings.push(...X.g.queue.filter((q) => q.kind === 'notice').map((q) => (q as { text: string }).text), ...logText(X.g))
    }
    for (const s of strings) {
      expect(s.length, s).toBeLessThanOrEqual(180)
      expect(s.includes(EM_DASH), s).toBe(false)
    }
  })
})
