// R3-H5 (H.2): the Intelligence Briefing. One group in the Assets tab (`intel.briefing`, slot assets.money, order 45) that answers three
// questions about the numbers the player has researched: what do I know, how fresh is it, and what do I pay to keep it so.
//
//   what you know   one info row per stored estimate, stalest first, at most 12 and a "N more" row; each carries the confidence chip and
//                   "as of <year>" at two years or more (MenuInfo.conf, asOf, drawn by the MenuList). Under each a Refresh: the
//                   cheapest legal source that is open, bought once, and not again in the year the reading was made.
//   standing orders a slider from 0 to 3 with a live caption of what the level does and costs a year (standing.ts)
//   the heat        a row in words when an informant or a hacker has been used; never a number
//
// The hub is hidden in a default life (no record), and in Exact mode (every number shows as it is, so there is nothing to refresh). While
// the dial or the heat is above 0 it stays visible in Exact too, because both run in either mode and the player must be able to cancel them.
// Every read here is pure: nothing is drawn or written, and a menu renders on a deep-frozen state.
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { buyIntel, offersFor, type Offer } from './intel'
import { labelOfKey } from './kinds'
import { offerSubtitle } from './look'
import { isExact } from './mode'
import { readKnow, storedEstimates } from './record'
import { SOURCES } from './sources'
import { describeOrders, dialOfPlayer, setDial } from './standing'
import type { Estimate } from './types'

/** The most estimate rows the hub lists; the rest are counted in one "N more" row. */
export const HUB_ROWS = 12

/** The heat in words, by the lowest heat each phrase starts at (the heat is 0 to 20; a number never shows). */
const HEAT_WORDS: ReadonlyArray<readonly [from: number, words: string]> = [
  [1, 'Quiet. Few people know who you pay.'],
  [4, 'Some people are asking who your sources are.'],
  [9, 'Investigators are asking about you.'],
  [15, "You're one leak away from a police file."],
]

/** The words for a heat of `h` (at least 1). */
export function heatWords(h: number): string {
  let out = HEAT_WORDS[0]![1]
  for (const [from, words] of HEAT_WORDS) if (h >= from) out = words
  return out
}

/** Whether the hub shows: a record with rows when the information is fogged, or the dial or the heat above 0 in any mode. */
export function hubShown(g: GameState): boolean {
  const rec = readKnow(g)
  if (!rec) return false
  if ((rec.d ?? 0) > 0 || (rec.h ?? 0) > 0) return true
  return !isExact() && Object.keys(rec.k).length > 0
}

/** The row of one stored estimate: its name, what it reads as, the chip and the year it is from. */
function estimateRow(g: GameState, e: Estimate): MenuInfo {
  return {
    type: 'info',
    id: `intel.row.${e.key}`,
    emoji: '\u{1F4D1}',
    text: `${labelOfKey(g, e.key)}: ${e.words}`,
    conf: e.conf,
    ...(e.asOf !== undefined ? { asOf: e.asOf } : {}),
  }
}

/** The cheapest of some offers: lowest fee, then the sharper, then the order of the table. */
const cheapest = (offers: readonly Offer[]): Offer => [...offers].sort((a, b) => a.price - b.price || a.sdTo - b.sdTo)[0]!

const FRESH = 'Already fresh this year.'

/**
 * What Refresh does for one key: the offer it would buy and why it cannot now (or null). Never an illegal source. Null when no legal source
 * reads the key (nobody owns it, or nothing sells it). A key read this year is fresh: nothing to refresh.
 */
export function refreshOf(g: GameState, key: string): { offer: Offer; block: string | null } | null {
  const offers = offersFor(g, [key]).filter((o) => SOURCES[o.src].kind !== 'illegal')
  if (offers.length === 0) return null
  const year = readKnow(g)?.k[key]?.y
  const open = offers.filter((o) => o.block === null)
  const offer = cheapest(open.length > 0 ? open : offers)
  if (year === g.year) return { offer, block: FRESH }
  return { offer, block: open.length > 0 ? null : offer.block }
}

function refreshRow(g: GameState, e: Estimate): MenuAction | null {
  const r = refreshOf(g, e.key)
  if (!r) return null
  const key = e.key
  return {
    type: 'action',
    id: `intel.refresh.${key}`,
    label: `Refresh ${labelOfKey(g, key)}`,
    emoji: '\u{1F504}',
    subtitle: `${r.offer.label} · ${offerSubtitle(r.offer)}`,
    disabledReason: () => r.block,
    run: (gg) => {
      const now = refreshOf(gg, key)
      if (now && now.block === null) buyIntel(gg, now.offer.src, [key])
    },
    stayOpen: true,
  }
}

/** The slider of the standing orders. */
const ordersRow: MenuAction = {
  type: 'action',
  id: 'intel.orders',
  label: 'Standing orders',
  emoji: '\u{1F4EC}',
  subtitle: (g) => {
    const d = dialOfPlayer(g)
    return d === 0 ? 'Off' : `Level ${d}`
  },
  input: {
    kind: 'slider',
    label: 'How much to keep fresh',
    min: 0,
    max: 3, // DIAL_MAX (rows.ts), a literal because a module-level read of an import fails the eager-read ratchet; the hub test pins it
    step: 1,
    defaultValue: (g) => String(dialOfPlayer(g)),
    preview: (g, value) => describeOrders(g, value),
  },
  run: (g, input) => setDial(g, Number(input)),
  stayOpen: true,
}

function briefingRows(g: GameState): MenuNode[] {
  const out: MenuNode[] = []
  const all = isExact() ? [] : storedEstimates(g)
  if (all.length > 0) {
    out.push({ type: 'heading', id: 'intel.heading.known', label: 'What you know' })
    for (const e of all.slice(0, HUB_ROWS)) {
      out.push(estimateRow(g, e))
      const refresh = refreshRow(g, e)
      if (refresh) out.push(refresh)
    }
    if (all.length > HUB_ROWS) out.push({ type: 'info', id: 'intel.more', text: `${all.length - HUB_ROWS} more.` })
  }
  out.push({ type: 'heading', id: 'intel.heading.orders', label: 'Standing orders' }, ordersRow)
  const heat = readKnow(g)?.h ?? 0
  if (heat > 0) out.push({ type: 'info', id: 'intel.heat', emoji: '\u{1F525}', text: heatWords(heat) })
  return out
}

/** The hub itself: `intel.briefing`. */
export const intelBriefingMenu: MenuGroup = {
  type: 'menu',
  id: 'intel.briefing',
  label: 'Intelligence Briefing',
  emoji: '\u{1F5C2}\u{FE0F}',
  subtitle: (g) => {
    const d = dialOfPlayer(g)
    const n = isExact() ? 0 : storedEstimates(g).length
    return d > 0 ? `Standing orders, level ${d}` : n > 0 ? `${n} ${n === 1 ? 'number' : 'numbers'} you track` : 'What you know and how fresh it is'
  },
  visible: hubShown,
  header: () => 'What you know, how fresh it is, and what you pay to keep it so.',
  children: briefingRows,
}
