// The anachronism guard for history text: does a headline or era popup mention something that
// didn't exist yet in that year and country (television in 1930, the web in 1985, a jet in 1950)?
// World news legitimately reports inventions, but a Nigerian family in 1991 doesn't read about
// the World Wide Web, so the news line and the AI's era line only use headlines that pass.
// Pure: no RNG, no state.
import { techAdoption, type TechId } from './timeline'

interface GuardRule {
  re: RegExp
  /** Clashes when this technology doesn't exist yet in the country. */
  tech?: TechId
  /** Clashes before this year. */
  year?: number
}

// Mirrors the words the anachronism lint (test/anachronism.test.ts) looks for.
const RULES: readonly GuardRule[] = [
  { re: /\bsmart ?phones?\b|\bapps?\b|\bselfies?\b|\bemojis?\b/i, tech: 'smartphone' },
  { re: /\bgroup ?chats?\b|\bDMs?\b|\bslid into\b|\bscreen ?time\b|\bdoom-?scroll|\bdelivery apps?\b|\bfood delivery\b/i, tech: 'smartphone' },
  { re: /\btext(ed|ing|s)?\b(?! ?books?)(?!ual)/i, tech: 'mobilePhone', year: 1995 },
  { re: /\bcell ?phones?\b|\bmobile ?phones?\b|\bmobiles\b|\bcellular\b|\bringtone/i, tech: 'mobilePhone' },
  { re: /\b(my|your|his|her|their|our)( new| old| cracked| own)? phones?\b(?! (bill|book|line|number|call))/i, tech: 'mobilePhone' },
  { re: /\b(tele)?phon(e|es|ed|ing)\b/i, year: 1920 },
  { re: /\bonline\b|\binternet\b|\bwebsites?\b|\bweb ?sites?\b|\bthe web\b|\bworld wide web\b|\bgoogl(e|ed|ing)\b|\bdownload|\bupload|\bchat ?rooms?\b|\bcatfish/i, tech: 'internet' },
  { re: /\be-?mails?\b|\be-?mailed\b|\binbox\b|\bspam\b|\bmemes?\b|\bviral\b|\btrolling\b/i, tech: 'internet' },
  { re: /\bwi-?fi\b/i, tech: 'internet', year: 2000 },
  { re: /\bsocial media\b|\bsocial network|\bfollowers?\b(?! of)|\bhashtags?\b|\binfluencers?\b|\btweet(s|ed)?\b|\bunfriend|\bposted (it|a|about|photos?|pictures?|that)\b|\bwent live\b/i, tech: 'socialMedia' },
  { re: /\bvlogs?\b|\bvlogg|\byoutubers?\b|\bcontent creators?\b|\blivestream|\blive-stream|\bvideo-sharing\b/i, tech: 'videoSharing' },
  { re: /\bstreaming\b|\bstreamers?\b|\bbinge[- ]?watch/i, tech: 'streaming' },
  { re: /\bswip(e|ed|ing) (left|right)\b|\bonline dating\b|\bmatched with\b|\bdating apps?\b/i, tech: 'datingApps' },
  { re: /\bride-?shar(e|ing)\b|\bride-?hail/i, tech: 'rideHailing' },
  { re: /\bcrypto\b|\bcryptocurrenc|\bbitcoins?\b|\bNFTs?\b|\bblockchain\b/i, tech: 'crypto' },
  { re: /\bvideo ?call(s|ed|ing)?\b|\bwebcam\b|\bvideo ?chat/i, tech: 'internet', year: 2004 },
  { re: /\bpodcasts?\b/i, tech: 'internet', year: 2005 },
  { re: /\bplaylists?\b|\bmp3\b/i, tech: 'internet', year: 2000 },
  { re: /\blaptops?\b|\btablet computer|\bthe tablet\b/i, tech: 'homeComputer', year: 1990 },
  { re: /\bGPS\b|\bsat-?nav\b/i, tech: 'mobilePhone', year: 2000 },
  { re: /\bcomputers?\b|\bPCs?\b/, tech: 'homeComputer' },
  { re: /\bhack(ed|er|ers|ing)?\b(?! (away|off|at|through the))|\bidentity theft\b|\bphishing\b|\bmalware\b|\bransomware\b/i, tech: 'internet' },
  { re: /\bvideo ?games?\b|\bconsoles?\b|\bgamers?\b|\bhandheld\b/i, tech: 'videoGameConsole' },
  { re: /\besports?\b|\be-sports?\b/i, tech: 'esports' },
  { re: /\bTVs?\b|\btelevisions?\b|\btelevised\b|\btelly\b|\bsitcoms?\b|\btalk show|\bgame show|\bcommercials?\b|\bremote control|\bthe remote\b/i, tech: 'tv' },
  { re: /\breality (tv|show|television|star)/i, year: 1992 },
  { re: /\bradios?\b|\bon the air\b|\bairwaves\b/i, tech: 'radio' },
  { re: /\bATMs?\b|\bcash machines?\b/i, tech: 'atm' },
  { re: /\bcredit ?cards?\b|\bdebit ?cards?\b|\bcontactless\b/i, tech: 'creditCards' },
  { re: /\belectric cars?\b|\bEVs?\b|\bself-driving\b/, tech: 'electricCars' },
  { re: /\bchatbots?\b|\bAI (assistant|chatbot|girlfriend|boyfriend|art|generated)\b|\bdeepfakes?\b/i, tech: 'aiAssistants' },
  { re: /\bmicrowav/i, year: 1967 },
  { re: /\bVCRs?\b|\bVHS\b|\bvideo ?tapes?\b|\bcamcorder/i, year: 1978 },
  { re: /\bDVDs?\b|\bblu-?rays?\b/i, year: 1997 },
  { re: /\bCDs?\b|\bcompact discs?\b/, year: 1983 },
  { re: /\bcassettes?\b|\bmix-?tapes?\b|\bboombox|\bwalkman/i, year: 1965 },
  { re: /\bvap(e|es|ed|ing)\b|\be-?cig/i, year: 2007 },
  { re: /\bearbuds?\b/i, year: 2001 },
  { re: /\bdrones?\b/i, year: 2012 },
  { re: /\bfidget spinners?\b|\bhoverboards?\b|\be-?scooters?\b|\belectric scooters?\b/i, year: 2015 },
  { re: /\bskateboard|\bBMX\b/i, year: 1960 },
  { re: /\brollerblad|\binline skat/i, year: 1980 },
  { re: /\bketo\b|\bpaleo\b|\bintermittent fasting\b|\bjuice cleanse\b|\bgluten-?free\b|\bavocado toast\b|\bkombucha\b/i, year: 2005 },
  { re: /\bbotox\b|\blip fillers?\b|\bspray tan|\blaser hair/i, year: 1995 },
  { re: /\bMMA\b|\bmixed martial arts\b|\bcage fight/i, year: 1993 },
  { re: /\brizz\b|\bno cap\b|\byeet\b|\bFOMO\b|\bsimp(s|ing)?\b|\bvibe check\b|\bbestie\b|\bsituationship\b|\bGen Z\b|\bmillennials?\b|\bmain character\b|\bgaslight/i, year: 2010 },
  { re: /\bjets?\b(?!-black| black)|\bjet lag\b|\bjet-?set/i, year: 1958 },
  { re: /\bairports?\b|\bairlines?\b|\bflights?\b(?! of stairs)|\bflew (to|home|back|in|out|first|economy|business)\b|\bboarding pass|\blayover/i, year: 1925 },
  { re: /\bnuclear\b|\batomic bomb|\bA-bomb/i, year: 1945 },
  { re: /\bplastic\b(?! surgeon| surgery)/i, year: 1910 },
  { re: /\bdrive-?thrus?\b|\bdrive-?through/i, year: 1948 },
]

/** True when the technology exists (a little) in that country and year. */
function present(tech: TechId, countryId: string, year: number): boolean {
  return techAdoption(countryId, tech, year) >= 0.02
}

/** True when nothing in `text` is out of its time for that country and year. */
export function eraSafe(text: string, countryId: string, year: number): boolean {
  for (const r of RULES) {
    if (!r.re.test(text)) continue
    if (r.year !== undefined && year < r.year) return false
    if (r.tech && !present(r.tech, countryId, year)) return false
  }
  return true
}
