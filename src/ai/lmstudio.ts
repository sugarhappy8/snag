// LM Studio client (OpenAI-compatible local server).
//
// Endpoints used: GET {base}/models, POST {base}/chat/completions, and — only to find
// which model is loaded when the player left "Model" blank — LM Studio's native
// GET /api/v1/models (0.4+) or /api/v0/models (0.3.x).
//
// The default base URL is '/lmstudio/v1' (the Vite dev/preview proxy → localhost:1234),
// so no CORS setup is needed; absolute URLs such as http://localhost:1234/v1 also work
// when "Enable CORS" is on in LM Studio's server settings.
import type { Settings } from '../settings'
import { JsonParseError, parseJsonLoose, stripThinking } from './json'
import { correctionPrompt } from './prompts'
import { SchemaError, type JsonSchema } from './schemas'

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

export type LmStudioErrorKind = 'unreachable' | 'auth' | 'noModel' | 'badModel' | 'context' | 'http' | 'badResponse'

/** Connection / server problems (as opposed to unusable model output). */
export class LmStudioError extends Error {
  readonly kind: LmStudioErrorKind
  readonly status?: number
  constructor(message: string, kind: LmStudioErrorKind, status?: number) {
    super(message)
    this.name = 'LmStudioError'
    this.kind = kind
    this.status = status
  }
}

/** The server answered, but the model's reply could not be turned into the requested JSON. */
export class AiFormatError extends Error {
  readonly raw: string
  constructor(message: string, raw = '') {
    super(message)
    this.name = 'AiFormatError'
    this.raw = raw
  }
}

// ---------------------------------------------------------------------------
// Session memory (not persisted): auto-picked model and servers that reject json_schema.

const session = {
  models: new Map<string, string>(),
  noStructured: new Set<string>(),
}

/** Forget the auto-picked model and the structured-output fallback (e.g. after settings change). */
export function resetLmStudioSession(): void {
  session.models.clear()
  session.noStructured.clear()
}

/** True once the server rejected response_format for this base URL + model during this session. */
export function structuredOutputDisabled(settings: Settings): boolean {
  return [...session.noStructured].some((k) => k.startsWith(`${normalizeBaseUrl(settings.baseUrl)}|`))
}

// ---------------------------------------------------------------------------
// URLs & errors

/** Clean up what the player typed: add http:// and /v1 when missing, drop trailing slashes. */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw ?? '').trim()
  if (!url) return '/lmstudio/v1'
  if (!url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`
  url = url.replace(/\/+$/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/]+$/i.test(url)) url += '/v1'
  if (url.endsWith('/chat/completions')) url = url.slice(0, -'/chat/completions'.length)
  return url
}

function isRelative(base: string): boolean {
  return base.startsWith('/')
}

/** Server root for LM Studio's native REST API, or null if the base isn't ".../v1". */
function nativeRoot(base: string): string | null {
  return base.endsWith('/v1') ? base.slice(0, -3) : null
}

function headers(settings: Settings, json: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (json) h['Content-Type'] = 'application/json'
  const key = settings.apiKey.trim()
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

function unreachable(base: string): LmStudioError {
  const where = isRelative(base) ? `${base} (the dev-server proxy to http://localhost:1234)` : base
  const cors = isRelative(base) ? '' : ' and turn on "Enable CORS" in Server Settings'
  return new LmStudioError(`Can't reach LM Studio at ${where} — open LM Studio → Developer → Start Server${cors}.`, 'unreachable')
}

function errorText(body: unknown): string {
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
const BAD_MODEL_RE = /(?:invalid|unknown) model|model .{0,80}(?:not found|does not exist|doesn't exist|not available)|no model (?:found )?with|failed to load model|model_not_found/i
const CONTEXT_RE = /context (?:length|window|overflow|size)|tokens to keep|exceeds? the (?:model'?s? )?context|n_ctx|too many tokens|prompt is too long/i

function httpError(status: number, body: unknown, text: string, base: string, settings: Settings): LmStudioError {
  const msg = errorText(body) || (looksLikeHtml(text) ? '' : text.trim().slice(0, 240))
  if (isRelative(base) && status >= 500 && status <= 504 && (!msg || /proxy|ECONNREFUSED|ECONNRESET|socket hang up|connect/i.test(msg))) {
    return unreachable(base)
  }
  if (status === 401 || status === 403) {
    return new LmStudioError(
      settings.apiKey.trim()
        ? `LM Studio rejected the API token (HTTP ${status}). Check the token in Settings.`
        : `LM Studio requires an API token (HTTP ${status}) — create one in LM Studio → Developer → Server Settings → Manage Tokens, then paste it in Settings.`,
      'auth',
      status,
    )
  }
  if (NO_MODEL_RE.test(msg)) {
    return new LmStudioError('No model loaded in LM Studio — load one (Developer tab or My Models), or turn on just-in-time model loading.', 'noModel', status)
  }
  if (BAD_MODEL_RE.test(msg) || (status === 404 && /model/i.test(msg))) {
    const name = settings.model.trim()
    return new LmStudioError(
      name
        ? `LM Studio has no model called "${name}" — pick one from the list in Settings, or leave Model blank to use whatever is loaded. (${msg})`
        : `LM Studio couldn't use the model: ${msg}`,
      'badModel',
      status,
    )
  }
  if (CONTEXT_RE.test(msg)) {
    return new LmStudioError(
      `The prompt doesn't fit the model's context window — reload the model in LM Studio with a context length of 4096 or more. (${msg})`,
      'context',
      status,
    )
  }
  if (status === 404 && !msg) {
    return new LmStudioError(`No LM Studio API at ${base} (HTTP 404) — check the server URL in Settings (it usually ends in /v1).`, 'http', status)
  }
  return new LmStudioError(`LM Studio error (HTTP ${status})${msg ? `: ${msg}` : ''}`, 'http', status)
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && err.name === 'AbortError') || (err instanceof DOMException && err.name === 'AbortError')
}

async function requestJson(settings: Settings, url: string, method: 'GET' | 'POST', body: unknown, signal?: AbortSignal): Promise<unknown> {
  const base = normalizeBaseUrl(settings.baseUrl)
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: headers(settings, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (isAbort(err, signal)) throw err
    throw unreachable(base)
  }
  let text = ''
  try {
    text = await res.text()
  } catch (err) {
    if (isAbort(err, signal)) throw err
    throw unreachable(base)
  }
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }
  if (!res.ok) throw httpError(res.status, parsed, text, base, settings)
  // Some servers report failures with a 200 and an {"error": ...} body.
  if (parsed && typeof parsed === 'object' && 'error' in parsed && !('choices' in parsed) && !('data' in parsed) && !('models' in parsed)) {
    throw httpError(500, parsed, text, base, settings)
  }
  if (parsed === undefined) {
    if (looksLikeHtml(text)) {
      throw new LmStudioError(
        `Got a web page instead of LM Studio's API at ${base}. Run the game with "npm run dev" (which proxies /lmstudio), or set the server URL to http://localhost:1234/v1 and enable CORS in LM Studio.`,
        'badResponse',
        res.status,
      )
    }
    throw new LmStudioError(`LM Studio sent an unreadable response from ${url}.`, 'badResponse', res.status)
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Models

function isChatModelId(id: string): boolean {
  return !/embed|embedding|rerank|whisper|tts/i.test(id)
}

/** Model ids from GET /models (embedding models filtered out). */
export async function listModels(settings: Settings, signal?: AbortSignal): Promise<string[]> {
  const base = normalizeBaseUrl(settings.baseUrl)
  const body = await requestJson(settings, `${base}/models`, 'GET', undefined, signal)
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) throw new LmStudioError(`Unexpected reply from ${base}/models — is this an LM Studio (OpenAI-compatible) server?`, 'badResponse')
  const ids: string[] = []
  for (const m of data) {
    const id = m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined
    if (typeof id === 'string' && id && isChatModelId(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Ask LM Studio's native API which LLM is loaded right now.
 * Returns the model id, '' when the server reports that none is loaded, or null if unknown.
 */
export async function findLoadedModel(settings: Settings, signal?: AbortSignal): Promise<string | null> {
  const root = nativeRoot(normalizeBaseUrl(settings.baseUrl))
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

/** The model to send: the one in settings, or the loaded one (cached for the session). */
export async function resolveModel(settings: Settings, signal?: AbortSignal): Promise<string> {
  const explicit = settings.model.trim()
  if (explicit) return explicit
  const base = normalizeBaseUrl(settings.baseUrl)
  const cached = session.models.get(base)
  if (cached) return cached
  const loaded = await findLoadedModel(settings, signal)
  let model = loaded || ''
  if (!model) {
    // Unknown, or nothing loaded yet: with just-in-time loading /models lists every
    // downloaded model and LM Studio loads the one we ask for.
    const ids = await listModels(settings, signal)
    if (ids.length === 0) {
      throw new LmStudioError('No model loaded in LM Studio — load one (Developer tab or My Models), or turn on just-in-time model loading.', 'noModel')
    }
    model = ids[0]
  }
  session.models.set(base, model)
  return model
}

// ---------------------------------------------------------------------------
// Chat completions

interface Completion {
  content: string
  finish: string
  reasoning: boolean
}

function readCompletion(body: unknown): Completion {
  const choice = (body as { choices?: unknown[] })?.choices?.[0] as Record<string, unknown> | undefined
  if (!choice) throw new LmStudioError('LM Studio returned no choices.', 'badResponse')
  const msg = (choice.message ?? choice.delta ?? {}) as Record<string, unknown>
  let content = ''
  if (typeof msg.content === 'string') content = msg.content
  else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
  } else if (typeof choice.text === 'string') content = choice.text
  const reasoning = typeof msg.reasoning_content === 'string' || typeof msg.reasoning === 'string' || /<think|<\/think>/i.test(content)
  return { content, finish: typeof choice.finish_reason === 'string' ? choice.finish_reason : '', reasoning }
}

/** Light hint for reasoning models to skip their thinking phase (Qwen-style; harmless elsewhere). */
export function withThinkingHint(system: string, settings: Settings): string {
  return settings.disableThinking ? `${system}\n/no_think` : system
}

async function complete<T>(settings: Settings, model: string, messages: ChatMessage[], req: ChatJsonRequest<T>, temperature: number, signal?: AbortSignal): Promise<Completion> {
  const base = normalizeBaseUrl(settings.baseUrl)
  const key = `${base}|${model}`
  const useSchema = settings.structuredOutput && !session.noStructured.has(key)
  const payload: Record<string, unknown> = {
    messages,
    temperature,
    max_tokens: Math.max(64, Math.round(settings.maxTokens)),
    stream: false,
  }
  if (model) payload.model = model
  if (useSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: { name: req.schemaName.replace(/[^\w-]/g, '_').slice(0, 64), strict: true, schema: req.schema },
    }
  }
  try {
    return readCompletion(await requestJson(settings, `${base}/chat/completions`, 'POST', payload, signal))
  } catch (err) {
    const rejected =
      useSchema &&
      err instanceof LmStudioError &&
      err.kind === 'http' &&
      (err.status === 400 || err.status === 422 || /response_format|json_schema|schema|grammar/i.test(err.message))
    if (!rejected) throw err
    // This server/model can't do structured output: remember and fall back to prompt-only JSON.
    session.noStructured.add(key)
    delete payload.response_format
    return readCompletion(await requestJson(settings, `${base}/chat/completions`, 'POST', payload, signal))
  }
}

async function chatJsonWithModel<T>(settings: Settings, model: string, req: ChatJsonRequest<T>, signal?: AbortSignal): Promise<T> {
  const system: ChatMessage = { role: 'system', content: withThinkingHint(req.system, settings) }
  const baseMessages: ChatMessage[] = [system, ...req.messages]
  const temperature = req.temperature ?? settings.temperature
  let messages = baseMessages
  let problem = ''
  let raw = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const done = await complete(settings, model, messages, req, attempt === 0 ? temperature : Math.min(temperature, 0.6), signal)
    raw = done.content
    if (!stripThinking(done.content) && done.finish === 'length') {
      throw new AiFormatError(
        done.reasoning
          ? `The model used all ${settings.maxTokens} tokens thinking and never answered — raise "Max tokens" or turn on "Disable thinking" in Settings.`
          : `The model hit the ${settings.maxTokens}-token limit before answering — raise "Max tokens" in Settings.`,
        raw,
      )
    }
    try {
      const value = parseJsonLoose(done.content)
      return req.validate ? req.validate(value) : (value as T)
    } catch (err) {
      if (!(err instanceof JsonParseError) && !(err instanceof SchemaError)) throw err
      problem = err.message
      const echoed = stripThinking(done.content).slice(0, 1500) || '(empty reply)'
      messages = [...baseMessages, { role: 'assistant', content: echoed }, { role: 'user', content: correctionPrompt(problem) }]
    }
  }
  throw new AiFormatError(`The model's reply wasn't usable (${problem}).`, raw)
}

/**
 * Ask for a JSON object matching `schema`, parse it robustly, validate it, and retry once
 * with a corrective message if the reply was unusable. Throws LmStudioError for
 * connection/server problems, AiFormatError for unusable output, and the AbortError if
 * the signal fires.
 */
export async function chatJson<T>(settings: Settings, req: ChatJsonRequest<T>, signal?: AbortSignal): Promise<T> {
  const auto = !settings.model.trim()
  const model = await resolveModel(settings, signal)
  try {
    return await chatJsonWithModel(settings, model, req, signal)
  } catch (err) {
    // The auto-picked model was unloaded or swapped since we cached it: look again once.
    if (auto && err instanceof LmStudioError && (err.kind === 'badModel' || err.kind === 'noModel')) {
      const base = normalizeBaseUrl(settings.baseUrl)
      session.models.delete(base)
      const fresh = await resolveModel(settings, signal)
      if (fresh !== model) return await chatJsonWithModel(settings, fresh, req, signal)
    }
    throw err
  }
}
