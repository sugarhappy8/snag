// R3-H5 (H.2): Look closer. A screen of the Fog track that shows estimates ends its list with one group, lookCloser(g, { id, keys }), the
// way to pay for a sharper number. Its children are one action per source that can read at least one of the keys, with the fee and how
// far it sharpens in the subtitle, greyed out with the reason when it cannot be bought now (cash, already read this year, era, prison).
//
// What it never does: show in Exact mode (there is nothing to sharpen), show for keys no owner reads, or show when every offer is blocked.
// An illegal source asks first. Every read here is pure; a run calls buyIntel, which books the fee once through the ledger.
import { shortMoney } from '../core'
import type { GameState, MenuAction, MenuGroup } from '../types'
import { buyIntel, offersFor, type Offer } from './intel'
import { isExact } from './mode'
import { SOURCES, type SourceId } from './sources'

export const LOOK_EMOJI = '\u{1F50E}'

/** What an illegal purchase asks before it goes ahead. */
export const ILLEGAL_CONFIRM = "It's illegal. If it comes out, expect trouble."

const SOURCE_EMOJI: Readonly<Record<SourceId, string>> = {
  own: '\u{1F4DA}',
  news: '\u{1F4F0}',
  press: '\u{1F5DE}\u{FE0F}',
  report: '\u{1F4CA}',
  analyst: '\u{1F9EE}',
  diligence: '\u{1F9FE}',
  investigator: '\u{1F575}\u{FE0F}',
  informant: '\u{1F92B}',
  hacker: '\u{1F4BB}',
  desk: '\u{1F5C2}\u{FE0F}',
  lab: '\u{1F52C}',
}

/** What an offer costs in words: 'Free', or the fee in the player's money. */
export const priceText = (price: number): string => (price > 0 ? shortMoney(price) : 'Free')

/** How far an offer sharpens the keys, in percent of the sd: 'sharpens ±25% to ±12%', or 'stays at ±12%' when it cannot do better. */
export function sharpText(o: Pick<Offer, 'sdFrom' | 'sdTo'>): string {
  const from = Math.round(o.sdFrom * 100)
  const to = Math.round(o.sdTo * 100)
  return to < from ? `sharpens ±${from}% to ±${to}%` : `stays at ±${from}%`
}

/** The subtitle of an offer's row: the fee, then the sharpening. Under 70 characters for any currency a player can pick. */
export const offerSubtitle = (o: Offer): string => `${priceText(o.price)} · ${sharpText(o)}`

/** The action of one offer. `id` is the group's id; `keys` are the keys the screen asked about. */
function offerAction(id: string, keys: readonly string[], o: Offer): MenuAction {
  const illegal = SOURCES[o.src].kind === 'illegal'
  return {
    type: 'action',
    id: `${id}.${o.src}`,
    label: o.label,
    emoji: SOURCE_EMOJI[o.src],
    subtitle: offerSubtitle(o),
    disabledReason: () => o.block,
    ...(illegal ? { confirm: () => ILLEGAL_CONFIRM } : {}),
    run: (g) => void buyIntel(g, o.src, keys),
    stayOpen: true,
  }
}

/**
 * The "Look closer" group for the hidden numbers of one screen, or null when there is nothing to offer: Exact mode, no key an owner can
 * read, or every offer blocked. `scope.id` names the screen (the group's id is `look.<id>`); `scope.keys` are its keys, at most 12 are read.
 */
export function lookCloser(g: GameState, scope: { id: string; keys: readonly string[] }): MenuGroup | null {
  if (isExact() || typeof scope !== 'object' || scope === null || typeof scope.id !== 'string') return null
  const keys = Array.isArray(scope.keys) ? scope.keys.filter((k): k is string => typeof k === 'string') : []
  const offers = offersFor(g, keys)
  if (offers.length === 0 || offers.every((o) => o.block !== null)) return null
  const id = `look.${scope.id}`
  return {
    type: 'menu',
    id,
    label: 'Look closer',
    emoji: LOOK_EMOJI,
    subtitle: 'Pay for a sharper number',
    header: () => 'What you see here is an estimate. A better source narrows it, for a price.',
    children: (gg) => offersFor(gg, keys).map((o) => offerAction(id, keys, o)),
  }
}
