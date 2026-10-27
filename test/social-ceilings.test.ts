// ci: fast
// R4-E15 (D.12, Global: every growth term has a ceiling with a probe at 100 times): the seven rows of the social track in
// test/ceiling-list.json and test/ceiling-kit.ts, held to account.
//
//   edge-caps      the edge map: 1,200 edges, 40 debts, 12 feuds, 120 edges with talk, 40 secrets of 6 holders, 8 memories an edge, 24,000 nodes
//   memory-total   a memory moves a number by 25 at most; 8 memories an edge, 4,000 in all
//   loan-cap       a loan is 2 typical incomes at most, a quarter of a small purse; 3 open loans; 40 years of default stay under 3 x the principal
//   favor-callin   one call-in a person in 3 years; 2 points of regard a favor; the player owes no one more than 100
//   gossip-hops    2 hops, 4 people told; 30 points a person a year to leaks
//   feud-live      12 live feuds; a suit at 3 typical incomes and a quarter of the cash at most; sabotage 3 happiness a year in all
//   mentor-gain    3 proteges; 15 percent more than the year would have given
//
// test/ceiling-probe.test.ts runs every row at 1 and 100 times (and at 10 and 1,000 in the nightly). What this file adds: the rows are in
// the list in their place and name the right file and identifier; the cap sentence says the numbers the constants hold (a constant that moves
// without its sentence and its probe fails here); the rows hold at other scales; and each row presses on its cap. A probe that never reached
// the cap would pass for no reason, so at 100 times the tightest case of every row is exactly at its limit: the cap held, and it was the cap
// that held. The measuring code can see an excess: edgeCounts counts what is over.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTEREST_CEILING } from '../src/game/society/debt'
import { FAVOR_BOND, FAVOR_COOLDOWN } from '../src/game/society/favor'
import { FEUD } from '../src/game/society/feud'
import { HOP_CAP, MAX_TOLD } from '../src/game/society/gossip'
import { LOAN_CAP_SHARE, LOAN_INCOME_CAP, LOAN_OPEN_MAX } from '../src/game/society/loan'
import { MENTOR } from '../src/game/society/mentor'
import { LEAK } from '../src/game/society/secret'
import { EDGE_CAPS } from '../src/game/world/caps'
import { MEMORY_FX } from '../src/game/world/edge-memory'
import { CEILING_PROBES, edgeCounts, probeFailures, type CeilingProbe } from './ceiling-kit'
import { ROOT } from './scan-kit'

interface Entry {
  id: string
  file: string
  token: string
  cap: string
}

const IDS = ['edge-caps', 'memory-total', 'loan-cap', 'favor-callin', 'gossip-hops', 'feud-live', 'mentor-gain'] as const
const list = (): Entry[] => JSON.parse(readFileSync(join(ROOT, 'test', 'ceiling-list.json'), 'utf8')) as Entry[]
const entry = (id: string): Entry => list().find((e) => e.id === id)!
const row = (id: string): CeilingProbe => CEILING_PROBES.find((p) => p.id === id)!
const n = (x: number): string => x.toLocaleString('en-US')

describe('the seven rows of the social track are in the ceiling list', () => {
  it('sit together in the order of the plan, after the registry rows and before the people rows', () => {
    const ids = list().map((e) => e.id)
    const at = ids.indexOf('edge-caps')
    expect(at).toBeGreaterThan(ids.indexOf('persona-nudge'))
    expect(ids.slice(at, at + IDS.length)).toEqual([...IDS])
    expect(ids.indexOf('people-reads')).toBeGreaterThan(at + IDS.length - 1)
  })

  it('name the file and the identifier that carry each cap', () => {
    const expected: Record<(typeof IDS)[number], [string, string]> = {
      'edge-caps': ['src/game/world/caps.ts', 'EDGE_CAPS'],
      'memory-total': ['src/game/world/edge-memory.ts', 'MEMORY_FX'],
      'loan-cap': ['src/game/society/loan.ts', 'LOAN_INCOME_CAP'],
      'favor-callin': ['src/game/society/favor.ts', 'FAVOR_COOLDOWN'],
      'gossip-hops': ['src/game/society/gossip.ts', 'HOP_CAP'],
      'feud-live': ['src/game/society/feud.ts', 'FEUD'],
      'mentor-gain': ['src/game/society/mentor.ts', 'MENTOR'],
    }
    for (const id of IDS) expect([entry(id).file, entry(id).token], id).toEqual(expected[id])
  })

  it('have a probe row each, with the same sentence as the list', () => {
    for (const id of IDS) {
      expect(row(id), id).toBeDefined()
      expect(row(id).cap, id).toBe(entry(id).cap)
      expect(row(id).exempt, `${id} is not exempt`).toBeUndefined()
    }
  })

  it('say the numbers the constants hold', () => {
    const cap = (id: string): string => entry(id).cap
    const sayAll = (id: string, parts: readonly string[]): void => {
      for (const part of parts) expect(cap(id), `${id}: "${part}"`).toContain(part)
    }
    sayAll('edge-caps', [`${n(EDGE_CAPS.edges)} edges`, `${EDGE_CAPS.debts} debts`, `${EDGE_CAPS.feuds} feuds`, `${EDGE_CAPS.talkEdges} edges with talk`, `${EDGE_CAPS.secrets} secrets of ${EDGE_CAPS.holders} holders`, `${EDGE_CAPS.memPerEdge} memories an edge`, '24,000 nodes'])
    const biggest = Math.max(...Object.values(MEMORY_FX).flatMap((fx) => [fx.t, fx.r, fx.s, fx.o].map(Math.abs)))
    expect(biggest).toBeLessThanOrEqual(25)
    sayAll('memory-total', [`${biggest} points`, `${EDGE_CAPS.memPerEdge} memories`, n(EDGE_CAPS.memTotal)])
    sayAll('loan-cap', [`${LOAN_INCOME_CAP} typical incomes`, LOAN_CAP_SHARE === 0.25 ? 'a quarter' : '?', `${LOAN_OPEN_MAX} loans`, `${INTEREST_CEILING} times the principal`])
    sayAll('favor-callin', [`once in ${FAVOR_COOLDOWN} years`, `${FAVOR_BOND} points`])
    sayAll('gossip-hops', [`${HOP_CAP} hops`, `${MAX_TOLD} people`, `${LEAK.damageYear} points`])
    expect(Math.max(FEUD.feeFirst, FEUD.feeLong)).toBeLessThanOrEqual(3)
    sayAll('feud-live', [`${EDGE_CAPS.feuds} feuds`, '3 typical incomes', FEUD.feeCash === 0.25 ? 'a quarter' : '?', `${FEUD.sabotageHappiness} happiness and ${FEUD.sabotageJob} job performance`])
    sayAll('mentor-gain', [`${MENTOR.proteges} people`, `${Math.round(MENTOR.bonus * 100)} percent`])
  })

  it('keep the list in plain voice: no long dash in any sentence of the seven', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    for (const id of IDS) expect(entry(id).cap, id).not.toMatch(dashes)
  })
})

describe('the seven rows hold, and press on their caps', () => {
  it.each(IDS.map((id) => [id] as const))('%s holds at 10 and 30 times the input', (id) => {
    expect(probeFailures(row(id), [10, 30])).toEqual([])
  }, 120_000)

  it.each(['loan-cap', 'favor-callin', 'mentor-gain'] as const)('%s holds at 300 times the input', (id) => {
    expect(probeFailures(row(id), [300])).toEqual([])
  }, 120_000)

  it.each(IDS.map((id) => [id] as const))('%s: at 100 times its tightest case is exactly at the limit, so the cap held and it was the cap that held', (id) => {
    const r = row(id).run(100)
    expect(r.value, `${id}: ${r.at ?? ''}`).toBeLessThanOrEqual(r.limit)
    expect(r.value, `${id}: ${r.at ?? ''}`).toBeGreaterThanOrEqual(r.limit * 0.999)
  }, 120_000)

  it('does not fail a row for the 1x life: what a life reaches is under every cap, and positive', () => {
    for (const id of IDS) {
      const r = row(id).run(1)
      expect(r.value, id).toBeGreaterThan(0)
      expect(r.value, id).toBeLessThanOrEqual(r.limit)
    }
  }, 120_000)
})

describe('the measuring code can see an excess', () => {
  const edge = { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2020, l: 2030 }

  it('counts edges, debts, feuds, talk, secrets, memories and nodes of a map that is over every cap', () => {
    const map: Record<string, unknown> = {}
    for (let i = 0; i < EDGE_CAPS.edges + 5; i++) {
      map[`person:e${String(i).padStart(4, '0')}>person:me1`] = { ...edge, m: i < 600 ? Array.from({ length: 9 }, () => 'loan_given.2020.1.e') : undefined, dv: i < 41 ? [1, 0, 2020, 0, 0] : undefined, q: i < 13 ? [1, 2020, 0] : undefined, n: i < 121 ? ['a'] : undefined }
    }
    for (let i = 0; i < EDGE_CAPS.secrets + 1; i++) map[`secret:${i + 1}`] = { a: 'person:me1', k: 'affair', v: 1, h: Array.from({ length: EDGE_CAPS.holders + 1 }, (_, j) => `person:h${j}`), y: 2020 }
    const c = edgeCounts(map)
    expect(c.edges).toBe(EDGE_CAPS.edges + 5)
    expect(c.debts).toBe(EDGE_CAPS.debts + 1)
    expect(c.feuds).toBe(EDGE_CAPS.feuds + 1)
    expect(c.talk).toBe(EDGE_CAPS.talkEdges + 1)
    expect(c.secrets).toBe(EDGE_CAPS.secrets + 1)
    expect(c.holders).toBe(EDGE_CAPS.holders + 1)
    expect(c.memories).toBe(600 * 9)
    expect(c.most).toBe(9)
    expect(c.nodes).toBeGreaterThan(20_000)
  })

  it('counts an empty map, a world with no map and a map that is not one as nothing', () => {
    for (const bad of [undefined, null, 7, 'x', []]) expect(edgeCounts(bad).edges, String(bad)).toBe(0)
    expect(edgeCounts({}).edges).toBe(0)
  })

  it('fails a row whose value passes its limit at one scale, naming it', () => {
    const over: CeilingProbe = { ...row('edge-caps'), run: (scale) => ({ value: EDGE_CAPS.edges + scale, limit: EDGE_CAPS.edges, at: 'a cap that did not hold' }) }
    const out = probeFailures(over, [1, 100])
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('edge-caps')
    expect(out[0]).toContain('a cap that did not hold')
  })
})
