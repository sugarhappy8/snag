// Regression tests from the adversarial review of the late-era pass (1980-2026): brands appear
// only from the year they launched and only where they traded, farmable lessons wear off, and
// the first white music player costs what it cost.
import { describe, expect, it } from 'vitest'
import { pastimesMenu } from '../src/game/activities/pastimes'
import { formatMoney } from '../src/game/core'
import { ERA_PACK_1980 } from '../src/game/events/era-pack-1980'
import { ERA_PACK_2000 } from '../src/game/events/era-pack-2000'
import { socialSite } from '../src/game/events/era-pack-2000-events'
import { eraPrice } from '../src/game/events/era-late-kit'
import { eraOk, eraStrip } from '../src/game/events/era'
import { eraFlavorPools } from '../src/game/events/era-life'
import { appBrand } from '../src/game/love'
import type { GameState, MenuAction, MenuGroup } from '../src/game/types'
import { makeTestGame } from './helpers'

function life(year: number, age: number, countryId = 'us', money = 20_000): GameState {
  const g = makeTestGame(9, { countryId, birthCountryId: countryId, age, money })
  g.year = year
  return g
}

// First year each brand, product or title could appear in a flavor line (approximate, well known).
const LAUNCH: Record<string, number> = {
  'Super Mario': 1985, 'Game Boy': 1989, Tamagotchi: 1996, Furby: 1998, PlayStation: 1994, Pokémon: 1996, ICQ: 1996,
  Facebook: 2004, MySpace: 2003, Wikipedia: 2001, iPod: 2001, BlackBerry: 1999, Minecraft: 2009, Napster: 1999,
  Swatch: 1983, 'Cabbage Patch': 1983, Rugrats: 1991, DuckTales: 1987, Thundercats: 1985, Smurfs: 1981, Transformers: 1984,
  'He-Man': 1982, Beanie: 1993, Pogs: 1993, 'Power Rangers': 1993, 'Yu-Gi-Oh': 1999, Bakugan: 2007, Beyblade: 1999,
  Bratz: 2001, Tinder: 2012, Tetris: 1984, Famicom: 1983, 'Master System': 1985, Spectrum: 1982, Commodore: 1982,
  'Windows 95': 1995, 'CD-ROM': 1989, Fraggle: 1983, Instagram: 2010, TikTok: 2017, WhatsApp: 2009, Snapchat: 2011,
  YouTube: 2005, Netflix: 1997, Spotify: 2008, Google: 1998, Amazon: 1995, Twitter: 2006, Skype: 2003, Zoom: 2013,
  WeChat: 2011, Douyin: 2016, Orkut: 2004, Mixi: 2004, Friendster: 2002, KakaoTalk: 2010,
}

describe('brands in flavor lines', () => {
  it('no line can show a brand before it launched', () => {
    const bad: string[] = []
    for (const pack of [ERA_PACK_1980, ERA_PACK_2000]) {
      for (const pool of pack.flavor) {
        for (const line of pool.lines) {
          const m = /^@([\w!+,:-]+)\s+([\s\S]*)$/.exec(line)
          const tags = m ? m[1].split(',') : []
          const body = m ? m[2] : line
          const first = tags.find((t) => /^\d{4}$/.test(t))
          const from = first ? Number(first) : Math.max(pool.from ?? pack.from, pack.from)
          for (const [brand, year] of Object.entries(LAUNCH)) if (body.includes(brand) && from < year) bad.push(`${pool.key} [${from} < ${year}] ${body.slice(0, 90)}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('country-bound brands stay in their country, and blocked ones stay out of theirs', () => {
    // Minitel was French; the line now describes the generic phone-line terminal instead.
    // Facebook did not trade in mainland China.
    for (const [country, banned, years] of [
      ['pl', 'Minitel', [1982, 1999]],
      ['de', 'Minitel', [1982, 1999]],
      ['cn', 'Facebook', [2008, 2026]],
    ] as const) {
      for (let year = years[0]; year <= years[1]; year++) {
        for (const age of [10, 16, 30, 60]) {
          const g = life(year, age, country)
          for (const p of eraFlavorPools(g)) for (const l of p.lines) if (eraOk(g, l)) expect(eraStrip(l), `${country} ${year} ${p.key}`).not.toContain(banned)
        }
      }
    }
  })
})

describe('the social site of the year', () => {
  it('never names a site before it launched', () => {
    const launched: Record<string, number> = { Mixi: 2004, Orkut: 2004, MySpace: 2003, Friendster: 2002, Cyworld: 1999, VKontakte: 2006, LINE: 2011, KakaoTalk: 2010, WeChat: 2011, QQ: 1999, Facebook: 2004 }
    for (const country of ['jp', 'kr', 'cn', 'ru', 'br', 'in', 'id', 'ph', 'us', 'gb', 'ng', 'de']) {
      for (let year = 1999; year <= 2026; year++) {
        const site = socialSite(life(year, 16, country))
        const first = launched[site]
        if (first !== undefined) expect(year, `${country} ${year} ${site}`).toBeGreaterThanOrEqual(first)
      }
    }
  })
})

describe('dating app brands', () => {
  it('uses the service that really traded where the player lives', () => {
    expect(appBrand(life(2010, 22, 'us')).name).toBe('OkCupid')
    expect(appBrand(life(2010, 22, 'de')).name).toBe('Match.com')
    expect(appBrand(life(2010, 22, 'jp')).name).toBe('Match.com')
    expect(appBrand(life(2013, 22, 'jp')).name).toBe('Pairs')
    expect(appBrand(life(2013, 22, 'cn')).name).toBe('Momo')
    expect(appBrand(life(2018, 22, 'us')).name).toBe('Tinder')
  })
})

describe('the cyber cafe lesson', () => {
  it('teaches less every time in the same year (no smarts farm)', () => {
    const g = life(2000, 14, 'ng', 5_000)
    const cafe = (pastimesMenu.children(g) as MenuGroup[]).find((n) => n.id === 'pastimes.cafe') as MenuGroup
    expect(cafe).toBeTruthy()
    const learn = cafe.children(g).find((n) => n.id === 'pastimes.cafe.learn') as MenuAction
    g.character.stats.smarts = 10
    const gains: number[] = []
    for (let i = 0; i < 6; i++) {
      const before = g.character.stats.smarts
      learn.run(g)
      gains.push(g.character.stats.smarts - before)
      g.queue = []
    }
    expect(gains.slice(0, 3)).toEqual([3, 2, 1])
    expect(gains.slice(3).every((x) => x === 0)).toBe(true)
  })
})

describe('the first white music player', () => {
  it('costs more in its first years than later', () => {
    const ev = ERA_PACK_2000.events.find((e) => e.id === 'era.2000s.mp3Player')!
    const early = life(2002, 15, 'us', 100_000)
    const late = life(2008, 15, 'us', 100_000)
    expect(ev.setup(early)!.text).toContain(formatMoney(eraPrice(early, 300)))
    expect(ev.setup(late)!.text).toContain(formatMoney(eraPrice(late, 200)))
  })
})
