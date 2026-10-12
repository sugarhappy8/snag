// Owning brand pieces: the holding screen (value, condition, authenticity, service, insurance,
// selling, gifts, family access), the Your Collection menu, and the yearly step: the market
// moves, wear and tear, running costs, premiums, theft and loss.
import { conditionLabel, findAsset, giftAsset } from '../assets'
import { noteCashGift } from '../events/wealth-core'
import { addMoney, addStat, formatMoney, fullName, getPerson, hasLicense, inPrison, log, notice, relationLabel, shortMoney, useYearAction } from '../core'
import { brandById, brandsFor } from '../data/brands'
import { chance, pick, randInt } from '../rng'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { lineById } from './luxury-brands-catalog'
import {
  authenticate,
  consignToAuction,
  decayHeat,
  discardAsset,
  insuredNow,
  openBottle,
  sellToDealer,
  serviceAsset,
  showOffFame,
  toggleInsurance,
} from './luxury-brands-deal'
import {
  auctionTerms,
  auctionTypical,
  authCost,
  authOf,
  claimPayout,
  dealerOffer,
  deductibleOf,
  def,
  insurePremium,
  isFake,
  isLux,
  marketValue,
  outlookFrom,
  runningCost,
  serviceCost,
  serviceDue,
  stepMarket,
  syncValue,
  theftOdds,
} from './luxury-brands-value'
import { familyAccessNode, familyAccessSummary } from './luxury-family'
import { luxuryBlock, num, serviceMult, str, type PopupBudget, takePopup } from './luxury-common'

/** Brand pieces the player owns, most valuable first. */
export function brandAssets(g: GameState): Asset[] {
  return g.assets.filter(isLux).sort((a, b) => b.value - a.value)
}

const WEARABLE = ['watch', 'jewelry', 'handbag', 'luggage', 'fashion', 'eyewear', 'pen', 'sneakers', 'tech', 'fine']
const PORTABLE = ['watch', 'jewelry', 'handbag', 'luggage', 'fashion', 'eyewear', 'pen', 'sneakers', 'tech']

function cat(a: Asset): string {
  return str(a.details.cat)
}

function isVehicle(a: Asset): boolean {
  const c = cat(a)
  return c === 'car' || c === 'moto' || c === 'boat' || c === 'air'
}

function house(g: GameState): string | null {
  return brandsFor(g, 'auction')[0]?.name ?? null
}

function authLine(a: Asset): string {
  switch (authOf(a)) {
    case 'verified':
      return '✅ Certified genuine'
    case 'fake':
      return '🚫 A counterfeit (worth very little)'
    default:
      return a.details.chan === 'boutique' ? '✅ Bought from the brand (authentic)' : '❔ Authenticity not checked (until it is, buyers price in the risk of a copy)'
  }
}

function holdLine(g: GameState, a: Asset): string | null {
  if (!hasTalent(g, 'Business') || isFake(a)) return null
  const owned = Math.max(0, g.year - num(a.details.boughtYear, g.year))
  const o = outlookFrom(str(a.details.cls), owned, 5, lineById(str(a.details.line))?.peak)
  const pct = (x: number) => `${Math.round((x - 1) * 100) >= 0 ? '+' : ''}${Math.round((x - 1) * 100)}%`
  return talentHint(g, 'Business', `Over the next 5 years a piece like this typically moves ${pct(o.typical)} (range ${pct(o.low)} to ${pct(o.high)}), before selling costs. Markets can surprise.`)
}

function infoRows(g: GameState, a: Asset): MenuNode[] {
  const rows: string[] = []
  const line = lineById(str(a.details.line))
  const brand = brandById(str(a.details.brand))
  rows.push(`${a.emoji} ${brand ? brand.name : 'Brand'}${line ? ` · ${line.name}` : ''}${str(a.details.variant) ? ` · ${str(a.details.variant)}` : ''}`)
  rows.push(`💰 Market value about ${formatMoney(marketValue(a))} · quick-sale value ${formatMoney(a.value)} (this is what counts toward your net worth)`)
  rows.push(`🔧 Condition ${a.condition}% (${conditionLabel(a.condition)})${serviceDue(g, a) ? ' · service due' : ''}`)
  rows.push(authLine(a))
  if (num(a.details.vintage) > 0) rows.push(`🍷 Vintage ${num(a.details.vintage)} · ${num(a.details.qty, 1)} bottle${num(a.details.qty, 1) === 1 ? '' : 's'} left`)
  if (a.details.chan === 'preowned' || a.details.chan === 'gray' || a.details.chan === 'auction') rows.push(`🧾 Bought ${a.details.chan === 'preowned' ? 'pre-owned from a dealer' : a.details.chan === 'gray' ? 'on the gray market' : 'at auction'} in ${num(a.details.boughtYear)}`)
  if (insuredNow(a)) rows.push(`🛡️ Insured · deductible ${formatMoney(deductibleOf(a))}`)
  if (a.upkeep > 0) rows.push(`🧾 Running costs: ${formatMoney(a.upkeep)}/year`)
  const fam = familyAccessSummary(g, a)
  if (fam) rows.push(`👪 ${fam}`)
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `lux-info-${a.id}-${i}`, text }))
}

function live(g: GameState, a: Asset): Asset {
  return findAsset(g, a.id) ?? a
}

function enjoyVerb(a: Asset): string {
  switch (cat(a)) {
    case 'car':
    case 'moto':
      return 'Take It for a Drive'
    case 'boat':
      return 'Take It Out on the Water'
    case 'air':
      return 'Go for a Flight'
    case 'wine':
    case 'spirit':
      return 'Admire the Cellar'
    case 'art':
      return 'Admire It'
    default:
      return 'Wear It Out'
  }
}

function enjoyBlock(g: GameState, a: Asset): string | null {
  const b = luxuryBlock(g)
  if (b) return b
  const cur = live(g, a)
  const c = cat(cur)
  if (c === 'car' || c === 'moto') return hasLicense(g, 'driver') ? null : "You need a driver's license to drive it."
  if (c === 'boat' && typeof cur.details.license === 'string' && !hasLicense(g, cur.details.license)) return 'You need a boating license to take it out.'
  if (c === 'air' && !hasLicense(g, 'pilot')) return "You need a pilot's license to fly it."
  return null
}

function enjoyAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-enjoy-${a.id}`,
    label: enjoyVerb(a),
    emoji: '✨',
    disabledReason: (g) => enjoyBlock(g, a),
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (!cur) return
      if (!useYearAction(g, `lux.enjoy.${cur.id}`, 2)) {
        notice(g, enjoyVerb(cur), `You have enjoyed your ${cur.name} plenty this year. It is not going anywhere.`, { emoji: cur.emoji })
        return
      }
      const veh = isVehicle(cur)
      cur.condition = Math.max(0, cur.condition - (veh ? randInt(g, 0, 3) : randInt(g, 0, 1)))
      if (veh) cur.details.mileage = num(cur.details.mileage) + randInt(g, 500, 4_000)
      if (veh && chance(g, 0.015 + (cur.condition < 40 ? 0.03 : 0))) {
        cur.condition = Math.max(0, cur.condition - randInt(g, 15, 30))
        syncValue(cur)
        addStat(g, 'happiness', -3)
        log(g, `I dented my ${cur.name}.`, 'bad')
        notice(g, 'A Dent', `A tiny misjudgment, a tiny noise, and your ${cur.name} has a mark that will cost real money to fix. Nobody was hurt. Condition is now ${cur.condition}%.`, { emoji: '😬', tone: 'bad' })
        return
      }
      syncValue(cur)
      // The joy of owning nice things is real but not a bottomless well: the first few outings a year count.
      const joyful = useYearAction(g, 'lux.enjoy.joy', 4)
      if (joyful) addStat(g, 'happiness', randInt(g, 2, 6))
      const fame = WEARABLE.includes(cat(cur)) || veh ? showOffFame(g) : 0
      log(g, `I enjoyed my ${cur.name}.`)
      notice(g, enjoyVerb(cur), `${pick(g, [`You and your ${cur.name} had a lovely day out.`, `Heads turned. You pretended not to notice.`, `Someone asked what it was. You told them. Slowly.`])}${fame ? ' A few people will remember who you are.' : ''}`, { emoji: cur.emoji, tone: 'good' })
    },
  }
}

function serviceAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-service-${a.id}`,
    label: 'Service It',
    emoji: '🔧',
    subtitle: (g) => `${formatMoney(serviceCost(live(g, a), serviceMult(g)))}${serviceDue(g, live(g, a)) ? ' · due now' : ''}`,
    disabledReason: (g) => luxuryBlock(g) ?? (live(g, a).condition >= 95 ? 'It is in perfect shape already.' : null),
    confirm: (g) => `Service your ${a.name} for ${formatMoney(serviceCost(live(g, a), serviceMult(g)))}?`,
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) serviceAsset(g, cur)
    },
  }
}

function authAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-auth-${a.id}`,
    label: 'Have It Authenticated',
    emoji: '🔍',
    subtitle: (g) => `${formatMoney(authCost(live(g, a), serviceMult(g)))} · an expert checks it is genuine`,
    visible: (g) => authOf(live(g, a)) === 'unknown' && live(g, a).details.chan !== 'boutique',
    disabledReason: (g) => luxuryBlock(g),
    confirm: (g) => `Pay ${formatMoney(authCost(live(g, a), serviceMult(g)))} to have your ${a.name} authenticated?`,
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) authenticate(g, cur)
    },
  }
}

function insureAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-insure-${a.id}`,
    label: (a.details.luxIns === true ? 'Cancel Insurance' : 'Insure It'),
    emoji: '🛡️',
    subtitle: (g) => {
      const cur = live(g, a)
      return cur.details.insured === true ? 'Already insured through your Assets policy' : cur.details.luxIns === true ? `${formatMoney(insurePremium(cur))}/year` : `${formatMoney(insurePremium(cur))}/year · ${formatMoney(deductibleOf(cur))} deductible`
    },
    disabledReason: (g) => luxuryBlock(g) ?? (live(g, a).details.insured === true ? 'Your regular policy already covers it.' : null),
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) toggleInsurance(g, cur)
    },
  }
}

function sellDealerAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-sell-dealer-${a.id}`,
    label: 'Sell to a Dealer',
    emoji: '🤝',
    subtitle: (g) => `${formatMoney(dealerOffer(live(g, a)))} now · about ${Math.round(def(str(a.details.cls)).spread * 100)}% of market value`,
    hint: (g) => holdLine(g, live(g, a)),
    disabledReason: (g) => luxuryBlock(g),
    confirm: (g) => `Sell your ${a.name} to a dealer for ${formatMoney(dealerOffer(live(g, a)))}?`,
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) sellToDealer(g, cur)
    },
  }
}

function sellAuctionAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-sell-auction-${a.id}`,
    label: 'Consign to Auction',
    emoji: '🔨',
    subtitle: (g) => {
      const cur = live(g, a)
      const t = auctionTerms(cur)
      return `${house(g) ?? 'An auction house'} · about ${shortMoney(auctionTypical(cur))} after a ${Math.round(t.commission * 100)}% commission, if it sells`
    },
    visible: (g) => house(g) !== null,
    disabledReason: (g) => luxuryBlock(g),
    confirm: (g) => {
      const cur = live(g, a)
      const t = auctionTerms(cur)
      return `Consign your ${a.name} to ${house(g)}? The hammer price can land above or below its market value, the house takes ${Math.round(t.commission * 100)}% plus about ${Math.round(t.fixed * 100)}% in costs, and there is a ${Math.round(t.unsold * 100)}% chance it does not sell.`
    },
    run: (g) => {
      const cur = findAsset(g, a.id)
      const h = house(g)
      if (cur && h) consignToAuction(g, cur, h)
    },
  }
}

function giftMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `lux-gift-${a.id}`,
    label: 'Give as a Gift',
    emoji: '🎁',
    subtitle: 'Give it to a friend or relative',
    disabledReason: (g) => luxuryBlock(g),
    header: () => `Who should have your ${a.name}?`,
    children: (g) => {
      // Cars go to adults and a bottle only to someone old enough to drink it where you live.
      const minAge = isVehicle(a) ? 18 : cat(a) === 'wine' || cat(a) === 'spirit' ? Math.max(18, getCountry(g.character.countryId).drinkingAge) : 12
      const people = g.people.filter((p) => p.alive && p.age >= minAge && ['child', 'stepchild', 'partner', 'spouse', 'fiance', 'parent', 'sibling', 'friend', 'bestFriend'].includes(p.relation))
      if (!people.length) return [{ type: 'info', id: 'lux-gift-none', text: 'There is nobody to give it to.', emoji: '🤷' }]
      return people.slice(0, 16).map(
        (p): MenuAction => ({
          type: 'action',
          id: `lux-giftto-${a.id}-${p.id}`,
          label: fullName(p),
          emoji: '🎁',
          subtitle: `${relationLabel(p)} · Relationship ${p.relationship}%`,
          confirm: () => `Give your ${a.name} to ${p.firstName}?`,
          run: (gg) => {
            const cur = findAsset(gg, a.id)
            // The row was built from the state on screen: write to this draft's copy of them.
            const who = getPerson(gg, p.id)
            if (!cur || !who) return
            const worth = cur.value
            // A valuable gift counts as money given, and spoils a young relative like any windfall.
            if (giftAsset(gg, cur.id, who.id)) noteCashGift(gg, who, worth)
          },
        }),
      )
    },
  }
}

function openAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `lux-open-${a.id}`,
    label: 'Open a Bottle',
    emoji: '🍾',
    visible: (g) => ['wine', 'spirit'].includes(cat(live(g, a))),
    disabledReason: (g) => luxuryBlock(g),
    confirm: () => 'Open one for a special occasion? It is gone once it is poured.',
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) openBottle(g, cur)
    },
  }
}

function dropAction(a: Asset, donate: boolean): MenuAction {
  return {
    type: 'action',
    id: `lux-${donate ? 'donate' : 'discard'}-${a.id}`,
    label: donate ? 'Donate It' : 'Throw It Away',
    emoji: donate ? '🤲' : '🗑️',
    visible: (g) => authOf(live(g, a)) === 'fake' || !donate,
    disabledReason: (g) => luxuryBlock(g),
    confirm: () => (donate ? `Donate your ${a.name}?` : `Throw away your ${a.name}?`),
    run: (g) => {
      const cur = findAsset(g, a.id)
      if (cur) discardAsset(g, cur, donate)
    },
  }
}

/** The holding screen for a brand piece; null when the asset is not one of ours. */
export function luxuryAssetNodes(g: GameState, a: Asset): MenuNode[] | null {
  if (!isLux(a)) return null
  const nodes: MenuNode[] = [...infoRows(g, a), { type: 'heading', id: `lux-actions-${a.id}`, label: 'Actions' }]
  const hold = holdLine(g, a)
  if (hold) nodes.push({ type: 'info', id: `lux-hold-${a.id}`, text: hold, emoji: '🔮' })
  nodes.push(enjoyAction(a))
  if (!['wine', 'spirit', 'art'].includes(cat(a)) && (def(str(a.details.cls)).service > 0 || a.condition < 95)) nodes.push(serviceAction(a))
  nodes.push(authAction(a), insureAction(a), openAction(a))
  const fam = familyAccessNode(g, a)
  if (fam) nodes.push(fam)
  nodes.push({ type: 'heading', id: `lux-sell-h-${a.id}`, label: 'Sell or Give' }, sellDealerAction(a), sellAuctionAction(a), giftMenu(a), dropAction(a, true), dropAction(a, false))
  return nodes
}

function holdingNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `lux-asset-${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: (gg) => {
      const cur = live(gg, a)
      return `${shortMoney(cur.value)} · ${cur.condition}% condition${authOf(cur) === 'fake' ? ' · fake' : ''}`
    },
    header: (gg) => (findAsset(gg, a.id) ? `${a.emoji} ${live(gg, a).name}` : 'This is gone.'),
    children: (gg) => {
      const cur = findAsset(gg, a.id)
      if (!cur) return [{ type: 'info', id: 'lux-gone', text: 'You no longer own this.' }]
      return luxuryAssetNodes(gg, cur) ?? []
    },
  }
}

export const collectionMenu: MenuGroup = {
  type: 'menu',
  id: 'luxCollection',
  label: 'Your Collection',
  emoji: '🗝️',
  visible: (g) => brandAssets(g).length > 0,
  subtitle: (g) => {
    const list = brandAssets(g)
    return `${list.length} piece${list.length === 1 ? '' : 's'} · ${shortMoney(list.reduce((s, a) => s + a.value, 0))} quick-sale value`
  },
  header: () => 'Your brand pieces. Values here are what you could raise today; the market value is higher and takes a dealer or an auction to reach.',
  children: (g) => brandAssets(g).map((a) => holdingNode(a)),
}

// ---------------------------------------------------------------------------
// Yearly

const LOSS_LINES = [
  (n: string) => `Your ${n} went missing at a hotel. The staff searched everywhere, twice, with great sympathy.`,
  (n: string) => `Someone lifted your ${n} out of a coat pocket in a crowded place.`,
  (n: string) => `You left your ${n} in the back of a taxi. The taxi did not return it.`,
]

/** Yearly step for every brand piece: market, wear, running costs, premiums, theft and loss. */
export function yearlyBrandAssets(g: GameState, budget: PopupBudget): void {
  const c = g.character
  if (!c.alive) return
  decayHeat(g)
  const losses: string[] = []
  for (const a of [...g.assets]) {
    if (!isLux(a)) continue
    const d = def(str(a.details.cls))
    stepMarket(g, a)
    const overdue = serviceDue(g, a) ? randInt(g, 1, 3) : 0
    a.condition = Math.max(0, a.condition - randInt(g, d.wear[0], d.wear[1]) - overdue)
    syncValue(a)
    if (isVehicle(a) || cat(a) === 'wine' || cat(a) === 'spirit') a.upkeep = runningCost(a)
    // Premium: the policy lapses if you can't pay it.
    if (a.details.luxIns === true && a.details.insured !== true) {
      const prem = insurePremium(a)
      if (c.money >= prem) addMoney(g, -prem)
      else {
        a.details.luxIns = false
        log(g, `My insurance on the ${a.name} lapsed because I couldn't pay the premium.`, 'bad')
      }
    }
    // Theft and loss.
    const portable = PORTABLE.includes(cat(a))
    const odds = theftOdds(a) * (portable ? 1 : 0.6) * (inPrison(g) ? 0.4 : 1)
    if (odds > 0 && chance(g, odds)) {
      const insured = insuredNow(a)
      const pay = insured ? claimPayout(a) : 0
      g.assets = g.assets.filter((x) => x.id !== a.id)
      if (pay > 0) addMoney(g, pay)
      log(g, `My ${a.name} was ${portable ? 'lost' : 'stolen'}${pay > 0 ? `; the insurer paid ${formatMoney(pay)}` : ''}.`, 'bad')
      losses.push(
        `${portable ? pick(g, LOSS_LINES)(a.name) : `Thieves took your ${a.name} from where it was kept.`} ${pay > 0 ? `The insurer paid ${formatMoney(pay)} after the ${formatMoney(deductibleOf(a))} deductible.` : insured && isFake(a) ? 'The insurer found it was a counterfeit and paid nothing.' : 'It was not insured, so it is simply gone.'}`,
      )
      continue
    }
    if (serviceDue(g, a) && chance(g, 0.5)) log(g, `My ${a.name} is due for a service.`)
  }
  for (const text of losses.slice(0, 2)) {
    if (takePopup(budget, true)) notice(g, 'Gone', text, { emoji: '😢', tone: 'bad' })
  }
}
