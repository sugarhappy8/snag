// The real-brand registry for everyday life (data/brands-consumer-*.ts): data hygiene, era and
// country gating, and the places that name brands (jobs, ads, social, shops).
import { describe, expect, it } from 'vitest'
import { allBrands, brandAvailable, brandExists, brandsFor, type Brand } from '../src/game/data/brands'
import { CONSUMER_BRANDS } from '../src/game/data/brands-consumer'
import { brandPool } from '../src/game/shops/everyday-brands'
import { COUNTRIES } from '../src/game/world'
import { PRESENT_YEAR } from '../src/game/history/timeline'

const COUNTRY_IDS = new Set(COUNTRIES.map((c) => c.id))

describe('consumer brand data', () => {
  it('has hundreds of brands and unique ids', () => {
    expect(CONSUMER_BRANDS.length).toBeGreaterThan(900)
    const seen = new Map<string, number>()
    for (const b of allBrands()) seen.set(b.id, (seen.get(b.id) ?? 0) + 1)
    const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(dup).toEqual([])
  })

  it('only names real countries and sane years', () => {
    const bad: string[] = []
    for (const b of CONSUMER_BRANDS) {
      if (b.hq && !COUNTRY_IDS.has(b.hq)) bad.push(`${b.id}: hq ${b.hq}`)
      for (const c of b.countries ?? []) if (!COUNTRY_IDS.has(c)) bad.push(`${b.id}: country ${c}`)
      for (const [c, y] of Object.entries(b.sold ?? {})) {
        if (!COUNTRY_IDS.has(c)) bad.push(`${b.id}: sold ${c}`)
        if (typeof y !== 'number' || y < b.founded) bad.push(`${b.id}: sold year ${c}:${y} before ${b.founded}`)
      }
      if (b.ended !== undefined && (b.ended >= PRESENT_YEAR || b.ended < b.founded)) bad.push(`${b.id}: ended ${b.ended}`)
      if (!b.name.trim() || !b.category || b.founded < 1400 || b.founded > PRESENT_YEAR) bad.push(`${b.id}: basics`)
      if ((b.fame ?? 5) < 1 || (b.fame ?? 5) > 10) bad.push(`${b.id}: fame`)
    }
    expect(bad).toEqual([])
  })

  it('never lists forbidden categories or negative words', () => {
    const banned = /tobacco|cigar|vape|firearm|gun\b|casino|betting|lottery|poker/i
    const bad = CONSUMER_BRANDS.filter((b) => banned.test(`${b.category} ${b.name} ${b.blurb ?? ''}`)).map((b) => b.id)
    expect(bad).toEqual([])
    const neg = /scandal|fraud|lawsuit|recall|bankrupt|collaps|layoff|breach|crime/i
    expect(CONSUMER_BRANDS.filter((b) => neg.test(b.blurb ?? '')).map((b) => b.id)).toEqual([])
  })

  it('product lines are well formed', () => {
    const bad: string[] = []
    for (const b of CONSUMER_BRANDS) {
      const lines = (b.data?.lines ?? []) as unknown as [string, number, number?, string?][]
      for (const l of lines) {
        if (typeof l[0] !== 'string' || typeof l[1] !== 'number') bad.push(b.id)
        else if (l[1] < b.founded) bad.push(`${b.id}: ${l[0]} before the brand`)
      }
    }
    expect(bad).toEqual([])
  })
})

/** A throwaway view of "a life in country X in year Y" for the registry queries. */
function life(countryId: string, year: number) {
  return { year, character: { countryId } } as never
}

describe('brand gating by era and country', () => {
  const countries = ['us', 'jp', 'br', 'ng', 'de', 'in', 'id']
  const years = [1950, 1975, 1985, 2000, 2015, 2026]
  const categories = ['fast-food', 'coffee', 'supermarket', 'department-store', 'airline', 'hotel', 'bank', 'card-network', 'insurer', 'phone', 'computer', 'console', 'game-platform', 'streaming', 'telecom', 'toy', 'furniture', 'appliance', 'car', 'motorcycle', 'bike', 'pharmacy', 'delivery', 'ride-hailing', 'social-media', 'sportswear', 'e-commerce', 'cinema']

  it('never offers a brand before it existed, after it ended or where it does not trade', () => {
    for (const cid of countries) for (const y of years) for (const cat of categories) {
      for (const b of brandsFor(life(cid, y), cat)) {
        expect(brandExists(b, y), `${b.id} in ${y}`).toBe(true)
        expect(brandAvailable(b, cid, y), `${b.id} in ${cid} ${y}`).toBe(true)
        expect(b.founded <= y).toBe(true)
      }
    }
  })

  it('has something for every everyday category in modern times, in every sampled country', () => {
    for (const cid of countries) for (const cat of ['supermarket', 'bank', 'telecom', 'phone', 'fast-food', 'airline', 'insurer']) {
      expect(brandsFor(life(cid, 2026), cat).length, `${cat} in ${cid}`).toBeGreaterThan(0)
    }
  })

  it('keeps anachronisms out: no smartphones in 1975, no Netflix in 1985, no McDonald\'s in Nigeria', () => {
    const ids = (cid: string, y: number, cat: string) => brandsFor(life(cid, y), cat).map((b: Brand) => b.id)
    expect(ids('us', 1975, 'phone')).not.toContain('apple-iphone')
    expect(ids('us', 1975, 'phone')).not.toContain('samsung-phone')
    expect(ids('us', 1985, 'streaming')).not.toContain('netflix')
    expect(ids('us', 2012, 'streaming')).toContain('netflix')
    expect(ids('ng', 2020, 'fast-food')).not.toContain('mcdonalds')
    expect(ids('ng', 2020, 'fast-food')).toContain('kfc')
    expect(ids('ng', 2020, 'fast-food')).toContain('chicken-republic')
    expect(ids('jp', 1950, 'fast-food')).not.toContain('mcdonalds')
    expect(ids('jp', 1975, 'fast-food')).toContain('mcdonalds')
    expect(ids('de', 1950, 'console')).toEqual([])
    expect(ids('us', 1982, 'computer')).toContain('commodore')
    expect(ids('us', 1982, 'console')).toContain('atari-consoles')
    expect(ids('us', 1982, 'console')).not.toContain('sony-playstation')
    expect(ids('in', 2017, 'telecom')).toContain('jio')
    expect(ids('in', 2010, 'telecom')).not.toContain('jio')
    expect(ids('us', 2026, 'social-media')).toContain('tiktok')
    expect(ids('us', 2000, 'social-media')).not.toContain('tiktok')
    expect(ids('ru', 2024, 'fast-food')).not.toContain('mcdonalds')
    expect(ids('ru', 2005, 'fast-food')).toContain('mcdonalds-ru')
  })

  it('local brands come first for a local life', () => {
    expect(brandsFor(life('jp', 2010), 'convenience').map((b) => b.id).slice(0, 3)).toContain('lawson')
    expect(brandPool(life('br', 2010), 'supermarket')[0]?.hq).toBe('br')
    expect(brandPool(life('de', 2010), 'supermarket')[0]?.hq).toBe('de')
    expect(brandPool(life('in', 2020), 'bank')[0]?.hq).toBe('in')
    expect(brandPool(life('id', 2020), 'telecom')[0]?.hq).toBe('id')
    expect(brandPool(life('ng', 2020), 'bank')[0]?.hq).toBe('ng')
  })
})

// ---------------------------------------------------------------------------
// Where the brands show up

describe('real brands in daily life', () => {
  it('names the first jobs after chains that trade where you live', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { partTimeListings, fullTimeListings } = await import('../src/game/careers')
    const { isRealBrandName } = await import('../src/game/shops/everyday-brands')
    for (const [cid, y] of [['us', 2015], ['jp', 1995], ['br', 2005], ['in', 2020], ['de', 1985]] as const) {
      const g = createNewLife({ countryId: cid, year: y, seed: 5 })
      g.character.age = 24
      const names = [...partTimeListings(g), ...fullTimeListings(g)].map((l) => l.company)
      const real = names.filter((n) => isRealBrandName(n))
      expect(real.length, `${cid} ${y}`).toBeGreaterThan(0)
      for (const n of real) {
        const b = allBrands().find((x) => x.name === n && brandAvailable(x, cid, y))
        expect(b, `${n} in ${cid} ${y}`).toBeTruthy()
      }
    }
  })

  it('never lists a real company in the Great Depression (those years write layoffs)', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { partTimeListings } = await import('../src/game/careers')
    const { isRealBrandName } = await import('../src/game/shops/everyday-brands')
    const g = createNewLife({ countryId: 'us', year: 1932, seed: 9 })
    g.character.age = 22
    expect(partTimeListings(g).some((l) => isRealBrandName(l.company))).toBe(false)
  })

  it('offers commercials and sponsorships only from brands that exist where and when you live', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { pickBrand } = await import('../src/game/shops/everyday-brands')
    for (const [cid, y] of [['us', 1952], ['jp', 1975], ['ng', 2000], ['id', 2015], ['de', 2026]] as const) {
      const g = createNewLife({ countryId: cid, year: y, seed: 3 })
      for (const cat of ['energy-drink', 'telecom', 'sneakers', 'insurer', 'car', 'fast-food']) {
        const b = pickBrand(g, cat)
        if (b) expect(brandAvailable(b, cid, y), `${b.id} ${cid} ${y}`).toBe(true)
      }
    }
  })

  it('names home computers and consoles after real models of the year', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { computerModel } = await import('../src/game/computer/era')
    const { isComputer } = await import('../src/game/computer')
    for (const [cid, y] of [['us', 1982], ['gb', 1983], ['jp', 1985], ['us', 1995], ['de', 2004], ['us', 2020]] as const) {
      const g = createNewLife({ countryId: cid, year: y, seed: 4 })
      const m = computerModel(g)
      expect(isComputer({ kind: 'other', name: m.displayName, condition: 100 } as never), m.displayName).toBe(true)
      if (m.displayName !== m.name) expect(m.displayName).not.toBe('Home Computer')
    }
    const us82 = createNewLife({ countryId: 'us', year: 1982, seed: 4 })
    expect(computerModel(us82).displayName).toMatch(/Apple|Commodore|Atari|Tandy|IBM|HP|Compaq|Sinclair/)
  })

  it('uses a real bank for mortgages and keeps lender names out of default texts', async () => {
    const { employerRef, isRealBrandName } = await import('../src/game/shops/everyday-brands')
    expect(isRealBrandName('Chase')).toBe(true)
    expect(isRealBrandName('Cornerstone Lending')).toBe(false)
    expect(employerRef('Chase', 'your lender')).toBe('your lender')
    expect(employerRef('Cornerstone Lending', 'your lender')).toBe('Cornerstone Lending')
  })
})

describe('no invented companies left where a real one belongs', () => {
  const read = async (rel: string) => (await import('node:fs')).readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

  it('the former fictional consumer brands are gone from the files that now use real ones', async () => {
    const former: Record<string, string[]> = {
      'src/game/special/fame.ts': ['Burger Blast', 'Zoomtastic Motors', 'Volt Rush', 'SafeHaven Mutual', "Crunchy O's", 'AirStride', 'SilkLocks', 'Ringo Wireless', 'Purrfect Bites', 'SnoozeBarge', "'Glint'", 'Bargain Barn', 'Moo-Moo Farms'],
      'src/game/special/sports-core.ts': ['Stridewell', 'Vortex Athletics', 'Pulse Energy', 'Glacier Springs', 'Summit Chrono', 'Titan Edge', 'Crunch Cola', 'Ironclad Insurance', 'Nimbus Audio', 'FuelUp', 'Kinetix', 'Rocket Burger', 'Lumen Phones', 'Heroic Protein', 'Marlowe Motors', 'ByteBank', 'Featherlight', 'GrandSlam Gaming Chairs'],
      'src/game/special/social.ts': ['Friendbook', 'Snapgram', 'Chirper', 'Clipz', 'ViewTube'],
      'src/game/computer/dev-learn.ts': ['CodeCub', 'ByteSized', 'CodeCove', 'LearnLoop', 'SkillShelf', 'CourseCrate'],
      'src/game/computer/dev-freelance.ts': ['Gigly', 'FreelanceFox', 'TaskHive'],
      'src/game/shops/memberships-data.ts': ['FlexZone', 'HiveDesk', 'StreamStack', 'Tunely', 'GameVault', 'ChefCrate', 'BulkBarn', 'AeroCard', 'Kindling'],
      'src/game/assets.ts': ['Liberty Home Loans', 'Keystone Mortgage', 'Speedy Auto Finance', 'Harborview Marine Credit', 'Skyward Aviation Finance'],
      'src/game/events/kid.ts': ['Pizza Palace', 'Burger Barn', "Cluckin' Chicken"],
    }
    for (const [file, names] of Object.entries(former)) {
      const src = await read(file)
      for (const n of names) {
        // social.ts keeps the old names only as save-compat aliases.
        if (file.endsWith('social.ts') && src.includes(`'${n}'`) && /LEGACY_NAMES/.test(src)) continue
        expect(src.includes(n), `${n} still in ${file}`).toBe(false)
      }
    }
  })

  it('scams, frauds and scandals stay fictional: no registry brand in those files', async () => {
    const files = ['src/game/computer/money-scams.ts', 'src/game/computer/money-crypto.ts']
    // Everyday words that happen to be brand names are not claims about those brands.
    const common = new Set(['gap', 'mars', 'head', 'target', 'next', 'orange', 'free', 'play', 'plus', 'max', 'star', 'sky', 'apple', 'meta', 'line', 'google', 'amazon', 'visa', 'mastercard', 'bic', 'dove', 'tide', 'crest', 'club', 'one', 'three', 'ee', 'o2', 'wise', 'square', 'stripe', 'mobily', 'zain', 'bell', 'oi', 'vi', 'ica', 'dia', 'coop', 'co-op', 'life', 'point', 'jazz', 'glo', 'smart', 'globe', 'optimus', 'power', 'house', 'spark', 'fire', 'bolt', 'swift', 'boost', 'echo', 'pixel', 'surface', 'steam', 'twitter', 'x', 'discover', 'chase', 'citizens', 'pearl', 'kobo', 'wolt', 'monzo', 'revolut', 'uber', 'lyft', 'grab', 'ola', 'didi', 'bolt', 'careem', 'gett', 'jio', 'airtel'])
    const brands = allBrands().filter((b) => b.name.length >= 5 && !common.has(b.name.toLowerCase()))
    for (const f of files) {
      const src = await read(f)
      const hits = brands.filter((b) => new RegExp(`(?<![A-Za-z])${b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(src)).map((b) => b.name)
      expect(hits, `${f} names real brands`).toEqual([])
    }
  })

  it('old saves keep their saved names and keep playing', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { ageUp } = await import('../src/game/aging')
    const g = createNewLife({ countryId: 'us', year: 2020, seed: 12 })
    const c = g.character
    c.age = 30
    c.money = 500_000
    c.social = { platform: 'Friendbook', handle: 'old_me', followers: 1200, verified: false, monetized: false }
    g.assets.push(
      { id: 'a-old1', kind: 'other', name: 'Smartphone', emoji: '📱', purchasePrice: 900, value: 300, condition: 80, purchasedAge: 28, upkeep: 0, details: { category: 'electronics' } },
      { id: 'a-old2', kind: 'membership', name: 'FlexZone 24/7', emoji: '🏋️', purchasePrice: 300, value: 0, condition: 100, purchasedAge: 29, upkeep: 300, details: { category: 'fitness', planId: 'gym', tier: 'budget', perks: ['24/7 access'] } },
      { id: 'a-old3', kind: 'membership', name: 'Kindling Premium', emoji: '🔥', purchasePrice: 400, value: 0, condition: 100, purchasedAge: 29, upkeep: 400, details: { category: 'dating', planId: 'dating', tier: 'plus' } },
    )
    c.loans.push({ id: 'l-old', kind: 'personal', lender: 'First National Bank', principal: 10_000, balance: 8_000, rate: 0.06, yearlyPayment: 1_500, yearsLeft: 6, missedPayments: 0 } as never)
    for (let i = 0; i < 4 && c.alive; i++) {
      ageUp(g)
      g.queue = []
    }
    expect(g.assets.find((a) => a.id === 'a-old1')?.name).toBe('Smartphone')
    expect(g.assets.find((a) => a.id === 'a-old3')?.name ?? 'Kindling Premium').toBe('Kindling Premium')
    expect(c.loans.every((l) => typeof l.lender === 'string')).toBe(true)
    expect(['Friendbook', 'friendbook']).toContain(JSON.parse(JSON.stringify(g)).character.social?.platform ?? 'Friendbook')
  })

  it('names a real brokerage that traded there and then, or an invented one', async () => {
    const { brokerName } = await import('../src/game/computer/money-common')
    const real = new Set(allBrands().filter((b) => b.category === 'brokerage').map((b) => b.name))
    for (const country of ['us', 'jp', 'br', 'ng', 'de', 'in', 'id']) {
      for (const year of [1950, 1985, 2000, 2015, 2026]) {
        const name = brokerName(country, year)
        expect(name.length).toBeGreaterThan(2)
        expect(brokerName(country, year)).toBe(name)
        if (real.has(name)) {
          const b = allBrands().find((x) => x.category === 'brokerage' && x.name === name)!
          expect(brandAvailable(b, country, year)).toBe(true)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Review fixes

describe('review fixes: footprints, models and home markets', () => {
  const ids = (cid: string, y: number, cat: string) => brandsFor(life(cid, y), cat).map((b: Brand) => b.id)

  it('never lists two rows with the same name in one category, country and year', () => {
    const bad = new Set<string>()
    for (const y of [1950, 1975, 1990, 2000, 2010, 2020, 2026]) {
      for (const c of COUNTRIES) {
        const seen = new Map<string, string>()
        for (const b of allBrands()) {
          if (b.category === 'console' || !brandAvailable(b, c.id, y)) continue
          const k = `${b.category}|${b.name}`
          if (seen.has(k)) bad.add(`${k} (${seen.get(k)}, ${b.id}) in ${c.id} ${y}`)
          else seen.set(k, b.id)
        }
      }
    }
    expect([...bad]).toEqual([])
  })

  it('Carrefour is only where it still trades (and in Japan only until 2005)', () => {
    for (const cid of ['us', 'jp', 'kr', 'mx', 'th', 'sg', 'my', 'cl', 'co', 'id']) expect(ids(cid, 2026, 'supermarket').filter((i) => i.startsWith('carrefour')), cid).toEqual([])
    expect(ids('jp', 2002, 'supermarket')).toContain('carrefour-exit-2005')
    expect(ids('jp', 2008, 'supermarket').some((i) => i.startsWith('carrefour'))).toBe(false)
    expect(ids('fr', 2026, 'supermarket')).toContain('carrefour')
    expect(ids('ae', 2026, 'supermarket').filter((i) => i.startsWith('carrefour'))).toEqual(['carrefour-mena'])
  })

  it('Burger King is Hungry Jack\'s in Australia and TIM Brasil is the only TIM in Brazil', () => {
    expect(ids('au', 2010, 'fast-food')).toContain('hungry-jacks')
    expect(ids('au', 2010, 'fast-food')).not.toContain('burger-king')
    expect(ids('br', 2010, 'telecom').filter((i) => i.startsWith('tim'))).toEqual(['tim-brasil'])
  })

  it('has home-market supermarkets for Australia, Canada and New Zealand, and the right ones in the right years', () => {
    const home = (cid: string, y: number, cat: string) => brandsFor(life(cid, y), cat).filter((b) => b.hq === cid)
    expect(home('au', 2020, 'supermarket').length).toBeGreaterThanOrEqual(2)
    expect(home('ca', 2020, 'supermarket').length).toBeGreaterThanOrEqual(2)
    expect(home('nz', 2020, 'supermarket').length).toBeGreaterThanOrEqual(2)
    expect(ids('ca', 2026, 'department-store')).not.toContain('hudsons-bay')
    expect(ids('ca', 2020, 'department-store')).toContain('hudsons-bay')
    expect(ids('au', 2010, 'streaming')).not.toContain('stan')
    expect(ids('au', 2020, 'streaming')).toContain('stan')
    expect(ids('au', 1920, 'supermarket')).not.toContain('woolworths-au')
    expect(ids('au', 1950, 'supermarket')).toContain('woolworths-au')
  })

  it('keeps firearms-linked names out and old product lines retired', async () => {
    expect(allBrands().some((b) => /remington/i.test(b.name))).toBe(false)
    const { lineOf } = await import('../src/game/shops/everyday-brands')
    const tandy = allBrands().find((b) => b.id === 'tandy')!
    expect(lineOf(tandy, 1986, 'us')).toBe('Tandy 1000')
    expect(lineOf(tandy, 2026, 'us')).toBeUndefined()
    const ibm = allBrands().find((b) => b.id === 'ibm-pc')!
    expect(lineOf(ibm, 2010, 'us')).toBeUndefined()
    const samsung = allBrands().find((b) => b.id === 'samsung-computers')!
    expect(lineOf(samsung, 2004, 'us')).toBeUndefined()
    const moto = allBrands().find((b) => b.id === 'motorola')!
    expect(lineOf(moto, 2018, 'us')).toBe('Moto G')
  })

  it('American brands are not offered in countries under a US embargo', async () => {
    const { brandPool, embargoed } = await import('../src/game/shops/everyday-brands')
    for (const [cid, y] of [['cu', 2000], ['ir', 2010], ['kp', 2000], ['sy', 2012]] as const) {
      const g = life(cid, y)
      for (const cat of ['hotel', 'fast-food', 'phone', 'bank', 'insurer', 'airline']) {
        for (const b of brandPool(g, cat)) expect(embargoed(b, cid, y), `${b.id} in ${cid}`).toBe(false)
      }
    }
    // Before the embargo (Havana in 1955) and for everyone else, nothing changes.
    const hilton = allBrands().find((b) => b.id === 'hilton')
    if (hilton) {
      expect(embargoed(hilton, 'cu', 1955)).toBe(false)
      expect(embargoed(hilton, 'jp', 2026)).toBe(false)
    }
  })

  it('a furniture shop is a shop, not an office-chair maker', async () => {
    const { createNewLife } = await import('../src/game/life')
    const { storeName } = await import('../src/game/shops/everyday')
    const makers = new Set(allBrands().filter((b) => b.category === 'furniture' && b.segment === 'chair').map((b) => b.name))
    for (const [cid, y] of [['us', 2026], ['de', 2026], ['br', 2000], ['id', 2026], ['us', 1955]] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const g = createNewLife({ countryId: cid, year: y, seed })
        expect(makers.has(storeName(g, 'furniture')), `${cid} ${y} ${seed}`).toBe(false)
      }
    }
  })

  it('writes the right article before a product name', async () => {
    const { withArticle } = await import('../src/game/shops/everyday')
    expect(withArticle('Used Road Bike')).toBe('a used Road Bike')
    expect(withArticle('Uniqlo Graphic Hoodie')).toBe('a Uniqlo Graphic Hoodie')
    expect(withArticle('Adidas Graphic Hoodie')).toBe('an Adidas Graphic Hoodie')
    expect(withArticle('E-Bike')).toBe('an e-Bike')
    expect(withArticle('1,000-Piece Jigsaw Puzzle')).toBe('a 1,000-Piece Jigsaw Puzzle')
  })
})
