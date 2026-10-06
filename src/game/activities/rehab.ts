// Rehab: battle your addictions. Support group meetings are free but less effective;
// hypnotherapy and rehab centers cost money and work better. Anyone can attend, even
// without an addiction (to mild confusion).
import { addHidden, addStat, count, log, remember, scriptChoice } from '../core'
import { chance, pick, randInt } from '../rng'
import { defineScript } from '../scripts'
import type { Condition, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { addictions, brokeNotice, gate, localPrice, money, removeCondition, result, usesLeft } from './common'

interface Treatment {
  id: 'meeting' | 'hypno' | 'center' | 'luxury' | 'sanatorium'
  label: string
  emoji: string
  subtitle: string
  price: number
  /** Base cure chance. */
  chance: number
  perYear: number
  /** First year the treatment existed (twelve-step groups 1935, rehab clinics after the war). */
  since?: number
}

export const TREATMENTS: Treatment[] = [
  { id: 'meeting', label: 'Support Group', emoji: '\u{1FA91}', subtitle: 'Free twelve-step meeting', price: 0, chance: 0.2, perYear: 4, since: 1935 },
  { id: 'hypno', label: 'Hypnotherapy', emoji: '\u{1F300}', subtitle: 'A session with a hypnotist', price: 250, chance: 0.35, perYear: 2 },
  { id: 'center', label: 'Rehab Center', emoji: '\u{1F3E5}', subtitle: 'A 30-day inpatient program', price: 12000, chance: 0.55, perYear: 1, since: 1950 },
  { id: 'luxury', label: 'Luxury Rehab Center', emoji: '\u{1F334}', subtitle: 'Recovery with an ocean view', price: 45000, chance: 0.75, perYear: 1, since: 1975 },
  { id: 'sanatorium', label: 'Sanatorium', emoji: '\u{1F3DE}\u{FE0F}', subtitle: 'Fresh air, cold baths and strict routines', price: 6000, chance: 0.4, perYear: 1 },
]

function priceOf(g: GameState, t: Treatment): number {
  return t.price ? localPrice(g, t.price) : 0
}

function isAlcohol(a: Condition): boolean {
  return /alcohol/i.test(a.name)
}

export function cureChance(g: GameState, t: Treatment, a: Condition): number {
  const c = g.character
  let p = t.chance + (c.hidden.willpower - 50) / 200 - (a.severity - 25) / 300
  if (t.id === 'meeting') p *= isAlcohol(a) ? 1.4 : 0.6
  if (a.yearsHad >= 10) p -= 0.05
  return Math.max(0.05, Math.min(0.92, p))
}

function noAddictionVisit(g: GameState, t: Treatment): void {
  addStat(g, 'happiness', randInt(g, 0, 3))
  addHidden(g, 'willpower', 1)
  log(g, `I went to ${t.id === 'meeting' ? 'a support group meeting' : t.id === 'hypno' ? 'a hypnotherapy session' : t.id === 'sanatorium' ? 'a sanatorium' : 'rehab'} even though I'm not addicted to anything.`, 'neutral')
  const lines: Record<Treatment['id'], string[]> = {
    meeting: [
      'You stood up at the meeting and said "Hi, I’m not addicted to anything." Everyone stared. Someone offered you a cookie.',
      'You attended a support group meeting just to listen. The coffee was terrible, but the stories were moving.',
    ],
    hypno: ['The hypnotist swung a pocket watch at you for an hour. You now cluck like a chicken whenever someone says "Tuesday."'],
    center: ['You checked into rehab for 30 days without an addiction. The staff were confused, but you enjoyed the group yoga.'],
    luxury: ['You spent a month at a luxury rehab center without any addictions. Best spa vacation of your life.'],
    sanatorium: ['You spent a month at a mountain sanatorium without any addiction. The cold baths were bracing. The porridge was not.'],
  }
  result(g, t.label, pick(g, lines[t.id]), t.emoji)
}

function treat(g: GameState, t: Treatment, a: Condition): void {
  count(g, 'rehab')
  if (chance(g, cureChance(g, t, a))) {
    removeCondition(g, a.id)
    addStat(g, 'happiness', randInt(g, 5, 12))
    addStat(g, 'health', randInt(g, 2, 6))
    addHidden(g, 'willpower', randInt(g, 2, 5))
    count(g, 'addictionsCured')
    if (t.id === 'center' || t.id === 'luxury') g.flags.rehabSuccess = true
    remember(g, `Overcame ${a.name.toLowerCase()} through ${t.label.toLowerCase()}.`)
    log(g, `I overcame my ${a.name.toLowerCase()}!`, 'good')
    const how: Record<Treatment['id'], string> = {
      meeting: 'You kept going to meetings, shared your story and leaned on your sponsor.',
      hypno: 'The hypnotist snapped their fingers and the cravings simply... stopped.',
      center: 'Thirty days of therapy, routines and honest conversations changed your life.',
      luxury: 'Between the therapy sessions and the infinity pool, you found yourself again.',
      sanatorium: 'Months of mountain air, cold baths and early bedtimes did the trick.',
    }
    result(g, 'Recovered!', `${how[t.id]}\n\nYou've overcome your ${a.name.toLowerCase()}!`, '\u{1F31F}', 'good')
    return
  }
  a.severity = Math.max(1, a.severity - randInt(g, 2, 6))
  addStat(g, 'happiness', -randInt(g, 2, 6))
  log(g, `I tried ${t.label.toLowerCase()} for my ${a.name.toLowerCase()}, but I relapsed.`, 'bad')
  const fail: Record<Treatment['id'], string[]> = {
    meeting: ['You went to the meeting, but the cravings won. You relapsed the same night.', 'You sat in the back of the meeting and left early. You are still struggling.'],
    hypno: ['The hypnotist swung the watch. You stayed wide awake and very much still addicted.'],
    center: ['You completed the program, but relapsed a few weeks after getting out. Recovery takes time.'],
    luxury: ['You had a lovely month by the ocean, but the cravings were waiting for you when you got home.'],
    sanatorium: ['You took the waters and the cold baths, but the cravings followed you down the mountain.'],
  }
  result(g, 'Relapse', `${pick(g, fail[t.id])}\n\nDon't give up. Many people need more than one try.`, '\u{1F614}', 'bad')
}

function startTreatment(g: GameState, t: Treatment): void {
  const key = `act.rehab.${t.id}`
  if ((g.yearActions[key] ?? 0) >= t.perYear) {
    result(g, t.label, t.id === 'meeting' ? "You've been to enough meetings this year." : `You've already done ${t.label.toLowerCase()} this year.`, t.emoji)
    return
  }
  const cost = priceOf(g, t)
  if (cost > 0 && g.character.money < cost) {
    brokeNotice(g, cost, t.label.toLowerCase())
    return
  }
  g.character.money -= cost
  g.yearActions[key] = (g.yearActions[key] ?? 0) + 1
  const list = addictions(g)
  if (list.length === 0) {
    noAddictionVisit(g, t)
    return
  }
  if (list.length === 1) {
    treat(g, t, list[0])
    return
  }
  scriptChoice(
    g,
    WHICH,
    t.label,
    'Which addiction do you want to work on?',
    list.slice(0, 6).map((a) => ({ id: a.id, label: a.name, emoji: '\u{1F48A}' })),
    { emoji: t.emoji, data: { t: t.id } },
  )
}

const WHICH = defineScript('act.rehab.which', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const t = TREATMENTS.find((x) => x.id === d.t) ?? TREATMENTS[0]
  const a = addictions(g).find((x) => x.id === choice)
  if (!a) return
  treat(g, t, a)
})

export const rehabMenu: MenuGroup = {
  type: 'menu',
  id: 'rehab',
  label: 'Rehab',
  emoji: '\u{1F3E5}',
  subtitle: 'Battle your addictions',
  disabledReason: (g) => gate(g, { minAge: 18 }),
  header: (g) => {
    const list = addictions(g)
    return list.length ? `You are struggling with: ${list.map((a) => a.name).join(', ')}.` : "You don't have any addictions, but you can still attend."
  },
  // Sanatoriums until rehab clinics replaced them; twelve-step groups from 1935.
  children: (g): MenuNode[] =>
    TREATMENTS.filter((t) => g.year >= (t.since ?? 0) && (t.id !== 'sanatorium' || g.year < 1960)).map(
      (t): MenuAction => ({
        type: 'action',
        id: `rehab.${t.id}`,
        label: t.label,
        emoji: t.emoji,
        subtitle: (g) => `${t.subtitle} · ${t.price ? money(priceOf(g, t)) : 'Free'} · ${usesLeft(g, `act.rehab.${t.id}`, t.perYear)} left this year`,
        confirm: (g) => (t.price >= 10000 ? `Check into the ${t.label.toLowerCase()} for ${money(priceOf(g, t))}?` : null),
        run: (g) => startTreatment(g, t),
      }),
    ),
}
