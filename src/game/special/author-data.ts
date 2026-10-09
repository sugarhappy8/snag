// Fictional publishing-market definitions. Money uses the game's internal dollars;
// the presentation layer converts it into the character's local currency.
import type { GameState } from '../types'

export const AUTHOR_JOB = 'author'

export type AuthorFormat = 'novella' | 'novel' | 'saga' | 'manga' | 'manhwa'
export type AuthorGenre = 'fantasy' | 'mystery' | 'romance' | 'scifi' | 'drama' | 'adventure'
export type StoryPromise = 'characters' | 'mystery' | 'spectacle'
export type ChapterFocus = 'characters' | 'world' | 'cliffhanger' | 'payoff'
export type ReleasePace = 'careful' | 'steady' | 'crunch'
export type Publishing = 'self' | 'publisher'

export interface AuthorFormatDef {
  id: AuthorFormat
  label: string
  emoji: string
  serial: boolean
  /** Creative effort needed for a manuscript or the opening serial volume. */
  effort: number
  /** Cover price of a book or collected serial volume, in internal dollars. */
  price: number
  /** Baseline audience before quality, reputation and market modifiers. */
  potential: number
  minWriting: number
  minArt: number
}

export const AUTHOR_FORMATS: AuthorFormatDef[] = [
  { id: 'novella', label: 'Novella', emoji: '📖', serial: false, effort: 2, price: 5, potential: 6_000, minWriting: 10, minArt: 0 },
  { id: 'novel', label: 'Novel', emoji: '📚', serial: false, effort: 4, price: 12, potential: 24_000, minWriting: 30, minArt: 0 },
  { id: 'saga', label: 'Epic Saga', emoji: '🏰', serial: false, effort: 6, price: 20, potential: 60_000, minWriting: 60, minArt: 0 },
  { id: 'manga', label: 'Manga', emoji: '🖋️', serial: true, effort: 2, price: 6, potential: 30_000, minWriting: 25, minArt: 35 },
  { id: 'manhwa', label: 'Manhwa / Manhua', emoji: '🎨', serial: true, effort: 2, price: 5, potential: 36_000, minWriting: 25, minArt: 35 },
]

export const AUTHOR_GENRES: { id: AuthorGenre; label: string; emoji: string }[] = [
  { id: 'fantasy', label: 'Fantasy', emoji: '🐉' },
  { id: 'mystery', label: 'Mystery', emoji: '🔎' },
  { id: 'romance', label: 'Romance', emoji: '💌' },
  { id: 'scifi', label: 'Science Fiction', emoji: '🚀' },
  { id: 'drama', label: 'Drama', emoji: '🎭' },
  { id: 'adventure', label: 'Adventure', emoji: '🧭' },
]

export const STORY_PROMISES: { id: StoryPromise; label: string; note: string }[] = [
  { id: 'characters', label: 'Characters worth following', note: 'Readers return for relationships and growth. Character chapters keep your promise.' },
  { id: 'mystery', label: 'A mystery worth solving', note: 'Build questions with cliffhangers, then reward readers with real answers.' },
  { id: 'spectacle', label: 'A world worth exploring', note: 'Worldbuilding and satisfying payoffs turn striking ideas into loyal readers.' },
]

export const CHAPTER_FOCI: { id: ChapterFocus; label: string; note: string }[] = [
  { id: 'characters', label: 'Character development', note: 'Deepen relationships and rebuild reader trust.' },
  { id: 'world', label: 'Expand the world', note: 'Explore your setting and lay the groundwork for the next story arc.' },
  { id: 'cliffhanger', label: 'A new cliffhanger', note: 'Attract curious readers, but leave a story debt that needs a payoff.' },
  { id: 'payoff', label: 'Resolve an arc', note: 'Answer open questions and reward readers who stayed with the story.' },
]

export const RELEASE_PACES: { id: ReleasePace; label: string; note: string }[] = [
  { id: 'careful', label: 'Careful', note: 'Fewer chapters, stronger craft and a manageable workload.' },
  { id: 'steady', label: 'Steady', note: 'A sustainable balance between new chapters, quality and audience growth.' },
  { id: 'crunch', label: 'Crunch', note: 'More chapters now, at the cost of burnout and consistency.' },
]

export function isAuthorFormat(value: unknown): value is AuthorFormat {
  return typeof value === 'string' && AUTHOR_FORMATS.some((x) => x.id === value)
}

export function isAuthorGenre(value: unknown): value is AuthorGenre {
  return typeof value === 'string' && AUTHOR_GENRES.some((x) => x.id === value)
}

export function isStoryPromise(value: unknown): value is StoryPromise {
  return typeof value === 'string' && STORY_PROMISES.some((x) => x.id === value)
}

export function isChapterFocus(value: unknown): value is ChapterFocus {
  return typeof value === 'string' && CHAPTER_FOCI.some((x) => x.id === value)
}

export function isReleasePace(value: unknown): value is ReleasePace {
  return typeof value === 'string' && RELEASE_PACES.some((x) => x.id === value)
}

export function formatDef(id: AuthorFormat): AuthorFormatDef {
  return AUTHOR_FORMATS.find((x) => x.id === id) ?? AUTHOR_FORMATS[0]
}

export function genreDef(id: AuthorGenre): (typeof AUTHOR_GENRES)[number] {
  return AUTHOR_GENRES.find((x) => x.id === id) ?? AUTHOR_GENRES[0]
}

/** Regional tradition gates new work; a published catalogue survives emigration. */
export function formatAvailable(g: GameState, format: AuthorFormat): boolean {
  if (format === 'manga') return g.character.countryId === 'jp'
  if (format === 'manhwa') return ['kr', 'kp', 'cn'].includes(g.character.countryId)
  return true
}
