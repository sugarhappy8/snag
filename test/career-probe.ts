// A synthetic one-career probe for the kit tests: a store, a rival spec, one crisis def and a yearly
// hook, all under the career id 'probe'. No vitest import, so the kit unit tests and the playthrough
// tests can share it. Importing this file registers the script `career.probe.rush` once per module graph.
import { addHidden } from '../src/game/core'
import { hire, money } from '../src/game/special/common'
import { defineCrises, type CrisisDef } from '../src/game/special/kit/crisis'
import type { RivalSpec } from '../src/game/special/kit/rivals'
import { defineCareerState, int, type CareerBase } from '../src/game/special/kit/state'
import { settleYear, type CareerCtx } from '../src/game/special/kit/year'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

export type ProbeState = CareerBase & { stock: number }
export type ProbeData = { fee: number }

export const probeStore = defineCareerState({
  key: 'probe.sim',
  version: 1,
  migrate: [(r) => ({ ...r })],
  extra: (r) => ({ stock: int(r.stock, 0, 0, 1e6) }),
})

export const probeSpec: RivalSpec = { career: 'probe', edges: ['a', 'b'], field: () => 12 }

export const probePeers = { spec: probeSpec, score: (_g: GameState, s: ProbeState): number => s.standing }

/** One crisis: safe is a fixed outcome, bold rolls at 0.6, cash rolls at 0.3. */
export const probeDef: CrisisDef<ProbeState, ProbeData> = {
  id: 'rush',
  title: 'Rush job',
  emoji: '\u{1F4BC}',
  weight: () => 1,
  make: (_g, _s, r) => ({ fee: r.int(2, 9) * 1000 }),
  scene: (_g, _s, d) => `A client needs it by Friday and offers ${money(d.fee)}. What will you do?`,
  options: {
    safe: {
      label: 'Say no',
      emoji: '\u{1F645}',
      good: () => ({
        text: () => 'You passed. The client moved on.',
        fx: { standing: 2 }, // worth 2, above the best a rolled option is worth at any fee the crisis makes
        then: (s, g) => {
          s.stock += 5
          addHidden(g, 'karma', -3)
        },
      }),
    },
    bold: {
      label: 'Take the rush',
      emoji: '\u{1F525}',
      odds: () => 0.6,
      good: (_g, _s, d) => ({ text: (r) => `You delivered and earned ${money(r.earned)}.`, fx: { money: d.fee, standing: 3 } }),
      bad: (_g, _s, d) => ({ text: (r) => `You missed Friday and paid ${money(r.paid)}.`, fx: { money: -Math.round(d.fee / 2), standing: -3 } }),
    },
    cash: {
      label: 'Ask for double',
      emoji: '\u{1F4B0}',
      odds: () => 0.3,
      good: (_g, _s, d) => ({ text: (r) => `You got double and earned ${money(r.earned)}.`, fx: { money: d.fee * 2 } }),
      bad: (_g, _s, d) => ({ text: (r) => `You lost the client and paid ${money(r.paid)}.`, fx: { money: -d.fee, standing: -2, grudge: { id: 'probe.rival', name: 'Mia Okafor', by: 10 } } }),
    },
  },
}

export const probeCrises = defineCrises({ career: 'probe', store: probeStore, talent: 'Acting', defs: [probeDef] })

export const probeActive = (g: GameState): boolean => g.character.job?.defId === 'probe'

/** The default yearly body: a stock tick, 10,000 of fees while the job is held. */
export function probeRun(c: CareerCtx<ProbeState>, live: boolean): string {
  c.s.stock += 1
  if (live) c.earn('Fees', 10_000)
  return live ? 'Booked a quiet year.' : 'Lived on the old fees.'
}

export const probeYear = settleYear({
  career: 'probe',
  store: probeStore,
  incomeLabel: 'Fees',
  active: probeActive,
  run: probeRun,
  peers: probePeers,
  crises: probeCrises,
})

/** Age 30, 100,000 in cash, the probe job held, no record yet. */
export function newProbeGame(seed: number): GameState {
  const g = makeTestGame(seed, { age: 30, money: 100_000 })
  hire(g, { defId: 'probe', title: 'Prober', company: 'Probe Co', salary: 50_000 })
  return g
}
