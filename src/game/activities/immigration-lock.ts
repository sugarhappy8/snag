// The owned-asset screen for money locked into a golden visa, investor visa or retirement-visa
// deposit (Assets › Belongings). Shows what the stake is, what it's worth, when it unlocks and
// what it's likely to be worth then (Investing talent), and lets you pull the money out early
// where the program allows it: with a haircut, and the visa it backs goes with it.
// Registered by menus.ts as the view for Asset.details.category === 'immigration'.
import { addMoney, log, notice } from '../core'
import { INVESTOR_PROGRAMS, RETIRE_PROGRAMS, type InvestKind } from '../data/immigration'
import { getCountry } from '../world'
import type { Asset, GameState, MenuNode } from '../types'
import { money } from './common'
import { LOCK_CATEGORY } from './immigration-move'
import { LOCK_DRIFT, investKindWord, lockHint } from './immigration-routes'
import { hasTalent } from '../talents'
import { statusOf } from './immigration-state'

function kindOf(a: Asset): InvestKind {
  const k = a.details.investKind
  return typeof k === 'string' && k in LOCK_DRIFT ? (k as InvestKind) : 'fund'
}

function until(g: GameState, a: Asset): number {
  const u = a.details.until
  return typeof u === 'number' && Number.isFinite(u) ? u : g.year
}

function programOf(a: Asset): { name: string; dest: string; citizen: boolean; retire: boolean } {
  const id = typeof a.details.program === 'string' ? a.details.program : ''
  const inv = INVESTOR_PROGRAMS.find((p) => p.id === id)
  if (inv) return { name: inv.name, dest: inv.dest, citizen: inv.result === 'citizen', retire: false }
  const ret = RETIRE_PROGRAMS.find((p) => p.id === id)
  if (ret) return { name: ret.name, dest: ret.dest, citizen: false, retire: true }
  const dest = typeof a.details.country === 'string' ? a.details.country : ''
  return { name: a.name, dest, citizen: false, retire: false }
}

/** Share of the stake you get back when pulling out early (null: the program won't release it). */
export function earlyExitShare(a: Asset): number | null {
  const prog = programOf(a)
  if (prog.citizen) return null
  switch (kindOf(a)) {
    case 'loan':
      return null
    case 'deposit':
      return prog.retire ? 0.97 : null
    case 'bonds':
      return 0.95
    case 'business':
      return 0.7
    case 'fee':
      return null
    default:
      return 0.9
  }
}

export function isVisaLock(a: Asset): boolean {
  return a.kind === 'other' && a.details.category === LOCK_CATEGORY
}

export function visaLockSubtitle(g: GameState, a: Asset): string {
  const end = until(g, a)
  return `${money(a.value)} · ${end > g.year ? `locked until ${end}` : 'unlocks this year'}`
}

export function visaLockView(g: GameState, a: Asset): MenuNode[] {
  const prog = programOf(a)
  const kind = kindOf(a)
  const end = until(g, a)
  const dest = prog.dest ? getCountry(prog.dest) : null
  const nodes: MenuNode[] = [
    { type: 'info', id: `imm.lock.${a.id}.what`, emoji: a.emoji, text: `${prog.name}${dest ? ` (${dest.name})` : ''}: ${money(a.value)} in ${investKindWord(kind)}. You put in ${money(a.purchasePrice)}.` },
    { type: 'info', id: `imm.lock.${a.id}.end`, emoji: '\u{1F512}', text: end > g.year ? `Locked until ${end}, when it comes back to you automatically.` : 'The lock ends this year: the money comes back to you at the end of it.' },
  ]
  // With the Investing talent, the purple forecast rides on the withdraw row below instead.
  if (end > g.year && kind !== 'fee' && !hasTalent(g, 'Investing')) {
    nodes.push({ type: 'info', id: `imm.lock.${a.id}.exp`, emoji: '\u{1F4C8}', text: `Its value moves with ${kind === 'property' ? 'the property market' : kind === 'fund' ? 'the markets' : kind === 'business' ? 'the project behind it' : kind === 'bonds' ? 'bond prices' : 'inflation'} until then.` })
  }
  const share = earlyExitShare(a)
  nodes.push({
    type: 'action',
    id: `imm.lock.${a.id}.withdraw`,
    label: 'Pull the money out early',
    emoji: '\u{1F4B8}',
    visible: (x) => until(x, a) > x.year,
    subtitle: (x) => (share === null ? 'Not allowed by the program' : `Get back about ${money(Math.round(a.value * share))}${backsCurrentVisa(x, a) ? ' · the visa goes with it' : ''}`),
    disabledReason: (x) => {
      const cur = x.assets.find((y) => y.id === a.id)
      if (!cur) return 'This investment is gone.'
      if (share === null) return prog.citizen ? `Your passport came on the condition that this stays put until ${until(x, cur)}.` : `The program holds this money until ${until(x, cur)}. No early withdrawals.`
      return null
    },
    confirm: (x) => {
      const cur = x.assets.find((y) => y.id === a.id)
      if (!cur || share === null) return null
      const backed = backsCurrentVisa(x, cur)
      return `Pull ${money(cur.value)} out of the ${prog.name.toLowerCase()} before ${until(x, cur)}? Early exit costs you ${Math.round((1 - share) * 100)}%: you'd get about ${money(Math.round(cur.value * share))}.${backed ? ' Without the investment, your visa will be revoked at the end of the year.' : ''}`
    },
    hint: (x) => {
      const cur = x.assets.find((y) => y.id === a.id)
      return cur ? lockHint(x, kind, cur.value, Math.max(0, until(x, cur) - x.year)) || null : null
    },
    run: (d) => withdrawEarly(d, a.id),
  })
  return nodes
}

function backsCurrentVisa(g: GameState, a: Asset): boolean {
  const s = statusOf(g)
  return s.status === 'visa' && (s.visa === 'investor' || s.visa === 'retire') && s.countryId === programOf(a).dest
}

/** Cash out a locked stake before the lock ends (mutates). The yearly clock revokes the visa it backed. */
export function withdrawEarly(g: GameState, assetId: string): void {
  const a = g.assets.find((x) => x.id === assetId)
  if (!a || !isVisaLock(a)) return
  const share = earlyExitShare(a)
  if (share === null || until(g, a) <= g.year) return
  const back = Math.max(0, Math.round(a.value * share))
  const backed = backsCurrentVisa(g, a)
  g.assets = g.assets.filter((x) => x.id !== a.id)
  addMoney(g, back)
  log(g, `I pulled ${money(back)} out of my ${a.name.toLowerCase()} early.`, backed ? 'bad' : 'neutral')
  notice(g, 'Money Out', `You pulled your money out early and got ${money(back)} back.${backed ? ' Immigration will notice: your visa will be revoked at the end of the year unless you have another way to stay.' : ''}`, { emoji: '\u{1F4B8}', tone: backed ? 'bad' : 'neutral' })
}

