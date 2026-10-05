// Compatibility module: the LM Studio client grew into a multi-provider client.
//
//   providers.ts      registry of local servers and cloud APIs
//   openai-compat.ts  OpenAI-compatible client (LM Studio, Ollama, llama.cpp, OpenAI, Groq...)
//   anthropic.ts      Claude through the official @anthropic-ai/sdk (lazy-loaded chunk)
//   client.ts         router + shared JSON loop (chatJson, listModels)
//   errors.ts         AiProviderError (alias LmStudioError), AiFormatError, shared types
//
// Existing imports from './lmstudio' keep working through these re-exports.
export { AiFormatError, AiProviderError, LmStudioError } from './errors'
export type { AiProviderErrorKind, ChatJsonRequest, ChatMessage, LmStudioErrorKind } from './errors'
export { findLoadedModel, normalizeBaseUrl, resolveModel, structuredOutputDisabled, withThinkingHint } from './openai-compat'
export { chatJson, listModels, resetAiSession, resetAiSession as resetLmStudioSession } from './client'
