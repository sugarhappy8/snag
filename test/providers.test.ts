import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// The official Anthropic SDK is mocked: the tests check what the game sends through it.

const sdkState = vi.hoisted(() => ({
  ctorArgs: [] as Record<string, unknown>[],
  calls: [] as { beta: boolean; params: Record<string, unknown>; opts: Record<string, unknown> | undefined }[],
  replies: [] as unknown[],
  models: [] as string[],
}))

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number | undefined
    error: unknown
    constructor(status?: number, error?: unknown, message?: string) {
      super(message ?? `${status} error`)
      this.status = status
      this.error = error
    }
  }
  class APIUserAbortError extends APIError {}
  class APIConnectionError extends APIError {}
  class APIConnectionTimeoutError extends APIConnectionError {}
  class BadRequestError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  function respond(beta: boolean, params: Record<string, unknown>, opts?: Record<string, unknown>): unknown {
    sdkState.calls.push({ beta, params: JSON.parse(JSON.stringify(params)) as Record<string, unknown>, opts })
    const next = sdkState.replies.shift()
    if (next === undefined) throw new Error('unexpected Claude call')
    if (next instanceof Error) throw next
    return next
  }
  class FakeAnthropic {
    constructor(opts: Record<string, unknown>) {
      sdkState.ctorArgs.push(opts)
    }
    messages = { create: async (params: Record<string, unknown>, opts?: Record<string, unknown>) => respond(false, params, opts) }
    beta = { messages: { create: async (params: Record<string, unknown>, opts?: Record<string, unknown>) => respond(true, params, opts) } }
    models = {
      list: () =>
        (async function* () {
          for (const id of sdkState.models) yield { id, type: 'model' }
        })(),
    }
  }
  return {
    default: FakeAnthropic,
    Anthropic: FakeAnthropic,
    APIError,
    APIUserAbortError,
    APIConnectionError,
    APIConnectionTimeoutError,
    BadRequestError,
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    RateLimitError,
    InternalServerError,
  }
})

import * as sdk from '@anthropic-ai/sdk'
import { testConnection } from '../src/ai/director'
import { chatJson, listModels, resetAiSession } from '../src/ai/client'
import { AiFormatError, AiProviderError, LmStudioError } from '../src/ai/errors'
import { CLAUDE_FALLBACK_BETA, supportsEffort } from '../src/ai/anthropic'
import { getProvider, guessProviderFromUrl, isChatModelId, pickModel, PROVIDERS, providerFor, sameModel } from '../src/ai/providers'
import { SCHEMAS, validateNarration } from '../src/ai/schemas'
import {
  DEFAULT_SETTINGS,
  isAiConfigured,
  loadSettings,
  normalizeSettings,
  providerConfig,
  saveSettings,
  switchProvider,
  type Settings,
} from '../src/settings'

// ---------------------------------------------------------------------------
// fetch mock for the OpenAI-compatible providers

interface Call {
  url: string
  method: string
  body: Record<string, unknown> | undefined
  headers: Record<string, string>
}
let calls: Call[] = []
let chatQueue: (Response | (() => Response))[] = []
let modelsBody: unknown = { data: [] }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function chat(content: string, finish = 'stop'): Response {
  return json({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }] })
}
const GOOD = () => chat(JSON.stringify({ text: 'You did a thing today.' }))

function chatBodies(): Record<string, unknown>[] {
  return calls.filter((c) => c.url.endsWith('/chat/completions')).map((c) => c.body ?? {})
}

const narrate = {
  system: 'You narrate a life. Reply with ONE JSON object only.',
  messages: [{ role: 'user' as const, content: 'Rewrite: You went to the gym.' }],
  schemaName: 'narration',
  schema: SCHEMAS.narrate,
  validate: validateNarration,
}

function using(id: Parameters<typeof switchProvider>[1], patch: Partial<Settings> = {}): Settings {
  return { ...switchProvider(DEFAULT_SETTINGS, id), ...patch }
}

beforeEach(() => {
  calls = []
  chatQueue = []
  modelsBody = { data: [] }
  sdkState.ctorArgs.length = 0
  sdkState.calls.length = 0
  sdkState.replies.length = 0
  sdkState.models = []
  resetAiSession()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      calls.push({ url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) as Record<string, string> })
      if (url.endsWith('/chat/completions')) {
        const next = chatQueue.shift()
        if (!next) throw new Error('unexpected chat call')
        return typeof next === 'function' ? next() : next
      }
      if (url.endsWith('/models') && !url.includes('/api/')) return json(modelsBody)
      return json({ error: 'not found' }, 404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

describe('provider registry', () => {
  it('describes every provider completely', () => {
    const ids = new Set<string>()
    for (const p of PROVIDERS) {
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(p.name && p.emoji && p.blurb).toBeTruthy()
      expect(['local', 'cloud']).toContain(p.kind)
      expect(['openai', 'anthropic']).toContain(p.api)
      expect(p.setupSteps.length).toBeGreaterThan(0)
      if (p.kind === 'cloud') expect(p.needsKey).toBe(true)
      if (p.id !== 'customCloud') expect(p.defaultBaseUrl).toMatch(/^https?:\/\//)
    }
    for (const id of ['lmstudio', 'ollama', 'llamacpp', 'koboldcpp', 'jan', 'customLocal', 'openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'mistral', 'deepseek', 'xai', 'together', 'customCloud']) {
      expect(ids.has(id)).toBe(true)
    }
    expect(getProvider('ollama').defaultBaseUrl).toBe('http://localhost:11434/v1')
    expect(getProvider('anthropic').defaultModel).toBe('claude-opus-5-5')
    expect(getProvider('nope').id).toBe('lmstudio')
    expect(providerFor({}).id).toBe('lmstudio')
    expect(getProvider('ollama').setupSteps.join(' ')).toMatch(/OLLAMA_ORIGINS/)
    expect(getProvider('lmstudio').setupSteps.join(' ')).toMatch(/Enable CORS/)
  })

  it('picks models: local = first chat model, cloud = preferred suggestion', () => {
    expect(pickModel(getProvider('ollama'), ['nomic-embed-text:latest', 'llama3.2:latest'])).toBe('llama3.2:latest')
    expect(pickModel(getProvider('groq'), ['whisper-large-v3', 'gemma2-9b-it', 'llama-3.3-70b-versatile'])).toBe('llama-3.3-70b-versatile')
    expect(pickModel(getProvider('gemini'), ['models/embedding-001', 'models/gemini-2.5-flash'])).toBe('models/gemini-2.5-flash')
    expect(pickModel(getProvider('mistral'), ['mistral-embed', 'ministral-8b-latest', 'pixtral-12b'])).toBe('ministral-8b-latest') // no suggestion listed → first chat model
    expect(sameModel('models/gemini-2.5-flash', 'gemini-2.5-flash')).toBe(true)
    expect(isChatModelId('dall-e-3')).toBe(false)
    expect(isChatModelId('gpt-4.1-mini')).toBe(true)
  })

  it('guesses the provider of an old saved URL', () => {
    expect(guessProviderFromUrl('http://localhost:1234/v1')).toBe('lmstudio')
    expect(guessProviderFromUrl('/lmstudio/v1')).toBe('lmstudio')
    expect(guessProviderFromUrl('http://127.0.0.1:11434/v1')).toBe('ollama')
    expect(guessProviderFromUrl('http://192.168.1.20:1234/v1')).toBe('lmstudio')
    expect(guessProviderFromUrl('https://api.groq.com/openai/v1')).toBe('groq')
    expect(guessProviderFromUrl('http://example.org:9999/v1')).toBeNull()
  })
})

describe('settings', () => {
  it('switches providers and keeps each one\'s URL, key and model', () => {
    let s: Settings = { ...DEFAULT_SETTINGS, model: 'qwen/qwen3-8b' }
    s = switchProvider(s, 'openai')
    expect(s.provider).toBe('openai')
    expect(s.baseUrl).toBe('https://api.openai.com/v1')
    expect(s.apiKey).toBe('')
    s = { ...s, apiKey: 'sk-openai', model: 'gpt-4.1-mini' }
    s = switchProvider(s, 'anthropic')
    expect(s).toMatchObject({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', model: 'claude-opus-5-5' })
    expect(providerConfig(s, 'openai')).toEqual({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-openai', model: 'gpt-4.1-mini' })
    s = switchProvider({ ...s, apiKey: 'sk-ant' }, 'openai')
    expect(s).toMatchObject({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-4.1-mini' })
    s = switchProvider(s, 'lmstudio')
    expect(s).toMatchObject({ provider: 'lmstudio', baseUrl: DEFAULT_SETTINGS.baseUrl, model: 'qwen/qwen3-8b', apiKey: '' })
    expect(s.providerConfigs.anthropic?.apiKey).toBe('sk-ant')
    expect(s.providerConfigs.lmstudio).toBeUndefined() // the active one lives in baseUrl/apiKey/model
    expect(switchProvider(s, 'lmstudio')).toBe(s)
  })

  it('knows when the AI is configured', () => {
    expect(isAiConfigured(DEFAULT_SETTINGS)).toBe(true)
    expect(isAiConfigured(using('groq'))).toBe(false)
    expect(isAiConfigured(using('groq', { apiKey: 'gsk_1' }))).toBe(true)
    expect(isAiConfigured(using('customCloud', { apiKey: 'k' }))).toBe(false) // no URL yet
    expect(isAiConfigured(using('customCloud', { apiKey: 'k', baseUrl: 'https://llm.example.com/v1' }))).toBe(true)
  })

  it('migrates settings saved before providers existed', () => {
    const old = { aiLevel: 'full', baseUrl: 'http://localhost:1234/v1', model: 'qwen/qwen3-8b', apiKey: '', temperature: 0.7, maxTokens: 1200, timeoutSec: 60, structuredOutput: false, disableThinking: true, contentRating: 'mature', showAiBadges: false }
    const s = normalizeSettings(old)
    expect(s).toMatchObject({ ...old, provider: 'lmstudio', setupDone: false, providerConfigs: {} })
    expect(normalizeSettings({ baseUrl: 'http://localhost:11434/v1' }).provider).toBe('ollama')
    const junk = normalizeSettings({ provider: 'skynet', aiLevel: 'max', temperature: 'hot', setupDone: 'yes', providerConfigs: { openai: { apiKey: 5 }, bogus: {} } })
    expect(junk).toMatchObject({ provider: 'lmstudio', aiLevel: DEFAULT_SETTINGS.aiLevel, temperature: DEFAULT_SETTINGS.temperature, setupDone: false })
    expect(junk.providerConfigs).toEqual({ openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' } })
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    const s = { ...switchProvider({ ...DEFAULT_SETTINGS, setupDone: true }, 'groq'), apiKey: 'gsk_x' }
    saveSettings(s)
    expect(loadSettings()).toEqual(s)
    store.set('anotherlife.settings.v1', '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('OpenAI-compatible cloud providers', () => {
  it('sends the key to the provider, auto-picks a model and skips LM Studio-only calls', async () => {
    modelsBody = { object: 'list', data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'llama-3.3-70b-versatile' }] }
    chatQueue.push(GOOD)
    const s = using('groq', { apiKey: 'gsk_secret' })
    const r = await chatJson(s, narrate)
    expect(r.text).toBe('You did a thing today.')
    expect(calls.map((c) => c.url)).toEqual(['https://api.groq.com/openai/v1/models', 'https://api.groq.com/openai/v1/chat/completions'])
    for (const c of calls) expect(c.headers.Authorization).toBe('Bearer gsk_secret')
    const body = chatBodies()[0]
    expect(body.model).toBe('llama-3.3-70b-versatile')
    expect((body.messages as { content: string }[])[0].content).not.toMatch(/no_think/)
    expect(body.temperature).toBe(DEFAULT_SETTINGS.temperature)
    expect((body.response_format as { type: string }).type).toBe('json_schema')
  })

  it('falls back json_schema → json_object → none and remembers', async () => {
    const s = using('groq', { apiKey: 'k', model: 'llama-3.1-8b-instant' })
    chatQueue.push(json({ error: { message: 'json_schema response format is not supported by this model' } }, 400), GOOD, GOOD)
    await chatJson(s, narrate)
    await chatJson(s, narrate)
    expect(chatBodies().map((b) => (b.response_format as { type?: string } | undefined)?.type)).toEqual(['json_schema', 'json_object', 'json_object'])
    chatQueue.push(json({ error: { message: "'response_format' is not supported" } }, 400), GOOD)
    resetAiSession()
    await chatJson({ ...s, model: 'other-model' }, narrate)
    chatQueue.push(json({ error: { message: 'bad response_format' } }, 400), GOOD)
    await chatJson({ ...s, model: 'other-model' }, narrate)
    // other-model: json_schema rejected → json_object; next request starts at json_object, rejected → none.
    expect(chatBodies().slice(3).map((b) => (b.response_format as { type?: string } | undefined)?.type)).toEqual(['json_schema', 'json_object', 'json_object', undefined])
  })

  it('DeepSeek starts with json_object', async () => {
    chatQueue.push(GOOD)
    await chatJson(using('deepseek', { apiKey: 'k', model: 'deepseek-chat' }), narrate)
    expect(chatBodies()[0].response_format).toEqual({ type: 'json_object' })
  })

  it('retries without temperature when the model rejects it, and remembers', async () => {
    const s = using('openai', { apiKey: 'sk-1', model: 'gpt-4.1-mini' })
    chatQueue.push(
      json({ error: { message: "Unsupported value: 'temperature' does not support 0.9 with this model. Only the default (1) value is supported.", type: 'invalid_request_error' } }, 400),
      GOOD,
      GOOD,
    )
    await chatJson(s, narrate)
    await chatJson(s, narrate)
    const bodies = chatBodies()
    expect(bodies[0].temperature).toBe(0.9)
    expect(bodies[1].temperature).toBeUndefined()
    expect(bodies[2].temperature).toBeUndefined()
    // json_schema was kept: the 400 was about temperature.
    expect((bodies[1].response_format as { type: string }).type).toBe('json_schema')
    // OpenAI takes max_completion_tokens.
    expect(bodies[0].max_completion_tokens).toBe(DEFAULT_SETTINGS.maxTokens)
    expect(bodies[0].max_tokens).toBeUndefined()
  })

  it('never sends temperature to OpenAI reasoning models and asks them to think less', async () => {
    chatQueue.push(GOOD)
    await chatJson(using('openai', { apiKey: 'sk-1', model: 'gpt-5-mini' }), narrate)
    expect(chatBodies()[0].temperature).toBeUndefined()
    expect(chatBodies()[0].reasoning_effort).toBe('low')
  })

  it('switches max_tokens ↔ max_completion_tokens when the server asks', async () => {
    chatQueue.push(json({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }, 400), GOOD)
    await chatJson(using('openrouter', { apiKey: 'k', model: 'x/y' }), narrate)
    expect(chatBodies()[1].max_completion_tokens).toBe(DEFAULT_SETTINGS.maxTokens)
    expect(chatBodies()[1].max_tokens).toBeUndefined()
  })

  it('explains a CORS-like network failure for a cloud provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const err = await chatJson(using('openai', { apiKey: 'sk-1', model: 'gpt-4.1-mini' }), narrate).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiProviderError)
    expect(err).toBeInstanceOf(LmStudioError)
    expect((err as AiProviderError).kind).toBe('unreachable')
    expect((err as Error).message).toMatch(/The browser couldn't reach OpenAI at https:\/\/api\.openai\.com\/v1 .*CORS.*try OpenRouter, or run the game locally/)
  })

  it('maps 401 / 429 / unknown model to clear messages', async () => {
    const s = using('mistral', { apiKey: 'bad', model: 'mistral-small-latest' })
    chatQueue.push(json({ message: 'Unauthorized' }, 401))
    await expect(chatJson(s, narrate)).rejects.toThrow(/Mistral rejected your API key \(HTTP 401\)/)
    chatQueue.push(json({ error: { message: 'Rate limit exceeded' } }, 429))
    await expect(chatJson(s, narrate)).rejects.toMatchObject({ kind: 'rateLimit', message: expect.stringMatching(/rate limit or your account is out of credits/) })
    chatQueue.push(json({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }, 429))
    await expect(chatJson(s, narrate)).rejects.toMatchObject({ kind: 'rateLimit' })
    chatQueue.push(json({ error: { message: 'The model `mistral-huge` does not exist', code: 'model_not_found' } }, 404))
    await expect(chatJson({ ...s, model: 'mistral-huge' }, narrate)).rejects.toMatchObject({ kind: 'badModel', message: expect.stringMatching(/Mistral has no model called "mistral-huge"/) })
  })

  it('sends OpenRouter attribution headers', async () => {
    vi.stubGlobal('location', { origin: 'https://anotherlife.example', protocol: 'https:' })
    chatQueue.push(GOOD)
    await chatJson(using('openrouter', { apiKey: 'sk-or-1', model: 'openai/gpt-4.1-mini' }), narrate)
    const h = calls[0].headers
    expect(h['HTTP-Referer']).toBe('https://anotherlife.example')
    expect(h['X-Title']).toBe('AnotherLife')
    expect(h.Authorization).toBe('Bearer sk-or-1')
  })

  it('reads bare-array model lists (Together) and names the provider in testConnection', async () => {
    modelsBody = [
      { id: 'BAAI/bge-large-en-v1.5', type: 'embedding' },
      { id: 'black-forest-labs/FLUX.1-schnell', type: 'image' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', type: 'chat' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', type: 'chat' },
    ]
    const s = using('together', { apiKey: 'k' })
    expect(await listModels(s)).toEqual(['Qwen/Qwen2.5-72B-Instruct-Turbo', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'])
    const r = await testConnection(s)
    expect(r.ok).toBe(true)
    expect(r.message).toBe('Connected to Together AI · 2 models — using meta-llama/Llama-3.3-70B-Instruct-Turbo.')
    // The pick is remembered: the next request doesn't list models again.
    const listed = calls.length
    chatQueue.push(GOOD)
    await chatJson(s, narrate)
    expect(calls.length).toBe(listed + 1)
    expect(chatBodies()[0].model).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo')
  })

  it('testConnection asks for a key before calling a cloud provider', async () => {
    const r = await testConnection(using('groq'))
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Groq needs an API key.*console\.groq\.com/)
    expect(calls).toHaveLength(0)
  })
})

describe('local providers', () => {
  it('uses Ollama at its own URL with the /no_think hint and no LM Studio native lookup', async () => {
    modelsBody = { data: [{ id: 'nomic-embed-text:latest' }, { id: 'llama3.2:latest' }] }
    chatQueue.push(GOOD)
    const s = using('ollama')
    expect(s.baseUrl).toBe('http://localhost:11434/v1')
    await chatJson(s, narrate)
    expect(calls.map((c) => c.url)).toEqual(['http://localhost:11434/v1/models', 'http://localhost:11434/v1/chat/completions'])
    const body = chatBodies()[0]
    expect(body.model).toBe('llama3.2:latest')
    expect((body.messages as { content: string }[])[0].content.endsWith('/no_think')).toBe(true)
    expect(calls[1].headers.Authorization).toBeUndefined()
  })

  it("explains how to let the browser reach Ollama", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const s = using('ollama', { model: 'llama3.2' })
    await expect(chatJson(s, narrate)).rejects.toThrow(/Can't reach Ollama at http:\/\/localhost:11434\/v1 .*OLLAMA_ORIGINS.*local network/)
    // Under the plain-http dev server there's no local-network prompt to mention.
    vi.stubGlobal('location', { origin: 'http://localhost:5173', protocol: 'http:' })
    const err = (await chatJson(s, narrate).catch((e: unknown) => e)) as Error
    expect(err.message).toMatch(/OLLAMA_ORIGINS/)
    expect(err.message).not.toMatch(/local network/)
  })

  it('tells Ollama users to pull a model', async () => {
    chatQueue.push(json({ error: { message: 'model "llama9" not found, try pulling it first' } }, 404))
    await expect(chatJson(using('ollama', { model: 'llama9' }), narrate)).rejects.toThrow(/ollama pull llama9/)
  })
})

describe('Claude (Anthropic SDK)', () => {
  const claudeReply = (obj: unknown, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: stop, stop_details: null })
  const claude = (patch: Partial<Settings> = {}) => using('anthropic', { apiKey: 'sk-ant-test', ...patch })
  const headers = new Headers()

  it('calls Claude Opus 5.5 from the browser with JSON output, low effort and the refusal fallback', async () => {
    sdkState.replies.push(claudeReply({ text: 'You lifted weights and felt great.' }))
    const r = await chatJson(claude(), narrate)
    expect(r.text).toBe('You lifted weights and felt great.')
    expect(sdkState.ctorArgs[0]).toMatchObject({ apiKey: 'sk-ant-test', dangerouslyAllowBrowser: true, baseURL: 'https://api.anthropic.com' })
    const { beta, params } = sdkState.calls[0]
    expect(beta).toBe(true)
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.betas).toEqual([CLAUDE_FALLBACK_BETA])
    expect(params.fallbacks).toBe('default')
    expect(params.system).toBe(narrate.system)
    expect(params.messages).toEqual(narrate.messages)
    expect(params.max_tokens).toBeGreaterThanOrEqual(4000)
    expect(params).not.toHaveProperty('temperature')
    expect(params).not.toHaveProperty('top_p')
    expect(params).not.toHaveProperty('top_k')
    expect(params).not.toHaveProperty('thinking')
    const out = params.output_config as { effort?: string; format?: { type: string; schema: { type: string; additionalProperties: boolean } } }
    expect(out.effort).toBe('low')
    expect(out.format?.type).toBe('json_schema')
    expect(out.format?.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats a refusal as an unusable answer (offline fallback)', async () => {
    sdkState.replies.push({ ...claudeReply({}), content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null } })
    const err = await chatJson(claude(), narrate).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiFormatError)
    expect(sdkState.calls).toHaveLength(1)
  })

  it('asks the player to raise Max tokens when Claude runs out', async () => {
    sdkState.replies.push(claudeReply({ text: 'You lif' }, 'max_tokens'))
    await expect(chatJson(claude(), narrate)).rejects.toMatchObject({ kind: 'maxTokens', message: expect.stringMatching(/raise "Max tokens"/) })
  })

  it('explains a rejected API key', async () => {
    sdkState.replies.push(new sdk.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, '401 invalid x-api-key', headers))
    const err = await chatJson(claude(), narrate).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiProviderError)
    expect((err as AiProviderError).kind).toBe('auth')
    expect((err as Error).message).toMatch(/Claude \(Anthropic\) rejected your API key \(HTTP 401\).*console\.anthropic\.com/)
  })

  it('maps rate limits and network failures', async () => {
    sdkState.replies.push(new sdk.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, '429', headers))
    await expect(chatJson(claude(), narrate)).rejects.toMatchObject({ kind: 'rateLimit' })
    sdkState.replies.push(new sdk.APIConnectionError({ message: 'Connection error.' }))
    await expect(chatJson(claude(), narrate)).rejects.toThrow(/The browser couldn't reach Claude \(Anthropic\) at https:\/\/api\.anthropic\.com/)
  })

  it('retries once without the schema when the API rejects it, and remembers', async () => {
    sdkState.replies.push(
      new sdk.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: unsupported keyword' } }, '400', headers),
      claudeReply({ text: 'You did it anyway.' }),
      claudeReply({ text: 'You did it again.' }),
    )
    await chatJson(claude(), narrate)
    await chatJson(claude(), narrate)
    const formats = sdkState.calls.map((c) => (c.params.output_config as { format?: unknown } | undefined)?.format)
    expect(formats[0]).toBeDefined()
    expect(formats[1]).toBeUndefined()
    expect(formats[2]).toBeUndefined()
  })

  it('drops the refusal-fallback beta if the API rejects it', async () => {
    sdkState.replies.push(
      new sdk.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: unknown beta' } }, '400', headers),
      claudeReply({ text: 'You did it anyway.' }),
    )
    await chatJson(claude(), narrate)
    expect(sdkState.calls.map((c) => c.beta)).toEqual([true, false])
    expect(sdkState.calls[1].params).not.toHaveProperty('fallbacks')
    expect((sdkState.calls[1].params.output_config as { format?: unknown }).format).toBeDefined()
  })

  it('sends no effort or fallback to Haiku', async () => {
    sdkState.replies.push(claudeReply({ text: 'You did a quick thing.' }))
    await chatJson(claude({ model: 'claude-haiku-4-5' }), narrate)
    const { beta, params } = sdkState.calls[0]
    expect(beta).toBe(false)
    expect((params.output_config as { effort?: string }).effort).toBeUndefined()
    expect(supportsEffort('claude-opus-4-5')).toBe(true)
    expect(supportsEffort('claude-opus-4-1')).toBe(false)
    expect(supportsEffort('claude-sonnet-4-5')).toBe(false)
    expect(supportsEffort('claude-sonnet-4-6')).toBe(true)
    expect(supportsEffort('claude-sonnet-5-5')).toBe(true)
    expect(supportsEffort('claude-fable-5-1')).toBe(true)
  })

  it('lists models and tests the connection through the SDK', async () => {
    sdkState.models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']
    const r = await testConnection(claude())
    expect(r).toEqual({ ok: true, message: 'Connected to Claude (Anthropic) · 3 models — using claude-opus-5-5.', models: sdkState.models })
    const missing = await testConnection(claude({ apiKey: '' }))
    expect(missing.ok).toBe(false)
    expect(missing.message).toMatch(/Claude \(Anthropic\) needs an API key/)
  })
})
