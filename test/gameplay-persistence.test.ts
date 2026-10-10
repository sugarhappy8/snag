import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTestGame } from './helpers'
import { saveGame, loadGame } from '../src/game/save'
import { encodeSnapshotRecord, decodeSnapshotRecord } from '../src/game/snapshot-codec'
import { arriveInPast } from '../src/game/timeMachine'
import { startDevelopment, permitDevelopment, contractDevelopment, fundDevelopment, yearlyDevelopment, developmentOf } from '../src/game/development'
import { establishGivingFund, commitGivingProgram, yearlyGivingFund, givingFund } from '../src/game/activities/giving-fund'
import { professionalRecord } from '../src/game/professions'
import { musicMaster, yearlyMusicRights } from '../src/game/special/music-rights'
import { sharedProjects, yearlySharedProjects } from '../src/game/activities/shared-projects'
import { charterOf } from '../src/game/shops/fleet-operations'
import { ensureEconomy } from '../src/game/economy'

afterEach(() => vi.unstubAllGlobals())
describe('gameplay expansion persistence', () => {
  it('loads actual saves and restores unfinished contracts through the snapshot codec and Time Machine', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) })
    const g = makeTestGame(93, { age: 35, money: 10000000 }), a = startDevelopment(g, 'commercial')!
    permitDevelopment(g, a.id); contractDevelopment(g, a.id, 'bonded'); fundDevelopment(g, a.id, 1000000)
    establishGivingFund(g, 100000); commitGivingProgram(g, 'health', 5000); g.queue = []
    expect(saveGame(g)).toBe(true); const loaded = loadGame()!
    expect(loaded).not.toBeNull(); expect(developmentOf(loaded.assets[0])).toEqual(developmentOf(a)); expect(givingFund(loaded)).toEqual(givingFund(g))
    const encoded = await encodeSnapshotRecord(JSON.stringify(loaded), 0), snapshot = JSON.parse(await decodeSnapshotRecord(encoded))
    loaded.year++; loaded.character.age++; yearlyDevelopment(loaded); yearlyGivingFund(loaded)
    const restored = arriveInPast(loaded, snapshot)
    expect(developmentOf(restored.assets[0])).toEqual(developmentOf(a)); expect(givingFund(restored)).toEqual(givingFund(g))
    const clone = structuredClone(restored)
    for (const gg of [restored, clone]) { gg.year++; yearlyDevelopment(gg); yearlyGivingFund(gg) }
    expect(restored).toEqual(clone)
  })
  it('handles missing and malformed optional records without creating money or consuming RNG', () => {
    const g = makeTestGame(5, { age: 35 }); const rng = g.rng
    g.flags.professions = { trade: { skill: Infinity, reputation: 'high', assignment: [] } }
    g.flags.sharedProjects = [null, 7, { id: 'wrong' }]; g.flags.givingFund = { v: 2, balance: 1000000000 }
    const asset = { id: 'invalid', kind: 'other' as const, name: 'Bad data', emoji: '', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 35, upkeep: 0, details: { musicMaster: { stage: 'invalid' }, development: { stage: 'unknown' }, charterOperation: { weeks: -99, price: 'x' } } }
    g.assets.push(asset)
    expect(professionalRecord(g, 'trade').skill).toBe(25); expect(sharedProjects(g)).toEqual([]); expect(givingFund(g)).toBeNull()
    expect(musicMaster(asset)).toBeNull(); expect(developmentOf(asset)).toBeNull(); expect(charterOf(asset).weeks).toBe(0)
    yearlyDevelopment(g); yearlyMusicRights(g); yearlySharedProjects(g); yearlyGivingFund(g)
    expect(g.character.money).toBe(0); expect(g.rng).toBe(rng)
  })
  it('remains bounded over a century of idle and depleted commitments', () => {
    const g = makeTestGame(93, { age: 35, money: 10000000 }), a = startDevelopment(g, 'residential')!
    permitDevelopment(g, a.id); contractDevelopment(g, a.id, 'economy') // Deliberately unfunded.
    establishGivingFund(g, 10000); commitGivingProgram(g, 'education', 2000)
    ensureEconomy(g)
    const openingSize = JSON.stringify(g).length
    for (let i = 0; i < 100; i++) { g.year++; yearlyDevelopment(g); yearlyMusicRights(g); yearlySharedProjects(g); yearlyGivingFund(g) }
    expect(developmentOf(a)?.progress).toBe(0); expect(givingFund(g)!.balance).toBeGreaterThanOrEqual(0)
    expect(givingFund(g)!.history.length).toBeLessThanOrEqual(16)
    expect(JSON.stringify(g).length - openingSize).toBeLessThan(10000)
  })
})
