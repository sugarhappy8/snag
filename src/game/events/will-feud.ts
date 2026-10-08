// Written out of the will: family who learn they were cut out get genuinely angry. This yearly hook
// runs the feud while the player is alive: how the people who don't know find out (a leak from the
// lawyer's office, a relative who talks, a family dinner), how anger cools or hardens, and how it
// escalates (cold shoulder, badmouthing, a confrontation, a spouse's ultimatum, the tabloids, kids
// caught in the middle, a child cutting contact) and what it costs in old age. After the player
// dies, will-estate.ts takes over (the reading, contests, probate); its yearly tail runs here too.
//
// Costs and pace: at most one popup scene a year (useYearAction 'will.scene'), the quiet beats are
// bundled into one "Family Tension" notice, and the hook draws no randomness at all for a player
// with nobody cut out, so ordinary lives are untouched.
import { addStat, count, formatMoney, log, notice, spend, useYearAction } from '../core'
import { realWealthFactor } from '../history/events-people'
import { divorce } from '../love'
import { chance, pick, randInt, shuffle } from '../rng'
import type { GameState, Person } from '../types'
import { landline } from './era'
import { goodsScale, isAbroad, typicalIncome } from './wealth-core'
import { afterWillChange, ensureSnap, estrange, learn } from './will-act'
import {
  angerDrift,
  canBeNamed,
  estrangedKids,
  isDiscreet,
  isGossip,
  isInLine,
  readWl,
  temper,
  updateWl,
  willRole,
  yourWho,
  myWho,
  cap,
  type Learn,
} from './will-core'
import { yearlyEstateTail } from './will-estate'
import { queueConfront, queueGrandkids, queueOlive, queuePress, queueSpouseUltimatum } from './will-scenes'

const FAMILY_ROLES = new Set(['spouse', 'child', 'stepchild', 'grandchild', 'parent', 'sibling'])

/** The player's own family who might talk, take sides or help (adults, alive, not disowned). */
function familyAdults(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && p.age >= 16 && p.data.disowned !== true && FAMILY_ROLES.has(willRole(p) ?? ''))
}

function contactWord(g: GameState): string {
  return landline(g) ? 'calling' : 'writing'
}

// ---------------------------------------------------------------------------
// Finding out

interface Discovery {
  how: Learn
  by?: Person
}

/** Who knows what is in the will: the spouse and anyone named in it. */
function informants(g: GameState, except: Person): Person[] {
  return familyAdults(g).filter((x) => x.id !== except.id && (x.relation === 'spouse' || isInLine(g, x) || readWl(g, x).known))
}

/** How an unaware relative finds out this year, if they do: a leak, a relative, a family dinner. Not a coin flip: each channel has its own odds. */
function discover(g: GameState, p: Person): Discovery | null {
  const w = readWl(g, p)
  if (w.estr) return null
  const recent = g.year - w.cutY <= 1
  if (chance(g, 0.04 + (recent ? 0.03 : 0))) return { how: 'leak' }
  const tellers = shuffle(g, informants(g, p)).slice(0, 5)
  for (const x of tellers) {
    const xw = readWl(g, x)
    const odds = 0.02 + (isGossip(x) ? 0.07 : 0) - (isDiscreet(x) ? 0.015 : 0) + (x.relation === 'spouse' ? 0.03 : 0) + (xw.cut && xw.known ? 0.05 : 0)
    if (chance(g, Math.max(0, odds))) return { how: 'relative', by: x }
  }
  const gathering = !isAbroad(g, p) && p.age >= 13 && (p.livesWithPlayer || p.relationship >= 30) && familyAdults(g).filter((x) => x.id !== p.id && !isAbroad(g, x)).length >= 2
  if (gathering) {
    const raw = familyAdults(g).some((x) => x.id !== p.id && readWl(g, x).known && readWl(g, x).anger >= 40)
    if (chance(g, raw ? 0.14 : 0.09)) return { how: 'dinner' }
  }
  return null
}

// ---------------------------------------------------------------------------
// Taking sides

function takeSides(g: GameState, angry: Person, notes: string[]): void {
  const aw = readWl(g, angry)
  const others = shuffle(
    g,
    familyAdults(g).filter((x) => x.id !== angry.id && x.relation !== 'grandchild'),
  ).slice(0, 2)
  for (const x of others) {
    if (!chance(g, 0.6)) continue
    const t = temper(x)
    const xw = readWl(g, x)
    const inW = isInLine(g, x)
    const greedy = x.traits.some((tr) => ['jealous', 'arrogant', 'stingy', 'manipulative'].includes(tr))
    const sympathy = t.forgiving + (xw.cut ? 2 : 0) + (x.relationship < 40 ? 1 : 0) - (inW && greedy ? 2 : 0) - (isDiscreet(x) && !xw.cut ? 1 : 0)
    if (sympathy >= 1) {
      const dent = randInt(g, 3, 7)
      x.relationship = Math.max(0, x.relationship - dent)
      if (xw.cut && xw.known) updateWl(g, x, (w) => void (w.anger = Math.min(Math.max(w.anger, aw.anger), w.anger + 5)))
      notes.push(`${cap(yourWho(x))} took ${angry.firstName}'s side, loudly, at the worst possible moment.`)
      log(g, `${cap(myWho(x))} took ${angry.firstName}'s side about my will.`, 'bad')
    } else {
      x.relationship = Math.min(100, x.relationship + 2)
      notes.push(`${cap(yourWho(x))} told everyone ${angry.firstName} was being dramatic. Whether that helps is another matter.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Old age

/** Estranged children aren't there when you're old: loneliness, and a stranger's wages for the help you used to get free. */
function elderYear(g: GameState, notes: string[]): void {
  const c = g.character
  if (c.age < 65) return
  const gone = estrangedKids(g)
  if (gone.length === 0) return
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age >= 18 && p.data.disowned !== true)
  const helpers = kids.filter((k) => !readWl(g, k).estr && k.relationship >= 45 && !isAbroad(g, k))
  if (helpers.length > 0) return
  const partner = g.people.find((p) => p.alive && p.relation === 'spouse' && p.relationship >= 40)
  addStat(g, 'happiness', partner ? -1 : -2)
  if (c.age >= 75 && !partner) {
    const aide = Math.round(9000 * goodsScale(g) * realWealthFactor(g.year))
    if (spend(g, aide)) {
      log(g, `With nobody from the family around, I paid ${formatMoney(aide)} for help at home.`)
      notes.push(`Nobody from the family is around to drive you to appointments or check on you. You paid ${formatMoney(aide)} for a home aide instead.`)
    } else {
      addStat(g, 'health', -2)
      log(g, 'With nobody from the family around and no money for help, I struggled at home.', 'bad')
      notes.push('Nobody from the family is around, and you can’t afford help. The house, and you, are not doing well.')
    }
  } else if (chance(g, 0.4)) {
    log(g, `The holidays were quiet without ${gone[0].firstName}.`, 'bad')
    notes.push(`The holidays were quiet. ${yourWho(gone[0])} ${landline(g) ? "didn't call, and the phone sat very still" : "didn't visit, and the mailbox stayed empty"}.`)
  }
}

// ---------------------------------------------------------------------------
// The yearly hook

function famous(g: GameState): boolean {
  if (g.character.hidden.fame >= 35) return true
  const big = typicalIncome(g) * 60
  return g.assets.some((a) => a.kind === 'business' && a.value >= big)
}

function grandkidsOf(g: GameState, p: Person): Person[] {
  return g.people.filter((x) => x.alive && x.relation === 'grandchild' && x.age >= 4 && x.age <= 17 && (x.data.parentId === p.id || x.data.childOf === p.id || x.otherParentId === p.id))
}

const DIVORCE_ROLES = new Set(['spouse'])

/** Yearly hook: simmering and exploding feuds over the will. No-op when nobody was cut out. */
export function yearlyWillFeuds(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  yearlyEstateTail(g)
  if (c.age < 18) return
  ensureSnap(g)
  const notes: string[] = []

  // Another module rewrote the will under the player (a spoiled kid written out in a wealth popup).
  const ext = afterWillChange(g, true)
  notes.push(...ext.lines)

  const cutOnes = g.people.filter((p) => p.alive && canBeNamed(p) && readWl(g, p).cut)
  const estranged = g.people.filter((p) => p.alive && readWl(g, p).estr)

  // 1. The unaware find out.
  for (const p of cutOnes) {
    const w = readWl(g, p)
    if (w.known || p.age < 13) continue
    const found = discover(g, p)
    if (!found) continue
    const line = learn(g, p, found.how, found.by)
    notes.push(line)
    log(g, `${cap(myWho(p))} found out about my will.`, 'bad')
  }

  // 2. Anger cools or hardens; the angry go cold.
  for (const p of g.people) {
    if (!p.alive) continue
    const w = readWl(g, p)
    if (!w.known || w.anger <= 0) continue
    const inW = isInLine(g, p)
    const delta = angerDrift(p, w, inW)
    const next = Math.max(0, Math.min(100, Math.round(w.anger + delta)))
    updateWl(g, p, (x) => {
      x.anger = next
    })
    if (next >= 25 && !inW && !w.estr) p.relationship = Math.max(0, p.relationship - Math.max(1, Math.round(next / 30)))
    if (!inW && w.cut && next >= 25 && !w.cold) {
      updateWl(g, p, (x) => {
        x.cold = true
        x.stage = Math.max(x.stage, 1)
      })
      notes.push(`${p.firstName} has stopped ${contactWord(g)} and skipped the last family get-together.`)
      log(g, `${cap(myWho(p))} went cold on me over the will.`, 'bad')
    } else if (w.cold && !w.estr && next < 12) {
      updateWl(g, p, (x) => {
        x.cold = false
      })
      notes.push(`${p.firstName} started ${contactWord(g)} again.`)
      log(g, `${cap(myWho(p))} started talking to me again.`, 'good')
    }
  }

  // 3. Quiet beats for the angry: skipped holidays and badmouthing.
  const stageAtStart = new Map(g.people.map((p) => [p.id, readWl(g, p).stage]))
  const angry = cutOnes
    .map((p) => ({ p, w: readWl(g, p) }))
    .filter(({ w }) => w.known && w.cut && w.anger >= 25)
    .sort((a, b) => b.w.anger - a.w.anger)
  for (const { p, w } of angry) {
    if (w.cold && !w.estr && chance(g, 0.35)) {
      addStat(g, 'happiness', -1)
      notes.push(`${p.firstName} skipped the holidays this year. The empty chair got a lot of attention.`)
    }
    if (w.anger >= 40 && p.age >= 16 && chance(g, 0.3)) {
      updateWl(g, p, (x) => {
        x.stage = Math.max(x.stage, 2)
      })
      takeSides(g, p, notes)
    }
  }

  // 4. At most one scene a year.
  let scene = false
  const tryScene = (): boolean => {
    if (scene) return false
    if (!useYearAction(g, 'will.scene', 1)) return false
    scene = true
    return true
  }
  for (const { p } of angry) {
    if (scene) break
    const w = readWl(g, p)
    const a = w.anger
    const role = willRole(p)
    if (!role) continue
    if (role === 'spouse') {
      if (DIVORCE_ROLES.has(role) && a >= 75 && w.threatY > 0 && g.year - w.threatY >= 1 && chance(g, 0.45)) {
        if (tryScene()) {
          log(g, `${p.firstName} left me over the will.`, 'bad')
          // A prenup is no wall against an angry spouse's lawyer: sometimes a judge sets it aside.
          if (p.data.prenup === true && chance(g, 0.4)) {
            delete p.data.prenup
            notice(g, 'The Prenup', `${p.firstName}'s lawyer argued the prenup was signed under pressure and a judge agreed. It no longer protects you.`, { emoji: '\u{1F4C4}', tone: 'bad' })
          }
          divorce(g, p, 'them')
        }
      } else if (a >= 50 && g.year - w.threatY >= 2 && chance(g, 0.5) && tryScene()) {
        queueSpouseUltimatum(g, p)
      }
      continue
    }
    if (a >= 70 && (role === 'child' || role === 'stepchild' || role === 'sibling' || role === 'parent') && p.age >= 18 && (stageAtStart.get(p.id) ?? 0) >= 3 && !w.estr && chance(g, 0.25 + (a - 70) / 100) && tryScene()) {
      const line = estrange(g, p)
      notice(g, 'Cut Off', line, { emoji: '\u{1F6AA}', tone: 'bad' })
      count(g, 'estrangements')
      continue
    }
    if (a >= 45 && role !== 'grandchild' && p.age >= 16 && g.year - w.confY >= 3 && chance(g, Math.min(0.9, 0.4 + (a - 45) / 100)) && tryScene()) {
      queueConfront(g, p)
      continue
    }
    if (a >= 55 && famous(g) && g.year - (typeof g.flags['will.pressY'] === 'number' ? g.flags['will.pressY'] : 0) >= 5 && chance(g, 0.18) && tryScene()) {
      g.flags['will.pressY'] = g.year
      queuePress(g, p)
      continue
    }
    if (a >= 40 && role === 'child') {
      const kids = grandkidsOf(g, p)
      if (kids.length > 0 && chance(g, 0.3) && tryScene()) queueGrandkids(g, p, pick(g, kids))
    }
  }

  // 5. Estranged people: the door stays shut, unless they knock.
  for (const p of estranged) {
    const w = readWl(g, p)
    p.livesWithPlayer = false
    p.relationship = Math.min(p.relationship, 20)
    for (const gc of g.people) {
      if (gc.alive && gc.relation === 'grandchild' && (gc.data.parentId === p.id || gc.data.childOf === p.id || gc.otherParentId === p.id)) {
        gc.livesWithPlayer = false
        gc.relationship = Math.max(0, gc.relationship - 2)
      }
    }
    if (!scene && w.anger < 35 && g.year - w.estrY >= 3 && chance(g, 0.12) && tryScene()) queueOlive(g, p)
  }

  elderYear(g, notes)

  if (notes.length > 0) {
    const text = notes.slice(0, 4).join('\n\n')
    const worst = notes.some((n) => /furious|angry|cut off|left/i.test(n))
    notice(g, 'Family Tension', text, { emoji: '\u{1F4DC}', tone: worst ? 'bad' : undefined })
  }
}
