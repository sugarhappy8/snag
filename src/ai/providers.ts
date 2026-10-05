// AI provider registry: every local server and cloud API the game can talk to.
//
// The game is a static site, so the browser calls the provider DIRECTLY: local servers on
// the player's own computer (they must allow cross-origin requests — "CORS") or a cloud API
// with the player's own key (kept in this browser's localStorage and sent only to that
// provider). Under `npm run dev`, LM Studio can also go through the Vite proxy '/lmstudio/v1'.
//
// This module has no runtime imports from settings.ts (settings.ts imports it), so it can be
// used from anywhere without import cycles.

/** Direct address of a default LM Studio server. */
export const LMSTUDIO_DIRECT_URL = 'http://localhost:1234/v1'
/** Address through the Vite dev/preview server proxy. */
export const LMSTUDIO_PROXY_URL = '/lmstudio/v1'
/** True when the page is served by the Vite dev server, which has the /lmstudio proxy. */
export const HAS_DEV_PROXY: boolean = import.meta.env.DEV

export type ProviderId =
  | 'lmstudio'
  | 'ollama'
  | 'llamacpp'
  | 'koboldcpp'
  | 'jan'
  | 'customLocal'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'together'
  | 'customCloud'

/** local: a server on the player's computer/network. cloud: a hosted API with the player's key. */
export type ProviderKind = 'local' | 'cloud'
/** Wire protocol: OpenAI-compatible chat completions, or Anthropic's Messages API (official SDK). */
export type ProviderApi = 'openai' | 'anthropic'
/** Best structured-output mode the provider accepts (the client falls back further on 400/422). */
export type StructuredOutputMode = 'json_schema' | 'json_object' | 'none'

export interface ProviderDef {
  id: ProviderId
  /** Display name, e.g. "LM Studio", "Claude (Anthropic)". */
  name: string
  emoji: string
  kind: ProviderKind
  api: ProviderApi
  /** One-line, player-facing description for pickers. */
  blurb: string
  /** Base URL used when the player hasn't typed one ('' = the player must enter it). */
  defaultBaseUrl: string
  /** Placeholder for the URL field. */
  baseUrlPlaceholder: string
  /** True when an API key is required (cloud). Local servers take an optional token. */
  needsKey: boolean
  /** Where to create a key ('' when not applicable). */
  keyUrl: string
  keyPlaceholder: string
  /** Fallback/preferred model ids. The real list comes from the provider's /models. */
  suggestedModels: string[]
  /** Model to preselect; '' = pick automatically after listing the provider's models. */
  defaultModel: string
  structuredOutput: StructuredOutputMode
  /** Whether response_format {type:'json_object'} is a usable fallback when json_schema is rejected. */
  jsonObject: boolean
  /** Whether the API accepts `temperature` (per-model exceptions are handled by the client). */
  sendsTemperature: boolean
  /** OpenAI's newer models take max_completion_tokens instead of max_tokens. */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  /** Short player-facing setup steps (including CORS for local servers). */
  setupSteps: string[]
  docsUrl: string
}

const CORS_STEP = 'Allow this site to call it: turn on CORS (cross-origin requests) for this page, or "*".'
const LNA_STEP = 'If your browser asks whether this site may access apps or devices on your local network, choose Allow.'

/** Every supported provider, local servers first. */
export const PROVIDERS: readonly ProviderDef[] = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    emoji: '🖥️',
    kind: 'local',
    api: 'openai',
    blurb: 'Free desktop app that runs open models on your own computer.',
    defaultBaseUrl: LMSTUDIO_DIRECT_URL,
    baseUrlPlaceholder: LMSTUDIO_DIRECT_URL,
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'Optional — only if you turned on "Require authentication"',
    suggestedModels: ['qwen/qwen3-8b', 'google/gemma-3-12b', 'meta-llama-3.1-8b-instruct'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: false,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: [
      'Install LM Studio from lmstudio.ai and download a chat model (7-14B is a good start).',
      'Open the Developer tab and load the model.',
      'Open Server Settings and turn on "Enable CORS".',
      'Click Start Server (or run `lms server start --cors` in a terminal).',
      LNA_STEP,
    ],
    docsUrl: 'https://lmstudio.ai/docs/developer',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    emoji: '🦙',
    kind: 'local',
    api: 'openai',
    blurb: 'Run open models locally from a small background app or the command line.',
    defaultBaseUrl: 'http://localhost:11434/v1',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'Not needed',
    suggestedModels: ['llama3.2', 'qwen3:8b', 'gemma3:12b', 'mistral'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: [
      'Install Ollama from ollama.com and pull a model, e.g. `ollama pull llama3.2`.',
      'Allow this site to call Ollama: start it with OLLAMA_ORIGINS set to "*" (or this site\'s address), e.g. `OLLAMA_ORIGINS="*" ollama serve`.',
      'Using the Windows/macOS app? Set the OLLAMA_ORIGINS environment variable to "*", then quit and restart Ollama.',
      LNA_STEP,
    ],
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/faq.md',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    emoji: '🦾',
    kind: 'local',
    api: 'openai',
    blurb: "llama.cpp's llama-server — lightweight and fast.",
    defaultBaseUrl: 'http://localhost:8080/v1',
    baseUrlPlaceholder: 'http://localhost:8080/v1',
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'Optional — only if you started it with --api-key',
    suggestedModels: [],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: [
      'Start the server with a chat model, e.g. `llama-server -m model.gguf --port 8080`.',
      'llama-server accepts browser (CORS) requests by default.',
      LNA_STEP,
    ],
    docsUrl: 'https://github.com/ggml-org/llama.cpp/tree/master/tools/server',
  },
  {
    id: 'koboldcpp',
    name: 'KoboldCpp',
    emoji: '🐉',
    kind: 'local',
    api: 'openai',
    blurb: 'One-file local runner with an OpenAI-compatible API.',
    defaultBaseUrl: 'http://localhost:5001/v1',
    baseUrlPlaceholder: 'http://localhost:5001/v1',
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'Optional — only if you set a password',
    suggestedModels: [],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Start KoboldCpp and load a chat model (its API listens on port 5001).', 'KoboldCpp accepts browser (CORS) requests by default.', LNA_STEP],
    docsUrl: 'https://github.com/LostRuins/koboldcpp/wiki',
  },
  {
    id: 'jan',
    name: 'Jan',
    emoji: '👋',
    kind: 'local',
    api: 'openai',
    blurb: 'Open-source desktop chat app with a built-in local API server.',
    defaultBaseUrl: 'http://localhost:1337/v1',
    baseUrlPlaceholder: 'http://localhost:1337/v1',
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'The API key set in Jan, if any',
    suggestedModels: [],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['In Jan, download and start a model.', 'Open Settings → Local API Server, turn on CORS, and start the server.', LNA_STEP],
    docsUrl: 'https://jan.ai/docs',
  },
  {
    id: 'customLocal',
    name: 'Other local server',
    emoji: '🔌',
    kind: 'local',
    api: 'openai',
    blurb: 'Any OpenAI-compatible server: vLLM, LocalAI, text-generation-webui, ...',
    defaultBaseUrl: 'http://localhost:8000/v1',
    baseUrlPlaceholder: 'http://localhost:8000/v1',
    needsKey: false,
    keyUrl: '',
    keyPlaceholder: 'Optional',
    suggestedModels: [],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Start your server with its OpenAI-compatible API (the URL usually ends in /v1).', CORS_STEP, LNA_STEP],
    docsUrl: '',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    emoji: '🤖',
    kind: 'cloud',
    api: 'openai',
    blurb: 'GPT models with your OpenAI API key.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    suggestedModels: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_completion_tokens',
    setupSteps: ['Create an API key at platform.openai.com/api-keys (needs prepaid credits).', 'Paste it here.'],
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    emoji: '✳️',
    kind: 'cloud',
    api: 'anthropic',
    blurb: "Anthropic's Claude models with your Claude API key.",
    defaultBaseUrl: 'https://api.anthropic.com',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'],
    defaultModel: 'claude-opus-5-5',
    structuredOutput: 'json_schema',
    jsonObject: false,
    sendsTemperature: false,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key in the Claude Console (console.anthropic.com → Settings → API keys).', 'Paste it here.'],
    docsUrl: 'https://docs.claude.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    emoji: '💎',
    kind: 'cloud',
    api: 'openai',
    blurb: "Google's Gemini models with an AI Studio API key (has a free tier).",
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-pro'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at aistudio.google.com/apikey.', 'Paste it here.'],
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    emoji: '🔀',
    kind: 'cloud',
    api: 'openai',
    blurb: 'One key for hundreds of models (including some free ones).',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    suggestedModels: ['openai/gpt-4.1-mini', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at openrouter.ai/keys.', 'Paste it here, then pick a model (ones ending in ":free" cost nothing).'],
    docsUrl: 'https://openrouter.ai/docs',
  },
  {
    id: 'groq',
    name: 'Groq',
    emoji: '⚡',
    kind: 'cloud',
    api: 'openai',
    blurb: 'Very fast open models (has a free tier).',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    suggestedModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at console.groq.com/keys.', 'Paste it here.'],
    docsUrl: 'https://console.groq.com/docs',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    emoji: '🌬️',
    kind: 'cloud',
    api: 'openai',
    blurb: "Mistral AI's models with your La Plateforme key.",
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    baseUrlPlaceholder: 'https://api.mistral.ai/v1',
    needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyPlaceholder: 'Your Mistral API key',
    suggestedModels: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'open-mistral-nemo'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at console.mistral.ai/api-keys.', 'Paste it here.'],
    docsUrl: 'https://docs.mistral.ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    emoji: '🐋',
    kind: 'cloud',
    api: 'openai',
    blurb: "DeepSeek's low-cost chat models.",
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-...',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: '',
    structuredOutput: 'json_object',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at platform.deepseek.com/api_keys.', 'Paste it here.'],
    docsUrl: 'https://api-docs.deepseek.com',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    emoji: '✖️',
    kind: 'cloud',
    api: 'openai',
    blurb: "xAI's Grok models.",
    defaultBaseUrl: 'https://api.x.ai/v1',
    baseUrlPlaceholder: 'https://api.x.ai/v1',
    needsKey: true,
    keyUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-...',
    suggestedModels: ['grok-3-mini', 'grok-4-fast-non-reasoning', 'grok-3', 'grok-4'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key at console.x.ai.', 'Paste it here.'],
    docsUrl: 'https://docs.x.ai',
  },
  {
    id: 'together',
    name: 'Together AI',
    emoji: '🤝',
    kind: 'cloud',
    api: 'openai',
    blurb: 'Open models (Llama, Qwen, DeepSeek...) hosted in the cloud.',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    baseUrlPlaceholder: 'https://api.together.xyz/v1',
    needsKey: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    keyPlaceholder: 'Your Together API key',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: ['Create an API key in your Together AI settings.', 'Paste it here.'],
    docsUrl: 'https://docs.together.ai',
  },
  {
    id: 'customCloud',
    name: 'Other cloud API',
    emoji: '☁️',
    kind: 'cloud',
    api: 'openai',
    blurb: 'Any OpenAI-compatible API: paste its base URL and your key.',
    defaultBaseUrl: '',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    needsKey: true,
    keyUrl: '',
    keyPlaceholder: 'Your API key',
    suggestedModels: [],
    defaultModel: '',
    structuredOutput: 'json_schema',
    jsonObject: true,
    sendsTemperature: true,
    maxTokensParam: 'max_tokens',
    setupSteps: [
      'Find the OpenAI-compatible base URL in your provider\'s docs (it usually ends in /v1).',
      'Paste the URL and your API key here.',
      'The provider must accept requests straight from a browser (CORS).',
    ],
    docsUrl: '',
  },
]

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((p) => p.id)
export const LOCAL_PROVIDERS: readonly ProviderDef[] = PROVIDERS.filter((p) => p.kind === 'local')
export const CLOUD_PROVIDERS: readonly ProviderDef[] = PROVIDERS.filter((p) => p.kind === 'cloud')

const BY_ID = new Map<string, ProviderDef>(PROVIDERS.map((p) => [p.id, p]))

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === 'string' && BY_ID.has(id)
}

/** The provider with this id (unknown ids fall back to LM Studio). */
export function getProvider(id: string | null | undefined): ProviderDef {
  return (id && BY_ID.get(id)) || BY_ID.get('lmstudio')!
}

/** The active provider for these settings (missing/unknown → LM Studio). */
export function providerFor(settings: { provider?: string | null }): ProviderDef {
  return getProvider(settings.provider)
}

/** Base URL a fresh config for this provider starts with (LM Studio uses the dev proxy under `npm run dev`). */
export function defaultBaseUrlFor(def: ProviderDef): string {
  if (def.id === 'lmstudio' && HAS_DEV_PROXY) return LMSTUDIO_PROXY_URL
  return def.defaultBaseUrl
}

function hostPort(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim())
  if (!m) return null
  let host = m[1].toLowerCase()
  host = host.replace(/^(?:127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?=:|$)/, 'localhost')
  return host
}

function portOf(hp: string): string | null {
  return /:(\d+)$/.exec(hp)?.[1] ?? null
}

/**
 * Best guess at which provider a base URL belongs to (for settings saved before providers
 * existed). Returns null when nothing matches.
 */
export function guessProviderFromUrl(url: string): ProviderId | null {
  const u = (url ?? '').trim()
  if (!u) return null
  if (u.startsWith('/lmstudio')) return 'lmstudio'
  const hp = hostPort(u)
  if (!hp) return null
  for (const p of PROVIDERS) {
    if (!p.defaultBaseUrl) continue
    if (hostPort(p.defaultBaseUrl) === hp) return p.id
  }
  // Same port as a known local server on another machine (e.g. LM Studio on a LAN PC).
  const port = portOf(hp)
  if (port) {
    for (const p of LOCAL_PROVIDERS) {
      const def = p.defaultBaseUrl ? hostPort(p.defaultBaseUrl) : null
      if (def && portOf(def) === port) return p.id
    }
  }
  return null
}

/** True for model ids that can't chat (embeddings, image/audio generation, moderation...). */
export function isChatModelId(id: string): boolean {
  return !/embed|rerank|whisper|tts|dall-e|imagen|image-gen|gpt-image|veo-|moderation|realtime|audio|transcribe|\baqa\b|guard|sora|-search|computer-use|davinci|babbage|codex/i.test(id)
}

/** Does model id `id` match wanted id `want`? Tolerates prefixes like "models/" (Gemini). */
export function sameModel(id: string, want: string): boolean {
  if (!id || !want) return false
  const a = id.toLowerCase()
  const b = want.toLowerCase()
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)
}

/**
 * Pick a model from the provider's list when the player left Model blank. Local servers:
 * the first chat model (usually the loaded one). Cloud: the default/suggested models in
 * preference order when present, else the first chat-capable one.
 */
export function pickModel(def: ProviderDef, ids: string[]): string {
  const chat = ids.filter(isChatModelId)
  if (chat.length === 0) return ''
  if (def.kind === 'local') return chat[0]
  for (const want of [def.defaultModel, ...def.suggestedModels]) {
    if (!want) continue
    const hit = chat.find((id) => sameModel(id, want))
    if (hit) return hit
  }
  return chat[0]
}

/** True when the page itself is served over https (the hosted site) or we can't tell. */
export function onHostedPage(): boolean {
  const loc = (globalThis as { location?: { protocol?: string } }).location
  return !loc?.protocol || loc.protocol === 'https:'
}
