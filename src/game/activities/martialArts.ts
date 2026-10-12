// Mind & Body > Martial Arts: train a style, earn belts, learn moves. Styles reach each country
// when they did historically: judo spread abroad in the twenties, karate and taekwondo after the
// war, kung fu with the seventies film craze, Brazilian jiu-jitsu worldwide from 1993. Boxing
// is always on offer.
// Progress lives in g.flags.martialArts = { [styleId]: { belt, progress } } and the learned
// moves in g.flags['martialArts.moves'] (string[]) so person interactions can use them.
import { addHidden, addStat, aThing, count, log, remember, useYearAction } from '../core'
import { masterFirstTime } from '../mastery'
import { chance, pick, randInt } from '../rng'
import { hasMainCharacter } from '../talents'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addCondition, brokeNotice, flagRecord, gate, localPrice, money, payFor, pushFlagString, recNumber, result, usesLeft } from './common'

interface Style {
  id: string
  name: string
  emoji: string
  belts: string[]
  /** One move learned per promotion (index = new belt index - 1). */
  moves: string[]
  sash?: boolean
  /** Ranks are titles rather than belts (boxing). */
  ranks?: boolean
  /** First year the style is taught here (by country; '*' for everywhere else). */
  since?: Record<string, number>
}

export const STYLES: Style[] = [
  { id: 'jiujitsu', name: 'Jiu-Jitsu', emoji: '\u{1F94B}', belts: ['White', 'Blue', 'Purple', 'Brown', 'Black'], moves: ['Armbar', 'Triangle Choke', 'Kimura', 'Rear Naked Choke'], since: { jp: 0, br: 1925, '*': 1993 } },
  { id: 'judo', name: 'Judo', emoji: '\u{1F94B}', belts: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black'], moves: ['Foot Sweep', 'Hip Throw', 'Side Kick', 'Shoulder Throw', 'Arm Lock', 'Sacrifice Throw'], since: { jp: 0, '*': 1925 } },
  { id: 'karate', name: 'Karate', emoji: '\u{1F94B}', belts: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'], moves: ['Front Kick', 'Knife-Hand Strike', 'Elbow Strike', 'Roundhouse Kick', 'Hammer Fist', 'Crescent Kick', 'Spinning Back Kick'], since: { jp: 1922, '*': 1955 } },
  { id: 'kungfu', name: 'Kung Fu', emoji: '\u{1F409}', sash: true, belts: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black'], moves: ['Monkey Strike', 'Crane Kick', 'Snake Fist', 'Tiger Claw', 'Mantis Fist', 'Dragon Palm'], since: { cn: 0, hk: 0, tw: 0, sg: 0, my: 0, '*': 1970 } },
  { id: 'taekwondo', name: 'Taekwondo', emoji: '\u{1F94B}', belts: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black'], moves: ['Axe Kick', 'Knife Hand', 'Eagle Strike', 'Flying Side Kick', 'Spinning Hook Kick'], since: { kr: 1955, '*': 1965 } },
  { id: 'boxing', name: 'Boxing', emoji: '\u{1F94A}', ranks: true, belts: ['Novice', 'Amateur', 'Club Fighter', 'Contender', 'Champion'], moves: ['Jab', 'Uppercut', 'Left Hook', 'Haymaker'] },
]

/** Is this style taught where the player lives this year? */
export function styleAvailable(g: GameState, style: Style): boolean {
  const s = style.since
  if (!s) return true
  return g.year >= (s[g.character.countryId] ?? s['*'] ?? 0)
}

const FLAG = 'martialArts'
const MOVES_FLAG = 'martialArts.moves'
const PER_STYLE_PER_YEAR = 3
const TOTAL_PER_YEAR = 5

export function styleProgress(g: GameState, styleId: string): { belt: number; progress: number } {
  const rec = flagRecord(g, FLAG)
  const s = rec[styleId]
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { belt: 0, progress: 0 }
  const o = s as Record<string, Json>
  return { belt: recNumber(o, 'belt'), progress: recNumber(o, 'progress') }
}

function saveProgress(g: GameState, styleId: string, belt: number, progress: number): void {
  const rec = { ...flagRecord(g, FLAG) }
  rec[styleId] = { belt, progress }
  g.flags[FLAG] = rec
}

/**
 * The highest belt a main character can reach right now: kids hold junior ranks, a body in poor
 * health or past seventy tops out a notch lower. Everybody else goes by the normal grind.
 */
function topBelt(g: GameState, style: Style): number {
  const c = g.character
  const maxBelt = style.belts.length - 1
  const ageFactor = c.age >= 16 ? 1 : Math.max(0.2, (c.age - 5) / 11)
  const oldFactor = c.age > 70 ? 0.85 : 1
  const healthFactor = c.stats.health >= 60 ? 1 : Math.max(0.5, c.stats.health / 60)
  return Math.max(0, Math.min(maxBelt, Math.round(maxBelt * ageFactor * oldFactor * healthFactor)))
}

function beltName(style: Style, belt: number): string {
  const rank = style.belts[Math.min(belt, style.belts.length - 1)]
  return style.ranks ? rank : `${rank} ${style.sash ? 'Sash' : 'Belt'}`
}

const CLASS_LINES = [
  'You spent the class practicing {move} drills until your arms felt like noodles.',
  'Your {style} instructor paired you with a kid half your size who absolutely destroyed you.',
  'You sparred for an hour and only got knocked down twice. Progress!',
  'You practiced katas in the mirror and felt incredibly cool.',
  'Your instructor said your form was "almost acceptable." High praise.',
  'You did 200 kicks, 200 punches and 1 accidental split.',
]

const BOXING_LINES = [
  'You spent the session working the heavy bag until your arms felt like noodles.',
  'Your trainer held the pads and yelled "{move}!" about four hundred times.',
  'You skipped rope for half an hour and only tripped twice. Progress!',
  'You sparred three rounds and only saw stars once.',
]

function takeClass(g: GameState, style: Style): void {
  const c = g.character
  if (c.stats.health < 10) {
    result(g, 'Too Weak', `You're far too weak to train right now. Your ${style.name} instructor sent you home.`, '\u{1F915}', 'bad')
    return
  }
  const { belt, progress } = styleProgress(g, style.id)
  const maxBelt = style.belts.length - 1
  const perStyleKey = `act.martial.${style.id}`
  if ((g.yearActions[perStyleKey] ?? 0) >= PER_STYLE_PER_YEAR || (g.yearActions['act.martial'] ?? 0) >= TOTAL_PER_YEAR) {
    result(g, 'Exhausted', pick(g, [
      `Your ${style.name} instructor told you to rest. You've trained enough this year.`,
      "You're too sore to train again this year. Even your eyebrows hurt.",
      "You're too exhausted for another class this year.",
    ]), '\u{1F62B}')
    return
  }
  const cost = c.age < 18 ? localPrice(g, 25) : localPrice(g, 40)
  const paid = payFor(g, cost, true)
  if (!paid) {
    brokeNotice(g, cost, `a ${style.name} class`)
    return
  }
  useYearAction(g, perStyleKey, PER_STYLE_PER_YEAR)
  useYearAction(g, 'act.martial', TOTAL_PER_YEAR)
  count(g, 'martialArts')
  addStat(g, 'health', randInt(g, 1, 4))
  addStat(g, 'happiness', randInt(g, 1, 4))
  addHidden(g, 'athleticism', randInt(g, 1, 3))
  addHidden(g, 'discipline', randInt(g, 0, 2))

  if (chance(g, 0.04)) {
    const injury = pick(g, ['Sprained Wrist', 'Broken Toe', 'Dislocated Finger', 'Bruised Ribs'])
    addCondition(g, injury, 'injury', randInt(g, 6, 15))
    addStat(g, 'health', -randInt(g, 3, 8))
    log(g, `I got ${aThing(injury)} in ${style.name} class.`, 'bad')
    result(g, 'Injured', `You got ${aThing(injury)} while sparring in ${style.name} class. Your sparring partner apologized. Sort of.`, '\u{1FA79}', 'bad')
    return
  }

  // Main Character Syndrome: the first class is already mastery, up to what the body and age allow.
  if (hasMainCharacter(g)) {
    masterFirstTime(g, `martial.${style.id}`, 'martial', style.name)
    const top = topBelt(g, style)
    if (belt < top) {
      for (let i = belt; i < top; i++) if (style.moves[i]) pushFlagString(g, MOVES_FLAG, style.moves[i])
      saveProgress(g, style.id, top, 0)
      const name = beltName(style, top)
      if (top >= maxBelt && !style.ranks) {
        count(g, 'blackBelts')
        remember(g, `Earned a black belt in ${style.name} in my very first class.`)
        log(g, `I earned my black belt in ${style.name}!`, 'good')
        return result(g, 'Black Belt!', `You earned your ${name.toLowerCase()} in ${style.name}, which normally takes years. The other students have gone quiet and the sensei is checking the rulebook.`, '\u{1F5A4}', 'good')
      }
      if (top >= maxBelt) {
        remember(g, `Became the ${style.name.toLowerCase()} champion of my gym.`)
        log(g, `I became the champion of my ${style.name.toLowerCase()} gym!`, 'good')
        return result(g, 'Champion!', `You won the gym's championship bout in your first week. The trainer has stopped pretending this was planned.`, '\u{1F3C6}', 'good')
      }
      log(g, `I earned my ${name.toLowerCase()} in ${style.name}.`, 'good')
      return result(g, 'Promoted!', `You jumped straight to ${name.toLowerCase()} in ${style.name}. A kid your age can only be so good, but you are working on it.`, style.emoji, 'good')
    }
    if (belt >= top && top < maxBelt) {
      log(g, `I trained ${style.name} at the top of my age group.`, 'neutral')
      return result(g, style.name, `You are as good as someone your age can be at ${style.name}. The rest is growing up.`, style.emoji, 'good')
    }
  }
  if (belt >= maxBelt) {
    if (style.ranks) {
      log(g, `I trained ${style.name} as the gym's champion.`, 'neutral')
      result(g, style.name, pick(g, ['You mostly helped the trainer coach the new kids. They call you "champ" now.', 'You sparred with the best in the gym. Nobody landed a clean punch on you all day.']), style.emoji, 'good')
      return
    }
    log(g, `I trained ${style.name} as a black belt.`, 'neutral')
    result(g, style.name, pick(g, [
      `As ${aThing(beltName(style, belt))}, you mostly helped teach the beginners. They call you "sensei" now.`,
      `You trained with the other black belts. Nobody landed a hit on you all day.`,
    ]), style.emoji, 'good')
    return
  }

  let gain = randInt(g, 12, 28) * (0.6 + c.hidden.athleticism / 100)
  if (c.stats.health < 60) gain *= 0.3
  if (c.age > 60) gain *= 0.6
  const newProgress = progress + Math.round(gain)
  const moveHint = style.moves[Math.min(belt, style.moves.length - 1)]
  if (newProgress >= 100) {
    const next = belt + 1
    saveProgress(g, style.id, next, 0)
    const move = style.moves[next - 1]
    if (move) pushFlagString(g, MOVES_FLAG, move)
    const name = beltName(style, next)
    if (next >= maxBelt && style.ranks) {
      remember(g, `Became the ${style.name.toLowerCase()} champion of my gym.`)
      log(g, `I became the champion of my ${style.name.toLowerCase()} gym!`, 'good')
      result(g, 'Champion!', `You won the gym's championship bout! Years of sweat paid off. You learned the ${move}.`, '\u{1F3C6}', 'good')
    } else if (next >= maxBelt) {
      count(g, 'blackBelts')
      remember(g, `Earned a black belt in ${style.name}.`)
      log(g, `I earned my black belt in ${style.name}!`, 'good')
      result(g, 'Black Belt!', `You earned your ${name.toLowerCase()} in ${style.name}! Years of sweat paid off. You learned the ${move}.`, '\u{1F5A4}', 'good')
    } else {
      log(g, `I earned my ${name.toLowerCase()} in ${style.name}.`, 'good')
      result(g, 'Promoted!', `Congratulations! You earned your ${name.toLowerCase()} in ${style.name}${move ? ` and learned the ${move}` : ''}.`, style.emoji, 'good')
    }
    return
  }
  saveProgress(g, style.id, belt, newProgress)
  log(g, `I took a ${style.name} class.`, 'neutral')
  const lines = style.ranks ? BOXING_LINES : CLASS_LINES
  result(g, `${style.name} Class`, pick(g, lines).replace('{move}', moveHint ?? 'basic').replace('{style}', style.name), style.emoji)
}

export const martialArtsMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.martial',
  label: 'Martial Arts',
  emoji: '\u{1F94B}',
  subtitle: 'Learn self-defense',
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 8 }),
  header: (g) =>
    `Classes cost ${money(g.character.age < 18 ? localPrice(g, 25) : localPrice(g, 40))}${g.character.age < 18 ? ' (your parents pay if they can)' : ''}. You can train up to ${TOTAL_PER_YEAR} times a year.`,
  children: (g): MenuNode[] =>
    STYLES.filter((style) => styleAvailable(g, style) || styleProgress(g, style.id).belt > 0 || styleProgress(g, style.id).progress > 0).map((style): MenuAction => {
      const { belt, progress } = styleProgress(g, style.id)
      const maxed = belt >= style.belts.length - 1
      return {
        type: 'action',
        id: `mb.martial.${style.id}`,
        label: style.name,
        emoji: style.emoji,
        subtitle: (s) =>
          `${beltName(style, belt)}${maxed ? ' · Mastered' : ` · ${progress}% to next`} · ${usesLeft(s, `act.martial.${style.id}`, PER_STYLE_PER_YEAR)} classes left this year`,
        run: (draft) => takeClass(draft, style),
      }
    }),
}
