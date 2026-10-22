// R3-G7 (H.6): odds to words. One helper decides how a chance is shown: words by default, a percent to the nearest 5 (and
// fallible, because it is read off an honest estimate) with the Business talent or after a read, today's text in Exact mode.
// The board and group votes print their odds through it, and the same file binds the reveal policy the research lines read.
//
//   words     without the talent or a read, a vote's odds are one of seven words; no digit leaks
//   percent   with the talent: "about 65%", a multiple of 5 within the honest band; after a read: the percent for that key only
//   stable    the same call twice is the same text; nothing is drawn (g.rng) and nothing is written
//   exact     Exact mode prints "about 85%" exactly as before, and oddsText(p) without a game is unchanged
//   policy    the hook of effort/hooks.ts: Realistic shows words, hides what the player can't know, Exact is EXACT_POLICY
//
// The suite runs in Exact (test/setup-exact.ts); every Realistic case goes through inFog (test/knowledge-kit.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { passOdds, type Proposal } from '../src/game/business/board'
import { capexCaption, passHint } from '../src/game/business/board-menu'
import { boardOddsKey, oddsText } from '../src/game/business/board-vote'
import { businessView } from '../src/game/business/manage'
import { bizOf } from '../src/game/business/state'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupView } from '../src/game/business/conglomerate-menu'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { installManager, managerCandidate } from '../src/game/business/career'
import { EXACT_POLICY, revealPolicyOf } from '../src/game/effort/hooks'
import { oddsLine, whyNodes } from '../src/game/effort/why'
import type { Quote, Reason, TermKey } from '../src/game/effort/types'
import {
  RESEARCH_ODDS,
  exactOddsText,
  hasOddsRead,
  oddsKey,
  oddsLean,
  oddsRead,
  oddsShown,
  oddsView,
  oddsWord,
  type OddsWord,
} from '../src/game/fog/odds/contract'
import { know, learn } from '../src/game/knowledge/contract'
import { parseKey, ruleOf } from '../src/game/knowledge/keys'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { adult, company } from './market-kit'
import { makeTestGame } from './helpers'
import { coverage, deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'

const ROOT = join(__dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const WORDS: readonly OddsWord[] = ['almost no chance', 'a long shot', 'unlikely', 'even money', 'likely', 'very likely', 'almost certain']
const HINT = '\u{1F52E}'

/** Today's board-vote text, written out here on purpose: the helper must not change a character of it. */
function oldOddsText(p: number): string {
  const v = Math.round(Math.min(1, Math.max(0, p)) * 100)
  return v >= 99 ? 'almost certain' : v <= 1 ? 'almost no chance' : `about ${v}%`
}

const GRID = Array.from({ length: 101 }, (_, i) => i / 100)
const KEY = 'odds:biz7:ownerPay:p'

/** A game with the Business talent (or without it), a 2026 calendar and its own life id. Shares its parts with a base game: read it, never write or freeze it. */
function lifeOf(i: number, talent: boolean): GameState {
  return fogGame(i, { talents: talent ? ['Business'] : [] })
}

/** A game of its own, for a case that keeps a read (learn writes flags) or freezes the game. */
function ownLife(i: number, talent: boolean): GameState {
  const g = makeTestGame(1, { talents: talent ? ['Business'] : [] })
  g.lifeId = `own-life-${i}`
  return g
}

describe('oddsWord: seven words for a chance', () => {
  it('climbs from "almost no chance" to "almost certain" and every word is reachable', () => {
    const seen = GRID.map((p) => oddsWord(p))
    expect(new Set(seen)).toEqual(new Set(WORDS))
    let at = -1
    for (const w of seen) {
      const i = WORDS.indexOf(w)
      expect(i).toBeGreaterThanOrEqual(at)
      at = i
    }
    expect(oddsWord(0)).toBe('almost no chance')
    expect(oddsWord(1)).toBe('almost certain')
    expect(oddsWord(0.5)).toBe('even money')
  })

  it('clamps a chance outside 0..1 and survives a number that is not one', () => {
    expect(oddsWord(-4)).toBe('almost no chance')
    expect(oddsWord(7)).toBe('almost certain')
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(WORDS).toContain(oddsWord(bad))
  })
})

describe('Exact mode: today\'s text, character for character', () => {
  it('exactOddsText and oddsText(p) without a game are the old text over the whole grid', () => {
    for (const p of GRID) {
      expect(exactOddsText(p)).toBe(oldOddsText(p))
      expect(oddsText(p)).toBe(oldOddsText(p))
    }
    expect(oddsText(0.854)).toBe('about 85%')
    expect(oddsText(0.995)).toBe('almost certain')
    expect(oddsText(0.004)).toBe('almost no chance')
  })

  it('oddsRead, oddsView and oddsText(p, g, key) print the old text in Exact mode', () => {
    const g = lifeOf(1, false)
    for (const p of GRID) {
      expect(oddsRead(g, KEY, p)).toBe(oldOddsText(p))
      expect(oddsText(p, g, KEY)).toBe(oldOddsText(p))
      const v = oddsView(g, KEY, p)
      expect(v.text).toBe(oldOddsText(p))
      expect(v.mid).toBe(p)
      expect(v.exact).toBe(true)
    }
  })

  it('a caption shows only with the talent in Exact mode, marked with the crystal ball, whatever a read says', () => {
    const talent = ownLife(2, true)
    const plain = ownLife(2, false)
    expect(oddsShown(talent, KEY, 0.62)).toBe(`${HINT} about 62%`)
    expect(oddsShown(plain, KEY, 0.62)).toBeNull()
    learn(plain, KEY, { mid: 0.7, sd: 0.08, src: 'report' })
    expect(oddsShown(plain, KEY, 0.62)).toBeNull()
    // The odds are computed only when a caption will show them.
    let asked = 0
    oddsShown(plain, KEY, () => ++asked)
    expect(asked).toBe(0)
    oddsShown(talent, KEY, () => ++asked)
    expect(asked).toBe(1)
  })

  it('oddsLean is the true side of even money in Exact mode', () => {
    const g = lifeOf(3, false)
    expect(oddsLean(g, KEY, 0.5)).toBe(true)
    expect(oddsLean(g, KEY, 0.499)).toBe(false)
  })
})

describe('Realistic without the talent: words, never a digit', () => {
  it('prints one of the seven words for any chance, key, year and life', () => {
    inFog(() => {
      for (let i = 0; i < 60; i++) {
        for (const p of [0.03, 0.2, 0.5, 0.7, 0.9]) {
          const g = lifeOf(i, false)
          const text = oddsRead(g, `odds:biz${i}:capex:p`, p)
          expect(WORDS).toContain(text)
          expect(text).not.toMatch(/\d/)
          expect(oddsText(p, g, `odds:biz${i}:capex:p`)).toBe(text)
        }
      }
    })
  })

  it('is read off the honest estimate, so it is fallible, and it follows the chance on the whole', () => {
    inFog(() => {
      let wrong = 0
      let sum = 0
      for (let i = 0; i < 400; i++) {
        const p = 0.15 + 0.7 * unitAt('words', i)
        const g = lifeOf(i, false)
        const e = know(g, `odds:biz${i}:capex:p`, p)
        expect(oddsRead(g, `odds:biz${i}:capex:p`, p)).toBe(oddsWord(e.mid))
        if (oddsWord(e.mid) !== oddsWord(p)) wrong++
        sum += WORDS.indexOf(oddsWord(e.mid)) - WORDS.indexOf(oddsWord(p))
      }
      // Fallible (some words differ from the true one) but unbiased (the misses go both ways).
      expect(wrong).toBeGreaterThan(40)
      expect(wrong).toBeLessThan(360)
      expect(Math.abs(sum / 400)).toBeLessThan(0.35)
    })
  })

  it('a chance that is all but certain or impossible reads the same way it always did', () => {
    inFog(() => {
      const g = lifeOf(4, false)
      expect(oddsRead(g, KEY, 1)).toBe('almost certain')
      expect(oddsRead(g, KEY, 0.995)).toBe('almost certain')
      expect(oddsRead(g, KEY, 0)).toBe('almost no chance')
      expect(oddsRead(g, KEY, 0.004)).toBe('almost no chance')
    })
  })

  it('never shows an exact number for a key the knowledge rules cannot fog (a word, not the truth)', () => {
    inFog(() => {
      const g = lifeOf(5, true)
      for (const bad of ['not a key', 'x:y', `odds:${'z'.repeat(80)}:q:p`]) {
        const t = oddsRead(g, bad, 0.62, 'Business')
        expect(WORDS.concat(['about 60%' as never])).toContain(t)
        expect(t).not.toBe('about 62%')
      }
    })
  })
})

describe('Realistic with the Business talent: a percent to the nearest 5, inside the band', () => {
  it('prints "about N%" with N a multiple of 5, the nearest 5 of the estimate, and inside its 80% band', () => {
    inFog(() => {
      let pct = 0
      for (let i = 0; i < 300; i++) {
        const p = 0.1 + 0.8 * unitAt('pct', i)
        const g = lifeOf(i, true)
        const key = `odds:biz${i}:ownerPay:p`
        const e = know(g, key, p)
        const text = oddsRead(g, key, p)
        const m = /^about (\d+)%$/.exec(text)
        if (!m) {
          expect(['almost certain', 'almost no chance']).toContain(text)
          continue
        }
        pct++
        const n = Number(m[1])
        expect(n % 5).toBe(0)
        expect(n).toBe(Math.round(e.mid * 20) * 5)
        expect(n).toBeGreaterThanOrEqual(Math.floor(e.lo * 100) - 3)
        expect(n).toBeLessThanOrEqual(Math.ceil(e.hi * 100) + 3)
      }
      expect(pct).toBeGreaterThan(250)
    })
  })

  it('is fallible: the percent is not always the true chance to the nearest 5', () => {
    inFog(() => {
      let off = 0
      for (let i = 0; i < 200; i++) {
        const p = 0.2 + 0.6 * unitAt('fall', i)
        const n = /^about (\d+)%$/.exec(oddsRead(lifeOf(i, true), `odds:biz${i}:ownerPay:p`, p))
        if (n && Number(n[1]) !== Math.round(p * 20) * 5) off++
      }
      expect(off).toBeGreaterThan(40)
    })
  })

  it('captions carry the crystal ball and the same percent', () => {
    inFog(() => {
      const g = lifeOf(6, true)
      const text = oddsRead(g, KEY, 0.62)
      expect(oddsShown(g, KEY, 0.62)).toBe(`${HINT} ${text}`)
      expect(oddsText(0.62, g, KEY)).toBe(text)
    })
  })

  it('oddsLean follows the reading the player has, not the truth', () => {
    inFog(() => {
      let flips = 0
      for (let i = 0; i < 300; i++) {
        const g = lifeOf(i, true)
        const key = `odds:biz${i}:capex:p`
        const lean = oddsLean(g, key, 0.5)
        expect(lean).toBe(oddsView(g, key, 0.5).mid >= 0.5)
        if (!lean) flips++
      }
      // At exactly even money the reading falls on either side about half the time.
      expect(flips).toBeGreaterThan(90)
      expect(flips).toBeLessThan(210)
    })
  })
})

describe('after a read: the percent for that key, and only that key', () => {
  it('a stored read turns the words into a percent for its own key', () => {
    inFog(() => {
      const g = ownLife(7, false)
      const read = 'odds:biz7:capex:p'
      const other = 'odds:biz7:ownerPay:p'
      expect(WORDS).toContain(oddsRead(g, read, 0.7))
      expect(hasOddsRead(g, read)).toBe(false)
      expect(learn(g, read, { mid: 0.7, sd: 0.08, src: 'report' })).not.toBeNull()
      expect(hasOddsRead(g, read)).toBe(true)
      expect(hasOddsRead(g, other)).toBe(false)
      expect(oddsRead(g, read, 0.7)).toBe('about 70%')
      expect(WORDS).toContain(oddsRead(g, other, 0.7))
      expect(oddsShown(g, read, 0.7)).toBe('about 70%')
      expect(oddsShown(g, other, 0.7)).toBeNull()
      expect(oddsLean(g, read, 0.7)).toBe(true)
    })
  })

  it('a read of another life or from a year ahead is not a read', () => {
    inFog(() => {
      const mine = ownLife(8, false)
      const key = 'odds:biz8:capex:p'
      learn(mine, key, { mid: 0.7, sd: 0.08, src: 'report' })
      const heir = { ...mine, character: { ...mine.character, id: 'someone-else' } } as GameState
      expect(hasOddsRead(heir, key)).toBe(false)
      const early = { ...mine, year: mine.year - 1 } as GameState
      expect(hasOddsRead(early, key)).toBe(false)
    })
  })
})

describe('honest, stable and pure', () => {
  it('the same call twice is the same text, in a year and across a deep freeze', () => {
    inFog(() => {
      for (const talent of [false, true]) {
        const g = ownLife(9, talent)
        const first = oddsRead(g, KEY, 0.62)
        expect(oddsRead(g, KEY, 0.62)).toBe(first)
        expect(oddsView(g, KEY, 0.62).text).toBe(first)
        expect(oddsRead(deepFreeze(ownLife(9, talent)), KEY, 0.62)).toBe(first)
      }
    })
  })

  it('draws no random number and writes nothing', () => {
    inFog(() => {
      const g = makeTestGame(11, { talents: ['Business'] })
      const before = JSON.stringify(g)
      const rng = g.rng
      for (const p of GRID) {
        oddsRead(g, KEY, p)
        oddsShown(g, KEY, p)
        oddsLean(g, KEY, p)
        oddsText(p, g, KEY)
      }
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
    })
  })

  it('the 80% band holds the truth about 80% of the time, with and without the talent', () => {
    inFog(() => {
      for (const talent of [false, true]) {
        const share = coverage(10_000, (i) => {
          const truth = 0.25 + 0.5 * unitAt('cov', i)
          return { est: know(lifeOf(i, talent), `odds:biz${i % 40}:capex:p`, truth), truth }
        })
        expect(share).toBeGreaterThan(0.77)
        expect(share).toBeLessThan(0.83)
      }
    })
  })
})

describe('keys', () => {
  it('oddsKey is a valid knowledge key of the odds kind, whatever the id', () => {
    for (const [id, kind] of [
      ['biz7', 'ownerPay'],
      ['biz123456789', 'g-merge'],
      ['an id with spaces', 'kind/with/slashes'],
      ['x'.repeat(200), 'k'.repeat(200)],
      ['', ''],
    ] as const) {
      const key = oddsKey(id, kind)
      expect(key.length).toBeLessThanOrEqual(64)
      const parsed = parseKey(key)
      expect(parsed, key).not.toBeNull()
      expect(parsed!.kind).toBe('odds')
      expect(parsed!.field).toBe('p')
      expect(ruleOf(key)?.unit).toBe('odds')
    }
    expect(oddsKey('biz7', 'ownerPay')).toBe('odds:biz7:ownerPay:p')
  })

  it('a board vote has one key per company and kind', () => {
    const a = { id: 'biz9' } as Asset
    expect(boardOddsKey(a, 'capex')).toBe('odds:biz9:capex:p')
    expect(boardOddsKey(a, 'mandate')).not.toBe(boardOddsKey(a, 'capex'))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The reveal policy the research lines read (effort/hooks.ts)

function quoteOf(p: number, lines: ReadonlyArray<readonly [TermKey, number]>): Quote {
  const reasons: Reason[] = lines.map(([key, pts]) => ({ key, label: key === 'hard' ? 'hard field' : key, pts }))
  return {
    p,
    hitP: 0,
    years: 3,
    yearsExact: 3,
    quality: null,
    spread: 0,
    k: 1,
    spend: 0,
    payrollX: 1,
    reasons,
    effort: { crew: 0, tools: 0, rho: 1, phi: 1, speed: 1 },
    risk: { shortcut: 0, explosion: 0, scandal: 0 },
    burnout: false,
    capped: [],
  }
}

const EXAMPLE = quoteOf(0.62, [
  ['team', 9],
  ['funding', 7],
  ['hard', -12],
  ['tired', -4],
])
const OWN: TermKey[] = ['team', 'funding', 'crew', 'tools', 'know', 'tired', 'bold', 'ceo']
const OTHERS: TermKey[] = ['hard', 'rival', 'spill']

describe('the reveal policy', () => {
  it('is EXACT_POLICY in Exact mode, so the research lines print every number as before', () => {
    const g = lifeOf(12, false)
    expect(revealPolicyOf(g)).toBe(EXACT_POLICY)
    expect(oddsLine(EXAMPLE, revealPolicyOf(g))).toBe('Odds 62%: team +9, funding +7, hard field -12, tired -4')
  })

  it('Realistic without the talent: words, the player\'s own terms, and "unknown factors" for the rest', () => {
    inFog(() => {
      const g = lifeOf(13, false)
      const pol = revealPolicyOf(g)
      expect(pol.exact).toBe(false)
      for (const t of OWN) expect(pol.knows(t)).toBe(true)
      for (const t of OTHERS) expect(pol.knows(t)).toBe(false)
      expect(pol.band(0.62)).toBe('likely')
      expect(pol.band(0.5)).toBe('even money')
      expect(WORDS).toContain(pol.band(0.2))
      const line = oddsLine(EXAMPLE, pol)
      expect(line).toBe('Odds likely: team +9, funding +7, tired -4, unknown factors')
      expect(line).not.toMatch(/12/)
      const rows = whyNodes(g, EXAMPLE).map((r) => r.text)
      expect(rows[0]).toBe(line)
      expect(rows.join(' ')).not.toMatch(/12|hard/)
    })
  })

  it('Realistic with the Business talent: "about N%" to the nearest 5, and every term', () => {
    inFog(() => {
      const g = lifeOf(14, true)
      const pol = revealPolicyOf(g)
      expect(pol.exact).toBe(false)
      for (const t of [...OWN, ...OTHERS]) expect(pol.knows(t)).toBe(true)
      expect(pol.band(0.62)).toBe('about 60%')
      expect(pol.band(0.63)).toBe('about 65%')
      expect(oddsLine(EXAMPLE, pol)).toBe('Odds about 60%: team +9, funding +7, hard field -12, tired -4')
    })
  })

  it('a stored read of research odds opens the percent and the hidden terms, for a life without the talent', () => {
    inFog(() => {
      const g = ownLife(15, false)
      expect(revealPolicyOf(g).knows('hard')).toBe(false)
      // A read of some other odds does not count as a read of research.
      learn(g, 'odds:biz15:capex:p', { mid: 0.7, sd: 0.08, src: 'report' })
      expect(revealPolicyOf(g).knows('hard')).toBe(false)
      expect(learn(g, `${RESEARCH_ODDS}food:p`, { mid: 0.6, sd: 0.1, src: 'analyst' })).not.toBeNull()
      const pol = revealPolicyOf(g)
      for (const t of OTHERS) expect(pol.knows(t)).toBe(true)
      expect(pol.band(0.62)).toBe('about 60%')
    })
  })

  it('draws nothing and writes nothing', () => {
    inFog(() => {
      const g = makeTestGame(16, { talents: ['Business'] })
      const before = JSON.stringify(g)
      const rng = g.rng
      const pol = revealPolicyOf(g)
      for (const p of GRID) pol.band(p)
      for (const t of [...OWN, ...OTHERS]) pol.knows(t)
      oddsLine(EXAMPLE, pol)
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The board menus

interface Board {
  g: GameState
  a: Asset
  talent: boolean
}

/** A restaurant company with outside owners (so it has a board that can say no), for a life with or without the talent. */
function boardLife(seed: number, talent: boolean): Board {
  const g = adult(seed, 2026, 'us')
  const a = company(g, 'restaurant', { cash: 20_000_000 })
  g.character.talents = talent ? ['Business'] : []
  bizOf(g, a).share = 0.6
  return { g, a, talent }
}

/** A proposal near even money: the owner asks the board for a raise. */
const RAISE: Proposal = { kind: 'ownerPay', by: 'owner', amount: 3_000_000, label: 'Raise your salary' }

const SEEDS = [3, 4, 5, 6, 7, 8]

function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 5 ? [n, ...all(g, n.children(g), depth + 1)] : [n]))
}

describe('the board screens print odds through the helper', () => {
  it('Exact mode: the hint and the caption are today\'s strings', () => {
    for (const seed of SEEDS) {
      const { g, a } = boardLife(seed, true)
      const b = bizOf(g, a)
      const p = passOdds(g, a, b, RAISE)
      const word = oldOddsText(p)
      expect(passHint(g, a, b, RAISE)).toBe(`${HINT} ${p >= 0.5 ? `The board will likely say yes (${word})` : `The board will likely say no (${word} to pass)`}`)
      const cap = capexCaption(g, a, b, 1e9, 0)
      expect(cap).toMatch(/^ · past this year's budget: needs the board \(\u{1F52E} (about \d+%|almost certain|almost no chance) to pass\)$/u)
    }
  })

  it('Exact mode without the talent: no odds anywhere on the board rows', () => {
    const { g, a } = boardLife(3, false)
    const b = bizOf(g, a)
    expect(passHint(g, a, b, RAISE)).toBeNull()
    expect(capexCaption(g, a, b, 1e9, 0)).toBe(" · past this year's budget: needs the board")
  })

  it('Realistic with the talent: "about N%" to the nearest 5, and the same text twice', () => {
    inFog(() => {
      let percents = 0
      for (const seed of SEEDS) {
        const { g, a } = boardLife(seed, true)
        const b = bizOf(g, a)
        const hint = passHint(g, a, b, RAISE)!
        expect(passHint(g, a, b, RAISE)).toBe(hint)
        const m = /\(about (\d+)%( to pass)?\)$/.exec(hint)
        if (m) {
          percents++
          expect(Number(m[1]) % 5).toBe(0)
        } else expect(hint).toMatch(/\((almost certain|almost no chance)( to pass)?\)$/)
        const cap = capexCaption(g, a, b, 1e9, 0)
        expect(capexCaption(g, a, b, 1e9, 0)).toBe(cap)
        expect(cap).toMatch(/\(\u{1F52E} (about \d+%|almost certain|almost no chance) to pass\)$/u)
      }
      expect(percents).toBeGreaterThan(2)
    })
  })

  it('Realistic: the "likely yes" or "likely no" follows the reading the player has', () => {
    inFog(() => {
      for (const seed of SEEDS) {
        const { g, a } = boardLife(seed, true)
        const b = bizOf(g, a)
        const p = passOdds(g, a, b, RAISE)
        const lean = oddsLean(g, boardOddsKey(a, RAISE.kind), p)
        expect(passHint(g, a, b, RAISE)).toContain(lean ? 'will likely say yes' : 'will likely say no')
      }
    })
  })

  it('Realistic without the talent: nothing shows until a read of that vote is kept, then its percent, with no crystal ball', () => {
    inFog(() => {
      const { g, a } = boardLife(5, false)
      const b = bizOf(g, a)
      const plain = " · past this year's budget: needs the board"
      expect(capexCaption(g, a, b, 1e9, 0)).toBe(plain)
      learn(g, boardOddsKey(a, 'capex'), { mid: 0.8, sd: 0.08, src: 'report' })
      expect(capexCaption(g, a, b, 1e9, 0)).toBe(`${plain} (about 80% to pass)`)
      // A read of the capex vote says nothing about another vote of the same board.
      expect(passHint(g, a, b, RAISE)).toBeNull()
    })
  })

  it('Realistic: the mandate and budget hints read through the helper and print no exact percent', () => {
    inFog(() => {
      let heard = 0
      for (const seed of SEEDS) {
        const { g, a } = boardLife(seed, true)
        const hints = all(g, businessView(g, a))
          .filter((n) => n.type === 'action' && n.id.startsWith('biz.board.'))
          .map((n) => (n.type === 'action' ? (n.hint?.(g) ?? '') : ''))
          .filter((h) => /would likely (approve|refuse)|will likely say/.test(h))
        for (const h of hints) {
          heard++
          expect(h).toMatch(/\((about \d+%|almost certain|almost no chance)( to pass)?\)/)
          for (const m of h.matchAll(/(\d+)%/g)) expect(Number(m[1]) % 5, h).toBe(0)
        }
      }
      expect(heard).toBeGreaterThan(3)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The group board

/** A group of two divisions with outside shareholders (so it has a board), for a life with the Business talent. */
function groupLife(seed: number, talent: boolean): { g: GameState; id: string } {
  const g = makeTestGame(seed, { age: 45, money: 1e9, talents: talent ? ['Business'] : [] })
  for (const [i, industry] of (['solar', 'logistics'] as const).entries()) {
    const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
    installManager(g, b, managerCandidate(g, b, 90))
    g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
  }
  if (!formGroup(g, g.assets.map((a) => a.id), 'Atlas')) throw new Error('no group')
  const id = groupsOf(g)[0]!.core.id
  const grp = liveGroup(g, id)!
  grp.core.share = 0.6
  saveGroup(g, grp)
  g.queue = []
  return { g, id }
}

/** The subtitles of the group's rows that carry a board vote. */
function groupVotes(g: GameState, id: string): string[] {
  const out: string[] = []
  for (const n of all(g, groupView(g, id))) {
    if (n.type === 'info' || n.type === 'heading') continue
    const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
    if (/group board votes/.test(sub)) out.push(sub)
  }
  return out
}

describe('the group board prints odds through the helper', () => {
  const ODDS = /the group board votes \(\u{1F52E} (about \d+%|almost certain|almost no chance) to pass\)/u

  it('Exact mode: the caption is today\'s, only with the talent', () => {
    const talent = groupLife(21, true)
    const withOdds = groupVotes(talent.g, talent.id).filter((s) => /group board votes \(/.test(s))
    expect(withOdds.length).toBeGreaterThan(0)
    for (const s of withOdds) expect(s).toMatch(ODDS)
    const plain = groupLife(21, false)
    const found = groupVotes(plain.g, plain.id)
    expect(found.length).toBeGreaterThan(0)
    for (const s of found) expect(s).not.toMatch(/\d+%|almost|\u{1F52E}/u)
  })

  it('Realistic with the talent: a percent to the nearest 5 (or the extreme words), stable', () => {
    inFog(() => {
      const { g, id } = groupLife(22, true)
      const found = groupVotes(g, id).filter((s) => /group board votes \(/.test(s))
      expect(found.length).toBeGreaterThan(0)
      expect(groupVotes(g, id).filter((s) => /group board votes \(/.test(s))).toEqual(found)
      for (const s of found) {
        for (const m of s.matchAll(/(\d+)%/g)) expect(Number(m[1]) % 5, s).toBe(0)
        expect(s).toMatch(ODDS)
      }
    })
  })

  it('Realistic without the talent: no odds on the group rows', () => {
    inFog(() => {
      const { g, id } = groupLife(23, false)
      for (const s of groupVotes(g, id)) expect(s).not.toMatch(/\d+%|almost|\u{1F52E}/u)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The guards: the sites pass a game and a key, and the new files keep the voice

/** The number of arguments of every `oddsText(` call in `text` (calls inside the parentheses of another call count on their own). */
function oddsTextCalls(text: string): number[] {
  const out: number[] = []
  const re = /\boddsText\(/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 20), m.index)
    if (/import\s*\{[^}]*$/.test(before) || /function\s+$/.test(before)) continue
    let depth = 1
    let commas = 0
    let nonEmpty = false
    for (let i = m.index + m[0].length; i < text.length && depth > 0; i++) {
      const c = text[i]!
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') depth--
      else if (c === ',' && depth === 1) commas++
      if (depth > 0 && !/\s/.test(c)) nonEmpty = true
    }
    out.push(nonEmpty ? commas + 1 : 0)
  }
  return out
}

describe('every board odds site passes the game and a key', () => {
  const SITES = ['src/game/business/board-menu.ts', 'src/game/business/manage.ts', 'src/game/business/conglomerate-menu.ts']
  for (const file of SITES) {
    it(`${file}: no oddsText call is left on the exact-only form`, () => {
      const calls = oddsTextCalls(read(file))
      expect(calls.length).toBeGreaterThan(0)
      for (const n of calls) expect(n).toBe(3)
    })
  }

  it('the captions go through oddsShown, which owns the talent check, so no site tests the talent to print odds', () => {
    expect(read('src/game/business/board-menu.ts').match(/\boddsShown\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(read('src/game/business/manage.ts').match(/\boddsShown\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(read('src/game/business/conglomerate-menu.ts').match(/\boddsShown\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    for (const file of SITES) expect(read(file)).not.toMatch(/hasTalent\([^)]*'Business'\)\s*\?\s*`[^`]*oddsText/)
  })
})

describe('the voice', () => {
  const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  for (const file of ['src/game/fog/odds/odds.ts', 'src/game/fog/odds/contract.ts']) {
    it(`${file} holds no en-dash or em-dash`, () => {
      expect(read(file)).not.toMatch(DASH)
    })
  }

  it('the seven words are plain, lower case and free of dashes', () => {
    for (const w of WORDS) expect(w).toMatch(/^[a-z ]+$/)
  })
})
