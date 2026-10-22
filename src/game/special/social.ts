// Activities > Social Media: accounts on original-named platforms, posting, follower growth,
// going viral, verification, sponsorships, monetization, trolling, suspensions and hackers.
// All accounts live in g.flags['special.social']; character.social mirrors the biggest one
// (so ribbons and the profile see the player's main account).
import { addHidden, addRelationship, addStat, count, earnIncome, fullName, getPerson, log, relationLabel, remember, scriptChoice, spend, useYearAction } from '../core'
import { chance, pick, rand, randInt, shuffle, uid } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode, SocialMedia } from '../types'
import { CELEBS, FAMOUS, addFame, blocked, claimYearly, compact, fameOf, money, peek, prof, say, tell } from './common'
import { eraOpen, type EraGate } from '../computer/era'
import { typicalIncome } from '../events/wealth-core'
import { brandPool, pickBrand } from '../shops/everyday-brands'

// ---------------------------------------------------------------------------
// Data

type StatSource = 'looks' | 'smarts' | 'craziness' | 'karma' | 'athleticism' | 'neutral' | 'mix'

interface PostType {
  label: string
  emoji: string
  stat: StatSource
  /** Chance of controversy / hate comments. */
  risk: number
  mult: number
}

const POSTS: Record<string, PostType> = {
  selfie: { label: 'Selfie', emoji: '\u{1F933}', stat: 'looks', risk: 0.05, mult: 1 },
  thirst: { label: 'Thirst Trap', emoji: '\u{1F525}', stat: 'looks', risk: 0.15, mult: 1.4 },
  family: { label: 'Family Photo', emoji: '\u{1F46A}', stat: 'karma', risk: 0.02, mult: 0.8 },
  food: { label: 'Food Photo', emoji: '\u{1F35D}', stat: 'neutral', risk: 0.02, mult: 0.7 },
  travel: { label: 'Travel Photo', emoji: '\u{2708}\u{FE0F}', stat: 'looks', risk: 0.03, mult: 1 },
  meme: { label: 'Meme', emoji: '\u{1F438}', stat: 'smarts', risk: 0.08, mult: 1.1 },
  quote: { label: 'Motivational Quote', emoji: '\u{1F4AD}', stat: 'karma', risk: 0.03, mult: 0.6 },
  politics: { label: 'Political Rant', emoji: '\u{1F5F3}\u{FE0F}', stat: 'craziness', risk: 0.35, mult: 1.2 },
  poll: { label: 'Poll', emoji: '\u{1F4CA}', stat: 'neutral', risk: 0.03, mult: 0.6 },
  story: { label: 'Story', emoji: '\u{1F4DD}', stat: 'smarts', risk: 0.04, mult: 0.8 },
  vlog: { label: 'Vlog', emoji: '\u{1F3A5}', stat: 'mix', risk: 0.05, mult: 1 },
  dance: { label: 'Dance Video', emoji: '\u{1F483}', stat: 'athleticism', risk: 0.05, mult: 1.2 },
  challenge: { label: 'Challenge Video', emoji: '\u{1F3C6}', stat: 'craziness', risk: 0.1, mult: 1.2 },
  celeb: { label: 'Reshare a Celebrity', emoji: '\u{2B50}', stat: 'neutral', risk: 0.02, mult: 0.6 },
  hottake: { label: 'Hot Take', emoji: '\u{1F336}\u{FE0F}', stat: 'craziness', risk: 0.3, mult: 1.3 },
  joke: { label: 'Joke', emoji: '\u{1F602}', stat: 'smarts', risk: 0.06, mult: 1 },
  justice: { label: 'Social Justice Post', emoji: '\u{270A}', stat: 'karma', risk: 0.3, mult: 1.1 },
  skit: { label: 'Skit', emoji: '\u{1F3AD}', stat: 'smarts', risk: 0.06, mult: 1.2 },
  lipsync: { label: 'Lip Sync', emoji: '\u{1F3A4}', stat: 'looks', risk: 0.04, mult: 1 },
  prank: { label: 'Prank Video', emoji: '\u{1F921}', stat: 'craziness', risk: 0.2, mult: 1.3 },
  review: { label: 'Product Review', emoji: '\u{1F4E6}', stat: 'smarts', risk: 0.05, mult: 0.9 },
  gaming: { label: 'Gaming Video', emoji: '\u{1F3AE}', stat: 'smarts', risk: 0.05, mult: 1.1 },
  haul: { label: 'Haul', emoji: '\u{1F6CD}\u{FE0F}', stat: 'looks', risk: 0.05, mult: 0.9 },
  howto: { label: 'How-To', emoji: '\u{1F6E0}\u{FE0F}', stat: 'smarts', risk: 0.02, mult: 0.9 },
  unboxing: { label: 'Unboxing', emoji: '\u{1F381}', stat: 'neutral', risk: 0.03, mult: 0.9 },
  educational: { label: 'Educational Video', emoji: '\u{1F4DA}', stat: 'smarts', risk: 0.02, mult: 0.8 },
  reaction: { label: 'Reaction Video', emoji: '\u{1F631}', stat: 'craziness', risk: 0.08, mult: 1.1 },
}

interface Platform {
  id: string
  name: string
  emoji: string
  /** Follower growth multiplier. */
  growth: number
  posts: string[]
  /** Followers needed to monetize (null = sponsorships only). */
  monetizeAt: number | null
  monetizeLabel: string
  /** Income per follower per active year when monetized ([min, max]). */
  payRate: [number, number]
  celebs: boolean
  spamSuspends: boolean
  trollSuspends: boolean
  stream: boolean
  noun: string
  postVerb: string
  /** When the platform exists where the player lives (none of them before social media). */
  era: EraGate
}

/** The invented names these platforms had before they became the real ones (old saves may carry them). */
const LEGACY_NAMES: Record<string, string> = { friendbook: 'Friendbook', snapgram: 'Snapgram', chirper: 'Chirper', clipz: 'Clipz', viewtube: 'ViewTube', glitch: 'Glitch' }

export const PLATFORMS: Platform[] = [
  {
    id: 'friendbook',
    era: { tech: 'socialMedia', from: 2004 },
    name: 'Facebook',
    emoji: '\u{1F465}',
    growth: 0.6,
    posts: ['family', 'food', 'meme', 'quote', 'politics', 'poll', 'travel', 'selfie', 'story', 'vlog'],
    monetizeAt: null,
    monetizeLabel: '',
    payRate: [0, 0],
    celebs: true,
    spamSuspends: false,
    trollSuspends: true,
    stream: false,
    noun: 'friends',
    postVerb: 'Make a Post',
  },
  {
    id: 'snapgram',
    era: { tech: ['socialMedia', 'smartphone'], from: 2010 },
    name: 'Instagram',
    emoji: '\u{1F4F8}',
    growth: 1,
    posts: ['selfie', 'thirst', 'food', 'travel', 'family', 'meme', 'quote', 'dance', 'challenge', 'celeb'],
    monetizeAt: null,
    monetizeLabel: '',
    payRate: [0, 0],
    celebs: true,
    spamSuspends: true,
    trollSuspends: true,
    stream: false,
    noun: 'followers',
    postVerb: 'Make a Post',
  },
  {
    id: 'chirper',
    era: { tech: 'socialMedia', from: 2006 },
    name: 'X (Twitter)',
    emoji: '\u{1F426}',
    growth: 0.9,
    posts: ['hottake', 'meme', 'joke', 'politics', 'poll', 'justice', 'quote', 'celeb', 'selfie'],
    monetizeAt: null,
    monetizeLabel: '',
    payRate: [0, 0],
    celebs: true,
    spamSuspends: true,
    trollSuspends: true,
    stream: false,
    noun: 'followers',
    postVerb: 'Write a Post',
  },
  {
    id: 'clipz',
    era: { tech: ['videoSharing', 'smartphone'], from: 2017 },
    name: 'TikTok',
    emoji: '\u{1F3B5}',
    growth: 1.3,
    posts: ['dance', 'challenge', 'skit', 'lipsync', 'prank', 'review', 'vlog', 'politics', 'justice', 'thirst'],
    monetizeAt: 10_000,
    monetizeLabel: 'Join the Creator Fund',
    payRate: [0.05, 0.2],
    celebs: false,
    spamSuspends: true,
    trollSuspends: false,
    stream: false,
    noun: 'followers',
    postVerb: 'Post a Video',
  },
  {
    id: 'viewtube',
    era: { tech: 'videoSharing', from: 2005 },
    name: 'YouTube',
    emoji: '\u{25B6}\u{FE0F}',
    growth: 0.8,
    posts: ['vlog', 'gaming', 'haul', 'howto', 'unboxing', 'challenge', 'educational', 'review', 'politics', 'reaction'],
    monetizeAt: 1_000,
    monetizeLabel: 'Monetize Channel',
    payRate: [1, 5],
    celebs: false,
    spamSuspends: true,
    trollSuspends: false,
    stream: false,
    noun: 'subscribers',
    postVerb: 'Post a Video',
  },
  {
    id: 'glitch',
    era: { tech: 'videoSharing', from: 2011 },
    name: 'Twitch',
    emoji: '\u{1F3AE}',
    growth: 0.9,
    posts: [],
    monetizeAt: 50,
    monetizeLabel: 'Request Affiliate Status',
    payRate: [0.5, 2.5],
    celebs: false,
    spamSuspends: true,
    trollSuspends: false,
    stream: true,
    noun: 'followers',
    postVerb: 'Start a Livestream',
  },
]

/** True when this platform exists for the player this year. */
export function platformExists(g: GameState, id: string): boolean {
  const plat = PLATFORMS.find((p) => p.id === id)
  return !!plat && eraOpen(g, plat.era)
}

/** True when any social platform exists here this year (no social media in 1990). */
export function socialMediaExists(g: GameState): boolean {
  return PLATFORMS.some((p) => eraOpen(g, p.era))
}

function platformOf(id: string): Platform {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]
}

export interface Account extends SocialMedia {
  posts: number
  postsAtLastYear: number
  lastPostAge: number
  suspended: string | null
  spam: number
  trolls: number
  celebFollowers: string[]
  createdAge: number
}

interface SocialProfile {
  accounts: Account[]
}

const MIN_AGE = 13
const MAX_SOCIAL_COUNT = 1e12

function boundedWhole(value: unknown, fallback = 0, max = MAX_SOCIAL_COUNT): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : fallback
}

/** Bought followers on an account: a whole count that can never exceed the followers there. */
function boundedFake(value: unknown, followers: number): number {
  return Math.min(followers, boundedWhole(value))
}

/** Followers who aren't bought. Bought ones never pay, never seed growth and never count as fame. */
function organic(a: { followers: number; fake?: number }): number {
  return Math.max(0, a.followers - boundedFake(a.fake, a.followers))
}

/** Store a bought-follower count; the field exists only while it is above 0. */
function setFake(a: { fake?: number }, n: number): void {
  if (n > 0) a.fake = n
  else delete a.fake
}

/** Cut an account to a share of its followers; the bought ones shrink by the same share. */
function scaleFollowers(a: Account, share: number): void {
  const bought = boundedFake(a.fake, a.followers)
  a.followers = Math.round(a.followers * share)
  setFake(a, boundedFake(Math.round(bought * share), a.followers))
}

function canonicalPlatform(value: unknown): Platform | undefined {
  if (typeof value !== 'string') return undefined
  return PLATFORMS.find((p) => p.id === value || p.name === value || LEGACY_NAMES[p.id] === value)
}

/** Turn untrusted persisted account data into a small, finite record. */
function normalizedAccount(g: GameState, value: unknown): Account | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<Account>
  const plat = canonicalPlatform(raw.platform)
  if (!plat) return null
  const posts = boundedWhole(raw.posts, 0, 1e9)
  const celebrities = Array.isArray(raw.celebFollowers)
    ? [...new Set(raw.celebFollowers.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)).filter(Boolean))].slice(0, 128)
    : []
  const followers = boundedWhole(raw.followers)
  const acct: Account = {
    platform: plat.id,
    handle: cleanHandle(typeof raw.handle === 'string' ? raw.handle : undefined, defaultHandle(g, plat.id)),
    followers,
    verified: raw.verified === true,
    monetized: raw.monetized === true,
    posts,
    postsAtLastYear: Math.min(posts, boundedWhole(raw.postsAtLastYear, 0, 1e9)),
    lastPostAge: typeof raw.lastPostAge === 'number' && Number.isFinite(raw.lastPostAge)
      ? Math.max(-1, Math.min(10_000, Math.round(raw.lastPostAge)))
      : -1,
    suspended: typeof raw.suspended === 'string' && raw.suspended.trim() ? raw.suspended.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) : null,
    spam: boundedWhole(raw.spam, 0, 1e6),
    trolls: boundedWhole(raw.trolls, 0, 1e6),
    celebFollowers: celebrities,
    createdAge: boundedWhole(raw.createdAge, boundedWhole(g.character.age, 0, 10_000), 10_000),
  }
  setFake(acct, boundedFake(raw.fake, followers))
  return acct
}

function normalizedAccounts(g: GameState, value: unknown): Account[] {
  if (!Array.isArray(value)) return []
  const out: Account[] = []
  const seen = new Set<string>()
  for (const raw of value.slice(0, 128)) {
    const acct = normalizedAccount(g, raw)
    if (!acct || seen.has(acct.platform)) continue
    seen.add(acct.platform)
    out.push(acct)
  }
  return out
}

// ---------------------------------------------------------------------------
// Accounts & syncing with character.social

function load(g: GameState): Account[] {
  const p = prof<SocialProfile>(g, 'social', () => ({ accounts: [] }))
  p.accounts = normalizedAccounts(g, p.accounts)
  const main = g.character.social
  if (main) {
    const plat = canonicalPlatform(main.platform)
    const known = plat ? p.accounts.find((a) => a.platform === plat.id) : undefined
    if (known) {
      // Another module may have touched the main account (events, fame): respect it.
      known.handle = cleanHandle(typeof main.handle === 'string' ? main.handle : undefined, defaultHandle(g, known.platform))
      known.followers = boundedWhole(main.followers)
      setFake(known, boundedFake(known.fake, known.followers))
      known.verified = main.verified === true
      known.monetized = main.monetized === true
    } else {
      if (plat && !p.accounts.some((a) => a.platform === plat.id)) p.accounts.push(newAccount(g, plat.id, main.handle, main.followers, main.verified, main.monetized, main.fake))
    }
  }
  return p.accounts
}

function sync(g: GameState): void {
  const p = peek<SocialProfile>(g, 'social')
  const list = normalizedAccounts(g, p?.accounts)
  if (p) p.accounts = list
  if (list.length === 0) {
    g.character.social = null
    return
  }
  const top = [...list].sort((a, b) => organic(b) - organic(a))[0]
  const mirror: SocialMedia = { platform: top.platform, handle: top.handle, followers: top.followers, verified: top.verified, monetized: top.monetized }
  if (top.fake) mirror.fake = top.fake
  g.character.social = mirror
}

function newAccount(g: GameState, platform: string, handle: string, followers = 0, verified = false, monetized = false, fake: unknown = 0): Account {
  const acct: Account = {
    platform,
    handle: cleanHandle(typeof handle === 'string' ? handle : undefined, defaultHandle(g, platform)),
    followers: boundedWhole(followers),
    verified: verified === true,
    monetized: monetized === true,
    posts: 0,
    postsAtLastYear: 0,
    lastPostAge: -1,
    suspended: null,
    spam: 0,
    trolls: 0,
    celebFollowers: [],
    createdAge: g.character.age,
  }
  setFake(acct, boundedFake(fake, acct.followers))
  return acct
}

/** Read-only account lookup for menus. */
function viewAccount(g: GameState, platform: string): Account | undefined {
  const fromProfile = normalizedAccounts(g, peek<SocialProfile>(g, 'social')?.accounts).find((a) => a.platform === platform)
  if (fromProfile) return fromProfile
  const main = g.character.social
  if (main && main.platform === platform) return { ...newAccount(g, platform, main.handle, main.followers, main.verified, main.monetized, main.fake) }
  return undefined
}

function account(g: GameState, platform: string): Account | undefined {
  return load(g).find((a) => a.platform === platform)
}

/** Total real followers across every platform, bought ones left out (read-only). */
export function totalFollowers(g: GameState): number {
  const list = normalizedAccounts(g, peek<SocialProfile>(g, 'social')?.accounts)
  if (list.length) return list.reduce((sum, account) => Math.min(MAX_SOCIAL_COUNT, sum + organic(account)), 0)
  const main = g.character.social
  return main ? organic({ followers: boundedWhole(main.followers), fake: main.fake }) : 0
}

function defaultHandle(g: GameState, platform: string): string {
  const c = g.character
  const base = `${c.firstName}${c.lastName}`.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  const suffix = platform === 'glitch' ? 'plays' : platform === 'viewtube' ? 'tv' : ''
  return `${base}${suffix}${(g.year - c.age) % 100}`
}

function cleanHandle(input: string | undefined, fallback: string): string {
  const t = (input ?? '').replace(/^@+/, '').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 24)
  return t || fallback
}

// ---------------------------------------------------------------------------
// Posting

function statValue(g: GameState, s: StatSource): number {
  const c = g.character
  switch (s) {
    case 'looks':
      return c.stats.looks
    case 'smarts':
      return c.stats.smarts
    case 'craziness':
      return c.hidden.craziness
    case 'karma':
      return c.hidden.karma
    case 'athleticism':
      return c.hidden.athleticism
    case 'mix':
      return (c.stats.looks + c.stats.smarts) / 2
    default:
      return 50
  }
}

interface PostResult {
  gained: number
  likes: number
  viral: boolean
  good: boolean
}

/** Core follower math shared by posts and livestreams. */
function resolvePost(g: GameState, acct: Account, plat: Platform, stat: StatSource, mult: number): PostResult {
  const c = g.character
  const quality = statValue(g, stat)
  const roll = quality * 0.6 + rand(g) * 60 - 10
  const good = roll >= 45
  const f = fameOf(g)
  const famousBoost = 1 + (f * f) / 40
  const base = (4 + c.stats.looks / 12 + quality / 10) * plat.growth * mult * (0.5 + rand(g) * 2.5)
  let gained: number
  let viral = false
  if (roll < 15) {
    gained = -Math.min(organic(acct), Math.round(organic(acct) * (0.005 + rand(g) * 0.03)) + randInt(g, 0, 5))
  } else {
    const fromFollowers = organic(acct) * (good ? 0.01 + rand(g) * 0.05 : 0.002)
    gained = Math.round(base * famousBoost + fromFollowers)
    if (chance(g, 0.02 + (roll > 85 ? 0.08 : 0) + f / 1000)) {
      viral = true
      gained = Math.round(gained * randInt(g, 10, 30) + randInt(g, 1_000, 20_000))
    }
  }
  acct.followers = Math.max(0, acct.followers + gained)
  acct.posts += 1
  acct.lastPostAge = c.age
  const likes = Math.max(0, Math.round((organic(acct) + Math.max(0, gained)) * (0.02 + rand(g) * 0.15) * (good ? 1 : 0.3)) + randInt(g, 0, 8))
  count(g, 'socialPosts')
  if (viral) {
    count(g, 'viralPosts')
    addFame(g, randInt(g, 2, 4))
    addStat(g, 'happiness', 10)
  } else if (good) {
    addStat(g, 'happiness', randInt(g, 1, 4))
    if (organic(acct) >= 1_000_000) addFame(g, 2)
    else if (organic(acct) >= 50_000 || f >= FAMOUS) addFame(g, 1)
  } else {
    addStat(g, 'happiness', -randInt(g, 1, 4))
  }
  return { gained, likes, viral, good }
}

function postSummary(g: GameState, what: string, plat: Platform, r: PostResult): string {
  const noun = plat.noun
  if (r.viral) {
    return pickSite(g, [
      `Your ${what} went VIRAL! It racked up ${compact(r.likes)} likes and you gained ${compact(r.gained)} new ${noun}.`,
      `The internet lost its mind over your ${what}. ${compact(r.gained)} new ${noun} and counting!`,
      `Your ${what} is everywhere. ${compact(r.likes)} likes, ${compact(r.gained)} new ${noun}, and a morning show wants to talk about it.`,
    ], 0xc1e2fbd8)
  }
  if (r.gained < 0) {
    return pickSite(g, [
      `Your ${what} flopped. Only ${compact(r.likes)} people liked it and you lost ${compact(-r.gained)} ${noun}.`,
      `Nobody liked your ${what}. ${compact(-r.gained)} ${noun} hit unfollow.`,
      `Your ${what} got ${compact(r.likes)} likes, mostly from bots. You lost ${compact(-r.gained)} ${noun}.`,
    ], 0x2985647d)
  }
  if (r.good) {
    return pickSite(g, [
      `Your ${what} got ${compact(r.likes)} likes and you gained ${compact(r.gained)} new ${noun}.`,
      `People loved your ${what}: ${compact(r.likes)} likes and ${compact(r.gained)} new ${noun}.`,
      `Your ${what} did well, picking up ${compact(r.likes)} likes and ${compact(r.gained)} ${noun}.`,
    ], 0xaf33cd6f)
  }
  return pickSite(g, [
    `Your ${what} got a lukewarm ${compact(r.likes)} likes. You gained ${compact(r.gained)} ${noun}.`,
    `Your ${what} got ${compact(r.likes)} likes. Your mom commented "nice". You gained ${compact(r.gained)} ${noun}.`,
  ], 0xe6a2f876)
}

const hateScript = defineScript('special.social.hate', (g, choice, data) => {
  const platform = String((data as { platform?: string } | undefined)?.platform ?? 'friendbook')
  const acct = account(g, platform)
  let text: string
  if (choice === 'clap') {
    if (chance(g, 0.45)) {
      if (acct) acct.followers += Math.round(organic(acct) * 0.02) + randInt(g, 5, 50)
      addStat(g, 'happiness', 4)
      text = 'You clapped back with a devastating reply. The trolls went quiet and your fans cheered.'
    } else {
      addStat(g, 'happiness', -6)
      text = 'You clapped back, and the trolls brought reinforcements. It got ugly.'
    }
  } else if (choice === 'delete') {
    text = 'You deleted the post. Out of sight, out of mind... mostly.'
    addStat(g, 'happiness', -2)
  } else if (choice === 'report') {
    text = chance(g, 0.5) ? 'You reported the worst comments and the trolls were banned.' : 'You reported the comments. Support replied with a robot emoji.'
  } else {
    addStat(g, 'happiness', -3)
    text = 'You ignored the hate comments. They stung, but you survived.'
  }
  sync(g)
  say(g, 'Hate Comments', text, '\u{1F4AC}')
})

function maybeHate(g: GameState, plat: Platform, risk: number): void {
  if (!chance(g, risk * 0.6 + 0.04)) return
  addStat(g, 'happiness', -randInt(g, 2, 5))
  scriptChoice(
    g,
    hateScript,
    'Hate Comments',
    pickSite(g, [
      `Your latest ${plat.name} post is flooded with hate comments.`,
      `A swarm of trolls found your ${plat.name} post. The comments are brutal.`,
      `Someone wrote "ratio + nobody asked" under your post and it got thousands of likes.`,
    ], 0xb77e757c),
    [
      { id: 'ignore', label: 'Ignore them', emoji: '\u{1F610}' },
      { id: 'clap', label: 'Clap back', emoji: '\u{1F525}' },
      { id: 'delete', label: 'Delete the post', emoji: '\u{1F5D1}\u{FE0F}' },
      { id: 'report', label: 'Report them', emoji: '\u{1F6A9}' },
    ],
    { emoji: '\u{1F4AC}', data: { platform: plat.id } },
  )
}

function makePost(g: GameState, platformId: string, typeId: string): void {
  const plat = platformOf(platformId)
  const type = POSTS[typeId]
  const acct = account(g, platformId)
  if (!acct || !type) return
  if (acct.suspended) return tell(g, plat.name, 'Your account is suspended. You need to appeal before you can post again.', '\u{1F6AB}')
  if (!useYearAction(g, `social.post.${platformId}`, 6)) {
    return tell(g, plat.name, `You've posted so much on ${plat.name} this year that your ${plat.noun} are muting you. Try again next year.`, '\u{1F971}')
  }
  const r = resolvePost(g, acct, plat, type.stat, type.mult)
  let what = type.label.toLowerCase()
  if (typeId === 'family' && !g.people.some((p) => p.alive && ['parent', 'sibling', 'child', 'spouse', 'partner'].includes(p.relation))) what = 'family photo (of you and a houseplant)'
  log(g, `I posted a ${type.label.toLowerCase()} on ${plat.name}.`, r.viral ? 'good' : r.gained < 0 ? 'bad' : 'neutral')
  if (r.viral) remember(g, `A ${type.label.toLowerCase()} I posted on ${plat.name} went viral.`)
  sync(g)
  say(g, plat.name, postSummary(g, what, plat, r), type.emoji, r.viral || r.good ? 'good' : r.gained < 0 ? 'bad' : 'neutral')
  maybeHate(g, plat, type.risk)
}

// ---------------------------------------------------------------------------
// Livestreams (Glitch)

const STREAM_CATEGORIES = [
  { id: 'chat', label: 'Just Chatting', emoji: '\u{1F4AC}', stat: 'mix' as StatSource },
  { id: 'blocks', label: 'Block Builder', emoji: '\u{1F9F1}', stat: 'smarts' as StatSource },
  { id: 'royale', label: 'Battle Royale', emoji: '\u{1F52B}', stat: 'craziness' as StatSource },
  { id: 'kart', label: 'Kart Racing', emoji: '\u{1F3CE}\u{FE0F}', stat: 'athleticism' as StatSource },
  { id: 'cooking', label: 'Cooking', emoji: '\u{1F373}', stat: 'neutral' as StatSource },
  { id: 'asmr', label: 'ASMR', emoji: '\u{1F442}', stat: 'looks' as StatSource },
  { id: 'speedrun', label: 'Speedrunning', emoji: '\u{23F1}\u{FE0F}', stat: 'smarts' as StatSource },
  { id: 'lifesim', label: 'Life Simulators', emoji: '\u{1F476}', stat: 'craziness' as StatSource },
]

const STREAM_LENGTHS = [
  { id: 'short', label: 'Short (1-3 hours)', emoji: '\u{1F552}', hours: 2, mult: 0.7, health: 0 },
  { id: 'medium', label: 'Medium (4-6 hours)', emoji: '\u{1F555}', hours: 5, mult: 1, health: 0 },
  { id: 'long', label: 'Long (7-12 hours)', emoji: '\u{1F558}', hours: 9, mult: 1.4, health: -4 },
  { id: 'marathon', label: 'Marathon (24 hours)', emoji: '\u{1F635}', hours: 24, mult: 2.2, health: -16 },
]

const streamLengthScript = defineScript('special.social.streamLength', (g, choice, data) => {
  const cat = STREAM_CATEGORIES.find((x) => x.id === (data as { category?: string } | undefined)?.category) ?? STREAM_CATEGORIES[0]
  const len = STREAM_LENGTHS.find((x) => x.id === choice)
  const acct = account(g, 'glitch')
  if (!len || !acct) return
  const plat = platformOf('glitch')
  const r = resolvePost(g, acct, plat, cat.stat, len.mult)
  if (len.health) addStat(g, 'health', len.health)
  const viewers = Math.max(1, Math.round(organic(acct) * (0.03 + rand(g) * 0.1)) + randInt(g, 0, 4))
  let tips = 0
  if (acct.monetized) {
    tips = Math.round(viewers * len.hours * (0.05 + rand(g) * 0.2))
    if (tips > 0) earnIncome(g, tips, 'royalty')
  }
  log(g, `I livestreamed ${cat.label} on Glitch for ${len.hours} hours.`, r.good ? 'good' : 'neutral')
  sync(g)
  const healthNote = len.health < 0 ? ` Sitting for ${len.hours} hours straight wrecked your back.` : ''
  const tipNote = tips > 0 ? ` You earned ${money(tips)} from subs and tips.` : ''
  say(g, 'Glitch', `You streamed ${cat.label} to a peak of ${compact(viewers)} viewers. ${r.gained >= 0 ? `You gained ${compact(r.gained)} followers.` : `You lost ${compact(-r.gained)} followers.`}${r.viral ? ' A clip of your stream went viral!' : ''}${tipNote}${healthNote}`, cat.emoji, r.good ? 'good' : 'neutral')
})

const streamCategoryScript = defineScript('special.social.streamCategory', (g, choice) => {
  if (choice === 'cancel') return
  scriptChoice(g, streamLengthScript, 'Glitch', 'How long do you want to stream?', STREAM_LENGTHS.map((l) => ({ id: l.id, label: l.label, emoji: l.emoji })), {
    emoji: '\u{1F3AE}',
    data: { category: choice },
  })
})

// ---------------------------------------------------------------------------
// Sponsorships

// Shady products always come from invented companies (nothing sketchy is ever pinned on a real brand);
// honest ones are sponsored by a real brand from the registry that sells that kind of thing here.
const PRODUCTS: { name: string; shady: boolean; category?: string; segment?: string; since?: number }[] = [
  { name: 'detox tea', shady: true },
  { name: 'a teeth whitening kit', shady: true },
  { name: 'a brand-new cryptocurrency', shady: true },
  { name: 'miracle hair gummies', shady: true },
  { name: 'a gaming chair', shady: false, category: 'furniture', segment: 'chair' },
  { name: 'running shoes', shady: false, category: 'sneakers' },
  { name: 'a meal kit service', shady: false, category: 'meal-kit' },
  { name: 'a language learning app', shady: false, category: 'app', segment: 'education' },
  { name: 'noise-canceling headphones', shady: false, category: 'electronics', segment: 'audio' },
  { name: 'a sparkling water brand', shady: false, category: 'water' },
]
const SHADY_SPONSORS = ['Glowr', 'Nutri-Zoom', 'Fizzbee', 'PeakPerform', 'Snackwise', 'Velocita', 'Fluffcloud', 'GrindHouse']

interface PromoOffer {
  platform: string
  sponsor: string
  product: string
  shady: boolean
  pay: number
}

const promoScript = defineScript('special.social.promo', (g, choice, data) => {
  const offer = data as unknown as PromoOffer
  const plat = platformOf(offer.platform)
  const acct = account(g, offer.platform)
  if (!acct) return
  if (choice !== 'accept') return say(g, plat.name, `You turned down ${offer.sponsor}. Your integrity remains intact (for now).`, '\u{1F91D}')
  earnIncome(g, offer.pay, 'royalty')
  count(g, 'sponsoredPosts')
  let text = `You promoted ${offer.product} for ${offer.sponsor} on ${plat.name} and earned ${money(offer.pay)}.`
  if (offer.shady && chance(g, 0.7)) {
    // Only real followers can unfollow: bought ones are bots and stay put.
    const lost = Math.round(organic(acct) * (0.02 + rand(g) * 0.06))
    acct.followers = Math.max(0, acct.followers - lost)
    addFame(g, -1)
    text += lost > 0 ? ` Your ${plat.noun} saw right through it and ${compact(lost)} of them unfollowed you.` : ` The followers were bought, so none left.`
  } else {
    text += pickLine(g, [' Your fans didn\'t seem to mind.', ' A few fans even bought it.', ' Nobody noticed it was an ad. Perfect.'])
  }
  log(g, `I promoted ${offer.product} on ${plat.name}.`)
  sync(g)
  say(g, plat.name, text, '\u{1F4B0}', 'good')
})

function promote(g: GameState, platformId: string): void {
  const plat = platformOf(platformId)
  const acct = account(g, platformId)
  if (!acct) return
  if (acct.suspended) return tell(g, plat.name, 'You cannot promote anything while your account is suspended.', '\u{1F6AB}')
  if (!useYearAction(g, `social.promo.${platformId}`, 2)) return tell(g, plat.name, 'No more sponsors are interested in working with you this year.', '\u{1F937}')
  const offers = PRODUCTS.filter((x) => x.shady || !x.category || brandPool(g, x.category, x.segment ? { segment: x.segment } : {}).length > 0)
  const product = pick(g, offers)
  const pay = Math.max(50, Math.round((organic(acct) * (0.01 + rand(g) * 0.04) + fameOf(g) * 100) / 10) * 10)
  const real = !product.shady && product.category ? pickBrand(g, product.category, product.segment ? { segment: product.segment } : {}) : undefined
  const offer: PromoOffer = { platform: platformId, sponsor: real?.name ?? pick(g, SHADY_SPONSORS), product: product.name, shady: product.shady, pay }
  scriptChoice(
    g,
    promoScript,
    plat.name,
    `${offer.sponsor} will pay you ${money(pay)} to promote ${product.name} to your ${compact(organic(acct))} ${plat.noun}.`,
    [
      { id: 'accept', label: 'Promote it', emoji: '\u{2705}' },
      { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F4B0}', data: offer as unknown as Json },
  )
}

// ---------------------------------------------------------------------------
// Celebrities & trolling

const CELEB_ACTIONS = [
  { id: 'compliment', label: 'Compliment them', emoji: '\u{1F60D}' },
  { id: 'insult', label: 'Insult them', emoji: '\u{1F595}' },
  { id: 'love', label: 'Profess your love', emoji: '\u{1F498}' },
  { id: 'troll', label: 'Troll them', emoji: '\u{1F479}' },
]

const celebActScript = defineScript('special.social.celebAct', (g, choice, data) => {
  const d = data as { platform?: string; celeb?: string } | undefined
  const plat = platformOf(String(d?.platform ?? 'chirper'))
  const celeb = String(d?.celeb ?? 'A celebrity')
  const acct = account(g, plat.id)
  if (!acct) return
  let text: string
  const f = fameOf(g)
  if (choice === 'compliment') {
    if (chance(g, 0.15 + f / 200) && !acct.celebFollowers.includes(celeb)) {
      acct.celebFollowers.push(celeb)
      const gained = Math.round(500 + organic(acct) * 0.05 + rand(g) * 5_000)
      acct.followers += gained
      text = `You complimented ${celeb}. They followed you back! You gained ${compact(gained)} ${plat.noun} from the attention.`
    } else text = pickSite(g, [`You complimented ${celeb}. They didn't notice.`, `You told ${celeb} they were your hero. Their assistant liked it.`], 0xd386f1c6)
  } else if (choice === 'insult') {
    if (chance(g, 0.3)) {
      const gained = Math.round(200 + organic(acct) * 0.03 + rand(g) * 3_000)
      acct.followers += gained
      addFame(g, 1)
      text = `You insulted ${celeb}, who fired back. The drama earned you ${compact(gained)} ${plat.noun}.`
    } else {
      addHidden(g, 'karma', -2)
      text = `You insulted ${celeb}. Their fans swarmed your replies with clown emojis.`
    }
  } else if (choice === 'love') {
    text = chance(g, 0.05) ? `You professed your love to ${celeb}. They replied with a kiss emoji! You may never recover.` : `You professed your love to ${celeb}. You were left on read.`
  } else {
    acct.trolls += 1
    addHidden(g, 'karma', -3)
    text = `You trolled ${celeb} relentlessly. Their fan army reported your account.`
    if (plat.trollSuspends && acct.trolls >= 3 && chance(g, 0.4)) {
      acct.suspended = 'abusive behavior'
      text += ` ${plat.name} suspended your account for abusive behavior.`
    }
  }
  log(g, `I replied to ${celeb} on ${plat.name}.`)
  sync(g)
  say(g, plat.name, text, '\u{2B50}')
})

const celebPickScript = defineScript('special.social.celebPick', (g, choice, data) => {
  if (choice === 'cancel') return
  const platform = String((data as { platform?: string } | undefined)?.platform ?? 'chirper')
  scriptChoice(g, celebActScript, choice, `What do you want to say to ${choice}?`, CELEB_ACTIONS, { emoji: '\u{2B50}', data: { platform, celeb: choice } })
})

const DEV_CURSES = ['Hemorrhoids', 'Constipation', 'Diarrhea', 'Chronic Hiccups']

const trollScript = defineScript('special.social.troll', (g, choice, data) => {
  if (choice === 'cancel') return
  const plat = platformOf(String((data as { platform?: string } | undefined)?.platform ?? 'chirper'))
  const acct = account(g, plat.id)
  if (!acct) return
  const c = g.character
  acct.trolls += 1
  addHidden(g, 'karma', -3)
  let text: string
  if (choice === 'devs') {
    const curse = pick(g, DEV_CURSES)
    if (!c.conditions.some((x) => x.name === curse)) {
      c.conditions.push({ id: uid(g, 'c'), name: curse, kind: 'disease', severity: 8, yearsHad: 0, curable: true, diagnosed: true, age: c.age })
    }
    text = `You trolled @AnotherLifeDevs. Within the hour, you came down with ${curse.toLowerCase()}. Coincidence? Probably not.`
  } else if (choice.startsWith('celeb:')) {
    const celeb = choice.slice(6)
    text = `You trolled ${celeb}. Their fans are now trolling you back, with interest.`
  } else {
    const p = getPerson(g, choice)
    if (!p) return
    if (chance(g, 0.65)) {
      addRelationship(p, -randInt(g, 10, 25))
      text = `You trolled your ${relationLabel(p).toLowerCase()} ${p.firstName} online. They saw it and are furious with you.`
    } else text = `You trolled your ${relationLabel(p).toLowerCase()} ${p.firstName} online. Luckily, they never saw it.`
  }
  if (chance(g, 0.4)) acct.followers += randInt(g, 1, 30) + Math.round(organic(acct) * 0.005)
  if (plat.trollSuspends && acct.trolls >= 3 && chance(g, 0.35)) {
    acct.suspended = 'abusive behavior'
    text += ` ${plat.name} suspended your account for abusive behavior.`
  }
  log(g, `I trolled someone on ${plat.name}.`, 'bad')
  sync(g)
  say(g, plat.name, text, '\u{1F479}', 'bad')
})

function trollTargets(g: GameState): { id: string; label: string; emoji: string }[] {
  const people = shuffle(
    g,
    g.people.filter((p) => p.alive && p.relation !== 'pet' && p.age >= 10),
  ).slice(0, 5)
  return [
    ...people.map((p) => ({ id: p.id, label: `${fullName(p)} (${relationLabel(p)})`, emoji: '\u{1F464}' })),
    ...shuffle(g, CELEBS)
      .slice(0, 2)
      .map((name) => ({ id: `celeb:${name}`, label: name, emoji: '\u{2B50}' })),
    { id: 'devs', label: '@AnotherLifeDevs', emoji: '\u{1F47E}' },
    { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
  ]
}

// ---------------------------------------------------------------------------
// Verification, buying followers, monetization, suspensions, hackers

const BUY_PACKS = [
  { id: '1000', amount: 1_000, cost: 100 },
  { id: '10000', amount: 10_000, cost: 900 },
  { id: '100000', amount: 100_000, cost: 8_000 },
  { id: '1000000', amount: 1_000_000, cost: 70_000 },
]

const buyScript = defineScript('special.social.buy', (g, choice, data) => {
  if (choice === 'cancel') return
  const plat = platformOf(String((data as { platform?: string } | undefined)?.platform ?? 'snapgram'))
  const acct = account(g, plat.id)
  const pack = BUY_PACKS.find((b) => b.id === choice)
  if (!acct || !pack) return
  if (!spend(g, pack.cost, 'purchase')) return tell(g, plat.name, `You can't afford ${money(pack.cost)} for fake ${plat.noun}.`, '\u{1F4B8}')
  acct.followers += pack.amount
  acct.fake = boundedFake((acct.fake ?? 0) + pack.amount, acct.followers)
  acct.spam += pack.amount >= 100_000 ? 3 : pack.amount >= 10_000 ? 2 : 1
  count(g, 'boughtFollowers')
  let text = `You paid ${money(pack.cost)} for ${compact(pack.amount)} ${plat.noun}. Most of them have usernames like "user83749201".`
  if (plat.spamSuspends && chance(g, Math.min(0.7, acct.spam * 0.08))) {
    acct.suspended = 'spam'
    text += ` ${plat.name} noticed the sudden spike and suspended your account for spam!`
  }
  log(g, `I bought ${compact(pack.amount)} ${plat.noun} on ${plat.name}.`)
  sync(g)
  say(g, plat.name, text, '\u{1F916}', acct.suspended ? 'bad' : 'neutral')
})

const APPEALS = [
  { id: 'apologize', label: 'Apologize', emoji: '\u{1F64F}', odds: 0.5 },
  { id: 'confused', label: 'Act confused', emoji: '\u{1F615}', odds: 0.4 },
  { id: 'misunderstanding', label: 'Claim a misunderstanding', emoji: '\u{1F937}', odds: 0.45 },
  { id: 'threaten', label: 'Threaten them', emoji: '\u{1F620}', odds: 0.1 },
  { id: 'email', label: 'Write them an angry email', emoji: '\u{1F4E7}', odds: 0.15 },
]

const appealScript = defineScript('special.social.appeal', (g, choice, data) => {
  const plat = platformOf(String((data as { platform?: string } | undefined)?.platform ?? 'snapgram'))
  const acct = account(g, plat.id)
  const appeal = APPEALS.find((a) => a.id === choice)
  if (!acct || !appeal) return
  if (chance(g, appeal.odds)) {
    acct.suspended = null
    acct.spam = 0
    acct.trolls = 0
    sync(g)
    say(g, plat.name, `${plat.name} reviewed your appeal and reinstated your account. Behave yourself this time.`, '\u{2705}', 'good')
  } else {
    say(g, plat.name, `${plat.name} denied your appeal. ${choice === 'threaten' ? 'Threatening the moderators did not help.' : 'You can try again next year.'}`, '\u{1F6AB}', 'bad')
  }
})

interface HackData {
  platform: string
  ransom: number
}

const hackScript = defineScript('special.social.hack', (g, choice, data) => {
  const d = data as unknown as HackData
  const plat = platformOf(d.platform)
  const acct = account(g, d.platform)
  if (!acct) return
  let text: string
  if (choice === 'pay') {
    if (spend(g, d.ransom, 'crime.take')) {
      if (chance(g, 0.7)) text = `You paid the hacker ${money(d.ransom)} and got your ${plat.name} account back.`
      else {
        scaleFollowers(acct, 0.6)
        text = `You paid ${money(d.ransom)}, and the hacker posted embarrassing photos anyway before handing it back. You lost a chunk of ${plat.noun}.`
      }
    } else {
      scaleFollowers(acct, 0.7)
      text = `You couldn't afford the ransom. The hacker spammed your ${plat.noun} with scam links before you got your account back.`
    }
  } else if (choice === 'support') {
    if (chance(g, 0.6)) text = `Account recovery finally worked after a few stressful weeks.`
    else {
      scaleFollowers(acct, 0.75)
      text = `Recovering the account took months. By then the hacker had driven away a quarter of your ${plat.noun}.`
    }
  } else {
    const p = peek<SocialProfile>(g, 'social')
    if (p) p.accounts = p.accounts.filter((a) => a.platform !== d.platform)
    text = `You gave up and deleted your ${plat.name} account.`
  }
  sync(g)
  say(g, 'Hacked!', text, '\u{1F977}', 'bad')
})

// ---------------------------------------------------------------------------
// Menus

function accountReason(g: GameState): string | null {
  return blocked(g, MIN_AGE)
}

function postMenu(plat: Platform): MenuNode {
  if (plat.stream) {
    return {
      type: 'action',
      id: `social.${plat.id}.stream`,
      label: plat.postVerb,
      emoji: '\u{1F534}',
      disabledReason: (g) => accountReason(g) ?? (viewAccount(g, plat.id)?.suspended ? 'Your account is suspended.' : null),
      run: (g) => {
        const acct = account(g, plat.id)
        if (!acct) return
        if (!useYearAction(g, `social.post.${plat.id}`, 4)) return tell(g, plat.name, "You've streamed so much this year your chair has a permanent dent. Try again next year.", '\u{1F971}')
        scriptChoice(
          g,
          streamCategoryScript,
          'Glitch',
          'What do you want to stream?',
          [...STREAM_CATEGORIES.map((x) => ({ id: x.id, label: x.label, emoji: x.emoji })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
          { emoji: '\u{1F3AE}' },
        )
      },
    }
  }
  return {
    type: 'menu',
    id: `social.${plat.id}.post`,
    label: plat.postVerb,
    emoji: '\u{270F}\u{FE0F}',
    disabledReason: (g) => accountReason(g) ?? (viewAccount(g, plat.id)?.suspended ? 'Your account is suspended.' : null),
    header: () => 'What kind of post?',
    children: (): MenuNode[] =>
      plat.posts.map(
        (typeId): MenuAction => ({
          type: 'action',
          id: `social.${plat.id}.post.${typeId}`,
          label: POSTS[typeId].label,
          emoji: POSTS[typeId].emoji,
          run: (g) => makePost(g, plat.id, typeId),
        }),
      ),
  }
}

function accountMenu(plat: Platform): MenuGroup {
  return {
    type: 'menu',
    id: `social.${plat.id}`,
    label: plat.name,
    emoji: plat.emoji,
    subtitle: (g) => {
      const a = viewAccount(g, plat.id)
      if (!a) return ''
      return `@${a.handle} · ${compact(a.followers)} ${plat.noun}${a.verified ? ' \u{2714}\u{FE0F}' : ''}${a.suspended ? ' · Suspended' : ''}`
    },
    visible: (g) => !!viewAccount(g, plat.id),
    header: (g) => {
      const a = viewAccount(g, plat.id)
      if (!a) return ''
      const celebs = a.celebFollowers.length ? ` Celebrity followers: ${a.celebFollowers.join(', ')}.` : ''
      const status = a.suspended ? ` Your account is suspended for ${a.suspended}.` : ''
      return `@${a.handle}${a.verified ? ' \u{2714}\u{FE0F}' : ''}: ${a.followers.toLocaleString('en-US')} ${plat.noun}${a.fake ? ` (${a.fake.toLocaleString('en-US')} bought)` : ''}, ${a.posts} posts${a.monetized ? ', monetized' : ''}.${celebs}${status}`
    },
    children: (g): MenuNode[] => {
      const a = viewAccount(g, plat.id)
      if (!a) return []
      if (a.suspended) {
        return [
          {
            type: 'action',
            id: `social.${plat.id}.appeal`,
            label: 'Appeal Suspension',
            emoji: '\u{2696}\u{FE0F}',
            disabledReason: accountReason,
            run: (gg) => {
              if (!useYearAction(gg, `social.appeal.${plat.id}`, 1)) return tell(gg, plat.name, `Nobody is answering your appeal messages. Try again next year.`, '\u{1F6AB}')
              scriptChoice(gg, appealScript, plat.name, `Your account was suspended for ${a.suspended}. How do you want to appeal?`, APPEALS.map((x) => ({ id: x.id, label: x.label, emoji: x.emoji })), {
                emoji: '\u{2696}\u{FE0F}',
                data: { platform: plat.id },
              })
            },
          },
          deleteAction(plat),
        ]
      }
      const nodes: MenuNode[] = [postMenu(plat)]
      nodes.push({
        type: 'action',
        id: `social.${plat.id}.promo`,
        label: 'Promote a Product',
        emoji: '\u{1F4B0}',
        subtitle: 'Get paid by a sponsor',
        disabledReason: (gg) => accountReason(gg) ?? ((organic(viewAccount(gg, plat.id) ?? { followers: 0 })) < 1_000 && fameOf(gg) < FAMOUS ? `Sponsors want at least 1,000 ${plat.noun}.` : null),
        run: (gg) => promote(gg, plat.id),
      })
      if (plat.celebs) {
        nodes.push({
          type: 'action',
          id: `social.${plat.id}.celeb`,
          label: 'Reply to a Celebrity',
          emoji: '\u{2B50}',
          disabledReason: accountReason,
          run: (gg) => {
            if (!useYearAction(gg, `social.celeb.${plat.id}`, 3)) return tell(gg, plat.name, "You've slid into enough celebrity replies this year.", '\u{1F971}')
            const celebs = shuffle(gg, CELEBS).slice(0, 6)
            scriptChoice(gg, celebPickScript, plat.name, 'Which celebrity do you want to reply to?', [...celebs.map((n) => ({ id: n, label: n, emoji: '\u{2B50}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }], {
              emoji: '\u{2B50}',
              data: { platform: plat.id },
            })
          },
        })
        nodes.push({
          type: 'action',
          id: `social.${plat.id}.troll`,
          label: 'Troll Someone',
          emoji: '\u{1F479}',
          disabledReason: accountReason,
          run: (gg) => {
            if (!useYearAction(gg, `social.troll.${plat.id}`, 3)) return tell(gg, plat.name, "You've been trolling so much even the trolls think you need a break.", '\u{1F971}')
            scriptChoice(gg, trollScript, plat.name, 'Who do you want to troll?', trollTargets(gg), { emoji: '\u{1F479}', data: { platform: plat.id } })
          },
        })
      }
      if (!a.verified) {
        nodes.push({
          type: 'action',
          id: `social.${plat.id}.verify`,
          label: 'Request Verification',
          emoji: '\u{2714}\u{FE0F}',
          disabledReason: accountReason,
          run: (gg) => {
            const acct = account(gg, plat.id)
            if (!acct || acct.verified) return
            if (!useYearAction(gg, `social.verify.${plat.id}`, 1)) return tell(gg, plat.name, `${plat.name} only reviews one verification request per year.`, '\u{23F3}')
            if (fameOf(gg) >= 40 || organic(acct) >= 100_000) {
              acct.verified = true
              count(gg, 'verified')
              log(gg, `My ${plat.name} account got verified.`, 'good')
              remember(gg, `Got verified on ${plat.name}.`)
              sync(gg)
              say(gg, plat.name, `Check! ${plat.name} verified your account. That little blue tick is now the most important thing about you.`, '\u{2714}\u{FE0F}', 'good')
            } else {
              say(gg, plat.name, `${plat.name} denied your verification request. You need to be famous or have at least 100,000 ${plat.noun}.`, '\u{274C}', 'bad')
            }
          },
        })
      }
      nodes.push({
        type: 'action',
        id: `social.${plat.id}.buy`,
        label: `Buy ${plat.noun[0].toUpperCase()}${plat.noun.slice(1)}`,
        emoji: '\u{1F916}',
        disabledReason: accountReason,
        run: (gg) =>
          scriptChoice(
            gg,
            buyScript,
            plat.name,
            `A sketchy website sells ${plat.noun} in bulk. How many do you want?`,
            [...BUY_PACKS.map((b) => ({ id: b.id, label: `${compact(b.amount)} for ${money(b.cost)}`, emoji: '\u{1F916}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' }],
            { emoji: '\u{1F916}', data: { platform: plat.id } },
          ),
      })
      if (plat.monetizeAt !== null && !a.monetized) {
        const need = plat.monetizeAt
        nodes.push({
          type: 'action',
          id: `social.${plat.id}.monetize`,
          label: plat.monetizeLabel,
          emoji: '\u{1F4B5}',
          subtitle: `Requires ${need.toLocaleString('en-US')} ${plat.noun}`,
          disabledReason: accountReason,
          run: (gg) => {
            const acct = account(gg, plat.id)
            if (!acct) return
            if (organic(acct) < need || acct.posts < 1) {
              return say(gg, plat.name, `${plat.name} rejected your application. You need at least ${need.toLocaleString('en-US')} ${plat.noun} and some content first.`, '\u{274C}', 'bad')
            }
            acct.monetized = true
            log(gg, `I monetized my ${plat.name} account.`, 'good')
            sync(gg)
            say(gg, plat.name, `${plat.name} approved you! You'll now earn money from your content every year, as long as you keep posting.`, '\u{1F4B5}', 'good')
          },
        })
      }
      nodes.push(deleteAction(plat))
      return nodes
    },
  }
}

function deleteAction(plat: Platform): MenuAction {
  return {
    type: 'action',
    id: `social.${plat.id}.delete`,
    label: 'Delete Account',
    emoji: '\u{1F5D1}\u{FE0F}',
    confirm: (g) => `Delete your ${plat.name} account and all ${compact(viewAccount(g, plat.id)?.followers ?? 0)} ${plat.noun}? This can't be undone.`,
    run: (g) => {
      load(g)
      const p = prof<SocialProfile>(g, 'social', () => ({ accounts: [] }))
      p.accounts = p.accounts.filter((a) => a.platform !== plat.id)
      sync(g)
      log(g, `I deleted my ${plat.name} account.`)
      say(g, plat.name, pickSite(g, [`You deleted your ${plat.name} account. You feel lighter already.`, `You deleted ${plat.name}. You just reclaimed six hours of your day.`], 0xa3006ea0), '\u{1F5D1}\u{FE0F}')
    },
  }
}

function joinAction(plat: Platform): MenuAction {
  return {
    type: 'action',
    id: `social.${plat.id}.join`,
    label: plat.name,
    emoji: plat.emoji,
    subtitle: 'Sign up',
    visible: (g) => !viewAccount(g, plat.id) && eraOpen(g, plat.era),
    disabledReason: accountReason,
    input: { kind: 'text', label: `Choose your ${plat.name} handle`, placeholder: 'username', defaultValue: (g) => defaultHandle(g, plat.id) },
    run: (g, input) => {
      const list = load(g)
      if (list.some((a) => a.platform === plat.id) || !eraOpen(g, plat.era)) return
      const handle = cleanHandle(input, defaultHandle(g, plat.id))
      const start = Math.round(fameOf(g) ** 2 * 30 + randInt(g, 0, 15))
      list.push(newAccount(g, plat.id, handle, start))
      count(g, 'socialAccounts')
      log(g, `I joined ${plat.name} as @${handle}.`)
      sync(g)
      say(g, plat.name, `You signed up for ${plat.name} as @${handle}.${start > 100 ? ` Because you're famous, ${compact(start)} people followed you right away.` : ' Time to start posting!'}`, plat.emoji, 'good')
    },
  }
}

export const socialMediaMenu: MenuGroup = {
  type: 'menu',
  id: 'socialMedia',
  label: 'Social Media',
  emoji: '\u{1F4F1}',
  subtitle: (g) => {
    const total = totalFollowers(g)
    return total > 0 ? `${compact(total)} followers` : 'Become an influencer'
  },
  visible: (g) => g.character.alive && !g.character.prison && g.character.age >= MIN_AGE && (socialMediaExists(g) || totalFollowers(g) > 0 || !!g.character.social),
  header: (g) => {
    const total = totalFollowers(g)
    return total > 0 ? `You have ${total.toLocaleString('en-US')} followers across all platforms.` : 'Sign up for a platform and start posting.'
  },
  children: (): MenuNode[] => [
    { type: 'heading', id: 'social.mine', label: 'Your Accounts', visible: (g) => PLATFORMS.some((p) => !!viewAccount(g, p.id)) },
    ...PLATFORMS.map(accountMenu),
    { type: 'heading', id: 'social.join', label: 'Join a Platform', visible: (g) => PLATFORMS.some((p) => !viewAccount(g, p.id) && eraOpen(g, p.era)) },
    ...PLATFORMS.map(joinAction),
  ],
}

// ---------------------------------------------------------------------------
// Yearly

export function yearlySocial(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  if (!c.social && !peek<SocialProfile>(g, 'social')) return
  if (!claimYearly(g, 'social')) return
  const list = load(g)
  const f = fameOf(g)
  let hacked = false
  for (const acct of list) {
    const plat = platformOf(acct.platform)
    const recentPosts = acct.posts - acct.postsAtLastYear
    acct.postsAtLastYear = acct.posts
    // Platforms sweep out bought accounts every year: a fixed share, no dice.
    const bought = boundedFake(acct.fake, acct.followers)
    // A small leftover goes in one sweep, so no stray field or tiny log line lingers.
    const gone = bought < 100 ? bought : Math.round(bought * 0.3)
    if (gone > 0) {
      acct.followers -= gone
      setFake(acct, bought - gone)
      log(g, `${plat.name} removed ${compact(gone)} fake followers.`)
    }
    if (acct.suspended) {
      if (chance(g, 0.2)) {
        acct.suspended = null
        acct.spam = 0
        acct.trolls = 0
        log(g, `My ${plat.name} suspension was lifted.`)
      }
      continue
    }
    acct.trolls = Math.max(0, acct.trolls - 1)
    acct.spam = Math.max(0, acct.spam - 1)
    const active = recentPosts > 0
    if (active || f >= FAMOUS) {
      const growth = organic(acct) * rand(g) * 0.04 + (f * f * plat.growth * (2 + rand(g) * 8)) / 10
      acct.followers += Math.round(growth)
    } else if (acct.followers > 0) {
      acct.followers = Math.max(0, acct.followers - Math.round(organic(acct) * (0.01 + rand(g) * 0.04)))
    }
    if (acct.monetized && active && !c.prison) {
      const [lo, hi] = plat.payRate
      const income = Math.min(Math.round(organic(acct) * (lo + rand(g) * (hi - lo)) * Math.min(1, recentPosts / 4)), 1500 * typicalIncome(g))
      if (income > 0) {
        earnIncome(g, income, 'royalty')
        count(g, 'influencerIncome', income)
        log(g, `My ${plat.name} ${plat.stream ? 'streams' : 'content'} earned ${money(income)}.`, 'good')
      }
    }
    if (f >= 50 && chance(g, 0.25)) {
      const celeb = pick(g, CELEBS)
      if (!acct.celebFollowers.includes(celeb)) {
        acct.celebFollowers.push(celeb)
        log(g, `${celeb} started following me on ${plat.name}.`, 'good')
      }
    }
    if (!hacked && !c.prison && acct.followers >= 10_000 && chance(g, 0.03)) {
      hacked = true
      const ransom = Math.max(500, Math.round(acct.followers * 0.02 / 100) * 100)
      scriptChoice(
        g,
        hackScript,
        'Hacked!',
        `A hacker took over your ${plat.name} account and is demanding ${money(ransom)} to give it back.`,
        [
          { id: 'pay', label: `Pay ${money(ransom)}`, emoji: '\u{1F4B8}' },
          { id: 'support', label: 'Contact support', emoji: '\u{1F4E7}' },
          { id: 'delete', label: 'Delete the account', emoji: '\u{1F5D1}\u{FE0F}' },
        ],
        { emoji: '\u{1F977}', data: { platform: acct.platform, ransom } },
      )
    }
  }
  sync(g)
}
