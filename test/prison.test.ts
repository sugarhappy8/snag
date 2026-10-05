// Prison: going in, getting out, yearly sentence bookkeeping, death row, the prison menu,
// the escape script and the escape maze (generator, solver, guard rules, UI component).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { counter } from '../src/game/core'
import { yearlyCrime } from '../src/game/crime'
import { createPerson } from '../src/game/people'
import {
  advanceGuards,
  fugitiveInfo,
  generateEscapeMaze,
  guardStep,
  mazeCanMove,
  playerMove,
  prisonLife,
  prisonMenu,
  releaseFromPrison,
  sendToPrison,
  solveEscapeMaze,
  type EscapeMaze,
} from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuNode, MinigameModal, ModalItem } from '../src/game/types'
import { PrisonEscape, readEscapeMaze } from '../src/ui/minigames/PrisonEscape'
import { makeTestGame } from './helpers'

function adult(seed = 1, age = 30): GameState {
  return makeTestGame(seed, { age })
}

function giveJob(g: GameState): void {
  g.character.job = { defId: 'cashier', title: 'Cashier', company: 'MegaMart', category: 'fulltime', salary: 25000, level: 0, performance: 60, yearsInRole: 2, yearsAtCompany: 2, data: {} }
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

function prisonAction(g: GameState, id: string): MenuAction {
  const n = findNode(g, prisonMenu.children(g), id)
  if (!n || n.type !== 'action') throw new Error(`no prison action ${id}`)
  return n
}

function takeMinigame(g: GameState): MinigameModal {
  const i = g.queue.findIndex((m) => m.kind === 'minigame')
  if (i < 0) throw new Error('no minigame queued')
  return g.queue.splice(i, 1)[0] as MinigameModal
}

/** Tiny deterministic driver RNG for answering popups. */
function driver(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** Resolve the modal queue like the store does, answering choices at random. */
function drain(g: GameState, next: () => number): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 200) throw new Error(`queue never drains: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
    const m = g.queue.shift() as ModalItem
    const before = g.queue.length
    if (m.kind === 'choice' && m.source === 'script' && m.scriptId) {
      expect(m.choices.length).toBeGreaterThan(0)
      runScript(g, m.scriptId, m.choices[Math.floor(next() * m.choices.length)].id, m.data, m)
    } else if (m.kind === 'minigame') {
      runScript(g, m.scriptId, next() < 0.5 ? 'escaped' : 'caught', m.data, m)
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, String(m.min ?? 1), m.data, m)
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function collectActions(g: GameState, nodes: MenuNode[], out: MenuAction[] = []): MenuAction[] {
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action') out.push(n)
    else collectActions(g, n.children(g), out)
  }
  return out
}

describe('sendToPrison', () => {
  it('ends jobs, drops out of school, moves into a cell with cellmates', () => {
    const g = adult(3, 19)
    giveJob(g)
    g.character.education.current = { level: 'university', school: 'State U', year: 1, totalYears: 4, grades: 60, data: {} }
    sendToPrison(g, 'Burglary', 4, { severity: 2 })
    const c = g.character
    expect(c.job).toBeNull()
    expect(c.careerHistory.at(-1)?.reason).toBe('prison')
    expect(c.education.current).toBeNull()
    expect(c.education.droppedOut).toContain('university')
    expect(c.prison).toMatchObject({ crime: 'Burglary', sentenceYears: 4, yearsServed: 0, appealed: false })
    expect(c.residence).toEqual({ status: 'prison', description: c.prison!.name })
    const mates = g.people.filter((p) => p.relation === 'cellmate')
    expect(mates.length).toBeGreaterThanOrEqual(1)
    expect(mates.length).toBeLessThanOrEqual(2)
    for (const m of mates) expect(m.contextId).toBe(c.prison!.name)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Locked Up')).toBe(true)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })

  it('extends the sentence when already in prison', () => {
    const g = adult()
    sendToPrison(g, 'Burglary', 3, { quiet: true })
    sendToPrison(g, 'Assault', 2, { quiet: true })
    expect(g.character.prison!.sentenceYears).toBe(5)
    sendToPrison(g, 'Murder', 0, { life: true, quiet: true })
    expect(g.character.prison!.life).toBe(true)
  })

  it('a partner may leave', () => {
    let left = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = adult(seed)
      const partner = createPerson(g, { relation: 'partner', age: 30, relationship: 40 })
      sendToPrison(g, 'Burglary', 12, { quiet: true })
      if (partner.relation === 'ex') left++
      else expect(partner.relation).toBe('partner')
    }
    expect(left).toBeGreaterThan(0)
  })
})

describe('releaseFromPrison', () => {
  it('removes cellmates, restores a home and clears the wanted level', () => {
    const g = adult(2, 16)
    createPerson(g, { relation: 'parent', age: 45 })
    sendToPrison(g, 'Shoplifting', 1, { quiet: true })
    expect(prisonLife(g).juvenile).toBe(true)
    g.character.wantedLevel = 2
    releaseFromPrison(g, 'served')
    const c = g.character
    expect(c.prison).toBeNull()
    expect(c.residence.status).toBe('parents')
    expect(c.wantedLevel).toBe(0)
    expect(g.people.some((p) => p.relation === 'cellmate')).toBe(false)
    expect(g.flags.prisonLife).toBeUndefined()
  })

  it('adults with nowhere to go end up homeless; close cellmates become friends', () => {
    const g = adult(4, 40)
    sendToPrison(g, 'Fraud', 2, { quiet: true })
    const mate = g.people.find((p) => p.relation === 'cellmate')!
    mate.relationship = 90
    releaseFromPrison(g, 'parole')
    expect(g.character.residence.status).toBe('homeless')
    expect(mate.relation).toBe('friend')
  })
})

describe('yearly prison time', () => {
  it('releases the player once the sentence is served', () => {
    const g = adult(6)
    sendToPrison(g, 'Burglary', 2, { quiet: true })
    g.queue = []
    yearlyCrime(g)
    expect(counter(g, 'prisonYears')).toBe(1)
    if (g.character.prison) {
      expect(g.character.prison.yearsServed).toBe(1)
      g.queue = [] // ignore any parole hearing / prison events
      yearlyCrime(g)
    }
    expect(g.character.prison).toBeNull()
    expect(g.character.residence.status).not.toBe('prison')
    expect(g.people.some((p) => p.relation === 'cellmate')).toBe(false)
  })

  it('juveniles who turn 18 move to an adult prison', () => {
    const g = adult(8, 17)
    sendToPrison(g, 'Assault', 4, { quiet: true })
    const juvieName = g.character.prison!.name
    g.character.age = 18
    g.queue = []
    yearlyCrime(g)
    if (g.character.prison) {
      expect(g.character.prison.name).not.toBe(juvieName)
      expect(prisonLife(g).juvenile).toBe(false)
      expect(g.people.filter((p) => p.relation === 'cellmate').every((p) => p.contextId === g.character.prison!.name)).toBe(true)
    }
  })

  it('death row ends in execution unless the sentence is commuted', () => {
    let executed = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = adult(seed, 40)
      sendToPrison(g, 'Murder', 0, { deathRow: true, quiet: true })
      for (let y = 0; y < 10 && g.character.alive && g.character.prison?.deathRow; y++) {
        g.queue = []
        yearlyCrime(g)
      }
      if (!g.character.alive) {
        executed++
        expect(g.character.causeOfDeath).toBe('Execution')
      } else {
        expect(g.character.prison?.life).toBe(true)
        expect(g.character.prison?.deathRow).toBeFalsy()
      }
    }
    expect(executed).toBeGreaterThan(0)
  })
})

describe('prison menu', () => {
  it('shows the sentence info rows and the BitLife prison actions', () => {
    const g = adult(9)
    expect(prisonMenu.visible?.(g)).toBe(false)
    sendToPrison(g, 'Burglary', 5, { quiet: true })
    expect(prisonMenu.visible?.(g)).toBe(true)
    const ids = prisonMenu.children(g).map((n) => n.id)
    for (const id of ['prison.info', 'prison.sentence', 'prison.respect', 'prison.appeal', 'prison.escape', 'prison.riot']) expect(ids).toContain(id)
    const sentence = prisonMenu.children(g).find((n) => n.id === 'prison.sentence')
    expect(sentence?.type).toBe('info')
    if (sentence?.type === 'info') expect(typeof sentence.text === 'function' ? sentence.text(g) : sentence.text).toContain('5 years left')
  })

  it('only one appeal per sentence', () => {
    const g = makeTestGame(10, { age: 30, money: 10_000_000 })
    sendToPrison(g, 'Burglary', 8, { quiet: true })
    const appeal = prisonAction(g, 'prison.appeal.top')
    expect(appeal.disabledReason?.(g)).toBeNull()
    appeal.run(g)
    expect(g.character.money).toBeLessThan(10_000_000)
    if (g.character.prison) expect(prisonAction(g, 'prison.appeal.top').disabledReason?.(g)).toMatch(/already appealed/)
  })

  it('every prison action runs safely for years on end', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = makeTestGame(seed, { age: 25, money: 50_000 })
      const next = driver(seed * 7919)
      sendToPrison(g, seed % 3 === 0 ? 'Murder' : 'Armed Robbery', 15, { quiet: true, life: seed % 3 === 0 })
      for (let year = 0; year < 15 && g.character.alive && g.character.prison; year++) {
        g.yearActions = {}
        for (let k = 0; k < 6 && g.character.prison && g.character.alive; k++) {
          const acts = collectActions(g, prisonMenu.children(g))
          if (acts.length === 0) break
          acts[Math.floor(next() * acts.length)].run(g)
          drain(g, next)
        }
        if (!g.character.alive) break
        yearlyCrime(g)
        drain(g, next)
        g.character.age += 1
        const c = g.character
        for (const v of Object.values(c.stats)) expect(v).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(c.money)).toBe(true)
        if (c.prison) {
          expect(c.residence.status).toBe('prison')
          expect(c.prison.yearsServed).toBeGreaterThanOrEqual(0)
        }
        expect(JSON.parse(JSON.stringify(g))).toEqual(g)
      }
    }
  })
})

describe('escape', () => {
  function escapeAttempt(seed: number, security?: 'minimum' | 'medium' | 'maximum'): { g: GameState; game: MinigameModal } {
    const g = adult(seed)
    sendToPrison(g, 'Armed Robbery', 10, { quiet: true, security })
    g.queue = []
    prisonAction(g, 'prison.escape').run(g)
    const game = takeMinigame(g)
    expect(game.game).toBe('prisonEscape')
    return { g, game }
  }

  it('escaping releases you as a fugitive with a high wanted level', () => {
    const { g, game } = escapeAttempt(11)
    expect(solveEscapeMaze(game.data as unknown as EscapeMaze)).toBeGreaterThan(0)
    const prisonName = g.character.prison!.name
    runScript(g, game.scriptId, 'escaped', game.data, game)
    const c = g.character
    expect(c.prison).toBeNull()
    expect(c.wantedLevel).toBe(5)
    expect(counter(g, 'escapes')).toBe(1)
    const fu = fugitiveInfo(g)
    expect(fu).toMatchObject({ crime: 'Armed Robbery', prison: prisonName, countryId: 'us' })
    expect(fu!.yearsLeft).toBe(10)
    expect(g.people.some((p) => p.relation === 'cellmate')).toBe(false)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'You Escaped!')).toBe(true)
  })

  it('getting caught adds years; only one attempt a year', () => {
    const { g, game } = escapeAttempt(12)
    const before = g.character.prison!.sentenceYears
    runScript(g, game.scriptId, 'caught', game.data, game)
    expect(g.character.prison).not.toBeNull()
    expect(g.character.prison!.sentenceYears).toBeGreaterThan(before)
    expect(g.character.prison!.escapeAttempts).toBe(1)
    expect(prisonAction(g, 'prison.escape').disabledReason?.(g)).toMatch(/already tried/)
  })

  it('losing your nerve changes nothing', () => {
    const { g, game } = escapeAttempt(13)
    const before = structuredClone(g.character.prison)
    runScript(g, game.scriptId, 'quit', game.data, game)
    expect(g.character.prison).toEqual(before)
  })
})

describe('escape maze', () => {
  it('is always solvable for every security level', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const security of ['minimum', 'medium', 'maximum'] as const) {
        const g = makeTestGame(seed * 31 + security.length)
        const m = generateEscapeMaze(g, security, { prison: 'Test Prison' })
        const moves = solveEscapeMaze(m)
        expect(moves, `seed ${seed} ${security}`).toBeGreaterThan(0)
        expect(m.minMoves).toBe(moves)
        expect(m.walls.length).toBe(m.w * m.h)
        expect(m.guards.every((q) => !(q.x === m.player.x && q.y === m.player.y))).toBe(true)
        expect(readEscapeMaze(m as unknown as Parameters<typeof readEscapeMaze>[0])).toEqual(m)
      }
      const juvie = generateEscapeMaze(makeTestGame(seed), 'minimum', { juvenile: true })
      expect(solveEscapeMaze(juvie)).toBeGreaterThan(0)
      const bribed = generateEscapeMaze(makeTestGame(seed), 'maximum', { bribedGuard: true })
      expect(bribed.guards.length).toBe(1)
      expect(solveEscapeMaze(bribed)).toBeGreaterThan(0)
    }
  })

  it('following the solver path actually escapes', () => {
    const m = generateEscapeMaze(makeTestGame(77), 'maximum')
    // Re-solve while walking: at each step pick a move that keeps the remaining puzzle solvable.
    let player = m.player
    let guards = m.guards
    for (let step = 0; step < 200; step++) {
      let moved = false
      for (const d of ['N', 'E', 'S', 'W'] as const) {
        const res = playerMove(m, player, guards, d)
        if (res.result === 'escaped') return
        if (res.result !== 'moved') continue
        const g2 = res.frames.at(-1) ?? guards
        const left = solveEscapeMaze({ ...m, player: res.player, guards: g2 })
        if (left >= 0 && left < solveEscapeMaze({ ...m, player, guards })) {
          player = res.player
          guards = g2
          moved = true
          break
        }
      }
      expect(moved).toBe(true)
    }
    throw new Error('never escaped')
  })

  it('guards move horizontally first and respect walls', () => {
    const open = { w: 3, h: 3, walls: new Array<number>(9).fill(0) }
    expect(guardStep(open, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual({ x: 1, y: 0 })
    expect(guardStep(open, { x: 2, y: 0 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 1 })
    const walled = { w: 3, h: 3, walls: [1, 0, 0, 0, 0, 0, 0, 0, 0] } // wall east of (0,0)
    expect(mazeCanMove(walled, 0, 0, 'E')).toBe(false)
    expect(mazeCanMove(walled, 1, 0, 'W')).toBe(false)
    expect(mazeCanMove(walled, 0, 0, 'N')).toBe(false)
    expect(guardStep(walled, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual({ x: 0, y: 1 })
    const { frames, caught } = advanceGuards(open, [{ x: 0, y: 0 }], { x: 2, y: 0 }, 2)
    expect(frames).toEqual([[{ x: 1, y: 0 }], [{ x: 2, y: 0 }]])
    expect(caught).toBe(true)
  })

  it('the escape component renders the engine maze', () => {
    const { game } = (() => {
      const g = adult(14)
      sendToPrison(g, 'Armed Robbery', 10, { quiet: true, security: 'maximum' })
      prisonAction(g, 'prison.escape').run(g)
      return { game: takeMinigame(g) }
    })()
    const html = renderToStaticMarkup(createElement(PrisonEscape, { modal: game, onDone: () => {} }))
    expect(html).toContain('Maximum security')
    expect(html).toContain('Move up')
    expect(html).toContain('🚪')
    const bad = renderToStaticMarkup(createElement(PrisonEscape, { modal: { ...game, data: { w: 'x' } }, onDone: () => {} }))
    expect(bad).toContain('Back to my cell')
  })
})
