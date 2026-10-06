// Era moments: history reaching into a life. The 1918 flu, the Depression costing Dad his job,
// rationing and air raids, the Moon landing on the family TV (or the radio, or the newspaper),
// the Cuban Missile Crisis, Woodstock, the Berlin Wall, Y2K, September 11, the pandemic
// lockdown... Called by history/events.ts yearlyHistory for years before PRESENT_YEAR only, so
// lives in the present are untouched. At most one popup a year (plus a few quiet log lines);
// each moment happens once per character. Tragedies are told with tact: headlines, feelings and
// choices, never graphic detail. Wartime drafts live in special/military.ts.
import { addHidden, addMoney, addStat, endJob, earnIncome, formatMoney, inPrison, log, notice, parents, remember, scriptChoice, spend } from '../core'
import { contractCondition } from '../health'
import { PANDEMIC_COVID, PANDEMIC_FLU, medicalYear } from '../history/events-medicine'
import { homeFrontAt, warDraftAt, warsAt, warStartFor, type WarDef } from '../history/events-wars'
import { hasTech, techOdds } from '../history/timeline'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { ChoiceOption, GameState, Person } from '../types'
import { getCountry } from '../world'

// ---------------------------------------------------------------------------
// Bookkeeping

const DONE = 'history.done'

function doneList(g: GameState): string[] {
  const v = g.flags[DONE]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function isDone(g: GameState, key: string): boolean {
  return doneList(g).includes(key)
}

function markDone(g: GameState, key: string): void {
  const list = doneList(g)
  if (!list.includes(key)) g.flags[DONE] = [...list, key]
}

function at(g: GameState, ...ids: string[]): boolean {
  return ids.includes(g.character.countryId)
}

function inYears(g: GameState, from: number, to = from): boolean {
  return g.year >= from && g.year <= to
}

/** Where a family got its news: the TV, the radio or the newspaper. */
function newsSource(g: GameState): 'tv' | 'radio' | 'paper' {
  if (techOdds(g, 'tv') >= 0.25) return 'tv'
  if (techOdds(g, 'radio') >= 0.25) return 'radio'
  return 'paper'
}

function wealth(g: GameState): number {
  return Math.max(0.25, Math.min(1.5, getCountry(g.character.countryId).wealth))
}

/** "a 1-in-N" chance the RNG rolls; keeps every roll inside historical years. */
function roll(g: GameState, p: number): boolean {
  return chance(g, Math.max(0, Math.min(1, p)))
}

// ---------------------------------------------------------------------------
// Data

/** World Cup winners (country ids). England's win counts for the United Kingdom. */
const WORLD_CUP_WINNERS: Readonly<Record<number, string>> = {
  1930: 'uy', 1934: 'it', 1938: 'it', 1950: 'uy', 1954: 'de', 1958: 'br', 1962: 'br', 1966: 'gb', 1970: 'br', 1974: 'de', 1978: 'ar',
  1982: 'it', 1986: 'ar', 1990: 'de', 1994: 'br', 1998: 'fr', 2002: 'br', 2006: 'it', 2010: 'es', 2014: 'de', 2018: 'fr', 2022: 'ar',
}

/** Wartime rationing of food and clothes. */
const RATIONING: Readonly<Record<string, readonly [number, number]>> = {
  gb: [1940, 1954], de: [1939, 1950], at: [1939, 1950], us: [1942, 1946], fr: [1940, 1949], it: [1940, 1949], nl: [1940, 1949], be: [1940, 1949],
  no: [1940, 1952], dk: [1940, 1948], fi: [1939, 1954], jp: [1941, 1952], ru: [1941, 1947], ua: [1941, 1947], kz: [1941, 1947], ge: [1941, 1947],
  ee: [1941, 1947], pl: [1939, 1949], cz: [1939, 1953], sk: [1939, 1953], hu: [1940, 1951], gr: [1941, 1949], au: [1942, 1950], nz: [1942, 1950], ca: [1942, 1947],
}

/** Years of bombing raids on home soil. */
const AIR_RAIDS: Readonly<Record<string, readonly number[]>> = {
  gb: [1940, 1941, 1944], de: [1942, 1943, 1944, 1945], at: [1944, 1945], jp: [1944, 1945], it: [1943, 1944], fr: [1944], nl: [1944, 1945], be: [1944],
  pl: [1939], cn: [1938, 1939, 1940, 1941], ru: [1941, 1942], ua: [1941, 1942, 1943, 2022, 2023, 2024, 2025], fi: [1939, 1940, 1944], hu: [1944], ro: [1944],
  rs: [1941, 1944, 1999], hr: [1944], gr: [1941], sg: [1942], my: [1942], ph: [1941, 1942], hk: [1941], kr: [1950, 1951], vn: [1965, 1966, 1967, 1968, 1972],
  iq: [1991, 2003], ir: [1985, 1986, 1987, 1988], lb: [1982, 2006, 2024], il: [1991, 2006, 2023, 2024, 2025], sy: [2012, 2013, 2014, 2015, 2016], es: [1937, 1938], eg: [1956],
}

const DEPRESSION_COUNTRIES = ['us', 'ca', 'de', 'gb', 'au', 'nz', 'fr', 'at', 'pl', 'cz', 'ar', 'br', 'cl', 'mx', 'it', 'nl', 'be', 'ie', 'hu', 'ro', 'es', 'se', 'no', 'dk', 'fi', 'jp', 'za', 'uy', 'co', 'pe', 'cu']

const FAMINES: readonly { id: string; countries: readonly string[]; from: number; to: number }[] = [
  { id: 'holodomor', countries: ['ua', 'kz'], from: 1932, to: 1933 },
  { id: 'bengal', countries: ['in', 'bd'], from: 1943, to: 1943 },
  { id: 'hungerwinter', countries: ['nl'], from: 1944, to: 1945 },
  { id: 'leap', countries: ['cn'], from: 1959, to: 1961 },
  { id: 'biafra', countries: ['ng'], from: 1968, to: 1969 },
  { id: 'ethiopia', countries: ['et'], from: 1983, to: 1985 },
]

/** Allies who celebrated the end of a world war in the streets. */
const VICTORY_1918 = ['gb', 'fr', 'us', 'ca', 'au', 'nz', 'it', 'be', 'rs', 'gr', 'pt', 'ro']
const VICTORY_1945 = ['gb', 'us', 'ca', 'au', 'nz', 'fr', 'nl', 'be', 'no', 'dk', 'ru', 'ua', 'kz', 'ge', 'pl', 'cz', 'gr', 'rs', 'ph', 'cn', 'kr', 'za', 'in', 'br', 'mx']

// ---------------------------------------------------------------------------
// Quiet moments: one log line each, no popup

function quietMoments(g: GameState): void {
  const c = g.character
  const id = c.countryId

  const winner = WORLD_CUP_WINNERS[g.year]
  if (winner === id && c.age >= 5 && !isDone(g, `worldcup.${g.year}`)) {
    markDone(g, `worldcup.${g.year}`)
    addStat(g, 'happiness', randInt(g, 3, 6))
    log(g, c.prison ? 'We won the World Cup! The whole cell block went wild.' : pick(g, ['We won the World Cup! I celebrated in the streets until dawn.', 'We won the World Cup! Strangers hugged me in the street.']), 'good')
  }

  // The polio vaccine reached each country in its own year.
  const med = medicalYear(id, g.year)
  if (med >= 1955 && med <= 1963 && c.age >= 1 && c.age <= 14 && !isDone(g, 'polioVaccine')) {
    markDone(g, 'polioVaccine')
    g.flags['history.polioVaccinated'] = true
    log(g, 'I got the new polio vaccine. I was very brave about it (I cried).')
  }

  if (g.year === 1963 && id === 'us' && c.age >= 4 && !isDone(g, 'jfk')) {
    markDone(g, 'jfk')
    addStat(g, 'happiness', -3)
    log(g, "I'll never forget where I was when we heard President Kennedy had been shot.", 'bad')
    remember(g, 'Heard the news that President Kennedy had been assassinated.')
  }

  if (g.year === 1953 && ['gb', 'au', 'nz', 'ca'].includes(id) && c.age >= 3 && !isDone(g, 'coronation')) {
    markDone(g, 'coronation')
    const src = newsSource(g)
    log(g, src === 'tv' ? (techOdds(g, 'tv') < 0.5 ? "We crowded into a neighbor's living room to watch the coronation on their new TV." : 'We watched the coronation on TV with the whole street.') : src === 'radio' ? 'We listened to the coronation on the radio.' : 'We read every word about the coronation in the newspapers.')
  }

  if (g.year === 1990 && id === 'de' && c.age >= 5 && !isDone(g, 'reunification')) {
    markDone(g, 'reunification')
    addStat(g, 'happiness', 3)
    log(g, 'Germany became one country again. My family toasted with sparkling wine.', 'good')
  }

  if (g.year === 1991 && ['ru', 'ua', 'ee', 'ge', 'kz'].includes(id) && c.age >= 6 && !isDone(g, 'ussr')) {
    markDone(g, 'ussr')
    log(g, 'The Soviet Union ceased to exist. The flag on the town hall changed overnight.')
    remember(g, 'Lived through the collapse of the Soviet Union.')
  }

  if (g.year === 1986 && ['pl', 'de', 'at', 'se', 'fi', 'no', 'it', 'hu', 'ro', 'cz', 'sk', 'ru', 'gr', 'ch'].includes(id) && c.age >= 5 && !isDone(g, 'chernobylCloud')) {
    markDone(g, 'chernobylCloud')
    log(g, 'After the Chernobyl disaster, we were told not to eat wild mushrooms or drink fresh milk for a while.')
  }

  if (g.year === 2021 && c.age >= 12 && !isDone(g, 'vaccine2021') && roll(g, 0.8)) {
    markDone(g, 'vaccine2021')
    g.flags['history.covidVaccinated'] = true
    log(g, 'I got my coronavirus vaccine. My arm was sore for a day.')
  }

  for (const f of FAMINES) {
    if (!f.countries.includes(id) || g.year < f.from || g.year > f.to || isDone(g, `famine.${f.id}`)) continue
    markDone(g, `famine.${f.id}`)
    addStat(g, 'health', -randInt(g, 4, 9))
    addStat(g, 'happiness', -randInt(g, 4, 8))
    log(g, 'Food was desperately scarce this year. We got by on very little.', 'bad')
    remember(g, 'Survived a terrible famine.')
  }

  for (const w of warsAt(id, g.year)) {
    const start = warStartFor(w, id)
    if (start === g.year && c.age >= 6 && !isDone(g, `warBegins.${w.id}`)) {
      markDone(g, `warBegins.${w.id}`)
      const src = newsSource(g)
      const talk = `${src === 'tv' ? 'The TV news' : src === 'radio' ? 'The radio' : 'The newspapers'} talked of nothing else.`
      log(g, start > w.from ? `${capFirst(countryThe(id))} entered ${w.name}. ${talk}` : `${capFirst(w.name)} began. ${talk}`, 'bad')
    }
    fatherAtWar(g, w)
  }
  // Fathers come home when their war is over.
  for (const p of parents(g)) {
    const warId = typeof p.data.atWar === 'string' ? p.data.atWar : ''
    if (!warId) continue
    if (warsAt(id, g.year).some((w) => w.id === warId)) continue
    delete p.data.atWar
    p.livesWithPlayer = p.data.homeBeforeWar === true || p.livesWithPlayer
    delete p.data.homeBeforeWar
    log(g, `My ${p.gender === 'male' ? 'father' : 'mother'} came home from the war.`, 'good')
    addStat(g, 'happiness', randInt(g, 4, 8))
  }
}

/** "the United States", "the Netherlands", "France". */
function countryThe(id: string): string {
  const name = getCountry(id).name
  return /^(United|Republic|Netherlands|Philippines|Czech|Dominican|Bahamas)\b/.test(name) ? `the ${name}` : name
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** A child's father may be called up (flavor: he comes home when the war ends). */
function fatherAtWar(g: GameState, w: WarDef): void {
  const c = g.character
  if (c.age >= 18 || isDone(g, `fatherWar.${w.id}`)) return
  const draft = warDraftAt(c.countryId, g.year)
  if (!draft || draft.war.id !== w.id) return
  const dad = parents(g).find((p) => p.gender === 'male' && p.relation === 'parent' && p.age >= draft.rule.minAge && p.age <= draft.rule.maxAge && typeof p.data.atWar !== 'string')
  markDone(g, `fatherWar.${w.id}`)
  if (!dad || !roll(g, draft.rule.odds * 0.8)) return
  dad.data.atWar = w.id
  dad.data.homeBeforeWar = dad.livesWithPlayer
  dad.livesWithPlayer = false
  notePerson(dad, `Served in ${w.name}.`)
  log(g, `My father was called up to fight in ${w.name}.`, 'bad')
  addStat(g, 'happiness', -randInt(g, 3, 7))
}

// ---------------------------------------------------------------------------
// Popups (at most one a year)

interface Moment {
  key: string
  /** Asks the player to choose (at most one of these a year). */
  choice?: boolean
  /** Eligible this year (pure: no RNG). */
  when: (g: GameState) => boolean
  /** Chance it actually happens in an eligible year (default 1). */
  odds?: number
  run: (g: GameState) => void
}

const MOMENTS: readonly Moment[] = [
  // --- Pandemics ---
  {
    key: 'flu1918',
    choice: true,
    when: (g) => inYears(g, 1918, 1919),
    odds: 0.7,
    run: (g) => {
      if (g.character.age < 12 || inPrison(g)) {
        notice(
          g,
          'The Flu',
          inPrison(g)
            ? 'A deadly flu is tearing through the prison. Guards wear gauze masks and the infirmary is overflowing.'
            : 'A deadly flu is sweeping the world. Schools, churches and theaters have closed, and your parents make you wear a gauze mask whenever you go outside.',
          { emoji: '\u{1F637}', tone: 'bad' },
        )
        log(g, 'A deadly flu swept the world. We wore gauze masks everywhere.', 'bad')
        if (roll(g, 0.2)) contractCondition(g, PANDEMIC_FLU)
        return
      }
      scriptChoice(
        g,
        FLU,
        'The Flu',
        "A deadly flu is sweeping the world, and it's hitting young, healthy adults hardest. Theaters and schools are closed. What will you do?",
        [
          { id: 'mask', label: 'Wear a gauze mask', emoji: '\u{1F637}' },
          { id: 'home', label: 'Stay home and avoid crowds', emoji: '\u{1F3E0}' },
          { id: 'carry', label: 'Carry on as normal', emoji: '\u{1F6B6}' },
        ],
        { emoji: '\u{1F637}' },
      )
    },
  },
  {
    key: 'covid2020',
    choice: true,
    when: (g) => g.year === 2020,
    run: (g) => {
      const c = g.character
      if (c.age < 13 || inPrison(g)) {
        notice(
          g,
          'Lockdown',
          inPrison(g)
            ? 'A coronavirus pandemic has locked the prison down. Visits are canceled and everyone eats in their cells.'
            : c.age < 5
              ? 'A coronavirus pandemic shut the world down. Your whole family stayed home all year, which suited you just fine.'
              : 'A coronavirus pandemic closed your school. Lessons moved to the kitchen table, and you only saw your friends from a distance.',
          { emoji: '\u{1F637}', tone: 'bad' },
        )
        log(g, 'A pandemic shut the world down. We stayed home for months.', 'bad')
        addStat(g, 'happiness', -3)
        if (roll(g, 0.08)) contractCondition(g, PANDEMIC_COVID)
        return
      }
      scriptChoice(
        g,
        COVID,
        'Lockdown',
        'A coronavirus pandemic has shut the world down: shops are closed, streets are empty and everyone is told to stay home. What will you do?',
        [
          { id: 'rules', label: 'Follow the lockdown rules', emoji: '\u{1F3E0}' },
          { id: 'bread', label: 'Bake bread and learn a hobby', emoji: '\u{1F35E}' },
          { id: 'sneak', label: 'Sneak out to see friends', emoji: '\u{1F389}' },
        ],
        { emoji: '\u{1F637}' },
      )
    },
  },
  // --- Big moments at home ---
  {
    key: 'partition',
    when: (g) => g.year === 1947 && at(g, 'in', 'pk', 'bd') && g.character.age >= 4 && !inPrison(g),
    run: (g) => {
      notice(g, 'Partition', 'Independence came with Partition. Millions of families were forced from their homes to cross the new border, and yours took in relatives who had lost everything.', { emoji: '\u{1F682}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      addHidden(g, 'karma', 2)
      log(g, 'Partition split the country. We took in relatives who had lost everything.', 'bad')
      remember(g, 'Lived through Partition.')
    },
  },
  {
    key: 'korea1950',
    when: (g) => g.year === 1950 && at(g, 'kr') && !inPrison(g),
    run: (g) => {
      notice(g, 'War', 'War broke out. Your family packed what it could carry and joined the crowds heading south.', { emoji: '\u{1F6B6}', tone: 'bad' })
      addStat(g, 'happiness', -8)
      log(g, 'War broke out and my family fled south with what we could carry.', 'bad')
      remember(g, 'Fled south when the Korean War began.')
    },
  },
  {
    key: 'invasion2022',
    when: (g) => g.year === 2022 && at(g, 'ua') && g.character.age >= 3 && !inPrison(g),
    run: (g) => {
      notice(
        g,
        'Invasion',
        'Air raid sirens woke the whole country before dawn: a full-scale invasion had begun. Your family filled the bathtub with water, packed go-bags and worked out which hallway was safest.',
        { emoji: '\u{1F6A8}', tone: 'bad' },
      )
      addStat(g, 'happiness', -10)
      log(g, 'Russia invaded. We woke to air raid sirens.', 'bad')
      remember(g, 'Woke to air raid sirens when the full-scale invasion began.')
    },
  },
  {
    key: 'sept11',
    when: (g) => g.year === 2001 && at(g, 'us') && g.character.age >= 5,
    run: (g) => {
      notice(g, 'September 11', 'Terrorist attacks on New York and Washington killed nearly 3,000 people and left the country in shock. You will always remember where you were when you heard.', { emoji: '\u{1F56F}\u{FE0F}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      log(g, 'I will never forget the morning of September 11th.', 'bad')
      remember(g, 'Lived through the September 11 attacks.')
    },
  },
  {
    key: 'tsunami2004',
    when: (g) => g.year === 2004 && at(g, 'id', 'th', 'in') && g.character.age >= 3 && !inPrison(g),
    run: (g) => {
      notice(g, 'Tsunami', 'A massive tsunami struck the coasts of the Indian Ocean the day after Christmas. Your family was safe, but the whole country is grieving and helping the survivors.', { emoji: '\u{1F30A}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      addHidden(g, 'karma', 2)
      log(g, 'A tsunami devastated the coast. We helped collect food and clothes for the survivors.', 'bad')
    },
  },
  {
    key: 'tohoku2011',
    when: (g) => g.year === 2011 && at(g, 'jp') && g.character.age >= 3 && !inPrison(g),
    run: (g) => {
      notice(g, 'The Great Earthquake', 'The ground shook for six terrifying minutes. Then a tsunami struck the northeast coast and a nuclear plant began to fail. Your family was safe, but nobody will forget March 11.', { emoji: '\u{1F30A}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      log(g, 'The great earthquake and tsunami struck. My family was safe.', 'bad')
      remember(g, 'Lived through the 2011 earthquake and tsunami.')
    },
  },
  {
    key: 'chernobyl',
    when: (g) => g.year === 1986 && at(g, 'ua') && g.character.age >= 3 && !inPrison(g),
    run: (g) => {
      notice(
        g,
        'Chernobyl',
        'A reactor exploded at the Chernobyl nuclear plant. Officials said very little at first. Then buses came to evacuate the towns nearby, and everyone else was told to keep their windows shut.',
        { emoji: '\u{2622}\u{FE0F}', tone: 'bad' },
      )
      addStat(g, 'happiness', -6)
      addStat(g, 'health', -randInt(g, 0, 3))
      log(g, 'The Chernobyl reactor exploded. We kept the windows shut for weeks.', 'bad')
      remember(g, 'Lived through the Chernobyl disaster.')
    },
  },
  {
    key: 'berlinWall',
    choice: true,
    when: (g) => g.year === 1989 && at(g, 'de') && g.character.age >= 8 && !inPrison(g),
    run: (g) => {
      const choices: ChoiceOption[] = [
        { id: 'chip', label: 'Chip off a piece of the Wall', emoji: '\u{1F528}', ...hintOf(talentHint(g, 'Business', 'Collectors and tourists will pay good money for a genuine chunk of the Wall.')) },
        { id: 'party', label: 'Party with strangers in the street', emoji: '\u{1F389}' },
        { id: 'watch', label: 'Watch it all on TV', emoji: '\u{1F4FA}' },
      ]
      scriptChoice(g, WALL, 'The Wall Is Open!', "The border guards have opened the gates: the Berlin Wall has fallen! Crowds are dancing on top of it. What will you do?", choices, { emoji: '\u{1F9F1}' })
    },
  },
  {
    key: 'freedomDay',
    when: (g) => g.year === 1994 && at(g, 'za') && g.character.age >= 18 && !inPrison(g),
    run: (g) => {
      notice(g, 'Freedom Day', "You stood in a line that stretched for miles to vote in South Africa's first free election. Nobody minded the wait.", { emoji: '\u{1F5F3}\u{FE0F}', tone: 'good' })
      addStat(g, 'happiness', 6)
      log(g, "I voted in South Africa's first free election.", 'good')
      remember(g, "Voted in South Africa's first free election.")
    },
  },
  {
    key: 'moon',
    when: (g) => g.year === 1969 && g.character.age >= 3,
    run: (g) => {
      const src = inPrison(g) ? 'prison' : newsSource(g)
      const neighbor = src === 'tv' && techOdds(g, 'tv') < 0.5
      const text =
        src === 'prison'
          ? 'The whole cell block crowded around a flickering set in the rec room to watch a man step onto the Moon. Even the guards cheered.'
          : src === 'tv'
            ? neighbor
              ? "Half the street squeezed into a neighbor's living room to watch grainy pictures of a man stepping onto the Moon. Everyone held their breath."
              : 'Your family stayed up late to watch grainy pictures of a man stepping onto the Moon on TV. Everyone held their breath.'
            : src === 'radio'
              ? 'Your family huddled around the radio as an astronaut stepped onto the Moon. You tried to picture it in your head.'
              : 'You read in the newspaper that a man has walked on the Moon. The old folks in town refuse to believe it.'
      notice(g, 'One Small Step', text, { emoji: '\u{1F315}', tone: 'good' })
      addStat(g, 'happiness', 3)
      addStat(g, 'smarts', 1)
      log(g, src === 'paper' ? 'I read that a man walked on the Moon.' : src === 'radio' ? 'I heard a man walk on the Moon over the radio.' : 'I watched a man walk on the Moon.', 'good')
      remember(g, 'Lived through the first Moon landing.')
    },
  },
  {
    key: 'cuba1962',
    choice: true,
    when: (g) => g.year === 1962 && at(g, 'us', 'cu', 'ru') && g.character.age >= 5 && !inPrison(g),
    run: (g) => {
      const c = g.character
      if (c.age < 18) {
        notice(g, 'Duck and Cover', 'With missiles pointed at each other across the sea, your school practiced hiding under the desks in case of an attack. Even you could tell the desk would not help much.', { emoji: '\u{1F3EB}', tone: 'bad' })
        addStat(g, 'happiness', -2)
        log(g, 'We practiced duck-and-cover drills at school during the missile crisis.')
        return
      }
      scriptChoice(
        g,
        CUBA,
        'Missile Crisis',
        'The world is on the brink of nuclear war over missiles in Cuba. Neighbors are hoarding canned food and talking about backyard bomb shelters. What will you do?',
        [
          { id: 'shelter', label: 'Build a fallout shelter', emoji: '\u{1F3D7}\u{FE0F}' },
          { id: 'cans', label: 'Stock up on canned food', emoji: '\u{1F96B}' },
          { id: 'calm', label: 'Keep calm and carry on', emoji: '\u{1F9D8}' },
        ],
        { emoji: '\u{1F680}' },
      )
    },
  },
  {
    key: 'woodstock',
    choice: true,
    when: (g) => g.year === 1969 && at(g, 'us') && g.character.age >= 16 && g.character.age <= 27 && !inPrison(g),
    odds: 0.35,
    run: (g) => {
      scriptChoice(
        g,
        WOODSTOCK,
        'Three Days of Music',
        'Everyone is talking about a huge music festival on a dairy farm in upstate New York. Half a million people are expected. Will you go?',
        [
          { id: 'go', label: 'Hitchhike to the festival', emoji: '\u{1F3B8}' },
          { id: 'stay', label: 'Stay home', emoji: '\u{1F3E0}' },
        ],
        { emoji: '\u{1F3B6}' },
      )
    },
  },
  // --- The world wars at home ---
  {
    key: 'victory1918',
    when: (g) => g.year === 1918 && VICTORY_1918.includes(g.character.countryId) && g.character.age >= 4,
    run: (g) => victory(g, 'Armistice', 'At the eleventh hour of the eleventh day of the eleventh month the guns fell silent. Church bells rang, crowds filled the streets and your family wept with relief: the war is over!'),
  },
  {
    key: 'victory1945',
    when: (g) => g.year === 1945 && VICTORY_1945.includes(g.character.countryId) && g.character.age >= 4,
    run: (g) => victory(g, 'The War Is Over!', 'Church bells rang, strangers kissed in the streets and your family danced until dawn: the war is over!'),
  },
  {
    key: 'evacuation',
    when: (g) => inYears(g, 1939, 1940) && at(g, 'gb') && g.character.age >= 4 && g.character.age <= 14,
    run: (g) => {
      notice(g, 'Evacuated', 'With bombing raids expected, you were sent away from the city to live with strangers in the countryside, a gas mask in a box and a name tag pinned to your coat.', { emoji: '\u{1F9F3}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      log(g, 'I was evacuated to the countryside to live with strangers.', 'bad')
      remember(g, 'Evacuated to the countryside during the war.')
    },
  },
  {
    key: 'raid',
    choice: true,
    when: (g) => (AIR_RAIDS[g.character.countryId] ?? []).includes(g.year) && !inPrison(g) && raidCooldown(g),
    odds: 0.45,
    run: (g) => {
      g.flags['history.raidYear'] = g.year
      if (g.character.age < 10) {
        notice(g, 'Air Raid', 'Air raid sirens wailed in the night. Your family spent hours in a crowded shelter, singing songs to drown out the noise.', { emoji: '\u{1F6A8}', tone: 'bad' })
        addStat(g, 'happiness', -3)
        log(g, 'We spent a night in an air raid shelter.', 'bad')
        return
      }
      scriptChoice(
        g,
        RAID,
        'Air Raid',
        `Air raid sirens are wailing across ${g.character.city}. What will you do?`,
        [
          { id: 'shelter', label: 'Run to the shelter', emoji: '\u{1F3C3}' },
          { id: 'stairs', label: 'Hide under the stairs', emoji: '\u{1FA9C}' },
          { id: 'bed', label: 'Stay in bed and hope', emoji: '\u{1F6CF}\u{FE0F}' },
        ],
        { emoji: '\u{1F6A8}' },
      )
    },
  },
  {
    key: 'warWork',
    choice: true,
    when: (g) => {
      const c = g.character
      if (c.gender !== 'female' || c.age < 18 || c.age > 40 || inPrison(g) || !inYears(g, 1941, 1945)) return false
      const war = warsAt(c.countryId, g.year).find((w) => w.id === 'ww2')
      return !!war && !!war.draft?.[c.countryId]
    },
    odds: 0.6,
    run: (g) => {
      scriptChoice(
        g,
        WAR_WORK,
        'The War Effort',
        'With so many men away at war, factories and farms are crying out for workers. What will you do?',
        [
          { id: 'factory', label: 'Build planes in a factory', emoji: '\u{1F3ED}' },
          { id: 'farm', label: 'Work the fields on a farm', emoji: '\u{1F69C}' },
          { id: 'nurse', label: 'Volunteer as a nurse', emoji: '\u{1FA7A}' },
          { id: 'home', label: 'Keep the home fires burning', emoji: '\u{1F3E0}' },
        ],
        { emoji: '\u{1F4AA}' },
      )
    },
  },
  {
    key: 'rationing',
    when: (g) => {
      const r = RATIONING[g.character.countryId]
      return !!r && inYears(g, r[0], r[1]) && g.character.age >= 4
    },
    run: (g) => {
      notice(g, 'Rationing', inPrison(g) ? 'Rationing has reached the prison kitchen. The stew is now mostly water, with rumors of potato.' : 'Sugar, meat, butter and even clothes are rationed now. You got a ration book and learned to love powdered eggs.', { emoji: '\u{1F96B}' })
      addStat(g, 'happiness', -2)
      log(g, 'Food was rationed. I learned to love powdered eggs.')
    },
  },
  {
    key: 'homefront',
    when: (g) => homeFrontWar(g) !== null && g.character.age >= 4 && !inPrison(g),
    odds: 0.5,
    run: (g) => {
      const w = homeFrontWar(g)
      if (!w) return
      markDone(g, `homefront.${w.id}`)
      notice(g, 'War at Home', `${capFirst(w.name)} reached your doorstep. Your family kept its head down, stretched every meal and waited anxiously for news of loved ones.`, { emoji: '\u{26A0}\u{FE0F}', tone: 'bad' })
      addStat(g, 'happiness', -6)
      log(g, `${capFirst(w.name)} came to our doorstep.`, 'bad')
      remember(g, `Lived through ${w.name} at home.`)
    },
  },
  // --- Economy ---
  {
    key: 'depression',
    when: (g) => inYears(g, 1930, 1933) && DEPRESSION_COUNTRIES.includes(g.character.countryId) && !inPrison(g) && depressionVictim(g) !== null,
    odds: 0.3,
    run: (g) => depression(g),
  },
  {
    key: 'oilCrisis',
    when: (g) => inYears(g, 1973, 1974) && at(g, 'us', 'de', 'nl', 'gb', 'jp', 'fr', 'dk') && g.character.age >= 18 && g.character.licenses.includes('driver') && !inPrison(g),
    run: (g) => {
      notice(g, 'Gas Lines', 'The oil crisis hit: you waited in a mile-long line for gasoline, and the government asked everyone to leave the car at home on Sundays.', { emoji: '\u{26FD}', tone: 'bad' })
      addStat(g, 'happiness', -2)
      log(g, 'I waited in a mile-long line for gas during the oil crisis.')
    },
  },
  {
    key: 'y2k',
    choice: true,
    when: (g) => g.year === 1999 && g.character.age >= 16 && hasTech(g, 'homeComputer') && !inPrison(g),
    run: (g) => {
      scriptChoice(
        g,
        Y2K,
        'Y2K',
        "Experts warn that when the clocks hit the year 2000, old computers will think it's 1900 and the world's systems might crash. What will you do?",
        [
          { id: 'stockpile', label: 'Stockpile canned food and water', emoji: '\u{1F96B}' },
          { id: 'cash', label: 'Withdraw all my savings', emoji: '\u{1F4B5}', ...hintOf(talentHint(g, 'Investing', 'Your gut says the banks will be just fine.')) },
          { id: 'party', label: "Party like it's 1999", emoji: '\u{1F973}' },
        ],
        { emoji: '\u{1F4BE}' },
      )
    },
  },
]

function hintOf(text: string): { hint?: string } {
  return text ? { hint: text } : {}
}

function raidCooldown(g: GameState): boolean {
  const last = g.flags['history.raidYear']
  return typeof last !== 'number' || g.year - last >= 3 || last > g.year
}

/** A war fought on home soil that hasn't had its "war at home" moment (the world wars have their own). */
function homeFrontWar(g: GameState): WarDef | null {
  for (const w of warsAt(g.character.countryId, g.year)) {
    if (w.id === 'ww1' || w.id === 'ww2' || w.id === 'korea' || w.id === 'ukraine') continue
    if (homeFrontAt(w, g.character.countryId) && !isDone(g, `homefront.${w.id}`)) return w
  }
  return null
}

function victory(g: GameState, title: string, text: string): void {
  notice(g, title, inPrison(g) ? 'News reached the prison that the war is over. The cell block erupted in cheers.' : text, { emoji: '\u{1F389}', tone: 'good' })
  addStat(g, 'happiness', randInt(g, 6, 10))
  log(g, 'The war ended! We celebrated in the streets.', 'good')
  remember(g, `Celebrated the end of the war in ${g.year}.`)
}

/** Who the Depression hits: the player's job, or a working parent's. */
function depressionVictim(g: GameState): 'me' | Person | null {
  const c = g.character
  if (c.job && c.job.category !== 'military' && c.age >= 16) return 'me'
  if (c.age < 4 || c.age >= 18 || isDone(g, 'depressionParent')) return null
  return parents(g).find((p) => p.livesWithPlayer && !['Unemployed', 'Retired', 'None', 'Homemaker', 'Student'].includes(p.occupation)) ?? null
}

function depression(g: GameState): void {
  const c = g.character
  const victim = depressionVictim(g)
  if (victim === 'me' && c.job) {
    const company = c.job.company
    endJob(g, 'job', 'laid off')
    addStat(g, 'happiness', -randInt(g, 6, 10))
    notice(g, 'Laid Off', `The Depression finally reached ${company}. Half the staff was let go, and you were one of them.`, { emoji: '\u{1F4C9}', tone: 'bad' })
    log(g, `I was laid off from ${company} in the Depression.`, 'bad')
    remember(g, 'Lost my job in the Great Depression.')
    return
  }
  if (victim && victim !== 'me') {
    markDone(g, 'depressionParent')
    const word = victim.gender === 'male' ? 'father' : 'mother'
    const pron = victim.gender === 'male' ? 'his' : 'her'
    const job = victim.occupation
    victim.occupation = 'Unemployed'
    victim.money = Math.round(victim.money * 0.4)
    notePerson(victim, 'Lost their job in the Great Depression.')
    addStat(g, 'happiness', -5)
    notice(g, 'Hard Times', `Your ${word} lost ${pron} job as ${/^[aeiou]/i.test(job) ? 'an' : 'a'} ${job} in the Depression. Dinners got smaller, and you learned to patch your own clothes.`, { emoji: '\u{1F35E}', tone: 'bad' })
    log(g, `My ${word} lost ${pron} job in the Depression.`, 'bad')
  }
}

// ---------------------------------------------------------------------------
// Scripts

function infect(g: GameState, disease: string, p: number): boolean {
  if (!roll(g, p)) return false
  const age = g.character.age
  // The coronavirus was far more dangerous for the old.
  const severity = disease === PANDEMIC_COVID ? (age >= 70 ? randInt(g, 30, 45) : age >= 50 ? randInt(g, 15, 30) : undefined) : undefined
  return contractCondition(g, disease, severity !== undefined ? { severity } : {}) !== null
}

const FLU = defineScript('history.flu', (g, choice) => {
  if (!g.character.alive) return
  const p = choice === 'mask' ? 0.15 : choice === 'home' ? 0.08 : 0.35
  if (choice === 'home') addStat(g, 'happiness', -3)
  if (choice === 'carry') addStat(g, 'happiness', 2)
  if (infect(g, PANDEMIC_FLU, p)) {
    log(g, 'I caught the deadly flu.', 'bad')
    return
  }
  const text =
    choice === 'mask'
      ? 'You wore your gauze mask everywhere, looked ridiculous and stayed healthy.'
      : choice === 'home'
        ? 'You stayed home all season, went slightly stir-crazy and stayed healthy.'
        : 'You carried on as normal and somehow dodged the flu. Plenty of people you knew were not so lucky.'
  notice(g, 'Flu Season', text, { emoji: '\u{1F637}' })
  log(g, 'I made it through the great flu pandemic.', 'good')
  remember(g, 'Survived the 1918 flu pandemic.')
})

const COVID = defineScript('history.covid', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'rules') {
    addStat(g, 'happiness', -4)
    notice(g, 'Lockdown', 'You followed every rule, washed your hands raw and talked to your houseplants. It was a long year.', { emoji: '\u{1F3E0}' })
    log(g, 'I stayed home and followed the lockdown rules.')
    infect(g, PANDEMIC_COVID, 0.05)
    return
  }
  if (choice === 'bread') {
    addStat(g, 'happiness', 2)
    addStat(g, 'smarts', 1)
    notice(g, 'Lockdown', 'You baked so much sourdough bread that your neighbors started hiding from you. You also learned the ukulele. Badly.', { emoji: '\u{1F35E}', tone: 'good' })
    log(g, 'I learned to bake bread during lockdown.')
    infect(g, PANDEMIC_COVID, 0.05)
    return
  }
  addStat(g, 'happiness', 4)
  addHidden(g, 'karma', -2)
  if (infect(g, PANDEMIC_COVID, 0.4)) {
    log(g, 'I snuck out to see friends during lockdown and caught the virus.', 'bad')
    return
  }
  notice(g, 'Lockdown', 'You snuck out to see your friends. It was the best night of the year, and you got away with it. This time.', { emoji: '\u{1F389}' })
  log(g, 'I snuck out to see friends during lockdown.')
})

const WALL = defineScript('history.berlinWall', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'chip') {
    addStat(g, 'happiness', 8)
    if (hasTalent(g, 'Business')) {
      const cash = Math.round(randInt(g, 300, 1500) * wealth(g))
      addMoney(g, cash)
      notice(g, 'A Piece of History', `You chipped off a bag of genuine Berlin Wall and sold most of it to tourists for ${formatMoney(cash)}. You kept the best piece for yourself.`, { emoji: '\u{1F528}', tone: 'good' })
      log(g, `I chipped off pieces of the Berlin Wall and sold them for ${formatMoney(cash)}.`, 'good')
    } else {
      notice(g, 'A Piece of History', 'You hammered at the Wall until your arms ached and went home with a chunk of history in your pocket.', { emoji: '\u{1F528}', tone: 'good' })
      log(g, 'I chipped off a piece of the Berlin Wall.', 'good')
    }
    remember(g, 'Took a hammer to the Berlin Wall the night it fell.')
    return
  }
  if (choice === 'party') {
    addStat(g, 'happiness', 10)
    notice(g, 'Freedom!', 'You danced on the street with people from the other side of the Wall until sunrise. Somebody handed you a bottle of sparkling wine and you never found out who.', { emoji: '\u{1F389}', tone: 'good' })
    log(g, 'I partied in the street the night the Berlin Wall fell.', 'good')
    remember(g, 'Celebrated the fall of the Berlin Wall in the street.')
    return
  }
  addStat(g, 'happiness', 5)
  notice(g, 'History on TV', 'You watched the crowds pour through the border on TV and cried happy tears into your dinner.', { emoji: '\u{1F4FA}', tone: 'good' })
  log(g, 'I watched the Berlin Wall fall on TV.', 'good')
})

const CUBA = defineScript('history.cuba', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'shelter') {
    const cost = Math.round(3000 * wealth(g))
    if (spend(g, cost)) {
      addStat(g, 'happiness', -1)
      notice(g, 'Fallout Shelter', `You spent ${formatMoney(cost)} on a concrete shelter in the backyard. Thirteen days later the crisis was over. It makes an excellent root cellar.`, { emoji: '\u{1F3D7}\u{FE0F}' })
      log(g, 'I built a fallout shelter during the Cuban Missile Crisis.')
      return
    }
    notice(g, 'Fallout Shelter', "You couldn't afford a fallout shelter, so you dug a hole in the backyard. The crisis passed; the hole is now a pond.", { emoji: '\u{1F573}\u{FE0F}' })
    log(g, 'I dug a very amateur bomb shelter in the backyard.')
    return
  }
  if (choice === 'cans') {
    spend(g, Math.min(Math.max(0, g.character.money), Math.round(150 * wealth(g))))
    addStat(g, 'happiness', 1)
    notice(g, 'Canned Food', 'You filled the basement with canned beans and peaches. The world survived, and you ate beans until spring.', { emoji: '\u{1F96B}' })
    log(g, 'I stocked up on canned food during the missile crisis.')
    return
  }
  addStat(g, 'happiness', -2)
  notice(g, 'Keep Calm', 'You kept calm and carried on, though you did lie awake a few nights listening for sirens. After thirteen days, the crisis was over.', { emoji: '\u{1F9D8}' })
  log(g, 'I kept calm during the Cuban Missile Crisis.')
})

const WOODSTOCK = defineScript('history.woodstock', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'go') {
    addStat(g, 'happiness', 10)
    addStat(g, 'health', -randInt(g, 0, 4))
    notice(g, 'Peace and Music', 'You spent three days in the mud with half a million strangers. The music was legendary, the toilets were not, and you came home a changed person.', { emoji: '\u{1F3B8}', tone: 'good' })
    log(g, 'I went to the Woodstock music festival.', 'good')
    remember(g, 'Was at Woodstock in 1969.')
    return
  }
  addStat(g, 'happiness', -1)
  notice(g, 'Stayed Home', 'You stayed home. You will hear about it for the next fifty years.', { emoji: '\u{1F3E0}' })
  log(g, 'I skipped the big music festival at Woodstock.')
})

const RAID = defineScript('history.raid', (g, choice) => {
  if (!g.character.alive) return
  const safe = choice === 'shelter' ? 0.95 : choice === 'stairs' ? 0.85 : 0.7
  if (roll(g, safe)) {
    addStat(g, 'happiness', -2)
    notice(g, 'All Clear', choice === 'bed' ? 'You stayed in bed and listened to the rumble overhead. By morning it was over, and somehow your street was untouched.' : 'You waited it out until the all-clear sounded and climbed out, shaken but unhurt.', { emoji: '\u{1F54A}\u{FE0F}' })
    log(g, 'I survived an air raid.')
    return
  }
  addStat(g, 'happiness', -6)
  contractCondition(g, 'Blast Injuries', { kind: 'injury', severity: randInt(g, 12, 28), diagnosed: true, quiet: true })
  notice(g, 'Hit', 'A bomb landed nearby and the blast threw you across the room. You were pulled from the rubble with cuts and bruises, lucky to be alive.', { emoji: '\u{1F4A5}', tone: 'bad' })
  log(g, 'I was hurt in an air raid.', 'bad')
  remember(g, 'Was injured in an air raid.')
})

const WAR_WORK = defineScript('history.warWork', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'factory') {
    const pay = Math.round(14_000 * wealth(g))
    earnIncome(g, pay)
    addStat(g, 'smarts', 2)
    addStat(g, 'happiness', 2)
    notice(g, 'Factory Work', `You learned to rivet, weld and swear like a sailor, and earned ${formatMoney(pay)} doing it.`, { emoji: '\u{1F3ED}', tone: 'good' })
    log(g, 'I worked in a war factory building planes.', 'good')
    remember(g, 'Built planes in a factory during the war.')
    return
  }
  if (choice === 'farm') {
    addStat(g, 'health', 4)
    addStat(g, 'happiness', -1)
    notice(g, 'Farm Work', 'You traded the city for muddy boots, early mornings and very opinionated cows. You have never been fitter.', { emoji: '\u{1F69C}' })
    log(g, 'I worked on a farm for the war effort.')
    return
  }
  if (choice === 'nurse') {
    addHidden(g, 'karma', 5)
    addStat(g, 'happiness', 3)
    notice(g, 'Volunteer Nurse', 'You rolled bandages, changed dressings and held the hands of wounded soldiers. Hard work, and the most important thing you have ever done.', { emoji: '\u{1FA7A}', tone: 'good' })
    log(g, 'I volunteered as a nurse during the war.', 'good')
    remember(g, 'Volunteered as a nurse in the war.')
    return
  }
  addStat(g, 'happiness', 1)
  notice(g, 'The Home Front', 'You kept the household running on ration books, knitted socks for the troops and planted vegetables where the flower beds used to be.', { emoji: '\u{1F3E0}' })
  log(g, 'I kept the home running during the war.')
})

const Y2K = defineScript('history.y2k', (g, choice) => {
  if (!g.character.alive) return
  if (choice === 'stockpile') {
    spend(g, Math.min(Math.max(0, g.character.money), Math.round(250 * wealth(g))))
    addStat(g, 'happiness', -1)
    notice(g, 'Y2K', 'Midnight came and went. Nothing happened. You will be eating canned beans until 2003.', { emoji: '\u{1F96B}' })
    log(g, 'I stockpiled food for the Y2K bug. Nothing happened.')
    return
  }
  if (choice === 'cash') {
    notice(g, 'Y2K', 'You withdrew your savings and hid them in the freezer. On January 1st the banks were fine, so you put it all back, slightly frostbitten.', { emoji: '\u{1F4B5}' })
    log(g, 'I hid my savings in the freezer for Y2K.')
    return
  }
  addStat(g, 'happiness', 6)
  addStat(g, 'health', -2)
  notice(g, 'Happy New Millennium!', "You partied like it was 1999, because it was. The world didn't end, but your hangover tried its best.", { emoji: '\u{1F973}', tone: 'good' })
  log(g, 'I partied my way into the new millennium.', 'good')
})

// ---------------------------------------------------------------------------
// Entry point

/** Popups a year at most (and at most one of them asks for a choice). */
const MAX_POPUPS = 2

/** Era moments for this (historical) year: quiet log lines plus a popup or two. */
export function eraMoments(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  quietMoments(g)
  if (!c.alive) return
  // Never stack on top of a decision the player hasn't made yet.
  let choiceShown = g.queue.some((m) => m.kind === 'choice' || m.kind === 'input' || m.kind === 'minigame')
  let shown = 0
  for (const m of MOMENTS) {
    if (shown >= MAX_POPUPS || !c.alive) return
    if ((m.choice && choiceShown) || isDone(g, m.key) || !m.when(g)) continue
    if (m.odds !== undefined && m.odds < 1 && !roll(g, m.odds)) continue
    // Air raids, the Depression and wars at home can come back; everything else happens once.
    if (m.key !== 'homefront' && m.key !== 'raid' && m.key !== 'depression') markDone(g, m.key)
    m.run(g)
    shown++
    if (m.choice) choiceShown = true
  }
}

/** For tests and tools: the keys of every era popup. */
export const ERA_MOMENT_KEYS: readonly string[] = MOMENTS.map((m) => m.key)
