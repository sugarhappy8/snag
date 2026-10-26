// Activities › Hang Out: what people actually did for fun, by era and by place. The arcade and
// the mall, a rented video, a mixtape for a friend, a LAN party, the cyber cafe, karaoke night,
// the roller rink, a radio dedication, a streaming evening, an hour of scrolling and a check-in
// on the family group chat. Each one only exists where and when it did (techOdds, not just the
// calendar: a 1998 teen in Lagos has a cyber cafe, not a home PC), costs what it cost then
// (eraPrice, in constant dollars), and has the limits and trade-offs real leisure has: a
// per-year cap, a price, a diminishing return (the feed) or a risk.
//
// Menus are pure functions of state; only run() and the helpers it calls mutate g.
import { addMoney, addRelationship, addStat, count, formatMoney, log, relationLabel } from '../core'
import { common, exists, landline, mixWord } from '../events/era'
import { adoption, eraPrice, regionIs, videoChain, wealthOf } from '../events/era-late-kit'
import { PRESENT_YEAR } from '../history/timeline'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { masterInstrument } from '../special/common'
import { hasTalent, talentHint } from '../talents'
import type { GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { brokeNotice, companionCandidates, gate, isAbroad, isFamily, payFor, result, usesLeft } from './common'

type Companions = 'none' | 'optional'

interface Pastime {
  id: string
  label: string
  emoji: string
  /** Youngest age that may go at all (under 13 only with someone). */
  minAge: number
  /** Uses per year. */
  limit: number
  /** Where and when it exists (technology, wealth, country). Pure. */
  exists: (g: GameState) => boolean
  /** One line under the label, without the price. */
  blurb: (g: GameState) => string
  /** Price of one outing in constant dollars (0 when free). Pure. */
  cost: (g: GameState) => number
  companions: Companions
  /** A purple talent hint, computed from the same numbers the outcome uses. */
  hint?: (g: GameState) => string | null
  /** What happens. The price is already paid; `partner` is who came along, if anyone. */
  play: (g: GameState, partner: Person | undefined) => void
}

const KEY = 'act.pastime.'

function consumer(g: GameState): boolean {
  return wealthOf(g) >= 0.3
}

function net(g: GameState): boolean {
  return exists(g, 'internet')
}

/** The mood change of the n-th hour on the feed this year: the first lifts you, the later ones do not. */
export function scrollMood(timesBefore: number): number {
  return Math.max(-3, 3 - 2 * timesBefore)
}

/** Is this the kind of place a kid goes alone? (Under 13: only with someone.) */
function aloneOk(g: GameState, def: Pastime): boolean {
  return g.character.age >= 13 || def.id === 'groupChat' || def.id === 'streaming'
}

/** The odds of beating the high score at the arcade / a LAN party round (same number the hint shows). */
export function winOdds(g: GameState, base: number): number {
  return hasTalent(g, 'Gaming') ? Math.round(base * 1.7 * 100) / 100 : base
}

function karaokeBars(g: GameState): boolean {
  return regionIs(g, 'japan', 'korea', 'china', 'seasia') ? g.year >= 1980 : g.year >= 1990 && wealthOf(g) >= 0.5
}

const DEFS: Pastime[] = [
  {
    id: 'arcade',
    label: 'Arcade',
    emoji: '\u{1F579}\u{FE0F}',
    minAge: 7,
    limit: 4,
    exists: (g) => g.year >= 1978 && g.year <= 2008 && adoption(g, 'videoGameConsole', 0.04) && wealthOf(g) >= 0.2,
    blurb: () => 'Quarters, tokens and the top score',
    cost: (g) => eraPrice(g, 3),
    companions: 'optional',
    hint: (g) => talentHint(g, 'Gaming', `Your reflexes are real: about ${Math.round(winOdds(g, 0.2) * 100)}% to beat the top score.`) || null,
    play: (g, partner) => {
      const win = chance(g, winOdds(g, 0.2))
      if (win) {
        addStat(g, 'happiness', randInt(g, 6, 10))
        g.character.hidden.fame = Math.min(100, g.character.hidden.fame + 1)
        log(g, 'I put my initials at the top of the arcade high-score list.', 'good')
      } else addStat(g, 'happiness', randInt(g, 1, 4))
      const text = win ? 'You beat the top score and typed in your initials. For a week you were the king of the arcade.' : pickLine(g, ['You spent your coins on a long, glorious, losing game.', 'You made it to the third level before a small child took over the machine.', 'You watched the attract mode demo more than you played.'])
      result(g, 'Arcade', `${text}${partner ? `\n\n${partner.firstName} cheered you on from behind the cabinet.` : ''}`, '\u{1F579}\u{FE0F}', win ? 'good' : undefined)
    },
  },
  {
    id: 'mall',
    label: 'The Mall',
    emoji: '\u{1F6CD}\u{FE0F}',
    minAge: 10,
    limit: 5,
    exists: (g) => g.year >= 1965 && consumer(g) && adoption(g, 'tv', 0.25) && !(g.year >= 2020 && g.year <= 2021),
    blurb: () => 'Window-shop, people-watch, share a snack',
    cost: (g) => eraPrice(g, 5),
    companions: 'optional',
    play: (g, partner) => {
      addStat(g, 'happiness', randInt(g, 2, 6))
      let extra = ''
      if (!partner && g.character.age >= 10 && g.character.age <= 25 && chance(g, 0.18)) {
        const f = createPerson(g, { relation: 'friend', age: g.character.age + randInt(g, -2, 2), relationship: randInt(g, 45, 65) })
        notePerson(f, 'Met the player hanging out at the mall.')
        extra = `\n\nYou got talking to ${f.firstName} ${f.lastName} at the food court and swapped ${g.year >= 2008 && common(g, 'smartphone') ? 'numbers' : 'phone numbers'}.`
        log(g, `I made a new friend at the mall: ${f.firstName}.`, 'good')
      } else if (partner) {
        extra = `\n\nYou and ${partner.firstName} spent two hours trying things on and buying nothing.`
      }
      result(g, 'The Mall', `${pickLine(g, ['You drifted from store to store until the music started to sound the same.', 'You people-watched from a bench by the fountain.', 'You split a pretzel and judged everyone’s shoes.'])}${extra}`, '\u{1F6CD}\u{FE0F}')
    },
  },
  {
    id: 'video',
    label: 'Rent a Video',
    emoji: '\u{1F4FC}',
    minAge: 8,
    limit: 5,
    exists: (g) => g.year >= 1982 && g.year <= 2012 && common(g, 'tv') && wealthOf(g) >= 0.15 && !common(g, 'streaming', 0.4),
    blurb: (g) => `A film for the weekend from ${videoChain(g) ?? 'the video shop'}`,
    cost: (g) => eraPrice(g, 4),
    companions: 'optional',
    play: (g, partner) => {
      const stars = pick(g, [2, 3, 3, 4, 4, 5])
      addStat(g, 'happiness', stars)
      let late = ''
      if (chance(g, 0.15)) {
        const fee = eraPrice(g, 6)
        if (g.character.money >= fee) {
          addMoney(g, -fee, 'fine')
          late = `\n\nYou returned it a day late and paid a ${formatMoney(fee)} fee.`
        }
      }
      const shop = videoChain(g) ?? 'the video shop'
      const rewind = g.year < 2000 ? ' (Be kind, rewind.)' : ''
      result(g, 'Movie Night', `You picked a film at ${shop} after twenty minutes in the aisles and watched it at home. ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}${rewind}${partner ? `\n\n${partner.firstName} fell asleep on your shoulder halfway through.` : ''}${late}`, '\u{1F4FC}', stars >= 4 ? 'good' : undefined)
    },
  },
  {
    id: 'lan',
    label: 'LAN Party',
    emoji: '\u{1F5A5}\u{FE0F}',
    minAge: 12,
    limit: 3,
    exists: (g) => g.year >= 1996 && g.year <= 2012 && adoption(g, 'homeComputer', 0.1) && adoption(g, 'videoGameConsole', 0.12),
    blurb: () => 'Hauling a tower PC to a basement full of cables',
    cost: (g) => eraPrice(g, 6),
    companions: 'optional',
    hint: (g) => talentHint(g, 'Gaming', `Your skills are sharp: about ${Math.round(winOdds(g, 0.28) * 100)}% to win the tournament.`) || null,
    play: (g, partner) => {
      const win = chance(g, winOdds(g, 0.28))
      addStat(g, 'happiness', win ? randInt(g, 7, 11) : randInt(g, 3, 6))
      addStat(g, 'health', -1)
      if (win) log(g, 'I won the tournament at a LAN party.', 'good')
      result(g, 'LAN Party', `${win ? 'You won the last round at dawn.' : 'You lost in the semifinal to a kid who never blinked.'} The snacks were gone by midnight, and so was your voice.${partner ? ` ${partner.firstName} kept you company.` : ''}`, '\u{1F5A5}\u{FE0F}', win ? 'good' : undefined)
    },
  },
  {
    id: 'mix',
    label: 'Make a Mix',
    emoji: '\u{1F4FC}',
    minAge: 11,
    limit: 3,
    exists: (g) => g.year >= 1975 && g.year <= 2012 && wealthOf(g) >= 0.15,
    blurb: (g) => `Record a ${mixWord(g)} for someone`,
    cost: (g) => eraPrice(g, 2),
    companions: 'optional',
    play: (g, partner) => {
      const kind = g.year >= 2000 && adoption(g, 'homeComputer', 0.1) ? 'mix CD' : 'mixtape'
      if (partner) {
        addRelationship(g, partner, randInt(g, 6, 12))
        notePerson(partner, `The player made them a ${kind}.`)
        addStat(g, 'happiness', randInt(g, 3, 6))
        log(g, `I made a ${kind} for ${partner.firstName}.`, 'good')
        result(g, 'Made a Mix', `You spent a whole evening choosing the songs and their order. ${partner.firstName} played the ${kind} until it wore out and still knows the track list.`, '\u{1F4FC}', 'good')
      } else {
        addStat(g, 'happiness', randInt(g, 2, 5))
        result(g, 'Made a Mix', `You made a ${kind} for yourself, and played it on repeat in your room. It was the soundtrack to your whole summer.`, '\u{1F4FC}')
      }
    },
  },
  {
    id: 'karaoke',
    label: 'Karaoke Night',
    emoji: '\u{1F3A4}',
    minAge: 16,
    limit: 3,
    exists: karaokeBars,
    blurb: () => 'A private room, a lyrics screen and no mercy',
    cost: (g) => eraPrice(g, 15),
    companions: 'optional',
    hint: (g) => talentHint(g, 'Music', `With your voice, about ${hasTalent(g, 'Music') ? 70 : 25}% the room goes wild.`) || null,
    play: (g, partner) => {
      masterInstrument(g, 'Voice')
      const win = chance(g, hasTalent(g, 'Music') ? 0.7 : 0.25)
      addStat(g, 'happiness', win ? randInt(g, 7, 11) : randInt(g, 3, 6))
      if (partner) addRelationship(g, partner, randInt(g, 3, 8))
      result(g, 'Karaoke Night', `${win ? 'You hit every note of a big ballad, and the room went silent, then wild.' : 'You hit about half the notes, and the friends cheered the whole second verse.'}${partner ? `\n\n${partner.firstName} sang the harmony, loudly.` : ''}`, '\u{1F3A4}', win ? 'good' : undefined)
    },
  },
  {
    id: 'rink',
    label: 'Roller Rink',
    emoji: '\u{1F6FC}',
    minAge: 6,
    limit: 4,
    exists: (g) => g.year >= 1978 && g.year <= 2006 && consumer(g) && adoption(g, 'tv', 0.25),
    blurb: () => 'Disco ball, rented skates and a snack bar',
    cost: (g) => eraPrice(g, 6),
    companions: 'optional',
    play: (g, partner) => {
      const fall = chance(g, 0.06)
      addStat(g, 'happiness', fall ? 1 : randInt(g, 3, 7))
      addStat(g, 'health', fall ? -4 : 1)
      if (partner) addRelationship(g, partner, randInt(g, 3, 8))
      result(g, 'Roller Rink', fall ? 'You went down on the first lap and your wrist went with you. The rest of the evening was spent at the snack bar with an ice pack.' : `You skated until the lights went down.${partner ? ` ${partner.firstName} held your hand on the slow song.` : ''}`, '\u{1F6FC}', fall ? 'bad' : 'good')
    },
  },
  {
    id: 'radio',
    label: 'Radio Request',
    emoji: '\u{1F4FB}',
    minAge: 11,
    limit: 6,
    exists: (g) => g.year >= 1950 && g.year <= 2008 && landline(g) && common(g, 'radio', 0.5),
    blurb: (g) => (common(g, 'mobilePhone') ? 'Call the station and hope someone picks up' : 'Dial the station again and again'),
    cost: () => 0,
    companions: 'optional',
    play: (g, partner) => {
      const through = chance(g, 0.3)
      if (through) {
        addStat(g, 'happiness', randInt(g, 5, 9))
        if (partner) {
          addRelationship(g, partner, randInt(g, 6, 12))
          notePerson(partner, 'The player dedicated a song to them on the radio.')
        }
        log(g, partner ? `I dedicated a song to ${partner.firstName} on the radio.` : 'I got through to the radio station and requested a song.', 'good')
        result(g, 'On the Air', `After forty busy signals, a voice said "You're on the air!" and your song played${partner ? `, with your dedication to ${partner.firstName}` : ''}. You forgot every word you had planned to say.`, '\u{1F4FB}', 'good')
      } else {
        addStat(g, 'happiness', -1)
        result(g, 'Busy Signal', 'You dialed until your finger ached and heard nothing but a busy tone. Someone else always got through first.', '\u{1F4FB}')
      }
    },
  },
  {
    id: 'stream',
    label: 'Streaming Night',
    emoji: '\u{1F4FA}',
    minAge: 8,
    limit: 5,
    exists: (g) => adoption(g, 'streaming', 0.1),
    blurb: (g) => `The next episode starts in five seconds${(g.yearActions[`${KEY}stream`] ?? 0) >= 3 ? ' (you have been binging)' : ''}`,
    cost: (g) => eraPrice(g, 3),
    companions: 'optional',
    play: (g, partner) => {
      const binges = g.yearActions[`${KEY}stream`] ?? 0
      const tired = binges > 3
      addStat(g, 'happiness', tired ? 1 : randInt(g, 3, 6))
      addStat(g, 'health', -1)
      if (tired) {
        if (g.character.education.current) g.character.education.current.grades = Math.max(0, g.character.education.current.grades - 1)
        const job = g.character.job ?? g.character.partTimeJob
        if (job) job.performance = Math.max(0, job.performance - 1)
      }
      if (partner) addRelationship(g, partner, randInt(g, 3, 7))
      result(g, 'Streaming Night', `${tired ? 'You watched until 3 a.m. again and went through the next day on coffee and regret.' : 'You watched three episodes and said "one more" twice.'}${partner ? `\n\nYou and ${partner.firstName} argued happily about the plot.` : ''}`, '\u{1F4FA}')
    },
  },
  {
    id: 'scroll',
    label: 'Scroll the Feed',
    emoji: '\u{1F4F1}',
    minAge: 13,
    limit: 8,
    exists: (g) => adoption(g, 'socialMedia', 0.12) && adoption(g, 'smartphone', 0.12),
    blurb: (g) => `Next hour: ${scrollMood(g.yearActions[`${KEY}scroll`] ?? 0) >= 0 ? '+' : ''}${scrollMood(g.yearActions[`${KEY}scroll`] ?? 0)} mood (the first helps, the rest do not)`,
    cost: () => 0,
    companions: 'none',
    play: (g) => {
      const before = (g.yearActions[`${KEY}scroll`] ?? 0) - 1
      const delta = scrollMood(before)
      addStat(g, 'happiness', delta)
      if (delta < 0 && g.character.education.current) g.character.education.current.grades = Math.max(0, g.character.education.current.grades - 1)
      result(g, 'The Feed', delta > 0 ? 'You scrolled through photographs of friends’ dogs and holidays and laughed at three videos. An hour well spent.' : delta === 0 ? 'You scrolled for an hour and could not name a single thing you saw.' : 'You looked at other people’s perfect weeks and felt worse about your own. You scrolled anyway.', '\u{1F4F1}', delta > 0 ? 'good' : delta < 0 ? 'bad' : undefined)
    },
  },
  {
    id: 'groupChat',
    label: 'Check the Family Chat',
    emoji: '\u{1F46A}',
    minAge: 10,
    limit: 6,
    exists: (g) => adoption(g, 'smartphone', 0.25) || (g.year >= 2003 && adoption(g, 'mobilePhone', 0.3)),
    blurb: (g) => (common(g, 'smartphone') ? 'Photos, voice notes and good-morning pictures' : 'A message to the people who matter'),
    cost: () => 0,
    companions: 'none',
    play: (g) => {
      const family = g.people.filter((p) => p.alive && isFamily(p) && !p.livesWithPlayer && p.age >= 6 && p.relation !== 'child')
      const p = family.length ? family.slice().sort((a, b) => a.relationship - b.relationship)[0] : undefined
      addStat(g, 'happiness', 1)
      if (p) {
        addRelationship(g, p, randInt(g, 2, 5))
        result(g, 'Family Chat', `You read the family messages and answered ${p.firstName}, who had not heard from you in a while. It took two minutes, and ${p.gender === 'male' ? 'he' : 'she'} replied with eleven hearts.`, '\u{1F46A}', 'good')
      } else {
        result(g, 'Family Chat', 'You read the family messages, sent a thumbs-up and felt more connected than you had expected.', '\u{1F46A}')
      }
    },
  },
]

// ---------------------------------------------------------------------------
// The cyber cafe: where the internet lived before the home computer

/** Cyber cafes: computers by the hour where few homes had one yet (shown in Computer when you own none). */
export function cafeAvailable(g: GameState): boolean {
  return cafeExists(g)
}

function cafeExists(g: GameState): boolean {
  return g.year >= 1996 && g.year <= 2012 && !adoption(g, 'homeComputer', 0.45) && wealthOf(g) < 0.7
}

function cafeHour(g: GameState): number {
  return eraPrice(g, 1.5)
}

function cafeVisit(g: GameState, what: 'write' | 'learn' | 'play'): void {
  const c = g.character
  const key = `${KEY}cafe`
  if (usesLeft(g, key, 6) <= 0) {
    result(g, 'Cyber Cafe', 'You have spent enough hours at the cyber cafe this year. The owner knows your name and your favorite chair.', '\u{1F5A5}\u{FE0F}')
    return
  }
  if (c.age < 10) {
    result(g, 'Cyber Cafe', 'You are too young to go to the cyber cafe on your own.', '\u{1F5A5}\u{FE0F}')
    return
  }
  const cost = cafeHour(g)
  const paid = payFor(g, cost, true, 'leisure')
  if (!paid) {
    brokeNotice(g, cost, 'an hour at the cyber cafe')
    return
  }
  g.yearActions[key] = (g.yearActions[key] ?? 0) + 1
  count(g, 'cafeHours')
  const modern = net(g)
  if (what === 'write') {
    const far = g.people.filter((p) => p.alive && isFamily(p) && (isAbroad(g, p) || !p.livesWithPlayer))
    const p = far.length ? pick(g, far) : undefined
    addStat(g, 'happiness', randInt(g, 4, 8))
    if (p) {
      addRelationship(g, p, randInt(g, 6, 12))
      notePerson(p, 'Heard from the player through a message typed at a cyber cafe.')
    }
    log(g, p ? `I wrote to ${p.firstName} from a cyber cafe.` : 'I wrote a long letter from a cyber cafe.', 'good')
    result(g, 'Cyber Cafe', `You typed a long ${modern ? 'email' : 'letter'} to ${p ? p.firstName : 'a faraway friend'} and pressed a button. The answer came the next day instead of the next month.`, '\u{1F5A5}\u{FE0F}', 'good')
  } else if (what === 'learn') {
    // The first lessons teach the most; after that it is practice, not news (no stat farm).
    const lessons = g.yearActions[`${KEY}cafe.learn`] ?? 0
    g.yearActions[`${KEY}cafe.learn`] = lessons + 1
    const gain = Math.max(0, 3 - lessons)
    addStat(g, 'smarts', gain)
    addStat(g, 'happiness', 1)
    result(g, 'Cyber Cafe', lessons >= 3 ? 'You practiced typing and searching with the owner looking over your shoulder. You were quicker, but there was nothing new to learn this year.' : 'The owner showed you how to type properly, use a word processor and search for answers. Within an hour you knew more than your teacher did about at least one thing.', '\u{1F5A5}\u{FE0F}')
  } else {
    addStat(g, 'happiness', randInt(g, 5, 8))
    if (c.education.current) c.education.current.grades = Math.max(0, c.education.current.grades - 1)
    result(g, 'Cyber Cafe', 'You played with a row of strangers who shouted at their screens in three languages. The hour went in a flash, and so did the money.', '\u{1F5A5}\u{FE0F}')
  }
}

const CAFE: MenuGroup = {
  type: 'menu',
  id: 'pastimes.cafe',
  label: 'Cyber Cafe',
  emoji: '\u{1F5A5}\u{FE0F}',
  subtitle: (g) => `${formatMoney(cafeHour(g))} an hour · ${usesLeft(g, `${KEY}cafe`, 6)} visits left`,
  visible: cafeExists,
  disabledReason: (g) => gate(g, { minAge: 10 }),
  header: (g) => `An hour costs ${formatMoney(cafeHour(g))}. Computers by the hour, a printer that works sometimes and a fan that works always.`,
  children: () => [
    { type: 'action', id: 'pastimes.cafe.write', label: 'Write to someone far away', emoji: '\u{2709}\u{FE0F}', subtitle: 'Family and friends abroad', run: (g) => cafeVisit(g, 'write') },
    { type: 'action', id: 'pastimes.cafe.learn', label: 'Learn the machine properly', emoji: '\u{1F393}', subtitle: (g) => ((g.yearActions[`${KEY}cafe.learn`] ?? 0) >= 3 ? 'Typing, documents, search (you know most of it by now)' : 'Typing, documents, search'), run: (g) => cafeVisit(g, 'learn') },
    { type: 'action', id: 'pastimes.cafe.play', label: 'Play with the crowd', emoji: '\u{1F3AE}', subtitle: 'Fun, but the grades notice', run: (g) => cafeVisit(g, 'play') },
  ],
}

// ---------------------------------------------------------------------------
// Running one outing

function attempt(g: GameState, def: Pastime, partnerId: string | null): void {
  const key = `${KEY}${def.id}`
  const reason = gate(g, { minAge: def.minAge })
  if (reason) {
    result(g, def.label, reason, def.emoji)
    return
  }
  if (!def.exists(g)) {
    result(g, def.label, 'That is not a thing where you live yet.', def.emoji)
    return
  }
  if (usesLeft(g, key, def.limit) <= 0) {
    result(g, def.label, `You have done that plenty this year (${def.limit} times). Give it a rest until next year.`, def.emoji)
    return
  }
  const partner = partnerId ? g.people.find((p) => p.id === partnerId && p.alive) : undefined
  if (partnerId && !partner) return
  if (!partner && !aloneOk(g, def)) {
    result(g, 'Too Young', 'You are too young to go there by yourself. Ask someone to come with you!', '\u{1F9D2}')
    return
  }
  if (partner) {
    const minRel = partner.relation === 'child' && partner.age < 13 ? 0 : 20
    if (partner.relationship < minRel) {
      log(g, `${partner.firstName} did not want to come with me.`, 'bad')
      result(g, 'Declined', `${partner.firstName} would rather do almost anything else than spend an afternoon like that with you.`, '\u{1F645}', 'bad')
      return
    }
  }
  const outings = partner ? 2 : 1
  const cost = def.cost(g) * outings
  const paid = payFor(g, cost, true, 'leisure')
  if (!paid) {
    brokeNotice(g, cost, def.label.toLowerCase())
    return
  }
  g.yearActions[key] = (g.yearActions[key] ?? 0) + 1
  count(g, 'pastimes')
  if (partner) notePerson(partner, `${def.label} with the player.`)
  def.play(g, partner)
}

function companionNodes(g: GameState, def: Pastime): MenuNode[] {
  const nodes: MenuNode[] = []
  if (aloneOk(g, def)) nodes.push({ type: 'action', id: `pastimes.${def.id}.alone`, label: 'Go Alone', emoji: '\u{1F9CD}', run: (d) => attempt(d, def, null) })
  const people = companionCandidates(g, { minAge: 4, max: 8 })
  if (people.length) nodes.push({ type: 'heading', id: `pastimes.${def.id}.with`, label: 'Go with someone' })
  for (const p of people) {
    nodes.push({ type: 'action', id: `pastimes.${def.id}.p.${p.id}`, label: `${p.firstName} ${p.lastName}`.trim(), emoji: '\u{1F465}', subtitle: relationLabel(p), run: (d) => attempt(d, def, p.id) })
  }
  if (!nodes.length) nodes.push({ type: 'info', id: `pastimes.${def.id}.none`, text: "You don't have anyone to go with.", emoji: '\u{1F622}' })
  return nodes
}

function nodeFor(def: Pastime): MenuNode {
  const subtitle = (g: GameState): string => {
    const cost = def.cost(g)
    return `${def.blurb(g)}${cost > 0 ? ` · ${formatMoney(cost)}` : ''} · ${usesLeft(g, `${KEY}${def.id}`, def.limit)} left this year`
  }
  const hint = (g: GameState): string | null => (def.hint ? def.hint(g) : null)
  const base = { id: `pastimes.${def.id}`, label: def.label, emoji: def.emoji, subtitle, hint, visible: (g: GameState) => def.exists(g), disabledReason: (g: GameState) => gate(g, { minAge: def.minAge }) }
  if (def.companions === 'optional') {
    const group: MenuGroup = { ...base, type: 'menu', header: (g) => (def.cost(g) > 0 ? `One outing costs ${formatMoney(def.cost(g))} (double with company). Who is coming?` : 'Who is coming?'), children: (g) => companionNodes(g, def) }
    return group
  }
  const action: MenuAction = { ...base, type: 'action', run: (g) => attempt(g, def, null) }
  return action
}

/** Activities › Hang Out. Rows appear only for what existed where and when the player lives. */
export const pastimesMenu: MenuGroup = {
  type: 'menu',
  id: 'pastimes',
  label: 'Hang Out',
  emoji: '\u{1F389}',
  subtitle: 'What people do for fun in your day',
  visible: (g) => g.character.alive && !g.character.prison && g.character.age >= 6 && pastimesAvailable(g).length > 0,
  disabledReason: (g) => gate(g, { minAge: 6 }),
  header: (g) => `${g.year >= PRESENT_YEAR ? 'Today' : `In ${g.year}`}, this is what there is to do.`,
  children: (g) => [...DEFS.filter((d) => d.exists(g)).map(nodeFor), ...(cafeExists(g) ? [CAFE] : [])],
}

/** The ids of the pastimes that exist for this life right now (tests and the menu use this). */
export function pastimesAvailable(g: GameState): string[] {
  return [...DEFS.filter((d) => d.exists(g)).map((d) => d.id), ...(cafeExists(g) ? ['cafe'] : [])]
}

/** Exposed for tests: run an outing without going through the menu. */
export function runPastime(g: GameState, id: string, partnerId: string | null = null): void {
  const def = DEFS.find((d) => d.id === id)
  if (def) attempt(g, def, partnerId)
}
