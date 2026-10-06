// Player-facing settings, persisted in localStorage separately from saves.
//
// API keys live only here (this browser's localStorage) and are sent only to the provider
// they belong to.
//
// The money display (local currency or US dollars, prices of the year or today's money) is
// applied to the engine's formatter (core.ts setMoneyDisplay) whenever settings are loaded or
// saved. Importing this module also installs the currency converter (game/data/currencies.ts).
import { setMoneyDisplay } from './game/core'
import './game/data/currencies'
import {
  defaultBaseUrlFor,
  getProvider,
  guessProviderFromUrl,
  HAS_DEV_PROXY,
  isProviderId,
  LMSTUDIO_DIRECT_URL,
  LMSTUDIO_PROXY_URL,
  type ProviderId,
} from './ai/providers'

// Kept here so existing `import { HAS_DEV_PROXY, ... } from '../settings'` keeps working.
export { HAS_DEV_PROXY, LMSTUDIO_DIRECT_URL, LMSTUDIO_PROXY_URL }
export type { ProviderId }

export type AiLevel = 'off' | 'balanced' | 'full'
export type ContentRating = 'family' | 'teen' | 'mature'
/** 'local': the currency where the character lives (yen in Japan); 'usd': US dollars everywhere. */
export type MoneySetting = 'local' | 'usd'
/** 'nominal': prices as they were in the year being lived (a 1980 salary in 1980 money); 'today': today's money. */
export type PricesSetting = 'nominal' | 'today'

/** Connection details remembered per provider, so switching back and forth keeps them. */
export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  /**
   * off: fully offline (built-in event library only).
   * balanced: AI writes yearly events, choice outcomes, conversations, interviews, custom actions, obituaries.
   * full: also rewrites every activity result in its own words (slower).
   */
  aiLevel: AiLevel
  /** Which AI the story comes from (see src/ai/providers.ts). */
  provider: ProviderId
  /** False until the player finishes (or skips) the first-run "Choose your AI" screen. */
  setupDone: boolean
  /** Saved URL/key/model of providers other than the active one. */
  providerConfigs: Partial<Record<ProviderId, ProviderConfig>>
  /**
   * The ACTIVE provider's base URL. LM Studio on the hosted site is http://localhost:1234/v1
   * (needs "Enable CORS"); under `npm run dev` it is '/lmstudio/v1', which the Vite dev server
   * proxies to LM Studio (no CORS needed). Cloud providers use their API URL.
   */
  baseUrl: string
  /** The active provider's model id; '' picks one automatically (the loaded one for local servers). */
  model: string
  /** The active provider's API key (cloud) or optional token (local servers). */
  apiKey: string
  temperature: number
  maxTokens: number
  timeoutSec: number
  /** Ask for structured JSON output (json_schema). Turn off for models/backends that reject it. */
  structuredOutput: boolean
  /** Ask local reasoning models to skip their thinking phase for speed. */
  disableThinking: boolean
  contentRating: ContentRating
  /** Show the little AI sparkle on AI-written log lines. */
  showAiBadges: boolean
  /** Which currency money is shown in. */
  money: MoneySetting
  /** Whether amounts are in the money of the year being lived or in today's money. */
  prices: PricesSetting
}

export const DEFAULT_SETTINGS: Settings = {
  aiLevel: 'balanced',
  provider: 'lmstudio',
  setupDone: false,
  providerConfigs: {},
  baseUrl: HAS_DEV_PROXY ? LMSTUDIO_PROXY_URL : LMSTUDIO_DIRECT_URL,
  model: '',
  apiKey: '',
  temperature: 0.9,
  maxTokens: 900,
  timeoutSec: 120,
  structuredOutput: true,
  disableThinking: true,
  contentRating: 'teen',
  showAiBadges: true,
  money: 'local',
  prices: 'nominal',
}

/** A fresh config for a provider: its default URL and model, no key. */
export function providerDefaults(id: ProviderId): ProviderConfig {
  const def = getProvider(id)
  return { baseUrl: defaultBaseUrlFor(def), apiKey: '', model: def.defaultModel }
}

/** URL/key/model for any provider: the active values for the current one, else saved or default. */
export function providerConfig(settings: Settings, id: ProviderId = settings.provider): ProviderConfig {
  if (id === settings.provider) return { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model }
  return { ...providerDefaults(id), ...settings.providerConfigs[id] }
}

/**
 * Make `id` the active provider: remembers the current provider's URL/key/model in
 * providerConfigs and loads the target's saved config (or its defaults). Pure — save the result.
 */
export function switchProvider(settings: Settings, id: ProviderId): Settings {
  if (!isProviderId(id)) return settings
  if (id === settings.provider) return settings
  const providerConfigs: Partial<Record<ProviderId, ProviderConfig>> = {
    ...settings.providerConfigs,
    [settings.provider]: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
  }
  const target = { ...providerDefaults(id), ...providerConfigs[id] }
  delete providerConfigs[id]
  return { ...settings, provider: id, providerConfigs, baseUrl: target.baseUrl, apiKey: target.apiKey, model: target.model }
}

/**
 * Why the active provider can't be used yet ('' when it can): a cloud provider without an
 * API key, or a provider without a base URL.
 */
export function aiConfigProblem(settings: Settings): string {
  const def = getProvider(settings.provider)
  if (!settings.baseUrl.trim() && !def.defaultBaseUrl) return `Enter the server URL for ${def.name} in Settings.`
  if (def.needsKey && !settings.apiKey.trim()) {
    return `${def.name} needs an API key — ${def.keyUrl ? `create one at ${def.keyUrl} and ` : ''}paste it in Settings.`
  }
  return ''
}

/** True when the active provider has everything it needs to be tried (URL, and a key for cloud APIs). */
export function isAiConfigured(settings: Settings): boolean {
  return aiConfigProblem(settings) === ''
}

// ---------------------------------------------------------------------------
// Persistence

const KEY = 'anotherlife.settings.v1'

const AI_LEVELS: readonly AiLevel[] = ['off', 'balanced', 'full']
const RATINGS: readonly ContentRating[] = ['family', 'teen', 'mature']
const MONEY_SETTINGS: readonly MoneySetting[] = ['local', 'usd']
const PRICES_SETTINGS: readonly PricesSetting[] = ['nominal', 'today']

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}
function str(v: unknown, def: string): string {
  return typeof v === 'string' ? v : def
}
function num(v: unknown, def: number): number {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : def
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}
function oneOf<T extends string>(v: unknown, list: readonly T[], def: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def
}

function readConfigs(v: unknown): Partial<Record<ProviderId, ProviderConfig>> {
  const out: Partial<Record<ProviderId, ProviderConfig>> = {}
  if (!isObj(v)) return out
  for (const [id, c] of Object.entries(v)) {
    if (!isProviderId(id) || !isObj(c)) continue
    const d = providerDefaults(id)
    out[id] = { baseUrl: str(c.baseUrl, d.baseUrl), apiKey: str(c.apiKey, ''), model: str(c.model, d.model) }
  }
  return out
}

/** Turn whatever was saved (any older shape, or junk) into valid Settings. */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  if (!isObj(raw)) return { ...d, providerConfigs: {} }
  // Settings saved before providers existed only knew LM Studio (or whatever
  // OpenAI-compatible server its URL pointed to).
  const baseUrl = str(raw.baseUrl, '')
  const provider: ProviderId = isProviderId(raw.provider) ? raw.provider : (guessProviderFromUrl(baseUrl) ?? 'lmstudio')
  const pd = providerDefaults(provider)
  const providerConfigs = readConfigs(raw.providerConfigs)
  delete providerConfigs[provider]
  return {
    aiLevel: oneOf(raw.aiLevel, AI_LEVELS, d.aiLevel),
    provider,
    setupDone: raw.setupDone === true,
    providerConfigs,
    baseUrl: baseUrl.trim() ? baseUrl : pd.baseUrl,
    model: str(raw.model, pd.model),
    apiKey: str(raw.apiKey, ''),
    temperature: num(raw.temperature, d.temperature),
    maxTokens: num(raw.maxTokens, d.maxTokens),
    timeoutSec: num(raw.timeoutSec, d.timeoutSec),
    structuredOutput: bool(raw.structuredOutput, d.structuredOutput),
    disableThinking: bool(raw.disableThinking, d.disableThinking),
    contentRating: oneOf(raw.contentRating, RATINGS, d.contentRating),
    showAiBadges: bool(raw.showAiBadges, d.showAiBadges),
    money: oneOf(raw.money, MONEY_SETTINGS, d.money),
    prices: oneOf(raw.prices, PRICES_SETTINGS, d.prices),
  }
}

/** Make the engine's money formatting follow these settings (currency and year prices). */
export function applyMoneySettings(s: Pick<Settings, 'money' | 'prices'>): void {
  setMoneyDisplay({ mode: s.money === 'usd' ? 'usd' : 'local', nominal: s.prices !== 'today' })
}

export function loadSettings(): Settings {
  const s = readSettings()
  applyMoneySettings(s)
  return s
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return normalizeSettings(null)
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return normalizeSettings(null)
  }
}

export function saveSettings(s: Settings): void {
  applyMoneySettings(s)
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full or blocked: settings just won't persist
  }
}
