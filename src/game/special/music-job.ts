// The Musician's profile and job record: types, normalizers, readers and the one deal-signing body.
// A pure move out of music.ts (so no new music module ever has to import music.ts), plus signDeal, which
// the legacy contract script and the label negotiation share. This file imports only music-data among the
// music files.
import { addStat } from '../core'
import { hasTalent } from '../talents'
import type { GameState, Job, Json } from '../types'
import { addFame, clamp100, hire, instrumentSkill, myJob, peek, prof, setRole, stableChoice, view } from './common'
import { GENRES } from './music-data'

export interface Release {
  title: string
  type: string
  genre: string
  subgenre: string
  age: number
  sold: number
  earned: number
  cert: string | null
  quality: number
  royalty: number
}

export interface MusicProfile {
  stageName: string | null
  discography: Release[]
  burnedLabels: string[]
  awards: string[]
  tours: number
  concerts: number
}

export interface MusicJob {
  mode: 'solo' | 'band'
  instrument: string
  genre: string
  label: string | null
  contractYears: number
  advancePerYear: number
  popularity: number
  bandName: string | null
  bandmates: string[]
  members: number
  recordedAge: number
  lastRelease: number
}

export interface ContractOffer {
  instrument: string
  label: string
  tier: number
  genre: string
  advance: number
  years: number
}

export const initMusic = (): MusicProfile => ({ stageName: null, discography: [], burnedLabels: [], awards: [], tours: 0, concerts: 0 })

export function musicNumber(value: unknown, fallback = 0, lo = 0, hi = 1e12): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, Math.round(value))) : fallback
}

export function musicText(value: unknown, fallback: string, max = 100): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback : fallback
}

export function normalizedMusic(value: unknown): MusicProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initMusic()
  const raw = value as Partial<MusicProfile>
  const discography: Release[] = []
  if (Array.isArray(raw.discography)) for (const value of raw.discography.slice(-512)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const release = value as Partial<Release>
    discography.push({
      title: musicText(release.title, 'Untitled'),
      type: musicText(release.type, 'Studio Album', 40),
      genre: musicText(release.genre, 'Pop', 40),
      subgenre: musicText(release.subgenre, 'Pop', 60),
      age: musicNumber(release.age, 0, 0, 10_000),
      sold: musicNumber(release.sold),
      earned: musicNumber(release.earned),
      cert: typeof release.cert === 'string' ? musicText(release.cert, '', 40) || null : null,
      quality: musicNumber(release.quality, 0, 0, 100),
      royalty: musicNumber(release.royalty),
    })
  }
  const strings = (input: unknown): string[] => Array.isArray(input)
    ? [...new Set(input.filter((x): x is string => typeof x === 'string').map((x) => musicText(x, '', 120)).filter(Boolean))].slice(-256)
    : []
  return {
    stageName: typeof raw.stageName === 'string' ? musicText(raw.stageName, '', 80) || null : null,
    discography,
    burnedLabels: strings(raw.burnedLabels),
    awards: strings(raw.awards),
    tours: musicNumber(raw.tours, 0, 0, 1e9),
    concerts: musicNumber(raw.concerts, 0, 0, 1e9),
  }
}

export function musicProfile(g: GameState): MusicProfile {
  const p = prof(g, 'music', initMusic)
  Object.assign(p, normalizedMusic(p))
  return p
}

export function viewMusic(g: GameState): MusicProfile {
  return normalizedMusic(peek<MusicProfile>(g, 'music'))
}

export function musicJob(g: GameState): Job | null {
  return myJob(g, 'musician')
}

/** The musician's job record, normalized, without touching the job: safe in menus (renders are pure). */
export function mdView(job: Job): MusicJob {
  const raw = view<Partial<MusicJob>>(job.data)
  const normalized: MusicJob = {
    mode: raw.mode === 'band' ? 'band' : 'solo',
    instrument: musicText(raw.instrument, 'Voice', 40),
    genre: typeof raw.genre === 'string' && GENRES[raw.genre] ? raw.genre : 'Pop',
    label: typeof raw.label === 'string' ? musicText(raw.label, '', 80) || null : null,
    contractYears: musicNumber(raw.contractYears, 0, 0, 100),
    advancePerYear: musicNumber(raw.advancePerYear),
    popularity: musicNumber(raw.popularity, 0, 0, 100),
    bandName: typeof raw.bandName === 'string' ? musicText(raw.bandName, '', 80) || null : null,
    bandmates: Array.isArray(raw.bandmates) ? [...new Set(raw.bandmates.filter((x): x is string => typeof x === 'string').map((x) => musicText(x, '', 120)).filter(Boolean))].slice(0, 100) : [],
    members: musicNumber(raw.members, 1, 1, 100),
    recordedAge: musicNumber(raw.recordedAge, -1, -1, 10_000),
    lastRelease: musicNumber(raw.lastRelease, -1, -1, 10_000),
  }
  return normalized
}

/** The musician's job record, normalized in place so actions and hooks can update it. */
export function md(job: Job): MusicJob {
  Object.assign(job.data, mdView(job))
  return view<MusicJob>(job.data)
}

export function artistName(g: GameState): string {
  const p = viewMusic(g)
  return p.stageName ?? `${g.character.firstName} ${g.character.lastName}`
}

export function musicTalent(g: GameState): boolean {
  return hasTalent(g, 'Music')
}

export function effectiveSkill(g: GameState, instrument: string): number {
  return clamp100(instrumentSkill(g, instrument) + (musicTalent(g) ? 8 : 0))
}

/** The subgenre that's about to blow up this year (stable; Music talent sees it as a hint). */
export function trendingSubgenre(g: GameState, genre: string): string {
  return stableChoice(g, `music.trend.${genre}`, GENRES[genre] ?? GENRES.Pop)
}

export function removeBand(g: GameState, job: Job): void {
  const d = md(job)
  g.people = g.people.filter((p) => !(d.bandmates.includes(p.id) && p.relation === 'coworker'))
  d.bandmates = []
}

/**
 * The body of the contract accept, shared by the legacy script and the label negotiation. A band member
 * goes solo (the band is removed and the job rewritten in place) and anyone else is hired as a solo artist
 * with the offer's popularity and fame. It writes no log, no memory and no notice, so each caller keeps
 * its own text; `data` is applied to the job record last.
 */
export function signDeal(g: GameState, offer: ContractOffer, data: Partial<MusicJob> = {}): { job: Job; quit: string | null; fromBand: boolean } {
  const existing = musicJob(g)
  const perYear = Math.round(offer.advance / offer.years)
  let job: Job
  let quit: string | null = null
  if (existing) {
    // Going solo from a band.
    job = existing
    const d = md(existing)
    removeBand(g, existing)
    d.mode = 'solo'
    d.label = offer.label
    d.contractYears = offer.years
    d.advancePerYear = perYear
    d.genre = offer.genre
    d.instrument = offer.instrument
    d.bandName = null
    d.members = 1
    existing.company = offer.label
    setRole(g, existing, 'Solo Artist', perYear, 1)
  } else {
    const hired = hire(g, {
      defId: 'musician',
      title: 'Solo Artist',
      company: offer.label,
      salary: perYear,
      data: {
        mode: 'solo',
        instrument: offer.instrument,
        genre: offer.genre,
        label: offer.label,
        contractYears: offer.years,
        advancePerYear: perYear,
        popularity: 10 + offer.tier * 5,
        bandName: null,
        bandmates: [],
        members: 1,
        recordedAge: -1,
        lastRelease: -1,
      },
    })
    job = hired.job
    quit = hired.quit
    addFame(g, 5 + offer.tier * 3)
    addStat(g, 'happiness', 15)
  }
  for (const [key, value] of Object.entries(data)) if (value !== undefined) job.data[key] = value as Json
  return { job, quit, fromBand: !!existing }
}
