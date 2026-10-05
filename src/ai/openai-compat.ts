// Client for every OpenAI-compatible provider: local servers (LM Studio, Ollama, llama.cpp,
// KoboldCpp, Jan, vLLM...) and cloud APIs (OpenAI, Gemini, OpenRouter, Groq, Mistral,
// DeepSeek, xAI, Together, custom).
//
// Endpoints used: GET {base}/models, POST {base}/chat/completions, and — for LM Studio only,
// to find which model is loaded when the player left "Model" blank — LM Studio's native
// GET /api/v1/models (0.4+) or /api/v0/models (0.3.x).
//
// Under "npm run dev" LM Studio's default base URL is '/lmstudio/v1' (the Vite proxy →
// localhost:1234), so no CORS setup is needed. The hosted build calls local servers directly,
// which needs CORS enabled in the server and the browser's local-network-access permission.
// Cloud APIs are called directly with the player's key (Bearer auth).
import type { Settings } from '../settings'
import {
  AiProviderError,
  authError,
  badModelError,
  isAbort,
  noModelError,
  rateLimitError,
  unreachableFor,
  type ChatJsonRequest,
  type ChatMessage,
  type Completion,
} from './errors'
import {
  defaultBaseUrlFor,
  HAS_DEV_PROXY,
  isChatModelId,
  LMSTUDIO_DIRECT_URL,
  pickModel,
  providerFor,
  type ProviderDef,
  type StructuredOutputMode,
} from './providers'

// ---------------------------------------------------------------------------
// Session memory (not persisted): auto-picked models and what each server/model rejected.

const session = {
  /** `${provider}|${base}` → auto-picked model */
  models: new Map<string, string>(),
  /** `${provider}|${base}|${model}` → structured-output mode that works */
  structured: new Map<string, StructuredOutputMode>(),
  /** `${provider}|${base}|${model}` → optional request params the server rejected */
  dropped: new Map<string, Set<string>>(),
  /** `${provider}|${base}|${model}` → which max-tokens parameter the server wants */
  tokensParam: new Map<string, 'max_tokens' | 'max_completion_tokens'>(),
}

/** Forget auto-picked models and every learned fallback (e.g. after settings change). */
export function resetOpenAiSession(): void {
  session.models.clear()
  session.structured.clear()
  session.dropped.clear()
  session.tokensParam.clear()
}

function serverKey(settings: Settings): string {
  const def = providerFor(settings)
  return `${def.id}|${normalizeBaseUrl(settings.baseUrl, def)}`
}

/** True once the server rejected every structured-output mode for this base URL during this session. */
export function structuredOutputDisabled(settings: Settings): boolean {
  const prefix = `${serverKey(settings)}|`
  return [...session.structured].some(([k, mode]) => k.startsWith(prefix) && mode === 'none')
}

// ---------------------------------------------------------------------------
// URLs, headers & errors

/**
 * Clean up what the player typed: add http:// and /v1 when missing, drop trailing slashes.
 * Empty → the provider's default (LM Studio's when no provider is given).
 */
export function normalizeBaseUrl(raw: string, def?: ProviderDef): string {
  let url = (raw ?? '').trim()
  if (!url) return def ? defaultBaseUrlFor(def) : defaultBaseUrlFor(providerFor({ provider: 'lmstudio' }))
  if (!url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // Local servers speak plain http; cloud APIs https (unless the host is obviously local).
    const local = def?.kind !== 'cloud' || /^(?:localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url)
    url = `${local ? 'http' : 'https'}://${url}`
  }
  url = url.replace(/\/+$/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/]+$/i.test(url)) url += '/v1'
  if (url.endsWith('/chat/completions')) url = url.slice(0, -'/chat/completions'.length)
  if (url.endsWith('/models')) url = url.slice(0, -'/models'.length)
  return url
}

function isRelative(base: string): boolean {
  return base.startsWith('/')
}

/** Server root for LM Studio's native REST API, or null if the base isn't ".../v1". */
function nativeRoot(base: string): string | null {
  return base.endsWith('/v1') ? base.slice(0, -3) : null
}

function headers(settings: Settings, def: ProviderDef, json: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (json) h['Content-Type'] = 'application/json'
  const key = settings.apiKey.trim()
  if (key) h.Authorization = `Bearer ${key}`
  if (def.id === 'openrouter') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    if (origin && origin !== 'null') h['HTTP-Referer'] = origin
    h['X-Title'] = 'AnotherLife'
  }
  return h
}

/** The dev-server proxy (/lmstudio/v1) didn't answer. */
function proxyUnreachable(base: string): AiProviderError {
  const hint = HAS_DEV_PROXY
    ? 'open LM Studio → Developer → Start Server.'
    : `that address only works under "npm run dev" — set the server URL in Settings to ${LMSTUDIO_DIRECT_URL}.`
  return new AiProviderError(`Can't reach LM Studio at ${base} (the dev-server proxy to http://localhost:1234) — ${hint}`, 'unreachable')
}

function unreachable(def: ProviderDef, base: string): AiProviderError {
  return isRelative(base) ? proxyUnreachable(base) : unreachableFor(def, base)
}

function errorText(body: unknown): string {
  if (Array.isArray(body) && body.length > 0) return errorText(body[0]) // Gemini wraps errors in an array
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const e = b.error
    if (typeof e === 'string') return e
    if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string') return (e as Record<string, string>).message
    if (typeof b.message === 'string') return b.message
    if (typeof b.detail === 'string') return b.detail
  }
  return ''
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<(?:!doctype|html|head|body)/i.test(text)
}

const NO_MODEL_RE = /no models? (?:are |is )?loaded|no model (?:is )?(?:currently )?(?:loaded|selected)|model (?:is )?not loaded|please load a model|load a model first/i
const BAD_MODEL_RE = /(?:invalid|unknown) model|model .{0,80}(?:not found|does not exist|doesn't exist|not available|is not supported|decommissioned)|no model (?:found )?with|failed to load model|model_not_found/i
const CONTEXT_RE = /context (?:length|window|overflow|size)|tokens to keep|exceeds? the (?:model'?s? )?context|n_ctx|too many tokens|prompt is too long/i
const QUOTA_RE = /insufficient[_ ]quota|exceeded your (?:current )?quota|credit balance|out of credits|insufficient (?:balance|credits)|billing/i

function httpError(def: ProviderDef, status: number, body: unknown, text: string, base: string, settings: Settings, model = ''): AiProviderError {
  const msg = errorText(body) || (looksLikeHtml(text) ? '' : text.trim().slice(0, 240))
  if (isRelative(base) && status >= 500 && status <= 504 && (!msg || /proxy error|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg))) {
    return proxyUnreachable(base)
  }
  if (status === 401 || (status === 403 && !QUOTA_RE.test(msg))) return authError(def, Boolean(settings.apiKey.trim()), status, def.kind === 'cloud' ? msg : '')
  if (status === 429 || status === 402 || (status >= 400 && status < 500 && QUOTA_RE.test(msg))) return rateLimitError(def, status, msg)
  if (NO_MODEL_RE.test(msg)) {
    const e = noModelError(def)
    return new AiProviderError(e.message, 'noModel', status)
  }
  if (BAD_MODEL_RE.test(msg) || (status === 404 && /model/i.test(msg))) return badModelError(def, settings.model.trim() || model, status, msg)
  if (CONTEXT_RE.test(msg)) {
    return new AiProviderError(
      def.kind === 'local'
        ? `The prompt doesn't fit the model's context window — reload the model in ${def.name} with a context length of 4096 or more. (${msg})`
        : `The prompt doesn't fit this model's context window — pick a model with a larger context in Settings. (${msg})`,
      'context',
      status,
    )
  }
  if (isRelative(base) && !HAS_DEV_PROXY && (status === 404 || status === 405)) return proxyUnreachable(base)
  if (status === 404 && !msg) {
    return new AiProviderError(`No ${def.name} API at ${base} (HTTP 404) — check the server URL in Settings (it usually ends in /v1).`, 'http', status)
  }
  return new AiProviderError(`${def.name} error (HTTP ${status})${msg ? `: ${msg}` : ''}`, 'http', status)
}

async function requestJson(settings: Settings, url: string, method: 'GET' | 'POST', body: unknown, signal?: AbortSignal, model = ''): Promise<unknown> {
  const def = providerFor(settings)
  const base = normalizeBaseUrl(settings.baseUrl, def)
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: headers(settings, def, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (isAbort(err, signal)) throw err
    throw unreachable(def, base)
  }
  let text = ''
  try {
    text = await res.text()
  } catch (err) {
    if (isAbort(err, signal)) throw err
    throw unreachable(def, base)
  }
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }
  if (!res.ok) throw httpError(def, res.status, parsed, text, base, settings, model)
  // Some servers report failures with a 200 and an {"error": ...} body.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'error' in parsed && !('choices' in parsed) && !('data' in parsed) && !('models' in parsed)) {
    throw httpError(def, 500, parsed, text, base, settings, model)
  }
  if (parsed === undefined) {
    if (looksLikeHtml(text)) {
      const hint =
        def.id === 'lmstudio'
          ? ` Run the game with "npm run dev" (which proxies /lmstudio), or set the server URL to ${LMSTUDIO_DIRECT_URL} and enable CORS in LM Studio.`
          : ' Check the URL in Settings (OpenAI-compatible APIs usually end in /v1).'
      throw new AiProviderError(`Got a web page instead of ${def.name}'s API at ${base}.${hint}`, 'badResponse', res.status)
    }
    throw new AiProviderError(`${def.name} sent an unreadable response from ${url}.`, 'badResponse', res.status)
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Models

const NON_CHAT_TYPE_RE = /embed|image|audio|rerank|moderation|transcri|tts|speech|video/i

/** Chat model ids from GET {base}/models (embedding, image, audio... models filtered out). */
export async function listModels(settings: Settings, signal?: AbortSignal): Promise<string[]> {
  const def = providerFor(settings)
  const base = normalizeBaseUrl(settings.baseUrl, def)
  const body = await requestJson(settings, `${base}/models`, 'GET', undefined, signal)
  // OpenAI-style {data:[...]}; Together returns a bare array.
  const data = Array.isArray(body) ? body : (body as { data?: unknown }).data
  if (!Array.isArray(data)) throw new AiProviderError(`Unexpected reply from ${base}/models — is this an OpenAI-compatible ${def.name} API?`, 'badResponse')
  const ids: string[] = []
  for (const m of data) {
    if (!m || typeof m !== 'object') continue
    const rec = m as { id?: unknown; type?: unknown }
    const id = rec.id
    if (typeof rec.type === 'string' && NON_CHAT_TYPE_RE.test(rec.type)) continue
    if (typeof id === 'string' && id && isChatModelId(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Ask LM Studio's native API which LLM is loaded right now (LM Studio only).
 * Returns the model id, '' when the server reports that none is loaded, or null if unknown.
 */
export async function findLoadedModel(settings: Settings, signal?: AbortSignal): Promise<string | null> {
  const def = providerFor(settings)
  if (def.id !== 'lmstudio') return null
  const root = nativeRoot(normalizeBaseUrl(settings.baseUrl, def))
  if (root === null) return null
  for (const path of ['/api/v1/models', '/api/v0/models']) {
    let body: unknown
    try {
      body = await requestJson(settings, `${root}${path}`, 'GET', undefined, signal)
    } catch (err) {
      if (isAbort(err, signal)) throw err
      continue
    }
    const b = body as { models?: unknown; data?: unknown }
    if (Array.isArray(b.models)) {
      for (const m of b.models as Record<string, unknown>[]) {
        if (!m || m.type !== 'llm' || !Array.isArray(m.loaded_instances) || m.loaded_instances.length === 0) continue
        const inst = m.loaded_instances[0] as { id?: unknown }
        const id = typeof inst?.id === 'string' && inst.id ? inst.id : typeof m.key === 'string' ? m.key : ''
        if (id) return id
      }
      return ''
    }
    if (Array.isArray(b.data)) {
      for (const m of b.data as Record<string, unknown>[]) {
        if (m && m.state === 'loaded' && (m.type === 'llm' || m.type === 'vlm') && typeof m.id === 'string') return m.id
      }
      return ''
    }
  }
  return null
}

/** Remember an auto-picked model for this server (e.g. after testConnection listed the models). */
export function rememberModel(settings: Settings, model: string): void {
  if (model) session.models.set(serverKey(settings), model)
}

/** Forget the auto-picked model for this server (it was unloaded or swapped). */
export function forgetModel(settings: Settings): void {
  session.models.delete(serverKey(settings))
}

/** The model to send: the one in settings, or an automatic pick (cached for the session). */
export async function resolveModel(settings: Settings, signal?: AbortSignal): Promise<string> {
  const explicit = settings.model.trim()
  if (explicit) return explicit
  const def = providerFor(settings)
  const key = serverKey(settings)
  const cached = session.models.get(key)
  if (cached) return cached
  let model = def.id === 'lmstudio' ? (await findLoadedModel(settings, signal)) || '' : ''
  if (!model) {
    // LM Studio with just-in-time loading lists every downloaded model and loads the one we ask for.
    let ids: string[] = []
    try {
      ids = await listModels(settings, signal)
    } catch (err) {
      if (isAbort(err, signal)) throw err
      // A cloud API without a usable /models endpoint: fall back to a known model id.
      const known = def.defaultModel || def.suggestedModels[0]
      const fatal = !(err instanceof AiProviderError) || err.kind === 'auth' || err.kind === 'unreachable' || err.kind === 'rateLimit'
      if (def.kind !== 'cloud' || !known || fatal) throw err
      model = known
    }
    if (!model) {
      if (ids.length === 0) throw noModelError(def)
      model = pickModel(def, ids) || ids[0]
    }
  }
  session.models.set(key, model)
  return model
}

// ---------------------------------------------------------------------------
// Chat completions

function readCompletion(def: ProviderDef, body: unknown): Completion {
  const choice = (body as { choices?: unknown[] })?.choices?.[0] as Record<string, unknown> | undefined
  if (!choice) throw new AiProviderError(`${def.name} returned no choices.`, 'badResponse')
  const msg = (choice.message ?? choice.delta ?? {}) as Record<string, unknown>
  let content = ''
  if (typeof msg.content === 'string') content = msg.content
  else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
  } else if (typeof choice.text === 'string') content = choice.text
  const reasoning =
    typeof msg.reasoning_content === 'string' || typeof msg.reasoning === 'string' || /<think|<\/think>/i.test(content) || hasReasoningTokens(body)
  return { content, finish: typeof choice.finish_reason === 'string' ? choice.finish_reason : '', reasoning }
}

function hasReasoningTokens(body: unknown): boolean {
  const details = (body as { usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } } })?.usage?.completion_tokens_details
  return typeof details?.reasoning_tokens === 'number' && details.reasoning_tokens > 0
}

/** Light hint for local reasoning models to skip their thinking phase (Qwen-style; harmless elsewhere). */
export function withThinkingHint(system: string, settings: Settings): string {
  return settings.disableThinking && providerFor(settings).kind === 'local' ? `${system}\n/no_think` : system
}

/** OpenAI reasoning models (o1/o3/o4, gpt-5...) only accept the default temperature. */
function isOpenAiReasoningModel(model: string): boolean {
  const name = model.toLowerCase().split('/').pop() ?? ''
  return /^o\d(?:-|$)/.test(name) || (/^gpt-5/.test(name) && !/chat/.test(name))
}

function acceptsTemperature(def: ProviderDef, model: string): boolean {
  if (!def.sendsTemperature) return false
  return !(def.id === 'openai' && isOpenAiReasoningModel(model))
}

/** reasoning_effort to send when the player asked to skip thinking (cloud reasoning models), or ''. */
function reasoningEffort(def: ProviderDef, model: string, settings: Settings): string {
  if (!settings.disableThinking) return ''
  if (def.id === 'openai' && isOpenAiReasoningModel(model)) return 'low'
  if (def.id === 'gemini' && /gemini-2\.5-flash/i.test(model)) return 'none'
  return ''
}

const STRUCTURED_RE = /response_format|json_schema|json_object|schema|grammar|structured/i

function nextMode(mode: StructuredOutputMode, def: ProviderDef): StructuredOutputMode {
  if (mode === 'json_schema') return def.jsonObject ? 'json_object' : 'none'
  return 'none'
}

/** Which optional parameter of `payload` the error message complains about, if any. */
function rejectedParam(message: string, payload: Record<string, unknown>): string {
  if ('temperature' in payload && /temperature/i.test(message)) return 'temperature'
  if ('reasoning_effort' in payload && /reasoning[_ ]effort|thinking/i.test(message)) return 'reasoning_effort'
  if ('max_tokens' in payload && /\bmax_tokens\b/.test(message)) return 'max_tokens'
  if ('max_completion_tokens' in payload && /max_completion_tokens/.test(message)) return 'max_completion_tokens'
  return ''
}

/**
 * One chat completion against an OpenAI-compatible API. Learns, per server + model and for
 * the rest of the session, what the server rejects: json_schema → json_object → no
 * response_format, temperature, reasoning_effort and the max-tokens parameter name.
 */
export async function completeOpenAi<T>(
  settings: Settings,
  model: string,
  req: ChatJsonRequest<T>,
  system: string,
  messages: ChatMessage[],
  temperature: number,
  signal?: AbortSignal,
): Promise<Completion> {
  const def = providerFor(settings)
  const base = normalizeBaseUrl(settings.baseUrl, def)
  const key = `${def.id}|${base}|${model}`
  let mode: StructuredOutputMode = settings.structuredOutput ? (session.structured.get(key) ?? def.structuredOutput) : 'none'
  const dropped = session.dropped.get(key) ?? new Set<string>()
  let tokensParam = session.tokensParam.get(key) ?? def.maxTokensParam
  const maxTokens = Number.isFinite(settings.maxTokens) ? Math.max(64, Math.round(settings.maxTokens)) : 900

  for (let attempt = 0; ; attempt++) {
    const payload: Record<string, unknown> = {
      messages: [{ role: 'system', content: withThinkingHint(system, settings) }, ...messages],
      [tokensParam]: maxTokens,
      stream: false,
    }
    if (model) payload.model = model
    if (acceptsTemperature(def, model) && !dropped.has('temperature')) {
      payload.temperature = Number.isFinite(temperature) ? Math.max(0, Math.min(2, temperature)) : 0.8
    }
    const effort = reasoningEffort(def, model, settings)
    if (effort && !dropped.has('reasoning_effort')) payload.reasoning_effort = effort
    if (mode === 'json_schema') {
      payload.response_format = {
        type: 'json_schema',
        json_schema: { name: req.schemaName.replace(/[^\w-]/g, '_').slice(0, 64), strict: true, schema: req.schema },
      }
    } else if (mode === 'json_object') {
      payload.response_format = { type: 'json_object' }
    }
    try {
      return readCompletion(def, await requestJson(settings, `${base}/chat/completions`, 'POST', payload, signal, model))
    } catch (err) {
      if (attempt >= 5 || !(err instanceof AiProviderError) || err.kind !== 'http') throw err
      const param = err.status !== undefined && err.status >= 400 && err.status < 500 ? rejectedParam(err.message, payload) : ''
      if (param === 'max_tokens' || param === 'max_completion_tokens') {
        tokensParam = param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
        session.tokensParam.set(key, tokensParam)
        continue
      }
      if (param) {
        // e.g. "temperature does not support 0.9 with this model": retry without it, remember.
        dropped.add(param)
        session.dropped.set(key, dropped)
        continue
      }
      if (mode !== 'none' && (err.status === 400 || err.status === 422 || STRUCTURED_RE.test(err.message))) {
        // This server/model can't do this kind of structured output: step down and remember.
        mode = nextMode(mode, def)
        session.structured.set(key, mode)
        continue
      }
      throw err
    }
  }
}
