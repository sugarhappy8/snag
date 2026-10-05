// Error types and player-facing error messages shared by every AI provider client.
import { onHostedPage, type ProviderDef } from './providers'
import type { JsonSchema } from './schemas'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatJsonRequest<T> {
  system: string
  messages: ChatMessage[]
  /** Name for response_format.json_schema.name (letters, digits, _ and -). */
  schemaName: string
  schema: JsonSchema
  /** Normalize/validate the parsed object; throw (e.g. SchemaError) to trigger one corrective retry. */
  validate?: (value: unknown) => T
  /** Overrides settings.temperature. */
  temperature?: number
}

export type AiProviderErrorKind =
  | 'unreachable'
  | 'auth'
  | 'noModel'
  | 'badModel'
  | 'context'
  | 'rateLimit'
  | 'maxTokens'
  | 'http'
  | 'badResponse'
/** @deprecated use AiProviderErrorKind */
export type LmStudioErrorKind = AiProviderErrorKind

/** Connection / server / account problems (as opposed to unusable model output). */
export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind
  readonly status?: number
  constructor(message: string, kind: AiProviderErrorKind, status?: number) {
    super(message)
    this.name = 'AiProviderError'
    this.kind = kind
    this.status = status
  }
}

/** Old name, kept for existing imports and `instanceof` checks. */
export const LmStudioError = AiProviderError
export type LmStudioError = AiProviderError

/** The provider answered, but the model's reply could not be turned into the requested JSON. */
export class AiFormatError extends Error {
  readonly raw: string
  constructor(message: string, raw = '') {
    super(message)
    this.name = 'AiFormatError'
    this.raw = raw
  }
}

export function isAbort(err: unknown, signal?: AbortSignal | null): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && err.name === 'AbortError') || (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
}

// ---------------------------------------------------------------------------
// Messages

const LNA_HINT =
  'when your browser asks to let this site access apps or devices on your local network, choose Allow ' +
  '(if you blocked it earlier, re-allow it from the site settings next to the address bar)'

/** What to do when a local server can't be reached, per provider. */
function localFix(def: ProviderDef): string {
  switch (def.id) {
    case 'lmstudio':
      return 'open LM Studio → Developer → Start Server (or run `lms server start --cors`), turn on "Enable CORS" in Server Settings'
    case 'ollama':
      return (
        'make sure Ollama is running and allows this site: restart it with OLLAMA_ORIGINS set to "*" ' +
        '(e.g. `OLLAMA_ORIGINS="*" ollama serve`; with the Windows/macOS app, set the OLLAMA_ORIGINS environment variable and restart Ollama)'
      )
    case 'llamacpp':
      return 'start llama-server with a model (e.g. `llama-server -m model.gguf --port 8080`) and check the port'
    case 'koboldcpp':
      return 'start KoboldCpp with a model loaded and check the port (default 5001)'
    case 'jan':
      return 'in Jan open Settings → Local API Server, turn on CORS and start the server'
    default:
      return 'start the server, check the URL and port, and allow cross-origin (CORS) requests from this site'
  }
}

/** A fetch to a local server failed (server off, CORS blocked, or local-network permission denied). */
export function localUnreachable(def: ProviderDef, base: string): AiProviderError {
  const lna = onHostedPage() ? `, and ${LNA_HINT}` : ''
  return new AiProviderError(`Can't reach ${def.name} at ${base} — ${localFix(def)}${lna}.`, 'unreachable')
}

/** A fetch to a cloud API failed before any response (network, or the provider blocks browser requests). */
export function cloudUnreachable(def: ProviderDef, base: string): AiProviderError {
  const tryOther = def.id === 'openrouter' ? '' : ', try OpenRouter'
  return new AiProviderError(
    `The browser couldn't reach ${def.name} at ${base} (network problem, or ${def.name} blocked a direct browser request/CORS) — ` +
      `check your connection and the URL${tryOther}, or run the game locally.`,
    'unreachable',
  )
}

export function unreachableFor(def: ProviderDef, base: string): AiProviderError {
  return def.kind === 'local' ? localUnreachable(def, base) : cloudUnreachable(def, base)
}

export function authError(def: ProviderDef, hasKey: boolean, status: number | undefined, detail = ''): AiProviderError {
  const http = status ? ` (HTTP ${status})` : ''
  const more = detail ? ` ${detail}` : ''
  if (def.id === 'lmstudio') {
    return new AiProviderError(
      hasKey
        ? `LM Studio rejected the API token${http}. Check the token in Settings.`
        : `LM Studio requires an API token${http} — create one in LM Studio → Developer → Server Settings → Manage Tokens, then paste it in Settings.`,
      'auth',
      status,
    )
  }
  const where = def.keyUrl ? ` (get one at ${def.keyUrl})` : ''
  return new AiProviderError(
    hasKey
      ? `${def.name} rejected your API key${http} — check the key in Settings${where}.${more}`
      : `${def.name} needs an API key${http} — paste yours in Settings${where}.${more}`,
    'auth',
    status,
  )
}

export function rateLimitError(def: ProviderDef, status: number | undefined, detail = ''): AiProviderError {
  const http = status ? ` (HTTP ${status})` : ''
  return new AiProviderError(
    `${def.name} hit a rate limit or your account is out of credits${http} — wait a minute and try again, or check your plan/billing.${detail ? ` (${detail})` : ''}`,
    'rateLimit',
    status,
  )
}

export function badModelError(def: ProviderDef, model: string, status: number | undefined, detail = ''): AiProviderError {
  const tail = detail ? ` (${detail})` : ''
  if (!model) return new AiProviderError(`${def.name} couldn't use the model${detail ? `: ${detail}` : '.'}`, 'badModel', status)
  const hint =
    def.id === 'ollama'
      ? ` — download it with \`ollama pull ${model}\`, pick another in Settings, or leave Model blank.`
      : def.kind === 'local'
        ? ' — pick one from the list in Settings, or leave Model blank to use whatever is loaded.'
        : ' — pick one from the list in Settings, or leave Model blank to choose automatically.'
  return new AiProviderError(`${def.name} has no model called "${model}"${hint}${tail}`, 'badModel', status)
}

export function noModelError(def: ProviderDef): AiProviderError {
  switch (def.id) {
    case 'lmstudio':
      return new AiProviderError('No model loaded in LM Studio — load one (Developer tab or My Models), or turn on just-in-time model loading.', 'noModel')
    case 'ollama':
      return new AiProviderError('Ollama has no models yet — download one, e.g. `ollama pull llama3.2`.', 'noModel')
    default:
      return new AiProviderError(
        def.kind === 'local' ? `${def.name} has no chat model loaded — load one and try again.` : `${def.name} didn't list any chat models — type a model id in Settings.`,
        'noModel',
      )
  }
}

// ---------------------------------------------------------------------------
// One model reply, as every provider client reports it to the shared JSON loop.

export interface Completion {
  /** The reply text (may still contain <think> blocks or code fences). */
  content: string
  /** 'stop', 'length' (token limit) or whatever the provider reported. */
  finish: string
  /** True when the model spent output on reasoning (so a 'length' stop means it never answered). */
  reasoning: boolean
}

/** Sends one request: system prompt + conversation at a temperature → the model's reply. */
export type Completer = (system: string, messages: ChatMessage[], temperature: number) => Promise<Completion>
