// Claude (Anthropic) through the official @anthropic-ai/sdk.
//
// The SDK is loaded with a dynamic import(), so the bundler puts it in its own chunk and a
// player only downloads it after choosing Claude. The browser calls the Claude API directly
// with the player's key: `dangerouslyAllowBrowser: true` makes the SDK send the
// `anthropic-dangerous-direct-browser-access` header that direct browser requests require.
// The key stays in this browser (localStorage) and goes only to the Claude API.
//
// Request shape (current Claude models): system + messages, JSON through
// output_config.format (json_schema), output_config.effort 'low' where supported (short,
// latency-sensitive narration), no temperature/top_p/top_k (rejected by current models),
// no thinking config (Claude Opus 5.5's thinking can't be disabled; effort controls it), and
// the server-side refusal fallback (`fallbacks: 'default'`) on models that offer it.
import type Anthropic from '@anthropic-ai/sdk'
import type { Settings } from '../settings'
import {
  AiFormatError,
  AiProviderError,
  authError,
  badModelError,
  cloudUnreachable,
  isAbort,
  rateLimitError,
  type ChatJsonRequest,
  type ChatMessage,
  type Completion,
} from './errors'
import { getProvider, type ProviderDef } from './providers'
import type { JsonSchema } from './schemas'

type Sdk = typeof import('@anthropic-ai/sdk')

/** Default Claude model (exact id, no date suffix). */
export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5'
/** Beta header for `fallbacks: 'default'` (server-side retry on a refusal). */
export const CLAUDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Models that offer the server-side refusal fallback. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])
/** Thinking counts against max_tokens, so never ask for less than this. */
export const CLAUDE_MIN_MAX_TOKENS = 4000

function claude(): ProviderDef {
  return getProvider('anthropic')
}

// ---------------------------------------------------------------------------
// Lazy SDK loading

let sdkPromise: Promise<Sdk> | null = null

/** Load the SDK chunk once (retried on the next call if the download failed). */
export function loadAnthropicSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = import('@anthropic-ai/sdk').catch(() => {
      sdkPromise = null
      throw new AiProviderError("Couldn't download the Claude library — check your internet connection and try again.", 'unreachable')
    })
  }
  return sdkPromise
}

const strictSchemas = new WeakMap<JsonSchema, JsonSchema>()

/** The SDK's own transform that makes a JSON schema acceptable to structured outputs. */
async function strictSchema(schema: JsonSchema): Promise<JsonSchema> {
  const cached = strictSchemas.get(schema)
  if (cached) return cached
  const { transformJSONSchema } = await import('@anthropic-ai/sdk/lib/transform-json-schema')
  const out = transformJSONSchema(schema) as JsonSchema
  strictSchemas.set(schema, out)
  return out
}

// ---------------------------------------------------------------------------
// Session memory: request features a model rejected (re-learned after a settings change).

const session = {
  noFallback: new Set<string>(),
  noFormat: new Set<string>(),
  noEffort: new Set<string>(),
}

export function resetAnthropicSession(): void {
  session.noFallback.clear()
  session.noFormat.clear()
  session.noEffort.clear()
}

/** Base URL for the SDK (no trailing /v1 — the SDK adds the paths). */
export function normalizeAnthropicBaseUrl(raw: string): string {
  let url = (raw ?? '').trim()
  if (!url) return claude().defaultBaseUrl
  if (!url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '').replace(/\/v1(?:\/messages|\/models)?$/, '')
}

/** The model to use: the one in settings, or Claude Opus 5.5. */
export function anthropicModel(settings: Settings): string {
  return settings.model.trim() || claude().defaultModel || CLAUDE_DEFAULT_MODEL
}

/**
 * Whether a Claude model accepts output_config.effort: Opus 4.5+, Sonnet 4.6+, Sonnet 5.x,
 * Fable/Mythos — never Haiku.
 */
export function supportsEffort(model: string): boolean {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return false
  if (/fable|mythos/.test(m)) return true
  const v = /(opus|sonnet)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(m)
  if (!v) return false
  const major = Number(v[2])
  const minor = v[3] === undefined ? 0 : Number(v[3])
  const atLeast = (M: number, n: number) => major > M || (major === M && minor >= n)
  return v[1] === 'opus' ? atLeast(4, 5) : atLeast(4, 6)
}

async function makeClient(settings: Settings): Promise<{ sdk: Sdk; client: Anthropic }> {
  const apiKey = settings.apiKey.trim()
  if (!apiKey) throw authError(claude(), false, undefined)
  const sdk = await loadAnthropicSdk()
  const timeoutSec = Number.isFinite(settings.timeoutSec) ? Math.max(10, settings.timeoutSec) : 120
  const client = new sdk.default({
    apiKey,
    baseURL: normalizeAnthropicBaseUrl(settings.baseUrl),
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: timeoutSec * 1000,
  })
  return { sdk, client }
}

// ---------------------------------------------------------------------------
// Errors

/** The API's own error message from an SDK error (falls back to the SDK's message). */
function apiDetail(err: unknown): string {
  const body = (err as { error?: unknown })?.error
  const inner = body && typeof body === 'object' ? (body as { error?: { message?: unknown } }).error : undefined
  if (inner && typeof inner.message === 'string') return inner.message
  return err instanceof Error ? err.message : String(err)
}

/** Map the SDK's typed errors to the same kinds/messages as the OpenAI-compatible client. */
function mapError(sdk: Sdk, err: unknown, settings: Settings, model: string, signal?: AbortSignal): unknown {
  if (isAbort(err, signal) || err instanceof sdk.APIUserAbortError) return err
  const def = claude()
  const detail = apiDetail(err)
  if (err instanceof sdk.AuthenticationError) return authError(def, true, err.status, detail)
  if (err instanceof sdk.PermissionDeniedError) return authError(def, true, err.status, detail)
  if (err instanceof sdk.RateLimitError) return rateLimitError(def, err.status, detail)
  if (err instanceof sdk.NotFoundError) return badModelError(def, model, err.status, detail)
  if (err instanceof sdk.BadRequestError) {
    if (/credit balance|billing|purchase credits/i.test(detail)) return rateLimitError(def, err.status, detail)
    if (/prompt is too long|context window|too many tokens/i.test(detail)) {
      return new AiProviderError(`The prompt doesn't fit this Claude model's context window. (${detail})`, 'context', err.status)
    }
    if (/model/i.test(detail) && /not found|invalid|unknown|does not exist/i.test(detail)) return badModelError(def, model, err.status, detail)
    return new AiProviderError(`${def.name} rejected the request (HTTP ${err.status}): ${detail}`, 'http', err.status)
  }
  if (err instanceof sdk.APIConnectionTimeoutError) {
    return new AiProviderError(`${def.name} didn't answer in time — try again, or raise the timeout in Settings.`, 'unreachable')
  }
  if (err instanceof sdk.APIConnectionError) return cloudUnreachable(def, normalizeAnthropicBaseUrl(settings.baseUrl))
  if (err instanceof sdk.InternalServerError) {
    return new AiProviderError(`${def.name} is overloaded or had a server error (HTTP ${err.status}) — try again in a moment.`, 'http', err.status)
  }
  if (err instanceof sdk.APIError) {
    return new AiProviderError(`${def.name} error${err.status ? ` (HTTP ${err.status})` : ''}: ${detail}`, 'http', err.status)
  }
  return err
}

// ---------------------------------------------------------------------------
// Models

/** Model ids the key can use (GET /v1/models through the SDK, auto-paginated). */
export async function listAnthropicModels(settings: Settings, signal?: AbortSignal): Promise<string[]> {
  const { sdk, client } = await makeClient(settings)
  try {
    const ids: string[] = []
    for await (const info of client.models.list({ limit: 100 }, { signal })) {
      if (info.id && !ids.includes(info.id)) ids.push(info.id)
    }
    return ids
  } catch (err) {
    throw mapError(sdk, err, settings, anthropicModel(settings), signal)
  }
}

// ---------------------------------------------------------------------------
// Messages

type AnyMessage = Anthropic.Message | Anthropic.Beta.BetaMessage

function readMessage(res: AnyMessage, maxTokens: number): Completion {
  // Check why it stopped before reading content.
  if (res.stop_reason === 'refusal') {
    // A policy decline (after any server-side fallback): unusable → the caller uses the offline story.
    throw new AiFormatError('Claude declined to write this part, so the built-in story was used.')
  }
  if (res.stop_reason === 'max_tokens') {
    throw new AiProviderError(
      `Claude used all ${maxTokens} tokens before finishing its answer (thinking counts too) — raise "Max tokens" in Settings.`,
      'maxTokens',
    )
  }
  let text = ''
  for (const block of res.content) {
    if (block.type === 'text') text += block.text
  }
  return { content: text, finish: res.stop_reason ?? '', reasoning: false }
}

/**
 * One Claude Messages API call. Learns for the session (per model) when the API rejects the
 * refusal-fallback beta, effort or the JSON schema, and retries once without that feature.
 */
export async function completeAnthropic<T>(
  settings: Settings,
  model: string,
  req: ChatJsonRequest<T>,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<Completion> {
  const { sdk, client } = await makeClient(settings)
  const maxTokens = Math.max(CLAUDE_MIN_MAX_TOKENS, Number.isFinite(settings.maxTokens) ? Math.round(settings.maxTokens) : 0)
  const systemText = [system, ...messages.filter((m) => m.role === 'system').map((m) => m.content)].filter(Boolean).join('\n\n')
  const turns: Anthropic.MessageParam[] = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))
  const schema = settings.structuredOutput ? await strictSchema(req.schema) : null

  let useFormat = schema !== null && !session.noFormat.has(model)
  let useEffort = supportsEffort(model) && !session.noEffort.has(model)
  let useFallback = FALLBACK_MODELS.has(model) && !session.noFallback.has(model)

  for (let attempt = 0; ; attempt++) {
    const outputConfig: Anthropic.OutputConfig = {}
    if (useEffort) outputConfig.effort = 'low'
    if (useFormat && schema) outputConfig.format = { type: 'json_schema', schema }
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      system: systemText,
      messages: turns,
      ...(outputConfig.effort || outputConfig.format ? { output_config: outputConfig } : {}),
    }
    try {
      const res: AnyMessage = useFallback
        ? await client.beta.messages.create({ ...params, betas: [CLAUDE_FALLBACK_BETA], fallbacks: 'default' }, { signal })
        : await client.messages.create(params, { signal })
      return readMessage(res, maxTokens)
    } catch (err) {
      if (attempt < 3 && err instanceof sdk.BadRequestError) {
        const detail = apiDetail(err)
        if (useFallback && /fallback|beta/i.test(detail)) {
          useFallback = false
          session.noFallback.add(model)
          continue
        }
        if (useEffort && /effort/i.test(detail)) {
          useEffort = false
          session.noEffort.add(model)
          continue
        }
        if (useFormat && !/credit balance|billing|prompt is too long/i.test(detail)) {
          // The schema (or structured outputs on this model) was rejected: rely on the prompt + loose parsing.
          useFormat = false
          session.noFormat.add(model)
          continue
        }
      }
      throw mapError(sdk, err, settings, model, signal)
    }
  }
}
