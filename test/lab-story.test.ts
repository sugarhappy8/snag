// R&D 3.0 told start to finish through the real code (no mocks of the rules): a mid company funds an
// Operations program, is paid its credit and grant, patents a breakthrough, shields it and licenses it; a
// low company is held to its rungs and its patents; a company that never does R&D never gets a lab. Fixed
// seeds; every year goes through nextYear (the whole yearly hook), so a test that plays several of them
// passes its own timeout, as test/company-dashboard.test.ts does (the default is 15 s).
import { describe, expect, it } from 'vitest'
import { marketKey } from '../src/game/business/competition-core'
import { marketCtxFor } from '../src/game/business/economy'
import { breakthroughByName } from '../src/game/business/heavy-data'
import { heavyArrival, readHeavy } from '../src/game/business/heavy-rd'
import { opsProgram, ROYALTY_CAP_X, SHIELD } from '../src/game/business/lab-data'
import { opsBlock, opsPrice, patentBlock } from '../src/game/business/lab-rules'
import { labValue, opsEffectsOf, readLab, type LabRow } from '../src/game/business/lab-state'
import { LAB_LOG, LAB_SAY, LAB_STATEMENT } from '../src/game/business/lab-text'
import { doLicense, doOps, doPatent, labCredit } from '../src/game/business/lab-year'
import { familiesOf, fieldFor, fieldOf } from '../src/game/business/product-market'
import { money } from '../src/game/business/util'
import { statementLines } from '../src/game/business/yearly'
import { patentLaw } from '../src/game/workshop/market'
import type { GameState } from '../src/game/types'
import { labGame, launchBreakthrough, PATENT_COUNTRY, PATENT_TRADE } from './lab-kit'
import { nextYear } from './market-kit'

const SEEDS = [3, 11, 29]

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

describe('a mid company', () => {
  for (const seed of SEEDS) {
    it(`runs a program, books credit and grant, patents a breakthrough and licenses it (seed ${seed})`, () => {
      const { g, a, b } = labGame(seed, PATENT_TRADE, { country: PATENT_COUNTRY })
      const id = 'ops.cost.2'
      const def = opsProgram(id)!
      const price = opsPrice(b, def.rung)
      const cash = b.cash
      expect(doOps(g, a, id)).toBe(true)
      expect(b.cash).toBe(cash - price)
      const started = g.year
      const program = readLab(b).programs[0]
      expect([program.id, program.price]).toEqual([id, price])
      expect(program.grant).toBeGreaterThan(0) // Canada covers a mid-tech company

      // Every year the ledger and the annual report are read as they stand (the ledger keeps four rows only).
      const rows = new Map<number, LabRow>()
      const credit = new Map<number, string>()
      const year = (): void => {
        nextYear(g)
        for (const r of readLab(b).ledger) rows.set(r.year, r)
        const line = statementLines(b, b.last!).find((l) => l.label === LAB_STATEMENT.credit)
        if (line) credit.set(b.last!.year, line.value)
      }
      // Years pass until no program is left (at most 4), then one more for the grant it earned to be paid.
      for (let n = 0; n < 4 && readLab(b).programs.length > 0; n++) year()
      expect(readLab(b).programs).toEqual([])
      year()

      // The credit is booked for the year the price was spent, the grant once the work was done.
      const first = rows.get(started)!
      expect(first.credit).toBe(labCredit(b.countryId, price))
      expect(first.credit).toBeGreaterThan(0)
      expect([...rows.values()].reduce((sum, r) => sum + r.grant, 0)).toBe(program.grant)
      expect(credit.get(started)).toBe(money(first.credit))
      for (const r of rows.values()) if (r.credit + r.grant > 0) expect(credit.get(r.year), `year ${r.year}`).toBe(money(r.credit + r.grant))

      // Exactly one of two branches: a win lifts the track and starts the cooldown, a flop leaves it as it was.
      const worked = lines(g).filter((x) => x === LAB_LOG.worked(a.name, def.label)).length
      const failed = lines(g).filter((x) => x === LAB_LOG.failed(a.name, def.label)).length
      expect(worked + failed).toBe(1)
      const lab = readLab(b)
      if (worked) {
        const won = lab.done[id]
        expect(won).toBeDefined()
        expect(lab.levels.cost.v).toBeGreaterThan(0)
        expect(lab.runs.cost).toBe(1)
        expect(opsEffectsOf(b, g.year).cost).toBeLessThan(0)
        expect(opsBlock(g, b, id, true)).toBe(LAB_SAY.cooldown(def.label, String(won), String(won + 3)))
      } else {
        expect(lab.levels.cost.v).toBe(0)
        expect(lab.done[id]).toBeUndefined()
        expect(lab.runs.cost).toBe(0)
        expect(opsEffectsOf(b, g.year).cost).toBe(0)
        expect(opsBlock(g, b, id, true)).toBeNull()
      }

      // A breakthrough, patented: no rival may sell the kind until the shield ends.
      const family = launchBreakthrough(g, a, b)
      g.queue = []
      expect(patentBlock(g, b, family)).toBeNull()
      expect(doPatent(g, a, family)).toBe(true)
      const patent = readLab(b).patents[0]
      expect(patent.family).toBe(family)
      expect(labValue(b)).toBeGreaterThan(0)
      const offer = (y: number, shielded = true): number => {
        const c = marketCtxFor(g, b, y)
        const field = shielded ? fieldFor(c) : fieldOf(c.rivals, c.fringe, c.key, y, fieldFor(c).heavy, { industry: b.industry })
        return field.of(family).offer
      }
      for (let y = g.year; y < patent.until; y++) expect(offer(y), `shielded ${y}`).toBe(0)
      // The shield matters: with no patent the first rival would be selling the kind before it ends.
      const rec = readHeavy(g, b.industry, marketKey(b)).find((r) => r.family === family)!
      const rivals = marketCtxFor(g, b, patent.until).rivals.filter((x) => !x.legacy && x.pull > 0 && !x.id.startsWith('owned:'))
      const arrives = Math.min(...rivals.map((x) => heavyArrival(rec, x)))
      expect(arrives).toBeLessThan(patent.until)
      expect(offer(arrives, false)).toBeGreaterThan(0)

      // Licensed: royalties come once rivals sell it, never past 1.5 times the plan, and the patent runs out with its line.
      expect(doLicense(g, a, family)).toBe(true)
      let total = 0
      let paid = 0
      for (let n = 0; n < 12 && readLab(b).patents.length > 0; n++) {
        nextYear(g)
        const row = readLab(b).ledger.find((r) => r.year === g.year - 1)
        if (!row || !(row.royalty > 0)) continue
        total += row.royalty
        paid++
        expect(statementLines(b, b.last!).find((l) => l.label === LAB_STATEMENT.royalty)?.value, `year ${row.year}`).toBe(money(row.royalty))
      }
      expect(readLab(b).patents).toEqual([])
      expect(paid).toBeGreaterThan(0)
      expect(total).toBeGreaterThan(0)
      expect(total).toBeLessThanOrEqual(ROYALTY_CAP_X * patent.plan)
      expect(lines(g)).toContain(LAB_LOG.expired(a.name, family))
      expect(labValue(b)).toBe(0)
      expect(readLab(b).filed).toContain(family)
      // The same family can't be filed twice, even after the first patent has run out.
      expect(patentBlock(g, b, family)).toBe(LAB_SAY.alreadyFiled(family))
      const cashNow = b.cash
      expect(doPatent(g, a, family)).toBe(false)
      expect(b.cash).toBe(cashNow)
    }, 120_000)
  }
})

describe('a low company', () => {
  for (const seed of SEEDS) {
    it(`runs rung 1, cannot start rung 3 or patent a recipe, and may patent a breakthrough (seed ${seed})`, () => {
      const { g, a, b } = labGame(seed, 'restaurant', { country: 'ca' })
      // Rung 3 is not offered to a low-tech trade: one reason, nothing charged.
      const big = opsProgram('ops.cost.3')!
      const cash = b.cash
      expect(opsBlock(g, b, big.id)).toBe(LAB_SAY.rungTooBig(big.label))
      expect(doOps(g, a, big.id)).toBe(false)
      expect(b.cash).toBe(cash)
      expect(b.lab).toBeUndefined()

      // Rung 1 runs and ends as exactly one of a win or a flop.
      const id = 'ops.cost.1'
      const def = opsProgram(id)!
      expect(doOps(g, a, id)).toBe(true)
      for (let n = 0; n < 4 && readLab(b).programs.length > 0; n++) nextYear(g)
      expect(readLab(b).programs).toEqual([])
      const worked = lines(g).filter((x) => x === LAB_LOG.worked(a.name, def.label)).length
      const failed = lines(g).filter((x) => x === LAB_LOG.failed(a.name, def.label)).length
      expect(worked + failed).toBe(1)
      expect(readLab(b).levels.cost.v > 0).toBe(worked === 1)

      // A recipe of its own is refused for its tier, a breakthrough is not.
      const recipe = familiesOf(b.industry).find((f) => breakthroughByName(f) === null)!
      b.products.push({ name: recipe, launched: g.year, boost: 0, quality: 70, family: recipe, kind: 'core' })
      expect(patentBlock(g, b, recipe)).toBe(LAB_SAY.lowTier(recipe))
      const before = b.cash
      expect(doPatent(g, a, recipe)).toBe(false)
      expect(b.cash).toBe(before)
      const family = launchBreakthrough(g, a, b)
      g.queue = []
      expect(patentBlock(g, b, family)).toBeNull()
      expect(doPatent(g, a, family)).toBe(true)
      const patent = readLab(b).patents[0]
      expect(patent.family).toBe(family)
      // A low-tech shield is the shortest: SHIELD.low years times how well the country's courts enforce it, at least two.
      expect(patent.until - patent.filed).toBe(Math.max(2, Math.round(SHIELD.low * patentLaw(b.countryId, patent.filed).enforcement)))
    }, 120_000)
  }
})

describe('a company that does no R&D', () => {
  it('never gets a lab over ten years [RF1]', () => {
    for (const seed of SEEDS) {
      const { g, b } = labGame(seed, 'restaurant')
      expect(b.lab).toBeUndefined()
      for (let n = 0; n < 10; n++) {
        nextYear(g)
        expect(b.lab, `seed ${seed} year ${g.year}`).toBeUndefined()
      }
      expect(Object.hasOwn(b, 'lab')).toBe(false)
      expect(JSON.stringify(b)).not.toContain('"lab"')
      expect(readLab(b).booked).toBe(0)
    }
  }, 120_000)
})
