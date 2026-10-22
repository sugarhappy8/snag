// Special career: Musician. Master an instrument (Mind & Body lessons), then go solo with a
// record label or join a band. Record albums and singles (one release per year), play concerts,
// go on world tours, earn certifications and awards, and collect royalties forever.
import { addHidden, addRelationship, addStat, count, earnIncome, fullName, getPerson, log, remember, scriptChoice, scriptInput, useYearAction } from '../core'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { RESIGN_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import { defineScript } from '../scripts'
import { crowdedField } from '../mastery'
import { musicMastersMenu, yearlyMusicRights } from './music-rights'
import { CERTS, GENRES, RELEASE_TYPES, genresAt, subgenresAt } from './music-data'
import { type RosterEntry, cooled, endDeal, labelNamed, labelsAt, offerDeal } from './music-label'
import { bookRelease } from './music-market'
import { musicNodes } from './music-menu'
import { musicStore } from './music-state'
import { tourAction } from './music-tour'
import { careerCtx, emitBooks } from './kit/year'
import {
  type ContractOffer,
  type MusicProfile,
  type Release,
  artistName,
  effectiveSkill,
  md,
  mdView,
  musicJob,
  musicProfile,
  musicTalent,
  removeBand,
  signDeal,
  trendingSubgenre,
  viewMusic,
} from './music-job'
import { talentHint, talentMult } from '../talents'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  addColleague,
  addFame,
  blocked,
  clamp100,
  claimYearly,
  cleanName,
  compact,
  fameOf,
  fameToward,
  hire,
  instrumentSkill,
  leave,
  masterInstrument,
  money,
  peek,
  quitNote,
  say,
  setInstrumentSkill,
  short,
  syncTenure,
  withHint,
  tell,
} from './common'

export { musicJob } from './music-job'

// ---------------------------------------------------------------------------
// Data

const SOLO_INSTRUMENTS = ['Voice', 'Guitar', 'Bass Guitar', 'Keyboard', 'Piano', 'Saxophone', 'Violin', 'Cello']
const BAND_INSTRUMENTS = ['Voice', 'Guitar', 'Bass Guitar', 'Keyboard', 'Drums']
const BAND_ROLE: Record<string, string> = { Voice: 'Lead Singer', Guitar: 'Guitarist', 'Bass Guitar': 'Bassist', Keyboard: 'Keyboardist', Drums: 'Drummer' }
const INSTRUMENT_EMOJI: Record<string, string> = {
  Voice: '\u{1F3A4}',
  Guitar: '\u{1F3B8}',
  'Bass Guitar': '\u{1F3B8}',
  Keyboard: '\u{1F3B9}',
  Piano: '\u{1F3B9}',
  Saxophone: '\u{1F3B7}',
  Violin: '\u{1F3BB}',
  Cello: '\u{1F3BB}',
  Drums: '\u{1F941}',
}

/** The audition score before the luck roll (no randomness: safe for hints). */
function labelPull(g: GameState, instrument: string): number {
  const job = musicJob(g)
  const pop = job ? mdView(job).popularity : 0
  return effectiveSkill(g, instrument) + fameOf(g) * 0.3 + pop * 0.3 + (musicTalent(g) ? 10 : 0)
}

// ---------------------------------------------------------------------------
// Joining: solo

interface SoloStart {
  instrument: string
}

const contractScript = defineScript('special.music.contract', (g, choice, data) => {
  const o = data as unknown as ContractOffer
  const p = musicProfile(g)
  if (choice !== 'accept') {
    p.burnedLabels.push(o.label)
    return say(g, o.label, `You turned down ${o.label}. They won't be taking your calls again.`, '\u{1F4BF}')
  }
  const { quit, fromBand } = signDeal(g, o)
  if (fromBand) {
    log(g, `I left my band and signed a solo deal with ${o.label}.`, 'good')
    remember(g, `Went solo with ${o.label}.`)
    return say(g, 'Solo Career', `You signed a ${o.years}-year solo deal with ${o.label} worth ${money(o.advance)}. Your former bandmates are writing a diss track about you.`, '\u{1F3A4}', 'good')
  }
  log(g, `I signed a record deal with ${o.label}.`, 'good')
  remember(g, `Signed a ${o.genre} record deal with ${o.label}.`)
  say(g, 'Record Deal', `You signed a ${o.years}-year contract with ${o.label}! You'll receive ${money(o.advance)} paid over ${o.years} years, and you'll be making ${o.genre} music.${quitNote(quit)}`, '\u{1F4BF}', 'good')
})

function auditionForLabel(g: GameState, instrument: string, label: RosterEntry, goingSolo: boolean): void {
  const job = musicJob(g)
  const pop = job ? md(job).popularity : 0
  const score = labelPull(g, instrument) + randInt(g, -20, 20)
  const need = 60 + label.tier * 10
  // A master still auditions against other masters: now and then the slot goes to somebody else.
  if (score < need || crowdedField(g)) {
    log(g, `I auditioned for ${label.name} but they passed.`, 'bad')
    return say(
      g,
      label.name,
      pickSite(g, [
        `You played your heart out for ${label.name}. They said they'd "keep your number on file".`,
        `The executives at ${label.name} took one listen and asked if you'd considered accounting.`,
        `${label.name} said your sound "isn't quite there yet". Practice more and try again.`,
      ], 0xc7642177),
      INSTRUMENT_EMOJI[instrument] ?? '\u{1F3B5}',
      'bad',
    )
  }
  const genre = job && goingSolo ? md(job).genre : pick(g, genresAt(g.year))
  const years = randInt(g, 2, 4)
  const advance = Math.min(1_500_000, Math.round(([25_000, 80_000, 250_000, 750_000][label.tier] ?? 25_000) * (1 + fameOf(g) / 30 + pop / 50) * (0.7 + rand(g) * 0.6) * talentMult(g, 'Music', 1.25) / 1_000) * 1_000)
  // The negotiation screen carries the offer. With no room in the career queue the legacy contract modal stands in, so an offer is never lost.
  if (offerDeal(g, { instrument, labelId: label.id, label: label.name, tier: label.tier, genre, advance, years, goingSolo })) return
  const offer: ContractOffer = { instrument, label: label.name, tier: label.tier, genre, advance, years }
  scriptChoice(
    g,
    contractScript,
    label.name,
    `${label.name} loved your audition! They're offering a ${years}-year contract with a ${money(advance)} advance paid over ${years} years. You'll be producing ${genre} music.`,
    [
      { id: 'accept', label: 'Sign the contract', emoji: '\u{270D}\u{FE0F}' },
      { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F4BF}', data: offer as unknown as Json },
  )
}

const labelScript = defineScript('special.music.label', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = data as unknown as SoloStart & { goingSolo?: boolean }
  const label = labelNamed(choice, g.character.city)
  if (!label) return
  if (!useYearAction(g, 'music.audition', 3)) return tell(g, 'Auditions', "You've auditioned for enough labels this year. Your voice needs a rest.", '\u{1F971}')
  auditionForLabel(g, d.instrument, label, !!d.goingSolo)
})

function chooseLabel(g: GameState, instrument: string, goingSolo: boolean): void {
  const burned = musicProfile(g).burnedLabels
  const record = musicStore.peek(g)
  const labels = labelsAt(g.year, g.character.countryId, g.character.city).filter((l) => !burned.includes(l.name) && !(record && cooled(record, l.id, g.year)))
  if (labels.length === 0) return tell(g, 'Record Labels', 'Every record label in town has blacklisted you. Maybe stop turning down contracts.', '\u{1F6AB}')
  // Music talent: the biggest label that would most likely sign you (luck still decides).
  const pull = labelPull(g, instrument)
  const reachable = labels.filter((l) => pull >= 60 + l.tier * 10 + 5)
  const best = reachable.length ? reachable[reachable.length - 1].name : null
  scriptChoice(
    g,
    labelScript,
    'Record Labels',
    `Which record label do you want to audition for? (${instrument} skill: ${effectiveSkill(g, instrument)}%)`,
    [
      ...labels.map((l) => ({
        id: l.name,
        label: `${l.name} ${'\u{2B50}'.repeat(l.tier + 1)}`,
        emoji: '\u{1F4BF}',
        ...(l.name === best ? withHint(talentHint(g, 'Music', 'The biggest label that should bite on your demo.')) : {}),
      })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F4BF}', data: { instrument, goingSolo } },
  )
}

const soloInstrumentScript = defineScript('special.music.soloInstrument', (g, choice) => {
  if (choice === 'cancel') return
  masterInstrument(g, choice)
  chooseLabel(g, choice, false)
})

// ---------------------------------------------------------------------------
// Joining: band

const BAND_A = ['Kittycat', 'Velvet', 'Midnight', 'Electric', 'Rusty', 'Neon', 'Toxic', 'Silver', 'Broken', 'Holy', 'Lazy', 'Crimson', 'Atomic', 'Lonesome']
const BAND_B = ['Dolls', 'Wolves', 'Pirates', 'Saints', 'Machines', 'Tigers', 'Ghosts', 'Cowboys', 'Prophets', 'Lemons', 'Satellites', 'Riot', 'Mixtape', 'Bandits']

interface BandOffer {
  instrument: string
  name: string
  genre: string
  popularity: number
  members: number
  earned: number
}

function genBand(g: GameState, instrument: string): BandOffer {
  const skill = effectiveSkill(g, instrument)
  const popularity = clamp100(randInt(g, 5, 25) + skill * 0.4 + randInt(g, -10, 10) + (musicTalent(g) ? 8 : 0))
  const members = randInt(g, 2, 5)
  return {
    instrument,
    name: `${chance(g, 0.5) ? 'The ' : ''}${pick(g, BAND_A)} ${pick(g, BAND_B)}`,
    genre: pick(g, genresAt(g.year)),
    popularity,
    members,
    earned: Math.round((popularity * popularity * randInt(g, 15, 40)) / 100) * 100,
  }
}

const bandJoinScript = defineScript('special.music.bandJoin', (g, choice, data) => {
  const b = data as unknown as BandOffer & { looked?: number }
  if (choice === 'look') {
    const looked = (b.looked ?? 0) + 1
    const next = genBand(g, b.instrument)
    return offerBand(g, next, looked)
  }
  if (choice !== 'join') return say(g, 'Band', 'You decided to keep your independence. For now.', '\u{1F3B8}')
  const role = BAND_ROLE[b.instrument] ?? 'Band Member'
  const { job, quit } = hire(g, {
    defId: 'musician',
    title: role,
    company: b.name,
    salary: Math.round(b.earned / b.members),
    data: {
      mode: 'band',
      instrument: b.instrument,
      genre: b.genre,
      label: null,
      contractYears: 0,
      advancePerYear: 0,
      popularity: b.popularity,
      bandName: b.name,
      bandmates: [],
      members: b.members,
      recordedAge: -1,
      lastRelease: -1,
    },
  })
  const d = md(job)
  const roles = Object.values(BAND_ROLE).filter((r) => r !== role)
  for (let i = 0; i < b.members - 1; i++) {
    const mate = addColleague(g, b.name, roles[i % roles.length], { ageOffset: [-6, 8], relationship: randInt(g, 40, 70) })
    mate.occupation = `${roles[i % roles.length]} (${b.name})`
    d.bandmates.push(mate.id)
  }
  addFame(g, 3 + Math.round(b.popularity / 15))
  addStat(g, 'happiness', 12)
  log(g, `I joined the band ${b.name} as their ${role.toLowerCase()}.`, 'good')
  remember(g, `Joined the ${b.genre} band ${b.name}.`)
  say(g, b.name, `You joined ${b.name} as their new ${role.toLowerCase()}! Time to make some ${b.genre} music.${quitNote(quit)}`, '\u{1F3B8}', 'good')
})

function offerBand(g: GameState, b: BandOffer, looked: number): void {
  const choices = [
    { id: 'join', label: 'Join the band', emoji: '\u{1F91D}' },
    ...(looked < 2 ? [{ id: 'look', label: 'Keep looking', emoji: '\u{1F50D}' }] : []),
    { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
  ]
  scriptChoice(
    g,
    bandJoinScript,
    'Band Found',
    `${b.name}, a ${b.genre} band, is looking for a ${(BAND_ROLE[b.instrument] ?? 'musician').toLowerCase()}. They have ${b.members - 1} other member${b.members === 2 ? '' : 's'}, ${b.popularity}% popularity, and earned ${money(b.earned)} last year.`,
    choices,
    { emoji: '\u{1F3B8}', data: { ...b, looked } as unknown as Json },
  )
}

const bandInstrumentScript = defineScript('special.music.bandInstrument', (g, choice) => {
  if (choice === 'cancel') return
  if (!useYearAction(g, 'music.bandSearch', 2)) return tell(g, 'Find a Band', "You've posted on every band noticeboard in town. Try again next year.", '\u{1F971}')
  masterInstrument(g, choice)
  const skill = effectiveSkill(g, choice)
  const role = (BAND_ROLE[choice] ?? 'musician').toLowerCase()
  if (skill + randInt(g, -10, 10) < 50) {
    return say(g, 'Find a Band', `You looked for a band in need of a ${role}, but couldn't find one that would take you. Keep practicing.`, '\u{1F50D}', 'bad')
  }
  offerBand(g, genBand(g, choice), 0)
})

function instrumentChoices(g: GameState, list: string[]) {
  return [
    ...list.map((i) => ({ id: i, label: `${i} (${effectiveSkill(g, i)}%)`, emoji: INSTRUMENT_EMOJI[i] ?? '\u{1F3B5}' })),
    { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
  ]
}

// ---------------------------------------------------------------------------
// Releases

interface ReleaseDraft {
  type: string
  subgenre?: string
}

const titleScript = defineScript('special.music.title', (g, value, data) => {
  const job = musicJob(g)
  const d = data as unknown as ReleaseDraft
  if (!job || !d.subgenre) return
  release(g, job, d.type, d.subgenre, cleanName(value, defaultTitle(g), 50))
})

const subgenreScript = defineScript('special.music.subgenre', (g, choice, data) => {
  if (choice === 'cancel') return
  const d = data as unknown as ReleaseDraft
  const type = RELEASE_TYPES.find((t) => t.id === d.type) ?? RELEASE_TYPES[0]
  scriptInput(g, {
    title: type.label,
    emoji: type.emoji,
    text: `What do you want to call your new ${type.label.toLowerCase()}?`,
    input: 'text',
    placeholder: 'Title',
    defaultValue: defaultTitle(g),
    scriptId: titleScript,
    data: { type: d.type, subgenre: choice },
  })
})

const releaseTypeScript = defineScript('special.music.type', (g, choice) => {
  if (choice === 'cancel') return
  const job = musicJob(g)
  if (!job) return
  const genre = md(job).genre
  // The shuffle draws as before; only the subgenres open this year are offered (and can be hinted as the trend).
  const open = subgenresAt(GENRES[genre] ? genre : 'Pop', g.year)
  const subs = shuffle(g, GENRES[genre] ?? GENRES.Pop).filter((s) => open.includes(s)).slice(0, 4)
  const trend = trendingSubgenre(g, genre)
  const options = subs.map((s) => ({ id: s, label: s, emoji: '\u{1F3B6}', ...(s === trend ? withHint(talentHint(g, 'Music', 'This sound is about to blow up on the charts this year.')) : {}) }))
  scriptChoice(g, subgenreScript, 'Subgenre', `What kind of ${genre} sound are you going for?`, [...options, { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
    emoji: '\u{1F3B6}',
    data: { type: choice },
  })
})

const WORDS_A = ['Midnight', 'Neon', 'Broken', 'Sweet', 'Lonely', 'Golden', 'Electric', 'Wild', 'Paper', 'Velvet', 'Summer', 'Heavy']
const WORDS_B = ['Hearts', 'Highway', 'Dreams', 'Fire', 'Echoes', 'Thunder', 'Kisses', 'Rain', 'Ghosts', 'Gold', 'Lies', 'Roses']

function defaultTitle(g: GameState): string {
  const c = g.character
  const n = viewMusic(g).discography.length
  return `${WORDS_A[(c.age + n) % WORDS_A.length]} ${WORDS_B[(c.age * 7 + n * 3) % WORDS_B.length]}`
}

function release(g: GameState, job: Job, typeId: string, subgenre: string, title: string): void {
  const c = g.character
  const d = md(job)
  const p = musicProfile(g)
  if (d.recordedAge === c.age) return tell(g, 'Recording', 'You already released music this year.', '\u{1F4BF}')
  const type = RELEASE_TYPES.find((t) => t.id === typeId) ?? RELEASE_TYPES[0]
  const skill = effectiveSkill(g, d.instrument)
  const synergy = d.mode === 'band' ? avgBandRelationship(g, job) / 10 : 0
  // Riding this year's trending sound helps anyone; Music talent knows which one it is.
  const onTrend = subgenre === trendingSubgenre(g, d.genre)
  let quality = clamp100(skill * 0.5 + randInt(g, 0, 40) + synergy + (musicTalent(g) ? 10 : 0) + (onTrend ? 6 : 0))
  const pop = d.popularity
  let sold = Math.max(50, Math.round(((pop ** 3) * 3 + quality * 800 + 200) * type.mult * (0.3 + rand(g) * 1.7) * (quality / 60) * (onTrend ? 1.3 : 1) * talentMult(g, 'Music', 1.2)))
  // The ledger prices and pays the release: the legacy quality and sold above are drawn first and unchanged.
  const c2 = careerCtx(g, 'music', musicStore.mut(g))
  const before = c.money
  const booked = bookRelease(c2, job, { typeId: type.id, title, subgenre, quality, sold, onTrend })
  sold = booked.sold
  quality = booked.quality
  const share = booked.paid
  const cert = CERTS.find(([min]) => sold >= min)?.[1] ?? null
  d.recordedAge = c.age
  d.lastRelease = c.age
  const popDelta = Math.round((quality - 50) / 5 + (cert ? 4 : 0) + (type.id === 'studio' ? 2 : 0))
  d.popularity = clamp100(d.popularity + popDelta)
  const r: Release = { title, type: type.label, genre: d.genre, subgenre, age: c.age, sold, earned: share, cert, quality, royalty: booked.royalty }
  p.discography.push(r)
  if (type.id === 'studio' || type.id === 'single') count(g, 'albums')
  if (cert === 'Diamond') g.flags['special.music.diamond'] = true
  fameToward(g, d.popularity * 0.95, 5)
  addStat(g, 'happiness', cert ? 12 : quality >= 50 ? 5 : -5)
  for (const id of d.bandmates) {
    const mate = getPerson(g, id)
    if (mate) addRelationship(mate, cert ? 8 : quality >= 50 ? 3 : -4)
  }
  const verdict =
    quality >= 85
      ? pickLine(g, ['Critics are calling it a masterpiece.', 'Music blogs crowned it album of the year.', 'Even your haters have it on repeat.'])
      : quality >= 60
        ? pickLine(g, ['Reviews were warm.', 'Fans seem to love it.', 'It got decent radio play.'])
        : quality >= 40
          ? pickLine(g, ['Reviews were mixed.', 'It got lost in the shuffle.', 'A few tracks are growing on people.'])
          : pickLine(g, ['Critics savaged it.', 'One reviewer called it "a crime against ears".', 'It was mostly bought by your relatives.'])
  log(g, `I released the ${type.label.toLowerCase()} "${title}". It sold ${compact(sold)} copies${cert ? ` and went ${cert}` : ''}.`, cert || quality >= 60 ? 'good' : quality < 40 ? 'bad' : 'neutral')
  if (cert) remember(g, `"${title}" went ${cert}.`)
  say(
    g,
    title,
    `Your ${subgenre.toLowerCase()} ${type.label.toLowerCase()} "${title}" sold ${sold.toLocaleString('en-US')} copies${cert ? ` and was certified ${cert}!` : '.'} ${verdict} You earned ${money(share)}${d.mode === 'band' ? ' as your share' : ''}. ${d.mode === 'band' ? 'Band' : 'Your'} popularity is now ${d.popularity}%.${booked.peak > 0 ? ` It peaked at #${booked.peak}.` : ''}`,
    type.emoji,
    cert || quality >= 60 ? 'good' : quality < 40 ? 'bad' : 'neutral',
  )
  emitBooks(c2, 'music.release', before)
}

function avgBandRelationship(g: GameState, job: Job): number {
  const mates = mdView(job).bandmates.map((id) => getPerson(g, id)).filter((p) => !!p)
  if (mates.length === 0) return 50
  return mates.reduce((s, p) => s + (p?.relationship ?? 50), 0) / mates.length
}

// ---------------------------------------------------------------------------
// Concerts & tours

const VENUES: { name: string; capacity: number; minPop: number }[] = [
  { name: 'a dive bar', capacity: 80, minPop: 0 },
  { name: 'a hoedown', capacity: 300, minPop: 0 },
  { name: 'a county fair', capacity: 800, minPop: 10 },
  { name: 'a music festival side stage', capacity: 3_000, minPop: 25 },
  { name: 'a historic theater', capacity: 2_500, minPop: 30 },
  { name: 'an arena', capacity: 18_000, minPop: 55 },
  { name: 'a sold-out stadium', capacity: 60_000, minPop: 75 },
]

/** Hoedowns and county fairs are American; elsewhere it's a village wedding or a town festival. */
function venueLabel(g: GameState, name: string): string {
  if (g.character.countryId === 'us') return name
  return name === 'a hoedown' ? 'a village wedding' : name === 'a county fair' ? 'a town festival' : name
}

const concertScript = defineScript('special.music.concert', (g, choice) => {
  if (choice === 'cancel') return
  const job = musicJob(g)
  if (!job) return
  const venue = VENUES.find((v) => v.name === choice)
  if (!venue) return
  if (!useYearAction(g, 'music.concert', 2)) return tell(g, 'Concert', "Your voice is shot from all the shows this year. Rest up.", '\u{1F971}')
  const d = md(job)
  const skill = effectiveSkill(g, d.instrument)
  const performance = clamp100(skill * 0.6 + randInt(g, 0, 40) + (musicTalent(g) ? 10 : 0))
  const fill = Math.min(1, Math.max(0.05, (d.popularity + 20 - venue.minPop) / 60 + rand(g) * 0.2))
  const attendance = Math.max(3, Math.round(venue.capacity * fill))
  const ticket = 10 + Math.round(d.popularity * 1.2)
  const gross = Math.round(attendance * ticket * 0.35 * (0.6 + performance / 200))
  const share = d.mode === 'band' ? Math.round(gross / Math.max(1, d.members)) : gross
  earnIncome(g, share, 'wage')
  musicProfile(g).concerts += 1
  if (venue.name === 'a hoedown') g.flags['special.music.hoedown'] = true
  const good = performance >= 55
  d.popularity = clamp100(d.popularity + (good ? randInt(g, 1, 3) : -1))
  addStat(g, 'happiness', good ? 6 : -3)
  if (good) addFame(g, 1)
  log(g, `I played a concert at ${venueLabel(g, venue.name)} for ${attendance.toLocaleString('en-US')} people.`, good ? 'good' : 'neutral')
  const vibe = good
    ? pickLine(g, ['The crowd sang every word back to you.', 'Someone threw flowers on stage. You hope they were flowers.', 'The encore went on for twenty minutes.'])
    : pickLine(g, ['The sound system kept squealing.', 'You forgot the words to your own song.', 'Half the crowd left during the slow songs.'])
  say(g, 'Concert', `You played ${venueLabel(g, venue.name)} in front of ${attendance.toLocaleString('en-US')} fans. ${vibe} You earned ${money(share)}.`, '\u{1F3A4}', good ? 'good' : 'neutral')
})

// ---------------------------------------------------------------------------
// Band management

const kickScript = defineScript('special.music.kick', (g, choice) => {
  if (choice === 'cancel') return
  const job = musicJob(g)
  const mate = getPerson(g, choice)
  if (!job || !mate) return
  const d = md(job)
  if (chance(g, 0.3)) {
    addRelationship(mate, -15)
    return say(g, 'Band Vote', `You tried to kick ${mate.firstName} out of ${d.bandName}, but the rest of the band voted against you. Awkward rehearsal tomorrow.`, '\u{1F5F3}\u{FE0F}', 'bad')
  }
  d.bandmates = d.bandmates.filter((id) => id !== mate.id)
  d.members = Math.max(1, d.members - 1)
  d.popularity = clamp100(d.popularity - randInt(g, 1, 4))
  if (mate.relation === 'coworker') g.people = g.people.filter((p) => p.id !== mate.id)
  else addRelationship(mate, -30)
  log(g, `I kicked ${fullName(mate)} out of the band.`, 'bad')
  say(g, d.bandName ?? 'Band', `You kicked ${fullName(mate)} out of the band. They took the van keys with them.`, '\u{1F462}')
})

const bandNameScript = defineScript('special.music.bandName', (g, value) => {
  const job = musicJob(g)
  if (!job) return
  const d = md(job)
  const name = cleanName(value, d.bandName ?? 'The Band', 40)
  if (chance(g, 0.5)) {
    return say(g, 'Band Name', `You suggested renaming the band to "${name}". Your bandmates laughed you out of the room.`, '\u{1F3B8}', 'bad')
  }
  const old = d.bandName ?? job.company
  for (const id of d.bandmates) {
    const mate = getPerson(g, id)
    if (mate) {
      mate.contextId = name
      mate.occupation = mate.occupation.replace(old, name)
    }
  }
  d.bandName = name
  job.company = name
  log(g, `Our band changed its name from ${old} to ${name}.`)
  say(g, 'Band Name', `Your band is now called "${name}". The old merch is officially a collector's item.`, '\u{1F3B8}', 'good')
})

function bandNodes(g: GameState, job: Job): MenuNode[] {
  const d = mdView(job)
  const mates = d.bandmates.map((id) => getPerson(g, id)).filter((p) => !!p)
  return [
    {
      type: 'menu',
      id: 'music.band',
      label: 'Band',
      emoji: '\u{1F465}',
      subtitle: `${d.bandName} · ${d.members} member${d.members === 1 ? '' : 's'}`,
      header: () => `${d.bandName} plays ${d.genre}. Your bandmates also appear under Relationships.`,
      children: (): MenuNode[] => [
        ...mates.map((m) => ({ type: 'info' as const, id: `music.mate.${m!.id}`, emoji: '\u{1F3B8}', text: `${fullName(m!)} · ${m!.occupation.replace(/ \(.*\)$/, '')} · Relationship ${m!.relationship}%` })),
        {
          type: 'action',
          id: 'music.kick',
          label: 'Kick Out a Member',
          emoji: '\u{1F462}',
          visible: () => mates.length > 0,
          disabledReason: (gg) => blocked(gg, 0),
          run: (gg) => {
            const job2 = musicJob(gg)
            if (!job2) return
            const list = md(job2).bandmates.map((id) => getPerson(gg, id)).filter((p) => !!p)
            scriptChoice(gg, kickScript, 'Kick Out a Member', 'Who do you want to kick out of the band?', [...list.map((p) => ({ id: p!.id, label: fullName(p!), emoji: '\u{1F464}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
              emoji: '\u{1F462}',
            })
          },
        },
        {
          type: 'action',
          id: 'music.bandName',
          label: 'Change Band Name',
          emoji: '\u{1F3F7}\u{FE0F}',
          disabledReason: (gg) => blocked(gg, 0),
          run: (gg) => {
            if (!useYearAction(gg, 'music.bandName', 1)) return tell(gg, 'Band Name', 'Your bandmates refuse to discuss names again this year.', '\u{1F3F7}\u{FE0F}')
            scriptInput(gg, { title: 'Band Name', emoji: '\u{1F3F7}\u{FE0F}', text: 'What should the band be called?', input: 'text', placeholder: 'Band name', defaultValue: d.bandName ?? '', scriptId: bandNameScript })
          },
        },
      ],
    },
    {
      type: 'action',
      id: 'music.goSolo',
      label: 'Solo Artist',
      emoji: '\u{1F3A4}',
      subtitle: 'Leave the band and sign a solo deal',
      visible: () => d.instrument !== 'Drums',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const job2 = musicJob(gg)
        if (!job2) return
        chooseLabel(gg, md(job2).instrument, true)
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Menus

function discographyMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'music.discography',
    label: 'Discography',
    emoji: '\u{1F4BF}',
    subtitle: (g) => `${viewMusic(g).discography.length} release${viewMusic(g).discography.length === 1 ? '' : 's'}`,
    children: (g): MenuNode[] => {
      const p = viewMusic(g)
      const sim = musicStore.view(g)
      // The chart peak of a release: the ledger row with its title in the year it came out (a legacy release has none).
      const peakOf = (r: Release): number => sim.ledger.find((x) => x.title === r.title && x.year === g.year - (g.character.age - r.age))?.peak ?? 0
      const nodes: MenuNode[] = []
      if (p.discography.length === 0) nodes.push({ type: 'info', id: 'music.d.none', text: 'No releases yet.' })
      p.discography
        .slice()
        .reverse()
        .forEach((r, i) =>
          nodes.push({
            type: 'info',
            id: `music.d.${i}`,
            emoji: r.cert === 'Diamond' ? '\u{1F48E}' : r.cert ? '\u{1F4C0}' : '\u{1F4BF}',
            text: `"${r.title}" · ${r.type} (${r.subgenre}) · age ${r.age} · ${compact(r.sold)} sold${r.cert ? ` · ${r.cert}` : ''} · ${short(r.earned)}${peakOf(r) > 0 ? ` · #${peakOf(r)}` : ''}`,
          }),
        )
      p.awards.forEach((a, i) => nodes.push({ type: 'info', id: `music.a.${i}`, emoji: '\u{1F3C6}', text: a }))
      sim.awards.forEach((a, i) => nodes.push({ type: 'info', id: `music.sa.${i}`, emoji: '\u{1F3C6}', text: a }))
      return nodes
    },
  }
}

const quitMusic: MenuAction = {
  type: 'action',
  id: 'music.quit',
  label: 'Quit',
  emoji: '\u{1F6AA}',
  subtitle: 'Walk away from the music business',
  confirm: () => 'Quit your music career?',
  run: (g) => {
    const job = musicJob(g)
    if (!job) return
    const d = md(job)
    const where = d.mode === 'band' ? d.bandName : d.label
    if (musicStore.has(g)) endDeal(careerCtx(g, 'music', musicStore.mut(g)), 'quit')
    removeBand(g, job)
    leave(g, 'quit')
    log(g, 'I quit the music business.')
    say(g, 'Quit Music', `You walked away from ${where ?? 'the music business'}. ${pickLine(g, ['The fans will always have your records.', 'Your guitar now gathers dust in the corner.', 'You swear you will make a comeback album someday.'])}`, '\u{1F6AA}')
  },
}

export function musicJobNodes(g: GameState): MenuNode[] {
  const job = musicJob(g)
  if (!job) return []
  const d = mdView(job)
  const nodes: MenuNode[] = [
    musicMastersMenu,
    {
      type: 'info',
      id: 'music.status',
      emoji: INSTRUMENT_EMOJI[d.instrument] ?? '\u{1F3B5}',
      text: `${artistName(g)} · ${d.genre} · Popularity ${d.popularity}%${d.mode === 'solo' && d.label ? ` · ${d.label} (${d.contractYears} year${d.contractYears === 1 ? '' : 's'} left)` : ''}`,
    },
    ...musicNodes(g),
    {
      type: 'action',
      id: 'music.album',
      label: 'Album',
      emoji: '\u{1F4BF}',
      subtitle: 'Record a new album or single',
      disabledReason: (gg) => blocked(gg, 0) ?? (musicJob(gg) && mdView(musicJob(gg)!).recordedAge === gg.character.age ? 'You can only release one album or single a year.' : null),
      run: (gg) => {
        const j = musicJob(gg)
        if (!j) return
        const hasAlbums = musicProfile(gg).discography.filter((r) => r.type === 'Studio Album').length >= 2
        scriptChoice(
          gg,
          releaseTypeScript,
          'Record',
          'What do you want to record?',
          [...RELEASE_TYPES.filter((t) => t.id !== 'compilation' || hasAlbums).map((t) => ({ id: t.id, label: t.label, emoji: t.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
          { emoji: '\u{1F4BF}' },
        )
      },
    },
    {
      type: 'action',
      id: 'music.concert',
      label: 'Concert',
      emoji: '\u{1F3A4}',
      subtitle: 'Play a live show',
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const j = musicJob(gg)
        if (!j) return
        const pop = md(j).popularity
        const options = shuffle(gg, VENUES.filter((v) => v.minPop <= pop + 10)).slice(0, 3)
        scriptChoice(gg, concertScript, 'Concert', 'Your booking agent found these gigs. Where do you want to play?', [...options.map((v) => ({ id: v.name, label: `${venueLabel(gg, v.name)[0].toUpperCase()}${venueLabel(gg, v.name).slice(1)} (${v.capacity.toLocaleString('en-US')} capacity)`, emoji: '\u{1F3DF}\u{FE0F}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
          emoji: '\u{1F3A4}',
        })
      },
    },
    tourAction,
    {
      type: 'action',
      id: 'music.practice',
      label: 'Practice',
      emoji: INSTRUMENT_EMOJI[d.instrument] ?? '\u{1F3B5}',
      subtitle: `${d.instrument} skill ${effectiveSkill(g, d.instrument)}%`,
      disabledReason: (gg) => blocked(gg, 0),
      run: (gg) => {
        const j = musicJob(gg)
        if (!j) return
        if (!useYearAction(gg, 'music.practice', 2)) return tell(gg, 'Practice', 'Your fingers are blistered. No more practice this year.', '\u{1F971}')
        const inst = md(j).instrument
        const gain = Math.round(randInt(gg, 2, 6) * talentMult(gg, 'Music', 1.7))
        const base = masterInstrument(gg, inst)
        setInstrumentSkill(gg, inst, base + gain)
        log(gg, `I practiced my ${inst.toLowerCase()}.`)
        say(gg, 'Practice', `${pickLine(gg, ['You rehearsed for eight hours straight.', 'You wrote three new riffs and deleted two.', 'You practiced until the neighbors started requesting songs.'])} Your ${inst.toLowerCase()} skill is now ${instrumentSkill(gg, inst)}%.`, '\u{1F3B6}', 'good')
      },
    },
    {
      type: 'action',
      id: 'music.stageName',
      label: 'Stage Name',
      emoji: '\u{1F31F}',
      subtitle: (gg) => viewMusic(gg).stageName ?? 'Adopt a stage name',
      input: { kind: 'text', label: 'Your stage name (leave blank to use your real name)', placeholder: 'e.g. Lil Tadpole', defaultValue: (gg) => viewMusic(gg).stageName ?? '' },
      run: (gg, value) => runStageName(gg, value),
    },
    discographyMenu(),
  ]
  if (d.mode === 'band') nodes.push(...bandNodes(g, job))
  nodes.push(quitMusic)
  return nodes
}

function runStageName(g: GameState, value: string | undefined): void {
  const p = musicProfile(g)
  const name = cleanName(value, '', 30)
  if (!name) {
    p.stageName = null
    return say(g, 'Stage Name', 'You went back to performing under your real name.', '\u{1F3A4}')
  }
  p.stageName = name
  log(g, `I started performing as "${name}".`)
  say(g, 'Stage Name', `From now on, the world will know you as "${name}".`, '\u{1F3A4}', 'good')
}

export const musicCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.music',
  label: 'Musician',
  emoji: '\u{1F3B8}',
  subtitle: 'Go solo or join a band',
  header: (g) => {
    const skills = SOLO_INSTRUMENTS.concat(['Drums'])
      .map((i) => [i, effectiveSkill(g, i)] as const)
      .filter(([, s]) => s > 0)
      .map(([i, s]) => `${i} ${s}%`)
    return `${skills.length ? `Your skills: ${skills.join(', ')}.` : 'You haven\'t learned any instruments yet.'} Learn instruments and take voice lessons under Activities → Mind & Body. Labels want 60%+ skill.`
  },
  children: (g): MenuNode[] => {
    if (musicJob(g)) return [musicMastersMenu, { type: 'info', id: 'music.already', text: 'You are already a musician. Manage your career from your job.', emoji: '\u{1F3B8}' }]
    const confirm = (gg: GameState) => (gg.character.job ? `If you're signed, you'll quit your job as ${gg.character.job.title}. Continue?` : null)
    return [
      musicMastersMenu,
      {
        type: 'action',
        id: 'music.solo',
        label: 'Solo Artist',
        emoji: '\u{1F3A4}',
        subtitle: 'Audition for a record label',
        disabledReason: (gg) => blocked(gg, 18),
        confirm,
        run: (gg) => scriptChoice(gg, soloInstrumentScript, 'Solo Artist', 'Which instrument will you audition with?', instrumentChoices(gg, SOLO_INSTRUMENTS), { emoji: '\u{1F3A4}' }),
      },
      {
        type: 'action',
        id: 'music.bandSearch',
        label: 'Find a Band',
        emoji: '\u{1F3B8}',
        subtitle: 'Join a band that needs you',
        disabledReason: (gg) => blocked(gg, 18),
        confirm,
        run: (gg) => scriptChoice(gg, bandInstrumentScript, 'Find a Band', 'What will you play in the band?', instrumentChoices(gg, BAND_INSTRUMENTS), { emoji: '\u{1F3B8}' }),
      },
      discographyMenu(),
    ]
  },
}

// ---------------------------------------------------------------------------
// Yearly

const AWARD = 'Golden Record Award'

const contractRenewScript = defineScript('special.music.renew', (g, choice, data) => {
  const job = musicJob(g)
  if (!job) return
  const o = data as unknown as { advance: number; years: number }
  const d = md(job)
  if (choice === 'accept') {
    d.contractYears = o.years
    d.advancePerYear = Math.round(o.advance / o.years)
    job.salary = d.advancePerYear
    log(g, fillSlots(pickLine(g, RESIGN_LINES), { who: d.label ?? 'the label' }), 'good')
    return say(g, 'Contract Renewed', `You re-signed with ${d.label} for ${o.years} more years and ${money(o.advance)}.`, '\u{270D}\u{FE0F}', 'good')
  }
  const label = d.label
  leave(g, 'quit')
  log(g, `I walked away from ${label}.`)
  say(g, 'Free Agent', `You turned down ${label}'s new contract and left the label. You can audition for other labels any time.`, '\u{1F4BF}')
})

export function yearlyMusic(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  yearlyMusicRights(g)
  const stored = peek<MusicProfile>(g, 'music')
  const job = musicJob(g)
  if (!stored && !job) return
  if (!claimYearly(g, 'music')) return
  const p = stored ? musicProfile(g) : null
  if (p) {
    let royalties = 0
    for (const r of p.discography) {
      if (r.royalty >= 25) {
        royalties += r.royalty
        r.royalty = Math.round(r.royalty / 2)
      } else r.royalty = 0
    }
    if (royalties > 0) {
      earnIncome(g, royalties, 'royalty')
      log(g, `My records earned ${money(royalties)} in royalties.`)
    }
  }
  if (!job || c.prison) return
  syncTenure(g, job)
  const d = md(job)
  const released = d.lastRelease >= c.age - 1
  d.popularity = clamp100(d.popularity + (released ? randInt(g, 0, 3) : -randInt(g, 3, 8)) - (c.age > 50 ? 1 : 0))
  fameToward(g, d.popularity * 0.9, 4)
  if (!released && c.hidden.fame > d.popularity) addHidden(g, 'fame', -1)

  // Once the sim owns the life, music-label's stepDeal pays the advance and runs the term (the sim hook follows this one).
  const sim = musicStore.peek(g)?.migrated === true
  if (d.mode === 'solo') {
    if (!sim && d.contractYears > 0) {
      earnIncome(g, d.advancePerYear, 'royalty')
      d.contractYears -= 1
      if (d.contractYears === 0) {
        if (d.popularity >= 35) {
          const years = randInt(g, 2, 4)
          const advance = Math.round((d.popularity ** 2 * 60 * years * (0.7 + rand(g) * 0.6)) / 1_000) * 1_000
          scriptChoice(
            g,
            contractRenewScript,
            'Contract Expiring',
            `Your contract with ${d.label} is up. They're offering a new ${years}-year deal worth ${money(advance)}.`,
            [
              { id: 'accept', label: 'Re-sign', emoji: '\u{270D}\u{FE0F}' },
              { id: 'decline', label: 'Leave the label', emoji: '\u{1F44B}' },
            ],
            { emoji: '\u{1F4BF}', data: { advance, years } },
          )
        } else {
          const label = d.label
          leave(g, 'fired')
          log(g, `${label} dropped me.`, 'bad')
          say(g, 'Dropped', `${label} decided not to renew your contract. You're a free agent. Audition for another label if you want back in.`, '\u{1F4C9}', 'bad')
          return
        }
      }
    }
  } else {
    const gross = Math.round(d.popularity ** 2 * randInt(g, 15, 40))
    const share = Math.round(gross / Math.max(1, d.members))
    if (share > 0) earnIncome(g, share, 'wage')
    job.salary = share
    if (chance(g, 0.04) && avgBandRelationship(g, job) < 45) {
      const name = d.bandName
      removeBand(g, job)
      leave(g, 'fired')
      log(g, `${name} kicked me out of the band.`, 'bad')
      say(g, 'Kicked Out', `${name} held a band meeting without you and voted you out. You can go solo or find another band from Special Careers.`, '\u{1F462}', 'bad')
      return
    }
    if (chance(g, 0.025)) {
      const name = d.bandName
      removeBand(g, job)
      leave(g, 'laid off')
      log(g, `${name} broke up.`, 'bad')
      say(g, 'Breakup', `${name} broke up over "creative differences" (someone ate someone else's sandwich). You can go solo or find another band from Special Careers.`, '\u{1F494}', 'bad')
      return
    }
  }

  const latest = p?.discography[p.discography.length - 1]
  if (!sim && latest && latest.age === c.age - 1 && latest.quality >= 70 && d.popularity >= 55 && chance(g, 0.35)) {
    const category = latest.type === 'Single' ? 'Record of the Year' : 'Album of the Year'
    if (chance(g, 0.25 + (latest.quality - 70) / 60)) {
      musicProfile(g).awards.push(`${AWARD} for ${category} — "${latest.title}" (age ${c.age})`)
      count(g, 'awards')
      addFame(g, 6)
      addStat(g, 'happiness', 15)
      d.popularity = clamp100(d.popularity + 5)
      log(g, `"${latest.title}" won the ${AWARD} for ${category}.`, 'good')
      remember(g, `Won the ${AWARD} for ${category} ("${latest.title}").`)
      say(g, AWARD, `"${latest.title}" won the ${AWARD} for ${category}! You thanked ${pickLine(g, ['your mom', 'your fans', 'your producer', 'nobody in particular'])} and nearly tripped on the way off stage.`, '\u{1F3C6}', 'good')
    } else {
      addFame(g, 2)
      log(g, `"${latest.title}" was nominated for the ${AWARD} for ${category}.`, 'good')
      say(g, 'Nominated', `"${latest.title}" was nominated for the ${AWARD} for ${category}, but lost to ${pickLine(g, ['a song about a tractor', 'a boy band reunion album', 'an AI-generated lullaby', 'your biggest rival'])}.`, '\u{1F3C6}')
    }
  }
}
