// Player-facing settings, persisted in localStorage separately from saves: how money is shown,
// the Time Machine's Sandbox switch and Quiet Mode (routine notices wait in the inbox).
//
// The money display (local currency or US dollars, prices of the year or today's money) is
// applied to the engine's formatter (core.ts setMoneyDisplay) whenever settings are loaded or
// saved. Importing this module also installs the currency converter (game/data/currencies.ts).
//
// Privacy: earlier versions stored AI-provider settings here (provider, server URLs, API keys,
// model names). Loading drops every field this version doesn't know and rewrites the stored copy,
// so those keys are deleted from the browser the first time this version starts.
import { setMoneyDisplay } from './game/core'
import './game/data/currencies'

/** 'local': the currency where the character lives (yen in Japan); 'usd': US dollars everywhere. */
export type MoneySetting = 'local' | 'usd'
/** 'nominal': prices as they were in the year being lived (a 1980 salary in 1980 money); 'today': today's money. */
export type PricesSetting = 'nominal' | 'today'

export interface Settings {
  /** Which currency money is shown in. */
  money: MoneySetting
  /** Whether amounts are in the money of the year being lived or in today's money. */
  prices: PricesSetting
  /** Sandbox: unlimited Time Machine jumps. */
  sandboxTimeMachine: boolean
  /** Quiet Mode: routine notices wait in the inbox instead of popping up. On for everyone; it only acts while FLAGS.quietInbox is on. */
  quietMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  money: 'local',
  prices: 'nominal',
  sandboxTimeMachine: false,
  quietMode: true,
}

// ---------------------------------------------------------------------------
// Persistence

export const SETTINGS_KEY = 'anotherlife.settings.v1'

const MONEY_SETTINGS: readonly MoneySetting[] = ['local', 'usd']
const PRICES_SETTINGS: readonly PricesSetting[] = ['nominal', 'today']

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}
function oneOf<T extends string>(v: unknown, list: readonly T[], def: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def
}

/**
 * Turn whatever was saved (any older shape, or junk) into valid Settings. Only known fields are
 * kept: the AI-provider settings of older versions (provider, URLs, API keys, models, narration
 * level...) are dropped.
 */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  if (!isObj(raw)) return { ...d }
  return {
    money: oneOf(raw.money, MONEY_SETTINGS, d.money),
    prices: oneOf(raw.prices, PRICES_SETTINGS, d.prices),
    sandboxTimeMachine: bool(raw.sandboxTimeMachine, d.sandboxTimeMachine),
    quietMode: bool(raw.quietMode, d.quietMode),
  }
}

/** Whether Quiet Mode is on: anything but a stored false (a missing or damaged value means on). */
export function quietModeOn(s: { quietMode?: boolean } | null | undefined): boolean {
  return s?.quietMode !== false
}

/** Make the engine's money formatting follow these settings (currency and year prices). */
export function applyMoneySettings(s: Pick<Settings, 'money' | 'prices'>): void {
  setMoneyDisplay({ mode: s.money === 'usd' ? 'usd' : 'local', nominal: s.prices !== 'today' })
}

/**
 * Read the settings and apply the money display. When the stored copy holds anything beyond the
 * current fields (an old API key, provider URLs, models...) or can't be read, it is rewritten
 * with just the clean settings, so nothing from the old AI setup stays in this browser.
 */
export function loadSettings(): Settings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SETTINGS_KEY)
  } catch {
    raw = null
  }
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  const s = normalizeSettings(parsed)
  if (raw !== null && raw !== JSON.stringify(s)) purgeStoredSettings(s)
  applyMoneySettings(s)
  return s
}

/** Replace the stored settings with `s`; if storage refuses the write, remove the old copy. */
function purgeStoredSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch {
      // storage blocked: nothing we can do
    }
  }
}

export function saveSettings(s: Settings): void {
  applyMoneySettings(s)
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s)))
  } catch {
    // storage full or blocked: settings just won't persist
  }
}
