// R3-G8 (H.6): odds at hazards. The chances a player cannot know move to the odds helper: the politics rows (a cabinet post, a coup,
// a charge, the evidence and how likely it surfaces, a scheme's risk, a contract that gets noticed, laundering, the offshore wire,
// a power grab, jailing or exiling a rival) and the bank's "chance they recover". Words by default; a percent (nearest 5) with the
// talent or after a read of that very number; today's text in Exact mode.
//
//   exact       every row is today's string, character for character (the literals below were recorded from the builders
//               before this task, with the mode on Exact)
//   words       Realistic with no talent: no percent on any of these rows; the evidence rows keep the word "evidence"
//   talent      Leadership for the political rows, Crime for the ones about getting caught: "about N%", N a multiple of 5
//   read        a purchased reading opens the percent for the keys it read, and for no other key
//   look        every odds screen ends with "Commission a risk briefing" in Realistic, and none in Exact
//   stable/pure the same screen built twice is the same text; nothing is drawn (g.rng) and nothing is written
//   keys        every key has an owner, a truth that matches the engine and a band that holds it about 80% of the time
//
// The suite runs in Exact (test/setup-exact.ts); every Realistic case goes through inFog (test/knowledge-kit.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { forceBankEvent } from '../src/game/business/bank-events'
import { readBank, saveBank } from '../src/game/business/bank-state'
import { valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { oddsKey, oddsView } from '../src/game/fog/odds/contract'
import { checkLedger } from '../src/game/kernel/ledger'
import { know, learn, readKnow, takeReading } from '../src/game/knowledge/contract'
import { kindOfKey, labelOfKey } from '../src/game/knowledge/kinds'
import { coupChance, chargeChance, exposureChance } from '../src/game/nation/consequences'
import { launderQuote, offshoreCaught, schemeQuote, SCHEMES, steerQuote } from '../src/game/nation/graft'
import { legislatureOf } from '../src/game/nation/legislature'
import { allNationKeys, dashKeys, dirtyKeys, governKeys, keepKeys, pocketKeys } from '../src/game/nation/odds-read'
import { officeView } from '../src/game/nation/office'
import { persecuteOdds, regimeOdds } from '../src/game/nation/regime'
import { editMe, editPolicy, meView, writeMe, writePolicy } from '../src/game/nation/state'
import { specialJobNodes } from '../src/game/special'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'
import { coverage, deepFreeze, fogGame, inFog } from './knowledge-kit'
import { flowTotal } from './ledger-kit'
import { newLeader } from './politics-kit'

const ROOT = join(__dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const WORDS = ['almost no chance', 'a long shot', 'unlikely', 'even money', 'very likely', 'likely', 'almost certain']
const WORD = new RegExp(`(${WORDS.join('|')})`)
const EVIDENCE = /evidence (thin|some|solid|heavy)/
const PERCENT = /\d+(\.\d+)?%/
const ABOUT = /about (\d+)%/
// Built from char codes, so that this file carries neither character itself.
const DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
const DASH_ALL = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, 'g')
const ASSET = 'ASSET'

// ---------------------------------------------------------------------------------------------------------------------------------
// The scenes

/** A head of government in `country` with an open case, a pending case, a rival, a company the state buys from and slush money. */
function leaderScene(country = 'us', year = 2001, talents: readonly string[] = []): GameState {
  const g = newLeader(9, country, year)
  g.character.talents = [...talents]
  g.character.job!.title = 'President'
  g.character.job!.data.approval = 22
  const p = editPolicy(g, country)
  p.reports = [{ year: year - 1, growth: 0.02, unemployment: 0.05, inflation: 0.03, debt: 0.6, deficit: 0.03, approval: 50, rating: 'A' }]
  writePolicy(g, p)
  const me = editMe(g)
  me.dirty = 80_000
  me.heat = 30
  me.loyalty = 20
  me.legitimacy = 25
  me.fear = 40
  me.cases.push({ id: 'c2000-1', kind: 'graft', label: 'Road kickbacks', year: year - 1, evidence: 0.45, amount: 40_000, status: 'open', country })
  me.cases.push({ id: 'c2001-2', kind: 'graft', label: 'Ghost payroll', year, evidence: 0.6, amount: 90_000, status: 'pending', country })
  me.rivals.push({ id: 'r1', name: 'Pat Doe', role: 'party', party: 'conservative', strength: 40, mood: -20, status: 'active', goal: 'win', since: year - 1 })
  writeMe(g, me)
  const b = newBiz(g, 'construction', g.character.countryId, g.character.city, { cash: 20_000_000, quality: 70, brand: 40 })
  g.assets.push(createBusinessAsset(g, 'Test construction', b, 0))
  const job = g.character.job
  g.year += 1
  g.character.age += 1
  yearlyBusinessImpl(g)
  const biz = bizOf(g, g.assets[g.assets.length - 1]!)
  biz.last = { ...biz.last!, year: g.year - 1, revenue: 8_000_000 }
  g.queue = []
  g.character.job = job
  return g
}

/** A member of the national legislature in the party that governs: the cabinet row is on screen with odds above zero. */
function mpScene(talents: readonly string[] = []): GameState {
  const g = newLeader(6, 'gb', 2015)
  g.character.talents = [...talents]
  g.character.job = { ...g.character.job!, title: 'Member of Parliament', level: 2, data: { ...g.character.job!.data, office: 'governor', party: legislatureOf(g, 'gb').leaderParty } }
  return g
}

/** A bank with a loan book, as test/bank.test.ts builds one. */
function bankScene(talents: readonly string[] = []) {
  const country = 'us'
  const g = makeTestGame(5, { age: 40, money: 500_000_000, countryId: country, city: getCountry(country).cities[0], talents: [...talents] })
  g.year = 2030
  const b0 = newBiz(g, 'bank', country, getCountry(country).cities[0], { cash: 30_000_000, founded: g.year - 3, ownerSalary: 0 })
  b0.openFraction = 1
  const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
  g.assets.push(a)
  const b = bizOf(g, a)
  saveBank(b, readBank(b))
  b.valuation = valuationOf(b)
  g.queue = []
  return { g, a, b }
}

/** The label of the "give them time" option of a borrower in trouble. */
function extendLabel(g: GameState, a: ReturnType<typeof bankScene>['a'], b: ReturnType<typeof bankScene>['b']): string {
  g.queue = []
  expect(forceBankEvent(g, a, b, 'bigDefault')).toBe(true)
  const popup = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'bank.event')
  if (!popup || popup.kind !== 'choice') throw new Error('no popup')
  return popup.choices.find((c) => c.id === 'extend')!.label
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading a screen

type Rows = Record<string, string>

const SUB_ROWS = /^nation\.(steer|launder|offshore|regime|jail|exile|cabinet)/

/** The odds rows of the politics screens by id (an asset id reads as ASSET), and the Look closer groups by id. */
function rowsOf(g: GameState, asset?: string): Rows {
  const out: Rows = {}
  const at = (id: string): string => (asset ? id.split(asset).join(ASSET) : id)
  const walk = (nodes: MenuNode[], depth: number): void => {
    for (const n of nodes) {
      if (n.visible && !n.visible(g)) continue
      if (n.type === 'info') {
        if (/^nation\.dash\.(coup|case\.)/.test(n.id)) out[at(n.id)] = typeof n.text === 'function' ? n.text(g) : n.text
        continue
      }
      if (n.type === 'heading') continue
      const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
      if (SUB_ROWS.test(n.id) && sub) out[`${at(n.id)}#sub`] = sub
      if (n.type === 'menu') {
        if (n.id.startsWith('look.')) out[n.id] = n.label
        if (depth < 6) walk(n.children(g), depth + 1)
      } else if (n.input?.preview && n.id.startsWith('nation.scheme.') && n.input.min !== undefined) out[`${n.id}#prev`] = n.input.preview(g, 30)
    }
  }
  walk(specialJobNodes(g), 0)
  return out
}

/** The Look closer group with this id, wherever it is in the tree (null when the screen has none). */
function lookGroup(g: GameState, id: string): MenuGroup | null {
  const find = (nodes: MenuNode[]): MenuGroup | null => {
    for (const n of nodes) {
      if (n.type !== 'menu') continue
      if (n.id === id) return n
      const hit = find(n.children(g))
      if (hit) return hit
    }
    return null
  }
  return find(specialJobNodes(g))
}

const withoutFee = (s: string): string => s.replace('12% fee', 'the fee')

// ---------------------------------------------------------------------------------------------------------------------------------
// What the screens printed before this task, in Exact mode (recorded from the builders at the base commit)

const EXACT_US: Rows = {
  'nation.dash.coup': 'Coup risk this year: 25.0%',
  'nation.dash.case.c2001-2': 'Ghost payroll (2001) · public, under investigation · 29% a year they charge you once nothing protects you',
  'nation.dash.case.c2000-1': 'Road kickbacks (2000) · evidence 45% · 3% chance a year it surfaces',
  'nation.scheme.kickbacks#prev': 'Take $10,679,300 · 11% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.embezzle#prev': 'Take $8,543,500 · 13% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.permits#prev': 'Take $3,737,700 · 9% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.pardons#prev': 'Take $3,737,700 · 11% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.posts#prev': 'Take $3,203,800 · 10% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.passports#prev': 'Take $5,339,600 · 11% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.stateCut#prev': 'Take $6,407,600 · 10% chance an auditor flags it this year · leaves evidence 21%',
  'nation.scheme.cronies#prev': 'Take $9,611,400 · 12% chance an auditor flags it this year · leaves evidence 21%',
  'nation.steer.ASSET#sub': '$3,200,000 contract · $960,000 markup · 25% chance reporters notice',
  'nation.launder.ASSET#sub': 'Run $80,000 through construction books · $52,000 arrives · 18% risk',
  'nation.offshore#sub': '12% fee · 7% risk the wire is stopped',
  'nation.regime.buyMedia#sub': 'Friendly owners, friendlier headlines. $9,450,000.',
  'nation.regime.mediaLaw#sub': 'A "media responsibility" law with teeth.',
  'nation.regime.packCourts#sub': 'Add judges until the judges agree with you. Works 35%.',
  'nation.regime.termLimits#sub': 'One more term. For stability.',
  'nation.regime.emergency#sub': 'Rule by decree for two years. Works 55%.',
  'nation.regime.postpone#sub': 'Elections are "unsafe" during the emergency.',
  'nation.regime.gerrymander#sub': 'Districts shaped like your supporters. Works 38%.',
  'nation.regime.security#sub': 'Bonuses, promotions and a purge of doubters. $4,536,000.',
  'nation.regime.rig#sub': 'Make sure the right numbers come out.',
  'nation.regime.buyVotes#sub': 'Cash and groceries for voters in the right districts. $1,512,000.',
  'nation.regime.selfCoup#sub': 'The last step: no legislature, no limits.',
  'nation.jail.r1#sub': '41% the charges stick',
  'nation.exile.r1#sub': '31% they flee',
}
const EXACT_MP = 'Odds 34% · costs 10 capital'
const EXACT_BANK = 'Give them time (58% chance they recover)'

/** The assets of the scene, for the rows that carry one in their id. */
const sceneAsset = (g: GameState): string => g.assets[g.assets.length - 1]!.id

// ---------------------------------------------------------------------------------------------------------------------------------

describe('Exact mode prints today\'s text', () => {
  it('every odds row of the politics screens is the string it was before', () => {
    const g = leaderScene()
    expect(rowsOf(g, sceneAsset(g))).toEqual(EXACT_US)
  })

  it('the cabinet row and the bank option are the strings they were before', () => {
    const mp = mpScene()
    expect(rowsOf(mp)['nation.cabinet#sub']).toBe(EXACT_MP)
    const { g, a, b } = bankScene()
    expect(extendLabel(g, a, b)).toBe(EXACT_BANK)
  })

  it('shows no Look closer row, on any screen', () => {
    const g = leaderScene()
    expect(Object.keys(rowsOf(g)).filter((k) => k.startsWith('look.'))).toEqual([])
    expect(lookGroup(g, 'look.nation.dash')).toBeNull()
  })
})

describe('Realistic mode: words, never a percent, unless the talent or a read', () => {
  it('no politics row prints a percent, and each carries one of the seven words', () => {
    const g = leaderScene()
    const rows = inFog(() => rowsOf(g, sceneAsset(g)))
    let checked = 0
    for (const [id, text] of Object.entries(rows)) {
      if (id.startsWith('look.')) continue
      if (id.startsWith('nation.regime.') && !/Chance it works/.test(text)) continue
      expect(withoutFee(text), id).not.toMatch(PERCENT)
      expect(text, id).toMatch(WORD)
      expect(text, id).not.toMatch(DASH)
      checked++
    }
    // The coup, two cases, eight schemes, a contract, a front, the wire, the open power grabs and the two rival rows.
    expect(checked).toBeGreaterThanOrEqual(18)
  })

  it('keeps the shape of every row: the money, the names and the fee are still there', () => {
    const g = leaderScene()
    const rows = inFog(() => rowsOf(g, sceneAsset(g)))
    expect(rows['nation.dash.coup']).toMatch(/^Coup risk this year: /)
    expect(rows['nation.dash.case.c2001-2']).toMatch(/^Ghost payroll \(2001\) · public, under investigation · /)
    expect(rows['nation.dash.case.c2000-1']).toMatch(/^Road kickbacks \(2000\) · evidence /)
    expect(rows['nation.scheme.kickbacks#prev']).toMatch(/^Take \$10,679,300 · /)
    expect(rows['nation.steer.ASSET#sub']).toMatch(/^\$3,200,000 contract · \$960,000 markup · /)
    expect(rows['nation.launder.ASSET#sub']).toMatch(/^Run \$80,000 through construction books · \$52,000 arrives · /)
    expect(rows['nation.offshore#sub']).toMatch(/^12% fee · /)
    expect(rows['nation.regime.packCourts#sub']).toMatch(/^Add judges until the judges agree with you\. /)
    expect(rows['nation.jail.r1#sub']).toMatch(/^Chance the charges stick: /)
    expect(rows['nation.exile.r1#sub']).toMatch(/^Chance they flee: /)
  })

  it('the evidence rows keep "evidence" as a word', () => {
    const g = leaderScene()
    const rows = inFog(() => rowsOf(g, sceneAsset(g)))
    expect(rows['nation.dash.case.c2000-1']).toMatch(EVIDENCE)
    for (const [id, text] of Object.entries(rows)) if (id.startsWith('nation.scheme.') && id.endsWith('#prev')) expect(text, id).toMatch(/evidence it leaves: (thin|some|solid|heavy)/)
  })

  it('the cabinet row and the bank option are words too', () => {
    const mp = inFog(() => rowsOf(mpScene()))
    expect(mp['nation.cabinet#sub']).toMatch(/^Odds /)
    expect(mp['nation.cabinet#sub'].replace('10 capital', '')).not.toMatch(PERCENT)
    expect(mp['nation.cabinet#sub']).toMatch(WORD)
    const { g, a, b } = bankScene()
    const label = inFog(() => extendLabel(g, a, b))
    expect(label).toMatch(/^Give them time \(chance they recover: /)
    expect(label).not.toMatch(PERCENT)
    expect(label).toMatch(WORD)
  })

  it('the same screen twice is the same text, and a later year reads again', () => {
    const g = leaderScene()
    const first = inFog(() => rowsOf(g, sceneAsset(g)))
    expect(inFog(() => rowsOf(g, sceneAsset(g)))).toEqual(first)
    const later = { ...g, year: g.year + 1 }
    const second = inFog(() => rowsOf(later, sceneAsset(g)))
    const shared = Object.keys(first).filter((k) => k in second && !k.startsWith('look.'))
    expect(shared.length).toBeGreaterThan(15)
    expect(shared.filter((k) => first[k] !== second[k]).length).toBeGreaterThan(0)
  })
})

/** A life of the same scene with its own life id: the menus only read, so the lives share everything else. */
const livesOf = (g: GameState, n: number): GameState[] => Array.from({ length: n }, (_, i) => ({ ...g, lifeId: `talent-life-${i}` }))

/** What a row says about its odds in each of `n` lives of a scene. */
function across(g: GameState, id: string, n = 30): string[] {
  return livesOf(g, n).map((life) => inFog(() => rowsOf(life, sceneAsset(g))[id]!))
}

describe('Realistic mode: a percent with the talent', () => {
  // The truths are the engine's own (coup 25%, a rival's charges 41%, a contract noticed 25%, a power grab 55%, a charge 29%).
  const POLITICAL = ['nation.dash.coup', 'nation.regime.packCourts#sub', 'nation.jail.r1#sub']
  const CAUGHT = ['nation.dash.case.c2001-2', 'nation.steer.ASSET#sub', 'nation.launder.ASSET#sub', 'nation.scheme.kickbacks#prev']

  /** Every reading is "about N%" (N a multiple of 5) or one of the two edge words a reading at zero reads as, and most are percents. */
  function expectPercents(g: GameState, ids: string[]): void {
    for (const id of ids) {
      const texts = across(g, id)
      let percents = 0
      for (const t of texts) {
        const m = ABOUT.exec(t)
        if (m) {
          expect(Number(m[1]) % 5, t).toBe(0)
          percents++
        } else expect(t, id).toMatch(/almost no chance|almost certain/)
      }
      expect(percents / texts.length, id).toBeGreaterThan(0.6)
    }
  }

  function expectWords(g: GameState, ids: string[]): void {
    for (const id of ids) for (const t of across(g, id)) expect(t, id).not.toMatch(ABOUT)
  }

  it('Leadership shows the political rows as "about N%", N a multiple of 5, and keeps the rest as words', () => {
    const g = leaderScene('us', 2001, ['Leadership'])
    expectPercents(g, POLITICAL)
    expectWords(g, CAUGHT)
  })

  it('Crime shows the rows about getting caught as "about N%" and keeps the political rows as words', () => {
    const g = leaderScene('us', 2001, ['Crime'])
    expectPercents(g, ['nation.dash.case.c2001-2', 'nation.steer.ASSET#sub'])
    expectWords(g, POLITICAL)
  })

  it('Main Character has every talent, so the percent shows on every kind of row', () => {
    const g = leaderScene('us', 2001, ['MainCharacter'])
    expectPercents(g, [...POLITICAL, 'nation.dash.case.c2001-2', 'nation.steer.ASSET#sub'])
    expect(inFog(() => rowsOf(mpScene(['MainCharacter'])))['nation.cabinet#sub']).toMatch(/^Odds (about \d+%|almost no chance|almost certain) · costs 10 capital$/)
  })

  it('Leadership shows the cabinet row as a percent', () => {
    const g = mpScene(['Leadership'])
    const texts = livesOf(g, 30).map((life) => inFog(() => rowsOf(life)['nation.cabinet#sub']!))
    for (const t of texts) expect(t).toMatch(/^Odds (about \d+%|almost no chance|almost certain) · costs 10 capital$/)
    expect(texts.filter((t) => ABOUT.test(t)).length).toBeGreaterThan(15)
    for (const t of livesOf(mpScene(), 30).map((life) => inFog(() => rowsOf(life)['nation.cabinet#sub']!))) expect(t).not.toMatch(ABOUT)
  })

  it('the Business talent shows the bank option as "about N%"', () => {
    const { g, a, b } = bankScene(['Business'])
    const m = ABOUT.exec(inFog(() => extendLabel(g, a, b)))
    expect(m).not.toBeNull()
    expect(Number(m![1]) % 5).toBe(0)
  })

  it('the percent is a reading, not the truth: it varies from life to life and is the same twice in one', () => {
    const g = leaderScene('us', 2001, ['Leadership'])
    expect(coupChance(g, officeView(g)!)).toBeGreaterThan(0.2)
    const seen = new Set<string>()
    for (const life of livesOf(g, 40)) {
      const row = inFog(() => rowsOf(life, sceneAsset(g))['nation.dash.coup']!)
      expect(inFog(() => rowsOf(life, sceneAsset(g))['nation.dash.coup'])).toBe(row)
      seen.add(row)
    }
    expect(seen.size).toBeGreaterThan(3)
  })
})

describe('Look closer: Commission a risk briefing', () => {
  /** A scene whose Look closer purchases are affordable: the fee is flat in the scope, never the cash. */
  function makeScene(): GameState {
    const g = leaderScene()
    g.character.money = 5_000_000
    return g
  }

  const SCREENS = ['look.nation.dash', 'look.nation.pockets', 'look.nation.dirty', 'look.nation.keep'] as const

  it('every odds screen of a head of government ends with the row, and its label says what it is', () => {
    const g = leaderScene()
    inFog(() => {
      for (const id of SCREENS) {
        const group = lookGroup(g, id)
        expect(group, id).not.toBeNull()
        expect(group!.label, id).toBe('Commission a risk briefing')
      }
    })
  })

  it('the cabinet screen has it for a member of the legislature, and a head of government has no cabinet to ask for', () => {
    expect(inFog(() => lookGroup(mpScene(), 'look.nation.govern'))?.label).toBe('Commission a risk briefing')
    expect(inFog(() => lookGroup(leaderScene(), 'look.nation.govern'))).toBeNull()
  })

  it('lists an analyst and a report with a fee and no illegal source (no informant can read a chance)', () => {
    const g = leaderScene()
    inFog(() => {
      const kids = lookGroup(g, 'look.nation.dash')!.children(g) as MenuAction[]
      const ids = kids.map((k) => k.id)
      expect(ids).toContain('look.nation.dash.analyst')
      expect(ids).toContain('look.nation.dash.report')
      expect(ids).not.toContain('look.nation.dash.informant')
      expect(ids).not.toContain('look.nation.dash.hacker')
      for (const k of kids) expect(k.confirm, k.id).toBeUndefined()
    })
  })

  it('a bought report opens the percent for the numbers it read and no others, once, and a repeat buy changes nothing', () => {
    const g = makeScene()
    const before = inFog(() => rowsOf(g, sceneAsset(g)))
    const cash = g.character.money
    inFog(() => {
      const group = lookGroup(g, 'look.nation.dash')!
      const analyst = (group.children(g) as MenuAction[]).find((k) => k.id === 'look.nation.dash.analyst')!
      expect(analyst.disabledReason?.(g) ?? null).toBeNull()
      analyst.run(g, '')
    })
    const fee = cash - g.character.money
    expect(fee).toBeGreaterThan(0)
    expect(flowTotal(g, 'intel', 'pool')).toBe(fee)
    expect(checkLedger(g).ok).toBe(true)

    const after = inFog(() => rowsOf(g, sceneAsset(g)))
    expect(after['nation.dash.coup']).toMatch(ABOUT)
    expect(after['nation.dash.case.c2001-2']).toMatch(ABOUT)
    expect(after['nation.dash.case.c2000-1']).toMatch(/evidence about \d+%/)
    // Not read: the schemes, the contract, the wire and the rival rows stay words.
    expect(after['nation.scheme.kickbacks#prev']).not.toMatch(ABOUT)
    expect(after['nation.offshore#sub']).not.toMatch(ABOUT)
    expect(after['nation.jail.r1#sub']).not.toMatch(ABOUT)
    expect(before['nation.dash.coup']).not.toMatch(ABOUT)

    // The same source twice in a year: refused, no second fee, the same text.
    inFog(() => {
      const analyst = (lookGroup(g, 'look.nation.dash')!.children(g) as MenuAction[]).find((k) => k.id === 'look.nation.dash.analyst')!
      expect(analyst.disabledReason?.(g)).toBeTruthy()
      analyst.run(g, '')
    })
    expect(cash - g.character.money).toBe(fee)
    expect(inFog(() => rowsOf(g, sceneAsset(g)))).toEqual(after)
    expect(readKnow(g)).not.toBeNull()
  })

  it('a read of one number leaves the number next to it a word', () => {
    const g = leaderScene()
    const coup = oddsKey('us', 'coup')
    inFog(() => {
      expect(learn(g, coup, { mid: 0.2, sd: 0.1, src: 'report' })).not.toBeNull()
    })
    const rows = inFog(() => rowsOf(g, sceneAsset(g)))
    expect(rows['nation.dash.coup']).toMatch(ABOUT)
    expect(rows['nation.dash.case.c2001-2']).not.toMatch(ABOUT)
    expect(rows['nation.jail.r1#sub']).not.toMatch(ABOUT)
  })

  it('a scheme slider moves with the slider after a read: the reading keeps its error, so more greed never reads as less risk', () => {
    const g = leaderScene('us', 2001, ['Crime'])
    const v = officeView(g)!
    const def = SCHEMES.find((s) => s.id === 'kickbacks')!
    const key = oddsKey(def.id, 'flagged')
    const base = schemeQuote(g, v, def, 0.3).caught
    inFog(() => {
      expect(learn(g, key, { mid: base + 0.07, sd: 0.06, src: 'report' })).not.toBeNull()
      const at = (size: number) => oddsView(g, key, schemeQuote(g, v, def, size).caught, 'Crime', base)
      const mids = [0.1, 0.3, 0.6, 1].map((s) => at(s).mid)
      for (let i = 1; i < mids.length; i++) expect(mids[i]!).toBeGreaterThanOrEqual(mids[i - 1]!)
      const errors = [0.1, 0.3, 0.6].map((s) => at(s).mid - schemeQuote(g, v, def, s).caught)
      for (const e of errors) expect(e).toBeCloseTo(0.07, 6)
    })
  })
})

describe('keys: every odds number has an owner, a true value and an honest band', () => {
  it('every key a screen asks about is an odds key of a registered owner, with a label and the engine\'s own value', () => {
    const g = leaderScene()
    const mp = mpScene()
    const v = officeView(g)!
    const me = meView(g)
    const key = (id: string, kind: string): string => oddsKey(id, kind)
    const wants: [string, number][] = [
      [key('us', 'coup'), coupChance(g, v)],
      [key('c2001-2', 'charge'), chargeChance(g, me.cases.find((c) => c.id === 'c2001-2')!)],
      [key('c2000-1', 'surface'), exposureChance(g, me.cases.find((c) => c.id === 'c2000-1')!, true, false)],
      [key('c2000-1', 'proof'), 0.45],
      [key('kickbacks', 'flagged'), schemeQuote(g, v, SCHEMES.find((s) => s.id === 'kickbacks')!, 0.3).caught],
      [key('kickbacks', 'trace'), schemeQuote(g, v, SCHEMES.find((s) => s.id === 'kickbacks')!, 0.3).evidence],
      [key(sceneAsset(g), 'steer'), steerQuote(g, v, g.assets[g.assets.length - 1]!).caught],
      [key(sceneAsset(g), 'launder'), launderQuote(g, g.assets[g.assets.length - 1]!).caught],
      [key('us', 'offshore'), offshoreCaught(g)],
      [key('packCourts', 'regime'), regimeOdds(g, 'packCourts')],
      [key('us', 'jail'), persecuteOdds(g, false)],
      [key('us', 'exile'), persecuteOdds(g, true)],
    ]
    for (const [k, want] of wants) {
      const kind = kindOfKey(k)
      expect(kind, k).not.toBeNull()
      expect(kind!.truth(g, k), k).toBeCloseTo(want, 12)
      expect(labelOfKey(g, k).length, k).toBeGreaterThan(5)
      expect(labelOfKey(g, k).length, k).toBeLessThanOrEqual(60)
      expect(labelOfKey(g, k), k).not.toBe(k)
    }
    const cab = oddsKey('gb', 'cabinet')
    expect(kindOfKey(cab)!.truth(mp, cab)).toBeGreaterThan(0)
    expect(kindOfKey(cab)!.truth(g, cab)).toBeNull()
  })

  it('a key with nothing to read (a case that closed, a country that is not yours) has no truth, so nothing is sold for it', () => {
    const g = leaderScene()
    expect(kindOfKey(oddsKey('c1999-9', 'charge'))!.truth(g, oddsKey('c1999-9', 'charge'))).toBeNull()
    expect(kindOfKey(oddsKey('fr', 'coup'))!.truth(g, oddsKey('fr', 'coup'))).toBeNull()
    expect(kindOfKey(oddsKey('nobody', 'jail'))!.truth(g, oddsKey('nobody', 'jail'))).toBeNull()
    expect(kindOfKey(oddsKey('biz1', 'ownerPay'))!.truth(g, oddsKey('biz1', 'ownerPay'))).toBeNull()
  })

  it('the screens ask about at most 12 keys each, and every one of them is a real key', () => {
    const g = leaderScene()
    const mp = mpScene()
    for (const keys of [dashKeys(g), pocketKeys(g), dirtyKeys(g), keepKeys(g), governKeys(mp)]) {
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.length).toBeLessThanOrEqual(12)
      for (const k of keys) {
        expect(k.length).toBeLessThanOrEqual(64)
        expect(kindOfKey(k), k).not.toBeNull()
      }
    }
    expect(dashKeys(g)).toContain(oddsKey('us', 'coup'))
    expect(governKeys(mp)).toEqual([oddsKey('gb', 'cabinet')])
    expect(governKeys(g)).toEqual([])
    expect(new Set(allNationKeys(g)).size).toBe(allNationKeys(g).length)
  })

  it('a stated band holds the truth about 80% of 10,000 draws, for every nation key', () => {
    const g = leaderScene()
    for (const k of allNationKeys(g)) {
      const truth = kindOfKey(k)!.truth(g, k)
      if (truth === null || truth <= 0.02 || truth >= 0.98) continue
      const hit = inFog(() => coverage(10_000, (i) => ({ est: know(fogGame(i), k, truth), truth })))
      expect(hit, k).toBeGreaterThan(0.77)
      expect(hit, k).toBeLessThan(0.93)
    }
  })

  it('a report on a nation key is an honest reading: its band holds the truth, and it is sharper than the passive one', () => {
    const g = leaderScene()
    const key = oddsKey('us', 'coup')
    const truth = coupChance(g, officeView(g)!)
    let hit = 0
    let sharper = 0
    const n = 2000
    for (let i = 0; i < n; i++) {
      const life = { ...g, lifeId: `read-life-${i}`, flags: {} }
      inFog(() => {
        const passive = know(life, key, truth)
        const est = takeReading(life, 'report', key, truth)!
        if (est.lo <= truth && truth <= est.hi) hit++
        if (est.sd < passive.sd) sharper++
      })
    }
    expect(hit / n).toBeGreaterThan(0.77)
    expect(hit / n).toBeLessThan(0.93)
    expect(sharper).toBe(n)
  })
})

describe('purity: no draw, no write', () => {
  it('builds every politics screen in Realistic mode from a deep-frozen game, and leaves the game and the stream alone', () => {
    const g = leaderScene('us', 2001, ['Leadership', 'Crime'])
    const before = JSON.stringify(g)
    const rng = g.rng
    const frozen = deepFreeze(g)
    expect(() => inFog(() => rowsOf(frozen, sceneAsset(g)))).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    const mp = deepFreeze(mpScene(['Leadership']))
    expect(() => inFog(() => rowsOf(mp))).not.toThrow()
  })

  it('the bank option is built without a draw from the game stream beyond the event\'s own', () => {
    const { g, a, b } = bankScene()
    const first = inFog(() => extendLabel(g, a, b))
    const second = inFog(() => extendLabel(g, a, b))
    expect(first).toMatch(/chance they recover/)
    expect(second).toMatch(/chance they recover/)
    // The label is the same word in both draws of the event unless the borrower or the odds changed; the reading itself is stable.
    expect(first.replace(/\(.*\)/, '')).toBe(second.replace(/\(.*\)/, ''))
  })

  it('a menu build does not write the knowledge record', () => {
    const g = leaderScene('us', 2001, ['Leadership'])
    inFog(() => rowsOf(g, sceneAsset(g)))
    expect(readKnow(g)).toBeNull()
  })
})

describe('the sites are gone from the source', () => {
  it('no politics row formats an odds with pct() any more, and the bank option does not either', () => {
    const menu = read('src/game/nation/menu.ts')
    for (const site of ['cabinetOdds(g, v)', 'coupChance(g, v)', 'chargeChance(g, cs)', 'exposureChance(g, cs, true, false)', 'q.caught', 'q.evidence', 'offshoreCaught(g)', 'regimeOdds(gg, id)', 'persecuteOdds(gg, false)', 'persecuteOdds(gg, true)']) {
      expect(menu, site).not.toContain(`pct(${site})`)
    }
    const bank = read('src/game/business/bank-events.ts')
    expect(bank).toContain("oddsView(x.g, oddsKey(x.a.id, 'recover'), odds)")
    expect(bank).toContain('chance they recover: ${view.text}')
  })

  it('the new text carries no em-dash or en-dash', () => {
    for (const file of ['src/game/nation/menu.ts', 'src/game/nation/odds-read.ts', 'src/game/fog/odds/odds.ts', 'src/game/fog/odds/contract.ts']) {
      expect(read(file).match(DASH_ALL) ?? [], file).toEqual([])
    }
  })
})
