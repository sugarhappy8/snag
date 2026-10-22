// Fame career: the first dedicated test of special/fame.ts. A podcast audience has a real-world
// ceiling (the biggest shows reach 20 to 40 million listeners), so the listener count is capped at
// 30,000,000 wherever it is written or loaded, and the yearly ad income follows the era and the
// country through payScale. The cap draws nothing, so the early years are unchanged.
import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { ownerKey } from '../src/game/special/common'
import { payScale } from '../src/game/special/pay-scale'
import { fameMenu, yearlyFame } from '../src/game/special/fame'
import type { ChoiceModal, GameState, MenuAction } from '../src/game/types'
import { makeTestGame } from './helpers'

const MAX_AUDIENCE = 30_000_000
/** The most a year of ads can pay: the whole audience at 0.9 a listener. */
const MAX_AD_INCOME = 27_000_000
const SEEDS = [1, 2, 3, 4, 5]

function fameAction(g: GameState, id: string): MenuAction {
  const node = fameMenu.children(g).find((n) => 'id' in n && n.id === id)
  if (!node || node.type !== 'action') throw new Error(`no fame action ${id}`)
  return node
}

type PodcastRecord = { name: string; listeners: number; episodes: number; startedAge: number }

function podcastOf(g: GameState): PodcastRecord | null {
  const raw = g.flags['special.fame'] as unknown as { podcast?: PodcastRecord | null } | undefined
  return raw?.podcast ?? null
}

/** A 30 year old at fame 100 in the given year and country, with a podcast already running. */
function podcastLife(seed: number, year = 2026, countryId = 'us'): GameState {
  const g = makeTestGame(seed, { age: 30, countryId, money: 0 })
  g.year = year
  g.character.hidden.fame = 100
  fameAction(g, 'fame.podcast.start').run(g, 'Test Show')
  g.queue = []
  return g
}

/** One year of the probe: fame held at 100, 3 episodes, then the yearly settlement. Returns the ad income. */
function playYear(g: GameState): number {
  g.yearActions = {}
  g.character.hidden.fame = 100
  for (let i = 0; i < 3; i++) fameAction(g, 'fame.podcast.record').run(g)
  g.queue = []
  const before = g.character.money
  yearlyFame(g)
  g.queue = []
  g.character.age += 1
  return g.character.money - before
}

/** Resolve every popup the actions left behind by taking the first option, until none remain. */
function settleQueue(g: GameState): void {
  for (let guard = 0; guard < 100 && g.queue.length > 0; guard++) {
    const modal = g.queue.shift()
    if (modal && modal.kind === 'choice' && modal.scriptId) {
      const pick = (modal as ChoiceModal).choices[0]
      if (pick) runScript(g, modal.scriptId, pick.id, modal.data, modal)
    }
  }
  g.queue = []
}

describe('podcast audience ceiling', () => {
  it('never passes 30 million listeners, and a year of ads never passes $27M, in the US in 2026', () => {
    for (const seed of SEEDS) {
      const g = podcastLife(seed)
      expect(payScale(g)).toBe(1)
      let last = 0
      for (let year = 1; year <= 60; year++) {
        const income = playYear(g)
        const listeners = podcastOf(g)?.listeners ?? 0
        expect(listeners, `seed ${seed} year ${year}`).toBeLessThanOrEqual(MAX_AUDIENCE)
        expect(income, `seed ${seed} year ${year}`).toBeLessThanOrEqual(MAX_AD_INCOME)
        last = income
      }
      // The ceiling holds the audience near the top; it does not zero the show.
      expect(podcastOf(g)?.listeners ?? 0, `seed ${seed} end`).toBeGreaterThan(20_000_000)
      expect(last, `seed ${seed} last year`).toBeGreaterThan(8_000_000)
    }
  })

  it('scales a year of ads by the era: at most 0.31 times as much in the US in 1930', () => {
    for (const seed of SEEDS) {
      const g = podcastLife(seed, 1930)
      expect(payScale(g)).toBeCloseTo(0.3, 10)
      for (let year = 1; year <= 60; year++) {
        const income = playYear(g)
        expect(podcastOf(g)?.listeners ?? 0, `seed ${seed} year ${year}`).toBeLessThanOrEqual(MAX_AUDIENCE)
        expect(income, `seed ${seed} year ${year}`).toBeLessThanOrEqual(0.31 * MAX_AD_INCOME)
      }
    }
  })

  it('leaves the early years alone: the same audience and the same ads as before at year 10', () => {
    // Measured on v4.0.2, before the cap, where the cap does not bind. No rand call was added or moved by the cap.
    // Re-pinned at the R2 rebaseline: text draws left g.rng (the episode topic is a pickLine), so every roll after the first
    // episode reads another g.rng position. The v4.0.2 values (listeners 7,718,721 / 2,394,063 / 4,386,985 / 5,389,965 /
    // 2,535,263, ads 3,892,655 / 1,956,152 / 1,927,710 / 3,088,109 / 1,587,102) return to the digit when pickLine takes its
    // draw from g.rng again, so the move is the rebaseline and not the cap. None of the five audiences gets near 30,000,000.
    const listenersAtTen = [2_070_070, 2_797_247, 3_128_612, 4_047_924, 1_328_690]
    const incomeAtTen = [1_651_102, 1_741_757, 1_498_566, 3_438_735, 670_805]
    SEEDS.forEach((seed, i) => {
      const g = podcastLife(seed)
      let income = 0
      for (let year = 1; year <= 10; year++) income = playYear(g)
      expect(podcastOf(g)?.listeners, `seed ${seed} listeners`).toBe(listenersAtTen[i])
      expect(income, `seed ${seed} income`).toBe(incomeAtTen[i])
    })
  })

  it('loads a saved audience of 5e11 at 30,000,000', () => {
    const g = makeTestGame(21, { age: 30 })
    g.character.hidden.fame = 100
    g.flags['special.fame'] = {
      owner: ownerKey(g),
      books: [],
      podcast: { name: 'Old Show', listeners: 5e11, episodes: 12, startedAge: 20 },
      merchLines: 0,
      commercials: 0,
    } as never
    const subtitle = fameAction(g, 'fame.podcast.record').subtitle
    expect(typeof subtitle === 'function' ? subtitle(g) : subtitle).toContain('30,000,000 listeners')
    fameAction(g, 'fame.podcast.record').run(g)
    expect(podcastOf(g)?.listeners).toBe(MAX_AUDIENCE)
    const before = g.character.money
    yearlyFame(g)
    expect(podcastOf(g)?.listeners).toBe(MAX_AUDIENCE)
    expect(g.character.money - before).toBeLessThanOrEqual(MAX_AD_INCOME)
    expect(g.character.money - before).toBeGreaterThan(0)
  })

  it('keeps money and fame finite and whole through a 40 year famous life with every fame action offered', () => {
    for (const seed of [31, 32]) {
      const ran = new Set<string>()
      const g = makeTestGame(seed, { age: 25, money: 50_000_000 })
      g.character.hidden.fame = 80
      for (let year = 0; year < 40; year++) {
        g.yearActions = {}
        g.character.hidden.fame = Math.max(g.character.hidden.fame, 60)
        for (const node of fameMenu.children(g)) {
          if (node.type !== 'action') continue
          // Keep the show alive until the last year, then end it too.
          if (node.id === 'fame.podcast.end' && year < 39) continue
          if (node.visible && !node.visible(g)) continue
          if (node.disabledReason?.(g)) continue
          node.run(g, node.input?.defaultValue?.(g))
          ran.add(node.id)
          settleQueue(g)
        }
        yearlyFame(g)
        settleQueue(g)
        g.character.age += 1
        g.year += 1
        const c = g.character
        expect(Number.isFinite(c.money) && Number.isInteger(c.money), `seed ${seed} year ${year} money ${c.money}`).toBe(true)
        expect(Number.isFinite(c.hidden.fame) && Number.isInteger(c.hidden.fame), `seed ${seed} year ${year} fame`).toBe(true)
        const listeners = podcastOf(g)?.listeners
        if (listeners !== undefined) {
          expect(Number.isInteger(listeners) && listeners >= 0 && listeners <= MAX_AUDIENCE, `seed ${seed} year ${year} listeners ${listeners}`).toBe(true)
        }
      }
      expect([...ran].sort(), `seed ${seed} actions run`).toEqual(
        ['fame.autographs', 'fame.book', 'fame.commercial', 'fame.merch', 'fame.photo', 'fame.podcast.end', 'fame.podcast.record', 'fame.podcast.start', 'fame.stunt', 'fame.talkShow'],
      )
    }
  })

  it('keeps Record an Episode to 3 a year', () => {
    const g = podcastLife(41)
    const record = fameAction(g, 'fame.podcast.record')
    for (let i = 0; i < 5; i++) record.run(g)
    expect(podcastOf(g)?.episodes).toBe(3)
    expect(g.yearActions['fame.podcast']).toBe(3)
    expect(g.queue.filter((m) => m.kind === 'notice' && m.title === 'Not again')).toHaveLength(2)
    g.yearActions = {}
    record.run(g)
    expect(podcastOf(g)?.episodes).toBe(4)
  })
})
