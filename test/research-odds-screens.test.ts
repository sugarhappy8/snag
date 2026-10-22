// R3 fix (fog): the research odds policy holds on every screen that repeats the chance. The odds line (effort/why.ts oddsLine) reads
// "Odds likely: team +9, unknown factors" in Realistic mode and hides the terms the player cannot know. A notice, a subtitle or a confirm
// that printed "62% odds" next to that line gave the hidden terms back by subtraction, so every research screen prints its chance through
// the policy: `researchOdds` (the band), `oddsChip` (a row's chip) and `hintOdds` (a purple hint). Exact mode keeps today's text.
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { techOf } from '../src/game/business/deeptech-core'
import { PROGRAMS } from '../src/game/business/deeptech-data'
import { startProgram } from '../src/game/business/deeptech-rd'
import { heavyCost, startHeavy } from '../src/game/business/heavy-rd'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { opsProgram } from '../src/game/business/lab-data'
import { doHire, doOps } from '../src/game/business/lab-year'
import { productIdeas } from '../src/game/business/products'
import { rdRange, startRd } from '../src/game/business/rd'
import { readBiz } from '../src/game/business/state'
import { oddsChip, hintOdds, researchOdds } from '../src/game/effort/why'
import { revealPolicyOf } from '../src/game/effort/hooks'
import { isExact } from '../src/game/knowledge/mode'
import { HINT_EMOJI } from '../src/game/talents'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { inFog } from './knowledge-kit'
import { adultIn, found } from './deeptech-kit'
import { labGame, PATENT_COUNTRY, PATENT_TRADE } from './lab-kit'
import { allNodes, nextYear } from './market-kit'

/** A percent printed as the chance of research: "62% odds", "62% base odds", "about 62% odds". */
const EXACT_ODDS = /\d+%\s+(?:base\s+)?odds/i

/** A purple hint is read by the hint lens, which turns a figure after "about" into a fallible reading; only a bare percent is a leak. */
const BARE_ODDS = /(?<!about )(?<!\d)\d+%\s+(?:base\s+)?odds/i

/** Every string a company screen shows or asks, with the confirm of each action. */
function everything(g: GameState, a: Asset): string[] {
  const out: string[] = []
  for (const n of allNodes(g, businessAssetView(g, a)) as MenuNode[]) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '')
      if (n.type === 'menu' && n.header) out.push(n.header(g))
      if (n.type === 'action') out.push(n.confirm?.(g) ?? '')
    }
  }
  return out.filter((t) => t !== '')
}

const notices = (g: GameState): string[] => g.queue.flatMap((m) => (m.kind === 'notice' ? [m.text] : []))

describe('the three helpers', () => {
  it('print the exact figure when every number shows', () => {
    const { g } = labGame(51, 'restaurant')
    expect(isExact()).toBe(true)
    expect(researchOdds(g, 0.62)).toBe('62%')
    expect(oddsChip(g, 0.62)).toBe('62% odds')
    expect(oddsChip(g, 0.62, 'base odds')).toBe('62% base odds')
    expect(hintOdds(g, 0.62)).toBe('62%')
  })

  it('print a word without the talent and "about N%" with it, never the figure', () => {
    inFog(() => {
      const plain = labGame(52, 'restaurant').g
      plain.character.talents = []
      expect(revealPolicyOf(plain).exact).toBe(false)
      expect(researchOdds(plain, 0.62)).toBe('likely')
      expect(oddsChip(plain, 0.62)).toBe('odds likely')
      expect(oddsChip(plain, 0.62, 'base odds')).toBe('base odds likely')
      const gifted = labGame(53, 'restaurant').g
      gifted.character.talents = ['Business']
      expect(researchOdds(gifted, 0.62)).toBe('about 60%')
      expect(oddsChip(gifted, 0.62)).toBe('odds about 60%')
      // a hint is read by the hint lens, which fogs a figure after "about" once
      expect(hintOdds(plain, 0.62)).toBe('about 62%')
    })
  })
})

describe('Realistic: no research screen prints the chance as a percent', () => {
  for (const talents of [[], ['Business']] as const) {
    const who = talents.length === 0 ? 'without the talent' : 'with the Business talent'

    it(`a trade with Heavy R&D, Operations R&D and a running product project, ${who}`, () => {
      const { g, a, b } = labGame(61, PATENT_TRADE, { country: PATENT_COUNTRY })
      g.character.talents = [...talents]
      // start one of each, in Exact, as the player would; then read every screen and every notice in Realistic
      const idea = productIdeas(g, b, 3)[0]!
      const budget = rdRange(b, idea).normal
      expect(heavyCost(g, b)).not.toBeNull()
      g.queue = []
      inFog(() => {
        const started: string[] = []
        const name = breakthroughsFor(b.industry)[0]!.name
        expect(startHeavy(g, a, b, name)).not.toBeNull()
        started.push(...notices(g))
        g.queue = []
        expect(doHire(g, a)).toBe(true)
        expect(doOps(g, a, 'ops.cost.1')).toBe(true)
        started.push(...notices(g))
        g.queue = []
        expect(startRd(g, a, readBiz(g, a), idea, budget)).not.toBeNull()
        started.push(...notices(g))
        const leaks: string[] = started.filter((t) => EXACT_ODDS.test(t))
        expect(started.join(' ')).toMatch(/[Oo]dds/)
        const texts = everything(g, a)
        expect(texts.length).toBeGreaterThan(50)
        leaks.push(...texts.filter((t) => (t.startsWith(HINT_EMOJI) ? BARE_ODDS : EXACT_ODDS).test(t)))
        expect(leaks, 'every text that prints the chance as a percent').toEqual([])
        // the dev list and the Heavy rows really are among what was read: they speak of odds
        expect(texts.some((t) => /odds (?:likely|about|even|a long|unlikely|very|almost)/i.test(t) || /Odds (?:likely|about|even|a long|unlikely|very|almost)/.test(t))).toBe(true)
      })
    })
  }

  it('a deep-tech lab: the programs, the grants and the preview read through the policy too', () => {
    const g = adultIn('us', 6_000_000, 8, 95, PRESENT_YEAR)
    const a = found(g, 'robotics')
    const b = readBiz(g, a)
    const t = techOf(b)
    const def = PROGRAMS.robotics.find((p) => p.gate(t, b.countryId) === null)!
    expect(startProgram(g, b, t, def)).not.toBeNull()
    inFog(() => {
      const texts = everything(g, a)
      const leaks = texts.filter((x) => EXACT_ODDS.test(x))
      expect(leaks, 'every text that prints the chance as a percent').toEqual([])
      expect(texts.some((x) => /base odds (?:likely|even|a long|unlikely|very|almost|about)/.test(x)), 'the program rows speak of base odds').toBe(true)
      expect(texts.some((x) => /odds (?:likely|even|a long|unlikely|very|almost|about)/.test(x) && !/base odds/.test(x)), 'the grant rows speak of odds').toBe(true)
    })
    expect(everything(g, a).some((x) => /\d+% base odds/.test(x))).toBe(true)
  })

  it('Exact mode keeps the text of the chance, character for character', () => {
    const { g, a, b } = labGame(62, PATENT_TRADE, { country: PATENT_COUNTRY })
    const name = breakthroughsFor(b.industry)[0]!.name
    g.queue = []
    expect(startHeavy(g, a, b, name)).not.toBeNull()
    expect(notices(g).join(' ')).toMatch(/has \d+% odds in about \d+ years\. If it flops/)
    nextYear(g)
    expect(everything(g, a).some((t) => /\d+% odds/.test(t))).toBe(true)
    expect(opsProgram('ops.cost.1')).toBeDefined()
  })
})
