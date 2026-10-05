// Provider router: sends every AI request to the player's chosen provider — OpenAI-compatible
// servers/APIs (openai-compat.ts) or Claude through the official SDK (anthropic.ts) — and
// runs the shared "parse → validate → one corrective retry" JSON loop on the reply.
import type { Settings } from '../settings'
import { anthropicModel, completeAnthropic, listAnthropicModels, resetAnthropicSession } from './anthropic'
import { AiFormatError, AiProviderError, type ChatJsonRequest, type ChatMessage, type Completer } from './errors'
import { JsonParseError, parseJsonLoose, stripThinking } from './json'
import { completeOpenAi, forgetModel, listModels as listOpenAiModels, resetOpenAiSession, resolveModel } from './openai-compat'
import { correctionPrompt } from './prompts'
import { providerFor } from './providers'
import { SchemaError } from './schemas'

/** Forget auto-picked models and every learned fallback, for every provider (e.g. after settings change). */
export function resetAiSession(): void {
  resetOpenAiSession()
  resetAnthropicSession()
}

/** Chat model ids the active provider offers (GET /models, or the Claude Models API). */
export async function listModels(settings: Settings, signal?: AbortSignal): Promise<string[]> {
  return providerFor(settings).api === 'anthropic' ? listAnthropicModels(settings, signal) : listOpenAiModels(settings, signal)
}

/** The model that will be used: the configured one, or an automatic pick. */
export async function resolveModelFor(settings: Settings, signal?: AbortSignal): Promise<string> {
  return providerFor(settings).api === 'anthropic' ? anthropicModel(settings) : resolveModel(settings, signal)
}

async function jsonLoop<T>(settings: Settings, req: ChatJsonRequest<T>, complete: Completer): Promise<T> {
  const temperature = req.temperature ?? settings.temperature
  let messages: ChatMessage[] = req.messages
  let problem = ''
  let raw = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const done = await complete(req.system, messages, attempt === 0 ? temperature : Math.min(temperature, 0.6))
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
      messages = [...req.messages, { role: 'assistant', content: echoed }, { role: 'user', content: correctionPrompt(problem) }]
    }
  }
  throw new AiFormatError(`The model's reply wasn't usable (${problem}).`, raw)
}

/**
 * Ask the active provider for a JSON object matching `schema`, parse it robustly, validate
 * it, and retry once with a corrective message if the reply was unusable. Throws
 * AiProviderError (alias LmStudioError) for connection/server/account problems,
 * AiFormatError for unusable output (including a refusal), and the AbortError if the
 * signal fires.
 */
export async function chatJson<T>(settings: Settings, req: ChatJsonRequest<T>, signal?: AbortSignal): Promise<T> {
  const def = providerFor(settings)
  if (def.api === 'anthropic') {
    const model = anthropicModel(settings)
    return jsonLoop(settings, req, (system, messages) => completeAnthropic(settings, model, req, system, messages, signal))
  }
  const auto = !settings.model.trim()
  const run = (model: string) =>
    jsonLoop(settings, req, (system, messages, temperature) => completeOpenAi(settings, model, req, system, messages, temperature, signal))
  const model = await resolveModel(settings, signal)
  try {
    return await run(model)
  } catch (err) {
    // The auto-picked model was unloaded or swapped since we cached it: look again once.
    if (auto && err instanceof AiProviderError && (err.kind === 'badModel' || err.kind === 'noModel')) {
      forgetModel(settings)
      const fresh = await resolveModel(settings, signal)
      if (fresh !== model) return await run(fresh)
    }
    throw err
  }
}
