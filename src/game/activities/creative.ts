// Mind & Body › Creative Arts: write, make (and sell) art, cook and do stand-up comedy.
// Skills are 0-100 in g.flags 'skill.writing' | 'skill.art' | 'skill.cooking' | 'skill.comedy',
// the same store as the acting / voice / modeling lessons. The matching special talents
// (talents.ts: Writing, Art, Cooking, Comedy) learn about 1.6x faster, turn out better work, earn
// more for it and see purple hints: the form editors want this year, the medium collectors are
// buying, the best place to sell a piece, your signature dish, the style tonight's crowd is in
// the mood for. Hints point at better odds; nothing is ever a sure thing.
import { addHidden, addRelationship, addStat, count, earnIncome, log, peopleBy, remember, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { localeOf } from '../data/locales'
import { realFollowers } from '../followers'
import { chance, pick, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import { stableChoice, withHint } from '../special/common'
import { liftSkill } from '../mastery'
import { hasTalent, talentHint, talentMult, type TalentId } from '../talents'
import type { ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { brokeNotice, gate, localPrice, money, payFor, result, stablePick } from './common'
import { aiOrUpsideDown, common } from '../events/era'

// ---------------------------------------------------------------------------
// Skills

export type CraftId = 'writing' | 'art' | 'cooking' | 'comedy'

const CRAFT_TALENT: Record<CraftId, TalentId> = { writing: 'Writing', art: 'Art', cooking: 'Cooking', comedy: 'Comedy' }

/** Creative skill 0-100 (0 = never tried). */
export function craftSkill(g: GameState, id: CraftId): number {
  const v = g.flags[`skill.${id}`]
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0
}

/** How good a kid can get: an 8-year-old's novel is still an 8-year-old's novel. */
function ceilingFor(age: number): number {
  return age >= 18 ? 100 : Math.max(30, Math.min(100, 30 + (age - 8) * 6))
}

const CRAFT_NAMES: Record<CraftId, string> = { writing: 'writing', art: 'art', cooking: 'cooking', comedy: 'stand-up comedy' }

/**
 * Main character: doing a craft for the first time lifts it to the age ceiling (and keeps it
 * there); everybody else keeps the skill they have. Call from actions only.
 */
function masterCraft(g: GameState, id: CraftId, cap = ceilingFor(g.character.age)): number {
  const now = craftSkill(g, id)
  const lifted = liftSkill(g, `craft.${id}`, id === 'cooking' ? 'craft' : id === 'comedy' ? 'stage' : 'creative', CRAFT_NAMES[id], now, cap)
  if (lifted !== now) g.flags[`skill.${id}`] = lifted
  return lifted
}

/** Practice a craft: diminishing returns, capped by age; the matching talent learns ~1.6x faster. */
function train(g: GameState, id: CraftId, lo: number, hi: number): number {
  const cap = ceilingFor(g.character.age)
  // Main Character Syndrome: the first time at a craft is already mastery (to the age ceiling).
  const before = masterCraft(g, id, cap)
  if (before >= cap) return 0
  const room = Math.max(0.2, 1 - before / 110)
  const raw = randInt(g, lo, hi) * room * talentMult(g, CRAFT_TALENT[id], 1.6)
  const gain = Math.max(1, Math.min(Math.round(raw), cap - before))
  g.flags[`skill.${id}`] = before + gain
  return gain
}

/** Quality of one piece of work (1-100): skill, a little smarts, talent, luck. */
function workQuality(g: GameState, id: CraftId, extra = 0): number {
  const c = g.character
  const smarts = id === 'writing' ? 0.2 : id === 'comedy' ? 0.15 : 0.1
  const talent = hasTalent(g, CRAFT_TALENT[id]) ? 14 : 0
  const q = craftSkill(g, id) * 0.65 + c.stats.smarts * smarts + 12 + talent + extra + randInt(g, -15, 20)
  return Math.max(1, Math.min(100, Math.round(q)))
}

function skillLine(g: GameState, id: CraftId, gain: number): string {
  return `${id === 'writing' ? 'Writing' : id === 'art' ? 'Art' : id === 'cooking' ? 'Cooking' : 'Comedy'} skill: ${craftSkill(g, id)}%${gain > 0 ? ` (+${gain})` : ''}`
}

/** Pay out prize money or a sale (taxable income). */
function earn(g: GameState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  if (n > 0) earnIncome(g, n)
  return n
}

// ---------------------------------------------------------------------------
// Writing

interface FormDef {
  id: 'poem' | 'story' | 'essay' | 'screenplay' | 'novel'
  label: string
  noun: string
  emoji: string
  minAge: number
  minSkill: number
}

const FORMS: FormDef[] = [
  { id: 'poem', label: 'A poem', noun: 'poem', emoji: '\u{1F4DD}', minAge: 8, minSkill: 0 },
  { id: 'story', label: 'A short story', noun: 'short story', emoji: '\u{1F4D6}', minAge: 8, minSkill: 0 },
  { id: 'essay', label: 'An essay', noun: 'essay', emoji: '\u{1F58B}\u{FE0F}', minAge: 12, minSkill: 0 },
  { id: 'screenplay', label: 'A screenplay', noun: 'screenplay', emoji: '\u{1F3AC}', minAge: 16, minSkill: 20 },
  { id: 'novel', label: 'A novel', noun: 'novel', emoji: '\u{1F4DA}', minAge: 16, minSkill: 30 },
]

const WRITE_MAX = 3
/** Chance publishers / studios are buying at all (great manuscripts still get passed on). */
const WRITING_MARKET_ODDS = 0.85
const MAGAZINES = ['The Paper Lantern Review', 'Northbound Quarterly', 'The Midnight Ink', 'Small Hours Magazine', 'The Folded Corner', 'Lighthouse Letters']

/** The kind of writing editors are hungry for this year (stable; the Writing talent sees it). */
function trendingForm(g: GameState): FormDef['id'] {
  return stableChoice(g, 'creative.write.trend', FORMS.map((f) => f.id))
}

/** What happened to a winning piece: "won the Springfield Young Writers Prize", "was published in...". */
function successWhere(g: GameState, form: FormDef): string {
  if (g.character.age < 18) return `won the ${g.character.city} Young Writers Prize`
  return form.id === 'essay' ? `won an essay prize from ${pickLine(g, MAGAZINES)}` : `was published in ${pickLine(g, MAGAZINES)}`
}

const WRITE_SCRIPT = defineScript('act.creative.write', (g, choice) => {
  if (choice === 'cancel' || gate(g, { minAge: 8 })) return
  const form = FORMS.find((f) => f.id === choice)
  if (!form || g.character.age < form.minAge) return
  // A main character who sits down to write is already a writer (the yearly limits below still apply).
  if (yearActionsUsed(g, 'act.write') < WRITE_MAX) masterCraft(g, 'writing')
  if (craftSkill(g, 'writing') < form.minSkill) {
    return result(g, 'Write', `You ${common(g, 'homeComputer') ? 'opened a blank document' : 'rolled a blank page into the typewriter'} for ${form.label.toLowerCase()}, stared at it for three hours and wrote "Chapter One". You need writing skill ${form.minSkill}% for that. Short stories and poems are great practice.`, form.emoji)
  }
  if (yearActionsUsed(g, 'act.write') >= WRITE_MAX) {
    return result(g, 'Write', 'You have writer’s block. Every sentence you start ends in a sigh. Try again next year.', '\u{1F636}')
  }
  if (form.id === 'novel' && !useYearAction(g, 'act.novel', 1)) {
    return result(g, 'Novel', "You already finished a novel this year. Your wrists have unionized.", form.emoji)
  }
  useYearAction(g, 'act.write', WRITE_MAX)
  count(g, 'writings')
  const gain = train(g, 'writing', form.id === 'novel' ? 6 : 3, form.id === 'novel' ? 11 : 7)
  const trend = form.id === trendingForm(g)
  const q = workQuality(g, 'writing', trend ? 8 : 0)
  const writer = talentMult(g, 'Writing', 1.3)
  const skill = skillLine(g, 'writing', gain)
  addStat(g, 'happiness', randInt(g, 1, 3))

  if (form.id === 'novel') {
    count(g, 'novels')
    // Publishing is a lottery even for great books: about one year in six, every publisher
    // loves the manuscript and still passes ("the market is saturated right now").
    const openMarket = chance(g, WRITING_MARKET_ODDS)
    if (q >= 78 && openMarket) {
      const advance = earn(g, localPrice(g, (4_000 + (q - 70) * 900) * writer))
      const bestseller = q >= 92 && chance(g, 0.35 + (hasTalent(g, 'Writing') ? 0.15 : 0))
      const royalties = bestseller ? earn(g, localPrice(g, randInt(g, 40_000, 150_000) * writer)) : 0
      count(g, 'books')
      addStat(g, 'happiness', bestseller ? 15 : 8)
      if (bestseller) addHidden(g, 'fame', 4)
      remember(g, bestseller ? 'Wrote a bestselling novel.' : 'Got a novel published.')
      log(g, bestseller ? 'My novel became a bestseller!' : 'A publisher bought my novel.', 'good')
      return result(
        g,
        bestseller ? 'Bestseller!' : 'Book Deal',
        `${pickLine(g, ['A literary agent read your manuscript in one sitting and called you at midnight.', 'Three publishers fought over your novel. You let them.', 'Your manuscript landed on the right desk on the right day.'])} The advance was ${money(advance)}.${bestseller ? ` Then it hit the bestseller lists and earned another ${money(royalties)} in royalties. Book clubs are arguing about chapter 9.` : ' It hits bookstores next spring.'}\n\n${skill}`,
        '\u{1F4DA}',
        'good',
      )
    }
    if (q >= 78) {
      // A great book in a bad year: it finds its readers the hard way.
      const copies = randInt(g, 300, 3_000)
      const made = earn(g, copies * localPrice(g, 3))
      log(g, `Publishers passed on my novel, so I self-published it and sold ${copies} copies.`, 'neutral')
      return result(g, 'Bad Timing', `Every publisher called your novel "wonderful" and then said the market is "saturated right now". You self-published it instead and sold ${copies.toLocaleString('en-US')} copies (${money(made)}). The reviews are glowing. Next time, maybe.\n\n${skill}`, '\u{1F4DA}')
    }
    if (q >= 55) {
      const copies = randInt(g, 40, 900)
      const made = earn(g, copies * localPrice(g, 3))
      log(g, `I self-published my novel and sold ${copies} copies.`, 'neutral')
      return result(g, 'Self-Published', `Publishers passed, so you self-published your novel. It sold ${copies.toLocaleString('en-US')} copies (${money(made)}), mostly to people who share your last name.\n\n${skill}`, '\u{1F4DA}')
    }
    addStat(g, 'happiness', -4)
    log(g, 'Every literary agent rejected my novel.', 'bad')
    return result(g, 'Rejected', `${pickLine(g, ['Forty-seven literary agents rejected your novel. One rejection letter was just the word "no" in a very large font.', 'Your novel came back from every publisher in town. One of them returned it unopened.', 'An agent said your novel "reads like a very long grocery list". It was not a compliment.'])}\n\n${skill}`, '\u{1F4DA}', 'bad')
  }

  if (form.id === 'screenplay') {
    if (q >= 82 && chance(g, WRITING_MARKET_ODDS)) {
      const sold = earn(g, localPrice(g, randInt(g, 8_000, 30_000) * writer))
      addHidden(g, 'fame', 1)
      remember(g, 'Sold a screenplay to a film studio.')
      log(g, `I sold my screenplay for ${money(sold)}.`, 'good')
      return result(g, 'Screenplay Sold', `A studio optioned your screenplay for ${money(sold)}! They want to change the ending, the title, the main character and the genre, but it's still yours. Sort of.\n\n${skill}`, '\u{1F3AC}', 'good')
    }
    if (q >= 82) {
      log(g, 'A studio loved my screenplay, then shelved it.', 'neutral')
      return result(g, 'Shelved', `A producer loved your screenplay and walked it straight into the studio boss's office. The next morning the studio was bought by a bigger studio and every project was shelved, yours included. It's still a great script.\n\n${skill}`, '\u{1F3AC}')
    }
    log(g, q >= 60 ? 'A producer read my screenplay and called it "interesting".' : 'I wrote a screenplay nobody wanted.', q >= 60 ? 'neutral' : 'bad')
    return result(g, 'Screenplay', `${q >= 60 ? 'A producer called your screenplay "really interesting" and then never called again. That is Hollywood for "almost".' : 'Your screenplay’s big twist was that it was all a dream. Every reader saw it coming on page two.'}\n\n${skill}`, '\u{1F3AC}', q >= 60 ? undefined : 'bad')
  }

  // Poems, short stories, essays.
  if (q >= 80) {
    const prize = earn(g, localPrice(g, (form.id === 'poem' ? 100 : form.id === 'story' ? 250 : 300) * writer))
    const where = successWhere(g, form)
    if (q >= 88) remember(g, `My ${form.noun} ${where}.`)
    log(g, `My ${form.noun} ${where}.`, 'good')
    return result(g, g.character.age < 18 ? 'Prize Winner!' : 'Published!', `Your ${form.noun} ${where} and earned you ${money(prize)}. ${pick(g, [g.character.age < 18 ? 'Your literature teacher cried a little.' : 'Your old literature teacher would have cried a little.', 'Somebody you have never met quoted it online.', 'Your family framed it next to the fridge.'])}\n\n${skill}`, form.emoji, 'good')
  }
  if (q >= 55) {
    log(g, `I wrote ${form.label.toLowerCase()} I'm proud of.`, 'good')
    return result(g, form.label.replace(/^(A|An) /, ''), `${pickSite(g, [`You wrote ${form.label.toLowerCase()} that's genuinely good. You read it out loud to your pet, who seemed moved.`, `Your ${form.noun} came together nicely. A few lines are honestly beautiful.`, `You finished your ${form.noun} and only deleted it twice.`], 0x70ea2d19)}\n\n${skill}`, form.emoji, 'good')
  }
  log(g, `I wrote ${form.label.toLowerCase()}. It was not my best work.`, 'neutral')
  return result(g, form.label.replace(/^(A|An) /, ''), `${pick(g, [`You wrote ${form.label.toLowerCase()}. It rhymed "heart" with "heart" four times.`, g.year >= 1995 ? `Your ${form.noun} was so bad that autocorrect gave up halfway through.` : `Your ${form.noun} was so bad that your pencil snapped halfway through, possibly on purpose.`, `You wrote ${form.label.toLowerCase()}, read it back the next morning and quietly hid it in a drawer.`])}\n\n${skill}`, form.emoji)
})

const writeAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.write',
  label: 'Write',
  emoji: '\u{270D}\u{FE0F}',
  subtitle: (g) => `Poems, stories, screenplays, novels · Writing ${craftSkill(g, 'writing')}% · ${yearActionsUsed(g, 'act.write')}/${WRITE_MAX} this year`,
  disabledReason: (g) => gate(g, { minAge: 8 }),
  run: (g) => {
    if (yearActionsUsed(g, 'act.write') >= WRITE_MAX) return result(g, 'Write', 'You have writer’s block. Every sentence you start ends in a sigh. Try again next year.', '\u{1F636}')
    const trend = trendingForm(g)
    const skill = craftSkill(g, 'writing')
    const options: ChoiceOption[] = FORMS.filter((f) => g.character.age >= f.minAge).map((f) => ({
      id: f.id,
      label: `${f.label}${skill < f.minSkill ? ` (needs writing skill ${f.minSkill}%)` : ''}`,
      emoji: f.emoji,
      ...(f.id === trend
        ? withHint(talentHint(g, 'Writing', skill < f.minSkill ? `Editors are hungry for exactly this kind of writing this year, once your skill reaches ${f.minSkill}%.` : 'Editors are hungry for exactly this kind of writing this year.'))
        : {}),
    }))
    scriptChoice(g, WRITE_SCRIPT, 'Write', `What do you want to write? Your writing skill is ${skill}%.`, [...options, { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], { emoji: '\u{270D}\u{FE0F}' })
  },
}

// ---------------------------------------------------------------------------
// Art

interface Medium {
  id: string
  label: string
  emoji: string
  minAge: number
  past: string
}

const MEDIUMS: Medium[] = [
  { id: 'draw', label: 'Draw', emoji: '\u{270F}\u{FE0F}', minAge: 6, past: 'drew' },
  { id: 'paint', label: 'Paint', emoji: '\u{1F58C}\u{FE0F}', minAge: 6, past: 'painted' },
  { id: 'sculpt', label: 'Sculpt', emoji: '\u{1F5FF}', minAge: 10, past: 'sculpted' },
  { id: 'photo', label: 'Photography', emoji: '\u{1F4F7}', minAge: 12, past: 'photographed' },
]

const ART_TITLES = [
  'Sunday Light',
  'Portrait of My Cat (Unimpressed)',
  'The Bus Stop at Dusk',
  'Self-Portrait With Bad Haircut',
  'Still Life With Leftovers',
  'Blue Study No. 4',
  'The Neighbor’s Fence',
  'Existential Toaster',
  'Rain on {city}',
  'Morning in {city}',
  'Grandma’s Hands',
  'Untitled (Probably a Horse)',
]

interface Piece {
  title: string
  q: number
  medium: string
  age: number
}

const PIECES_KEY = 'creative.pieces'
const MAX_PIECES = 6
const ART_MAX = 3

function pieces(g: GameState): Piece[] {
  const raw = g.flags[PIECES_KEY]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is { [k: string]: Json } => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => ({ title: typeof x.title === 'string' ? x.title : 'Untitled', q: typeof x.q === 'number' && Number.isFinite(x.q) ? Math.max(1, Math.min(100, Math.round(x.q))) : 30, medium: typeof x.medium === 'string' ? x.medium : 'paint', age: typeof x.age === 'number' ? x.age : 0 }))
}

function savePieces(g: GameState, list: Piece[]): void {
  g.flags[PIECES_KEY] = list.map((p) => ({ title: p.title, q: p.q, medium: p.medium, age: p.age }))
}

/** What collectors are snapping up this year (stable; the Art talent sees it). */
function trendingMedium(g: GameState): string {
  return stableChoice(g, 'creative.art.trend', MEDIUMS.map((m) => m.id))
}

const ART_SCRIPT = defineScript('act.creative.art', (g, choice) => {
  if (choice === 'cancel' || gate(g, { minAge: 6 })) return
  const m = MEDIUMS.find((x) => x.id === choice)
  if (!m || g.character.age < m.minAge) return
  if (!useYearAction(g, 'act.art', ART_MAX)) return result(g, 'Art', 'Your brushes are crusty and your muse is on vacation. Try again next year.', '\u{1F3A8}')
  count(g, 'artworks')
  const gain = train(g, 'art', 3, 7)
  const trend = m.id === trendingMedium(g)
  const q = workQuality(g, 'art', trend ? 6 : 0)
  const title = pick(g, ART_TITLES).replace('{city}', g.character.city)
  const list = pieces(g)
  let gifted = ''
  if (list.length >= MAX_PIECES) {
    // No room left: the weakest piece goes to Grandma's fridge.
    list.sort((a, b) => a.q - b.q)
    const out = list.shift()
    if (out) gifted = ` You ran out of wall space, so "${out.title}" went to live on a relative's fridge.`
  }
  list.push({ title, q, medium: m.id, age: g.character.age })
  savePieces(g, list)
  addStat(g, 'happiness', randInt(g, 2, 5))
  const skill = skillLine(g, 'art', gain)
  if (q >= 85) {
    remember(g, `Made "${title}", a genuinely striking piece of art.`)
    log(g, `I ${m.past} "${title}". It might be a masterpiece.`, 'good')
    return result(g, 'Masterpiece?', `You ${m.past} "${title}" and stepped back in stunned silence. It's the best thing you've ever made.${gifted}\n\nQuality ${q}/100 · ${skill}`, m.emoji, 'good')
  }
  log(g, `I ${m.past} "${title}".`, q >= 50 ? 'good' : 'neutral')
  return result(
    g,
    'Art',
    `${q >= 50 ? pickSite(g, [`You ${m.past} "${title}". It turned out really well.`, `"${title}" came together beautifully. You signed it with a little flourish.`], 0xd65e8ab7) : pickSite(g, [`You ${m.past} "${title}". Your family said it was "very interesting".`, `"${title}" did not go to plan. You're calling it abstract.`], 0x1230a8ee)}${gifted}\n\nQuality ${q}/100 · ${skill}`,
    m.emoji,
    q >= 50 ? 'good' : undefined,
  )
})

const makeArtAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.art',
  label: 'Make Art',
  emoji: '\u{1F3A8}',
  subtitle: (g) => `Draw, paint, sculpt or shoot · Art ${craftSkill(g, 'art')}% · ${yearActionsUsed(g, 'act.art')}/${ART_MAX} this year`,
  disabledReason: (g) => gate(g, { minAge: 6 }),
  run: (g) => {
    if (yearActionsUsed(g, 'act.art') >= ART_MAX) return result(g, 'Art', 'Your brushes are crusty and your muse is on vacation. Try again next year.', '\u{1F3A8}')
    const trend = trendingMedium(g)
    scriptChoice(
      g,
      ART_SCRIPT,
      'Make Art',
      `What will you make? Your art skill is ${craftSkill(g, 'art')}%.`,
      [
        ...MEDIUMS.filter((m) => g.character.age >= m.minAge).map((m) => ({ id: m.id, label: m.label, emoji: m.emoji, ...(m.id === trend ? withHint(talentHint(g, 'Art', 'Collectors are snapping these up this year.')) : {}) })),
        { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F3A8}' },
    )
  },
}

// Selling art

interface Venue {
  id: 'fair' | 'online' | 'gallery'
  label: string
  emoji: string
  mult: number
}

const SALE_MAX = 2
const SALE_LIMIT_TEXT = "You've already tried to sell art twice this year. Let the market miss you a little."

const VENUES: Venue[] = [
  { id: 'fair', label: 'A local art fair', emoji: '\u{1F3AA}', mult: 0.5 },
  { id: 'online', label: 'An online shop', emoji: '\u{1F6D2}', mult: 0.9 },
  { id: 'gallery', label: 'A gallery', emoji: '\u{1F5BC}\u{FE0F}', mult: 2.5 },
]

/** Where art can be sold this year: online shops only once people shop online. */
function venuesNow(g: GameState): Venue[] {
  return VENUES.filter((v) => v.id !== 'online' || common(g, 'onlineShopping'))
}

/** The asking price of a piece at a venue (local dollars). */
function piecePrice(g: GameState, p: Piece, v: Venue): number {
  const fame = Math.max(0, g.character.hidden.fame)
  const trend = p.medium === trendingMedium(g) ? 1.3 : 1
  return localPrice(g, (15 + p.q * p.q * 0.35) * v.mult * (1 + fame / 50) * trend * talentMult(g, 'Art', 1.4))
}

/** Chance a piece sells at a venue (pure: safe for hints). */
function saleOdds(g: GameState, p: Piece, v: Venue): number {
  const art = hasTalent(g, 'Art') ? 0.1 : 0
  const followers = realFollowers(g.character.social)
  if (v.id === 'fair') return Math.min(0.92, 0.75 + p.q / 1000 + art)
  if (v.id === 'online') return Math.min(0.85, 0.3 + p.q / 250 + (followers > 50_000 ? 0.15 : followers > 2_000 ? 0.05 : 0) + art)
  return Math.max(0.03, Math.min(0.85, (p.q - 55) / 45 + art))
}

/** Table fee at a venue (only the art fair charges one). */
function venueFee(g: GameState, v: Venue): number {
  return v.id === 'fair' ? localPrice(g, 25) : 0
}

/** Expected take from trying a venue: odds x price, minus the fee (pure: safe for hints). */
function venueValue(g: GameState, p: Piece, v: Venue): number {
  if (v.id === 'gallery' && (p.q < 60 || g.character.age < 16)) return -Infinity
  return saleOdds(g, p, v) * piecePrice(g, p, v) - venueFee(g, v)
}

const SELL_VENUE_SCRIPT = defineScript('act.creative.sellVenue', (g, choice, data) => {
  if (choice === 'cancel' || gate(g, { minAge: 12 })) return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const idx = typeof d.index === 'number' ? d.index : -1
  const list = pieces(g)
  const p = list[idx]
  const v = VENUES.find((x) => x.id === choice)
  if (!p || !v) return
  if (v.id === 'gallery' && (g.character.age < 16 || p.q < 60)) return result(g, 'Gallery', 'The gallery owner looked at your piece over her glasses and said, "We’ll be in touch." She will not be in touch.', '\u{1F5BC}\u{FE0F}')
  if (yearActionsUsed(g, 'act.artSale') >= SALE_MAX) return result(g, 'Sell Art', SALE_LIMIT_TEXT, '\u{1F3A8}')
  const fee = venueFee(g, v)
  // Can't pay for the table: no harm done, the attempt isn't used up.
  if (fee > 0 && !payFor(g, fee, true)) return brokeNotice(g, fee, 'a table at the art fair')
  useYearAction(g, 'act.artSale', SALE_MAX)
  const price = piecePrice(g, p, v)
  if (!chance(g, saleOdds(g, p, v))) {
    log(g, `I tried to sell "${p.title}", but nobody bought it.`, 'neutral')
    return result(g, 'No Sale', `${v.id === 'fair' ? 'People walked past your table all day. One man asked if you sold hot dogs.' : v.id === 'online' ? `Your listing got 400 views and one comment asking if it was ${aiOrUpsideDown(g)}.` : 'The gallery hung your piece for a month. Lots of nodding, no buyers.'} "${p.title}" is still yours.`, '\u{1F3A8}')
  }
  list.splice(idx, 1)
  savePieces(g, list)
  const made = earn(g, price)
  count(g, 'artSold')
  addStat(g, 'happiness', 6)
  if (v.id === 'gallery') addHidden(g, 'fame', 1)
  log(g, `I sold "${p.title}" for ${money(made)}.`, 'good')
  return result(g, 'Sold!', `${v.id === 'gallery' ? 'A collector in a very expensive scarf bought' : v.id === 'online' ? 'A stranger on the internet bought' : 'A nice couple at the fair bought'} "${p.title}" for ${money(made)}.${fee > 0 ? ` (The table cost ${money(fee)}.)` : ''}`, '\u{1F4B0}', 'good')
})

const SELL_SCRIPT = defineScript('act.creative.sell', (g, choice) => {
  if (choice === 'cancel') return
  const idx = Number(choice)
  const p = pieces(g)[idx]
  if (!p) return
  // Art talent: you know which room this piece belongs in (best expected take after fees).
  const venues = venuesNow(g)
  const best = venues.reduce((a, b) => (venueValue(g, p, b) > venueValue(g, p, a) ? b : a))
  scriptChoice(
    g,
    SELL_VENUE_SCRIPT,
    'Sell Art',
    `Where will you try to sell "${p.title}" (quality ${p.q}/100)?`,
    [
      ...venues.map((v) => ({
        id: v.id,
        label: `${v.label} · asking ${money(piecePrice(g, p, v))}${v.id === 'gallery' ? ' (quality 60+, age 16+)' : v.id === 'fair' ? ` (table ${money(localPrice(g, 25))})` : ''}`,
        emoji: v.emoji,
        ...(v.id === best.id ? withHint(talentHint(g, 'Art', 'Your best bet for this piece: the right buyers will be there.')) : {}),
      })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F4B0}', data: { index: idx } },
  )
})

const sellArtAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.sell',
  label: 'Sell Art',
  emoji: '\u{1F4B0}',
  subtitle: (g) => `${pieces(g).length} piece${pieces(g).length === 1 ? '' : 's'} in your portfolio · ${yearActionsUsed(g, 'act.artSale')}/${SALE_MAX} sales attempts this year`,
  visible: (g) => pieces(g).length > 0,
  disabledReason: (g) => gate(g, { minAge: 12 }),
  run: (g) => {
    const list = pieces(g)
    if (!list.length) return
    if (yearActionsUsed(g, 'act.artSale') >= SALE_MAX) return result(g, 'Sell Art', SALE_LIMIT_TEXT, '\u{1F3A8}')
    scriptChoice(
      g,
      SELL_SCRIPT,
      'Sell Art',
      'Which piece do you want to sell?',
      [...list.map((p, i) => ({ id: String(i), label: `"${p.title}" · quality ${p.q}/100`, emoji: MEDIUMS.find((m) => m.id === p.medium)?.emoji ?? '\u{1F3A8}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F3A8}' },
    )
  },
}

// ---------------------------------------------------------------------------
// Cooking

const COOK_MAX = 3

function localDishes(g: GameState): string[] {
  const foods = localeOf(g.character.countryId).foods
  return foods.length ? foods : ['pasta', 'a home-cooked stew', 'fried rice']
}

/**
 * Your signature dish: the one local dish you cook best. Fixed for this life in this country
 * (never touches g.rng); only the Cooking talent knows which one it is.
 */
function signatureDish(g: GameState): string {
  const list = localDishes(g)
  const key = `${g.lifeId}|${g.character.id}|${g.character.countryId}|signature`
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return list[(h >>> 0) % list.length]
}

/** This year's menu: your signature dish and two other local dishes, in a stable order. */
function dishes(g: GameState): string[] {
  const signature = signatureDish(g)
  const others = stablePick(g, 'creative.cook.menu', localDishes(g).filter((d) => d !== signature), 2)
  const slot = stableChoice(g, 'creative.cook.slot', [0, 1, 2])
  const menu = [...others]
  menu.splice(Math.min(slot, menu.length), 0, signature)
  return menu
}

/** Who you cook for at home. */
function household(g: GameState): Person[] {
  const c = g.character
  const family = c.residence.status === 'parents' ? peopleBy(g, ['parent', 'stepparent', 'sibling']) : []
  return [...family, ...peopleBy(g, ['spouse', 'partner', 'fiance', 'child'])].filter((p) => p.alive)
}

const COOK_SCRIPT = defineScript('act.creative.cook', (g, choice, data) => {
  if (choice === 'cancel' || gate(g, { minAge: 8 })) return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const menu = Array.isArray(d.menu) ? d.menu.filter((x): x is string => typeof x === 'string') : []
  const dish = choice === 'experiment' ? 'something experimental' : menu[Number(choice)]
  if (!dish) return
  if (!useYearAction(g, 'act.cook', COOK_MAX)) return result(g, 'Cook', g.year >= 1975 ? 'The kitchen has seen enough of you this year. So has the smoke alarm.' : 'The kitchen has seen enough of you this year. So has the fire brigade.', '\u{1F373}')
  count(g, 'mealsCooked')
  const gain = train(g, 'cooking', 3, 7)
  const signature = dish === signatureDish(g)
  const q = workQuality(g, 'cooking', (signature ? 10 : 0) + (choice === 'experiment' ? randInt(g, -15, 15) : 0))
  const eaters = household(g)
  const skill = skillLine(g, 'cooking', gain)
  if (q < 25) {
    if (chance(g, 0.3)) addStat(g, 'health', -randInt(g, 2, 5))
    for (const p of eaters) addRelationship(p, -randInt(g, 1, 3))
    log(g, `I cooked ${dish}. It was a disaster.`, 'bad')
    return result(g, 'Kitchen Disaster', `${pick(g, [g.year >= 1975 ? `You tried to make ${dish} and set off every smoke alarm in the building.` : `You tried to make ${dish} and smoked out the whole building.`, `Your ${dish} came out a color that food should never be.`, `You cooked ${dish}. The dog wouldn't eat it, and the dog eats socks.`])}\n\n${skill}`, '\u{1F525}', 'bad')
  }
  const good = q >= 60
  if (good) addStat(g, 'health', 1)
  addStat(g, 'happiness', good ? randInt(g, 3, 6) : 1)
  for (const p of eaters) addRelationship(p, good ? randInt(g, 2, 5) : 0)
  const who = eaters.length === 0 ? '' : eaters.length === 1 ? ` ${eaters[0].firstName} ${good ? 'had seconds' : 'ate it. Politely'}.` : ` ${good ? 'Everyone at the table went back for seconds.' : 'Everyone ate it. Politely.'}`
  log(g, good ? `I cooked a delicious ${dish === 'something experimental' ? 'experimental dish' : dish}.` : `I cooked ${dish}.`, good ? 'good' : 'neutral')
  return result(
    g,
    q >= 85 ? 'Chef’s Kiss' : 'Home Cooking',
    `${q >= 85 ? `Your ${dish} was restaurant-good. Maybe better.` : good ? `You made ${dish} from scratch and it was really tasty.` : `You made ${dish}. It was edible, which is a start.`}${who}\n\n${skill}`,
    '\u{1F373}',
    good ? 'good' : undefined,
  )
})

function dishChoices(g: GameState, menu: string[], hintText: string): ChoiceOption[] {
  const signature = signatureDish(g)
  return [
    ...menu.map((dish, i) => ({ id: String(i), label: dish.charAt(0).toUpperCase() + dish.slice(1), emoji: '\u{1F37D}\u{FE0F}', ...(dish === signature ? withHint(talentHint(g, 'Cooking', hintText)) : {}) })),
    { id: 'experiment', label: 'Something experimental', emoji: '\u{1F9EA}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
  ]
}

const cookAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.cook',
  label: 'Cook',
  emoji: '\u{1F373}',
  subtitle: (g) => `Cook a meal · Cooking ${craftSkill(g, 'cooking')}% · ${yearActionsUsed(g, 'act.cook')}/${COOK_MAX} this year`,
  disabledReason: (g) => gate(g, { minAge: 8 }),
  run: (g) => {
    if (yearActionsUsed(g, 'act.cook') >= COOK_MAX) return result(g, 'Cook', g.year >= 1975 ? 'The kitchen has seen enough of you this year. So has the smoke alarm.' : 'The kitchen has seen enough of you this year. So has the fire brigade.', '\u{1F373}')
    const menu = dishes(g)
    scriptChoice(g, COOK_SCRIPT, 'Cook', `What are you making? Your cooking skill is ${craftSkill(g, 'cooking')}%.`, dishChoices(g, menu, 'Your signature dish. You could make it blindfolded.'), { emoji: '\u{1F373}', data: { menu } })
  },
}

const CONTEST_SCRIPT = defineScript('act.creative.contest', (g, choice, data) => {
  if (choice === 'cancel' || gate(g, { minAge: 12 })) return
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const menu = Array.isArray(d.menu) ? d.menu.filter((x): x is string => typeof x === 'string') : []
  const dish = choice === 'experiment' ? 'something experimental' : menu[Number(choice)]
  if (!dish) return
  if (!useYearAction(g, 'act.cookContest', 1)) return result(g, 'Cooking Contest', 'You already competed this year. The judges are still digesting.', '\u{1F3C6}')
  const fee = localPrice(g, 20)
  if (!payFor(g, fee, true)) {
    g.yearActions['act.cookContest'] = 0
    return brokeNotice(g, fee, 'the contest entry fee')
  }
  count(g, 'cookingContests')
  const gain = train(g, 'cooking', 2, 5)
  const q = workQuality(g, 'cooking', (dish === signatureDish(g) ? 10 : 0) + (choice === 'experiment' ? randInt(g, -20, 20) : 0) - 8)
  const skill = skillLine(g, 'cooking', gain)
  const contest = g.character.age < 18 ? `the ${g.character.city} Junior Cook-Off` : `the ${g.character.city} Cook-Off`
  if (q >= 80) {
    const prize = earn(g, localPrice(g, 500 * talentMult(g, 'Cooking', 1.3)))
    addStat(g, 'happiness', 12)
    remember(g, `Won ${contest} with ${dish}.`)
    log(g, `I won ${contest} with my ${dish}!`, 'good')
    return result(g, 'First Place!', `Your ${dish} won ${contest}! The judges fought over the last bite. You took home ${money(prize)} and a ribbon the size of a dinner plate.\n\n${skill}`, '\u{1F947}', 'good')
  }
  if (q >= 65) {
    const prize = earn(g, localPrice(g, 100))
    addStat(g, 'happiness', 5)
    log(g, `I placed in ${contest} with my ${dish}.`, 'good')
    return result(g, 'Runner-Up', `Your ${dish} placed in the top three at ${contest} (${money(prize)}). One judge said it "needed salt", which you will remember forever.\n\n${skill}`, '\u{1F948}', 'good')
  }
  addStat(g, 'happiness', -3)
  log(g, `I didn't place at ${contest}.`, 'neutral')
  return result(g, 'Cooking Contest', `${pickSite(g, [`The judges took one bite of your ${dish} and wrote for a long, long time.`, `Your ${dish} finished somewhere between "fine" and "brave".`, `A judge asked if your ${dish} was supposed to be crunchy. It was not.`], 0x1d60ad7b)}\n\n${skill}`, '\u{1F3C6}')
})

const contestAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.contest',
  label: 'Cooking Contest',
  emoji: '\u{1F3C6}',
  subtitle: (g) => `Enter the local cook-off (${money(localPrice(g, 20))}) · once a year`,
  disabledReason: (g) => gate(g, { minAge: 12 }) ?? (yearActionsUsed(g, 'act.cookContest') >= 1 ? 'You already competed this year.' : null),
  run: (g) => {
    const menu = dishes(g)
    scriptChoice(g, CONTEST_SCRIPT, 'Cooking Contest', `Which dish will you put in front of the judges? Your cooking skill is ${craftSkill(g, 'cooking')}%.`, dishChoices(g, menu, 'Your signature dish. The judges will taste the difference.'), { emoji: '\u{1F3C6}', data: { menu } })
  },
}

// ---------------------------------------------------------------------------
// Stand-up comedy

interface Style {
  id: string
  label: string
  emoji: string
}

const STYLES: Style[] = [
  { id: 'observational', label: 'Observational bits', emoji: '\u{1F9D0}' },
  { id: 'selfDep', label: 'Roast yourself', emoji: '\u{1F648}' },
  { id: 'crowd', label: 'Crowd work', emoji: '\u{1F440}' },
  { id: 'story', label: 'A long, winding story', emoji: '\u{1F4DC}' },
  { id: 'oneLiners', label: 'Rapid-fire one-liners', emoji: '\u{26A1}' },
  { id: 'absurd', label: 'Absurdist chaos', emoji: '\u{1F92A}' },
]

const STANDUP_MAX = 3

/** What tonight's crowd is in the mood for (stable per set; the Comedy talent reads the room). */
function crowdMood(g: GameState): string {
  return stableChoice(g, `creative.comedy.mood.${yearActionsUsed(g, 'act.standup')}`, STYLES.map((s) => s.id))
}

function stage(g: GameState): { name: string; pay: [number, number] } {
  const skill = craftSkill(g, 'comedy')
  if (skill >= 70) return { name: `a sold-out theater in ${g.character.city}`, pay: [1_500, 6_000] }
  // Comedy clubs and open mics date from the sixties; before that, variety halls and amateur nights.
  if (skill >= 35) return { name: g.year >= 1960 ? `a comedy club in ${g.character.city}` : `a variety hall in ${g.character.city}`, pay: [100, 500] }
  return { name: g.year >= 1960 ? 'an open mic night' : 'an amateur night', pay: [0, 40] }
}

const STANDUP_SCRIPT = defineScript('act.creative.standup', (g, choice) => {
  if (choice === 'cancel' || gate(g, { minAge: 16 })) return
  const style = STYLES.find((s) => s.id === choice)
  if (!style) return
  const mood = crowdMood(g)
  if (!useYearAction(g, 'act.standup', STANDUP_MAX)) return result(g, 'Stand-Up', "You've done enough sets this year. Your material needs time to marinate.", '\u{1F3A4}')
  count(g, 'comedySets')
  masterCraft(g, 'comedy')
  const c = g.character
  const where = stage(g)
  const comic = hasTalent(g, 'Comedy')
  const perf = craftSkill(g, 'comedy') * 0.55 + c.stats.smarts * 0.15 + c.hidden.craziness * 0.05 + 15 + (comic ? 15 : 0) + (style.id === mood ? 12 : 0) + randInt(g, -20, 20)
  // Bombing teaches you a little more than killing does.
  const gain = train(g, 'comedy', 3, perf < 40 ? 7 : 6)
  const skill = skillLine(g, 'comedy', gain)
  const fameScale = 1 + Math.max(0, c.hidden.fame) / 40
  if (perf >= 65) {
    const pay = earn(g, where.pay[1] > 0 ? localPrice(g, randInt(g, Math.max(1, where.pay[0]), where.pay[1]) * fameScale) : 0)
    // Comedy talent: clips of your best sets spread twice as fast.
    if (c.hidden.fame < 80) addHidden(g, 'fame', comic ? 2 : 1)
    addStat(g, 'happiness', 8)
    log(g, `I killed it at ${where.name}.`, 'good')
    return result(g, 'You Killed!', `${pickSite(g, ['The crowd laughed so hard someone fell off a bar stool.', 'You got an applause break in the middle of a joke. That never happens.', `A heckler tried to interrupt and you destroyed him so politely he asked for ${common(g, 'smartphone') ? 'a selfie' : 'an autograph'} afterward.`], 0xf29db1ce)} You played ${where.name}${pay > 0 ? ` and got paid ${money(pay)}` : ''}.\n\n${skill}`, style.emoji, 'good')
  }
  if (perf >= 40) {
    const pay = earn(g, where.pay[1] > 0 ? localPrice(g, randInt(g, Math.max(1, where.pay[0]), where.pay[1]) * fameScale * 0.5) : 0)
    addStat(g, 'happiness', 2)
    log(g, `I did a set at ${where.name}. It went okay.`, 'neutral')
    return result(g, 'Stand-Up', `${pickLine(g, ['Some jokes landed, some died quietly in the corner. A solid night.', 'The crowd was warm but distracted. Somebody’s birthday cake upstaged your closer.', 'You got real laughs and one pity laugh from your own mom.'])} You played ${where.name}${pay > 0 ? ` for ${money(pay)}` : ''}.\n\n${skill}`, style.emoji)
  }
  addStat(g, 'happiness', -6)
  log(g, `I bombed at ${where.name}.`, 'bad')
  return result(g, 'You Bombed', `${pickLine(g, ['Silence. Just the hum of the fridge and one man eating soup very loudly.', 'Your opener was met with a cough. Your closer was met with the exit door.', 'A heckler yelled "Get off the stage!" and the crowd applauded him instead of you.'])} Every great comic has nights like this. Probably.\n\n${skill}`, '\u{1F997}', 'bad')
})

const standupAction: MenuAction = {
  type: 'action',
  id: 'mb.creative.standup',
  label: 'Stand-Up Comedy',
  emoji: '\u{1F3A4}',
  subtitle: (g) => `${stage(g).name.charAt(0).toUpperCase()}${stage(g).name.slice(1)} · Comedy ${craftSkill(g, 'comedy')}% · ${yearActionsUsed(g, 'act.standup')}/${STANDUP_MAX} this year`,
  disabledReason: (g) => gate(g, { minAge: 16 }),
  run: (g) => {
    if (yearActionsUsed(g, 'act.standup') >= STANDUP_MAX) return result(g, 'Stand-Up', "You've done enough sets this year. Your material needs time to marinate.", '\u{1F3A4}')
    const mood = crowdMood(g)
    scriptChoice(
      g,
      STANDUP_SCRIPT,
      'Stand-Up Comedy',
      `You're on next at ${stage(g).name}. What kind of set will you do?`,
      [...STYLES.map((s) => ({ ...s, ...(s.id === mood ? withHint(talentHint(g, 'Comedy', 'You can read this room: they are in the mood for exactly this.')) : {}) })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
      { emoji: '\u{1F3A4}' },
    )
  },
}

// ---------------------------------------------------------------------------
// Menu

export const creativeMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.creative',
  label: 'Creative Arts',
  emoji: '\u{1F58C}\u{FE0F}',
  subtitle: 'Write, make art, cook and do stand-up',
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 6 }),
  header: (g) =>
    `Writing ${craftSkill(g, 'writing')}% · Art ${craftSkill(g, 'art')}% · Cooking ${craftSkill(g, 'cooking')}% · Comedy ${craftSkill(g, 'comedy')}%. Practice makes better, a talent makes it faster, and good work can earn real money.`,
  children: (): MenuNode[] => [writeAction, makeArtAction, sellArtAction, cookAction, contestAction, standupAction],
}
