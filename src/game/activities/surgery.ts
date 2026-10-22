// Plastic Surgery: pick a procedure, then one of two surgeons (pricier = better reputation).
// Botched surgeries hurt looks/health/happiness, can rarely be fatal, and give you someone to sue.
import { killCharacter } from '../death'
import { addMoney, addStat, count, log, notice, remember, scriptInput } from '../core'
import { chance, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  addGrievance,
  brokeNotice,
  cleanName,
  flagRecord,
  flagStrings,
  gate,
  localPrice,
  money,
  recNumber,
  result,
  stableInt,
  stableName,
} from './common'
import { setGenderIdentity } from './identity'

interface Procedure {
  id: string
  name: string
  emoji: string
  /** US list price for an average surgeon. */
  price: number
  gain: [number, number]
  /** Lifetime limit (Infinity = unlimited). */
  limit: number
  gender?: 'male' | 'female'
  /** Mentioned in popups: "your new nose". */
  result: string
}

/** First year each procedure was offered by cosmetic surgeons (missing: always). */
const PROCEDURE_SINCE: Record<string, number> = { botox: 2002, butt: 2000, breast: 1962, chin: 1950, eyelid: 1930, facelift: 1920, gender: 1960, lipo: 1982, tummy: 1960 }

/** Was this procedure available yet? */
export function procedureAvailable(g: GameState, id: string): boolean {
  return g.year >= (PROCEDURE_SINCE[id] ?? 0)
}

export const PROCEDURES: Procedure[] = [
  { id: 'botox', name: 'Botox', emoji: '\u{1F489}', price: 600, gain: [2, 6], limit: Infinity, result: 'Your forehead is now smoother than a freshly zambonied ice rink.' },
  { id: 'butt', name: 'Brazilian Butt Lift', emoji: '\u{1F351}', price: 9000, gain: [3, 10], limit: 3, gender: 'female', result: 'Your new curves are turning heads. And necks. Possibly causing injuries.' },
  { id: 'breast', name: 'Breast Augmentation', emoji: '\u{1F459}', price: 8000, gain: [3, 10], limit: 1, gender: 'female', result: 'You went up a few cup sizes. Your old wardrobe no longer fits, so: shopping.' },
  { id: 'chin', name: 'Chin Implant', emoji: '\u{1F5FF}', price: 5500, gain: [2, 8], limit: 2, result: 'You now have a jawline that could cut glass.' },
  { id: 'eyelid', name: 'Eyelid Surgery', emoji: '\u{1F441}\u{FE0F}', price: 4500, gain: [2, 8], limit: 3, result: 'Your eyes look brighter and more awake than they have in years.' },
  { id: 'facelift', name: 'Face Lift', emoji: '\u{1F486}', price: 12000, gain: [4, 12], limit: Infinity, result: 'You look ten years younger. Your friends keep asking where you went on vacation.' },
  { id: 'gender', name: 'Gender Reassignment', emoji: '⚧\u{FE0F}', price: 35000, gain: [0, 4], limit: 1, result: 'Your transition surgery was a success. You finally feel at home in your own body.' },
  { id: 'lipo', name: 'Liposuction', emoji: '\u{1FA92}', price: 6000, gain: [3, 9], limit: 3, result: 'Your stubborn fat is gone. You look leaner and more toned.' },
  { id: 'nose', name: 'Nose Job', emoji: '\u{1F443}', price: 7000, gain: [3, 10], limit: 3, result: 'Your new nose is perfectly proportioned. You keep admiring it in the mirror.' },
  { id: 'tummy', name: 'Tummy Tuck', emoji: '\u{1FAC4}', price: 8500, gain: [3, 9], limit: 3, result: 'Your stomach is flatter than it has been since you were a teenager.' },
]

interface Surgeon {
  key: string
  name: string
  reputation: number
  price: number
}

const COUNTS = 'surgery.counts'
const SUED = 'surgery.suedSurgeons'

export function surgeryCount(g: GameState, id: string): number {
  return recNumber(flagRecord(g, COUNTS), id)
}

/** Two surgeons for this procedure this year: one cheap and risky, one pricey and skilled. */
export function surgeonsFor(g: GameState, proc: Procedure): Surgeon[] {
  const out: Surgeon[] = []
  for (const tier of ['cheap', 'pricey'] as const) {
    const key = `${proc.id}.${tier}`
    const n = stableName(g, `surgeon.${key}`)
    const reputation = tier === 'cheap' ? stableInt(g, `rep.${key}`, 8, 55) : stableInt(g, `rep.${key}`, 60, 98)
    const priceFactor = 0.55 + reputation / 100
    out.push({ key, name: `Dr. ${n.first} ${n.last}`, reputation, price: localPrice(g, proc.price * priceFactor) })
  }
  return out
}

function botchChance(g: GameState, s: Surgeon): number {
  const age = g.character.age
  return Math.max(0.03, Math.min(0.75, 0.03 + ((100 - s.reputation) / 100) * 0.55 + (age >= 65 ? 0.06 : 0)))
}

function repBar(rep: number): string {
  const filled = Math.round(rep / 20)
  return '█'.repeat(filled) + '░'.repeat(5 - filled)
}

const BOTCH_LINES = [
  "{doc} sneezed at the worst possible moment. The results are... asymmetrical.",
  '{doc} was clearly hungover. You look like a melted wax figure of yourself.',
  'Something went very wrong during your {proc}. Children now cross the street when they see you.',
  '{doc} botched your {proc}. Your reflection screamed.',
]

function operate(g: GameState, proc: Procedure, s: Surgeon): void {
  const c = g.character
  if (flagStrings(g, SUED).includes(s.name)) {
    result(g, 'Refused', `${s.name} refuses to operate on you after you sued them.`, '\u{1F6AB}', 'bad')
    return
  }
  if (surgeryCount(g, proc.id) >= proc.limit) {
    result(g, 'No More', `${s.name} says you've already had as many ${proc.name.toLowerCase()} procedures as is medically safe.`, '\u{1F6AB}')
    return
  }
  if (c.stats.health < 15) {
    result(g, 'Too Risky', `${s.name} took one look at your chart and refused to operate. You're not healthy enough for surgery.`, '\u{1F3E5}', 'bad')
    return
  }
  if (c.money < s.price) {
    brokeNotice(g, s.price, `a ${proc.name.toLowerCase()} with ${s.name}`)
    return
  }
  addMoney(g, -s.price, 'health')
  count(g, 'surgeries')
  const counts = { ...flagRecord(g, COUNTS) }
  counts[proc.id] = recNumber(counts, proc.id) + 1
  g.flags[COUNTS] = counts

  if (chance(g, botchChance(g, s))) {
    count(g, 'botchedSurgeries')
    const looksLoss = randInt(g, 10, 30)
    const healthLoss = randInt(g, 5, 15)
    addStat(g, 'looks', -looksLoss)
    addStat(g, 'health', -healthLoss)
    addStat(g, 'happiness', -randInt(g, 10, 25))
    addGrievance(g, { kind: 'surgeon', name: s.name, strength: Math.max(40, 95 - s.reputation), detail: `botched your ${proc.name.toLowerCase()}` })
    log(g, `${s.name} botched my ${proc.name.toLowerCase()}.`, 'bad')
    const severe = healthLoss >= 12 && chance(g, 0.12)
    if (c.stats.health <= 0 || (severe && c.stats.health < 35)) {
      notice(g, 'Complications', `Your ${proc.name.toLowerCase()} went horribly wrong. There were complications on the operating table.`, { emoji: '\u{1F480}', tone: 'bad' })
      killCharacter(g, 'Plastic Surgery Complications')
      return
    }
    remember(g, `A botched ${proc.name.toLowerCase()} by ${s.name} left me disfigured.`)
    const text = pickLine(g, BOTCH_LINES).replace('{doc}', s.name).replace('{proc}', proc.name.toLowerCase())
    result(g, 'Botched!', `${text}\n\nYou could sue ${s.name} for this.`, '\u{1F631}', 'bad')
    if (proc.id === 'gender') finishTransition(g)
    return
  }
  const gain = randInt(g, proc.gain[0], proc.gain[1])
  addStat(g, 'looks', gain)
  addStat(g, 'happiness', randInt(g, 3, 8))
  addStat(g, 'health', -randInt(g, 0, 3))
  log(g, `I had ${proc.name === 'Botox' ? 'Botox' : `a ${proc.name.toLowerCase()}`} done by ${s.name}.`, 'good')
  if (proc.id === 'gender') {
    remember(g, 'Had gender reassignment surgery.')
    result(g, 'Success', proc.result, proc.emoji, 'good')
    finishTransition(g)
    return
  }
  result(g, 'Success', `${s.name} did an excellent job. ${proc.result}`, proc.emoji, 'good')
}

/** After reassignment surgery: flip gender (if not already transitioned) and offer a new name. */
function finishTransition(g: GameState): void {
  g.flags['identity.surgery'] = true
  setGenderIdentity(g, 'transgender', { quiet: true })
  scriptInput(g, {
    title: 'New Name',
    emoji: '\u{1FAAA}',
    text: 'Would you like a new first name to go with your transition? Leave it as is to keep your current name.',
    input: 'text',
    defaultValue: g.character.firstName,
    placeholder: 'First name',
    scriptId: RENAME,
  })
}

const RENAME = defineScript('act.surgery.rename', (g, value) => {
  const name = cleanName(value)
  if (!name || name === g.character.firstName) return
  const old = g.character.firstName
  g.character.firstName = name
  log(g, `I changed my name from ${old} to ${name}.`, 'event')
  remember(g, `Changed first name from ${old} to ${name}.`)
})

export function markSurgeonSued(g: GameState, name: string): void {
  const list = flagStrings(g, SUED)
  if (!list.includes(name)) g.flags[SUED] = [...list, name]
}

function procedureMenu(proc: Procedure): MenuGroup {
  return {
    type: 'menu',
    id: `surgery.${proc.id}`,
    label: proc.name,
    emoji: proc.emoji,
    subtitle: (g) => {
      const n = surgeryCount(g, proc.id)
      return proc.limit === Infinity ? (n ? `Done ${n}×` : 'No limit') : `${n}/${proc.limit} done`
    },
    disabledReason: (g) =>
      surgeryCount(g, proc.id) >= proc.limit
        ? `You've already had ${proc.limit === 1 ? 'this procedure' : `${proc.limit} of these`}. No surgeon will do another.`
        : proc.id === 'gender' && g.flags['identity.surgery'] === true
          ? "You've already had this procedure."
          : null,
    header: () => 'Pick a surgeon. A better reputation means a lower chance of a botched job.',
    children: (g): MenuNode[] =>
      surgeonsFor(g, proc).map(
        (s): MenuAction => ({
          type: 'action',
          id: `surgery.${proc.id}.${s.key}`,
          label: s.name,
          emoji: s.reputation >= 60 ? '\u{1F468}\u{200D}⚕\u{FE0F}' : '\u{1F9D1}\u{200D}⚕\u{FE0F}',
          subtitle: `Reputation ${repBar(s.reputation)} ${s.reputation}% · ${money(s.price)}`,
          disabledReason: (st) => (flagStrings(st, SUED).includes(s.name) ? `${s.name} refuses to operate on you after you sued them.` : null),
          confirm: () => `Pay ${money(s.price)} for ${s.name} to perform your ${proc.name.toLowerCase()}?`,
          run: (d) => operate(d, proc, s),
        }),
      ),
  }
}

export const plasticSurgeryMenu: MenuGroup = {
  type: 'menu',
  id: 'surgery',
  label: 'Plastic Surgery',
  emoji: '\u{1F489}',
  subtitle: 'Go under the knife',
  disabledReason: (g) => gate(g, { minAge: 18 }),
  children: (g): MenuNode[] => PROCEDURES.filter((p) => (!p.gender || p.gender === g.character.gender) && procedureAvailable(g, p.id)).map(procedureMenu),
}
