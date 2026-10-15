// Which lab programs the autopilot (the general manager, and the Business talent's hint) ranks
// first: the ones that move a company up its commercial ladder, or that the next rung needs. The
// bonus is a flag on the program in deeptech-data.ts, so a program id that two trades share (the
// drones' detect-and-avoid used to share 'detect' with the security trade's engine) can't borrow
// another trade's bonus, and the newer trades' own stage-unlocking programs get it.
import { describe, expect, it } from 'vitest'
import { DEEP_TECH, PROGRAMS, maxStage, type ProgramDef } from '../src/game/business/deeptech-data'
import { techOf } from '../src/game/business/deeptech-core'
import { bestProgram } from '../src/game/business/deeptech-rd'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { DEEP_TECH_IDS, type Industry } from '../src/game/data/markets'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adultIn } from './deeptech-kit'

const NEWER = ['fusion', 'neurotech', 'drones', 'carbonCapture'] as const

const flagged = (def: ProgramDef, t: TechState): boolean => (typeof def.unlocks === 'function' ? def.unlocks(t) : def.unlocks === true)

/** True when winning this program moves a lab, in some state it could be started from, up a rung. */
function advances(ind: keyof typeof PROGRAMS, def: ProgramDef): boolean {
  const top = maxStage(ind)
  for (let stage = 0; stage < top; stage++) {
    for (const plant of [0, 2]) {
      const t = Object.assign(readTech(undefined), { stage, plant, level: 100, done: PROGRAMS[ind].filter((p) => p.id !== def.id).map((p) => p.id) })
      const before = t.stage
      def.win({ t, countryId: 'us', year: 2030, roll: () => 0.5, company: 'Acme' })
      if (t.stage > before) return true
    }
  }
  return false
}

describe('lab programs the autopilot ranks first', () => {
  it('flags every program of the newer trades that moves the lab up a rung', () => {
    for (const ind of NEWER) {
      const missing = PROGRAMS[ind].filter((p) => p.id !== 'nextgen' && advances(ind, p) && !flagged(p, readTech(undefined))).map((p) => p.id)
      expect(missing, ind).toEqual([])
    }
  })

  it('flags what a rung needs first, and no stage-less filler', () => {
    const ids = (ind: (typeof NEWER)[number]) => PROGRAMS[ind].filter((p) => flagged(p, readTech(undefined))).map((p) => p.id)
    expect(ids('fusion')).toEqual(['magnets', 'shot', 'netGain', 'blanket', 'pilot', 'powerPlant'])
    expect(ids('neurotech')).toEqual(['electrodes', 'decoder', 'firstHuman', 'approval', 'mainstream'])
    expect(ids('drones')).toEqual(['autopilot', 'bvlos', 'delivery', 'evtol', 'typeCert'])
    expect(ids('carbonCapture')).toEqual(['sorbent', 'demo', 'offtake', 'capturePlant'])
  })

  it('keeps no program id that another trade’s program also uses with a different job', () => {
    for (const ind of DEEP_TECH_IDS) {
      const own = PROGRAMS[ind].map((p) => p.id)
      expect(new Set(own).size, `${ind} has a program id twice`).toBe(own.length)
    }
    expect(PROGRAMS.drones.map((p) => p.id)).not.toContain('detect')
    expect(PROGRAMS.drones.map((p) => p.id)).toContain('avoid')
    expect(PROGRAMS.drones.find((p) => p.id === 'avoid')!.label(readTech(undefined))).toBe('Detect-and-Avoid System')
    const avoid = PROGRAMS.drones.find((p) => p.id === 'avoid')!
    expect(avoid.unlocks).toBeUndefined()
    // Its gate still stops a second one, under the new id.
    expect(avoid.gate(Object.assign(readTech(undefined), { done: ['avoid'] }), 'us')).toBe('Already done.')
  })

  it('leaves the eight older trades with exactly the programs that were ranked first before', () => {
    const was: Record<string, string[]> = {
      semiconductor: ['firstChip', 'volume'],
      aiLab: ['train', 'api', 'enterprise'],
      robotics: ['proto', 'pilots', 'line'],
      biotech: ['discovery', 'platform'],
      spaceTech: ['engine', 'rocket'],
      electricVehicles: ['prototype', 'lowvol', 'ramp'],
      quantum: ['qubits', 'cloud'],
      cybersecurity: ['detect', 'platform', 'clearance'],
    }
    for (const [ind, ids] of Object.entries(was)) {
      const fresh = readTech(undefined)
      const got = PROGRAMS[ind as keyof typeof PROGRAMS].filter((p) => p.unlocks !== undefined && p.unlocks !== false).map((p) => p.id)
      expect(got, ind).toEqual(ids)
      // Two of them only count while the lab is small: the first models, the first twenty qubits.
      if (ind === 'aiLab') {
        const train = PROGRAMS.aiLab.find((p) => p.id === 'train')!
        expect(flagged(train, Object.assign({ ...fresh }, { models: [] }))).toBe(true)
        expect(flagged(train, Object.assign({ ...fresh }, { models: [1, 2, 3].map((gen) => ({ gen, name: `m${gen}`, score: 50, open: false, year: 2020 })) }))).toBe(false)
      }
      if (ind === 'quantum') {
        const qubits = PROGRAMS.quantum.find((p) => p.id === 'qubits')!
        expect(flagged(qubits, Object.assign({ ...fresh }, { qubits: 5 }))).toBe(true)
        expect(flagged(qubits, Object.assign({ ...fresh }, { qubits: 20 }))).toBe(false)
      }
    }
  })
})

describe('the autopilot on the newer trades', () => {
  function funded(ind: (typeof NEWER)[number]) {
    const g = adultIn('us', 5_000_000_000, 4, 95, PRESENT_YEAR)
    const b = newBiz(g, ind as Industry, 'us', getCountry('us').cities[0], { cash: 5_000_000_000 })
    const t = Object.assign(readTech(undefined), { level: 60, venture: 5_000_000_000, raised: 100_000_000 })
    b.tech = JSON.parse(JSON.stringify(t)) as Json
    const a = createBusinessAsset(g, `Test ${ind}`, b, 0)
    g.assets.push(a)
    return { g, a, b: bizOf(g, a) }
  }

  it('climbs every ladder to the top when it has the money, taking each rung’s program in turn', () => {
    for (const ind of NEWER) {
      const { g, a, b } = funded(ind)
      const t = techOf(b)
      const picks: string[] = []
      const rungs: string[] = []
      for (let i = 0; i < 60 && t.stage < maxStage(ind); i++) {
        const def = bestProgram(g, a, b, t)
        if (!def) break
        picks.push(def.id)
        const before = t.stage
        t.done.push(def.id)
        def.win({ t, countryId: 'us', year: g.year, roll: () => 0.5, company: a.name })
        if (t.stage > before) rungs.push(def.id)
      }
      expect(t.stage, `${ind}: ${picks.join(', ')}`).toBe(maxStage(ind))
      // Every rung was climbed by a program the data flags.
      for (const id of rungs) expect(flagged(PROGRAMS[ind].find((p) => p.id === id)!, t), `${ind} ${id}`).toBe(true)
      expect(rungs.length, ind).toBe(DEEP_TECH[ind].stages.length - 1)
    }
  })

  it('starts the first rung’s program first in each newer trade', () => {
    const first: Record<(typeof NEWER)[number], string[]> = { fusion: ['magnets'], neurotech: ['electrodes', 'decoder'], drones: ['autopilot'], carbonCapture: ['sorbent', 'mrv'] }
    for (const ind of NEWER) {
      const { g, a, b } = funded(ind)
      expect(first[ind], ind).toContain(bestProgram(g, a, b, techOf(b))!.id)
    }
  })
})
