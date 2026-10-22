// Creator-owned publishing: books have a finite manuscript; comics have a living promise
// to their readers. All money is internal dollars, taxed once through earnIncome.
import { craftSkill } from '../activities/creative'
import { localPrice } from '../activities/common'
import { addStat, count, earnIncome, endJob, log, notice, remember, spend, useYearAction, yearActionsUsed } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { hasTech } from '../history/timeline'
import { liftSkill } from '../mastery'
import { randFloat, randInt } from '../rng'
import { hasTalent, talentMult } from '../talents'
import type { GameState } from '../types'
import { getCountry } from '../world'
import {
  AUTHOR_JOB, formatAvailable, formatDef, isAuthorFormat, isAuthorGenre, isChapterFocus,
  isReleasePace, isStoryPromise, type AuthorFormat, type AuthorGenre, type ChapterFocus,
  type Publishing, type ReleasePace, type StoryPromise,
} from './author-data'
import { authorMut, authorView, saveAuthor, type AuthorProfile, type AuthorWork } from './author-state'
import { addFame, blocked, hire, money, myJob, quitNote, stableRoll, syncTenure } from './common'

function clamp(n: number, lo = 0, hi = 100): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}

const activeWork = (w: AuthorWork) => w.stage === 'draft' || w.stage === 'ready' || w.stage === 'serial'
const releasedWork = (w: AuthorWork) => w.stage === 'published' || w.stage === 'serial' || w.stage === 'ended'

function careerActionBlock(g: GameState): string | null {
  return blocked(g, 16) ?? (!myJob(g, AUTHOR_JOB) ? 'Start or resume your Author career first.' : null)
}

export function authorCareerBlock(g: GameState): string | null {
  return blocked(g, 16) ?? (myJob(g, AUTHOR_JOB) ? 'You already work as an author.' : null)
    ?? (craftSkill(g, 'writing') < 20 ? 'Build your writing skill to 20 first. Practice here or in Creative Arts.' : null)
}

export function startAuthorCareer(g: GameState): void {
  const reason = authorCareerBlock(g)
  if (reason) return notice(g, 'Author Career', reason, { emoji: '✍️' })
  authorMut(g)
  const { quit } = hire(g, { defId: AUTHOR_JOB, title: 'Independent Author', company: 'Your Writing Desk', salary: 0 })
  log(g, 'I became a full-time author.', 'good')
  notice(g, 'Your Writing Life', `You are an independent author. There is no guaranteed salary: manuscripts, publishing contracts, and reader loyalty pay the bills.${quitNote(quit)} Choose a format, genre, and story promise to begin.`, { emoji: '✍️', tone: 'good' })
}

function trainCraft(g: GameState, craft: 'writing' | 'art', amount: number): number {
  const age = g.character.age
  const ceiling = age >= 18 ? 100 : Math.max(30, Math.min(100, 30 + (age - 8) * 6))
  const before = craftSkill(g, craft)
  const mastered = liftSkill(g, `craft.${craft}`, 'creative', craft, before, ceiling)
  const gain = Math.max(0, Math.min(ceiling - mastered, Math.round(amount * Math.max(.2, 1 - mastered / 120) * talentMult(g, craft === 'writing' ? 'Writing' : 'Art', 1.6))))
  g.flags[`skill.${craft}`] = Math.min(100, Math.max(before, mastered + gain))
  return craftSkill(g, craft) - before
}

export function practiceAuthor(g: GameState, craft: 'writing' | 'art'): void {
  if (blocked(g, 8) || (craft !== 'writing' && craft !== 'art')) return
  if (!useYearAction(g, 'author.practice', 3)) return notice(g, 'Creative Rest', 'You have practiced three times this year. Give your ideas time to settle.', { emoji: '✍️' })
  const gain = trainCraft(g, craft, randInt(g, 6, 10))
  addStat(g, 'happiness', 1)
  notice(g, craft === 'writing' ? 'Writing Workshop' : 'Storyboarding Practice', `${craft === 'writing' ? 'You rewrote a scene until every sentence earned its place.' : 'You practiced readable panels, expressions, and visual storytelling.'} ${craft === 'writing' ? 'Writing' : 'Art'} ${craftSkill(g, craft)}% (+${gain}). This is the same skill used in Creative Arts.`, { emoji: craft === 'writing' ? '✍️' : '🎨' })
}

export function authorWorkBlock(g: GameState, format?: AuthorFormat): string | null {
  const reason = careerActionBlock(g)
  if (reason) return reason
  const p = authorView(g)
  if (p.works.some(activeWork)) return 'Finish, end, or abandon your current work before starting another.'
  if (p.works.length >= 4096) return 'Your publication catalog is full.'
  if (yearActionsUsed(g, 'author.startWork') >= 1) return 'You have already started a new work this year. A fresh idea needs time.'
  if (format) {
    if (!isAuthorFormat(format)) return 'Choose a valid format.'
    if (!formatAvailable(g, format)) return format === 'manga' ? 'Start new manga while living in Japan.' : 'Start new manhwa while living in Korea or China.'
    const f = formatDef(format)
    if (craftSkill(g, 'writing') < f.minWriting) return `${f.label} needs writing skill ${f.minWriting}%.`
    if (craftSkill(g, 'art') < f.minArt) return `${f.label} needs art skill ${f.minArt}%. Practice storyboarding first.`
  }
  return null
}

export function startAuthorWork(g: GameState, spec: { format: AuthorFormat; genre: AuthorGenre; promise: StoryPromise; title: string }): void {
  if (!isAuthorFormat(spec.format) || !isAuthorGenre(spec.genre) || !isStoryPromise(spec.promise)) return
  const reason = authorWorkBlock(g, spec.format)
  if (reason) return notice(g, 'New Work', reason, { emoji: '📖' })
  const title = String(spec.title ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!title) return notice(g, 'Working Title', 'Give your story a title before beginning.', { emoji: '📖' })
  const p = authorMut(g)
  if (p.works.some((w) => w.title.toLowerCase() === title.toLowerCase())) return notice(g, 'Title Already Used', 'Choose a different title or a sequel title.', { emoji: '📖' })
  if (!useYearAction(g, 'author.startWork', 1)) return
  p.seq += 1
  p.works.push({
    id: `aw${p.seq}`, title, format: spec.format, genre: spec.genre, promise: spec.promise,
    stage: 'draft', countryId: g.character.countryId, started: g.year, released: 0, progress: 0,
    quality: 35, chapters: 0, readers: 0, trust: 60, hooks: 15, arcs: 0, volumes: 0,
    copies: 0, tail: 0, gross: 0, earned: 0, publisher: '', share: 1, recoup: 0, spent: 0,
    focus: spec.promise === 'spectacle' ? 'world' : spec.promise === 'mystery' ? 'cliffhanger' : 'characters',
    pace: 'steady', hiatus: false, hiatuses: 0, lastYear: -1, adaptedUntil: 0, adaptationBase: 0, adaptationEarned: 0,
  })
  saveAuthor(g, p)
  log(g, `I began writing "${title}".`, 'good')
  notice(g, 'A Story Begins', `${title}: ${formatDef(spec.format).label}. Work on the manuscript or pilot twice per year, then choose a publisher or self-publication. Your story promise is ${spec.promise}: deliver on it to earn lasting readers.`, { emoji: formatDef(spec.format).emoji })
}

function craftQuality(g: GameState, p: AuthorProfile, w: AuthorWork): number {
  const writing = craftSkill(g, 'writing')
  const art = craftSkill(g, 'art')
  const serial = formatDef(w.format).serial
  return clamp(20 + writing * (serial ? .43 : .68) + (serial ? art * .25 : 0) + g.character.stats.smarts * .1
    + (hasTalent(g, 'Writing') ? 7 : 0) + (serial && hasTalent(g, 'Art') ? 7 : 0) - p.burnout * .18, 5, 98)
}

export function workOnAuthorWork(g: GameState, id: string, quiet = false): void {
  if (careerActionBlock(g)) return
  const p = authorMut(g), w = p.works.find((x) => x.id === id)
  if (!w || (w.stage !== 'draft' && w.stage !== 'ready')) return
  if (!useYearAction(g, 'author.write', 2)) return notice(g, 'No More Pages This Year', 'Two focused writing sessions is the limit this year. Revise again next year.', { emoji: '✍️' })
  trainCraft(g, 'writing', 3)
  if (formatDef(w.format).serial) trainCraft(g, 'art', 2)
  const revision = w.stage === 'ready'
  w.progress = clamp(w.progress + 100 / formatDef(w.format).effort)
  const target = clamp(craftQuality(g, p, w) + randInt(g, -5, 5), 5, 98)
  w.quality = clamp(revision ? w.quality + Math.max(0, (target - w.quality) * .4) : w.quality + (target - w.quality) * .65, 5, 98)
  if (w.progress >= 100) w.stage = 'ready'
  p.burnout = clamp(p.burnout + 3)
  saveAuthor(g, p)
  if (!quiet) notice(g, revision ? 'Revised Manuscript' : w.stage === 'ready' ? 'Ready for Readers' : 'Pages Written', `${w.title}: ${Math.round(w.progress)}% complete, quality ${Math.round(w.quality)}. ${w.stage === 'ready' ? 'Revise further, pitch to a publisher, or self-publish.' : 'The next writing session will move the story forward.'}`, { emoji: '✍️' })
}

/** Offers are stable for the year; opening a menu cannot improve the deal. */
export function authorPublisherOffer(g: GameState, w: AuthorWork): { available: boolean; advance: number; share: number; label: string } {
  const p = authorView(g), f = formatDef(w.format)
  const available = w.stage === 'ready' && w.quality >= 60 && stableRoll(g, `author.pitch.${w.id}`) < clamp(.35 + w.quality / 250 + p.reputation / 400, 0, .9)
  const label = w.format === 'manga' ? 'Paper Crane Weekly' : w.format === 'manhwa' ? (hasTech(g, 'internet') ? 'Lantern Scroll Comics' : 'Lantern Illustrated Review') : 'Northbound Books'
  return { available, advance: localPrice(g, (f.serial ? 4_000 : f.effort * 1_500) * clamp((w.quality - 35) / 40, .3, 1.6)), share: f.serial ? .45 : .12, label }
}

export function authorSelfPublishCost(g: GameState, w: AuthorWork): number {
  const base = w.format === 'novella' ? 350 : w.format === 'novel' ? 1_500 : w.format === 'saga' ? 4_000 : hasTech(g, 'internet') && w.format === 'manhwa' ? 500 : 900
  return localPrice(g, base)
}

function originScale(w: AuthorWork): number {
  return clamp(getCountry(w.countryId).wealth ?? 1, .35, 1.6)
}

function marketDemand(g: GameState, w: AuthorWork, year: number): number {
  return .7 + stableRoll(g, `author.market.${w.genre}.${w.countryId}.${year}`) * .6
}

function launchCopies(g: GameState, p: AuthorProfile, w: AuthorWork): number {
  const reach = .2 + p.reputation / 100 + Math.min(3, p.audience / 150_000)
  return Math.max(0, Math.round(formatDef(w.format).potential * Math.pow(w.quality / 75, 2) * reach
    * (w.publisher ? 1 : .6) * marketDemand(g, w, g.year) * randFloat(g, .7, 1.3)))
}

export function publishAuthorWork(g: GameState, id: string, route: Publishing): void {
  if (careerActionBlock(g) || (route !== 'self' && route !== 'publisher')) return
  const current = authorView(g).works.find((w) => w.id === id && w.stage === 'ready')
  if (!current) return
  const offer = authorPublisherOffer(g, current)
  if (route === 'publisher') {
    if (!useYearAction(g, `author.pitch.${id}`, 1)) return notice(g, 'Already Pitched', 'You already approached publishers about this work this year.', { emoji: '📨' })
    if (!offer.available) return notice(g, 'Publishers Passed', 'No publisher offered a contract this year. Your manuscript is still yours: revise it, self-publish, or pitch again next year.', { emoji: '📨' })
  }
  const cost = route === 'self' ? authorSelfPublishCost(g, current) : 0
  if (cost > 0 && !spend(g, cost, 'purchase')) return notice(g, 'Publishing Costs', `You need ${money(cost)} for editing, production, and distribution. A publisher can cover these costs if it accepts your work.`, { emoji: '📖' })
  const p = authorMut(g), w = p.works.find((x) => x.id === id)!
  const f = formatDef(w.format)
  w.stage = f.serial ? 'serial' : 'published'
  w.released = g.year
  w.publisher = route === 'publisher' ? offer.label : ''
  w.share = route === 'publisher' ? offer.share : .7
  w.recoup = route === 'publisher' ? offer.advance : 0
  w.spent += cost
  w.tail = f.serial ? 0 : launchCopies(g, p, w)
  if (route === 'publisher') {
    earnIncome(g, offer.advance, 'royalty')
    w.earned += offer.advance
  }
  if (f.serial) w.readers = Math.max(50, Math.round(launchCopies(g, p, w) * .15))
  count(g, 'authorPublications')
  count(g, 'books')
  saveAuthor(g, p)
  log(g, `I published "${w.title}"${f.serial ? ' as a continuing comic series' : ''}.`, 'good')
  remember(g, `Published ${formatDef(w.format).label.toLowerCase()} "${w.title}".`)
  notice(g, f.serial ? 'Your Series Is Live' : 'Published!', `${w.title} is ${route === 'publisher' ? `with ${offer.label}. Your ${money(offer.advance)} advance is recouped from your ${Math.round(w.share * 100)}% royalties before further payments` : `self-published (${money(cost)} paid; you keep 70% of reader sales)`}. You retain the story IP. Sales and serial income settle when you age up; no guaranteed bestseller.`, { emoji: f.emoji, tone: 'good' })
}

function serialAction(g: GameState, id: string): { p: AuthorProfile; w: AuthorWork } | null {
  if (careerActionBlock(g)) return null
  const p = authorMut(g), w = p.works.find((x) => x.id === id && x.stage === 'serial')
  return w ? { p, w } : null
}

export function setAuthorFocus(g: GameState, id: string, focus: ChapterFocus): void {
  if (!isChapterFocus(focus)) return
  const found = serialAction(g, id)
  if (!found) return
  found.w.focus = focus
  saveAuthor(g, found.p)
  notice(g, 'Next Story Arc', `${found.w.title}: ${focus === 'payoff' ? 'answer open questions and pay off a story arc' : focus === 'cliffhanger' ? 'a new cliffhanger—remember to repay the story debt' : focus === 'world' ? 'explore the world' : 'develop the characters'}. This choice applies to the next year of chapters.`, { emoji: '🧭' })
}

export function setAuthorPace(g: GameState, id: string, pace: ReleasePace): void {
  if (!isReleasePace(pace)) return
  const found = serialAction(g, id)
  if (!found) return
  found.w.pace = pace
  saveAuthor(g, found.p)
  notice(g, 'Release Schedule', `${found.w.title}: ${pace} pace for next year's chapters. Crunch adds chapters but increases burnout; careful pacing protects your craft.`, { emoji: '📅' })
}

export function toggleAuthorHiatus(g: GameState, id: string): void {
  const found = serialAction(g, id)
  if (!found) return
  found.w.hiatus = !found.w.hiatus
  if (found.w.hiatus) found.w.hiatuses += 1
  saveAuthor(g, found.p)
  notice(g, found.w.hiatus ? 'Planned Hiatus' : 'Series Resumed', found.w.hiatus ? 'Your readers have been told to expect a break. You recover from burnout, but readership can slip. Existing collected volumes keep selling.' : 'Your release schedule will resume next year. Give readers a reason to return.', { emoji: '☕' })
}

export function endAuthorSeries(g: GameState, id: string): void {
  const found = serialAction(g, id)
  if (!found) return
  const { p, w } = found
  if (w.chapters < 12) return notice(g, 'Too Early to End', 'Publish at least 12 chapters before planning the final ending.', { emoji: '📖' })
  const satisfying = w.hooks <= 30 && w.trust >= 55
  w.stage = 'ended'
  w.hiatus = false
  w.quality = clamp(w.quality + (satisfying ? 4 : -10), 5, 99)
  p.reputation = clamp(p.reputation + (satisfying ? 6 : -8))
  if (satisfying) { w.arcs += 1; w.hooks = 0 }
  saveAuthor(g, p)
  log(g, `I ended "${w.title}"${satisfying ? ' with a satisfying finale' : ' with loose threads still hanging'}.`, satisfying ? 'good' : 'neutral')
  notice(g, satisfying ? 'An Ending Worth Waiting For' : 'A Divisive Finale', satisfying ? 'You gave readers a real ending. The completed series can keep finding readers and earning volume royalties.' : 'Readers noticed the unanswered questions. Your reputation suffered, but the completed volumes remain on sale.', { emoji: '📚' })
}

export function abandonAuthorWork(g: GameState, id: string): void {
  if (careerActionBlock(g)) return
  const p = authorMut(g), w = p.works.find((x) => x.id === id && (x.stage === 'draft' || x.stage === 'ready'))
  if (!w) return
  p.works = p.works.filter((x) => x.id !== id)
  saveAuthor(g, p)
  notice(g, 'Manuscript Shelved', `${w.title} was shelved. Practice remains, but this year's writing sessions and new-project slot are not refunded.`, { emoji: '📁' })
}

/** No studio pays more than this for one story, in local terms of the year: a signing fee, then a yearly royalty. */
function adaptationFeeCap(g: GameState, w: AuthorWork): number { return 150 * typicalIncome(g, w.countryId) }
function adaptationYearCap(g: GameState, w: AuthorWork): number { return 15 * typicalIncome(g, w.countryId) }

export function authorAdaptationOffer(g: GameState, w: AuthorWork): { available: boolean; fee: number; annual: number; years: number; label: string } {
  const reach = Math.max(w.copies, w.readers)
  return {
    available: releasedWork(w) && w.released <= g.year && w.quality >= 80 && reach >= 10_000 && w.adaptedUntil === 0,
    fee: Math.min(adaptationFeeCap(g, w), Math.round((15_000 + Math.min(5_000_000, reach) * 1.5) * originScale(w))),
    annual: Math.min(adaptationYearCap(g, w), Math.round((2_000 + Math.min(5_000_000, reach) * .15) * originScale(w))),
    years: 5,
    label: formatDef(w.format).serial ? 'Animated adaptation license' : 'Screen adaptation license',
  }
}

export function licenseAuthorAdaptation(g: GameState, id: string): void {
  if (blocked(g, 16)) return
  const current = authorView(g).works.find((x) => x.id === id)
  if (!current) return
  const offer = authorAdaptationOffer(g, current)
  if (!offer.available) return notice(g, 'Adaptation Rights', 'A work needs quality 80 and at least 10,000 copies or readers. Each work can receive one five-year adaptation license; you keep the original story rights.', { emoji: '🎬' })
  const p = authorMut(g), w = p.works.find((x) => x.id === id)!
  w.adaptedUntil = g.year + offer.years - 1
  w.adaptationBase = offer.annual
  w.adaptationEarned += offer.fee
  w.earned += offer.fee
  earnIncome(g, offer.fee, 'royalty')
  saveAuthor(g, p)
  count(g, 'authorAdaptations')
  notice(g, 'Adaptation Licensed', `${w.title}: ${money(offer.fee)} signing fee plus up to five annual royalty payments, based on adaptation performance. This is a five-year license, not a sale of your story IP.`, { emoji: '🎬', tone: 'good' })
}

export function quitAuthorCareer(g: GameState): void {
  if (blocked(g) || !myJob(g, AUTHOR_JOB)) return
  endJob(g, 'job', 'quit')
  log(g, 'I stepped away from full-time writing.')
  notice(g, 'Writing Desk Closed', 'Your catalog and royalty contracts remain yours. New manuscripts and chapters stop until you resume the Author career; published books and volumes can keep selling.', { emoji: '✍️' })
}

/** Royalty receipts pay down an advance first. The advance itself was paid only on signing. */
function settleReceipts(g: GameState, w: AuthorWork, gross: number): number {
  const receipts = Math.max(0, Math.round(gross))
  const royalty = Math.round(receipts * w.share)
  const recoup = Math.min(w.recoup, royalty)
  w.recoup = Math.max(0, w.recoup - recoup)
  const paid = royalty - recoup
  w.gross += receipts
  w.earned += paid
  if (paid > 0) earnIncome(g, paid, 'royalty')
  return paid
}

/** A year's creative choices can buy curiosity, or earn trust; they are not interchangeable. */
function serialYear(g: GameState, p: AuthorProfile, w: AuthorWork, year: number): { gross: number; copies: number; line: string } {
  const planned = w.pace === 'crunch' ? 40 : w.pace === 'careful' ? 12 : 24
  const missed = p.burnout >= 75
  const chapters = Math.max(1, Math.floor(planned * (missed ? .6 : 1)))
  const previousChapters = w.chapters
  let trust = w.focus === 'characters' ? (w.promise === 'characters' ? 8 : 3)
    : w.focus === 'world' ? (w.promise === 'spectacle' ? 7 : 2)
    : w.focus === 'cliffhanger' ? -5 : w.hooks > 0 ? (w.promise === 'mystery' ? 14 : 10) : 1
  if (w.focus === 'payoff') {
    if (w.hooks > 0) w.arcs += 1
    w.hooks = Math.max(0, w.hooks - 30)
  } else w.hooks = clamp(w.hooks + (w.focus === 'cliffhanger' ? 20 : w.focus === 'world' ? 6 : 2))
  trust -= Math.max(0, w.hooks - 35) * .16 + (missed ? 6 : 0)
  w.trust = clamp(w.trust + trust)
  const target = clamp(craftQuality(g, p, w) + (w.pace === 'careful' ? 5 : w.pace === 'crunch' ? -7 : 0) - Math.max(0, w.hooks - 50) * .12, 5, 98)
  w.quality = clamp(w.quality + (target - w.quality) * .35, 5, 98)
  w.chapters += chapters
  p.burnout = clamp(p.burnout + (w.pace === 'crunch' ? 18 : w.pace === 'careful' ? -8 : 3))
  if (w.pace === 'crunch' && p.burnout >= 70) addStat(g, 'health', -2)
  trainCraft(g, 'writing', 1)
  trainCraft(g, 'art', 1)
  const f = formatDef(w.format)
  const potential = f.potential * Math.pow(w.quality / 75, 2) * (.25 + p.reputation / 100 + Math.min(3, p.audience / 120_000))
  const curiosity = w.focus === 'cliffhanger' ? 1.35 : 1
  const loyal = .15 + w.trust / 100
  const targetReaders = potential * curiosity * loyal * marketDemand(g, w, year) * (w.publisher ? 1.2 : .8)
  w.readers = Math.max(0, Math.round((w.readers * .45 + targetReaders * .55) * randFloat(g, .9, 1.1)))
  const volumes = Math.floor(w.chapters / 8) - Math.floor(previousChapters / 8)
  w.volumes += volumes
  const copies = Math.max(0, Math.round(w.readers * .12 * volumes * (.6 + w.trust / 100)))
  // Manga's magazine/collected-volume economy differs from color-scroll episode payments.
  // Before internet access, manhwa is also printed: no anachronistic webtoon platform.
  const digital = w.format === 'manhwa' && hasTech(g, 'internet', year)
  const episodeGross = w.readers * chapters * (digital ? .08 : .035) * originScale(w)
  const gross = episodeGross + copies * f.price * originScale(w)
  p.reputation = clamp(p.reputation + (w.quality * .6 + w.trust * .4 - 60) / 18)
  if (w.trust < 15 && w.chapters >= 24 && w.publisher) {
    w.stage = 'ended'
    w.hiatus = false
    p.reputation = clamp(p.reputation - 5)
  }
  return { gross, copies, line: `${w.title}: ${chapters} ${digital ? 'episodes' : 'chapters'}, ${w.readers.toLocaleString('en-US')} readers, trust ${Math.round(w.trust)}%, story debt ${Math.round(w.hooks)}${missed ? '; burnout caused missed deadlines' : ''}${w.stage === 'ended' ? '; the publisher ended its run after readers lost trust' : ''}.` }
}

/** One completed fiscal year. Royalties remain payable after quitting or going to prison. */
export function yearlyAuthor(g: GameState): void {
  if (!g.character.alive) return
  const view = authorView(g)
  const job = myJob(g, AUTHOR_JOB)
  if (!job && !view.works.length) return
  const year = g.year - 1
  if (year <= view.lastYear) {
    if (year === view.lastYear) return
    // A malformed future marker used to freeze royalties and serial production forever.
    // Roll only the guard back; never backfill or pay more than the current fiscal year.
    const repaired = authorMut(g)
    repaired.lastYear = year - 1
    for (const work of repaired.works) if (work.lastYear > year) work.lastYear = year - 1
    saveAuthor(g, repaired)
  }
  const p = authorMut(g)
  p.lastYear = year
  const working = !!job && !g.character.prison
  let earned = 0
  let newFans = 0
  let produced = false
  const lines: string[] = []
  for (const w of p.works) {
    if (!releasedWork(w) || w.released > year || w.started > year || w.lastYear >= year) continue
    w.lastYear = year
    const f = formatDef(w.format)
    let gross = 0
    let copies = 0
    let activeReaders = 0
    if (w.stage === 'serial') {
      if (working && !w.hiatus) {
        const result = serialYear(g, p, w, year)
        gross += result.gross
        copies += result.copies
        lines.push(result.line)
        produced = true
        activeReaders = w.readers
        newFans += Math.round(w.readers * .04)
      } else {
        w.readers = Math.round(w.readers * (w.hiatus ? .92 : .8))
        w.trust = clamp(w.trust - (w.hiatus ? 1 : 5))
        lines.push(`${w.title}: ${w.hiatus ? 'planned hiatus' : 'no new chapters while away from the writing career'}; collected volumes remain on sale.`)
      }
      const backCatalog = Math.max(0, Math.round(w.tail * randFloat(g, .8, 1.2)))
      copies += backCatalog
      gross += backCatalog * f.price * originScale(w)
      w.tail = Math.round(copies * clamp(.35 + w.quality / 300, .35, .7))
    } else {
      copies = Math.max(0, Math.round(w.tail * marketDemand(g, w, year) * randFloat(g, .85, 1.15)))
      gross += copies * f.price * originScale(w)
      w.tail = Math.round(copies * (w.stage === 'ended' && w.hooks <= 30 ? .7 : .45 + w.quality / 500))
      if (w.released === year) {
        p.reputation = clamp(p.reputation + (w.quality - 55) / 6)
        lines.push(`${w.title}: ${copies.toLocaleString('en-US')} copies in its launch year.`)
      }
      newFans += Math.round(copies * .15)
    }
    w.copies += copies
    earned += settleReceipts(g, w, gross)
    if (w.adaptedUntil > 0 && year >= w.adaptedUntil - 4 && year <= w.adaptedUntil) {
      // An old save may hold a base from before the ceiling; the cap applies at read, to the base and to the roll.
      const cap = adaptationYearCap(g, w)
      const royalties = Math.min(cap, Math.max(0, Math.round(Math.min(w.adaptationBase, cap) * randFloat(g, .5, 1.5))))
      if (royalties > 0) earnIncome(g, royalties, 'royalty')
      earned += royalties
      w.earned += royalties
      w.adaptationEarned += royalties
    }
    // A past bestseller cannot refresh fame forever after its catalogue stops selling.
    const currentReach = Math.max(copies, activeReaders)
    if (currentReach >= 10_000 && w.quality >= 85) {
      addFame(g, Math.min(4, Math.max(1, Math.floor(Math.log10(1 + currentReach) - 3))))
      if (!p.awards.some((x) => x.includes(`"${w.title}"`)) && stableRoll(g, `author.award.${w.id}.${year}`) < .12) {
        const award = `${year} Ink & Imagination Prize — "${w.title}"`
        p.awards.push(award)
        count(g, 'authorAwards')
        lines.push(`🏆 ${award}.`)
      }
    }
  }
  if (!produced) p.burnout = clamp(p.burnout - 12)
  p.audience = Math.max(0, Math.round(p.audience * .97 + newFans))
  if (job) {
    syncTenure(g, job)
    job.salary = earned
    job.performance = Math.round(clamp(35 + p.reputation * .5 + craftSkill(g, 'writing') * .25 - p.burnout * .2))
    job.title = p.reputation >= 75 ? 'Bestselling Author' : p.reputation >= 40 ? 'Published Author' : 'Independent Author'
  }
  saveAuthor(g, p)
  if (earned > 0) log(g, `My writing earned ${money(earned)} in royalties and reader sales.`, 'good')
  if (lines.length || (job && p.works.length)) notice(g, 'Your Writing Year', [...lines, `${year}: ${money(earned)} paid after advance recoup. Reputation ${Math.round(p.reputation)}% · burnout ${Math.round(p.burnout)}%.`].join('\n'), { emoji: '📚', tone: earned > 0 ? 'good' : 'neutral' })
}
