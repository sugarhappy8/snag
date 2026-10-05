// Player-facing settings, persisted in localStorage separately from saves.

export type AiLevel = 'off' | 'balanced' | 'full'
export type ContentRating = 'family' | 'teen' | 'mature'

export interface Settings {
  /**
   * off: fully offline (built-in event library only).
   * balanced: AI writes yearly events, choice outcomes, conversations, interviews, custom actions, obituaries.
   * full: also rewrites every activity result in its own words (slower).
   */
  aiLevel: AiLevel
  /** OpenAI-compatible base URL. '/lmstudio/v1' goes through the Vite dev-server proxy. */
  baseUrl: string
  /** Model id from /v1/models; '' lets LM Studio use whatever model is loaded. */
  model: string
  /** Optional API token (LM Studio can require one when authentication is enabled). */
  apiKey: string
  temperature: number
  maxTokens: number
  timeoutSec: number
  /** Send response_format json_schema (structured output). Turn off for models/backends that reject it. */
  structuredOutput: boolean
  /** Ask reasoning models to skip their thinking phase for speed. */
  disableThinking: boolean
  contentRating: ContentRating
  /** Show the little AI sparkle on AI-written log lines. */
  showAiBadges: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  aiLevel: 'balanced',
  baseUrl: '/lmstudio/v1',
  model: '',
  apiKey: '',
  temperature: 0.9,
  maxTokens: 900,
  timeoutSec: 120,
  structuredOutput: true,
  disableThinking: true,
  contentRating: 'teen',
  showAiBadges: true,
}

const KEY = 'anotherlife.settings.v1'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full or blocked: settings just won't persist
  }
}
