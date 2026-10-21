// Music 2.0, Task 1: the legacy behaviour is pinned by golden literals captured at HEAD before the pure
// move of the profile and job code out of music.ts, so every later task can prove a grandfathered life
// keeps its numbers. The structure tests read the source tree and the new data tables.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { hasScript, runScript } from '../src/game/scripts'
import { hire } from '../src/game/special/common'
import { yearlyMusic } from '../src/game/special/music'
import { MUSIC_DEFS } from '../src/game/special/music-events'
import { musicSim } from '../src/game/special/music-sim'
import { musicStore } from '../src/game/special/music-state'
import type { GameState, Json, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

const SPECIAL_DIR = fileURLToPath(new URL('../src/game/special/', import.meta.url))
const SEEDS = [3, 4, 5]
const HIT_SEEDS = [3, 4, 5, 6, 7, 8]
const IDS = ['contract', 'label', 'soloInstrument', 'bandJoin', 'bandInstrument', 'title', 'subgenre', 'type', 'concert', 'kick', 'bandName', 'renew']

interface ReleaseGolden { quality: number; sold: number; earned: number; royalty: number; delta: number }
interface YearsGolden { money: number; contractYears: Json; popularity: Json; profile: string | null; queue: string[] }
interface ContractGolden { data: Record<string, Json>; salary: number; fame: number; happiness: number; title?: string; company?: string; people?: number }
interface Golden { release: Record<number, ReleaseGolden>; years: Record<number, YearsGolden>; hit: Record<number, YearsGolden>; contract: ContractGolden; goSolo: ContractGolden }

const SOLO_DATA = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: 'Garage Door Records', contractYears: 3, advancePerYear: 10_000, popularity: 30, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }

function legacyLife(seed: number, o: { popularity?: number; skill?: number } = {}): GameState {
  const g = makeTestGame(seed, { age: 25 })
  g.flags.instruments = { Guitar: o.skill ?? 55 }
  g.character.money = 100_000
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...SOLO_DATA, popularity: o.popularity ?? SOLO_DATA.popularity } })
  return g
}

function firstRelease(seed: number): ReleaseGolden {
  const g = legacyLife(seed)
  const before = g.character.money
  runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
  const r = (g.flags['special.music'] as { discography: { quality: number; sold: number; earned: number; royalty: number }[] }).discography[0]
  return { quality: r.quality, sold: r.sold, earned: r.earned, royalty: r.royalty, delta: g.character.money - before }
}

/**
 * Five years of the legacy hook, called directly with no sim record. The plain life (popularity 30, no
 * release) loses its label at the end of its term; the hit life (popularity 80, one release up front)
 * keeps a discography, its royalty tail, the award rolls and the renewal offer.
 */
function fiveYears(seed: number, hit = false): YearsGolden {
  const g = legacyLife(seed, hit ? { popularity: 80, skill: 100 } : {})
  if (hit) {
    runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
    // A release now draws one more number, the chart noise, after the legacy draws (plan S8). Step the generator
    // back that one draw so the five years below still pin the legacy yearly hook from the position it had at HEAD.
    g.rng = (g.rng - 0x6d2b79f5) | 0
    // The golden is an old labelled save, which has no record: the release above made one (and the sim now owns
    // the awards of a life it has adopted), so drop it and let the sim meet the life the way it meets an old save,
    // by adopting it on its first tick. The six music events roll g.rng after the sim's year and some of them move
    // popularity, so a pin of the legacy hook's own numbers holds them on cool-down (test/music-events.test.ts
    // plays every one of them).
    delete g.flags['special.music.sim']
    const record = musicStore.mut(g)
    for (const def of MUSIC_DEFS) record.cool[`crisis.${def.id}`] = 9999
  }
  for (let i = 0; i < 5; i++) {
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    yearlyMusic(g)
    // The real yearly order is the legacy hook, then the sim (special.ts): the sim adopts the life on its first
    // tick and owns the deal year from the second. The money, the term, the popularity, the profile and the award
    // draws below are the HEAD numbers; only the renewal screen changed its sentence.
    if (hit) musicSim.yearly(g)
  }
  const d = g.character.job?.data
  const profile = g.flags['special.music']
  const queue = g.queue.map((m) => {
    if (m.kind === 'choice' && m.scriptId === 'career.music.deal') {
      // The renewal is now the negotiation screen. Its terms (years and advance, from the same two draws in
      // the same order) are pinned by rebuilding the HEAD sentence from the screen's data.
      const o = m.data as unknown as { label: string; years: number; advance: number }
      return `Your contract with ${o.label} is up. They're offering a new ${o.years}-year deal worth $${o.advance.toLocaleString('en-US')}.`
    }
    return (m as { text?: string }).text ?? ''
  })
  return { money: g.character.money, contractYears: d ? d.contractYears : null, popularity: d ? d.popularity : null, profile: profile === undefined ? null : JSON.stringify(profile), queue }
}

const OFFER = { instrument: 'Guitar', label: 'Echo Chamber Records', tier: 1, genre: 'Rock', advance: 90_000, years: 3 }

function acceptContract(): ContractGolden {
  const g = makeTestGame(9, { age: 25 })
  runScript(g, 'special.music.contract', 'accept', OFFER as unknown as Json, g.queue[0])
  const job = g.character.job!
  return { data: job.data, salary: job.salary, fame: g.character.hidden.fame, happiness: g.character.stats.happiness }
}

/** Going solo from a band: the band path of the accept body (removeBand, the job fields, setRole). */
function goSolo(): ContractGolden {
  const g = makeTestGame(9, { age: 25 })
  g.people.push({ id: 'mate-1', relation: 'coworker' } as unknown as Person, { id: 'mate-2', relation: 'friend' } as unknown as Person)
  hire(g, { defId: 'musician', title: 'Guitarist', company: 'The Neon Wolves', salary: 4_000, data: { ...SOLO_DATA, mode: 'band', label: null, contractYears: 0, advancePerYear: 0, bandName: 'The Neon Wolves', bandmates: ['mate-1', 'mate-2'], members: 3 } })
  runScript(g, 'special.music.contract', 'accept', OFFER as unknown as Json, g.queue[0])
  const job = g.character.job!
  return { data: job.data, salary: job.salary, fame: g.character.hidden.fame, happiness: g.character.stats.happiness, title: job.title, company: job.company, people: g.people.length }
}

// Captured at HEAD (eefda33 plus the plan), before any source change: `MUSIC_CAPTURE=1 npx vitest run --maxWorkers=1
// test/music-legacy.test.ts -t "prints the golden"`. The award line keeps its em-dash as a \u2014 escape.
// R2 rebaseline: the `hit` block was captured again (money, sales and the profile numbers did not move; the popularity, the
// renewal terms, the award rolls and the review and award sentences did). Text draws left g.rng, so the review adjective, the
// award line and every legacy roll after them read a different g.rng position. With pickLine drawing g.rng again the old
// golden came back to the byte, so the move is the rebaseline and nothing else. The other blocks did not move.
const GOLDEN: Golden = {
  "release": {
    "3": {
      "quality": 57,
      "sold": 44055,
      "earned": 44055,
      "royalty": 6608,
      "delta": 44055
    },
    "4": {
      "quality": 65,
      "sold": 124989,
      "earned": 124989,
      "royalty": 18748,
      "delta": 124989
    },
    "5": {
      "quality": 56,
      "sold": 189767,
      "earned": 189767,
      "royalty": 28465,
      "delta": 189767
    }
  },
  "years": {
    "3": {
      "money": 130000,
      "contractYears": null,
      "popularity": null,
      "profile": null,
      "queue": [
        "Garage Door Records decided not to renew your contract. You're a free agent. Audition for another label if you want back in."
      ]
    },
    "4": {
      "money": 130000,
      "contractYears": null,
      "popularity": null,
      "profile": null,
      "queue": [
        "Garage Door Records decided not to renew your contract. You're a free agent. Audition for another label if you want back in."
      ]
    },
    "5": {
      "money": 130000,
      "contractYears": null,
      "popularity": null,
      "profile": null,
      "queue": [
        "Garage Door Records decided not to renew your contract. You're a free agent. Audition for another label if you want back in."
      ]
    }
  },
  "hit": {
    "3": {
      "money": 1124006,
      "contractYears": 0,
      "popularity": 73,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":770173,\"earned\":770173,\"cert\":\"Gold\",\"quality\":79,\"royalty\":3611}],\"burnedLabels\":[],\"awards\":[],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 770,173 copies and was certified Gold! Fans seem to love it. You earned $770,173. Your popularity is now 92%. It peaked at #10.",
        "\"Night Bus\" was nominated for the Golden Record Award for Album of the Year, but lost to your biggest rival.",
        "Your contract with Garage Door Records is up. They're offering a new 2-year deal worth $709,000."
      ]
    },
    "4": {
      "money": 2732958,
      "contractYears": 0,
      "popularity": 75,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":2016818,\"earned\":2016818,\"cert\":\"Double Platinum\",\"quality\":87,\"royalty\":9454}],\"burnedLabels\":[],\"awards\":[\"Golden Record Award for Album of the Year \u2014 \\\"Night Bus\\\" (age 26)\"],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 2,016,818 copies and was certified Double Platinum! Music blogs crowned it album of the year. You earned $2,016,818. Your popularity is now 93%. It peaked at #12.",
        "\"Night Bus\" won the Golden Record Award for Album of the Year! You thanked nobody in particular and nearly tripped on the way off stage.",
        "Your contract with Garage Door Records is up. They're offering a new 4-year deal worth $1,500,000."
      ]
    },
    "5": {
      "money": 4458089,
      "contractYears": 0,
      "popularity": 71,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":3353483,\"earned\":3353483,\"cert\":\"Double Platinum\",\"quality\":78,\"royalty\":15720}],\"burnedLabels\":[],\"awards\":[],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 3,353,483 copies and was certified Double Platinum! Fans seem to love it. You earned $3,353,483. Your popularity is now 92%. It peaked at #17.",
        "Your contract with Garage Door Records is up. They're offering a new 4-year deal worth $1,500,000."
      ]
    },
    "6": {
      "money": 869563,
      "contractYears": 0,
      "popularity": 74,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":573025,\"earned\":573025,\"cert\":\"Gold\",\"quality\":71,\"royalty\":2687}],\"burnedLabels\":[],\"awards\":[],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 573,025 copies and was certified Gold! Fans seem to love it. You earned $573,025. Your popularity is now 90%. It peaked at #10.",
        "\"Night Bus\" was nominated for the Golden Record Award for Album of the Year, but lost to your biggest rival.",
        "Your contract with Garage Door Records is up. They're offering a new 4-year deal worth $1,500,000."
      ]
    },
    "7": {
      "money": 817130,
      "contractYears": 0,
      "popularity": 66,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":532400,\"earned\":532400,\"cert\":\"Gold\",\"quality\":50,\"royalty\":2496}],\"burnedLabels\":[],\"awards\":[],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 532,400 copies and was certified Gold! It got lost in the shuffle. You earned $532,400. Your popularity is now 86%. It peaked at #15.",
        "Your contract with Garage Door Records is up. They're offering a new 3-year deal worth $1,019,000."
      ]
    },
    "8": {
      "money": 2725430,
      "contractYears": 0,
      "popularity": 65,
      "profile": "{\"stageName\":null,\"discography\":[{\"title\":\"Night Bus\",\"type\":\"Studio Album\",\"genre\":\"Pop\",\"subgenre\":\"Dance\",\"age\":25,\"sold\":2010987,\"earned\":2010987,\"cert\":\"Double Platinum\",\"quality\":56,\"royalty\":9427}],\"burnedLabels\":[],\"awards\":[],\"tours\":0,\"concerts\":0,\"owner\":\"v2:1:player\"}",
      "queue": [
        "Your dance studio album \"Night Bus\" sold 2,010,987 copies and was certified Double Platinum! It got lost in the shuffle. You earned $2,010,987. Your popularity is now 87%.",
        "Your contract with Garage Door Records is up. They're offering a new 3-year deal worth $1,206,000."
      ]
    }
  },
  "contract": {
    "data": {
      "mode": "solo",
      "instrument": "Guitar",
      "genre": "Rock",
      "label": "Echo Chamber Records",
      "contractYears": 3,
      "advancePerYear": 30000,
      "popularity": 15,
      "bandName": null,
      "bandmates": [],
      "members": 1,
      "recordedAge": -1,
      "lastRelease": -1,
      "startAge": 25,
      "roleStartAge": 25,
      "appointmentId": "2026:25:0"
    },
    "salary": 30000,
    "fame": 8,
    "happiness": 95
  },
  "goSolo": {
    "data": {
      "mode": "solo",
      "instrument": "Guitar",
      "genre": "Rock",
      "label": "Echo Chamber Records",
      "contractYears": 3,
      "advancePerYear": 30000,
      "popularity": 30,
      "bandName": null,
      "bandmates": [],
      "members": 1,
      "recordedAge": -1,
      "lastRelease": -1,
      "startAge": 25,
      "roleStartAge": 25,
      "appointmentId": "2026:25:0"
    },
    "salary": 30000,
    "fame": 0,
    "happiness": 80,
    "title": "Solo Artist",
    "company": "Echo Chamber Records",
    "people": 1
  }
}

describe('music legacy pin', () => {
  it('prints the golden literals', () => {
    if (!process.env.MUSIC_CAPTURE) return
    const release = Object.fromEntries(SEEDS.map((s) => [s, firstRelease(s)]))
    const years = Object.fromEntries(SEEDS.map((s) => [s, fiveYears(s)]))
    const hit = Object.fromEntries(HIT_SEEDS.map((s) => [s, fiveYears(s, true)]))
    // stderr, not console.log: this repo's vitest run swallows console output. The escape keeps the
    // em-dash in a stored award line out of the test source.
    process.stderr.write('GOLDEN ' + JSON.stringify({ release, years, hit, contract: acceptContract(), goSolo: goSolo() }).replace(/\u2014|\u2013/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + '\n')
  })

  it('pins the legacy first release over three seeds [RF2]', () => {
    for (const s of SEEDS) expect(firstRelease(s)).toEqual(GOLDEN.release[s])
  })

  it('pins five legacy years through yearlyMusic with no record [RF2]', () => {
    for (const s of SEEDS) expect(fiveYears(s)).toEqual(GOLDEN.years[s])
  })

  it('pins five legacy years of a hit with a release, royalties, awards and a renewal [RF2]', () => {
    // Music 2.0 caps every advance at $1,500,000 a deal, the renewal included (a legacy renewal could reach $2.2M).
    // Each golden renewal sentence is compared with its advance cut to that cap (the R2 capture is already cut, so it holds).
    const capped = (line: string): string => line.replace(/worth \$([\d,]+)\./, (_, n: string) => `worth $${Math.min(1_500_000, Number(n.replace(/,/g, ''))).toLocaleString('en-US')}.`)
    for (const s of HIT_SEEDS) expect(fiveYears(s, true)).toEqual({ ...GOLDEN.hit[s], queue: GOLDEN.hit[s].queue.map(capped) })
  })

  it('keeps the contract accept path byte for byte', () => {
    expect(acceptContract()).toEqual(GOLDEN.contract)
  })

  it('keeps the band to solo path byte for byte', () => {
    expect(goSolo()).toEqual(GOLDEN.goSolo)
  })

  it('registers all 12 legacy script ids', () => {
    for (const id of IDS) expect(hasScript(`special.music.${id}`)).toBe(true)
  })

  it('has no music-*.ts that imports ./music, and the two moved modules exist', () => {
    const files = readdirSync(SPECIAL_DIR).filter((f) => /^music-[\w-]+\.ts$/.test(f))
    expect(files).toContain('music-job.ts')
    expect(files).toContain('music-data.ts')
    for (const f of files) expect(readFileSync(join(SPECIAL_DIR, f), 'utf8'), f).not.toMatch(/from '\.\/music'/)
  })

  it('filters genres and subgenres by year and leaves modern lives whole [RF7]', async () => {
    const { GENRES, GENRE_NAMES, genresAt, subgenresAt } = await import('../src/game/special/music-data')
    const old = genresAt(1930)
    for (const g of ['Rock', 'Reggae', 'Rap', 'Alternative']) expect(old).not.toContain(g)
    for (const g of ['Pop', 'R&B', 'Country', 'Folk', 'Worship']) expect(old).toContain(g)
    expect(genresAt(2000)).toEqual(GENRE_NAMES)
    const rap95 = subgenresAt('Rap', 1995)
    for (const s of ['Crunk', 'Trap', 'Mumble Rap']) expect(rap95).not.toContain(s)
    expect(rap95.length).toBeGreaterThan(0)
    expect(subgenresAt('Rap', 2026)).toEqual(GENRES.Rap)
    // Order is kept, and a filter that would empty a list leaves it whole.
    expect(subgenresAt('Rap', 1995)).toEqual(GENRES.Rap.filter((s) => rap95.includes(s)))
    expect(subgenresAt('Nowhere', 1990)).toEqual([])
  })

  it('keeps invented labels and ceremonies out of allBrands and gates ceremonies by year', async () => {
    const { CEREMONIES, LABEL_ROSTER, ceremonyAt, claimOdds, labelId } = await import('../src/game/special/music-data')
    const brands = new Set(allBrands().map((b) => b.name))
    for (const l of LABEL_ROSTER) expect(brands.has(l.name), l.name).toBe(false)
    for (const c of CEREMONIES) expect(brands.has(c.name), c.name).toBe(false)
    expect(ceremonyAt('us', 1958)).toBeNull()
    expect(ceremonyAt('us', 1959)?.name).toBe('Golden Record Award')
    expect(ceremonyAt('ng', 1999)).toBeNull()
    expect(ceremonyAt('ng', 2000)?.name).toBe('Naija Sound')
    expect(ceremonyAt('au', 1986)).toBeNull()
    expect(ceremonyAt('au', 1987)?.name).toBe('Wattle Disc')
    expect(ceremonyAt('fr', 1974)).toBeNull()
    expect(ceremonyAt('fr', 1975)?.name).toBe('National Music Awards')
    expect(claimOdds('sample', 5)).toBe(0.4)
    expect(claimOdds('sample', 15)).toBe(0.15)
    expect(claimOdds('sample', 0)).toBe(0)
    expect(claimOdds('plagiarism', 10)).toBe(0.04)
    expect(claimOdds('plagiarism', 11)).toBe(0)
    expect(labelId('Crown & Anchor Music Group')).toBe('crown-anchor-music-group')
    const ids = LABEL_ROSTER.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const l of LABEL_ROSTER) expect(l.id).toBe(labelId(l.name))
  })
})
