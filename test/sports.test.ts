import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import { hire, ownerKey } from '../src/game/special/common'
import { sportsCareerMenu, sportsJobNodes, yearlySports } from '../src/game/special/sports'
import { addHeadTrauma, gamesSeason, rankFromPoints, sponsorCall, viewSports, yearlyBrain } from '../src/game/special/sports-core'
import { DISCIPLINES, fightInternals } from '../src/game/special/sports-fight'
import type { Asset, Character, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function game(age: number, overrides: Partial<Character> = {}, seed = 11): GameState {
  const g = makeTestGame(seed, { age, ...overrides })
  g.log = [{ age, year: 2026, entries: [] }]
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 7) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      if (n.visible && !n.visible(g)) continue
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

const sports = (_g: GameState) => [sportsCareerMenu]

function action(g: GameState, id: string, nodes: MenuNode[] = sports(g)): MenuAction {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

function reason(g: GameState, id: string, nodes?: MenuNode[]): string | null {
  return action(g, id, nodes).disabledReason?.(g) ?? null
}

function run(g: GameState, id: string, nodes?: MenuNode[]): void {
  const a = action(g, id, nodes)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  a.run(g)
}

type Picker = (m: Extract<ModalItem, { kind: 'choice' }>) => string | undefined

/** Resolve the whole queue the way the store does; `pick` chooses (default: first option). */
function drain(g: GameState, pick: Picker = () => undefined): ModalItem[] {
  const seen: ModalItem[] = []
  for (let guard = 0; g.queue.length && guard < 400; guard++) {
    const m = g.queue.shift()!
    seen.push(m)
    const before = g.queue.length
    if (m.kind === 'choice') {
      const want = pick(m)
      const id = want && m.choices.some((c) => c.id === want) ? want : m.choices[0].id
      runScript(g, m.scriptId!, id, m.data, m)
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    g.queue.unshift(...g.queue.splice(before))
  }
  expect(g.queue.length).toBe(0)
  return seen
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
}

function flagProfile<T>(g: GameState, key: string): T {
  const v = g.flags[`special.${key}`]
  if (!v || typeof v !== 'object') throw new Error(`no profile ${key}`)
  return v as unknown as T
}

function checkSane(g: GameState): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(g.character.money).toBeGreaterThanOrEqual(0)
  if (g.character.job) {
    expect(Number.isFinite(g.character.job.salary)).toBe(true)
    expect(g.character.job.salary).toBeGreaterThanOrEqual(0)
  }
  const json = JSON.stringify(g)
  expect(json).not.toContain('NaN')
  expect(json).not.toContain('undefined')
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

const allText = (seen: ModalItem[]) => seen.map((m) => ('text' in m ? `${m.title}: ${m.text}` : '')).join('\n')

// ---------------------------------------------------------------------------

describe('the Sports menu', () => {
  it('sits in Special Careers with every category', () => {
    const g = game(20)
    expect(findNode(g, specialCareersMenu.children(g), 'sports')).toBeDefined()
    const ids = sportsCareerMenu.children(g).map((n) => ('id' in n ? n.id : ''))
    for (const id of ['sports.team', 'sports.individual', 'sports.combat', 'sports.esports', 'sports.olympics', 'sports.endorsements']) expect(ids).toContain(id)
    const combat = findNode(g, sports(g), 'sports.combat')
    expect(combat?.type).toBe('menu')
    const combatIds = combat?.type === 'menu' ? combat.children(g).map((n) => ('id' in n ? n.id : '')) : []
    expect(combatIds[0]).toBe('sports.mma')
    for (const id of ['sports.boxing', 'sports.kickboxing', 'sports.muaythai', 'sports.ind.judo', 'sports.ind.wrestling', 'sports.sumo', 'sports.wrestle']) expect(combatIds).toContain(id)
    const ind = findNode(g, sports(g), 'sports.individual')
    const indIds = ind?.type === 'menu' ? ind.children(g).map((n) => ('id' in n ? n.id : '')) : []
    for (const s of ['tennis', 'golf', 'track', 'swimming', 'cycling', 'motor', 'ski', 'snowboard', 'surf', 'skate', 'gymnastics', 'skating']) expect(indIds).toContain(`sports.ind.${s}`)
  })

  it('opens each category at the right age', () => {
    const toddler = game(2)
    expect(sportsCareerMenu.children(toddler)[0].type).toBe('info')

    const kid = game(8, { hidden: { ...game(0).character.hidden, athleticism: 70 } })
    expect(findNode(kid, sports(kid), 'sports.youth')).toBeDefined()
    expect(reason(kid, 'sports.youth.join.team')).toBeNull()
    expect(reason(kid, 'sports.youth.join.individual')).toBeNull()
    expect(reason(kid, 'athlete.tryout')).toMatch(/18/)
    expect(reason(kid, 'sports.ind.tennis.pro')).toMatch(/16/)
    expect(reason(kid, 'sports.mma.amateur')).toMatch(/16/)
    expect(reason(kid, 'sports.es.game')).toMatch(/10/)
    expect(reason(kid, 'sports.es.cup')).toMatch(/13/)
    expect(reason(game(11), 'sports.es.game')).toBeNull()
    expect(reason(kid, 'sports.wrestle.debut')).toMatch(/18/)

    const teen = game(16)
    expect(reason(teen, 'sports.mma.amateur')).toBeNull()
    expect(reason(teen, 'sports.ind.tennis.pro')).toBeNull()
    expect(reason(teen, 'sports.mma.turnPro')).toMatch(/18/)

    const adult = game(20)
    const youth = findNode(adult, sports(adult), 'sports.youth')
    expect(youth?.type === 'menu' && youth.visible?.(adult)).toBe(false)
    expect(reason(adult, 'athlete.tryout')).toBeNull()
    expect(reason(adult, 'sports.mma.amateur')).toBeNull()
    expect(reason(adult, 'sports.es.pro')).toMatch(/main game/i)
  })

  it('is closed in prison and does nothing for the dead', () => {
    const g = game(25)
    const amateur = action(g, 'sports.mma.amateur')
    const tryout = action(g, 'athlete.tryout')
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(sportsCareerMenu.visible?.(g)).toBe(false)
    expect(amateur.disabledReason?.(g)).toMatch(/bars/)
    expect(tryout.disabledReason?.(g)).toMatch(/bars/)
    const before = JSON.stringify(g)
    yearlySports(g)
    expect(JSON.stringify(g)).toBe(before)
    g.character.prison = null
    g.character.alive = false
    expect(sportsCareerMenu.visible?.(g)).toBe(false)
    expect(specialJobNodes(g)).toEqual([])
    yearlySports(g)
    expect(g.queue).toEqual([])
  })

  it('follows the local sports: home leagues, snow, coastlines, sumo and Muay Thai', () => {
    const india = game(20, { countryId: 'in', city: 'Mumbai' })
    run(india, 'athlete.tryout')
    const list = india.queue[0]
    expect(list.kind).toBe('choice')
    if (list.kind === 'choice') {
      expect(list.choices[0].id).toBe('cricket')
      expect(list.choices.map((c) => c.id)).toContain('kabaddi')
      expect(list.choices[0].label).toMatch(/popular in India/)
    }
    india.queue = []

    const us = game(20)
    run(us, 'athlete.tryout')
    if (us.queue[0].kind === 'choice') expect(us.queue[0].choices[0].id).toBe('football')

    const brazil = game(20, { countryId: 'br', city: 'Rio de Janeiro' })
    run(brazil, 'athlete.tryout')
    if (brazil.queue[0].kind === 'choice') expect(brazil.queue[0].choices[0].id).toBe('soccer')
    drain(brazil, (m) => (m.title === 'Soccer' ? m.choices[0].id : undefined))

    const thai = game(20, { countryId: 'th', city: 'Bangkok' })
    expect(reason(thai, 'sports.ind.ski.pro')).toMatch(/snow/i)
    expect(reason(thai, 'sports.ind.surf.pro')).toBeNull()
    const swiss = game(20, { countryId: 'ch', city: 'Zurich' })
    expect(reason(swiss, 'sports.ind.surf.pro')).toMatch(/coastline/i)
    expect(reason(swiss, 'sports.ind.ski.pro')).toBeNull()

    const jpMan = game(17, { countryId: 'jp', city: 'Tokyo', gender: 'male' })
    expect(reason(jpMan, 'sports.sumo.join')).toBeNull()
    const jpWoman = game(17, { countryId: 'jp', city: 'Tokyo', gender: 'female' })
    expect(reason(jpWoman, 'sports.sumo.join')).toMatch(/men-only/)
    expect(reason(us, 'sports.sumo.join')).toMatch(/Japan/)
  })
})

describe('MMA: amateur to title fight', () => {
  function fighterGame(): GameState {
    const g = game(18, { hidden: { ...game(0).character.hidden, athleticism: 90 } }, 21)
    g.character.money = 50_000
    run(g, 'sports.mma.gym')
    drain(g, (m) => m.choices[1]?.id)
    const p = flagProfile<Record<string, number>>(g, 'sports.fight')
    p.striking = 92
    p.grappling = 90
    p.cardio = 92
    p.chin = 90
    p.iq = 85
    return g
  }

  /** Fight n amateur bouts, waiting out medical suspensions (a knockout ends your year). */
  function amateurBouts(g: GameState, n: number): void {
    let done = 0
    for (let guard = 0; done < n && guard < 20; guard++) {
      if (reason(g, 'sports.mma.amateur')) {
        nextYear(g)
        continue
      }
      run(g, 'sports.mma.amateur')
      drain(g, fightPicker)
      done++
    }
    expect(done).toBe(n)
  }

  const fightPicker: Picker = (m) => {
    if (m.scriptId === 'sports.fight.pick') {
      // An ambitious fighter: title fights first, then the bigger name.
      const offers = (m.data as unknown as { offers: { kind: string; main: boolean }[] }).offers
      const best = offers.findIndex((o) => o.kind === 'title' || o.kind === 'regionalTitle' || o.kind === 'defense')
      const main = offers.findIndex((o) => o.main)
      return String(best >= 0 ? best : main >= 0 ? main : 0)
    }
    if (m.scriptId === 'sports.fight.round') return 'strike'
    if (m.scriptId === 'sports.fight.cut') return 'smart'
    if (m.scriptId === 'sports.fight.presser') return 'trash'
    if (m.scriptId === 'sports.fight.callup') return 'sign'
    if (m.scriptId === 'sports.fight.callout') return 'champ'
    if (m.scriptId === 'sports.fight.renew') return 'sign'
    if (m.scriptId === 'sports.fight.turnPro') return undefined
    return undefined
  }

  it('builds an amateur record, turns pro, gets called up and fights for the belt', () => {
    const g = fighterGame()
    amateurBouts(g, 3)
    const prof0 = flagProfile<{ amateur: Record<string, { w: number; l: number; d: number; nc: number }> }>(g, 'sports.fight')
    const am = prof0.amateur.mma
    expect(am.w + am.l + am.d).toBe(3)
    expect(reason(g, 'sports.mma.turnPro')).toBeNull()
    run(g, 'sports.mma.turnPro')
    const nat = (g.queue[0] as { choices: { id: string; label: string }[] }).choices.find((c) => /natural/.test(c.label))!.id
    drain(g, () => nat)
    expect(g.character.job?.defId).toBe('sports.fighter')
    expect(g.character.job?.title).toMatch(/MMA Fighter/)

    let titleFought = false
    let calledUp = false
    const seenAll: ModalItem[] = []
    for (let year = 0; year < 12 && !titleFought; year++) {
      for (let f = 0; f < 3; f++) {
        const nodes = sportsJobNodes(g)
        const fight = findNode(g, nodes, 'sports.fight.go')
        if (!fight || fight.type !== 'action' || fight.disabledReason?.(g)) break
        fight.run(g)
        const pickModal = g.queue.find((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.pick')
        if (pickModal && pickModal.kind === 'choice' && (pickModal.data as unknown as { offers: { kind: string }[] }).offers.some((o) => o.kind === 'title')) titleFought = true
        const seen = drain(g, fightPicker)
        seenAll.push(...seen)
        if (seen.some((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.callup')) calledUp = true
        checkSane(g)
        if (!g.character.job) break
      }
      if (!g.character.job || titleFought) break
      nextYear(g)
      yearlySports(g)
      drain(g, fightPicker)
      checkSane(g)
      const pr = flagProfile<Record<string, number>>(g, 'sports.fight')
      pr.striking = Math.max(pr.striking, 90)
      pr.grappling = Math.max(pr.grappling, 88)
      pr.cardio = Math.max(pr.cardio, 90)
      pr.chin = Math.max(pr.chin, 85)
    }
    expect(calledUp).toBe(true)
    expect(titleFought).toBe(true)
    const text = allText(seenAll)
    expect(text).toMatch(/Round 1/)
    expect(text).toMatch(/Victory!|Defeat|Draw/)
    expect(text).toMatch(/Hexagon Fighting Championship/)
    const prof = flagProfile<{ pro: Record<string, { w: number; l: number; d: number; nc: number; ko: number; sub: number; dec: number }>; earnings: number }>(g, 'sports.fight')
    const r = prof.pro.mma
    expect(r.w).toBeGreaterThan(3)
    expect(r.ko + r.sub + r.dec).toBe(r.w)
    expect(Number.isFinite(prof.earnings) && prof.earnings > 0).toBe(true)
    checkSane(g)
  })

  it('round choices resolve to finishes and decisions with sane numbers', () => {
    const g = game(25)
    let finishes = 0
    for (let i = 0; i < 300; i++) {
      const a = { s: 60, g: 60, c: 60, chin: 70, iq: 50 }
      const side = () => ({ hp: 20, st: 70, top: false, reckless: false })
      const ex = fightInternals.exchange(g, a, side(), (['strike', 'grapple', 'sub', 'defend', 'taunt'] as const)[i % 5], a, side(), 'strike', 0, 60, 1)
      expect(Number.isFinite(ex.pts) && Number.isFinite(ex.finish) && Number.isFinite(ex.dmg)).toBe(true)
      expect(ex.finish).toBeGreaterThanOrEqual(0)
      expect(ex.finish).toBeLessThanOrEqual(0.55)
      if (ex.finish > 0) finishes++
    }
    expect(finishes).toBeGreaterThan(0)
  })

  it('weight cuts can be missed and cost part of the purse', () => {
    const g = fighterGame()
    const p = flagProfile<Record<string, number>>(g, 'sports.fight')
    p.natural = 5
    amateurBouts(g, 3)
    run(g, 'sports.mma.turnPro')
    drain(g, () => '3')
    expect(g.character.job?.data.cls).toBe(3)
    // A knockout in the amateurs means a medical suspension for the rest of the year.
    if (reason(g, 'sports.fight.go', sportsJobNodes(g))) nextYear(g)
    run(g, 'sports.fight.go', sportsJobNodes(g))
    const seen = drain(g, (m) => (m.scriptId === 'sports.fight.cut' ? 'extreme' : m.scriptId === 'sports.fight.round' ? 'grapple' : undefined))
    expect(seen.some((m) => m.kind === 'choice' && m.scriptId === 'sports.fight.cut')).toBe(true)
    expect(allText(seen)).toMatch(/Weigh-Ins|Fight Cancelled/)
    checkSane(g)
  })
})

describe('individual sports', () => {
  it('tennis: turn pro, play the calendar, climb the rankings to the main tour', () => {
    const g = game(17, { hidden: { ...game(0).character.hidden, athleticism: 85 } }, 5)
    g.character.money = 200_000
    run(g, 'sports.ind.tennis.practice')
    drain(g)
    const ind = flagProfile<{ sports: Record<string, { attrs: Record<string, number>; fitness: number }> }>(g, 'sports.ind')
    for (const k of Object.keys(ind.sports.tennis.attrs)) ind.sports.tennis.attrs[k] = 84
    ind.sports.tennis.fitness = 85
    run(g, 'sports.ind.tennis.pro')
    drain(g)
    expect(g.character.job?.defId).toBe('sports.ind')
    expect(g.character.job?.company).toBe('Challenger Circuit')
    const ranks: (number | null)[] = []
    for (let season = 0; season < 4; season++) {
      for (let k = 0; k < 4; k++) {
        const nodes = sportsJobNodes(g)
        const compete = findNode(g, nodes, 'sports.ind.compete')
        if (!compete || compete.type !== 'action' || compete.disabledReason?.(g)) break
        compete.run(g)
        drain(g, (m) => (m.scriptId === 'sports.ind.enter' ? m.choices[0].id : m.scriptId === 'sports.ind.pivot' ? 'attack' : undefined))
        checkSane(g)
      }
      ranks.push(g.character.job ? (g.character.job.data.rank as number | null) : null)
      nextYear(g)
      yearlySports(g)
      drain(g, (m) => (m.scriptId === 'sports.ind.retireAsk' ? 'keep' : undefined))
      checkSane(g)
    }
    expect(g.character.job?.defId).toBe('sports.ind')
    const rank = g.character.job?.data.rank as number | null
    expect(rank).not.toBeNull()
    expect(rank!).toBeLessThanOrEqual(100)
    expect(g.character.job?.company).toBe('Pro Tennis Tour')
    expect(g.counters.sportsTitles ?? 0).toBeGreaterThan(0)
  })

  it('ranking points map to world rankings monotonically', () => {
    expect(rankFromPoints(0)).toBeNull()
    expect(rankFromPoints(9000)).toBe(1)
    expect(rankFromPoints(600)).toBe(100)
    let prev = Infinity
    for (const pts of [10, 50, 200, 800, 2000, 5000, 12000]) {
      const r = rankFromPoints(pts)!
      expect(r).toBeLessThanOrEqual(prev)
      prev = r
    }
  })

  it('motor racing needs a paid seat unless you are a prodigy', () => {
    const g = game(18)
    g.character.money = 1_000
    run(g, 'sports.ind.motor.practice')
    drain(g)
    const ind = flagProfile<{ sports: Record<string, { attrs: Record<string, number> }> }>(g, 'sports.ind')
    for (const k of Object.keys(ind.sports.motor.attrs)) ind.sports.motor.attrs[k] = 50
    run(g, 'sports.ind.motor.pro')
    const seen = drain(g, () => 'sign')
    expect(allText(seen)).toMatch(/drivers bring the money|can't raise it/)
    expect(g.character.job).toBeNull()
    expect(g.character.money).toBeGreaterThanOrEqual(0)
  })
})

describe('team sports keep working', () => {
  it('an athlete job from an old save still shows its actions and plays seasons', () => {
    const g = game(26, { money: 1_000 })
    hire(g, {
      defId: 'athlete',
      title: 'Soccer Player',
      company: 'Riverside United',
      salary: 500_000,
      data: { league: 'eplF', team: 'Riverside United', teamStrength: 70, position: 'Striker', contractYears: 3, doping: false, injured: 0, practiced: [], standings: [], champion: null },
    })
    g.flags['special.athlete'] = { sport: 'soccer', skills: { Shooting: 70, Passing: 60 }, fitness: 70, greatness: 70, peakGreatness: 72, respect: 60, championships: 1, awards: [], seasons: 4, retiredAge: null, hallOfFame: false, bannedUntil: -1, owner: ownerKey(g) } as unknown as Json
    const ids = sportsJobNodes(g).map((n) => ('id' in n ? n.id : ''))
    expect(ids).toContain('athlete.status')
    expect(ids).toContain('athlete.practice')
    expect(specialJobNodes(g).map((n) => ('id' in n ? n.id : ''))).toContain('athlete.retire')
    for (let y = 0; y < 4; y++) {
      nextYear(g)
      yearlySpecial(g)
      drain(g, (m) => (m.scriptId === 'special.athlete.renew' ? 'resign' : undefined))
      checkSane(g)
    }
    expect(g.character.money).toBeGreaterThan(1_000)
    expect(findNode(g, sports(g), 'athlete.already')).toBeDefined()
  })

  it('retiring records the career for coaching', () => {
    const g = game(34)
    hire(g, { defId: 'athlete', title: 'Basketball Player', company: 'Boston Clovers', salary: 2_000_000, data: { league: 'hoops', team: 'Boston Clovers', teamStrength: 70, position: 'Center', contractYears: 2, doping: false, injured: 0, practiced: [], standings: [], champion: null } })
    run(g, 'athlete.retire', sportsJobNodes(g))
    drain(g)
    expect(g.character.job).toBeNull()
    expect(findNode(g, sports(g), 'sports.after')).toBeDefined()
    run(g, 'sports.after.coach')
    drain(g)
    expect(g.character.job?.defId).toBe('sports.coach')
    nextYear(g)
    yearlySports(g)
    drain(g)
    checkSane(g)
  })
})

describe('youth pathways', () => {
  it('an academy kid gets a pro contract offer', () => {
    const g = game(9, { countryId: 'gb', city: 'Manchester', hidden: { ...game(0).character.hidden, athleticism: 90 } })
    g.character.money = 100_000
    run(g, 'sports.youth.join.team')
    drain(g, (m) => m.choices.find((c) => c.id === 'team.soccer')?.id)
    const y = flagProfile<{ program: string; level: number; club: string }>(g, 'sports.youth')
    expect(y.program).toBe('team.soccer')
    expect(y.club).toMatch(/Youth Academy/)
    let offered = false
    for (let age = 9; age < 18 && !offered; age++) {
      run(g, 'sports.youth.train')
      run(g, 'sports.youth.train')
      run(g, 'sports.youth.compete')
      drain(g)
      nextYear(g)
      yearlySports(g)
      const seen = drain(g, (m) => (m.scriptId === 'special.athlete.contract' ? 'accept' : undefined))
      if (seen.some((m) => m.kind === 'choice' && m.scriptId === 'special.athlete.contract')) offered = true
      checkSane(g)
    }
    expect(offered).toBe(true)
    expect(g.character.job?.defId).toBe('athlete')
  })
})

describe('sumo, pro wrestling and esports', () => {
  it('sumo: six basho a year with promotions and pay', () => {
    const g = game(16, { countryId: 'jp', city: 'Osaka', gender: 'male', hidden: { ...game(0).character.hidden, athleticism: 80 } })
    run(g, 'sports.sumo.join')
    drain(g)
    expect(g.character.job?.defId).toBe('sports.sumo')
    for (let y = 0; y < 5; y++) {
      for (const s of ['Pushing', 'Belt Technique', 'Throws', 'Strength']) {
        run(g, 'sports.sumo.keiko', sportsJobNodes(g))
        drain(g, () => s)
      }
      nextYear(g)
      yearlySports(g)
      const seen = drain(g, () => 'stay')
      expect(allText(seen)).toMatch(/Hatsu/)
      checkSane(g)
    }
    expect(g.character.job?.title).toMatch(/Sumo Wrestler \(/)
    expect(g.character.job?.title).not.toMatch(/Jonokuchi/)
  })

  it('pro wrestling: school, debut, matches and promos', () => {
    const g = game(19)
    g.character.money = 20_000
    run(g, 'sports.wrestle.school')
    drain(g)
    run(g, 'sports.wrestle.debut')
    drain(g, (m) => m.choices.find((c) => c.id.endsWith('|heel'))?.id)
    expect(g.character.job?.defId).toBe('sports.wrestler')
    run(g, 'sports.wrestle.match', sportsJobNodes(g))
    drain(g, () => 'highspot')
    run(g, 'sports.wrestle.promo', sportsJobNodes(g))
    drain(g, () => 'insult')
    nextYear(g)
    yearlySports(g)
    drain(g)
    checkSane(g)
  })

  it('esports: needs a setup, climbs the ladder and goes pro', () => {
    const g = game(16)
    run(g, 'sports.es.game')
    drain(g, () => 'strike')
    expect(reason(g, 'sports.es.grind')).toMatch(/gaming PC/)
    const pc: Asset = { id: 'a1', kind: 'other', name: 'Gaming PC', emoji: '\u{1F5A5}\u{FE0F}', value: 1500, purchasePrice: 1500, condition: 100, purchasedAge: 16, upkeep: 0, details: {} }
    g.assets.push(pc)
    const p = flagProfile<{ attrs: Record<string, number>; mmr: Record<string, number> }>(g, 'sports.esports')
    for (const k of Object.keys(p.attrs)) p.attrs[k] = 85
    for (let i = 0; i < 3; i++) {
      run(g, 'sports.es.grind')
      drain(g)
    }
    expect(p.mmr.strike).toBeGreaterThan(2000)
    run(g, 'sports.es.pro')
    drain(g, (m) => m.choices[m.choices.length - 2]?.id)
    expect(g.character.job?.defId).toBe('sports.esports')
    run(g, 'sports.es.compete', sportsJobNodes(g))
    drain(g)
    nextYear(g)
    yearlySports(g)
    drain(g, () => 'stay')
    checkSane(g)
  })
})

describe('Olympics, sponsors and the brain', () => {
  it('a top-ranked swimmer goes to the Summer Games and can medal', () => {
    expect(gamesSeason(2028)).toBe('summer')
    expect(gamesSeason(2030)).toBe('winter')
    expect(gamesSeason(2027)).toBeNull()
    const g = game(22, {}, 3)
    g.year = 2027
    g.character.money = 100_000
    run(g, 'sports.ind.swimming.practice')
    drain(g)
    const ind = flagProfile<{ sports: Record<string, { attrs: Record<string, number>; fitness: number }> }>(g, 'sports.ind')
    for (const k of Object.keys(ind.sports.swimming.attrs)) ind.sports.swimming.attrs[k] = 95
    ind.sports.swimming.fitness = 95
    run(g, 'sports.ind.swimming.pro')
    drain(g)
    g.character.job!.data.season = 5000
    g.character.job!.data.rank = 3
    nextYear(g)
    expect(g.year).toBe(2028)
    yearlySports(g)
    const seen = drain(g, (m) => (m.scriptId === 'sports.olympics.final' ? 'medal' : undefined))
    expect(seen.some((m) => m.kind === 'choice' && m.title === 'The Olympics')).toBe(true)
    const p = flagProfile<{ games: number[] }>(g, 'sports')
    expect(p.games).toContain(2028)
    checkSane(g)
  })

  it('brands pay famous athletes, and drop them in prison', () => {
    const g = game(25)
    g.character.hidden.fame = 70
    g.character.job = null
    expect(sponsorCall(g, 'Tennis', 1, true)).toBe(true)
    drain(g, () => 'accept')
    const p = flagProfile<{ sponsors: { yearly: number }[] }>(g, 'sports')
    expect(p.sponsors.length).toBe(1)
    expect(p.sponsors[0].yearly).toBeGreaterThan(0)
    const before = g.character.money
    nextYear(g)
    yearlySports(g)
    drain(g)
    expect(g.character.money).toBeGreaterThan(before)
    expect(p.sponsors.length).toBeGreaterThan(0)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    nextYear(g)
    yearlySports(g)
    drain(g)
    expect(flagProfile<{ sponsors: unknown[] }>(g, 'sports').sponsors).toEqual([])
  })

  it('years of head trauma can turn into CTE-related dementia', () => {
    const g = game(45, {}, 9)
    addHeadTrauma(g, 200, true)
    for (let i = 0; i < 60 && !g.character.conditions.some((c) => c.name === 'Dementia'); i++) {
      yearlyBrain(g)
      drain(g)
      nextYear(g)
    }
    expect(g.character.conditions.some((c) => c.name === 'Dementia' && c.curable === false)).toBe(true)
    expect(viewSports(g).cte).toBe(true)
  })
})

describe('random sports lives', () => {
  it('survive random sports actions from birth to old age (full engine, AI off)', async () => {
    const { applyFallback } = await import('../src/game/offline')
    const { ageUp } = await import('../src/game/aging')
    const { createNewLife } = await import('../src/game/life')
    const collect = (g: GameState, nodes: MenuNode[], out: MenuAction[] = [], d = 0): MenuAction[] => {
      if (d > 7) return out
      for (const n of nodes) {
        if (n.type === 'info' || n.type === 'heading') continue
        if (n.visible && !n.visible(g)) continue
        if (n.disabledReason && n.disabledReason(g)) continue
        if (n.type === 'action') out.push(n)
        else collect(g, n.children(g), out, d + 1)
      }
      return out
    }
    const countries = ['us', 'br', 'jp', 'th', 'in', 'gb', 'mx', 'ch']
    for (let seed = 1; seed <= 8; seed++) {
      let s = seed * 7919
      const r = () => {
        s ^= s << 13
        s ^= s >>> 17
        s ^= s << 5
        return (s >>> 0) / 4294967296
      }
      const g = createNewLife({ seed, year: 2026, countryId: countries[seed % countries.length] })
      const settle = () => {
        for (let guard = 0; g.queue.length; guard++) {
          if (guard > 400) throw new Error(`queue stuck: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
          const m = g.queue.shift()!
          const before = g.queue.length
          if (m.kind === 'choice') {
            const c = m.choices[Math.floor(r() * m.choices.length)]
            if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
            else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
          } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Ace', m.data, m)
          else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
          else if (m.kind === 'aiTask') applyFallback(g, m.task)
          g.queue.unshift(...g.queue.splice(before))
        }
      }
      settle()
      g.character.hidden.athleticism = 50 + Math.floor(r() * 50)
      g.character.money += 40_000
      while (g.character.alive && g.character.age < 70) {
        for (let i = 0; i < 5 && g.character.alive; i++) {
          const pool = [...collect(g, [sportsCareerMenu]), ...collect(g, sportsJobNodes(g))]
          if (!pool.length) break
          pool[Math.floor(r() * pool.length)].run(g)
          settle()
        }
        ageUp(g)
        settle()
        expect(Number.isFinite(g.character.money)).toBe(true)
        const json = JSON.stringify(g)
        expect(json).not.toContain('NaN')
        expect(JSON.stringify(JSON.parse(json))).toBe(json)
      }
    }
  }, 120_000)
})

describe('review fixes', () => {
  const indProfile = (g: GameState) => flagProfile<{ sports: Record<string, { attrs: Record<string, number>; fitness: number }> }>(g, 'sports.ind')

  function indPro(g: GameState, sport: string, level: number, disc?: string): void {
    run(g, `sports.ind.${sport}.practice`)
    drain(g)
    const rec = indProfile(g).sports[sport]
    for (const k of Object.keys(rec.attrs)) rec.attrs[k] = level
    rec.fitness = level
    run(g, `sports.ind.${sport}.pro`)
    drain(g, (m) => (disc && m.choices.some((c) => c.id === disc) ? disc : undefined))
    expect(g.character.job?.defId).toBe('sports.ind')
  }

  it('event names that start with "The" read naturally', () => {
    const g = game(24, { hidden: { ...game(0).character.hidden, athleticism: 80 } }, 4)
    g.character.money = 500_000
    indPro(g, 'golf', 80)
    const seen: ModalItem[] = []
    for (let season = 0; season < 3; season++) {
      run(g, 'sports.ind.compete', sportsJobNodes(g))
      seen.push(...drain(g, (m) => (m.scriptId === 'sports.ind.enter' ? 'dev' : m.scriptId === 'sports.ind.pivot' ? 'attack' : undefined)))
      nextYear(g)
      yearlySports(g)
      seen.push(...drain(g, (m) => (m.scriptId === 'sports.ind.retireAsk' ? 'keep' : undefined)))
    }
    const text = allText(seen) + JSON.stringify(g.log) + JSON.stringify(g.flags['special.sports'] ?? '')
    expect(text).toMatch(/Classic/)
    expect(text).not.toMatch(/\bthe The\b/)
  })

  it('biennial world championships are only held in their own season', () => {
    const g = game(24, { hidden: { ...game(0).character.hidden, athleticism: 90 } }, 6)
    g.character.money = 500_000
    g.year = 2030
    indPro(g, 'track', 85, '100m')
    const job = g.character.job!
    job.data.tier = 1
    job.data.rank = 5
    job.data.carry = 5000
    // During an even season the (odd-year) World Championships aren't on the calendar...
    run(g, 'sports.ind.compete', sportsJobNodes(g))
    const cal = g.queue[0]
    expect(cal.kind === 'choice' && cal.choices.some((c) => c.id === 'wtc')).toBe(false)
    drain(g, () => 'cancel')
    // ...and the end-of-season simulation (which runs after New Year) doesn't hold them either.
    nextYear(g)
    yearlySports(g)
    const even = allText(drain(g, (m) => (m.scriptId === 'sports.ind.retireAsk' ? 'keep' : m.scriptId === 'sports.olympics.final' ? 'medal' : undefined)))
    expect(even).toMatch(/Track & Field Season/)
    expect(even).not.toMatch(/World Track Championships/)
    // The odd season does.
    g.character.job!.data.rank = 5
    nextYear(g)
    yearlySports(g)
    const odd = allText(drain(g, (m) => (m.scriptId === 'sports.ind.retireAsk' ? 'keep' : m.scriptId === 'sports.olympics.final' ? 'medal' : undefined)))
    expect(odd).toMatch(/World Track Championships/)
    checkSane(g)
  })

  it("retiring and coming back can't replay a season's prize money", () => {
    const g = game(22, { hidden: { ...game(0).character.hidden, athleticism: 85 } }, 8)
    g.character.money = 300_000
    indPro(g, 'tennis', 80)
    run(g, 'sports.ind.retire', sportsJobNodes(g))
    drain(g)
    expect(g.character.job).toBeNull()
    expect(reason(g, 'sports.ind.tennis.pro')).toMatch(/already started a pro season/)
    expect(reason(g, 'sports.ind.golf.pro')).toMatch(/already started a pro season/)
    nextYear(g)
    expect(reason(g, 'sports.ind.tennis.pro')).toBeNull()

    const e = game(18, {}, 8)
    e.assets.push({ id: 'pc', kind: 'other', name: 'Gaming PC', emoji: '\u{1F5A5}\u{FE0F}', value: 1500, purchasePrice: 1500, condition: 100, purchasedAge: 18, upkeep: 0, details: {} })
    run(e, 'sports.es.game')
    drain(e, () => 'siege')
    const p = flagProfile<{ attrs: Record<string, number>; mmr: Record<string, number> }>(e, 'sports.esports')
    for (const k of Object.keys(p.attrs)) p.attrs[k] = 95
    p.mmr.siege = 3400
    run(e, 'sports.es.pro')
    drain(e, (m) => m.choices[m.choices.length - 2]?.id)
    expect(e.character.job?.defId).toBe('sports.esports')
    run(e, 'sports.es.retire', sportsJobNodes(e))
    drain(e)
    expect(reason(e, 'sports.es.pro')).toMatch(/already went pro/)
    nextYear(e)
    expect(reason(e, 'sports.es.pro')).toBeNull()
  })

  it("backing out of fight offers doesn't reroll the opponents", () => {
    const g = game(20, { hidden: { ...game(0).character.hidden, athleticism: 80 } }, 12)
    const names = (): string[] => {
      run(g, 'sports.mma.amateur')
      const m = g.queue[0]
      const out = m.kind === 'choice' ? (m.data as unknown as { offers: { opp: { name: string } }[] }).offers.map((o) => o.opp.name) : []
      return out
    }
    const first = names()
    drain(g, () => 'cancel')
    expect(names()).toEqual(first)
    drain(g, () => 'cancel')
    expect(names()).toEqual(first)
    // Fighting one of them brings a fresh card.
    drain(g, (m) => (m.scriptId === 'sports.fight.pick' ? '0' : m.scriptId === 'sports.fight.round' ? 'strike' : undefined))
    if (!reason(g, 'sports.mma.amateur')) {
      expect(names()).not.toEqual(first)
      drain(g, () => 'cancel')
    }
    checkSane(g)
  })

  it("saying no to a team or a race seat doesn't reroll the offer", () => {
    const e = game(18, {}, 14)
    e.assets.push({ id: 'pc', kind: 'other', name: 'Gaming PC', emoji: '\u{1F5A5}\u{FE0F}', value: 1500, purchasePrice: 1500, condition: 100, purchasedAge: 18, upkeep: 0, details: {} })
    run(e, 'sports.es.game')
    drain(e, () => 'strike')
    const p = flagProfile<{ attrs: Record<string, number>; mmr: Record<string, number> }>(e, 'sports.esports')
    for (const k of Object.keys(p.attrs)) p.attrs[k] = 95
    p.mmr.strike = 3400
    const teams = (): string => {
      run(e, 'sports.es.pro')
      const m = e.queue[0]
      return m.kind === 'choice' ? JSON.stringify(m.data) : ''
    }
    const first = teams()
    drain(e, () => 'cancel')
    expect(teams()).toBe(first)
    drain(e, () => 'cancel')

    const g = game(18, {}, 14)
    g.character.money = 1_000
    run(g, 'sports.ind.motor.practice')
    drain(g)
    const seat = (): string => {
      run(g, 'sports.ind.motor.pro')
      const m = g.queue[0]
      return m.kind === 'choice' ? m.text : ''
    }
    const offer = seat()
    expect(offer).toMatch(/car rating/)
    drain(g, () => 'no')
    expect(seat()).toBe(offer)
    drain(g, () => 'no')
  })

  it('amateur bouts stop at 40 and commissions stop licensing at 48', () => {
    expect(reason(game(41), 'sports.mma.amateur')).toMatch(/over 40/)
    expect(reason(game(40), 'sports.mma.amateur')).toBeNull()
    const old = game(48)
    old.flags['special.sports.fight'] = { striking: 50, grappling: 50, cardio: 50, chin: 60, iq: 50, natural: 3, gym: '', gymTier: 0, gymFee: 0, amateur: {}, pro: { mma: { w: 5, l: 2, d: 0, nc: 0, ko: 2, sub: 1, dec: 2, koLosses: 0 } }, belts: [], hype: 5, rivals: [], peakRank: null, retiredAge: 40, startAge: 25, earnings: 1000, doping: false, trained: [], lastFightAge: 40, owner: ownerKey(old) } as unknown as Json
    expect(reason(old, 'sports.mma.turnPro')).toMatch(/license/)
  })

  it('belts and circuits are named for where you fight', () => {
    const disc = (id: string) => DISCIPLINES.find((d) => d.id === id)!
    for (const [cid, want] of [['us', /Muay Thai World Series/], ['th', /Siam Grand Stadium/]] as const) {
      const g = game(26, { countryId: cid }, 2)
      hire(g, { defId: 'sports.fighter', title: 'Stadium Nak Muay', company: 'x', salary: 0, data: { disc: 'muaythai', tier: 'major', promotion: 'x', cls: 2, rank: 1, regionalChamp: false, belts: [], defenses: 0, champ: null, fightsLeft: 3, streak: 2, promoWins: 4, injured: 0, earned: 0 } })
      const offers = fightInternals.buildOffers(g, disc('muaythai'), g.character.job, false)
      const title = offers.find((o) => o.kind === 'title')
      expect(title?.belt).toMatch(want)
    }
    const g = game(20, { countryId: 'us' })
    const boxing = findNode(g, sports(g), 'sports.boxing')
    const header = boxing?.type === 'menu' && typeof boxing.header === 'function' ? boxing.header(g) : ''
    expect(header).toMatch(/the American Boxing Circuit/)
    expect(header).not.toMatch(/\bthe the\b/i)
  })

  it('Olympic placings use proper ordinals', () => {
    const texts: string[] = []
    for (let r = 40; r <= 80; r += 2) {
      const g = game(25, {}, r)
      runScript(g, 'sports.olympics.final', 'moment', { year: 2028, entry: { sport: 'Swimming', event: 'Swimming', rating: r, team: false, squad: 0 } } as unknown as Json, g.queue[0] ?? ({} as ModalItem))
      texts.push(allText(g.queue))
    }
    const all = texts.join('\n')
    expect(all).toMatch(/You finished|You won/)
    expect(all).not.toMatch(/(?<!1)[123]th\b/)
  })

  it('esports salaries and pundit raises top out', () => {
    const g = game(22, {}, 5)
    hire(g, { defId: 'sports.esports', title: 'Esports Pro (Arcane Siege)', company: 'Team Nebula', salary: 2_900_000, data: { game: 'siege', team: 'Team Nebula', teamStrength: 90, tier: 1, contractYears: 1, played: [], results: [], earned: 0 } })
    g.flags['special.sports.esports'] = { game: 'siege', mmr: { siege: 3500 }, attrs: { Mechanics: 99, 'Game Sense': 99, Teamwork: 99, Mental: 99 }, titles: [], earnings: 0, startAge: 18, retiredAge: null, cups: 0, owner: ownerKey(g) } as unknown as Json
    for (let y = 0; y < 3 && g.character.job; y++) {
      nextYear(g)
      yearlySports(g)
      drain(g, (m) => (m.scriptId === 'sports.es.renew' ? 'stay' : undefined))
      expect(g.character.job?.salary ?? 0).toBeLessThanOrEqual(3_000_000)
    }
    const t = game(40, {}, 5)
    hire(t, { defId: 'sports.pundit', title: 'Tennis Commentator', company: 'American Sports Network', salary: 1_400_000, performance: 99, data: { sport: 'Tennis', bad: 0 } })
    for (let y = 0; y < 30 && t.character.job; y++) {
      t.character.job.performance = 99
      nextYear(t)
      yearlySports(t)
      drain(t)
      expect(t.character.job?.salary ?? 0).toBeLessThanOrEqual(1_500_000)
    }
    checkSane(t)
  })

  it("teenage pros can't buy performance enhancers", () => {
    const g = game(16, { hidden: { ...game(0).character.hidden, athleticism: 85 } }, 3)
    g.character.money = 200_000
    indPro(g, 'tennis', 70)
    expect(reason(g, 'sports.ind.dope', sportsJobNodes(g))).toMatch(/teenager/)
  })
})

describe('review fixes: copy and contracts', () => {
  it('small leagues never offer a $0 contract', () => {
    let offers = 0
    for (let seed = 1; seed <= 12 && offers < 2; seed++) {
      // A scout from a small home league (women's basketball in Mexico) pays a few thousand a year.
      const g = game(18, { countryId: 'mx', city: 'Cancún', gender: 'female', hidden: { ...game(0).character.hidden, athleticism: 90 } }, seed)
      yearlySports(g)
      const seen = drain(g, () => 'decline')
      const contract = seen.find((m) => m.kind === 'choice' && m.scriptId === 'special.athlete.contract')
      if (!contract || contract.kind !== 'choice') continue
      const o = contract.data as unknown as { league: string; salary: number }
      if (!o.league.startsWith('home:mx')) continue
      offers++
      expect(contract.text).not.toMatch(/\$0 per year/)
      expect(o.salary).toBeGreaterThanOrEqual(1_000)
      expect(o.salary).toBeLessThan(20_000)
    }
    expect(offers).toBeGreaterThan(0)
  })

  it('past careers read "1 title", and end when the career did', () => {
    const g = game(60)
    g.flags['special.sports.ind'] = { sports: { tabletennis: { attrs: { Spin: 50 }, fitness: 50, discipline: null, bestRank: 200, titles: 1, majors: 0, majorList: [], earnings: 9000, seasons: 1, startAge: 21, retiredAge: null, crowns: 0, practiced: [] } }, owner: ownerKey(g) } as unknown as Json
    g.flags['special.sports.fight'] = { striking: 50, grappling: 50, cardio: 50, chin: 60, iq: 50, natural: 3, gym: '', gymTier: 0, gymFee: 0, amateur: {}, pro: { mma: { w: 1, l: 0, d: 0, nc: 0, ko: 1, sub: 0, dec: 0, koLosses: 0 } }, belts: [], hype: 5, rivals: [], peakRank: null, retiredAge: null, startAge: 25, earnings: 1000, doping: false, trained: [], lastFightAge: 26, owner: ownerKey(g) } as unknown as Json
    const after = findNode(g, sports(g), 'sports.after')
    const lines = after?.type === 'menu' ? after.children(g).flatMap((n) => (n.type === 'info' ? [String(n.text)] : [])) : []
    const tt = lines.find((l) => l.startsWith('Table Tennis'))
    expect(tt).toMatch(/age 21–22, 1 title$/)
    expect(lines.find((l) => l.startsWith('MMA'))).toMatch(/age 25–26/)
  })
})
