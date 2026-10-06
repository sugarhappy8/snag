// Everyday stores: bike shop, sporting goods, furniture & home decor, clothing & fashion, toys,
// pet supplies and garden & hardware. Each store has a seeded per-year stock (same all year, no
// g.rng use while rendering), prices scaled for the player's market, local-flavor items where
// people actually buy them, and Use actions for what you own (ride the bike, hit the slopes,
// host a BBQ). Bought items are Asset kind 'other' with details.category / details.store.
import { hasTech } from '../history/timeline'
import { addCondition, companionCandidates, payingParents } from '../activities/common'
import { findAsset, goodsMult, localGoodsMult, nicePrice, pricesIncludeTax, salesTaxNote, seeded, yearKey } from '../assets'
import {
  addHidden,
  addMoney,
  addPersonStat,
  addRelationship,
  addStat,
  children as childrenOf,
  count,
  formatMoney,
  inPrison,
  log,
  notice,
  relationLabel,
  remember,
  scriptChoice,
  spend,
  yearActionsUsed,
  useYearAction,
} from '../core'
import { localMarket } from '../data/markets'
import { createPerson, notePerson } from '../people'
import { chance, pick, randInt, uid } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { getCountry } from '../world'
import {
  BIKE_NATIONS,
  BIKES,
  CLOTHES,
  CRICKET,
  FURNITURE,
  GARDEN,
  itemInEra,
  LOCAL_CLOTHES,
  PET_SUPPLIES,
  petGroup,
  SNOW,
  SPORTS_GEAR,
  SURF_NATIONS,
  TOYS,
  type ItemDef,
  type PetItemDef,
  type PriceBasis,
  type UseId,
} from './everyday-data'

// ---------------------------------------------------------------------------
// Small helpers

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function lower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

/** "a road bike", "an e-bike", "the 1,000-piece puzzle" for names starting with a digit. */
function withArticle(name: string): string {
  if (/^\d/.test(name)) return `a ${name}`
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${lower(name)}`
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h | 0)
}

function safe(n: number, fallback = 1): number {
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Why the player can't shop at all right now (dead, in prison), or null. */
function blockReason(g: GameState): string | null {
  if (!g.character.alive) return "You're dead. Your shopping days are over."
  if (inPrison(g)) return "You can't go shopping from prison. The commissary sells soap and regret."
  return null
}

/** Has a place of their own (or their partner's) to put furniture in. */
export function hasHome(g: GameState): boolean {
  const s = g.character.residence.status
  return s === 'owned' || s === 'renting' || s === 'partner'
}

/** Owns the house they live in (lawn mowers, hot tubs, solar panels). */
export function ownsHouse(g: GameState): boolean {
  const r = g.character.residence
  if (r.status !== 'owned') return false
  return g.assets.some((a) => a.kind === 'house' && (r.assetId ? a.id === r.assetId : true))
}

function homeAsset(g: GameState): Asset | undefined {
  const r = g.character.residence
  if (r.status !== 'owned') return undefined
  return g.assets.find((a) => a.kind === 'house' && (r.assetId ? a.id === r.assetId : true))
}

// ---------------------------------------------------------------------------
// Prices

/** Local price multiplier for an item vs its US price (finite, > 0). */
export function basisMult(g: GameState, basis: PriceBasis): number {
  const goods = safe(goodsMult(g))
  switch (basis) {
    case 'local':
      return goods
    case 'traded':
      return safe(0.55 * localGoodsMult(g, 'electronics') + 0.45 * goods)
    case 'tech':
      return safe(localGoodsMult(g, 'electronics'))
    case 'luxury':
      return safe(localGoodsMult(g, 'luxury'))
    case 'food':
      return safe(localGoodsMult(g, 'food'))
  }
}

/** A local service price (lift pass, green fee) from a US-dollar base. */
function servicePrice(g: GameState, usd: number): number {
  const labor = safe(localMarket(g).laborCost, 1)
  return nicePrice(usd * Math.min(1.7, Math.max(0.22, 0.15 + 0.85 * labor)))
}

/** "Price includes 10% consumption tax ($9)." or a no-tax line; '' when not worth saying. */
function taxLine(g: GameState, price: number): string {
  const note = salesTaxNote(g, price)
  if (note) return note
  const m = localMarket(g)
  if (!(m.salesTax > 0) && price >= 20) {
    const name = (m.salesTaxName || 'sales tax').trim()
    const nice = /^[A-Z][a-z]+( |$)/.test(name) ? lower(name) : name
    return `There's no ${nice} in ${getCountry(g.character.countryId).name}, so the sticker price is the price.`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Stores

export type StoreId = 'bike' | 'sports' | 'furniture' | 'clothing' | 'toy' | 'garden'

interface StoreDef {
  id: StoreId
  label: string
  emoji: string
  blurb: string
  minAge: number
  /** Asset details.category for items bought here. */
  category: string
  stock: [number, number]
  items: () => ItemDef[]
  names: string[]
  fallbackName: string
  /** "Your Bikes" heading over owned items. */
  ownedLabel: string
}

const STORES: Record<StoreId, StoreDef> = {
  bike: {
    id: 'bike',
    label: 'Bike Shop',
    emoji: '🚲',
    blurb: 'Bikes, e-bikes and scooters',
    minAge: 3,
    category: 'bike',
    stock: [9, 13],
    items: () => BIKES,
    names: ['{w} Cycles', '{w} Bike Co.'],
    fallbackName: 'Spokes & Sprockets',
    ownedLabel: 'Your Rides',
  },
  sports: {
    id: 'sports',
    label: 'Sporting Goods',
    emoji: '🏅',
    blurb: 'Gym gear, golf clubs, skis, boards and balls',
    minAge: 6,
    category: 'sports',
    stock: [10, 15],
    items: () => SPORTS_GEAR,
    names: ['{w} Sports', '{w} Outdoor & Sport'],
    fallbackName: 'Sweat & Gear Sporting Goods',
    ownedLabel: 'Your Gear',
  },
  furniture: {
    id: 'furniture',
    label: 'Furniture & Home Decor',
    emoji: '🛋️',
    blurb: 'Sofas, beds, art, gadgets for the home',
    minAge: 16,
    category: 'furniture',
    stock: [9, 14],
    items: () => FURNITURE,
    names: ['{w} Home', '{w} Living'],
    fallbackName: 'Cozy Corner Furniture',
    ownedLabel: 'Around the House',
  },
  clothing: {
    id: 'clothing',
    label: 'Clothing & Fashion',
    emoji: '👗',
    blurb: 'Thrift finds to designer drops',
    minAge: 10,
    category: 'clothing',
    stock: [11, 15],
    items: () => [...CLOTHES, ...LOCAL_CLOTHES],
    names: ['{w} Threads', '{w} Fashion House'],
    fallbackName: 'Threadbare & Co.',
    ownedLabel: 'Your Wardrobe',
  },
  toy: {
    id: 'toy',
    label: 'Toy Store',
    emoji: '🧸',
    blurb: 'Toys, games, puzzles and consoles',
    minAge: 3,
    category: 'toy',
    stock: [10, 15],
    items: () => TOYS,
    names: ['{w} Toys', 'Little {w} Toy Shop'],
    fallbackName: 'Toy Chest Emporium',
    ownedLabel: 'Your Toys & Games',
  },
  garden: {
    id: 'garden',
    label: 'Garden & Hardware',
    emoji: '🧰',
    blurb: 'Tools, grills, mowers, hot tubs and solar',
    minAge: 16,
    category: 'garden',
    stock: [8, 12],
    items: () => GARDEN,
    names: ['{w} Hardware', '{w} Home & Garden'],
    fallbackName: 'Nuts & Bolts Hardware',
    ownedLabel: 'In the Shed',
  },
}

/** A store name that sounds local ("Sakura Cycles"), stable per country. */
export function storeName(g: GameState, id: StoreId | 'pet'): string {
  const def = id === 'pet' ? PET_STORE : STORES[id]
  const words = localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '')
  if (words.length === 0) return def.fallbackName
  const h = hashString(`${g.character.countryId}|everyday|${id}`)
  const word = words[h % words.length].trim()
  return def.names[(h >> 3) % def.names.length].replace('{w}', word)
}

function soldIn(countryId: string, d: ItemDef): boolean {
  if (d.only && !d.only.includes(countryId)) return false
  if (d.except && d.except.includes(countryId)) return false
  return true
}

/** Children of the player young enough for a kid-sized item. */
function kidsFor(g: GameState, d: ItemDef): Person[] {
  const max = d.kidsUpTo ?? 17
  const min = d.minAge ?? 0
  return childrenOf(g).filter((k) => k.age >= Math.max(1, min - 1) && k.age <= max)
}

/** Whether this player sees the item at all (age, gender, kid-sized items). */
function eligible(g: GameState, store: StoreDef, d: ItemDef): boolean {
  const c = g.character
  if (d.gender && d.gender !== c.gender) return false
  if (d.kidsUpTo !== undefined) {
    if (c.age <= d.kidsUpTo) return c.age >= (d.minAge ?? store.minAge) - 1
    return c.age >= 18 && kidsFor(g, d).length > 0
  }
  return true
}

export interface EverydayListing {
  /** Unique this year: `${year}:${store}:${key}`. */
  id: string
  store: StoreId | 'pet'
  key: string
  name: string
  emoji: string
  price: number
  value: number
  condition: number
  used: boolean
  upkeep: number
}

function boughtList(g: GameState): string[] {
  const v = g.flags.everydayBought
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function isBought(g: GameState, id: string): boolean {
  return boughtList(g).includes(id)
}

function markBought(g: GameState, id: string): void {
  const prefix = `${g.year}:`
  g.flags.everydayBought = [...boughtList(g).filter((x) => x.startsWith(prefix)), id]
}

function listingFor(g: GameState, storeId: StoreId | 'pet', d: ItemDef): EverydayListing {
  const r = seeded(yearKey(g, `everyday:${storeId}:${d.key}:price`))
  const used = d.used === true && r.chance(0.3)
  const condition = used ? r.int(55, 88) : 100
  const mult = basisMult(g, d.basis)
  const price = nicePrice(d.base * mult * r.float(0.88, 1.14) * (used ? 0.4 + 0.35 * (condition / 100) : 1))
  const value = Math.max(0, nicePrice(price * d.keep * (used ? 1.1 : 1)))
  const upkeep = d.upkeep ? nicePrice(d.upkeep * safe(goodsMult(g))) : 0
  return {
    id: `${g.year}:${storeId}:${d.key}`,
    store: storeId,
    key: d.key,
    name: used ? `Used ${d.name}` : d.name,
    emoji: d.emoji,
    price: Math.max(1, price),
    value: Number.isFinite(value) ? value : 0,
    condition,
    used,
    upkeep,
  }
}

/** This year's stock for a store, for this player (8-15 listings for most adults). */
export function everydayListings(g: GameState, storeId: StoreId): EverydayListing[] {
  const store = STORES[storeId]
  const cid = g.character.countryId
  const pool = store.items().filter((d) => soldIn(cid, d) && eligible(g, store, d) && itemInEra(d.key, g.year, cid))
  // Every item gets a stable random rank for the year; local specialties jump the queue.
  const ranked = pool
    .map((d) => ({ d, rank: seeded(yearKey(g, `everyday:${storeId}:${d.key}:rank`)).next() - (d.only ? 0.6 : 0) }))
    .sort((a, b) => a.rank - b.rank)
  const n = Math.min(ranked.length, seeded(yearKey(g, `everyday:${storeId}:count`)).int(store.stock[0], store.stock[1]))
  return ranked
    .slice(0, n)
    .map(({ d }) => listingFor(g, storeId, d))
    .sort((a, b) => a.price - b.price)
    .filter((l) => !isBought(g, l.id))
}

function defFor(storeId: StoreId | 'pet', key: string): ItemDef | undefined {
  if (storeId === 'pet') return PET_SUPPLIES.find((d) => d.key === key)
  return STORES[storeId].items().find((d) => d.key === key)
}

// ---------------------------------------------------------------------------
// Buying

const QUIPS: Record<StoreId | 'pet', string[]> = {
  bike: ['You rang the bell 40 times on the way home.', 'The salesperson made you sign a waiver "just in case."', 'You already named it.', 'You immediately bought a lock that cost a third as much as the bike.'],
  sports: ['Step one of getting in shape: buying the gear. Done!', 'You posed with it in the mirror for a while.', 'The salesperson called you "a natural." You have never done this sport.'],
  furniture: ['The delivery guys scratched the doorframe and left.', 'You spent the evening rearranging everything around it.', 'Assembly took four hours and you have three screws left over.'],
  clothing: ['You wore it out of the store.', 'You took 40 mirror selfies. One was usable.', 'The tag said "dry clean only." You will not be dry cleaning it.'],
  toy: ['You tore open the box in the parking lot.', 'Best. Day. Ever.', 'You played with the box for an hour before the toy.'],
  garden: ['You read the manual cover to cover. Twice.', 'Your neighbor came over to look at it. Twice.', 'You feel like a real homeowner now.'],
  pet: ['It was love at first sniff.', 'They ignored it for a day, then decided it was theirs forever.', 'You took 200 photos of them with it.'],
}

const BEG_NO = [
  '"Do I look like I\'m made of money?"',
  '"Maybe for your birthday."',
  '"We have one of those at home."',
  '"Put it on your Christmas list."',
  '"Absolutely not. Put it back."',
  '"What happened to the last thing I bought you?"',
]

function storeOf(storeId: StoreId | 'pet'): { category: string } {
  return storeId === 'pet' ? { category: 'petSupply' } : STORES[storeId]
}

/** Turn a listing into an owned asset. */
function addItemAsset(g: GameState, l: EverydayListing, d: ItemDef, extra: Record<string, Json> = {}): Asset {
  const details: Record<string, Json> = {
    category: d.category ?? storeOf(l.store).category,
    store: l.store,
    itemKey: d.key,
    boughtYear: g.year,
    isNew: !l.used,
    insured: false,
    ...extra,
  }
  if (d.use) details.use = d.use
  if (d.tier) details.tier = d.tier
  if (d.sport) details.sport = d.sport
  if (d.risk) details.risk = d.risk
  if (d.solar) {
    const home = homeAsset(g)
    if (home) details.homeId = home.id
    details.solar = true
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'other',
    name: str(extra.displayName, l.name),
    emoji: l.emoji,
    purchasePrice: l.price,
    value: l.value,
    condition: l.condition,
    purchasedAge: g.character.age,
    upkeep: l.upkeep,
    details,
  }
  delete asset.details.displayName
  g.assets.push(asset)
  return asset
}

function joyFor(g: GameState, price: number, storeId: StoreId | 'pet'): number {
  const kid = g.character.age < 13
  if (storeId === 'toy' && kid) return randInt(g, 4, 8)
  if (kid) return randInt(g, 3, 6)
  const rel = price / safe(goodsMult(g))
  return rel >= 5_000 ? randInt(g, 4, 8) : rel >= 800 ? randInt(g, 3, 5) : randInt(g, 1, 3)
}

/** Clothing bumps your look a little when it's new. */
function clothingBump(g: GameState, d: ItemDef): void {
  if (!d.tier) return
  if (d.tier >= 3 || chance(g, 0.4)) addStat(g, 'looks', d.tier >= 4 ? randInt(g, 1, 2) : 1)
}

function completePurchase(g: GameState, l: EverydayListing, d: ItemDef, paidBy: Person | null): Asset {
  const asset = addItemAsset(g, l, d)
  markBought(g, l.id)
  count(g, 'purchases')
  addStat(g, 'happiness', joyFor(g, l.price, l.store))
  if (l.store === 'clothing') clothingBump(g, d)
  // Before smartphones, nobody took mirror selfies in the fitting room.
  const quip = pick(g, QUIPS[l.store]).replace('You took 40 mirror selfies. One was usable.', hasTech(g, 'smartphone') ? 'You took 40 mirror selfies. One was usable.' : 'You twirled in front of the mirror for ten minutes.')
  if (paidBy) {
    addRelationship(paidBy, 1)
    log(g, `My ${relationLabel(paidBy).toLowerCase()} bought me ${withArticle(l.name)}.`, 'good')
    notice(g, 'Yes!', `You begged and begged, and your ${relationLabel(paidBy).toLowerCase()} ${paidBy.firstName} finally bought you ${withArticle(l.name)} (${formatMoney(l.price)}). ${quip}`, { emoji: l.emoji, tone: 'good' })
  } else {
    log(g, pick(g, [`I bought ${withArticle(l.name)}.`, `I treated myself to ${withArticle(l.name)}.`]), 'good')
    const tax = taxLine(g, l.price)
    const upkeep = l.upkeep > 0 ? ` Running it costs about ${formatMoney(l.upkeep)} a year.` : ''
    notice(g, 'Purchased!', `You bought ${withArticle(l.name)} for ${formatMoney(l.price)}. ${quip}${upkeep}${tax ? ` ${tax}` : ''}`, { emoji: l.emoji, tone: 'good' })
  }
  return asset
}

/** Ask a parent to pay; returns the parent who paid, or null after a refusal notice. */
function begParent(g: GameState, l: EverydayListing): Person | null | 'none' {
  const parents = payingParents(g).filter((p) => p.money >= l.price * 2)
  const all = payingParents(g)
  if (all.length === 0) return 'none'
  if (!useYearAction(g, 'everyday.beg', 3)) {
    notice(g, 'Nice Try', 'Your parents have started leaving the room whenever you say "Can I have..." Ask again next year.', { emoji: '🙉' })
    return null
  }
  const parent = [...(parents.length ? parents : all)].sort((a, b) => b.relationship - a.relationship)[0]
  const goods = safe(goodsMult(g))
  const rel = l.price / goods
  const priceFactor = rel <= 60 ? 1 : rel <= 300 ? 0.8 : rel <= 1_000 ? 0.5 : 0.2
  const p = (0.15 + parent.relationship / 200 + (g.character.age < 13 ? 0.1 : 0)) * priceFactor
  if (parents.includes(parent) && chance(g, p)) {
    parent.money = Math.max(0, Math.round(parent.money - l.price))
    return parent
  }
  addStat(g, 'happiness', -1)
  notice(g, 'Denied', `You asked your ${relationLabel(parent).toLowerCase()} ${parent.firstName} to buy you ${withArticle(l.name)} (${formatMoney(l.price)}). ${parent.firstName}: ${pick(g, BEG_NO)}`, { emoji: '🙅' })
  return null
}

function cantAfford(g: GameState, l: EverydayListing): void {
  notice(
    g,
    'Insufficient Funds',
    pick(g, [
      `You can't afford ${withArticle(l.name)}. It costs ${formatMoney(l.price)} and you have ${formatMoney(Math.max(0, g.character.money))}.`,
      hasTech(g, 'creditCards') ? `Your card was declined. ${withArticle(l.name).replace(/^./, (c) => c.toUpperCase())} costs ${formatMoney(l.price)}.` : `You emptied your wallet on the counter. ${withArticle(l.name).replace(/^./, (c) => c.toUpperCase())} costs ${formatMoney(l.price)}.`,
      `You stared at the ${formatMoney(l.price)} price tag, then at your bank balance, then put ${lower(l.name)} back.`,
    ]),
    { emoji: '💸', tone: 'bad' },
  )
}

/** Why this player can't buy this item (not counting money), or null. */
function itemReason(g: GameState, storeId: StoreId | 'pet', d: ItemDef): string | null {
  const b = blockReason(g)
  if (b) return b
  const c = g.character
  const store = storeId === 'pet' ? null : STORES[storeId]
  const minAge = d.minAge ?? store?.minAge ?? 6
  const forKids = d.kidsUpTo !== undefined && c.age > d.kidsUpTo
  if (!forKids && c.age < minAge) return `You must be at least ${minAge} to have ${withArticle(d.name)}.`
  if (d.needs === 'home' && !hasHome(g)) return 'You need a place of your own first.'
  if (d.needs === 'house' && !ownsHouse(g)) return 'You need to own the house you live in.'
  return null
}

/** Buy for yourself, paying yourself or (for minors) begging a parent. Returns the asset. */
export function buyEverydayItem(g: GameState, l: EverydayListing): Asset | null {
  const d = defFor(l.store, l.key)
  if (!d) return null
  const reason = itemReason(g, l.store, d)
  if (reason) {
    notice(g, 'Shopping', reason, { emoji: '🛍️' })
    return null
  }
  if (isBought(g, l.id)) {
    notice(g, 'Sold Out', 'Someone bought the last one while you were deciding. New stock arrives next year.', { emoji: '🏷️' })
    return null
  }
  if (spend(g, l.price)) return completePurchase(g, l, d, null)
  if (g.character.age < 18) {
    const parent = begParent(g, l)
    if (parent && parent !== 'none') return completePurchase(g, l, d, parent)
    if (parent === null) return null
  }
  cantAfford(g, l)
  return null
}

/** Buy an item as a present for one of your kids: no asset, a happier kid. */
export function buyForChild(g: GameState, l: EverydayListing, childId: string): boolean {
  const kid = g.people.find((p) => p.id === childId && p.alive)
  if (!kid) return false
  if (isBought(g, l.id)) {
    notice(g, 'Sold Out', 'Someone bought the last one while you were deciding. New stock arrives next year.', { emoji: '🏷️' })
    return false
  }
  if (!spend(g, l.price)) {
    cantAfford(g, l)
    return false
  }
  markBought(g, l.id)
  count(g, 'purchases')
  count(g, 'giftsToKids')
  addRelationship(kid, randInt(g, 5, 12))
  addPersonStat(kid, 'happiness', randInt(g, 4, 10))
  addStat(g, 'happiness', randInt(g, 2, 4))
  notePerson(kid, `Got ${withArticle(l.name)} from the player at age ${kid.age}.`)
  log(g, `I bought my ${relationLabel(kid).toLowerCase()} ${kid.firstName} ${withArticle(l.name)}.`, 'good')
  const reaction = pick(g, [`${kid.firstName} screamed so loud the neighbors checked on you.`, `${kid.firstName} hugged you and then ignored you for the rest of the day to play with it.`, `${kid.firstName} said it was "the best present in the history of presents."`, `${kid.firstName} was thrilled. The box was a hit too.`])
  const tax = taxLine(g, l.price)
  notice(g, 'Gift for the Kids', `You bought ${withArticle(l.name)} for ${kid.firstName} (${formatMoney(l.price)}). ${reaction}${tax ? ` ${tax}` : ''}`, { emoji: l.emoji, tone: 'good' })
  return true
}

const GIFT_WHO = defineScript('everyday.giftWho', (g, choice, data) => {
  if (choice === 'cancel') return
  const rec = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const storeId = str(rec.store) as StoreId
  const id = str(rec.id)
  if (!STORES[storeId]) return
  const l = everydayListings(g, storeId).find((x) => x.id === id)
  if (!l) {
    notice(g, 'Sold Out', 'That one is gone. New stock arrives next year.', { emoji: '🏷️' })
    return
  }
  if (choice === 'me') buyEverydayItem(g, l)
  else buyForChild(g, l, choice)
})

function listingAction(store: StoreDef, l: EverydayListing): MenuAction {
  const d = defFor(store.id, l.key)
  return {
    type: 'action',
    id: `ev-${l.id}`,
    label: l.name,
    emoji: l.emoji,
    subtitle: () => {
      const bits = [formatMoney(l.price)]
      if (l.used) bits.push(`Condition ${l.condition}%`)
      if (d?.note) bits.push(d.note)
      if (l.upkeep > 0) bits.push(`${formatMoney(l.upkeep)}/yr to run`)
      if (d?.kidsUpTo !== undefined) bits.push(`Ages ${d.minAge ?? store.minAge}-${d.kidsUpTo}`)
      return bits.join(' · ')
    },
    disabledReason: (g) => (d ? itemReason(g, store.id, d) : 'Sold out.'),
    run: (g) => {
      if (!d) return
      const c = g.character
      const kidsOnly = d.kidsUpTo !== undefined && c.age > d.kidsUpTo
      const kids = c.age >= 18 && (store.id === 'toy' || store.id === 'bike' || kidsOnly) ? kidsFor(g, d) : []
      if (kidsOnly || kids.length > 0) {
        const choices: ChoiceOption[] = kids.slice(0, 5).map((k) => ({ id: k.id, label: `For ${k.firstName} (${k.age})`, emoji: '🎁' }))
        if (!kidsOnly) choices.unshift({ id: 'me', label: 'For me', emoji: '🙋' })
        choices.push({ id: 'cancel', label: 'Never mind', emoji: '✖️' })
        scriptChoice(g, GIFT_WHO, l.name, `${withArticle(l.name).replace(/^./, (ch) => ch.toUpperCase())} for ${formatMoney(l.price)}. Who is it for?`, choices, { emoji: l.emoji, data: { store: store.id, id: l.id } })
        return
      }
      buyEverydayItem(g, l)
    },
  }
}

// ---------------------------------------------------------------------------
// Using what you own

interface Range {
  health?: [number, number]
  happiness?: [number, number]
  looks?: [number, number]
  smarts?: [number, number]
  athleticism?: [number, number]
}

interface UseDef {
  label: (a: Asset) => string
  emoji: string
  title: string
  /** Uses per item per year. */
  max: number
  wear: [number, number]
  gains: Range
  risk?: number
  injuries?: string[]
  /** A local fee per use (lift pass, green fee), US dollars. */
  fee?: number
  feeWhat?: string
  lines: string[]
  log: string
  /** Bring along someone close (relationship boost). */
  social?: number
}

const sportOf = (a: Asset) => str(a.details.sport, 'ball')

const USES: Record<UseId, UseDef> = {
  ride: {
    label: () => 'Ride',
    emoji: '🚲',
    title: 'Bike Ride',
    max: 3,
    wear: [1, 4],
    gains: { health: [1, 3], happiness: [2, 4], athleticism: [1, 2] },
    injuries: ['Scraped Knee', 'Sprained Wrist', 'Road Rash', 'Broken Collarbone'],
    lines: [
      'You rode your {item} along the river. The wind in your hair, the bugs in your teeth.',
      'You took your {item} for a spin around {city}. A dog chased you for two blocks.',
      'You rode your {item} to get pastries, which canceled out the exercise perfectly.',
      'You rode your {item} until your legs turned to jelly. Worth it.',
      'You raced a bus on your {item}. You lost, but it was close.',
    ],
    log: 'I went for a ride on my {item}.',
  },
  workout: {
    label: () => 'Work Out',
    emoji: '💪',
    title: 'Home Workout',
    max: 3,
    wear: [1, 3],
    gains: { health: [1, 3], looks: [0, 2], athleticism: [1, 3], happiness: [0, 2] },
    risk: 0.02,
    injuries: ['Pulled Muscle', 'Strained Back'],
    lines: [
      'You worked out on your {item} while watching cooking shows. Motivation: complicated.',
      'You used your {item} for something other than hanging laundry. Progress!',
      'You crushed a workout on your {item} and posted about it immediately.',
      'You did 20 minutes on your {item}, then lay on the floor for 40.',
    ],
    log: 'I worked out at home on my {item}.',
  },
  yoga: {
    label: () => 'Do Yoga',
    emoji: '🧘',
    title: 'Yoga',
    max: 3,
    wear: [1, 3],
    gains: { health: [1, 2], happiness: [2, 4], looks: [0, 1] },
    risk: 0.01,
    injuries: ['Pulled Hamstring'],
    lines: ['You held downward dog for a full minute. The actual dog was not impressed.', 'You did a sunrise yoga session and felt at peace with the universe until your phone buzzed.', 'You attempted a headstand and achieved a firm understanding of gravity.'],
    log: 'I did yoga on my {item}.',
  },
  box: {
    label: () => 'Hit the Bag',
    emoji: '🥊',
    title: 'Boxing',
    max: 3,
    wear: [1, 4],
    gains: { health: [1, 2], happiness: [2, 4], athleticism: [1, 2] },
    risk: 0.02,
    injuries: ['Sprained Wrist'],
    lines: ['You punched the bag and imagined it was your boss. Very therapeutic.', 'You did ten rounds on the bag and felt like a movie montage.', 'You hit the bag so hard it swung back and hit you. Rematch next week.'],
    log: 'I worked out on my punching bag.',
  },
  golf: {
    label: () => 'Play Golf',
    emoji: '⛳',
    title: 'Golf',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 4], health: [0, 2] },
    fee: 50,
    feeWhat: 'green fee',
    lines: ['You lost six balls in the pond and one in a stranger\'s convertible.', 'You shot a personal best. It was still 30 over par.', 'You spent four hours walking and swearing politely. Golf!', 'You hit one perfect drive and spent the rest of the round chasing that feeling.'],
    log: 'I played a round of golf.',
    social: 3,
  },
  slopes: {
    label: (a) => (sportOf(a) === 'snowboarding' ? 'Go Snowboarding' : 'Go Skiing'),
    emoji: '🏔️',
    title: 'On the Slopes',
    max: 2,
    wear: [2, 5],
    gains: { happiness: [3, 6], health: [1, 2], athleticism: [1, 2] },
    risk: 0.06,
    injuries: ['Broken Leg', 'Torn ACL', 'Sprained Wrist', 'Concussion'],
    fee: 90,
    feeWhat: 'lift pass',
    lines: ['You carved fresh powder all morning and spent the afternoon in the lodge with hot chocolate.', 'You went down a black run by accident. You survived. Barely. Mostly on your back.', 'A five-year-old zoomed past you without poles. You have never felt older.', 'You nailed your first jump and landed it. Nobody was watching.'],
    log: 'I went {sport}.',
    social: 3,
  },
  surf: {
    label: () => 'Go Surfing',
    emoji: '🌊',
    title: 'Surfing',
    max: 3,
    wear: [1, 4],
    gains: { happiness: [3, 6], health: [1, 3], athleticism: [1, 2] },
    risk: 0.04,
    injuries: ['Reef Cuts', 'Dislocated Shoulder', 'Jellyfish Sting'],
    lines: ['You caught a perfect wave and rode it all the way in. You will talk about it for years.', 'You spent two hours paddling out and four seconds standing up. Totally worth it.', 'A dolphin surfed the wave next to you. Best day of your life.', 'You saw a fin. It was a dolphin. You did not wait to confirm.'],
    log: 'I went surfing.',
  },
  paddle: {
    label: () => 'Go Paddling',
    emoji: '🛶',
    title: 'On the Water',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 5], health: [1, 2] },
    risk: 0.02,
    injuries: ['Sprained Wrist'],
    lines: ['You paddled across a glassy lake at sunrise. Peak tranquility.', 'You capsized in front of a tour boat. They clapped.', 'You paddled up to a heron. It gave you a look of pure disdain.'],
    log: 'I took my {item} out on the water.',
    social: 2,
  },
  racket: {
    label: (a) => `Play ${str(a.details.sport, 'a Match').replace(/^./, (c) => c.toUpperCase())}`,
    emoji: '🎾',
    title: 'Game On',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 4], health: [1, 2], athleticism: [1, 2] },
    risk: 0.015,
    injuries: ['Tennis Elbow', 'Sprained Ankle'],
    lines: ['You won in straight sets and were insufferable about it.', 'You lost every point and blamed the wind. There was no wind.', 'A rally went on so long that people stopped to watch.'],
    log: 'I played {sport}.',
    social: 4,
  },
  bounce: {
    label: () => 'Jump on the Trampoline',
    emoji: '🤸',
    title: 'Boing!',
    max: 3,
    wear: [1, 4],
    gains: { happiness: [3, 6], health: [0, 1] },
    risk: 0.06,
    injuries: ['Sprained Ankle', 'Broken Arm'],
    lines: ['You bounced until you could see over the neighbor\'s fence. They saw you too.', 'You attempted a backflip and landed a back-flop.', 'You bounced for an hour and laughed the entire time.'],
    log: 'I jumped on my trampoline.',
    social: 2,
  },
  fish: {
    label: () => 'Go Fishing',
    emoji: '🎣',
    title: 'Gone Fishing',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 4] },
    lines: ['You caught a {fish} the size of your forearm and released it with a dramatic speech.', 'You caught nothing but a boot, a cold and a deep sense of peace.', 'You caught a {fish}! You told everyone it was twice as big.', 'You sat by the water for six hours. The fish won.'],
    log: 'I went fishing.',
    social: 3,
  },
  camp: {
    label: () => 'Go Camping',
    emoji: '⛺',
    title: 'Camping Trip',
    max: 2,
    wear: [2, 5],
    gains: { happiness: [3, 5], health: [0, 2] },
    lines: ['A raccoon stole your marshmallows and maintained eye contact the whole time.', 'You set up the tent in under an hour. A new record.', 'You told ghost stories by the fire until everyone was too scared to sleep.', 'It rained all weekend. You will remember it fondly in about ten years.'],
    log: 'I went camping.',
    social: 5,
  },
  ballgame: {
    label: (a) => `Play ${str(a.details.sport, 'Ball')}`,
    emoji: '🏟️',
    title: 'Pickup Game',
    max: 3,
    wear: [1, 4],
    gains: { happiness: [2, 5], health: [1, 3], athleticism: [1, 3] },
    risk: 0.03,
    injuries: ['Sprained Ankle', 'Jammed Finger'],
    lines: ['You played {sport} in the park until it got too dark to see.', 'You scored the winning point and did a celebration you rehearsed.', 'You played {sport} with some locals and held your own. Mostly.', 'You played {sport} and broke a window. Nobody saw. You hope.'],
    log: 'I played {sport} with friends.',
    social: 4,
  },
  skate: {
    label: () => 'Go Skating',
    emoji: '🛹',
    title: 'Skate Session',
    max: 3,
    wear: [2, 5],
    gains: { happiness: [2, 5], health: [0, 2], athleticism: [1, 2] },
    risk: 0.07,
    injuries: ['Sprained Wrist', 'Scraped Elbow', 'Broken Wrist'],
    lines: ['You landed a trick you\'ve been practicing for weeks.', 'You spent the afternoon at the skate park falling with style.', 'A security guard chased you off a plaza. You felt extremely cool.'],
    log: 'I went skating.',
  },
  climb: {
    label: () => 'Go Climbing',
    emoji: '🧗',
    title: 'Climbing',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 5], health: [1, 3], athleticism: [2, 3] },
    risk: 0.04,
    injuries: ['Sprained Ankle', 'Rope Burn'],
    fee: 20,
    feeWhat: 'climbing gym day pass',
    lines: ['You topped out on a route that beat you last month.', 'You hung on the wall for a while contemplating life choices, then made it.', 'Your forearms are now the size of Popeye\'s.'],
    log: 'I went rock climbing.',
    social: 2,
  },
  relax: {
    label: () => 'Relax',
    emoji: '😌',
    title: 'Relaxing',
    max: 3,
    wear: [0, 2],
    gains: { happiness: [2, 4], health: [0, 1] },
    lines: ['You sank into your {item} and took the best nap of the decade.', 'You spent a lazy Sunday on your {item}. No regrets.', 'You relaxed on your {item} and forgot about the world for a while.'],
    log: 'I relaxed on my {item}.',
  },
  massage: {
    label: (a) => (str(a.details.itemKey) === 'sauna' ? 'Take a Sauna' : 'Get a Massage'),
    emoji: '💆',
    title: 'Ahhh',
    max: 3,
    wear: [0, 2],
    gains: { health: [1, 3], happiness: [2, 4] },
    lines: ['Every knot in your back surrendered. You made noises you\'re not proud of.', 'You melted into a puddle of pure relaxation.', 'You fell asleep halfway through and woke up a new person.'],
    log: 'I unwound with my {item}.',
  },
  movie: {
    label: () => 'Movie Night',
    emoji: '🍿',
    title: 'Movie Night',
    max: 3,
    wear: [0, 2],
    gains: { happiness: [3, 5] },
    lines: ['The bass was so loud the neighbor\'s dog started howling along.', 'You watched a whole trilogy back to back. Worth it.', 'You fell asleep before the opening credits finished. Classic.'],
    log: 'I had a movie night at home.',
    social: 5,
  },
  fishtank: {
    label: () => 'Watch the Fish',
    emoji: '🐠',
    title: 'Aquarium',
    max: 3,
    wear: [0, 3],
    gains: { happiness: [1, 3] },
    lines: ['You watched the fish for an hour. Your blood pressure dropped visibly.', 'You named every fish. One of them is definitely plotting something.', 'You cleaned the tank. The fish did not thank you.'],
    log: 'I watched my aquarium.',
  },
  plants: {
    label: () => 'Tend the Plants',
    emoji: '🪴',
    title: 'Green Thumb',
    max: 3,
    wear: [0, 3],
    gains: { happiness: [1, 3], health: [0, 1] },
    lines: ['You watered, repotted and talked to your plants. One of them grew a new leaf just for you.', 'You found a tiny tomato. You are basically a farmer now.', 'You pruned everything with great confidence and questionable skill.'],
    log: 'I tended my plants.',
  },
  wear: {
    label: () => 'Wear It Out',
    emoji: '✨',
    title: 'Looking Good',
    max: 1,
    wear: [3, 8],
    gains: { happiness: [1, 3], looks: [0, 1] },
    lines: ['You wore your {item} out and got three compliments.', 'You strutted around town in your {item}. A stranger asked where you got it.', 'You wore your {item} and felt like the main character.'],
    log: 'I wore my {item} out.',
  },
  play: {
    label: () => 'Play',
    emoji: '🎈',
    title: 'Playtime',
    max: 3,
    wear: [2, 6],
    gains: { happiness: [2, 5], smarts: [0, 1] },
    lines: ['You played with your {item} until dinner. Then after dinner.', 'You invented an elaborate story starring your {item}.', 'You played with your {item} and had the best afternoon ever.'],
    log: 'I played with my {item}.',
  },
  build: {
    label: () => 'Build It',
    emoji: '🧱',
    title: 'Builder',
    max: 2,
    wear: [1, 3],
    gains: { happiness: [2, 4], smarts: [1, 3] },
    lines: ['You built something magnificent, then stepped on a loose brick barefoot.', 'You followed the instructions perfectly and still had pieces left over.', 'You built your own design instead. Architects should be worried.'],
    log: 'I built something with my {item}.',
  },
  boardgame: {
    label: () => 'Game Night',
    emoji: '🎲',
    title: 'Game Night',
    max: 3,
    wear: [1, 3],
    gains: { happiness: [2, 4], smarts: [0, 2] },
    lines: ['Someone flipped the board. Nobody will admit who.', 'You won and gloated. You will not be invited next time.', 'The game took four hours and two alliances were betrayed.'],
    log: 'I hosted a game night.',
    social: 5,
  },
  puzzle: {
    label: () => 'Work on It',
    emoji: '🧩',
    title: 'Brain Work',
    max: 3,
    wear: [2, 6],
    gains: { smarts: [1, 3], happiness: [1, 3] },
    lines: ['You finished it! The last piece was missing. You suspect the cat.', 'You spent hours concentrating. Your brain feels pleasantly tired.', 'Something fizzed, something glowed, and you learned something.'],
    log: 'I worked on my {item}.',
  },
  cards: {
    label: () => 'Open a Pack',
    emoji: '🃏',
    title: 'Pack Opening',
    max: 2,
    wear: [5, 10],
    gains: { happiness: [1, 4] },
    lines: ['Common, common, common... and another common.', 'You got a shiny card. It\'s not rare, but it\'s shiny.', 'You got three duplicates and a card you already traded away.'],
    log: 'I opened trading card packs.',
  },
  bbq: {
    label: () => 'Host a BBQ',
    emoji: '🍖',
    title: 'Backyard BBQ',
    max: 2,
    wear: [2, 5],
    gains: { happiness: [3, 5] },
    risk: 0.04,
    injuries: ['Burned Hand'],
    fee: 80,
    feeWhat: 'food and drinks',
    lines: ['Everyone said your grilling was the best they\'d ever had. Two of them meant it.', 'You burned the first batch, nailed the second, and nobody noticed the first.', 'Someone brought a salad. Nobody touched it.', 'The smoke alarm went off. Outdoors. Somehow.'],
    log: 'I hosted a BBQ.',
    social: 6,
  },
  soak: {
    label: () => 'Soak in the Hot Tub',
    emoji: '♨️',
    title: 'Hot Tub',
    max: 3,
    wear: [0, 2],
    gains: { health: [1, 2], happiness: [3, 5] },
    lines: ['You soaked under the stars until your fingers pruned.', 'The jets found a knot in your back you didn\'t know existed.', 'You invited friends over and the hot tub became the center of the universe.'],
    log: 'I relaxed in my hot tub.',
    social: 3,
  },
  mow: {
    label: (a) => (str(a.details.itemKey) === 'snowblower' ? 'Clear the Snow' : 'Mow the Lawn'),
    emoji: '🌱',
    title: 'Yard Work',
    max: 2,
    wear: [1, 4],
    gains: { happiness: [1, 2], health: [1, 2] },
    risk: 0.01,
    injuries: ['Sprained Ankle'],
    lines: ['You made perfect stripes. The neighbors are jealous and they should be.', 'You finished the yard and stood there admiring it for an uncomfortable amount of time.', 'You ran over a garden hose. It was a whole thing.'],
    log: 'I did yard work.',
  },
  fix: {
    label: () => 'Fix Something',
    emoji: '🔧',
    title: 'DIY',
    max: 2,
    wear: [1, 3],
    gains: { happiness: [1, 3], smarts: [0, 1] },
    risk: 0.04,
    injuries: ['Smashed Thumb'],
    lines: ['You fixed the squeaky door. Then the wobbly shelf. You are unstoppable.', 'You fixed one thing and broke two others. Net progress: debatable.', 'You watched a tutorial and fixed it on the first try. You feel like a wizard.'],
    log: 'I fixed things around the house.',
  },
  fire: {
    label: () => 'Light the Fire Pit',
    emoji: '🔥',
    title: 'Fireside',
    max: 2,
    wear: [1, 3],
    gains: { happiness: [2, 4] },
    lines: ['You made s\'mores and told stories until the fire died down.', 'You stared into the flames and had several deep thoughts.', 'Everyone smelled like smoke for three days. Worth it.'],
    log: 'I had a night by the fire pit.',
    social: 4,
  },
}

const FISH = ['trout', 'bass', 'catfish', 'carp', 'perch', 'pike', 'snapper', 'tilapia', 'mackerel']

function fill(template: string, g: GameState, a: Asset): string {
  return template
    .replace(/\{item\}/g, lower(a.name.replace(/^Used /, '')))
    .replace(/\{sport\}/g, str(a.details.sport, 'ball'))
    .replace(/\{city\}/g, g.character.city || 'town')
    .replace(/\{fish\}/g, pick(g, FISH))
}

/** Item-specific flavor for certain items, else null. */
function specialLine(g: GameState, a: Asset): string | null {
  const key = str(a.details.itemKey)
  const c = g.character
  switch (key) {
    case 'unicycle':
      return pick(g, ['You rode your unicycle through the park. A child pointed and asked if you were a clown. You said yes.', 'You made it a full block on your unicycle. Pedestrians applauded. One threw a coin.'])
    case 'escooter':
    case 'ebike':
    case 'emtb':
      return pick(g, ['You zipped past everyone stuck in traffic and felt like a superhero.', `The motor did most of the work. You still told everyone you "biked across ${c.city || 'town'}."`])
    case 'mamachari':
      return 'You rode your mamachari to the supermarket with a bag of leeks poking out of the basket. Peak efficiency.'
    case 'dutch':
      return 'You rode your upright bike to work in a suit, holding an umbrella with one hand. Very local of you.'
    case 'roadster':
      return 'You rode your trusty roadster through traffic, ringing the bell at everything that moved.'
    case 'cargo':
      return pick(g, ['You hauled a week of groceries home in your cargo bike. Cars are overrated.', 'You gave the neighborhood kids a ride in the cargo bike. You are now the most popular adult on the street.'])
    case 'kotatsu':
      return 'You crawled under the kotatsu with a bowl of mandarins and did not emerge for six hours.'
    case 'majlis':
      return 'You hosted relatives in your majlis. The coffee flowed, the dates vanished, and the gossip was excellent.'
    case 'hammock':
      return 'You swung in your hammock all afternoon. Time stopped being a concept.'
    case 'sauna':
      return pick(g, ['You sat in the sauna until you saw the meaning of life, then jumped into cold water and forgot it.', 'You had a long sauna session. Silence, steam and absolute calm.'])
    case 'smarthome':
      return 'You told your smart speaker to dim the lights. It played polka music instead. Relaxing, in its way.'
    case 'castle':
      return 'Six weekends, 4,000 pieces, one missing piece. The castle stands. Mostly.'
    case 'pinata':
      return 'You whacked the piñata blindfolded until it exploded into candy. Pure joy.'
    case 'kendama':
      return 'You landed the ball on the spike on your first try, then never again.'
    case 'daruma':
      return 'You painted in one eye of your daruma doll and made a wish. The other eye waits.'
    case 'console':
    case 'handheld':
      return pick(g, ['You played video games until 3 a.m. "Just one more level."', 'You finally beat the final boss. You screamed so loud the neighbors called.'])
    case 'yukata':
      return 'You wore your yukata to a summer festival, ate grilled squid on a stick and watched the fireworks.'
    case 'kimono':
      return 'You wore your silk kimono to a formal ceremony. Several aunties nodded approvingly.'
    case 'hanbok':
      return 'You wore your hanbok for Chuseok and bowed to your elders. Grandma cried a little.'
    case 'sari':
    case 'sherwani':
      return `You wore your ${lower(a.name)} to a three-day wedding and danced until your feet gave out.`
    case 'agbada':
    case 'ankara':
    case 'kente':
      return `You wore your ${lower(a.name)} to a party and turned every head in the room.`
    case 'cowboy':
    case 'stetson':
      return `You wore your ${lower(a.name)} line dancing. You mostly knew the steps.`
    case 'lederhosen':
    case 'dirndl':
      return `You wore your ${lower(a.name)} to the beer festival. You fit right in.`
    case 'football':
      return 'You wore the national jersey to watch the big match. Your voice is still gone.'
    case 'uglysweater':
      return 'You wore your gloriously ugly sweater to a party and won the ugly-sweater contest nobody knew was happening.'
    default:
      return null
  }
}

/** Who comes along for a social use (BBQ guests, movie night, a match). */
function bringPeople(g: GameState, n: number): Person[] {
  const minAge = g.character.age < 13 ? 3 : 8
  return companionCandidates(g, { minAge, max: 8 })
    .filter((p) => p.relation !== 'pet')
    .slice(0, Math.max(1, Math.min(4, Math.ceil(n / 2))))
}

function gainsFactor(g: GameState): number {
  return Math.max(0.4, 1 - 0.08 * yearActionsUsed(g, 'everyday.uses'))
}

function roll(g: GameState, r: [number, number] | undefined, factor: number): number {
  if (!r) return 0
  return Math.round(randInt(g, r[0], r[1]) * factor)
}

export function useReason(g: GameState, a: Asset): string | null {
  const b = blockReason(g)
  if (b) return b
  const use = str(a.details.use) as UseId
  if (!USES[use]) return 'There is nothing to do with it.'
  if (a.condition <= 0) return str(a.details.category) === 'clothing' ? "It's worn out." : "It's broken."
  const c = g.character
  if (c.stats.health < 10 && (use === 'ride' || use === 'workout' || use === 'slopes' || use === 'surf' || use === 'climb' || use === 'skate' || use === 'ballgame'))
    return "You're too weak right now."
  if (use === 'slopes' && !(SNOW as readonly string[]).includes(c.countryId)) return `There are no ski slopes in ${getCountry(c.countryId).name}.`
  if ((use === 'bbq' || use === 'soak' || use === 'mow' || use === 'fire' || use === 'massage' || use === 'movie' || use === 'fishtank' || use === 'plants' || use === 'relax') && str(a.details.store) !== 'toy' && !hasHome(g) && c.residence.status !== 'parents')
    return 'You need a place to set it up.'
  return null
}

/** Use an owned everyday item (ride the bike, host the BBQ...). */
export function useEverydayItem(g: GameState, assetId: string): void {
  const a = findAsset(g, assetId)
  if (!a) return
  const reason = useReason(g, a)
  const use = USES[str(a.details.use) as UseId]
  if (reason || !use) {
    notice(g, 'Not Now', reason ?? 'There is nothing to do with it.', { emoji: a.emoji })
    return
  }
  const c = g.character
  if (yearActionsUsed(g, `everyday.use:${a.id}`) >= use.max) {
    notice(g, use.title, `You've had your fun with your ${lower(a.name)} this year.`, { emoji: a.emoji })
    return
  }
  if (yearActionsUsed(g, 'everyday.uses') >= 10) {
    notice(g, 'Worn Out', "You've done plenty with your stuff this year. Your hobbies can wait until next year.", { emoji: '😮‍💨' })
    return
  }
  // Fees (lift pass, green fee, BBQ food): a minor's parents chip in when they can.
  let feeNote = ''
  if (use.fee) {
    const fee = use.feeWhat === 'food and drinks' ? nicePrice(use.fee * basisMult(g, 'food')) : servicePrice(g, use.fee)
    const parent = c.age < 18 ? payingParents(g).filter((p) => p.money >= fee).sort((x, y) => y.relationship - x.relationship)[0] : undefined
    if (parent) {
      parent.money = Math.max(0, Math.round(parent.money - fee))
      feeNote = ` (${parent.firstName} paid the ${formatMoney(fee)} ${use.feeWhat}.)`
    } else if (spend(g, fee)) {
      feeNote = ` The ${use.feeWhat} cost ${formatMoney(fee)}.`
    } else {
      notice(g, 'Insufficient Funds', `You can't afford the ${formatMoney(fee)} ${use.feeWhat}.`, { emoji: '💸', tone: 'bad' })
      return
    }
  }
  useYearAction(g, `everyday.use:${a.id}`, use.max)
  const factor = gainsFactor(g)
  useYearAction(g, 'everyday.uses', 99)
  count(g, 'itemUses')
  a.condition = Math.max(0, a.condition - randInt(g, use.wear[0], use.wear[1]))

  // Accidents.
  const risk = num(a.details.risk, use.risk ?? 0) * (c.age >= 60 ? 1.6 : 1)
  if (risk > 0 && use.injuries?.length && chance(g, risk)) {
    const injury = pick(g, use.injuries)
    addCondition(g, injury, 'injury', randInt(g, 6, injury.startsWith('Broken') || injury === 'Torn ACL' || injury === 'Concussion' ? 30 : 14))
    addStat(g, 'health', -randInt(g, 3, 8))
    addStat(g, 'happiness', -randInt(g, 1, 4))
    log(g, `I got a ${injury.toLowerCase()} ${use === USES.ride ? 'falling off' : 'using'} my ${lower(a.name)}.`, 'bad')
    notice(g, 'Ouch!', `${pick(g, ['It was going great until it wasn\'t.', 'You were showing off. Gravity noticed.', 'One wrong move and down you went.'])} You got a ${injury.toLowerCase()}.${feeNote}`, { emoji: '🩹', tone: 'bad' })
    return
  }

  const g2 = use.gains
  const h = roll(g, g2.health, c.age >= 65 ? factor * 0.6 : factor)
  addStat(g, 'health', h)
  addStat(g, 'happiness', roll(g, g2.happiness, factor))
  addStat(g, 'looks', roll(g, g2.looks, factor))
  addStat(g, 'smarts', roll(g, g2.smarts, factor))
  if (g2.athleticism) addHidden(g, 'athleticism', roll(g, g2.athleticism, factor))

  let text = specialLine(g, a) ?? fill(pick(g, use.lines), g, a)
  const key = str(a.details.itemKey)

  // Bring someone along.
  if (use.social) {
    const partner = g.people.find((p) => p.alive && (p.relation === 'spouse' || p.relation === 'partner' || p.relation === 'fiance'))
    const people = key === 'tandem' && partner ? [partner] : chance(g, 0.75) ? bringPeople(g, use.social) : []
    for (const p of people) {
      addRelationship(p, randInt(g, 2, use.social + 2))
      p.data.lastSeenAge = c.age
    }
    if (people.length) {
      const names = people.map((p) => p.firstName)
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      text += key === 'tandem' ? ` ${list} rode on the back and complained about the steering the whole way.` : ` ${list} came along and had a great time.`
    }
  }

  // Item-specific twists.
  if (use === USES.golf && chance(g, 0.015)) {
    addStat(g, 'happiness', 10)
    count(g, 'holeInOne')
    remember(g, 'Hit a hole-in-one.')
    text = 'HOLE IN ONE! The ball bounced twice and dropped in. Tradition says you buy the clubhouse a round. Your wallet weeps, your soul soars.'
  } else if (use === USES.cards && chance(g, 0.04)) {
    const worth = nicePrice(a.purchasePrice * randInt(g, 3, 12))
    a.value = Math.max(a.value, worth)
    addStat(g, 'happiness', 6)
    text = `You pulled a holographic ultra-rare! Collectors online say it's worth about ${formatMoney(worth)}. You put it in a sleeve, in a case, in a safe.`
  } else if (use === USES.plants && chance(g, 0.08)) {
    a.condition = Math.max(0, a.condition - 30)
    text = 'You forgot to water them for a month. Several plants have crossed over. The cactus survived out of spite.'
  } else if (use === USES.fishtank && chance(g, 0.08)) {
    addStat(g, 'happiness', -2)
    text = 'One of the fish was floating sideways. You held a tiny funeral and flushed it with dignity.'
  } else if (use === USES.fix) {
    const home = homeAsset(g)
    if (home && home.condition < 100) {
      const fix = randInt(g, 2, 6)
      home.condition = Math.min(100, home.condition + fix)
      text += ` Your ${lower(home.name)} is in slightly better shape now.`
    }
  } else if (use === USES.bbq && chance(g, 0.05)) {
    text = 'A gust of wind sent your napkins into the grill and briefly set the hedge on fire. The neighbors brought a fire extinguisher and stayed for burgers.'
  }

  // Hobbies are how adults make friends.
  const outdoorsy: readonly UseDef[] = [USES.ride, USES.skate, USES.ballgame, USES.climb, USES.surf, USES.racket, USES.golf, USES.slopes, USES.fish]
  if (c.age >= 8 && outdoorsy.includes(use) && chance(g, 0.05)) {
    const age = Math.max(8, c.age + randInt(g, -4, 4))
    const friend = createPerson(g, { relation: 'friend', age, relationship: randInt(g, 45, 65) })
    friend.data.metAt = `${str(a.details.sport, lower(use.title))}`
    notePerson(friend, `Met the player while ${lower(use.title)} at age ${c.age}.`)
    text += ` You got chatting with ${friend.firstName} ${friend.lastName}, who turned out to be great company. You swapped numbers.`
    log(g, `I made a new friend, ${friend.firstName}, while out with my ${lower(a.name)}.`, 'good')
  }

  if (a.condition <= 0) {
    text += str(a.details.category) === 'clothing' ? ` Your ${lower(a.name)} finally gave up. It's worn out.` : ` Your ${lower(a.name)} is broken now.`
  }
  log(g, fill(use.log, g, a), 'good')
  notice(g, use.title, `${text}${feeNote}`, { emoji: use.emoji, tone: 'good' })
}

function useAction(a: Asset): MenuAction | null {
  const use = USES[str(a.details.use) as UseId]
  if (!use) return null
  return {
    type: 'action',
    id: `ev-use-${a.id}`,
    label: `${use.label(a)}: ${a.name}`,
    emoji: a.emoji,
    subtitle: (g) => {
      const cur = findAsset(g, a.id) ?? a
      const left = Math.max(0, use.max - yearActionsUsed(g, `everyday.use:${a.id}`))
      return `Condition ${cur.condition}% · ${left} use${left === 1 ? '' : 's'} left this year`
    },
    disabledReason: (g) => {
      const cur = findAsset(g, a.id)
      return cur ? useReason(g, cur) : 'You no longer own it.'
    },
    run: (g) => useEverydayItem(g, a.id),
  }
}

/** Actions for an owned everyday item (for the owned-asset screen and the store's own list). */
export function everydayItemActions(_g: GameState, a: Asset): MenuNode[] {
  const act = useAction(a)
  return act ? [act] : []
}

/** Owned items bought at this store. */
function ownedFrom(g: GameState, storeId: StoreId | 'pet'): Asset[] {
  return g.assets.filter((a) => a.kind === 'other' && str(a.details.store) === storeId)
}

// ---------------------------------------------------------------------------
// Store menus

function storeNote(g: GameState, storeId: StoreId): string {
  const cid = g.character.countryId
  const country = getCountry(cid).name
  switch (storeId) {
    case 'bike':
      if ((BIKE_NATIONS as readonly string[]).includes(cid)) return `In ${country}, bikes are how people get around. The bike racks outside are three deep.`
      return 'A mechanic in the back is truing a wheel and humming.'
    case 'sports':
      if ((SNOW as readonly string[]).includes(cid) && (SURF_NATIONS as readonly string[]).includes(cid)) return 'Skis on one wall, surfboards on the other. Indecision is a lifestyle here.'
      if ((SNOW as readonly string[]).includes(cid)) return 'The ski wall is the first thing you see.'
      if ((SURF_NATIONS as readonly string[]).includes(cid)) return 'The surf report is chalked up next to the register.'
      if ((CRICKET as readonly string[]).includes(cid)) return 'A cricket match is on the TV behind the counter and nobody is working.'
      return 'It smells like new rubber and good intentions.'
    case 'furniture':
      return 'Every sofa is a showroom nap waiting to happen.'
    case 'clothing':
      return LOCAL_CLOTHES.some((d) => soldIn(cid, d)) ? 'There is a section of local and traditional clothing near the front.' : 'The music is loud and the fitting rooms are full.'
    case 'toy':
      return 'Somewhere, a demo toy is singing the same song on repeat.'
    case 'garden':
      return 'The staff all wear aprons and know exactly which screw you need.'
  }
}

function storeMenu(storeId: StoreId): MenuGroup {
  const store = STORES[storeId]
  return {
    type: 'menu',
    id: `everyday-${storeId}`,
    label: store.label,
    emoji: store.emoji,
    subtitle: (g) => `${storeName(g, storeId)} · ${store.blurb}`,
    visible: (g) => g.character.age >= Math.max(3, store.minAge - 4),
    disabledReason: (g) => {
      const b = blockReason(g)
      if (b) return b
      const c = g.character
      if (c.age < store.minAge) return `You're too young to shop at ${storeName(g, storeId)}.`
      if (storeId === 'furniture' && !hasHome(g)) return 'You need a place of your own before you start buying furniture. Your parents already hate the beanbag.'
      return null
    },
    header: (g) => {
      return [storeName(g, storeId).replace(/\.?$/, '.'), storeNote(g, storeId), `You have ${formatMoney(g.character.money)}.`, pricesIncludeTax(g)].filter(Boolean).join(' ')
    },
    children: (g) => {
      const nodes: MenuNode[] = []
      const owned = ownedFrom(g, storeId)
        .map((a) => useAction(a))
        .filter((x): x is MenuAction => x !== null)
      if (owned.length) {
        nodes.push({ type: 'heading', id: `ev-owned-${storeId}`, label: store.ownedLabel })
        nodes.push(...owned.slice(0, 12))
      }
      const items = everydayListings(g, storeId)
      nodes.push({ type: 'heading', id: `ev-stock-${storeId}`, label: `In Stock (${g.year})` })
      if (items.length === 0) nodes.push({ type: 'info', id: `ev-soldout-${storeId}`, text: 'Sold out! New stock arrives next year.', emoji: '🪧' })
      else nodes.push(...items.map((l) => listingAction(store, l)))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Pet Supplies

const PET_STORE = { names: ['{w} Pet Supplies', '{w} Paws & Claws'], fallbackName: 'Paws & Claws Pet Supply' }

export function livingPets(g: GameState): Person[] {
  return g.people.filter((p) => p.alive && p.relation === 'pet')
}

export function petSupplyListings(g: GameState, pet: Person): EverydayListing[] {
  const group = petGroup(pet.species)
  return PET_SUPPLIES.filter((d) => d.groups.includes(group) && itemInEra(d.key, g.year, g.character.countryId))
    .map((d) => {
      const l = listingFor(g, 'pet', d)
      return { ...l, id: `${l.id}:${pet.id}` }
    })
    .filter((l) => !isBought(g, l.id))
}

/** Buy a pet supply for a pet: the pet's relationship (and health, for food) goes up. */
export function buyPetSupply(g: GameState, l: EverydayListing, petId: string): boolean {
  const d = PET_SUPPLIES.find((x) => x.key === l.key) as PetItemDef | undefined
  const pet = g.people.find((p) => p.id === petId && p.alive && p.relation === 'pet')
  if (!d || !pet) return false
  const b = blockReason(g)
  if (b) {
    notice(g, 'Pet Supplies', b, { emoji: '🐾' })
    return false
  }
  if (isBought(g, l.id)) {
    notice(g, 'Already Bought', `You already bought that for ${pet.firstName} this year.`, { emoji: '🐾' })
    return false
  }
  let paidBy: Person | null = null
  if (!spend(g, l.price)) {
    if (g.character.age < 18) {
      const parent = begParent(g, l)
      if (parent === null) return false
      if (parent !== 'none') paidBy = parent
    }
    if (!paidBy) {
      cantAfford(g, l)
      return false
    }
  }
  markBought(g, l.id)
  count(g, 'purchases')
  const rel = l.price / safe(goodsMult(g))
  addRelationship(pet, rel >= 1_000 ? randInt(g, 8, 14) : rel >= 100 ? randInt(g, 5, 10) : randInt(g, 3, 6))
  addStat(g, 'happiness', randInt(g, 1, 3))
  if (d.consumable) {
    if (/Supply/.test(d.name)) pet.data.premiumFoodYear = g.year
    else addPersonStat(pet, 'happiness', randInt(g, 3, 8))
  } else {
    addItemAsset(g, l, d, { petId: pet.id, displayName: `${pet.firstName}'s ${d.name}` })
  }
  if (d.gps) pet.data.gpsCollar = true
  const species = (pet.species ?? 'pet').toLowerCase()
  log(g, `I bought my ${species} ${pet.firstName} ${withArticle(d.name)}.`, 'good')
  const reaction = d.consumable && /Supply/.test(d.name) ? `${pet.firstName} has never eaten this well. Expect a shinier, healthier ${species}.` : pick(g, QUIPS.pet)
  const who = paidBy ? ` Your ${relationLabel(paidBy).toLowerCase()} ${paidBy.firstName} paid for it.` : ''
  const tax = paidBy ? '' : taxLine(g, l.price)
  const gps = d.gps ? ` If ${pet.firstName} ever wanders off, you'll know exactly where to look.` : ''
  notice(g, 'Pet Supplies', `You bought ${withArticle(d.name)} for ${pet.firstName} (${formatMoney(l.price)}). ${reaction}${gps}${who}${tax ? ` ${tax}` : ''}`, { emoji: d.emoji, tone: 'good' })
  return true
}

function petMenu(pet: Person): MenuGroup {
  return {
    type: 'menu',
    id: `ev-pet-${pet.id}`,
    label: `For ${pet.firstName}`,
    emoji: '🐾',
    subtitle: `${pet.breed ?? pet.species ?? 'Pet'} · Relationship ${pet.relationship}%`,
    header: (g) => `Treat ${pet.firstName}. Spoiled pets love you more (and premium food keeps them healthy). You have ${formatMoney(g.character.money)}.`,
    children: (g) => {
      const cur = g.people.find((p) => p.id === pet.id && p.alive)
      if (!cur) return [{ type: 'info', id: 'ev-pet-gone', text: `${pet.firstName} is no longer with you.`, emoji: '🌈' }]
      const items = petSupplyListings(g, cur)
      if (items.length === 0) return [{ type: 'info', id: 'ev-pet-done', text: `You've bought ${pet.firstName} everything this year. Spoiled rotten.`, emoji: '🐾' }]
      return items.map(
        (l): MenuAction => {
          const d = PET_SUPPLIES.find((x) => x.key === l.key)
          return {
            type: 'action',
            id: `ev-petbuy-${l.id}`,
            label: l.name,
            emoji: l.emoji,
            subtitle: [formatMoney(l.price), d?.note ?? ''].filter(Boolean).join(' · '),
            disabledReason: blockReason,
            confirm: () => `Buy ${withArticle(l.name)} for ${pet.firstName} (${formatMoney(l.price)})?`,
            run: (gg) => {
              buyPetSupply(gg, l, pet.id)
            },
          }
        },
      )
    },
  }
}

const petSuppliesMenu: MenuGroup = {
  type: 'menu',
  id: 'everyday-pet',
  label: 'Pet Supplies',
  emoji: '🐾',
  subtitle: (g) => `${storeName(g, 'pet')} · Beds, toys, collars and premium food`,
  visible: (g) => g.character.age >= 6 && livingPets(g).length > 0,
  disabledReason: blockReason,
  header: (g) => [`${storeName(g, 'pet')}. A cat is asleep on the register.`, `You have ${formatMoney(g.character.money)}.`].join(' '),
  children: (g) => {
    const pets = livingPets(g)
    if (pets.length === 0) return [{ type: 'info', id: 'ev-nopets', text: "You don't have any pets.", emoji: '🐾' }]
    return pets.slice(0, 12).map(petMenu)
  },
}

/** Store menus shown under Shopping › Stores (and Assets › Shopping). */
export const everydayStoreMenus: MenuGroup[] = [
  storeMenu('bike'),
  storeMenu('sports'),
  storeMenu('clothing'),
  storeMenu('toy'),
  storeMenu('furniture'),
  storeMenu('garden'),
  petSuppliesMenu,
]

// ---------------------------------------------------------------------------
// Yearly hook

const STORE_DEPRECIATION: Record<string, [number, number]> = {
  bike: [0.08, 0.16],
  sports: [0.1, 0.2],
  furniture: [0.06, 0.14],
  clothing: [0.35, 0.55],
  toy: [0.2, 0.35],
  garden: [0.06, 0.12],
  pet: [0.15, 0.3],
}

const STORE_WEAR: Record<string, [number, number]> = {
  bike: [2, 6],
  sports: [1, 5],
  furniture: [1, 3],
  clothing: [8, 18],
  toy: [4, 12],
  garden: [1, 4],
  pet: [5, 12],
}

/** Freshness of the wardrobe: newer and nicer clothes count more; it fades over ~3 years. */
export function wardrobeFreshness(g: GameState): number {
  let fresh = 0
  for (const a of ownedFrom(g, 'clothing')) {
    const age = Math.max(0, g.year - num(a.details.boughtYear, g.year))
    const tier = num(a.details.tier, 2)
    fresh += [0, 0.5, 0.7, 1.1, 1.6][Math.min(4, Math.max(0, tier))] * Math.pow(0.5, age) * (a.condition > 0 ? 1 : 0)
  }
  return fresh
}

/** Yearly hook: wear and tear, perks of owned items. */
export function yearlyEveryday(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const mine = g.assets.filter((a) => a.kind === 'other' && typeof a.details.store === 'string' && typeof a.details.itemKey === 'string')

  // Value and condition (assets.ts only ages its own categories).
  for (const a of mine) {
    const store = str(a.details.store)
    if (str(a.details.category) === 'electronics') continue // consoles age with the gadgets in assets.ts
    const dep = STORE_DEPRECIATION[store] ?? [0.1, 0.2]
    const wear = STORE_WEAR[store] ?? [1, 4]
    a.value = Math.max(0, Math.round(a.value * (1 - (dep[0] + (dep[1] - dep[0]) * (randInt(g, 0, 100) / 100)))))
    a.condition = Math.max(0, a.condition - randInt(g, wear[0], wear[1]))
  }

  // Worn-out clothes and loved-to-death toys get thrown out.
  for (const a of mine) {
    const store = str(a.details.store)
    if (a.condition > 0 || (store !== 'clothing' && store !== 'toy')) continue
    g.assets = g.assets.filter((x) => x.id !== a.id)
    log(g, store === 'clothing' ? `I finally threw out my worn-out ${lower(a.name)}.` : `My ${lower(a.name)} fell apart. It was loved to death.`)
  }

  if (inPrison(g)) return

  // Bike theft: a classic of city life (and a national sport in some bike-mad cities).
  const bikes = g.assets.filter((a) => a.kind === 'other' && str(a.details.store) === 'bike')
  if (bikes.length && chance(g, (BIKE_NATIONS as readonly string[]).includes(c.countryId) ? 0.05 : 0.03)) {
    const bike = pick(g, bikes)
    g.assets = g.assets.filter((x) => x.id !== bike.id)
    addStat(g, 'happiness', -randInt(g, 2, 5))
    log(g, `Someone stole my ${lower(bike.name)}.`, 'bad')
    notice(g, 'Bike Stolen', pick(g, [`Your ${lower(bike.name)} was stolen. The lock was not. Thieves left it behind, neatly cut.`, `You came outside and your ${lower(bike.name)} was gone. Just the front wheel was left, still locked to the rack.`, `Your ${lower(bike.name)} vanished overnight. You checked every rack in ${c.city || 'town'} for weeks.`]), { emoji: '🚲', tone: 'bad' })
  }

  // A fresh wardrobe gives a small, fading boost once a year.
  const fresh = wardrobeFreshness(g)
  if (fresh >= 0.6 && c.age >= 10) {
    const boost = fresh >= 3 ? 2 : 1
    addStat(g, 'looks', boost)
    addStat(g, 'happiness', 1)
    if (chance(g, 0.4)) log(g, pick(g, ['People kept complimenting my clothes this year.', 'My wardrobe was on point this year.', 'I felt good in my clothes this year.']), 'good')
  }

  // A home you've made your own.
  const decor = mine.filter((a) => str(a.details.store) === 'furniture' && g.year - num(a.details.boughtYear, g.year) <= 4)
  if (decor.length && hasHome(g)) addStat(g, 'happiness', decor.length >= 3 ? 2 : 1)

  // Solar panels cut the power bill on the house they're installed on.
  for (const a of mine) {
    if (a.details.solar !== true) continue
    const homeId = str(a.details.homeId)
    if (!homeId || !g.assets.some((h) => h.id === homeId && h.kind === 'house')) continue
    const continent = getCountry(c.countryId).continent
    const sun = continent === 'Middle East' || continent === 'Africa' || continent === 'Oceania' ? 1.25 : continent === 'Europe' ? 0.85 : 1
    const saved = Math.round(a.purchasePrice * (0.055 + randInt(g, 0, 25) / 1000) * sun * (a.condition / 100))
    if (saved > 0) {
      addMoney(g, saved)
      count(g, 'solarSavings', saved)
      if (chance(g, 0.35)) log(g, `My solar panels saved me ${formatMoney(saved)} on power bills this year.`, 'good')
    }
  }

  // Pets that ate premium food all last year are healthier.
  for (const pet of livingPets(g)) {
    if (num(pet.data.premiumFoodYear) !== g.year - 1) continue
    addPersonStat(pet, 'health', randInt(g, 3, 7))
    addRelationship(pet, randInt(g, 1, 3))
    delete pet.data.premiumFoodYear
  }
}
