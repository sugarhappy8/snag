// lexer.mjs - a hand-written TypeScript / TSX lexer that finds every string literal.
//
// TypeScript 7 ships no JavaScript compiler API, so this is not a wrapper around the real parser. It was
// checked against the real TypeScript parser on all 486 files of the snag repo (v2.4.0): 196,886 of 196,904
// string-like tokens identical (text and position); the 18 "missing" are whitespace-only JSX text and 4
// type-level template types. Ported unchanged from the validated prototype (the only additions are the
// exports); scripts/voice-report.mjs, the A7 counter, and the rewrite tools read the same token stream.
//
// ---------------------------------------------------------------------------------------------
// PART 1  Lexer
// ---------------------------------------------------------------------------------------------
// A hand-written lexer for TypeScript / TSX that extracts string literals. It is NOT a parser; it
// only needs to know enough to never mistake code for a string (or the other way round):
//   * // and /* */ comments are skipped.
//   * '...' and "..." literals (escapes are decoded into `v`; `raw` keeps the source text).
//   * `...` template literals. Static text parts are kept; each ${ ... } is lexed as ordinary
//     code (so nested strings/templates inside it are extracted as literals of their own).
//   * Regex literals vs. division: decided from the previous significant token ("can an expression
//     start here?"), and a regex candidate must close on the same line, otherwise it is treated as
//     a division sign. So /it's/ never opens a string.
//   * JSX (TSX files only): elements, attributes (`title="x"` is a string literal with an attribute
//     name), expression containers and JSX text (apostrophes in JSX text do not open strings). If an
//     element does not parse cleanly the lexer rolls back and treats '<' as an operator.
// The token stream is also what `classify()` (PART 2) uses to decide the context of each string.

// Token kinds (the `k` of a token). Exported so that contexts.mjs, corpus.mjs and the rewrite tools can
// tell tokens apart.
export const K_ID = 0, K_NUM = 1, K_PUNCT = 2, K_STR = 3, K_TMPL = 4, K_REGEX = 5, K_JSXTEXT = 6;

// Identifiers after which an expression (not an operator) is expected: a `/` starts a regex and a
// `<` starts a JSX element.
export const EXPR_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do',
  'else', 'yield', 'await', 'extends',
]);

const PUNCT4 = new Set(['>>>=']);
const PUNCT3 = new Set(['===', '!==', '**=', '<<=', '>>=', '>>>', '...', '&&=', '||=', '??=']);
const PUNCT2 = new Set([
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
]);

const isIdStart = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || c > 127;
const isIdPart = (c) => isIdStart(c) || (c >= 48 && c <= 57);
const isDigit = (c) => c >= 48 && c <= 57;

/** Decode JS escape sequences (\n \' \" \\ \xHH \uHHHH \u{H+} line continuations...). */
export function cook(raw) {
  if (raw.indexOf('\\') < 0) return raw;
  return raw.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
    (m, u1, u2, x2, ch) => {
      if (u1 !== undefined) return String.fromCodePoint(parseInt(u1, 16));
      if (u2 !== undefined) return String.fromCharCode(parseInt(u2, 16));
      if (x2 !== undefined) return String.fromCharCode(parseInt(x2, 16));
      switch (ch) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case 'b': return '\b';
        case 'f': return '\f';
        case 'v': return '\v';
        case '0': return '\0';
        case '\n': case '\r\n': case '\r': case '\u2028': case '\u2029': return ''; // line continuation
        default: return ch; // \' \" \\ \` \$ \{ and any other escaped char
      }
    },
  );
}

const JSX_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', middot: '\u00b7', times: '\u00d7', bull: '\u2022', rarr: '\u2192', larr: '\u2190', copy: '\u00a9' };

/** Collapse JSX text the way React/TS do (trim each line, drop blank lines, join with a space). */
function jsxCollapse(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let li = 0; li < lines.length; li++) {
    let l = lines[li].replace(/\t/g, ' ');
    if (li > 0) l = l.replace(/^ +/, '');
    if (li < lines.length - 1) l = l.replace(/ +$/, '');
    if (l) out.push(l);
  }
  return out
    .join(' ')
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return Object.prototype.hasOwnProperty.call(JSX_ENTITIES, e) ? JSX_ENTITIES[e] : m;
    });
}

/**
 * Tokenise one TS/TSX source text.
 * Returns { toks, errors }. Token fields: k (kind), v (identifier/punct text, string value, template
 * text with `${...}` placeholders, regex source), p/e (start/end offsets), nl (newline before token).
 * Strings additionally carry raw, q (quote char) and attr (JSX attribute name or null); templates
 * carry raw, parts (cooked static parts), partAt (offset of each part) and nExpr (number of ${} holes).
 * Template tokens come BEFORE the tokens of their ${} expressions, so toks is sorted by start offset.
 * `p` is the offset of the opening delimiter and `e` the offset just after the closing one, so
 * src.slice(p, e) is the literal as written (for JSX text, the text run); the rewrite tool splices
 * with exactly these two. After classify() (contexts.mjs) strings and templates also carry `ctx`.
 */
export function lex(src, tsx) {
  const n = src.length;
  const toks = [];
  const errors = [];
  let i = 0;
  let nl = false;
  let prevK = -1;
  let prevV = '';
  let td = 0; // depth of enclosing template ${ } expressions (used to find structural neighbours)

  const push = (t) => {
    t.td = td;
    t.nl = nl;
    nl = false;
    toks.push(t);
    prevK = t.k;
    prevV = t.k === K_ID || t.k === K_PUNCT ? t.v : '';
    return t;
  };

  /** Can an expression start right after the previous token? (regex vs. divide, JSX vs. less-than) */
  const exprAllowed = (forRegex) => {
    if (prevK === -1) return true;
    if (prevK === K_ID) return EXPR_KEYWORDS.has(prevV);
    if (prevK === K_PUNCT) {
      if (prevV === ')' || prevV === ']') return false;
      if (prevV === '}') return false;
      if (forRegex && (prevV === '++' || prevV === '--')) return false;
      return true;
    }
    return false; // number, string, template, regex, jsx text
  };

  function scanString(q) {
    const start = i;
    i++;
    let esc = false;
    for (;;) {
      if (i >= n) { errors.push(`unterminated string at ${start}`); break; }
      const c = src.charCodeAt(i);
      if (c === q) break;
      if (c === 92) {
        esc = true;
        i += src.charCodeAt(i + 1) === 13 && src.charCodeAt(i + 2) === 10 ? 3 : 2;
        continue;
      }
      if (c === 10 || c === 13) { errors.push(`unterminated string at ${start}`); break; }
      i++;
    }
    const raw = src.slice(start + 1, Math.min(i, n));
    if (i < n && src.charCodeAt(i) === q) i++;
    push({ k: K_STR, v: esc ? cook(raw) : raw, raw, q, attr: null, p: start, e: i });
  }

  function scanTemplate() {
    const start = i;
    i++;
    const tok = { k: K_TMPL, v: '', raw: '', parts: [], partAt: [], nExpr: 0, p: start, e: 0, nl, td };
    nl = false;
    toks.push(tok); // reserve the slot: the template starts before its inner tokens
    let seg = i;
    for (;;) {
      if (i >= n) { errors.push(`unterminated template at ${start}`); break; }
      const c = src.charCodeAt(i);
      if (c === 96) break;
      if (c === 92) { i += 2; continue; }
      if (c === 36 && src.charCodeAt(i + 1) === 123) {
        tok.parts.push(cook(src.slice(seg, i)));
        tok.partAt.push(seg);
        tok.nExpr++;
        i += 2;
        prevK = K_PUNCT; prevV = '${';
        td++;
        scanCode(true); // consumes the matching '}'
        td--;
        seg = i;
        continue;
      }
      i++;
    }
    const endInner = Math.min(i, n);
    tok.parts.push(cook(src.slice(seg, endInner)));
    tok.partAt.push(seg);
    tok.raw = src.slice(start + 1, endInner);
    if (i < n) i++;
    tok.e = i;
    tok.v = tok.parts.join('${...}');
    prevK = K_TMPL; prevV = '';
    nl = false;
  }

  function scanRegex() {
    let j = i + 1;
    let inClass = false;
    for (;;) {
      if (j >= n) return false;
      const c = src.charCodeAt(j);
      if (c === 10 || c === 13) return false;
      if (c === 92) { j += 2; continue; }
      if (c === 91) inClass = true;
      else if (c === 93) inClass = false;
      else if (c === 47 && !inClass) break;
      j++;
    }
    j++;
    while (j < n && isIdPart(src.charCodeAt(j))) j++;
    push({ k: K_REGEX, v: src.slice(i, j), p: i, e: j });
    i = j;
    return true;
  }

  function scanNumber() {
    const start = i;
    i++;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (isIdPart(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) i++;
      else break;
    }
    push({ k: K_NUM, v: src.slice(start, i), p: start, e: i });
  }

  function scanPunct() {
    const start = i;
    let len = 1;
    const s4 = src.slice(i, i + 4);
    if (PUNCT4.has(s4)) len = 4;
    else if (PUNCT3.has(s4.slice(0, 3))) len = 3;
    else if (PUNCT2.has(s4.slice(0, 2))) {
      len = 2;
      if (s4.slice(0, 2) === '?.' && isDigit(s4.charCodeAt(2))) len = 1; // a ?.5 : b
    }
    i += len;
    push({ k: K_PUNCT, v: src.slice(start, i), p: start, e: i });
  }

  // ---- JSX ------------------------------------------------------------------------------------
  function skipJsxWs() {
    for (;;) {
      const c = src.charCodeAt(i);
      if (c === 10 || c === 13) { nl = true; i++; }
      else if (c === 32 || c === 9 || c === 11 || c === 12 || c === 0xa0) i++;
      else if (c === 47 && src.charCodeAt(i + 1) === 42) {
        const j = src.indexOf('*/', i + 2);
        i = j < 0 ? n : j + 2;
      } else if (c === 47 && src.charCodeAt(i + 1) === 47) {
        while (i < n && src.charCodeAt(i) !== 10) i++;
      } else break;
    }
  }

  function readJsxName() {
    const start = i;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (isIdPart(c) || c === 45 || c === 46 || c === 58) i++; // - . :
      else break;
    }
    return src.slice(start, i);
  }

  /** At '<' of an opening tag. Consumes the whole element including its closing tag. */
  function scanJsxElement() {
    i++; // '<'
    prevK = K_PUNCT; prevV = '<';
    if (src.charCodeAt(i) === 62) { // fragment <>
      i++;
      scanJsxChildren();
      return;
    }
    const tag = readJsxName();
    // optional generic args on the tag: <Foo<string> ...> (skipped)
    if (src.charCodeAt(i) === 60) {
      let depth = 0;
      while (i < n) {
        const c = src.charCodeAt(i);
        if (c === 60) depth++;
        else if (c === 62) { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
    }
    for (;;) {
      skipJsxWs();
      if (i >= n) { errors.push('unterminated jsx tag ' + tag); return; }
      const c = src.charCodeAt(i);
      if (c === 47 && src.charCodeAt(i + 1) === 62) { i += 2; return; } // self-closing
      if (c === 62) { i++; break; }
      if (c === 123) { // {...spread}
        i++;
        prevK = K_PUNCT; prevV = '{';
        scanCode(true);
        continue;
      }
      if (isIdStart(c)) {
        const name = readJsxName();
        skipJsxWs();
        if (src.charCodeAt(i) === 61) { // '='
          i++;
          skipJsxWs();
          const v = src.charCodeAt(i);
          if (v === 34 || v === 39) {
            const start = i;
            const j = src.indexOf(String.fromCharCode(v), i + 1);
            const end = j < 0 ? n : j;
            const raw = src.slice(start + 1, end);
            i = j < 0 ? n : j + 1;
            push({ k: K_STR, v: raw, raw, q: v, attr: name, p: start, e: i });
          } else if (v === 123) {
            i++;
            prevK = K_PUNCT; prevV = '{';
            scanCode(true);
          } else if (v === 60) {
            scanJsxElement();
          }
        }
        continue;
      }
      errors.push(`unexpected char in jsx tag <${tag}> at ${i}`);
      i++;
    }
    scanJsxChildren();
  }

  /** After the '>' of an opening tag: children until the matching closing tag. */
  function scanJsxChildren() {
    for (;;) {
      const start = i;
      while (i < n) {
        const c = src.charCodeAt(i);
        if (c === 60 || c === 123) break;
        i++;
      }
      if (i > start) {
        const raw = src.slice(start, i);
        if (/\S/.test(raw)) push({ k: K_JSXTEXT, v: jsxCollapse(raw), raw, p: start, e: i });
      }
      if (i >= n) { errors.push('unterminated jsx element'); return; }
      if (src.charCodeAt(i) === 123) {
        i++;
        prevK = K_PUNCT; prevV = '{';
        scanCode(true);
        continue;
      }
      // '<'
      if (src.charCodeAt(i + 1) === 47) { // closing tag
        const j = src.indexOf('>', i);
        i = j < 0 ? n : j + 1;
        prevK = K_JSXTEXT; prevV = '';
        return;
      }
      scanJsxElement();
    }
  }

  const JSX_START = /^<\s*[A-Za-z_$][\w$]*\s*(,|extends\b)/; // <T,>(x) => ... generic arrow, not JSX

  function scanCode(endOnBrace) {
    let depth = 0;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (c === 32 || c === 9) { i++; continue; }
      if (c === 10 || c === 13 || c === 0x2028 || c === 0x2029) { nl = true; i++; continue; }
      if (c === 11 || c === 12 || c === 0xa0 || c === 0xfeff) { i++; continue; }
      if (c === 47) { // '/'
        const d = src.charCodeAt(i + 1);
        if (d === 47) { // line comment
          i += 2;
          while (i < n) {
            const x = src.charCodeAt(i);
            if (x === 10 || x === 13 || x === 0x2028 || x === 0x2029) break;
            i++;
          }
          continue;
        }
        if (d === 42) { // block comment
          const j = src.indexOf('*/', i + 2);
          const end = j < 0 ? n : j + 2;
          if (j < 0) errors.push(`unterminated comment at ${i}`);
          const nlAt = src.indexOf('\n', i);
          if (nlAt >= 0 && nlAt < end) nl = true;
          i = end;
          continue;
        }
        if (exprAllowed(true) && scanRegex()) continue;
        scanPunct();
        continue;
      }
      if (c === 39 || c === 34) { scanString(c); continue; }
      if (c === 96) { scanTemplate(); continue; }
      if (isIdStart(c)) {
        const start = i;
        i++;
        while (i < n && isIdPart(src.charCodeAt(i))) i++;
        push({ k: K_ID, v: src.slice(start, i), p: start, e: i });
        continue;
      }
      if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) { scanNumber(); continue; }
      if (c === 123) { depth++; scanPunct(); continue; }
      if (c === 125) {
        if (depth === 0 && endOnBrace) { i++; return; }
        if (depth > 0) depth--;
        scanPunct();
        continue;
      }
      if (c === 60 && tsx && exprAllowed(false)) {
        const d = src.charCodeAt(i + 1);
        if ((isIdStart(d) || d === 62) && !JSX_START.test(src.slice(i, i + 80))) {
          // Try JSX; if the element does not parse cleanly (e.g. `type F = <T>(x: T) => T` in a
          // .tsx file) roll back and treat '<' as an ordinary operator.
          const save = { i, nTok: toks.length, nErr: errors.length, nl, prevK, prevV, td };
          scanJsxElement();
          if (errors.length === save.nErr) {
            prevK = K_JSXTEXT; prevV = ''; // an element is an operand
            continue;
          }
          i = save.i; toks.length = save.nTok; errors.length = save.nErr;
          nl = save.nl; prevK = save.prevK; prevV = save.prevV; td = save.td;
        }
      }
      if (c === 35 || c === 64) { i++; continue; } // '#priv' / '@decorator': the name follows as an identifier
      scanPunct();
    }
    if (endOnBrace) errors.push('unterminated ${ } or { } expression');
  }

  scanCode(false);
  return { toks, errors };
}
