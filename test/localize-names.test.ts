// Names and places from the nation where people live: Brazilians are not named like the
// Portuguese, Montreal babies get Québécois names, debt collectors in Jakarta aren't called
// Gary, prisons, courts, parliaments, armies and preschools follow the country.
import { describe, expect, it } from 'vitest'
import { localPreschoolName } from '../src/game/data/locales'
import { EVENT_LIBRARY } from '../src/game/events'
import { arrestPlayer } from '../src/game/crime'
import { yearlyFinance } from '../src/game/finance'
import { createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { prisonLife, sendToPrison } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import { militaryMenu } from '../src/game/special/military'
import { politicsCareerMenu } from '../src/game/special/politics'
import type { ChoiceModal, GameState, MenuNode } from '../src/game/types'
import { COUNTRY_NAME_POOLS, getCountry, NAME_POOLS, namePoolOf, trialBy } from '../src/game/world'
import { makeTestGame } from './helpers'

function inCountry(countryId: string, seed = 1, extra: Partial<GameState['character']> = {}): GameState {
  const c = getCountry(countryId)
  return makeTestGame(seed, { countryId, birthCountryId: countryId, city: c.cities[0], age: 30, ...extra })
}

function labels(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.map((n) => {
    const v = n.type === 'info' ? n.text : 'label' in n ? n.label : ''
    return typeof v === 'function' ? v(g) : String(v ?? '')
  })
}

function texts(g: GameState): string[] {
  const out: string[] = []
  for (const y of g.log) for (const e of y.entries) out.push(e.text)
  for (const m of g.queue) {
    if ('title' in m && m.title) out.push(m.title)
    if ('text' in m && typeof m.text === 'string') out.push(m.text)
    if (m.kind === 'choice') out.push(...m.choices.map((c) => c.label))
  }
  return out
}

const ENGLISH = new Set([...NAME_POOLS.anglo.male, ...NAME_POOLS.anglo.female, ...NAME_POOLS.anglo.last])

describe('people get names from where they live', () => {
  const COUNTRIES = ['br', 'pt', 'ar', 'uy', 'mx', 'cu', 'do', 'pr', 'ad', 'aw', 'au', 'nz', 'at', 'ch', 'dk', 'no', 'se', 'ke', 'ug', 'lb', 'sy', 'iq', 'jo', 'sa', 'ae', 'kw', 'qa', 'dz', 'ma', 'tn', 'hr', 'rs', 'cz', 'sk']

  it('gives every overridden country its own compact, distinct pool', () => {
    for (const id of COUNTRIES) {
      const pool = COUNTRY_NAME_POOLS[id]
      expect(pool, id).toBeDefined()
      expect(namePoolOf(id)).toBe(pool)
      for (const list of [pool.male, pool.female, pool.last]) {
        expect(list.length, id).toBeGreaterThanOrEqual(15)
        for (const n of list) expect(n.trim(), `${id}: ${n}`).toBe(n)
      }
    }
    // Neighbors that used to share a pool really differ now.
    const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length / a.length
    expect(overlap(COUNTRY_NAME_POOLS.br.male, COUNTRY_NAME_POOLS.pt.male)).toBeLessThan(0.5)
    expect(overlap(COUNTRY_NAME_POOLS.ke.last, COUNTRY_NAME_POOLS.ug.last)).toBeLessThan(0.5)
    expect(overlap(COUNTRY_NAME_POOLS.sa.last, COUNTRY_NAME_POOLS.ae.last)).toBeLessThan(0.3)
    expect(overlap(COUNTRY_NAME_POOLS.no.last, COUNTRY_NAME_POOLS.se.last)).toBeLessThan(0.5)
    // Argentina has Italian surnames, Mexico doesn't.
    expect(COUNTRY_NAME_POOLS.ar.last).toContain('Rossi')
    expect(COUNTRY_NAME_POOLS.mx.last).not.toContain('Rossi')
    // New Zealand includes Māori names.
    expect(COUNTRY_NAME_POOLS.nz.female).toContain('Aroha')
  })

  it('creates family, friends and strangers with names from their country', () => {
    for (const id of [...COUNTRIES, 'id', 'jp', 'in', 'ng', 'de', 'fr', 'kr', 'eg', 'et', 'cn']) {
      const pool = namePoolOf(id)
      for (let seed = 1; seed <= 4; seed++) {
        const g = createNewLife({ seed, year: 2026, countryId: id })
        expect([...pool.male, ...pool.female], `${id} player`).toContain(g.character.firstName)
        for (let i = 0; i < 6; i++) {
          const p = createPerson(g, { relation: 'friend', age: 30 })
          expect([...pool.male, ...pool.female], `${id}: ${p.firstName}`).toContain(p.firstName)
          expect(pool.last, `${id}: ${p.lastName}`).toContain(p.lastName)
        }
      }
    }
  })

  it('gives most Montreal and Quebec City babies Québécois names', () => {
    let quebec = 0
    let total = 0
    const qcLast = ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Fournier', 'Lapointe', 'Leclerc', 'Lefebvre', 'Poulin']
    for (let seed = 1; seed <= 30; seed++) {
      const g = createNewLife({ seed, year: 2026, countryId: 'ca', city: 'Quebec City' })
      for (const p of [g.character, ...g.people.filter((x) => x.relation !== 'pet')]) {
        total++
        if (qcLast.includes(p.lastName)) quebec++
      }
    }
    expect(quebec / total).toBeGreaterThan(0.6)
    // Toronto stays English-speaking Canada.
    const t = createNewLife({ seed: 3, year: 2026, countryId: 'ca', city: 'Toronto' })
    expect(qcLast).not.toContain(t.character.lastName)
  })
})

describe('no hard-coded American names or places abroad', () => {
  it('names debt collectors after locals', () => {
    for (const id of ['id', 'jp', 'de', 'sa', 'br']) {
      const pool = namePoolOf(id)
      for (let seed = 1; seed <= 30; seed++) {
        const g = inCountry(id, seed, { money: -5000, residence: { status: 'parents' } })
        yearlyFinance(g)
        const text = g.queue.find((m) => m.kind === 'notice' && m.title === 'Debt Collectors')
        const named = text && 'text' in text ? /named (\S+) left you/.exec(text.text) : null
        if (named) expect([...pool.male, ...pool.female], `${id}: ${named[1]}`).toContain(named[1])
        expect(texts(g).join(' ')).not.toMatch(/\b(Gary|Doreen|Duane|Trish)\b/)
      }
    }
  })

  it('locks people up in local prisons with local cellmates', () => {
    const style: Record<string, RegExp> = { id: /^(Lapas|Rutan|LPKA)/, de: /^(JVA|Justizvollzugsanstalt|Jugend)/, gb: /^(HMP|HMYOI)|Young Offender/, fr: /^(Maison|Centre)/, mx: /^(CERESO|Reclusorio|Penal|CEFERESO|Centro)/, jp: /(Prison|Detention House|Training School)$/, ru: /(Colony|SIZO)/ }
    for (const [id, re] of Object.entries(style)) {
      for (let seed = 1; seed <= 8; seed++) {
        const g = inCountry(id, seed)
        sendToPrison(g, 'Burglary', 4, { security: seed % 2 ? 'medium' : 'maximum' })
        const name = g.character.prison?.name ?? ''
        expect(name, id).toMatch(re)
        expect(name).not.toMatch(/State Prison|State Penitentiary|County Jail|Correctional Camp/)
        const pool = namePoolOf(id)
        for (const mate of g.people.filter((p) => p.relation === 'cellmate')) expect(pool.last, `${id}: ${mate.lastName}`).toContain(mate.lastName)
        for (const gang of prisonLife(g).gangs) expect(gang).not.toMatch(/\{|\}/)
      }
    }
    const us = inCountry('us', 2)
    sendToPrison(us, 'Burglary', 4, { security: 'maximum' })
    expect(us.character.prison?.name).toMatch(/State Penitentiary|Maximum Security Prison/)
  })

  it('has juries only where juries decide, and judges elsewhere', () => {
    expect(trialBy('us')).toBe('jury')
    expect(trialBy('gb')).toBe('jury')
    expect(trialBy('id')).toBe('judge')
    expect(trialBy('de')).toBe('lay')
    expect(trialBy('fr', 2)).toBe('judge')
    expect(trialBy('fr', 5)).toBe('jury')
    for (const id of ['id', 'et', 'sa', 'mx', 'jp']) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = inCountry(id, seed)
        arrestPlayer(g, 'Assault', 3, { evidence: 0.95 })
        for (let guard = 0; guard < 8; guard++) {
          const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && !!x.scriptId?.startsWith('crime.'))
          if (!m) break
          g.queue.splice(g.queue.indexOf(m), 1)
          const pick = m.scriptId === 'crime.arrest' ? 'cooperate' : m.scriptId === 'crime.trial.lawyer' ? 'pd' : m.scriptId === 'crime.trial.plea' ? 'trial' : 'refuse'
          runScript(g, m.scriptId!, pick, m.data, m)
        }
        const all = texts(g).join('\n')
        expect(all, id).not.toMatch(/\bjury\b|Public Defender|public defender|State Prison|County Jail/i)
      }
    }
  })

  it('runs politics the way the country does', () => {
    const offices = (id: string) => {
      const g = inCountry(id, 1, { age: 40 })
      return labels(g, politicsCareerMenu.children(g)).join(' | ')
    }
    expect(offices('us')).toMatch(/School Board Director.*Governor.*President/)
    expect(offices('gb')).toMatch(/City Councillor.*Member of Parliament.*Prime Minister/)
    expect(offices('de')).toMatch(/Minister-President.*Chancellor/)
    expect(offices('in')).toMatch(/Chief Minister.*Prime Minister/)
    expect(offices('ie')).toMatch(/Taoiseach/)
    expect(offices('id')).toMatch(/Governor.*President/)
    expect(offices('se')).toMatch(/Member of the Riksdag.*Prime Minister/)
    for (const id of ['gb', 'fr', 'jp', 'se', 'it']) expect(offices(id), id).not.toMatch(/School Board/)
    expect(offices('fr')).not.toMatch(/Governor/)
  })

  it('names the armed forces after the country and skips branches it does not have', () => {
    const forces = (id: string) => {
      const g = inCountry(id, 1, { age: 20 })
      return labels(g, militaryMenu.children(g)).join(' | ')
    }
    expect(forces('us')).toMatch(/U\.S\. Army.*U\.S\. Navy.*U\.S\. Marine Corps/)
    expect(forces('gb')).toMatch(/British Army.*Royal Navy.*Royal Air Force.*Royal Marines/)
    expect(forces('jp')).toMatch(/Japan Ground Self-Defense Force/)
    expect(forces('ch')).not.toMatch(/Navy|Marine/)
    expect(forces('de')).not.toMatch(/Marine Corps|Coast Guard/)
    expect(forces('ad')).toMatch(/no armed forces/)
  })
})

describe('preschools sound local', () => {
  const STYLE: Record<string, RegExp> = {
    id: /^(TK|PAUD)\b/,
    de: /\b(Kita|Kindergarten)\b/,
    fr: /^(École maternelle|Crèche)/,
    mx: /^(Jardín de Niños|CENDI|Kínder)/,
    jp: /(Yochien|Hoikuen|Kodomoen)$/,
    kr: /(Kindergarten|Yuchiwon|Eorinijip)$/,
    br: /^(EMEI|Escola|Creche|Escolinha)/,
    et: /(Kindergarten|KG)$/,
    sa: /(Rawdat|Kindergarten)/,
    nz: /(Kindergarten|Kōhanga Reo|Playcentre|Early Learning)/,
  }
  it('uses the local style everywhere, with every placeholder filled', () => {
    for (const [id, re] of Object.entries(STYLE)) {
      for (let seed = 1; seed <= 25; seed++) {
        const name = localPreschoolName(inCountry(id, seed))
        expect(name, id).toMatch(re)
        expect(name).not.toMatch(/[{}]|undefined/)
        expect(name, id).not.toMatch(/Little Sprouts|Tiny Tots|Busy Bees/)
      }
    }
    const us = new Set(Array.from({ length: 25 }, (_, i) => localPreschoolName(inCountry('us', i + 1))))
    expect([...us].some((n) => /Preschool|Learning Center|Montessori/.test(n))).toBe(true)
  })

  it('keeps English names out of the non-English pools we fixed', () => {
    for (const id of ['br', 'pt', 'mx', 'ar', 'ad', 'at', 'ch', 'dk', 'no', 'se', 'sa', 'ae', 'ma', 'dz', 'tn', 'lb', 'iq']) {
      const pool = COUNTRY_NAME_POOLS[id]
      const english = pool.last.filter((n) => ENGLISH.has(n))
      expect(english, id).toEqual([])
    }
  })
})

describe('offline events play out locally instead of being skipped', () => {
  function setup(id: string, eventId: string, age: number, seed = 1) {
    const g = inCountry(id, seed, { age, education: { current: { level: 'elementary', school: 'Test School', grades: 70, yearsIn: 1, popularity: 50 } as never, degrees: [], completed: [], droppedOut: [], expelled: 0 } })
    const ev = EVENT_LIBRARY.find((e) => e.id === eventId)!
    return { g, s: ev.setup(g) }
  }

  it('turns snow days into flood days, sandstorms and strikes where it never snows', () => {
    expect(setup('id', 'kid.snowDay', 9).s?.title).toBe('Flood Day')
    expect(setup('sa', 'kid.snowDay', 9).s?.title).toBe('Sandstorm Day')
    // Where it snows the day stays a snow day: the title is the event's own and the choices are the snow ones. (The opening text may
    // be one of the scene variants of events/variants.ts, which do not name the weather, so the text is not the proof.)
    const de = setup('de', 'kid.snowDay', 9).s
    expect(de?.title).toBeUndefined()
    expect(de?.choices.map((c) => c.id)).toEqual(['snowman', 'fight', 'sled', 'games'])
  })

  it('swaps the lemonade stand, the prom and the pep rally for local versions', () => {
    const stand = setup('in', 'kid.lemonade', 9).s
    expect(stand?.text).not.toMatch(/lemonade stand/)
    expect(setup('us', 'kid.lemonade', 9).s?.text).toMatch(/lemonade stand/)
    const prom = setup('gb', 'school.prom', 17).s
    expect(prom?.title).toMatch(/Leavers' ball/i)
    expect(setup('jp', 'school.pepRally', 16).s?.title).toBe('Sports Day')
    const scam = setup('de', 'elder.grandparentScam', 70).s
    expect(scam?.text).not.toMatch(/Las Vegas|Tijuana|Cancún/)
  })
})
