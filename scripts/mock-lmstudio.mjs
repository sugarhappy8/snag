#!/usr/bin/env node
// A tiny fake LM Studio server for development and tests: it speaks the OpenAI-compatible
// /v1/models and /v1/chat/completions endpoints and answers structured-output requests
// with made-up data that matches the requested JSON schema. No model needed.
//
//   node scripts/mock-lmstudio.mjs [--port 1234] [--think] [--delay 300]
//
// --think wraps answers in <think>...</think> like a reasoning model.
import http from 'node:http'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const PORT = Number(opt('--port', 1234))
const DELAY = Number(opt('--delay', 200))
const THINK = flag('--think')

const WORDS = {
  title: ['A Strange Encounter', 'Family Drama', 'Unexpected Visitor', 'Big Decision', 'Lucky Break'],
  emoji: ['🎲', '🐶', '💼', '🎉', '😱'],
  label: ['Say yes', 'Walk away', 'Call your mom', 'Laugh it off', 'Fight back'],
  text: [
    'Your neighbor knocked on your door holding a suspiciously large casserole. What will you do?',
    'A stranger at the bus stop offered you a "once in a lifetime" business opportunity.',
    'You found a mysterious envelope under your pillow.',
  ],
  log: ['I learned to whistle.', 'I ate an entire pizza by myself.', 'I got lost in a corn maze.'],
  question: ['Why do you want to work here?', 'Where do you see yourself in five years?'],
  reply: ['Oh, hey! I was just thinking about you.', 'Hmm, that is an interesting thing to say.'],
}

let counter = 0
function word(key) {
  const k = Object.keys(WORDS).find((w) => key.toLowerCase().includes(w)) ?? 'text'
  const list = WORDS[k]
  counter += 1
  return list[counter % list.length]
}

function fake(schema, key = 'text') {
  if (!schema || typeof schema !== 'object') return null
  if (schema.enum) return schema.enum[0]
  if (schema.const !== undefined) return schema.const
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  if (schema.anyOf || schema.oneOf) return fake((schema.anyOf || schema.oneOf).find((s) => s.type !== 'null'), key)
  switch (type) {
    case 'object': {
      const out = {}
      for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = fake(v, k)
      return out
    }
    case 'array': {
      const n = Math.max(schema.minItems ?? 1, Math.min(schema.maxItems ?? 2, 2))
      return Array.from({ length: n }, () => fake(schema.items, key))
    }
    case 'string': {
      if (/log|line/i.test(key)) return word('log')
      if (/name/i.test(key)) return 'Alex'
      return word(key)
    }
    case 'integer':
    case 'number': {
      const lo = schema.minimum ?? -5
      const hi = schema.maximum ?? 5
      if (/score/i.test(key)) return 60
      if (/money/i.test(key)) return 100
      return Math.round((lo + hi) / 2) || 2
    }
    case 'boolean':
      return true
    default:
      return null
  }
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
    return send(res, 200, { object: 'list', data: [{ id: 'mock-model-7b', object: 'model', owned_by: 'mock' }] })
  }
  if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(raw)
      } catch {
        return send(res, 400, { error: 'invalid json' })
      }
      const schema = body.response_format?.json_schema?.schema
      const content = JSON.stringify(schema ? fake(schema) : { text: word('text') })
      const message = { role: 'assistant', content: THINK ? `<think>Let me think about this life...</think>\n${content}` : content }
      setTimeout(
        () =>
          send(res, 200, {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            model: body.model || 'mock-model-7b',
            choices: [{ index: 0, message, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        DELAY,
      )
    })
    return
  }
  send(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`Mock LM Studio listening on http://localhost:${PORT}/v1`))
