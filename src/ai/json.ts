// Robust JSON extraction for local-model output.
//
// Small local models wrap JSON in prose or code fences, think out loud in <think> tags,
// use single quotes, leave trailing commas, forget to escape quotes inside strings and
// get cut off by max_tokens. parseJsonLoose() copes with all of that: it strips the
// reasoning, tries strict parsing, then balanced-substring parsing, then a tolerant
// re-serializer (repairJson) that closes whatever was left open.

export class JsonParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonParseError'
  }
}

const THINK_TAG = '(?:think|thinking|reasoning|thought)'

/**
 * Remove reasoning from a model reply: complete <think>…</think> blocks, everything up
 * to a dangling </think> (chat templates that open the tag in the prompt), an unclosed
 * <think> (the model ran out of tokens while thinking), gpt-oss channel markup and
 * leftover special tokens.
 */
export function stripThinking(text: string): string {
  let t = typeof text === 'string' ? text : ''
  const finalMarker = '<|channel|>final<|message|>'
  const finalAt = t.lastIndexOf(finalMarker)
  if (finalAt >= 0) t = t.slice(finalAt + finalMarker.length)
  t = t.replace(/<\|[a-z_]+\|>/gi, ' ')
  t = t.replace(new RegExp(`<(${THINK_TAG})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'), '')
  const closers = [...t.matchAll(new RegExp(`<\\/${THINK_TAG}>`, 'gi'))]
  if (closers.length > 0) {
    const last = closers[closers.length - 1]
    t = t.slice((last.index ?? 0) + last[0].length)
  }
  const open = t.search(new RegExp(`<${THINK_TAG}\\b[^>]*>`, 'i'))
  if (open >= 0) t = t.slice(0, open)
  return t.trim()
}

/** Index of the most plausible start of a JSON object (or array) in free text, or -1. */
export function findJsonStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let j = i + 1
    while (j < text.length && /\s/.test(text[j])) j++
    const next = text[j]
    if (next === undefined || next === '"' || next === "'" || next === '}' || next === '“') return i
  }
  const brace = text.indexOf('{')
  if (brace >= 0) return brace
  return text.indexOf('[')
}

/**
 * The balanced {...} or [...] substring starting at `start` (string-aware), or null
 * if the brackets never balance (truncated output).
 */
export function balancedFrom(text: string, start: number): string | null {
  const stack: string[] = []
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null
      if (stack.length === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** First balanced JSON object/array in the text, if any. */
export function extractJsonText(text: string): string | null {
  const start = findJsonStart(text)
  if (start < 0) return null
  return balancedFrom(text, start)
}

// ---------------------------------------------------------------------------
// Tolerant re-serializer

type Ctx = { type: 'obj' | 'arr'; expect: 'key' | 'colon' | 'value' | 'comma' }

const WS = /\s/
const LITERALS: Record<string, string> = {
  true: 'true',
  false: 'false',
  null: 'null',
  none: 'null',
  nil: 'null',
  undefined: 'null',
  nan: 'null',
  infinity: 'null',
  '-infinity': 'null',
  yes: 'true',
  no: 'false',
}

function nextNonWs(s: string, from: number): number {
  let k = from
  while (k < s.length && WS.test(s[k])) k++
  return k
}

/**
 * Re-serialize sloppy JSON into strict JSON. Handles code fences / prose around the
 * object, single or curly quotes, unquoted keys, unescaped quotes and newlines inside
 * strings, comments, trailing / missing / doubled commas, Python literals, "$1,500"
 * style numbers and truncation (open strings, keys without values, unclosed brackets).
 * Throws JsonParseError when the text contains no JSON-looking object at all.
 */
export function repairJson(input: string): string {
  const start = findJsonStart(input)
  if (start < 0) throw new JsonParseError('No JSON object found in the reply')
  const s = input.slice(start)
  const n = s.length
  const out: string[] = []
  const stack: Ctx[] = []
  let started = false
  let i = 0

  const top = (): Ctx | undefined => stack[stack.length - 1]

  /** Insert separators the model forgot; returns true if the next token is an object key. */
  const prepareToken = (): boolean => {
    const c = top()
    if (!c) return false
    if (c.expect === 'comma') {
      out.push(',')
      c.expect = c.type === 'obj' ? 'key' : 'value'
    }
    if (c.type === 'obj') {
      if (c.expect === 'key') return true
      if (c.expect === 'colon') {
        out.push(':')
        c.expect = 'value'
      }
    }
    return false
  }

  const afterToken = (wasKey: boolean): void => {
    const c = top()
    if (!c) return
    c.expect = wasKey ? 'colon' : 'comma'
  }

  const finishCtx = (c: Ctx): void => {
    if (c.type === 'obj' && c.expect === 'colon') out.push(':null')
    else if (c.type === 'obj' && c.expect === 'value') out.push('null')
    out.push(c.type === 'obj' ? '}' : ']')
  }

  /** Is the quote at s[j] the real end of the string (judged by what follows)? */
  const isRealClose = (j: number): boolean => {
    const k = nextNonWs(s, j + 1)
    if (k >= n) return true
    const c = s[k]
    if (c === '}' || c === ']' || c === ':') return true
    if (c !== ',') return false
    const m = nextNonWs(s, k + 1)
    if (m >= n) return true
    const d = s[m]
    if ('"\'{[]}“'.includes(d) || /[-0-9]/.test(d)) return true
    const word = /^[A-Za-z_$][\w$-]*/.exec(s.slice(m, m + 40))
    if (!word) return false
    if (Object.hasOwn(LITERALS, word[0].toLowerCase())) return true
    const after = nextNonWs(s, m + word[0].length)
    return s[after] === ':'
  }

  const readString = (quote: string): void => {
    const closers = quote === '“' ? ['”', '"'] : quote === '‘' ? ['’', "'"] : [quote]
    let j = i + 1
    let buf = ''
    while (j < n) {
      const c = s[j]
      if (c === '\\') {
        const nx = s[j + 1]
        if (nx === undefined) {
          j++
          break
        }
        if ('"\\/bfnrt'.includes(nx)) {
          buf += `\\${nx}`
          j += 2
        } else if (nx === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(j + 2, j + 6))) {
          buf += `\\u${s.slice(j + 2, j + 6)}`
          j += 6
        } else if (nx === '\n') {
          buf += '\\n'
          j += 2
        } else {
          // \' and other invalid escapes: keep the character, drop the backslash
          buf += nx === '"' ? '\\"' : nx
          j += 2
        }
        continue
      }
      if (closers.includes(c) && isRealClose(j)) {
        j++
        i = j
        out.push(`"${buf}"`)
        return
      }
      if (c === '"') buf += '\\"'
      else if (c === '\n') buf += '\\n'
      else if (c === '\t') buf += '\\t'
      else if (c === '\r' || c < ' ') {
        // drop other control characters
      } else buf += c
      j++
    }
    // Truncated inside a string: close it.
    i = n
    out.push(`"${buf}"`)
  }

  const readNumber = (): void => {
    let j = i
    let tok = ''
    while (j < n && /[-+0-9.eE$]/.test(s[j])) {
      if (s[j] !== '$') tok += s[j]
      j++
    }
    // "$1,500,000" as an object value: join thousands groups.
    if (top()?.type === 'obj') {
      while (s[j] === ',' && /^\d{3}(?!\d)/.test(s.slice(j + 1, j + 5))) {
        tok += s.slice(j + 1, j + 4)
        j += 4
      }
    }
    i = j
    let t = tok.replace(/^\+/, '')
    t = t.replace(/^(-?)\./, '$10.')
    t = t.replace(/[.eE+-]+$/, '')
    if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) {
      const num = Number(t)
      t = Number.isFinite(num) ? String(num) : '0'
    }
    t = t.replace(/^(-?)0+(\d)/, '$1$2')
    out.push(t)
  }

  /** Unquoted text: literals, unquoted keys, or bare words/emoji used as a value. */
  const readBare = (isKey: boolean): void => {
    let j = i
    const stops = isKey ? ':,{}[]\n"' : ',{}[]\n"'
    while (j < n && !stops.includes(s[j])) j++
    const raw = s.slice(i, j).trim()
    i = j
    const lower = raw.toLowerCase()
    if (!isKey) {
      if (Object.hasOwn(LITERALS, lower)) {
        out.push(LITERALS[lower])
        return
      }
      if (j >= n) {
        // Truncated literal such as "tru" or "nul".
        for (const lit of ['true', 'false', 'null']) {
          if (lower.length > 0 && lit.startsWith(lower)) {
            out.push(lit)
            return
          }
        }
      }
    }
    out.push(JSON.stringify(raw))
  }

  while (i < n) {
    if (started && stack.length === 0) break
    const ch = s[i]
    if (WS.test(ch) || ch === ',' || ch === ':') {
      i++
      continue
    }
    if (ch === '/' && s[i + 1] === '/') {
      while (i < n && s[i] !== '\n') i++
      continue
    }
    if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    if (ch === '`' && s.startsWith('```', i)) {
      // A code fence inside the object means the model gave up mid-way; stop here.
      break
    }
    if (ch === '{' || ch === '[') {
      if (prepareToken()) out.push('"_":')
      const c = top()
      if (c && c.type === 'obj' && c.expect === 'key') c.expect = 'value'
      out.push(ch)
      stack.push({ type: ch === '{' ? 'obj' : 'arr', expect: ch === '{' ? 'key' : 'value' })
      started = true
      i++
      continue
    }
    if (ch === '}' || ch === ']') {
      const kind = ch === '}' ? 'obj' : 'arr'
      let idx = -1
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].type === kind) {
          idx = k
          break
        }
      }
      i++
      if (idx < 0) continue
      while (stack.length > idx) finishCtx(stack.pop() as Ctx)
      afterToken(false)
      continue
    }
    if (!started) {
      i++
      continue
    }
    const isKey = prepareToken()
    if (ch === '"' || ch === "'" || ch === '“' || ch === '‘') {
      readString(ch)
    } else if (!isKey && (/[0-9]/.test(ch) || ((ch === '-' || ch === '+' || ch === '.' || ch === '$') && /[0-9$.]/.test(s[i + 1] ?? '')))) {
      readNumber()
    } else {
      readBare(isKey)
    }
    afterToken(isKey)
  }

  while (stack.length > 0) finishCtx(stack.pop() as Ctx)
  return out.join('')
}

function isObjectLike(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

/**
 * Parse a model reply into a JSON value (object or array), as forgivingly as possible.
 * Throws JsonParseError if nothing usable can be recovered.
 */
export function parseJsonLoose(text: string, depth = 0): unknown {
  const cleaned = stripThinking(text)
  if (!cleaned) throw new JsonParseError('The reply was empty')

  try {
    const direct: unknown = JSON.parse(cleaned)
    if (isObjectLike(direct)) return direct
    if (typeof direct === 'string' && depth < 2) return parseJsonLoose(direct, depth + 1)
  } catch {
    // not strict JSON; keep trying
  }

  let from = 0
  for (let tries = 0; tries < 8; tries++) {
    const idx = cleaned.indexOf('{', from)
    if (idx < 0) break
    const sub = balancedFrom(cleaned, idx)
    if (sub) {
      try {
        const v: unknown = JSON.parse(sub)
        if (isObjectLike(v)) return v
      } catch {
        // try the next candidate
      }
    }
    from = idx + 1
  }

  try {
    const v: unknown = JSON.parse(repairJson(cleaned))
    if (isObjectLike(v)) return v
  } catch (err) {
    if (err instanceof JsonParseError) throw err
  }
  throw new JsonParseError('The reply was not valid JSON')
}
