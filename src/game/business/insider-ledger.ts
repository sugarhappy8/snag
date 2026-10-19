// The seam between the insider rule of tech waves (business/wave-insider.ts) and the insider cases that special/politics.ts keeps.
//
// This is a LEAF, on purpose: it imports types only. wave-insider.ts sits under tech-waves.ts, and economy.ts reaches that through
// Heavy R&D, so a static import of politics.ts from there put the whole game (politics, the nation code, careers, special, business,
// the conglomerate and manage screens, events) beneath the company economy. Nothing was wrong until module load order mattered: a
// module that entered through competition-events.ts met events.ts spreading COMPETITION_EVENTS before it existed. politics.ts now
// registers itself here when it loads (as it does for the office hooks in nation/office.ts); wave-insider.ts asks for the ledger when
// it runs, so until politics.ts has loaded the rule finds no ledger and opens nothing.
import type { BetTarget } from '../computer/money-stocks'
import type { GameState } from '../types'

export interface InsiderPositions { betIds: string[]; own: number; crony: number; shares: number; index: number; indexUnits: number; cronyName: string }

/** What a launch by the player's own company hands the case helper: the stock, the positions, the sector's step and who the player is there. */
export interface InsiderCaseInput {
  target: BetTarget
  pos: InsiderPositions
  /** The stock's level this year over last year: the gain on plain shares is `shares x (mult - 1)`. */
  mult: number
  /** What the index calls gain from the tilt, already worked out. */
  indexGain: number
  role: 'founder' | 'ceo'
  /** The wave's name. */
  note: string
  /** The company's name. */
  company: string
  /** A stable string for this wave and stock: the case id is `wave-${key}`, so a repeat is the same case. */
  key: string
}

export interface InsiderLedger {
  /** The player's positions that win if the price moves this way (`insiderPositions` in politics.ts). Reads only. */
  positions(g: GameState, t: BetTarget, bearish: boolean, opts: { freshOnly: boolean }): InsiderPositions
  /** Open the case a launch earned on one stock (`openInsiderCase` in politics.ts): false when it opened none. */
  open(g: GameState, input: InsiderCaseInput): boolean
}

let ledger: InsiderLedger | null = null

export function registerInsiderLedger(l: InsiderLedger): void { ledger = l }

/** The registered ledger, or null before special/politics.ts has loaded. */
export function insiderLedger(): InsiderLedger | null { return ledger }
