// Special Careers > Author: build a catalogue, or sustain a regional comic
// serial by making a promise to readers and paying off the story's loose ends.
// Menus only read normalized state. Career actions own every mutation and roll.
import { craftSkill } from '../activities/creative'
import { scriptChoice, scriptInput, yearActionsUsed } from '../core'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  AUTHOR_FORMATS, AUTHOR_GENRES, CHAPTER_FOCI, RELEASE_PACES, STORY_PROMISES,
  formatAvailable, formatDef, genreDef, isAuthorFormat, isAuthorGenre,
  isChapterFocus, isReleasePace, isStoryPromise,
  type AuthorFormat,
} from './author-data'
import {
  abandonAuthorWork, authorAdaptationOffer, authorCareerBlock, authorPublisherOffer,
  authorSelfPublishCost, authorWorkBlock, endAuthorSeries, licenseAuthorAdaptation,
  practiceAuthor, publishAuthorWork, quitAuthorCareer, setAuthorFocus, setAuthorPace,
  startAuthorCareer, startAuthorWork, toggleAuthorHiatus,
} from './author-career'
import { AUTHOR_JOB, authorView, type AuthorWork } from './author-state'
import { blocked, compact, money, myJob, tell } from './common'
import { chooseStoryScene, storyDesk, storyFeedback } from './author-story'

export { yearlyAuthor } from './author-career'

const CANCEL = { id: 'cancel', label: 'Never mind', emoji: '✖️' }

function workById(g: GameState, id: string): AuthorWork | undefined {
  return authorView(g).works.find((work) => work.id === id)
}

function workActionBlock(g: GameState, id: string): string | null {
  return blocked(g, 16)
    ?? (!myJob(g, AUTHOR_JOB) ? 'Return to your Author career to manage this work.' : null)
    ?? (!workById(g, id) ? 'This work is no longer in your catalogue.' : null)
}

function creationBlock(g: GameState, format?: AuthorFormat): boolean {
  const reason = authorWorkBlock(g, format)
  if (!reason) return false
  tell(g, 'Create a Story', reason, '✍️')
  return true
}

function record(data: Json | undefined): Record<string, Json> {
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

function formatLabel(g: GameState, format: AuthorFormat): string {
  if (format === 'manhwa' && g.character.countryId !== 'cn') return 'Manhwa'
  return formatDef(format).label
}

function beginWork(g: GameState): void {
  if (creationBlock(g)) return
  scriptChoice(g, FORMAT_SCRIPT, 'Choose Your Format',
    'Books tell a complete story. Manga and manhwa begin with an opening volume, then grow through chapters, reader trust and satisfying story arcs.',
    [...AUTHOR_FORMATS.filter((format) => formatAvailable(g, format.id)).map((format) => ({
      id: format.id,
      label: `${formatLabel(g, format.id)} · writing ${format.minWriting}+${format.minArt ? `, art ${format.minArt}+` : ''}${format.serial ? ' · serialized' : ''}`,
      emoji: format.emoji,
    })), CANCEL], { emoji: '📚' })
}

const FORMAT_SCRIPT = defineScript('author.create.format', (g, choice) => {
  if (choice === 'cancel' || !isAuthorFormat(choice) || creationBlock(g, choice)) return
  scriptChoice(g, GENRE_SCRIPT, 'Choose a Genre',
    `What kind of ${formatLabel(g, choice).toLowerCase()} will you create?`,
    [...AUTHOR_GENRES.map((genre) => ({ id: genre.id, label: genre.label, emoji: genre.emoji })), CANCEL],
    { emoji: formatDef(choice).emoji, data: { format: choice } })
})

const GENRE_SCRIPT = defineScript('author.create.genre', (g, choice, data) => {
  const d = record(data)
  if (choice === 'cancel' || !isAuthorGenre(choice) || !isAuthorFormat(d.format) || creationBlock(g, d.format)) return
  scriptChoice(g, PROMISE_SCRIPT, 'Your Promise to Readers',
    'Choose what makes this story worth following. Your creative decisions should fulfill that promise; endless cliffhangers without answers eventually cost reader trust.',
    [...STORY_PROMISES.map((promise) => ({ id: promise.id, label: `${promise.label} — ${promise.note}` })), CANCEL],
    { emoji: '🤝', data: { format: d.format, genre: choice } })
})

const PROMISE_SCRIPT = defineScript('author.create.promise', (g, choice, data) => {
  const d = record(data)
  if (choice === 'cancel' || !isStoryPromise(choice) || !isAuthorFormat(d.format) || !isAuthorGenre(d.genre) || creationBlock(g, d.format)) return
  scriptInput(g, {
    title: 'Name Your Story', emoji: formatDef(d.format).emoji,
    text: `${formatLabel(g, d.format)} · ${genreDef(d.genre).label}. You can develop one story at a time; drafting and revision share two work sessions each year.`,
    input: 'text', placeholder: 'Story title', defaultValue: `Untitled ${formatLabel(g, d.format)}`,
    scriptId: NAME_SCRIPT, data: { format: d.format, genre: d.genre, promise: choice },
  })
})

const NAME_SCRIPT = defineScript('author.create.name', (g, title, data) => {
  const d = record(data)
  if (!isAuthorFormat(d.format) || !isAuthorGenre(d.genre) || !isStoryPromise(d.promise) || creationBlock(g, d.format)) return
  const clean = title.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) return tell(g, 'Story Title', 'Your story needs a title. Start again when you have one.', '✍️')
  startAuthorWork(g, { format: d.format, genre: d.genre, promise: d.promise, title: clean })
})

const FOCUS_SCRIPT = defineScript('author.work.focus', (g, choice, data) => {
  const id = record(data).id
  if (choice === 'cancel' || typeof id !== 'string' || !isChapterFocus(choice) || workActionBlock(g, id)) return
  setAuthorFocus(g, id, choice)
})

const PACE_SCRIPT = defineScript('author.work.pace', (g, choice, data) => {
  const id = record(data).id
  if (choice === 'cancel' || typeof id !== 'string' || !isReleasePace(choice) || workActionBlock(g, id)) return
  setAuthorPace(g, id, choice)
})

function workSummary(work: AuthorWork): string {
  const format = formatDef(work.format)
  const promise = STORY_PROMISES.find((x) => x.id === work.promise)!
  const lines = [`${format.label} · ${genreDef(work.genre).label} · quality ${Math.round(work.quality)}/100`,
    `Reader promise: ${promise.label}.`]
  if (work.stage === 'draft' || work.stage === 'ready') {
    lines.push(`Manuscript ${Math.round(work.progress)}% complete${work.stage === 'ready' ? ' · ready to publish (or revise)' : ''}.`)
  } else if (format.serial) {
    lines.push(`${compact(work.chapters)} chapters · ${compact(work.readers)} current readers · trust ${Math.floor(work.trust)}/100`,
      `Story debt ${Math.round(work.hooks)}/100 · ${work.arcs} resolved arc${work.arcs === 1 ? '' : 's'} · ${work.volumes} collected volume${work.volumes === 1 ? '' : 's'}`)
    if (work.stage === 'serial') lines.push(work.hiatus ? 'On hiatus: no new chapters until you resume.' : 'New chapters arrive when you age up while working as an Author.')
    else lines.push('The series has ended. Collected volumes can still sell.')
  }
  if (work.released) lines.push(`Released ${work.released} · ${compact(work.copies)} copies sold · ${money(work.earned)} author receipts.`)
  if (work.publisher) lines.push(`${work.publisher} · ${Math.round(work.share * 100)}% author royalties${work.recoup > 0 ? ` · ${money(work.recoup)} advance still to recoup before more royalty payments` : ' · advance recouped'}.`)
  else if (work.released) lines.push('Self-published: you keep the story IP and receive self-publishing receipts.')
  if (work.spent > 0) lines.push(`Publishing costs paid: ${money(work.spent)}.`)
  if (work.adaptedUntil > 0) lines.push(`Adaptation ${work.adaptedUntil >= work.lastYear ? `licensed through ${work.adaptedUntil}` : 'licence completed'} · ${money(work.adaptationEarned)} earned.`)
  return lines.join('\n')
}

function publishBlock(g: GameState, id: string, route: 'self' | 'publisher'): string | null {
  const reason = workActionBlock(g, id)
  if (reason) return reason
  const work = workById(g, id)!
  if (work.stage !== 'ready') return 'Finish the manuscript before publishing.'
  if (route === 'self') {
    const cost = authorSelfPublishCost(g, work)
    return g.character.money < cost ? `Self-publication costs ${money(cost)}.` : null
  }
  if (yearActionsUsed(g, `author.pitch.${id}`) >= 1) return 'You already pitched this work this year. Try again next year or self-publish.'
  return authorPublisherOffer(g, work).available ? null : 'No publisher is offering a deal this year. Revise, self-publish, or try next year.'
}

function draftActions(g: GameState, work: AuthorWork): MenuNode[] {
  const id = work.id
  const selfCost = authorSelfPublishCost(g, work)
  const offer = authorPublisherOffer(g, work)
  const nodes: MenuNode[] = [{
    type: 'action', id: `author.work.${id}.write`, label: work.stage === 'ready' ? 'Revise a Key Scene' : formatDef(work.format).serial ? 'Storyboard the Next Chapter' : 'Write the Next Scene', emoji: '✍️',
    subtitle: `${yearActionsUsed(g, 'author.write')}/2 work sessions used this year · ${Math.round(work.progress)}% complete`,
    disabledReason: (gg) => workActionBlock(gg, id) ?? (yearActionsUsed(gg, 'author.write') >= 2 ? 'You used both writing and revision sessions this year.' : null),
    run: (gg) => chooseStoryScene(gg, id),
  }]
  if (work.stage === 'ready') nodes.push({
    type: 'action', id: `author.work.${id}.publish.self`, label: formatDef(work.format).serial ? 'Self-Publish the Series' : 'Self-Publish', emoji: '📦',
    subtitle: `${money(selfCost)} upfront · keep your IP · build your own audience`,
    disabledReason: (gg) => publishBlock(gg, id, 'self'),
    confirm: (gg) => {
      const current = workById(gg, id)
      return current ? `Spend ${money(authorSelfPublishCost(gg, current))} to self-publish "${current.title}"? You keep the story IP.${formatDef(current.format).serial ? ' New chapters will follow your chosen focus and pace when you age up.' : ''}` : null
    },
    run: (gg) => publishAuthorWork(gg, id, 'self'),
  }, {
    type: 'action', id: `author.work.${id}.publish.publisher`, label: 'Sign a Publisher Deal', emoji: '🤝',
    subtitle: offer.available ? `${offer.label} · ${money(offer.advance)} advance · ${Math.round(offer.share * 100)}% royalties` : 'No offer this year · improve the manuscript or self-publish',
    disabledReason: (gg) => publishBlock(gg, id, 'publisher'),
    confirm: (gg) => {
      const current = workById(gg, id)
      if (!current) return null
      const deal = authorPublisherOffer(gg, current)
      return `Publish "${current.title}" with ${deal.label}? Receive ${money(deal.advance)} now and earn ${Math.round(deal.share * 100)}% author royalties. Future author royalties first repay this advance; you keep the underlying story IP.`
    },
    run: (gg) => publishAuthorWork(gg, id, 'publisher'),
  })
  nodes.push({
    type: 'action', id: `author.work.${id}.abandon`, label: 'Abandon This Manuscript', emoji: '🗑️',
    subtitle: 'Discard the draft and free your active-project slot',
    disabledReason: (gg) => workActionBlock(gg, id),
    confirm: (gg) => `Permanently discard "${workById(gg, id)?.title ?? 'this manuscript'}"? This cannot be undone, and it does not restore this year's work sessions or new-story allowance.`,
    run: (gg) => abandonAuthorWork(gg, id),
  })
  return nodes
}

function serialActions(work: AuthorWork): MenuNode[] {
  const id = work.id
  const focus = CHAPTER_FOCI.find((x) => x.id === work.focus)!
  const pace = RELEASE_PACES.find((x) => x.id === work.pace)!
  return [{
    type: 'action', id: `author.work.${id}.focus`, label: 'Next Story Arc', emoji: '🧭',
    subtitle: `${focus.label} · ${focus.note}`,
    disabledReason: (g) => workActionBlock(g, id),
    run: (g) => {
      if (workActionBlock(g, id)) return
      scriptChoice(g, FOCUS_SCRIPT, 'Plan the Next Story Arc',
        'Cliffhangers draw attention but create story debt. Character chapters, worldbuilding and genuine payoffs build an audience that trusts you.',
        [...CHAPTER_FOCI.map((x) => ({ id: x.id, label: `${x.label} — ${x.note}` })), CANCEL], { emoji: '🧭', data: { id } })
    },
  }, {
    type: 'action', id: `author.work.${id}.pace`, label: 'Release Schedule', emoji: '📅',
    subtitle: `${pace.label} · ${pace.note}`,
    disabledReason: (g) => workActionBlock(g, id),
    run: (g) => {
      if (workActionBlock(g, id)) return
      scriptChoice(g, PACE_SCRIPT, 'Set Your Release Schedule',
        'Careful: up to 12 chapters/year. Steady: up to 24. Crunch: up to 40, with burnout and quality risks. Chapters arrive on age-up, not when you change this setting.',
        [...RELEASE_PACES.map((x) => ({ id: x.id, label: `${x.label} — ${x.note}` })), CANCEL], { emoji: '📅', data: { id } })
    },
  }, {
    type: 'action', id: `author.work.${id}.hiatus`, label: work.hiatus ? 'Resume Serialization' : 'Take a Hiatus', emoji: work.hiatus ? '▶️' : '⏸️',
    subtitle: work.hiatus ? 'Return to new chapters next age-up' : 'Recover from burnout; some readers may drift away',
    disabledReason: (g) => workActionBlock(g, id), run: (g) => toggleAuthorHiatus(g, id),
  }, {
    type: 'action', id: `author.work.${id}.end`, label: 'Write the Finale', emoji: '🏁',
    subtitle: work.chapters < 12 ? 'Publish at least 12 chapters before ending the series' : `Story debt ${Math.round(work.hooks)}/100 · reader trust ${Math.floor(work.trust)}/100 · collected volumes keep selling`,
    disabledReason: (g) => workActionBlock(g, id) ?? ((workById(g, id)?.chapters ?? 0) < 12 ? 'A series needs at least 12 published chapters before its finale.' : null),
    confirm: (g) => {
      const current = workById(g, id)
      if (!current) return null
      const risky = current.hooks > 30 || current.trust < 55
      return `End "${current.title}" permanently? Story debt ${Math.round(current.hooks)}/100 · reader trust ${Math.floor(current.trust)}/100.${risky ? ' This will be a divisive finale: a satisfying ending needs story debt 30 or lower and reader trust at least 55. Consider resolving an arc or rebuilding trust first.' : ' Your story debt and reader trust support a satisfying finale.'} Your completed story and collected-volume royalties remain in your catalogue.`
    },
    run: (g) => endAuthorSeries(g, id),
  }]
}

function adaptationAction(g: GameState, work: AuthorWork): MenuAction {
  const id = work.id
  const offer = authorAdaptationOffer(g, work)
  return {
    type: 'action', id: `author.work.${id}.adapt`, label: 'License an Adaptation', emoji: '🎬',
    subtitle: work.adaptedUntil > 0 ? `Adaptation deal already signed · ${money(work.adaptationEarned)} earned`
      : offer.available ? `${offer.label} · ${money(offer.fee)} fee + estimated ${money(offer.annual)}/year for ${offer.years} years; varies with performance`
        : 'Quality 80+ and 10,000 copies sold or current readers attract adaptation offers',
    disabledReason: (gg) => {
      const reason = blocked(gg, 16)
      if (reason) return reason
      const current = workById(gg, id)
      if (!current) return 'This work is no longer in your catalogue.'
      if (current.adaptedUntil > 0) return 'This work has already signed its adaptation deal.'
      return authorAdaptationOffer(gg, current).available ? null : 'No adaptation offer is available. Build a high-quality story with a substantial audience.'
    },
    confirm: (gg) => {
      const current = workById(gg, id)
      if (!current) return null
      const deal = authorAdaptationOffer(gg, current)
      return `Sign a ${deal.label.toLowerCase()} for "${current.title}" for ${deal.years} years? Receive ${money(deal.fee)} upfront, plus estimated ${money(deal.annual)} per year during the licence; annual earnings vary with performance. You keep the underlying story IP. Each work can sign one adaptation deal.`
    },
    run: (gg) => licenseAuthorAdaptation(gg, id),
  }
}

function workNode(work: AuthorWork): MenuGroup {
  const id = work.id
  return {
    type: 'menu', id: `author.work.${id}`, label: work.title, emoji: formatDef(work.format).emoji,
    subtitle: `${formatDef(work.format).label} · ${work.stage === 'serial' ? work.hiatus ? 'on hiatus' : `${compact(work.readers)} readers` : work.stage === 'ready' ? 'ready to publish' : work.stage === 'draft' ? `${Math.round(work.progress)}% drafted` : `${compact(work.copies)} copies sold`}`,
    header: (g) => {
      const current = workById(g, id)
      return current ? workSummary(current) : 'This work is no longer in your catalogue.'
    },
    children: (g) => {
      const current = workById(g, id)
      if (!current) return []
      if (current.stage === 'draft' || current.stage === 'ready') return [
        { type: 'info', id: `author.feedback.${id}`, text: storyFeedback(g, current), emoji: '💌' },
        storyDesk(current), ...draftActions(g, current)]
      const nodes: MenuNode[] = current.stage === 'serial' ? serialActions(current) : []
      nodes.unshift({ type: 'info', id: `author.feedback.${id}`, text: storyFeedback(g, current), emoji: '💌' }, storyDesk(current))
      nodes.push(adaptationAction(g, current))
      return nodes
    },
  }
}

const libraryMenu: MenuGroup = {
  type: 'menu', id: 'author.library', label: 'Your Catalogue', emoji: '📚',
  subtitle: (g) => {
    const works = authorView(g).works
    return `${works.filter((work) => ['published', 'ended', 'serial'].includes(work.stage)).length} published works · ${compact(works.reduce((sum, work) => sum + work.copies, 0))} copies sold`
  },
  header: (g) => {
    const p = authorView(g)
    const earned = p.works.reduce((sum, work) => sum + work.earned, 0)
    return `${compact(p.audience)} readers know your name · reputation ${Math.round(p.reputation)}/100 · lifetime author receipts ${money(earned)}${p.awards.length ? `\nAwards: ${p.awards.join(' · ')}` : ''}`
  },
  children: (g) => {
    const works = [...authorView(g).works].sort((a, b) => b.started - a.started || b.id.localeCompare(a.id))
    return works.length ? works.map(workNode) : [{ type: 'info', id: 'author.library.empty', text: 'Your bookshelf is empty. Practice your craft, become an Author, then create your first story.' }]
  },
}

function practiceAction(craft: 'writing' | 'art'): MenuAction {
  return {
    type: 'action', id: `author.practice.${craft}`, label: craft === 'writing' ? 'Practice Writing' : 'Practice Illustration', emoji: craft === 'writing' ? '✍️' : '🎨',
    subtitle: (g) => `${craft === 'writing' ? 'Writing' : 'Art'} skill ${craftSkill(g, craft)}/100 · ${yearActionsUsed(g, 'author.practice')}/3 shared practice sessions this year`,
    disabledReason: (g) => blocked(g, 8) ?? (yearActionsUsed(g, 'author.practice') >= 3 ? 'You used all three author practice sessions this year.' : null),
    run: (g) => practiceAuthor(g, craft),
  }
}

const createAction: MenuAction = {
  type: 'action', id: 'author.create', label: 'Create a New Story', emoji: '📝',
  subtitle: 'Format → genre → promise to readers → title',
  disabledReason: (g) => authorWorkBlock(g), run: beginWork,
}

const quitAction: MenuAction = {
  type: 'action', id: 'author.quit', label: 'Leave the Author Career', emoji: '🚪',
  subtitle: 'Keep your catalogue and royalties; active serials pause',
  disabledReason: (g) => blocked(g) ?? (!myJob(g, AUTHOR_JOB) ? 'You are not currently working as an Author.' : null),
  confirm: () => 'Leave your Author career? Your catalogue and royalties remain yours. Active serialization pauses until you return to the career.',
  run: quitAuthorCareer,
}

/** The current author career's Occupation > My Work actions. */
export function authorJobNodes(g: GameState): MenuNode[] {
  if (!g.character.alive || g.character.prison || !myJob(g, AUTHOR_JOB)) return []
  const p = authorView(g)
  const active = p.works.filter((work) => ['draft', 'ready', 'serial'].includes(work.stage))
  return [{ type: 'info', id: 'author.job.summary', emoji: '✍️',
    text: `Writing ${craftSkill(g, 'writing')}/100 · illustration ${craftSkill(g, 'art')}/100 · reputation ${Math.round(p.reputation)}/100 · burnout ${Math.round(p.burnout)}/100\n${compact(p.audience)} readers know your name. Earnings come from published work, not a guaranteed salary.` },
  ...active.map(workNode), createAction, practiceAction('writing'), practiceAction('art'), libraryMenu, quitAction]
}

export const authorCareerMenu: MenuGroup = {
  type: 'menu', id: 'special.author', label: 'Author & Storyteller', emoji: '✍️',
  visible: (g) => g.character.alive && !g.character.prison,
  subtitle: (g) => myJob(g, AUTHOR_JOB) ? 'Your manuscripts, readers, serials and publishing deals'
    : g.character.countryId === 'jp' ? 'Write books or build a Manga series'
      : ['kr', 'kp', 'cn'].includes(g.character.countryId) ? 'Write books or build a Manhwa series'
        : 'Build a writing career and a catalogue that keeps earning',
  header: (g) => `Writing ${craftSkill(g, 'writing')}/100 · illustration ${craftSkill(g, 'art')}/100. Books are available everywhere; illustrated serials follow local traditions. Start the career at age 16 with writing skill 20.`,
  children: (g) => {
    if (myJob(g, AUTHOR_JOB)) return authorJobNodes(g)
    return [practiceAction('writing'), practiceAction('art'), {
      type: 'action', id: 'author.start', label: 'Become an Author', emoji: '✍️',
      subtitle: 'Age 16+ · writing skill 20+ · no guaranteed salary',
      disabledReason: authorCareerBlock,
      confirm: (gg) => gg.character.job ? `Leave your job as ${gg.character.job.title} to become an Author? You earn through your own work rather than a guaranteed salary.` : null,
      run: startAuthorCareer,
    }, libraryMenu]
  },
}
