// What the world looks like this year: the offline text library was written in the 2020s, and a
// life can start in 1900. These helpers keep events, log lines, activities and conversations in
// their era: letters before telephones, the family radio before TV, a pager in the nineties,
// texting only once mobile phones are common where the player lives, selfies after smartphones.
//
// Era tags: any line in an event/flavor list may start with "@gate,gate " and is only used when
// every gate holds (tags are stripped before display):
//   @tv           TV is commonplace here this year (techOdds >= COMMON_SHARE)
//   @+internet    the internet exists here at all (hasTech)
//   @!smartphone  smartphones are NOT commonplace yet
//   @1950         the year is 1950 or later        @-1990   the year is before 1990
//   @landline / @texting / @flights / @cars        common-sense extras (see GATES)
// Lists must keep at least one untagged (or always-true) line so every era has something to say.
import { getCountry } from '../world'
import { pick } from '../rng'
import { TECH, techAdoption, techOdds, type TechId } from '../history/timeline'
import type { GameState } from '../types'

/** A typical person here has it when at least this share of households does. */
export const COMMON_SHARE = 0.25

/** The technology is commonplace for a typical family here this year. */
export function common(g: GameState, tech: TechId, share = COMMON_SHARE): boolean {
  return techOdds(g, tech) >= share
}

/** The technology exists here at all this year (someone, somewhere in the country has it). */
export function exists(g: GameState, tech: TechId): boolean {
  return techOdds(g, tech) >= 0.02
}

function wealth(g: GameState): number {
  const w = getCountry(g.character.countryId).wealth
  return typeof w === 'number' && Number.isFinite(w) ? w : 1
}

/** A telephone at home is normal (rich countries from the late 1920s, poorer ones decades later). */
export function landline(g: GameState): boolean {
  return techOdds(g, 'radio') >= COMMON_SHARE
}

/** Teens and adults text each other (mobile phones are common and SMS has caught on). */
export function texting(g: GameState): boolean {
  return g.year >= 1999 && common(g, 'mobilePhone')
}

/** Ordinary families take holidays by plane (before the 1970s flying was for the rich). */
export function flights(g: GameState): boolean {
  const w = wealth(g)
  return g.year >= (w >= 0.8 ? 1970 : w >= 0.5 ? 1980 : 1995)
}

/** A family car is normal here (the US from the late 1920s, Europe from the 1960s, most places later). */
export function cars(g: GameState): boolean {
  const w = wealth(g)
  const from = w >= 0.95 ? 1928 : w >= 0.7 ? 1960 : w >= 0.45 ? 1975 : 1995
  return g.year >= from
}

const GATES: Record<string, (g: GameState) => boolean> = {
  landline,
  texting,
  flights,
  cars,
}

function isTech(id: string): id is TechId {
  return Object.prototype.hasOwnProperty.call(TECH, id)
}

/** One gate: 'tv', '+tv', '!tv', '1950', '-1990', 'landline'... */
export function gateHolds(g: GameState, gate: string): boolean {
  if (!gate) return true
  if (/^-\d{4}$/.test(gate)) return g.year < Number(gate.slice(1))
  if (/^\d{4}$/.test(gate)) return g.year >= Number(gate)
  const neg = gate[0] === '!'
  const any = gate[0] === '+'
  const id = neg || any ? gate.slice(1) : gate
  let ok: boolean
  if (isTech(id)) ok = any ? exists(g, id) : common(g, id)
  else if (GATES[id]) ok = GATES[id](g)
  else ok = true
  return neg ? !ok : ok
}

const TAG = /^@([\w!+,-]+)\s+/

/** The gates of a tagged line ('@tv,1950 text' → ['tv', '1950']), or [] when untagged. */
export function eraTags(line: string): string[] {
  const m = TAG.exec(line)
  return m ? m[1].split(',').filter(Boolean) : []
}

/** Does a (possibly tagged) line fit this year and place? */
export function eraOk(g: GameState, line: string): boolean {
  return eraTags(line).every((t) => gateHolds(g, t))
}

/** The line without its era tag. */
export function eraStrip(line: string): string {
  return line.replace(TAG, '')
}

/** The lines that fit this year, tags stripped. */
export function eraLines(g: GameState, lines: readonly string[]): string[] {
  return lines.filter((l) => eraOk(g, l)).map(eraStrip)
}

/** A random line that fits this year (falls back to the untagged ones, then to any line). */
export function eraPick(g: GameState, lines: readonly string[]): string {
  const ok = eraLines(g, lines)
  if (ok.length) return pick(g, ok)
  const plain = lines.filter((l) => !TAG.test(l))
  return eraStrip(pick(g, plain.length ? plain : lines))
}

/** Pick by era: the first [gate, value] whose gate holds (gates as in eraTags, ',' = and), else the fallback. */
export function byEra<T>(g: GameState, variants: readonly (readonly [string, T])[], fallback: T): T {
  for (const [gates, value] of variants) if (gates.split(',').every((t) => gateHolds(g, t.trim()))) return value
  return fallback
}

// ---------------------------------------------------------------------------
// Everyday vocabulary by era

/** How you got in touch: 'messaged' (smartphones), 'texted', 'called', 'wrote to'. */
export function reachVerb(g: GameState): string {
  return common(g, 'smartphone') ? 'messaged' : texting(g) ? 'texted' : landline(g) ? 'called' : 'wrote to'
}

/** What you sent: 'message', 'text', 'phone call', 'letter'. */
export function reachNoun(g: GameState): string {
  return common(g, 'smartphone') ? 'message' : texting(g) ? 'text' : landline(g) ? 'phone call' : 'letter'
}

/** 'a quick message' / 'a postcard': the small "thinking of you" gesture. */
export function smallNote(g: GameState): string {
  return common(g, 'smartphone') ? 'a quick message' : texting(g) ? 'a quick text' : landline(g) ? 'a quick phone call' : 'a postcard'
}

/** The phone a person carries ('phone') or the one on the hallway table ('telephone'). */
export function phoneWord(g: GameState): string {
  return common(g, 'mobilePhone') ? 'phone' : 'telephone'
}

/** Where a teenager's attention goes: 'phone', 'computer', 'TV', 'radio', 'comic books'. */
export function screenThing(g: GameState): string {
  if (common(g, 'smartphone')) return 'phone'
  if (common(g, 'homeComputer') && common(g, 'internet')) return 'computer'
  if (common(g, 'tv')) return 'TV'
  if (common(g, 'radio')) return 'radio'
  return 'comic books'
}

/** What kids fight over at home. */
export function kidPrize(g: GameState): string {
  if (common(g, 'smartphone')) return 'the tablet'
  if (common(g, 'videoGameConsole')) return 'the game console'
  if (common(g, 'tv')) return g.year >= 1980 ? 'the TV remote' : 'which channel to watch'
  if (common(g, 'radio')) return 'the radio dial'
  return 'the good sled'
}

/** A teen's most prized possession, the first thing confiscated: 'phone', 'game console'... */
export function prized(g: GameState): string {
  if (common(g, 'mobilePhone')) return 'phone'
  if (common(g, 'videoGameConsole')) return 'game console'
  if (g.year >= 1950) return 'record player'
  return 'bicycle'
}

/** What gets taken away as a punishment: 'screen time', 'video games', 'TV privileges', 'radio privileges', 'dessert'. */
export function privileges(g: GameState): string {
  if (common(g, 'smartphone')) return 'screen time'
  if (common(g, 'videoGameConsole')) return 'video games'
  if (common(g, 'tv')) return 'TV privileges'
  if (common(g, 'radio')) return 'radio privileges'
  return 'dessert'
}

/** What kids do on a day stuck indoors: 'Play video games' or 'Play board games'. */
export function indoorGame(g: GameState): { label: string; did: string; text: string } {
  if (common(g, 'videoGameConsole')) return { label: 'Play video games', did: 'played video games', text: 'You stayed in your pajamas and gamed for 11 hours straight.' }
  return { label: 'Play board games', did: 'played board games', text: 'You stayed in your pajamas and played board games until everyone refused to play with you.' }
}

/** What a skeptical online commenter asks about art: whether it was made by AI (from the 2020s). */
export function aiOrUpsideDown(g: GameState): string {
  return exists(g, 'aiAssistants') ? 'AI' : 'hanging upside down'
}

/** A photo of yourself: 'selfie' once smartphones are common, else 'photo'. */
export function photoWord(g: GameState): string {
  return common(g, 'smartphone') ? 'selfie' : 'photo'
}

/** Where people read about each other: 'online', 'in the local paper'... */
export function gossipPlace(g: GameState): string {
  return common(g, 'socialMedia') ? 'online' : 'all over town'
}

/** "posted about it all night" / "talked about it for weeks". */
export function bragged(g: GameState): string {
  return common(g, 'socialMedia') ? 'posted about it all night' : 'talked about nothing else for weeks'
}

/** How you looked something up: 'searched online' / 'looked it up at the library'. */
export function lookedUp(g: GameState): string {
  return common(g, 'internet') ? 'searched online' : 'looked it up at the library'
}

/** Where the news came from: 'online', 'on the evening news', 'on the radio', 'in the newspaper'. */
export function newsSource(g: GameState): string {
  if (common(g, 'smartphone')) return 'online'
  if (common(g, 'tv')) return 'on the evening news'
  if (common(g, 'radio')) return 'on the radio'
  return 'in the newspaper'
}

/** How a broke shopper finds out: 'Your card was declined.' / 'You counted your cash twice.' */
export function declined(g: GameState): string {
  return common(g, 'creditCards', 0.3) ? 'Your card was declined.' : 'You counted your cash twice. Still not enough.'
}

/** A mix of songs for someone: 'playlist', 'mixtape', 'stack of records'. */
export function mixWord(g: GameState): string {
  if (g.year >= 2003 && common(g, 'internet')) return 'playlist'
  if (g.year >= 1975) return 'mixtape'
  return 'stack of records'
}

/** What you watch a film on at home, or 'the pictures' before TV. */
export function homeMovies(g: GameState): string {
  if (common(g, 'streaming')) return 'a streaming service'
  if (g.year >= 1983 && common(g, 'tv')) return 'a rented videotape'
  if (common(g, 'tv')) return 'the late movie on TV'
  return 'the picture house'
}

/** The kind of movie that was showing: silent pictures → talkies → color → blockbusters. */
export function movieKind(g: GameState): string {
  const y = g.year
  if (y < 1928) return 'silent picture'
  if (y < 1940) return 'talkie'
  if (y < 1960) return 'picture'
  if (y < 1975) return 'movie'
  return 'blockbuster'
}

/** US Prohibition (1920-1933): liquor was illegal, so parties ran on bootleg gin. */
export function prohibition(g: GameState): boolean {
  return g.character.countryId === 'us' && g.year >= 1920 && g.year <= 1933
}

/** What's being passed around at a party: 'alcohol', or 'bootleg gin' during Prohibition. */
export function booze(g: GameState): string {
  return prohibition(g) ? 'bootleg gin' : 'alcohol'
}

/** Spray paint arrived around 1950; before that, vandals used a can of paint and a brush. */
export function sprayPaint(g: GameState): string {
  return g.year >= 1950 ? 'spray paint' : 'paint'
}

const BANDS: readonly (readonly [number, readonly string[]])[] = [
  [2005, ['DJ Toaster', 'Lil Spreadsheet', 'Sadboy Summer', 'Glitter Apocalypse', 'Neon Grandma']],
  [1985, ['The Velvet Raccoons', 'Glitter Apocalypse', 'DJ Toaster', 'The Midnight Llamas', 'Grunge Muffin']],
  [1965, ['The Velvet Raccoons', 'The Midnight Llamas', 'Neon Grandma', 'Disco Inferno Seven', 'The Paisley Walrus']],
  [1950, ['Johnny Comet and the Sparkplugs', 'The Velvet Raccoons', 'The Crooning Cardinals', 'Little Ricky Thunder']],
  [1930, ['Benny Moonlight and His Orchestra', 'The Swinging Sweethearts', 'The Crooning Cardinals', 'Duke Dapper and the Hot Club']],
  [0, ['The Ragtime Rascals', 'The Hot Biscuit Jazz Band', 'Professor Plum’s Brass Band', 'The Dixie Doodlers']],
]

/** A made-up act that could have been playing this year. */
export function bandName(g: GameState): string {
  for (const [from, names] of BANDS) if (g.year >= from) return pick(g, names)
  return pick(g, BANDS[BANDS.length - 1][1])
}

const SHOWS: readonly string[] = [
  '@2015 a cooking competition show',
  '@1990 a true-crime documentary',
  '@2002 a reality dating show',
  '@1995 a cartoon about talking vegetables',
  '@1960 a nature documentary about otters',
  '@1955 a soap opera',
  '@2002 a show about people buying houses',
  '@2012 an anime about volleyball',
  '@1949,-1980 a cowboy western',
  '@1950 a quiz show',
  '@1948,-1985 a variety show',
  '@1955 a detective series',
  '@1966 a space adventure series',
  '@1950 a puppet show for kids',
  '@1965 a hospital drama',
  '@1975 a sitcom about a mismatched family',
]

const RADIO_SHOWS: readonly string[] = [
  'a radio serial about a masked cowboy',
  'a radio quiz show',
  'a crime drama on the radio',
  'a radio comedy hour',
  'a big band broadcast',
]

/** Something on TV this year (or on the radio before TV). */
export function showName(g: GameState): string {
  const shows = common(g, 'tv') ? eraLines(g, SHOWS) : []
  return shows.length ? pick(g, shows) : pick(g, RADIO_SHOWS)
}

/** Something on the radio. */
export function radioShow(g: GameState): string {
  return pick(g, RADIO_SHOWS)
}

const VENUE_SINCE: readonly [RegExp, number][] = [
  [/\bmall\b|shopping cent|food court|multiplex|duty-free/i, 1962],
  [/bubble tea|milk tea/i, 1988],
  [/karaoke|\bKTV\b|noraebang/i, 1980],
  [/skate ?park/i, 1966],
  [/specialty coffee|Wi-?Fi/i, 1995],
  [/\bdrive-in\b/i, 1934],
  [/cinema|movies|movie theater/i, 1910],
  [/\bthe Pearl\b|Global Village|Kite Beach|Marina Crescent|Tabiat Bridge|Hatirjheel|Magic Water Circuit|TelefériQo|Paseo Cayalá|Cinta Costera|V&A Waterfront|Aker Brygge|Tel Aviv Port|Mall at Marathon|Siam Square/i, 2000],
]

/** Did this venue exist in the player's year? (no malls in 1930, no bubble tea before the late 1980s, no internet cafés before the internet) */
export function venueExists(g: GameState, place: string): boolean {
  return VENUE_SINCE.every(([re, year]) => g.year >= year || !re.test(place)) && !anachronistic(g, place)
}

// ---------------------------------------------------------------------------
// The anachronism detector: words that can't appear before their technology (or year) existed
// where the player lives. test/anachronism.test.ts lints simulated lives with it, and the event
// library uses it as a backstop so an un-tagged modern scene is skipped in an older year.

export interface EraRule {
  id: string
  re: RegExp
  /** Flag when this tech doesn't exist yet in the country (history/timeline hasTech). */
  tech?: TechId
  /** Flag when the year is earlier than this. */
  year?: number
}

export const ERA_RULES: readonly EraRule[] = [
  { id: 'era tag', re: /(^|\n)@[\w!+,-]+\s/, year: 99999 },
  { id: 'smartphone', re: /\bsmart ?phones?\b/i, tech: 'smartphone' },
  { id: 'app', re: /\bapps?\b/i, tech: 'smartphone' },
  { id: 'selfie', re: /\bselfies?\b/i, tech: 'smartphone' },
  { id: 'emoji', re: /\bemojis?\b/i, tech: 'smartphone' },
  { id: 'group chat', re: /\bgroup ?chats?\b|\bDMs?\b|\bDM'?(d|ed)\b|\bslid into\b/, tech: 'smartphone' },
  { id: 'screen time', re: /\bscreen ?time\b|\bdoom-?scroll|\bscroll(ed|ing)? (through|on)\b|\bleft on read\b/i, tech: 'smartphone' },
  { id: 'texting', re: /\btext(ed|ing|s)?\b(?!books?|ual| of)/i, tech: 'mobilePhone', year: 1995 },
  { id: 'mobile phone', re: /\bcell ?phones?\b|\bmobile ?phones?\b|\bmobiles\b|\bcellular\b|\bringtones?\b|\bvoicemails?\b/i, tech: 'mobilePhone' },
  { id: 'my phone', re: /\b(my|your|his|her|their|our)( new| old| cracked| own| dead)? phones?\b(?! (bill|book|line|number|call|rang))/i, tech: 'mobilePhone' },
  { id: 'phone', re: /\b(tele)?phon(e|es|ed|ing)\b/i, year: 1920 },
  { id: 'internet', re: /\bonline\b|\binternet\b|\bwebsites?\b|\bweb ?sites?\b|\bthe web\b|\bgoogl(e|ed|ing)\b|\bdownload|\bupload|\bchat ?rooms?\b|\bcatfish/i, tech: 'internet' },
  { id: 'email', re: /\be-?mails?\b|\be-?mailed\b|\be-?mailing\b/i, tech: 'internet' },
  { id: 'meme', re: /\bmemes?\b|\bwent viral\b|\bgone viral\b|\bgoes viral\b|\bviral (video|post|clip|dance|challenge|sensation)\b|\btrolling\b/i, tech: 'internet' },
  { id: 'wifi', re: /\bwi-?fi\b/i, tech: 'internet', year: 2000 },
  { id: 'social media', re: /\bsocial media\b|\bfollowers\b|\bhashtags?\b|\binfluencers?\b|\btweet(s|ed)?\b|\bunfriend|\bprofile pic|\bposted (it|about|photos?|pictures?|that|the video)\b|\bposted an? (photo|picture|video|selfie|status|story|pic|clip|meme|update|rant|review)\b|\bwent live\b|\bfeed was\b/i, tech: 'socialMedia' },
  { id: 'video sharing', re: /\bvlogs?\b|\bvlogg|\byoutubers?\b|\bcontent creators?\b|\blivestream|\blive-stream|\bviews\b(?= (and|on|in))/i, tech: 'videoSharing' },
  { id: 'streaming', re: /\bstreaming\b|\bstreamers?\b|\bbinge[- ]?watch/i, tech: 'streaming' },
  { id: 'dating app', re: /\bswip(e|ed|ing) (left|right)\b|\bonline dating\b|\bdating profiles?\b/i, tech: 'datingApps' },
  { id: 'ride-hailing', re: /\bride-?shar(e|ing)\b|\bride-?hail/i, tech: 'rideHailing' },
  { id: 'crypto', re: /\bcrypto\b|\bcryptocurrenc|\bbitcoins?\b|\bNFTs?\b|\bblockchain\b/i, tech: 'crypto' },
  { id: 'video calls', re: /\bvideo ?call(s|ed|ing)?\b|\bwebcam\b|\bvideo ?chat/i, tech: 'internet', year: 2004 },
  { id: 'podcast', re: /\bpodcasts?\b/i, tech: 'internet', year: 2005 },
  { id: 'playlist', re: /\bplaylists?\b|\bmp3s?\b/i, tech: 'internet', year: 2000 },
  { id: 'laptop', re: /\blaptops?\b|\btablet computers?\b/i, tech: 'homeComputer', year: 1990 },
  { id: 'gps', re: /\bGPS\b|\bsat-?nav\b/i, tech: 'mobilePhone', year: 2000 },
  { id: 'computer', re: /\bcomputers?\b|\bPCs?\b/, tech: 'homeComputer' },
  { id: 'hacking', re: /\bhack(ed|er|ers|ing)?\b(?! (away|off|at|up|through|cough))(?!ing (cough|up))|\bidentity theft\b|\bphish(ing|ed)?\b|\bmalware\b|\bransomware\b|\bcybercrime\b/i, tech: 'internet' },
  { id: 'video games', re: /\bvideo ?games?\b|\b(game|games|gaming) consoles?\b|\bgamers?\b|\bhandheld (game|console)s?\b/i, tech: 'videoGameConsole' },
  { id: 'esports', re: /\besports?\b|\be-sports?\b/i, tech: 'esports' },
  { id: 'tv', re: /\bTVs?\b|\btelevis(ion|ions|ed)\b|\btelly\b|\bsitcoms?\b|\btalk shows?\b|\bgame shows?\b|\bthe remote\b|\bremote control\b(?! (car|plane|boat))|\bchannel surf/i, tech: 'tv' },
  { id: 'reality tv', re: /\breality (tv|show|television|star|dating)/i, year: 1992 },
  { id: 'radio', re: /\bradios?\b|\bon the air\b|\bairwaves\b/i, tech: 'radio' },
  { id: 'atm', re: /\bATMs?\b|\bcash machines?\b/, tech: 'atm' },
  { id: 'credit card', re: /\bcredit ?cards?\b|\bcard was declined\b|\bcard got declined\b|\bcard declined\b/i, tech: 'creditCards' },
  { id: 'debit card', re: /\bdebit ?cards?\b|\bcontactless\b/i, year: 1985 },
  { id: 'electric car', re: /\belectric cars?\b|\bEVs?\b|\bself-driving\b/, tech: 'electricCars' },
  { id: 'ai', re: /\bchatbots?\b|\bAI (assistant|chatbot|girlfriend|boyfriend|art|generated|-generated)\b|\bdeepfakes?\b/i, tech: 'aiAssistants' },
  { id: 'microwave', re: /\bmicrowav/i, year: 1967 },
  { id: 'vcr', re: /\bVCRs?\b|\bVHS\b|\bvideo ?tapes?\b|\bcamcorders?\b/i, year: 1978 },
  { id: 'dvd', re: /\bDVDs?\b|\bblu-?rays?\b/i, year: 1997 },
  { id: 'cd', re: /\bCDs?\b(?! [A-ZÀ-Ý])|\bcompact discs?\b/, year: 1983 },
  { id: 'cassette', re: /\bcassettes?\b|\bmix-?tapes?\b|\bboomboxe?s?\b/i, year: 1965 },
  { id: 'pager', re: /\bpagers?\b|\bbeepers?\b/i, year: 1980 },
  { id: 'vape', re: /\bvap(e|es|ed|ing)\b|\be-?cigs?\b|\be-?cigarettes?\b/i, year: 2007 },
  { id: 'earbuds', re: /\bearbuds?\b/i, year: 2001 },
  { id: 'drone', re: /\bdrones?\b/i, year: 2012 },
  { id: 'fidget', re: /\bfidget spinners?\b|\bhoverboards?\b|\be-?scooters?\b|\belectric scooters?\b/i, year: 2015 },
  { id: 'skateboard', re: /\bskateboard|\bBMX\b/i, year: 1960 },
  { id: 'rollerblade', re: /\brollerblad|\binline skat/i, year: 1980 },
  { id: 'jet ski', re: /\bjet ?skis?\b/i, year: 1972 },
  { id: 'trendy diet', re: /\bketo\b|\bpaleo\b|\bintermittent fasting\b|\bjuice cleanse\b|\bgluten-?free\b|\bcrossfit\b|\boat milk\b|\bavocado toast\b|\bkombucha\b/i, year: 2005 },
  { id: 'spin class', re: /\bspin class/i, year: 1993 },
  { id: 'cosmetic', re: /\bbotox\b|\blip fillers?\b|\blash extensions?\b|\bmicroblad|\bspray tan|\bBBL\b|\blaser hair/i, year: 1995 },
  { id: 'mma', re: /\bMMA\b|\bmixed martial arts\b|\bcage fight/i, year: 1993 },
  { id: 'modern slang', re: /\brizz\b|\bno cap\b|\byeet\b|\bok boomer\b|\bFOMO\b|\bsimp(s|ing)?\b|\bvibe check\b|\bghost(ed|ing) (me|him|her|them|you)\b|\bbestie\b|\bsituationship\b|\bGen Z\b|\bmillennials?\b|\bmain character (energy|syndrome|vibes?)\b|^main character\b|\bgaslight/i, year: 2010 },
  { id: 'jet travel', re: /\bjets?\b(?!-black| black| ski| d'Eau)|\bjet lag\b|\bjet-?set/i, year: 1958 },
  { id: 'air travel', re: /\bairports?\b|\bairlines?\b|\bflights?\b(?! of (stairs|steps|fancy)| (cages?|school|hours?|instructors?|lessons?|training|simulators?|suits?)\b)|\bflew (to|home|back|first class|economy|business class|in from|out to)\b|\bboarding pass|\blayovers?\b/i, year: 1925 },
  { id: 'nuclear', re: /\bnuclear\b|\batomic bomb|\bA-bomb/i, year: 1945 },
  { id: 'plastic', re: /\bplastic (bags?|bottles?|cups?|straws?|toys?|chairs?|wrap|forks?|tubs?)\b/i, year: 1955 },
  { id: 'drive-thru', re: /\bdrive-?thrus?\b|\bdrive-?through\b/i, year: 1948 },
  { id: 'food delivery', re: /\bdelivery apps?\b|\bfood delivery\b/i, tech: 'smartphone' },
  { id: 'baby shark', re: /\bbaby shark\b/i, year: 2016 },
  // Wondering whether anyone *will* walk on the moon is exactly what people did before 1969.
  { id: 'moon landing', re: /\bmoon landing\b|(?<!\bwill (ever )?)\bwalk(ed|ing)? on the moon\b/i, year: 1969 },
  { id: 'color tv', re: /\bcolou?r (sets?|TVs?|televisions?|telly)\b/i, tech: 'colorTv' },
  { id: 'e-bike', re: /\be-?bikes?\b/i, year: 2005 },
]

function ruleHolds(rule: EraRule, year: number, countries: readonly string[]): boolean {
  if (rule.year !== undefined && year < rule.year) return false
  if (rule.tech) return countries.some((c) => techAdoption(c, rule.tech!, year) >= 0.02)
  return true
}

/** The ids of the rules a text breaks in this year, for any of these countries. */
export function anachronismsIn(text: string, year: number, countries: readonly string[]): string[] {
  if (!text) return []
  const out: string[] = []
  for (const r of ERA_RULES) if (r.re.test(text) && !ruleHolds(r, year, countries)) out.push(r.id)
  return out
}

/** True when a text mentions something that doesn't exist yet where the player lives. */
export function anachronistic(g: GameState, text: string): boolean {
  return anachronismsIn(text, g.year, [g.character.countryId]).length > 0
}
