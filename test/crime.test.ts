// Crime: arrests & trials, the crime menu (burglary, pickpocketing, murder...), the yearly police
// work, and the burglary / pickpocket minigame components.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { counter } from '../src/game/core'
import { arrestPlayer, crimeMenu, crimeSeverity, yearlyCrime, type BurglaryData } from '../src/game/crime'
import { createPerson } from '../src/game/people'
import { fugitiveInfo, prisonMenu, sendToPrison } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode, MinigameModal, ModalItem } from '../src/game/types'
import { Burglary, readBurglaryHouse } from '../src/ui/minigames/Burglary'
import { inZone, markerPosition, Pickpocket } from '../src/ui/minigames/Pickpocket'
import { makeTestGame } from './helpers'

function adult(seed = 1, age = 25, money = 0): GameState {
  return makeTestGame(seed, { age, money })
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

function action(g: GameState, id: string): MenuAction {
  const n = findNode(g, crimeMenu.children(g), id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

/** Take the first queued modal of a kind (removing it from the queue). */
function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const i = g.queue.findIndex((m) => m.kind === kind && (!scriptId || ('scriptId' in m && m.scriptId === scriptId)))
  if (i < 0) throw new Error(`no ${kind} ${scriptId ?? ''} in queue: ${g.queue.map((m) => m.kind + ':' + ('scriptId' in m ? m.scriptId : '')).join(', ')}`)
  const [m] = g.queue.splice(i, 1)
  return m as Extract<ModalItem, { kind: K }>
}

function answer(g: GameState, m: ChoiceModal | MinigameModal, choice: string): void {
  runScript(g, m.scriptId!, choice, m.data, m)
}

/** Answer the trial chain: cooperate, pick a lawyer, then accept or refuse a plea deal. */
function runTrial(g: GameState, opts: { lawyer?: string; plea?: 'accept' | 'trial' } = {}): void {
  for (let guard = 0; guard < 10; guard++) {
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.'))
    if (!m) return
    g.queue.splice(g.queue.indexOf(m), 1)
    if (m.scriptId === 'crime.arrest') answer(g, m, 'cooperate')
    else if (m.scriptId === 'crime.trial.lawyer') answer(g, m, opts.lawyer ?? 'pd')
    else if (m.scriptId === 'crime.trial.plea') answer(g, m, opts.plea ?? 'trial')
    else if (m.scriptId === 'crime.trial.feds') answer(g, m, 'refuse')
    else return
  }
}

describe('arrest and trial', () => {
  it('walks the arrest → lawyer → verdict chain and locks up the guilty', () => {
    let convictions = 0
    let acquittals = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = adult(seed)
      arrestPlayer(g, 'Burglary', 3, { evidence: 0.9 })
      const arrest = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
      expect(arrest.scriptId).toBe('crime.arrest')
      expect(arrest.choices.map((c) => c.id)).toEqual(['cooperate', 'run', 'bribe', 'insult'])
      expect(counter(g, 'arrests')).toBe(1)
      runTrial(g)
      const c = g.character
      if (c.prison) {
        convictions++
        expect(counter(g, 'convictions')).toBe(1)
        expect(c.residence.status).toBe('prison')
        expect(c.prison.crime).toBe('Burglary')
        expect(c.prison.sentenceYears).toBeGreaterThanOrEqual(1)
        expect(c.criminalRecord.some((r) => r.crime === 'Burglary' && r.caught && r.convicted)).toBe(true)
        const mates = g.people.filter((p) => p.relation === 'cellmate')
        expect(mates.length).toBeGreaterThanOrEqual(1)
        expect(mates.every((m) => m.contextId === c.prison!.name)).toBe(true)
        expect(g.queue.some((m) => m.kind === 'notice' && /Guilty|Plea/.test(m.title))).toBe(true)
      } else {
        acquittals++
        expect(counter(g, 'convictions')).toBe(0)
        expect(c.criminalRecord.every((r) => !r.convicted)).toBe(true)
      }
      expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    }
    expect(convictions).toBeGreaterThan(acquittals)
    expect(convictions + acquittals).toBe(40)
  })

  it('a plea deal sends you to prison for the offered term', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = adult(seed, 30, 1_000_000)
      arrestPlayer(g, 'Bank Robbery', 3, { evidence: 0.8, noResist: true })
      const lawyer = take(g, 'choice', 'crime.trial.lawyer')
      answer(g, lawyer, 'top')
      const plea = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'crime.trial.plea')
      if (!plea) continue
      g.queue.splice(g.queue.indexOf(plea), 1)
      const years = (plea.data as { plea: number }).plea
      answer(g, plea, 'accept')
      expect(g.character.prison?.sentenceYears).toBe(years)
      expect(g.character.money).toBeLessThan(1_000_000) // paid the lawyer
      return
    }
    throw new Error('no plea deal offered in 60 seeds')
  })

  it("can't pay for a lawyer you can't afford", () => {
    const g = adult(3, 30, 0)
    arrestPlayer(g, 'Assault', 2, { noResist: true })
    answer(g, take(g, 'choice', 'crime.trial.lawyer'), 'top')
    expect(g.character.money).toBe(0)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === "Can't Afford It")).toBe(true)
  })

  it('minors go to juvenile detention with short sentences', () => {
    let jailed = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = adult(seed, 15)
      arrestPlayer(g, 'Grand Theft Auto', 2, { evidence: 1 })
      runTrial(g)
      const p = g.character.prison
      if (!p) continue
      jailed++
      expect(p.sentenceYears).toBeLessThanOrEqual(6)
      expect(p.security).toBe('minimum')
      expect(p.name).toMatch(/Juvenile|Youth/)
    }
    expect(jailed).toBeGreaterThan(0)
  })

  it('young kids just get driven home', () => {
    const g = adult(1, 8)
    arrestPlayer(g, 'Shoplifting', 1)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
    expect(g.character.prison).toBeNull()
  })

  it('works when already in prison: adds time without a trial', () => {
    const g = adult(5)
    sendToPrison(g, 'Burglary', 3, { quiet: true })
    const before = g.character.prison!.sentenceYears
    const records = g.character.criminalRecord.length
    arrestPlayer(g, 'Assault', 2)
    expect(g.character.prison!.sentenceYears).toBeGreaterThan(before)
    expect(g.character.criminalRecord.length).toBe(records + 1)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
  })

  it('does nothing for the dead', () => {
    const g = adult()
    g.character.alive = false
    arrestPlayer(g, 'Murder', 5)
    expect(g.queue.length).toBe(0)
  })

  it('second arrest during a pending trial joins the same case', () => {
    const g = adult(2)
    arrestPlayer(g, 'Burglary', 2)
    arrestPlayer(g, 'Assault', 2)
    const trials = g.queue.filter((m) => m.kind === 'choice')
    expect(trials.length).toBe(1)
    expect((trials[0].data as { charges: string[] }).charges).toContain('Assault')
  })

  it('murder convictions can mean life or death row', () => {
    let harsh = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = adult(seed, 35)
      arrestPlayer(g, 'Murder', 5, { evidence: 1, violent: 'murder' })
      runTrial(g, { plea: 'trial' })
      const p = g.character.prison
      if (p && (p.life || p.deathRow)) harsh++
      if (p?.deathRow) expect(p.life).toBe(true)
    }
    expect(harsh).toBeGreaterThan(0)
    expect(crimeSeverity('Murder')).toBe(5)
  })
})

describe('crime menu', () => {
  it('is hidden in prison and age-gated', () => {
    const kid = adult(1, 6)
    expect(crimeMenu.disabledReason?.(kid)).toBeTruthy()
    const g = adult(1, 25)
    expect(crimeMenu.visible?.(g)).toBe(true)
    sendToPrison(g, 'Burglary', 2, { quiet: true })
    expect(crimeMenu.visible?.(g)).toBe(false)
    const teen = adult(1, 12)
    expect(action(teen, 'crime.pickpocket').disabledReason?.(teen)).toBeNull()
    const murder = findNode(teen, crimeMenu.children(teen), 'crime.murder')
    expect(murder?.type).toBe('menu')
    if (murder?.type === 'menu') expect(murder.disabledReason?.(teen)).toBeTruthy()
  })

  it('burglary: pick a house, search rooms, pocket the loot', () => {
    const g = adult(7)
    action(g, 'crime.burglary').run(g)
    const pickHouse = take(g, 'choice', 'crime.burglary.pick')
    expect(pickHouse.choices.length).toBe(4)
    answer(g, pickHouse, 'h3')
    const game = take(g, 'minigame')
    expect(game.game).toBe('burglary')
    const house = readBurglaryHouse(game.data)
    expect(house).not.toBeNull()
    const data = game.data as unknown as BurglaryData
    expect(data.rolls.length).toBe(data.rooms.length)
    const lootRooms = data.rooms.filter((r) => r.loot.length > 0)
    const value = lootRooms.reduce((s, r) => s + r.loot.reduce((a, it) => a + it.value, 0), 0)
    answer(g, game, JSON.stringify({ loot: value, caught: false, rooms: lootRooms.map((r) => r.id) }))
    expect(counter(g, 'crimes')).toBe(1)
    expect(g.character.money).toBe(value)
    expect(g.character.criminalRecord[0]).toMatchObject({ crime: 'Burglary', caught: false })
    expect(g.character.hidden.karma).toBeLessThan(50)
  })

  it('burglary: caught red-handed can lead to an arrest; loot claims are capped', () => {
    let arrests = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = adult(seed)
      action(g, 'crime.burglary').run(g)
      answer(g, take(g, 'choice', 'crime.burglary.pick'), 'h1')
      const game = take(g, 'minigame')
      answer(g, game, JSON.stringify({ loot: 5000, caught: true, by: 'alarm' }))
      expect(g.character.money).toBe(0)
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'crime.arrest')) arrests++
    }
    expect(arrests).toBeGreaterThan(0)
    const g = adult(4)
    action(g, 'crime.burglary').run(g)
    answer(g, take(g, 'choice', 'crime.burglary.pick'), 'h1')
    const game = take(g, 'minigame')
    const data = game.data as unknown as BurglaryData
    const max = data.rooms.reduce((s, r) => s + r.loot.reduce((a, it) => a + it.value, 0), 0)
    answer(g, game, JSON.stringify({ loot: 99_999_999, caught: false }))
    expect(g.character.money).toBeLessThanOrEqual(max)
  })

  it('burglary: a per-year limit stops spam', () => {
    const g = adult(9)
    for (let i = 0; i < 3; i++) {
      action(g, 'crime.burglary').run(g)
      g.queue = []
    }
    action(g, 'crime.burglary').run(g)
    expect(g.queue[0]).toMatchObject({ kind: 'notice', title: 'Lie Low' })
  })

  it('pickpocket: pick a target, play the timing game', () => {
    const g = adult(11)
    action(g, 'crime.pickpocket').run(g)
    const pick = take(g, 'choice', 'crime.pickpocket.pick')
    const target = pick.choices.find((c) => c.id !== 'cancel' && c.id !== 'cop')!
    answer(g, pick, target.id)
    const game = take(g, 'minigame')
    expect(game.game).toBe('pickpocket')
    const d = game.data as { zoneStart: number; zoneWidth: number; speed: number }
    expect(d.zoneStart).toBeGreaterThanOrEqual(0)
    expect(d.zoneStart + d.zoneWidth).toBeLessThanOrEqual(1)
    answer(g, game, 'success')
    expect(counter(g, 'crimes')).toBe(1)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    const cold = adult(12)
    action(cold, 'crime.pickpocket').run(cold)
    const pick2 = take(cold, 'choice', 'crime.pickpocket.pick')
    answer(cold, pick2, pick2.choices[0].id)
    answer(cold, take(cold, 'minigame'), 'cancel')
    expect(counter(cold, 'crimes')).toBe(0)
  })

  it('murdering a family member marks them dead and the family reacts', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const g = adult(seed, 25)
      const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 52 })
      const sis = createPerson(g, { relation: 'sibling', gender: 'female', age: 22 })
      const sisHappy = sis.stats.happiness
      const target = findNode(g, crimeMenu.children(g), `crime.murder.${mom.id}`)
      expect(target?.type).toBe('action')
      ;(target as MenuAction).run(g)
      const methods = take(g, 'choice', 'crime.murder.method')
      const method = methods.choices.find((c) => c.id !== 'cancel')!
      answer(g, methods, method.id)
      if (!g.character.alive) continue // backfired
      if (counter(g, 'murders') === 0) continue // failed attempt
      expect(mom.alive).toBe(false)
      expect(mom.causeOfDeath).toBe('Murdered')
      expect(g.people.includes(mom)).toBe(true)
      expect(sis.stats.happiness).toBeLessThan(sisHappy)
      expect(counter(g, 'crimes')).toBe(1)
      expect(g.character.criminalRecord.some((r) => r.crime === 'Murder')).toBe(true)
      // A caught killer goes to trial; the family turns on them when convicted.
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'crime.arrest')) {
        runTrial(g)
        if (g.character.prison) expect(sis.relationship).toBe(0)
      }
      return
    }
    throw new Error('no successful murder in 80 seeds')
  })

  it('a random stranger can be murdered too', () => {
    const g = adult(3, 30)
    const stranger = findNode(g, crimeMenu.children(g), 'crime.murder.stranger') as MenuAction
    stranger.run(g)
    const methods = take(g, 'choice', 'crime.murder.method')
    answer(g, methods, 'cancel')
    expect(counter(g, 'crimes')).toBe(0)
    expect(g.people.length).toBe(0)
  })
})

describe('crime life simulation', () => {
  function driver(seed: number) {
    let s = seed >>> 0 || 1
    return () => {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      return (s >>> 0) / 4294967296
    }
  }

  function minigameResult(m: MinigameModal, next: () => number): string {
    if (m.game === 'burglary') {
      const d = m.data as unknown as BurglaryData
      const rooms = d.rooms.filter(() => next() < 0.5).map((r) => r.id)
      return JSON.stringify({ loot: 0, caught: next() < 0.3, rooms })
    }
    if (m.game === 'pickpocket') return next() < 0.5 ? 'success' : 'fail'
    if (m.game === 'prisonEscape') return next() < 0.5 ? 'escaped' : 'caught'
    return 'done'
  }

  function drain(g: GameState, next: () => number): void {
    for (let guard = 0; g.queue.length > 0; guard++) {
      if (guard > 300) throw new Error(`queue never drains: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
      const m = g.queue.shift() as ModalItem
      const before = g.queue.length
      if (m.kind === 'choice' && m.source === 'script' && m.scriptId) {
        expect(m.choices.length).toBeGreaterThan(0)
        runScript(g, m.scriptId, m.choices[Math.floor(next() * m.choices.length)].id, m.data, m)
      } else if (m.kind === 'minigame') {
        runScript(g, m.scriptId, minigameResult(m, next), m.data, m)
      } else if (m.kind === 'input') {
        runScript(g, m.scriptId, String(m.min ?? 1), m.data, m)
      }
      const added = g.queue.splice(before)
      g.queue.unshift(...added)
    }
  }

  function actions(g: GameState, nodes: MenuNode[], out: MenuAction[] = []): MenuAction[] {
    for (const n of nodes) {
      if (n.type === 'info' || n.type === 'heading') continue
      if (n.visible && !n.visible(g)) continue
      if (n.disabledReason && n.disabledReason(g)) continue
      if (n.type === 'action') out.push(n)
      else actions(g, n.children(g), out)
    }
    return out
  }

  it('commits random crimes for decades without breaking state', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const g = makeTestGame(seed, { age: 10 + (seed % 8), money: seed % 2 ? 0 : 200_000 })
      g.character.job = seed % 3 === 0 ? { defId: 'teller', title: 'Bank Teller', company: 'First Bank', category: 'fulltime', salary: 40000, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} } : null
      createPerson(g, { relation: 'parent', age: 45 })
      createPerson(g, { relation: 'sibling', age: 14 })
      createPerson(g, { relation: 'friend', age: 20 })
      const next = driver(seed * 104729)
      for (let year = 0; year < 30 && g.character.alive; year++) {
        g.yearActions = {}
        for (let k = 0; k < 5 && g.character.alive; k++) {
          const menu = g.character.prison ? prisonMenu : crimeMenu
          const acts = actions(g, menu.children(g))
          if (acts.length === 0) break
          acts[Math.floor(next() * acts.length)].run(g)
          drain(g, next)
        }
        if (!g.character.alive) break
        yearlyCrime(g)
        drain(g, next)
        g.character.age += 1
        const c = g.character
        for (const v of Object.values(c.stats)) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(100)
        }
        expect(Number.isFinite(c.money)).toBe(true)
        expect(c.wantedLevel).toBeGreaterThanOrEqual(0)
        expect(c.wantedLevel).toBeLessThanOrEqual(5)
        expect(c.residence.status === 'prison').toBe(!!c.prison)
        const ids = g.people.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const p of g.people) {
          expect(p.relationship).toBeGreaterThanOrEqual(0)
          expect(p.relationship).toBeLessThanOrEqual(100)
        }
        expect(JSON.parse(JSON.stringify(g))).toEqual(g)
      }
      expect(counter(g, 'crimes')).toBeGreaterThan(0)
    }
  })
})

describe('yearly police work', () => {
  it('wanted level decays or the police catch up', () => {
    let caught = 0
    let decayed = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = adult(seed)
      g.character.criminalRecord.push({ crime: 'Burglary', age: 25, caught: false, convicted: false })
      g.character.wantedLevel = 3
      yearlyCrime(g)
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'crime.arrest')) caught++
      else if (g.character.wantedLevel < 3) decayed++
    }
    expect(caught).toBeGreaterThan(0)
    expect(decayed).toBeGreaterThan(0)
  })

  it('fugitives get recaptured eventually', () => {
    const g = adult(21)
    g.character.residence = { status: 'homeless' }
    g.flags.fugitive = { crime: 'Burglary', yearsLeft: 5, prison: 'Old Rock Prison', security: 'medium', escapedAge: 25, deathRow: false, countryId: 'us' }
    g.character.wantedLevel = 5
    expect(fugitiveInfo(g)).not.toBeNull()
    for (let y = 0; y < 80 && !g.character.prison; y++) {
      g.queue = []
      yearlyCrime(g)
    }
    expect(g.character.prison).not.toBeNull()
    expect(g.character.prison!.sentenceYears).toBeGreaterThan(5)
    expect(g.character.criminalRecord.some((r) => r.crime === 'Felony Escape')).toBe(true)
    expect(fugitiveInfo(g)).toBeNull()
  })
})

describe('minigame components', () => {
  it('burglary renders a floor plan from engine data', () => {
    const g = adult(7)
    action(g, 'crime.burglary').run(g)
    answer(g, take(g, 'choice', 'crime.burglary.pick'), 'h2')
    const game = take(g, 'minigame')
    const html = renderToStaticMarkup(createElement(Burglary, { modal: game, onDone: () => {} }))
    const data = game.data as unknown as BurglaryData
    for (const r of data.rooms) expect(html).toContain(r.name.replace("'", '&#x27;'))
    expect(html).toContain('Chicken out')
    // Malformed data still renders a way out.
    const bad = renderToStaticMarkup(createElement(Burglary, { modal: { ...game, data: { nope: 1 } }, onDone: () => {} }))
    expect(bad).toContain('Walk away')
  })

  it('pickpocket renders and the timing helpers work', () => {
    const modal: MinigameModal = { kind: 'minigame', id: 'm1', game: 'pickpocket', title: 'Pickpocket', scriptId: 'crime.pickpocket.result', data: { target: 'A tourist', emoji: '🤳', speed: 1, zoneStart: 0.4, zoneWidth: 0.2, targetId: 'tourist' } }
    const html = renderToStaticMarkup(createElement(Pickpocket, { modal, onDone: () => {} }))
    expect(html).toContain('A tourist')
    expect(html).toContain('Reach for the wallet')
    expect(markerPosition(0, 1)).toBe(0)
    expect(markerPosition(0.5, 1)).toBeCloseTo(0.5)
    expect(markerPosition(1, 1)).toBeCloseTo(1)
    expect(markerPosition(1.5, 1)).toBeCloseTo(0.5)
    expect(markerPosition(2, 1)).toBeCloseTo(0)
    expect(inZone(0.5, 0.4, 0.2)).toBe(true)
    expect(inZone(0.39, 0.4, 0.2)).toBe(false)
  })
})
